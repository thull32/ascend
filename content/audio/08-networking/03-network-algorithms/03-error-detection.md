---
lesson: error-detection
source: ae16fd82d48392b7
fit: partial
desk:
  - "The IPv4 header and UDP checksums summed by hand on the captured packet"
  - "The CRC long division and the CRC-32 trace of one byte"
  - "The measured miss table, the comparison table of checks and the per-layer table"
  - "Exercises: compute the Internet checksum and implement CRC-32"
---
## Introduction

Bits flip. A marginal optic turns a 1 into a 0 on the wire, a cosmic ray hits a router's packet buffer, a NIC firmware bug corrupts a memory transfer, a laptop's memory without error correction holds a socket buffer a few milliseconds too long. None of these announce themselves. The receiver gets a packet that looks exactly like a packet, and unless something along the way was checking, your service parses it, stores it and serves it back.

The canonical story is Amazon S3's outage of about eight hours on 20 July 2008. A handful of internal state messages had a single corrupted bit. The messages carried no checksum, and the corrupted state spread through the system's gossip protocol until the cluster could not function. Among the fixes: adding checksums to those messages.

All error detection works the same way. The sender computes a short check value from the data and sends it along. The receiver recomputes it over what arrived and compares. An error goes undetected only if the corrupted data happens to produce the same check value. The schemes differ in which errors are guaranteed to be caught, how likely a random error is to slip through, how fast they run, and whether they survive someone who is trying. Four checks in order of strength: parity, the Internet checksum, the CRC, and cryptographic hashes and MACs. Then the question that matters most: which layer actually verifies your bytes.

## Parity and the error pattern

The smallest check is one parity bit: the XOR of all the data bits. Flip one bit in transit and the count of 1s goes odd: detected. Flip two and it is even again: undetected. Parity catches every odd number of flipped bits and no even number.

Here is the idea that unlocks the rest. XOR what was sent with what arrived and you get the error pattern: a 1 wherever a bit flipped. A check detects an error exactly when it treats that pattern as different from zero. Parity is blind to any pattern with an even number of 1s.

There is a second axis. Detection tells you the data is bad; correction, with Hamming codes or Reed-Solomon, adds enough redundancy to repair it. ECC memory uses 8 check bits per 64 data bits to correct a single error and detect a double one. Networks mostly detect and retransmit, because a round trip is cheap. Where it is not, on satellite links, live video and storage media, forward error correction does the work.

## The Internet checksum

IPv4, ICMP, UDP and TCP all use the same 16-bit check. Treat the data as 16-bit words. Add them with one's complement addition, which means that whenever the sum overflows 16 bits, the carry wraps around and is added back into the low bit. Then flip every bit of the result. The receiver sums everything, checksum included, and if nothing changed the total is all ones.

The lesson verifies this by hand on a real captured packet, and that walk is for your desk. What matters by ear is why such a strange sum was chosen in the 1970s. It is byte-order independent: sum the words with their bytes swapped and you get the byte-swapped sum, so a little-endian machine never swaps individual words. It updates incrementally: every router decrements the TTL, which changes the header, and the checksum can be patched with three additions instead of re-summing. And it is cheap.

The UDP and TCP checksums also cover a pseudo-header holding the source and destination addresses. So a datagram delivered to the wrong host fails the check, and every NAT that rewrites an address or port must patch the checksum too.

Now its weaknesses. The lesson corrupted a random 256-byte packet 200 thousand times for each kind of error and checked whether the Internet checksum and CRC-32 still matched. Before I tell you: if two 16-bit words in the packet swap places, how often does the Internet checksum notice?

[pause]

Never. It missed all 200 thousand, because addition does not care about order. Two random bit flips slipped past about 3 percent of the time: two flips in the same bit position of different words, one going up and one going down, add and subtract the same amount, and that shape turns up about one time in 32. CRC-32 missed nothing in any of the tests.

That matters in the real world. Stone and Partridge, in a study published in 2000, found between one packet in 1,100 and one in 32 thousand failing the TCP checksum, on links whose CRCs should have let through about one error in 4 billion. The corruption happened inside hosts and routers, in memory and on buses, after the link check. Now suppose one packet in 100 thousand is corrupted end to end and the checksum misses one in about 65 thousand of those. A service handling a million packets a second meets a corrupted delivery about every two hours.

## CRC: division that notices bursts

A cyclic redundancy check replaces addition with division. Treat the bits as a polynomial, do arithmetic where adding and subtracting are both XOR, and pick a generator polynomial. Append zeros to the message, divide by the generator, and the remainder is the CRC. The message plus its CRC divides exactly, so the receiver divides what arrived and expects zero.

One line of algebra carries everything: an error is undetected exactly when the generator divides the error pattern. Choose the generator well and that turns into guarantees. Every single-bit error is caught. Every burst of flipped bits no longer than the CRC's width is caught, so CRC-32 catches every burst of up to 32 bits, which is the shape of damage a noisy wire produces. Longer random damage slips through with a probability of about one in 2 to the 32nd.

CRC-32 is Ethernet's frame check, and gzip's, zip's and PNG's. CRC-32C, the Castagnoli variant, has a dedicated instruction on x86 and ARM, and is used by iSCSI, ext4 metadata, Btrfs and Kafka's record batches. Speed is not an excuse to skip one: on the lesson's machine, zlib's CRC-32 ran at 8.5 gigabytes a second, and on a NIC the Ethernet CRC is computed in silicon at line rate.

But a CRC is linear: without its initial value and final XOR, the CRC of two inputs XORed together is the XOR of their CRCs. That is why it is fast in hardware, and why you can combine the CRCs of two blocks without re-reading them. It is also why it is useless against an attacker. To flip chosen bits in a message, compute the CRC of the flip pattern and XOR it into the stored CRC, without ever seeing the data. WEP, the original Wi-Fi encryption, used CRC-32 as its integrity check inside an XOR stream cipher, and attackers did exactly that. Checksums and CRCs defend against physics, not against people.

## When corruption has a motive

Against an adversary, every non-cryptographic check fails, because the adversary can compute it too. A cryptographic hash such as SHA-256 makes it infeasible to find a different input with the same digest, but it protects you only if the digest arrives over a channel the attacker cannot touch: a signed release manifest, a lockfile in your repository. A SHA-256 appended to a message on the same channel can be recomputed by whoever changed the message. A MAC, such as HMAC with SHA-256, mixes in a secret key, so only key holders can produce a valid tag.

TLS is the integrity check you actually rely on. TLS 1.3 encrypts every record with an authenticated cipher that appends a 16-byte tag. If one bit of a record changes in transit, whether by attack, a buggy middlebox, or corruption that slipped past TCP, the tag fails, the receiver sends a bad record MAC alert, and it tears down the connection. In an all-TLS system, corruption does not produce bad data. It produces connection resets.

And cost is not the reason to skip any of this. With hardware SHA instructions, SHA-256 ran at 2.8 gigabytes a second on the lesson's machine, about three times slower than CRC-32. Neither is the bottleneck of a network service.

## What each layer verifies

Put the checks back on the stack and the gap appears. Ethernet's CRC-32 is strong but local: every switch and router strips it on receipt and generates a fresh one on send. So corruption inside a device, in buffer memory or on a backplane, gets wrapped in a new, valid CRC. The IPv4 checksum covers only the header. IPv6 has no header checksum at all, a deliberate bet on the end-to-end checks. From one host's memory to another's, the only end-to-end check below TLS is the weak 16-bit transport checksum. That is the gap Stone and Partridge measured.

This is the end-to-end argument, from Saltzer, Reed and Clark in 1984. A check inside the network can improve performance by catching errors early, but only a check performed by the endpoints can guarantee correctness, because only they see the whole path. For data you store: compute a checksum where the data is created and verify it where it is consumed. And compute it before any transformation, because a checksum taken after a buggy copy or compression step certifies the corrupted bytes.

Two things you will see in production. At the transport layer, corruption looks exactly like loss: the receiver silently drops a segment whose checksum fails, and the sender retransmits it. So a flaky optic shows up as retransmissions and falling throughput on one path, with zero application errors, while the CRC error counter on one interface climbs. And a capture on the sending host that shows incorrect checksums on outgoing packets is not corruption. It is checksum offload: the capture happens before the network card fills the field in.

## In the interview

A follow-up from the lesson. Your storage service already runs over TCP. Why add a CRC-32C per block?

[pause]

Because TCP's 16-bit checksum misses whole classes of errors, about 3 percent of two-bit flips and any word swap, and nothing below TLS protects data inside hosts, disks or your own copy loops. An end-to-end checksum computed by the writer and verified by the reader covers all of it, at roughly 8 bytes per nanosecond on the lesson's machine. The wrong answer is "the network already checks it".

And: why did IPv6 remove the header checksum? Because every link has a CRC and every transport has its own checksum over a pseudo-header that includes the addresses, so the per-hop check duplicated coverage while costing a recomputation at every router on every packet. Not because IPv6 packets cannot be corrupted.

## Recap

Four things to remember. Think in error patterns: a check misses an error only when it cannot tell the pattern from zero, which for a CRC means the generator divides it. The Internet checksum misses every word swap and about 1 in 32 two-bit errors, while CRC-32 catches every burst up to 32 bits. CRCs and bare hashes defend against physics, not people: against an attacker you need a MAC, which is what TLS puts on every record. And link CRCs are per hop, so checksum at the producer and verify at the consumer.

At your desk: the hand-summed checksums on the captured packet, the CRC long division and the one-byte CRC-32 trace, the tables of what each check and each layer covers, and the two checksum exercises.
