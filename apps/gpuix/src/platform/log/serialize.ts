const REDACTED = "[REDACTED]"

function normalizeError(error: Error): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  }
  if (error.stack) {
    out.stack = error.stack
  }
  if (error.cause !== undefined) {
    out.cause = error.cause
  }
  const ownProperties = error as unknown as Record<string, unknown>
  for (const key of Object.keys(error)) {
    if (!Object.hasOwn(out, key) && !Object.hasOwn(Object.prototype, key)) {
      out[key] = ownProperties[key]
    }
  }
  return out
}

export function redact(
  value: unknown,
  redactKeys: Set<string>,
  seen = new WeakSet<object>()
): unknown {
  if (value === null || typeof value !== "object") {
    return value
  }
  if (seen.has(value)) {
    return "[Circular]"
  }
  seen.add(value)

  if (Array.isArray(value)) {
    const out = value.map(item => redact(item, redactKeys, seen))
    seen.delete(value)
    return out
  }

  const source = value instanceof Error ? normalizeError(value) : (value as Record<string, unknown>)
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(source)) {
    out[key] = redactKeys.has(key.toLowerCase()) ? REDACTED : redact(source[key], redactKeys, seen)
  }
  seen.delete(value)
  return out
}
