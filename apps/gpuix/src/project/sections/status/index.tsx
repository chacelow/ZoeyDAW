import { Button } from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import { useTheme } from "@/shared/theme/ThemeProvider"
import type { ControlInfo } from "@/ui/controls"
import type { FooterView } from "../footer"

export interface StatusWarning {
  readonly message: string
  readonly severity?: "info" | "warning" | "error"
}
export interface StatusStripLabels {
  readonly toggleFooter: string
  readonly views: string
  readonly clip: string
  readonly devices: string
  readonly info: Readonly<
    Record<ControlInfo, { readonly title: string; readonly description: string }>
  >
}
export interface StatusStripProps {
  readonly labels: StatusStripLabels
  readonly footerCollapsed: boolean
  readonly view: FooterView
  readonly onToggleFooter: () => void
  readonly onViewChange: (view: FooterView) => void
  readonly info: ControlInfo | null
  readonly warnings: readonly StatusWarning[]
}

export function StatusStrip({
  labels,
  footerCollapsed,
  view,
  onToggleFooter,
  onViewChange,
  info,
  warnings,
}: StatusStripProps) {
  const theme = useTheme()
  const help = info ? labels.info[info] : null
  const warning = warnings.at(-1)
  const severity = warning?.severity ?? "info"
  const color =
    severity === "error"
      ? theme.colors.destructive
      : severity === "warning"
        ? theme.colors.chart4
        : theme.colors.mutedForeground
  return (
    <div
      role="region"
      aria-label={labels.views}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        flexShrink: 0,
        height: theme.project.statusHeight,
        gap: theme.control["--spacing-control-track-gap"],
        paddingLeft: theme.control["--spacing-control-track-pad"],
        paddingRight: theme.control["--spacing-control-track-pad"],
        backgroundColor: theme.colors.muted,
        color: theme.colors.mutedForeground,
        fontSize: theme.control["--text-control-track"],
      }}
    >
      <Button
        iconOnly
        label={labels.toggleFooter}
        aria-expanded={!footerCollapsed}
        testId="status-toggle-footer"
        onClick={onToggleFooter}
      >
        <Icon
          name={footerCollapsed ? "ChevronUp" : "ChevronDown"}
          color={theme.colors.foreground}
        />
      </Button>
      <div
        role="status"
        aria-label={help ? `${help.title}: ${help.description}` : (warning?.message ?? "")}
        testId="status-info"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          flexGrow: 1,
          minWidth: 0,
          overflow: "hidden",
          gap: theme.control["--spacing-control-track-gap"],
        }}
      >
        {help ? (
          <>
            <text style={{ color: theme.colors.foreground, whiteSpace: "nowrap", flexShrink: 0 }}>
              {help.title}
            </text>
            <text
              style={{
                color: theme.colors.mutedForeground,
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                minWidth: 0,
                flexGrow: 1,
              }}
            >
              {help.description}
            </text>
          </>
        ) : warning ? (
          <>
            <Icon
              name={
                severity === "error"
                  ? "CircleAlert"
                  : severity === "warning"
                    ? "TriangleAlert"
                    : "Info"
              }
              color={color}
            />
            <text
              style={{
                color,
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                minWidth: 0,
                flexGrow: 1,
              }}
            >
              {warning.message}
            </text>
          </>
        ) : null}
      </div>
      <div
        role="group"
        aria-label={labels.views}
        style={{
          display: "flex",
          gap: theme.control["--spacing-control-track-gap"],
          flexShrink: 0,
        }}
      >
        <Button
          label={labels.clip}
          active={!footerCollapsed && view === "clip"}
          testId="status-clip"
          onActiveChange={active => {
            if (active) onViewChange("clip")
            else onToggleFooter()
          }}
        >
          {labels.clip}
        </Button>
        <Button
          label={labels.devices}
          active={!footerCollapsed && view === "devices"}
          testId="status-devices"
          onActiveChange={active => {
            if (active) onViewChange("devices")
            else onToggleFooter()
          }}
        >
          {labels.devices}
        </Button>
      </div>
    </div>
  )
}
