import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useMotionValue, useReducedMotion } from "motion/react"
import { Ban } from "lucide-react"
import { cn } from "#lib/utils"
import type { HTMLMotionProps } from "motion/react"
import type { ReactNode, Ref } from "react"

export interface DragPreviewAreaProps extends Omit<
  HTMLMotionProps<"div">,
  "ref" | "drag" | "onPan" | "onPanStart" | "onPanEnd" | "onPointerDownCapture" | "onClickCapture"
> {
  readonly ref?: Ref<HTMLDivElement>
  readonly sourceSelector?: string
  readonly renderPreview: (source: HTMLElement) => ReactNode
  readonly disabledDropLabel: string
}

interface DragPreview {
  source: HTMLElement
  content: ReactNode
  origin: { x: number; y: number }
}

export function DragPreviewArea({
  ref,
  sourceSelector = "[data-drag-source]",
  renderPreview,
  disabledDropLabel,
  className,
  children,
  ...properties
}: DragPreviewAreaProps) {
  const [preview, setPreview] = useState<DragPreview | null>(null)
  const pressedSource = useRef<HTMLElement | null>(null)
  const dragging = useRef(false)
  const suppressClick = useRef(false)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const reducedMotion = useReducedMotion()

  const cancel = useCallback(() => {
    dragging.current = false
    setPreview(null)
  }, [])

  useEffect(() => {
    if (!preview) {
      return
    }
    const { source } = preview
    source.setAttribute("data-drag-preview-source-active", "")
    document.body.classList.add("drag-preview-active")
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      cancel()
    }
    window.addEventListener("keydown", handleKeyDown, { capture: true })
    window.addEventListener("blur", cancel)
    window.addEventListener("pointercancel", cancel)
    return () => {
      source.removeAttribute("data-drag-preview-source-active")
      document.body.classList.remove("drag-preview-active")
      window.removeEventListener("keydown", handleKeyDown, true)
      window.removeEventListener("blur", cancel)
      window.removeEventListener("pointercancel", cancel)
    }
  }, [preview, cancel])

  return (
    <>
      <motion.div
        {...properties}
        ref={ref}
        className={cn("touch-none [&_[data-drag-preview-source-active]]:opacity-40", className)}
        onPointerDownCapture={event => {
          suppressClick.current = false
          pressedSource.current = null
          if (event.button !== 0 || !(event.target instanceof Element)) {
            return
          }
          const source = event.target.closest(sourceSelector)
          if (!(source instanceof HTMLElement) || !event.currentTarget.contains(source)) {
            return
          }
          const control = event.target.closest("button, a, input, textarea, select, [data-no-drag]")
          if (control && control !== source && source.contains(control)) {
            return
          }
          pressedSource.current = source
        }}
        onPanStart={event => {
          const source = pressedSource.current
          if (!source) {
            return
          }
          const content = renderPreview(source)
          if (content === null || content === undefined) {
            return
          }
          const rect = source.getBoundingClientRect()
          dragging.current = true
          suppressClick.current = true
          x.stop()
          y.stop()
          x.set(event.clientX + 12)
          y.set(event.clientY + 12)
          setPreview({
            source,
            content,
            origin: { x: rect.left, y: rect.top },
          })
        }}
        onPan={event => {
          if (!dragging.current) {
            return
          }
          x.set(event.clientX + 12)
          y.set(event.clientY + 12)
        }}
        onPanEnd={cancel}
        onClickCapture={event => {
          if (!suppressClick.current) {
            return
          }
          event.preventDefault()
          event.stopPropagation()
          suppressClick.current = false
        }}
      >
        {children}
      </motion.div>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence initial={false}>
            {preview ? (
              <motion.div
                key="drag-preview"
                data-slot="drag-preview"
                aria-hidden
                className="border-border bg-popover text-popover-foreground pointer-events-none fixed top-0 left-0 z-[1000] flex max-w-xs min-w-32 items-center gap-2 rounded-md border px-3 py-2 text-xs shadow-lg"
                style={{ x, y }}
                initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.96 }}
                animate={{ opacity: 0.85, scale: 1 }}
                exit={{
                  x: reducedMotion ? x.get() : preview.origin.x,
                  y: reducedMotion ? y.get() : preview.origin.y,
                  opacity: 0,
                  scale: reducedMotion ? 1 : 0.96,
                  transition: {
                    duration: reducedMotion ? 0 : 0.25,
                    ease: [0.22, 1, 0.36, 1],
                  },
                }}
                transition={{
                  duration: reducedMotion ? 0 : 0.15,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {preview.content}
                <span
                  role="status"
                  aria-label={disabledDropLabel}
                  className="bg-popover text-destructive ml-2 flex size-6 shrink-0 items-center justify-center rounded-full"
                >
                  <Ban className="size-5" aria-hidden="true" />
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body
        )}
    </>
  )
}
