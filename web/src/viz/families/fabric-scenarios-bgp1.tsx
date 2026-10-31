// Scenario pack for the `fabric` family: BGP from first principles (module 04).
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
//   | `bgp-update-propagation` | a prefix announced across four ASes, AS_PATH
//     growing, one AS rejecting its own ASN in the path | 04-01 |
//   | `bgp-fsm` | two routers: TCP to 179, OPEN, OpenSent, OpenConfirm,
//     KEEPALIVE, Established, UPDATE; then a hold-timer expiry and NOTIFICATION |
//     04-02 |
//   | `bgp-ribs` | an UPDATE into Adj-RIB-In, import policy, Loc-RIB best path,
//     FIB install, export policy, Adj-RIB-Out | 04-03 |
//   | `bgp-next-hop-resolution` | an iBGP route whose next hop is a far
//     loopback, resolved through the IGP; next-hop-self; an unresolvable next hop
//     | 04-04 |
//   | `route-reflector` | full mesh vs a reflector pair; a route reflected to
//     clients with ORIGINATOR_ID and CLUSTER_LIST; a looped reflection dropped |
//     04-05 |
//   | `bgp-best-path` | three candidate routes eliminated step by step through
//     the decision process | 04-06 |
//
// One internet picture is shared by every scenario here, so the lessons agree
// with each other:
// - Meridian is AS 64500 (203.0.113.0/24). Its Amsterdam gateways gw1.ams
//   (loopback 10.255.1.201) and gw2.ams (10.255.1.202) connect to ISP1 (AS
//   64501) and ISP2 (AS 64502); the Singapore gateway gw1.sin (10.255.2.201)
//   also buys from ISP2. The gateways are fully meshed in iBGP (AS 64500).
// - A content network, AS 64511, originates 192.0.2.0/24. ISP2 peers with it
//   directly (AS_PATH 64502 64511); ISP1 reaches it only through the transit
//   provider AS 64496 (64501 64496 64511).
// - Inter-AS links are /31s from 198.51.100.0/24, provider side even:
//   gw2.ams–ISP2 198.51.100.0/31 (as in lesson 04-02's illustrative output),
//   gw1.ams–ISP1 .2/31, gw1.sin–ISP2 .4/31, transit–ISP1 .6/31, transit–ISP2
//   .8/31.
// - Gateway–spine links extend the core's /31 plan: gwG.site–spineS.site is
//   10.254.<(site-1)*16 + S>.<200 + 2(G-1)>/31, spine even, gateway odd.
// - IS-IS metric 10 on fabric links, 100 on the long-haul circuits.
import type { Tone } from "../primitives";
import { Fab, loopback, pick, SITES, type FabGen, type HeaderSpec, type Site } from "./fabric-core";

// ---------- shared Meridian internet-edge data ----------

const OWN = "203.0.113.0/24";
const REMOTE = "192.0.2.0/24";
const REMOTE_MORE = "192.0.2.128/25";

/** Inter-AS /31s from 198.51.100.0/24 (RFC 5737 documentation space), provider side even. */
const LINKS = {
  isp2Gw2: { net: "198.51.100.0/31", isp: "198.51.100.0", gw: "198.51.100.1" },
  isp1Gw1: { net: "198.51.100.2/31", isp: "198.51.100.2", gw: "198.51.100.3" },
  isp2GwSin: { net: "198.51.100.4/31", isp: "198.51.100.4", gw: "198.51.100.5" },
  transitIsp1: { net: "198.51.100.6/31", transit: "198.51.100.6", isp: "198.51.100.7" },
  transitIsp2: { net: "198.51.100.8/31", transit: "198.51.100.8", isp: "198.51.100.9" },
} as const;

/** Gateway–spine /31: 10.254.<(site-1)*16 + S>.<200 + 2(G-1)>, spine even, gateway odd. */
function gwSpine(gw: string, spine: string): { net: string; spine: string; gw: string } {
  const g = /^gw(\d+)\.(ams|sin|sjc)$/.exec(gw);
  const s = /^spine(\d+)\.(ams|sin|sjc)$/.exec(spine);
  if (!g || !s || g[2] !== s[2]) throw new Error(`fabric: no gateway link ${gw}–${spine}`);
  const third = (SITES[g[2] as Site] - 1) * 16 + Number(s[1]);
  const fourth = 200 + 2 * (Number(g[1]) - 1);
  return { net: `10.254.${third}.${fourth}/31`, spine: `10.254.${third}.${fourth}`, gw: `10.254.${third}.${fourth + 1}` };
}

/** Bytes of one path attribute on the wire: flags, type code, 1-byte length, value. */
const attr = (valueBytes: number): number => 3 + valueBytes;
/** One AS_SEQUENCE segment of 4-byte ASNs (an empty AS_PATH has no segment). */
const asPathBytes = (n: number): number => attr(n === 0 ? 0 : 2 + 4 * n);
/** An NLRI entry: one length byte plus just enough bytes for the prefix bits. */
const nlriBytes = (prefix: string): number => 1 + Math.ceil(Number(prefix.split("/")[1]) / 8);

const BGP_HEADER = (length: number, type: string): HeaderSpec => ({ name: "BGP header", size: 19, reader: "the peer's framing", fields: { marker: "ff × 16", length, type } });

// ---------- bgp-update-propagation ----------

/**
 * `bgp-update-propagation` (lesson 04-01, what BGP is for). Four ASes in a
 * ring: Meridian (AS 64500), ISP1 (64501), the transit provider (64496) and
 * ISP2 (64502). gw1.ams originates 203.0.113.0/24 with an empty AS_PATH, tells
 * gw2.ams over iBGP (still empty), then announces it to ISP1 only (in this run
 * gw2.ams takes ISP2's routes but announces nothing). At every eBGP boundary
 * the sender prepends its AS and sets NEXT_HOP to its own link address: 64500,
 * 64501 64500, 64496 64501 64500. ISP2 sends its full table to gw2.ams, which
 * finds 64500 in "64502 64496 64501 64500" and discards it as an AS loop.
 * Last, traffic is shown flowing opposite to the announcement.
 *
 * Inputs: none. 13 frames.
 */
export const bgpUpdatePropagation: FabGen = () => {
  const G1 = "gw1.ams";
  const G2 = "gw2.ams";
  const fab = new Fab(
    [
      { id: "transit", label: "Transit", kind: "isp", x: 50, y: 0, state: "AS 64496" },
      { id: "isp1", label: "ISP1", kind: "isp", x: 16, y: 45, state: "AS 64501" },
      { id: "isp2", label: "ISP2", kind: "isp", x: 84, y: 45, state: "AS 64502" },
      { id: G1, kind: "gw", x: 16, y: 100, state: "AS 64500" },
      { id: G2, kind: "gw", x: 84, y: 100, state: "AS 64500" },
    ],
    [
      [G1, "isp1", { label: "eBGP" }],
      ["isp1", "transit", { label: "eBGP" }],
      ["transit", "isp2", { label: "eBGP" }],
      ["isp2", G2, { label: "eBGP" }],
      [G1, G2, { dashed: true, label: "iBGP, AS 64500" }],
    ],
    { height: 290 },
  );
  const update = (path: string, nh: string, extra: [string, string][] = []): HeaderSpec[] => [
    { name: "UPDATE", tone: "path", reader: "the receiving BGP speaker", fields: [["NLRI", OWN], ["ORIGIN", "IGP"], ["AS_PATH", path || "(empty)"], ["NEXT_HOP", nh], ...extra] },
  ];
  const holders = (rows: string[][], tones?: (Tone | undefined)[]) => fab.table(1, { title: `Who holds ${OWN}`, head: ["router", "AS_PATH", "NEXT_HOP", "status"], rows, tones });
  const rows: string[][] = [];
  const tones: (Tone | undefined)[] = [];
  const hold = (row: string[], tone?: Tone) => {
    rows.push(row);
    tones.push(tone);
    holders(rows, tones);
  };

  fab.table(0, {
    title: "The four ASes",
    head: ["AS", "network", "relationship"],
    rows: [["64500", "Meridian", "origin of 203.0.113.0/24"], ["64501", "ISP1", "Meridian's provider"], ["64496", "Transit", "provider of ISP1 and ISP2"], ["64502", "ISP2", "Meridian's second provider"]],
  });
  fab.note(
    `Four autonomous systems (ASes), each a network run by one organisation under its own AS number: Meridian (AS 64500), its two providers ISP1 (AS 64501) and ISP2 (AS 64502), and a transit provider (AS 64496) that both ISPs buy from. All addresses and AS numbers here come from ranges reserved for documentation (RFC 5737 and RFC 5398).`,
    "topology",
  );

  fab.state(G1, "originates", "active");
  fab.headers(update("", "local (this router)"), `in ${G1}'s BGP table`);
  hold([G1, "(empty)", "local", "originated"], "active");
  fab.note(
    `gw1.ams originates 203.0.113.0/24, Meridian's public address block, with ORIGIN IGP and an empty AS_PATH: AS numbers are added only when a route leaves an AS, so a route still inside its home AS carries none. In this run only gw1.ams announces it to the internet, so the announcement makes a single ring; gw2.ams takes routes from ISP2 but does not announce Meridian's block to it (lessons 04-03 and 05-02 announce through both ISPs).`,
    "originate",
  );

  fab.headers(update("", loopback(G1), [["LOCAL_PREF", "100"]]), `on the iBGP session ${G1} → ${G2}`);
  fab.state(G1, "AS 64500", "done");
  hold([G2, "(empty)", loopback(G1), "best, via iBGP"]);
  fab.send(
    G1,
    G2,
    `UPDATE ${OWN}`,
    `Over iBGP, gw1.ams passes the route to gw2.ams, its neighbour inside AS 64500: the AS_PATH is still empty, NEXT_HOP is 10.255.1.201, gw1's loopback, and it carries LOCAL_PREF 100, an attribute only iBGP sends. iBGP never adds the local AS number; that only happens on eBGP, between ASes.`,
  );

  fab.headers(update("64500", LINKS.isp1Gw1.gw), `on the eBGP session ${G1} → ISP1`);
  fab.path([G1, "isp1"], "frontier");
  fab.send(
    G1,
    "isp1",
    "UPDATE, AS_PATH 64500",
    `On the eBGP session to ISP1, gw1.ams prepends its own AS: AS_PATH becomes 64500. NEXT_HOP becomes 198.51.100.3, gw1's address on the link they share, which is where ISP1 will send traffic for Meridian, and LOCAL_PREF is left out, because it never leaves its AS.`,
  );

  fab.state("isp1", "AS 64501", "done");
  hold(["ISP1", "64500", LINKS.isp1Gw1.gw, "accepted"]);
  fab.note(
    `ISP1 scans the AS_PATH for its own number, 64501, does not find it, checks the prefix against the list of blocks Meridian may announce, and accepts the route. Its BGP table now says 203.0.113.0/24 is one AS away, via 198.51.100.3.`,
    "accept",
  );

  fab.headers(update("64501 64500", LINKS.transitIsp1.isp), "on the eBGP session ISP1 → Transit");
  fab.path(["isp1", "transit"], "frontier");
  fab.send(
    "isp1",
    "transit",
    "UPDATE, AS_PATH 64501 64500",
    `ISP1 passes the route to its provider, prepending 64501 on the left: AS_PATH 64501 64500 reads from the nearest AS back to the origin. NEXT_HOP becomes 198.51.100.7, ISP1's side of the link to the transit provider.`,
  );

  fab.state("transit", "AS 64496", "done");
  hold(["Transit", "64501 64500", LINKS.transitIsp1.isp, "accepted"]);
  fab.note(
    `AS 64496 finds no 64496 in the path and accepts. To the transit provider Meridian's block is two ASes away, and it hands the route on to its other customers and peers, which is how a single announcement spreads across the internet.`,
    "accept",
  );

  fab.headers(update("64496 64501 64500", LINKS.transitIsp2.transit), "on the eBGP session Transit → ISP2");
  fab.path(["transit", "isp2"], "frontier");
  fab.send(
    "transit",
    "isp2",
    "UPDATE, AS_PATH 64496 64501 64500",
    `The transit provider sends it on to ISP2, another of its customers: AS_PATH 64496 64501 64500, NEXT_HOP 198.51.100.8. Each eBGP hop has added exactly one AS number and replaced the next hop with its own address.`,
  );

  fab.state("isp2", "AS 64502", "done");
  hold(["ISP2", "64496 64501 64500", LINKS.transitIsp2.transit, "accepted"]);
  fab.note(
    `ISP2 accepts it too. Since Meridian is not announcing to ISP2 directly in this run, this is the only path ISP2 has: three ASes away, through the transit provider and ISP1.`,
    "accept",
  );

  fab.headers(update("64502 64496 64501 64500", LINKS.isp2Gw2.isp), `on the eBGP session ISP2 → ${G2}`);
  fab.path(["isp2", G2], "frontier");
  fab.send(
    "isp2",
    G2,
    "UPDATE, AS_PATH 64502 64496 64501 64500",
    `ISP2 sends its full table to its customer gw2.ams, and the full table includes Meridian's own block: AS_PATH 64502 64496 64501 64500, four ASes long, NEXT_HOP 198.51.100.0.`,
  );

  fab.state(G2, "AS loop: 64500", "danger");
  fab.at(`rejected by ${G2}`);
  hold([`${G2} (from ISP2)`, "64502 64496 64501 64500", LINKS.isp2Gw2.isp, "rejected: AS loop"], "danger");
  fab.send(
    "isp2",
    G2,
    "looped UPDATE",
    `gw2.ams finds its own AS, 64500, at the end of the path and discards the route before best-path selection, an AS loop in RFC 4271's terms. The check is per AS, not per router: gw2.ams never sent this route, but its AS did, and it keeps using the iBGP route from gw1.ams.`,
    { lost: true, progress: 0.85, tag: "loop" },
  );

  fab.headers(undefined);
  fab.clearPath();
  fab.state(G2, "AS 64500", "done");
  fab.tone(G1, "done");
  fab.path(["isp2", "transit", "isp1", G1], "path");
  fab.set({ "traffic to 203.0.113.10": "ISP2 → Transit → ISP1 → gw1.ams" });
  fab.packets(
    [{ from: "isp2", to: "transit", label: "to 203.0.113.10", tone: "active", progress: 0.5 }],
    `Traffic flows the opposite way to the announcement: a packet entering ISP2 for 203.0.113.10 follows each AS's NEXT_HOP back through the transit provider and ISP1 to gw1.ams. The loop check is what stops the announcement itself circling this ring forever, because a route carries no hop limit of its own.`,
    "traffic",
  );

  fab.set({ "AS_PATH seen by gw2.ams": "64502 64496 64501 64500 (4 ASes)", "eBGP boundaries crossed": 4 });
  fab.note(
    `The AS_PATH grew by one AS at each of the four eBGP boundaries and does two jobs at once: loop detection, as gw2.ams just showed, and a rough distance, since a shorter AS_PATH is one of the things best-path selection prefers (lesson 04-06). It counts networks, not routers, kilometres or milliseconds.`,
    "done",
  );
  return fab.f.done();
};

// ---------- bgp-fsm ----------

/**
 * `bgp-fsm` (lesson 04-02, sessions and the FSM). leaf1.ams (10.255.1.11) and
 * its route reflector rr1.ams (10.255.1.101), iBGP in AS 65000, following the
 * lesson's traced bring-up exactly: ManualStart, SYN to 179 refused with RST
 * while rr1 boots (Connect → Active), ConnectRetry (10 s) fires, SYN/SYN-ACK
 * (MSS 9,176), the two OPENs crossing (hold 9 vs 90, 57 and 65 bytes),
 * KEEPALIVEs (OpenSent → OpenConfirm → Established, hold = min(9, 90) = 9 s,
 * keepalive 3 s), the first UPDATE and End-of-RIB, steady keepalives (hold
 * timer chart); then rr1's BGP process hangs at 598.0015 s while its kernel
 * still ACKs, leaf1's hold timer runs down to 0 at 607.0015 s and it sends
 * NOTIFICATION 4/0; rr2.ams still has the routes.
 *
 * Inputs: none. 17 frames.
 */
export const bgpFsm: FabGen = () => {
  const L = "leaf1.ams";
  const R = "rr1.ams";
  const R2 = "rr2.ams";
  const S = "spine1.ams";
  const fab = new Fab(
    [
      { id: S, kind: "spine", x: 42, y: 0, tone: "muted" },
      { id: R2, kind: "rr", x: 90, y: 0, tone: "muted", state: "Established" },
      { id: L, kind: "leaf", x: 10, y: 75, state: "Idle" },
      { id: R, kind: "rr", x: 90, y: 75, state: "booting" },
    ],
    [
      [L, S, { tone: "muted", label: "IS-IS" }],
      [S, R, { tone: "muted" }],
      [S, R2, { tone: "muted" }],
      [L, R, { dashed: true, label: "TCP 179" }],
      [L, R2, { dashed: true, tone: "muted" }],
    ],
    { height: 260 },
  );
  const sess = (s: { leaf: string; rr: string; tcp: string; retry: string; hold: string; ka: string }) => {
    fab.state(L, s.leaf);
    fab.state(R, s.rr);
    fab.table(0, {
      title: `${L} → ${R} session`,
      head: ["", "value"],
      rows: [["leaf1.ams state", s.leaf], ["rr1.ams state", s.rr], ["TCP", s.tcp], ["ConnectRetry timer", s.retry], ["hold timer", s.hold], ["keepalive timer", s.ka]],
      tones: ["active", undefined, undefined, undefined, undefined, undefined],
    });
  };
  const trace: string[][] = [];
  const step = (t: string, event: string, leaf: string, rr: string) => {
    trace.push([t, event, leaf, rr]);
    fab.table(1, { title: "FSM trace", head: ["time (s)", "event", "leaf1.ams", "rr1.ams"], rows: trace.slice(-8), tones: trace.slice(-8).map((_, i, a) => (i === a.length - 1 ? "active" : undefined)) });
    fab.set({ "t (s)": t });
  };
  const ip = (src: string, dst: string): HeaderSpec => ({ name: "IPv4", size: 20, reader: "routers on the path", fields: { src, dst, protocol: "6 (TCP)" } });
  const tcp = (sport: number | string, dport: number | string, flags: string, extra: Record<string, string | number> = {}): HeaderSpec => ({ name: "TCP", size: 20, reader: "the two kernels", fields: { "src port": sport, "dst port": dport, flags, ...extra } });
  const open = (len: number, hold: number, id: string, plen: number, caps: string): HeaderSpec[] => [
    BGP_HEADER(len, "1 (OPEN)"),
    { name: "OPEN", tone: "path", reader: "the peer's BGP process", fields: [["version", "4"], ["My AS", "65000"], ["Hold Time", String(hold)], ["BGP Identifier", id], ["opt. params length", String(plen)], ["capabilities", caps]] },
  ];
  const LEAF_CAPS = "IPv4 unicast, L2VPN EVPN, route refresh, 4-byte AS";
  const RR_CAPS = "IPv4 unicast, IPv6 unicast, L2VPN EVPN, route refresh, 4-byte AS";
  const keepalive: HeaderSpec[] = [BGP_HEADER(19, "4 (KEEPALIVE)")];

  sess({ leaf: "Idle", rr: "booting", tcp: "none", retry: "stopped", hold: "stopped", ka: "stopped" });
  fab.set({ session: "iBGP, AS 65000, 10.255.1.11 ↔ 10.255.1.101" });
  fab.note(
    `leaf1.ams (loopback 10.255.1.11) and its route reflector rr1.ams (10.255.1.101) are both in AS 65000, so this is an iBGP session between loopbacks, carried over TCP through spine1.ams on routes that IS-IS provides. rr1.ams has just rebooted, and like all Meridian reflectors it never opens connections itself: it accepts them from the site's loopback range.`,
    "topology",
  );

  sess({ leaf: "Connect", rr: "booting", tcp: "SYN sent", retry: "10 s", hold: "stopped", ka: "stopped" });
  step("0.0000", "ManualStart, SYN to 179", "Idle → Connect", "booting");
  fab.headers([ip(loopback(L), loopback(R)), tcp("ephemeral", 179, "SYN")], `${L} → ${R}`);
  fab.send(
    L,
    R,
    "TCP SYN → port 179",
    `An operator enables the neighbour (the ManualStart event): leaf1.ams leaves Idle for Connect, starts its ConnectRetry timer (10 s on Meridian; RFC 4271 suggests 120 s) and sends a TCP SYN to 10.255.1.101 port 179.`,
  );

  sess({ leaf: "Active", rr: "booting", tcp: "refused", retry: "10 s", hold: "stopped", ka: "stopped" });
  step("0.0004", "RST: nothing on 179", "Connect → Active", "booting");
  fab.headers([ip(loopback(R), loopback(L)), tcp(179, "ephemeral", "RST ACK")], `${R} → ${L}`);
  fab.send(
    R,
    L,
    "TCP RST",
    `Nothing on rr1.ams is listening on port 179 yet, so its kernel answers with a TCP RST. leaf1.ams moves to Active, which despite the name means no TCP connection: it listens on 179 and waits for ConnectRetry to fire.`,
    { tone: "danger" },
  );

  sess({ leaf: "Connect", rr: "Active", tcp: "SYN sent", retry: "10 s", hold: "stopped", ka: "stopped" });
  step("10.0004", "ConnectRetry expires", "Active → Connect", "Active (listening)");
  fab.headers([ip(loopback(L), loopback(R)), tcp(40123, 179, "SYN", { MSS: 9176 })], `${L} → ${R}`);
  fab.send(
    L,
    R,
    "TCP SYN → port 179",
    `Ten seconds later ConnectRetry expires: leaf1.ams goes back to Connect and sends a fresh SYN from port 40123. rr1.ams's BGP process is up now and, being passive, waits in Active with a socket listening on 179.`,
  );

  step("10.0006", "SYN-ACK", "Connect", "Active");
  fab.headers([ip(loopback(R), loopback(L)), tcp(179, 40123, "SYN ACK", { MSS: 9176 })], `${R} → ${L}`);
  fab.send(
    R,
    L,
    "TCP SYN-ACK",
    `rr1.ams answers with a SYN-ACK. Both sides advertise an MSS of 9,176 bytes: Meridian's 9,216-byte fabric MTU minus 20 bytes of IPv4 and 20 of TCP header.`,
  );

  sess({ leaf: "OpenSent", rr: "Active", tcp: "established", retry: "stopped", hold: "240 s (waiting for OPEN)", ka: "stopped" });
  step("10.0007", "ACK, send OPEN", "Connect → OpenSent", "Active");
  fab.headers(open(57, 9, loopback(L), 28, LEAF_CAPS), `${L} → ${R}, inside the TCP stream`);
  fab.send(
    L,
    R,
    "OPEN, hold 9",
    `The ACK completes the handshake and leaf1.ams immediately writes its 57-byte OPEN into the connection: version 4, My AS 65000, Hold Time 9, BGP Identifier 10.255.1.11 and 28 bytes of capabilities. It is now in OpenSent, with its hold timer at a large value (240 s here) until the peer's OPEN arrives.`,
  );

  sess({ leaf: "OpenSent", rr: "OpenSent", tcp: "established", retry: "stopped", hold: "240 s (waiting for OPEN)", ka: "stopped" });
  step("10.0009", "rr1 sends OPEN", "OpenSent", "Active → OpenSent");
  fab.headers(open(65, 90, loopback(R), 36, RR_CAPS), `${R} → ${L}, inside the TCP stream`);
  fab.send(
    R,
    L,
    "OPEN, hold 90",
    `rr1.ams moved from Active to OpenSent when the connection arrived and sends its own OPEN: Hold Time 90, BGP Identifier 10.255.1.101 and one more capability, IPv6 unicast, which makes it 65 bytes. The two OPENs cross in flight; neither side waits for the other's.`,
  );

  sess({ leaf: "OpenConfirm", rr: "OpenSent", tcp: "established", retry: "stopped", hold: "9 s", ka: "3 s" });
  step("10.0011", "rr1's OPEN accepted", "OpenSent → OpenConfirm", "OpenSent");
  fab.headers(keepalive, `${L} → ${R}`);
  fab.set({ "negotiated hold": "min(9, 90) = 9 s", keepalive: "9 / 3 = 3 s", families: "IPv4 unicast, L2VPN EVPN" });
  fab.send(
    L,
    R,
    "KEEPALIVE",
    `leaf1.ams checks rr1's OPEN: version 4, AS 65000 as configured, an identifier different from its own, an acceptable hold time. It settles on Hold Time min(9, 90) = 9 s with a 3 s keepalive, keeps the families both offered (IPv4 unicast and L2VPN EVPN, not IPv6), sends a 19-byte KEEPALIVE and enters OpenConfirm.`,
  );

  sess({ leaf: "OpenConfirm", rr: "OpenConfirm", tcp: "established", retry: "stopped", hold: "9 s", ka: "3 s" });
  step("10.0011", "leaf1's OPEN accepted", "OpenConfirm", "OpenSent → OpenConfirm");
  fab.at(`${R} → ${L}`);
  fab.send(
    R,
    L,
    "KEEPALIVE",
    `rr1.ams runs the same checks on leaf1's OPEN, reaches the same 9 s hold time, sends its own KEEPALIVE and enters OpenConfirm. A KEEPALIVE at this point means "I accept your OPEN"; a peer that disliked it would send a NOTIFICATION instead.`,
  );

  sess({ leaf: "Established", rr: "Established", tcp: "established", retry: "stopped", hold: "9 s (restarts on every message)", ka: "3 s" });
  step("10.0015", "KEEPALIVE received", "OpenConfirm → Established", "Established");
  fab.state(L, "Established", "done");
  fab.state(R, "Established", "done");
  fab.linkSet(L, R, { dashed: false, tone: "done", label: "Established" });
  fab.note(
    `rr1's KEEPALIVE reaches leaf1.ams at 10.0015 s and it moves to Established; rr1.ams already did on leaf1's KEEPALIVE. The second attempt went from SYN to Established in 1.1 ms (10.0004 to 10.0015 s); the 10 s before it were spent waiting out ConnectRetry after the refused first attempt.`,
    "established",
  );

  step("10.0020", "UPDATE received", "Established", "Established");
  fab.headers(
    [
      BGP_HEADER(4049, "2 (UPDATE)"),
      { name: "UPDATE", tone: "path", reader: "leaf1.ams's BGP process", fields: [["withdrawn routes", "none"], ["path attributes", "ORIGIN, AS_PATH (empty), LOCAL_PREF 100, ORIGINATOR_ID, CLUSTER_LIST, extended communities (route targets)"], ["MP_REACH_NLRI", "AFI 25 / SAFI 70 (L2VPN EVPN): EVPN routes"]] },
    ],
    `${R} → ${L}`,
  );
  fab.send(
    R,
    L,
    "UPDATE (EVPN routes)",
    `Only now may routes flow. rr1.ams starts the table transfer with a 4,049-byte UPDATE of EVPN routes inside MP_REACH_NLRI, close to BGP's 4,096-byte message limit (module 06 opens the routes; ORIGINATOR_ID and CLUSTER_LIST mark them as reflected, lesson 04-05). Every UPDATE received restarts leaf1's hold timer just as a KEEPALIVE does.`,
  );

  step("after the last UPDATE", "End-of-RIB", "Established", "Established");
  fab.headers([BGP_HEADER(29, "2 (UPDATE)"), { name: "UPDATE", tone: "path", reader: "leaf1.ams's BGP process", fields: [["withdrawn routes", "none"], ["MP_UNREACH_NLRI", "AFI 25 / SAFI 70, no routes"]] }], `${R} → ${L}`);
  fab.send(
    R,
    L,
    "End-of-RIB",
    `Each family's transfer ends with End-of-RIB, an UPDATE that carries no routes: for EVPN, the 29-byte UPDATE shown, holding only an empty MP_UNREACH_NLRI for AFI 25 / SAFI 70, for IPv4 unicast a bare 23-byte UPDATE. It tells leaf1.ams it now holds everything rr1.ams has in that family, which is how a tool tells a session still loading from one that is complete.`,
  );

  fab.headers(keepalive, "each way, every 3 s");
  fab.chart({ title: "leaf1.ams hold timer", unit: "s left", yMax: 10, xLabel: "seconds", series: [{ name: "hold timer", tone: "active" }], marks: [{ y: 0, label: "expiry", tone: "danger" }] });
  for (const v of [9, 8, 7, 9, 8, 7, 9, 8, 7, 9]) fab.point({ "hold timer": v });
  step("every 3 s", "KEEPALIVE each way", "Established", "Established");
  fab.packets(
    [
      { from: L, to: R, label: "KEEPALIVE", progress: 0.35 },
      { from: R, to: L, label: "KEEPALIVE", progress: 0.35 },
    ],
    `From here a quiet session is just KEEPALIVEs, one every 3 s each way. Each one received resets leaf1's 9 s hold timer, so on the chart it falls for 3 s and jumps back to 9, never near zero while rr1.ams is healthy.`,
    "steady",
  );

  fab.point({ "hold timer": null });
  fab.point({ "hold timer": 9 });
  sess({ leaf: "Established", rr: "BGP process hung", tcp: "established (kernel ACKs)", retry: "stopped", hold: "9 s from 598.0015", ka: "3 s" });
  fab.state(R, "BGP hung", "danger");
  fab.state(L, "Established", "done");
  step("598.0015", "last KEEPALIVE from rr1", "Established", "process hangs");
  fab.at(`${R} → ${L}, the last one`);
  fab.send(
    R,
    L,
    "last KEEPALIVE",
    `At 598.0015 s rr1.ams's last KEEPALIVE arrives; just after it, rr1's BGP process hangs. Its kernel is fine, so the TCP connection stays open and still acknowledges every byte leaf1.ams sends.`,
  );

  for (const v of [8, 7, 6, 5, 4, 3]) fab.point({ "hold timer": v });
  sess({ leaf: "Established", rr: "BGP process hung", tcp: "established (kernel ACKs)", retry: "stopped", hold: "3 s left", ka: "3 s" });
  fab.state(R, "BGP hung", "danger");
  fab.state(L, "Established", "compare");
  fab.linkSet(L, R, { tone: "compare", label: "TCP up, BGP silent" });
  step("601.0015 / 604.0015", "no BGP message received", "Established", "hung");
  fab.headers(keepalive, `${L} → ${R}, acknowledged by rr1's kernel only`);
  fab.packets(
    [
      { from: L, to: R, label: "KEEPALIVE", progress: 0.4 },
      { from: R, to: L, label: "TCP ACK only", progress: 0.4, tone: "muted" },
    ],
    `leaf1.ams keeps sending its KEEPALIVEs at 601 and 604 s and gets TCP acknowledgements back, but no BGP message, so nothing resets its hold timer: 6, then 3 seconds left. By TCP's standards this connection is healthy.`,
    "silent",
  );

  for (const v of [2, 1, 0]) fab.point({ "hold timer": v });
  sess({ leaf: "Idle", rr: "BGP process hung", tcp: "closed by leaf1.ams", retry: "stopped", hold: "expired", ka: "stopped" });
  fab.state(L, "Idle", "danger");
  fab.state(R, "BGP hung", "danger");
  fab.down(L, R, "NOTIFICATION 4/0");
  step("607.0015", "hold timer expires", "Established → Idle", "hung");
  fab.headers([BGP_HEADER(21, "3 (NOTIFICATION)"), { name: "NOTIFICATION", tone: "danger", reader: "the peer, if it is still listening", fields: [["error code", "4 (Hold Timer Expired)"], ["subcode", "0"], ["data", "none"]] }], `${L} → ${R}`);
  fab.send(
    L,
    R,
    "NOTIFICATION 4/0",
    `At 607.0015 s, 9 s after the last message, the hold timer reaches zero. leaf1.ams sends a 21-byte NOTIFICATION with error code 4 (Hold Timer Expired), subcode 0, closes the TCP connection, drops to Idle and removes every route it learned from rr1.ams from its tables.`,
    { tone: "danger" },
  );

  fab.headers(undefined);
  fab.tone(R2, "done");
  fab.tone(L, "compare");
  fab.linkSet(L, R2, { tone: "done", dashed: false, label: "Established" });
  fab.set({ "last error": "NOTIFICATION 4/0, sent by leaf1.ams at 607.0015 s", "routes still held": "from rr2.ams" });
  fab.note(
    `leaf1.ams loses no reachability, because it holds the same routes from rr2.ams over a second session: that is why reflectors come in pairs. It will retry rr1.ams from Idle, and a monitoring tool should record the last NOTIFICATION (4/0), which side sent it (leaf1.ams) and when, not just the current state.`,
    "done",
  );
  return fab.f.done();
};

// ---------- bgp-ribs ----------

/**
 * `bgp-ribs` (lesson 04-03, updates, attributes and RIBs). gw2.ams's eBGP
 * session to ISP2 has just come back; until now gw2.ams reached 192.0.2.0/24
 * (AS 64511) through gw1.sin over iBGP. ISP2 sends a 70-byte UPDATE (no
 * withdrawals; ORIGIN IGP, AS_PATH 64502 64511, NEXT_HOP 198.51.100.0, MED 0,
 * community 64502:3010; NLRI 192.0.2.0/24 and 192.0.2.128/25), shown
 * attribute by attribute with byte counts. It lands in the Adj-RIB-In; import
 * policy rejects the /25 (longer than /24) and sets LOCAL_PREF 100 and
 * community 64500:102; the Loc-RIB compares it with gw1.sin's path (tie down
 * to eBGP over iBGP, so ISP2's path wins); the FIB moves from Singapore to the
 * ISP2 link; export policy sends it to the iBGP peers with next-hop-self
 * (76-byte UPDATE) and only Meridian's own block to ISP2; gw1.ams then moves
 * to gw2.ams's path (IGP cost 20 vs 120), matching `bgp-best-path`.
 *
 * Inputs: none. 11 frames.
 */
export const bgpRibs: FabGen = () => {
  const G = "gw2.ams";
  const G1 = "gw1.ams";
  const GS = "gw1.sin";
  const fab = new Fab(
    [
      { id: "isp2", label: "ISP2", kind: "isp", x: 50, y: 0, state: "AS 64502" },
      { id: G, kind: "gw", x: 50, y: 50, state: loopback(G) },
      { id: G1, kind: "gw", x: 14, y: 100, state: loopback(G1) },
      { id: GS, kind: "gw", x: 86, y: 100, state: loopback(GS) },
    ],
    [
      ["isp2", G, { label: "eBGP" }],
      [G, G1, { dashed: true, label: "iBGP" }],
      [G, GS, { dashed: true, label: "iBGP" }],
    ],
    { height: 250 },
  );
  const STAGES = [
    ["1", "Adj-RIB-In (per peer)", "routes as received"],
    ["2", "import policy", "accept, reject or modify"],
    ["3", "Loc-RIB", "every accepted path; one best per prefix"],
    ["4", "RIB and FIB", "best path installed for forwarding"],
    ["5", "export policy (per peer)", "what this peer may receive"],
    ["6", "Adj-RIB-Out (per peer)", "what this peer was sent"],
  ];
  const stage = (n: number) => fab.table(0, { title: `BGP's pipeline on ${G}`, head: ["#", "stage", "holds"], rows: STAGES, tones: STAGES.map((_, i) => (i + 1 === n ? "active" : i + 1 < n ? "done" : undefined)) });
  const comms = "64502:3010";
  const nlri = [REMOTE, REMOTE_MORE];
  const inAttrs = attr(1) + asPathBytes(2) + attr(4) + attr(4) + attr(4);
  const inLen = 19 + 4 + inAttrs + nlri.reduce((n, p) => n + nlriBytes(p), 0);
  const fromIsp2: HeaderSpec[] = [
    BGP_HEADER(inLen, "2 (UPDATE)"),
    { name: "lengths", size: 4, reader: "gw2.ams's parser", fields: { "withdrawn routes length": 0, "path attribute length": inAttrs } },
    { name: "ORIGIN", size: attr(1), reader: "best path (step 6)", fields: { value: "0 (IGP)" } },
    { name: "AS_PATH", size: asPathBytes(2), reader: "loop check, best path", fields: { segment: "AS_SEQUENCE", ASNs: "64502 64511" } },
    { name: "NEXT_HOP", size: attr(4), reader: "next-hop resolution", fields: { address: LINKS.isp2Gw2.isp } },
    { name: "MULTI_EXIT_DISC", size: attr(4), reader: "best path (step 7)", fields: { MED: 0 } },
    { name: "COMMUNITIES", size: attr(4), reader: "policy", fields: { values: comms } },
    { name: "NLRI", size: nlri.reduce((n, p) => n + nlriBytes(p), 0), tone: "path", reader: "everything above applies to each prefix", fields: { prefixes: nlri.join(", ") } },
  ];

  stage(0);
  fab.table(1, { title: `${G} Loc-RIB for ${REMOTE}`, head: ["from", "AS_PATH", "NEXT_HOP", "best"], rows: [[`${GS} (iBGP)`, "64502 64511", loopback(GS), "yes"]], tones: ["done"] });
  fab.state(G, "session up", "active");
  fab.note(
    `gw2.ams, one of Meridian's Amsterdam border gateways (AS 64500), has just brought its session to ISP2 (AS 64502) back after maintenance. Until now it reached 192.0.2.0/24, a content network's prefix (AS 64511), through gw1.sin in Singapore over iBGP; every route it is about to receive passes the six stages in the table.`,
    "topology",
  );

  fab.headers(fromIsp2, "ISP2 → gw2.ams, as sent");
  fab.send(
    "isp2",
    G,
    `UPDATE ${REMOTE}, ${REMOTE_MORE}`,
    `ISP2 sends a ${inLen}-byte UPDATE: no withdrawn routes, five path attributes (ORIGIN IGP, AS_PATH 64502 64511, NEXT_HOP 198.51.100.0, MED 0 and community 64502:3010, ISP2's tag for where it learned the route) and two prefixes that share them, 192.0.2.0/24 and 192.0.2.128/25. One UPDATE carries one set of attributes for any number of prefixes.`,
  );

  stage(1);
  fab.at("stored as received");
  fab.table(1, {
    title: `${G} Adj-RIB-In from ISP2 (pre-policy)`,
    head: ["prefix", "AS_PATH", "NEXT_HOP", "MED", "communities"],
    rows: nlri.map((p) => [p, "64502 64511", LINKS.isp2Gw2.isp, "0", comms]),
  });
  fab.note(
    `Both prefixes land in the Adj-RIB-In for ISP2 exactly as received, before any policy. Most routers keep this pre-policy copy only when configured to (soft reconfiguration); otherwise, when policy changes, they ask the peer to send everything again with ROUTE-REFRESH. BMP monitoring can export it as the pre-policy view.`,
    "adj-rib-in",
  );

  stage(2);
  fab.at("received UPDATE, now going through import policy");
  fab.table(1, {
    title: "import policy from ISP2, in order",
    head: ["rule", "192.0.2.0/24", "192.0.2.128/25"],
    rows: [
      ["AS_PATH contains 64500?", "no", "no"],
      ["bogon or Meridian's own block?", "no", "no"],
      ["longer than /24?", "no", "yes: reject"],
      ["set LOCAL_PREF", "100 (transit)", "—"],
      ["add community", "64500:102", "—"],
    ],
    tones: [undefined, undefined, "danger", "compare", "compare"],
  });
  fab.note(
    `Import policy runs rule by rule. 192.0.2.128/25 is rejected because Meridian, like most networks, accepts nothing longer than /24 from the internet; 192.0.2.0/24 passes and is given LOCAL_PREF 100, the value Meridian uses for a transit provider, and Meridian's own community 64500:102, meaning learned from ISP2 at gw2.ams.`,
    "import",
  );

  fab.table(1, {
    title: `${G} Adj-RIB-In from ISP2 (post-policy)`,
    head: ["prefix", "AS_PATH", "NEXT_HOP", "LOCAL_PREF", "communities"],
    rows: [
      [REMOTE, "64502 64511", LINKS.isp2Gw2.isp, "100", `${comms} 64500:102`],
      [REMOTE_MORE, "—", "—", "—", "rejected by policy"],
    ],
    tones: ["done", "danger"],
  });
  fab.note(
    `The post-policy view holds one usable route. LOCAL_PREF did not arrive with it: that attribute never crosses an AS boundary, so each AS sets its own on import, and from here it travels with the route to every iBGP peer inside AS 64500.`,
    "post-policy",
  );

  stage(3);
  fab.at("the UPDATE ISP2 sent (192.0.2.0/24 now in the Loc-RIB)");
  fab.table(1, {
    title: `${G} Loc-RIB for ${REMOTE}`,
    head: ["from", "AS_PATH", "LP", "MED", "NEXT_HOP", "best"],
    rows: [
      ["ISP2 (eBGP)", "64502 64511", "100", "0", LINKS.isp2Gw2.isp, "yes"],
      [`${GS} (iBGP)`, "64502 64511", "100", "0", loopback(GS), "no"],
    ],
    tones: ["done", "muted"],
  });
  fab.note(
    `In the Loc-RIB the new path meets the one gw2.ams was using, learned from gw1.sin. They tie on LOCAL_PREF (100), AS_PATH length (2), ORIGIN (IGP) and MED (0, both from AS 64502), so the decision falls to eBGP over iBGP and the path from ISP2 becomes best; lesson 04-06 walks every step.`,
    "loc-rib",
  );

  stage(4);
  fab.at("the UPDATE ISP2 sent (192.0.2.0/24 now installed)");
  fab.state(G, "FIB updated", "done");
  fab.path(["isp2", G]);
  fab.table(1, {
    title: `${G} FIB entry for ${REMOTE}`,
    head: ["", "next hop", "out"],
    rows: [
      ["before", `${loopback(GS)} (gw1.sin)`, "spines, long-haul"],
      ["after", LINKS.isp2Gw2.isp, "port to ISP2"],
    ],
    tones: ["muted", "done"],
  });
  fab.note(
    `The best path goes to the routing table and from there into the forwarding chip: 192.0.2.0/24 now leaves through ISP2's link to 198.51.100.0 instead of first crossing 10,500 km to Singapore. Paths that are not best stay in the Loc-RIB as backups but are not installed (unless multipath is on).`,
    "fib",
  );

  stage(5);
  const outAttrs = attr(1) + asPathBytes(2) + attr(4) + attr(4) + attr(4) + attr(8);
  const outLen = 19 + 4 + outAttrs + nlriBytes(REMOTE);
  fab.headers(
    [
      BGP_HEADER(outLen, "2 (UPDATE)"),
      { name: "lengths", size: 4, reader: "the peer's parser", fields: { "withdrawn routes length": 0, "path attribute length": outAttrs } },
      { name: "ORIGIN", size: attr(1), reader: "best path (step 6)", fields: { value: "0 (IGP)" } },
      { name: "AS_PATH", size: asPathBytes(2), reader: "loop check, best path", fields: { segment: "AS_SEQUENCE", ASNs: "64502 64511" } },
      { name: "NEXT_HOP", size: attr(4), reader: "next-hop resolution", fields: { address: loopback(G) } },
      { name: "MULTI_EXIT_DISC", size: attr(4), reader: "best path (step 7)", fields: { MED: 0 } },
      { name: "LOCAL_PREF", size: attr(4), reader: "best path (step 3), iBGP only", fields: { value: 100 } },
      { name: "COMMUNITIES", size: attr(8), reader: "policy", fields: { values: `${comms} 64500:102` } },
      { name: "NLRI", size: nlriBytes(REMOTE), tone: "path", reader: "everything above applies to it", fields: { prefixes: REMOTE } },
    ],
    `gw2.ams → its iBGP peers, after export policy`,
  );
  fab.table(1, {
    title: "export policy, per peer",
    head: ["peer", "rule", "192.0.2.0/24"],
    rows: [
      [`${G1}, ${GS} (iBGP)`, "all best paths, next-hop-self", "send, NEXT_HOP 10.255.1.202"],
      ["ISP2 (eBGP)", "Meridian's own blocks only", "deny"],
    ],
    tones: ["done", "danger"],
  });
  fab.note(
    `Export runs per peer. To its iBGP peers gw2.ams sends a ${outLen}-byte UPDATE whose highlighted fields differ from ISP2's: NEXT_HOP rewritten to its own loopback 10.255.1.202 (next-hop-self, lesson 04-04), LOCAL_PREF 100 and community 64500:102 added, and only the accepted /24. The AS_PATH is untouched, because a route gains an AS number only when it leaves the AS.`,
    "export",
  );

  stage(6);
  fab.table(1, {
    title: `${G} Adj-RIB-Out`,
    head: ["peer", "prefix", "NEXT_HOP", "AS_PATH"],
    rows: [
      [G1, REMOTE, loopback(G), "64502 64511"],
      [GS, REMOTE, loopback(G), "64502 64511"],
      ["ISP2", OWN, LINKS.isp2Gw2.gw, "64500"],
    ],
  });
  fab.packets(
    [
      { from: G, to: G1, label: `UPDATE ${REMOTE}`, progress: 0.5 },
      { from: G, to: GS, label: `UPDATE ${REMOTE}`, progress: 0.5 },
    ],
    `Each peer's Adj-RIB-Out holds what it was sent: gw1.ams and gw1.sin get 192.0.2.0/24, while ISP2 gets only 203.0.113.0/24. Towards a provider Meridian exports its own blocks and nothing else; passing ISP2's routes on to ISP1 would offer to carry traffic between them (lesson 05-03).`,
    "adj-rib-out",
  );

  fab.headers(undefined);
  fab.tone(G1, "done");
  fab.table(1, {
    title: "what the iBGP peers do with it",
    head: ["peer", "its best path now", "why"],
    rows: [
      [G1, "via gw2.ams (10.255.1.202)", "IGP cost 20 beats 120 to gw1.sin"],
      [GS, "its own path from ISP2", "eBGP beats iBGP"],
    ],
    tones: ["done", undefined],
  });
  fab.note(
    `The change ripples on: gw1.ams moves its traffic for 192.0.2.0/24 from gw1.sin to gw2.ams, which is 20 away in IS-IS instead of 120, while gw1.sin keeps its own route from ISP2. gw2.ams still holds gw1.sin's path in its Loc-RIB as a backup, ready if ISP2's session drops again.`,
    "ripple",
  );

  stage(7);
  fab.set({ "received from ISP2": 2, "accepted after policy": 1, "best and installed": 1, "advertised to iBGP peers": 1 });
  fab.note(
    `Per peer, the numbers a monitoring tool should show are prefixes received (2), accepted after policy (1) and installed as best (1). A gap between received and accepted points at import policy; a gap between accepted and best points at the decision process or at a next hop that does not resolve.`,
    "done",
  );
  return fab.f.done();
};

// ---------- bgp-next-hop-resolution ----------

/**
 * `bgp-next-hop-resolution` (lesson 04-04, iBGP, loops and next hops).
 * Amsterdam's two gateways only (small example): gw2.ams learns 192.0.2.0/24
 * from ISP2 with NEXT_HOP 198.51.100.0 and passes it to gw1.ams over iBGP.
 * Without next-hop-self the next hop is ISP2's link address, which IS-IS does
 * not carry, so gw1.ams marks the route unusable and stays on ISP1 (AS_PATH
 * one longer). With next-hop-self the next hop is gw2's loopback 10.255.1.202,
 * resolved recursively through the IS-IS /32 via spine1.ams and spine2.ams
 * (ECMP, metric 20) into a FIB entry with two physical next hops. Then an IGP
 * change (gw2–spine1 fails) changes only the FIB, and gw2.ams losing power
 * makes the next hop unresolvable: next-hop tracking moves traffic to ISP1
 * while the iBGP session still shows Established.
 *
 * Inputs: none. 12 frames.
 */
export const bgpNextHopResolution: FabGen = () => {
  const G1 = "gw1.ams";
  const G2 = "gw2.ams";
  const S1 = "spine1.ams";
  const S2 = "spine2.ams";
  const fab = new Fab(
    [
      { id: "isp1", label: "ISP1", kind: "isp", x: 12, y: 0, state: "AS 64501" },
      { id: "isp2", label: "ISP2", kind: "isp", x: 88, y: 0, state: "AS 64502" },
      { id: G1, kind: "gw", x: 12, y: 50, state: loopback(G1) },
      { id: G2, kind: "gw", x: 88, y: 50, state: loopback(G2) },
      { id: S1, kind: "spine", x: 34, y: 100 },
      { id: S2, kind: "spine", x: 66, y: 100 },
    ],
    [
      ["isp1", G1, { label: LINKS.isp1Gw1.net }],
      ["isp2", G2, { label: LINKS.isp2Gw2.net }],
      [G1, S1],
      [G1, S2],
      [G2, S1],
      [G2, S2],
      [G1, G2, { dashed: true, label: "iBGP 10.255.1.201 ↔ .202" }],
    ],
    { height: 280 },
  );
  const a1 = gwSpine(G1, S1);
  const a2 = gwSpine(G1, S2);
  const b1 = gwSpine(G2, S1);
  const igpRows = (viaS1: boolean) => [
    [`${loopback(G2)}/32`, "IS-IS", viaS1 ? `${a1.spine} (spine1), ${a2.spine} (spine2)` : `${a2.spine} (spine2)`, "20"],
    [`${loopback(S1)}/32`, "IS-IS", `${a1.spine} (spine1)`, "10"],
    [a1.net, "connected", "to spine1", "0"],
    [a2.net, "connected", "to spine2", "0"],
    [LINKS.isp1Gw1.net, "connected", "to ISP1", "0"],
  ];
  const igp = (viaS1: boolean, tones?: (Tone | undefined)[]) => fab.table(1, { title: `${G1} routing table (IS-IS and connected)`, head: ["prefix", "source", "next hop", "metric"], rows: igpRows(viaS1), tones });
  const bgp = (rows: string[][], tones: (Tone | undefined)[]) => fab.table(0, { title: `${G1} BGP paths for ${REMOTE}`, head: ["from", "AS_PATH", "NEXT_HOP", "status"], rows, tones });
  const viaIsp1 = ["ISP1 (eBGP)", "64501 64496 64511", LINKS.isp1Gw1.isp, "best"];
  const upd = (nh: string): HeaderSpec[] => [
    { name: "UPDATE", tone: "path", reader: "the receiving BGP speaker", fields: [["NLRI", REMOTE], ["AS_PATH", "64502 64511"], ["NEXT_HOP", nh], ["LOCAL_PREF", "100"]] },
  ];

  igp(true);
  bgp([viaIsp1], ["done"]);
  fab.note(
    `Amsterdam's two border gateways, gw1.ams (10.255.1.201) and gw2.ams (10.255.1.202), share AS 64500 and run iBGP between their loopbacks; IS-IS, through spine1.ams and spine2.ams, carries those loopbacks and the fabric's links. It does not carry the links to the ISPs, so gw1.ams's routing table has nothing for 198.51.100.0/31, gw2's link to ISP2.`,
    "topology",
  );

  fab.headers([{ name: "UPDATE", tone: "path", reader: "gw2.ams", fields: [["NLRI", REMOTE], ["AS_PATH", "64502 64511"], ["NEXT_HOP", LINKS.isp2Gw2.isp]] }], "ISP2 → gw2.ams");
  fab.path(["isp2", G2], "frontier");
  fab.send(
    "isp2",
    G2,
    `UPDATE ${REMOTE}`,
    `ISP2 announces 192.0.2.0/24 to gw2.ams with NEXT_HOP 198.51.100.0, its own address on their shared /31. gw2.ams resolves that next hop trivially, because the address is on a directly connected link.`,
  );

  fab.clearPath();
  fab.headers(upd(LINKS.isp2Gw2.isp), "gw2.ams → gw1.ams over iBGP, default behaviour");
  fab.send(
    G2,
    G1,
    "UPDATE, NEXT_HOP 198.51.100.0",
    `gw2.ams passes the route to gw1.ams over iBGP. By default iBGP leaves NEXT_HOP unchanged, so gw1.ams is told to send traffic for 192.0.2.0/24 to 198.51.100.0, an address on a link gw1.ams is not attached to.`,
  );

  fab.state(G1, "next hop?", "danger");
  bgp([viaIsp1, [`${G2} (iBGP)`, "64502 64511", LINKS.isp2Gw2.isp, "unusable: no route to next hop"]], ["done", "danger"]);
  igp(true);
  fab.set({ "lookup 198.51.100.0": "no match" });
  fab.note(
    `gw1.ams looks up 198.51.100.0 in its routing table and finds no match. A path whose next hop cannot be resolved is kept but excluded from best-path selection, so gw1.ams stays on ISP1's path, one AS longer; the session is Established and the prefix was received, and only the next-hop status shows why it is unused.`,
    "unresolved",
  );

  fab.state(G1, loopback(G1));
  fab.tone(G1, undefined);
  fab.headers(upd(loopback(G2)), "gw2.ams → gw1.ams over iBGP, with next-hop-self");
  fab.unset("lookup 198.51.100.0");
  fab.send(
    G2,
    G1,
    "UPDATE, NEXT_HOP 10.255.1.202",
    `The usual fix is next-hop-self: gw2.ams rewrites NEXT_HOP to its own loopback, 10.255.1.202, on routes it sends to iBGP peers, and sends the route again. The alternative, carrying the ISP links in IS-IS, would put external addresses into the IGP.`,
  );

  bgp(
    [
      ["ISP1 (eBGP)", "64501 64496 64511", LINKS.isp1Gw1.isp, "valid"],
      [`${G2} (iBGP)`, "64502 64511", loopback(G2), "best"],
    ],
    [undefined, "done"],
  );
  igp(true, ["active"]);
  fab.set({ "lookup 10.255.1.202": "10.255.1.202/32 via IS-IS, metric 20" });
  fab.note(
    `Now the lookup succeeds: 10.255.1.202 matches the IS-IS route 10.255.1.202/32, metric 20, through spine1.ams and spine2.ams. The path is usable, and with an AS_PATH one AS shorter than ISP1's it becomes gw1.ams's best path.`,
    "resolved",
  );

  fab.path([G1, S1, G2], "path");
  fab.path([G1, S2, G2], "path");
  fab.table(0, {
    title: `${G1} recursive resolution, then FIB`,
    head: ["step", "lookup", "result"],
    rows: [
      ["1. BGP", REMOTE, `NEXT_HOP ${loopback(G2)}`],
      ["2. IS-IS", `${loopback(G2)}/32`, `${a1.spine} (spine1), ${a2.spine} (spine2)`],
      ["3. FIB", REMOTE, `${a1.spine} and ${a2.spine}, ECMP`],
    ],
    tones: [undefined, undefined, "done"],
  });
  fab.set({ "BGP chose": "the exit, gw2.ams", "IS-IS chose": "the way there, spine1 or spine2" });
  fab.note(
    `Recursion ends in the FIB: the BGP route 192.0.2.0/24 points at 10.255.1.202, which IS-IS reaches through two equal-cost spines, so the forwarding chip gets 192.0.2.0/24 with two physical next hops, 10.254.1.200 and 10.254.2.200. BGP chose the exit; the IGP chose the way to it.`,
    "fib",
  );

  fab.headers(undefined);
  fab.send(
    G1,
    S1,
    "to 192.0.2.10",
    `Resolution only picks the first hop. spine1.ams must also forward a packet for 192.0.2.10 on towards gw2.ams, which works only if spine1 holds that route itself or the packet is tunnelled to 10.255.1.202; lesson 04-07 shows the black hole when neither is true.`,
  );

  fab.down(G2, S1);
  fab.clearPath();
  fab.path([G1, S2, G2], "path");
  igp(false, ["compare"]);
  fab.table(0, {
    title: `${G1} recursive resolution, then FIB`,
    head: ["step", "lookup", "result"],
    rows: [
      ["1. BGP", REMOTE, `NEXT_HOP ${loopback(G2)} (unchanged)`],
      ["2. IS-IS", `${loopback(G2)}/32`, `${a2.spine} (spine2) only`],
      ["3. FIB", REMOTE, `${a2.spine}`],
    ],
    tones: [undefined, "compare", "compare"],
  });
  fab.set({ "IS-IS chose": "the way there, spine2 only" });
  fab.note(
    `The gw2.ams–spine1.ams link (${b1.net}) fails. IS-IS recomputes and 10.255.1.202/32 is now best reached through spine2.ams alone, so gw1.ams's FIB entry for 192.0.2.0/24 drops to one next hop. BGP sent nothing and changed nothing: the exit is the same, only the way there moved.`,
    "igp-change",
  );

  fab.state(G2, "no power", "danger");
  fab.down(G2, S2);
  fab.down("isp2", G2);
  fab.clearPath();
  fab.path(["isp1", G1], "path");
  fab.linkSet(G1, G2, { tone: "compare", label: "iBGP still Established" });
  fab.table(1, {
    title: `${G1} routing table (IS-IS and connected)`,
    head: ["prefix", "source", "next hop", "metric"],
    rows: igpRows(false).slice(1),
  });
  bgp(
    [
      ["ISP1 (eBGP)", "64501 64496 64511", LINKS.isp1Gw1.isp, "best"],
      [`${G2} (iBGP)`, "64502 64511", loopback(G2), "unusable: next hop gone"],
    ],
    ["done", "danger"],
  );
  fab.set({ "lookup 10.255.1.202": "no match", "BGP chose": "the exit, ISP1", "IS-IS chose": "—" });
  fab.note(
    `Then gw2.ams loses power. Within about a second IS-IS removes 10.255.1.202/32 from gw1.ams's routing table (lesson 03-04 has the timings), and next-hop tracking, which watches the routing table for exactly this, marks every BGP path with that next hop unusable within moments, so 192.0.2.0/24 falls back to ISP1 while the iBGP session to gw2.ams still shows Established.`,
    "unresolvable",
  );

  fab.down(G1, G2, "hold timer expired");
  bgp([["ISP1 (eBGP)", "64501 64496 64511", LINKS.isp1Gw1.isp, "best"]], ["done"]);
  fab.set({ "session gw1.ams ↔ gw2.ams": "Idle (hold timer expired)" });
  fab.note(
    `When the session's hold timer later expires, gw2.ams's paths are deleted from gw1.ams's tables altogether. Traffic had moved long before: next-hop tracking, not the BGP session, decided how quickly gw1.ams stopped sending towards a dead exit.`,
    "session-down",
  );

  fab.set({ "show per route": "next hop, resolved or not, and through what" });
  fab.note(
    `For tooling, show next-hop resolvability per route, not just session state. An Established session whose prefixes are all unusable is the classic missing next-hop-self, and a next hop that resolves through an unexpected path is how traffic quietly takes a detour.`,
    "done",
  );
  return fab.f.done();
};

// ---------- route-reflector ----------

/**
 * `route-reflector` (lesson 04-05). Amsterdam's overlay in AS 65000, small
 * example of four leaves (drawn as a square so every session is visible).
 * Full mesh: n(n−1)/2 = 6 sessions, and iBGP split horizon is why (leaf1.ams
 * does not relay leaf3's route to leaf2). A reflector pair replaces it (2n + 1
 * sessions; table for 4, 16 and 48 leaves). leaf3.ams advertises Acme's
 * 10.1.2.0/24 (NEXT_HOP 10.255.1.13); rr1.ams adds ORIGINATOR_ID 10.255.1.13
 * and CLUSTER_LIST 10.255.1.100 (both reflectors share that cluster ID) and
 * reflects it to the other clients with NEXT_HOP unchanged; leaf1 holds two
 * copies. rr1's copy to its non-client peer rr2.ams is dropped as a loop
 * (own cluster ID in CLUSTER_LIST); a copy back to leaf3 would be ignored
 * (own ORIGINATOR_ID). Then the shared-cluster-ID trade-off, one reflector
 * failing (no traffic impact) and both failing (overlay routes withdrawn).
 *
 * Inputs: none. 12 frames.
 */
export const routeReflector: FabGen = () => {
  const leaves = ["leaf1.ams", "leaf2.ams", "leaf3.ams", "leaf4.ams"];
  const [L1, L2, L3, L4] = leaves as [string, string, string, string];
  const R1 = "rr1.ams";
  const R2 = "rr2.ams";
  const CLUSTER = "10.255.1.100";
  const fab = new Fab(
    [
      { id: R1, kind: "rr", x: 6, y: 68, state: loopback(R1) },
      { id: R2, kind: "rr", x: 94, y: 68, state: loopback(R2) },
      { id: L1, kind: "leaf", x: 32, y: 35, state: loopback(L1) },
      { id: L2, kind: "leaf", x: 68, y: 35, state: loopback(L2) },
      { id: L3, kind: "leaf", x: 32, y: 100, state: loopback(L3) },
      { id: L4, kind: "leaf", x: 68, y: 100, state: loopback(L4) },
    ],
    [],
    { height: 300 },
  );
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) fab.link(leaves[i]!, leaves[j]!, { dashed: true, tone: "frontier" });
  fab.tones([R1, R2], "muted");
  const sessions = (title: string, highlight?: number) =>
    fab.table(0, {
      title,
      head: ["leaves", "full mesh n(n−1)/2", "reflector pairs"],
      rows: [
        ["4 (this example)", "6", "8 + 1 = 9"],
        ["16 (all of ams)", "120", "32 + 1 = 33"],
        ["48 (three sites)", "1,128", "96 + 15 = 111"],
      ],
      tones: [0, 1, 2].map((i) => (i === highlight ? "active" : undefined)),
    });
  const upd = (extra: [string, string][] = []): HeaderSpec[] => [
    { name: "UPDATE", tone: "path", reader: "clients and reflectors", fields: [["NLRI", "10.1.2.0/24 (Acme)"], ["NEXT_HOP", loopback(L3)], ["AS_PATH", "(empty)"], ["LOCAL_PREF", "100"], ...extra] },
  ];
  const reflected: [string, string][] = [["ORIGINATOR_ID", loopback(L3)], ["CLUSTER_LIST", CLUSTER]];

  sessions("iBGP sessions needed", 0);
  fab.set({ "AS 65000 sessions": "6 (full mesh)" });
  fab.note(
    `Amsterdam's overlay, small example with four leaves, all in AS 65000. With plain iBGP every leaf needs a session to every other leaf, a full mesh of n(n−1)/2 = 6 sessions here, 120 for the site's 16 leaves and 1,128 for 48 leaves across three sites.`,
    "mesh",
  );

  fab.linkSet(L1, L3, { tone: "active" });
  fab.linkSet(L1, L2, { tone: "danger" });
  fab.packets(
    [
      { from: L3, to: L1, label: "10.1.2.0/24", progress: 0.55 },
      { from: L1, to: L2, label: "not relayed", lost: true, progress: 0.5 },
    ],
    `Why the mesh: inside one AS the AS_PATH never changes, so it cannot catch loops, and BGP's rule is that a route learned from an iBGP peer is never passed to another iBGP peer. leaf1.ams hears leaf3's route but will not relay it to leaf2.ams, so leaf2 must hear it from leaf3 directly.`,
    "split-horizon",
  );

  fab.s.links = [];
  for (const l of leaves) {
    fab.link(l, R1, { dashed: true });
    fab.link(l, R2, { dashed: true });
  }
  fab.link(R1, R2, { dashed: true, label: "non-client peers" });
  fab.tones([R1, R2], undefined);
  sessions("iBGP sessions needed", 1);
  fab.set({ "AS 65000 sessions": "9 (8 client + 1 between reflectors)" });
  fab.note(
    `Route reflection (RFC 4456) relaxes that rule on two routers. Every leaf keeps just two sessions, one to rr1.ams and one to rr2.ams, plus one between the reflectors: 9 sessions for four leaves is more than the mesh's 6, but 33 instead of 120 for 16 leaves, and a new leaf needs two sessions, not one to every other leaf.`,
    "reflectors",
  );

  fab.state(L3, "originates", "active");
  fab.headers(upd(), `${L3} → both reflectors`);
  fab.packets(
    [
      { from: L3, to: R1, label: "UPDATE 10.1.2.0/24", progress: 0.5 },
      { from: L3, to: R2, label: "UPDATE 10.1.2.0/24", progress: 0.5 },
    ],
    `leaf3.ams, where Acme's 10.1.2.0/24 lives, advertises it to both reflectors with NEXT_HOP 10.255.1.13, its own loopback. In Meridian it travels as an EVPN route (module 06), but reflection treats every route type the same way.`,
    "advertise",
  );

  fab.state(R1, "reflecting", "active");
  fab.headers(upd(reflected), `inside ${R1}, before reflecting`);
  fab.table(1, {
    title: "reflection rules (RFC 4456)",
    head: ["route learned from", "reflected to"],
    rows: [["a client", "all clients and non-clients"], ["a non-client iBGP peer", "clients only"], ["an eBGP peer", "everyone"]],
    tones: ["active", undefined, undefined],
  });
  fab.note(
    `rr1.ams learned the route from a client, so the rules say reflect it to every client and every non-client peer. Before it does, it adds two attributes: ORIGINATOR_ID 10.255.1.13, the router ID of the leaf that injected the route, and CLUSTER_LIST, to which it prepends its cluster ID, 10.255.1.100.`,
    "attributes",
  );

  fab.state(L3, loopback(L3), "done");
  fab.tones([L1, L2, L4], "done");
  fab.at(`${R1} → ${L1}, ${L2}, ${L4}`);
  fab.packets(
    [L1, L2, L4].map((l) => ({ from: R1, to: l, label: "reflected", progress: 0.5 })),
    `rr1.ams reflects the route to leaf1, leaf2 and leaf4 with NEXT_HOP still 10.255.1.13: a reflector changes no forwarding attributes. Traffic for 10.1.2.0/24 therefore goes from each leaf straight to leaf3 through the spines, never through rr1.ams, which is why reflectors sit beside the spines, out of the forwarding path.`,
    "reflect",
  );

  fab.state(R1, loopback(R1), "done");
  fab.table(1, {
    title: `${L1} BGP paths for 10.1.2.0/24`,
    head: ["from", "NEXT_HOP", "ORIGINATOR_ID", "CLUSTER_LIST", "best"],
    rows: [
      [R1, loopback(L3), loopback(L3), CLUSTER, "yes"],
      [R2, loopback(L3), loopback(L3), CLUSTER, "no"],
    ],
    tones: ["done", undefined],
  });
  fab.note(
    `rr2.ams reflected the same route, so leaf1.ams holds two identical copies. They tie at every step, even router ID, where a reflected route is compared by its ORIGINATOR_ID, the same in both; the last tie-breaker, the lower peer address, picks rr1's copy. Traffic is the same either way, because both name next hop 10.255.1.13, and if rr1.ams fails the other copy is already there.`,
    "two-copies",
  );

  fab.headers(upd(reflected), `${R1} → ${R2}`);
  fab.state(R2, "own cluster ID", "danger");
  fab.send(
    R1,
    R2,
    "reflected copy",
    `rr1.ams also reflects the route to rr2.ams, its non-client peer. Meridian gives both reflectors of a site one cluster ID, 10.255.1.100, so rr2.ams finds its own cluster ID in CLUSTER_LIST and discards the copy as a loop; it loses nothing, because it heard the route from leaf3.ams directly.`,
    { lost: true, progress: 0.8, tag: "loop" },
  );

  fab.state(R2, loopback(R2), "done");
  fab.headers(upd(reflected), `${R1} → ${L3}, if the implementation sends it`);
  fab.send(
    R1,
    L3,
    "own route back",
    `The rules would also send the route back to leaf3.ams, itself a client; many implementations skip that, and if it does arrive leaf3.ams ignores it because ORIGINATOR_ID is its own router ID. ORIGINATOR_ID stops a route returning to its originator; CLUSTER_LIST stops it circling between reflectors.`,
    { lost: true, progress: 0.8, tag: "loop" },
  );

  fab.headers(undefined);
  fab.down(L3, R2);
  fab.state(R2, "no 10.1.2.0/24", "compare");
  fab.table(1, {
    title: "who has 10.1.2.0/24 with leaf3–rr2 down",
    head: ["router", "copies", "from"],
    rows: [
      [R1, "1", "leaf3.ams"],
      [R2, "0", "rr1's copy discarded (shared cluster ID)"],
      ["leaf1, leaf2, leaf4", "1 each", "rr1.ams only"],
    ],
    tones: [undefined, "compare", "compare"],
  });
  fab.note(
    `The shared cluster ID has a cost: if leaf3.ams's session to rr2.ams drops, rr2.ams cannot use rr1's copy either, so every other leaf holds leaf3's routes from rr1.ams alone. Giving each reflector its own cluster ID keeps that copy at the price of more paths in memory; both designs are common.`,
    "trade-off",
  );

  fab.up(L3, R2);
  fab.linkSet(L3, R2, { dashed: true });
  fab.state(R2, loopback(R2), "done");
  fab.state(R1, "failed", "danger");
  for (const l of leaves) fab.down(l, R1);
  fab.down(R1, R2);
  fab.table(1, {
    title: "rr1.ams down",
    head: ["leaf", "overlay routes", "traffic"],
    rows: leaves.map((l) => [l, "from rr2.ams", "unchanged"]),
    tones: leaves.map(() => "done" as Tone),
  });
  fab.note(
    `With leaf3's session to rr2.ams back up, now rr1.ams fails. Every leaf already holds the same routes from rr2.ams, and because no traffic ever passed through rr1.ams, forwarding does not change at all: one reflector is a control-plane spare, not a forwarding path.`,
    "one-down",
  );

  fab.state(R2, "failed", "danger");
  for (const l of leaves) fab.down(l, R2);
  fab.tones(leaves, "danger");
  fab.table(1, {
    title: "both reflectors down",
    head: ["leaf", "overlay routes", "traffic"],
    rows: leaves.map((l) => [l, "withdrawn after hold time", "stops"]),
    tones: leaves.map(() => "danger" as Tone),
  });
  fab.set({ "fabric links": "all up", "overlay routes": "none" });
  fab.note(
    `If rr2.ams fails too, each leaf's hold timer expires within 9 s and it deletes every overlay route it learned from them, so tenant traffic between leaves stops even though every spine and fabric link is healthy. That is why reflector pairs go on different spines and power feeds, and why a tool should alarm on losing one, not just both.`,
    "both-down",
  );
  return fab.f.done();
};

// ---------- bgp-best-path ----------

interface Cand {
  id: "A" | "B" | "C";
  via: string;
  type: "eBGP" | "iBGP";
  nh: string;
  path: number[];
  lp: number;
  origin: "IGP" | "EGP" | "INCOMPLETE";
  med: number;
  igp: number;
}

const ORIGIN_RANK = { IGP: 0, EGP: 1, INCOMPLETE: 2 } as const;
const names = (cs: Cand[]): string => (cs.length < 2 ? cs.map((c) => c.id).join("") : `${cs.slice(0, -1).map((c) => c.id).join(", ")} and ${cs[cs.length - 1]!.id}`);
const minBy = (cs: Cand[], f: (c: Cand) => number): Cand[] => {
  const m = Math.min(...cs.map(f));
  return cs.filter((c) => f(c) === m);
};

/**
 * `bgp-best-path` (lesson 04-06). gw1.ams holds three paths to 192.0.2.0/24
 * (AS 64511): A from its own eBGP session to ISP1 (AS_PATH 64501 64496 64511,
 * MED 10), B over iBGP from gw2.ams (ISP2 in Amsterdam, 64502 64511, MED 0,
 * IGP cost 20), C over iBGP from gw1.sin (ISP2 in Singapore, 64502 64511, MED
 * 0, IGP cost 120 across the long-haul circuit). All LOCAL_PREF 100, ORIGIN
 * IGP. The walk: validity, weight, LOCAL_PREF, locally originated (all tie),
 * AS_PATH length (A out), ORIGIN (tie), MED (B and C both from AS 64502, so
 * compared: tie at 0), eBGP over iBGP (tie), IGP cost (C out, B wins: hot
 * potato); then the tie-breakers not reached and the installed result. This
 * is the steady state `bgp-ribs` ends in: each gateway prefers its own eBGP
 * route, gw1.ams prefers gw2.ams's.
 *
 * Inputs: `variant: "local-pref"`: Meridian's import policy gives ISP1's
 * routes LOCAL_PREF 200 (a frame shows the policy change), so A wins at step 3
 * despite its longer AS_PATH; the closing frames show gw1.ams advertising A
 * and gw2.ams and gw1.sin switching to it and withdrawing B and C. 8 frames
 * (default run 12).
 */
export const bgpBestPath: FabGen = (input) => {
  const variant = pick(input.variant, ["default", "local-pref"] as const, "default");
  const G1 = "gw1.ams";
  const G2 = "gw2.ams";
  const GS = "gw1.sin";
  const S1 = "spine1.ams";
  const SS = "spine1.sin";
  const fab = new Fab(
    [
      { id: "isp1", label: "ISP1", kind: "isp", x: 12, y: 0, state: "AS 64501" },
      { id: "isp2", label: "ISP2", kind: "isp", x: 68, y: 0, state: "AS 64502" },
      { id: G1, kind: "gw", x: 12, y: 50, state: "deciding" },
      { id: G2, kind: "gw", x: 46, y: 50, state: loopback(G2) },
      { id: GS, kind: "gw", x: 88, y: 50, state: loopback(GS) },
      { id: S1, kind: "spine", x: 29, y: 100 },
      { id: SS, kind: "spine", x: 72, y: 100 },
    ],
    [
      ["isp1", G1, { label: "A" }],
      ["isp2", G2, { label: "B" }],
      ["isp2", GS, { label: "C" }],
      [G1, S1, { label: "10" }],
      [G2, S1, { label: "10" }],
      [S1, SS, { label: "long-haul, 100" }],
      [SS, GS, { label: "10" }],
    ],
    { height: 280 },
  );
  const cands: Cand[] = [
    { id: "A", via: "ISP1, eBGP", type: "eBGP", nh: LINKS.isp1Gw1.isp, path: [64501, 64496, 64511], lp: 100, origin: "IGP", med: 10, igp: 0 },
    { id: "B", via: "gw2.ams, iBGP", type: "iBGP", nh: loopback(G2), path: [64502, 64511], lp: 100, origin: "IGP", med: 0, igp: 20 },
    { id: "C", via: "gw1.sin, iBGP", type: "iBGP", nh: loopback(GS), path: [64502, 64511], lp: 100, origin: "IGP", med: 0, igp: 120 },
  ];
  let alive = [...cands];
  let best: Cand | undefined;
  const STEPS = [
    "next hop resolvable, no AS loop",
    "highest weight (vendor, local only)",
    "highest LOCAL_PREF",
    "locally originated",
    "shortest AS_PATH",
    "lowest ORIGIN (IGP < EGP < INCOMPLETE)",
    "lowest MED (same neighbouring AS)",
    "eBGP over iBGP",
    "lowest IGP cost to next hop",
    "multipath (if enabled)",
    "oldest eBGP path",
    "lowest router ID",
    "shortest CLUSTER_LIST, lowest peer address",
  ];
  const results: string[] = STEPS.map(() => "");
  const showSteps = (current: number) =>
    fab.table(1, {
      title: "decision process",
      head: ["#", "step", "result"],
      rows: STEPS.map((s, i) => [String(i + 1), s, results[i]!]),
      tones: STEPS.map((_, i) => (i === current ? "active" : results[i] === "not reached" ? "muted" : results[i]!.includes("out") ? "compare" : results[i] ? "done" : undefined)),
    });
  const showCands = () =>
    fab.table(0, {
      title: `${G1}'s paths to ${REMOTE}`,
      head: ["", "via", "AS_PATH", "LP", "ORIGIN", "MED", "IGP cost"],
      rows: cands.map((c) => [c.id, c.via, c.path.join(" "), String(c.lp), c.origin, String(c.med), String(c.igp)]),
      tones: cands.map((c) => (best === c ? "done" : alive.includes(c) ? (alive.length < cands.length ? "active" : undefined) : "muted")),
    });
  const linkFor = (c: Cand): [string, string] => (c.id === "A" ? ["isp1", G1] : c.id === "B" ? ["isp2", G2] : ["isp2", GS]);
  const refresh = (current: number) => {
    for (const c of cands) fab.linkSet(...linkFor(c), { tone: best === c ? "path" : alive.includes(c) ? undefined : "muted" });
    fab.set({ "still in": alive.map((c) => c.id).join(", ") });
    showCands();
    showSteps(current);
  };
  /** Run one comparison: record the result, push its frame. Returns true once one path is left. */
  const run = (i: number, survivors: Cand[], note: (out: Cand[], kept: Cand[]) => string): boolean => {
    const out = alive.filter((c) => !survivors.includes(c));
    results[i] = out.length ? `${names(out)} out` : i === 0 ? "all valid" : "tie";
    alive = survivors;
    if (alive.length === 1) best = alive[0];
    refresh(i);
    if (best) fab.state(G1, `best: ${best.id}`, "done");
    fab.note(note(out, survivors), `step-${i + 1}`);
    return alive.length === 1;
  };

  refresh(-1);
  fab.unset("still in");
  fab.note(
    `gw1.ams holds three paths to 192.0.2.0/24, a content network in AS 64511: A from its own eBGP session to ISP1, B over iBGP from gw2.ams, which learned it from ISP2 in Amsterdam, and C over iBGP from gw1.sin, which learned it from ISP2 in Singapore. BGP installs exactly one, chosen by a fixed sequence of comparisons that stops at the first one that separates them (the drawing shows one spine per site).`,
    "topology",
  );

  if (variant === "local-pref") {
    cands[0]!.lp = 200;
    refresh(-1);
    fab.unset("still in");
    fab.state(G1, "new policy", "compare");
    fab.set({ "import policy, ISP1 session": "LOCAL_PREF 200" });
    fab.note(
      `Meridian changes the import policy on gw1.ams's session to ISP1, say because ISP1 is the cheaper contract: routes from ISP1 now get LOCAL_PREF 200 instead of 100. The routes themselves have not changed; gw1.ams re-applies the policy to its stored copy of what ISP1 sent, or asks ISP1 to resend it with ROUTE-REFRESH, and A's LOCAL_PREF becomes 200.`,
      "policy",
    );
    fab.state(G1, "deciding");
    fab.tone(G1, undefined);
  }

  const stepNotes: ((out: Cand[], kept: Cand[]) => string)[] = [
    (out) =>
      out.length
        ? `Step 1, validity: ${names(out)} cannot be used.`
        : `Step 1, validity: every path's next hop resolves (A's 198.51.100.2 is on a connected link, B's 10.255.1.202 and C's 10.255.2.201 are IS-IS /32s) and no AS_PATH contains 64500, so all three are candidates.`,
    () => `Step 2, weight: a vendor extension, from Cisco and copied by others such as FRR and Arista EOS, that lives only inside one router and is never sent to peers. Meridian sets none, so every path has weight 0 and all stay in.`,
    (out, kept) =>
      out.length
        ? `Step 3, LOCAL_PREF: import policy gave ISP1's routes ${kept[0]!.lp}, against ${out[0]!.lp} for ${names(out)}, so ${names(kept)} wins outright, despite an AS_PATH one AS longer. LOCAL_PREF is how an operator picks an exit on purpose, and it outranks everything below it.`
        : `Step 3, LOCAL_PREF: the AS-wide preference that import policy sets and iBGP carries to every router. All three are 100, so none is eliminated; this is the step operators use to choose an exit on purpose.`,
    () => `Step 4, locally originated: a route this router injects itself, from a static route, a connected network or an aggregate, beats one learned from a peer. All three were learned from peers, so nothing changes.`,
    (out) =>
      out.length
        ? `Step 5, shortest AS_PATH: B and C cross two ASes (64502 64511), A crosses three (64501 64496 64511), so A is out, even though it is gw1.ams's only external path. AS_PATH length counts networks, not distance or delay.`
        : `Step 5, shortest AS_PATH: the remaining paths are equally long, so this is a tie.`,
    () => `Step 6, lowest ORIGIN, where IGP beats EGP beats INCOMPLETE: the value was set by the origin AS, and B and C both say IGP, so both stay.`,
    (out) =>
      out.length
        ? `Step 7, MED: ${names(out)} had the higher MED among routes from the same neighbouring AS and is out.`
        : `Step 7, lowest MED: B and C both came from AS 64502, so their MEDs are compared, and both are 0. A's MED of 10 would not have been compared with theirs even if A had survived, because by default MED is compared only between routes from the same neighbouring AS.`,
    () => `Step 8, eBGP over iBGP: B and C were both learned over iBGP, so it is a tie. A would have won right here, had it not fallen at step 5.`,
    () => `Step 9, lowest IGP cost to the next hop: B's 10.255.1.202 is 20 away in IS-IS (two fabric links through spine1.ams), C's 10.255.2.201 is 120 (across the long-haul circuit at metric 100). C is out and B wins: leave the AS by the nearest exit, known as hot-potato routing.`,
  ];
  const survivorsAt = [
    () => alive,
    () => alive,
    () => alive.filter((c) => c.lp === Math.max(...alive.map((d) => d.lp))),
    () => alive,
    () => minBy(alive, (c) => c.path.length),
    () => minBy(alive, (c) => ORIGIN_RANK[c.origin]),
    () => {
      const lowest = new Map<number, number>();
      for (const c of alive) lowest.set(c.path[0]!, Math.min(lowest.get(c.path[0]!) ?? Infinity, c.med));
      return alive.filter((c) => c.med === lowest.get(c.path[0]!));
    },
    () => (alive.some((c) => c.type === "eBGP") ? alive.filter((c) => c.type === "eBGP") : alive),
    () => minBy(alive, (c) => c.igp),
  ];
  let decidedAt = -1;
  for (let i = 0; i < survivorsAt.length; i++) {
    if (run(i, survivorsAt[i]!(), stepNotes[i]!)) {
      decidedAt = i;
      break;
    }
  }
  const winner = best!;

  for (let i = decidedAt + 1; i < STEPS.length; i++) results[i] = "not reached";
  refresh(-1);
  fab.note(
    `${winner.id} is the best path after step ${decidedAt + 1}, so steps ${decidedAt + 2} to ${STEPS.length} are never consulted. Multipath, when enabled, installs several equally good paths for forwarding but still names one best; the final tie-breakers, oldest eBGP path, lowest router ID, shortest CLUSTER_LIST and lowest peer address, exist so that there is always exactly one best path, on every router, every time.`,
    "not-reached",
  );

  fab.clearPath();
  if (winner.id === "B") {
    fab.path([G1, S1, G2], "path");
    fab.path(["isp2", G2], "path");
    fab.table(0, { title: `${G1} FIB for ${REMOTE}`, head: ["prefix", "BGP next hop", "resolved via"], rows: [[REMOTE, loopback(G2), `${gwSpine(G1, S1).spine} (spine1.ams)`]], tones: ["done"] });
    fab.set({ "gw1.ams exit": "gw2.ams → ISP2", "gw2.ams exit": "its own ISP2 session", "gw1.sin exit": "its own ISP2 session" });
    fab.note(
      `gw1.ams installs B, so its traffic for 192.0.2.0/24 crosses the fabric to gw2.ams and leaves through ISP2, and it advertises nothing to its iBGP peers, because its best path came from one. Best is per router: gw2.ams and gw1.sin each keep their own eBGP path at step 8, so the gateways use different doors out of the same AS.`,
      "install",
    );
  } else {
    fab.path(["isp1", G1], "path");
    fab.table(0, { title: `${G1} FIB for ${REMOTE}`, head: ["prefix", "BGP next hop", "out"], rows: [[REMOTE, LINKS.isp1Gw1.isp, "port to ISP1"]], tones: ["done"] });
    fab.set({ "gw1.ams exit": "ISP1" });
    fab.note(
      `gw1.ams installs A and sends traffic for 192.0.2.0/24 straight out to ISP1. Because its best path is now one it learned over eBGP, gw1.ams advertises A to gw2.ams and gw1.sin over iBGP, carrying LOCAL_PREF 200.`,
      "install",
    );

    fab.tones([G2, GS], "compare");
    fab.linkSet("isp2", G2, { tone: "muted" });
    fab.linkSet("isp2", GS, { tone: "muted" });
    fab.table(0, {
      title: `${G1}'s paths to ${REMOTE}`,
      head: ["", "via", "AS_PATH", "LP", "ORIGIN", "MED", "IGP cost"],
      rows: [["A", "ISP1, eBGP", "64501 64496 64511", "200", "IGP", "10", "0"], ["B", "withdrawn by gw2.ams", "—", "—", "—", "—", "—"], ["C", "withdrawn by gw1.sin", "—", "—", "—", "—", "—"]],
      tones: ["done", "muted", "muted"],
    });
    fab.set({ "gw2.ams exit": "gw1.ams → ISP1", "gw1.sin exit": "gw1.ams → ISP1" });
    fab.note(
      `gw2.ams and gw1.sin each compare A (LOCAL_PREF 200) with their own ISP2 path (100), pick A at step 3 and withdraw B and C, which they may no longer advertise because their best path is now iBGP-learned. One policy change on one router moved the whole AS's exit, and gw1.ams now holds a single path: if ISP1 fails, the others must re-advertise theirs first.`,
      "ripple",
    );
  }
  return fab.f.done();
};

export const scenarios: Record<string, FabGen> = {
  "bgp-update-propagation": bgpUpdatePropagation,
  "bgp-fsm": bgpFsm,
  "bgp-ribs": bgpRibs,
  "bgp-next-hop-resolution": bgpNextHopResolution,
  "route-reflector": routeReflector,
  "bgp-best-path": bgpBestPath,
};

export const labels: Record<string, string> = {
  "bgp-update-propagation": "BGP UPDATE across four ASes: AS_PATH and loop check",
  "bgp-fsm": "BGP session FSM: TCP 179 to Established, hold-timer expiry",
  "bgp-ribs": "Adj-RIB-In, policy, Loc-RIB, FIB, Adj-RIB-Out",
  "bgp-next-hop-resolution": "iBGP next hops: recursive resolution and next-hop-self",
  "route-reflector": "Route reflectors: ORIGINATOR_ID and CLUSTER_LIST",
  "bgp-best-path": "BGP best-path selection, step by step",
};
