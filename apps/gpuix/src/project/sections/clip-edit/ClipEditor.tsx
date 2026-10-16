import { projectActions, useProjectState } from "@/project/adapters"
import { clipLabel } from "@/project/model/clip-label"
import { resolveContentColor } from "@/shared/theme/content-color"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { Button } from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import { ClipNameInput } from "./NameInput"
import { ClipEditorEnvironmentProvider } from "./environment"
import { AudioParameters } from "./audio/AudioParameters"
import { AudioWaveform } from "./audio/AudioWaveform"
import { MidiEditor } from "./midi/MidiEditor"
import { PatternSteps } from "./pattern/PatternSteps"
import type { PeakReader } from "@/project/model/backend"
import type { ClipEditorEnvironment } from "./environment"
import type { ClipEditorLabels } from "./labels"

/** Footer imports this sole ID-only editor slot contract. */
export interface ClipEditorSlot {
  readonly clipId: string
  readonly trackId: string
  readonly close: () => void
}

export interface ClipEditorProps extends ClipEditorSlot {
  readonly labels: ClipEditorLabels
  readonly readPeaks: PeakReader
  readonly environment: ClipEditorEnvironment
}

/**
Clip View for exactly one clip: the editor follows `clip.kind` (audio, MIDI or Pattern), never two
at once. Editing happens only here. Unhandled keys bubble to the window owner (Space plays), and
Cmd/Ctrl+Z from any non-text control in the editor is project undo/redo.
*/
export function ClipEditor({
  clipId,
  trackId,
  close,
  labels,
  readPeaks,
  environment,
}: ClipEditorProps) {
  const theme = useTheme()
  const transport = useProjectState(state => state.document.transport)
  const track = useProjectState(state => state.document.tracks.find(item => item.id === trackId))
  const clip = track?.clips.find(item => item.id === clipId)
  if (!clip || !track) return null
  const color = resolveContentColor(clip.color ?? track.color, theme.colors)
  const gap = theme.control["--spacing-control-gap"]
  const trackGap = theme.control["--spacing-control-track-gap"]
  return (
    <ClipEditorEnvironmentProvider value={environment}>
      <div
        testId="clip-editor"
        role="region"
        aria-label={labels.clipEditor}
        style={sx({
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
          backgroundColor: theme.colors.muted,
        })}
        onKeyDown={event => {
          const modifiers = event.modifiers
          if (
            !event.defaultPrevented &&
            (modifiers?.cmd || modifiers?.ctrl) &&
            !modifiers.alt &&
            event.key === "z"
          ) {
            event.preventDefault()
            event.stopPropagation()
            ;(modifiers.shift ? projectActions.redo : projectActions.undo)()
            return
          }
          environment.onRegionKey(event.keystrokeId)
        }}
      >
        <div
          style={sx({
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap,
            flexShrink: 0,
            paddingLeft: trackGap,
            paddingRight: trackGap,
            paddingTop: gap,
            paddingBottom: gap,
          })}
        >
          <div
            style={sx({
              width: trackGap * 2,
              height: trackGap * 2,
              flexShrink: 0,
              backgroundColor: color,
            })}
          />
          <ClipNameInput
            key={clip.id}
            clipId={clip.id}
            value={clip.label ?? clipLabel(clip, labels.creationNames)}
            label={labels.rename}
          />
          <text
            style={{
              color: theme.colors.mutedForeground,
              fontSize: theme.control["--text-control-track"],
            }}
          >
            {labels.kind[clip.kind]}
          </text>
          <div style={{ flexGrow: 1 }} />
          <Button
            iconOnly
            variant="ghost"
            label={labels.close}
            onClick={close}
            icon={<Icon name="X" />}
          />
        </div>
        {clip.kind === "audio" ? (
          <div
            key={clip.id}
            testId="audio-editor"
            style={sx({ display: "flex", flexDirection: "row", flexGrow: 1, minHeight: 0 })}
          >
            <AudioParameters clip={clip} bpm={transport.bpm} labels={labels.audio} />
            <AudioWaveform clip={clip} color={color} labels={labels.audio} readPeaks={readPeaks} />
          </div>
        ) : clip.kind === "midi" ? (
          <MidiEditor
            key={clip.id}
            readClip={() => clip}
            color={color}
            numerator={transport.numerator}
            labels={labels.midi}
          />
        ) : (
          <div
            key={clip.id}
            testId="pattern-editor"
            style={sx({ display: "flex", padding: trackGap, minHeight: 0 })}
          >
            <PatternSteps clip={clip} label={labels.step} color={color} />
          </div>
        )}
      </div>
    </ClipEditorEnvironmentProvider>
  )
}
