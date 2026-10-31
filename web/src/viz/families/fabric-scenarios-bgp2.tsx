// Scenario pack for the `fabric` family: BGP failures and BGP in the real world (modules 04 and 05).
// Each scenario is a script over the `Fab` DSL in fabric-core.tsx (read its
// authoring guide first; fabric-scenarios-core.tsx has three reference
// scenarios). Export every generator in `scenarios` and a short gallery label
// in `labels`; fabric.test.ts picks them up automatically.
//
// Scenarios this pack must implement (from the track brief: name, what it
// shows, owner lesson). Run on the Meridian fabric; the default run (input {})
// is what the owning lesson uses. Document any optional input in the
// scenario's doc comment.
//
//   | `bgp-blackhole` | R1–R2–R3, BGP only on R1 and R3, sessions up, R2
//     dropping the customer packet; `variant: "vxlan"` shows the fix | 04-07 |
//   | `community-policy` | routes tagged with communities at ingress, matched
//     at egress, NO_EXPORT stopping propagation | 05-01 |
//   | `two-isp-te` | AS 64500 with ISP1 and ISP2: LOCAL_PREF steering egress,
//     prepending and a more-specific steering ingress, failover | 05-02 |
//   | `valley-free` | customer, peer and provider links; which routes are
//     exported to whom; a leak that violates the rule | 05-03 |
//   | `route-hijack` | a more-specific announcement attracting traffic away
//     from the origin; RPKI origin validation marking it invalid and dropping it
//     | 05-04 |
//   | `path-hunting` | a withdrawal causing routers to try ever-longer stale
//     paths before converging; MRAI timers | 05-05 |
//   | `maintenance-order` | costing out a router: BGP withdrawn first then IGP
//     (clean), versus IGP first (traffic black-holed) | 05-06 |
//
// Addressing: Meridian is AS 64500 with 203.0.113.0/24; ISP1 AS 64501, ISP2
// AS 64502, a transit provider AS 64496, a content network AS 64511 with
// 192.0.2.0/24. Two more networks are needed here and take documentation
// ASNs (RFC 5398) the brief leaves free: a BGP customer of Meridian, AS 64505
// with 198.51.100.0/24, and the network that leaks a hijack, AS 64510. The
// documentation IPv4 ranges (RFC 5737) are single /24s, so the scenarios that
// need a more-specific use a /25 and say once that most networks filter IPv4
// routes longer than /24 on the public internet.

import type { Tone } from "../primitives";
import { ANYCAST_GW_MAC, AS, Fab, fnv32, HOSTS, loopback, p2p, pick, type FabGen, type HeaderSpec } from "./fabric-core";

const asPath = (...asns: number[]): string => (asns.length ? asns.join(" ") : "(empty)");

/** A BGP UPDATE shown as a header: one route's NLRI and path attributes. */
const update = (name: string, fields: Record<string, string | number>, highlight?: string[]): HeaderSpec => ({
  name,
  size: "19 B header + attributes",
  reader: "the BGP process on the receiving router",
  tone: "path",
  fields,
  highlight,
});

// ---------- bgp-blackhole ----------

/**
 * `bgp-blackhole` (lesson 04-07). The classic trap on a cut-down piece of
 * Meridian's Amsterdam fabric with one spine (a second spine would sit in
 * exactly the same position): R1 = leaf1.ams, R2 = spine1.ams, R3 =
 * leaf3.ams, all three running IS-IS, which carries only loopbacks and link
 * addresses. The default run imagines a design Meridian does not use: Acme's
 * subnets in the global routing table, carried by plain IPv4 iBGP (AS 65000)
 * between the two leaves only, and no encapsulation. The session comes up
 * over the loopbacks, leaf3.ams advertises 10.1.2.0/24 with next hop
 * 10.255.1.13, leaf1.ams resolves that next hop through IS-IS and forwards
 * acme-web1's packet to spine1.ams, which has no route for 10.1.2.20 and
 * drops it (and cannot even return an ICMP error, because it has no route
 * back to 10.1.1.0/24 either). Every session and adjacency stays up.
 *
 * Inputs: `variant: "vxlan"` runs the fix instead: the same three routers
 * with the same IS-IS, but leaf1.ams and leaf3.ams are VTEPs, the session
 * carries an EVPN type-5 route for 10.1.2.0/24 in VRF ACME (L3VNI 50001), and
 * leaf1.ams encapsulates the packet to 10.255.1.13, which spine1.ams can
 * route (symmetric IRB, lesson 06-04). 14 frames in either run.
 */
export const bgpBlackhole: FabGen = (input) => {
  const vxlan = pick(input.variant, ["plain", "vxlan"] as const, "plain") === "vxlan";
  const web = HOSTS["acme-web1"];
  const db = HOSTS["acme-db1"];
  const L1 = "leaf1.ams";
  const S1 = "spine1.ams";
  const L3 = "leaf3.ams";
  const lo1 = loopback(L1);
  const lo3 = loopback(L3);
  const a = p2p(L1, S1);
  const c = p2p(L3, S1);
  const fab = new Fab(
    [
      { id: "acme-web1", kind: "host", x: 6, y: 100, state: web.ip },
      { id: L1, kind: "leaf", x: 20, y: 50, state: "R1 · BGP" },
      { id: S1, kind: "spine", x: 50, y: 0, state: "R2 · IS-IS only" },
      { id: L3, kind: "leaf", x: 80, y: 50, state: "R3 · BGP" },
      { id: "acme-db1", kind: "host", x: 94, y: 100, state: db.ip },
    ],
    [
      ["acme-web1", L1],
      [L1, S1, { label: "IS-IS" }],
      [S1, L3, { label: "IS-IS" }],
      [L3, "acme-db1"],
      [L1, L3, { dashed: true, tone: "muted", label: "iBGP (not up yet)" }],
    ],
  );
  const spineRib = [
    [`${lo1}/32`, `${a.leaf} (leaf1)`, "IS-IS"],
    [`${lo3}/32`, `${c.leaf} (leaf3)`, "IS-IS"],
    [a.net, "connected", "link to leaf1"],
    [c.net, "connected", "link to leaf3"],
  ];
  fab.set({ R1: L1, R2: S1, R3: L3, "BGP runs on": vxlan ? "leaf1, leaf3 (EVPN)" : "leaf1, leaf3 only" });
  fab.note(
    vxlan
      ? `The same three routers as in the broken design, R1 = leaf1.ams, R2 = spine1.ams and R3 = leaf3.ams, again with IS-IS on all three and BGP only on the two leaves. This time the design is Meridian's real one: the leaves are VXLAN tunnel endpoints and Acme's subnets live in VRF ACME, carried by BGP EVPN.`
      : `Three routers in a row, a cut-down piece of Meridian's Amsterdam fabric with one spine: R1 = leaf1.ams, R2 = spine1.ams, R3 = leaf3.ams. All three run IS-IS; only the two leaves run BGP. This run imagines a design Meridian does not use: Acme's subnets in the plain global routing table, with no VXLAN.`,
    "topology",
  );

  fab.table(0, { title: `${S1} routing table (IS-IS has converged)`, head: ["prefix", "next hop", "source"], rows: spineRib });
  fab.tones([L1, S1, L3], "done");
  fab.note(
    `IS-IS is up on both links and spine1.ams's table is complete for what IS-IS carries: the leaves' loopbacks ${lo1} and ${lo3} and the two /31 link subnets. IS-IS carries infrastructure addresses only; no Acme subnet is in it, by design.`,
    "igp",
  );

  fab.tones([L1, S1, L3], undefined);
  fab.headers([
    { name: "IPv4", size: 20, reader: "every router on the way", fields: { src: lo1, dst: lo3, TTL: 64, protocol: "6 (TCP)" } },
    { name: "TCP", size: 20, reader: "leaf3.ams only", fields: { "src port": 50211, "dst port": 179, flags: "SYN" } },
  ], `on the link ${L1} → ${S1}`);
  fab.send(
    L1,
    S1,
    "TCP SYN to :179",
    `leaf1.ams opens the BGP session: a TCP SYN from its loopback ${lo1} to leaf3's loopback ${lo3}, port 179. iBGP sessions run between loopbacks, and spine1.ams can forward this packet because IS-IS gave it a route to ${lo3}/32.`,
  );

  fab.headers(undefined);
  fab.linkSet(L1, L3, { tone: "done", label: vxlan ? "iBGP EVPN Established" : "iBGP Established" });
  fab.state(L1, "Established", "done");
  fab.state(L3, "Established", "done");
  fab.set({ "BGP session": "Established", "IS-IS adjacencies": "2 of 2 up" });
  fab.note(
    vxlan
      ? `The session reaches Established, both sides in AS 65000, and the OPEN messages negotiated the L2VPN EVPN address family (AFI 25, SAFI 70) besides plain IPv4. The dashed line is a TCP connection, not a cable: its packets physically travel through spine1.ams.`
      : `The TCP handshake completes, OPEN and KEEPALIVE messages are exchanged with both sides in AS 65000, and the session reaches Established. The dashed line is a TCP connection, not a cable: every one of its packets physically travels through spine1.ams.`,
    "session",
  );

  if (!vxlan) {
    fab.headers([
      { name: "IPv4", size: 20, reader: "every router on the way", fields: { src: lo3, dst: lo1, TTL: 64, protocol: "6 (TCP)" } },
      { name: "TCP", size: 20, reader: "leaf1.ams only", fields: { "src port": 179, "dst port": 50211, flags: "ACK PSH" } },
      update("BGP UPDATE", { NLRI: "10.1.2.0/24", ORIGIN: "IGP", AS_PATH: asPath(), NEXT_HOP: lo3, LOCAL_PREF: 100 }),
    ]);
    fab.state(L3, "advertising", "active");
    fab.hop(
      [L3, S1, L1],
      "UPDATE 10.1.2.0/24",
      [
        `leaf3.ams advertises Acme's subnet 10.1.2.0/24, where acme-db1 lives, with NEXT_HOP set to its own loopback ${lo3} and an empty AS_PATH because it originates the route inside AS 65000. spine1.ams forwards the UPDATE as ordinary TCP payload to ${lo1}; it never reads it.`,
        `The UPDATE reaches leaf1.ams with its IP TTL one lower, 63, the only change spine1.ams made. spine1.ams has carried the only message that mentions 10.1.2.0/24 and kept no copy, because a router without BGP has nothing that could read it.`,
      ],
      { each: (i) => i === 1 && fab.patchHeader("IPv4", { TTL: 63 }) },
    );
    fab.state(L3, "Established", "done");
    fab.headers(undefined);
    fab.table(0, { title: `${L1} BGP table`, head: ["prefix", "NEXT_HOP", "resolved via IS-IS"], rows: [["10.1.2.0/24", lo3, `${lo3}/32 → ${a.spine} (spine1)`]], tones: ["done"] });
    fab.table(1, { title: `${L1} FIB`, head: ["prefix", "next hop", "out"], rows: [["10.1.1.0/24", "connected", "VLAN 100"], ["10.1.2.0/24", `${a.spine} (spine1)`, "to spine1"]], tones: [undefined, "active"] });
    fab.note(
      `leaf1.ams installs the route. The BGP next hop ${lo3} is not on a connected link, so it resolves it recursively: IS-IS says ${lo3}/32 is reached through ${a.spine}, spine1.ams. The FIB entry becomes "10.1.2.0/24 via ${a.spine}": the packet will be handed to the spine.`,
      "resolve",
    );

    fab.set({ "prefixes received": 1, "next hop resolvable": "yes" });
    fab.note(
      `Every check a protocol dashboard runs is green: the BGP session is Established with one prefix received, both IS-IS adjacencies are up, and the next hop resolves. Nothing here has looked at whether spine1.ams can forward a packet for 10.1.2.0/24.`,
      "green",
    );

    const ip = (ttl: number): HeaderSpec => ({ name: "IPv4", size: 20, reader: "every router", fields: { src: web.ip, dst: db.ip, TTL: ttl, protocol: "6 (TCP)" } });
    const tcp: HeaderSpec = { name: "TCP", size: 40, reader: "acme-db1 only", fields: { "src port": 51514, "dst port": 5432, flags: "SYN" } };
    fab.headers([{ name: "Ethernet", size: 14, reader: "this link only", fields: { "dst MAC": ANYCAST_GW_MAC, "src MAC": web.mac } }, ip(64), tcp], `on the link acme-web1 → ${L1}`);
    fab.path(["acme-web1", L1]);
    fab.send("acme-web1", L1, "SYN to 10.1.2.20", `acme-web1 opens a connection to acme-db1 at 10.1.2.20, port 5432. The destination is off its subnet, so the frame goes to its gateway leaf1.ams with TTL 64.`);

    fab.table(0, { title: `${L1} FIB`, head: ["prefix", "next hop", "out"], rows: [["10.1.1.0/24", "connected", "VLAN 100"], ["10.1.2.0/24", `${a.spine} (spine1)`, "to spine1"]], tones: [undefined, "active"] });
    fab.table(1, undefined);
    fab.headers([{ name: "Ethernet", size: 14, reader: "this link only", fields: { "dst MAC": fab.portMac(S1, L1), "src MAC": fab.portMac(L1, S1) } }, ip(63), tcp], `on the link ${L1} → ${S1}`);
    fab.path([L1, S1]);
    fab.send(L1, S1, "SYN to 10.1.2.20, TTL 63", `leaf1.ams matches 10.1.2.0/24 in its FIB, decrements the TTL to 63 and sends the packet to spine1.ams, exactly as BGP and IS-IS told it to. The destination IP is still 10.1.2.20: nothing in the packet mentions leaf3.ams.`);

    fab.headers([ip(63), tcp], `inside ${S1}`);
    fab.table(0, { title: `${S1} lookup for 10.1.2.20`, head: ["prefix", "next hop", "covers 10.1.2.20?"], rows: spineRib.map((r) => [r[0]!, r[1]!, "no"]), tones: spineRib.map(() => "danger" as const) });
    fab.state(S1, "no route", "danger");
    fab.note(
      `spine1.ams looks up 10.1.2.20. None of its four routes covers it, and it has no default route, because the only router that knows 10.1.2.0/24 is a BGP speaker and spine1.ams is not one.`,
      "lookup",
    );

    fab.set({ "spine1 no-route discards": 1 });
    fab.send(
      S1,
      L3,
      "SYN to 10.1.2.20",
      `So spine1.ams discards the packet and counts a no-route drop. It would normally send ICMP "destination unreachable" back to 10.1.1.10, but it has no route to 10.1.1.0/24 either, so even the error message has nowhere to go. acme-web1 hears nothing and retries its SYN, on Linux defaults six times over about 127 seconds, before the application sees a timeout.`,
      { lost: true, progress: 0.15 },
    );

    fab.headers(undefined);
    fab.clearPath();
    fab.linkSet(L1, L3, { tone: "done" });
    fab.table(0, { title: "Two views of the same moment", head: ["signal", "says"], rows: [["BGP session leaf1–leaf3", "Established, 1 prefix"], ["IS-IS adjacencies", "2 of 2 up"], ["next hop 10.255.1.13", "resolvable"], ["acme-web1 → acme-db1", "every packet dropped"], ["traceroute from acme-web1", "10.1.1.1, then * * *"]], tones: ["done", "done", "done", "danger", "danger"] });
    fab.note(
      `This is the trap: the control plane is healthy while the data plane drops every packet. traceroute from acme-web1 shows its gateway 10.1.1.1 and then only stars, because spine1.ams's Time Exceeded replies cannot route back either, which is why "session Established" is not a health check.`,
      "trap",
    );

    fab.set({ fixes: "BGP on R2, or encapsulation" });
    fab.note(
      `There are two fixes. Run BGP on spine1.ams too, so it learns 10.1.2.0/24 itself and installs it in its FIB (in a large fabric through route reflectors, because an iBGP router does not pass on what it learned from another iBGP router); or encapsulate the packet towards ${lo3} with an MPLS label or a VXLAN header, so the spine only needs the loopback route it already has. Meridian's fabric uses VXLAN for exactly this reason.`,
      "fix",
    );
    return fab.f.done();
  }

  // ----- variant: vxlan -----
  const rmac3 = fab.portMac(L3, "router-mac");
  const rmac1 = fab.portMac(L1, "router-mac");
  fab.headers([update("BGP UPDATE (EVPN)", { route: "type 5, IP prefix 10.1.2.0/24", RD: `${lo3}:50001`, NEXT_HOP: lo3, "route target": "65000:50001", encapsulation: "VXLAN", VNI: 50001, "router MAC": rmac3 }, ["VNI"])], `carried over the iBGP session ${L3} → ${L1}`);
  fab.send(
    L3,
    L1,
    "EVPN type-5 10.1.2.0/24",
    `leaf3.ams advertises 10.1.2.0/24 as an EVPN type-5 (IP prefix) route: route distinguisher ${lo3}:50001, route target 65000:50001 for VRF ACME, next hop its loopback ${lo3}, encapsulation VXLAN, VNI 50001 (Acme's L3VNI) and its own router MAC. The UPDATE still crosses spine1.ams as plain TCP that the spine never reads.`,
  );

  fab.headers(undefined);
  fab.table(0, { title: `${L1} VRF ACME routes`, head: ["prefix", "next hop", "how"], rows: [["10.1.1.0/24", "connected", "VLAN 100"], ["10.1.2.0/24", `VTEP ${lo3}`, "VXLAN, VNI 50001"]], tones: [undefined, "active"] });
  fab.table(1, { title: `${L1} underlay (IS-IS)`, head: ["prefix", "next hop"], rows: [[`${lo3}/32`, `${a.spine} (spine1)`]], tones: ["done"] });
  fab.note(
    `leaf1.ams imports the route into VRF ACME because the route target matches. The route says "send to VTEP ${lo3} with VNI 50001", and the underlay route to ${lo3}/32 goes through spine1.ams, so this time the packet will be addressed to a place the spine knows.`,
    "resolve",
  );

  const outerSport = 49152 + (fnv32(`${web.ip}|${db.ip}|6|51514|5432`) % 16384);
  const inner = (ttl: number, dst: string, src: string): HeaderSpec[] => [
    { name: "Ethernet", size: 14, reader: "the next device at this layer", fields: { "dst MAC": dst, "src MAC": src } },
    { name: "IPv4", size: 20, reader: "the two leaves", fields: { src: web.ip, dst: db.ip, TTL: ttl, protocol: "6 (TCP)" } },
    { name: "TCP", size: 40, reader: "acme-db1 only", fields: { "src port": 51514, "dst port": 5432, flags: "SYN" } },
  ];
  const outer = (ttl: number, dstMac: string, srcMac: string): HeaderSpec[] => [
    { name: "Outer Ethernet", size: 14, tone: "path", reader: "this link only", fields: { "dst MAC": dstMac, "src MAC": srcMac } },
    { name: "Outer IPv4", size: 20, tone: "path", reader: "spine1.ams and leaf3.ams", fields: { src: lo1, dst: lo3, TTL: ttl, protocol: "17 (UDP)" } },
    { name: "Outer UDP", size: 8, tone: "path", reader: "leaf3.ams", fields: { "src port": outerSport, "dst port": 4789 } },
    { name: "VXLAN", size: 8, tone: "path", reader: "leaf3.ams", fields: { VNI: 50001 }, highlight: ["VNI"] },
  ];
  fab.headers(inner(64, ANYCAST_GW_MAC, web.mac), `on the link acme-web1 → ${L1}`);
  fab.path(["acme-web1", L1]);
  fab.send("acme-web1", L1, "SYN to 10.1.2.20", `acme-web1 sends the same SYN to 10.1.2.20 as before, to its gateway MAC with TTL 64. Nothing on the host changes; the fix is entirely inside the fabric.`);

  fab.headers([...outer(64, fab.portMac(S1, L1), fab.portMac(L1, S1)), ...inner(63, rmac3, rmac1)], `leaving ${L1}`);
  fab.state(L1, "encapsulate", "active");
  fab.note(
    `leaf1.ams routes the packet in VRF ACME (inner TTL 64 to 63, inner MACs now leaf1's and leaf3's router MACs) and wraps it: VXLAN with VNI 50001, UDP to port 4789, and an outer IPv4 header from ${lo1} to ${lo3}. The outer destination is leaf3's loopback, an address IS-IS carries.`,
    "encap",
  );

  fab.state(L1, "Established", "done");
  fab.path([L1, S1]);
  fab.at(`on the link ${L1} → ${S1}`);
  fab.send(L1, S1, `UDP 4789 to ${lo3}`, `The tunnelled packet goes up to spine1.ams. To the spine it is a UDP packet between two loopbacks; 10.1.2.20 is buried in the payload.`);

  fab.headers([...outer(63, fab.portMac(L3, S1), fab.portMac(S1, L3)), ...inner(63, rmac3, rmac1)], `leaving ${S1}`);
  fab.table(0, { title: `${S1} lookup for outer dst ${lo3}`, head: ["prefix", "next hop", "source"], rows: spineRib, tones: [undefined, "active", undefined, undefined] });
  fab.table(1, undefined);
  fab.state(S1, "forwarding", "active");
  fab.note(
    `spine1.ams looks up the outer destination ${lo3}, matches its IS-IS route ${lo3}/32 via ${c.leaf}, decrements the outer TTL to 63 and forwards. It has exactly the same four routes as in the broken design and still no route for 10.1.2.0/24; it no longer needs one.`,
    "underlay",
  );

  fab.state(S1, "R2 · IS-IS only", "done");
  fab.path([S1, L3]);
  fab.at(`on the link ${S1} → ${L3}`);
  fab.send(S1, L3, `UDP 4789 to ${lo3}`, `The packet reaches leaf3.ams, the owner of the outer destination address.`);

  fab.headers(inner(62, db.mac, ANYCAST_GW_MAC), `leaving ${L3}`);
  fab.table(0, { title: `${L3} VRF ACME (VNI 50001)`, head: ["prefix", "next hop", "how"], rows: [["10.1.2.0/24", "connected", "VLAN 200"], ["10.1.1.0/24", `VTEP ${lo1}`, "VXLAN, VNI 50001"]], tones: ["active", undefined] });
  fab.state(L3, "decapsulate", "active");
  fab.note(
    `leaf3.ams strips the outer headers, maps VNI 50001 to VRF ACME and looks up 10.1.2.20 there: connected on VLAN 200. It decrements the inner TTL to 62 and writes an Ethernet header from the subnet's gateway MAC ${ANYCAST_GW_MAC} to acme-db1's MAC ${db.mac}.`,
    "decap",
  );

  fab.state(L3, "Established", "done");
  fab.path([L3, "acme-db1"]);
  fab.at(`on the link ${L3} → acme-db1`);
  fab.headers(inner(62, db.mac, ANYCAST_GW_MAC), `on the link ${L3} → acme-db1`);
  fab.send(L3, "acme-db1", "SYN to 10.1.2.20, TTL 62", `acme-db1 receives the SYN and answers. The path is the same three routers as in the broken design; the only change is what spine1.ams was asked to look up.`, { tone: "done" });

  fab.headers(undefined);
  fab.clearPath();
  fab.set({ "spine1 routes for 10.1.2.0/24": "none, and none needed" });
  fab.note(
    `Encapsulation turned "find 10.1.2.20" into "find ${lo3}", a question the IGP answers on every router. MPLS does the same with a label bound to leaf3's loopback; either way the transit routers stay free of customer routes, which is why Meridian's spines run IS-IS and nothing else.`,
    "done",
  );
  return fab.f.done();
};

// ---------- community-policy ----------

const CUST = 64505;
const CUST_NET = "198.51.100.0/24";
const PEER_NET = "192.0.2.0/24";
const MERIDIAN_NET = "203.0.113.0/24";

/**
 * `community-policy` (lesson 05-01). Meridian (AS 64500) at its Amsterdam
 * edge: gw1.ams talks eBGP to a BGP customer (AS 64505, 198.51.100.0/24) and
 * to its transit provider ISP1 (AS 64501); gw2.ams to a settlement-free peer,
 * the content network AS 64511 (192.0.2.0/24); gw1 and gw2 talk iBGP. Import
 * policy tags each route with where it came from (64500:100 customer,
 * 64500:200 peer, 64500:300 transit) and sets LOCAL_PREF 200/150/100; export
 * policy towards peers and transit matches only Meridian's own prefix and
 * 64500:100, and strips Meridian's internal tags. The customer also sends
 * 198.51.100.128/25 marked NO_EXPORT (65535:65281): it reaches both gateways
 * over iBGP and stops at the edge of AS 64500.
 *
 * Inputs: none. 14 frames.
 */
export const communityPolicy: FabGen = () => {
  const G1 = "gw1.ams";
  const G2 = "gw2.ams";
  const fab = new Fab(
    [
      { id: "isp1", label: "ISP1", kind: "isp", x: 20, y: 0, state: `AS ${AS.isp1}` },
      { id: "content", label: "Content net", kind: "isp", x: 80, y: 0, state: `AS ${AS.content}` },
      { id: G1, kind: "gw", x: 20, y: 50, state: `AS ${AS.meridian}` },
      { id: G2, kind: "gw", x: 80, y: 50, state: `AS ${AS.meridian}` },
      { id: "customer", label: "Customer", kind: "isp", x: 20, y: 100, state: `AS ${CUST}` },
    ],
    [
      ["isp1", G1, { label: "transit (Meridian pays)" }],
      ["content", G2, { label: "peering (no fee)" }],
      [G1, G2, { dashed: true, label: "iBGP, AS 64500" }],
      ["customer", G1, { label: "customer (pays Meridian)" }],
    ],
  );
  fab.set({ Meridian: `AS ${AS.meridian}, ${MERIDIAN_NET}` });
  fab.note(
    `Meridian's Amsterdam edge: two border gateways in AS 64500, joined by iBGP. gw1.ams has a customer (AS 64505, which pays Meridian) and a transit provider, ISP1 (AS 64501, which Meridian pays); gw2.ams has a peer, the content network AS 64511, which exchanges traffic with Meridian for free.`,
    "topology",
  );

  fab.table(1, {
    title: "Meridian's community plan",
    head: ["community", "on the wire", "means"],
    rows: [
      ["64500:100", "0xFBF40064", "learned from a customer"],
      ["64500:200", "0xFBF400C8", "learned from a peer"],
      ["64500:300", "0xFBF4012C", "learned from transit"],
      ["NO_EXPORT", "0xFFFFFF01", "never send to another AS"],
    ],
  });
  fab.note(
    `A community is a 32-bit tag a route carries in its COMMUNITIES attribute, written as two 16-bit halves, ASN:value, so 64500:100 is 0xFBF40064 (a network with a 4-byte ASN uses large communities instead, three 32-bit parts). Meridian's plan records where each route entered the network; NO_EXPORT (65535:65281) is one of the well-known values every BGP implementation must obey.`,
    "plan",
  );

  fab.headers([update("BGP UPDATE", { NLRI: CUST_NET, AS_PATH: asPath(CUST), NEXT_HOP: "AS 64505's link address", COMMUNITIES: "none" })], "sent by AS 64505");
  fab.path(["customer", G1]);
  fab.send("customer", G1, `UPDATE ${CUST_NET}`, `The customer announces its block ${CUST_NET} with AS_PATH 64505 and no communities. Everything Meridian decides about this route from here on happens in policy, not in the UPDATE itself.`);

  const importRows = [
    ["customer AS 64505", "prefix in 198.51.100.0/24, up to /25", "64500:100", 200],
    ["peer AS 64511", "prefix in 192.0.2.0/24", "64500:200", 150],
    ["transit ISP1", "any, except bogons and 203.0.113.0/24", "64500:300", 100],
  ];
  fab.table(0, { title: "Import policy: match, then set", head: ["session", "match", "add community", "LOCAL_PREF"], rows: importRows.slice(0, 1), tones: ["active"] });
  fab.patchHeader("BGP UPDATE", { COMMUNITIES: "64500:100", LOCAL_PREF: 200 });
  fab.at(`after ${G1}'s import policy`);
  fab.state(G1, "import policy", "active");
  fab.note(
    `gw1.ams applies the import policy for this session. A policy is a list of match conditions and set actions: the prefix is inside the customer's registered block, so it is accepted, tagged 64500:100 and given LOCAL_PREF 200, which makes customer routes win over any other path to the same prefix.`,
    "import",
  );

  fab.headers([update("BGP UPDATE", { NLRI: "198.51.100.128/25", AS_PATH: asPath(CUST), NEXT_HOP: "AS 64505's link address", COMMUNITIES: "NO_EXPORT" })], "sent by AS 64505");
  fab.send(
    "customer",
    G1,
    "UPDATE /25, NO_EXPORT",
    `The customer also sends a more-specific, 198.51.100.128/25, marked NO_EXPORT itself. It wants Meridian to use this /25 internally, for example to choose which of the customer's links carries that half, without the extra route spreading to the rest of the internet.`,
  );

  fab.patchHeader("BGP UPDATE", { COMMUNITIES: "NO_EXPORT 64500:100", LOCAL_PREF: 200 });
  fab.at(`after ${G1}'s import policy`);
  fab.note(
    `The same import policy accepts the /25 (the match allows up to /25 inside the customer's block) and adds 64500:100. Communities are a list, so the route now carries both tags: the customer's NO_EXPORT and Meridian's own.`,
    "import",
  );

  fab.state(G1, `AS ${AS.meridian}`);
  fab.tone(G1);
  fab.clearPath();
  fab.table(0, { title: "Import policy: match, then set", head: ["session", "match", "add community", "LOCAL_PREF"], rows: importRows.slice(0, 2), tones: [undefined, "active"] });
  fab.headers([update("BGP UPDATE", { NLRI: PEER_NET, AS_PATH: asPath(AS.content), NEXT_HOP: "AS 64511's link address", COMMUNITIES: "64500:200", LOCAL_PREF: 150 })], `after ${G2}'s import policy`);
  fab.path(["content", G2]);
  fab.send("content", G2, `UPDATE ${PEER_NET}`, `On gw2.ams the peer announces ${PEER_NET}. The import policy for the peering session tags it 64500:200 and sets LOCAL_PREF 150: preferred over transit, below customers.`);

  fab.table(0, { title: "Import policy: match, then set", head: ["session", "match", "add community", "LOCAL_PREF"], rows: importRows, tones: [undefined, undefined, "active"] });
  fab.headers([update("BGP UPDATE", { NLRI: "≈1M prefixes (full table)", AS_PATH: `${AS.isp1} …`, NEXT_HOP: "ISP1's address", COMMUNITIES: "64500:300", LOCAL_PREF: 100 })], `after ${G1}'s import policy`);
  fab.path(["isp1", G1]);
  fab.send("isp1", G1, "full table", `ISP1 sends gw1.ams the full internet table, roughly a million IPv4 prefixes. Every one is tagged 64500:300 with LOCAL_PREF 100, so later policy can treat a million routes as one group by matching a single tag instead of a million prefixes.`);

  fab.clearPath();
  fab.headers(undefined);
  const rib: (string | number)[][] = [
    [MERIDIAN_NET, "Meridian itself", "none", "-"],
    [CUST_NET, "customer, gw1", "64500:100", 200],
    ["198.51.100.128/25", "customer, gw1", "NO_EXPORT 64500:100", 200],
    [PEER_NET, "peer, gw2", "64500:200", 150],
    ["full table", "ISP1, gw1", "64500:300", 100],
  ];
  fab.table(0, { title: "BGP table on both gateways", head: ["prefix", "learned from", "communities", "LOCAL_PREF"], rows: rib });
  fab.linkSet(G1, G2, { tone: "active" });
  fab.packets(
    [
      { from: G1, to: G2, label: "customer + transit routes", progress: 0.35 },
      { from: G2, to: G1, label: "peer route", progress: 0.35 },
    ],
    `Over iBGP each gateway gives the other every best path it learned from outside AS 64500, communities and LOCAL_PREF intact (some platforms send communities only once the session is told to), so both hold the same table. NO_EXPORT allows this: it forbids sending the route out of AS 64500, not around inside it.`,
    "ibgp",
  );

  fab.linkSet(G1, G2, { tone: undefined });
  const exportRows = (to: string) =>
    rib.map((r) => {
      const c = String(r[2]);
      const verdict = c.includes("NO_EXPORT") ? "kept in: NO_EXPORT" : c === "none" || c === "64500:100" ? "send" : `deny: ${c} not allowed to ${to}`;
      return [String(r[0]), c, verdict];
    });
  const exportTones = (rows: string[][]): Tone[] => rows.map((r) => (r[2] === "send" ? "done" : "danger"));
  const toPeer = exportRows("a peer");
  fab.table(0, { title: `${G2} export to the peer AS 64511`, head: ["prefix", "communities", "verdict"], rows: toPeer, tones: exportTones(toPeer) });
  fab.state(G2, "export policy", "active");
  fab.note(
    `gw2.ams's export policy towards the peer matches tags, not prefixes: send Meridian's own ${MERIDIAN_NET} and anything tagged 64500:100, deny the rest. The peer route and the full table are denied, and the NO_EXPORT /25 is held back whatever the policy says, because BGP itself enforces that well-known community.`,
    "export",
  );

  fab.path([G2, "content"]);
  fab.headers(
    [
      update("BGP UPDATE 1", { NLRI: MERIDIAN_NET, AS_PATH: asPath(AS.meridian), NEXT_HOP: "gw2.ams's address", COMMUNITIES: "none" }),
      update("BGP UPDATE 2", { NLRI: CUST_NET, AS_PATH: asPath(AS.meridian, CUST), NEXT_HOP: "gw2.ams's address", COMMUNITIES: "none (64500:100 removed)" }),
    ],
    `sent by ${G2} to AS 64511`,
  );
  fab.send(G2, "content", "2 UPDATEs", `gw2.ams sends the peer two UPDATE messages, because one UPDATE carries one set of path attributes: ${MERIDIAN_NET} with AS_PATH 64500, and ${CUST_NET} with AS_PATH 64500 64505. It removes Meridian's internal 64500:x tags on the way out, since they mean nothing to another network.`);

  fab.state(G2, `AS ${AS.meridian}`);
  fab.tone(G2);
  fab.clearPath();
  fab.headers(undefined);
  const toIsp = exportRows("transit");
  fab.table(0, { title: `${G1} export to transit ISP1`, head: ["prefix", "communities", "verdict"], rows: toIsp, tones: exportTones(toIsp) });
  fab.state(G1, "export policy", "active");
  fab.path([G1, "isp1"]);
  fab.send(
    G1,
    "isp1",
    "2 routes",
    `gw1.ams applies the same rule towards ISP1 and sends the same two routes. Denying 64500:200 keeps Meridian from offering ISP1 a path to its peer's ${PEER_NET}; otherwise ISP1 could send that traffic across the link Meridian pays for, and Meridian would be giving ISP1 free transit to its peer (lesson 05-03).`,
  );

  fab.state(G1, `AS ${AS.meridian}`);
  fab.tone(G1);
  fab.clearPath();
  fab.path([G1, "customer"]);
  fab.table(0, {
    title: `${G1} export to the customer AS 64505`,
    head: ["prefix", "communities", "verdict"],
    rows: [
      [MERIDIAN_NET, "none", "send"],
      [CUST_NET, "64500:100", "skip: AS 64505 already in AS_PATH"],
      ["198.51.100.128/25", "NO_EXPORT 64500:100", "kept in: NO_EXPORT"],
      [PEER_NET, "64500:200", "send"],
      ["full table", "64500:300", "send"],
    ],
    tones: ["done", "muted", "danger", "done", "done"],
  });
  fab.send(G1, "customer", "full table + peer + own", `Towards the customer the policy is the opposite: a customer pays for the whole internet, so gw1.ams sends the full table, the peer's route and Meridian's own. It skips the customer's own routes, which the customer would reject anyway because its AS is in the path, and never sends the NO_EXPORT /25, because a customer is another AS too.`);

  fab.clearPath();
  fab.table(0, {
    title: "What each neighbour received",
    head: ["neighbour", "received", "never received"],
    rows: [
      ["peer AS 64511", `${MERIDIAN_NET}, ${CUST_NET}`, "transit, peer, /25"],
      ["transit ISP1", `${MERIDIAN_NET}, ${CUST_NET}`, "transit, peer, /25"],
      ["customer AS 64505", "full table, peer, own", "its own routes"],
    ],
  });
  fab.table(1, undefined);
  fab.set({ "tags set at": "import (where the route entered)", "tags read at": "export (where it leaves)" });
  fab.note(
    `Tag at ingress, act at egress: each route was classified once, on the session where it entered, and every export decision afterwards matched one tag. The NO_EXPORT /25 stayed inside AS 64500 on both gateways without any prefix list mentioning it.`,
    "done",
  );
  return fab.f.done();
};

// ---------- two-isp-te ----------

/**
 * `two-isp-te` (lesson 05-02). The two-ISP problem worked end to end:
 * Meridian (AS 64500, 203.0.113.0/24) with gw1.ams on ISP1 (AS 64501) and
 * gw2.ams on ISP2 (AS 64502); ISP1 and ISP2 peer with each other and both
 * reach the content network AS 64511 (192.0.2.0/24). Goal: use ISP1 for
 * both directions and fail over to ISP2.
 * Egress: without policy each gateway prefers its own eBGP route (eBGP beats
 * iBGP) and traffic leaves by both; LOCAL_PREF 200 on ISP1's routes makes
 * every router in AS 64500 exit via gw1.
 * Ingress: AS 64511 sees two equal-length paths and picks ISP2 by its own
 * tie-breakers; prepending 64500 twice towards ISP2 moves it to ISP1, but ISP2
 * still prefers its customer route (LOCAL_PREF beats path length) until
 * Meridian sends ISP2's published community 64502:70 ("set LOCAL_PREF 70");
 * finally two /25s announced only to ISP1 win by longest-prefix match
 * everywhere (with the caveat that on the real internet a /25 is filtered,
 * so production uses two /24s out of a /23).
 * Failover: the gw1–ISP1 link fails; egress and ingress both move to ISP2.
 *
 * Inputs: none. 14 frames.
 */
export const twoIspTe: FabGen = () => {
  const G1 = "gw1.ams";
  const G2 = "gw2.ams";
  const fab = new Fab(
    [
      { id: "content", label: "AS 64511", kind: "cloud", x: 50, y: 0, state: PEER_NET },
      { id: "isp1", label: "ISP1", kind: "isp", x: 18, y: 35, state: `AS ${AS.isp1}` },
      { id: "isp2", label: "ISP2", kind: "isp", x: 82, y: 35, state: `AS ${AS.isp2}` },
      { id: G1, kind: "gw", x: 18, y: 70 },
      { id: G2, kind: "gw", x: 82, y: 70 },
      { id: "meridian", label: "Meridian", kind: "server", x: 50, y: 100, state: MERIDIAN_NET },
    ],
    [
      ["content", "isp1"],
      ["content", "isp2"],
      ["isp1", "isp2", { label: "peering" }],
      ["isp1", G1, { label: "ISP1 link" }],
      ["isp2", G2, { label: "ISP2 link" }],
      [G1, G2, { dashed: true, label: "iBGP" }],
      [G1, "meridian"],
      [G2, "meridian"],
    ],
    { height: 330 },
  );
  const paths = (rows: (string | number)[][], best: number) => rows.map((_, i) => (i === best ? "done" : undefined)) as (Tone | undefined)[];
  fab.set({ goal: "ISP1 both ways, ISP2 as backup" });
  fab.note(
    `Meridian (AS 64500, ${MERIDIAN_NET}) buys transit from two ISPs: gw1.ams connects to ISP1 (AS 64501), gw2.ams to ISP2 (AS 64502). The goal interviewers ask for: use ISP1 for traffic in both directions and fall back to ISP2 only if ISP1 fails, shown here for traffic to and from AS 64511.`,
    "topology",
  );

  // ----- egress -----
  const egressRows = (lpIsp1: number): (string | number)[][] => [
    ["own eBGP, ISP2", asPath(AS.isp2, AS.content), 100, "eBGP"],
    ["iBGP from gw1 (ISP1)", asPath(AS.isp1, AS.content), lpIsp1, "iBGP"],
  ];
  fab.table(0, { title: `${G2} paths to ${PEER_NET}`, head: ["path", "AS_PATH", "LOCAL_PREF", "type"], rows: egressRows(100), tones: paths(egressRows(100), 0) });
  fab.packets(
    [
      { from: "meridian", to: G1, label: "out via gw1", progress: 0.5 },
      { from: "meridian", to: G2, label: "out via gw2", progress: 0.5 },
    ],
    `Without policy both paths to ${PEER_NET} tie on LOCAL_PREF (100), AS_PATH length (2) and ORIGIN, and MED is not compared because the paths come from different neighbouring ASes. The next step, eBGP over iBGP, makes each gateway keep its own ISP, so outbound traffic leaves by whichever gateway is closer.`,
    "egress",
  );

  fab.table(0, { title: `${G1} import policy for ISP1`, head: ["match", "set"], rows: [["every route from ISP1", "LOCAL_PREF 200"]], tones: ["active"] });
  fab.state(G1, "LP 200 on ISP1", "active");
  fab.note(
    `The fix for outbound traffic is one line of import policy on gw1.ams: every route learned from ISP1 gets LOCAL_PREF 200. LOCAL_PREF is carried to every router inside AS 64500 over iBGP and is the first attribute in the decision process that all implementations share.`,
    "egress",
  );

  fab.state(G1, undefined);
  fab.tone(G1);
  fab.table(0, { title: `${G2} paths to ${PEER_NET}`, head: ["path", "AS_PATH", "LOCAL_PREF", "type"], rows: egressRows(200), tones: paths(egressRows(200), 1) });
  fab.path(["meridian", G1, "isp1", "content"]);
  fab.set({ egress: "ISP1 (LOCAL_PREF 200)" });
  fab.send("meridian", G1, "out via ISP1", `Now gw2.ams compares 200 with 100 and prefers the path through gw1.ams before it ever reaches the eBGP-over-iBGP step, so every router in AS 64500 exits via ISP1. Outbound is fully under Meridian's control because Meridian makes the decision.`);

  // ----- ingress -----
  fab.clearPath();
  const inRows = (ispTwoPath: string): (string | number)[][] => [
    ["via ISP1", asPath(AS.isp1, AS.meridian), 2],
    ["via ISP2", ispTwoPath, ispTwoPath.split(" ").length],
  ];
  fab.table(0, { title: `AS 64511's paths to ${MERIDIAN_NET}`, head: ["path", "AS_PATH", "length"], rows: inRows(asPath(AS.isp2, AS.meridian)), tones: paths(inRows(asPath(AS.isp2, AS.meridian)), 1) });
  fab.path(["content", "isp2", G2, "meridian"]);
  fab.send(
    "content",
    "isp2",
    "in via ISP2",
    `Inbound is decided by other networks. Meridian announces ${MERIDIAN_NET} with AS_PATH 64500 to both ISPs, AS 64511 sees two paths of length 2, and its own tie-breakers (oldest path, then lowest router ID) happen to pick ISP2. Traffic leaves by ISP1 and returns by ISP2.`,
  );

  fab.clearPath();
  fab.headers([update("BGP UPDATE to ISP2", { NLRI: MERIDIAN_NET, AS_PATH: asPath(AS.meridian, AS.meridian, AS.meridian), NEXT_HOP: "gw2.ams's address" }, ["AS_PATH"])], `sent by ${G2}`);
  fab.path([G2, "isp2"]);
  fab.send(G2, "isp2", "AS_PATH 64500 64500 64500", `First tool, prepending: gw2.ams adds its own AS twice more to what it sends ISP2, so the path through ISP2 looks two networks longer. It is still a valid path; it just loses the AS_PATH-length comparison wherever that comparison is reached.`);

  fab.headers(undefined);
  fab.clearPath();
  const prep = asPath(AS.isp2, AS.meridian, AS.meridian, AS.meridian);
  fab.table(0, { title: `AS 64511's paths to ${MERIDIAN_NET}`, head: ["path", "AS_PATH", "length"], rows: inRows(prep), tones: paths(inRows(prep), 0) });
  fab.path(["content", "isp1", G1, "meridian"]);
  fab.send("content", "isp1", "in via ISP1", `AS 64511 now compares length 2 through ISP1 with length 4 through ISP2 and moves to ISP1. MED could not have done this: it is compared only between paths from the same neighbouring AS (it is for choosing between two links to one ISP), and these come from two different ISPs.`);

  fab.clearPath();
  const isp2Rows = (lpCust: number): (string | number)[][] => [
    ["customer Meridian", prep.split(" ").slice(1).join(" "), lpCust],
    ["peer ISP1", asPath(AS.isp1, AS.meridian), 100],
  ];
  fab.table(0, { title: `ISP2's paths to ${MERIDIAN_NET}`, head: ["from", "AS_PATH", "LOCAL_PREF"], rows: isp2Rows(200), tones: paths(isp2Rows(200), 0) });
  fab.path(["isp2", G2, "meridian"]);
  fab.send(
    "isp2",
    G2,
    "ISP2's customers",
    `Prepending has a limit. ISP2 itself gives routes from its paying customers LOCAL_PREF 200 and routes from peers 100, and LOCAL_PREF is compared before path length, so ISP2 keeps the direct path to Meridian and everything ISP2's own customers send still arrives via gw2.ams.`,
  );

  fab.clearPath();
  fab.headers([update("BGP UPDATE to ISP2", { NLRI: MERIDIAN_NET, AS_PATH: prep.split(" ").slice(1).join(" "), COMMUNITIES: "64502:70" }, ["COMMUNITIES"])], `sent by ${G2}`);
  fab.table(0, { title: `ISP2's paths to ${MERIDIAN_NET}`, head: ["from", "AS_PATH", "LOCAL_PREF"], rows: isp2Rows(70), tones: paths(isp2Rows(70), 1) });
  fab.send(
    G2,
    "isp2",
    "community 64502:70",
    `Second tool, the upstream's own communities: ISP2 publishes that a customer route tagged 64502:70 gets LOCAL_PREF 70 inside AS 64502, as real transit providers do (one large transit network, AS 3356, documents 3356:70 for the same thing). Meridian tags its announcement, 70 is now below ISP2's peer value of 100, and ISP2 itself sends traffic for Meridian over its peering with ISP1.`,
  );

  fab.headers(undefined);
  fab.table(0, {
    title: `What Meridian announces`,
    head: ["prefix", "to ISP1", "to ISP2"],
    rows: [[MERIDIAN_NET, "yes", "yes (prepended, 64502:70)"], ["203.0.113.0/25", "yes", "no"], ["203.0.113.128/25", "yes", "no"]],
  });
  fab.table(1, { title: "AS 64511's FIB for 203.0.113.10", head: ["prefix", "via", "match"], rows: [["203.0.113.0/25", "ISP1", "longest, wins"], [MERIDIAN_NET, "ISP1", "shorter"]], tones: ["done", undefined] });
  fab.path(["content", "isp1", G1, "meridian"]);
  fab.packets(
    [{ from: "content", to: "isp1", label: "to 203.0.113.10", tone: "done" }],
    `Third tool, more-specifics: gw1.ams also announces the two halves, 203.0.113.0/25 and 203.0.113.128/25, to ISP1 only. Every router that accepts them sends all traffic for Meridian via ISP1 by longest-prefix match, whatever its LOCAL_PREF or path lengths say; on the real internet most networks drop IPv4 routes longer than /24, so in production this is two /24s split from a /23.`,
    "ingress",
  );

  fab.set({ egress: "ISP1 (LOCAL_PREF 200)", ingress: "ISP1 (/25s, prepend, 64502:70)" });
  fab.down("isp1", G1, "cut");
  fab.state(G1, "session down", "danger");
  fab.clearPath();
  fab.note(
    `Now the failure the design is for: the fibre between gw1.ams and ISP1 is cut. gw1.ams sees loss of light on the port and drops the eBGP session at once, and ISP1 does the same; a failure that leaves the light on, inside the carrier's network, would be noticed only by BFD or by the hold timer (90 seconds as RFC 4271 suggests, 180 on many platforms).`,
    "fail",
  );

  fab.table(0, { title: `${G2} paths to ${PEER_NET}`, head: ["path", "AS_PATH", "LOCAL_PREF", "type"], rows: [egressRows(100)[0]!], tones: ["done"] });
  fab.table(1, undefined);
  fab.path(["meridian", G2, "isp2", "content"]);
  fab.set({ egress: "ISP2 (only path left)" });
  fab.send("meridian", G2, "out via ISP2", `Outbound: gw1.ams withdraws its ISP1 routes over iBGP, the LOCAL_PREF 200 paths disappear, and gw2.ams's own route through ISP2 (LOCAL_PREF 100) becomes best. Outbound traffic moves within seconds.`);

  fab.clearPath();
  fab.table(0, { title: `AS 64511's paths to ${MERIDIAN_NET}`, head: ["path", "AS_PATH", "length"], rows: [["via ISP2", prep, 4]], tones: ["done"] });
  fab.path(["content", "isp2", G2, "meridian"]);
  fab.set({ ingress: "ISP2 (only path left)" });
  fab.send(
    "content",
    "isp2",
    "in via ISP2",
    `Inbound: ISP1 withdraws the /25s and the /24 it learned from Meridian, and every network falls back to the prepended /24 via ISP2. Prepending and LOCAL_PREF 70 make a path less preferred, never unusable, so the backup carries everything once it is the only path; the withdrawals take seconds to minutes to spread (lesson 05-05).`,
  );

  fab.clearPath();
  fab.table(0, {
    title: "Two directions, two levels of control",
    head: ["direction", "who decides", "Meridian's tools"],
    rows: [
      ["outbound", "Meridian", "LOCAL_PREF: exact control"],
      ["inbound", "every other AS", "prepend, upstream communities, more-specifics"],
    ],
  });
  fab.note(
    `Outbound, Meridian chooses its exit with LOCAL_PREF and the choice is exact. Inbound, every other network chooses with its own policy, so Meridian can only make one path look worse or more specific, and must measure where traffic actually arrives rather than assume it.`,
    "done",
  );
  return fab.f.done();
};

// ---------- valley-free ----------

/**
 * `valley-free` (lesson 05-03). The Gao-Rexford export rules on six
 * networks: a transit provider AS 64496 at the top; ISP1 (AS 64501) and ISP2
 * (AS 64502), both its customers and peers of each other; Meridian (AS 64500)
 * a customer of both ISPs; the content network AS 64511 a customer of ISP2;
 * Meridian's own BGP customer AS 64505. Providers are drawn above their
 * customers, peers side by side. Customer routes are exported to everyone,
 * peer and provider routes only to customers; LOCAL_PREF prefers customer
 * (200) over peer (150) over provider (100). The leak: Meridian's export
 * filter towards ISP1 is lost in a change, it re-announces 192.0.2.0/24 (learned
 * from ISP2) to ISP1, ISP1 prefers it as a customer route despite the longer
 * path, and ISP1's traffic for AS 64511 runs down into Meridian and back up
 * to ISP2: a valley. AS 64496 is not affected (the leaked path is longer and
 * both are customer routes there).
 *
 * Inputs: none. 12 frames.
 */
export const valleyFree: FabGen = () => {
  const M = "meridian";
  const fab = new Fab(
    [
      { id: "t1", label: "Transit", kind: "isp", x: 50, y: 0, state: `AS ${AS.transit}` },
      { id: "isp1", label: "ISP1", kind: "isp", x: 18, y: 36, state: `AS ${AS.isp1}` },
      { id: "isp2", label: "ISP2", kind: "isp", x: 82, y: 36, state: `AS ${AS.isp2}` },
      { id: M, label: "Meridian", kind: "gw", x: 50, y: 70, state: `AS ${AS.meridian}` },
      { id: "content", label: "Content net", kind: "isp", x: 90, y: 70, state: `AS ${AS.content}` },
      { id: "cust", label: "Customer", kind: "isp", x: 50, y: 100, state: `AS ${CUST}` },
    ],
    [
      ["t1", "isp1", { label: "transit" }],
      ["t1", "isp2", { label: "transit" }],
      ["isp1", "isp2", { label: "peering" }],
      ["isp1", M, { label: "transit" }],
      ["isp2", M, { label: "transit" }],
      ["isp2", "content", { label: "transit" }],
      [M, "cust", { label: "transit" }],
    ],
    { height: 340 },
  );
  fab.note(
    `Six networks and two kinds of link. On a transit link the lower network is the customer and pays the upper one, its provider, to reach the whole internet; on the peering link ISP1 and ISP2 exchange their own customers' traffic for free. Meridian is a customer of both ISPs and a provider to AS 64505.`,
    "topology",
  );

  fab.table(0, {
    title: "Export rule (Gao-Rexford)",
    head: ["route learned from", "to customers", "to peers", "to providers"],
    rows: [["a customer", "yes", "yes", "yes"], ["a peer", "yes", "no", "no"], ["a provider", "yes", "no", "no"]],
    tones: ["done", undefined, undefined],
  });
  fab.table(1, { title: "Import preference", head: ["learned from", "LOCAL_PREF", "why"], rows: [["customer", 200, "it pays you"], ["peer", 150, "free"], ["provider", 100, "you pay it"]] });
  fab.note(
    `The rule follows the money: a network carries traffic for others only when someone pays it to. Routes from customers go to everyone, routes from peers and providers go only to customers, and each network prefers customer routes, then peer routes, then provider routes, whatever the path length.`,
    "rules",
  );

  fab.path(["cust", M]);
  fab.path([M, "isp1"]);
  fab.path([M, "isp2"]);
  fab.packets(
    [
      { from: "cust", to: M, label: CUST_NET, progress: 0.6 },
      { from: M, to: "isp1", label: `AS_PATH ${asPath(AS.meridian, CUST)}`, progress: 0.5 },
      { from: M, to: "isp2", label: `AS_PATH ${asPath(AS.meridian, CUST)}`, progress: 0.5 },
    ],
    `AS 64505 announces ${CUST_NET} to Meridian. For Meridian it is a customer route, so Meridian exports it to both providers with AS_PATH 64500 64505: carrying traffic towards a paying customer is the job.`,
    "customer",
  );

  fab.clearPath();
  fab.path(["isp1", "t1"]);
  fab.path(["isp2", "t1"]);
  fab.path(["isp1", "isp2"]);
  fab.path(["isp2", "content"]);
  fab.packets(
    [
      { from: "isp1", to: "t1", label: CUST_NET, progress: 0.5 },
      { from: "isp2", to: "t1", label: CUST_NET, progress: 0.5 },
      { from: "isp1", to: "isp2", label: CUST_NET, progress: 0.4 },
      { from: "isp2", to: "content", label: CUST_NET, progress: 0.5 },
    ],
    `For ISP1 and ISP2 the route also came from a customer, Meridian, so each sends it to its provider, to its peer and to its own customers. A customer route climbs as high as the hierarchy goes and is visible from everywhere.`,
    "customer",
  );

  fab.clearPath();
  fab.path(["content", "isp2"]);
  fab.path(["isp2", "t1"]);
  fab.path(["isp2", "isp1"]);
  fab.path(["isp2", M]);
  fab.packets(
    [
      { from: "content", to: "isp2", label: PEER_NET, progress: 0.5 },
      { from: "isp2", to: "t1", label: PEER_NET, progress: 0.5 },
      { from: "isp2", to: "isp1", label: PEER_NET, progress: 0.5 },
      { from: "isp2", to: M, label: PEER_NET, progress: 0.5 },
    ],
    `AS 64511 announces ${PEER_NET} to its provider ISP2, which as a customer route sends it everywhere: to the transit provider, to its peer ISP1 and to its customer Meridian, each with AS_PATH 64502 64511.`,
    "content",
  );

  fab.clearPath();
  fab.path(["isp1", M]);
  fab.linkSet("isp1", "t1", { tone: "muted" });
  fab.table(0, {
    title: `Meridian's paths to ${PEER_NET}`,
    head: ["from", "AS_PATH", "LOCAL_PREF"],
    rows: [["ISP2 (provider)", asPath(AS.isp2, AS.content), 100], ["ISP1 (provider)", asPath(AS.isp1, AS.isp2, AS.content), 100]],
    tones: ["done", undefined],
  });
  fab.table(1, undefined);
  fab.packets(
    [{ from: "isp1", to: M, label: PEER_NET, progress: 0.5 }],
    `ISP1 learned ${PEER_NET} from a peer, so it passes it only to its customer Meridian and not up to the transit provider, which would be ISP1 offering to carry its peer's traffic unpaid. Meridian now holds two provider routes and picks the shorter one, via ISP2.`,
    "peer",
  );

  fab.clearPath();
  fab.linkSet("isp1", "t1", { tone: undefined });
  const exp = (leak: boolean): string[][] => [
    [MERIDIAN_NET, "own", "send"],
    [CUST_NET, "customer", "send"],
    [PEER_NET, "provider ISP2", leak ? "send (filter missing)" : "do not send"],
  ];
  fab.table(0, { title: "Meridian's export to ISP1", head: ["prefix", "learned from", "rule"], rows: exp(false), tones: ["done", "done", "muted"] });
  fab.state(M, "export filter", "active");
  fab.note(
    `So Meridian's export to ISP1 is its own ${MERIDIAN_NET} and its customer's ${CUST_NET}, and nothing it learned from ISP2. In practice the filter matches the "learned from a customer" community set at import (lesson 05-01) rather than listing prefixes.`,
    "export",
  );

  fab.state(M, `AS ${AS.meridian}`);
  fab.tone(M);
  fab.path(["cust", M, "isp2", "content"]);
  fab.packets(
    [{ from: M, to: "isp2", label: `to ${PEER_NET}`, progress: 0.5 }],
    `The paths the rule allows look like a mountain: zero or more links up from customer to provider, at most one peering link across, then only down. Traffic from AS 64505 to AS 64511 goes up to Meridian, up to ISP2 and down to AS 64511.`,
    "path",
  );

  fab.clearPath();
  fab.table(0, { title: "Meridian's export to ISP1", head: ["prefix", "learned from", "rule"], rows: exp(true), tones: ["done", "done", "danger"] });
  fab.state(M, "filter lost", "danger");
  fab.path([M, "isp1"], "compare");
  fab.send(
    M,
    "isp1",
    `LEAK ${PEER_NET}`,
    `Now the leak. A policy change on Meridian's ISP1 session drops the export filter, and Meridian announces ${PEER_NET}, a route from its other provider, to ISP1 with AS_PATH 64500 64502 64511.`,
    { tone: "compare" },
  );

  fab.table(0, {
    title: `ISP1's paths to ${PEER_NET}`,
    head: ["from", "AS_PATH", "LOCAL_PREF"],
    rows: [["customer Meridian", asPath(AS.meridian, AS.isp2, AS.content), 200], ["peer ISP2", asPath(AS.isp2, AS.content), 150]],
    tones: ["danger", undefined],
  });
  fab.table(1, {
    title: `Transit AS 64496's paths to ${PEER_NET}`,
    head: ["from", "AS_PATH", "LOCAL_PREF"],
    rows: [["customer ISP2", asPath(AS.isp2, AS.content), 200], ["customer ISP1", asPath(AS.isp1, AS.meridian, AS.isp2, AS.content), 200]],
    tones: ["done", undefined],
  });
  fab.note(
    `ISP1 now has the route from a customer with LOCAL_PREF 200 and from its peer with 150, so it picks the leaked path even though it is one network longer, and as a customer route it also sends it up to AS 64496. There both paths are customer routes, the shorter one through ISP2 wins, and the leak stops spreading.`,
    "leak",
  );

  fab.clearPath();
  fab.path(["isp1", M], "danger");
  fab.path([M, "isp2"], "danger");
  fab.path(["isp2", "content"], "danger");
  fab.linkSet("isp1", M, { width: 1, tone: "danger" });
  fab.linkSet(M, "isp2", { width: 1, tone: "danger" });
  fab.state(M, "links full", "danger");
  fab.set({ "ISP1 → AS 64511 traffic": "via Meridian (a valley)" });
  fab.packets(
    [
      { from: "isp1", to: M, label: `to ${PEER_NET}`, progress: 0.5, tone: "danger" },
      { from: M, to: "isp2", label: `to ${PEER_NET}`, progress: 0.5, tone: "danger" },
    ],
    `Everything ISP1 and its customers send to AS 64511 now goes down into Meridian and back up to ISP2: a valley in the mountain. Meridian's two transit links fill with traffic that is not its own, which it pays both providers to carry, and the excess is dropped.`,
    "valley",
  );

  fab.linkSet("isp1", M, { width: undefined });
  fab.linkSet(M, "isp2", { width: undefined });
  fab.clearPath();
  fab.state(M, `AS ${AS.meridian}`);
  fab.tone(M);
  fab.table(0, { title: "Meridian's export to ISP1", head: ["prefix", "learned from", "rule"], rows: exp(false), tones: ["done", "done", "muted"] });
  fab.table(1, {
    title: "Guard rails against leaks",
    head: ["where", "check"],
    rows: [["Meridian, export", "only own + customer-tagged routes"], ["ISP1, import", "only prefixes in the customer's registered set"], ["ISP1, import", "max-prefix limit on the session"], ["both", "BGP roles + Only-to-Customer (RFC 9234)"]],
  });
  fab.set({ "ISP1 → AS 64511 traffic": "back on the peering link" });
  fab.note(
    `The filter is restored, Meridian withdraws ${PEER_NET}, and ISP1 returns to its peer path. A leak needs two mistakes, the leaker's export and the provider's import, which is why ISP1 should accept from a customer only the prefixes registered for it; in June 2019 a customer leaked routes from one provider to another, Verizon accepted them unfiltered, and parts of Cloudflare and other networks were unreachable for about two hours.`,
    "done",
  );
  return fab.f.done();
};

// ---------- route-hijack ----------

const HIJACKER = 64510;

/**
 * `route-hijack` (lesson 05-04). Meridian (AS 64500) announces
 * 203.0.113.0/24 via ISP1 and ISP2; the transit network AS 64496 serves the
 * users in AS 64511 and another customer, AS 64510. AS 64510 announces the
 * more-specific 203.0.113.0/25 (by mistake, as Pakistan Telecom did with
 * YouTube's space in 2008); AS 64496 accepts and propagates it, and
 * longest-prefix match sends traffic for 203.0.113.0-127 to AS 64510, which
 * drops it, while 203.0.113.128-255 still reaches Meridian. Then Meridian's
 * ROA (203.0.113.0/24, maxLength 24, AS 64500) is published, AS 64496's
 * validator feeds the validated list to its routers over RTR, route origin
 * validation marks the /25 Invalid (wrong origin and longer than maxLength),
 * the router drops it and withdraws it downstream, and traffic returns. The
 * last frame states what ROV cannot do (a forged origin on the exact /24).
 *
 * Inputs: none. 12 frames.
 */
export const routeHijack: FabGen = () => {
  const M = "meridian";
  const fab = new Fab(
    [
      { id: "users", label: "Content net", kind: "cloud", x: 50, y: 0, state: `AS ${AS.content}` },
      { id: "t1", label: "Transit", kind: "isp", x: 50, y: 34, state: `AS ${AS.transit}` },
      { id: "isp1", label: "ISP1", kind: "isp", x: 15, y: 66, state: `AS ${AS.isp1}` },
      { id: "isp2", label: "ISP2", kind: "isp", x: 50, y: 66, state: `AS ${AS.isp2}` },
      { id: "hijacker", label: `AS ${HIJACKER}`, kind: "isp", x: 85, y: 66 },
      { id: M, label: "Meridian", kind: "gw", x: 32, y: 100, state: MERIDIAN_NET },
    ],
    [
      ["users", "t1"],
      ["t1", "isp1"],
      ["t1", "isp2"],
      ["t1", "hijacker"],
      ["isp1", M],
      ["isp2", M],
    ],
    { height: 340 },
  );
  const t1Rows = (withHijack: boolean): (string | number)[][] => [
    [MERIDIAN_NET, "ISP1", asPath(AS.isp1, AS.meridian)],
    [MERIDIAN_NET, "ISP2", asPath(AS.isp2, AS.meridian)],
    ...(withHijack ? [["203.0.113.0/25", `AS ${HIJACKER}`, asPath(HIJACKER)]] : []),
  ];
  fab.set({ origin: `AS ${AS.meridian}` });
  fab.note(
    `Meridian (AS 64500) announces ${MERIDIAN_NET} through ISP1 and ISP2. The transit network AS 64496 carries traffic from the content network AS 64511 towards Meridian and also has a smaller customer, AS 64510, that has nothing to do with Meridian.`,
    "topology",
  );

  fab.table(0, { title: "AS 64496 routes for Meridian", head: ["prefix", "via", "AS_PATH"], rows: t1Rows(false), tones: ["done", undefined] });
  fab.path(["users", "t1", "isp1", M]);
  fab.send("users", "t1", "to 203.0.113.10", `Normally AS 64496 holds two paths to ${MERIDIAN_NET}, both ending in origin AS 64500, and a tie-breaker makes it use the one via ISP1. A packet from AS 64511 to Meridian's web server 203.0.113.10 follows it.`, { tone: "done" });

  fab.clearPath();
  fab.headers([update("BGP UPDATE", { NLRI: "203.0.113.0/25", AS_PATH: asPath(HIJACKER), NEXT_HOP: "AS 64510's address" }, ["NLRI"])], `sent by AS ${HIJACKER}`);
  fab.state("hijacker", "announcing /25", "danger");
  fab.path(["hijacker", "t1"], "danger");
  fab.send(
    "hijacker",
    "t1",
    "UPDATE 203.0.113.0/25",
    `AS 64510 announces 203.0.113.0/25, the lower half of Meridian's block, with itself as origin, through a typo or an internal route that escaped. The documentation ranges used here are single /24s, so the example uses a /25; on the real internet most networks drop IPv4 routes longer than /24.`,
    { tone: "danger" },
  );

  fab.headers(undefined);
  fab.table(0, { title: "AS 64496 routes for Meridian", head: ["prefix", "via", "AS_PATH"], rows: t1Rows(true), tones: ["done", undefined, "danger"] });
  fab.path(["t1", "users"], "danger");
  fab.send("t1", "users", "UPDATE 203.0.113.0/25", `AS 64496 applies no prefix filter to this customer (one built from the prefixes the customer registered in an internet routing registry would have stopped it), so it accepts the /25 and passes it on to AS 64511 and its other neighbours. Nothing about it conflicts with the /24: to BGP a different prefix is a different route, with no best-path comparison between them.`, { tone: "danger" });

  fab.clearPath();
  fab.table(1, { title: "Lookup of 203.0.113.10 (AS 64496 FIB)", head: ["prefix", "matches?", "length"], rows: [["203.0.113.0/25", "yes", 25], [MERIDIAN_NET, "yes", 24]], tones: ["danger", undefined] });
  fab.note(
    `Every router that accepted the /25 now has two matching entries for 203.0.113.10 and forwards on the longest, /25, so AS_PATH length and LOCAL_PREF never get a say. In February 2008 Pakistan Telecom's /24 inside YouTube's /22 took YouTube offline worldwide for about two hours this way.`,
    "lpm",
  );

  fab.path(["users", "t1", "hijacker"], "danger");
  fab.path(["t1", "isp1", M]);
  fab.set({ "203.0.113.0-127": "to AS 64510 (lost)", "203.0.113.128-255": "to Meridian" });
  fab.packets(
    [
      { from: "t1", to: "hijacker", label: "to 203.0.113.10", lost: true, progress: 0.8 },
      { from: "t1", to: "isp1", label: "to 203.0.113.200", tone: "done", progress: 0.5 },
    ],
    `Traffic for 203.0.113.10 now goes to AS 64510, which has no such server and drops it, while 203.0.113.200 in the upper half is unaffected and still reaches Meridian. Meridian's own sessions and announcements are all unchanged; it sees half its inbound traffic vanish, and only public route collectors such as RIPE RIS and RouteViews show who is announcing its space.`,
    "hijacked",
  );

  fab.clearPath();
  fab.table(1, undefined);
  fab.table(0, { title: "Meridian's ROA (signed object in the RPKI)", head: ["prefix", "maxLength", "origin AS"], rows: [[MERIDIAN_NET, 24, AS.meridian]], tones: ["active"] });
  fab.state(M, "ROA published", "active");
  fab.note(
    `The defence is RPKI. Meridian publishes a Route Origin Authorisation with its regional internet registry: a signed statement that ${MERIDIAN_NET}, and nothing longer than /24, may be originated only by AS 64500. The signature chains up to the registry's trust anchor, so anyone can verify it.`,
    "roa",
  );

  fab.state(M, MERIDIAN_NET);
  fab.tone(M);
  fab.addNode({ id: "validator", label: "RPKI validator", kind: "collector", x: 85, y: 34, state: "ROA list" });
  fab.link("validator", "t1", { dashed: true, label: "RTR" });
  fab.send(
    "validator",
    "t1",
    "validated ROA list",
    `AS 64496 runs a validator (software such as Routinator or rpki-client) that downloads every published ROA, checks the signatures and sends the resulting validated list to its routers over the RPKI-to-Router protocol. The routers never fetch or verify certificates themselves.`,
  );

  fab.table(1, {
    title: "Route origin validation at AS 64496",
    head: ["route", "origin", "covered by ROA", "≤ maxLength", "state"],
    rows: [
      [`${MERIDIAN_NET} via ISP1`, AS.meridian, "yes, AS 64500", "yes", "Valid"],
      ["203.0.113.0/25", HIJACKER, "yes, AS 64500", "no (/25)", "Invalid"],
      [PEER_NET, AS.content, "no ROA", "-", "NotFound"],
    ],
    tones: ["done", "danger", undefined],
  });
  fab.note(
    `Each route is checked against the list. The /24 from AS 64500 is Valid. The /25 is Invalid twice over: its origin is AS 64510, and even the right origin could not use a /25 when the ROA's maxLength is 24. A prefix no ROA covers is NotFound and still accepted, because not every network publishes ROAs.`,
    "rov",
  );

  fab.table(0, { title: "AS 64496 routes for Meridian", head: ["prefix", "via", "AS_PATH"], rows: t1Rows(false), tones: ["done", undefined] });
  fab.state("hijacker", "rejected", "muted");
  fab.path(["t1", "users"], "compare");
  fab.send("t1", "users", "WITHDRAW 203.0.113.0/25", `AS 64496's import policy rejects Invalid routes, so it drops the /25 and sends a withdrawal for it to AS 64511 and its other neighbours, which had already received it.`, { tone: "compare" });

  fab.clearPath();
  fab.path(["users", "t1", "isp1", M], "done");
  fab.set({ "203.0.113.0-127": "to Meridian", "203.0.113.128-255": "to Meridian" });
  fab.send("users", "t1", "to 203.0.113.10", `With the /25 gone, the /24 is again the longest match for 203.0.113.10 and traffic reaches Meridian via ISP1. AS 64510 can keep announcing the /25, but every network that drops Invalid routes ignores it.`, { tone: "done" });

  fab.clearPath();
  fab.table(1, {
    title: "What origin validation checks",
    head: ["announcement", "ROV state", "stopped by"],
    rows: [["/25, origin 64510", "Invalid", "ROV"], ["/25, AS_PATH 64510 64500", "Invalid (maxLength)", "ROV"], ["/24, AS_PATH 64510 64500", "Valid", "only ASPA or BGPsec"]],
    tones: ["done", "done", "danger"],
  });
  fab.state("hijacker", `AS ${HIJACKER}`);
  fab.tone("hijacker");
  fab.note(
    `ROV checks the origin AS and the prefix length, not the path. A /25 with Meridian forged as the origin is still Invalid because of maxLength 24, which is why ROAs should not allow lengths they never announce; but the exact /24 with a forged origin is Valid, and catching that needs path checks such as ASPA or BGPsec.`,
    "limits",
  );
  return fab.f.done();
};

// ---------- path-hunting ----------

/** One synchronous BGP round: what each AS holds after processing what its neighbours sent. */
export interface HuntRound {
  /** Per AS: neighbour → path received (without the receiver's own AS), null when withdrawn or looped. */
  ribIn: Record<number, Record<number, number[] | null>>;
  /** Per AS: best path (as it would be advertised, own AS first), null when none. */
  best: Record<number, number[] | null>;
  /** UPDATE and WITHDRAW messages sent at the end of this round. */
  sent: number;
}

/**
 * Path hunting in a full mesh of `clique` ASes that all exchange every route,
 * each also connected to `origin`, after the origin withdraws its prefix.
 * Synchronous model: in each round every AS processes what it received in the
 * previous one, picks the shortest loop-free path (ties: lowest neighbour
 * ASN) and sends one message per neighbour whose view changed. Round 0 is the
 * steady state before the withdrawal, round 1 the moment of withdrawal.
 */
export function simulateHunt(clique: number[], origin: number): HuntRound[] {
  const neighbours = (asn: number) => clique.filter((x) => x !== asn);
  const choose = (asn: number, ribIn: Record<number, number[] | null>): number[] | null => {
    let best: { via: number; path: number[] } | null = null;
    for (const [k, p] of Object.entries(ribIn)) {
      const via = Number(k);
      if (!p || p.includes(asn)) continue;
      if (!best || p.length < best.path.length || (p.length === best.path.length && via < best.via)) best = { via, path: p };
    }
    return best ? [asn, ...best.path] : null;
  };
  // Steady state: every AS has the direct path and one via each clique neighbour.
  const ribIn0: Record<number, Record<number, number[] | null>> = {};
  for (const a of clique) {
    ribIn0[a] = { [origin]: [origin] };
    for (const n of neighbours(a)) ribIn0[a]![n] = [n, origin];
  }
  const best0 = Object.fromEntries(clique.map((a) => [a, choose(a, ribIn0[a]!)])) as Record<number, number[] | null>;
  const rounds: HuntRound[] = [{ ribIn: ribIn0, best: best0, sent: 0 }];
  // Round 1 starts with the origin's withdrawal received everywhere.
  let ribIn = structuredClone(ribIn0);
  for (const a of clique) ribIn[a]![origin] = null;
  let prev = best0;
  for (let r = 1; r < 12; r++) {
    const best = Object.fromEntries(clique.map((a) => [a, choose(a, ribIn[a]!)])) as Record<number, number[] | null>;
    const changed = clique.filter((a) => JSON.stringify(best[a]) !== JSON.stringify(prev[a]));
    rounds.push({ ribIn: structuredClone(ribIn), best, sent: changed.length * (clique.length - 1) });
    if (!changed.length) break;
    const next = structuredClone(ribIn);
    for (const a of changed) for (const n of neighbours(a)) next[n]![a] = best[a] ? [...best[a]!] : null;
    ribIn = next;
    prev = best;
  }
  return rounds;
}

/**
 * `path-hunting` (lesson 05-05). Three transit networks, AS 64496, ISP1 (AS
 * 64501) and ISP2 (AS 64502), fully meshed and passing every route to each
 * other (the textbook worst case; valley-free export rules prune some of these
 * paths but not all), each connected to the content network AS 64511, which
 * originates 192.0.2.0/24. Meridian (AS 64500) is a customer of ISP1 (its
 * ISP2 session is left out) and watches the route. AS 64511 withdraws the
 * prefix; each network falls back to a stale path through a neighbour,
 * advertises it, learns that path is gone (its own AS appears in what comes
 * back), tries a longer one, and only then withdraws. The tables and the
 * chart come from `simulateHunt`, one round per 30-second MRAI interval.
 * During the hunt ISP1 and AS 64496 point at each other: a transient loop.
 *
 * Inputs: none. 10 frames.
 */
export const pathHunting: FabGen = () => {
  const A = AS.transit;
  const B = AS.isp1;
  const C = AS.isp2;
  const D = AS.content;
  const clique = [A, B, C];
  const rounds = simulateHunt(clique, D);
  const id: Record<number, string> = { [A]: "t1", [B]: "isp1", [C]: "isp2", [D]: "origin" };
  const name: Record<number, string> = { [A]: "AS 64496", [B]: "ISP1", [C]: "ISP2", [D]: "AS 64511" };
  const fab = new Fab(
    [
      { id: "origin", label: "AS 64511", kind: "cloud", x: 50, y: 0, state: PEER_NET },
      { id: "t1", label: "Transit", kind: "isp", x: 15, y: 45, state: `AS ${A}` },
      { id: "isp2", label: "ISP2", kind: "isp", x: 85, y: 45, state: `AS ${C}` },
      { id: "isp1", label: "ISP1", kind: "isp", x: 50, y: 72, state: `AS ${B}` },
      { id: "meridian", label: "Meridian", kind: "gw", x: 50, y: 100, state: `AS ${AS.meridian}` },
    ],
    [
      ["origin", "t1"],
      ["origin", "isp2"],
      ["origin", "isp1"],
      ["t1", "isp2"],
      ["t1", "isp1"],
      ["isp1", "isp2"],
      ["isp1", "meridian"],
    ],
    { height: 340 },
  );
  const p = (path: number[] | null | undefined) => (path ? path.join(" ") : "none");
  const ribTable = (r: HuntRound, asn: number) => {
    const rows = [D, ...clique.filter((x) => x !== asn)].map((n) => {
      const got = r.ribIn[asn]![n];
      const looped = got?.includes(asn);
      return [name[n]!, got === undefined || got === null ? "withdrawn" : p(got), looped ? "loop: contains my AS" : got ? "usable" : "-"];
    });
    const bestVia = r.best[asn]?.[1];
    const tones = [D, ...clique.filter((x) => x !== asn)].map((n) => (r.ribIn[asn]![n] && !r.ribIn[asn]![n]!.includes(asn) && n === bestVia ? "done" : r.ribIn[asn]![n] ? undefined : "muted")) as (Tone | undefined)[];
    return { title: `${name[asn]} (AS ${asn}) paths for ${PEER_NET}`, head: ["from", "AS_PATH", "status"], rows, tones };
  };
  const bestTable = (r: HuntRound) => ({
    title: "Best path at each network",
    head: ["network", "best (as advertised)", "next hop AS"],
    rows: clique.map((a) => [name[a]!, p(r.best[a]), r.best[a] ? name[r.best[a]![1]!]! : "none"]),
    tones: clique.map((a) => (r.best[a] ? (r.best[a]!.length > 2 ? "compare" : "done") : "danger")) as (Tone | undefined)[],
  });
  /** Meridian receives ISP1's best path as advertised, ISP1's own AS first. */
  const meridianLen = (r: HuntRound) => (r.best[B] ? r.best[B]!.length : null);
  const holding = (r: HuntRound) => clique.filter((a) => r.best[a]).length;
  let withdrawn = false;
  const forwardingArrows = (r: HuntRound) => {
    fab.clearPath();
    if (withdrawn) for (const a of clique) fab.linkSet("origin", id[a]!, { tone: "muted" });
    for (const a of clique) {
      const nh = r.best[a]?.[1];
      if (nh !== undefined) fab.linkSet(id[a]!, id[nh]!, { tone: nh === D ? "done" : "compare" });
    }
  };

  const r0 = rounds[0]!;
  fab.note(
    `Three transit networks, AS 64496, ISP1 and ISP2, are fully meshed and pass every route to each other, and each has its own link to AS 64511, which originates ${PEER_NET}. Meridian is ISP1's customer and simply watches what ISP1 tells it about the prefix.`,
    "topology",
  );

  forwardingArrows(r0);
  fab.table(0, ribTable(r0, B));
  fab.table(1, bestTable(r0));
  fab.set({ "Meridian sees": `AS_PATH ${B} ${p(r0.best[B]?.slice(1))}` });
  fab.note(
    `In steady state each network uses its direct link to AS 64511 and keeps two more paths in reserve, one through each neighbour. ISP1's table shows all three; only the direct one, AS_PATH 64511, is best, and Meridian sees AS_PATH ${B} ${D}.`,
    "steady",
  );

  fab.chart({ title: "What Meridian sees during the hunt", xLabel: "time (30-second MRAI steps)", yMax: 5, series: [{ name: "AS_PATH length at Meridian", tone: "compare", points: [meridianLen(r0)] }, { name: "networks still holding a path", tone: "danger", points: [holding(r0)] }] });
  fab.clearPath();
  fab.state("origin", "withdrawn", "danger");
  withdrawn = true;
  for (const a of clique) fab.linkSet("origin", id[a]!, { dashed: true, tone: "muted", label: "no route" });
  fab.packets(
    clique.map((a) => ({ from: "origin", to: id[a]!, label: `WITHDRAW ${PEER_NET}`, tone: "danger" as Tone, progress: 0.6 })),
    `AS 64511 withdraws ${PEER_NET} on all three sessions at the same moment. The prefix no longer exists anywhere, so the only correct end state is that nobody has a route; the question is how long the others take to agree.`,
    "withdraw",
  );

  const r1 = rounds[1]!;
  forwardingArrows(r1);
  fab.table(0, ribTable(r1, B));
  fab.table(1, bestTable(r1));
  fab.point({ "AS_PATH length at Meridian": meridianLen(r1), "networks still holding a path": holding(r1) });
  fab.set({ "Meridian sees": `AS_PATH ${B} ${p(r1.best[B]?.slice(1))}` });
  fab.note(
    `Each network deletes its direct path and falls back to a reserve: ISP1 to ${p(r1.best[B]?.slice(1))} through AS 64496, AS 64496 to ${p(r1.best[A]?.slice(1))} through ISP1, ISP2 to ${p(r1.best[C]?.slice(1))}. All of them are stale, they describe paths through AS 64511 that no longer exist, but nobody can know that yet.`,
    "stale",
  );

  fab.packets(
    [
      { from: "isp1", to: "t1", label: "to 192.0.2.1", tone: "danger", progress: 0.5 },
      { from: "t1", to: "isp1", label: "TTL expiring", tone: "danger", progress: 0.3 },
    ],
    `For now ISP1 forwards to AS 64496 and AS 64496 forwards to ISP1, so a packet Meridian sends to 192.0.2.1 bounces between them until its TTL runs out. The traffic was undeliverable anyway, but the loop burns capacity on a link shared with healthy traffic.`,
    "loop",
  );

  fab.clearPath();
  forwardingArrows(r1);
  fab.packets(
    [
      ...clique.flatMap((a) => clique.filter((n) => n !== a).map((n) => ({ from: id[a]!, to: id[n]!, label: p(r1.best[a]), tone: "compare" as Tone, progress: 0.3 }))),
      { from: "isp1", to: "meridian", label: `AS_PATH ${p(r1.best[B])}`, tone: "compare" as Tone, progress: 0.5 },
    ],
    `Each network advertises its new best path to its neighbours, with its own AS added in front: ${rounds[1]!.sent} messages between the three, and one from ISP1 to Meridian. From now on each further change to a neighbour waits for that session's MRAI timer, the minimum route advertisement interval: 30 seconds for eBGP as RFC 4271 suggests and some implementations default to, 0 in others.`,
    "advertise",
  );

  const r2 = rounds[2]!;
  fab.clearPath();
  forwardingArrows(r2);
  fab.table(0, ribTable(r2, B));
  fab.table(1, bestTable(r2));
  fab.point({ "AS_PATH length at Meridian": meridianLen(r2), "networks still holding a path": holding(r2) });
  fab.set({ "Meridian sees": r2.best[B] ? `AS_PATH ${B} ${p(r2.best[B]!.slice(1))}` : "withdrawn" });
  fab.note(
    `30 seconds later the advertisements are processed. ISP1 discards AS 64496's ${p(r2.ribIn[B]![A])} because it contains ISP1's own AS, and moves to a longer stale path, ${p(r2.best[B]?.slice(1))} through ISP2; AS 64496 has nothing usable left. Meridian now sees a path of ${meridianLen(r2)} ASes for a prefix that has been gone for half a minute.`,
    "hunt",
  );

  const r3 = rounds[3]!;
  forwardingArrows(r3);
  fab.table(0, ribTable(r3, B));
  fab.table(1, bestTable(r3));
  fab.point({ "AS_PATH length at Meridian": meridianLen(r3), "networks still holding a path": holding(r3) });
  fab.set({ "Meridian sees": r3.best[B] ? `AS_PATH ${B} ${p(r3.best[B]!.slice(1))}` : "withdrawn" });
  fab.note(
    `Another 30 seconds: the last stale paths come back with the receiver's own AS in them or as withdrawals, so ISP1 and ISP2 run out of options too. ${holding(r3) === 0 ? "No network holds a path any more" : `${holding(r3)} networks still hold a path`}, and ISP1 finally sends Meridian a withdrawal.`,
    "converge",
  );

  // The origin's withdrawals plus everything the three sent; the last change happened in the last round that sent anything.
  const total = clique.length + rounds.reduce((n, r) => n + r.sent, 0);
  const lastChange = rounds.reduce((k, r, i) => (r.sent > 0 ? i : k), 1);
  const secs = (lastChange - 1) * 30;
  fab.state("meridian", "route gone", "danger");
  fab.set({ "time to converge": `about ${secs} s`, "messages for one prefix": total });
  fab.note(
    `Converged after about ${secs} seconds and ${total} BGP messages for a single prefix (AS 64511's ${clique.length} withdrawals and ${total - clique.length} between the three networks), while Meridian was shown paths of two, three and four ASes. An announcement spreads in one pass because the first path that arrives is real; a withdrawal has to disprove every reserve path first, which is why bad news travels slowly.`,
    "done",
  );

  fab.state("meridian", `AS ${AS.meridian}`);
  fab.tone("meridian");
  fab.table(0, {
    title: "Levers on path hunting",
    head: ["lever", "effect", "cost"],
    rows: [
      ["shorter MRAI (even 0)", "each step happens sooner", "many more UPDATEs, more CPU"],
      ["longer MRAI", "fewer UPDATEs", "slower convergence"],
      ["one AS for all spines (RFC 7938)", "stale paths via another spine fail the loop check", "fabric design choice"],
      ["BGP PIC, ADD-PATH backups", "fast switch when the backup is real", "does not stop a hunt"],
    ],
  });
  fab.table(1, undefined);
  fab.note(
    `MRAI is a trade between speed and churn: in 2000 Labovitz and colleagues measured internet withdrawals taking about three minutes on average to converge, some up to fifteen. Inside a data center eBGP fabric the fix is structural: giving every spine of a site the same AS (65100 in Meridian's eBGP design, lesson 03-03) makes any stale path that climbs back up through another spine fail the AS_PATH loop check at once.`,
    "levers",
  );
  return fab.f.done();
};

// ---------- maintenance-order ----------

/**
 * `maintenance-order` (lesson 05-06). Taking Meridian's border gateway
 * gw1.ams out of service. Steady state (the two-isp-te policy with
 * LOCAL_PREF 200 on ISP1 and the prepend towards ISP2, but without the
 * 64502:70 community, so ISP1 holds a backup path through ISP2): inbound
 * traffic for 203.0.113.0/24 from AS 64511 enters via ISP1 and gw1.ams,
 * outbound leaves the same way (LOCAL_PREF 200), and Meridian's public
 * servers 203.0.113.0/26 sit behind leaf1.ams. gw1.ams originates the
 * aggregate 203.0.113.0/24 from a static discard route, so the announcement
 * does not depend on IS-IS; it learns the /26 over iBGP with next hop
 * leaf1's loopback 10.255.1.11, resolved through IS-IS. Route reflectors are
 * not drawn.
 * Clean order: drain BGP first (re-announce to ISP1 with GRACEFUL_SHUTDOWN
 * 65535:0, RFC 8326, and send internal routes with LOCAL_PREF 0), verify the
 * gateway is empty, then take it out of IS-IS (its IS-IS adjacencies to
 * spine1.ams and spine2.ams shut); restore in the reverse order.
 * Wrong order: take gw1.ams out of IS-IS first. Outbound recovers within
 * seconds (the next hop 10.255.1.201 disappears and gw2.ams takes over), but
 * the eBGP session to ISP1 stays Established and the aggregate is still
 * announced, so inbound traffic keeps arriving and is discarded.
 *
 * Inputs: `variant: "bgp-first"` runs only the clean order, `"igp-first"`
 * only the wrong order; the default runs both. 15 frames by default, 8 for
 * "bgp-first", 8 for "igp-first".
 */
export const maintenanceOrder: FabGen = (input) => {
  const variant = pick(input.variant, ["both", "bgp-first", "igp-first"] as const, "both");
  const G1 = "gw1.ams";
  const G2 = "gw2.ams";
  const S1 = "spine1.ams";
  const S2 = "spine2.ams";
  const L1 = "leaf1.ams";
  const loG1 = loopback(G1);
  const loL1 = loopback(L1);
  const fab = new Fab(
    [
      { id: "users", label: "AS 64511", kind: "cloud", x: 50, y: 0, state: "users" },
      { id: "isp1", label: "ISP1", kind: "isp", x: 18, y: 25, state: `AS ${AS.isp1}` },
      { id: "isp2", label: "ISP2", kind: "isp", x: 82, y: 25, state: `AS ${AS.isp2}` },
      { id: G1, kind: "gw", x: 18, y: 50, state: loG1 },
      { id: G2, kind: "gw", x: 82, y: 50, state: loopback(G2) },
      { id: S1, kind: "spine", x: 35, y: 75 },
      { id: S2, kind: "spine", x: 65, y: 75 },
      { id: L1, kind: "leaf", x: 50, y: 100, state: "203.0.113.0/26" },
    ],
    [
      ["users", "isp1"],
      ["users", "isp2"],
      ["isp1", "isp2", { label: "peering" }],
      ["isp1", G1],
      ["isp2", G2],
      [G1, S1],
      [G1, S2],
      [G2, S1],
      [G2, S2],
      [S1, L1],
      [S2, L1],
    ],
    { height: 380 },
  );
  const inbound1 = ["users", "isp1", G1, S1, L1];
  const inbound2 = ["users", "isp2", G2, S2, L1];
  const steady = () => {
    for (const id of [G1, G2, S1, S2, L1]) fab.tone(id, undefined);
    fab.state(G1, loG1);
    for (const [a, b] of [[G1, S1], [G1, S2]] as const) fab.linkSet(a, b, { dashed: false, tone: undefined, label: undefined });
    fab.clearPath();
    fab.path(inbound1, "path");
    fab.linkSet("isp1", G1, { width: 0.6 });
    fab.linkSet("isp2", G2, { width: 0 });
    fab.table(0, {
      title: `${G1} FIB`,
      head: ["prefix", "next hop", "from"],
      rows: [["203.0.113.0/26", `${loL1} → spine1/spine2`, "iBGP via IS-IS"], [MERIDIAN_NET, "discard", "static (announced)"], ["internet, ≈1M routes", "ISP1", "eBGP, LOCAL_PREF 200"]],
    });
    fab.table(1, {
      title: `ISP1's paths to ${MERIDIAN_NET}`,
      head: ["from", "AS_PATH", "LOCAL_PREF"],
      rows: [["customer gw1.ams", asPath(AS.meridian), 200], ["peer ISP2", asPath(AS.isp2, AS.meridian, AS.meridian, AS.meridian), 100]],
      tones: ["done", undefined],
    });
    fab.set({ inbound: "ISP1 → gw1", outbound: "gw1 → ISP1", "eBGP to ISP1": "Established" });
    fab.unset("lost");
  };
  const igpOut = () => {
    for (const s of [S1, S2]) fab.linkSet(G1, s, { dashed: true, tone: "danger", label: "IS-IS down", width: 0 });
    fab.unset("IS-IS on gw1");
    fab.set({ "IS-IS on gw1": "adjacencies shut" });
  };

  steady();
  fab.note(
    `The job: take Meridian's border gateway gw1.ams out of service for a software upgrade. Today it carries all of Meridian's ISP1 traffic in both directions: users in AS 64511 reach Meridian's servers 203.0.113.0/26 behind leaf1.ams via ISP1 and gw1.ams, and outbound traffic leaves the same way.`,
    "topology",
  );
  fab.note(
    `gw1.ams depends on two protocols. It announces ${MERIDIAN_NET} to ISP1 from a static discard route, which needs nothing else to stay up, and it reaches 203.0.113.0/26 through a BGP route whose next hop ${loL1} only IS-IS can resolve. ISP1 prefers gw1's announcement (LOCAL_PREF 200 for a customer) over the prepended path through its peer ISP2.`,
    "state",
  );

  if (variant !== "igp-first") {
    fab.set({ order: "BGP first, then IGP" });
    fab.headers([update("BGP UPDATE to ISP1", { NLRI: MERIDIAN_NET, AS_PATH: asPath(AS.meridian), COMMUNITIES: "GRACEFUL_SHUTDOWN (65535:0)" }, ["COMMUNITIES"])], `sent by ${G1}`);
    fab.state(G1, "draining BGP", "active");
    fab.table(0, {
      title: `${G1} FIB`,
      head: ["prefix", "next hop", "from"],
      rows: [["203.0.113.0/26", `${loL1} → spine1/spine2`, "iBGP via IS-IS"], [MERIDIAN_NET, "discard", "static (announced)"], ["internet, ≈1M routes", "ISP1", "eBGP, LOCAL_PREF 0"]],
    });
    fab.send(
      G1,
      "isp1",
      "65535:0",
      `Step 1, BGP: gw1.ams re-announces ${MERIDIAN_NET} to ISP1 tagged GRACEFUL_SHUTDOWN, the well-known community 65535:0 (RFC 8326) that asks the receiver to lower the route's LOCAL_PREF to 0; ISP1 must be set up to honour it, as many transit providers are. Inside Meridian it re-advertises its internet routes with LOCAL_PREF 0 as well.`,
    );

    fab.headers(undefined);
    fab.table(1, {
      title: `ISP1's paths to ${MERIDIAN_NET}`,
      head: ["from", "AS_PATH", "LOCAL_PREF"],
      rows: [["customer gw1.ams", asPath(AS.meridian), 0], ["peer ISP2", asPath(AS.isp2, AS.meridian, AS.meridian, AS.meridian), 100]],
      tones: ["muted", "done"],
    });
    fab.clearPath();
    fab.path(inbound2, "path");
    fab.linkSet("isp1", G1, { width: 0.1 });
    fab.linkSet("isp2", G2, { width: 0.5 });
    fab.set({ inbound: "ISP2 → gw2" });
    fab.send(
      "users",
      "isp2",
      "to 203.0.113.10",
      `Inbound moves first and without loss, because the old path keeps working until the new one is chosen: ISP1 now prefers the path through its peer ISP2 (LOCAL_PREF 100 beats 0), and AS 64511 switches to its own shorter path via ISP2. Users' packets now enter through gw2.ams.`,
      { tone: "done" },
    );

    fab.table(0, {
      title: `${G2} paths to the internet`,
      head: ["from", "LOCAL_PREF", "best"],
      rows: [["iBGP from gw1.ams (ISP1)", 0, ""], ["own eBGP, ISP2", 100, "yes"]],
      tones: ["muted", "done"],
    });
    fab.path([L1, S2, G2, "isp2"], "done");
    fab.linkSet("isp1", G1, { width: 0 });
    fab.linkSet("isp2", G2, { width: 0.6 });
    fab.set({ outbound: "gw2 → ISP2" });
    fab.send(
      L1,
      S2,
      "outbound via gw2",
      `Outbound follows: gw1.ams's internet routes now carry LOCAL_PREF 0, so gw2.ams's own routes through ISP2 (LOCAL_PREF 100) win, the route reflectors pass them to every leaf, and leaf1.ams sends its outbound traffic to gw2.ams.`,
      { tone: "done" },
    );

    fab.state(G1, "0 b/s", "done");
    fab.table(1, {
      title: `ISP1's paths to ${MERIDIAN_NET}`,
      head: ["from", "AS_PATH", "LOCAL_PREF"],
      rows: [["peer ISP2", asPath(AS.isp2, AS.meridian, AS.meridian, AS.meridian), 100]],
      tones: ["done"],
    });
    fab.set({ "eBGP to ISP1": "closed" });
    fab.note(
      `The engineer checks gw1.ams's interface counters, sees them fall to almost nothing, and only then closes the eBGP session to ISP1. ISP1 deletes a path it was no longer using, so nothing moves.`,
      "verify",
    );

    igpOut();
    fab.state(G1, "isolated", "done");
    fab.table(0, {
      title: `${G1} before the upgrade`,
      head: ["check", "state"],
      rows: [["eBGP to ISP1", "closed"], ["internal routes", "LOCAL_PREF 0, unused"], ["IS-IS", "adjacencies shut"], ["traffic", "0 b/s"]],
      tones: ["done", "done", "done", "done"],
    });
    fab.set({ lost: "0 packets" });
    fab.note(
      `Step 2, IGP: gw1.ams's IS-IS adjacencies to spine1.ams and spine2.ams are shut and its loopback ${loG1} leaves the IGP. No BGP route points at it any more and no traffic crosses it, so not a single packet is lost; the gateway is ready for the upgrade.`,
      "igp",
    );

    fab.note(
      `Coming back runs in reverse: IS-IS first, then the BGP sessions with GRACEFUL_SHUTDOWN still attached, a wait until gw1.ams has learned the full table again, and only then the community removed so traffic returns. Attracting traffic before the routes are in place would recreate the black hole of lesson 04-07; the IS-IS overload bit, held after a reboot until BGP has converged, exists for exactly that.`,
      "restore",
    );
  }

  if (variant !== "bgp-first") {
    if (variant === "both") {
      steady();
      fab.unset("order", "IS-IS on gw1");
      fab.set({ order: "IGP first (wrong)" });
      fab.note(
        `Now the same night with the two steps swapped, a mistake real operators have made. Everything starts from the same state: ISP1 and gw1.ams carry both directions.`,
        "reset",
      );
    } else {
      fab.set({ order: "IGP first (wrong)" });
    }

    igpOut();
    fab.state(G1, "no IS-IS", "danger");
    fab.table(0, {
      title: `${G1} FIB`,
      head: ["prefix", "next hop", "from"],
      rows: [["203.0.113.0/26", `${loL1}: unresolvable`, "removed"], [MERIDIAN_NET, "discard", "static (announced)"], ["internet, ≈1M routes", "ISP1", "eBGP, LOCAL_PREF 200"]],
      tones: ["danger", "compare", undefined],
    });
    fab.note(
      `Step 1, IGP: gw1.ams's IS-IS adjacencies are shut while its BGP is untouched (setting only the overload bit would have kept gw1's own IS-IS routes). It loses every IS-IS route, so the BGP next hop ${loL1} for 203.0.113.0/26 can no longer be resolved and that route leaves its FIB; the static ${MERIDIAN_NET} discard route stays.`,
      "igp",
    );

    fab.clearPath();
    fab.path(inbound1, "path");
    fab.linkSet(G1, S1, { tone: "danger" });
    fab.linkSet(G1, S2, { tone: "danger" });
    fab.path([L1, S2, G2, "isp2"], "done");
    fab.set({ outbound: "gw2 → ISP2 (after seconds of loss)" });
    fab.send(
      L1,
      S2,
      "outbound via gw2",
      `Outbound traffic recovers by itself: every other router sees gw1's loopback ${loG1} vanish from IS-IS, so routes with that BGP next hop become unusable, gw2.ams's own routes through ISP2 take over and the route reflectors pass them on. The cost is seconds to tens of seconds of loss, depending on how many routes gw2.ams must re-send.`,
      { tone: "done" },
    );

    fab.clearPath();
    fab.linkSet(G1, S1, { tone: "danger" });
    fab.linkSet(G1, S2, { tone: "danger" });
    fab.path(["users", "isp1", G1], "path");
    fab.linkSet("isp1", G1, { width: 0.6 });
    fab.send(
      "isp1",
      G1,
      "to 203.0.113.10",
      `Inbound does not recover. The eBGP session to ISP1 runs over the direct link and stays Established, gw1.ams keeps announcing ${MERIDIAN_NET} from its static route, and ISP1 keeps preferring it, so every inbound packet for Meridian still arrives at gw1.ams.`,
    );

    fab.table(0, {
      title: `${G1} lookup for 203.0.113.10`,
      head: ["prefix", "next hop", "from"],
      rows: [[MERIDIAN_NET, "discard", "static (announced)"], ["internet, ≈1M routes", "ISP1", "eBGP"]],
      tones: ["danger", undefined],
    });
    fab.set({ lost: "all inbound via ISP1" });
    fab.send(
      G1,
      S1,
      "to 203.0.113.10",
      `Inside gw1.ams the longest match for 203.0.113.10 is now the /24 discard route, so the packet is dropped, and so is every other packet ISP1 delivers: the BGP black hole from lesson 04-07, live for nearly all of Meridian's inbound internet traffic.`,
      { lost: true, progress: 0.12 },
    );

    fab.table(1, {
      title: "What the dashboards showed",
      head: ["signal", "value"],
      rows: [["eBGP session to ISP1", "Established"], ["prefixes advertised to ISP1", "1, as usual"], ["IS-IS on gw1", "down, as planned"], ["ISP1 link, inbound", "normal traffic"], ["discard counter on gw1", "climbing"], ["outside probe to 203.0.113.10", "failing"]],
      tones: ["done", "done", "done", "done", "danger", "danger"],
    });
    fab.note(
      `Every signal a protocol dashboard watches is normal or expected: the session is up, the prefix count is unchanged, IS-IS is down as the maintenance plan says, and the ISP1 link even shows normal inbound traffic, because packets arrive before they are thrown away. Only the discard counter and a probe from outside the network show the outage.`,
      "green",
    );

    fab.note(
      `The rule is to withdraw BGP first and cost out the IGP last, so a router never attracts traffic it can no longer deliver. The guard rails worth building: announce the aggregate only while the routes behind it are present, probe 203.0.113.10 through each ISP from outside, and have change tooling check the order of the steps.`,
      "done",
    );
  }
  return fab.f.done();
};

export const scenarios: Record<string, FabGen> = {
  "bgp-blackhole": bgpBlackhole,
  "community-policy": communityPolicy,
  "two-isp-te": twoIspTe,
  "valley-free": valleyFree,
  "route-hijack": routeHijack,
  "path-hunting": pathHunting,
  "maintenance-order": maintenanceOrder,
};

export const labels: Record<string, string> = {
  "bgp-blackhole": "The BGP black hole (and the VXLAN fix)",
  "community-policy": "Communities: tag at ingress, act at egress",
  "two-isp-te": "Two ISPs: steering egress and ingress",
  "valley-free": "Valley-free export rules and a route leak",
  "route-hijack": "A more-specific hijack and RPKI",
  "path-hunting": "Path hunting after a withdrawal",
  "maintenance-order": "Maintenance order: BGP first, then IGP",
};
