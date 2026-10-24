import { TRACK_TITLE_HEIGHT } from "@/pages/project/layout"

/**
Resize cursors for horizontal drags. They are drawn as square brackets whose
height matches the clip title band, so every left/right resize affordance —
clip edges, minimap edges, group-title drag — uses one cursor at one size.
Browsers cannot scale a CSS `cursor` image, so the data URL is built once from
the measured title height and exposed as a custom property.
*/
function bracketDataUrl(side: "left" | "right", height: number): string {
  const width = Math.max(8, Math.round(height * 0.62))
  const stroke = Math.max(1.2, height * 0.09)
  const inset = stroke / 2 + 0.5
  const x = side === "left" ? width - inset : inset
  const tip = side === "left" ? inset : width - inset
  const top = inset
  const bottom = height - inset
  const path = `M${x} ${top}H${tip}V${bottom}H${x}`
  // The data URL is wrapped in `url("…")`, so the SVG must not contain bare
  // double quotes: they closed the URL string and made the whole cursor
  // declaration invalid, silently falling back to the system cursor.
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'>` +
    `<path d='${path}' fill='none' stroke='%23000' stroke-width='${(stroke + 1.6).toFixed(2)}'/>` +
    `<path d='${path}' fill='none' stroke='%23fff' stroke-width='${stroke.toFixed(2)}'/>` +
    `</svg>`
  return `url("data:image/svg+xml;utf8,${svg}") ${Math.round(width / 2)} ${Math.round(height / 2)}`
}

export function installBraceCursors(height = TRACK_TITLE_HEIGHT): void {
  const root = document.documentElement
  root.style.setProperty("--arrangement-brace-left-cursor", bracketDataUrl("left", height))
  root.style.setProperty("--arrangement-brace-right-cursor", bracketDataUrl("right", height))
}
