import { useEffect, useRef } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { useProjectState } from "@/pages/project/adapters"

/**
MIDI-only tracks have no audio output, so the level meter column instead shows
note activity: each press lifts a dot from the bottom, its height follows the
played velocity, and it falls back after release.
*/
const DECAY_MS = 600

export function MidiActivity({
  trackName,
  className,
}: {
  readonly trackName: string
  readonly className?: string
}) {
  const { t } = useTranslation()
  const notes = useProjectState(state => state.session.activeMidiNotes)
  const velocity = useProjectState(state => state.session.midiVelocity)
  const dot = useRef<HTMLDivElement>(null)
  const seen = useRef(new Set<number>())
  const raised = useRef(0)
  const lastPress = useRef(0)

  useEffect(() => {
    const element = dot.current
    if (!element) {
      return
    }
    const pressed = notes.filter(pitch => !seen.current.has(pitch))
    if (pressed.length) {
      seen.current = new Set(notes)
      raised.current = Math.max(0, Math.min(1, velocity / 127))
      lastPress.current = performance.now()
      element.style.opacity = "1"
      element.style.bottom = `${raised.current * 92}%`
      return
    }
    seen.current = new Set(notes)
    if (!notes.length) {
      const started = lastPress.current
      if (!started) {
        element.style.opacity = "0"
        return
      }
      let frame = 0
      const fall = () => {
        const elapsed = performance.now() - started
        if (elapsed >= DECAY_MS) {
          element.style.opacity = "0"
          element.style.bottom = "0%"
          lastPress.current = 0
          return
        }
        const remaining = 1 - elapsed / DECAY_MS
        element.style.opacity = String(remaining)
        element.style.bottom = `${raised.current * 92 * remaining}%`
        frame = requestAnimationFrame(fall)
      }
      frame = requestAnimationFrame(fall)
      return () => cancelAnimationFrame(frame)
    }
  }, [notes, velocity])

  return (
    <div
      className={className}
      role="img"
      aria-label={`${t("arrangement.midiActivity")} ${trackName}`}
      style={{ width: "var(--spacing-control-track)", height: "100%", minHeight: 0, flexShrink: 0 }}
    >
      <div className="bg-muted relative h-full w-full overflow-hidden">
        <div
          ref={dot}
          data-midi-activity-dot
          className="bg-primary absolute inset-x-1 h-1 rounded-full opacity-0"
          style={{ bottom: "0%" }}
        />
      </div>
    </div>
  )
}
