import { verifyConfigurationMutations } from "./configuration-mutation-runner.mjs"

verifyConfigurationMutations({
  testFiles: [
    "src/project/sections/footer/index.test.tsx",
    "src/project/sections/arrangement/timeline/timeline.test.tsx",
    "src/app/project/useProjectShell.test.tsx",
  ],
  cases: [
    {
      name: "footer-orphan-tabpanel",
      file: "project/sections/footer/index.tsx",
      from: 'role="group"',
      to: 'role="tabpanel"',
      pattern: "selecting a clip keeps Affect Chain visible",
    },
    {
      name: "clip-panel-collapse-reopens",
      file: "app/project/useProjectShell.ts",
      from: "handle.collapse()",
      to: "handle.expand()",
      pattern: "real Clip panel collapses",
    },
    {
      name: "height-only-edit-target-reveal",
      file: "project/sections/arrangement/timeline/controller.ts",
      from: "revealedClip !== current.session.editingClipId",
      to: "true",
      pattern: "footer height changes",
    },
  ],
})
