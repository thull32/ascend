// Mechanism tests for the overlay pack (module 06): each scenario's key
// behaviour pinned to concrete values. fabric.test.ts covers the generic
// checks (frame counts, notes, node references, rendering).
import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import type { Frame } from "../engine";
import { FabricRenderer, type FabHeader, type FabricInput, type FabricState } from "./fabric-core";
import { labels, scenarios } from "./fabric-scenarios-overlay";

const run = (name: string, input: FabricInput = {}): Frame<FabricState>[] => scenarios[name]!(input);
const last = <T>(xs: T[]) => xs[xs.length - 1]!;
const fields = (h: FabHeader | undefined) => Object.fromEntries((h?.fields ?? []).map((f) => [f.k, f.v]));
const header = (f: Frame<FabricState>, name: string) => f.state.headers?.stack.find((h) => h.name === name);
const table = (f: Frame<FabricState>, title: string) => f.state.tables.find((t) => t.title.includes(title));
const sends = (frames: Frame<FabricState>[], from: string, to: string) => frames.filter((f) => f.state.packets.some((p) => p.from === from && p.to === to));

const RUNS: [string, FabricInput][] = [
  ["evpn-mac-learning", {}],
  ["evpn-mac-learning", { variant: "mac-move" }],
  ["symmetric-irb", {}],
  ["symmetric-irb", { variant: "asymmetric" }],
  ["bum-replication", {}],
  ["evpn-multihoming", {}],
  ["overlay-packet-walk", {}],
  ["overlay-packet-walk", { variant: "rt-leak" }],
  ["mpls-label-switching", {}],
  ["mpls-label-switching", { variant: "sr-mpls" }],
];

describe("overlay pack", () => {
  it("exports the six planned scenarios with labels", () => {
    expect(Object.keys(scenarios).sort()).toEqual(["bum-replication", "evpn-mac-learning", "evpn-multihoming", "mpls-label-switching", "overlay-packet-walk", "symmetric-irb"]);
    for (const k of Object.keys(scenarios)) expect(labels[k]).toBeTruthy();
  });

  it.each(RUNS)("%s %j stays within 8-25 frames with distinct, finished notes", (name, input) => {
    const frames = run(name, input);
    expect(frames.length).toBeGreaterThanOrEqual(8);
    expect(frames.length).toBeLessThanOrEqual(25);
    expect(new Set(frames.map((f) => f.note)).size).toBe(frames.length);
    for (const f of frames) {
      expect(f.note).toMatch(/[.)]$/);
      expect(f.note).not.toMatch(/undefined|NaN|\[object/);
    }
    for (const idx of [0, Math.floor(frames.length / 2), frames.length - 1]) {
      const { container, unmount } = render(createElement(FabricRenderer, { frame: frames[idx]!, input, index: idx, total: frames.length }));
      expect(container.querySelector("svg")).not.toBeNull();
      unmount();
    }
  });

  it("treats unknown variants as the default run", () => {
    for (const name of Object.keys(scenarios)) expect(run(name, { variant: "nonsense" }).map((f) => f.note)).toEqual(run(name).map((f) => f.note));
  });
});

describe("evpn-mac-learning", () => {
  const frames = run("evpn-mac-learning");

  it("reflects the type-2 route with ORIGINATOR_ID and a growing CLUSTER_LIST while NEXT_HOP stays leaf1's VTEP", () => {
    const withUpdate = frames.filter((f) => header(f, "BGP UPDATE"));
    expect(withUpdate.length).toBeGreaterThanOrEqual(4);
    for (const f of withUpdate) expect(fields(header(f, "BGP UPDATE")).NEXT_HOP).toBe("10.255.1.11");
    const lists = [...new Set(withUpdate.map((f) => fields(header(f, "BGP UPDATE")).CLUSTER_LIST).filter(Boolean))];
    expect(lists).toEqual(["10.255.1.101", "10.255.2.101, 10.255.1.101"]);
    const nlri = fields(header(withUpdate[0]!, "EVPN type-2 (MAC/IP)"));
    expect(nlri).toMatchObject({ RD: "10.255.1.11:10100", MAC: "00:00:5e:00:53:0a", IP: "10.1.1.10", "label 1 (L2VNI)": "10100", "label 2 (L3VNI)": "50001" });
    expect(fields(header(withUpdate[0]!, "Extended communities"))["route targets"]).toBe("65000:10100, 65000:50001");
  });

  it("the Globex-only leaf discards it and leaf2.sin installs it behind 10.255.1.11", () => {
    const imp = frames.find((f) => f.tag === "install")!;
    expect(table(imp, "Import check")!.rows.map((r) => [r[0], r[2]])).toEqual([
      ["leaf2.ams", "no match: discarded"],
      ["leaf2.sin", "match: imported"],
    ]);
    expect(table(imp, "leaf2.sin MAC table")!.rows).toContainEqual(["00:00:5e:00:53:0a", "VTEP 10.255.1.11", "EVPN type-2"]);
  });

  it("ARP suppression answers acme-web2 locally with acme-web1's MAC and floods nothing", () => {
    const reply = frames.filter((f) => f.tag === "suppress").find((f) => f.state.packets[0]?.from === "leaf2.sin")!;
    expect(reply.state.packets).toHaveLength(1);
    expect(reply.state.packets[0]!.to).toBe("acme-web2");
    expect(fields(header(reply, "ARP"))).toMatchObject({ opcode: "2 (reply)", "sender MAC": "00:00:5e:00:53:0a", "sender IP": "10.1.1.10" });
    expect(reply.state.vars["ARP requests flooded into VNI 10100"]).toBe(0);
  });

  it("mac-move: the higher MAC Mobility sequence wins and leaf1.ams withdraws", () => {
    const mv = run("evpn-mac-learning", { variant: "mac-move" });
    expect(mv.length).toBe(frames.length + 5);
    const adv = mv.find((f) => fields(header(f, "Extended communities"))["MAC Mobility"] === "sequence 1")!;
    expect(fields(header(adv, "EVPN type-2 (MAC/IP)")).RD).toBe("10.255.1.14:10100");
    const moved = mv.find((f) => table(f, "two routes for"))!;
    expect(table(moved, "leaf2.sin MAC table")!.rows[1]).toEqual(["00:00:5e:00:53:0a", "VTEP 10.255.1.14", "EVPN type-2, seq 1"]);
    expect(mv.some((f) => f.state.packets.some((p) => p.from === "leaf1.ams" && p.label.startsWith("WITHDRAW")))).toBe(true);
    expect(last(mv).state.links.some((l) => l.a === "acme-web1" && l.b === "leaf4.ams")).toBe(true);
  });
});

describe("symmetric-irb", () => {
  const innerTtl = (f: Frame<FabricState>) => fields(header(f, "IPv4")).TTL;
  const vni = (f: Frame<FabricState>) => fields(header(f, "VXLAN")).VNI;

  it("routes at both leaves: inner TTL 64 → 63 → 62, VNI 50001 across, inner frame to leaf3's router MAC", () => {
    const frames = run("symmetric-irb");
    const s = frames.filter((f) => f.tag === "send");
    expect(s.map((f) => `${f.state.packets[0]!.from}>${f.state.packets[0]!.to}`)).toEqual(["acme-web1>leaf1.ams", "leaf1.ams>spine1.ams", "spine1.ams>leaf3.ams", "leaf3.ams>acme-db1"]);
    expect(s.map(innerTtl)).toEqual(["64", "63", "63", "62"]);
    for (const f of s.slice(1, 3)) {
      expect(vni(f)).toBe("50001");
      expect(fields(header(f, "Ethernet"))["dst MAC"]).not.toBe("00:00:5e:00:53:14");
      expect(fields(header(f, "Outer IPv4"))).toMatchObject({ src: "10.255.1.11", dst: "10.255.1.13" });
    }
    expect(s.map((f) => fields(header(f, "Outer IPv4")).TTL).slice(1, 3)).toEqual(["64", "63"]);
    expect(fields(header(s[3]!, "Ethernet"))).toMatchObject({ "dst MAC": "00:00:5e:00:53:14", "src MAC": "00:00:5e:00:01:01" });
    const lookup = frames.find((f) => f.tag === "lookup")!;
    expect(table(lookup, "VRF ACME")!.tones![2]).toBe("active");
    expect(table(lookup, "VRF ACME")!.rows[2]![0]).toBe("10.1.2.20/32");
  });

  it("asymmetric: routed once into VLAN 200, carried in VNI 10101, bridged at leaf3", () => {
    const frames = run("symmetric-irb", { variant: "asymmetric" });
    const s = frames.filter((f) => f.tag === "send");
    expect(s.map(innerTtl)).toEqual(["64", "63", "63", "63"]);
    expect(vni(s[1]!)).toBe("10101");
    expect(fields(header(s[1]!, "Ethernet"))["dst MAC"]).toBe("00:00:5e:00:53:14");
    expect(frames.filter((f) => f.tag === "route")).toHaveLength(1);
  });

  it("recomputes the real inner IPv4 checksum at each routing step", () => {
    const sums = run("symmetric-irb").filter((f) => f.tag === "send").map((f) => fields(header(f, "IPv4"))["header checksum"]);
    expect(sums[0]).toBe("0xe97d");
    expect(sums[1]).toBe("0xea7d");
    expect(new Set(sums).size).toBe(3);
  });
});

describe("bum-replication", () => {
  const frames = run("bum-replication");

  it("builds the flood list from type-3 routes, without the Globex-only leaf", () => {
    const t3 = frames.find((f) => f.tag === "type3")!;
    expect(table(t3, "flood list")!.rows.map((r) => r[0])).toEqual(["10.255.1.13", "10.255.1.14", "10.255.2.11", "10.255.2.12"]);
    expect(fields(t3.state.headers!.stack[0])["PMSI tunnel type"]).toBe("6 (ingress replication)");
  });

  it("ingress replication puts four copies on leaf1's uplinks, two on the circuit; multicast one of each", () => {
    const rep = frames.filter((f) => f.tag === "replicate" && f.state.packets.length > 0);
    expect(rep[0]!.state.packets.filter((p) => p.from === "leaf1.ams")).toHaveLength(4);
    expect(rep[1]!.state.packets.filter((p) => p.from === "spine1.ams" && p.to === "spine1.sin")).toHaveLength(2);
    const mc = frames.filter((f) => f.tag === "mcast" && f.state.packets.length > 0);
    expect(mc[0]!.state.packets).toEqual([expect.objectContaining({ from: "leaf1.ams", to: "spine1.ams" })]);
    expect(mc[1]!.state.packets.filter((p) => p.to === "spine1.sin")).toHaveLength(1);
    expect(fields(header(mc[0]!, "Outer IPv4")).dst).toBe("239.1.1.100");
    expect(fields(header(mc[0]!, "Outer Ethernet"))["dst MAC"]).toBe("01:00:5e:01:01:64");
  });

  it("states the n-1 replication cost and 110-byte copies", () => {
    const cost = frames.find((f) => f.tag === "cost")!;
    expect(cost.state.tables[0]!.rows).toEqual([
      ["5", "4", "440 B"],
      ["16", "15", "1,650 B"],
      ["64", "63", "6,930 B"],
      ["256", "255", "28,050 B"],
    ]);
    const copy = frames.find((f) => f.tag === "replicate")!;
    const bytes = copy.state.headers!.stack.slice(0, 4).reduce((n, h) => n + parseInt(h.size!, 10), 0);
    expect(bytes + 60).toBe(110);
  });
});

describe("evpn-multihoming", () => {
  const frames = run("evpn-multihoming");
  const vteps = (f: Frame<FabricState>) => table(f, "leaf1.ams MAC table")!.rows[0]![2];

  it("elects leaf1.sin (ordinal 0) as DF", () => {
    const df = frames.find((f) => f.tag === "df")!;
    expect(df.state.nodes.find((n) => n.id === "leaf1.sin")!.state).toBe("DF");
    expect(df.state.nodes.find((n) => n.id === "leaf2.sin")!.state).toBe("non-DF");
    expect(df.state.tables[0]!.rows.map((r) => r[3])).toEqual(["DF", "non-DF"]);
  });

  it("aliases the MAC over both VTEPs, then mass withdrawal leaves only 10.255.2.11", () => {
    expect(vteps(frames.find((f) => f.tag === "alias")!)).toBe("10.255.2.11, 10.255.2.12");
    const alias = frames.filter((f) => f.tag === "alias" && f.state.packets.length === 2)[0]!;
    expect(new Set(alias.state.packets.map((p) => p.to))).toEqual(new Set(["leaf1.sin", "leaf2.sin"]));
    const wd = frames.find((f) => f.tag === "withdraw")!;
    expect(vteps(wd)).toBe("10.255.2.11");
    expect(wd.state.links.filter((l) => l.down).map((l) => `${l.a}-${l.b}`)).toEqual(["acme-web2-leaf2.sin"]);
    expect(last(frames).state.links.filter((l) => l.down)).toHaveLength(1);
  });

  it("delivers flooded traffic once: the non-DF drops, local bias stops the echo", () => {
    const bum = frames.filter((f) => f.tag === "df" && f.state.packets.length > 0)[0]!;
    expect(bum.state.packets.filter((p) => p.from === "leaf1.ams")).toHaveLength(2);
    expect(bum.state.packets.find((p) => p.from === "leaf1.sin" && p.to === "acme-web2")!.lost).toBeUndefined();
    expect(bum.state.packets.find((p) => p.from === "leaf2.sin" && p.to === "acme-web2")!.lost).toBe(true);
    const split = frames.find((f) => f.tag === "split")!;
    expect(split.state.packets.find((p) => p.from === "leaf1.sin" && p.to === "acme-web2")!.lost).toBe(true);
  });
});

describe("overlay-packet-walk", () => {
  it("walks nine lookups with the outer TTL 64 → 63 → 62 and the inner frame untouched", () => {
    const frames = run("overlay-packet-walk");
    const tunnelled = frames.filter((f) => f.state.headers?.stack.length === 7);
    expect([...new Set(tunnelled.map((f) => fields(header(f, "Outer IPv4")).TTL))]).toEqual(["64", "63", "62"]);
    for (const f of tunnelled) expect(fields(header(f, "IPv4")).TTL).toBe("64");
    const done = last(frames);
    expect(done.state.tables[0]!.rows).toHaveLength(9);
    expect(done.state.tables[0]!.rows.map((r) => r[1])).toEqual(["acme-web1", "acme-web1 → leaf1.ams", "leaf1.ams", "leaf1.ams", "leaf1.ams", "spine1.ams", "spine1.sin", "leaf2.sin", "leaf2.sin"]);
    const spine = frames.find((f) => table(f, "IS-IS paths"))!;
    expect(table(spine, "IS-IS paths")!.rows.map((r) => [r[2], r[3]])).toEqual([
      ["1,010", "installed"],
      ["1,030", "not used"],
    ]);
    expect(sends(frames, "leaf2.sin", "acme-web2")).toHaveLength(1);
  });

  it("rt-leak: a copied RT imports Globex's host into Acme and acme-web2's traffic lands on globex-app1", () => {
    const frames = run("overlay-packet-walk", { variant: "rt-leak" });
    const adv = frames.find((f) => f.tag === "advertise")!;
    expect(fields(header(adv, "EVPN type-2 (MAC/IP)"))).toMatchObject({ RD: "10.255.1.11:10100", IP: "10.1.1.10", MAC: "00:00:5e:00:53:1a", "label 1 (L2VNI)": "10200" });
    const leak = frames.find((f) => f.tag === "leak")!;
    expect(fields(header(leak, "VXLAN")).VNI).toBe("10200");
    expect(fields(header(leak, "Outer IPv4")).dst).toBe("10.255.1.12");
    expect(sends(frames, "leaf2.ams", "globex-app1")).toHaveLength(1);
    expect(last(frames).state.vars["BGP sessions"]).toBe("all Established (still)");
    const rdFrame = frames.find((f) => f.tag === "rd")!;
    expect(rdFrame.state.tables[1]!.rows.map((r) => r[4])).toEqual(["yes, best", "no, hidden"]);
  });
});

describe("mpls-label-switching", () => {
  const stack = (f: Frame<FabricState>) =>
    (f.state.headers?.stack ?? []).filter((h) => h.name.startsWith("MPLS")).map((h) => `${fields(h).label}/S${fields(h).S}/TTL${fields(h).TTL}`);

  it("LDP: push 24017 over 92001, swap to 24031, PHP, VPN label to VRF ACME; IP TTL 64 → 60", () => {
    const frames = run("mpls-label-switching");
    const hops = frames.filter((f) => f.tag === "send").map((f) => [`${f.state.packets[0]!.from}>${f.state.packets[0]!.to}`, stack(f).join(" "), fields(header(f, "IPv4")).TTL]);
    expect(hops).toEqual([
      ["acme-web2>pe1.sin", "", "64"],
      ["pe1.sin>p1.sin", "24017/S0/TTL63 92001/S1/TTL63", "63"],
      ["p1.sin>p1.ams", "24031/S0/TTL62 92001/S1/TTL63", "63"],
      ["p1.ams>pe1.ams", "92001/S1/TTL61", "63"],
      ["pe1.ams>acme-db1", "", "60"],
    ]);
    expect(frames.filter((f) => f.tag === "ldp").map((f) => f.state.packets[0]!.label)).toEqual(["LDP: 10.255.1.241/32 → label 3", "LDP: 10.255.1.241/32 → label 24031", "LDP: 10.255.1.241/32 → label 24017"]);
    const eth = frames.filter((f) => f.tag === "send").map((f) => fields(header(f, "Ethernet")).EtherType);
    expect(eth).toEqual(["0x0800 (IPv4)", "0x8847 (MPLS)", "0x8847 (MPLS)", "0x8847 (MPLS)", "0x0800 (IPv4)"]);
  });

  it("sr-mpls: the same global label 16241 at every hop, no LDP", () => {
    const frames = run("mpls-label-switching", { variant: "sr-mpls" });
    expect(frames.some((f) => f.tag === "ldp")).toBe(false);
    const labelsOnWire = frames.filter((f) => f.tag === "send").map((f) => stack(f)[0]?.split("/")[0]);
    expect(labelsOnWire).toEqual([undefined, "16241", "16241", "92001", undefined]);
    expect(frames.length).toBe(run("mpls-label-switching").length - 2);
  });
});
