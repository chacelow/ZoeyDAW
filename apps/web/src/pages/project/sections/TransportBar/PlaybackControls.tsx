import { useMemo, useRef } from "react"
import { Locate, Pause, Play, Repeat, Square } from "lucide-react"
import { MapPin, CircleIcon } from "@phosphor-icons/react"
import { Button, ControlGroup, DragPadNumber, DragPadToggle, useInfoBinding } from "@zoeymind/ui"
import { growTimelineBars, timelineBars } from "@zoeydaw/project-core/selectors"
import { useTranslation } from "@zoeymind/i18n"
import { projectActions, useProjectEditGesture, useProjectState } from "@/pages/project/adapters"

export function PlaybackControls() {
  const { t } = useTranslation()
  const buttonInfo = useInfoBinding({ type: "button" })
  const numerator = useProjectState(s => s.document.transport.numerator)
  const playing = useProjectState(s => s.session.playing)
  const recording = useProjectState(s => s.session.recording)
  const loop = useProjectState(s => s.document.transport.loop.enabled)
  const follow = useProjectState(s => s.workspace.follow)
  const document = useProjectState(s => s.document)
  const selectionEnd = useProjectState(s => s.session.timeSelection?.endBar ?? 1)
  const positionBar = useProjectState(s => s.session.position.bar)
  const positionBeat = useProjectState(s => s.session.position.beat)
  const positionSixteenth = useProjectState(s => s.session.position.sixteenth)
  const documentBars = useMemo(() => timelineBars(document), [document])
  const barMax = Math.max(
    999,
    documentBars + 1,
    growTimelineBars(
      documentBars,
      Math.max(positionBar, selectionEnd),
      (document.transport.numerator * 4) / document.transport.denominator
    ) + 1
  )
  const lastStop = useRef(0)
  const { setFollow } = projectActions
  const setPositionBar = (value: number) => projectActions.setPosition({ bar: value })
  const setPositionBeat = (value: number) => projectActions.setPosition({ beat: value })
  const setPositionSixteenth = (value: number) => projectActions.setPosition({ sixteenth: value })
  const setLoop = (value: boolean) => projectActions.setLoop({ enabled: value })
  const positionBarGesture = useProjectEditGesture(setPositionBar)
  const positionBeatGesture = useProjectEditGesture(setPositionBeat)
  const positionSixteenthGesture = useProjectEditGesture(setPositionSixteenth)
  return (
    <>
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
          {...positionBarGesture}
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
          {...positionBeatGesture}
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
          {...positionSixteenthGesture}
          min={1}
          max={4}
          step={1}
          defaultValue={1}
          label={t("project.transport.positionSixteenth", "分拍")}
          description={t("project.transport.positionSixteenthHint", "拍内十六分位置 1-4")}
          format={v => String(Math.floor(v))}
        />
      </ControlGroup>
      <div className="mx-[var(--project-transport-center-margin)] flex items-center gap-[var(--spacing-control-track-gap)]">
        <Button
          variant="ghost"
          size="transport-icon"
          onClick={projectActions.togglePlay}
          {...buttonInfo}
          aria-label={t(playing ? "project.transport.stop" : "project.transport.play")}
        >
          {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
        </Button>
        <Button
          variant="ghost"
          size="transport-icon"
          onClick={() => {
            const now = performance.now()
            projectActions.stop()
            if (now - lastStop.current < 450) {
              projectActions.rewindToStart()
            }
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
    </>
  )
}
