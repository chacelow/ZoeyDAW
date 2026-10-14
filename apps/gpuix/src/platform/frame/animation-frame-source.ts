export type AnimationFrameCallback = (timestampMs: number) => void

export interface FrameRenderer {
  setAnimationFrameCallback(callback: AnimationFrameCallback | null): void
  setAnimationFrameActive(active: boolean): void
}

export interface AnimationFrameSource {
  subscribe(callback: AnimationFrameCallback): () => void
}

interface Subscriber {
  readonly callback: AnimationFrameCallback
}

interface FrameSession {
  readonly subscribers: Set<Subscriber>
}

export function createAnimationFrameSource(renderer: Partial<FrameRenderer>): AnimationFrameSource {
  const { setAnimationFrameCallback, setAnimationFrameActive } = renderer
  if (!setAnimationFrameCallback || !setAnimationFrameActive) {
    throw new Error("Renderer does not support animation frame callbacks")
  }
  const setCallback = setAnimationFrameCallback.bind(renderer)
  const setActive = setAnimationFrameActive.bind(renderer)
  let session: FrameSession | null = null

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
  }
}
