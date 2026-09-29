//! # ascend-core
//!
//! The domain layer of Ascend. Everything here is transport-agnostic: no Axum,
//! no HTTP types. The API crate is a thin adapter that maps HTTP to these
//! services and back. That boundary is what makes the domain testable without
//! a web server and reusable from other binaries (CLI tools, workers).
//!
//! Module map:
//! * [`config`]    – typed, validated configuration loaded from the environment.
//! * [`error`]     – the single `AppError` type every service returns.
//! * [`entities`]  – SeaORM entities (one module per table).
//! * [`content`]   – the curriculum engine: Markdown is embedded in the binary,
//!   parsed once at startup into an indexed, immutable graph.
//! * [`auth`]      – password hashing and opaque session tokens.
//! * [`ai`]        – Anthropic client + the coach, quiz generator and interviewer.
//! * [`services`]  – application services (progress, roadmap, comments, ...).

pub mod ai;
pub mod auth;
pub mod config;
pub mod content;
pub mod email;
pub mod entities;
pub mod error;
pub mod metrics;
pub mod services;

pub use config::Config;
pub use error::{AppError, AppResult};
