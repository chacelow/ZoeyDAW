import { useCallback, useRef, useSyncExternalStore } from "react"
import { useGpuix } from "@gpuix/react"
import type { EventPayload, PublicInstance } from "@gpuix/react"
import type { NativeClipboard } from "../../../../../platform/clipboard"
import { useProjectState } from "../../../../adapters"
import { sx } from "../../../../../shared/theme/style"
import type { ArrangementScene, ArrangementViewport } from "../../core/scene"
import type { TrackRow } from "../../core/layout"
import type { LaneController } from "../interactions/controller"
import type { LanePointer } from "../interactions/types"
import type { LaneLabels, LaneMessageKey } from "../messages"
import type { PeakReader } from "../PeakReader"
import { LaneContextMenu } from "../ContextMenu"
import { ClipNameEditor } from "../interactions/clip/NameEditor"
import { AutomationValueEditor } from "../interactions/automation/ValueEditor"
import { LaneContents } from "./Contents"

export interface LaneRowProps {
  row: TrackRow
  scene: ArrangementScene
  viewport: ArrangementViewport
  controller: LaneController
  readPeaks: PeakReader
  clipboard: NativeClipboard
  labels: LaneLabels
}

export function LaneRow({ row, scene, viewport, controller, readPeaks, labels }: LaneRowProps) {
  const { renderer } = useGpuix()
  const host = useRef<PublicInstance | null>(null)
  const interaction = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const automationMode = useProjectState(state => state.workspace.automationMode)
  const t = useCallback((key: LaneMessageKey) => labels[key], [labels])
  const pointer = useCallback(
    (event: EventPayload): LanePointer | null => {
      if (event.x === undefined || event.y === undefined || !host.current) return null
      const bounds = renderer?.getElementBounds?.(host.current.id)
      if (!bounds) return null
      return {
        x: event.x - bounds.x,
        y: event.y - bounds.y + row.top,
        button: event.button ?? 0,
        shiftKey: event.modifiers?.shift ?? false,
        altKey: event.modifiers?.alt ?? false,
        metaKey: event.modifiers?.cmd ?? false,
        ctrlKey: event.modifiers?.ctrl ?? false,
      }
    },
    [renderer, row.top]
  )
  const activate = useCallback(
    (id: string) => {
      const context = controller.context
      if (interaction.dragActive || context.getState().session.preview) return
      const clip = row.track.clips.find(item => item.id === id)
      if (!clip) return
      context.actions.selectTracks([row.track.id], "arrangement")
      context.actions.selectClips([id])
      context.actions.setTimeSelection(null)
      context.actions.setInsertionPoint({ trackId: row.track.id, bar: clip.startBar })
      context.scene.setSelection(new Set([id]))
      context.scene.setTimeSelection(null)
      context.scene.setTargetSelection({ kind: "clip", id, phase: "selected" })
    },
    [controller, interaction.dragActive, row.track]
  )
  return (
    <div
      style={sx({
        position: "relative",
        width: viewport.width,
        height: row.height,
        userSelect: "none",
      })}
    >
      <LaneContextMenu
        context={controller.context}
        controller={controller}
        t={t}
        resolveTarget={event => {
          const next = pointer(event)
          return next ? controller.contextMenu(next) : null
        }}
      >
        <div
          ref={host}
          testId={`lane-row-${row.track.id}`}
          role="group"
          aria-label={row.track.name}
          tabIndex={0}
          style={sx({
            position: "relative",
            width: viewport.width,
            height: row.height,
            userSelect: "none",
            cursor: interaction.cursor,
          })}
          onMouseDown={event => {
            const next = pointer(event)
            if (!next || event.button !== 0 || event.modifiers?.ctrl) return
            if (host.current) renderer?.focusElement?.(host.current.id)
            if (event.clickCount === 2) controller.doubleClick(next)
            else controller.pointerDown(next)
          }}
          onMouseMove={event => {
            const next = pointer(event)
            if (next) controller.pointerMove(next, event.pressedButton === 0)
          }}
          onMouseUp={event => {
            const next = pointer(event)
            if (next) controller.pointerUp(next)
          }}
          onMouseLeave={controller.pointerLeave}
        >
          <LaneContents
            row={row}
            scene={scene}
            automationMode={automationMode}
            readPeaks={readPeaks}
            onActivate={activate}
          />
        </div>
      </LaneContextMenu>
      <ClipNameEditor
        context={controller.context}
        scene={scene}
        trackId={row.track.id}
        originY={row.top}
        t={t}
      />
      <AutomationValueEditor
        context={controller.context}
        scene={scene}
        trackId={row.track.id}
        originY={row.top}
        t={t}
      />
    </div>
  )
}
