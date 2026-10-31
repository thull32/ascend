// Scenario pack for the `fabric` family: fabric architecture and the underlay (modules 02 and 03).
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
//   | `ecmp-hash` | computing a 5-tuple hash and the modulo that picks the
//     uplink, for several flows; a VXLAN flow's outer source port carrying
//     entropy | 02-02 |
//   | `elephant-collision` | two elephant flows hashed onto the same uplink
//     while another sits idle; polarisation across tiers | 02-02 |
//   | `gray-failure` | an optic's receive power drifting, CRC errors rising,
//     the link still "up", ECMP still sending its share into it | 02-03 |
//   | `site-square` | two sites joined by a square of two circuits; one circuit
//     fails; the detour through the sister spine at half capacity | 02-04 |
//   | `isis-flooding` | an LSP flooded with sequence numbers, CSNP/PSNP, every
//     router's database converging, SPF producing next hops | 03-02 |
//   | `ebgp-clos-underlay` | AS per leaf, spines sharing an AS, a loopback's
//     route propagating with its AS path, a spine rejecting a looped path | 03-03
//     |
//   | `bfd-convergence` | a timeline from fibre cut to recovered traffic:
//     detection (with and without BFD), flooding, SPF, FIB update | 03-04 |
//   | `isis-purge-storm` | a device boots with a wrong clock, NTP steps it
//     forward, it ages out every LSP, purges flood, the topology vanishes, then
//     re-floods | 03-05 |

import { DISTANCE_KM, Fab, fibreMs, fnv32, int, loopback, p2p, pick, type FabGen, type HeaderSpec, type LinkSpec, type NodeSpec } from "./fabric-core";

// ---------- shared helpers ----------

const short = (id: string): string => id.split(".")[0]!;
const num = (n: number): string => n.toLocaleString("en-US");
const hex8 = (n: number): string => `0x${(n >>> 0).toString(16).padStart(8, "0")}`;
/** "A", "A and B", "A, B and C". */
const list = (xs: string[]): string => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const ipToInt = (ip: string): number => ip.split(".").reduce((a, o) => ((a << 8) | Number(o)) >>> 0, 0);

/** MurmurHash3's 32-bit finaliser: spreads every input bit over every output bit. */
const fmix32 = (x: number): number => {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
};

/**
 * The flow hash this pack uses as a stand-in for a switch ASIC's (vendor
 * specific, CRC-style, seeded) ECMP hash: FNV-1a over the 5-tuple, XORed with
 * the device's hash seed, then MurmurHash3's finaliser so the low bits that
 * `mod n` reads are well mixed. Exported for fabric-arch.test.ts.
 */
export const flowHash = (tuple: string, seed = 0): number => fmix32((fnv32(tuple) ^ seed) >>> 0);
/** The 5-tuple as the hash reads it: "src|dst|proto|sport|dport". */
const tupleKey = (src: string, dst: string, proto: number, sport: number, dport: number): string => `${src}|${dst}|${proto}|${sport}|${dport}`;
/** Set a node's readout and reset its tone (Fab.state leaves the tone alone when given undefined). */
const clearNode = (fab: Fab, id: string, state?: string): void => {
  fab.state(id, state);
  fab.tone(id, undefined);
};
const protoName = (p: number): string => (p === 6 ? "6 (TCP)" : p === 17 ? "17 (UDP)" : String(p));

/**
 * IS-IS system ID derived from the loopback, as Meridian does it: each octet
 * padded to three digits, regrouped in fours (10.255.1.13 → 0102.5500.1013).
 */
export const systemId = (device: string): string => {
  const d = loopback(device)
    .split(".")
    .map((o) => o.padStart(3, "0"))
    .join("");
  return `${d.slice(0, 4)}.${d.slice(4, 8)}.${d.slice(8, 12)}`;
};
const lspId = (device: string): string => `${systemId(device)}.00-00`;
const seqHex = (n: number): string => `0x${n.toString(16).padStart(8, "0")}`;
const seqShort = (n: number): string => `0x${n.toString(16)}`;

// ---------- ecmp-hash ----------

interface Flow5 {
  name: string;
  src: string;
  dst: string;
  proto: 6 | 17;
  sport: number;
  dport: number;
}
const flowKey = (f: Flow5): string => tupleKey(f.src, f.dst, f.proto, f.sport, f.dport);
const flowText = (f: Flow5): string => `${f.src}:${f.sport} → ${f.dst}:${f.dport} ${f.proto === 6 ? "TCP" : "UDP"}`;

/** Flows from Acme servers behind leaf1.ams (10.1.1.0/24) to 10.1.2.0/24 behind leaf3.ams. */
export const ECMP_FLOWS: Flow5[] = [
  { name: "A", src: "10.1.1.10", dst: "10.1.2.20", proto: 6, sport: 51517, dport: 5432 },
  { name: "B", src: "10.1.1.10", dst: "10.1.2.20", proto: 6, sport: 51518, dport: 5432 },
  { name: "C", src: "10.1.1.12", dst: "10.1.2.21", proto: 6, sport: 43005, dport: 443 },
  { name: "D", src: "10.1.1.13", dst: "10.1.2.20", proto: 6, sport: 38203, dport: 5432 },
  { name: "E", src: "10.1.1.10", dst: "10.1.2.22", proto: 17, sport: 55000, dport: 53 },
];
/** RFC 7348: the outer UDP source port is a hash of the inner headers, in the dynamic range 49152-65535. */
export const vxlanSourcePort = (f: Flow5): number => 49152 + (flowHash(flowKey(f)) % 16384);

/**
 * `ecmp-hash` (lesson 02-02). leaf1.ams in Meridian's Amsterdam fabric has one
 * uplink per spine, all equal cost towards leaf3.ams. For five flows the ASIC
 * hashes the 5-tuple (source and destination IP, protocol, source and
 * destination port) to a 32-bit number and takes it modulo the number of ECMP
 * members to pick the uplink; flows A and B differ only in their source port
 * and land on different spines. Then the same two connections run through
 * VXLAN (leaf1's VTEP 10.255.1.11 to leaf3's 10.255.1.13, Acme's routed VNI
 * 50001): with one fixed outer source port every tunnelled flow would share
 * one outer 5-tuple and one uplink; with the source port set from a hash of
 * the inner headers (RFC 7348) they spread again. The hash is `flowHash`
 * (FNV-1a plus a finaliser), a stand-in for the ASIC's own.
 *
 * The first half routes the Acme flows as plain IP to show the hash on its
 * own (the first note says Meridian really tunnels them).
 *
 * Inputs: `spines` 2-4 (default 4, Amsterdam's full spine count). 12 frames.
 */
export const ecmpHash: FabGen = (input) => {
  const N = int(input.spines, 2, 4, 4);
  const spines = Array.from({ length: N }, (_, i) => `spine${i + 1}.ams`);
  const L1 = "leaf1.ams";
  const L3 = "leaf3.ams";
  const nodes: NodeSpec[] = [
    ...spines.map((id, i) => ({ id, kind: "spine" as const, x: ((i + 0.5) * 100) / N, y: 0 })),
    { id: L1, kind: "leaf", x: 25, y: 55, state: loopback(L1) },
    { id: L3, kind: "leaf", x: 75, y: 55, state: loopback(L3) },
    { id: "acme-l1", label: "Acme servers", kind: "server", x: 25, y: 100, state: "10.1.1.0/24" },
    { id: "acme-l3", label: "Acme servers", kind: "server", x: 75, y: 100, state: "10.1.2.0/24" },
  ];
  const links: LinkSpec[] = [...spines.flatMap((s): LinkSpec[] => [[L1, s], [L3, s]]), ["acme-l1", L1], ["acme-l3", L3]];
  const fab = new Fab(nodes, links);
  const member = (h: number) => h % N;
  const spineOf = (h: number) => spines[member(h)]!;
  const lowBits = N === 2 ? " (with 2 members that is simply the hash's lowest bit)" : N === 4 ? " (with 4 members that is simply the hash's lowest two bits)" : "";
  const [A, B, C, D, E] = ECMP_FLOWS as [Flow5, Flow5, Flow5, Flow5, Flow5];
  const h = (f: Flow5) => flowHash(flowKey(f));
  const flowRow = (f: Flow5) => [f.name, flowText(f), hex8(h(f)), String(member(h(f))), short(spineOf(h(f)))];
  const flowHead = ["flow", "5-tuple", "hash", `mod ${N}`, "uplink"];

  fab.set({ spines: N, "ECMP members": N });
  fab.note(
    `Meridian's Amsterdam fabric with ${N} spines; leaf1.ams and leaf3.ams are two of its 16 leaves, the others left out. Meridian actually carries Acme's traffic inside VXLAN tunnels, which this walkthrough reaches later; to see the hash on its own, first picture leaf1.ams routing it as plain IP, so every packet to 10.1.2.0/24 behind leaf3.ams has ${N} equal-cost uplinks to choose from, one per spine.`,
    "topology",
  );

  fab.table(0, { title: `${L1} FIB: 10.1.2.0/24 → ECMP group`, head: ["member", "next hop", "uplink"], rows: spines.map((s, i) => [String(i), p2p(L1, s).spine, `to ${short(s)}`]) });
  spines.forEach((s, i) => fab.linkSet(L1, s, { label: `member ${i}`, labelAt: 0.7 }));
  fab.note(
    `The FIB entry for 10.1.2.0/24 points to an ECMP group whose ${N} members are numbered ${N === 2 ? "0 and 1" : `0 to ${N - 1}`}, one per uplink. For every packet the forwarding chip (the ASIC) must pick a member, and it must pick the same one for every packet of a flow so that TCP never sees its segments overtake each other on different paths.`,
    "ecmp",
  );

  const ipv4 = (f: Flow5, name = "IPv4"): HeaderSpec => ({ name, size: 20, reader: "every router (hash input: src, dst, protocol)", fields: { src: f.src, dst: f.dst, protocol: protoName(f.proto), TTL: 64 }, highlight: name === "IPv4" ? ["src", "dst", "protocol"] : undefined });
  const l4 = (f: Flow5, name = f.proto === 6 ? "TCP" : "UDP"): HeaderSpec => ({ name, size: f.proto === 6 ? 20 : 8, reader: "destination host (hash input: ports)", fields: { "src port": f.sport, "dst port": f.dport }, highlight: name === "TCP" || name === "UDP" ? ["src port", "dst port"] : undefined });
  fab.headers([ipv4(A), l4(A)], `flow A arriving at ${L1} (Ethernet header not shown)`);
  fab.state(L1, "hashing", "active");
  fab.path(["acme-l1", L1]);
  fab.note(
    `Flow A, a PostgreSQL connection from acme-web1 (10.1.1.10, source port 51517) to acme-db1 (10.1.2.20, port 5432), arrives at leaf1.ams. The five highlighted fields, the 5-tuple, identify the flow: every packet of this connection carries exactly the same five values.`,
    "tuple",
  );

  fab.set({ "hash input": flowKey(A), hash: hex8(h(A)) });
  fab.note(
    `The ASIC feeds those five fields through a hash function and gets a 32-bit number, ${hex8(h(A))}. Real switch chips use vendor-specific hashes, often CRC-based, with a configurable seed; this one (FNV-1a plus a finishing mix) stands in for them, and what matters is shared: the same five values always give the same number, and changing any of them gives a different one.`,
    "hash",
  );

  fab.table(1, { title: `flows hashed by ${L1}`, head: flowHead, rows: [flowRow(A)], tones: ["active"] });
  fab.rowTone(0, member(h(A)), "active");
  fab.clearPath();
  fab.path(["acme-l1", L1, spineOf(h(A)), L3, "acme-l3"]);
  fab.set({ [`${hex8(h(A))} mod ${N}`]: member(h(A)) });
  fab.send(
    L1,
    spineOf(h(A)),
    `flow A → member ${member(h(A))}`,
    `${hex8(h(A))} modulo ${N} is ${member(h(A))}${lowBits}, so flow A goes up member ${member(h(A))}, the uplink to ${spineOf(h(A))}. Every later packet of flow A produces the same hash and follows it, and the spine has a single route down to leaf3.ams; real ASICs map the hash onto a table of buckets rather than taking a bare modulo, but the effect is the same.`,
    { tag: "pick" },
  );

  fab.headers([ipv4(B), l4(B)], `flow B arriving at ${L1}`);
  fab.unset("hash input", "hash", `${hex8(h(A))} mod ${N}`);
  fab.set({ "hash input": flowKey(B), hash: hex8(h(B)) });
  fab.table(1, { title: `flows hashed by ${L1}`, head: flowHead, rows: [flowRow(A), flowRow(B)], tones: [undefined, "active"] });
  fab.clearRowTones(0);
  fab.rowTone(0, member(h(B)), "active");
  fab.clearPath();
  fab.path(["acme-l1", L1, spineOf(h(B)), L3, "acme-l3"]);
  fab.send(
    L1,
    spineOf(h(B)),
    `flow B → member ${member(h(B))}`,
    `Flow B is a second connection between the same two servers, and only its source port differs: 51518 instead of 51517. Its hash ${hex8(h(B))} bears no resemblance to A's, ${hex8(h(B))} mod ${N} = ${member(h(B))}, and it takes ${spineOf(h(B))}: changing one field sends a flow to an effectively random uplink.`,
    { tag: "pick" },
  );

  const all = [A, B, C, D, E];
  const counts = spines.map((s) => all.filter((f) => spineOf(h(f)) === s).length);
  fab.headers(undefined);
  fab.unset("hash input", "hash");
  fab.table(1, { title: `flows hashed by ${L1}`, head: flowHead, rows: all.map(flowRow), tones: [undefined, undefined, "active", "active", "active"] });
  fab.clearRowTones(0);
  fab.clearPath();
  clearNode(fab, L1, loopback(L1));
  spines.forEach((s, i) => {
    const n = counts[i]!;
    fab.linkSet(L1, s, { label: `${n} flow${n === 1 ? "" : "s"}`, width: n / 5, labelAt: 0.7 });
  });
  fab.set({ "flows per uplink": spines.map((s, i) => `${short(s)} ${counts[i]}`).join(" · ") });
  fab.packets(
    [C, D, E].map((f, i) => ({ from: L1, to: spineOf(h(f)), label: f.name, progress: 0.35 + 0.15 * i })),
    `Flows C, D and E (a TLS connection, another database client, and a DNS query over UDP, protocol 17) hash to members ${member(h(C))}, ${member(h(D))} and ${member(h(E))}. Five flows now sit on ${N} uplinks as ${counts.join(" / ")} (spine1 to spine${N}): the hash spreads flows evenly only on average, and it never looks at how many bytes a flow carries or how busy an uplink already is.`,
    "spread",
  );

  // ----- VXLAN: entropy in the outer source port -----
  const vtepA = loopback(L1);
  const vtepB = loopback(L3);
  const FIXED = 4789;
  const outerKey = (sport: number) => tupleKey(vtepA, vtepB, 17, sport, 4789);
  const oh = (sport: number) => flowHash(outerKey(sport));
  const tunnelled = (f: Flow5, sport: number): HeaderSpec[] => [
    { name: "Outer IPv4", size: 20, tone: "path", reader: "every underlay router (hash input)", fields: { src: vtepA, dst: vtepB, protocol: "17 (UDP)" }, highlight: ["src", "dst", "protocol"] },
    { name: "Outer UDP", size: 8, tone: "path", reader: "egress VTEP; ECMP hash input", fields: { "src port": sport, "dst port": 4789 }, highlight: ["src port", "dst port"] },
    { name: "VXLAN", size: 8, tone: "path", reader: "only the egress VTEP", fields: { VNI: 50001 } },
    { name: "Inner IPv4", size: 20, reader: "the VTEPs and the host; payload to the spines", fields: { src: f.src, dst: f.dst, protocol: protoName(f.proto), TTL: 63 } },
    { name: "Inner TCP", size: 20, reader: "the destination host; payload to the spines", fields: { "src port": f.sport, "dst port": f.dport } },
  ];
  const outerRow = (f: Flow5, sport: number) => [f.name, `${vtepA}:${sport} → ${vtepB}:4789 UDP`, hex8(oh(sport)), String(member(oh(sport))), short(spineOf(oh(sport)))];
  for (const s of spines) fab.linkSet(L1, s, { label: undefined, width: undefined });
  fab.unset("flows per uplink");
  fab.state(L1, `VTEP ${vtepA}`, "active");
  fab.state(L3, `VTEP ${vtepB}`);
  fab.headers(tunnelled(A, FIXED), `flow A inside a VXLAN tunnel (Ethernet headers not shown)`);
  fab.table(0, { title: `${L1} FIB: ${vtepB}/32 (leaf3's VTEP) → ECMP group`, head: ["member", "next hop", "uplink"], rows: spines.map((s, i) => [String(i), p2p(L1, s).spine, `to ${short(s)}`]) });
  fab.table(1, undefined);
  fab.note(
    `Now the same connections A and B cross Meridian's VXLAN overlay as they really do (module 06): leaf1.ams, VTEP ${vtepA}, routes each packet into Acme's VNI 50001 (decrementing the inner TTL to 63) and wraps it in outer headers addressed to leaf3.ams's VTEP ${vtepB}. The uplink is now chosen by the underlay route to ${vtepB}/32, and the hash reads only the outer headers: the inner 5-tuple is just payload to it.`,
    "tunnel",
  );

  const fixedSpine = spineOf(oh(FIXED));
  fab.table(1, { title: `tunnelled flows hashed by ${L1}: one fixed source port`, head: ["flow", "outer 5-tuple", "hash", `mod ${N}`, "uplink"], rows: [outerRow(A, FIXED), outerRow(B, FIXED)], tones: ["danger", "danger"] });
  fab.clearRowTones(0);
  fab.rowTone(0, member(oh(FIXED)), "danger");
  fab.linkSet(L1, fixedSpine, { tone: "danger", width: 1, label: "every tunnelled flow", labelAt: 0.7 });
  fab.set({ "outer src port": `${FIXED} for every flow` });
  fab.packets(
    [
      { from: L1, to: fixedSpine, label: "A", progress: 0.4, tone: "danger" },
      { from: L1, to: fixedSpine, label: "B", progress: 0.7, tone: "danger" },
    ],
    `If leaf1.ams used one fixed outer source port, every tunnelled flow to leaf3.ams would have the same outer 5-tuple (${vtepA} → ${vtepB}, UDP, ${FIXED} → 4789), the same hash ${hex8(oh(FIXED))} and the same uplink, ${fixedSpine}: all of it on one of ${N} links. Tunnels with no ports at all, such as plain GRE, have exactly this problem unless the ASIC can hash on the inner headers.`,
    "no-entropy",
  );

  const spA = vxlanSourcePort(A);
  const spB = vxlanSourcePort(B);
  fab.linkSet(L1, fixedSpine, { tone: undefined, width: undefined, label: undefined });
  fab.clearRowTones(0);
  fab.patchHeader("Outer UDP", { "src port": spA });
  fab.table(1, { title: `tunnelled flows hashed by ${L1}: source port from the inner hash`, head: ["flow", "inner hash", "outer src port"], rows: [[A.name, hex8(h(A)), `49152 + (hash mod 16384) = ${spA}`], [B.name, hex8(h(B)), `49152 + (hash mod 16384) = ${spB}`]], tones: ["active", "active"] });
  fab.set({ "outer src port": `${spA} (flow A), ${spB} (flow B)` });
  fab.note(
    `What VTEPs actually do, as RFC 7348 recommends: leaf1.ams hashes the inner headers and writes the result into the outer UDP source port, kept within the dynamic range 49152 to 65535, so flow A gets ${spA} and flow B gets ${spB}. The destination port stays 4789, which is how leaf3.ams still recognises the packet as VXLAN.`,
    "entropy",
  );

  fab.table(1, { title: `tunnelled flows hashed by ${L1}: with entropy`, head: ["flow", "outer 5-tuple", "hash", `mod ${N}`, "uplink"], rows: [outerRow(A, spA), outerRow(B, spB)] });
  fab.rowTone(0, member(oh(spA)), "active");
  fab.rowTone(0, member(oh(spB)), "active");
  fab.path([L1, spineOf(oh(spA))]);
  fab.path([L1, spineOf(oh(spB))]);
  fab.packets(
    [
      { from: L1, to: spineOf(oh(spA)), label: "A", progress: 0.5 },
      { from: L1, to: spineOf(oh(spB)), label: "B", progress: 0.5 },
    ],
    `The outer 5-tuples now differ in one field, so the hashes ${hex8(oh(spA))} and ${hex8(oh(spB))} differ, and the two connections take ${spineOf(oh(spA))} and ${spineOf(oh(spB))}. Each packet of flow A still gets source port ${spA}, so the tunnel keeps every flow on one path and in order.`,
    "spread-outer",
  );

  fab.headers(undefined);
  fab.clearPath();
  clearNode(fab, L1, loopback(L1));
  fab.state(L3, loopback(L3));
  fab.set({ "hash is": "per flow, stateless, blind to load" });
  fab.note(
    `ECMP hashing needs no coordination and keeps every flow in order, but it spreads flows rather than bytes, and a tunnel must copy the inner flow's entropy into its outer headers or all its traffic collapses onto one path. RoCEv2 (UDP port 4791) uses its source port the same way, which is why AI fabrics care how NICs choose it (module 07).`,
    "done",
  );
  return fab.f.done();
};

// ---------- elephant-collision ----------

/**
 * Two backup servers writing large datasets to NFS storage servers (TCP 2049),
 * one connection each: the elephants. Linux NFS clients bind a privileged
 * source port (below 1024) by default.
 */
export const ELEPHANTS: Flow5[] = [
  { name: "E1", src: "10.1.1.21", dst: "10.1.2.31", proto: 6, sport: 875, dport: 2049 },
  { name: "E2", src: "10.1.1.22", dst: "10.1.2.32", proto: 6, sport: 878, dport: 2049 },
];
/** Responses from Meridian's web servers (203.0.113.0/24) to clients on the internet. */
export const INTERNET_FLOWS: Flow5[] = [
  ["198.51.100.7", 56870],
  ["198.51.100.23", 55911],
  ["192.0.2.44", 53268],
  ["192.0.2.81", 57533],
  ["198.51.100.150", 63154],
  ["192.0.2.9", 62979],
  ["198.51.100.66", 55680],
  ["192.0.2.200", 52153],
].map(([dst, dport], i) => ({ name: `P${i + 1}`, src: i % 2 === 0 ? "203.0.113.10" : "203.0.113.11", dst: dst as string, proto: 6 as const, sport: 443, dport: dport as number }));

/**
 * `elephant-collision` (lesson 02-02). Small example: Meridian's Amsterdam
 * fabric with two spines, leaf1.ams and leaf3.ams, and the border gateways
 * gw1.ams and gw2.ams above the spines, with 100G uplinks in this small
 * example. Part 1: about 20 Gb/s of mice (many short flows) spread evenly over
 * leaf1's two uplinks; then two NFS backup elephants of about 60 Gb/s each
 * (one TCP connection each, what a tuned 100G host can push) both hash onto
 * the uplink to spine1.ams: 130 Gb/s offered to a 100 Gb/s link while the
 * other uplink runs at 10%, and TCP backs both elephants off to about 45 Gb/s
 * (chart). Part 2, polarisation:
 * eight flows from Meridian's web servers to the internet pass two ECMP
 * decisions in a row (leaf1 picks a spine, the spine picks a gateway); with the
 * same hash function and seed everywhere, every flow on spine1 goes to gw1 and
 * every flow on spine2 to gw2, leaving two of the four spine-gateway links
 * idle; per-device seeds (from each loopback) fix it.
 *
 * Inputs: none. 11 frames.
 */
export const elephantCollision: FabGen = () => {
  const L1 = "leaf1.ams";
  const L3 = "leaf3.ams";
  const S = ["spine1.ams", "spine2.ams"] as const;
  const G = ["gw1.ams", "gw2.ams"] as const;
  const CAP = 100;
  const EL = 60;
  const fab = new Fab(
    [
      { id: G[0], kind: "gw", x: 25, y: 0, tone: "muted" },
      { id: G[1], kind: "gw", x: 75, y: 0, tone: "muted" },
      { id: S[0], kind: "spine", x: 25, y: 36 },
      { id: S[1], kind: "spine", x: 75, y: 36 },
      { id: L1, kind: "leaf", x: 25, y: 70 },
      { id: L3, kind: "leaf", x: 75, y: 70 },
      { id: "srv1", label: "servers", kind: "server", x: 25, y: 100, state: "10.1.1.0/24" },
      { id: "srv3", label: "servers", kind: "server", x: 75, y: 100, state: "10.1.2.0/24" },
    ],
    [
      [L1, S[0], { label: `${CAP}G` }],
      [L1, S[1], { label: `${CAP}G` }],
      [L3, S[0]],
      [L3, S[1]],
      [S[0], G[0], { tone: "muted" }],
      [S[0], G[1], { tone: "muted" }],
      [S[1], G[0], { tone: "muted" }],
      [S[1], G[1], { tone: "muted" }],
      ["srv1", L1],
      ["srv3", L3],
    ],
    { height: 330 },
  );
  const h = (f: Flow5, seed = 0) => flowHash(flowKey(f), seed);
  const load = { s1: 10, s2: 10 };
  const drawUplinks = () => {
    fab.linkSet(L1, S[0], { width: Math.min(1, load.s1 / CAP), label: `${load.s1} Gb/s`, tone: load.s1 > CAP ? "danger" : undefined });
    fab.linkSet(L1, S[1], { width: Math.min(1, load.s2 / CAP), label: `${load.s2} Gb/s`, tone: load.s2 > CAP ? "danger" : undefined });
  };
  fab.set({ "leaf1 uplinks": `2 × ${CAP}G = ${2 * CAP} Gb/s` });
  fab.note(
    `A small example of Meridian's Amsterdam fabric: two spines, leaf1.ams and leaf3.ams, and the border gateways gw1.ams and gw2.ams above the spines. Here leaf1.ams has two 100 Gb/s uplinks, 200 Gb/s in all, and hashes every flow towards leaf3.ams onto one of them.`,
    "topology",
  );

  fab.chart({ title: `${L1} uplink load (offered)`, unit: "Gb/s", yMax: 150, xLabel: "time", series: [{ name: "to spine1", tone: "compare" }, { name: "to spine2", tone: "done" }], marks: [{ y: CAP, label: "100G capacity", tone: "danger" }] });
  fab.point({ "to spine1": load.s1, "to spine2": load.s2 });
  drawUplinks();
  fab.set({ "mice": "≈ 20 Gb/s, thousands of short flows" });
  fab.packets(
    [
      { from: L1, to: S[0], label: "mice", progress: 0.4 },
      { from: L1, to: S[1], label: "mice", progress: 0.4 },
    ],
    `Most flows are mice: thousands of short RPCs and web requests of a few kilobytes each, about 20 Gb/s in total. With that many small flows the hash's randomness averages out and each uplink carries about 10 Gb/s, 10% of its capacity.`,
    "mice",
  );

  const [E1, E2] = ELEPHANTS as [Flow5, Flow5];
  const elRow = (f: Flow5) => [f.name, flowText(f), hex8(h(f)), String(h(f) % 2), short(S[h(f) % 2]!)];
  const elHead = ["flow", "5-tuple", "hash", "mod 2", "uplink"];
  fab.table(0, { title: `elephants hashed by ${L1}`, head: elHead, rows: [elRow(E1)], tones: ["active"] });
  load.s1 += EL;
  fab.point({ "to spine1": load.s1, "to spine2": load.s2 });
  drawUplinks();
  fab.path(["srv1", L1, S[h(E1) % 2]!, L3, "srv3"]);
  fab.send(
    L1,
    S[h(E1) % 2]!,
    `E1 ${EL} Gb/s`,
    `A backup server starts writing a large dataset to an NFS storage server: flow E1, ${flowText(E1)}, a single TCP connection that a tuned 100G host can drive at about ${EL} Gb/s. Its hash ${hex8(h(E1))} mod 2 is ${h(E1) % 2}, so the whole elephant rides the uplink to spine1.ams, which now carries ${load.s1} Gb/s.`,
    { tag: "elephant" },
  );

  fab.table(0, { title: `elephants hashed by ${L1}`, head: elHead, rows: [elRow(E1), elRow(E2)], tones: ["danger", "danger"] });
  load.s1 += EL;
  fab.point({ "to spine1": load.s1, "to spine2": load.s2 });
  drawUplinks();
  fab.state(L1, "queue full", "danger");
  fab.set({ "offered to spine1 uplink": `${load.s1} Gb/s (${Math.round((load.s1 / CAP) * 100)}%)`, "offered to spine2 uplink": `${load.s2} Gb/s (${Math.round((load.s2 / CAP) * 100)}%)` });
  fab.send(
    L1,
    S[h(E2) % 2]!,
    `E2 ${EL} Gb/s`,
    `A second backup, E2 (${flowText(E2)}), hashes to ${hex8(h(E2))}, which mod 2 is also ${h(E2) % 2}, so it joins E1 on the same uplink: ${load.s1} Gb/s offered to a 100 Gb/s link while the uplink to spine2.ams carries ${load.s2} Gb/s. Overall leaf1.ams needs only ${load.s1 + load.s2} of its 200 Gb/s, but the hash never looks at load, so the spare capacity on the other uplink cannot be used.`,
    { tag: "collision" },
  );

  load.s1 = CAP;
  fab.point({ "to spine1": load.s1, "to spine2": load.s2 });
  drawUplinks();
  fab.linkSet(L1, S[0], { tone: "danger", label: `${CAP} Gb/s, drops` });
  fab.set({ "offered to spine1 uplink": `${CAP} Gb/s (100%, queue full)`, "each elephant": `≈ 45 Gb/s of the ${EL} it could send` });
  fab.note(
    `leaf1.ams's egress queue towards spine1.ams fills and drops packets, and TCP congestion control backs both elephants off until they share what the mice leave: about 45 Gb/s each instead of ${EL}. The mice that hashed onto this uplink now wait behind full queues and lose packets too, while the link to spine2.ams sits at 10%.`,
    "congestion",
  );

  clearNode(fab, L1);
  fab.set({ "chance two elephants collide": "1/2 with 2 uplinks, 1/4 with 4" });
  fab.note(
    `With two uplinks, two elephants share one with probability 1/2, and with four spines 1/4; with many elephants on few links, collisions are close to certain. The fixes are to split a transfer into several parallel flows, to let a flow change uplink only at an idle gap between its bursts (flowlet switching), or to route on measured load (adaptive routing, lesson 07-09).`,
    "odds",
  );

  // ----- polarisation -----
  fab.chart(undefined);
  fab.unset("leaf1 uplinks", "mice", "offered to spine1 uplink", "offered to spine2 uplink", "each elephant", "chance two elephants collide");
  fab.clearPath();
  for (const s of S) fab.linkSet(L1, s, { width: undefined, label: undefined, tone: undefined });
  fab.linkSet(L3, S[0], { tone: "muted" });
  fab.linkSet(L3, S[1], { tone: "muted" });
  fab.tones([L3, "srv3"], "muted");
  fab.tones([G[0], G[1]], undefined);
  for (const s of S) for (const g of G) fab.linkSet(s, g, { tone: undefined });
  fab.state("srv1", "203.0.113.0/24");
  fab.table(0, { title: "ECMP groups (two decisions in a row)", head: ["device", "prefix", "member 0", "member 1"], rows: [[L1, "0.0.0.0/0", "spine1", "spine2"], [S[0], "0.0.0.0/0", "gw1", "gw2"], [S[1], "0.0.0.0/0", "gw1", "gw2"]] });
  fab.table(1, undefined);
  fab.note(
    `Now polarisation. Meridian's web servers behind leaf1.ams (203.0.113.10 and .11) answer clients on the internet with plain routed IP: leaf1.ams has a default route over both spines, and each spine has a default route over both gateways, so every packet passes two ECMP decisions in a row.`,
    "polarisation",
  );

  const P = INTERNET_FLOWS;
  const leafPick = (f: Flow5, seed = 0) => h(f, seed) % 2;
  const polRow = (f: Flow5, leafSeed: number, spineSeed: (s: number) => number) => {
    const s = leafPick(f, leafSeed);
    const g = h(f, spineSeed(s)) % 2;
    return [f.name, `${f.src}:443 → ${f.dst}:${f.dport}`, hex8(h(f, leafSeed)), short(S[s]!), hex8(h(f, spineSeed(s))), short(G[g]!)];
  };
  const polHead = ["flow", "5-tuple", "leaf1 hash", "spine", "spine hash", "gateway"];
  const drawGw = (leafSeed: number, spineSeed: (s: number) => number) => {
    const c: Record<string, number> = {};
    for (const f of P) {
      const s = leafPick(f, leafSeed);
      const g = h(f, spineSeed(s)) % 2;
      c[`${s}${g}`] = (c[`${s}${g}`] ?? 0) + 1;
    }
    for (const [si, s] of S.entries())
      for (const [gi, g] of G.entries()) {
        const n = c[`${si}${gi}`] ?? 0;
        fab.linkSet(s, g, { width: n / 4, label: `${n} flow${n === 1 ? "" : "s"}`, labelAt: 0.35, tone: n === 0 ? "danger" : undefined });
      }
    return c;
  };
  const toS1 = P.filter((f) => leafPick(f) === 0).length;
  fab.table(1, { title: `${L1} hashes eight flows (factory-default seed)`, head: ["flow", "5-tuple", "leaf1 hash", "spine"], rows: P.map((f) => [f.name, `${f.src}:443 → ${f.dst}:${f.dport}`, hex8(h(f)), short(S[leafPick(f)]!)]) });
  for (const [si, s] of S.entries()) {
    const n = P.filter((f) => leafPick(f) === si).length;
    fab.linkSet(L1, s, { width: n / 8, label: `${n} flows` });
  }
  fab.packets(
    P.map((f, i) => ({ from: L1, to: S[leafPick(f)]!, label: f.name, progress: 0.3 + 0.1 * (i % 4) })),
    `leaf1.ams hashes eight such flows and splits them ${toS1} and ${P.length - toS1} across the spines, a fair split. Every Meridian switch here runs the same ASIC hash with the same factory-default seed, 0.`,
    "leaf",
  );

  const same = drawGw(0, () => 0);
  fab.table(1, { title: "the second decision, same hash and seed everywhere", head: polHead, rows: P.map((f) => polRow(f, 0, () => 0)) });
  fab.rowTone(1, () => true, "danger");
  fab.set({ "idle spine–gateway links": `${[0, 1].flatMap((s) => [0, 1].filter((g) => !same[`${s}${g}`]).map((g) => `${short(S[s]!)}–${short(G[g]!)}`)).join(", ")}` });
  fab.packets(
    P.map((f, i) => ({ from: S[leafPick(f)]!, to: G[leafPick(f)]!, label: f.name, progress: 0.3 + 0.1 * (i % 4), tone: "danger" })),
    `Each spine hashes the same five fields with the same function and seed, so it computes exactly the hash leaf1.ams computed, and mod 2 gives the same answer: every flow on spine1 goes to gw1 and every flow on spine2 to gw2. The links spine1–gw2 and spine2–gw1 carry nothing, half the spine-to-gateway capacity sits idle, and per-link utilisation shows it as two links at zero.`,
    "polarised",
  );

  const leafSeed = ipToInt(loopback(L1));
  const spineSeed = (s: number) => ipToInt(loopback(S[s]!));
  const fixed = drawGw(leafSeed, spineSeed);
  const perLink = Object.values(fixed);
  fab.table(0, { title: "hash seeds, one per device (from its loopback)", head: ["device", "loopback", "seed"], rows: [[L1, loopback(L1), hex8(leafSeed)], [S[0], loopback(S[0]), hex8(spineSeed(0))], [S[1], loopback(S[1]), hex8(spineSeed(1))]] });
  fab.table(1, { title: "both decisions with per-device seeds", head: polHead, rows: P.map((f) => polRow(f, leafSeed, spineSeed)) });
  for (const [si, s] of S.entries()) {
    const n = P.filter((f) => leafPick(f, leafSeed) === si).length;
    fab.linkSet(L1, s, { width: n / 8, label: `${n} flows` });
  }
  fab.set({ "idle spine–gateway links": perLink.length === 4 && perLink.every((n) => n > 0) ? "none" : "some" });
  fab.packets(
    P.map((f, i) => {
      const s = leafPick(f, leafSeed);
      return { from: S[s]!, to: G[h(f, spineSeed(s)) % 2]!, label: f.name, progress: 0.3 + 0.1 * (i % 4) };
    }),
    `The fix is a different hash seed on every device, here derived from each loopback, so the spine's hash of a flow is unrelated to the leaf's. Now all four spine–gateway links carry ${list([...new Set(perLink)].map(String))} flows each, and leaf1.ams's own choices were reshuffled as well.`,
    "seeded",
  );

  fab.set({ "seeds fix": "polarisation", "seeds do not fix": "elephant collisions" });
  fab.note(
    `Seeds cure polarisation but not elephants: reseeding just reshuffles which flows collide, and two ${EL} Gb/s elephants still share an uplink half the time. What a platform should show is per-member utilisation of every ECMP group (the busiest member against the average) and the top flows on a hot link from sFlow samples, because an interface total alone cannot tell an elephant from a crowd.`,
    "done",
  );
  return fab.f.done();
};

// ---------- gray-failure ----------

interface OpticStage {
  week: number;
  rx: string;
  ber: string;
  /** Bit errors before FEC per second, at the 425 Gb/s line rate of 400GBASE-R. */
  bitErrors: string;
  uncorrectable: string;
  fcs: string;
  loss: number;
}
const OPTIC: OpticStage[] = [
  { week: 0, rx: "−1.8 dBm", ber: "1e-8", bitErrors: "4,250 /s", uncorrectable: "0 /s", fcs: "0 /s", loss: 0 },
  { week: 2, rx: "−4.6 dBm", ber: "3e-6", bitErrors: "1,275,000 /s", uncorrectable: "0 /s", fcs: "0 /s", loss: 0 },
  { week: 4, rx: "−5.9 dBm", ber: "9e-5", bitErrors: "38,250,000 /s", uncorrectable: "0 /s", fcs: "0 /s", loss: 0 },
  { week: 5, rx: "−6.8 dBm", ber: "1.5e-3", bitErrors: "637,500,000 /s", uncorrectable: "≈ 680,000 /s", fcs: "625,000 /s", loss: 2 },
];

/**
 * `gray-failure` (lesson 02-03). leaf1.ams with four 400G-DR4 uplinks, one per
 * Amsterdam spine, about 250 Gb/s each. Over five weeks the receive power at
 * spine3.ams's port facing leaf1.ams drifts from −1.8 to −6.8 dBm (a dirty
 * connector): the pre-FEC bit error rate climbs from 1e-8 past the 2.4e-4
 * that RS(544,514) "KP4" FEC is specified for, to 1.5e-3, where with random
 * errors about 0.9% of codewords have more than the 15 bad symbols FEC can
 * fix; FCS errors appear and about 2% of frames are dropped on receive. The link stays up (light, LLDP, IS-IS and
 * BFD all get through), so ECMP keeps sending it a quarter of the flows
 * (chart). Then the platform signals, costing the link out (three uplinks at
 * 83%), and the repair. Counter values are illustrative but consistent: bit
 * errors = BER × 425 Gb/s; uncorrectable codewords = that 0.9% of the 78
 * million 5,440-bit codewords a second; FCS errors = 2% of 31.25 million
 * frames/s (250 Gb/s of 1,000-byte frames, each touching two or three
 * codewords).
 *
 * Inputs: none. 11 frames.
 */
export const grayFailure: FabGen = () => {
  const spines = ["spine1.ams", "spine2.ams", "spine3.ams", "spine4.ams"];
  const L1 = "leaf1.ams";
  const L3 = "leaf3.ams";
  const BAD = "spine3.ams";
  const fab = new Fab(
    [...spines.map((id, i): NodeSpec => ({ id, kind: "spine", x: (i + 0.5) * 25, y: 0 })), { id: L1, kind: "leaf", x: 25, y: 75, state: loopback(L1) }, { id: L3, kind: "leaf", x: 75, y: 75, state: loopback(L3) }],
    spines.flatMap((s): LinkSpec[] => [[L1, s, { width: 250 / 400 }], [L3, s]]),
  );
  const counters = (st: OpticStage) => [
    ["oper status", "up", "up"],
    ["Rx power, per lane", st.rx, OPTIC[0]!.rx],
    ["pre-FEC bit error rate", st.ber, OPTIC[0]!.ber],
    ["bit errors before FEC", st.bitErrors, OPTIC[0]!.bitErrors],
    ["FEC uncorrectable codewords", st.uncorrectable, "0 /s"],
    ["in FCS errors", st.fcs, "0 /s"],
  ];
  const cTitle = `${BAD} port facing leaf1.ams (illustrative)`;
  const ecmp = (alive: string[], bad?: string) => ({
    title: `${L1} ECMP group towards leaf3.ams`,
    head: ["next hop", "uplink", "share", "routing says"],
    rows: alive.map((s) => [p2p(L1, s).spine, short(s), `${+(100 / alive.length).toFixed(1)}%`, "up"]),
    tones: alive.map((s) => (s === bad ? ("compare" as const) : undefined)),
  });
  fab.set({ "offered by leaf1": "1,000 Gb/s", "uplink capacity": "4 × 400G = 1,600 Gb/s" });
  fab.table(0, ecmp(spines));
  fab.note(
    `leaf1.ams in Meridian's Amsterdam fabric has four 400G uplinks, one per spine, each a 400G-DR4 optic: four lanes of 100 Gb/s over single-mode fibre. It sends about 1,000 Gb/s towards the other leaves, and ECMP gives each uplink a quarter of the flows, about 250 Gb/s.`,
    "topology",
  );

  fab.chart({ title: "link leaf1.ams → spine3.ams", unit: "%", yMax: 30, xLabel: "weeks", series: [{ name: "share of leaf1's flows sent into it", tone: "active" }, { name: "frames lost on it", tone: "danger" }] });
  const stage = (i: number) => {
    const st = OPTIC[i]!;
    fab.table(0, { title: `${cTitle}, week ${st.week}`, head: ["counter", "now", "baseline"], rows: counters(st), tones: [undefined, i > 0 ? "compare" : undefined, i > 0 ? "compare" : undefined, i > 0 ? "compare" : undefined, st.loss ? "danger" : undefined, st.loss ? "danger" : undefined] });
    fab.table(1, ecmp(spines, st.loss ? BAD : undefined));
    fab.point({ "share of leaf1's flows sent into it": 25, "frames lost on it": st.loss });
    fab.state(BAD, `Rx ${st.rx}`, st.loss ? "danger" : i > 0 ? "compare" : undefined);
  };
  stage(0);
  fab.note(
    `Errors are counted where a frame is received, so the counters that matter for this direction are on spine3.ams's port facing leaf1.ams: −1.8 dBm of light per lane and a pre-FEC bit error rate of about 1e-8, normal for 100G-per-lane PAM4 signalling, which always needs some correction. Forward error correction, RS(544,514) or "KP4", repairs those few errors, so no frame fails its FCS check.`,
    "baseline",
  );

  stage(1);
  fab.note(
    `Over two weeks the receive power falls to −4.6 dBm, as it does when a connector is contaminated or a fibre is bent too tightly in a tray, and the error rate before FEC rises 300-fold to 3e-6. FEC still repairs every codeword: zero FCS errors, zero drops, and nothing at the IP layer has noticed.`,
    "drift",
  );

  stage(2);
  fab.note(
    `At −5.9 dBm the pre-FEC error rate is 9e-5, within a factor of three of 2.4e-4, the highest rate at which KP4 FEC is specified to deliver a practically error-free link, and 38 million bit errors are being repaired every second. This is the earliest strong warning, and the link still shows zero FCS errors and looks perfectly healthy.`,
    "margin",
  );

  stage(3);
  fab.linkSet(L1, BAD, { tone: "compare", label: "up · 2% loss", labelAt: 0.6 });
  fab.note(
    `At −6.8 dBm the error rate is 1.5e-3, six times the FEC limit, and FEC fails abruptly rather than gradually: about one codeword in a hundred now has more errors than it can repair, and spine3.ams drops the 2% of frames from leaf1.ams that then fail their FCS check (the frame's CRC-32), about 625,000 a second at an average of 1,000 bytes. leaf1.ams's own counters look perfect, because a sender never learns that the receiver threw its frames away.`,
    "errors",
  );

  fab.set({ "BFD false-down chance": "≤ 0.02³ ≈ 8 in a million per window" });
  fab.packets(
    [
      { from: L1, to: "spine1.ams", label: "ok", progress: 0.5 },
      { from: L1, to: "spine2.ams", label: "ok", progress: 0.5 },
      { from: L1, to: BAD, label: "2% lost", progress: 0.7, lost: true },
      { from: L1, to: "spine4.ams", label: "ok", progress: 0.5 },
    ],
    `Nothing routes around it: the optic still delivers light, so the port stays up, and LLDP, IS-IS hellos and BFD packets get through at least 98% of the time (short BFD and LLDP packets more often still, since a short packet has fewer bits to hit). BFD declares a link down only after three consecutive misses, which at 2% loss happens with probability at most 0.02³, about 8 in a million per window, so spine3.ams stays in the ECMP group and keeps receiving its 25%.`,
    "still-up",
  );

  fab.set({ "flows affected": "1 in 4 from leaf1", "loss averaged over leaf1's uplinks": "0.5%" });
  fab.note(
    `One in four of leaf1's flows crosses this link and loses 2% of its packets, and TCP throughput falls roughly with one over the square root of the loss rate, so those flows slow to a fraction of their normal speed while the other three quarters are untouched. Averaged over leaf1's uplinks the loss is only 0.5%, small enough to disappear on a dashboard of totals, yet one slow request in four is exactly what users report.`,
    "impact",
  );

  fab.rowTone(0, () => true, undefined);
  fab.rowTone(0, (r) => r[0] === "Rx power, per lane" || r[0] === "pre-FEC bit error rate" || r[0] === "in FCS errors", "active");
  fab.set({ "module low-power warning": "−8.9 dBm (vendor-set): never fired" });
  fab.note(
    `The alerts that would have fired weeks earlier watch the pre-FEC error rate and the receive power against this link's own baseline, both trending the wrong way since week 2, while the module's own low-power warning (−8.9 dBm, set by its vendor) never fired at all. Now FCS errors on spine3.ams's receive side, plus probes spread over every uplink of which only those through spine3 lose packets, pin the fault to this one link.`,
    "signals",
  );

  const alive = spines.filter((s) => s !== BAD);
  fab.linkSet(L1, BAD, { tone: "muted", dashed: true, label: "costed out", width: 0 });
  for (const s of alive) fab.linkSet(L1, s, { width: 1000 / 3 / 400 });
  fab.table(1, ecmp(alive));
  fab.point({ "share of leaf1's flows sent into it": 0, "frames lost on it": 0 });
  fab.state(BAD, "link costed out", "muted");
  fab.unset("BFD false-down chance", "flows affected", "loss averaged over leaf1's uplinks");
  fab.set({ "uplink capacity": "3 × 400G = 1,200 Gb/s", utilisation: "83.3%" });
  fab.note(
    `The operator costs the link out, raising its IS-IS metric at both ends far above any real path, so leaf1.ams drops spine3.ams from its ECMP group and three uplinks carry the 1,000 Gb/s at 83% utilisation, tight but loss-free. Every other leaf also stops sending leaf1-bound traffic through spine3.ams, because without this link spine3's path to leaf1 is a long detour through another leaf and spine.`,
    "cost-out",
  );

  fab.linkSet(L1, BAD, { tone: undefined, dashed: false, label: undefined, width: 250 / 400 });
  for (const s of alive) fab.linkSet(L1, s, { width: 250 / 400 });
  fab.table(0, { title: `${cTitle}, after cleaning`, head: ["counter", "now", "baseline"], rows: counters({ ...OPTIC[0]!, rx: "−1.9 dBm" }) });
  fab.table(1, ecmp(spines));
  fab.point({ "share of leaf1's flows sent into it": 25, "frames lost on it": 0 });
  fab.state(BAD, "Rx −1.9 dBm", "done");
  fab.set({ "uplink capacity": "4 × 400G = 1,600 Gb/s", utilisation: "62.5%" });
  fab.note(
    `A technician cleans the connector (or swaps the optic), receive power returns to −1.9 dBm and the error rate to its baseline, and after a soak period with zero FCS errors the link's metric is restored. leaf1.ams's ECMP group is back to four members at 25% each, 62.5% utilisation.`,
    "repair",
  );

  clearNode(fab, BAD);
  fab.note(
    `A gray failure is a component that is neither working nor down, and ECMP makes it worse by feeding the sick link its full share for as long as routing says it is up. Some operators automate the response, costing out any link whose error rate crosses a threshold provided the remaining uplinks have the headroom to take its traffic.`,
    "done",
  );
  return fab.f.done();
};

// ---------- site-square ----------

/**
 * `site-square` (lesson 02-04). Meridian's Amsterdam and Singapore sites,
 * small example (two spines and two leaves per site), joined by two leased
 * 100 Gb/s long-haul circuits, spine1.ams–spine1.sin and spine2.ams–spine2.sin.
 * There are no spine-to-spine links inside a site, so the square's other two
 * sides run spine → leaf → spine. IS-IS metric 10 inside a site, 1,000 on a
 * circuit: leaf1.ams reaches leaf2.sin over two equal paths of metric 1,020.
 * Circuit 1 fails: spine1.ams reroutes first through a leaf to its sister
 * spine (the detour, metric 1,030, possible microloops), then the leaves
 * converge on spine2.ams (1,020 against 1,040), and all inter-site traffic
 * rides circuit 2 at half the capacity (chart). Ends with the 50% planning
 * rule, shared-risk link groups and the repair.
 *
 * Inputs: `load` Gb/s from Amsterdam to Singapore, 10-190 (default 80: 40% per
 * circuit, 80% after the failure; above 100 the survivor is overloaded).
 * 11 frames.
 */
export const siteSquare: FabGen = (input) => {
  const LOAD = int(input.load, 10, 190, 80);
  const CAP = 100;
  const KM = DISTANCE_KM["ams-sin"];
  const oneWay = fibreMs(KM);
  const A1 = "leaf1.ams";
  const A2 = "leaf2.ams";
  const S1A = "spine1.ams";
  const S2A = "spine2.ams";
  const S1S = "spine1.sin";
  const S2S = "spine2.sin";
  const B1 = "leaf1.sin";
  const B2 = "leaf2.sin";
  const fab = new Fab(
    [
      { id: A1, kind: "leaf", x: 6, y: 22 },
      { id: A2, kind: "leaf", x: 6, y: 78 },
      { id: S1A, kind: "spine", x: 32, y: 0 },
      { id: S2A, kind: "spine", x: 32, y: 100 },
      { id: S1S, kind: "spine", x: 68, y: 0 },
      { id: S2S, kind: "spine", x: 68, y: 100 },
      { id: B1, kind: "leaf", x: 94, y: 22 },
      { id: B2, kind: "leaf", x: 94, y: 78, state: loopback(B2) },
    ],
    [
      [A1, S1A],
      [A1, S2A],
      [A2, S1A],
      [A2, S2A],
      [S1A, S1S, { label: "circuit 1 · 100G" }],
      [S2A, S2S, { label: "circuit 2 · 100G" }],
      [B1, S1S],
      [B1, S2S],
      [B2, S1S],
      [B2, S2S],
    ],
    { height: 300 },
  );
  const half = LOAD / 2;
  const pctOf = (v: number) => `${Math.round((v / CAP) * 100)}%`;
  fab.set({ "inter-site circuits": "2 × 100 Gb/s", "intra-site spine links": "none (via leaves)" });
  fab.note(
    `Meridian's Amsterdam and Singapore sites, small example with two spines and two leaves each, joined spine to spine by two leased long-haul circuits of 100 Gb/s: spine1.ams–spine1.sin and spine2.ams–spine2.sin. Spines inside a site are not linked to each other, so the other two sides of this square run from a spine down through any leaf and up to its sister spine.`,
    "topology",
  );

  fab.table(0, {
    title: "two sites, two spines each: square vs full mesh",
    head: ["design", "long-haul circuits", "capacity", "after one circuit fails"],
    rows: [
      ["square", "2 × 100G", "200 Gb/s", "100 Gb/s (50%)"],
      ["full mesh", "4 × 50G", "200 Gb/s", "150 Gb/s on paper, 100 usable with plain ECMP"],
    ],
    tones: ["active", undefined],
  });
  fab.note(
    `Leased long-haul circuits are the most expensive links Meridian has, and each one is a separate contract, route and failure point. A full mesh would join every Amsterdam spine to both Singapore spines, four circuits; the square buys the same reachability with two by reusing the intra-site links Meridian already owns, at the price of losing half its capacity when one fails. The mesh keeps three quarters on paper, but plain ECMP still sends half the traffic to the spine that lost a circuit, so it too fills at 100 Gb/s.`,
    "why-square",
  );

  const route = (rows: string[][], tones?: ("active" | "muted" | undefined)[]) => fab.table(0, { title: `${A1} route to ${loopback(B2)}/32 (${B2})`, head: ["via", "path", "metric"], rows, tones });
  route([
    [S1A, "leaf1 → spine1.ams → circuit 1 → spine1.sin → leaf2.sin", "10 + 1,000 + 10 = 1,020"],
    [S2A, "leaf1 → spine2.ams → circuit 2 → spine2.sin → leaf2.sin", "10 + 1,000 + 10 = 1,020"],
  ], ["active", "active"]);
  fab.path([A1, S1A, S1S, B2]);
  fab.path([A1, S2A, S2S, B2]);
  fab.note(
    `To IS-IS the circuits are links with a high metric, 1,000 against 10 inside a site. leaf1.ams therefore reaches leaf2.sin's loopback 10.255.2.12 over two equal-cost paths of metric 1,020, one through each Amsterdam spine and its circuit.`,
    "routing",
  );

  fab.clearPath();
  fab.chart({ title: "Amsterdam → Singapore load per circuit", unit: "Gb/s", yMax: Math.max(120, LOAD * 1.1), xLabel: "time", series: [{ name: "circuit 1", tone: "active" }, { name: "circuit 2", tone: "compare" }], marks: [{ y: CAP, label: "100G circuit capacity", tone: "danger" }] });
  fab.point({ "circuit 1": half, "circuit 2": half });
  fab.linkSet(S1A, S1S, { width: half / CAP, label: `circuit 1 · ${half} of 100G` });
  fab.linkSet(S2A, S2S, { width: half / CAP, label: `circuit 2 · ${half} of 100G` });
  fab.set({ "Amsterdam → Singapore": `${LOAD} Gb/s`, "per circuit": `${half} Gb/s (${pctOf(half)})` });
  fab.packets(
    [
      { from: S1A, to: S1S, label: `${half} Gb/s`, progress: 0.5 },
      { from: S2A, to: S2S, label: `${half} Gb/s`, progress: 0.5 },
    ],
    `Amsterdam sends ${LOAD} Gb/s to Singapore, and ECMP at every Amsterdam leaf splits it over both spines, so each circuit carries about ${half} Gb/s, ${pctOf(half)} of its capacity.`,
    "steady",
  );

  fab.set({ "fibre path": `≈ ${num(KM)} km`, "one way": `${oneWay} ms`, "round trip": `${oneWay * 2} ms` });
  fab.note(
    `Distance dominates the latency: about ${num(KM)} km of fibre at roughly 5 microseconds per km is ${oneWay} ms one way and ${oneWay * 2} ms round trip, while each of the four switches on the path adds only microseconds. In practice the two circuits follow different routes of different lengths, so latency can change after a failover.`,
    "latency",
  );

  fab.down(S1A, S1S, "circuit 1 down");
  fab.state(S1A, "link down", "danger");
  fab.state(S1S, "link down", "danger");
  fab.point({ "circuit 1": 0, "circuit 2": half });
  fab.send(
    S1A,
    S1S,
    "in flight",
    `A ship's anchor cuts the subsea cable carrying circuit 1. The carrier's equipment at each end passes the failure on to the spines (it signals a fault, or switches its laser off), so both spines' ports facing the circuit go down within milliseconds, the ${half} Gb/s that was riding circuit 1 has lost its path, and the packets in flight on it are gone.`,
    { lost: true, tag: "fail" },
  );

  fab.state(S1A, "SPF: via leaves", "compare");
  clearNode(fab, S1S);
  fab.path([S1A, A2, S2A, S2S], "compare");
  fab.packets(
    [
      { from: A1, to: S1A, label: "still sent here", progress: 0.6 },
      { from: S1A, to: A2, label: "detour", progress: 0.5, tone: "compare" },
      { from: A2, to: S2A, label: "detour", progress: 0.5, tone: "compare" },
    ],
    `spine1.ams reruns SPF first: its best path to Singapore is now down through an Amsterdam leaf to spine2.ams and over circuit 2, metric 1,030, so packets the leaves are still sending it take a detour through a leaf and the sister spine, two extra hops on the way. Until every leaf has rerun its own SPF, typically well under a second, a packet can even bounce between spine1.ams and a leaf that still points at it: a microloop (lesson 03-04).`,
    "detour",
  );

  fab.clearPath();
  clearNode(fab, S1A);
  route([
    [S1A, "leaf1 → spine1.ams → a leaf → spine2.ams → circuit 2 → …", "10 + 10 + 10 + 1,000 + 10 = 1,040"],
    [S2A, "leaf1 → spine2.ams → circuit 2 → spine2.sin → leaf2.sin", "10 + 1,000 + 10 = 1,020"],
  ], ["muted", "active"]);
  fab.path([A1, S2A, S2S, B2]);
  fab.linkSet(S2A, S2S, { width: Math.min(1, LOAD / CAP), label: `circuit 2 · ${LOAD} of 100G`, tone: LOAD > CAP ? "danger" : "path" });
  fab.point({ "circuit 1": 0, "circuit 2": LOAD });
  fab.set({ "per circuit": `circuit 1 down, circuit 2 ${LOAD} Gb/s (${pctOf(LOAD)})`, "inter-site capacity": "100 Gb/s (half)" });
  fab.packets(
    [
      { from: A1, to: S2A, label: "to Singapore", progress: 0.5 },
      { from: A2, to: S2A, label: "to Singapore", progress: 0.5 },
    ],
    `Once the leaves have rerun SPF, the path through spine1.ams costs 1,040, detour included, against 1,020 through spine2.ams, so every Amsterdam leaf sends its Singapore traffic straight to spine2.ams. Leaf-to-leaf paths are therefore no longer than before; only traffic that starts at spine1.ams itself, such as its own monitoring traffic, still shows the two extra hops in traceroute.`,
    "converged",
  );

  const util = LOAD / CAP;
  if (util > 1) fab.state(S2A, "drops", "danger");
  fab.note(
    util > 1
      ? `All ${LOAD} Gb/s now competes for circuit 2's 100 Gb/s: ${pctOf(LOAD)} of its capacity, so queues on spine2.ams overflow, the excess is dropped and TCP slows every flow between the sites. The signals are circuit 1's ports down, circuit 2 pinned at 100%, and output drops on spine2.ams's port facing it.`
      : `All ${LOAD} Gb/s now rides circuit 2, ${pctOf(LOAD)} of its 100 Gb/s: half the inter-site capacity is gone, but the traffic fits. The signals are circuit 1's ports down and a step from ${pctOf(half)} to ${pctOf(LOAD)} on circuit 2 and on the leaf links into spine2.ams.`,
    "capacity",
  );

  clearNode(fab, S2A);
  fab.set({ "planning rule": "each circuit under 50% in normal running" });
  fab.note(
    `The square's planning rule follows: keep each circuit below 50% in normal running so that either one can carry both shares when the other fails, and add capacity before the busiest hour breaks that rule. Just as important, the two circuits must not share a cable, duct or landing station, a shared-risk link group, or one anchor cuts both and the square is gone.`,
    "planning",
  );

  fab.up(S1A, S1S, `circuit 1 · ${half} of 100G`);
  fab.linkSet(S1A, S1S, { width: half / CAP });
  fab.linkSet(S2A, S2S, { width: half / CAP, label: `circuit 2 · ${half} of 100G`, tone: undefined });
  fab.clearPath();
  route([
    [S1A, "leaf1 → spine1.ams → circuit 1 → spine1.sin → leaf2.sin", "1,020"],
    [S2A, "leaf1 → spine2.ams → circuit 2 → spine2.sin → leaf2.sin", "1,020"],
  ], ["active", "active"]);
  fab.point({ "circuit 1": half, "circuit 2": half });
  fab.set({ "per circuit": `${half} Gb/s (${pctOf(half)})`, "inter-site capacity": "200 Gb/s" });
  fab.note(
    `When the cable is repaired, circuit 1 comes back, IS-IS restores the two equal-cost paths and the load splits ${half} and ${half} again. A platform should model the site pair rather than two independent links, and alert whenever either circuit alone could not carry the pair's traffic, before a failure proves it.`,
    "repair",
  );
  return fab.f.done();
};

// ---------- isis-flooding ----------

const AMS_SPINES2 = ["spine1.ams", "spine2.ams"] as const;
const AMS_LEAVES4 = ["leaf1.ams", "leaf2.ams", "leaf3.ams", "leaf4.ams"] as const;
/** Small Amsterdam example: 2 spines on top, 4 leaves below, every leaf linked to every spine. */
const smallAms = (extra: NodeSpec[] = [], extraLinks: LinkSpec[] = [], leafState?: (l: string) => string | undefined, spineState?: (s: string) => string | undefined): Fab =>
  new Fab(
    [
      ...AMS_SPINES2.map((id, i): NodeSpec => ({ id, kind: "spine", x: 30 + 40 * i, y: 0, state: spineState?.(id) })),
      ...AMS_LEAVES4.map((id, i): NodeSpec => ({ id, kind: "leaf", x: 12.5 + 25 * i, y: extra.length ? 55 : 75, state: leafState?.(id) })),
      ...extra,
    ],
    [...AMS_LEAVES4.flatMap((l) => AMS_SPINES2.map((s): LinkSpec => [l, s])), ...extraLinks],
  );

/** Sequence numbers of the six Amsterdam LSPs before anything happens (shared by the IS-IS scenarios). */
const SEQ0: Record<string, number> = { "spine1.ams": 0x5c, "spine2.ams": 0x51, "leaf1.ams": 0x33, "leaf2.ams": 0x2f, "leaf3.ams": 0x2a, "leaf4.ams": 0x31 };

/**
 * `isis-flooding` (lesson 03-02). Meridian's Amsterdam underlay, small example
 * (two spines, four leaves), one IS-IS level-2 area 49.0001. The leaf3–spine2
 * link fails; leaf3.ams originates a new LSP (ID 0102.5500.1013.00-00,
 * sequence 0x2a → 0x2b, lifetime 1,200 s, TLVs 137/1/22/135 with real sizes)
 * and floods it: spine1 installs (newer sequence number) and acknowledges with
 * a PSNP, floods on to the other leaves, which flood on to spine2; spine2's
 * duplicate copies are acknowledged but not re-flooded. The table follows
 * every router's copy converging. SPF (with the two-way check) leaves leaf1
 * with one next hop to 10.255.1.13/32 and spine2 reaching leaf3 at metric 30
 * through three leaves. The link is repaired: three-way hello, CSNP exchange
 * (lists match), new LSPs 0x2c and 0x53, ECMP restored; lifetime and refresh.
 *
 * Inputs: none. 14 frames.
 */
export const isisFlooding: FabGen = () => {
  const L1 = "leaf1.ams";
  const L3 = "leaf3.ams";
  const S1 = "spine1.ams";
  const S2 = "spine2.ams";
  const routers = [...AMS_SPINES2, ...AMS_LEAVES4] as string[];
  const fab = smallAms([], [], (l) => systemId(l), (s) => systemId(s));
  const copy: Record<string, { seq: number; rl: number }> = Object.fromEntries(routers.map((r) => [r, { seq: SEQ0[L3]!, rl: 1043 }]));
  const lsdbTable = (fresh: string[] = []) =>
    fab.table(0, {
      title: `${L3}'s LSP ${lspId(L3)} in each router's database`,
      head: ["router", "sequence", "remaining lifetime"],
      rows: routers.map((r) => [r, seqShort(copy[r]!.seq), `${num(copy[r]!.rl)} s`]),
      tones: routers.map((r) => (fresh.includes(r) ? "done" : undefined)),
    });
  const spf = (who: string, rows: string[][]) => fab.table(1, { title: `${who} SPF result for ${loopback(L3)}/32`, head: ["metric", "next hop", "via"], rows });
  const leaf1Ecmp = () => spf(L1, [["20", p2p(L1, S1).spine, S1], ["20", p2p(L1, S2).spine, S2]]);
  const lsp = (seq: number, rl: number, withS2: boolean): HeaderSpec[] => {
    const nbrs: [string, string][] = [[`${systemId(S1)}.00`, `metric 10 (${S1})`], ...(withS2 ? ([[`${systemId(S2)}.00`, `metric 10 (${S2})`]] as [string, string][]) : [])];
    const pfx: [string, string][] = [[`${loopback(L3)}/32`, "metric 0 (loopback)"], [p2p(L3, S1).net, "metric 10"], ...(withS2 ? ([[p2p(L3, S2).net, "metric 10"]] as [string, string][]) : [])];
    return [
      { name: "IS-IS L2 LSP header", size: 27, tone: "path", reader: "every router in the area", fields: { "LSP ID": lspId(L3), sequence: seqHex(seq), "remaining lifetime": `${num(rl)} s` }, highlight: ["sequence"] },
      { name: "TLV 137 hostname", size: 2 + L3.length, reader: "show commands", fields: { hostname: L3 } },
      { name: "TLV 1 area addresses", size: 6, reader: "adjacency check", fields: { area: "49.0001" } },
      { name: "TLV 22 extended IS reachability", size: 2 + 11 * nbrs.length, reader: "SPF (the graph's edges)", fields: nbrs },
      { name: "TLV 135 extended IP reachability", size: 2 + 9 * pfx.length, reader: "SPF (prefixes on each node)", fields: pfx },
    ];
  };

  lsdbTable();
  leaf1Ecmp();
  fab.set({ area: "49.0001, level 2", "LSPs per database": 6, adjacencies: 8 });
  fab.note(
    `Meridian's Amsterdam underlay, small example with two spines and four leaves: one IS-IS level-2 area, 49.0001, with an adjacency on every leaf-spine link and each router labelled with its system ID. Every router holds the same link-state database (LSDB) of six LSPs, one per router, each describing that router's neighbours and prefixes.`,
    "topology",
  );

  fab.headers(lsp(SEQ0[L3]!, 1043, true), `${L3}'s LSP as every router holds it`);
  fab.tone(L3, "active");
  fab.note(
    `This is leaf3.ams's LSP: ID ${lspId(L3)} (its system ID, derived from loopback 10.255.1.13, then pseudonode and fragment numbers), sequence number 0x2a and 1,043 seconds of lifetime left. Its TLVs list two neighbours, spine1 and spine2 at metric 10, and three prefixes: its loopback and the two /31 links.`,
    "lsp",
  );

  fab.down(L3, S2);
  fab.set({ adjacencies: 7 });
  copy[L3] = { seq: SEQ0[L3]! + 1, rl: 1200 };
  fab.headers(lsp(SEQ0[L3]! + 1, 1200, false), `new LSP built by ${L3}`);
  fab.state(L3, "LSP 0x2b", "active");
  fab.state(S2, "LSP 0x52", "compare");
  lsdbTable([L3]);
  fab.note(
    `The leaf3–spine2 fibre is cut and both ends lose the adjacency. leaf3.ams builds a new LSP with the sequence number raised to 0x2b, a fresh lifetime of 1,200 seconds and only spine1.ams as a neighbour, and spine2.ams does the same with its own LSP, 0x51 to 0x52, dropping leaf3.`,
    "originate",
  );

  fab.send(
    L3,
    S1,
    "LSP 0x2b",
    `leaf3.ams floods the new LSP to its only remaining neighbour, spine1.ams. IS-IS packets travel directly inside Ethernet frames rather than inside IP, so flooding works even when no IP route exists yet.`,
    { tag: "flood" },
  );

  copy[S1] = { seq: SEQ0[L3]! + 1, rl: 1200 };
  lsdbTable([L3, S1]);
  fab.state(S1, "has 0x2b", "done");
  fab.send(
    S1,
    L3,
    "PSNP ack 0x2b",
    `spine1.ams compares sequence numbers: 0x2b is higher than the 0x2a it holds, so the copy is newer, and spine1 replaces its entry and acknowledges with a PSNP (partial sequence number PDU) naming the LSP ID and 0x2b. Without that acknowledgement leaf3.ams would resend the LSP every 5 seconds, the usual retransmit interval on point-to-point links.`,
    { tag: "ack", tone: "done" },
  );

  const others = ["leaf1.ams", "leaf2.ams", "leaf4.ams"];
  for (const l of others) copy[l] = { seq: SEQ0[L3]! + 1, rl: 1200 };
  lsdbTable([L3, S1, ...others]);
  for (const l of others) fab.state(l, "has 0x2b", "done");
  fab.packets(
    others.map((l) => ({ from: S1, to: l, label: "LSP 0x2b" })),
    `spine1.ams floods the LSP on every other adjacency, to leaf1, leaf2 and leaf4, but not back to leaf3, which sent it. Each leaf finds 0x2b newer than its 0x2a, installs it and acknowledges with its own PSNP.`,
    "flood",
  );

  fab.packets(
    others.map((l, i) => ({ from: l, to: S2, label: "LSP 0x2b", progress: 0.35 + 0.15 * i })),
    `Each of those leaves in turn floods the LSP to its other neighbour, spine2.ams, so three copies of the same LSP head for spine2 within about a millisecond of each other.`,
    "flood",
  );

  copy[S2] = { seq: SEQ0[L3]! + 1, rl: 1200 };
  lsdbTable(routers);
  fab.state(S2, "has 0x2b", "done");
  fab.packets(
    others.map((l) => ({ from: S2, to: l, label: "PSNP ack", tone: "done" as const })),
    `spine2.ams installs the first copy and acknowledges all three; the second and third carry a sequence number it already holds, so they are not flooded any further. That is how flooding ends without loops or a hop count: a router passes an LSP on only when it is newer than its own copy.`,
    "dedupe",
  );

  for (const r of routers) clearNode(fab, r, systemId(r));
  fab.headers(undefined);
  fab.set({ "LSPs per database": 6, "databases in sync": "6 of 6", "time since the cut": "tens of ms (mostly the deliberate LSP-generation wait)" });
  fab.note(
    `Every router's copy of leaf3's LSP is now 0x2b, and spine2's new 0x52 LSP has flooded the same way from the other side: six identical databases again. The whole exchange takes tens of milliseconds, most of it the deliberate wait (often 50 ms) a router allows itself before generating an LSP, in case more changes follow.`,
    "synced",
  );

  spf(L1, [["20", p2p(L1, S1).spine, S1]]);
  fab.tone(L1, "active");
  fab.path([L1, S1, L3]);
  fab.note(
    `Every router now runs SPF (Dijkstra's shortest-path algorithm) over the same database and so reaches a consistent view; a link is used only if both ends' LSPs list each other, and neither leaf3 nor spine2 lists the other any more. leaf1.ams's route to 10.255.1.13/32 keeps metric 20 but now has a single next hop, spine1.ams.`,
    "spf",
  );

  fab.clearPath();
  fab.tone(L1, undefined);
  fab.tone(S2, "active");
  spf(S2, others.map((l) => ["30", p2p(l, S2).leaf, l]));
  for (const l of others) fab.path([S2, l, S1, L3], "frontier");
  fab.note(
    `From the same database spine2.ams computes that it can still reach leaf3.ams at metric 30, down to any of the other three leaves, up to spine1 and down again, with three equal-cost next hops. To IS-IS a leaf is just another router; the eBGP underlay of lesson 03-03 forbids exactly this kind of path.`,
    "spf",
  );

  fab.clearPath();
  fab.tone(S2, undefined);
  fab.unset("time since the cut");
  fab.up(L3, S2);
  fab.set({ adjacencies: 8 });
  fab.state(L3, "adjacency Up", "active");
  fab.state(S2, "adjacency Up", "active");
  fab.headers([{ name: "IS-IS L2 CSNP", tone: "path", reader: "the neighbour, to compare databases", fields: { source: `${systemId(L3)}.00`, "start LSP ID": "0000.0000.0000.00-00", "end LSP ID": "ffff.ffff.ffff.ff-ff", entries: "6 (LSP ID, sequence, lifetime, checksum each)" } }], `sent by ${L3} to ${S2}`);
  fab.table(0, {
    title: `CSNP comparison, ${L3} ↔ ${S2}`,
    head: ["LSP", `${short(L3)} has`, `${short(S2)} has`, "action"],
    rows: routers.map((r) => {
      const seq = r === L3 ? SEQ0[L3]! + 1 : r === S2 ? SEQ0[S2]! + 1 : SEQ0[r]!;
      return [`${r}.00-00`, seqShort(seq), seqShort(seq), "none"];
    }),
  });
  fab.packets(
    [
      { from: L3, to: S2, label: "CSNP", progress: 0.35 },
      { from: S2, to: L3, label: "CSNP", progress: 0.35 },
    ],
    `The fibre is repaired, and leaf3 and spine2 bring the adjacency up with a three-way hello handshake (Down, Initializing, Up). Each then sends a CSNP (complete sequence number PDU) listing every LSP it holds with its sequence number, and because flooding through spine1 kept both databases current, the lists match and nothing needs to be sent.`,
    "csnp",
  );

  copy[L3] = { seq: SEQ0[L3]! + 2, rl: 1200 };
  for (const r of routers) copy[r] = { seq: SEQ0[L3]! + 2, rl: 1200 };
  fab.headers(lsp(SEQ0[L3]! + 2, 1200, true), `new LSP built by ${L3}`);
  lsdbTable(routers);
  leaf1Ecmp();
  fab.state(L3, "LSP 0x2c", "done");
  fab.state(S2, "LSP 0x53", "done");
  fab.packets(
    [
      { from: L3, to: S1, label: "LSP 0x2c", progress: 0.5 },
      { from: L3, to: S2, label: "LSP 0x2c", progress: 0.5 },
    ],
    `Both routers then originate LSPs that include the restored adjacency, leaf3 0x2c and spine2 0x53, which flood exactly as before, and SPF everywhere gives leaf1.ams two equal-cost next hops to 10.255.1.13/32 again. Had a router missed an update, the CSNP would have shown it an older sequence number, and it would have asked for the newer copy with a PSNP.`,
    "restore",
  );

  fab.headers(undefined);
  for (const r of routers) clearNode(fab, r, systemId(r));
  for (const r of routers) copy[r] = { seq: SEQ0[L3]! + 2, rl: 1200 - 900 };
  lsdbTable();
  fab.set({ "max lifetime": "1,200 s", "refresh interval": "≈ 900 s" });
  fab.note(
    `Every LSP also ages: each router counts its copy's remaining lifetime down, and the originator refreshes it with a higher sequence number about every 15 minutes, well before its 1,200 seconds run out: 900 seconds on, each copy has 300 s left and leaf3 is about to refresh it. An LSP that does reach zero is purged from every router's database, which lesson 03-05 shows going badly wrong.`,
    "aging",
  );
  return fab.f.done();
};

// ---------- ebgp-clos-underlay ----------

/**
 * `ebgp-clos-underlay` (lesson 03-03). The small Amsterdam fabric (two spines,
 * four leaves) built the RFC 7938 way: no IGP, one eBGP session per leaf-spine
 * link over the /31 addresses, both spines in AS 65100, each leaf its own
 * private AS (leaf1.ams 65101 ... leaf4.ams 65104). leaf1.ams announces its
 * loopback 10.255.1.11/32 (AS_PATH 65101, NEXT_HOP its /31 address, IP TTL 1);
 * the spines prepend 65100 and pass it on; leaf3.ams receives two paths with
 * identical AS_PATH "65100 65101" and installs both (multipath); leaf3's
 * re-advertisement to spine2 (65103 65100 65101) is rejected because it
 * contains 65100. Then the leaf1–spine2 link fails and spine2 withdraws the
 * route, since it has no loop-free alternative.
 *
 * Inputs: `variant: "shared-leaf-as"` gives every leaf AS 65101 instead: leaf3
 * rejects both paths because its own AS is in them, and allowas-in 1 fixes it.
 * 11 frames (12 with the variant).
 */
export const ebgpClosUnderlay: FabGen = (input) => {
  const shared = pick(input.variant, ["default", "shared-leaf-as"] as const, "default") === "shared-leaf-as";
  const L1 = "leaf1.ams";
  const L3 = "leaf3.ams";
  const S1 = "spine1.ams";
  const S2 = "spine2.ams";
  const asn = (d: string): number => (d.startsWith("spine") ? 65100 : shared ? 65101 : 65100 + Number(/^leaf(\d+)/.exec(d)![1]));
  const fab = smallAms([], [], (l) => `AS ${asn(l)}`, (s) => `AS ${asn(s)}`);
  const PFX = `${loopback(L1)}/32`;
  /** Address of `a` on its link to `b`. */
  const addr = (a: string, b: string): string => (a.startsWith("leaf") ? p2p(a, b).leaf : p2p(b, a).spine);
  const update = (from: string, to: string, path: number[]): HeaderSpec[] => [
    { name: "IPv4", size: 20, reader: "the peer only (TTL 1)", fields: { src: addr(from, to), dst: addr(to, from), TTL: 1, protocol: "6 (TCP, port 179)" } },
    { name: "BGP UPDATE", tone: "path", reader: to, fields: { "withdrawn routes": "none", ORIGIN: "IGP", AS_PATH: path.join(" "), NEXT_HOP: addr(from, to), NLRI: PFX }, highlight: ["AS_PATH", "NEXT_HOP"] },
  ];
  const leaf3Table = (rows: string[][], tones?: ("done" | "danger" | "muted" | undefined)[]) => fab.table(0, { title: `${L3} BGP table: ${PFX}`, head: ["next hop", "from", "AS_PATH", "status"], rows, tones });
  const spineTable = (sp: string, rows: string[][], tones?: ("done" | "danger" | undefined)[]) => fab.table(1, { title: `${sp} BGP table: ${PFX}`, head: ["next hop", "from", "AS_PATH", "status"], rows, tones });
  const L = asn(L1);
  const L3as = asn(L3);

  leaf3Table([["—", "—", "—", "no path yet"]]);
  fab.set({ "spine AS": 65100, "leaf AS": shared ? "65101 on every leaf" : "65101-65104, one per leaf", "eBGP sessions": 8, IGP: "none" });
  fab.note(
    shared
      ? `The same small Amsterdam fabric (two spines, four leaves) built with BGP as the only routing protocol, but with a shortcut some operators take: both spines share AS 65100 and every leaf uses the same AS, 65101. Every leaf-spine link carries one eBGP session between its two /31 addresses, eight sessions in all, and there is no IS-IS.`
      : `The same small Amsterdam fabric (two spines, four leaves) built the RFC 7938 way, with BGP as the only routing protocol: both spines share AS 65100 and each leaf has its own private AS, 65101 to 65104. Every leaf-spine link carries one eBGP session between its two /31 addresses, eight sessions in all, and there is no IS-IS.`,
    "topology",
  );

  fab.headers(update(L1, S1, [L]), `UPDATE from ${L1} to ${S1}`);
  fab.tone(L1, "active");
  fab.send(
    L1,
    S1,
    `UPDATE ${PFX}`,
    `leaf1.ams announces its loopback, 10.255.1.11/32, to spine1.ams in a BGP UPDATE over their TCP session on port 179: the AS_PATH holds only its own AS ${L}, and NEXT_HOP is its own address on that link, 10.254.1.1. The IP TTL is 1 because these eBGP peers are directly connected and nothing should ever forward their packets.`,
    { tag: "announce" },
  );

  spineTable(S1, [[addr(L1, S1), L1, String(L), "best"]], ["done"]);
  fab.headers(update(L1, S2, [L]), `UPDATE from ${L1} to ${S2}`);
  fab.state(S1, "AS 65100 · ok", "done");
  fab.state(S2, "AS 65100 · ok", "done");
  fab.send(
    L1,
    S2,
    `UPDATE ${PFX}`,
    `The same UPDATE goes to spine2.ams with NEXT_HOP 10.254.2.1. Each spine checks the AS_PATH for its own AS, 65100, finds it absent and installs the route: one path, straight to leaf1.ams.`,
    { tag: "announce" },
  );

  fab.tone(L1, undefined);
  for (const sp of [S1, S2]) clearNode(fab, sp, "AS 65100");
  fab.headers(update(S1, L3, [65100, L]), `UPDATE from ${S1} to ${L3}`);
  fab.packets(
    ["leaf2.ams", L3, "leaf4.ams"].map((l) => ({ from: S1, to: l, label: `[65100 ${L}]` })),
    `spine1.ams passes the route on to leaf2, leaf3 and leaf4, prepending its own AS so the AS_PATH reads 65100 ${L}, and setting NEXT_HOP to its own address on each link: the copy to leaf3.ams says NEXT_HOP 10.254.1.4.`,
    "propagate",
  );

  fab.headers(update(S2, L3, [65100, L]), `UPDATE from ${S2} to ${L3}`);
  fab.packets(
    ["leaf2.ams", L3, "leaf4.ams"].map((l) => ({ from: S2, to: l, label: `[65100 ${L}]` })),
    `spine2.ams does the same, so leaf3.ams receives a second copy of the route with the same AS_PATH, 65100 ${L}, and NEXT_HOP 10.254.2.4.`,
    "propagate",
  );

  const twoPaths = [
    [addr(S1, L3), S1, `65100 ${L}`, "multipath"],
    [addr(S2, L3), S2, `65100 ${L}`, "multipath"],
  ];
  fab.headers(undefined);
  if (shared) {
    leaf3Table(
      [
        [addr(S1, L3), S1, `65100 ${L}`, `rejected: own AS ${L3as}`],
        [addr(S2, L3), S2, `65100 ${L}`, `rejected: own AS ${L3as}`],
      ],
      ["danger", "danger"],
    );
    fab.state(L3, "loop? rejected", "danger");
    fab.note(
      `Here leaf3.ams is also AS 65101, so it finds its own AS in the AS_PATH 65100 65101 and rejects both copies as loops: leaf3 cannot reach leaf1's loopback at all, although nothing is actually looping. eBGP's loop check cannot tell "this route passed through me" from "this route passed through another router that uses my AS number".`,
      "reject-own",
    );
    leaf3Table(twoPaths, ["done", "done"]);
    fab.state(L3, "allowas-in 1", "done");
    fab.path([L3, S1, L1]);
    fab.path([L3, S2, L1]);
    fab.note(
      `The usual fix is allowas-in 1, which lets leaf3.ams accept a path containing its own AS once; both copies are accepted, and multipath installs an ECMP route through both spines. It works, but it weakens BGP's loop protection on every leaf, which is why RFC 7938 gives each leaf its own AS.`,
      "allowas-in",
    );
  } else {
    leaf3Table(twoPaths, ["done", "done"]);
    fab.state(L3, "ECMP × 2", "done");
    fab.path([L3, S1, L1]);
    fab.path([L3, S2, L1]);
    fab.note(
      `leaf3.ams now holds two paths with identical AS_PATHs, so neither wins on length, and BGP multipath (off by default, switched on in every fabric) installs both: an ECMP route to 10.255.1.11/32 through both spines, the same forwarding result IS-IS would compute. This is why the spines share one AS: with different spine ASNs the two AS_PATHs would differ, and most implementations would use only one of them unless told to relax the multipath rule.`,
      "multipath",
    );
  }

  fab.clearPath();
  clearNode(fab, L3, `AS ${L3as}`);
  fab.headers(update(L3, S2, [L3as, 65100, L]), `UPDATE from ${L3} to ${S2}`);
  fab.send(
    L3,
    S2,
    `UPDATE [${L3as} 65100 ${L}]`,
    `leaf3.ams advertises its best path on to its other peer, spine2.ams, prepending its own AS: AS_PATH ${L3as} 65100 ${L}, NEXT_HOP 10.254.2.5. To spine2 this is a path to leaf1 that goes down to leaf3, up to spine1 and down again.`,
    { tag: "readvertise", progress: 0.8 },
  );

  spineTable(
    S2,
    [
      [addr(L1, S2), L1, String(L), "best"],
      [addr(L3, S2), L3, `${L3as} 65100 ${L}`, "rejected: AS 65100 in path"],
    ],
    ["done", "danger"],
  );
  fab.state(S2, "loop rejected", "danger");
  fab.note(
    `spine2.ams finds its own AS, 65100, in that AS_PATH and discards the route: eBGP's loop prevention at work. Because every spine shares AS 65100, no spine ever accepts a path that runs through another spine, so traffic can never take a spine-leaf-spine detour.`,
    "reject",
  );

  fab.headers(undefined);
  clearNode(fab, S2, "AS 65100");
  fab.down(L1, S2);
  spineTable(S2, [[addr(L3, S2), L3, `${L3as} 65100 ${L}`, "never accepted (loop)"]], ["danger"]);
  fab.headers([
    { name: "IPv4", size: 20, reader: "the peer only (TTL 1)", fields: { src: addr(S2, L3), dst: addr(L3, S2), TTL: 1, protocol: "6 (TCP, port 179)" } },
    { name: "BGP UPDATE", tone: "danger", reader: L3, fields: { "withdrawn routes": PFX, "path attributes": "none", NLRI: "none" }, highlight: ["withdrawn routes"] },
  ], `withdrawal from ${S2} to ${L3}`);
  fab.packets(
    ["leaf2.ams", L3, "leaf4.ams"].map((l) => ({ from: S2, to: l, label: `WITHDRAW ${PFX}`, tone: "danger" as const })),
    `Now the leaf1–spine2 link fails, and the session over it drops as soon as loss of light or BFD reports it. spine2.ams has lost its only usable path, because the looped ones were never accepted, so it sends a withdrawal of 10.255.1.11/32 to leaf2, leaf3 and leaf4.`,
    "withdraw",
  );

  fab.headers(undefined);
  leaf3Table([[addr(S1, L3), S1, `65100 ${L}`, "best (only path)"], [addr(S2, L3), S2, "—", "withdrawn"]], ["done", "muted"]);
  fab.state(L3, "1 path", "active");
  fab.path([L3, S1, L1]);
  fab.note(
    `leaf3.ams drops the path via spine2 and keeps the one via spine1.ams, so traffic to leaf1's loopback now leaves only through spine1. IS-IS would reach the same forwarding result by flooding and SPF; BGP reaches it by an explicit withdrawal, and spine2.ams itself can no longer reach leaf1 at all, where an IS-IS spine would detour through a leaf.`,
    "converged",
  );

  fab.clearPath();
  clearNode(fab, L3, `AS ${L3as}`);
  fab.set({ "one protocol": "BGP everywhere", "per link": "one session, one AS plan" });
  fab.note(
    `RFC 7938's appeal is one protocol and one set of tools everywhere, policy at every hop, and failures handled by withdrawals between neighbours instead of flooding to every router. The cost is a session on every link and an AS plan to manage (BGP unnumbered, which peers over IPv6 link-local addresses, removes the /31 bookkeeping) and timers that fabrics tune down from BGP's internet defaults.`,
    "done",
  );
  return fab.f.done();
};

// ---------- bfd-convergence ----------

/**
 * `bfd-convergence` (lesson 03-04). leaf1.ams sends 80 Gb/s to leaf2.sin over
 * the Amsterdam-Singapore square, 40 Gb/s per circuit. Circuit 1 runs through
 * a carrier's optical network; a fibre breaks inside it and both spines'
 * ports stay lit, so only BFD can tell. Timeline (table): detection (BFD
 * `interval` × `multiplier`), IS-IS LSP generation wait (50 ms), flooding
 * (2 ms), SPF wait and run (50 + 1 ms), FIB update (15 ms), with data lost on
 * circuit 1 at 40 Gb/s; then the same timeline without BFD, where the IS-IS
 * hold timer (default 10 s hellos × 3 = 30 s) detects the failure.
 *
 * Inputs: `interval` BFD transmit interval in ms, 50-1000 (default 300);
 * `multiplier` 2-10 (default 3). 11 frames.
 */
export const bfdConvergence: FabGen = (input) => {
  const I = int(input.interval, 50, 1000, 300);
  const M = int(input.multiplier, 2, 10, 3);
  const DET = I * M;
  const GEN = 50;
  const FLOOD = 2;
  const SPF_WAIT = 50;
  const SPF_RUN = 1;
  const FIB = 15;
  const REST = GEN + FLOOD + SPF_WAIT + SPF_RUN + FIB;
  const HOLD = 30_000;
  const RATE = 40; // Gb/s on circuit 1
  const gb = (ms: number) => +((RATE * ms) / 1000 / 8).toFixed(1);
  const L1 = "leaf1.ams";
  const S1A = "spine1.ams";
  const S2A = "spine2.ams";
  const S1S = "spine1.sin";
  const S2S = "spine2.sin";
  const B2 = "leaf2.sin";
  const CAR = "carrier";
  const fab = new Fab(
    [
      { id: L1, kind: "leaf", x: 6, y: 50 },
      { id: S1A, kind: "spine", x: 28, y: 0 },
      { id: S2A, kind: "spine", x: 28, y: 100 },
      { id: CAR, label: "carrier optical", kind: "cloud", x: 50, y: 0 },
      { id: S1S, kind: "spine", x: 72, y: 0 },
      { id: S2S, kind: "spine", x: 72, y: 100 },
      { id: B2, kind: "leaf", x: 94, y: 50, state: loopback(B2) },
    ],
    [
      [L1, S1A],
      [L1, S2A],
      [S1A, CAR, { label: "circuit 1", width: 0.4 }],
      [CAR, S1S, { width: 0.4 }],
      [S2A, S2S, { label: "circuit 2", width: 0.4 }],
      [S1S, B2],
      [S2S, B2],
    ],
    { height: 280 },
  );
  const routeTable = (hops: string[]) => fab.table(0, { title: `${L1} route to ${loopback(B2)}/32`, head: ["next hop", "metric"], rows: hops.map((h) => [h, "1,020"]) });
  const rows: string[][] = [];
  const timeline = (title: string, event: string, takes: number | string, at: number) => {
    rows.push([event, typeof takes === "number" ? `${num(takes)} ms` : takes, `${num(at)} ms`]);
    fab.table(1, { title, head: ["step", "takes", "time since cut"], rows: rows.map((r) => [...r]), tones: rows.map((_, i) => (i === rows.length - 1 ? "active" : undefined)) });
  };
  const T1 = `Timeline with BFD (${I} ms × ${M})`;
  routeTable([S1A, S2A]);
  fab.set({ "leaf1 → Singapore": "80 Gb/s, 40 per circuit" });
  fab.note(
    `Amsterdam to Singapore again, small example: leaf1.ams sends 80 Gb/s towards leaf2.sin, split by ECMP over the two circuits, about 40 Gb/s each. Circuit 1 is delivered through a carrier's optical transport network, so the light spine1.ams receives comes from the carrier's equipment in Amsterdam, not from spine1.sin.`,
    "topology",
  );

  fab.headers(
    [
      { name: "IPv4", size: 20, reader: "the peer (TTL must arrive as 255)", fields: { TTL: 255, protocol: "17 (UDP)" } },
      { name: "UDP", size: 8, fields: { "dst port": "3784 (single-hop BFD)" } },
      { name: "BFD control", size: 24, tone: "path", reader: "the BFD peer", fields: { version: 1, state: "Up", "detect mult": M, "my discriminator": "0x0000a101", "your discriminator": "0x0000b201", "desired min TX": `${num(I * 1000)} µs`, "required min RX": `${num(I * 1000)} µs` }, highlight: ["detect mult", "desired min TX"] },
    ],
    `sent by ${S1A} every ${I} ms`,
  );
  fab.send(
    S1A,
    CAR,
    "BFD",
    `spine1.ams and spine1.sin run a BFD (Bidirectional Forwarding Detection) session across the circuit: each sends a small UDP control packet every ${I} ms and declares the session down after ${M} intervals without one, ${num(DET)} ms. IS-IS is registered as a BFD client on this link, because its own hellos, every 10 seconds with a 30-second hold time, are far too slow to rely on.`,
    { tag: "bfd" },
  );

  fab.headers(undefined);
  fab.state(CAR, "fibre cut", "danger");
  fab.linkSet(S1A, CAR, { label: "port still up", tone: "compare" });
  fab.linkSet(CAR, S1S, { tone: "compare" });
  timeline(T1, "fibre breaks inside the carrier network", "—", 0);
  fab.packets(
    [
      { from: S1A, to: CAR, label: "40 Gb/s lost", lost: true, progress: 0.9 },
      { from: S2A, to: S2S, label: "40 Gb/s ok", progress: 0.5 },
    ],
    `At t = 0 a fibre breaks inside the carrier's network, between its own transponders. This service does not pass the failure on, so the carrier's equipment keeps sending both spines light and their ports stay up: neither spine notices, and every packet hashed onto circuit 1, half of leaf1's Singapore traffic, is now being lost.`,
    "cut",
  );

  fab.state(S1A, "BFD missed", "compare");
  fab.send(
    CAR,
    S1A,
    "BFD from spine1.sin",
    `spine1.ams expects a BFD packet from spine1.sin every ${I} ms, and from now on none arrives, so its count of missed intervals climbs towards ${M}. IS-IS, left to its own 30-second hold timer, would still call the adjacency up.`,
    { lost: true, tag: "miss" },
  );

  fab.state(S1A, "BFD Down", "danger");
  fab.state(S1S, "BFD Down", "danger");
  fab.down(S1A, CAR, "BFD down");
  fab.down(CAR, S1S);
  timeline(T1, `BFD: ${M} intervals missed → session Down → IS-IS adjacency down`, DET, DET);
  fab.note(
    `At ${num(DET)} ms, ${M} intervals after the last packet (here it arrived just before the cut, the worst case), spine1.ams declares the BFD session down and tells IS-IS at once, which drops the adjacency to spine1.sin. spine1.sin reaches the same verdict independently, within one interval of it, and BFD has done its whole job: detection.`,
    "detect",
  );

  timeline(T1, "LSP-generation wait, new LSP without circuit 1", GEN, DET + GEN);
  timeline(T1, "LSP floods to the Amsterdam leaves", FLOOD, DET + GEN + FLOOD);
  fab.state(S1A, "LSP flooded", "compare");
  fab.send(
    S1A,
    L1,
    "LSP (no circuit 1)",
    `spine1.ams waits its initial LSP-generation delay of ${GEN} ms in case more changes arrive to batch, then floods a new LSP without circuit 1, which reaches leaf1.ams and the other Amsterdam leaves about ${FLOOD} ms later. In Singapore, spine1.sin does the same for the leaves there.`,
    { tag: "flood" },
  );

  timeline(T1, "SPF wait and run on leaf1.ams", SPF_WAIT + SPF_RUN, DET + GEN + FLOOD + SPF_WAIT + SPF_RUN);
  routeTable([S2A]);
  fab.state(L1, "SPF done", "active");
  fab.note(
    `leaf1.ams waits its initial SPF delay, another ${SPF_WAIT} ms, then runs SPF in about ${SPF_RUN} ms: the route to leaf2.sin's loopback 10.255.2.12 now has a single next hop, spine2.ams. spine1.ams already routes Singapore traffic down through the leaves, so until every leaf has updated, a few packets bounce between spine1.ams and a leaf still pointing at it: a microloop.`,
    "spf",
  );

  const TOT = DET + REST;
  timeline(T1, "FIB updated in the ASIC: traffic flows", FIB, TOT);
  fab.state(L1, "FIB updated", "done");
  fab.path([L1, S2A, S2S, B2]);
  fab.linkSet(S2A, S2S, { width: 0.8 });
  fab.packets(
    [
      { from: L1, to: S2A, label: "80 Gb/s", progress: 0.5 },
      { from: S2A, to: S2S, label: "80 Gb/s", progress: 0.5 },
    ],
    `The new route is written into the forwarding ASIC in about ${FIB} ms, because every affected prefix shares one ECMP group and only that group is rewritten (prefix-independent convergence); a box that rewrites each prefix separately can take far longer. From here every flow to Singapore leaves through spine2.ams and circuit 2, and traffic is flowing again.`,
    "fib",
  );

  clearNode(fab, L1);
  clearNode(fab, S1A);
  clearNode(fab, S1S);
  fab.set({ "cut to recovery": `${num(TOT)} ms`, "of which detection": `${num(DET)} ms`, "lost on circuit 1": `≈ ${gb(TOT)} GB` });
  fab.note(
    `In total about ${num(TOT)} ms from cut to recovered traffic, ${num(DET)} ms of it detection, and at 40 Gb/s about ${gb(TOT)} GB of packets lost on circuit 1. TCP retransmits them and connections survive, but the affected flows stall for at least that long, and longer where TCP's retransmission timer has backed off, which latency-sensitive services notice.`,
    "recovered",
  );

  const TOT2 = HOLD + REST;
  fab.table(0, { title: T1, head: ["step", "takes", "time since cut"], rows: rows.map((r) => [...r]), tones: rows.map((_, i) => (i === rows.length - 1 ? "done" : undefined)) });
  fab.table(1, {
    title: "Timeline without BFD (IS-IS hold timer)",
    head: ["step", "takes", "time since cut"],
    rows: [
      ["IS-IS hold timer expires (10 s hellos × 3)", "30,000 ms", "30,000 ms"],
      ["LSP wait, flood, SPF, FIB (as before)", `${REST} ms`, `${num(TOT2)} ms`],
    ],
    tones: [undefined, "danger"],
  });
  fab.set({ "without BFD": `${num(TOT2)} ms, ≈ ${gb(TOT2)} GB lost`, "1 s hellos (3 s hold)": `${num(3000 + REST)} ms` });
  const ratio = 3000 / DET;
  fab.note(
    `Without BFD the only detector is IS-IS itself: with the common default of 10-second hellos and multiplier 3, the adjacency dies when its 30-second hold timer runs out, up to 30 s after the cut, and the remaining steps add the same ${REST} ms, about ${(TOT2 / 1000).toFixed(1)} s and ${gb(TOT2)} GB lost. Even hellos tuned to 1 second, a 3-second hold, ${ratio > 1.05 ? `are ${+ratio.toFixed(1)} times slower than BFD at ${I} ms × ${M}` : `are no faster than BFD at ${I} ms × ${M}, which is why such slow BFD timers are rare`}.`,
    "no-bfd",
  );

  fab.note(
    `BFD exists for failures the port cannot see, like this one: had the fibre run straight between the two spines, loss of light would have taken the port down within a few milliseconds without it. Timers much below 100 ms × 3 usually need BFD to run in the line card or ASIC rather than on the CPU, or a busy control plane misses its own packets and declares a healthy link dead.`,
    "done",
  );
  return fab.f.done();
};

// ---------- isis-purge-storm ----------

const isoTime = (sec: number): string => new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 19);

/**
 * `isis-purge-storm` (lesson 03-05, case study). The small Amsterdam underlay
 * (two spines, four leaves, IS-IS area 49.0001), with switches recently moved
 * to take NTP time through the fabric instead of over the out-of-band network.
 * leaf4.ams reboots with its clock at 2000-01-01; its NOS stores each LSP's
 * expiry as a wall-clock time (receipt plus remaining lifetime). NTP then
 * steps its clock forward to 2026-10-31, every stored expiry is 26 years in
 * the past, and it purges the five LSPs it did not originate (lifetime 0,
 * body removed, purge-originator TLV naming leaf4). The purges flood, SPF
 * finds almost nothing, and the overlay falls with the underlay; each
 * originator re-issues its LSP with a higher sequence number, the topology
 * returns, and the notes end on the fixes and the signals.
 *
 * Inputs: none. 13 frames.
 */
export const isisPurgeStorm: FabGen = () => {
  const BAD = "leaf4.ams";
  const S1 = "spine1.ams";
  const L1 = "leaf1.ams";
  const NTP = "ntp";
  const routers = [...AMS_SPINES2, ...AMS_LEAVES4] as string[];
  const fab = smallAms([{ id: NTP, label: "NTP server", kind: "server", x: 12.5, y: 100 }], [[NTP, L1]]);
  const BOOT = Date.UTC(2000, 0, 1, 0, 0, 0) / 1000;
  const ADJ = BOOT + 41;
  const NTP_AT = BOOT + 52;
  const REAL = Date.UTC(2026, 9, 31, 9, 0, 52) / 1000;
  const STEP = REAL - NTP_AT;
  const RL: Record<string, number> = { "spine1.ams": 1043, "spine2.ams": 611, "leaf1.ams": 878, "leaf2.ams": 1150, "leaf3.ams": 402, "leaf4.ams": 1200 };
  const seq: Record<string, number> = { ...SEQ0, [BAD]: SEQ0[BAD]! + 1 };
  const others = routers.filter((r) => r !== BAD);
  let now = BOOT;
  const status: Record<string, string> = {};
  const expires: Record<string, number> = {};
  const lsdb = (title = `${BAD} LSDB (its clock: ${isoTime(now)})`) =>
    fab.table(1, {
      title,
      head: ["LSP", "seq", "expires at (wall clock)", "status"],
      rows: routers.filter((r) => expires[r] !== undefined).map((r) => [`${r}.00-00`, seqShort(seq[r]!), isoTime(expires[r]!), status[r] ?? "valid"]),
      tones: routers.filter((r) => expires[r] !== undefined).map((r) => (status[r] === "EXPIRED" || status[r] === "purged" ? "danger" : status[r] === "re-issued" ? "done" : undefined)),
    });
  const reach = (n: Record<string, number>) => fab.table(0, { title: "loopbacks each router can reach (SPF)", head: ["router", "reachable"], rows: routers.map((r) => [r, `${n[r]} of 5`]), tones: routers.map((r) => (n[r]! < 5 ? "danger" : undefined)) });
  const all5 = Object.fromEntries(routers.map((r) => [r, 5]));

  reach(all5);
  fab.set({ area: "49.0001", "time source": "NTP through the fabric (was: out-of-band)" });
  fab.note(
    `Meridian's Amsterdam underlay, small example: two spines and four leaves in IS-IS area 49.0001, every router reaching the other five loopbacks. Since a recent change the switches take their time from an NTP server reached through the fabric itself, behind leaf1.ams, instead of over the out-of-band management network, 172.16.0.0/16.`,
    "topology",
  );

  for (const s of AMS_SPINES2) fab.down(BAD, s);
  reach(Object.fromEntries(routers.map((r) => [r, r === BAD ? 0 : 4])));
  fab.state(BAD, isoTime(now).slice(0, 10), "compare");
  fab.set({ [`${BAD} clock`]: isoTime(now) });
  fab.note(
    `leaf4.ams reboots after a software upgrade, so for now the other five routers reach only four loopbacks each. Its hardware clock, which has lost its setting, starts at 2000-01-01 00:00:00; nothing checks the clock before routing starts, and IS-IS itself works perfectly well in the year 2000.`,
    "boot",
  );

  now = ADJ;
  for (const s of AMS_SPINES2) fab.up(BAD, s);
  for (const r of routers) expires[r] = ADJ + RL[r]!;
  reach(all5);
  fab.set({ [`${BAD} clock`]: isoTime(now) });
  lsdb();
  fab.note(
    `41 seconds after boot leaf4.ams's adjacencies to both spines come up, every router reaches all five loopbacks again, and after the CSNP exchange the spines send leaf4 the other five LSPs. This network operating system records each LSP's expiry as a wall-clock time, receipt time plus remaining lifetime, so spine1's LSP with 1,043 s left "expires at ${isoTime(expires[S1]!)}".`,
    "sync",
  );

  now = NTP_AT;
  fab.set({ [`${BAD} clock`]: isoTime(now) });
  fab.path([BAD, S1, L1, NTP]);
  fab.send(
    BAD,
    S1,
    "NTP query (UDP 123)",
    `With the underlay up, leaf4.ams can finally reach its NTP server through spine1.ams and leaf1.ams, and sends a query on UDP port 123. Time now depends on the network, and, as the next frames show, the network depends on time.`,
    { tag: "ntp" },
  );

  now = REAL;
  fab.clearPath();
  for (const r of others) status[r] = "EXPIRED";
  seq[BAD] = seq[BAD]! + 1;
  expires[BAD] = REAL + 1200;
  status[BAD] = "own: re-originated";
  fab.state(BAD, isoTime(now).slice(0, 10), "danger");
  fab.set({ [`${BAD} clock`]: isoTime(now), "clock step": `+${num(STEP)} s (about 26 years 10 months)` });
  lsdb();
  fab.note(
    `The reply says it is ${isoTime(REAL)}, and leaf4.ams steps its clock forward by ${num(STEP)} seconds, about 26 years 10 months, in one jump, as NTP clients are commonly allowed to do at boot. Every expiry time it stored is now 26 years in the past.`,
    "step",
  );

  for (const r of others) status[r] = "purged";
  lsdb();
  fab.headers(
    [
      { name: "IS-IS L2 LSP header", size: 27, tone: "danger", reader: "every router in the area", fields: { "LSP ID": lspId(S1), sequence: seqHex(seq[S1]!), "remaining lifetime": "0 s (purge)" }, highlight: ["remaining lifetime"] },
      { name: "TLV 13 purge originator", size: 9, tone: "danger", reader: "operators, afterwards", fields: { "purged by": `${systemId(BAD)} (${BAD})` } },
      { name: "topology TLVs", fields: { "TLV 22, TLV 135": "removed: a purge carries no topology" } },
    ],
    `one of five purges built by ${BAD}`,
  );
  fab.note(
    `leaf4.ams's aging check concludes that all five LSPs it did not originate have expired (its own it simply re-originates), so it purges each one: it floods the LSP with its sequence number unchanged, a remaining lifetime of 0 and every topology TLV removed. Each purge carries a purge-originator TLV (RFC 6232) with leaf4's system ID, ${systemId(BAD)}, the only clue to where the purges came from.`,
    "purge",
  );

  fab.packets(
    AMS_SPINES2.map((s) => ({ from: BAD, to: s, label: "5 purges", tone: "danger" as const })),
    `The five purges flood to spine1.ams and spine2.ams. A purge beats a stored copy with the same sequence number, so each spine replaces the other routers' LSPs with the purges, removes them from SPF and floods the purges on, exactly as if those routers had really vanished; the one purge a spine refuses is the purge of its own LSP, as a later frame shows.`,
    "flood-purge",
  );

  const vanished = Object.fromEntries(routers.map((r) => [r, r.startsWith("spine") ? 1 : 0]));
  reach(vanished);
  for (const r of routers) fab.tone(r, "danger");
  fab.headers(undefined);
  fab.packets(
    ["leaf1.ams", "leaf2.ams", "leaf3.ams"].flatMap((l, i) => [{ from: AMS_SPINES2[i % 2]!, to: l, label: "purges", tone: "danger" as const }]),
    `Within milliseconds every router has accepted purges for every other router's LSP except leaf4's, and SPF, which uses a link only when both ends' LSPs describe it, finds almost nothing: each spine can still reach its direct neighbour leaf4.ams, and the leaves reach nothing at all. The topology has vanished from every database at once, though every link and adjacency is still up.`,
    "vanished",
  );

  fab.set({ "EVPN next hops": "unresolvable", "tenant traffic": "stopped site-wide" });
  fab.note(
    `Everything above the underlay falls with it: BGP's next-hop tracking marks every EVPN route whose next-hop loopback is no longer reachable as unusable, the VXLAN tunnels between leaves are removed, and tenant traffic stops across the whole site. The iBGP sessions to the route reflectors, which run between loopbacks, start counting down their hold timers.`,
    "overlay",
  );

  for (const r of others) {
    seq[r] = seq[r]! + 1;
    status[r] = "re-issued";
    expires[r] = REAL + 1 + 1200;
  }
  fab.packets(
    others.map((r) => ({ from: r, to: r.startsWith("spine") ? BAD : AMS_SPINES2[0]!, label: `LSP ${seqShort(seq[r]!)}`, tone: "done" as const, progress: 0.4 })),
    `Meanwhile each router that received a purge of its own LSP, one it knows is still valid, re-issues it at once with a higher sequence number and a fresh 1,200-second lifetime: spine1.ams ${seqShort(seq["spine1.ams"]!)}, spine2.ams ${seqShort(seq["spine2.ams"]!)}, leaf1.ams ${seqShort(seq["leaf1.ams"]!)}, leaf2.ams ${seqShort(seq["leaf2.ams"]!)}, leaf3.ams ${seqShort(seq["leaf3.ams"]!)}. These new copies flood everywhere and replace the purges.`,
    "reissue",
  );

  now = REAL + 1;
  lsdb();
  reach(all5);
  for (const r of routers) fab.tone(r, undefined);
  clearNode(fab, BAD);
  fab.set({ [`${BAD} clock`]: isoTime(now) });
  fab.unset("EVPN next hops");
  fab.note(
    `leaf4.ams stores the new copies with expiry times computed from its now-correct clock, so it has no reason to purge again, and SPF everywhere rebuilds the full topology. In this six-router example the gap lasts well under a second; in a real area with hundreds of routers and thousands of LSPs, flooding is paced to tens of LSPs per second per interface, so each wave of purges and replacements takes tens of seconds or more.`,
    "rebuilt",
  );

  fab.set({ "tenant traffic": "back after BGP and EVPN reconverge (minutes)" });
  fab.note(
    `IS-IS heals first, but the overlay takes longer: in a real area, where the gap outlasts the BGP hold timers (often 9 seconds in fabrics), the sessions drop and must reconnect and re-exchange every EVPN route, and MAC and ARP state must be relearned, so the outage tenants see lasts minutes. One wrong clock on one leaf took down the whole site because any IS-IS router may purge any LSP: the blast radius of a purge is the entire flooding domain, and Meridian's single level-2 domain spans all three sites.`,
    "aftermath",
  );

  fab.set({ fix: "NTP over out-of-band; LSP aging by countdown, not wall clock" });
  fab.note(
    `The fixes: take time over the out-of-band network so the clock is right before routing starts, which removes the circular dependency, and age LSPs with a countdown, as the IS-IS standard intends, rather than with wall-clock arithmetic. The signals that would have named leaf4.ams within seconds are a clock-step log message from it, a burst of purges whose originator TLV carries its system ID, and the LSP count collapsing on every router in the area at once.`,
    "lessons",
  );
  return fab.f.done();
};

export const scenarios: Record<string, FabGen> = {
  "ecmp-hash": ecmpHash,
  "elephant-collision": elephantCollision,
  "gray-failure": grayFailure,
  "site-square": siteSquare,
  "isis-flooding": isisFlooding,
  "ebgp-clos-underlay": ebgpClosUnderlay,
  "bfd-convergence": bfdConvergence,
  "isis-purge-storm": isisPurgeStorm,
};

export const labels: Record<string, string> = {
  "ecmp-hash": "ECMP: hashing the 5-tuple onto an uplink",
  "elephant-collision": "Elephant flows collide; hash polarisation",
  "gray-failure": "A gray-failing optic ECMP keeps using",
  "site-square": "Two sites, two circuits: the square",
  "isis-flooding": "IS-IS flooding, CSNP/PSNP and SPF",
  "ebgp-clos-underlay": "eBGP as the fabric underlay (RFC 7938)",
  "bfd-convergence": "Convergence timeline with and without BFD",
  "isis-purge-storm": "IS-IS purge storm from a clock jump",
};
