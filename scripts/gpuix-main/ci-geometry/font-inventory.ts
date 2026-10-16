import { execFileSync } from "node:child_process"
import { arch, release } from "node:os"

export function fontInventory() {
  const raw: unknown = JSON.parse(
    execFileSync("/usr/sbin/system_profiler", ["SPFontsDataType", "-json"], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    })
  )
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("SPFontsDataType" in raw) ||
    !Array.isArray(raw.SPFontsDataType)
  )
    throw new Error("Unexpected system_profiler font inventory")
  const fonts: readonly unknown[] = raw.SPFontsDataType
  const families = new Set<string>()
  for (const font of fonts) {
    if (
      typeof font !== "object" ||
      font === null ||
      !("typefaces" in font) ||
      !Array.isArray(font.typefaces)
    )
      continue
    const faces: readonly unknown[] = font.typefaces
    for (const face of faces) {
      if (
        typeof face === "object" &&
        face !== null &&
        "family" in face &&
        typeof face.family === "string" &&
        "enabled" in face &&
        face.enabled === "yes"
      )
        families.add(face.family)
    }
  }
  return {
    event: "font-inventory",
    os: release(),
    arch: arch(),
    families: [...families].sort((left, right) => left.localeCompare(right)),
  }
}
