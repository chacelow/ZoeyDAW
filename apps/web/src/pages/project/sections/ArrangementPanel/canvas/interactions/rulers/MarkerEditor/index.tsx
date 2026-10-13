import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { projectActions } from "@/pages/project/adapters"
import { MARKER_RULER_HEIGHT } from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import { arrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"

export function MarkerEditor() {
  const scene = useSyncExternalStore(arrangementScene.subscribe, arrangementScene.get)
  const selection = scene.targetSelection
  const marker =
    selection.kind === "marker" && selection.phase === "renaming"
      ? scene.markers.find(item => item.id === selection.id)
      : undefined
  if (!marker) return null
  return (
    <MarkerNameInput
      key={marker.id}
      id={marker.id}
      initial={marker.label}
      x={(marker.bar - 1) * scene.viewport.pxPerBar - scene.viewport.scrollX}
    />
  )
}

function MarkerNameInput({ id, initial, x }: { id: string; initial: string; x: number }) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useLayoutEffect(() => {
    ref.current?.focus({ preventScroll: true })
    ref.current?.select()
  }, [])
  function close(commit: boolean) {
    if (done.current) return
    done.current = true
    if (commit && value.trim() && value.trim() !== initial)
      projectActions.updateMarker(id, { label: value.trim() })
    const selection = arrangementScene.get().targetSelection
    if (selection.kind === "marker" && selection.id === id)
      arrangementScene.setTargetSelection({ ...selection, phase: "selected" })
  }
  return (
    <input
      data-marker-editor=""
      ref={ref}
      value={value}
      aria-label={t("arrangement.markerName")}
      className="absolute z-30 h-5 min-w-24 rounded border border-primary bg-background px-1 text-xs text-foreground outline-none"
      style={{ left: Math.max(0, x + 7), top: Math.max(0, MARKER_RULER_HEIGHT - 2) }}
      onChange={event => setValue(event.target.value)}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.key === "Enter") {
          event.preventDefault()
          close(true)
        }
        if (event.key === "Escape") {
          event.preventDefault()
          close(false)
        }
      }}
      onBlur={() => close(true)}
      onPointerDown={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      onContextMenu={event => event.stopPropagation()}
    />
  )
}
