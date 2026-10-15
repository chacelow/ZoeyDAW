import { createContext, useCallback, useContext, useRef } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { useGpuix } from "@gpuix/react"
import { setRefs } from "@gpuix/react/floating"
import type { Props, PublicInstance } from "@gpuix/react"
import { Button } from "../Button"
import { Icon } from "../Icon"
import type { CardDesignTokens, CardSize } from "@/shared/theme/design-tokens"

export interface CardProps extends Props {
  readonly size?: CardSize
}

const CardDesign = createContext<CardDesignTokens | null>(null)

function useCardDesign() {
  const theme = useTheme()
  return useContext(CardDesign) ?? theme.design.cards.default
}

export function Card({
  size = "default",
  style,
  children,
  onClick,
  onKeyDown,
  ref,
  ...props
}: CardProps) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const element = useRef<PublicInstance | null>(null)
  const bindRef = useCallback(
    (node: PublicInstance | null) => {
      element.current = node
      setRefs(node, ref)
    },
    [ref]
  )
  const design = theme.design.cards[size]
  const cardStyle = sx(
    {
      display: "flex",
      flexDirection: "column",
      gap: design.gap,
      paddingTop: design.inset,
      paddingBottom: design.inset,
      paddingLeft: design.insetOwner === "shell" ? design.inset : 0,
      paddingRight: design.insetOwner === "shell" ? design.inset : 0,
      borderWidth: theme.design.shape.cardBorderWidth,
      borderColor: theme.colors.border,
      borderRadius: design.radius,
      overflow: "hidden",
      backgroundColor: theme.colors.card,
      color: theme.colors.cardForeground,
      fontSize: theme.control["--text-control-track"],
      hover: design.hover === "accent" ? { backgroundColor: theme.colors.accent } : undefined,
      keyboardFocusDim: onClick ? false : undefined,
      focusVisible: onClick
        ? {
            outlineWidth: theme.design.shape.focusRingWidth,
            outlineColor: theme.colors.ring,
            outlineOffset: -theme.design.shape.focusRingWidth,
          }
        : undefined,
    },
    style
  )
  return (
    <CardDesign.Provider value={design}>
      {onClick ? (
        <div
          {...props}
          ref={bindRef}
          role="button"
          tabIndex={props.tabIndex ?? 0}
          aria-disabled={false}
          onClick={onClick}
          onKeyDown={event => {
            onKeyDown?.(event)
            if (
              !event.defaultPrevented &&
              element.current &&
              renderer?.getFocusedElementId?.() === element.current.id &&
              (event.key === "enter" || event.key === "space" || event.key === " ")
            ) {
              onClick(event)
            }
          }}
          style={cardStyle}
        >
          {children}
        </div>
      ) : (
        <div {...props} ref={bindRef} role="group" style={cardStyle}>
          {children}
        </div>
      )}
    </CardDesign.Provider>
  )
}

export interface CardHeaderProps extends Props {
  readonly disclosure?: {
    readonly expanded: boolean
    readonly onExpandedChange: (expanded: boolean) => void
    readonly label: string
  }
}

export function CardHeader({ disclosure, children, style, ...props }: CardHeaderProps) {
  const design = useCardDesign()
  const theme = useTheme()
  return (
    <div
      {...props}
      style={sx(
        {
          display: "flex",
          flexDirection: disclosure ? "row" : "column",
          alignItems: disclosure ? "center" : undefined,
          gap: design.headerGap,
          paddingLeft: design.insetOwner === "parts" ? design.inset : 0,
          paddingRight: design.insetOwner === "parts" ? design.inset : 0,
        },
        style
      )}
    >
      {disclosure ? (
        <>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flexGrow: 1,
              minWidth: 0,
              gap: design.headerGap,
            }}
          >
            {children}
          </div>
          <Button
            label={disclosure.label}
            aria-expanded={disclosure.expanded}
            iconOnly
            variant="ghost"
            icon={
              <Icon
                name={disclosure.expanded ? "ChevronDown" : "ChevronRight"}
                size={theme.control["--spacing-control-icon"]}
              />
            }
            onKeyDown={event => {
              if (event.key === "enter") event.stopPropagation()
            }}
            onClick={() => disclosure.onExpandedChange(!disclosure.expanded)}
          />
        </>
      ) : (
        children
      )}
    </div>
  )
}

export function CardTitle({ style, ...props }: Props) {
  const theme = useTheme()
  return (
    <div
      role="heading"
      aria-level={2}
      {...props}
      style={sx(
        {
          fontSize: theme.control["--text-control-track"],
          fontWeight: 600,
          color: theme.colors.cardForeground,
        },
        style
      )}
    />
  )
}

export function CardDescription({ style, ...props }: Props) {
  const theme = useTheme()
  return (
    <div
      {...props}
      style={sx(
        { color: theme.colors.mutedForeground, fontSize: theme.control["--text-control-track"] },
        style
      )}
    />
  )
}

export function CardContent({ style, ...props }: Props) {
  const design = useCardDesign()
  return (
    <div
      {...props}
      style={sx(
        {
          display: "flex",
          flexDirection: "column",
          gap: design.contentGap,
          paddingLeft: design.insetOwner === "parts" ? design.inset : 0,
          paddingRight: design.insetOwner === "parts" ? design.inset : 0,
          minWidth: 0,
        },
        style
      )}
    />
  )
}
