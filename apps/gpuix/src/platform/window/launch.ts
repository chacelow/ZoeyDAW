/**
 * Window launch focus shared by every entry (main app, Gallery, section demos); spread into
 * gpuix `render()` options. `GPUIX_BACKGROUND=1` opens without taking key focus so automation
 * can run beside the user's work. It is not a substitute for real-desktop acceptance.
 */
export const LAUNCH_FOCUS = { focus: process.env.GPUIX_BACKGROUND !== "1" } as const
