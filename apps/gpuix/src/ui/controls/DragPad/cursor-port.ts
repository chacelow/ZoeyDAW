export interface WindowPoint {
  readonly x: number
  readonly y: number
}

export interface CursorLockPort {
  /** Hide and pin the cursor; later moves report positions built from relative motion. */
  readonly begin: () => void
  /** Show the cursor at `release` (window coordinates), or where the drag began when omitted. */
  readonly end: (release?: WindowPoint) => void
}
