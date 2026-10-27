import { useCallback, useEffect, useRef } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { projectActions, useProjectEditGesture } from "@/pages/project/adapters"
import type { ClipContent } from "@zoeydaw/project-core/types"

export function ClipNameInput({
  clip,
  title,
}: {
  readonly clip: ClipContent
  readonly title: string
}) {
  const { t } = useTranslation()
  const editGesture = useProjectEditGesture((label: string) =>
    projectActions.updateClip(clip.id, { label })
  )
  const input = useRef<HTMLInputElement>(null)
  const editing = useRef(false)
  const finish = useCallback(
    (cancel: boolean) => {
      if (!editing.current) {
        return
      }
      editing.current = false
      if (cancel) {
        editGesture.onGestureCancel()
      } else {
        editGesture.onGestureEnd()
      }
    },
    [editGesture]
  )
  useEffect(() => () => finish(true), [clip.id, finish])
  return (
    <input
      ref={input}
      data-clip-name
      aria-label={t("arrangement.rename")}
      className="max-w-[220px] min-w-0 rounded-sm border border-transparent bg-transparent px-1 font-semibold focus:border-current focus:bg-[var(--arrangement-clip-paper)]"
      value={clip.label ?? title}
      onFocus={() => {
        if (editing.current) {
          return
        }
        editing.current = true
        editGesture.onGestureStart()
      }}
      onChange={event => editGesture.onChange(event.target.value)}
      onBlur={() => finish(false)}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
          event.stopPropagation()
          return
        }
        if (event.key === "Escape") {
          event.stopPropagation()
          finish(true)
          event.currentTarget.blur()
        } else if (event.key === "Enter") {
          event.currentTarget.blur()
        }
      }}
    />
  )
}
