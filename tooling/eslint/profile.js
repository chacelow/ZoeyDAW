import { builtinRules } from "eslint/use-at-your-own-risk"

const stableHookRules = new Set([
  "react-hooks/rules-of-hooks",
  "react-hooks/exhaustive-deps",
  "react-hooks/set-state-in-render",
])
export function correctnessProfile(presets) {
  const plugins = Object.assign({}, ...presets.map(preset => preset.plugins ?? {}))
  const recommendations = new Set([
    ...Object.keys(plugins.react.configs.recommended.rules),
    ...Object.keys(plugins["jsx-a11y"].configs.recommended.rules),
  ])

  return presets.map(preset => ({
    ...preset,
    ...(preset.rules && {
      rules: Object.fromEntries(
        Object.entries(preset.rules).map(([name, setting]) => {
          const slash = name.lastIndexOf("/")
          const rule =
            slash === -1
              ? builtinRules.get(name)
              : plugins[name.slice(0, slash)]?.rules?.[name.slice(slash + 1)]
          const type = rule?.meta?.type
          const hasLegacyReactMetadata = !type && /^(?:react|jsx-a11y)\//u.test(name)
          const isCompilerHint = name.startsWith("react-hooks/") && !stableHookRules.has(name)
          const isSuggestion =
            !stableHookRules.has(name) &&
            (type === "suggestion" ||
              type === "layout" ||
              isCompilerHint ||
              (hasLegacyReactMetadata && !recommendations.has(name)))
          return [name, isSuggestion ? "off" : setting]
        })
      ),
    }),
  }))
}
