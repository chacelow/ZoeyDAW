type ActivityListener = (active: boolean) => void

interface ApplicationActivityDependencies {
  readActive(): boolean | null
  startSampling(sample: () => void, intervalMs: number): () => void
}

/** Lifecycle owner for the gpuix 0.10.0 missing window activation signal. */
export function createApplicationActiveSubscription({
  readActive,
  startSampling,
}: ApplicationActivityDependencies) {
  const subscriptions = new Set<{ listener: ActivityListener }>()
  let stopSampling: (() => void) | undefined
  let active = true

  const sample = () => {
    const nextActive = readActive() ?? true
    if (nextActive === active) {
      return
    }
    active = nextActive
    for (const subscription of subscriptions) {
      subscription.listener(active)
    }
  }

  // Capture a baseline, not an initial notification. Only transitions notify.
  return (listener: ActivityListener): (() => void) => {
    const subscription = { listener }
    subscriptions.add(subscription)
    if (subscriptions.size === 1) {
      active = readActive() ?? true
      stopSampling = startSampling(sample, 50)
    }
    return () => {
      if (!subscriptions.delete(subscription) || subscriptions.size !== 0) {
        return
      }
      stopSampling?.()
      stopSampling = undefined
    }
  }
}
