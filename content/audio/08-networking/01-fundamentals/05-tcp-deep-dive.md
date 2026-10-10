---
lesson: tcp-deep-dive
source: 47d1fd5c7231e8ea
fit: partial
desk:
  - "The handshake capture and the table of options it negotiates"
  - "The RTO worked example, as a table"
  - "The SACK trace with two losses, segment by segment"
  - "The receive-window trace with a reader that pauses"
  - "The Nagle and delayed ACK reproduction script and its measured results"
  - "Reading a live connection with ss, field by field"
  - "Exercise: compute the retransmission timeout"
  - "Exercise: size the window for a path"
---
## Introduction

Three tickets land in the same week. A reverse proxy starts failing with "cannot assign requested address" once traffic passes about 470 new connections a second to one backend. A tiny RPC that should take 1 millisecond takes almost exactly 41 milliseconds, every time. And a health check against a host in another VPC hangs for just over two minutes before failing, while the same check against a stopped service fails instantly.

None of these is a bug in your code in the usual sense. Each one is TCP doing exactly what its state machine says. TIME WAIT holding ports for 60 seconds. Nagle's algorithm waiting for an acknowledgement that the receiver is deliberately delaying. And a SYN being retransmitted, with growing gaps, into a firewall that drops it silently.

So: how TCP numbers bytes and what the handshake decides, how it detects loss, how the receiver slows the sender down, the 40 millisecond stall, and the states a connection leaks on its way out.

## The handshake and the one-second connect

Start with what a connection is: two byte counters. TCP numbers bytes, not packets. Each direction starts at a random initial sequence number, and an acknowledgement number means "I have every byte before this one; send me this one next." The start is random so that an attacker off the path cannot guess sequence numbers and inject data, and so that a delayed segment from an old connection is unlikely to land inside a new one.

The handshake, SYN, SYN-ACK, ACK, exists to exchange those two starting numbers. It is also the only moment TCP can negotiate options, so everything a connection will ever be able to do is decided in its first two packets. The maximum segment size: 1,460 bytes on ordinary Ethernet. Selective acknowledgement, which you will meet in a moment. Timestamps, for round-trip sampling. And window scaling. Without window scaling, the receive window is capped at 65,535 bytes for the life of the connection.

Now the server side. A listening socket has two queues. The SYN queue holds half-open handshakes. The accept queue holds finished connections waiting for your process to call accept, and its length is the backlog you passed to listen, capped by a kernel setting. When your event loop or thread pool is saturated, the accept queue fills, the kernel drops the handshake, and the client retransmits its SYN after a one-second timeout. The tell is connect latency clustering at whole seconds: 1 second, then 2 or 3. When you see that, check the listen overflow counter first.

Then the health check from the opening. A SYN to a port with nothing listening gets an immediate reset: connection refused, in one round trip. A SYN into a firewall that drops packets gets nothing, and Linux keeps retransmitting it with the gaps doubling. Before Linux 6.5 that came to 127 seconds before the connect gave up; since 6.5 it is 131. Either way, that is the "just over two minutes". Every client needs its own connect timeout rather than the kernel's.

## Loss: timers, duplicate ACKs and SACK

TCP discovers loss in two ways: a timer that expires, or a pattern of acknowledgements that implies a hole. The timer is the fallback, and it is expensive.

The retransmission timeout has to be longer than the round trip, or every segment gets resent for nothing, but not much longer, or every loss stalls the connection. The standard recipe keeps a smoothed round-trip time and a smoothed variation, and sets the timeout to the smoothed round trip plus four times the variation. The variation term moves by a quarter of each surprise, and then it is multiplied by four.

So try it. Samples of 100, 100, then one slow sample of 400 milliseconds. The timeout goes 300, then 250, then 550. One slow sample more than doubled it. That is deliberate: a path whose round trip has gone erratic gets more slack before TCP declares a packet lost.

Two Linux details matter in production. The standard says the minimum timeout is one second; Linux uses 200 milliseconds and applies that floor to the variation term. So on a LAN, the timeout is roughly the round trip plus 200 milliseconds, and a lost segment that waits for the timer costs hundreds of datacentre round trips. And each consecutive timeout doubles. Linux gives up after 15 retransmissions, about 924 seconds. A peer that vanishes without sending a reset leaves your writes blocked for about 15 minutes, unless you set a user timeout on the socket or an application deadline. Keepalive does not help: its first probe comes after two idle hours.

Most losses never wait for the timer. If segment 2 of 4 is lost, segments 3 and 4 still arrive, and the receiver, acknowledging cumulatively, keeps saying "I still want the byte after segment 1." Three duplicate acknowledgements tell the sender a later segment got through and one is missing, so it retransmits immediately. That is fast retransmit.

Selective acknowledgement, SACK, goes further. Each duplicate acknowledgement also lists the ranges the receiver does hold. In the lesson's trace, a sender loses segments 3 and 6 out of 8, and both holes are repaired within about one round trip. Without SACK, the sender learns about one hole per round trip, so two losses cost two round trips and three cost three.

One more refinement matters for APIs. If the last segments of a response are lost, nothing follows them to generate duplicate acknowledgements. So modern Linux sends a tail loss probe: it re-sends the final segment after about two round trips instead of waiting for the timeout. Tail loss is the common case for request and response traffic.

## Flow control: the receive window

Every acknowledgement also carries a window: how many more bytes the receiver has buffer space for. The sender may never have more than that outstanding. Combined with the congestion window from the next lesson, the rule is simple: bytes in flight are at most the smaller of the two windows. So one connection's throughput is bounded by its window divided by the round trip.

To keep a path busy, the window must cover the bandwidth-delay product, the number of bytes the path holds in flight. A 1 gigabit path with a 70 millisecond round trip holds 8.75 megabytes. Without window scaling, you get 64 kilobytes per round trip, no matter how fat the link.

The advertised window is just free buffer space. Linux autotunes the receive buffer upward as a transfer needs it. But if an application sets its receive buffer size explicitly, autotuning is switched off for that socket, and a "tuned" 256 kilobyte buffer can cap a cross-region transfer far below what the default would have reached. Here is the rule to remember: cross-region replication that is mysteriously slow with no loss is usually a window, not a link.

When a receiver stops reading, a stalled consumer, a full disk, a garbage collection pause, its buffer fills and it advertises a window of zero. The sender stops and sends periodic probes until the window reopens. In a capture, a zero window from one side means that side's application is the bottleneck. The network is idle and innocent.

The same logic tells you who is slow from the kernel's socket listing. Receive queue is bytes that arrived but your process has not read. Send queue is bytes the peer has not acknowledged. A growing receive queue means your application is slow. A growing send queue means the peer or the path is.

## Nagle and delayed ACK: the 40 millisecond stall

Two sensible rules, one on each side. Nagle's algorithm on the sender: while any sent data is unacknowledged, hold small writes until the acknowledgement arrives or a full segment accumulates. That stops a chatty program flooding the network with tiny packets. Delayed acknowledgement on the receiver: hold the acknowledgement for up to 40 milliseconds on Linux, 200 on Windows, hoping to piggyback it on a response.

Now picture a client that writes a request header, then writes the body, then waits for a reply. Before I tell you, what happens to that second write?

[pause]

The header goes out at once. The body is small and the header is unacknowledged, so Nagle holds it. The server has the header but needs the body before it can reply, so it has nothing to piggyback on, and it delays its acknowledgement. Each side is waiting for the other until the delayed acknowledgement timer fires. That is the 41 millisecond RPC: 1 millisecond of work plus one timer.

The lesson reproduced it on loopback. With Nagle on and two writes, the median request took 44 milliseconds. With Nagle disabled, 0.26 milliseconds. With one combined write and Nagle still on, 0.21. And the very first request was fast, because a new Linux connection starts by acknowledging immediately and only later switches to delaying. That is why the bug hides in short tests.

The fixes, in order. Write once: build the whole message in a buffer, which also halves your system calls. Or disable Nagle with TCP no-delay; Go sets it by default, as do most RPC libraries and HTTP clients, but check yours rather than assume. If a latency histogram has a mode at 40 or 200 milliseconds that does not move with load, suspect this before anything else.

## Closing: TIME WAIT, close wait and port exhaustion

A FIN closes one direction only; a reset aborts both and throws away unsent data. The side that closes first ends up in TIME WAIT, for a fixed 60 seconds on Linux. It exists so someone is still there to acknowledge a retransmitted FIN, and so a new connection on the same addresses and ports cannot accept a delayed segment from the old one.

It costs a port. Linux's default ephemeral range is 28,232 ports. A client that connects to one backend address and port, and closes first, locks each port for 60 seconds. 28,232 divided by 60 is about 470 new connections a second. That is the proxy from the opening: a fresh connection per request to its single backend, and a ceiling at 470.

The fixes, best first. Reuse connections with keep-alive and pooling, which also removes a handshake per request. Let the server close first where the protocol allows. Widen the space with more backend addresses or source addresses, or a wider port range. There is a setting that lets new outgoing connections reuse a TIME WAIT port when timestamps prove the new segments are newer. Its older sibling, which recycled ports aggressively, broke clients behind NAT and was removed from Linux in 4.12; any blog post recommending it is out of date. And do not fix TIME WAIT with routine resets on close.

Its mirror image is close wait: the peer has sent FIN, the kernel acknowledged it, and your application has not called close. There is no timer. Thousands of sockets in close wait mean a code path that never releases the socket, a missing cleanup, a response body never closed, and it ends with "too many open files". Close wait is always your bug.

Last, the idle-timeout race. An AWS load balancer keeps idle connections for 60 seconds by default; Node's HTTP server closes idle keep-alive connections after about 5. The backend's FIN can cross the balancer's next request, and that request becomes a 502. Every hop's idle timeout must be longer than the one in front of it.

## In the interview

Here is the follow-up the lesson expects. TIME WAIT is exhausting ports on a proxy. What do you do?

[pause]

Reuse connections first. Then make the server side close where you can, add destination or source addresses, widen the port range, and consider the reuse setting for outgoing connections. Never the removed recycle setting, and never routine resets on close. The common wrong answer is "lower the FIN timeout setting", which controls FIN WAIT 2, not TIME WAIT. On Linux, TIME WAIT is a compiled-in 60 seconds.

And a second one: what does SACK buy you over fast retransmit alone? The sender learns every hole in one round trip and repairs several losses per round trip, instead of one per round trip. The wrong answer is that SACK makes the receiver acknowledge every segment.

## Recap

Read a TCP problem as a state-machine question: which side is in which state, and which timer or queue is involved. Latency at whole seconds is a full accept queue. A flat 40 or 200 milliseconds is Nagle plus delayed acknowledgement. Two minutes is SYNs into a silent firewall.

TIME WAIT sits on the side that closes first, and 28,232 ports over 60 seconds gives roughly 470 new connections a second to one destination. Fix it with connection reuse. Close wait is an application leak, not a kernel tuning problem.

A connection's throughput is its window over the round trip. Do not set the receive buffer by hand, and check the window against the bandwidth-delay product before blaming the link. And set connect, request and idle timeouts yourself, because the kernel's defaults are two minutes, fifteen minutes and two hours.

At your desk: the handshake capture, the RTO table, the SACK and receive-window traces, the Nagle reproduction, reading a connection with ss, and the two exercises on the timeout and the window.
