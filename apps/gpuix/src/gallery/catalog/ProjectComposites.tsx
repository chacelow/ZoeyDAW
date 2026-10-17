import { useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { Card, CardDescription, DragPreviewArea } from "@/ui/controls"
import { GalleryState, GalleryVariant } from "./GallerySection"
import type { GallerySectionProps } from "./GallerySection"

export function ProjectComposites({ t }: GallerySectionProps) {
  const theme = useTheme()
  const [status, setStatus] = useState("")
  return (
    <>
      <GalleryVariant label={t("Project card", "工程卡片")}>
        <GalleryState label={t("Project hierarchy", "工程内容层级")}>
          <div
            testId="gallery-project-section"
            role="group"
            aria-label={t("Project cards: separate content hierarchy", "工程卡片：独立内容层级")}
            style={{ width: theme.layout.gallery.cardWidth }}
          >
            <Card
              size="project"
              testId="gallery-project-card"
              aria-label={t("Project card variant", "工程卡片变体")}
              onClick={() => setStatus(t("Project card UI action", "工程卡片 UI 操作"))}
            >
              <text>{t("Project card variant", "工程卡片变体")}</text>
              <CardDescription>
                {t(
                  "Shared project-card inset and hover; not a compact panel row.",
                  "共享工程卡片内边距与悬停外观，不属于紧凑面板行。"
                )}
              </CardDescription>
            </Card>
          </div>
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label={t("Drag preview", "拖放预览")}>
        <GalleryState label={t("Default", "默认")}>
          <DragPreviewArea
            testId="gallery-drag-preview"
            data={t("Native sample", "原生示例")}
            disabledDropLabel={t("Drop unavailable", "无法放置")}
            renderPreview={data => <text>{data}</text>}
            onDragEnd={(_, result) =>
              setStatus(
                result.cancelled
                  ? t("Preview cancelled", "预览已取消")
                  : t("Preview released", "预览已释放")
              )
            }
          >
            <text>{t("Drag to preview", "拖动预览")}</text>
          </DragPreviewArea>
        </GalleryState>
      </GalleryVariant>
      <text role="status" style={{ color: theme.colors.mutedForeground }}>
        {status}
      </text>
    </>
  )
}
