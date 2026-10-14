import { useTranslation } from "@zoeymind/i18n"
import { DropdownButton } from "@zoeymind/ui"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import type { Track } from "@/pages/project/model/types"

export function AutomationSelector({ track }: { readonly track: Track }) {
  const { t } = useTranslation()
  const parameter = useProjectState(
    s => s.session.automationParameters[track.id] ?? track.automation[0]?.parameter ?? "volume"
  )
  return (
    <DropdownButton<"volume" | "pan">
      size="compact"
      label={`${t("arrangement.automationParameter")} ${track.name}`}
      value={parameter}
      onChange={next => projectActions.setAutomationParameter(track.id, next)}
      items={[
        { id: "volume", label: t("arrangement.volume") },
        { id: "pan", label: t("arrangement.pan") },
      ]}
      className="w-full min-w-0"
    />
  )
}
