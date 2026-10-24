import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { projectActions } from "@/pages/project/adapters"
import { clipLabel } from "@zoeydaw/project-core/clip-label"
import { arrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import {
  arrangementBodyTop,
  clipRect,
  layoutTrackRows,
} from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import { TRACK_TITLE_HEIGHT } from "@/pages/project/layout"

export function ClipNameEditor() {
  const scene = useSyncExternalStore(arrangementScene.subscribe, arrangementScene.get)
  const selection = scene.targetSelection
  if (selection.kind !== "clip" || selection.phase !== "renaming") {
    return null
  }
  const row = layoutTrackRows(scene).find(item =>
    item.track.clips.some(clip => clip.id === selection.id)
  )
  const clip = row?.track.clips.find(item => item.id === selection.id)
  if (!row || !clip || row.top < arrangementBodyTop()) {
    return null
  }
  const rect = clipRect(clip, row, scene.viewport.pxPerBar, scene.viewport.scrollX)
  const left = Math.max(0, Math.round(rect.left) + 1)
  const width = Math.min(240, scene.viewport.width - left, rect.left + rect.width - left - 2)
  if (width <= 4) {
    return null
  }
  return (
    <ClipRenameInput
      key={clip.id}
      id={clip.id}
      initial={clipLabel(clip, scene.media)}
      left={left}
      top={Math.round(rect.top + 1)}
      width={width}
      height={Math.min(TRACK_TITLE_HEIGHT, row.height - 2)}
    />
  )
}

function ClipRenameInput({
  id,
  initial,
  left,
  top,
  width,
  height,
}: {
  readonly id: string
  readonly initial: string
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initial)
  const input = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useLayoutEffect(() => {
    input.current?.focus({ preventScroll: true })
    input.current?.select()
  }, [])
  function finish(commit: boolean) {
    if (done.current) {
      return
    }
    done.current = true
    const label = value.trim()
    if (commit && label && label !== initial) {
      projectActions.updateClip(id, { label })
    }
    const selection = arrangementScene.get().targetSelection
    if (selection.kind === "clip" && selection.id === id && selection.phase === "renaming") {
      arrangementScene.setTargetSelection({ ...selection, phase: "selected" })
    }
  }
  return (
    <input
      ref={input}
      data-clip-rename=""
      aria-label={t("arrangement.rename")}
      className="border-primary absolute z-30 min-w-0 border bg-[var(--arrangement-clip-selected)] px-1 text-[10px] leading-none text-[var(--arrangement-clip-ink)] outline-none"
      style={{ left, top, width, height }}
      value={value}
      onChange={event => setValue(event.target.value)}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
        if (event.key === "Enter") {
          event.preventDefault()
          finish(true)
        }
        if (event.key !== "Escape") {
          return
        }

        event.preventDefault()
        finish(false)
      }}
      onBlur={() => finish(true)}
      onPointerDown={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      onContextMenu={event => event.stopPropagation()}
    />
  )
}
