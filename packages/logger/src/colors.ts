import type { ColorTheme } from "./types"

// 检测是否在浏览器环境
export const isBrowser = typeof window !== "undefined" && typeof document !== "undefined"

// 默认颜色主题
export const defaultColors: ColorTheme = {
  debug: "#6b7280", // 灰色
  info: "#3b82f6", // 蓝色
  warn: "#f59e0b", // 黄色
  error: "#ef4444", // 红色
  success: "#10b981", // 绿色
  timestamp: "#9ca3af", // 浅灰色
  prefix: "#8b5cf6", // 紫色
}

// Node.js环境的ANSI颜色代码
const ansiColors = {
  reset: "\u{1B}[0m",
  bright: "\u{1B}[1m",
  dim: "\u{1B}[2m",

  // 前景色
  black: "\u{1B}[30m",
  red: "\u{1B}[31m",
  green: "\u{1B}[32m",
  yellow: "\u{1B}[33m",
  blue: "\u{1B}[34m",
  magenta: "\u{1B}[35m",
  cyan: "\u{1B}[36m",
  white: "\u{1B}[37m",
  gray: "\u{1B}[90m",

  // 亮色
  brightRed: "\u{1B}[91m",
  brightGreen: "\u{1B}[92m",
  brightYellow: "\u{1B}[93m",
  brightBlue: "\u{1B}[94m",
  brightMagenta: "\u{1B}[95m",
  brightCyan: "\u{1B}[96m",
  brightWhite: "\u{1B}[97m",
}

// 将十六进制颜色转换为最接近的ANSI颜色
function hexToAnsi(hex: string): string {
  const colorMap: Record<string, string> = {
    "#6b7280": ansiColors.gray, // debug - 灰色
    "#3b82f6": ansiColors.blue, // info - 蓝色
    "#f59e0b": ansiColors.yellow, // warn - 黄色
    "#ef4444": ansiColors.red, // error - 红色
    "#10b981": ansiColors.green, // success - 绿色
    "#9ca3af": ansiColors.gray, // timestamp - 浅灰色
    "#8b5cf6": ansiColors.magenta, // prefix - 紫色
  }

  return colorMap[hex.toLowerCase()] || ansiColors.white
}

/**
 * 在终端中应用颜色
 */
export function applyNodeColor(text: string, color: string): string {
  if (!color) {
    return text
  }
  const ansiColor = hexToAnsi(color)
  return `${ansiColor}${text}${ansiColors.reset}`
}

/**
 * 在浏览器中应用颜色
 */
export function applyBrowserColor(text: string, color: string): [string, string] {
  return color ? [`%c${text}`, `color: ${color}; font-weight: bold;`] : [text, ""]
}

/**
 * 跨平台颜色应用函数
 */
export function applyColor(text: string, color: string): string | [string, string] {
  return isBrowser ? applyBrowserColor(text, color) : applyNodeColor(text, color)
}
