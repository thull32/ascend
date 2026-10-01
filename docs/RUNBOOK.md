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

## Backups

Railway backs up the Postgres volume on the schedules set on the volume itself
(Postgres service, Backups tab). `.railway/railway.ts` does not set them, so check
there after recreating the database. Turn on daily and weekly backups.

To restore, pick a backup in the Backups tab and restore it. Railway stages the
restore as a change that takes the service down briefly. Review it before
deploying. Afterwards, check `/api/readyz` and sign in.

## Prometheus storage

Metrics live on the `prometheus-data` volume, which `.railway/railway.ts` mounts at `/prometheus`
(`volumeMounts: { "/prometheus": promData }`: mount path to volume). The config engine silently ignores
any other shape, so check after recreating the service:

    railway volume list                      # "Attached to: N/A" means it is not mounted
    railway volume --service <prometheus service id> attach --volume prometheus-data --yes
    railway volume --service <prometheus service id> update --volume prometheus-data --mount-path /prometheus

If `railway config plan` ever proposes setting a volume attachment to null, it is about to detach
it; stop and fix the file (`railway config pull --json` shows the shapes the engine reads).

The service runs with `RAILWAY_RUN_UID=0`, because the volume is owned by root and the image runs as
`nobody`. If Prometheus logs `fs_type=OVERLAYFS_SUPER_MAGIC` at start-up, the volume is not mounted,
and metrics are lost on every deploy.

## Domains

`ascend.engineering` is registered at Cloudflare, which also hosts its DNS. The app is served at
`https://ascend.engineering` and Grafana at `https://grafana.ascend.engineering`. `www` and the Railway
domain answer with a 308 to the apex (`REDIRECT_HOSTS`), because the CSRF check accepts only
`PUBLIC_ORIGIN`.

Each host needs two records at Cloudflare. The first is a CNAME to the target that Railway shows
(`railway domain status <host> --service <svc>`). The second is the TXT record
`_railway-verify[.<sub>]`. Keep the CNAMEs **DNS only** (grey cloud). If they are proxied, requests
reach Railway from Cloudflare addresses, so `X-Real-IP` and every per-IP rate limit see Cloudflare
instead of the learner.

To add a host: run `railway domain <host> --service <svc>` (custom domains cannot be registered from
`railway.ts`), add both records, then list the host in that service's `domains` in `railway.ts`.

## Invites

Sign-up is invite-only in production (`SIGNUPS=invite` in `.railway/railway.ts`). Existing accounts
are unaffected. Manage invites from inside the app container:

    railway ssh --service ascend -- /usr/local/bin/ascend-api --create-invite --note "Sam"
    railway ssh --service ascend -- /usr/local/bin/ascend-api --create-invite --uses 20 --days 14 --note "meetup"
    railway ssh --service ascend -- /usr/local/bin/ascend-api --list-invites
    railway ssh --service ascend -- /usr/local/bin/ascend-api --revoke-invite <id>

`--create-invite` prints a link (`https://ascend.engineering/register?invite=<code>`). The default is
one sign-up with no expiry. The code is shown once, because only its hash is stored. Unknown, used-up,
expired and revoked codes all get the same refusal. A sign-up that fails (for example, the email is
taken) does not spend a use.

To run the end-to-end suites against production, create a multi-use invite with a short expiry and
pass it as `E2E_INVITE`. Revoke it afterwards.

To open sign-up again, set `SIGNUPS: "open"` and apply.
