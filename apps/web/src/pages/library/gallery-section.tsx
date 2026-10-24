import { createContext, useContext } from "react"
import type { ReactNode } from "react"
import { useTranslation } from "@zoeymind/i18n"

export const GallerySectionsContext = createContext<readonly string[] | null>(null)

export function GallerySection({
  id,
  children,
}: {
  readonly id: string
  readonly children: ReactNode
}) {
  const { t } = useTranslation()
  const sections = useContext(GallerySectionsContext)
  if (sections && !sections.includes(id)) return null
  const showHeading = !sections || sections[0] !== id
  return (
    <section
      aria-label={showHeading ? undefined : t(`library.sections.${id}.title`)}
      aria-labelledby={showHeading ? `gallery-${id}` : undefined}
      className={
        showHeading
          ? "border-border/60 gap-control-gap flex min-w-0 flex-col border-t py-3"
          : "gap-control-gap flex min-w-0 flex-col py-2"
      }
    >
      {showHeading && (
        <h3 id={`gallery-${id}`} className="mb-1 text-xs font-medium">
          {t(`library.sections.${id}.title`)}
        </h3>
      )}
      {children}
    </section>
  )
}

export function ValueEcho({ pairs }: { readonly pairs: readonly (readonly [string, string])[] }) {
  return (
    <dl className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums">
      {pairs.map(([label, value]) => (
        <div key={label} className="flex gap-1">
          <dt>{label}:</dt>
          <dd className="text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
