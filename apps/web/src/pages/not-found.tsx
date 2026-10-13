import { useNavigate } from "react-router-dom"
import { useTranslation } from "@zoeymind/i18n"
import { Button } from "@zoeymind/ui"

export function NotFoundPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-semibold">404</h1>
      <Button onClick={() => navigate("/")}>{t("common.back")}</Button>
    </div>
  )
}
