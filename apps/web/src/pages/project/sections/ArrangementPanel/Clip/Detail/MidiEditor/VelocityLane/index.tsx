import { useTranslation } from "@zoeymind/i18n"
import { pitchName, VELOCITY_HEIGHT } from "../geometry"
import type { PointerEvent } from "react"
import type { MidiNote } from "@/pages/project/model/types"

export function VelocityLane({
  notes,
  selection,
  sourceOffsetBeats,
  totalBeats,
  width,
  handlers,
}: {
  readonly notes: MidiNote[]
  readonly selection: number[]
  readonly sourceOffsetBeats: number
  readonly totalBeats: number
  readonly width: number
  readonly handlers: {
    start: (event: PointerEvent<HTMLElement>, index?: number) => void
    change: (value: number, index?: number) => void
    onPointerMove: (event: PointerEvent<HTMLElement>) => void
    onPointerUp: (event: PointerEvent<HTMLElement>) => void
    onPointerCancel: (event: PointerEvent<HTMLElement>) => void
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => void
  }
}) {
  const { t } = useTranslation()
  return (
    <div
      role="group"
      className="border-border bg-muted/30 relative border-t"
      style={{ width, height: VELOCITY_HEIGHT }}
      aria-label={t("detailMidi.velocityLane")}
    >
      <span className="text-muted-foreground pointer-events-none absolute top-1 right-1 text-[9px]">
        127
      </span>
      {notes.map((note, index) => {
        if (
          note.startBeat >= sourceOffsetBeats + totalBeats ||
          note.startBeat + note.lengthBeats <= sourceOffsetBeats
        )
          return null
        return (
          <button
            key={note.id ?? index}
            type="button"
            aria-label={`${t("detailMidi.velocity")} ${pitchName(note.pitch)}: ${note.velocity}`}
            className="group focus-visible:ring-ring pointer-events-none absolute bottom-0 h-full w-3 -translate-x-1/2 cursor-ns-resize touch-none outline-none focus-visible:ring-1"
            style={{
              left: (Math.max(0, note.startBeat - sourceOffsetBeats) / totalBeats) * width,
              zIndex: selection.includes(index) ? 2 : 1,
            }}
            onPointerDown={event => handlers.start(event, index)}
            onPointerMove={handlers.onPointerMove}
            onPointerUp={handlers.onPointerUp}
            onPointerCancel={handlers.onPointerCancel}
            onLostPointerCapture={handlers.onLostPointerCapture}
            onKeyDown={event => {
              if (!["ArrowUp", "ArrowDown"].includes(event.key)) return
              event.preventDefault()
              event.stopPropagation()
              handlers.change(note.velocity + (event.key === "ArrowUp" ? 1 : -1), index)
            }}
          >
            <span
              className={`absolute bottom-0 left-1/2 w-0.5 -translate-x-1/2 ${selection.includes(index) ? "bg-primary" : "bg-foreground/40"}`}
              style={{ height: `${(note.velocity / 127) * 100}%` }}
            >
              <span className="group-hover:ring-ring pointer-events-auto absolute -top-1 -left-1 size-2 rounded-full bg-inherit group-hover:ring-1" />
            </span>
          </button>
        )
      })}
    </div>
  )
}
