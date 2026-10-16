import { isProductFile } from "./configuration-scope.js"

const VISIBLE_TEXT_ATTRIBUTES = new Set([
  "aria-label",
  "aria-description",
  "label",
  "title",
  "placeholder",
])
const ENGLISH = /[A-Za-z]/u

function reportEnglish(node, value, context) {
  if (ENGLISH.test(value.trim())) context.report({ node, messageId: "untranslatedText" })
}

// Only walk expressions that contribute their literal text to the rendered value.
// In particular, arguments to t() and identifiers are not literal UI copy.
function reportStaticText(node, context) {
  if (!node) return
  switch (node.type) {
    case "Literal":
      if (typeof node.value === "string") reportEnglish(node, node.value, context)
      break
    case "TemplateLiteral":
      for (const quasi of node.quasis) {
        reportEnglish(quasi, quasi.value.cooked ?? quasi.value.raw, context)
      }
      for (const expression of node.expressions) reportStaticText(expression, context)
      break
    case "ConditionalExpression":
      reportStaticText(node.consequent, context)
      reportStaticText(node.alternate, context)
      break
    case "LogicalExpression":
      if (node.operator === "||" || node.operator === "??") reportStaticText(node.left, context)
      reportStaticText(node.right, context)
      break
    case "BinaryExpression":
      if (node.operator === "+") {
        reportStaticText(node.left, context)
        reportStaticText(node.right, context)
      }
      break
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSTypeAssertion":
    case "TSNonNullExpression":
      reportStaticText(node.expression, context)
      break
  }
}

export const gpuixConfigText = {
  meta: {
    type: "problem",
    docs: { description: "Require localized user-visible JSX text in gpuix product files" },
    messages: { untranslatedText: "Translate English text visible in the UI." },
    schema: [],
  },
  create(context) {
    if (!isProductFile(context.filename)) return {}
    return {
      JSXText(node) {
        reportEnglish(node, node.value, context)
      },
      JSXExpressionContainer(node) {
        if (node.parent.type === "JSXElement" || node.parent.type === "JSXFragment") {
          reportStaticText(node.expression, context)
        }
      },
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || !VISIBLE_TEXT_ATTRIBUTES.has(node.name.name)) {
          return
        }
        if (node.value?.type === "Literal") {
          reportStaticText(node.value, context)
        } else if (node.value?.type === "JSXExpressionContainer") {
          reportStaticText(node.value.expression, context)
        }
      },
    }
  },
}
