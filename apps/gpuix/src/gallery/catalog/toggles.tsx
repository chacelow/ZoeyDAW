import { useState } from "react"
import {
  Checkbox,
  Switch,
  RadioGroup,
  RadioGroupItem,
  ToggleGroup,
  ToggleGroupItem,
  Chip,
  DragPadToggle,
} from "@/ui/controls"
import { GallerySection, GalleryVariant, GalleryState } from "./GallerySection"
import type { GallerySectionProps } from "./GallerySection"

export function TogglesSection({ t }: GallerySectionProps) {
  const [checked, setChecked] = useState<boolean | "mixed">("mixed")
  const [on, setOn] = useState(false)
  const [radio, setRadio] = useState("a")
  const [selected, setSelected] = useState("Auto")
  const [tags, setTags] = useState(["Drums", "Hardware Control", "Racks"])
  const [multiples, setMultiples] = useState(["x1"])
  return (
    <GallerySection id="toggles" title={t("Switches and selection", "开关与选择")}>
      <GalleryVariant label={t("Switch", "开关")}>
        <GalleryState label={t("Default", "默认")}>
          <Switch label={t("Monitor", "监听")} checked={on} onCheckedChange={setOn} />
        </GalleryState>
        <GalleryState label={t("On", "开启")}>
          <Switch
            label={t("Enabled", "已开启")}
            checked={!on}
            onCheckedChange={value => setOn(!value)}
          />
        </GalleryState>
        <GalleryState label={t("Disabled", "禁用")}>
          <Switch
            label={t("Unavailable", "不可用")}
            checked={false}
            onCheckedChange={setOn}
            disabled
          />
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label={t("Checkbox", "复选框")}>
        <GalleryState label={t("Mixed → checked", "混合 → 选中")}>
          <Checkbox
            label={t("Mixed selection", "混合选择")}
            checked={checked}
            onCheckedChange={setChecked}
          />
        </GalleryState>
        <GalleryState label={t("Unchecked", "未选中")}>
          <Checkbox label={t("Unchecked", "未选中")} checked={false} onCheckedChange={setChecked} />
        </GalleryState>
        <GalleryState label={t("Checked", "选中")}>
          <Checkbox label={t("Checked", "选中")} checked={true} onCheckedChange={setChecked} />
        </GalleryState>
        <GalleryState label={t("Disabled mixed", "禁用混合")}>
          <Checkbox
            label={t("Disabled", "禁用")}
            checked="mixed"
            onCheckedChange={setChecked}
            disabled
          />
        </GalleryState>
        <GalleryState label={t("Invalid", "无效")}>
          <Checkbox
            label={t("Invalid", "无效")}
            checked={false}
            onCheckedChange={setChecked}
            invalid
          />
        </GalleryState>
      </GalleryVariant>
      {(["horizontal", "vertical"] as const).map(orientation => (
        <GalleryVariant key={orientation} label={t("Radio group", "单选组") + " · " + orientation}>
          {([false, true] as const).map(disabled => (
            <GalleryState
              key={String(disabled)}
              label={disabled ? t("Disabled", "禁用") : t("Selected / default", "选中 / 默认")}
            >
              <RadioGroup
                aria-label={t("Radio selection", "单选")}
                value={radio}
                onValueChange={setRadio}
                orientation={orientation}
                disabled={disabled}
              >
                <RadioGroupItem value="a">{t("A", "甲")}</RadioGroupItem>
                <RadioGroupItem value="b">{t("B", "乙")}</RadioGroupItem>
              </RadioGroup>
            </GalleryState>
          ))}
        </GalleryVariant>
      ))}
      {(["default", "outline", "segmented"] as const).map(variant => (
        <GalleryVariant key={variant} label={t("Toggle group", "切换组") + " · " + variant}>
          {([false, true] as const).map(disabled => (
            <GalleryState
              key={String(disabled)}
              label={disabled ? t("Disabled", "禁用") : t("Single selection", "单选")}
            >
              <ToggleGroup
                type="single"
                variant={variant}
                value={selected}
                onValueChange={setSelected}
                disabled={disabled}
              >
                {["In", "Auto", "Off"].map(value => (
                  <ToggleGroupItem key={value} value={value}>
                    {t(value, value === "In" ? "输入" : value === "Auto" ? "自动" : "关闭")}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </GalleryState>
          ))}
        </GalleryVariant>
      ))}
      <GalleryVariant label={t("Filter segments", "滤波分段")}>
        <ToggleGroup type="single" variant="segmented" value={selected} onValueChange={setSelected}>
          {["LP", "LP2", "HP", "BP", "NT"].map(value => (
            <ToggleGroupItem key={value} value={value}>
              {value}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </GalleryVariant>
      <GalleryVariant label={t("Rate segments", "倍率分段")}>
        <ToggleGroup type="single" variant="segmented" value={selected} onValueChange={setSelected}>
          {["x1", "x5"].map(value => (
            <ToggleGroupItem key={value} value={value}>
              {value}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </GalleryVariant>
      <GalleryVariant label={t("Multiple / vertical", "多选 / 垂直")}>
        <ToggleGroup
          type="multiple"
          orientation="vertical"
          value={multiples}
          onValueChange={setMultiples}
        >
          {["x1", "x5"].map(value => (
            <ToggleGroupItem key={value} value={value}>
              {value}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </GalleryVariant>
      <GalleryVariant label={t("Chip", "标签")}>
        {tags.map(tag => (
          <GalleryState key={tag} label={t("Selectable / removable", "可选择 / 移除")}>
            <Chip
              label={tag}
              selected={selected === tag}
              onSelectedChange={() => setSelected(tag)}
              remove={{
                label: t("Remove", "移除") + " " + tag,
                onRemove: () => setTags(current => current.filter(value => value !== tag)),
              }}
            >
              {tag}
            </Chip>
          </GalleryState>
        ))}
        <GalleryState label={t("Disabled", "禁用")}>
          <Chip disabled selected>
            {t("Racks", "机架")}
          </Chip>
        </GalleryState>
      </GalleryVariant>
      <GalleryVariant label={t("DragPadToggle", "数值切换")}>
        <DragPadToggle
          value={on}
          onChange={setOn}
          label={t("Power", "电源")}
          labelOn={t("On", "开启")}
          labelOff={t("Off", "关闭")}
        />
        <DragPadToggle
          disabled
          value={!on}
          onChange={setOn}
          label={t("Disabled", "禁用")}
          labelOn={t("On", "开启")}
          labelOff={t("Off", "关闭")}
        />
      </GalleryVariant>
    </GallerySection>
  )
}
