---
slug: dns
title: "DNS: resolution, caching, and the failover that did not happen"
description: The full resolution path from stub resolver to authoritative server, how to read dig output, what TTLs really control, and the caching and timeout failure modes that turn a DNS change into an outage.
minutes: 24
difficulty: easy
tags: [networking, dns, ttl, caching, geodns, resolver, failover]
problems: []
---
You fail over a database from `db-primary` to `db-replica` by changing a DNS record with a 60-second TTL. Ten minutes later half your application servers are still writing to the dead primary, one is throwing `SERVFAIL`, and a Java service will not switch until you restart it. Nothing in the failover plan was wrong about DNS as a protocol; everything was wrong about the caches between your application and the record you changed.

DNS is the first network operation almost every request makes, it has more independent caches in the path than any other layer, and its failure modes are quiet. This lesson walks the resolution path, reads the real tool output, and then spends most of its time on what goes wrong.

## The resolution path

A name is resolved right to left. `api.example.com.` (the trailing dot is the root) is looked up by asking the root servers who is authoritative for `com`, asking `com` who is authoritative for `example.com`, and asking `example.com`'s servers for `api`. Nobody does this from scratch per query; a hierarchy of caches sits in front of it.

```viz
{"type": "network", "scenario": "dns-resolution", "title": "Stub resolver, recursive resolver, then root, TLD and authoritative servers"}
```

The actors:

1. **The application** calls `getaddrinfo("api.example.com")`. In most languages this goes through the C library or the runtime's own resolver.
2. **The stub resolver** on the host (glibc, `systemd-resolved`, or the runtime) checks `/etc/hosts` and its own tiny cache, then sends a UDP query to the configured recursive resolver from `/etc/resolv.conf`.
3. **The recursive resolver** (the VPC resolver at `10.0.0.2` on AWS, your ISP's, `1.1.1.1`, or CoreDNS in a Kubernetes cluster) answers from cache if it can. Otherwise it walks the hierarchy: root → `.com` TLD → `example.com` authoritative, caching every answer and every referral.
4. **Authoritative servers** hold the zone and are the source of truth. Route 53, Cloudflare, NS1 and your own BIND are all authoritative servers.

The wire protocol is a 12-byte header (ID, flags, counts) followed by question and answer sections, over UDP port 53. Answers that exceed 512 bytes (or 4,096 with EDNS0) set the truncated bit and the client retries over TCP; DNS over TLS (853) and DNS over HTTPS (443) exist for the stub-to-recursive hop.

### Reading `dig`

`dig` is the tool; learn its output once and you can read every DNS problem.

```bash
$ dig api.example.com

; <<>> DiG 9.18 <<>> api.example.com
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 41922
;; flags: qr rd ra; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1

;; QUESTION SECTION:
;api.example.com.               IN      A

;; ANSWER SECTION:
api.example.com.        47      IN      CNAME   lb-7f3a.us-east-1.elb.example.net.
lb-7f3a.us-east-1.elb.example.net. 12  IN      A       203.0.113.9

;; Query time: 1 msec
;; SERVER: 10.0.0.2#53(10.0.0.2) (UDP)
;; WHEN: Tue Sep 22 10:41:07 UTC 2026
;; MSG SIZE  rcvd: 98
```

What each line tells you:

- `status: NOERROR` is the response code. `NXDOMAIN` means the name does not exist; `SERVFAIL` means the resolver could not get an answer (upstream timeout, DNSSEC failure, broken zone).
- `flags: qr rd ra`: response, recursion desired, recursion available. If `aa` (authoritative answer) is present you asked an authoritative server directly; without it you got a cached copy.
- The second column of an answer is the **remaining TTL** in seconds on this resolver's cache. `47` and `12` mean this answer was cached and will be refetched soon. Ask again and the numbers go down.
- `Query time: 1 msec` with the VPC resolver means a cache hit. 20–100 ms means the recursive resolver went to the authoritative servers.
- The CNAME chain is followed by the resolver and both records are returned; the client uses the final A record.

To see the whole path, bypass the caches:

```bash
$ dig +trace api.example.com
.                       518400  IN  NS  a.root-servers.net.
...                                              ;; Received 1097 bytes from 10.0.0.2#53 in 1 ms
com.                    172800  IN  NS  a.gtld-servers.net.
...                                              ;; Received 1170 bytes from 198.41.0.4#53 in 14 ms
example.com.            172800  IN  NS  ns-1.exampledns.net.
...                                              ;; Received 240 bytes from 192.5.6.30#53 in 22 ms
api.example.com.        60      IN  CNAME lb-7f3a.us-east-1.elb.example.net.
                                                 ;; Received 110 bytes from 198.51.100.53#53 in 9 ms
```

Note the TTLs at each level: root and TLD NS records are cached for days, so a cold resolution is normally two or three round trips, not five. And note that `+trace` shows the TTL the *authoritative* server sets (60), whereas the plain query showed what remained in the cache (47). To query one specific server: `dig @198.51.100.53 api.example.com`.

## Record types you will actually use

| Type | Maps | Notes |
|---|---|---|
| `A` / `AAAA` | name → IPv4 / IPv6 | Multiple A records are returned in rotating order (round-robin) |
| `CNAME` | name → another name | Cannot coexist with other records at the same name; forbidden at the zone apex (`example.com` itself) |
| `ALIAS` / `ANAME` | apex name → another name | Provider-specific; the authoritative server resolves the target and answers with A records, so the apex can point at a load balancer |
| `NS` | zone → its authoritative servers | Delegation; also what `+trace` follows |
| `MX` | domain → mail servers with priority | Lower preference value wins |
| `TXT` | name → free text | SPF, DKIM, domain verification, ACME challenges |
| `SRV` | `_service._proto.name` → priority, weight, port, target | Used by Consul, Kubernetes headless services, SIP; the only standard record that carries a port |
| `SOA` | zone → serial, refresh, and the **negative-cache TTL** | The last field is how long a resolver caches "this name does not exist" |
| `PTR` | IP → name (reverse) | Mail and logging; slow lookups here are a classic cause of slow SSH logins |

CNAME chains cost round trips on a cold cache: a name that CNAMEs to a CDN name that CNAMEs to a load-balancer name is three lookups. Resolvers follow them for you, but each link has its own TTL and its own chance to fail.

## TTLs and the cache hierarchy

The TTL on a record is a promise from the zone owner: "you may reuse this answer for this many seconds". It is the only lever you have over how quickly a change propagates, and it is honoured, ignored, capped and extended by a chain of caches you do not control.

| Cache | Typical behaviour |
|---|---|
| Authoritative server | Serves the configured TTL; changes are visible immediately when you query it directly |
| Recursive resolver | Honours TTL, but many cap it (some clamp anything over a day; some set a floor of 30–60 s) |
| OS stub cache (`systemd-resolved`, nscd, Windows DNS Client) | Usually honours TTL; can be flushed |
| Runtime cache | Where the trouble is. Older JVMs cached forever by default with a security manager (`networkaddress.cache.ttl`); Node caches nothing by default and re-resolves per `connect`; Go's resolver caches nothing; Python's `socket` caches nothing but `requests` sessions keep connections open |
| Connection pools | Not a DNS cache, but a pool holding open connections to the old IP behaves exactly like one: the record changed and nobody re-resolved because nobody reconnected |

The last row is the failover trap from the opening. A pool with 20 warm connections to `db-primary` will keep using them until they break. Lowering the TTL to 1 second does nothing for already-open connections. Failover plans that rely on DNS must also either close pools (a deploy, a signal, a max-connection-lifetime setting) or accept that switching takes as long as the longest-lived connection. [Connection pooling and keep-alive](/learn/networking/networking-in-practice/connection-pooling-and-keep-alive) works through the interaction in detail.

### Choosing a TTL

- **Low (30–60 s)**: for records you expect to change under duress: the entry point of a service, anything in a failover plan. The cost is more queries to authoritative servers, which is a bill (Route 53 charges per query) and a dependency (if your authoritative provider is down, low-TTL records expire from caches quickly and your name goes dark; high-TTL records keep working).
- **High (hours to a day)**: for stable infrastructure and NS/MX records.
- **Before a planned change**: lower the TTL at least one old-TTL ahead of time so caches have drained by the change window, then raise it again afterwards.

### Negative caching

A resolver also caches "no such name" (NXDOMAIN) and "no records of that type" (NODATA), for the SOA's minimum TTL. Deploy a service and query its name before creating the record, and the resolver may keep answering NXDOMAIN for the negative-cache TTL even after the record exists. The order is: create the record, wait, then query.

## DNS as a load balancer

Because the authoritative server answers each query independently, it can answer differently per query and per client. That makes DNS the coarsest load balancer in the stack and the only one that works before a connection exists.

- **Round-robin**: multiple A records, rotated per response. Clients typically use the first one; the spread depends on resolvers and client libraries actually rotating. Crude, but free.
- **Weighted records**: the authoritative server returns each record set with a probability. Canary 5% of traffic to a new region by weight.
- **Latency or geo routing (GeoDNS)**: the authoritative server looks at the recursive resolver's source address (or the client subnet if EDNS Client Subnet is passed through) and answers with the nearest region. This is how a global service returns `eu-west` addresses to Europeans. Its blind spot: it sees the resolver's location, not the client's, so a user in Madrid using a resolver in Frankfurt is "in Germany". EDNS Client Subnet mitigates that for the resolvers that send it.
- **Health-checked records**: the provider probes each target and stops returning failing ones. Failover latency is health-check interval plus TTL plus every cache above.

Compared with [load balancing](/learn/networking/application-protocols/load-balancing) at L4/L7, DNS balancing has no per-request visibility, no session awareness, and a propagation delay measured in TTLs; it is the right tool for steering between regions and the wrong tool for balancing across servers within one.

## Failure modes, ranked by how often they page you

**The stale connection pool.** Covered above. DNS was correct within seconds; the application did not reconnect.

**Resolver timeouts stack up.** glibc's default is a 5-second timeout with 2 attempts per configured nameserver (`options timeout:5 attempts:2`). If the first resolver in `/etc/resolv.conf` is unreachable, every fresh lookup pays 5 seconds before trying the second. A service that "sometimes takes exactly 5 seconds longer" is losing its first resolver. Set `options timeout:1 attempts:2 rotate` and put the resolver on the same network.

**Runtime caches ignore the TTL.** The JVM with a security manager historically cached successful lookups forever; the safe setting is `-Dnetworkaddress.cache.ttl=60` (and `cache.negative.ttl`). Some HTTP client libraries and some service meshes keep their own resolution caches with their own refresh rules. Ask each layer "when do you re-resolve" and write the answer down.

**Kubernetes `ndots` amplification.** Pod resolv.conf files typically have `search default.svc.cluster.local svc.cluster.local cluster.local` and `ndots:5`. A lookup for `api.example.com` (two dots, fewer than five) is first tried as `api.example.com.default.svc.cluster.local`, then the next two suffixes, each returning NXDOMAIN, before the bare name is tried. That is four queries, and with A and AAAA in parallel, eight, for one connection. Fix by using fully qualified names with a trailing dot or lowering `ndots`.

**SERVFAIL versus NXDOMAIN.** NXDOMAIN is definitive: the name does not exist, cached for the negative TTL. SERVFAIL means the resolver failed to get an answer: the authoritative servers were unreachable, a DNSSEC signature did not validate, or the zone is broken. SERVFAIL is retried by most clients; NXDOMAIN is not. If you see NXDOMAIN for a name you just created, you are looking at negative caching, not a resolver failure.

**The authoritative provider is the single point of failure.** With a 60-second TTL, if your DNS provider has an outage longer than 60 seconds, your service vanishes from the internet even though every server is healthy. Large services use two authoritative providers with the zone synchronised, and keep NS record TTLs long.

**Split-horizon surprises.** The same name resolves to a private address inside the VPC and a public one outside. A developer's laptop on the VPN gets one, CI gets the other, and "works on my machine" becomes a routing problem.

## A quick decision procedure

When a name "does not work", run this in order:

1. `dig +short name` from the affected host. No answer, `NXDOMAIN` or `SERVFAIL`? Note which.
2. `dig @<authoritative NS> name` to see what the source of truth says. If it differs from step 1, you are waiting on a cache; the remaining TTL in step 1's output tells you how long.
3. `dig +trace name` if the authoritative answer is wrong or missing, to find which level of the delegation is broken.
4. `cat /etc/resolv.conf` on the host for timeouts, `ndots` and which resolver it is actually using.
5. If DNS is fine and the app still hits the old address: it is a connection pool or a runtime cache, not DNS.

That procedure resolves the majority of "DNS is broken" tickets, and most of them end at step 5.

## Senior signals

- You separate the four caches (resolver, OS, runtime, connection pool) and know that a TTL change fixes only the first two.
- You read the remaining-TTL column in `dig` and use `@server` and `+trace` to bisect between cache and authority.
- You know glibc's 5-second resolver timeout and Kubernetes `ndots:5` by name, and you have fixed both.
- You design failover around connection lifetime, not just TTL, and you lower TTLs one old-TTL before a planned change.
- You use DNS for cross-region steering and never for intra-region balancing, and you can say why (no session awareness, resolver-location blind spot, TTL propagation).
- You treat the authoritative DNS provider as a single point of failure and know that low TTLs make that dependency tighter.

## Check yourself

```quiz
- q: >-
    You change an A record with a 60-second TTL to point at a new server. Fifteen minutes later a Python service using a persistent HTTP connection pool is still sending requests to the old server. Which explanation fits?
  options: ["The recursive resolver is ignoring the TTL", "The pool holds connections that were opened before the change; DNS is only consulted when a new connection is created", "Python caches DNS answers for an hour by default", "The old server is answering on behalf of the new one"]
  answer: 1
  explanation: >-
    Connection pools re-resolve only on connect. Warm connections to the old address stay valid until they close. TTL controls resolvers, not sockets. Fixes are a max connection lifetime, a pool drain on failover, or terminating the old server so the connections fail.
- q: >-
    dig returns status NXDOMAIN for a record you created two minutes ago, but dig @ns-1.provider.net returns the correct A record. What is happening?
  options: ["The zone has a syntax error", "The record was created in the wrong zone", "The recursive resolver cached a negative answer from an earlier query, for the SOA's negative-cache TTL", "NXDOMAIN means the resolver is down"]
  answer: 2
  explanation: >-
    The authoritative server has the record, so the zone is fine. Someone queried before the record existed and the resolver cached the NXDOMAIN. It will clear when the negative TTL expires, or when the resolver's cache is flushed. SERVFAIL, not NXDOMAIN, would indicate a resolver problem.
- q: >-
    A service occasionally takes almost exactly 5 seconds longer than usual to start a request, then proceeds normally. What is the most likely cause?
  options: ["TCP slow start", "The first nameserver in resolv.conf is unreachable and glibc waits its default 5-second timeout before trying the second", "The TLS certificate is being re-validated", "A CNAME chain with five links"]
  answer: 1
  explanation: >-
    glibc's resolver default is timeout 5 seconds per nameserver. A dead first resolver costs a full timeout on every uncached lookup. Slow start and TLS would not produce a fixed 5-second delay; a CNAME chain adds milliseconds, not seconds.
- q: >-
    Why is GeoDNS a good fit for steering users between regions but a poor fit for balancing requests across servers within one region?
  options: ["GeoDNS only supports two regions", "It decides once per TTL based on the resolver's location, with no visibility into per-request load or server health, so within a region a load balancer that sees every request does a far better job", "GeoDNS requires TCP", "Load balancers cannot operate across regions"]
  answer: 1
  explanation: >-
    DNS answers are cached and coarse; the authoritative server sees the resolver, not the client, and knows nothing about current connections. That is fine for choosing a region and inadequate for spreading load within one. Cross-region steering also needs a mechanism that works before any connection exists, which is exactly what DNS provides.
- q: >-
    Lowering a service's public A record TTL from 300 s to 10 s has which side effect on availability?
  options: ["None; TTL only affects propagation speed", "It makes the service more dependent on the authoritative DNS provider being up, because cached answers expire ten times faster during a provider outage, and it increases query volume and cost", "It increases TCP connection time", "It disables negative caching"]
  answer: 1
  explanation: >-
    A cached answer keeps working during an authoritative outage until it expires. Short TTLs shrink that buffer and multiply queries. The trade-off is faster failover versus a tighter coupling to the DNS provider, which is why critical zones use two providers.
```
