import { useCallback, useMemo, useRef, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import { useGpuix } from "@gpuix/react"
import type { EventPayload, KeyEvent, PublicInstance } from "@gpuix/react"
import { hitTest } from "../core/hit-test"
import { BAR_RULER_HEIGHT } from "../core/layout"
import { LaneContextMenu } from "./ContextMenu"
import { ClipNameEditor } from "./interactions/clip/NameEditor"
import { AutomationValueEditor } from "./interactions/automation/ValueEditor"
import type { LaneController } from "./interactions/controller"
import type { LanePointer } from "./interactions/types"
import type { LaneLabels, LaneMessageKey } from "./messages"

/** One retained hitbox owns input; virtual rows only describe and draw the scene. */
export function useLaneSurface(
  controller: LaneController,
  labels: LaneLabels,
  originY = BAR_RULER_HEIGHT
) {
  const { renderer } = useGpuix()
  const host = useRef<PublicInstance | null>(null)
  const interaction = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const ref = useCallback((instance: PublicInstance | null) => {
    host.current = instance
  }, [])
  return useMemo(() => {
    function pointer(event: EventPayload): LanePointer | null {
      const bounds = host.current && renderer?.getElementBounds?.(host.current.id)
      if (!bounds || event.x === undefined || event.y === undefined) return null
      return {
        x: event.x - bounds.x,
        y: event.y - bounds.y + originY,
        button: event.button ?? 0,
        shiftKey: event.modifiers?.shift ?? false,
        altKey: event.modifiers?.alt ?? false,
        metaKey: event.modifiers?.cmd ?? false,
        ctrlKey: event.modifiers?.ctrl ?? false,
      }
    }
    return {
      ref,
      style: { cursor: interaction.cursor },
      wrap(surface: ReactNode) {
        return (
          <>
            <LaneContextMenu
              context={controller.context}
              controller={controller}
              t={key => labels[key]}
              resolveTarget={event => {
                const next = pointer(event)
                return next ? controller.contextMenu(next) : null
              }}
            >
              {surface}
            </LaneContextMenu>
            <LaneEditors controller={controller} labels={labels} />
          </>
        )
      },
      onBlur: () => controller.interrupt(),
      onMouseDown(event: EventPayload) {
        const next = pointer(event)
        if (!next || next.button !== 0 || next.ctrlKey) return
        const scene = controller.context.scene.get()
        if (!hitTest(scene, next.x, next.y, controller.context.getState().workspace.automationMode))
          return
        if (host.current) renderer?.focusElement?.(host.current.id)
        if (event.clickCount === 2) controller.doubleClick(next)
        else controller.pointerDown(next)
      },
      onMouseMove(event: EventPayload) {
        const next = pointer(event)
        if (next) controller.pointerMove(next, event.pressedButton === 0)
      },
      onMouseUp(event: EventPayload) {
        const next = pointer(event)
        if (next) controller.pointerUp(next)
      },
      onMouseLeave: () => controller.pointerLeave(),
      onKeyDown(event: KeyEvent) {
        if (!event.key || event.defaultPrevented) return
        if (
          controller.keyDown({
            key: event.key,
            shiftKey: event.modifiers?.shift ?? false,
            altKey: event.modifiers?.alt ?? false,
            metaKey: event.modifiers?.cmd ?? false,
            ctrlKey: event.modifiers?.ctrl ?? false,
            repeat: event.isHeld ?? false,
          })
        ) {
          event.preventDefault()
          event.stopPropagation()
        }
      },
    }
  }, [controller, interaction.cursor, labels, originY, ref, renderer])
}

function LaneEditors({ controller, labels }: { controller: LaneController; labels: LaneLabels }) {
  const scene = useSyncExternalStore(
    controller.context.scene.subscribe,
    controller.context.scene.get
  )
  const t = useCallback((key: LaneMessageKey) => labels[key], [labels])
  const selection = scene.targetSelection
  if (selection.kind === "clip" && selection.phase === "renaming") {
    const track = scene.tracks.find(item => item.clips.some(clip => clip.id === selection.id))
    return track ? (
      <ClipNameEditor
        context={controller.context}
        scene={scene}
        trackId={track.id}
        originY={0}
        t={t}
      />
    ) : null
  }
  return selection.kind === "automation-value" ? (
    <AutomationValueEditor
      context={controller.context}
      scene={scene}
      trackId={selection.trackId}
      originY={0}
      t={t}
    />
  ) : null
}
