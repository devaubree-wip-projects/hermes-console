package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRunHealthcheck(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	if err := runHealthcheck(context.Background(), server.URL); err != nil {
		t.Fatalf("healthcheck failed: %v", err)
	}
}

func TestRunHealthcheckRejectsUnreadyEndpoint(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()

	if err := runHealthcheck(context.Background(), server.URL); err == nil {
		t.Fatal("expected healthcheck failure")
	}
}
