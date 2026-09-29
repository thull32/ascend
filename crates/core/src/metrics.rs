//! Application metrics, recorded through the OpenTelemetry API.
//!
//! The API binary installs an OTLP exporter at boot (`crates/api/src/telemetry.rs`);
//! without one (tests, tools) every instrument here is a no-op. Instruments
//! are created on first use, so install the provider before touching them.
//!
//! Labels are low-cardinality on purpose (route templates, languages,
//! outcomes) and never carry personal data: no user IDs, emails, code or
//! messages. SLOs and alerts are built on these series (docs/SLO.md).
use std::sync::LazyLock;

use opentelemetry::metrics::{Counter, Histogram};
use opentelemetry::{KeyValue, global};

/// Seconds, from fast API calls to long grading runs and AI streams.
const SECONDS: &[f64] = &[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0];

pub struct Instruments {
    /// Every HTTP request: method, route template, status code.
    pub http_duration: Histogram<f64>,
    /// Graded submissions by language and outcome.
    pub grader_runs: Counter<u64>,
    /// Time inside the sandbox, by language.
    pub grader_duration: Histogram<f64>,
    /// Time from asking for a grading slot to getting one.
    pub grader_queue_wait: Histogram<f64>,
    /// Model tokens billed, by kind (input, output, cache_read, cache_write).
    pub ai_tokens: Counter<u64>,
    /// Budget decisions: reserved, refused, settled, released.
    pub ai_budget: Counter<u64>,
    /// Streamed replies: time to the first text delta.
    pub ai_first_token: Histogram<f64>,
    /// Requests refused by a rate limit, by bucket.
    pub rate_limited: Counter<u64>,
    /// Rows removed by the retention round, by kind.
    pub retention_deleted: Counter<u64>,
    /// Emails, by kind (reset, verify) and outcome.
    pub emails: Counter<u64>,
}

static INSTRUMENTS: LazyLock<Instruments> = LazyLock::new(|| {
    let m = global::meter("ascend");
    let seconds = |name: &'static str, description: &'static str| {
        m.f64_histogram(name).with_unit("s").with_description(description).with_boundaries(SECONDS.to_vec()).build()
    };
    Instruments {
        http_duration: seconds("http.server.request.duration", "HTTP request duration"),
        grader_runs: m.u64_counter("ascend.grader.runs").with_description("graded submissions").build(),
        grader_duration: seconds("ascend.grader.duration", "time in the grading sandbox"),
        grader_queue_wait: seconds("ascend.grader.queue_wait", "time waiting for a grading slot"),
        ai_tokens: m.u64_counter("ascend.ai.tokens").with_description("model tokens billed").build(),
        ai_budget: m.u64_counter("ascend.ai.budget").with_description("daily AI budget decisions").build(),
        ai_first_token: seconds("ascend.ai.first_token", "time to the first streamed text"),
        rate_limited: m.u64_counter("ascend.rate_limited").with_description("requests refused by a rate limit").build(),
        retention_deleted: m
            .u64_counter("ascend.retention.deleted")
            .with_description("rows removed by retention")
            .build(),
        emails: m.u64_counter("ascend.emails").with_description("emails sent").build(),
    }
});

pub fn get() -> &'static Instruments {
    &INSTRUMENTS
}

pub fn kv(key: &'static str, value: impl Into<opentelemetry::Value>) -> KeyValue {
    KeyValue::new(key, value)
}
