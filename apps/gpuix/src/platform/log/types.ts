export type LogLevel = "debug" | "info" | "warn" | "error" | "success"

export interface LoggerConfig {
  show: boolean
  showLogo: boolean
  showTimestamp: boolean
  showLevel: boolean
  prefix?: string
  colors?: Partial<ColorTheme>
  minLevel?: LogLevel
  json?: boolean
  /**
  所有 console 与 sink 输出需脱敏的字段名（大小写不敏感，递归匹配）。命中值替换为 '[REDACTED]'。
  */
  redactKeys?: string[]
  /**
  返回每条日志的环境字段（如 requestId/userId）。JSON 合并字段；格式化输出及 sink args 末尾附加脱敏后的上下文。
  */
  contextProvider?: () => Record<string, unknown> | undefined
  /**
   * 侧输出通道。通过级别过滤的日志在 console 后同步交给每个 sink；参数已展开 Error 并脱敏，sink 异常不影响主流程。
   */
  sinks?: LogSink[]
}

export interface ColorTheme {
  debug: string
  info: string
  warn: string
  error: string
  success: string
  timestamp: string
  prefix: string
}

export interface LogMessage {
  level: LogLevel
  message: string
  timestamp: Date
  prefix?: string
}

export interface Logger {
  debug: (...arguments_: unknown[]) => void
  info: (...arguments_: unknown[]) => void
  warn: (...arguments_: unknown[]) => void
  error: (...arguments_: unknown[]) => void
  success: (...arguments_: unknown[]) => void
  log: (...arguments_: unknown[]) => void
  setConfig: (config: Partial<LoggerConfig>) => void
  getConfig: () => LoggerConfig
}

/**
 * 一条 log 交给 sink 的结构体。args 保留主消息与附加参数的顺序，Error 递归展开为对象；若有环境上下文则附在末尾。所有对象均经过非原地脱敏。
 */
export interface LogEntry {
  level: LogLevel
  args: unknown[]
  /**
  ms since epoch, 与 Date.now() 一致.
  */
  timestamp: number
  prefix?: string
}

export type LogSink = (entry: LogEntry) => void
