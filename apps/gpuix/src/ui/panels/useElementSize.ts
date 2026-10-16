import type { Props } from "@gpuix/react"
import { useCallback, useState } from "react"

export function useElementSize() {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const onLayout = useCallback<NonNullable<Props["onLayout"]>>(event => {
    if (event.width === undefined || event.height === undefined) return
    const { width, height } = event
    setSize(previous =>
      previous.width === width && previous.height === height ? previous : { width, height }
    )
  }, [])
  return { onLayout, ...size }
}
