import tailwindcss from "@tailwindcss/vite"
import { mergeConfig } from "vite"
import type { StorybookConfig } from "@storybook/react-vite"

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-themes", "@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
  viteFinal: async existing => {
    return mergeConfig(existing, {
      plugins: [tailwindcss()],
      resolve: {
        dedupe: ["react", "react-dom"],
      },
    })
  },
}

export default config
