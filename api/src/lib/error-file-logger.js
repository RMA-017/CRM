import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const NOOP = () => {};
const REDACTED = "[REDACTED]";
const SENSITIVE_LOG_KEYS = new Set([
  "authorization",
  "cookie",
  "cookies",
  "rawheaders",
  "password",
  "passwd",
  "privatekey",
  "private_key",
  "secret",
  "set-cookie",
  "token"
]);

function isSensitiveLogKey(key) {
  const normalized = String(key || "").trim().toLowerCase();
  if (SENSITIVE_LOG_KEYS.has(normalized)) return true;
  return normalized.endsWith("password")
    || normalized.endsWith("secret")
    || normalized.endsWith("token")
    || normalized.endsWith("privatekey")
    || normalized.endsWith("private_key");
}

function redactSensitiveText(value) {
  return String(value)
    .replace(/\bBearer\s+[^\s"',;]+/gi, `Bearer ${REDACTED}`)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED);
}

function toSerializableError(error) {
  if (!(error instanceof Error)) {
    return error;
  }
  return {
    name: String(error.name || "Error"),
    message: String(error.message || ""),
    stack: String(error.stack || "")
  };
}

function createSafeJsonReplacer() {
  const seen = new WeakSet();
  return (key, value) => {
    if (isSensitiveLogKey(key)) {
      return REDACTED;
    }
    if (value instanceof Error) {
      return toSerializableError(value);
    }
    if (typeof value === "string") {
      return redactSensitiveText(value);
    }
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (typeof value === "function") {
      return `[Function ${value.name || "anonymous"}]`;
    }
    if (value && typeof value === "object") {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }
    return value;
  };
}

function safeStringify(value) {
  try {
    return JSON.stringify(value, createSafeJsonReplacer());
  } catch {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      message: "Failed to serialize error log entry."
    });
  }
}

function parseLogArguments(args) {
  const source = Array.isArray(args) ? args : [];
  let message = "";
  let payload = null;
  const extra = [];

  source.forEach((arg) => {
    if (typeof arg === "string") {
      if (!message) {
        message = arg;
      } else {
        extra.push(arg);
      }
      return;
    }

    if (arg instanceof Error) {
      if (!payload || typeof payload !== "object") {
        payload = {};
      }
      payload.err = toSerializableError(arg);
      if (!message) {
        message = String(arg.message || "Error");
      }
      return;
    }

    if (arg && typeof arg === "object" && (!payload || typeof payload !== "object")) {
      payload = arg;
      return;
    }

    if (arg !== undefined) {
      extra.push(arg);
    }
  });

  if (extra.length > 0) {
    const basePayload = payload && typeof payload === "object" ? payload : {};
    payload = { ...basePayload, extra };
  }

  return {
    message: String(message || "").trim(),
    payload
  };
}

function createLineWriter(filePath) {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    const stream = createWriteStream(filePath, {
      flags: "a",
      encoding: "utf8"
    });
    stream.on("error", NOOP);
    return (line) => {
      stream.write(line);
    };
  } catch {
    return NOOP;
  }
}

function buildLogger({
  writeLine,
  bindings = {}
}) {
  const baseBindings = bindings && typeof bindings === "object"
    ? bindings
    : {};

  function logErrorLevel(level, ...args) {
    const parsed = parseLogArguments(args);
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message: parsed.message || (level === "fatal" ? "Fatal error." : "Error.")
    };
    if (Object.keys(baseBindings).length > 0) {
      entry.bindings = baseBindings;
    }
    if (parsed.payload !== null && parsed.payload !== undefined) {
      entry.payload = parsed.payload;
    }
    writeLine(`${safeStringify(entry)}\n`);
  }

  return {
    level: "error",
    trace: NOOP,
    debug: NOOP,
    info: NOOP,
    warn: NOOP,
    error(...args) {
      logErrorLevel("error", ...args);
    },
    fatal(...args) {
      logErrorLevel("fatal", ...args);
    },
    child(childBindings = {}) {
      const normalizedChildBindings = childBindings && typeof childBindings === "object"
        ? childBindings
        : {};
      return buildLogger({
        writeLine,
        bindings: {
          ...baseBindings,
          ...normalizedChildBindings
        }
      });
    }
  };
}

export function createErrorFileLogger({
  filePath
}) {
  const pathValue = String(filePath || "").trim();
  const writeLine = pathValue ? createLineWriter(pathValue) : NOOP;
  return buildLogger({ writeLine });
}

export const __errorFileLoggerContracts = Object.freeze({
  safeStringify
});
