import { converter, parse } from "culori"
import type { ColorScheme } from "@/shared/theme/colors"
import { mapVSCodeColors } from "@/shared/theme/vscode-colors"
import type { CustomTheme } from "./model"

type ImportResult =
  | { readonly ok: true; readonly theme: CustomTheme; readonly unresolvedInclude: boolean }
  | { readonly ok: false }

function parseJSONC(text: string): unknown {
  let json = ""
  let quoted = false
  for (let index = text.charCodeAt(0) === 0xfeff ? 1 : 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      json += char
      if (char === "\\") json += text[++index] ?? ""
      else if (char === '"') quoted = false
    } else if (char === '"') {
      quoted = true
      json += char
    } else if (char === "/" && text[index + 1] === "/") {
      while (index + 1 < text.length && !/[\r\n]/.test(text[index + 1])) index++
      json += " "
    } else if (char === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2)
      if (end === -1) throw new SyntaxError("Unterminated JSONC comment")
      index = end + 1
      json += " "
    } else json += char
  }
  let normalized = ""
  quoted = false
  for (let index = 0; index < json.length; index++) {
    const char = json[index]
    if (quoted) {
      normalized += char
      if (char === "\\") normalized += json[++index] ?? ""
      else if (char === '"') quoted = false
    } else if (char === '"') {
      quoted = true
      normalized += char
    } else if (
      char === "," &&
      /^\s*[}\]]/.test(json.slice(index + 1)) &&
      !/[\[{:,]$/.test(normalized.trimEnd())
    ) {
      normalized += " "
    } else normalized += char
  }
  return JSON.parse(normalized)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function colorScheme(type: unknown, colors: Record<string, unknown>): ColorScheme | null {
  if (type === "light" || type === "hcLight") return "light"
  if (type === "dark" || type === "hc" || type === "hcDark") return "dark"
  if (type !== undefined) return null
  const background = colors["editor.background"]
  const color = typeof background === "string" ? parse(background) : undefined
  return color && converter("oklab")(color).l > 0.6 ? "light" : "dark"
}

export function importVSCodeTheme(
  json: string,
  identity: { readonly id: CustomTheme["id"]; readonly fallbackName: string }
): ImportResult {
  try {
    const input = parseJSONC(json)
    if (!isObject(input) || (input.colors !== undefined && !isObject(input.colors))) return { ok: false }
    if (input.include !== undefined && typeof input.include !== "string") return { ok: false }
    if (!isObject(input.colors) && typeof input.include !== "string") return { ok: false }
    const colors = isObject(input.colors) ? input.colors : {}
    const scheme = colorScheme(input.type, colors)
    if (!scheme) return { ok: false }
    return {
      ok: true,
      unresolvedInclude: typeof input.include === "string" && input.include.length > 0,
      theme: {
        id: identity.id,
        name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : identity.fallbackName,
        basePreset: "vscode-modern",
        colors: { light: {}, dark: {}, [scheme]: mapVSCodeColors(colors) },
        design: {},
        control: { default: {}, transport: {} },
        project: {},
      },
    }
  } catch {
    return { ok: false }
  }
}
