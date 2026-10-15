import core from "ultracite/eslint/core"
import react from "ultracite/eslint/react"
import {
  gpuixLayers,
  gpuixImports,
  gpuixLessons,
  correctnessProfile,
} from "./tooling/eslint/index.js"

const localRules = {
  rules: {
    "gpuix-layers": gpuixLayers,
    "gpuix-imports": gpuixImports,
    "gpuix-lessons": gpuixLessons,
  },
}

const gpuixSource = ["apps/gpuix/src/**/*.{ts,tsx,js,jsx}"]

export default [
  ...correctnessProfile([...core, ...react]),
  {
    ignores: [".agents/**", ".claude/**", ".github/**"],
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
      "import-x/internal-regex": "^@zoeydaw/",
      "import-x/resolver": {
        typescript: {
          project: ["apps/gpuix/tsconfig.json"],
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
      "apps/gpuix/src/project/adapters/{clipboard-memory,snapshots}.ts",
      "apps/gpuix/src/platform/i18n/core.ts",
    ],
    rules: { "unicorn/no-top-level-assignment-in-function": "off" },
  },
  {
    files: gpuixSource,
    plugins: { architecture: localRules },
    rules: {
      "architecture/gpuix-layers": "error",
      "architecture/gpuix-imports": "error",
      "architecture/gpuix-lessons": "error",
    },
  },
  {
    // 唯一允许写 SVG 标记的文件;其余手写 SVG 一律由 architecture/gpuix-imports 拦截。
    files: ["apps/gpuix/src/shared/svg/serialise.ts"],
    plugins: { architecture: localRules },
    rules: { "architecture/gpuix-imports": "off" },
  },
  {
    files: ["apps/gpuix/src/project/adapters/backend/connection/connection.ts"],
    rules: { "unicorn/prefer-then-catch": "off" },
  },
  {
    // Renderer probes and regressions under scripts/gpuix-main/<slice>/ run against the app's
    // dependency tree (react, @gpuix/*), resolved through a node_modules link to apps/gpuix.
    files: ["scripts/gpuix-main/*/**/*.{ts,tsx}"],
    rules: {
      "import-x/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: true,
          packageDir: [import.meta.dirname, `${import.meta.dirname}/apps/gpuix`],
        },
      ],
      "n/no-extraneous-import": [
        "error",
        { allowModules: ["react", "@gpuix/react", "@gpuix/native"] },
      ],
    },
  },
  {
    // These two shared controls take role from the caller (a composite widget such as the Browser
    // tree gives its rows one Tab entry). Elements without a role are still checked.
    files: [
      "apps/gpuix/src/ui/controls/Button/index.tsx",
      "apps/gpuix/src/ui/controls/DragPreviewArea/index.tsx",
    ],
    rules: {
      "jsx-a11y/no-static-element-interactions": [
        "error",
        { handlers: ["onClick"], allowExpressionValues: true },
      ],
    },
  },
]
