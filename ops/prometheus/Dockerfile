# Prometheus for Ascend: receives metrics over OTLP (every app replica pushes
# its own, labelled with its replica id) and evaluates the SLO recording and
# alerting rules in rules.yml. Deployed as its own Railway service with a
# volume for the TSDB (.railway/railway.ts); reached only over the private
# network.
FROM prom/prometheus:v3.15.0@sha256:efd719c99d83b060d9daefdcf00360461adf279f45ef5391f8d111892118753e
COPY prometheus.yml rules.yml /etc/prometheus/
CMD ["--config.file=/etc/prometheus/prometheus.yml", \
     "--storage.tsdb.path=/prometheus", \
     "--storage.tsdb.retention.time=30d", \
     "--storage.tsdb.retention.size=8GB", \
     "--web.enable-otlp-receiver", \
     "--web.listen-address=[::]:9090"]
