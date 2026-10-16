import { useRef, useState, useSyncExternalStore } from "react"
import { Input } from "@/ui/controls"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { projectActions, useProjectState } from "@/project/adapters"
import type { TimelineController } from "../controller"
import type { TimelineLabels } from "../labels"

export function MarkerEditor({
  owner,
  labels,
}: {
  owner: TimelineController
  labels: TimelineLabels
}) {
  const current = useSyncExternalStore(owner.sceneStore.subscribe, owner.sceneStore.get)
  const selected = current.targetSelection
  const marker =
    selected.kind === "marker" && selected.phase === "renaming"
      ? current.markers.find(item => item.id === selected.id)
      : undefined
  if (!marker) return null
  return (
    <MarkerNameInput
      key={marker.id}
      owner={owner}
      id={marker.id}
      initial={marker.label}
      left={(marker.bar - 1) * current.viewport.pxPerBar - current.viewport.scrollX}
      label={labels.markerName}
    />
  )
}

function MarkerNameInput({
  owner,
  id,
  initial,
  left,
  label,
}: {
  owner: TimelineController
  id: string
  initial: string
  left: number
  label: string
}) {
  const theme = useTheme()
  const [value, setValue] = useState(initial)
  const [epoch] = useState(() => useProjectState.getState().session.editEpoch)
  const done = useRef(false)
  function close(commit: boolean) {
    if (done.current) return
    done.current = true
    if (epoch !== useProjectState.getState().session.editEpoch) return
    const trimmed = value.trim()
    if (commit && trimmed && trimmed !== initial)
      projectActions.updateMarker(id, { label: trimmed })
    const selected = owner.sceneStore.get().targetSelection
    if (selected.kind === "marker" && selected.id === id)
      owner.sceneStore.setTargetSelection({ ...selected, phase: "selected" })
  }
  return (
    <Input
      autoFocus
      selectAllOnFocus
      testId="marker-name-editor"
      aria-label={label}
      value={value}
      onValueChange={setValue}
      onSubmit={() => close(true)}
      onBlur={() => close(true)}
      onKeyDown={event => {
        if (event.key !== "escape") return
        event.preventDefault()
        event.stopPropagation()
        close(false)
      }}
      style={sx({
        position: "absolute",
        top: Math.max(
          0,
          theme.layout.arrangement.markerRulerHeight - theme.project.arrangementMarkerInset
        ),
        left: Math.max(
          0,
          Math.min(
            owner.sceneStore.get().viewport.width - theme.project.arrangementMarkerEditorMinWidth,
            left + theme.project.arrangementMarkerLabelInset
          )
        ),
        minWidth: theme.project.arrangementMarkerEditorMinWidth,
      })}
    />
  )
}
