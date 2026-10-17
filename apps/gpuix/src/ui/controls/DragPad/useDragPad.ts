import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import type { EventPayload, KeyEvent } from "@gpuix/react"
import { consumeKey } from "@/shared/keyboard"
import type { ControlInputPolicy } from "../ControlEnvironment"
import { useControlEnvironment } from "../ControlEnvironment"
import { stopTextShortcutPropagation } from "../keyboard"
import type { CursorLockPort } from "./cursor-port"
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
  lastY: number
  startValue: number
  rawValue: number
  dragging: boolean
  cursorLock: CursorLockPort | undefined
  inputPolicy: ControlInputPolicy
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
  const { cursorLock, subscribeWindowActive, inputPolicy } = useControlEnvironment()
  const { renderer } = useGpuix()
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
      if (anchor?.dragging) anchor.cursorLock?.end()
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
      anchor.cursorLock?.end()
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
      renderer?.clearSelection?.()
      if (event.clickCount !== undefined && event.clickCount >= 2 && defaultValue !== undefined) {
        anchorRef.current = null
        callbacks.current.onGestureStart?.()
        commitNumber(defaultValue)
        callbacks.current.onGestureEnd?.()
        setMode("idle")
        return
      }
      if (!inputPolicy) throw new Error("DragPad pointer interaction requires ControlInputPolicy")
      anchorRef.current = {
        startX: event.x ?? 0,
        startY: event.y ?? 0,
        lastY: event.y ?? 0,
        startValue: valueRef.current,
        rawValue: valueRef.current,
        dragging: false,
        cursorLock: event.x === undefined || event.y === undefined ? undefined : cursorLock,
        inputPolicy,
      }
    },
    [disabled, mode, defaultValue, commitNumber, cursorLock, inputPolicy, renderer]
  )

  const handleMouseMove = useCallback(
    (event: EventPayload) => {
      const anchor = anchorRef.current
      if (!anchor) return
      renderer?.clearSelection?.()
      const y = event.y ?? anchor.lastY
      if (!anchor.dragging) {
        if (
          Math.hypot((event.x ?? anchor.startX) - anchor.startX, y - anchor.startY) <
          anchor.inputPolicy.dragThresholdPixels
        )
          return
        anchor.dragging = true
        anchor.cursorLock?.begin()
        callbacks.current.onGestureStart?.()
        setDragging(true)
        setMode("idle")
      }
      const deltaY = y - anchor.lastY
      const next = valueAfterDrag({
        rawValue: anchor.rawValue,
        deltaY,
        step: dragStep,
        min,
        max,
        dragPixelsPerStep: anchor.inputPolicy.dragPixelsPerStep,
      })
      anchor.rawValue = next.raw
      anchor.lastY = y
      commitNumber(next.value)
    },
    [dragStep, min, max, commitNumber, renderer]
  )

  const handleMouseUp = useCallback(() => {
    const anchor = anchorRef.current
    anchorRef.current = null
    if (!anchor) return
    if (anchor.dragging) {
      anchor.cursorLock?.end()
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
      if (!inputPolicy) throw new Error("DragPad wheel interaction requires ControlInputPolicy")
      callbacks.current.onGestureStart?.()
      commitNumber(
        valueAfterWheel({
          currentValue: valueRef.current,
          deltaY: event.deltaY,
          precise: event.precise ?? false,
          step: dragStep,
          min,
          max,
          wheelPixelsPerStep: inputPolicy.wheelPixelsPerStep,
          wheelLinePixels: inputPolicy.wheelLinePixels,
        })
      )
      callbacks.current.onGestureEnd?.()
    },
    [disabled, dragging, mode, dragStep, min, max, commitNumber, inputPolicy]
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
        if (!anchorRef.current && mode !== "preEdit") return
        consumeKey(event, "handled")
        cancelDrag()
        return
      }
      if (event.key === "up" || event.key === "down") {
        consumeKey(event, "handled")
        callbacks.current.onGestureStart?.()
        commitNumber(valueRef.current + (event.key === "up" ? step : -step))
        callbacks.current.onGestureEnd?.()
        return
      }
      if (!editable) return
      if (event.key === "enter") {
        consumeKey(event, "handled")
        startEditing(format(valueRef.current))
        return
      }
      if (mode !== "preEdit") return
      if (event.key === "backspace") startEditing(format(valueRef.current).slice(0, -1))
      else if (event.key && event.key.length === 1 && /[0-9.-]/.test(event.key))
        startEditing(event.key)
      else return
      consumeKey(event, "handled")
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
      consumeKey(event, "handled")
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
