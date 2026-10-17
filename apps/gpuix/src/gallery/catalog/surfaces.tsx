import { useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  ControlGroup,
  Separator,
  DeviceHeader,
  SettingsShell,
} from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import { GallerySection, GalleryVariant, GalleryState } from "./GallerySection"
import type { GallerySectionProps } from "./GallerySection"

export function SurfacesSection({ t }: GallerySectionProps) {
  const theme = useTheme()
  const [enabled, setEnabled] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [settings, setSettings] = useState(false)
  const [active, setActive] = useState("appearance")
  return (
    <GallerySection id="surfaces" title={t("Containers", "容器")}>
      {(["default", "sm", "controls", "project"] as const).map(size => (
        <GalleryVariant key={size} label={t("Card", "卡片") + " · " + size}>
          <Card size={size}>
            <CardHeader>
              <CardTitle>{t("Card title", "卡片标题")}</CardTitle>
              <CardDescription>{t("Description", "说明")}</CardDescription>
            </CardHeader>
            <CardContent>
              <text>{t("Content owned inset", "内容自有内边距")}</text>
            </CardContent>
          </Card>
        </GalleryVariant>
      ))}
      {(["toolbar", "joined"] as const).flatMap(variant =>
        (["none", "slash", "dot", "line"] as const).map(separator => (
          <GalleryVariant
            key={variant + separator}
            label={"ControlGroup · " + variant + " · " + separator}
          >
            <ControlGroup
              variant={variant}
              separator={separator}
              label={t("Control group", "控件组")}
            >
              <text>{t("One", "一")}</text>
              <text>{t("Two", "二")}</text>
              <text>{t("Three", "三")}</text>
            </ControlGroup>
          </GalleryVariant>
        ))
      )}
      <GalleryVariant label={t("Separator", "分隔线")}>
        <div style={{ width: theme.project.identityWidth }}>
          <Separator />
        </div>
        <div style={{ height: theme.control["--spacing-control-track"] }}>
          <Separator orientation="vertical" />
        </div>
      </GalleryVariant>
      <GalleryVariant label={t("DeviceHeader", "设备标题栏")}>
        <GalleryState label={t("Expanded · interactive", "展开 · 可交互")}>
          <DeviceHeader
            title={t("Auto Filter", "自动滤波")}
            enabled={enabled}
            onEnabledChange={setEnabled}
            collapsed={collapsed}
            onCollapsedChange={setCollapsed}
            labels={{
              activator: t("Device activator", "设备开关"),
              collapse: t("Collapse device", "折叠设备"),
            }}
            actions={
              <Button
                iconOnly
                label={t("Device actions", "设备操作")}
                icon={<Icon name="Ellipsis" />}
                onClick={() => setEnabled(value => !value)}
              />
            }
          />
        </GalleryState>
        <GalleryState label={t("Collapsed / bypassed", "折叠 / 旁通")}>
          <DeviceHeader
            title={t("Delay", "延迟")}
            enabled={false}
            onEnabledChange={setEnabled}
            collapsed
            onCollapsedChange={setCollapsed}
            labels={{
              activator: t("Device activator", "设备开关"),
              collapse: t("Expand device", "展开设备"),
            }}
          />
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label={t("SettingsShell", "设置外壳")}>
        <Button testId="gallery-open-settings" onClick={() => setSettings(true)}>
          {t("Open settings example", "打开设置示例")}
        </Button>
        <SettingsShell
          testId="gallery-settings-preview"
          style={{ width: theme.layout.gallery.settingsPreviewWidth, flexShrink: 0 }}
          open={settings}
          onOpenChange={setSettings}
          title={t("Settings", "设置")}
          closeLabel={t("Close settings", "关闭设置")}
          navigationLabel={t("Settings navigation", "设置导航")}
          activeId={active}
          onActiveChange={setActive}
          items={[
            {
              id: "appearance",
              label: t("Appearance", "外观"),
              content: <text>{t("Theme settings", "主题设置")}</text>,
            },
            {
              id: "audio",
              label: t("Audio", "音频"),
              content: <text>{t("Audio settings", "音频设置")}</text>,
            },
          ]}
        />
      </GalleryVariant>
    </GallerySection>
  )
}
