---
slug: dns
title: "DNS: resolution, caching, and the failover that did not happen"
description: A query built and decoded byte by byte, recursive resolution traced with real data from the root to Cloudflare's servers, what TTLs and negative caching really control (including the caches DNS knows nothing about), record types, DNSSEC and DNS over HTTPS in brief, the outages DNS has caused, and how to diagnose a name that does not work.
minutes: 40
difficulty: easy
tags: [networking, dns, ttl, caching, negative-caching, dnssec, doh, geodns, resolver, failover]
problems: []
---
You fail over a database from `db-primary` to `db-replica` by changing a DNS record with a 60-second TTL. Ten minutes later half your application servers are still writing to the dead primary, one is throwing `SERVFAIL`, and a Java service will not switch until you restart it. Nothing in the failover plan was wrong about DNS as a protocol; everything was wrong about the caches between your application and the record you changed.

DNS is the first network operation almost every request makes, it has more independent caches in its path than any other layer, and its failures are quiet until they are total. In October 2016 a botnet flooded Dyn's authoritative DNS service and Twitter, GitHub and Netflix became unreachable for hours on the US east coast although every one of their servers was healthy. In October 2021 Facebook's routes to its own DNS servers were withdrawn and the company disappeared for about six hours. In October 2025 an automation race inside AWS left the DNS record for DynamoDB's `us-east-1` endpoint empty, and a large part of the region's services failed with it. This lesson builds a query byte by byte, traces a resolution through real servers, and then spends most of its time on what goes wrong and how to find it.

## A DNS query, byte by byte

DNS messages are small binary structures, normally carried in one UDP datagram to port 53. This is the exact 29-byte query sent from Python to this machine's resolver for `example.com`, type A, and the 61-byte answer that came back in 3.2 ms (a cache hit):

```text
query:    1a 2b 01 00 00 01 00 00 00 00 00 00 07 65 78 61 6d 70 6c 65 03 63 6f 6d 00 00 01 00 01
response: 1a 2b 81 80 00 01 00 02 00 00 00 00 07 65 78 61 6d 70 6c 65 03 63 6f 6d 00 00 01 00 01
          c0 0c 00 01 00 01 00 00 00 0e 00 04 68 14 17 9a
          c0 0c 00 01 00 01 00 00 00 0e 00 04 ac 42 93 f3
```

| Bytes | Field | Value |
|---|---|---|
| `1a 2b` | Transaction ID | Chosen by the client, echoed in the response; with the random source port, it is the only defence against spoofed answers |
| `01 00` → `81 80` | Flags | Query with RD (recursion desired) → response with QR, RD, RA (recursion available), RCODE 0 (NOERROR) |
| `00 01 00 00 00 00 00 00` → `… 00 02 …` | Counts | 1 question; the response has 2 answers, 0 authority, 0 additional records |
| `07 65 78 61 6d 70 6c 65 03 63 6f 6d 00` | QNAME | Length-prefixed labels: 7 "example", 3 "com", 0 for the root |
| `00 01 00 01` | QTYPE, QCLASS | A, IN |
| `c0 0c` | Answer name | A **compression pointer**: the top two bits `11` mean "the name continues at offset 0x00c", where the question's name starts |
| `00 01 00 01 00 00 00 0e 00 04` | Type, class, TTL, length | A, IN, **14 seconds left in the resolver's cache**, 4 bytes of data |
| `68 14 17 9a` | RDATA | 104.20.23.154 |

Compression is why DNS answers stay small: every repeated name becomes two bytes. It also shows up in record data. A query for `www.github.com` returned a CNAME whose entire data was `c0 10`, a pointer to offset 16, where "github.com" sits inside the question's `www.github.com`. The exercises at the end build a query and decode responses, pointers included.

A classic UDP answer is limited to 512 bytes; EDNS0 lets the client advertise a larger buffer, and anything that still does not fit sets the TC (truncated) flag so the client retries over TCP. The 2020 DNS Flag Day settled on advertising 1,232 bytes, the largest payload that avoids IP fragmentation on any IPv6 path ([layers and encapsulation](/learn/networking/fundamentals/layers-and-encapsulation) derives the number).

## The resolution path

A name is resolved right to left: the root knows who serves `com`, `com` knows who serves `example.com`, and `example.com`'s servers know the address. Four actors are involved:

1. **The application** calls `getaddrinfo("example.com")`, through the C library or the language runtime's own resolver.
2. **The stub resolver** on the host checks `/etc/hosts` (per `/etc/nsswitch.conf`'s `hosts: files dns` order) and sends the query to the recursive resolver named in `/etc/resolv.conf`. It does no iteration itself.
3. **The recursive resolver** (the VPC resolver at the VPC range's base address + 2 on AWS, CoreDNS in Kubernetes, your ISP's, 1.1.1.1) answers from cache or walks the hierarchy, caching every answer and referral.
4. **Authoritative servers** hold the zone and are the source of truth: Route 53, Cloudflare, NS1, your own BIND.

```viz
{"type": "network", "scenario": "dns-resolution", "title": "Stub resolver, recursive resolver, then root, TLD and authoritative servers"}
```

### A cold resolution, traced with real data

`dig +trace` performs the iteration itself. Run on this machine, it revealed something first: after fetching the root server list from 1.1.1.1 (43 ms), its query to g.root-servers.net for `example.com` came back with the final A records and the `ra` flag. A root server never answers that; WSL2's DNS tunnelling intercepts every packet to port 53 and answers from the host's resolver. `+trace` is only as honest as the network under it, so the delegation data below was collected through a DNS-over-HTTPS resolver instead, which reported which server each answer came from:

| Step | Resolver asks | Question | Response | Records, TTL as served |
|---|---|---|---|---|
| 1 | A root server (13 names, well over a thousand anycast instances) | `example.com A` | Referral: "ask com's servers" | `com. NS a.gtld-servers.net.` … `m.gtld-servers.net.`, 172,800 s (2 days) in the root zone, plus glue addresses |
| 2 | A `.com` server (e.g. a.gtld-servers.net) | `example.com A` | Referral | `example.com. NS elliott.ns.cloudflare.com.`, `hera.ns.cloudflare.com.`, 2 days |
| 3 | elliott.ns.cloudflare.com | `example.com A` | Answer, `aa` flag set | `example.com. 300 A 104.20.23.154`, `A 172.66.147.243` |
| 4 | (the same server, for AAAA) | `example.com AAAA` | Answer | `2606:4700:10::6814:179a`, `2606:4700:10::ac42:93f3`, 300 s |

The root answered with the root zone's NS set, whose signature carries the original TTL 518,400 s (6 days); 1.1.1.1 reported 87,203 s remaining in its cache. Those long TTLs are why a real cold lookup is rarely three round trips: every busy resolver already holds the root and `com` referrals, so a miss usually costs one round trip to the authoritative server. On this machine a cached answer took 3 ms and uncached names took 26 to 40 ms, measured with the Python client above.

## Record types you will use

| Type | Maps | Notes |
|---|---|---|
| `A` / `AAAA` | name → IPv4 / IPv6 | Several records per name are returned, often rotated per response |
| `CNAME` | name → another name | Cannot coexist with other records at that name, so it is forbidden at the zone apex |
| `ALIAS` / `ANAME` / apex flattening | apex → another name | Provider-specific: the authoritative server resolves the target and answers with A records |
| `NS` | zone → its authoritative servers | Delegation; what step 1 and 2 returned |
| `SOA` | zone → serial, timers, **negative-cache TTL** | The last field bounds how long "no such name" is cached |
| `MX` | domain → mail servers with preference | Lower preference value is tried first |
| `TXT` | name → text | SPF, DKIM, domain verification, ACME challenges |
| `SRV` | `_service._proto.name` → priority, weight, port, target | The only classic record that carries a port; Consul, SIP, Kubernetes headless services |
| `HTTPS` / `SVCB` | name → endpoint parameters | ALPN list (for example `h3`), addresses, ECH keys; lets a browser try HTTP/3 without a first HTTP/2 visit |
| `CAA` | domain → allowed certificate authorities | CAs must check it before issuing |
| `PTR` | address → name | Reverse lookups; a slow PTR lookup is a classic cause of slow SSH logins |

Each CNAME link is a separate record with its own TTL and, on a cold cache, its own lookup: a name that CNAMEs to a CDN hostname that CNAMEs to a load balancer is three chances to be slow or wrong.

## TTLs and the cache hierarchy

A record's TTL is the zone owner's promise that the answer may be reused for that many seconds. It is the only lever you have over propagation speed, and a chain of caches you do not control honours, caps, floors or ignores it.

| Cache | Behaviour |
|---|---|
| Authoritative server | Serves the configured TTL; a change is visible immediately if you query it directly (`dig @elliott.ns.cloudflare.com`) |
| Recursive resolver | Counts the TTL down (the `14` above); many cap long TTLs (a day or a week) and some impose a floor of 30 to 60 s |
| OS stub cache | `systemd-resolved`, nscd, the Windows DNS client: usually honours TTL; glibc alone caches nothing |
| Language runtime | Where surprises live: the JVM caches successful lookups for 30 s by default and forever when a security manager is installed (`networkaddress.cache.ttl`); Go and Python's `socket` cache nothing; Node's `dns.lookup` caches nothing and runs `getaddrinfo` on libuv's thread pool, 4 threads by default, so four slow lookups stall every file operation too |
| Connection pools | Not a DNS cache, but a pool of open connections to the old address behaves like one: nothing re-resolves until something reconnects |

The last row is the failover trap from the opening. A pool with 20 warm connections to `db-primary` keeps using them until they break, and lowering the TTL to 1 second does nothing to sockets that are already open. A DNS-based failover must also bound connection lifetime (a maximum connection age in the pool, a drain on failover, or killing the old server so connections fail fast). [Connection pooling and keep-alive](/learn/networking/networking-in-practice/connection-pooling-and-keep-alive) works through the interaction.

**Choosing a TTL.** Low (30 to 60 s) for records you may change under duress, such as service entry points and anything in a failover plan; the cost is query volume (a bill with per-query pricing) and a tighter dependency on the DNS provider, because cached answers stop protecting you after one TTL. High (hours to a day) for stable records, NS and MX. Before a planned change, lower the TTL at least one old TTL in advance so that caches have drained by the change window.

### Negative caching, measured

Resolvers also cache absence: NXDOMAIN (no such name) and NODATA (the name exists, but not with that type), for the smaller of the SOA record's own TTL and its last field (RFC 2308). Querying a name that does not exist under example.com returned no answers and one SOA record in the authority section:

```text
example.com. 1800 IN SOA elliott.ns.cloudflare.com. dns.cloudflare.com. 2415949263 10000 2400 604800 1800
```

so a resolver may repeat "does not exist" for up to 1,800 seconds, 30 minutes. If anyone looks up your new service's name before you create it, that is how long the lookup can keep failing after you do. The same response had RCODE 0 (NOERROR) rather than 3 (NXDOMAIN): Cloudflare signs its zones on the fly and answers non-existent names with an empty NOERROR response and a minimal proof (the "black lies" technique), which stops attackers from listing the zone's names. Clients treat both outcomes as "no address"; your monitoring may not.

## Under the hood: DNSSEC and DNS over HTTPS

**DNSSEC** makes answers verifiable. Each zone signs its record sets; the `dig +trace` output above carried `RRSIG` records next to the data, for example `example.com. RRSIG A 13 2 300 20260929151733 20260927131733 34505 example.com.`: algorithm 13 (ECDSA P-256 with SHA-256), 2 labels, original TTL 300, valid from 27 to 29 September 2026, signed by key tag 34505 of `example.com`. The resolver fetches the zone's `DNSKEY`, checks it against a `DS` record (a hash of the key) published and signed in the parent zone, and repeats up to the root, whose key is built into every validating resolver. A validation failure produces SERVFAIL, not a wrong answer, so a botched key rollover or an expired signature takes a zone offline for every validating resolver while non-validating ones keep working: the pattern of Slack's September 2021 outage, when a DNSSEC rollout left some users unable to resolve slack.com for most of a day. DNSSEC authenticates; it does not encrypt.

**DNS over TLS** (port 853) and **DNS over HTTPS** (RFC 8484: the same binary message as the body of an HTTPS request with `Content-Type: application/dns-message`) encrypt the stub-to-resolver hop so the local network cannot read or rewrite queries, which would have defeated the interception seen above. The trade-off is that a browser using its own DoH resolver bypasses the corporate or VPC resolver, and with it split-horizon names and DNS-based security filtering; enterprises disable it by policy, and Firefox checks the canary name `use-application-dns.net` before enabling it by default.

## Under the hood: what `getaddrinfo` does

Most application code never speaks DNS; it calls `getaddrinfo`, and glibc's implementation decides a surprising amount of latency:

1. It reads `/etc/nsswitch.conf` and tries each source in order, usually `files` (`/etc/hosts`) then `dns`. Container images without an `nsswitch.conf` get glibc's built-in order, which is one reason a name resolves differently inside a container.
2. If the name has fewer dots than `ndots` (default 1) it tries each `search` suffix from `/etc/resolv.conf` first, then the bare name.
3. For an unspecified address family it sends the A and AAAA queries in parallel, from the same UDP socket and source port, and waits for both. On Linux hosts that NAT DNS traffic (Kubernetes nodes, Docker), two packets with the same 5-tuple can race in conntrack and one is dropped, producing the five-second stalls that [NAT, firewalls and cloud networking](/learn/networking/fundamentals/nat-firewalls-and-cloud-networking) lists; `options single-request-reopen` sends them from separate sockets.
4. It waits `timeout` seconds (default 5) per server per attempt (default 2), trying servers in order unless `rotate` is set, and falls back to TCP if the answer is truncated.
5. It caches nothing. Every call goes to the network unless `systemd-resolved` (listening on 127.0.0.53), nscd or a local caching resolver sits in between.

Go's pure-Go resolver re-implements the same rules (and caches nothing); the JVM wraps the system resolver with its own cache; Node's `dns.lookup` calls `getaddrinfo` on the thread pool, while `dns.resolve` speaks DNS itself and ignores `/etc/hosts`. Knowing which path your runtime takes is most of the answer to "why does this name resolve differently here?".

## DNS as a load balancer

The authoritative server answers each query independently, so it can answer differently per query and per client. That makes DNS the coarsest load balancer in the stack and the only one that acts before a connection exists:

- **Round robin:** several A records, rotated per response. Clients mostly use the first; the spread depends on resolvers and libraries rotating.
- **Weighted records:** return each record set with a probability, for example 5% of resolutions to a canary region.
- **Latency or geo routing:** answer by the recursive resolver's location, or by the client subnet if the resolver sends EDNS Client Subnet. Its blind spot is that it sees the resolver, not the user: a user in Madrid on a resolver in Frankfurt is "in Germany".
- **Health-checked records:** stop returning targets that fail probes. Failover time is probe interval × failure threshold, plus the TTL, plus every cache and pool above.

Compared with [load balancing](/learn/networking/application-protocols/load-balancing) at L4 or L7, DNS steering has no per-request visibility and propagates at the speed of TTLs: right for choosing a region, wrong for spreading load across servers inside one.

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Stale connection pool | After a DNS failover some instances still talk to the old address | `dig` returns the new address on the host; `ss -tnp` shows established connections to the old one | Maximum connection age in the pool, drain pools on failover, fail the old endpoint fast |
| Dead first resolver | Some requests take almost exactly 5 s (or 10 s) longer | `/etc/resolv.conf` lists an unreachable first nameserver; glibc's defaults are `timeout:5 attempts:2` | `options timeout:1 attempts:2 rotate`, or a local caching resolver |
| Runtime ignores TTL | One service keeps the old address until restarted | JVM with a security manager caching forever, or a client library with its own resolver cache | `-Dnetworkaddress.cache.ttl=30` (and `.negative.ttl`), or configure the library's refresh |
| `ndots` amplification in Kubernetes | High DNS query volume and latency for external names | Pod `resolv.conf` has `ndots:5` and three search suffixes, so `api.example.com` is tried as three cluster names first: four names, eight queries with A and AAAA | Use fully qualified names with a trailing dot, or lower `ndots` for the pod |
| Negative cache after deploy | A brand-new name returns NXDOMAIN for minutes | The authoritative server has it (`dig @ns …`); the resolver cached absence for the SOA's negative TTL | Create records before first use; wait out or flush the resolver cache |
| DNSSEC validation failure | SERVFAIL from validating resolvers (1.1.1.1, 8.8.8.8), success from others | `dig +dnssec`, `delv`, or an online analyser shows expired signatures or a DS/DNSKEY mismatch | Roll keys with the published procedure; monitor signature expiry |
| Authoritative provider outage | Healthy service unreachable by name after one TTL | Every resolver returns SERVFAIL; queries to the provider's servers time out | Two authoritative providers serving the same zone; long TTLs on NS records |

## Trade-offs: choosing a TTL

| | 10–60 s | 5 minutes | 1 hour to 1 day |
|---|---|---|---|
| Failover or change visible after | Seconds, plus pools | Minutes | Hours |
| Query volume and cost | Highest | Moderate | Lowest |
| Survives a provider outage for | Seconds | Minutes | Hours |
| Resolver floors and caps | Often raised to 30–60 s anyway | Honoured | Sometimes capped |
| Use for | Entry points in a failover plan, canaries | Most service records | NS, MX, stable infrastructure |

## A diagnosis procedure

When a name "does not work":

1. `dig +short name` from the affected host: address, NXDOMAIN, SERVFAIL, or a timeout?
2. `dig @<authoritative NS> name`: what the source of truth says. If it differs from step 1, you are waiting on a cache, and step 1's remaining TTL says how long.
3. `dig +trace name` (on a network that does not intercept port 53) if the authoritative answer is wrong, to find the broken level of delegation.
4. `cat /etc/resolv.conf` on the host for the resolver actually used, timeouts and `ndots`.
5. If DNS is right and the application still reaches the old address: a pool or a runtime cache, not DNS.

Most "DNS is broken" tickets end at step 5.

## Interviewer follow-ups

**"You lowered a record's TTL to 60 s and failed over, but traffic took 20 minutes to move. Why?"** Model answer: TTL governs resolvers, not sockets; clients with pooled or long-lived connections never re-resolved, some runtimes cache beyond TTL, and if the TTL was lowered at failover time rather than one old TTL before, resolvers still held the old record for up to the old TTL. Common wrong answer: "some resolvers ignore TTLs", which is true at the margins and not the main effect.

**"Why can you not put a CNAME at example.com?"** Model answer: a CNAME says "this name is an alias and has no other records", and the zone apex must hold SOA and NS records, so the two conflict; providers offer ALIAS or flattening, which resolve the target on the authoritative side and serve A records. Common wrong answer: "CNAMEs are slower".

**"How does GeoDNS decide where a user is?"** Model answer: from the recursive resolver's source address, or from the EDNS Client Subnet option if the resolver sends it; public resolvers far from the user produce wrong answers, which is one reason CDNs combine DNS steering with anycast. Common wrong answer: "from the user's IP address", which the authoritative server never sees.

**"What does DNSSEC protect against, and what does it not?"** Model answer: it lets a validating resolver prove an answer came from the zone owner unmodified, which defeats cache poisoning and spoofed answers; it does not encrypt queries (that is DoT or DoH), and a signing mistake turns into SERVFAIL for every validating resolver. Common wrong answer: "it encrypts DNS".

## What mid-level engineers get wrong

- Treating the TTL as the failover time, ignoring connection pools and runtime caches.
- Lowering a TTL at the moment of a change instead of one old TTL ahead.
- Querying a name before creating it and then debugging "DNS propagation" for the negative-cache TTL.
- Trusting `dig +trace` on a network that intercepts DNS, or trusting a laptop's answer for a split-horizon name that resolves differently in production.
- Relying on one authoritative provider with low TTLs for a critical name, which turns their outage into yours within a minute.
- Running resolver-heavy Node services with the default thread pool and blaming the file system when lookups stall reads.

## Exercises

```exercise
id: build-dns-query
title: Build a DNS query
prompt: |
  Build the wire-format DNS query for `name` and record type `qtype`
  (1 = A, 28 = AAAA, 2 = NS, ...) and return it as a lowercase hex string
  with no spaces.

  - Header (12 bytes): the 16-bit transaction id `txid`, flags `0x0100`
    (recursion desired), QDCOUNT 1, and ANCOUNT, NSCOUNT, ARCOUNT 0. All
    16-bit fields are big-endian.
  - QNAME: each label as one length byte followed by its ASCII bytes, then
    a zero byte. Ignore a trailing dot; the root name `"."` is a single
    zero byte.
  - QTYPE (16 bits) and QCLASS 1 (IN).
languages: [python, javascript]
entry: build_dns_query
starter:
  python: |
    def build_dns_query(txid, name, qtype):
        # your code here
        return ""
  javascript: |
    function build_dns_query(txid, name, qtype) {
      // your code here
      return "";
    }
tests:
  - args: [6699, "example.com", 1]
    expected: "1a2b01000001000000000000076578616d706c6503636f6d0000010001"
    label: the lesson's 29-byte query
  - args: [6699, "www.github.com.", 1]
    expected: "1a2b01000001000000000000037777770667697468756203636f6d0000010001"
    label: a trailing dot adds nothing
  - args: [7, "example.com", 28]
    expected: "000701000001000000000000076578616d706c6503636f6d00001c0001"
    label: AAAA
  - args: [65535, ".", 2]
    expected: "ffff010000010000000000000000020001"
    hidden: true
    label: the root zone's NS records
hints:
  - "Split on `.` and drop empty labels; that handles both the trailing dot and the root name."
  - "`txid >> 8` and `txid & 255` give the two bytes of a 16-bit big-endian field."
```

```exercise
id: parse-dns-response
title: Decode a DNS response, compression pointers included
prompt: |
  Decode the DNS response `hex_str`. Return
  `{"id": ..., "rcode": ..., "answers": [...], "authority": [...]}` where
  `rcode` is the low 4 bits of the flags and each record is
  `[name, type, ttl, data]`:

  - `name` is the owner name with a trailing dot (`"example.com."`).
  - `type` is `"A"` (1), `"NS"` (2), `"CNAME"` (5), `"SOA"` (6), otherwise
    `"TYPE<n>"`.
  - `data`: A is a dotted quad; NS and CNAME are names with a trailing dot;
    SOA is `"mname rname serial refresh retry expire minimum"` (the two
    names with trailing dots, the five 32-bit numbers in decimal, space
    separated, as `dig` prints it); any other type is its raw RDATA as
    lowercase hex.

  Skip the question section (a name plus 4 bytes per question) and ignore
  the additional section. Names may use compression: a length byte whose
  top two bits are `11` is a pointer, and the name continues at the 14-bit
  offset formed with the next byte. Pointers can point at names that end in
  further pointers. After reading a record's name, continue after the
  pointer's two bytes, not after the name it pointed to.
languages: [python, javascript]
entry: parse_dns_response
starter:
  python: |
    def parse_dns_response(hex_str):
        b = bytes.fromhex(hex_str)
        # your code here
        return {"id": 0, "rcode": 0, "answers": [], "authority": []}
  javascript: |
    function parse_dns_response(hex_str) {
      const b = [];
      for (let i = 0; i < hex_str.length; i += 2) b.push(parseInt(hex_str.slice(i, i + 2), 16));
      // your code here
      return { id: 0, rcode: 0, answers: [], authority: [] };
    }
tests:
  - args: ["1a2b81800001000200000000076578616d706c6503636f6d0000010001c00c000100010000000e00046814179ac00c000100010000000e0004ac4293f3"]
    expected: {"id": 6699, "rcode": 0, "answers": [["example.com.", "A", 14, "104.20.23.154"], ["example.com.", "A", 14, "172.66.147.243"]], "authority": []}
    label: the lesson's response for example.com
  - args: ["1a2b81800001000200000000037777770667697468756203636f6d0000010001c00c00050001000005a80002c010c010000100010000003c00048c527403"]
    expected: {"id": 6699, "rcode": 0, "answers": [["www.github.com.", "CNAME", 1448, "github.com."], ["github.com.", "A", 60, "140.82.116.3"]], "authority": []}
    label: a CNAME whose data is a two-byte pointer
  - args: ["1a2b81800001000000010000176e6f6e6578697374656e742d617363656e642d37373831076578616d706c6503636f6d0000010001c0240006000100000708003207656c6c696f7474026e730a636c6f7564666c617265c02c03646e73c04c900075cf000027100000096000093a8000000708"]
    expected: {"id": 6699, "rcode": 0, "answers": [], "authority": [["example.com.", "SOA", 1800, "elliott.ns.cloudflare.com. dns.cloudflare.com. 2415949263 10000 2400 604800 1800"]]}
    label: a non-existent name answered with an SOA (negative caching)
  - args: ["00428183000100000001000001610162076578616d706c65036f72670000010001c0100006000100000e100027036e7331c0100a686f73746d6173746572c02d78c3b90100001c2000000384001275000000012c"]
    expected: {"id": 66, "rcode": 3, "answers": [], "authority": [["example.org.", "SOA", 3600, "ns1.example.org. hostmaster.ns1.example.org. 2026092801 7200 900 1209600 300"]]}
    hidden: true
    label: NXDOMAIN with a chain of pointers
  - args: ["beef8180000100010000000003747874076578616d706c65036f72670000100001c00c001000010000007800060568656c6c6f"]
    expected: {"id": 48879, "rcode": 0, "answers": [["txt.example.org.", "TYPE16", 120, "0568656c6c6f"]], "authority": []}
    hidden: true
    label: an unknown type keeps its raw data
hints:
  - "Write one `read_name(offset)` that returns the name and the offset just after it in the original position; follow pointers in a loop and remember where the first pointer was."
  - "A resource record is name, TYPE (2), CLASS (2), TTL (4), RDLENGTH (2), RDATA. In JavaScript build the 32-bit TTL with multiplication so it stays positive."
```

## Senior signals

- You can read a DNS message in hex: header flags and counts, length-prefixed labels, compression pointers, TTL and RDATA.
- You trace a resolution through root, TLD and authoritative servers, know why a warm resolver usually needs one round trip, and know when `dig +trace` is lying because the network intercepts port 53.
- You separate the caches (resolver, OS, runtime, connection pool), know a TTL change fixes only the first two, and lower TTLs one old TTL before a planned change.
- You compute a negative-cache TTL from an SOA record and know NXDOMAIN, NODATA and SERVFAIL are different outcomes with different caching and retry behaviour.
- You know what DNSSEC and DoH each protect, and that DNSSEC mistakes surface as SERVFAIL for validating resolvers only.
- You use DNS for cross-region steering, not intra-region balancing, and you treat the authoritative provider as a dependency worth duplicating, with Dyn 2016, Facebook 2021 and AWS 2025 as the evidence.

## Check yourself

```quiz
- q: >-
    You change an A record with a 60-second TTL to point at a new server. Fifteen minutes later a Python service using a persistent HTTP connection pool still sends requests to the old server. Which explanation fits?
  options: ["The recursive resolver is ignoring the record's TTL and serving it", "The old server is proxying requests on behalf of the new server", "Pooled connections predate the change and never re-resolve", "Python's socket module caches DNS answers for an hour by default"]
  answer: 2
  explanation: >-
    DNS is consulted only when a new connection is created. Warm connections opened before the change stay valid until they close, so TTL controls resolvers, not sockets. Python's socket module caches nothing. Fixes are a maximum connection lifetime, a pool drain on failover, or failing the old server fast.
- q: >-
    A DNS response contains the two bytes c0 0c where a record's owner name should be. What do they mean?
  options: ["A pointer: the name continues at offset 12, the question's name", "The record's class and type, since the owner name was omitted", "An end-of-name marker for the root zone followed by padding", "A label of length 192 followed by twelve bytes of name characters"]
  answer: 0
  explanation: >-
    A length byte with its top two bits set is a compression pointer; the remaining 14 bits give an offset into the message. Offset 12 (0x0c) is where the question section's name starts, immediately after the 12-byte header, so the answer's owner is the name that was asked for. Labels are limited to 63 bytes, which is why lengths never collide with pointers.
- q: >-
    A query for a name that does not exist returns an SOA record with TTL 1800 whose last field is 1800. Someone looked the name up just before you created it. How long can resolvers keep saying it does not exist?
  options: ["Up to 300 seconds, the TTL of the zone's A records", "Up to 1800 seconds, the negative-caching TTL", "Until the SOA serial number changes on the servers", "Not at all, since resolvers never cache absence"]
  answer: 1
  explanation: >-
    Negative answers are cached for the smaller of the SOA record's TTL and its minimum field, here 1800 seconds. The TTLs of other records in the zone do not apply, and resolvers do not watch the serial number, which only drives zone transfers between authoritative servers. Create names before anything queries them.
- q: >-
    A service occasionally takes almost exactly 5 seconds longer than usual to start a request, then proceeds normally. What is the most likely cause?
  options: ["TCP slow start delaying the first bytes on each connection", "The first resolver is down, and glibc waits 5 s for it", "A CNAME chain with five links, costing one second per link", "The TLS certificate chain being re-validated with the CA"]
  answer: 1
  explanation: >-
    glibc's resolver waits its default 5-second timeout on the first nameserver before trying the next, so every uncached lookup pays a fixed 5 seconds while the first is unreachable. CNAME links cost milliseconds, slow start costs round trips, and certificate checks do not produce a fixed 5-second pause.
- q: >-
    Validating resolvers such as 1.1.1.1 return SERVFAIL for your zone while your ISP's non-validating resolver returns correct answers. What is the likely cause?
  options: ["Public resolvers block zones that use CNAME records at the apex", "A DNSSEC signature expired or no longer matches the DS record", "The zone's TTLs are too short for large public resolvers to cache", "The authoritative servers are overloaded and dropping some queries"]
  answer: 1
  explanation: >-
    Only validating resolvers check signatures, and a failed validation is reported as SERVFAIL rather than as a wrong answer, which matches the split between the two resolvers. Overload would affect both resolvers, TTL length does not cause failures, and an apex CNAME would break the zone for everyone.
- q: >-
    Why is GeoDNS a good fit for steering users between regions but a poor fit for balancing requests across servers within one region?
  options: ["Load balancers cannot operate across regions at all", "It can only choose between two regions for each hostname", "Its answers must be carried over TCP, which adds a round trip", "It decides per resolver and TTL, blind to each request"]
  answer: 3
  explanation: >-
    The authoritative server decides once per TTL, based on the resolver's location, with no visibility into per-request load or server health. That suffices for choosing a region before any connection exists and is inadequate for spreading load inside one, where a load balancer that sees each request does far better. DNS answers normally travel over UDP.
```
