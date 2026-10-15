import type { ReactNode } from "react"
import type { StyleDesc } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"

export interface PanelShellProps<Id extends string> {
  id: Id
  active: Id
  onActivate: (id: Id) => void
  children: ReactNode
  style?: StyleDesc
  testId?: string
}

export function PanelShell<Id extends string>({
  id,
  active,
  onActivate,
  children,
  style,
  testId,
}: PanelShellProps<Id>) {
  const theme = useTheme()
  return (
    <div
      role="group"
      aria-label={id}
      aria-description={id === active ? "Active panel" : undefined}
      testId={testId ?? id}
      onMouseDown={() => onActivate(id)}
      style={sx(style, {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        backgroundColor: theme.colors.muted,
        borderWidth: theme.design.shape.panelBorderWidth,
        borderRadius: theme.design.shape.panelRadius,
        borderColor: id === active ? theme.colors.ring : theme.colors.border,
      })}
    >
      {children}
    </div>
  )
}
