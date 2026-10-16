export type AnimationFrameCallback = (timestampMs: number) => void

export interface FrameRenderer {
  setAnimationFrameCallback(callback: AnimationFrameCallback | null): void
  setResumeFrameCallback(callback: AnimationFrameCallback | null): void
  setAnimationFrameActive(active: boolean): void
}

export interface AnimationFrameSource {
  subscribe(callback: AnimationFrameCallback): () => void
  // Resume commits before the first restored present: macOS invokes inside prepaint;
  // Windows defers present while the nonblocking JS callback commits and acknowledges.
  // React consumers use flushSync. GPUI reads/window mutations are forbidden only
  // inside macOS prepaint; the Windows UI thread keeps processing commands.
  subscribeResume(callback: AnimationFrameCallback): () => void
}

interface Subscriber {
  readonly callback: AnimationFrameCallback
}

interface FrameSession {
  readonly subscribers: Set<Subscriber>
}

export function createAnimationFrameSource(renderer: Partial<FrameRenderer>): AnimationFrameSource {
  const { setAnimationFrameCallback, setAnimationFrameActive, setResumeFrameCallback } = renderer
  if (!setAnimationFrameCallback || !setAnimationFrameActive || !setResumeFrameCallback) {
    throw new Error("Renderer does not support animation frame callbacks")
  }
  const setCallback = setAnimationFrameCallback.bind(renderer)
  const setActive = setAnimationFrameActive.bind(renderer)
  const setResumeCallback = setResumeFrameCallback.bind(renderer)
  let session: FrameSession | null = null
  let resumeSession: FrameSession | null = null

  return {
    subscribe(callback) {
      const subscriber = { callback }
      const current = session ?? { subscribers: new Set<Subscriber>() }
      current.subscribers.add(subscriber)

      if (session === null) {
        session = current
        setCallback(timestampMs => {
          if (session !== current) return
          const pending = [...current.subscribers]
          // Native invokes this inside GPUI; consumers may only mutate it after returning.
          queueMicrotask(() => {
            for (const listener of pending) {
              if (session !== current) return
              if (current.subscribers.has(listener)) listener.callback(timestampMs)
            }
          })
        })
        setActive(true)
      }

      return () => {
        if (!current.subscribers.delete(subscriber)) return
        if (current.subscribers.size === 0) {
          session = null
          setActive(false)
          setCallback(null)
        }
      }
    },
    subscribeResume(callback) {
      const subscriber = { callback }
      const current = resumeSession ?? { subscribers: new Set<Subscriber>() }
      current.subscribers.add(subscriber)

      if (resumeSession === null) {
        resumeSession = current
        setResumeCallback(timestampMs => {
          if (resumeSession !== current) return
          const pending = [...current.subscribers]
          for (const listener of pending) {
            if (resumeSession !== current) return
            if (current.subscribers.has(listener)) listener.callback(timestampMs)
          }
        })
      }

      return () => {
        if (!current.subscribers.delete(subscriber)) return
        if (current.subscribers.size === 0) {
          resumeSession = null
          setResumeCallback(null)
        }
      }
    },
  }
}
