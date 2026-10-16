export interface ScreenPoint {
  readonly x: number
  readonly y: number
}

export interface WindowPoint {
  readonly x: number
  readonly y: number
}

export interface CursorLockPort {
  readonly capture: (pressPoint: WindowPoint) => ScreenPoint | null
  readonly hide: () => void
  readonly restore: (point: ScreenPoint) => void
}
