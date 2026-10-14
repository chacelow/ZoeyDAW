import { render } from "@gpuix/react"
import { ThemeProvider } from "../../shared/theme/ThemeProvider"
import { PanelGallery } from "./PanelGallery"

render(
  <ThemeProvider>
    <PanelGallery />
  </ThemeProvider>,
  {
    title: "gpuix panel gallery A4",
    width: 1120,
    height: 760,
  }
)
