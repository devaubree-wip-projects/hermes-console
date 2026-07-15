package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

type sessionSnapshot struct {
	ID      string
	Version string
}

type sessionInvalidation struct {
	SessionID string
	Cursor    uint64
	Reason    string
}

type sessionListener func(sessionInvalidation)

type profileObserver struct {
	profile     string
	subscribers map[string]map[uint64]sessionListener
	snapshots   map[string]string
	initialized bool
	cursor      uint64
	cancel      context.CancelFunc
}

type SessionHub struct {
	mu         sync.Mutex
	profiles   map[string]*profileObserver
	nextID     uint64
	hermesHome string
	debounce   time.Duration
	reconcile  time.Duration
	load       func(context.Context, string) ([]sessionSnapshot, error)
	logger     *slog.Logger
}

func NewSessionHub(config Config, client *http.Client, logger *slog.Logger) *SessionHub {
	hub := &SessionHub{
		profiles:   make(map[string]*profileObserver),
		hermesHome: config.HermesHome,
		debounce:   config.SessionDebounce,
		reconcile:  config.SessionReconcile,
		logger:     logger,
	}
	hub.load = func(ctx context.Context, profile string) ([]sessionSnapshot, error) {
		target := *config.RuntimeHTTPURL
		target.Path = "/api/sessions"
		query := url.Values{"profile": {profile}, "limit": {"1000"}, "order": {"recent"}, "archived": {"include"}}
		target.RawQuery = query.Encode()
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
		if err != nil {
			return nil, err
		}
		addRuntimeAuth(request.Header, config.RuntimeToken)
		response, err := client.Do(request)
		if err != nil {
			return nil, err
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("Hermes sessions API %d", response.StatusCode)
		}
		var payload struct {
			Sessions []map[string]any `json:"sessions"`
		}
		if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
			return nil, err
		}
		rows := make([]sessionSnapshot, 0, len(payload.Sessions))
		for _, row := range payload.Sessions {
			id, _ := row["id"].(string)
			if id == "" {
				id, _ = row["session_id"].(string)
			}
			if id == "" {
				continue
			}
			version, _ := json.Marshal([]any{row["last_active"], row["started_at"], row["message_count"], row["ended_at"], row["archived"]})
			rows = append(rows, sessionSnapshot{ID: id, Version: string(version)})
		}
		return rows, nil
	}
	return hub
}

func (hub *SessionHub) Subscribe(profile, sessionID string, listener sessionListener) (func(), error) {
	if !validProfile(profile) || sessionID == "" || len(sessionID) > 256 {
		return nil, fmt.Errorf("invalid session subscription")
	}
	hub.mu.Lock()
	observer := hub.profiles[profile]
	if observer == nil {
		ctx, cancel := context.WithCancel(context.Background())
		observer = &profileObserver{profile: profile, subscribers: make(map[string]map[uint64]sessionListener), snapshots: make(map[string]string), cancel: cancel}
		hub.profiles[profile] = observer
		go hub.observe(ctx, observer)
	}
	hub.nextID++
	id := hub.nextID
	listeners := observer.subscribers[sessionID]
	if listeners == nil {
		listeners = make(map[uint64]sessionListener)
		observer.subscribers[sessionID] = listeners
	}
	listeners[id] = listener
	initialized := observer.initialized
	if initialized {
		observer.cursor++
		cursor := observer.cursor
		go listener(sessionInvalidation{SessionID: sessionID, Cursor: cursor, Reason: "subscribed"})
	}
	hub.mu.Unlock()

	var once sync.Once
	return func() {
		once.Do(func() {
			hub.mu.Lock()
			defer hub.mu.Unlock()
			current := hub.profiles[profile]
			if current != observer {
				return
			}
			delete(current.subscribers[sessionID], id)
			if len(current.subscribers[sessionID]) == 0 {
				delete(current.subscribers, sessionID)
			}
			if len(current.subscribers) == 0 {
				delete(hub.profiles, profile)
				current.cancel()
			}
		})
	}, nil
}

func (hub *SessionHub) Close() {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	for profile, observer := range hub.profiles {
		delete(hub.profiles, profile)
		observer.cancel()
	}
}

func (hub *SessionHub) observe(ctx context.Context, observer *profileObserver) {
	directory := hub.hermesHome
	if observer.profile != "default" {
		directory = filepath.Join(directory, "profiles", observer.profile)
	}
	watcher, err := fsnotify.NewWatcher()
	if err == nil {
		err = watcher.Add(directory)
	}
	if err != nil {
		if watcher != nil {
			_ = watcher.Close()
		}
		hub.logger.Warn("session filesystem watcher unavailable", "profile", observer.profile, "error", err)
		watcher = nil
	}
	if watcher != nil {
		defer watcher.Close()
	}

	hub.refresh(ctx, observer, "subscribed")
	var debounce <-chan time.Time
	var timer *time.Timer
	var reconcile <-chan time.Time
	var ticker *time.Ticker
	if hub.reconcile > 0 {
		ticker = time.NewTicker(hub.reconcile)
		reconcile = ticker.C
		defer ticker.Stop()
	}
	for {
		var events <-chan fsnotify.Event
		var errorsChannel <-chan error
		if watcher != nil {
			events, errorsChannel = watcher.Events, watcher.Errors
		}
		select {
		case <-ctx.Done():
			if timer != nil {
				timer.Stop()
			}
			return
		case event := <-events:
			base := filepath.Base(event.Name)
			if base != "state.db" && base != "state.db-wal" {
				continue
			}
			if timer == nil {
				timer = time.NewTimer(hub.debounce)
			} else {
				if !timer.Stop() {
					select {
					case <-timer.C:
					default:
					}
				}
				timer.Reset(hub.debounce)
			}
			debounce = timer.C
		case <-debounce:
			debounce = nil
			hub.refresh(ctx, observer, "changed")
		case <-reconcile:
			hub.refresh(ctx, observer, "reconcile")
		case watchErr := <-errorsChannel:
			hub.logger.Warn("session filesystem watcher error", "profile", observer.profile, "error", watchErr)
		}
	}
}

func (hub *SessionHub) refresh(ctx context.Context, observer *profileObserver, reason string) {
	rows, err := hub.load(ctx, observer.profile)
	if err != nil {
		hub.logger.Warn("session snapshot refresh failed", "profile", observer.profile, "error", err)
		return
	}
	current := make(map[string]string, len(rows))
	for _, row := range rows {
		current[row.ID] = row.Version
	}

	type notification struct {
		listener sessionListener
		event    sessionInvalidation
	}
	var notifications []notification
	hub.mu.Lock()
	if hub.profiles[observer.profile] != observer {
		hub.mu.Unlock()
		return
	}
	if !observer.initialized {
		observer.initialized = true
		for sessionID, listeners := range observer.subscribers {
			for _, listener := range listeners {
				observer.cursor++
				notifications = append(notifications, notification{listener, sessionInvalidation{sessionID, observer.cursor, "subscribed"}})
			}
		}
	} else {
		for sessionID, listeners := range observer.subscribers {
			changed := observer.snapshots[sessionID] != current[sessionID]
			if reason == "reconcile" || changed {
				for _, listener := range listeners {
					observer.cursor++
					notifications = append(notifications, notification{listener, sessionInvalidation{sessionID, observer.cursor, reason}})
				}
			}
		}
	}
	observer.snapshots = current
	hub.mu.Unlock()
	for _, item := range notifications {
		item.listener(item.event)
	}
}

func ensureDirectory(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("not a directory")
	}
	return nil
}
