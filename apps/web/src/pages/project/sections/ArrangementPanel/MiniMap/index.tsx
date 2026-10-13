import { useRef, useState } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { useProjectState } from "@/pages/project/adapters"
import { positionToBar } from "@/pages/project/model/types"
import { useMinimapGesture, type MinimapGeometry } from "./useMinimapGesture"
import { OverviewCanvas } from "./OverviewCanvas"

export function MiniMap(props: MinimapGeometry) {
  const { t } = useTranslation()
  const tracks = useProjectState(s => s.document.tracks)
  const markers = useProjectState(s => s.document.markers)
  const positionBar = useProjectState(s =>
    positionToBar(s.session.position, s.document.transport.numerator)
  )
  const element = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState<"grab" | "ew-resize">("grab")
  const gesture = useMinimapGesture(element, props)
  const viewportBars = Math.min(props.bars, props.viewportWidth / props.pxPerBar)
  const start = Math.max(0, Math.min(props.bars - viewportBars, props.scrollX / props.pxPerBar))
  return (
    <div
      ref={element}
      data-minimap
      aria-label={t("arrangement.minimap")}
      className="relative h-full min-h-0 select-none overflow-hidden bg-[var(--arrangement-ruler)] touch-none"
      style={{ cursor }}
      title={t("arrangement.minimapHelp")}
      onPointerDown={gesture.pointerDown}
      onPointerMove={event => {
        const next = gesture.pointerMove(event)
        if (next) setCursor(next)
      }}
      onDoubleClick={gesture.fit}
    >
      <OverviewCanvas tracks={tracks} markers={markers} bars={props.bars} />
      <div
        data-minimap-playhead
        className="pointer-events-none absolute inset-y-0 w-px bg-foreground"
        style={{ left: `${((positionBar - 1) / props.bars) * 100}%` }}
      />
      <div
        data-minimap-viewport
        className="pointer-events-none absolute inset-y-0 rounded-[2px] border border-muted-foreground bg-overlay"
        style={{
          left: `${(start / props.bars) * 100}%`,
          width: `${(viewportBars / props.bars) * 100}%`,
        }}
      />
    </div>
  )
}
