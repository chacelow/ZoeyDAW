import { pitchName } from "../MidiEditor/geometry"
import type { MidiNote as Note } from "@zoeydaw/project-core/types"

export function MidiNote({
  note,
  index,
  selected,
  sourceOffsetBeats,
  totalBeats,
  pitches,
  rowHeight,
}: {
  readonly note: Note
  readonly index: number
  readonly selected: boolean
  readonly sourceOffsetBeats: number
  readonly totalBeats: number
  readonly pitches: readonly number[]
  readonly rowHeight: number
}) {
  const visibleStart = Math.max(note.startBeat, sourceOffsetBeats)
  const visibleEnd = Math.min(note.startBeat + note.lengthBeats, sourceOffsetBeats + totalBeats)
  const row = pitches.indexOf(note.pitch)
  if (visibleEnd <= visibleStart || row === -1) return null
  return (
    <div
      data-note-index={index}
      role="gridcell"
      aria-label={`${pitchName(note.pitch)} · ${note.velocity}`}
      aria-selected={selected}
      className={`border-foreground/40 bg-primary text-primary-foreground absolute z-10 min-w-1 touch-none overflow-hidden rounded-sm border text-[9px] select-none ${selected ? "ring-ring ring-1 brightness-125" : "opacity-80"}`}
      style={{
        left: `${((visibleStart - sourceOffsetBeats) / totalBeats) * 100}%`,
        width: `${((visibleEnd - visibleStart) / totalBeats) * 100}%`,
        top: row * rowHeight + 1,
        height: rowHeight - 2,
      }}
    >
      <span className="pointer-events-none px-1 leading-none">{pitchName(note.pitch)}</span>
      <div
        data-note-edge="true"
        className="bg-foreground/30 absolute inset-y-0 right-0 w-1.5 cursor-ew-resize"
      />
    </div>
  )
}
