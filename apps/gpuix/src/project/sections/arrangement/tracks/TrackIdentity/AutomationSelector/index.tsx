import { useTrackLabels } from "../../labels"
import { DropdownButton } from "../../../../../../ui/controls"
import { projectActions, useProjectState } from "../../../../../adapters"
import type { Track } from "../../../../../model/types"

export function AutomationSelector({ track }: { readonly track: Track }) {
  const { t } = useTrackLabels()
  const parameter = useProjectState(
    state =>
      state.session.automationParameters[track.id] ?? track.automation[0]?.parameter ?? "volume"
  )
  return (
    <DropdownButton<"volume" | "pan">
      testId={`track-automation-${track.id}`}
      label={`${t("automationParameter")} ${track.name}`}
      value={parameter}
      onChange={next => projectActions.setAutomationParameter(track.id, next)}
      items={[
        { id: "volume", label: t("volume") },
        { id: "pan", label: t("pan") },
      ]}
    />
  )
}
