---
lesson: congestion-control
source: 8de477f3cd10aa96
fit: partial
desk:
  - "The AIMD fairness table, round by round"
  - "The measured Cubic upload traced from the kernel, with the HyStart exit and the 0.7 cuts"
  - "The Mathis formula and its table, and Cubic's window function against Reno"
  - "BBR's four phases, and the comparison table of Reno, Cubic and BBR"
  - "The iperf3 output and the sender's sysctl knobs"
  - "Exercise: simulate slow start and AIMD round by round"
  - "Exercise: Cubic's window after a loss"
---
## Introduction

A video call on home Wi-Fi is perfect until someone in the house starts a cloud photo backup. Within seconds, ping to the nearest server climbs from 20 milliseconds to 600, the call freezes, and the backup runs at full upload speed without complaint. Nothing is broken. The backup's TCP connection is doing exactly what it was designed to do: send faster until a buffer somewhere overflows. That buffer is in the home router, it holds over half a second of traffic, and every other flow now waits behind it.

The same design explains the opposite complaint. A replication job between two data centres 100 milliseconds apart has a 10 gigabit link and moves about 20 megabits a second per connection. The only thing wrong with the path is a loss rate of one packet in ten thousand.

One sender is too aggressive for its buffer. The other is too timid for its pipe. Both are congestion control. Here is the plan: how a sender guesses a bottleneck it cannot see, why halving on loss is fair, why that same rule cannot fill a long fast path, and the two answers, Cubic and BBR, plus the buffer problem that sits between them.

## The sender has to guess

No router tells a TCP sender how fast it may go. So the sender keeps a congestion window: its own estimate of how many bytes the path can hold in flight. The receiver's window protects the receiver; the congestion window protects the network; the sender obeys the smaller.

This was not in the original TCP. In October 1986 the early internet had the first of a series of congestion collapses: throughput between two sites a few hundred metres apart dropped by a factor of about a thousand, because senders retransmitted into queues that were already full. Van Jacobson's fix in 1988 is still the skeleton of everything in this lesson. Treat loss as a signal of congestion, start cautiously, probe upward, and back off hard when the signal arrives.

One fact to hold onto throughout: congestion control runs entirely on the sender. Your server's algorithm decides how fast downloads go; the client's decides uploads. That is why a CDN can change its algorithm and speed up delivery to every user with no client update.

A new connection starts with an initial window of 10 segments, about 14.6 kilobytes. Every acknowledgement of new data adds a segment, so a full window of acknowledgements doubles it: 10, 20, 40, 80 per round trip. "Slow start" is exponential; the name only contrasts it with what came before.

How long does that take to fill a fast path? A 1 gigabit path with a 70 millisecond round trip holds about 6,000 segments. Doubling from 10 takes 10 round trips, 700 milliseconds, and moves about 15 megabytes on the way. Any transfer smaller than 15 megabytes on that path finishes before the connection ever runs at link speed. That covers almost every API response and web page, which is why, for most traffic, the number of round trips matters and the link speed does not.

Two things you act on. A warm, reused connection skips slow start, but Linux resets the window after an idle period of about one retransmission timeout unless you turn off slow start after idle, a standard setting on servers holding long-lived keep-alive connections. And the last doubling can overshoot capacity by up to two times. Linux's Cubic uses HyStart to avoid that: it ends slow start when round-trip times start rising, because rising delay means a queue is forming.

## AIMD, and why it is fair

After slow start, the classic algorithm, Reno, switches to additive increase, multiplicative decrease. Each round trip without loss, add one segment. On a loss detected by duplicate acknowledgements, halve the window. If the retransmission timer fires instead, assume the path has changed badly: drop to one segment and slow start again.

The result is the famous sawtooth: a linear ramp up to a loss, a halving, another ramp. From half a window back to the full window takes half a window's worth of round trips. So a flow with a 100-segment window and a 50 millisecond round trip loses a packet roughly every 2.5 seconds.

Now the question interviewers fish for. Why halve, instead of subtracting a constant?

[pause]

Because halving is what makes competing flows converge on equal shares. Take two flows sharing a bottleneck, starting unfairly at 80 and 20 segments, and losing at the same time. Both add one, cross the limit and halve: about 40 and 10, and the gap of 60 becomes 30. Both add one per round trip: the gap stays at 30. Next loss, both halve: the gap becomes 15, then 7.5. Additive increase preserves the gap; multiplicative decrease halves it. Repeat, and they converge whatever their starting point. Subtracting a constant would never shrink the gap, and multiplying on the way up would widen it.

## Long fat paths, and Cubic

The sawtooth has a steady-state throughput set by the loss rate. The Mathis approximation, in words: throughput is the segment size over the round trip, times 1.22, divided by the square root of the loss rate.

On a 100 millisecond path, 1 percent loss caps a flow at 1.4 megabits a second. A tenth of a percent: 4.5. One in ten thousand: 14.2. That bottom row is the replication job from the opening.

Three things fall out. Throughput is inversely proportional to the round trip, so halving the distance, say with a closer CDN edge, doubles the ceiling. It scales only with the square root of loss, so halving the loss buys just 41 percent. And the loss rate needed for real speed is absurd. A standard flow at 10 gigabits over 100 milliseconds needs at most one loss every 5 billion packets, and after a single loss, adding one segment per round trip, it takes about 69 minutes to climb back. No real path is that clean.

Cubic, the Linux default since 2006, replaces "add one segment per round trip" with a window that is a cubic function of the time since the last loss. It cuts to 70 percent on a loss, not 50. Then the curve grows fast, flattens to a near-plateau around the window where the last loss happened, which is probably near capacity, and if no loss comes, accelerates again to probe for more. With a 100-segment window, Cubic regains 87 percent of it in the first second. On that 10 gigabit path, it climbs back in about 40 seconds, against Reno's 69 minutes. And because growth depends on wall-clock time rather than round trips, flows with different round trips grow at similar rates, which is fairer than Reno.

The lesson traced a real Cubic upload from inside the kernel, and it showed both mechanisms. Slow start ended at a window of 55 with no loss at all: HyStart saw the round trip rising. Then each loss cut the threshold to 70 percent, 62 to 43, then 43 to 30. Exactly Cubic's factor.

But Cubic is still loss-based. It finds capacity by overflowing the bottleneck buffer, and between losses it keeps that buffer as full as it can. Which brings back the home router.

## Bufferbloat

A router forwards at link rate and queues the excess, and a full queue adds a delay equal to its size divided by the link rate. A home router with 256 packets of buffer on a 10 megabit uplink adds about 307 milliseconds. Memory is cheap, so consumer devices, cable modems and cellular base stations have shipped with buffers of hundreds of milliseconds or more. A loss-based sender sees no loss until that buffer is full, so a single bulk upload parks a standing queue of several hundred milliseconds in front of every other packet. That is bufferbloat, named by Jim Gettys around 2010, and it is why the call dies when the backup starts.

You spot it by comparing the round trip under load with the round trip of an empty path. Twenty milliseconds idle, several hundred during an upload, back to twenty when it stops. Delay that tracks load while loss stays near zero is queueing, never distance.

And more bandwidth does not fix it; the next faster link gets the same queue, filled faster. Three things do. Active queue management: CoDel measures how long packets sit in the queue and starts dropping or marking when that stays above 5 milliseconds for 100 milliseconds, so the queue can absorb bursts but cannot stand. Flow queueing: fq-codel gives each flow its own queue and serves them in turn, so the call's small packets do not wait behind the backup. That is usually what "smart queue management" on a home router means. And ECN: the router marks the packet instead of dropping it, and the sender backs off as if it had lost one.

## BBR: model the pipe instead of filling it

Google's BBR, published in 2016, drops loss as the main signal. It continuously estimates the two numbers that define the path: the bottleneck bandwidth, the highest delivery rate seen over roughly the last ten round trips; and the propagation time, the lowest round trip seen over the last ten seconds. Their product is exactly the data that fills the pipe without building a queue. BBR paces packets at the estimated bandwidth, caps data in flight at about twice that product, and cycles: briefly probe for more bandwidth, then drain what the probe queued. Every ten seconds, if it has not seen a fresh minimum, it cuts to four packets in flight for at least 200 milliseconds to re-measure the empty-queue round trip.

Because it aims at the pipe instead of the buffer, it keeps queues short on bloated paths. Because it does not halve on random loss, it can run near link speed on a long path with 1 percent loss, where Cubic would crawl. Google reported that it raised YouTube's network throughput by 4 percent on average globally, and by more than 14 percent in some countries.

It has costs. The original version ignores loss almost entirely, so in shallow buffers it can sustain high retransmission rates. Its share against Cubic flows depends heavily on buffer depth: it can starve them in shallow buffers and lose to them in deep ones. And that ten-second probe shows up as a periodic dip in throughput. Later versions add responses to loss and ECN to fix the coexistence problem.

So when a graph arrives with a complaint: delay that rises with throughput and snaps down after a loss is a loss-based sender filling a buffer. Every request ramping up over its first few round trips and never reaching link speed is short flows living in slow start. A flat ceiling with zero retransmissions is not congestion at all; look at the receive window. And a dip every ten seconds on a flat, low round trip is BBR re-measuring.

## In the interview

A follow-up from the lesson. Why does halving the round trip double throughput, while halving the loss rate does not?

[pause]

In loss-based congestion avoidance, the window grows one segment per round trip and halves per loss, so the average window scales with one over the square root of the loss rate, and throughput is the window over the round trip. Halving the round trip doubles the rate directly. Halving loss gains the square root of two, about 1.41. The wrong answer is "both are linear". Use it to argue that moving the endpoint closer beats cleaning up the last hundredth of a percent of loss.

And another: your API's median latency to distant users is dominated by round trips, even though responses are only 60 kilobytes. A fresh connection needs about three round trips of slow start, 10, 20, then 40 segments, on top of the handshakes. Reuse connections, turn off slow start after idle, move the edge closer, or use a larger initial window toward known paths. The wrong answer is "buy more bandwidth".

## Recap

Congestion control is sender-side: your servers decide download speed for every client, and nothing on the server fixes a client's upload.

Multiplicative decrease is what makes flows fair: additive increase keeps the gap, halving halves it. Cubic backs off to 70 percent, not 50.

Throughput goes as one over the round trip and one over the square root of loss, so distance beats loss cleanup. And most responses finish inside slow start, so round trips and connection reuse dominate their latency.

Delay that tracks load with no loss is bufferbloat; the fix is fq-codel or ECN on the bottleneck, not a bigger link. BBR models bandwidth and minimum round trip instead of reacting to loss, at the price of retransmissions in shallow buffers and fairness against Cubic.

At your desk: the fairness table, the measured upload trace, the Mathis and Cubic tables, BBR's phases, the iperf3 output and knobs, and the two exercises.
