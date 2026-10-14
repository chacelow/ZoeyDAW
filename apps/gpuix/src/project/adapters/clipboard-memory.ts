let value = ""
const listeners = new Set<() => void>()

export const clipboardMemory = {
  read: () => value,
  write(text: string) {
    if (text === value) {
      return
    }
    value = text
    for (const listener of listeners) {
      listener()
    }
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}
