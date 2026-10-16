import { CollapseDivider } from "@/ui/panels"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { useProjectState } from "../../adapters"
import type { ClipEditorSlot } from "@/project/sections/clip-edit"
import { Fragment } from "react"
import type { ReactNode } from "react"
import type { FooterLabels } from "./labels"
import { EffectChain } from "./EffectChain"

export type FooterView = "devices" | "clip"
export interface FooterPanelProps {
  readonly labels: FooterLabels
  readonly view: FooterView
  readonly collapsed: boolean
  readonly onCollapsedChange: (collapsed: boolean) => void
  readonly renderClipEditor: (slot: ClipEditorSlot) => ReactNode
  readonly subscribeWindowActive: (listener: (active: boolean) => void) => () => void
}

export function FooterPanel({
  labels,
  view,
  collapsed,
  onCollapsedChange,
  renderClipEditor,
  subscribeWindowActive,
}: FooterPanelProps) {
  const theme = useTheme()
  const tracks = useProjectState(state => state.document.tracks)
  const selectedClipIds = useProjectState(state => state.session.selectedClipIds)
  const editingClipId = useProjectState(state => state.session.editingClipId)
  const selectedTrackIds = useProjectState(state => state.session.selectedTrackIds)
  const clipId =
    selectedClipIds.length === 1
      ? selectedClipIds[0]
      : selectedClipIds.length
        ? null
        : editingClipId
  const owner = tracks.find(track => track.clips.some(clip => clip.id === clipId))
  const clip = owner?.clips.find(item => item.id === clipId)
  const track = tracks.find(item => item.id === selectedTrackIds.at(-1)) ?? owner ?? null
  const height = view === "devices" ? theme.project.footerDeviceHeight : "100%"
  const emptyClip = (
    <div
      style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <text style={{ color: theme.colors.mutedForeground }}>
        {selectedClipIds.length > 1 ? labels.multipleClips : labels.noClip}
      </text>
    </div>
  )
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        width: "100%",
        minWidth: 0,
        minHeight: 0,
        height: view === "clip" ? (collapsed ? 0 : height) : undefined,
        backgroundColor: theme.colors.muted,
      }}
    >
      {view === "devices" ? (
        <CollapseDivider
          expanded={!collapsed}
          expandedSize={theme.project.footerDeviceHeight}
          onExpandedChange={expanded => onCollapsedChange(!expanded)}
          aria-label={labels.toggle}
          formatAccessiblePixels={labels.formats.accessiblePixels}
          testId="footer-divider"
          style={{ backgroundColor: theme.colors.muted }}
        />
      ) : null}
      {!collapsed ? (
        <div
          testId="footer-content"
          role="group"
          aria-label={view === "devices" ? labels.devicesTab : labels.clipTab}
          style={{ height, minHeight: 0, overflow: "hidden" }}
        >
          {view === "devices" ? (
            <EffectChain
              track={track}
              labels={labels}
              subscribeWindowActive={subscribeWindowActive}
            />
          ) : clip && owner ? (
            <Fragment key={clip.id}>
              {renderClipEditor({
                clipId: clip.id,
                trackId: owner.id,
                close: () => onCollapsedChange(true),
              })}
            </Fragment>
          ) : (
            emptyClip
          )}
        </div>
      ) : null}
    </div>
  )
}

export type { FooterLabels } from "./labels"
