import { useTheme } from "@/shared/theme/ThemeProvider"
import { Button } from "@/ui/controls"
import { useAppTranslation } from "../i18n"
import { useRouter } from "./router"

export function NotFoundPage() {
  const theme = useTheme()
  const router = useRouter()
  const { t } = useAppTranslation()
  return (
    <div
      testId="not-found-page"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.design.spacing.stackGap,
        width: "100%",
        height: "100%",
        color: theme.colors.foreground,
      }}
    >
      <div
        role="heading"
        aria-level={1}
        style={{
          fontSize: theme.transportControl["--text-control-track"],
          fontWeight: theme.design.typography.weights.semibold,
        }}
      >
        {t("notFound.title")}
      </div>
      <Button label={t("common.back")} onClick={() => router.navigate({ kind: "home" })}>
        {t("common.back")}
      </Button>
    </div>
  )
}
