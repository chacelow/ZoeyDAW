import path from "node:path"

const LAYERS = [
  {
    name: "project/model",
    match: /\/apps\/gpuix\/src\/project\/model\//u,
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
    allowLayers: ["shared/theme/metrics"],
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
    name: "shared/keyboard",
    match: /\/apps\/gpuix\/src\/shared\/keyboard\//u,
    forbidPackages: [
      /^react(?:\/|$)/u,
      /^react-dom(?:\/|$)/u,
      /^zustand(?:\/|$)/u,
      /^@gpuix\//u,
      /^@zoeydaw\/native(?:\/|$)/u,
    ],
    forbidLayers: ["project", "ui", "platform", "app", "shared/theme"],
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

const LAYER_ROOTS = [
  ["project/model", "/apps/gpuix/src/project/model"],
  ["project/layout", "/apps/gpuix/src/project/layout"],
  ["project/stores", "/apps/gpuix/src/project/stores"],
  ["project/adapters", "/apps/gpuix/src/project/adapters"],
  ["project/sections", "/apps/gpuix/src/project/sections"],
  ["project", "/apps/gpuix/src/project"],
  ["ui", "/apps/gpuix/src/ui"],
  ["platform", "/apps/gpuix/src/platform"],
  ["shared/keyboard", "/apps/gpuix/src/shared/keyboard"],
  ["shared/theme/metrics", "/apps/gpuix/src/shared/theme/metrics"],
  ["shared/theme", "/apps/gpuix/src/shared"],
  ["app", "/apps/gpuix/src/app"],
]

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

const SRC_ALIAS = "@/"

function resolveTarget(file, specifier) {
  if (specifier.startsWith(SRC_ALIAS)) {
    const srcRoot = file.slice(0, file.indexOf("/apps/gpuix/src/") + "/apps/gpuix/src".length)
    return normalized(path.resolve(srcRoot, specifier.slice(SRC_ALIAS.length)))
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

function layerForbidden(forbid, targetLayer) {
  return forbid.some(item => targetLayer === item || targetLayer.startsWith(`${item}/`))
}

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
    const layer =
      LAYERS.find(item => item.match.test(file)) ??
      (file.includes("/apps/gpuix/src/")
        ? { name: "gpuix", forbidPackages: [], forbidLayers: [], forbidGlobals: true }
        : null)
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
        !layer.allowLayers?.includes(targetLayer) &&
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
