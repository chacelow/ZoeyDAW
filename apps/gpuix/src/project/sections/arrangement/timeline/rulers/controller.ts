import type { ArrangementPolicy } from "@/project/defaults/arrangement"
import { projectActions, useProjectState } from "@/project/adapters"
import { MIN_CLIP_LENGTH_BARS } from "@/project/model/grid"
import { positionToBar, visibleTracks } from "@/project/model/types"
import { MARKER_RULER_HEIGHT } from "../../core/layout"
import { barAt, movedLoop, rulerBar, rulerHit } from "../../core/rulers/geometry"
import type { TimelineKeyboardInput } from "../keyboard/controller"
import type { ProjectEditToken, SessionState } from "@/project/model/types"
import type { SceneStore } from "../../core/scene"

export interface RulerController {
  readonly active: boolean
  down: (x: number, y: number, shift?: boolean, button?: number) => boolean
  move: (x: number, shift?: boolean) => void
  up: () => void
  cancel: () => void
  doubleClick: (x: number, y: number, shift?: boolean) => boolean
  keyDown: (event: TimelineKeyboardInput) => boolean
  loopSelection: (fallbackBar?: number) => boolean
  dispose: () => void
}

export function createRulerController(
  scene: SceneStore,
  policy: ArrangementPolicy["keyboard"]
): RulerController {
  let gesture: {
    move: (x: number, shift: boolean) => void
    finish: (cancelled: boolean) => void
  } | null = null
  let token: ProjectEditToken | null = null
  let epoch: SessionState["editEpoch"] | null = null

  function finish(cancelled: boolean) {
    const previous = gesture
    gesture = null
    if (epoch === useProjectState.getState().session.editEpoch) previous?.finish(cancelled)
    else finishPreview(true)
    epoch = null
  }
  function finishPreview(cancelled: boolean) {
    const previous = token
    token = null
    if (previous) {
      if (cancelled) projectActions.cancelPreview(previous)
      else projectActions.commitPreview(previous)
    }
  }

  function loopSelection(fallbackBar?: number): boolean {
    const current = scene.get()
    const selected = current.timeSelection ?? useProjectState.getState().session.timeSelection
    const valid = selected && selected.endBar > selected.startBar
    if (!valid && fallbackBar === undefined) return false
    const requested = valid ? selected.startBar : (fallbackBar ?? 1)
    const startBar = Math.max(1, Math.min(current.bars + 1 - MIN_CLIP_LENGTH_BARS, requested))
    const endBar = valid ? selected.endBar : startBar + Math.max(1, current.gridPlan.cellBars)
    projectActions.setLoop({
      enabled: true,
      startBar,
      endBar: Math.max(startBar + MIN_CLIP_LENGTH_BARS, Math.min(current.bars + 1, endBar)),
    })
    scene.setTargetSelection({ kind: "loop" })
    return true
  }

  return {
    get active() {
      return gesture !== null
    },
    loopSelection,
    down(x: number, y: number, shift = false, button = 0) {
      if (button !== 0) return false
      finish(true)
      const current = scene.get()
      const hit = rulerHit(current, { x, y })
      if (!hit) return false
      const state = useProjectState.getState()
      epoch = state.session.editEpoch
      if (hit.kind === "marker") {
        token = projectActions.beginPreview()
        const original =
          state.document.markers.find(marker => marker.id === hit.marker.id) ?? hit.marker
        const source = state.document.markers
        const offset = barAt(current, x) - original.bar
        scene.setTargetSelection({ kind: "marker", id: original.id, phase: "selected" })
        gesture = {
          move(nextX, bypass) {
            if (!token) return
            const view = scene.get()
            const bar = rulerBar(
              view,
              nextX - offset * view.viewport.pxPerBar,
              useProjectState.getState().workspace.snap,
              bypass
            )
            projectActions.previewMarkers(
              token,
              source.map(marker => (marker.id === original.id ? { ...marker, bar } : marker))
            )
          },
          finish: finishPreview,
        }
      } else if (hit.kind === "loop") {
        token = projectActions.beginPreview()
        const original = state.document.transport.loop
        const origin = barAt(current, x)
        let changed = false
        scene.setTargetSelection({ kind: "loop" })
        gesture = {
          move(nextX, bypass) {
            const view = scene.get()
            const delta = barAt(view, nextX) - origin
            const anchor = hit.edge === "end" ? original.endBar : original.startBar
            const bar = rulerBar(
              view,
              (anchor + delta - 1) * view.viewport.pxPerBar - view.viewport.scrollX,
              useProjectState.getState().workspace.snap,
              bypass
            )
            const loop = movedLoop(original, hit.edge, bar - anchor, view.bars + 1)
            changed = loop.startBar !== original.startBar || loop.endBar !== original.endBar
            if (!token) return
            projectActions.previewLoop(token, loop)
          },
          finish(cancelled) {
            finishPreview(cancelled || !changed)
            if (!cancelled && !changed && hit.edge === "body") {
              const selection = {
                startBar: original.startBar,
                endBar: original.endBar,
                trackIds: visibleTracks(useProjectState.getState().document.tracks)
                  .filter(track => track.kind === "audio" || track.kind === "midi")
                  .map(track => track.id),
              }
              projectActions.setTimeSelection(selection)
            }
          },
        }
      } else {
        const original = positionToBar(state.session.position, state.document.transport.numerator)
        const insertion = state.session.insertionPoint
        projectActions.seekBar(rulerBar(current, x, state.workspace.snap, shift))
        gesture = {
          move(nextX, bypass) {
            projectActions.seekBar(
              rulerBar(scene.get(), nextX, useProjectState.getState().workspace.snap, bypass)
            )
          },
          finish(cancelled) {
            if (cancelled) projectActions.restoreSeek(original, insertion)
          },
        }
      }
      return true
    },
    move(x: number, shift = false) {
      if (!gesture) return
      if (epoch !== useProjectState.getState().session.editEpoch) {
        finish(true)
        return
      }
      gesture?.move(x, shift)
    },
    up() {
      finish(false)
    },
    cancel() {
      finish(true)
    },
    doubleClick(x: number, y: number, shift = false) {
      finish(false)
      const current = scene.get()
      const hit = rulerHit(current, { x, y })
      if (!hit) return false
      if (hit.kind === "marker") {
        projectActions.seekBar(hit.marker.bar)
        if (!useProjectState.getState().session.playing) projectActions.togglePlay()
        scene.setTargetSelection({ kind: "marker", id: hit.marker.id, phase: "selected" })
      } else if (hit.kind === "loop") {
        projectActions.setLoop({ enabled: !current.loop.enabled })
        scene.setTargetSelection({ kind: "loop" })
      } else if (y < MARKER_RULER_HEIGHT) {
        const id = projectActions.addMarker(
          rulerBar(current, x, useProjectState.getState().workspace.snap, shift)
        )
        if (id) scene.setTargetSelection({ kind: "marker", id, phase: "selected" })
      } else return false
      return true
    },
    keyDown(event: TimelineKeyboardInput) {
      const key = event.key?.toLowerCase()
      const current = scene.get()
      const selected = current.targetSelection
      const state = useProjectState.getState()
      if (event.modifiers?.ctrl || event.modifiers?.cmd) {
        if (key === "l") {
          if (!loopSelection()) projectActions.setLoop({ enabled: !current.loop.enabled })
          scene.setTargetSelection({ kind: "loop" })
          return true
        }
        if (key !== "r" || selected.kind !== "marker") return false
        scene.setTargetSelection({ ...selected, phase: "renaming" })
        return true
      }
      if (selected.kind !== "marker" && selected.kind !== "loop") return false
      if (key === "escape") {
        finish(true)
        scene.setTargetSelection({ kind: "none" })
      } else if ((key === "delete" || key === "backspace") && selected.kind === "marker") {
        projectActions.deleteMarker(selected.id)
        scene.setTargetSelection({ kind: "none" })
      } else if ((key === "f2" || key === "enter") && selected.kind === "marker") {
        scene.setTargetSelection({ ...selected, phase: "renaming" })
      } else if (key === "left" || key === "right") {
        const step = state.workspace.snap ? current.gridPlan.cellBars : policy.markerNudgeBars
        const delta = key === "right" ? step : -step
        if (selected.kind === "loop") {
          projectActions.setLoop(
            movedLoop(state.document.transport.loop, "body", delta, current.bars + 1)
          )
        } else {
          const marker = state.document.markers.find(item => item.id === selected.id)
          if (!marker) return false
          projectActions.updateMarker(marker.id, {
            bar: Math.max(1, Math.min(current.bars + 1, marker.bar + delta)),
          })
        }
      } else return false
      return true
    },
    dispose() {
      finish(true)
    },
  }
}
