use argon2::{Argon2, PasswordHasher, PasswordVerifier};
use std::sync::LazyLock;

use crate::error::{AppError, AppResult};

/// A valid hash of a random password, used to equalise timing when the login
/// email does not exist.
static DUMMY_HASH: LazyLock<String> =
    LazyLock::new(|| hash_sync("ascend-dummy-password-for-timing").expect("dummy hash"));

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

/// Argon2 is deliberately expensive (~19 MiB and tens of ms per call). An
/// unbounded burst of logins would queue unlimited work on the blocking pool
/// and exhaust memory, so at most one hash per CPU runs at a time; the rest
/// wait here (and the auth rate limiter bounds how many can wait).
static HASH_PERMITS: LazyLock<tokio::sync::Semaphore> = LazyLock::new(|| {
    let cpus = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2);
    tokio::sync::Semaphore::new(cpus.max(2))
});

pub async fn hash(password: String) -> AppResult<String> {
    let _permit = HASH_PERMITS.acquire().await.map_err(AppError::internal)?;
    tokio::task::spawn_blocking(move || hash_sync(&password))
        .await
        .map_err(|e| AppError::Internal(format!("join: {e}")))?
}

/// Verifies `password` against `hash`, or against a dummy hash when `hash` is
/// `None`, so both branches cost the same.
pub async fn verify(password: String, hash: Option<String>) -> bool {
    let exists = hash.is_some();
    let Ok(_permit) = HASH_PERMITS.acquire().await else { return false };
    // The dummy hash is read on the blocking pool, inside the permit: its
    // first use computes it, which is Argon2 work like any other.
    let ok = tokio::task::spawn_blocking(move || verify_sync(&password, hash.as_deref().unwrap_or(&DUMMY_HASH)))
        .await
        .unwrap_or(false);
    ok && exists
}

/// Computes the dummy hash at boot, so the first login for an unknown email
/// is not slower than the rest (which would reveal that it is unknown).
pub async fn warm_up() {
    let _permit = HASH_PERMITS.acquire().await;
    let _ = tokio::task::spawn_blocking(|| LazyLock::force(&DUMMY_HASH).len()).await;
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
