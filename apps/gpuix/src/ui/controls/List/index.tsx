import { useTheme } from "@/shared/theme/ThemeProvider"
import type { Props } from "@gpuix/react"

export interface ListProps extends Props {
  readonly role?: "listbox" | "tree"
  readonly "aria-label": string
}

export function List({ role = "listbox", style, ...props }: ListProps) {
  const theme = useTheme()
  return (
    <div
      {...props}
      role={role}
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        flexShrink: 0,
        gap: theme.design.list.rowGap,
        ...style,
      }}
    />
  )
}
