import { useCallback, useEffect, useRef } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import { isBlackKey, KEY_WIDTH, pitchName } from "../geometry"

export function PianoKeyboard({
  pitches,
  rowHeight,
  selectPitch,
}: {
  readonly pitches: readonly number[]
  readonly rowHeight: number
  readonly selectPitch: (pitch: number, extend: boolean) => void
}) {
  const { t } = useTranslation()
  const sounding = useProjectState(state => state.session.activeMidiNotes)
  const active = useRef<number | null>(null)
  const release = useCallback(() => {
    if (active.current !== null) projectActions.noteOff(active.current)
    active.current = null
  }, [])
  useEffect(() => {
    window.addEventListener("blur", release)
    return () => {
      release()
      window.removeEventListener("blur", release)
    }
  }, [release])
  return (
    <div
      className="border-border bg-background sticky left-0 z-20 shrink-0 border-r"
      style={{ width: KEY_WIDTH }}
    >
      {pitches.map(pitch => (
        <button
          key={pitch}
          type="button"
          aria-label={`${t("detailMidi.audition")} ${pitchName(pitch)}`}
          aria-pressed={sounding.includes(pitch)}
          className={`border-border/60 hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring block w-full touch-none border-b pr-2 text-right text-[10px] leading-none outline-none focus-visible:ring-1 ${sounding.includes(pitch) ? "bg-primary text-primary-foreground" : isBlackKey(pitch) ? "bg-foreground/80 text-background dark:bg-background/80 dark:text-foreground" : "bg-background text-foreground dark:bg-foreground/75 dark:text-background"}`}
          style={{ height: rowHeight }}
          onPointerDown={event => {
            if (event.button !== 0) return
            event.preventDefault()
            event.stopPropagation()
            release()
            active.current = pitch
            selectPitch(pitch, event.shiftKey || event.metaKey || event.ctrlKey)
            projectActions.noteOn(pitch)
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerUp={event => {
            release()
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          onPointerCancel={release}
          onLostPointerCapture={release}
          onKeyDown={event => {
            if (event.key !== "Enter" || event.repeat) return
            event.preventDefault()
            event.stopPropagation()
            release()
            selectPitch(pitch, event.shiftKey)
            active.current = pitch
            projectActions.noteOn(pitch)
          }}
          onKeyUp={event => {
            if (event.key === "Enter") release()
          }}
          onBlur={release}
        >
          {pitch % 12 === 0 || pitches.length < 24 ? pitchName(pitch) : ""}
        </button>
      ))}
    </div>
  )
}
