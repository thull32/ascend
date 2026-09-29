# Service level objectives

What "working" means for Ascend, measured from the app's own metrics
(`crates/core/src/metrics.rs`, pushed over OTLP to Prometheus) and enforced
by the rules in `ops/prometheus/rules.yml`. Keep the two in step.

| Objective | Target | SLI (Prometheus) | Window |
|---|---|---|---|
| **Availability** | 99.5% of API requests do not fail on our side | 1 − 5xx / all, `http_server_request_duration_seconds_count{http_route=~"/api.*"}` | 30 days |
| **API latency** | 95% of ordinary API requests answer within 250 ms | `…_bucket{le="0.25"}` / count, excluding coach, interview and submission routes | 1 hour |
| **Grading latency** | 95% of graded submissions answer within 5 s | `…_bucket{http_route="/api/submissions", le="5"}` / count | 1 hour |

**Why these numbers.** 99.5% allows 3.6 hours of failure a month: honest for
one region, one Postgres primary and a small team, and strict enough that a
bad deploy pages. 250 ms is a histogram boundary and comfortably above the
p95 of a cached content read or a single-row write. 5 s covers CPython's
start-up in the sandbox (about 0.1 s), the learner's code at its time limit
for typical tests, and a short queue; a learner's own time-limit failure is
still a fast answer, so it does not count against us.

**What is not an SLO.** Model calls (their latency is the provider's) and
the time to the first streamed token (tracked on the dashboard,
`ascend_ai_first_token_seconds`, but outside our control). Client errors
(4xx), including rate-limit refusals, are the client's.

## Alerts

Availability uses multi-window burn-rate alerts (Google SRE workbook,
"Alerting on SLOs"): an error budget of 0.5% over 30 days.

| Alert | Condition | Severity | Meaning |
|---|---|---|---|
| `ApiErrorBudgetFastBurn` | 1 h and 5 m error ratios above 14.4 × 0.5% | page | 2% of the month's budget gone in an hour |
| `ApiErrorBudgetSlowBurn` | 6 h and 30 m ratios above 6 × 0.5% | ticket | 5% gone in six hours |
| `ApiSlow` | fast-request ratio under 95% for 15 m | ticket | latency objective at risk |
| `GradingSlow` | fast-grading ratio under 95% for 15 m | ticket | add grader replicas |
| `GraderSaturated` | grading slots over 80% busy for 10 m | ticket | add grader replicas before learners wait |
| `DbPoolNearlyExhausted` | a replica over 90% of its pool for 5 m | ticket | see the connection budget |
| `NoTelemetry` | no API metrics for 15 m | ticket | the pipeline, not the app, may be down |

Alerts route through Alertmanager to `ALERT_WEBHOOK_URL` (Discord, Slack or
any webhook). Each carries a `runbook` link into [RUNBOOK.md](RUNBOOK.md).

## Where to look

Grafana (the `grafana` service's domain) has the "Ascend overview" dashboard:
the SLOs, traffic, errors, latency, grading, AI and capacity. Traces (a fifth
of requests, `OTEL_TRACES_SAMPLE_RATIO`) are in Grafana's Explore view from
the Jaeger data source.
