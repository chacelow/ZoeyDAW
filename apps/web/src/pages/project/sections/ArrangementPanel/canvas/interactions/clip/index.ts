import { acceptsClip, positionToBar } from "@zoeydaw/project-core/types"
import { CLIP_CLIPBOARD_TYPE, parseClipClipboard } from "@zoeydaw/project-core/clip-clipboard"
import { hitTest } from "@/pages/project/sections/ArrangementPanel/canvas/hit-test"
import { arrangementBodyTop } from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import { barAtX, snappedBar } from "../coordinates"
import { createMoveGesture } from "./move"
import { createResizeGesture } from "./resize"
import { createFadeGesture } from "./fade"
import { createTimeRangeGesture } from "./timeRange"
import type { CanvasInteraction, CanvasMenuTarget, InteractionContext } from "../types"

export function createClipInteractions(context: InteractionContext): CanvasInteraction {
  const { scene, actions } = context
  let isOwnedTarget = false
  let pasteTarget: { trackId: string; bar: number } | null = null
  function select(ids: string[]) {
    scene.setSelection(new Set(ids))
    actions.selectClips(ids)
  }
  function selection() {
    return context.getState().session.selectedClipIds
  }
  function split(ids: string[]) {
    const state = context.getState()
    const bar =
      state.session.timeSelection?.startBar ??
      positionToBar(state.session.position, state.document.transport.numerator)
    if (
      ids.every(id => {
        return !state.document.tracks.some(track =>
          track.clips.some(
            clip => clip.id === id && bar > clip.startBar && bar < clip.startBar + clip.lengthBars
          )
        )
      })
    ) {
      return
    }

    actions.beginEdit()
    actions.splitClips(ids, bar)
    actions.endEdit()
  }
  function resolvePaste() {
    const state = context.getState()
    if (pasteTarget) {
      return pasteTarget
    }
    const range = state.session.timeSelection
    const rangeTrack =
      range &&
      state.document.tracks.find(
        lane => range.trackIds.includes(lane.id) && (lane.kind === "audio" || lane.kind === "midi")
      )
    if (rangeTrack && range) return { trackId: rangeTrack.id, bar: range.startBar }
    const insertion = state.session.insertionPoint
    if (insertion && insertion.trackId !== null) {
      return { trackId: insertion.trackId, bar: insertion.bar }
    }
    const selected = new Set(selection())
    const track =
      state.document.tracks.find(lane => lane.clips.some(clip => selected.has(clip.id))) ??
      state.document.tracks.find(lane => state.session.timeSelection?.trackIds.includes(lane.id)) ??
      state.document.tracks.find(lane => state.session.selectedTrackIds.includes(lane.id))
    return track
      ? {
          trackId: track.id,
          bar:
            state.session.timeSelection?.startBar ??
            insertion?.bar ??
            positionToBar(state.session.position, state.document.transport.numerator),
        }
      : null
  }
  function paste(raw?: string) {
    const target = resolvePaste()
    const parsed = raw === undefined ? actions.getClipClipboard() : parseClipClipboard(raw)
    if (!target || !parsed) {
      return false
    }
    actions.beginEdit()
    const done = actions.pasteClips(target.trackId, target.bar, parsed)
    actions.endEdit()
    if (done) {
      scene.setSelection(new Set(context.getState().session.selectedClipIds))
      scene.setTimeSelection(context.getState().session.timeSelection)
      scene.setTargetSelection({ kind: "none" })
    }
    return done
  }
  return {
    start(pointer) {
      const hit = hitTest(
        scene.get(),
        pointer.x,
        pointer.y,
        context.getState().workspace.automationMode
      )
      if (!hit) {
        if (pointer.y >= 0 && pointer.y < arrangementBodyTop()) {
          return null
        }
        select([])
        scene.setTargetSelection({ kind: "none" })
        isOwnedTarget = true
        return null
      }
      actions.selectTracks([hit.track.id], "arrangement")
      pasteTarget = null
      if ("clip" in hit) {
        const additive = pointer.shiftKey || pointer.metaKey || pointer.ctrlKey
        const current = selection()
        const next = additive
          ? current.includes(hit.clip.id)
            ? current.filter(id => id !== hit.clip.id)
            : [...current, hit.clip.id]
          : current.includes(hit.clip.id)
            ? current
            : [hit.clip.id]
        select(next)
        if (next.includes(hit.clip.id)) {
          scene.setTargetSelection({ kind: "clip", id: hit.clip.id, phase: "selected" })
        } else {
          scene.setTargetSelection({ kind: "none" })
        }
        isOwnedTarget = true
        if (hit.kind === "clip-title" || hit.kind === "clip-resize") {
          actions.setTimeSelection(null)
          scene.setTimeSelection(null)
          actions.setInsertionPoint({ trackId: hit.track.id, bar: hit.clip.startBar })
        }
        if (hit.kind === "clip-title" && !additive && next.includes(hit.clip.id)) {
          return createMoveGesture(context, pointer, hit.track, hit.clip.id, [
            hit.clip.id,
            ...next.filter(id => id !== hit.clip.id),
          ])
        }
        if (hit.kind === "clip-body" && !additive) {
          return createTimeRangeGesture(context, pointer, hit.track.id)
        }
        if (hit.kind === "clip-resize") {
          return createResizeGesture(context, pointer, hit.clip, hit.edge)
        }
        return hit.kind === "clip-fade" && hit.clip.kind === "audio"
          ? createFadeGesture(context, pointer, hit.clip, hit.edge, hit.handle)
          : null
      }
      select([])
      scene.setTargetSelection({ kind: "none" })
      isOwnedTarget = true
      return createTimeRangeGesture(context, pointer, hit.track.id)
    },
    hover(pointer) {
      const hit = hitTest(
        scene.get(),
        pointer.x,
        pointer.y,
        context.getState().workspace.automationMode
      )
      if (hit && "clip" in hit) {
        const region =
          hit.kind === "clip-title" ? "title" : hit.kind === "clip-resize" ? hit.region : "body"
        if (scene.get().hoverClip?.id !== hit.clip.id || scene.get().hoverClip?.region !== region) {
          scene.setHover({ id: hit.clip.id, region })
        }
      } else {
        scene.setHover(null)
      }
      return hit?.kind === "clip-resize" || (hit?.kind === "clip-fade" && hit.handle !== "curve")
        ? hit.kind === "clip-resize"
          ? hit.edge === "left"
            ? "brace-left"
            : "brace-right"
          : "ew-resize"
        : hit?.kind === "clip-fade"
          ? "move"
          : hit?.kind === "clip-title"
            ? "grab"
            : undefined
    },
    doubleClick(pointer) {
      const hit = hitTest(
        scene.get(),
        pointer.x,
        pointer.y,
        context.getState().workspace.automationMode
      )
      if (!hit) {
        return false
      }
      if ("clip" in hit) {
        select([hit.clip.id])
        scene.setTargetSelection({ kind: "clip", id: hit.clip.id, phase: "selected" })
        isOwnedTarget = true
        return true
      }
      if (hit.track.kind !== "audio" && hit.track.kind !== "midi") {
        return false
      }
      const { kind } = hit.track
      const id = actions.createClip(
        hit.track.id,
        kind,
        snappedBar(context, hit.bar),
        scene.get().gridPlan.cellBars
      )
      if (id) {
        select([id])
        actions.setEditingClip(id)
      }
      return true
    },
    keyDown(event) {
      const state = context.getState()
      const ids = selection()
      const command = (event.metaKey || event.ctrlKey) && !event.altKey
      const key = event.key.toLowerCase()
      if (
        !command &&
        !event.altKey &&
        (key === "delete" || key === "backspace") &&
        state.session.timeSelection
      ) {
        actions.beginEdit()
        actions.deleteTimeSelection(state.session.timeSelection)
        actions.endEdit()
        scene.setSelection(new Set(context.getState().session.selectedClipIds))
        scene.setTargetSelection({ kind: "none" })
        return true
      }
      if (
        command &&
        event.ctrlKey &&
        !event.metaKey &&
        /Mac|iPhone|iPad/.test(navigator.platform)
      ) {
        if (key === "c") return !!actions.copyClips(ids, state.session.timeSelection ?? undefined)
        if (key === "x") {
          actions.beginEdit()
          const copied = actions.cutClips(ids, state.session.timeSelection ?? undefined)
          actions.endEdit()
          if (copied) scene.setSelection(new Set())
          return !!copied
        }
        if (key === "v") return paste()
      }
      if (command && key === "a") {
        actions.setTimeSelection(null)
        scene.setTimeSelection(null)
        select(state.document.tracks.flatMap(track => track.clips.map(clip => clip.id)))
        return true
      }
      if (command && key === "d" && ids.length) {
        actions.beginEdit()
        actions.duplicateClips(ids)
        actions.endEdit()
        scene.setSelection(new Set(selection()))
        return true
      }
      if (command && key === "e" && ids.length) {
        split(ids)
        return true
      }
      if (command && key === "r" && ids.length) {
        scene.setTargetSelection({ kind: "clip", id: ids[0], phase: "renaming" })
        return true
      }
      if (command && (key === "c" || key === "x" || key === "v")) {
        return false
      }
      // `0` toggles mute on the selected clips, matching the transport's
      // deactivate convention.
      if (!command && !event.altKey && key === "0" && !event.shiftKey && ids.length) {
        const muted = !state.document.tracks
          .flatMap(track => track.clips)
          .filter(clip => ids.includes(clip.id))
          .every(clip => clip.mute)
        actions.beginEdit()
        for (const id of ids) actions.updateClip(id, { mute: muted })
        actions.endEdit()
        return true
      }
      return false
    },
    copy(event) {
      const data = actions.copyClips(
        selection(),
        context.getState().session.timeSelection ?? undefined
      )
      if (!data || !event.clipboardData) {
        return false
      }
      event.clipboardData.setData(CLIP_CLIPBOARD_TYPE, JSON.stringify(data))
      event.clipboardData.setData("text/plain", JSON.stringify(data))
      return true
    },
    cut(event) {
      const ids = selection()
      const data = actions.copyClips(ids, context.getState().session.timeSelection ?? undefined)
      if (!data || !event.clipboardData) {
        return false
      }
      event.clipboardData.setData(CLIP_CLIPBOARD_TYPE, JSON.stringify(data))
      event.clipboardData.setData("text/plain", JSON.stringify(data))
      actions.beginEdit()
      actions.cutClips(ids, context.getState().session.timeSelection ?? undefined)
      actions.endEdit()
      scene.setSelection(new Set())
      return true
    },
    paste(event) {
      const clipboard = event.clipboardData
      if (!clipboard) {
        return paste()
      }
      const raw = clipboard.getData(CLIP_CLIPBOARD_TYPE) || clipboard.getData("text/plain")
      return raw ? paste(raw) || raw.includes('"kind":"clips"') : false
    },
    contextMenu(pointer): CanvasMenuTarget | null {
      const hit = hitTest(
        scene.get(),
        pointer.x,
        pointer.y,
        context.getState().workspace.automationMode
      )
      if (!hit) {
        return null
      }
      pasteTarget = { trackId: hit.track.id, bar: snappedBar(context, barAtX(context, pointer.x)) }
      if ("clip" in hit) {
        const current = selection()
        const ids = current.includes(hit.clip.id) ? current : [hit.clip.id]
        select(ids)
        scene.setTargetSelection({ kind: "clip", id: hit.clip.id, phase: "selected" })
        isOwnedTarget = true
        return { kind: "clip", clipId: hit.clip.id, clipIds: ids }
      }
      return acceptsClip(hit.track.kind, "audio") || acceptsClip(hit.track.kind, "midi")
        ? { kind: "clip-lane", ...pasteTarget }
        : null
    },
    deactivate() {
      scene.setHover(null)
      if (isOwnedTarget && scene.get().targetSelection.kind === "clip") {
        scene.setTargetSelection({ kind: "none" })
      }
      isOwnedTarget = false
    },
  }
}
