// Railway infrastructure for Ascend, as code. `railway config plan` shows the
// diff against the live project; `railway config apply` applies it.
// Secrets are never written here: `preserve()` keeps the value set in Railway
// (set once with `railway variables --set`, see docs/RUNBOOK.md#secrets).
//
// Topology (docs/ARCHITECTURE.md#deployment):
//   ascend        API + SPA, 2+ replicas behind Railway's edge
//   grader        grading service, same image, --serve-grader; no secrets,
//                 no public domain; the API reaches it on the private network
//   Postgres      one primary, 50 GB volume
//   prometheus    metrics (OTLP push from every replica) + SLO rules
//   alertmanager  alert routing to ALERT_WEBHOOK_URL
//   jaeger        traces (OTLP)
//   grafana       dashboards; the only observability service with a domain
import { defineRailway, github, image, postgres, preserve, project, service, volume } from "railway/iac";

const REPO = "thull32/ascend";
// ascend.engineering becomes canonical once Railway has verified it and
// issued its certificate. Until then the Railway domains stay canonical.
// RAILWAY_PUBLIC_DOMAIN cannot be used for this: once a custom domain is
// added it names the custom domain, verified or not.
const DOMAIN_LIVE = false;
const APP_ORIGIN = DOMAIN_LIVE ? "https://ascend.engineering" : "https://ascend-production-a7ce.up.railway.app";
const GRAFANA_ORIGIN = DOMAIN_LIVE ? "https://grafana.ascend.engineering" : "https://grafana-production-d1d7.up.railway.app";
const PHASE_2 = true; // the API grades through the grader service (set false to grade in-process again)

export default defineRailway(() => {
  const region = "us-east4-eqdc4a";
  const internal = (name: string, port: number) => `http://${name}.railway.internal:${port}`;
  // Telemetry for every app process: push to Prometheus and Jaeger.
  const telemetry = {
    OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: `${internal("prometheus", 9090)}/api/v1/otlp/v1/metrics`,
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `${internal("jaeger", 4318)}/v1/traces`,
    // A fifth of new traces: enough to debug with, bounded as traffic grows.
    OTEL_TRACES_SAMPLE_RATIO: "0.2",
  };

  const db = postgres("Postgres", { region });
  db.networking = { privateNetworkEndpoint: "postgres" };
  // Volume backup schedules are not managed here (an earlier attempt used a
  // shape the engine ignored); they are set on the Postgres volume in the
  // dashboard. See
  // docs/RUNBOOK.md, "Backups".
  const dbVolume = volume("postgres-volume", {
    region,
    sizeMB: 50000,
    allowOnlineResize: true,
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
  });

  const grader = service("grader", {
    source: github(REPO, { checkSuites: true }),
    // Same image as the API, a different role: see crates/api/src/grading_service.rs.
    startCommand: "/usr/local/bin/ascend-api --serve-grader",
    replicas: { [region]: 2 },
    healthcheck: "/healthz",
    healthcheckTimeout: 120,
    env: {
      // Shared with the API, which references it. Set once in Railway.
      GRADER_TOKEN: preserve(),
      // Two concurrent runs per replica; add replicas, not slots, to scale.
      GRADER_SLOTS: "2",
      HOST: "::",
      PORT: "8080",
      LOG_JSON: "true",
      RAILWAY_DEPLOYMENT_DRAINING_SECONDS: "40",
      ...telemetry,
    },
  });

  const app = service("ascend", {
    // Builds the root Dockerfile. A push to main deploys once CI passes.
    source: github(REPO, { checkSuites: true }),
    replicas: { [region]: PHASE_2 ? 2 : 1 },
    // DNS at Cloudflare, DNS only (not proxied): a proxied request would
    // reach Railway from a Cloudflare address, and X-Real-IP (rate limits)
    // would name Cloudflare instead of the learner.
    domains: ["ascend.engineering", "www.ascend.engineering"],
    // Migrations run on boot before the server binds, so a passing readiness
    // probe means the schema is current and Postgres is reachable.
    healthcheck: "/api/readyz",
    healthcheckTimeout: 120,
    env: {
      APP_ENV: "production",
      PUBLIC_ORIGIN: APP_ORIGIN,
      // Old and alternate hosts 308 to the canonical one (CSRF accepts one origin).
      ...(DOMAIN_LIVE ? { REDIRECT_HOSTS: "www.ascend.engineering,ascend-production-a7ce.up.railway.app" } : {}),
      DATABASE_URL: db.env.DATABASE_URL,
      // 2 replicas, and up to 4 while a deploy overlaps old and new: 4 x 15
      // = 60 of Postgres's 100 connections, leaving room for migrations and
      // psql. Boot warns if the headroom drops below 10.
      DATABASE_POOL_MAX: "15",
      // Railway's edge sets X-Real-IP; the rate limiter trusts only that header.
      CLIENT_IP_HEADER: "x-real-ip",
      AI_MODEL: "claude-opus-5-5",
      AI_DAILY_REQUESTS: "150",
      AI_DAILY_OUTPUT_TOKENS: "120000",
      ANTHROPIC_API_KEY: preserve(),
      // Account recovery email (Resend); set both to enable it.
      RESEND_API_KEY: preserve(),
      EMAIL_FROM: preserve(),
      CONTACT_EMAIL: preserve(),
      ...(PHASE_2 ? { GRADER_URL: internal("grader", 8080), GRADER_TOKEN: grader.env.GRADER_TOKEN } : {}),
      // Strict: a dangling cross-reference or malformed block fails the build.
      CONTENT_LENIENT: "0",
      // Time between SIGTERM and SIGKILL for a replaced deployment. The
      // server's own shutdown is bounded to fit inside it: 25 s for open
      // connections, then 30 s for replies still being persisted.
      RAILWAY_DEPLOYMENT_DRAINING_SECONDS: "60",
      ...telemetry,
    },
  });

  const promData = volume("prometheus-data", { region, sizeMB: 10000, allowOnlineResize: true });
  const prometheus = service("prometheus", {
    source: github(REPO, { rootDirectory: "ops/prometheus" }),
    volumeMounts: { "/prometheus": promData },
    healthcheck: "/-/ready",
    // Railway mounts volumes owned by root; the image runs as nobody.
    env: { PORT: "9090", RAILWAY_RUN_UID: "0" },
  });

  const alertmanager = service("alertmanager", {
    source: github(REPO, { rootDirectory: "ops/alertmanager" }),
    // A Discord or Slack incoming webhook, or any Alertmanager webhook URL.
    env: { ALERT_WEBHOOK_URL: preserve(), PORT: "9093" },
    healthcheck: "/-/ready",
  });

  const jaeger = service("jaeger", {
    // Held at 2.20: 2.21 removed the v1 query API (/api/services,
    // /api/traces) that Grafana's Jaeger data source calls.
    source: image("jaegertracing/jaeger:2.20.0@sha256:46a886260e04002d8f45e213fc39063fa11a50446048fdaa64786fc0840cb9f8"),
  });

  const grafana = service("grafana", {
    source: github(REPO, { rootDirectory: "ops/grafana" }),
    healthcheck: "/api/health",
    domains: ["grafana.ascend.engineering"],
    env: {
      PORT: "3000",
      GF_SECURITY_ADMIN_PASSWORD: preserve(),
      GF_SERVER_ROOT_URL: GRAFANA_ORIGIN,
    },
  });

  return project("ascend", {
    resources: [db, dbVolume, app, grader, promData, prometheus, alertmanager, jaeger, grafana],
  });
});
