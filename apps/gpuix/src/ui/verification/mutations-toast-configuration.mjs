import { verifyConfigurationMutations } from "@/app/verification/configuration-mutation-runner.mjs"

const file = "ui/controls/Toaster/index.tsx"
verifyConfigurationMutations({
  testFiles: ["src/ui/controls/Toaster/index.test.tsx"],
  cases: [
    {
      name: "default expiry ignores notification preference",
      file,
      from: "notice.duration ?? policy.defaultDuration",
      to: "notice.duration ?? 4200",
      pattern: "notification policy controls expiry",
    },
    {
      name: "queue capacity ignores notification preference",
      file,
      from: "policy.queueLimit",
      to: "8",
      pattern: "notification policy controls expiry",
    },
    {
      name: "visible count ignores presentation policy",
      file,
      from: "presentation.visibleLimit",
      to: "4",
      pattern: "notification policy controls expiry",
    },
    {
      name: "reconfiguration retains evicted notices",
      file,
      from: "next.queueLimit",
      to: "8",
      pattern: "changing queue policy evicts oldest notices",
    },
    {
      name: "card border ignores theme shape",
      file,
      from: "borderWidth: theme.design.shape.cardBorderWidth",
      to: "borderWidth: 1",
      pattern: "toast card border token changes native content inset",
    },
    ...[
      ["edgeInset", "gap * 3"],
      ["stackGap", "gap * 2"],
      ["inset", "gap * 3"],
      ["width", "304"],
      ["radius", "gap * 2"],
    ].map(([field, literal]) => ({
      name: `toast ${field} ignores its independent geometry source`,
      file,
      from: `metrics.${field}`,
      to: literal,
      pattern: "toast geometry sources control native placement",
    })),
  ],
})
