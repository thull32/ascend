//! Identity of the running build.
//!
//! `ASCEND_BUILD_ID` is set at compile time by the Dockerfile from Railway's
//! `RAILWAY_GIT_COMMIT_SHA` build argument. Local builds fall back to the
//! crate version, which is good enough for a developer's own cache.
use sha2::{Digest, Sha256};

pub const BUILD_ID: &str = match option_env!("ASCEND_BUILD_ID") {
    Some(id) if !id.is_empty() => id,
    _ => concat!("dev-", env!("CARGO_PKG_VERSION")),
};

/// The validator for every content response. It must change whenever the
/// bytes a client would receive could change: the content itself, the code
/// that shapes it (for example which quiz fields are stripped), or the SPA
/// that interprets it. A content-only fingerprint would let a browser keep a
/// cached body across a deploy that changed the response format.
pub fn content_etag(content_version: &str, index_html: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(content_version.as_bytes());
    h.update([0]);
    h.update(BUILD_ID.as_bytes());
    h.update([0]);
    h.update(index_html);
    let digest: String = h.finalize().iter().take(10).map(|b| format!("{b:02x}")).collect();
    format!("\"{digest}\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn etag_changes_with_content_and_with_the_spa() {
        let base = content_etag("abc", b"<html>1</html>");
        assert_eq!(base, content_etag("abc", b"<html>1</html>"));
        assert_ne!(base, content_etag("abd", b"<html>1</html>"));
        assert_ne!(base, content_etag("abc", b"<html>2</html>"));
        assert!(base.starts_with('"') && base.ends_with('"') && base.len() == 22);
    }
}
