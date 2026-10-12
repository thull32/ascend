---
lesson: service-meshes-and-proxies
source: c8d3c4b5f6363461
---
## 1

The orders application retries a failed call up to 3 attempts in total, and its sidecar is configured with 2 retries for every attempt. During a payments outage, how many requests can one logical call send to payments?

A, 5. B, 9. C, 6. D, 3.

[think]

The answer is B: 9.

Each of the application's 3 attempts becomes up to 1 plus 2, or 3 tries in the sidecar, so 9 requests. Across several tiers, this multiplies again. Retry in one place per hop, preferably the mesh, with a retry budget.

## 2

An Envoy access log shows a 503 with the flag U O, and a duration of zero milliseconds, for calls from orders to payments. What does it tell you?

A, no route is configured in the mesh for payments. B, the mutual TLS handshake between the sidecars failed. C, payments itself returned 503 because it is overloaded. D, the orders sidecar rejected the request at a concurrency cap.

[think]

The answer is D: the orders sidecar rejected the request at a concurrency cap.

U O means upstream overflow: the local proxy's circuit-breaker thresholds, its concurrency caps, were full, so it failed fast in zero milliseconds, and payments never saw the request. The cause is often a slow upstream holding requests open, or limits sized too small, but the 503 itself came from the caller's side. A missing route would show a different flag.

## 3

The istiod control plane pushes a cluster configuration update to Envoy that contains an invalid cluster. What does Envoy send back, and which configuration does it run afterwards?

A, the new version with an error attached, and it drops clusters until the push is fixed. B, the previous version, the new nonce, and an error, and the bad cluster is not applied. C, nothing: it closes the stream and reconnects to get a fresh snapshot. D, the new version and nonce, and it reports the whole push as accepted.

[think]

The answer is B: the previous version, the new nonce, and an error, and the bad cluster is not applied.

A rejection is a request that repeats the last accepted version, echoes the rejected response's nonce, and fills in the error detail. The invalid cluster is not applied, though Envoy may still apply the valid clusters in the same push. That is safe for traffic, but it means the rejected policy is silently not in force until someone notices. A rejection never reports the new version, and Envoy neither drops its clusters nor reconnects.

## 4

After a namespace's peer authentication is switched to strict mode, an external load balancer marks every backend unhealthy, while service-to-service traffic keeps working. What is the most likely cause?

A, the control plane stopped pushing endpoints to the load balancer. B, strict mode disables the application's health endpoint entirely. C, its plaintext health checks now fail the required mutual TLS handshake. D, sidecars now reject any request that lacks a trace context header.

[think]

The answer is C: its plaintext health checks now fail the required mutual TLS handshake.

The load balancer sits outside the mesh and has no workload certificate, so under strict mode its plaintext probes are refused by the inbound sidecar. Mesh callers present certificates and keep working. Fix it with a permissive exception for the health port, probe rewriting, or checks through the gateway.

## 5

In Istio ambient mode, which component enforces an authorisation policy that allows only POST on the charge path?

A, the ztunnel on the destination pod's node. B, the ztunnel on the source pod's node. C, the waypoint proxy that serves the destination. D, the istiod control plane, on each request.

[think]

The answer is C: the waypoint proxy that serves the destination.

The ztunnel is a layer 4 proxy: it does mutual TLS, identity-based layer 4 authorisation and TCP telemetry, and never parses HTTP, so it cannot see methods or paths. Layer 7 policy runs in a waypoint, an Envoy deployed for the namespace or service account that the traffic is routed through. The istiod control plane only distributes configuration; it is never on the request path.

## 6

Sporadic 503s with the flag U C appear on calls to a Node.js service, mostly on the first request after a quiet period. What is the likely cause?

A, the app's sidecar is not ready yet when the request arrives. B, Envoy's route timeout is shorter than the app's 99th percentile latency. C, outlier detection ejects the app after five consecutive server errors. D, the app times out idle connections before Envoy does.

[think]

The answer is D: the app times out idle connections before Envoy does.

Node.js closes idle keep-alive connections after 5 seconds by default, while Envoy keeps pooled upstream connections far longer, so Envoy sometimes sends a request on a connection the app closed a moment earlier, and gets a reset: U C. A route timeout, or an ejection, would show different flags, and a startup race correlates with the pod's age, not with idle periods.
