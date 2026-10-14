import * as React from "react"
import { cn } from "./cn"

const Item = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...properties }, reference) => (
    <div ref={reference} className={cn("flex items-center", className)} {...properties} />
  )
)
Item.displayName = "Item"

const ItemMedia = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...properties }, reference) => (
    <div ref={reference} className={cn("flex-shrink-0", className)} {...properties} />
  )
)
ItemMedia.displayName = "ItemMedia"

const ItemContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...properties }, reference) => (
    <div ref={reference} className={cn("min-w-0 flex-1", className)} {...properties} />
  )
)
ItemContent.displayName = "ItemContent"

const ItemTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...properties }, reference) => (
    <div
      ref={reference}
      className={cn("text-sm leading-none font-semibold", className)}
      {...properties}
    />
  )
)
ItemTitle.displayName = "ItemTitle"

const ItemDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...properties }, reference) => (
    <div
      ref={reference}
      className={cn("text-muted-foreground text-sm", className)}
      {...properties}
    />
  )
)
ItemDescription.displayName = "ItemDescription"

const ItemActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...properties }, reference) => (
    <div ref={reference} className={cn("flex-shrink-0", className)} {...properties} />
  )
)
ItemActions.displayName = "ItemActions"

export { Item, ItemMedia, ItemContent, ItemTitle, ItemDescription, ItemActions }
