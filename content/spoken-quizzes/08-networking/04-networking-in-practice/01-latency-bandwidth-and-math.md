---
lesson: latency-bandwidth-and-math
source: 1de34be0f8ab4fb5
---
## 1

A single TCP connection between two data centres, with a 100 millisecond round trip, is transferring at 5 megabits a second on a 10 gigabit link, with zero packet loss. What is the most likely limiting factor?

A, the propagation delay of the fibre. B, the receive window is capped at 64 kilobytes. C, the link is saturated by other traffic. D, the application is limited by its CPU.

[think]

The answer is B: the receive window is capped at 64 kilobytes.

64 kilobytes every 100 milliseconds is 640 kilobytes a second, about 5 megabits a second: exactly the observed rate. Zero loss rules out congestion, and propagation sets the round trip, not the throughput ceiling for a given window. Check the send window and the receive-window-limited time in the ss output, and the window-scale option in a capture.

## 2

A page fans out to 100 backends in parallel, and must meet its 99th percentile latency target. At which percentile must each backend meet that same latency?

A, at its 99.99th percentile. B, at its 99.9th. C, at its 99.999th. D, at its 99th.

[think]

The answer is A: at its 99.99th percentile.

The page is fast only if all 100 calls are fast, so each must be fast with a probability of 0.99 to the power of one hundredth, about 0.9999: the 99.99th percentile. Holding each backend's 99th percentile at the target leaves only 0.99 to the 100th, about 37 percent, of pages fast. The lesson's simulation confirmed it: the page's 99th percentile landed at a single backend's 99.99th.

## 3

Your API handles 2,000 requests per second, with a mean latency of 50 milliseconds. A downstream slowdown pushes the mean latency to 250 milliseconds. How many requests are in flight afterwards?

A, 2,000. B, 500. C, 100. D, 250.

[think]

The answer is B: 500.

Little's law: requests in flight equal the arrival rate times the time each spends, so 2,000 times a quarter of a second is 500, up from 100. Any pool or thread limit sized for the old number now queues, adding more latency.

## 4

You move a 1 megabyte API response from a cold connection to a pooled, warm connection, over the same 70 millisecond path. Which saving is largest?

A, skipping slow start, since the congestion window has grown. B, removing the DNS lookup from the request. C, lower transmission delay for the 1 megabyte body. D, skipping the TCP and TLS handshakes, which cost 2 round trips.

[think]

The answer is A: skipping slow start, since the congestion window has grown.

The handshakes save 2 round trips, 140 milliseconds. A grown congestion window delivers the megabyte in one or two round trips instead of seven, saving around 5 round trips, about 350 milliseconds, as the lab measured. DNS is at most one round trip, and transmission delay is the same either way.

## 5

On a 50 millisecond path, a 1 megabyte response on a long-lived connection took one round trip when requested back to back, but four round trips after the connection sat idle for one second. What explains the difference?

A, the receive window shrinks back to 64 kilobytes when idle. B, an idle connection must repeat its TCP handshake. C, the kernel halves the congestion window for each retransmission timeout of idle time. D, Nagle's algorithm holds the first segment after idle.

[think]

The answer is C: the kernel halves the congestion window for each retransmission timeout of idle time.

With the slow-start-after-idle setting on, Linux restarts the congestion window after an idle period longer than the retransmission timeout, halving it once per timeout elapsed, so the transfer slow-starts again. With the setting off, the same idle case took one round trip. The receive window and the handshake are unaffected by idleness, and Nagle does not delay full-sized segments.

## 6

On a slow bulk sender, the ss command shows a congestion window of 108 segments, a send window of 76,896 bytes, and receive-window-limited for 97 percent of the time. What limits its throughput?

A, packet loss along the path. B, the receiver's advertised window. C, the sending application's writes. D, the sender's congestion window.

[think]

The answer is B: the receiver's advertised window.

The send window is the window the receiver advertised, about 75 kilobytes, while the congestion window would allow 108 segments, about 156 kilobytes, and the sender spent 97 percent of its busy time blocked by the receive window. Fix the receiver's buffer, or its application's reads. An application-limited sender shows that instead, and loss would show retransmissions and a shrinking congestion window.
