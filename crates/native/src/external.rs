use napi_derive::napi;
use url::Url;

fn resolve(href: &str, base: Option<&str>) -> Option<Url> {
    let base = base.map(Url::parse).transpose().ok()?;
    let url = match &base {
        Some(base) => base.join(href).ok()?,
        None => Url::parse(href).ok()?,
    };
    if href.trim_start().starts_with('-')
        || !matches!(url.scheme(), "http" | "https")
        || base
            .as_ref()
            .is_some_and(|base| base.origin() == url.origin())
    {
        return None;
    }
    Some(url)
}

#[napi]
pub fn resolve_external_http_url(href: String, base_url: Option<String>) -> Option<String> {
    resolve(&href, base_url.as_deref()).map(String::from)
}

#[napi]
pub fn open_external_http_url(href: String) -> napi::Result<()> {
    let url = resolve(&href, None)
        .ok_or_else(|| napi::Error::from_reason("only absolute http/https URLs may be opened"))?;
    open(&url).map_err(|error| napi::Error::from_reason(error.to_string()))
}

#[cfg(target_os = "macos")]
fn open(url: &Url) -> std::io::Result<()> {
    let status = std::process::Command::new("open")
        .arg(url.as_str())
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(std::io::Error::other(format!("open exited with {status}")))
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open(url: &Url) -> std::io::Result<()> {
    let status = std::process::Command::new("xdg-open")
        .arg(url.as_str())
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(std::io::Error::other(format!(
            "xdg-open exited with {status}"
        )))
    }
}

#[cfg(target_os = "windows")]
fn open(url: &Url) -> std::io::Result<()> {
    use std::{ffi::OsStr, os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let wide: Vec<u16> = OsStr::new(url.as_str())
        .encode_wide()
        .chain(Some(0))
        .collect();
    let operation: Vec<u16> = OsStr::new("open").encode_wide().chain(Some(0)).collect();
    let result = unsafe {
        ShellExecuteW(
            ptr::null_mut(),
            operation.as_ptr(),
            wide.as_ptr(),
            ptr::null(),
            ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if result as usize > 32 {
        Ok(())
    } else {
        Err(std::io::Error::other(format!(
            "ShellExecuteW failed with code {}",
            result as usize
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_external_http_and_rejects_internal_or_unsafe_links() {
        let base = Some("http://localhost/app".to_owned());
        assert_eq!(
            resolve_external_http_url("https://example.com/docs".into(), base.clone()),
            Some("https://example.com/docs".into())
        );
        assert_eq!(
            resolve_external_http_url("/settings".into(), base.clone()),
            None
        );
        assert_eq!(
            resolve_external_http_url("mailto:test@example.com".into(), base.clone()),
            None
        );
        assert_eq!(
            resolve_external_http_url("https://example.com/changelog".into(), base.clone()),
            Some("https://example.com/changelog".into())
        );
        assert_eq!(
            resolve_external_http_url("https://example.com".into(), base),
            Some("https://example.com/".into())
        );
    }

    #[test]
    fn normalizes_tricky_urls_without_shell_interpolation() {
        assert_eq!(
            resolve_external_http_url("file:///tmp/secret".into(), None),
            None
        );
        assert_eq!(
            resolve_external_http_url("javascript:alert(1)".into(), None),
            None
        );
        assert_eq!(
            resolve_external_http_url("https://good.test@evil.test/".into(), None),
            Some("https://good.test@evil.test/".into())
        );
        assert_eq!(
            resolve_external_http_url(
                "http:\\evil.test/path".into(),
                Some("http://localhost/".into())
            ),
            None
        );
        assert_eq!(
            resolve_external_http_url("HTTPS://BÜCHER.de/".into(), None),
            Some("https://xn--bcher-kva.de/".into())
        );
        assert_eq!(
            resolve_external_http_url(" \nhttps://example.com/\t".into(), None),
            Some("https://example.com/".into())
        );
        assert_eq!(
            resolve_external_http_url("https://example.com/?a=1&b=2^3%204`".into(), None),
            Some("https://example.com/?a=1&b=2^3%204`".into())
        );
        assert_eq!(
            resolve_external_http_url("https://example.com/?run=$(echo)%25^&x=`".into(), None),
            Some("https://example.com/?run=$(echo)%25^&x=`".into())
        );
        assert_eq!(
            resolve_external_http_url("-https://example.com/".into(), None),
            None
        );
        assert!(open_external_http_url("javascript:alert(1)".into()).is_err());
    }
}
