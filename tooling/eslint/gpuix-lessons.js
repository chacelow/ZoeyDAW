import path from "node:path"

/**
 * Mechanical LESSONS.md entries enforced as lint, so they are not rediscovered in review.
 *
 * 1. No JS timers standing in for native events (LESSONS「光标锁定」「gpuix 0.10.0 的原生缺口」; B2 公共契约
 *    「不要用 JS 定时器/轮询去模拟原生事件」). Frames come from platform/frame, focus and activation from
 *    native events. A genuine wall-clock delay (toast auto-dismiss) or the mock backend's tick is
 *    allowed only in the files listed here, so every exception stays auditable in one place.
 * 2. No application-level window appearance override (LESSONS「跟随系统读的是窗口外观」): once set,
 *    `onWindowAppearanceChange` reports our own value and "follow system" silently stops working.
 */
const TIMER_CALLS = new Set(["setInterval", "setTimeout"])
const TIMER_ALLOWED = [
  // Toast auto-dismiss is a user-facing duration, not a substitute for a native event.
  "/apps/gpuix/src/ui/controls/Toaster/index.tsx",
  // The mock backend simulates engine telemetry ticks for tests and demos only.
  "/apps/gpuix/src/project/adapters/backend/mock.ts",
]
const APPEARANCE_OVERRIDES = new Set(["setWindowAppearance", "set_window_appearance"])

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

export const gpuixLessons = {
  meta: {
    type: "problem",
    docs: {
      description: "gpuix: enforce mechanical LESSONS (no JS timers, no appearance override)",
    },
    messages: {
      jsTimer:
        "'{{name}}' simulates time in JS. Use platform/frame for animation, native events for focus/activation (LESSONS.md). A real wall-clock delay must be added to TIMER_ALLOWED in tooling/eslint/gpuix-lessons.js with a reason.",
      appearanceOverride:
        "'{{name}}' overrides the application appearance and breaks follow-system (LESSONS.md「跟随系统读的是窗口外观」). Theme the content instead.",
    },
    schema: [],
  },
  create(context) {
    const file = normalized(context.filename)
    if (!file.includes("/apps/gpuix/src/") || isExempt(file)) return {}
    const timersAllowed = TIMER_ALLOWED.some(allowed => file.endsWith(allowed))
    return {
      CallExpression(node) {
        const name = calleeName(node.callee)
        if (TIMER_CALLS.has(name) && !timersAllowed) {
          context.report({ node: node.callee, messageId: "jsTimer", data: { name } })
        } else if (APPEARANCE_OVERRIDES.has(name)) {
          context.report({ node: node.callee, messageId: "appearanceOverride", data: { name } })
        }
      },
    }
  },
}
