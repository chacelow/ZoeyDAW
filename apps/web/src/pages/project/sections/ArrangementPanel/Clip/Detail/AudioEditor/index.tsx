import { useProjectState } from "@/pages/project/adapters"
import { AudioParameters } from "./Parameters"
import { AudioWaveform } from "./Waveform"
import { useAudioInspectorMode } from "./useAudioInspectorMode"
import type { AudioClipContent, Clip } from "@zoeydaw/project-core/types"

export function AudioEditor({
  clip,
  color,
  placementClip,
}: {
  readonly clip: AudioClipContent
  readonly color: string
  readonly placementClip?: Clip
}) {
  const transport = useProjectState(state => state.document.transport)
  const inspector = useAudioInspectorMode()
  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className={`${inspector.widthClass} flex min-h-0 shrink-0 flex-col`}>
        <AudioParameters
          clip={clip}
          placementClip={placementClip}
          color={color}
          bpm={transport.bpm}
          mode={inspector.mode}
        />
      </div>
      <div
        className="border-border bg-background hover:bg-primary/20 w-control-gap relative shrink-0 cursor-col-resize [touch-action:none] border-x"
        {...inspector.resizeHandleProps}
      />
      <AudioWaveform clip={clip} transport={transport} />
    </div>
  )
}
