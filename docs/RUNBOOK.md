# Runbook

What to do when an alert fires or a deploy misbehaves. Each alert in
`ops/prometheus/rules.yml` links to a section here. Objectives are in
[SLO.md](SLO.md); the deployment is in `.railway/railway.ts`.

## Secrets

Secrets live only in Railway variables (`preserve()` in `railway.ts` keeps
them out of the repository). Set or rotate with the CLI, which redeploys the
service:

```bash
railway variables --service grader --set "GRADER_TOKEN=$(openssl rand -hex 32)"   # the API references it
railway variables --service grafana --set "GF_SECURITY_ADMIN_PASSWORD=$(openssl rand -base64 24)"
railway variables --service ascend --set "RESEND_API_KEY=re_..." --set "EMAIL_FROM=Ascend <noreply@your-domain>"
railway variables --service alertmanager --set "ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/..."
```

Rotating `GRADER_TOKEN` redeploys the grader first; the API picks up the
reference on its next deploy, so redeploy the API right after
(`railway redeploy --service ascend`). Between the two, grading answers 503.

## API errors

`ApiErrorBudgetFastBurn` / `SlowBurn`.

1. Grafana, "Ascend overview": which routes carry the 5xx (requests by status
   class, then by route)? Was there a deploy at the start (`service_version`
   label on the series)?
2. A deploy: roll back by redeploying the previous deployment in Railway. The
   schema allows it (`migrate::Plan::SchemaAhead`: an older build starts
   against a newer schema without migrating).
3. Not a deploy: `railway logs --service ascend` filtered to `level":"ERROR"`;
   the request id in a log line finds its trace in Jaeger.
4. Database errors: see [database connections](#database-connections) and
   check Postgres in Railway (CPU, disk, connections).

## Latency

`ApiSlow`. Check the latency panel by route, then database pool use (a
saturated pool queues every request) and CPU per replica in Railway. Adding
API replicas helps CPU-bound slowness; it does not help a slow query (find it
from a trace's spans) or an exhausted Postgres.

## Grading

`GradingSlow`, `GraderSaturated`, or learners seeing "every code runner is
busy".

1. Slots busy (dashboard, "Queue wait p95 and slots busy") and graded runs by
   outcome: a wave of `time_limit` means learners' infinite loops, which hold
   a slot for their whole budget.
2. Add capacity: raise the `grader` replica count in `.railway/railway.ts`,
   `railway config plan`, then `railway config apply`. Each replica runs
   `GRADER_SLOTS` (2) at once; prefer replicas to slots.
3. The API retries a busy replica once; persistent 503s from `/api/submissions`
   mean every replica is full or the grader is down (`railway logs --service grader`).

## Database connections

`DbPoolNearlyExhausted`, or boot logs "connection budget nearly exhausted".
Every API replica holds up to `DATABASE_POOL_MAX` (15) connections, and a
rolling deploy briefly doubles the replicas. Postgres allows 100. Lower the
pool, remove replicas, or put a pooler (PgBouncer in transaction mode) in
front of Postgres; migrations need a direct connection because they take a
session-level advisory lock.

## Telemetry

`NoTelemetry`: check the `prometheus` service is up and has disk (volume
alert), then an API replica's logs for `telemetry export disabled` or OTLP
errors. The app keeps serving without telemetry; only visibility is lost.

## Email

Password reset or verification emails not arriving: `ascend_emails_total{outcome="failed"}`
on the dashboard, then `railway logs --service ascend` for "email failed";
the provider's error is logged, not shown to learners. Without
`RESEND_API_KEY` production reports email as unavailable and the UI hides it.
