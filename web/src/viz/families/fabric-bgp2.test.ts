// Mechanism tests for the BGP pack (fabric-scenarios-bgp2.tsx). fabric.test.ts
// already checks every scenario's shape (frames, notes, node references,
// rendering); these pin what each story claims: who wins a decision, which
// routes cross which session, which packet is dropped where.
import { describe, expect, it } from "vitest";
import type { Frame } from "../engine";
import type { FabHeader, FabricInput, FabricState, FabTable } from "./fabric-core";
import { fabricFamily } from "./fabric";
import { scenarios, simulateHunt } from "./fabric-scenarios-bgp2";

const run = (name: string, input: Record<string, unknown> = {}): Frame<FabricState>[] => fabricFamily.algorithms[name]!(fabricFamily.normalise!({ ...input }) as FabricInput);
const last = <T>(xs: T[]) => xs[xs.length - 1]!;
const fields = (h: FabHeader | undefined) => Object.fromEntries((h?.fields ?? []).map((f) => [f.k, f.v]));
const header = (f: Frame<FabricState>, name: string) => f.state.headers?.stack.find((h) => h.name === name);
const table = (f: Frame<FabricState>, title: string | RegExp): FabTable | undefined =>
  f.state.tables.find((t) => (typeof title === "string" ? t.title === title : title.test(t.title)));
/** The row of `t` toned "done" (the winner of a comparison). */
const winner = (t: FabTable | undefined) => t?.rows.find((_, i) => t.tones?.[i] === "done");
const tagged = (frames: Frame<FabricState>[], tag: string) => frames.filter((f) => f.tag === tag);
const lostPackets = (frames: Frame<FabricState>[]) => frames.flatMap((f) => f.state.packets.filter((p) => p.lost).map((p) => ({ f, p })));

const ipNum = (ip: string) => ip.split(".").reduce((n, o) => n * 256 + Number(o), 0);
const covers = (prefix: string, ip: string) => {
  const [net, len] = prefix.split("/");
  const bits = Number(len);
  if (!net || !/^\d+\.\d+\.\d+\.\d+$/.test(net) || !Number.isFinite(bits)) return false;
  const size = 2 ** (32 - bits);
  return Math.floor(ipNum(ip) / size) === Math.floor(ipNum(net) / size);
};

describe("bgp2 pack registry", () => {
  it("exports the seven scenarios with 8-25 frames for every documented run", () => {
    expect(Object.keys(scenarios).sort()).toEqual(["bgp-blackhole", "community-policy", "maintenance-order", "path-hunting", "route-hijack", "two-isp-te", "valley-free"]);
    const runs: [string, Record<string, unknown>][] = [
      ...Object.keys(scenarios).map((n) => [n, {}] as [string, Record<string, unknown>]),
      ["bgp-blackhole", { variant: "vxlan" }],
      ["maintenance-order", { variant: "bgp-first" }],
      ["maintenance-order", { variant: "igp-first" }],
    ];
    for (const [name, input] of runs) {
      const n = run(name, input).length;
      expect(n, `${name} ${JSON.stringify(input)}`).toBeGreaterThanOrEqual(8);
      expect(n, `${name} ${JSON.stringify(input)}`).toBeLessThanOrEqual(25);
    }
  });

  it("falls back to the default run on unknown variants", () => {
    expect(run("bgp-blackhole", { variant: "mpls" }).map((f) => f.note)).toEqual(run("bgp-blackhole").map((f) => f.note));
    expect(run("maintenance-order", { variant: 42 }).map((f) => f.note)).toEqual(run("maintenance-order").map((f) => f.note));
  });
});

describe("bgp-blackhole", () => {
  const frames = run("bgp-blackhole");

  it("keeps the session Established while spine1.ams drops the customer packet", () => {
    const drops = lostPackets(frames);
    expect(drops).toHaveLength(1);
    const { f, p } = drops[0]!;
    expect(p.from).toBe("spine1.ams");
    expect(f.state.vars["BGP session"]).toBe("Established");
    expect(f.state.vars["IS-IS adjacencies"]).toBe("2 of 2 up");
    expect(f.state.links.find((l) => l.a === "leaf1.ams" && l.b === "leaf3.ams")!.tone).toBe("done");
    expect(fields(header(f, "IPv4")).TTL).toBe("63");
  });

  it("advertises 10.1.2.0/24 with next hop 10.255.1.13, which leaf1 resolves to spine1", () => {
    const upd = frames.find((f) => header(f, "BGP UPDATE"))!;
    expect(fields(header(upd, "BGP UPDATE"))).toMatchObject({ NLRI: "10.1.2.0/24", NEXT_HOP: "10.255.1.13", AS_PATH: "(empty)" });
    const resolved = tagged(frames, "resolve")[0]!;
    expect(table(resolved, "leaf1.ams FIB")!.rows).toContainEqual(["10.1.2.0/24", "10.254.1.0 (spine1)", "to spine1"]);
  });

  it("gives spine1.ams no route covering 10.1.2.20 and none back to 10.1.1.10", () => {
    const lookup = tagged(frames, "lookup")[0]!;
    const rib = table(lookup, /spine1.ams lookup/)!.rows.map((r) => r[0]!);
    expect(rib).toHaveLength(4);
    for (const prefix of rib) {
      expect(covers(prefix, "10.1.2.20"), prefix).toBe(false);
      expect(covers(prefix, "10.1.1.10"), prefix).toBe(false);
    }
  });

  it("vxlan: spine1 forwards on the outer loopback with the same four routes, and the packet is delivered", () => {
    const fixed = run("bgp-blackhole", { variant: "vxlan" });
    expect(lostPackets(fixed)).toHaveLength(0);
    const atSpine = tagged(fixed, "underlay")[0]!;
    expect(fields(header(atSpine, "Outer IPv4"))).toMatchObject({ dst: "10.255.1.13", TTL: "63" });
    expect(fields(header(atSpine, "VXLAN")).VNI).toBe("50001");
    expect(table(atSpine, /spine1.ams lookup/)!.rows.map((r) => r[0])).toEqual(table(frames[1]!, /spine1.ams routing table/)!.rows.map((r) => r[0]));
    const innerTtl = fixed.filter((f) => header(f, "IPv4")).map((f) => fields(header(f, "IPv4")).TTL);
    expect([...new Set(innerTtl)]).toEqual(["64", "63", "62"]);
    const delivered = last(fixed.filter((f) => f.state.packets.some((p) => p.to === "acme-db1")));
    expect(delivered.state.packets[0]!.tone).toBe("done");
    expect(fields(header(delivered, "Ethernet"))["src MAC"]).toBe("00:00:5e:00:01:01");
  });
});

describe("community-policy", () => {
  const frames = run("community-policy");

  it("tags at import: customer 64500:100 with LOCAL_PREF 200, NO_EXPORT kept alongside", () => {
    const imports = tagged(frames, "import").map((f) => fields(header(f, "BGP UPDATE")));
    expect(imports[0]).toMatchObject({ NLRI: "198.51.100.0/24", COMMUNITIES: "64500:100", LOCAL_PREF: "200" });
    expect(imports[1]).toMatchObject({ NLRI: "198.51.100.128/25", COMMUNITIES: "NO_EXPORT 64500:100" });
  });

  it("exports only own and customer-tagged routes to the peer and to transit", () => {
    for (const title of ["gw2.ams export to the peer AS 64511", "gw1.ams export to transit ISP1"]) {
      const f = frames.find((x) => table(x, title))!;
      const t = table(f, title)!;
      expect(t.rows.filter((r) => r[2] === "send").map((r) => r[0])).toEqual(["203.0.113.0/24", "198.51.100.0/24"]);
      expect(t.rows.find((r) => r[0] === "198.51.100.128/25")![2]).toBe("kept in: NO_EXPORT");
    }
  });

  it("never lets the NO_EXPORT /25 leave AS 64500", () => {
    const external = new Set(["isp1", "content", "customer"]);
    for (const f of frames) for (const p of f.state.packets) if (external.has(p.to)) expect(p.label).not.toMatch(/\/25/);
    const cust = frames.find((x) => table(x, "gw1.ams export to the customer AS 64505"))!;
    expect(table(cust, "gw1.ams export to the customer AS 64505")!.rows.find((r) => r[0] === "198.51.100.128/25")![2]).toBe("kept in: NO_EXPORT");
  });
});

describe("two-isp-te", () => {
  const frames = run("two-isp-te");
  const tables = (title: string) => frames.map((f) => table(f, title)).filter(Boolean) as FabTable[];

  it("egress: gw2 keeps its own ISP2 path until LOCAL_PREF 200 makes it use gw1, then ISP2 after the cut", () => {
    const gw2 = tables("gw2.ams paths to 192.0.2.0/24").map((t) => winner(t)![0]);
    expect(gw2[0]).toBe("own eBGP, ISP2");
    expect(gw2).toContain("iBGP from gw1 (ISP1)");
    expect(last(gw2)).toBe("own eBGP, ISP2");
    const lp200 = tables("gw2.ams paths to 192.0.2.0/24").find((t) => winner(t)![0] === "iBGP from gw1 (ISP1)")!;
    expect(winner(lp200)![2]).toBe("200");
  });

  it("ingress: ISP2 by tie-break, ISP1 after prepending, ISP2's path is the prepended one after the cut", () => {
    const seen = tables("AS 64511's paths to 203.0.113.0/24").map((t) => winner(t)!);
    expect(seen.map((r) => r[0])).toEqual(["via ISP2", "via ISP2", "via ISP1", "via ISP2"]);
    expect(seen[2]![2]).toBe("2");
    expect(last(seen)).toEqual(["via ISP2", "64502 64500 64500 64500", "4"]);
  });

  it("LOCAL_PREF beats path length inside ISP2 until the 64502:70 community lowers it", () => {
    const isp2 = tables("ISP2's paths to 203.0.113.0/24").map((t) => winner(t)!);
    expect(isp2[0]).toEqual(["customer Meridian", "64500 64500 64500", "200"]);
    expect(last(isp2)).toEqual(["peer ISP1", "64501 64500", "100"]);
  });

  it("the more-specific /25 wins the lookup and the ISP1 link fails", () => {
    const fib = frames.find((f) => table(f, "AS 64511's FIB for 203.0.113.10"))!;
    expect(winner(table(fib, "AS 64511's FIB for 203.0.113.10"))![0]).toBe("203.0.113.0/25");
    expect(last(frames).state.links.find((l) => l.a === "isp1" && l.b === "gw1.ams")!.down).toBe(true);
    expect(last(frames).state.vars).toMatchObject({ egress: "ISP2 (only path left)", ingress: "ISP2 (only path left)" });
  });
});

describe("valley-free", () => {
  const frames = run("valley-free");

  it("states the Gao-Rexford export rule", () => {
    const t = table(frames[1]!, "Export rule (Gao-Rexford)")!;
    expect(t.rows).toEqual([["a customer", "yes", "yes", "yes"], ["a peer", "yes", "no", "no"], ["a provider", "yes", "no", "no"]]);
  });

  it("ISP1 prefers the leaked customer path despite its length; the transit provider does not", () => {
    const leak = tagged(frames, "leak")[0]!;
    const isp1 = table(leak, "ISP1's paths to 192.0.2.0/24")!;
    expect(isp1.rows[0]).toEqual(["customer Meridian", "64500 64502 64511", "200"]);
    expect(isp1.rows[0]![1]!.split(" ").length).toBeGreaterThan(isp1.rows[1]![1]!.split(" ").length);
    expect(winner(table(leak, "Transit AS 64496's paths to 192.0.2.0/24"))![0]).toBe("customer ISP2");
  });

  it("the valley runs ISP1 → Meridian → ISP2 and the filter is restored at the end", () => {
    const valley = tagged(frames, "valley")[0]!;
    expect(valley.state.packets.map((p) => `${p.from}>${p.to}`)).toEqual(["isp1>meridian", "meridian>isp2"]);
    expect(table(last(frames), "Meridian's export to ISP1")!.rows[2]![2]).toBe("do not send");
  });
});

describe("route-hijack", () => {
  const frames = run("route-hijack");
  const t1 = (f: Frame<FabricState>) => table(f, "AS 64496 routes for Meridian")?.rows.map((r) => r[0]);

  it("the /25 enters AS 64496's table, wins the lookup and black-holes the lower half only", () => {
    const hijacked = tagged(frames, "hijacked")[0]!;
    expect(t1(hijacked)).toContain("203.0.113.0/25");
    const lost = hijacked.state.packets.filter((p) => p.lost);
    expect(lost.map((p) => [p.to, p.label])).toEqual([["hijacker", "to 203.0.113.10"]]);
    expect(covers("203.0.113.0/25", "203.0.113.10")).toBe(true);
    expect(covers("203.0.113.0/25", "203.0.113.200")).toBe(false);
  });

  it("origin validation marks Valid, Invalid and NotFound, and the /25 is withdrawn", () => {
    const rov = tagged(frames, "rov")[0]!;
    expect(table(rov, "Route origin validation at AS 64496")!.rows.map((r) => r[4])).toEqual(["Valid", "Invalid", "NotFound"]);
    expect(table(rov, /ROA/)!.rows).toEqual([["203.0.113.0/24", "24", "64500"]]);
    const after = frames.slice(frames.indexOf(rov) + 1);
    for (const f of after) expect(t1(f)).not.toContain("203.0.113.0/25");
    expect(lostPackets(after)).toHaveLength(0);
  });

  it("is honest about what ROV cannot stop", () => {
    const limits = table(last(frames), "What origin validation checks")!;
    expect(limits.rows.find((r) => r[0] === "/24, AS_PATH 64510 64500")![1]).toBe("Valid");
  });
});

describe("path-hunting", () => {
  it("simulateHunt explores ever-longer stale paths before converging to no route", () => {
    const rounds = simulateHunt([64496, 64501, 64502], 64511);
    expect(rounds.map((r) => r.best[64501])).toEqual([[64501, 64511], [64501, 64496, 64511], [64501, 64502, 64496, 64511], null, null]);
    expect(rounds.map((r) => r.best[64496]?.length ?? 0)).toEqual([2, 3, 0, 0, 0]);
    // The transient loop: right after the withdrawal ISP1 and AS 64496 point at each other.
    expect(rounds[1]!.best[64501]![1]).toBe(64496);
    expect(rounds[1]!.best[64496]![1]).toBe(64501);
    expect(rounds.map((r) => r.sent)).toEqual([0, 6, 6, 4, 0]);
  });

  it("charts what Meridian sees and reports 60 s and 19 messages", () => {
    const frames = run("path-hunting");
    const chart = last(frames).state.chart!;
    expect(chart.series.find((s) => s.name === "AS_PATH length at Meridian")!.points).toEqual([2, 3, 4, null]);
    expect(chart.series.find((s) => s.name === "networks still holding a path")!.points).toEqual([3, 3, 2, 0]);
    expect(last(frames).state.vars).toMatchObject({ "time to converge": "about 60 s", "messages for one prefix": 19 });
    const loop = tagged(frames, "loop")[0]!;
    expect(loop.state.packets.map((p) => `${p.from}>${p.to}`)).toEqual(["isp1>t1", "t1>isp1"]);
  });
});

describe("maintenance-order", () => {
  it("BGP first loses nothing: GRACEFUL_SHUTDOWN, LOCAL_PREF 0 at ISP1, then IS-IS shut", () => {
    const frames = run("maintenance-order", { variant: "bgp-first" });
    expect(lostPackets(frames)).toHaveLength(0);
    const gshut = frames.find((f) => header(f, "BGP UPDATE to ISP1"))!;
    expect(fields(header(gshut, "BGP UPDATE to ISP1")).COMMUNITIES).toBe("GRACEFUL_SHUTDOWN (65535:0)");
    const lp0 = frames.find((f) => table(f, "ISP1's paths to 203.0.113.0/24")?.rows[0]?.[2] === "0")!;
    expect(winner(table(lp0, "ISP1's paths to 203.0.113.0/24"))![0]).toBe("peer ISP2");
    const order = frames.map((f) => f.tag);
    expect(order.indexOf("verify")).toBeLessThan(order.indexOf("igp"));
    expect(last(frames).state.vars.lost).toBe("0 packets");
  });

  it("IGP first black-holes inbound at gw1 while the eBGP session stays Established", () => {
    const frames = run("maintenance-order", { variant: "igp-first" });
    const drops = lostPackets(frames);
    expect(drops).toHaveLength(1);
    expect(drops[0]!.p.from).toBe("gw1.ams");
    expect(drops[0]!.f.state.vars["eBGP to ISP1"]).toBe("Established");
    expect(winner(table(drops[0]!.f, "ISP1's paths to 203.0.113.0/24"))![0]).toBe("customer gw1.ams");
    expect(table(drops[0]!.f, "gw1.ams lookup for 203.0.113.10")!.rows[0]).toEqual(["203.0.113.0/24", "discard", "static (announced)"]);
  });

  it("the default run tells both stories, clean first", () => {
    const frames = run("maintenance-order");
    expect(frames.length).toBe(run("maintenance-order", { variant: "bgp-first" }).length + run("maintenance-order", { variant: "igp-first" }).length - 2 + 1);
    const reset = frames.findIndex((f) => f.tag === "reset");
    expect(lostPackets(frames.slice(0, reset))).toHaveLength(0);
    expect(lostPackets(frames.slice(reset))).toHaveLength(1);
  });
});
