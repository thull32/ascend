---
lesson: dns
source: 840e095a63132fd7
fit: great
desk:
  - "The query and response decoded byte by byte, including compression pointers"
  - "The cold resolution traced from the root to Cloudflare's servers"
  - "The record types table"
  - "The failure-mode table and the five-step diagnosis procedure with its dig commands"
  - "Exercise: build a DNS query"
  - "Exercise: decode a DNS response, compression pointers included"
---
## Introduction

You fail over a database from the primary to the replica by changing a DNS record with a 60 second TTL. Ten minutes later, half your application servers are still writing to the dead primary, one is throwing server failures, and a Java service will not switch until you restart it. Nothing in the plan was wrong about DNS as a protocol. Everything was wrong about the caches between your application and the record you changed.

DNS is the first network operation almost every request makes. It has more independent caches in its path than any other layer, and its failures are quiet until they are total. In October 2016, a botnet flooded Dyn's authoritative DNS service, and users routed to its US east coast servers could not reach sites like Twitter, Reddit and Spotify for about two hours, while every one of those sites was healthy. In October 2021, Facebook's routes to its own DNS servers were withdrawn and the company disappeared for about six hours. And in October 2025, an automation race inside AWS left the DNS record for DynamoDB's endpoint in the US East 1 region empty, and a large part of the region's services failed with it.

Three ideas, then. How a name actually gets resolved. Every cache that sits between you and the record, which is where failovers go wrong. And how to tell a DNS problem from something that only looks like one.

## The resolution path

A name is resolved right to left. The root knows who serves com. The com servers know who serves example.com. And example.com's servers know the address.

Four actors are involved. The application calls the system's lookup function, getaddrinfo. The stub resolver on the host checks the hosts file and sends the query to the recursive resolver named in its configuration; it does no walking of the tree itself. The recursive resolver, your VPC's resolver, CoreDNS in Kubernetes, your ISP's, or a public one, answers from its cache or walks the hierarchy, caching every answer and referral on the way. And the authoritative servers hold the zone and are the source of truth: Route 53, Cloudflare, your own servers.

The lesson traced a cold resolution for example.com with real data. The root server replied with a referral: ask the com servers, and that referral carries a TTL of two days. The com server replied with another referral, to Cloudflare's name servers, also two days. Cloudflare's server gave the final answer, with a TTL of 300 seconds.

Here is why those long TTLs matter. Every busy resolver already holds the root and com referrals, so a real miss is rarely three round trips. It usually costs one, to the authoritative server. Measured on the lesson's machine, a cached answer took 3 milliseconds, and uncached names took 26 to 40.

The messages themselves are tiny binary structures, normally one UDP datagram to port 53. The query for example.com was 29 bytes. Answers stay small because of compression: every repeated name becomes a two byte pointer back to where that name already appears. A classic UDP answer is limited to 512 bytes; an extension lets the client advertise a bigger buffer, and the 2020 DNS Flag Day settled on 1,232 bytes, the largest payload that avoids IP fragmentation on any IPv6 path. Anything bigger sets the truncated flag, and the client retries over TCP.

## TTLs and the caches you do not control

A record's TTL is the zone owner's promise that the answer may be reused for that many seconds. It is the only lever you have over how fast a change spreads, and a chain of caches you do not control honours it, caps it, floors it, or ignores it.

Walk the chain. The authoritative server serves the TTL you set, and a change is visible there immediately. The recursive resolver counts the TTL down; many cap long TTLs at a day or a week, and some impose a floor of 30 to 60 seconds. The operating system's cache usually honours the TTL, but plain glibc caches nothing at all.

The language runtime is where the surprises live. The JVM caches successful lookups for 30 seconds by default, and on older JDKs, installing a security manager made that cache last forever. Go and Python's socket module cache nothing. Node's lookup caches nothing and runs on a thread pool of 4 threads by default, so four slow lookups stall every file operation too.

And then the one that is not a DNS cache at all, but behaves like one: the connection pool. That is the failover trap from the opening. A pool with 20 warm connections to the primary keeps using them until they break. Lowering the TTL to one second does nothing to sockets that are already open. TTL governs resolvers, not sockets. So a DNS-based failover must also bound connection lifetime: a maximum connection age in the pool, a drain on failover, or killing the old server so connections fail fast.

Choosing a TTL, then. Low, 30 to 60 seconds, for anything in a failover plan, at the cost of more queries and a tighter dependency on your DNS provider, because cached answers stop protecting you after one TTL. High, hours to a day, for stable records. And before a planned change, lower the TTL at least one old TTL in advance, so caches have drained by the time you make the change.

## Negative caching and DNSSEC

Resolvers also cache absence: "no such name", and "the name exists, but not with that type". How long? The zone's SOA record says, and for example.com it said 1,800 seconds.

So picture this. Someone looks up your new service's name a minute before you create the record. How long can that lookup keep failing after you create it?

[pause]

Up to 30 minutes. The resolver cached the absence for the negative TTL, 1,800 seconds, and it will not ask again until that expires. The TTLs of other records in the zone do not apply. Create names before anything queries them. A whole category of "DNS propagation" debugging is really this.

A detail from the measurement: Cloudflare answered that non-existent name not with "no such name" but with an empty success response and a minimal proof, a technique that stops attackers from listing the zone's names. Clients treat both as "no address". Your monitoring may not.

DNSSEC makes answers verifiable. Each zone signs its records, the parent zone vouches for the child's key, and the chain goes up to the root, whose key is built into every validating resolver. The crucial behaviour: a validation failure produces a server failure, not a wrong answer. So a botched key rollover or an expired signature takes your zone offline for every validating resolver, like the big public ones, while non-validating resolvers keep working. That split is the signature of the problem. Slack's September 2021 outage followed this pattern: under 1 percent of its online users could not resolve slack.com for 24 hours.

DNSSEC authenticates; it does not encrypt. Encryption is DNS over TLS or DNS over HTTPS, which hide the stub-to-resolver hop from the local network. The trade-off is that a browser using its own resolver bypasses the corporate or VPC resolver, and the internal names and security filtering that come with it.

## Inside getaddrinfo

Most application code never speaks DNS. It calls getaddrinfo, and glibc's implementation decides a surprising amount of your latency.

It tries sources in order, usually the hosts file, then DNS. Container images without the configuration file for that order get glibc's built-in one, which is one reason a name resolves differently inside a container. If the name has fewer dots than a setting called ndots, it tries each search suffix first.

That setting causes a classic Kubernetes problem. Pods default to ndots of 5 with three search suffixes, so a lookup for an external API name is tried as three cluster names first. Four names, and with both IPv4 and IPv6 queries, eight queries for one lookup. Use fully qualified names with a trailing dot, or lower ndots for the pod.

Then the timeouts. glibc waits 5 seconds per server per attempt, trying servers in order. So if the first resolver in the list is unreachable, what does that look like from the application?

[pause]

Some requests take almost exactly 5 seconds longer, then proceed normally. That fixed number is the giveaway; CNAME chains cost milliseconds and slow start costs round trips. Fix it with a one second timeout and rotation across servers, or a local caching resolver.

One more: glibc sends the IPv4 and IPv6 queries in parallel from the same socket. On hosts that NAT DNS traffic, like Kubernetes nodes, the two packets can race in the connection tracker and one gets dropped, producing the same five second stalls. Resolver options that use a fresh socket, or send the queries one after the other, work around it.

## DNS as a load balancer

The authoritative server answers each query independently, so it can answer differently per query and per client. That makes DNS the coarsest load balancer in the stack, and the only one that acts before a connection exists.

It can rotate several addresses. It can weight answers, say 5 percent of resolutions to a canary region. It can route by location. And it can stop returning targets that fail health checks, where failover time is the probe interval times the failure threshold, plus the TTL, plus every cache and pool you just heard about.

Location routing has a blind spot. The authoritative server sees the recursive resolver, not the user. A user in Madrid on a resolver in Frankfurt is "in Germany", unless the resolver forwards the client's subnet. So DNS steering is right for choosing a region, and wrong for spreading load across servers inside one, where a load balancer that sees each request does far better.

When a name "does not work", the lesson's procedure is five steps. Ask from the affected host what it gets. Ask the authoritative server directly; if they differ, you are waiting on a cache. Trace the delegation only if the authoritative answer is wrong. Check the host's resolver configuration for timeouts and ndots. And if DNS is right but the application still reaches the old address, it is a pool or a runtime cache, not DNS. Most "DNS is broken" tickets end at that last step.

## In the interview

The follow-up you should expect: you lowered a record's TTL to 60 seconds and failed over, but traffic took 20 minutes to move. Why?

[pause]

TTL governs resolvers, not sockets. Clients with pooled or long-lived connections never re-resolved. Some runtimes cache beyond the TTL. And if the TTL was lowered at failover time rather than one old TTL before, resolvers still held the old record for up to the old TTL. The common wrong answer is "some resolvers ignore TTLs", which is true at the margins and not the main effect.

And a quick one: why can you not put a CNAME at example.com itself? A CNAME says this name is an alias and has no other records, but the zone's apex must hold its SOA and name server records. The two conflict. Providers offer alias records or flattening, which resolve the target on the authoritative side and serve plain addresses. Not "because CNAMEs are slower".

## Recap

Four things to remember. A warm resolver usually needs one round trip, to the authoritative server, because the root and top-level referrals are cached for days. TTL controls resolvers, not runtimes and certainly not connection pools, so a DNS failover must also bound connection lifetime, and you lower TTLs one old TTL ahead. Absence is cached too, for the SOA's negative TTL, and DNSSEC mistakes show up as server failures for validating resolvers only. And treat your authoritative provider as a dependency worth duplicating: Dyn 2016, Facebook 2021 and AWS 2025 are the evidence.

At your desk: the byte-by-byte message decoding, the cold resolution trace, the record types table, the diagnosis procedure with its commands, and the two exercises, building a query and decoding a response.
