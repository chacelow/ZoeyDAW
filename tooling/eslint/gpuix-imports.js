import path from "node:path"

/**
 * gpuix 的两条导入与资源规范(写死,见 docs/architecture/gpuix-ui-standards.md「图标与导入」):
 *
 * 1. 不手写 SVG:图标一律来自 `lucide` 包,经 `ui/controls/Icon` 绘制;任何字符串里的 `<svg`/`<path d="…"`
 *    字面量都是手写 SVG。数据驱动的曲线(automation)交给 `svgFromPath`(同样不允许手写字面量)。
 * 2. 跨目录导入用 `@/` 别名,不写超过 2 层的 `../`。同目录与相邻目录(`./`、`../x`、`../../x`)保持相对。
 *
 * 例外只有两处,都集中在能被审计的单一文件里,不在规则里按路径放行:
 * `ui/controls/Icon/index.tsx` 自身要拼 `<svg`,用行内 `eslint-disable-next-line` 并写明原因。
 */
const MAX_PARENT_HOPS = 2
const SVG_LITERAL =
  /<svg[\s>]|<path[\s>]|<circle[\s>]|<rect[\s>]|<polyline[\s>]|<polygon[\s>]|<line[\s>]|<ellipse[\s>]/iu

function isTest(file) {
  return /(?:\.|\/)(?:test|spec)\.[cm]?[jt]sx?$|\/__tests__\//u.test(file.split(path.sep).join("/"))
}

export const gpuixImports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "gpuix: no hand-written SVG literals; deep relative imports must use the @/ alias",
    },
    fixable: "code",
    messages: {
      handWrittenSvg:
        'Hand-written SVG markup is not allowed. Draw icons with <Icon name="…"/> from ui/controls (lucide), and build data-driven curves with a library, not string literals. See docs/architecture/gpuix-ui-standards.md.',
      deepRelative:
        "Relative import '{{source}}' climbs {{hops}} levels. Use the '@/' alias for cross-directory imports (max {{max}} '../').",
    },
    schema: [],
  },
  create(context) {
    const file = context.filename.split(path.sep).join("/")
    if (!file.includes("/apps/gpuix/src/") || isTest(file)) {
      return {}
    }

    function checkImport(node) {
      const value = node.source?.value
      if (typeof value !== "string" || !value.startsWith(".")) {
        return
      }
      const hops = (value.match(/\.\.\//gu) ?? []).length
      if (hops > MAX_PARENT_HOPS) {
        const srcMarker = "/apps/gpuix/src/"
        const srcRoot = file.slice(0, file.indexOf(srcMarker) + srcMarker.length - 1)
        const target = path.posix.resolve(path.posix.dirname(file), value)
        const insideSrc = target.startsWith(`${srcRoot}/`)
        context.report({
          node: node.source,
          messageId: "deepRelative",
          data: { source: value, hops: String(hops), max: String(MAX_PARENT_HOPS) },
          fix: insideSrc
            ? fixer => {
                const quote = node.source.raw[0]
                return fixer.replaceText(
                  node.source,
                  `${quote}@/${target.slice(srcRoot.length + 1)}${quote}`
                )
              }
            : null,
        })
      }
    }

    function checkLiteral(node, text) {
      if (typeof text === "string" && SVG_LITERAL.test(text)) {
        context.report({ node, messageId: "handWrittenSvg" })
      }
    }

    return {
      ImportDeclaration: checkImport,
      ExportNamedDeclaration: checkImport,
      ExportAllDeclaration: checkImport,
      Literal(node) {
        checkLiteral(node, node.value)
      },
      TemplateElement(node) {
        checkLiteral(node, node.value.cooked)
      },
    }
  },
}
