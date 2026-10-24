export function MetronomeIcon({
  playing,
  active,
  beat,
}: {
  readonly playing: boolean
  readonly active: boolean
  readonly beat: number
}) {
  const leftFilled = !playing ? true : beat % 2 === 1
  const rightFilled = !playing ? true : beat % 2 === 0
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0"
      aria-hidden="true"
    >
      <circle
        cx="5"
        cy="8"
        r="3"
        stroke="currentColor"
        strokeWidth="1.5"
        fill={active && leftFilled ? "currentColor" : "none"}
      />
      <circle
        cx="11"
        cy="8"
        r="3"
        stroke="currentColor"
        strokeWidth="1.5"
        fill={active && rightFilled ? "currentColor" : "none"}
      />
    </svg>
  )
}
