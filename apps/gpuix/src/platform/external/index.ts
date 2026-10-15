import { openExternalHttpUrl } from "@zoeydaw/native"

/**
 * Opens an absolute http(s) URL in the system browser. Validation lives in Rust
 * (`crates/native/src/external.rs`, WHATWG `url`); a rejected or failed open throws.
 */
export function openExternalUrl(href: string): void {
  openExternalHttpUrl(href)
}
