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
      autoFocus
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
        backgroundColor: "transparent",
        paddingLeft: 0,
        paddingRight: 0,
        borderWidth: 0,
        fontSize: theme.control["--text-control-track"],
        color: theme.colors.arrangementClipInk,
      }}
    />
  )
}
