---
lesson: planes-asics-and-network-operating-systems
source: d523e20dfe6521dc
fit: partial
desk:
  - "The switch pipeline visualisation: a SYN forwarded through the ASIC, a BGP KEEPALIVE punted to the CPU"
  - "The planes table, the KEEPALIVE field table, the punt reasons table and the control-plane policing classes"
  - "The TCAM model in Python with port-range expansion"
  - "The SONiC database counts and the RIB-to-hardware reconciliation code"
  - "The NOS comparison, the failure-modes table and the forwarding trade-offs table"
  - "Practice problem: longest-prefix match"
---
## Introduction

At ten past two in the morning, the dashboard for Meridian's Amsterdam fabric is green. Every IS-IS adjacency is up, every BGP session to the route reflectors is Established. Yet Acme's web servers behind leaf1 cannot reach anything behind leaf4.

That can happen because a switch is two machines in one box. A small general-purpose computer runs the protocols that turn the dashboard green. A separate chip, the ASIC, forwards every customer packet using tables the computer wrote into it. When one of those writes fails, the protocols stay up while the chip drops the traffic.

The work splits into three planes, divisions by job, each with its own hardware and failures. The data plane is the ASIC, an application-specific integrated circuit, moving transit packets port to port in nanoseconds. It decides nothing: it reads headers, looks them up and acts. The control plane runs on the CPU as part of the network operating system, the NOS: IS-IS, BGP, BFD, ARP, LACP and LLDP, plus the software that writes results into the chip. It also receives every packet addressed to the switch. The management plane is SSH, APIs, SNMP, telemetry, syslog and NTP, through a dedicated management port.

They fail independently. A data plane whose control plane died keeps forwarding on its last tables, deliberately during a graceful restart, dangerously once they go stale. A control plane with a broken data plane is the green dashboard. A lost management plane leaves a switch forwarding while nobody can see or change it.

Coming up: the pipeline, how a route reaches hardware, how the CPU is protected, and why "the protocol is up" is not "traffic flows".

## Inside the ASIC

Most data center switches use merchant silicon, chips sold to many switch makers: Broadcom's Tomahawk and Jericho, NVIDIA's Spectrum, Cisco's Silicon One. The generation now widely deployed forwards 51.2 terabits per second in one chip. A minimum-size frame, with preamble and gap, is 672 bits on the wire, so that is about 76 billion packets per second. One pipeline at about a gigahertz handles about a billion, so even several parallel pipelines fall short, and data sheets state the smallest packet size at which a chip reaches line rate.

Now follow one packet. Acme's web server, acme-web1, sends a SYN to its database, acme-db1, and it arrives at leaf1 on port 1. The bytes stay in the chip's buffer; only a header vector, the parsed fields, travels down the pipeline.

The port checks the frame check sequence. The parser walks Ethernet, IP and TCP and fills the vector; anything it never extracted cannot be looked up later. The layer-2 lookup sees the anycast gateway MAC every Meridian leaf answers to, so the packet is routed, not bridged. The layer-3 lookup does a longest-prefix match on 10.1.2.20, finds an equal-cost group of two spines, and a hash of the five-tuple picks spine1, on port 49. The ingress ACL, the access control list, permits it. The traffic manager queues it on port 49's queue 0.

When the scheduler picks it, the egress stage writes spine1's MAC as destination and leaf1's as source, takes TTL from 64 to 63 and patches the checksum. The port appends a fresh frame check sequence and sends it. The CPU never saw this packet.

Many fabric switches forward cut-through, transmitting once the headers are parsed, which saves 120 nanoseconds per hop for a 1,500-byte frame at 100 gigabits. The price is forwarding frames whose checksum turns out bad.

## Tables and buffers

Exact-match tables live in SRAM, the memory of a CPU cache, as hash tables: MAC addresses, host routes, adjacencies, tunnels. Longest-prefix match uses algorithmic structures in SRAM with a small TCAM assist. All are fixed in size.

TCAM, ternary content-addressable memory, answers not "what is stored here?" but "which entry matches this key?" Every bit is zero, one or don't-care, the key is compared with every entry at once, and the lowest-numbered match wins. That is exactly an ACL, at line rate whatever the number of rules. The catch is cost: about 16 transistors per cell against 6 for SRAM, and power on every lookup, so chips carry thousands to tens of thousands of entries, carved into slices. An ACL that does not fit is rejected, or on some platforms partly installed.

And entries are not lines. A value and a mask can only express an aligned power-of-two block, so ports 1024 to 65535 split into six blocks, from 1024 to 2047, doubling up to 32768 to 65535. A question. One rule matches high source ports and high destination ports. How many entries?

[pause]

Thirty-six. An entry fixes both fields at once, so every source block pairs with every destination block: six times six. Adding them to get twelve is the tempting mistake. Watch per-slice utilisation, failed commits, and a hit counter stuck at zero.

Many chips pool one SRAM between MACs, host routes and prefixes, with a profile picked at boot. When a table fills, the new route is simply not installed: traffic follows a shorter prefix, often a default pointing somewhere wrong, while the protocol still shows the route as best. Publicly, in August 2014 the global IPv4 table passed 512,000 routes and overflowed a common router's default allocation. In a fabric, the usual cause is a surge of EVPN host routes.

Then the buffer, one shared pool with typically eight queues per port. It is small for the speed: 64 megabytes, as on NVIDIA's Spectrum-3, drains through 51.2 terabits of ports in 10 microseconds. Worked incast: eight servers each send 100 gigabits to one 100 gigabit port, so 700 gigabits per second piles up. A one megabyte queue fills in about 11 microseconds, then tail-drops, while a 30-second average shows 20 percent. The signals are per-queue drops and the buffer watermark, the peak occupancy since last read.

Deep-buffer chips like Jericho add gigabytes of external memory, for internet edges and long-haul links.

## From daemon to hardware

Follow one route on SONiC, an open-source NOS, as leaf1 learns leaf3's loopback from IS-IS. The IS-IS daemon runs shortest path first and finds two next hops, spine1 and spine2. Zebra, FRRouting's RIB manager, selects it. Fpmsyncd writes it into the application database in Redis. Orchagent resolves the neighbours' MACs, creates a next-hop group for the two spines, and writes both into the ASIC database. Syncd calls SAI, the abstraction interface each chip vendor implements, and the vendor SDK writes the chip's tables over PCIe. Only now does traffic follow the route.

Each step hands off through a queue: milliseconds for one route, seconds to minutes for hundreds of thousands. And it is asynchronous. A write can fail after the daemon has moved on, and a crashed agent can leave hardware holding routes the RIB withdrew. Some stacks wait for hardware confirmation before advertising, so no neighbour sends traffic the switch cannot yet forward. In one illustrative SONiC leaf, the routing stack asked for 1,342 routes and 1,130 reached SAI: 212 chosen, never handed to the driver.

Next-hop groups are why big fabrics converge fast. 2,000 tenant prefixes behind leaf3 resolve to its loopback, which uses one group. Spine2 fails, the NOS rewrites that one object, and all 2,000 move at once: the hardware half of prefix-independent convergence. In a flat FIB, repair time grows with the prefix count.

## Punts and control-plane policing

A punt is the ASIC handing a packet to the CPU. Anything addressed to the switch: BGP, BFD, SSH, a ping. Link-local frames like LACP, LLDP and IS-IS, which has no IP header, so the MAC is its only handle. ARP, TTL expiries so the CPU can build traceroute's "time exceeded", and too-big packets marked don't-fragment.

A BGP KEEPALIVE from rr1 to leaf1's loopback hits a receive entry. The chip leaves its TTL alone and sends it up to the BGP daemon, which resets its hold timer.

The CPU side is tiny: tens of gigabits of PCIe at best, against 51.2 terabits of ports, and tens to hundreds of thousands of punts a second. Control-plane policing, CoPP, protects it: the ASIC classifies each punt by reason, gives each class its own queue and token bucket, and drops the excess in hardware. Routing protocols get the protected class.

Here is why the classes matter. A misconfigured host behind leaf1 sends 2 million ARP requests per second. The session to rr1 has a 9-second hold time and a KEEPALIVE every 3. With one shared policer of 10,000 packets per second, does it survive?

[pause]

Almost certainly not. A KEEPALIVE gets through half a percent of the time. All three in a hold time are lost about 98.5 percent of the time, and TCP retransmissions still leave about 94. The session drops, BGP withdraws every route from rr1, and a storm in one VLAN becomes a fabric routing event. With separate classes, the ARP policer passes about a thousand a second, BGP's queue is untouched, and only ARP suffers.

Too tight fails the other way. A BGP class sized for steady state drops UPDATEs during reconvergence. A tight exceptions class gives traceroute stars, or 40 milliseconds at a hop that forwards in microseconds. And a ping to a switch's loopback tests the punt path and its policer, so a busy ICMP class shows loss on a healthy fabric.

## Out-of-band and the operating system

In-band management reaches a switch over the network it forwards, so a change that breaks routing cuts the session that would fix it. An out-of-band network exists only to reach devices: management ports into rack switches, separate routers, its own uplink through another provider or cellular, a management VRF on each switch, console servers for a broken network stack, and switched power. It carries SSH, provisioning, NTP, authentication, syslog and heartbeats. It breaks through shared fate, neglect, and circular dependencies.

Meridian learned the last one. It moved NTP to a server reached through the fabric. Then a leaf whose software stored IS-IS expiry times as wall-clock times booted with its clock decades behind. It joined IS-IS, and once the fabric worked, NTP stepped its clock forward. Every link-state entry now looked expired, its purges flooded the domain, and the underlay vanished until the originators re-flooded. Time needed the network, and the network needed time. Publicly, in the October 2021 Facebook outage, normal and out-of-band access both went down and engineers had to go on site.

The NOS is a kernel, usually Linux, drivers and vendor SDK, a platform layer, the protocol daemons, a configuration system and APIs. Cumulus with NVUE changes one object tree in staged revisions; a patch merges, so a line deleted from your source stays on the device. SONiC makes every stage a readable database. Arista EOS keeps one state database, so an agent can restart alone. Junos does whole-configuration transactions with commit confirmed. Three questions decide integration: how to read hardware state, whether a change merges or replaces, and what rollback means.

## The protocol is up

An Established BGP session proves the punt path, one protected class, the CPU, TCP and the daemon work for small packets. It proves nothing about the hardware FIB, an ECMP group missing a member, ACLs, or large packets: a 19-byte KEEPALIVE fits any MTU. Nor about silent hardware faults, gray failures, or a best-effort queue dropping while network control sails through.

Back to ten past two. EVPN told leaf1 that Acme's addresses sat behind leaf4's loopback, reachable through both spines. But tenant host routes had filled the hardware route table, the loopback was never written to the chip, and with no underlay default every tunnelled packet to leaf4 was dropped. Comparing the RIB with the hardware finds it in one pass, read from as close to the chip as possible, never from the daemon that believes it wrote it.

A principal engineer asks: every BGP session is Established, but traffic to one leaf is dropping. What could be wrong?

[pause]

The session proves only the CPU path. Diff the RIB against the hardware FIB on the ingress leaf for the far leaf's loopback and its ECMP members, check table utilisation, write errors, ACL drops and MTU, and probe with varied five-tuples. The wrong answer is "BGP is up, so it's the application". It is honest to defer to the network team on hardware commands, and to say you would build the diff so nobody runs them by hand.

And if the routing daemon crashes? The ASIC keeps forwarding on its last FIB, neighbours see sessions drop at once, and graceful restart keeps the routes as stale for a window. The risk is staleness, not an instant outage.

## Recap

Five things. A switch is an ASIC that forwards and a CPU that decides: 76 billion small packets a second at 51.2 terabits, a 64 megabyte buffer gone in 10 microseconds. TCAM entries, not ACL lines, decide what fits: two ranges can cost thirty-six. Routes reach hardware asynchronously, and next-hop groups make convergence independent of prefix count. Punts are policed per class, so traceroute and loopback pings are control-plane measurements. And time and management must not depend on the fabric.

At your desk: the pipeline visualisation, the field, punt and policing tables, the TCAM model, the SONiC counts and reconciliation code, the NOS, failure and trade-off tables, and the longest-prefix-match problem.
