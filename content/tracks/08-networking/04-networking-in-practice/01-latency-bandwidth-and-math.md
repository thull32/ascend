---
slug: latency-bandwidth-and-math
title: "Latency, bandwidth and the math of a round trip"
description: "Where the milliseconds in a request go: propagation versus serialisation, RTT budgets, the bandwidth-delay product measured on a 50 ms link, slow start counted in round trips, reading ss -ti, fan-out tail math with a simulation, queueing and Little's law, with every number worked."
minutes: 40
difficulty: medium
tags: [latency, bandwidth, rtt, bandwidth-delay-product, tail-latency, littles-law, estimation, slow-start, fan-out]
problems: []
---
A product manager asks why the page takes 400 ms to show anything when "the API responds in 20 ms". Both numbers are true. The gap is not mystery overhead; it is a fixed number of round trips multiplied by a fixed distance, plus a transport that deliberately starts slow. If you can decompose that 400 ms on a whiteboard, you can say which parts are physics, which parts are protocol, and which parts you are allowed to remove.

This lesson is the arithmetic, checked against measurements: a TCP connection over a 50 ms link with a small and an autotuned receive buffer, slow start counted in round trips on fresh, warm and idle connections, the kernel's own view of a connection from `ss -ti`, and a simulation of how fan-out turns a backend's p99 into a page's median. Everything else in the module (timeouts, pools, debugging) is applying it.

## Four sources of delay

Every packet pays four kinds of delay at every hop. Only one of them is "the network being slow".

| Component | What it is | Typical size |
|---|---|---|
| Propagation | Time for the signal to travel the distance | ~5 µs per km of fibre |
| Transmission (serialisation) | Time to push the bits onto the link, `size / bandwidth` | 12 µs for a 1,500-byte frame at 1 Gbit/s |
| Queueing | Time waiting in a router or NIC buffer behind other packets | 0 to hundreds of ms; the variable one |
| Processing | Header parsing, lookup, checksum | Microseconds per hop |

Light in vacuum moves at about 300,000 km/s. In glass fibre the refractive index is around 1.47, so light travels at roughly 200,000 km/s, which is 5 µs per kilometre. That number is the most useful constant in networking because nothing you do in software changes it.

New York to London is about 5,600 km on a great circle. At 5 µs/km that is 28 ms one way and 56 ms for a round trip. Real fibre does not follow the great circle, amplifiers and switches add a little, and measured RTTs come out at 65–75 ms. When someone quotes "70 ms transatlantic RTT", that is 80% speed of light and 20% route inefficiency, and there is nothing to optimise on either side except moving the endpoints.

Queueing delay is the one that varies. When a link is near saturation, packets wait behind each other in buffers, and buffers can hold hundreds of milliseconds of traffic (the bufferbloat problem covered in [Congestion control](/learn/networking/fundamentals/congestion-control)). The lab later in this lesson reproduced it: a single bulk TCP flow over a 50 ms path with a 1,000-packet queue raised its own RTT to 229 ms. A latency graph that is flat at 70 ms with spikes to 300 ms is telling you about queueing, not distance.

## Serialisation versus propagation, worked

Serialisation depends on size and bandwidth; propagation depends on distance. Which one dominates decides whether buying bandwidth helps.

| Transfer | Serialisation (`bits / bandwidth`) | Propagation, one way | Dominant |
|---|---|---|---|
| 1,500 B packet, 1 Gbit/s, same rack (50 m) | 12 µs | 0.25 µs | Serialisation |
| 1,500 B packet, 1 Gbit/s, 100 km metro | 12 µs | 500 µs | Propagation |
| 2 KB API call, 100 Mbit/s home link, transatlantic | 160 µs | 28,000 µs | Propagation |
| 1 MB image, 10 Mbit/s mobile link, 50 km | 800 ms | 250 µs | Serialisation |
| 1 GB backup, 10 Gbit/s, 3,000 km | 800 ms | 15 ms | Serialisation |

Routers and switches are mostly **store-and-forward**: each hop receives the whole frame before sending it on, so a packet crossing 10 hops at 1 Gbit/s pays 10 × 12 µs = 120 µs of serialisation, plus propagation once. That is why small requests are latency-bound (only fewer round trips or shorter distance help) and large transfers are bandwidth-bound (only a fatter pipe, compression or fewer bytes help). The same 2 KB API call gains nothing from a 10× faster link and gains 50 ms from a server on the right continent.

## Round trips, not bytes

For short requests, what dominates is how many times a packet has to cross the distance and come back before useful data flows. Count the round trips for a cold HTTPS request to a server 70 ms away:

| Step | Round trips | Cumulative at 70 ms RTT |
|---|---|---|
| DNS lookup (recursive resolver, cache miss) | 1 | 70 ms |
| TCP three-way handshake | 1 | 140 ms |
| TLS 1.3 handshake | 1 | 210 ms |
| HTTP request and first byte of response | 1 | 280 ms |

The server's "20 ms response time" starts at 210 ms and ends at 230 ms; the client sees the first byte at about 280 ms. Nothing was slow. The request cost four round trips, and at 70 ms each that is 280 ms of floor that no amount of backend optimisation touches.

One `curl -w` from this lesson's WSL2 machine to a CDN-hosted site showed the same staircase: DNS 34 ms, TCP connect 58 ms later, TLS done 62 ms after that, first byte 58 ms after that, HTTP/2. Each phase cost about one 60 ms round trip at that moment. The same access link is not steady: `ping` to the same address reported 16–28 ms a little later, and three consecutive TCP connections to it took 30, 54 and 157 ms to connect, with the kernel's own `minrtt` for each tracking those values. One sample proves little on such a path; measure with the protocol you use (`curl -w`, or the `rtt` field of `ss -ti` below) and take several.

```viz
{"type": "network", "scenario": "tcp-handshake", "title": "One RTT before any data", "caption": "SYN, SYN-ACK, ACK: the client can send data with the third packet, but the server's first byte cannot arrive before one full RTT has elapsed."}
```

```viz
{"type": "network", "scenario": "https-tls-handshake", "title": "TLS 1.3 adds exactly one more round trip", "caption": "ClientHello carries the key share, so the server can respond with everything needed in one flight. TLS 1.2 needed two."}
```

Now the same request over a warm connection: DNS is cached, the TCP connection is pooled and the TLS session is established. The cost is one round trip, and the first byte arrives at about 90 ms. That is the argument for keep-alive and pooling in [Connection pooling and keep-alive](/learn/networking/networking-in-practice/connection-pooling-and-keep-alive): it removes three of the four round trips. HTTP/3 over QUIC folds the transport and TLS handshakes into one round trip, and 0-RTT resumption removes it for repeat visits ([HTTP/2 and HTTP/3](/learn/networking/application-protocols/http-2-and-http-3)).

State latency as round trips first and milliseconds second. "This flow costs 3 RTTs" is a fact about the protocol; "this flow costs 210 ms" depends on where the user is sitting.

## Bandwidth-delay product

Once data flows, a second limit appears. TCP lets a sender have only a bounded number of unacknowledged bytes in flight: the smaller of the congestion window and the receiver's advertised window. If that bound is smaller than the amount of data the pipe can hold, the sender stops and waits for ACKs and the link sits idle. The amount of data the pipe holds is the **bandwidth-delay product**:

$$\text{BDP} = \text{bandwidth} \times \text{RTT}$$

For a 1 Gbit/s link with a 70 ms RTT:

$$10^9 \text{ bit/s} \times 0.07 \text{ s} = 7 \times 10^7 \text{ bits} = 8.75 \text{ MB}$$

To keep that link full, the sender needs 8.75 MB in flight before the first ACK returns. The original TCP window field is 16 bits, so it maxes out at 65,535 bytes, and without window scaling the best a single connection can do is 65,535 bytes / 0.07 s ≈ 936 KB/s ≈ 7.5 Mbit/s, 0.75% of the link. Rearranged, the formula gives the ceiling for any window:

$$\text{throughput} \le \frac{\text{window}}{\text{RTT}}$$

Every modern stack negotiates window scaling in the SYN, but the ceiling reappears whenever something caps the window: an application that sets a small `SO_RCVBUF` (which also switches off receive-buffer autotuning), a `tcp_rmem` maximum below the BDP, a middlebox that strips the option, or an application that reads slowly and lets the receive window fill. Halving the RTT doubles the ceiling, which is why a CDN edge 10 ms from the user can serve a large file many times faster than an origin 150 ms away, on identical links ([CDNs and the edge](/learn/networking/application-protocols/cdns-and-edge)).

```viz
{"type": "network", "scenario": "sliding-window-protocol", "loss": 0, "title": "At most one window in flight", "caption": "The sender may have one window of unacknowledged bytes outstanding. If the window is smaller than bandwidth times RTT, the sender idles until ACKs return, and throughput is window divided by RTT whatever the link speed."}
```

## Measured: the window ceiling on a 50 ms path

The lab: an unprivileged network namespace on Linux 6.18 (WSL2), loopback MTU set to 1,500 with segmentation offloads off, and `tc qdisc add dev lo root netem delay 25ms rate 100mbit limit 1000`, which gives a 50 ms RTT (ping measured 50.1 ms) and a 100 Mbit/s bottleneck. The BDP is 100 Mbit/s × 50 ms = 625 KB. One Python connection streamed data for 10 s; throughput is the average from second 2 to second 10.

| Receiver | Advertised window (sender's `snd_wnd`) | Throughput | window / RTT |
|---|---|---|---|
| `SO_RCVBUF=65536` set before `connect` | 76,896 bytes | 12.2 Mbit/s | 12.3 Mbit/s |
| Autotuned (`tcp_rmem` = 4096 131072 33554432) | Grew to 5.5 MB | 89.3 Mbit/s | Link-limited |

The small-buffer connection ran at exactly its window divided by the RTT, 12% of the link. Two details are worth knowing. The kernel doubled the requested 65,536 to 131,072 (`getsockopt` reports the doubled value; the extra is for bookkeeping), and the advertised window settled at 59% of that buffer. And the autotuned connection reached the link rate but inflated its own RTT from 50 ms to 229 ms: CUBIC kept growing its window until the netem queue was full, bufferbloat in miniature.

## Under the hood: reading `ss -ti`

The kernel keeps every number above per socket, and `ss -ti` prints them. This is the sending side of the small-buffer connection, five seconds in:

```text
ESTAB 0 771976 127.0.0.1:19100 127.0.0.1:36332
	 cubic wscale:1,10 rto:252 rtt:50.637/0.055 mss:1448 pmtu:1500 rcvmss:536 advmss:1448 cwnd:108
	 bytes_sent:7483224 bytes_acked:7406328 segs_out:5253 segs_in:1393 data_segs_out:5253
	 send 24706677bps lastsnd:24 lastrcv:4988 lastack:24 pacing_rate 49412864bps delivery_rate 12313456bps
	 delivered:5200 busy:4988ms rwnd_limited:4836ms(97.0%) unacked:54 rcv_space:14480 rcv_ssthresh:64088
	 notsent:695080 minrtt:50.114 snd_wnd:76896
```

| Field | Value | Meaning |
|---|---|---|
| `wscale:1,10` | 1 and 10 | Window-scale shifts from the SYNs: the peer's (1, small because its buffer was small) and ours (10) |
| `rto:252` | 252 ms | Retransmission timeout: smoothed RTT plus a 200 ms floor on the variance term |
| `rtt:50.637/0.055` | ms | Smoothed RTT and its mean deviation |
| `mss:1448` | bytes | Payload per segment: 1,500 − 20 (IP) − 20 (TCP) − 12 (timestamp option) |
| `cwnd:108` | segments | Congestion window: 108 × 1,448 = 156 KB, twice what the receiver allows |
| `bytes_acked` | 7,406,328 | Bytes the peer has acknowledged so far |
| `send 24706677bps` | 24.7 Mbit/s | `cwnd × mss / rtt`: what the congestion window alone would allow |
| `delivery_rate` | 12.3 Mbit/s | Measured recent goodput, matching the throughput above |
| `rwnd_limited:4836ms(97.0%)` | 97% | Share of busy time the sender was blocked by the receive window: the diagnosis in one field |
| `unacked:54` | segments | In flight: 54 × 1,448 = 78 KB, which is the receive window |
| `notsent:695080` | bytes | Queued in the send buffer, waiting for window |
| `minrtt:50.114` | ms | Lowest RTT seen: the propagation floor of the path |
| `snd_wnd:76896` | bytes | The window the receiver advertised: the binding limit |

On the receiving socket the interesting fields are `rcv_space:82688` (autotuning's measure of how much the application reads per RTT; the buffer grows when it grows) and `rcv_ssthresh:76896` (the current cap on the window this side advertises). In the autotuned run `rcv_space` reached 2.6 MB. `rwnd_limited` near 100% means fix the receiver; a high `cwnd` with retransmissions means the network; `app_limited` means the sender is not writing fast enough.

## Slow start is a latency cost

A new TCP connection does not begin at the BDP. It begins with an initial congestion window (`initcwnd`) of 10 segments in Linux since 2.6.39, about 14.5 KB with a 1,448-byte MSS, and doubles every RTT until it sees loss or reaches a threshold ([TCP deep dive](/learn/networking/fundamentals/tcp-deep-dive) covers the ACK clock behind it).

```viz
{"type": "network", "scenario": "congestion-slow-start", "loss": 0, "title": "cwnd doubling per RTT", "caption": "Each RTT the sender may have twice as many segments in flight. Small objects finish while the window is still tiny."}
```

Trace a 1 MB (1,000,000-byte) response on a fresh connection, with MSS 1,448 and no loss:

| Flight | cwnd | Bytes sent this RTT | Cumulative |
|---|---|---|---|
| 1 | 10 segments | 14.5 KB | 14.5 KB |
| 2 | 20 | 29.0 KB | 43.4 KB |
| 3 | 40 | 57.9 KB | 101 KB |
| 4 | 80 | 116 KB | 217 KB |
| 5 | 160 | 232 KB | 449 KB |
| 6 | 320 | 463 KB | 912 KB |
| 7 | 640 | 927 KB | 1.84 MB |

The megabyte completes in the seventh flight. The request takes half an RTT to arrive and each flight half an RTT to return, so the last byte lands 7 RTTs after the request was sent: 350 ms at 50 ms per RTT, for an object a 1 Gbit/s link serialises in 8 ms.

The same lab, without the rate limit, served 1 MB responses over one connection, five times per setting:

| Case | `tcp_slow_start_after_idle=1` (default) | `=0` |
|---|---|---|
| Fresh connection | 7, 7, 8, 8, 8 RTTs | 7, 7, 7, 7, 8 RTTs |
| Same connection, immediately after | 1–3 RTTs | 1–2 RTTs |
| Same connection, after 1 s idle | 4 RTTs, every time | 1 RTT, every time |

The trace predicts 7; the 8s were receiver-limited, because a fresh receiver advertises about 64 KB (`rcv_ssthresh:64088` in `ss`) and grows it as data arrives, and `ss` reported the sender `rwnd_limited` 40% of the time. The idle row is the kernel's congestion-window restart: when a connection has been idle for longer than its RTO, Linux halves `cwnd` once for every RTO of idle time, down to the initial window, so 1 s at a 252 ms RTO costs three halvings. Servers holding long-lived, bursty connections often set `tcp_slow_start_after_idle=0`.

Two consequences you can act on. A response under about 14 KB fits in the initial window and completes in one RTT, which is why critical CSS is inlined and why the first 14 KB of an HTML page is worth more than the next 100 KB. And a reused, recently active connection delivers the same megabyte in one or two RTTs instead of seven.

## Tail latency and fan-out

Averages describe throughput. Users experience percentiles. A service whose median is 20 ms and whose p99 is 300 ms is a service where one request in a hundred takes fifteen times longer, and at 1,000 requests per second that is ten users per second having a bad time.

Fan-out makes tails much worse. A page that waits for $n$ parallel backend calls is as slow as the slowest. If each call is fast with probability $p$, independently:

$$P(\text{page fast}) = p^n \qquad 0.99^{100} \approx 0.37$$

So with 100 backends 63% of page loads wait on at least one backend's slowest 1%. Turn it around: for the page to be fast 99% of the time, each backend must be fast with probability $0.99^{1/n}$. For $n = 100$ that is 0.99990: every backend must hold at its **p99.99** the latency you want the page to have at its p99. For $n = 10$ it is the p99.9.

To see this with a realistic shape, a simulation drew each backend call from a lognormal distribution (median 10 ms, σ = 0.5) plus a 1% chance of a stall adding an exponential delay with a 100 ms mean; seed 11, 20,000 pages per row (4,000 for $n = 500$). One backend alone: p50 10.1 ms, p99 40.5 ms, p99.99 462 ms.

| Fan-out $n$ | Page p50 | Page p99 | Pages slower than one backend's p99 | $1 - 0.99^n$ |
|---|---|---|---|---|
| 1 | 10.1 ms | 39.8 ms | 1.0% | 1.0% |
| 10 | 21.9 ms | 234 ms | 9.4% | 9.6% |
| 50 | 35.1 ms | 397 ms | 39.3% | 39.5% |
| 100 | 54.3 ms | 472 ms | 63.5% | 63.4% |
| 500 | 208 ms | 659 ms | 99.2% | 99.3% |

At $n = 100$ the page's p99 (472 ms) sits at the single backend's p99.99 (462 ms), as the formula said, and the page's *median* (54.3 ms) is slower than 99.3% of individual calls. This is why large fan-out systems spend so much effort on the tail of each dependency and use **hedged requests**: if no reply arrives within the dependency's p95, send a second copy to another replica and take whichever answers first. Dean and Barroso's "The Tail at Scale" (CACM, 2013) reports a Google benchmark where hedging after 10 ms cut the 99.9th percentile of a 1,000-key read from 1,800 ms to 74 ms for 2% more requests; the measured trade-off and the idempotency requirement are in [Timeouts, retries and backoff](/learn/networking/networking-in-practice/timeouts-retries-and-backoff).

## Queueing: why utilisation bends the curve

Two quiet contributors to tails are garbage-collection pauses on any hop and queueing when a server runs near saturation. For an M/M/1 queue (random arrivals, random service times, one server), the mean time waiting in the queue, in units of the mean service time, is $\rho / (1 - \rho)$ at utilisation $\rho$:

| Utilisation $\rho$ | 50% | 80% | 90% | 95% | 99% |
|---|---|---|---|---|---|
| Queue wait ÷ service time | 1 | 4 | 9 | 19 | 99 |

Going from 50% to 90% busy multiplies queueing delay by nine; the last 10% of utilisation costs more than the first 90%. Latency graphs that bend upward as traffic grows are showing you that curve, and it is why capacity plans target 50–70% utilisation at peak rather than 95%.

## Little's law: from latency to concurrency

The most useful equation for sizing anything with a queue:

$$L = \lambda W$$

The number of items in the system ($L$) equals the arrival rate ($\lambda$) times the mean time each spends there ($W$). It holds for any stable system regardless of distribution.

A service handling 1,000 requests per second with a mean latency of 200 ms has $1{,}000 \times 0.2 = 200$ requests in flight at any moment. That number sizes the thread pool, the connection pool to the next hop, the number of file descriptors, and the memory for in-progress request state. If latency doubles because a downstream got slow, in-flight doubles to 400 and a pool sized for 200 starts queueing, which adds latency, which increases in-flight further. Most cascading failures are Little's law running in the wrong direction.

Turn it around to answer "how many connections do I need to a database at 500 queries per second averaging 40 ms?": $500 \times 0.04 = 20$. Then add headroom for the p99, because a pool sized for the mean is empty exactly when latency spikes.

## Numbers to carry in your head

Round these aggressively; they are for reasoning, not for reports.

| Operation | Order of magnitude |
|---|---|
| L1 cache reference | 1 ns |
| Main memory reference | 100 ns |
| SSD random read | 100 µs |
| Round trip within a data centre | 0.5 ms |
| Round trip within a region (across availability zones; AWS keeps them within 100 km) | 1–2 ms |
| Round trip across a continent (US east to west) | 60–70 ms |
| Round trip transatlantic | 70–90 ms |
| Round trip US to east Asia | 150–200 ms |
| Transmit 1 MB at 1 Gbit/s | 8 ms |
| Transmit 1 MB at 10 Mbit/s | 800 ms |

The ratios matter more than the values. A single 70 ms cross-region round trip costs the same as 700,000 main-memory references or 140 same-DC round trips, which is why the first design question about any cross-region call is whether it can be made asynchronous. The method that uses these numbers is developed in [Back-of-envelope estimation](/learn/system-design/building-blocks/back-of-envelope-estimation).

## Back-of-envelope: moving 10 TB between regions

A team plans to copy 10 TB between two regions over a 10 Gbit/s link with a 70 ms RTT, using one TCP stream.

1. **Link limit.** 10 Gbit/s is 1.25 GB/s, so 10 TB needs 8,000 s, about 2.2 hours, if the link is the bottleneck.
2. **Window needed.** BDP = 1.25 GB/s × 0.07 s ≈ 87.5 MB in flight.
3. **Window available.** The receive buffer is capped by `tcp_rmem`'s maximum; on the lab machine that is 33,554,432 bytes (32 MiB), and the advertised window is a fraction of the buffer (59% in the measurement above), so about 20 MB.
4. **Single-stream ceiling.** 20 MB / 0.07 s ≈ 285 MB/s ≈ 2.3 Gbit/s. 10 TB at 285 MB/s is about 35,000 s, close to 10 hours.
5. **Decision.** Five parallel streams, or raising `tcp_rmem`'s maximum above the BDP on both ends, gets back to the 2.2-hour link limit. Loss changes the answer again: CUBIC's window collapses on each loss and regrows over many RTTs at 70 ms each, which is why bulk transfer tools run many streams and why BBR is popular for this job.

Each step is one multiplication, and the answer (10 hours, not 2) comes from the window, not the link.

## A worked budget

A user in Sydney loads a dashboard served from Virginia: cold cache, 200 ms RTT, 600 KB response.

```text
DNS (resolver miss to authoritative in Virginia)   1 RTT   200 ms
TCP handshake                                      1 RTT   200 ms
TLS 1.3                                            1 RTT   200 ms
HTTP request, first byte                           1 RTT   200 ms   (server time 20 ms is inside this)
Slow start to deliver 600 KB (flights 1–6 = 912 KB) 5 more 1000 ms   (first flight arrived with the first byte)
Total to last byte                                        ~1.8 s
```

Now the same request with a CDN edge in Sydney at 10 ms RTT, holding the object in cache:

```text
DNS (cached at resolver)                                   ~0
TCP + TLS to edge                                  2 RTT   20 ms
HTTP first byte from cache                         1 RTT   10 ms
Slow start at 10 ms RTT                            5 more  50 ms
Total                                                     ~80 ms
```

Same bytes, same server code, twenty times faster. It is the same arithmetic behind Netflix placing its Open Connect caches inside ISPs' networks: the bytes of a video start one short round trip from the viewer instead of an ocean away. The lab adds one caveat: a fresh receiver's 64 KB initial window can add one more RTT to the slow-start line (200 ms from Virginia, 10 ms from the edge). When you can produce that table in a design review, you have the argument for a CDN, for connection reuse, for HTTP/3, or against a synchronous cross-region call, in units the whole room accepts.

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Window-limited transfer | A cross-region copy runs at a fraction of link speed with zero loss | `ss -ti` shows `rwnd_limited` near 100% and a small `snd_wnd`; throughput ≈ window / RTT | Remove explicit `SO_RCVBUF` settings; raise `tcp_rmem` and `net.core.rmem_max` above the BDP; parallel streams |
| Slow start after idle | The first request after a quiet gap is several RTTs slower than the rest | `cwnd` in `ss -ti` drops after idle; latency correlates with the gap before the request (measured: 4 RTTs versus 1) | `tcp_slow_start_after_idle=0` on servers with long-lived connections; keep connections warm |
| Fan-out tail | A page's p99 is far above every backend's p99 | Compute $1 - p^n$; compare page p50 with backend p99 | Reduce fan-out, hedge at a high percentile, return partial results at a deadline |
| Bufferbloat | RTT climbs under load (measured 50 → 229 ms) and interactive traffic suffers during bulk transfers | `rtt` far above `minrtt` in `ss -ti`; ping under load | `fq_codel` or another AQM, BBR, pacing, smaller buffers |
| Pool exhaustion from latency | Pool wait time spikes when a downstream slows, then errors cascade | Little's law: rate × latency exceeds pool size | Size pools from the p99, propagate deadlines, adaptive concurrency limits |
| Chatty cross-region protocol | An endpoint takes N × 70 ms after a service moved region | Trace shows N sequential spans, each about one RTT | Batch, parallelise, or move the data next to the caller |

## Choosing where to cut

| Technique | Attacks | Typical saving | Cost or risk |
|---|---|---|---|
| CDN or edge | RTT itself | Every round trip, times the RTT ratio | Cache invalidation, cost, stale data |
| Connection reuse | Handshake RTTs and slow start | 2–3 RTTs per request, plus slow-start flights | Pool sizing, idle-timeout races |
| TLS 1.3, HTTP/3 0-RTT | Handshake RTTs | 1–2 RTTs on new connections | 0-RTT data can be replayed: idempotent requests only |
| Larger windows (`tcp_rmem`) | Window / RTT ceiling | Up to link rate on long fat paths | Memory per connection |
| Hedging at p95 | Tail latency | p99 several times lower when slowness is per-replica | About 5% more load; needs idempotency |
| Lower fan-out | Tail amplification | Page tail approaches backend tail | Denormalisation, bigger responses |

## Interviewer follow-ups

**"A transfer between two data centres runs at 12 Mbit/s on a 10 Gbit/s link with no loss. What do you check?"** Model answer: compute window / RTT; if it matches, read `ss -ti` for `rwnd_limited` and `snd_wnd`, then look for an explicit `SO_RCVBUF`, a low `tcp_rmem` maximum or a stripped window-scale option. Common wrong answer: "the link is congested", which a zero-loss, flat-RTT connection rules out.

**"Why does 1 MB take seven RTTs on a new connection and one on an old one?"** Model answer: slow start from 10 segments doubles per RTT (14.5 KB, 29 KB, ... ) and passes 1 MB in the seventh flight; a warm connection has already grown `cwnd` past 690 segments, unless it idled longer than an RTO and the kernel restarted the window. Common wrong answer: "the old connection skips the handshake", which saves one RTT, not six.

**"A page calls 100 backends. What must be true of each to keep the page's p99 at 50 ms?"** Model answer: each must be under 50 ms with probability $0.99^{1/100} ≈ 0.9999$, so its p99.99 must be 50 ms; otherwise cut fan-out, hedge, or return partial results. Common wrong answer: "each backend's p99 under 50 ms."

**"Your pool has 50 connections, traffic is 1,000 rps and latency is 30 ms. Is that enough?"** Model answer: Little's law gives 30 in flight at the mean, but a spike to 100 ms latency needs 100, so the pool saturates exactly when latency rises; size from the p99 and add a deadline so waits cannot grow unbounded. Common wrong answer: "yes, 30 < 50."

## What mid-level engineers get wrong

- **Buying bandwidth for a latency problem.** A 2 KB request is 99% propagation; a faster link changes nothing.
- **Setting `SO_RCVBUF` to "optimise".** It fixes the buffer and switches off autotuning; the measured 64 KB setting capped a 100 Mbit/s path at 12 Mbit/s.
- **Quoting a single backend's p99 as the page's p99.** With 100 backends the simulated page's median was slower than a single backend's p99.
- **Benchmarking on warm connections only.** Real users arrive cold, and the first megabyte costs 7–8 RTTs, not one.
- **Running servers at 90% utilisation to save money.** Queueing delay at 90% is nine times the service time.
- **Sizing pools from the mean latency.** They run dry precisely when a dependency slows down.

## Exercise: counting slow-start round trips

```exercise
id: slow-start-rounds
title: How many round trips does slow start need?
prompt: |
  A sender starts with a congestion window of `initcwnd` segments and doubles
  it after every round trip, but the window can never exceed `max_cwnd`
  segments (the receiver's window, or the bandwidth-delay product). There is
  no loss. Each segment carries at most `mss` bytes.

  Return the number of round trips (flights) needed to deliver `nbytes`.
  The first flight is limited by `min(initcwnd, max_cwnd)`. Delivering
  0 bytes takes 0 round trips.

  Example: 1,000,000 bytes at MSS 1,448 is 691 segments; flights of 10, 20,
  40, 80, 160 and 320 carry 630, so the seventh flight finishes it: 7.
languages: [python, javascript]
entry: slow_start_rounds
starter:
  python: |
    def slow_start_rounds(nbytes, mss, initcwnd, max_cwnd):
        # your code here
        return 0
  javascript: |
    function slow_start_rounds(nbytes, mss, initcwnd, max_cwnd) {
      // your code here
      return 0;
    }
tests:
  - args: [1000000, 1448, 10, 1000000]
    expected: 7
    label: 1 MB on a fresh connection
  - args: [14480, 1448, 10, 1000000]
    expected: 1
    label: fits the initial window exactly
  - args: [14481, 1448, 10, 1000000]
    expected: 2
    label: one byte more costs a whole round trip
  - args: [0, 1448, 10, 1000000]
    expected: 0
    label: nothing to send
  - args: [1000000, 1448, 10, 45]
    expected: 17
    label: capped by a 64 KB receive window
  - args: [100000, 1460, 4, 1000]
    expected: 5
    hidden: true
  - args: [20000, 1000, 10, 4]
    expected: 5
    hidden: true
    label: cap below the initial window
  - args: [100000000, 1448, 10, 432]
    expected: 165
    hidden: true
hints:
  - "Convert bytes to segments first, rounding up: `-(-nbytes // mss)` in Python, `Math.ceil(nbytes / mss)` in JavaScript."
  - "Loop: add the current window to the segments sent, count the flight, then set `cwnd = min(2 * cwnd, max_cwnd)`."
  - "Start from `min(initcwnd, max_cwnd)`, not `initcwnd`."
```

## Senior signals

- You quote latency in **round trips first** and milliseconds second, know a cold HTTPS request is 4 RTTs and a warm one is 1, and measure RTT with the protocol you use.
- You can say whether a transfer is **serialisation- or propagation-bound** and therefore whether bandwidth or distance is the lever.
- You compute the **bandwidth-delay product**, recognise a window-limited transfer (`throughput ≈ window / RTT`, `rwnd_limited` in `ss -ti`) and know that setting `SO_RCVBUF` switches off autotuning.
- You know **slow start** needs about 7 RTTs for 1 MB from a 10-segment initial window, that a fresh receiver's 64 KB window can add one more, and that an idle connection restarts its window unless `tcp_slow_start_after_idle=0`.
- You do the **fan-out math** both ways ($p^n$, and the per-backend percentile $0.99^{1/n}$) before promising a p99, and reach for hedging at a high percentile only for idempotent calls.
- You use **Little's law** and the $\rho / (1 - \rho)$ curve to size pools and utilisation targets, and you can carry a back-of-envelope estimate from link rate to window to hours.

## Check yourself

```quiz
- q: >-
    A single TCP connection between two data centres with a 100 ms RTT is transferring at 5 Mbit/s on a 10 Gbit/s link with zero packet loss. What is the most likely limiting factor?
  options: ["Propagation delay of the fibre", "The receive window is capped at 64 KB", "The link is saturated by other traffic", "The application is CPU-bound"]
  answer: 1
  explanation: >-
    64 KB / 0.1 s = 640 KB/s, about 5 Mbit/s, exactly the observed rate. Zero loss rules out congestion; propagation sets the RTT but not the throughput ceiling for a given window. Check snd_wnd and rwnd_limited in ss -ti, and the window-scale option in a capture.
- q: >-
    A page fans out to 100 backends in parallel and must meet its p99 latency target. At which percentile must each backend meet that same latency?
  options: ["At its p99.99", "At its p99.9", "At its p99.999", "At its p99"]
  answer: 0
  explanation: >-
    The page is fast only if all 100 calls are fast, so each must be fast with probability 0.99 to the power 1/100, about 0.9999: the p99.99. Holding each backend's p99 at the target leaves only 0.99^100, about 37%, of pages fast. The lesson's simulation confirmed it: the page p99 landed at a single backend's p99.99.
- q: >-
    Your API handles 2,000 requests per second with a mean latency of 50 ms. A downstream slowdown pushes mean latency to 250 ms. How many requests are in flight afterwards?
  options: ["2,000", "500", "100", "250"]
  answer: 1
  explanation: >-
    Little's law: L = λW = 2,000 × 0.25 = 500, up from 100. Any pool or thread limit sized for the old number now queues, adding more latency.
- q: >-
    You move a 1 MB API response from a cold connection to a pooled, warm connection over the same 70 ms path. Which saving is largest?
  options: ["Skipping slow start, since cwnd has grown", "Removing the DNS lookup from the request", "Lower transmission delay for the 1 MB body", "Skipping the TCP and TLS handshakes (2 RTTs)"]
  answer: 0
  explanation: >-
    Handshakes save 2 RTTs (140 ms). A grown congestion window delivers the megabyte in one or two RTTs instead of seven, saving around 5 RTTs (350 ms), as the lab measured. DNS is at most one RTT, and transmission delay is the same either way.
- q: >-
    On a 50 ms path, a 1 MB response on a long-lived connection took 1 RTT when requested back to back, but 4 RTTs after the connection sat idle for 1 s. What explains the difference?
  options: ["The receive window shrinks back to 64 KB when idle", "An idle connection must repeat its TCP handshake", "The kernel halves cwnd for each RTO of idle time", "Nagle's algorithm holds the first segment after idle"]
  answer: 2
  explanation: >-
    With tcp_slow_start_after_idle=1, Linux restarts the congestion window after an idle period longer than the RTO, halving cwnd once per RTO elapsed, so the transfer slow-starts again. With the sysctl set to 0 the same idle case took 1 RTT. The receive window and the handshake are unaffected by idleness, and Nagle does not delay full-sized segments.
- q: >-
    ss -ti on a slow bulk sender shows cwnd:108, snd_wnd:76896 and rwnd_limited:4836ms(97.0%). What limits its throughput?
  options: ["Packet loss along the path", "The receiver's advertised window", "The sending application's writes", "The sender's congestion window"]
  answer: 1
  explanation: >-
    snd_wnd is the window the receiver advertised, about 75 KB, while cwnd would allow 108 segments, about 156 KB, and rwnd_limited says the sender spent 97% of its busy time blocked by the receive window. Fix the receiver's buffer or its application's reads. An application-limited sender shows app_limited, and loss would show retransmissions and a shrinking cwnd.
```
