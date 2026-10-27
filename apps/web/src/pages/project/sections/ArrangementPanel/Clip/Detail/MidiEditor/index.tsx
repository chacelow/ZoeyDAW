import { useTranslation } from "@zoeymind/i18n"
import { Button } from "@zoeymind/ui"
import { MidiNote } from "../MidiNote"
import { MidiParameters } from "./MidiParameters"
import { useMidiEditor } from "./useMidiEditor"
import { useMidiViewport } from "./useMidiViewport"
import { PianoKeyboard } from "./PianoKeyboard"
import { MidiRuler } from "./MidiRuler"
import { VelocityLane } from "./VelocityLane"
import { isBlackKey, KEY_WIDTH, RULER_HEIGHT, VELOCITY_HEIGHT } from "./geometry"
import type { MidiClipContent, PatternClipContent } from "@zoeydaw/project-core/types"

export function MidiEditor({
  clip,
  sourceClip = clip,
  numerator,
  color,
}: {
  readonly clip: MidiClipContent
  readonly sourceClip?: MidiClipContent | PatternClipContent
  readonly numerator: number
  readonly color: string
}) {
  const { t } = useTranslation()
  const view = useMidiViewport(clip, clip.lengthBars * numerator)
  const editor = useMidiEditor(clip, numerator, view.pitches)
  const selectedNote = clip.notes[editor.visibleSelection[0]]
  const { sourceOffsetBeats, totalBeats } = editor.window
  const cellWidth = view.width / totalBeats / 4
  return (
    <div
      data-clip-editor
      data-midi-editor
      className="flex min-h-0 min-w-0 flex-1 overflow-hidden text-xs"
    >
      <MidiParameters
        clip={clip}
        sourceClip={sourceClip}
        color={color}
        gridStep={t("detailMidi.gridStep")}
        selectedCount={editor.visibleSelection.length}
      />
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        onBlur={event => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !event.currentTarget.contains(event.relatedTarget)
          )
            editor.blur()
        }}
      >
        <div className="midi-detail-toolbar border-border gap-control-gap flex items-center overflow-x-auto border-b px-2">
          <Button
            size="control"
            variant={view.fold ? "default" : "secondary"}
            aria-pressed={view.fold}
            onClick={() => {
              editor.finish(true)
              view.setFold(value => !value)
            }}
          >
            {t("detailMidi.fold")}
          </Button>
          <Button
            size="control"
            variant={editor.drawMode ? "default" : "secondary"}
            aria-pressed={editor.drawMode}
            title={t("detailMidi.drawHelp")}
            onClick={() => {
              editor.finish(true)
              editor.setDrawMode(!editor.drawMode)
            }}
          >
            {t("detailMidi.draw")}
          </Button>
          <span className="text-muted-foreground shrink-0">{t("detailMidi.timeZoom")}</span>
          <Button
            size="control-icon"
            variant="secondary"
            aria-label={t("detailMidi.zoomOutTime")}
            disabled={view.horizontalZoom <= 0.25}
            onClick={() => {
              editor.finish(true)
              view.setHorizontalZoom(value => Math.max(0.25, value / 2))
            }}
          >
            −
          </Button>
          <Button
            size="control-icon"
            variant="secondary"
            aria-label={t("detailMidi.zoomInTime")}
            disabled={view.horizontalZoom >= 16}
            onClick={() => {
              editor.finish(true)
              view.setHorizontalZoom(value => Math.min(16, value * 2))
            }}
          >
            +
          </Button>
          <span className="text-muted-foreground shrink-0">{t("detailMidi.pitchZoom")}</span>
          <Button
            size="control-icon"
            variant="secondary"
            aria-label={t("detailMidi.zoomOutPitch")}
            disabled={view.verticalZoom <= 1 / 3}
            onClick={() => {
              editor.finish(true)
              view.setVerticalZoom(value => Math.max(1 / 3, value / 1.5))
            }}
          >
            −
          </Button>
          <Button
            size="control-icon"
            variant="secondary"
            aria-label={t("detailMidi.zoomInPitch")}
            disabled={view.verticalZoom >= 2.5}
            onClick={() => {
              editor.finish(true)
              view.setVerticalZoom(value => Math.min(2.5, value * 1.5))
            }}
          >
            +
          </Button>
          <label className="text-muted-foreground gap-control-gap flex shrink-0 items-center">
            {t("detailMidi.loopBars")}
            <input
              type="number"
              min={0.0625}
              step={0.25}
              value={clip.loopBars ?? clip.lengthBars}
              aria-label={t("detailMidi.loopBars")}
              className="border-border bg-input/30 text-foreground h-control-h w-14 rounded-sm border text-center"
              onChange={event => {
                if (event.currentTarget.value !== "")
                  editor.changeLoopBars(Number(event.currentTarget.value))
              }}
            />
          </label>
          <span
            className="text-muted-foreground ml-auto shrink-0 text-[10px]"
            title={t("detailMidi.help")}
          >
            {t("detailMidi.gridStep")} · {editor.visibleSelection.length} {t("detailMidi.selected")}
          </span>
        </div>
        <div
          ref={view.viewport}
          className="relative min-h-12 flex-1 overflow-auto overscroll-contain [overflow-anchor:none]"
          onScroll={event => view.setScrollLeft(event.currentTarget.scrollLeft)}
        >
          <div style={{ width: view.width + KEY_WIDTH }}>
            <div className="bg-background sticky top-0 z-30 flex" style={{ height: RULER_HEIGHT }}>
              <div
                className="border-border bg-background text-muted-foreground sticky left-0 z-40 flex shrink-0 items-end border-r border-b p-1 text-[9px]"
                style={{ width: KEY_WIDTH }}
              >
                {t("detailMidi.pitch")}
              </div>
              <MidiRuler
                {...editor.window}
                numerator={numerator}
                width={view.width}
                loopBeats={(clip.loopBars ?? clip.lengthBars) * numerator}
              />
            </div>
            <div className="relative flex">
              <PianoKeyboard
                pitches={view.pitches}
                rowHeight={view.rowHeight}
                selectPitch={editor.selectPitch}
              />
              <div
                ref={editor.focus}
                tabIndex={0}
                role="grid"
                aria-label={t("detailMidi.pianoRoll")}
                aria-rowcount={view.pitches.length}
                aria-colcount={Math.ceil(totalBeats * 4)}
                title={t("detailMidi.help")}
                className={`focus-visible:ring-ring relative shrink-0 touch-none outline-none focus-visible:ring-1 ${editor.drawMode ? "cursor-crosshair" : "cursor-default"}`}
                style={{
                  width: view.width,
                  height: view.pitches.length * view.rowHeight,
                  backgroundImage: `repeating-linear-gradient(to right, color-mix(in oklch, var(--border) 70%, transparent) 0 1px, transparent 1px ${cellWidth}px)`,
                }}
                {...editor.grid}
              >
                {view.pitches.map((pitch, row) => (
                  <div
                    key={pitch}
                    className={`border-border/50 pointer-events-none absolute inset-x-0 border-b ${isBlackKey(pitch) ? "bg-foreground/5" : ""}`}
                    style={{ top: row * view.rowHeight, height: view.rowHeight }}
                  />
                ))}
                {clip.notes.map((note, index) => (
                  <MidiNote
                    key={note.id ?? index}
                    note={note}
                    index={index}
                    selected={editor.visibleSelection.includes(index)}
                    sourceOffsetBeats={sourceOffsetBeats}
                    totalBeats={totalBeats}
                    pitches={view.pitches}
                    rowHeight={view.rowHeight}
                  />
                ))}
                {editor.marquee ? (
                  <div
                    className="border-primary bg-primary/20 pointer-events-none absolute z-20 border"
                    style={{
                      left: editor.marquee.x,
                      top: editor.marquee.y,
                      width: editor.marquee.width,
                      height: editor.marquee.height,
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <div
          className="border-border flex shrink-0 overflow-hidden border-t"
          style={{ height: VELOCITY_HEIGHT }}
        >
          <div
            className="bg-background text-muted-foreground z-20 flex shrink-0 flex-col items-center justify-center gap-1 text-[9px]"
            style={{ width: KEY_WIDTH }}
          >
            {t("detailMidi.velocity")}
            <input
              type="number"
              min={1}
              max={127}
              value={selectedNote?.velocity ?? ""}
              disabled={!selectedNote}
              aria-label={t("detailMidi.selectedVelocity")}
              className="border-border bg-input/30 text-foreground w-11 rounded-sm border text-center text-xs"
              onChange={event => {
                if (event.currentTarget.value !== "")
                  editor.velocity.change(Number(event.currentTarget.value))
              }}
            />
          </div>
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <div style={{ transform: `translateX(${-view.scrollLeft}px)` }}>
              <VelocityLane
                notes={clip.notes}
                selection={editor.visibleSelection}
                {...editor.window}
                width={view.width}
                handlers={editor.velocity}
              />
            </div>
          </div>
        </div>
        <div className="text-muted-foreground flex shrink-0 items-center gap-2 px-2 py-0.5 text-[10px]">
          {selectedNote ? (
            <label className="flex items-center gap-2">
              {t("detailMidi.velocity")}
              <input
                type="range"
                min={1}
                max={127}
                value={selectedNote.velocity}
                aria-label={t("detailMidi.velocity")}
                className="h-3 w-24"
                onPointerDown={event => editor.velocity.start(event)}
                onPointerUp={editor.velocity.onPointerUp}
                onPointerCancel={editor.velocity.onPointerCancel}
                onLostPointerCapture={editor.velocity.onLostPointerCapture}
                onChange={event => editor.velocity.change(Number(event.currentTarget.value))}
              />
              {selectedNote.velocity}
            </label>
          ) : (
            <span className="truncate">{t("detailMidi.help")}</span>
          )}
        </div>
      </div>
    </div>
  )
}
