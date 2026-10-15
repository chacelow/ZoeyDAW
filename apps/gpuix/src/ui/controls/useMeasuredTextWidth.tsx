import { useRef, useState } from "react"
import type { StyleDesc } from "@gpuix/react"

const widths = new Map<string, number>()

function estimateTextWidth(samples: readonly string[], fontSize: number) {
  let widest = 0
  for (const sample of samples) {
    let characters = 0
    for (const _character of sample) characters += 1
    widest = Math.max(widest, characters)
  }
  return Math.ceil(widest * fontSize * 0.62)
}

export function useMeasuredTextWidth(
  samples: readonly string[],
  textStyle: Pick<StyleDesc, "fontSize" | "fontFamily" | "fontWeight" | "lineHeight">
) {
  const key = JSON.stringify([textStyle, samples])
  const pending = useRef<{
    key: string
    values: Array<number | undefined>
    remaining: number
  } | null>(null)
  const [result, setResult] = useState<{ key: string; width: number } | null>(null)
  const cached = widths.get(key)
  const width =
    cached ??
    (result?.key === key ? result.width : estimateTextWidth(samples, textStyle.fontSize ?? 12))
  const measured = samples.length === 0 || cached !== undefined || result?.key === key
  const sampleNodes = measured ? null : (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        opacity: 0,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "start",
        userSelect: "none",
      }}
    >
      {samples.map((sample, index) => (
        <text
          key={`${key}:${index}`}
          onLayout={event => {
            if (widths.has(key)) return
            const sampleWidth = event.width
            if (sampleWidth === undefined || event.height === undefined || event.height <= 0) return
            let batch = pending.current
            if (!batch || batch.key !== key) {
              batch = { key, values: new Array(samples.length), remaining: samples.length }
              pending.current = batch
            }
            if (batch.values[index] === undefined) batch.remaining -= 1
            batch.values[index] = sampleWidth
            if (batch.remaining !== 0) return
            const next = Math.ceil(
              batch.values.reduce<number>((largest, value) => Math.max(largest, value ?? 0), 0)
            )
            widths.set(key, next)
            setResult({ key, width: next })
          }}
          style={{ ...textStyle, whiteSpace: "nowrap", flexShrink: 0 }}
        >
          {sample}
        </text>
      ))}
    </div>
  )
  return { width, measured, sampleNodes }
}
