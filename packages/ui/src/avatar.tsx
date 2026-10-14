import * as React from "react"
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"

import { cn } from "#lib/utils"

function Avatar({
  className,
  size = "default",
  ...properties
}: AvatarPrimitive.Root.Props & {
  readonly size?: "default" | "sm" | "lg"
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "group/avatar after:border-border relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten",
        className
      )}
      {...properties}
    />
  )
}

function AvatarImage({ className, ...properties }: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full rounded-full object-cover", className)}
      {...properties}
    />
  )
}

function AvatarFallback({ className, ...properties }: AvatarPrimitive.Fallback.Props) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted text-muted-foreground flex size-full items-center justify-center rounded-full text-sm group-data-[size=sm]/avatar:text-xs",
        className
      )}
      {...properties}
    />
  )
}

function AvatarBadge({ className, ...properties }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "bg-primary text-primary-foreground ring-background absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-blend-color ring-2 select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        className
      )}
      {...properties}
    />
  )
}

function AvatarGroup({ className, ...properties }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        // ring-2 ring-background 在头像间画白色环分隔。
        // AvatarFallback 默认是半透明色（`bg-primary/10 text-primary`，见
        // apps/web/src/shared/auth UserAvatar）——单头像场景 OK，但 -space-x-2 叠一半时上层
        // fallback 透明底会露出下层头像，视觉上是"重叠有透明"（用户反馈根因）。
        // 在头像组里给 Avatar 根加不透明白底（`bg-background`），下垫住任何半透明
        // fallback 底色：视觉不变，重叠区不再透。
        "group/avatar-group *:data-[slot=avatar]:ring-background *:data-[slot=avatar]:bg-background flex -space-x-2 *:data-[slot=avatar]:ring-2",
        className
      )}
      {...properties}
    />
  )
}

function AvatarGroupCount({ className, ...properties }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "bg-muted text-muted-foreground ring-background relative flex size-8 shrink-0 items-center justify-center rounded-full text-sm ring-2 group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        className
      )}
      {...properties}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarBadge }
