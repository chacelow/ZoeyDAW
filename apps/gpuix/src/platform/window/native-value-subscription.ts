/** Renderer registration shape shared by `onWindowActiveChange` and `onWindowAppearanceChange`. */
export type NativeObserverRegistration<T> = (callback: ((value: T) => void) | null) => void

interface Lease<T> {
  readonly listener: (value: T) => void
}

interface Session<T> {
  value: T | undefined
  readonly leases: Set<Lease<T>>
}

/**
 * One lazy native observer per renderer. The first native value only establishes the
 * baseline; listeners hear later changes, delivered in a microtask so they never run
 * inside the native callback. The last unsubscribe releases the observer.
 */
export function createNativeValueSubscription<T>(
  register: NativeObserverRegistration<T> | undefined,
  capability: string
) {
  let session: Session<T> | null = null

  return (listener: (value: T) => void): (() => void) => {
    if (!register) throw new Error(`Renderer does not support ${capability}`)
    const lease = { listener }
    const current = session ?? { value: undefined, leases: new Set<Lease<T>>() }
    current.leases.add(lease)

    if (session === null) {
      session = current
      register(value => {
        if (session !== current) return
        const previous = current.value
        current.value = value
        if (previous === undefined || previous === value) return
        const pending = [...current.leases]
        queueMicrotask(() => {
          for (const pendingLease of pending) {
            if (session !== current) return
            if (current.leases.has(pendingLease)) pendingLease.listener(value)
          }
        })
      })
    }

    return () => {
      if (!current.leases.delete(lease) || current.leases.size !== 0) return
      session = null
      register(null)
    }
  }
}
