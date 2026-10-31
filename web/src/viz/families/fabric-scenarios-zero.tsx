// Scenario pack for the `fabric` family: networking from zero (module 01).
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
//   | `ethernet-frame` | building an Ethernet frame field by field with byte
//     counts, then serialisation time at 1, 10, 100 and 400 Gb/s | 01-01 |
//   | `mac-learning` | a switch with four hosts: learning source MACs, flooding
//     an unknown destination, forwarding a known one, aging | 01-02 |
//   | `vlan-trunk` | two switches, two VLANs, an access port untagged, the
//     802.1Q tag added on the trunk and removed at the far side | 01-02 |
//   | `broadcast-storm` | three switches in a loop, one broadcast multiplying
//     without a TTL; spanning tree blocks one port and it stops | 01-02 |
//   | `subnet-math` | address AND mask, network, broadcast, host range for
//     10.1.1.10/24 and 10.254.1.1/31, bit by bit | 01-03 |
//   | `lpm-lookup` | a routing table, a destination checked against each
//     prefix, the longest match wins, then recursive next-hop resolution | 01-04 |
//   | `arp-gateway` | a host deciding same subnet vs off subnet, ARPing for the
//     gateway, caching the reply, sending the first frame | 01-05 |
//   | `pmtud-blackhole` | a 1500-byte DF packet into a 1450 tunnel, the ICMP
//     "fragmentation needed" filtered, the connection hanging; then MSS clamping
//     | 01-07 |
//   | `switch-pipeline` | a packet through an ASIC: parser, lookup (FIB/TCAM),
//     ACL, queue, egress rewrite; a BGP packet punted to the CPU instead | 01-08 |
//   | `linux-rx-path` | NIC, DMA into the ring, interrupt, NAPI poll, GRO, IP,
//     TCP, socket buffer, application; where drops are counted | 01-09 |
//
// Extra Acme hosts used by this pack (the brief names four hosts; these follow
// its pattern: VLAN 100 = 10.1.1.0/24, VLAN 200 = 10.1.2.0/24, MAC last byte =
// last IP octet in hex, all from the 00:00:5e:00:53:xx documentation range):
//   acme-web3 10.1.1.12 :0c · acme-app1 10.1.1.13 :0d · acme-app2 10.1.1.14 :0e
//   acme-app3 10.1.1.16 :10 · acme-web4 10.1.1.17 :11 · acme-db2 10.1.2.21 :15
//   acme-db3 10.1.2.22 :16 · acme-cloud1 10.200.1.50 (Acme's cloud region).

import type { Tone } from "../primitives";
import { ANYCAST_GW_MAC, DISTANCE_KM, Fab, fibreMs, HOSTS, int, ipv4Checksum, loopback, p2p, pick, type FabGen, type HeaderSpec } from "./fabric-core";

// ---------- shared helpers ----------

const num = (x: number): string => x.toLocaleString("en-US");
/** Round to `d` decimals and drop trailing zeros, with thousands separators. */
const dec = (x: number, d: number): string => Number(x.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d });
const pct1 = (x: number): string => `${dec(x * 100, 1)}%`;
const last = <T,>(xs: T[]): T => xs[xs.length - 1]!;

const ipInt = (ip: string): number => ip.split(".").reduce((a, o) => a * 256 + Number(o), 0);
const intIp = (v: number): string => [24, 16, 8, 0].map((s) => (v >>> s) & 255).join(".");
const maskInt = (p: number): number => (p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0);
const bin8 = (o: number): string => o.toString(2).padStart(8, "0");
/** 32 bits in octets; with `split` a "|" marks the prefix boundary (replacing the octet dot when they coincide). */
const bits = (v: number, split?: number): string => {
  let out = "";
  for (let i = 1; i <= 32; i++) {
    out += (v >>> (32 - i)) & 1 ? "1" : "0";
    if (i === 32) break;
    if (split !== undefined && i === split) out += "|";
    else if (i % 8 === 0) out += ".";
  }
  return out;
};
const inPrefix = (ip: string, prefix: string): boolean => {
  const [net, len] = prefix.split("/");
  const m = maskInt(Number(len));
  return ((ipInt(ip) & m) >>> 0) === ((ipInt(net!) & m) >>> 0);
};

const MAC = {
  web1: HOSTS["acme-web1"].mac,
  web3: "00:00:5e:00:53:0c",
  app1: "00:00:5e:00:53:0d",
  app2: "00:00:5e:00:53:0e",
  app3: "00:00:5e:00:53:10",
  web4: "00:00:5e:00:53:11",
  db2: "00:00:5e:00:53:15",
  db3: "00:00:5e:00:53:16",
  bcast: "ff:ff:ff:ff:ff:ff",
} as const;

const eth = (dst: string, src: string, type = "0x0800 (IPv4)", extra: Partial<HeaderSpec> = {}): HeaderSpec => ({ name: "Ethernet", size: 14, reader: "this link only", fields: { "dst MAC": dst, "src MAC": src, EtherType: type }, ...extra });

// ---------- ethernet-frame ----------

/**
 * `ethernet-frame` (lesson 01-01). acme-web1's NIC builds one frame for
 * leaf1.ams field by field: preamble and SFD (8 B, not counted in the frame
 * size), destination MAC (the gateway MAC, with the OUI and the I/G bit
 * explained), source MAC, EtherType 0x0800, a 1,500-byte IPv4 payload and the
 * 4-byte FCS: a 1,518-byte frame, 1,538 bytes of wire time with the 12-byte
 * interframe gap. Then the serialisation delay of those 12,304 bits at 1, 10,
 * 100 and 400 Gb/s (with frames per second and the frame's length in fibre),
 * propagation delay for comparison, and the port counters (bytes, an FCS
 * error from a corrupted frame).
 *
 * Inputs: `payload` 46-9000 bytes (default 1500): the IPv4 packet size, e.g.
 * 9000 for a jumbo frame or 46 for a minimum-size frame. 14 frames.
 */
export const ethernetFrame: FabGen = (input) => {
  const p = int(input.payload, 46, 9000, 1500);
  const web = HOSTS["acme-web1"];
  const L1 = "leaf1.ams";
  const frame = 14 + p + 4;
  const wire = frame + 8 + 12;
  const nbits = wire * 8;
  const fab = new Fab(
    [
      { id: "acme-web1", kind: "host", x: 15, y: 50, state: "NIC eth0" },
      { id: L1, kind: "leaf", x: 85, y: 50, state: "port 1" },
    ],
    [["acme-web1", L1, { label: "full duplex" }]],
    { height: 150 },
  );
  const pre: HeaderSpec = { name: "Preamble + SFD", size: 8, reader: "receiving PHY (bit timing)", fields: { preamble: "7 × 0x55", SFD: "0xd5" } };
  const ethFields: [string, string][] = [];
  const ethHdr = (): HeaderSpec => ({ name: "Ethernet header", size: ethFields.length === 3 ? 14 : ethFields.length * 6, reader: "the switch at the other end", fields: [...ethFields] });
  const payload: HeaderSpec = { name: "Payload", size: p, reader: "the IP layer", fields: { content: "IPv4 packet", bytes: num(p) } };
  const fcs: HeaderSpec = { name: "FCS", size: 4, reader: "receiving MAC (error check)", fields: { "CRC-32": `over bytes 1-${num(14 + p)}` } };
  const rows: (string | number)[][] = [];
  const show = (vars: Record<string, string>) => {
    fab.table(0, { title: "The frame, field by field", head: ["field", "bytes", "read by"], rows, tones: rows.map((_, i) => (i === rows.length - 1 ? "active" : undefined)) });
    fab.set(vars);
  };

  fab.note(
    `acme-web1 is cabled to port 1 of leaf1.ams. The link is full duplex, two independent one-way channels, so both ends can transmit at full speed at the same time and nothing collides; acme-web1's network interface card (NIC) is about to send one frame, built here field by field.`,
    "topology",
  );

  fab.headers([pre], "built by acme-web1's NIC");
  rows.push(["preamble + SFD", 8, "PHY"]);
  show({ "frame size": "0 B (preamble not counted)", "wire time used": "8 B" });
  fab.note(
    `Before the frame proper the NIC sends 8 bytes: seven bytes of alternating 1s and 0s (0x55) that let the receiver's physical layer (PHY) lock onto the bit timing, then the start frame delimiter 0xd5 that marks where the frame begins. They use wire time but are never counted in the frame size.`,
    "preamble",
  );

  ethFields.push(["dst MAC", ANYCAST_GW_MAC]);
  fab.headers([pre, ethHdr()], "built by acme-web1's NIC");
  rows.push(["destination MAC", 6, "every switch"]);
  show({ "frame size": "6 B", "wire time used": "14 B" });
  fab.note(
    `First the 6-byte destination MAC, ${ANYCAST_GW_MAC} (leaf1.ams's gateway address), placed first so a switch can choose the output port while the rest is still arriving. Its first three bytes, 00:00:5e, are the OUI, the block IANA owns, and the lowest bit of the first byte is 0, so it is unicast (an odd first byte means multicast, and ff:ff:ff:ff:ff:ff is broadcast).`,
    "field",
  );

  ethFields.push(["src MAC", web.mac]);
  fab.headers([pre, ethHdr()], "built by acme-web1's NIC");
  rows.push(["source MAC", 6, "switches (to learn)"]);
  show({ "frame size": "12 B", "wire time used": "20 B" });
  fab.note(
    `Then the 6-byte source MAC, ${web.mac}, the address of acme-web1's own NIC. A source MAC is always unicast, and it is the field switches learn from (lesson 01-02).`,
    "field",
  );

  ethFields.push(["EtherType", "0x0800 (IPv4)"]);
  fab.headers([pre, ethHdr()], "built by acme-web1's NIC");
  rows.push(["EtherType", 2, "receiver (which protocol)"]);
  show({ "frame size": "14 B", "wire time used": "22 B" });
  fab.note(
    `The 2-byte EtherType 0x0800 says the payload is an IPv4 packet (0x86dd would be IPv6, 0x0806 ARP, 0x8100 a VLAN tag). These 14 bytes are the whole Ethernet header: two addresses that only mean something on this one link, and a type, with no hop count and nothing about the final destination.`,
    "field",
  );

  fab.headers([pre, ethHdr(), payload], "built by acme-web1's NIC");
  rows.push(["payload (IPv4 packet)", num(p), "IP layer"]);
  show({ "frame size": `${num(14 + p)} B`, "wire time used": `${num(22 + p)} B` });
  const payloadNote =
    p > 1500
      ? `Next the payload: a ${num(p)}-byte IPv4 packet, a jumbo frame. It only works if every device on the link has an MTU (maximum transmission unit, the largest payload allowed) of at least ${num(p)} bytes; the standard MTU is 1,500, and Meridian's fabric links run 9,216.`
      : p === 1500
        ? `Next the payload: here a 1,500-byte IPv4 packet, the standard maximum, which is exactly what an MTU (maximum transmission unit) of 1,500 means. A payload shorter than 46 bytes is padded to 46, so no frame is ever under 64 bytes.`
        : p === 46
          ? `Next the payload: 46 bytes, the minimum. A shorter packet is padded to 46 so that the frame reaches the 64-byte minimum Ethernet requires; the standard maximum, the MTU (maximum transmission unit), is 1,500.`
          : `Next the payload: here a ${num(p)}-byte IPv4 packet, below the standard maximum of 1,500 bytes (the MTU, maximum transmission unit). A payload shorter than 46 bytes is padded to 46, so no frame is ever under 64 bytes.`;
  fab.note(payloadNote, "field");

  fab.headers([pre, ethHdr(), payload, fcs], "built by acme-web1's NIC");
  rows.push(["FCS (CRC-32)", 4, "receiving MAC"]);
  show({ "frame size": `${num(frame)} B`, "wire time used": `${num(frame + 8)} B` });
  fab.note(
    `Last, the 4-byte frame check sequence (FCS): a CRC-32 the NIC computes over every byte from the destination MAC to the end of the payload. leaf1.ams recomputes it as the frame arrives, and if the two differ by even one bit the frame is dropped and counted as an FCS (CRC) error.`,
    "field",
  );

  rows.push(["interframe gap", 12, "nobody (idle line)"]);
  show({ "frame size": `${num(frame)} B`, "wire time used": `${num(wire)} B = ${num(nbits)} bits` });
  fab.note(
    `The frame is 14 + ${num(p)} + 4 = ${num(frame)} bytes, the size interface counters report. On the wire it costs ${num(wire)} bytes, because the 8-byte preamble and a mandatory 12-byte idle gap before the next frame (the interframe gap) take time too: ${num(nbits)} bits, of which ${pct1(p / wire)} is payload.`,
    "total",
  );

  const speeds = [1, 10, 100, 400];
  const ns = (g: number) => nbits / g;
  const time = (g: number) => (ns(g) >= 1000 ? `${dec(ns(g) / 1000, 4)} µs` : `${dec(ns(g), 2)} ns`);
  /** Light in fibre: about 0.2 m per ns. */
  const length = (g: number) => (ns(g) * 0.2 >= 1000 ? `${dec((ns(g) * 0.2) / 1000, 2)} km` : `${dec(ns(g) * 0.2, ns(g) * 0.2 >= 100 ? 0 : 2)} m`);
  const fps = (g: number) => Math.floor((g * 1e9) / nbits);
  const serRows: string[][] = [];
  const speedNotes: Record<number, string> = {
    1: `At 1 Gb/s the NIC puts one bit on the wire every nanosecond, so the ${num(nbits)} bits take ${time(1)} to send: this is serialisation delay. Light in fibre covers about 200 metres per microsecond, so the first bit is already ${length(1)} down the fibre when the last one leaves.`,
    10: `At 10 Gb/s the same frame takes ${time(10)}, ten times less, and the frame occupies ${length(10)} of fibre. A 10 Gb/s port can send at most ${num(fps(10))} frames of this size per second.`,
    100: `At 100 Gb/s it takes ${time(100)}. Serialisation time falls in exact proportion to link speed, so a 100 Gb/s port carries up to ${num(fps(100))} of these frames per second.`,
    400: `At 400 Gb/s, the speed of Meridian's fabric links, it takes ${time(400)} and the whole frame fits in ${length(400)} of fibre. A faster link does not make bits travel faster; it makes each frame shorter in time.`,
  };
  for (const g of speeds) {
    serRows.push([`${g} Gb/s`, time(g), length(g), num(fps(g))]);
    fab.table(1, { title: `Serialising ${num(nbits)} bits`, head: ["speed", "time", "length in fibre", "frames/s max"], rows: serRows, tones: serRows.map((_, i) => (i === serRows.length - 1 ? "active" : undefined)) });
    fab.linkSet("acme-web1", L1, { label: `${g} Gb/s`, width: g / 400 });
    fab.send("acme-web1", L1, `${num(frame)} B frame`, speedNotes[g]!, { tag: "serialise" });
  }

  fab.clearRowTones(1);
  fab.set({ "propagation, 100 m": "500 ns", "propagation, ams–sin": `${dec(fibreMs(DISTANCE_KM["ams-sin"]), 1)} ms` });
  fab.note(
    `Propagation delay is the other half, about 5 ns per metre of fibre at any speed: a 100 m run inside a data hall adds 500 ns, and the ${num(DISTANCE_KM["ams-sin"])} km from Amsterdam to Singapore about ${dec(fibreMs(DISTANCE_KM["ams-sin"]), 1)} ms. On that 100 m link serialisation dominates at 1 Gb/s (${time(1)} against 500 ns) and propagation dominates at 400 Gb/s (${time(400)}), which is why long-distance latency is a geography problem that faster links cannot fix.`,
    "propagation",
  );

  fab.table(1, { title: "leaf1.ams port 1 counters", head: ["counter", "value"], rows: [["in packets", 1], ["in bytes", num(frame)], ["in FCS errors", 1], ["in discards", 0]], tones: [undefined, undefined, "danger", undefined] });
  fab.state(L1, "FCS error", "danger");
  fab.send(
    "acme-web1",
    L1,
    "frame, 1 bit flipped",
    `leaf1.ams counted the good frame (in packets 1, in bytes ${num(frame)}: switches count from destination MAC to FCS, while a Linux host usually leaves the 4-byte FCS out). A second frame arrives with one bit flipped by a dirty connector, its CRC does not match, and it is dropped and counted as an FCS error: a rising FCS error counter is how a failing cable or optic shows itself.`,
    { lost: true, progress: 0.85, tag: "counters" },
  );
  return fab.f.done();
};

// ---------- mac-learning ----------

/**
 * `mac-learning` (lesson 01-02). leaf1.ams acting as a classic learning
 * switch for VLAN 100 with four Acme servers on ports 1-4 (module 06 replaces
 * flood-and-learn with EVPN). acme-web1 sends to acme-app2: the switch learns
 * the source, floods the unknown destination to ports 2-4, learns acme-app2
 * from its reply and forwards that to port 1 only; the next frame is a known
 * unicast. acme-app3's broadcast is learned and flooded. acme-app3 then stays
 * silent past the 300 s aging time, its entry is removed, and the next frame
 * to it is flooded again. acme-app1 never sends, so it is never learned.
 *
 * Inputs: none. 13 frames.
 */
export const macLearning: FabGen = () => {
  const SW = "leaf1.ams";
  const hosts = [
    { id: "acme-web1", ip: "10.1.1.10", mac: MAC.web1, port: 1 },
    { id: "acme-app1", ip: "10.1.1.13", mac: MAC.app1, port: 2 },
    { id: "acme-app2", ip: "10.1.1.14", mac: MAC.app2, port: 3 },
    { id: "acme-app3", ip: "10.1.1.16", mac: MAC.app3, port: 4 },
  ];
  const [web1, app1, app2, app3] = [hosts[0]!, hosts[1]!, hosts[2]!, hosts[3]!];
  const fab = new Fab(
    [{ id: SW, kind: "switch", x: 50, y: 0, state: "VLAN 100" }, ...hosts.map((h, i) => ({ id: h.id, kind: "host" as const, x: 12.5 + 25 * i, y: 100, state: h.ip }))],
    hosts.map((h) => [SW, h.id, { label: `port ${h.port}`, labelAt: 0.3 }] as [string, string, { label: string; labelAt: number }]),
    { height: 220 },
  );
  const learned: { mac: string; port: number; last: number }[] = [];
  let now = 0;
  const render = (hot?: string, danger?: string) => {
    fab.table(0, {
      title: `${SW} MAC address table, VLAN 100 (aging 300 s)`,
      head: ["VLAN", "MAC", "port", "age"],
      rows: learned.map((e) => ["100", e.mac, `port ${e.port}`, `${now - e.last} s`]),
      tones: learned.map((e): Tone | undefined => (e.mac === danger ? "danger" : e.mac === hot ? "active" : undefined)),
    });
    fab.set({ time: `t = ${now} s`, entries: learned.length });
  };
  const learn = (mac: string, port: number) => {
    const e = learned.find((x) => x.mac === mac);
    if (e) {
      e.port = port;
      e.last = now;
    } else learned.push({ mac, port, last: now });
  };
  const others = (h: (typeof hosts)[0]) => hosts.filter((x) => x !== h);
  const resetStates = () => hosts.forEach((h) => fab.state(h.id, h.ip, "default"));

  render();
  fab.note(
    `Four Acme servers sit on ports 1 to 4 of leaf1.ams, all in VLAN 100 (subnet 10.1.1.0/24). Here leaf1.ams behaves as a classic learning switch for that VLAN (module 06 replaces flooding and learning with EVPN), and its MAC address table starts empty.`,
    "topology",
  );

  fab.headers([eth(app2.mac, web1.mac)], "as it enters port 1");
  fab.send(
    web1.id,
    SW,
    "to …53:0e",
    `acme-web1 sends a frame to acme-app2: destination MAC ${app2.mac}, source ${web1.mac} (it already knows acme-app2's MAC; lesson 01-05 shows how ARP finds it). The frame enters leaf1.ams on port 1.`,
  );

  learn(web1.mac, 1);
  render(web1.mac);
  fab.state(SW, "learn source", "active");
  fab.note(
    `Before forwarding, the switch reads the source MAC and records it: ${web1.mac} is reachable through port 1, age 0. Learning only ever uses the source address, because a frame proves where its sender is, never where its destination is.`,
    "learn",
  );

  fab.state(SW, "unknown → flood", "compare");
  fab.packets(
    others(web1).map((h) => ({ from: SW, to: h.id, label: "flood", tone: "compare" })),
    `The destination ${app2.mac} is not in the table, an unknown unicast, so the switch floods the frame: one copy out of every other port in VLAN 100 (ports 2, 3 and 4), and never back out of port 1 where it came in.`,
    "flood",
  );

  fab.state(app1.id, "discarded", "muted");
  fab.state(app3.id, "discarded", "muted");
  fab.state(app2.id, "accepted", "done");
  fab.state(SW, "VLAN 100", "default");
  fab.note(
    `acme-app1 and acme-app3 receive a frame that is not for them; their NICs see a destination MAC that is not their own and discard it in hardware. Only acme-app2 accepts it: flooding always works, but every host in the VLAN pays for every unknown frame.`,
    "deliver",
  );

  resetStates();
  learn(app2.mac, 3);
  render(app2.mac);
  fab.headers([eth(web1.mac, app2.mac)], "as it enters port 3");
  fab.send(
    app2.id,
    SW,
    "to …53:0a",
    `acme-app2 replies: destination ${web1.mac}, source ${app2.mac}, arriving on port 3. The switch learns its second entry from the reply's source address: ${app2.mac} is on port 3.`,
  );

  fab.state(SW, "known → port 1", "done");
  fab.rowTone(0, 0, "active");
  fab.rowTone(0, 1, undefined);
  fab.at("leaving port 1");
  fab.send(SW, web1.id, "to …53:0a", `This time the destination ${web1.mac} is in the table, on port 1, so the reply goes out of port 1 only. acme-app1 and acme-app3 never see it.`, { tone: "done", tag: "forward" });

  now = 1;
  learn(web1.mac, 1);
  render(app2.mac);
  fab.headers([eth(app2.mac, web1.mac)], "leaving port 3");
  fab.state(SW, "known → port 3", "done");
  fab.send(
    SW,
    app2.id,
    "to …53:0e",
    `One second later acme-web1 sends again. The destination is now known, so the frame goes out of port 3 alone, and because the switch just saw ${web1.mac} as a source again its age resets to 0 s.`,
    { tone: "done", tag: "forward" },
  );

  now = 5;
  learn(app3.mac, 4);
  render(app3.mac);
  fab.state(SW, "broadcast → flood", "compare");
  fab.headers([eth(MAC.bcast, app3.mac, "0x0806 (ARP)")], "as it enters port 4");
  fab.packets(
    others(app3).map((h) => ({ from: SW, to: h.id, label: "broadcast", tone: "compare" })),
    `At t = 5 s acme-app3 sends a broadcast (destination ${MAC.bcast}, here an ARP request). The switch learns ${app3.mac} on port 4 and floods the frame to ports 1, 2 and 3, as it always does for a broadcast: every port in VLAN 100 is one broadcast domain.`,
    "flood",
  );

  now = 290;
  learn(web1.mac, 1);
  learn(app2.mac, 3);
  render(undefined, undefined);
  fab.rowTone(0, 2, "compare");
  fab.state(SW, "VLAN 100", "default");
  fab.headers(undefined);
  fab.note(
    `At t = 290 s acme-web1 and acme-app2 are still exchanging frames, so their ages keep resetting to 0. acme-app3 has been silent since t = 5 s and its entry is 285 s old, close to the switch's aging time of 300 s (the IEEE 802.1D default).`,
    "aging",
  );

  now = 305;
  learn(web1.mac, 1);
  learn(app2.mac, 3);
  now = 306;
  learned.splice(
    learned.findIndex((e) => e.mac === app3.mac),
    1,
  );
  render();
  fab.set({ "aged out": `${app3.mac} (port 4)` });
  fab.note(
    `At t = 306 s acme-app3's entry passes 300 s without being refreshed and the switch removes it. Aging keeps the table from filling with addresses that are gone, and lets a host that moved to another port be learned afresh.`,
    "aging",
  );

  now = 340;
  learn(web1.mac, 1);
  render(web1.mac);
  fab.unset("aged out");
  fab.state(SW, "unknown → flood", "compare");
  fab.headers([eth(app3.mac, web1.mac)], "as it enters port 1");
  fab.packets(
    others(web1).map((h) => ({ from: SW, to: h.id, label: "flood", tone: "compare" })),
    `At t = 340 s acme-web1 sends to acme-app3, whose MAC is unknown again, so the frame is flooded to ports 2, 3 and 4 until acme-app3 answers and is relearned. A trickle of unknown-unicast flooding is normal; a steady stream usually means hosts are still talking to an address the switch has aged out (routers keep ARP entries for hours, switches keep MACs for minutes).`,
    "flood",
  );

  fab.state(SW, "VLAN 100", "default");
  fab.headers(undefined);
  fab.clearRowTones(0);
  fab.set({ "never learned": `${app1.mac} (acme-app1 has sent nothing)` });
  fab.note(
    `The whole algorithm is three rules: learn from the source, forward to the known port or flood when the destination is unknown or broadcast, and forget addresses that fall silent. acme-app1 has sent nothing, so it was never learned; and a MAC that keeps appearing on two ports in turn (a MAC flap) is the classic sign of a loop, the subject of the broadcast-storm walk.`,
    "done",
  );
  return fab.f.done();
};

// ---------- vlan-trunk ----------

/**
 * `vlan-trunk` (lesson 01-02). A classic two-switch layer-2 design (the kind
 * of trunk an MLAG pair's peer link still uses; Meridian's leaves are not
 * linked like this): leaf1.ams and leaf2.ams each have an Acme web server on
 * an access port in VLAN 100 (10.1.1.0/24) and a database server on an access
 * port in VLAN 200 (10.1.2.0/24), joined by a trunk on port 49. acme-web1's
 * ARP broadcast enters untagged, is tagged VID 100 (TPID 0x8100) on the trunk,
 * and leaves leaf2.ams untagged towards acme-web3 only; acme-db2's broadcast
 * crosses the same trunk tagged VID 200 and reaches only acme-db3.
 *
 * Inputs: none. 11 frames.
 */
export const vlanTrunk: FabGen = () => {
  const L1 = "leaf1.ams";
  const L2 = "leaf2.ams";
  const fab = new Fab(
    [
      { id: L1, kind: "switch", x: 25, y: 0 },
      { id: L2, kind: "switch", x: 75, y: 0 },
      { id: "acme-web1", kind: "host", x: 8, y: 100, state: "VLAN 100" },
      { id: "acme-db2", kind: "host", x: 36, y: 100, state: "VLAN 200" },
      { id: "acme-web3", kind: "host", x: 64, y: 100, state: "VLAN 100" },
      { id: "acme-db3", kind: "host", x: 92, y: 100, state: "VLAN 200" },
    ],
    [
      [L1, L2, { label: "trunk: VLANs 100, 200", width: 0.3 }],
      [L1, "acme-web1", { label: "p1", labelAt: 0.35 }],
      [L1, "acme-db2", { label: "p2", labelAt: 0.35 }],
      [L2, "acme-web3", { label: "p1", labelAt: 0.35 }],
      [L2, "acme-db3", { label: "p2", labelAt: 0.35 }],
    ],
    { height: 220 },
  );
  const ports: (string | number)[][] = [
    [L1, "port 1 (acme-web1)", "access", "100"],
    [L1, "port 2 (acme-db2)", "access", "200"],
    [L1, "port 49 (to leaf2)", "trunk", "100, 200 tagged"],
    [L2, "port 49 (to leaf1)", "trunk", "100, 200 tagged"],
    [L2, "port 1 (acme-web3)", "access", "100"],
    [L2, "port 2 (acme-db3)", "access", "200"],
  ];
  const portTable = (tones?: (Tone | undefined)[]) => fab.table(0, { title: "Port configuration", head: ["switch", "port", "mode", "VLANs"], rows: ports, tones });
  const arp = (senderMac: string, senderIp: string, targetIp: string): HeaderSpec => ({ name: "ARP", size: 28, reader: "the host that owns the target IP", fields: { operation: "1 (request)", "sender MAC": senderMac, "sender IP": senderIp, "target IP": targetIp } });
  const untagged = (src: string, a: HeaderSpec): HeaderSpec[] => [eth(MAC.bcast, src, "0x0806 (ARP)"), a];
  const tagged = (src: string, vid: number, a: HeaderSpec): HeaderSpec[] => [
    eth(MAC.bcast, src, "0x8100 (802.1Q)"),
    { name: "802.1Q tag", size: 4, tone: "path", reader: "trunk ports only", fields: { PCP: 0, DEI: 0, VID: vid, EtherType: "0x0806 (ARP)" }, highlight: ["VID"] },
    a,
  ];

  fab.set({ "VLAN 100": "10.1.1.0/24 (web)", "VLAN 200": "10.1.2.0/24 (db)" });
  fab.note(
    `Two switches joined by one cable that must carry two VLANs: a classic layer-2 design, shown with leaf1.ams and leaf2.ams (the trunk an MLAG pair's peer link still uses). Each switch has an Acme web server in VLAN 100 (10.1.1.0/24) and a database server in VLAN 200 (10.1.2.0/24), and port 49 on each side is the link between them.`,
    "topology",
  );

  portTable([undefined, undefined, "active", "active", undefined, undefined]);
  fab.note(
    `An access port belongs to exactly one VLAN and carries plain untagged frames, so a server never knows VLANs exist. A trunk port carries several VLANs over one link and marks every frame with the VLAN it belongs to, using a 4-byte IEEE 802.1Q tag.`,
    "ports",
  );

  const a1 = arp(MAC.web1, "10.1.1.10", "10.1.1.12");
  fab.headers(untagged(MAC.web1, a1), "on the link acme-web1 → leaf1.ams, untagged");
  portTable();
  fab.state("acme-web1", "VLAN 100", "active");
  fab.send(
    "acme-web1",
    L1,
    "ARP who-has 10.1.1.12",
    `acme-web1 broadcasts an ARP request for acme-web3 (10.1.1.12): destination ff:ff:ff:ff:ff:ff, EtherType 0x0806. It leaves the server untagged, exactly like any frame on an access port.`,
  );

  fab.state(L1, "VLAN 100", "active");
  fab.state("acme-db2", "not in VLAN 100", "muted");
  portTable([undefined, "muted", "active", undefined, undefined, undefined]);
  fab.note(
    `leaf1.ams assigns the frame to VLAN 100 because port 1 is an access port in VLAN 100, and floods it only to the other VLAN 100 ports: just the trunk, port 49. acme-db2 on port 2 sits on the same switch but in VLAN 200, a separate broadcast domain, so it gets no copy.`,
    "classify",
  );

  fab.headers(tagged(MAC.web1, 100, a1), "leaving leaf1.ams port 49, tagged");
  fab.note(
    `On the way out of trunk port 49, leaf1.ams inserts the 802.1Q tag after the source MAC: the EtherType position now holds the tag protocol identifier 0x8100, followed by 3 bits of priority (PCP 0), a drop-eligible bit (DEI 0), the 12-bit VLAN ID 100, and then the original EtherType 0x0806. The frame grows by 4 bytes (a full-size 1,518-byte frame becomes 1,522) and the FCS is recomputed.`,
    "tag",
  );

  fab.path([L1, L2]);
  fab.at("on the trunk leaf1.ams → leaf2.ams");
  fab.send(L1, L2, "VID 100, ARP", `The tagged frame crosses the trunk. Frames of both VLANs share this cable; only the VID in each tag keeps them apart.`, { tag: "trunk" });

  fab.clearPath();
  fab.state(L2, "VLAN 100", "active");
  fab.state("acme-db3", "not in VLAN 100", "muted");
  portTable([undefined, undefined, undefined, "active", "active", "muted"]);
  fab.headers(untagged(MAC.web1, a1), "leaving leaf2.ams port 1, tag removed");
  fab.note(
    `leaf2.ams reads VID 100 from the tag, so the frame belongs to VLAN 100 on this switch too, and floods it to its only other VLAN 100 port, port 1. That is an access port, so leaf2.ams removes the tag on the way out (the EtherType is 0x0806 again) and recomputes the FCS.`,
    "untag",
  );

  fab.state("acme-web3", "received", "done");
  fab.send(
    L2,
    "acme-web3",
    "ARP who-has 10.1.1.12",
    `acme-web3 receives an ordinary untagged ARP request, byte for byte what acme-web1 sent, and will answer it. acme-db3, on the same switch in VLAN 200, never saw it.`,
    { tone: "done", tag: "deliver" },
  );

  for (const h of ["acme-web1", "acme-web3", "acme-db2", "acme-db3"]) fab.state(h, h.includes("db") ? "VLAN 200" : "VLAN 100", "default");
  fab.tones([L1, L2], undefined);
  fab.state(L1, undefined);
  fab.state(L2, undefined);
  fab.state("acme-db2", "VLAN 200", "active");
  portTable([undefined, "active", "active", "active", undefined, "active"]);
  const a2 = arp(MAC.db2, "10.1.2.21", "10.1.2.22");
  fab.headers(tagged(MAC.db2, 200, a2), "on the trunk leaf1.ams → leaf2.ams");
  fab.path([L1, L2]);
  fab.send(
    L1,
    L2,
    "VID 200, ARP",
    `Now acme-db2 broadcasts an ARP request for acme-db3 (10.1.2.22) in VLAN 200. leaf1.ams floods it only to the trunk, and it crosses the same cable tagged VID 200 this time, so leaf2.ams can keep it apart from VLAN 100.`,
    { tag: "trunk" },
  );

  fab.clearPath();
  fab.headers(untagged(MAC.db2, a2), "leaving leaf2.ams port 2, tag removed");
  fab.state("acme-db3", "received", "done");
  fab.send(L2, "acme-db3", "ARP who-has 10.1.2.22", `leaf2.ams floods it to its VLAN 200 access port only and strips the tag, so acme-db3 gets it untagged while acme-web3 does not see it at all.`, { tone: "done", tag: "deliver" });

  portTable();
  fab.headers(undefined);
  fab.set({ "VLAN IDs": "12 bits: 4,094 usable (0 and 4095 reserved)" });
  fab.note(
    `One cable, two isolated broadcast domains. The 12-bit VLAN ID allows only 4,094 VLANs (IDs 0 and 4095 are reserved), a limit large multi-tenant fabrics outgrow and one reason for VXLAN's 24-bit VNI in module 06; and a VLAN missing from a trunk, or a server port in the wrong VLAN, drops traffic silently, so the usual first symptom is an ARP request that never gets an answer.`,
    "done",
  );
  return fab.f.done();
};

// ---------- broadcast-storm ----------

/**
 * `broadcast-storm` (lesson 01-02). A classic layer-2 triangle, shown with
 * leaf1.ams, leaf2.ams and leaf3.ams (all ports in VLAN 100, one host each,
 * spanning tree off). acme-web1's single ARP broadcast is flooded round the
 * loop: Ethernet has no TTL, so two copies circle forever, every host gets it
 * again on every lap, leaf1.ams's MAC table flaps, and each further broadcast
 * adds two more copies until the links are full (chart). Then RSTP elects
 * leaf1.ams root (lowest bridge ID), leaf2/leaf3 pick root ports, leaf3's
 * port towards leaf2 becomes alternate (discarding), the storm stops, and the
 * same broadcast reaches each host exactly once.
 *
 * Inputs: none. 13 frames.
 */
export const broadcastStorm: FabGen = () => {
  const [L1, L2, L3] = ["leaf1.ams", "leaf2.ams", "leaf3.ams"] as const;
  const fab = new Fab(
    [
      { id: "acme-web1", kind: "host", x: 50, y: 0, state: "10.1.1.10" },
      { id: L1, kind: "switch", x: 50, y: 33 },
      { id: L2, kind: "switch", x: 18, y: 68 },
      { id: L3, kind: "switch", x: 82, y: 68 },
      { id: "acme-web3", kind: "host", x: 18, y: 100, state: "10.1.1.12" },
      { id: "acme-web4", kind: "host", x: 82, y: 100, state: "10.1.1.17" },
    ],
    [
      ["acme-web1", L1],
      [L1, L2, { label: "p49 – p49" }],
      [L1, L3, { label: "p50 – p49" }],
      [L2, L3, { label: "p50 – p50" }],
      [L2, "acme-web3"],
      [L3, "acme-web4"],
    ],
    { height: 330 },
  );
  const bridge = { [L1]: fab.portMac(L1, "bridge"), [L2]: fab.portMac(L2, "bridge"), [L3]: fab.portMac(L3, "bridge") };
  const got = { "acme-web3": 0, "acme-web4": 0, "acme-web1 (own frame)": 0 };
  const tally = (copies: number) => fab.set({ "copies in the loop": copies, "acme-web3 received": got["acme-web3"], "acme-web4 received": got["acme-web4"], "acme-web1 got its own back": got["acme-web1 (own frame)"] });
  const macTable = (port: string, tone?: Tone) => fab.table(0, { title: `${L1} MAC table, VLAN 100`, head: ["MAC", "port"], rows: [[MAC.web1, port]], tones: [tone] });

  fab.set({ "spanning tree": "off" });
  fab.note(
    `Three switches wired in a triangle so that any one link can fail without cutting anyone off: a classic layer-2 design, shown with leaf1.ams, leaf2.ams and leaf3.ams, every port in VLAN 100 and one Acme host on each. Spanning tree is turned off, so all three inter-switch links forward.`,
    "topology",
  );

  fab.headers([eth(MAC.bcast, MAC.web1, "0x0806 (ARP)"), { name: "ARP", size: 28, fields: { operation: "1 (request)", "sender IP": "10.1.1.10", "target IP": "10.1.1.17" } }], "one broadcast, sent once");
  macTable("port 1");
  tally(0);
  fab.send(
    "acme-web1",
    L1,
    "ARP broadcast",
    `acme-web1 sends one broadcast, an ARP request for 10.1.1.17. An IP header carries a TTL that routers count down, but the Ethernet header has no TTL or hop count at all, so nothing in this frame can ever tell a switch it has been around too long.`,
  );

  tally(2);
  fab.packets(
    [
      { from: L1, to: L2, label: "copy →", tone: "compare" },
      { from: L1, to: L3, label: "copy →", tone: "compare" },
    ],
    `leaf1.ams learns acme-web1 on port 1 and floods the broadcast out of every other port: one copy to leaf2.ams on port 49, one to leaf3.ams on port 50. There are now two copies in the loop.`,
    "flood",
  );

  got["acme-web3"]++;
  got["acme-web4"]++;
  tally(2);
  fab.packets(
    [
      { from: L2, to: "acme-web3", label: "copy 1", tone: "compare" },
      { from: L2, to: L3, label: "→ leaf3", tone: "compare", progress: 0.35 },
      { from: L3, to: "acme-web4", label: "copy 1", tone: "compare" },
      { from: L3, to: L2, label: "→ leaf2", tone: "compare", progress: 0.35 },
    ],
    `leaf2.ams floods its copy to acme-web3 and on to leaf3.ams; leaf3.ams floods its copy to acme-web4 and on to leaf2.ams. Each host has its ARP request, which is all that should have happened, but the two copies are now crossing on the leaf2–leaf3 link in opposite directions.`,
    "flood",
  );

  got["acme-web3"]++;
  got["acme-web4"]++;
  tally(2);
  macTable("port 49, then port 50", "danger");
  fab.state(L1, "MAC flapping", "danger");
  fab.packets(
    [
      { from: L2, to: "acme-web3", label: "copy 2", tone: "danger" },
      { from: L2, to: L1, label: "back to leaf1", tone: "danger" },
      { from: L3, to: "acme-web4", label: "copy 2", tone: "danger" },
      { from: L3, to: L1, label: "back to leaf1", tone: "danger" },
    ],
    `Each copy reaches the far switch and is flooded again: acme-web3 and acme-web4 get the same request a second time, and both copies head back to leaf1.ams still carrying acme-web1's source MAC. leaf1.ams relearns ${MAC.web1} on port 49, then on port 50, so the address flaps between ports and unicast frames for acme-web1 are now sent the wrong way.`,
    "loop",
  );

  got["acme-web1 (own frame)"] += 2;
  tally(2);
  fab.packets(
    [
      { from: L1, to: L3, label: "lap 2 →", tone: "danger" },
      { from: L1, to: L2, label: "lap 2 →", tone: "danger" },
      { from: L1, to: "acme-web1", label: "2 copies", tone: "danger" },
    ],
    `leaf1.ams floods each returning copy out of every port except the one it arrived on: one sets off round the triangle again in each direction, and acme-web1 receives its own broadcast back, twice. Two copies are in the loop, exactly as at the start, and nothing in the frame or the switches will ever end the cycle.`,
    "loop",
  );

  const hopUs = 1;
  const lapsPerSec = 1e6 / (3 * hopUs);
  const perHost = 2 * lapsPerSec;
  /** 64-byte frames on 10 Gb/s: 84 bytes of wire time each. */
  const linePps = 10e9 / (84 * 8);
  /** One broadcast leaves one copy circling each way, so every link carries one copy per lap in each direction. */
  const perBroadcast = lapsPerSec / linePps;
  const full = Math.ceil(1 / perBroadcast);
  fab.set({ "lap time": `about ${3 * hopUs} µs (3 switches × ~${hopUs} µs)`, "copies per host per second": `about ${num(Math.round(perHost / 10000) * 10000)}` });
  fab.note(
    `The copies circle as fast as the switches can forward them. A lap through three switches takes about ${3 * hopUs} µs (roughly ${hopUs} µs per switch), so every host receives this one ARP request about ${num(Math.round(perHost / 10000) * 10000)} times a second, and its CPU has to process every copy; the switches' own CPUs receive every broadcast too.`,
    "storm",
  );

  const ks = [1, 10, 20, 30, 40, 45];
  fab.chart({
    title: "Load on each inter-switch link, each direction (10 Gb/s, 64-byte frames)",
    unit: "% of line rate",
    yMax: 110,
    xLabel: `broadcasts sent: ${ks.join(", ")}`,
    series: [{ name: "link load", tone: "danger", points: ks.map((k) => Math.min(100, Math.round(k * perBroadcast * 1000) / 10)) }],
    marks: [{ y: 100, label: "link full", tone: "danger" }],
  });
  fab.set({ "load per broadcast": pct1(perBroadcast), "links full after": `${full} broadcasts` });
  fab.note(
    `Every further broadcast (ARP, DHCP, service discovery: every host sends some) adds two more copies that never die, one circling each way. Each copy crosses every link once per lap, about ${num(Math.round(lapsPerSec / 1000) * 1000)} times a second, or ${pct1(perBroadcast)} of a 10 Gb/s link in its direction, so after ${full} broadcasts every link in the triangle is full both ways and real traffic is crowded out. In a network with more redundant links, switches with three or more looped ports copy every copy again on each lap, and the count grows exponentially instead.`,
    "storm",
  );

  // Spanning tree.
  fab.chart(undefined);
  fab.headers(undefined);
  fab.unset("lap time", "copies per host per second", "load per broadcast", "links full after", "copies in the loop", "acme-web3 received", "acme-web4 received", "acme-web1 got its own back");
  fab.state(L1, "root bridge", "done");
  fab.set({ "spanning tree": "RSTP (802.1w)" });
  macTable("port 1");
  fab.table(1, {
    title: "Spanning tree: bridge IDs (priority.MAC)",
    head: ["switch", "bridge ID", "cost to root"],
    rows: [
      [L1, `32768.${bridge[L1]}`, "0 (root)"],
      [L2, `32768.${bridge[L2]}`, "—"],
      [L3, `32768.${bridge[L3]}`, "—"],
    ],
    tones: ["done", undefined, undefined],
  });
  fab.note(
    `Spanning tree prevents this. Run the same triangle again with the Rapid Spanning Tree Protocol (RSTP) on: the switches first exchange BPDUs (bridge protocol data units, small messages switches send each other every 2 seconds) and elect a root bridge, the one with the lowest bridge ID (its priority, default 32768, followed by its MAC), which makes leaf1.ams with ${bridge[L1]} the root.`,
    "stp",
  );

  const roles = (rows: string[][], tones: (Tone | undefined)[]) => fab.table(0, { title: "Spanning tree port roles", head: ["switch", "port", "role", "state"], rows, tones });
  const rootRows = [
    [L1, "p49 → leaf2", "designated", "forwarding"],
    [L1, "p50 → leaf3", "designated", "forwarding"],
    [L2, "p49 → leaf1", "root", "forwarding"],
    [L3, "p49 → leaf1", "root", "forwarding"],
  ];
  fab.table(1, {
    title: "Spanning tree: bridge IDs (priority.MAC)",
    head: ["switch", "bridge ID", "cost to root"],
    rows: [
      [L1, `32768.${bridge[L1]}`, "0 (root)"],
      [L2, `32768.${bridge[L2]}`, "2,000"],
      [L3, `32768.${bridge[L3]}`, "2,000"],
    ],
    tones: ["done", undefined, undefined],
  });
  roles(rootRows, [undefined, undefined, "active", "active"]);
  fab.note(
    `Every other switch picks its root port, the one with the lowest path cost to the root. A 10 Gb/s link costs 2,000 (the IEEE 802.1D-2004 default), so for leaf2.ams and leaf3.ams the direct link to leaf1.ams (2,000) beats the way round through the other switch (4,000), and port 49 becomes the root port on both.`,
    "stp",
  );

  fab.linkSet(L2, L3, { dashed: true, tone: "muted", label: "blocked at leaf3 p50" });
  fab.state(L3, "p50 discarding", "compare");
  roles([...rootRows, [L2, "p50 → leaf3", "designated", "forwarding"], [L3, "p50 → leaf2", "alternate", "discarding"]], [undefined, undefined, undefined, undefined, "active", "danger"]);
  fab.note(
    `That leaves the leaf2–leaf3 link, where both ends offer the same cost to the root (2,000). The tie goes to the lower bridge ID, so leaf2.ams's port 50 is designated and keeps forwarding, while leaf3.ams's port 50 becomes an alternate port in the discarding state: it still receives BPDUs but forwards no data, so the loop is broken and no frame can go all the way round.`,
    "stp",
  );

  fab.headers([eth(MAC.bcast, MAC.web1, "0x0806 (ARP)"), { name: "ARP", size: 28, fields: { operation: "1 (request)", "sender IP": "10.1.1.10", "target IP": "10.1.1.17" } }], "the same broadcast, with RSTP running");
  got["acme-web3"] = 1;
  got["acme-web4"] = 1;
  got["acme-web1 (own frame)"] = 0;
  fab.set({ "acme-web3 received": 1, "acme-web4 received": 1, "acme-web1 got its own back": 0 });
  fab.packets(
    [
      { from: L1, to: L2, label: "copy", tone: "active" },
      { from: L1, to: L3, label: "copy", tone: "active" },
      { from: L2, to: "acme-web3", label: "1 copy", tone: "done" },
      { from: L3, to: "acme-web4", label: "1 copy", tone: "done" },
      { from: L2, to: L3, label: "discarded", lost: true, progress: 0.85 },
    ],
    `acme-web1 sends the same broadcast again. leaf1.ams floods it to both neighbours, each delivers it to its host, and the copy leaf2.ams sends towards leaf3.ams is discarded at the alternate port: every host receives it exactly once and the copies die.`,
    "flood",
  );

  fab.table(1, undefined);
  fab.note(
    `Spanning tree buys safety at a price: one of the three links carries no traffic at all, recovery after a failure takes RSTP from under a second to a few seconds (the original 802.1D took 30 to 50), and a switch that stops sending BPDUs (an overloaded CPU, a link that fails in one direction only) makes its neighbour's alternate port start forwarding and brings the storm back. That is why leaf-spine fabrics route between switches instead: every link forwards (ECMP), and an IP packet caught in a loop dies when its TTL reaches zero.`,
    "done",
  );
  return fab.f.done();
};

// ---------- subnet-math ----------

const CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

/**
 * `subnet-math` (lesson 01-03). Bit by bit: acme-web1's 10.1.1.10/24 in
 * binary, the /24 mask, address AND mask = network 10.1.1.0, broadcast
 * 10.1.1.255, hosts 10.1.1.1-10.1.1.254 (254), and the same AND deciding that
 * 10.1.1.11 is on-link and 10.1.2.20 is not. Then leaf1.ams's fabric link
 * address 10.254.1.1/31 (network 10.254.1.0, both addresses used, RFC 3021,
 * spine1.ams .0 and leaf1.ams .1) and the loopback 10.255.1.11/32.
 *
 * Inputs: `cidr` such as "192.168.10.77/27" replaces the first example (prefix
 * clamped to 8-30); the /31 and /32 part is always Meridian's. 12 frames.
 */
export const subnetMath: FabGen = (input) => {
  const m = typeof input.cidr === "string" ? CIDR.exec(input.cidr.trim()) : null;
  const custom = m !== null && m.slice(1, 5).every((o) => Number(o) <= 255);
  const addr = custom ? m!.slice(1, 5).map(Number).join(".") : HOSTS["acme-web1"].ip;
  const plen = custom ? Math.min(30, Math.max(8, Number(m![5]))) : 24;
  const who = custom ? `Take the address ${addr}/${plen}` : `acme-web1's address is ${addr}/${plen}`;
  const L1 = "leaf1.ams";
  const S1 = "spine1.ams";
  const link = p2p(L1, S1);
  const fab = new Fab(
    [
      { id: S1, kind: "spine", state: link.spine },
      { id: L1, kind: "leaf", state: link.leaf },
      { id: "acme-web1", kind: "host", state: custom ? addr : "10.1.1.10" },
    ],
    [
      [S1, L1, { label: link.net }],
      [L1, "acme-web1", { label: custom ? `${addr}/${plen}` : "10.1.1.0/24" }],
    ],
  );

  const run = (ip: string, n: number) => {
    const a = ipInt(ip);
    const mk = maskInt(n);
    const net = (a & mk) >>> 0;
    const bc = (net | (~mk >>> 0)) >>> 0;
    return { a, mk, net, bc, hostBits: 32 - n };
  };
  const A = run(addr, plen);
  const rows: string[][] = [];
  const bitTable = (title: string, tones?: (Tone | undefined)[]) => fab.table(0, { title, head: ["", "dotted", "binary (| = prefix boundary)"], rows, tones });
  const titleA = `${addr}/${plen}, bit by bit`;
  const oct = addr.split(".").map(Number);
  const shown = [...new Set(oct)].slice(0, 2);

  fab.tone("acme-web1", "active");
  fab.set({ address: `${addr}/${plen}`, "network bits": plen, "host bits": A.hostBits });
  fab.note(
    `${who}. An IPv4 address is 32 bits, written as four 8-bit numbers (octets) in decimal; the /${plen} says the first ${plen} bits name the network and the remaining ${A.hostBits} name a host on it.`,
    "intro",
  );

  rows.push(["address", addr, bits(A.a, plen)]);
  bitTable(titleA, ["active"]);
  fab.note(
    `In binary, ${addr} is ${bits(A.a)}: each octet is its decimal value in 8 bits (${shown.map((o) => `${o} = ${bin8(o)}`).join(", ")}). The bar marks where the ${plen} network bits end.`,
    "bits",
  );

  rows.push(["mask", intIp(A.mk), bits(A.mk, plen)]);
  bitTable(titleA, [undefined, "active"]);
  fab.set({ mask: intIp(A.mk) });
  fab.note(
    `/${plen} as a mask is ${plen} one-bits followed by ${A.hostBits} zero-bits: ${intIp(A.mk)}. Where the mask has a 1 the bit belongs to the network part, where it has a 0 it belongs to the host part.`,
    "mask",
  );

  rows.push(["AND = network", intIp(A.net), bits(A.net, plen)]);
  bitTable(titleA, [undefined, undefined, "done"]);
  fab.set({ network: `${intIp(A.net)}/${plen}` });
  fab.note(
    `AND each address bit with the mask bit below it: 1 AND 1 is 1, anything AND 0 is 0. The network bits pass through and the host bits are cleared, giving the network address ${intIp(A.net)}.`,
    "and",
  );

  rows.push(["broadcast", intIp(A.bc), bits(A.bc, plen)]);
  bitTable(titleA, [undefined, undefined, undefined, "compare"]);
  fab.set({ broadcast: intIp(A.bc) });
  fab.note(`Setting every host bit to 1 instead gives the broadcast address ${intIp(A.bc)}, which a packet uses to reach every host on the subnet at once.`, "broadcast");

  const hosts = 2 ** A.hostBits - 2;
  fab.table(1, { title: `${intIp(A.net)}/${plen}`, head: ["", "value"], rows: [["network", intIp(A.net)], ["first host", intIp(A.net + 1)], ["last host", intIp(A.bc - 1)], ["broadcast", intIp(A.bc)], ["usable hosts", `2^${A.hostBits} − 2 = ${num(hosts)}`]], tones: [undefined, "done", "done", undefined, "active"] });
  fab.set({ "usable hosts": num(hosts) });
  fab.note(
    custom
      ? `Every address in between can be given to a host: ${intIp(A.net + 1)} to ${intIp(A.bc - 1)}, that is 2^${A.hostBits} − 2 = ${num(hosts)}, because the all-zeros and all-ones host values are taken by the network and broadcast addresses.`
      : `Every address in between can be given to a host: 10.1.1.1 to 10.1.1.254, that is 2^8 − 2 = 254, because the all-zeros and all-ones host values are taken. In Acme's subnet 10.1.1.1 is the gateway and acme-web1 is 10.1.1.10.`,
    "range",
  );

  const near = custom ? intIp(A.bc - 1 === A.a ? A.net + 1 : A.bc - 1) : "10.1.1.11";
  const far = custom ? intIp((A.bc + 1) >>> 0) : "10.1.2.20";
  const andOf = (ip: string) => intIp((ipInt(ip) & A.mk) >>> 0);
  fab.table(1, {
    title: `Is the destination on my subnet (${intIp(A.net)})?`,
    head: ["destination", `AND ${intIp(A.mk)}`, "same network?"],
    rows: [
      [near, andOf(near), "yes: deliver directly"],
      [far, andOf(far), "no: send to the gateway"],
    ],
    tones: ["done", "compare"],
  });
  fab.note(
    `The same AND answers the question a host asks for every packet: is the destination on my subnet? ${near} AND ${intIp(A.mk)} is ${andOf(near)}, the same network, so it is delivered directly; ${far} gives ${andOf(far)}, a different network, so it goes to the default gateway (lesson 01-05).`,
    "test",
  );

  // /31
  const B = run(link.leaf, 31);
  rows.length = 0;
  rows.push(["leaf1 address", link.leaf, bits(B.a, 31)], ["mask", intIp(B.mk), bits(B.mk, 31)]);
  fab.tone("acme-web1", undefined);
  fab.tones([L1, S1], "active");
  fab.path([S1, L1]);
  fab.table(1, undefined);
  bitTable(`${link.leaf}/31, bit by bit`, ["active", undefined]);
  fab.set({ address: `${link.leaf}/31`, "network bits": 31, "host bits": 1, mask: intIp(B.mk) });
  fab.unset("network", "broadcast", "usable hosts");
  fab.note(
    `Now leaf1.ams's end of its link to spine1.ams, ${link.leaf}/31. This boundary does not fall between octets: 31 network bits leave a single host bit, the very last one, and the mask is ${intIp(B.mk)}.`,
    "intro",
  );

  const spineInt = ipInt(link.spine);
  rows.push(["AND = network", intIp(B.net), bits(B.net, 31)], ["spine1 address", link.spine, bits(spineInt, 31)]);
  bitTable(`${link.leaf}/31, bit by bit`, [undefined, undefined, "done", "active"]);
  fab.set({ network: link.net });
  fab.note(
    `${link.leaf} AND ${intIp(B.mk)} clears only the last bit, so the network is ${link.net}. spine1's address ${link.spine} differs only in that last bit, so its AND gives the same ${intIp(B.net)}: both ends are on one subnet.`,
    "and",
  );

  fab.table(1, { title: link.net, head: ["address", "used by"], rows: [[link.spine, "spine1.ams"], [link.leaf, "leaf1.ams"]], tones: ["done", "done"] });
  fab.set({ "usable hosts": "2 (RFC 3021)" });
  fab.note(
    `One host bit means only 2 addresses, ${link.spine} and ${link.leaf}. Under the usual rule (first is the network, last is broadcast) that would leave none for hosts, but a point-to-point link has exactly two ends and needs neither, so RFC 3021 lets both be used: spine1.ams is ${link.spine} and leaf1.ams is ${link.leaf}.`,
    "range",
  );

  fab.set({ "Amsterdam fabric links": "64 (4 spines × 16 leaves)", "addresses as /31": "128", "addresses as /30": "256" });
  fab.note(
    `The older habit of a /30 per link spends 4 addresses, two of them wasted on network and broadcast. Amsterdam's 64 fabric links (4 spines × 16 leaves) use 128 addresses as /31s instead of 256, and every leaf–spine link in Meridian's fabric is numbered this way.`,
    "scale",
  );

  const lb = loopback(L1);
  rows.length = 0;
  rows.push(["loopback", lb, bits(ipInt(lb))], ["mask /32", "255.255.255.255", bits(0xffffffff)]);
  fab.clearPath();
  fab.tones([S1], undefined);
  fab.state(L1, lb);
  bitTable(`${lb}/32, bit by bit`, ["active", undefined]);
  fab.table(1, { title: "How many hosts?", head: ["prefix", "addresses", "usable"], rows: [["/24", "256", "254"], ["/30", "4", "2"], ["/31", "2", "2 (point-to-point)"], ["/32", "1", "1 (the router itself)"]], tones: [undefined, undefined, undefined, "active"] });
  fab.set({ address: `${lb}/32`, "network bits": 32, "host bits": 0, mask: "255.255.255.255", network: `${lb}/32`, "usable hosts": "1" });
  fab.note(
    `Last, leaf1.ams's loopback ${lb}/32: all 32 bits are network bits, so the "subnet" is one address. It belongs to the router itself rather than to any link, so it stays reachable while any one of leaf1's links is up, which is why Meridian uses loopbacks as router IDs and tunnel endpoints.`,
    "loopback",
  );
  return fab.f.done();
};

// ---------- lpm-lookup ----------

interface Route {
  prefix: string;
  via: string;
  source: string;
}

/**
 * `lpm-lookup` (lesson 01-04). leaf1.ams, treated as a plain IP router as in
 * lesson 01-06, forwards acme-web1's packet to 198.51.100.25, a server of the
 * content network AS 64511 (RFC 5737 documentation range). Its routing table
 * has nine routes: the default and 198.51.100.0/24 via gw1.ams's loopback,
 * the more-specific 198.51.100.0/27 and 198.51.100.128/25 via gw2.ams's
 * loopback (where AS 64511 peers directly), IS-IS routes to both gateway
 * loopbacks over spine1/spine2, and connected subnets. Each prefix is checked
 * bit by bit, the /27 wins, then its next hop 10.255.1.202 is itself looked up
 * (10.255.1.202/32 via 10.254.1.0 and 10.254.2.0) down to the connected /31s,
 * and the resolved ECMP entry is what the FIB holds.
 *
 * Inputs: none. 12 frames.
 */
export const lpmLookup: FabGen = () => {
  const L1 = "leaf1.ams";
  const S1 = "spine1.ams";
  const S2 = "spine2.ams";
  const G1 = "gw1.ams";
  const G2 = "gw2.ams";
  const dst = "198.51.100.25";
  const s1 = p2p(L1, S1);
  const s2 = p2p(L1, S2);
  const g1 = loopback(G1);
  const g2 = loopback(G2);
  const fab = new Fab(
    [
      { id: "as64511", label: "AS 64511", kind: "cloud", state: "198.51.100.0/24" },
      { id: G1, kind: "gw", state: g1 },
      { id: G2, kind: "gw", state: g2 },
      { id: S1, kind: "spine" },
      { id: S2, kind: "spine" },
      { id: L1, kind: "leaf" },
      { id: "acme-web1", kind: "host", state: "10.1.1.10" },
    ],
    [
      ["as64511", G1, { label: "via ISP1", dashed: true }],
      ["as64511", G2, { label: "direct peering", dashed: true }],
      [G1, S1],
      [G1, S2],
      [G2, S1],
      [G2, S2],
      [S1, L1, { label: s1.net }],
      [S2, L1, { label: s2.net }],
      [L1, "acme-web1"],
    ],
  );
  const rib: Route[] = [
    { prefix: "0.0.0.0/0", via: g1, source: "BGP" },
    { prefix: "10.1.1.0/24", via: "connected, VLAN 100", source: "connected" },
    { prefix: "198.51.100.0/24", via: g1, source: "BGP" },
    { prefix: "198.51.100.128/25", via: g2, source: "BGP" },
    { prefix: "198.51.100.0/27", via: g2, source: "BGP" },
    { prefix: `${g1}/32`, via: `${s1.spine}, ${s2.spine}`, source: "IS-IS" },
    { prefix: `${g2}/32`, via: `${s1.spine}, ${s2.spine}`, source: "IS-IS" },
    { prefix: s1.net, via: "connected, to spine1", source: "connected" },
    { prefix: s2.net, via: "connected, to spine2", source: "connected" },
  ];
  const verdict: string[] = rib.map(() => "");
  const tones: (Tone | undefined)[] = rib.map(() => undefined);
  const show = () => fab.table(0, { title: `${L1} routing table (RIB)`, head: ["prefix", "next hop", "source", `match ${dst}?`], rows: rib.map((r, i) => [r.prefix, r.via, r.source, verdict[i]!]), tones: [...tones] });
  const d = ipInt(dst);
  let best = -1;
  const check = (i: number) => {
    const r = rib[i]!;
    const len = Number(r.prefix.split("/")[1]);
    const ok = inPrefix(dst, r.prefix);
    for (let k = 0; k < tones.length; k++) if (tones[k] === "active") tones[k] = undefined;
    if (ok && (best < 0 || len > Number(rib[best]!.prefix.split("/")[1]))) {
      if (best >= 0) tones[best] = "muted";
      best = i;
      tones[i] = "done";
    } else tones[i] = ok ? "muted" : "danger";
    verdict[i] = ok ? `yes, ${len} bits` : "no";
    return { r, len, ok };
  };
  const prefBits = (r: Route) => {
    const [net, len] = r.prefix.split("/");
    return bits(ipInt(net!), Number(len));
  };

  show();
  fab.path(["acme-web1", L1]);
  fab.send(
    "acme-web1",
    L1,
    `to ${dst}`,
    `leaf1.ams (here a plain IP router, as in lesson 01-06) receives a packet from acme-web1 for ${dst}, a server of the content network AS 64511 (198.51.100.0/24 is an RFC 5737 documentation range). Its routing table holds nine routes: connected subnets, IS-IS routes to the border gateways' loopbacks, and BGP routes that gw1.ams and gw2.ams advertise.`,
  );

  fab.clearPath();
  fab.set({ destination: dst, "destination bits": bits(d) });
  fab.state(L1, "LPM lookup", "active");
  fab.note(
    `In binary the destination is ${bits(d)}. A prefix /n matches when the destination's first n bits equal the prefix's first n bits, and among all the prefixes that match, the longest wins: longest-prefix match.`,
    "lpm",
  );

  let c = check(0);
  show();
  fab.set({ "best so far": `${c.r.prefix} (0 bits)` });
  fab.note(`0.0.0.0/0, the default route, has no bits to compare, so it matches every destination: a candidate of length 0, the route of last resort.`, "check");

  c = check(1);
  show();
  fab.set({ "prefix bits": prefBits(c.r) });
  fab.note(`10.1.1.0/24, acme-web1's own subnet: its first octet is 00001010 (10) and the destination's is 11000110 (198), so it fails on the very first bits.`, "check");

  c = check(2);
  show();
  fab.set({ "prefix bits": prefBits(c.r), "best so far": `${c.r.prefix} (24 bits)` });
  fab.note(`198.51.100.0/24: the destination's first 24 bits, 198.51.100, are exactly the prefix's, so it matches with length 24, the best so far, via gw1.ams's loopback ${g1}.`, "check");

  c = check(3);
  show();
  fab.set({ "prefix bits": prefBits(c.r) });
  fab.note(
    `198.51.100.128/25 covers 198.51.100.128 to .255. Bit 25 is the first bit of the last octet: 1 in the prefix (128 = 10000000), 0 in the destination (25 = 00011001), so it does not match even though it is longer.`,
    "check",
  );

  c = check(4);
  show();
  fab.set({ "prefix bits": prefBits(c.r), "best so far": `${c.r.prefix} (27 bits)` });
  fab.note(
    `198.51.100.0/27 covers .0 to .31 (AS 64511 sends it only over its direct peering with gw2.ams; the public internet normally filters anything longer than /24). Its 27 bits are the /24 plus the first three bits of the last octet, 000, and the destination's last octet starts 000 too, so it matches with length 27 and replaces the /24 as the best.`,
    "check",
  );

  for (let i = 5; i < rib.length; i++) check(i);
  tones[best] = "done";
  show();
  fab.unset("prefix bits");
  fab.set({ winner: `${rib[best]!.prefix} via ${rib[best]!.via}` });
  fab.state(L1, "winner /27", "done");
  fab.note(
    `The last four routes all have 10 as their first octet, so none match. The winner is 198.51.100.0/27 via ${g2}: a /27 names 32 addresses, the /24 names 256 and the default names all of them, so the longest match is the most precise statement anyone made about where this destination lives.`,
    "winner",
  );

  for (let k = 0; k < tones.length; k++) tones[k] = k === best ? "done" : undefined;
  tones[6] = "active";
  show();
  fab.state(L1, "resolve next hop", "active");
  fab.table(1, { title: "Recursive next-hop resolution", head: ["look up", "longest match", "gives"], rows: [[dst, "198.51.100.0/27 (BGP)", g2]], tones: ["done"] });
  fab.note(
    `But ${g2} is not on any of leaf1's links; it is gw2.ams's loopback, learned from BGP. So the router looks up the next hop itself in the same table: its longest match is ${g2}/32, an IS-IS route with two equal-cost next hops, ${s1.spine} and ${s2.spine}.`,
    "resolve",
  );

  tones[6] = "done";
  tones[7] = "active";
  tones[8] = "active";
  show();
  fab.table(1, {
    title: "Recursive next-hop resolution",
    head: ["look up", "longest match", "gives"],
    rows: [
      [dst, "198.51.100.0/27 (BGP)", g2],
      [g2, `${g2}/32 (IS-IS)`, `${s1.spine}, ${s2.spine}`],
      [s1.spine, `${s1.net} (connected)`, "port to spine1"],
      [s2.spine, `${s2.net} (connected)`, "port to spine2"],
    ],
    tones: ["done", "done", "active", "active"],
  });
  fab.note(
    `Each of those lies inside a connected /31: ${s1.spine} in ${s1.net} (the link to spine1) and ${s2.spine} in ${s2.net} (to spine2). A connected route ends the recursion, because a neighbour on a directly attached link can be reached by ARP.`,
    "resolve",
  );

  fab.clearRowTones(0);
  fab.rowTone(0, best, "done");
  fab.table(1, {
    title: `${L1} FIB entry (what the chip uses)`,
    head: ["prefix", "next hop", "out"],
    rows: [
      ["198.51.100.0/27", s1.spine, "port to spine1"],
      ["198.51.100.0/27", s2.spine, "port to spine2"],
    ],
    tones: ["done", "done"],
  });
  fab.state(L1, "FIB programmed", "done");
  fab.note(
    `The RIB is where routes are chosen; the FIB is what the forwarding chip reads. leaf1.ams writes the already-resolved answer into the FIB, an ECMP pair of next hops, so each packet needs one hardware lookup. Every BGP prefix via ${g2} points at the same next-hop group, so on chips with a hierarchical FIB an IS-IS change towards gw2.ams rewrites only that group, not every prefix.`,
    "fib",
  );

  fab.path([L1, S1, G2, "as64511"]);
  fab.state(L1, "to spine1", "done");
  fab.send(
    L1,
    S1,
    `to ${dst}`,
    `The flow's hash picks spine1.ams, which forwards to gw2.ams and on to AS 64511. Had the /27 been withdrawn, the very same lookup would fall back to the /24 via gw1.ams, and without that to the default route.`,
    { tone: "done" },
  );
  return fab.f.done();
};

// ---------- arp-gateway ----------

/**
 * `arp-gateway` (lesson 01-05). acme-web1 (10.1.1.10/24, gateway 10.1.1.1)
 * connects to acme-db1 (10.1.2.20, port 5432): the off-subnet decision (and
 * why 10.1.1.11 would be ARPed directly), an INCOMPLETE ARP entry with the SYN
 * queued, the ARP request broadcast in VLAN 100 (acme-app1 ignores it),
 * leaf1.ams answering for 10.1.1.1 with the anycast gateway MAC after
 * learning acme-web1 from the request, the REACHABLE cache entry, and the
 * first frame: destination IP acme-db1, destination MAC the gateway.
 *
 * Inputs: `variant: "no-reply"` replaces the reply: the gateway interface is
 * missing, three ARP probes one second apart go unanswered, the entry becomes
 * FAILED and connect() returns "No route to host" (EHOSTUNREACH). Default run
 * 11 frames, no-reply 10.
 */
export const arpGateway: FabGen = (input) => {
  const noReply = pick(input.variant, ["default", "no-reply"] as const, "default") === "no-reply";
  const web = HOSTS["acme-web1"];
  const db = HOSTS["acme-db1"];
  const L1 = "leaf1.ams";
  const fab = new Fab(
    [
      { id: L1, kind: "leaf", x: 40, y: 0, state: "gw 10.1.1.1" },
      { id: "acme-db1", kind: "host", x: 88, y: 0, state: db.ip },
      { id: "acme-web1", kind: "host", x: 20, y: 100, state: web.ip },
      { id: "acme-app1", kind: "host", x: 60, y: 100, state: "10.1.1.13" },
    ],
    [
      [L1, "acme-web1", { label: "VLAN 100" }],
      [L1, "acme-app1", { label: "VLAN 100" }],
      [L1, "acme-db1", { label: "via the fabric", dashed: true }],
    ],
    { height: 200 },
  );
  const route = (tones?: (Tone | undefined)[]) => fab.table(0, { title: "acme-web1 routing table", head: ["destination", "via", "device"], rows: [["10.1.1.0/24", "connected", "eth0"], ["default (0.0.0.0/0)", web.gateway, "eth0"]], tones });
  const cache = (rows: string[][], tones?: (Tone | undefined)[]) => fab.table(1, { title: "acme-web1 ARP cache (ip neigh)", head: ["IP", "MAC", "state"], rows, tones });
  const arpReq: HeaderSpec[] = [
    eth(MAC.bcast, web.mac, "0x0806 (ARP)"),
    { name: "ARP", size: 28, reader: "whoever owns the target IP", fields: { operation: "1 (request)", "sender MAC": web.mac, "sender IP": web.ip, "target MAC": "00:00:00:00:00:00", "target IP": web.gateway } },
  ];

  route();
  cache([]);
  fab.set({ "acme-web1": `${web.ip}/24, gateway ${web.gateway}` });
  fab.note(
    `acme-web1 (${web.ip}/24, default gateway ${web.gateway}) has just booted, so its ARP cache is empty. An application on it opens a connection to acme-db1 at ${db.ip}, PostgreSQL's port 5432.`,
    "topology",
  );

  route([undefined, "active"]);
  fab.state("acme-web1", "route lookup", "active");
  fab.set({ "10.1.2.20 AND 255.255.255.0": "10.1.2.0 ≠ 10.1.1.0" });
  fab.note(
    `First decision: is ${db.ip} on my subnet? ${db.ip} AND 255.255.255.0 is 10.1.2.0, not acme-web1's 10.1.1.0, so the connected route does not match and the default route does: the packet goes to the gateway ${web.gateway}. For 10.1.1.11 the answer would be yes, and acme-web1 would ARP for 10.1.1.11 itself.`,
    "decide",
  );

  cache([[web.gateway, "(none)", "INCOMPLETE"]], ["compare"]);
  fab.state("acme-web1", "SYN queued", "active");
  fab.note(
    `To build the frame acme-web1 needs the gateway's MAC address, and its ARP cache has no entry for ${web.gateway}. The kernel creates an INCOMPLETE entry and holds the TCP SYN in a small queue while it asks.`,
    "miss",
  );

  fab.headers(arpReq, "built by acme-web1");
  fab.note(
    `The ARP request is a broadcast, destination ff:ff:ff:ff:ff:ff with EtherType 0x0806, and inside it asks "who has ${web.gateway}? tell ${web.ip} at ${web.mac}". The target MAC is all zeros because it is exactly what is being asked for.`,
    "arp",
  );

  fab.at("on the link acme-web1 → leaf1.ams");
  fab.send(
    "acme-web1",
    L1,
    `who has ${web.gateway}?`,
    noReply
      ? `The request enters leaf1.ams, which floods it through VLAN 100 like any broadcast and would also hand it to its gateway interface for the subnet, if it had one.`
      : `The request enters leaf1.ams, which floods it through VLAN 100 like any broadcast and also hands it to its own gateway interface for the subnet.`,
  );
  fab.at("flooded in VLAN 100");

  if (noReply) {
    fab.state(L1, "no 10.1.1.1 here", "danger");
    fab.state("acme-app1", "not my IP", "muted");
    fab.set({ "probes sent": 1 });
    fab.send(
      L1,
      "acme-app1",
      `who has ${web.gateway}?`,
      `acme-app1 receives the broadcast and ignores it, since ${web.gateway} is not its address. In this run the gateway interface for VLAN 100 is missing on leaf1.ams (a change left half done), so nobody owns ${web.gateway} and no reply comes back.`,
      { tone: "compare", tag: "flood" },
    );
    fab.set({ "probes sent": 2, time: "t = 1 s" });
    fab.send("acme-web1", L1, `who has ${web.gateway}? (2)`, `One second later acme-web1 broadcasts the request again (Linux sends up to 3 broadcast probes, 1 s apart), and again nobody answers.`, { tag: "retry" });
    fab.set({ "probes sent": 3, time: "t = 2 s" });
    fab.send("acme-web1", L1, `who has ${web.gateway}? (3)`, `The third and last probe at t = 2 s goes unanswered too, while the TCP SYN still waits in the queue.`, { tag: "retry" });
    cache([[web.gateway, "(none)", "FAILED"]], ["danger"]);
    fab.state("acme-web1", "EHOSTUNREACH", "danger");
    fab.headers(undefined);
    fab.set({ time: "t = 3 s", "connect()": "No route to host" });
    fab.note(
      `At t = 3 s the entry becomes FAILED, the queued SYN is thrown away and connect() returns "No route to host" (EHOSTUNREACH); ping would print "Destination Host Unreachable" from 10.1.1.10 itself. The error comes from acme-web1, not from the network: no packet to acme-db1 was ever sent.`,
      "failed",
    );
    fab.note(
      `This is the "server can't ping its gateway" case, and the cache is the first clue: INCOMPLETE then FAILED means requests left but no reply came back. Check in order: is the link up, is the server port in the right VLAN, does the gateway interface exist and is it up, and does a capture on the server show the request leaving and nothing returning?`,
      "done",
    );
    return fab.f.done();
  }

  fab.state("acme-app1", "not my IP", "muted");
  fab.send(
    L1,
    "acme-app1",
    `who has ${web.gateway}?`,
    `acme-app1 receives the broadcast too and discards it, because ${web.gateway} is not its address. Every ARP request costs every host in the VLAN a little work, one reason large layer-2 domains are avoided.`,
    { tone: "compare", tag: "flood" },
  );

  fab.state("acme-app1", "10.1.1.13", "default");
  fab.state(L1, "replies", "active");
  fab.table(0, { title: `${L1} neighbour table, VLAN 100`, head: ["IP", "MAC", "learned from"], rows: [[web.ip, web.mac, "the ARP request"]], tones: ["active"] });
  fab.headers(
    [
      eth(web.mac, ANYCAST_GW_MAC, "0x0806 (ARP)"),
      { name: "ARP", size: 28, reader: "acme-web1", fields: { operation: "2 (reply)", "sender MAC": ANYCAST_GW_MAC, "sender IP": web.gateway, "target MAC": web.mac, "target IP": web.ip } },
    ],
    "on the link leaf1.ams → acme-web1",
  );
  fab.send(
    L1,
    "acme-web1",
    `${web.gateway} is at …01:01`,
    `leaf1.ams owns ${web.gateway}, so it answers. The request carried acme-web1's IP and MAC, so leaf1 first records ${web.ip} → ${web.mac} in its own neighbour table, then sends a unicast reply straight to that MAC: "${web.gateway} is at ${ANYCAST_GW_MAC}".`,
    { tone: "done", tag: "reply" },
  );

  fab.state(L1, "gw 10.1.1.1", "default");
  route([undefined, "active"]);
  cache([[web.gateway, ANYCAST_GW_MAC, "REACHABLE"]], ["done"]);
  fab.note(
    `acme-web1 caches ${web.gateway} → ${ANYCAST_GW_MAC} as REACHABLE. Linux keeps an entry REACHABLE for a random 15 to 45 seconds (base_reachable_time 30 s), then marks it STALE and confirms it again the next time it is used, so a gateway whose MAC changed is noticed.`,
    "cache",
  );

  fab.headers(
    [
      eth(ANYCAST_GW_MAC, web.mac),
      { name: "IPv4", size: 20, reader: "every router", fields: { src: web.ip, dst: db.ip, TTL: 64, protocol: "6 (TCP)" } },
      { name: "TCP", size: 40, reader: "acme-db1", fields: { "src port": 51514, "dst port": 5432, flags: "SYN" } },
    ],
    "on the link acme-web1 → leaf1.ams",
  );
  fab.state("acme-web1", web.ip, "done");
  fab.send(
    "acme-web1",
    L1,
    "TCP SYN to 10.1.2.20",
    `The queued SYN finally leaves: destination IP ${db.ip} (acme-db1) but destination MAC ${ANYCAST_GW_MAC} (the gateway). The IP header names the final destination; the Ethernet header names only the next device on this link.`,
    { tag: "send" },
  );

  fab.path([L1, "acme-db1"]);
  fab.at("as it reached leaf1.ams (leaf1 rewrites the MACs and TTL next)");
  fab.send(
    L1,
    "acme-db1",
    "routed onwards",
    `leaf1.ams accepts the frame because the destination MAC is its own gateway MAC, and routes it towards acme-db1 (the hop-by-hop walk of lesson 01-06). Every later packet to any off-subnet destination reuses this one cached entry: one ARP exchange serves them all.`,
    { tone: "done", tag: "route" },
  );

  fab.clearPath();
  fab.headers(undefined);
  fab.note(
    `Every Meridian leaf answers for ${web.gateway} with the same anycast gateway MAC, ${ANYCAST_GW_MAC}, so a server that moves to another leaf keeps a valid cache. When this goes wrong the cache shows it: an entry stuck at INCOMPLETE and then FAILED means no reply came back, which is why \`ip neigh\` on the server is the first thing to check when it cannot reach its gateway.`,
    "done",
  );
  return fab.f.done();
};

// ---------- pmtud-blackhole ----------

/**
 * `pmtud-blackhole` (lesson 01-07). acme-web1 (MTU 1,500) uploads over HTTPS
 * to acme-cloud1 (10.200.1.50) in Acme's cloud region. The fabric runs 9,216,
 * but gw1.ams reaches the cloud through a VXLAN tunnel across the internet
 * (1,500-byte path − 50 bytes of tunnel headers = MTU 1,450). Both SYNs carry
 * MSS 1,460, so the handshake works; the first 1,500-byte DF segment is
 * dropped at gw1.ams, its ICMP type 3 code 4 (next-hop MTU 1,450) is dropped
 * by acme-web1's host firewall, and TCP retransmits with RTO 200 → 3,200 ms:
 * the connection hangs. Then MSS clamping on gw1.ams rewrites both SYNs to
 * 1,410 and 1,450-byte packets flow.
 *
 * Inputs: none. 12 frames.
 */
export const pmtudBlackhole: FabGen = () => {
  const web = HOSTS["acme-web1"];
  const L1 = "leaf1.ams";
  const S1 = "spine1.ams";
  const G1 = "gw1.ams";
  const CG = "cloud-gw";
  const CL = "acme-cloud1";
  const cloudIp = "10.200.1.50";
  const fab = new Fab(
    [
      { id: "acme-web1", kind: "host", x: 6, y: 100, state: "MTU 1,500" },
      { id: L1, kind: "leaf", x: 20, y: 50 },
      { id: S1, kind: "spine", x: 36, y: 0 },
      { id: G1, kind: "gw", x: 60, y: 0, state: loopback(G1) },
      { id: CG, kind: "gw", x: 84, y: 50 },
      { id: CL, kind: "host", x: 94, y: 100, state: "MTU 1,500" },
    ],
    [
      ["acme-web1", L1, { label: "1,500" }],
      [L1, S1, { label: "9,216" }],
      [S1, G1, { label: "9,216" }],
      [G1, CG, { label: "tunnel MTU 1,450", dashed: true, tone: "compare" }],
      [CG, CL],
    ],
    { height: 260 },
  );
  const path = ["acme-web1", L1, S1, G1, CG, CL];
  const ip = (len: number, extra: Record<string, string | number> = {}): HeaderSpec => ({ name: "IPv4", size: 20, reader: "every router", fields: { src: web.ip, dst: cloudIp, "total length": num(len), DF: "1 (don't fragment)", protocol: "6 (TCP)", ...extra } });
  const tcp = (flags: string, extra: Record<string, string | number> = {}): HeaderSpec => ({ name: "TCP", size: flags === "SYN" ? 40 : 20, reader: "the two endpoints (MSS: also gw1.ams once clamping is on)", fields: { "src port": 40220, "dst port": 443, flags, ...extra } });
  const ipBack = (len: number): HeaderSpec => ({ name: "IPv4", size: 20, reader: "every router", fields: { src: cloudIp, dst: web.ip, "total length": num(len), DF: "1 (don't fragment)", protocol: "6 (TCP)" } });
  const tcpBack = (flags: string, mss: number): HeaderSpec => ({ name: "TCP", size: 40, reader: "the two endpoints (MSS: also gw1.ams once clamping is on)", fields: { "src port": 443, "dst port": 40220, flags, MSS: mss } });
  const sock = (rows: [string, string][], tones?: (Tone | undefined)[]) => fab.table(0, { title: `acme-web1 socket to ${cloudIp}:443`, head: ["", "value"], rows, tones });
  const counters = (frag: number, fw: number, clamped = 0) => fab.table(1, { title: "Counters", head: ["where", "counter", "value"], rows: [[G1, "ICMP frag-needed sent", frag], ["acme-web1", "firewall: ICMP dropped", fw], [G1, "SYNs MSS-clamped", clamped]], tones: [frag ? "compare" : undefined, fw ? "danger" : undefined, clamped ? "done" : undefined] });

  fab.set({ "fabric MTU": "9,216", "tunnel MTU": "1,450 (1,500 − 50)" });
  fab.note(
    `acme-web1 (${web.ip}) uploads a backup over HTTPS to acme-cloud1 (${cloudIp}) in Acme's cloud region. Meridian's fabric links carry 9,216-byte packets and both servers use 1,500, but gw1.ams reaches the cloud through a VXLAN tunnel across the internet, where packets are limited to 1,500 bytes and the tunnel's own headers take 50, so the tunnel's MTU is 1,450.`,
    "topology",
  );

  fab.path(path, "frontier");
  fab.headers([ip(60), tcp("SYN", { MSS: 1460 })], "the SYN from acme-web1");
  sock([["state", "SYN-SENT"], ["MSS advertised", "1,460"]]);
  counters(0, 0);
  fab.send(
    G1,
    CG,
    "SYN, MSS 1460",
    `acme-web1 opens the connection. Its SYN advertises MSS 1,460, the largest TCP segment it can receive (its 1,500-byte MTU minus 20 bytes of IP and 20 of TCP header), and the packet itself is only 60 bytes (20 of IP, 40 of TCP header with its options), so it crosses the tunnel without trouble.`,
  );

  fab.headers([ipBack(60), tcpBack("SYN ACK", 1460)], "the SYN-ACK from acme-cloud1");
  sock([["state", "ESTABLISHED"], ["MSS advertised", "1,460"], ["peer's MSS", "1,460"], ["segment size", "1,460 B (1,500 B packets)"]], [undefined, undefined, "active", "active"]);
  fab.send(
    CG,
    G1,
    "SYN-ACK, MSS 1460",
    `acme-cloud1 answers with a SYN-ACK that also says MSS 1,460, since its own MTU is 1,500, and the final ACK completes the handshake. Neither end knows the tunnel exists, so both now believe 1,460-byte segments are safe.`,
  );

  fab.headers([ip(1500), tcp("ACK PSH", { data: "1,460 B" })], "the first data segment, at gw1.ams");
  fab.state(G1, "1,500 > 1,450", "danger");
  fab.send(
    S1,
    G1,
    "1,500 B, DF",
    `The upload starts with full-size segments: 1,460 bytes of data in a 1,500-byte IP packet with the Don't Fragment (DF) bit set, which Linux sets on every TCP packet so it can discover the path's MTU. The fabric's 9,216-byte links carry it easily, as far as gw1.ams.`,
  );

  counters(1, 0);
  fab.send(
    G1,
    CG,
    "1,500 B, DF",
    `gw1.ams must send it into the 1,450-byte tunnel. The packet is 50 bytes too big and DF forbids splitting it, so gw1 drops it and sends acme-web1 an ICMP "destination unreachable, fragmentation needed" message (type 3, code 4) that names the next-hop MTU, 1,450.`,
    { lost: true, progress: 0.15 },
  );

  fab.headers(
    [
      { name: "IPv4", size: 20, reader: "every router", fields: { src: loopback(G1), dst: web.ip, protocol: "1 (ICMP)" } },
      { name: "ICMP", size: 8, tone: "compare", reader: "acme-web1's TCP stack (if it arrives)", fields: { type: "3 (unreachable)", code: "4 (fragmentation needed)", "next-hop MTU": 1450, quotes: "original IP header + 8 B" }, highlight: ["next-hop MTU"] },
    ],
    "the ICMP from gw1.ams to acme-web1",
  );
  counters(1, 1);
  fab.state("acme-web1", "drops ICMP except ping replies", "danger");
  fab.send(
    L1,
    "acme-web1",
    "ICMP frag needed, MTU 1450",
    `The ICMP message travels back and reaches acme-web1, whose host firewall, as "hardening", drops every inbound ICMP type except the echo replies that keep ping working. The one message that would have told TCP to shrink its segments to 1,410 bytes is discarded, and nothing else will ever tell it.`,
    { lost: true, progress: 0.85 },
  );

  fab.headers([ip(1500), tcp("ACK PSH", { data: "1,460 B" })], "retransmission 4, at gw1.ams");
  counters(5, 5);
  sock(
    [
      ["state", "ESTABLISHED"],
      ["segment size", "1,460 B (1,500 B packets)"],
      ["retransmits", "4 (t = 0.2, 0.6, 1.4, 3.0 s)"],
      ["next RTO", "3,200 ms"],
      ["bytes acknowledged", "0"],
    ],
    [undefined, undefined, "danger", "danger", "danger"],
  );
  fab.send(
    G1,
    CG,
    "1,500 B, DF (again)",
    `With no ACK, TCP resends the same 1,500-byte segment when its retransmission timeout (RTO) expires and doubles the timeout each time: 200, 400, 800 and 1,600 ms (200 ms is Linux's minimum, and the round trip here is about 2 ms). Every copy is dropped at gw1.ams and every ICMP message it triggers is dropped at acme-web1.`,
    { lost: true, progress: 0.15, tag: "retransmit" },
  );

  fab.state("acme-web1", "upload hung", "danger");
  fab.set({ symptom: "connects, then hangs", "gives up after": "about 15 minutes (tcp_retries2 = 15)" });
  fab.note(
    `The connection is ESTABLISHED and small packets still pass, but no full-size segment ever arrives, so the upload just hangs; Linux keeps retrying for about 15 minutes (tcp_retries2 = 15) before giving up. To the user it looks like a slow server, and the signals are elsewhere: retransmissions on acme-web1, rising ICMP frag-needed counters on gw1.ams, and the firewall's ICMP drop counter.`,
    "hang",
  );

  fab.state("acme-web1", "MTU 1,500", "default");
  fab.state(G1, "MSS clamp 1,410", "done");
  fab.unset("symptom", "gives up after");
  fab.set({ "MSS clamp": "1,410 = 1,450 − 20 − 20" });
  fab.headers([ip(60), tcp("SYN", { MSS: 1410 })], "a new SYN, leaving gw1.ams into the tunnel");
  counters(5, 5, 1);
  sock([["state", "SYN-SENT"], ["MSS advertised", "1,460 (rewritten to 1,410 by gw1)"]], [undefined, "done"]);
  fab.send(
    G1,
    CG,
    "SYN, MSS 1410",
    `The operator turns on MSS clamping on gw1.ams's tunnel: the MSS option of every TCP SYN and SYN-ACK passing through is rewritten down to 1,410 (1,450 minus 40 bytes of headers), and the TCP checksum fixed to match. A new connection's SYN leaves acme-web1 saying 1,460 and enters the tunnel saying 1,410.`,
    { tone: "done", tag: "clamp" },
  );

  fab.headers([ipBack(60), tcpBack("SYN ACK", 1410)], "the SYN-ACK, leaving gw1.ams towards acme-web1");
  counters(5, 5, 2);
  sock([["state", "ESTABLISHED"], ["peer's MSS", "1,410 (clamped by gw1)"], ["segment size", "1,410 B (1,450 B packets)"]], [undefined, "done", "done"]);
  fab.send(
    G1,
    S1,
    "SYN-ACK, MSS 1410",
    `acme-cloud1's SYN-ACK says 1,460 too, and gw1.ams rewrites it to 1,410 on its way back to acme-web1. Each end has now been told the other accepts at most 1,410 bytes per segment.`,
    { tone: "done", tag: "clamp" },
  );

  fab.path(path, "path");
  fab.state(G1, "1,450 fits", "done");
  fab.state(CL, "receiving", "done");
  fab.headers([ip(1450), tcp("ACK PSH", { data: "1,410 B" })], "a data segment at gw1.ams");
  sock(
    [
      ["state", "ESTABLISHED"],
      ["segment size", "1,410 B (1,450 B packets)"],
      ["retransmits", "0"],
      ["bytes acknowledged", "growing"],
    ],
    [undefined, "done", undefined, "done"],
  );
  fab.send(
    G1,
    CG,
    "1,450 B, DF",
    `acme-web1's segments are now 1,410 + 40 = 1,450 bytes, exactly the tunnel's MTU, so they cross without fragmentation, ACKs come back and the upload runs at full speed. No ICMP message was needed at all.`,
    { tone: "done" },
  );

  fab.headers(undefined);
  fab.note(
    `MSS clamping only repairs TCP, because only TCP carries an MSS: large UDP packets, such as big DNS responses or another tunnel's traffic, still depend on the ICMP message and still disappear into this hole (QUIC avoids it by probing the path itself). The real fixes are to stop filtering ICMP type 3 code 4 (and ICMPv6 Packet Too Big, since IPv6 routers never fragment) or to let the endpoint probe the path itself (packetization-layer PMTUD, net.ipv4.tcp_mtu_probing on Linux).`,
    "done",
  );
  return fab.f.done();
};

// ---------- switch-pipeline ----------

/**
 * `switch-pipeline` (lesson 01-08). Inside leaf1.ams (illustrative stages of
 * a current data center switch ASIC). acme-web1's TCP SYN to acme-db1 (the
 * packet of lesson 01-06, same MACs and checksums) goes ingress port → parser
 * (header vector) → L3 lookup (FIB LPM, ECMP to spine1) → ingress ACL (TCAM,
 * first match wins: rule 30 permits) → buffer and egress queue (traffic class
 * 0) → egress rewrite (TTL 64 → 63, checksum 0xe97d → 0xea7d, new MACs) → port
 * 49. Then a BGP KEEPALIVE from rr1.ams to leaf1's loopback hits the /32
 * receive entry and is punted: CoPP queue and policer, PCIe to the CPU, bgpd
 * resets the hold timer. Ends on why "BGP Established" is not "traffic flows".
 *
 * Inputs: none. 13 frames.
 */
export const switchPipeline: FabGen = () => {
  const web = HOSTS["acme-web1"];
  const db = HOSTS["acme-db1"];
  const L1 = "leaf1.ams";
  const S1 = "spine1.ams";
  const fab = new Fab(
    [
      { id: "in", label: "in: port 1", kind: "nic", x: 8, y: 0 },
      { id: "parser", label: "parser", kind: "switch", x: 32, y: 0 },
      { id: "lookup", label: "L3 lookup", kind: "switch", x: 56, y: 0 },
      { id: "acl", label: "ingress ACL", kind: "switch", x: 82, y: 0 },
      { id: "out", label: "out: port 49", kind: "nic", x: 20, y: 50 },
      { id: "rewrite", label: "rewrite", kind: "switch", x: 50, y: 50 },
      { id: "queue", label: "buffer + queue", kind: "switch", x: 82, y: 50 },
      { id: "copp", label: "CoPP", kind: "switch", x: 56, y: 100 },
      { id: "cpu", label: "CPU (NOS)", kind: "cpu", x: 86, y: 100 },
    ],
    [
      ["in", "parser"],
      ["parser", "lookup"],
      ["lookup", "acl"],
      ["acl", "queue"],
      ["queue", "rewrite"],
      ["rewrite", "out"],
      ["lookup", "copp", { label: "punt", dashed: true }],
      ["copp", "cpu", { label: "PCIe" }],
    ],
    { height: 300 },
  );
  const mac = { l1up: fab.portMac(L1, S1), s1l1: fab.portMac(S1, L1) };
  const ipf = { totalLength: 60, id: 0x3a1f, flagsFragment: 0x4000, protocol: 6, src: web.ip, dst: db.ip };
  const ipv4 = (ttl: number): HeaderSpec => ({ name: "IPv4", size: 20, reader: "lookup, ACL, rewrite", fields: { src: web.ip, dst: db.ip, TTL: ttl, DSCP: 0, protocol: "6 (TCP)", "header checksum": ipv4Checksum({ ...ipf, ttl }) } });
  const tcp: HeaderSpec = { name: "TCP", size: 40, reader: "ACL (ports), ECMP hash", fields: { "src port": 51514, "dst port": 5432, flags: "SYN" } };
  const stages = ["in", "parser", "lookup", "acl", "queue", "rewrite", "out", "copp", "cpu"];
  const at = (id: string, state: string) => {
    for (const s of stages) if (fab.node(s).tone === "active") fab.tone(s, "done");
    fab.state(id, state, "active");
  };
  const counters = (rows: (string | number)[][]) => fab.table(1, { title: `${L1} counters`, head: ["counter", "value"], rows });

  fab.set({ "data plane": "ASIC (all transit packets)", "control plane": "CPU: NOS, routing daemons", "management plane": "out-of-band port 172.16.1.11" });
  fab.note(
    `Inside leaf1.ams, with illustrative stages of a current data center switch chip. One ASIC does all the forwarding, 51.2 Tb/s on widely deployed chips and 102.4 Tb/s on the newest, while a separate CPU runs the network operating system (NOS) and the routing protocols over a PCIe link with a tiny fraction of that bandwidth; management traffic uses its own out-of-band port, 172.16.1.11.`,
    "topology",
  );

  fab.headers([eth(ANYCAST_GW_MAC, web.mac), ipv4(64), tcp], "arriving on port 1");
  at("in", "FCS ok");
  counters([["port 1 in packets", 1], ["port 1 FCS errors", 0]]);
  fab.note(
    `acme-web1's TCP SYN to acme-db1 (the packet of lesson 01-06) arrives on port 1. The port's MAC checks the frame check sequence first; a frame that fails is dropped right here and counted as an FCS error, before any lookup (a cut-through switch, already sending the frame on, can only corrupt the outgoing FCS so the next device drops it).`,
    "ingress",
  );

  at("parser", "header vector");
  fab.table(0, {
    title: "Parsed fields (header vector)",
    head: ["field", "value"],
    rows: [["dst MAC", ANYCAST_GW_MAC], ["EtherType", "0x0800"], ["IP src → dst", `${web.ip} → ${db.ip}`], ["TTL", 64], ["DSCP", 0], ["protocol, ports", "6, 51514 → 5432"]],
  });
  fab.note(
    `The parser walks the headers at line rate and copies the fields later stages need into a header vector: destination MAC, EtherType 0x0800, the IPv4 addresses, TTL 64, DSCP 0, protocol 6 and the TCP ports. Every later stage reads this vector, not the packet, which waits in the buffer.`,
    "parse",
  );

  at("lookup", "LPM 10.1.2.20");
  const fib: string[][] = [
    ["10.1.1.0/24", "connected", "VLAN 100"],
    ["10.1.2.0/24", "ECMP: 10.254.1.0, 10.254.2.0", "port 49, port 50"],
    [`${loopback(L1)}/32`, "receive", "CPU"],
    ["0.0.0.0/0", "ECMP: 10.254.1.0, 10.254.2.0", "port 49, port 50"],
  ];
  fab.table(0, { title: `${L1} FIB (hardware LPM table)`, head: ["prefix", "next hop", "out"], rows: fib, tones: [undefined, "active", undefined, undefined] });
  fab.set({ "next hop": "10.254.1.0 (spine1), port 49" });
  fab.note(
    `The destination MAC is leaf1's own gateway MAC, so the packet is routed. The longest-prefix match for 10.1.2.20 is 10.1.2.0/24, an ECMP group of two next hops, and the flow hash picks 10.254.1.0 on port 49 to spine1; the chip does this in a fixed number of clock cycles per packet, using algorithmic LPM tables in SRAM and TCAM.`,
    "lookup",
  );

  at("acl", "rule 30: permit");
  fab.table(0, {
    title: "Ingress ACL in TCAM (lowest rule number wins)",
    head: ["rule", "match", "action"],
    rows: [
      ["10", "TCP, any → any, dst port 23", "deny"],
      ["20", "10.1.1.0/24 → 10.255.0.0/16", "deny"],
      ["30", "any → any", "permit"],
    ],
    tones: ["muted", "muted", "done"],
  });
  counters([["port 1 in packets", 1], ["ACL rule 30 hits", 1]]);
  fab.note(
    `The ingress ACL lives in TCAM, a memory that compares the header vector with every rule at once, each rule a value and a mask, and takes the lowest-numbered match. Rule 10 (telnet) and rule 20 (tenant traffic to the fabric's loopback range 10.255.0.0/16) do not match, so rule 30 permits the packet and its hit counter goes up.`,
    "acl",
  );

  at("queue", "TC 0, port 49");
  fab.table(0, {
    title: "Port 49 egress queues",
    head: ["queue", "traffic", "depth"],
    rows: [
      ["0", "DSCP 0, best effort", "1 packet"],
      ["3", "RoCE (module 07)", "0"],
      ["6", "DSCP 48, network control", "0"],
    ],
    tones: ["active", undefined, undefined],
  });
  counters([["ACL rule 30 hits", 1], ["port 49 queue 0 drops", 0]]);
  fab.note(
    `The packet is stored in the chip's shared buffer and queued on port 49 in traffic class 0, chosen from its DSCP 0. A switch buffer is small for its speed (even 64 MB drains in 10 µs at 51.2 Tb/s), so when a queue's share is used up, new packets are tail-dropped and the port's discard counter rises.`,
    "queue",
  );

  at("rewrite", "TTL 64→63");
  fab.headers([eth(mac.s1l1, mac.l1up), ipv4(63), tcp], "after egress rewrite");
  fab.table(0, { title: "Adjacency (next-hop) table", head: ["next hop", "MAC", "port"], rows: [["10.254.1.0", mac.s1l1, "49"], ["10.254.2.0", fab.portMac("spine2.ams", L1), "50"]], tones: ["active", undefined] });
  fab.note(
    `At the head of the queue the egress pipeline rewrites the packet: TTL 64 → 63, IPv4 checksum ${ipv4Checksum({ ...ipf, ttl: 64 })} → ${ipv4Checksum({ ...ipf, ttl: 63 })}, and a new Ethernet header from the adjacency entry for 10.254.1.0: destination spine1's port MAC ${mac.s1l1}, source leaf1's port MAC ${mac.l1up}.`,
    "rewrite",
  );

  at("out", "to spine1");
  counters([["port 49 out packets", 1], ["packets seen by CPU", 0]]);
  fab.note(
    `The packet leaves on port 49 towards spine1.ams, typically under a microsecond to a few microseconds after it arrived, depending on the chip and on queueing. leaf1's CPU never saw it: transit traffic is forwarded entirely in hardware.`,
    "egress",
  );

  for (const s of stages) fab.state(s, undefined, "default");
  fab.node("in").label = "in: port 49";
  fab.headers(
    [
      eth(mac.l1up, mac.s1l1),
      { name: "IPv4", size: 20, reader: "lookup, CoPP", fields: { src: loopback("rr1.ams"), dst: loopback(L1), TTL: 63, DSCP: "48 (CS6)", protocol: "6 (TCP)" } },
      { name: "TCP", size: 20, reader: "the CPU's kernel", fields: { "src port": 50211, "dst port": 179, flags: "ACK PSH" } },
      { name: "BGP", size: 19, reader: "bgpd", fields: { marker: "16 × 0xff", length: 19, type: "4 (KEEPALIVE)" } },
    ],
    "arriving on port 49 from spine1.ams",
  );
  at("in", "from spine1");
  fab.table(0, undefined);
  fab.note(
    `A different packet arrives on port 49: a BGP KEEPALIVE from the route reflector rr1.ams (${loopback("rr1.ams")}) to leaf1's own loopback ${loopback(L1)}, TCP destination port 179, marked DSCP 48 (CS6, network control). It goes through the same parser.`,
    "punt",
  );

  fab.tone("parser", "done");
  at("lookup", "receive → CPU");
  fab.table(0, { title: `${L1} FIB (hardware LPM table)`, head: ["prefix", "next hop", "out"], rows: fib, tones: [undefined, undefined, "active", undefined] });
  fab.linkSet("lookup", "copp", { tone: "path" });
  fab.note(
    `The longest match for ${loopback(L1)} is leaf1's own /32, programmed as a receive entry: this packet is for the switch, not through it. Instead of choosing an egress port, the chip traps it towards the CPU, which is called a punt.`,
    "punt",
  );

  at("copp", "BGP queue: ok");
  fab.table(0, {
    title: "Control-plane policing (illustrative rates)",
    head: ["class", "match", "limit"],
    rows: [
      ["BGP", "TCP 179", "protected queue"],
      ["IS-IS", "IS-IS PDUs", "protected queue"],
      ["ARP", "EtherType 0x0806", "low rate"],
      ["TTL expired", "TTL 1 transit", "very low rate"],
    ],
    tones: ["active", undefined, undefined, undefined],
  });
  counters([["CoPP BGP passed", 1], ["CoPP ARP dropped", 0]]);
  fab.note(
    `Punted packets pass control-plane policing (CoPP): a queue and a rate limiter per class, because the PCIe link and the CPU handle a tiny fraction of what the ports can deliver. BGP has its own protected queue, so a flood of ARP or TTL-expired packets is dropped at its own policer and cannot starve the routing protocols.`,
    "copp",
  );

  at("cpu", "hold timer reset");
  fab.linkSet("copp", "cpu", { tone: "path" });
  fab.note(
    `On the CPU the kernel's TCP stack delivers the KEEPALIVE to the BGP daemon (bgpd in FRRouting, which SONiC and Cumulus use), and bgpd resets the session's hold timer. Route changes travel the other way: bgpd updates the RIB, and the NOS programs the ASIC's FIB through the chip vendor's SDK over the same PCIe link.`,
    "cpu",
  );

  fab.clearPath();
  fab.headers(undefined);
  fab.table(0, {
    title: "Which path proves what",
    head: ["signal", "proves"],
    rows: [
      ["BGP session Established", "punt path, CoPP, CPU and bgpd work"],
      ["route in the RIB", "the control plane chose it"],
      ["entry in the hardware FIB", "the ASIC can forward it"],
      ["port and queue drop counters", "what the ASIC actually did"],
    ],
  });
  fab.note(
    `So "BGP is Established" proves only the CPU path. Transit traffic depends on what was programmed into the ASIC, and a failed FIB write, a full hardware table or a wrong ACL drops traffic while every protocol looks healthy, which is why tooling should compare the RIB with the hardware FIB and watch drop counters, not just session states.`,
    "done",
  );
  return fab.f.done();
};

// ---------- linux-rx-path ----------

/**
 * `linux-rx-path` (lesson 01-09). acme-db1 (Linux, 25 Gb/s NIC with 8 RX
 * queues) receives data segments of acme-web1's PostgreSQL connection: NIC
 * (FCS, RSS picks queue 3), DMA into RX ring 3 (1,024 descriptors), MSI-X
 * interrupt on CPU 3, NAPI poll (64 per poll, netdev_budget 300), GRO (four
 * 1,460-byte segments into one of 5,840), IP (local delivery, netfilter), TCP
 * (socket lookup, ACK), socket receive queue (tcp_rmem max 6 MB, 32 MB since Linux 6.16), recv() in
 * postgres. Each stage adds the counter that shows its drops. Then a 1 ms
 * softirq stall at line rate (2.03 Mpps) fills the ring in about 0.5 ms and
 * the NIC drops 1,008 frames (chart), which TCP treats as congestion.
 *
 * Inputs: none. 12 frames.
 */
export const linuxRxPath: FabGen = () => {
  const web = HOSTS["acme-web1"];
  const db = HOSTS["acme-db1"];
  const L3 = "leaf3.ams";
  const fab = new Fab(
    [
      { id: L3, kind: "leaf", x: 14, y: 0, state: "25 Gb/s" },
      { id: "nic", label: "NIC", kind: "nic", x: 14, y: 25 },
      { id: "ring", label: "RX ring 3", kind: "nic", x: 14, y: 50 },
      { id: "napi", label: "IRQ + NAPI", kind: "cpu", x: 14, y: 75 },
      { id: "gro", label: "GRO", kind: "cpu", x: 14, y: 100 },
      { id: "ip", label: "IP", kind: "cpu", x: 80, y: 100 },
      { id: "tcp", label: "TCP", kind: "cpu", x: 80, y: 75 },
      { id: "sock", label: "socket buffer", kind: "cpu", x: 80, y: 50 },
      { id: "app", label: "postgres", kind: "server", x: 80, y: 25 },
    ],
    [
      [L3, "nic", { label: "wire" }],
      ["nic", "ring", { label: "DMA" }],
      ["ring", "napi"],
      ["napi", "gro"],
      ["gro", "ip"],
      ["ip", "tcp"],
      ["tcp", "sock"],
      ["sock", "app", { label: "recv()" }],
    ],
    { height: 380 },
  );
  const stages = ["nic", "ring", "napi", "gro", "ip", "tcp", "sock", "app"];
  const at = (id: string, state: string) => {
    for (const s of stages) if (fab.node(s).tone === "active") fab.tone(s, "done");
    fab.state(id, state, "active");
  };
  const drops: string[][] = [];
  const dropTable = (hot?: number) => fab.table(1, { title: "Where acme-db1 counts drops", head: ["stage", "drop", "counter"], rows: drops, tones: drops.map((_, i) => (i === hot ? "danger" : undefined)) });
  const ipv4 = (len: number): HeaderSpec => ({ name: "IPv4", size: 20, reader: "IP layer", fields: { src: web.ip, dst: db.ip, TTL: 62, "total length": num(len), protocol: "6 (TCP)" } });
  const tcp = (data: string): HeaderSpec => ({ name: "TCP", size: 20, reader: "TCP layer, socket lookup", fields: { "src port": 51514, "dst port": 5432, flags: "ACK PSH", data } });

  fab.headers([eth(db.mac, ANYCAST_GW_MAC), ipv4(1500), tcp("1,460 B")], "arriving from leaf3.ams");
  fab.set({ host: `acme-db1 (${db.ip}), Linux`, flow: `${web.ip}:51514 → ${db.ip}:5432` });
  fab.note(
    `acme-db1 is a Linux server with a 25 Gb/s NIC, and a burst of data segments for its PostgreSQL connection from acme-web1 (${web.ip}:51514 → ${db.ip}:5432) is arriving from leaf3.ams. Follow one frame from the wire to the application, and at each step note where a drop would be counted.`,
    "topology",
  );

  at("nic", "RSS → queue 3");
  drops.push(["NIC", "bad FCS", "ethtool -S: rx_crc_errors"]);
  dropTable();
  fab.send(
    L3,
    "nic",
    "1,518 B frame",
    `The NIC checks the frame check sequence and that the destination MAC is its own, then picks a receive queue: RSS (receive side scaling) hashes the 5-tuple and this flow's hash selects queue 3 of 8, so every packet of the flow lands on the same queue and CPU.`,
  );

  at("ring", "1 filled / 1,024");
  drops.push(["RX ring", "no free descriptor", "ethtool -S: rx_missed_errors / rx_out_of_buffer"]);
  dropTable();
  fab.table(0, { title: "RX ring 3", head: ["", "descriptors"], rows: [["ring size (ethtool -g)", "1,024"], ["filled, waiting for the kernel", "1"], ["free for the NIC", "1,023"]] });
  fab.send(
    "nic",
    "ring",
    "DMA",
    `The NIC copies the frame by DMA straight into a buffer the driver allocated in advance and marks the next descriptor of RX ring 3 as filled, all without the CPU. If the kernel has fallen behind and no free descriptor is left, the frame has nowhere to go and the NIC drops it, under a driver-specific name such as rx_missed_errors (Intel) or rx_out_of_buffer (NVIDIA ConnectX).`,
  );

  at("napi", "IRQ → CPU 3");
  fab.set({ "IRQ affinity": "queue 3 → CPU 3" });
  fab.note(
    `The NIC raises queue 3's MSI-X interrupt, which IRQ affinity has pinned to CPU 3. The handler does almost nothing: it masks further interrupts from this queue and schedules NAPI polling in the NET_RX softirq, so a burst of thousands of frames costs one interrupt, not thousands.`,
    "irq",
  );

  fab.state("napi", "poll: 64 / 300", "active");
  fab.state("ring", "0 filled / 1,024", "done");
  drops.push(["softirq", "budget used up (not a drop)", "/proc/net/softnet_stat col 3: time_squeeze"], ["backlog (RPS)", "backlog queue full", "/proc/net/softnet_stat col 2"]);
  dropTable();
  fab.table(0, { title: "NAPI poll on CPU 3", head: ["setting", "value"], rows: [["per poll (driver weight)", "64 packets"], ["per softirq run (net.core.netdev_budget)", "300 packets"], ["ring refill", "fresh buffer per descriptor taken"]] });
  fab.send(
    "ring",
    "napi",
    "poll",
    `In the softirq the driver's NAPI poll function takes filled descriptors off the ring, up to 64 per poll and 300 per softirq run (net.core.netdev_budget), wraps each in an sk_buff, notes that the NIC already verified the TCP checksum, and refills the ring with fresh buffers. If the budget runs out with frames still waiting, softnet_stat counts a time_squeeze, and interrupts stay off until the ring is empty.`,
  );

  at("gro", "4 → 1 segment");
  fab.table(0, {
    title: "GRO merges in-order segments of one flow",
    head: ["segment", "seq (relative)", "bytes"],
    rows: [["1", "1", "1,460"], ["2", "1,461", "1,460"], ["3", "2,921", "1,460"], ["4", "4,381", "1,460"], ["merged", "1", "5,840"]],
    tones: [undefined, undefined, undefined, undefined, "done"],
  });
  fab.headers([eth(db.mac, ANYCAST_GW_MAC), ipv4(5880), tcp("5,840 B")], "after GRO, one large sk_buff");
  fab.send(
    "napi",
    "gro",
    "4 segments",
    `Generic Receive Offload (GRO) merges consecutive in-order segments of the same flow into one large sk_buff before the stack sees them: here four 1,460-byte segments become one of 5,840 bytes, so the IP and TCP code run once instead of four times.`,
  );

  at("ip", "local delivery");
  drops.push(["IP + netfilter", "bad header, firewall rule", "nstat: IpInHdrErrors, IpInDiscards; rule counters"]);
  dropTable();
  fab.table(0, undefined);
  fab.send(
    "gro",
    "ip",
    "5,840 B",
    `ip_rcv checks the IPv4 header, and the routing decision finds ${db.ip} is one of acme-db1's own addresses, so the packet goes up the stack instead of being forwarded. Netfilter's PREROUTING and INPUT hooks run here: a firewall drop shows only in that rule's counter, and malformed headers in IpInHdrErrors.`,
  );

  at("tcp", "socket found");
  fab.send(
    "ip",
    "tcp",
    "5,840 B",
    `tcp_v4_rcv finds the connection's socket by its 5-tuple, checks the sequence numbers are the ones it expects, queues the 5,840 bytes in order and schedules an ACK to acme-web1. A segment with no matching socket would be answered with a RST instead.`,
  );

  at("sock", "Recv-Q 5,840");
  drops.push(["socket buffer", "receive memory exhausted", "nstat: TcpExtTCPRcvQDrop; ss: Recv-Q"]);
  dropTable();
  fab.table(0, { title: "Socket receive queue (ss -tm)", head: ["", "value"], rows: [["Recv-Q", "5,840 B"], ["buffer limit (tcp_rmem max)", "6 MB (32 MB since Linux 6.16)"], ["window advertised", "shrinks as Recv-Q grows"]], tones: ["active", undefined, undefined] });
  fab.send(
    "tcp",
    "sock",
    "5,840 B",
    `The data waits in the socket's receive queue, Recv-Q in \`ss\`. The buffer can grow to tcp_rmem's maximum (by default 6 MB, or 32 MB since Linux 6.16), and the window TCP advertises to acme-web1 shrinks as it fills; if postgres stops reading, the window reaches zero and the sender pauses, and if memory runs out anyway segments are dropped and counted in TcpExtTCPRcvQDrop.`,
  );

  at("app", "recv() 5,840 B");
  fab.table(0, { title: "Socket receive queue (ss -tm)", head: ["", "value"], rows: [["Recv-Q", "0 B"], ["buffer limit (tcp_rmem max)", "6 MB (32 MB since Linux 6.16)"], ["window advertised", "full again"]], tones: ["done", undefined, undefined] });
  fab.send(
    "sock",
    "app",
    "recv()",
    `postgres, woken through epoll, calls recv() and the kernel copies the 5,840 bytes into its memory, so Recv-Q drops back to 0. Everything from the interrupt to the socket queue ran in software on CPU 3 (only this copy runs wherever postgres is scheduled), which is why one busy CPU can hold up a whole receive queue.`,
    { tone: "done" },
  );

  // The failure case: a softirq stall at line rate.
  for (const s of stages) fab.state(s, undefined, "default");
  fab.headers(undefined);
  const pps = 25e9 / (1538 * 8);
  const RING = 1024;
  const occ: number[] = [];
  const lost: number[] = [];
  for (let k = 0; k <= 10; k++) {
    const arrived = Math.round(pps * k * 1e-4);
    occ.push(Math.min(RING, arrived));
    lost.push(Math.max(0, arrived - RING));
  }
  const total = last(lost);
  fab.chart({ title: "RX ring 3 while CPU 3 is stalled for 1 ms", unit: "frames", yMax: 1200, xLabel: "0 to 1 ms, 0.1 ms steps", series: [{ name: "ring occupancy", tone: "compare", points: occ }, { name: "dropped (missed)", tone: "danger", points: lost }], marks: [{ y: RING, label: "ring size 1,024", tone: "danger" }] });
  fab.state("ring", "full", "danger");
  fab.state("napi", "CPU 3 stalled", "danger");
  fab.state("nic", `dropped ${num(total)}`, "danger");
  dropTable(1);
  fab.table(0, undefined);
  fab.set({ "line rate": `${num(Math.round(pps))} frames/s`, "ring full after": `${dec(RING / pps * 1000, 2)} ms`, "rx_missed_errors": `+${num(total)}` });
  fab.note(
    `Now the failure case: CPU 3 is kept busy for 1 ms and cannot run the softirq, while full-size frames keep arriving at 25 Gb/s line rate, about ${num(Math.round(pps / 10000) * 10000)} per second. The 1,024 descriptors fill in about ${dec((RING / pps) * 1000, 1)} ms and the NIC drops the remaining ${num(total)} frames, counted only in its missed counter.`,
    "burst",
  );

  fab.note(
    `TCP treats those ${num(total)} drops exactly like drops in the network: acme-web1 retransmits and cuts its sending rate, so from outside a host-side drop looks like a network problem. The counters in the table say where it happened, and the fixes are host-side too: a larger ring (ethtool -G), more queues spread over more CPUs (RSS and IRQ affinity), or keeping other work off the CPUs that handle network interrupts.`,
    "done",
  );
  return fab.f.done();
};


export const scenarios: Record<string, FabGen> = {
  "ethernet-frame": ethernetFrame,
  "mac-learning": macLearning,
  "vlan-trunk": vlanTrunk,
  "broadcast-storm": broadcastStorm,
  "subnet-math": subnetMath,
  "lpm-lookup": lpmLookup,
  "arp-gateway": arpGateway,
  "pmtud-blackhole": pmtudBlackhole,
  "switch-pipeline": switchPipeline,
  "linux-rx-path": linuxRxPath,
};

export const labels: Record<string, string> = {
  "ethernet-frame": "The Ethernet frame, field by field, and serialisation delay",
  "mac-learning": "MAC learning: learn, flood, forward, age out",
  "vlan-trunk": "VLANs: access ports and the 802.1Q tag on a trunk",
  "broadcast-storm": "A broadcast storm in a loop, stopped by spanning tree",
  "subnet-math": "Subnet math bit by bit: /24, /31 and /32",
  "lpm-lookup": "Longest-prefix match and recursive next-hop resolution",
  "arp-gateway": "ARP for the default gateway",
  "pmtud-blackhole": "Path-MTU black hole and MSS clamping",
  "switch-pipeline": "Inside a switch ASIC: forwarded vs punted",
  "linux-rx-path": "The Linux receive path and where drops are counted",
};
