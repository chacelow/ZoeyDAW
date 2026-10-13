import { useEffect, type RefObject } from "react"
import { useProjectState } from "@/pages/project/adapters"
import { positionToBar } from "@/pages/project/model/types"
import { arrangementScene } from "../canvas/scene"
import { arrangementScheduler } from "../canvas/scheduler"
import { arrangementRingBuffer } from "../canvas/audio/ring-buffer"
import { startMockAudioEngine } from "../canvas/audio/mock-engine"
import { paintGrid } from "../canvas/painters/grid"
import { paintClips } from "../canvas/painters/clip"
import { paintAutomation } from "../canvas/painters/automation"
import { paintClipAlignment, paintPlayhead } from "../canvas/painters/playhead"
import { gridTokens, readThemeStamp, readTokens } from "../canvas/tokens"

const SCENE_ID = "arrangement-scene"
const PLAYHEAD_ID = "arrangement-playhead"

function sizeCanvas(canvas: HTMLCanvasElement, rect: DOMRect, dpr: number) {
  const width = Math.round(rect.width * dpr)
  const height = Math.round(rect.height * dpr)
  canvas.style.width = `${rect.width}px`
  canvas.style.height = `${rect.height}px`
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
}

/** Scene and overlay painters share measured dimensions but independent invalidation. */
export function useCanvasPainters(
  bodyRef: RefObject<HTMLDivElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  playheadRef: RefObject<HTMLCanvasElement | null>
) {
  useEffect(() => startMockAudioEngine(arrangementRingBuffer), [])
  useEffect(() => {
    const body = bodyRef.current
    const canvas = canvasRef.current
    const playhead = playheadRef.current
    if (!body || !canvas || !playhead) return
    const ctx = canvas.getContext("2d")
    const playheadCtx = playhead.getContext("2d")
    if (!ctx || !playheadCtx) return

    let tokens = readTokens(body)
    let themeStamp = readThemeStamp()
    const paintScene = () => {
      const scene = arrangementScene.get()
      paintGrid(ctx, scene, gridTokens(tokens))
      paintClips(ctx, scene, tokens, {
        selectedClipIds: scene.selectedClipIds,
        hoverClip: scene.hoverClip,
        automationMode: useProjectState.getState().workspace.automationMode,
      })
      if (useProjectState.getState().workspace.automationMode)
        paintAutomation(ctx, scene, {
          stroke: tokens["--arrangement-automation"],
          fill: tokens["--arrangement-automation"],
        })
    }
    const paintPlayheadLayer = () => {
      const scene = arrangementScene.get()
      paintPlayhead(playheadCtx, scene, arrangementRingBuffer, {
        primary: tokens["--primary"],
        recording: tokens["--arrangement-automation"] || tokens["--primary"],
      })
      paintClipAlignment(playheadCtx, scene, tokens["--muted-foreground"])
      if (scene.playback.playing) arrangementScheduler.invalidate(PLAYHEAD_ID)
    }
    let measured = { width: -1, height: -1, dpr: 0 }
    const resize = () => {
      const rect = body.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      if (measured.width === rect.width && measured.height === rect.height && measured.dpr === dpr)
        return
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
    const unsubMode = useProjectState.subscribe((state, previous) => {
      if (state.workspace.automationMode !== previous.workspace.automationMode)
        arrangementScheduler.invalidate(SCENE_ID)
      if (
        state.session.playing !== previous.session.playing ||
        (!state.session.playing && state.session.position !== previous.session.position)
      ) {
        arrangementRingBuffer.writePlayhead({
          bar: positionToBar(state.session.position, state.document.transport.numerator),
          playing: state.session.playing,
          recording: state.session.recording,
        })
        arrangementScheduler.invalidate(PLAYHEAD_ID)
      }
    })
    const observer = new ResizeObserver(resize)
    observer.observe(body)
    resize()
    const refreshColors = () => {
      tokens = readTokens(body)
      arrangementScheduler.invalidate(SCENE_ID)
      arrangementScheduler.invalidate(PLAYHEAD_ID)
    }
    const themeChange = () => {
      const next = readThemeStamp()
      if (next === themeStamp) return
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
      detachScene()
      detachPlayhead()
      unsubScene()
      unsubMode()
      observer.disconnect()
      themeObserver.disconnect()
      stylesheetObserver.disconnect()
    }
  }, [bodyRef, canvasRef, playheadRef])
}
