import { useTheme } from "@/shared/theme/ThemeProvider"
import { Button } from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"

export interface TitleBarProps {
  /** Project name on the project route; absent elsewhere. */
  readonly title?: string
  readonly settingsLabel: string
  readonly onOpenSettings: () => void
  /** Omitted by offscreen views that do not own a native window. */
  readonly onTitlebarDoubleClick?: () => void
  /** Surface of the page directly below, so titlebar and Header read as one strip. */
  readonly surface: string
}

/**
 * macOS transparent titlebar row. The native traffic lights sit in the left inset (positioned
 * by the window options), the muted title is centered on the window like Live's, and the row shares the Header's
 * surface so the two read as one continuous strip. Dragging stays native: GPUI keeps
 * AppKit's titlebar move region because the app does not claim the drag.
 */
export function TitleBar({
  title,
  settingsLabel,
  onOpenSettings,
  onTitlebarDoubleClick,
  surface,
}: TitleBarProps) {
  const theme = useTheme()
  const inset = theme.project.trafficLightInset
  return (
    <div
      testId="titlebar"
      onMouseDown={event => {
        if (event.button === 0 && event.clickCount === 2) onTitlebarDoubleClick?.()
      }}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        position: "relative",
        flexShrink: 0,
        height: theme.project.titlebarHeight,
        paddingLeft: inset,
        paddingRight: theme.project.trafficLightMargin,
        backgroundColor: surface,
      }}
    >
      <div
        testId="titlebar-title"
        role="heading"
        aria-level={1}
        aria-label={title}
        style={{
          position: "absolute",
          pointerEvents: "none",
          top: 0,
          bottom: 0,
          left: inset,
          right: inset,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: theme.colors.mutedForeground,
          fontSize: theme.transportControl["--text-control-track"],
          fontWeight: theme.design.typography.weights.semibold,
        }}
      >
        {title ?? ""}
      </div>
      <div style={{ flexGrow: 1 }} />
      <Button
        iconOnly
        variant="ghost"
        size="transport"
        testId="titlebar-settings"
        label={settingsLabel}
        onClick={onOpenSettings}
        style={{ pointerEvents: "auto" }}
      >
        <Icon
          name="Settings"
          size={theme.transportControl["--spacing-control-icon"]}
          color={theme.colors.mutedForeground}
        />
      </Button>
    </div>
  )
}
