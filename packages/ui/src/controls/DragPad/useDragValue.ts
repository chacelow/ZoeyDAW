import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useControlEnvironment } from "../ControlEnvironment/useControlEnvironment"

export interface UseDragValueOptions {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  sensitivity?: number
  pxPerStep?: number
  defaultValue?: number
  onClick?: () => void
  clickThresholdPx?: number
  disabled?: boolean
  onGestureStart?: () => void
  onGestureEnd?: () => void
  onGestureCancel?: () => void
  /**
  False while the editable input replaces the button.
  */
  attached?: boolean
}

export interface UseDragValueResult {
  dragging: boolean
  handlePointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void
  handleClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  handleDoubleClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  ref: React.RefObject<HTMLButtonElement | null>
}

interface DragAnchor {
  pointerId: number
  originX: number
  originY: number
  baseY: number
  baseValue: number
  shift: boolean
  everDragged: boolean
  virtualY: number
  lastClientY: number
  recentering: boolean
}

const DRAG_CLASS = "dragpad-dragging"
const WHEEL_PX_THRESHOLD = 40

export function useDragValue(options: UseDragValueOptions): UseDragValueResult {
  const { restoreCursor, recenterCursor } = useControlEnvironment()
  const reference = useRef<HTMLButtonElement>(null)
  const [dragging, setDragging] = useState(false)
  const valueReference = useRef(options.value)
  const wheelValueReference = useRef(options.value)
  const anchorReference = useRef<DragAnchor | null>(null)
  const pendingRevealReference = useRef<(() => void) | null>(null)
  const wheelPublishedReference = useRef(options.value)
  const wheelTimerReference = useRef<number | null>(null)
  const optionsReference = useRef({ ...options, restoreCursor, recenterCursor })
  useLayoutEffect(() => {
    optionsReference.current = { ...options, restoreCursor, recenterCursor }
    if (options.value !== wheelPublishedReference.current) {
      wheelValueReference.current = options.value
    }
    valueReference.current = options.value
  }, [options, restoreCursor, recenterCursor])

  const endWheelBurst = useCallback(() => {
    if (wheelTimerReference.current === null) {
      return
    }
    clearTimeout(wheelTimerReference.current)
    wheelTimerReference.current = null
    optionsReference.current.onGestureEnd?.()
    wheelValueReference.current = valueReference.current
  }, [])

  useEffect(() => {
    const element = reference.current
    if (!element) {
      return
    }

    const clamp = (value: number) => {
      const { min, max } = optionsReference.current
      return Math.min(max, Math.max(min, value))
    }
    const quantize = (value: number) => {
      const { step = 0 } = optionsReference.current
      return clamp(step > 0 ? Math.round(value / step) * step : value)
    }
    const publish = (value: number) => {
      const next = quantize(value)
      if (next === valueReference.current) {
        return
      }
      valueReference.current = next
      wheelPublishedReference.current = next
      optionsReference.current.onChange(next)
    }
    const releaseCapture = (pointerId: number) => {
      try {
        if (element.hasPointerCapture?.(pointerId)) {
          element.releasePointerCapture(pointerId)
        }
      } catch {
        // The browser may already have released capture.
      }
    }
    const reveal = () => {
      pendingRevealReference.current = null
      document.documentElement.classList.remove(DRAG_CLASS)
    }
    const move = (event: PointerEvent) => {
      const anchor = anchorReference.current
      if (!anchor || event.pointerId !== anchor.pointerId) {
        return
      }
      const {
        clickThresholdPx = 3,
        min,
        max,
        sensitivity = 0.0015,
        step = 0,
        pxPerStep = 1,
      } = optionsReference.current
      if (!anchor.everDragged) {
        if (
          Math.hypot(event.clientX - anchor.originX, event.clientY - anchor.originY) <
          clickThresholdPx
        ) {
          return
        }
        anchor.everDragged = true
        document.documentElement.classList.add(DRAG_CLASS)
        setDragging(true)
        if (
          !optionsReference.current.recenterCursor &&
          typeof element.requestPointerLock === "function"
        ) {
          try {
            void Promise.resolve(element.requestPointerLock()).catch(() => {})
          } catch {
            // WKWebView may expose the method without implementing pointer lock.
          }
        }
      }
      if (document.pointerLockElement === element) {
        anchor.virtualY += event.movementY
      } else {
        if (anchor.recentering) {
          return
        }
        anchor.virtualY += event.clientY - anchor.lastClientY
        anchor.lastClientY = event.clientY
        if (
          optionsReference.current.recenterCursor &&
          (event.clientY < 32 || event.clientY > window.innerHeight - 32)
        ) {
          anchor.recentering = true
          const centerY = window.innerHeight / 2
          void Promise.resolve()
            .then(() => optionsReference.current.recenterCursor?.(anchor.originX, centerY))
            .then(() => {
              if (anchorReference.current === anchor) {
                anchor.lastClientY = centerY
              }
            })
            .catch(() => {})
            .finally(() => {
              anchor.recentering = false
            })
        }
      }
      if (anchor.shift !== event.shiftKey) {
        anchor.baseY = anchor.virtualY
        anchor.baseValue = valueReference.current
        anchor.shift = event.shiftKey
        return
      }
      const perPixel = Math.max((max - min) * sensitivity, step > 0 ? step / pxPerStep : 0)
      const next =
        anchor.baseValue + (anchor.baseY - anchor.virtualY) * perPixel * (event.shiftKey ? 0.1 : 1)
      publish(next)
      if (!(next < min || next > max)) {
        return
      }

      anchor.baseValue = valueReference.current
      anchor.baseY = anchor.virtualY
    }
    const lockChanged = () => {
      const anchor = anchorReference.current
      if (!anchor || !anchor.everDragged || !(document.pointerLockElement === element)) {
        return
      }

      anchor.baseY = anchor.virtualY
      anchor.baseValue = valueReference.current
    }
    const release = (event: PointerEvent) => {
      if (event.type === "lostpointercapture" && document.pointerLockElement === element) {
        return
      }
      const anchor = anchorReference.current
      if (!anchor || event.pointerId !== anchor.pointerId) {
        return
      }
      anchorReference.current = null
      if (document.pointerLockElement === element) {
        document.exitPointerLock()
      }
      releaseCapture(anchor.pointerId)
      setDragging(false)
      if (event.type === "pointercancel" || event.type === "lostpointercapture") {
        optionsReference.current.onGestureCancel?.()
      } else {
        optionsReference.current.onGestureEnd?.()
      }
      wheelValueReference.current = valueReference.current
      if (!anchor.everDragged) {
        if (event.type === "pointerup") {
          element.focus()
          optionsReference.current.onClick?.()
        }
        return
      }
      const restore = optionsReference.current.restoreCursor
      if (!restore) {
        reveal()
        return
      }
      let isDisposed = false
      let firstFrame = 0
      let secondFrame = 0
      pendingRevealReference.current = () => {
        isDisposed = true
        cancelAnimationFrame(firstFrame)
        cancelAnimationFrame(secondFrame)
        reveal()
      }
      Promise.resolve()
        .then(() => restore(anchor.originX, anchor.originY))
        .catch(() => {})
        .then(() => {
          if (isDisposed) {
            return
          }
          firstFrame = requestAnimationFrame(() => {
            secondFrame = requestAnimationFrame(() => {
              if (!isDisposed) {
                reveal()
              }
            })
          })
        })
    }
    const endWheel = endWheelBurst
    const wheel = (event: WheelEvent) => {
      if (optionsReference.current.disabled) {
        return
      }
      event.preventDefault()
      const { min, max, step = 0 } = optionsReference.current
      const pixels =
        event.deltaY *
        (event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? window.innerHeight
            : 1)
      if (!pixels) {
        return
      }
      if (wheelTimerReference.current === null) {
        optionsReference.current.onGestureStart?.()
      } else {
        clearTimeout(wheelTimerReference.current)
      }
      wheelTimerReference.current = window.setTimeout(endWheel, 200)
      const wheelStep = step > 0 ? step : (max - min) * 0.005
      wheelValueReference.current = clamp(
        wheelValueReference.current -
          (pixels / WHEEL_PX_THRESHOLD) * wheelStep * (event.shiftKey ? 0.1 : 1)
      )
      publish(wheelValueReference.current)
    }
    const resetWheel = () => {
      endWheel()
      wheelValueReference.current = valueReference.current
    }
    document.addEventListener("pointermove", move)
    document.addEventListener("pointerup", release)
    document.addEventListener("pointercancel", release)
    document.addEventListener("pointerlockchange", lockChanged)
    element.addEventListener("lostpointercapture", release)
    element.addEventListener("wheel", wheel, { passive: false })
    element.addEventListener("pointerleave", resetWheel)
    return () => {
      const active = anchorReference.current
      anchorReference.current = null
      if (active) {
        optionsReference.current.onGestureCancel?.()
        if (document.pointerLockElement === element) {
          document.exitPointerLock()
        }
        if (active.everDragged) {
          const restore = optionsReference.current.restoreCursor
          if (restore) {
            void Promise.resolve()
              .then(() => restore(active.originX, active.originY))
              .catch(() => {})
              .finally(reveal)
          } else {
            reveal()
          }
        } else {
          reveal()
        }
      }
      if (!active) {
        pendingRevealReference.current?.()
      }
      if (wheelTimerReference.current !== null) {
        clearTimeout(wheelTimerReference.current)
        wheelTimerReference.current = null
        optionsReference.current.onGestureCancel?.()
      }
      document.removeEventListener("pointermove", move)
      document.removeEventListener("pointerup", release)
      document.removeEventListener("pointercancel", release)
      document.removeEventListener("pointerlockchange", lockChanged)
      element.removeEventListener("lostpointercapture", release)
      element.removeEventListener("wheel", wheel)
      element.removeEventListener("pointerleave", resetWheel)
    }
  }, [options.attached, endWheelBurst])

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (optionsReference.current.disabled || event.detail !== 0 || anchorReference.current) {
        return
      }
      endWheelBurst()
      optionsReference.current.onClick?.()
    },
    [endWheelBurst]
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const { disabled } = optionsReference.current
      if (disabled || event.button !== 0 || anchorReference.current) {
        return
      }
      pendingRevealReference.current?.()
      endWheelBurst()
      optionsReference.current.onGestureStart?.()
      anchorReference.current = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        baseY: event.clientY,
        virtualY: event.clientY,
        baseValue: valueReference.current,
        lastClientY: event.clientY,
        recentering: false,
        shift: event.shiftKey,
        everDragged: false,
      }
      try {
        reference.current?.setPointerCapture?.(event.pointerId)
      } catch {
        // Pointer capture may be unavailable outside a browser.
      }
    },
    [endWheelBurst]
  )

  const handleDoubleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const { defaultValue, disabled, min, max, step = 0, onChange } = optionsReference.current
    if (disabled || defaultValue === undefined) {
      return
    }
    event.preventDefault()
    const clamped = Math.min(max, Math.max(min, defaultValue))
    const next = Math.min(
      max,
      Math.max(min, step > 0 ? Math.round(clamped / step) * step : clamped)
    )
    if (next === valueReference.current) {
      return
    }
    optionsReference.current.onGestureStart?.()
    valueReference.current = next
    wheelValueReference.current = next
    wheelPublishedReference.current = next
    onChange(next)
    optionsReference.current.onGestureEnd?.()
  }, [])

  return { dragging, handlePointerDown, handleClick, handleDoubleClick, ref: reference }
}
