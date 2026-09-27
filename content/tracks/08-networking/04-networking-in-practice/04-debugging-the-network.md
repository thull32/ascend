---
slug: debugging-the-network
title: "Debugging the network: curl, dig, mtr, ss and tcpdump"
description: "A phase-by-phase method for turning \"the network is slow\" into a named cause: reading curl timings, checking what your process actually resolves, reading mtr without being fooled by ICMP, triaging sockets with ss, and recognising failure patterns in a tcpdump capture."
minutes: 31
difficulty: medium
tags: [networking, debugging, curl, dig, mtr, traceroute, tcpdump, ss, wireshark, observability]
problems: []
---
Users in Sydney report that the API is slow. The service dashboard shows a p99 handler time of 45 ms, all green. Both are true, because they measure different things. The dashboard times the handler. The user times DNS, a TCP handshake, a TLS handshake, every router between Sydney and Virginia, the queue in front of your process, the handler, and the transfer of the response body back across an ocean. Somewhere in that list is the answer, and "the network is slow" is not one.

Network debugging is the discipline of cutting that list into phases and timing each one from the place where the problem happens. Each tool in this lesson answers exactly one question. Knowing which question you are asking, and which tool answers it, is most of the skill.

## The method: split the request into phases

| Phase | Question | Tool | What "bad" looks like |
|---|---|---|---|
| Name resolution | What address does *my process* get, and how fast? | `getent`, `dig`, `resolvectl` | Wrong address, `SERVFAIL`, lookups that take exactly 5 s |
| Path | Which way do packets go, and where do they get lost or delayed? | `mtr`, `traceroute` | Loss that persists to the destination, latency that jumps and stays |
| Connection | Does the handshake complete? | `curl -v`, `ss`, `tcpdump` | SYNs retransmitted at 1 s and 3 s, immediate RSTs |
| TLS | Does the handshake succeed, and in how many round trips? | `curl -v`, `openssl s_client` | Certificate errors, two-RTT handshakes, no resumption |
| Transfer | Is the transport healthy? | `ss -ti`, `nstat`, `tcpdump` | Retransmissions, zero windows, a tiny congestion window |
| Application | How long does the server think? | `curl` TTFB, server logs, traces | A long gap between the request and the first response byte |

Two rules make the table work. **Measure from where the problem is**: the same request from your laptop, from a pod in the same cluster and from the user's region can take three different paths through three different resolvers. Run the tools from inside the affected pod's network namespace if that is where the complaint comes from. And **go cheapest first**: `curl -w` takes a second and often names the phase outright; a packet capture takes an hour to read and should be reserved for when the cheap tools disagree.

## curl: a stopwatch for one request

`curl -v` narrates a request. Lines starting with `*` are curl's own commentary, `>` is what was sent, `<` is what came back:

```text
$ curl -sv -o /dev/null https://api.example.com/v1/health
* Host api.example.com:443 was resolved.
* IPv4: 203.0.113.10, 203.0.113.11
*   Trying 203.0.113.10:443...
* Connected to api.example.com (203.0.113.10) port 443
* ALPN: curl offers h2,http/1.1
* SSL connection using TLSv1.3 / TLS_AES_128_GCM_SHA256 / X25519
* ALPN: server accepted h2
* Server certificate:
*  subject: CN=api.example.com
*  expire date: Mar  3 23:59:59 2027 GMT
*  SSL certificate verify ok.
> GET /v1/health HTTP/2
> Host: api.example.com
>
< HTTP/2 200
< content-type: application/json
< x-envoy-upstream-service-time: 3
<
* Connection #0 to host api.example.com left intact
```

Everything you need to rule things out is here: which addresses DNS returned and which one curl tried, whether the connection succeeded, the TLS version and cipher, which HTTP version was negotiated, the certificate's subject and expiry, and headers added by proxies on the way (`x-envoy-upstream-service-time: 3` says the upstream service took 3 ms by the proxy's clock).

For time, use `-w`. The critical fact about curl's timing variables is that they are **cumulative**: each is measured from the start of the request, not from the previous phase.

```bash
curl -s -o /dev/null https://api.example.com/v1/users/42 -w '
  dns:   %{time_namelookup}
  tcp:   %{time_connect}
  tls:   %{time_appconnect}
  sent:  %{time_pretransfer}
  ttfb:  %{time_starttransfer}
  total: %{time_total}
  ip %{remote_ip} http/%{http_version} status %{http_code}
'
```

From a Sydney host to a service in Virginia:

```text
  dns:   0.004
  tcp:   0.205
  tls:   0.412
  sent:  0.412
  ttfb:  0.655
  total: 0.861
  ip 203.0.113.10 http/2 status 200
```

Subtract to get phases: DNS 4 ms (cached), TCP handshake 201 ms, TLS 207 ms, request-to-first-byte 243 ms, body transfer 206 ms. Every phase except DNS is about one 200 ms round trip. The TCP handshake is one RTT. TLS 1.3 is one more. The first byte takes one RTT plus about 40 ms of server time. The transfer takes another RTT because the response is bigger than the initial congestion window, so slow start needs a second flight (see [Latency, bandwidth and the math](/learn/networking/networking-in-practice/latency-bandwidth-and-math)). The server spent about 40 ms of an 861 ms request. The rest is the Pacific Ocean, multiplied by the number of round trips the protocol needs.

That turns "the API is slow in Sydney" into an engineering answer: remove round trips (terminate TLS at an edge close to users and keep warm, pooled connections from the edge to the origin, so the user's two handshake round trips cost a few milliseconds each instead of 200), cache what can be cached at a CDN, or run the service closer to the users. Optimising the handler would save at most 40 ms.

A few flags do most of the remaining work:

- `--resolve api.example.com:443:203.0.113.11` pins the name to one address without touching DNS, so you can test each backend behind a load balancer and find the one bad instance, with the correct SNI and `Host` header.
- `--connect-to ::10.0.5.20:8443` sends the request to a different host and port while keeping the URL (and so the certificate check) intact.
- `--http1.1` and `--http2` force the protocol, which isolates proxy bugs that affect only one version.
- Run the same command several times. The first run pays DNS and any cold caches; if run two is fast and run one is slow, you are debugging a cold path, not a slow one.

```exercise
id: curl-timing-phases
title: Turn curl's cumulative timings into phases
prompt: |
  `t` holds curl's timing variables for one request, converted to integer
  milliseconds: `namelookup`, `connect`, `appconnect`, `pretransfer`,
  `starttransfer` and `total`. Each is cumulative from the start of the
  request. For plain HTTP there is no TLS and `appconnect` is 0.

  Return an object with the duration of each phase:
  - `dns`: time to resolve the name
  - `tcp`: the TCP handshake (from resolution done to connected)
  - `tls`: the TLS handshake (from connected to TLS done), or 0 without TLS
  - `server`: from the request being ready to send until the first
    response byte (`starttransfer - pretransfer`)
  - `transfer`: from the first response byte to the end
languages: [python, javascript]
entry: curl_phases
starter:
  python: |
    def curl_phases(t):
        # TODO
        return {"dns": 0, "tcp": 0, "tls": 0, "server": 0, "transfer": 0}
  javascript: |
    function curl_phases(t) {
      // TODO
      return { dns: 0, tcp: 0, tls: 0, server: 0, transfer: 0 };
    }
tests:
  - args: [{namelookup: 4, connect: 205, appconnect: 412, pretransfer: 412, starttransfer: 655, total: 861}]
    expected: {dns: 4, tcp: 201, tls: 207, server: 243, transfer: 206}
    label: Sydney to Virginia
  - args: [{namelookup: 21, connect: 47, appconnect: 98, pretransfer: 99, starttransfer: 313, total: 318}]
    expected: {dns: 21, tcp: 26, tls: 51, server: 214, transfer: 5}
    label: a slow server behind a fast network
  - args: [{namelookup: 2, connect: 3, appconnect: 0, pretransfer: 3, starttransfer: 45, total: 46}]
    expected: {dns: 2, tcp: 1, tls: 0, server: 42, transfer: 1}
    label: plain HTTP has no TLS phase
  - args: [{namelookup: 0, connect: 71, appconnect: 143, pretransfer: 143, starttransfer: 215, total: 1840}]
    expected: {dns: 0, tcp: 71, tls: 72, server: 72, transfer: 1625}
    label: a large body dominates
  - args: [{namelookup: 5004, connect: 5010, appconnect: 5031, pretransfer: 5031, starttransfer: 5052, total: 5053}]
    expected: {dns: 5004, tcp: 6, tls: 21, server: 21, transfer: 1}
    label: a five-second resolver timeout
    hidden: true
hints:
  - "Every value is measured from the start, so each phase is a difference between two consecutive milestones."
  - "Only compute `appconnect - connect` when `appconnect` is greater than 0."
```

## dig, and why it is not what your process sees

[DNS](/learn/networking/fundamentals/dns) covers reading `dig` output. The debugging point is different: `dig` sends a DNS query straight to a server. Your application does not. It calls `getaddrinfo` (or its runtime's resolver), which consults `/etc/hosts` and `nsswitch.conf`, may go through a local caching stub such as `systemd-resolved`, applies the `search` domains and `ndots` rule from `/etc/resolv.conf`, and may then be cached again inside the runtime. So a correct `dig` answer proves only that DNS is correct.

```text
$ dig +short payments.internal
10.30.1.8
$ getent ahosts payments.internal
10.30.9.99      STREAM payments.internal
10.30.9.99      DGRAM
10.30.9.99      RAW
```

`getent` asks the same libc path your process uses, and here it disagrees with DNS: someone left a line in `/etc/hosts`. When the two differ, the application is right about what it is doing, and `dig` is right about what it should be doing.

Useful comparisons, in order: `getent ahosts name` (what the process gets), `dig name` (what the configured resolver says), `dig @8.8.8.8 name` or another public resolver (whether the configured resolver is stale or split-horizon), and `dig +trace name` (what the authoritative servers say, bypassing every cache). The first point at which answers diverge is the layer with the problem. Inside Kubernetes, read the pod's `/etc/resolv.conf` too: `ndots:5` turns one lookup of an external name into several search-domain queries that each fail before the real one is tried.

## mtr: the path, hop by hop

`traceroute` discovers the path by sending probes with increasing TTL; each router that drops a probe at TTL zero reveals itself with an ICMP "time exceeded" message.

```viz
{"type": "network", "scenario": "traceroute", "title": "Discovering the path one TTL at a time", "caption": "Each router that decrements a probe's TTL to zero replies with ICMP Time Exceeded, revealing its address and the round-trip time to it. A hop that does not reply shows as * * * even though traffic passes through it normally."}
```

`mtr` does the same thing continuously and keeps statistics per hop, which is what you need for intermittent problems. Run it in report mode with enough probes to mean something:

```text
$ mtr -rwzn -c 100 api.example.com
Start: 2026-09-26T09:12:44+1000
HOST: syd-bastion-1           Loss%   Snt   Last   Avg  Best  Wrst StDev
  1. AS???    10.20.0.1        0.0%   100    0.4   0.4   0.3   1.1   0.1
  2. AS64500  100.64.3.17      0.0%   100    1.2   1.4   1.0   6.8   0.7
  3. AS64500  203.0.113.65     0.0%   100    1.9   2.3   1.7   9.4   1.0
  4. AS64510  198.51.100.9    38.0%   100    2.6   3.1   2.4  18.2   2.2
  5. AS64510  198.51.100.30    0.0%   100  148.9 149.3 148.6 151.0   0.4
  6. AS64520  192.0.2.44       0.0%   100  201.7 202.3 201.2 214.9   1.9
  7. AS64520  203.0.113.10     0.0%   100  202.0 202.4 201.6 206.3   0.7
```

Three reading rules, each of which prevents a common false alarm:

- **Loss only counts if it continues to the destination.** Hop 4 shows 38% loss, but hops 5 to 7 show none. Routers forward packets in hardware and answer probes addressed to themselves with a rate-limited, low-priority CPU. Hop 4 is declining to answer, not dropping traffic. Real loss at hop 4 would appear at every hop after it too.
- **Latency only counts if it persists.** The jump from 3 ms at hop 4 to 149 ms at hop 5, carried through to the destination, is a long link: here, the trans-Pacific cable. The further 53 ms to hop 6 is the continent. A single hop with high latency that later hops do not inherit is, again, a slow reply, not a slow path.
- **The path back is not the path out.** Internet routing is usually asymmetric, so mtr from your side shows only the forward path. When you report a problem to a provider, send mtr output from both ends.

This path is healthy: no persistent loss, a stable 202 ms to the destination with a small standard deviation. Together with the curl numbers, it says the Sydney problem is geography, not a fault. A faulty path would instead show something like 3% loss starting at one hop and continuing to the last, or a destination standard deviation of tens of milliseconds that says queues are filling somewhere.

Probe type matters. By default mtr sends ICMP echo; firewalls treat ICMP differently from your application traffic, and ECMP routers hash it onto different paths. `mtr --tcp --port 443` sends TCP SYNs to the same port your application uses, so the probes follow the same rules as the real traffic.

## ss: what the kernel knows about your sockets

`ss` reads socket state straight from the kernel and is the fastest way to answer "what is this host doing on the network right now". [TCP deep dive](/learn/networking/fundamentals/tcp-deep-dive) reads `ss -ti` field by field; for triage, counts by state often say enough:

```text
$ ss -s
Total: 18423
TCP:   18190 (estab 212, closed 17902, orphaned 0, timewait 17881)
```

| What you see | What it usually means |
|---|---|
| Thousands of `TIME-WAIT` on a client | Connections are not being reused; look at pooling and keep-alive |
| Growing `CLOSE-WAIT` | Your code is not closing sockets after the peer hung up; it is a bug in your process, not the network |
| Many `SYN-SENT` | Connection attempts are not being answered: firewall, security group or a down host |
| `Recv-Q` growing on an `ESTAB` socket | Data has arrived and your application is not reading it |
| `Send-Q` growing on an `ESTAB` socket | The peer or the path cannot keep up with what you are sending |
| `Recv-Q` at the limit on a `LISTEN` socket | The accept queue is full; new connections are being dropped |

`ss -s` above shows 17,881 sockets in `TIME-WAIT` against 212 established: a client opening a connection per request. [Connection pooling](/learn/networking/networking-in-practice/connection-pooling-and-keep-alive) is the fix. For kernel-wide counters, `nstat -az` exposes the ones that matter: `TcpRetransSegs` (retransmissions), `TcpExtListenOverflows` (accept-queue drops) and `TcpInCsumErrors` (checksum failures, the corruption signature from [Error detection](/learn/networking/network-algorithms/error-detection)).

## tcpdump: the ground truth

When the cheap tools disagree, capture the packets. Capture narrowly and to a file, so you can read it with better tools later:

```bash
sudo tcpdump -i any -nn -s 0 -c 20000 -w /tmp/payments.pcap 'host 10.30.1.8 and tcp port 8080'
```

`-nn` stops tcpdump resolving names and ports (which is slow and generates DNS traffic of its own), `-s 0` captures whole packets, `-c` bounds the capture, and the filter keeps it to the conversation you care about. In a container, run it in the pod's network namespace (`nsenter -t <pid> -n tcpdump ...`) or from an ephemeral debug container. If you can, capture at both ends: the difference between what one side sent and what the other received is the network.

Here is one request from a client whose p99 latency has a spike at exactly one second:

```text
09:12:44.100212 IP 10.20.4.17.51234 > 10.30.1.8.8080: Flags [S], seq 1780398211, win 64240, options [mss 1460,sackOK,TS val 912733 ecr 0,nop,wscale 7], length 0
09:12:45.131605 IP 10.20.4.17.51234 > 10.30.1.8.8080: Flags [S], seq 1780398211, win 64240, options [mss 1460,sackOK,TS val 913764 ecr 0,nop,wscale 7], length 0
09:12:45.132398 IP 10.30.1.8.8080 > 10.20.4.17.51234: Flags [S.], seq 2204419938, ack 1780398212, win 65160, options [mss 1460,sackOK,TS val 55120381 ecr 913764,nop,wscale 7], length 0
09:12:45.132431 IP 10.20.4.17.51234 > 10.30.1.8.8080: Flags [.], ack 1, win 502, options [nop,nop,TS val 913765 ecr 55120381], length 0
09:12:45.132612 IP 10.20.4.17.51234 > 10.30.1.8.8080: Flags [P.], seq 1:143, ack 1, win 502, options [nop,nop,TS val 913765 ecr 55120381], length 142: HTTP: GET /v1/stock/991 HTTP/1.1
09:12:45.133104 IP 10.30.1.8.8080 > 10.20.4.17.51234: Flags [.], ack 143, win 509, options [nop,nop,TS val 55120382 ecr 913765], length 0
09:12:45.139877 IP 10.30.1.8.8080 > 10.20.4.17.51234: Flags [P.], seq 1:318, ack 143, win 509, options [nop,nop,TS val 55120389 ecr 913765], length 317: HTTP: HTTP/1.1 200 OK
```

Read the flags first: `[S]` is SYN, `[S.]` SYN-ACK, `[.]` a bare ACK, `[P.]` data with PSH, `[F.]` FIN, `[R]` reset. After the handshake, tcpdump shows sequence numbers relative to the start (`seq 1:143` is the first 142 bytes).

Then read the timestamps. The first SYN got no answer. The client's kernel waited its initial retransmission timeout, one second, and sent the SYN again (same sequence number, so it is the same attempt). The SYN-ACK came back 0.8 ms after that, so the network round trip is under a millisecond. The server acknowledged the request in half a millisecond and answered 7 ms later. Of 1.04 seconds, 1.03 was a single dropped SYN. The path itself is fast; the first SYN was simply dropped. When that happens to a steady fraction of connections, random loss is rarely the cause, and the usual suspects are a full accept queue (`nstat` on the server shows `TcpExtListenOverflows` rising, because the application is not calling `accept()` fast enough) and a full connection-tracking table on a node (`nf_conntrack: table full, dropping packet` in the kernel log).

The patterns worth recognising on sight:

| In the capture | Diagnosis |
|---|---|
| SYN, then SYN again after 1 s, 3 s, 7 s | Nothing answering: firewall or security group dropping, host down, accept queue or conntrack full |
| SYN answered immediately by RST | Nothing listening on that port: "connection refused" |
| RST after an idle period, first request on a reused connection fails | An idle timeout on a load balancer, NAT or server; compare the RST's IP TTL with the server's normal TTL to see whether a middlebox sent it |
| Retransmissions, duplicate ACKs, SACK blocks | Loss on the path; check how it correlates with load |
| `win 0` from the receiver | The receiving application is not reading fast enough |
| Request ACKed at once, response hundreds of milliseconds later | Server think time; the network is innocent |
| Small packets flow, full-size segments are retransmitted forever | A path MTU black hole: ICMP "fragmentation needed" is being filtered |
| `cksum ... (incorrect)` on packets *you* sent | Checksum offload; the NIC fills it in after capture. Not a problem |

```viz
{"type": "network", "scenario": "tcp-retransmit", "title": "What loss looks like in a capture", "caption": "A missing segment produces a run of duplicate ACKs carrying the same ack number, then a retransmission with the original sequence number, then an ACK that jumps forward past everything the receiver had buffered."}
```

For anything longer than a screen, open the file in Wireshark or `tshark`. The display filter `tcp.analysis.retransmission` lists retransmissions, `tcp.analysis.zero_window` finds stalled receivers, `tshark -r payments.pcap -q -z conv,tcp` summarises every conversation, and "Follow TCP Stream" reassembles one exchange. For TLS traffic, set `SSLKEYLOGFILE` when running curl or a browser, and Wireshark can decrypt the capture with the logged keys.

## When the number is the clue

Latency that clusters at particular values is a timer firing, and the value tells you which timer.

| Latency | Usual cause |
|---|---|
| ~1 s, ~3 s, ~7 s | SYN retransmission (initial timeout 1 s, doubling) |
| ~200 ms or more extra | A data segment retransmitted after a timeout (Linux's minimum RTO is 200 ms), often tail loss |
| ~40 ms | Nagle's algorithm meeting delayed ACKs on small writes |
| ~5 s | A DNS query lost or unanswered: the resolver's default timeout |
| Exactly 30 s, 60 s or another round number | Someone's configured timeout; find whose |
| Multiples of the RTT | Handshakes, slow start and protocol round trips: physics, not a fault |

In the Sydney investigation, every phase was a multiple of one RTT: physics. In the one-second spike, the capture showed a timer: a fault. Being able to tell those apart from the numbers alone is what lets you write the incident summary a director can act on.

## Senior signals

- You debug by **phase** (resolve, path, connect, TLS, transfer, application), measure from where the problem is, and use the cheapest tool that can separate two phases.
- You read curl's timings as **cumulative** and translate them into round trips, so you can say how much of a slow request is distance and how much is the server.
- You know `dig` bypasses the path your process uses and check with **`getent`** before trusting a DNS answer.
- You never report loss at an intermediate mtr hop that does not **persist to the destination**, and you ask for the reverse path.
- You recognise the capture signatures of dropped SYNs, resets, zero windows, server think time and MTU black holes, and you know sender-side "incorrect cksum" is **offload**.
- You treat latency clustered at 1 s, 200 ms, 40 ms or 5 s as a **timer** and name which one before anyone opens a packet capture.

## Check yourself

```quiz
- q: >-
    curl reports time_connect = 0.090, time_appconnect = 0.180, time_pretransfer = 0.181 and time_starttransfer = 0.950. Roughly how long did the server take to start responding once the request was sent?
  options: ["950 ms", "About 770 ms, which includes one round trip of about 90 ms, so about 680 ms of server time", "About 90 ms", "About 180 ms"]
  answer: 1
  explanation: >-
    The timings are cumulative. Request ready to first byte is 0.950 − 0.181 ≈ 0.77 s. The TCP handshake shows one RTT is about 90 ms, and the request-response exchange needs one RTT, so roughly 680 ms is server-side time: queueing, the handler or its dependencies. Reading 950 ms as server time counts the handshakes twice.
- q: >-
    mtr shows 45% loss at hop 6 of 11, and 0% loss at hops 7 to 11 including the destination. What do you conclude?
  options: ["Hop 6 is dropping almost half of all traffic", "The destination is down", "Hop 6 is rate-limiting or deprioritising its replies to probes; traffic through it is fine", "The path is asymmetric so the numbers are meaningless"]
  answer: 2
  explanation: >-
    If hop 6 really dropped forwarded traffic, every later hop and the destination would show at least that much loss. Loss that does not persist downstream is the router's control plane declining to answer probes. Only loss that continues to the destination counts.
- q: >-
    A service's connection latency histogram has spikes at 1 s and 3 s. Which is the best first check?
  options: ["Whether SYNs are being dropped, for example accept-queue overflows (TcpExtListenOverflows) on the server or a firewall dropping packets", "The DNS TTL", "Nagle's algorithm", "The TLS certificate chain"]
  answer: 0
  explanation: >-
    1 s and 3 s are the initial SYN retransmission timeout and its first doubling, so the first SYN (or the handshake's final ACK) was dropped. A full accept queue or connection-tracking table, or a filtering firewall, is the usual cause. Nagle gives about 40 ms; DNS timeouts give about 5 s.
- q: >-
    dig returns the correct new address for payments.internal, but the service keeps connecting to the old one. Which is NOT a plausible explanation?
  options: ["An entry in /etc/hosts overrides DNS for getaddrinfo", "A runtime or stub resolver cache is still holding the old answer", "Pooled connections opened before the change are still in use", "The authoritative DNS server is returning the old address"]
  answer: 3
  explanation: >-
    dig just showed that DNS returns the new address, so the authoritative answer is not the problem. /etc/hosts, local and runtime caches, and long-lived pooled connections all sit between DNS and the process, which is why getent ahosts is the right comparison.
- q: >-
    A tcpdump on a web server shows "cksum 0x1c46 (incorrect -> 0x9a7e)" on every packet the server sends, while clients report no errors. What is happening?
  options: ["The server's NIC is corrupting packets", "Checksum offload: the capture sees packets before the NIC computes the checksum", "An attacker is modifying packets", "The MTU is too large"]
  answer: 1
  explanation: >-
    With transmit checksum offload, the kernel hands packets to the NIC with a placeholder checksum and the hardware fills in the real one. tcpdump captures in between. Real corruption would appear as checksum failures and retransmissions on the receiving side.
```
