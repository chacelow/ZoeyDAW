import { MotionTabs } from "./motionTabs"
import type { TabOption } from "./motionTabs"

export type SortOption = TabOption

interface SortingTabsProperties {
  readonly options: SortOption[]
  readonly defaultSort?: string
  readonly onChange?: (sortKey: string) => void
  readonly className?: string
}

export function SortingTabs({ options, defaultSort, onChange, className }: SortingTabsProperties) {
  return (
    <MotionTabs
      options={options}
      defaultTab={defaultSort}
      onChange={onChange}
      className={className}
      showContent={false}
    />
  )
}
