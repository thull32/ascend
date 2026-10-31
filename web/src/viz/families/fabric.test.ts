import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { MAX_FRAMES, type Frame } from "../engine";
import { Fab, fit, ipv4Checksum, layout, loopback, p2p, type FabHeader, type FabricInput, type FabricState } from "./fabric-core";
import { fabricFamily, fabricPacks } from "./fabric";

/** Every scenario the track brief plans, by pack (pack files list the same rows). */
const PLANNED: Record<string, string[]> = {
  core: ["hop-by-hop", "clos-ecmp", "vxlan-encap"],
  zero: ["ethernet-frame", "mac-learning", "vlan-trunk", "broadcast-storm", "subnet-math", "lpm-lookup", "arp-gateway", "pmtud-blackhole", "switch-pipeline", "linux-rx-path"],
  arch: ["ecmp-hash", "elephant-collision", "gray-failure", "site-square", "isis-flooding", "ebgp-clos-underlay", "bfd-convergence", "isis-purge-storm"],
  bgp1: ["bgp-update-propagation", "bgp-fsm", "bgp-ribs", "bgp-next-hop-resolution", "route-reflector", "bgp-best-path"],
  bgp2: ["bgp-blackhole", "community-policy", "two-isp-te", "valley-free", "route-hijack", "path-hunting", "maintenance-order"],
  overlay: ["evpn-mac-learning", "symmetric-irb", "bum-replication", "evpn-multihoming", "overlay-packet-walk", "mpls-label-switching"],
  ai1: ["training-step", "incast", "parallelism-traffic", "ring-allreduce", "scale-up-vs-out", "rdma-write"],
  ai2: ["ib-credit-flow", "pfc-pause", "ecn-dcqcn", "pfc-deadlock", "rail-optimized", "adaptive-routing"],
  ops: ["intent-drift", "netconf-commit", "telemetry-blind", "probe-localisation", "spine-drain"],
};

const run = (name: string, input: Record<string, unknown> = {}): Frame<FabricState>[] => fabricFamily.algorithms[name]!(fabricFamily.normalise!({ ...input }) as FabricInput);
const last = <T>(xs: T[]) => xs[xs.length - 1]!;
const fields = (h: FabHeader | undefined) => Object.fromEntries((h?.fields ?? []).map((f) => [f.k, f.v]));
const header = (f: Frame<FabricState>, name: string) => f.state.headers?.stack.find((h) => h.name === name);
const plain = (stack: FabHeader[]) => stack.map((h) => ({ name: h.name, fields: h.fields.map((f) => [f.k, f.v]) }));

/** Default run plus every documented variant/input combination worth exercising. */
const RUNS: [string, Record<string, unknown>][] = [
  ...Object.keys(fabricFamily.algorithms).map((name) => [name, {}] as [string, Record<string, unknown>]),
  ["clos-ecmp", { variant: "spine-failure" }],
  ["clos-ecmp", { spines: 2, variant: "spine-failure" }],
  ["clos-ecmp", { spines: 3 }],
  ["clos-ecmp", { spines: "nonsense", variant: 7 }],
];

describe("fabric family registry", () => {
  it("registers only planned scenario names, each in its own pack, with a label", () => {
    const all = Object.values(PLANNED).flat();
    expect(new Set(all).size).toBe(57);
    for (const [pack, { scenarios, labels }] of Object.entries(fabricPacks)) {
      for (const name of Object.keys(scenarios)) {
        expect(PLANNED[pack], `pack ${pack}`).toContain(name);
        expect(labels[name], `label for ${name}`).toBeTruthy();
      }
    }
    const names = Object.values(fabricPacks).flatMap((p) => Object.keys(p.scenarios));
    expect(new Set(names).size, "a scenario is exported by two packs").toBe(names.length);
    expect(Object.keys(fabricFamily.algorithms).sort()).toEqual([...names].sort());
    for (const core of PLANNED.core!) expect(fabricFamily.algorithms[core]).toBeTypeOf("function");
  });

  it("reports which planned scenarios are still missing", () => {
    const missing = Object.values(PLANNED).flat().filter((n) => !Object.hasOwn(fabricFamily.algorithms, n));
    // Informational while the packs are being written; the curriculum test fails on any lesson that uses one.
    if (missing.length) console.info(`fabric scenarios not implemented yet (${missing.length}): ${missing.join(", ")}`);
    expect(missing.length).toBeLessThanOrEqual(54);
  });
});

describe.each(RUNS.map(([name, input]) => [`${name} ${JSON.stringify(input)}`, name, input] as const))("fabric scenario %s", (_label, name, input) => {
  const frames = run(name, input);

  it("produces 6 or more frames within the cap", () => {
    expect(frames.length).toBeGreaterThanOrEqual(6);
    expect(frames.length).toBeLessThanOrEqual(MAX_FRAMES);
  });

  it("has a complete, mostly distinct note on every frame", () => {
    for (const f of frames) {
      expect(f.note.trim().length, `note ${JSON.stringify(f.note)}`).toBeGreaterThan(20);
      expect(f.note).not.toMatch(/undefined|NaN|\[object/);
      expect(/[.!?)]$/.test(f.note.trim()), `note ends a sentence: ${f.note}`).toBe(true);
    }
    const distinct = new Set(frames.map((f) => f.note)).size;
    expect(distinct / frames.length).toBeGreaterThanOrEqual(0.9);
  });

  it("only references nodes that exist", () => {
    for (const f of frames) {
      const ids = new Set(f.state.nodes.map((n) => n.id));
      expect(ids.size, "node ids are unique").toBe(f.state.nodes.length);
      for (const l of f.state.links) {
        expect(ids.has(l.a) && ids.has(l.b), `link ${l.a}–${l.b}`).toBe(true);
        if (l.width !== undefined) expect(l.width).toBeGreaterThanOrEqual(0);
      }
      for (const p of f.state.packets) {
        expect(ids.has(p.from) && ids.has(p.to), `packet ${p.from}→${p.to}`).toBe(true);
        expect(p.progress).toBeGreaterThanOrEqual(0);
        expect(p.progress).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps headers, tables and charts well formed", () => {
    for (const f of frames) {
      for (const h of f.state.headers?.stack ?? []) {
        expect(h.name).toBeTypeOf("string");
        for (const fl of h.fields) {
          expect(fl.k).toBeTypeOf("string");
          expect(fl.v).toBeTypeOf("string");
        }
      }
      expect(f.state.tables.length).toBeLessThanOrEqual(2);
      for (const t of f.state.tables) {
        for (const r of t.rows) for (const c of r) expect(c).toBeTypeOf("string");
        if (t.tones) expect(t.tones.length).toBeLessThanOrEqual(t.rows.length);
      }
      for (const s of f.state.chart?.series ?? []) for (const v of s.points) expect(v === null || Number.isFinite(v)).toBe(true);
      expect(f.state.log.length).toBeLessThanOrEqual(5);
    }
  });

  it("renders its first, middle and last frame", () => {
    for (const idx of [0, Math.floor(frames.length / 2), frames.length - 1]) {
      const { container, unmount } = render(createElement(fabricFamily.Renderer, { frame: frames[idx]!, input: input as FabricInput, index: idx, total: frames.length }));
      expect(container.querySelector("svg")).not.toBeNull();
      unmount();
    }
  });
});

describe("hop-by-hop", () => {
  const frames = run("hop-by-hop");
  const sends = frames.filter((f) => f.tag === "send");

  it("rewrites both MACs and decrements TTL at every router while the IPs stay", () => {
    expect(sends).toHaveLength(4);
    const eth = sends.map((f) => fields(header(f, "Ethernet")));
    const ip = sends.map((f) => fields(header(f, "IPv4")));
    expect(ip.map((h) => h.TTL)).toEqual(["64", "63", "62", "61"]);
    for (const h of ip) {
      expect(h.src).toBe("10.1.1.10");
      expect(h.dst).toBe("10.1.2.20");
    }
    for (let i = 1; i < eth.length; i++) {
      expect(eth[i]!["src MAC"]).not.toBe(eth[i - 1]!["src MAC"]);
      expect(eth[i]!["dst MAC"]).not.toBe(eth[i - 1]!["dst MAC"]);
    }
    expect(eth[0]!["dst MAC"]).toBe("00:00:5e:00:01:01");
    expect(eth[3]!["dst MAC"]).toBe("00:00:5e:00:53:14");
  });

  it("recomputes a real IPv4 checksum for each TTL", () => {
    const sums = sends.map((f) => fields(header(f, "IPv4"))["header checksum"]);
    expect(new Set(sums).size).toBe(4);
    expect(sums[0]).toBe("0xe97d");
    expect(sums[1]).toBe("0xea7d");
  });

  it("highlights exactly the rewritten fields", () => {
    const rewrite = frames.find((f) => f.tag === "rewrite")!;
    const hot = rewrite.state.headers!.stack.flatMap((h) => h.fields.filter((x) => x.hot).map((x) => `${h.name}.${x.k}`));
    expect(hot).toEqual(["IPv4.TTL", "IPv4.header checksum"]);
    expect(rewrite.state.headers!.stack[0]!.fresh).toBe(true);
  });
});

describe("clos-ecmp", () => {
  it("has one equal-cost path per spine", () => {
    for (const spines of [2, 3, 4]) {
      const done = last(run("clos-ecmp", { spines }));
      expect(done.state.vars["ECMP paths leaf1 → leaf3"]).toBe(spines);
      expect(done.state.tables[0]!.rows).toHaveLength(spines);
      expect(done.state.nodes.filter((n) => n.kind === "spine")).toHaveLength(spines);
      expect(done.state.links.filter((l) => l.a.startsWith("leaf") && l.b.startsWith("spine"))).toHaveLength(4 * spines);
    }
  });

  it("spine-failure removes one ECMP path and 1/n of the capacity", () => {
    for (const spines of [2, 4]) {
      const frames = run("clos-ecmp", { spines, variant: "spine-failure" });
      const paths = frames.map((f) => f.state.vars["ECMP paths leaf1 → leaf3"]).filter((v) => v !== undefined) as number[];
      expect(paths[0]).toBe(spines);
      expect(last(paths)).toBe(spines - 1);
      const done = last(frames);
      expect(done.state.tables[0]!.rows).toHaveLength(spines - 1);
      expect(done.state.links.filter((l) => l.down)).toHaveLength(4);
      expect(done.state.vars["uplink capacity"]).toBe(`${(spines - 1) * 400} Gb/s`);
      const cap = done.state.chart!.series.find((s) => s.name === "capacity")!.points;
      expect(cap[0]).toBe(spines * 400);
      expect(last(cap)).toBe((spines - 1) * 400);
      // Every flow ends on a surviving spine.
      expect(done.state.tables[1]!.rows.every((r) => r[3] !== "spine2")).toBe(true);
    }
  });

  it("defaults to the plain run without the variant", () => {
    expect(run("clos-ecmp").some((f) => f.state.links.some((l) => l.down))).toBe(false);
  });
});

describe("vxlan-encap", () => {
  const frames = run("vxlan-encap");
  const original = frames.find((f) => f.tag === "build")!.state.headers!.stack;
  const full = frames.find((f) => (f.state.headers?.stack.length ?? 0) === 7)!;

  it("adds exactly outer Ethernet, outer IPv4, UDP 4789 and VXLAN VNI 10100 (50 bytes)", () => {
    expect(original.map((h) => h.name)).toEqual(["Ethernet", "IPv4", "TCP"]);
    const outer = full.state.headers!.stack.slice(0, 4);
    expect(outer.map((h) => h.name)).toEqual(["Outer Ethernet", "Outer IPv4", "Outer UDP", "VXLAN"]);
    expect(fields(outer[2])["dst port"]).toBe("4789");
    expect(fields(outer[3]).VNI).toBe("10100");
    expect(fields(outer[1]).src).toBe(loopback("leaf1.ams"));
    expect(fields(outer[1]).dst).toBe(loopback("leaf2.sin"));
    expect(outer.reduce((n, h) => n + parseInt(h.size!, 10), 0)).toBe(50);
    expect(plain(full.state.headers!.stack.slice(4))).toEqual(plain(original));
  });

  it("never changes the inner headers while the spines forward on the outer header", () => {
    const tunnelled = frames.filter((f) => f.state.headers?.stack.length === 7);
    expect(tunnelled.length).toBeGreaterThanOrEqual(6);
    const ttls: string[] = [];
    for (const f of tunnelled) {
      expect(plain(f.state.headers!.stack.slice(4))).toEqual(plain(original));
      for (const h of f.state.headers!.stack.slice(4)) expect(h.fields.some((x) => x.hot)).toBe(false);
      ttls.push(fields(f.state.headers!.stack[1]).TTL!);
    }
    expect([...new Set(ttls)]).toEqual(["64", "63", "62"]);
    const spineFrames = frames.filter((f) => f.state.packets.some((p) => p.from.startsWith("spine") || p.to.startsWith("spine")));
    expect(spineFrames.length).toBeGreaterThanOrEqual(3);
    for (const f of spineFrames) expect(f.state.headers!.stack).toHaveLength(7);
  });

  it("decapsulates back to the original frame", () => {
    expect(plain(last(frames).state.headers!.stack)).toEqual(plain(original));
  });
});

describe("Fab DSL", () => {
  it("hop pushes one frame per hop with the packet on that hop", () => {
    const fab = new Fab([{ id: "a", kind: "host" }, { id: "b", kind: "leaf" }, { id: "c", kind: "host" }], [["a", "b"], ["b", "c"]]);
    fab.headers([{ name: "IPv4", fields: { TTL: 64 } }]);
    fab.hop(["a", "b", "c"], (i) => `p${i}`, ["first hop note.", "second hop note."], { each: (i) => i > 0 && fab.patchHeader("IPv4", { TTL: 63 }) });
    const frames = fab.f.done();
    expect(frames).toHaveLength(2);
    expect(frames.map((f) => f.state.packets[0]!.from)).toEqual(["a", "b"]);
    expect(frames[1]!.state.headers!.stack[0]!.fields[0]).toEqual({ k: "TTL", v: "63", hot: true });
    expect(frames[1]!.state.headers!.at).toBe("on the link b → c");
  });

  it("snapshots are deep copies", () => {
    const fab = new Fab([{ id: "a", kind: "leaf" }]);
    fab.table(0, { title: "t", rows: [["x"]] });
    fab.chart({ title: "c", series: [{ name: "s" }] });
    fab.point({ s: 1 });
    fab.note("first frame shows one row and one point.");
    fab.addRow(0, ["y"], "active");
    fab.point({ s: 2 });
    fab.state("a", "busy");
    fab.note("second frame shows two rows and two points.");
    const [f0, f1] = fab.f.done();
    expect(f0!.state.tables[0]!.rows).toEqual([["x"]]);
    expect(f0!.state.chart!.series[0]!.points).toEqual([1]);
    expect(f0!.state.nodes[0]!.state).toBeUndefined();
    expect(f1!.state.tables[0]!.tones).toEqual([undefined, "active"]);
  });

  it("lays out by tier and shortens labels the Meridian way", () => {
    const pos = layout([
      { id: "s", label: "s", kind: "spine" },
      { id: "l1", label: "l1", kind: "leaf" },
      { id: "l2", label: "l2", kind: "leaf" },
      { id: "h", label: "h", kind: "host", x: 10, y: 90 },
    ]);
    expect(pos.s![1]).toBeLessThan(pos.l1![1]);
    expect(pos.l1![1]).toBe(pos.l2![1]);
    expect(pos.h).toEqual([10, 90]);
    expect(fit("leaf1.ams", 6)).toBe("leaf1");
    expect(fit("acme-web1", 6)).toBe("acme-…");
    expect(fit("10.255.1.11", 7)).toBe("…5.1.11");
  });

  it("derives Meridian addresses from the brief's plan", () => {
    expect(loopback("spine1.ams")).toBe("10.255.1.1");
    expect(loopback("leaf2.ams")).toBe("10.255.1.12");
    expect(loopback("rr2.sin")).toBe("10.255.2.102");
    expect(loopback("gw1.sjc")).toBe("10.255.3.201");
    expect(p2p("leaf1.ams", "spine1.ams")).toEqual({ net: "10.254.1.0/31", leaf: "10.254.1.1", spine: "10.254.1.0" });
    expect(ipv4Checksum({ totalLength: 60, id: 0x3a1f, flagsFragment: 0x4000, ttl: 64, protocol: 6, src: "10.1.1.10", dst: "10.1.2.20" })).toBe("0xe97d");
  });
});
