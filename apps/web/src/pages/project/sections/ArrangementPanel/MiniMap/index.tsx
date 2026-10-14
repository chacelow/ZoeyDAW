import { useId, useRef, useState } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { useProjectState } from "@/pages/project/adapters"
import { positionToBar } from "@/pages/project/model/types"
import { useMinimapGesture } from "./useMinimapGesture"
import { OverviewCanvas } from "./OverviewCanvas"
import type { MinimapGeometry } from "./useMinimapGesture"

export function MiniMap(properties: MinimapGeometry) {
  const { t } = useTranslation()
  const helpId = useId()
  const tracks = useProjectState(s => s.document.tracks)
  const markers = useProjectState(s => s.document.markers)
  const positionBar = useProjectState(s =>
    positionToBar(s.session.position, s.document.transport.numerator)
  )
  const element = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState<"grab" | "ew-resize">("grab")
  const gesture = useMinimapGesture(element, properties)
  const viewportBars = Math.min(properties.bars, properties.viewportWidth / properties.pxPerBar)
  const start = Math.max(
    0,
    Math.min(properties.bars - viewportBars, properties.scrollX / properties.pxPerBar)
  )
  return (
    <div
      ref={element}
      data-minimap
      role="group"
      aria-label={t("arrangement.minimap")}
      className="relative h-full min-h-0 touch-none overflow-hidden bg-[var(--arrangement-ruler)] select-none"
      style={{ cursor }}
      aria-describedby={helpId}
      onPointerDown={gesture.pointerDown}
      onPointerMove={event => {
        const next = gesture.pointerMove(event)
        if (next) {
          setCursor(next)
        }
      }}
      onDoubleClick={gesture.fit}
    >
      <span id={helpId} className="sr-only">
        {t("arrangement.minimapHelp")}
      </span>
      <OverviewCanvas tracks={tracks} markers={markers} bars={properties.bars} />
      <div
        data-minimap-playhead
        className="bg-foreground pointer-events-none absolute inset-y-0 w-px"
        style={{ left: `${((positionBar - 1) / properties.bars) * 100}%` }}
      />
      <div
        data-minimap-viewport
        className="border-muted-foreground bg-overlay pointer-events-none absolute inset-y-0 rounded-[2px] border"
        style={{
          left: `${(start / properties.bars) * 100}%`,
          width: `${(viewportBars / properties.bars) * 100}%`,
        }}
      />
    </div>
  )
}
