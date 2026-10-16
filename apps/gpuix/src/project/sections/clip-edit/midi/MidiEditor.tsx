import type { EventPayload } from "@gpuix/react"
import { useMemo } from "react"
import { usePreference } from "@/platform/settings"
import { useProjectEditGesture, projectActions } from "@/project/adapters"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { Button, DragPadNumber, ScrollArea } from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import { MidiRuler } from "./MidiRuler"
import { NoteGrid } from "./NoteGrid"
import { PianoKeys } from "./PianoKeys"
import { VelocityLane } from "./VelocityLane"
import { useMidiEditor } from "./useMidiEditor"
import { useMidiViewport } from "./useMidiViewport"
import type { MidiClip } from "@/project/model/types"
import type { MidiEditorLabels } from "../labels"

/**
Piano roll for one MIDI clip. Fold, zoom and scroll stay local; notes change only through the
editor's project transactions. Wheel scrolls (Shift for time), Cmd/Ctrl+wheel zooms time.
*/
export function MidiEditor({
  readClip,
  color,
  numerator,
  labels,
}: {
  readonly readClip: () => MidiClip
  readonly color: string
  readonly numerator: number
  readonly labels: MidiEditorLabels
}) {
  const theme = useTheme()
  const midi = usePreference("midi")
  const clip = readClip()
  const window = useMemo(
    () => ({
      sourceOffsetBeats: (clip.sourceOffsetBars ?? 0) * numerator,
      totalBeats: clip.lengthBars * numerator,
    }),
    [clip.sourceOffsetBars, clip.lengthBars, numerator]
  )
  const view = useMidiViewport(clip, window)
  const readNotes = useMemo(() => () => clip.notes, [clip.notes])
  const editor = useMidiEditor(clip, view.roll, theme.project.midiVelocityHeight)
  const loopGesture = useProjectEditGesture((loopBars: number) =>
    projectActions.updateClip(clip.id, { loopBars })
  )
  const gap = theme.control["--spacing-control-gap"]
  const trackGap = theme.control["--spacing-control-track-gap"]
  const fontSize = theme.control["--text-control-track"]
  const selectedNote = clip.notes[editor.currentNoteIndex ?? -1]
  const zoomTime = (direction: -1 | 1) => {
    editor.finish(true)
    view.zoomTime(direction)
  }
  const zoomPitch = (direction: -1 | 1) => {
    editor.finish(true)
    view.zoomPitch(direction)
  }
  const wheel = (event: EventPayload) => {
    const dx = event.deltaX ?? 0
    const dy = event.deltaY ?? 0
    if (event.modifiers?.cmd || event.modifiers?.ctrl) {
      if (dy) zoomTime(dy > 0 ? 1 : -1)
      return
    }
    // GPUI deltas are negative while content moves toward later positions.
    if (event.modifiers?.shift) view.scrollTo(view.roll.scrollX - (dy || dx), view.roll.scrollY)
    else view.scrollTo(view.roll.scrollX - dx, view.roll.scrollY - dy)
  }
  const muted = { color: theme.colors.mutedForeground, fontSize, flexShrink: 0 }
  const toolbar = sx({
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap,
    flexShrink: 0,
    paddingLeft: trackGap,
    paddingRight: trackGap,
    paddingTop: gap,
    paddingBottom: gap,
    borderBottomWidth: theme.design.editor.dividerStrokeWidth,
    borderColor: theme.colors.arrangementLine,
  })
  return (
    <div
      testId="midi-editor"
      style={sx({
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        minWidth: 0,
        minHeight: 0,
      })}
    >
      <ScrollArea
        testId="midi-toolbar"
        aria-label={labels.pianoRoll}
        orientation="horizontal"
        wheelToHorizontal
        height="auto"
        style={toolbar}
      >
        <Button
          label={labels.fold}
          active={view.fold}
          onActiveChange={() => {
            editor.finish(true)
            view.toggleFold()
          }}
        >
          {labels.fold}
        </Button>
        <Button
          label={labels.draw}
          active={editor.drawMode}
          onActiveChange={enabled => editor.latchDraw(enabled)}
        >
          {labels.draw}
        </Button>
        <text style={muted}>{labels.timeZoom}</text>
        <Button
          iconOnly
          label={labels.zoomOutTime}
          disabled={!view.canZoomTime.out}
          onClick={() => zoomTime(-1)}
          icon={<Icon name="Minus" />}
        />
        <Button
          iconOnly
          label={labels.zoomInTime}
          disabled={!view.canZoomTime.in}
          onClick={() => zoomTime(1)}
          icon={<Icon name="Plus" />}
        />
        <text style={muted}>{labels.pitchZoom}</text>
        <Button
          iconOnly
          label={labels.zoomOutPitch}
          disabled={!view.canZoomPitch.out}
          onClick={() => zoomPitch(-1)}
          icon={<Icon name="Minus" />}
        />
        <Button
          iconOnly
          label={labels.zoomInPitch}
          disabled={!view.canZoomPitch.in}
          onClick={() => zoomPitch(1)}
          icon={<Icon name="Plus" />}
        />
        <text style={muted}>{labels.loopBars}</text>
        <DragPadNumber
          testId="midi-loop-bars"
          label={labels.loopBars}
          value={clip.loopBars ?? clip.lengthBars}
          min={midi.loopStepBars}
          max={Math.max(clip.lengthBars, 1024)}
          step={midi.loopStepBars}
          defaultValue={clip.lengthBars}
          hideIcon
          format={value => labels.formats.number(value, "midi")}
          widthSamples={labels.formats.widthSamples.midi}
          onGestureStart={() => {
            editor.finish(true)
            loopGesture.onGestureStart()
          }}
          onChange={loopGesture.onChange}
          onGestureEnd={loopGesture.onGestureEnd}
          onGestureCancel={loopGesture.onGestureCancel}
        />
        <div style={{ flexGrow: 1 }} />
        <text style={muted}>
          {`${labels.gridStep} · ${labels.formats.number(editor.visibleSelection.length, "integer")} ${labels.selected}`}
        </text>
      </ScrollArea>
      <div style={sx({ display: "flex", flexDirection: "row", flexShrink: 0 })}>
        <div
          style={sx({
            width: theme.project.midiKeyWidth,
            flexShrink: 0,
            borderRightWidth: theme.design.editor.dividerStrokeWidth,
            borderBottomWidth: theme.design.editor.dividerStrokeWidth,
            borderColor: theme.colors.arrangementLine,
            backgroundColor: theme.colors.arrangementSurfaceAlt,
          })}
        />
        <MidiRuler
          roll={view.roll}
          numerator={numerator}
          loopBeats={(clip.loopBars ?? clip.lengthBars) * numerator}
          labels={labels}
        />
      </div>
      <div
        testId="midi-body"
        style={sx({ display: "flex", flexDirection: "row", flexGrow: 1, minHeight: 0 })}
        onScroll={wheel}
      >
        <PianoKeys
          roll={view.roll}
          label={labels.audition}
          formats={labels.formats}
          selectPitch={editor.selectPitch}
        />
        <NoteGrid
          hostRef={editor.host}
          roll={view.roll}
          readNotes={readNotes}
          selection={editor.visibleSelection}
          currentNoteIndex={editor.currentNoteIndex}
          marquee={editor.marquee}
          numerator={numerator}
          drawMode={editor.drawMode}
          label={labels.pianoRoll}
          formats={labels.formats}
          color={color}
          onLayout={event => {
            if (event.width !== undefined && event.height !== undefined)
              view.measure({ width: event.width, height: event.height })
          }}
          onMouseDown={editor.pressGrid}
          onMouseMove={editor.move}
          onMouseUp={editor.release}
          onKeyDown={editor.keyDown}
          onBlur={editor.blur}
        />
      </div>
      <div
        style={sx({
          display: "flex",
          flexDirection: "row",
          flexShrink: 0,
          borderTopWidth: theme.design.editor.dividerStrokeWidth,
          borderColor: theme.colors.arrangementLine,
        })}
      >
        <div
          style={sx({
            width: theme.project.midiKeyWidth,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap,
            borderRightWidth: theme.design.editor.dividerStrokeWidth,
            borderColor: theme.colors.arrangementLine,
          })}
        >
          <text style={muted}>{labels.velocity}</text>
          <DragPadNumber
            testId="midi-velocity-value"
            label={labels.velocity}
            value={selectedNote?.velocity ?? midi.velocity}
            min={1}
            max={127}
            step={1}
            hideIcon
            defaultValue={midi.velocity}
            format={value => labels.formats.number(value, "integer")}
            widthSamples={labels.formats.widthSamples.integer}
            disabled={!selectedNote}
            onGestureStart={editor.velocityGesture.onGestureStart}
            onChange={editor.setSelectedVelocity}
            onGestureEnd={editor.velocityGesture.onGestureEnd}
            onGestureCancel={editor.velocityGesture.onGestureCancel}
          />
        </div>
        <VelocityLane
          formats={labels.formats}
          hostRef={editor.velocityHost}
          roll={view.roll}
          readNotes={readNotes}
          selection={editor.visibleSelection}
          currentNoteIndex={editor.currentNoteIndex}
          label={labels.velocityLane}
          color={color}
          onVelocityChange={editor.changeVelocity}
          onActivateNote={editor.activateNote}
          onMouseDown={editor.pressVelocity}
          onMouseMove={editor.move}
          onMouseUp={editor.release}
        />
      </div>
    </div>
  )
}
