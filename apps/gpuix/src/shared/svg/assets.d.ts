// Third-party SVG assets are imported as text (`with { type: "text" }`); they are data from a package,
// not markup written in this repo.
declare module "@phosphor-icons/core/assets/*.svg" {
  const markup: string
  export default markup
}
