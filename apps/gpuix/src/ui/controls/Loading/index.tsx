import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { Progress } from "../Progress"
import type { Props } from "@gpuix/react"

export type LoadingProps = Props & {
  readonly label: string
  readonly show?: boolean
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
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: theme.design.loading.gap,
          backgroundColor: theme.colors.background,
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
