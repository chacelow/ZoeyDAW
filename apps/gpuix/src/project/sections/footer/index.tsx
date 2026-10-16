import { MotionTabs } from "@/ui/controls"
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
  readonly onViewChange: (view: FooterView) => void
  readonly onCollapsedChange: (collapsed: boolean) => void
  readonly renderClipEditor: (slot: ClipEditorSlot) => ReactNode
  readonly reducedMotion: boolean
  readonly subscribeWindowActive: (listener: (active: boolean) => void) => () => void
}

export function FooterPanel({
  labels,
  view,
  collapsed,
  onViewChange,
  onCollapsedChange,
  renderClipEditor,
  reducedMotion,
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
          formatAccessiblePixels={pixels => `${pixels} pixels`}
          testId="footer-divider"
          style={{ backgroundColor: theme.colors.muted }}
        />
      ) : null}
      {!collapsed ? (
        <MotionTabs
          testId="footer-content"
          value={view}
          onChange={next => {
            if (next === "devices" || next === "clip") onViewChange(next)
          }}
          reducedMotion={reducedMotion}
          tabWidth={theme.project.identityWidth}
          style={{ height, gap: theme.design.tabs.footerJoinedGroupGap, overflow: "hidden" }}
          containerStyle={{
            backgroundColor: theme.colors.muted,
            borderRadius: theme.design.tabs.footerRadius,
          }}
          contentStyle={{ flexGrow: 1, minHeight: 0 }}
          options={[
            {
              key: "devices",
              label: labels.devicesTab,
              content: (
                <EffectChain
                  track={track}
                  labels={labels}
                  subscribeWindowActive={subscribeWindowActive}
                />
              ),
            },
            {
              key: "clip",
              label: labels.clipTab,
              content:
                view === "clip" && clip && owner ? (
                  <Fragment key={clip.id}>
                    {renderClipEditor({
                      clipId: clip.id,
                      trackId: owner.id,
                      close: () => onCollapsedChange(true),
                    })}
                  </Fragment>
                ) : (
                  emptyClip
                ),
            },
          ]}
        />
      ) : null}
    </div>
  )
}

export type { FooterLabels } from "./labels"
