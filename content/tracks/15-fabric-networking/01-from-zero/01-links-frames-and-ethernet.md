---
slug: links-frames-and-ethernet
title: "Links, frames and Ethernet: one frame across one cable"
description: What a NIC, a port and a link are, how link speeds from 1G to 800G are built from lanes, serialisation and propagation delay worked with real numbers, the Ethernet frame built byte by byte with its CRC, MAC addresses decoded bit by bit, MTU 1500 versus jumbo frames, full duplex, and what an interface counter really is.
minutes: 40
difficulty: intro
tags: [fabric-networking, ethernet, frames, mac-address, mtu, jumbo-frames, serialisation-delay, propagation-delay, interface-counters, full-duplex]
problems: []
---
Every packet in a data center, a BGP update, a VXLAN tunnel, an RDMA write between two GPUs, crosses the network one cable at a time, inside an Ethernet frame. Before anything is routed, the two ends of a cable must agree where a message starts and ends, who it is for, what it carries and whether it arrived intact, and each crossing takes a number of nanoseconds you can calculate. This lesson builds one frame byte by byte and puts numbers on everything that happens to it on one link.

The running example is one cable: Acme's web server `acme-web1` plugged into `leaf1.ams`, the top-of-rack switch in Meridian's Amsterdam site. A **leaf** is the switch servers plug into; a **spine** is a switch that only interconnects leaves. [Clos and leaf-spine](/learn/fabric-networking/fabric-architecture/clos-and-leaf-spine) explains the shape.

## NICs, ports and links

A **NIC** (network interface card) is the chip, usually on a PCIe card, that turns bytes in a computer's memory into signals on a cable and back. On Meridian's GPU servers in San Jose every GPU has its own 400 Gb/s NIC of the ConnectX-7 class. A **port** is one socket on a switch or NIC; a switch is a box of ports around a switching chip. A **link** is two ports and the medium between them: a copper cable, or a pair of optical transceivers (pluggable modules that convert electrical signals to light) and fibre between them. [Optics, cabling and the physical layer](/learn/fabric-networking/fabric-architecture/optics-cabling-and-the-physical-layer) covers the hardware.

Software sees a port as an **interface**: `eth0` on a Linux server, `swp1` on Cumulus Linux, `Ethernet0` on SONiC, `Ethernet1/1` on Arista EOS, `et-0/0/0` on Juniper Junos.

| End | Device | Interface | Speed | MAC address |
|---|---|---|---|---|
| Server | `acme-web1` | `eth0` | 100 Gb/s | 00:00:5e:00:53:0a |
| Leaf, server side | `leaf1.ams` | `swp1` (port 1) | 100 Gb/s | (switch port) |
| Leaf, uplink | `leaf1.ams` | `swp51`, to `spine1.ams` | 400 Gb/s | 00:00:5e:00:53:80 |

A link has two states. **Administrative state** is what someone configured: enabled or shut down. **Operational state** is what the hardware reports: up only when both ends' physical layers have locked onto each other's signal at an agreed speed. "Admin up, oper down" means enabled but nothing usable arriving: an unplugged cable, a dead optic, the far end shut, or no common speed.

**What a link solves:** a private channel between exactly two interfaces. **How it breaks:** it goes down (carrier lost), flaps (up and down repeatedly), or comes up degraded, at a lower speed or with errors. **Signal:** operational state and the time of the last change, a flap count, the negotiated speed against the intended one, and the error counters below.

## Link speeds from 1G to 800G

Ethernet speeds count bits per second of data the MAC layer (the part of the NIC that builds frames) can send, in decimal units: 400 Gb/s is 400 × 10⁹ bits, or 50 GB/s. Networks count bits, storage counts bytes.

High speeds are built from **lanes**, each one electrical or optical channel, bundled into a port. Each generation adds lanes or makes them faster; since about 2017 fast lanes use **PAM4** signalling (four signal levels, two bits per symbol) instead of **NRZ** (two levels, one bit), doubling the bits per symbol at the cost of noise margin.

| Speed | IEEE standard (year) | Lanes × rate per lane | Signalling | Typical use in a 2020s data center |
|---|---|---|---|---|
| 1 Gb/s | 802.3ab, copper (1999) | 4 pairs, all both ways | PAM-5 | Out-of-band management (Meridian's `172.16.0.0/16`) |
| 10 Gb/s | 802.3ae (2002) | 1 × 10G | NRZ | Older servers |
| 25 Gb/s | 802.3by (2016) | 1 × 25G | NRZ | Servers, a few years ago the default |
| 100 Gb/s | 802.3ba (2010), 802.3bm (2015), single-lane 802.3ck/cu (2021–22) | 10 × 10G at first, then 4 × 25G, now 1 × 100G | NRZ; PAM4 for 1 × 100G | Servers, older uplinks |
| 400 Gb/s | 802.3bs (2017) | 8 × 50G, or 4 × 100G | PAM4 | Leaf-spine links, AI NICs (Meridian's fabric) |
| 800 Gb/s | 802.3df (2024) | 8 × 100G | PAM4 | AI spines, newest NICs (ConnectX-8 class) |

Lanes explain three things. **Breakouts:** a 400G port of four 100G lanes can be split into four 100G links. **Switch capacity:** a 51.2 Tb/s chip (NVIDIA Spectrum-4 and Broadcom Tomahawk 5 are this class) is 64 ports of 800G or 128 of 400G from the same lanes. **Partial failures:** a port can come up with fewer working lanes at a lower speed (failure modes, below).

## Bits on the wire

Between the frame and the cable sits the **PHY** (physical layer device), with three jobs invisible to software until something goes wrong.

1. **Encoding.** Links of 10 Gb/s and faster use a **64b/66b** block code: every 64 bits of data get a 2-bit header, and the 64 data bits are scrambled. That guarantees enough transitions for the receiver to recover the sender's clock (there is no clock wire) and marks control blocks such as "idle" and "start of frame". The cost is 66/64: a 10 Gb/s link signals at 10.3125 billion symbols a second (GBd) so the MAC gets its full 10 Gb/s.
2. **Forward error correction (FEC).** PAM4 lanes are noisy enough that the standards budget for raw bit errors, up to roughly 2 in 10,000 bits. A Reed-Solomon code, RS(544,514), adds 30 check symbols to every 514 data symbols and repairs up to 15 damaged symbols per block. A 100G PAM4 lane runs at 53.125 GBd, two bits per symbol, to carry 100 Gb/s plus that overhead.
3. **Never being silent.** With no frame to send, the PHY sends idle blocks continuously, and a link is "up" while the receiver stays locked onto valid blocks. When the signal disappears it reports a *local fault* within microseconds and sends *remote fault* blocks back, so the far end takes the link down too, even if only one fibre broke.

Within each byte, Ethernet transmits the **least significant bit first**, which matters for MAC addresses.

**What the PHY solves:** clock recovery, framing and error correction at billions of symbols a second. **How it breaks:** a dirty connector, a bent fibre or a failing laser raises the raw error rate; FEC hides it until it cannot, and then whole frames fail their check. **Signal:** corrected FEC codewords trending up (margin eroding, the early warning), then uncorrectable codewords and FCS errors, and the optic's light levels.

## Full duplex: two one-way roads

Original Ethernet (1980) was a shared coaxial cable: every station heard every frame, and two that transmitted together **collided**. CSMA/CD (carrier sense, multiple access, collision detection) handled it: listen first, detect a collision while sending, back off randomly, retry. That is **half duplex**: one direction at a time.

Every data center link is **full duplex**: two independent one-way channels (separate fibres, or on copper both directions on the same pairs with echo cancellation). A 400G link carries 400 Gb/s each way at once; Ethernet at 10 Gb/s and above has no half-duplex mode. Three consequences:

- **Utilisation is per direction.** A link sending 390 Gb/s and receiving 50 Gb/s is saturated outbound; a tool that adds or averages the directions hides it.
- **Contention moved into the switch.** Two 400G inputs aiming at one 400G output fill its buffer, then drop: the congestion of later lessons, up to [PFC](/learn/fabric-networking/ai-fabrics/lossless-ethernet-pfc-ecn-dcqcn).
- **Flow control became possible.** IEEE 802.3x PAUSE frames (EtherType 0x8808, sent to `01:80:c2:00:00:01`) let a receiver ask its neighbour to pause, which needs a free reverse channel. Priority Flow Control, the basis of lossless RoCE, is its per-priority descendant.

**What full duplex solves:** collisions, and the distance limit that collision detection imposed. **How it breaks:** a **duplex mismatch**, still possible on 10/100 Mb/s copper when one end has autonegotiation off and falls back to half duplex. **Signal:** fine at low load; under load the half-duplex side counts *late collisions*, the other counts FCS errors and runts, and throughput collapses while ping works. At Meridian it can only happen on the copper management network.

## The Ethernet frame, field by field

`acme-web1` opens a TCP connection to Acme's database `acme-db1` (`10.1.2.20`), in another subnet. Its first packet is a 60-byte SYN (the opening segment of TCP's handshake), which [the packet walk](/learn/fabric-networking/from-zero/the-packet-walk) follows through the fabric. The destination is off-subnet, so this frame goes to the gateway, `leaf1.ams`, at the anycast gateway MAC `00:00:5e:00:01:01` that every Meridian leaf shares ([ARP and the default gateway](/learn/fabric-networking/from-zero/arp-and-the-default-gateway) shows how the server learns it).

| Field | Size | Value in this frame | What reads it |
|---|---|---|---|
| Preamble | 7 bytes | `55 55 55 55 55 55 55` | The receiving PHY, to lock onto bit timing |
| Start frame delimiter (SFD) | 1 byte | `d5` | The receiving PHY: the frame starts after this |
| Destination MAC | 6 bytes | `00:00:5e:00:01:01` (leaf1's gateway) | Every switch: where to send it; the receiver: is it for me? |
| Source MAC | 6 bytes | `00:00:5e:00:53:0a` (acme-web1) | Switches, to learn where the sender is |
| EtherType | 2 bytes | `08 00` (IPv4) | The receiver: which protocol to hand the payload to |
| Payload | 46 to 1,500 bytes | the 60-byte IPv4 packet | The IP layer |
| Frame check sequence (FCS) | 4 bytes | `27 d7 94 6d` (CRC-32) | The receiving MAC: was anything corrupted? |
| Interframe gap | 12 bytes of idle | (nothing) | Nobody; a mandatory pause before the next frame |

The **destination MAC comes first** on purpose: a switch can choose the output port after 6 bytes and, forwarding cut-through, start sending before the rest arrives. The **frame size** that counters report runs from destination MAC to FCS: 14 bytes of header, the payload and 4 of FCS, here 78 bytes. Preamble and gap are not counted, but they occupy the wire.

### EtherType: what is inside

The values you will meet in this track:

| EtherType | Protocol | Where it appears |
|---|---|---|
| `0x0800` | IPv4 | Almost everything |
| `0x86DD` | IPv6 | Dual-stack hosts, BGP unnumbered |
| `0x0806` | ARP | Finding a neighbour's MAC ([ARP](/learn/fabric-networking/from-zero/arp-and-the-default-gateway)) |
| `0x8100` | 802.1Q VLAN tag | Inserted *before* the real EtherType, adding 4 bytes ([VLANs](/learn/fabric-networking/from-zero/switches-vlans-and-loops)) |
| `0x88CC` | LLDP | Neighbours announcing who they are, used to check cabling |
| `0x8808` | MAC control (PAUSE, PFC) | Flow control on full-duplex links |
| `0x8915` | RoCE version 1 | RDMA over raw Ethernet; RoCEv2 rides on IPv4/UDP instead ([InfiniBand and RoCE](/learn/fabric-networking/ai-fabrics/infiniband-and-roce)) |

A value of 1,500 or less here is not a type: the IEEE 802.3 format put a length there and named the protocol in a following LLC header (logical link control). Types start at `0x0600` (1,536), so the formats never collide. IS-IS, Meridian's underlay routing protocol, still uses length plus LLC, which is why it runs "directly on layer 2" rather than over IP ([IS-IS from zero](/learn/fabric-networking/underlay/is-is-from-zero)).

### Padding and the 64-byte minimum

A frame may not be shorter than 64 bytes, so a payload under 46 bytes is padded with zeros. The reason is collision detection: a sender had to still be transmitting when news of a collision returned from the far end. At 10 Mb/s the slot time of 512 bit times (51.2 µs) covered a round trip across the largest network allowed, about 2.5 km. Full duplex removed collisions, but the minimum stayed for compatibility; shorter frames are counted as **runts** (bad FCS: collision fragments or corruption) or **undersize** (good FCS: usually a software bug).

### The FCS: a CRC-32 over the whole frame

The **FCS** is a CRC-32 (cyclic redundancy check, a 32-bit remainder of polynomial division, worked by hand in [error detection](/learn/networking/network-algorithms/error-detection)) computed by the sender's NIC over every byte from the destination MAC to the end of the payload. The receiver runs the same CRC over the frame *including* the FCS; an undamaged frame always leaves the fixed remainder `0x2144DF1C`, so hardware checks it as the bytes stream in, without knowing in advance where the frame ends. CRC-32 catches every error burst up to 32 bits and every error of up to three bits in frames up to about 11 KB, an argument often given for why jumbo frames stop near 9 KB. A failed frame is dropped and counted as an **FCS error** (or CRC error).

Because every switch builds a new frame and computes a new FCS ([the packet walk](/learn/fabric-networking/from-zero/the-packet-walk)), an FCS error describes damage on the one link it was received from. The exception is a cut-through switch, which has already started forwarding when it finds a bad FCS: it ends the outgoing frame with a deliberately invalid ("stomped") FCS, so the next switch counts an error that happened one link earlier.

**What the FCS solves:** a receiver can tell, in hardware and at line rate, that a frame is damaged. **How it breaks:** it only detects. Ethernet does not retransmit a damaged frame and the sender is not told, so TCP recovers a round trip later and a few errors per million frames become a slow application. **Signal:** FCS errors per billion frames on the receiving port, beside its FEC counters.

The visualisation builds a full-size frame instead of the SYN, since serialisation matters most at full size.

```viz
{"type": "fabric", "scenario": "ethernet-frame", "title": "One 1,518-byte frame built field by field, then serialised at 1, 10, 100 and 400 Gb/s", "caption": "acme-web1's NIC builds a frame for leaf1.ams: preamble and SFD, the gateway's destination MAC, its own source MAC, EtherType 0x0800, a 1,500-byte IPv4 payload and the CRC-32 FCS. With preamble and gap it occupies 12,304 bits of wire time, which take 12.304 µs at 1 Gb/s and 30.76 ns at 400 Gb/s; propagation is compared at 100 m and Amsterdam to Singapore, and a second frame with one flipped bit is dropped and counted as an FCS error."}
```

### The frame in code

The code below builds the SYN's frame from real bytes, with the same IP header as in the packet walk (checksum `0xe97d`), computes the FCS, checks it the way the receiver does, and flips one bit.

```python
import socket
import struct
import zlib


def checksum(data: bytes) -> int:
    if len(data) % 2:
        data += b"\x00"
    total = sum(struct.unpack(f"!{len(data) // 2}H", data))
    while total >> 16:                          # fold carries (one's complement)
        total = (total & 0xFFFF) + (total >> 16)
    return ~total & 0xFFFF


def tcp_syn(src, dst, sport, dport, seq):
    opts = bytes.fromhex("020405b4" "0402" "080a0000000100000000" "01" "030307")
    hdr = struct.pack("!HHIIBBHHH", sport, dport, seq, 0, 10 << 4, 0x02, 64240, 0, 0) + opts
    pseudo = socket.inet_aton(src) + socket.inet_aton(dst) + struct.pack("!BBH", 0, 6, len(hdr))
    csum = checksum(pseudo + hdr)               # TCP covers a pseudo-header too
    return hdr[:16] + struct.pack("!H", csum) + hdr[18:]


def ipv4(src, dst, payload, ttl=64, ident=0x3A1F):
    hdr = struct.pack("!BBHHHBBH4s4s", 0x45, 0, 20 + len(payload), ident, 0x4000,
                      ttl, 6, 0, socket.inet_aton(src), socket.inet_aton(dst))
    return hdr[:10] + struct.pack("!H", checksum(hdr)) + hdr[12:] + payload


def mac(text):
    return bytes.fromhex(text.replace(":", ""))


def build_frame(dst_mac, src_mac, ethertype, payload):
    body = mac(dst_mac) + mac(src_mac) + struct.pack("!H", ethertype) + payload
    body += b"\x00" * max(0, 60 - len(body))      # pad: 60 + 4 FCS = 64-byte minimum
    fcs = struct.pack("<I", zlib.crc32(body))     # CRC-32, sent low byte first
    return body + fcs


def receive(frame):
    # Hardware runs the CRC over every byte, FCS included, and checks for a fixed residue.
    return "accept" if zlib.crc32(frame) == 0x2144DF1C else "drop: FCS error, in_errors += 1"


packet = ipv4("10.1.1.10", "10.1.2.20", tcp_syn("10.1.1.10", "10.1.2.20", 51514, 5432, 1000))
frame = build_frame("00:00:5e:00:01:01", "00:00:5e:00:53:0a", 0x0800, packet)

fields = [("destination MAC", 0, 6), ("source MAC", 6, 12), ("EtherType", 12, 14),
          ("payload (IPv4)", 14, len(frame) - 4), ("FCS", len(frame) - 4, len(frame))]
for name, a, b in fields:
    shown = frame[a:b].hex(":") if "MAC" in name else frame[a:min(b, a + 12)].hex(" ")
    shown += " ..." if b - a > 12 else ""
    print(f"{name:16} bytes {a:2}-{b - 1:2} ({b - a:2} B)  {shown}")
print(f"IP checksum 0x{packet[10:12].hex()}, frame {len(frame)} B, "
      f"on the wire {len(frame) + 8 + 12} B with preamble and gap")
print("receiver:", receive(frame))
damaged = bytearray(frame)
damaged[40] ^= 0x04                               # one bit flipped in the TCP header
print("one bit flipped:", receive(bytes(damaged)))
```

```text
destination MAC  bytes  0- 5 ( 6 B)  00:00:5e:00:01:01
source MAC       bytes  6-11 ( 6 B)  00:00:5e:00:53:0a
EtherType        bytes 12-13 ( 2 B)  08 00
payload (IPv4)   bytes 14-73 (60 B)  45 00 00 3c 3a 1f 40 00 40 06 e9 7d ...
FCS              bytes 74-77 ( 4 B)  27 d7 94 6d
IP checksum 0xe97d, frame 78 B, on the wire 98 B with preamble and gap
receiver: accept
one bit flipped: drop: FCS error, in_errors += 1
```

`struct.pack("<I", ...)` writes the CRC low byte first, the order Ethernet sends it in, and `zlib.crc32(frame) == 0x2144DF1C` is the receiver's residue check. The padding line does not fire here (74 bytes exceed 60); a 28-byte ARP payload would get 18 bytes of zeros. On a real host the NIC computes the FCS, and usually the TCP checksum too (an *offload*, in [how Linux sends and receives packets](/learn/fabric-networking/from-zero/how-linux-sends-and-receives-packets)), so `tcpdump` never shows it.

## MAC addresses

A **MAC address** (media access control address) is a 48-bit interface identifier, written as six hex bytes. It means something only within one layer-2 segment (the interfaces that reach each other without a router); routers replace it at every hop. Two bits of the first byte change its meaning:

| Bit (of the first byte) | Name | 0 means | 1 means |
|---|---|---|---|
| Lowest, `0x01` | I/G (individual/group) | Unicast: one interface | Multicast: a group; all ones is broadcast |
| Second lowest, `0x02` | U/L (universal/local) | Universally administered: from a manufacturer's block | Locally administered: assigned by software |

Because Ethernet sends the low bit first, the I/G bit is **the first bit of the frame after the preamble**: a switch knows "one interface or a group" before the rest of the address arrives.

In a universal address the first three bytes are the **OUI** (organisationally unique identifier), a block the IEEE assigns to a manufacturer for a fee, and the last three are the manufacturer's serial, so every NIC leaves the factory unique. Meridian's examples use IANA's OUI `00:00:5e`: RFC 7042 reserves `00:00:5e:00:53:00` to `:ff` for documentation, and `00:00:5e:00:01:xx` is the virtual MAC block of VRRP, a gateway-redundancy protocol, which suits a shared gateway address.

```python
def classify(mac: str) -> str:
    octets = bytes.fromhex(mac.replace(":", ""))
    if octets == b"\xff" * 6:
        return f"{mac}  broadcast: every station on the segment"
    if octets[0] & 0x01:                   # I/G bit: the first bit on the wire
        return f"{mac}  multicast: stations that joined this group"
    if octets[0] & 0x02:                   # U/L bit: assigned by software
        return f"{mac}  unicast, locally administered"
    return f"{mac}  unicast, universal, OUI {octets[:3].hex(':')}"


for m in ["00:00:5e:00:53:0a",   # acme-web1's NIC (documentation range, RFC 7042)
          "00:00:5e:00:01:01",   # Meridian's anycast gateway (IANA's VRRP block)
          "ff:ff:ff:ff:ff:ff",   # broadcast: ARP requests, DHCP Discover
          "01:00:5e:00:00:05",   # IPv4 multicast 224.0.0.5 mapped to Ethernet
          "33:33:00:00:00:01",   # IPv6 all-nodes multicast
          "01:80:c2:00:00:0e",   # LLDP: consumed by the neighbour, never forwarded
          "02:42:ac:11:00:02"]:  # a container's virtual interface (Docker has long used 02:42)
    print(classify(m))


def ipv4_multicast_mac(group: str) -> str:
    a, b, c, d = (int(x) for x in group.split("."))
    low23 = ((b & 0x7F) << 16) | (c << 8) | d    # only 23 of the 28 group bits fit
    return "01:00:5e:" + ":".join(f"{(low23 >> s) & 0xFF:02x}" for s in (16, 8, 0))


print(ipv4_multicast_mac("239.1.1.1"), ipv4_multicast_mac("224.129.1.1"))
```

```text
00:00:5e:00:53:0a  unicast, universal, OUI 00:00:5e
00:00:5e:00:01:01  unicast, universal, OUI 00:00:5e
ff:ff:ff:ff:ff:ff  broadcast: every station on the segment
01:00:5e:00:00:05  multicast: stations that joined this group
33:33:00:00:00:01  multicast: stations that joined this group
01:80:c2:00:00:0e  multicast: stations that joined this group
02:42:ac:11:00:02  unicast, locally administered
01:00:5e:01:01:01 01:00:5e:01:01:01
```

The last line is a design compromise: IPv4 multicast maps a group to `01:00:5e` plus the group's low 23 bits (RFC 1112), so 32 groups share each MAC and the host's IP stack discards packets for groups it did not join. IPv6 uses `33:33` plus the low 32 bits (RFC 2464).

The type decides how a switch treats a frame ([switches, VLANs and loops](/learn/fabric-networking/from-zero/switches-vlans-and-loops)): known unicast leaves by one port, broadcast by every port in the segment, multicast by every port unless the switch tracks group membership. The `01:80:c2:00:00:0x` addresses (spanning tree, PAUSE, LLDP) belong to the link itself and are never forwarded.

**What MACs solve:** naming the right interface on a segment with no configuration. **How they break:** the namespace is flat, so MAC tables cannot be summarised the way IP prefixes can ([IP addressing and subnets](/learn/fabric-networking/from-zero/ip-addressing-and-subnets)), which caps how large a layer-2 domain can grow; cloned virtual machines carry duplicate MACs; phones randomise theirs per Wi-Fi network (the default since iOS 14 and Android 10), breaking anything that treats a MAC as identity. **Signal:** MAC-move counters (one address seen on two ports in turn), and the U/L bit set where an inventory expected a factory address.

## Serialisation and propagation delay, with numbers

A frame's one-way time across a network is the sum of four delays:

- **Serialisation** (transmission): pushing the bits onto the link, `bits / rate`. At 1 Gb/s one bit takes 1 ns.
- **Propagation:** the signal travelling down the medium. Light in glass moves at about two-thirds of its vacuum speed: **5 ns per metre**, 5 µs per kilometre, at any link speed.
- **Processing:** the switch's lookup, a few hundred nanoseconds to about a microsecond for a shallow-buffer data-center switch chip, several microseconds for a deep-buffer router chip.
- **Queueing:** waiting behind other frames in an output buffer: zero on an idle link, dominant on a busy one, and the only term that varies per packet.

The first two are arithmetic. The code adds minimum-size and jumbo frames to the viz's 1,518 bytes, then crosses Meridian's Amsterdam fabric.

```python
FIBRE_NS_PER_M = 5.0      # light in glass: about 2/3 of c, so ~5 ns per metre
OVERHEAD = 8 + 12         # preamble + SFD, interframe gap: wire time, not frame bytes


def wire_bits(frame_bytes):
    return (frame_bytes + OVERHEAD) * 8


def serialise_ns(frame_bytes, gbps):
    return wire_bits(frame_bytes) / gbps          # 1 Gb/s = 1 bit per ns


def one_way_ns(frame_bytes, links, cut_through, pipeline_ns=600, header_bytes=64):
    """links: (rate in Gb/s, length in m) per hop. Returns when the last bit lands."""
    start = 0.0                                   # first bit leaves the sender
    for i, (gbps, metres) in enumerate(links):
        prop = metres * FIBRE_NS_PER_M
        first_in = start + prop
        last_in = start + serialise_ns(frame_bytes, gbps) + prop
        if i == len(links) - 1:
            return last_in
        nxt = links[i + 1][0]
        if cut_through:
            # Start once the header is in, but never so early that egress would
            # run out of bytes (an underrun): a slow-to-fast hop cannot cut through.
            start = max(first_in + header_bytes * 8 / gbps + pipeline_ns,
                        last_in + pipeline_ns - serialise_ns(frame_bytes, nxt))
        else:
            start = last_in + pipeline_ns          # store-and-forward: wait for the FCS


for size in (64, 1518, 9018):
    row = "  ".join(f"{g:>3}G {serialise_ns(size, g):>9,.2f} ns" for g in (1, 10, 100, 400))
    pps = 400e9 / wire_bits(size)
    print(f"{size:>5} B frame: {row}   400G max {pps / 1e6:,.1f} Mpps")

# acme-web1 -> leaf1.ams -> spine1.ams -> leaf3.ams -> acme-db1
path = [(100, 3), (400, 80), (400, 80), (100, 3)]
for size in (1518, 9018):
    sf = one_way_ns(size, path, cut_through=False)
    ct = one_way_ns(size, path, cut_through=True)
    print(f"{size} B across the site: store-and-forward {sf / 1000:.2f} us, "
          f"cut-through {ct / 1000:.2f} us")
print(f"ams -> sin, 10,500 km: {10_500_000 * FIBRE_NS_PER_M / 1e6:.1f} ms one way, "
      f"whatever the link speed")
```

```text
   64 B frame:   1G    672.00 ns   10G     67.20 ns  100G      6.72 ns  400G      1.68 ns   400G max 595.2 Mpps
 1518 B frame:   1G 12,304.00 ns   10G  1,230.40 ns  100G    123.04 ns  400G     30.76 ns   400G max 32.5 Mpps
 9018 B frame:   1G 72,304.00 ns   10G  7,230.40 ns  100G    723.04 ns  400G    180.76 ns   400G max 5.5 Mpps
1518 B across the site: store-and-forward 2.94 us, cut-through 2.85 us
9018 B across the site: store-and-forward 4.44 us, cut-through 3.90 us
ams -> sin, 10,500 km: 52.5 ms one way, whatever the link speed
```

Read the output as four lessons.

1. **A faster link makes a frame shorter, not faster.** At 400 Gb/s a full-size frame lasts 30.76 ns and fits in about 6 m of fibre; at 1 Gb/s it is 2.5 km long. The first bit arrives no sooner.
2. **Inside a site, the switches and the fibre dominate.** The path above (3 m server cables, 80 m leaf-spine runs, 600 ns per switch: replace that with your chip's figure) spends 1.8 µs in three switches and 0.83 µs in glass; serialisation about 0.3 µs. Upgrading the uplinks from 400G to 800G would save about 30 ns.
3. **Cut-through barely helps here.** A **store-and-forward** switch receives the whole frame and checks its FCS before sending; a **cut-through** switch starts once it has the header. `leaf1.ams` receives at 100G and sends at 400G, so cutting through would run out of bytes to send (the `max(...)` line). The gain grows with frame size and slower links.
4. **Across sites, only distance matters.** Amsterdam to Singapore is 52.5 ms one way and 105 ms round trip at any speed ([connecting sites and backbones](/learn/fabric-networking/fabric-architecture/connecting-sites-and-backbones); [latency, bandwidth and the math](/learn/networking/networking-in-practice/latency-bandwidth-and-math) turns this into TCP throughput).

The packet rate is what switch designers fear: a 400G port of minimum-size frames needs about 595 million forwarding decisions a second (14.88 million at 10G). Chips are rated in bits and in packets per second, and small-packet floods hit the packet limit first.

| Forwarding mode | Latency per hop | Corrupted frames | Speed change (in → out) | Where it is used |
|---|---|---|---|---|
| Store-and-forward | Adds a full frame's serialisation (123 ns for 1,518 B at 100G) | Dropped at the first switch | Any | Most routers, slow-to-fast hops, every switch when the output is busy |
| Cut-through | Adds only the header's (a few ns) | Forwarded with a deliberately invalid ("stomped") FCS, dropped downstream | Same speed or fast to slow | Low-latency data-center and trading switches |

## MTU: 1500, 9000 and the bytes in between

The **MTU** (maximum transmission unit) is the largest payload a link carries in one frame: for Ethernet, the largest IP packet. The standard 1,500 bytes dates from the 1980 Ethernet specification, when buffer memory was expensive and a 1,518-byte frame held the shared 10 Mb/s cable for 1.2 ms (1,522 bytes with a VLAN tag).

**Jumbo frames** carry larger payloads, conventionally 9,000 bytes. They are not in the IEEE standard, and vendor maximums differ, often 9,216. Meridian, like most fabrics, runs its switch-to-switch links at 9,216 so that servers can use up to 9,000, because a VXLAN tunnel wraps the tenant's frame in 50 more bytes ([VXLAN encapsulation](/learn/fabric-networking/overlays-vxlan-evpn/vxlan-encapsulation)) and the fabric must carry the largest tenant packet plus that. `acme-web1` keeps the default 1,500 (Meridian's GPU and storage servers run 9,000), which is why its SYN advertises a maximum segment size (MSS, the largest TCP payload it accepts) of 1,460: 1,500 minus 40 bytes of IP and TCP headers.

```viz
{"type": "fabric", "scenario": "ethernet-frame", "payload": 9000, "title": "A 9,000-byte jumbo payload: a 9,018-byte frame, 99.6% payload, 180.76 ns at 400 Gb/s", "caption": "The same build as if acme-web1 ran a 9,000-byte MTU (it keeps 1,500; Meridian's GPU and storage servers run 9,000), which works only if every device on the link has an MTU of at least 9,000 (Meridian's fabric links run 9,216). The frame is 9,018 bytes, 72,304 bits of wire time with preamble and gap: 72.3 µs at 1 Gb/s, 180.76 ns at 400 Gb/s, and about a sixth as many frames per second as with a 1,500-byte payload."}
```

What jumbo frames buy (TCP carries 1,460 bytes per 1,538 on the wire at 1,500, and 8,960 per 9,038 at 9,000):

| MTU | TCP payload per frame | Wire efficiency | Frames per second to fill 100 Gb/s | Where it works |
|---|---|---|---|---|
| 1,500 | 1,460 B | 94.9% | 8.1 million | Everywhere, including the internet |
| 9,000 (hosts) | 8,960 B | 99.1% | 1.4 million | Inside one operator's network, end to end |
| 9,216 (fabric links) | headroom for tunnels | n/a | n/a | Switch-to-switch links under an overlay |

The efficiency gain is 4%. The real gain is **six times fewer packets**, each costing host interrupts, kernel work and a lookup; at 100 Gb/s per-packet cost decides whether a CPU core keeps up. NIC offloads that split and merge segments (TSO, GRO) recover much of it at 1,500, which is why many clouds still run 1,500 to the host. RoCE differs: its largest packet payload is 4,096 bytes, which fits only in jumbo frames, so RoCE fabrics run them end to end ([tuning and benchmarking RDMA](/learn/fabric-networking/ai-fabrics/tuning-and-benchmarking-rdma)).

### Why the same link shows two MTUs

Linux, Cumulus/NVUE and the layer-3 MTU of most switch operating systems count the IP packet, so 9,000 means a 9,018-byte frame. Junos's interface MTU includes the 14-byte Ethernet header (4 more per VLAN tag) but not the FCS, so the same link reads 9,014 there. Many cross-vendor "MTU mismatch" tickets are this.

**What MTU solves:** a maximum every device on a link agrees on, so buffers and pipelines are sized for it. **How it breaks:** two ends disagree and the receiver drops frames above its limit as **oversize** ("giants"), telling the sender nothing; a smaller-MTU hop on a path drops do-not-fragment packets with an ICMP error a firewall may filter (the path-MTU black hole, in [transport as the network sees it](/learn/fabric-networking/from-zero/transport-as-the-network-sees-it)); IS-IS pads hellos to the full MTU by default on most implementations, so a mismatch stops the adjacency forming ([underlay failures in production](/learn/fabric-networking/underlay/underlay-failures-in-production)). **Signal:** small pings work while a full-size do-not-fragment ping fails (`ping -M do -s 8972` tests 9,000: 8,972 bytes plus 28 of ICMP and IP headers); oversize counters rise on one end; the two ends' MTUs differ after normalising for vendor convention.

## What an interface counter is

An **interface counter** is an integer the NIC or switch chip increments in hardware for every event of one kind, on one port, in one direction: each byte received, each frame dropped for a bad FCS. It only goes up. A rate is the difference between two readings over the time between them, and that fact explains most of what goes wrong with network dashboards.

| Counter | Counts | When it rises, suspect |
|---|---|---|
| In / out octets | Bytes, destination MAC to FCS on switches; Linux hosts usually exclude the FCS | Nothing; it is the utilisation source |
| In / out unicast, multicast, broadcast packets | Frames by destination type | A broadcast rate climbing towards a storm ([loops](/learn/fabric-networking/from-zero/switches-vlans-and-loops)) |
| In errors: FCS / CRC | Frames that failed the check | This link: optic, cable, connector, the far end's transmitter |
| In errors: runts, oversize (giants) | Frames below 64 B or above the MTU | Collisions or a duplex mismatch; an MTU mismatch |
| FEC corrected / uncorrectable codewords | Blocks the PHY repaired, and failed to | Rising corrected: margin eroding; uncorrectable: frames being lost |
| In discards | Good frames dropped on arrival: no buffer, or policy | Host or ASIC overload; an ACL |
| Out discards | Frames dropped at the output queue | Congestion: more arriving for this port than it can send |
| Pause frames in / out | Flow-control requests | A neighbour, or this device, unable to keep up |
| Carrier transitions / flaps | Link up-down events | Physical faults, autonegotiation fights |

A server shows them like this (illustrative output, trimmed):

```text
$ ip -s link show eth0
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP mode DEFAULT
    link/ether 00:00:5e:00:53:0a brd ff:ff:ff:ff:ff:ff
    RX:  bytes         packets      errors  dropped  missed  mcast
     61802233011456     44120384561     41        0       0   1022
    TX:  bytes         packets      errors  dropped  carrier collsns
     59911873290112     42998001221      0        0       0       0
$ ethtool eth0 | grep -E 'Speed|Duplex|Link detected'
	Speed: 100000Mb/s
	Duplex: Full
	Link detected: yes
$ ethtool -S eth0 | grep -E 'crc|symbol|corrected|out_of_buffer|pause'   # ConnectX-style names; they vary by driver
     rx_crc_errors_phy: 41
     rx_symbol_err_phy: 0
     rx_corrected_bits_phy: 18834
     rx_out_of_buffer: 0
     rx_pause_ctrl_phy: 0
     tx_pause_ctrl_phy: 0
```

`LOWER_UP` is the operational state, `UP` the administrative one. The 41 receive errors are all FCS errors: damage on the cable from `leaf1.ams`. `rx_out_of_buffer` (the host too slow to take frames off the NIC) is a host problem, for [how Linux sends and receives packets](/learn/fabric-networking/from-zero/how-linux-sends-and-receives-packets).

### From counters to rates, without lying

```python
def rate_bps(prev, curr, seconds, link_bps, width=64):
    """Bits per second between two octet-counter samples, coping with wrap and reset."""
    delta = curr - prev
    if delta < 0:
        wrapped = delta + 2 ** width
        # A genuine wrap leaves a delta the link could have carried; anything else
        # is a reset (reboot, "clear counters", a new line card): discard the sample.
        if wrapped * 8 / seconds <= link_bps:
            delta = wrapped
        else:
            return None
    return delta * 8 / seconds


# How long a 32-bit octet counter lasts at full rate before it wraps.
for gbps in (1, 10, 100, 400):
    print(f"32-bit ifInOctets at {gbps:>3} Gb/s wraps every {2 ** 32 * 8 / (gbps * 1e9):7.3f} s")

# leaf1.ams swp51 (to spine1.ams, 400G), sampled 30 s apart.
t0, t1 = 918_337_201_554_112, 918_637_201_554_112
print(f"utilisation {rate_bps(t0, t1, 30, 400e9) / 400e9:.1%}")
print("after a reboot:", rate_bps(t1, 41_998_310, 30, 400e9))
# A 32-bit counter polled every 30 s on a 10G link: one wrap is detectable, two are not.
prev32, true_delta = 4_000_000_000, 30_000_000_000            # 30 GB really moved
curr32 = (prev32 + true_delta) % 2 ** 32
print(f"32-bit sample says {rate_bps(prev32, curr32, 30, 10e9, width=32) / 1e9:.2f} Gb/s, "
      f"truth {true_delta * 8 / 30 / 1e9:.2f} Gb/s")

# Loss on a link = what one end sent minus what the other end received.
leaf1_out_pkts, spine1_in_pkts, spine1_in_fcs_errors = 9_812_330_104, 9_812_318_871, 11_233
lost = leaf1_out_pkts - spine1_in_pkts
print(f"lost on the wire: {lost} packets ({lost / leaf1_out_pkts:.2e}), "
      f"FCS errors explain {spine1_in_fcs_errors}")
```

```text
32-bit ifInOctets at   1 Gb/s wraps every  34.360 s
32-bit ifInOctets at  10 Gb/s wraps every   3.436 s
32-bit ifInOctets at 100 Gb/s wraps every   0.344 s
32-bit ifInOctets at 400 Gb/s wraps every   0.086 s
utilisation 20.0%
after a reboot: None
32-bit sample says 1.13 Gb/s, truth 8.00 Gb/s
lost on the wire: 11233 packets (1.14e-06), FCS errors explain 11233
```

Four rules come out of it:

1. **Use 64-bit counters.** SNMP's original `ifInOctets` is 32 bits; at 10G a 30 s poll loses whole wraps and reports 1.13 Gb/s for a link carrying 8. The 64-bit `ifHCInOctets` (RFC 2863) lasts about 11.7 years at 400G, and streaming telemetry ([telemetry and observability](/learn/fabric-networking/operating-fabrics/telemetry-and-observability)) is 64-bit throughout.
2. **Detect resets.** A reboot, `clear counters` or a new line card sends the counter backwards; treated as a 64-bit wrap, it becomes a spike of about 18 exabytes in one sample, the "exabit-per-second link" on a dashboard the morning after maintenance. Discard the sample, and store SNMP's `ifCounterDiscontinuityTime` (when the counters last restarted) with every series.
3. **Compare both ends.** A link's loss is what one end sent minus what the other received. Here the 11,233 missing packets equal the far end's FCS errors, so the loss is corruption on this link; a gap with no matching error counter is a silent drop, and more interesting. Compare deltas over the same window, since the two devices are read at slightly different moments.
4. **Averages hide bursts.** 20% over 30 s can contain a 50 µs burst at 100%. A data-center switch chip has tens to a little over a hundred megabytes of buffer shared by all its ports, and at 400 Gb/s a megabyte arrives in 20 µs, so a buffer fills and drops faster than any poll. Out-discards and buffer high-water marks show it; utilisation averages never will.

**What counters solve:** always-on evidence per port and direction, kept in hardware at no cost. **How they break:** they wrap, reset and get sampled too slowly. **Signal:** a negative delta, a rate above line rate or a changed discontinuity timestamp: a sample not to graph as it is.

## Failure modes in production

**A dirty connector on one uplink.** *Symptom:* about one connection in four between two racks retransmits and crawls, while a single ping looks clean. *Diagnosis:* FCS errors on `leaf1.ams`'s port from `spine2.ams`, corrected FEC codewords climbing there for days before, receive light lower than on sibling ports; load spreading over four spines puts a quarter of the flows on that link ([ECMP and hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing)). *Fix:* drain the link, clean or replace the connector or optic, confirm the counters stay flat, restore. The link was "up" throughout: a gray failure.

**MTU mismatch after a change.** *Symptom:* a new server's SSH session logs in and then hangs on the first large output; database replication stalls; small requests work. *Diagnosis:* the server runs 9,000, the leaf port was left at 1,500, and the leaf's oversize counter rises with every large frame; `ping -M do -s 8972` fails, `-s 1472` succeeds. *Fix:* align the MTU, and make the intended MTU per link part of the source of truth, checked after every change.

**A port that came up at the wrong speed.** *Symptom:* a leaf's uplinks are all "up", yet one is saturated and dropping while its siblings, given the same share of flows, sit at 25%. *Diagnosis:* operational speed 100G on a port intended as 400G: a failed lane in the optic, a misconfigured breakout, or a lower-speed cable. *Fix:* replace the part; meanwhile drain the port, because routing still sends it a full share.

## What the platform should show

For every link, tooling should show:

- **Both ends on one row.** The link is the object: both interface names (checked by LLDP against intended cabling) and sent-versus-received deltas, whose difference is loss.
- **State with history.** Admin and operational state, last change, flaps per hour, operational against intended speed.
- **Errors as rates, with an early warning.** FCS errors per billion frames, plus the corrected-FEC trend and optic light levels, which move days before frames fail ([optics, cabling and the physical layer](/learn/fabric-networking/fabric-architecture/optics-cabling-and-the-physical-layer)).
- **Utilisation per direction, with peaks.** In and out separately, at seconds resolution, beside out-discards and buffer high-water marks where a microburst shows.
- **MTU as intent.** Both ends' MTU, normalised per vendor, against the source of truth, plus a periodic full-size do-not-fragment probe on every path.
- **Counter hygiene.** 64-bit sources only, resets detected and marked, so nobody chases a phantom spike at 3 a.m.

The same data serves two readers: the engineer on call wants the one bad link now; the manager wants how many links are degrading fleet-wide, and whether one batch of optics fails more.

## Interviewer follow-ups

**"What is the latency of a packet across a 400G leaf-spine link?"** Model answer: split it. Serialising a 1,518-byte frame takes about 31 ns; 100 m of fibre adds 500 ns; the switch a few hundred nanoseconds to a microsecond; queueing nothing when idle and tens of microseconds or more under congestion. Fibre and switch dominate, and 800G would save about 15 ns. Common wrong answer: "400G is four times faster than 100G, so latency is four times lower".

**"A switch port shows FCS errors. What do you do?"** Model answer: they belong to that link, since every hop recomputes the FCS: the cable, either optic, or the far end's transmitter. Check that they are still rising, compare light levels and the FEC trend on both ends, and drain the link before swapping parts. On a cut-through fabric, check whether the frames arrived already stomped from upstream. Common wrong answer: "the sending server has a bad NIC".

**"Dashboards show a link at 20% and applications see loss through it. How?"** Model answer: 20% is a 30 s or 5 min average, and bursts fill a buffer in microseconds; out-discards and buffer watermarks show it, if the counters are 64-bit and per direction. Buffer tuning I would defer to the network team; what I would build is per-queue discards and high-water marks at fine resolution beside utilisation. Common wrong answer: "the link is not the problem at 20%".

**"Why doesn't everyone run 9,000-byte MTUs?"** Model answer: every device on a path must agree, and the internet is 1,500; one forgotten port drops only large packets, and a filtered ICMP turns that into a hang. The benefit is per-packet cost, which TSO and GRO already cut. Inside a controlled fabric, and for RDMA, jumbo frames are standard. Common wrong answer: "jumbo frames are faster because the efficiency goes from 95% to 99%".

## What mid-level engineers get wrong

- **Mixing bits and bytes.** A 400 Gb/s link moves 50 GB/s; a plan off by eight is off by an order of magnitude.
- **Reading "link up" as "link healthy".** A link at the wrong speed or dropping one frame in a million is up.
- **Graphing counters as values, or polling 32-bit counters.** Counters are cumulative; their deltas need wrap and reset handling, and 32 bits wrap in seconds.
- **Treating a MAC address as a stable identity.** Phones randomise theirs, containers get software-assigned ones, and cloned VMs duplicate them.

## Senior signals

- You split latency into serialisation, propagation, processing and queueing with a number on each: inside a site fibre and switches dominate, across sites distance does.
- You describe the frame from the wire up and say why the destination MAC comes first and why 64 bytes is the minimum.
- You treat the FCS as a per-link fact: an FCS error locates its fault (unless a cut-through switch stomped it upstream), and FEC-corrected trends warn before it happens.
- You decode a MAC from its first byte: I/G for unicast or group, U/L for factory or software, and the OUI behind it.
- You treat MTU as an end-to-end contract, know why fabrics run 9,216 under 9,000 hosts, and normalise vendor conventions.
- You read counters as cumulative 64-bit integers, compare both ends of a link, and know averages hide microbursts.

## Check yourself

```quiz
- q: >-
    A 1,518-byte frame crosses a 100 m fibre between two switches connected at 400 Gb/s. Which delay is largest for this one frame on an idle link?
  options: ["Queueing, about 1 µs, because every frame waits in a buffer", "Propagation, about 500 ns, set by the length of the fibre", "Serialisation, about 31 ns, because the frame is full size", "Serialisation, about 120 ns, because of preamble and FEC overhead"]
  answer: 1
  explanation: >-
    Light in fibre covers about 5 ns per metre, so 100 m costs about 500 ns at any link speed. Serialising 12,304 bits of wire time at 400 Gb/s takes 30.76 ns (the 120 ns figure is 100 Gb/s). On an idle link there is no queueing. This is why upgrading link speed barely changes latency inside a site, and not at all across sites.
- q: >-
    Which of these destination MAC addresses is a multicast address?
  options: ["02:42:ac:11:00:02, because its second bit is set", "01:80:c2:00:00:0e, because its first byte is odd", "00:00:5e:00:53:0a, because it is reserved for documentation", "00:00:5e:00:01:01, because its OUI belongs to IANA"]
  answer: 1
  explanation: >-
    The I/G bit is the lowest bit of the first byte and the first bit on the wire; when it is 1 (an odd first byte) the address names a group. 01:80:c2:00:00:0e is the LLDP group address. 02:42:... has the U/L bit set, which makes it locally administered but still unicast. The IANA OUI says who allocated the address, not whether it is multicast.
- q: >-
    A monitoring system polls a 10 Gb/s link's 32-bit ifInOctets counter every 30 seconds and reports about 1 Gb/s, but the link is actually carrying 8 Gb/s. What is the most likely cause?
  options: ["The counter wraps every 3.4 s, so most wraps between polls are lost", "The counter reports frames, not bytes, so the result needs scaling", "The 30-second average flattens microbursts, lowering the mean", "The counter excludes the preamble and gap, under-reporting by 8x"]
  answer: 0
  explanation: >-
    2^32 bytes is 34.4 Gbit, which a 10 Gb/s link moves in 3.4 s, so 30 s of traffic wraps the counter about seven times and the poller sees only the remainder. The fix is the 64-bit ifHCInOctets. Averaging flattens peaks but does not change the mean; leaving out preamble and gap costs about 1%, not a factor of eight.
- q: >-
    A server is set to MTU 9,000 and its leaf port to 1,500. What happens?
  options: ["Every frame is fragmented by the leaf, so throughput falls slightly", "The two ends negotiate down to 1,500 when the link comes up", "Large frames are dropped as oversize at the leaf; small ones pass", "The link stays operationally down until the MTUs are made equal"]
  answer: 2
  explanation: >-
    Ethernet does not negotiate MTU and the link comes up normally. The leaf drops frames above its limit and counts them as oversize (giants), with no message to the sender, so small pings and short requests work while large transfers hang. A switch does not fragment Ethernet frames, and routers fragment only IPv4 packets without the DF bit.
- q: >-
    A 400 Gb/s leaf-spine link reports 390 Gb/s out and 50 Gb/s in over the last minute. What should a tool conclude?
  options: ["The link is at 55% overall and has plenty of headroom left", "The link is at 110% of its rating, so the counters are wrong", "The outbound direction is near saturation; inbound is not", "Both directions share 400 Gb/s, so the link is at 440 Gb/s"]
  answer: 2
  explanation: >-
    Data-center links are full duplex: two independent 400 Gb/s channels. Outbound at 390 Gb/s is 97.5% utilised and probably dropping during bursts, while inbound has capacity to spare. Adding or averaging the directions hides exactly this case.
- q: >-
    Why does Ethernet keep a 64-byte minimum frame size on full-duplex links that can never collide?
  options: ["The preamble needs 64 bytes of payload to lock the clock", "It was set for collision detection and kept for compatibility", "Switch buffers are allocated in 64-byte cells and need full cells", "The CRC-32 cannot detect errors in frames under 64 bytes"]
  answer: 1
  explanation: >-
    On shared half-duplex Ethernet a sender had to still be transmitting when a collision from the far end returned: 512 bit times at 10 Mb/s. Full duplex removed collisions, but the rule stayed so every device and frame format remains compatible. CRC-32 works on short frames, and the preamble is independent of payload size.
```
