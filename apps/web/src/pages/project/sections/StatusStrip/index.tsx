import { InfoChannel } from "./InfoChannel"

export function StatusStrip() {
  return (
    <div className="project-status-strip border-border bg-card text-muted-foreground flex h-9 shrink-0 items-center gap-2 border-t px-2 text-xs tabular-nums">
      <InfoChannel />
    </div>
  )
}
