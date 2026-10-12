---
lesson: congestion-control
source: e39a991ece43f5b1
---
## 1

During a large upload, ping from the same laptop rises from 20 milliseconds to 600, and falls back to 20 when the upload finishes. There is almost no packet loss. What is the best explanation and fix?

A, the upload uses UDP, which is starving the TCP flows. B, the Wi-Fi signal is weak, so move closer to the router. C, the ISP is throttling ping during the upload, so ignore it. D, bufferbloat in the home router, so enable flow-queueing active queue management there.

[think]

The answer is D: bufferbloat in the home router, so enable flow-queueing active queue management there.

Delay that tracks load without loss is queueing. A loss-based sender keeps an oversized buffer in the router or modem full, creating a standing queue that every packet waits behind. Active queue management with flow queueing on the bottleneck device drops or marks early, and isolates the ping and the video call from the bulk flow. A weak signal would cause loss and variable delay whether or not the upload was running.

## 2

A Reno-style flow over a path with a 100 millisecond round trip and 0.1 percent loss achieves about 4.5 megabits per second. Which single change roughly doubles its throughput?

A, doubling the receiver's socket buffer size. B, halving the loss rate, from 0.1 percent to 0.05. C, halving the round trip to 50 milliseconds, from a closer edge. D, doubling the bandwidth of the bottleneck link.

[think]

The answer is C: halving the round trip to 50 milliseconds, from a closer edge.

Throughput is proportional to the segment size over the round trip, times one over the square root of the loss rate. Halving the round trip doubles it. Halving the loss multiplies it by only the square root of 2, about 1.41. The link and the receive buffer are not the binding limit here: the loss-driven window is.

## 3

Why does additive increase, multiplicative decrease halve the window on loss, rather than subtracting a fixed number of segments?

A, it shrinks the gap between competing flows each time. B, the RFC requires window sizes to be powers of two. C, halving takes fewer CPU cycles than subtracting. D, subtracting segments could make the window negative.

[think]

The answer is A: it shrinks the gap between competing flows each time.

If both flows lose together and both halve, the difference between them halves, while adding the same amount to both keeps the difference. Repeat that, and they converge to fair shares. With additive decrease, both lose the same amount, and the unfair split persists forever. Computation cost and powers of two have nothing to do with it.

## 4

You switch your origin servers' congestion control from Cubic to BBR. Which effect should you expect?

A, lower CPU usage on the clients receiving the data. B, no change unless the clients also switch to BBR. C, better downloads for users on lossy or bloated paths. D, faster uploads from users' browsers to your servers.

[think]

The answer is C: better downloads for users on lossy or bloated paths.

Congestion control is chosen and run by the sender alone; there is no negotiation. Server-to-client traffic uses the server's algorithm, so downloads on lossy or bloated paths get faster and see less queueing. Client uploads still use the algorithm of the client's operating system.

## 5

In a measured Cubic upload, the slow-start threshold dropped from 62 to 43, then from 43 to 30, at successive losses. Earlier, slow start had ended at a window of 55 with no loss at all. What explains both?

A, BBR paces the flow, and its round-trip probing limits the window every ten seconds. B, a policer drops 30 percent of packets, and slow start always stops at 55. C, Reno halves on loss, and the receiver's window capped slow start at 55. D, Cubic cuts to 70 percent on loss, and HyStart ends slow start when the round trip rises.

[think]

The answer is D: Cubic cuts to 70 percent on loss, and HyStart ends slow start when the round trip rises.

62 times 0.7 is about 43, and 43 times 0.7 is about 30: that is Cubic's multiplicative decrease. Reno would have halved to 31 and then 21. HyStart watches the round-trip time of each round's acknowledgements and exits slow start when it rises by more than about an eighth of the minimum, which happened as the uplink queue began to fill. The kernel was running Cubic, not BBR, and there is no fixed slow-start limit.

## 6

A fresh connection with an initial window of 10 segments and a 1,460-byte MSS fetches a 40 kilobyte response over an 80 millisecond path with no loss. Ignoring the handshake, how many round trips does the response take to arrive?

A, 3. B, 1. C, 2. D, 4.

[think]

The answer is C: 2.

The first round trip carries 10 segments, about 14.6 kilobytes. The window doubles to 20 segments, about 29.2 kilobytes, for the second, making 43.8 kilobytes in total, which covers 40. The link's bandwidth does not enter into it; the window does. That is why responses that fit in the initial window are so much faster on new connections.
