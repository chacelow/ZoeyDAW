/**
 * App locales — DAW prototype 阶段只有共享词条。
 */

import sharedZh from "./shared.zh-CN"
import sharedEn from "./shared.en-US"
import arrangementZh from "./arrangement.zh-CN"
import arrangementEn from "./arrangement.en-US"
import type { AppLocaleResources } from "@zoeymind/i18n"

export const appLocales: AppLocaleResources = {
  "zh-CN": { ...sharedZh, arrangement: arrangementZh },
  "en-US": { ...sharedEn, arrangement: arrangementEn },
}
