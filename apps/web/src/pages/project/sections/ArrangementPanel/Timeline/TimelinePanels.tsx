import { useState, type ReactNode } from "react"
import { Group, Panel } from "react-resizable-panels"
import { useTranslation } from "@zoeymind/i18n"
import { PanelDivider } from "@/components/panels"
import { useProjectState } from "@/pages/project/adapters"
import { MiniMap } from "../MiniMap"
import type { useTimelineViewport } from "./Viewport/useTimelineViewport"
import {
  OVERVIEW_DEFAULT_HEIGHT,
  OVERVIEW_MAX_HEIGHT,
  OVERVIEW_MIN_HEIGHT,
} from "../overview-metrics"

type OverviewViewport = Pick<
  ReturnType<typeof useTimelineViewport>,
  | "timeViewportWidth"
  | "bars"
  | "pxPerBar"
  | "scrollX"
  | "minPxPerBar"
  | "maxPxPerBar"
  | "suspendFollow"
>

export function TimelinePanels({
  viewport,
  children,
}: {
  readonly viewport: OverviewViewport
  readonly children: ReactNode
}) {
  const { t } = useTranslation()
  const overview = useProjectState(state => state.workspace.arrangementView.overview)
  const [overviewCollapsed, setOverviewCollapsed] = useState(false)
  return (
    <Group orientation="vertical" className="min-h-0 flex-1">
      {overview && (
        <>
          <Panel
            defaultSize={OVERVIEW_DEFAULT_HEIGHT}
            minSize={OVERVIEW_MIN_HEIGHT}
            maxSize={OVERVIEW_MAX_HEIGHT}
            onResize={size => {
              // The panel clamps at its minimum, so treat that floor as the
              // collapsed strip and drop the divider there. Do not feed the
              // measured size back as `defaultSize`: re-registering the panel
              // mid-drag resets the size and the divider appears to stick.
              setOverviewCollapsed(size.inPixels <= OVERVIEW_MIN_HEIGHT + 0.5)
            }}
          >
            <div className="size-full">
              <MiniMap
                collapsed={overviewCollapsed}
                viewportWidth={viewport.timeViewportWidth}
                bars={viewport.bars}
                pxPerBar={viewport.pxPerBar}
                scrollX={viewport.scrollX}
                minPxPerBar={viewport.minPxPerBar}
                maxPxPerBar={viewport.maxPxPerBar}
                onNavigate={viewport.suspendFollow}
              />
            </div>
          </Panel>
          <PanelDivider
            orientation="horizontal"
            aria-label={t("arrangement.resizeMinimap")}
            className="hover:before:bg-ring focus-visible:before:bg-ring bg-[var(--arrangement-ruler)] before:pointer-events-none before:absolute before:inset-x-0 before:top-1/2 before:h-[2px] before:-translate-y-1/2 before:bg-[var(--arrangement-line)]"
          />
        </>
      )}
      <Panel minSize={160}>{children}</Panel>
    </Group>
  )
}
