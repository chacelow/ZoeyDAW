import {
  clearLogs as nativeClearLogs,
  getLogConfig as nativeGetLogConfig,
  initializeLog as nativeInitializeLog,
  openLogDir as nativeOpenLogDir,
  setLogDir as nativeSetLogDir,
  setLogLevel as nativeSetLogLevel,
  userDirectories,
  writeLog,
} from "@zoeydaw/native"
import type { LogEntry, LogSink } from "@zoeymind/logger"

export type LogLevel = "off" | "error" | "warn" | "info" | "debug" | "trace"

export interface LogInfo {
  level: LogLevel
  activeDir: string
  configuredDir: string | null
  defaultDir: string
  sizeBytes: number
}

function formatValue(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ? `${value.message}\n${value.stack}` : value.message
  }
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean" || value == null) return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return Object.prototype.toString.call(value)
  }
}

export function createNativeLogSink(): LogSink {
  return (entry: LogEntry) => {
    if (entry.level === "debug") return
    const message = `${entry.prefix ? `[${entry.prefix}] ` : ""}${entry.args.map(formatValue).join(" ")}`
    writeLog(entry.level === "success" ? "info" : entry.level, message)
  }
}

export function createLogPlatform(options: { configDir?: string; defaultDir?: string } = {}) {
  const dirs =
    options.configDir !== undefined && options.defaultDir !== undefined
      ? { configDir: options.configDir, logDir: options.defaultDir }
      : userDirectories()
  const configDir = options.configDir ?? dirs.configDir
  const defaultDir = options.defaultDir ?? dirs.logDir
  return {
    initialize: () => nativeInitializeLog(configDir, defaultDir),
    get: (): LogInfo => JSON.parse(nativeGetLogConfig(configDir, defaultDir)),
    setLevel: (level: LogLevel) => nativeSetLogLevel(configDir, level),
    setDir: (dir: string) => nativeSetLogDir(configDir, dir),
    clear: () => nativeClearLogs(configDir, defaultDir),
    openDir: () => nativeOpenLogDir(configDir, defaultDir),
  }
}
