interface PointerEventPayload {
  readonly eventType: string
  readonly x?: number
  readonly y?: number
}

interface PointerPosition {
  readonly x: number
  readonly y: number
}

export interface WindowPointerObserver {
  readonly subscribePointer: (listener: (position: PointerPosition) => void) => () => void
  readonly rootHandlers: { readonly onEvent: (event: PointerEventPayload) => void }
}

export function createWindowPointerObserver(): WindowPointerObserver {
  const listeners = new Set<(position: PointerPosition) => void>()
  let current: PointerPosition | undefined
  return {
    subscribePointer(listener) {
      listeners.add(listener)
      if (current) listener(current)
      return () => { listeners.delete(listener) }
    },
    rootHandlers: {
      onEvent(event) {
        if (event.x === undefined || event.y === undefined ||
          (event.eventType !== "mouseEnter" && event.eventType !== "mouseLeave" && event.eventType !== "mouseMove")) return
        if (current?.x === event.x && current.y === event.y) return
        current = { x: event.x, y: event.y }
        for (const listener of listeners) listener(current)
      },
    },
  }
}
