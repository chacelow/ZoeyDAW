import config from "ultracite/prettier"

const nativeConfig = {
  ...config,
  arrowParens: "avoid",
  printWidth: 100,
  semi: false,
}

delete nativeConfig.tailwindFunctions

export default nativeConfig
