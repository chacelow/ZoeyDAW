import { useEffect, useRef, useState } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { projectActions } from "@/pages/project/adapters"
import type { Track } from "@/pages/project/model/types"

export function TrackNameInput({
  track,
  onFinish,
}: {
  readonly track: Track
  readonly onFinish: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(track.name)
  const input = useRef<HTMLInputElement>(null)
  const finished = useRef(false)
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])
  const finish = (commit: boolean) => {
    if (finished.current) {
      return
    }
    finished.current = true
    const name = draft.trim()
    if (commit && name && name !== track.name) {
      projectActions.updateTrack(track.id, { name })
    }
    onFinish()
  }
  return (
    <input
      ref={input}
      aria-label={t("arrangement.trackName")}
      className="min-w-0 flex-1 bg-transparent text-xs outline-none"
      value={draft}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.key === "Enter") {
          event.preventDefault()
          finish(true)
        }
        if (event.key !== "Escape") {
          return
        }

        event.preventDefault()
        finish(false)
      }}
    />
  )
}
