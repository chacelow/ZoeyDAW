export interface ScreenPoint {
  readonly x: number
  readonly y: number
}

/** Pointer position carried by a gpuix mouse event: points, window content top-left origin. */
export interface WindowPoint {
  readonly x: number
  readonly y: number
}

/** Application-owned host capability; controls remain usable without cursor locking. */
export interface CursorLockPort {
  /** Screen anchor of the press event itself, not of the cursor when JS handles it. */
  readonly capture: (pressPoint: WindowPoint) => ScreenPoint | null
  readonly hide: () => void
  readonly restore: (point: ScreenPoint) => void
}
