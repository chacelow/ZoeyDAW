/** Frame-local projection of accepted transport telemetry. */

export interface PlayheadFrame {
  bar: number
  playing: boolean
  recording: boolean
  revision: number
}

export interface PlayheadProjection {
  readPlayhead: () => PlayheadFrame
  writePlayhead: (frame: Omit<PlayheadFrame, "revision">) => void
  readRevision: () => number
  dispose: () => void
}

export function createPlayheadProjection(): PlayheadProjection {
  let frame: PlayheadFrame = { bar: 1, playing: false, recording: false, revision: 0 }

  return {
    readRevision: () => frame.revision,
    readPlayhead: () => frame,
    writePlayhead(next) {
      if (
        frame.bar === next.bar &&
        frame.playing === next.playing &&
        frame.recording === next.recording
      )
        return
      frame = { ...next, revision: frame.revision + 1 }
    },
    dispose() {
      frame = { bar: 1, playing: false, recording: false, revision: 0 }
    },
  }
}

export const arrangementPlayhead = createPlayheadProjection()
