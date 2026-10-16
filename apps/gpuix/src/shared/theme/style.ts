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
