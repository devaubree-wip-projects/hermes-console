package gateway

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"io"
	"log/slog"
	"net"
	"net/http"
	"regexp"
	"time"

	"github.com/MakFly/hermes-console/packages/shared/gatewaycontracts"
)

type requestIDContextKey struct{}

var validRequestID = regexp.MustCompile(`^[a-zA-Z0-9._-]{8,128}$`)

func requestID(r *http.Request) string {
	if candidate := r.Header.Get(gatewaycontracts.Spec.ServiceHeaders.RequestID); validRequestID.MatchString(candidate) {
		return candidate
	}
	random := make([]byte, 16)
	if _, err := rand.Read(random); err == nil {
		return hex.EncodeToString(random)
	}
	return hex.EncodeToString([]byte(time.Now().UTC().Format(time.RFC3339Nano)))
}

func requestIDFromContext(ctx context.Context) string {
	value, _ := ctx.Value(requestIDContextKey{}).(string)
	return value
}

type requestIDTransport struct{ base http.RoundTripper }

func (transport requestIDTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	if id := requestIDFromContext(request.Context()); id != "" {
		request = request.Clone(request.Context())
		request.Header.Set(gatewaycontracts.Spec.ServiceHeaders.RequestID, id)
	}
	return transport.base.RoundTrip(request)
}

type loggingResponseWriter struct {
	http.ResponseWriter
	status int
	bytes  int64
}

func (writer *loggingResponseWriter) WriteHeader(status int) {
	if writer.status != 0 {
		return
	}
	writer.status = status
	writer.ResponseWriter.WriteHeader(status)
}

func (writer *loggingResponseWriter) Write(contents []byte) (int, error) {
	if writer.status == 0 {
		writer.WriteHeader(http.StatusOK)
	}
	written, err := writer.ResponseWriter.Write(contents)
	writer.bytes += int64(written)
	return written, err
}

func (writer *loggingResponseWriter) Flush() {
	if writer.status == 0 {
		writer.WriteHeader(http.StatusOK)
	}
	if flusher, ok := writer.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (writer *loggingResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := writer.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, http.ErrNotSupported
	}
	return hijacker.Hijack()
}

func (writer *loggingResponseWriter) Push(target string, options *http.PushOptions) error {
	if pusher, ok := writer.ResponseWriter.(http.Pusher); ok {
		return pusher.Push(target, options)
	}
	return http.ErrNotSupported
}

func (writer *loggingResponseWriter) ReadFrom(reader io.Reader) (int64, error) {
	if writer.status == 0 {
		writer.WriteHeader(http.StatusOK)
	}
	if readerFrom, ok := writer.ResponseWriter.(io.ReaderFrom); ok {
		written, err := readerFrom.ReadFrom(reader)
		writer.bytes += written
		return written, err
	}
	return io.Copy(struct{ io.Writer }{writer}, reader)
}

func (writer *loggingResponseWriter) Unwrap() http.ResponseWriter { return writer.ResponseWriter }

func withRequestLogging(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		startedAt := time.Now()
		id := requestID(request)
		request.Header.Set(gatewaycontracts.Spec.ServiceHeaders.RequestID, id)
		response.Header().Set(gatewaycontracts.Spec.ServiceHeaders.RequestID, id)
		request = request.WithContext(context.WithValue(request.Context(), requestIDContextKey{}, id))
		writer := &loggingResponseWriter{ResponseWriter: response}
		next.ServeHTTP(writer, request)
		if writer.status == 0 {
			writer.status = http.StatusOK
		}
		level := slog.LevelInfo
		if request.URL.Path == "/healthz" || request.URL.Path == "/readyz" {
			level = slog.LevelDebug
		}
		if writer.status >= http.StatusInternalServerError {
			level = slog.LevelError
		}
		logger.Log(request.Context(), level, "http.request.completed",
			"requestId", id,
			"method", request.Method,
			"path", request.URL.Path,
			"status", writer.status,
			"durationMs", time.Since(startedAt).Milliseconds(),
			"bytes", writer.bytes,
		)
	})
}
