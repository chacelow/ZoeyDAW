import path from "node:path"

const TIMER_CALLS = new Set(["setInterval", "setTimeout"])
const TIMER_ALLOWED = [
  "/apps/gpuix/src/ui/controls/Toaster/index.tsx",
  "/apps/gpuix/src/project/adapters/backend/mock.ts",
]
const APPEARANCE_OVERRIDES = new Set(["setWindowAppearance", "set_window_appearance"])
const BUSINESS = /\/apps\/gpuix\/src\/(?:app|project\/sections)\//u
const SPACING_KEYS = new Set([
  "gap",
  "rowGap",
  "columnGap",
  "padding",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "paddingBottom",
  "margin",
  "marginLeft",
  "marginRight",
  "marginTop",
  "marginBottom",
])

function normalized(file) {
  return file.split(path.sep).join("/")
}

function isExempt(file) {
  return /(?:\.|\/)(?:test|spec)\.[cm]?[jt]sx?$|\/__tests__\/|test-helper|\/verification\/|\/demo(?:\/|\.tsx?$)/u.test(
    file
  )
}

function calleeName(node) {
  if (node.type === "Identifier") return node.name
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier")
    return node.property.name
  return ""
}

function propertyKey(node) {
  if (node.computed) return ""
  if (node.key.type === "Identifier") return node.key.name
  return node.key.type === "Literal" ? String(node.key.value) : ""
}

function isControlMetric(node) {
  return (
    node.type === "MemberExpression" &&
    node.computed &&
    node.object.type === "MemberExpression" &&
    !node.object.computed &&
    node.object.property.type === "Identifier" &&
    (node.object.property.name === "control" || node.object.property.name === "transportControl")
  )
}

function isNumber(node, predicate) {
  return node.type === "Literal" && typeof node.value === "number" && predicate(node.value)
}

function isTokenMultiple(node) {
  return (
    node.type === "BinaryExpression" &&
    node.operator === "*" &&
    (isNumber(node.right, value => value !== 1) || isNumber(node.left, value => value !== 1))
  )
}

export const gpuixLessons = {
  meta: {
    type: "problem",
    docs: {
      description:
        "gpuix: enforce mechanical LESSONS (no JS timers, no appearance override, no invented shape on business surfaces)",
    },
    messages: {
      jsTimer:
        "'{{name}}' simulates time in JS. Use platform/frame for animation, native events for focus/activation (LESSONS.md). A real wall-clock delay must be added to TIMER_ALLOWED in tooling/eslint/gpuix-lessons.js with a reason.",
      appearanceOverride:
        "'{{name}}' overrides the application appearance and breaks follow-system (LESSONS.md「跟随系统读的是窗口外观」). Theme the content instead.",
      spacingMultiple:
        "'{{key}}: token × N' invents a spacing step. Use the theme.design role for this spacing (spacing/settings/popover/cards). The replacement must keep the rendered size unless the change is intended and pixel-verified; do not borrow a token from another role just to silence this.",
      shapeLiteral:
        "Business surfaces take borderRadius from theme.design (shape/cards/menu/popover) or 0, not a literal or a control metric. Add a design token if none fits.",
    },
    schema: [],
  },
  create(context) {
    const file = normalized(context.filename)
    if (!file.includes("/apps/gpuix/src/") || isExempt(file)) return {}
    const timersAllowed = TIMER_ALLOWED.some(allowed => file.endsWith(allowed))
    const business = BUSINESS.test(file)
    return {
      CallExpression(node) {
        const name = calleeName(node.callee)
        if (TIMER_CALLS.has(name) && !timersAllowed) {
          context.report({ node: node.callee, messageId: "jsTimer", data: { name } })
        } else if (APPEARANCE_OVERRIDES.has(name)) {
          context.report({ node: node.callee, messageId: "appearanceOverride", data: { name } })
        }
      },
      Property(node) {
        if (!business) return
        const key = propertyKey(node)
        if (key === "borderRadius") {
          if (isNumber(node.value, value => value >= 2) || isControlMetric(node.value))
            context.report({ node: node.value, messageId: "shapeLiteral" })
        } else if (SPACING_KEYS.has(key) && isTokenMultiple(node.value)) {
          context.report({ node: node.value, messageId: "spacingMultiple", data: { key } })
        }
      },
    }
  },
}
