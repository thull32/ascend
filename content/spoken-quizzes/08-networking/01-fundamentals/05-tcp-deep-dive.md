---
lesson: tcp-deep-dive
source: c00b5fe97b4d8a76
---
## 1

A reverse proxy opens a new TCP connection to its single backend for every request, and closes it after the response. At about 470 requests per second, it starts failing with "address not available" errors. What is the most effective fix?

A, pool keep-alive connections to the backend. B, increase the backend's listen backlog. C, raise the somaxconn setting on the backend host. D, enable time-wait recycling so ports are reused sooner.

[think]

The answer is A: pool keep-alive connections to the backend.

The proxy closes first, so each connection leaves a port in time-wait for 60 seconds, and 28,232 ephemeral ports divided by 60 seconds is about 470 per second to one destination. Keep-alive and pooling stop consuming a port per request, and remove a handshake per request too. The backlog and somaxconn are server-side accept limits. Time-wait recycling broke clients behind NAT and no longer exists in Linux.

## 2

A client sends a small request header with one write, the body with a second write, and then waits for the reply. Round trips take half a millisecond, yet every call takes about 40 milliseconds. What is happening?

A, slow start limits the connection to one segment per round trip. B, Nagle's algorithm holds the second write while the acknowledgement is delayed. C, the server's event loop is blocked for 40 milliseconds per call. D, the first segment is lost, and the retransmission timer fires each time.

[think]

The answer is B: Nagle's algorithm holds the second write while the acknowledgement is delayed.

Write, write, read with small writes is the classic Nagle and delayed-acknowledgement interaction. Nagle holds the second small write until the first is acknowledged, while the server delays its acknowledgement hoping to piggyback it on data, and the delayed-acknowledgement timer, 40 milliseconds minimum on Linux, breaks the deadlock. Coalescing the writes, or setting the no-delay option, removes it. A lost segment would cost at least the 200 millisecond minimum timeout.

## 3

Connecting to port 5432 on host A fails instantly with "connection refused". Connecting to port 5432 on host B hangs for about two minutes and then times out. What is the likely difference?

A, host B advertises a much larger receive window than A. B, host A has SYN cookies enabled and B does not. C, A has no listener and answers with a reset, while B's connection attempts are silently dropped. D, host B is overloaded and cannot accept new connections.

[think]

The answer is C: A has no listener and answers with a reset, while B's connection attempts are silently dropped.

A port with no listener makes the kernel reply with a reset, which produces "connection refused" in one round trip. A firewall or security group that silently drops the opening packet produces retransmissions with growing gaps until the retry budget runs out: about 127 seconds on Linux defaults before kernel 6.5, and 131 seconds since. An overloaded host would not fail at a fixed two minutes. That is why clients need an explicit connect timeout.

## 4

Your service has 9,000 sockets in the close-wait state and is approaching its file-descriptor limit. Which statement is true?

A, the kernel will reap close-wait sockets after 60 seconds. B, your code received the peer's close but never called close itself. C, Nagle's algorithm is holding the sockets' final close. D, peers never sent their final acknowledgement, so shorten time-wait.

[think]

The answer is B: your code received the peer's close but never called close itself.

Close-wait means the remote side has closed and the local application has not. There is no kernel timer for it. Time-wait is the state on the side that closes first, and has nothing to do with this. The fix is in the code path that should close the socket, typically an unclosed response body or a missing cleanup path.

## 5

A bulk transfer between regions runs at 50 megabits per second on a 10 gigabit link with an 80 millisecond round trip. The ss command shows no retransmissions and a large congestion window. The receiving application sets its socket receive buffer to 512 kilobytes at startup. What limits throughput?

A, time-wait sockets piling up on the sending host. B, the MSS is too small for a 10 gigabit link to fill. C, the 512 kilobyte receive window, with autotuning disabled. D, congestion control, since the congestion window has grown large.

[think]

The answer is C: the 512 kilobyte receive window, with autotuning disabled.

Throughput is bounded by the smaller of the congestion window and the receive window, per round trip. With no loss and a large congestion window, the receive window binds: 512 kilobytes every 80 milliseconds is about 52 megabits per second, far below the path's bandwidth-delay product of about 100 megabytes. Setting the buffer explicitly turned off autotuning, which would have grown the window. Removing that call usually fixes it.

## 6

On a Linux client, the ss command shows a smoothed round trip of 19.34 milliseconds, a variance of 8.341, and a retransmission timeout of 220. The RFC 6298 formula, smoothed round trip plus 4 times the variance, gives about 53 milliseconds. Why does the kernel report 220?

A, the timeout includes the peer's 40 millisecond delayed-acknowledgement timer, counted five times. B, Linux doubles the timeout after every sample until a loss has been observed. C, the RFC's one-second minimum applies, and the kernel scales it by the round trip. D, Linux floors the 4 times variance term at 200 milliseconds, so the timeout is about the round trip plus 200.

[think]

The answer is D: Linux floors the 4 times variance term at 200 milliseconds, so the timeout is about the round trip plus 200.

When 4 times the variance is smaller than 200 milliseconds, Linux uses 200 instead, so the timeout is roughly 19.34 plus 200, rounded to clock ticks. The RFC recommends a one-second floor, which Linux deliberately does not use. Backoff doubles the timeout only after a timeout fires, and delayed acknowledgements are not added to it.
