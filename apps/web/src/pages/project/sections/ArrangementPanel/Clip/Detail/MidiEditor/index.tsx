import { useTranslation } from "@zoeymind/i18n"
import { MidiNote } from "../MidiNote"
import { useMidiEditor } from "./useMidiEditor"
import type { MidiClip } from "@/pages/project/model/types"

export function MidiEditor({
  clip,
  numerator,
}: {
  readonly clip: MidiClip
  readonly numerator: number
}) {
  const { t } = useTranslation()
  const editor = useMidiEditor(clip, numerator)
  const { sourceOffsetBeats, totalBeats } = editor.window
  const selectedNote = clip.notes[editor.visibleSelection[0]]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-2 text-xs">
      <div className="text-muted-foreground mb-1">{t("arrangement.midiEditorHelp")}</div>
      <div
        ref={editor.focus}
        tabIndex={0}
        role="grid"
        aria-label={t("arrangement.midiEditorHelp")}
        className="border-border focus-visible:ring-ring relative min-h-28 flex-1 cursor-crosshair touch-none overflow-hidden rounded border outline-none focus-visible:ring-1"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px calc(100% / 16)), repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px calc(100% / 48))",
        }}
        {...editor.grid}
      >
        {clip.notes.map((note, index) => (
          <MidiNote
            key={note.id ?? index}
            note={note}
            index={index}
            selected={editor.visibleSelection.includes(index)}
            sourceOffsetBeats={sourceOffsetBeats}
            totalBeats={totalBeats}
          />
        ))}
      </div>
      {selectedNote ? (
        <label className="text-muted-foreground mt-1 flex items-center gap-2">
          {t("arrangement.velocity")}
          <input
            type="range"
            min={1}
            max={127}
            value={selectedNote.velocity}
            aria-label={t("arrangement.velocity")}
            {...editor.velocity}
          />
          {selectedNote.velocity}
        </label>
      ) : null}
    </div>
  )
}
