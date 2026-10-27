import { useProjectState } from "@/pages/project/adapters"
import { AudioParameters } from "./Parameters"
import { AudioWaveform } from "./Waveform"
import type { AudioClipContent } from "@zoeydaw/project-core/types"
import "./audio-editor.css"

export function AudioEditor({
  clip,
  color,
}: {
  readonly clip: AudioClipContent
  readonly color: string
}) {
  const transport = useProjectState(state => state.document.transport)
  return (
    <div className="audio-detail" key={clip.id}>
      <AudioParameters clip={clip} color={color} bpm={transport.bpm} />
      <AudioWaveform clip={clip} transport={transport} />
    </div>
  )
}
