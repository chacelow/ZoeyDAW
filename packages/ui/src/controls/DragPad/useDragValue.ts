import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useControlEnvironment } from "../ControlEnvironment/useControlEnvironment";

export interface UseDragValueOptions {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  sensitivity?: number;
  pxPerStep?: number;
  defaultValue?: number;
  onClick?: () => void;
  clickThresholdPx?: number;
  disabled?: boolean;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  onGestureCancel?: () => void;
  /** False while the editable input replaces the button. */
  attached?: boolean;
}

export interface UseDragValueResult {
  dragging: boolean;
  handlePointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  handleClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  handleDoubleClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  ref: React.RefObject<HTMLButtonElement | null>;
}

interface DragAnchor {
  pointerId: number;
  originX: number;
  originY: number;
  baseY: number;
  baseValue: number;
  shift: boolean;
  everDragged: boolean;
  virtualY: number;
  lastClientY: number;
  recentering: boolean;
}

const DRAG_CLASS = "dragpad-dragging";
const WHEEL_PX_THRESHOLD = 40;

export function useDragValue(options: UseDragValueOptions): UseDragValueResult {
  const { restoreCursor, recenterCursor } = useControlEnvironment();
  const ref = useRef<HTMLButtonElement>(null);
  const [dragging, setDragging] = useState(false);
  const valueRef = useRef(options.value);
  const wheelValueRef = useRef(options.value);
  const anchorRef = useRef<DragAnchor | null>(null);
  const pendingRevealRef = useRef<(() => void) | null>(null);
  const wheelPublishedRef = useRef(options.value);
  const wheelTimerRef = useRef<number | null>(null);
  const optionsRef = useRef({ ...options, restoreCursor, recenterCursor });
  useLayoutEffect(() => {
    optionsRef.current = { ...options, restoreCursor, recenterCursor };
    if (options.value !== wheelPublishedRef.current)
      wheelValueRef.current = options.value;
    valueRef.current = options.value;
  }, [options, restoreCursor, recenterCursor]);

  const endWheelBurst = useCallback(() => {
    if (wheelTimerRef.current === null) return;
    clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = null;
    optionsRef.current.onGestureEnd?.();
    wheelValueRef.current = valueRef.current;
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const clamp = (value: number) => {
      const { min, max } = optionsRef.current;
      return Math.min(max, Math.max(min, value));
    };
    const quantize = (value: number) => {
      const { step = 0 } = optionsRef.current;
      return clamp(step > 0 ? Math.round(value / step) * step : value);
    };
    const publish = (value: number) => {
      const next = quantize(value);
      if (next === valueRef.current) return;
      valueRef.current = next;
      wheelPublishedRef.current = next;
      optionsRef.current.onChange(next);
    };
    const releaseCapture = (pointerId: number) => {
      try {
        if (element.hasPointerCapture?.(pointerId))
          element.releasePointerCapture(pointerId);
      } catch {
        // The browser may already have released capture.
      }
    };
    const reveal = () => {
      pendingRevealRef.current = null;
      document.documentElement.classList.remove(DRAG_CLASS);
    };
    const move = (event: PointerEvent) => {
      const anchor = anchorRef.current;
      if (!anchor || event.pointerId !== anchor.pointerId) return;
      const {
        clickThresholdPx = 3,
        min,
        max,
        sensitivity = 0.0015,
        step = 0,
        pxPerStep = 1,
      } = optionsRef.current;
      if (!anchor.everDragged) {
        if (
          Math.hypot(
            event.clientX - anchor.originX,
            event.clientY - anchor.originY,
          ) < clickThresholdPx
        )
          return;
        anchor.everDragged = true;
        document.documentElement.classList.add(DRAG_CLASS);
        setDragging(true);
        if (
          !optionsRef.current.recenterCursor &&
          typeof element.requestPointerLock === "function"
        ) {
          try {
            void Promise.resolve(element.requestPointerLock()).catch(
              () => undefined,
            );
          } catch {
            // WKWebView may expose the method without implementing pointer lock.
          }
        }
      }
      if (document.pointerLockElement === element) {
        anchor.virtualY += event.movementY;
      } else {
        if (anchor.recentering) return;
        anchor.virtualY += event.clientY - anchor.lastClientY;
        anchor.lastClientY = event.clientY;
        if (
          optionsRef.current.recenterCursor &&
          (event.clientY < 32 || event.clientY > window.innerHeight - 32)
        ) {
          anchor.recentering = true;
          const centerY = window.innerHeight / 2;
          void Promise.resolve()
            .then(() =>
              optionsRef.current.recenterCursor?.(anchor.originX, centerY),
            )
            .then(() => {
              if (anchorRef.current === anchor) anchor.lastClientY = centerY;
            })
            .catch(() => undefined)
            .finally(() => {
              anchor.recentering = false;
            });
        }
      }
      if (anchor.shift !== event.shiftKey) {
        anchor.baseY = anchor.virtualY;
        anchor.baseValue = valueRef.current;
        anchor.shift = event.shiftKey;
        return;
      }
      const perPixel = Math.max(
        (max - min) * sensitivity,
        step > 0 ? step / pxPerStep : 0,
      );
      const next =
        anchor.baseValue +
        (anchor.baseY - anchor.virtualY) *
          perPixel *
          (event.shiftKey ? 0.1 : 1);
      publish(next);
      if (next < min || next > max) {
        anchor.baseValue = valueRef.current;
        anchor.baseY = anchor.virtualY;
      }
    };
    const lockChanged = () => {
      const anchor = anchorRef.current;
      if (!anchor || !anchor.everDragged) return;
      if (document.pointerLockElement === element) {
        anchor.baseY = anchor.virtualY;
        anchor.baseValue = valueRef.current;
      }
    };
    const release = (event: PointerEvent) => {
      if (
        event.type === "lostpointercapture" &&
        document.pointerLockElement === element
      )
        return;
      const anchor = anchorRef.current;
      if (!anchor || event.pointerId !== anchor.pointerId) return;
      anchorRef.current = null;
      if (document.pointerLockElement === element) document.exitPointerLock();
      releaseCapture(anchor.pointerId);
      setDragging(false);
      if (event.type === "pointercancel" || event.type === "lostpointercapture")
        optionsRef.current.onGestureCancel?.();
      else optionsRef.current.onGestureEnd?.();
      wheelValueRef.current = valueRef.current;
      if (!anchor.everDragged) {
        if (event.type === "pointerup") {
          element.focus();
          optionsRef.current.onClick?.();
        }
        return;
      }
      const restore = optionsRef.current.restoreCursor;
      if (!restore) {
        reveal();
        return;
      }
      let disposed = false;
      let firstFrame = 0;
      let secondFrame = 0;
      pendingRevealRef.current = () => {
        disposed = true;
        cancelAnimationFrame(firstFrame);
        cancelAnimationFrame(secondFrame);
        reveal();
      };
      Promise.resolve()
        .then(() => restore(anchor.originX, anchor.originY))
        .catch(() => undefined)
        .then(() => {
          if (disposed) return;
          firstFrame = requestAnimationFrame(() => {
            secondFrame = requestAnimationFrame(() => {
              if (!disposed) reveal();
            });
          });
        });
    };
    const endWheel = endWheelBurst;
    const wheel = (event: WheelEvent) => {
      if (optionsRef.current.disabled) return;
      event.preventDefault();
      const { min, max, step = 0 } = optionsRef.current;
      const pixels =
        event.deltaY *
        (event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? window.innerHeight
            : 1);
      if (!pixels) return;
      if (wheelTimerRef.current === null) optionsRef.current.onGestureStart?.();
      else clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = window.setTimeout(endWheel, 200);
      const wheelStep = step > 0 ? step : (max - min) * 0.005;
      wheelValueRef.current = clamp(
        wheelValueRef.current -
          (pixels / WHEEL_PX_THRESHOLD) *
            wheelStep *
            (event.shiftKey ? 0.1 : 1),
      );
      publish(wheelValueRef.current);
    };
    const resetWheel = () => {
      endWheel();
      wheelValueRef.current = valueRef.current;
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", release);
    document.addEventListener("pointerlockchange", lockChanged);
    element.addEventListener("lostpointercapture", release);
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("pointerleave", resetWheel);
    return () => {
      const active = anchorRef.current;
      anchorRef.current = null;
      if (active) {
        optionsRef.current.onGestureCancel?.();
        if (document.pointerLockElement === element) document.exitPointerLock();
        if (active.everDragged) {
          const restore = optionsRef.current.restoreCursor;
          if (restore)
            void Promise.resolve()
              .then(() => restore(active.originX, active.originY))
              .catch(() => undefined)
              .finally(reveal);
          else reveal();
        } else reveal();
      }
      if (!active) pendingRevealRef.current?.();
      if (wheelTimerRef.current !== null) {
        clearTimeout(wheelTimerRef.current);
        wheelTimerRef.current = null;
        optionsRef.current.onGestureCancel?.();
      }
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", release);
      document.removeEventListener("pointerlockchange", lockChanged);
      element.removeEventListener("lostpointercapture", release);
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("pointerleave", resetWheel);
    };
  }, [options.attached, endWheelBurst]);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (
        optionsRef.current.disabled ||
        event.detail !== 0 ||
        anchorRef.current
      )
        return;
      endWheelBurst();
      optionsRef.current.onClick?.();
    },
    [endWheelBurst],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const { disabled } = optionsRef.current;
      if (disabled || event.button !== 0 || anchorRef.current) return;
      pendingRevealRef.current?.();
      endWheelBurst();
      optionsRef.current.onGestureStart?.();
      anchorRef.current = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        baseY: event.clientY,
        virtualY: event.clientY,
        baseValue: valueRef.current,
        lastClientY: event.clientY,
        recentering: false,
        shift: event.shiftKey,
        everDragged: false,
      };
      try {
        ref.current?.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture may be unavailable outside a browser.
      }
    },
    [endWheelBurst],
  );

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const {
        defaultValue,
        disabled,
        min,
        max,
        step = 0,
        onChange,
      } = optionsRef.current;
      if (disabled || defaultValue === undefined) return;
      event.preventDefault();
      const clamped = Math.min(max, Math.max(min, defaultValue));
      const next = Math.min(
        max,
        Math.max(min, step > 0 ? Math.round(clamped / step) * step : clamped),
      );
      if (next === valueRef.current) return;
      optionsRef.current.onGestureStart?.();
      valueRef.current = next;
      wheelValueRef.current = next;
      wheelPublishedRef.current = next;
      onChange(next);
      optionsRef.current.onGestureEnd?.();
    },
    [],
  );

  return { dragging, handlePointerDown, handleClick, handleDoubleClick, ref };
}
