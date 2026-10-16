import { useCallback, useEffect, useRef } from "react"
import { usePreference } from "@/platform/settings"
import type { DisplayFormats } from "@/project/model/display-formats"
import type { EventPayload } from "@gpuix/react"
import { projectActions, useProjectState } from "@/project/adapters"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { useClipEditorEnvironment } from "../environment"
import { isBlackKey } from "./geometry"
import { visibleRows } from "./layout"
import type { RollGeometry } from "./layout"

export function PianoKeys({
  roll,
  label,
  formats,
  selectPitch,
}: {
  readonly roll: RollGeometry
  readonly label: string
  readonly formats: DisplayFormats
  readonly selectPitch: (pitch: number, extend: boolean, source: "pointer" | "keyboard") => void
}) {
  const theme = useTheme()
  const midi = usePreference("midi")
  const environment = useClipEditorEnvironment()
  const sounding = useProjectState(state => state.session.activeMidiNotes)
  const held = useRef<{ pitch: number; source: "pointer" | "keyboard" } | null>(null)
  const release = useCallback(() => {
    if (held.current !== null) projectActions.noteOff(held.current.pitch)
    held.current = null
  }, [])
  useEffect(
    () =>
      environment.subscribeWindowActive(active => {
        if (!active) release()
      }),
    [environment, release]
  )
  useEffect(() => release, [release])
  const { first, end } = visibleRows(roll)
  const keyWidth = theme.project.midiKeyWidth
  const press = (pitch: number, extend: boolean, source: "pointer" | "keyboard") => {
    release()
    held.current = { pitch, source }
    selectPitch(pitch, extend, source)
    projectActions.noteOn(pitch)
  }
  const labelled = roll.pitches.length < 24
  const ivory = theme.colors.pianoIvory
  const ebony = theme.colors.pianoEbony
  return (
    <div
      testId="midi-keys"
      style={sx({
        position: "relative",
        width: keyWidth,
        height: "100%",
        flexShrink: 0,
        overflow: "hidden",
        borderRightWidth: theme.design.editor.dividerStrokeWidth,
        borderColor: theme.colors.arrangementLine,
        backgroundColor: theme.colors.background,
      })}
      onMouseUp={release}
    >
      {roll.pitches.slice(first, end).map((pitch, offset) => {
        const row = first + offset
        const active = sounding.includes(pitch)
        const black = isBlackKey(pitch)
        return (
          <div
            key={pitch}
            role="button"
            tabIndex={0}
            aria-label={`${label} ${formats.pitchName(pitch, midi.octaveLabelOffset)}`}
            aria-pressed={active}
            testId={`midi-key-${pitch}`}
            style={sx({
              position: "absolute",
              left: 0,
              top: row * roll.rowHeight - roll.scrollY,
              width: keyWidth,
              height: roll.rowHeight,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingRight: theme.control["--spacing-control-gap"],
              borderBottomWidth: theme.design.editor.dividerStrokeWidth,
              borderColor: theme.colors.arrangementLine,
              fontSize: theme.control["--text-control-track"],
              keyboardFocusDim: false,
              color: active ? theme.colors.primaryForeground : black ? ivory : ebony,
              backgroundColor: active ? theme.colors.primary : black ? ebony : ivory,
              hover: active
                ? undefined
                : { backgroundColor: theme.colors.accent, color: theme.colors.accentForeground },
              focusVisible: {
                outlineWidth: theme.design.shape.focusRingWidth,
                outlineColor: theme.colors.ring,
                outlineOffset: -theme.design.shape.focusRingWidth,
              },
            })}
            onMouseDown={(event: EventPayload) => {
              if ((event.button ?? 0) !== 0) return
              press(
                pitch,
                Boolean(event.modifiers?.shift || event.modifiers?.cmd || event.modifiers?.ctrl),
                "pointer"
              )
            }}
            onMouseMove={event => {
              if (event.pressedButton !== 0) release()
            }}
            onMouseUp={release}
            onBlur={() => {
              if (held.current?.source === "keyboard") release()
            }}
            onKeyDown={event => {
              if (event.key !== "enter" || event.isHeld) return
              event.preventDefault()
              event.stopPropagation()
              press(pitch, Boolean(event.modifiers?.shift), "keyboard")
            }}
            onKeyUp={event => {
              if (event.key === "enter") release()
            }}
          >
            {pitch % 12 === 0 || labelled ? (
              <text style={{ pointerEvents: "none" }}>
                {formats.pitchName(pitch, midi.octaveLabelOffset)}
              </text>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
