import config from "ultracite/prettier"

export default {
  ...config,
  arrowParens: "avoid",
  printWidth: 100,
  semi: false,
  plugins: ["prettier-plugin-tailwindcss"],
}
