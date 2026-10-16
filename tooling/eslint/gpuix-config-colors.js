import { isProductFile } from "./configuration-scope.js"

const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/iu
const CSS_COLOR = /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(\s*\S[\s\S]*\)$/iu
const STYLE_NAME = /^(?:styles?|.*Styles?)$/u
const STYLE_CALLS = new Set(["sx", "sv", "mergeStyle"])
const STYLE_STATES = new Set([
  "hover",
  "active",
  "focus",
  "focusVisible",
  "disabled",
  "selected",
  "pressed",
  "checked",
  "root",
  "base",
  "default",
  "normal",
])

function keyOf(node) {
  if (node.computed) {
    return node.key.type === "Literal" ? String(node.key.value) : null
  }
  if (node.key.type === "Identifier") return node.key.name
  return node.key.type === "Literal" ? String(node.key.value) : null
}

function colorKey(key) {
  return (
    key === "color" ||
    key === "fill" ||
    key === "stroke" ||
    (typeof key === "string" && /Color$/u.test(key))
  )
}

function styleKey(key) {
  return key === "style" || (typeof key === "string" && STYLE_NAME.test(key))
}

function staticString(node) {
  if (node.type === "Literal" && typeof node.value === "string") return node.value
  if (node.type === "TemplateLiteral" && node.expressions.length === 0)
    return node.quasis[0].value.cooked
  return null
}

function isLiteralColor(node) {
  const text = staticString(node)?.trim()
  return text != null && (HEX_COLOR.test(text) || CSS_COLOR.test(text))
}

export const gpuixConfigColors = {
  meta: {
    type: "problem",
    docs: {
      description: "gpuix: use theme roles instead of literal colors in styles and color props",
    },
    messages: {
      literalColor: "Use a theme color role instead of a literal color in a style or color prop.",
    },
    schema: [],
  },
  create(context) {
    if (!isProductFile(context.filename)) return {}
    const reported = new WeakSet()
    const sourceCode = context.sourceCode

    function report(node) {
      if (!isLiteralColor(node) || reported.has(node)) return
      reported.add(node)
      context.report({ node, messageId: "literalColor" })
    }

    function resolve(node, seen) {
      if (!node) return null
      if (
        node.type === "TSAsExpression" ||
        node.type === "TSSatisfiesExpression" ||
        node.type === "TSNonNullExpression" ||
        node.type === "TSTypeAssertion"
      ) {
        return resolve(node.expression, seen)
      }
      if (node.type === "Identifier") {
        let scope = sourceCode.getScope(node)
        while (scope) {
          const variable = scope.set.get(node.name)
          if (variable) {
            if (seen.has(variable)) return null
            const definition = variable.defs.find(
              def => def.type === "Variable" && def.parent.kind === "const" && def.node.init
            )
            if (!definition) return null
            seen.add(variable)
            return resolve(definition.node.init, seen)
          }
          scope = scope.upper
        }
      }
      if (node.type === "MemberExpression") {
        const key = node.computed
          ? node.property.type === "Literal"
            ? String(node.property.value)
            : null
          : node.property.type === "Identifier"
            ? node.property.name
            : null
        const object = resolve(node.object, seen)
        if (key != null && object?.type === "ObjectExpression") {
          const property = object.properties.find(
            prop => prop.type === "Property" && keyOf(prop) === key
          )
          return property ? resolve(property.value, seen) : null
        }
      }
      return node
    }

    function inspectColor(node, seen = new Set()) {
      const value = resolve(node, seen)
      if (!value) return
      if (value.type === "ConditionalExpression") {
        inspectColor(value.consequent, new Set(seen))
        inspectColor(value.alternate, new Set(seen))
      } else if (value.type === "LogicalExpression") {
        inspectColor(value.left, new Set(seen))
        inspectColor(value.right, new Set(seen))
      } else if (value.type === "SequenceExpression") {
        inspectColor(value.expressions.at(-1), seen)
      } else {
        report(value)
      }
    }

    function inspectVariants(node, seen = new Set()) {
      const variants = resolve(node, seen)
      if (variants?.type !== "ObjectExpression") return
      for (const dimension of variants.properties) {
        if (dimension.type !== "Property") continue
        const options = resolve(dimension.value, new Set(seen))
        if (options?.type !== "ObjectExpression") continue
        for (const option of options.properties) {
          if (option.type === "Property") inspectStyle(option.value, new Set(seen))
        }
      }
    }

    function inspectStyle(node, seen = new Set()) {
      const value = resolve(node, seen)
      if (!value) return
      if (value.type === "ObjectExpression") {
        for (const property of value.properties) {
          if (property.type === "SpreadElement") {
            inspectStyle(property.argument, new Set(seen))
            continue
          }
          if (property.type !== "Property") continue
          const key = keyOf(property)
          if (colorKey(key)) inspectColor(property.value, new Set(seen))
          else if (key === "variants") inspectVariants(property.value, new Set(seen))
          else if (styleKey(key) || STYLE_STATES.has(key)) {
            inspectStyle(property.value, new Set(seen))
          }
        }
      } else if (
        value.type === "CallExpression" &&
        value.callee.type === "Identifier" &&
        STYLE_CALLS.has(value.callee.name)
      ) {
        for (const argument of value.arguments) inspectStyle(argument, new Set(seen))
      } else if (value.type === "ConditionalExpression" || value.type === "LogicalExpression") {
        inspectStyle(value.left ?? value.consequent, new Set(seen))
        inspectStyle(value.right ?? value.alternate, new Set(seen))
      } else if (value.type === "ArrayExpression") {
        for (const element of value.elements) if (element) inspectStyle(element, new Set(seen))
      }
    }

    function inspectProps(node, seen = new Set()) {
      const value = resolve(node, seen)
      if (!value) return
      if (value.type === "ObjectExpression") {
        for (const property of value.properties) {
          if (property.type === "SpreadElement") {
            inspectProps(property.argument, new Set(seen))
          } else if (property.type === "Property") {
            const key = keyOf(property)
            if (colorKey(key)) inspectColor(property.value, new Set(seen))
            else if (styleKey(key)) inspectStyle(property.value, new Set(seen))
          }
        }
      } else if (value.type === "ConditionalExpression" || value.type === "LogicalExpression") {
        inspectProps(value.left ?? value.consequent, new Set(seen))
        inspectProps(value.right ?? value.alternate, new Set(seen))
      }
    }

    return {
      JSXSpreadAttribute(node) {
        inspectProps(node.argument)
      },
      JSXAttribute(node) {
        const key = node.name.name
        if (styleKey(key)) {
          if (node.value?.type === "JSXExpressionContainer") inspectStyle(node.value.expression)
        } else if (colorKey(key) && node.value) {
          inspectColor(
            node.value.type === "JSXExpressionContainer" ? node.value.expression : node.value
          )
        }
      },
      Property(node) {
        if (styleKey(keyOf(node))) inspectStyle(node.value)
      },
      VariableDeclarator(node) {
        if (node.id.type === "Identifier" && STYLE_NAME.test(node.id.name)) inspectStyle(node.init)
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && STYLE_CALLS.has(node.callee.name))
          inspectStyle(node)
      },
    }
  },
}
