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
import { CONTENT_PALETTE, contentFill, resolveContentColor } from "@/shared/theme/content-color"
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
  const targets = () => {
    const selectedIds = useProjectState.getState().session.selectedTrackIds
    return selectedIds.includes(track.id) ? selectedIds : [track.id]
  }
  const editable = track.kind !== "main"
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
          onSelect={() => projectActions.duplicateTracks(targets())}
        >
          {t("duplicate")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!editable}
          onSelect={() => projectActions.groupTracks(targets(), theme.layout.track.defaultHeight)}
        >
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
          {CONTENT_PALETTE.map((color, index) => (
            <Button
              key={color}
              iconOnly
              label={`${t("trackColor")} ${index + 1}`}
              testId={`track-color-${index}-${track.id}`}
              style={{
                backgroundColor: resolveContentColor(color, theme.colors),
                hover: {
                  backgroundColor: contentFill(
                    color,
                    theme.colors,
                    theme.design.colorRecipes.contentPaperTint
                  ),
                },
              }}
              onClick={() => {
                const edit = projectActions.beginEdit("track-color")
                for (const id of targets()) projectActions.updateTrack(id, { color })
                projectActions.endEdit(edit)
              }}
            />
          ))}
        </div>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => projectActions.addTrack("audio", theme.layout.track.defaultHeight)}
        >
          {t("addAudio")}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => projectActions.addTrack("midi", theme.layout.track.defaultHeight)}
        >
          {t("addMidi")}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => projectActions.addTrack("group", theme.layout.track.defaultHeight)}
        >
          {t("addGroup")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!editable}
          testId={`track-delete-${track.id}`}
          style={{ color: theme.colors.destructive }}
          onSelect={() => projectActions.deleteTracks(targets())}
        >
          {t("deleteTrack")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
