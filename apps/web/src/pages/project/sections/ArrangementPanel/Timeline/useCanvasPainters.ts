import { useEffect } from "react"
import { useProjectState } from "@/pages/project/adapters"
import { readNativeAudioStatus, subscribeNativeAudioStatus } from "@/shared/native/audio"
import { cachedWaveformRanges } from "@/pages/project/adapters/backend/waveform-ranges"
import { arrangementScene } from "../canvas/scene"
import { arrangementScheduler } from "../canvas/scheduler"
import { arrangementPlayhead } from "../canvas/audio/playhead-projection"
import { attachProjectTelemetry } from "../canvas/audio/project-telemetry"
import { paintGrid } from "../canvas/painters/grid"
import { paintClips } from "../canvas/painters/clip"
import { paintRecording } from "../canvas/painters/recording"
import { paintAutomation } from "../canvas/painters/automation"
import { paintClipAlignment, paintGuides, paintPlayhead } from "../canvas/painters/playhead"
import { createInsertionPulse } from "../canvas/painters/insertion-pulse"
import { gridTokens, readThemeStamp, readTokens } from "../canvas/tokens"
import type { RefObject } from "react"

const SCENE_ID = "arrangement-scene"
const PLAYHEAD_ID = "arrangement-playhead"

function sizeCanvas(canvas: HTMLCanvasElement, rect: DOMRect, dpr: number) {
  const width = Math.round(rect.width * dpr)
  const height = Math.round(rect.height * dpr)
  if (canvas.width !== width) {
    canvas.width = width
  }
  if (canvas.height !== height) {
    canvas.height = height
  }
}

/**
Scene and overlay painters share measured dimensions but independent invalidation.
*/
export function useCanvasPainters(
  bodyReference: RefObject<HTMLDivElement | null>,
  canvasReference: RefObject<HTMLCanvasElement | null>,
  playheadReference: RefObject<HTMLCanvasElement | null>
) {
  useEffect(() => attachProjectTelemetry(arrangementPlayhead), [])
  useEffect(() => {
    const body = bodyReference.current
    const canvas = canvasReference.current
    const playhead = playheadReference.current
    if (!body || !canvas || !playhead) {
      return
    }
    const context = canvas.getContext("2d")
    const playheadContext = playhead.getContext("2d")
    if (!context || !playheadContext) {
      return
    }

    let disposed = false
    let tokens = readTokens(body)
    let themeStamp = readThemeStamp()
    let insertionColor = createInsertionPulse(tokens["--primary"], tokens["--foreground"])
    let insertion = arrangementScene.get().playback.insertionPoint
    let insertionAt = performance.now()
    let retainedRecording = readNativeAudioStatus().recordingPreview
    const paintScene = () => {
      const scene = arrangementScene.get()
      paintGrid(context, scene, gridTokens(tokens, scene.loop.enabled))
      paintClips(context, scene, tokens, {
        selectedClipIds: scene.selectedClipIds,
        hoverClip: scene.hoverClip,
        automationMode: useProjectState.getState().workspace.automationMode,
      })
      const sessionId = useProjectState.getState().session.backend.sessionId
      const preview = readNativeAudioStatus().recordingPreview
      if (preview?.sessionId === sessionId) retainedRecording = preview
      if (retainedRecording?.sessionId !== sessionId) retainedRecording = null
      if (
        retainedRecording &&
        !preview &&
        retainedRecording.tracks.every(take => {
          const clip = scene.tracks
            .find(track => track.id === take.trackId)
            ?.clips.find(clip => clip.id === take.clipId)
          const source =
            clip?.kind === "audio"
              ? scene.media.find(source => source.id === clip.sourceId)
              : undefined
          return !clip || (source && cachedWaveformRanges(source).length > 0)
        })
      )
        retainedRecording = null
      paintRecording(context, scene, tokens, retainedRecording)
      if (useProjectState.getState().workspace.automationMode) {
        paintAutomation(context, scene, {
          stroke: tokens["--arrangement-automation"],
          fill: tokens["--arrangement-automation"],
        })
      }
    }
    const paintPlayheadLayer = () => {
      const scene = arrangementScene.get()
      if (scene.playback.insertionPoint !== insertion) {
        insertion = scene.playback.insertionPoint
        insertionAt = performance.now()
      }
      // paintPlayhead clears the overlay, so guides must come after it.
      paintPlayhead(playheadContext, scene, arrangementPlayhead, {
        primary: tokens["--primary"],
        recording: tokens["--arrangement-automation"] || tokens["--primary"],
        insertion: insertionColor(performance.now() - insertionAt),
      })
      paintGuides(playheadContext, scene, { line: gridTokens(tokens, scene.loop.enabled).guide })
      paintClipAlignment(playheadContext, scene, tokens["--muted-foreground"])
      const insertionX = insertion
        ? (insertion.bar - 1) * scene.viewport.pxPerBar - scene.viewport.scrollX
        : -1
      if (
        scene.playback.playing ||
        (insertion && insertionX >= 0 && insertionX <= scene.viewport.width)
      ) {
        arrangementScheduler.invalidate(PLAYHEAD_ID)
      }
    }
    let measured = { width: -1, height: -1, dpr: 0 }
    const resize = () => {
      if (disposed) return
      const rect = body.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      if (
        measured.width === rect.width &&
        measured.height === rect.height &&
        measured.dpr === dpr
      ) {
        return
      }
      measured = { width: rect.width, height: rect.height, dpr }
      sizeCanvas(canvas, rect, dpr)
      sizeCanvas(playhead, rect, dpr)
      arrangementScene.setViewport({ ...arrangementScene.get().viewport, ...measured })
      // ResizeObserver follows rAF; redraw before the cleared canvas can be composited.
      paintScene()
      paintPlayheadLayer()
    }

    const detachScene = arrangementScheduler.register(SCENE_ID, paintScene)
    const detachPlayhead = arrangementScheduler.register(PLAYHEAD_ID, paintPlayheadLayer)
    const unsubScene = arrangementScene.subscribe(() => {
      arrangementScheduler.invalidate(SCENE_ID)
      arrangementScheduler.invalidate(PLAYHEAD_ID)
    })
    let lastRecording = readNativeAudioStatus().recordingPreview
    const unsubRecording = subscribeNativeAudioStatus(() => {
      const next = readNativeAudioStatus().recordingPreview
      if (next !== lastRecording) {
        lastRecording = next
        arrangementScheduler.invalidate(SCENE_ID)
      }
    })
    const unsubMode = useProjectState.subscribe((state, previous) => {
      if (state.workspace.automationMode !== previous.workspace.automationMode) {
        arrangementScheduler.invalidate(SCENE_ID)
      }
    })
    const observer = new ResizeObserver(resize)
    observer.observe(body)
    resize()
    const refreshColors = () => {
      tokens = readTokens(body)
      insertionColor = createInsertionPulse(tokens["--primary"], tokens["--foreground"])
      arrangementScheduler.invalidate(SCENE_ID)
      arrangementScheduler.invalidate(PLAYHEAD_ID)
    }
    const themeChange = () => {
      const next = readThemeStamp()
      if (next === themeStamp) {
        return
      }
      themeStamp = next
      refreshColors()
    }
    const themeObserver = new MutationObserver(themeChange)
    themeObserver.observe(window.document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    })
    const stylesheetObserver = new MutationObserver(refreshColors)
    stylesheetObserver.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    return () => {
      disposed = true
      detachScene()
      detachPlayhead()
      unsubScene()
      unsubMode()
      unsubRecording()
      observer.disconnect()
      themeObserver.disconnect()
      stylesheetObserver.disconnect()
    }
  }, [bodyReference, canvasReference, playheadReference])
}
