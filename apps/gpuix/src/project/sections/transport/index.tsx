import { useMemo, useRef } from "react"
import {
  Button,
  ControlGroup,
  DragPadToggle,
  DropdownButton,
  ScrollArea,
} from "../../../ui/controls"
import { useTheme } from "../../../shared/theme/ThemeProvider"
import { projectActions, useProjectState } from "../../adapters"
import { growTimelineBars, timelineBars } from "../../model/selectors"
import { effectiveDrawMode } from "../../model/interaction-mode"
import type { TransportLabels } from "./labels"
import { TransportNumber } from "./TransportNumber"
import { PerformanceStatus } from "./PerformanceStatus"
import { metronomePhase, tappedTempo } from "./metronome"

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
  readonly reducedMotion?: boolean
}

export function TransportBar({
  labels,
  onBack,
  onToggleBrowser,
  reducedMotion = false,
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
  const swing = reducedMotion ? 0 : phase.swing
  const gap = theme.transportControl["--spacing-control-track-gap"]
  const groupStyle = { display: "flex", alignItems: "center", gap, flexShrink: 0 } as const
  return (
    <ScrollArea
      orientation="horizontal"
      fill
      aria-label={labels.controls}
      testId="transport-scroll"
      style={{
        height: theme.transportControl["--spacing-control-track"],
        flexShrink: 0,
        backgroundColor: theme.colors.muted,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: theme.project.transportColumnGap,
          minWidth: "100%",
          height: "100%",
        }}
      >
        <div style={groupStyle}>
          <Button size="transport" iconOnly label={labels.toggleBrowser} onClick={onToggleBrowser}>
            ▥
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
              max={32}
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
            onClick={() => projectActions.setMetronome(!workspace.metronome)}
          >
            <svg
              aria-hidden="true"
              source={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 21L10 3H14L19 21Z" fill="none" stroke="currentColor" stroke-width="1"/><path d="M12 20L${12 + swing * 7} 6" stroke="currentColor" stroke-width="2"/><circle cx="5" cy="6" r="3" fill="${phase.side < 0 ? "currentColor" : "none"}" stroke="currentColor"/><circle cx="19" cy="6" r="3" fill="${phase.side > 0 ? "currentColor" : "none"}" stroke="currentColor"/></svg>`}
              style={{
                width: theme.transportControl["--spacing-control-icon"],
                height: theme.transportControl["--spacing-control-icon"],
              }}
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
            format={value => `${Math.round(value)}%`}
          />
          <DropdownButton
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
        <div style={groupStyle}>
          <DragPadToggle
            size="transport"
            value={workspace.follow}
            onChange={projectActions.setFollow}
            label={labels.follow}
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
            onClick={projectActions.togglePlay}
          >
            {session.playing ? "Ⅱ" : "▶"}
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
            ■
          </Button>
          <Button
            size="transport"
            iconOnly
            label={labels.rewind}
            onClick={projectActions.rewindToStart}
          >
            |◀
          </Button>
          <Button
            size="transport"
            iconOnly
            label={labels.record}
            active={session.recording}
            variant="destructive"
            testId="transport-record"
            onClick={projectActions.toggleRecording}
          >
            ●
          </Button>
          <DragPadToggle
            size="transport"
            value={meter.loop.enabled}
            onChange={enabled => projectActions.setLoop({ enabled })}
            label={labels.loop}
          />
        </div>
        <div style={{ flexGrow: 1 }} />
        <div style={groupStyle}>
          <DragPadToggle
            size="transport"
            value={drawMode}
            onChange={enabled => projectActions.setMode("drawMode", enabled)}
            label={labels.drawMode}
          />
          <DragPadToggle
            size="transport"
            value={workspace.computerKeyboard}
            onChange={enabled => projectActions.setMode("computerKeyboard", enabled)}
            label={labels.computerKeyboard}
          />
          <PerformanceStatus labels={labels} />
          <Button size="transport" iconOnly label={labels.back} onClick={onBack}>
            ‹
          </Button>
        </div>
      </div>
    </ScrollArea>
  )
}

export type { TransportLabels } from "./labels"
export { handleTransportKeyDown } from "./keyboard"
