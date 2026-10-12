---
lesson: dns
source: cd869a0744f20ede
---
## 1

You change a DNS A record with a 60-second TTL to point at a new server. Fifteen minutes later, a Python service using a persistent HTTP connection pool is still sending requests to the old server. Which explanation fits?

A, the recursive resolver is ignoring the record's TTL. B, the old server is proxying requests on behalf of the new one. C, the pooled connections were opened before the change and never re-resolve. D, Python's socket module caches DNS answers for an hour by default.

[think]

The answer is C: the pooled connections were opened before the change and never re-resolve.

DNS is consulted only when a new connection is created. Warm connections opened before the change stay valid until they close, so the TTL controls resolvers, not sockets. Python's socket module caches nothing. The fixes are a maximum connection lifetime, draining the pool on failover, or making the old server fail fast.

## 2

A DNS response contains the two bytes hex C-zero, zero-C where a record's owner name should be. What do they mean?

A, a pointer: the name continues at offset 12, which is the question's name. B, the record's class and type, since the owner name was omitted. C, an end-of-name marker for the root zone, followed by padding. D, a label of length 192, followed by twelve bytes of name characters.

[think]

The answer is A: a pointer: the name continues at offset 12, which is the question's name.

A length byte with its top two bits set is a compression pointer, and the remaining 14 bits give an offset into the message. Offset 12 is where the question section's name starts, right after the 12-byte header, so the answer's owner is the name that was asked for. Labels are limited to 63 bytes, which is why lengths never collide with pointers.

## 3

A query for a name that does not exist returns an SOA record with a TTL of 1800, whose last field is also 1800. Someone looked the name up just before you created it. How long can resolvers keep saying it does not exist?

A, up to 300 seconds, the TTL of the zone's A records. B, up to 1800 seconds, the negative-caching TTL. C, until the SOA serial number changes on the servers. D, not at all, since resolvers never cache absence.

[think]

The answer is B: up to 1800 seconds, the negative-caching TTL.

Negative answers are cached for the smaller of the SOA record's TTL and its minimum field, here 1800 seconds. The TTLs of other records in the zone do not apply, and resolvers do not watch the serial number, which only drives zone transfers between authoritative servers. Create names before anything queries them.

## 4

A service occasionally takes almost exactly 5 seconds longer than usual to start a request, then proceeds normally. What is the most likely cause?

A, TCP slow start delaying the first bytes on each connection. B, the first configured resolver is down, and glibc waits 5 seconds for it. C, a CNAME chain with five links, costing one second per link. D, the TLS certificate chain being re-validated with the certificate authority.

[think]

The answer is B: the first resolver is down, and glibc waits 5 seconds for it.

The glibc resolver waits its default 5-second timeout on the first nameserver before trying the next, so every uncached lookup pays a fixed 5 seconds while the first one is unreachable. CNAME links cost milliseconds, slow start costs round trips, and certificate checks do not produce a fixed 5-second pause.

## 5

Validating resolvers, such as 1.1.1.1, return SERVFAIL for your zone, while your ISP's non-validating resolver returns correct answers. What is the likely cause?

A, public resolvers block zones that use a CNAME record at the apex. B, a DNSSEC signature expired or no longer matches the DS record. C, the zone's TTLs are too short for large public resolvers to cache. D, the authoritative servers are overloaded and dropping some queries.

[think]

The answer is B: a DNSSEC signature expired or no longer matches the DS record.

Only validating resolvers check signatures, and a failed validation is reported as a server failure rather than as a wrong answer, which matches the split between the two resolvers. Overload would affect both resolvers, short TTLs do not cause failures, and an apex CNAME would break the zone for everyone.

## 6

Why is GeoDNS a good fit for steering users between regions, but a poor fit for balancing requests across servers within one region?

A, load balancers cannot operate across regions at all. B, it can only choose between two regions for each hostname. C, its answers must be carried over TCP, which adds a round trip. D, it decides per resolver and per TTL, blind to each request.

[think]

The answer is D: it decides per resolver and per TTL, blind to each request.

The authoritative server decides once per TTL, based on the resolver's location, with no visibility into per-request load or server health. That is enough to choose a region before any connection exists, and not enough to spread load inside one, where a load balancer that sees each request does far better. DNS answers normally travel over UDP.
