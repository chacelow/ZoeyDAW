import { useRef, useState } from "react"
import { DragPadNumber } from "@zoeymind/ui"
import { formatAudioMusicalValue, parseAudioMusicalValue } from "@/pages/project/model/audio-editor"
import type { AudioMusicalValueKind } from "@/pages/project/model/audio-editor"

interface MusicalNumberGesture {
  onChange: (value: number) => void
  onGestureStart: () => void
  onGestureEnd: () => void
  onGestureCancel: () => void
}

type MusicalNumberProps = {
  readonly value: number
  readonly min: number
  readonly max: number
  readonly defaultValue: number
  readonly label: string
  readonly numerator: number
  readonly denominator: number
  readonly isValid?: (value: number) => boolean
  readonly kind: AudioMusicalValueKind
  readonly gesture: MusicalNumberGesture
}

export function MusicalNumber({
  value,
  min,
  max,
  defaultValue,
  label,
  numerator,
  denominator,
  isValid,
  kind,
  gesture,
}: MusicalNumberProps) {
  const [editing, setEditing] = useState(false)
  const validDraft = useRef(true)
  // Keep the starting bounds and interval constraint through live metadata previews.
  const bounds = useRef({ min, max })
  const validation = useRef(isValid)
  return (
    <label
      className="audio-detail-field"
      onFocusCapture={event => {
        if (event.target instanceof HTMLInputElement) setEditing(true)
      }}
    >
      <span>{label}</span>
      <DragPadNumber
        size="compact"
        label={label}
        value={value}
        min={min}
        max={max}
        defaultValue={defaultValue}
        step={editing ? 0 : denominator / (numerator * 16)}
        sensitivity={0}
        format={number => formatAudioMusicalValue(number, numerator, denominator, kind)}
        parse={raw => {
          let parsed = parseAudioMusicalValue(
            raw,
            numerator,
            denominator,
            kind,
            bounds.current.min,
            bounds.current.max
          )
          if (Number.isFinite(parsed) && validation.current && !validation.current(parsed))
            parsed = Number.NaN
          validDraft.current = Number.isFinite(parsed)
          return parsed
        }}
        onGestureStart={() => {
          validDraft.current = true
          bounds.current = { min, max }
          validation.current = isValid
          gesture.onGestureStart()
        }}
        onChange={gesture.onChange}
        onGestureEnd={() => {
          if (validDraft.current) gesture.onGestureEnd()
          else gesture.onGestureCancel()
          setEditing(false)
        }}
        onGestureCancel={() => {
          gesture.onGestureCancel()
          setEditing(false)
        }}
      />
    </label>
  )
}
