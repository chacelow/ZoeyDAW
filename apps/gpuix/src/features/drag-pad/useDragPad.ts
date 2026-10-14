/**
 * useDragPad — interaction state machine shared by every DragPadNumber
 * instance: idle → preEdit → editing, plus the drag and wheel gestures.
 *
 * gpuix delivers mouseMove/mouseUp to the element that received mouseDown
 * even once the pointer travels outside that element's own bounds (verified
 * empirically against the native `TestGpuixRenderer`: a mouseDown on a
 * 50×50 element kept receiving mouseMove at (900, 10)). That removes the
 * need for a window-spanning capture overlay the browser version needed
 * `document`-level listeners for.
 *
 * Clicking an element with `tabIndex` also focuses it natively (verified
 * the same way), so the preEdit → editing upgrade reads keys straight off
 * `onKeyDown` with no `autoFocus` dance and no document-level listener.
 */
import { useCallback, useRef, useState } from "react"
import type { EventPayload } from "@gpuix/react"
import { CLICK_MOVE_THRESHOLD_PX } from "./constants"
import { captureCursorPosition, hideCursor, restoreCursor, type ScreenPoint } from "./native-cursor"
import { quantize, valueAfterDrag, valueAfterWheel } from "./numberModel"

export type DragPadMode = "idle" | "preEdit" | "editing"

export interface UseDragPadOptions {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  defaultValue?: number
  disabled?: boolean
  format: (value: number) => string
  parse?: (raw: string) => number
}

export interface UseDragPadResult {
  mode: DragPadMode
  dragging: boolean
  draft: string
  display: string
  handleMouseDown: (event: EventPayload) => void
  handleMouseMove: (event: EventPayload) => void
  handleMouseUp: (event: EventPayload) => void
  handleScroll: (event: EventPayload) => void
  handlePreEditKeyDown: (event: EventPayload) => void
  handleBlur: () => void
  handleEditChange: (raw: string) => void
  handleEditKeyDown: (event: EventPayload) => void
  commitEditing: () => void
}

interface DragAnchor {
  startX: number
  startY: number
  startValue: number
  dragging: boolean
  /** OS screen point captured when dragging started; null if the native hide failed or is unsupported. */
  cursorAnchor: ScreenPoint | null
}

function isEditTrigger(key: string | undefined): key is string {
  return key !== undefined && (key === "backspace" || (key.length === 1 && /[0-9.-]/.test(key)))
}

export function useDragPad(options: UseDragPadOptions): UseDragPadResult {
  const { value, onChange, min, max, step, defaultValue, disabled = false, format, parse } = options
  const [mode, setMode] = useState<DragPadMode>("idle")
  const [dragging, setDragging] = useState(false)
  const [draft, setDraft] = useState("")
  const anchorRef = useRef<DragAnchor | null>(null)
  const valueRef = useRef(value)
  const originalValueRef = useRef(value)
  valueRef.current = value

  const commitNumber = useCallback(
    (next: number) => {
      const quantized = quantize(next, step, min, max)
      if (quantized !== valueRef.current) {
        valueRef.current = quantized
        onChange(quantized)
      }
    },
    [onChange, step, min, max]
  )

  const handleMouseDown = useCallback(
    (event: EventPayload) => {
      if (disabled || mode === "editing" || (event.button !== undefined && event.button !== 0)) {
        return
      }
      if (event.clickCount !== undefined && event.clickCount >= 2 && defaultValue !== undefined) {
        anchorRef.current = null
        commitNumber(defaultValue)
        setMode("idle")
        return
      }
      anchorRef.current = {
        startX: event.x ?? 0,
        startY: event.y ?? 0,
        startValue: valueRef.current,
        dragging: false,
        cursorAnchor: captureCursorPosition(),
      }
    },
    [disabled, mode, defaultValue, commitNumber]
  )

  const handleMouseMove = useCallback(
    (event: EventPayload) => {
      const anchor = anchorRef.current
      if (!anchor) {
        return
      }
      const deltaY = (event.y ?? anchor.startY) - anchor.startY
      if (!anchor.dragging) {
        if (
          Math.hypot((event.x ?? anchor.startX) - anchor.startX, deltaY) < CLICK_MOVE_THRESHOLD_PX
        ) {
          return
        }
        anchor.dragging = true
        hideCursor()
        setDragging(true)
        setMode("idle")
      }
      commitNumber(valueAfterDrag({ startValue: anchor.startValue, deltaY, step, min, max }))
    },
    [step, min, max, commitNumber]
  )

  const handleMouseUp = useCallback(() => {
    const anchor = anchorRef.current
    anchorRef.current = null
    if (!anchor) {
      return
    }
    if (anchor.dragging) {
      if (anchor.cursorAnchor) {
        restoreCursor(anchor.cursorAnchor)
      }
      setDragging(false)
      return
    }
    if (!disabled) {
      setDraft("")
      setMode("preEdit")
    }
  }, [disabled])

  const handleScroll = useCallback(
    (event: EventPayload) => {
      if (disabled || dragging || mode === "editing") {
        return
      }
      const deltaY = event.deltaY ?? 0
      if (!deltaY) {
        return
      }
      commitNumber(
        valueAfterWheel({
          currentValue: valueRef.current,
          deltaY,
          precise: event.precise ?? false,
          step,
          min,
          max,
        })
      )
    },
    [disabled, dragging, mode, step, min, max, commitNumber]
  )

  const startEditing = useCallback(
    (initialDraft: string) => {
      originalValueRef.current = valueRef.current
      setDraft(initialDraft)
      setMode("editing")
      const parsed = parse ? parse(initialDraft) : Number(initialDraft)
      if (initialDraft.trim() && Number.isFinite(parsed)) {
        commitNumber(parsed)
      }
    },
    [parse, commitNumber]
  )

  const handlePreEditKeyDown = useCallback(
    (event: EventPayload) => {
      if (mode !== "preEdit") {
        return
      }
      if (event.key === "escape") {
        setMode("idle")
        return
      }
      if (event.key === "enter") {
        startEditing(format(valueRef.current))
        return
      }
      if (!isEditTrigger(event.key)) {
        return
      }
      if (event.key === "backspace") {
        startEditing(format(valueRef.current).slice(0, -1))
      } else {
        startEditing(event.key)
      }
    },
    [mode, format, startEditing]
  )

  const handleBlur = useCallback(() => {
    if (mode === "preEdit") {
      setMode("idle")
    }
  }, [mode])

  const commitEditing = useCallback(() => {
    const raw = draft.trim()
    const parsed = parse ? parse(raw) : Number.parseFloat(raw)
    if (raw && Number.isFinite(parsed)) {
      commitNumber(parsed)
    }
    setMode("idle")
  }, [draft, parse, commitNumber])

  const handleEditChange = useCallback(
    (raw: string) => {
      setDraft(raw)
      const trimmed = raw.trim()
      if (!trimmed || trimmed === "-" || trimmed === "." || trimmed === "-.") {
        return
      }
      const parsed = parse ? parse(trimmed) : Number.parseFloat(trimmed)
      if (Number.isFinite(parsed)) {
        commitNumber(parsed)
      }
    },
    [parse, commitNumber]
  )

  const handleEditKeyDown = useCallback(
    (event: EventPayload) => {
      if (event.key === "escape") {
        commitNumber(originalValueRef.current)
        setMode("idle")
      }
    },
    [commitNumber]
  )

  return {
    mode,
    dragging,
    draft,
    display: format(value),
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleScroll,
    handlePreEditKeyDown,
    handleBlur,
    handleEditChange,
    handleEditKeyDown,
    commitEditing,
  }
}
