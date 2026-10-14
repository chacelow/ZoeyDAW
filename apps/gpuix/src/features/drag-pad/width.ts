/**
 * Compact-width reservation for DragPadNumber.
 *
 * gpuix exposes no text-measurement API to JS (no `measureText`, no
 * ghost-DOM layout query), unlike the browser `DragPadNumber` this mirrors,
 * which sizes itself from a real measured sample (see
 * `packages/ui/src/controls/DragPad/AutoWidthText.tsx` in the Web app).
 * Here the width is a character-count estimate against the theme's
 * monospace-ish numeric font, computed once from `format(min)`/`format(max)`
 * (and an optional default), not from the current draft — so the control
 * never resizes as the displayed digit count changes.
 */
import { CHAR_WIDTH_RATIO } from "./constants"

export interface ControlWidthInput {
  samples: string[]
  fontSize: number
  iconSize: number
  iconGap: number
  paddingX: number
}

export function estimateControlWidth({
  samples,
  fontSize,
  iconSize,
  iconGap,
  paddingX,
}: ControlWidthInput): number {
  const maxChars = samples.reduce((widest, sample) => Math.max(widest, sample.length), 0)
  const textWidth = Math.ceil(maxChars * fontSize * CHAR_WIDTH_RATIO)
  return Math.round(iconSize + iconGap + textWidth + paddingX * 2)
}
