import { useSyncExternalStore } from "react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/ui/controls"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { projectActions, useProjectState } from "@/project/adapters"
import { positionToBar } from "@/project/model/types"
import type { ReactNode } from "react"
import type { TimelineController } from "../controller"
import type { TimelineLabels } from "../labels"

export type RulerMenuTarget =
  { kind: "marker"; id: string } | { kind: "loop" } | { kind: "ruler"; bar: number }

export function RulerMenu({
  owner,
  labels,
  target,
  children,
}: {
  owner: TimelineController
  labels: TimelineLabels
  target: RulerMenuTarget
  children: ReactNode
}) {
  const current = useSyncExternalStore(owner.sceneStore.subscribe, owner.sceneStore.get)
  const theme = useTheme()
  const marker =
    target.kind === "marker" ? current.markers.find(item => item.id === target.id) : undefined
  function seek(direction: -1 | 1) {
    const state = useProjectState.getState()
    const position = positionToBar(state.session.position, state.document.transport.numerator)
    const sorted = [...state.document.markers].sort((a, b) => direction * (a.bar - b.bar))
    const next = sorted.find(item =>
      direction < 0 ? item.bar < position - 1e-6 : item.bar > position + 1e-6
    )
    if (!next) return
    projectActions.seekBar(next.bar)
    owner.sceneStore.setTargetSelection({ kind: "marker", id: next.id, phase: "selected" })
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {target.kind === "marker" ? (
          <>
            <ContextMenuItem
              onSelect={() =>
                owner.sceneStore.setTargetSelection({
                  kind: "marker",
                  id: target.id,
                  phase: "renaming",
                })
              }
            >
              {labels.renameMarker}
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!marker}
              onSelect={() => {
                if (marker) projectActions.seekBar(marker.bar)
              }}
            >
              {labels.seekMarker}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => seek(-1)}>{labels.previousMarker}</ContextMenuItem>
            <ContextMenuItem onSelect={() => seek(1)}>{labels.nextMarker}</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              style={sx({ color: theme.colors.destructive })}
              onSelect={() => {
                projectActions.deleteMarker(target.id)
                owner.sceneStore.setTargetSelection({ kind: "none" })
              }}
            >
              {labels.deleteMarker}
            </ContextMenuItem>
          </>
        ) : (
          <>
            {target.kind === "ruler" && (
              <ContextMenuItem
                onSelect={() => {
                  const id = projectActions.addMarker(target.bar)
                  if (id)
                    owner.sceneStore.setTargetSelection({ kind: "marker", id, phase: "selected" })
                }}
              >
                {labels.addMarker}
              </ContextMenuItem>
            )}
            <ContextMenuItem
              onSelect={() =>
                projectActions.setLoop({ enabled: !owner.sceneStore.get().loop.enabled })
              }
            >
              {current.loop.enabled ? labels.disableLoop : labels.enableLoop}
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() =>
                owner.view.rulers.loopSelection(target.kind === "ruler" ? target.bar : undefined)
              }
            >
              {target.kind === "ruler" ? labels.loop : labels.loopSelection}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
