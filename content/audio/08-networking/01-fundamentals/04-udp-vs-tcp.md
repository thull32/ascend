---
lesson: udp-vs-tcp
source: 9993173927f22655
fit: great
desk:
  - "The UDP socket-buffer experiment and its kernel counters"
  - "The head-of-line blocking trace, segment by segment"
  - "The minimal UDP protocol, the XOR parity code and the framing-bug demo"
  - "The NACK trace and the loss-recovery simulation table"
  - "The QUIC Initial packet decoded, and the loss-detection timer table"
  - "Exercise: reassemble length-prefixed messages from a TCP stream"
  - "Exercise: QUIC variable-length integers"
---
## Introduction

A game server sends a player's position 60 times a second. A DNS resolver sends a 29 byte question and wants a 61 byte answer. A video call ships 30 frames a second and would rather drop one than show it late. A database client receives a 2 megabyte result that must arrive complete and in order, or not at all. Two of these want TCP and two want UDP, and the reason is not "TCP is reliable and UDP is fast".

Now a metrics team. Their StatsD collector reports 40 percent less traffic than the services send during peak minutes, and nothing logs an error. Nothing can. Every sender's send call succeeded, and the datagrams were dropped by the collector's own kernel when its socket buffer filled.

The transport layer offers two products. A datagram: a bounded message, sent once, delivered zero or one times, in any order. And a byte stream: an unbounded sequence delivered exactly once, in order, with the sender slowing down when the receiver or the network says so. Reliability is not one feature. It is a set of mechanisms, each with a latency cost, and the choice comes down to which costs your application can afford, or can do better itself.

So: what UDP does and silently does not do, what each TCP mechanism costs, how to recover from loss on a live stream, and how QUIC rebuilds TCP's guarantees on top of UDP.

## UDP: eight bytes and no promises

UDP adds four fields to an IP packet: source port, destination port, length and checksum. Eight bytes. There is no sequence number, so the receiver cannot tell that datagram 7 arrived before 6, or that 6 never arrived. No acknowledgement, so the sender never knows either. And no connection, so the very first datagram carries data.

What you get for that absence: zero round trips to start, so a DNS lookup is one packet each way. Message boundaries: one receive returns exactly one datagram, where TCP's returns "some bytes". No head-of-line blocking: losing datagram 6 does not delay datagram 7. And multicast.

What you pay: loss and reordering are yours to handle. There is no congestion control; a UDP sender pushing 100 megabits a second into a 10 megabit link loses 90 percent of its packets and starves every TCP flow sharing that link. Size is bounded by the path, so real protocols keep datagrams near 1,200 bytes. And middleboxes distrust UDP: many NATs expire idle UDP mappings in about 30 seconds, against hours or days for TCP, and some networks drop UDP that is not DNS.

Now back to the metrics team. Every UDP socket has a receive queue with a fixed size, about 213 thousand bytes by default on the lesson's machine. When a datagram arrives and the queue is full, the kernel drops it and increments a counter, and nothing is sent back. The lesson's experiment sent 5,000 datagrams of 1,000 bytes to a socket that was not reading yet. Every send succeeded. The application later read 123. The other 4,877 were dropped.

Why only 123, and not 212? Because the kernel charges each queued datagram its full buffer footprint, about 1.7 kilobytes here, not its payload size. In production, the diagnosis is the same: the receive buffer errors counter, climbing. The fixes are a larger buffer, more reader sockets with the kernel spreading datagrams across them, and less work per datagram. Not "switch to TCP", which just moves the stall into the senders.

## What TCP costs, mechanism by mechanism

Think of TCP as a bill with five or six items.

Both sides agreeing a connection exists is the three-way handshake: one round trip before the first request byte. Every byte arriving means sequence numbers, acknowledgements and retransmission: a lost segment costs at least one round trip, or a retransmission timeout of 200 milliseconds or more. Bytes arriving in order means head-of-line blocking: one loss delays every later byte. Not overrunning the receiver caps throughput at the window divided by the round trip. Not overrunning the network means congestion control: the first round trips carry only about 14 kilobytes, and throughput halves or worse on loss. And a clean close leaves the closing side holding a socket for 60 seconds.

Measured from the lesson's machine to example.com: the TCP connection completed about 50 milliseconds after DNS, the TLS handshake about 60 milliseconds after that, and the first response byte about 60 milliseconds later. Three round trips before any content. A UDP request and reply would have cost one. Reusing the connection brings later requests back to one round trip, which is why connection pooling matters more than most engineers assume.

Now head-of-line blocking. A server sends four segments over a path with a 50 millisecond round trip, and segment 2 is lost. At 25 milliseconds, segments 1, 3 and 4 arrive. The application can read segment 1. Segments 3 and 4 sit in the kernel, because there is a gap. The sender notices the loss, retransmits, and segment 2 arrives at about 87 milliseconds. Only then does the kernel release everything.

For about 60 milliseconds, three quarters of the data sat in the client's kernel and the application saw none of it. And with only one or two segments in flight there are too few duplicate acknowledgements to trigger a fast retransmit, so recovery waits for the timeout, 200 milliseconds minimum on Linux. For a file download, this is harmless: the bytes are useless until complete. For a video call, it is fatal: three frames arrived on time, and the transport hides them behind a fourth that is already stale. In-order delivery is the single property that pushes real-time media onto UDP.

One more TCP trap, the other way round. Write two 100 byte messages to a TCP socket, and the receiver's single read can return 200 bytes, both messages merged. TCP is a byte stream; the receive queue has no memory of your write boundaries. Every TCP protocol needs framing, a length prefix or a delimiter. The UDP version of the same bug is assuming a successful send means delivery, when it only means the kernel accepted the datagram.

## Choosing a transport

Ask two questions. Is every byte required? And is a late byte worth as much as an on-time one? If both answers are yes, use TCP. If either is no, UDP with an application protocol on top is worth considering.

So database protocols, HTTP and SSH use TCP. DNS uses UDP, because a handshake would triple the cost of one question and one answer, and it falls back to TCP for large answers. Voice and video use UDP, because a frame 200 milliseconds late is worthless. Game state uses UDP, because the newest position supersedes older ones. And on unknown corporate networks, UDP is blocked often enough that you need a TCP fallback.

If you find yourself adding sequence numbers, acknowledgements and retransmission of every message to a UDP protocol, you are rebuilding TCP, usually without its congestion control. The legitimate reason to build on UDP is a different reliability policy: partial reliability, per-message deadlines, independent streams. The lesson's minimal protocol needs just 16 bytes of header: a sequence number to detect gaps and drop stale datagrams, the highest number seen from the peer so the sender can measure loss, and a timestamp for round trip and jitter. That gives the application the information TCP has, without TCP's policy of stalling on every gap. It must also control its rate. A UDP sender with no feedback loop is a denial-of-service tool.

## Recovering loss on a live stream

The lesson works one design problem in detail. A live stream sends a packet every 5 milliseconds, the round trip is about 60 milliseconds, and each packet is useful only if it arrives within 150 milliseconds of being sent. Loss averages 2 percent. You have two tools. Ask for a lost packet again, a NACK. Or send redundancy in advance, forward error correction.

The NACK's budget. The receiver never sees a loss, only a later sequence number, so it waits 10 milliseconds of reorder tolerance before asking, because jitter can deliver packets slightly out of order. Then the request travels to the sender and the repair travels back. Worst case, 129 milliseconds. One round fits inside 150. At a 120 millisecond round trip, the sum is 219, and every repair arrives too late.

Forward error correction with XOR parity sends one extra packet per group, say one per 10. Any single missing packet in the group can be rebuilt from the parity and the survivors. It costs 10 percent of bandwidth even when nothing is lost, but it needs no round trip.

The lesson simulated both on 400 thousand packets, with the same 2 percent average loss arriving two ways: randomly, or in bursts. Before I give you the result: parity at 10 percent overhead, five times the loss rate. How much of the bursty loss does it repair?

[pause]

8 percent. Under random loss, it repairs 82 percent. Under bursty loss, 71 percent of groups that lose a packet lose a second one, and one parity packet cannot rebuild two. FEC sized for the average fails on bursts.

NACK wins while the round trip fits, at a fifth of FEC's overhead, and it survives bursts because a repair 80 milliseconds later usually misses the burst. A TCP-like policy, in order with retransmission, missed the deadline for 0.39 percent of packets at a 60 millisecond round trip, nearly five times NACK's rate, and 25.8 percent at 120, because each loss stalls the packets behind it. The budget decides, not the media. Netflix's on-demand player buffers tens of seconds, which absorbs any retransmission timeout, so it uses TCP.

## QUIC: TCP's guarantees, rebuilt over UDP

QUIC is the strongest evidence that the choice is about where reliability lives. It runs over UDP because middleboxes pass UDP and drop unknown protocols, and UDP adds nothing but ports. On top, it fixes things TCP cannot change.

Streams: reliable, ordered delivery per stream, so a lost packet stalls only the streams whose data it carried. HTTP 3 puts each request on its own stream. Packet numbers never repeat: a retransmission carries the lost data in a new packet with a new number, so an acknowledgement is never ambiguous about which copy it acknowledges. The transport and TLS handshakes run together, one round trip for a new connection and zero on resumption. Almost everything is encrypted, so middleboxes cannot ossify it. Connections are identified by IDs, not addresses and ports, so a phone moving from Wi-Fi to mobile keeps its connection. And a client's first packet must be padded to at least 1,200 bytes, while a server may send at most three times what it has received from an unvalidated address, so QUIC servers cannot be used to reflect floods.

It also detects a lost final packet faster. Only a timer can find that loss. At a 60 millisecond round trip, QUIC probes at 105 milliseconds and keeps its congestion window. Linux TCP's retransmission timeout fires at 260 and resets its window to one segment, because Linux puts a 200 millisecond floor under it.

The cost is that all of this runs in user space. Google's 2017 paper reported its servers first used about 3.5 times the CPU of TLS over TCP to serve YouTube, and about twice after optimisation. Kernel batching for UDP has narrowed the gap since, and the remaining difference is one reason large CDNs rolled HTTP 3 out gradually.

## In the interview

Expect this one: why does HTTP 3 use UDP instead of fixing TCP?

[pause]

TCP is implemented in kernels and inspected by middleboxes, so changing its behaviour, per-stream delivery or a new handshake, would take a decade and break on boxes that drop unknown options. UDP is deployable everywhere and empty, so QUIC can implement streams, loss recovery and encryption in user space and ship with the application. The wrong answer is "UDP is faster than TCP".

And a design question: loss recovery for a live stream with a 150 millisecond deadline and 2 percent loss. Start from the budget. A NACK round costs detection, a round trip and a one-way trip, 129 milliseconds worst case at a 60 millisecond round trip, so NACK fits for 2 percent extra traffic. Above about a 75 millisecond round trip, forward error correction must take over, sized from measured loss runs, because bursts defeat it. Wrong answers: "use TCP", or "FEC at the loss rate".

## Recap

Four things to remember. UDP drops happen silently in the receiver's socket buffer; watch the receive buffer errors counter, not the senders' success. TCP is a bill: a round trip for the handshake, two more with TLS before the first byte, and head-of-line blocking that holds on-time data behind a loss, which is what pushes real-time media to UDP. TCP is a byte stream, so frame your messages, every time. And pick loss recovery from the deadline budget and the loss pattern: NACK while the round trip fits, FEC sized from bursts, and QUIC when you want TCP's guarantees per stream.

At your desk: the socket-buffer experiment, the head-of-line trace, the NACK trace and the simulation table, the QUIC packet decoded byte by byte, and the two exercises, a length-prefix deframer and QUIC's variable-length integers.
