package main

import (
	"context"
	"crypto/tls"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/MakFly/hermes-console/gateway"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if len(os.Args) > 1 && os.Args[1] == "enroll" {
		enrollFlags := flag.NewFlagSet("enroll", flag.ExitOnError)
		endpoint := enrollFlags.String("url", "", "Console enrollment endpoint")
		token := enrollFlags.String("token", "", "One-time enrollment token")
		identityDir := enrollFlags.String("identity-dir", "/var/lib/hermes-console/identity", "Identity storage directory")
		_ = enrollFlags.Parse(os.Args[2:])
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		bundle, err := gateway.EnrollEdge(ctx, *endpoint, *token, *identityDir, nil)
		if err != nil {
			logger.Error("Edge enrollment failed", "error", err)
			os.Exit(1)
		}
		logger.Info("Edge enrolled", "installationId", bundle.InstallationID, "relay", bundle.RelayURL, "identityDir", *identityDir)
		return
	}
	config, err := gateway.LoadConfig()
	if err != nil {
		logger.Error("invalid configuration", "error", err)
		os.Exit(1)
	}
	var handler http.Handler
	var closeApp func()
	if config.Mode == "relay" {
		app := gateway.NewRelay(config, logger)
		handler = app.Handler()
		closeApp = app.Close
	} else {
		app := gateway.NewServer(config, logger)
		handler = app.Handler()
		closeApp = app.Close
	}
	defer closeApp()
	server := &http.Server{
		Addr:              config.ListenAddress,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	if config.Mode == "relay" {
		if config.RelayServerCert == "" || config.RelayServerKey == "" {
			logger.Error("relay TLS certificate and key are required")
			os.Exit(1)
		}
		server.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS13, ClientAuth: tls.RequestClientCert}
	} else if config.RelayURL != nil {
		go func() {
			if relayErr := gateway.RunEdgeRelay(ctx, config, logger); relayErr != nil && ctx.Err() == nil {
				logger.Error("relay connector stopped", "error", relayErr)
				stop()
			}
		}()
	}

	logger.Info("Hermes gateway listening", "mode", config.Mode, "address", config.ListenAddress, "runtime", config.RuntimeHTTPURL.Redacted(), "installationId", config.InstallationID)
	if config.Mode == "relay" {
		err = server.ListenAndServeTLS(config.RelayServerCert, config.RelayServerKey)
	} else {
		err = server.ListenAndServe()
	}
	if err != nil && err != http.ErrServerClosed {
		logger.Error("gateway stopped", "error", err)
		os.Exit(1)
	}
}
