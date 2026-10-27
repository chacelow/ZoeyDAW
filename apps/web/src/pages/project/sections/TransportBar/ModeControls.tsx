import { Keyboard, PencilSimple } from "@phosphor-icons/react"
import { DragPadToggle, DropdownButton } from "@zoeymind/ui"
import { useTranslation } from "@zoeymind/i18n"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import { effectiveDrawMode } from "@zoeydaw/project-core/interaction-mode"
import { setDrawModeLatched } from "../ArrangementPanel/Timeline/drawModeKey"

export function ModeControls() {
  const { t } = useTranslation()
  const drawMode = useProjectState(effectiveDrawMode)
  const computerKeyboard = useProjectState(s => s.workspace.computerKeyboard)
  const automationRecordMode = useProjectState(s => s.session.automationRecordMode)
  const setDrawMode = setDrawModeLatched
  const setComputerKeyboard = (value: boolean) => projectActions.setMode("computerKeyboard", value)
  return (
    <>
      <DropdownButton
        label={t("project.transport.automationRecordMode")}
        value={automationRecordMode}
        items={(["read", "touch", "latch"] as const).map(id => ({
          id,
          label: t(`project.transport.automationRecord.${id}`),
        }))}
        onChange={projectActions.setAutomationRecordMode}
      />
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
    </>
  )
}
