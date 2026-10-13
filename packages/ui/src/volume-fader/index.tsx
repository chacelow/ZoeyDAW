/**
 * VolumeFader — DAW 可拖音量 fader(有 thumb,无电平表)。
 *
 * 用在:track header、mixer channel strip、master section、send return。
 * 单位 **dB**(-60..+6 默认),0 dB = unity;拖 thumb 即时 onChange。
 *
 * - 轨道上任意位置 pointerdown 跳到对应 dB(方便快速定位)
 * - 继续拖 → 平滑调整(距离制,鼠标速度无关)
 * - 双击 thumb 或 track → `resetDb`(默认 0)
 * - Shift 精细 ×0.25
 *
 * **横 / 纵**都支持,API 同;chrome 的宽/高由 className 决定。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../cn";

export interface VolumeFaderProps {
  valueDb: number;
  onChange: (db: number) => void;
  minDb?: number;
  maxDb?: number;
  /** 双击重置目标 dB,默认 0(unity) */
  resetDb?: number;
  orientation?: "vertical" | "horizontal";
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  onGestureCancel?: () => void;
}

const DEFAULT_MIN = -60;
const DEFAULT_MAX = 6;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function VolumeFader({
  valueDb,
  onChange,
  minDb = DEFAULT_MIN,
  maxDb = DEFAULT_MAX,
  resetDb = 0,
  orientation = "horizontal",
  disabled = false,
  className,
  "aria-label": ariaLabel = "Volume",
  onGestureStart,
  onGestureEnd,
  onGestureCancel,
}: VolumeFaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<{
    pointerId: number;
    position: number;
    db: number;
    startDb: number;
    shift: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const vertical = orientation === "vertical";
  const latest = useRef(valueDb);
  const handlers = useRef({
    applyFromClient: undefined as
      undefined | ((x: number, y: number, shift: boolean) => void),
    onChange,
    onGestureEnd,
    onGestureCancel,
  });
  latest.current = valueDb;

  const positionFromClient = useCallback(
    (clientX: number, clientY: number): number => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      return vertical ? rect.bottom - clientY : clientX - rect.left;
    },
    [vertical],
  );

  const applyFromClient = useCallback(
    (clientX: number, clientY: number, shift: boolean) => {
      const origin = anchor.current;
      const rect = trackRef.current?.getBoundingClientRect();
      if (!origin || !rect) return;
      const position = positionFromClient(clientX, clientY);
      if (origin.shift !== shift) {
        origin.position = position;
        origin.db = latest.current;
        origin.shift = shift;
        return;
      }
      const span = vertical ? rect.height : rect.width;
      if (!span) return;
      const next = clamp(
        origin.db +
          ((position - origin.position) / span) *
            (maxDb - minDb) *
            (shift ? 0.25 : 1),
        minDb,
        maxDb,
      );
      if (next !== latest.current) {
        latest.current = next;
        onChange(next);
      }
    },
    [positionFromClient, vertical, minDb, maxDb, onChange],
  );
  handlers.current = {
    applyFromClient,
    onChange,
    onGestureEnd,
    onGestureCancel,
  };

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || event.button !== 0 || anchor.current) return;
      event.preventDefault();
      try {
        trackRef.current?.setPointerCapture(event.pointerId);
      } catch {
        // Document listeners still track the gesture.
      }
      onGestureStart?.();
      const rect = trackRef.current?.getBoundingClientRect();
      const position = positionFromClient(event.clientX, event.clientY);
      const span = vertical ? rect?.height : rect?.width;
      const clickedDb = span
        ? clamp(minDb + (position / span) * (maxDb - minDb), minDb, maxDb)
        : latest.current;
      const thumb =
        event.target instanceof HTMLElement &&
        event.target.dataset.faderThumb === "true";
      anchor.current = {
        pointerId: event.pointerId,
        position,
        db: thumb ? latest.current : clickedDb,
        startDb: latest.current,
        shift: event.shiftKey,
      };
      if (!thumb && clickedDb !== latest.current) {
        latest.current = clickedDb;
        onChange(clickedDb);
      }
      setDragging(true);
    },
    [
      disabled,
      minDb,
      maxDb,
      onChange,
      onGestureStart,
      positionFromClient,
      vertical,
    ],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      if (anchor.current?.pointerId === event.pointerId)
        handlers.current.applyFromClient?.(
          event.clientX,
          event.clientY,
          event.shiftKey,
        );
    };
    const up = (event: PointerEvent) => {
      const current = anchor.current;
      if (!current || current.pointerId !== event.pointerId) return;
      anchor.current = null;
      setDragging(false);
      if (
        event.type === "pointercancel" ||
        event.type === "lostpointercapture"
      ) {
        if (handlers.current.onGestureCancel)
          handlers.current.onGestureCancel();
        else handlers.current.onChange(current.startDb);
      } else handlers.current.onGestureEnd?.();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    document.addEventListener("lostpointercapture", up);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      document.removeEventListener("lostpointercapture", up);
      if (anchor.current) {
        const current = anchor.current;
        anchor.current = null;
        if (handlers.current.onGestureCancel)
          handlers.current.onGestureCancel();
        else handlers.current.onChange(current.startDb);
      }
    };
  }, [dragging]);

  const ratio = (clamp(valueDb, minDb, maxDb) - minDb) / (maxDb - minDb);
  const unityRatio = (0 - minDb) / (maxDb - minDb); // 0 dB 位置,画 unity 刻度线

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      aria-valuemin={minDb}
      aria-valuemax={maxDb}
      aria-valuenow={valueDb}
      aria-disabled={disabled || undefined}
      onPointerDown={handlePointerDown}
      onDoubleClick={(event) => {
        if (disabled) return;
        event.preventDefault();
        onChange(clamp(resetDb, minDb, maxDb));
      }}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(event) => {
        if (disabled) return;
        const direction =
          event.key === "ArrowUp" || event.key === "ArrowRight"
            ? 1
            : event.key === "ArrowDown" || event.key === "ArrowLeft"
              ? -1
              : 0;
        if (!direction && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        const next =
          event.key === "Home"
            ? minDb
            : event.key === "End"
              ? maxDb
              : clamp(
                  valueDb + direction * (event.shiftKey ? 0.1 : 1),
                  minDb,
                  maxDb,
                );
        onChange(next);
      }}
      className={cn(
        "relative shrink-0 cursor-pointer select-none bg-muted",
        vertical ? "h-full w-2 rounded-sm" : "h-2 w-full rounded-sm",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      {/* unity dB 位置的刻度线 */}
      <div
        aria-hidden
        className="absolute bg-foreground/30"
        style={
          vertical
            ? {
                bottom: `${unityRatio * 100}%`,
                left: 0,
                right: 0,
                height: "1px",
              }
            : { left: `${unityRatio * 100}%`, top: 0, bottom: 0, width: "1px" }
        }
      />
      {/* 填充条:从起点到当前 ratio */}
      <div
        aria-hidden
        className="absolute bg-primary/60"
        style={
          vertical
            ? { bottom: 0, left: 0, right: 0, height: `${ratio * 100}%` }
            : { left: 0, top: 0, bottom: 0, width: `${ratio * 100}%` }
        }
      />
      {/* thumb */}
      <div
        aria-hidden
        data-fader-thumb="true"
        className={cn(
          "absolute rounded-sm bg-foreground shadow-sm transition-transform",
          vertical
            ? "left-[-2px] right-[-2px] h-1"
            : "top-[-2px] bottom-[-2px] w-1",
          dragging && "scale-110",
        )}
        style={
          vertical
            ? { bottom: `calc(${ratio * 100}% - 2px)` }
            : { left: `calc(${ratio * 100}% - 2px)` }
        }
      />
    </div>
  );
}
