import { useCallback, useEffect, useId, useRef, useState } from "react"
import { motion } from "motion/react"

import { cn } from "./cn"
import type { ComponentPropsWithoutRef } from "react"

export interface AnimatedGridPatternProps extends ComponentPropsWithoutRef<"svg"> {
  readonly width?: number
  readonly height?: number
  readonly x?: number
  readonly y?: number
  readonly strokeDasharray?: number
  readonly numSquares?: number
  readonly maxOpacity?: number
  readonly duration?: number
  readonly repeatDelay?: number
}

export function AnimatedGridPattern({
  width = 40,
  height = 40,
  x = -1,
  y = -1,
  strokeDasharray = 0,
  numSquares: numberSquares = 50,
  className,
  maxOpacity = 0.5,
  duration = 4,
  ...properties
}: AnimatedGridPatternProps) {
  const id = useId()
  const containerReference = useRef<SVGSVGElement>(null)
  const [squares, setSquares] = useState<Array<{ id: number; pos: [number, number] }>>([])

  const randomPosition = useCallback(
    (rect: DOMRectReadOnly): [number, number] => {
      const values = crypto.getRandomValues(new Uint32Array(2))
      return [
        Math.floor(((values[0] ?? 0) / 0x1_0000_0000) * (rect.width / width)),
        Math.floor(((values[1] ?? 0) / 0x1_0000_0000) * (rect.height / height)),
      ]
    },
    [width, height]
  )

  const updateSquarePosition = (id: number) => {
    const rect = containerReference.current?.getBoundingClientRect()
    if (!rect) return
    setSquares(currentSquares =>
      currentSquares.map(square =>
        square.id === id ? { ...square, pos: randomPosition(rect) } : square
      )
    )
  }

  // Resize observer to update container dimensions
  useEffect(() => {
    const element = containerReference.current
    if (!element) return
    const update = (rect: DOMRectReadOnly) => {
      setSquares(
        Array.from({ length: numberSquares }, (_, id) => ({
          id,
          pos: randomPosition(rect),
        }))
      )
    }
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) update(entry.contentRect)
    })
    resizeObserver.observe(element)
    return () => resizeObserver.disconnect()
  }, [randomPosition, numberSquares])

  return (
    <svg
      ref={containerReference}
      aria-hidden="true"
      className={cn(
        "fill-muted-foreground/30 stroke-muted-foreground/30 pointer-events-none absolute inset-0 h-full w-full",
        className
      )}
      {...properties}
    >
      <defs>
        <pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse" x={x} y={y}>
          <path d={`M.5 ${height}V.5H${width}`} fill="none" strokeDasharray={strokeDasharray} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
      <svg x={x} y={y} className="overflow-visible" aria-hidden="true">
        {squares.map(({ pos: [x, y], id }, index) => (
          <motion.rect
            initial={{ opacity: 0 }}
            animate={{ opacity: maxOpacity }}
            transition={{
              duration,
              repeat: 1,
              delay: index * 0.1,
              repeatType: "reverse",
            }}
            onAnimationComplete={() => updateSquarePosition(id)}
            key={`${x}-${y}-${index}`}
            width={width - 1}
            height={height - 1}
            x={x * width + 1}
            y={y * height + 1}
            fill="currentColor"
            strokeWidth="0"
          />
        ))}
      </svg>
    </svg>
  )
}
