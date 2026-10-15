interface CommitSample {
  prepare: number | null
  resetStart: number | null
  resetEnd: number | null
  complete: number | null
}

interface ActiveFrame {
  start: number
  reactStart: number | null
  inputProjectionMs: number
  projectionInsideMs: number
  observerMs: number
  commits: CommitSample[]
  nativeFlushes: { start: number; ms: number }[]
}

const capture: { active: ActiveFrame | null } = { active: null }

export function beginFramePhases(inputProjectionMs: number): void {
  capture.active = {
    start: performance.now(),
    reactStart: null,
    inputProjectionMs,
    projectionInsideMs: 0,
    observerMs: 0,
    commits: [],
    nativeFlushes: [],
  }
}

export function markReactStart(): void {
  if (capture.active) capture.active.reactStart = performance.now()
}

export function measureProjection<T>(project: () => T): T {
  const before = performance.now()
  try {
    return project()
  } finally {
    if (capture.active) capture.active.projectionInsideMs += performance.now() - before
  }
}

export function markPrepareForCommit(): void {
  if (capture.active)
    capture.active.commits.push({
      prepare: performance.now(),
      resetStart: null,
      resetEnd: null,
      complete: null,
    })
}

export function markResetStart(): void {
  const commit = capture.active?.commits.at(-1)
  if (commit) commit.resetStart = performance.now()
}

export function markResetEnd(): void {
  const commit = capture.active?.commits.at(-1)
  if (commit) commit.resetEnd = performance.now()
}

export function markCommitComplete(): void {
  if (!capture.active) return
  let commit = capture.active.commits.at(-1)
  if (!commit || commit.complete !== null) {
    commit = { prepare: null, resetStart: null, resetEnd: null, complete: null }
    capture.active.commits.push(commit)
  }
  commit.complete = performance.now()
}

export function recordNativeFlush(start: number, ms: number): void {
  capture.active?.nativeFlushes.push({ start, ms })
}

export function recordObserver(ms: number): void {
  if (capture.active) capture.active.observerMs += ms
}

export function takeFramePhases() {
  const frame = capture.active
  capture.active = null
  if (!frame) return null
  let renderEnvelopeMs = 0
  let commitInclusiveMs = 0
  let hostQueueFlushMs = 0
  let cursor = frame.reactStart
  let completeBoundaries = cursor !== null && frame.commits.length > 0
  for (const commit of frame.commits) {
    if (cursor === null || commit.prepare === null || commit.complete === null) {
      completeBoundaries = false
      continue
    }
    renderEnvelopeMs += commit.prepare - cursor
    commitInclusiveMs += commit.complete - commit.prepare
    if (commit.resetStart !== null && commit.resetEnd !== null)
      hostQueueFlushMs += commit.resetEnd - commit.resetStart
    cursor = commit.complete
  }
  const firstFlush = frame.nativeFlushes[0]
  const remainder =
    completeBoundaries && cursor !== null && firstFlush ? firstFlush.start - cursor : null
  return {
    projectionMs: frame.inputProjectionMs + frame.projectionInsideMs,
    projectionInputMs: frame.inputProjectionMs,
    projectionInsideReactMs: frame.projectionInsideMs,
    renderEnvelopeExclusiveProjectionMs: completeBoundaries
      ? renderEnvelopeMs - frame.projectionInsideMs
      : null,
    commitInclusiveMs: completeBoundaries ? commitInclusiveMs : null,
    commitExcludingObserverMs: completeBoundaries ? commitInclusiveMs - frame.observerMs : null,
    hostQueueFlushInclusiveMs: completeBoundaries ? hostQueueFlushMs : null,
    postCommitSyncRemainderMs: remainder,
    vnodeConstructionMs: frame.reactStart === null ? null : frame.reactStart - frame.start,
    nativeFlushMs: firstFlush?.ms ?? null,
    additionalNativeFlushMs: frame.nativeFlushes.slice(1).reduce((sum, entry) => sum + entry.ms, 0),
    observerMs: frame.observerMs,
    commits: frame.commits,
    taffyMs: null,
    scope:
      "verification hostConfig/DevTools boundaries; render includes reconciler pre-commit bookkeeping; commit includes layout effects, excludes passive effects; Native flush is not Taffy",
  }
}
