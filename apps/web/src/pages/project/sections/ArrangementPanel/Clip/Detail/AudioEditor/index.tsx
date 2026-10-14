import { useProjectState } from "@/pages/project/adapters"
import { AudioParameters } from "./Parameters"
import { AudioWaveform } from "./Waveform"
import type { AudioClip } from "@/pages/project/model/types"
import "./audio-editor.css"

export function AudioEditor({ clip }: { readonly clip: AudioClip }) {
  const transport = useProjectState(state => state.document.transport)
  return (
    <div className="audio-detail" key={clip.id}>
      <AudioParameters clip={clip} bpm={transport.bpm} />
      <AudioWaveform clip={clip} transport={transport} />
    </div>
  )
}
