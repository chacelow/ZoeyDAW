import { useMemo, useRef, useState } from "react"
import { usePreference } from "@/platform/settings"
import { PROJECT_TEMPLATE } from "@/project/defaults/template"
import { Button, ControlGroup, DragPadToggle, DropdownButton, ScrollArea } from "@/ui/controls"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { Icon } from "@/ui/controls/Icon"
import { projectActions, useProjectState } from "../../adapters"
import { growTimelineBars, timelineBars } from "../../model/selectors"
import { effectiveDrawMode } from "../../model/interaction-mode"
import type { TransportLabels } from "./labels"
import { TransportNumber } from "./TransportNumber"
import { PerformanceStatus } from "./PerformanceStatus"
import { metronomePhase, tappedTempo } from "./metronome"
import { MetronomeIndicator } from "./MetronomeIndicator"

const SCALE_ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const
const SCALE_MODES = [
  "major",
  "minor",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "locrian",
  "harmonic-minor",
  "melodic-minor",
  "pentatonic",
] as const
const BAR_LENGTHS = ["1-bar", "2-bar", "4-bar", "8-bar", "16-bar"] as const
export interface TransportBarProps {
  readonly labels: TransportLabels
  readonly onBack: () => void
  readonly onToggleBrowser: () => void
  readonly onDrawModeChange: (enabled: boolean) => void
  readonly reducedMotion: boolean
}

export function TransportBar({
  labels,
  onBack,
  onToggleBrowser,
  onDrawModeChange,
  reducedMotion,
}: TransportBarProps) {
  const theme = useTheme()
  const policy = usePreference("transport")
  const document_ = useProjectState(state => state.document)
  const workspace = useProjectState(state => state.workspace)
  const playing = useProjectState(state => state.session.playing)
  const position = useProjectState(state => state.session.position)
  const recording = useProjectState(state => state.session.recording)
  const timeSelection = useProjectState(state => state.session.timeSelection)
  const session = { playing, position, recording, timeSelection }
  const drawMode = useProjectState(effectiveDrawMode)
  const bars = useMemo(() => timelineBars(document_), [document_])
  const barMax = Math.max(
    999,
    growTimelineBars(bars, Math.max(session.position.bar, session.timeSelection?.endBar ?? 1)) + 1
  )
  const taps = useRef<number[]>([])
  const lastStop = useRef<number | null>(null)
  const meter = document_.transport
  const phase = metronomePhase(
    session.position,
    meter.numerator,
    session.playing,
    workspace.metronome
  )
  const gap = theme.transportControl["--spacing-control-track-gap"]
  const iconSize = theme.transportControl["--spacing-control-icon"]
  const [viewportWidth, setViewportWidth] = useState(0)
  const groupStyle = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap,
    flexShrink: 0,
  } as const
  return (
    <ScrollArea
      orientation="horizontal"
      wheelToHorizontal
      fill
      aria-label={labels.controls}
      testId="transport-scroll"
      onLayout={event => {
        if (event.width !== undefined) setViewportWidth(event.width)
      }}
      style={{
        height: theme.transportControl["--spacing-control-track"],
        flexShrink: 0,
        backgroundColor: theme.colors.muted,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: theme.project.transportColumnGap,
          minWidth: viewportWidth,
          alignSelf: "flex-start",
          flexShrink: 0,
          height: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexGrow: 1,
            flexBasis: 0,
            flexShrink: 0,
          }}
        >
          <div testId="transport-left" style={groupStyle}>
            <Button
              size="transport"
              iconOnly
              label={labels.toggleBrowser}
              onClick={onToggleBrowser}
            >
              <Icon name="LayoutGrid" size={iconSize} color={theme.colors.foreground} />
            </Button>
            <DragPadToggle
              size="transport"
              value={workspace.link}
              onChange={projectActions.setLink}
              label={labels.link}
              labelOn={labels.link}
              labelOff={labels.link}
            />
            <Button
              size="transport"
              label={labels.tap}
              onClick={() => {
                const result = tappedTempo(taps.current, performance.now(), policy)
                taps.current = result.taps
                if (result.bpm !== null) projectActions.setBpm(result.bpm)
              }}
            >
              {labels.tap}
            </Button>
            <TransportNumber
              testId="transport-bpm"
              value={meter.bpm}
              onChange={projectActions.setBpm}
              min={20}
              max={999}
              step={0.01}
              dragStep={1}
              defaultValue={PROJECT_TEMPLATE.transport.bpm}
              label={labels.bpm}
              format={value => labels.formats.number(value, "bpm")}
              widthSamples={labels.formats.widthSamples.bpm}
            />
            <ControlGroup label={labels.meter} separator="slash">
              <TransportNumber
                value={meter.numerator}
                onChange={projectActions.setNumerator}
                min={1}
                max={16}
                step={1}
                defaultValue={PROJECT_TEMPLATE.transport.numerator}
                label={labels.numerator}
                format={value => labels.formats.number(value, "integer")}
              />
              <TransportNumber
                value={meter.denominator}
                onChange={projectActions.setDenominator}
                min={1}
                max={32}
                step={1}
                defaultValue={PROJECT_TEMPLATE.transport.denominator}
                label={labels.denominator}
                format={value => labels.formats.number(value, "integer")}
              />
            </ControlGroup>
            <Button
              size="transport"
              iconOnly
              label={`${labels.metronome} — ${labels.metronomeSilent}`}
              active={workspace.metronome}
              onActiveChange={projectActions.setMetronome}
            >
              <MetronomeIndicator
                phase={phase}
                enabled={workspace.metronome}
                reducedMotion={reducedMotion}
              />
            </Button>
            <ControlGroup label={labels.scale} separator="line">
              <DropdownButton
                size="transport"
                value={document_.scaleRoot}
                label={labels.scaleRoot}
                matchTriggerWidth={false}
                items={SCALE_ROOTS.map(id => ({ id, label: id }))}
                onChange={value => projectActions.setProject({ scaleRoot: value })}
              />
              <DropdownButton
                testId="transport-scale-mode"
                size="transport"
                value={document_.scaleMode}
                label={labels.scaleMode}
                matchTriggerWidth={false}
                items={SCALE_MODES.map(id => ({ id, label: labels.scaleModes[id] }))}
                onChange={value => projectActions.setProject({ scaleMode: value })}
              />
            </ControlGroup>
            <TransportNumber
              value={document_.groove}
              onChange={value => projectActions.setProject({ groove: value })}
              min={0}
              max={100}
              step={1}
              defaultValue={PROJECT_TEMPLATE.musical.groove}
              label={labels.groove}
              icon={
                <Icon name="AudioWaveform" size={iconSize} color={theme.colors.mutedForeground} />
              }
              format={value => labels.formats.percent(value / 100)}
            />
            <DropdownButton
              testId="transport-bar-length"
              size="transport"
              value={meter.barLength}
              label={labels.barLength}
              matchTriggerWidth={false}
              items={[
                { type: "heading", id: "short", label: labels.shortLengths },
                ...BAR_LENGTHS.slice(0, 3).map(id => ({ id, label: labels.barLengths[id] })),
                { type: "separator", id: "separator" },
                { type: "heading", id: "long", label: labels.longLengths },
                ...BAR_LENGTHS.slice(3).map(id => ({ id, label: labels.barLengths[id] })),
              ]}
              onChange={projectActions.setBarLength}
            />
          </div>
        </div>
        <div testId="transport-center" style={groupStyle}>
          <DragPadToggle
            size="transport"
            value={workspace.follow}
            onChange={projectActions.setFollow}
            label={labels.follow}
            icon={
              <Icon
                name="Locate"
                size={iconSize}
                color={workspace.follow ? theme.colors.primaryForeground : theme.colors.foreground}
              />
            }
          />
          <ControlGroup label={labels.position} separator="dot">
            <TransportNumber
              value={session.position.bar}
              onChange={bar => projectActions.setPosition({ bar })}
              min={1}
              max={barMax}
              step={1}
              defaultValue={PROJECT_TEMPLATE.position.bar}
              label={labels.bar}
              format={value => labels.formats.number(value, "integer")}
            />
            <TransportNumber
              value={session.position.beat}
              onChange={beat => projectActions.setPosition({ beat })}
              min={1}
              max={meter.numerator}
              step={1}
              defaultValue={PROJECT_TEMPLATE.position.beat}
              label={labels.beat}
              format={value => labels.formats.number(value, "integer")}
            />
            <TransportNumber
              value={session.position.sixteenth}
              onChange={sixteenth => projectActions.setPosition({ sixteenth })}
              min={1}
              max={4}
              step={1}
              defaultValue={PROJECT_TEMPLATE.position.sixteenth}
              label={labels.sixteenth}
              format={value => labels.formats.number(Math.floor(value), "integer")}
            />
          </ControlGroup>
          <Button
            size="transport"
            iconOnly
            label={session.playing ? labels.pause : labels.play}
            active={session.playing}
            testId="transport-play"
            onActiveChange={projectActions.togglePlay}
          >
            <Icon
              name={session.playing ? "Pause" : "Play"}
              filled
              size={iconSize}
              color={session.playing ? theme.colors.primaryForeground : theme.colors.foreground}
            />
          </Button>
          <Button
            size="transport"
            iconOnly
            label={labels.stop}
            testId="transport-stop"
            onClick={() => {
              const now = performance.now()
              projectActions.stop()
              if (lastStop.current !== null && now - lastStop.current < policy.stopRepeatMs)
                projectActions.rewindToStart()
              lastStop.current = now
            }}
          >
            <Icon name="Square" filled size={iconSize} color={theme.colors.foreground} />
          </Button>
          <Button
            size="transport"
            iconOnly
            label={labels.rewind}
            onClick={projectActions.rewindToStart}
          >
            <Icon name="SkipBack" filled size={iconSize} color={theme.colors.foreground} />
          </Button>
          <Button
            size="transport"
            iconOnly
            label={labels.record}
            active={session.recording}
            variant={session.recording ? "destructive" : "ghost"}
            testId="transport-record"
            onActiveChange={projectActions.toggleRecording}
          >
            <Icon
              name="Circle"
              filled
              size={iconSize}
              color={session.recording ? theme.colors.destructive : theme.colors.foreground}
            />
          </Button>
          <DragPadToggle
            size="transport"
            value={meter.loop.enabled}
            onChange={enabled => projectActions.setLoop({ enabled })}
            label={labels.loop}
            icon={
              <Icon
                name="Repeat"
                size={iconSize}
                color={
                  meter.loop.enabled ? theme.colors.primaryForeground : theme.colors.foreground
                }
              />
            }
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "flex-end",
            flexGrow: 1,
            flexBasis: 0,
            flexShrink: 0,
          }}
        >
          <div testId="transport-right" style={groupStyle}>
            <DragPadToggle
              size="transport"
              value={drawMode}
              onChange={onDrawModeChange}
              label={labels.drawMode}
              icon={
                <Icon
                  name="Pencil"
                  size={iconSize}
                  color={drawMode ? theme.colors.primaryForeground : theme.colors.foreground}
                />
              }
            />
            <DragPadToggle
              size="transport"
              value={workspace.computerKeyboard}
              onChange={enabled => projectActions.setMode("computerKeyboard", enabled)}
              label={labels.computerKeyboard}
              icon={
                <Icon
                  name="Keyboard"
                  size={iconSize}
                  color={
                    workspace.computerKeyboard
                      ? theme.colors.primaryForeground
                      : theme.colors.foreground
                  }
                />
              }
            />
            <PerformanceStatus labels={labels} />
            <Button size="transport" iconOnly label={labels.back} onClick={onBack}>
              <Icon name="ChevronLeft" size={iconSize} color={theme.colors.foreground} />
            </Button>
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}

export type { TransportLabels } from "./labels"
