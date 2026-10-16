import assert from "node:assert/strict"
import { describe, it } from "vitest"
import { Linter, RuleTester } from "eslint"
import * as parser from "@typescript-eslint/parser"
import { gpuixConfigText } from "./gpuix-config-text.js"

RuleTester.describe = describe
RuleTester.it = it

const languageOptions = { parser, parserOptions: { ecmaFeatures: { jsx: true } } }
const tester = new RuleTester({ languageOptions })
const src = "/repo/apps/gpuix/src"
const product = `${src}/app/home/HomePage.tsx`
const violation = { messageId: "untranslatedText" }

function invalid(code, errors = [violation]) {
  return { filename: product, code, errors }
}

tester.run("architecture/gpuix-config-text", gpuixConfigText, {
  valid: [
    { filename: product, code: '<text>{t("home.openAction")}</text>' },
    { filename: product, code: "<text>{t(`home.${mode}`)}</text>" },
    { filename: product, code: "<text>{project.name}</text>" },
    { filename: product, code: '<text>{condition ? t("home.open") : t("home.closed")}</text>' },
    { filename: product, code: "<text>{condition && project.name}</text>" },
    { filename: product, code: '<text>{"  "}{42}{"!?"}中文</text>' },
    { filename: product, code: '<text>{`${t("home.title")} · ${name}`}</text>' },
    {
      filename: product,
      code: '<Button aria-label={t("home.openAction")} label={label} title={project.name} placeholder={t("search.placeholder")} />',
    },
    {
      filename: product,
      code: '<Icon testId="save-project" id="save" type="button" name="Save" icon="search" />',
    },
    { filename: product, code: "<text>\n  \t  中文 ！ 42 \n</text>" },
    {
      filename: product,
      code: '<Button aria-label="中文" aria-description="！42" title={"  "} />',
    },
    // This rule is inert in generated/config data, demos, tests and other packages.
    ...[
      `${src}/app/home/HomePage.test.tsx`,
      `${src}/app/home/HomePage.spec.tsx`,
      `${src}/app/__tests__/HomePage.tsx`,
      `${src}/app/test-helper.tsx`,
      `${src}/verification/probe.tsx`,
      `${src}/project/sections/footer/demo.tsx`,
      `${src}/project/sections/demo/page.tsx`,
      `${src}/ui/gallery/Card.tsx`,
      `${src}/locales/en.tsx`,
      `${src}/shared/theme/metrics/Preview.tsx`,
      `${src}/project/defaults/Preview.tsx`,
      "/repo/apps/other/src/app/HomePage.tsx",
    ].map(filename => ({ filename, code: '<Button title="English">English</Button>' })),
  ],
  invalid: [
    invalid("<text>Open project</text>"),
    invalid("<text> 中文 Open 项目 </text>"),
    invalid('<text>{"Open project"}</text>'),
    invalid("<text>{`Open ${project.name}`}</text>"),
    invalid("<text>{`${project.name} saved`}</text>"),
    invalid('<text>{condition ? "Open" : "Close"}</text>', [violation, violation]),
    invalid('<text>{condition && "Ready"}</text>'),
    invalid('<text>{project.name ?? "Untitled"}</text>'),
    invalid('<text>{"Open " + project.name}</text>'),
    invalid("<text>{`你好 ${name} ready`}</text>"),
    invalid('<Button aria-label="Open project" />'),
    invalid('<Button aria-description={"Save description"} />'),
    invalid("<Button label={`Save ${project.name}`} />"),
    invalid("<Button title={`${project.name} settings`} />"),
    invalid('<input placeholder="Search projects" />'),
    invalid('<Button label={condition ? t("save") : "Discard"} />'),
    invalid('<text>{`Open ${"project"}`}</text>', [violation, violation]),
    invalid('<Button title="Save">Open</Button>', [violation, violation]),
  ],
})

describe("gpuix-config-text activation", () => {
  it("stops reporting the same hard-coded JSX when the rule is switched off", () => {
    const linter = new Linter({ cwd: "/repo" })
    const code = '<Button aria-label="Open project">Open project</Button>'
    const config = severity => [
      {
        files: ["**/*.tsx"],
        languageOptions,
        plugins: { architecture: { rules: { "gpuix-config-text": gpuixConfigText } } },
        rules: { "architecture/gpuix-config-text": severity },
      },
    ]
    const active = linter.verify(code, config("error"), { filename: product })
    assert.deepEqual(
      active.map(message => message.messageId),
      ["untranslatedText", "untranslatedText"]
    )
    assert.deepEqual(linter.verify(code, config("off"), { filename: product }), [])
  })
})
