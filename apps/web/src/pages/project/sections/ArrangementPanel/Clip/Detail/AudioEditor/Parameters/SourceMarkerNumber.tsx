import { projectActions, useProjectEditGesture, useProjectState } from "@/pages/project/adapters"
import { audioSourceWindow, getAudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import { MusicalNumber } from "./MusicalNumber"
import { sourceMarkerFields } from "./fieldConfiguration"
import type { SourceMarkerField } from "./fieldConfiguration"
import type { AudioClipContent } from "@zoeydaw/project-core/types"

export function SourceMarkerNumber({
  clip,
  bpm,
  field,
  label,
}: {
  readonly clip: AudioClipContent
  readonly bpm: number
  readonly field: SourceMarkerField
  readonly label: string
}) {
  const numerator = useProjectState(state => state.document.transport.numerator)
  const denominator = useProjectState(state => state.document.transport.denominator)
  const settings = getAudioClipSettings(clip, bpm)
  const configuration = sourceMarkerFields[field]({ clip, settings })
  const gesture = useProjectEditGesture((value: number) => {
    const patch = audioSourceWindow(
      clip,
      field === "startMarkerBars" ? value : settings.startMarkerBars,
      field === "endMarkerBars" ? value : settings.endMarkerBars,
      bpm
    )
    if (patch) projectActions.updateClip(clip.id, patch)
  })
  return (
    <MusicalNumber
      {...configuration}
      value={settings[field]}
      label={label}
      numerator={numerator}
      denominator={denominator}
      gesture={gesture}
    />
  )
}
