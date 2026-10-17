import { useRef, useState } from "react"
import { useTrackLabels } from "../../labels"
import { Input } from "@/ui/controls"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { projectActions } from "@/project/adapters"
import type { Track } from "@/project/model/types"

export function TrackNameInput({
  track,
  onFinish,
}: {
  readonly track: Track
  readonly onFinish: () => void
}) {
  const { t } = useTrackLabels()
  const theme = useTheme()
  const [draft, setDraft] = useState(track.name)
  const finished = useRef(false)
  const finish = (commit: boolean) => {
    if (finished.current) return
    finished.current = true
    const name = draft.trim()
    if (commit && name && name !== track.name) projectActions.updateTrack(track.id, { name })
    onFinish()
  }
  return (
    <Input
      variant="ghost"
      autoFocus
      selectAllOnFocus
      testId={`track-name-${track.id}`}
      aria-label={t("trackName")}
      value={draft}
      onValueChange={setDraft}
      onSubmit={() => finish(true)}
      onBlur={() => finish(true)}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.key === "escape") {
          event.preventDefault()
          finish(false)
        }
      }}
      style={{
        flexGrow: 1,
        color: theme.colors.arrangementClipInk,
      }}
    />
  )
}
