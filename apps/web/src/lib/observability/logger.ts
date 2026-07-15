type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
type LogFormat = "pretty" | "json";
type LogContext = Record<string, unknown>;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const SENSITIVE_KEY = /(?:authorization|cookie|credential|password|private.?key|secret|session.?token|signature|token|webhook)/i;
const MAX_STRING_LENGTH = 4_000;
const MAX_ARRAY_LENGTH = 25;
const MAX_DEPTH = 5;

function logLevel(value: string | undefined): LogLevel {
  const normalized = value?.trim().toLowerCase();
  return normalized === "debug" || normalized === "info" || normalized === "warn"
    || normalized === "error" || normalized === "silent"
    ? normalized
    : "info";
}

function redactString(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED]")
    .replace(/((?:authorization|cookie|credential|password|private[_-]?key|secret|token|webhook)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, MAX_STRING_LENGTH);
}

function sanitize(value: unknown, key = "", depth = 0): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (depth > MAX_DEPTH) return "[TRUNCATED]";
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") return redactString(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      ...(value.stack ? { stack: redactString(value.stack) } : {}),
    };
  }
  if (Array.isArray(value)) {
    const entries = value.slice(0, MAX_ARRAY_LENGTH).map((entry) => sanitize(entry, key, depth + 1));
    return value.length > MAX_ARRAY_LENGTH ? [...entries, `[${value.length - MAX_ARRAY_LENGTH} MORE]`] : entries;
  }
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .map(([entryKey, entry]) => [entryKey, sanitize(entry, entryKey, depth + 1)]));
  }
  return redactString(String(value));
}

function prettyValue(value: unknown) {
  if (typeof value === "string" && !/\s/.test(value)) return value;
  return JSON.stringify(value);
}

export type LoggerOptions = {
  service?: string;
  environment?: string;
  level?: LogLevel;
  format?: LogFormat;
  write?: (level: Exclude<LogLevel, "silent">, line: string) => void;
  now?: () => Date;
};

export function createLogger(options: LoggerOptions = {}) {
  const service = options.service ?? "hermes-web";
  const environment = options.environment ?? process.env.NODE_ENV ?? "development";
  const threshold = options.level ?? logLevel(process.env.HERMES_LOG_LEVEL);
  const format = options.format
    ?? (process.env.HERMES_LOG_FORMAT === "json" || environment === "production" ? "json" : "pretty");
  const write = options.write ?? ((level, line) => {
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  });
  const now = options.now ?? (() => new Date());

  function emit(level: Exclude<LogLevel, "silent">, message: string, context: LogContext = {}) {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[threshold]) return;
    const timestamp = now().toISOString();
    const safeContext = sanitize(context) as LogContext;
    const safeMessage = redactString(message);
    if (format === "json") {
      write(level, JSON.stringify({ ...safeContext, timestamp, level, service, environment, message: safeMessage }));
      return;
    }
    const details = Object.entries(safeContext)
      .map(([key, value]) => `${key}=${prettyValue(value)}`)
      .join(" ");
    write(level, `${timestamp} ${level.toUpperCase().padEnd(5)} ${service} ${safeMessage}${details ? ` ${details}` : ""}`);
  }

  return {
    debug: (message: string, context?: LogContext) => emit("debug", message, context),
    info: (message: string, context?: LogContext) => emit("info", message, context),
    warn: (message: string, context?: LogContext) => emit("warn", message, context),
    error: (message: string, context?: LogContext) => emit("error", message, context),
  };
}

export function normalizedRequestId(value: string | null | undefined) {
  const candidate = value?.trim();
  return candidate && /^[a-zA-Z0-9._-]{8,128}$/.test(candidate) ? candidate : crypto.randomUUID();
}

export const webLogger = createLogger();
