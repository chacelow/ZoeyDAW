import { secondsAtBar, barAtSeconds } from "@zoeydaw/project-core/tempo-map"
import { useEffect, useId, useRef, useState } from "react"
import { projectFiles, useProjectFilesState, useProjectState } from "@/pages/project/adapters"
import {
  browserWaveformSourcePending,
  cachedWaveformRanges,
  useWaveformRanges,
} from "@/pages/project/adapters/backend/waveform-ranges"
import {
  browserAudioDrag,
  browserLibrary,
  BROWSER_AUDIO_MIME,
} from "@/pages/project/adapters/browser"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { arrangementScene } from "../canvas/scene"
import { arrangementScheduler } from "../canvas/scheduler"
import { arrangementBodyTop, dropZoneTop, layoutTrackRows, pinnedTopFor } from "../canvas/layout"
import { browserAudioPlacement } from "./browser-audio-placement"
import type { DragEvent } from "react"
import type { BrowserAudioDragSource } from "@/pages/project/adapters/browser"
import type { ArrangementScene } from "../canvas/scene"
import type { BrowserAudioPlacement } from "./browser-audio-placement"

type PendingDrop = {
  source: BrowserAudioDragSource
  placement: BrowserAudioPlacement
} & ({ kind: "importing" } | { kind: "committed"; clipId: string })

function committedTrack(scene: ArrangementScene, pending: PendingDrop) {
  return pending.kind === "committed"
    ? scene.tracks.find(track => track.clips.some(clip => clip.id === pending.clipId))
    : undefined
}

function committedAudioClip(scene: ArrangementScene, pending: PendingDrop | null) {
  if (pending?.kind !== "committed") return null
  const clip = committedTrack(scene, pending)?.clips.find(clip => clip.id === pending.clipId)
  return clip?.kind === "audio" ? clip : null
}

function projectPending(scene: ArrangementScene, pending: PendingDrop): BrowserAudioPlacement {
  const placement = pending.placement
  const clip = committedAudioClip(scene, pending)
  const trackId = committedTrack(scene, pending)?.id ?? placement.trackId
  const row = layoutTrackRows(scene).find(row => row.track.id === trackId)
  const display = { mode: scene.automationMode, lanes: scene.automationLanes }
  const top = Math.max(
    arrangementBodyTop(),
    row?.top ?? dropZoneTop(scene.tracks, scene.viewport.scrollY, display)
  )
  const bottom = pinnedTopFor(scene.tracks, scene.viewport.height, display)
  return {
    ...placement,
    trackId,
    startBar: clip?.startBar ?? placement.startBar,
    left:
      ((clip?.startBar ?? placement.startBar) - 1) * scene.viewport.pxPerBar -
      scene.viewport.scrollX,
    top,
    height: Math.max(
      0,
      Math.min(bottom, row ? row.top + row.contentHeight : top + DEFAULT_TRACK_HEIGHT) - top
    ),
    color: row?.track.color ?? placement.color,
    width: clip
      ? Math.max(2, clip.lengthBars * scene.viewport.pxPerBar)
      : pending.source.durationSeconds === null
        ? null
        : Math.max(
            2,
            (barAtSeconds(
              scene.transport,
              secondsAtBar(scene.transport, placement.startBar) + pending.source.durationSeconds
            ) -
              placement.startBar) *
              scene.viewport.pxPerBar
          ),
  }
}

export function useBrowserAudioDrop() {
  const [target, setTarget] = useState<BrowserAudioPlacement | null>(null)
  const [pending, setPending] = useState<PendingDrop | null>(null)
  const pendingRef = useRef<PendingDrop | null>(null)
  const mounted = useRef(true)
  const schedulerId = `browser-drop-handoff-${useId()}`
  const source = browserAudioDrag.useState(state => state.source)
  const operation = useProjectFilesState(state => state.operation)
  const busy = operation.kind === "busy"
  const importing = operation.kind === "busy" && operation.action === "import"
  const pointer = useRef<{ clientX: number; clientY: number; host: HTMLDivElement } | null>(null)
  function placement(event: DragEvent<HTMLDivElement>) {
    if (pendingRef.current || useProjectFilesState.getState().operation.kind === "busy") return null
    const source = browserAudioDrag.useState.getState().source
    if (!source) return null
    const rect = event.currentTarget.getBoundingClientRect()
    return browserAudioPlacement(
      arrangementScene.get(),
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      useProjectState.getState().workspace.snap,
      source
    )
  }
  useEffect(() => {
    if (pending) return
    if (!source || busy) {
      pointer.current = null
      setTarget(null)
      return
    }
    return arrangementScene.subscribe(scene => {
      const current = pointer.current
      if (!current) return
      const rect = current.host.getBoundingClientRect()
      setTarget(
        browserAudioPlacement(
          scene,
          {
            x: current.clientX - rect.left,
            y: current.clientY - rect.top,
          },
          useProjectState.getState().workspace.snap,
          source
        )
      )
    })
  }, [source, busy, pending])
  useEffect(() => {
    if (!pending) return
    const retained = pending
    function update(scene: ArrangementScene) {
      setTarget(projectPending(scene, retained))
      arrangementScheduler.invalidate(schedulerId)
    }
    const unregister = arrangementScheduler.register(schedulerId, () => {
      if (pendingRef.current !== pending || pending.kind !== "committed") return
      const scene = arrangementScene.get()
      const track = committedTrack(scene, pending)
      const clip = track?.clips.find(clip => clip.id === pending.clipId)
      if (!clip || clip.kind !== "audio") return
      const media = scene.media.find(source => source.id === clip.sourceId)
      if (media && cachedWaveformRanges(media).length === 0 && browserWaveformSourcePending(media))
        return
      pendingRef.current = null
      setPending(null)
      setTarget(null)
    })
    const unsubscribe = arrangementScene.subscribe(update)
    const unsubscribeRanges = useWaveformRanges.subscribe(() =>
      arrangementScheduler.invalidate(schedulerId)
    )
    update(arrangementScene.get())
    return () => {
      unregister()
      unsubscribe()
      unsubscribeRanges()
    }
  }, [pending, schedulerId])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      pendingRef.current = null
      browserAudioDrag.clear()
    }
  }, [])
  return {
    source: pending?.source ?? source,
    clip: committedAudioClip(arrangementScene.get(), pending),
    busy,
    importing,
    target: pending ? target : source && !busy ? target : null,
    onDragOver(event: DragEvent<HTMLDivElement>) {
      if (!event.dataTransfer.types.includes(BROWSER_AUDIO_MIME)) return
      event.preventDefault()
      const next = placement(event)
      event.dataTransfer.dropEffect = next ? "copy" : "none"
      if (pendingRef.current) return
      pointer.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        host: event.currentTarget,
      }
      setTarget(next)
    },
    onDragLeave(event: DragEvent<HTMLDivElement>) {
      if (pendingRef.current) return
      if (
        !(event.relatedTarget instanceof Node) ||
        !event.currentTarget.contains(event.relatedTarget)
      ) {
        pointer.current = null
        setTarget(null)
      }
    },
    onDrop(event: DragEvent<HTMLDivElement>) {
      if (!event.dataTransfer.types.includes(BROWSER_AUDIO_MIME)) return
      event.preventDefault()
      event.stopPropagation()
      if (pendingRef.current) return
      const next = placement(event)
      const payload = browserAudioDrag.read(event.dataTransfer.getData(BROWSER_AUDIO_MIME))
      pointer.current = null
      if (!next || !payload) {
        browserAudioDrag.clear()
        setTarget(null)
        return
      }
      const dropped: PendingDrop = { kind: "importing", source: payload, placement: next }
      pendingRef.current = dropped
      setPending(dropped)
      setTarget(next)
      browserAudioDrag.clear()
      void browserLibrary.stopAudition()
      void projectFiles
        .importAudioAt({ path: payload.path, startBar: next.startBar, trackId: next.trackId })
        .then(clipId => {
          if (!mounted.current || pendingRef.current !== dropped) return
          if (clipId === null) {
            pendingRef.current = null
            setPending(null)
            setTarget(null)
            return
          }
          const committed: PendingDrop = { ...dropped, kind: "committed", clipId }
          pendingRef.current = committed
          setPending(committed)
        })
        .catch(() => {
          if (!mounted.current || pendingRef.current !== dropped) return
          pendingRef.current = null
          setPending(null)
          setTarget(null)
        })
    },
  }
}
