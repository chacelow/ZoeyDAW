import { MusicNote, WaveSine } from "@phosphor-icons/react"
import { ControlGroup, DragPadNumber, DropdownButton } from "@zoeymind/ui"
import { useTranslation } from "@zoeymind/i18n"
import { projectActions, useProjectEditGesture, useProjectState } from "@/pages/project/adapters"

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

export function MusicalControls() {
  const { t } = useTranslation()
  const groove = useProjectState(s => s.document.groove)
  const barLength = useProjectState(s => s.document.transport.barLength)
  const scaleRoot = useProjectState(s => s.document.scaleRoot)
  const scaleMode = useProjectState(s => s.document.scaleMode)
  const setGroove = (value: number) => projectActions.setProject({ groove: value })
  const { setBarLength } = projectActions
  const setScaleRoot = (value: string) => projectActions.setProject({ scaleRoot: value })
  const setScaleMode = (value: string) => projectActions.setProject({ scaleMode: value })
  const grooveGesture = useProjectEditGesture(setGroove)
  return (
    <>
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
        {...grooveGesture}
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
          if ("type" in item && item.type === "heading") {
            return { type: "heading", id: item.id, label: item.label }
          }
          return "type" in item && item.type === "separator"
            ? { type: "separator", id: item.id }
            : { id: item.id, label: item.label, shortcut: item.shortcut }
        })}
      />
    </>
  )
}
