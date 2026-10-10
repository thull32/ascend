---
lesson: service-meshes-and-proxies
source: 582659feb4c0101e
fit: great
desk:
  - "One request traced through two sidecars, step by step, with the Envoy objects named"
  - "The route and cluster configuration, and the xDS ACK and NACK table"
  - "The iptables rules and the redirect-and-recover script"
  - "The sidecar, ambient and proxyless comparison table, and the relay latency measurements"
  - "The access log lines and the response flag table"
---
## Introduction

You run forty services in four languages. Every call between them needs the same things: encryption and authentication, a timeout, retries that do not become a storm, a circuit breaker, load balancing per request rather than per connection, metrics labelled the same way everywhere, and a way to send 1 percent of traffic to a new version. You can build that as a library and maintain it four times, keeping every version's retry semantics identical. Netflix did that for years with JVM libraries, and it worked because nearly everything ran on the JVM.

The other road is to put a proxy next to every process and make the proxy do it, once, for every language. Add a control plane that configures all the proxies, and you have a service mesh. It moves a great deal of complexity out of application code and into a network hop you now have to understand.

Five ideas. A proxy is two connections. How a sidecar sees traffic nobody sent it. How configuration and identity reach the proxy, and how that fails silently. What the hop costs, and the shapes that reduce it. And the incident everyone has: retries configured twice.

## Two connections, not one

A reverse proxy accepts connections on behalf of servers: NGINX, HAProxy, Envoy, a cloud load balancer. Whatever it is, a proxy is always two connections. Downstream, from the client to the proxy. Upstream, from the proxy to the backend. Three classic bugs follow.

The backend sees the proxy's address, so the client's real address has to travel in a header, and the backend must trust only a header its own proxy sets and overwrites. Anything else is client-supplied. Timeouts and keep-alives exist on both sides, and they must be ordered so each client side closes idle connections first, or the proxy returns 502s and 503s at random. And the proxy pools upstream connections, so every pooling problem now happens inside the proxy.

The other axis is how much the proxy understands. A layer 4 proxy sees connections and bytes, and balances per connection. A layer 7 proxy sees requests, headers and status codes, and balances, routes, retries and observes per request. For HTTP/2 and gRPC the difference is decisive: one connection carries every request a client makes, so a layer 4 proxy sends all of them to one backend. Only layer 7 balances them.

## How a sidecar sees your traffic

Envoy is the proxy inside Istio and many other meshes, and its object names show up in every error message. A listener binds a port. A filter chain on it holds the HTTP connection manager, which parses the request and runs a chain of HTTP filters, ending in the router. A route matches the host and path and names a cluster, with a timeout and retry policy. A cluster is a group of upstream endpoints with a load balancer, connection pools and limits. And endpoints are the actual addresses.

But the orders application calls payments on port 8080 in plain HTTP and never knows a proxy exists. So how does the sidecar see traffic the application never addressed to it?

[pause]

Kernel rules. An init container installs network address translation rules in the pod's network namespace. Every outbound TCP connection is redirected to the proxy's port 15001, and every inbound one to 15006. The kernel's connection tracking remembers the original destination, and the proxy asks for it back with a socket option. One more detail matters: the proxy runs as user 1337, and a rule exempts that user's traffic, so the proxy's own upstream connections are not redirected back to itself in a loop. The lesson ran this mechanism in an unprivileged namespace: the application believed it was talking to the payments address, and the relay accepted the same connection on 15001 and recovered that address.

So one call from orders goes: redirected into the orders sidecar, matched to a route and a cluster, sent to an endpoint the sidecar picked itself, over mutual TLS. Then redirected into the payments sidecar, which terminates TLS, checks the caller's identity against policy, and hands plaintext to the application.

## Configuration and identity

The control plane, istiod in Istio, delivers every one of those objects over gRPC streams called the xDS APIs: listeners, routes, clusters, endpoints, and secrets. Istio sends them all over one aggregated stream, so it can order them. Without ordering, a route could reference a cluster the proxy has not received yet, and requests would fail with no cluster until it arrived. So clusters go first, then their endpoints, then listeners, then routes.

Each push carries a version and a nonce. Envoy answers with an acknowledgement, echoing the new version, or a rejection. Here is the important case. istiod pushes a cluster update containing an invalid cluster. Envoy replies with the previous version it accepted, the new nonce, and an error. The bad cluster is not applied. That is safe for traffic, and silent for you: the policy you just applied is not in force. So if you apply an authorisation policy and nothing changes, check whether the proxies accepted it, with proxy status and istiod's rejection counter, before you restart anything. A restart can hide a rejection that recurs on the next push.

Identity arrives the same way. Each workload gets a SPIFFE ID, naming its trust domain, namespace and service account, carried inside an X.509 certificate. The agent in the pod generates a private key that never leaves the pod, gets it signed by istiod, and serves the certificate to Envoy. Istio's default lifetime is 24 hours, rotated before expiry. Both sides present certificates, so policy is written in identities, not IP addresses, which mean nothing when pods move every few minutes.

Know what that does not give you. Mesh mutual TLS authenticates workloads, not end users. It does not protect you from a compromised pod, which holds a valid identity. The hop from the application to its own sidecar is plaintext over localhost. And permissive mode, which accepts both plaintext and TLS during a rollout, quietly accepts plaintext forever if nobody finishes. Switch to strict, though, and an external load balancer's plaintext health checks start failing while mesh traffic keeps working, because the balancer has no certificate.

The control plane is a new tier-zero dependency. If it goes down, proxies keep forwarding with their last configuration, but new pods get nothing, endpoint changes stop, and certificates stop rotating. With 24-hour certificates, a day-long control plane outage becomes an mTLS outage.

## What the hop costs, and the shapes

The lesson measured the floor any userspace proxy pays, with the simplest possible relay: no parsing, no TLS. Direct, a small request took 72 microseconds at the median. Through two relays, one at each end like a pair of sidecars, 235. Each relay added about 80 microseconds at the median and 110 at the 99th percentile, almost all of it kernel time. That is not Envoy. It is what any userspace hop pays before doing useful work.

For a real Envoy sidecar, think in orders of magnitude and measure your own. Latency per proxy is typically under a millisecond at the median and can reach several at the 99th percentile, especially when a small CPU limit throttles the sidecar. A request crossing five services crosses ten proxies. Memory runs from tens to hundreds of megabytes per sidecar, driven mostly by how much configuration is pushed. Without scoping, every sidecar holds every service in the mesh, and memory grows with the cluster, not the traffic. Istio publishes about 0.2 of a CPU and 60 megabytes per thousand requests a second for its 1.24 sidecar.

Those costs pushed meshes toward other shapes. Ambient mode in Istio puts one proxy per node, ztunnel, which does mutual TLS, layer 4 authorisation and TCP telemetry. Layer 7 features run only where you deploy a waypoint, an Envoy per namespace or service account. So in a 2,000-pod cluster where only 30 services need layer 7 routing, ambient gives every pod mutual TLS without a proxy per pod, and waypoints for just those 30. The trade is blast radius: one ztunnel failing affects every meshed pod on its node. And a policy that allows only POST on one path is enforced by the waypoint, never by ztunnel, which does not parse HTTP. At the other extreme, proxyless gRPC reads the mesh's configuration directly in the client library: no extra hop, but back to one library per language.

## Retries in two places, and reading the errors

The most common mesh incident is not a mesh bug. It is retry policy configured in two places. The application tries up to three times. Its sidecar retries each attempt twice more. How many requests can one logical call send to payments during an outage?

[pause]

Nine. Each of the application's three attempts becomes three tries in the sidecar. Put that at each of three tiers, and a single user request can become 729 requests at the bottom of the stack. The rule is to retry in one place per hop. The mesh is usually the better place, because it can enforce a retry budget, say at most 20 percent of active requests, and applies the same policy in every language. Timeouts must nest the same way: if the route's total timeout is 500 milliseconds, the application's own deadline must be longer, or it gives up while the mesh is still retrying on its behalf.

And which errors to retry. A proxy cannot know whether a charge is safe to repeat. Retrying on any server error or reset means retrying requests that may already have charged a card. Retrying on a connect failure or a refused stream is safe, because the request provably never reached the application.

A word on names. Envoy's circuit breakers are concurrency caps. When a hundred requests are already waiting for a connection, the next is rejected immediately. That is a bulkhead. The behaviour usually called a circuit breaker, stop calling something that keeps failing, is closer to outlier detection, which ejects one endpoint after five consecutive server errors and readmits it later.

Which brings us to reading a mesh's errors. A 503 from a mesh is not necessarily a 503 from your service. Envoy's access log records a response flag saying who produced it. UO, upstream overflow, in zero milliseconds: the caller's own sidecar hit its concurrency cap, and payments never saw the request. UT: the route timeout expired. UH: no healthy endpoints. NR: no route matched, a configuration problem. UC: the upstream closed the connection. Sporadic UC on a Node.js service after quiet periods is the idle-timeout race again: Node closes idle connections after 5 seconds by default, and Envoy keeps them far longer. Learning these flags turns "the mesh is returning 503s" into a statement about which side and which limit, which is most of an incident.

One blind spot. A mesh can report request rate, errors and latency for every edge in the call graph, in every language, with nobody writing instrumentation. But it cannot link an inbound request to the outbound call it caused. That link exists only inside the application. Unless the application copies the trace context headers onto its outbound requests, you get a pile of disconnected one-hop traces.

## In the interview

A follow-up the lesson expects. What does mesh mutual TLS prove about a request?

[pause]

That the peer workload holds a key for a certificate whose SPIFFE ID the mesh's certificate authority issued to a service account. Nothing about the end user, and nothing if that workload is compromised. The wrong answer is "that the request is authorised". Payments still has to check that the user orders is acting for may make this charge.

And should you run a mesh at all? Adopt one with dozens of services in several languages, a need for mutual TLS everywhere, a wish for uniform telemetry and canaries without code changes, and a platform team to run it. Skip it with a handful of services in one language, where a shared client library does the job, or a latency budget of a millisecond or two per hop. Either way, the mechanisms are this module's: timeouts that nest, retries with budgets, pools sized by Little's law, per-request balancing. The mesh only changes where they are configured.

## Recap

Four things to remember. A proxy is two connections, so ask about client-address headers, timeout ordering and upstream pools. A sidecar sees traffic through kernel redirect rules, and its configuration arrives over xDS, where a rejected push is silently not in force. Mesh mutual TLS proves workload identity, not user authorisation, and every proxy hop costs latency, memory and CPU, which ambient and proxyless shapes trade against blast radius and language. And retry in exactly one place per hop, and read the response flag before blaming the upstream.

At your desk: the request traced through two sidecars, the route and cluster configuration and the xDS table, the iptables rules and redirect script, the shape comparison and relay measurements, and the response flag table.
