import type { ReactNode } from "react"
import { useTranslation } from "@zoeymind/i18n"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
} from "@zoeymind/ui"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import type { Track } from "@/pages/project/model/types"

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--primary)",
  "var(--destructive)",
  "var(--muted-foreground)",
]

export function TrackMenu({
  track,
  onRename,
  children,
}: {
  track: Track
  onRename: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const selectedIds = useProjectState(s => s.session.selectedTrackIds)
  const targets = selectedIds.includes(track.id) ? selectedIds : [track.id]
  const editable = track.kind !== "main"
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="h-full w-full" />}>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>{track.name}</ContextMenuLabel>
        <ContextMenuItem onClick={onRename}>{t("arrangement.rename")}</ContextMenuItem>
        <ContextMenuItem
          onClick={() => projectActions.updateTrack(track.id, { collapsed: !track.collapsed })}
        >
          {t(track.collapsed ? "arrangement.expand" : "arrangement.collapse")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!editable}
          onClick={() => projectActions.duplicateTracks(targets)}
        >
          {t("arrangement.duplicate")}
        </ContextMenuItem>
        <ContextMenuItem disabled={!editable} onClick={() => projectActions.groupTracks(targets)}>
          {t("arrangement.group")}
        </ContextMenuItem>
        {track.kind === "group" && (
          <ContextMenuItem onClick={() => projectActions.ungroupTrack(track.id)}>
            {t("arrangement.ungroup")}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuLabel>{t("arrangement.trackColor")}</ContextMenuLabel>
        <div className="grid grid-cols-8 gap-1 p-1">
          {COLORS.map((color, index) => (
            <button
              key={color}
              type="button"
              aria-label={`${t("arrangement.trackColor")} ${index + 1}`}
              className="size-5 rounded-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
              style={{ background: color }}
              onClick={() => {
                projectActions.beginEdit()
                for (const id of targets) projectActions.updateTrack(id, { color })
                projectActions.endEdit()
              }}
            />
          ))}
        </div>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => projectActions.addTrack("audio")}>
          {t("arrangement.addAudio")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => projectActions.addTrack("midi")}>
          {t("arrangement.addMidi")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => projectActions.addTrack("group")}>
          {t("arrangement.addGroup")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!editable}
          variant="destructive"
          onClick={() => projectActions.deleteTracks(targets)}
        >
          {t("arrangement.deleteTrack")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
