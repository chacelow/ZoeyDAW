import { ChevronDown, ChevronRight } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { IconSlot } from "@zoeymind/ui"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import type { Track } from "@/pages/project/model/types"
import { TrackNameInput } from "./NameInput"
import { AutomationSelector } from "./AutomationSelector"

export function TrackIdentity({
  track,
  selected,
  renaming,
  onRenameEnd,
}: {
  track: Track
  selected: boolean
  renaming: boolean
  onRenameEnd: () => void
}) {
  const { t } = useTranslation()
  const automation = useProjectState(s => s.workspace.automationMode)
  return (
    <section
      className="arrangement-track-identity-body arrangement-track-controls flex h-full min-w-0 flex-1 flex-col"
      style={{
        backgroundColor: selected
          ? "var(--arrangement-clip-selected)"
          : `color-mix(in oklab, ${track.color}, var(--arrangement-clip-paper) var(--arrangement-clip-tint))`,
      }}
      aria-label={t("arrangement.trackIdentity")}
    >
      <div className="arrangement-track-identity-title flex min-w-0 items-center gap-control-track-gap">
        <button
          type="button"
          aria-label={`${t(track.collapsed ? "arrangement.expand" : "arrangement.collapse")} ${track.name}`}
          aria-expanded={!track.collapsed}
          className="flex size-control-compact shrink-0 items-center justify-center"
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
          <span className="min-w-0 truncate text-xs font-medium" title={track.name}>
            {track.name}
          </span>
        )}
      </div>
      {!track.collapsed && automation && <AutomationSelector track={track} />}
    </section>
  )
}
