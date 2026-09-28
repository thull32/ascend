---
slug: congestion-control
title: "Congestion control: slow start, AIMD, Cubic, BBR and bufferbloat"
description: How a TCP sender guesses a bottleneck it cannot see, slow start and AIMD traced per round trip and on a measured upload (HyStart exit, Cubic's 0.7 cut, rate-halving), why AIMD converges to fairness, Cubic's window function computed, the Mathis limit on long fat paths, what BBR models instead of loss, and how to read bufferbloat in latency graphs.
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

## A real upload, traced from the kernel

Theory is cleaner than any real path, so here is one. From the machine this lesson was written on, a single 4 MB HTTPS upload to Cloudflare's speed-test endpoint ran with Linux's default Cubic while a thread read the socket's `TCP_INFO` every 2 ms (the same fields `ss -ti` prints). The upload averaged 4.1 Mbit/s, the path's minimum RTT was 15.5 ms, and the MSS was 1,388:

| Time | cwnd | ssthresh | Smoothed RTT | Retransmits | What happened |
|---|---|---|---|---|---|
| 0 ms | 10 | ∞ | 31 ms | 0 | Initial window after the TLS handshake |
| 52–128 ms | 13 → 48 | ∞ | 33 → 44 ms | 0 | Slow start: each ACK adds a segment |
| 136 ms | 55 | **55** | 41 ms | 0 | HyStart exit: RTT had risen ~10 ms above the round's minimum, so slow start ended **without a loss** |
| 150–242 ms | 56 → 62 | 55 | 41 → 56 ms | 0 | Congestion avoidance: about one segment per RTT; RTT keeps rising as the bottleneck queue fills |
| 246 ms | 60 | **43** | 51 ms | 1 | First loss: ssthresh = 62 × 0.7 = 43.4, Cubic's β |
| 250–295 ms | 58 → 43 | 43 | ~50 ms | 2 | The window steps down over one RTT (proportional rate reduction), not in one jump |
| 403 ms | 42 | **30** | 46 ms | 6 | Next loss: 43 × 0.7 = 30.1 |
| 470 ms | 29 | **21** | 54 ms | 9 | 30 × 0.7 = 21 |
| 1.2–2.8 s | 5 – 12 | 5 – 8 | 40 – 64 ms | 17 → 29 | Oscillating around the path's capacity |

Three lessons in one trace. The bottleneck was a 4.1 Mbit/s uplink, whose BDP at the 15.5 ms minimum RTT is 4.1 × 10⁶ × 0.0155 / 8 ≈ 7.9 KB, under six segments; the window finally oscillated between 5 and 12, and everything above six segments was queue, visible as a smoothed RTT of 40 to 64 ms, three to four times the empty-path RTT. Each loss cut ssthresh to 70% of the window, exactly Cubic's β. And the loss rate was high: 29 retransmissions in about 1,000 data segments by 2.8 s, roughly 3%, the signature of a small buffer or a rate policer at the uplink rather than a deep, bloated one.

## Why Reno cannot fill a fast, long path

The sawtooth has a steady-state throughput that depends on the loss rate. The Mathis approximation for a Reno-style flow is:

$$\text{throughput} \approx \frac{\text{MSS}}{\text{RTT}} \cdot \frac{1.22}{\sqrt{p}}$$

where `p` is the packet loss probability. With a 1,460-byte MSS and a 100 ms RTT:

| Loss rate | Throughput ceiling |
|---|---|
| 1% | 1.4 Mbit/s |
| 0.1% | 4.5 Mbit/s |
| 0.01% | 14.2 Mbit/s |

Three things fall out. Throughput is inversely proportional to RTT, so halving the distance (a closer CDN edge) doubles the ceiling. It scales only with the square root of loss, so halving loss buys only 41%. And the loss rate needed for high speed is absurd: RFC 3649 works out that a standard TCP flow at 10 Gbit/s over 100 ms with 1,500-byte packets needs an average window of 83,333 segments and at most one loss every 5 billion packets, about one congestion event every hour and forty minutes. After a single loss, climbing back from 41,667 to 83,333 segments at one segment per RTT takes 41,667 RTTs, about 69 minutes. No real path is that clean. The replication job from the opening, at one loss in ten thousand, sits in the bottom row of the table; Cubic, below, does somewhat better, but still nowhere near 10 Gbit/s.

## Cubic: growth as a function of time

Cubic, the default on Linux since 2006 and on most major stacks today, replaces "add one segment per RTT" with a window that is a cubic function of the time since the last loss:

$$W(t) = C\,(t - K)^3 + W_{\max}, \qquad K = \sqrt[3]{\frac{W_{\max}\,(1-\beta)}{C}}$$

`W_max` is the window at the last loss, `β = 0.7` is the multiplicative decrease (Cubic cuts to 70%, not 50%), and `C = 0.4`. `K` is the time it takes to climb back to `W_max`.

The curve is concave then convex. Right after a loss it grows fast, slows to a near-plateau around `W_max` (where the last loss happened, so probably near capacity), then accelerates again to probe for new bandwidth if no loss occurs. Worked numbers:

- `W_max` = 100 segments: `K` = ∛(100 × 0.3 / 0.4) = ∛75 ≈ 4.2 seconds.
- `W_max` = 83,333 segments (the 10 Gbit/s path): `K` = ∛62,500 ≈ 39.7 seconds, against Reno's 69 minutes.

Computed from the formula for `W_max` = 100 segments (so `K` ≈ 4.22 s), against Reno recovering from the same loss on a 100 ms path (halve to 50, then +1 per RTT, which is +10 per second):

| Seconds after the loss | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 |
|---|---|---|---|---|---|---|---|---|
| Cubic W(t) | 70.0 | 86.7 | 95.6 | 99.3 | 100.0 | 100.2 | 102.3 | 121.7 |
| Reno, 100 ms RTT | 50 | 60 | 70 | 80 | 90 | 100 | 110 | 130 |

Cubic regains 87% of the old window in the first second, then creeps past `W_max` for about two seconds (between 3 and 5 s it adds less than one segment), then accelerates. The measured trace's first loss, at a window of 62, gives `K` = ∛(62 × 0.3 / 0.4) ≈ 3.6 s and W(0) = 43.4, the ssthresh the kernel reported. Cubic's constants and time are in seconds and segments here; Linux implements the same curve in fixed-point arithmetic in `tcp_cubic.c`.

Because growth depends on wall-clock time rather than RTT count, two Cubic flows with different RTTs grow at similar rates, which is fairer than Reno, where a flow with a 10 ms RTT ramps ten times faster than one with 100 ms. On short-RTT paths, where Reno would actually be quicker, Cubic runs in a "TCP-friendly" region and takes whichever window is larger.

Cubic is still loss-based. It finds the path's capacity by overflowing the bottleneck buffer, and between losses it keeps that buffer as full as it can. Which brings back the home router.

```exercise
id: cubic-window
title: Cubic's window after a loss
prompt: |
  Implement Cubic's window function. After a loss at window `w_max`
  (segments), the window `t` seconds later is

  `W(t) = C * (t - K)**3 + w_max`, with `K = cbrt(w_max * (1 - beta) / C)`,

  using `C = 0.4` and `beta = 0.7`. Return the list of `W(t)` for each `t`
  in `times`, each rounded to one decimal place (the tests avoid values
  that end in exactly .x5).
languages: [python, javascript]
entry: cubic_window
starter:
  python: |
    def cubic_window(w_max, times):
        C, BETA = 0.4, 0.7
        # your code here
        return []
  javascript: |
    function cubic_window(w_max, times) {
      const C = 0.4, BETA = 0.7;
      // your code here
      return [];
    }
tests:
  - args: [100, [0, 1, 2, 3, 4, 5, 6, 8]]
    expected: [70.0, 86.7, 95.6, 99.3, 100.0, 100.2, 102.3, 121.7]
    label: the lesson's table
  - args: [62, [0, 0.5, 1, 2, 3, 4]]
    expected: [43.4, 50.1, 55.0, 60.4, 61.9, 62.0]
    label: the measured upload's first loss
  - args: [1000, [0, 3, 12]]
    expected: [700.0, 909.8, 1009.9]
  - args: [62, []]
    expected: []
    label: no sample times
  - args: [83333, [0, 20, 40]]
    expected: [58333.1, 80281.8, 83333.0]
    hidden: true
    label: the 10 Gbit/s path recovers in about 40 s
  - args: [10, [0, 1.5]]
    expected: [7.0, 10.0]
    hidden: true
hints:
  - "At t = 0 the formula gives `beta * w_max`: the window right after the cut."
  - "Python's `x ** (1/3)` and JavaScript's `Math.cbrt` both work because the argument of the cube root is positive; `(t - K) ** 3` must keep its sign."
```

## Bufferbloat: when the buffer is the latency

A router forwards at link rate and queues the excess. A full queue adds a delay equal to its size divided by the link rate:

$$\text{queueing delay} = \frac{\text{buffer bytes} \times 8}{\text{link rate}}$$

A home router with 256 packets of buffer on a 10 Mbit/s uplink: $256 \times 1500 \times 8 / 10^7 \approx 307$ ms. Memory is cheap, so consumer devices, cable modems and cellular base stations have shipped with buffers of hundreds of milliseconds or more. A loss-based sender cannot see a loss until that buffer is full, so a single bulk upload parks a standing queue of several hundred milliseconds in front of every other packet on the link. That is **bufferbloat**, named by Jim Gettys around 2010, and it is why the video call dies when the backup starts.

You measure it by comparing the RTT under load with the RTT of an empty path. The upload traced above did this from inside the kernel: minimum RTT 15.5 ms, smoothed RTT 40 to 64 ms while the upload ran, so 25 to 50 ms of every packet's delay was queue at the uplink, a mild case. A home connection with a deep buffer shows the same pattern in `ping` at a larger scale: 20 ms idle, several hundred milliseconds during an upload, and back to 20 ms when it stops. Delay that tracks load while loss stays near zero is queueing, never distance. More bandwidth does not fix it; the next faster link gets the same queue, filled faster. Three fixes do:

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

`iperf3` prints the sender's view of the same things per second. An illustrative run across a 100 Mbit/s path with a 20 ms base RTT (the shape, not a measurement from this machine):

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

## Under the hood: congestion control in Linux

- **Pluggable modules.** Each algorithm implements `struct tcp_congestion_ops` (hooks for every ACK, loss, and state change). `net.ipv4.tcp_available_congestion_control` lists what is loaded; on this WSL2 kernel it is `reno cubic`, with Cubic the default, and BBR would need its module (`tcp_bbr`) loaded first.
- **HyStart** (on by default with Cubic) samples the RTT of the first ACKs of each round and exits slow start when the round's minimum RTT exceeds the previous round's by more than an eighth of it, clamped to 4–16 ms. That is the loss-free exit at a window of 55 in the trace.
- **Proportional rate reduction** (RFC 6937, Linux 3.2 and later) spreads the window reduction after a loss across the recovery round trip, sending about one new segment for every two acknowledged, instead of stopping dead and then bursting. That is the stepped descent from 62 to 43.
- **Pacing.** Since Linux 4.13, TCP can pace internally (a high-resolution timer per socket); the `fq` qdisc paces too. BBR depends on pacing; Cubic benefits from it by avoiding line-rate bursts into shallow buffers.
- **Per-route overrides.** `ip route change default via … initcwnd 20` or `congctl bbr` sets the initial window or the algorithm per destination, which is how some servers use a larger initial window towards their own CDN nodes only.

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Bufferbloat | Latency rises by hundreds of ms whenever a bulk transfer runs; calls and games stutter | RTT under load far above minimum RTT, with little loss | fq_codel or CAKE on the bottleneck device (home router, VPN gateway), ECN, BBR on the bulk sender |
| Slow start after idle | Keep-alive connections are slow on the first response after a pause | `ss -ti` shows cwnd back near 10 after idle; `tcp_slow_start_after_idle=1` | Set it to 0 on servers with long-lived connections |
| Long fat pipe starved by loss | Cross-region transfer uses a small fraction of a large link with a steady trickle of retransmits | Throughput near MSS/RTT × 1.22/√p for the observed loss | Find the loss (a bad optic, a policer), use BBR for bulk flows, parallel streams, or move data closer |
| Policer drops bursts | Throughput collapses with clusters of retransmission timeouts | Losses at a fixed rate regardless of competing traffic; bursts exceeding a token bucket | Pacing (fq qdisc, BBR), shape instead of police at your own edge |
| Unfair coexistence | After switching some senders to BBR v1, Cubic flows on shared links slow down (or the reverse) | Per-algorithm throughput differs with buffer depth | Keep one algorithm per shared bottleneck, or use BBRv2/v3 which respond to loss and ECN |

## Interviewer follow-ups

**"Why does halving the RTT double throughput while halving the loss rate does not?"** Model answer: in loss-based congestion avoidance the window grows one segment per RTT and halves per loss, so the average window scales as 1/√p and throughput as window/RTT; halving RTT doubles the rate directly, halving loss gains √2 ≈ 1.41. Common wrong answer: "both are linear".

**"What does BBR measure, and what does it do with it?"** Model answer: the maximum delivery rate over about ten round trips (bottleneck bandwidth) and the minimum RTT over ten seconds (propagation delay); it paces at the bandwidth, caps data in flight near twice their product, and periodically probes up and drains. Common wrong answer: "BBR is a faster Cubic".

**"Your API's p50 latency to distant users is dominated by round trips even though responses are 60 KB. What helps?"** Model answer: a 60 KB response over a fresh connection needs about three RTTs of slow start (10, 20, 40 segments) on top of the handshakes; reuse connections, disable slow start after idle, move the edge closer, or consider a larger initial window towards known paths. Common wrong answer: "buy more bandwidth".

## What mid-level engineers get wrong

- Adding bandwidth to fix latency under load; the bigger pipe gets the same standing queue.
- Tuning the client for faster downloads; the server's algorithm governs them.
- Reading every retransmission as a network fault; loss-based algorithms create loss on purpose to find capacity.
- Switching a fleet to BBR without checking coexistence on shared links and retransmission rates in shallow buffers.
- Benchmarking with a single long transfer and concluding that short requests will be fast; most real responses never leave slow start.

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
  options: ["The upload uses UDP, which is starving the TCP flows", "The Wi-Fi signal is weak; move closer to the router", "The ISP is throttling ICMP during the upload; ignore it", "Bufferbloat in the home router; enable fq_codel or SQM there"]
  answer: 3
  explanation: >-
    Delay that tracks load without loss is queueing. A loss-based sender keeps an oversized buffer in the router or modem full, creating a standing queue that every packet waits behind. Active queue management with flow queueing (fq_codel or SQM) on the bottleneck device drops or marks early and isolates the ping and the call from the bulk flow. A weak signal would cause loss and variable delay whether or not the upload is running.
- q: >-
    A Reno-style flow over a 100 ms path with 0.1% loss achieves about 4.5 Mbit/s. Which single change roughly doubles its throughput?
  options: ["Doubling the receiver's socket buffer size", "Halving the loss rate from 0.1% to 0.05%", "Halving the RTT to 50 ms from a closer edge", "Doubling the bandwidth of the bottleneck link"]
  answer: 2
  explanation: >-
    Throughput is proportional to MSS/RTT times 1/sqrt(p). Halving RTT doubles it; halving loss multiplies it by only sqrt(2), about 1.41. The link and receive buffer are not the binding limit here, the loss-driven window is.
- q: >-
    Why does AIMD halve the window on loss rather than subtracting a fixed number of segments?
  options: ["It shrinks the gap between competing flows each time", "The RFC requires window sizes to be powers of two", "Halving takes fewer CPU cycles than subtracting", "Subtracting segments could make the window negative"]
  answer: 0
  explanation: >-
    If both flows lose together and both halve, the difference between them halves, while adding the same amount to both keeps the difference. Repeat and they converge to fair shares. With additive decrease both lose the same amount and the unfair split persists forever. Computation cost and powers of two have nothing to do with it.
- q: >-
    You switch your origin servers from Cubic to BBR. Which effect should you expect?
  options: ["Lower CPU usage on clients receiving the data", "No change unless clients also switch to BBR", "Better downloads to users on lossy or bloated paths", "Faster uploads from users' browsers to your servers"]
  answer: 2
  explanation: >-
    Congestion control is chosen and run by the sender alone; there is no negotiation. Server-to-client traffic uses the server's algorithm, so downloads on lossy or bloated paths get faster and see less queueing. Client uploads still use the client OS's algorithm.
- q: >-
    In a measured Cubic upload, ssthresh dropped from 62 to 43, then from 43 to 30, at successive losses. Earlier, slow start had ended at a window of 55 with no loss at all. What explains both?
  options: ["BBR paces the flow, and PROBE_RTT limits the window every ten seconds", "The policer drops 30% of packets, and slow start always stops at 55", "Reno halves on loss, and the receiver's window capped slow start at 55", "Cubic cuts to 70% on loss, and HyStart ends slow start on rising RTT"]
  answer: 3
  explanation: >-
    62 x 0.7 = 43.4 and 43 x 0.7 = 30.1 are Cubic's multiplicative decrease with beta 0.7; Reno would have halved to 31 and 21. HyStart watches the RTT of each round's ACKs and exits slow start when it rises by more than about an eighth of the minimum, which happened as the uplink queue began to fill. The kernel was running Cubic, not BBR, and there is no fixed slow-start limit.
- q: >-
    A fresh connection with initcwnd 10 and a 1,460-byte MSS fetches a 40 KB response over an 80 ms RTT path with no loss. Ignoring the handshake, how many round trips does the response take to arrive?
  options: ["3", "1", "2", "4"]
  answer: 2
  explanation: >-
    The first RTT carries 10 segments (14.6 KB); the window doubles to 20 segments (29.2 KB) for the second, for 43.8 KB in total, which covers 40 KB. The link bandwidth does not enter into it; the window does. That is why responses that fit in the initial window are so much faster on new connections.
```
