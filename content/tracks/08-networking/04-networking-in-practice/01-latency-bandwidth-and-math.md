---
slug: latency-bandwidth-and-math
title: "Latency, bandwidth and the math of a round trip"
description: "Where the milliseconds in a request actually go: propagation, RTT budgets, bandwidth-delay product, slow start, tail latency and Little's law, with the numbers worked."
minutes: 30
difficulty: medium
tags: [latency, bandwidth, rtt, bandwidth-delay-product, tail-latency, littles-law, estimation]
problems: []
---
A product manager asks why the page takes 400 ms to show anything when "the API responds in 20 ms". Both numbers are true. The gap is not mystery overhead; it is a fixed number of round trips multiplied by a fixed distance, plus a transport that deliberately starts slow. If you can decompose that 400 ms on a whiteboard, you can say which parts are physics, which parts are protocol, and which parts you are allowed to remove.

This lesson is the arithmetic. Everything else in the module (timeouts, pools, debugging) is applying it.

## Four sources of delay

Every packet pays four kinds of delay at every hop. Only one of them is "the network being slow".

| Component | What it is | Typical size |
|---|---|---|
| Propagation | Time for the signal to travel the distance | ~5 µs per km of fibre |
| Transmission | Time to push the bits onto the link, `size / bandwidth` | 12 µs for a 1,500-byte frame at 1 Gbit/s |
| Queueing | Time waiting in a router or NIC buffer behind other packets | 0 to tens of ms; the variable one |
| Processing | Header parsing, lookup, checksum | Microseconds per hop |

Light in vacuum moves at about 300,000 km/s. In glass fibre the refractive index is around 1.47, so light travels at roughly 200,000 km/s, which is 5 µs per kilometre. That number is the most useful constant in networking because nothing you do in software changes it.

New York to London is about 5,600 km on a great circle. At 5 µs/km that is 28 ms one way and 56 ms for a round trip. Real fibre does not follow the great circle, amplifiers and switches add a little, and measured RTTs come out at 65–75 ms. When someone quotes "70 ms transatlantic RTT", that is 80% speed of light and 20% route inefficiency, and there is nothing to optimise on either side except moving the endpoints.

Transmission delay is the part that bandwidth governs. A 1,500-byte packet is 12,000 bits; at 1 Gbit/s it takes 12 µs to serialise, at 10 Mbit/s it takes 1.2 ms. This is why bandwidth matters for big transfers and barely matters for small requests: a 2 KB API call on a 100 Mbit/s home connection spends 160 µs being transmitted and 70,000 µs crossing the ocean.

Queueing delay is the one that varies. When a link is near saturation, packets wait behind each other in buffers, and buffers on consumer routers can hold hundreds of milliseconds of traffic (the bufferbloat problem covered in [Congestion control](/learn/networking/fundamentals/congestion-control)). A latency graph that is flat at 70 ms with spikes to 300 ms is telling you about queueing, not distance.

## Round trips, not bytes

For short requests, what dominates is not how many bytes move but how many times a packet has to cross the distance and come back before useful data flows. Count the round trips for a cold HTTPS request to a server 70 ms away:

| Step | Round trips | Cumulative at 70 ms RTT |
|---|---|---|
| DNS lookup (recursive resolver, cache miss) | 1 | 70 ms |
| TCP three-way handshake | 1 | 140 ms |
| TLS 1.3 handshake | 1 | 210 ms |
| HTTP request and first byte of response | 1 | 280 ms |

The server's "20 ms response time" starts at 210 ms and ends at 230 ms; the client sees the first byte at about 280 ms. Nothing was slow. The request simply cost four round trips, and at 70 ms each that is 280 ms of floor that no amount of backend optimisation touches.

```viz
{"type": "network", "scenario": "tcp-handshake", "title": "One RTT before any data", "caption": "SYN, SYN-ACK, ACK: the client can send data with the third packet, but the server's first byte cannot arrive before one full RTT has elapsed."}
```

```viz
{"type": "network", "scenario": "https-tls-handshake", "title": "TLS 1.3 adds exactly one more round trip", "caption": "ClientHello carries the key share, so the server can respond with everything needed in one flight. TLS 1.2 needed two."}
```

Now do the same request over a warm connection: DNS is cached, the TCP connection is pooled and the TLS session is established. The cost is one round trip, 70 ms, and the first byte arrives at about 90 ms. That is the entire argument for keep-alive and connection pooling in [Connection pooling and keep-alive](/learn/networking/networking-in-practice/connection-pooling-and-keep-alive): it removes three of the four round trips.

The senior habit is to state latency as round trips first and convert to milliseconds second. "This flow costs 3 RTTs" is a fact about the protocol; "this flow costs 210 ms" depends on where the user is sitting.

## Bandwidth-delay product

Once data flows, a second limit appears. TCP only lets a sender have a bounded number of unacknowledged bytes in flight. If that bound is smaller than the amount of data the pipe can hold, the sender stops and waits for ACKs and the link sits idle.

The amount of data the pipe holds is the **bandwidth-delay product**:

$$\text{BDP} = \text{bandwidth} \times \text{RTT}$$

For a 1 Gbit/s link with a 70 ms RTT:

$$10^9 \text{ bit/s} \times 0.07 \text{ s} = 7 \times 10^7 \text{ bits} = 8.75 \text{ MB}$$

To keep that link full, the sender needs 8.75 MB in flight before the first ACK returns. The original TCP window field is 16 bits, so it maxes out at 65,535 bytes. Without window scaling, the best a single connection can do is:

$$\frac{65{,}535 \text{ bytes}}{0.07 \text{ s}} \approx 936 \text{ KB/s} \approx 7.5 \text{ Mbit/s}$$

That is 0.75% of the link. Every modern stack negotiates the window-scale option in the SYN, but the same ceiling reappears whenever something caps the window: a receiver with a small socket buffer (`net.ipv4.tcp_rmem`), a middlebox that strips the option, or an application that reads slowly and lets the receive window fill. When a transfer between two data centres runs at a fraction of the link speed with no packet loss, compute the BDP and compare it to the window the receiver is advertising in the capture.

Rearranged, the same formula gives the throughput ceiling for any window:

$$\text{throughput} \le \frac{\text{window}}{\text{RTT}}$$

Halve the RTT and you double the ceiling for free, which is why a CDN edge 10 ms from the user can serve a large file many times faster than an origin 150 ms away, on identical links.

## Slow start is a latency cost

A new TCP connection does not begin at the BDP. It begins with an initial congestion window (`initcwnd`) of 10 segments in modern Linux, about 14.6 KB with a 1,460-byte MSS, and doubles every RTT until it sees loss or reaches a threshold.

```viz
{"type": "network", "scenario": "congestion-slow-start", "loss": 0, "title": "cwnd doubling per RTT", "caption": "Each RTT the sender may have twice as many segments in flight. Small objects finish while the window is still tiny."}
```

Trace a 1 MB download on a fresh connection, ignoring the handshake:

| RTT | cwnd | Bytes sent this RTT | Cumulative |
|---|---|---|---|
| 1 | 10 segments | 14.6 KB | 14.6 KB |
| 2 | 20 | 29.2 KB | 43.8 KB |
| 3 | 40 | 58.4 KB | 102 KB |
| 4 | 80 | 117 KB | 219 KB |
| 5 | 160 | 234 KB | 453 KB |
| 6 | 320 | 467 KB | 920 KB |
| 7 | 640 | 934 KB | 1.85 MB |

The megabyte completes during the seventh RTT. At 70 ms per RTT that is about 490 ms of transfer time, on top of the 210 ms of handshakes, for an object that a 1 Gbit/s link could serialise in 8 ms. The link was not the bottleneck at any point; the protocol's caution was.

Two consequences you can act on. First, a small response (under ~14 KB) fits in the initial window and completes in one RTT; the first 14 KB of an HTML page is worth more than the next 100 KB, which is why critical CSS is inlined. Second, a reused connection has already grown its window, so the same 1 MB over a warm keep-alive connection can finish in one or two RTTs. Slow start restarts after idle periods unless `tcp_slow_start_after_idle` is disabled, which is a common tuning on servers that hold long-lived connections.

## Tail latency and fan-out

Averages describe throughput. Users experience percentiles. A service whose median is 20 ms and whose p99 is 300 ms is a service where one request in a hundred takes fifteen times longer, and at 1,000 requests per second that is ten users per second having a bad time.

Fan-out makes tails much worse. Suppose a page assembles its response from 100 backend calls in parallel, each with an independent 1% chance of taking over 100 ms. The probability that all 100 come back fast is:

$$0.99^{100} \approx 0.37$$

So 63% of page loads wait on at least one slow backend. The p99 of a single dependency has become roughly the p37 of the page. With 1,000 backends the figure is $0.99^{1000} \approx 0.00004$; effectively every request hits a tail.

This is why large fan-out systems spend so much effort on the tail of each dependency and on **hedged requests**: send the request, and if no reply arrives within the dependency's p95, send a second copy to another replica and take whichever answers first. Hedging at the p95 adds 5% extra load and cuts the tail dramatically; hedging at the median doubles load. The technique only works when the backend call is idempotent, which links it to [Timeouts, retries and backoff](/learn/networking/networking-in-practice/timeouts-retries-and-backoff).

Two quieter contributors to tails: garbage collection pauses on any hop, and queueing when a server runs near saturation. A server at 90% utilisation has roughly ten times the queueing delay of one at 50% (for an M/M/1 queue, mean wait scales with $\rho / (1 - \rho)$). Latency graphs that bend upward as traffic grows are showing you that curve.

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
| Round trip within a region (across availability zones) | 1–2 ms |
| Round trip across a continent (US east to west) | 60–70 ms |
| Round trip transatlantic | 70–90 ms |
| Round trip US to east Asia | 150–200 ms |
| Transmit 1 MB at 1 Gbit/s | 8 ms |
| Transmit 1 MB at 10 Mbit/s | 800 ms |

The ratios matter more than the values. A single cross-region round trip costs the same as 700 memory-bound cache lookups or 140 same-DC round trips, which is why the first design question about any cross-region call is whether it can be made asynchronous. The estimation method that uses these numbers is developed in [Back-of-envelope estimation](/learn/system-design/building-blocks/back-of-envelope-estimation).

## A worked budget

Put it together for a real request: a user in Sydney loads a dashboard served from Virginia, cold cache, 200 ms RTT, response 600 KB.

```text
DNS (resolver miss to authoritative in Virginia)   1 RTT   200 ms
TCP handshake                                      1 RTT   200 ms
TLS 1.3                                            1 RTT   200 ms
HTTP request, first byte                           1 RTT   200 ms   (server time 20 ms is inside this)
Slow start to deliver 600 KB (RTTs 1–6 = 920 KB)   5 more  1000 ms
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

Same bytes, same server code, twenty times faster. Every line item is a round trip count times a distance. When you can produce that table in a design review, you have the argument for a CDN, for connection reuse, for HTTP/2 or HTTP/3, or against a synchronous cross-region call, in units the whole room accepts.

## Senior signals

- You quote latency in **round trips first** and milliseconds second, and you know a cold HTTPS request is 4 RTTs and a warm one is 1.
- You can compute the **bandwidth-delay product** for a link and recognise a window-limited transfer in a capture instead of blaming "the network".
- You know **slow start** means a fresh connection needs roughly 7 RTTs to move 1 MB, and that the first 14 KB of a response is special.
- You do the **fan-out tail math** ($0.99^{100} \approx 0.37$) before promising a p99, and you know hedged requests only work on idempotent calls.
- You use **Little's law** to size pools and to explain why a downstream slowdown turns into your own saturation.
- You keep the **latency numbers table** in your head and reason in ratios: one cross-region RTT is worth a hundred in-DC ones.

## Check yourself

```quiz
- q: >-
    A single TCP connection between two data centres with a 100 ms RTT is transferring at 5 Mbit/s on a 10 Gbit/s link with zero packet loss. The most likely limiting factor is:
  options: ["The link is saturated by other traffic", "The receive window is capped at 64 KB", "Propagation delay of the fibre", "The application is CPU-bound"]
  answer: 1
  explanation: >-
    64 KB / 0.1 s = 640 KB/s ≈ 5 Mbit/s, exactly the observed rate. Zero loss rules out congestion; propagation sets the RTT but not the throughput ceiling for a given window. Check the advertised window and window scaling in the capture.
- q: >-
    A page fans out to 50 backends in parallel; each has a 2% chance of exceeding 200 ms. Roughly what fraction of page loads take over 200 ms?
  options: ["About 64%", "About 2%", "About 100%", "About 36%"]
  answer: 0
  explanation: >-
    P(all fast) = 0.98^50 ≈ 0.36, so about 64% of pages wait on at least one slow backend. The tail of the whole is far worse than the tail of any part, which is what motivates hedged requests.
- q: >-
    Your API handles 2,000 requests per second with a mean latency of 50 ms. A downstream slowdown pushes mean latency to 250 ms. How many requests are in flight afterwards?
  options: ["250", "2,000", "100", "500"]
  answer: 3
  explanation: >-
    Little's law: L = λW = 2,000 × 0.25 = 500, up from 100. Any pool or thread limit sized for the old number now queues, adding more latency.
- q: >-
    You move a 1 MB API response from a cold connection to a pooled, warm connection over the same 70 ms path. Which saving is largest?
  options: ["Skipping slow start, since cwnd has grown", "Skipping the TCP and TLS handshakes (2 RTTs)", "Removing the DNS lookup from the request", "Lower transmission delay for the 1 MB body"]
  answer: 0
  explanation: >-
    Handshakes save 2 RTTs (140 ms). A grown congestion window can deliver the megabyte in one or two RTTs instead of seven, saving around 5 RTTs (350 ms). DNS is at most one RTT, and transmission delay is 8 ms either way.
- q: >-
    Which of these is unaffected by moving your servers closer to users?
  options: ["Serialising a 1,500-byte packet at 1 Gbit/s", "Propagation delay on the path to users", "The wall-clock duration of slow start", "The cost in milliseconds of each handshake round trip"]
  answer: 0
  explanation: >-
    Transmission delay depends only on size and link bandwidth. Everything measured in round trips shrinks with distance, which is why proximity helps handshakes and slow start but not raw serialisation.
```
