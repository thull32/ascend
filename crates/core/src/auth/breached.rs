//! Screening new passwords against known breaches, as NIST SP 800-63B-4
//! requires ("compare the prospective secret against a blocklist").
//!
//! Uses Have I Been Pwned's Pwned Passwords range API with k-anonymity: only
//! the first five hex digits of the password's SHA-1 leave the server, and
//! the service answers with every breached hash sharing that prefix (with
//! `Add-Padding`, always 800 to 1,000 lines, so the response size reveals
//! nothing either). The comparison happens here.
//!
//! The check fails open: if the service is slow or down, sign-up proceeds.
//! The blocklist raises the floor; it must not take sign-up down with it.
use std::time::Duration;

use sha1::{Digest, Sha1};

#[derive(Clone)]
pub struct BreachedPasswords {
    client: reqwest::Client,
    base_url: String,
}

impl BreachedPasswords {
    /// `base_url` is normally `https://api.pwnedpasswords.com`.
    pub fn new(base_url: impl Into<String>) -> anyhow::Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .user_agent(concat!("ascend/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self { client, base_url: base_url.into().trim_end_matches('/').to_string() })
    }

    /// `Some(true)` if the password appears in a breach, `Some(false)` if
    /// not, `None` if the service could not be asked.
    pub async fn is_breached(&self, password: &str) -> Option<bool> {
        let hash: String = Sha1::digest(password.as_bytes()).iter().map(|b| format!("{b:02X}")).collect();
        let (prefix, suffix) = hash.split_at(5);
        let response = self
            .client
            .get(format!("{}/range/{prefix}", self.base_url))
            .header("Add-Padding", "true")
            .send()
            .await
            .and_then(reqwest::Response::error_for_status);
        let body = match response {
            Ok(r) => r.text().await,
            Err(e) => Err(e),
        };
        match body {
            Ok(body) => Some(found(&body, suffix)),
            Err(e) => {
                tracing::warn!(error = %e, "breached-password check unavailable; allowing the password");
                None
            }
        }
    }
}

/// Whether `suffix` is listed with a non-zero count (padding lines have 0).
fn found(body: &str, suffix: &str) -> bool {
    body.lines()
        .filter_map(|line| line.trim().split_once(':'))
        .any(|(s, count)| s.eq_ignore_ascii_case(suffix) && count.trim().parse::<u64>().is_ok_and(|n| n > 0))
}

#[cfg(test)]
mod tests {
    use super::found;

    #[test]
    fn padding_lines_do_not_count_as_breaches() {
        let body = "0018A45C4D1DEF81644B54AB7F969B88D65:1\r\nABCDEF0123456789ABCDEF0123456789ABC:0\r\n";
        assert!(found(body, "0018A45C4D1DEF81644B54AB7F969B88D65"));
        assert!(found(body, "0018a45c4d1def81644b54ab7f969b88d65"));
        assert!(!found(body, "ABCDEF0123456789ABCDEF0123456789ABC"), "count 0 is padding");
        assert!(!found(body, "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"));
    }
}
