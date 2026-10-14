/**
 * Style composition for gpuix `StyleDesc` objects: the equivalent of this
 * project's `cn()` and `class-variance-authority`, without a CSS class
 * string to merge. gpuix styles are plain objects, so "merging classes" is
 * merging objects; `hover`/`active` are nested one level and merge instead
 * of replace so an override can add a hover color without dropping the base.
 *
 * Shared by every control slice: do not hand-roll a second merge/variant
 * helper in a feature directory.
 */
import type { StyleDesc } from "@gpuix/react"

export type StyleInput = StyleDesc | null | undefined | false

export function mergeStyle(base: StyleInput, override: StyleInput): StyleDesc {
  if (!base) {
    return override || {}
  }
  if (!override) {
    return base
  }
  const merged: StyleDesc = { ...base, ...override }
  if (base.hover || override.hover) {
    merged.hover = { ...base.hover, ...override.hover }
  }
  if (base.active || override.active) {
    merged.active = { ...base.active, ...override.active }
  }
  return merged
}

export function sx(...styles: StyleInput[]): StyleDesc {
  return styles.reduce<StyleDesc>((acc, style) => mergeStyle(acc, style), {})
}

type VariantSchema = Record<string, Record<string, StyleInput>>
type VariantSelection<V extends VariantSchema> = { [K in keyof V]?: keyof V[K] }

export interface VariantConfig<V extends VariantSchema> {
  base?: StyleInput
  variants: V
  defaultVariants?: VariantSelection<V>
}

export type VariantProps<V extends VariantSchema> = VariantSelection<V> & { style?: StyleInput }

export function sv<V extends VariantSchema>(config: VariantConfig<V>) {
  return (props: VariantProps<V> = {}): StyleDesc => {
    let out = mergeStyle(undefined, config.base)
    for (const name of Object.keys(config.variants)) {
      const key = props[name] ?? config.defaultVariants?.[name]
      if (key == null) {
        continue
      }
      out = mergeStyle(out, config.variants[name]?.[key as string])
    }
    return mergeStyle(out, props.style)
  }
}
