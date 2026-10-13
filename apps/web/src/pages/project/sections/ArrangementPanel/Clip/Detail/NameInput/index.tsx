import { useCallback, useEffect, useRef } from "react"
import { useTranslation } from "@zoeymind/i18n"
import type { Clip } from "@/pages/project/model/types"
import { projectActions } from "@/pages/project/adapters"

export function ClipNameInput({ clip, title }: { clip: Clip; title: string }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const editing = useRef(false)
  const finish = useCallback((cancel: boolean) => {
    if (!editing.current) return
    editing.current = false
    if (cancel) projectActions.cancelEdit()
    else projectActions.endEdit()
  }, [])
  useEffect(() => () => finish(true), [clip.id, finish])
  return (
    <input
      ref={input}
      data-clip-name
      aria-label={t("arrangement.rename")}
      className="min-w-0 max-w-[220px] rounded-sm border border-transparent bg-transparent px-1 font-semibold focus:border-border focus:bg-muted"
      value={clip.label ?? title}
      onFocus={() => {
        if (editing.current) return
        editing.current = true
        projectActions.beginEdit()
      }}
      onChange={event => projectActions.updateClip(clip.id, { label: event.target.value })}
      onBlur={() => finish(false)}
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.stopPropagation()
          finish(true)
          event.currentTarget.blur()
        } else if (event.key === "Enter") event.currentTarget.blur()
      }}
    />
  )
}
