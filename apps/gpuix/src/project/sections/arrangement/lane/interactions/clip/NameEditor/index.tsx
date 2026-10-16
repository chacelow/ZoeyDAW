import { useRef, useState } from "react"
import { Input } from "@/ui/controls"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { clipLabel } from "@/project/model/clip-label"
import { clipRect } from "@/project/sections/arrangement/core/layout"
import { visibleRows } from "@/project/sections/arrangement/lane/render-projection"
import type { LaneTranslate } from "@/project/sections/arrangement/lane/messages"
import type { LaneContext } from "../../types"
import type { ArrangementScene } from "@/project/sections/arrangement/core/scene"

export function ClipNameEditor({
  context,
  scene,
  trackId,
  originY,
  t,
}: {
  context: LaneContext
  scene: ArrangementScene
  trackId: string
  originY: number
  t: LaneTranslate
}) {
  const theme = useTheme()
  const selection = scene.targetSelection
  if (selection.kind !== "clip" || selection.phase !== "renaming") return null
  const row = visibleRows(scene).find(
    item => item.track.id === trackId && item.track.clips.some(clip => clip.id === selection.id)
  )
  const clip = row?.track.clips.find(item => item.id === selection.id)
  if (!row || !clip || row.top < row.clipTop) return null
  const rect = clipRect(clip, row, scene.viewport.pxPerBar, scene.viewport.scrollX)
  const left = Math.max(
    0,
    Math.round(rect.left) + scene.geometry.arrangement.clip.nameEditorLeftInset
  )
  const width = Math.min(
    theme.layout.track.controlsWidth,
    scene.viewport.width - left,
    rect.left + rect.width - left - scene.geometry.arrangement.clip.nameEditorRightInset
  )
  if (width <= theme.control["--spacing-control-track-gap"]) return null
  return (
    <NameInput
      key={clip.id}
      context={context}
      id={clip.id}
      initial={clipLabel(clip)}
      t={t}
      left={left}
      top={Math.round(rect.top + scene.geometry.arrangement.clip.verticalInset) - originY}
      width={width}
      height={Math.min(
        scene.geometry.track.titleHeight,
        row.height - scene.geometry.arrangement.clip.verticalInset * 2
      )}
    />
  )
}

function NameInput({
  context,
  id,
  initial,
  t,
  left,
  top,
  width,
  height,
}: {
  context: LaneContext
  id: string
  initial: string
  t: LaneTranslate
  left: number
  top: number
  width: number
  height: number
}) {
  const theme = useTheme()
  const [value, setValue] = useState(initial)
  const done = useRef(false)
  const epoch = useRef(context.getState().session.editEpoch)
  function finish(commit: boolean) {
    if (done.current) return
    done.current = true
    if (context.getState().session.editEpoch !== epoch.current) return
    const selection = context.scene.get().targetSelection
    if (selection.kind !== "clip" || selection.id !== id || selection.phase !== "renaming") return
    const label = value.trim()
    if (commit && label && label !== initial) context.actions.updateClip(id, { label })
    context.scene.setTargetSelection({ ...selection, phase: "selected" })
  }
  return (
    <Input
      autoFocus
      selectAllOnFocus
      testId="clip-name-editor"
      aria-label={t("arrangement.rename")}
      value={value}
      onValueChange={setValue}
      style={sx({
        position: "absolute",
        left,
        top,
        width,
        height,
        borderRadius: theme.design.editor.inlineRadius,
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.arrangementClipSelected,
        color: theme.colors.arrangementClipInk,
        paddingLeft: theme.control["--spacing-control-gap"],
        paddingRight: theme.control["--spacing-control-gap"],
      })}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.key === "escape") {
          event.preventDefault()
          finish(false)
        }
      }}
      onSubmit={() => finish(true)}
      onBlur={() => finish(true)}
      onMouseDownOutside={() => finish(true)}
    />
  )
}
