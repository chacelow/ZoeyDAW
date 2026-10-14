import type { MidiNote as Note } from "@/pages/project/model/types"

export function MidiNote({
  note,
  index,
  selected,
  sourceOffsetBeats,
  totalBeats,
}: {
  readonly note: Note
  readonly index: number
  readonly selected: boolean
  readonly sourceOffsetBeats: number
  readonly totalBeats: number
}) {
  const visibleStart = Math.max(note.startBeat, sourceOffsetBeats)
  const visibleEnd = Math.min(note.startBeat + note.lengthBeats, sourceOffsetBeats + totalBeats)
  if (visibleEnd <= visibleStart || note.pitch < 37 || note.pitch > 84) {
    return null
  }
  return (
    <div
      data-note-index={index}
      role="gridcell"
      aria-label={`Pitch ${note.pitch} · velocity ${note.velocity}`}
      aria-selected={selected}
      className={`border-foreground/60 bg-primary absolute z-10 h-[2.0833%] min-w-1 touch-none rounded-sm border ${selected ? "ring-ring ring-1 brightness-125" : ""}`}
      style={{
        left: `${((visibleStart - sourceOffsetBeats) / totalBeats) * 100}%`,
        width: `${((visibleEnd - visibleStart) / totalBeats) * 100}%`,
        top: `${((84 - note.pitch) / 48) * 100}%`,
      }}
    >
      <div
        data-note-edge="true"
        className="bg-foreground/30 absolute inset-y-0 right-0 w-1.5 cursor-ew-resize"
      />
    </div>
  )
}
