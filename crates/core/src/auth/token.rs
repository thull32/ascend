use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use rand::RngExt;
use sha2::{Digest, Sha256};

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub const TOKEN_BYTES: usize = 32;

/// A freshly generated opaque session token (URL-safe base64, 43 chars).
pub fn generate() -> String {
    let mut bytes = [0u8; TOKEN_BYTES];
    rand::rng().fill(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Hex SHA-256 of the token — the only form persisted.
pub fn hash(token: &str) -> String {
    hex(&Sha256::digest(token.as_bytes()))
}

/// Sanity check before hitting the database: rejects garbage cookies cheaply.
pub fn looks_valid(token: &str) -> bool {
    token.len() == 43 && token.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_are_unique_and_valid() {
        let a = generate();
        let b = generate();
        assert_ne!(a, b);
        assert!(looks_valid(&a));
        assert_eq!(hash(&a).len(), 64);
        assert!(!looks_valid("short"));
    }
}
