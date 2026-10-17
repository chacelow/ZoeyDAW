import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { Progress } from "../Progress"
import type { Props } from "@gpuix/react"

export type LoadingProps = Props & {
  readonly label: string
  readonly show?: boolean
  readonly inline?: boolean
} & (
    | { readonly progress: number; readonly progressValueText: string }
    | { readonly progress?: never; readonly progressValueText?: never }
  ) &
  (
    | { readonly logoSrc: string; readonly logoAlt: string }
    | { readonly logoSrc?: never; readonly logoAlt?: never }
  )

export function Loading({
  label,
  show = true,
  inline = false,
  progress,
  progressValueText,
  logoSrc,
  logoAlt,
  children,
  style,
  ...props
}: LoadingProps) {
  const theme = useTheme()
  if (!show) return null
  const showProgress = typeof progress === "number"
  return (
    <div
      {...props}
      role="status"
      aria-label={props["aria-label"] ?? label}
      aria-live="polite"
      aria-busy={true}
      style={sx(
        {
          position: inline ? "relative" : "absolute",
          top: inline ? undefined : 0,
          bottom: inline ? undefined : 0,
          left: inline ? undefined : 0,
          right: inline ? undefined : 0,
          display: "flex",
          flexDirection: inline ? "row" : "column",
          alignItems: "center",
          justifyContent: "center",
          gap: inline ? theme.control["--spacing-control-gap"] : theme.design.loading.gap,
          minHeight: inline ? theme.control["--spacing-control-track"] : undefined,
          backgroundColor: inline ? "transparent" : theme.colors.background,
          color: theme.colors.mutedForeground,
          fontSize: theme.control["--text-control-track"],
        },
        style
      )}
    >
      {logoSrc ? (
        <img
          src={logoSrc}
          alt={logoAlt}
          objectFit="contain"
          style={{
            width: theme.design.loading.brandWidth,
            height: theme.design.loading.brandHeight,
          }}
        />
      ) : null}
      <div>{label}</div>
      {showProgress ? (
        <div style={{ width: theme.design.loading.progressWidth }}>
          <Progress value={progress ?? 0} aria-label={label} aria-valuetext={progressValueText} />
        </div>
      ) : null}
      {children}
    </div>
  )
}
