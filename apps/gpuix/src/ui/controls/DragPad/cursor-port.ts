export interface ScreenPoint {
  readonly x: number
  readonly y: number
}

/** Application-owned host capability; controls remain usable without cursor locking. */
export interface CursorLockPort {
  readonly capture: () => ScreenPoint | null
  readonly hide: () => void
  readonly restore: (point: ScreenPoint) => void
}
