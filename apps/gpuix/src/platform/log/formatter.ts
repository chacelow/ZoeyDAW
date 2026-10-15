import { applyColor, defaultColors } from "./colors"
import type { LogLevel, LoggerConfig, LogMessage } from "./types"

/**
 * 格式化时间戳
 */
function formatTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").replace("Z", "")
}

/**
 * 获取日志级别的显示文本
 */
function getLevelText(level: LogLevel): string {
  const levelTexts = {
    debug: "DEBUG",
    info: "INFO",
    warn: "WARN",
    error: "ERROR",
    success: "SUCCESS",
  }
  return levelTexts[level]
}

/**
 * 格式化日志消息
 */
export function formatMessage(message: LogMessage, config: LoggerConfig): (string | number)[] {
  const colors = { ...defaultColors, ...config.colors }

  let formattedMessage = ""

  // 时间戳
  if (config.showTimestamp) {
    const timestampText = applyColor(`[${formatTimestamp(message.timestamp)}]`, colors.timestamp)
    formattedMessage += `${timestampText} `
  }

  // 日志级别
  if (config.showLevel) {
    const levelColor = colors[message.level]
    const levelText = applyColor(`[${getLevelText(message.level)}]`, levelColor)
    formattedMessage += `${levelText} `
  }

  // 前缀
  if (config.prefix || message.prefix) {
    const prefixText = message.prefix || config.prefix || ""
    const prefixFormatted = applyColor(`[${prefixText}]`, colors.prefix)
    formattedMessage += `${prefixFormatted} `
  }

  // 消息内容 - 除了warn和error，其他都用灰白色
  const messageColor =
    message.level === "warn" || message.level === "error" ? colors[message.level] : "#9ca3af" // 灰白色
  const coloredMessage = applyColor(message.message, messageColor)
  formattedMessage += coloredMessage

  return [formattedMessage]
}
