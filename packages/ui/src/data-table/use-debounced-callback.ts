import * as React from "react"

import { useCallbackRef as useCallbackReference } from "./use-callback-ref"

export function useDebouncedCallback<T extends (...arguments_: never[]) => unknown>(
  callback: T,
  delay: number
) {
  const handleCallback = useCallbackReference(callback)
  const debounceTimerReference = React.useRef(0)
  React.useEffect(() => () => window.clearTimeout(debounceTimerReference.current), [])

  return React.useCallback(
    (...arguments_: Parameters<T>) => {
      window.clearTimeout(debounceTimerReference.current)
      debounceTimerReference.current = window.setTimeout(() => handleCallback(...arguments_), delay)
    },
    [handleCallback, delay]
  )
}
