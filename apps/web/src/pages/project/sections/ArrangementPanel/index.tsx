import { useState } from "react"
import { DragPadToggle, cn } from "@zoeymind/ui"
import { useTranslation } from "@zoeymind/i18n"
import { SessionPanel } from "../SessionPanel"
import { TimelineCanvas } from "./Timeline/TimelineCanvas"

export function ArrangementPanel() {
  const [session, setSession] = useState(false)
  const { t } = useTranslation()
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex shrink-0 items-center gap-2 border-b p-1">
        <DragPadToggle value={session} onChange={setSession} label={t("project.session.title")} />
        <span className="text-muted-foreground text-xs">
          {t(session ? "project.session.title" : "project.session.arrangement")}
        </span>
      </div>
      <div
        className={cn("min-h-0 flex-1", session && "hidden")}
        aria-hidden={session}
        inert={session}
      >
        <TimelineCanvas />
      </div>
      {session && <SessionPanel />}
    </div>
  )
}
