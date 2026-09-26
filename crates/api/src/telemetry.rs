//! Structured logging. JSON in production (Railway's log explorer parses it),
//! pretty in development. `RUST_LOG` overrides the default filter.
use tracing_subscriber::{EnvFilter, fmt, prelude::*};

pub fn init(json: bool) {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,ascend_api=debug,ascend_core=debug,tower_http=info,sea_orm=warn,sqlx=warn"));
    let registry = tracing_subscriber::registry().with(filter);
    if json {
        registry.with(fmt::layer().json().with_current_span(false).with_span_list(false).flatten_event(true)).init();
    } else {
        registry.with(fmt::layer().compact()).init();
    }
}
