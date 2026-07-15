package gateway

import (
	"io"
	"log/slog"
	"os"
	"regexp"
	"strings"
)

type LoggerOptions struct {
	Environment string
	Format      string
	Level       string
}

var sensitiveLogKey = regexp.MustCompile(`(?i)(authorization|cookie|credential|password|private.?key|secret|session.?token|signature|token|webhook)`)
var bearerValue = regexp.MustCompile(`(?i)Bearer\s+[A-Za-z0-9._~+/=-]+`)
var providerKeyValue = regexp.MustCompile(`\bsk-[A-Za-z0-9_-]{16,}\b`)
var inlineSensitiveValue = regexp.MustCompile(`(?i)((?:authorization|cookie|credential|password|private[_-]?key|secret|token|webhook)\s*[:=]\s*)[^\s,;]+`)

func redactLogString(value string) string {
	value = bearerValue.ReplaceAllString(value, "Bearer [REDACTED]")
	value = providerKeyValue.ReplaceAllString(value, "[REDACTED]")
	return inlineSensitiveValue.ReplaceAllString(value, "$1[REDACTED]")
}

func LoggerOptionsFromEnv() LoggerOptions {
	environment := strings.ToLower(env("HERMES_GATEWAY_ENV", "development"))
	format := strings.ToLower(env("HERMES_LOG_FORMAT", ""))
	if format == "" {
		if environment == "production" {
			format = "json"
		} else {
			format = "text"
		}
	}
	return LoggerOptions{
		Environment: environment,
		Format:      format,
		Level:       strings.ToLower(env("HERMES_LOG_LEVEL", "info")),
	}
}

func NewLogger(writer io.Writer, options LoggerOptions) *slog.Logger {
	level := slog.LevelInfo
	switch strings.ToLower(options.Level) {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	}
	handlerOptions := &slog.HandlerOptions{
		Level: level,
		ReplaceAttr: func(_ []string, attribute slog.Attr) slog.Attr {
			if attribute.Key == slog.LevelKey {
				return slog.String(attribute.Key, strings.ToLower(attribute.Value.String()))
			}
			if sensitiveLogKey.MatchString(attribute.Key) {
				return slog.String(attribute.Key, "[REDACTED]")
			}
			if attribute.Value.Kind() == slog.KindString {
				return slog.String(attribute.Key, redactLogString(attribute.Value.String()))
			}
			return attribute
		},
	}
	var handler slog.Handler
	if strings.EqualFold(options.Format, "json") {
		handler = slog.NewJSONHandler(writer, handlerOptions)
	} else {
		handler = slog.NewTextHandler(writer, handlerOptions)
	}
	environment := options.Environment
	if environment == "" {
		environment = "development"
	}
	return slog.New(handler).With("service", "hermes-gateway", "environment", environment)
}

func DefaultLogger() *slog.Logger {
	return NewLogger(os.Stdout, LoggerOptionsFromEnv())
}
