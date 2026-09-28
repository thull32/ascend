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

/// Output ceiling for single-shot structured calls (quiz, roadmap,
/// evaluation). Adaptive thinking counts toward `max_tokens`, so the cap must
/// leave room for reasoning plus the JSON; 16,000 is the recommended ceiling
/// for a non-streaming request (it stays under HTTP timeouts). The daily
/// budget, not this cap, is what bounds spend.
pub const STRUCTURED_MAX_TOKENS: u32 = 16_000;

pub use anthropic::{AnthropicClient, ChatMessage, Role, StreamEvent, Usage};
pub use budget::BudgetService;
