# Grafana for Ascend: dashboards and alert views over Prometheus (metrics,
# SLOs), Jaeger (traces) and Alertmanager (firing alerts), all provisioned
# from this directory so the whole setup is code. Sign-in only (admin
# password from GF_SECURITY_ADMIN_PASSWORD, a Railway secret); no sign-up,
# no anonymous access. Stateless: edits made in the UI are not kept, change
# the files instead.
FROM grafana/grafana:13.2.2@sha256:ac461fb352abc50da10a51c7d02462e9c05488f11f53f14b3ad79a8145f638a0
COPY provisioning /etc/grafana/provisioning
COPY dashboards /var/lib/grafana/dashboards
ENV GF_USERS_ALLOW_SIGN_UP=false \
    GF_AUTH_ANONYMOUS_ENABLED=false \
    GF_ANALYTICS_REPORTING_ENABLED=false \
    GF_ANALYTICS_CHECK_FOR_UPDATES=false \
    GF_NEWS_NEWS_FEED_ENABLED=false \
    GF_SERVER_HTTP_ADDR=:: \
    GF_SERVER_HTTP_PORT=3000 \
    PROMETHEUS_URL=http://prometheus.railway.internal:9090 \
    JAEGER_URL=http://jaeger.railway.internal:16686 \
    ALERTMANAGER_URL=http://alertmanager.railway.internal:9093
