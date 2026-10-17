import type { StyleDesc } from "@gpuix/react"
import type { ReactNode } from "react"
import type { Theme } from "@/shared/theme/ThemeProvider"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { Icon } from "../Icon"
import { IconSlot } from "../IconSlot"
import { listRowChrome } from "../ListRow"
import { TruncatedText } from "../TruncatedText"

export function menuRowChrome(theme: Theme) {
  return {
    ...listRowChrome(theme),
    height: theme.design.menu.rowHeight,
    width: "100%",
    minHeight: theme.design.menu.rowHeight,
    padding: theme.design.menu.rowInset,
    gap: theme.design.menu.rowGap,
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  } satisfies StyleDesc
}

export function menuSeparatorChrome(theme: Theme) {
  return {
    height: theme.design.shape.separatorWidth,
    flexShrink: 0,
    marginLeft: -theme.design.menu.inset,
    marginRight: -theme.design.menu.inset,
    marginTop: theme.design.menu.separatorInset,
    marginBottom: theme.design.menu.separatorInset,
    backgroundColor: theme.colors.border,
  } satisfies StyleDesc
}

export function menuLabelChrome(theme: Theme) {
  return {
    ...menuRowChrome(theme),
    color: theme.colors.mutedForeground,
  } satisfies StyleDesc
}

export function MenuRowContent({
  children,
  checked,
  shortcut,
  trailing,
  swatch = false,
  hovered,
}: {
  children?: ReactNode
  checked?: boolean
  shortcut?: string
  trailing?: ReactNode
  swatch?: boolean
  hovered?: boolean
}) {
  const theme = useTheme()
  return (
    <>
      <IconSlot>{checked ? <Icon name="Check" /> : null}</IconSlot>
      {typeof children === "string" ? (
        <TruncatedText
          hovered={hovered}
          style={{ flexGrow: 1, flexBasis: 0, opacity: swatch ? 0 : 1 }}
        >
          {children.replace(/\r?\n/g, " ")}
        </TruncatedText>
      ) : (
        children
      )}
      {shortcut ? (
        <text style={{ flexShrink: 0, color: theme.colors.mutedForeground, whiteSpace: "nowrap" }}>
          {shortcut}
        </text>
      ) : null}
      {trailing}
    </>
  )
}
