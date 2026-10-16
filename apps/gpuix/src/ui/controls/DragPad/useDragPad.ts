import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react"
import type { EventPayload, KeyEvent } from "@gpuix/react"
import { CLICK_MOVE_THRESHOLD_PX } from "./constants"
import { useControlEnvironment } from "../ControlEnvironment"
import { stopTextShortcutPropagation } from "../keyboard"
import type { CursorLockPort, ScreenPoint } from "./cursor-port"
import { quantize, valueAfterDrag, valueAfterWheel } from "./numberModel"

export type DragPadMode = "idle" | "preEdit" | "editing"

export interface UseDragPadOptions {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  dragStep?: number
  defaultValue?: number
  disabled?: boolean
  editable?: boolean
  format: (value: number) => string
  parse?: (raw: string) => number
  onGestureStart?: () => void
  onGestureEnd?: () => void
  onGestureCancel?: () => void
}

interface DragAnchor {
  startX: number
  startY: number
  startValue: number
  dragging: boolean
  cursorAnchor: ScreenPoint | null
  cursorLock: CursorLockPort | undefined
}

export function useDragPad(options: UseDragPadOptions) {
  const {
    value,
    onChange,
    min,
    max,
    step,
    dragStep = step,
    defaultValue,
    disabled = false,
    editable = true,
    format,
    parse,
    onGestureStart,
    onGestureEnd,
    onGestureCancel,
  } = options
  const { cursorLock, subscribeWindowActive } = useControlEnvironment()
  const [mode, setMode] = useState<DragPadMode>("idle")
  const [dragging, setDragging] = useState(false)
  const [draft, setDraft] = useState("")
  const anchorRef = useRef<DragAnchor | null>(null)
  const valueRef = useRef(value)
  const originalValueRef = useRef(value)
  const editingRef = useRef(false)
  const callbacks = useRef({ onGestureStart, onGestureEnd, onGestureCancel })
  callbacks.current = { onGestureStart, onGestureEnd, onGestureCancel }
  valueRef.current = value

  useEffect(
    () => () => {
      const anchor = anchorRef.current
      if (anchor?.dragging && anchor.cursorAnchor) anchor.cursorLock?.restore(anchor.cursorAnchor)
      if (anchor?.dragging || editingRef.current) callbacks.current.onGestureCancel?.()
    },
    []
  )

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

  const cancelDrag = useCallback(() => {
    const anchor = anchorRef.current
    anchorRef.current = null
    if (anchor?.dragging) {
      if (anchor.cursorAnchor) anchor.cursorLock?.restore(anchor.cursorAnchor)
      commitNumber(anchor.startValue)
      setDragging(false)
      callbacks.current.onGestureCancel?.()
    }
    setMode("idle")
  }, [commitNumber])

  const onWindowActive = useEffectEvent((active: boolean) => {
    if (!active && anchorRef.current) cancelDrag()
  })
  useEffect(
    () => subscribeWindowActive?.(active => onWindowActive(active)),
    [subscribeWindowActive]
  )

  const handleMouseDown = useCallback(
    (event: EventPayload) => {
      if (disabled || mode === "editing" || (event.button !== undefined && event.button !== 0))
        return
      if (event.clickCount !== undefined && event.clickCount >= 2 && defaultValue !== undefined) {
        anchorRef.current = null
        callbacks.current.onGestureStart?.()
        commitNumber(defaultValue)
        callbacks.current.onGestureEnd?.()
        setMode("idle")
        return
      }
      const pressPoint =
        event.x === undefined || event.y === undefined ? null : { x: event.x, y: event.y }
      anchorRef.current = {
        startX: event.x ?? 0,
        startY: event.y ?? 0,
        startValue: valueRef.current,
        dragging: false,
        cursorAnchor: pressPoint && cursorLock ? cursorLock.capture(pressPoint) : null,
        cursorLock,
      }
    },
    [disabled, mode, defaultValue, commitNumber, cursorLock]
  )

  const handleMouseMove = useCallback(
    (event: EventPayload) => {
      const anchor = anchorRef.current
      if (!anchor) return
      const deltaY = (event.y ?? anchor.startY) - anchor.startY
      if (!anchor.dragging) {
        if (
          Math.hypot((event.x ?? anchor.startX) - anchor.startX, deltaY) < CLICK_MOVE_THRESHOLD_PX
        )
          return
        anchor.dragging = true
        if (anchor.cursorAnchor) anchor.cursorLock?.hide()
        callbacks.current.onGestureStart?.()
        setDragging(true)
        setMode("idle")
      }
      commitNumber(
        valueAfterDrag({ startValue: anchor.startValue, deltaY, step: dragStep, min, max })
      )
    },
    [dragStep, min, max, commitNumber]
  )

  const handleMouseUp = useCallback(() => {
    const anchor = anchorRef.current
    anchorRef.current = null
    if (!anchor) return
    if (anchor.dragging) {
      if (anchor.cursorAnchor) anchor.cursorLock?.restore(anchor.cursorAnchor)
      setDragging(false)
      callbacks.current.onGestureEnd?.()
    } else if (!disabled && editable) {
      setDraft("")
      setMode("preEdit")
    }
  }, [disabled, editable])

  const handleScroll = useCallback(
    (event: EventPayload) => {
      if (disabled || dragging || mode === "editing" || !event.deltaY) return
      callbacks.current.onGestureStart?.()
      commitNumber(
        valueAfterWheel({
          currentValue: valueRef.current,
          deltaY: event.deltaY,
          precise: event.precise ?? false,
          step: dragStep,
          min,
          max,
        })
      )
      callbacks.current.onGestureEnd?.()
    },
    [disabled, dragging, mode, dragStep, min, max, commitNumber]
  )

  const startEditing = useCallback(
    (initialDraft: string) => {
      originalValueRef.current = valueRef.current
      editingRef.current = true
      callbacks.current.onGestureStart?.()
      setDraft(initialDraft)
      setMode("editing")
      const parsed = parse ? parse(initialDraft) : Number(initialDraft)
      if (initialDraft.trim() && Number.isFinite(parsed)) commitNumber(parsed)
    },
    [parse, commitNumber]
  )

  const handlePreEditKeyDown = useCallback(
    (event: KeyEvent) => {
      if (disabled) return
      if (event.key === "escape") {
        event.preventDefault()
        event.stopPropagation()
        cancelDrag()
        return
      }
      if (event.key === "up" || event.key === "down") {
        event.preventDefault()
        event.stopPropagation()
        callbacks.current.onGestureStart?.()
        commitNumber(valueRef.current + (event.key === "up" ? step : -step))
        callbacks.current.onGestureEnd?.()
        return
      }
      if (!editable) return
      if (event.key === "enter") {
        event.preventDefault()
        event.stopPropagation()
        startEditing(format(valueRef.current))
        return
      }
      if (mode !== "preEdit") return
      if (event.key === "backspace") startEditing(format(valueRef.current).slice(0, -1))
      else if (event.key && event.key.length === 1 && /[0-9.-]/.test(event.key))
        startEditing(event.key)
      else return
      event.preventDefault()
      event.stopPropagation()
    },
    [disabled, cancelDrag, commitNumber, step, editable, mode, format, startEditing]
  )

  const handleBlur = useCallback(() => {
    if (anchorRef.current) cancelDrag()
    else if (mode === "preEdit") setMode("idle")
  }, [cancelDrag, mode])

  const commitEditing = useCallback(() => {
    if (!editingRef.current) return
    const raw = draft.trim()
    const parsed = parse ? parse(raw) : Number.parseFloat(raw)
    if (raw && Number.isFinite(parsed)) commitNumber(parsed)
    editingRef.current = false
    callbacks.current.onGestureEnd?.()
    setMode("idle")
  }, [draft, parse, commitNumber])

  const handleEditChange = useCallback(
    (raw: string) => {
      setDraft(raw)
      const trimmed = raw.trim()
      if (!trimmed || trimmed === "-" || trimmed === "." || trimmed === "-.") return
      const parsed = parse ? parse(trimmed) : Number.parseFloat(trimmed)
      if (Number.isFinite(parsed)) commitNumber(parsed)
    },
    [parse, commitNumber]
  )

  const handleEditKeyDown = useCallback(
    (event: KeyEvent) => {
      if (!disabled) stopTextShortcutPropagation(event)
      if (event.key !== "escape" || !editingRef.current) return
      event.preventDefault()
      event.stopPropagation()
      editingRef.current = false
      commitNumber(originalValueRef.current)
      callbacks.current.onGestureCancel?.()
      setMode("idle")
    },
    [commitNumber, disabled]
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
