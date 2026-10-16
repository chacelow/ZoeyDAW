/** Configuration data and executable verification fixtures are not product call sites. */
export function isProductFile(filename) {
  const file = filename.replaceAll("\\", "/")
  return (
    file.includes("/apps/gpuix/src/") &&
    !/(?:\.|\/)(?:test|spec)\.[cm]?[jt]sx?$|\/__tests__\/|test-helper|\/verification\/|\/demo(?:\/|\.[cm]?[jt]sx?$)|\/gallery\/|\/ui\/panels\/PanelGallery\/|\/locales\/|\/project\/defaults\//u.test(
      file
    ) &&
    !/\/shared\/theme\/(?:metrics\/|.*\.json$|(?:design-tokens|design-details|layout-tokens|color-recipes|presets\.data)\.[cm]?[jt]s$)/u.test(
      file
    )
  )
}
