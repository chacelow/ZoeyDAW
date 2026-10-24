import { useTranslation } from "@zoeymind/i18n"
import { coverageFor, galleryStates } from "./catalog"
import type { GalleryFamily } from "./catalog"
import { domainProfiles } from "./state-profiles"

export function StateCatalog({ family }: { readonly family: GalleryFamily }) {
  const { t } = useTranslation()
  return (
    <details className="border-border/60 mt-5 border-t pt-3" data-state-catalog={family.id}>
      <summary className="text-muted-foreground cursor-pointer text-xs">
        {t("library.catalog.stateTitle")}
      </summary>
      <ul
        aria-label={t("library.catalog.variants")}
        className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px]"
      >
        {family.variants.map(variant => (
          <li key={variant}>{t(`library.catalog.variantsList.${variant}`)}</li>
        ))}
      </ul>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead className="text-muted-foreground">
            <tr>
              <th scope="col" className="py-2 pr-4">
                {t("library.catalog.stateColumn")}
              </th>
              <th scope="col" className="py-2">
                {t("library.catalog.supportColumn")}
              </th>
            </tr>
          </thead>
          <tbody>
            {galleryStates.map(state => {
              const coverage = coverageFor(family, state)
              return (
                <tr
                  key={state}
                  data-gallery-state={state}
                  data-applicability={coverage.kind}
                  className="border-border/40 border-t align-top"
                >
                  <th scope="row" className="py-1.5 pr-4 font-normal">
                    {t(`library.catalog.states.${state}`)}
                  </th>
                  <td
                    className="text-muted-foreground py-1.5"
                    aria-label={t(`library.catalog.states.${state}`)}
                  >
                    <details>
                      <summary className="cursor-pointer">
                        {t(`library.catalog.${coverage.kind}`)}
                      </summary>
                      <p className="my-1 max-w-2xl leading-relaxed">
                        {t(`library.catalog.notes.${coverage.note}`)}
                      </p>
                    </details>
                  </td>
                </tr>
              )
            })}
            {(domainProfiles[family.profile] ?? []).map(state => (
              <tr
                key={state}
                data-gallery-domain-state={state}
                className="border-border/40 border-t align-top"
              >
                <th scope="row" className="py-1.5 pr-4 font-normal">
                  {t(`library.catalog.domainStates.${state}`)}
                </th>
                <td
                  className="text-muted-foreground py-1.5"
                  aria-label={t(`library.catalog.domainStates.${state}`)}
                >
                  <details>
                    <summary className="cursor-pointer">{t("library.catalog.supported")}</summary>
                    <p className="my-1 max-w-2xl leading-relaxed">
                      {t(`library.catalog.domainNotes.${state}`)}
                    </p>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
