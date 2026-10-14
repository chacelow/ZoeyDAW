import { Icon } from "../Icon"

/** Default DragPad glyph: a chevrons-up-down affordance hinting at vertical scrub. */
export interface DragPadIconProps {
  size: number
  color: string
}

export function DragPadIcon({ size, color }: DragPadIconProps) {
  return <Icon name="ChevronsUpDown" size={size} color={color} />
}
