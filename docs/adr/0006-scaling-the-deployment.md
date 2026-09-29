# 0006. Scale out: separate grading, push telemetry, budget connections

- Status: accepted
- Date: 2026-09-29

## Context

Ascend ran as one replica: the API graded code in-process, logs were the only
telemetry, and the connection pool was sized for one process. To take real
traffic it needs more than one replica, capacity that grows where the load
is, and a way to know it is working without reading logs.

## Decision

- **Grading is its own service** (`ascend-api --serve-grader`, the same
  image). It holds the WebAssembly runtimes and a shared token, nothing else,
  and has no public domain. The API sends jobs over Railway's private network.
  Grading is CPU-bound and bursty; separating it lets it scale on its own
  replicas without adding API replicas or database connections, and moves
  untrusted code away from every secret.
- **Two or more API replicas.** Everything that must be shared already lives
  in Postgres (sessions, budgets, security rate limits, retention's advisory
  lock). Each replica's pool is `DATABASE_POOL_MAX` (15); boot checks the
  budget against `max_connections`.
- **Telemetry is pushed over OTLP.** Every replica sends its own metrics
  (to Prometheus's OTLP receiver) and traces (to Jaeger), labelled with its
  replica id. Railway's docs do not say how internal DNS resolves for a
  multi-replica service, and push needs no per-replica discovery.
- **SLOs and alerts are code** (`docs/SLO.md`, `ops/prometheus/rules.yml`),
  evaluated by Prometheus, routed by Alertmanager, shown in a provisioned
  Grafana. The whole stack deploys from `.railway/railway.ts`.
- **Retention** bounds the tables that grow per attempt and per message.

## Alternatives considered

- **A hosted observability vendor.** Less to run, but an account and a bill
  to set up; the app speaks OTLP, so moving later is a change of endpoint.
- **Scraping `/metrics`.** Needs each replica's address; pushing avoids it.
- **A connection pooler now.** Needed around the fifth replica, not the
  second; the budget check says when.
- **Grading in the API with more replicas.** Scales grading and everything
  else together, and keeps untrusted code next to the secrets.

## Consequences

- Five more services to keep healthy (grader, Prometheus, Alertmanager,
  Jaeger, Grafana), all declared in `railway.ts`.
- Grading adds a network hop (a millisecond on the private network) and one
  retry on a busy replica.
- Jaeger keeps traces in memory: a restart loses them. Metrics are kept 30
  days on a volume.
- Alerts only notify once `ALERT_WEBHOOK_URL` is set.

## Revisit when

- Past about four API replicas: add PgBouncer (see the runbook).
- Traces are needed across restarts: give Jaeger persistent storage, or use
  a hosted backend.
