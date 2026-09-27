//! # ascend-api
//!
//! The HTTP adapter over `ascend-core`. Exposed as a library so integration
//! tests (`tests/`) can build the exact production router against a real
//! Postgres and drive it with `tower::ServiceExt::oneshot`, no sockets needed.
pub mod app;
pub mod error;
pub mod extractors;
pub mod middleware;
pub mod routes;
pub mod state;
pub mod telemetry;
