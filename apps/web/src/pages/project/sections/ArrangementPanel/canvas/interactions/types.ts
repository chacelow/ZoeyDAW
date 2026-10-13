import type { ProjectState } from "@/pages/project/model/types"
import type { projectActions } from "@/pages/project/adapters"
import type { GestureCursor } from "@/pages/project/sections/ArrangementPanel/useGestureCursor"
import type { SceneStore } from "../scene"

export interface CanvasPointer {
  x: number
  y: number
  clientX: number
  clientY: number
  pointerId: number
  button: number
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}

export type CanvasMenuTarget =
  | { kind: "clip"; clipId: string; clipIds: readonly string[] }
  | { kind: "clip-lane"; trackId: string; bar: number }
  | { kind: "marker"; markerId: string }
  | { kind: "loop" }
  | { kind: "ruler"; bar: number }
  | { kind: "automation-point"; trackId: string; laneId: string; pointId: string }
  | {
      kind: "automation-segment"
      trackId: string
      laneId: string
      fromPointId: string
      bar: number
      value: number
    }
  | { kind: "automation-lane"; trackId: string; laneId: string; bar: number; value: number }

export interface CanvasGesture {
  cursor: GestureCursor
  autoScroll: false | "horizontal" | "both"
  commitOnInterrupt?: boolean
  move(pointer: CanvasPointer): void
  finish(cancelled: boolean): void
}

export interface InteractionContext {
  element: HTMLElement
  scene: SceneStore
  actions: typeof projectActions
  getState(): ProjectState
}

export interface CanvasInteraction {
  start(pointer: CanvasPointer): CanvasGesture | null
  hover(pointer: CanvasPointer): string | undefined
  doubleClick(pointer: CanvasPointer): boolean
  keyDown(event: KeyboardEvent): boolean
  contextMenu(pointer: CanvasPointer): CanvasMenuTarget | null
  copy?(event: ClipboardEvent): boolean
  cut?(event: ClipboardEvent): boolean
  paste?(event: ClipboardEvent): boolean
  deactivate(): void
  dispose?(): void
}
