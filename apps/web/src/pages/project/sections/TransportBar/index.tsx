import { useEffect, useRef } from "react"
import { ChevronLeft, LayoutGrid } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { Button, useInfoBinding } from "@zoeymind/ui"
import { PerformanceStatus } from "./PerformanceStatus"
import { TempoControls } from "./TempoControls"
import { MusicalControls } from "./MusicalControls"
import { PlaybackControls } from "./PlaybackControls"
import { ModeControls } from "./ModeControls"

export interface TransportBarProps {
  readonly onBack: () => void
  readonly onToggleBrowser: () => void
}

export function TransportBar({ onBack, onToggleBrowser }: TransportBarProps) {
  const { t } = useTranslation()
  const buttonInfo = useInfoBinding({ type: "button" })
  const headerReference = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const header = headerReference.current
    if (!header) {
      return
    }
    const scrollHeader = (event: WheelEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.deltaX ||
        header.scrollWidth <= header.clientWidth
      ) {
        return
      }
      event.preventDefault()
      header.scrollLeft += event.deltaY
    }
    header.addEventListener("wheel", scrollHeader, { passive: false })
    return () => header.removeEventListener("wheel", scrollHeader)
  }, [])

  return (
    <div
      ref={headerReference}
      data-transport-header
      className="project-transport"
      role="region"
      aria-label={t("project.transport.controls")}
    >
      <div className="project-transport-content">
        <div
          data-transport-group="left"
          className="project-transport-group flex items-center gap-[var(--spacing-control-track-gap)]"
        >
          <Button
            variant="ghost"
            size="control-icon"
            onClick={onToggleBrowser}
            {...buttonInfo}
            aria-label={t("project.toggleBrowser")}
          >
            <LayoutGrid />
          </Button>

          <TempoControls />
          <MusicalControls />
        </div>

        <div
          data-transport-group="center"
          className="project-transport-group flex items-center gap-[var(--spacing-control-track-gap)]"
        >
          <PlaybackControls />
        </div>

        <div
          data-transport-group="right"
          className="project-transport-group flex items-center gap-[var(--spacing-control-track-gap)]"
        >
          <ModeControls />
          <PerformanceStatus />
          <Button
            variant="ghost"
            size="control-icon"
            onClick={onBack}
            {...buttonInfo}
            aria-label={t("common.back")}
          >
            <ChevronLeft />
          </Button>
        </div>
      </div>
    </div>
  )
}
