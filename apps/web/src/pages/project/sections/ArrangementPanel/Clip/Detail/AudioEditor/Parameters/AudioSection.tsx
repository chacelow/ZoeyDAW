import { ChevronDown } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Button } from "@zoeymind/ui"

export function AudioSection({
  title,
  children,
  defaultOpen = true,
}: {
  readonly title: string
  readonly children: ReactNode
  readonly defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-border flex-none border-b">
      <Button
        type="button"
        variant="ghost"
        size="control"
        className="text-muted-foreground w-full justify-start rounded-none font-medium"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <ChevronDown
          className={
            open
              ? "transition-transform duration-150"
              : "-rotate-90 transition-transform duration-150"
          }
          aria-hidden="true"
        />
        <span>{title}</span>
      </Button>
      {open ? <div className="px-control-gap pb-control-gap min-w-0">{children}</div> : null}
    </section>
  )
}
