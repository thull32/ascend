# Alertmanager for Ascend: receives firing alerts from Prometheus
# (ops/prometheus/rules.yml) and notifies ALERT_WEBHOOK_URL (a Discord or
# Slack incoming webhook, or any URL that accepts Alertmanager's webhook
# JSON). Without it, alerts are still visible in Alertmanager and Grafana.
FROM prom/alertmanager:v0.34.1@sha256:e9733bafb1bdef9b00e25a21f8f99dc26a22224bf16641ad754d1649f4c3357a
COPY --chmod=0755 entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
