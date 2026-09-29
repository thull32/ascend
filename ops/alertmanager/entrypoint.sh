#!/bin/sh
# Writes alertmanager.yml from ALERT_WEBHOOK_URL, then starts Alertmanager.
set -eu
url="${ALERT_WEBHOOK_URL:-}"
case "$url" in
  "") receiver='- name: default' ;;
  https://discord.com/api/webhooks/*|https://discordapp.com/api/webhooks/*)
    receiver="- name: default
    discord_configs:
      - webhook_url: '$url'" ;;
  https://hooks.slack.com/*)
    receiver="- name: default
    slack_configs:
      - api_url: '$url'
        send_resolved: true
        title: '{{ .CommonAnnotations.summary }}'
        text: '{{ range .Alerts }}{{ .Annotations.summary }} ({{ .Labels.severity }}) {{ .Annotations.runbook }}{{ end }}'" ;;
  *)
    receiver="- name: default
    webhook_configs:
      - url: '$url'
        send_resolved: true" ;;
esac
mkdir -p /etc/alertmanager
cat > /etc/alertmanager/alertmanager.yml <<YAML
route:
  receiver: default
  group_by: [alertname]
  group_wait: 30s
  group_interval: 5m
  # Pages repeat hourly until resolved; tickets every 12 hours.
  repeat_interval: 12h
  routes:
    - matchers: ['severity="page"']
      repeat_interval: 1h
receivers:
  $receiver
YAML
exec /bin/alertmanager \
  --config.file=/etc/alertmanager/alertmanager.yml \
  --storage.path=/alertmanager \
  --web.listen-address=[::]:9093 \
  --cluster.listen-address=
