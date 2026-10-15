import path from "node:path"

/**
 * gpuix 分层依赖规则,与 `docs/architecture/gpuix.md` 的“目录与依赖方向”一一对应。
 * 规则由下面的 LAYERS 表驱动:新增层只改这张表,不改规则逻辑。
 *
 * 依赖只能向下:app → project/sections → ui → shared;project/adapters → platform。
 */

/** 每个层:路径判定、禁止导入的包、禁止导入的层、禁止的运行时全局。 */
const LAYERS = [
  {
    name: "project/model",
    match: /\/apps\/gpuix\/src\/project\/model\//u,
    // 纯函数与类型:无 React、无状态库、无原生、无 UI。
    forbidPackages: [
      /^react(?:\/|$)/u,
      /^react-dom(?:\/|$)/u,
      /^zustand(?:\/|$)/u,
      /^@gpuix\//u,
      /^@zoeydaw\/native(?:\/|$)/u,
      /^@zoeymind\/ui(?:\/|$)/u,
    ],
    forbidLayers: [
      "project/stores",
      "project/adapters",
      "project/sections",
      "ui",
      "platform",
      "app",
      "shared/theme",
    ],
    forbidGlobals: true,
  },
  {
    name: "project/layout",
    match: /\/apps\/gpuix\/src\/project\/layout\//u,
    forbidPackages: [
      /^react(?:\/|$)/u,
      /^react-dom(?:\/|$)/u,
      /^zustand(?:\/|$)/u,
      /^@gpuix\//u,
      /^@zoeydaw\/native(?:\/|$)/u,
    ],
    forbidLayers: [
      "project/stores",
      "project/adapters",
      "project/sections",
      "ui",
      "platform",
      "app",
      "shared/theme",
    ],
    forbidGlobals: true,
  },
  {
    name: "project/stores",
    match: /\/apps\/gpuix\/src\/project\/stores\//u,
    forbidPackages: [
      /^react-dom(?:\/|$)/u,
      /^@gpuix\//u,
      /^@zoeydaw\/native(?:\/|$)/u,
      /^@zoeymind\/ui(?:\/|$)/u,
    ],
    forbidLayers: ["project/adapters", "project/sections", "ui", "platform", "app", "shared/theme"],
    forbidGlobals: true,
  },
  {
    name: "project/adapters",
    match: /\/apps\/gpuix\/src\/project\/adapters\//u,
    // adapters 经 platform 接口使用外部能力,自身不碰渲染、原生二进制或 UI。
    forbidPackages: [
      /^react-dom(?:\/|$)/u,
      /^@gpuix\//u,
      /^@zoeydaw\/native(?:\/|$)/u,
      /^@zoeymind\/ui(?:\/|$)/u,
    ],
    forbidLayers: ["project/sections", "ui", "app", "shared/theme"],
    forbidGlobals: true,
  },
  {
    name: "project/sections",
    match: /\/apps\/gpuix\/src\/project\/sections\//u,
    // 面板经 adapters 使用工程能力,经 platform 的 TS 端口(帧、窗口激活、剪贴板、键盘、光标)使用原生能力;
    // 不直接调原生二进制,不依赖组合根或旧 Web UI 包。
    forbidPackages: [
      /^react-dom(?:\/|$)/u,
      /^zustand(?:\/|$)/u,
      /^@zoeydaw\/native(?:\/|$)/u,
      /^@zoeymind\/ui(?:\/|$)/u,
    ],
    forbidLayers: ["app"],
    forbidGlobals: true,
  },
  {
    name: "ui",
    match: /\/apps\/gpuix\/src\/ui\//u,
    // 共享 UI 不认识工程,也不直接调原生二进制。
    forbidPackages: [
      /^react-dom(?:\/|$)/u,
      /^zustand(?:\/|$)/u,
      /^@zoeydaw\/native(?:\/|$)/u,
      /^@zoeymind\/ui(?:\/|$)/u,
    ],
    forbidLayers: ["project", "platform", "app"],
    forbidGlobals: true,
  },
  {
    name: "platform",
    match: /\/apps\/gpuix\/src\/platform\//u,
    forbidPackages: [/^react-dom(?:\/|$)/u, /^@gpuix\//u],
    forbidLayers: ["project", "ui", "app", "shared/theme"],
    forbidGlobals: true,
  },
  {
    name: "shared/theme",
    match: /\/apps\/gpuix\/src\/shared\//u,
    forbidPackages: [/^react-dom(?:\/|$)/u, /^zustand(?:\/|$)/u, /^@zoeydaw\/native(?:\/|$)/u],
    forbidLayers: ["project", "ui", "platform", "app"],
    forbidGlobals: true,
  },
]

/** 层的目录前缀,用于把导入目标解析成层名。更具体的前缀排在前面。 */
const LAYER_ROOTS = [
  ["project/model", "/apps/gpuix/src/project/model"],
  ["project/layout", "/apps/gpuix/src/project/layout"],
  ["project/stores", "/apps/gpuix/src/project/stores"],
  ["project/adapters", "/apps/gpuix/src/project/adapters"],
  ["project/sections", "/apps/gpuix/src/project/sections"],
  ["project", "/apps/gpuix/src/project"],
  ["ui", "/apps/gpuix/src/ui"],
  ["platform", "/apps/gpuix/src/platform"],
  ["shared/theme", "/apps/gpuix/src/shared"],
  ["app", "/apps/gpuix/src/app"],
]

/** 被判为“DOM/浏览器运行时”的全局名。gpuix 没有这些全局,出现即是移植遗留。 */
const RUNTIME_GLOBALS = new Set([
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "HTMLElement",
  "Element",
  "Node",
  "ResizeObserver",
  "MutationObserver",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "WebSocket",
  "AudioContext",
  "Worker",
])

function normalized(file) {
  return file.split(path.sep).join("/")
}

function isTest(file) {
  return /(?:\.|\/)(?:test|spec)\.[cm]?[jt]sx?$|\/__tests__\//u.test(file)
}

/** `@/` 是 apps/gpuix/src 的别名(见 apps/gpuix/tsconfig.json 的 paths);别名与相对路径指向同一层,不能绕过分层。 */
const SRC_ALIAS = "@/"

function resolveTarget(file, specifier) {
  if (specifier.startsWith(SRC_ALIAS)) {
    const srcRoot = file.slice(0, file.indexOf("/apps/gpuix/src/") + "/apps/gpuix/src".length)
    return normalized(`${srcRoot}/${specifier.slice(SRC_ALIAS.length)}`)
  }
  return specifier.startsWith(".")
    ? normalized(path.resolve(path.dirname(file), specifier))
    : specifier
}

function layerOf(target) {
  for (const [name, root] of LAYER_ROOTS) {
    if (target.includes(`${root}/`) || target.endsWith(root)) {
      return name
    }
  }
  return null
}

/** `forbidLayers` 里的 "project" 表示整个 project 子树;"project/model" 只表示该子层。 */
function layerForbidden(forbid, targetLayer) {
  return forbid.some(item => targetLayer === item || targetLayer.startsWith(`${item}/`))
}

/**
 * 全局引用 = 解析不到任何声明。属性访问 `state.document.tracks` 与局部变量 `document`
 * 都不会被判为全局,这是用 ESLint 作用域分析而不是文本 grep 的原因。
 */
function isGlobalReference(context, node) {
  let scope = context.sourceCode.getScope(node)
  while (scope) {
    const reference = scope.references.find(item => item.identifier === node)
    if (reference) {
      return !reference.resolved || reference.resolved.defs.length === 0
    }
    scope = scope.upper
  }
  return false
}

export const gpuixLayers = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce the gpuix layer dependency direction from docs/architecture/gpuix.md",
    },
    messages: {
      forbiddenPackage:
        "Layer '{{layer}}' cannot depend on package '{{source}}'. See docs/architecture/gpuix.md.",
      forbiddenLayer:
        "Layer '{{layer}}' cannot depend on layer '{{target}}' ({{source}}). Dependencies point down: app → project/sections → ui → shared; project/adapters → platform.",
      runtimeGlobal:
        "Layer '{{layer}}' cannot read browser/DOM global '{{name}}'. gpuix has no DOM; pass the value in through a platform port.",
    },
    schema: [],
  },
  create(context) {
    const file = normalized(context.filename)
    if (isTest(file)) {
      return {}
    }
    const layer = LAYERS.find(item => item.match.test(file))
    if (!layer) {
      return {}
    }

    function inspect(node, value) {
      if (typeof value !== "string") {
        return
      }
      if (layer.forbidPackages.some(pattern => pattern.test(value))) {
        context.report({
          node,
          messageId: "forbiddenPackage",
          data: { layer: layer.name, source: value },
        })
        return
      }
      const target = resolveTarget(file, value)
      const targetLayer = layerOf(target)
      if (
        targetLayer &&
        targetLayer !== layer.name &&
        layerForbidden(layer.forbidLayers, targetLayer)
      ) {
        context.report({
          node,
          messageId: "forbiddenLayer",
          data: { layer: layer.name, target: targetLayer, source: value },
        })
      }
    }

    return {
      ImportDeclaration(node) {
        inspect(node.source, node.source.value)
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          inspect(node.source, node.source.value)
        }
      },
      ExportAllDeclaration(node) {
        inspect(node.source, node.source.value)
      },
      ImportExpression(node) {
        if (node.source.type === "Literal") {
          inspect(node.source, node.source.value)
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments[0]?.type === "Literal"
        ) {
          inspect(node.arguments[0], node.arguments[0].value)
        }
      },
      ...(layer.forbidGlobals && {
        Identifier(node) {
          if (RUNTIME_GLOBALS.has(node.name) && isGlobalReference(context, node)) {
            context.report({
              node,
              messageId: "runtimeGlobal",
              data: { layer: layer.name, name: node.name },
            })
          }
        },
      }),
    }
  },
}
