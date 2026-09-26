use argon2::{Argon2, PasswordHasher, PasswordVerifier};
use once_cell::sync::Lazy;

use crate::error::{AppError, AppResult};

/// A valid hash of a random password, used to equalise timing when the login
/// email does not exist.
static DUMMY_HASH: Lazy<String> = Lazy::new(|| hash_sync("ascend-dummy-password-for-timing").expect("dummy hash"));

fn hash_sync(password: &str) -> AppResult<String> {
    // Argon2id, default params (m=19456 KiB, t=2, p=1), random 16-byte salt.
    Argon2::default()
        .hash_password(password.as_bytes())
        .map(|h| h.to_string())
        .map_err(|e| AppError::Internal(format!("hash: {e}")))
}

fn verify_sync(password: &str, hash: &str) -> bool {
    PasswordVerifier::<str>::verify_password(&Argon2::default(), password.as_bytes(), hash).is_ok()
}

pub async fn hash(password: String) -> AppResult<String> {
    tokio::task::spawn_blocking(move || hash_sync(&password))
        .await
        .map_err(|e| AppError::Internal(format!("join: {e}")))?
}

/// Verifies `password` against `hash`, or against a dummy hash when `hash` is
/// `None`, so both branches cost the same.
pub async fn verify(password: String, hash: Option<String>) -> bool {
    let exists = hash.is_some();
    let hash = hash.unwrap_or_else(|| DUMMY_HASH.clone());
    let ok = tokio::task::spawn_blocking(move || verify_sync(&password, &hash)).await.unwrap_or(false);
    ok && exists
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn round_trip() {
        let h = hash("correct horse".into()).await.unwrap();
        assert!(h.starts_with("$argon2id$"));
        assert!(verify("correct horse".into(), Some(h.clone())).await);
        assert!(!verify("wrong".into(), Some(h)).await);
        assert!(!verify("anything".into(), None).await);
    }
}
