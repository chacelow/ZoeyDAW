import { render } from "@gpuix/react"
import { nativeCursorLock } from "@/platform/cursor"
import { GalleryDemo } from "./GalleryDemo"
import { verifyEvidenceBinding } from "./evidence-binding"

const appearance = process.env.GALLERY_APPEARANCE === "light" ? "light" : "dark"
const locale = process.env.GALLERY_LOCALE === "zh" ? "zh" : "en"
const background = process.env.GPUIX_BACKGROUND === "1"
process.stdout.write(
  `${JSON.stringify({ evidenceBinding: verifyEvidenceBinding(), appearance, locale, background })}\n`
)
render(
  <GalleryDemo
    cursorLock={nativeCursorLock}
    initialAppearance={appearance}
    initialLocale={locale}
  />,
  { title: "zoeydaw composition Gallery", width: 1050, height: 780, focus: !background }
)
