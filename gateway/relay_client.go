package gateway

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type edgeRelayClient struct {
	config  Config
	logger  *slog.Logger
	conn    *websocket.Conn
	writeMu sync.Mutex
	mu      sync.Mutex
	sockets map[string]*websocket.Conn
	http    *http.Client
}

func relayTLSConfig(config Config) (*tls.Config, error) {
	certificate, err := tls.LoadX509KeyPair(config.RelayClientCert, config.RelayClientKey)
	if err != nil {
		return nil, err
	}
	pool, err := x509.SystemCertPool()
	if err != nil || pool == nil {
		pool = x509.NewCertPool()
	}
	if config.RelayServerCA != "" {
		contents, readErr := os.ReadFile(config.RelayServerCA)
		if readErr != nil {
			return nil, readErr
		}
		if !pool.AppendCertsFromPEM(contents) {
			return nil, errors.New("relay CA contains no certificate")
		}
	}
	return &tls.Config{MinVersion: tls.VersionTLS13, Certificates: []tls.Certificate{certificate}, RootCAs: pool}, nil
}

func RunEdgeRelay(ctx context.Context, config Config, logger *slog.Logger) error {
	if config.RelayURL == nil {
		return nil
	}
	if config.RelayCredential == "" || config.RelayClientCert == "" || config.RelayClientKey == "" {
		return errors.New("relay mode requires credential, client certificate and private key")
	}
	tlsConfig, err := relayTLSConfig(config)
	if err != nil {
		return err
	}
	return runEdgeRelayLoop(ctx, config, logger, tlsConfig)
}

func runEdgeRelayLoop(ctx context.Context, config Config, logger *slog.Logger, tlsConfig *tls.Config) error {
	backoff := time.Second
	for ctx.Err() == nil {
		err := runEdgeRelayConnection(ctx, config, logger, tlsConfig)
		if ctx.Err() != nil {
			break
		}
		logger.Warn("Relay tunnel disconnected; retrying", "error", err, "backoff", backoff)
		timer := time.NewTimer(backoff)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
	return ctx.Err()
}

func runEdgeRelayConnection(ctx context.Context, config Config, logger *slog.Logger, tlsConfig *tls.Config) error {
	headers := http.Header{"Authorization": []string{"Bearer " + config.RelayCredential}}
	dialer := websocket.Dialer{TLSClientConfig: tlsConfig, HandshakeTimeout: 10 * time.Second}
	connection, response, err := dialer.DialContext(ctx, config.RelayURL.String(), headers)
	if response != nil && response.Body != nil {
		_ = response.Body.Close()
	}
	if err != nil {
		return err
	}
	client := &edgeRelayClient{
		config: config, logger: logger, conn: connection, sockets: make(map[string]*websocket.Conn),
		http: &http.Client{Timeout: 15 * time.Second},
	}
	defer client.close()
	connection.SetReadLimit(config.RelayMaxFrameBytes)
	logger.Info("Relay tunnel connected", "url", config.RelayURL.Redacted())
	heartbeatDone := make(chan struct{})
	defer close(heartbeatDone)
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-heartbeatDone:
				return
			case <-ctx.Done():
				_ = connection.Close()
				return
			case <-ticker.C:
				if client.send(relayFrame{Type: "heartbeat", ID: config.InstallationID}) != nil {
					_ = connection.Close()
					return
				}
			}
		}
	}()
	for {
		var frame relayFrame
		if err := connection.ReadJSON(&frame); err != nil {
			return err
		}
		switch frame.Type {
		case "welcome":
			if frame.ProtocolVersion != 1 {
				return errors.New("unsupported Relay protocol")
			}
			continue
		case "http_request":
			go client.handleHTTP(ctx, frame)
		case "ws_open":
			go client.openWebSocket(ctx, frame)
		case "ws_data":
			client.mu.Lock()
			socket := client.sockets[frame.ID]
			client.mu.Unlock()
			if socket == nil || socket.WriteMessage(frame.MessageType, frame.Body) != nil {
				_ = client.send(relayFrame{Type: "ws_close", ID: frame.ID})
			}
		case "ws_close":
			client.removeSocket(frame.ID)
		}
	}
}

func (client *edgeRelayClient) close() {
	_ = client.conn.Close()
	client.mu.Lock()
	defer client.mu.Unlock()
	for _, socket := range client.sockets {
		_ = socket.Close()
	}
	client.sockets = map[string]*websocket.Conn{}
}

func (client *edgeRelayClient) send(frame relayFrame) error {
	client.writeMu.Lock()
	defer client.writeMu.Unlock()
	_ = client.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return client.conn.WriteJSON(frame)
}

func (client *edgeRelayClient) localURL(path, rawQuery string) string {
	target := *client.config.EdgeLocalURL
	target.Path = path
	target.RawQuery = rawQuery
	return target.String()
}

func (client *edgeRelayClient) handleHTTP(ctx context.Context, frame relayFrame) {
	request, err := http.NewRequestWithContext(ctx, frame.Method, client.localURL(frame.Path, frame.RawQuery), bytes.NewReader(frame.Body))
	if err != nil {
		_ = client.send(relayFrame{Type: "error", ID: frame.ID, Error: "invalid local request"})
		return
	}
	request.Header = frame.Header.Clone()
	response, err := client.http.Do(request)
	if err != nil {
		_ = client.send(relayFrame{Type: "error", ID: frame.ID, Error: "local Edge unavailable"})
		return
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, client.config.RelayMaxFrameBytes+1))
	if err != nil || int64(len(body)) > client.config.RelayMaxFrameBytes {
		_ = client.send(relayFrame{Type: "error", ID: frame.ID, Error: "local Edge response too large"})
		return
	}
	_ = client.send(relayFrame{Type: "http_response", ID: frame.ID, Status: response.StatusCode, Header: cloneResponseHeaders(response.Header), Body: body})
}

func cloneResponseHeaders(source http.Header) http.Header {
	result := make(http.Header)
	for key, values := range source {
		lower := strings.ToLower(key)
		if lower == "content-type" || lower == "cache-control" {
			result[key] = append([]string(nil), values...)
		}
	}
	return result
}

func (client *edgeRelayClient) openWebSocket(ctx context.Context, frame relayFrame) {
	target, err := url.Parse(client.localURL(frame.Path, frame.RawQuery))
	if err != nil {
		_ = client.send(relayFrame{Type: "error", ID: frame.ID, Error: "invalid local websocket"})
		return
	}
	if target.Scheme == "https" {
		target.Scheme = "wss"
	} else {
		target.Scheme = "ws"
	}
	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}
	socket, response, err := dialer.DialContext(ctx, target.String(), frame.Header)
	if response != nil && response.Body != nil {
		_ = response.Body.Close()
	}
	if err != nil {
		_ = client.send(relayFrame{Type: "error", ID: frame.ID, Error: "local websocket unavailable"})
		return
	}
	socket.SetReadLimit(client.config.RelayMaxFrameBytes)
	client.mu.Lock()
	client.sockets[frame.ID] = socket
	client.mu.Unlock()
	if client.send(relayFrame{Type: "ws_opened", ID: frame.ID}) != nil {
		client.removeSocket(frame.ID)
		return
	}
	for {
		messageType, body, readErr := socket.ReadMessage()
		if readErr != nil {
			break
		}
		if int64(len(body)) > client.config.RelayMaxFrameBytes || client.send(relayFrame{Type: "ws_data", ID: frame.ID, MessageType: messageType, Body: body}) != nil {
			break
		}
	}
	client.removeSocket(frame.ID)
	_ = client.send(relayFrame{Type: "ws_close", ID: frame.ID})
}

func (client *edgeRelayClient) removeSocket(id string) {
	client.mu.Lock()
	socket := client.sockets[id]
	delete(client.sockets, id)
	client.mu.Unlock()
	if socket != nil {
		_ = socket.Close()
	}
}
