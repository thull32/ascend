---
lesson: error-detection
source: f62c52e56a7919f9
---
## 1

A buggy copy routine swaps two adjacent 16-bit words inside a UDP payload. Which check detects it?

A, the UDP checksum, because it covers every payload byte. B, the next link's Ethernet CRC, computed over the frame. C, neither the UDP checksum nor a CRC computed after the swap. D, the IPv4 header checksum, recomputed at each router.

[think]

The answer is C: neither the UDP checksum nor a CRC computed after the swap.

One's complement addition is commutative, so swapped words give the same UDP checksum; the lesson's simulation missed every single swap. If the swap happened in host memory before transmission, the network card computes a valid Ethernet CRC over the already-corrupted frame, and the IPv4 checksum covers only the header. Only an end-to-end check computed before the bug, such as an application checksum or TLS, would notice.

## 2

Two bits flip in a packet: bit 3 of one 16-bit word goes from 0 to 1, and bit 3 of another word goes from 1 to 0. What happens?

A, both miss it, as two-bit errors cancel in any code. B, both the checksum and CRC-32 catch it every time. C, the Internet checksum misses it, and CRC-32 catches it. D, CRC-32 misses it, and the Internet checksum catches it.

[think]

The answer is C: the Internet checksum misses it, and CRC-32 catches it.

The sum gains 8 in one word and loses 8 in the other, so the Internet checksum is unchanged. About 1 in 32 random two-bit errors has this shape, which is the 3 percent the simulation measured. CRC-32 detects every two-bit error within any realistic frame length, because its generator polynomial cannot divide such an error there.

## 3

Why must every IPv4 router update the header checksum, but not the TCP checksum?

A, each hop's network card recomputes the TCP checksum in hardware. B, the TTL changes, and the IPv4 checksum covers only the header. C, routers are not permitted to read the TCP header at all. D, TCP checksums are optional, so routers may skip them.

[think]

The answer is B: the TTL changes, and the IPv4 checksum covers only the header.

The TTL is in the IP header and changes at every hop, and the IPv4 checksum covers only that header, so it must change with it, incrementally. The TCP checksum covers a pseudo-header, the TCP header and the data, none of which a plain router modifies. A NAT does modify addresses and ports, which is why it must patch the TCP checksum too.

## 4

A CRC whose generator polynomial has degree 32 is guaranteed to detect which of these?

A, any error that flips exactly 64 scattered bits. B, any burst of 32 or fewer consecutive flipped bits. C, any error at all, of any length or pattern. D, any change by an attacker who cannot see the data.

[think]

The answer is B: any burst of 32 or fewer consecutive flipped bits.

An undetected error must be a multiple of the generator, and a burst of length at most 32 cannot be. Longer or scattered errors are caught with a probability of all but 1 in 2 to the 32nd, not with certainty. And a CRC is linear, so an attacker can fix it up for any chosen bit flips without seeing the data.

## 5

To detect tampering, you append the SHA-256 hash of each message to the message itself, on a plaintext TCP connection. What is wrong?

A, SHA-256 is too slow to run on every message. B, anyone can recompute the hash, so you should use a MAC. C, SHA-256 cannot detect errors of a single bit. D, nothing, because SHA-256 is collision-resistant.

[think]

The answer is B: anyone can recompute the hash, so you should use a MAC.

A hash detects accidental corruption, and lets you compare against a digest you already trust, but on the same channel it provides no authenticity: anyone who can modify the message can recompute the hash. A keyed MAC, such as HMAC or an authenticated cipher, binds the tag to a secret key, and that is what TLS does for every record. Speed is not the issue: SHA-256 ran at 2.8 gigabytes per second on the lesson's machine.

## 6

A host's TLS connections to one storage node fail intermittently with bad record MAC errors, while its connections to other nodes are fine. What is the most likely class of cause?

A, corruption on that path that TCP did not catch. B, congestion control backing off on that path. C, DNS resolving that node's name to the wrong host. D, the storage node's certificate has expired.

[think]

The answer is A: corruption on that path that TCP did not catch.

The authentication tag fails when record bytes change after encryption. Certificate and DNS problems fail at handshake time, not mid-stream, and congestion causes delay, not bad records. Bad record MAC errors confined to one node are a classic symptom of hardware or middlebox corruption, a faulty network card, memory or switch, that the 16-bit TCP checksum let through.
