import { defaultColors } from "./colors"
import { formatMessage } from "./formatter"
import { showLogo } from "./logo"
import { redact } from "./serialize"
import { isProduction } from "./env"
import type { LogLevel, LoggerConfig, Logger, LogEntry } from "./types"

// Native production keeps info; development keeps all levels.
const productionMinLevel: LogLevel = "info"

const defaultConfig: LoggerConfig = {
  show: true,
  showLogo: !isProduction,
  showTimestamp: false,
  showLevel: true,
  colors: defaultColors,
  minLevel: isProduction ? productionMinLevel : "debug",
  json: isProduction,
}

/**
 * 创建Logger实例
 */
export function createLogger(initialConfig: Partial<LoggerConfig> = {}): Logger {
  let config: LoggerConfig = { ...defaultConfig, ...initialConfig }
  let isLogoShown = false

  /**
   * 显示Logo（仅显示一次）
   */
  function displayLogo(): void {
    if (!config.showLogo || isLogoShown) {
      return
    }

    showLogo()
    isLogoShown = true
  }

  /**
   * 检查日志级别是否应该显示
   */
  function shouldLog(level: LogLevel): boolean {
    if (!config.show) {
      return false
    }
    if (!config.minLevel) {
      return true
    }

    const levels: LogLevel[] = ["debug", "info", "warn", "error", "success"]
    const currentLevelIndex = levels.indexOf(level)
    const minLevelIndex = levels.indexOf(config.minLevel)

    return currentLevelIndex >= minLevelIndex
  }

  function log(level: LogLevel, ...arguments_: unknown[]): void {
    if (!shouldLog(level)) {
      return
    }

    if (!config.json) {
      displayLogo()
    }

    const redactKeys = new Set(config.redactKeys?.map(key => key.toLowerCase()))
    const sanitizedArguments = arguments_.map(argument => redact(argument, redactKeys))
    const context = config.contextProvider?.()
    const sanitizedContext = context ? redact(context, redactKeys) : undefined
    const sinkArguments = sanitizedContext
      ? [...sanitizedArguments, sanitizedContext]
      : sanitizedArguments
    const firstArgument = sanitizedArguments[0]
    const mainMessage =
      arguments_[0] instanceof Error &&
      firstArgument &&
      typeof firstArgument === "object" &&
      "name" in firstArgument &&
      "message" in firstArgument
        ? `${firstArgument.name}: ${firstArgument.message}`
        : sanitizedArguments.length > 0
          ? String(firstArgument)
          : ""
    const extraArguments = sanitizedArguments.slice(1)

    if (config.json) {
      const entry: Record<string, unknown> = {
        level,
        msg: mainMessage,
        time: Date.now(),
      }
      if (config.prefix) {
        entry.prefix = config.prefix
      }
      // 环境上下文（requestId/userId 等）先注入，作为权威字段
      if (sanitizedContext) {
        Object.assign(entry, sanitizedContext)
      }
      if (
        extraArguments.length === 1 &&
        typeof extraArguments[0] === "object" &&
        extraArguments[0] !== null
      ) {
        Object.assign(entry, extraArguments[0])
      } else if (extraArguments.length > 0) {
        entry.data = extraArguments
      }
      const consoleMethod =
        level === "error" ? console.error : level === "warn" ? console.warn : console.log
      consoleMethod(JSON.stringify(entry))
      emitToSinks(level, sinkArguments)
      return
    }

    const logMessage = { level, message: mainMessage, timestamp: new Date() }
    const formattedParts = formatMessage(logMessage, config)

    const consoleMethod =
      level === "error" ? console.error : level === "warn" ? console.warn : console.log
    consoleMethod(
      ...formattedParts,
      ...extraArguments,
      ...(sanitizedContext ? [sanitizedContext] : [])
    )

    emitToSinks(level, sinkArguments)
  }

  function emitToSinks(level: LogLevel, arguments_: unknown[]): void {
    const { sinks } = config
    if (!sinks || sinks.length === 0) {
      return
    }
    const entry: LogEntry = {
      level,
      args: arguments_,
      timestamp: Date.now(),
      prefix: config.prefix,
    }
    for (const sink of sinks) {
      try {
        sink(entry)
      } catch {
        /*
        sink 异常吞掉, 保证 logger 主流程不受影响
        */
      }
    }
  }

  return {
    debug: (...arguments_: unknown[]) => log("debug", ...arguments_),
    info: (...arguments_: unknown[]) => log("info", ...arguments_),
    warn: (...arguments_: unknown[]) => log("warn", ...arguments_),
    error: (...arguments_: unknown[]) => log("error", ...arguments_),
    success: (...arguments_: unknown[]) => log("success", ...arguments_),
    log: (...arguments_: unknown[]) => log("info", ...arguments_), // 默认使用info级别

    setConfig: (newConfig: Partial<LoggerConfig>) => {
      config = { ...config, ...newConfig }
    },

    getConfig: () => ({ ...config }),
  }
}

// 生产 JSON 模式默认脱敏的高危字段（大小写不敏感）。业务可用 configureLogger 追加。
export const DEFAULT_REDACT_KEYS = [
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "secret",
  "apiKey",
  "authorization",
  "cookie",
  "sessionToken",
]

export const logger = createLogger({
  prefix: "ZOEY",
  showTimestamp: false,
  showLevel: true,
  showLogo: !isProduction,
  minLevel: isProduction ? productionMinLevel : "debug",
  json: isProduction,
  redactKeys: DEFAULT_REDACT_KEYS,
})

export function configureLogger(config: Partial<LoggerConfig>) {
  logger.setConfig(config)
}
