---
slug: congestion-control
title: "Congestion control: slow start, AIMD, Cubic, BBR and bufferbloat"
description: How a TCP sender guesses a bottleneck it cannot see, why AIMD converges to fairness, why Reno cannot fill a fast long path and Cubic can, what BBR models instead of loss, and how to read bufferbloat and congestion in latency graphs.
minutes: 34
difficulty: hard
tags: [networking, tcp, congestion-control, slow-start, aimd, cubic, bbr, bufferbloat]
problems: []
---
A video call on home Wi-Fi is perfect until someone in the house starts a cloud photo backup. Within seconds, `ping` to the nearest server climbs from 20 ms to 600 ms, the call freezes, and the backup itself runs at full upload speed without complaint. Nothing is broken. The backup's TCP connection is doing exactly what loss-based congestion control is designed to do: send faster until a buffer somewhere overflows. The buffer is in the home router, it holds over half a second of traffic, and every other flow on the link now waits behind it.

The same design explains the opposite complaint. A replication job between two data centres 100 ms apart has a 10 Gbit/s link and moves about 20 Mbit/s per connection, and the only thing wrong with the path is a loss rate of one packet in ten thousand. One sender is too aggressive for its buffer; the other is too timid for its pipe. Both are congestion control, and a senior engineer is expected to recognise each from a graph.

## The sender has to guess

No router tells a TCP sender how fast it may go. The bottleneck might be a 5 Mbit/s uplink, a congested peering link, or a Wi-Fi hop, and it changes as other flows come and go. The sender keeps a **congestion window** (`cwnd`): its own estimate of how many bytes the path can hold in flight. The receiver's advertised window (from [TCP deep dive](/learn/networking/fundamentals/tcp-deep-dive)) protects the receiver; `cwnd` protects the network. The sender obeys the smaller of the two.

This was not in the original TCP. In October 1986 the early internet suffered the first of a series of **congestion collapses**: throughput between two sites a few hundred metres apart dropped by a factor of about a thousand, because senders retransmitted into queues that were already full, which filled them further. Van Jacobson's fix (1988) is still the skeleton of every algorithm in this lesson: treat loss as a signal of congestion, start cautiously, probe upwards, and back off hard when the signal arrives. ACKs returning at the bottleneck's rate "clock out" new packets at that rate, so a sender in equilibrium only injects a packet when one has left the network.

Congestion control runs entirely on the **sender**. Your server's algorithm decides how fast downloads go; the client's decides uploads. That asymmetry is why a CDN can change its algorithm and improve delivery to every user with no client update.

## Slow start: exponential probing

A new connection does not know the path, so it starts with an initial window (`initcwnd`) of 10 segments, about 14.6 KB, on any stack from the last decade. For every ACK that acknowledges new data, `cwnd` grows by one segment. A full window of ACKs therefore doubles `cwnd`: 10, 20, 40, 80 segments per RTT. "Slow" start is exponential; the name contrasts it with the older behaviour of sending a whole receive window at once.

```viz
{"type": "network", "scenario": "congestion-slow-start", "loss": 0, "title": "Slow start without loss", "caption": "cwnd doubles each RTT until it reaches ssthresh, then grows by one segment per RTT. The viz starts from 1 segment for readability; real stacks start at 10."}
```

Slow start ends in one of three ways: a loss, `cwnd` reaching the slow-start threshold (`ssthresh`, effectively infinite on a fresh connection), or a delay signal. Linux's Cubic uses **HyStart**, which exits slow start when the RTT of the ACK train starts to rise, because rising RTT means a queue is forming and the next doubling would overshoot.

How long does slow start take to fill a fast path? A 1 Gbit/s path with a 70 ms RTT has a bandwidth-delay product of 8.75 MB, about 6,000 segments of 1,460 bytes. Starting at 10 and doubling:

$$10 \times 2^{n} \ge 6{,}000 \implies n = \lceil \log_2 600 \rceil = 10 \text{ RTTs} = 700 \text{ ms}$$

and during those ten RTTs the sender moves $10 \times (2^{10} - 1) = 10{,}230$ segments, about 15 MB. Any transfer smaller than 15 MB on this path finishes before the connection has ever run at link speed. That covers almost every API response and web page, which is why for most traffic the number of RTTs matters and the link speed does not. [Latency, bandwidth and the math of a round trip](/learn/networking/networking-in-practice/latency-bandwidth-and-math) traces a 1 MB download through the same doubling.

Two consequences you act on. Reusing a warm connection skips slow start, provided the kernel is told not to reset it: Linux drops `cwnd` back towards the initial window after an idle period of about one RTO unless `net.ipv4.tcp_slow_start_after_idle=0`, a standard setting on servers holding long-lived keep-alive connections. And the last doubling of slow start can overshoot the path's capacity by up to a factor of two, producing a burst of losses right at the end of the ramp; HyStart and pacing exist to soften that.

## Congestion avoidance: AIMD

After slow start, the classic algorithm (Reno, and NewReno) switches to **additive increase, multiplicative decrease**:

- **Additive increase:** each RTT without loss, `cwnd` grows by one segment.
- **Multiplicative decrease:** on a loss detected by three duplicate ACKs, `ssthresh = cwnd / 2` and `cwnd = ssthresh` (fast recovery), then additive increase resumes.
- **Timeout:** if the retransmission timer fires, the sender assumes the path has changed badly: `ssthresh = cwnd / 2`, `cwnd = 1`, and slow start begins again.

```viz
{"type": "network", "scenario": "congestion-slow-start", "loss": 1, "title": "Slow start, a loss, then the AIMD sawtooth", "caption": "At the loss, ssthresh becomes half the window and cwnd drops to it; growth then continues at one segment per RTT. A retransmission timeout would have dropped cwnd to 1 instead."}
```

The result is the famous sawtooth: a linear ramp to the point of loss, a halving, another ramp. The period of the sawtooth tells you a lot. From a halved window of W/2, climbing back to W takes W/2 RTTs, so a flow with a 100-segment window and a 50 ms RTT loses a packet roughly every 2.5 seconds.

### Why AIMD is fair

AIMD is not arbitrary. It is the simplest rule that makes competing flows converge to equal shares. Take two flows sharing a 100-segment bottleneck, starting unfairly at 80 and 20 and seeing losses at the same time:

| Event | Flow A | Flow B | Gap |
|---|---|---|---|
| Start | 80 | 20 | 60 |
| Both add 1, total passes 100, both halve | 40.5 | 10.5 | 30 |
| 25 RTTs of +1 each, loss, both halve | 32.75 | 17.75 | 15 |
| 25 RTTs of +1 each, loss, both halve | 28.9 | 21.4 | 7.5 |

Additive increase preserves the gap; multiplicative decrease halves it. Repeat and the flows converge on equal shares whatever their starting point. Additive decrease would never shrink the gap; multiplicative increase would widen it. This is the argument senior interviewers are fishing for when they ask "why halve the window instead of subtracting a constant".

```exercise
id: reno-cwnd-rounds
title: Simulate slow start and AIMD round by round
prompt: |
  Simulate a Reno sender one RTT ("round") at a time. `events` is a string
  with one character per round:

  - `.` every segment of the round was acknowledged
  - `D` a loss was detected by three duplicate ACKs during the round
  - `T` the retransmission timer expired during the round

  Return the list of `cwnd` values (in segments) at the **start** of each
  round. After recording a round's cwnd, apply its event:

  - `.`: if `cwnd < ssthresh`, slow start: `cwnd = min(2 * cwnd, ssthresh)`;
    otherwise congestion avoidance: `cwnd = cwnd + 1`.
  - `D`: `ssthresh = max(cwnd // 2, 2)`, then `cwnd = ssthresh`.
  - `T`: `ssthresh = max(cwnd // 2, 2)`, then `cwnd = 1`.

  Integer division rounds down.
languages: [python, javascript]
entry: reno_cwnd
starter:
  python: |
    def reno_cwnd(initial_cwnd, ssthresh, events):
        cwnd = initial_cwnd
        out = []
        return out
  javascript: |
    function reno_cwnd(initial_cwnd, ssthresh, events) {
      let cwnd = initial_cwnd;
      const out = [];
      return out;
    }
tests:
  - args: [1, 16, "........"]
    expected: [1, 2, 4, 8, 16, 17, 18, 19]
    label: slow start then congestion avoidance
  - args: [10, 64, "......"]
    expected: [10, 20, 40, 64, 65, 66]
    label: doubling is capped at ssthresh
  - args: [1, 16, "....D..."]
    expected: [1, 2, 4, 8, 16, 8, 9, 10]
    label: fast recovery halves the window
  - args: [10, 64, ""]
    expected: []
    label: no rounds
  - args: [1, 64, ".....T...."]
    expected: [1, 2, 4, 8, 16, 32, 1, 2, 4, 8]
    label: a timeout restarts slow start
    hidden: true
  - args: [10, 1000, "..D..D.."]
    expected: [10, 20, 40, 20, 21, 22, 11, 12]
    label: the sawtooth
    hidden: true
  - args: [2, 100, "DD."]
    expected: [2, 2, 2]
    label: ssthresh never drops below 2
    hidden: true
hints:
  - "Append cwnd before applying the round's event."
  - "After a D, cwnd equals ssthresh, so the next clean round is congestion avoidance (+1), not slow start."
```

## Why Reno cannot fill a fast, long path

The sawtooth has a steady-state throughput that depends on the loss rate. The Mathis approximation for a Reno-style flow is:

$$\text{throughput} \approx \frac{\text{MSS}}{\text{RTT}} \cdot \frac{1.22}{\sqrt{p}}$$

where `p` is the packet loss probability. With a 1,460-byte MSS and a 100 ms RTT:

| Loss rate | Throughput ceiling |
|---|---|
| 1% | 1.4 Mbit/s |
| 0.1% | 4.5 Mbit/s |
| 0.01% | 14.2 Mbit/s |

Three things fall out. Throughput is inversely proportional to RTT, so halving the distance (a closer CDN edge) doubles the ceiling. It scales only with the square root of loss, so halving loss buys just 41%. And the loss rate needed for high speed is absurd: RFC 3649 works out that a standard TCP flow at 10 Gbit/s over 100 ms with 1,500-byte packets needs an average window of 83,333 segments and at most one loss every 5 billion packets, about one congestion event every hour and forty minutes. After a single loss, climbing back from 41,667 to 83,333 segments at one segment per RTT takes 41,667 RTTs, about 69 minutes. No real path is that clean. The replication job from the opening, at one loss in ten thousand, sits in the bottom row of the table; Cubic, below, does somewhat better, but still nowhere near 10 Gbit/s.

## Cubic: growth as a function of time

Cubic, the default on Linux since 2006 and on most major stacks today, replaces "add one segment per RTT" with a window that is a cubic function of the time since the last loss:

$$W(t) = C\,(t - K)^3 + W_{\max}, \qquad K = \sqrt[3]{\frac{W_{\max}\,(1-\beta)}{C}}$$

`W_max` is the window at the last loss, `β = 0.7` is the multiplicative decrease (Cubic cuts to 70%, not 50%), and `C = 0.4`. `K` is the time it takes to climb back to `W_max`.

The curve is concave then convex. Right after a loss it grows fast, slows to a near-plateau around `W_max` (where the last loss happened, so probably near capacity), then accelerates again to probe for new bandwidth if no loss occurs. Worked numbers:

- `W_max` = 100 segments: `K` = ∛(100 × 0.3 / 0.4) = ∛75 ≈ 4.2 seconds.
- `W_max` = 83,333 segments (the 10 Gbit/s path): `K` = ∛62,500 ≈ 39.7 seconds, against Reno's 69 minutes.

Because growth depends on wall-clock time rather than RTT count, two Cubic flows with different RTTs grow at similar rates, which is fairer than Reno, where a flow with a 10 ms RTT ramps ten times faster than one with 100 ms. On short-RTT paths, where Reno would actually be quicker, Cubic runs in a "TCP-friendly" region and takes whichever window is larger.

Cubic is still loss-based. It finds the path's capacity by overflowing the bottleneck buffer, and between losses it keeps that buffer as full as it can. Which brings back the home router.

## Bufferbloat: when the buffer is the latency

A router forwards at link rate and queues the excess. A full queue adds a delay equal to its size divided by the link rate:

$$\text{queueing delay} = \frac{\text{buffer bytes} \times 8}{\text{link rate}}$$

A home router with 256 packets of buffer on a 10 Mbit/s uplink: $256 \times 1500 \times 8 / 10^7 \approx 307$ ms. Memory is cheap, so consumer devices, cable modems and cellular base stations have shipped with buffers of hundreds of milliseconds or more. A loss-based sender cannot see a loss until that buffer is full, so a single bulk upload parks a standing queue of several hundred milliseconds in front of every other packet on the link. That is **bufferbloat**, named by Jim Gettys around 2010, and it is why the video call dies when the backup starts.

Measure it with `ping` while a transfer runs:

```text
$ ping 1.1.1.1                          # idle link
64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=18.9 ms
64 bytes from 1.1.1.1: icmp_seq=2 ttl=57 time=19.2 ms
# ... start an upload ...
64 bytes from 1.1.1.1: icmp_seq=9 ttl=57 time=287 ms
64 bytes from 1.1.1.1: icmp_seq=10 ttl=57 time=604 ms
64 bytes from 1.1.1.1: icmp_seq=11 ttl=57 time=598 ms
```

Idle RTT 19 ms is propagation plus processing. The 580 ms extra under load is pure queue. More bandwidth does not fix it; the next faster link gets the same queue, just filled faster. Three fixes do:

- **Active queue management.** CoDel measures how long each packet sat in the queue and starts dropping (or marking) when the minimum sojourn time stays above a 5 ms target for a 100 ms interval. The queue can absorb bursts but cannot stand.
- **Flow queueing.** `fq_codel` gives each flow its own queue and serves them round-robin, so the call's small packets do not wait behind the backup's. It is the default queueing discipline on many Linux distributions, and "smart queue management" on a home router is usually this.
- **ECN.** Instead of dropping, the router sets the Congestion Experienced bits in the IP header; the receiver echoes it (`ECE`), and the sender reduces its window as if a loss had happened, without losing the packet.

The classic buffer-sizing rule for routers is one bandwidth-delay product, divided by the square root of the number of flows when many flows share the link. A buffer much bigger than that adds only delay.

## BBR: model the pipe instead of filling it

Google's BBR (Bottleneck Bandwidth and Round-trip propagation time, published in 2016) drops loss as the primary signal. It continuously estimates the two numbers that define the path:

- **BtlBw**, the bottleneck bandwidth: the maximum delivery rate (bytes acknowledged per unit time) seen over roughly the last ten round trips.
- **RTprop**, the round-trip propagation time: the minimum RTT seen over the last ten seconds.

Their product is the BDP, the amount of data that fills the pipe without building a queue. BBR paces packets at `pacing_gain × BtlBw` and caps inflight at about `2 × BDP`. It cycles through phases:

| Phase | What it does |
|---|---|
| STARTUP | Pacing gain about 2.89: doubles the sending rate each RTT like slow start, and exits when delivery rate stops growing by at least 25% over three rounds |
| DRAIN | Pacing below BtlBw to empty the queue STARTUP created |
| PROBE_BW | Steady state: an eight-phase gain cycle of 1.25, 0.75, then six rounds at 1.0; probe for more bandwidth briefly, then drain what the probe queued |
| PROBE_RTT | If RTprop has not been refreshed in 10 s, cut inflight to 4 packets for at least 200 ms to measure the empty-queue RTT |

Because BBR aims at the BDP instead of the buffer limit, it keeps queues short on bloated paths. Because it does not halve on random loss, it can run near link speed on a long path with 1% loss where Cubic, by the Mathis formula, would crawl. Google has deployed it for google.com and YouTube traffic.

It has costs. The original version ignores loss almost entirely, so on shallow-buffered paths it can sustain high retransmission rates, and its share against Cubic flows depends heavily on buffer depth (it can starve them in shallow buffers and lose to them in deep ones). The PROBE_RTT dip is visible as a periodic throughput drop every ten seconds. It needs accurate pacing, historically supplied by the `fq` queueing discipline. Later versions (BBRv2, BBRv3) add responses to loss and ECN to address the coexistence problems.

| | Reno/NewReno | Cubic | BBR (v1) |
|---|---|---|---|
| Signal | Loss | Loss (plus HyStart delay in slow start) | Delivery rate and min RTT |
| Growth | +1 segment per RTT | Cubic in time since loss | Pace at estimated bandwidth, periodic probes |
| On loss | Halve | Cut to 70% | Largely ignore |
| Queue it keeps | Fills buffer | Fills buffer | About one BDP inflight, short queue |
| Weak spot | Long fat pipes | Bufferbloat, random loss | Shallow buffers, fairness with Cubic |

## Reading congestion off a graph

Most congestion questions arrive as a graph and a complaint. The shapes to recognise:

- **RTT rises with throughput, then snaps down after a loss, repeating.** A loss-based sender filling a buffer. The floor is propagation delay; the height above it is queue. If the height is hundreds of milliseconds, it is bufferbloat.
- **A throughput sawtooth with a regular period.** AIMD or Cubic hitting capacity and backing off. A period of seconds with a low peak means a lossy or small path.
- **Every request's throughput ramps up over its first few RTTs, never reaching link speed.** Short flows living entirely in slow start. Fix with connection reuse, `tcp_slow_start_after_idle=0`, and fewer, larger responses; not with a bigger link.
- **A flat ceiling with zero retransmissions.** Not congestion at all. The window is limited by the receiver or by the application; look at `rwnd` and `SO_RCVBUF`.
- **Flat, low RTT with a dip in throughput every ten seconds.** BBR's PROBE_RTT.
- **Throughput collapses with retransmission timeouts clustered in bursts.** A traffic policer (a token bucket that drops excess, as in [Rate limiting algorithms](/learn/networking/network-algorithms/rate-limiting-algorithms)) or a tail-drop queue killing whole windows. Pacing helps; BBR handles policers better than loss-based algorithms.

`iperf3` prints the sender's view of the same things per second:

```text
[ ID] Interval           Transfer     Bitrate         Retr  Cwnd
[  5]   0.00-1.00   sec  10.9 MBytes  91.2 Mbits/sec    0   1.46 MBytes
[  5]   1.00-2.00   sec  11.2 MBytes  94.4 Mbits/sec   38   1.02 MBytes
[  5]   2.00-3.00   sec  11.2 MBytes  94.1 Mbits/sec    0   1.12 MBytes
[  5]   3.00-4.00   sec  11.1 MBytes  93.3 Mbits/sec   41    806 KBytes
```

`Cwnd` dropping by about 30% whenever `Retr` is non-zero, then climbing again, is Cubic's sawtooth. Now check it against the path: at 94 Mbit/s with a 20 ms base RTT the BDP is only about 235 KB, so of a 0.8 to 1.5 MB window, most is sitting in a queue, roughly 50 to 100 ms of it at this rate. On a live connection, `ss -ti` shows the same fields (`cwnd`, `ssthresh`, `retrans`), and for BBR adds its model: `bbr:(bw:94.7Mbps,mrtt:20.1,pacing_gain:1.25,cwnd_gain:2)`.

The knobs on a Linux sender:

```bash
sysctl net.ipv4.tcp_available_congestion_control   # e.g. reno cubic bbr
sysctl -w net.core.default_qdisc=fq                 # pacing for BBR
sysctl -w net.ipv4.tcp_congestion_control=bbr       # default for new sockets
sysctl -w net.ipv4.tcp_slow_start_after_idle=0      # keep cwnd across idle keep-alives
tc qdisc replace dev eth0 root fq_codel             # AQM on a router or gateway interface
```

Per-socket selection is also possible (`setsockopt(TCP_CONGESTION)`), which is how some services use BBR for long-haul client traffic and Cubic inside the data centre.

## Senior signals

- You say "congestion control is sender-side" and use it: a server or CDN change improves downloads for every client; nothing you do on the server fixes a client's upload.
- You explain AIMD's fairness argument (additive increase preserves the gap, multiplicative decrease halves it) and know that Cubic backs off to 70%, not 50%.
- You can quote the Mathis relationship: throughput proportional to 1/RTT and to 1/√loss, and use it to argue that moving the endpoint closer beats cleaning up the last 0.01% of loss.
- You distinguish propagation from queueing on a latency graph, name bufferbloat, and reach for fq_codel or ECN rather than more bandwidth.
- You know most responses finish inside slow start, so round trips and connection reuse dominate their latency, and you set `tcp_slow_start_after_idle=0` on servers holding keep-alive connections.
- You describe BBR as modelling bandwidth and minimum RTT rather than reacting to loss, and you can name its trade-offs: retransmissions in shallow buffers, fairness against Cubic, the PROBE_RTT dip.

## Check yourself

```quiz
- q: >-
    During a large upload, ping from the same laptop rises from 20 ms to 600 ms, and falls back to 20 ms when the upload finishes. There is almost no packet loss. What is the best explanation and fix?
  options: ["The ISP is throttling ICMP; ignore it", "A loss-based sender is filling an oversized buffer in the router or modem, creating a standing queue; enable active queue management with flow queueing (fq_codel or SQM) on the bottleneck device", "The upload uses UDP and is starving TCP", "The Wi-Fi signal is weak; move closer to the router"]
  answer: 1
  explanation: >-
    Delay that tracks load without loss is queueing. Loss-based congestion control keeps the bottleneck buffer full, so every packet waits behind it. AQM drops or marks early and flow queueing isolates the ping and the call from the bulk flow. A weak signal would cause loss and variable delay whether or not the upload is running.
- q: >-
    A Reno-style flow over a 100 ms path with 0.1% loss achieves about 4.5 Mbit/s. Which single change roughly doubles its throughput?
  options: ["Halving the loss rate to 0.05%", "Halving the RTT to 50 ms by serving from a closer location", "Doubling the link bandwidth", "Doubling the receive buffer"]
  answer: 1
  explanation: >-
    Throughput is proportional to MSS/RTT times 1/sqrt(p). Halving RTT doubles it; halving loss multiplies it by only sqrt(2), about 1.41. The link and receive buffer are not the binding limit here, the loss-driven window is.
- q: >-
    Why does AIMD halve the window on loss rather than subtracting a fixed number of segments?
  options: ["Halving is cheaper to compute", "Multiplicative decrease shrinks the gap between competing flows at each loss while additive increase preserves it, so flows converge to fair shares; additive decrease would leave the gap unchanged forever", "Subtracting segments could make the window negative", "The RFC requires powers of two"]
  answer: 1
  explanation: >-
    If both flows lose together and both halve, the difference between them halves. Adding the same amount to both keeps the difference. Repeat and they converge. With additive decrease both lose the same amount and the unfair split persists.
- q: >-
    You switch your origin servers from Cubic to BBR. Which effect should you expect?
  options: ["Faster uploads from users' browsers to your servers", "Faster and lower-latency downloads to users on lossy or bloated paths, since the server is the sender; client uploads are unchanged", "No change, because both ends must agree on the algorithm", "Lower CPU usage on clients"]
  answer: 1
  explanation: >-
    Congestion control is chosen and run by the sender alone; there is no negotiation. Server-to-client traffic uses the server's algorithm. Client uploads still use the client OS's algorithm.
- q: >-
    A fresh connection with initcwnd 10 and a 1,460-byte MSS fetches a 40 KB response over an 80 ms RTT path with no loss. Ignoring the handshake, how many round trips does the response take to arrive?
  options: ["1", "2", "3", "It depends only on the link bandwidth"]
  answer: 1
  explanation: >-
    The first RTT carries 10 segments (14.6 KB); the window doubles to 20 segments (29.2 KB) for the second, for 43.8 KB in total, which covers 40 KB. The link bandwidth does not enter into it; the window does. That is why responses that fit in the initial window are so much faster on new connections.
```
