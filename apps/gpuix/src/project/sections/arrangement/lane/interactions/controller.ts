import type { NativeClipboard } from "@/platform/clipboard"
import type { ArrangementViewport } from "../../core/scene"
import { snapBar } from "@/project/model/grid-geometry"
import { automationBar } from "../../core/automation/geometry"
import { dragStarted, interactionLayer } from "../../core/interactions/layers"
import { edgeScroll } from "../../core/viewport/edge-scroll"
import { hitTest } from "../../core/hit-test"
import { createClipInteractions } from "./clip"
import { createAutomationInteractions } from "./automation"
import { createLaneClipboard } from "./clipboard"
import type {
  LaneContext,
  LaneCursor,
  LaneGesture,
  LaneKey,
  LaneMenuTarget,
  LanePointer,
} from "./types"

export interface LaneInteractionState {
  cursor: LaneCursor
  dragActive: boolean
}

export interface LaneController {
  readonly context: LaneContext
  getSnapshot(): LaneInteractionState
  subscribe(listener: () => void): () => void
  activateClip(clipId: string): boolean
  pointerDown(pointer: LanePointer): void
  pointerMove(pointer: LanePointer, pressed: boolean): void
  pointerUp(pointer: LanePointer): void
  pointerLeave(): void
  interrupt(): void
  doubleClick(pointer: LanePointer): boolean
  contextMenu(pointer: LanePointer): LaneMenuTarget | null
  keyDown(event: LaneKey): boolean
  clipboard(command: "copy" | "cut" | "paste", surface?: "clip" | "automation"): boolean
  step(timestampMs: number): void
  dispose(): void
}

export interface LaneControllerDeps extends LaneContext {
  clipboard: NativeClipboard
  edgePixels: number
  setScroll(x: number, y: number): ArrangementViewport
  markDrawModeGesture?: () => void
}

export function createLaneController(deps: LaneControllerDeps): LaneController {
  const context: LaneContext = { scene: deps.scene, actions: deps.actions, getState: deps.getState }
  const clip = createClipInteractions(context)
  const automation = createAutomationInteractions(context)
  let active: {
    gesture: LaneGesture
    origin: LanePointer
    pointer: LanePointer
    started: boolean
    epoch: string
  } | null = null
  let lastFrame: number | null = null
  let pasteTarget: { trackId: string; bar: number } | null = null
  const clipboard = createLaneClipboard(context, deps.clipboard, () => pasteTarget)
  let interaction: LaneInteractionState = { cursor: "default", dragActive: false }
  const listeners = new Set<() => void>()
  let disposed = false
  function publish(cursor: LaneCursor, dragActive = interaction.dragActive) {
    if (interaction.cursor === cursor && interaction.dragActive === dragActive) return
    interaction = { cursor, dragActive }
    for (const listener of listeners) listener()
  }
  function finish(cancelled: boolean) {
    const current = active
    active = null
    lastFrame = null
    publish("default", false)
    if (!current) return
    if (current.epoch === context.getState().session.editEpoch) current.gesture.finish(cancelled)
    context.scene.setTimeSelectionPreview(null)
  }
  function layer(pointer: LanePointer) {
    const mode = interactionLayer(
      context.scene.get(),
      pointer,
      context.getState().workspace.automationMode
    )
    return mode === "ruler" ? null : mode === "automation" ? automation : clip
  }
  return {
    context,
    getSnapshot: () => interaction,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    activateClip(clipId) {
      if (disposed || active || context.getState().session.preview) return false
      automation.deactivate()
      return clip.activate(clipId)
    },
    pointerDown(pointer: LanePointer) {
      if (disposed || pointer.button !== 0 || active) return
      const owner = layer(pointer)
      if (!owner) return
      const hit = hitTest(
        context.scene.get(),
        pointer.x,
        pointer.y,
        context.getState().workspace.automationMode
      )
      if (hit) {
        const scene = context.scene.get()
        pasteTarget = {
          trackId: hit.track.id,
          bar: snapBar(
            automationBar(scene, pointer.x),
            context.getState().workspace.snap,
            scene.gridPlan.cellBars,
            scene.bars + 1,
            pointer.shiftKey
          ),
        }
      }
      deps.markDrawModeGesture?.()
      const gesture = owner.start(pointer)
      if (owner === clip) automation.deactivate()
      else clip.deactivate()
      if (gesture)
        active = {
          gesture,
          origin: pointer,
          pointer,
          started: false,
          epoch: context.getState().session.editEpoch,
        }
    },
    pointerMove(pointer: LanePointer, pressed: boolean) {
      if (disposed) return
      if (!active) {
        publish(layer(pointer)?.hover(pointer) ?? "default")
        return
      }
      if (active.epoch !== context.getState().session.editEpoch || !pressed) {
        finish(true)
        return
      }
      active.pointer = pointer
      if (!active.started && !dragStarted(active.origin, pointer)) return
      if (!active.started) {
        active.started = true
        publish(interaction.cursor, !!active.gesture.autoScroll)
      }
      active.gesture.move(pointer)
      publish(active.gesture.cursor)
    },
    pointerUp(pointer: LanePointer) {
      if (disposed) return
      if (active && active.epoch !== context.getState().session.editEpoch) {
        finish(true)
        return
      }
      if (active?.started) active.gesture.move(pointer)
      finish(false)
    },
    pointerLeave() {
      if (disposed) return
      if (!active) {
        if (context.scene.get().hoverClip) context.scene.setHover(null)
        publish("default")
      }
    },
    interrupt() {
      finish(true)
    },
    doubleClick(pointer: LanePointer) {
      if (disposed) return false
      if (active) finish(true)
      return layer(pointer)?.doubleClick(pointer) ?? false
    },
    contextMenu(pointer: LanePointer) {
      if (disposed) return null
      if (active) finish(true)
      const target = layer(pointer)?.contextMenu(pointer) ?? null
      const hit = hitTest(
        context.scene.get(),
        pointer.x,
        pointer.y,
        context.getState().workspace.automationMode
      )
      if (hit) {
        const scene = context.scene.get()
        pasteTarget = {
          trackId: hit.track.id,
          bar: snapBar(
            automationBar(scene, pointer.x),
            context.getState().workspace.snap,
            scene.gridPlan.cellBars,
            scene.bars + 1,
            pointer.shiftKey
          ),
        }
      }
      return target
    },
    keyDown(event: LaneKey) {
      if (disposed) return false
      const key = event.key.toLowerCase()
      if (active && key === "escape") {
        finish(true)
        return true
      }
      if (active) return false
      const command = (event.metaKey || event.ctrlKey) && !event.altKey
      if (command && (key === "c" || key === "x" || key === "v"))
        return clipboard(key === "c" ? "copy" : key === "x" ? "cut" : "paste")
      if (context.getState().workspace.automationMode) return automation.keyDown(event)
      if (clip.keyDown(event)) return true
      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        (key === "delete" || key === "backspace")
      ) {
        const ids = context.getState().session.selectedClipIds
        if (!ids.length) return false
        context.actions.deleteClips(ids)
        return true
      }
      return false
    },
    clipboard(command, surface) {
      return !disposed && clipboard(command, surface)
    },
    step(timestampMs: number) {
      const current = active
      if (!current?.started || !current.gesture.autoScroll) {
        lastFrame = null
        return
      }
      if (current.epoch !== context.getState().session.editEpoch) {
        finish(true)
        return
      }
      const scene = context.scene.get()
      const pointer = current.pointer
      const { scrollX, scrollY } = edgeScroll({
        viewport: scene.viewport,
        bars: scene.bars,
        tracks: scene.tracks,
        pointer,
        axis: current.gesture.autoScroll,
        edge: deps.edgePixels,
        elapsed: lastFrame === null ? 0 : timestampMs - lastFrame,
      })
      lastFrame = timestampMs
      if (scrollX !== scene.viewport.scrollX || scrollY !== scene.viewport.scrollY) {
        deps.setScroll(scrollX, scrollY)
        current.gesture.move(pointer)
        publish(current.gesture.cursor)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      finish(true)
      clip.deactivate()
      automation.deactivate()
      listeners.clear()
    },
  }
}
