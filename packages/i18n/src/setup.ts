/** i18next 单例的 React 绑定。资源增量合并；语言由宿主注入，不读取 DOM。非 React 部分见 `./core`。 */

import { initReactI18next } from "react-i18next"
import { initI18nCore } from "./core"
import type { AppLocaleResources, InitI18nOptions } from "./core"
import type i18next from "i18next"

export {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  resolveLocale,
  persistLocale,
  type SupportedLocale,
  type I18nStorage,
  type AppLocaleResources,
} from "./core"

/** `initI18nCore` with the react-i18next plugin bound on first initialization. */
export function initI18n(
  appResources?: AppLocaleResources,
  options?: InitI18nOptions
): typeof i18next {
  return initI18nCore(appResources, options, [initReactI18next])
}

export { default as i18next } from "i18next"
