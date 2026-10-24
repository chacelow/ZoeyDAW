import type { Device } from "@zoeydaw/project-core/devices"
import type { DragEvent, KeyboardEvent } from "react"

export interface DeviceCardProps {
  readonly trackId: string
  readonly device: Device
  readonly selected: boolean
  readonly first: boolean
  readonly last: boolean
  readonly dragging: boolean
  readonly onSelect: () => void
  readonly onToggle: () => void
  readonly dropTarget: boolean
  readonly onFold: () => void
  readonly onDelete: () => void
  readonly onMove: (direction: -1 | 1) => void
  readonly onDragStart: (event: DragEvent<HTMLElement>) => void
  readonly onDragOver: (event: DragEvent<HTMLElement>) => void
  readonly onDrop: (event: DragEvent<HTMLElement>) => void
  readonly onDragEnd: () => void
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}
