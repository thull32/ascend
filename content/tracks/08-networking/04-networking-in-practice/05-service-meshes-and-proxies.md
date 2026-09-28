---
slug: service-meshes-and-proxies
title: "Service meshes and proxies: what a sidecar does to every request"
description: How reverse proxies and L7 load balancers work, one request traced through Envoy's listener, filter chain, route, cluster and endpoint, how xDS delivers configuration with ACK and NACK, how iptables interception and SPIFFE mTLS work, sidecar versus ambient versus proxyless, what an extra hop costs (measured), and how to read a mesh's failures.
minutes: 23
difficulty: medium
tags: [networking, service-mesh, proxies, envoy, sidecar, mtls, observability, retries, istio, linkerd, xds, spiffe, ambient]
problems: []
---
You run forty services written in four languages. Every call between them needs the same things: encryption and authentication, a timeout, retries that do not become a storm, a circuit breaker, load balancing per request rather than per connection, metrics and traces labelled the same way everywhere, and a way to send 1% of traffic to a new version. You can build that as a library and maintain it four times, keeping every version's retry semantics identical. Netflix took that road for years with a set of JVM libraries (Eureka for discovery, Ribbon for client-side load balancing, Hystrix for circuit breaking), and it worked because nearly everything ran on the JVM.

The other road is to put a proxy next to every process and make the proxy do it, in one implementation, for every language. Add a control plane that configures all the proxies and you have a **service mesh**. It moves a great deal of complexity out of application code and into a network hop you now have to understand. This lesson traces one request through that hop object by object, shows how its configuration arrives, measures what an extra userspace hop costs, and reads the failures it produces.

## Proxies: two connections, not one

A **reverse proxy** accepts connections on behalf of servers (NGINX, HAProxy, Envoy, a cloud load balancer, the edge proxy of a platform such as Railway). A **forward proxy** makes connections on behalf of clients (a corporate egress proxy). Either way, a proxy is always *two* connections: downstream, from the client to the proxy, and upstream, from the proxy to the backend. Three consequences follow, and each is a classic production bug.

- **The backend sees the proxy's address.** The original client address has to be carried in a header (`X-Forwarded-For`, `X-Real-IP`) or in the PROXY protocol. A backend must trust only a header that its own proxy sets and overwrites, because anything else is client-supplied. The [rate limiting lesson](/learn/networking/network-algorithms/rate-limiting-algorithms) shows how Ascend reads the client address from the header its edge proxy sets, for exactly this reason.
- **Timeouts and keep-alives exist on both sides**, and they must be ordered so that each client side closes idle connections before its server side does. Get it wrong and the proxy returns 502s or 503s at random (the idle-timeout race traced and measured in the pooling lesson linked below, and a failure mode at the end of this one).
- **The proxy pools upstream connections**, so everything in [Connection pooling and keep-alive](/learn/networking/networking-in-practice/connection-pooling-and-keep-alive) now happens inside the proxy.

The other axis is how much of the traffic the proxy understands.

| | L4 (TCP) proxy | L7 (HTTP/gRPC) proxy |
|---|---|---|
| Sees | Connections and bytes | Requests, headers, status codes |
| Balances | Per connection | Per request |
| Can route by | Address and port (SNI with TLS passthrough) | Path, host, header, cookie, method |
| Can retry | A failed connection attempt | An individual request |
| Observes | Bytes, connection counts, durations | Request rate, error rate, latency per route |
| TLS | Passthrough, or terminate | Must terminate to see requests |
| Cost | Cheap | Parses every request |

For HTTP/2 and gRPC the difference is decisive: one connection carries every request a client makes, so an L4 proxy sends all of them to one backend. Only an L7 proxy balances them ([Load balancing](/learn/networking/application-protocols/load-balancing) has the algorithms).

## Envoy's object model

Envoy is the proxy inside Istio and many other meshes and gateways, and its object names show up in every mesh's documentation, metrics and error messages:

- A **listener** binds an address and port. **Listener filters** run before any bytes are handed on (`original_dst` recovers a redirected connection's real destination; `tls_inspector` and `http_inspector` sniff SNI, ALPN and protocol). A **filter chain match** then picks one of the listener's filter chains by destination port, SNI or transport protocol.
- A filter chain holds **network filters**. For HTTP the important one is the **HTTP connection manager** (HCM): it runs the codec (HTTP/1.1, HTTP/2 or HTTP/3), then a chain of **HTTP filters** (authorisation, rate limiting, fault injection, telemetry) ending in the **router**.
- A **route configuration** holds virtual hosts matched on the `Host` header; each virtual host holds **routes** matched on path, headers or method, and each route names a cluster plus a timeout and retry policy.
- A **cluster** is a named group of upstream endpoints with a load-balancing policy, connection pools, circuit-breaker thresholds, health checking and outlier detection.
- **Endpoints** are the actual addresses, grouped by locality.

## One request traced through two sidecars

The orders app calls `POST http://payments:8080/v1/charge` in an Istio mesh. The names are Istio's.

| Step | Where | Object | What happens |
|---|---|---|---|
| 1 | Orders pod kernel | iptables `nat` `OUTPUT` | The SYN to the payments ClusterIP 10.96.14.2:8080 is REDIRECTed to 127.0.0.1:15001; conntrack remembers the original destination |
| 2 | Orders Envoy | Listener `virtualOutbound` (15001) | `original_dst` reads 10.96.14.2:8080 and hands the connection to the listener for port 8080 |
| 3 | | Listener filters, filter chain match | `http_inspector` sees HTTP/1.1; the plaintext HTTP chain is selected |
| 4 | | Network filter: HCM | Parses the request, sets `x-request-id`, opens an access-log entry |
| 5 | | HTTP filters | Istio's telemetry and metadata-exchange filters, then the router, always last |
| 6 | | Route configuration `8080` | Virtual host for `payments.payments.svc.cluster.local` matches `Host: payments:8080`; route `prefix: /v1/charge` selects cluster `outbound\|8080\|\|payments.payments.svc.cluster.local` with its timeout and retry policy |
| 7 | | Cluster | Checks circuit-breaker thresholds; the least-request balancer picks 10.30.1.9:8080 from the EDS set; takes a pooled upstream connection |
| 8 | | Transport socket | mTLS using the certificate delivered over SDS; checks the server presents the expected SPIFFE ID |
| 9 | Payments pod kernel | iptables `nat` `PREROUTING` | The inbound SYN to port 8080 is REDIRECTed to 15006 |
| 10 | Payments Envoy | Listener `virtualInbound` (15006) | Chain matched on port 8080 and TLS; terminates mTLS; the RBAC filter checks principal `cluster.local/ns/orders/sa/orders` against the AuthorizationPolicy |
| 11 | | Router, `inbound\|8080\|\|` cluster | Forwards plaintext to the app inside the pod; the response retraces the path and both proxies log it |

Each object is inspectable: `istioctl proxy-config listeners|routes|clusters|endpoints <pod>`, or Envoy's admin endpoint (`localhost:15000/config_dump` in an Istio pod).

## Retries and circuit breakers in the route and cluster

A trimmed route and cluster for calls to payments:

```yaml
routes:
- match: { prefix: "/v1/charge" }
  route:
    cluster: payments
    timeout: 0.5s                  # total, including retries
    retry_policy:
      retry_on: "connect-failure,refused-stream"   # never reached the app: safe for POST
      num_retries: 2
      per_try_timeout: 0.2s
clusters:
- name: payments
  connect_timeout: 0.25s
  lb_policy: LEAST_REQUEST
  circuit_breakers:
    thresholds:
    - max_connections: 1000
      max_pending_requests: 100
      max_requests: 1000
      retry_budget:
        budget_percent: { value: 20.0 }   # retries at most 20% of active requests
        min_retry_concurrency: 3
  outlier_detection:
    consecutive_5xx: 5
    interval: 10s
    base_ejection_time: 30s
    max_ejection_percent: 50
```

Two things in that configuration catch people out.

First, the `retry_on` list. A proxy cannot know whether `POST /v1/charge` is safe to repeat. Retrying on `5xx` or `reset` means retrying requests that may already have charged a card. Retrying on `connect-failure` and `refused-stream` is safe, because in those cases the request provably never reached the application. Broader retry conditions belong only on routes that are idempotent or carry an idempotency key.

Second, the word "circuit breaker". Envoy's `circuit_breakers` are **concurrency caps**: when a cluster has 100 requests waiting for a connection, the 101st is rejected immediately. That is a bulkhead. Envoy's own defaults are 1,024 connections, pending requests and requests, and 3 concurrent retries; Istio raises them to effectively unlimited unless a DestinationRule sets them. The behaviour usually called a circuit breaker, stop calling something that keeps failing and try again later, is closer to **outlier detection**, which ejects an individual endpoint after five consecutive 5xx responses and readmits it after a cooling-off period.

```viz
{"type": "system", "scenario": "circuit-breaker", "title": "The classic breaker: closed, open, half-open", "caption": "In a mesh this behaviour is split in two: outlier detection ejects individual failing endpoints (a breaker per host), while the proxy's circuit_breakers settings cap concurrency to the whole cluster (a bulkhead)."}
```

## xDS: how configuration reaches the proxy

The control plane delivers every object above over gRPC streams, the **xDS** APIs: LDS (listeners), RDS (route configurations), CDS (clusters), EDS (endpoints, as `ClusterLoadAssignment`) and SDS (secrets: certificates and keys). Istio sends all of them over one stream, the **Aggregated Discovery Service** (ADS), so that it can order updates. Without ordering, a route can reference a cluster the proxy has not received yet, and requests fail with "no cluster" until it arrives. The xDS protocol's "make before break" order is CDS, then EDS for those clusters, then LDS, then RDS; removals go in reverse. Envoy also **warms** new clusters (waits for their endpoints) and listeners (waits for their routes) before using them.

Each message carries a version and a nonce. A `DiscoveryResponse` has `version_info`, `nonce`, `type_url` and the resources; Envoy answers with a `DiscoveryRequest` that is an **ACK** if it echoes the new version and the nonce, and a **NACK** if it repeats the last accepted version with the new nonce and an `error_detail`:

| Step | Direction | Type | `version_info` | Nonce | Meaning |
|---|---|---|---|---|---|
| 1 | Envoy → istiod | CDS | (empty) | (empty) | Subscribe on startup |
| 2 | istiod → Envoy | CDS | v41 | a1 | 212 clusters |
| 3 | Envoy → istiod | CDS | v41 | a1 | ACK: v41 applied |
| 4 | istiod → Envoy | EDS, then LDS, RDS | v41 | a2, a3, a4 | Endpoints, listeners, routes; each ACKed the same way |
| 5 | istiod → Envoy | CDS | v42 | b7 | A push containing an invalid cluster |
| 6 | Envoy → istiod | CDS | v41 | b7 | NACK with `error_detail`; Envoy keeps running v41 |

A NACK is safe for the proxy and silent for the operator: the new policy you applied is not in force. `istioctl proxy-status` shows per-type sync state (`SYNCED`, `STALE`, `NOT SENT`), and istiod exports a rejection counter (`pilot_total_xds_rejects`). In state-of-the-world xDS, every LDS or CDS response carries the *complete* set, so a single endpoint change in a large mesh can mean resending thousands of resources to thousands of proxies; **incremental (delta) xDS** sends only what changed.

## Under the hood: iptables REDIRECT to 15001 and 15006

The application calls `http://payments:8080` in plain HTTP and never knows the proxy exists. In a sidecar mesh an init container (or the Istio CNI plugin) installs `nat` rules in the pod's network namespace. Trimmed:

```text
-A PREROUTING -p tcp -j ISTIO_INBOUND
-A OUTPUT -p tcp -j ISTIO_OUTPUT
-A ISTIO_INBOUND -p tcp --dport 15021 -j RETURN          # health endpoint of the agent
-A ISTIO_INBOUND -p tcp -j ISTIO_IN_REDIRECT
-A ISTIO_IN_REDIRECT -p tcp -j REDIRECT --to-ports 15006
-A ISTIO_OUTPUT -m owner --uid-owner 1337 -j RETURN      # the proxy's own traffic
-A ISTIO_OUTPUT -d 127.0.0.1/32 -j RETURN
-A ISTIO_OUTPUT -j ISTIO_REDIRECT
-A ISTIO_REDIRECT -p tcp -j REDIRECT --to-ports 15001
```

The proxy runs as UID 1337, and that `RETURN` is what stops its own upstream connections from being redirected back to itself in a loop. `REDIRECT` rewrites the destination to a local port, and conntrack remembers the original, which the proxy reads with `getsockopt(SO_ORIGINAL_DST)`. The mechanism runs as-is in an unprivileged network namespace (`unshare -rn`) with one rule, `iptables -t nat -A OUTPUT -p tcp -d 10.96.0.0/16 -j REDIRECT --to-ports 15001`, and this script:

```python
import socket, struct, threading, time

SO_ORIGINAL_DST = 80                                   # from <linux/netfilter_ipv4.h>

def endpoint():                                        # the payments pod, on 127.0.0.1:18080
    ls = socket.create_server(("127.0.0.1", 18080))
    while True:
        c, _ = ls.accept(); c.recv(1024)
        c.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok"); c.close()

def sidecar():                                         # outbound listener on 15001
    ls = socket.create_server(("0.0.0.0", 15001))
    while True:
        c, peer = ls.accept()
        raw = c.getsockopt(socket.SOL_IP, SO_ORIGINAL_DST, 16)   # a struct sockaddr_in
        port, ip = struct.unpack("!2xH4s8x", raw)
        print(f"sidecar: accepted {peer} on {c.getsockname()}, original destination {socket.inet_ntoa(ip)}:{port}")
        up = socket.create_connection(("127.0.0.1", 18080))       # EDS would choose this
        up.sendall(c.recv(1024)); c.sendall(up.recv(1024)); up.close(); c.close()

threading.Thread(target=endpoint, daemon=True).start()
threading.Thread(target=sidecar, daemon=True).start()
time.sleep(0.2)
s = socket.create_connection(("10.96.14.2", 8080), timeout=2)     # the app believes it calls payments
print("app: peer", s.getpeername())
s.sendall(b"POST /v1/charge HTTP/1.1\r\nHost: payments:8080\r\nContent-Length: 0\r\n\r\n")
print("app: got", s.recv(1024).split(b"\r\n")[0].decode())
```

Run on Linux 6.18 (with a dummy interface holding 10.96.0.1/16), the app's socket reported its peer as `10.96.14.2:8080`, the sidecar accepted the same connection on `127.0.0.1:15001` and recovered `10.96.14.2:8080`, and the rule's counter read one packet: the `nat` table sees only a connection's first packet, and conntrack rewrites the rest.

## mTLS and workload identity

Each workload's identity is a **SPIFFE ID** of the form `spiffe://<trust-domain>/ns/<namespace>/sa/<service-account>`, such as `spiffe://cluster.local/ns/payments/sa/payments-api`. It is carried in an X.509 certificate's URI subject alternative name; SPIFFE calls such a certificate an **X.509-SVID**. In Istio the agent in the sidecar container (`pilot-agent`) generates a private key, which never leaves the pod, sends a certificate signing request to istiod authenticated with the pod's Kubernetes service-account token, and serves the signed certificate to Envoy over **SDS** on a Unix domain socket. Istio's default workload certificate lifetime is 24 hours, and the agent rotates it before expiry; Envoy swaps TLS contexts without dropping connections. The handshake and chain mechanics are in [TLS and PKI](/learn/networking/fundamentals/tls-and-pki).

Both sides present certificates, so policy is written in terms of identities rather than IP addresses, which mean nothing when pods are rescheduled every few minutes:

```yaml
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata: { name: payments-api, namespace: payments }
spec:
  selector: { matchLabels: { app: payments-api } }   # port-level settings need a selector
  mtls: { mode: STRICT }              # reject plaintext on every port...
  portLevelMtls:
    9090: { mode: PERMISSIVE }        # ...except metrics scraped from outside the mesh
---
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata: { name: charge-from-orders, namespace: payments }
spec:
  selector: { matchLabels: { app: payments-api } }
  action: ALLOW
  rules:
  - from: [{ source: { principals: ["cluster.local/ns/orders/sa/orders"] } }]
    to: [{ operation: { methods: ["POST"], paths: ["/v1/charge"] } }]
```

Know what mesh mTLS does not give you. It authenticates *workloads*, not end users, so payments still has to check that the user on whose behalf orders is calling may perform this charge. It does not protect you from a compromised pod, which holds a valid identity. The hop from the application to its own sidecar is plaintext over localhost. And **permissive mode**, which accepts both plaintext and mTLS during rollout, quietly accepts plaintext forever if nobody finishes the migration; verify strict mode with the mesh's metrics on plaintext connections, not with the configuration you believe you applied.

## The control plane

```viz
{"type": "system", "scenario": "service-mesh", "title": "Sidecars, a control plane and one request", "caption": "The control plane pushes routes, policy and certificates to every sidecar. Application code makes a plain HTTP call; the sidecars add mTLS, retries, outlier ejection, traffic splitting and telemetry."}
```

The **control plane** (Istio's istiod, Linkerd's control plane) watches the orchestrator's services and endpoints plus the mesh's own policy objects, compiles them into proxy configuration, pushes it over xDS, and runs the certificate authority. The client sidecar does not use DNS to find payments: it already holds the list of healthy endpoints and picks one per request. If the control plane goes down, the data plane keeps forwarding with its last known configuration, but new pods cannot get configuration or certificates, endpoint changes stop propagating, and certificates stop rotating; with 24-hour certificates, a day-long outage becomes an mTLS outage. It is a new tier-zero dependency with a delayed blast radius.

## Sidecar, ambient or proxyless

The sidecar's costs (a proxy per pod, start ordering, restarts to upgrade) have pushed meshes toward other shapes:

- **Ambient (Istio, generally available since 1.24).** A per-node proxy, **ztunnel** (written in Rust), handles mTLS, L4 authorisation and TCP telemetry. Pod traffic is redirected into it by the Istio CNI plugin, and node-to-node traffic travels over **HBONE**: HTTP/2 `CONNECT` tunnels inside mTLS on port 15008. L7 features (HTTP routing, retries, L7 authorisation) run only where you deploy a **waypoint**, an Envoy per namespace or service account through which ztunnel routes that service's traffic.
- **eBPF-based.** Cilium enforces L4 policy in the kernel and uses a per-node Envoy for L7.
- **Lighter sidecars.** Linkerd keeps the sidecar model with its own small Rust proxy, trading Envoy's feature breadth for lower overhead.
- **Proxyless gRPC.** gRPC libraries (Go, Java, C++) consume xDS directly through an `xds:///` target and do routing, balancing and mTLS in-process: no extra hop, but back to the library model, per language.

| Shape | Proxies on the path A → B | Where L7 runs | Memory | Upgrade | One proxy failing affects |
|---|---|---|---|---|---|
| Sidecar | 2 Envoys | Both sidecars | One Envoy per pod | Restart every pod | One pod |
| Ambient, L4 only | ztunnel on each node | Nowhere | One ztunnel per node | Roll a DaemonSet | Every meshed pod on the node |
| Ambient with waypoint | 2 ztunnels + 1 waypoint | The waypoint | Per namespace or service account | Roll the waypoint | Every service behind it |
| Proxyless gRPC | None | The client library | In-process | Redeploy the app | One process |
| Library (Hystrix era) | None | The library | In-process | Redeploy every service, per language | One process |

## What an extra hop costs

Every call in a sidecar mesh crosses two extra proxies, each of which copies bytes between sockets in user space, and an L7 proxy also parses requests, runs filters and encrypts. The kernel part of that cost can be measured with the simplest possible proxy: a Python relay (one thread per direction, `TCP_NODELAY`, no parsing, no TLS) in front of a server that echoes 200-byte requests, each in its own process, on WSL2 loopback, 20,000 sequential requests on a persistent connection, median of three runs:

| Path | p50 | p99 | p99.9 |
|---|---|---|---|
| Direct | 72 µs | 122 µs | 159 µs |
| Through one relay | 153 µs | 236 µs | 296 µs |
| Through two relays (a sidecar at each end) | 235 µs | 343 µs | 421 µs |

Each relay added about 80 µs at the p50 and 110 µs at the p99. The outer relay consumed 4.9 s of CPU for 63,000 round trips, 78 µs each, 90% of it kernel time: four extra syscalls, two extra loopback traversals and two thread wake-ups per round trip. At that rate one Python relay would need about 8% of a core per 1,000 requests per second. This is not Envoy; it is the floor any userspace proxy pays before doing useful work.

For a real Envoy sidecar, reason in orders of magnitude and measure your own configuration:

- **Latency** per proxy is typically sub-millisecond at the p50 and can reach several milliseconds at the p99, depending on TLS, the number of filters, access logging, and above all CPU throttling when a sidecar's CPU limit is small. A request crossing five service hops crosses ten proxies.
- **Memory** runs from tens of megabytes to hundreds per sidecar, and depends mostly on how much configuration is pushed: clusters times endpoints. Without scoping, every sidecar holds every service in the mesh.
- **CPU** scales with requests per second, TLS handshakes and telemetry. Istio publishes per-release measurements of its sidecar, which have been on the order of a few tenths of a vCPU per 1,000 requests per second.

## Retries and timeouts in two places

The most common mesh incident is not a mesh bug. It is retry policy configured in two places at once. The application retries up to 3 attempts; its sidecar retries each attempt up to 2 more times. One logical call can now reach the payments service $3 \times 3 = 9$ times. Put that at each of three tiers and a single user request can become $9^3 = 729$ requests at the bottom of the stack during an outage, the amplification arithmetic from [Timeouts, retries and backoff](/learn/networking/networking-in-practice/timeouts-retries-and-backoff). Envoy adds `x-envoy-attempt-count` to upstream requests when configured to, which makes the multiplication visible at the receiver.

The rule is to retry in **one** place per hop. The mesh is usually the better place, because it can enforce a **retry budget** (the `retry_budget` above allows retries of at most 20% of active requests), and it applies the same policy to every language. Then make the application not retry, or retry only on errors the mesh cannot see.

Timeouts must nest the same way. If the route's total timeout is 500 ms, the application's own deadline for the call must be longer, or the application gives up while the mesh is still retrying on its behalf. Envoy's route timeout defaults to 15 s when nothing sets it (Istio disables it unless a VirtualService sets one), and Envoy tells the upstream its budget in `x-envoy-expected-rq-timeout-ms`. Better still, propagate the deadline: gRPC's `grpc-timeout` header carries the remaining budget, and a proxy or server can refuse work that cannot finish in time.

## Reading a mesh's errors

A 503 from a mesh is not necessarily a 503 from your service. Envoy's access log records a **response flag** that says who produced the response and why:

```text
[2026-09-26T09:12:44.512Z] "POST /v1/charge HTTP/1.1" 503 UO 112 81 0 - "-" "orders/4.2" "5f1c2a77" "payments:8080" "-"
[2026-09-26T09:12:44.530Z] "POST /v1/charge HTTP/1.1" 504 UT 112 24 500 - "-" "orders/4.2" "8d0b9e13" "payments:8080" "10.30.1.8:8080"
[2026-09-26T09:12:44.561Z] "POST /v1/charge HTTP/1.1" 200 - 112 57 31 29 "-" "orders/4.2" "c41e0f52" "payments:8080" "10.30.1.9:8080"
```

The columns after the status are the flags, bytes received, bytes sent, total duration in milliseconds, and the upstream's own service time. The first line is `UO` (upstream overflow): the *local* sidecar rejected the request in 0 ms because `max_pending_requests` was exceeded, and payments never saw it. The second is `UT`: the 500 ms route timeout expired. The third succeeded in 31 ms, 29 of which were spent upstream, so both proxies and the network added about 2 ms.

| Flag | Meaning | Where to look |
|---|---|---|
| `UO` | The client proxy's concurrency cap overflowed | The caller's cluster limits, or a slow upstream holding requests |
| `UF` | Could not connect upstream | Upstream crashed, port closed, network policy |
| `UH` | No healthy upstream endpoints | Health checks and outlier ejection |
| `UT` | Upstream request timed out | Upstream latency versus the route timeout |
| `URX` | Retry limit or budget exhausted | Upstream errors; the retries already happened |
| `UC` | Upstream closed the connection | Idle-timeout ordering, upstream restarts |
| `NR` | No route matched | Mesh configuration |
| `DC` | The downstream client disconnected | The caller gave up first: check its timeout |

Learning these flags turns "the mesh is returning 503s" into a specific statement about which side and which limit, which is most of an incident.

## Observability at L7, and its blind spot

Because every request passes through two proxies that understand HTTP, the mesh can report the golden signals (request rate, error rate, latency distribution) for every edge in the call graph, with the same labels in every language, without anyone writing instrumentation. That uniform service graph is often the feature that justifies the mesh.

The blind spot is **distributed tracing**. Each sidecar can emit a span for the request it forwarded, but it cannot know that the inbound request to orders *caused* the outbound call to payments; that link exists only inside the application. Unless the application copies the trace context headers (W3C `traceparent`, or the older B3 headers) from each inbound request onto the outbound requests it makes, you get a collection of disconnected one-hop traces.

Mesh metrics also measure from the proxy's point of view. A request that the sidecar retried twice before succeeding looks, to the application, like one slow success. Keep application-level metrics for what users experience, and use the mesh's per-edge metrics to find where. The wider practice is in [Observability](/learn/system-design/building-blocks/observability).

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Full-mesh config: push storms and sidecar OOM | Sidecar memory grows with the size of the cluster, not the traffic; OOMKilled proxies; istiod CPU spikes on every deploy; config convergence slows | `istioctl proxy-config clusters <pod>` lists thousands of clusters the workload never calls; `config_dump` is tens of MB | A `Sidecar` resource per namespace listing the hosts it calls, `exportTo` on services, discovery selectors; delta xDS |
| Startup and shutdown race | Connection refused or 503s in the first seconds of a pod's life; errors during termination; batch Jobs never finish | Errors correlate with pod age or termination, not load | Kubernetes native sidecars (init containers with `restartPolicy: Always`, on by default since 1.29), or Istio's `holdApplicationUntilProxyStarts`; tune drain duration |
| Retries in app and mesh | Upstream sees many times the user traffic during a partial outage | `x-envoy-attempt-count` above 1 on requests that the app also retried; `URX` flags | Retry in one layer with a budget; the other fails fast |
| STRICT mTLS breaks plaintext callers | Right after switching to STRICT, an external load balancer or Prometheus outside the mesh marks targets down while mesh traffic works | Inbound Envoy logs show failed TLS handshakes from node or LB addresses | Port-level `PERMISSIVE` for the health or metrics port, Istio's probe rewrite for kubelet probes, or health checks through the gateway |
| Idle-timeout mismatch | Sporadic 503 `UC` ("upstream connect error or disconnect/reset before headers") after quiet periods | The app closes idle keep-alive connections first: Node.js `keepAliveTimeout` defaults to 5 s, gunicorn to 2 s, while Envoy keeps upstream connections for up to an hour | Make the app's idle timeout longer than the proxy's, or set the proxy's upstream `idle_timeout` shorter; allow retry on reset for idempotent routes |

## Should you run one?

| Adopt a mesh when | Skip it when |
|---|---|
| Dozens of services in several languages | A handful of services in one language, where a shared client library does the job |
| You need mTLS everywhere for compliance or zero-trust | Network-level isolation already meets the requirement |
| You want uniform telemetry, canaries and traffic shifting without code changes | Nobody would own the control plane and its upgrades |
| A platform team exists to run it | Your latency budget per hop is a millisecond or two |

A common middle path is an **API gateway** at the edge for north-south traffic (authentication, per-key rate limits, request shaping) and client libraries or a lightweight mesh for east-west calls. Netflix's own path ran from the JVM library stack through Zuul as its edge gateway to adopting Envoy; the story is in [Netflix microservices and resilience](/learn/system-design/case-studies/netflix-microservices-and-resilience). Whichever you choose, the mechanisms are the ones this module has covered: timeouts that nest, retries with budgets, pools sized by Little's law, per-request load balancing, and consistent hashing (see [Consistent hashing and routing](/learn/networking/network-algorithms/consistent-hashing-and-routing)) when a request needs to land on a particular instance. The mesh only changes where they are configured.

## Interviewer follow-ups

**"How does a sidecar see traffic the application never addressed to it?"** Model answer: `nat`-table REDIRECT rules in the pod's network namespace send outbound TCP to 15001 and inbound to 15006; the proxy recovers the real destination with `SO_ORIGINAL_DST`, and its own traffic is excluded by UID to avoid a loop. Common wrong answer: "the app is configured with the proxy as an HTTP proxy", which is the forward-proxy model and needs app changes.

**"You applied an AuthorizationPolicy and nothing changed. What do you check?"** Model answer: whether the proxies accepted it: `istioctl proxy-status` for STALE types, istiod's rejection counter for NACKs, then `proxy-config` on the target pod to see whether the RBAC filter carries the rule; also whether the selector matches the pod. Common wrong answer: "restart the pods", which can hide a NACK that will recur on the next push.

**"Sidecar or ambient for a 2,000-pod cluster where only 30 services need L7 routing?"** Model answer: ambient: ztunnel gives mTLS and L4 policy to every pod without a per-pod proxy, and waypoints add L7 only for the 30 services; the trade is a node-level blast radius and a newer data path. Common wrong answer: "sidecars everywhere, memory is cheap", ignoring that per-pod memory scales with the whole mesh's configuration.

**"What does mesh mTLS prove about a request?"** Model answer: that the peer workload holds a key for a certificate whose SPIFFE ID the mesh CA issued to a service account; nothing about the end user, and nothing if that workload is compromised. Common wrong answer: "that the request is authorised."

## What mid-level engineers get wrong

- **Leaving retries in the application after adopting the mesh**, turning 3 attempts into 9 per hop.
- **Pushing full-mesh configuration to every sidecar**, then buying memory instead of scoping with a `Sidecar` resource.
- **Treating a 503 as the upstream's error** without reading the response flag; `UO` and `NR` were produced locally.
- **Switching to STRICT without inventorying plaintext callers** (external health checks, metrics scrapers, un-meshed jobs).
- **Assuming the mesh propagates traces**: it emits spans, but only the application can link inbound to outbound.
- **Ignoring idle-timeout ordering**: the side that closes an idle connection first must be the client side.

## Senior signals

- You describe any proxy as **two connections** and immediately ask about client-address headers, timeout ordering and upstream pooling.
- You can trace a request through **listener, filter chain, HCM, HTTP filters, router, route, cluster and endpoint**, and name the `istioctl proxy-config` command for each.
- You know how xDS delivers config (**ADS ordering, version and nonce, ACK and NACK**) and that a NACKed policy is silently not in force.
- You can explain **iptables REDIRECT to 15001/15006**, `SO_ORIGINAL_DST` and the UID 1337 exclusion, and SPIFFE identities delivered over **SDS** with 24-hour rotation.
- You compare **sidecar, ambient (ztunnel, HBONE, waypoints) and proxyless** on hops, memory, upgrades and blast radius, and you put per-hop costs in orders of magnitude with what they depend on.
- You check that retries live in **exactly one place** per hop, read **response flags** before blaming the upstream, and know the mesh does not authenticate end users or propagate trace context for you.

## Check yourself

```quiz
- q: >-
    The orders application retries a failed call up to 3 attempts in total, and its sidecar is configured with num_retries 2 for every attempt. During a payments outage, how many requests can one logical call send to payments?
  options: ["5", "9", "6", "3"]
  answer: 1
  explanation: >-
    Each of the application's 3 attempts becomes up to 1 + 2 = 3 tries in the sidecar, so 9 requests. Across several tiers this multiplies again. Retry in one place per hop, preferably the mesh with a retry budget.
- q: >-
    An Envoy access log shows "503 UO" with a duration of 0 ms for calls from orders to payments. What does it tell you?
  options: ["No route is configured in the mesh for payments", "The mTLS handshake between the sidecars failed", "Payments itself returned 503 because it is overloaded", "The orders sidecar rejected it at a concurrency cap"]
  answer: 3
  explanation: >-
    UO is upstream overflow: the local proxy's circuit-breaker thresholds (concurrency caps such as max_pending_requests) were full, so it failed fast in 0 ms and payments never saw the request. The cause is often a slow upstream holding requests open or limits sized too small, but the 503 itself came from the caller's side. A missing route would be NR.
- q: >-
    istiod pushes a CDS update that contains an invalid cluster. What does Envoy send back, and which configuration does it run afterwards?
  options: ["The new version with an error attached; it drops clusters until fixed", "The previous version, the new nonce and an error; it keeps old clusters", "Nothing; it closes the stream and reconnects to get a fresh snapshot", "The new version and nonce; it applies every cluster it managed to parse"]
  answer: 1
  explanation: >-
    A NACK is a DiscoveryRequest that repeats the last accepted version_info, echoes the rejected response's nonce and fills error_detail. Envoy keeps serving with the configuration it last ACKed, which is safe for traffic but means the new policy is silently not in force until someone notices the rejection.
- q: >-
    After a namespace's PeerAuthentication is switched to STRICT, an external load balancer marks every backend unhealthy while service-to-service traffic keeps working. What is the most likely cause?
  options: ["The control plane stopped pushing endpoints to the load balancer", "STRICT mode disables the application's health endpoint entirely", "Its plaintext health checks now fail the required mTLS handshake", "Sidecars now reject any request that lacks a traceparent header"]
  answer: 2
  explanation: >-
    The load balancer sits outside the mesh and has no workload certificate, so under STRICT its plaintext probes are refused by the inbound sidecar. Mesh callers present certificates and keep working. Fix it with a port-level PERMISSIVE exception for the health port, probe rewriting, or checks through the gateway.
- q: >-
    In Istio ambient mode, which component enforces an AuthorizationPolicy that allows only POST on the /v1/charge path?
  options: ["The ztunnel on the destination pod's node", "The ztunnel running on the source pod's node", "The waypoint proxy that serves the destination", "The istiod control plane, on each request"]
  answer: 2
  explanation: >-
    ztunnel is an L4 proxy: it does mTLS, identity-based L4 authorisation and TCP telemetry, and never parses HTTP, so it cannot see methods or paths. L7 policy runs in a waypoint, an Envoy deployed for the namespace or service account that the traffic is routed through. istiod only distributes configuration; it is never on the request path.
- q: >-
    Sporadic 503s with the UC flag appear on calls to a Node.js service, mostly on the first request after a quiet period. What is the likely cause?
  options: ["The app's sidecar is not ready yet when the request arrives", "Envoy's route timeout is shorter than the app's p99 latency", "Outlier detection ejects the app after five consecutive 5xx", "The app times out idle connections before Envoy does"]
  answer: 3
  explanation: >-
    Node.js closes idle keep-alive connections after 5 s by default, while Envoy keeps pooled upstream connections far longer, so Envoy sometimes sends a request on a connection the app closed a moment earlier and gets a reset: UC. A route timeout would show UT, ejection would show UH, and a startup race correlates with pod age, not idle periods.
```
