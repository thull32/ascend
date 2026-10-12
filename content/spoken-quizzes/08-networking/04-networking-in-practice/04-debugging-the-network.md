---
lesson: debugging-the-network
source: 6230f91b4ffa079e
---
## 1

Curl reports, cumulatively, that the TCP connection was ready at 90 milliseconds, TLS at 180, the request ready to send at 181, and the first response byte at 950. Roughly how long did the server take to start responding once the request was sent?

A, about 680 milliseconds: 770 minus one round trip. B, about 950 milliseconds, the whole time to first byte. C, about 180 milliseconds, the time until TLS finished. D, about 90 milliseconds, the same as the TCP handshake.

[think]

The answer is A: about 680 milliseconds: 770 minus one round trip.

The timings are cumulative, so from request ready to first byte is 950 minus 181, about 770 milliseconds. The TCP handshake shows one round trip is about 90 milliseconds, and the request and response need one round trip, so roughly 680 milliseconds is server-side time: queueing, the handler, or its dependencies. Reading 950 milliseconds as server time counts the handshakes twice.

## 2

The mtr tool shows 45 percent loss at hop 6 of 11, and no loss at hops 7 to 11, including the destination. What do you conclude?

A, hop 6 is dropping almost half of the traffic through it. B, the destination host is down or intermittently up. C, the path is asymmetric, so the numbers mean nothing. D, hop 6 is only rate-limiting its replies to probes.

[think]

The answer is D: hop 6 is only rate-limiting its replies to probes.

If hop 6 really dropped forwarded traffic, every later hop and the destination would show at least that much loss. Loss that does not persist downstream is the router's control plane rate-limiting or deprioritising its replies to probes, and traffic through it is fine. Only loss that continues to the destination counts.

## 3

A capture on a server shows client connection attempts arriving and being retransmitted after about a second, with no reply sent in between, and the kernel's listen-overflow counter is rising. What is happening?

A, the server replies with a reset, which is filtered out. B, the client's connection attempts carry a bad TCP checksum. C, a firewall between the hosts drops the server's replies. D, the accept queue is full, so the kernel drops the attempts.

[think]

The answer is D: the accept queue is full, so the kernel drops the attempts.

Listen overflows count connections dropped because the accept queue was full, and the kernel drops the opening packet after the capture's tap, so the capture shows attempts arriving and never answered. A firewall dropping the replies would leave them visible on the server, with no overflow counter. A reset would be visible in the capture, and checksum failures show up in a different counter.

## 4

A pooled HTTP client gets a "remote disconnected" error on the first request after a few idle seconds. A capture shows a close from the server during the idle period, then the client's request, then a reset from the server. What is the fix?

A, enable TCP keepalive probes on the pooled sockets. B, retry every failed request after a short fixed delay. C, make the client's idle timeout shorter than the server's. D, raise the client's read timeout well above the server's.

[think]

The answer is C: make the client's idle timeout shorter than the server's.

The server closed an idle connection, and the client reused it anyway, so the server's kernel had no socket left and answered with a reset. If the client always closes idle connections first, it never writes into one the server has closed. Keepalive probes detect dead peers but do not stop the server's idle close, a longer read timeout does nothing here, and retries help only for idempotent requests, and hide the cause.

## 5

The dig tool returns the correct new address for an internal payments hostname, but the service keeps connecting to the old one. Which is not a plausible explanation?

A, pooled connections opened before the change are still in use. B, a runtime or stub resolver cache is still holding the old answer. C, the authoritative DNS server is returning the old address. D, an entry in the hosts file overrides DNS for the system's lookup function.

[think]

The answer is C: the authoritative DNS server is returning the old address.

Dig has shown that DNS returns the new address, so the authoritative answer is not the problem. The hosts file, local and runtime caches, and long-lived pooled connections all sit between DNS and the process, which is why the right comparison is getent, which resolves names the way the application does.

## 6

A packet capture on a web server marks the checksum of every packet the server sends as incorrect, and shows some outgoing segments of about 64 kilobytes, while clients report no errors. What is happening?

A, offload: the network card finishes the checksums and splits the segments. B, the server's network card is corrupting all outgoing packets. C, the interface MTU is too large for the path to clients. D, an attacker on the path is modifying the packets.

[think]

The answer is A: offload: the network card finishes the checksums and splits the segments.

With transmit offload, the kernel hands the card a placeholder checksum, and, with segmentation offload, one large segment. The hardware computes the real checksum and cuts frames of MTU size after the capture's tap. Real corruption or tampering would appear as checksum failures and retransmissions on the receiving side, and clients see none. An MTU problem would show retransmitted full-size segments, not 64 kilobyte ones that succeed.
