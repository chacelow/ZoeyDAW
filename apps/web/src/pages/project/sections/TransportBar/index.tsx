/**
 * TransportBar — Ableton 风格三栏 Header。
 *
 * Left   —— Browser 开关 · Link · Tap · BPM · 拍号 · 音阶根/调式 · Groove · Bar 长度
 * Center —— Follow(⊙) · 位置 · Play · Stop · Record · Loop(↻)
 * Right  —— Back
 *
 * 宽度预留（刚好容纳最宽文本，不留 slack）：
 *   BPM "999.99"           min-w-[58px]
 *   位置 "999.4.16"        min-w-[72px]
 *   拍号单字段             min-w-[32px]
 *   音阶根                 min-w-[44px]
 *   调式                   min-w-[72px]
 *   Groove "100%"          min-w-[48px]
 *   Bar 长度               min-w-[64px]
 */
import { useEffect, useMemo, useRef } from "react"
import { ChevronLeft, LayoutGrid, Locate, Pause, Play, Repeat, Square } from "lucide-react"
import {
  HandTap,
  Keyboard,
  Link as LinkIcon,
  MapPin,
  MusicNote,
  PencilSimple,
  CircleIcon,
  WaveSine,
} from "@phosphor-icons/react"
import { useTranslation } from "@zoeymind/i18n"
import {
  Button,
  ControlGroup,
  DragPadNumber,
  DragPadToggle,
  DropdownButton,
  useInfoBinding,
} from "@zoeymind/ui"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import { growTimelineBars, timelineBars } from "@/pages/project/model/selectors"
import { effectiveDrawMode } from "@/pages/project/model/interaction-mode"
import { setDrawModeLatched } from "../ArrangementPanel/Timeline/drawModeKey"

export interface TransportBarProps {
  projectId?: string
  browserCollapsed?: boolean
  onBack: () => void
  onToggleBrowser: () => void
}

const SCALE_ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const

const SCALE_MODES = [
  { id: "major", label: "Major" },
  { id: "minor", label: "Minor" },
  { id: "dorian", label: "Dorian" },
  { id: "phrygian", label: "Phrygian" },
  { id: "lydian", label: "Lydian" },
  { id: "mixolydian", label: "Mixolydian" },
  { id: "locrian", label: "Locrian" },
  { id: "harmonic-minor", label: "Harm Min" },
  { id: "melodic-minor", label: "Mel Min" },
  { id: "pentatonic", label: "Penta" },
] as const

const BAR_LENGTHS = [
  { type: "heading" as const, id: "h-short", label: "SHORT" },
  { id: "1-bar", label: "1 Bar", shortcut: "1" },
  { id: "2-bar", label: "2 Bar", shortcut: "2" },
  { id: "4-bar", label: "4 Bar", shortcut: "4" },
  { type: "separator" as const, id: "sep-1" },
  { type: "heading" as const, id: "h-long", label: "LONG" },
  { id: "8-bar", label: "8 Bar", shortcut: "8" },
  { id: "16-bar", label: "16 Bar", shortcut: "Shift+6" },
] as const

export function TransportBar({ onBack, onToggleBrowser }: TransportBarProps) {
  const { t } = useTranslation()
  const buttonInfo = useInfoBinding({ type: "button" })
  const headerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    const scrollHeader = (event: WheelEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.deltaX ||
        header.scrollWidth <= header.clientWidth
      )
        return
      event.preventDefault()
      header.scrollLeft += event.deltaY
    }
    header.addEventListener("wheel", scrollHeader, { passive: false })
    return () => header.removeEventListener("wheel", scrollHeader)
  }, [])

  const link = useProjectState(s => s.workspace.link)
  const bpm = useProjectState(s => s.document.transport.bpm)
  const numerator = useProjectState(s => s.document.transport.numerator)
  const denominator = useProjectState(s => s.document.transport.denominator)
  const groove = useProjectState(s => s.document.groove)
  const barLength = useProjectState(s => s.document.transport.barLength)
  const scaleRoot = useProjectState(s => s.document.scaleRoot)
  const scaleMode = useProjectState(s => s.document.scaleMode)
  const playing = useProjectState(s => s.session.playing)
  const recording = useProjectState(s => s.session.recording)
  const loop = useProjectState(s => s.document.transport.loop.enabled)
  const follow = useProjectState(s => s.workspace.follow)
  const drawMode = useProjectState(effectiveDrawMode)
  const computerKeyboard = useProjectState(s => s.workspace.computerKeyboard)
  const document = useProjectState(s => s.document)
  const selectionEnd = useProjectState(s => s.session.timeSelection?.endBar ?? 1)
  const positionBar = useProjectState(s => s.session.position.bar)
  const positionBeat = useProjectState(s => s.session.position.beat)
  const positionSixteenth = useProjectState(s => s.session.position.sixteenth)
  const documentBars = useMemo(() => timelineBars(document), [document])
  const barMax = Math.max(
    999,
    growTimelineBars(documentBars, Math.max(positionBar, selectionEnd)) + 1
  )
  const lastStop = useRef(0)
  const setLink = projectActions.setLink
  const taps = useRef<number[]>([])
  const setBpm = projectActions.setBpm
  const setNumerator = projectActions.setNumerator
  const setDenominator = projectActions.setDenominator
  const setGroove = (value: number) => projectActions.setProject({ groove: value })
  const setBarLength = projectActions.setBarLength
  const setScaleRoot = (value: string) => projectActions.setProject({ scaleRoot: value })
  const setScaleMode = (value: string) => projectActions.setProject({ scaleMode: value })
  const setFollow = projectActions.setFollow
  const setDrawMode = setDrawModeLatched
  const setComputerKeyboard = (value: boolean) => projectActions.setMode("computerKeyboard", value)
  const setPositionBar = (value: number) => projectActions.setPosition({ bar: value })
  const setPositionBeat = (value: number) => projectActions.setPosition({ beat: value })
  const setPositionSixteenth = (value: number) => projectActions.setPosition({ sixteenth: value })
  const setLoop = (value: boolean) => projectActions.setLoop({ enabled: value })
  const gesture = {
    onGestureStart: projectActions.beginEdit,
    onGestureEnd: projectActions.endEdit,
    onGestureCancel: projectActions.cancelEdit,
  }

  return (
    <div
      ref={headerRef}
      data-transport-header
      className="project-transport"
      role="region"
      aria-label={t("project.transport.controls")}
      tabIndex={0}
    >
      <div className="project-transport-content">
        <div
          data-transport-group="left"
          className="project-transport-group flex items-center gap-[4px]"
        >
          <Button
            variant="ghost"
            size="control-icon"
            onClick={onToggleBrowser}
            {...buttonInfo}
            aria-label={t("project.toggleBrowser")}
          >
            <LayoutGrid />
          </Button>

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
              if (taps.current.length < 2) return
              const intervals = taps.current
                .slice(1)
                .map((time, index) => time - taps.current[index])
              projectActions.setBpm(
                60000 / (intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length)
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
            onChange={setBpm}
            {...gesture}
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
              onChange={setNumerator}
              {...gesture}
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
              onChange={setDenominator}
              {...gesture}
              min={1}
              max={32}
              step={1}
              defaultValue={4}
              label={t("project.transport.sigDen", "拍号 - 分母")}
              description={t("project.transport.sigDenHint", "一拍的音符时值")}
              format={v => String(Math.round(v))}
            />
          </ControlGroup>

          <ControlGroup
            label={t("project.transport.scale", "调性")}
            icon={<MusicNote weight="fill" />}
            separator="line"
          >
            <DropdownButton
              value={scaleRoot}
              onChange={setScaleRoot}
              label={t("project.transport.scaleRoot", "调性根音")}
              description={t("project.transport.scaleRootHint", "工程的根音；影响 Scale Lock")}
              matchTriggerWidth={false}
              items={SCALE_ROOTS.map(id => ({ id, label: id }))}
            />
            <DropdownButton
              value={scaleMode}
              onChange={setScaleMode}
              label={t("project.transport.scaleMode", "调式")}
              description={t("project.transport.scaleModeHint", "工程使用的音阶类型")}
              matchTriggerWidth={false}
              items={SCALE_MODES.map(({ id, label }) => ({ id, label }))}
            />
          </ControlGroup>

          <DragPadNumber
            value={groove}
            onChange={setGroove}
            {...gesture}
            min={0}
            max={100}
            step={1}
            defaultValue={0}
            label={t("project.transport.groove", "Groove")}
            description={t("project.transport.grooveHint", "全局 groove 量(swing / 感觉)")}
            format={v => `${Math.round(v)}%`}
            icon={<WaveSine weight="fill" />}
          />
          <DropdownButton
            value={barLength}
            onChange={setBarLength}
            label={t("project.transport.barLength", "小节长度")}
            description={t("project.transport.barLengthHint", "Follow / loop 的默认时值单位")}
            matchTriggerWidth={false}
            items={BAR_LENGTHS.map(item => {
              if ("type" in item && item.type === "heading")
                return { type: "heading", id: item.id, label: item.label }
              if ("type" in item && item.type === "separator")
                return { type: "separator", id: item.id }
              return { id: item.id, label: item.label, shortcut: item.shortcut }
            })}
          />
        </div>

        <div
          data-transport-group="center"
          className="project-transport-group flex items-center gap-[4px]"
        >
          <DragPadToggle
            value={follow}
            onChange={setFollow}
            label={t("project.transport.follow", "Follow")}
            description={t("project.transport.followHint", "播放时自动滚动跟随 playhead")}
            icon={<Locate />}
            labelOn="ON"
            labelOff="OFF"
          />
          <ControlGroup
            label={t("project.transport.position", "位置")}
            icon={<MapPin weight="fill" />}
            separator="dot"
          >
            <DragPadNumber
              value={positionBar}
              onChange={setPositionBar}
              {...gesture}
              min={1}
              max={barMax}
              step={1}
              defaultValue={1}
              label={t("project.transport.positionBar", "小节")}
              description={t("project.transport.positionBarHint", "当前小节号；拖/双击回 1")}
              format={v => String(Math.round(v))}
            />
            <DragPadNumber
              value={positionBeat}
              onChange={setPositionBeat}
              {...gesture}
              min={1}
              max={Math.max(1, numerator)}
              step={1}
              defaultValue={1}
              label={t("project.transport.positionBeat", "拍")}
              description={t("project.transport.positionBeatHint", "小节内第几拍；上限随拍号分子")}
              format={v => String(Math.round(v))}
            />
            <DragPadNumber
              value={positionSixteenth}
              onChange={setPositionSixteenth}
              {...gesture}
              min={1}
              max={4}
              step={1}
              defaultValue={1}
              label={t("project.transport.positionSixteenth", "分拍")}
              description={t("project.transport.positionSixteenthHint", "拍内十六分位置 1-4")}
              format={v => String(Math.floor(v))}
            />
          </ControlGroup>
          <div className="mx-[6px] flex items-center gap-[4px]">
            <Button
              variant="ghost"
              size="transport-icon"
              onClick={projectActions.togglePlay}
              {...buttonInfo}
              aria-label={playing ? t("project.transport.stop") : t("project.transport.play")}
            >
              {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
            </Button>
            <Button
              variant="ghost"
              size="transport-icon"
              onClick={() => {
                const now = performance.now()
                projectActions.stop()
                if (now - lastStop.current < 450) projectActions.rewindToStart()
                lastStop.current = now
              }}
              {...buttonInfo}
              aria-label={t("project.transport.stop")}
            >
              <Square className="fill-current" />
            </Button>
            <Button
              variant={recording ? "destructive" : "ghost"}
              size="transport-icon"
              onClick={projectActions.toggleRecording}
              {...buttonInfo}
              aria-label={t("project.transport.record")}
            >
              <CircleIcon weight="fill" />
            </Button>
          </div>
          <DragPadToggle
            value={loop}
            onChange={setLoop}
            label={t("project.transport.loop", "Loop")}
            description={t("project.transport.loopHint", "开启后播放会在循环区间循环")}
            icon={<Repeat />}
            labelOn="ON"
            labelOff="OFF"
          />
        </div>

        <div
          data-transport-group="right"
          className="project-transport-group flex items-center gap-[4px]"
        >
          <DragPadToggle
            value={drawMode}
            onChange={setDrawMode}
            label={t("project.transport.drawMode", "绘制模式")}
            description={t("project.transport.drawModeHint")}
            icon={<PencilSimple weight="fill" />}
          />
          <DragPadToggle
            value={computerKeyboard}
            onChange={setComputerKeyboard}
            label={t("project.transport.computerKeyboard", "电脑 MIDI 键盘")}
            description={t(
              "project.transport.computerKeyboardHint",
              "开启后 QWERTY 键盘当 MIDI 输入:A S D F... 白键;W E T Y U 黑键;Z/X 切换八度"
            )}
            icon={<Keyboard weight="fill" />}
          />
          <Button
            variant="ghost"
            size="control-icon"
            onClick={onBack}
            {...buttonInfo}
            aria-label={t("common.back")}
          >
            <ChevronLeft />
          </Button>
        </div>
      </div>
    </div>
  )
}
