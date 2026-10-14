import path from "node:path"

const sharedPath = "/src/shared/"
const componentPath = "/src/components/"
const libraryPath = "/src/pages/library/"
const modelPath = "/src/pages/project/model/"
const uiPath = "/packages/ui/src/"

function inDirectory(target, directory) {
  return target.endsWith(directory.slice(0, -1)) || target.includes(directory)
}
const runtimeGlobals = new Set([
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
  "fetch",
  "WebSocket",
  "AudioContext",
  "Worker",
])

function normalized(file) {
  return file.split(path.sep).join("/")
}

function targetPath(file, specifier) {
  if (specifier.startsWith("@/")) {
    return normalized(path.resolve(file.slice(0, file.indexOf("/src/")), "src", specifier.slice(2)))
  }
  if (specifier.startsWith(".")) {
    return normalized(path.resolve(path.dirname(file), specifier))
  }
  return specifier === "@zoeymind/ui" || specifier.startsWith("@zoeymind/ui/")
    ? `${file.slice(0, file.indexOf("/apps/web/"))}${uiPath}`
    : specifier
}

function isTest(file) {
  return /(?:\.|\/)(?:test|spec)\.[cm]?[jt]sx?$|\/__tests__\//.test(file)
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

export const architecture = {
  meta: {
    type: "problem",
    docs: {
      description: "Keep shared UI, pure model and project adapters on their dependency side",
    },
    messages: {
      projectPrivate:
        "Shared app/components/library cannot import project-private state ({{source}}). Move the dependency to an app-level composition boundary.",
      modelDependency:
        "Pure project model cannot depend on React, Zustand, Tauri, DOM runtime or UI ({{source}}). Keep effects in adapters.",
      modelGlobal:
        "Pure project model cannot read DOM/runtime global '{{name}}'. Pass required values from an adapter.",
      uiDependency:
        "Shared UI cannot depend on app source ({{source}}). Keep app integration in apps/web.",
    },
    schema: [],
  },
  create(context) {
    const file = normalized(context.filename)
    const test = isTest(file)
    const model = file.includes(modelPath)
    const ui = file.includes(uiPath)
    const shared =
      file.includes(sharedPath) || file.includes(componentPath) || file.includes(libraryPath)
    if ((!model && !ui && !shared) || test) {
      return {}
    }

    function inspect(node, value) {
      if (typeof value !== "string") {
        return
      }
      const target = targetPath(file, value)
      if (
        (shared && target.includes("/apps/web/src/pages/project/")) ||
        (shared && target.endsWith("/apps/web/src/pages/project"))
      ) {
        context.report({ node, messageId: "projectPrivate", data: { source: value } })
      } else if (
        model &&
        (/^(?:react(?:\/|$)|react-dom(?:\/|$)|zustand(?:\/|$)|@tauri-apps\/|@zoeymind\/ui(?:\/|$))/.test(
          value
        ) ||
          inDirectory(target, "/apps/web/src/shared/native/") ||
          inDirectory(target, "/apps/web/src/pages/project/adapters/") ||
          inDirectory(target, "/apps/web/src/pages/project/stores/") ||
          inDirectory(target, "/apps/web/src/components/") ||
          inDirectory(target, "/apps/web/src/pages/project/sections/") ||
          target.includes("/apps/web/src/pages/project/ProjectLayout") ||
          target.includes("/apps/web/src/pages/project/useProjectShell") ||
          target.includes("/apps/web/src/pages/project/project.css") ||
          inDirectory(target, "/apps/web/src/shared/app-shared/") ||
          inDirectory(target, uiPath))
      ) {
        context.report({ node, messageId: "modelDependency", data: { source: value } })
      } else if (
        ui &&
        (target.includes("/apps/") ||
          value.startsWith("@/") ||
          /^(?:@zoeydaw\/web|@zoeymind\/web)(?:\/|$)/.test(value))
      ) {
        context.report({ node, messageId: "uiDependency", data: { source: value } })
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
      ...(model && {
        Identifier(node) {
          if (runtimeGlobals.has(node.name) && isGlobalReference(context, node)) {
            context.report({ node, messageId: "modelGlobal", data: { name: node.name } })
          }
        },
      }),
    }
  },
}
