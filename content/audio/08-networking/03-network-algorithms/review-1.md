---
review: network-algorithms
source: cb0151b9e6f71e42
---
## Introduction

Twelve questions from the network-algorithms module. Answer out loud before the answer comes.

They run in the order of the lessons: routing, reliable delivery, error detection, rate limiting, and consistent hashing. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

In an OSPF area, a link fails. Which of these most directly decides how long it takes until every router forwards around it?

A, the number of autonomous systems in the route's path. B, failure detection plus the deliberate delay before the shortest-path calculation. C, the 30-second periodic distance-vector update. D, the count-to-infinity bound of 16 from RIP.

[think]

The answer is B: failure detection plus the deliberate delay before the shortest-path calculation.

Link-state convergence is detection time, from hellos or BFD, plus flooding, plus that deliberate delay, plus programming the forwarding table. The Dijkstra run itself takes around a millisecond for a thousand routers. The 30-second update and the cap of 16 belong to RIP, and the path of autonomous systems belongs to BGP.

## Question 2

Two routes to the same prefix reach a BGP router. Route X has a path two autonomous systems long and a local preference of 100, from a transit provider. Route Y has a path five long and a local preference of 200, from a paying customer. Which one is installed?

A, both, load-shared across them with equal-cost multipath. B, X, because a shorter path means lower latency. C, whichever of the two routes arrived first. D, Y, because local preference is compared before path length.

[think]

The answer is D: Y, because local preference is compared before path length.

Local preference is the first rung of the ladder that operators normally set, and it encodes business policy: customer routes earn money. Path length only breaks ties among routes with equal local preference, and it never measured latency. Multipath across different paths is not the default.

## Question 3

A protocol uses 4-bit sequence numbers, so sixteen values. What are the largest safe windows for Go-Back-N and for Selective Repeat?

A, 16 and 16. B, 15 and 15. C, 8 and 15. D, 15 and 8.

[think]

The answer is D: 15 for Go-Back-N, and 8 for Selective Repeat.

The sender's window plus the receiver's window must be at most 16. Go-Back-N's receiver window is one, so its window can be 15. Selective Repeat's receiver window equals the sender's, so twice the window is at most 16, and the window is 8. With 9, the receiver's advanced window could contain the sequence number of a retransmitted old frame and accept it as new data.

## Question 4

Your service writes an order to a TCP socket, the write returns, and the peer's TCP stack acknowledges every byte. Then the peer process crashes. What do you know?

A, the acknowledgement proves the process read the bytes before crashing. B, only that the bytes reached the peer's kernel buffer. C, TCP will redeliver the order once the peer restarts. D, the order was processed, because TCP is reliable.

[think]

The answer is B: only that the bytes reached the peer's kernel buffer.

TCP's reliability ends at the receiving kernel. The acknowledgement says the bytes are in the receive buffer, not that the application read them. Delivery to the application needs its own acknowledgement, such as a response, a committed offset or a queue ack, and its own deduplication. That is the end-to-end argument, and it is why message queues rebuild acknowledgements and timers above TCP.

## Question 5

A buggy copy routine swaps two adjacent 16-bit words inside a UDP payload. Which check detects it?

A, the UDP checksum, because it covers every payload byte. B, the next link's Ethernet CRC, computed over the frame. C, neither the UDP checksum nor a CRC computed after the swap. D, the IPv4 header checksum, recomputed at each router.

[think]

The answer is C: neither the UDP checksum nor a CRC computed after the swap.

One's complement addition does not care about order, so swapped words give the same UDP checksum; the lesson's simulation missed every single swap. If the swap happened in host memory before transmission, the network card computes a valid Ethernet CRC over the already-corrupted frame. The IPv4 checksum covers only the header. Only an end-to-end check computed before the bug, an application checksum or TLS, would notice.

## Question 6

To detect tampering, you append the SHA-256 hash of each message to the message itself, on a plaintext TCP connection. What is wrong?

A, SHA-256 is too slow to run on every message. B, anyone can recompute the hash, so you should use a MAC. C, SHA-256 cannot detect errors of a single bit. D, nothing, because SHA-256 is collision-resistant.

[think]

The answer is B: anyone can recompute the hash, so you should use a MAC.

A hash detects accidental corruption, and lets you compare against a digest you already trust. On the same channel it provides no authenticity: whoever can modify the message can recompute the hash. A keyed MAC, HMAC or an authenticated cipher, binds the tag to a secret key, and that is what TLS does for every record. Speed is not the issue: SHA-256 ran at 2.8 gigabytes a second on the lesson's machine.

## Question 7

A host's TLS connections to one storage node fail intermittently with bad record MAC errors, while its connections to other nodes are fine. What is the most likely class of cause?

A, corruption on that path that TCP did not catch. B, congestion control backing off on that path. C, DNS resolving that node's name to the wrong host. D, the storage node's certificate has expired.

[think]

The answer is A: corruption on that path that TCP did not catch.

The authentication tag fails when a record's bytes change after encryption. Certificate and DNS problems fail at handshake time, not mid-stream, and congestion causes delay, not bad records. Bad record MAC errors localised to one node are a classic symptom of hardware or middlebox corruption, a faulty network card, memory or switch, that the 16-bit TCP checksum let through.

## Question 8

A fixed window limiter allows 100 requests per minute per client. What is the most a client can get through in any two-second interval?

A, 200. B, about 3. C, unlimited. D, 100.

[think]

The answer is A: 200.

Send 100 in the last second of one window and 100 in the first second of the next. Both windows are within their limit, and 200 requests land within two seconds. Sliding windows, token buckets and GCRA do not have this boundary effect.

## Question 9

You put a leaky bucket queue that holds 50 requests and drains at 10 requests a second in front of a fragile service. What is the main new risk?

A, the service now receives bursts of up to 50 requests at once. B, memory grows without bound because the queue never fully drains. C, queued requests are processed out of order when the queue fills. D, queued requests can wait about 5 seconds, past many clients' timeouts.

[think]

The answer is D: queued requests can wait about 5 seconds, past many clients' timeouts.

A shaping queue converts bursts into delay. The last of 50 queued requests waits about 50 divided by 10, so 5 seconds, holding its connection the whole time. If the client's timeout is shorter, the work is wasted and probably retried. The service itself sees a steady 10 a second, never the burst, and the queue is bounded at 50. Size the queue by the delay you can accept.

## Question 10

Forty gateway instances share a Redis token bucket per API key, and each instance passes its own clock reading into the Lua script. One host's clock drifts by 100 milliseconds. When does this matter most?

A, only while the Redis primary is failing over to a replica. B, at 1,200 per minute, where 100 milliseconds is the spacing of two requests. C, never, because the Lua script makes the update atomic. D, at 10 per minute, where the 6-second interval magnifies the skew.

[think]

The answer is B: at 1,200 per minute, where 100 milliseconds is the spacing of two requests.

Skew misstates how far ahead of schedule a client is by about the skew divided by the emission interval, so it matters when that interval is small. At 1,200 a minute the interval is 50 milliseconds, so 100 milliseconds is worth two requests. At 10 a minute the interval is 6 seconds, and the skew is negligible. Atomicity prevents interleaving, not wrong inputs. Reading the Redis server's own time inside the script gives every decision one clock.

## Question 11

A cache tier grows from 10 to 11 servers, and clients choose a server with the key's hash modulo N. Roughly what fraction of keys now map to a different server?

A, about 0 percent. B, about 50 percent. C, about 9 percent. D, about 91 percent.

[think]

The answer is D: about 91 percent.

A key keeps its server only when its hash leaves the same remainder modulo 10 and modulo 11, which holds for one value in eleven, however good the hash is. So about ten keys in eleven move, and the lesson's simulation moved 91 percent. The hit rate collapses. A consistent hash moves only about one key in eleven, all of them onto the new server.

## Question 12

Using rendezvous hashing across 8 nodes, you remove one node. Where do its keys go?

A, all to the node with the next-highest name. B, to a randomly chosen survivor on each request. C, they are rehashed across the rest with modulo 7. D, each to its own runner-up, spread across all 7 survivors.

[think]

The answer is D: each to its own runner-up, spread across all 7 survivors.

Every key has a full ranking of nodes by score. Removing the winner promotes that key's runner-up, and runners-up are independent across keys, so the load spreads evenly across all 7 survivors without virtual nodes. Keys owned by the other nodes do not move at all.

## Recap

Three ideas kept coming back. First, know exactly what a mechanism guarantees: an OSPF network converges only as fast as it detects, a TCP acknowledgement reaches only the peer's kernel, and the Internet checksum cannot see a swap. Second, every algorithm here is a trade you should be able to name: Selective Repeat's memory against Go-Back-N's resends, a queue's delay against a bucket's rejections, BGP's policy against shortest paths. And third, the details that look minor, a window boundary, one host's clock, the formula that picks a server, are where systems fail at scale.
