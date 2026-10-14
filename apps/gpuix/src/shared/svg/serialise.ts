/**
 * The only file in apps/gpuix that writes SVG markup. gpuix paints raw markup through the native
 * `<svg source>`; everything else describes shapes as data (lucide icon nodes, d3-shape paths) and
 * hands them to `serialiseSvg`. The lint rule `architecture/gpuix-imports` bans SVG literals
 * everywhere else, so a hand-written `<path d="…">` cannot slip back in.
 */
export type SvgNode = readonly [tag: string, attributes: Readonly<Record<string, string | number>>]

export interface SvgDocumentOptions {
  readonly viewBox: string
  readonly attributes?: Readonly<Record<string, string | number>>
}

function attributeText(attributes: Readonly<Record<string, string | number>>): string {
  return Object.entries(attributes)
    .filter(([key]) => key !== "key")
    .map(([key, value]) => `${key}="${String(value)}"`)
    .join(" ")
}

export function serialiseSvg(children: readonly SvgNode[], options: SvgDocumentOptions): string {
  const body = children
    .map(([tag, attributes]) => `<${tag} ${attributeText(attributes)}/>`)
    .join("")
  const root = attributeText({
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: options.viewBox,
    ...options.attributes,
  })
  return `<svg ${root}>${body}</svg>`
}
