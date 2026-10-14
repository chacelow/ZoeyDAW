import { render } from "@gpuix/react"
import { ThemeProvider } from "../../shared/theme/ThemeProvider"
import { ClipTimeline } from "./components/ClipTimeline"

render(
  <ThemeProvider>
    <ClipTimeline />
  </ThemeProvider>,
  {
    title: "zoeydaw · Clip drag and resize",
    width: 1040,
    height: 480,
  }
)
