import { useRef } from "react"
import { HandTap, Link as LinkIcon } from "@phosphor-icons/react"
import { Button, ControlGroup, DragPadNumber, DragPadToggle, useInfoBinding } from "@zoeymind/ui"
import { useTranslation } from "@zoeymind/i18n"
import { projectActions, useProjectEditGesture, useProjectState } from "@/pages/project/adapters"
import { MetronomeIcon } from "./MetronomeIcon"

export function TempoControls() {
  const { t } = useTranslation()
  const buttonInfo = useInfoBinding({ type: "button" })
  const link = useProjectState(s => s.workspace.link)
  const metronome = useProjectState(s => s.workspace.metronome)
  const bpm = useProjectState(s => s.document.transport.bpm)
  const numerator = useProjectState(s => s.document.transport.numerator)
  const denominator = useProjectState(s => s.document.transport.denominator)
  const playing = useProjectState(s => s.session.playing)
  const positionBeat = useProjectState(s => s.session.position.beat)
  const { setLink } = projectActions
  const taps = useRef<number[]>([])
  const { setBpm } = projectActions
  const { setNumerator } = projectActions
  const { setDenominator } = projectActions
  const bpmGesture = useProjectEditGesture(setBpm)
  const numeratorGesture = useProjectEditGesture(setNumerator)
  const denominatorGesture = useProjectEditGesture(setDenominator)
  return (
    <>
      <DragPadToggle
        value={link}
        onChange={setLink}
        label={t("project.transport.link", "Link")}
        description={t("project.transport.linkHint", "与同网段其它客户端共享 tempo")}
        icon={<LinkIcon weight="fill" />}
      />
      <Button
        variant="ghost"
        size="control"
        className="bg-muted hover:bg-accent"
        onClick={() => {
          const now = performance.now()
          taps.current = [...taps.current.filter(time => now - time < 2500), now].slice(-5)
          if (taps.current.length < 2) {
            return
          }
          const intervals = taps.current.slice(1).map((time, index) => time - taps.current[index])
          projectActions.setBpm(
            60_000 / (intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length)
          )
        }}
        {...buttonInfo}
        aria-label={t("project.transport.tap", "Tap Tempo")}
      >
        <HandTap weight="fill" aria-hidden />
        TAP
      </Button>
      <DragPadNumber
        value={bpm}
        {...bpmGesture}
        min={20}
        max={999}
        step={0.01}
        defaultValue={120}
        label={t("project.transport.bpm", "BPM")}
        description={t("project.transport.bpmHint", "工程播放速度；Shift 精细；双击 reset")}
        format={v => v.toFixed(2)}
        sensitivity={0.0015}
      />
      <ControlGroup label={t("project.transport.sig", "拍号")} separator="slash">
        <DragPadNumber
          value={numerator}
          {...numeratorGesture}
          min={1}
          max={16}
          step={1}
          defaultValue={4}
          label={t("project.transport.sigNum", "拍号 - 分子")}
          description={t("project.transport.sigNumHint", "一小节的拍数")}
          format={v => String(Math.round(v))}
        />
        <DragPadNumber
          value={denominator}
          {...denominatorGesture}
          min={1}
          max={32}
          step={1}
          defaultValue={4}
          label={t("project.transport.sigDen", "拍号 - 分母")}
          description={t("project.transport.sigDenHint", "一拍的音符时值")}
          format={v => String(Math.round(v))}
        />
      </ControlGroup>

      <DragPadToggle
        value={metronome}
        onChange={projectActions.setMetronome}
        label={t("project.transport.metronome", "节拍器")}
        description={t("project.transport.metronomeHint", "播放与录音时发出节拍声")}
        icon={<MetronomeIcon playing={playing} active={metronome} beat={positionBeat} />}
      />
    </>
  )
}
