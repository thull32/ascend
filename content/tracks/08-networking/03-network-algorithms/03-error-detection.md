---
slug: error-detection
title: "Error detection: parity, the Internet checksum, CRCs and cryptographic hashes"
description: How parity, the 16-bit Internet checksum, CRC-32 and cryptographic MACs detect corruption, what each one provably catches and misses, and which layer of the stack actually verifies your bytes.
minutes: 44
difficulty: medium
tags: [networking, error-detection, checksum, crc, crc32, hashing, hmac, tls, end-to-end]
problems: []
---
Bits flip. A marginal optic turns a 1 into a 0 on the wire, a cosmic ray hits a router's packet buffer, a NIC firmware bug corrupts a DMA transfer, a laptop's non-ECC RAM holds a socket buffer for a few milliseconds too long. None of these announce themselves. The receiver gets a packet that looks exactly like a packet, and unless something along the way was checking, your service parses it, stores it and serves it back.

Amazon S3's multi-hour outage in July 2008 is the canonical story: a handful of internal state messages had a single corrupted bit, the messages carried no checksum, and the corrupted state spread through the system's gossip protocol until the cluster could not function. The fix was to checksum the messages. The lesson is the one this page is about: every layer of the network checks *something*, almost nobody knows exactly what, and the gaps between those checks are where silent corruption lives.

All error detection works the same way. The sender computes a short value `f(data)` of r bits and sends it along. The receiver recomputes `f` over what arrived and compares. An error goes undetected only if the corrupted data happens to produce the same check value. The schemes differ in which errors are *guaranteed* to be caught, how likely a random error is to slip through (at best about $2^{-r}$), how fast `f` runs, and whether it survives an adversary who is trying.

## Parity: one bit, half the errors

The smallest check is a single parity bit: the XOR of all the data bits. With even parity, the sender appends whatever bit makes the total number of 1s even.

`10110010` has four 1s, so its parity bit is 0. Flip one bit in transit and the receiver counts an odd number of 1s: detected. Flip two and the count is even again: undetected. Parity catches every odd number of flipped bits and no even number, which makes it a 50% detector for random multi-bit damage.

```viz
{"type": "bits", "algorithm": "and-or-xor", "a": 178, "b": 150, "title": "XOR of sent and received shows exactly which bits flipped", "caption": "a is the byte that was sent (10110010), b is what arrived (10010110). a XOR b is the error pattern: two flipped bits. Both bytes have four 1s, so a parity check passes. Every scheme in this lesson is built on XOR arithmetic."}
```

The XOR of sent and received data is the **error pattern** `E`. Thinking in error patterns is the key to the rest of the lesson: a check function detects an error exactly when `f` treats `E` as different from zero. Parity is blind to any `E` with an even number of 1s.

Parity still earns its place where errors really are single bits and hardware is cheap: memory buses, some serial links. ECC memory generalises it to a Hamming code (SECDED: single-error correct, double-error detect) with 8 check bits per 64 data bits. That is the other axis of this topic. **Detection** tells you the data is bad; **correction** (Hamming codes, Reed-Solomon, LDPC) adds enough redundancy to repair it. Networks mostly detect and retransmit, because a round trip is cheap (the retransmission machinery is [Reliable delivery](/learn/networking/network-algorithms/reliable-delivery-algorithms)). Where it is not (satellite links, live video, storage media, QR codes), forward error correction does the work.

## The Internet checksum

IPv4, ICMP, UDP and TCP all use the same 16-bit check, defined in RFC 1071:

1. Treat the data as a sequence of 16-bit big-endian words, padding an odd final byte with a zero.
2. Add the words using **one's complement addition**: whenever the sum overflows 16 bits, wrap the carry back into the low bit (the *end-around carry*).
3. Complement the result (flip every bit). That is the checksum.

The receiver sums every word *including* the checksum field. If nothing changed, the total is `0xFFFF`, whose complement is 0.

### A worked IPv4 header

Here is a 20-byte IPv4 header with its checksum field (bytes 10 and 11) set to zero, grouped into words:

```text
4500 0073 0000 4000 4011 0000 c0a8 0001 c0a8 00c7
```

```text
0x4500 + 0x0073            = 0x4573
       + 0x0000            = 0x4573
       + 0x4000            = 0x8573
       + 0x4011            = 0xC584
       + 0x0000            = 0xC584
       + 0xC0A8            = 0x1862C  -> carry: 0x862C + 1 = 0x862D
       + 0x0001            = 0x862E
       + 0xC0A8            = 0x146D6  -> carry: 0x46D6 + 1 = 0x46D7
       + 0x00C7            = 0x479E
checksum = ~0x479E         = 0xB861
```

The sender writes `b8 61` into bytes 10 and 11. The receiver's sum over all ten words is `0x479E + 0xB861 = 0xFFFF`. Complemented, that is 0: the header is accepted.

```python
def internet_checksum(data: bytes) -> int:
    total = 0
    for i in range(0, len(data), 2):
        word = data[i] << 8 | (data[i + 1] if i + 1 < len(data) else 0)
        total += word
        total = (total & 0xFFFF) + (total >> 16)   # end-around carry
    return ~total & 0xFFFF
```

### Why such a strange sum

One's complement addition was chosen in the 1970s for properties that still matter:

- **It is byte-order independent.** Sum the data with bytes swapped and you get the byte-swapped sum, so little-endian machines can compute it without swapping every word.
- **It updates incrementally.** A router decrements the TTL in every IPv4 header it forwards, which changes the header, which changes the checksum. RFC 1624 gives the update rule, $HC' = \lnot(\lnot HC + \lnot m + m')$, where `m` is the old 16-bit word and `m'` the new one. Three additions per packet instead of re-summing the header.
- **It is cheap in software**: one add per 16 bits, and it vectorises to 64-bit adds with a final fold.

### What it misses

Addition does not care about order, and that is the whole weakness:

- **Reordered words are invisible.** Swap two 16-bit words (a buggy buffer copy, a reassembly error) and the sum is identical.
- **Compensating errors are invisible.** If one word gains 1 and another loses 1, the sum is unchanged. Any `E` whose effect cancels arithmetically passes.
- **0x0000 and 0xFFFF are the same number** in one's complement, so a word that flips from all zeros to all ones is invisible.
- **Only 16 bits.** Even for perfectly random corruption, about 1 in 65,536 corrupted packets passes. Real corruption is not random, and it does worse.

That last point was measured. Stone and Partridge's study of real traffic, "When the CRC and TCP Checksum Disagree" (SIGCOMM 2000), found packets failing the TCP checksum far more often than link error rates could explain. Those packets had passed every link-level CRC. The corruption was happening inside hosts and routers, in memory and on buses, where no CRC was watching, and a fraction of it was of the kinds the Internet checksum cannot see.

Put numbers on it. Suppose, hypothetically, one packet in 100,000 is corrupted somewhere between the sender's application and the receiver's, and the TCP checksum misses one in 65,536 of those. Then one packet in about $6.5 \times 10^9$ delivers corrupted data silently. A service handling a million packets per second meets one of those roughly every two hours. At scale, "rare" means "scheduled".

### Where it is used, and where it was removed

The IPv4 header checksum covers **only the header**, so routers can verify it without touching the payload, and it is recomputed at every hop because of TTL. UDP and TCP checksums cover a **pseudo-header** (source and destination IP, protocol, length) plus their own header and the data, so a packet delivered to the wrong address fails the check; this is also why every NAT must patch the TCP checksum when it rewrites an address. UDP's checksum is optional over IPv4 (a value of 0 means "not computed") and mandatory over IPv6.

IPv6 dropped the header checksum altogether. Links already run CRCs, transports already have their own checksums, and removing a per-hop recomputation made forwarding cheaper. It is a deliberate bet on the end-to-end check, which is the thread running through this whole lesson.

```exercise
id: internet-checksum
title: Compute the Internet checksum
prompt: |
  Implement the RFC 1071 Internet checksum. `data` is a list of byte
  values (0 to 255). Treat it as 16-bit big-endian words (pad an odd final
  byte with a zero byte), add them with end-around carry, and return the
  one's complement of the sum as an integer from 0 to 65535.

  Running the function over data that already contains its correct
  checksum returns 0.
languages: [python, javascript]
entry: internet_checksum
starter:
  python: |
    def internet_checksum(data):
        total = 0
        # TODO: add 16-bit words with end-around carry, then complement
        return total
  javascript: |
    function internet_checksum(data) {
      let total = 0;
      // TODO: add 16-bit words with end-around carry, then complement
      return total;
    }
tests:
  - args: [[69, 0, 0, 115, 0, 0, 64, 0, 64, 17, 0, 0, 192, 168, 0, 1, 192, 168, 0, 199]]
    expected: 47201
    label: the worked IPv4 header (0xB861)
  - args: [[0, 1, 242, 3, 244, 245, 246, 247]]
    expected: 8717
    label: the RFC 1071 example (0x220D)
  - args: [[]]
    expected: 65535
    label: empty input
  - args: [[1]]
    expected: 65279
    label: odd length pads with a zero byte
  - args: [[128, 0, 128, 0, 0, 1]]
    expected: 65533
    label: end-around carry
  - args: [[69, 0, 0, 115, 0, 0, 64, 0, 64, 17, 184, 97, 192, 168, 0, 1, 192, 168, 0, 199]]
    expected: 0
    label: verifying a header that carries its checksum
    hidden: true
  - args: [[255, 255]]
    expected: 0
    hidden: true
hints:
  - "Build each word as `data[i] * 256 + data[i + 1]`, using 0 when `i + 1` is past the end."
  - "After each addition, fold: `total = (total & 0xFFFF) + (total >> 16)` (use `>>>` in JavaScript)."
  - "The complement must stay 16 bits: `~total & 0xFFFF`."
```

## CRC: long division that notices bursts

A **cyclic redundancy check** replaces addition with polynomial division, and the change of arithmetic buys guarantees the checksum cannot give.

Treat a bit string as the coefficients of a polynomial: `1011` is $x^3 + x + 1$. Do arithmetic modulo 2, where addition and subtraction are both XOR and there are no carries. Pick a **generator polynomial** `G` of degree r. To send message `M`:

1. Append r zero bits (multiply by $x^r$).
2. Divide by `G` using XOR long division. The r-bit remainder is the CRC.
3. Send `M` followed by the CRC. The result is exactly divisible by `G`.

The receiver divides what arrived by `G`. A remainder of zero means "no error detected".

### A worked division

Message `11010011101100`, generator `1011` (degree 3), so append three zeros:

```text
11010011101100 000
1011
01100011101100 000
 1011
00111011101100 000
  1011
00010111101100 000
   1011
00000001101100 000
       1011
00000000110100 000
        1011
00000000011000 000
         1011
00000000001110 000
          1011
00000000000101 000
           1011
00000000000000 100   <- remainder: the CRC is 100
```

Each step lines the divisor up under the leftmost remaining 1 and XORs. The transmitted frame is `11010011101100 100`, and dividing it by `1011` leaves `000`.

### What the algebra guarantees

The receiver sees `M + E`. Because the transmitted frame is divisible by `G`, the remainder of what arrives is the remainder of `E` alone. So **an error is undetected exactly when `G` divides the error pattern `E`**. Choosing `G` well turns that into guarantees:

- **Every single-bit error** ($E = x^i$) is caught if `G` has more than one term.
- **Every odd number of bit errors** is caught if $(x + 1)$ is a factor of `G`.
- **Every burst of length ≤ r** is caught. A burst is $x^i \cdot B(x)$ with $\deg B < r$, and a degree-r generator cannot divide it. CRC-32 catches every burst of up to 32 consecutive damaged bits, which is exactly the shape of damage a noisy wire produces.
- **Longer random errors** slip through with probability about $2^{-r}$.
- **Every double-bit error** within a maximum frame length is caught when `G` is chosen with a suitable primitive factor.

Compare that with the checksum, which catches all single-bit errors but can miss a two-bit error whose effects cancel.

### The CRCs you will meet

- **CRC-32** (polynomial `0x04C11DB7`, or `0xEDB88320` in the bit-reversed form software uses) is the Ethernet frame check sequence and the check in gzip, zip and PNG. It starts from `0xFFFFFFFF` and XORs the result with `0xFFFFFFFF`, so leading zero bytes still change the value. The standard check value is `CRC-32("123456789") = 0xCBF43926`.
- **CRC-32C** (Castagnoli, `0x1EDC6F41`) has better detection properties at the block sizes storage uses and a dedicated instruction on x86 (SSE4.2) and on ARMv8. iSCSI, SCTP, ext4 metadata, Btrfs and Kafka's record batches use it.

Software implementations use a 256-entry table (one lookup per byte instead of eight shift-and-XOR steps) or wider "slicing" tables. Hardware instructions and carry-less multiplication push CRC to many gigabytes per second per core. On a NIC, the Ethernet CRC is computed in silicon at line rate. CRC is cheap enough that the cost argument for skipping it is almost always wrong.

```python
def crc32(data: bytes) -> int:
    crc = 0xFFFFFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = (crc >> 1) ^ (0xEDB88320 if crc & 1 else 0)
    return crc ^ 0xFFFFFFFF

assert crc32(b"123456789") == 0xCBF43926
```

### Linearity: a feature and a vulnerability

Remove the initial value and the final XOR and a CRC is **linear over XOR**: $crc(a \oplus b) = crc(a) \oplus crc(b)$ for equal-length inputs. That is why it is fast in hardware, why you can combine the CRCs of two blocks without re-reading them (zlib's `crc32_combine`), and why storage systems can checksum in parallel.

It also means a CRC is useless against an attacker. To flip chosen bits in a message, compute the CRC of the flip pattern and XOR it into the stored CRC; you never need to see the data. WEP, the original Wi-Fi encryption, used CRC-32 as its integrity check inside the encryption, and because the stream cipher was also XOR-based, attackers could flip bits in encrypted packets and fix up the CRC without knowing the key. Checksums and CRCs defend against physics. They do not defend against people.

```exercise
id: crc32-bitwise
title: Implement CRC-32
prompt: |
  Implement the standard CRC-32 (the one used by Ethernet, gzip and zlib)
  over the bytes of an ASCII string `s`. Use the reflected polynomial
  0xEDB88320, start with 0xFFFFFFFF, process each byte least significant bit
  first, and XOR the result with 0xFFFFFFFF. Return an unsigned integer.

  `crc32("123456789")` must be 3421780262 (0xCBF43926).
languages: [python, javascript]
entry: crc32
starter:
  python: |
    def crc32(s):
        crc = 0xFFFFFFFF
        for byte in s.encode():
            # TODO: XOR the byte in, then 8 shift/XOR steps
            pass
        return crc ^ 0xFFFFFFFF
  javascript: |
    function crc32(s) {
      let crc = 0xffffffff;
      for (let i = 0; i < s.length; i++) {
        const byte = s.charCodeAt(i);
        // TODO: XOR the byte in, then 8 shift/XOR steps
      }
      return (crc ^ 0xffffffff) >>> 0;
    }
tests:
  - args: [""]
    expected: 0
    label: empty string
  - args: ["a"]
    expected: 3904355907
  - args: ["123456789"]
    expected: 3421780262
    label: standard check value
  - args: ["hello"]
    expected: 907060870
  - args: ["helln"]
    expected: 1092064784
    label: one flipped bit changes the CRC completely
    hidden: true
  - args: ["The quick brown fox jumps over the lazy dog"]
    expected: 1095738169
    hidden: true
hints:
  - "For each of the 8 bits: if the low bit of `crc` is 1, shift right by one and XOR with 0xEDB88320; otherwise just shift right."
  - "In JavaScript use `>>>` (unsigned shift) and finish with `>>> 0`, or the result comes out negative."
```

## Cryptographic hashes and MACs: when corruption has a motive

Against a random process, a 32-bit CRC is excellent. Against an adversary, every non-cryptographic check fails, because the adversary can compute it too. Two tools replace it.

- A **cryptographic hash** (SHA-256) makes it computationally infeasible to find a different input with the same digest. It protects integrity only if the digest itself arrives over a channel the attacker cannot touch: a signed release manifest, a lockfile in your repository, a content address you already trust. A SHA-256 appended to a message on the same channel can simply be recomputed by whoever modified the message.
- A **MAC** (HMAC-SHA256, or the tag of an AEAD cipher) mixes in a secret key, so only key holders can produce a valid tag. That is what makes it an integrity check against people.

**TLS is the integrity check you actually rely on.** [TLS 1.3](/learn/networking/fundamentals/tls-and-pki) encrypts every record with an AEAD cipher (AES-GCM or ChaCha20-Poly1305) that appends a 16-byte authentication tag. If a single bit of the record changes in transit, whether by attack, a buggy middlebox or corruption that slipped past TCP's checksum, the tag fails, the receiver sends a `bad_record_mac` alert and tears down the connection. In an all-TLS system, corruption does not produce bad data; it produces connection resets. A cluster of `bad_record_mac` or "decryption failed" errors from one host or one path is a hardware or middlebox problem wearing a security costume.

Between CRCs and SHA-256 sit the **fast non-cryptographic hashes** (xxHash, MurmurHash, CityHash and relatives). They are designed for [hash tables](/learn/data-structures/hashing/hash-functions), deduplication and content fingerprinting: very fast and well-distributed, with no resistance to deliberate collisions. Mind the birthday bound when you use them as identifiers: with a 64-bit hash you expect the first collision after about $2^{32} \approx 4$ billion items, which a large dedupe system reaches.

| Check | Bits | Guarantees against random errors | Against an adversary | Relative speed |
|---|---|---|---|---|
| Parity | 1 | Odd numbers of flipped bits | None | Fastest |
| Internet checksum | 16 | Single-bit errors; misses reorderings and cancelling errors | None | Very fast |
| CRC-32 / CRC-32C | 32 | All bursts ≤ 32 bits, odd-bit errors; else ~$2^{-32}$ | None (linear) | Very fast, hardware-assisted |
| xxHash-style 64-bit | 64 | Good distribution, no formal burst guarantee | None | Very fast |
| SHA-256 | 256 | Effectively everything | Collision- and preimage-resistant, but the digest needs a trusted channel | Roughly an order of magnitude slower than CRC with hardware support |
| HMAC / AEAD tag | 128–256 | Effectively everything | Unforgeable without the key | Similar to the hash or cipher it uses |

## What each layer verifies

Put the checks back on the stack from [Layers and encapsulation](/learn/networking/fundamentals/layers-and-encapsulation) and the gaps become visible.

| Layer | Check | What it covers | Recomputed |
|---|---|---|---|
| Ethernet / Wi-Fi | CRC-32 frame check sequence | One frame on one link | At every hop: stripped on receipt, regenerated on send |
| IPv4 | 16-bit Internet checksum | The IP header only | At every router (TTL changes) |
| IPv6 | None | Nothing | Not applicable |
| UDP | 16-bit checksum, pseudo-header + data | End to end (optional over IPv4) | Only by NATs |
| TCP | 16-bit checksum, pseudo-header + data | End to end | Only by NATs |
| TLS 1.3 | 128-bit AEAD tag per record | End to end between the TLS endpoints | Never |
| HTTP | Nothing by default (`Repr-Digest` exists but is rarely sent) | Optional | Not applicable |
| Your storage | S3 object checksums (CRC32, CRC32C, SHA-256), Kafka CRC-32C, ZFS and Btrfs block checksums, database page checksums | Data at rest and in transit to it | By your code |

The CRC is strong but local: it protects a frame on one wire and is regenerated by each switch and router, so corruption *inside* a device (in its buffer memory, on its backplane) is re-covered by a fresh, valid CRC. From one host's memory to another's, the only end-to-end check below TLS is the weak 16-bit transport checksum. That is the space Stone and Partridge measured.

This is the **end-to-end argument** (Saltzer, Reed and Clark, 1984): a check performed inside the network can improve performance, by catching errors early and retransmitting locally, but only a check performed by the endpoints can guarantee correctness, because only the endpoints see the whole path. For data you store, compute a checksum where the data is created and verify it where it is consumed. When you upload to S3, send a checksum header so the service verifies what it received against what you computed, and verify again when you read it back.

One practical trap: modern NICs compute TCP and UDP checksums in hardware (**checksum offload**). A `tcpdump` on the *sending* host captures the packet before the NIC fills in the checksum, so every outgoing packet shows `cksum 0x... (incorrect -> 0x...)`. That is expected, not a bug. [Debugging the network](/learn/networking/networking-in-practice/debugging-the-network) covers what real corruption looks like in a capture. At the transport layer it looks exactly like loss, because the receiver discards a segment whose checksum fails without telling anyone:

```viz
{"type": "network", "scenario": "tcp-retransmit", "title": "A checksum failure is indistinguishable from loss", "caption": "The receiving TCP silently drops a segment whose checksum fails. The sender sees duplicate ACKs, exactly as if the segment had been lost, and retransmits it. Corruption shows up as retransmissions, not as errors."}
```

That is why a path with a flaky optic shows up as a high retransmission rate and not as an error counter in your application. Check `ethtool -S` for CRC errors on the interface and `nstat` for `TcpInCsumErrors` on the host.

## Senior signals

- You say which errors a check **guarantees** to detect, not just its size: CRC-32 catches every burst up to 32 bits; the Internet checksum misses reordered words and cancelling errors.
- You know the Ethernet CRC is **per hop** and regenerated inside every device, so corruption inside a router or host is covered end to end only by the 16-bit transport checksum or by TLS.
- You apply the **end-to-end argument** to storage and messaging: checksum at the producer, verify at the consumer, and never trust that "the network already checked it".
- You never use a CRC or a bare hash where an **adversary** is involved; you reach for a MAC or AEAD and can explain why CRC's linearity makes forgery trivial.
- You read `bad_record_mac` bursts and rising retransmission rates as possible **hardware corruption**, and you know that "incorrect cksum" in a sender-side capture is just checksum offload.

## Check yourself

```quiz
- q: >-
    A buggy copy routine swaps two adjacent 16-bit words inside a UDP payload. Which check detects it?
  options: ["Neither the UDP checksum nor a CRC computed after it", "The IPv4 header checksum, recomputed at each router", "The UDP checksum, because it covers every payload byte", "The next link's Ethernet CRC, computed over the frame"]
  answer: 0
  explanation: >-
    One's complement addition is commutative, so swapped words give the same UDP checksum. If the swap happened in host memory before transmission, the NIC computes a perfectly valid Ethernet CRC over the already-corrupted frame. The IPv4 checksum covers only the header. Only an end-to-end check computed before the bug (an application checksum or TLS) would notice.
- q: >-
    Why must every IPv4 router update the header checksum but not the TCP checksum?
  options: ["TTL changes, and the IPv4 checksum covers only the header", "Each hop's NIC recomputes the TCP checksum in hardware", "TCP checksums are optional, so routers may skip them", "Routers are not permitted to read the TCP header at all"]
  answer: 0
  explanation: >-
    TTL is in the IP header and changes at every hop, and the IPv4 checksum covers only that header, so it must change with it (incrementally, via RFC 1624). The TCP checksum covers the pseudo-header, TCP header and data, none of which a plain router modifies. A NAT does modify addresses and ports, which is why it must patch the TCP checksum too.
- q: >-
    A CRC with generator polynomial G of degree 32 is guaranteed to detect which of these?
  options: ["Any error that flips exactly 64 scattered bits", "Any error at all, of any length or pattern", "Any change by an attacker who cannot see the data", "Any burst of 32 or fewer consecutive flipped bits"]
  answer: 3
  explanation: >-
    An undetected error must be a multiple of G, and a burst of length at most 32 cannot be. Longer or scattered errors are caught with probability about 1 − 2^−32, not with certainty. CRC is linear, so an attacker can fix it up for any chosen bit flips without seeing the data.
- q: >-
    You append SHA-256(message) to each message on a plaintext TCP connection to detect tampering. What is wrong?
  options: ["SHA-256 cannot detect errors of a single bit", "SHA-256 is too slow to run on every message", "Anyone can recompute the hash; use a MAC", "Nothing, because SHA-256 is collision-resistant"]
  answer: 2
  explanation: >-
    A hash detects accidental corruption and lets you compare against a digest you already trust, but on the same channel it provides no authenticity: anyone who can modify the message can recompute the hash. A keyed MAC (HMAC or an AEAD cipher) binds the tag to a secret key, or the digest must arrive over a trusted channel; that is what TLS does for every record.
- q: >-
    A host's TLS connections to one storage node fail intermittently with bad_record_mac, while connections to other nodes are fine. What is the most likely class of cause?
  options: ["DNS resolves that node's name to the wrong host", "The storage node's certificate has expired", "Congestion control is backing off on that path", "Corruption on that path that TCP did not catch"]
  answer: 3
  explanation: >-
    The AEAD tag fails when record bytes change after encryption. Certificate and DNS problems fail at handshake time, not mid-stream, and congestion causes delay rather than bad records. Localised bad_record_mac errors are a classic symptom of hardware or middlebox corruption (a faulty NIC, memory or middlebox) that the 16-bit TCP checksum let through.
```
