---
lesson: latency-bandwidth-and-math
source: 121cd50881267460
fit: partial
desk:
  - "The serialisation versus propagation table, and the round-trip staircase for a cold HTTPS request"
  - "The window-ceiling lab and the annotated ss -ti output, field by field"
  - "The slow-start flight table and the fan-out simulation table"
  - "The Sydney dashboard budget and the 10 terabyte transfer, written out"
  - "Exercise: count slow-start round trips"
---
## Introduction

A product manager asks why the page takes 400 milliseconds to show anything, when the API responds in 20. Both numbers are true. The gap is not mystery overhead. It is a fixed number of round trips multiplied by a fixed distance, plus a transport that deliberately starts slow. If you can take that 400 milliseconds apart on a whiteboard, you can say which parts are physics, which are protocol, and which you are allowed to remove.

Four ideas. Count round trips before you count bytes. A connection's window puts a ceiling on throughput, and slow start puts a cost on every new connection. Fan-out turns a backend's rare slow call into a page's normal one. And Little's law turns latency into concurrency, which is how pools run dry.

## Distance, and round trips

Every packet pays four kinds of delay at every hop: propagation, the time to travel the distance; serialisation, the time to push the bits onto the link; queueing, waiting in a buffer behind other packets; and processing. Only queueing is the network being slow.

Here is the most useful constant in networking. Light in fibre covers about 5 microseconds per kilometre, and nothing you do in software changes it. New York to London is about 5,600 kilometres, so 28 milliseconds one way and 56 for a round trip. Real fibre does not follow the great circle, and measured round trips come out at 65 to 75 milliseconds. A 70 millisecond transatlantic round trip is 80 percent speed of light and 20 percent route. There is nothing to optimise except moving the endpoints.

Which delay dominates decides whether buying bandwidth helps. A 2 kilobyte API call across the Atlantic on a home link spends about 160 microseconds being serialised and 28 thousand microseconds travelling. A faster link changes nothing; a server on the right continent saves 50 milliseconds. A 1 megabyte image on a slow mobile link is the opposite: 800 milliseconds of serialisation and almost no distance. Small requests are latency-bound. Large transfers are bandwidth-bound.

For short requests, what matters is how many times a packet crosses the distance and comes back. A cold HTTPS request to a server 70 milliseconds away: one round trip for DNS, one for the TCP handshake, one for TLS 1.3, one for the request and the first byte. Four round trips, 280 milliseconds. The server's 20 millisecond response sits inside the last one. Nothing was slow.

Over a warm connection, with DNS cached and the connection pooled, the same request is one round trip, about 90 milliseconds. That is the whole argument for keep-alive and pooling: it removes three of the four. So state latency in round trips first and milliseconds second. "This flow costs three round trips" is a fact about the protocol. "It costs 210 milliseconds" depends on where the user is sitting.

## The window ceiling

Once data flows, a second limit appears. TCP lets a sender have only a bounded number of unacknowledged bytes in flight. If that bound is smaller than what the pipe can hold, the sender stops and waits for acknowledgements, and the link sits idle. What the pipe holds is the bandwidth-delay product: bandwidth times round-trip time. A 1 gigabit link with a 70 millisecond round trip holds 8.75 megabytes.

Rearranged, that gives the ceiling for any window: throughput is at most the window divided by the round-trip time. The original TCP window field tops out at 64 kilobytes, which on that 70 millisecond path is about 7.5 megabits a second, three quarters of one percent of the link. Window scaling fixes this, but the ceiling comes back whenever something caps the window.

The lesson measured it. A 50 millisecond path with a 100 megabit bottleneck. One connection whose receiver set its buffer to 64 kilobytes ran at 12.2 megabits a second, exactly its window divided by the round trip, 12 percent of the link. The same connection with the kernel left to autotune its buffer grew its window to 5.5 megabytes and ran at 89 megabits. One trap is worth naming: setting the receive buffer explicitly switches off autotuning. Engineers do it to optimise, and it does the opposite.

The kernel will tell you this directly. The tool called ss, with its info flags, prints a field called rwnd limited: the share of time the sender was blocked by the receiver's window. On the slow connection it read 97 percent. That is the diagnosis in one field. Near 100 percent means fix the receiver.

And halving the round trip doubles the ceiling, which is why a CDN edge 10 milliseconds from the user can serve a large file many times faster than an origin 150 milliseconds away, over identical links.

## Slow start

A new connection does not begin at the bandwidth-delay product. Linux starts with a window of 10 segments, about 14.5 kilobytes, and doubles it every round trip. 14.5 kilobytes, then 29, then 58, and so on. A 1 megabyte response finishes in the seventh flight. Seven round trips: 350 milliseconds on a 50 millisecond path, for an object a gigabit link serialises in 8.

Now, a long-lived connection on that path served a megabyte in one round trip back to back. After sitting idle for one second, the same request took four round trips. Before I tell you why: what changed?

[pause]

The kernel restarts the congestion window after idle. When a connection has been quiet longer than its retransmission timeout, Linux halves the window once for every timeout of idle time. One second at a 252 millisecond timeout is three halvings. With the setting called slow start after idle turned off, the same case took one round trip every time. Servers holding long-lived, bursty connections often turn it off.

Two things to act on. A response under about 14 kilobytes fits in the first window and completes in one round trip, which is why critical CSS is inlined and the first 14 kilobytes of a page are worth more than the next 100. And a warm, recently active connection delivers that megabyte in one or two round trips instead of seven. When you move from cold to warm connections, skipping slow start saves about five round trips; skipping the handshakes saves two.

## Fan-out and the tail

Averages describe throughput. Users experience percentiles. A service with a 20 millisecond median and a 300 millisecond 99th percentile has one request in a hundred taking fifteen times longer, and at a thousand requests a second that is ten unhappy users every second.

Fan-out makes this much worse. A page that waits for many parallel backend calls is as slow as the slowest. If each call is fast 99 percent of the time, the page is fast only when all of them are. With 100 backends that is 0.99 to the power of 100, about 37 percent. So 63 percent of page loads wait on at least one backend's slowest 1 percent.

Turn it around. For the page to be fast 99 percent of the time with 100 backends, each backend must be fast 99.99 percent of the time. Each must hold, at its 99.99th percentile, the latency you want the page to have at its 99th. With 10 backends, it is the 99.9th.

A simulation confirmed it with a realistic shape: backends with a 10 millisecond median and an occasional stall. At a fan-out of 100, the page's 99th percentile landed at a single backend's 99.99th, about 470 milliseconds. And the page's median, 54 milliseconds, was slower than 99 percent of individual calls. This is why large fan-out systems obsess over each dependency's tail, and why they hedge: if no reply arrives within the dependency's 95th percentile, send a second copy to another replica and take whichever answers first. Only for idempotent calls.

## Queueing and Little's law

Two more contributors to tails. The first is queueing near saturation. For a simple queue, the mean wait, in units of the service time, is utilisation divided by one minus utilisation. At 50 percent busy, the wait is one service time. At 90 percent, nine. At 99 percent, ninety-nine. The last 10 percent of utilisation costs more than the first 90, which is why capacity plans target 50 to 70 percent at peak, not 95.

The second is the most useful equation for sizing anything with a queue. Little's law: the number in the system equals the arrival rate times the time each one spends there. It holds for any stable system.

A service handling a thousand requests a second at 200 milliseconds has 200 requests in flight. That number sizes the thread pool, the connection pool to the next hop, the file descriptors, the memory. If a downstream slows and latency doubles, in-flight doubles to 400, and a pool sized for 200 starts queueing, which adds latency, which raises in-flight further. Most cascading failures are Little's law running in the wrong direction.

A quick one to hold. 2 thousand requests a second at 50 milliseconds is 100 in flight. Latency goes to 250 milliseconds: 500 in flight. Every limit sized for 100 now queues.

## The numbers, and a budget

A few orders of magnitude to carry, rounded hard. Main memory, 100 nanoseconds. An SSD read, 100 microseconds. A round trip inside a data centre, half a millisecond. Across a region, 1 to 2. Across a continent, 60 to 70. Transatlantic, 70 to 90. The ratios matter more than the values: one 70 millisecond cross-region round trip costs as much as 140 round trips inside a data centre. So the first question about any cross-region call is whether it can be asynchronous.

Now the budget. A user in Sydney loads a dashboard from Virginia: 200 millisecond round trip, cold, 600 kilobytes. Four round trips to the first byte, then five more slow-start flights to deliver the rest. About 1.8 seconds. Put a CDN edge in Sydney, 10 milliseconds away, holding the object: about 80 milliseconds. Same bytes, same server code, twenty times faster.

The same arithmetic catches a big copy. 10 terabytes between regions over a 10 gigabit link with a 70 millisecond round trip. The link alone says about 2.2 hours. But a single stream's window is capped near 20 megabytes on the lesson's lab machine, and 20 megabytes per 70 milliseconds is about 2.3 gigabits a second. That is close to 10 hours. The answer comes from the window, not the link. Five parallel streams, or bigger buffers on both ends, gets you back to 2.2.

## In the interview

Here is a follow-up the lesson expects. A transfer between two data centres runs at 12 megabits a second on a 10 gigabit link, with no loss. What do you check?

[pause]

Compute the window divided by the round trip. If it matches, read the kernel's view for rwnd limited and the advertised window, then look for an explicitly set receive buffer, a low maximum on the kernel's buffer settings, or a stripped window-scale option. The wrong answer is "the link is congested". A connection with zero loss and a flat round trip rules that out.

And a second. Your pool has 50 connections, traffic is a thousand requests a second, latency is 30 milliseconds. Is that enough? Little's law says 30 in flight at the mean, so it looks fine. But a spike to 100 milliseconds needs 100, so the pool saturates exactly when latency rises. Size from the 99th percentile, and add a deadline so waits cannot grow without bound. The wrong answer is "yes, 30 is less than 50."

## Recap

Four things to remember. Quote latency in round trips first: a cold HTTPS request is four, a warm one is one, and distance is physics. Throughput is at most the window divided by the round trip, and setting the receive buffer yourself switches off autotuning. A new connection needs about seven round trips for a megabyte, and an idle one slow-starts again. And fan-out turns a backend's 99.99th percentile into the page's 99th, while Little's law turns rising latency into an exhausted pool.

At your desk: the round-trip staircase and the serialisation table, the window lab and the annotated ss output, the slow-start and fan-out tables, the two worked budgets, and the slow-start counting exercise.
