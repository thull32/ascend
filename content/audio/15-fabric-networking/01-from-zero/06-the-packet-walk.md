---
lesson: the-packet-walk
source: 11f39a77ff135b65
fit: partial
desk:
  - "The byte-by-byte table of one packet on four links, and the IPv4 header field by field"
  - "The hop-by-hop visualisation and the traceroute visualisation"
  - "The router loop in Python, with its traceroute run, and the two packet captures"
  - "The traceroute probe comparison table"
  - "The laptop walk sequence diagram and the round-trip table"
  - "Practice problem: detecting a routing loop"
---
## Introduction

"A new laptop joins the Wi-Fi and opens a website. What happens?" Network organisations ask it in nearly every interview loop, because it separates people who hold the picture from people who hold the vocabulary. A weak answer lists protocols in roughly the right order.

A strong answer has two parts. First, the rule every router applies to every packet: which bytes it reads, which it rewrites, which it never touches. Second, the end-to-end story as ten steps, each with what breaks there and how you would see it. In between sits traceroute, which turns the per-hop rule into a map, and misleads you in specific ways.

## What a router does to every packet

A router is a box with interfaces in different subnets and a forwarding table, the FIB: the prefixes it has chosen, each with a next hop. For every arriving frame it runs the same loop, in a switching chip or in software such as the Linux kernel.

It checks the frame check sequence, the 4-byte CRC at the end of every Ethernet frame; a mismatch means corruption on the wire, so it drops the frame and counts a CRC error on that interface. It checks the frame is addressed to it, strips the Ethernet header, and validates the IP header.

Then a longest-prefix match on the destination IP gives a next hop and an outgoing interface. Then the TTL, time to live, an 8-bit hop counter. At 1 or 0, forwarding would take it to zero, so the router drops the packet and sends an ICMP "time exceeded" to the source; ICMP is IP's error and diagnostic channel. Otherwise it decrements the TTL and updates the header checksum, which covers the TTL byte. Last, it finds the next hop's MAC in its ARP cache, builds a brand-new Ethernet header with a fresh FCS, and transmits.

Notice what is missing. Apart from packet filters and the ECMP hash, which spreads flows over equally good next hops, nothing reads the source address, the ports or the payload, and nothing remembers the packet. That statelessness lets one chip forward billions of packets per second, and makes a routing change apply to the very next packet.

Take Meridian's Amsterdam fabric, as a small example with two spines. Acme's web server, acme-web1, at 10.1.1.10, sits behind leaf1. Acme's database, acme-db1, at 10.1.2.20, sits behind leaf3, in another subnet. Treat leaf1, spine1 and leaf3 as plain IP routers; real tenant traffic would ride a VXLAN tunnel, but the rule is easiest to see without it.

The web server's first packet is a 60-byte SYN with TTL 64, the Linux default. The destination is off-subnet, so the frame goes to the gateway: the anycast gateway MAC that every leaf shares. Leaf1's hash picks spine1.

Now follow the header across four links. The destination MAC is the gateway, then spine1's interface, then leaf3's, then the database's own MAC. The source MAC changes on every link too. The IP addresses never change, nor do the ports or the sequence number.

Before I go on: on the link from leaf1 to spine1, what is the destination IP, and what is the destination MAC?

[pause]

The IP is still the database, 10.1.2.20. The MAC is spine1's interface. Leaf1 used the next hop's address only to find that MAC; the next hop's IP never appears in the packet. That answers "why do we need both?" The Ethernet header is a per-link delivery label whose job ends at the next router. The IP header is the end-to-end label every router reads to choose the next link.

What does change is the hop count, 64, 63, 62, 61, and with it the header checksum at every hop.

## TTL and the checksum

TTL exists for routing loops. For tens to hundreds of milliseconds, while routers update their tables at slightly different moments, spine1 can route a prefix back to leaf1 while leaf1 routes it to spine1. Ethernet frames carry no TTL, which is why a layer-2 loop melts a network while a layer-3 loop is bounded.

But TTL bounds a loop; it does not prevent one. A packet entering a two-router loop with TTL 63 crosses the looped link 62 times, 31 each way, so a 1 gigabit per second flow offers roughly 31 gigabits per second to that link in each direction, and innocent traffic suffers. The signal: TTL-expired counters jump on the looping routers, traceroute shows two addresses alternating to its 30-hop limit, and link utilisation rises with no rise in delivered traffic.

TTL also hints at distance. Linux and macOS start at 64, Windows at 128, many network operating systems at 255, so a packet arriving with 52 most likely left a Linux host 12 hops away.

The checksum is patched, not recomputed: TTL shares a 16-bit word with the protocol field, so the router applies one incremental addition instead of re-summing the header. IPv6 drops the header checksum altogether, because the link check and the TCP and UDP checksums already catch corruption. And the Ethernet FCS is recomputed at every hop, because every frame is new.

So a CRC error is a property of one link. If leaf1 counts receive CRC errors on its port towards spine2, the fault is that link: the cable, either optic, or spine2's transmitter. With four spines, that dirty link makes about one connection in four retransmit and crawl, while a single ping looks clean. The caveat is cut-through switching: a switch already sending a frame when its FCS fails stomps the outgoing CRC with a recognisable bad value, so good tooling counts stomped frames separately.

## traceroute

traceroute makes every router identify itself by deliberately expiring probes. It sends three UDP probes with TTL 1 to high ports, starting at 33434 and rising per probe, where nothing is likely to listen. The first router returns ICMP time exceeded, quoting the original header, so traceroute matches reply to probe and prints the address and round trip. Then TTL 2, then 3, each dying one router further on. At the destination, nothing listens, and port unreachable means "arrived". Three stars mean only the reply is missing; the probe went through.

Now the misleading part. Hop 4 shows 95 milliseconds; hops 5 through 8 and the destination show 12. Where is the problem?

[pause]

Not on the forwarding path. The chip forwards transit packets at line rate but does not generate ICMP: expired probes are punted to the CPU, which answers under a strict rate limit, and late when busy. Congestion at hop 4 would delay every later hop too. Only latency or loss that persists to the destination is real.

Second, ECMP scatters the probes. Each new port is a new flow that may hash onto a different spine, so one hop line prints several addresses and the output can stitch two paths together, inventing links. Paris traceroute holds the five-tuple constant to follow one path; in a fabric you also want the opposite, many varied five-tuples, to cover every spine. Third, tunnels hide hops: in an EVPN fabric the spines decrement only the outer VXLAN header's TTL, so across Meridian's real overlay the traceroute shows only leaves. And it shows the forward path only; internet paths are often asymmetric.

## Laptop to website: joining the network

A laptop at home in Amsterdam opens www.meridian.example, served from Meridian's Amsterdam site, over broadband from ISP2, one of Meridian's upstreams. The addresses and the domain come from documentation ranges, so none are real.

Step one, Wi-Fi association. The laptop picks the network by name and the access point admits it. Real authentication is the WPA2 or WPA3 four-way handshake: both sides hold a key derived from the passphrase, swap random nonces, the laptop proves it holds the key with an integrity code, and both derive a session key without ever sending it. A wrong passphrase fails at handshake message two. Signals: the access point's association log, signal strength, retry rate.

Step two, DHCP: discover, offer, request, acknowledge. With no address, the laptop broadcasts. The home router offers 192.168.1.23, with the mask, the gateway 192.168.1.1, a DNS server and a lease. If no server answers, the laptop gives itself a 169.254 link-local address and reaches nothing off its link. Other breaks: an exhausted pool, a rogue server with a wrong gateway.

Step three, DNS on UDP port 53. The resolver DHCP supplied walks, on a miss, from the root to Meridian's authoritative servers: 203.0.113.10, TTL 300 seconds, a cache lifetime unrelated to the IP hop counter. A dead resolver makes everything look down while connections by IP still work; compare what the process resolves with what DNS says, and time the lookup apart from the connect.

Step four, ARP. The server is off-subnet, so the laptop asks who has 192.168.1.1, caches the reply, and sends its first frame to the router's MAC: hop one of the hop-by-hop rule. Breaks: a wrong gateway, a stale entry after the router was swapped; the neighbour table shows failed or incomplete.

Step five, NAT. The laptop's address is private, so the home router rewrites the source to its ISP address, 198.51.100.77, swaps in a free port, and records the mapping to translate replies back. It is the walk's one deliberate break of "the IP never changes", and NAT patches the TCP checksum too. The classic break: Linux connection tracking keeps an established entry for five days by default, but consumer routers and carrier-grade NAT often expire one within minutes, so an idle SSH connection dies silently.

## Laptop to website: across the internet

Step six, routing. The home router has a default route to ISP2, whose routers carry the full table, on the order of a million IPv4 prefixes. The longest match is Meridian's slash 24, learned over BGP, and ISP2 prefers its paying customer's route. The packet enters at a Meridian border gateway and crosses the fabric to the server's leaf.

The trap: BGP runs nowhere in the per-packet path. It ran earlier, picked a best path and installed it in each FIB; the packet only meets the FIB. In an EVPN fabric, BGP's entry is used once, at the ingress leaf, and spines forward on IS-IS routes. Breaks: a leak or hijack, a router with no route while every session is up, a small-MTU tunnel dropping large packets while the ICMP is filtered. Signals: a traceroute that stops, a public looking glass, small pings working while large transfers hang.

Step seven, TCP to port 443: one round trip, each side announcing a maximum segment size, 1,460 bytes on a 1,500-byte link. An unanswered SYN is retried after one second, then two, four, eight; a black-holed address takes about two minutes to fail, while a reset returns within one round trip. Breaks: a firewall dropping SYNs, or a SYN-ACK returning through a stateful firewall that never saw the SYN. Signal: SYN retransmit counters.

Step eight, TLS 1.3: the ClientHello carries the server name and a key share; after the server's key share everything is encrypted, its certificate included. One round trip, where TLS 1.2 needed two. Breaks: an expired certificate, a missing intermediate, or a clock so wrong every site fails at once.

Step nine, HTTP: a GET answered 200, or a redirect costing another round trip; watch status codes and time to first byte. Step ten, render: each new hostname the page names repeats DNS, TCP, TLS and HTTP. The browser's waterfall, timing each of those per request, is the client-side version of what a network platform should show.

Now the number. A round trip is distance, about 5 microseconds per kilometre of fibre, plus the access network: around 10 milliseconds at home in Amsterdam, at least 105 from Singapore, roughly 10,500 kilometres away. TCP, TLS and HTTP make three round trips, 315 milliseconds before the first byte, and no bandwidth upgrade reduces it. That is why Meridian runs a Singapore site.

## In the interview

A principal engineer asks: a traceroute between two servers across our EVPN fabric shows two hops. Where did the spines go?

[pause]

The spines forward on the outer VXLAN header and decrement the outer TTL; the inner TTL the probes depend on drops only where the inner packet is routed, at the two leaves. Whether a platform copies the inner TTL outward you would confirm with the network team; what you would build is probing between every pair of leaf loopbacks with varied source ports, which does show the spines. The wrong answer: "the spines filter ICMP".

And do not skip Wi-Fi and DHCP: they are where "my laptop can't get online" actually fails, and the question said new laptop for a reason.

## Recap

Four things. Every router rewrites the MACs, keeps the IPs, decrements the TTL, patches the checksum and recomputes the FCS, so a CRC error belongs to one link. traceroute's times come from the control plane, and under ECMP you need fixed or deliberately varied five-tuples. BGP chose paths in advance; packets meet only the FIB. And the laptop walk is ten steps, each with a breakage and a signal, and three round trips to the first byte.

At your desk: the header tables, the two visualisations, the router loop in code with the captures, the probe comparison table, the laptop walk diagram and round-trip table, and the routing-loop problem.
