import { useTheme } from "@/shared/theme/ThemeProvider"
import { Button } from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"

export interface TitleBarProps {
  /** Project name on the project route; absent elsewhere. */
  readonly title?: string
  readonly settingsLabel: string
  readonly onOpenSettings: () => void
  /** Omitted for Windows system caption gestures and views without a native window. */
  readonly onTitlebarDoubleClick?: () => void
  /** Surface of the page directly below, so titlebar and Header read as one strip. */
  readonly surface: string
}

/**
 * Transparent native titlebar. GPUI owns the drag region; interactive descendants
 * occlude it. Windows handles caption double-clicks, while the composition root
 * supplies the system-preference action on macOS.
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
      onMouseDown={
        onTitlebarDoubleClick
          ? event => {
              if (event.button === 0 && event.clickCount === 2) onTitlebarDoubleClick()
            }
          : undefined
      }
      style={{
        windowControlArea: "drag",
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
