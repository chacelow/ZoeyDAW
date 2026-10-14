// 主导出文件 默认导出logger实例

export {
  createLogger,
  logger,
  configureLogger,
  DEFAULT_REDACT_KEYS,
  logger as default,
} from "./logger"
export { showLogo } from "./logo"
export { defaultColors, isBrowser } from "./colors"
export type {
  LogLevel,
  LoggerConfig,
  ColorTheme,
  LogMessage,
  Logger,
  LogEntry,
  LogSink,
} from "./types"
