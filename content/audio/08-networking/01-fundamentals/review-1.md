---
review: fundamentals
source: 1d8ecd6d7a47b880
---
## Introduction

Twelve questions from the networking fundamentals module. Answer out loud before the answer comes.

They run in the order of the lessons: layers and packet sizes, routing, DNS, UDP and TCP, the TCP state machine, congestion control, TLS, and NAT in the cloud. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A WireGuard tunnel has an MTU of 1420 bytes. A client behind it completes the TCP and TLS handshakes with a web server and receives small pages fine, but any response over about 1.4 kilobytes hangs forever. Ping works. What is the most likely cause?

A, the TLS cipher suite produces records that cannot cross the tunnel. B, the tunnel fragments packets and the client fails to reassemble them. C, the server's TCP receive window is too small to carry large bodies. D, the ICMP "fragmentation needed" message is filtered, so path MTU discovery never shrinks the segment size.

[think]

The answer is D: the "fragmentation needed" message is filtered, so path MTU discovery never shrinks the segment size.

Handshake packets and small responses fit under 1420 and pass. Full-size segments marked "don't fragment" are dropped at the tunnel, and the ICMP message that would lower the server's segment size never arrives, so the server keeps retransmitting segments that never get through. With fragmentation, the transfer would be slower, not dead. The fix is clamping the segment size on the gateway, a lower tunnel MTU, or allowing that ICMP message through.

## Question 2

In 2008, an ISP announced a slash-24 inside YouTube's address space, while YouTube itself announced the larger slash-22 that contained it. Why did traffic for YouTube's addresses in that slash-24 follow the rogue announcement?

A, the rogue ISP withdrew YouTube's slash-22 with a forged message. B, longest-prefix match prefers the slash-24 wherever both routes are heard. C, RPKI validation marked YouTube's own announcement as invalid. D, the rogue path had fewer AS hops, so BGP selection preferred it.

[think]

The answer is B: longest-prefix match prefers the slash-24 wherever both routes are heard.

Forwarding picks the most specific matching prefix before any BGP comparison between the two routes matters, because they are different prefixes. Nothing was withdrawn. And RPKI, which did not exist in deployable form then, would have marked the rogue origin invalid, not YouTube's. Announcing your own slash-24s is the emergency countermeasure.

## Question 3

You change a DNS A record with a 60-second TTL to point at a new server. Fifteen minutes later, a Python service using a persistent HTTP connection pool is still sending requests to the old server. Which explanation fits?

A, the recursive resolver is ignoring the record's TTL. B, the old server is proxying requests on behalf of the new one. C, the pooled connections were opened before the change and never re-resolve. D, Python's socket module caches DNS answers for an hour by default.

[think]

The answer is C: the pooled connections predate the change and never re-resolve.

DNS is consulted only when a new connection is created. Warm connections opened before the change stay valid until they close, so the TTL controls resolvers, not sockets. Python's socket module caches nothing. The fixes are a maximum connection lifetime, draining the pool on failover, or making the old server fail fast.

## Question 4

A service occasionally takes almost exactly 5 seconds longer than usual to start a request, then proceeds normally. What is the most likely cause?

A, TCP slow start delaying the first bytes on each connection. B, the first configured DNS resolver is down, and the system resolver waits 5 seconds for it. C, a CNAME chain with five links, costing one second per link. D, the TLS certificate chain being re-validated with the certificate authority.

[think]

The answer is B: the first resolver is down, and the system resolver waits 5 seconds for it.

The standard C library's resolver waits its default 5-second timeout on the first nameserver before trying the next. So every uncached lookup pays a fixed 5 seconds while the first one is unreachable. CNAME links cost milliseconds, slow start costs round trips, and certificate checks do not produce a fixed 5-second pause.

## Question 5

A voice-over-IP application is built on TCP. During a burst of 1 percent packet loss, users hear the audio freeze for a fraction of a second at a time, even though almost all packets arrived. Which TCP property is responsible?

A, the three-way handshake is repeated after every loss. B, in-order delivery holds frames that arrived behind the lost one. C, the checksum rejects audio frames with minor bit errors. D, the receive window is too small for continuous audio.

[think]

The answer is B: in-order delivery holds frames that arrived behind the lost one.

Bytes after a gap cannot be delivered until the gap is filled, which costs at least a round trip, and sometimes a 200 millisecond retransmission timeout. So on-time frames wait in the kernel behind a stale one. Handshakes happen once per connection. UDP with a jitter buffer plays what arrived and conceals what did not.

## Question 6

A StatsD collector receives 40 percent fewer metrics than the services send at peak, and no errors are logged anywhere. What should you check first?

A, the collector's TLS session cache, which may be evicting clients. B, TCP retransmission counters on the collector's listening connection. C, the return values of the senders' send calls, since failures would be reported there. D, the receive-buffer error counter on the collector, since a full socket buffer drops datagrams silently.

[think]

The answer is D: the receive-buffer error counter on the collector, since a full socket buffer drops silently.

When a UDP socket's receive queue is full, the kernel drops the datagram and increments that counter. The sender's send call has already returned success, so nothing reports the loss. In the lesson's experiment, 4,877 of 5,000 datagrams were dropped this way. And StatsD over UDP has no TCP connection or TLS session to inspect.

## Question 7

Connecting to port 5432 on host A fails instantly with "connection refused". Connecting to port 5432 on host B hangs for about two minutes and then times out. What is the likely difference?

A, host B advertises a much larger receive window than A. B, host A has SYN cookies enabled and B does not. C, A has no listener and answers with a reset, while B's connection attempts are silently dropped. D, host B is overloaded and cannot accept new connections.

[think]

The answer is C: A has no listener and sends a reset, while B's attempts are silently dropped.

A port with no listener makes the kernel reply with a reset, which produces "connection refused" in one round trip. A firewall or security group that silently drops the opening packet produces retransmissions with growing gaps until the retry budget runs out, a little over two minutes on Linux defaults. An overloaded host would not fail at a fixed two minutes. That is why clients need an explicit connect timeout.

## Question 8

Your service has 9,000 sockets in the close-wait state and is approaching its file-descriptor limit. Which statement is true?

A, the kernel will reap close-wait sockets after 60 seconds. B, your code received the peer's close but never called close itself. C, Nagle's algorithm is holding the sockets' final close. D, peers never sent their final acknowledgement, so shorten time-wait.

[think]

The answer is B: your code received the peer's close but never called close itself.

Close-wait means the remote side has closed and the local application has not. There is no kernel timer for it. Time-wait is the state on the side that closes first and has nothing to do with this. The fix is in the code path that should close the socket, typically an unclosed response body or a missing cleanup path.

## Question 9

During a large upload, ping from the same laptop rises from 20 milliseconds to 600, and falls back to 20 when the upload finishes. There is almost no packet loss. What is the best explanation and fix?

A, the upload uses UDP, which is starving the TCP flows. B, the Wi-Fi signal is weak, so move closer to the router. C, the ISP is throttling ping during the upload, so ignore it. D, bufferbloat in the home router, so enable flow-queueing queue management there.

[think]

The answer is D: bufferbloat in the home router; enable flow-queueing active queue management there.

Delay that tracks load without loss is queueing. A loss-based sender keeps an oversized buffer in the router or modem full, creating a standing queue that every packet waits behind. Active queue management with flow queueing on the bottleneck device drops or marks early, and isolates the ping and the video call from the bulk flow. A weak signal would cause loss and variable delay whether or not the upload was running.

## Question 10

You switch your origin servers' congestion control from Cubic to BBR. Which effect should you expect?

A, lower CPU usage on the clients receiving the data. B, no change unless the clients also switch to BBR. C, better downloads for users on lossy or bloated paths. D, faster uploads from users' browsers to your servers.

[think]

The answer is C: better downloads for users on lossy or bloated paths.

Congestion control is chosen and run by the sender alone; there is no negotiation. Server-to-client traffic uses the server's algorithm, so downloads on lossy or bloated paths get faster and see less queueing. Client uploads still use the algorithm of the client's operating system.

## Question 11

After a certificate renewal, the website loads in Chrome, but a Go service calling the same API fails with "certificate signed by unknown authority". An OpenSSL client connection shows only one certificate in the chain. What is wrong?

A, the Go service's clock is wrong, so the certificate looks invalid. B, the renewed certificate expired before it was deployed. C, the server omits the intermediate certificate. D, the Go service needs a newer TLS version to connect.

[think]

The answer is C: the server omits the intermediate certificate.

A single certificate in the chain means the intermediate is missing. Chrome fetches it from the address in the certificate, and Firefox preloads intermediates, which masks the problem. Go, Java, curl, Python and mobile clients require the server to send it, so they cannot build a path to a trusted root. An expired certificate would produce a date error, not "unknown authority". Serve the full chain.

## Question 12

A service in a private subnet keeps a pool of idle connections to a partner API through an AWS NAT gateway. After quiet periods, the first requests fail with connection resets. What is the most likely cause?

A, the NAT gateway expired the idle mappings before any keepalive was sent. B, the partner's TLS session tickets expired during the quiet period. C, the pool's DNS cache kept an old address for the partner's endpoint. D, the NAT gateway ran out of ports while the pool was idle.

[think]

The answer is A: the NAT gateway expired the idle mappings before any keepalive was sent.

AWS NAT gateways drop a TCP mapping after 350 seconds of inactivity and reset the next packet on it, while Linux sends its first keepalive only after two hours by default. Set keepalives or pool idle limits below that timer. Expired tickets cost a full handshake, not a reset, and running out of ports needs many active flows, not idle ones.

## Recap

Three ideas kept coming back. Silent drops are the hardest failures: a filtered ICMP message, a full UDP buffer, a firewall that never answers. Each looks like a hang or missing data, not an error. State lives in more places than you think: pooled connections outlive DNS changes, NAT gateways forget idle flows, and sockets your code never closed pile up. And TCP's guarantees have costs you can name: in-order delivery stalls everything behind one loss, and the sender alone decides how fast to go.
