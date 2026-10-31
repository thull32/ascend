---
slug: the-troubleshooting-method
title: "The troubleshooting method: scope, reachability, capacity, the host"
description: The method network engineers use on "the network is slow" (scope first, then reachability, capacity and the host), worked end to end on four cases from the Meridian fabric, a latency jump from 10 to 50 ms across EVPN, a device dropping packets without counting them, telemetry gone quiet, and a RoCE training job slowing down, with the counters, probes and code that localise each one.
minutes: 45
difficulty: hard
tags: [fabric-networking, troubleshooting, operations, observability, ecmp, probes, telemetry, roce, pfc, tcp, interview]
problems: [top-k-flows]
---
"The network is slow." A Meridian site has 16 leaves, 4 spines and 64 leaf-to-spine links, the AI cluster in San Jose has thousands more, and every one of them has dozens of counters. Reading them all is not a method, and neither is starting with the device that misbehaved last time. The network is also blamed first by default, so whoever answers must either find the fault or show, with evidence, that it is somewhere else.

Experienced network engineers ask questions in the same order every time: **scope first** (one user or many, one site or several), **then reachability** (is there a path?), **then capacity** (is the path big enough right now?), **then the host** (is the end system the bottleneck?). Below, each step and the reason for the order, then four cases worked from start to finish. The probes come from [active measurement](/learn/fabric-networking/operating-fabrics/active-measurement), the counters from [telemetry and observability](/learn/fabric-networking/operating-fabrics/telemetry-and-observability), and the host tools from [debugging the network](/learn/networking/networking-in-practice/debugging-the-network).

## Scope first

Before running any command, find out how big the problem is: "is it only you, or your peers too?" One user points at something local (their laptop, server or rack); everyone points at something shared. The answer cuts the search space more than any command can.

### The four scope questions

| Question | What each answer implies | What it decides |
|---|---|---|
| **Who?** One user, one tenant, every tenant | One host: its NIC, cable, kernel or application. One tenant: its VRF, policy or a shared service it uses. Everyone: shared infrastructure | Where to look first |
| **Where?** One rack (leaf), one site, several sites | One leaf: that leaf or its links. One site: that fabric, its gateways or its underlay. Several sites: inter-site circuits, the backbone, DNS, or a change pushed to all of them | Which failure domain |
| **What?** One application or port, one protocol, all traffic | One port: a firewall rule or the service itself. Large packets only: the MTU (maximum transmission unit, the largest packet a link carries). RoCE only: the lossless class. All traffic: forwarding | Which layer |
| **When?** Since when, always or intermittently, what changed | A start time lines up with a change. Intermittent with retries succeeding often means some ECMP paths are bad. Busy hours only means capacity | Which change, which mechanism |

The "when" question matters most, because most outages follow a change, so the change log for the window is the cheapest evidence there is ([network automation](/learn/fabric-networking/operating-fabrics/network-automation-and-source-of-truth) explains why). Look at both sides: Meridian's own changes, and the customer's ("we upgraded nothing" is often wrong, and so is the operator's version of it).

Scope also sets urgency. One host on one leaf is a ticket. Every tenant in `ams` is an incident, and the incident manager needs to hear that before anyone has found the cause.

### Translate the complaint into a measurement

"Can't reach the website" can mean DNS failing, the server being down, a site being unreachable, or a network path being broken. "Slow" can mean higher latency, lower throughput or more errors. Turn the complaint into something you can measure, with one concrete example:

- **The metric and where it was measured.** "10 ms" as a database query time in the customer's application monitoring is a very different number from 10 ms of network round-trip time (RTT, the time from sending a packet to receiving its reply). Host to host inside one Meridian site, the RTT is tens of microseconds, most of it in the two hosts' network stacks rather than the three switches.
- **One failing flow as a 5-tuple** (source and destination address, protocol, source and destination port) **plus a timestamp.** In an ECMP fabric (equal-cost multipath: flows hashed over several equally good paths, from [ECMP and hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing)), the 5-tuple decides which spine a flow crosses. "Some requests are slow" with no 5-tuple cannot be traced to a path; with one, you can work out the path that flow took.
- **A good example to compare against:** a flow that works between similar endpoints. The difference is often the answer.

## Then reachability, capacity, the host

### Reachability: is there a path at all?

Reachability asks whether a packet can get from A to B at all. Ping and traceroute answer it, with limits that [the packet walk](/learn/fabric-networking/from-zero/the-packet-walk) and [active measurement](/learn/fabric-networking/operating-fabrics/active-measurement) explain: a ping tests one 5-tuple, so one ECMP path; traceroute's intermediate hops are answered by each router's CPU, which rate-limits them; and inside an overlay the spines do not show up at all, because they never touch the tenant packet's TTL. In an EVPN fabric (Ethernet VPN: BGP telling each leaf which tenant MAC and IP addresses sit behind which other leaf, from [EVPN, the control plane](/learn/fabric-networking/overlays-vxlan-evpn/evpn-the-control-plane)) there are two reachabilities to check, plus the packet size:

1. **Underlay:** VTEP to VTEP. A VTEP (VXLAN tunnel endpoint) is the leaf that wraps tenant frames in VXLAN and unwraps them, addressed by its loopback: `10.255.1.11` to `10.255.1.13`. If this fails, IS-IS (the underlay routing protocol that makes every loopback reachable) or a link is broken ([underlay failures](/learn/fabric-networking/underlay/underlay-failures-in-production)).
2. **Overlay:** tenant address to tenant address inside the tenant's VRF (virtual routing and forwarding instance, its private routing table): `10.1.1.10` to `10.1.2.20` in `ACME`. If the underlay works and this does not, the cause is EVPN state: a missing or stale route, wrong route targets, or a VNI (VXLAN network identifier) mismatch.
3. **MTU,** with don't-fragment pings at the largest size the path should carry: 1,472 bytes of ICMP payload for a 1,500-byte MTU (1,500 minus 20 of IP header and 8 of ICMP), 8,972 for 9,000. VXLAN adds 50 bytes of headers, so a fabric link that is not jumbo-sized drops full-size tenant frames, usually without telling the sender ([VXLAN encapsulation](/learn/fabric-networking/overlays-vxlan-evpn/vxlan-encapsulation)). Small pings work and big transfers hang.

A working ping proves only that one path is up; with four spines, three are still untested.

### Capacity: is the path big enough right now?

Capacity asks whether the path has room for the traffic, checked along the path the flow takes, not across the whole fabric:

- **Utilisation** of every link on the path, both directions, and **ECMP balance** across sibling links: one uplink at 95% while its three siblings sit at 40% means colliding large flows or a skewed hash ([ECMP and hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing)).
- **Output discards and queue drops**, **buffer occupancy**, **ECN marks** (explicit congestion notification: a congested queue rewrites the two ECN bits in the IP header to "congestion experienced" instead of dropping the packet) and, on RoCE fabrics, **PFC pause frames** (priority flow control: a switch or NIC tells its neighbour to stop sending one traffic class for a moment).
- **Errors:** FCS errors (the frame check sequence is the CRC checksum at the end of every Ethernet frame) and optic receive power, because a link that corrupts frames looks to TCP like a congested one ([optics, cabling and the physical layer](/learn/fabric-networking/fabric-architecture/optics-cabling-and-the-physical-layer)).
- **Who is using the link.** Flow sampling (sFlow or IPFIX) gives the top talkers, which turns "spine2's uplink is full" into "a Globex backup job is filling it". Picking the heaviest flows out of millions of samples is the [top-k flows](/practice/top-k-flows) problem.

Averages hide bursts. A counter polled every 30 seconds reports a mean. If two 400 Gb/s senders converge on one 400 Gb/s port for 1 ms, the excess is 50 MB, comparable to everything a shallow-buffer switch chip holds for all its ports together, so it can cause drops that a 30-second average at 20% utilisation never shows. Discard counters are cumulative, so they keep the burst's drops that the average smooths away: read them, and do not stop at utilisation.

### The host: is the end system the bottleneck?

The host check asks whether the end system, not the network, is the limit. The kernel measures a lot of this per connection: `ss -ti` shows each TCP socket's smoothed RTT, its smallest RTT sample (`minrtt`), congestion window, retransmissions and delayed-ACK timeout ([how Linux sends and receives packets](/learn/fabric-networking/from-zero/how-linux-sends-and-receives-packets) covers where the host drops packets). Two numbers settle many "the network is slow" arguments:

- **TCP's own RTT estimate.** If the kernel measures 80 µs to the peer and the application reports 50 ms, those 50 ms are not spent on the network. One caution: an RTT sample includes any time the peer held its ACK back, so a delayed-ACK stall inflates the smoothed RTT on the side waiting for ACKs. `minrtt` is the network's floor.
- **The window against the bandwidth-delay product.** One TCP connection cannot move more than its window per round trip. For 10 Gb/s from `ams` to `sin` (round trip about 105 ms over 10,500 km of fibre at 5 µs per km each way), the window must hold $10\,\text{Gb/s} \times 0.105\,\text{s} = 1.05\,\text{Gb} \approx 131\,\text{MB}$ in flight. Linux's default maximum buffers (`tcp_rmem` 6 MiB to receive, `tcp_wmem` 4 MiB to send, on current kernels) limit one connection to a few hundred megabits per second at that distance, however fast the circuit is. The fix is a sysctl (a kernel setting) raising those maxima on the two servers, and no network change helps.

On RDMA hosts the network and the host are tightly coupled, so check both sides: NIC counters for CNPs (congestion notification packets, which a receiving NIC sends back to the sender when packets arrive ECN-marked), pause frames and queue-pair errors explain things that switch counters cannot (case 4 below).

### Why this order

Each step is a precondition for reading the next: utilisation means nothing until you know which path the flow takes, and host tuning means nothing while the path drops 4% of packets. The steps also get more expensive: a conversation and a change log, then a few probes, then counters on a known set of devices, then access to someone else's server. In an interview, say it in one sentence: "First I'd confirm scope: one user or many, one site or several. Then reachability, then capacity, then the host."

| Step | What it solves | How it breaks (misleads you) | What signal shows it |
|---|---|---|---|
| Scope | Picks the failure domain before any command | The reporter's "everyone" is one team; a change log is incomplete | Count of affected users, tenants, leaves and sites; change records in the window |
| Reachability | Proves a path exists, in underlay and overlay | One ping tests one ECMP path; traceroute hops are rate-limited CPU replies | Underlay and overlay pings, don't-fragment pings, hash-spread probes |
| Capacity | Proves the path has room right now | Averages hide bursts; fabric-wide numbers hide one bad path | Per-link utilisation and ECMP balance, discards, ECN marks, PFC pauses, FCS errors, top talkers |
| Host | Proves the end system is not the limit | Delayed ACKs inflate TCP's RTT; the host is never checked because "it's the network" | `ss` RTT and `minrtt`, retransmissions, window against the bandwidth-delay product; NIC CNPs, pauses, PCIe link status |

## Case 1: latency up from 10 to 50 ms across an EVPN fabric

Acme reports that since about 09:40 its database queries from `acme-web1` (`10.1.1.10`, behind `leaf1.ams`) to `acme-db1` (`10.1.2.20`, behind `leaf3.ams`) have gone from 10 ms to 50 ms. The traffic is routed between Acme's two subnets with symmetric IRB: routed at `leaf1.ams`, carried across the spines in VXLAN with the tenant's L3VNI 50001 (the VNI that names the tenant's VRF rather than one subnet), and routed again at `leaf3.ams` ([VRFs and multi-tenancy](/learn/fabric-networking/overlays-vxlan-evpn/vrfs-and-multi-tenancy)).

**Scope.** Only `acme-web1` to `acme-db1`: `acme-web1`'s other calls, Globex on the same leaves and `ams`'s other tenants are unchanged. The metric is query time in Acme's application monitoring. Meridian's change log shows nothing in `ams` that morning; Acme's shows a database driver upgrade on `acme-web1` at 09:38. That is a strong lead, but you still check the network quickly, because change logs on both sides can be wrong.

**Reachability.** Ping in the `ACME` VRF works with 0% loss. Don't-fragment pings of 1,472 bytes pass. The EVPN route for `acme-db1` is where it should be and has not moved:

```text
leaf1.ams# show evpn route type-2 ip 10.1.2.20                    (illustrative output)
 [2]:[0]:[48]:[00:00:5e:00:53:14]:[32]:[10.1.2.20]   RD 10.255.1.13:10101
   next hop 10.255.1.13 (leaf3.ams)   L2VNI 10101   L3VNI 50001
   RT 65000:10101 65000:50001   MAC mobility seq 0   age 41d   via rr1.ams, rr2.ams
```

The MAC mobility sequence number goes up by one each time a MAC address is advertised from a new place; 0 on a 41-day-old route means the host has never moved to another leaf or site.

**Capacity.** No link on the path is above 30%, with no discards and no ECN marks. Hash-spread probes between the two leaves (16 TWAMP Light streams, UDP test packets that a reflector timestamps and sends back, differing only in source port, as in [active measurement](/learn/fabric-networking/operating-fabrics/active-measurement)) cover all four spines and show a 99th-percentile round trip of about 60 µs on every stream, the same as last week.

**Physics.** Where could 40 extra milliseconds come from? Each possible source puts a lower bound on what would have to be true:

| Source of +40 ms of round trip | What it would take | Possible here? |
|---|---|---|
| Distance | 20 ms each way at 5 µs per km = 4,000 km of extra fibre | No: the route still points at `leaf3.ams` in the same building. A detour through `sin` would add over 100 ms, not 40 |
| Queueing in the fabric | 40 ms × 400 Gb/s = 2 GB of queued data | No: shallow-buffer data-center switch chips hold tens of megabytes to around 100 MB for all ports, 1–2 ms at 400 Gb/s even if one port had all of it. Deep-buffer routers with gigabytes of external memory sit at the edges, not between two leaves |
| Retransmission | A loss recovered by timeout costs at least 200 ms (Linux's minimum retransmission timeout), so 40 ms on average needs about one query in five to lose a packet | No: the probes see no loss, and `ss` shows `retrans:0` |
| A host timer | Linux's minimum delayed-ACK timeout is 40 ms | Matches exactly |

**The host.** On `acme-db1`, `ss -ti` for the connection shows the kernel's own measurement:

```text
ESTAB 0 0 10.1.2.20:5432 10.1.1.10:51514                            (illustrative output)
   cubic wscale:7,7 rto:201 rtt:0.084/0.019 ato:40 mss:1448 cwnd:10 retrans:0/0 minrtt:0.061
```

TCP measures 84 µs to the peer, with a floor of 61 µs that matches the probes, so the network is not adding 40 ms. `ato:40` is the delayed-ACK timeout. A capture on `acme-web1` shows where the 40 ms go (illustrative):

```text
09:52:11.204113 IP 10.1.1.10.51514 > 10.1.2.20.5432: Flags [P.], seq 40961:40966, ack 90113, length 5
09:52:11.244291 IP 10.1.2.20.5432 > 10.1.1.10.51514: Flags [.], ack 40966, length 0
09:52:11.244335 IP 10.1.1.10.51514 > 10.1.2.20.5432: Flags [P.], seq 40966:41150, ack 90113, length 184
09:52:11.244702 IP 10.1.2.20.5432 > 10.1.1.10.51514: Flags [P.], seq 90113:90532, ack 41150, length 419
```

The new driver writes each query as two pieces: a 5-byte message header, then the 184-byte body. Nagle's algorithm makes the client kernel hold a small segment while an earlier small segment is still unacknowledged. So the body waits for an ACK of the header. The database's kernel delays that ACK in the hope of sending it along with a reply, but it cannot reply until it has the body. Each side waits for the other until the 40 ms delayed-ACK timer fires, on every query ([TCP deep dive](/learn/networking/fundamentals/tcp-deep-dive) measures the same stall). The fix is on the client: set `TCP_NODELAY` on the socket (the previous driver version did) or send each query in one write. Latency returns to 10 ms.

**The other branches** leave different signals: degraded probes sharing one spine (case 2); a recent MAC move to another site, meaning tromboning (detouring through a far site and back) and a distance cost; a full link, with ECN marks and queue occupancy.

## Case 2: a device silently dropping packets

A **silent drop** is a packet that a device discards without counting it anywhere an operator looks. Ping usually misses it, because ping tests one 5-tuple, and fabric-wide averages dilute it. There are two kinds, and they need different signals.

**Counted, but not watched.** A link that corrupts frames increments a counter at the receiving end, but the link stays up and ECMP keeps sending it a full share of traffic. The visualisation shows how hash-spread probes find it:

```viz
{"type": "fabric", "scenario": "probe-localisation", "title": "Hash-spread probes find a lossy link that ping misses", "caption": "Acme's leaf1.ams to leaf3.ams traffic is sometimes slow. Ping takes one path, through spine1, and shows 0% loss. Sixteen TWAMP Light streams that differ only in source port spread over all four spines. The three through spine3.ams lose about 4%, which is only 0.7% averaged over all sixteen. A second leaf pair narrows the fault to the spine3.ams to leaf3.ams link. There, 3.9% of frames fail the frame check because one lane of the optic is weak. Costing out the link makes all sixteen streams clean."}
```

The receive-side FCS counter was incrementing the whole time, but nobody compared it with the link's own baseline. Large operators run such probing continuously between every pair of racks; Microsoft's Pingmesh (SIGCOMM 2015) is the best-known published example.

**Not counted at all.** This is the harder kind. After a software upgrade on `spine2.ams`, some Acme connections to servers behind `leaf4.ams` time out, about one in four, and a retry usually works. A retry opens a new connection with a new source port, so it hashes onto a new spine, and three times in four that spine is not `spine2.ams`. Every routing session is up and every interface counter on `spine2.ams` is clean. The routing software still holds the route to `leaf4.ams`'s VTEP address `10.255.1.14/32`, but the upgrade left it unprogrammed in the switch chip's forwarding table. With no covering route to fall back to, packets that miss the lookup are dropped in the forwarding pipeline, where the standard interface discard counters do not see them. IS-IS hellos (layer-2 frames to the neighbour on the link) and BFD packets (bidirectional forwarding detection: fast liveness checks, here sent to the link's own /31 addresses) never use the missing loopback route, so they still flow. The adjacency stays up and routing never removes the broken path.

Meridian's probe agents sit in a probe VRF on every leaf, so their packets are VXLAN-encapsulated towards `10.255.1.14` exactly like Acme's, and they meet the same fault. Probes and counters find it in three steps, all in the program below:

1. **Probes:** list the elements on every degraded path, then remove every element that also appears on a healthy path.
2. **The wire:** compare what each end of the suspect link sent and received.
3. **Conservation inside the device:** every frame that enters must leave, be counted as dropped, or be punted to the CPU. Whatever is left over was dropped without being counted.

```python
import hashlib

SPINES = ["spine1.ams", "spine2.ams", "spine3.ams", "spine4.ams"]
AGENT = {"leaf1.ams": "10.250.11.10", "leaf3.ams": "10.250.13.10", "leaf4.ams": "10.250.14.10"}


def path_of(src, dst, sport):
    """What a probe crosses: leaf, uplink, spine, the spine's forwarding to dst, leaf."""
    key = f"{AGENT[src]}|{AGENT[dst]}|17|{sport}|862".encode()
    h = int.from_bytes(hashlib.sha256(key).digest()[:4], "big")   # stands in for the ASIC hash
    spine = SPINES[h % len(SPINES)]
    return [src, f"{src}>{spine}", spine, f"{spine}>{dst}", dst]


def loss_for(path):
    """The fault under diagnosis: spine2.ams drops what it forwards to leaf4.ams."""
    return 1.0 if "spine2.ams>leaf4.ams" in path else 0.0


streams = [{"pair": f"{src}->{dst}", "path": (p := path_of(src, dst, sport)), "loss": loss_for(p)}
           for src, dst in [("leaf1.ams", "leaf4.ams"), ("leaf3.ams", "leaf4.ams"),
                            ("leaf1.ams", "leaf3.ams")]
           for sport in range(50001, 50017)]             # 16 streams per pair

bad = [s for s in streams if s["loss"] > 0.01]
good = [s for s in streams if s["loss"] <= 0.01]
for pair in sorted({s["pair"] for s in streams}):
    row = []
    for spine in SPINES:
        mine = [s for s in streams if s["pair"] == pair and s["path"][2] == spine]
        n_bad = sum(s["loss"] > 0.01 for s in mine)
        row.append(f"{spine[:6]} {len(mine) - n_bad} ok/{n_bad} bad")
    print(f"{pair:22}" + "  ".join(row))
mean = sum(s["loss"] for s in streams) / len(streams)
print(f"{len(bad)} of {len(streams)} streams degraded; mean loss over all streams {mean:.1%}")

# Step 1: suspects are on every degraded path and on no healthy one.
suspects = set.intersection(*(set(s["path"]) for s in bad))
suspects -= set().union(*(set(s["path"]) for s in good))
print("suspects from probes:", sorted(suspects))

# Step 2: is it the wire? Five minutes of counters on every spine's link to leaf4, in frames.
down_to_leaf4 = {"spine1.ams": (6_302_114_900, 6_302_114_900), "spine2.ams": (1_180, 1_180),
                 "spine3.ams": (6_297_550_120, 6_297_550_120), "spine4.ams": (6_305_871_310, 6_305_871_310)}
for spine, (sent, received) in down_to_leaf4.items():
    print(f"  {spine}>leaf4.ams  sent {sent:>13,}  received {received:>13,}  lost on the wire {sent - received}")

# Step 3: conservation inside the device: what came in must go out, be counted dropped, or be punted.
d = {"rx": 36_001_250_000, "tx": 29_701_180_000, "counted_drops": 0, "punted": 151_000}
missing = d["rx"] - d["tx"] - d["counted_drops"] - d["punted"]
print(f"  spine2.ams: in {d['rx']:,}, out {d['tx']:,}, counted drops {d['counted_drops']}, "
      f"punted {d['punted']:,} -> unaccounted {missing:,} ({missing / d['rx']:.1%})")
```

```text
leaf1.ams->leaf3.ams  spine1 6 ok/0 bad  spine2 3 ok/0 bad  spine3 4 ok/0 bad  spine4 3 ok/0 bad
leaf1.ams->leaf4.ams  spine1 3 ok/0 bad  spine2 0 ok/5 bad  spine3 4 ok/0 bad  spine4 4 ok/0 bad
leaf3.ams->leaf4.ams  spine1 4 ok/0 bad  spine2 0 ok/3 bad  spine3 6 ok/0 bad  spine4 3 ok/0 bad
8 of 48 streams degraded; mean loss over all streams 16.7%
suspects from probes: ['spine2.ams>leaf4.ams']
  spine1.ams>leaf4.ams  sent 6,302,114,900  received 6,302,114,900  lost on the wire 0
  spine2.ams>leaf4.ams  sent         1,180  received         1,180  lost on the wire 0
  spine3.ams>leaf4.ams  sent 6,297,550,120  received 6,297,550,120  lost on the wire 0
  spine4.ams>leaf4.ams  sent 6,305,871,310  received 6,305,871,310  lost on the wire 0
  spine2.ams: in 36,001,250,000, out 29,701,180,000, counted drops 0, punted 151,000 -> unaccounted 6,299,919,000 (17.5%)
```

How to read the output:

- **The pair `leaf1.ams->leaf3.ams` clears `spine2.ams` as a whole:** three healthy streams cross it, leaving only its forwarding towards `leaf4.ams`. Without that pair, "the spine is broken" and "the spine's route to one leaf is broken" look the same.
- **The wire is clean,** sent equals received on every link. But `spine2.ams` sent only 1,180 frames to `leaf4.ams` in five minutes, about four a second of IS-IS hellos, BFD and LLDP (link layer discovery protocol, which announces each device to its neighbour), while each sibling sent 6.3 billion: the tenant frames never reached the link, so the downlink imbalance is itself a signal.
- **Conservation names the device.** 6.3 billion frames went into `spine2.ams` and never came out, about what each sibling delivered to `leaf4.ams`: one spine silently swallowing its quarter of that leaf's traffic.

The fix is to cost out `spine2.ams` (set the IS-IS overload bit, which tells every router not to send transit traffic through it, or raise its metrics, as in [safe change and maintenance](/learn/fabric-networking/operating-fabrics/safe-change-and-maintenance)), capture its state for the vendor, get the hardware table reprogrammed, check it and restore. Prevention is a consistency check between the RIB (the routes the software chose), the FIB (what it handed to the chip) and the chip's own table, run after every upgrade. Some switch chips can also report drops directly: NVIDIA's What Just Happened on Spectrum switches reports dropped packets with a reason, such as "no route" or "ACL deny" (an access control list rule). Other chips offer mirror-on-drop, which copies dropped packets to a collector.

Host-side TCP retransmissions per rack often rise before anything on the network does, which makes them the cheapest early warning for both kinds.

## Case 3: telemetry gone quiet: dead or congested?

`leaf2.ams` stops streaming telemetry. **Scope first, again:** if every device in `ams` went quiet at once, suspect the collector, its leaf (`leaf4.ams`) or the subscription service. One device going quiet raises the real question. Meridian's collector holds a gNMI subscription (gNMI is the gRPC network management interface, a streaming API for device state; see [telemetry and observability](/learn/fabric-networking/operating-fabrics/telemetry-and-observability)), and those samples ride the data network. An out-of-band (OOB) monitor reaches every device's management port over the separate management network, `172.16.0.0/16`:

```viz
{"type": "fabric", "scenario": "telemetry-blind", "title": "Telemetry gone quiet: alive but congested", "caption": "A Globex batch job saturates leaf2.ams's uplinks. leaf2's telemetry shares the best-effort queue and is dropped, and after three missed samples the collector raises an absence-of-data alert. The gNMI keepalive takes the same path, so it cannot tell dead from congested. The OOB ping answers in 0.6 ms, and the spines report the links up, IS-IS up and 399 Gb/s arriving from leaf2. Verdict: alive, telemetry blind. When the job ends, the stream resumes with a 4-minute gap, which is recorded as a gap and not as zeros. The fix marks telemetry CS2 and gives it a protected queue."}
```

```viz
{"type": "fabric", "scenario": "telemetry-blind", "variant": "dead", "title": "Telemetry gone quiet: the device is dead", "caption": "This time leaf2.ams loses power. The absence-of-data alert fires at the same moment as before, and the gNMI keepalive fails as before. The difference: three OOB pings time out while every other device on the management switch answers, the spines lose signal on their ports to leaf2, IS-IS adjacencies drop and LLDP stops listing it. Verdict: dead, so page the on-call engineer and tie the alert to the servers behind leaf2."}
```

The method has two independent witnesses, and each covers a different path:

| OOB heartbeat | Neighbours (spines' telemetry) | Verdict | Action |
|---|---|---|---|
| Answers | Links up, adjacencies up, heavy load from the device | Alive, telemetry blind: congested | Find the traffic filling the uplinks; read the spines' counters in the meantime |
| Times out (others on the same OOB switch answer) | Loss of signal, adjacencies down | Dead | Page; work out which hosts lost their only path |
| Answers | Adjacencies down | Alive but cut off from the fabric | The device's uplinks or routing process: the gray state in between |
| Times out | Links up, adjacencies up | Forwarding, but management lost | OOB network or management port; lower urgency, but you are blind |

Four design rules follow: sequence numbers or timestamps on every sample, so a gap differs from a stream that has ended; an absence-of-data alert, because silence produces no bad value to alert on; telemetry marked CS2 (DSCP, the 6-bit traffic-class field in the IP header, set to 16) into a queue with a guaranteed share; and the heartbeat and alert path out of band, so the platform can say "I am blind here". The bulk of the telemetry still rides the data network, because a management network is built for SSH and software images, not gigabits of counters.

## Case 4: RoCE job slowdowns

The San Jose cluster runs training jobs over RoCEv2 (RDMA, remote direct memory access, carried in UDP to port 4791 over IP: the NIC writes straight into remote memory without involving the CPU, as explained in [RDMA from zero](/learn/fabric-networking/ai-fabrics/rdma-from-zero)). Two facts make troubleshooting it different. First, training is synchronous: every GPU waits at each collective (an all-reduce, which sums gradients across GPUs) for the slowest transfer. Second, the fabric is lossless: the RoCE traffic class (priority 3, a common convention that Meridian follows) does not drop packets, it pauses them, so congestion shows up as pause frames and ECN marks rather than drops ([lossless Ethernet](/learn/fabric-networking/ai-fabrics/lossless-ethernet-pfc-ecn-dcqcn)). The first fact explains why one bad component slows a whole job:

```viz
{"type": "fabric", "scenario": "training-step", "title": "One link at half speed slows every GPU", "caption": "Eight GPUs on rail1-leaf1.sjc train with data parallelism. Step 1: 300 ms of compute and a 70 ms all-reduce. Before step 2, srv005's link comes back at 200 Gb/s instead of 400. The ring moves in lockstep, so the all-reduce takes 140 ms on every GPU, and step 2 takes 440 ms. All eight GPUs report the same step time, so they cannot say which one is slow. The leaf's port counters can: one port is saturated at a reduced speed."}
```

The case: job A (512 GPUs on `srv001`–`srv064`) has gone from a step time of 4.20 s to 5.18 s since a maintenance window last night, in which several servers had hardware serviced. Job B on `srv065`–`srv128` is 4% slower.

**Scope.** Every one of job A's ranks (one process per GPU) reports the same step time, as the visualisation shows, so scope by rail instead. Each GPU's NIC sits on its own rail (rail k connects GPU k of every server to rail k's leaves, from [AI fabric topologies](/learn/fabric-networking/ai-fabrics/ai-fabric-topologies)). Utilisation sits around 55% on all eight rails, because the whole job has slowed, but only rail 3 shows PFC pause frames and ECN marks.

**Reachability.** All queue pairs (an RDMA connection's pair of send and receive queues on each NIC) are connected and there are no errors from NCCL, NVIDIA's collective communication library. Nothing is down.

**Capacity, switch side.** There are no drops and no errors anywhere, which is what a lossless class looks like when it is in trouble. Pause frames are rising on many rail-3 ports: leaves pausing spines, spines pausing the other leaf, leaves pausing servers. A dashboard that ranks ports by pause count lights up half of rail 3 and suggests fabric-wide congestion. But a paused port is usually a victim. Pauses travel upstream, away from the congestion, so the place to look is where the chain starts: the node that sends pauses and receives none.

```python
from collections import defaultdict

# PFC PAUSE frames per second over the last minute, per (sender, receiver) pair:
# ("rail3-leaf1.sjc", "ai-spine4.sjc") means rail3-leaf1 is pausing ai-spine4.
pauses = {
    ("srv037/nic3", "rail3-leaf1.sjc"): 41_200,
    ("rail3-leaf1.sjc", "ai-spine1.sjc"): 3_900, ("rail3-leaf1.sjc", "ai-spine4.sjc"): 4_100,
    ("rail3-leaf1.sjc", "srv012/nic3"): 2_200, ("rail3-leaf1.sjc", "srv040/nic3"): 2_350,
    ("ai-spine1.sjc", "rail3-leaf2.sjc"): 610, ("ai-spine4.sjc", "rail3-leaf2.sjc"): 580,
    ("rail3-leaf2.sjc", "srv070/nic3"): 95, ("rail3-leaf2.sjc", "srv101/nic3"): 120,
}
THRESHOLD = 50          # PAUSEs per second worth caring about

paused_by = defaultdict(set)   # victim -> who pauses it
senders, receivers = set(), set()
for (src, dst), rate in pauses.items():
    if rate >= THRESHOLD:
        paused_by[dst].add(src)
        senders.add(src)
        receivers.add(dst)

# A root sends PAUSE but receives none: its congestion is its own, not inherited.
roots = sorted(senders - receivers)
print("pause roots:", roots or "none: every sender is itself paused, look for a cycle (deadlock)")


def chain(victim):
    """Follow 'who paused me' upstream until reaching a root (busiest pauser first)."""
    hops, node, seen = [victim], victim, {victim}
    while paused_by.get(node):
        node = max(paused_by[node], key=lambda s: pauses[(s, node)])
        if node in seen:
            return hops + [node, "(cycle)"]
        hops.append(node)
        seen.add(node)
    return hops


for victim in ["srv070/nic3", "srv012/nic3"]:
    print(f"{victim:12} paused by: " + " <- ".join(chain(victim)[1:]))
```

```text
pause roots: ['srv037/nic3']
srv070/nic3  paused by: rail3-leaf2.sjc <- ai-spine1.sjc <- rail3-leaf1.sjc <- srv037/nic3
srv012/nic3  paused by: rail3-leaf1.sjc <- srv037/nic3
```

The root is a server, not a switch: `srv037`'s rail-3 NIC is pausing its leaf 41,200 times a second. Job B never talks to `srv037`, but its rail-3 traffic shares the spines and `rail3-leaf2.sjc`, which are paused on `srv037`'s behalf, and a pause stops a whole priority on a link. If every sender were itself paused there would be no root, which is how a PFC deadlock looks (covered in [when lossless goes wrong](/learn/fabric-networking/ai-fabrics/when-lossless-goes-wrong)).

**The host.** On `srv037` (illustrative output, ConnectX-class NIC counters and Linux PCIe status):

```text
srv037$ ethtool -S <rail-3 NIC> | grep -E 'prio3_pause|pci_stalled'
     tx_prio3_pause: 2471988000          (rising 41,200/s; other servers: under 100/s)
     rx_prio3_pause: 0
     outbound_pci_stalled_wr: 71         (% of the last second; other servers: 0-2)
srv037$ cat /sys/class/infiniband/<rail-3 NIC>/ports/1/hw_counters/np_cnp_sent
     918233441                           (about 30 times any other rail-3 NIC)
srv037$ sudo lspci -vv -s <NIC address> | grep -E 'LnkCap|LnkSta'
     LnkCap: Port #0, Speed 32GT/s, Width x16
     LnkSta: Speed 32GT/s, Width x8 (downgraded)
```

The NIC's PCIe slot came back from maintenance at half width. Gen5 x8 carries about 31.5 GB/s raw ($32\,\text{GT/s} \times 8 \times 128/130 / 8$), about 250 Gb/s, so after protocol overhead the NIC writes received data into memory at around 220 Gb/s while the fabric delivers 400. Its receive buffer fills and it pauses the leaf (`tx_prio3_pause`); `outbound_pci_stalled_wr` says it is waiting on PCIe write credits. Packets queue at the leaf's port towards `srv037` and get ECN-marked, so its NIC sends many CNPs (`np_cnp_sent`), and DCQCN (the rate-control algorithm RoCE NICs run on those notifications) slows every sender to `srv037` to the rate it can absorb ([scale-up, NVLink and NVSwitch](/learn/fabric-networking/ai-fabrics/scale-up-nvlink-and-nvswitch) has the PCIe arithmetic). Every ring that passes through `srv037` runs at about 220/400 of its speed. Job A's exposed communication time (the part not overlapped with compute) grows from 1.20 s to about $1.20 \times 400/220 \approx 2.18$ s, so the step goes from 4.20 to 5.18 s.

The fix: drain `srv037` from the scheduler (job A restarts from its checkpoint on a spare server), reseat the NIC or its riser, confirm `LnkSta` matches `LnkCap`, and run `ib_write_bw` (a perftest bandwidth test) before returning it ([tuning and benchmarking RDMA](/learn/fabric-networking/ai-fabrics/tuning-and-benchmarking-rdma)). Prevention: a node health check that refuses any server whose PCIe link status is below its capability. The switch counters said "rail 3 is congested". Only the host counters said "one server cannot drain".

## Failure modes of the method

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| **Averages hide the path** | Fabric-wide loss of 0.7% "within tolerance" while a quarter of the flows lose 4% | Group probe results and counters by path and by link, not by site | Alert on the worst path and the worst link, not on the mean |
| **Chasing the victim** | The loudest counter (most pauses, most discards) is on a device that is healthy | Pauses travel upstream and discards happen where queues overflow, which may be downstream of the cause | Follow the chain to its root; ask whether a counter shows cause or effect |
| **Green dashboards during an outage** | Every session Established and every interface up while customers fail | State checks prove the control plane, not forwarding ([the BGP black hole](/learn/fabric-networking/bgp-fundamentals/the-bgp-black-hole)) | Probes that carry real traffic patterns; conservation checks |
| **Destroying the evidence** | A reload "fixes" a fault that then returns with no record of its cause | Counters, hardware tables and logs were not captured before the action | Snapshot state first: tooling should capture it automatically before any remediation |
| **Two changes at once** | The problem goes away and nobody knows why, or a new one appears | More than one variable moved | One change, one validation, then the next |

## Trade-offs: diagnostic strategies

| Strategy | How it works | Fast when | Fails when | Needs |
|---|---|---|---|---|
| Scope, then reachability, capacity, host | Narrow the domain, then test layers in order of cost | Almost always; the default | The scope is wrong (a customer's "everyone" is one team) | Good scoping data: who, where, what, when |
| Follow the change | Line the start time up against the change logs | A clean change log and a sharp start time | Faults that build up slowly (optics drifting over weeks) | Change logs from the operator and the customer |
| Compare good and bad | Find what differs between a working flow and a failing one | Similar endpoints where some work and some do not | Nothing works, so there is nothing to compare | A known-good reference flow |
| Split the path | Test halfway along, then halfway again (binary search over hops) | Long linear paths (a backbone, a chain of services) | ECMP: there is no single path to split | Probe points along the path |
| Bottom-up through the layers | Physical, then link, then IP, then transport | Bring-up of new hardware and cabling | Fault is in the application; slow on a large fabric | Console access to devices |

## Under the hood: what a counter actually counts

Each counter is incremented at one stage of the switch chip's pipeline ([planes, ASICs and network operating systems](/learn/fabric-networking/from-zero/planes-asics-and-network-operating-systems)). A bad FCS is an input error at the receiving port; a full egress queue is an output discard at the egress port; a lookup miss or an ACL deny is dropped inside the pipeline. Depending on the chip and the network operating system, that drop appears in a per-reason counter, in an aggregate "pipeline drop" counter, or nowhere. The standard SNMP interface counters (IF-MIB, RFC 2863: `ifInDiscards`, `ifOutDiscards`, `ifInErrors`) do not cover all of these. That gap is why case 2's drop was silent, and why conservation and per-drop-reason features exist.

Counter arithmetic catches people out too. A 32-bit octet counter wraps after $2^{32}$ bytes, 4.3 GB, which takes 86 ms at 400 Gb/s, so rates polled every 30 seconds are meaningless and high-speed ports need the 64-bit counters (`ifHCInOctets`). A reboot resets counters to zero, which a naive rate calculation turns into a huge spike. A 30 ms burst shows up only in drop counters, queue watermarks (the deepest a queue reached since it was last read) or per-packet drop reports, never in a 10-second average.

## What the platform should show

The engineer wants the failing path and the counter that names the cause, fast; the incident manager wants the blast radius, whether it is growing, and whether to step in. Build both views from one dataset so they never disagree.

- **A scope panel first:** affected tenants, leaves, sites and flows, with the start time and the change records that fall in the window.
- **Per-path results, not per-site averages:** probe results grouped by the spine and link each probe crossed, with the worst path highlighted ([active measurement](/learn/fabric-networking/operating-fabrics/active-measurement)).
- **Conservation checks:** sent against received for every link, in against out plus counted for every device, flagged when frames go missing.
- **Three telemetry states:** streaming, blind but alive (heartbeat answers), dead (heartbeat and neighbours agree). A gap is stored as a gap, never as zeros.
- **Cause chains, not counter rankings:** PFC pauses followed to their root; discards labelled by reason; a paused port marked as a victim.
- **Host signals beside switch signals:** TCP RTT and retransmissions per rack; on RDMA hosts, CNPs sent and handled, pause frames sent, queue-pair errors, and PCIe link status against capability.
- **An evidence snapshot** of counters, hardware tables and logs taken automatically when an alert fires, before anyone reloads anything.
- **Physics checks:** the minimum latency each path's distance allows, so "+40 ms" can be compared at once with "needs 4,000 km or 2 GB of buffer".

## Interviewer follow-ups

**"A customer's latency went from 10 to 50 ms across the EVPN fabric. What do you collect, and how do you narrow tens of thousands of links?"** Model answer: scope (which flows, which leaves, since when, what changed) and turn "10 ms" into a measured metric. Check whether the destination's EVPN route moved. Run hash-spread probes between the two leaves; if the degraded ones share a spine or link, read that element's counters and compare sent with received. If the probes are clean, read the host: TCP's RTT, retransmissions, timers. Test the physics: 40 ms is 4,000 km or 2 GB of buffer. Common wrong answer: "I'd log into every switch and look for errors", which does not scale and skips the probes that say which switch to look at.

**"Telemetry from a device stops. Is it dead or congested?"** Model answer: scope first (all devices quiet means the collector). Then two witnesses that do not share the telemetry's path: an OOB heartbeat and the neighbours' view of links and adjacencies, whose four combinations give four verdicts. Automate it with an absence-of-data alert, sequenced samples and a protected traffic class. Common wrong answer: "check whether the gNMI session is up". The session's keepalive takes the same path as the data and fails the same way in both cases.

**"A device is silently dropping packets. What shows it?"** Model answer: errors, discards and per-reason drops first; a truly silent drop is in none of them, so check conservation per link and per device, probe with varied 5-tuples (silent drops often hit only some hash buckets or destinations), compare RIB, FIB and hardware, and use per-drop-reason reporting such as What Just Happened where the chip has it. Common wrong answer: "ping it", when ping takes one path.

**"A RoCE training job slowed by 20% and the switch dashboards show no drops. Where do you look?"** Model answer: no drops is normal for a lossless class. Compare ECN marks and pauses by rail, follow the pauses to the node that sends without receiving, and read the host: CNPs, pauses sent by the NIC, queue-pair errors, PCIe link status. Honest addition: "I'd defer to the network team on the exact ECN and PFC thresholds for a given switch, but I'd build the view that puts per-rail switch counters next to per-NIC host counters, because that join is what finds the straggler." Common wrong answer: "add bandwidth" when the fabric is half idle.

## What mid-level engineers get wrong

- **Running commands before scoping.** Twenty minutes spent on one switch's counters for a problem that affects one host's driver.
- **Trusting one ping.** It tests one of four (or sixteen) ECMP paths; the broken one is often another.
- **Reading "no drops" on a lossless class as healthy.** RoCE congestion shows as pauses and ECN marks, rarely as drops.
- **Stopping at the switch.** On RDMA fabrics especially, host counters (CNPs, pauses sent, PCIe status) explain what switch counters cannot.

## Senior signals

- You scope (who, where, what, when) before you touch a device, then test reachability, capacity and the host, in that order.
- You translate "10 ms" into a metric and a 5-tuple, because under ECMP a problem without a 5-tuple has no path.
- You do the physics first: 40 ms is 4,000 km of fibre or 2 GB of buffer, so impossible causes are ruled out before any investigation.
- You localise by grouping probes per path and checking conservation per link and device, which finds drops no counter records.
- You settle "telemetry stopped" with two independent witnesses, and make "blind" a state of its own in the platform.
- You follow pauses and discards to their root and read the host side, because on RoCE the switch shows where congestion is and the host shows why.

## Check yourself

```quiz
- q: >-
    A customer says latency between two of their servers in one Meridian site rose from 10 ms to 50 ms. Hash-spread probes between the two leaves show a 60 µs round trip on every stream, unchanged, and the kernel's ss output on the server shows rtt 0.084 ms. What is the most likely conclusion?
  options: ["The 40 ms is spent in the hosts, not the network", "One spine is congested and adds 40 ms of queueing", "The probes take different paths from the real traffic", "The tenant's EVPN route moved to a remote site"]
  answer: 0
  explanation: >-
    TCP's own RTT estimate and the probes agree that the network round trip is tens of microseconds, so the extra 40 ms is added above the network, in the hosts or the application (here, Nagle interacting with the 40 ms delayed-ACK timer). Fabric queueing of 40 ms at 400 Gb/s would need 2 GB of buffer, far more than a shallow-buffer switch has, and the probes would have seen it. A move to a remote site would add more than 100 ms and the kernel's RTT would show it.
- q: >-
    Sixteen probe streams between leaf1.ams and leaf3.ams spread across four spines. Three streams, all through spine3.ams, lose about 4%; the rest lose nothing. What should you do next to tell spine3 itself from one of its links?
  options: ["Raise the probe rate tenfold to measure the loss more precisely", "Reload spine3 and check whether the loss stops", "Ping spine3's loopback from leaf1 to test its control plane", "Probe from a second leaf pair to triangulate spine3's links"]
  answer: 3
  explanation: >-
    Triangulating with another leaf pair separates the elements: if leaf2-to-leaf3 streams through spine3 also lose and leaf1-to-leaf2 streams through spine3 do not, the shared element is the spine3-to-leaf3 link. A ping to the loopback tests the control plane and one path. More probes refine the number, not the location. A reload destroys the evidence before the cause is known.
- q: >-
    A device's interface counters show no discards and no errors, yet 6.3 billion of the 36 billion frames it received in five minutes were neither transmitted nor punted to its CPU. What does this show?
  options: ["A link next to it is corrupting frames in transit", "It forwarded those frames over its management port", "It dropped frames somewhere its counters do not cover", "The counters wrapped, so the totals are not reliable"]
  answer: 2
  explanation: >-
    Conservation says frames in must equal frames out plus counted drops plus punts; the remainder was dropped without being counted, for example on a lookup miss in the pipeline after a hardware table lost an entry. Corruption on a link appears as FCS errors at the receiving end and a sent-versus-received gap on that link. 64-bit counters do not wrap in five minutes, and data traffic never leaves through the management port.
- q: >-
    Streaming telemetry from leaf2.ams stops. The OOB ping to its management port answers in 0.6 ms, and the spines report their links to leaf2 up with IS-IS adjacencies Up and near-full load arriving from it. What is the verdict?
  options: ["Alive and congested: its telemetry is being dropped", "Alive but cut off from the fabric by its uplinks", "Dead: page on-call, its servers are cut off", "The collector has failed and every device is quiet"]
  answer: 0
  explanation: >-
    The heartbeat proves the device is powered and running, and the neighbours prove its links and routing are up and saturated, so the telemetry is being dropped with the rest of the best-effort traffic. Dead would show OOB timeouts and loss of signal; cut off would show adjacencies down while the OOB ping answers. A failed collector would make every device quiet at once, which scoping rules out here.
- q: >-
    On a RoCE fabric, pause frames are rising on many rail-3 switch ports, and one server's NIC sends 41,200 pauses a second while receiving none. Which statement is right?
  options: ["The pausing switch ports have the most congestion and should be drained", "ECN must be disabled on rail 3, because pauses are replacing marks", "The server is the root, and the switch ports are pausing on its behalf", "The busiest spine port is the cause, since it carries the most pauses"]
  answer: 2
  explanation: >-
    PAUSE travels upstream from where buffers fill, so a node that sends pauses without receiving any is where the congestion starts; every paused switch port is passing the problem along, which makes it a victim. Here the host's PCIe link had trained at half width, so its NIC could not drain at line rate. ECN marks are present too; ranking ports by pause count points at victims, not the cause.
```
