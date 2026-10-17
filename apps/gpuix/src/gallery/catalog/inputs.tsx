import { useRef, useState } from "react"
import type { PublicInstance } from "@gpuix/react"
import { Input, Label } from "@/ui/controls"
import { GallerySection, GalleryState, GalleryVariant } from "./GallerySection"
import type { GallerySectionProps } from "./GallerySection"

export function InputsSection({ t }: GallerySectionProps) {
  const inputRef = useRef<PublicInstance | null>(null)
  const [text, setText] = useState(t("Native input", "原生输入"))
  return (
    <GallerySection id="inputs" title={t("Inputs", "输入")}>
      <GalleryVariant label="Input">
        <GalleryState label={t("Default", "默认")}>
          <Input
            ref={inputRef}
            testId="gallery-input"
            aria-label={t("Native input", "原生输入")}
            value={text}
            onValueChange={setText}
          />
        </GalleryState>
        <GalleryState label={t("Invalid", "无效")}>
          <Input
            aria-label={t("Invalid input example", "无效输入示例")}
            invalid
            value={text}
            onValueChange={setText}
          />
        </GalleryState>
        <GalleryState label={t("Disabled", "不可用")}>
          <Input
            aria-label={t("Unavailable input", "不可用输入")}
            disabled
            value={t("Unavailable", "不可用")}
          />
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label="Label">
        <GalleryState label={t("Bound to input", "绑定输入")}>
          <Label controlRef={inputRef}>{t("Input label", "输入标签")}</Label>
        </GalleryState>
      </GalleryVariant>
    </GallerySection>
  )
}
