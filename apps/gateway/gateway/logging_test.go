package gateway

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/MakFly/hermes-console/packages/shared/gatewaycontracts"
)

func TestLoggerProducesRedactedJSON(t *testing.T) {
	t.Parallel()

	var output bytes.Buffer
	logger := NewLogger(&output, LoggerOptions{Environment: "production", Format: "json", Level: "debug"})
	logger.Error("provider failed token=inline-secret", "token", "visible", "detail", "Authorization: Bearer visible")

	var record map[string]any
	if err := json.Unmarshal(output.Bytes(), &record); err != nil {
		t.Fatal(err)
	}
	if record["service"] != "hermes-gateway" || record["environment"] != "production" || record["level"] != "error" {
		t.Fatalf("unexpected record: %#v", record)
	}
	if record["token"] != "[REDACTED]" || strings.Contains(output.String(), "Bearer visible") || strings.Contains(output.String(), "inline-secret") {
		t.Fatalf("sensitive value leaked: %s", output.String())
	}
}

func TestRequestLoggingCorrelatesResponseAndLog(t *testing.T) {
	t.Parallel()

	var output bytes.Buffer
	logger := NewLogger(&output, LoggerOptions{Environment: "development", Format: "json", Level: "info"})
	handler := withRequestLogging(logger, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if requestIDFromContext(request.Context()) != "request-123" {
			t.Fatal("request id missing from context")
		}
		response.WriteHeader(http.StatusCreated)
		_, _ = io.WriteString(response, "ok")
	}))
	request := httptest.NewRequest(http.MethodPost, "http://gateway/v1/control", nil)
	request.Header.Set(gatewaycontracts.Spec.ServiceHeaders.RequestID, "request-123")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Header().Get(gatewaycontracts.Spec.ServiceHeaders.RequestID) != "request-123" {
		t.Fatal("request id missing from response")
	}
	var record map[string]any
	if err := json.Unmarshal(output.Bytes(), &record); err != nil {
		t.Fatal(err)
	}
	if record["requestId"] != "request-123" || record["status"] != float64(http.StatusCreated) || record["path"] != "/v1/control" {
		t.Fatalf("unexpected access log: %#v", record)
	}
}

func TestSuccessfulHealthcheckIsQuietAtInfo(t *testing.T) {
	t.Parallel()

	var output bytes.Buffer
	logger := NewLogger(&output, LoggerOptions{Environment: "development", Format: "json", Level: "info"})
	handler := withRequestLogging(logger, http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.WriteHeader(http.StatusOK)
	}))
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "http://gateway/readyz", nil))
	if output.Len() != 0 {
		t.Fatalf("successful healthcheck should be quiet: %s", output.String())
	}
}

func TestLoggingWriterPreservesHijacking(t *testing.T) {
	t.Parallel()

	server, client := netPipeResponseWriter(t)
	defer server.connection.Close()
	defer client.Close()
	writer := &loggingResponseWriter{ResponseWriter: server}
	connection, _, err := writer.Hijack()
	if err != nil || connection == nil {
		t.Fatalf("hijack failed: %v", err)
	}
}

type pipeResponseWriter struct {
	header     http.Header
	connection net.Conn
}

func (writer *pipeResponseWriter) Header() http.Header { return writer.header }
func (writer *pipeResponseWriter) Write(contents []byte) (int, error) {
	return writer.connection.Write(contents)
}
func (writer *pipeResponseWriter) WriteHeader(int) {}
func (writer *pipeResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	connection := writer.connection
	return connection, bufio.NewReadWriter(bufio.NewReader(connection), bufio.NewWriter(connection)), nil
}

func netPipeResponseWriter(t *testing.T) (*pipeResponseWriter, net.Conn) {
	t.Helper()
	server, client := net.Pipe()
	return &pipeResponseWriter{header: make(http.Header), connection: server}, client
}
