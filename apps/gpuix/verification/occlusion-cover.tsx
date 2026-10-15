import { render, useGpuix } from "@gpuix/react"
import { useEffect } from "react"
import { createInterface } from "node:readline"
import { ThemeProvider, useTheme } from "../src/shared/theme/ThemeProvider"
import { enforceDesktopDeadline } from "./desktop-deadline"
const deadlineMs = enforceDesktopDeadline()
function Cover() {
  const theme = useTheme()
  const { renderer } = useGpuix()
  useEffect(() => {
    const input = createInterface({ input: process.stdin })
    const onLine = () => {
      if (Date.now() >= deadlineMs) process.exit(0)
      renderer?.activateWindow?.()
    }
    input.on("line", onLine)
    return () => {
      input.off("line", onLine)
      input.close()
    }
  }, [renderer])
  return (
    <div style={{ flexGrow: 1, backgroundColor: theme.colors.background }}>
      <text style={{ color: theme.colors.foreground }}>F3 cover</text>
    </div>
  )
}
render(
  <ThemeProvider>
    <Cover />
  </ThemeProvider>,
  {
    title: "F3 cover",
    width: process.env.F3_SMALL ? 250 : 1200,
    height: process.env.F3_SMALL ? 150 : 800,
    focus: false,
  }
)
process.stdout.write("F3 cover ready\n")
