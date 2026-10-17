import { useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import {
  List,
  ListRow,
  TreeRow,
  Breadcrumb,
  MotionTabs,
  SettingsNavItem,
  ScrollArea,
} from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import { GallerySection, GalleryVariant, GalleryState } from "./GallerySection"
import type { GallerySectionProps } from "./GallerySection"

export function ListsSection({ t }: GallerySectionProps) {
  const theme = useTheme()
  const [selected, setSelected] = useState("Sounds")
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState("first")
  return (
    <GallerySection id="lists" title={t("Lists and navigation", "列表与导航")}>
      <GalleryVariant label={t("ListRow", "列表行")}>
        {(["default", "selected", "disabled"] as const).map(state => (
          <GalleryState key={state} label={state}>
            <ListRow
              label={t("Sounds", "声音")}
              selected={state === "selected"}
              disabled={state === "disabled"}
              onClick={() => setSelected("Sounds")}
              leading={<Icon name="Folder" />}
              trailing={<Icon name="ChevronRight" />}
            />
          </GalleryState>
        ))}
      </GalleryVariant>
      <GalleryVariant label={t("TreeRow", "树行")}>
        <GalleryState label={t("Collapsed / expanded", "折叠 / 展开")}>
          <TreeRow label={t("Sounds", "声音")} expanded={expanded} onExpandedChange={setExpanded} />
        </GalleryState>
        <GalleryState label={t("Indented selected", "缩进选中")}>
          <TreeRow
            label={t("Character", "音色")}
            depth={1}
            selected
            expanded
            onExpandedChange={setExpanded}
          />
        </GalleryState>
        <GalleryState label={t("Disabled", "禁用")}>
          <TreeRow
            label={t("Devices", "设备")}
            depth={2}
            disabled
            expanded={false}
            onExpandedChange={setExpanded}
          />
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label={t("Breadcrumb", "面包屑")}>
        <Breadcrumb
          label={t("Browser path", "浏览器路径")}
          segments={[
            { id: "sounds", label: t("Sounds", "声音"), onSelect: () => setSelected("Sounds") },
            {
              id: "character",
              label: t("Character", "音色"),
              onSelect: () => setSelected("Character"),
            },
            { id: "devices", label: t("Devices", "设备"), onSelect: () => setSelected("Devices") },
          ]}
        />
        <text>{selected}</text>
      </GalleryVariant>
      <GalleryVariant label={t("MotionTabs", "动画标签页")}>
        <MotionTabs
          value={tab}
          onChange={setTab}
          options={[
            {
              key: "first",
              label: t("Clip", "片段"),
              icon: <Icon name="Music" />,
              content: <text>{t("Clip editor", "片段编辑器")}</text>,
            },
            {
              key: "second",
              label: t("Device", "设备"),
              content: <text>{t("Device chain", "设备链")}</text>,
            },
            { key: "third", label: t("Disabled", "禁用"), disabled: true },
          ]}
        />
      </GalleryVariant>
      <GalleryVariant label={t("Settings navigation", "设置导航")}>
        {["Appearance", "Audio", "Disabled"].map((label, index) => (
          <SettingsNavItem
            key={label}
            item={{
              id: label,
              label: t(label, index === 0 ? "外观" : index === 1 ? "音频" : "禁用"),
              disabled: index === 2,
              icon: <Icon name="Settings" />,
            }}
            selected={selected === label}
            onSelect={setSelected}
          />
        ))}
      </GalleryVariant>
      <GalleryVariant label={t("ScrollArea", "滚动区")}>
        <ScrollArea
          aria-label={t("Scrollable library", "可滚动曲库")}
          style={{
            height: theme.design.fader.lengthUnits * theme.control["--spacing-control-track"],
            width: theme.project.browserResultsWidth,
          }}
        >
          <List aria-label={t("Scrollable library", "可滚动曲库")}>
            {Array.from({ length: 16 }, (_, index) => (
              <ListRow
                key={index}
                label={t("Library item", "曲库项目") + " " + (index + 1)}
                selected={selected === String(index)}
                onClick={() => setSelected(String(index))}
              />
            ))}
          </List>
        </ScrollArea>
      </GalleryVariant>
    </GallerySection>
  )
}
