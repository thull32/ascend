//! Authentication primitives and the auth service.
//!
//! * Passwords: Argon2id with the crate's recommended parameters. Hashing runs
//!   on the blocking pool because it is deliberately slow (~100ms).
//! * Sessions: 256-bit random opaque tokens. The cookie carries the token; the
//!   database stores only its SHA-256, so a DB leak cannot forge sessions.
//! * Breaches: new passwords are screened against Have I Been Pwned with
//!   k-anonymity (`breached`), failing open if the service is down.
//! * Timing: login always runs a password verification (against a dummy hash
//!   when the user does not exist) so response time doesn't reveal whether an
//!   email is registered.
pub mod breached;
pub mod password;
pub mod service;
pub mod token;

pub use service::{AuthService, CurrentUser, LoginInput, RegisterInput};
