import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import type { ButtonProps } from "@/ui/controls/Button"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { Button } from "@/ui/controls/Button"
import { Icon } from "@/ui/controls/Icon"
import { TruncatedText } from "@/ui/controls/TruncatedText"

export interface TitleBarWindow {
  readonly platform: "macos" | "windows" | "linux"
  readonly minimize: () => void
  readonly zoom: () => void
  readonly close: () => void
  readonly doubleClick?: () => void
  readonly subscribeActive?: (listener: (active: boolean) => void) => () => void
}

export interface TitleBarProps {
  readonly title: string
  readonly left?: ReactNode
  readonly actions?: ReactNode
  readonly window?: TitleBarWindow
  readonly labels: {
    readonly minimize: string
    readonly maximizeRestore: string
    readonly close: string
  }
  readonly testId?: string
}

export function TitleBar({
  title,
  left,
  actions,
  window,
  labels,
  testId = "titlebar",
}: TitleBarProps) {
  const theme = useTheme()
  const [active, setActive] = useState(true)
  const subscribeActive = window?.subscribeActive
  useEffect(() => subscribeActive?.(setActive), [subscribeActive])
  const macos = window?.platform === "macos"
  const doubleClick =
    window?.platform === "linux"
      ? (window.doubleClick ?? window.zoom)
      : macos
        ? window?.doubleClick
        : undefined
  const foreground = active ? theme.colors.foreground : theme.colors.mutedForeground
  return (
    <div
      testId={testId}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        flexShrink: 0,
        height: theme.project.titlebarHeight,
        minWidth: 0,
        paddingLeft: macos
          ? theme.project.trafficLightInset
          : theme.control["--spacing-control-track-gap"],
        backgroundColor: theme.colors.card,
        color: theme.colors.foreground,
        userSelect: "none",
        borderBottomWidth: theme.design.shape.separatorWidth,
        borderColor: theme.colors.border,
      }}
    >
      {left ? (
        <div
          testId={`${testId}-left`}
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch",
            alignSelf: "stretch",
            flexShrink: 0,
          }}
        >
          {left}
        </div>
      ) : null}
      <div
        testId={`${testId}-drag`}
        onMouseDown={
          doubleClick
            ? event => {
                if (event.button === 0 && event.clickCount === 2) doubleClick()
              }
            : undefined
        }
        style={{
          windowControlArea: "drag",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          alignSelf: "stretch",
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          minWidth: 0,
          paddingLeft: theme.control["--spacing-control-track-gap"],
          paddingRight: theme.control["--spacing-control-track-gap"],
          overflow: "hidden",
        }}
      >
        <TruncatedText
          testId={`${testId}-title`}
          role="heading"
          aria-level={1}
          aria-label={title}
          hovered={false}
          style={{
            color: foreground,
            textAlign: "center",
            fontWeight: theme.design.typography.weights.semibold,
          }}
        >
          {title}
        </TruncatedText>
      </div>
      <div
        testId={`${testId}-actions`}
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          flexShrink: 0,
          gap: theme.control["--spacing-control-gap"],
          paddingRight: theme.control["--spacing-control-track-gap"],
        }}
      >
        {actions}
      </div>
      {window && !macos ? (
        <div
          testId={`${testId}-window-controls`}
          style={{ display: "flex", flexDirection: "row", alignSelf: "stretch", flexShrink: 0 }}
        >
          {(
            [
              { key: "minimize", icon: "Minus", label: labels.minimize, action: window.minimize },
              { key: "maximize", icon: "Copy", label: labels.maximizeRestore, action: window.zoom },
              { key: "close", icon: "X", label: labels.close, action: window.close },
            ] satisfies ReadonlyArray<{
              key: string
              icon: "Minus" | "Copy" | "X"
              label: string
              action: () => void
            }>
          ).map(control => (
            <Button
              key={control.key}
              testId={`${testId}-${control.key}`}
              iconOnly
              variant="ghost"
              label={control.label}
              onClick={control.action}
              style={{
                width: theme.project.windowControlWidth,
                height: theme.project.titlebarHeight,
                minWidth: theme.project.windowControlWidth,
                flexShrink: 0,
                borderWidth: 0,
                borderRadius: 0,
                color: theme.colors.foreground,
                hover:
                  control.key === "close"
                    ? {
                        backgroundColor: theme.colors.destructive,
                        color: theme.colors.primaryForeground,
                      }
                    : { backgroundColor: theme.colors.secondary },
                active:
                  control.key === "close"
                    ? {
                        backgroundColor: theme.colors.destructiveActive,
                        color: theme.colors.primaryForeground,
                      }
                    : { backgroundColor: theme.colors.secondary },
              }}
            >
              <Icon name={control.icon} size={theme.control["--spacing-control-icon"]} />
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export interface TitleBarMenuButtonProps extends Omit<
  ButtonProps,
  "children" | "variant" | "label"
> {
  readonly label: string
}

export function TitleBarMenuButton({ label, style, ...props }: TitleBarMenuButtonProps) {
  const theme = useTheme()
  return (
    <Button
      {...props}
      variant="ghost"
      label={label}
      style={{
        height: theme.project.titlebarHeight,
        alignSelf: "stretch",
        borderWidth: 0,
        borderRadius: 0,
        paddingLeft: theme.control["--spacing-control-track-gap"] * 2,
        paddingRight: theme.control["--spacing-control-track-gap"] * 2,
        color: theme.colors.foreground,
        hover: { backgroundColor: theme.colors.secondary },
        active: { backgroundColor: theme.colors.secondary },
        ...style,
      }}
    >
      {label}
    </Button>
  )
}
