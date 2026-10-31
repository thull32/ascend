---
slug: ip-in-subnet
title: IP in Subnet
difficulty: easy
patterns: [bit-manipulation]
lists: [network-practice, ascend-150]
companies: [cisco, cloudflare, nvidia, amazon]
order: 2
lesson: fabric-networking/from-zero/ip-addressing-and-subnets
hints:
  - "Turn each dotted quad into one 32-bit integer, `(a << 24) | (b << 16) | (c << 8) | d`. Once both the block and the address are numbers, membership is a single comparison, not four octet comparisons."
  - "A /L block fixes the top L bits and leaves the rest free. Build a mask with L ones followed by 32 - L zeros; an address is inside exactly when `address & mask == network & mask`."
  - "Test your mask at both ends. A /32 mask is all ones and a /0 mask is zero. In JavaScript, `x << 32` shifts by 0 (shift counts are taken mod 32) and `<<` produces signed results, so special-case /0 and finish with `>>> 0`."
signatures:
  python:
    name: ip_in_subnet
    starter: |
      def ip_in_subnet(cidr: str, addresses: list[str]) -> list[bool]:
          pass
  javascript:
    name: ip_in_subnet
    starter: |
      function ip_in_subnet(cidr, addresses) {
      }
tests:
  - args: ["10.1.1.0/24", ["10.1.1.10", "10.1.1.11", "10.1.2.20", "10.1.1.0", "10.1.1.255"]]
    expected: [true, true, false, true, true]
    label: "Acme's /24: network and broadcast addresses are inside"
  - args: ["10.254.1.0/31", ["10.254.1.0", "10.254.1.1", "10.254.1.2", "10.254.0.255"]]
    expected: [true, true, false, false]
    label: "/31 point-to-point link: exactly two members"
  - args: ["10.255.1.11/32", ["10.255.1.11", "10.255.1.12", "10.255.1.10"]]
    expected: [true, false, false]
    label: "/32 loopback: exactly one member"
  - args: ["0.0.0.0/0", ["203.0.113.9", "0.0.0.0", "255.255.255.255", "172.16.1.11"]]
    expected: [true, true, true, true]
    label: "/0 contains every address"
  - args: ["172.16.0.0/16", ["172.16.1.11", "172.16.255.255", "172.17.0.1", "172.15.255.255"]]
    expected: [true, true, false, false]
    label: "management /16: octet boundaries"
  - args: ["203.0.113.0/24", []]
    expected: []
    label: "no addresses"
  - args: ["10.254.19.9/20", ["10.254.16.0", "10.254.31.255", "10.254.32.0", "10.254.15.255", "10.254.19.9"]]
    expected: [true, true, false, false, true]
    hidden: true
    label: "host bits set in the block, boundary inside an octet"
  - args: ["10.1.1.0/24", ["10.1.10.1", "10.1.1.100", "10.1.11.1", "10.1.1.1", "10.1.10.1", "10.1.1.1"]]
    expected: [false, true, false, true, false, true]
    hidden: true
    label: "string-prefix trap with duplicates: 10.1.10.1 is not in 10.1.1.0/24"
  - args: ["198.51.100.200/25", ["198.51.100.128", "198.51.100.127", "198.51.100.255", "198.51.101.128"]]
    expected: [true, false, true, false]
    hidden: true
    label: "first octet above 127 and host bits set"
  - args: ["128.0.0.0/1", ["127.255.255.255", "128.0.0.0", "255.255.255.255", "0.0.0.0"]]
    expected: [false, true, true, false]
    hidden: true
    label: "/1: only the top bit counts"
  - args: ["198.51.100.7/0", ["192.0.2.1"]]
    expected: [true]
    hidden: true
    label: "/0 written with host bits set, a single address"
  - args: ["10.250.77.3/13", ["10.247.31.62", "10.247.182.195", "11.0.167.1", "10.251.20.123", "10.247.249.54", "10.255.106.168", "10.247.95.90", "10.255.208.101", "10.254.71.236", "10.255.41.100", "11.0.91.239", "11.0.58.163", "10.248.199.92", "10.255.82.65", "10.247.219.228", "10.247.61.225", "10.247.152.146", "10.248.161.45", "11.0.216.90", "10.255.234.101", "10.255.122.16", "10.255.198.159", "10.246.252.102", "11.0.160.182", "11.0.207.237", "11.0.165.126", "10.247.145.214", "10.247.63.207", "10.254.221.183", "10.253.62.81", "10.248.0.0", "10.255.255.255", "10.247.255.255", "11.0.0.0"]]
    expected: [false, false, false, true, false, true, false, true, true, true, false, false, true, true, false, false, false, true, false, true, true, true, false, false, false, false, false, false, true, true, true, true, false, false]
    hidden: true
    label: "a /13 with 34 addresses near both edges"
time_limit_ms: 4000
---
Every host and every router keeps asking one small question: is this address inside that block? A server asks it before sending each packet, to decide whether the destination is on its own link or must go via the gateway. A firewall rule, a prefix filter and an IP address management (IPAM) tool all ask it too. This problem asks you to answer it with integer arithmetic and a mask.

### The networking idea in one minute

An IPv4 address is a 32-bit number written as four bytes in decimal, each from 0 to 255: `10.1.1.10` is `00001010 00000001 00000001 00001010`. A **CIDR block** (Classless Inter-Domain Routing notation) such as `10.1.1.0/24` names a set of addresses: every address whose first 24 bits equal the first 24 bits of `10.1.1.0`. The number after the slash is the **prefix length** `L`. The top `L` bits are the network part and are fixed; the remaining `32 - L` bits are the host part and may be anything. So a `/24` holds 2⁸ = 256 addresses, a `/31` holds 2, a `/32` holds exactly 1, and `0.0.0.0/0` holds all 2³² of them.

The **subnet mask** is that rule written as a number: `L` one bits followed by `32 - L` zero bits. For a `/24` it is `255.255.255.0`. ANDing any address with the mask erases its host bits and leaves its network part, so two addresses are in the same `/L` block exactly when they are equal after the AND.

Three prefix lengths matter in a data centre fabric. Meridian, the reference operator in this track, numbers each point-to-point link between a leaf switch and a spine switch with a `/31`: two addresses, one for each end (RFC 3021). It gives each router a `/32` **loopback**, a single address that identifies the device itself. And the **default route** `0.0.0.0/0` matches every address. The examples use Meridian's private `10.0.0.0/8` and `172.16.0.0/16` space and the ranges reserved for documentation (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`, RFC 5737).

### The task

Write `ip_in_subnet(cidr, addresses)`.

- `cidr` is a string `"a.b.c.d/L"` with `0 ≤ L ≤ 32`. Only its first `L` bits count: if the address part has host bits set, as in `"10.1.1.10/24"` (an interface address written with its prefix length), the block is the network it names, `10.1.1.0/24`.
- `addresses` is a list of IPv4 addresses `"a.b.c.d"`.

Return a list of booleans, one per address in order: `True` if the address is inside the block, `False` otherwise. The question is membership, not usability: a `/24`'s network address (`.0`) and broadcast address (`.255`) are inside the block even though neither is assigned to a host.

Do it in `O(1)` per address with integer arithmetic. No string prefix comparisons and no enumeration of the block.

### Examples

| `cidr` | `addresses` | Output | Why |
|---|---|---|---|
| `"10.1.1.0/24"` | `["10.1.1.10", "10.1.1.11", "10.1.2.20", "10.1.1.0", "10.1.1.255"]` | `[True, True, False, True, True]` | This is tenant Acme's subnet. `acme-web1` (`10.1.1.10`) runs this test before every send: `10.1.1.11` is on its link, so it delivers directly; `10.1.2.20` (`acme-db1`) is not, so the packet goes to the gateway. The network and broadcast addresses are members. |
| `"10.254.1.0/31"` | `["10.254.1.0", "10.254.1.1", "10.254.1.2", "10.254.0.255"]` | `[True, True, False, False]` | The link between `leaf1.ams` and `spine1.ams`: the spine has `.0` and the leaf `.1`. A `/31` has one host bit, so it holds exactly those two. |
| `"0.0.0.0/0"` and `"10.255.1.11/32"` | `["203.0.113.9", "10.255.1.11", "10.255.1.12"]` | `[True, True, True]` and `[False, True, False]` | The `/0` mask is all zeros, so every address ANDs to `0.0.0.0`. The `/32` is `leaf1.ams`'s loopback; only that one address is a member. |

One more, with the boundary inside an octet. `"10.254.19.9/20"` has host bits set, so it means `10.254.16.0/20`. The third octet, 19, is `0001 0011`; a `/20` keeps 16 + 4 bits, the top four bits of that octet (`0001`), so the block runs from `10.254.16.0` to `10.254.31.255`. `10.254.31.255` is in; `10.254.32.0` is not.

### Constraints

- `0 ≤ len(addresses) ≤ 10⁵`
- `cidr` and every address are valid dotted-quad IPv4 strings with no leading zeros; `0 ≤ L ≤ 32`.

### Follow-up

"Now the block is not one prefix but an allow list of 10⁵ prefixes, and you must answer, per address, whether any of them contains it. Then: two teams each claim a block for a new site; write the check that says whether `a/L1` and `b/L2` overlap, and tell me why the answer for CIDR blocks is simpler than for arbitrary ranges."

## Solution

### The naive approach

There are two tempting shortcuts and both are wrong or slow.

The first is string comparison: "`10.1.1.0/24` means the address starts with `10.1.1.`". That only works when `L` is a multiple of 8, and even then it is easy to get subtly wrong: `"10.1.10.1".startswith("10.1.1")` is true. For a `/20` or a `/31` there is no textual prefix at all, because the boundary falls inside an octet.

The second is enumeration: generate every address in the block and put them in a set. That is correct, and it costs `O(2^(32-L))` time and memory: 256 for a `/24`, about 4.3 billion for a `/0`. State it in one sentence to show you know why the mask exists, then move on.

### The insight

Membership in a `/L` block depends only on the top `L` bits. Once an address is a 32-bit integer, "keep the top `L` bits and erase the rest" is one AND with a mask. Compute the block's network once by masking its address (which also discards any host bits the input carried), then mask each address and compare. Everything is integer arithmetic on fixed-width numbers, so each check is `O(1)`.

An equivalent way to say it: a CIDR block is the contiguous integer range from `network` to `network | ~mask` (the broadcast address), so `network ≤ x ≤ broadcast` is the same test. The AND form is what hardware and kernels use; the range form is useful when you later sort blocks.

### The optimal approach

1. Parse a dotted quad into an integer: `(a << 24) | (b << 16) | (c << 8) | d`.
2. Build the mask: all ones shifted left by `32 - L`, truncated to 32 bits. For `L = 32` the shift is 0 and the mask is `0xFFFFFFFF`; for `L = 0` every one bit is shifted out and the mask is `0`.
3. `network = parse(block address) & mask`.
4. For each address, `(parse(address) & mask) == network`.

```python
FULL = 0xFFFFFFFF                                    # 32 one bits


def _to_int(addr: str) -> int:
    a, b, c, d = (int(part) for part in addr.split("."))
    return (a << 24) | (b << 16) | (c << 8) | d


def ip_in_subnet(cidr: str, addresses: list[str]) -> list[bool]:
    block, length = cidr.split("/")
    length = int(length)
    mask = (FULL << (32 - length)) & FULL            # L ones, then 32 - L zeros; /0 gives 0
    network = _to_int(block) & mask                  # discards host bits in the input
    return [(_to_int(addr) & mask) == network for addr in addresses]
```

Trace the `/31` example. `10.254.1.0` is `0x0AFE0100`. The mask is `FULL << 1`, truncated: `0xFFFFFFFE`, which is `255.255.255.254`. The network is `0x0AFE0100`. `10.254.1.1` is `0x0AFE0101`; ANDing clears its last bit and gives `0x0AFE0100`, a match. `10.254.1.2` is `0x0AFE0102`; its last bit is already 0, so it stays `0x0AFE0102`, which differs from the network in bit 1, so it is outside.

**Complexity.** Parsing the block and building the mask is `O(1)`. Each address costs `O(1)`: a parse of a fixed-length string and one AND and compare. Total time `O(n)` for `n` addresses, and `O(n)` space for the output list (`O(1)` extra beyond it).

In JavaScript the same code needs two adjustments, and they are the classic bugs. Bitwise operators work on signed 32-bit integers, so `200 << 24` is negative and must be brought back to an unsigned value with `>>> 0` before you compare. And shift counts are taken modulo 32, so `0xFFFFFFFF << 32` is `0xFFFFFFFF << 0`, which makes a `/0` mask all ones instead of zero; handle `L = 0` explicitly.

```javascript
function ip_in_subnet(cidr, addresses) {
  const toInt = (s) => {
    const [a, b, c, d] = s.split(".").map(Number);
    return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
  };
  const [block, lenStr] = cidr.split("/");
  const len = Number(lenStr);
  const mask = len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
  const network = (toInt(block) & mask) >>> 0;
  return addresses.map((addr) => ((toInt(addr) & mask) >>> 0) === network);
}
```

### Common mistakes

- **String prefixes.** `startswith("10.1.1")` accepts `10.1.10.1` and `10.1.100.7`, and there is no string rule at all for a `/20` or `/31`.
- **Not masking the block's own address.** Comparing `addr & mask` with the raw parsed `10.254.19.9` never matches, because the right side still carries host bits. Mask both sides.
- **The `/0` mask in JavaScript or C.** A shift by the full word width is undefined in C and taken mod 32 in JavaScript, so `~0 << 32` is not 0. Special-case it, or build the mask as `~((1 << (32 - L)) - 1)` with wide integers.
- **Signed results.** In JavaScript and Java, any address with a first octet of 128 or more is negative after `<<`. Equality of two values masked the same way still works, but a range comparison (`network ≤ x ≤ broadcast`) breaks. Normalise with `>>> 0`.
- **Treating network and broadcast addresses as outside.** That is a separate question (is this a usable host address?), and its answer changes for `/31` and `/32`, where there are no network or broadcast addresses to exclude.
- **Building a mask from octets.** Computing per-octet masks with `if` chains for `L` in 0–8, 9–16 and so on is long and easy to get wrong by one octet. One shift does the whole job.

### How to discuss it

Start with the model: an address is a 32-bit integer and a `/L` block fixes its top `L` bits. Say "mask with `L` ones, compare networks," and write it. Then volunteer the edges before the interviewer asks: `/32` is all ones (one member), `/31` has two members and no broadcast, `/0` is zero (everything matches) and is the one that breaks naive shift code. Mention that you mask the block's own address because interface addresses are usually written with host bits (`10.1.1.10/24`). Trace one address with a boundary inside an octet, such as `10.254.31.255` against `10.254.16.0/20`, to show the arithmetic does not care about octets.

For the follow-up: many prefixes means you want longest-prefix-match machinery, a binary trie over the prefix bits (see [Longest Prefix Match](/practice/longest-prefix-match)), or, if you only need "is it in any block", merge the blocks into sorted disjoint integer ranges and binary-search each address in `O(log R)`. For overlap, two CIDR blocks are either nested or disjoint, never partially overlapping, because each is an aligned power-of-two range. So `a/L1` and `b/L2` overlap exactly when they agree on the first `min(L1, L2)` bits: one mask with the shorter length, one comparison. Arbitrary ranges need the general interval test `start1 ≤ end2 and start2 ≤ end1`.

### Networking follow-ups

A network-org interviewer will push from the arithmetic to where it runs and how it goes wrong.

- **"Where does this exact check run on every packet?"** On the sending host. Configuring `10.1.1.10/24` installs a connected route for `10.1.1.0/24`, and before transmitting, the host's route lookup tests the destination against it with exactly this AND and compare. A match means "on-link": resolve the destination's MAC with ARP and send directly. No match means "off-link": send the frame to the default gateway's MAC instead. The [ARP and default gateway lesson](/learn/fabric-networking/from-zero/arp-and-the-default-gateway) walks through that decision. The common wrong answer is that the router decides; the router only sees packets the host already chose to send to it.
- **"What happens when a host has the wrong mask?"** Say `acme-web1` is configured `10.1.1.10/16` instead of `/24`. It now believes `10.1.2.20` is on-link and ARPs for it directly instead of using the gateway. The ARP goes unanswered on Acme's segment (unless a router answers it by proxy ARP), so that one host cannot reach `acme-db1` while every other host can. The signal is an `INCOMPLETE` (or `FAILED`) neighbour entry on the host for an address outside its real subnet. Troubleshooting starts by asking whether it is one host or many, and one host with a mask mismatch fits that pattern exactly.
- **"Why do the two ends of a /31 have to agree?"** If `spine1.ams` has `10.254.1.0/31` and `leaf1.ams` is misconfigured as `10.254.1.1/30`, the leaf's block is `10.254.1.0–10.254.1.3` and it sees the spine's address as its network address, which some stacks refuse to send to. The link is up, and protocols whose hellos run at layer 2 may even form adjacencies over it, but pinging the peer's link address can fail (Linux, for one, installs the network address of a `/30` as a broadcast address). A config check for a fabric is this problem applied to both ends: same `/31`, one even and one odd.
- **"Two tenants use 10.1.1.0/24. Is 10.1.1.10 in it?"** Meridian's Acme and Globex both use that subnet, in separate VRFs (virtual routing and forwarding instances, independent routing tables on the same switches). Membership is only meaningful together with the VRF, so a tool that checks addresses or detects overlaps must key on `(vrf, prefix)`, or it will flag every tenant as conflicting with every other.
- **"IPv6?"** The same algorithm on 128-bit integers. Python's integers are arbitrary precision, so the reference works unchanged with a 128-bit `FULL`; in JavaScript you need `BigInt` or a pair of 64-bit halves. LANs are `/64`, router links may use `/127` (the IPv6 counterpart of a `/31`, RFC 6164). A practical trap: a dual-stack socket reports an IPv4 client as the IPv4-mapped address `::ffff:10.1.1.10`, which is not inside the IPv4 block `10.1.1.0/24` unless your allow-list check unwraps it first.
- **"Wildcard masks?"** Some access-list syntaxes write the inverse mask, where 1 bits mean "ignore this bit" (`0.0.0.255` for a `/24`). The arithmetic is `(addr & ~wildcard) == (network & ~wildcard)`. Because a wildcard can in principle be non-contiguous, a tool that converts it to CIDR must check that it is a run of zeros followed by a run of ones and reject it otherwise.
- **"What should a platform built on this surface?"** An IPAM or validation service should report, before a change is pushed: blocks that overlap within one VRF, interfaces whose address is not inside the subnet its link is planned for, `/31` pairs that do not share a block, and host bits set where a network was expected (`10.1.1.10/24` in a route filter usually means a typo for `10.1.1.0/24`). Parsing deserves care too: some address parsers historically read leading zeros as octal (`010.1.1.1` as `8.1.1.1`) while others read them as decimal, which turned allow-list checks into bypasses; reject leading zeros rather than guess.
