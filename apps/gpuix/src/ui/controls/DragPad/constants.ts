/**
 * Shared interaction constants for the DragPad family.
 *
 * `DRAG_PIXELS_PER_STEP` is the ONE drag scale every DragPad instance uses,
 * regardless of its `min`/`max` range. Do not derive a second, range-scaled
 * sensitivity (e.g. `(max - min) * factor`) for controls with a small
 * range: that reintroduces the "some controls drag faster than others"
 * inconsistency this control is built to avoid. A consumer who wants a
 * coarser or finer control changes `step`, not the shared pixel scale.
 */
export const DRAG_PIXELS_PER_STEP = 4

/** Pointer travel (px) below which a press is a click, not a drag. */
export const CLICK_MOVE_THRESHOLD_PX = 3

/** Pixel-equivalent wheel delta that advances the value by one `step`. */
export const WHEEL_PIXELS_PER_STEP = 16

/** `deltaY` unit when `event.precise` is false (line-based mouse wheel). */
export const WHEEL_LINE_PIXELS = 16
