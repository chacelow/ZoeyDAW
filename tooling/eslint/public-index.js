const entrypoints = [
  /\/apps\/web\/src\/pages\/project\/adapters\/index\.ts$/u,
  /\/tooling\/eslint\/index\.js$/u,
  /\/apps\/web\/src\/pages\/project\/adapters\/(?:backend\/connection|runtime)\/index\.ts$/,
  /\/apps\/web\/src\/shared\/control-interactions\/index\.ts$/,
  /\/apps\/web\/src\/pages\/project\/model\/midi-editing\/index\.ts$/,
  /\/apps\/web\/src\/pages\/project\/(?:layout|sections\/ArrangementPanel\/layout)\/index\.ts$/,
  /\/packages\/ui\/src\/controls\/metrics\/index\.ts$/,
]

export const publicIndex = {
  meta: {
    type: "problem",
    docs: { description: "Keep selected module indexes as public re-export surfaces" },
    messages: {
      exportsOnly:
        "This module index is a public export surface. Put implementation in a sibling file and re-export it here.",
    },
    schema: [],
  },
  create(context) {
    const file = context.filename.replaceAll("\\", "/")
    if (entrypoints.every(pattern => !pattern.test(file))) {
      return {}
    }
    return {
      Program(node) {
        for (const statement of node.body) {
          if (
            (statement.type === "ExportNamedDeclaration" &&
              statement.source?.value?.startsWith(".")) ||
            (statement.type === "ExportAllDeclaration" && statement.source.value.startsWith("."))
          ) {
            continue
          }
          context.report({ node: statement, messageId: "exportsOnly" })
        }
      },
    }
  },
}
