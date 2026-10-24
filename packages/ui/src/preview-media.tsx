import { useEffect, useState } from "react"
import { X, FileText, ZoomIn } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { Dialog, DialogContent, DialogTitle, DialogClose } from "./dialog"
import { cn } from "./cn"
import { VisuallyHidden } from "./visually-hidden"

export interface MediaItem {
  id: string
  name: string
  url?: string
  file?: File
  type: "image" | "file"
}

export interface PreviewMediaProps {
  readonly items: MediaItem[]
  readonly onRemove?: (index: number) => void
  readonly size?: "sm" | "md" | "lg"
  readonly disabled?: boolean
  readonly scrollable?: boolean
  readonly className?: string
}

export function PreviewMedia({
  items,
  onRemove,
  size = "md",
  disabled = false,
  scrollable = false,
  className,
}: PreviewMediaProps) {
  const { t } = useTranslation()

  // 无媒体项时不渲染
  if (!items || items.length === 0) {
    return null
  }

  // 根据尺寸类型设置容器大小
  const sizeClasses = {
    sm: "size-8", // 小尺寸适用于输入框预览
    md: "size-16", // 中等尺寸
    lg: "size-24", // 大尺寸适用于消息附件
  }

  return (
    <>
      <div
        className={cn(
          "flex gap-2",
          scrollable ? "scrollbar-none overflow-x-auto" : "flex-wrap",
          className
        )}
      >
        {items.map((item, index) => {
          if (item.type === "image" && (item.url || item.file)) {
            return (
              <ImagePreview
                key={item.id}
                item={item}
                index={index}
                size={size}
                sizeClassName={sizeClasses[size]}
                disabled={disabled}
                onRemove={onRemove}
              />
            )
          }
          // 文件预览
          return (
            <div
              key={item.id}
              className={cn(
                "border-border bg-muted relative flex items-center justify-center rounded-lg border",
                sizeClasses[size]
              )}
            >
              <div className="flex flex-col items-center">
                <FileText
                  className={cn("text-muted-foreground", size === "sm" ? "size-4" : "size-8")}
                />
                <span className="text-muted-foreground mt-1 line-clamp-2 px-1 text-center text-xs">
                  {item.name}
                </span>
              </div>

              {/* 删除按钮，仅在允许删除时显示 */}
              {onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  disabled={disabled}
                  className={cn(
                    "bg-destructive hover:bg-destructive/90 absolute -top-1 -right-1 rounded-full",
                    size === "sm" ? "p-[1px]" : "p-0.5",
                    "opacity-80 transition-opacity group-hover:opacity-100",
                    disabled ? "cursor-not-allowed opacity-50" : ""
                  )}
                  aria-label={t("ui.preview.deleteFile")}
                >
                  <X className={cn("text-white", size === "sm" ? "size-2" : "size-3")} />
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </>
  )
}

function ImagePreview({
  item,
  index,
  size,
  sizeClassName,
  disabled,
  onRemove,
}: {
  item: MediaItem
  index: number
  size: NonNullable<PreviewMediaProps["size"]>
  sizeClassName: string
  disabled: boolean
  onRemove: PreviewMediaProps["onRemove"]
}) {
  const { t } = useTranslation()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [ownedImage, setOwnedImage] = useState<{ file: File; url: string } | null>(null)
  const file = item.url ? undefined : item.file

  useEffect(() => {
    if (!file) {
      setOwnedImage(null)
      return
    }
    const url = URL.createObjectURL(file)
    setOwnedImage({ file, url })
    return () => URL.revokeObjectURL(url)
  }, [file])

  const imageUrl = item.url || (ownedImage?.file === file ? ownedImage?.url : undefined)

  return (
    <>
      <div className={cn("group relative", sizeClassName)}>
        <button
          type="button"
          aria-label={`${t("ui.preview.imagePreview")}: ${item.name}`}
          className="border-border absolute inset-0 overflow-hidden rounded-lg border"
          onClick={() => setPreviewOpen(true)}
        >
          <img src={imageUrl} alt={item.name} className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/0 transition-all duration-200 group-hover:bg-black/30">
            <ZoomIn className="size-3 text-white opacity-0 transition-opacity group-hover:opacity-100" />
          </span>
        </button>

        {onRemove ? (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              onRemove(index)
            }}
            disabled={disabled}
            className={cn(
              "bg-destructive hover:bg-destructive/90 absolute -top-1 -right-1 z-10 rounded-full",
              size === "sm" ? "p-[1px]" : "p-0.5",
              "opacity-80 transition-opacity group-hover:opacity-100",
              disabled ? "cursor-not-allowed opacity-50" : ""
            )}
            aria-label={t("ui.preview.deleteFile")}
          >
            <X className={cn("text-white", size === "sm" ? "size-2" : "size-3")} />
          </button>
        ) : null}
      </div>

      <Dialog open={previewOpen && !!imageUrl} onOpenChange={setPreviewOpen}>
        <DialogContent
          className="flex max-h-[90vh] items-center justify-center border-none bg-black/80 p-0 sm:max-w-[90vw]"
          onClick={e => e.target === e.currentTarget && setPreviewOpen(false)}
        >
          <DialogTitle>
            <VisuallyHidden>{t("ui.preview.imagePreview")}</VisuallyHidden>
          </DialogTitle>

          <div className="relative max-h-full max-w-full">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={t("ui.preview.previewImage")}
                className="max-h-[80vh] max-w-[85vw] rounded-md object-contain"
              />
            ) : null}

            <div className="absolute top-2 right-2">
              <DialogClose
                className="bg-foreground/80 hover:bg-foreground text-background rounded-full p-1.5"
                aria-label={t("ui.preview.close")}
              >
                <X className="size-4" />
              </DialogClose>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
