import config from "ultracite/stylelint"

export default {
  ...config,
  ignoreFiles: [
    ...config.ignoreFiles,
    "src-tauri/**",
    ".agents/**",
    ".claude/**",
    ".github/**",
    "packages/ui/src/controls/metrics/generated.css",
  ],
  rules: {
    ...config.rules,
    "property-no-vendor-prefix": [true, { ignoreProperties: ["user-select"] }],
  },
}
