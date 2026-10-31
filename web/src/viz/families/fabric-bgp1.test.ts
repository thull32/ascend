import { describe, expect, it } from "vitest";
import type { Frame } from "../engine";
import type { FabHeader, FabricInput, FabricState } from "./fabric-core";
import { fabricFamily } from "./fabric";

const run = (name: string, input: Record<string, unknown> = {}): Frame<FabricState>[] => fabricFamily.algorithms[name]!(fabricFamily.normalise!({ ...input }) as FabricInput);
const last = <T>(xs: T[]) => xs[xs.length - 1]!;
const fields = (h: FabHeader | undefined) => Object.fromEntries((h?.fields ?? []).map((f) => [f.k, f.v]));
const header = (f: Frame<FabricState>, name: string) => f.state.headers?.stack.find((h) => h.name === name);
const nodeState = (f: Frame<FabricState>, id: string) => f.state.nodes.find((n) => n.id === id)?.state;
const table = (f: Frame<FabricState>, title: RegExp) => f.state.tables.find((t) => title.test(t.title));

describe("bgp1 pack frame budgets", () => {
  it.each([
    ["bgp-update-propagation", {}],
    ["bgp-fsm", {}],
    ["bgp-ribs", {}],
    ["bgp-next-hop-resolution", {}],
    ["route-reflector", {}],
    ["bgp-best-path", {}],
    ["bgp-best-path", { variant: "local-pref" }],
    ["bgp-best-path", { variant: "nonsense" }],
  ] as [string, Record<string, unknown>][])("%s %j runs 8-25 frames with distinct notes", (name, input) => {
    const frames = run(name, input);
    expect(frames.length).toBeGreaterThanOrEqual(8);
    expect(frames.length).toBeLessThanOrEqual(25);
    expect(new Set(frames.map((f) => f.note)).size).toBe(frames.length);
  });
});

describe("bgp-update-propagation", () => {
  const frames = run("bgp-update-propagation");
  const paths = frames.filter((f) => f.tag === "send").map((f) => fields(header(f, "UPDATE")));

  it("prepends one AS per eBGP hop and rewrites NEXT_HOP, keeping it empty over iBGP", () => {
    expect(paths.map((p) => p.AS_PATH)).toEqual(["(empty)", "64500", "64501 64500", "64496 64501 64500", "64502 64496 64501 64500"]);
    expect(paths.map((p) => p.NEXT_HOP)).toEqual(["10.255.1.201", "198.51.100.3", "198.51.100.7", "198.51.100.8", "198.51.100.0"]);
    // LOCAL_PREF travels on iBGP only.
    expect(paths.map((p) => p.LOCAL_PREF)).toEqual(["100", undefined, undefined, undefined, undefined]);
  });

  it("gw2.ams rejects the route carrying its own AS 64500", () => {
    const loop = frames.find((f) => f.tag === "loop")!;
    expect(loop.state.packets[0]).toMatchObject({ from: "isp2", to: "gw2.ams", lost: true });
    expect(nodeState(loop, "gw2.ams")).toBe("AS loop: 64500");
    const holders = table(loop, /^Who holds/)!;
    expect(table(loop, /four ASes/)).toBeDefined();
    const row = last(holders.rows);
    expect(row[1]).toContain("64500");
    expect(row[3]).toMatch(/rejected/);
    expect(last(holders.tones!)).toBe("danger");
  });
});

describe("bgp-fsm", () => {
  const frames = run("bgp-fsm");
  const leafStates = frames.map((f) => nodeState(f, "leaf1.ams"));

  it("walks leaf1.ams through the RFC 4271 states in order", () => {
    const seq = leafStates.filter((s, i) => s !== leafStates[i - 1]);
    expect(seq).toEqual(["Idle", "Connect", "Active", "Connect", "OpenSent", "OpenConfirm", "Established", "Idle"]);
  });

  it("negotiates hold time min(9, 90) = 9 s with a 3 s keepalive", () => {
    const opens = frames.filter((f) => header(f, "OPEN")).map((f) => fields(header(f, "OPEN")));
    expect(opens.map((o) => o["Hold Time"])).toEqual(["9", "90"]);
    expect(frames.filter((f) => header(f, "OPEN")).map((f) => fields(header(f, "BGP header")).length)).toEqual(["57", "65"]);
    const est = frames.find((f) => f.tag === "established")!;
    expect(est.state.vars["negotiated hold"]).toBe("min(9, 90) = 9 s");
    expect(est.state.vars.keepalive).toBe("9 / 3 = 3 s");
  });

  it("expires the hold timer exactly 9 s after the last message and sends NOTIFICATION 4/0", () => {
    const lastKa = frames.find((f) => f.state.vars["t (s)"] === "598.0015")!;
    const expiry = frames.find((f) => f.state.vars["t (s)"] === "607.0015")!;
    expect(lastKa).toBeDefined();
    expect(fields(header(expiry, "NOTIFICATION"))["error code"]).toBe("4 (Hold Timer Expired)");
    expect(fields(header(expiry, "BGP header")).length).toBe("21");
    const pts = expiry.state.chart!.series[0]!.points;
    expect(last(pts)).toBe(0);
    // From the reset at 598.0015 s to zero is 9 one-second steps.
    const lastNine = pts.lastIndexOf(9);
    expect(pts.length - 1 - lastNine).toBe(9);
    // While healthy the timer never drops below 6 s.
    expect(Math.min(...pts.slice(0, pts.indexOf(null)).filter((v): v is number => v !== null))).toBeGreaterThanOrEqual(6);
  });
});

describe("bgp-ribs", () => {
  const frames = run("bgp-ribs");

  it("encodes the received UPDATE in 70 bytes with two NLRIs", () => {
    const upd = frames.find((f) => f.state.headers?.at === "ISP2 → gw2.ams, as sent")!;
    const stack = upd.state.headers!.stack;
    expect(fields(header(upd, "BGP header")).length).toBe("70");
    expect(stack.reduce((n, h) => n + parseInt(h.size!, 10), 0)).toBe(70);
    expect(fields(header(upd, "NLRI")).prefixes).toBe("192.0.2.0/24, 192.0.2.128/25");
  });

  it("rejects the /25 on import and installs ISP2's path as best", () => {
    const post = frames.find((f) => f.tag === "post-policy")!;
    expect(post.state.tables[1]!.rows[1]![4]).toBe("rejected by policy");
    const loc = frames.find((f) => f.tag === "loc-rib")!;
    expect(loc.state.tables[1]!.rows.find((r) => r[5] === "yes")![0]).toBe("ISP2 (eBGP)");
    const fib = frames.find((f) => f.tag === "fib")!;
    expect(fib.state.tables[1]!.rows[1]).toEqual(["after", "198.51.100.0", "port to ISP2"]);
  });

  it("exports with next-hop-self and LOCAL_PREF to iBGP peers, own block only to ISP2", () => {
    const exp = frames.find((f) => f.tag === "export")!;
    expect(fields(header(exp, "NEXT_HOP")).address).toBe("10.255.1.202");
    expect(header(exp, "LOCAL_PREF")!.fresh).toBe(true);
    expect(fields(header(exp, "BGP header")).length).toBe("76");
    expect(exp.state.headers!.stack.reduce((n, h) => n + parseInt(h.size!, 10), 0)).toBe(76);
    const out = frames.find((f) => f.tag === "adj-rib-out")!;
    expect(out.state.tables[1]!.rows.find((r) => r[0] === "ISP2")![1]).toBe("203.0.113.0/24");
  });
});

describe("bgp-next-hop-resolution", () => {
  const frames = run("bgp-next-hop-resolution");
  const status = (tag: string) => frames.find((f) => f.tag === tag)!.state.tables[0]!.rows.find((r) => r[0] === "gw2.ams (iBGP)")?.[3];

  it("leaves NEXT_HOP unchanged over iBGP until next-hop-self", () => {
    const nhs = frames.filter((f) => f.tag === "send" && f.state.packets[0]?.from === "gw2.ams").map((f) => fields(header(f, "UPDATE")).NEXT_HOP);
    expect(nhs).toEqual(["198.51.100.0", "10.255.1.202"]);
    expect(status("unresolved")).toMatch(/unusable/);
    expect(status("resolved")).toBe("best");
  });

  it("resolves recursively to two spine next hops, then one after an IGP change", () => {
    const fib = frames.find((f) => f.tag === "fib")!;
    expect(fib.state.tables[0]!.rows[2]![2]).toBe("10.254.1.200 and 10.254.2.200, ECMP");
    const igp = frames.find((f) => f.tag === "igp-change")!;
    expect(igp.state.tables[0]!.rows[2]![2]).toBe("10.254.2.200");
    expect(igp.state.tables[0]!.rows[0]![2]).toContain("unchanged");
  });

  it("falls back to ISP1 when the next hop becomes unresolvable while the session is still up", () => {
    const f = frames.find((x) => x.tag === "unresolvable")!;
    expect(status("unresolvable")).toMatch(/unusable/);
    expect(f.state.tables[0]!.rows[0]![3]).toBe("best");
    expect(f.state.links.find((l) => l.a === "gw1.ams" && l.b === "gw2.ams")!.down).toBeFalsy();
    expect(f.state.tables[1]!.rows.some((r) => r[0] === "10.255.1.202/32")).toBe(false);
  });
});

describe("route-reflector", () => {
  const frames = run("route-reflector");

  it("replaces the 6-session full mesh with 2n + 1 reflector sessions", () => {
    const mesh = frames[0]!;
    expect(mesh.state.links).toHaveLength(6);
    const rr = frames.find((f) => f.tag === "reflectors")!;
    expect(rr.state.links).toHaveLength(9);
    expect(rr.state.tables[0]!.rows[1]).toEqual(["16 (all of ams)", "120", "32 + 1 = 33"]);
  });

  it("adds ORIGINATOR_ID and CLUSTER_LIST and keeps NEXT_HOP", () => {
    const f = frames.find((x) => x.tag === "attributes")!;
    const u = fields(header(f, "UPDATE"));
    expect(u.ORIGINATOR_ID).toBe("10.255.1.13");
    expect(u.CLUSTER_LIST).toBe("10.255.1.100");
    expect(u.NEXT_HOP).toBe("10.255.1.13");
  });

  it("drops the looped reflections at rr2.ams and leaf3.ams", () => {
    const loops = frames.filter((f) => f.tag === "loop");
    expect(loops.map((f) => [f.state.packets[0]!.from, f.state.packets[0]!.to, f.state.packets[0]!.lost])).toEqual([
      ["rr1.ams", "rr2.ams", true],
      ["rr1.ams", "leaf3.ams", true],
    ]);
  });

  it("loses overlay routes only when both reflectors fail", () => {
    expect(frames.find((f) => f.tag === "one-down")!.state.tables[1]!.rows.every((r) => r[2] === "unchanged")).toBe(true);
    expect(last(frames).state.tables[1]!.rows.every((r) => r[2] === "stops")).toBe(true);
  });
});

describe("bgp-best-path", () => {
  const steps = (frames: Frame<FabricState>[]) => table(last(frames.filter((f) => f.tag === "not-reached")), /decision process/)!.rows.map((r) => r[2]);

  it("eliminates A on AS_PATH length and C on IGP cost, so B wins", () => {
    const frames = run("bgp-best-path");
    const res = steps(frames);
    expect(res[4]).toBe("A out");
    expect(res[6]).toBe("tie");
    expect(res[8]).toBe("C out");
    expect(res.slice(9).every((r) => r === "not reached")).toBe(true);
    expect(nodeState(last(frames), "gw1.ams")).toBe("best: B");
    expect(last(frames).state.tables[0]!.rows[0]![1]).toBe("10.255.1.202");
  });

  it("variant local-pref: A wins at step 3 despite the longer AS_PATH", () => {
    const frames = run("bgp-best-path", { variant: "local-pref" });
    const res = steps(frames);
    expect(res[2]).toBe("B and C out");
    expect(res.slice(3).every((r) => r === "not reached")).toBe(true);
    expect(nodeState(last(frames), "gw1.ams")).toBe("best: A");
  });

  it("ignores an unknown variant", () => {
    expect(run("bgp-best-path", { variant: "nonsense" }).map((f) => f.note)).toEqual(run("bgp-best-path").map((f) => f.note));
  });
});
