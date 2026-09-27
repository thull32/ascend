//! AI features, built directly on the Anthropic Messages API over HTTP.
//!
//! There is no official Rust SDK, so [`anthropic`] is a small, typed client
//! that covers exactly what we use: streamed text responses and structured
//! JSON outputs. Every call goes through [`budget::BudgetService`] so a single
//! user cannot exhaust the shared key on a free product.
//!
//! Three products sit on top:
//! * [`coach`]     – the always-available tutor with lesson/problem context.
//! * [`quiz`]      – generates fresh quizzes for a lesson as strict JSON.
//! * [`interview`] – runs and grades mock interviews.
//! * [`roadmap`]   – proposes roadmap personalisation from a self-description.
pub mod anthropic;
pub mod budget;
pub mod coach;
pub mod interview;
pub mod quiz;
pub mod roadmap;

pub use anthropic::{AnthropicClient, ChatMessage, Role, StreamEvent, Usage};
pub use budget::BudgetService;
