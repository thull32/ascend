---
slug: ai-fabric-topologies
title: "AI fabric topologies: rails, adaptive routing and the job-stalling link"
description: Why a GPU server sits on four separate networks, how rail-optimised back ends follow NCCL's traffic, the arithmetic of scaling to tens of thousands of GPUs, why per-packet adaptive routing beats ECMP only with a reorder-tolerant NIC, what SuperNICs and DPUs are, and how one failed or slow link stops an entire training job.
minutes: 45
difficulty: hard
tags: [fabric-networking, ai-networking, rail-optimized, adaptive-routing, packet-spraying, spectrum-x, supernic, dpu, roce, nccl, failure-domains, interview]
problems: [blast-radius]
---
A 1,024-GPU training job runs in lockstep. Every step ends with a collective in which every GPU exchanges data with others, and the step finishes only when the last transfer does ([why AI traffic is different](/learn/fabric-networking/ai-fabrics/why-ai-traffic-is-different)). The network does not have to be fair to millions of independent flows; it has to give a few thousand very large, synchronised flows their full line rate at the same instant, every few hundred milliseconds, for weeks. Any link that is shared, slower than its siblings or briefly down sets the pace for all 1,024 GPUs.

That requirement explains four networks per server, eight NICs on eight different switches (rails), per-packet adaptive routing in place of ECMP, NICs that became computers, and one bad optic idling a whole job. The running example is Meridian's San Jose cluster: 128 servers (`srv001` to `srv128`), each with eight H100-class GPUs and one 400 Gb/s RoCEv2 NIC per GPU. RoCEv2 carries RDMA (remote direct memory access: a NIC writing straight into another machine's memory without either kernel on the data path) inside UDP packets ([RDMA from zero](/learn/fabric-networking/ai-fabrics/rdma-from-zero), [InfiniBand and RoCE](/learn/fabric-networking/ai-fabrics/infiniband-and-roce)).

## Four networks per GPU server

A GPU server plugs into more than one fabric, because the traffic it carries comes in four kinds with incompatible needs. A fifth domain, NVLink inside the server, is not a network you cable between servers; it is the scale-up domain of [NVLink and NVSwitch](/learn/fabric-networking/ai-fabrics/scale-up-nvlink-and-nvswitch).

| Network | What crosses it | Per server at Meridian `sjc` | Transport | If it fails |
|---|---|---|---|---|
| **Back end** (compute, scale-out, "east-west GPU") | Gradients, activations, all-reduce and all-to-all between GPUs | 8 × 400 Gb/s = 3.2 Tb/s, one NIC per GPU | RoCEv2 (RDMA over UDP 4791), lossless or near-lossless | Running jobs stop |
| **Front end** | Users, the scheduler, container images, logs, metrics, NCCL's TCP bootstrap, internet | 2 × 200 Gb/s through one DPU | Ordinary TCP/IP over Meridian's EVPN fabric | Jobs keep computing; nobody can reach or launch them |
| **Storage** | Training data reads, checkpoint writes | 2 × 200 Gb/s | NFS, parallel file systems, NVMe over fabrics, often RDMA | Data loading stalls; checkpoints fail |
| **Management** (out of band) | BMC (baseboard management controller: power, console, firmware), switch management ports, PXE boot | 1 GbE BMC port | IPMI (over UDP 623) or Redfish (HTTPS), on `172.16.0.0/16` | Invisible until you need to recover something |

The back end carries 3.2 Tb/s per server, eight times the front end, and is the subject of most of this module. A DGX H100-class server is built this way, with eight single-port 400 Gb/s ports for the compute fabric, separate dual-port NICs for storage and in-band traffic, and a dedicated BMC port.

### Why keep them apart

**The back end is lossless; the others are not.** RoCE's reliable connection recovers from a drop by resending everything after it, so the back end runs PFC (priority flow control, per-priority pause frames) and ECN-driven DCQCN rate control ([lossless Ethernet](/learn/fabric-networking/ai-fabrics/lossless-ethernet-pfc-ecn-dcqcn)). Put ordinary TCP traffic on the same switches and a single misbehaving storage client can trigger pauses that spread into the GPU traffic ([when lossless goes wrong](/learn/fabric-networking/ai-fabrics/when-lossless-goes-wrong)). TCP handles drops and wants none of that machinery.

**Bursts collide.** A checkpoint of a 70-billion-parameter model with optimizer state is about 1 TB (14 to 16 bytes per parameter: 16-bit weights, 32-bit master weights, two Adam moments). At 200 GB/s of storage throughput that is 5 s of storage elephants, which on a shared fabric would land on the uplinks the next step's gradients need.

**Failure domains differ.** A front-end outage should not stop a running job, and a back-end change should not cut anyone off from the BMCs they need for repair, so the management network shares nothing: its own switches, addresses and ideally power ([telemetry and observability](/learn/fabric-networking/operating-fabrics/telemetry-and-observability)).

**Security and tenancy.** The front end, where users, tenants and the internet are, is Meridian's ordinary San Jose leaf-spine with EVPN isolation. The back end has no route out: its addresses (`10.200.<rail>.<server>`) are reachable only from other GPU NICs.

Designs vary at the edges (some clouds converge storage onto the front end; some InfiniBand clusters carry storage on the compute fabric in its own partition), but none puts user traffic on the back end.

- **Solves:** each kind of traffic gets the loss model, bandwidth and failure domain it needs.
- **Breaks:** software picking the wrong network: NCCL using the storage NIC, or falling back to TCP sockets, runs the job at a fraction of its speed with no error.
- **Signal:** the RDMA devices NCCL logs at startup (`NCCL INFO NET/IB : Using [0]mlx5_0:1/RoCE ...`) against the eight back-end devices, and per-device byte counters during a step.

What the host sees (illustrative output on `srv001.sjc`, trimmed):

```text
$ rdma link show
link mlx5_0/1 state ACTIVE physical_state LINK_UP netdev bk1    <- rail 1, 10.200.1.1
link mlx5_1/1 state ACTIVE physical_state LINK_UP netdev bk2    <- rail 2, 10.200.2.1
...
link mlx5_7/1 state ACTIVE physical_state LINK_UP netdev bk8    <- rail 8, 10.200.8.1
link mlx5_8/1 state ACTIVE physical_state LINK_UP netdev fe0    <- DPU port 1, front end
link mlx5_9/1 state ACTIVE physical_state LINK_UP netdev fe1    <- DPU port 2, front end
link mlx5_10/1 state ACTIVE physical_state LINK_UP netdev st0   <- storage port 1
link mlx5_11/1 state ACTIVE physical_state LINK_UP netdev st1   <- storage port 2
```

Twelve RDMA devices, eight of which belong to the job (`mlx5_0` is NIC 1, the NIC of GPU1). Pinning NCCL to `mlx5_0` to `mlx5_7` (`NCCL_IB_HCA`) is a one-line fix and a check worth running before every launch.

## Rail-optimised design

In an ordinary data center a server's NICs go to the leaf in its own rack, its top-of-rack switch. A GPU back end does something that looks odd at first: **NIC k of every server goes to the leaf of rail k.** All 128 GPU1 NICs connect to rail 1, all GPU2 NICs to rail 2, and so on. A rail is that set of leaves; in San Jose each rail has two leaves, `railk-leaf1.sjc` for `srv001` to `srv064` and `railk-leaf2.sjc` for `srv065` to `srv128`.

The design follows NCCL's traffic. NCCL ([collectives and NCCL](/learn/fabric-networking/ai-fabrics/collectives-and-nccl)) binds each GPU to its nearest NIC, the one on the same PCIe switch, and builds its rings and trees so that GPU k on one server talks to GPU k on the others. Data moving between GPUs inside a server crosses NVLink (about 900 GB/s per GPU counting both directions, 450 GB/s each way), so nearly every byte that leaves a server travels between same-numbered GPUs, stays inside one rail, and mostly crosses a single switch. (The drawings below label servers `srv1`, `srv2` and so on; they are `srv001`, `srv002`.)

```viz
{"type": "fabric", "scenario": "rail-optimized", "title": "Rail-optimised back end: GPU k on rail k, one switch for same-rail traffic, PXN for cross-rail, and the cost of one failed NIC link", "caption": "Two of the 128 San Jose servers, with the first leaf of each rail and one of the eight spines. The sizing table gives 16 leaves and 8 spines for 1,024 GPUs. GPU3 to GPU3 crosses only rail3-leaf1; GPU7 to GPU8 sent directly climbs through a spine; with PXN it moves over NVLink to GPU8 first and then crosses one switch on rail 8. The last frames compare the paths and fail srv2's GPU8 link, which stops the job."}
```

### Sizing the San Jose back end

With 51.2 Tb/s switches (Spectrum-4 class, 128 ports of 400 Gb/s), each leaf gives 64 ports to NICs and 64 to spines, so it is not oversubscribed (1:1, as [Clos and leaf-spine](/learn/fabric-networking/fabric-architecture/clos-and-leaf-spine) defines it):

1. 128 servers × 8 GPUs = 1,024 NICs, 128 per rail.
2. 128 NICs per rail ÷ 64 ports = 2 leaves per rail; 8 rails × 2 = 16 leaves.
3. 16 leaves × 64 uplinks = 1,024 uplinks; ÷ 128 ports per spine = 8 spines (`ai-spine1.sjc` to `ai-spine8.sjc`).
4. Each leaf has 64 uplinks for 8 spines: 8 parallel 400 Gb/s links to each.

The spines still matter. `srv001` and `srv065` are both on rail 1 but on different leaves, so their GPU1s talk through a spine. A job confined to `srv001` to `srv064` (512 GPUs) can keep all of its rail traffic one switch deep; a job across both halves cannot.

### PXN: cross-rail traffic over NVLink first

Some traffic is not rail-aligned. In an all-to-all, the collective behind mixture-of-experts layers ([parallelism](/learn/fabric-networking/ai-fabrics/parallelism-tp-pp-dp)), GPU7 on `srv001` must send to GPU8 on `srv002`. Sent from GPU7's own NIC, the data climbs `rail7-leaf1`, crosses a spine and descends `rail8-leaf1`: three switches and an ECMP choice where it can collide with other flows.

NCCL's **PXN** (PCIe × NVLink, NCCL 2.12 and later) avoids this: GPU7 copies the data over NVLink to GPU8 in its own server, and GPU8's NIC sends it on rail 8, one switch again. The detour is cheap (NVLink gives about 450 GB/s each way, a 400 Gb/s NIC 50 GB/s), and it lets NCCL merge messages from several local GPUs into fewer, larger transfers.

### Rail-optimised versus top-of-rack

| Axis | Top-of-rack (all 8 NICs of a server to one leaf) | Rail-optimised (NIC k to rail k) | Rail-only (no spines; cross-rail only via NVLink) |
|---|---|---|---|
| Same-numbered GPUs, two servers in the group | 1 switch if both servers share the leaf, else 3 | 1 switch for up to 64 servers (512 GPUs) | 1 switch |
| Cross-rail traffic | Same as any other | 3 switches, or 1 with PXN | Only by PXN; no network path |
| A leaf fails | A few whole servers lose all bandwidth | Every server in the group loses one NIC of eight | Same as rail-optimised |
| Cabling | Short copper cables inside the rack | Long runs from every rack to the rail leaves: optics, harder to cable correctly | As rail-optimised |
| Fits | General compute; small GPU clusters | Most large GPU back ends since about 2020 | A 2023 research proposal for large-model training; cheaper, less flexible |

- **Solves:** most inter-server traffic crosses one switch, avoiding the spines and their hash collisions.
- **Breaks:** miscabling. NIC 3 cabled into a rail 4 leaf links up, and where addresses follow the leaf port it routes too: its traffic now crosses the spines and contends with rail 4.
- **Signal:** LLDP (the link-layer discovery protocol, by which each end of a cable announces its name and port) neighbours compared with the cabling plan, per NIC ([optics, cabling and the physical layer](/learn/fabric-networking/fabric-architecture/optics-cabling-and-the-physical-layer)).

## Scaling to tens of thousands of GPUs

Meridian's 1,024 GPUs fit easily in two tiers. The frontier clusters of 2024 and 2025 run 16,000 to 100,000 GPUs or more, and their fabric size is set by one number, the switch radix (ports per switch at a given speed). [Clos and leaf-spine](/learn/fabric-networking/fabric-architecture/clos-and-leaf-spine) derives the limits: from identical non-blocking switches of radix k, two tiers give k²/2 ports and three tiers (a fat-tree) k³/4. At radix 128 that is 8,192 GPUs in two tiers and 524,288 in three. At radix 64 (25.6 Tb/s switches, or 51.2 Tb/s run as 64 × 800 Gb/s) it is 2,048 and 65,536.

The code sizes a rail-optimised, non-blocking back end from that rule, putting rails inside each pod (a pod is a two-tier block whose spines also connect upward to a third tier of super-spines).

```python
from math import ceil


def size_back_end(gpus, radix=128, gpus_per_server=8):
    """Rail-optimised, non-blocking (1:1) back end from identical switches of `radix` ports."""
    half = radix // 2                        # every switch below the top: half down, half up
    servers = ceil(gpus / gpus_per_server)
    leaves_per_rail = ceil(servers / half)   # each rail leaf takes NIC k of `half` servers
    leaves = gpus_per_server * leaves_per_rail
    if leaves <= radix:                      # two tiers: one spine port per leaf uplink
        spines = ceil(leaves * half / radix)
        tiers, supers, pods = 2, 0, 1
        fabric_links = leaves * half
    else:                                    # three tiers: pods of `half` leaves and `half` spines
        pods = ceil(leaves / half)
        spines = pods * half
        supers = ceil(spines * half / radix)
        tiers = 3
        fabric_links = leaves * half + spines * half
    if pods > radix:
        raise ValueError("needs a fourth tier or a bigger switch")
    links = gpus + fabric_links              # NIC-to-leaf links plus switch-to-switch links
    return {"gpus": gpus, "tiers": tiers, "pods": pods, "leaves": leaves,
            "spines": spines, "super-spines": supers,
            "switches": leaves + spines + supers, "links": links, "optics": 2 * links,
            "worst-case switch hops": 2 * tiers - 1}   # leaf up to the top tier and back down


print(f"two-tier ceiling at radix 128: {128 * 128 // 2:,} GPUs; three-tier: {128 ** 3 // 4:,}")
for n in (1_024, 8_192, 32_768, 131_072):
    s = size_back_end(n)
    print(", ".join(f"{k} {v:,}" for k, v in s.items()))
```

```text
two-tier ceiling at radix 128: 8,192 GPUs; three-tier: 524,288
gpus 1,024, tiers 2, pods 1, leaves 16, spines 8, super-spines 0, switches 24, links 2,048, optics 4,096, worst-case switch hops 3
gpus 8,192, tiers 2, pods 1, leaves 128, spines 64, super-spines 0, switches 192, links 16,384, optics 32,768, worst-case switch hops 3
gpus 32,768, tiers 3, pods 8, leaves 512, spines 512, super-spines 256, switches 1,280, links 98,304, optics 196,608, worst-case switch hops 5
gpus 131,072, tiers 3, pods 32, leaves 2,048, spines 2,048, super-spines 1,024, switches 5,120, links 393,216, optics 786,432, worst-case switch hops 5
```

`leaves_per_rail` is where rails enter: each rail needs enough leaves to take NIC k of every server. `if leaves <= radix` is the two-tier ceiling, because a spine needs a port for every leaf. A three-tier pod is 64 leaves (8 rails × 8) and 64 spines, 4,096 GPUs. The optics count assumes one 400 Gb/s transceiver at each end of every link; twin-port 800 Gb/s modules halve the module count, not the number of lasers that can fail.

### What grows with the cluster

- **Optics, faster than switches.** 32,768 GPUs need about 200,000 transceivers in this model. At an annualised failure rate of a fraction of a percent each (it depends on the module, its temperature and its generation), one fails every day or two.
- **Hops.** Cross-pod traffic crosses five switches instead of three. At roughly a microsecond or less per switch with empty queues (it depends on the chip and packet size), that matters mainly for latency-bound collectives with many steps.
- **Placement.** Real designs often oversubscribe the top tier (2:1 or more between pods) and rely on a topology-aware scheduler to keep each job in few pods. NVIDIA's DGX SuperPOD reference architecture builds from rail-optimised scalable units of 32 eight-GPU servers (256 GPUs).
- **Collective algorithms.** A ring's latency grows with the rank count, so at scale NCCL uses trees and, on InfiniBand, in-network reduction (SHARP), where switches sum the data ([collectives and NCCL](/learn/fabric-networking/ai-fabrics/collectives-and-nccl)).

Published clusters show the shape: Meta's two 24,576-GPU clusters of 2024 (one RoCE, one InfiniBand, 400 Gb/s per GPU), whose RoCE paper at SIGCOMM 2024 describes two-tier "AI zones" joined by an oversubscribed aggregation layer, and xAI's 100,000-GPU Colossus (2024) on Spectrum-X Ethernet.

## Beyond ECMP: adaptive routing and packet spraying

Rails make most traffic one switch deep, but the traffic that crosses spines is still hashed. ECMP (equal-cost multipath) pins each flow to one uplink by hashing its 5-tuple (addresses, protocol, ports), as in [ECMP and hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing). An RDMA connection is one queue pair (QP, the NIC's endpoint for one reliable connection, defined in [RDMA from zero](/learn/fabric-networking/ai-fabrics/rdma-from-zero)) and so one fixed 5-tuple: the destination port is always 4791 and the NIC derives the UDP source port from the QP. A ring collective gives each NIC only a handful of such flows (an all-to-all, one per peer), each at line rate: few, huge, synchronised flows, the worst case for hashing.

Three tempting fixes fall short. **More queue pairs per connection** (`NCCL_IB_QPS_PER_CONNECTION`) improves the odds, but the hash still knows nothing about load. **Flowlet switching** (moving a flow only after a pause, traced in [ECMP and hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing)) needs gaps, and a line-rate RDMA WRITE leaves almost none. **Central traffic engineering** reacts in milliseconds or more, as long as the transfers it tries to place.

### Per-packet adaptive routing, traced

**Adaptive routing** (AR) changes the unit of balancing from the flow to the packet: for each packet the leaf picks whichever eligible uplink has the least data queued at that instant. InfiniBand switches have done this for years; NVIDIA's Spectrum-X brings it to Ethernet (Spectrum-4 switches plus SuperNICs, below). Spreading one flow's packets across all paths is also called **packet spraying**.

A small example on rail 1: `rail1-leaf1.sjc` and `rail1-leaf2.sjc` joined by four spines with one 400 Gb/s uplink each (the real fabric has eight links to each of eight spines). The GPU1 NICs of `srv001` to `srv004` each send to a partner on `srv065` to `srv068` at full rate: 1,600 Gb/s offered to exactly 1,600 Gb/s of uplinks.

```viz
{"type": "fabric", "scenario": "adaptive-routing", "title": "Four RoCE flows: static ECMP puts two on ai-spine2 while ai-spine1 idles; per-packet adaptive routing fills all four uplinks, and the receiver NIC decides what reordering costs", "caption": "rail1-leaf1 to rail1-leaf2 over four spines, one 400G uplink each. The hash table pins flows A and C to ai-spine2, so they get 200 Gb/s each and the leaf delivers 1,200 of 1,600 Gb/s. Per-packet adaptive routing sends flow A's PSNs 1001 to 1004 over four spines and every flow reaches 400 Gb/s, but they arrive as 1001, 1003, 1002, 1004: a plain RoCE NIC NAKs and goes back, a SuperNIC places each packet in memory and completes when all have arrived. Last-hop incast remains congestion control's job."}
```

1. **Hash.** The hash of flows A to D, modulo 4, gives 1, 2, 1, 3: A and C both go to `ai-spine2.sjc`; `ai-spine1.sjc` gets nothing.
2. **Collision.** A and C share one 400 Gb/s uplink at 200 Gb/s each; the leaf delivers 1,200 of 1,600 Gb/s, and since a collective waits for its slowest transfer, communication runs at half speed. All four flows land on different spines only 4!/4⁴ ≈ 9% of the time.
3. **Spray.** With AR on, flow A's next four packets, PSN (packet sequence number) 1001 to 1004, leave on four different spines. Every uplink carries 400 Gb/s; every flow gets its full rate.
4. **Reorder.** The paths' queues differ (0.3 to 0.7 µs in the code below), so the packets reach `srv065`'s NIC as 1001, 1003, 1002, 1004.

### The receiver's half

RoCE's reliable connection expects packets in strict PSN order. A standard RoCE NIC that expects 1002 and receives 1003 treats it as loss: it discards 1003, increments its out-of-sequence counter and sends a NAK (negative acknowledgement), and the sender goes back to 1002 and resends everything from there (go-back-N, traced in [RDMA from zero](/learn/fabric-networking/ai-fabrics/rdma-from-zero)). Spraying at such a NIC turns every reordering into retransmission, which is why plain RoCE fabrics keep per-flow ECMP.

A receiver built for spraying places each packet directly: an RDMA WRITE targets a known remote address, so packet 1003's payload belongs at the message's start address plus 2 × 4,096 bytes. The NIC writes it there on arrival, tracks which PSNs have arrived, and reports completion when all have. Reordering then costs nothing. The code measures both receivers on a 1 MB write (256 packets of 4 KB) sprayed in rotation over four spines, as an adaptive router does when all four are equally loaded.

```python
import random
from collections import Counter


def ecmp_step_slowdown(flows, uplinks, trials=20_000, seed=7):
    """Each flow is pinned to a random uplink; a collective finishes when the busiest uplink does."""
    rng = random.Random(seed)
    worst, clean = 0.0, 0
    for _ in range(trials):
        load = Counter(rng.randrange(uplinks) for _ in range(flows))
        busiest = max(load.values())         # flows sharing the most loaded uplink
        worst += busiest
        clean += busiest == 1
    return clean / trials, worst / trials    # P(no collision), mean step-time multiplier


def spray_step_slowdown(flows, uplinks):
    return 1.0, max(1.0, flows / uplinks)    # per-packet: the load is spread evenly


def arrivals(n_packets, delays_us, gap_us):
    """Packet i leaves at i * gap on spine i % len(delays); returns PSN offsets in arrival order."""
    t = [(i * gap_us + delays_us[i % len(delays_us)], i) for i in range(n_packets)]
    return [i for _, i in sorted(t)]


def go_back_n(n_packets, delays_us, gap_us):
    """Plain RC receiver: accept only the expected PSN; the sender resends from the hole."""
    base, sent, rounds = 0, 0, 0
    while base < n_packets:
        rounds += 1
        order = [base + i for i in arrivals(n_packets - base, delays_us, gap_us)]
        sent += len(order)
        expected = base
        for psn in order:
            if psn == expected:              # in order: place it
                expected += 1                # anything else: discard, NAK the hole
        base = expected
    return sent, rounds


def direct_placement(n_packets, delays_us, gap_us):
    """Reorder-tolerant receiver: place every packet at its offset, complete when all are in."""
    seen = set(arrivals(n_packets, delays_us, gap_us))
    return n_packets, 1 if len(seen) == n_packets else None


for flows, uplinks in [(4, 4), (8, 8), (64, 64)]:
    p, slow = ecmp_step_slowdown(flows, uplinks)
    print(f"{flows:>2} flows on {uplinks:>2} uplinks: ECMP no-collision {p:6.1%}, "
          f"mean step x{slow:.2f}; spraying x{spray_step_slowdown(flows, uplinks)[1]:.2f}")

DELAYS = [0.4, 0.7, 0.3, 0.6]            # queueing via ai-spine1..4, microseconds
GAP = 4096 * 8 / 400e3                   # one 4 KB packet at 400 Gb/s = 0.082 us
print("first eight arrivals:", [1001 + i for i in arrivals(256, DELAYS, GAP)[:8]])
for name, fn in [("go-back-N NIC", go_back_n), ("direct placement", direct_placement)]:
    sent, rounds = fn(256, DELAYS, GAP)
    print(f"1 MB write, 256 packets sprayed: {name:<16} sent {sent:>5} packets in {rounds} round(s)")
```

```text
 4 flows on  4 uplinks: ECMP no-collision   9.7%, mean step x2.12; spraying x1.00
 8 flows on  8 uplinks: ECMP no-collision   0.3%, mean step x2.60; spraying x1.00
64 flows on 64 uplinks: ECMP no-collision   0.0%, mean step x3.96; spraying x1.00
first eight arrivals: [1001, 1003, 1005, 1002, 1007, 1004, 1009, 1006]
1 MB write, 256 packets sprayed: go-back-N NIC    sent 16512 packets in 128 round(s)
1 MB write, 256 packets sprayed: direct placement sent   256 packets in 1 round(s)
```

Read the first block as a step-time multiplier: with 64 line-rate flows on 64 uplinks the busiest uplink carries about four, so communication takes four times as long as the capacity allows (9.7% simulated against 9.4% exact is sampling error). In the second, the go-back-N NIC accepts two packets per round: 1003 overtakes 1002 through the 0.3 µs spine and is discarded, so once 1002 is in, every packet still in flight is out of order, and the megabyte crosses the fabric 64 times. Real senders resend as soon as the NAK arrives, so the collapse is less tidy, but the direction holds: adaptive routing without a reorder-tolerant receiver is worse than ECMP.

One detail makes direct placement a NIC feature rather than a setting. In a standard RoCE WRITE only the first packet carries the remote address (in the RDMA extended transport header, RETH); later packets carry only the base transport header with its PSN. A NIC that receives packet 1003 before 1001 must know the destination some other way, from per-message state or from vendor extensions that carry it in every packet. The Ultra Ethernet Consortium's transport, published as a 1.0 specification in 2025, designs for spraying from the start ([InfiniBand and RoCE](/learn/fabric-networking/ai-fabrics/infiniband-and-roce)).

### What adaptive routing cannot fix

AR balances the paths *between* leaves. It cannot route around the last link: if `srv001` and `srv002` both write to `srv065`, every path ends on `srv065`'s one 400 Gb/s port, and that incast remains congestion control's job ([lossless Ethernet](/learn/fabric-networking/ai-fabrics/lossless-ethernet-pfc-ecn-dcqcn)). And it is only as good as its congestion signal: deciding on its local egress queues, a leaf cannot see that a far spine-to-leaf link is congested. InfiniBand and Spectrum-X both carry congestion information between switches and to the NIC; vendors keep the details close.

| Method | Unit balanced | Reordering | Reacts to load | Needs from the NIC | Where used |
|---|---|---|---|---|---|
| Static ECMP | Flow (5-tuple) | None | No | Nothing | Every IP fabric; most RoCE back ends |
| ECMP + more QPs | Sub-flow | None | No | Multiple QPs per connection | NCCL tuning; Meta's RoCE clusters |
| Flowlet / dynamic load balancing | Burst after a gap | None if the gap exceeds the delay skew | Yes, per burst | Nothing | Merchant switch chips; TCP-heavy fabrics |
| Per-packet adaptive routing | Packet | Routine | Yes, per packet | Out-of-order placement | InfiniBand; Spectrum-X |
| Spraying with a multipath transport | Packet, sender-chosen paths | Routine | Yes, sender and switch | A transport designed for it | Ultra Ethernet |

NVIDIA's own figure, from its 2024 Colossus announcement, is about 95% of available throughput with Spectrum-X against about 60% for standard Ethernet at that scale: a vendor claim that depends on workload and baseline, but consistent in direction with the arithmetic above.

- **Solves:** hash collisions between leaves; every uplink carries its share whatever the flows' 5-tuples.
- **Breaks:** at a receiver that needs order (go-back-N storms), and quietly when the leaf's congestion signal is local and the hot link is further down the path.
- **Signal:** the spread between the most and least loaded uplinks (near zero with AR on), receiver out-of-sequence and NAK counters, sender retransmissions.

## SuperNICs and DPUs

An RDMA NIC such as ConnectX-7 already runs the whole reliable transport in hardware. Two newer device classes sit on either side of it, and interviewers ask for the difference.

| | RDMA NIC (ConnectX-7 class) | SuperNIC (BlueField-3 SuperNIC, ConnectX-8 SuperNIC) | DPU (BlueField-3 DPU) |
|---|---|---|---|
| Purpose | Fast host networking and RDMA | East-west GPU traffic on the back end | Infrastructure offload on the front end |
| Port speed | Up to 400 Gb/s | 400 Gb/s (BlueField-3), 800 Gb/s (ConnectX-8) | Up to 400 Gb/s |
| Key features | RoCE transport, DCQCN | Out-of-order placement for sprayed packets, programmable congestion control, telemetry for the switch-NIC loop | General-purpose Arm cores (16 on BlueField-3) with their own memory and OS; virtual switching, storage emulation, encryption, firewalling |
| Runs its own OS | No | Minimal | Yes, a full Linux the host cannot touch |
| In Meridian `sjc` | The eight back-end NICs today | What a Spectrum-X back end would need | One per server, on the front end |

The **DPU** (data processing unit) is a computer on a card. It presents an ordinary network device to the host over PCIe while running the virtual switch, storage protocol and security policy on its own cores, so a tenant with root on the host cannot change network policy and the host's CPUs are spared (the idea behind AWS Nitro, Intel's IPU and AMD Pensando). A container on `srv001` opening a connection through the front end shows how:

1. The host's driver hands the first packet to a virtual function, a slice of the DPU's PCIe device; to the host it is a NIC.
2. The DPU's embedded switch looks the packet's 5-tuple up in its hardware flow table and misses: the flow is new.
3. The miss goes to the virtual switch (Open vSwitch, for example) on the Arm cores, which applies the tenant's policy (allowed or not, which VRF and VNI) and installs an exact-match rule in hardware: permit, add the VXLAN header for the front-end EVPN fabric ([VXLAN encapsulation](/learn/fabric-networking/overlays-vxlan-evpn/vxlan-encapsulation)), count.
4. Every later packet of the flow matches that rule and leaves at line rate; the Arm cores never see it again.

**SuperNIC** is NVIDIA's name, not a standard, for a NIC slimmed to the back end's job: line-rate RDMA plus the receiver half of adaptive routing (out-of-order placement) and a congestion-control loop with the switch, at lower power than a DPU. In Spectrum-X the switch sprays and supplies congestion telemetry, and the SuperNIC reorders, places and sets its sending rate from that telemetry rather than from ECN marks alone; NVIDIA publishes the shape of that loop, not its details.

- **Solves:** the DPU isolates and offloads the front end; the SuperNIC makes spraying safe on the back end.
- **Breaks:** the DPU is a second computer with its own firmware, OS and boot order: if its OS hangs or a firmware update fails, the host loses its front-end network while looking healthy. And when the hardware flow table fills, or a flow uses a feature the hardware cannot offload, step 4 never happens: packets stay on the Arm cores and throughput falls from hundreds of Gb/s to a small fraction of it.
- **Signal:** the DPU monitored as its own device (heartbeat, firmware version, Arm CPU load), plus its offload ratio and flow-table occupancy.

## When one link stalls the whole job

A job of 768 GPUs runs on `srv001` to `srv096`. At 03:00 the optic on `srv100`'s NIC 5 dies; that job is unaffected. At 03:10 the optic on `srv037`'s NIC 2 dies.

### A hard failure, traced

1. **t = 0.** The port on `rail2-leaf1.sjc` towards `srv037` loses signal and goes down within milliseconds (plus any configured debounce); the switch's other 127 ports carry on.
2. **t = 0 to ~30 s.** Every QP to or from `srv037`'s `mlx5_1` stops receiving acknowledgements. Each sender retransmits after the transport timeout, 4.096 µs × 2^`NCCL_IB_TIMEOUT`: at 20, about 4.3 s (the default has varied between NCCL versions, 18 to 20 recently). After 7 retries (`NCCL_IB_RETRY_CNT`), about 30 s, the QP fails with "transport retry counter exceeded". NCCL may react to the port-down event sooner.
3. **NCCL reports an error and the rank aborts.** Every other rank is waiting inside the same collective, which can never complete without GPU2 of `srv037`. There is no partial result: a synchronous job is one unit.
4. **The framework tears the job down** (PyTorch's NCCL watchdog, or an orchestration health check that saw the down link first), the scheduler drains `srv037`, and the job restarts from its last checkpoint on a spare server.

Cost, with a checkpoint every 30 minutes: on average 15 minutes of work since the last checkpoint are lost, plus a couple of minutes to detect and around 10 to reschedule and reload. About 27 minutes × 768 GPUs ≈ 346 GPU-hours for one optic.

This is not rare. Meta's Llama 3 paper (2024) reported 419 unexpected interruptions in a 54-day period of pre-training on 16,384 H100 GPUs, about one every three hours; 35 of them (8.4%) were attributed to network switches and cables, behind faulty GPUs, GPU memory and software bugs. At that scale, fast detection and restart matter more than any single component's reliability.

### A gray failure: slow, not dead

Worse than a dead link is a sick one ([optics, cabling and the physical layer](/learn/fabric-networking/fabric-architecture/optics-cabling-and-the-physical-layer)). Suppose `srv037`'s NIC 2 comes back from a flap at 200 Gb/s instead of 400 (an Ethernet port renegotiating a lower speed, or an InfiniBand link training on fewer lanes), or its CRC errors climb until a few percent of packets are retransmitted. Nothing fails, but every ring and tree through that NIC now runs at its speed, and the whole job waits for it each step.

If a step is 1.0 s with 0.3 s of exposed communication and that communication doubles, the step becomes 1.3 s, 23% of the job's time wasted. Over one day unnoticed: 768 GPUs × 24 h × 0.23 ≈ 4,250 GPU-hours, twelve times the cost of the dead optic. A slow link that nobody notices is the most expensive failure in an AI fabric.

### Designing for it

- **Dual-homed NICs.** Split each NIC's 400 Gb/s into two 200 Gb/s ports on two different leaves, so a leaf or optic failure halves a GPU's bandwidth instead of removing it. Alibaba's HPN design (SIGCOMM 2024) does this; the cost is twice the cables and leaf ports at the server edge.
- **Fabric-side healing.** InfiniBand switches reroute around a failed inter-switch link without waiting for the subnet manager; Ethernet drops the ECMP or AR member ([redundancy and failure domains](/learn/fabric-networking/fabric-architecture/redundancy-and-failure-domains)). Neither helps the single NIC-to-leaf link.
- **Job-side recovery.** Frequent asynchronous checkpoints, hot spare servers, and nccl-tests on new or repaired nodes before they rejoin ([tuning and benchmarking RDMA](/learn/fabric-networking/ai-fabrics/tuning-and-benchmarking-rdma)). Newer NCCL releases can shrink a communicator to continue without a failed rank, but most training stacks still restart.

## Under the hood: what the switch and NIC do

In the switch, adaptive routing replaces one pipeline step. The longest-prefix match still returns an ECMP group; instead of `hash mod n`, egress selection compares each member's queue occupancy (plus, where the design has it, congestion state from downstream switches) and picks the least loaded, per packet, at line rate. A port that goes down leaves the eligible set in hardware, far faster than a routing protocol could withdraw it.

In the receiving NIC, a reorder-tolerant QP keeps a bitmap of the PSNs received in a window plus the message context that gives each packet's address, writes each payload by DMA straight into GPU memory (GPUDirect RDMA, in [NVLink and NVSwitch](/learn/fabric-networking/ai-fabrics/scale-up-nvlink-and-nvswitch)), and can acknowledge what has arrived rather than only the in-order prefix. NCCL plays its part: `NCCL_IB_ADAPTIVE_ROUTING` makes it post large transfers as data writes followed by a separate completion notice, so the notice cannot overtake sprayed data. It defaults to on for InfiniBand and off for RoCE in recent releases.

## Failure modes in production

**A swapped cable pair.** *Symptom:* jobs including `srv037` run slightly slower; rails 3 and 4 carry spine traffic that rail-aligned collectives should not need. *Diagnosis:* LLDP shows `srv037` NIC 3 on `rail4-leaf1.sjc` and NIC 4 on `rail3-leaf1.sjc`. *Fix:* swap them, and make the LLDP check part of bring-up.

**ECMP collisions on a RoCE back end.** *Symptom:* nccl-tests bus bandwidth across both halves of a rail swings between runs (say 60% to 90% of the single-leaf figure) with no errors. *Diagnosis:* some leaf uplinks saturated while siblings idle, the pattern changing with each job's QP numbers. *Fix:* more QPs per connection, topology-aware placement that keeps traffic under one leaf, or adaptive routing with reorder-tolerant NICs.

**Adaptive routing turned on without reorder-tolerant NICs.** *Symptom:* uplink load is perfectly even, yet bandwidth collapses and latency rises. *Diagnosis:* NIC out-of-sequence and NAK counters (`out_of_sequence`, `packet_seq_err` in the mlx5 counters) climb on receivers. *Fix:* return to per-flow ECMP until the NICs support placement.

**NCCL on the wrong network.** *Symptom:* a new cluster's jobs run at a small fraction of expected speed, no errors. *Diagnosis:* NCCL's startup log lists the storage NIC, or "NET/Socket" (TCP over the front end) instead of "NET/IB". *Fix:* pin `NCCL_IB_HCA` to the back-end devices and fail the launch if NCCL selects anything else.

## What the platform should show

The job is to join three worlds that each have their own dashboards: jobs and GPUs, hosts and NICs, and switches. Surface:

- **A cabling map as data:** every NIC to its leaf port, checked against LLDP continuously.
- **Blast radius per component:** which jobs and how many GPUs stop if this optic, NIC, leaf or spine fails, so maintenance and alerts carry a cost.
- **Per-job step time against its own baseline,** and per-rank communication time, so the straggler is named within minutes, not after a day.
- **Per-NIC health on the host:** link speed (a 200 Gb/s link in a 400 Gb/s fabric is an alert), FEC-corrected and uncorrected errors, retransmissions, out-of-sequence, NAK and CNP counts.
- **Uplink balance on every leaf:** the spread between the most and least loaded uplinks, which is the direct measure of ECMP collisions.
- **Network selection at launch:** the devices NCCL actually opened, compared with the eight it should have.

The first two items are a few lines over data the platform already holds. With the San Jose cabling rule and three jobs:

```python
def expected_leaf(server, nic, servers_per_leaf=64):
    """Meridian sjc cabling rule: NIC k of srv001-064 to railk-leaf1, of srv065-128 to railk-leaf2."""
    return f"rail{nic}-leaf{(server - 1) // servers_per_leaf + 1}.sjc"


def check_cabling(lldp):
    """lldp: {(server, nic): leaf name the NIC's LLDP neighbour reports}."""
    return [f"srv{s:03d} NIC{k}: cabled to {seen}, plan says {expected_leaf(s, k)}"
            for (s, k), seen in sorted(lldp.items()) if seen != expected_leaf(s, k)]


def blast_radius(failed, jobs, lldp):
    """failed: a leaf name, or (server, nic) for one NIC link. jobs: {job: set of servers}."""
    if isinstance(failed, tuple):
        hit_servers = {failed[0]}
    else:
        hit_servers = {s for (s, k), leaf in lldp.items() if leaf == failed}
    hit_jobs = {j: sorted(srv & hit_servers) for j, srv in jobs.items() if srv & hit_servers}
    gpus = sum(8 * len(jobs[j]) for j in hit_jobs)    # a synchronous job stops as a whole
    return hit_jobs, gpus


lldp = {(s, k): expected_leaf(s, k) for s in range(1, 129) for k in range(1, 9)}
lldp[(37, 3)] = "rail4-leaf1.sjc"                     # a swapped pair of cables
lldp[(37, 4)] = "rail3-leaf1.sjc"
jobs = {"pretrain-a": set(range(1, 97)),              # 768 GPUs
        "finetune-b": set(range(97, 113)),            # 128 GPUs
        "eval-c": set(range(113, 129))}               # 128 GPUs

print("\n".join(check_cabling(lldp)))
for failed in [(100, 5), "rail5-leaf2.sjc", "rail2-leaf1.sjc"]:
    hit, gpus = blast_radius(failed, jobs, lldp)
    summary = ", ".join(f"{j} ({len(s)} of its servers)" for j, s in hit.items())
    print(f"{str(failed):<16} stops {summary}: {gpus:,} GPUs")
```

```text
srv037 NIC3: cabled to rail4-leaf1.sjc, plan says rail3-leaf1.sjc
srv037 NIC4: cabled to rail3-leaf1.sjc, plan says rail4-leaf1.sjc
(100, 5)         stops finetune-b (1 of its servers): 128 GPUs
rail5-leaf2.sjc  stops pretrain-a (32 of its servers), finetune-b (16 of its servers), eval-c (16 of its servers): 1,024 GPUs
rail2-leaf1.sjc  stops pretrain-a (64 of its servers): 768 GPUs
```

The middle line is the rail design's failure domain: one leaf of sixteen fails and every GPU in the cluster stops, because each job has a server on it (`sum(8 * len(jobs[j]))` counts whole jobs, not servers hit). That number belongs on the ticket before anyone drains `rail5-leaf2.sjc` ([safe change and maintenance](/learn/fabric-networking/operating-fabrics/safe-change-and-maintenance)). The engineer needs the failing port; the manager needs "1,024 GPUs idle, back in about 12 minutes, 15 minutes of work lost": the same data, two views.

## Interviewer follow-ups

**"Why cable NIC k of every server to rail k instead of all eight NICs to the rack's switch?"** Model answer: NCCL connects GPU k to GPU k across servers, so with rails nearly every inter-server byte crosses one switch, with no spine or hash; cross-rail traffic goes over NVLink first (PXN). The costs: long optical runs, harder cabling, and one leaf touching every server in its group. Common wrong answer: "for redundancy", when a rail leaf is shared fate for 64 servers.

**"An nccl-tests run across two leaves shows 30% less bus bandwidth than within one leaf, and it varies run to run. What is happening?"** Model answer: hash collisions on the uplinks: a few line-rate QPs per NIC, each pinned by ECMP, and the busiest uplink sets the pace. I would check the per-uplink load spread during the test, then try more QPs per connection, placement under one leaf, or adaptive routing if the NICs place out of order. Common wrong answer: "add spines", which adds capacity the hash still cannot use evenly.

**"Why not spray packets in an ordinary data center too?"** Model answer: the receiver. TCP reads reordering as possible loss (three duplicate acknowledgements trigger fast retransmit; Linux's RACK softens it), and plain RoCE NICs go back N. Flowlet balancing gets most of the benefit for bursty TCP without reordering. Common wrong answer: "switches cannot balance per packet"; they can, the endpoints are the limit.

**"A job's step time rose 25% overnight with no errors. Where do you look?"** Model answer: scope first, this job or all; then the straggler from per-rank communication time; then that rank's NICs: link speed, FEC and CRC counters, retransmits, CNP and pause counts, the leaf port's optics. Rule out the GPU too (thermal throttling looks the same). I would defer to the network team on optic thresholds, but I would build the per-rank view that makes this a five-minute question. Common wrong answer: inspecting the busiest switch, when the cause is usually one slow link.

## What mid-level engineers get wrong

- **Treating the back end as one more VLAN.** Mixing other traffic into a lossless fabric brings PFC pauses into the GPU traffic.
- **Believing adaptive routing is a switch setting.** Without reorder-tolerant NICs it turns reordering into retransmission.
- **Counting failures per device, not per job.** One optic stops 768 GPUs; alerts and maintenance must carry the job cost.
- **Ignoring slow links.** A link at half speed costs more than a dead one, because nothing restarts and nobody is paged.
- **Assuming rails give redundancy.** Each NIC is single-homed; a rail leaf is shared fate for every server in its group.

## Senior signals

- You describe a GPU server as four networks and say why each is separate: loss model, bursts, failure domain, security.
- You derive rails from NCCL's GPU-k-to-GPU-k pattern and size the back end from radix: 16 leaves and 8 spines for 1,024 GPUs at 128 ports, 8,192 GPUs as the two-tier ceiling.
- You pair adaptive routing with the receiver: spraying works only with NICs that place out of order, and it still cannot fix last-hop incast.
- You price failures in GPU-hours per job, including the slow link nobody noticed.
- You build the join between cabling, NIC counters, switch counters and job step time, because each team's dashboard sees only one of them.

## Check yourself

```quiz
- q: >-
    In Meridian's San Jose back end, why is NIC k of every server cabled to the leaf of rail k?
  options: ["It spreads every flow over all eight leaves by per-packet hashing", "NCCL pairs GPU k with GPU k, so most traffic crosses one switch", "It keeps cables short, because rail leaves sit inside each rack", "Each rail is a redundant copy, so a leaf failure is hidden from jobs"]
  answer: 1
  explanation: >-
    NCCL binds each GPU to its nearest NIC and builds rings and trees between same-numbered GPUs, so nearly every inter-server byte stays in one rail and crosses one leaf. Rails are not redundant copies: each NIC is single-homed, so a rail leaf is shared fate for every server in its group. Rail leaves are usually outside the rack, which makes the cabling longer, not shorter.
- q: >-
    A rail leaf, rail5-leaf2.sjc, fails. srv065 to srv128 are spread across three running jobs. What happens?
  options: ["Adaptive routing moves the traffic to rail5-leaf1, and nothing stops", "All three jobs stop, since each lost a NIC it needs for its collectives", "Only the GPU5s of srv065 to srv128 slow down, and the jobs continue", "Only the job with the most servers on that leaf stops and restarts"]
  answer: 1
  explanation: >-
    Every server on that leaf loses NIC 5, and a synchronous collective cannot finish without every rank, so each job with any server there fails and restarts from a checkpoint. Adaptive routing balances paths between leaves; it cannot replace the single link from a NIC to its leaf. Jobs do not degrade gracefully by default.
- q: >-
    A RoCE back end turns on per-packet adaptive routing. Uplink load becomes perfectly even, but NCCL bandwidth falls sharply and NIC out-of-sequence counters climb. What is the most likely cause?
  options: ["The ECMP hash seed changed, so the flows polarise across tiers", "The spines lack buffer for sprayed packets and drop them under load", "The NICs need in-order packets and go back N on every reordering", "PFC is pausing the uplinks because adaptive routing raised load"]
  answer: 2
  explanation: >-
    Spraying delivers packets out of order by design. A NIC without out-of-order placement treats each early packet as loss, discards it, sends a NAK and makes the sender resend from the hole, so even load turns into retransmission. Rising out-of-sequence counters are that signature. Polarisation and a hash seed do not apply once forwarding is per packet.
- q: >-
    With identical 128-port non-blocking switches, what is the largest rail-optimised back end that fits in two tiers?
  options: ["4,096 GPUs, one pod of 64 leaves", "8,192 GPUs, radix squared over two", "16,384 GPUs, the radix squared", "1,024 GPUs, one leaf per rail"]
  answer: 1
  explanation: >-
    Each leaf uses 64 ports down and 64 up, and each spine has 128 ports, one per leaf, so there can be 128 leaves of 64 GPUs: 128 × 64 = 8,192, which is k²/2. The radix squared counts both halves of every leaf's ports as GPU ports. 4,096 is the size of one pod in the three-tier design, and 1,024 is Meridian's current cluster.
- q: >-
    After a new kind of firewall rule is deployed, one tenant's front-end traffic through srv001's DPU falls from 180 Gb/s to a few Gb/s. The host's CPUs and NIC look healthy. What is the most likely cause?
  options: ["The front-end leaves' ECMP hash now polarises the tenant's flows", "The new rule cannot be offloaded, so packets stay on the Arm cores", "Back-end PFC pauses are spreading into the front-end ports", "The SuperNIC reorders the tenant's packets and the host NAKs them"]
  answer: 1
  explanation: >-
    A DPU forwards a flow at line rate only after the virtual switch on its Arm cores installs a hardware rule for it. A policy the embedded switch cannot express keeps every packet on the Arm cores, a small fraction of line rate, while the host sees an ordinary, healthy NIC. PFC cannot reach the front end, which is a separate network; a hash problem would hurt some flows of every tenant, not all of one; and SuperNICs sit on the back end, while front-end traffic is TCP.
- q: >-
    A 768-GPU job's step time rises from 1.0 s to 1.3 s because one NIC link renegotiated to 200 Gb/s. Nothing alerts for a day. Compared with that link failing outright, which costs about 350 GPU-hours, what does the slow link cost?
  options: ["More, about 4,000 GPU-hours of wasted time", "Nothing, because the job still completes correctly", "Less, about 100 GPU-hours, since the job never restarted", "About the same, roughly 350 GPU-hours"]
  answer: 0
  explanation: >-
    At 1.3 s per step, 0.3/1.3 ≈ 23% of every GPU-hour is waiting on the slow link: 768 × 24 h × 0.23 ≈ 4,250 GPU-hours in a day. A hard failure loses the work since the last checkpoint plus the restart, a few hundred GPU-hours, and is noticed at once. Avoiding a restart does not make the slow link cheap; it makes it invisible.
```
