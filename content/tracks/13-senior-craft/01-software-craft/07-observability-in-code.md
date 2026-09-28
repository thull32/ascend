---
slug: observability-in-code
title: "Observability in code: structured logs, request IDs, metrics and traces"
description: "Instrument a service so any user report leads to its log lines: a real Ascend JSON log line taken apart field by field, level filters and the prefix rule that hides lines, what a log call costs (measured), request IDs carried into spawned tasks, the four metric types with a percentile computed from buckets by hand, why summaries cannot be merged, cardinality counted on a real API, a traceparent header decoded and followed across three hops, and head versus tail sampling with arithmetic."
minutes: 27
difficulty: medium
tags: [observability, logging, structured-logging, metrics, tracing, opentelemetry, request-id, prometheus, trace-context, sampling, senior-craft]
---
A learner writes in: "the coach stopped halfway through an answer, around 14:05." You open the logs for 14:00 to 14:10 and find 40,000 lines of free text from every request on the box. Somewhere in there is a line that says `stream error`. You cannot tell whose stream, which conversation, or whether it is related. An hour later you give up and reply "we could not reproduce it".

Now the other version. The learner's browser shows an `x-request-id` header on the failed response. You filter the logs by that ID and get eleven lines: the request, the conversation ID, the upstream error from the AI provider, and how long each step took. Five minutes, root cause found. The difference is not tooling. It is decisions made in the code, months earlier, about what to record and how.

## Three signals, and what code owes each

| Question | Signal | What the code must provide |
|---|---|---|
| What happened to *this* request? | Logs | Structured events with a correlation ID |
| How is the system behaving *overall*? | Metrics | Counters and histograms with bounded labels |
| Where did the time go *across hops*? | Traces | Spans with parent/child links, context propagated across processes |

Logs are detailed and expensive per event; metrics are cheap aggregates you can alert on; traces explain causality and latency. [Observability](/learn/system-design/building-blocks/observability) covers SLOs, burn-rate alerts and fleet-scale storage. This lesson is about the code-level decisions that make those possible, using Ascend's own telemetry, read line by line.

## Structured logs: constant messages, variable fields

A structured log line is an event with named fields, not a sentence with values interpolated into it:

```rust
// Unstructured: every occurrence is a different string
tracing::warn!("coach stream error for conversation {}: {}", conv.id, e);

// Structured (what crates/api/src/routes/coach.rs does)
tracing::warn!(error = %e, conversation = %conv.id, "coach stream error");
```

The structured form has a **constant message** (`coach stream error`), so you can count and group occurrences, and **typed fields** you can filter on. The unstructured form forces every query to be a regular expression over prose, and breaks whenever someone rewords it.

`crates/api/src/telemetry.rs` decides the output format once, for the whole process:

```rust
let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
    // `sea_orm=warn` would also silence `sea_orm_migration` (targets match
    // by prefix), hiding which migrations ran at boot; re-enable it.
    EnvFilter::new(
        "info,ascend_api=debug,ascend_core=debug,tower_http=info,sea_orm=warn,sea_orm_migration=info,sqlx=warn",
    )
});
let registry = tracing_subscriber::registry().with(filter);
if json {
    registry.with(fmt::layer().json().with_current_span(true).with_span_list(false).flatten_event(true)).init();
} else {
    registry.with(fmt::layer().compact()).init();
}
```

Production writes one JSON object per line (the module comment says Railway's log explorer parses it); development gets compact human-readable lines. `flatten_event(true)` puts event fields at the top level, so a query is `status >= 500` rather than `fields.status >= 500`. `with_current_span(true)` attaches the fields of the span the event happened in, which is how the request ID reaches every line, while `with_span_list(false)` leaves out the chain of ancestor spans. The filter sets levels **per module**, so a chatty dependency cannot drown the service's own signal. `RUST_LOG` replaces the whole default; the production image sets `RUST_LOG=info,ascend_api=info,ascend_core=info,tower_http=info,sea_orm=warn,sea_orm_migration=info,sqlx=warn`. The comment in that excerpt records a fix, traced in the next section.

## Levels, filters and the prefix rule

Levels should mean something a reader can act on:

- **ERROR**: someone should look. `crates/api/src/error.rs` logs `database error` and `internal error` here.
- **WARN**: degraded but handled. The coach's upstream stream failed; the AI key is missing so AI features are off; `database schema is ahead of this build (a rollback?); starting without migrating`.
- **INFO**: lifecycle and business events: `booting ascend-api`, `migrations applied` or `schema up to date`, `curriculum loaded`, `listening`, `coach turn complete`.
- **DEBUG**: detail for development, off in production.

`EnvFilter` picks, for each event and each span, the most specific directive whose target is a **string prefix** of the callsite's target (in tracing-subscriber 0.3.23 the check is a plain `starts_with`, not a match on `::` segments). Traced against the production filter before and after commit `8f82820`:

| Callsite target | Event | Before: directive that wins | After: directive that wins |
|---|---|---|---|
| `ascend_api` | INFO `migrations applied` (earlier `running migrations`) | `ascend_api=info`: emitted | the same: emitted |
| `sea_orm_migration::migrator::exec` | INFO `Applying migration 'm0007_integrity'` | `sea_orm=warn`, a prefix of `sea_orm_migration`: **dropped** | `sea_orm_migration=info`, the longer prefix: emitted |
| `tower_http::trace::on_request` | DEBUG `started processing request` | `tower_http=info`: dropped | the same: dropped |
| `tower_http::trace::on_response` | INFO `finished processing request` | `tower_http=info`: emitted | the same: emitted |
| `tower_http::trace::on_eos` | DEBUG `end of stream` | `tower_http=info`: dropped | the same: dropped |

The second row's "before" was observed, not only derived: a local run of the debug binary against an empty database, with the old production filter, applied all seven migrations and printed nothing between `running migrations` and `curriculum loaded`, so in production a slow migration looked like silence. That observation, made while reviewing this lesson, is why commit `8f82820` added `sea_orm_migration=info` to both the default filter and the Dockerfile's `RUST_LOG`. When two directives match, the one with the longer target wins, so the migrator's INFO lines return while the rest of `sea_orm` stays at WARN. The same commit replaced the vague `running migrations` with lines that say what boot decided: `migrations applied` with the list, `schema up to date`, or the WARN about a schema ahead of the build.

Spans obey the same filter, and that has a sharper edge. The `request` span that carries the request ID is created with `info_span!` in `ascend_api::app`. Set `RUST_LOG=warn` to cut volume and the span is never created, so every WARN and ERROR line that remains loses its `span` object, request ID included, with no error anywhere. Lower the verbosity of noisy *events*; keep the span's target at INFO.

## Under the hood: one log line, field by field

This line was observed on a local run of the debug build with `LOG_JSON=true` and the production filter, after a request for an unknown path:

```json
{"timestamp":"2026-09-28T17:05:02.101313Z","level":"INFO","message":"finished processing request","latency":"0 ms","status":404,"target":"tower_http::trace::on_response","span":{"method":"GET","request_id":"3225a94b-e1b9-4c91-bb4c-7c1644598d86","uri":"/api/no-such-thing","name":"request"}}
```

| Key | Written by | Detail |
|---|---|---|
| `timestamp` | the default `SystemTime` timer | UTC, RFC 3339, microseconds |
| `level` | the event's level | upper case |
| `message`, `latency`, `status` | the event, flattened | the macro puts `message` first; `latency` is a Display string in whole milliseconds, `status` a number |
| `target` | the macro callsite's module path | the string `EnvFilter` matched |
| `span` | `with_current_span(true)` | the span's fields in sorted order, then `name` |

The order is the formatter's code order in tracing-subscriber 0.3.23's `json.rs`. The span object comes out sorted for a mechanical reason: a span's fields are formatted to a JSON string once, when the span is created, and stored with it; for every event the formatter parses that string back with `serde_json` and re-serialises it (the source comment calls this a stopgap), and `serde_json` without its `preserve_order` feature, which Ascend's lock file does not enable, keeps keys in a sorted map. The event is formatted into a thread-local buffer and written to stdout with one `write_all`; Rust's stdout is line-buffered, so each line is one `write` system call under stdout's lock, on the thread handling the request.

A coach turn adds this event, derived from the macro in `coach.rs` (not observed; token values illustrative):

```json
{"timestamp":"2026-09-28T14:05:21.417305Z","level":"INFO","message":"coach turn complete","conversation":"0192f1c4-2d7e-7a31-b8c5-6e9f0a1b2c3d","input_tokens":1874,"output_tokens":912,"cache_read_tokens":6210,"cache_write_tokens":0,"target":"ascend_api::routes::coach","span":{"method":"POST","request_id":"3f2b8c1e-7d4a-4b6e-9c2d-8a1f0e5b7c3d","uri":"/api/coach/conversations/0192f1c4-2d7e-7a31-b8c5-6e9f0a1b2c3d/messages","name":"request"}}
```

## What the lines do not say

Reading the source behind each line found three traps, all derived from the code rather than seen in production logs; the third has since been fixed.

**Streams report time to headers.** tower-http calls `on_response` when the handler returns the response, and for the coach that is the SSE response, sent before the first token. The `latency` on its `finished processing request` line is therefore the time to open the upstream stream; the stream's own duration goes to a DEBUG `end of stream` event that production filters out. Subtract the timestamps of the `finished` line and the `coach turn complete` line with the same request ID to get it.

**One failure, two ERROR lines.** For any 5xx, tower-http's default classifier also logs ERROR `response failed` with `classification = "Status code: 500 Internal Server Error"`. A database failure writes `database error`, `response failed` and the INFO `finished` line with `status: 500`. Count failures from `status` on the `finished` line, not by counting ERROR lines.

**A field named `message` collided.** `crates/core/src/ai/anthropic.rs` used to log `warn!(kind = %error.kind, message = %error.message, "anthropic stream error event")`. Flattened, that object had two `message` keys. Python's `json.loads` and JavaScript's `JSON.parse` both keep the last (checked), so the constant `anthropic stream error event` was replaced by the provider's text and the event could not be counted by its message. Commit `8f82820` renamed the field `provider_message`. Nothing in Rust flags it: only the JSON formatter's flattening makes the name collide, so reading the emitted output is the test.

## What a log line costs

Measured on CPython 3.14.7 and Node 24.21 (x86-64, best of five runs of 200,000 to 1,000,000 iterations), using the coach line above:

| Operation | Time per call |
|---|---|
| `json.dumps` of the 442-byte coach line (Python) | 1.9 µs |
| `logging.info` through a JSON formatter to `/dev/null` (Python) | 5.6 µs |
| `logging.debug` with DEBUG disabled, lazy `%s` argument | 0.054 µs |
| the same disabled call with an f-string argument | 0.38 µs |
| `os.write` of one 420-byte line to `/dev/null` | 0.25 µs |
| `JSON.stringify` of the same object (Node) | 0.34 µs |

Rust's `serde_json` path was not measured here; expect the same order as Node or below. The arithmetic that matters: a Python service at 1,000 requests per second writing ten lines each spends 1,000 × 10 × 5.6 µs = 56 ms of CPU per second, about 6% of a core. A disabled call is nearly free unless the argument is built eagerly: the f-string costs seven times the lazy form because the string is formatted before the level check. Rust's `tracing` macros check the level first and build field values only when the event is enabled, so a disabled `debug!` with expensive fields costs a level comparison and a cached lookup.

The larger cost is downstream. The observed `finished` lines were 283 to 290 bytes (a coach request's longer path makes one about 345), so one line per request is about 0.3 GB per million requests before indexing, and log platforms bill ingestion and retention by the gigabyte. Turning `tower_http` to DEBUG adds `started processing request` and `end of stream` to every request, tripling that one component. Decide volume per target, not per process.

## Request IDs: one key that joins everything

A request ID is only useful if it is on every line of the request and visible to the person reporting the problem. `crates/api/src/app.rs` wires it up with one middleware of its own and three layers from `tower-http`, outermost first:

1. `request_id::sanitise` (`crates/api/src/middleware/request_id.rs`) removes a client-supplied `x-request-id` unless it parses as a UUID.
2. `SetRequestIdLayer` sets `x-request-id` on every request, generating a random version-4 UUID when none survived.
3. `PropagateRequestIdLayer` copies it onto the response, so the browser's network panel, a support ticket or a failing test can quote it.
4. `TraceLayer` opens a `request` span with the method, the path and `request_id`, and logs status and latency when the response is ready.

```mermaid
sequenceDiagram
  participant B as Browser
  participant M as Request-ID layers
  participant H as Handler
  participant L as Logs
  B->>M: POST /api/coach/.../messages
  M->>M: drop x-request-id unless a UUID, generate if absent
  M->>H: request inside span request_id=abc
  H->>L: warn coach stream error, conversation=...
  H-->>M: response
  M-->>B: 200 with x-request-id abc
  Note over B,L: support searches the logs for abc
```

The ID lives on the `request` span, not in each `warn!` call, and every event inside the request inherits it. `docs/ARCHITECTURE.md` summarises the logs as "one line per request with the request ID", which undersells it: every line emitted inside the request carries the ID. Build the layer with `with_current_span(false)` and the ID silently disappears from production logs while development's compact output still shows span context. Test telemetry by reading what it emits. [Anatomy of a request](/learn/case-study-ascend/the-system/anatomy-of-a-request) walks the rest of this middleware stack in order.

**A client could choose its own ID.** `SetRequestIdLayer` keeps a header that is already present, and the first version accepted anything: a 10 KB string, a duplicate of someone else's ID, characters that confuse log tooling. The `sanitise` layer is the fix, and the local run confirmed both paths: a request sent with `x-request-id: <script>alert(1)</script>` came back with a fresh UUID, and one sent with a valid UUID came back unchanged, which is what the integration test `request_ids_are_server_controlled` asserts. `uuid::Uuid::parse_str` accepts four spellings (plain, hyphenated, braced and `urn:uuid:`), so the longest value that can reach a log is 45 characters.

## Work that outlives the request

The coach streams its reply from a spawned task (`state.tasks.spawn`, a `TaskTracker` that lets shutdown wait for it), so the reply is saved even if the browser disconnects. A spawned task does not run inside the span that was current when it was spawned. In the first version, `coach stream error` and `failed to persist coach reply`, the two lines you most want during an incident, carried no request ID: the search in the opening story would have found the request line and nothing about why it failed.

The fix is one call on the spawned future:

```rust
state.tasks.spawn(
    async move { /* pump the stream, log, persist */ }
        .instrument(tracing::Span::current()),
);
```

`.instrument` wraps the future so that each poll enters the handler's span, whichever worker thread runs it. `crates/api/src/routes/interviews.rs` does the same for the interviewer and assistant streams. Any work that outlives its request (spawned tasks, queued jobs, retries) must be handed its context explicitly, because nothing inherits it by accident. Across a queue, that means putting the ID, or a `traceparent`, in the message.

## Metric types, and why latency is a histogram

| Type | What the process exports | How you query it | Sums across instances? |
|---|---|---|---|
| Counter | A number that only goes up, reset to 0 on restart | `rate()` or `increase()` over a window, which absorbs resets | yes: sum the rates |
| Gauge | The current level | the value, `max`, `avg` | yes for totals and maxima |
| Histogram | One cumulative counter per bucket (`le`), plus `_sum` and `_count` | `histogram_quantile` over bucket rates | yes: sum the buckets |
| Summary | Quantiles computed in the process over a sliding window, plus `_sum` and `_count` | read the quantile series | **no** |

Two checklists pick what to measure. **RED**, for anything that serves requests: rate, errors, duration. **USE**, for anything with capacity: utilisation, saturation, errors. For this app the capacity that runs out first is the database pool, which `crates/api/src/state.rs` caps at 20 connections with a 5-second acquire timeout.

Latency must be a distribution, never an average. An average of 80 ms can hide a p99 of 4 seconds, and a mean of per-instance percentiles is not a percentile of anything. A histogram stores counts, and counts add: sum each bucket across instances, then compute the percentile once, from the merged buckets.

## Percentiles from buckets, worked

One route over five minutes, 1,000 requests, as the cumulative counters a histogram exports:

| `le` (seconds) | 0.05 | 0.1 | 0.25 | 0.5 | 1 | 2.5 | +Inf |
|---|---|---|---|---|---|---|---|
| Requests at or below | 620 | 870 | 960 | 985 | 994 | 998 | 1,000 |

Prometheus's `histogram_quantile` computes the rank $q \times \text{total}$, finds the first bucket whose cumulative count reaches it, and interpolates linearly inside that bucket, assuming its requests are spread evenly. The lowest bucket's lower bound is taken as 0; a rank that lands in the `+Inf` bucket returns the upper bound of the bucket below it.

| Quantile | Rank | Bucket | Requests before it | In the bucket | Result |
|---|---|---|---|---|---|
| p50 | 500 | 0–0.05 | 0 | 620 | $0.05 \times 500/620 = 0.040$ s |
| p90 | 900 | 0.1–0.25 | 870 | 90 | $0.1 + 0.15 \times 30/90 = 0.150$ s |
| p99 | 990 | 0.5–1 | 985 | 9 | $0.5 + 0.5 \times 5/9 = 0.778$ s |
| p99.9 | 999 | 2.5–+Inf | 998 | 2 | **2.5 s**, the largest finite bound |

Two limits follow from the arithmetic. The p99 is only known to lie between 0.5 and 1 s; the 0.778 is an interpolation, so put a bucket boundary exactly at any latency threshold an SLO names. And the p99.9 reads 2.5 s whether the two slowest requests took 3 s or 3 minutes: the largest finite bucket caps what the histogram can report.

Merging, traced: suppose these 1,000 requests came from instance A (970 requests, bucket counts 600, 850, 940, 960, 968, 970, 970) and instance B (30 requests: 20, 20, 20, 25, 26, 28, 30). A's own p99 is 0.519 s and B's is capped at 2.5 s. Their mean, 1.51 s, and their request-weighted mean, 0.58 s, are both wrong. Summing the buckets reproduces the table above and the true 0.778 s. In PromQL the merge is the `sum by (le)` in `histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))`. Netflix's open-source metrics library, Spectator, records its percentile timers the same way, as counts in a fixed set of buckets shared by every instance, so that fleet-wide distributions can be summed.

## Summaries do not aggregate

A summary exports ready-made quantiles, for example a series labelled `quantile="0.99"`, each computed inside one process from its own requests. No arithmetic on those numbers recovers a fleet percentile. Two fleets, each with two instances serving 100 requests, using the nearest-rank p99 (the 99th smallest of 100; the 198th of 200):

| Fleet | A's p99 | B's p99 | B's three slowest | Merged p99 of 200 |
|---|---|---|---|---|
| 1 | 100 ms | 1,000 ms | 900, 1,000, 1,000 ms | **900 ms** |
| 2 | 100 ms | 1,000 ms | 200, 1,000, 1,000 ms | **200 ms** |

Identical summaries, different answers, because the merged p99 depends on B's 98th request, which the summary threw away. A histogram keeps a count per bucket, and counts add. Summaries are accurate for one instance and cost nothing at query time, but their quantiles are fixed when the code is written and cannot be combined; for anything served by more than one process, use histograms.

## Cardinality, counted on this API

Every unique combination of label values is a separate series, and a histogram multiplies it again: the snippet below declares 12 buckets, so each label set is 13 bucket series (with `+Inf`) plus `_sum` and `_count`, 15 in all (the Python client adds a `_created` series unless disabled). Ascend's routers in `crates/api/src/routes` declare 35 route templates carrying 43 route-and-method pairs.

| Labels on the latency histogram | Label sets | Series |
|---|---|---|
| route template × method × status class (4 seen) | 43 × 4 = 172 | 2,580 |
| route template × method × status code (about a dozen) | at most 43 × 13 | at most 8,385 |
| raw path, as the request span's `uri` records it | about 350 lesson paths alone, plus one per coach conversation | unbounded: 1,000 new conversations add 15,000 series |
| … × `user_id`, 200,000 users | 34.4 million | 516 million |

The third row is the trap nearest to hand. The span records `req.uri().path()`, which is right for logs and wrong for a metric label, because every conversation UUID in `/api/coach/conversations/{id}/messages` mints a new series set that never stops being stored. Label with the matched route template (axum exposes it as `MatchedPath`), keep IDs in logs and traces, and estimate the series count in review before merging a label.

## RED, USE and what Ascend measures today

Ascend exports no application metrics: there is no metrics endpoint, and its `Cargo.lock` contains no Prometheus, metrics or OpenTelemetry crate. It relies on the platform's CPU, memory and network graphs plus logs, from which a log-based metric can count. What each signal would come from today, and from a metrics layer:

| Signal | Checklist | From the logs today | From a metrics layer |
|---|---|---|---|
| Request rate | RED | count `finished processing request` lines | counter by route template and status class |
| Errors | RED | `status` ≥ 500 on those lines | the same counter |
| Duration | RED | `latency`, a string in whole ms, time to headers | histogram, with a separate one for stream duration |
| Pool utilisation | USE | nothing | gauge of connections in use, of 20 |
| Pool saturation | USE | ERROR `database error` with `Failed to acquire connection from pool: Connection pool timed out` after a 5 s wait; `/api/readyz` reports `"database": false` | histogram of acquire wait |
| AI cost | business | `coach turn complete` token fields | counter of output tokens by model |

```python
from prometheus_client import Counter, Histogram

REQUESTS = Counter("http_requests_total", "HTTP requests", ["route", "status_class"])
LATENCY = Histogram("http_request_duration_seconds", "Request latency", ["route"],
                    buckets=[.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10, 30])
AI_TOKENS = Counter("ai_output_tokens_total", "Model output tokens", ["model"])
```

[Evals and observability](/learn/ai-and-llms/building-with-llms/evals-and-observability) covers what else to record per model call. If you were adding metrics here, the order of value is: a request counter and latency histogram per route template and status class (one middleware layer covers every route), AI output tokens by model (the dominant variable cost of a free product), pool usage and acquire wait, and a counter of requests refused by the daily AI budget.

## Traces: where did the nine seconds go?

A trace is a tree of **spans**, each with a start, a duration, attributes and a parent. The coach request is a natural example: authenticate, load the conversation, assemble the prompt, open the upstream stream, relay tokens, persist the reply. When a learner says "it was slow", a trace shows which of those took the time.

```viz
{"type": "system", "algorithm": "request-flow", "title": "Each hop is a span", "caption": "A trace links the spans for every hop of one request under a single trace ID, so the slow hop is visible instead of inferred."}
```

Because Ascend logs through the `tracing` crate rather than printing strings, the `request` span already exists and functions can gain spans with `#[tracing::instrument]`. Exporting them is one more layer on the subscriber registry built in `telemetry.rs` (the `tracing-opentelemetry` bridge feeding an OTLP exporter): the instrumentation stays, only the exporter is new. **OpenTelemetry** is the vendor-neutral standard for the APIs, SDKs and the collector, so the instrumentation does not change when the backend does. Ascend has no such exporter today.

## traceparent, decoded

Across processes the trace context travels in a header defined by W3C Trace Context. The specification's own example:

```text
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
```

| Field | Hex chars | Bytes | Value here | Meaning | Invalid when |
|---|---|---|---|---|---|
| version | 2 | 1 | `00` | format version | `ff`; for `00`, anything after the flags |
| trace-id | 32 | 16 | `4bf92f35 77b34da6 a3ce929d 0e0e4736` | the whole trace, shared by every span | all zeros |
| parent-id | 16 | 8 | `00f067aa0ba902b7` | the caller's span | all zeros |
| trace-flags | 2 | 1 | `01` = `0b00000001` | bit 0: the caller sampled this trace | |

Version `00` is exactly 55 characters, lowercase hex only. A receiver that sees a higher version reads the first four fields and ignores what follows, so the format can grow. A header that fails these checks is not an error to return: the receiver starts a new trace and ignores `tracestate`. The Level 2 draft of the specification gives bit 1 of the flags a meaning ("random": the trace-id's rightmost 7 bytes are random); Level 1 defines only bit 0.

`tracestate` carries vendor-specific data beside it, as up to 32 comma-separated `key=value` entries such as `rojo=00f067aa0ba902b7,congo=t61rcWkgMzE`. A vendor that updates its entry moves it to the front, and every other entry passes through unchanged.

Ascend's request ID is a 128-bit UUID (122 of the bits random), the same width as a trace-id: `3225a94b-e1b9-4c91-bb4c-7c1644598d86` without hyphens is a legal trace-id. Using one value for both is a common way to let support staff paste one ID into both the log search and the trace viewer.

## Propagation across three hops

Follow one request through an edge proxy, the API and a downstream service (a hypothetical grading service; the span IDs are illustrative). The trace-id is `4bf92f3577b34da6a3ce929d0e0e4736` throughout.

| Step | Where | Arrives with parent-id | Creates span | Span's parent | Sends `traceparent` |
|---|---|---|---|---|---|
| 1 | edge | none: starts the trace | `5b8a9c3f2e1d0c7b` (server) | none | `00-4bf9…4736-5b8a9c3f2e1d0c7b-01` |
| 2 | API | `5b8a9c3f2e1d0c7b` | `e7d6c5b4a3928170` (server) | edge span | |
| 3 | API | | `1f2e3d4c5b6a7980` (client, the outbound call) | API server span | `00-4bf9…4736-1f2e3d4c5b6a7980-01` |
| 4 | grader | `1f2e3d4c5b6a7980` | `0a1b2c3d4e5f6071` (server) | API client span | |

Three rules come out of the table. The trace-id never changes. The parent-id on the wire is always the span that made the call: the client span when there is one, so a slow network hop shows as the gap between the client span and the server span under it. And the flags pass through unchanged, so a downstream service with a parent-based sampler keeps or drops its spans to match the root's decision. A hop that drops the header does not fail; it starts a second trace, and the tree silently splits in two. The spawned-task gap in this codebase is the same break inside one process.

## Sampling: head versus tail, with arithmetic

Take a service with 1,000,000 requests a day, 0.3% of them errors (3,000) and 0.5% slower than 2 seconds (5,000), and an incident that fails 5 requests.

| Policy | Traces kept per day | Error traces kept | Chance the incident left at least one trace | Extra cost |
|---|---|---|---|---|
| Head, 1% | 10,000 | about 30 | $1 - 0.99^5 = 4.9\%$ | none |
| Head, 10% | 100,000 | about 300 | $1 - 0.9^5 = 41\%$ | ten times the storage |
| Tail: every error, every trace over 2 s, 1% of the rest | 17,920 | 3,000 | 100% | a collector that buffers every span until the decision |

**Head sampling** decides at the root, before the outcome is known, and writes the decision into bit 0 of the flags; it is cheap and every kept trace is complete, but it keeps 1% of the interesting traces along with 1% of the boring ones. **Tail sampling** sends every span to a collector tier that groups spans by trace ID, waits for the trace to finish (30 seconds is the OpenTelemetry tail-sampling processor's default wait), then applies the policy. The buffer is rate times wait: this service averages 11.6 requests per second, so about 350 traces are in flight, trivial here and gigabytes at 10,000 requests per second, as the [system design lesson](/learn/system-design/building-blocks/observability) works out. Google's Dapper paper (2010), the ancestor of today's tracers, reported that its first production version sampled one trace in 1,024 uniformly; that suits high-volume services, where an interesting pattern recurs often enough to be caught, and it is exactly the policy that misses a five-request incident.

## What never to log

Logs are copied to more places, kept longer and read by more people than your database. Treat them as a data store with weaker controls.

- **Never log credentials**: passwords, session tokens, cookies, API keys, `Authorization` headers. Ascend's `SecretString` redacts the database URL and API key from `Debug` output, so dumping the config cannot leak them. Dependencies can still echo a secret: sea-orm 2.0.3's connect function, given a URL it cannot parse, returns `The connection string '…' cannot be parsed.` with the whole string, password included, and `main` used to print that error at boot. Since commit `8f82820`, `connect_db` wraps the error with `redact_credentials` (in `crates/api/src/state.rs`), which replaces the password in any `scheme://user:password@host` with `***`, and the unit test `connect_errors_never_carry_the_password` pins four cases, including a percent-encoded password. Redacting where the error is created covers every place the message goes; a filter in one log pipeline covers one.
- **Bound what you copy from outside.** The AI client logs at most 500 characters of an upstream error body; session user agents are truncated to 255 characters before storage.
- **Logs and responses get different text.** The provider's error message goes to the log (`anthropic stream error event`, with its `kind`); the learner sees a short classified sentence such as "The reply was interrupted. Try again."
- **Log an error once, where it is handled.** Internal and database errors are logged exactly once in the error mapping, with the detail the client never sees. Library layers (tower-http's `response failed`) may add their own line; know which ones do.
- **Personal data** needs a reason, a retention period and a way to delete it. An email address in a log line survives an account deletion that cascaded through every database table.

## Exercise: find failed requests in raw log lines

Parsing your own logs, and noticing malformed lines, is the last piece: a pipeline that silently drops unparseable lines hides exactly the lines written during a crash. The exercise uses a flat `request_id` field for simplicity; in Ascend's real output the ID sits inside the nested `span` object.

```exercise
id: failed-requests-from-logs
title: Find failed requests in JSON logs
prompt: |
  You are given raw log lines. Each should be a JSON object, but some lines
  are truncated or garbage.

  A request **failed** if any of its lines has `"level": "ERROR"` or a numeric
  `status` of 500 or more. Lines belong to a request through a string field
  `request_id`; lines without a string `request_id` are ignored.

  Return `{"failed": [...], "malformed": n}` where `failed` lists the IDs of
  failed requests in the order each first qualified as failed (each once), and
  `malformed` counts lines that are not valid JSON or are valid JSON but not
  an object (for example `null` or an array).
languages: [python, javascript]
entry: failed_requests
starter:
  python: |
    import json

    def failed_requests(lines):
        # your code here
        return {"failed": [], "malformed": 0}
  javascript: |
    function failed_requests(lines) {
      // your code here
      return { failed: [], malformed: 0 };
    }
tests:
  - args: [['{"level":"INFO","request_id":"a1","message":"request","status":200}', '{"level":"ERROR","request_id":"b2","message":"database error"}', '{"level":"INFO","request_id":"b2","message":"finished processing request","status":500}']]
    expected: {"failed": ["b2"], "malformed": 0}
  - args: [['not json at all', '{"level":"INFO","request_id":"c3","status":503}', '{"truncated": ', '[1, 2, 3]']]
    expected: {"failed": ["c3"], "malformed": 3}
    label: garbage and non-object lines are counted
  - args: [[]]
    expected: {"failed": [], "malformed": 0}
    label: no lines
  - args: [['{"request_id":"z","status":502}', '{"request_id":"y","level":"ERROR"}', '{"request_id":"z","level":"ERROR"}']]
    expected: {"failed": ["z", "y"], "malformed": 0}
    label: order of first failure, no duplicates
  - args: [['{"level":"ERROR","message":"no id"}', 'null', '{"request_id":"q","status":"500"}', '{"request_id":"r","status":499}']]
    expected: {"failed": [], "malformed": 1}
    hidden: true
    label: string statuses and missing ids do not count
  - args: [['{"request_id":"w","level":"WARN","status":404}', '  {"request_id":"v","status":500}  ', '{"request_id":7,"status":500}']]
    expected: {"failed": ["v"], "malformed": 0}
    hidden: true
    label: whitespace and non-string ids
hints:
  - "Wrap the parse in try/except (or try/catch); a parse error means malformed."
  - "In JavaScript both null and arrays have typeof 'object'; check for them explicitly."
  - "A numeric status excludes booleans and strings; check the type before comparing."
```

## Exercise: continue or restart a trace

Every service in a traced system runs this decision on every inbound request, and the rules in the decoding table are the whole of it.

```exercise
id: next-traceparent
title: Validate an incoming traceparent and build the outgoing one
prompt: |
  Implement `next_traceparent(header, span_id, fresh_trace_id)`. `header` is
  the incoming `traceparent` value or `null`. `span_id` is the 16-hex-character
  id of the span this service creates for its outbound call, and
  `fresh_trace_id` is a 32-hex-character id to use if a new trace must start.

  The header is valid when, splitting on `-`:
  - there are at least four fields; `version`, `trace-id`, `parent-id` and
    `flags` are the first four;
  - `version` is 2 lowercase hex characters and not `ff`; if it is `00`
    there must be exactly four fields (a higher version may carry more,
    which you ignore);
  - `trace-id` is 32 lowercase hex characters, not all zeros;
  - `parent-id` is 16 lowercase hex characters, not all zeros;
  - `flags` is 2 lowercase hex characters; the trace is sampled when bit 0
    of that byte is set.

  If valid, continue the trace: return
  `{"traceparent": "00-<trace-id>-<span_id>-<01 if sampled else 00>", "continued": true}`.
  Otherwise start a new sampled trace: return
  `{"traceparent": "00-<fresh_trace_id>-<span_id>-01", "continued": false}`.
languages: [python, javascript]
entry: next_traceparent
starter:
  python: |
    def next_traceparent(header, span_id, fresh_trace_id):
        # your code here
        return {"traceparent": "", "continued": False}
  javascript: |
    function next_traceparent(header, span_id, fresh_trace_id) {
      // your code here
      return { traceparent: "", continued: false };
    }
tests:
  - args: ["00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01", "b7ad6b7169203331", "0af7651916cd43dd8448eb211c80319c"]
    expected: {"traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-b7ad6b7169203331-01", "continued": true}
    label: continue a sampled trace; our span becomes the parent
  - args: ["00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00", "b7ad6b7169203331", "0af7651916cd43dd8448eb211c80319c"]
    expected: {"traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-b7ad6b7169203331-00", "continued": true}
    label: an unsampled caller stays unsampled
  - args: [null, "b7ad6b7169203331", "0af7651916cd43dd8448eb211c80319c"]
    expected: {"traceparent": "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01", "continued": false}
    label: no header starts a trace
  - args: ["ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01", "b7ad6b7169203331", "0af7651916cd43dd8448eb211c80319c"]
    expected: {"traceparent": "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01", "continued": false}
    label: version ff is invalid
  - args: ["00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01", "b7ad6b7169203331", "0af7651916cd43dd8448eb211c80319c"]
    expected: {"traceparent": "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01", "continued": false}
    label: an all-zero parent-id is invalid
  - args: ["00-00000000000000000000000000000000-00f067aa0ba902b7-01", "b7ad6b7169203331", "0af7651916cd43dd8448eb211c80319c"]
    expected: {"traceparent": "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01", "continued": false}
    hidden: true
    label: an all-zero trace-id is invalid
  - args: ["00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01", "b7ad6b7169203331", "0af7651916cd43dd8448eb211c80319c"]
    expected: {"traceparent": "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01", "continued": false}
    hidden: true
    label: uppercase hex is invalid
  - args: ["cc-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-03-what-the-future-will-be-like", "b7ad6b7169203331", "0af7651916cd43dd8448eb211c80319c"]
    expected: {"traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-b7ad6b7169203331-01", "continued": true}
    hidden: true
    label: a future version with extra fields and unknown flag bits
hints:
  - "Split on '-' and check each of the first four fields for length and characters separately."
  - "Only the lowest bit of the flags byte means sampled: parse the two hex characters and test value & 1."
  - "Version 00 has exactly four fields; a higher version may have more, and you read only the first four."
```

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| WARN and ERROR lines stop carrying `request_id` after a logging change | `RUST_LOG` raised above INFO for `ascend_api`, so the `request` span is never created | Keep the span's target at INFO; reduce noisy events instead |
| A deploy goes silent once boot starts migrating, until the health window closes | A broad directive (`sea_orm=warn`) prefix-matches `sea_orm_migration` and hides the migrator's progress (this app until `8f82820`) | Add the more specific `sea_orm_migration=info` |
| A malformed `DATABASE_URL` puts its password in the boot log | A library error quotes the input it rejected (sea-orm's connect error; this app until `8f82820`) | Redact where the error is created, as `redact_credentials` does |
| The lines about a failed coach reply carry no request ID | Work in a spawned task runs outside the handler's span | `.instrument(tracing::Span::current())` on the future; IDs in queue messages |
| The error dashboard shows twice the real failure count | Each 5xx writes the app's ERROR line and tower-http's `response failed` | Count `status` ≥ 500 on `finished processing request` |
| An event cannot be counted by its message | A field named `message` collides with the flattened message (`anthropic.rs` until `8f82820`) | Rename the field, as `provider_message` did |
| The metrics backend runs out of memory a day after a deploy | A label taken from the raw path or an ID: one series set per conversation | Label by route template; IDs go to logs and traces |
| p99 looks healthy while one instance's users wait seconds | Averaged per-instance percentiles or summaries | Export histograms and sum buckets before `histogram_quantile` |
| Dashboards say the coach answers in 400 ms while learners wait 20 s | The logged latency of an SSE response is time to headers | Record stream duration as its own field or histogram |
| Traces end at one service | A hop does not forward `traceparent`, or a queue drops it | Propagate in headers and message metadata; check in review |

## Trade-offs

| Approach | Cost per request | High-cardinality detail | Alerting and aggregation | In Ascend today |
|---|---|---|---|---|
| Structured logs | microseconds of CPU, hundreds of bytes per line | yes: any field | slow scans; log-based counts | yes |
| Log-based metrics | none in the app; paid at ingestion | no, once aggregated | adequate at low volume | possible on the platform |
| Prometheus-style metrics | a counter increment, nanoseconds | no: bounded labels only | fast, cheap, mergeable histograms | no |
| Traces, head-sampled | span creation plus export for the sampled share | yes, in attributes | per-trace; few rare events kept | no |
| Traces, tail-sampled | every span exported to a collector | yes | keeps every error and slow trace | no |

## Interviewer follow-ups

**"A user says the coach stopped mid-answer. Walk me through finding out why."** Model answer: take the `x-request-id` from the failed response (or the conversation ID from the URL), filter on `span.request_id`, and read the `finished processing request` line (status 200, time to headers), `coach stream error` from the instrumented task, and the provider's `anthropic stream error event` with its `kind`, which says whether the provider was overloaded or the transport broke. Common wrong answer: search the free text around the reported time.

**"Why can't you average p99 across instances?"** Model answer: a percentile depends on the ranks around it, which per-instance numbers discard; two fleets with identical per-instance p99s can have different fleet p99s. Export histograms, sum buckets by `le`, compute once, and put a bucket boundary at every SLO threshold. Common wrong answer: weight each instance's p99 by its request count.

**"What is in a traceparent, and what do you do with a malformed one?"** Model answer: version, 16-byte trace-id, 8-byte parent-id and flags with bit 0 for sampled, lowercase hex, all-zero IDs invalid; a malformed header means start a new trace and ignore `tracestate`, never fail the request. Common wrong answer: forward the header unchanged, which makes every downstream span a sibling of the caller's parent instead of a child of your call.

**"The logging bill doubled after a deploy. What do you check?"** Model answer: lines per request by `target`, then the filter: a `RUST_LOG` that enabled DEBUG for `tower_http` adds two lines to every request; a new per-token or per-chunk event multiplies by stream length. Fix the filter per target and move counting to metrics. Common wrong answer: shorten retention, which cuts the stored bytes but not ingestion.

**"Head or tail sampling here?"** Model answer: run the arithmetic: at 1% head sampling a five-request incident leaves a trace 4.9% of the time; tail sampling keeps every error for the price of buffering rate × wait traces in a collector, about 350 at 12 requests per second. Common wrong answer: raise the head rate, which multiplies storage and still misses most incidents.

## What mid-level engineers get wrong

- **Interpolating values into the message.** Nothing can be counted, and a reworded message breaks every saved query.
- **Raising the log level to save money without reading what disappears.** The request span goes with it, and the request ID with the span.
- **Spawning work without its context.** The lines written after the response are the ones an incident needs, and they are the ones without an ID.
- **Averaging percentiles, or exporting summaries from a fleet.** The dashboard stays green while one instance fails a slice of users.
- **Labelling metrics with paths or IDs.** The monitoring system becomes the outage.
- **Trusting a tool's latency field without checking what it measures.** For streams, time to headers is not time to answer.
- **Treating a malformed `traceparent` as an error**, or forwarding it unchanged.

## Senior signals

- You write logs as **constant messages with typed fields**, and you have read the formatter's output field by field, including what the filter hides.
- You make a **request ID** visible to users and present on every line, including lines from spawned tasks, and you treat incoming IDs as **untrusted input**.
- You measure latency with **histograms**, compute a percentile from buckets by hand, know where interpolation and the `+Inf` bucket mislead, and never merge summaries.
- You **count series before adding a label**, using the route template, never the raw path.
- You can decode a **`traceparent`**, say which span becomes the next parent, and choose **head or tail sampling** from arithmetic.
- You know what a log line **costs** in CPU and bytes, keep **secrets and personal data** out of logs, and log each error **once**.

## Check yourself

```quiz
- q: >-
    Which log statement is the most useful in production?
  options: ["info!(user = %id, lesson = %slug, seconds = secs, \"lesson completed\")", "debug!(request = ?req, user = %id, lesson = %slug, \"lesson completed\")", "info!(\"user {} completed lesson {} in {}s\", id, slug, secs)", "println!(\"[info] user={} lesson={} lesson completed\", id, slug)"]
  answer: 0
  explanation: >-
    A constant message with typed fields at info level can be counted, grouped and filtered by user or lesson. The interpolated version makes every line unique text; println bypasses levels, the subscriber and its JSON output even when it imitates key=value text; and the debug line is off in production and dumps the whole request, which is noisy and a data-leak risk when it is on.
- q: >-
    A histogram's cumulative buckets over five minutes are le=0.25: 960, le=0.5: 985, le=1: 994, le=2.5: 998 and le=+Inf: 1000. What does histogram_quantile(0.99, ...) return?
  options: ["About 0.78 s, interpolated inside the 0.5 to 1 s bucket", "Exactly 0.5 s, the lower bound of the bucket holding rank 990", "Exactly 1 s, the upper bound of the bucket holding rank 990", "Nothing useful without the raw latencies of the requests"]
  answer: 0
  explanation: >-
    Rank 990 falls in the bucket from 0.5 to 1 s, which holds 994 minus 985, or 9 requests, of which 990 minus 985, or 5, are needed: 0.5 + 0.5 x 5/9 = 0.778 s. The function assumes requests are spread evenly inside the bucket, so the true p99 is only known to lie between 0.5 and 1 s. A rank in the +Inf bucket would return 2.5 s, the largest finite bound.
- q: >-
    A teammate adds the request span's uri value as a label on Ascend's latency histogram. What is the concern?
  options: ["The span records the method as well, which duplicates a label", "Every lesson and every conversation id adds a new set of series", "Histograms cannot carry labels that are longer than the name", "Paths contain slashes, which are not allowed in label values"]
  answer: 1
  explanation: >-
    uri is the raw path, so each of hundreds of lesson paths and every coach conversation UUID mints its own label set, and a 12-bucket histogram stores 15 series per set; the count grows without bound. Label by the matched route template and keep IDs in logs and traces. Slashes are legal in label values.
- q: >-
    To cut log volume, production's RUST_LOG is changed to warn. WARN and ERROR events still appear. What else changes on those lines?
  options: ["Nothing changes; spans are not affected by the level filter at all", "They gain a spans list, because the span list is only hidden at info", "Their level field becomes lower case, as warn and error are written", "They lose the span object, so request_id disappears from them"]
  answer: 3
  explanation: >-
    EnvFilter filters spans as well as events. The request span is created with info_span! in ascend_api::app, so at warn it is never created, and with_current_span has no span to print. Every remaining WARN and ERROR line loses its request ID with no error anywhere. Keep the span's target at info and quieten noisy events instead.
- q: >-
    A service receives traceparent 00-00000000000000000000000000000000-00f067aa0ba902b7-01. What should it do?
  options: ["Reply 400, since the caller sent a malformed trace header", "Continue the trace, since the parent-id and flags are valid", "Forward the header unchanged, so the next service can decide", "Start a new trace and ignore any tracestate that came with it"]
  answer: 3
  explanation: >-
    An all-zero trace-id is invalid, so the header is ignored and the service starts a new trace; it must not parse tracestate from an invalid traceparent. Tracing is best-effort context, so it never fails the request. Forwarding the header unchanged would also be wrong for a valid one, because the parent-id on the wire must be the span that makes the next call.
- q: >-
    A service head-samples 1% of traces. An incident fails 5 requests. How likely is it that at least one of them was traced?
  options: ["Certain, since head sampling always keeps traces with errors", "About 5%, since each request is kept independently at 1%", "Exactly 1%, since the rate applies to the incident as a whole", "About 50%, since five requests give five separate chances"]
  answer: 1
  explanation: >-
    Head sampling decides before the outcome is known, independently per trace, so the chance is 1 - 0.99^5, about 4.9%. It cannot know which traces will fail. Tail sampling decides after the trace completes and keeps every error, at the cost of buffering spans in a collector for the decision wait.
```
