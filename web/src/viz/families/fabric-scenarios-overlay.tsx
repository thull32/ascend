// Scenario pack for the `fabric` family: overlays: VXLAN, EVPN and MPLS (module 06).
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
//   | `evpn-mac-learning` | a leaf learning a local MAC, sending a type-2 route
//     via the RR, remote leaves installing it, ARP suppression answering locally
//     | 06-03 |
//   | `symmetric-irb` | Acme 10.1.1.10 to 10.1.2.20 on another leaf: routed at
//     the ingress leaf, L3VNI 50001 across, routed again at egress | 06-04 |
//   | `bum-replication` | a broadcast in VNI 10100: ingress replication to
//     every VTEP from type-3 routes vs one copy down a multicast tree | 06-05 |
//   | `evpn-multihoming` | a server dual-attached to two leaves with one ESI;
//     designated forwarder; aliasing; a link failure and mass withdrawal | 06-06 |
//   | `overlay-packet-walk` | acme-web1 (leaf1.ams) to acme-web2 (leaf2.sin):
//     every lookup and header at every hop across sites | 06-07 |
//   | `mpls-label-switching` | label push at the ingress PE, swap at P routers,
//     penultimate-hop pop, L3VPN inner label | 06-08 |
//
// Which leaf carries which Acme/Globex segment is kept consistent across the
// pack: VNI 10100 (Acme VLAN 100) is on leaf1.ams, leaf3.ams, leaf4.ams,
// leaf1.sin and leaf2.sin; leaf2.ams carries only Globex (VNI 10200, L3VNI
// 50002); acme-db1 is on leaf3.ams in VNI 10101; acme-web2 is dual-homed to
// leaf1.sin and leaf2.sin (the evpn-multihoming scenario), and leaf2.sin is the
// leaf that learned its MAC first (so other scenarios show it behind
// 10.255.2.12).

import {
  ANYCAST_GW_MAC,
  DISTANCE_KM,
  Fab,
  fibreMs,
  fnv32,
  HOSTS,
  ipv4Checksum,
  loopback,
  p2p,
  rd,
  rt,
  TENANTS,
  type FabGen,
  type HeaderSpec,
} from "./fabric-core";

const BCAST = "ff:ff:ff:ff:ff:ff";
const km = (n: number): string => n.toLocaleString("en-US");
/** The EVPN type-2 prefix the way FRR and most NOSes print it. */
const mac2 = (mac: string, ip?: string): string => (ip ? `[2]:[0]:[48]:[${mac}]:[32]:[${ip}]` : `[2]:[0]:[48]:[${mac}]`);

/** An Ethernet header carrying ARP. */
const arpEth = (dst: string, src: string): HeaderSpec => ({ name: "Ethernet", size: 14, fields: { "dst MAC": dst, "src MAC": src, EtherType: "0x0806 (ARP)" } });
/** An ARP request or reply (28 bytes). */
const arp = (op: "request" | "reply", senderMac: string, senderIp: string, targetMac: string, targetIp: string): HeaderSpec => ({
  name: "ARP",
  size: 28,
  fields: { opcode: op === "request" ? "1 (request)" : "2 (reply)", "sender MAC": senderMac, "sender IP": senderIp, "target MAC": targetMac, "target IP": targetIp },
});

/** The outer UDP source port a VTEP derives from a hash of the inner headers (49152-65535). */
const entropyPort = (key: string): number => 49152 + (fnv32(key) % 16384);

// ---------- evpn-mac-learning ----------

/**
 * `evpn-mac-learning` (lesson 06-03). The EVPN control plane between
 * Amsterdam and Singapore, small example (spines not drawn; dashed lines are
 * iBGP sessions in AS 65000). acme-web1 ARPs for its gateway; leaf1.ams
 * learns its MAC on the access port and its IP from the ARP sender fields,
 * and advertises one MAC/IP route (type 2: RD 10.255.1.11:10100, label 1 VNI
 * 10100, label 2 L3VNI 50001, RTs 65000:10100 and 65000:50001, Router MAC and
 * VXLAN encapsulation extended communities). rr1.ams adds ORIGINATOR_ID and
 * CLUSTER_LIST and reflects it to its clients and to rr1.sin; leaf2.ams
 * (Globex only) has no matching import RT and discards it; rr1.sin prepends
 * its cluster ID and reflects it to leaf2.sin, which installs the MAC behind
 * VTEP 10.255.1.11 and an ARP-suppression entry, then answers acme-web2's ARP
 * for 10.1.1.10 locally so nothing is flooded. (Many implementations also send
 * a MAC-only type-2 route; the MAC/IP route alone carries the story.)
 *
 * Inputs: `variant: "mac-move"` continues the run: acme-web1 is live-migrated
 * to leaf4.ams, which advertises the MAC with MAC Mobility sequence 1; the
 * higher sequence wins everywhere, leaf1.ams withdraws its route, and the
 * duplicate-MAC rule (5 moves within 180 s) closes it. 13 frames, 18 with the
 * variant.
 */
export const evpnMacLearning: FabGen = (input) => {
  const move = input.variant === "mac-move";
  const w1 = HOSTS["acme-web1"];
  const w2 = HOSTS["acme-web2"];
  const L1 = "leaf1.ams";
  const L2A = "leaf2.ams";
  const L2S = "leaf2.sin";
  const L4 = "leaf4.ams";
  const RRA = "rr1.ams";
  const RRS = "rr1.sin";
  const vtep1 = loopback(L1);
  const acme = TENANTS.ACME;
  const fab = new Fab(
    [
      { id: RRA, kind: "rr", x: 28, y: 0, state: loopback(RRA) },
      { id: RRS, kind: "rr", x: 76, y: 0, state: loopback(RRS) },
      { id: L1, kind: "leaf", x: 8, y: 55, state: vtep1 },
      { id: L2A, kind: "leaf", x: 40, y: 55, state: "Globex only", tone: "muted" },
      { id: L2S, kind: "leaf", x: 92, y: 55, state: loopback(L2S) },
      { id: "acme-web1", kind: "host", x: 8, y: 100, state: w1.ip },
      { id: "acme-web2", kind: "host", x: 92, y: 100, state: w2.ip },
    ],
    [
      [L1, RRA, { dashed: true, label: "iBGP" }],
      [L2A, RRA, { dashed: true }],
      [RRA, RRS, { dashed: true, label: "iBGP, RR to RR" }],
      [RRS, L2S, { dashed: true }],
      ["acme-web1", L1],
      ["acme-web2", L2S],
    ],
    { height: 310 },
  );
  const rmac1 = fab.portMac(L1, "router MAC");
  const rmac4 = fab.portMac(L4, "router MAC");
  const macTable = (title: string, rows: string[][], tones?: ("done" | "active" | "danger" | undefined)[]) => ({ title, head: ["MAC", "where", "learned"], rows, tones });

  fab.set({ "VNI 10100 leaves shown": "leaf1.ams, leaf2.sin", "leaf2.ams": "Globex only (VNI 10200)" });
  fab.table(0, macTable(`${L1} MAC table, VNI 10100`, [["none yet", "", ""]]));
  fab.table(1, macTable(`${L2S} MAC table, VNI 10100`, [[w2.mac, "port to acme-web2", "locally"]]));
  fab.note(
    `Meridian's overlay control plane across Amsterdam and Singapore, small example: the dashed lines are iBGP sessions in AS 65000, TCP port 179, carried through the spines (not drawn). leaf1.ams and leaf2.ams are clients of the route reflector rr1.ams, leaf2.sin is a client of rr1.sin, and the two reflectors peer with each other (each leaf's second session, to its site's rr2, is left out).`,
    "topology",
  );

  // 1. Local learning.
  fab.headers([arpEth(BCAST, w1.mac), arp("request", w1.mac, w1.ip, "00:00:00:00:00:00", w1.gateway)], "built by acme-web1");
  fab.path(["acme-web1", L1]);
  fab.send(
    "acme-web1",
    L1,
    "ARP who-has 10.1.1.1",
    `acme-web1 boots and, before it can reach anything off its subnet, ARPs for its gateway 10.1.1.1. The broadcast's source MAC is 00:00:5e:00:53:0a, and its ARP sender fields pair that MAC with 10.1.1.10.`,
    { tag: "learn" },
  );

  fab.state(L1, "learned 53:0a", "active");
  fab.table(0, macTable(`${L1} MAC table, VNI 10100`, [[w1.mac, "port 1, VLAN 100", "locally (source MAC)"]], ["active"]));
  fab.table(1, { title: `${L1} ARP table, VRF ACME`, head: ["IP", "MAC", "learned"], rows: [[w1.ip, w1.mac, "ARP sender fields"]], tones: ["active"] });
  fab.headers([arpEth(w1.mac, ANYCAST_GW_MAC), arp("reply", ANYCAST_GW_MAC, w1.gateway, w1.mac, w1.ip)], `sent by ${L1}`);
  fab.send(
    L1,
    "acme-web1",
    "ARP reply: 10.1.1.1 is at 00:00:5e:00:01:01",
    `leaf1.ams learns two facts from that one frame: MAC 00:00:5e:00:53:0a is on access port 1 in VLAN 100 (VNI 10100), and 10.1.1.10 belongs to that MAC. 10.1.1.1 is the anycast gateway address every Acme leaf owns, so leaf1.ams answers the ARP itself, with the gateway MAC 00:00:5e:00:01:01.`,
    { tag: "learn" },
  );

  // 2. The type-2 route.
  fab.clearPath();
  fab.state(L1, vtep1, "done");
  const update = (o: { rd: string; nh: string; mobility?: number }): HeaderSpec[] => [
    { name: "BGP UPDATE", reader: "every BGP speaker that receives it", fields: { "AFI/SAFI": "25/70 (L2VPN EVPN)", ORIGIN: "IGP", AS_PATH: "empty (iBGP)", LOCAL_PREF: 100, NEXT_HOP: o.nh } },
    {
      name: "EVPN type-2 (MAC/IP)",
      tone: "path",
      reader: "leaves that import its route targets",
      fields: { RD: o.rd, ESI: "0 (single-homed)", "Ethernet tag": 0, MAC: w1.mac, IP: w1.ip, "label 1 (L2VNI)": w1.vni, "label 2 (L3VNI)": acme.l3vni },
      highlight: ["MAC", "IP"],
    },
    {
      name: "Extended communities",
      fields: { "route targets": `${rt(w1.vni)}, ${rt(acme.l3vni)}`, encapsulation: "VXLAN (tunnel type 8)", "Router MAC": o.nh === vtep1 ? rmac1 : rmac4, ...(o.mobility !== undefined ? { "MAC Mobility": `sequence ${o.mobility}` } : {}) },
    },
  ];
  fab.headers(update({ rd: rd(L1, w1.vni), nh: vtep1 }), `built by ${L1}`);
  fab.note(
    `leaf1.ams turns what it learned into a BGP EVPN route of type 2, a MAC/IP advertisement: route distinguisher 10.255.1.11:10100 (its loopback and the VNI, so the route is unique fabric-wide), MAC 00:00:5e:00:53:0a, IP 10.1.1.10, VNI 10100 for bridging and L3VNI 50001 for routing, next hop its own VTEP 10.255.1.11. The route targets 65000:10100 and 65000:50001 say which leaves should import it.`,
    "route",
  );

  fab.path([L1, RRA]);
  fab.at(`on the session ${L1} → ${RRA}`);
  fab.send(
    L1,
    RRA,
    "UPDATE type-2 00:00:5e:00:53:0a",
    `The UPDATE goes to rr1.ams over the iBGP session, and an identical copy to rr2.ams. Without reflectors leaf1.ams would need a session to every other leaf, because an iBGP speaker never passes on a route it learned from another iBGP peer.`,
  );

  // 3. Reflection.
  fab.state(RRA, "reflecting", "active");
  fab.patchHeader("BGP UPDATE", { ORIGINATOR_ID: vtep1, CLUSTER_LIST: loopback(RRA) });
  fab.at(`as ${RRA} reflects it`);
  fab.table(0, { title: `${RRA} EVPN table`, head: ["RD", "route", "next hop"], rows: [[rd(L1, w1.vni), mac2(w1.mac, w1.ip), vtep1]], tones: ["active"] });
  fab.table(1, undefined);
  fab.note(
    `rr1.ams adds two attributes before reflecting the route: ORIGINATOR_ID 10.255.1.11, who first sent it, and CLUSTER_LIST 10.255.1.101, its own cluster ID, so a copy that loops back can be recognised and dropped. It leaves NEXT_HOP at 10.255.1.11 and installs nothing for forwarding: a reflector has no VNIs, keeps routes for every route target, and sits outside the data path.`,
    "reflect",
  );

  fab.clearPath();
  fab.path([RRA, L2A]);
  fab.path([RRA, RRS]);
  fab.packets(
    [
      { from: RRA, to: L2A, label: "type-2 53:0a" },
      { from: RRA, to: RRS, label: "type-2 53:0a" },
    ],
    `rr1.ams reflects the route to its other clients, leaf2.ams among them, and to its non-client peer rr1.sin: a route learned from a client is reflected to clients and non-clients alike. Each receiver now decides for itself whether the route concerns it.`,
    "reflect",
  );

  fab.state(RRA, loopback(RRA), "done");
  fab.state(L2A, "discarded", "danger");
  fab.table(0, {
    title: `Import check for route targets ${rt(w1.vni)}, ${rt(acme.l3vni)}`,
    head: ["leaf", "imports", "result"],
    rows: [[L2A, `${rt(10200)}, ${rt(TENANTS.GLOBEX.l3vni)} (Globex)`, "no match: discarded"]],
    tones: ["danger"],
  });
  fab.note(
    `leaf2.ams carries only Globex, whose MAC-VRF and VRF import 65000:10200 and 65000:50002. Neither route target on the update matches, so leaf2.ams discards it: Globex's segment never learns an Acme MAC, which is how route targets keep tenants apart even though both use 10.1.1.0/24.`,
    "import",
  );

  fab.state(L2A, "Globex only", "muted");
  fab.clearPath();
  fab.path([RRS, L2S]);
  fab.state(RRS, "reflecting", "active");
  fab.patchHeader("BGP UPDATE", { CLUSTER_LIST: `${loopback(RRS)}, ${loopback(RRA)}` });
  fab.at(`on the session ${RRS} → ${L2S}`);
  fab.send(
    RRS,
    L2S,
    "type-2 53:0a",
    `rr1.sin learned the route from a non-client, so it reflects it only to its own clients, prepending its cluster ID: CLUSTER_LIST is now 10.255.2.101, 10.255.1.101, and NEXT_HOP is still leaf1.ams's 10.255.1.11. The session between the reflectors crosses the Amsterdam–Singapore circuit, so that one step costs about ${fibreMs(DISTANCE_KM["ams-sin"])} ms.`,
    { tag: "reflect" },
  );

  // 4. Remote install.
  fab.state(RRS, loopback(RRS), "done");
  fab.state(L2S, "installed 53:0a", "active");
  fab.clearPath();
  fab.addRow(0, [L2S, `${rt(w1.vni)} (MAC-VRF), ${rt(acme.l3vni)} (VRF ACME)`, "match: imported"], "done");
  fab.table(1, macTable(`${L2S} MAC table, VNI 10100`, [[w2.mac, "port to acme-web2", "locally"], [w1.mac, `VTEP ${vtep1}`, "EVPN type-2"]], [undefined, "done"]));
  fab.note(
    `leaf2.sin imports the route: 65000:10100 matches its MAC-VRF for VNI 10100 and the next hop 10.255.1.11 resolves through the IS-IS underlay, so it installs 00:00:5e:00:53:0a behind VTEP 10.255.1.11. Through label 2 and 65000:50001 it also installs the host route 10.1.1.10/32 in VRF ACME. Every other leaf with VNI 10100 (leaf3.ams, leaf4.ams and leaf1.sin, not drawn) does the same from its own copy of the route.`,
    "install",
  );

  // 5. ARP suppression.
  fab.table(0, { title: `${L2S} ARP suppression table, VNI 10100`, head: ["IP", "MAC", "from"], rows: [[w1.ip, w1.mac, `type-2 route, next hop ${vtep1}`]], tones: ["active"] });
  fab.headers([arpEth(BCAST, w2.mac), arp("request", w2.mac, w2.ip, "00:00:00:00:00:00", w1.ip)], "built by acme-web2");
  fab.state(L2S, "ARP suppression", "active");
  fab.path(["acme-web2", L2S]);
  fab.send(
    "acme-web2",
    L2S,
    "ARP who-has 10.1.1.10",
    `Later acme-web2 wants to talk to 10.1.1.10 and broadcasts an ARP request for it. leaf2.sin intercepts it, because its ARP suppression table, filled from the same type-2 route, already pairs 10.1.1.10 with 00:00:5e:00:53:0a.`,
    { tag: "suppress" },
  );

  fab.headers([arpEth(w2.mac, w1.mac), arp("reply", w1.mac, w1.ip, w2.mac, w2.ip)], `sent by ${L2S} on acme-web1's behalf`);
  fab.set({ "ARP requests flooded into VNI 10100": 0 });
  fab.send(
    L2S,
    "acme-web2",
    "ARP reply: 10.1.1.10 is at 00:00:5e:00:53:0a",
    `leaf2.sin answers on acme-web1's behalf with 00:00:5e:00:53:0a, so the request is never replicated to other VTEPs: no copy crosses the fabric or the long-haul circuit, and acme-web1 never sees it.`,
    { tag: "suppress", tone: "done" },
  );

  fab.state(L2S, loopback(L2S), "done");
  fab.state("acme-web2", "knows 53:0a", "done");
  fab.headers(undefined);
  fab.clearPath();
  fab.set({ "MAC learned by": "leaf1.ams, from one frame", "told to remote leaves by": "one BGP type-2 route", "frames flooded to find it": 0 });
  fab.note(
    `acme-web2's first frame to 00:00:5e:00:53:0a hits the installed entry and is tunnelled straight to VTEP 10.255.1.11 in VNI 10100. One MAC learned on one port became one BGP route, and every leaf that needed it knew where the host lives before anyone sent it a frame, without flooding anything to find it.`,
    "done",
  );
  if (!move) return fab.f.done();

  // ----- variant: mac-move -----
  fab.addNode({ id: L4, kind: "leaf", x: 64, y: 55, state: loopback(L4) });
  fab.link(L4, RRA, { dashed: true });
  fab.s.links = fab.s.links.filter((l) => !(l.a === "acme-web1" && l.b === L1));
  fab.link("acme-web1", L4);
  fab.node("acme-web1").x = 64;
  fab.state("acme-web2", w2.ip);
  fab.tone("acme-web2");
  fab.state(L4, "learned 53:0a", "active");
  fab.path(["acme-web1", L4]);
  fab.headers([arpEth(BCAST, w1.mac), arp("request", w1.mac, w1.ip, "00:00:00:00:00:00", w1.ip)], "gratuitous ARP after the move");
  fab.unset("MAC learned by", "told to remote leaves by", "frames flooded to find it");
  fab.set({ "VNI 10100 leaves shown": "leaf1.ams, leaf4.ams, leaf2.sin" });
  fab.table(0, {
    title: `${L4}: two sources for 00:00:5e:00:53:0a`,
    head: ["MAC", "where", "learned"],
    rows: [[w1.mac, `VTEP ${vtep1}`, "type-2 from leaf1.ams, no sequence (0)"], [w1.mac, "local port 3", "just learned locally"]],
    tones: ["muted", "active"],
  });
  fab.send(
    "acme-web1",
    L4,
    "gratuitous ARP 10.1.1.10",
    `acme-web1 is a virtual machine, and it is live-migrated to a server behind leaf4.ams; after the move it announces itself with a gratuitous ARP from 00:00:5e:00:53:0a (some hypervisors send RARP instead). leaf4.ams learns the MAC on a local port, yet it already holds a remote route for that MAC from leaf1.ams with no MAC Mobility sequence number, which counts as 0.`,
    { tag: "move" },
  );

  fab.clearPath();
  fab.path([L4, RRA]);
  fab.headers(update({ rd: rd(L4, w1.vni), nh: loopback(L4), mobility: 1 }), `built by ${L4}`);
  fab.at(`on the session ${L4} → ${RRA}`);
  fab.send(
    L4,
    RRA,
    "type-2 53:0a, sequence 1",
    `leaf4.ams advertises its own type-2 route for the MAC: RD 10.255.1.14:10100, next hop 10.255.1.14 and the MAC Mobility extended community with sequence number 1, one higher than the route it replaces. The two routes have different route distinguishers, so to BGP they are separate routes; the sequence number is what tells every leaf which one is current.`,
    { tag: "move" },
  );

  fab.clearPath();
  fab.state(L4, loopback(L4), "done");
  fab.state(L2S, "53:0a moved", "active");
  fab.path([RRS, L2S]);
  fab.table(0, {
    title: `${L2S}: two routes for 00:00:5e:00:53:0a`,
    head: ["RD", "next hop", "MAC Mobility", "result"],
    rows: [[rd(L1, w1.vni), vtep1, "none (0)", "older"], [rd(L4, w1.vni), loopback(L4), "sequence 1", "installed"]],
    tones: ["muted", "done"],
  });
  fab.table(1, macTable(`${L2S} MAC table, VNI 10100`, [[w2.mac, "port to acme-web2", "locally"], [w1.mac, `VTEP ${loopback(L4)}`, "EVPN type-2, seq 1"]], [undefined, "active"]));
  fab.headers(undefined);
  fab.send(
    RRS,
    L2S,
    "type-2 53:0a, sequence 1",
    `Reflected the same way, the new route reaches leaf2.sin, which now holds two routes for 00:00:5e:00:53:0a. The higher MAC Mobility sequence number wins, so leaf2.sin points the MAC at VTEP 10.255.1.14 and Acme's traffic follows the VM without any flooding.`,
    { tag: "move" },
  );

  fab.clearPath();
  fab.state(L2S, loopback(L2S), "done");
  fab.state(L1, "withdrew 53:0a", "compare");
  fab.path([L1, RRA]);
  fab.table(0, {
    title: `Routes for 00:00:5e:00:53:0a in the fabric`,
    head: ["RD", "next hop", "MAC Mobility", "state"],
    rows: [[rd(L1, w1.vni), vtep1, "none (0)", "withdrawn"], [rd(L4, w1.vni), loopback(L4), "sequence 1", "best everywhere"]],
    tones: ["danger", "done"],
  });
  fab.send(
    L1,
    RRA,
    "WITHDRAW type-2 53:0a",
    `leaf1.ams receives the sequence 1 route too, for a MAC it had learned locally. RFC 7432 makes the old owner give way: it flushes its local entry and withdraws its own type-2 route, so only leaf4.ams's route remains.`,
    { tag: "move" },
  );

  fab.clearPath();
  fab.state(L1, vtep1, "done");
  fab.set({ "MAC moves for 53:0a": 1, "duplicate-MAC rule": "5 moves within 180 s" });
  fab.note(
    `Every further move raises the sequence number again. If one MAC moves 5 times within 180 seconds (RFC 7432's defaults), the leaves flag it as a duplicate and stop advertising it, because a MAC bouncing between leaves usually means a layer-2 loop or two hosts sharing a MAC; the MAC-move counter is the signal a platform should alert on.`,
    "done",
  );
  return fab.f.done();
};

// ---------- symmetric-irb ----------

/**
 * `symmetric-irb` (lesson 06-04). acme-web1 (10.1.1.10, VLAN 100, VNI 10100,
 * leaf1.ams) opens a TCP connection to acme-db1 (10.1.2.20, VLAN 200, VNI
 * 10101, leaf3.ams): two subnets of VRF ACME on two leaves, small example with
 * two spines. Symmetric IRB: leaf1.ams routes in VRF ACME (host route
 * 10.1.2.20/32 from leaf3's type-2 route, label 2 = L3VNI 50001), rewrites the
 * inner Ethernet to leaf3's router MAC, encapsulates in VNI 50001; the spine
 * routes on the outer header only; leaf3.ams maps VNI 50001 to VRF ACME and
 * routes again onto VLAN 200. Inner TTL 64 → 63 → 62, real checksums.
 *
 * Inputs: `variant: "asymmetric"` runs the same flow with asymmetric IRB:
 * leaf1.ams has a gateway on 10.1.2.0/24 too, routes straight into VLAN 200
 * with acme-db1's MAC from its ARP table, encapsulates in L2VNI 10101, and
 * leaf3.ams only bridges (TTL 63 at acme-db1). 12 frames, 11 asymmetric.
 */
export const symmetricIrb: FabGen = (input) => {
  const asym = input.variant === "asymmetric";
  const web = HOSTS["acme-web1"];
  const db = HOSTS["acme-db1"];
  const L1 = "leaf1.ams";
  const S1 = "spine1.ams";
  const S2 = "spine2.ams";
  const L3 = "leaf3.ams";
  const fab = new Fab(
    [
      { id: "acme-web1", kind: "host", x: 6, y: 100, state: web.ip },
      { id: L1, kind: "leaf", x: 18, y: 50, state: loopback(L1) },
      { id: S1, kind: "spine", x: 36, y: 0 },
      { id: S2, kind: "spine", x: 64, y: 0, tone: "muted" },
      { id: L3, kind: "leaf", x: 82, y: 50, state: loopback(L3) },
      { id: "acme-db1", kind: "host", x: 94, y: 100, state: db.ip },
    ],
    [
      ["acme-web1", L1, { label: "VLAN 100" }],
      [L1, S1],
      [L1, S2, { tone: "muted" }],
      [S1, L3],
      [S2, L3, { tone: "muted" }],
      [L3, "acme-db1", { label: "VLAN 200" }],
    ],
  );
  const vtep1 = loopback(L1);
  const vtep3 = loopback(L3);
  const l3vni = TENANTS.ACME.l3vni;
  const vni = asym ? db.vni : l3vni;
  const rmac1 = fab.portMac(L1, "router MAC");
  const rmac3 = fab.portMac(L3, "router MAC");
  const mac = { l1up: fab.portMac(L1, S1), s1l1: fab.portMac(S1, L1), s1l3: fab.portMac(S1, L3), l3up: fab.portMac(L3, S1) };
  const ip = { totalLength: 60, id: 0x3a1f, flagsFragment: 0x4000, protocol: 6, src: web.ip, dst: db.ip };
  const sum = (ttl: number) => ipv4Checksum({ ...ip, ttl });
  const ipv4 = (ttl: number): HeaderSpec => ({ name: "IPv4", size: 20, reader: "routers decrement TTL", fields: { src: web.ip, dst: db.ip, TTL: ttl, protocol: "6 (TCP)", "header checksum": sum(ttl) } });
  const eth = (dst: string, src: string): HeaderSpec => ({ name: "Ethernet", size: 14, fields: { "dst MAC": dst, "src MAC": src, EtherType: "0x0800 (IPv4)" } });
  const tcp: HeaderSpec = { name: "TCP", size: 40, reader: "acme-db1 only", fields: { "src port": 51514, "dst port": 5432, flags: "SYN" } };
  const inner = (ttl: number, e?: HeaderSpec) => [...(e ? [e] : []), ipv4(ttl), tcp];
  const sport = entropyPort(`${web.ip}|${db.ip}|6|51514|5432`);
  const vx: HeaderSpec = { name: "VXLAN", size: 8, tone: "path", reader: `${L3} only`, fields: { flags: "0x08 (VNI valid)", VNI: vni }, highlight: ["VNI"] };
  const udp: HeaderSpec = { name: "Outer UDP", size: 8, tone: "path", fields: { "src port": sport, "dst port": 4789 } };
  const oip = (ttl: number): HeaderSpec => ({ name: "Outer IPv4", size: 20, tone: "path", reader: "every underlay router", fields: { src: vtep1, dst: vtep3, TTL: ttl, protocol: "17 (UDP)", "total length": 110 } });
  const oeth = (dst: string, src: string): HeaderSpec => ({ name: "Outer Ethernet", size: 14, tone: "path", reader: "this link only", fields: { "dst MAC": dst, "src MAC": src } });
  // The inner frame as it crosses the fabric.
  const crossing = asym ? inner(63, eth(db.mac, ANYCAST_GW_MAC)) : inner(63, eth(rmac3, rmac1));
  const tunnel = (ttl: number, e: HeaderSpec) => [e, oip(ttl), udp, vx, ...crossing];

  fab.set(asym ? { mode: "asymmetric IRB", "VNI across the fabric": "10101 (destination's L2VNI)" } : { mode: "symmetric IRB", "VNI across the fabric": "50001 (VRF ACME's L3VNI)" });
  fab.table(0, {
    title: asym ? "What each leaf needs (asymmetric IRB)" : "What each leaf needs for this flow (symmetric IRB)",
    head: ["leaf", "L2VNIs and gateways", "L3VNI"],
    rows: asym
      ? [[L1, "10100 (VLAN 100), 10101 (VLAN 200)", "none"], [L3, "10100 (VLAN 100), 10101 (VLAN 200)", "none"]]
      : [[L1, "10100 (VLAN 100, 10.1.1.1)", "50001 (VRF ACME)"], [L3, "10101 (VLAN 200, 10.1.2.1)", "50001 (VRF ACME)"]],
  });
  fab.note(
    asym
      ? `The same Acme flow with asymmetric IRB: acme-web1 10.1.1.10 (VLAN 100, VNI 10100) behind leaf1.ams talks to acme-db1 10.1.2.20 (VLAN 200, VNI 10101) behind leaf3.ams. In this design every leaf with Acme hosts carries all of Acme's subnets, with their gateways and VNIs, and there is no L3VNI.`
      : `Acme's VRF ACME holds two subnets on two Amsterdam leaves (small example, two spines): acme-web1 10.1.1.10 in 10.1.1.0/24 on VLAN 100 (VNI 10100) behind leaf1.ams, and acme-db1 10.1.2.20 in 10.1.2.0/24 on VLAN 200 (VNI 10101) behind leaf3.ams. Both leaves also carry VRF ACME's L3VNI 50001, a VXLAN segment used only for traffic routed between leaves.`,
    "topology",
  );

  fab.table(0, { title: "acme-web1 routing table", head: ["prefix", "via", "interface"], rows: [["10.1.1.0/24", "connected", "eth0"], ["0.0.0.0/0", web.gateway, "eth0"]], tones: [undefined, "active"] });
  fab.table(1, { title: "acme-web1 ARP cache", head: ["IP", "MAC"], rows: [[web.gateway, ANYCAST_GW_MAC]], tones: ["active"] });
  fab.headers(inner(64, eth(ANYCAST_GW_MAC, web.mac)), "built by acme-web1");
  fab.state("acme-web1", "to gateway", "active");
  fab.note(
    `10.1.2.20 is outside acme-web1's subnet, so it sends its TCP SYN (port 51514 to 5432) to the default gateway 10.1.1.1. The Ethernet destination is the anycast gateway MAC 00:00:5e:00:01:01, which every Acme leaf owns, and the IPv4 header carries TTL 64.`,
    "build",
  );

  fab.state("acme-web1", web.ip, "done");
  fab.path(["acme-web1", L1]);
  fab.at(`on the link acme-web1 → ${L1}`);
  fab.send(
    "acme-web1",
    L1,
    "TCP SYN to 10.1.2.20",
    `The frame enters leaf1.ams on an access port in VLAN 100 with destination MAC 00:00:5e:00:01:01, a MAC that leaf1.ams owns itself, so leaf1.ams routes the packet instead of bridging it.`,
  );

  // Ingress leaf.
  fab.state(L1, "route in VRF ACME", "active");
  fab.headers(inner(64), `inside ${L1}`);
  if (asym) {
    fab.table(0, { title: `${L1} VRF ACME routing table`, head: ["prefix", "next hop", "via"], rows: [["10.1.1.0/24", "connected", "VLAN 100"], ["10.1.2.0/24", "connected", "VLAN 200"]], tones: [undefined, "active"] });
    fab.table(1, { title: `${L1} ARP table, VLAN 200`, head: ["IP", "MAC", "learned"], rows: [[db.ip, db.mac, `type-2 route from ${vtep3}`]], tones: ["active"] });
    fab.note(
      `leaf1.ams has a gateway on 10.1.2.0/24 as well, so in VRF ACME the destination is directly connected on VLAN 200. Its ARP table, filled from leaf3.ams's type-2 route, maps 10.1.2.20 to acme-db1's MAC 00:00:5e:00:53:14, so leaf1.ams can route the packet into VLAN 200 as if acme-db1 were attached locally.`,
      "lookup",
    );
  } else {
    fab.table(0, {
      title: `${L1} VRF ACME routing table`,
      head: ["prefix", "next hop", "via"],
      rows: [["10.1.1.0/24", "connected", "VLAN 100"], ["10.1.2.0/24", `VTEP ${vtep3}`, "L3VNI 50001, type-5"], ["10.1.2.20/32", `VTEP ${vtep3}`, "L3VNI 50001, type-2"]],
      tones: [undefined, undefined, "active"],
    });
    fab.table(1, {
      title: "The type-2 route behind 10.1.2.20/32",
      head: ["field", "value"],
      rows: [["RD", rd(L3, db.vni)], ["MAC / IP", `${db.mac} / ${db.ip}`], ["labels 1 / 2", `${db.vni} / ${l3vni}`], ["route targets", `${rt(db.vni)}, ${rt(l3vni)}`], ["Router MAC", rmac3]],
      tones: [undefined, undefined, "active", undefined, "active"],
    });
    fab.note(
      `VLAN 100's gateway interface belongs to VRF ACME, so leaf1.ams looks up 10.1.2.20 in that VRF. The longest match is the host route 10.1.2.20/32, installed from leaf3.ams's type-2 route: next hop VTEP 10.255.1.13 over L3VNI 50001, with leaf3's router MAC ${rmac3} taken from the route's Router MAC extended community.`,
      "lookup",
    );
  }

  fab.headers(crossing, `routed by ${L1}`);
  fab.note(
    asym
      ? `leaf1.ams routes into VLAN 200: TTL 64 becomes 63, the checksum is recomputed (${sum(64)} becomes ${sum(63)}), and the new Ethernet header runs from the VLAN 200 gateway MAC 00:00:5e:00:01:01 to acme-db1's own MAC 00:00:5e:00:53:14. From here the packet is only bridged, in VNI 10101, so this is already the frame acme-db1 will receive.`
      : `leaf1.ams routes: TTL 64 becomes 63 and the checksum is recomputed (${sum(64)} becomes ${sum(63)}). The new inner Ethernet header runs from leaf1's router MAC ${rmac1} to leaf3's router MAC ${rmac3}: on the L3VNI the inner frame is addressed to the egress leaf, not to acme-db1, and no ARP is needed for it.`,
    "route",
  );

  fab.headers(tunnel(64, oeth(mac.s1l1, mac.l1up)), `encapsulated by ${L1}`);
  fab.table(0, { title: `${L1} underlay route to ${vtep3}`, head: ["prefix", "next hop", "via"], rows: [[`${vtep3}/32`, S1, "IS-IS"], [`${vtep3}/32`, S2, "IS-IS"]], tones: ["active", undefined] });
  if (asym) fab.table(1, { title: `${L1} MAC table, VNI 10101`, head: ["MAC", "where", "learned"], rows: [[db.mac, `VTEP ${vtep3}`, "type-2 route"]], tones: ["active"] });
  else fab.table(1, undefined);
  fab.set({ "outer headers": "50 B" });
  fab.note(
    asym
      ? `leaf1.ams now bridges in VNI 10101: its MAC table puts 00:00:5e:00:53:14 behind VTEP 10.255.1.13, so it encapsulates the frame in VXLAN with VNI 10101, the destination subnet's L2VNI. Outer UDP to port 4789 and outer IPv4 from 10.255.1.11 to 10.255.1.13 follow, and the underlay hash picks spine1.ams.`
      : `leaf1.ams encapsulates the routed frame in VXLAN with VNI 50001, Acme's L3VNI, not 10101: the VNI names the tenant's routing table on the far side, not the destination subnet. Outer UDP to port 4789 and outer IPv4 from VTEP 10.255.1.11 to 10.255.1.13 follow, and the underlay hash picks spine1.ams.`,
    "encap",
  );

  fab.state(L1, vtep1, "done");
  fab.path([L1, S1]);
  fab.at(`on the link ${L1} → ${S1}`);
  fab.send(L1, S1, `VXLAN VNI ${vni}`, `To the underlay this is a 110-byte UDP packet from 10.255.1.11 to 10.255.1.13 with outer TTL 64; the tenant's routed frame is only payload.`);

  fab.headers(tunnel(63, oeth(mac.l3up, mac.s1l3)), `leaving ${S1}`);
  fab.state(S1, "outer IP only", "done");
  fab.path([S1, L3]);
  fab.at(`on the link ${S1} → ${L3}`);
  fab.send(
    S1,
    L3,
    `VXLAN VNI ${vni}`,
    `spine1.ams routes on the outer IPv4 destination alone: outer TTL 63 and new outer MACs, while the VNI ${vni} frame inside is untouched. The spine holds no Acme routes and no idea that VRF ACME exists.`,
  );

  // Egress leaf.
  fab.headers(crossing, `inside ${L3}, after decapsulation`);
  fab.set({ "outer headers": "0 B (removed)" });
  if (asym) {
    fab.state(L3, "bridge in VLAN 200", "active");
    fab.table(0, { title: `${L3} VNI map`, head: ["VNI", "maps to"], rows: [["10101", "VLAN 200 (L2)"], ["10100", "VLAN 100 (L2)"]], tones: ["active", undefined] });
    fab.table(1, { title: `${L3} MAC table, VNI 10101`, head: ["MAC", "where"], rows: [[db.mac, "port to acme-db1"]], tones: ["active"] });
    fab.note(
      `leaf3.ams owns the outer destination, strips the 50 bytes of outer headers and reads VNI 10101, which maps to VLAN 200. The inner destination MAC 00:00:5e:00:53:14 is on a local port, so leaf3.ams simply bridges the frame: no routing lookup and no TTL change.`,
      "decap",
    );
  } else {
    fab.state(L3, "route in VRF ACME", "active");
    fab.table(0, { title: `${L3} VNI map`, head: ["VNI", "maps to"], rows: [["50001", "VRF ACME (L3)"], ["10101", "VLAN 200 (L2)"]], tones: ["active", undefined] });
    fab.table(1, {
      title: `${L3} VRF ACME routing table`,
      head: ["prefix", "next hop", "via"],
      rows: [["10.1.2.0/24", "connected", "VLAN 200"], ["10.1.2.20/32", "local host", `ARP ${db.mac}`], ["10.1.1.10/32", `VTEP ${vtep1}`, "L3VNI 50001, type-2"]],
      tones: [undefined, "active", undefined],
    });
    fab.note(
      `leaf3.ams owns the outer destination, so it strips the 50 bytes of outer headers and reads VNI 50001, which maps to VRF ACME rather than to a VLAN. The inner destination MAC is its own router MAC, so it routes the packet again in VRF ACME, where 10.1.2.20 is a local host on VLAN 200.`,
      "decap",
    );

    fab.headers(inner(62, eth(db.mac, ANYCAST_GW_MAC)), `routed by ${L3}`);
    fab.note(
      `leaf3.ams decrements the TTL to 62, recomputes the checksum (${sum(62)}) and writes the last Ethernet header, from VLAN 200's gateway MAC 00:00:5e:00:01:01 to acme-db1's MAC 00:00:5e:00:53:14 from its local ARP table.`,
      "route",
    );
  }

  fab.state(L3, vtep3, "done");
  fab.path([L3, "acme-db1"]);
  fab.at(`on the link ${L3} → acme-db1`);
  fab.send(
    L3,
    "acme-db1",
    `TCP SYN, TTL ${asym ? 63 : 62}`,
    asym
      ? `acme-db1 receives the SYN with TTL 63: it was routed once, at leaf1.ams, so a traceroute from acme-web1 shows leaf1.ams and then acme-db1.`
      : `acme-db1 receives the SYN with TTL 62: it was routed twice, once at each leaf, so a traceroute from acme-web1 shows two hops before acme-db1, leaf1.ams and leaf3.ams, and never a spine. Both leaves answer from addresses in VRF ACME, often the anycast gateway, so the hop addresses alone may not say which leaf it was.`,
    { tone: "done" },
  );

  fab.state("acme-db1", "SYN received", "done");
  fab.clearPath();
  fab.headers(undefined);
  fab.set({ "inner TTL": asym ? "64 → 63 (routed once)" : "64 → 63 → 62 (routed twice)" });
  fab.table(0, {
    title: asym ? "What each leaf must hold (asymmetric IRB)" : "What each leaf must hold (symmetric IRB)",
    head: ["leaf", "state"],
    rows: asym
      ? [[L1, "VNIs 10100 and 10101, both gateways, acme-db1's MAC and ARP entry"], [L3, "VNIs 10100 and 10101, both gateways, acme-web1's MAC and ARP entry"]]
      : [[L1, "VNI 10100, L3VNI 50001, the 10.1.2.20/32 route and leaf3's router MAC"], [L3, "VNI 10101, L3VNI 50001, the 10.1.1.10/32 route and leaf1's router MAC"]],
  });
  fab.table(1, undefined);
  fab.note(
    asym
      ? `Asymmetric IRB routes only at the ingress and bridges in the destination's L2VNI; the reply is routed at leaf3.ams into VLAN 100 and travels in VNI 10100, so the two directions use different VNIs. It works, but every leaf must carry every subnet of the tenant with all of its MACs and ARP entries, which is what stops it scaling.`
      : `Symmetric IRB: routed at the ingress leaf, carried in L3VNI 50001, routed again at the egress leaf, and the reply does exactly the same in reverse. No leaf needs a remote subnet's VLAN, VNI or MAC table, only one L3VNI per tenant, host routes and router MACs, which is why large EVPN fabrics use it.`,
    "done",
  );
  return fab.f.done();
};

// ---------- bum-replication ----------

/**
 * `bum-replication` (lesson 06-05). VNI 10100 spans five VTEPs: leaf1.ams,
 * leaf3.ams, leaf4.ams, leaf1.sin and leaf2.sin (leaf2.ams is Globex only).
 * Small example: spine1.ams, spine2.ams and spine1.sin are drawn. acme-web1
 * ARPs for 10.1.1.50, an address no leaf has learned, so the broadcast must be
 * flooded. Part 1, ingress replication: leaf1.ams builds its flood list from
 * the type-3 (IMET) routes, PMSI tunnel type 6, and sends four unicast copies
 * (110 bytes each), two of them over the same ams-sin circuit; replication cost
 * n-1 per BUM frame. Part 2, underlay multicast: VNI 10100 mapped to group
 * 239.1.1.100 (MAC 01:00:5e:01:01:64), PIM sparse mode, RP on spine1.ams;
 * leaf1.ams sends one copy and the tree replicates at its branches. Ends with
 * the comparison and which one large fabrics choose.
 *
 * Inputs: none. 13 frames.
 */
export const bumReplication: FabGen = () => {
  const w1 = HOSTS["acme-web1"];
  const L1 = "leaf1.ams";
  const L2 = "leaf2.ams";
  const L3 = "leaf3.ams";
  const L4 = "leaf4.ams";
  const L1S = "leaf1.sin";
  const L2S = "leaf2.sin";
  const S1 = "spine1.ams";
  const S2 = "spine2.ams";
  const S1S = "spine1.sin";
  const ams = [L1, L2, L3, L4];
  const fab = new Fab(
    [
      { id: S1, kind: "spine", x: 22, y: 0 },
      { id: S2, kind: "spine", x: 50, y: 0 },
      { id: S1S, kind: "spine", x: 85, y: 0 },
      { id: L1, kind: "leaf", x: 7, y: 55, state: loopback(L1) },
      { id: L2, kind: "leaf", x: 24, y: 55, state: "Globex only", tone: "muted" },
      { id: L3, kind: "leaf", x: 41, y: 55, state: loopback(L3) },
      { id: L4, kind: "leaf", x: 58, y: 55, state: loopback(L4) },
      { id: L1S, kind: "leaf", x: 76, y: 55, state: loopback(L1S) },
      { id: L2S, kind: "leaf", x: 94, y: 55, state: loopback(L2S) },
      { id: "acme-web1", kind: "host", x: 7, y: 100, state: w1.ip },
    ],
    [
      ...ams.flatMap((l) => [[l, S1], [l, S2]] as [string, string][]),
      [S1, S1S, { label: `${km(DISTANCE_KM["ams-sin"])} km` }],
      [S1S, L1S],
      [S1S, L2S],
      ["acme-web1", L1],
    ],
    { height: 300 },
  );
  const members = [L3, L4, L1S, L2S];
  const sport = entropyPort(`${w1.mac}|${BCAST}|0x0806`);
  const inner: HeaderSpec[] = [arpEth(BCAST, w1.mac), { ...arp("request", w1.mac, w1.ip, "00:00:00:00:00:00", "10.1.1.50"), size: "28 B + 18 B padding" }];
  const vx: HeaderSpec = { name: "VXLAN", size: 8, tone: "path", reader: "each receiving VTEP", fields: { flags: "0x08 (VNI valid)", VNI: w1.vni }, highlight: ["VNI"] };
  const udp: HeaderSpec = { name: "Outer UDP", size: 8, tone: "path", fields: { "src port": sport, "dst port": 4789 } };
  const oip = (dst: string): HeaderSpec => ({ name: "Outer IPv4", size: 20, tone: "path", reader: "every underlay router", fields: { src: loopback(L1), dst, TTL: 64, protocol: "17 (UDP)", "total length": 96 } });
  const oeth = (dst: string): HeaderSpec => ({ name: "Outer Ethernet", size: 14, tone: "path", reader: "this link only", fields: { "dst MAC": dst, "src MAC": fab.portMac(L1, S1) } });
  const via: Record<string, string> = { [L3]: S1, [L4]: S2, [L1S]: S1, [L2S]: S1 };

  fab.set({ "VNI 10100 VTEPs": 5, "leaf2.ams": "Globex only, not in VNI 10100" });
  fab.note(
    `Meridian's VNI 10100 (Acme VLAN 100) spans five VTEPs: leaf1.ams, leaf3.ams and leaf4.ams in Amsterdam, and leaf1.sin and leaf2.sin in Singapore; leaf2.ams carries only Globex and has no VNI 10100. Small example: the two Amsterdam spines and spine1.sin are drawn, and spine2.sin with its circuit is left out.`,
    "topology",
  );

  fab.headers(
    [
      {
        name: "EVPN type-3 (inclusive multicast), from leaf3.ams",
        tone: "path",
        reader: "every leaf with VNI 10100",
        fields: { RD: rd(L3, w1.vni), "Ethernet tag": 0, "originating router": loopback(L3), "PMSI tunnel type": "6 (ingress replication)", "PMSI label (VNI)": w1.vni, "tunnel endpoint": loopback(L3), "route target": rt(w1.vni) },
      },
    ],
    "one of the four type-3 routes leaf1.ams imported",
  );
  fab.table(0, {
    title: `${L1} flood list for VNI 10100`,
    head: ["remote VTEP", "leaf", "from"],
    rows: members.map((m) => [loopback(m), m, `type-3, RD ${rd(m, w1.vni)}`]),
  });
  fab.tones(members, "frontier");
  fab.note(
    `Every VTEP with VNI 10100 advertised one EVPN type-3 route, inclusive multicast Ethernet tag, which says "send this VNI's broadcast, unknown-unicast and multicast traffic to me"; its PMSI tunnel attribute, type 6, asks for ingress replication. leaf1.ams turned the four it imported into its flood list for VNI 10100, and leaf2.ams, which sent none, is not on it.`,
    "type3",
  );

  fab.tones(members, undefined);
  fab.headers(inner, "built by acme-web1");
  fab.path(["acme-web1", L1]);
  fab.send(
    "acme-web1",
    L1,
    "ARP who-has 10.1.1.50",
    `acme-web1 ARPs for 10.1.1.50, an address no leaf has learned (the host is silent or not up yet), so ARP suppression has no answer and the broadcast must reach every VTEP in the segment. Broadcast, unknown-unicast and multicast frames together are called BUM traffic.`,
    { tag: "bum" },
  );

  // ----- ingress replication -----
  fab.clearPath();
  fab.state(L1, "4 copies", "active");
  fab.headers([oeth(fab.portMac(S1, L1)), oip(loopback(L3)), udp, vx, ...inner], "copy 1 of 4, built by leaf1.ams");
  fab.table(1, { title: "Copies leaf1.ams sends (ingress replication)", head: ["copy", "outer dst", "uplink", "bytes"], rows: members.map((m, i) => [String(i + 1), loopback(m), via[m]!, "110"]), tones: ["active"] });
  fab.set({ "copies at leaf1.ams": 4, "bytes on leaf1 uplinks": "4 × 110 = 440 B" });
  fab.note(
    `With ingress replication leaf1.ams makes one copy per VTEP on its flood list, four in all. Each is an ordinary unicast VXLAN packet of 110 bytes (the padded 60-byte ARP frame plus 50 bytes of outer headers) with VNI 10100 and its own outer destination; the copy shown goes to 10.255.1.13.`,
    "replicate",
  );

  fab.path([L1, S1], "path");
  fab.path([L1, S2], "path");
  fab.packets(
    members.map((m, i) => ({ from: L1, to: via[m]!, label: `copy → ${m}`, progress: 0.3 + 0.15 * i })),
    `All four copies leave on leaf1.ams's own uplinks: the ingress leaf's ASIC does all of the replication, and its uplinks carry four 110-byte packets, 440 bytes, for one 60-byte frame. The outer destinations differ, so the underlay hash spreads them; here the copy for leaf4.ams takes spine2.ams and the other three take spine1.ams.`,
    "replicate",
  );

  fab.path([S1, L3]);
  fab.path([S2, L4]);
  fab.path([S1, S1S]);
  fab.linkSet(S1, S1S, { width: 0.4, label: "2 copies" });
  fab.packets(
    [
      { from: S1, to: L3, label: "copy → leaf3.ams" },
      { from: S2, to: L4, label: "copy → leaf4.ams" },
      { from: S1, to: S1S, label: "copy → leaf1.sin", progress: 0.35 },
      { from: S1, to: S1S, label: "copy → leaf2.sin", progress: 0.65 },
    ],
    `The spines forward each copy as plain unicast on its outer address: one down to leaf3.ams, one down to leaf4.ams, and two across the ${km(DISTANCE_KM["ams-sin"])} km circuit to Singapore, because each Singapore VTEP gets its own copy even though both copies share the circuit.`,
    "replicate",
  );

  fab.path([S1S, L1S]);
  fab.path([S1S, L2S]);
  fab.tones(members, "done");
  fab.packets(
    [
      { from: S1S, to: L1S, label: "copy → leaf1.sin" },
      { from: S1S, to: L2S, label: "copy → leaf2.sin" },
    ],
    `Each receiving VTEP decapsulates its copy and floods the ARP to its own VLAN 100 ports, while leaf2.ams never sees one. Where a server is dual-homed, as acme-web2 is to leaf1.sin and leaf2.sin, only the designated forwarder passes it down (lesson 06-06).`,
    "replicate",
  );

  fab.clearPath();
  fab.linkSet(S1, S1S, { width: 0, label: `${km(DISTANCE_KM["ams-sin"])} km` });
  fab.tones(members, undefined);
  fab.state(L1, loopback(L1));
  fab.tone(L1);
  fab.headers(undefined);
  fab.table(0, {
    title: "Ingress replication cost of one 110-byte BUM frame",
    head: ["VTEPs in the VNI", "copies at the ingress leaf", "bytes on its uplinks"],
    rows: [5, 16, 64, 256].map((n) => [String(n), String(n - 1), `${km((n - 1) * 110)} B`]),
    tones: ["active"],
  });
  fab.table(1, undefined);
  fab.note(
    `The cost grows with the segment: a VNI on n VTEPs costs n − 1 copies of every BUM frame at the ingress leaf, so one broadcast on a 256-VTEP segment puts 255 copies on a single leaf's uplinks. In return the underlay stays unicast-only and holds no multicast state at all.`,
    "cost",
  );

  // ----- underlay multicast -----
  const group = "239.1.1.100";
  const gmac = "01:00:5e:01:01:64";
  for (const [a, b] of [[L1, S1], [S1, L3], [S1, L4], [S1, S1S], [S1S, L1S], [S1S, L2S]] as [string, string][]) fab.linkSet(a, b, { tone: "frontier" });
  fab.state(S1, "RP", "compare");
  fab.set({ mode: "underlay multicast", "VNI 10100 group": group, RP: "spine1.ams" });
  fab.unset("copies at leaf1.ams", "bytes on leaf1 uplinks");
  fab.table(0, {
    title: `Multicast routing state for ${group}`,
    head: ["router", "entry", "sends copies to"],
    rows: [
      [S1, `(*, ${group})`, "leaf1.ams, leaf3.ams, leaf4.ams, spine1.sin"],
      [S1S, `(*, ${group})`, "leaf1.sin, leaf2.sin"],
      [S2, "none", "no receiver joined through it"],
      [L2, "none", "not in VNI 10100"],
    ],
  });
  fab.note(
    `The alternative maps VNI 10100 to an underlay multicast group, ${group} here, and runs PIM sparse mode on every underlay router with the rendezvous point (RP) on spine1.ams. Each VTEP in the VNI joins the group, and the joins build one tree from the RP down to exactly those VTEPs; leaf2.ams never joined and has no branch. Where type-3 routes are still sent, their PMSI tunnel type becomes 4 (PIM-SM tree) with the group address, instead of 6.`,
    "mcast",
  );

  fab.headers([{ ...oeth(gmac), fields: { "dst MAC": gmac, "src MAC": fab.portMac(L1, S1) } }, oip(group), udp, vx, ...inner], "the only copy leaf1.ams sends");
  fab.state(L1, "1 copy", "active");
  fab.set({ "copies at leaf1.ams": 1 });
  fab.path([L1, S1]);
  fab.send(
    L1,
    S1,
    `1 copy to ${group}`,
    `Now leaf1.ams sends the same broadcast once: a single VXLAN packet to outer destination ${group}, with destination MAC ${gmac} built from the group's low 23 bits. Strictly, the very first packets reach the RP wrapped in unicast PIM Register messages until spine1.ams joins a source tree back towards leaf1.ams; because the RP sits on leaf1's own uplink, that tree is this same link.`,
    { tag: "mcast" },
  );

  fab.state(L1, loopback(L1));
  fab.tone(L1);
  fab.path([S1, L3]);
  fab.path([S1, L4]);
  fab.path([S1, S1S]);
  fab.packets(
    [
      { from: S1, to: L3, label: "copy" },
      { from: S1, to: L4, label: "copy" },
      { from: S1, to: S1S, label: "1 copy" },
    ],
    `spine1.ams replicates the packet only where the tree branches: one copy down to leaf3.ams, one to leaf4.ams and a single copy across the long-haul circuit. The replication has moved from the ingress leaf into the underlay routers, which now have to hold per-group state.`,
    "mcast",
  );

  fab.path([S1S, L1S]);
  fab.path([S1S, L2S]);
  fab.tones(members, "done");
  fab.packets(
    [
      { from: S1S, to: L1S, label: "copy" },
      { from: S1S, to: L2S, label: "copy" },
    ],
    `spine1.sin makes the last two copies, for leaf1.sin and leaf2.sin. Every VTEP still received exactly one copy, but leaf1.ams's uplink carried one packet instead of four and the circuit one instead of two.`,
    "mcast",
  );

  fab.clearPath();
  fab.tones(members, undefined);
  fab.state(S1, undefined);
  fab.tone(S1);
  fab.headers(undefined);
  fab.unset("copies at leaf1.ams", "mode");
  fab.table(0, {
    title: "Ingress replication vs underlay multicast",
    head: ["", "ingress replication", "underlay multicast"],
    rows: [
      ["copies on leaf1's uplinks", "4", "1"],
      ["copies on the ams–sin circuit", "2", "1"],
      ["underlay state", "none", "(*,G) per group, plus (S,G) per sending VTEP, on the routers in each tree"],
      ["control plane", "EVPN type-3 routes", "PIM-SM, an RP, VNI-to-group mapping"],
      ["how it breaks", "replication load on the ingress leaf", "RP or PIM faults, partial trees"],
    ],
  });
  fab.note(
    `Most large EVPN fabrics choose ingress replication: with ARP suppression BUM traffic is a trickle, ASICs replicate at line rate, and an underlay without multicast removes a whole protocol to operate and debug. Underlay multicast pays off when segments span hundreds of VTEPs and carry real multicast or heavy flooding.`,
    "done",
  );
  return fab.f.done();
};

// ---------- evpn-multihoming ----------

/**
 * `evpn-multihoming` (lesson 06-06). acme-web2 (10.1.1.11, VNI 10100) is
 * dual-attached with an LACP bond to leaf1.sin and leaf2.sin, which share
 * ethernet segment ESI 03:00:00:5e:00:53:7e:00:00:01 (type 3, from the pair's
 * LACP system MAC). Type-4 routes (ES-Import RT 00:00:5e:00:53:7e) find the
 * peers; DF election by modulo (VLAN 100 or VNI 10100 mod 2 = 0 → leaf1.sin,
 * the lower address); type-1 routes per ES and per EVI; leaf2.sin learns the
 * MAC and advertises it with the ESI; the remote leaf1.ams aliases it over
 * both VTEPs; BUM delivered once by the DF, local-bias split horizon (RFC 8365);
 * the leaf2.sin member link fails, one per-ES type-1 withdrawal (mass
 * withdrawal) removes 10.255.2.12 for every MAC on the segment; closes with
 * EVPN multihoming vs MLAG.
 *
 * Inputs: none. 14 frames.
 */
export const evpnMultihoming: FabGen = () => {
  const w1 = HOSTS["acme-web1"];
  const w2 = HOSTS["acme-web2"];
  const L1 = "leaf1.ams";
  const A = "leaf1.sin";
  const B = "leaf2.sin";
  const RR = "rr1.sin";
  const vA = loopback(A);
  const vB = loopback(B);
  const ESI = "03:00:00:5e:00:53:7e:00:00:01";
  const fab = new Fab(
    [
      { id: RR, kind: "rr", x: 40, y: 0, state: loopback(RR) },
      { id: A, kind: "leaf", x: 70, y: 25, state: vA },
      { id: L1, kind: "leaf", x: 10, y: 50, state: loopback(L1) },
      { id: "acme-web2", kind: "server", x: 95, y: 50, state: w2.ip },
      { id: B, kind: "leaf", x: 70, y: 75, state: vB },
      { id: "acme-web1", kind: "host", x: 10, y: 100, state: w1.ip },
    ],
    [
      [RR, A, { dashed: true }],
      [RR, B, { dashed: true }],
      [RR, L1, { dashed: true, label: "iBGP via rr1.ams" }],
      [L1, A, { label: "VXLAN", tone: "muted" }],
      [L1, B, { label: "VXLAN", tone: "muted" }],
      ["acme-web2", A, { label: "bond" }],
      ["acme-web2", B, { label: "bond" }],
      ["acme-web1", L1],
    ],
    { height: 340 },
  );
  const tunnels = () => {
    fab.linkSet(L1, A, { tone: "muted" });
    fab.linkSet(L1, B, { tone: "muted" });
  };

  fab.set({ ESI, "segment members": "leaf1.sin, leaf2.sin" });
  fab.note(
    `acme-web2 is dual-attached with an LACP bond to leaf1.sin and leaf2.sin. Both leaves configure the same ethernet segment identifier (ESI) ${ESI} on their bond port and present the same LACP system ID, so the server sees one partner; leaf1.ams, with acme-web1 behind it, is a remote VTEP in VNI 10100 (small example: spines not drawn, dashed lines are iBGP sessions).`,
    "topology",
  );

  fab.headers([{ name: "EVPN type-4 (ethernet segment), from leaf1.sin", tone: "path", reader: "only leaves on the same segment", fields: { ESI, "originating router": vA, "ES-Import route target": "00:00:5e:00:53:7e" } }], "type-4 route");
  fab.path([A, RR]);
  fab.path([B, RR]);
  fab.packets(
    [
      { from: A, to: RR, label: "type-4 ESI …:01" },
      { from: B, to: RR, label: "type-4 ESI …:01" },
    ],
    `Each leaf advertises a type-4 ethernet segment route for the ESI. Its ES-Import route target, 00:00:5e:00:53:7e, is derived from the ESI itself, so only leaves attached to the same segment import it: leaf1.sin and leaf2.sin discover each other, and leaf1.ams ignores both routes.`,
    "type4",
  );

  fab.clearPath();
  fab.state(A, "DF", "done");
  fab.state(B, "non-DF", "compare");
  fab.headers(undefined);
  fab.table(0, {
    title: `Designated forwarder election for ${ESI}`,
    head: ["ordinal", "leaf", "VTEP", "role for VLAN 100"],
    rows: [["0", A, vA, "DF"], ["1", B, vB, "non-DF"]],
    tones: ["done", undefined],
  });
  fab.note(
    `After a 3-second wait for every peer's type-4 route, both leaves run the same election: list the segment's leaves by address, 10.255.2.11 then 10.255.2.12, and take the service's VLAN or VNI (100 or 10100, both even) modulo 2, the number of leaves on the segment, which gives ordinal 0. leaf1.sin becomes the designated forwarder (DF), the only leaf allowed to send broadcast, unknown-unicast and multicast traffic from the fabric down to acme-web2.`,
    "df",
  );

  fab.path([A, RR]);
  fab.path([B, RR]);
  fab.table(1, {
    title: "Type-1 (Ethernet auto-discovery) routes, from each leaf",
    head: ["route", "Ethernet tag", "label or flag", "used for"],
    rows: [["A-D per ES", "MAX-ET (0xFFFFFFFF)", "ESI label ext. community: all-active", "mass withdrawal"], ["A-D per EVI", "0", "VNI 10100", "aliasing"]],
  });
  fab.packets(
    [
      { from: A, to: RR, label: "type-1 ×2" },
      { from: B, to: RR, label: "type-1 ×2" },
    ],
    `Each leaf also advertises two type-1 Ethernet auto-discovery routes for the segment: one per ES, flagged all-active, which remote leaves use for mass withdrawal, and one per EVI with VNI 10100, which they use for aliasing. Both are reflected to every leaf that imports VNI 10100's route target, leaf1.ams included.`,
    "type1",
  );

  fab.clearPath();
  fab.path(["acme-web2", B]);
  fab.table(1, { title: `${B} advertises`, head: ["route", "ESI", "next hop"], rows: [[mac2(w2.mac, w2.ip), ESI, vB]], tones: ["active"] });
  fab.send(
    "acme-web2",
    B,
    "frame from 00:00:5e:00:53:0b",
    `acme-web2 sends its first frame, and the LACP hash in the server puts it on the link to leaf2.sin. leaf2.sin learns 00:00:5e:00:53:0b on the bond and advertises a type-2 route for it whose ESI field is the segment's, not 0; leaf1.sin has not seen a frame from that MAC.`,
    { tag: "learn" },
  );

  fab.clearPath();
  fab.state(A, "53:0b on bond", "done");
  fab.path([RR, A]);
  fab.send(
    RR,
    A,
    "type-2 53:0b, ESI …:01",
    `The reflector passes the type-2 route to leaf1.sin as well. It carries leaf1.sin's own ESI, so leaf1.sin installs 00:00:5e:00:53:0b on its local bond port, without waiting to see a frame from the MAC itself.`,
    { tag: "sync" },
  );

  fab.clearPath();
  fab.state(A, "DF", "done");
  fab.state(L1, "aliasing", "active");
  fab.table(0, {
    title: `${L1} MAC table, VNI 10100`,
    head: ["MAC", "ESI", "VTEPs"],
    rows: [[w2.mac, ESI, `${vA}, ${vB}`]],
    tones: ["active"],
  });
  fab.table(1, {
    title: `What ${L1} combined`,
    head: ["route", "from", "says"],
    rows: [["type-2 53:0b, ESI …:01", B, "the MAC is on segment …:01"], ["type-1 per EVI, ESI …:01", A, "I reach …:01 in VNI 10100"], ["type-1 per EVI, ESI …:01", B, "I reach …:01 in VNI 10100"]],
  });
  fab.note(
    `leaf1.ams received the MAC from leaf2.sin only, but the per-EVI type-1 routes say both leaf1.sin and leaf2.sin reach that segment in VNI 10100. So it installs 00:00:5e:00:53:0b behind both VTEPs, 10.255.2.11 and 10.255.2.12: this is aliasing.`,
    "alias",
  );

  fab.linkSet(L1, A, { tone: "path" });
  fab.linkSet(L1, B, { tone: "path" });
  fab.set({ "unicast to 53:0b": "hashed over both VTEPs" });
  fab.packets(
    [
      { from: L1, to: A, label: "flow 1 → 10.255.2.11" },
      { from: L1, to: B, label: "flow 2 → 10.255.2.12" },
    ],
    `acme-web1's flows to acme-web2 are now hashed over both VTEPs, so both bond links carry traffic. Without aliasing every flow would go to leaf2.sin, the leaf that happened to learn the MAC, and leaf1.sin's link would sit idle.`,
    "alias",
  );

  // BUM: DF delivers once.
  tunnels();
  fab.state(L1, loopback(L1));
  fab.tone(L1);
  fab.linkSet("acme-web2", A, { tone: "done" });
  fab.packets(
    [
      { from: L1, to: A, label: "BUM copy", progress: 0.6 },
      { from: L1, to: B, label: "BUM copy", progress: 0.6 },
      { from: A, to: "acme-web2", label: "BUM copy (DF)", tone: "done" },
      { from: B, to: "acme-web2", label: "non-DF: blocked", lost: true },
    ],
    `A broadcast from acme-web1 reaches both Singapore leaves, because ingress replication sends a copy to every VTEP in VNI 10100. Only leaf1.sin, the DF, sends it down the bond, and non-DF leaf2.sin drops its copy for the segment, so acme-web2 receives the broadcast exactly once.`,
    "df",
  );

  fab.linkSet("acme-web2", A, { tone: undefined });
  fab.packets(
    [
      { from: B, to: A, label: "VXLAN copy, src 10.255.2.12" },
      { from: B, to: L1, label: "VXLAN copy" },
      { from: A, to: "acme-web2", label: "local bias: not sent back", lost: true },
    ],
    `In the other direction, a broadcast from acme-web2 lands on leaf2.sin, which floods it to its local ports and to every VTEP, leaf1.sin included. leaf1.sin sees outer source 10.255.2.12, a leaf on the same segment, so it never sends the copy back down to acme-web2, even though it is the DF: this split-horizon rule for VXLAN is called local bias.`,
    "split",
  );

  // Failure.
  fab.down("acme-web2", B, "link down");
  fab.state(B, "ES …:01 down", "danger");
  fab.set({ "bond members up": "1 of 2" });
  fab.note(
    `The link between acme-web2 and leaf2.sin fails. The server's LACP drops that member and sends everything to leaf1.sin, and leaf2.sin loses its only port on the segment.`,
    "fail",
  );

  fab.path([B, RR]);
  fab.set({ "segment members": "leaf1.sin (leaf2.sin's link is down)" });
  fab.table(0, { title: `${L1} MAC table, VNI 10100`, head: ["MAC", "ESI", "VTEPs"], rows: [[w2.mac, ESI, vA]], tones: ["compare"] });
  fab.table(1, {
    title: "Withdrawn by leaf2.sin",
    head: ["route", "effect"],
    rows: [["type-1 per ES, ESI …:01", "every remote leaf drops 10.255.2.12 for every MAC on the segment"], ["type-4, ESI …:01", "leaf1.sin is the segment's only member and DF for all VLANs"]],
    tones: ["danger", undefined],
  });
  fab.send(
    B,
    RR,
    "WITHDRAW type-1 per ES",
    `leaf2.sin withdraws its per-ES type-1 route, a single message, and every remote leaf removes 10.255.2.12 from the next hops of every MAC on that segment at once. If 500 MACs sat behind the bond, say a hypervisor's virtual machines, this one withdrawal does what 500 type-2 withdrawals would otherwise do, one MAC at a time: this is mass withdrawal.`,
    { tag: "withdraw" },
  );

  fab.clearPath();
  fab.state(B, vB, "muted");
  fab.state(A, "sole DF", "done");
  fab.linkSet(L1, A, { tone: "path" });
  fab.set({ "unicast to 53:0b": "all via 10.255.2.11" });
  fab.packets(
    [
      { from: L1, to: A, label: "flow 1", progress: 0.4 },
      { from: L1, to: A, label: "flow 2", progress: 0.6 },
    ],
    `Both flows now hash to 10.255.2.11 and reach acme-web2 through leaf1.sin, after one BGP withdrawal instead of one per MAC. leaf2.sin also withdraws its type-2 route for 00:00:5e:00:53:0b, and leaf1.sin, which now receives all of acme-web2's frames, advertises the MAC itself.`,
    "reconverge",
  );

  fab.clearPath();
  fab.state(A, vA, "done");
  fab.table(0, {
    title: "EVPN multihoming vs MLAG",
    head: ["", "EVPN multihoming", "MLAG"],
    rows: [
      ["peer link between the leaves", "none", "required"],
      ["leaves per segment", "2 or more", "exactly 2"],
      ["how peers share state", "BGP routes (types 1, 2 and 4)", "proprietary protocol over the peer link"],
      ["remote leaves see", "two VTEPs, aliasing", "one shared anycast VTEP"],
    ],
  });
  fab.table(1, undefined);
  fab.note(
    `EVPN multihoming does with standard BGP routes what MLAG does with a vendor protocol and a peer link: one segment, a designated forwarder for flooded traffic, load sharing by aliasing, and fast failover by mass withdrawal. The signals worth surfacing are the DF per segment, both members' type-1 routes, and bond members that are down while the leaf is still up.`,
    "done",
  );
  return fab.f.done();
};

// ---------- overlay-packet-walk ----------

/**
 * `overlay-packet-walk` (lesson 06-07). acme-web1 (10.1.1.10, leaf1.ams) to
 * acme-web2 (10.1.1.11, leaf2.sin), same Acme subnet, VNI 10100, every lookup
 * at every hop: the host's routing table and ARP (answered by leaf1.ams's ARP
 * suppression), leaf1's port/VLAN → VNI map and MAC table (EVPN type-2 →
 * VTEP 10.255.2.12), the underlay route to the VTEP (IS-IS, ECMP metric 1,020
 * via both spines, metrics 10 inside a site and 1,000 on a long-haul circuit
 * as an example), spine1.ams's FIB (via spine1.sin at 1,010, the path through
 * spine2 at 1,030 not used), spine1.sin's FIB, leaf2.sin's VTEP/VNI checks and
 * MAC table; ends with a table of all nine lookups. Small example, two spines
 * per site.
 *
 * Inputs: `variant: "rt-leak"` tells the failure version instead: leaf2.ams's
 * Globex config copied from leaf1.ams's Acme config with RD and RT left
 * unchanged (RD 10.255.1.11:10100, RT 65000:10100). globex-app1's type-2 route
 * (10.1.1.10, VNI 10200) is imported by leaf2.sin into Acme's VNI 10100, its
 * ARP suppression answers with Globex's MAC, and acme-web2's traffic lands on
 * globex-app1 while every session is Established; then the signals, the
 * duplicate-RD effect on type-5 routes and the troubleshooting checklist.
 * 16 frames, 11 with the variant.
 */
export const overlayPacketWalk: FabGen = (input) => (input.variant === "rt-leak" ? rtLeak() : overlayWalk());

function overlayWalk() {
  const a = HOSTS["acme-web1"];
  const b = HOSTS["acme-web2"];
  const L1 = "leaf1.ams";
  const L2 = "leaf2.sin";
  const S1A = "spine1.ams";
  const S2A = "spine2.ams";
  const S1S = "spine1.sin";
  const S2S = "spine2.sin";
  const vtepA = loopback(L1);
  const vtepB = loopback(L2);
  const fab = new Fab(
    [
      { id: "acme-web1", kind: "host", x: 6, y: 100, state: a.ip },
      { id: L1, kind: "leaf", x: 6, y: 50, state: vtepA },
      { id: S1A, kind: "spine", x: 22, y: 0 },
      { id: S2A, kind: "spine", x: 22, y: 72, tone: "muted" },
      { id: S1S, kind: "spine", x: 78, y: 0 },
      { id: S2S, kind: "spine", x: 78, y: 72, tone: "muted" },
      { id: L2, kind: "leaf", x: 94, y: 50, state: vtepB },
      { id: "acme-web2", kind: "host", x: 94, y: 100, state: b.ip },
    ],
    [
      ["acme-web1", L1],
      [L1, S1A, { label: "10" }],
      [L1, S2A, { tone: "muted", label: "10" }],
      [S1A, S1S, { label: "1,000" }],
      [S2A, S2S, { tone: "muted", label: "1,000" }],
      [S1S, L2, { label: "10" }],
      [S2S, L2, { tone: "muted", label: "10" }],
      [L2, "acme-web2"],
    ],
    { height: 300 },
  );
  const sport = entropyPort(`${a.ip}|${b.ip}|6|40112|443`);
  const inner: HeaderSpec[] = [
    { name: "Ethernet", size: 14, reader: "acme-web2 (carried untouched)", fields: { "dst MAC": b.mac, "src MAC": a.mac, EtherType: "0x0800 (IPv4)" } },
    { name: "IPv4", size: 20, reader: "acme-web2 (carried untouched)", fields: { src: a.ip, dst: b.ip, TTL: 64, protocol: "6 (TCP)", "total length": 1500 } },
    { name: "TCP", size: "20 B + 1,460 B data", reader: "acme-web2 (carried untouched)", fields: { "src port": 40112, "dst port": 443, flags: "ACK PSH" } },
  ];
  const vx: HeaderSpec = { name: "VXLAN", size: 8, tone: "path", reader: "only the egress VTEP", fields: { flags: "0x08 (VNI valid)", VNI: b.vni }, highlight: ["VNI"] };
  const udp: HeaderSpec = { name: "Outer UDP", size: 8, tone: "path", reader: "egress VTEP (port), ECMP hashes (src port)", fields: { "src port": sport, "dst port": 4789 } };
  const oip = (ttl: number): HeaderSpec => ({ name: "Outer IPv4", size: 20, tone: "path", reader: "every underlay router", fields: { src: vtepA, dst: vtepB, TTL: ttl, protocol: "17 (UDP)", "total length": 1550 } });
  const oeth = (dst: string, src: string): HeaderSpec => ({ name: "Outer Ethernet", size: 14, tone: "path", reader: "this link only", fields: { "dst MAC": dst, "src MAC": src } });
  const ms = fibreMs(DISTANCE_KM["ams-sin"]);
  const lookups: string[][] = [];
  const lk = (device: string, table: string, key: string, result: string) => lookups.push([String(lookups.length + 1), device, table, key, result]);

  fab.set({ tenant: "Acme, VLAN 100, VNI 10100", "IS-IS metrics": "10 in a site, 1,000 per circuit (example)" });
  fab.note(
    `The full walk: acme-web1 in Amsterdam sends to acme-web2 in Singapore, both in Acme's 10.1.1.0/24 on VLAN 100, VNI 10100, through leaf1.ams, a spine in each site, the ${km(DISTANCE_KM["ams-sin"])} km circuit and leaf2.sin (small example, two spines per site). The link labels are IS-IS metrics, 10 inside a site and 1,000 on each long-haul circuit in this example; we will count every lookup on the way.`,
    "topology",
  );

  // Host.
  fab.state("acme-web1", "route lookup", "active");
  fab.table(0, { title: "acme-web1 routing table", head: ["prefix", "via", "interface"], rows: [["10.1.1.0/24", "connected", "eth0"], ["0.0.0.0/0", a.gateway, "eth0"]], tones: ["active", undefined] });
  fab.table(1, { title: "acme-web1 ARP cache", head: ["IP", "MAC"], rows: [[a.gateway, ANYCAST_GW_MAC]] });
  lk("acme-web1", "routing table", b.ip, "on-link, 10.1.1.0/24");
  fab.note(
    `Lookup 1, on acme-web1 itself: 10.1.1.11 falls inside its connected subnet 10.1.1.0/24, so no router is involved and the frame must be addressed to acme-web2's own MAC. Its ARP cache has only the gateway, so it has to ask.`,
    "host",
  );

  fab.headers([arpEth(BCAST, a.mac), arp("request", a.mac, a.ip, "00:00:00:00:00:00", b.ip)], "built by acme-web1");
  fab.path(["acme-web1", L1]);
  fab.send("acme-web1", L1, "ARP who-has 10.1.1.11", `acme-web1 broadcasts an ARP request for 10.1.1.11 into VLAN 100; leaf1.ams receives it on access port 1.`, { tag: "arp" });

  fab.state(L1, "ARP suppression", "active");
  fab.table(1, { title: `${L1} ARP suppression table, VNI 10100`, head: ["IP", "MAC", "from"], rows: [[b.ip, b.mac, `type-2 route, next hop ${vtepB}`]], tones: ["active"] });
  fab.headers([arpEth(a.mac, b.mac), arp("reply", b.mac, b.ip, a.mac, a.ip)], `sent by ${L1} on acme-web2's behalf`);
  lk("acme-web1 → leaf1.ams", "ARP (answered by leaf1.ams)", b.ip, b.mac);
  fab.send(
    L1,
    "acme-web1",
    "ARP reply: 10.1.1.11 is at 00:00:5e:00:53:0b",
    `Lookup 2: leaf1.ams's ARP suppression table already pairs 10.1.1.11 with 00:00:5e:00:53:0b, learned from leaf2.sin's EVPN type-2 route, so it answers locally and nothing is flooded to Singapore.`,
    { tag: "arp", tone: "done" },
  );

  fab.state("acme-web1", "sending", "active");
  fab.state(L1, vtepA);
  fab.tone(L1);
  fab.table(1, { title: "acme-web1 ARP cache", head: ["IP", "MAC"], rows: [[a.gateway, ANYCAST_GW_MAC], [b.ip, b.mac]], tones: [undefined, "active"] });
  fab.headers(inner, "built by acme-web1");
  fab.send(
    "acme-web1",
    L1,
    "frame to 00:00:5e:00:53:0b",
    `acme-web1 caches the answer and sends its data: an Ethernet frame to 00:00:5e:00:53:0b carrying a 1,500-byte IPv4 packet, TTL 64, with a TCP segment for port 443.`,
  );

  // leaf1.ams.
  fab.state("acme-web1", a.ip, "done");
  fab.clearPath();
  fab.state(L1, "MAC lookup", "active");
  fab.at(`inside ${L1}`);
  fab.table(0, { title: `${L1} port map`, head: ["port", "VLAN", "VNI"], rows: [["port 1", "100 (untagged)", String(a.vni)]], tones: ["active"] });
  fab.table(1, {
    title: `${L1} MAC table, VNI 10100`,
    head: ["MAC", "where", "learned"],
    rows: [[a.mac, "port 1", "locally"], [b.mac, `VTEP ${vtepB}`, `type-2, RD ${rd(L2, b.vni)}`]],
    tones: [undefined, "active"],
  });
  lk(L1, "port/VLAN map", "port 1, VLAN 100", "VNI 10100");
  lk(L1, "MAC table, VNI 10100", b.mac, `VTEP ${vtepB}`);
  fab.note(
    `Lookups 3 and 4, on leaf1.ams: access port 1 in VLAN 100 maps to VNI 10100, and in that segment's MAC table 00:00:5e:00:53:0b sits behind remote VTEP 10.255.2.12, from leaf2.sin's type-2 route with RD 10.255.2.12:10100. The source MAC is already known on port 1, so nothing new is learned or advertised.`,
    "lookup",
  );

  fab.table(0, {
    title: `${L1} underlay FIB (IS-IS)`,
    head: ["prefix", "next hop", "metric"],
    rows: [[`${vtepB}/32`, `${p2p(L1, S1A).spine} (spine1.ams)`, "1,020"], [`${vtepB}/32`, `${p2p(L1, S2A).spine} (spine2.ams)`, "1,020"]],
    tones: ["active", undefined],
  });
  fab.table(1, undefined);
  fab.headers([oeth(fab.portMac(S1A, L1), fab.portMac(L1, S1A)), oip(64), udp, vx, ...inner], `encapsulated by ${L1}`);
  lk(L1, "underlay FIB", vtepB, "spine1.ams or spine2.ams; hash picks spine1.ams");
  fab.note(
    `Lookup 5: 10.255.2.12 is a BGP next hop, so leaf1.ams resolves it in its underlay FIB, where IS-IS gives two equal-cost paths of metric 1,020 (10 + 1,000 + 10), one through each spine. It encapsulates (VXLAN VNI 10100, UDP 4789 from source port ${sport}, outer IPv4 10.255.1.11 → 10.255.2.12), and the hash of those outer headers picks spine1.ams.`,
    "encap",
  );

  fab.state(L1, "encapsulated", "done");
  fab.path([L1, S1A]);
  fab.at(`on the link ${L1} → ${S1A}`);
  fab.send(L1, S1A, `UDP 4789 to ${vtepB}`, `The 1,550-byte tunnel packet leaves leaf1.ams with outer TTL 64; from here on only the outer headers are read. Every underlay link must carry 1,550-byte IP packets, which is why fabrics run a jumbo MTU such as 9,216 bytes; at the default 1,500 this packet would be dropped.`);

  // spine1.ams.
  fab.state(S1A, "FIB lookup", "active");
  fab.headers([oeth(fab.portMac(S1S, S1A), fab.portMac(S1A, S1S)), oip(63), udp, vx, ...inner], `leaving ${S1A}`);
  fab.table(0, {
    title: `${S1A} IS-IS paths to ${vtepB}/32`,
    head: ["next hop", "path", "metric", "FIB"],
    rows: [[S1S, "circuit, then leaf2.sin", "1,010", "installed"], ["a leaf", "spine2.ams, circuit 2, leaf2.sin", "1,030", "not used"]],
    tones: ["active", "muted"],
  });
  lk(S1A, "FIB", vtepB, "spine1.sin");
  fab.note(
    `Lookup 6, on spine1.ams: the outer destination 10.255.2.12 matches the IS-IS route via spine1.sin over its own circuit, metric 1,010; the detour down to a leaf and over spine2.ams's circuit costs 1,030 and is not used. The spine decrements the outer TTL to 63 and rewrites the outer MACs, nothing else.`,
    "lookup",
  );

  fab.state(S1A, "outer IP only", "done");
  fab.path([S1A, S1S]);
  fab.at(`on the link ${S1A} → ${S1S}`);
  fab.send(S1A, S1S, `UDP 4789 to ${vtepB}`, `Across the Amsterdam–Singapore circuit: ${km(DISTANCE_KM["ams-sin"])} km of fibre at about 5 microseconds per km, so about ${ms} ms one way, more than every lookup on the path put together.`);

  // spine1.sin.
  const sin = p2p(L2, S1S);
  fab.state(S1S, "FIB lookup", "active");
  fab.headers([oeth(fab.portMac(L2, S1S), fab.portMac(S1S, L2)), oip(62), udp, vx, ...inner], `leaving ${S1S}`);
  fab.table(0, { title: `${S1S} underlay FIB`, head: ["prefix", "next hop", "metric"], rows: [[`${vtepB}/32`, `${sin.leaf} (leaf2.sin)`, "10"]], tones: ["active"] });
  lk(S1S, "FIB", vtepB, "leaf2.sin");
  fab.note(
    `Lookup 7, on spine1.sin: 10.255.2.12/32 is one hop away, via leaf2.sin's end of the ${sin.net} link, metric 10. Outer TTL 62, outer MACs rewritten again, and the VXLAN header and inner frame are still exactly the bytes leaf1.ams wrote.`,
    "lookup",
  );

  fab.state(S1S, "outer IP only", "done");
  fab.path([S1S, L2]);
  fab.at(`on the link ${S1S} → ${L2}`);
  fab.send(S1S, L2, `UDP 4789 to ${vtepB}`, `Down the last underlay link to leaf2.sin, which owns the outer destination address 10.255.2.12.`);

  // leaf2.sin.
  fab.state(L2, "decapsulate", "active");
  fab.headers(inner, `inside ${L2}, after decapsulation`);
  fab.table(0, {
    title: `${L2} checks before decapsulating`,
    head: ["header", "check"],
    rows: [["Outer IPv4 dst", `${vtepB} is my VTEP`], ["Outer IPv4 src", `${vtepA} is a known VTEP (type-3), checked on some platforms`], ["Outer UDP", "dst port 4789 = VXLAN"], ["VXLAN", "VNI 10100 = local VLAN 100"]],
    tones: ["active", undefined, undefined, "active"],
  });
  lk(L2, "VTEP and VNI checks", `${vtepB}, VNI 10100`, "VLAN 100");
  fab.note(
    `Lookup 8, on leaf2.sin: the outer destination is its own VTEP, the UDP port is 4789 and VNI 10100 maps to its local VLAN 100; some platforms also check that the source 10.255.1.11 is a VTEP they know, here from leaf1.ams's type-3 route. It strips all 50 bytes of outer headers and the original frame comes out.`,
    "decap",
  );

  fab.table(0, {
    title: `${L2} MAC table, VNI 10100`,
    head: ["MAC", "where", "learned"],
    rows: [[b.mac, "port to acme-web2", "locally"], [a.mac, `VTEP ${vtepA}`, "type-2 route"]],
    tones: ["active", undefined],
  });
  lk(L2, "MAC table, VNI 10100", b.mac, "port to acme-web2");
  fab.note(
    `Lookup 9: 00:00:5e:00:53:0b is on a local port. leaf2.sin does not learn acme-web1's MAC from this tunnelled frame, because EVPN already told it 00:00:5e:00:53:0a lives behind 10.255.1.11; with EVPN, MACs behind remote VTEPs come from BGP, not from the data plane.`,
    "lookup",
  );

  fab.state(L2, vtepB, "done");
  fab.path([L2, "acme-web2"]);
  fab.at(`on the link ${L2} → acme-web2`);
  fab.send(L2, "acme-web2", "frame to 00:00:5e:00:53:0b", `leaf2.sin bridges the frame out of acme-web2's port, still with acme-web1's source MAC and TTL 64, byte for byte what acme-web1 sent.`, { tone: "done" });

  fab.state("acme-web2", "received", "done");
  fab.clearPath();
  fab.headers(undefined);
  fab.table(0, { title: "Every lookup on the way", head: ["#", "where", "table", "key", "result"], rows: lookups });
  fab.table(1, undefined);
  fab.set({ "lookups": lookups.length, "devices that read the inner frame": "leaf1.ams, leaf2.sin" });
  fab.note(
    `Nine lookups on five devices: the host and the two leaves read tenant state (routing table, ARP, VNI and MAC tables learned through EVPN), while the two spines read only the outer IPv4 destination in an IS-IS FIB. When this path breaks, each row is a place to look, and the platform should be able to show every one of them.`,
    "done",
  );
  return fab.f.done();
}

function rtLeak() {
  const w1 = HOSTS["acme-web1"];
  const w2 = HOSTS["acme-web2"];
  const g = HOSTS["globex-app1"];
  const L1 = "leaf1.ams";
  const L2A = "leaf2.ams";
  const L2S = "leaf2.sin";
  const RRA = "rr1.ams";
  const fab = new Fab(
    [
      { id: RRA, kind: "rr", x: 40, y: 0, state: loopback(RRA) },
      { id: L1, kind: "leaf", x: 8, y: 50, state: loopback(L1) },
      { id: L2A, kind: "leaf", x: 40, y: 50, state: loopback(L2A) },
      { id: L2S, kind: "leaf", x: 90, y: 50, state: loopback(L2S) },
      { id: "acme-web1", kind: "host", x: 8, y: 100, state: w1.ip },
      { id: "globex-app1", kind: "host", x: 40, y: 100, state: g.ip },
      { id: "acme-web2", kind: "host", x: 90, y: 100, state: w2.ip },
    ],
    [
      [L1, RRA, { dashed: true }],
      [L2A, RRA, { dashed: true }],
      [RRA, L2S, { dashed: true, label: "iBGP via rr1.sin" }],
      ["acme-web1", L1],
      ["globex-app1", L2A],
      ["acme-web2", L2S],
    ],
    { height: 300 },
  );
  const right = { rd2: rd(L2A, g.vni), rt2: rt(g.vni), rd3: rd(L2A, TENANTS.GLOBEX.l3vni), rt3: rt(TENANTS.GLOBEX.l3vni) };
  const copied = { rd2: rd(L1, w1.vni), rt2: rt(w1.vni), rd3: rd(L1, TENANTS.ACME.l3vni), rt3: rt(TENANTS.ACME.l3vni) };

  fab.table(0, {
    title: `Source of truth: ${L2A}, tenant Globex`,
    head: ["", "RD", "RT"],
    rows: [["MAC-VRF, VNI 10200", right.rd2, right.rt2], ["VRF GLOBEX, L3VNI 50002", right.rd3, right.rt3]],
  });
  fab.table(1, {
    title: `Running config: ${L2A}, tenant Globex`,
    head: ["", "RD", "RT"],
    rows: [["MAC-VRF, VNI 10200", copied.rd2, copied.rt2], ["VRF GLOBEX, L3VNI 50002", copied.rd3, copied.rt3]],
    tones: ["danger", "danger"],
  });
  fab.state(L2A, "copied config", "danger");
  fab.note(
    `The failure version. An engineer set up Globex on leaf2.ams by copying Acme's tenant config from leaf1.ams and changed the VNIs to 10200 and 50002, but not the route distinguishers and route targets: leaf2.ams now uses leaf1.ams's RDs 10.255.1.11:10100 and 10.255.1.11:50001 and Acme's route targets 65000:10100 and 65000:50001.`,
    "setup",
  );

  fab.set({ "BGP sessions": "all Established", "IS-IS adjacencies": "all up", "interface errors": 0, "config pushed": "successfully" });
  fab.note(
    `Every health check is green: all BGP sessions are Established, IS-IS adjacencies are up, there are no interface errors and the config push reported success. Nothing in that list looks at what the routes say.`,
    "healthy",
  );

  fab.headers(
    [
      { name: "BGP UPDATE", fields: { "AFI/SAFI": "25/70 (L2VPN EVPN)", NEXT_HOP: loopback(L2A) } },
      { name: "EVPN type-2 (MAC/IP)", tone: "danger", fields: { RD: copied.rd2, MAC: g.mac, IP: g.ip, "label 1 (L2VNI)": g.vni }, highlight: ["RD"] },
      { name: "Extended communities", tone: "danger", fields: { "route target": copied.rt2 }, highlight: ["route target"] },
    ],
    `built by ${L2A}`,
  );
  fab.path([L2A, RRA]);
  fab.send(
    L2A,
    RRA,
    "type-2 10.1.1.10, Globex",
    `globex-app1 (10.1.1.10, MAC 00:00:5e:00:53:1a) comes up on leaf2.ams, which advertises its type-2 route with the copied RD 10.255.1.11:10100 and route target 65000:10100, Acme's, while label 1 correctly says VNI 10200. To every other router this is an Acme route.`,
    { tag: "advertise" },
  );

  fab.clearPath();
  fab.path([RRA, L2S]);
  fab.send(
    RRA,
    L2S,
    "type-2 10.1.1.10, Globex",
    `rr1.ams reflects it like any other route; reflectors check loops, not ownership. The duplicate RD does not hide anything yet, because a type-2 route's key includes the MAC and acme-web1's MAC is different, so both routes travel on: the route target is what does the damage.`,
    { tag: "reflect" },
  );

  fab.clearPath();
  fab.state(L2S, "2 MACs for .10", "danger");
  fab.table(0, {
    title: `${L2S} MAC table, VNI 10100 (Acme)`,
    head: ["MAC", "where", "VNI to use", "from"],
    rows: [[w2.mac, "port to acme-web2", "local", "locally"], [w1.mac, `VTEP ${loopback(L1)}`, "10100", "type-2, Acme"], [g.mac, `VTEP ${loopback(L2A)}`, "10200", "type-2, leaked"]],
    tones: [undefined, undefined, "danger"],
  });
  fab.table(1, { title: `${L2S} ARP suppression, VNI 10100`, head: ["IP", "MAC", "note"], rows: [[w1.ip, g.mac, "replaced 00:00:5e:00:53:0a"]], tones: ["danger"] });
  fab.headers(undefined);
  fab.note(
    `leaf2.sin imports the route, because 65000:10100 is exactly the route target its Acme VNI 10100 imports: Acme's segment now holds a Globex MAC, reached through VTEP 10.255.1.12 with VNI 10200. Two MACs now claim 10.1.1.10 in one segment, and leaf2.sin's ARP suppression table keeps one binding, here the newer one, globex-app1's.`,
    "import",
  );

  fab.headers([arpEth(w2.mac, g.mac), arp("reply", g.mac, w1.ip, w2.mac, w2.ip)], `sent by ${L2S}`);
  fab.path(["acme-web2", L2S]);
  fab.send(
    L2S,
    "acme-web2",
    "ARP reply: 10.1.1.10 is at 00:00:5e:00:53:1a",
    `acme-web2 ARPs for its colleague acme-web1 at 10.1.1.10, and leaf2.sin's ARP suppression answers with Globex's MAC 00:00:5e:00:53:1a. acme-web2 has no way to tell.`,
    { tag: "arp", lost: false, tone: "danger" },
  );

  fab.headers(
    [
      { name: "Outer IPv4", tone: "path", fields: { src: loopback(L2S), dst: loopback(L2A), protocol: "17 (UDP)" } },
      { name: "Outer UDP", tone: "path", fields: { "dst port": 4789 } },
      { name: "VXLAN", tone: "danger", fields: { VNI: g.vni }, highlight: ["VNI"] },
      { name: "Ethernet", fields: { "dst MAC": g.mac, "src MAC": w2.mac } },
      { name: "IPv4", fields: { src: w2.ip, dst: w1.ip } },
    ],
    `encapsulated by ${L2S}`,
  );
  fab.clearPath();
  fab.send(
    L2S,
    L2A,
    "VXLAN VNI 10200",
    `acme-web2 sends its data to 00:00:5e:00:53:1a, and leaf2.sin tunnels it to VTEP 10.255.1.12 with VNI 10200, the VNI the leaked route carries in label 1. The packet crosses from Singapore to Amsterdam inside a perfectly valid VXLAN header. (A platform that always uses its own VNI would send VNI 10100, which leaf2.ams does not have and drops: a black hole instead of a leak.)`,
    { tag: "leak", tone: "danger" },
  );

  fab.state("globex-app1", "got Acme data", "danger");
  fab.path([L2A, "globex-app1"], "danger");
  fab.send(
    L2A,
    "globex-app1",
    "Acme data to a Globex server",
    `leaf2.ams decapsulates VNI 10200 into Globex's VLAN 100 and delivers the frame to globex-app1: Acme's traffic is now on another customer's server, a tenant leak, while every BGP session stays Established.`,
    { tag: "leak", tone: "danger" },
  );

  fab.clearPath();
  fab.table(0, {
    title: "Signals that show it",
    head: ["signal", "where"],
    rows: [
      ["one IP, two MACs in one VNI", "leaf2.sin and leaf1.ams EVPN tables (leaf1.ams sees a remote claim on its own host's IP)"],
      ["RD 10.255.1.11:10100 from two next hops", "route reflectors, any BGP route collector"],
      ["Acme route count up by Globex's hosts", "per-VNI EVPN route counts"],
      ["route's VNI differs from the importing VNI", "leaf2.sin MAC table (10200 in VNI 10100)"],
      ["running config differs from intent", "config diff against the source of truth"],
    ],
  });
  fab.table(1, undefined);
  fab.note(
    `None of the usual alarms fire, so the platform has to look at route content: one IP with two MACs in one VNI, one RD arriving from two different next hops, a jump in a tenant's route count, and a running config that differs from the source of truth. Each of these is cheap to compute from data the fabric already exports.`,
    "signals",
  );

  fab.table(1, {
    title: "Type-5 routes for 10.1.1.0/24 at rr1.ams",
    head: ["RD", "prefix", "next hop", "tenant", "reflected"],
    rows: [[copied.rd3, "10.1.1.0/24", loopback(L1), "Acme", "yes, best"], [copied.rd3, "10.1.1.0/24", loopback(L2A), "Globex", "no, hidden"]],
    tones: ["done", "danger"],
  });
  fab.note(
    `The duplicate RD bites where the keys collide: both tenants announce 10.1.1.0/24 as a type-5 route, and with the same RD 10.255.1.11:50001 the reflector sees one route from two next hops, picks one best path and reflects only that. Here the router-ID step of best-path selection (the lower ORIGINATOR_ID, 10.255.1.11) picks Acme's, and Globex's route silently disappears from every other leaf.`,
    "rd",
  );

  fab.state(L2A, loopback(L2A), "done");
  fab.state(L2S, loopback(L2S), "done");
  fab.state("globex-app1", g.ip);
  fab.tone("globex-app1");
  fab.table(0, {
    title: "Troubleshooting checklist",
    head: ["step", "check"],
    rows: [
      ["1. scope", "which tenant, which hosts, one site or several"],
      ["2. underlay", "VTEP-to-VTEP reachability and MTU"],
      ["3. EVPN routes", "for the IP and MAC: RD, RT, next hop, VNI label"],
      ["4. local tables", "port-to-VNI map, MAC table, ARP suppression binding on both leaves"],
      ["5. intent, fix, prevent", "RD, RT and VNI vs the source of truth; restore them; reject duplicate RDs or RTs before deploy"],
    ],
  });
  fab.table(1, undefined);
  fab.set({ "BGP sessions": "all Established (still)" });
  fab.note(
    `The checklist: confirm the scope, rule out the underlay, read the EVPN routes for the affected IP and MAC, check the leaves' local tables, and compare RD, RT and VNI with the source of truth. Restoring leaf2.ams's own RDs (10.255.1.12:10200 and 10.255.1.12:50002) and Globex's route targets fixes it; generating tenant config from intent and rejecting a duplicate RD or RT before deployment stops it from happening again.`,
    "done",
  );
  return fab.f.done();
}

// ---------- mpls-label-switching ----------

/**
 * `mpls-label-switching` (lesson 06-08). For comparison with VXLAN: Acme's
 * traffic carried the way a service-provider backbone does it, MPLS L3VPN, on
 * an illustrative backbone between Meridian's sites (Meridian itself uses
 * VXLAN). PE routers pe1.sin (10.255.2.241) and pe1.ams (10.255.1.241), P
 * routers p1.sin and p1.ams (10.255.x.251), loopbacks in Meridian's 10.255
 * plan. LDP distributes transport labels hop by hop towards the egress PE's
 * loopback (pe1.ams advertises implicit null, label 3, so p1.ams pops: PHP);
 * MP-BGP carries the VPNv4 route 10.1.2.0/24 (RD 10.255.1.241:50001, RT
 * 65000:50001) with VPN label 92001. acme-web2 (10.1.1.11) sends to acme-db1
 * (10.1.2.20): pe1.sin pushes [24017, 92001], p1.sin swaps to 24031, p1.ams
 * pops, pe1.ams maps 92001 to VRF ACME. Uniform TTL model (RFC 3443): IP TTL
 * 64 → 60. Ends with the MPLS/VXLAN comparison.
 *
 * Inputs: `variant: "sr-mpls"` replaces LDP with SR-MPLS: IS-IS advertises
 * pe1.ams's prefix SID index 241, every router uses label 16241 (SRGB
 * 16000-23999) for it, so p1.sin "swaps" 16241 for 16241; PHP as before.
 * 16 frames, 14 with the variant.
 */
export const mplsLabelSwitching: FabGen = (input) => {
  const sr = input.variant === "sr-mpls";
  const src = HOSTS["acme-web2"];
  const dst = HOSTS["acme-db1"];
  const PEI = "pe1.sin";
  const P1 = "p1.sin";
  const P2 = "p1.ams";
  const PEE = "pe1.ams";
  const lo: Record<string, string> = { [PEI]: "10.255.2.241", [P1]: "10.255.2.251", [P2]: "10.255.1.251", [PEE]: "10.255.1.241" };
  const fab = new Fab(
    [
      { id: PEI, kind: "router", x: 8, y: 55, state: `PE ${lo[PEI]}` },
      { id: P1, kind: "router", x: 36, y: 10, state: "P" },
      { id: P2, kind: "router", x: 64, y: 10, state: "P" },
      { id: PEE, kind: "router", x: 92, y: 55, state: `PE ${lo[PEE]}` },
      { id: "acme-web2", kind: "host", x: 8, y: 100, state: src.ip },
      { id: "acme-db1", kind: "host", x: 92, y: 100, state: dst.ip },
    ],
    [
      ["acme-web2", PEI],
      [PEI, P1],
      [P1, P2, { label: "long-haul" }],
      [P2, PEE],
      [PEE, "acme-db1"],
      [PEI, PEE, { dashed: true, label: "MP-BGP (VPNv4)" }],
    ],
    { height: 290 },
  );
  const fec = `${lo[PEE]}/32`;
  const VPN = 92001;
  const sid = 16000 + 241;
  const label = sr ? { [PEI]: sid, [P1]: sid, [P2]: 3 } : { [PEI]: 24017, [P1]: 24031, [P2]: 3 };
  // Out-label each router pushes or swaps to, towards pe1.ams.
  const outAt = { [PEI]: label[PEI]!, [P1]: label[P1]!, [P2]: label[P2]! };
  const ipv4 = (ttl: number): HeaderSpec => ({ name: "IPv4", size: 20, reader: "PEs only", fields: { src: src.ip, dst: dst.ip, TTL: ttl, protocol: "6 (TCP)" } });
  const tcp: HeaderSpec = { name: "TCP", size: 20, reader: "acme-db1", fields: { "src port": 51700, "dst port": 5432, flags: "SYN" } };
  const eth = (from: string, to: string, type: "mpls" | "ip", dstMac?: string): HeaderSpec => ({
    name: "Ethernet",
    size: 14,
    reader: "this link only",
    fields: { "dst MAC": dstMac ?? fab.portMac(to, from), "src MAC": from === "acme-web2" ? src.mac : fab.portMac(from, to), EtherType: type === "mpls" ? "0x8847 (MPLS)" : "0x0800 (IPv4)" },
  });
  const mpls = (name: "MPLS transport" | "MPLS VPN", value: number, s: 0 | 1, ttl: number): HeaderSpec => ({
    name,
    size: 4,
    tone: name === "MPLS VPN" ? "compare" : "path",
    reader: name === "MPLS VPN" ? "pe1.ams only" : "every P router",
    fields: { label: value, TC: 0, S: s, TTL: ttl },
    highlight: ["label"],
  });
  const lfib: string[][] = [];

  fab.set({ "VRF ACME": "RD 10.255.1.241:50001, RT 65000:50001", "transport": sr ? "SR-MPLS (IS-IS prefix SIDs)" : "LDP" });
  fab.note(
    `For comparison with VXLAN: an illustrative MPLS backbone between Meridian's Singapore and Amsterdam sites, the design service providers use (Meridian itself runs VXLAN). The provider-edge (PE) routers pe1.sin and pe1.ams hold VRF ACME, the provider (P) routers p1.sin and p1.ams only switch labels, and acme-web2 (10.1.1.11) will send to acme-db1 (10.1.2.20).`,
    "topology",
  );

  // Control plane: transport labels.
  if (sr) {
    lfib.push([PEE, `${fec}`, "index 241, PHP requested", "-"], [P2, fec, String(sid), "pop (PHP)"], [P1, fec, String(sid), String(sid)], [PEI, fec, "-", `push ${sid}`]);
    fab.table(0, { title: `Labels for ${fec} (SRGB 16000–23999)`, head: ["router", "FEC", "in label", "out"], rows: lfib, tones: ["active", undefined, undefined, undefined] });
    fab.state(PEE, "SID index 241", "active");
    fab.note(
      `With segment routing there is no label distribution protocol: pe1.ams advertises its loopback 10.255.1.241/32 in IS-IS with prefix SID index 241, and every router adds the index to the common label block base 16000. So all four routers agree that label 16241 means "towards pe1.ams", and the router before pe1.ams pops it (penultimate-hop popping, PHP) because pe1.ams left the SID's No-PHP flag clear.`,
      "sid",
    );
  } else {
    fab.path([PEE, P2]);
    lfib.push([PEE, fec, "3 (implicit null)", "-"]);
    fab.table(0, { title: `LDP label bindings for ${fec}`, head: ["router", "FEC", "local label", "out label"], rows: [...lfib], tones: ["active"] });
    fab.send(
      PEE,
      P2,
      "LDP: 10.255.1.241/32 → label 3",
      `LDP hands out transport labels upstream, from the destination back towards the sources (each router tells all its LDP neighbours, and only the binding from the next hop towards the destination is used). pe1.ams tells its neighbour p1.ams "for my loopback 10.255.1.241/32, use label 3". Label 3 is implicit null, a request to send such packets with no transport label at all, so p1.ams will pop it (penultimate-hop popping, PHP).`,
      { tag: "ldp" },
    );

    fab.clearPath();
    fab.path([P2, P1]);
    lfib.push([P2, fec, String(label[P1]), "pop"]);
    fab.table(0, { title: `LDP label bindings for ${fec}`, head: ["router", "FEC", "local label", "out label"], rows: [...lfib], tones: [undefined, "active"] });
    fab.send(
      P2,
      P1,
      `LDP: 10.255.1.241/32 → label ${label[P1]}`,
      `p1.ams picks a local label of its own, ${label[P1]}, for the same FEC (forwarding equivalence class, here "packets for 10.255.1.241") and advertises it upstream to p1.sin. Its forwarding entry reads: in label ${label[P1]}, pop, send to pe1.ams.`,
      { tag: "ldp" },
    );

    fab.clearPath();
    fab.path([P1, PEI]);
    lfib.push([P1, fec, String(label[PEI]), String(label[P1])]);
    fab.table(0, { title: `LDP label bindings for ${fec}`, head: ["router", "FEC", "local label", "out label"], rows: [...lfib], tones: [undefined, undefined, "active"] });
    fab.send(
      P1,
      PEI,
      `LDP: 10.255.1.241/32 → label ${label[PEI]}`,
      `p1.sin does the same with its own label ${label[PEI]}: in ${label[PEI]}, swap to ${label[P1]}, send to p1.ams. Every label is significant only to the router that chose it, and the chain of swaps from pe1.sin to pe1.ams is a label-switched path (LSP).`,
      { tag: "ldp" },
    );
  }

  // Control plane: VPN route.
  fab.clearPath();
  fab.state(PEE, `PE ${lo[PEE]}`);
  fab.tone(PEE);
  fab.linkSet(PEI, PEE, { tone: "active" });
  fab.headers(
    [
      { name: "BGP UPDATE", fields: { "AFI/SAFI": "1/128 (VPNv4)", NEXT_HOP: lo[PEE]! } },
      { name: "VPNv4 route", tone: "compare", fields: { RD: `${lo[PEE]}:50001`, prefix: "10.1.2.0/24", "VPN label": VPN }, highlight: ["VPN label"] },
      { name: "Extended communities", fields: { "route target": rt(TENANTS.ACME.l3vni) } },
    ],
    `sent by ${PEE}`,
  );
  fab.send(
    PEE,
    PEI,
    `VPNv4 10.1.2.0/24, label ${VPN}`,
    `Separately, multiprotocol BGP carries the tenant route: pe1.ams advertises VPNv4 prefix 10.1.2.0/24 with RD 10.255.1.241:50001, route target 65000:50001, next hop its loopback 10.255.1.241 and VPN label ${VPN}, a label it allocated to mean "look this up in VRF ACME". This is the ancestor of EVPN: same RD, same RT, and the label plays the part of the VNI.`,
    { tag: "vpn" },
  );

  fab.linkSet(PEI, PEE, { tone: undefined });
  fab.state(PEI, "VRF ACME", "active");
  fab.table(0, {
    title: `${PEI} VRF ACME`,
    head: ["prefix", "BGP next hop", "VPN label", "transport"],
    rows: [["10.1.1.0/24", "connected", "-", "-"], ["10.1.2.0/24", lo[PEE]!, String(VPN), `push ${outAt[PEI]} to p1.sin`]],
    tones: [undefined, "active"],
  });
  fab.headers(undefined);
  fab.note(
    `pe1.sin imports the route into VRF ACME because of route target 65000:50001 and resolves the BGP next hop 10.255.1.241 to the ${sr ? "segment-routed path" : "LSP"} towards pe1.ams: to reach 10.1.2.0/24 it must push VPN label ${VPN} and, above it, transport label ${outAt[PEI]} towards p1.sin.`,
    "vrf",
  );

  // Data plane.
  fab.headers([eth("acme-web2", PEI, "ip"), ipv4(64), tcp], "built by acme-web2");
  fab.path(["acme-web2", PEI]);
  fab.send("acme-web2", PEI, "TCP SYN to 10.1.2.20", `acme-web2 sends a TCP SYN for 10.1.2.20 with TTL 64 to its gateway, the Acme-facing interface of pe1.sin, as an ordinary IPv4 packet.`);

  fab.clearPath();
  fab.state(PEI, `push ${outAt[PEI]}, ${VPN}`, "active");
  fab.headers([eth(PEI, P1, "mpls"), mpls("MPLS transport", outAt[PEI], 0, 63), mpls("MPLS VPN", VPN, 1, 63), ipv4(63), tcp], `pushed by ${PEI}`);
  fab.note(
    `pe1.sin looks up 10.1.2.20 in VRF ACME, decrements the IP TTL to 63 and pushes two labels: VPN label ${VPN} at the bottom of the stack (S = 1) and transport label ${outAt[PEI]} on top (S = 0), both with TTL 63 (the uniform TTL model). The EtherType becomes 0x8847, MPLS, and the whole addition is 8 bytes.`,
    "push",
  );

  fab.state(PEI, `PE ${lo[PEI]}`, "done");
  fab.path([PEI, P1]);
  fab.at(`on the link ${PEI} → ${P1}`);
  fab.send(PEI, P1, `labels ${outAt[PEI]} | ${VPN}`, `The labelled packet goes to p1.sin. Nothing in the backbone core will look at 10.1.2.20 again until pe1.ams.`);

  fab.state(P1, `swap ${outAt[PEI]}→${outAt[P1]}`, "active");
  fab.headers([eth(P1, P2, "mpls"), mpls("MPLS transport", outAt[P1], 0, 62), mpls("MPLS VPN", VPN, 1, 63), ipv4(63), tcp], `swapped by ${P1}`);
  fab.table(0, { title: `${P1} label forwarding table`, head: ["in label", "action", "out label", "next hop"], rows: [[String(outAt[PEI]), "swap", String(outAt[P1]), P2]], tones: ["active"] });
  fab.note(
    sr
      ? `p1.sin reads only the top label: 16241 means "towards pe1.ams", so it swaps 16241 for the same value 16241, decrements the label TTL to 62 and forwards to p1.ams. A label that means the same thing on every router is the point of segment routing: IS-IS carries it, so no separate label protocol has to run or stay in step with the IGP.`
      : `p1.sin reads only the top label, finds ${outAt[PEI]} in its label forwarding table, swaps it for ${outAt[P1]}, decrements the label TTL to 62 and forwards to p1.ams. It never looks at the VPN label or the IP header, so it needs no Acme routes, just as a spine needs none for VXLAN.`,
    "swap",
  );

  fab.state(P1, "P", "done");
  fab.path([P1, P2]);
  fab.at(`on the link ${P1} → ${P2}`);
  fab.send(P1, P2, `labels ${outAt[P1]} | ${VPN}`, `Across the long-haul circuit to Amsterdam, about ${km(DISTANCE_KM["ams-sin"])} km of fibre and ${fibreMs(DISTANCE_KM["ams-sin"])} ms one way, still carrying both labels.`);

  fab.state(P2, `pop ${outAt[P1]}`, "active");
  fab.headers([eth(P2, PEE, "mpls"), mpls("MPLS VPN", VPN, 1, 61), ipv4(63), tcp], `popped by ${P2}`);
  fab.table(0, { title: `${P2} label forwarding table`, head: ["in label", "action", "out label", "next hop"], rows: [[String(outAt[P1]), "pop (PHP)", "none", PEE]], tones: ["active"] });
  fab.note(
    `p1.ams is the penultimate hop: pe1.ams asked for ${sr ? "PHP by leaving its prefix SID's No-PHP flag clear" : "implicit null"}, so p1.ams pops the transport label instead of swapping it and copies its decremented TTL, 61, into the VPN label now on top. That saves pe1.ams one lookup: it receives a packet whose top label is its own VPN label.`,
    "php",
  );

  fab.state(P2, "P", "done");
  fab.path([P2, PEE]);
  fab.at(`on the link ${P2} → ${PEE}`);
  fab.send(P2, PEE, `label ${VPN}`, `Only the VPN label ${VPN} is left on the last backbone link; its S bit is 1, so it is the bottom of the stack and IP follows.`);

  fab.state(PEE, `${VPN} → VRF ACME`, "active");
  fab.headers([eth(PEE, "acme-db1", "ip", dst.mac), ipv4(60), tcp], `routed by ${PEE}`);
  fab.table(0, {
    title: `${PEE} label table and VRF ACME`,
    head: ["key", "action"],
    rows: [[`label ${VPN}`, "pop, look up in VRF ACME"], ["10.1.2.0/24 in VRF ACME", "connected, ARP 00:00:5e:00:53:14"]],
    tones: ["active", "active"],
  });
  fab.note(
    `pe1.ams finds label ${VPN} in its own table: pop it and route the packet in VRF ACME, where 10.1.2.0/24 is connected. The IP TTL ends at 60, one less per router, and the packet gets a fresh Ethernet header to acme-db1's MAC 00:00:5e:00:53:14 with EtherType 0x0800 again.`,
    "vpn",
  );

  fab.state(PEE, `PE ${lo[PEE]}`, "done");
  fab.path([PEE, "acme-db1"]);
  fab.at(`on the link ${PEE} → acme-db1`);
  fab.send(PEE, "acme-db1", "TCP SYN, TTL 60", `acme-db1 receives an ordinary IPv4 packet with TTL 60; with the uniform TTL model a traceroute shows all four routers, and many providers switch to the pipe model to hide their core.`, { tone: "done" });

  fab.state("acme-db1", "SYN received", "done");
  fab.clearPath();
  fab.headers(undefined);
  fab.table(0, {
    title: "MPLS L3VPN and EVPN over VXLAN, side by side",
    head: ["job", "MPLS L3VPN", "EVPN / VXLAN"],
    rows: [
      ["tenant identifier", `VPN label ${VPN}`, "VNI (L3VNI 50001)"],
      ["reach the egress", sr ? `transport label ${sid}` : `transport labels ${label[PEI]}, ${label[P1]}`, "outer IPv4 to the VTEP"],
      ["core reads", "top label only", "outer IP only"],
      ["overhead", "4 B per label, 8 B here", "50 B"],
      ["core needs", sr ? "MPLS, IS-IS with SR" : "MPLS, LDP or RSVP-TE", "plain IP routing"],
    ],
  });
  fab.note(
    `Both designs solve the same problem: the edge adds a tenant identifier and an address for the far edge, and the core forwards on the outer part alone. Backbones choose MPLS for its small overhead and traffic engineering, while data centres choose VXLAN because any IP fabric and commodity switch ASIC can carry it, with ECMP entropy in the UDP source port.`,
    "done",
  );
  return fab.f.done();
};

export const scenarios: Record<string, FabGen> = {
  "evpn-mac-learning": evpnMacLearning,
  "symmetric-irb": symmetricIrb,
  "bum-replication": bumReplication,
  "evpn-multihoming": evpnMultihoming,
  "overlay-packet-walk": overlayPacketWalk,
  "mpls-label-switching": mplsLabelSwitching,
};

export const labels: Record<string, string> = {
  "evpn-mac-learning": "EVPN: a MAC learned, reflected and installed",
  "symmetric-irb": "Symmetric IRB: routed at both leaves over the L3VNI",
  "bum-replication": "BUM traffic: ingress replication vs multicast",
  "evpn-multihoming": "EVPN multihoming: ESI, DF, aliasing, mass withdrawal",
  "overlay-packet-walk": "The overlay packet walk, every lookup",
  "mpls-label-switching": "MPLS: push, swap, PHP and the VPN label",
};
