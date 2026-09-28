---
slug: debugging-the-network
title: "Debugging the network: curl, dig, mtr, ss and tcpdump"
description: "A phase-by-phase method for turning \"the network is slow\" into a named cause, worked on real output from one machine: reading curl timings, checking what your process actually resolves, reading mtr without being fooled by ICMP, triaging sockets with ss and nstat, and reading captured SYN, SYN-ACK, FIN and RST traces."
minutes: 35
difficulty: medium
tags: [networking, debugging, curl, dig, mtr, traceroute, tcpdump, ss, wireshark, observability]
problems: []
---
Users in Sydney report that the API is slow. The service dashboard shows a p99 handler time of 45 ms, all green. Both are true, because they measure different things. The dashboard times the handler. The user times DNS, a TCP handshake, a TLS handshake, every router between Sydney and Virginia, the queue in front of your process, the handler, and the transfer of the response body back across an ocean. Somewhere in that list is the answer, and "the network is slow" is not one.

Network debugging is the discipline of cutting that list into phases and timing each one from the place where the problem happens. Each tool in this lesson answers exactly one question. Knowing which question you are asking, and which tool answers it, is most of the skill. Unless a block says otherwise, every output below was produced on one machine (Linux 6.18 under WSL2, on a consumer access link), with addresses on the local side anonymised; the packet captures were taken inside a private network namespace, which is how you can reproduce them without root.

## The method: split the request into phases

| Phase | Question | Tool | What "bad" looks like |
|---|---|---|---|
| Name resolution | What address does *my process* get, and how fast? | `getent`, `dig`, `resolvectl` | Wrong address, `SERVFAIL`, lookups that take exactly 5 s |
| Path | Which way do packets go, and where are they lost or delayed? | `mtr`, `traceroute`, `tracepath` | Loss that persists to the destination, latency that jumps and stays |
| Connection | Does the handshake complete? | `curl -v`, `ss`, `tcpdump` | SYNs retransmitted after 1 s, immediate RSTs |
| TLS | Does the handshake succeed, and in how many round trips? | `curl -v`, `openssl s_client` | Certificate errors, two-RTT handshakes, no resumption |
| Transfer | Is the transport healthy? | `ss -ti`, `nstat`, `tcpdump` | Retransmissions, zero windows, a tiny congestion window |
| Application | How long does the server think? | `curl` TTFB, server logs, traces | A long gap between the request and the first response byte |

Two rules make the table work. **Measure from where the problem is**: the same request from your laptop, from a pod in the cluster and from the user's region can take three different paths through three different resolvers, so run the tools inside the affected pod's network namespace if that is where the complaint comes from. And **go cheapest first**: `curl -w` takes a second and often names the phase outright; a packet capture takes an hour to read and is for when the cheap tools disagree.

## curl: a stopwatch for one request

`curl -v` narrates a request. Lines starting with `*` are curl's commentary, `>` is what was sent, `<` is what came back. Trimmed, against `https://example.com/`:

```text
* IPv6: 2606:4700:10::ac42:93f3, 2606:4700:10::6814:179a
* IPv4: 172.66.147.243, 104.20.23.154
*   Trying 172.66.147.243:443...
* Connected to example.com (172.66.147.243) port 443
* ALPN: curl offers h2,http/1.1
* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384 / X25519 / id-ecPublicKey
* ALPN: server accepted h2
*  subject: CN=example.com
*  expire date: Dec 25 22:56:35 2026 GMT
*  issuer: C=US; O=SSL Corporation; CN=Cloudflare TLS Issuing ECC CA 3
*  SSL certificate verify ok.
> GET / HTTP/2
> Host: example.com
< HTTP/2 200
< server: cloudflare
< age: 6
< cf-cache-status: HIT
* Connection #0 to host example.com left intact
```

Everything you need to rule things out is here: which addresses DNS returned and which one curl tried, the TLS version and cipher, the negotiated HTTP version, the certificate's subject, issuer and expiry, and headers added on the way. `cf-cache-status: HIT` and `age: 6` say a CDN edge answered from a copy cached six seconds earlier: the origin was never involved.

### Timing phases with -w

curl's timing variables are **cumulative**: each is measured from the start of the request, not from the previous phase.

```bash
curl -s -o /dev/null https://example.com/ -w '
  dns:   %{time_namelookup}
  tcp:   %{time_connect}
  tls:   %{time_appconnect}
  sent:  %{time_pretransfer}
  ttfb:  %{time_starttransfer}
  total: %{time_total}
  ip %{remote_ip} http/%{http_version} status %{http_code}
'
```

Two consecutive runs from this machine:

```text
  run 1                          run 2
  dns:   0.031388                dns:   0.006630
  tcp:   0.085575                tcp:   0.060617
  tls:   0.140222                tls:   0.142045
  sent:  0.140318                sent:  0.142135
  ttfb:  0.201573                ttfb:  0.200012
  total: 0.201614                total: 0.200052
  ip 172.66.147.243 http/2       ip 104.20.23.154 http/2
```

Subtract to get phases. Run 1: DNS 31 ms, TCP 54 ms, TLS 55 ms, request to first byte 61 ms, body under 1 ms (559 bytes). Every phase after DNS is about one round trip of roughly 55 ms: one for the handshake, one for TLS 1.3, one for the request. The cached response added almost nothing. Run 2's DNS took 7 ms, an answer served from a cache along the way, and curl connected to the *other* address, because the resolver returned the two A records in a different order.

The round trip itself is not a constant on this link: three consecutive Python connections to the same address took 30, 54 and 157 ms to connect, and the kernel's own minimum RTT for each (`ss -ti`'s `minrtt`) was 28, 54 and 152 ms. That is jitter on the access link, and it is why one sample proves nothing: run the command several times and compare distributions.

For a far-away origin the same arithmetic produces the Sydney complaint. An illustrative run from Sydney to Virginia reads `tcp 0.205, tls 0.412, ttfb 0.655, total 0.861`: TCP 201 ms, TLS 207 ms, server plus one round trip 243 ms, transfer 206 ms (a response larger than the initial congestion window needs a second flight, see [Latency, bandwidth and the math](/learn/networking/networking-in-practice/latency-bandwidth-and-math)). The server spent about 40 ms of 861. The fix is fewer round trips (TLS terminated at an edge near users with warm, pooled connections to the origin), caching at a CDN, or running closer to users; optimising the handler saves at most 40 ms.

A few flags do most of the remaining work:

- `--resolve api.example.com:443:203.0.113.11` pins the name to one address without touching DNS, so you can test each backend behind a load balancer with the correct SNI and `Host` header.
- `--connect-to ::10.0.5.20:8443` sends the request to a different host and port while keeping the URL, and so the certificate check, intact.
- `--http1.1` and `--http2` force the protocol, which isolates proxy bugs that affect one version.

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
  - args: [{namelookup: 31, connect: 86, appconnect: 140, pretransfer: 140, starttransfer: 202, total: 202}]
    expected: {dns: 31, tcp: 55, tls: 54, server: 62, transfer: 0}
    label: the measured request to example.com, rounded to milliseconds
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

[DNS](/learn/networking/fundamentals/dns) covers reading `dig` output. The debugging point is different: `dig` sends a DNS query straight to a server. Your application calls `getaddrinfo` (or its runtime's resolver), which reads `/etc/hosts` and `nsswitch.conf`, may go through a caching stub such as `systemd-resolved`, applies the `search` domains and `ndots` rule from `/etc/resolv.conf`, and may cache again inside the runtime. A correct `dig` answer proves only that DNS is correct.

```text
$ dig example.com A +noall +answer +stats
example.com.		300	IN	A	104.20.23.154
example.com.		300	IN	A	172.66.147.243
;; Query time: 31 msec
;; SERVER: 10.255.255.254#53(10.255.255.254) (UDP)

$ getent ahosts example.com
172.66.147.243  STREAM example.com
104.20.23.154   STREAM

$ dig @1.1.1.1 example.com A +noall +answer +stats
example.com.		300	IN	A	172.66.147.243
example.com.		300	IN	A	104.20.23.154
;; Query time: 3 msec
```

Read it the way the process would. The configured resolver here is WSL's forwarder at 10.255.255.254, and `nsswitch.conf` says `hosts: files dns`, so `/etc/hosts` is consulted first. The TTL is 300 s. The two addresses come back in different orders from different queries, and `getaddrinfo` also sorts them (RFC 6724 rules), which is why curl's two runs above connected to different addresses. Against internal names the same comparison finds real bugs:

```text
$ dig +short payments.internal
10.30.1.8
$ getent ahosts payments.internal
10.30.9.99      STREAM payments.internal
```

Here `getent` disagrees with DNS because someone left a line in `/etc/hosts`. When the two differ, the application is right about what it is doing and `dig` is right about what it should be doing. The comparisons, in order: `getent ahosts name` (what the process gets), `dig name` (the configured resolver), `dig @8.8.8.8 name` or another public resolver (is the configured one stale or split-horizon?), and `dig +trace name` (the authoritative servers, bypassing every cache). The first point where answers diverge is the layer with the problem. Inside Kubernetes read the pod's `/etc/resolv.conf` too: `ndots:5` turns one lookup of an external name into several search-domain queries that each fail before the real one is tried.

## mtr: the path, hop by hop

`traceroute` discovers the path by sending probes with increasing TTL; each router that drops a probe at TTL zero reveals itself with an ICMP "time exceeded" message. `mtr` does it continuously and keeps statistics per hop, which is what intermittent problems need.

```viz
{"type": "network", "scenario": "traceroute", "title": "Discovering the path one TTL at a time", "caption": "Each router that decrements a probe's TTL to zero replies with ICMP Time Exceeded, revealing its address and the round-trip time to it. A hop that does not reply shows as * * * even though traffic passes through it normally."}
```

From this machine to one of example.com's addresses, 20 probes, ISP hops anonymised:

```text
$ mtr -rwzn -c 20 104.20.23.154
HOST: dev-box                 Loss%   Snt   Last   Avg  Best  Wrst StDev
  1. AS???    192.168.34.1     0.0%    20    0.5   0.6   0.4   0.7   0.1
  2. AS???    192.168.1.1     10.0%    20    1.5   1.3   1.1   1.9   0.2
  3. AS???    100.64.0.1       0.0%    20   23.7  21.9  17.0  32.6   3.9
  4. AS???    172.16.250.134   0.0%    20   19.4  23.0  16.7  32.7   4.7
  5. AS64500  198.51.100.244   0.0%    20   23.3 108.1  16.5 757.9 182.5
  6. AS64500  198.51.100.75    0.0%    20   19.1  22.2  17.8  36.7   4.0
  7. AS64500  198.51.100.67    0.0%    20   27.2  25.1  16.8  35.7   5.4
  8. AS13335  141.101.72.105   0.0%    20   19.9  22.8  16.2  29.7   3.8
  9. AS13335  141.101.72.115   0.0%    20   22.9  32.4  16.2  72.2  15.3
 10. AS13335  104.20.23.154    0.0%    20   26.7  23.4  16.3  32.4   4.3
```

Three reading rules, each of which this output exercises:

- **Loss only counts if it continues to the destination.** Hop 2 (a home router) shows 10% loss and every later hop shows none. Routers forward packets in hardware and answer probes addressed to themselves from a rate-limited, low-priority CPU; hop 2 declined to answer two probes, it dropped no traffic.
- **Latency only counts if it persists.** Hop 5 averages 108 ms with a worst case of 758 ms, and hop 6 averages 22 ms. A router whose own replies are slow while later hops are fast is busy answering probes, not delaying packets. The real cost of the path appears at hop 3: the access link adds about 20 ms and 4 ms of standard deviation, and every later hop inherits it.
- **The path back is not the path out.** Internet routing is usually asymmetric (see [Routing algorithms](/learn/networking/network-algorithms/routing-algorithms)), so mtr shows the forward path only; send output from both ends when you report a problem to a provider.

This path is healthy: no persistent loss, and the destination's 23 ms average is hop 3's 22 ms plus about a millisecond.

Probe type matters. `mtr --tcp --port 443` sends SYNs to the port your application uses, so firewalls treat the probes like real traffic. Two things changed when this machine ran it against the same address: hops 6, 8 and 9 each listed six to eight different router addresses, because every probe has a different source port and ECMP hashes each one onto a different parallel link; and the destination row read 45% loss at 55.6 ms, while curl's connections to it succeeded every time. An edge that treats a burst of half-open connections as a SYN flood can decline to answer some of them, so TCP-mode loss at a CDN is not application loss either. Confirm any mtr finding with the application's own protocol.

## ss and nstat: what the kernel knows

`ss` reads socket state from the kernel and answers "what is this host doing on the network right now". [TCP deep dive](/learn/networking/fundamentals/tcp-deep-dive) reads `ss -ti` field by field; for triage, counts by state often say enough. This development machine:

```text
$ ss -s
TCP:   52 (estab 20, closed 21, orphaned 0, timewait 14)
$ nstat -az | grep -E 'Retrans|Listen|CsumErr|TCPTimeouts'
TcpRetransSegs                  14921
TcpInCsumErrors                 2
TcpExtListenOverflows           689
TcpExtListenDrops               689
TcpExtTCPTimeouts               1012
```

| What you see | What it usually means |
|---|---|
| Thousands of `TIME-WAIT` on a client | Connections are not reused; look at pooling and keep-alive |
| Growing `CLOSE-WAIT` | Your code is not closing sockets after the peer hung up: a bug in your process, not the network |
| Many `SYN-SENT` | Connection attempts are not answered: firewall, security group or a host that is down |
| `Recv-Q` growing on an `ESTAB` socket | Data has arrived and the application is not reading it |
| `Send-Q` growing on an `ESTAB` socket | The peer or the path cannot keep up |
| `Recv-Q` at the limit on a `LISTEN` socket | The accept queue is full; new connections are being dropped |

The `nstat` counters are cumulative since boot, and 689 listen overflows on a machine that runs test servers is the kind of number to watch for *changes*: `nstat` without `-a` prints the delta since its last run, which is how the captures below report exactly what one experiment did. `TcpInCsumErrors` counts segments that failed the checksum, the corruption signature from [Error detection](/learn/networking/network-algorithms/error-detection).

## tcpdump: the ground truth

When the cheap tools disagree, capture the packets, narrowly and to a file:

```bash
sudo tcpdump -i any -nn -s 0 -c 20000 -w /tmp/payments.pcap 'host 10.30.1.8 and tcp port 8080'
```

`-nn` stops name and port lookups (slow, and they generate DNS traffic of their own), `-s 0` captures whole packets, `-c` bounds the capture, `-C 100 -W 10` rotates ten 100 MB files for long hunts, and the filter keeps the conversation you care about. Filters worth knowing: `'tcp[tcpflags] & (tcp-syn|tcp-rst) != 0'` shows only handshakes and resets, `'tcp[tcpflags] & tcp-rst != 0'` only resets, `'icmp[icmptype] == icmp-unreach'` finds path-MTU and unreachable messages. In a container, run in the pod's network namespace (`nsenter -t <pid> -n tcpdump ...`) or an ephemeral debug container. Capture at both ends when you can: the difference between what one side sent and the other received is the network.

The captures below were taken with `unshare -rn`, which gives an unprivileged user a private network namespace where tcpdump works, with `tc qdisc add dev lo root netem delay 5ms` adding 5 ms to every packet (a 10 ms round trip). `-ttt` prints the time since the previous packet.

### A healthy exchange, line by line

```text
 00:00:00.000000 IP 127.0.0.1.52410 > 127.0.0.1.8080: Flags [S], seq 139345455, win 64240, options [mss 1460,sackOK,TS val 1306221099 ecr 0,nop,wscale 10], length 0
 00:00:00.005044 IP 127.0.0.1.8080 > 127.0.0.1.52410: Flags [S.], seq 991673892, ack 139345456, win 65160, options [mss 1460,sackOK,TS val 2831305187 ecr 1306221099,nop,wscale 10], length 0
 00:00:00.005040 IP 127.0.0.1.52410 > 127.0.0.1.8080: Flags [.], ack 1, win 63, length 0
 00:00:00.000032 IP 127.0.0.1.52410 > 127.0.0.1.8080: Flags [P.], seq 1:42, ack 1, win 63, length 41: HTTP: GET /v1/stock/991 HTTP/1.1
 00:00:00.005042 IP 127.0.0.1.8080 > 127.0.0.1.52410: Flags [.], ack 42, win 64, length 0
 00:00:00.000038 IP 127.0.0.1.8080 > 127.0.0.1.52410: Flags [P.], seq 1:41, ack 42, win 64, length 40: HTTP: HTTP/1.1 200 OK
 00:00:00.005049 IP 127.0.0.1.52410 > 127.0.0.1.8080: Flags [.], ack 41, win 63, length 0
 00:00:00.000006 IP 127.0.0.1.52410 > 127.0.0.1.8080: Flags [F.], seq 42, ack 41, win 63, length 0
 00:00:00.005105 IP 127.0.0.1.8080 > 127.0.0.1.52410: Flags [F.], seq 41, ack 43, win 64, length 0
 00:00:00.005061 IP 127.0.0.1.52410 > 127.0.0.1.8080: Flags [.], ack 42, win 63, length 0
```

Read the flags first: `[S]` SYN, `[S.]` SYN-ACK, `[.]` a bare ACK, `[P.]` data with PSH, `[F.]` FIN, `[R]` reset. The SYN carries the client's initial sequence number and options (MSS 1,460, SACK permitted, timestamps, window scale 10). The SYN-ACK acknowledges `139345456`, the client's number plus one, because a SYN consumes one sequence number. After the handshake tcpdump switches to **relative** numbers: `seq 1:42` is the first 41 bytes, and `ack 42` acknowledges them. `win 63` is scaled: 63 × 2^10 = 64,512 bytes. The client's FIN is `seq 42` and the server acknowledges it with `ack 43` (a FIN also consumes one number). Each gap of about 5 ms is one trip across the delayed link; the gaps of a few microseconds are packets sent back to back.

### A port with nothing listening

```text
 IP 127.0.0.1.41530 > 127.0.0.1.9: Flags [S], seq 2588848771, win 65495, length 0
 IP 127.0.0.1.9 > 127.0.0.1.41530: Flags [R.], seq 0, ack 2588848772, win 0, length 0
```

A SYN answered at once by RST is "connection refused": the host is up and nothing listens on that port. The RST acknowledges the SYN (`ack` is the SYN's number plus one) so the client accepts it as a genuine answer. A host that is down, or a firewall that drops, sends nothing at all, which looks completely different.

### Dropped SYNs and the accept queue

A server calls `listen(1)` and never calls `accept()`; four clients connect 10 ms apart. The first two complete immediately (the accept queue holds backlog + 1). For the other two the capture shows only SYNs:

```text
 00:00:00.010534 IP 127.0.0.1.45052 > 127.0.0.1.8080: Flags [S], seq 4085624627, length 0
 00:00:00.010423 IP 127.0.0.1.45066 > 127.0.0.1.8080: Flags [S], seq 15484781, length 0
 00:00:01.017378 IP 127.0.0.1.45066 > 127.0.0.1.8080: Flags [S], seq 15484781, length 0
 00:00:00.000004 IP 127.0.0.1.45052 > 127.0.0.1.8080: Flags [S], seq 4085624627, length 0
 00:00:01.023993 IP 127.0.0.1.45052 > 127.0.0.1.8080: Flags [S], seq 4085624627, length 0
 00:00:00.000001 IP 127.0.0.1.45066 > 127.0.0.1.8080: Flags [S], seq 15484781, length 0
 00:00:00.000020 IP 127.0.0.1.8080 > 127.0.0.1.45066: Flags [S.], seq 1893764515, ack 15484782, length 0
```

The kernel dropped each SYN silently because the queue was full, and `nstat` in the namespace counted exactly that: `TcpExtListenOverflows 4`, `TcpExtListenDrops 4`. The same sequence number on every SYN means the same attempt retransmitted. The clients connected after 2.04 and 2.05 s, once the server's `accept()` at 1.5 s made room and the next retransmission arrived. From the client side this is indistinguishable from a lossy network; the server's counters name it.

### A reset on a reused connection

The server closes connections idle for 2 s. The client keeps its connection in a pool and reuses it 3 s after the first response:

```text
 00:00:00.005027 IP 127.0.0.1.45718 > 127.0.0.1.8080: Flags [.], ack 41, win 63, length 0
 00:00:01.997084 IP 127.0.0.1.8080 > 127.0.0.1.45718: Flags [F.], seq 41, ack 42, win 64, length 0
 00:00:00.047950 IP 127.0.0.1.45718 > 127.0.0.1.8080: Flags [.], ack 42, win 63, length 0
 00:00:00.955104 IP 127.0.0.1.45718 > 127.0.0.1.8080: Flags [P.], seq 42:83, ack 42, win 63, length 41: HTTP: GET /v1/stock/992 HTTP/1.1
 00:00:00.005042 IP 127.0.0.1.8080 > 127.0.0.1.45718: Flags [R], seq 2892959191, win 0, length 0
```

At exactly 2.0 s of idleness the server sends FIN; the client's kernel acknowledges it 48 ms later (a delayed ACK) but the application does not notice, because it is not reading. A second later it writes the next request into the half-closed connection, and the server's kernel, whose socket is gone, answers RST. The client's `recv()` returned end-of-file and a second `send()` raised `BrokenPipeError`; Python's `http.client` reports this as `RemoteDisconnected`, and a load balancer in the client's position returns a 502. [Connection pooling and keep-alive](/learn/networking/networking-in-practice/connection-pooling-and-keep-alive) turns this capture into the timeout rule that prevents it.

### Signatures worth recognising

| In the capture | Diagnosis |
|---|---|
| SYN, then the same SYN again after about 1 s, and again | Nothing answering: firewall or security group dropping, host down, accept queue or conntrack table full |
| SYN answered immediately by RST | Nothing listening on that port: "connection refused" |
| FIN from the server during idle, then a request from the client answered by RST | Idle timeout on the server, load balancer or NAT closed a pooled connection; compare the RST's IP TTL with the server's normal TTL to see whether a middlebox sent it |
| Retransmissions, duplicate ACKs, SACK blocks | Loss on the path; check how it correlates with load |
| `win 0` from the receiver | The receiving application is not reading fast enough |
| Request ACKed at once, response hundreds of milliseconds later | Server think time; the network is innocent |
| Small packets flow, full-size segments are retransmitted forever | A path MTU black hole: ICMP "fragmentation needed" is being filtered |
| `cksum ... (incorrect)` on packets *you* sent | Checksum offload; the NIC fills it in after capture |

```viz
{"type": "network", "scenario": "tcp-retransmit", "title": "What loss looks like in a capture", "caption": "A missing segment produces a run of duplicate ACKs carrying the same ack number, then a retransmission with the original sequence number, then an ACK that jumps forward past everything the receiver had buffered."}
```

For anything longer than a screen, open the file in Wireshark or `tshark`. The display filter `tcp.analysis.retransmission` lists retransmissions, `tcp.analysis.zero_window` finds stalled receivers, `tshark -r payments.pcap -q -z conv,tcp` summarises every conversation, and "Follow TCP Stream" reassembles one exchange. For TLS, set `SSLKEYLOGFILE` when running curl or a browser, and Wireshark decrypts the capture with the logged keys.

## Under the hood: what tcpdump actually sees

tcpdump opens an `AF_PACKET` socket and attaches a classic BPF program compiled from your filter; the kernel runs it on every packet and copies only matches to user space, which is why a narrow filter makes captures cheap. `tcpdump -d` prints the program without capturing. For `'tcp[tcpflags] & (tcp-syn|tcp-rst) != 0'` it is eleven instructions: check EtherType `0x800`, protocol 6, that the packet is not a later fragment, compute the IP header length from its first byte, load the TCP flags byte, and test it against `0x6` (SYN is `0x2`, RST is `0x4`).

Where the tap sits explains three classic confusions. On transmit, tcpdump sees packets before the NIC finishes them, so checksum offload shows as "incorrect" checksums and **TSO** shows single "packets" of 64 KB that the NIC later splits into MTU-sized frames. On receive, **GRO** merges consecutive segments before the tap, so a capture on a busy receiver shows segments far larger than the MTU. And the kernel drops SYNs for a full accept queue *after* the tap, which is why the capture above shows SYNs arriving that the server never answered.

## When the number is the clue

Latency that clusters at particular values is a timer firing, and the value names the timer.

| Latency | Usual cause |
|---|---|
| About 1 s, then 2 s, 3 s on this kernel; 1 s, 3 s, 7 s on older ones | SYN retransmission. The classic schedule doubles from 1 s. Linux 6.18 here has `net.ipv4.tcp_syn_linear_timeouts = 4`: a SYN to a black hole was retransmitted at 1.0, 2.0, 3.1, 4.1, 5.1 and then 7.1 s |
| About 200 ms or more extra | A data segment retransmitted after a timeout (Linux's minimum RTO is 200 ms), often tail loss |
| About 40 ms | Nagle's algorithm meeting delayed ACKs on small writes (the FIN above was acknowledged after 48 ms for the same reason) |
| About 5 s | A DNS query lost or unanswered: the resolver's default timeout |
| Exactly 30 s, 60 s or another round number | Someone's configured timeout; find whose |
| Multiples of the RTT | Handshakes, slow start and protocol round trips: physics, not a fault |

In the curl trace every phase was a multiple of one RTT: physics. In the accept-queue capture a timer fired: a fault. Telling those apart from the numbers alone is what lets you write the incident summary a director can act on.

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Accept queue overflow | p99 connect latency has a spike at about 1 s; clients see occasional slow first requests | `nstat` on the server shows `TcpExtListenOverflows` rising; `ss -ltn` shows `Recv-Q` at the backlog | Accept faster (more acceptor threads, less work before `accept()`), raise the listen backlog and `net.core.somaxconn` |
| Connection-tracking table full | New connections through one node fail or stall at 1 s while existing ones work | The kernel log says `nf_conntrack: table full, dropping packet`; `conntrack -C` near `nf_conntrack_max` | Raise the limit, shorten conntrack timeouts, cut connection churn with pooling |
| Idle-timeout reset | Sporadic 502s or `RemoteDisconnected` on the first request after a quiet period | Capture shows FIN from the server during idle, then the request answered by RST | Client or load-balancer idle timeout shorter than the server's keep-alive timeout |
| Path MTU black hole | Small requests work; large responses hang through one VPN or tunnel | Full-size segments retransmitted with no ACK; no ICMP "fragmentation needed" arrives | Allow ICMP type 3 code 4, or clamp the MSS on the tunnel |
| Resolver timeouts | Requests take exactly 5 s more, intermittently | `curl -w` shows `time_namelookup` ≈ 5 s; a capture shows an unanswered DNS query | Fix the resolver or its path; in Kubernetes, lower `ndots` and use fully qualified names |

## Interviewer follow-ups

**"A service's latency has spikes at exactly one second. Walk me through it."** Model answer: one second is the initial SYN retransmission timeout, so a SYN or the handshake's final ACK was dropped; check the server's `TcpExtListenOverflows`, the node's conntrack table and any firewall in the path, and confirm with a capture showing the repeated SYN. Common wrong answer: "garbage collection pauses", which do not cluster at exactly one second.

**"mtr shows 40% loss at hop 5 and none after it. Is hop 5 the problem?"** Model answer: no; forwarded traffic through hop 5 reaches every later hop, so only the router's replies to probes are being rate-limited. Loss matters only if it persists to the destination. Common wrong answer: "open a ticket with the provider for hop 5".

**"curl says `time_starttransfer` is 950 ms. How much of that is the server?"** Model answer: subtract `time_pretransfer` and then one RTT (read it from the TCP handshake), because the timings are cumulative and the request itself needs a round trip. Common wrong answer: "950 ms", which counts DNS, TCP and TLS as server time.

**"How would you prove an intermittent 502 comes from a keep-alive race?"** Model answer: capture on the load balancer's side of the backend connection and look for the backend's FIN during idle followed by the balancer's request and an RST; correlate the 502 timestamps with connections that were idle for about the backend's keep-alive timeout. Common wrong answer: "raise the load balancer's timeout", which makes it worse.

## What mid-level engineers get wrong

- **Trusting one sample.** On the link above, three connections in a row took 30, 54 and 157 ms; conclusions need distributions.
- **Reading curl's timings as phase durations** instead of cumulative milestones, and blaming the server for the handshakes.
- **Debugging DNS with `dig` alone** when the process reads `/etc/hosts` and runtime caches first.
- **Reporting intermediate-hop loss or latency** that does not persist to the destination, or trusting TCP-mode mtr loss at a CDN edge.
- **Capturing without a filter** on a busy host, dropping packets in the capture itself and filling the disk.
- **Opening incidents about "incorrect checksums" and 64 KB packets** in a sender-side capture, which are offload artefacts.

## Senior signals

- You debug by **phase** (resolve, path, connect, TLS, transfer, application), measure from where the problem is, and use the cheapest tool that can separate two phases.
- You read curl's timings as **cumulative**, translate them into round trips, and take several samples before believing any of them.
- You check **`getent`** before trusting a DNS answer, and you know `dig` bypasses the path your process uses.
- You never report loss at an intermediate mtr hop that does not **persist to the destination**, you know TCP-mode probes spread across ECMP paths, and you ask for the reverse path.
- You can read a capture's SYN, SYN-ACK, FIN and RST lines, including relative sequence numbers and scaled windows, and recognise dropped SYNs, refusals, idle-timeout resets, zero windows, server think time and MTU black holes.
- You treat latency clustered at 1 s, 200 ms, 40 ms or 5 s as a **timer**, know that the SYN schedule depends on the kernel, and name the counter (`ListenOverflows`, conntrack, `TcpInCsumErrors`) that proves it.

## Check yourself

```quiz
- q: >-
    curl reports time_connect = 0.090, time_appconnect = 0.180, time_pretransfer = 0.181 and time_starttransfer = 0.950. Roughly how long did the server take to start responding once the request was sent?
  options: ["About 680 ms: 770 ms minus one round trip", "About 950 ms, the whole time_starttransfer", "About 180 ms, the time until TLS finished", "About 90 ms, the same as the TCP handshake"]
  answer: 0
  explanation: >-
    The timings are cumulative. Request ready to first byte is 0.950 − 0.181 ≈ 0.77 s. The TCP handshake shows one RTT is about 90 ms, and the request-response exchange needs one RTT, so roughly 680 ms is server-side time: queueing, the handler or its dependencies. Reading 950 ms as server time counts the handshakes twice.
- q: >-
    mtr shows 45% loss at hop 6 of 11, and 0% loss at hops 7 to 11 including the destination. What do you conclude?
  options: ["Hop 6 is dropping almost half of the traffic through it", "The destination host is down or intermittently up", "The path is asymmetric, so the numbers mean nothing", "Hop 6 is only rate-limiting its replies to probes"]
  answer: 3
  explanation: >-
    If hop 6 really dropped forwarded traffic, every later hop and the destination would show at least that much loss. Loss that does not persist downstream is the router's control plane rate-limiting or deprioritising its replies to probes; traffic through it is fine. Only loss that continues to the destination counts.
- q: >-
    A capture on a server shows client SYNs arriving and being retransmitted after about a second, with no SYN-ACK sent in between, and nstat shows TcpExtListenOverflows rising. What is happening?
  options: ["The server replies with RST, which is filtered out", "The client's SYNs carry a bad TCP checksum", "A firewall between the hosts drops the SYN-ACKs", "The accept queue is full, so the kernel drops SYNs"]
  answer: 3
  explanation: >-
    Listen overflows count connections dropped because the accept queue was full, and the kernel drops the SYN after tcpdump's tap, so the capture shows SYNs arriving and never answered. A firewall dropping SYN-ACKs would leave SYN-ACKs visible on the server and no overflow counter; an RST would be visible in the capture; checksum failures appear in TcpInCsumErrors instead.
- q: >-
    A pooled HTTP client gets RemoteDisconnected on the first request after a few idle seconds. A capture shows a FIN from the server during the idle period, then the client's request, then an RST from the server. What is the fix?
  options: ["Enable TCP keepalive probes on the pooled sockets", "Retry every failed request after a short fixed delay", "Make the client's idle timeout shorter than the server's", "Raise the client's read timeout well above the server's"]
  answer: 2
  explanation: >-
    The server closed an idle connection (its FIN) and the client reused it anyway; the server's kernel had no socket left and answered with RST. If the client always closes idle connections first, it never writes into one the server has closed. Keepalive probes detect dead peers but do not stop the server's idle close; a longer read timeout does nothing here; retries help only for idempotent requests and hide the cause.
- q: >-
    dig returns the correct new address for payments.internal, but the service keeps connecting to the old one. Which is NOT a plausible explanation?
  options: ["Pooled connections opened before the change are still in use", "A runtime or stub resolver cache is still holding the old answer", "The authoritative DNS server is returning the old address", "An entry in /etc/hosts overrides DNS for getaddrinfo"]
  answer: 2
  explanation: >-
    dig has shown that DNS returns the new address, so the authoritative answer is not the problem. /etc/hosts, local and runtime caches, and long-lived pooled connections all sit between DNS and the process, which is why getent ahosts is the right comparison.
- q: >-
    A tcpdump on a web server shows "cksum 0x1c46 (incorrect -> 0x9a7e)" on every packet the server sends, and some outgoing segments of about 64 KB, while clients report no errors. What is happening?
  options: ["Offload: the NIC finishes checksums and splits segments", "The server's NIC is corrupting all outgoing packets", "The interface MTU is too large for the path to clients", "An attacker on the path is modifying the packets"]
  answer: 0
  explanation: >-
    With transmit offload the kernel hands the NIC a placeholder checksum and, with TSO, one large segment; the hardware computes the real checksum and cuts MTU-sized frames after tcpdump's tap. Real corruption or tampering would appear as checksum failures and retransmissions on the receiving side, and clients see none. An MTU problem would show retransmitted full-size segments, not 64 KB ones that succeed.
```
