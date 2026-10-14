/**
 * Default DragPad glyph: a chevrons-up-down affordance hinting at vertical
 * scrub. Hand-authored inline markup (no icon package dependency — adding
 * one is a new npm dependency, out of scope for this slice) rendered
 * through gpuix's native `<svg source>`, which paints raw SVG markup
 * directly instead of a DOM node tree.
 */

const DRAG_PAD_ICON_SOURCE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M7 15l5 5 5-5"/><path d="M7 9l5-5 5 5"/></svg>'

export interface DragPadIconProps {
  size: number
  color: string
}

export function DragPadIcon({ size, color }: DragPadIconProps) {
  return (
    <svg
      source={DRAG_PAD_ICON_SOURCE}
      aria-hidden="true"
      style={{ width: size, height: size, color }}
    />
  )
}
