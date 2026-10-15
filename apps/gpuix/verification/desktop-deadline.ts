export function parseDesktopDeadline(value: string | undefined, nowMs: number): number {
  const deadlineMs = value?.endsWith("Z") ? Date.parse(value) : Number.NaN
  if (!Number.isFinite(deadlineMs) || deadlineMs <= nowMs) {
    throw new Error("F3_DESKTOP_DEADLINE must be a future absolute UTC timestamp ending in Z")
  }
  return deadlineMs
}

export function enforceDesktopDeadline(): number {
  let deadlineMs: number
  try {
    deadlineMs = parseDesktopDeadline(process.env.F3_DESKTOP_DEADLINE, Date.now())
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
  // This closes the owned process; it never drives rendering or replaces a display frame.
  setTimeout(() => process.exit(0), deadlineMs - Date.now()).unref()
  return deadlineMs
}
