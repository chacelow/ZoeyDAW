import { useMemo } from "react"
import { render, useGpuix } from "@gpuix/react"
import { createNativeCursorLock } from "@/platform/cursor"
import { LAUNCH_FOCUS } from "@/platform/window"
import { GalleryDemo } from "./GalleryDemo"
import { verifyEvidenceBinding } from "./evidence-binding"

const appearance = process.env.GALLERY_APPEARANCE === "light" ? "light" : "dark"
const locale = process.env.GALLERY_LOCALE === "zh" ? "zh" : "en"
const background = !LAUNCH_FOCUS.focus
process.stdout.write(
  `${JSON.stringify({ evidenceBinding: verifyEvidenceBinding(), appearance, locale, background })}\n`
)
function NativeGallery() {
  const { renderer } = useGpuix()
  const cursorLock = useMemo(() => createNativeCursorLock(renderer), [renderer])
  return (
    <GalleryDemo cursorLock={cursorLock} initialAppearance={appearance} initialLocale={locale} />
  )
}

render(<NativeGallery />, {
  title: "zoeydaw composition Gallery",
  width: 1050,
  height: 780,
  ...LAUNCH_FOCUS,
})
