import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { expect, it } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { createSceneStore } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import { arrangementBodyTop } from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import { createResizeGesture } from "./resize"
import type { AudioClip } from "@zoeydaw/project-core/types"
import type { CanvasPointer } from "../types"

it.each([false, true])(
  "keeps resize subtraction identities stable through commit/cancel (%s)",
  cancelled => {
    const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
    const track = document.tracks.find(track => track.kind === "audio")!
    const neighbour: AudioClip = {
      id: "neighbour",
      kind: "audio",
      startBar: 1,
      lengthBars: 12,
      sourceOffsetBars: -2,
      sourceId: null,
      gainDb: 0,
    }
    const resized: AudioClip = { ...neighbour, id: "resized", startBar: 5, lengthBars: 3 }
    track.clips = [neighbour, resized]
    hydrateProject(
      JSON.stringify({
        version: 3,
        document,
        workspace: { ...createMockWorkspace(), grid: { mode: "fixed", bars: 1 } },
      })
    )
    const state = useProjectState.getState()
    const before = state.document
    const scene = createSceneStore()
    scene.setMusic({
      bars: 128,
      grid: state.workspace.grid,
      transport: state.document.transport,
      media: state.document.media,
      patterns: state.document.patterns,
      tracks: state.document.tracks,
      markers: state.document.markers,
      loop: state.document.transport.loop,
    })
    scene.setViewport({ pxPerBar: 24, scrollX: 0, scrollY: 0, width: 1000, height: 900, dpr: 1 })
    const pointer: CanvasPointer = {
      x: 96,
      y: arrangementBodyTop() + 4,
      clientX: 96,
      clientY: 0,
      pointerId: 1,
      button: 0,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      ctrlKey: false,
    }
    const context = {
      element: window.document.createElement("div"),
      scene,
      actions: projectActions,
      getState: useProjectState.getState,
    }
    const gesture = createResizeGesture(context, pointer, resized, "left")!
    gesture.move({ ...pointer, x: 72 })
    const first = scene.get().previewTracks?.find(item => item.id === track.id)!.clips
    expect(first?.map(clip => [clip.startBar, clip.lengthBars])).toEqual([
      [1, 3],
      [8, 5],
      [4, 4],
    ])
    gesture.move({ ...pointer, x: 48 })
    expect(
      scene
        .get()
        .previewTracks?.find(item => item.id === track.id)!
        .clips.map(clip => clip.id)
    ).toEqual(first?.map(clip => clip.id))
    const final = scene.get().previewTracks
    gesture.finish(cancelled)
    if (cancelled) {
      expect(useProjectState.getState().document).toBe(before)
      expect(useProjectState.getState().session.canUndo).toBe(false)
    } else {
      expect(useProjectState.getState().document.tracks).toEqual(final)
      projectActions.undo()
      expect(useProjectState.getState().document).toBe(before)
    }
  }
)
