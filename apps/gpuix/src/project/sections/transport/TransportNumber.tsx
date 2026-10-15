import { DragPadNumber } from "@/ui/controls"
import { useProjectEditGesture } from "../../adapters"
import type { DragPadNumberProps } from "@/ui/controls"

export function TransportNumber({ onChange, ...props }: DragPadNumberProps) {
  const gesture = useProjectEditGesture(onChange)
  return <DragPadNumber {...props} {...gesture} size="transport" />
}
