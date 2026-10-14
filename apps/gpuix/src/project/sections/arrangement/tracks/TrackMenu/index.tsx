import { useTrackLabels } from "../labels"
import {
  Button,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/ui/controls"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { projectActions, useProjectState } from "@/project/adapters"
import type { ReactElement } from "react"
import type { Track } from "@/project/model/types"

export function TrackMenu({
  track,
  onRename,
  children,
}: {
  readonly track: Track
  readonly onRename: () => void
  readonly children: ReactElement
}) {
  const { t } = useTrackLabels()
  const theme = useTheme()
  const selectedIds = useProjectState(state => state.session.selectedTrackIds)
  const targets = selectedIds.includes(track.id) ? selectedIds : [track.id]
  const editable = track.kind !== "main"
  const palette = [
    theme.colors.chart1,
    theme.colors.chart2,
    theme.colors.chart3,
    theme.colors.chart4,
    theme.colors.chart5,
    theme.colors.primary,
    theme.colors.destructive,
    theme.colors.mutedForeground,
  ]
  return (
    <ContextMenu
      style={{ width: "100%", height: "100%", flexDirection: "column", alignItems: "stretch" }}
    >
      <ContextMenuTrigger asChild role="group">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent testId={`track-menu-${track.id}`}>
        <ContextMenuLabel>{track.name}</ContextMenuLabel>
        <ContextMenuItem testId={`track-rename-${track.id}`} onSelect={onRename}>
          {t("rename")}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => projectActions.updateTrack(track.id, { collapsed: !track.collapsed })}
        >
          {t(track.collapsed ? "expand" : "collapse")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!editable}
          onSelect={() => projectActions.duplicateTracks(targets)}
        >
          {t("duplicate")}
        </ContextMenuItem>
        <ContextMenuItem disabled={!editable} onSelect={() => projectActions.groupTracks(targets)}>
          {t("group")}
        </ContextMenuItem>
        {track.kind === "group" ? (
          <ContextMenuItem onSelect={() => projectActions.ungroupTrack(track.id)}>
            {t("ungroup")}
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuLabel>{t("trackColor")}</ContextMenuLabel>
        <div
          role="group"
          aria-label={t("trackColor")}
          style={{
            display: "flex",
            gap: theme.control["--spacing-control-gap"],
            padding: theme.control["--spacing-control-gap"],
          }}
        >
          {palette.map((color, index) => (
            <Button
              key={color}
              iconOnly
              label={`${t("trackColor")} ${index + 1}`}
              testId={`track-color-${index}-${track.id}`}
              style={{ backgroundColor: color }}
              onClick={() => {
                const token = projectActions.beginEdit("track-color")
                for (const id of targets) projectActions.updateTrack(id, { color })
                projectActions.endEdit(token)
              }}
            />
          ))}
        </div>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => projectActions.addTrack("audio")}>
          {t("addAudio")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => projectActions.addTrack("midi")}>
          {t("addMidi")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => projectActions.addTrack("group")}>
          {t("addGroup")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!editable}
          testId={`track-delete-${track.id}`}
          style={{ color: theme.colors.destructive }}
          onSelect={() => projectActions.deleteTracks(targets)}
        >
          {t("deleteTrack")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
