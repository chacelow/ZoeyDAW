/**
 * Entry point. Each feature slice mounts under `<App>`; this file only
 * proves the foundation (theme, tokens, style helpers) boots for real.
 */
import { render } from "@gpuix/react"
import { ThemeProvider, useTheme } from "./shared/theme/ThemeProvider"
import { sx } from "./shared/theme/style"

function FoundationCheck() {
  const theme = useTheme()
  return (
    <div
      style={sx({
        display: "flex",
        flexDirection: "column",
        gap: theme.control["--spacing-control-gap"],
        padding: 16,
        width: "100%",
        height: "100%",
        backgroundColor: theme.colors.background,
      })}
    >
      <text style={{ color: theme.colors.foreground, fontSize: 18 }}>
        gpuix foundation: tokens + style helpers booted
      </text>
      <div
        style={sx({
          height: theme.control["--spacing-control-track"],
          borderRadius: 4,
          backgroundColor: theme.colors.editorShell,
        })}
      />
    </div>
  )
}

render(
  <ThemeProvider>
    <FoundationCheck />
  </ThemeProvider>,
  { title: "gpuix foundation check", width: 480, height: 240 }
)
