import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import type { Frame } from "../engine";
import type { FabHeader, FabricInput, FabricState, FabTable } from "./fabric-core";
import { fabricFamily } from "./fabric";
import { ECMP_FLOWS, ELEPHANTS, flowHash, scenarios, systemId, vxlanSourcePort } from "./fabric-scenarios-arch";

const run = (name: string, input: Record<string, unknown> = {}): Frame<FabricState>[] => fabricFamily.algorithms[name]!(fabricFamily.normalise!({ ...input }) as FabricInput);
const last = <T>(xs: T[]) => xs[xs.length - 1]!;
const fields = (h: FabHeader | undefined) => Object.fromEntries((h?.fields ?? []).map((f) => [f.k, f.v]));
const header = (f: Frame<FabricState>, name: string) => f.state.headers?.stack.find((h) => h.name === name);
const table = (f: Frame<FabricState>, title: string | RegExp): FabTable | undefined => f.state.tables.find((t) => (typeof title === "string" ? t.title.startsWith(title) : title.test(t.title)));
const byTag = (frames: Frame<FabricState>[], tag: string) => frames.filter((f) => f.tag === tag);
const one = (frames: Frame<FabricState>[], tag: string) => {
  const fs = byTag(frames, tag);
  expect(fs, `frames tagged ${tag}`).toHaveLength(1);
  return fs[0]!;
};
const link = (f: Frame<FabricState>, a: string, b: string) => f.state.links.find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a))!;
const series = (f: Frame<FabricState>, name: string) => f.state.chart!.series.find((s) => s.name === name)!.points;

/** Every documented input combination, beyond the default runs fabric.test.ts already covers. */
const VARIANTS: [string, Record<string, unknown>][] = [
  ["ecmp-hash", { spines: 2 }],
  ["ecmp-hash", { spines: 3 }],
  ["ecmp-hash", { spines: "lots" }],
  ["site-square", { load: 140 }],
  ["site-square", { load: 10 }],
  ["site-square", { load: -5 }],
  ["ebgp-clos-underlay", { variant: "shared-leaf-as" }],
  ["ebgp-clos-underlay", { variant: 42 }],
  ["bfd-convergence", { interval: 50, multiplier: 3 }],
  ["bfd-convergence", { interval: 1000, multiplier: 10 }],
  ["bfd-convergence", { interval: "fast", multiplier: null }],
];

describe("arch pack: every run", () => {
  const runs: [string, Record<string, unknown>][] = [...Object.keys(scenarios).map((n) => [n, {}] as [string, Record<string, unknown>]), ...VARIANTS];
  it.each(runs.map(([n, i]) => [`${n} ${JSON.stringify(i)}`, n, i] as const))("%s: 8-25 frames, complete notes, valid references, renders", (_l, name, input) => {
    const frames = run(name, input);
    expect(frames.length).toBeGreaterThanOrEqual(8);
    expect(frames.length).toBeLessThanOrEqual(25);
    expect(new Set(frames.map((f) => f.note)).size, "no repeated notes").toBe(frames.length);
    for (const f of frames) {
      expect(f.note).not.toMatch(/undefined|NaN|\[object|Infinity/);
      expect(/[.)]$/.test(f.note.trim()), f.note).toBe(true);
      const ids = new Set(f.state.nodes.map((n) => n.id));
      for (const l of f.state.links) expect(ids.has(l.a) && ids.has(l.b)).toBe(true);
      for (const p of f.state.packets) expect(ids.has(p.from) && ids.has(p.to) && p.label.length > 0).toBe(true);
      for (const t of f.state.tables) expect(t.rows.length, `table ${t.title} is not empty`).toBeGreaterThan(0);
      expect(f.state.tables.length).toBeLessThanOrEqual(2);
    }
    for (const idx of [0, Math.floor(frames.length / 2), frames.length - 1]) {
      const { container, unmount } = render(createElement(fabricFamily.Renderer, { frame: frames[idx]!, input: input as FabricInput, index: idx, total: frames.length }));
      expect(container.querySelector("svg")).not.toBeNull();
      unmount();
    }
  });

  it("registers all eight scenarios with labels", () => {
    expect(Object.keys(scenarios).sort()).toEqual(["bfd-convergence", "ebgp-clos-underlay", "ecmp-hash", "elephant-collision", "gray-failure", "isis-flooding", "isis-purge-storm", "site-square"]);
    for (const n of Object.keys(scenarios)) expect(fabricFamily.labels?.[n]).toBeTruthy();
  });
});

describe("ecmp-hash", () => {
  it("picks the uplink as hash mod n, for every flow and every spine count", () => {
    for (const n of [2, 3, 4]) {
      const frames = run("ecmp-hash", { spines: n });
      const flows = table(one(frames, "spread"), "flows hashed by")!;
      expect(flows.rows).toHaveLength(5);
      ECMP_FLOWS.forEach((f, i) => {
        const h = flowHash(`${f.src}|${f.dst}|${f.proto}|${f.sport}|${f.dport}`);
        const row = flows.rows[i]!;
        expect(row[2]).toBe(`0x${h.toString(16).padStart(8, "0")}`);
        expect(row[3]).toBe(String(h % n));
        expect(row[4]).toBe(`spine${(h % n) + 1}`);
      });
      // A and B differ only in the source port and still land on different uplinks.
      expect(flows.rows[0]![4]).not.toBe(flows.rows[1]![4]);
    }
  });

  it("default run: four spines, flows spread 1/1/1/2, lowest-two-bits remark", () => {
    const frames = run("ecmp-hash");
    expect(frames).toHaveLength(12);
    const spread = one(frames, "spread");
    expect(spread.state.vars["flows per uplink"]).toBe("spine1 1 · spine2 1 · spine3 1 · spine4 2");
    expect(one(frames, "hash").state.vars.hash).toBe("0xb6af131b");
    const pickA = byTag(frames, "pick")[0]!;
    expect(pickA.note).toContain("lowest two bits");
    expect(pickA.state.packets[0]!.to).toBe("spine4.ams");
  });

  it("highlights exactly the five 5-tuple fields", () => {
    const tuple = one(run("ecmp-hash"), "tuple");
    const hot = tuple.state.headers!.stack.flatMap((h) => h.fields.filter((x) => x.hot).map((x) => `${h.name}.${x.k}`));
    expect(hot).toEqual(["IPv4.src", "IPv4.dst", "IPv4.protocol", "TCP.src port", "TCP.dst port"]);
  });

  it("a fixed outer source port collapses tunnelled flows; inner-hash entropy spreads them", () => {
    for (const n of [2, 3, 4]) {
      const frames = run("ecmp-hash", { spines: n });
      const fixed = one(frames, "no-entropy");
      const rows = table(fixed, /fixed source port/)!.rows;
      expect(rows[0]![2]).toBe(rows[1]![2]);
      expect(new Set(fixed.state.packets.map((p) => p.to)).size).toBe(1);
      const [A, B] = ECMP_FLOWS as [(typeof ECMP_FLOWS)[0], (typeof ECMP_FLOWS)[0]];
      for (const f of [A, B]) {
        const sp = vxlanSourcePort(f);
        expect(sp).toBeGreaterThanOrEqual(49152);
        expect(sp).toBeLessThanOrEqual(65535);
      }
      const ent = one(frames, "entropy");
      expect(fields(header(ent, "Outer UDP"))["src port"]).toBe(String(vxlanSourcePort(A)));
      expect(fields(header(ent, "Outer UDP"))["dst port"]).toBe("4789");
      const spread = one(frames, "spread-outer");
      expect(spread.state.packets).toHaveLength(2);
      expect(spread.state.packets[0]!.to).not.toBe(spread.state.packets[1]!.to);
      // The inner headers ride along untouched.
      expect(fields(header(spread, "Inner TCP"))["src port"]).toBe("51517");
      expect(fields(header(spread, "Outer IPv4")).dst).toBe("10.255.1.13");
      // Symmetric IRB: leaf1 routed the inner packet once before encapsulating it.
      expect(fields(header(spread, "Inner IPv4")).TTL).toBe("63");
      expect(table(one(frames, "tunnel"), "leaf1.ams FIB")!.title).toContain("10.255.1.13/32");
    }
  });

  it("clamps a nonsense spine count to the default", () => {
    expect(run("ecmp-hash", { spines: "lots" }).map((f) => f.note)).toEqual(run("ecmp-hash").map((f) => f.note));
    expect(run("ecmp-hash", { spines: 9 })[0]!.state.nodes.filter((n) => n.kind === "spine")).toHaveLength(4);
  });
});

describe("elephant-collision", () => {
  const frames = run("elephant-collision");

  it("hashes both elephants onto spine1 and overloads that uplink while spine2 idles", () => {
    for (const e of ELEPHANTS) expect(flowHash(`${e.src}|${e.dst}|6|${e.sport}|${e.dport}`) % 2).toBe(0);
    const c = one(frames, "congestion");
    expect(series(c, "to spine1")).toEqual([10, 70, 130, 100]);
    expect(series(c, "to spine2")).toEqual([10, 10, 10, 10]);
    expect(c.state.chart!.marks![0]!.y).toBe(100);
    const col = one(frames, "collision");
    expect(table(col, "elephants hashed")!.rows.map((r) => r[4])).toEqual(["spine1", "spine1"]);
    expect(link(col, "leaf1.ams", "spine1.ams").tone).toBe("danger");
    expect(col.state.vars["offered to spine1 uplink"]).toBe("130 Gb/s (130%)");
  });

  it("polarises: same hash and seed at both tiers leaves spine1–gw2 and spine2–gw1 idle", () => {
    const leaf = one(frames, "leaf");
    expect(link(leaf, "leaf1.ams", "spine1.ams").label).toBe("4 flows");
    const pol = one(frames, "polarised");
    const rows = table(pol, "the second decision")!.rows;
    expect(rows).toHaveLength(8);
    for (const r of rows) {
      expect(r[4], "the spine computes the leaf's hash").toBe(r[2]);
      expect(r[5]!.slice(-1), "gateway index equals spine index").toBe(r[3]!.slice(-1));
    }
    expect(link(pol, "spine1.ams", "gw2.ams").label).toBe("0 flows");
    expect(link(pol, "spine2.ams", "gw1.ams").label).toBe("0 flows");
    expect(pol.state.vars["idle spine–gateway links"]).toBe("spine1–gw2, spine2–gw1");
  });

  it("per-device seeds from the loopbacks spread the flows over all four spine–gateway links", () => {
    const seeded = one(frames, "seeded");
    for (const s of ["spine1.ams", "spine2.ams"]) for (const g of ["gw1.ams", "gw2.ams"]) expect(link(seeded, s, g).label).toBe("2 flows");
    expect(table(seeded, "hash seeds")!.rows.map((r) => r[2])).toEqual(["0x0aff010b", "0x0aff0101", "0x0aff0102"]);
    expect(seeded.state.vars["idle spine–gateway links"]).toBe("none");
  });
});

describe("gray-failure", () => {
  const frames = run("gray-failure");

  it("keeps the link up and in ECMP at 25% while the loss climbs", () => {
    const costOut = frames.findIndex((f) => f.tag === "cost-out");
    expect(costOut).toBeGreaterThan(0);
    for (const f of frames.slice(0, costOut)) {
      const l = link(f, "leaf1.ams", "spine3.ams");
      expect(l.down).toBeFalsy();
      const ecmp = table(f, "leaf1.ams ECMP group")!;
      expect(ecmp.rows).toHaveLength(4);
      expect(ecmp.rows.find((r) => r[1] === "spine3")![2]).toBe("25%");
    }
    const sig = one(frames, "signals");
    expect(series(sig, "frames lost on it")).toEqual([0, 0, 0, 2]);
    expect(series(sig, "share of leaf1's flows sent into it")).toEqual([25, 25, 25, 25]);
  });

  it("shows FCS errors only once the pre-FEC error rate passes the KP4 limit (2.4e-4)", () => {
    for (const tag of ["baseline", "drift", "margin", "errors"]) {
      const t = table(one(frames, tag), "spine3.ams port facing leaf1.ams")!;
      const val = (k: string) => t.rows.find((r) => r[0] === k)![1]!;
      const ber = Number(val("pre-FEC bit error rate"));
      expect(val("oper status")).toBe("up");
      expect(val("in FCS errors") !== "0 /s").toBe(ber > 2.4e-4);
      // Bit errors per second = BER × 425 Gb/s line rate.
      expect(Number(val("bit errors before FEC").replace(/[^\d]/g, ""))).toBeCloseTo(ber * 425e9, -1);
    }
    // 2% of 31.25 million frames/s (250 Gb/s of 1,000-byte frames).
    const t = table(one(frames, "errors"), "spine3.ams port facing leaf1.ams")!;
    expect(t.rows.find((r) => r[0] === "in FCS errors")![1]).toBe(`${(0.02 * (250e9 / 8000)).toLocaleString("en-US")} /s`);
  });

  it("costing out leaves three uplinks at 83.3%, and the repair restores four", () => {
    const out = one(frames, "cost-out");
    expect(table(out, "leaf1.ams ECMP group")!.rows.map((r) => r[1])).toEqual(["spine1", "spine2", "spine4"]);
    expect(table(out, "leaf1.ams ECMP group")!.rows[0]![2]).toBe("33.3%");
    expect(out.state.vars.utilisation).toBe("83.3%");
    const rep = one(frames, "repair");
    expect(table(rep, "leaf1.ams ECMP group")!.rows).toHaveLength(4);
    expect(rep.state.vars.utilisation).toBe("62.5%");
  });
});

describe("site-square", () => {
  it("default: 40/40 over two circuits, then 80 on the survivor; metrics 1,020 vs 1,040", () => {
    const frames = run("site-square");
    const steady = one(frames, "steady");
    expect(steady.state.vars["per circuit"]).toBe("40 Gb/s (40%)");
    const routing = one(frames, "routing");
    expect(table(routing, "leaf1.ams route")!.rows.map((r) => r[2])).toEqual(["10 + 1,000 + 10 = 1,020", "10 + 1,000 + 10 = 1,020"]);
    const fail = one(frames, "fail");
    expect(link(fail, "spine1.ams", "spine1.sin").down).toBe(true);
    const detour = one(frames, "detour");
    expect(detour.state.packets.map((p) => `${p.from}>${p.to}`)).toEqual(["leaf1.ams>spine1.ams", "spine1.ams>leaf2.ams", "leaf2.ams>spine2.ams"]);
    expect(detour.note).toContain("1,030");
    const conv = one(frames, "converged");
    expect(table(conv, "leaf1.ams route")!.rows.map((r) => r[2])).toEqual(["10 + 10 + 10 + 1,000 + 10 = 1,040", "10 + 1,000 + 10 = 1,020"]);
    expect(table(conv, "leaf1.ams route")!.tones).toEqual(["muted", "active"]);
    // The chart and the circuit label agree as soon as the leaves have converged.
    expect(series(conv, "circuit 2")).toEqual([40, 40, 80]);
    expect(link(conv, "spine2.ams", "spine2.sin").label).toBe("circuit 2 · 80 of 100G");
    const cap = one(frames, "capacity");
    expect(series(cap, "circuit 1")).toEqual([40, 0, 0]);
    expect(series(cap, "circuit 2")).toEqual([40, 40, 80]);
    expect(cap.note).toContain("fits");
    expect(last(frames).state.links.some((l) => l.down)).toBe(false);
  });

  it("an over-50% load overloads the survivor; bad loads are clamped", () => {
    const cap = one(run("site-square", { load: 140 }), "capacity");
    expect(series(cap, "circuit 2")).toEqual([70, 70, 140]);
    expect(cap.note).toContain("140% of its capacity");
    expect(one(run("site-square", { load: -5 }), "steady").state.vars["Amsterdam → Singapore"]).toBe("10 Gb/s");
    expect(one(run("site-square", { load: 999 }), "steady").state.vars["Amsterdam → Singapore"]).toBe("190 Gb/s");
    expect(one(run("site-square", { load: "heavy" }), "steady").state.vars["Amsterdam → Singapore"]).toBe("80 Gb/s");
  });
});

describe("isis-flooding", () => {
  const frames = run("isis-flooding");
  const copies = (f: Frame<FabricState>) => table(f, "leaf3.ams's LSP")?.rows.filter((r) => r[1] === "0x2b").length;

  it("derives system IDs from loopbacks", () => {
    expect(systemId("leaf3.ams")).toBe("0102.5500.1013");
    expect(systemId("spine1.ams")).toBe("0102.5500.1001");
    expect(frames[0]!.state.nodes.find((n) => n.id === "leaf3.ams")!.state).toBe("0102.5500.1013");
  });

  it("floods 0x2b router by router until all six databases agree", () => {
    const counts = frames.slice(0, frames.findIndex((f) => f.tag === "csnp")).map(copies);
    expect(counts.slice(0, 8)).toEqual([0, 0, 1, 1, 2, 5, 5, 6]);
    for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeGreaterThanOrEqual(counts[i - 1]!);
    const dedupe = one(frames, "dedupe");
    expect(dedupe.state.packets.every((p) => p.from === "spine2.ams" && p.label === "PSNP ack")).toBe(true);
  });

  it("raises the sequence number and shrinks the TLVs when the adjacency goes", () => {
    const lsp = one(frames, "lsp");
    const orig = one(frames, "originate");
    expect(fields(header(lsp, "IS-IS L2 LSP header")).sequence).toBe("0x0000002a");
    expect(fields(header(orig, "IS-IS L2 LSP header")).sequence).toBe("0x0000002b");
    expect(fields(header(orig, "IS-IS L2 LSP header"))["remaining lifetime"]).toBe("1,200 s");
    expect(header(lsp, "TLV 22 extended IS reachability")!.size).toBe("24 B");
    expect(header(orig, "TLV 22 extended IS reachability")!.size).toBe("13 B");
    expect(header(orig, "TLV 135 extended IP reachability")!.fields.map((f) => f.k)).toEqual(["10.255.1.13/32", "10.254.1.4/31"]);
    expect(fields(header(one(frames, "restore"), "IS-IS L2 LSP header")).sequence).toBe("0x0000002c");
  });

  it("SPF: leaf1 drops to one next hop, spine2 detours through three leaves at metric 30, ECMP returns", () => {
    const [leaf1Spf, spine2Spf] = byTag(frames, "spf") as [Frame<FabricState>, Frame<FabricState>];
    expect(table(leaf1Spf, "leaf1.ams SPF")!.rows).toEqual([["20", "10.254.1.0", "spine1.ams"]]);
    expect(table(spine2Spf, "spine2.ams SPF")!.rows.map((r) => `${r[0]} ${r[2]}`)).toEqual(["30 leaf1.ams", "30 leaf2.ams", "30 leaf4.ams"]);
    expect(table(one(frames, "csnp"), "CSNP comparison")!.rows.every((r) => r[1] === r[2] && r[3] === "none")).toBe(true);
    expect(table(one(frames, "restore"), "leaf1.ams SPF")!.rows).toHaveLength(2);
  });
});

describe("ebgp-clos-underlay", () => {
  const frames = run("ebgp-clos-underlay");
  const asPath = (f: Frame<FabricState>) => fields(header(f, "BGP UPDATE")).AS_PATH;

  it("gives spines one AS and each leaf its own", () => {
    expect(frames[0]!.state.nodes.map((n) => n.state)).toEqual(["AS 65100", "AS 65100", "AS 65101", "AS 65102", "AS 65103", "AS 65104"]);
  });

  it("grows the AS_PATH hop by hop with next-hop-self and TTL 1", () => {
    const ann = byTag(frames, "announce");
    expect(ann.map(asPath)).toEqual(["65101", "65101"]);
    expect(fields(header(ann[0]!, "BGP UPDATE")).NEXT_HOP).toBe("10.254.1.1");
    expect(fields(header(ann[1]!, "BGP UPDATE")).NEXT_HOP).toBe("10.254.2.1");
    expect(fields(header(ann[0]!, "IPv4")).TTL).toBe("1");
    const prop = byTag(frames, "propagate");
    expect(prop.map(asPath)).toEqual(["65100 65101", "65100 65101"]);
    expect(prop.map((f) => fields(header(f, "BGP UPDATE")).NEXT_HOP)).toEqual(["10.254.1.4", "10.254.2.4"]);
    expect(asPath(one(frames, "readvertise"))).toBe("65103 65100 65101");
  });

  it("installs two multipath routes at leaf3 and rejects the looped path at spine2", () => {
    const mp = table(one(frames, "multipath"), "leaf3.ams BGP table")!;
    expect(mp.rows.map((r) => r[3])).toEqual(["multipath", "multipath"]);
    expect(mp.rows[0]![2]).toBe(mp.rows[1]![2]);
    const rej = table(one(frames, "reject"), "spine2.ams BGP table")!;
    expect(rej.rows[1]).toEqual(["10.254.2.5", "leaf3.ams", "65103 65100 65101", "rejected: AS 65100 in path"]);
    expect(rej.tones).toEqual(["done", "danger"]);
  });

  it("withdraws on failure instead of detouring through a leaf", () => {
    const wd = one(frames, "withdraw");
    expect(fields(header(wd, "BGP UPDATE"))["withdrawn routes"]).toBe("10.255.1.11/32");
    expect(wd.state.packets.map((p) => p.to)).toEqual(["leaf2.ams", "leaf3.ams", "leaf4.ams"]);
    const conv = table(one(frames, "converged"), "leaf3.ams BGP table")!;
    expect(conv.rows.map((r) => r[3])).toEqual(["best (only path)", "withdrawn"]);
  });

  it("shared-leaf-as: leaf3 rejects its own AS until allowas-in", () => {
    const v = run("ebgp-clos-underlay", { variant: "shared-leaf-as" });
    expect(v).toHaveLength(frames.length + 1);
    expect(v[0]!.state.nodes.filter((n) => n.kind === "leaf").every((n) => n.state === "AS 65101")).toBe(true);
    expect(table(one(v, "reject-own"), "leaf3.ams BGP table")!.rows.map((r) => r[3])).toEqual(["rejected: own AS 65101", "rejected: own AS 65101"]);
    expect(table(one(v, "allowas-in"), "leaf3.ams BGP table")!.rows.map((r) => r[3])).toEqual(["multipath", "multipath"]);
    expect(asPath(one(v, "readvertise"))).toBe("65101 65100 65101");
    expect(byTag(frames, "reject-own")).toHaveLength(0);
    expect(run("ebgp-clos-underlay", { variant: 42 }).map((f) => f.note)).toEqual(frames.map((f) => f.note));
  });
});

describe("bfd-convergence", () => {
  const timeline = (f: Frame<FabricState>) => table(f, "Timeline with BFD")!.rows.map((r) => r[2]);

  it("default timeline: 900 ms detection, 1,018 ms to recovery, 30,118 ms without BFD", () => {
    const frames = run("bfd-convergence");
    expect(timeline(one(frames, "fib"))).toEqual(["0 ms", "900 ms", "950 ms", "952 ms", "1,003 ms", "1,018 ms"]);
    expect(one(frames, "recovered").state.vars["lost on circuit 1"]).toBe("≈ 5.1 GB");
    const nb = table(one(frames, "no-bfd"), "Timeline without BFD")!;
    expect(last(nb.rows)[2]).toBe("30,118 ms");
    expect(one(frames, "no-bfd").note).toContain("3.3 times slower");
    expect(fields(header(one(frames, "bfd"), "BFD control"))["detect mult"]).toBe("3");
    expect(fields(header(one(frames, "bfd"), "IPv4")).TTL).toBe("255");
  });

  it("the ports stay up after the cut; the route changes only at SPF", () => {
    const frames = run("bfd-convergence");
    const cut = one(frames, "cut");
    expect(link(cut, "spine1.ams", "carrier").down).toBeFalsy();
    expect(link(cut, "spine1.ams", "carrier").label).toBe("port still up");
    expect(table(one(frames, "flood"), "leaf1.ams route")!.rows).toHaveLength(2);
    expect(table(one(frames, "spf"), "leaf1.ams route")!.rows).toEqual([["spine2.ams", "1,020"]]);
    expect(link(one(frames, "detect"), "spine1.ams", "carrier").down).toBe(true);
  });

  it("follows the BFD inputs and clamps bad ones", () => {
    const fast = run("bfd-convergence", { interval: 50, multiplier: 3 });
    expect(last(timeline(one(fast, "fib")))).toBe("268 ms");
    expect(one(fast, "no-bfd").note).toContain("20 times slower");
    const slow = run("bfd-convergence", { interval: 1000, multiplier: 10 });
    expect(last(timeline(one(slow, "fib")))).toBe("10,118 ms");
    expect(one(slow, "no-bfd").note).toContain("no faster than BFD");
    expect(run("bfd-convergence", { interval: "fast", multiplier: null }).map((f) => f.note)).toEqual(run("bfd-convergence").map((f) => f.note));
    expect(last(timeline(one(run("bfd-convergence", { interval: 1 }), "fib")))).toBe("268 ms");
  });
});

describe("isis-purge-storm", () => {
  const frames = run("isis-purge-storm");
  const reach = (f: Frame<FabricState>) => table(f, "loopbacks each router can reach")!.rows.map((r) => Number(r[1]!.split(" ")[0]));
  const lsdb = (f: Frame<FabricState>) => table(f, "leaf4.ams LSDB")!;

  it("steps leaf4's clock from 2000 to 2026 and every stored expiry becomes past", () => {
    expect(one(frames, "boot").state.vars["leaf4.ams clock"]).toBe("2000-01-01 00:00:00");
    const sync = lsdb(one(frames, "sync"));
    expect(sync.rows[0]).toEqual(["spine1.ams.00-00", "0x5c", "2000-01-01 00:18:04", "valid"]);
    const step = one(frames, "step");
    expect(step.state.vars["leaf4.ams clock"]).toBe("2026-10-31 09:00:52");
    expect(lsdb(step).rows.filter((r) => r[3] === "EXPIRED")).toHaveLength(5);
  });

  it("purges carry lifetime 0, the same sequence number and leaf4's system ID", () => {
    const p = one(frames, "purge");
    const h = fields(header(p, "IS-IS L2 LSP header"));
    expect(h["remaining lifetime"]).toBe("0 s (purge)");
    expect(h.sequence).toBe("0x0000005c");
    expect(fields(header(p, "TLV 13 purge originator"))["purged by"]).toBe(`${systemId("leaf4.ams")} (leaf4.ams)`);
    expect(systemId("leaf4.ams")).toBe("0102.5500.1014");
  });

  it("the topology vanishes, then returns after every originator re-issues with seq + 1", () => {
    expect(reach(frames[0]!)).toEqual([5, 5, 5, 5, 5, 5]);
    // While leaf4 reboots the others lose its loopback; once its adjacencies return, everything is reachable.
    expect(reach(one(frames, "boot"))).toEqual([4, 4, 4, 4, 4, 0]);
    expect(reach(one(frames, "sync"))).toEqual([5, 5, 5, 5, 5, 5]);
    expect(reach(one(frames, "vanished"))).toEqual([1, 1, 0, 0, 0, 0]);
    const reb = one(frames, "rebuilt");
    expect(reach(reb)).toEqual([5, 5, 5, 5, 5, 5]);
    expect(lsdb(reb).rows.slice(0, 5).map((r) => r[1])).toEqual(["0x5d", "0x52", "0x34", "0x30", "0x2b"]);
    expect(lsdb(reb).rows.every((r) => r[2]!.startsWith("2026-10-31"))).toBe(true);
    expect(one(frames, "overlay").state.vars["tenant traffic"]).toBe("stopped site-wide");
  });
});
