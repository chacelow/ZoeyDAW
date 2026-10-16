# Card

`Card` 外观来自 `Theme.design.cards`，边框来自 `Theme.design.shape.cardBorderWidth`。调用方只选择语义 profile 与布局宽度，不逐实例覆写 radius、padding、gap 或 hover。

| `size`     | radius | inset | gap | 内容 gap | inset owner    | hover  |
| ---------- | ------ | ----- | --- | -------- | -------------- | ------ |
| `default`  | 8      | 16    | 16  | 0        | Header/Content | 无     |
| `sm`       | 6      | 12    | 12  | 0        | Header/Content | 无     |
| `controls` | 1      | 4     | 4   | 4        | Header/Content | 无     |
| `project`  | 6      | 12    | 4   | 4        | Card 外壳      | accent |

数值是当前 `DEFAULT_DESIGN_TOKENS`，不是组件内部的另一份配置。radius 与 inset 独立。`insetOwner` 防止 project Card 再包 Header/Content 时叠加内边距；修改该 profile 的一个 `inset` 会同步改变外壳或其内容部件的实际边界。

## 项目卡片

HomePage 当前实例的左右 padding12、gap4、accent hover 属于 `project`，迁移后根实例只保留宽度约束：

```tsx
<Card
  size="project"
  aria-label={project.name}
  onClick={() => open(project)}
  style={{ width: theme.layout.track.controlsWidth }}
>
  <text>{project.name}</text>
  <CardDescription>{openedAt}</CardDescription>
</Card>
```

app-shell owner 负责该业务调用迁移。本切片不改工程打开逻辑、近期工程数据或业务目录。

## 折叠 Header

`CardHeader.disclosure` 是完整的受控对象 `{ expanded, onExpandedChange, label }`。组件内部统一 title 与同档图标 Button 的 row/center 布局，调用方不加 margin 或独立居中样式。Card 以外的状态 owner 决定是否卸载 `CardContent`；Header 不拥有第二份 expanded state。

```tsx
<Card size="controls">
  <CardHeader disclosure={{ expanded, onExpandedChange: setExpanded, label: "Toggle controls" }}>
    <CardTitle>Controls</CardTitle>
  </CardHeader>
  {expanded ? <CardContent>{children}</CardContent> : null}
</Card>
```

普通 Header 保留原有 column 排版。折叠 Button 的 Enter 由自身消费，避免同时触发可点击 Card 的键盘动作。Space 行为沿用 Button。点击遵循 native 事件，不模拟 DOM `stopPropagation`。
