const palette =
  /(?:^|[\s:])(?:bg|text|border|border-[trblxy]|ring|outline|fill|stroke|from|via|to|shadow|decoration|caret|accent)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?=$|[\s/])/i
const rawColor = /#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|oklch|oklab|lab|lch)\s*\(/i
const arbitraryColor =
  /(?:^|\s|:)(?:bg|text|border(?:-[trblxy])?|ring|outline|fill|stroke|from|via|to|shadow|decoration|caret|accent)-\[(?!url\()[^\]]*(?:#[\da-f]{3,8}\b|(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch)\()/i
const namedColor = /^(?:white|black|red|blue|green|yellow|orange|purple|pink|gray|grey)$/i
const controlHeight =
  /(?:^|\s|:)(?:h|min-h|max-h|size|text|leading)-(?:\[[^\]]+\]|(?:\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?|px|xs|sm|base|lg|xl|\d+xl))(?=$|\s|\/)/
const controlNames =
  /^(?:DragPad\w*|DropdownButton|PopupButton|PanControl|ControlGroup|PanelShell|PanelDivider)$/
const colorProperties = new Set([
  "color",
  "background",
  "backgroundColor",
  "backgroundImage",
  "borderColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
  "boxShadow",
  "textShadow",
  "fill",
  "stroke",
  "caretColor",
  "accentColor",
])
const dimensionProperties = new Set(["height", "minHeight", "maxHeight", "fontSize", "lineHeight"])

function jsxName(node) {
  return node.type === "JSXIdentifier" ? node.name : ""
}

function keyName(node) {
  if (node.type === "Identifier") {
    return node.name
  }
  return node.type === "Literal" ? String(node.value) : ""
}

function staticChunks(node) {
  if (!node) {
    return []
  }
  switch (node.type) {
    case "Literal": {
      return typeof node.value === "string" ? [node] : []
    }
    case "ConditionalExpression": {
      return [...staticChunks(node.consequent), ...staticChunks(node.alternate)]
    }
    case "LogicalExpression": {
      return [...staticChunks(node.left), ...staticChunks(node.right)]
    }
    case "TemplateLiteral": {
      return [...node.quasis, ...node.expressions.flatMap(staticChunks)]
    }
    case "ObjectExpression": {
      return node.properties.flatMap(property => {
        return property.type === "Property"
          ? [...staticChunks(property.key), ...staticChunks(property.value)]
          : []
      })
    }
    case "CallExpression": {
      return node.arguments.flatMap(staticChunks)
    }
    default: {
      return []
    }
  }
}

function text(node) {
  return node.type === "TemplateElement" ? node.value.raw : String(node.value)
}

function isMetricControl(node) {
  if (controlNames.test(jsxName(node.name))) return true
  if (jsxName(node.name) !== "Button") return false
  const size = node.attributes.find(
    attribute => attribute.type === "JSXAttribute" && jsxName(attribute.name) === "size"
  )
  const value = size?.value?.type === "JSXExpressionContainer" ? size.value.expression : size?.value
  return staticChunks(value).some(chunk =>
    /^(?:control|control-icon|transport-icon)$/u.test(text(chunk))
  )
}

function overridesMetricSize(css) {
  return css
    .split(/\s+/u)
    .some(
      token =>
        !/(?:^|:)(?:before|after):/u.test(token) &&
        !token.includes("var(--") &&
        controlHeight.test(token)
    )
}

export const uiTokens = {
  meta: {
    type: "problem",
    docs: { description: "Use shared visual tokens for JSX UI colors and control dimensions" },
    messages: {
      palette:
        "Raw palette or hard-coded UI color in JSX. Use a semantic theme token (e.g. bg-primary or var(--primary)); document data colors remain dynamic values.",
      controlSize:
        "Shared control height/font override bypasses shared metrics. Set the control's size variant or update packages/ui/src/controls/metrics instead.",
    },
    schema: [],
  },
  create: context => {
    return {
      JSXOpeningElement(node) {
        const control = isMetricControl(node)
        for (const attribute of node.attributes) {
          if (attribute.type !== "JSXAttribute") continue
          const name = jsxName(attribute.name)
          if (name === "className") {
            const value =
              attribute.value?.type === "JSXExpressionContainer"
                ? attribute.value.expression
                : attribute.value
            for (const chunk of staticChunks(value)) {
              const css = text(chunk)
              if (
                palette.test(css) ||
                arbitraryColor.test(css) ||
                /^\s*#[\da-f]{3,8}\s*$/i.test(css)
              ) {
                context.report({ node: chunk, messageId: "palette" })
              }
              if (control && overridesMetricSize(css)) {
                context.report({ node: chunk, messageId: "controlSize" })
              }
            }
          }
          if (name !== "style" || attribute.value?.type !== "JSXExpressionContainer") continue
          const expression = attribute.value.expression
          if (expression.type !== "ObjectExpression") continue
          for (const property of expression.properties) {
            if (property.type !== "Property" || property.computed) continue
            const key = keyName(property.key)
            if (colorProperties.has(key)) {
              for (const chunk of staticChunks(property.value)) {
                const css = text(chunk).trim()
                if (rawColor.test(css) || namedColor.test(css)) {
                  context.report({ node: chunk, messageId: "palette" })
                }
              }
            }
            if (control && dimensionProperties.has(key)) {
              context.report({ node: property, messageId: "controlSize" })
            }
          }
        }
      },
    }
  },
}
