---
slug: error-detection
title: "Error detection: parity, the Internet checksum, CRCs and cryptographic hashes"
description: How parity, the 16-bit Internet checksum, CRC-32 and cryptographic MACs detect corruption, computed by hand on a captured packet and a traced CRC, what each provably catches and measurably misses, what they cost per gigabyte, and which layer of the stack actually verifies your bytes.
minutes: 50
difficulty: medium
tags: [networking, error-detection, checksum, crc, crc32, hashing, hmac, tls, end-to-end]
problems: []
---
Bits flip. A marginal optic turns a 1 into a 0 on the wire, a cosmic ray hits a router's packet buffer, a NIC firmware bug corrupts a DMA transfer, a laptop's non-ECC RAM holds a socket buffer a few milliseconds too long. None of these announce themselves. The receiver gets a packet that looks exactly like a packet, and unless something along the way was checking, your service parses it, stores it and serves it back.

Amazon S3's outage of about eight hours on 20 July 2008 is the canonical story: a handful of internal state messages had a single corrupted bit, the messages carried no checksum, and the corrupted state spread through the system's gossip protocol until the cluster could not function. Among AWS's fixes was adding checksums to those messages. Every layer of the network checks *something*, almost nobody knows exactly what, and the gaps between those checks are where silent corruption lives.

All error detection works the same way. The sender computes a short value `f(data)` of r bits and sends it along. The receiver recomputes `f` over what arrived and compares. An error goes undetected only if the corrupted data happens to produce the same check value. The schemes differ in which errors are *guaranteed* to be caught, how likely a random error is to slip through (at best about $2^{-r}$), how fast `f` runs, and whether it survives an adversary who is trying.

## Parity: one bit, half the errors

The smallest check is a single parity bit: the XOR of all the data bits. With even parity, the sender appends whatever bit makes the total number of 1s even. `10110010` has four 1s, so its parity bit is 0. Flip one bit in transit and the receiver counts an odd number of 1s: detected. Flip two and the count is even again: undetected. Parity catches every odd number of flipped bits and no even number.

```viz
{"type": "bits", "algorithm": "and-or-xor", "a": 178, "b": 150, "title": "XOR of sent and received shows exactly which bits flipped", "caption": "a is the byte that was sent (10110010), b is what arrived (10010110). a XOR b is the error pattern: two flipped bits. Both bytes have four 1s, so a parity check passes. Every scheme in this lesson is built on XOR arithmetic."}
```

The XOR of sent and received data is the **error pattern** `E`, and thinking in error patterns is the key to the rest of the lesson: a check detects an error exactly when `f` treats `E` as different from zero. Parity is blind to any `E` with an even number of 1s.

Parity earns its place where errors really are single bits and hardware is cheap: memory buses, some serial links. ECC memory generalises it to a Hamming code (SECDED: single-error correct, double-error detect) with 8 check bits per 64 data bits. That is the other axis of this topic. **Detection** tells you the data is bad; **correction** (Hamming codes, Reed-Solomon, LDPC) adds enough redundancy to repair it. Networks mostly detect and retransmit, because a round trip is cheap (the machinery is [Reliable delivery](/learn/networking/network-algorithms/reliable-delivery-algorithms)). Where it is not (satellite links, live video, storage media, QR codes), forward error correction does the work.

## The Internet checksum

IPv4, ICMP, UDP and TCP all use the same 16-bit check, defined in RFC 1071:

1. Treat the data as 16-bit big-endian words, padding an odd final byte with a zero.
2. Add the words with **one's complement addition**: whenever the sum overflows 16 bits, wrap the carry back into the low bit (the *end-around carry*).
3. Complement the result (flip every bit). That is the checksum.

The receiver sums every word *including* the checksum field. If nothing changed, the total is `0xFFFF`, whose complement is 0.

### A real IPv4 header, summed

This is a UDP datagram captured on this machine with `tcpdump -xx` (a Python socket sending `hello, checksum!` from 10.9.0.1 to 10.9.0.2 inside a network namespace, with transmit checksum offload turned off with `ethtool -K d0 tx off` so the kernel computed every checksum in software):

```text
0x0000:  d695 c624 8da2 d695 c624 8da2 0800 4500
0x0010:  002c f6ba 4000 4011 2ff2 0a09 0001 0a09
0x0020:  0002 9c40 270f 0018 1791 6865 6c6c 6f2c
0x0030:  2063 6865 636b 7375 6d21
```

The first 14 bytes are the Ethernet header (destination, source, type `0800` = IPv4). The IPv4 header is the next 20 bytes: `4500 002c f6ba 4000 4011 2ff2 0a09 0001 0a09 0002`: version 4, header length 5 words, total length 44, identification `f6ba`, don't-fragment, TTL 64 (`40`), protocol 17 (UDP), **checksum `2ff2`**, then the two addresses. To verify it, zero the checksum field and sum:

| Add | Running sum | After end-around carry |
|---|---|---|
| `0x4500` | `0x4500` | |
| `0x002C` | `0x452C` | |
| `0xF6BA` | `0x13BE6` | `0x3BE6 + 1 = 0x3BE7` |
| `0x4000` | `0x7BE7` | |
| `0x4011` | `0xBBF8` | |
| `0x0000` (checksum field) | `0xBBF8` | |
| `0x0A09`, `0x0001` | `0xC602` | |
| `0x0A09`, `0x0002` | `0xD00D` | |

Complement: `~0xD00D = 0x2FF2`, the value on the wire. The receiver's sum over all ten words, checksum included, is `0xD00D + 0x2FF2 = 0xFFFF`.

### The UDP checksum and its pseudo-header

The UDP checksum (`1791`, at offset `0x28`) covers more than UDP. It is computed over a **pseudo-header** of source address, destination address, a zero byte, the protocol number and the UDP length, then the UDP header with its checksum field zeroed, then the payload:

```text
pseudo-header  0a09 0001 0a09 0002 0011 0018
UDP header     9c40 270f 0018 0000            (ports 40000 -> 9999, length 24)
payload        6865 6c6c 6f2c 2063 6865 636b 7375 6d21   ("hello, checksum!")
```

Summing those eighteen words folds a carry three times (after the first `6865`, after `6f2c` and after `636b`) and ends at `0xE86E`; `~0xE86E = 0x1791`, which is the captured value and why `tcpdump -vv` printed `[udp sum ok]`. Because the addresses are inside the check, a datagram delivered to the wrong host fails it, and every NAT that rewrites an address or port must patch this checksum too.

### Why such a strange sum

One's complement addition was chosen in the 1970s for properties that still matter:

- **It is byte-order independent.** Sum the words with bytes swapped and you get the byte-swapped sum. On this little-endian x86 machine, summing the UDP data above as native 16-bit integers gives `0x6EE8`, and swapping its bytes gives `0xE86E`, the big-endian answer, so the kernel never swaps individual words.
- **It updates incrementally.** Routers decrement the TTL in every IPv4 header they forward, which changes the checksum. RFC 1624 gives the update rule $HC' = \lnot(\lnot HC + \lnot m + m')$, where `m` is the old 16-bit word and `m'` the new one: three additions instead of re-summing the header.
- **It is cheap**: one add per 16 bits, and it vectorises to 64-bit adds with a final fold.

### What it misses, measured

Addition does not care about order, and a carry can cancel a borrow. To put numbers on it, I corrupted a random 256-byte packet 200,000 times per error class and checked whether the Internet checksum and CRC-32 (`zlib.crc32`) still matched (Python 3.14 on this machine, fixed seed):

| Error class | Internet checksum missed | CRC-32 missed |
|---|---|---|
| 1 random bit flipped | 0 | 0 |
| 2 random bits flipped | 6,127 (3.06%) | 0 |
| Two 16-bit words swapped | 200,000 (100%) | 0 |
| Burst of 2 to 32 bits | 2 (0.001%) | 0 |
| 8 consecutive bytes overwritten with random data | 3 (0.0015%) | 0 |

The two-bit row is the one that surprises people. Two flips in the same bit position of different words, one 0 → 1 and one 1 → 0, add and subtract the same power of two; the chance of that is about 1/16 × 1/2 = 1/32, which is what the simulation found. Swapped words are invisible because addition commutes, and `0x0000` and `0xFFFF` are the same number in one's complement, so a word flipping from all zeros to all ones is invisible too. For random damage the miss rate falls to $2^{-16} \approx 0.0015\%$, which the last row reproduced.

Real traffic was measured too. Stone and Partridge, ["When the CRC and TCP Checksum Disagree"](https://conferences.sigcomm.org/sigcomm/2000/conf/paper/sigcomm2000-9-1.pdf) (SIGCOMM 2000), found between 1 packet in 1,100 and 1 in 32,000 failing the TCP checksum, on links whose CRCs should have let through about 1 error in 4 billion. They had passed every link-level CRC: the corruption happened inside hosts and routers, in memory and on buses, and some of it was of kinds the Internet checksum cannot see. Suppose one packet in 100,000 is corrupted between the sender's application and the receiver's, and the checksum misses one in 65,536 of those: one packet in about $6.5 \times 10^9$ is delivered corrupted, which a service handling a million packets per second meets about every two hours.

### Where it is used, and where it was removed

The IPv4 header checksum covers **only the header**, so routers verify it without touching the payload, and it changes at every hop with the TTL. UDP and TCP checksums cover the pseudo-header, their header and the data, end to end. UDP's checksum is optional over IPv4 (0 means "not computed") and mandatory over IPv6. IPv6 dropped the header checksum altogether: links run CRCs, transports have their own checksums, and removing a per-hop recomputation made forwarding cheaper. It is a deliberate bet on the end-to-end check.

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
  - args: [[69, 0, 0, 44, 246, 186, 64, 0, 64, 17, 0, 0, 10, 9, 0, 1, 10, 9, 0, 2]]
    expected: 12274
    label: the captured IPv4 header (0x2FF2)
  - args: [[69, 0, 0, 115, 0, 0, 64, 0, 64, 17, 0, 0, 192, 168, 0, 1, 192, 168, 0, 199]]
    expected: 47201
    label: another IPv4 header (0xB861)
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
  - args: [[10, 9, 0, 1, 10, 9, 0, 2, 0, 17, 0, 24, 156, 64, 39, 15, 0, 24, 0, 0, 104, 101, 108, 108, 111, 44, 32, 99, 104, 101, 99, 107, 115, 117, 109, 33]]
    expected: 6033
    label: the captured UDP datagram with its pseudo-header (0x1791)
    hidden: true
hints:
  - "Build each word as `data[i] * 256 + data[i + 1]`, using 0 when `i + 1` is past the end."
  - "After each addition, fold: `total = (total & 0xFFFF) + (total >> 16)` (use `>>>` in JavaScript)."
  - "The complement must stay 16 bits: `~total & 0xFFFF`."
```

## CRC: long division that notices bursts

A **cyclic redundancy check** replaces addition with polynomial division, and the change of arithmetic buys guarantees the checksum cannot give. Treat a bit string as the coefficients of a polynomial: `1011` is $x^3 + x + 1$. Do arithmetic modulo 2, where addition and subtraction are both XOR and there are no carries. Pick a **generator polynomial** `G` of degree r. To send message `M`:

1. Append r zero bits (multiply by $x^r$).
2. Divide by `G` using XOR long division. The r-bit remainder is the CRC.
3. Send `M` followed by the CRC. The result is exactly divisible by `G`.

The receiver divides what arrived by `G`; a remainder of zero means "no error detected".

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
- **Every burst of length ≤ r** is caught. A burst is $x^i \cdot B(x)$ with $\deg B < r$, and a degree-r generator with a nonzero constant term cannot divide it. CRC-32 catches every burst of up to 32 bits, the shape of damage a noisy wire produces.
- **Every double-bit error** within a maximum frame length is caught when `G` has a suitable primitive factor.
- **Longer random errors** slip through with probability about $2^{-r}$.

The measured table above is these guarantees showing up as zeros.

### CRC-32 of one byte, traced

Real CRC-32 (the Ethernet, gzip, zip and PNG check) is the same division with four conventions: the 33-bit generator `0x104C11DB7`, bits taken least significant first (so software stores the generator reflected, as `0xEDB88320`), a register started at `0xFFFFFFFF` so that leading zero bytes still change the result, and a final XOR with `0xFFFFFFFF`. The register holds the running remainder with its bits reversed, so its *low* bit is the leading coefficient: when it is 1, the step subtracts (XORs) the generator; either way it shifts one bit. CRC-32 of the single ASCII byte `a` (`0x61`):

| Step | Low bit | Register before | Register after |
|---|---|---|---|
| Start | | | `0xFFFFFFFF` |
| XOR in `0x61` | | `0xFFFFFFFF` | `0xFFFFFF9E` |
| 1 | 0: shift | `0xFFFFFF9E` | `0x7FFFFFCF` |
| 2 | 1: shift, XOR `EDB88320` | `0x7FFFFFCF` | `0xD2477CC7` |
| 3 | 1 | `0xD2477CC7` | `0x849B3D43` |
| 4 | 1 | `0x849B3D43` | `0xAFF51D81` |
| 5 | 1 | `0xAFF51D81` | `0xBA420DE0` |
| 6 | 0 | `0xBA420DE0` | `0x5D2106F0` |
| 7 | 0 | `0x5D2106F0` | `0x2E908378` |
| 8 | 0 | `0x2E908378` | `0x174841BC` |
| Final XOR | | `0x174841BC` | **`0xE8B7BE43`** |

`zlib.crc32(b"a")` returns `0xE8B7BE43`. Doing the division the textbook way (bits of `0x61` reversed to `10000110`, the first 32 bits of the padded message complemented for the initial value, divided by `0x104C11DB7`) leaves remainder `0x3D8212E8`, which reversed and complemented is the same `0xE8B7BE43`. The table above is that division, one quotient bit per row.

### The CRCs you will meet

- **CRC-32** (`0x04C11DB7`, reflected `0xEDB88320`): Ethernet's frame check sequence, gzip, zip, PNG. Its standard check value is `CRC-32("123456789") = 0xCBF43926`.
- **CRC-32C** (Castagnoli, `0x1EDC6F41`): better detection at storage block sizes, and a dedicated instruction on x86 (SSE4.2 `crc32`) and ARMv8. iSCSI, SCTP, ext4 metadata, Btrfs and Kafka's record batches use it.

Software implementations use a 256-entry table (one lookup per byte instead of eight shift-and-XOR steps), wider "slicing" tables, or carry-less multiplication (`PCLMULQDQ`) to fold many bytes per instruction. Measured on this machine (AMD Ryzen 9 9950X3D, best of three passes over 64 MB): `zlib.crc32` (zlib 1.3.2) runs at 8.5 GB/s. On a NIC the Ethernet CRC is computed in silicon at line rate. The cost argument for skipping a CRC is almost always wrong.

```python
def crc32(data: bytes) -> int:
    crc = 0xFFFFFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = (crc >> 1) ^ (0xEDB88320 if crc & 1 else 0)
    return crc ^ 0xFFFFFFFF

assert crc32(b"123456789") == 0xCBF43926
assert crc32(b"a") == 0xE8B7BE43
```

### Linearity: a feature and a vulnerability

Remove the initial value and the final XOR and a CRC is **linear over XOR**: $crc(a \oplus b) = crc(a) \oplus crc(b)$ for equal-length inputs. That is why it is fast in hardware, why you can combine the CRCs of two blocks without re-reading them (zlib's `crc32_combine`), and why storage systems can checksum in parallel.

It also makes a CRC useless against an attacker. To flip chosen bits in a message, compute the CRC of the flip pattern and XOR it into the stored CRC; you never need to see the data. WEP, the original Wi-Fi encryption, used CRC-32 as its integrity check inside an XOR stream cipher, so attackers could flip bits in encrypted packets and fix up the CRC without the key. Checksums and CRCs defend against physics, not against people.

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
    label: the traced byte (0xE8B7BE43)
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
  - "For each of the 8 bits: if the low bit of `crc` is 1, shift right by one and XOR with 0xEDB88320; otherwise shift right only."
  - "In JavaScript use `>>>` (unsigned shift) and finish with `>>> 0`, or the result comes out negative."
```

## Cryptographic hashes and MACs: when corruption has a motive

Against a random process, a 32-bit CRC is excellent. Against an adversary, every non-cryptographic check fails, because the adversary can compute it too. Two tools replace it.

- A **cryptographic hash** (SHA-256) makes it computationally infeasible to find a different input with the same digest. It protects integrity only if the digest arrives over a channel the attacker cannot touch: a signed release manifest, a lockfile in your repository, a content address you already trust. A SHA-256 appended to a message on the same channel can be recomputed by whoever modified the message.
- A **MAC** (HMAC-SHA256, or the tag of an AEAD cipher) mixes in a secret key, so only key holders can produce a valid tag.

**TLS is the integrity check you actually rely on.** [TLS 1.3](/learn/networking/fundamentals/tls-and-pki) encrypts every record with an AEAD cipher (AES-GCM or ChaCha20-Poly1305) that appends a 16-byte authentication tag. If a single bit of the record changes in transit, whether by attack, a buggy middlebox or corruption that slipped past TCP's checksum, the tag fails, the receiver sends a `bad_record_mac` alert and tears down the connection. In an all-TLS system, corruption does not produce bad data; it produces connection resets.

Between CRCs and SHA-256 sit the **fast non-cryptographic hashes** (xxHash, MurmurHash and relatives), designed for [hash tables](/learn/data-structures/hashing/hash-functions), deduplication and fingerprinting: fast and well distributed, with no resistance to deliberate collisions. Mind the birthday bound when you use them as identifiers: with a 64-bit hash, collisions become likely after about $2^{32} \approx 4$ billion items.

| Check | Bits | Guarantees against random errors | Against an adversary | Measured here (GB/s) |
|---|---|---|---|---|
| Parity | 1 | Odd numbers of flipped bits | None | Not measured; one XOR per word |
| Internet checksum | 16 | Single-bit errors; misses swaps and about 3% of two-bit errors | None | 0.3 in a Python `sum()`; the kernel's C and assembly version is many times faster |
| CRC-32 / CRC-32C | 32 | All bursts ≤ 32 bits; all 1- to 3-bit errors in up to 91,607 data bits (CRC-32); every odd count (CRC-32C only, which has the $x + 1$ factor); else ~$2^{-32}$ | None (linear) | 8.5 (`zlib.crc32`) |
| xxHash-style 64-bit | 64 | Good distribution, no formal burst guarantee | None | Not measured; same order as CRC |
| SHA-256 | 256 | Effectively everything | Collision- and preimage-resistant, but the digest needs a trusted channel | 2.8 (OpenSSL 3.5 with SHA extensions) |
| HMAC-SHA256 / AEAD tag | 128–256 | Effectively everything | Unforgeable without the key | 2.8 for HMAC-SHA256 |

On this CPU, with hardware SHA instructions, SHA-256 is about 3 times slower than CRC-32. On processors without SHA extensions the gap is several times wider; either way, neither is the bottleneck of a network service.

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
| Your storage | S3 object checksums (CRC-64/NVME by default; CRC32, CRC32C, SHA-256 and others), Kafka CRC-32C, ZFS and Btrfs block checksums, database page checksums | Data at rest and in transit to it | By your code |

The CRC is strong but local: each switch and router strips it and generates a fresh one, so corruption *inside* a device (in buffer memory, on a backplane) is covered by a new, valid CRC. From one host's memory to another's, the only end-to-end check below TLS is the weak 16-bit transport checksum, which is the gap Stone and Partridge measured.

This is the **end-to-end argument** (Saltzer, Reed and Clark, 1984): a check inside the network can improve performance, by catching errors early and retransmitting locally, but only a check performed by the endpoints can guarantee correctness, because only they see the whole path. For data you store, compute a checksum where the data is created and verify it where it is consumed. When you upload to S3, the checksum header (sent by default by current AWS SDKs) lets the service verify what it received against what the client computed; verify again when you read it back.

At the transport layer, corruption looks exactly like loss, because the receiver discards a segment whose checksum fails without telling anyone:

```viz
{"type": "network", "scenario": "tcp-retransmit", "title": "A checksum failure is indistinguishable from loss", "caption": "The receiving TCP silently drops a segment whose checksum fails. The sender sees duplicate ACKs, exactly as if the segment had been lost, and retransmits it. Corruption shows up as retransmissions, not as errors."}
```

## Under the hood: who computes the checksum

On transmit, Linux marks each outgoing packet with how its checksum should be finished. With `CHECKSUM_PARTIAL` the kernel writes only the pseudo-header sum into the TCP or UDP checksum field and records where the real checksum goes; the NIC completes it in hardware as the frame leaves (**transmit checksum offload**). Without offload, the kernel computes it with `csum_partial`, an architecture-specific routine that adds 64 bits at a time with carries and folds to 16 bits at the end, often while copying the data from user space so the bytes are read only once.

On receive, a NIC that verified the checksum marks the packet `CHECKSUM_UNNECESSARY`, or hands the kernel the one's complement sum of the whole packet (`CHECKSUM_COMPLETE`) so that TCP only has to add the pseudo-header. Failures increment `TcpInCsumErrors` or `UdpInCsumErrors` in `nstat` and the packet is dropped. The Ethernet CRC is checked and stripped by the NIC; failures appear in `ethtool -S` as `rx_crc_errors` on most drivers.

Offload is why a `tcpdump` on the *sending* host shows `cksum 0x... (incorrect -> 0x...)` on outgoing packets: the capture happens before the NIC fills the field in. The captured packet at the top of this lesson shows a valid checksum only because offload was switched off first. [Debugging the network](/learn/networking/networking-in-practice/debugging-the-network) covers what real corruption looks like in a capture.

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Flaky optic or cable | Retransmissions rise on one path; throughput on it falls; application errors are zero | `ethtool -S` shows `rx_crc_errors` climbing on one interface; switch port counters agree | Replace the optic or cable; alert on CRC error counters, not only on link state |
| Corruption inside a device | Rare `bad_record_mac` resets, or rare bad objects in a store without TLS, correlated with one host or one middlebox | Frames pass every link CRC; `TcpInCsumErrors` is nonzero on the receiver; bad data appears only behind one device | Take the device out of rotation (bad NIC, RAM or switch buffer); use TLS or application checksums end to end |
| Silent corruption at rest | A replica or backup restores with bad bytes months later | No checksum was stored with the data, or it was computed after the bug that corrupted it | Checksum at the producer (S3 checksum headers, CRC-32C per block), verify on read, scrub periodically |
| Offload bug or disabled verification | Garbled payloads after a driver or firmware upgrade | Captures on the receiving host show packets with bad checksums being accepted; problem disappears with `ethtool -K <dev> rx off tx off` | Roll back or patch the driver; keep an end-to-end check so a NIC bug cannot corrupt data silently |
| Checksum used as a security control | Tampered messages pass verification | The "integrity" field is a CRC or a bare hash on the same channel | Use HMAC or an AEAD cipher with a key the attacker does not have |

## Interviewer follow-ups

**"Why did IPv6 remove the header checksum?"** Model answer: every link has a CRC and every transport has its own checksum over a pseudo-header that includes the addresses, so the per-hop check duplicated coverage while costing a recomputation at every router on every packet. Common wrong answer: "because IPv6 packets cannot be corrupted" or "because IPsec handles it".

**"Your storage service already runs over TCP. Why add a CRC-32C per block?"** Model answer: TCP's 16-bit checksum misses whole classes of errors (about 3% of two-bit flips, any word swap) and nothing below TLS protects data inside hosts, disks or your own copy loops; an end-to-end checksum computed by the writer and verified by the reader covers all of it at roughly 8 bytes per nanosecond on the lesson's machine. Common wrong answer: "the network already checks it".

**"How does a CRC detect every burst of up to 32 bits?"** Model answer: an error is missed only if the generator divides the error polynomial; a burst of length ≤ 32 is $x^i B(x)$ with $\deg B < 32$, and a degree-32 generator with a constant term divides neither $x^i$ nor $B$. Common wrong answer: "because it has 32 bits", which would equally "prove" that a 32-bit sum catches them.

**"Can you use CRC-32 to detect tampering if the CRC is encrypted?"** Model answer: no; the CRC is linear, so an attacker who can flip ciphertext bits in an XOR stream cipher can compute the matching change to the encrypted CRC, which is how WEP was broken. Use a MAC or AEAD. Common wrong answer: "yes, the attacker cannot see the CRC".

## What mid-level engineers get wrong

- **Trusting "TCP checks it" for stored data.** The 16-bit checksum missed 3% of two-bit errors and every word swap in the measurement above, and nothing covers memory inside hosts.
- **Reading `incorrect cksum` in a sender-side capture as corruption**, and opening an incident about checksum offload.
- **Using a CRC or a bare hash as an integrity check against people.** Linearity lets an attacker fix a CRC without seeing the data, and anyone can recompute a hash.
- **Computing the checksum after the transformation that corrupts.** A checksum taken after a buggy compression or copy step certifies the corrupted bytes.
- **Using a 32-bit hash as a unique identifier.** With a 32-bit value the chance of a collision passes 50% at about 77,000 items; with 64 bits, at about 5 billion.
- **Dropping CRC error counters from dashboards.** A flaky optic shows up as retransmissions and latency long before anything reports an error.

## Senior signals

- You say which errors a check **guarantees** to detect, not only its size: CRC-32 catches every burst up to 32 bits; the Internet checksum misses swapped words, compensating errors and about 1 in 32 two-bit errors.
- You can compute an Internet checksum and a bit-serial CRC by hand on real bytes, and explain why one's complement is byte-order independent and incrementally updatable.
- You know the Ethernet CRC is **per hop** and regenerated inside every device, so corruption inside a router or host is covered end to end only by the 16-bit transport checksum or by TLS.
- You apply the **end-to-end argument** to storage and messaging: checksum at the producer, verify at the consumer, and never assume "the network already checked it".
- You never use a CRC or a bare hash where an **adversary** is involved; you reach for a MAC or AEAD and can explain why CRC's linearity makes forgery trivial.
- You read `bad_record_mac` bursts, `TcpInCsumErrors` and `rx_crc_errors` as possible **hardware corruption**, and you know that "incorrect cksum" in a sender-side capture is checksum offload.
- You know the costs: CRC-32 at several GB/s per core with carry-less multiplication, SHA-256 within a small factor of it on CPUs with SHA extensions, so checksumming is never the reason to skip integrity.

## Check yourself

```quiz
- q: >-
    A buggy copy routine swaps two adjacent 16-bit words inside a UDP payload. Which check detects it?
  options: ["The UDP checksum, because it covers every payload byte", "The next link's Ethernet CRC, computed over the frame", "Neither the UDP checksum nor a CRC computed after it", "The IPv4 header checksum, recomputed at each router"]
  answer: 2
  explanation: >-
    One's complement addition is commutative, so swapped words give the same UDP checksum; the lesson's simulation missed 100% of swaps. If the swap happened in host memory before transmission, the NIC computes a valid Ethernet CRC over the already-corrupted frame. The IPv4 checksum covers only the header. Only an end-to-end check computed before the bug (an application checksum or TLS) would notice.
- q: >-
    Two bits flip in a packet: bit 3 of one 16-bit word goes from 0 to 1, and bit 3 of another word goes from 1 to 0. What happens?
  options: ["Both miss it, as two-bit errors cancel in any code", "Both the checksum and CRC-32 catch it every time", "The Internet checksum misses it; CRC-32 catches it", "CRC-32 misses it; the Internet checksum catches it"]
  answer: 2
  explanation: >-
    The sum gains 8 in one word and loses 8 in the other, so the Internet checksum is unchanged; about 1 in 32 random two-bit errors has this shape, which is the 3.06% the simulation measured. CRC-32 detects every two-bit error within any realistic frame length because its generator cannot divide x^i + x^j there.
- q: >-
    Why must every IPv4 router update the header checksum but not the TCP checksum?
  options: ["Each hop's NIC recomputes the TCP checksum in hardware", "TTL changes, and the IPv4 checksum covers only the header", "Routers are not permitted to read the TCP header at all", "TCP checksums are optional, so routers may skip them"]
  answer: 1
  explanation: >-
    TTL is in the IP header and changes at every hop, and the IPv4 checksum covers only that header, so it must change with it (incrementally, via RFC 1624). The TCP checksum covers the pseudo-header, TCP header and data, none of which a plain router modifies. A NAT does modify addresses and ports, which is why it must patch the TCP checksum too.
- q: >-
    A CRC with generator polynomial G of degree 32 is guaranteed to detect which of these?
  options: ["Any error that flips exactly 64 scattered bits", "Any burst of 32 or fewer consecutive flipped bits", "Any error at all, of any length or pattern", "Any change by an attacker who cannot see the data"]
  answer: 1
  explanation: >-
    An undetected error must be a multiple of G, and a burst of length at most 32 cannot be. Longer or scattered errors are caught with probability about 1 − 2^−32, not with certainty. CRC is linear, so an attacker can fix it up for any chosen bit flips without seeing the data.
- q: >-
    You append SHA-256(message) to each message on a plaintext TCP connection to detect tampering. What is wrong?
  options: ["SHA-256 is too slow to run on every message", "Anyone can recompute the hash; use a MAC", "SHA-256 cannot detect errors of a single bit", "Nothing, because SHA-256 is collision-resistant"]
  answer: 1
  explanation: >-
    A hash detects accidental corruption and lets you compare against a digest you already trust, but on the same channel it provides no authenticity: anyone who can modify the message can recompute the hash. A keyed MAC (HMAC or an AEAD cipher) binds the tag to a secret key; that is what TLS does for every record. Speed is not the issue: SHA-256 ran at 2.8 GB/s on the lesson's machine.
- q: >-
    A host's TLS connections to one storage node fail intermittently with bad_record_mac, while connections to other nodes are fine. What is the most likely class of cause?
  options: ["Corruption on that path that TCP did not catch", "Congestion control is backing off on that path", "DNS resolves that node's name to the wrong host", "The storage node's certificate has expired"]
  answer: 0
  explanation: >-
    The AEAD tag fails when record bytes change after encryption. Certificate and DNS problems fail at handshake time, not mid-stream, and congestion causes delay rather than bad records. Localised bad_record_mac errors are a classic symptom of hardware or middlebox corruption (a faulty NIC, memory or switch) that the 16-bit TCP checksum let through.
```
