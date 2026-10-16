import { isProductFile } from "./configuration-scope.js"

const STYLE_KEYS =
  /^(?:width|height|minWidth|maxWidth|minHeight|maxHeight|flexBasis|gap|rowGap|columnGap|padding(?:Inline|Block|Left|Right|Top|Bottom)?|margin(?:Inline|Block|Left|Right|Top|Bottom)?|border(?:Radius|Width|TopWidth|BottomWidth|LeftWidth|RightWidth|TopLeftRadius|TopRightRadius|BottomLeftRadius|BottomRightRadius)|outlineWidth|outlineOffset|fontSize|fontWeight|lineHeight|letterSpacing|opacity|duration|delay|top|bottom|left|right|strokeWidth)$/u
const STYLE_NAME = /^(?:styles?|.*Styles?)$/u
const STYLE_CALLS = new Set(["sx", "sv", "mergeStyle", "motion"])
const UNIT_NUMBER = /^-?\d+(?:\.\d+)?(?:px|%|ms|s)$/u
const TS_EXPRESSIONS = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
])
function key(node) {
  if (!node.computed && node.key.type === "Identifier") return node.key.name
  return node.key.type === "Literal" ? String(node.key.value) : ""
}
function styleContext(node, context, seen = new Set()) {
  if (!node || seen.has(node)) return false
  seen.add(node)
  const parent = node.parent
  if (!parent) return false
  if (parent.type === "JSXExpressionContainer" && parent.parent.type === "JSXAttribute")
    return ["style", "transition", "initial", "animate"].includes(parent.parent.name.name)
  if (parent.type === "CallExpression") {
    const callee = parent.callee
    if (callee.type === "Identifier" && STYLE_CALLS.has(callee.name)) return true
  }
  if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier") {
    if (STYLE_NAME.test(parent.id.name)) return true
    const variable = context.sourceCode.getDeclaredVariables(parent)[0]
    return (
      variable?.references.some(
        reference =>
          reference.identifier !== parent.id && styleContext(reference.identifier, context, seen)
      ) ?? false
    )
  }
  if (
    TS_EXPRESSIONS.has(parent.type) ||
    [
      "Property",
      "ObjectExpression",
      "SpreadElement",
      "ArrayExpression",
      "ConditionalExpression",
      "LogicalExpression",
    ].includes(parent.type)
  )
    return styleContext(parent, context, seen)
  return false
}
function literals(node, context, seen = new Set()) {
  if (!node || seen.has(node)) return []
  seen.add(node)
  if (TS_EXPRESSIONS.has(node.type)) return literals(node.expression, context, seen)
  if (node.type === "Literal" && typeof node.value === "number")
    return [{ node, value: node.value }]
  if (node.type === "Literal" && typeof node.value === "string" && UNIT_NUMBER.test(node.value))
    return [{ node, value: node.value }]
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    const value = node.quasis[0].value.cooked ?? node.quasis[0].value.raw
    return UNIT_NUMBER.test(value) ? [{ node, value }] : []
  }
  if (node.type === "Identifier") {
    let scope = context.sourceCode.getScope(node)
    while (scope) {
      const variable = scope.set.get(node.name)
      if (variable)
        return variable.defs.flatMap(def =>
          def.node.type === "VariableDeclarator" ? literals(def.node.init, context, seen) : []
        )
      scope = scope.upper
    }
    return []
  }
  if (node.type === "UnaryExpression") {
    if (!["+", "-", "~"].includes(node.operator)) return []
    if (node.argument.type === "Literal" && typeof node.argument.value === "number") {
      const value = node.argument.value
      return [
        { node, value: node.operator === "-" ? -value : node.operator === "~" ? ~value : value },
      ]
    }
    return literals(node.argument, context, seen)
  }
  if (["BinaryExpression", "LogicalExpression"].includes(node.type))
    return [...literals(node.left, context, seen), ...literals(node.right, context, seen)]
  if (node.type === "ConditionalExpression")
    return [...literals(node.consequent, context, seen), ...literals(node.alternate, context, seen)]
  if (node.type === "CallExpression")
    return node.arguments.flatMap(argument => literals(argument, context, seen))
  return []
}
export const gpuixConfigNumbers = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      literal:
        "Style '{{key}}' contains a numeric literal {{value}}. Read Theme/Layout for configurable values.",
    },
  },
  create(context) {
    if (!isProductFile(context.filename)) return {}
    return {
      Property(node) {
        const name = key(node)
        if (!STYLE_KEYS.test(name) || !styleContext(node, context)) return
        const invalid = literals(node.value, context).find(
          literal =>
            ![-1, 0, 1, "0%", "100%"].includes(literal.value) &&
            !(
              literal.value === 2 &&
              literal.node.parent.type === "BinaryExpression" &&
              ["*", "/"].includes(literal.node.parent.operator)
            )
        )
        if (invalid)
          context.report({
            node: node.value,
            messageId: "literal",
            data: { key: name, value: invalid.value },
          })
      },
    }
  },
}
