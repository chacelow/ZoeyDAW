import type { ColorTheme } from "./types"

export const defaultColors: ColorTheme = {
  debug: "#6b7280",
  info: "#3b82f6",
  warn: "#f59e0b",
  error: "#ef4444",
  success: "#10b981",
  timestamp: "#9ca3af",
  prefix: "#8b5cf6", // 紫色
}

const ansiColors = {
  reset: "\u{1B}[0m",
  bright: "\u{1B}[1m",
  dim: "\u{1B}[2m",

  black: "\u{1B}[30m",
  red: "\u{1B}[31m",
  green: "\u{1B}[32m",
  yellow: "\u{1B}[33m",
  blue: "\u{1B}[34m",
  magenta: "\u{1B}[35m",
  cyan: "\u{1B}[36m",
  white: "\u{1B}[37m",
  gray: "\u{1B}[90m",

  brightRed: "\u{1B}[91m",
  brightGreen: "\u{1B}[92m",
  brightYellow: "\u{1B}[93m",
  brightBlue: "\u{1B}[94m",
  brightMagenta: "\u{1B}[95m",
  brightCyan: "\u{1B}[96m",
  brightWhite: "\u{1B}[97m",
}

function hexToAnsi(hex: string): string {
  const colorMap: Record<string, string> = {
    "#6b7280": ansiColors.gray,
    "#3b82f6": ansiColors.blue,
    "#f59e0b": ansiColors.yellow,
    "#ef4444": ansiColors.red,
    "#10b981": ansiColors.green,
    "#9ca3af": ansiColors.gray,
    "#8b5cf6": ansiColors.magenta, // prefix - 紫色
  }

  return colorMap[hex.toLowerCase()] || ansiColors.white
}

export function applyColor(text: string, color: string): string {
  if (!color) {
    return text
  }
  const ansiColor = hexToAnsi(color)
  return `${ansiColor}${text}${ansiColors.reset}`
}
