export type ActivityListener = (active: boolean) => void

export interface WindowActivityRenderer {
  onWindowActiveChange?(callback: ActivityListener | null): void
}

interface ActivitySubscription {
  readonly listener: ActivityListener
}

interface ActivitySession {
  active: boolean | undefined
  readonly subscriptions: Set<ActivitySubscription>
}

/** One native observer per window; the first native value establishes the baseline. */
export function createApplicationActiveSubscription(renderer: WindowActivityRenderer) {
  const setCallback = renderer.onWindowActiveChange?.bind(renderer)
  let session: ActivitySession | null = null

  return (listener: ActivityListener): (() => void) => {
    if (!setCallback) throw new Error("Renderer does not support window activation events")
    const subscription = { listener }
    const current = session ?? { active: undefined, subscriptions: new Set<ActivitySubscription>() }
    current.subscriptions.add(subscription)

    if (session === null) {
      session = current
      setCallback(active => {
        if (session !== current) return
        const previous = current.active
        current.active = active
        if (previous === undefined || previous === active) return
        const pending = [...current.subscriptions]
        queueMicrotask(() => {
          for (const pendingSubscription of pending) {
            if (session !== current) return
            if (current.subscriptions.has(pendingSubscription)) {
              pendingSubscription.listener(active)
            }
          }
        })
      })
    }

    return () => {
      if (!current.subscriptions.delete(subscription) || current.subscriptions.size !== 0) return
      session = null
      setCallback(null)
    }
  }
}
