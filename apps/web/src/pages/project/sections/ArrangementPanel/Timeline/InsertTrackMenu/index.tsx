import { useTranslation } from "@zoeymind/i18n"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@zoeymind/ui"
import { projectActions } from "@/pages/project/adapters"
import type { ReactElement } from "react"

export function InsertTrackMenu({ children }: { readonly children: ReactElement }) {
  const { t } = useTranslation()
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent>
        <ContextMenuItem onClick={() => projectActions.addTrack("audio")}>
          {t("arrangement.addAudio")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => projectActions.addTrack("midi")}>
          {t("arrangement.addMidi")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => projectActions.addTrack("return")}>
          {t("arrangement.addReturn")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
