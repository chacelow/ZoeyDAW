import { useMemo, useRef, useState } from "react"
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
import { transportColumns } from "./layout"
import type { TransportMeasurements } from "./layout"

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
  const document_ = useProjectState(state => state.document)
  const workspace = useProjectState(state => state.workspace)
  const session = useProjectState(state => state.session)
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
  const [measurements, setMeasurements] = useState<TransportMeasurements>({
    viewport: 0,
    left: 0,
    center: 0,
    right: 0,
  })
  const columns = useMemo(
    () => transportColumns(measurements, theme.project.transportColumnGap),
    [measurements, theme.project.transportColumnGap]
  )
  const measured =
    measurements.viewport > 0 &&
    measurements.left > 0 &&
    measurements.center > 0 &&
    measurements.right > 0
  function measure(part: keyof TransportMeasurements, width: number | undefined) {
    if (width !== undefined)
      setMeasurements(current =>
        current[part] === width ? current : { ...current, [part]: width }
      )
  }
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
      fill
      aria-label={labels.controls}
      testId="transport-scroll"
      onLayout={event => measure("viewport", event.width)}
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
          minWidth: "100%",
          width: measured ? columns.content : undefined,
          height: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            width: measured ? columns.left : undefined,
            flexGrow: measured ? 0 : 1,
            flexShrink: 0,
          }}
        >
          <div
            testId="transport-left"
            style={groupStyle}
            onLayout={event => measure("left", event.width)}
          >
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
                const result = tappedTempo(taps.current, performance.now())
                taps.current = result.taps
                if (result.bpm !== null) projectActions.setBpm(result.bpm)
              }}
            >
              {labels.tap}
            </Button>
            <TransportNumber
              hideIcon
              value={meter.bpm}
              onChange={projectActions.setBpm}
              min={20}
              max={999}
              step={0.01}
              defaultValue={120}
              label={labels.bpm}
              format={value => value.toFixed(2)}
              widthSamples={["999.99"]}
            />
            <ControlGroup label={labels.meter} separator="slash">
              <TransportNumber
                value={meter.numerator}
                onChange={projectActions.setNumerator}
                min={1}
                max={16}
                step={1}
                defaultValue={4}
                label={labels.numerator}
              />
              <TransportNumber
                value={meter.denominator}
                onChange={projectActions.setDenominator}
                min={1}
                max={32}
                step={1}
                defaultValue={4}
                label={labels.denominator}
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
              defaultValue={0}
              label={labels.groove}
              icon={
                <Icon name="AudioWaveform" size={iconSize} color={theme.colors.mutedForeground} />
              }
              format={value => `${Math.round(value)}%`}
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
        <div
          testId="transport-center"
          style={groupStyle}
          onLayout={event => measure("center", event.width)}
        >
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
              defaultValue={1}
              label={labels.bar}
            />
            <TransportNumber
              value={session.position.beat}
              onChange={beat => projectActions.setPosition({ beat })}
              min={1}
              max={meter.numerator}
              step={1}
              defaultValue={1}
              label={labels.beat}
            />
            <TransportNumber
              value={session.position.sixteenth}
              onChange={sixteenth => projectActions.setPosition({ sixteenth })}
              min={1}
              max={4}
              step={1}
              defaultValue={1}
              label={labels.sixteenth}
              format={value => String(Math.floor(value))}
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
              if (lastStop.current !== null && now - lastStop.current < 450)
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
            width: measured ? columns.right : undefined,
            flexGrow: measured ? 0 : 1,
            flexShrink: 0,
          }}
        >
          <div
            testId="transport-right"
            style={groupStyle}
            onLayout={event => measure("right", event.width)}
          >
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
