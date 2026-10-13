/**
 * SectionCard — Settings 对话框里每段配置的通用卡片外壳。
 *
 * 结构：Card > CardHeader (title + 可选 description) > CardContent (配置项)。
 * 复刻 ZoeyMind 老 Settings 的 SectionCard，用 @zoeymind/ui 的原语保证样式一致。
 */
import type { ReactNode } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@zoeymind/ui"

export interface SectionCardProps {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
}

export function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-sm">{title}</CardTitle>
        {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
