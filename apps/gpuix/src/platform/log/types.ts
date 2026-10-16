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
  redactKeys?: string[]
  contextProvider?: () => Record<string, unknown> | undefined
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

export interface LogEntry {
  level: LogLevel
  args: unknown[]
  timestamp: number
  prefix?: string
}

export type LogSink = (entry: LogEntry) => void
