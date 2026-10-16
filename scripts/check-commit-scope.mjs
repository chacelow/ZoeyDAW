import fs from "node:fs"

const MULTI_MARKERS = [
  { pattern: /\s\+\s/, describe: "subject 出现 ' + ': 用加号并列多件事" },
  { pattern: /\s&\s/, describe: "subject 出现 ' & ': 用与号并列多件事" },
  { pattern: /\s和\s/, describe: "subject 出现 ' 和 ': 中文并列" },
  { pattern: /\s与\s/, describe: "subject 出现 ' 与 ': 中文并列" },
]

const CC_TYPES = [
  "feat",
  "fix",
  "chore",
  "refactor",
  "docs",
  "perf",
  "test",
  "build",
  "ci",
  "style",
]

function stripScope(subject) {
  return subject.replaceAll(/\([^)]*\)/g, "")
}

function main() {
  const messageFile = process.argv[2]
  if (!messageFile) {
    process.stderr.write("用法: check-commit-scope.mjs <commit-msg-file>\n")
    process.exit(1)
  }
  const raw = fs.readFileSync(messageFile, "utf-8")
  const line_ = raw.split("\n").find(line => !line.startsWith("#"))
  const subject = line_ ?? ""

  if (
    /^revert\s/i.test(subject) ||
    /^merge\s/i.test(subject) ||
    /^fixup!/i.test(subject) ||
    /^squash!/i.test(subject)
  ) {
    return
  }

  const withoutScope = stripScope(subject)
  const violations = []

  for (const rule of MULTI_MARKERS) {
    if (rule.pattern.test(withoutScope)) {
      violations.push(rule.describe)
    }
  }

  const typePattern = new RegExp(
    `(?:^|[ \\t;,])(${CC_TYPES.join("|")})(?:\\([^)]*\\))?!?:[ \\t]+`,
    "gi"
  )
  const typeHits = [...subject.matchAll(typePattern)].map(match => match[1])
  if (typeHits.length >= 2) {
    violations.push(
      `subject 出现 ${typeHits.length} 个 Conventional Commit 类型 (${typeHits.join(", ")}): ` +
        "一个 commit 应该只有一个类型"
    )
  }

  if (violations.length > 0 && /、/.test(withoutScope)) {
    violations.push("subject 出现 '、' (scope 外): 补充证据, 与其他信号一并出现")
  }

  if (violations.length === 0) {
    return
  }

  process.stderr.write("\nBLOCKED: commit 违反单一职责原则.\n\n")
  process.stderr.write(`  subject: ${subject}\n\n`)
  for (const message of violations) {
    process.stderr.write(`  · ${message}\n`)
  }
  process.stderr.write(
    "\n请把这个 commit 拆成多个独立 commit, 每个只解决一件事:\n" +
      "  git reset HEAD^  (如果已经在 amend / 用 -m 直接提交, 先撤)\n" +
      "  git add -p       (交互式选块)\n" +
      "  git commit -m '...'\n\n" +
      "绕过 (需在 commit-checklist 记录理由): git commit --no-verify\n\n"
  )
  process.exit(1)
}

main()
