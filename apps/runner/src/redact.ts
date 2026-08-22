const SECRET_KEYS = new Set(["token", "apikey", "api_key", "authorization", "secret", "password"]);
const SECRET_PATTERN = /("?(?:token|api[_-]?key|authorization|secret|password)"?\s*[:=]\s*")([^"]+)(")/gi;

export function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(SECRET_PATTERN, '$1[redacted]$3');
  }
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, nested]) => {
      if (SECRET_KEYS.has(key.toLowerCase())) {
        return [key, "[redacted]"];
      }
      return [key, redact(nested)];
    });
    return Object.fromEntries(entries);
  }
  return value;
}
