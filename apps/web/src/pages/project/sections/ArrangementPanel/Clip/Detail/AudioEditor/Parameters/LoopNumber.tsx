import { projectActions, useProjectEditGesture, useProjectState } from "@/pages/project/adapters"
import { audioLoopWindow, getAudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import { MusicalNumber } from "./MusicalNumber"
import { loopFields } from "./fieldConfiguration"
import type { LoopField } from "./fieldConfiguration"
import type { AudioClipContent } from "@zoeydaw/project-core/types"

export function LoopNumber({
  clip,
  bpm,
  field,
  label,
}: {
  readonly clip: AudioClipContent
  readonly bpm: number
  readonly field: LoopField
  readonly label: string
}) {
  const numerator = useProjectState(state => state.document.transport.numerator)
  const denominator = useProjectState(state => state.document.transport.denominator)
  const settings = getAudioClipSettings(clip, bpm)
  const configuration = loopFields[field]({ clip, settings })
  const gesture = useProjectEditGesture((value: number) => {
    const audioSettings = audioLoopWindow(
      settings,
      field === "loopStartBars" ? value : settings.loopStartBars,
      field === "loopLengthBars" ? value : settings.loopLengthBars
    )
    projectActions.updateClip(clip.id, { audioSettings })
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
