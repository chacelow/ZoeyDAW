import { Icon } from "../Icon"

export interface DragPadIconProps {
  size: number
  color: string
}

export function DragPadIcon({ size, color }: DragPadIconProps) {
  return <Icon name="ChevronsUpDown" size={size} color={color} />
}
