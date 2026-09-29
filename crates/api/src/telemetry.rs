//! Logs, traces and metrics.
//!
//! **Logs:** JSON in production (Railway's log explorer parses it), pretty in
//! development. `RUST_LOG` overrides the default filter.
//!
//! **Traces and metrics:** pushed over OTLP/HTTP when
//! `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` / `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`
//! are set (in production, Jaeger and Prometheus on Railway's private
//! network; any OTLP backend works). Every replica pushes its own data,
//! labelled with `service.instance.id` = `RAILWAY_REPLICA_ID`, so nothing
//! has to discover or scrape replicas. Only spans are exported, never log
//! events, so learner content in a log line cannot reach the trace store.
use std::time::Duration;

use opentelemetry::KeyValue;
use opentelemetry::trace::TracerProvider as _;
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::Resource;
use opentelemetry_sdk::metrics::SdkMeterProvider;
use opentelemetry_sdk::trace::SdkTracerProvider;
use tracing_subscriber::{EnvFilter, Layer, filter, fmt, prelude::*};

/// Keeps the exporters alive; `shutdown` flushes what is buffered.
pub struct Telemetry {
    tracer: Option<SdkTracerProvider>,
    meter: Option<SdkMeterProvider>,
}

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.trim().is_empty())
}

fn resource(service: &'static str) -> Resource {
    let instance = env("RAILWAY_REPLICA_ID").unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    Resource::builder()
        .with_service_name(service)
        .with_attributes([
            KeyValue::new("service.instance.id", instance),
            KeyValue::new("service.version", crate::build_info::BUILD_ID),
            KeyValue::new(
                "deployment.environment.name",
                env("RAILWAY_ENVIRONMENT_NAME").unwrap_or_else(|| "local".into()),
            ),
        ])
        .build()
}

pub fn init(json: bool, service: &'static str) -> Telemetry {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        // `sea_orm=warn` would also silence `sea_orm_migration` (targets match
        // by prefix), hiding which migrations ran at boot; re-enable it.
        EnvFilter::new(
            "info,ascend_api=debug,ascend_core=debug,tower_http=info,sea_orm=warn,sea_orm_migration=info,sqlx=warn",
        )
    });
    let logs = if json {
        fmt::layer().json().with_current_span(true).with_span_list(false).flatten_event(true).boxed()
    } else {
        fmt::layer().compact().boxed()
    };

    let mut problems = Vec::new();
    let tracer =
        env("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT").and_then(
            |endpoint| match opentelemetry_otlp::SpanExporter::builder().with_http().with_endpoint(endpoint).build() {
                Ok(exporter) => {
                    // Head sampling keeps trace volume bounded as traffic
                    // grows: OTEL_TRACES_SAMPLE_RATIO of new traces (default
                    // all), and a sampled parent's children always.
                    let ratio = env("OTEL_TRACES_SAMPLE_RATIO").and_then(|r| r.parse::<f64>().ok()).unwrap_or(1.0);
                    let sampler = opentelemetry_sdk::trace::Sampler::ParentBased(Box::new(
                        opentelemetry_sdk::trace::Sampler::TraceIdRatioBased(ratio.clamp(0.0, 1.0)),
                    ));
                    Some(
                        SdkTracerProvider::builder()
                            .with_sampler(sampler)
                            .with_batch_exporter(exporter)
                            .with_resource(resource(service))
                            .build(),
                    )
                }
                Err(e) => {
                    problems.push(format!("trace exporter: {e}"));
                    None
                }
            },
        );
    let traces = tracer.as_ref().map(|provider| {
        tracing_opentelemetry::layer()
            .with_tracer(provider.tracer("ascend"))
            .with_filter(filter::filter_fn(|meta| meta.is_span() && *meta.level() <= tracing::Level::INFO))
    });

    let meter = env("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT").and_then(|endpoint| {
        match opentelemetry_otlp::MetricExporter::builder().with_http().with_endpoint(endpoint).build() {
            Ok(exporter) => {
                let reader = opentelemetry_sdk::metrics::PeriodicReader::builder(exporter)
                    .with_interval(Duration::from_secs(15))
                    .build();
                let provider = SdkMeterProvider::builder().with_reader(reader).with_resource(resource(service)).build();
                opentelemetry::global::set_meter_provider(provider.clone());
                Some(provider)
            }
            Err(e) => {
                problems.push(format!("metric exporter: {e}"));
                None
            }
        }
    });

    // W3C trace context, so a trace continues into the grading service.
    opentelemetry::global::set_text_map_propagator(opentelemetry_sdk::propagation::TraceContextPropagator::new());
    tracing_subscriber::registry().with(filter).with(logs).with(traces).init();
    for p in problems {
        tracing::warn!(problem = %p, "telemetry export disabled");
    }
    if tracer.is_some() || meter.is_some() {
        tracing::info!(traces = tracer.is_some(), metrics = meter.is_some(), service, "telemetry export enabled");
    }
    Telemetry { tracer, meter }
}

impl Telemetry {
    /// Flushes buffered spans and a final metrics collection.
    pub fn shutdown(&self) {
        if let Some(t) = &self.tracer
            && let Err(e) = t.shutdown_with_timeout(Duration::from_secs(5))
        {
            tracing::warn!(error = %e, "trace flush failed");
        }
        if let Some(m) = &self.meter
            && let Err(e) = m.shutdown_with_timeout(Duration::from_secs(5))
        {
            tracing::warn!(error = %e, "metrics flush failed");
        }
    }
}

/// The current span's trace context as headers (`traceparent`), for a call
/// to another service. Empty when the span is not being traced.
pub fn trace_headers() -> Vec<(String, String)> {
    use tracing_opentelemetry::OpenTelemetrySpanExt;
    let cx = tracing::Span::current().context();
    let mut carrier = std::collections::HashMap::new();
    opentelemetry::global::get_text_map_propagator(|p| p.inject_context(&cx, &mut carrier));
    carrier.into_iter().collect()
}

/// The caller's trace context from a request's headers.
pub fn remote_context(headers: &axum::http::HeaderMap) -> opentelemetry::Context {
    let carrier: std::collections::HashMap<String, String> =
        headers.iter().filter_map(|(k, v)| Some((k.as_str().to_owned(), v.to_str().ok()?.to_owned()))).collect();
    opentelemetry::global::get_text_map_propagator(|p| p.extract(&carrier))
}

/// Gauges read when metrics are collected: connection-pool use (the first
/// thing to run out when replicas are added) and grading slots in use.
pub fn observe(state: &crate::state::AppState) {
    use opentelemetry::global;
    let meter = global::meter("ascend");
    let pool = state.db.get_postgres_connection_pool().clone();
    let max = state.config.database_pool_max;
    // The SDK keeps an observable instrument's callback registered after
    // the handle is dropped.
    let _ = meter
        .u64_observable_gauge("ascend.db.pool.connections")
        .with_description("database connections held by this replica")
        .with_callback(move |o| {
            let size = u64::from(pool.size());
            let idle = u64::try_from(pool.num_idle()).unwrap_or(0);
            o.observe(size.saturating_sub(idle), &[KeyValue::new("state", "in_use")]);
            o.observe(idle, &[KeyValue::new("state", "idle")]);
            o.observe(u64::from(max), &[KeyValue::new("state", "max")]);
        })
        .build();
    if let Some(grader) = state.submissions.grader() {
        observe_grader(grader);
    }
}

/// Grading slots in use on this process (the API grading in-process, or the
/// grading service).
pub fn observe_grader(grader: &ascend_grader::Grader) {
    use opentelemetry::global;
    let meter = global::meter("ascend");
    let grader = grader.clone();
    {
        let _ = meter
            .u64_observable_gauge("ascend.grader.slots")
            .with_description("grading slots on this replica")
            .with_callback(move |o| {
                let (busy, total) = grader.slots();
                o.observe(busy as u64, &[KeyValue::new("state", "busy")]);
                o.observe(total as u64, &[KeyValue::new("state", "total")]);
            })
            .build();
    }
}
