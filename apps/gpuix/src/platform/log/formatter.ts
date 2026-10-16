import { applyColor, defaultColors } from "./colors"
import type { LogLevel, LoggerConfig, LogMessage } from "./types"

function formatTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").replace("Z", "")
}

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

export function formatMessage(message: LogMessage, config: LoggerConfig): (string | number)[] {
  const colors = { ...defaultColors, ...config.colors }

  let formattedMessage = ""

  if (config.showTimestamp) {
    const timestampText = applyColor(`[${formatTimestamp(message.timestamp)}]`, colors.timestamp)
    formattedMessage += `${timestampText} `
  }

  if (config.showLevel) {
    const levelColor = colors[message.level]
    const levelText = applyColor(`[${getLevelText(message.level)}]`, levelColor)
    formattedMessage += `${levelText} `
  }

  if (config.prefix || message.prefix) {
    const prefixText = message.prefix || config.prefix || ""
    const prefixFormatted = applyColor(`[${prefixText}]`, colors.prefix)
    formattedMessage += `${prefixFormatted} `
  }

  const messageColor =
    message.level === "warn" || message.level === "error" ? colors[message.level] : "#9ca3af"
  const coloredMessage = applyColor(message.message, messageColor)
  formattedMessage += coloredMessage

  return [formattedMessage]
}
