---
lesson: links-frames-and-ethernet
source: a8a14f9155968ec0
fit: partial
desk:
  - "The ethernet-frame visualisations: a full-size frame built field by field and serialised at 1, 10, 100 and 400 Gb/s, and the 9,000-byte jumbo version"
  - "The code that builds the SYN's frame, computes the FCS and flips one bit"
  - "The MAC address classifier and the IPv4 multicast mapping"
  - "The delay calculator, and the store-and-forward versus cut-through table"
  - "The counter-to-rate code with wrap and reset handling"
  - "The link speeds, EtherType, MTU and interface counter tables, and the ip and ethtool output"
---
## Introduction

Every packet in a data center, a BGP update or an RDMA write between two GPUs, crosses the network one cable at a time, inside an Ethernet frame. Before anything is routed, the two ends of a cable must agree where a message starts and ends, who it is for, what it carries, and whether it arrived intact. And every crossing takes a number of nanoseconds you can work out.

The running example is one cable at Meridian, this track's fictional operator: Acme's web server, acme-web1, plugged into leaf1.ams, the top-of-rack switch in Amsterdam. A leaf is the switch servers plug into; a spine only connects leaves together.

Four ideas: the link down to the bits, the frame field by field, the arithmetic of delay and MTU, and the interface counter, and how it lies.

## Links, lanes and the wire

A NIC, a network interface card, turns bytes in memory into signals on a cable and back. A port is one socket on a switch or a NIC. A link is two ports and the medium between them: copper, or two optical transceivers with fibre between. Software calls a port an interface, like eth0.

A link has two states. Administrative is what someone configured: enabled or shut. Operational is what the hardware reports: up only when both ends have locked onto each other's signal at an agreed speed. Admin up, oper down means nothing usable is arriving: an unplugged cable, a dead optic, the far end shut, or no common speed.

Speeds count bits, in decimal: 400 gigabits per second is 50 gigabytes per second. Mix bits and bytes and a plan is off by eight.

Fast ports are built from lanes. 400 gig is eight lanes of 50 or four of 100; 800 gig is eight of 100. Since about 2017 fast lanes use PAM4, four signal levels and two bits per symbol, instead of NRZ's two levels and one bit: double the bits, less noise margin. Lanes explain breakouts, one 400 gig port split into four 100 gig links; switch capacity, a 51.2 terabit chip as 64 ports of 800 or 128 of 400; and partial failures, a port up on fewer lanes at a lower speed.

Under the frame sits the PHY, the physical layer device, with three jobs. It encodes, adding a two-bit header to every 64 bits and scrambling them, so the receiver can recover the sender's clock; there is no clock wire. It corrects errors: PAM4 lanes budget for about 2 raw bit errors in 10,000, and a Reed-Solomon code repairs up to 15 damaged symbols per block. And it is never silent: it sends idle blocks between frames, and when the signal vanishes it reports a fault within microseconds and signals the far end, which takes the link down too, even if only one fibre broke.

That is the early warning: a dirty connector raises the raw error rate, FEC hides it until it cannot, and corrected codewords trending up mean margin is eroding.

Last, full duplex. Ethernet in 1980 was one shared coaxial cable, where simultaneous senders collided and backed off. Every data center link today is two independent one-way channels: 400 gig each way at once, with no half-duplex mode at 10 gig and above. So utilisation is per direction, and adding or averaging the two hides a saturated one. Contention moved into the switch, where two inputs aimed at one output fill a buffer. And a receiver can send a PAUSE frame back on the free reverse channel, the ancestor of the flow control lossless RoCE depends on.

## The frame and its addresses

acme-web1 opens a TCP connection to Acme's database in another subnet. Its first packet is a 60-byte SYN, sent to the gateway, leaf1.ams, at the anycast gateway MAC every Meridian leaf shares.

On the wire, in order. Seven bytes of preamble, for the receiver to lock onto the bit timing. One byte of start frame delimiter: the frame begins next. Six bytes of destination MAC. Six of source MAC. Two of EtherType, saying what the payload is, here IPv4. The 60-byte payload. Four bytes of frame check sequence, the FCS. Then twelve bytes of idle, the interframe gap.

The destination comes first on purpose: a switch can pick the output port after six bytes and, forwarding cut-through, start sending before the rest arrives. Counters report the frame from destination to FCS, here 78 bytes; preamble and gap are not counted but occupy the wire, making 98.

The VLAN tag is an EtherType too: it slots in before the real type and adds four bytes. A value of 1,500 or less is not a type but a length, from the older IEEE format; types start at 1,536, so they never collide. IS-IS, Meridian's underlay protocol, still uses the length form, which is why it runs directly on layer 2.

A frame may not be shorter than 64 bytes; short payloads are padded with zeros. If no data center link can collide, why keep that minimum?

[pause]

History. On shared Ethernet a sender had to still be transmitting when news of a collision returned: at 10 megabits, 512 bit times, 51.2 microseconds, covered a round trip across about 2.5 kilometres. Full duplex removed collisions; the minimum stayed for compatibility. Shorter frames are runts with a bad FCS, undersize with a good one.

The FCS is a CRC-32 the sender's NIC computes over everything from destination MAC to the end of the payload. The receiver runs the CRC over the whole frame, FCS included, and an intact frame always leaves the same fixed remainder, so hardware checks it as bytes stream in. It catches every error burst up to 32 bits. A failed frame is dropped and counted as an FCS error.

Every switch builds a new frame with a new FCS, so an FCS error describes damage on the one link it arrived from. The exception: a cut-through switch is already forwarding when it finds the bad check, so it ends the outgoing frame with a deliberately stomped FCS, and the next switch counts an error from one link earlier. And the FCS only detects. Nobody retransmits or tells the sender; TCP recovers a round trip later, so a few errors per million frames become a slow application.

A MAC address is a 48-bit identifier, meaningful only within one layer 2 segment; routers replace it at every hop. In the first byte, the lowest bit is individual or group: zero is unicast, one is multicast, and all ones is broadcast. The next bit is universal or local: a manufacturer's block, or assigned by software, as with containers. Ethernet sends each byte's least significant bit first, so the group bit is the first bit after the preamble. The quick test: an odd first byte is multicast. In a universal address, the first three bytes are the OUI, the block the IEEE assigns to a manufacturer, and the rest is its serial.

MAC tables cannot be summarised like IP prefixes, which caps layer 2 domain size. And a MAC is not an identity: cloned virtual machines duplicate them, and phones randomise theirs per Wi-Fi network.

## Delay, with numbers

One-way time is four delays. Serialisation, pushing bits onto the link: at 1 gigabit, a nanosecond per bit. Propagation: about 5 nanoseconds per metre of fibre, at any speed. Processing: a few hundred nanoseconds to a microsecond per data center switch. Queueing: zero when idle, dominant when busy.

A full-size frame, 1,518 bytes, is 12,304 bits with preamble and gap. At 1 gigabit, 12.3 microseconds; at 400 gig, 30.76 nanoseconds. The idea to hold onto: a faster link makes a frame shorter, not faster. At 400 gig the frame fits in six metres of fibre; at 1 gig it is 2.5 kilometres long. The first bit arrives no sooner.

Cross the Amsterdam site, server to leaf to spine to leaf to database, at 600 nanoseconds per switch. The trip spends 1.8 microseconds in switches, 0.83 in glass, and 0.3 serialising. Going from 400 to 800 gig uplinks saves about 30 nanoseconds. Cut-through barely helps either: leaf1 receives at 100 and sends at 400, so cutting through would run out of bytes, and it waits anyway. Across sites only distance matters: Amsterdam to Singapore, 10,500 kilometres, is 52.5 milliseconds one way at any speed.

And the number switch designers fear: a 400 gig port of minimum-size frames needs about 595 million forwarding decisions a second. Small-packet floods hit the packet limit first.

## MTU and jumbo frames

The MTU is the largest payload one frame carries: for Ethernet, the largest IP packet. The standard 1,500 dates from 1980, when buffer memory was expensive.

Jumbo frames, conventionally 9,000 bytes, are not in the IEEE standard, and vendor maximums differ, often 9,216. Meridian runs switch links at 9,216 so servers can use 9,000, because VXLAN adds 50 bytes around the tenant's frame. acme-web1 keeps 1,500, so its SYN advertises a maximum segment size of 1,460: 1,500 minus 40 bytes of IP and TCP headers.

Efficiency rises only from 95 percent to 99. The real gain is six times fewer packets, each costing interrupts, kernel work and a lookup. Offloads like TSO and GRO recover much of that at 1,500, which is why many clouds still run 1,500. RoCE's largest payload, 4,096 bytes, needs jumbo frames, so RoCE fabrics run them end to end.

Two traps. Junos counts the 14-byte Ethernet header, so a link Linux calls 9,000 reads 9,014 there. And a real mismatch is silent: Ethernet does not negotiate MTU, and the receiver drops oversize frames, giants, telling nobody.

A new server comes up at 9,000; its leaf port was left at 1,500. SSH logs in, then hangs on the first large output, while small requests work. The leaf's oversize counter climbs, and a full-size don't-fragment ping fails while a small one succeeds. Align the MTU, and make each link's intended MTU part of the source of truth, checked after every change.

## Counters, and how links fail

An interface counter is an integer the hardware increments for one kind of event, on one port, in one direction. It only goes up. A rate is the difference between two readings over the time between them.

First, wraps. SNMP's original octet counter is 32 bits; at 10 gig it wraps every 3.4 seconds, so a 30-second poll reports 1.13 gigabits on a link carrying 8. The 64-bit counter lasts 11.7 years at 400 gig. Second, resets: a reboot sends the counter backwards, and treated as a wrap it becomes an 18 exabyte spike the morning after maintenance. Discard that sample. Third, compare both ends: in the lesson's example, 11,233 packets went missing between leaf1 and spine1, and spine1 counted exactly 11,233 FCS errors, corruption on that link. A gap with no matching counter is a silent drop. Fourth, averages hide bursts: at 400 gig a megabyte arrives in 20 microseconds, so a buffer fills and drops faster than any poll. Out-discards and high-water marks show it.

A story. One connection in four between two racks crawls, while ping looks clean. Why one in four? Load spreads over four spines, and leaf1's uplink from spine2 has a dirty connector: FCS errors rising, corrected FEC climbing for days, receive light below its siblings'. The link was up throughout, a gray failure. Drain it, clean or replace the part, watch the counters stay flat, restore.

Another: one uplink saturated and dropping while its siblings sit at 25 percent. It came up at 100 gig on a port meant for 400, through a failed lane, a wrong breakout or a slower cable, and routing still sends it a full share. Drain it until the part is replaced.

So the platform should show each link as one row with both ends: flaps, actual against intended speed, error rates beside the FEC trend, utilisation per direction, MTU against intent, and 64-bit counters with resets marked.

## In the interview

What is the latency of a packet across a 400 gig leaf-spine link?

[pause]

Split it. Serialising a full-size frame, about 31 nanoseconds. A hundred metres of fibre, 500. The switch, a few hundred nanoseconds to a microsecond. Queueing, nothing when idle, tens of microseconds when congested. Fibre and switch dominate; 800 gig would save about 15 nanoseconds. The wrong answer: four times the speed, a quarter of the latency.

The follow-up: a port shows FCS errors, what do you do? They belong to that link, since every hop recomputes the FCS: the cable, either optic, or the far end's transmitter. Compare light levels and FEC on both ends, drain before swapping parts, and on a cut-through fabric check for frames stomped upstream. The wrong answer: the sending server has a bad NIC.

## Recap

Five things. A faster link makes a frame shorter, not faster; inside a site switches and fibre dominate, across sites distance. Every hop recomputes the CRC-32, so an FCS error points at one link. An odd first byte means multicast. MTU is an end-to-end contract that fails silently, which is why fabrics run 9,216 under 9,000-byte hosts. And counters are cumulative 64-bit integers: handle resets, compare both ends, distrust averages.

At your desk: the frame visualisations, the frame-building and MAC code, the delay calculator, the counter-rate code, and the speeds, MTU and counters tables.
