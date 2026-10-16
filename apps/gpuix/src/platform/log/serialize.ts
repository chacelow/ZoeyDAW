// 日志输出边界的值规范化：Error 展开 + 敏感字段脱敏。

const REDACTED = "[REDACTED]"

/** 展开 Error 的诊断字段；递归与循环检测由 redact 统一负责。 */
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
  // Error 的自定义可枚举属性（如 code、statusCode）；结构无法静态表达，一次性具名断言。
  const ownProperties = error as unknown as Record<string, unknown>
  for (const key of Object.keys(error)) {
    if (!Object.hasOwn(out, key) && !Object.hasOwn(Object.prototype, key)) {
      out[key] = ownProperties[key]
    }
  }
  return out
}

/**
 * 深度脱敏：命中 redactKeys（大小写不敏感）的字段值替换为 [REDACTED]。
 * 处理循环引用；数组逐项递归。
 */
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
