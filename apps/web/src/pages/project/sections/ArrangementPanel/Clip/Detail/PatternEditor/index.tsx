import { useTranslation } from "@zoeymind/i18n"
import type { PatternClip } from "@/pages/project/model/types"
import { PatternSteps } from "../PatternSteps"

export function PatternEditor({ clip }: { clip: PatternClip }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3 text-xs">
      <PatternSteps clip={clip} label={t("arrangement.step")} />
    </div>
  )
}
