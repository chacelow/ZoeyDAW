import type { ArrangementPolicy } from "@/project/defaults/arrangement"
import type { projectActions } from "@/project/adapters"
import type { ProjectState } from "@/project/model/types"
import type { SceneStore } from "../../core/scene"

export interface LanePointer {
  x: number
  y: number
  button: number
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}

export interface LaneKey {
  key: string
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
  ctrlKey: boolean
  repeat: boolean
}

export interface LaneContext {
  scene: SceneStore
  readPolicy: () => ArrangementPolicy
  actions: typeof projectActions
  getState: () => ProjectState
}

export type LaneCursor =
  | "default"
  | "grab"
  | "grabbing"
  | "disabled"
  | "horizontalResize"
  | "fadeCurve"
  | "automationDraw"
  | "verticalResize"

export interface LaneGesture {
  readonly cursor: LaneCursor
  readonly autoScroll: false | "horizontal" | "both"
  move(pointer: LanePointer): void
  finish(cancelled: boolean): void
}

export type LaneMenuTarget =
  | { kind: "clip"; clipId: string; clipIds: readonly string[] }
  | { kind: "clip-lane"; trackId: string; bar: number }
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

export interface LaneInteraction {
  start(pointer: LanePointer): LaneGesture | null
  hover(pointer: LanePointer): LaneCursor | undefined
  doubleClick(pointer: LanePointer): boolean
  keyDown(event: LaneKey): boolean
  contextMenu(pointer: LanePointer): LaneMenuTarget | null
  deactivate(): void
}
