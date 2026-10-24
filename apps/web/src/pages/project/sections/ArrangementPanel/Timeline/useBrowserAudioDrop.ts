import { useEffect, useRef, useState } from "react"
import { projectFiles, useProjectFilesState, useProjectState } from "@/pages/project/adapters"
import {
  browserAudioDrag,
  browserLibrary,
  BROWSER_AUDIO_MIME,
} from "@/pages/project/adapters/browser"
import { arrangementScene } from "../canvas/scene"
import { browserAudioPlacement } from "./browser-audio-placement"
import type { DragEvent } from "react"
import type { BrowserAudioPlacement } from "./browser-audio-placement"

export function useBrowserAudioDrop() {
  const [target, setTarget] = useState<BrowserAudioPlacement | null>(null)
  const source = browserAudioDrag.useState(state => state.source)
  const operation = useProjectFilesState(state => state.operation)
  const busy = operation.kind === "busy"
  const importing = operation.kind === "busy" && operation.action === "import"
  const pointer = useRef<{ clientX: number; clientY: number; host: HTMLDivElement } | null>(null)
  function placement(event: DragEvent<HTMLDivElement>) {
    if (useProjectFilesState.getState().operation.kind === "busy") return null
    const source = browserAudioDrag.useState.getState().source
    if (!source) return null
    const rect = event.currentTarget.getBoundingClientRect()
    return browserAudioPlacement(
      arrangementScene.get(),
      {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      },
      useProjectState.getState().workspace.snap,
      source
    )
  }
  useEffect(() => {
    if (!source) {
      pointer.current = null
      setTarget(null)
      return
    }
    if (busy) {
      pointer.current = null
      setTarget(null)
    }
    const unsubscribe = arrangementScene.subscribe(scene => {
      const current = pointer.current
      if (!current || busy) return
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
    return unsubscribe
  }, [source, busy])
  useEffect(() => () => browserAudioDrag.clear(), [])
  return {
    source,
    busy,
    importing,
    target: source && !busy ? target : null,
    onDragOver(event: DragEvent<HTMLDivElement>) {
      if (!event.dataTransfer.types.includes(BROWSER_AUDIO_MIME)) return
      event.preventDefault()
      const next = placement(event)
      event.dataTransfer.dropEffect = next ? "copy" : "none"
      pointer.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        host: event.currentTarget,
      }
      setTarget(next)
    },
    onDragLeave(event: DragEvent<HTMLDivElement>) {
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
      const next = placement(event)
      const payload = browserAudioDrag.read(event.dataTransfer.getData(BROWSER_AUDIO_MIME))
      pointer.current = null
      browserAudioDrag.clear()
      void browserLibrary.stopAudition()
      if (!next || !payload) {
        setTarget(null)
        return
      }
      // Keep the ghost until the real clip exists, so the card never blinks away between the
      // drop and the asynchronous import finishing.
      const dropped = { ...next }
      void projectFiles
        .importAudioAt({ path: payload.path, startBar: next.startBar, trackId: next.trackId })
        .finally(() => setTarget(current => (current === dropped ? null : current)))
    },
  }
}
