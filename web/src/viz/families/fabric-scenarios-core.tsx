// The three reference scenarios of the `fabric` family. They set the quality
// bar for the scenario packs: Meridian names and addresses throughout, every
// note a complete sentence a narrator can read, and the state on screen
// agreeing with the note. Read fabric-core.tsx's authoring guide first.
import {
  ANYCAST_GW_MAC,
  DISTANCE_KM,
  Fab,
  fibreMs,
  fnv32,
  HOSTS,
  int,
  ipv4Checksum,
  loopback,
  p2p,
  type FabGen,
  type HeaderSpec,
} from "./fabric-core";

// ---------- hop-by-hop ----------

/**
 * `hop-by-hop` (lesson 01-06, the packet walk). acme-web1 (10.1.1.10, behind
 * leaf1.ams) opens a TCP connection to acme-db1 (10.1.2.20, behind leaf3.ams)
 * across Meridian's Amsterdam fabric treated as plain IP routers (the VXLAN
 * overlay that really carries tenant traffic comes in module 06). The routed
 * path is leaf1.ams → spine1.ams → leaf3.ams, three routers (a leaf-spine
 * fabric has no shorter routed path between two leaves, so a title should say
 * "three routers", not two): at every router the Ethernet
 * header is replaced (new source and destination MAC), the IP addresses stay,
 * the TTL drops by one and the IPv4 header checksum is recomputed (real
 * checksum values). Tables show each router's FIB and neighbour (ARP) table.
 *
 * Inputs: none. 14 frames.
 */
export const hopByHop: FabGen = () => {
  const web = HOSTS["acme-web1"];
  const db = HOSTS["acme-db1"];
  const L1 = "leaf1.ams";
  const S1 = "spine1.ams";
  const S2 = "spine2.ams";
  const L3 = "leaf3.ams";
  const fab = new Fab(
    [
      { id: "acme-web1", kind: "host", x: 6, y: 100, state: web.ip },
      { id: L1, kind: "leaf", x: 18, y: 50 },
      { id: S1, kind: "spine", x: 36, y: 0 },
      { id: S2, kind: "spine", x: 64, y: 0, tone: "muted" },
      { id: L3, kind: "leaf", x: 82, y: 50 },
      { id: "acme-db1", kind: "host", x: 94, y: 100, state: db.ip },
    ],
    [
      ["acme-web1", L1],
      [L1, S1],
      [L1, S2, { tone: "muted" }],
      [S1, L3],
      [S2, L3, { tone: "muted" }],
      [L3, "acme-db1"],
    ],
  );
  const l1s1 = p2p(L1, S1);
  const l1s2 = p2p(L1, S2);
  const l3s1 = p2p(L3, S1);
  const l3s2 = p2p(L3, S2);
  const mac = {
    l1up: fab.portMac(L1, S1),
    s1l1: fab.portMac(S1, L1),
    s1l3: fab.portMac(S1, L3),
    l3up: fab.portMac(L3, S1),
  };
  const ip = { totalLength: 60, id: 0x3a1f, flagsFragment: 0x4000, protocol: 6, src: web.ip, dst: db.ip };
  const ipv4 = (ttl: number): HeaderSpec => ({
    name: "IPv4",
    size: 20,
    reader: "every router; only TTL and checksum change",
    fields: { src: web.ip, dst: db.ip, TTL: ttl, protocol: "6 (TCP)", "header checksum": ipv4Checksum({ ...ip, ttl }) },
  });
  const eth = (dst: string, src: string): HeaderSpec => ({ name: "Ethernet", size: 14, reader: "this link only", tone: "path", fields: { "dst MAC": dst, "src MAC": src, EtherType: "0x0800 (IPv4)" } });
  const tcp: HeaderSpec = { name: "TCP", size: 40, reader: "acme-db1 only", fields: { "src port": 51514, "dst port": 5432, flags: "SYN" } };
  const stack = (ttl: number, e?: HeaderSpec) => [...(e ? [e] : []), ipv4(ttl), tcp];

  fab.set({ path: "acme-web1 → leaf1 → spine1 → leaf3 → acme-db1", routers: 3 });
  fab.note(
    `Meridian's Amsterdam fabric, small example with two spines: acme-web1 (10.1.1.10, behind leaf1.ams) will open a TCP connection to the database acme-db1 (10.1.2.20, behind leaf3.ams). This walk treats the leaves and spines as plain IP routers; module 06 shows the VXLAN overlay Meridian actually uses for tenant traffic.`,
    "topology",
  );

  fab.table(0, { title: "acme-web1 routing table", head: ["prefix", "via", "interface"], rows: [["10.1.1.0/24", "connected", "eth0"], ["0.0.0.0/0", web.gateway, "eth0"]], tones: [undefined, "active"] });
  fab.table(1, { title: "acme-web1 ARP cache", head: ["IP", "MAC"], rows: [[web.gateway, ANYCAST_GW_MAC]], tones: ["active"] });
  fab.state("acme-web1", "route lookup", "active");
  fab.note(
    `10.1.2.20 is not inside acme-web1's own subnet 10.1.1.0/24, so its routing table sends the packet to the default gateway 10.1.1.1, whose MAC address 00:00:5e:00:01:01 is already in its ARP cache.`,
    "decide",
  );

  fab.headers(stack(64, eth(ANYCAST_GW_MAC, web.mac)), "built by acme-web1");
  fab.note(
    `acme-web1 builds the packet: a TCP header (port 51514 to PostgreSQL's 5432, SYN), an IPv4 header from 10.1.1.10 to 10.1.2.20 with TTL 64, and an Ethernet header addressed to the gateway's MAC, not to acme-db1's: a destination MAC only ever names the next device on this link.`,
    "build",
  );

  fab.state("acme-web1", web.ip, "done");
  fab.path(["acme-web1", L1]);
  fab.at(`on the link acme-web1 → ${L1}`);
  fab.send("acme-web1", L1, "TCP SYN, TTL 64", `The frame crosses the first link with destination MAC 00:00:5e:00:01:01 (the gateway) and source MAC 00:00:5e:00:53:0a (acme-web1); the IP header inside says TTL 64.`);

  // leaf1.ams
  fab.headers(stack(64), `inside ${L1}`);
  fab.state(L1, "FIB lookup", "active");
  fab.table(0, {
    title: `${L1} FIB`,
    head: ["prefix", "next hop", "out"],
    rows: [["10.1.1.0/24", "connected", "VLAN 100"], ["10.1.2.0/24", `${l1s1.spine} (spine1)`, "to spine1"], ["10.1.2.0/24", `${l1s2.spine} (spine2)`, "to spine2"]],
    tones: [undefined, "active", "muted"],
  });
  fab.table(1, { title: `${L1} neighbour (ARP) table`, head: ["IP", "MAC", "out"], rows: [[web.ip, web.mac, "VLAN 100"], [l1s1.spine, mac.s1l1, "to spine1"], [l1s2.spine, fab.portMac(S2, L1), "to spine2"]] });
  fab.note(
    `leaf1.ams accepts the frame because its destination MAC is leaf1's own gateway MAC, discards the Ethernet header and looks up 10.1.2.20 in its FIB. The longest match is 10.1.2.0/24 with two equal-cost next hops, one per spine, and the hash of this flow picks spine1.ams at 10.254.1.0.`,
    "lookup",
  );

  fab.headers(stack(63, eth(mac.s1l1, mac.l1up)), `leaving ${L1}`);
  fab.rowTone(1, 1, "active");
  fab.note(
    `leaf1.ams decrements the TTL from 64 to 63 and updates the IPv4 header checksum (${ipv4Checksum({ ...ip, ttl: 64 })} becomes ${ipv4Checksum({ ...ip, ttl: 63 })}), because the checksum covers the TTL. Its neighbour table gives spine1's MAC for 10.254.1.0, so the new Ethernet header runs from leaf1's port MAC to spine1's port MAC.`,
    "rewrite",
  );

  fab.state(L1, "TTL 64→63", "done");
  fab.path([L1, S1]);
  fab.at(`on the link ${L1} → ${S1}`);
  fab.send(L1, S1, "TCP SYN, TTL 63", `The packet crosses the leaf1–spine1 link (10.254.1.0/31) inside a brand-new Ethernet header. Source and destination IP are exactly what acme-web1 wrote.`);

  // spine1.ams
  fab.headers(stack(63), `inside ${S1}`);
  fab.state(S1, "FIB lookup", "active");
  fab.table(0, {
    title: `${S1} FIB`,
    head: ["prefix", "next hop", "out"],
    rows: [["10.1.1.0/24", `${l1s1.leaf} (leaf1)`, "to leaf1"], ["10.1.2.0/24", `${l3s1.leaf} (leaf3)`, "to leaf3"]],
    tones: [undefined, "active"],
  });
  fab.table(1, { title: `${S1} neighbour (ARP) table`, head: ["IP", "MAC", "out"], rows: [[l1s1.leaf, mac.l1up, "to leaf1"], [l3s1.leaf, mac.l3up, "to leaf3"]] });
  fab.note(
    `spine1.ams accepts the frame (its own MAC), drops the Ethernet header and looks up 10.1.2.20. A spine knows every leaf's subnets through the underlay routing protocol, and 10.1.2.0/24 has a single next hop: leaf3.ams at 10.254.1.5.`,
    "lookup",
  );

  fab.headers(stack(62, eth(mac.l3up, mac.s1l3)), `leaving ${S1}`);
  fab.rowTone(1, 1, "active");
  fab.note(
    `spine1.ams decrements the TTL to 62, updates the checksum (now ${ipv4Checksum({ ...ip, ttl: 62 })}) and writes another new Ethernet header, from its port facing leaf3 to leaf3's uplink MAC, which its neighbour table maps from 10.254.1.5.`,
    "rewrite",
  );

  fab.state(S1, "TTL 63→62", "done");
  fab.path([S1, L3]);
  fab.at(`on the link ${S1} → ${L3}`);
  fab.send(S1, L3, "TCP SYN, TTL 62", `Down to leaf3.ams over the 10.254.1.4/31 link: second router done, second Ethernet header replaced, IP addresses still untouched.`);

  // leaf3.ams
  fab.headers(stack(62), `inside ${L3}`);
  fab.state(L3, "FIB lookup", "active");
  fab.table(0, {
    title: `${L3} FIB`,
    head: ["prefix", "next hop", "out"],
    rows: [["10.1.2.0/24", "connected", "VLAN 200"], ["10.1.1.0/24", `${l3s1.spine} (spine1)`, "to spine1"], ["10.1.1.0/24", `${l3s2.spine} (spine2)`, "to spine2"]],
    tones: ["active", undefined, undefined],
  });
  fab.table(1, { title: `${L3} neighbour (ARP) table`, head: ["IP", "MAC", "out"], rows: [[db.ip, db.mac, "VLAN 200"], [l3s1.spine, mac.s1l3, "to spine1"]], tones: ["active", undefined] });
  fab.note(
    `On leaf3.ams the longest match for 10.1.2.20 is 10.1.2.0/24, directly connected on VLAN 200: this is the last router, so the next hop is the destination itself, and leaf3 already has acme-db1's MAC in its ARP table.`,
    "lookup",
  );

  fab.headers(stack(61, eth(db.mac, ANYCAST_GW_MAC)), `leaving ${L3}`);
  fab.note(
    `leaf3.ams decrements the TTL to 61, updates the checksum (${ipv4Checksum({ ...ip, ttl: 61 })}) and writes the last Ethernet header: destination acme-db1's MAC 00:00:5e:00:53:14, source the gateway MAC 00:00:5e:00:01:01 of the 10.1.2.0/24 subnet.`,
    "rewrite",
  );

  fab.state(L3, "TTL 62→61", "done");
  fab.path([L3, "acme-db1"]);
  fab.at(`on the link ${L3} → acme-db1`);
  fab.send(L3, "acme-db1", "TCP SYN, TTL 61", `The frame reaches acme-db1, which accepts it because the destination MAC is its own, the destination IP 10.1.2.20 is its own, and TCP port 5432 has a listening PostgreSQL socket.`, { tone: "done" });

  fab.state("acme-db1", "SYN received", "done");
  fab.at("as acme-db1 received it");
  fab.table(0, {
    title: "What each link carried",
    head: ["link", "dst MAC", "src MAC", "TTL"],
    rows: [
      ["web1 → leaf1", ANYCAST_GW_MAC, web.mac, "64"],
      ["leaf1 → spine1", mac.s1l1, mac.l1up, "63"],
      ["spine1 → leaf3", mac.l3up, mac.s1l3, "62"],
      ["leaf3 → db1", db.mac, ANYCAST_GW_MAC, "61"],
    ],
  });
  fab.table(1, { title: "Never changed", head: ["field", "value"], rows: [["IP src", web.ip], ["IP dst", db.ip], ["TCP ports", "51514 → 5432"]] });
  fab.set({ "changed at every router": "both MACs, TTL, IP checksum", "never changed": "IP addresses, TCP header, payload" });
  fab.note(
    `Three routers, three new Ethernet headers and a TTL three lower, while the IP addresses and TCP ports never changed. traceroute is built on exactly this: probes sent with TTL 1, 2 and 3 expire at each router in turn, and each one reports itself with an ICMP Time Exceeded message.`,
    "done",
  );
  return fab.f.done();
};

// ---------- clos-ecmp ----------

const UPLINK_GBPS = 400;
/** Offered load as a share of the full uplink capacity (62.5%: 1,000 of 1,600 Gb/s with four spines). */
const OFFERED_SHARE = 0.625;
const pct = (x: number): string => `${Math.round(x * 1000) / 10}%`;
const num = (n: number): string => n.toLocaleString("en-US");
/** "A", "A and B", "A, B and C". */
const list = (xs: string[]): string => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

interface Flow {
  name: string;
  src: string;
  dst: string;
  sport: number;
  dport: number;
}
const FLOWS: Flow[] = [
  { name: "A", src: "10.1.1.10", dst: "10.1.2.20", sport: 51517, dport: 5432 },
  { name: "B", src: "10.1.1.10", dst: "10.1.2.21", sport: 40114, dport: 443 },
  { name: "C", src: "10.1.1.12", dst: "10.1.2.20", sport: 49835, dport: 5432 },
  { name: "D", src: "10.1.1.13", dst: "10.1.2.22", sport: 60005, dport: 9092 },
  { name: "E", src: "10.1.1.12", dst: "10.1.2.21", sport: 52245, dport: 443 },
  { name: "F", src: "10.1.1.14", dst: "10.1.2.22", sport: 33029, dport: 9092 },
];
const tuple = (f: Flow) => `${f.src}:${f.sport} → ${f.dst}:${f.dport} TCP`;
const flowHash = (f: Flow) => fnv32(`${f.src}|${f.dst}|6|${f.sport}|${f.dport}`);

/**
 * `clos-ecmp` (lessons 02-01 and 02-05). Meridian's Amsterdam fabric, small
 * example: 2-4 spines and 4 leaves, every leaf linked to every spine. Leaf to
 * leaf is always two hops (up to a spine, down again) and there is one equal
 * cost path per spine; leaf1.ams installs one next hop per spine and hashes
 * each flow's 5-tuple (FNV-1a here, vendor-specific in real ASICs) modulo the
 * number of next hops to pick its spine. Six flows spread over the spines.
 *
 * Inputs: `spines` 2-4 (default 4). `variant: "spine-failure"` continues the
 * run: spine2.ams loses power, every leaf drops it from its ECMP group, flows
 * are rehashed over the survivors (with plain modulo hashing more flows move
 * than the failed spine's), and leaf1's uplink capacity falls by 1/spines
 * (chart of capacity against an offered load of 62.5% of the full uplinks).
 */
export const closEcmp: FabGen = (input) => {
  const N = int(input.spines, 2, 4, 4);
  const failure = input.variant === "spine-failure";
  const spines = Array.from({ length: N }, (_, i) => `spine${i + 1}.ams`);
  const leaves = Array.from({ length: 4 }, (_, i) => `leaf${i + 1}.ams`);
  const L1 = leaves[0]!;
  const L3 = leaves[2]!;
  const fab = new Fab(
    [
      ...spines.map((id, i) => ({ id, kind: "spine" as const, x: ((i + 0.5) * 100) / N, y: 0, state: loopback(id) })),
      ...leaves.map((id, i) => ({ id, kind: "leaf" as const, x: ((i + 0.5) * 100) / 4, y: 50, state: loopback(id) })),
      { id: "acme-l1", label: "Acme servers", kind: "server" as const, x: 12.5, y: 100, state: "10.1.1.0/24" },
      { id: "acme-l3", label: "Acme servers", kind: "server" as const, x: 62.5, y: 100, state: "10.1.2.0/24" },
    ],
    [...leaves.flatMap((l) => spines.map((s) => [l, s] as [string, string])), ["acme-l1", L1], ["acme-l3", L3]],
  );
  const capacity = (n: number) => n * UPLINK_GBPS;
  fab.set({ spines: N, leaves: 4, "fabric links": 4 * N, "leaf1 uplinks": `${N} × ${UPLINK_GBPS}G = ${capacity(N)} Gb/s` });
  fab.note(
    `Meridian's Amsterdam fabric as a small example: ${N} spines and 4 leaves (the full site has 4 spines and 16 leaves). Every leaf has exactly one link to every spine, ${4 * N} links in all, and there are no leaf-to-leaf or spine-to-spine links.`,
    "topology",
  );

  for (const s of spines) fab.path([L1, s, L3], "frontier");
  fab.tones([L1, L3], "active");
  fab.note(
    `Any leaf reaches any other leaf in exactly two hops, up to a spine and down again. From leaf1.ams to leaf3.ams there are ${N} such paths, one through each spine, all the same length, so every pair of leaves sees the same latency and the same number of paths.`,
    "paths",
  );

  const fibRows = (alive: string[]) => alive.map((s) => ["10.1.2.0/24", `${p2p(L1, s).spine} (${s.split(".")[0]})`, "20"]);
  fab.table(0, { title: `${L1} FIB: route to leaf3's subnet`, head: ["prefix", "next hop", "metric"], rows: fibRows(spines) });
  fab.set({ "ECMP paths leaf1 → leaf3": N });
  fab.note(
    `Each path costs the same in the underlay (two links of IS-IS metric 10), so leaf1.ams installs ${N === 2 ? "both" : `all ${N}`} next hops for 10.1.2.0/24 at once. This is equal-cost multipath, ECMP: the FIB holds a group of ${N} next hops instead of one.`,
    "ecmp",
  );

  // Hash each flow onto a spine.
  const assign = (alive: string[]) => Object.fromEntries(FLOWS.map((f) => [f.name, alive[flowHash(f) % alive.length]!])) as Record<string, string>;
  const before = assign(spines);
  const flowTable = (alive: string[], chosen: Record<string, string>, upto: number) =>
    FLOWS.slice(0, upto).map((f) => [f.name, tuple(f), `${flowHash(f).toString(16).padStart(8, "0")} mod ${alive.length} = ${flowHash(f) % alive.length}`, chosen[f.name]!.split(".")[0]!]);
  const load = (chosen: Record<string, string>, upto: number) => {
    const counts: Record<string, number> = Object.fromEntries(spines.map((s) => [s, 0]));
    for (const f of FLOWS.slice(0, upto)) counts[chosen[f.name]!]!++;
    return counts;
  };
  const perSpine = (chosen: Record<string, string>, among: string[]) => {
    const c = load(chosen, FLOWS.length);
    return among.map((s) => `${s.split(".")[0]} ${c[s]}`).join(" · ");
  };
  const drawLoad = (chosen: Record<string, string>, upto: number) => {
    const c = load(chosen, upto);
    for (const s of spines) {
      const l = fab.linkOf(L1, s)!;
      if (l.down) continue;
      fab.linkSet(L1, s, { width: c[s]! / 4, label: c[s] ? `${c[s]} flow${c[s] === 1 ? "" : "s"}` : undefined, labelAt: 0.8 });
      fab.linkSet(s, L3, { width: c[s]! / 4 });
    }
  };
  fab.clearPath();
  fab.tones([L1, L3], undefined);
  const first = FLOWS[0]!;
  const firstSpine = before[first.name]!;
  fab.table(1, { title: "flows hashed by leaf1.ams", head: ["flow", "5-tuple", "hash mod n", "spine"], rows: flowTable(spines, before, 1), tones: ["active"] });
  fab.rowTone(0, (r) => r[1]!.endsWith(`(${firstSpine.split(".")[0]})`), "active");
  fab.path(["acme-l1", L1, firstSpine, L3, "acme-l3"]);
  fab.send(
    L1,
    firstSpine,
    `flow A → ${firstSpine.split(".")[0]}`,
    `Flow A (${tuple(first)}) arrives at leaf1.ams. Its forwarding chip (the ASIC) hashes the 5-tuple, takes the result modulo ${N}, gets ${flowHash(first) % N} and so sends it up to ${firstSpine}; every later packet of flow A hashes the same way and takes the same path, which keeps the flow in order.`,
  );
  fab.send(firstSpine, L3, `flow A → ${L3.split(".")[0]}`, `${firstSpine} has a single route to 10.1.2.0/24, via leaf3.ams, so the second hop has no choice to make: flow A is delivered in two hops.`);

  for (let k = 1; k < FLOWS.length; k++) {
    const f = FLOWS[k]!;
    const s = before[f.name]!;
    fab.clearPath();
    fab.path([L1, s, L3]);
    fab.table(1, { title: "flows hashed by leaf1.ams", head: ["flow", "5-tuple", "hash mod n", "spine"], rows: flowTable(spines, before, k + 1), tones: [...Array(k).fill(undefined), "active"] });
    fab.rowTone(0, () => true, undefined);
    fab.rowTone(0, (r) => r[1]!.endsWith(`(${s.split(".")[0]})`), "active");
    drawLoad(before, k + 1);
    const same = FLOWS.slice(0, k).filter((g) => before[g.name] === s).map((g) => g.name);
    fab.send(
      L1,
      s,
      `flow ${f.name} → ${s.split(".")[0]}`,
      k === 1
        ? `Flow ${f.name} differs from flow A in its destination address and ports, so its hash is unrelated: ${flowHash(f).toString(16).padStart(8, "0")} modulo ${N} is ${flowHash(f) % N}, which picks ${s}.`
        : `Flow ${f.name} hashes to ${flowHash(f) % N} and goes up to ${s}${same.length ? `, which already carries flow${same.length > 1 ? "s" : ""} ${same.join(" and ")}: the hash spreads flows, not bytes, and never looks at how busy a spine is` : ", the first flow on that spine"}.`,
      { tag: "hash" },
    );
  }

  fab.clearPath();
  fab.rowTone(0, () => true, undefined);
  fab.table(1, { title: "flows hashed by leaf1.ams", head: ["flow", "5-tuple", "hash mod n", "spine"], rows: flowTable(spines, before, FLOWS.length) });
  drawLoad(before, FLOWS.length);
  const c0 = load(before, FLOWS.length);
  const spread = spines.map((s) => c0[s]).join(" / ");
  fab.set({ "flows per spine": perSpine(before, spines) });
  fab.packets(
    FLOWS.map((f, i) => ({ from: L1, to: before[f.name]!, label: f.name, progress: 0.3 + 0.1 * (i % 4), tone: "active" })),
    `All six flows together: leaf1.ams spreads them ${spread} over spine1 to spine${N}. Each flow stays pinned to one spine, so with few flows the split is lumpy; with thousands of flows of similar size it evens out, which is the bet ECMP makes (lesson 02-02 shows when it loses).`,
    "spread",
  );

  if (!failure) {
    fab.set({ "uplink capacity": `${capacity(N)} Gb/s` });
    fab.note(
      `leaf1.ams's ${N} uplinks of ${UPLINK_GBPS} Gb/s give it ${num(capacity(N))} Gb/s towards the spines, and each spine carries about 1/${N} of its traffic. Adding a spine adds a path and capacity without redesigning anything, and losing one costs 1/${N} of the capacity rather than connectivity.`,
      "done",
    );
    return fab.f.done();
  }

  // ----- variant: spine-failure -----
  const dead = "spine2.ams";
  const alive = spines.filter((s) => s !== dead);
  const offered = capacity(N) * OFFERED_SHARE;
  fab.chart({ title: "leaf1.ams uplink capacity vs offered load", unit: "Gb/s", yMax: capacity(N) * 1.125, xLabel: "time", series: [{ name: "capacity", tone: "done", points: [capacity(N), capacity(N)] }, { name: "offered load", tone: "compare", points: [offered, offered] }] });
  fab.set({ "uplink capacity": `${capacity(N)} Gb/s`, "offered load": `${offered} Gb/s`, utilisation: pct(offered / capacity(N)) });
  fab.note(
    `Before any failure, leaf1.ams sends ${num(offered)} Gb/s towards the spines over ${num(capacity(N))} Gb/s of uplink: ${pct(offered / capacity(N))} utilisation, spread over ${N === 2 ? "both spines" : `all ${N} spines`}.`,
    "steady",
  );

  fab.state(dead, "no power", "danger");
  for (const l of leaves) fab.down(l, dead);
  fab.note(
    `spine2.ams loses power and every leaf's link to it goes dark at once. Each leaf sees loss of signal on its own port within milliseconds and can take that next hop out of its ECMP group locally, before any routing protocol message arrives (a spine that stays powered but stops forwarding is harder to spot: lesson 03-04's BFD catches it).`,
    "fail",
  );

  fab.table(0, { title: `${L1} FIB: route to leaf3's subnet`, head: ["prefix", "next hop", "metric"], rows: fibRows(alive) });
  fab.set({ "ECMP paths leaf1 → leaf3": N - 1 });
  fab.note(
    N - 1 === 1
      ? `The ECMP group for 10.1.2.0/24 shrinks from 2 next hops to 1: every leaf still reaches every other leaf in two hops, but only through spine1.ams, so there is no redundancy left until spine2 returns.`
      : `The ECMP group for 10.1.2.0/24 shrinks from ${N} next hops to ${N - 1}: every leaf still reaches every other leaf in two hops, through the ${N - 1} spines that remain.`,
    "ecmp",
  );

  const after = assign(alive);
  const moved = FLOWS.filter((f) => before[f.name] !== after[f.name]).map((f) => f.name);
  const orphaned = FLOWS.filter((f) => before[f.name] === dead).map((f) => f.name);
  const extra = moved.filter((m) => !orphaned.includes(m));
  fab.table(1, {
    title: "flows rehashed over the survivors",
    head: ["flow", "before", "hash mod n", "after"],
    rows: FLOWS.map((f) => [f.name, before[f.name]!.split(".")[0]!, `${flowHash(f).toString(16).padStart(8, "0")} mod ${alive.length} = ${flowHash(f) % alive.length}`, after[f.name]!.split(".")[0]!]),
    tones: FLOWS.map((f) => (before[f.name] === dead ? "danger" : before[f.name] !== after[f.name] ? "compare" : undefined)),
  });
  drawLoad(after, FLOWS.length);
  fab.set({ "flows per spine": perSpine(after, alive), "flows moved": moved.length ? moved.join(", ") : "none" });
  const plural = (xs: string[]) => (xs.length > 1 ? "s" : "");
  fab.packets(
    FLOWS.map((f, i) => ({ from: L1, to: after[f.name]!, label: f.name, progress: 0.3 + 0.1 * (i % 4), tone: before[f.name] === after[f.name] ? "active" : "compare" })),
    `${N - 1 === 1 ? "With one next hop left, every flow now hashes to spine1.ams. " : `Flows are rehashed modulo ${N - 1}. `}${orphaned.length ? `Flow${plural(orphaned)} ${list(orphaned)} had to move because ${orphaned.length > 1 ? "they were" : "it was"} on spine2` : "No flow was on spine2"}${extra.length ? `, but plain modulo hashing also moved flow${plural(extra)} ${list(extra)}, which ${extra.length > 1 ? "were" : "was"} on a healthy spine; resilient hashing (lesson 02-02) avoids that` : ""}. Packets that were in flight on spine2, or sent to it before the leaf noticed, are lost and TCP retransmits them${extra.length ? "; a flow moved between healthy spines may see a few packets out of order" : ""}. No connection breaks.`,
    "rehash",
  );

  const util = offered / capacity(N - 1);
  fab.point({ capacity: capacity(N - 1), "offered load": offered });
  fab.point({ capacity: capacity(N - 1), "offered load": offered });
  fab.set({ "leaf1 uplinks": `${N - 1} × ${UPLINK_GBPS}G = ${capacity(N - 1)} Gb/s (spine2 down)`, "uplink capacity": `${capacity(N - 1)} Gb/s`, utilisation: pct(util) });
  fab.note(
    `leaf1.ams now has ${N - 1} × ${UPLINK_GBPS} Gb/s = ${num(capacity(N - 1))} Gb/s of uplink: losing one spine cost 1/${N} of the capacity, not the fabric. The same ${num(offered)} Gb/s now runs at ${pct(util)} utilisation${util > 1 ? ", more than the uplinks can carry, so queues fill and packets are dropped" : util >= 0.8 ? ", close enough to full that bursts will queue" : ""}; lesson 02-05 sizes headroom so the fabric survives losing a spine.`,
    "capacity",
  );

  fab.note(
    `When spine2.ams is repaired, its links come back, each leaf adds it to the ECMP group again and flows rehash modulo ${N}. For planned work the safe way to take a spine out is to drain it first so traffic moves off gradually (lesson 08-06), rather than letting it fail like this.`,
    "done",
  );
  return fab.f.done();
};

// ---------- vxlan-encap ----------

/**
 * `vxlan-encap` (lessons 06-02 and 06-01). acme-web1 (10.1.1.10, leaf1.ams)
 * sends to acme-web2 (10.1.1.11, leaf2.sin): the same Acme subnet, VLAN 100,
 * L2VNI 10100, in two sites. leaf1.ams (VTEP 10.255.1.11) finds acme-web2's
 * MAC behind VTEP 10.255.2.12 (learned by EVPN), then adds VXLAN (VNI 10100),
 * outer UDP (destination 4789, source port from a hash of the inner headers),
 * outer IPv4 between the loopbacks and outer Ethernet: 50 bytes. spine1.ams
 * and spine1.sin route on the outer IPv4 only (outer TTL 64 → 63 → 62, outer
 * MACs rewritten, inner frame untouched) across the ams-sin circuit; leaf2.sin
 * decapsulates and bridges the original frame to acme-web2. Small example:
 * two spines per site, the two that carry the long-haul circuits.
 *
 * Inputs: none. 16 frames.
 */
export const vxlanEncap: FabGen = () => {
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
  const ms = fibreMs(DISTANCE_KM["ams-sin"]);
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
      [L1, S1A],
      [L1, S2A, { tone: "muted" }],
      [S1A, S1S, { label: `${DISTANCE_KM["ams-sin"].toLocaleString("en-US")} km` }],
      [S2A, S2S, { tone: "muted" }],
      [S1S, L2],
      [S2S, L2, { tone: "muted" }],
      [L2, "acme-web2"],
    ],
    { height: 300 },
  );
  const outerSport = 49152 + (fnv32(`${a.ip}|${b.ip}|6|40112|443`) % 16384);
  const inner: HeaderSpec[] = [
    { name: "Ethernet", size: 14, reader: "acme-web2 (carried untouched)", fields: { "dst MAC": b.mac, "src MAC": a.mac, EtherType: "0x0800 (IPv4)" } },
    { name: "IPv4", size: 20, reader: "acme-web2 (carried untouched)", fields: { src: a.ip, dst: b.ip, TTL: 64, protocol: "6 (TCP)", "total length": 1500 } },
    { name: "TCP", size: "20 B + 1,460 B data", reader: "acme-web2 (carried untouched)", fields: { "src port": 40112, "dst port": 443, flags: "ACK PSH" } },
  ];
  const vxlan: HeaderSpec = { name: "VXLAN", size: 8, tone: "path", reader: "only the egress VTEP", fields: { flags: "0x08 (VNI valid)", VNI: b.vni, reserved: 0 }, highlight: ["VNI"] };
  const udp: HeaderSpec = { name: "Outer UDP", size: 8, tone: "path", reader: "egress VTEP (port), ECMP hashes (src port)", fields: { "src port": outerSport, "dst port": 4789, checksum: "0 (unused)" } };
  const outerIp = (ttl: number): HeaderSpec => ({ name: "Outer IPv4", size: 20, tone: "path", reader: "every underlay router", fields: { src: vtepA, dst: vtepB, TTL: ttl, protocol: "17 (UDP)", "total length": 1550 } });
  const outerEth = (dst: string, src: string): HeaderSpec => ({ name: "Outer Ethernet", size: 14, tone: "path", reader: "this link only", fields: { "dst MAC": dst, "src MAC": src, EtherType: "0x0800 (IPv4)" } });

  fab.set({ tenant: "Acme, VLAN 100, VNI 10100", subnet: "10.1.1.0/24 in both sites" });
  fab.note(
    `acme-web1 in Amsterdam and acme-web2 in Singapore are in the same Acme subnet, 10.1.1.0/24, on VLAN 100, which Meridian carries as VXLAN segment VNI 10100. They expect to share one Ethernet segment, but between them is a routed underlay: leaf1.ams, two spines, the ${DISTANCE_KM["ams-sin"].toLocaleString("en-US")} km circuit, and leaf2.sin (small example, two spines per site).`,
    "topology",
  );

  fab.headers(inner, "built by acme-web1");
  fab.state("acme-web1", "sending", "active");
  fab.note(
    `acme-web1 sends an ordinary Ethernet frame: destination MAC 00:00:5e:00:53:0b (acme-web2, same subnet, so no router is involved and the TTL stays 64), carrying an IPv4 packet of 1,500 bytes with a TCP segment for port 443. It has no idea any tunnel exists.`,
    "build",
  );

  fab.state("acme-web1", a.ip, "done");
  fab.path(["acme-web1", L1]);
  fab.at(`on the link acme-web1 → ${L1}`);
  fab.send("acme-web1", L1, "frame to 00:00:5e:00:53:0b", `The frame enters leaf1.ams on an access port in VLAN 100, untagged, exactly as it would enter any switch.`);

  fab.state(L1, "MAC lookup", "active");
  fab.at(`inside ${L1}`);
  fab.table(0, {
    title: `${L1} MAC table, VLAN 100 = VNI 10100`,
    head: ["MAC", "where", "learned"],
    rows: [[a.mac, "port to acme-web1", "locally"], [b.mac, `VTEP ${vtepB} (leaf2.sin)`, "EVPN type-2 route"]],
    tones: [undefined, "active"],
  });
  fab.note(
    `leaf1.ams maps VLAN 100 on this port to VNI 10100 and looks up the destination MAC in that segment's table: 00:00:5e:00:53:0b lives behind the remote VTEP 10.255.2.12, leaf2.sin's loopback, learned from a BGP EVPN type-2 route (lesson 06-03). So the frame must be tunnelled, not switched out of a local port.`,
    "lookup",
  );

  fab.pushHeader(vxlan);
  fab.set({ overhead: "8 B" });
  fab.note(
    `Encapsulation starts from the inside. leaf1.ams puts an 8-byte VXLAN header in front of the original frame: a flags byte saying the VNI is valid, and the 24-bit VNI 10100 that tells the far end which tenant segment this frame belongs to.`,
    "encap",
  );

  fab.pushHeader(udp);
  fab.set({ overhead: "16 B" });
  fab.note(
    `Next an 8-byte UDP header: destination port 4789, the IANA port for VXLAN, and source port ${outerSport}, computed from a hash of the inner headers. Different inner flows get different source ports, which gives the underlay's ECMP hash something to spread on, while one flow keeps one port and one path.`,
    "encap",
  );

  fab.pushHeader(outerIp(64));
  fab.set({ overhead: "36 B" });
  fab.table(1, { title: `${L1} underlay route`, head: ["prefix", "next hop", "via"], rows: [[`${vtepB}/32`, "spine1.ams", "IS-IS"], [`${vtepB}/32`, "spine2.ams", "IS-IS"]], tones: ["active", undefined] });
  fab.note(
    `Then a 20-byte outer IPv4 header from VTEP 10.255.1.11 to VTEP 10.255.2.12, protocol UDP, TTL 64, total length 1,550. The underlay route to 10.255.2.12/32 has two equal-cost next hops, and the hash of the outer headers, source port ${outerSport} included, picks spine1.ams.`,
    "encap",
  );

  fab.pushHeader(outerEth(fab.portMac(S1A, L1), fab.portMac(L1, S1A)));
  fab.set({ overhead: "50 B", "underlay IP MTU needed": "≥ 1,550 B (Meridian runs 9,216)" });
  fab.note(
    `Last, a 14-byte outer Ethernet header to spine1.ams's port MAC. Four headers, 14 + 20 + 8 + 8 = 50 bytes, now wrap the original frame, so a 1,500-byte inner packet needs an underlay IP MTU of at least 1,550 bytes; that is why fabrics run jumbo MTUs (Meridian uses 9,216).`,
    "encap",
  );

  fab.state(L1, "encapsulated", "done");
  fab.clearRowTones(0);
  fab.path([L1, S1A]);
  fab.at(`on the link ${L1} → ${S1A}`);
  fab.send(L1, S1A, `UDP 4789 to ${vtepB}`, `The tunnelled packet leaves leaf1.ams. To the underlay it is just a UDP packet from 10.255.1.11 to 10.255.2.12; the tenant's frame is payload.`);

  fab.state(S1A, "outer IP only", "active");
  fab.headers([outerEth(fab.portMac(S1S, S1A), fab.portMac(S1A, S1S)), outerIp(63), udp, vxlan, ...inner], `leaving ${S1A}`);
  fab.table(0, { title: `${S1A} routing table`, head: ["prefix", "next hop"], rows: [[`${vtepA}/32`, L1], [`${vtepB}/32`, `${S1S} (long-haul)`]], tones: [undefined, "active"] });
  fab.table(1, { title: `What ${S1A} knows about VNI 10100`, head: ["MACs", "tenant routes"], rows: [["none", "none"]] });
  fab.note(
    `spine1.ams reads only the outer IPv4 destination, 10.255.2.12, and routes it towards spine1.sin over the long-haul circuit: it decrements the outer TTL to 63 and rewrites the outer MACs. It holds no MAC table for VNI 10100 and no Acme routes; the inner frame passes through unread.`,
    "underlay",
  );

  fab.state(S1A, "outer IP only", "done");
  fab.path([S1A, S1S]);
  fab.at(`on the link ${S1A} → ${S1S}`);
  fab.send(S1A, S1S, `UDP 4789 to ${vtepB}`, `Across the Amsterdam–Singapore circuit: about ${DISTANCE_KM["ams-sin"].toLocaleString("en-US")} km of fibre at roughly 5 microseconds per km, so about ${ms.toFixed(1)} ms one way, far more than all the switches on the path add together.`);

  fab.state(S1S, "outer IP only", "active");
  fab.headers([outerEth(fab.portMac(L2, S1S), fab.portMac(S1S, L2)), outerIp(62), udp, vxlan, ...inner], `leaving ${S1S}`);
  fab.table(0, { title: `${S1S} routing table`, head: ["prefix", "next hop"], rows: [[`${vtepA}/32`, `${S1A} (long-haul)`], [`${vtepB}/32`, L2]], tones: [undefined, "active"] });
  fab.table(1, { title: `What ${S1S} knows about VNI 10100`, head: ["MACs", "tenant routes"], rows: [["none", "none"]] });
  fab.note(`spine1.sin does the same: outer destination 10.255.2.12 is leaf2.sin's loopback, one hop down. Outer TTL becomes 62, the outer MACs are rewritten again, and the VXLAN header and inner frame are exactly the bytes leaf1.ams wrote.`, "underlay");

  fab.state(S1S, "outer IP only", "done");
  fab.path([S1S, L2]);
  fab.at(`on the link ${S1S} → ${L2}`);
  fab.send(S1S, L2, `UDP 4789 to ${vtepB}`, `Down the last underlay link to leaf2.sin, the egress VTEP, which owns the outer destination address 10.255.2.12.`);

  fab.state(L2, "decapsulate", "active");
  fab.headers(inner, `inside ${L2}, after decapsulation`);
  fab.table(0, {
    title: `${L2} MAC table, VNI 10100 = VLAN 100`,
    head: ["MAC", "where", "learned"],
    rows: [[b.mac, "port to acme-web2", "locally"], [a.mac, `VTEP ${vtepA} (leaf1.ams)`, "EVPN type-2 route"]],
    tones: ["active", undefined],
  });
  fab.table(1, { title: `${L2} checks`, head: ["header", "check"], rows: [["Outer IPv4", `dst ${vtepB} is my VTEP`], ["Outer UDP", "dst port 4789 = VXLAN"], ["VXLAN", "VNI 10100 = Acme VLAN 100"]] });
  fab.set({ overhead: "0 B (removed)" });
  fab.note(
    `leaf2.sin sees its own VTEP address as the outer destination and UDP port 4789, reads VNI 10100, maps it to its local Acme VLAN 100 and strips all 50 bytes of outer headers. The original frame comes out, and its destination MAC is on a local port.`,
    "decap",
  );

  fab.state(L2, vtepB, "done");
  fab.path([L2, "acme-web2"]);
  fab.at(`on the link ${L2} → acme-web2`);
  fab.send(L2, "acme-web2", "frame to 00:00:5e:00:53:0b", `leaf2.sin switches the frame out of acme-web2's port, still untagged, still with acme-web1's source MAC and TTL 64.`, { tone: "done" });

  fab.state("acme-web2", "received", "done");
  fab.at("as acme-web2 received it, identical to what acme-web1 sent");
  fab.set({ "inner frame changed": "never", "outer TTL": "64 → 62 (two underlay routers)", "added then removed": "50 B" });
  fab.note(
    `acme-web2 receives byte for byte the frame acme-web1 sent, as if both sat on one switch. The two spines routed on the outer header only and never needed to know that Acme, VLAN 100 or VNI 10100 exist; that separation is what lets one routed fabric carry thousands of tenant segments.`,
    "done",
  );
  return fab.f.done();
};

export const coreScenarios: Record<string, FabGen> = {
  "hop-by-hop": hopByHop,
  "clos-ecmp": closEcmp,
  "vxlan-encap": vxlanEncap,
};

export const coreLabels: Record<string, string> = {
  "hop-by-hop": "Hop by hop: MACs rewritten, IP kept, TTL decremented",
  "clos-ecmp": "Leaf-spine Clos and ECMP",
  "vxlan-encap": "VXLAN encapsulation across the fabric",
};
