//! HTTP route modules. Each module exposes `router()` returning a `Router<AppState>`
//! mounted under `/api` by `app::build`.
pub mod admin;
pub mod auth;
pub mod coach;
pub mod comments;
pub mod curriculum;
pub mod health;
pub mod interviews;
pub mod problems;
pub mod progress;
pub mod sse;
