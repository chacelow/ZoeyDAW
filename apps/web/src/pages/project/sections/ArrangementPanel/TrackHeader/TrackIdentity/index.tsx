import { ChevronDown, ChevronRight } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { IconSlot } from "@zoeymind/ui"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import { TrackNameInput } from "./NameInput"
import { AddAutomationLane, AutomationSelector } from "./AutomationSelector"
import type { Track } from "@zoeydaw/project-core/types"

export function TrackIdentity({
  track,
  selected,
  renaming,
  onRenameEnd,
}: {
  readonly track: Track
  readonly selected: boolean
  readonly renaming: boolean
  readonly onRenameEnd: () => void
}) {
  const { t } = useTranslation()
  const automation = useProjectState(s => s.workspace.automationMode)
  return (
    <section
      className="arrangement-track-identity-body arrangement-track-controls flex h-full min-w-0 flex-1 flex-col"
      data-automation={automation || undefined}
      style={{
        backgroundColor: selected
          ? "var(--arrangement-clip-selected)"
          : `color-mix(in oklab, ${track.color}, var(--arrangement-clip-paper) var(--arrangement-clip-tint))`,
      }}
      aria-label={t("arrangement.trackIdentity")}
    >
      <div className="arrangement-track-identity-title gap-control-track-gap flex min-w-0 items-center">
        <button
          type="button"
          aria-label={`${t(track.collapsed ? "arrangement.expand" : "arrangement.collapse")} ${track.name}`}
          aria-expanded={!track.collapsed}
          className="size-control-compact flex shrink-0 items-center justify-center"
          onClick={event => {
            event.stopPropagation()
            projectActions.updateTrack(track.id, { collapsed: !track.collapsed })
          }}
        >
          <IconSlot size="compact">{track.collapsed ? <ChevronRight /> : <ChevronDown />}</IconSlot>
        </button>
        {renaming ? (
          <TrackNameInput track={track} onFinish={onRenameEnd} />
        ) : (
          <span className="min-w-0 truncate text-xs font-medium">{track.name}</span>
        )}
        {!track.collapsed && automation ? <AddAutomationLane track={track} /> : null}
      </div>
      {!track.collapsed && automation ? (
        <div className="arrangement-track-identity-lower min-h-0 flex-1">
          <AutomationSelector track={track} />
        </div>
      ) : null}
    </section>
  )
}
