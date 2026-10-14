/**
 * useInlineEdit — DragPadNumber / Bar / Bipolar 的 click-to-edit 共享行为。
 *
 * ## 三态
 *
 * `idle` → `preEdit` → `editing` → `idle`
 *
 * - **idle** 常态显示 value。
 * - **preEdit** click(位移<3px)触发;chrome **不换**,只多一圈视觉 ring。
 *   原因:若此时就渲染 `<input>`,后续双击会落到 input 上而不是 DragPad 按钮,
 *   `pointerdown.detail>=2` 的 reset 快捷方式就被屏蔽了。保留 DragPadBase 后
 *   双击仍能命中,点击+双击互不冲突。
 * - **editing** 用户按下第一个有效字符(数字 / `.` / `-` / Backspace)后升级;
 *   此时才渲染 `<input>` 承接后续键入。
 *
 * Enter / blur → commit(parse + clamp + quantize);Esc → cancel;非法 / 空 → 保持原值。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

export type InlineEditState = "idle" | "preEdit" | "editing"

export interface UseInlineEditOptions {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  format?: (value: number) => string
  parse?: (raw: string) => number
  editable?: boolean
  disabled?: boolean
  onGestureStart?: () => void
  onGestureEnd?: () => void
  onGestureCancel?: () => void
}

export interface UseInlineEditResult {
  state: InlineEditState
  draft: string
  setDraft: (next: string) => void
  /**
  click 后进入 preEdit;双击 reset 仍可用。
  */
  beginPreEdit: () => void
  resetPreEdit: () => void
  commit: () => void
  cancel: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
}

/**
判定是否"启动编辑"的字符:数字、小数点、负号、Backspace;其它(方向键 / Tab)不触发。
*/
function isEditTrigger(key: string): boolean {
  if (key.length === 1 && /[0-9.-]/.test(key)) {
    return true
  }
  if (key === "Backspace") {
    return true
  }
  return false
}

export function useInlineEdit({
  value,
  onChange,
  min,
  max,
  step = 0,
  format,
  parse,
  editable = true,
  disabled = false,
  onGestureStart,
  onGestureEnd,
  onGestureCancel,
}: UseInlineEditOptions): UseInlineEditResult {
  const [state, setState] = useState<InlineEditState>("idle")
  const [draft, setDraft] = useState("")
  const inputReference = useRef<HTMLInputElement>(null)
  const latestValue = useRef(value)
  useLayoutEffect(() => {
    latestValue.current = value
  }, [value])
  const originalValue = useRef(value)
  const editingReference = useRef(false)
  const beginPreEdit = useCallback(() => {
    if (!editable || disabled) {
      return
    }
    originalValue.current = latestValue.current
    setDraft("")
    setState("preEdit")
  }, [editable, disabled])

  const resetPreEdit = useCallback(() => {
    if (!editingReference.current) {
      setState("idle")
    }
  }, [])

  const startEditing = useCallback(
    (nextDraft: string) => {
      originalValue.current = latestValue.current
      editingReference.current = true
      onGestureStart?.()
      setDraft(nextDraft)
      setState("editing")
    },
    [onGestureStart]
  )

  const commit = useCallback(() => {
    if (!editingReference.current) {
      return
    }
    const raw = draft.trim()
    const parsed = parse ? parse(raw) : Number.parseFloat(raw)
    if (raw && Number.isFinite(parsed)) {
      const clamped = Math.min(max, Math.max(min, parsed))
      const quantized = step > 0 ? Math.round(clamped / step) * step : clamped
      const next = Math.min(max, Math.max(min, quantized))
      if (next !== latestValue.current) {
        latestValue.current = next
        onChange(next)
      }
    }
    editingReference.current = false
    onGestureEnd?.()
    setState("idle")
  }, [draft, parse, min, max, step, onChange, onGestureEnd])

  const cancel = useCallback(() => {
    if (editingReference.current) {
      editingReference.current = false
      if (onGestureCancel) {
        onGestureCancel()
      } else if (latestValue.current !== originalValue.current) {
        onChange(originalValue.current)
      }
    }
    setState("idle")
  }, [onChange, onGestureCancel])
  const cancelGestureReference = useRef(onGestureCancel)
  useLayoutEffect(() => {
    cancelGestureReference.current = onGestureCancel
  }, [onGestureCancel])
  useEffect(() => {
    return () => {
      if (!editingReference.current) return
      editingReference.current = false
      cancelGestureReference.current?.()
    }
  }, [])

  // preEdit → editing:监听全局按键,首个有效输入字符升级并作为初始 draft。
  useEffect(() => {
    if (state !== "preEdit") {
      return
    }

    const handler = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))
      ) {
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        cancel()
        return
      }
      // double-click 期间的 Enter 也直接升级空编辑态(用户或许想清空重填)
      if (event.key === "Enter") {
        event.preventDefault()
        startEditing(format ? format(latestValue.current) : String(latestValue.current))
        return
      }
      if (!isEditTrigger(event.key)) {
        return
      }
      event.preventDefault()
      // 第一个字符:数字/小数点/负号直接作为 draft 起点;Backspace 则起点为"当前值少一位"
      if (event.key === "Backspace") {
        const current = format ? format(latestValue.current) : String(latestValue.current)
        startEditing(current.slice(0, -1))
      } else {
        startEditing(event.key)
      }
    }

    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [state, format, cancel, startEditing])

  // 进入 editing 后 focus input 并把光标放末尾。
  useEffect(() => {
    if (!(state === "editing" && inputReference.current)) {
      return
    }

    const element = inputReference.current
    element.focus()
    const length_ = element.value.length
    element.setSelectionRange(length_, length_)
  }, [state])

  useEffect(() => {
    if (state !== "editing") {
      return
    }
    const raw = draft.trim()
    if (!raw || raw === "-" || raw === "." || raw === "-.") {
      return
    }
    const parsed = parse ? parse(raw) : Number.parseFloat(raw)
    if (!Number.isFinite(parsed)) {
      return
    }
    const clamped = Math.min(max, Math.max(min, parsed))
    const quantized = step > 0 ? Math.round(clamped / step) * step : clamped
    const next = Math.min(max, Math.max(min, quantized))
    if (next === latestValue.current) {
      return
    }

    latestValue.current = next
    onChange(next)
  }, [state, draft, parse, min, max, step, onChange])

  return {
    state,
    draft,
    setDraft,
    beginPreEdit,
    resetPreEdit,
    commit,
    cancel,
    inputRef: inputReference,
  }
}
