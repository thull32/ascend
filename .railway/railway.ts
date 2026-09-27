// Railway infrastructure for Ascend, as code. `railway config plan` shows the
// diff against the live project; `railway config apply` applies it.
// Secrets are never written here: `preserve()` keeps the value set in Railway.
import { defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const region = "us-east4-eqdc4a";

  const db = postgres("Postgres", { region });
  db.networking = { privateNetworkEndpoint: "postgres" };
  const dbVolume = volume("postgres-volume", {
    region,
    sizeMB: 50000,
    allowOnlineResize: true,
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
  });

  const app = service("ascend", {
    // Builds the root Dockerfile. Pushing to main deploys.
    source: github("thull32/ascend", { checkSuites: false }),
    replicas: { [region]: 1 },
    // Migrations run on boot before the server binds, so a passing readiness
    // probe means the schema is current and Postgres is reachable.
    healthcheck: "/api/readyz",
    healthcheckTimeout: 120,
    env: {
      APP_ENV: "production",
      PUBLIC_ORIGIN: "https://${{RAILWAY_PUBLIC_DOMAIN}}",
      DATABASE_URL: db.env.DATABASE_URL,
      // Railway's edge sets X-Real-IP; the rate limiter trusts only that header.
      CLIENT_IP_HEADER: "x-real-ip",
      AI_MODEL: "claude-opus-5",
      AI_DAILY_REQUESTS: "150",
      AI_DAILY_OUTPUT_TOKENS: "120000",
      ANTHROPIC_API_KEY: preserve(),
      CONTENT_LENIENT: preserve(),
    },
  });

  return project("ascend", { resources: [db, dbVolume, app] });
});
