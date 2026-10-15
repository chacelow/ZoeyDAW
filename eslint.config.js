import core from "ultracite/eslint/core"
import react from "ultracite/eslint/react"
import {
  architecture,
  gpuixLayers,
  gpuixImports,
  publicIndex,
  uiTokens,
  correctnessProfile,
  vendoredProfile,
} from "./tooling/eslint/index.js"

const localRules = {
  rules: {
    boundaries: architecture,
    "gpuix-layers": gpuixLayers,
    "gpuix-imports": gpuixImports,
    "public-index": publicIndex,
    "ui-tokens": uiTokens,
  },
}

const source = ["apps/web/src/**/*.{ts,tsx,js,jsx}", "packages/ui/src/**/*.{ts,tsx,js,jsx}"]
const gpuixSource = ["apps/gpuix/src/**/*.{ts,tsx,js,jsx}"]
const reactPlugins = Object.assign({}, ...react.map(preset => preset.plugins ?? {}))

export default [
  ...correctnessProfile([...core, ...react]),
  {
    ignores: [
      ".agents/**",
      ".claude/**",
      ".github/**",
      "src-tauri/**",
      "packages/ui/src/theme/theme-presets.ts",
      "packages/ui/src/controls/metrics/generated.css",
    ],
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    rules: {
      // The repository already uses descriptive PascalCase component files and directories.
      "github/filenames-match-regex": ["error", "^[A-Za-z][A-Za-z0-9]*(?:[-.][A-Za-z0-9]+)*$"],
      "sort-keys": "off",
      "no-nested-ternary": "off",
      "no-use-before-define": ["error", { functions: false }],
      "import-x/no-cycle": ["error", { ignoreExternal: true }],
    },
    settings: {
      "import-x/internal-regex": "^@zoeymind/",
      "import-x/resolver": {
        typescript: {
          project: [
            "apps/web/tsconfig.app.json",
            "packages/ui/tsconfig.json",
            "packages/shared/tsconfig.json",
            "packages/logger/tsconfig.json",
            "packages/i18n/tsconfig.json",
          ],
          noWarnOnMultipleProjects: true,
        },
      },
    },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      "@typescript-eslint/no-use-before-define": [
        "error",
        { functions: false, typedefs: false, ignoreTypeReferences: true },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ["**/*.{jsx,tsx}"],
    rules: {
      "react-doctor/react-router-v8-no-react-router-dom-import": "off",
      "react/prop-types": "off",
      "react/button-has-type": "error",
      "github/a11y-no-title-attribute": "off",
      "jsx-a11y/no-static-element-interactions": ["error", { handlers: ["onClick"] }],
      "jsx-a11y/no-noninteractive-element-interactions": ["error", { handlers: ["onClick"] }],
      "jsx-a11y/no-noninteractive-tabindex": [
        "error",
        { roles: ["tabpanel", "separator", "group", "application"] },
      ],
      "jsx-a11y/label-has-associated-control": [
        "error",
        {
          controlComponents: [
            "Input",
            "Textarea",
            "Checkbox",
            "Switch",
            "RadioGroupItem",
            "DragPadNumber",
            "DragPadBar",
            "PanControl",
            "DropdownButton",
          ],
        },
      ],
    },
  },
  {
    files: [
      "apps/web/src/**/*.{js,jsx,ts,tsx}",
      "packages/ui/src/**/*.{js,jsx,ts,tsx}",
      "packages/i18n/src/**/*.{js,jsx,ts,tsx}",
    ],
    plugins: { "react-hooks": reactPlugins["react-hooks"] },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/set-state-in-render": "error",
      "github/no-blur": "off",
      "n/no-callback-literal": "off",
    },
  },
  {
    files: ["**/*.{test,spec,stories}.{js,jsx,ts,tsx,mjs}", "**/__tests__/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "unicorn/no-top-level-assignment-in-function": "off",
      "unicorn/no-this-outside-of-class": "off",
      "no-await-in-loop": "off",
      "sonarjs/no-floating-point-equality": "off",
      "no-template-curly-in-string": "off",
    },
  },
  {
    files: ["**/*.config.{js,ts,mjs}"],
    rules: { "unicorn/no-top-level-side-effects": "off" },
  },
  {
    files: [
      "apps/web/src/pages/project/adapters/{clipboard-memory,snapshots}.ts",
      "apps/gpuix/src/project/adapters/{clipboard-memory,snapshots}.ts",
      "apps/web/src/pages/project/sections/ArrangementPanel/{useGestureCursor,Timeline/drawModeKey}.ts",
      "apps/web/src/shared/native/log-sink.ts",
      "packages/i18n/src/core.ts",
      "packages/ui/src/{Loading,toaster,paste-zone}.tsx",
      "packages/ui/src/motion/animated-toast-stack.tsx",
    ],
    rules: { "unicorn/no-top-level-assignment-in-function": "off" },
  },
  {
    files: gpuixSource,
    plugins: { architecture: localRules },
    rules: { "architecture/gpuix-layers": "error", "architecture/gpuix-imports": "error" },
  },
  {
    // 唯一允许写 SVG 标记的文件;其余手写 SVG 一律由 architecture/gpuix-imports 拦截。
    files: ["apps/gpuix/src/shared/svg/serialise.ts"],
    plugins: { architecture: localRules },
    rules: { "architecture/gpuix-imports": "off" },
  },
  {
    files: source,
    plugins: { architecture: localRules },
    rules: {
      "architecture/boundaries": "error",
      "architecture/public-index": "error",
    },
  },
  {
    files: [
      "apps/web/src/**/*.{tsx,jsx}",
      "packages/ui/src/controls/**/*.{tsx,jsx}",
      "packages/ui/src/button.{tsx,jsx}",
    ],
    ignores: ["**/*.{test,spec,stories}.{tsx,jsx}", "**/__tests__/**"],
    rules: { "architecture/ui-tokens": "error" },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^\\.\\./\\.\\./",
              message: "Use @/ for imports two or more directories above this file.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value=/^[.][.]\\x2F[.][.]\\x2F/]",
          message: "Use @/ for dynamic imports two or more directories above this file.",
        },
      ],
    },
  },
  {
    files: ["packages/ui/src/controls/DragPad/DragPadBase.tsx"],
    rules: {
      "github/a11y-role-supports-aria-props": "off",
      "jsx-a11y/role-supports-aria-props": "off",
    },
  },
  {
    files: ["packages/ui/src/data-table/types.ts"],
    rules: { "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^TData$" }] },
  },
  {
    files: ["packages/ui/src/sidebar.tsx"],
    rules: { "unicorn/no-document-cookie": "off", "sonarjs/pseudo-random": "off" },
  },
  {
    files: [
      "apps/web/src/pages/project/adapters/backend/connection/connection.ts",
      "apps/gpuix/src/project/adapters/backend/connection/connection.ts",
    ],
    rules: { "unicorn/prefer-then-catch": "off" },
  },
  {
    files: ["apps/web/src/pages/project/sections/ArrangementPanel/MiniMap/useMinimapGesture.ts"],
    rules: { "compat/compat": "off" },
  },
  {
    files: ["packages/shared/src/__tests__/**"],
    rules: {
      "import-x/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: true,
          packageDir: [import.meta.dirname, `${import.meta.dirname}/packages/shared`],
        },
      ],
    },
  },
  vendoredProfile([...core, ...react]),
]
