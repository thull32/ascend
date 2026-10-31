---
slug: convergence-and-scale
title: "Convergence and scale: path hunting, PIC, graceful restart and BMP"
description: Why a BGP withdrawal takes minutes when an announcement takes seconds (path hunting and MRAI traced round by round), how BGP PIC and ADD-PATH turn a minute of failover into one FIB write, what graceful restart and long-lived graceful restart keep and when that is a black hole, how route flap dampening backfires, where RIB and FIB scale runs out, and how BMP lets you measure all of it.
minutes: 45
difficulty: hard
tags: [fabric-networking, bgp, convergence, path-hunting, mrai, bgp-pic, add-path, graceful-restart, llgr, route-flap-dampening, fib-scale, bmp, monitoring]
problems: []
---
An announcement crosses the internet in seconds: the first copy of a new route to reach a router is real, so every router accepts it, passes it on, and is done. A withdrawal can take minutes. A router that loses a route still holds other paths to the prefix heard earlier and cannot know they are dead too, so it switches to one, tells its neighbours, and waits to be proven wrong, while traffic follows paths that lead nowhere or in circles. At full-table scale, about a million IPv4 prefixes, one failed upstream can also mean a minute of lost traffic while routers rewrite their forwarding tables prefix by prefix.

Both problems play out here on Meridian's internet edge: AS 64500 with gateways `gw1.ams` and `gw2.ams`, ISP1 (AS 64501), ISP2 (AS 64502), a transit provider (AS 64496) and a content network (AS 64511). These AS numbers and the prefixes `192.0.2.0/24` and `198.51.100.0/24` come from ranges reserved for documentation (RFC 5398, RFC 5737). The fabric versions of the same mechanisms are in [BGP as the underlay](/learn/fabric-networking/underlay/bgp-as-the-underlay) and [convergence and BFD](/learn/fabric-networking/underlay/convergence-and-bfd).

## Path hunting: why bad news travels slowly

Recall from [UPDATEs, attributes and RIBs](/learn/fabric-networking/bgp-fundamentals/updates-attributes-and-ribs) that a router keeps every path each neighbour sent in that neighbour's **Adj-RIB-In**, picks one best path per prefix, and advertises only that best path. A **withdrawal** is an UPDATE saying a prefix is no longer reachable through the sender. When the best path is withdrawn, the router reruns the decision over what is left. After the origin itself withdraws, every leftover is stale: a route through somebody else that ultimately ran through the origin.

**Path hunting** (or path exploration) follows. Each router falls back to a stale path, advertises it, receives its neighbours' equally stale fallbacks, discards those that now contain its own AS number (the [AS_PATH loop check](/learn/fabric-networking/bgp-fundamentals/ibgp-loops-and-next-hops)), tries a longer one, and withdraws only when nothing is left. Every step is a real UPDATE.

Trace the smallest case that hunts. AS 64496, ISP1 and ISP2 each connect to AS 64511, which originates `192.0.2.0/24`, and peer with each other, passing every route on. Meridian, ISP1's customer, watches what ISP1 tells it. The model is synchronous: in each round every network picks the shortest loop-free path (ties to the lowest neighbour AS number, a stand-in for the real tie-breakers) and tells its two neighbours if its choice changed. Each round after the first waits one 30 s MRAI (minimum route advertisement interval, next section), withdrawals included.

| Round | AS 64496 best | ISP1 (64501) best | ISP2 (64502) best | Messages | Meridian sees |
|---|---|---|---|---|---|
| Before | 64496 64511 | 64501 64511 | 64502 64511 | 0 | 64501 64511 |
| 1 (t = 0) | 64496 64501 64511 | 64501 64496 64511 | 64502 64496 64511 | 3 withdrawals + 6 | 64501 64496 64511 |
| 2 (t = 30 s) | none | 64501 64502 64496 64511 | 64502 64496 64501 64511 | 6 | 64501 64502 64496 64511 |
| 3 (t = 60 s) | none | none | none | 4 | withdrawn |

Round 1: each network takes a reserve. ISP1's are `64496 64511` and `64502 64511`, equal length, so it takes AS 64496's, and AS 64496 takes ISP1's. ISP1 now forwards `192.0.2.0/24` to AS 64496, which forwards it back: a transient loop that burns capacity on a shared link until each packet's TTL (time to live, the hop counter) runs out. Round 2: the round-1 copies arrive with the receiver's own AS inside, so ISP1 discards `64496 64501 64511` and moves to ISP2's longer `64502 64496 64511`; AS 64496 rejects both its copies and has nothing. Round 3: the rest come back looped or withdrawn. Meridian was shown paths of two, three and four ASes for a prefix gone since t = 0.

```viz
{"type": "fabric", "scenario": "path-hunting", "title": "One withdrawal, three transit networks: ISP1 shows Meridian a three-AS, then a four-AS path before the route is gone", "caption": "AS 64511 withdraws 192.0.2.0/24 from AS 64496, ISP1 and ISP2, which are fully meshed (Meridian's ISP2 session is left out). Each falls back to a stale path through a neighbour, ISP1 and AS 64496 briefly forwarding to each other, then finds the next round's copies contain its own AS. At one round per 30-second MRAI interval, Meridian sees AS_PATH 64501 64496 64511, then 64501 64502 64496 64511, then a withdrawal after about 60 s: 19 messages for one prefix. The last frame lists the levers: MRAI, a shared spine AS, PIC and ADD-PATH."}
```

The code reproduces the table and then grows the mesh.

```python
def simulate_hunt(clique, origin, max_rounds=40):
    """Path hunting after `origin` withdraws its prefix. Every AS in `clique`
    peers with every other and with the origin. Synchronous rounds: each AS
    processes what arrived last round, picks the shortest loop-free path
    (tie: lowest neighbour ASN) and tells every clique neighbour if its best
    changed. Returns one record per round."""
    def choose(asn, rib_in):
        usable = [(len(p), via, p) for via, p in rib_in.items()
                  if p is not None and asn not in p]       # the AS_PATH loop check
        return [asn] + min(usable)[2] if usable else None

    # Steady state: the direct path, plus one through each neighbour.
    rib_in = {a: {origin: [origin], **{n: [n, origin] for n in clique if n != a}}
              for a in clique}
    for a in clique:
        rib_in[a][origin] = None                       # round 1: the withdrawal lands
    prev = {a: [a, origin] for a in clique}
    rounds = []
    for _ in range(max_rounds):
        best = {a: choose(a, rib_in[a]) for a in clique}
        changed = [a for a in clique if best[a] != prev[a]]
        if not changed:
            break
        rounds.append({"best": best, "sent": len(changed) * (len(clique) - 1)})
        for a in changed:                              # one UPDATE or WITHDRAW per neighbour
            for n in clique:
                if n != a:
                    rib_in[n][a] = best[a]
        prev = best
    return rounds


rounds = simulate_hunt([64496, 64501, 64502], origin=64511)
for i, r in enumerate(rounds, 1):
    view = "  ".join(f"{a}: {' '.join(map(str, p)) if p else 'none':<24}" for a, p in r["best"].items())
    print(f"round {i} (t={30 * (i - 1):>3} s)  sent {r['sent']}  {view}")

print()
for n in range(3, 8):
    clique = list(range(64601, 64601 + n))
    rs = simulate_hunt(clique, origin=64511)
    msgs = n + sum(r["sent"] for r in rs)
    longest = max(len(p) for r in rs for p in r["best"].values() if p)
    print(f"{n} networks: {len(rs)} rounds, {msgs:>4} messages, longest path {longest} ASes, "
          f"MRAI 30 s -> {30 * (len(rs) - 1):>3} s, MRAI 0 at 5 ms a round -> {5 * len(rs)} ms")
```

```text
round 1 (t=  0 s)  sent 6  64496: 64496 64501 64511         64501: 64501 64496 64511         64502: 64502 64496 64511       
round 2 (t= 30 s)  sent 6  64496: none                      64501: 64501 64502 64496 64511   64502: 64502 64496 64501 64511 
round 3 (t= 60 s)  sent 4  64496: none                      64501: none                      64502: none                    

3 networks: 3 rounds,   19 messages, longest path 4 ASes, MRAI 30 s ->  60 s, MRAI 0 at 5 ms a round -> 15 ms
4 networks: 4 rounds,   43 messages, longest path 5 ASes, MRAI 30 s ->  90 s, MRAI 0 at 5 ms a round -> 20 ms
5 networks: 5 rounds,   81 messages, longest path 6 ASes, MRAI 30 s -> 120 s, MRAI 0 at 5 ms a round -> 25 ms
6 networks: 6 rounds,  136 messages, longest path 7 ASes, MRAI 30 s -> 150 s, MRAI 0 at 5 ms a round -> 30 ms
7 networks: 7 rounds,  211 messages, longest path 8 ASes, MRAI 30 s -> 180 s, MRAI 0 at 5 ms a round -> 35 ms
```

Two lines carry the mechanism. `asn not in p` is the only thing that kills a stale path: nothing in BGP says "this path is dead", a router finds out when its own AS comes back. `rib_in[n][a] = best[a]` is implicit replacement: a neighbour's new advertisement overwrites its old one. With n networks the hunt takes n rounds, paths grow to n + 1 ASes, and messages grow roughly with n cubed. Lockstep is the kind case: Labovitz and colleagues showed in 2000 that with unsynchronised timing a full mesh can, in the worst case, explore factorially many paths, and measured real internet withdrawals taking about three minutes on average, some up to fifteen.

In a fabric where every spine has its own AS, stale paths climb back through another spine; one shared spine AS makes them fail the loop check at once ([BGP as the underlay](/learn/fabric-networking/underlay/bgp-as-the-underlay)).

**What it solves:** nothing; path hunting is the cost of a protocol that carries no topology, only paths, and must disprove each one. **How it breaks:** convergence time grows with the number of alternative paths, transient loops form, and one withdrawal generates dozens of UPDATEs that dampening (below) misreads as instability. **Signal:** for one prefix, a run of UPDATEs with steadily longer AS_PATHs ending in a withdrawal.

## MRAI: pacing the hunt

The **MRAI** (minimum route advertisement interval) is the minimum time between two advertisements of the same prefix to the same peer. RFC 4271 suggests 30 s for eBGP and 5 s for iBGP, with jitter (a random factor of 0.75 to 1.0) so routers do not synchronise. It is a rate limit with collapse: a change that arrives while the timer runs waits, and when the timer fires the router sends the *current* best path, so if ISP1 changes its mind three times in one interval, Meridian hears only the last.

In the hunt above each round is one MRAI interval, so at 30 s three networks take 60 s and seven take 180 s. At MRAI 0 a round costs only processing time (the code's 5 ms is an assumption that depends on CPU and table size), so the lockstep hunt takes milliseconds. Real routers are not in lockstep: each reacts to every message as it arrives, advertising many more transient paths. Griffin and Premore's 2001 simulations found convergence time against MRAI V-shaped: above some value it grows linearly with the timer, below it message counts climb and convergence slows again. The best value depends on the topology.

Implementations differ from the RFC:

| Where | Typical MRAI | Why |
|---|---|---|
| RFC 4271 suggestion | 30 s eBGP, 5 s iBGP | Written for the 1990s internet: fewer messages over slow CPUs |
| Cisco IOS defaults | 30 s eBGP, 0 iBGP | Long-standing behaviour; iBGP inside one AS hunts little |
| Junos, many modern stacks | 0 (send immediately), optional delay | Fast convergence first; CPU is cheap |
| Data center fabrics (FRRouting's data-center profile) | 0 | One-hop sessions; a shared spine AS prevents hunting |

RFC 4271's wording applies MRAI to withdrawals too, and the table above assumes that, which is why the final withdrawal lands at t = 60 s. Many implementations send withdrawals at once instead, since delaying bad news only lengthens a black hole; then the last round follows the t = 30 s round within milliseconds, and the paced announcements alone set the hunt's duration.

**What MRAI solves:** bounds UPDATE volume during churn by collapsing intermediate states. **How it breaks:** at 30 s on a session that sees hunting, each step costs half a minute; at 0 on a busy edge, message storms and CPU spikes. **Signal:** inter-UPDATE gaps per prefix per peer clustering at the timer value (22.5 to 30 s with jitter), and UPDATE rate against CPU.

## BGP PIC: making failover a single write

Most outages an operator cares about are simpler than a global withdrawal: its own upstream fails while a good alternative exists. The question is how fast *this* router stops sending traffic into the failure, and with a million prefixes the answer is set by programming the **FIB** (forwarding information base, the copy of the routing table in the forwarding chip), not by BGP.

**BGP PIC** (prefix-independent convergence) has two halves. **PIC core** handles a change in the IGP (interior gateway protocol, IS-IS at Meridian) path *to* a BGP next hop: in a hierarchical FIB a million prefixes share one entry for the next hop, and rewriting it moves them all ([iBGP, loops and next hops](/learn/fabric-networking/bgp-fundamentals/ibgp-loops-and-next-hops)). **PIC edge** handles the next hop itself dying: each shared entry holds a primary next hop *and a precomputed backup*, and a failure flips it to the backup in one write.

Take the egress policy from [traffic engineering with BGP](/learn/fabric-networking/bgp-in-the-real-world/traffic-engineering-with-bgp): ISP1's routes get LOCAL_PREF 200, ISP2's 100. `gw1.ams` uses ISP1; `gw2.ams` also prefers ISP1's paths, learned over iBGP from `gw1.ams`, so its own ISP2 paths are not best and it advertises them to nobody. ISP1's router dies with the circuit still lit, so only BFD (Bidirectional Forwarding Detection, the fast hello protocol of [convergence and BFD](/learn/fabric-networking/underlay/convergence-and-bfd), here 300 ms × 3) notices. Assume FIB programming at 20,000 routes a second (real rates span thousands to over a hundred thousand, by chip and software).

| Time | Without PIC (no backup known) | With best-external, ADD-PATH and PIC edge |
|---|---|---|
| 0 | ISP1's router dies | same |
| 0.9 s | BFD down; `gw1.ams` drops a million ISP1 paths, has no alternative, deletes FIB entries and withdraws over iBGP | BFD down; `gw1.ams` flips the shared entry to its precomputed backup, `gw2.ams`'s loopback `10.255.1.202`: one write |
| 1 to 5 s | Withdrawals reach `gw2.ams` via `rr1.ams`/`rr2.ams`; it reruns best path, ISP2 now wins | Traffic already flows through `gw2.ams` to ISP2 |
| 5 to 55 s | `gw2.ams` programs a million FIB entries and advertises them; `gw1.ams` and the other sites' gateways install the new paths as they arrive | BGP converges in the background; rewrites happen without loss |
| about 60 s | Last prefix forwarding again | Nothing visible |

PIC edge needs three things, and missing any one leaves the left column:

1. **A backup path in the RIB.** `gw1.ams` must already know `gw2.ams`'s ISP2 path. `gw2.ams` sends it only with **best-external** (advertise the best eBGP path even when an iBGP path is preferred), and the reflectors relay it only with ADD-PATH (next section).
2. **A FIB that holds a backup**: a primary and a backup next hop per shared entry, which depends on the chip and platform.
3. **A fast trigger**: BFD, an interface going down, or next-hop tracking seeing the IGP route to a next hop vanish. Waiting for a hold timer (90 to 180 s at common defaults) defeats the design.

The plain-IP version has a trap. Redirected packets arrive at `gw2.ams`, whose own FIB still says "via `gw1.ams`" until `gw1.ams`'s withdrawals are processed, so for those seconds packets bounce between the gateways. PIC edge works cleanly when the packet arrives carrying a label meaning "out through ISP2" (MPLS per-next-hop labels, [MPLS and segment routing](/learn/fabric-networking/overlays-vxlan-evpn/mpls-and-segment-routing)), so the stale IP table is never consulted.

**What PIC solves:** failover time that no longer depends on table size, bounded by detection. **How it breaks:** no backup in the RIB (hidden by iBGP or a reflector), a backup that shares fate with the primary (both paths through ISP1), a hold-timer trigger, or a loop at the backup router. **Signal:** PIC coverage, the share of prefixes with a backup installed in hardware, and per-failure traffic loss measured by probes rather than session state.

## ADD-PATH: advertising more than the best

A BGP session normally carries one path per prefix: nothing in the UPDATE tells two paths for one prefix apart, so a new announcement *implicitly withdraws* the previous one. A route reflector, advertising only its own best path to every client, therefore hides the alternatives: `gw1.ams` never hears `gw2.ams`'s ISP2 path from `rr1.ams`, and a leaf hears one exit per internet prefix, not both gateways. That costs PIC backups, multipath across gateways and correct hot-potato choices (each router handing traffic to its nearest exit, [the best-path algorithm](/learn/fabric-networking/bgp-fundamentals/the-best-path-algorithm)).

**ADD-PATH** (RFC 7911) puts a 4-byte **path identifier** in front of every prefix in the NLRI (the announced prefixes) and the withdrawn routes. The receiver keys its Adj-RIB-In by (peer, prefix, path ID), so a second path is added rather than replacing the first, and a withdrawal names the path it removes. Capability 69 in the OPEN says, per address family, whether this side receives extra paths (1), sends them (2) or both (3); paths flow only where one side sends and the other receives. `192.0.2.0/24` from `rr1.ams` to `gw1.ams`, carrying `gw2.ams`'s ISP2 path as path ID 2:

| Field | Size | Value | What reads it |
|---|---|---|---|
| Path Identifier | 4 bytes | `00 00 00 02` | Receiver: which of the sender's paths this is; meaningful only on this session |
| Prefix length | 1 byte | 24 (`18`) | Parser: how many prefix bytes follow |
| Prefix | 3 bytes | 192.0.2 (`c0 00 02`) | Receiver: the destination |

Eight bytes instead of four, and the ID is the sender's choice: the same path may be path 7 on another session. The sender also picks which paths to send: all, the best N, or the best plus one backup with a different next hop (what PIC wants). With "all", client memory and every churn event's UPDATEs grow with the number of exits.

**What ADD-PATH solves:** clients of a reflector see diverse paths, so they can precompute backups, load-balance and pick their own nearest exit. **How it breaks:** one side not negotiating it silently leaves one path per prefix; "send all" exhausts memory on small clients; extra paths mean extra churn. **Signal:** paths per prefix at each client against the number the topology should give, and the negotiated ADD-PATH mode per session and family.

## Graceful restart: not converging on purpose

Graceful restart (GR) avoids converging when forwarding is fine. When a router's BGP process restarts (a crash, an upgrade, a switch to a standby processor), its forwarding chip keeps forwarding on the last FIB. Without help, every peer withdraws every route through it and re-learns them when it returns: two internet-wide convergence events for a router that never dropped a packet. The idea and its IGP form are in [convergence and BFD](/learn/fabric-networking/underlay/convergence-and-bfd); BGP's version is RFC 4724.

Each side announces capability 64 in its OPEN ([BGP sessions and the FSM](/learn/fabric-networking/bgp-fundamentals/bgp-sessions-and-the-fsm)):

| Field | Size | Value in `gw1.ams`'s OPEN | What reads it |
|---|---|---|---|
| Restart Flags | 4 bits | R (restarting) after a restart; N (RFC 8538, notification support) | Helper: R says "I am coming back, keep my routes" |
| Restart Time | 12 bits | 120 s (at most 4,095) | Helper: how long to keep stale routes waiting for the session to return |
| AFI, SAFI | 3 bytes per family | 1, 1 (IPv4 unicast) | Helper: which families this applies to |
| Family flags | 1 byte per family | F set: forwarding state was preserved | Helper: if F is clear after a restart, the routes are not safe; flush them |

Worked on a planned software upgrade of `gw1.ams`, with ISP1 as the **helper** (the peer that cooperates):

1. **t = 0.** `gw1.ams`'s BGP process stops; the TCP session closes without a NOTIFICATION. ISP1 marks the paths from `gw1.ams` (Meridian's `203.0.113.0/24`) **stale**, keeps forwarding on them, and starts a 120 s restart timer. The internet sees nothing.
2. **t = 45 s.** The new process sends an OPEN with R and F set. ISP1 stops the restart timer and starts a **stale-path timer** (commonly 300 to 360 s) bounding the resynchronisation.
3. **t = 45 to 50 s.** ISP1 sends its full table and an **End-of-RIB** marker (an UPDATE with nothing in it, meaning "that was everything"). `gw1.ams` defers best-path selection until every GR peer's End-of-RIB arrives (or a deferral timer fires), so it never computes from half a table.
4. **t = 50 s.** `gw1.ams` reconciles its FIB, advertises its routes and sends End-of-RIB. ISP1 replaces its stale copies and deletes any not re-advertised.

Without GR, step 1 withdraws Meridian's prefix through ISP1, starting a hunt towards the prepended path through ISP2, another convergence at t = 45 s, and dampening penalties far away (below). RFC 8538 extends helping to sessions that end *with* a NOTIFICATION, such as a hold-timer expiry, unless the sender uses the Hard Reset subcode.

GR is a bet that the data plane is fine. If `gw1.ams` had rebooted completely while the carrier kept the circuit lit, ISP1 would forward Meridian's inbound traffic into a dead box for the full 120 s. The protection is BFD running in hardware and advertising its control-plane-independent (C) bit (RFC 5882 describes the interaction): if that BFD session also fails, forwarding is broken and the helper abandons GR at once. In a fabric with redundant spines, routing around a restarting box is cheap, so many operators keep GR for the edge only.

### Long-lived graceful restart

GR's restart time caps at 4,095 s. **LLGR** (long-lived graceful restart, RFC 9494, capability 71) covers the case where a stale route for hours beats no route. Each family carries a 24-bit long-lived stale time, up to about 194 days. When the GR timer ends (or immediately, if GR is not used), routes enter the long-lived stale phase: they are tagged with the well-known community **LLGR_STALE** (65535:6), treated as least preferred (used only if no other path exists) and, apart from a narrow iBGP exception, passed on only to peers that also negotiated LLGR. A route tagged **NO_LLGR** (65535:7) is flushed instead.

The Meridian case: a bad software push takes down `rr1.ams` and `rr2.ams` together. Every leaf's reflector sessions expire after their 9 s hold time and, without LLGR, each leaf flushes every EVPN route (the tenant MAC and IP routes of [EVPN](/learn/fabric-networking/overlays-vxlan-evpn/evpn-the-control-plane)): tenant traffic stops although every tunnel and spine works. With LLGR at, say, one hour, leaves keep forwarding on the last known routes. Nothing updates them: a virtual machine that moves leaf during that hour keeps receiving traffic at its old one.

**What GR and LLGR solve:** a control-plane outage without a data-plane outage or internet-wide churn. **How they break:** helpers forward into a dead data plane; the topology changes during the restart and stale routes are wrong, for hours under LLGR. **Signal:** stale route counts per peer, GR helper events with their duration, routes carrying 65535:6, and BFD state during each restart.

## Route flap dampening: penalising instability

A prefix withdrawn and re-announced every few seconds costs every router on the internet an UPDATE and a decision each time. **Route flap dampening** (RFC 2439, 1998) stops passing on unstable routes. Each router keeps, per prefix and per eBGP peer, a **penalty**. Events add to it, commonly 1,000 for a withdrawal and 500 for an attribute change (some vendors charge 1,000 for a re-announcement too), and it halves every **half-life** (15 minutes by default). Above the **suppress threshold** (2,000; 3,000 on some vendors) the route is neither used nor advertised, until the penalty decays below the **reuse threshold** (750). A **maximum suppress time** (60 minutes) caps the penalty at 750 × 2^(60/15) = 12,000. The link version is in [underlay failures in production](/learn/fabric-networking/underlay/underlay-failures-in-production).

```python
import math

# RFC 2439 figure of merit with common defaults (Cisco-style weights; vendors differ).
HALF_LIFE = 15 * 60          # seconds for the penalty to halve
SUPPRESS, REUSE = 2000, 750  # suppress above this, reuse once decayed below this
MAX_SUPPRESS = 60 * 60       # never suppress longer than an hour
WEIGHT = {"withdraw": 1000, "attr-change": 500, "announce": 0}
CEILING = REUSE * 2 ** (MAX_SUPPRESS / HALF_LIFE)   # 12,000: decays to REUSE in 60 min


def damp(events, suppress=SUPPRESS):
    """events: (time_s, kind) for one prefix from one peer. Prints the penalty
    after each event and when a suppressed route becomes usable again."""
    penalty, last, suppressed = 0.0, 0.0, False
    for t, kind in events:
        penalty *= 2 ** (-(t - last) / HALF_LIFE)        # exponential decay since last event
        penalty = min(penalty + WEIGHT[kind], CEILING)
        last = t
        if penalty > suppress:
            suppressed = True
        print(f"  t={t:>5.0f} s  {kind:<11} penalty {penalty:6.0f}  {'SUPPRESSED' if suppressed else 'usable'}")
    if suppressed:
        wait = HALF_LIFE * math.log2(penalty / REUSE)       # time to decay to REUSE
        print(f"  reusable at t={last + wait:,.0f} s, {wait / 60:.0f} min after the last event")


# One flap at AS 64511 as Meridian's gw1.ams hears it from ISP1, path hunting included:
# two longer paths, a withdrawal, then the route comes back 120 s after it left.
one_flap = [(0, "attr-change"), (30, "attr-change"), (60, "withdraw"), (180, "announce")]
# The origin's link flaps again five minutes later; the same hunt repeats.
two_flaps = one_flap + [(t + 300, k) for t, k in one_flap]

print("one flap, suppress 2000:");  damp(one_flap)
print("two flaps, suppress 2000:"); damp(two_flaps)
print("two flaps, suppress 6000 (RFC 7196):"); damp(two_flaps, suppress=6000)
```

```text
one flap, suppress 2000:
  t=    0 s  attr-change penalty    500  usable
  t=   30 s  attr-change penalty    989  usable
  t=   60 s  withdraw    penalty   1966  usable
  t=  180 s  announce    penalty   1792  usable
two flaps, suppress 2000:
  t=    0 s  attr-change penalty    500  usable
  t=   30 s  attr-change penalty    989  usable
  t=   60 s  withdraw    penalty   1966  usable
  t=  180 s  announce    penalty   1792  usable
  t=  300 s  attr-change penalty   2134  SUPPRESSED
  t=  330 s  attr-change penalty   2585  SUPPRESSED
  t=  360 s  withdraw    penalty   3526  SUPPRESSED
  t=  480 s  announce    penalty   3215  SUPPRESSED
  reusable at t=2,370 s, 31 min after the last event
two flaps, suppress 6000 (RFC 7196):
  t=    0 s  attr-change penalty    500  usable
  t=   30 s  attr-change penalty    989  usable
  t=   60 s  withdraw    penalty   1966  usable
  t=  180 s  announce    penalty   1792  usable
  t=  300 s  attr-change penalty   2134  usable
  t=  330 s  attr-change penalty   2585  usable
  t=  360 s  withdraw    penalty   3526  usable
  t=  480 s  announce    penalty   3215  usable
```

Trace the second line: 500 decays for 30 s by 2^(−30/900) = 0.977 to 489, plus 500 is 989. The point is the input. AS 64511's link went down once, but path hunting delivered it to `gw1.ams` as two attribute changes and a withdrawal, about 2,000 points; charge 1,000 for the re-announcement too and the first flap alone reaches 2,792, over a 2,000 threshold though under 3,000. Two flaps five minutes apart suppress the prefix at t = 300 s. The origin is stable from t = 480 s, yet Meridian cannot reach it for another 31 minutes, the decay from 3,215 to 750 (log2(4.29) × 15 min). Mao, Govindan, Varghese and Katz described exactly this in 2002. RIPE's routing working group advised against dampening in 2006 (RIPE-378), then in 2013 (RIPE-580) accepted it again with a suppress threshold of at least 6,000, the value RFC 7196 (2014) recommends, which catches only chronic flappers. Never dampen inside a fabric or on iBGP, where a flap is a fault to fix.

**What dampening solves:** caps the CPU and UPDATE cost of persistently flapping prefixes. **How it breaks:** old default thresholds turn one ordinary outage plus path hunting into up to an hour of unreachability, long after the cause is gone. **Signal:** suppressed prefixes with penalty and time to reuse; a customer reporting reachability from "most but not all" networks long after a short outage.

## RIB and FIB scale limits

A full table in the mid-2020s is about a million IPv4 prefixes and over 200,000 IPv6 prefixes, growing by tens of thousands a year. Two memories must hold it, and they run out differently.

**The RIB** is software memory on the control-plane CPU: every path from every peer, with attributes, so its size is prefixes × paths per prefix × bytes per path. `gw1.ams` holds ISP1's path plus `gw2.ams`'s ISP2 path once from each reflector (`rr1.ams` and `rr2.ams` send the same path, and the router keeps both copies): three paths per IPv4 prefix, three million paths, and five with a second full-table upstream. Daemons share identical attribute sets, so a path costs roughly a hundred to a few hundred bytes by implementation; at an assumed 200 bytes, about 600 MB for IPv4 alone. Every extra full-table peer, ADD-PATH path or soft reconfiguration copy ([UPDATEs, attributes and RIBs](/learn/fabric-networking/bgp-fundamentals/updates-attributes-and-ribs)) adds to it, and running out kills the daemon. CPU is the other limit: a session reset means a million best-path runs.

**The FIB** is the forwarding chip's memory, far smaller and fixed in silicon ([the routing table](/learn/fabric-networking/from-zero/the-routing-table) explains tries and TCAM). Data-center switch chips hold on the order of a hundred thousand to a few hundred thousand IPv4 routes, depending on how a profile splits shared memory between routes, host entries and MAC addresses; internet-edge chips with large or external memory hold several million. An IPv6 entry typically costs two to four IPv4 entries, depending on prefix length and chip. A full FIB fails silently: routes stay in the RIB, BGP keeps advertising them, and the hardware drops their traffic, punts it to the CPU or sends it by a less specific route.

The public case is 12 August 2014, when the IPv4 table passed 512,000 routes (512K), the default IPv4 allocation in the forwarding memory of several widely deployed platforms, among them Cisco's Catalyst 6500 and 7600. Networks running them lost reachability to some prefixes, and reallocating the memory needed a reboot; operators who tracked headroom had done it months earlier.

Meridian confines the problem to the gateways: only `gw1.ams`, `gw2.ams` and their counterparts in other sites carry the full table, on edge-class hardware; leaves and spines use a default route towards them. Two more defences: never advertise a route before the hardware holds it (FRRouting's "suppress FIB pending"), so a router still programming after a reboot attracts no traffic it cannot forward; and a maximum-prefix limit on sessions that should never carry a full table ([operating BGP safely](/learn/fabric-networking/bgp-in-the-real-world/operating-bgp-safely)).

**What scale planning solves:** the table keeps fitting as the internet grows. **How it breaks:** RIB memory exhaustion kills the daemon; FIB exhaustion leaves routes in software that hardware cannot forward. **Signal:** RIB memory per peer and per family, FIB utilisation per hardware table against capacity with a growth projection, and RIB route counts that exceed FIB counts.

## Monitoring with BMP

Everything above is over before a poller looks: a minute of hunting or a 20-second flap is invisible to SNMP or CLI scraping every five minutes. Public route collectors (RouteViews, RIPE RIS) show the internet from their own peers, not what your router chose. **BMP**, the BGP Monitoring Protocol (RFC 7854), streams the router's own view.

Usually the router opens a TCP connection to a collector (either side may initiate), and from then on only the router talks; the collector never sends BMP messages back. On connect the router sends an Initiation message and a Peer Up per session, dumps every monitored route, then streams each change. Every message has a 6-byte common header (version 3, a 4-byte length, a 1-byte type), and per-peer messages add a 42-byte per-peer header:

| Field | Size | Value in a Route Monitoring message from `gw1.ams` | What reads it |
|---|---|---|---|
| Peer Type | 1 byte | 0 (global instance) | Collector: which routing instance, or 3 for Loc-RIB (RFC 9069) |
| Peer Flags | 1 byte | L set: post-policy | Collector: IPv6 peer (V), pre- or post-policy (L), Adj-RIB-Out (O, RFC 8671) |
| Peer Distinguisher | 8 bytes | 0 | Collector: separates VRFs |
| Peer Address | 16 bytes | ISP1's address | Collector: which session |
| Peer AS | 4 bytes | 64501 | Collector |
| Peer BGP ID | 4 bytes | ISP1's router ID | Collector |
| Timestamp | 4 + 4 bytes | seconds and microseconds | Collector: when the router received it, the basis for every convergence measurement |

The message types map onto this lesson. **Route Monitoring** (type 0) carries the BGP UPDATE, pre- or post-policy, so a hunt appears as its sequence of AS_PATHs. **Peer Up** (3) carries both OPENs, recording negotiated GR, ADD-PATH and families. **Peer Down** (2) carries a reason (local or remote close, with or without a NOTIFICATION) and the NOTIFICATION. **Statistics Report** (1) carries counters such as prefixes rejected by policy, updates discarded for an AS_PATH loop, and routes in the Adj-RIB-In and Loc-RIB. Initiation (4), Termination (5) and Route Mirroring (6) complete the set. Collectors such as OpenBMP, pmacct and GoBMP typically publish into Kafka.

BMP's own failure is volume. `gw1.ams` monitoring its ISP1 session and one reflector session, pre- and post-policy, dumps about four million routes on connect; a collector that falls behind fills the router's buffer, and implementations typically drop the session and dump everything again on reconnect. A collector that silently stopped receiving looks exactly like a stable network, so monitor its freshness first ([telemetry and observability](/learn/fabric-networking/operating-fabrics/telemetry-and-observability)).

**What BMP solves:** a timestamped, per-session record of what each router heard, kept and chose. **How it breaks:** collector backpressure, monitored RIBs left unconfigured (post-policy only, so rejections are invisible), and a dead feed mistaken for calm. **Signal:** BMP session state and last-message age per router, and dump completion after each reconnect.

## What the platform should show

Tooling built on these feeds should surface:

- **Convergence per event, measured** from BMP timestamps (first to last change per prefix per peer, as a distribution) plus probe-measured loss. "0.9 s for 99% of prefixes" is a measurement; "BFD is configured" is not.
- **Hunting and churn.** UPDATEs per prefix per event, AS_PATHs growing before a withdrawal, UPDATE rate per peer against a baseline. A spike with no local cause is an upstream event to correlate, not to page on.
- **PIC coverage and backup diversity.** Share of prefixes with a backup in hardware, and whether the backup shares fate with the primary (same upstream AS, same circuit).
- **Paths per prefix at reflector clients** against what the topology should give: one path where two are expected means ADD-PATH is off somewhere.
- **Stale and suppressed routes.** GR-stale and LLGR_STALE counts with their age; dampened prefixes with penalty and time to reuse.
- **RIB, FIB and hardware headroom.** Counts per stage that should agree, memory per peer, and "weeks until full" from the growth trend.
- **Feed health.** BMP session state and lag per router, so silence is never read as stability.

Engineers need the prefix and the peer; managers need "was this us, and is it over?". Both views come from one event store. The core of the convergence view, run on a BMP feed from `gw1.ams` containing the visualisation's hunt:

```python
from collections import defaultdict

QUIET = 120  # seconds without a change that close one convergence event


def bursts(changes):
    """Split one prefix's changes into events separated by QUIET seconds."""
    out = [[changes[0]]]
    for prev, cur in zip(changes, changes[1:]):
        if cur[0] - prev[0] > QUIET:
            out.append([])
        out[-1].append(cur)
    return out


def summarise(feed):
    """feed: BMP Route Monitoring records as (time_s, peer, prefix, as_path or None)."""
    per_prefix = defaultdict(list)
    for t, peer, prefix, path in sorted(feed):
        per_prefix[(peer, prefix)].append((t, path))
    for (peer, prefix), changes in per_prefix.items():
        events = bursts(changes)
        for b in events:
            lengths = [len(p) for _, p in b if p]
            gone = b[-1][1] is None
            hunting = gone and len(lengths) >= 2 and lengths == sorted(lengths)
            verdict = ("path hunting, then withdrawn" if hunting else "withdrawn" if gone
                       else "settled on " + " ".join(map(str, b[-1][1])))
            print(f"{peer} {prefix:<17} t={b[0][0]:>4}-{b[-1][0]:<4}  {len(b)} msgs  "
                  f"{b[-1][0] - b[0][0]:>2} s  {verdict}")
        if len(events) >= 3:
            print(f"{'':4} {prefix:<17} {len(events)} events in {changes[-1][0] - changes[0][0]} s: flapping")


feed = [
    # 192.0.2.0/24 withdrawn by its origin, AS 64511: ISP1 hunts, as in the visualisation.
    (1000, "isp1", "192.0.2.0/24", [64501, 64496, 64511]),
    (1030, "isp1", "192.0.2.0/24", [64501, 64502, 64496, 64511]),
    (1060, "isp1", "192.0.2.0/24", None),
    # 198.51.100.0/24 moves to a prepended backup path and stays there.
    (1200, "isp1", "198.51.100.0/24", [64501, 64496, 64496, 64496, 64511]),
    # 198.51.100.128/25, originated by AS 64496, flapping every few minutes.
    *[(t, "isp1", "198.51.100.128/25", p) for t, p in
      [(400, None), (430, [64501, 64496]), (800, None), (830, [64501, 64496]),
       (1300, None), (1330, [64501, 64496])]],
]
summarise(feed)
```

```text
isp1 198.51.100.128/25 t= 400-430   2 msgs  30 s  settled on 64501 64496
isp1 198.51.100.128/25 t= 800-830   2 msgs  30 s  settled on 64501 64496
isp1 198.51.100.128/25 t=1300-1330  2 msgs  30 s  settled on 64501 64496
     198.51.100.128/25 3 events in 930 s: flapping
isp1 192.0.2.0/24      t=1000-1060  3 msgs  60 s  path hunting, then withdrawn
isp1 198.51.100.0/24   t=1200-1200  1 msgs   0 s  settled on 64501 64496 64496 64496 64511
```

`QUIET` defines an event: changes within 120 s belong together, a gap that must exceed the MRAI or one hunt splits into several. The hunting test is the first section's signature: path lengths that never shrink, ending in a withdrawal. The flapping prefix is the one a dampening router penalises, so show its penalty beside it.

## Failure modes in production

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| No backup path at the primary exit | ISP failover loses traffic for tens of seconds to a minute | The primary gateway's RIB has one path per prefix; the other gateway's eBGP paths are not best and never advertised; reflectors send one path | Best-external on the backup gateway, ADD-PATH on the reflectors, PIC edge in hardware |
| Loop at the backup router | After a failure, TTL-exceeded and traffic bouncing between two gateways for seconds | The backup's own FIB still points at the failed primary until withdrawals are processed | Label-based backup (MPLS per-next-hop labels), or accept and measure the window |
| GR into a dead data plane | Inbound traffic black-holed for the restart time after a full reboot with the circuit lit | Helper shows stale routes for the peer; BFD absent or not control-plane-independent | BFD with the control-plane-independent flag; shorter restart time; GR off where redundancy exists |
| LLGR keeping wrong routes | Traffic for a moved host goes to its old leaf during a reflector outage | Routes with 65535:6, long-lived stale time of hours | NO_LLGR on volatile routes; a stale time matched to how fast the network changes |
| Dampening a healthy prefix | A destination unreachable from one network for 30 to 60 min after a brief outage elsewhere | Looking glass or BMP shows the route present but suppressed, with a penalty | RFC 7196 thresholds (6,000) or dampening off; clear the penalty for the prefix |
| FIB exhaustion | Some prefixes unreachable or slow; RIB count above hardware count; table-full logs | Hardware table utilisation at 100%; growth past the profile's allocation | Reallocate the profile (often a reboot), filter or default-route, edge-class hardware |
| Internet-style MRAI in a fabric | A dead switch takes 30 s or more to route around | Inter-UPDATE gaps of about 30 s on fabric sessions | MRAI 0 and a shared spine AS ([BGP as the underlay](/learn/fabric-networking/underlay/bgp-as-the-underlay)) |

## Trade-offs: the convergence toolbox

| Tool | Speeds up or protects | Costs | Hurts when |
|---|---|---|---|
| MRAI 30 s | Fewer UPDATEs during churn | Each hunting step takes 30 s | Used inside a fabric or on failover-critical sessions |
| MRAI 0 | Each step at CPU speed | More UPDATEs, CPU spikes | Asynchronous storms on large meshes |
| PIC (with a backup) | Failover bounded by detection, independent of table size | Backup paths in RIB and FIB; hardware support | The backup shares fate or loops at the backup router |
| ADD-PATH | Reflector clients see diverse paths | Memory and churn times the number of paths | Small clients receive "all paths" for a full table |
| Graceful restart | A software restart without churn | Trust in stale state for up to the restart time | The data plane is actually dead |
| LLGR | Hours of forwarding through a control-plane outage | Routes that never update | The network changes during the outage |
| Dampening (RFC 7196 values) | CPU protection from chronic flappers | Delayed reachability after real flaps | Old 2,000 thresholds plus path hunting |

## Under the hood: what a BGP daemon does with all this

FRRouting (used by SONiC and Cumulus) runs the MRAI per peer or update group, not per prefix: changes queue and go out together when the timer fires, so one timer collapses a million prefixes' intermediate states. Peers with the same export policy share an update group, so a reflector formats each UPDATE once for all its clients. After the daemon starts, an update-delay ("read-only mode") holds best-path runs until peers have sent their tables, the non-GR cousin of GR's selection deferral. Routes reach hardware through `zebra` and, on SONiC, the switch state database and vendor SDK; with "suppress FIB pending", BGP advertises a route only after zebra confirms installation. Linux nexthop objects let many routes share one group, the kernel half of PIC core.

## Interviewer follow-ups

**"Why does a BGP withdrawal take longer to converge than an announcement?"** Model answer: an announcement's first copy is real, so it spreads in one pass. After a withdrawal every router still holds stale alternatives and discards one only when its own AS comes back in the path or a neighbour withdraws it, so the network tries ever-longer paths; MRAI paces each round (30 s at the RFC's suggestion), and real internet withdrawals were measured taking minutes. Inside a fabric, MRAI 0 and a shared spine AS remove most of it. Common wrong answer: "withdrawals are processed at lower priority".

**"Failover from ISP1 to ISP2 loses a minute of traffic. Get it under a second."** Model answer: split the time into detection and repair. Detection: BFD, not a hold timer of 90 s or more. Repair: a minute means per-prefix FIB rewriting after BGP learns a new path, so the backup must already be known (best-external on `gw2.ams`, ADD-PATH on the reflectors) and installed as a PIC backup, making failover one write. Then check the backup router does not loop the packet back. Common wrong answer: "lower the MRAI" (it paces advertisements to peers, not local failover). An honest addition: "I'd defer to the network team on whether this platform supports PIC edge for plain IPv4, but I'd measure failover with probes before and after."

**"Should we enable graceful restart everywhere?"** Model answer: GR trades churn for trust in stale state. At the internet edge an upgrade without it costs two internet-wide convergence events, so keep it there, paired with control-plane-independent BFD so a dead data plane cancels it. In a redundant fabric, routing around a restarting box is cheap. LLGR fits reflector outages where stale beats nothing. Common wrong answer: "yes, it prevents outages", without naming the black hole it can cause.

**"A customer says their prefix was unreachable from one large network for forty minutes after a two-minute outage. What happened?"** Model answer: route flap dampening, amplified by path hunting. The outage and its hunt arrived there as several attribute changes and withdrawals, enough to cross a 2,000 suppress threshold, and the penalty took half an hour to decay to 750. Confirm with that network's looking glass (a public web page that runs read-only BGP queries on its routers) or with BMP data showing the route present but suppressed. The fix is on their side (RFC 7196 thresholds); the customer's part is to avoid repeated flaps. Common wrong answer: "BGP is slow, it takes time to propagate".

## What mid-level engineers get wrong

- **Assuming lower MRAI is always faster.** On a large mesh, MRAI 0 can mean more transient paths, more UPDATEs and slower convergence; the curve is V-shaped.
- **Assuming two ISPs mean a backup path is ready.** Reflectors advertise only best paths, so the primary gateway may know no alternative until the failure.
- **Enabling graceful restart without BFD.** A rebooted box with a lit circuit attracts traffic for the whole restart time.
- **Measuring convergence from session state or the RIB.** Hardware programming lags the RIB by seconds to minutes on full tables; only probes show traffic.
- **Turning on dampening with 1998 defaults.** One upstream outage plus path hunting suppresses healthy prefixes for half an hour.

## Senior signals

- You explain why bad news travels slowly by mechanism: stale Adj-RIB-In paths, the AS_PATH loop check as the only thing that kills them, and MRAI pacing each round.
- You split failover into detection and repair, and make repair independent of table size with a precomputed backup that is known (best-external, ADD-PATH), installed (PIC) and not looping.
- You treat graceful restart as a bet on the data plane, pair it with control-plane-independent BFD, and reach for LLGR only where stale beats nothing.
- You know route flap dampening's history, why path hunting trips it, and the RFC 7196 threshold.
- You size RIB and FIB separately, keep full tables on edge-class hardware, and track headroom against growth before the next 512K day.
- You measure convergence from BMP timestamps and probes, and monitor the collector's own freshness.

## Check yourself

```quiz
- q: >-
    AS 64511 withdraws 192.0.2.0/24. For the next minute, Meridian receives from ISP1 first a three-AS path and then a four-AS path for that prefix before a withdrawal. Why?
  options: ["ISP1 is prepending its own AS to slow the withdrawal down", "Each transit network falls back to stale paths that still name AS 64511", "The withdrawal is delayed by MRAI while the stale paths are not", "Meridian's import policy is lengthening the paths that ISP1 sends"]
  answer: 1
  explanation: >-
    Every network still holds alternatives learned earlier through its neighbours. After the origin withdraws, all of them are stale, but a router can only discard one when its own AS comes back in the path or the neighbour withdraws it, so each tries ever-longer paths: path hunting. MRAI only sets how far apart the stale announcements arrive; pacing a withdrawal cannot make a path longer. Nobody is prepending, and import policy does not add ASes.
- q: >-
    An engineer proposes setting MRAI to 0 on every internet-facing session to speed up convergence. What is the main risk?
  options: ["Withdrawals are no longer sent until the next MRAI interval fires", "Many more transient paths and UPDATEs, which can slow convergence again", "Sessions reset, because MRAI 0 breaks the hold timer negotiation", "Routes are never collapsed, so the FIB needs twice as many entries"]
  answer: 1
  explanation: >-
    MRAI collapses intermediate states: with it at 0, every change is sent at once, so asynchronous hunts on a large mesh produce many more UPDATEs and CPU spikes, and simulations show convergence getting slower again below some value (a V-shaped curve). MRAI has nothing to do with hold time negotiation or FIB size, and withdrawals are not held back by a zero timer.
- q: >-
    gw1.ams prefers ISP1 (LOCAL_PREF 200) and gw2.ams has ISP2's paths but also prefers gw1.ams's. PIC edge is enabled in gw1.ams's hardware, yet ISP1 failing still costs a minute. What is most likely missing?
  options: ["BFD on the iBGP sessions between the gateways and the reflectors", "Route flap dampening on gw2.ams for the paths received from ISP2", "A shorter MRAI on the eBGP session between gw1.ams and ISP1", "gw2.ams's ISP2 paths present in gw1.ams's RIB as backups"]
  answer: 3
  explanation: >-
    PIC can only install a backup that the RIB already holds. gw2.ams's best path is the iBGP one through gw1.ams, so its ISP2 paths are not advertised, and reflectors send one path per prefix anyway. Best-external on gw2.ams and ADD-PATH on the reflectors put the backup in gw1.ams's RIB. MRAI paces advertisements to peers, not local failover; BFD on iBGP does not create a path; dampening would only make things worse.
- q: >-
    gw1.ams's BGP process restarts for an upgrade and its session to ISP1 drops without a NOTIFICATION. Both sides negotiated graceful restart with a 120 s restart time. What does ISP1 do?
  options: ["Holds Meridian's routes indefinitely until an operator clears them", "Keeps forwarding on Meridian's routes, marked stale, for up to 120 s", "Withdraws Meridian's routes at once and re-learns them on reconnect", "Moves Meridian's routes to ISP2's path until End-of-RIB arrives"]
  answer: 1
  explanation: >-
    As a helper, ISP1 marks the paths stale and keeps using them while the restart timer runs; when the session returns it waits for End-of-RIB and deletes any stale path not re-advertised. Withdrawing at once is the behaviour without GR. GR is bounded by the restart time, at most 4,095 s; hours-long retention is LLGR. ISP1 has no reason to prefer another path while the stale one is kept.
- q: >-
    With common dampening defaults (withdrawal 1,000, attribute change 500, suppress 2,000, reuse 750, half-life 15 min), a prefix whose origin flapped twice in five minutes is suppressed for about half an hour after it became stable. Why did so few flaps trip it?
  options: ["Each flap reached the router as several updates because of path hunting", "Re-announcements cost 2,000 points each, so one flap is always enough", "Suppression is applied by the origin AS, which counts its own flaps", "The half-life restarts from zero whenever the route is announced again"]
  answer: 0
  explanation: >-
    Path hunting turns one withdrawal at the origin into a run of longer paths and then a withdrawal at each distant router, so one flap scores about 2,000 points instead of 1,000. Two flaps push the penalty past the threshold, and decaying from about 3,200 to 750 takes roughly two half-lives. Re-announcements cost 0 or 1,000 depending on the vendor, not 2,000; decay is continuous; and dampening is applied by the receiving router, not the origin.
- q: >-
    Which question can a BMP feed answer that polling a router's BGP summary every five minutes cannot?
  options: ["What the router's configured hold time is for each of its peers", "Whether the router's BGP sessions are currently in Established", "Which AS paths a prefix went through during a 60-second hunt, and when", "How many prefixes each peer has sent the router at this moment"]
  answer: 2
  explanation: >-
    BMP streams every UPDATE as the router received it, with a router timestamp, so a hunt that lasts a minute is recorded path by path. A poll every five minutes sees the before and after at best. Session state, current prefix counts and configured timers are all visible to a poll; the transient history is not.
```
