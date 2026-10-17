import type { ReactNode } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { TruncatedText } from "@/ui/controls"

export interface PanelHeaderProps {
  readonly title: string
  readonly actions?: ReactNode
  readonly testId?: string
}

export function PanelHeader({ title, actions, testId }: PanelHeaderProps) {
  const theme = useTheme()
  return (
    <div
      testId={testId}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        flexShrink: 0,
        height: theme.design.dock.stripHeight,
        minWidth: 0,
        paddingLeft: theme.control["--spacing-control-track-gap"],
        paddingRight: theme.control["--spacing-control-track-gap"],
        gap: theme.control["--spacing-control-gap"],
        backgroundColor: theme.colors.card,
      }}
    >
      <TruncatedText
        style={{
          color: theme.colors.foreground,
          flexGrow: 1,
          fontSize: theme.control["--text-control-track"],
        }}
      >
        {title}
      </TruncatedText>
      {actions}
    </div>
  )
}
