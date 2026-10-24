import { useId, useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { useProjectState } from "@/pages/project/adapters"
import { positionToBar } from "@zoeydaw/project-core/types"
import { minimapFrame, useMinimapGesture } from "./useMinimapGesture"
import { OverviewCanvas } from "./OverviewCanvas"
import type { MinimapGeometry } from "./useMinimapGesture"

const overviewCursor = `url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><path d='M9.6 9.6L14 14' fill='none' stroke='white' stroke-width='4' stroke-linecap='round'/><circle cx='6' cy='6' r='4.4' fill='none' stroke='white' stroke-width='3.5'/><path d='M9.6 9.6L14 14' fill='none' stroke='black' stroke-width='2.1' stroke-linecap='round'/><circle cx='6' cy='6' r='4.4' fill='none' stroke='black' stroke-width='1.8'/></svg>")}") 5 5, zoom-in`

export function MiniMap({
  collapsed = false,
  ...properties
}: MinimapGeometry & { readonly collapsed?: boolean }) {
  const { t } = useTranslation()
  const helpId = useId()
  const tracks = useProjectState(s => s.document.tracks)
  const markers = useProjectState(s => s.document.markers)
  const patterns = useProjectState(s => s.document.patterns)
  const numerator = useProjectState(s => s.document.transport.numerator)
  const positionBar = useProjectState(s =>
    positionToBar(s.session.position, s.document.transport.numerator)
  )
  const element = useRef<HTMLDivElement>(null)
  const [boxWidth, setBoxWidth] = useState(0)
  useLayoutEffect(() => {
    const node = element.current
    if (!node || typeof ResizeObserver === "undefined") return
    const measure = () => {
      const next = node.getBoundingClientRect().width
      setBoxWidth(previous => (previous === next ? previous : next))
    }
    measure()
    const observer = new ResizeObserver(() => requestAnimationFrame(measure))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const gesture = useMinimapGesture(element, properties)
  const frame = minimapFrame(boxWidth, properties)
  return (
    <div
      ref={element}
      data-minimap
      role="group"
      aria-label={t("arrangement.minimap")}
      className="relative h-full min-h-0 cursor-zoom-in touch-none overflow-hidden bg-[var(--arrangement-ruler)] select-none"
      aria-describedby={helpId}
      style={{ cursor: overviewCursor }}
      onPointerDown={gesture.pointerDown}
      onPointerMove={event => {
        const next = gesture.pointerMove(event)
        const style =
          next === "brace-left"
            ? "var(--arrangement-brace-left-cursor, w-resize), w-resize"
            : next === "brace-right"
              ? "var(--arrangement-brace-right-cursor, e-resize), e-resize"
              : next === "zoom-in"
                ? overviewCursor
                : next
        if (style && event.currentTarget.style.cursor !== style) {
          event.currentTarget.style.cursor = style
        }
      }}
      onDoubleClick={gesture.fit}
      onPointerLeave={event => {
        event.currentTarget.style.cursor = overviewCursor
      }}
    >
      <span id={helpId} className="sr-only">
        {t("arrangement.minimapHelp")}
      </span>
      <OverviewCanvas
        tracks={tracks}
        markers={markers}
        patterns={patterns}
        numerator={numerator}
        bars={properties.bars}
        dividers={!collapsed}
      />
      <div
        data-minimap-playhead
        className="bg-foreground pointer-events-none absolute inset-y-0 w-px"
        style={{ left: `${((positionBar - 1) / properties.bars) * 100}%` }}
      />
      <div
        data-minimap-viewport
        className="border-muted-foreground bg-overlay pointer-events-none absolute inset-y-0 rounded-[2px] border"
        style={{
          left: frame.left,
          width: frame.right - frame.left,
        }}
      />
    </div>
  )
}
