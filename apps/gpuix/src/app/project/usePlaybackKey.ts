import { useEffect } from "react"
import { useWindowKeyboard } from "@/platform/keyboard"
import { projectActions } from "@/project/adapters"

/**
 * PHASE 1 ONLY: Space toggles playback while no Arrangement is mounted. Composition
 * contract §4 makes the timeline keyboard (`createTimelineController`) the Space owner;
 * phase 2 deletes this hook when `ArrangementPanel` fills the arrangement slot, so one
 * keyDown never has two owners.
 *
 * Window key events arrive after every element handler; buttons do not consume Space and
 * text inputs stop printable keys, so only unclaimed Space reaches here.
 */
export function usePlaybackKey(): void {
  const keyboard = useWindowKeyboard()
  useEffect(
    () =>
      keyboard.subscribe("keyDown", event => {
        const modifiers = event.modifiers
        const key = event.key?.toLowerCase()
        if ((key !== "space" && key !== " ") || event.defaultPrevented) return
        if (modifiers?.cmd || modifiers?.ctrl || modifiers?.alt || modifiers?.shift) return
        event.preventDefault()
        if (!event.isHeld) projectActions.togglePlay()
      }),
    [keyboard]
  )
}
