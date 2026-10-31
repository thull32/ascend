import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import type { Frame } from "../engine";
import { FabricRenderer, ipv4Checksum, type FabHeader, type FabricInput, type FabricState } from "./fabric-core";
import { labels, scenarios } from "./fabric-scenarios-zero";
import { fabricFamily } from "./fabric";

const NAMES = ["ethernet-frame", "mac-learning", "vlan-trunk", "broadcast-storm", "subnet-math", "lpm-lookup", "arp-gateway", "pmtud-blackhole", "switch-pipeline", "linux-rx-path"];

const run = (name: string, input: Record<string, unknown> = {}): Frame<FabricState>[] => scenarios[name]!(fabricFamily.normalise!({ ...input }) as FabricInput);
const last = <T>(xs: T[]) => xs[xs.length - 1]!;
const fields = (h: FabHeader | undefined) => Object.fromEntries((h?.fields ?? []).map((f) => [f.k, f.v]));
const header = (f: Frame<FabricState>, name: string) => f.state.headers?.stack.find((h) => h.name === name);
const table = (f: Frame<FabricState>, title: string | RegExp) => f.state.tables.find((t) => (typeof title === "string" ? t.title === title : title.test(t.title)));
const cell = (f: Frame<FabricState>, title: string | RegExp, key: string, col = 1) => table(f, title)?.rows.find((r) => r[0] === key)?.[col];

const RUNS: [string, Record<string, unknown>][] = [
  ...NAMES.map((n) => [n, {}] as [string, Record<string, unknown>]),
  ["ethernet-frame", { payload: 9000 }],
  ["ethernet-frame", { payload: 10 }],
  ["ethernet-frame", { payload: "junk" }],
  ["subnet-math", { cidr: "192.168.10.77/27" }],
  ["subnet-math", { cidr: "300.1.1.1/24" }],
  ["subnet-math", { cidr: 42 }],
  ["arp-gateway", { variant: "no-reply" }],
  ["arp-gateway", { variant: "bogus" }],
];

describe("fabric zero pack", () => {
  it("exports exactly its ten scenarios, each with a label", () => {
    expect(Object.keys(scenarios).sort()).toEqual([...NAMES].sort());
    for (const n of NAMES) expect(labels[n]).toBeTruthy();
  });

  describe.each(RUNS.map(([n, i]) => [`${n} ${JSON.stringify(i)}`, n, i] as const))("%s", (_l, name, input) => {
    const frames = run(name, input);
    it("has 8-25 frames with distinct, complete notes", () => {
      expect(frames.length).toBeGreaterThanOrEqual(8);
      expect(frames.length).toBeLessThanOrEqual(25);
      expect(new Set(frames.map((f) => f.note)).size).toBe(frames.length);
      for (const f of frames) {
        expect(f.note).not.toMatch(/undefined|NaN|\[object/);
        expect(/[.!?)]$/.test(f.note.trim()), f.note).toBe(true);
      }
    });
    it("renders every frame", () => {
      frames.forEach((frame, index) => {
        const { container, unmount } = render(createElement(fabricFamily.Renderer ?? FabricRenderer, { frame, input: input as FabricInput, index, total: frames.length }));
        expect(container.querySelector("svg")).not.toBeNull();
        unmount();
      });
    });
  });
});

describe("ethernet-frame", () => {
  it("adds up a 1,518-byte frame, 12,304 bits of wire time and the four serialisation times", () => {
    const frames = run("ethernet-frame");
    const total = frames.find((f) => f.tag === "total")!;
    expect(total.state.vars["frame size"]).toBe("1,518 B");
    expect(total.state.vars["wire time used"]).toBe("1,538 B = 12,304 bits");
    const ser = table(last(frames.filter((f) => f.tag === "serialise")), /^Serialising/)!;
    expect(ser.rows.map((r) => r.slice(0, 2))).toEqual([
      ["1 Gb/s", "12.304 µs"],
      ["10 Gb/s", "1.2304 µs"],
      ["100 Gb/s", "123.04 ns"],
      ["400 Gb/s", "30.76 ns"],
    ]);
    expect(ser.rows[3]![2]).toBe("6.15 m");
    const fieldOrder = total.state.headers!.stack.map((h) => h.name);
    expect(fieldOrder).toEqual(["Preamble + SFD", "Ethernet header", "Payload", "FCS"]);
    const done = last(frames);
    expect(cell(done, /counters/, "in FCS errors")).toBe("1");
    expect(done.state.packets[0]!.lost).toBe(true);
  });

  it("follows the payload input (jumbo and clamped minimum)", () => {
    expect(run("ethernet-frame", { payload: 9000 }).find((f) => f.tag === "total")!.state.vars["frame size"]).toBe("9,018 B");
    expect(run("ethernet-frame", { payload: 10 }).find((f) => f.tag === "total")!.state.vars["frame size"]).toBe("64 B");
  });
});

describe("mac-learning", () => {
  const frames = run("mac-learning");
  const macTable = (f: Frame<FabricState>) => table(f, /MAC address table/)!.rows.map((r) => [r[1], r[2]]);
  it("learns sources only, floods unknowns to the three other ports, forwards knowns to one", () => {
    const learned = frames.find((f) => f.tag === "learn")!;
    expect(macTable(learned)).toEqual([["00:00:5e:00:53:0a", "port 1"]]);
    const floods = frames.filter((f) => f.tag === "flood");
    expect(floods).toHaveLength(3);
    for (const f of floods) expect(f.state.packets).toHaveLength(3);
    expect(floods[0]!.state.packets.map((p) => p.to)).toEqual(["acme-app1", "acme-app2", "acme-app3"]);
    const forwards = frames.filter((f) => f.tag === "forward");
    expect(forwards.map((f) => f.state.packets.map((p) => p.to))).toEqual([["acme-web1"], ["acme-app2"]]);
  });
  it("ages acme-app3 out after 300 s and floods to it again; acme-app1 is never learned", () => {
    const aging = frames.filter((f) => f.tag === "aging");
    expect(table(aging[0]!, /MAC/)!.rows.find((r) => r[1] === "00:00:5e:00:53:10")![3]).toBe("285 s");
    expect(macTable(aging[1]!).map((r) => r[0])).not.toContain("00:00:5e:00:53:10");
    const lastFlood = last(frames.filter((f) => f.tag === "flood"));
    expect(fields(header(lastFlood, "Ethernet"))["dst MAC"]).toBe("00:00:5e:00:53:10");
    expect(macTable(last(frames)).map((r) => r[0])).not.toContain("00:00:5e:00:53:0d");
  });
});

describe("vlan-trunk", () => {
  const frames = run("vlan-trunk");
  it("tags only on the trunk: VID 100 then VID 200, TPID 0x8100, untagged on access ports", () => {
    const trunk = frames.filter((f) => f.tag === "trunk");
    expect(trunk.map((f) => fields(header(f, "802.1Q tag")).VID)).toEqual(["100", "200"]);
    for (const f of trunk) {
      expect(fields(header(f, "Ethernet")).EtherType).toBe("0x8100 (802.1Q)");
      expect(fields(header(f, "802.1Q tag")).EtherType).toBe("0x0806 (ARP)");
      expect(f.state.packets[0]).toMatchObject({ from: "leaf1.ams", to: "leaf2.ams" });
    }
    for (const f of frames.filter((x) => x.tag === "deliver" || x.tag === "send")) {
      expect(header(f, "802.1Q tag")).toBeUndefined();
      expect(fields(header(f, "Ethernet")).EtherType).toBe("0x0806 (ARP)");
    }
  });
  it("delivers each VLAN's broadcast only to that VLAN's host", () => {
    const delivered = frames.filter((f) => f.tag === "deliver").map((f) => f.state.packets[0]!.to);
    expect(delivered).toEqual(["acme-web3", "acme-db3"]);
    expect(frames.some((f) => f.state.packets.some((p) => p.to === "acme-db2"))).toBe(false);
  });
});

describe("broadcast-storm", () => {
  const frames = run("broadcast-storm");
  it("keeps two copies circling with no STP, flapping leaf1's MAC entry", () => {
    const loops = frames.filter((f) => f.tag === "loop");
    expect(loops).toHaveLength(2);
    for (const f of loops) expect(f.state.vars["copies in the loop"]).toBe(2);
    expect(loops[1]!.state.vars["acme-web1 got its own back"]).toBe(2);
    expect(table(loops[0]!, /MAC table/)!.rows[0]![1]).toBe("port 49, then port 50");
    const chart = frames.find((f) => f.state.chart)!.state.chart!;
    expect(last(chart.series[0]!.points)).toBe(100);
    expect(frames.find((f) => f.state.chart)!.state.vars["links full after"]).toBe("45 broadcasts");
  });
  it("elects leaf1 root and blocks leaf3's port to leaf2; each host then gets one copy", () => {
    const stp = frames.filter((f) => f.tag === "stp");
    expect(table(stp[0]!, /bridge IDs/)!.rows[0]).toEqual(["leaf1.ams", "32768.00:00:5e:00:53:80", "0 (root)"]);
    const roles = table(last(stp), /port roles/)!.rows;
    expect(roles.filter((r) => r[3] === "discarding")).toEqual([["leaf3.ams", "p50 → leaf2", "alternate", "discarding"]]);
    expect(roles.filter((r) => r[2] === "root").map((r) => r[0])).toEqual(["leaf2.ams", "leaf3.ams"]);
    const after = last(frames.filter((f) => f.tag === "flood"));
    expect(after.state.packets.filter((p) => p.lost).map((p) => [p.from, p.to])).toEqual([["leaf2.ams", "leaf3.ams"]]);
    expect(after.state.vars["acme-web3 received"]).toBe(1);
    expect(after.state.vars["acme-web4 received"]).toBe(1);
  });
});

describe("subnet-math", () => {
  it("computes 10.1.1.10/24 and 10.254.1.1/31 bit by bit", () => {
    const frames = run("subnet-math");
    const range = frames.find((f) => f.tag === "range")!;
    expect(cell(range, "10.1.1.0/24", "network")).toBe("10.1.1.0");
    expect(cell(range, "10.1.1.0/24", "broadcast")).toBe("10.1.1.255");
    expect(cell(range, "10.1.1.0/24", "first host")).toBe("10.1.1.1");
    expect(cell(range, "10.1.1.0/24", "last host")).toBe("10.1.1.254");
    expect(cell(range, "10.1.1.0/24", "usable hosts")).toBe("2^8 − 2 = 254");
    const and = frames.filter((f) => f.tag === "and");
    expect(cell(and[0]!, /bit by bit/, "AND = network", 2)).toBe("00001010.00000001.00000001|00000000");
    expect(cell(and[1]!, /bit by bit/, "AND = network", 1)).toBe("10.254.1.0");
    expect(cell(and[1]!, /bit by bit/, "mask", 2)).toBe("11111111.11111111.11111111.1111111|0");
    const p2pRange = frames.filter((f) => f.tag === "range")[1]!;
    expect(table(p2pRange, "10.254.1.0/31")!.rows).toEqual([
      ["10.254.1.0", "spine1.ams"],
      ["10.254.1.1", "leaf1.ams"],
    ]);
    const test = frames.find((f) => f.tag === "test")!;
    expect(table(test, /on my subnet/)!.rows.map((r) => r[2])).toEqual(["yes: deliver directly", "no: send to the gateway"]);
  });
  it("accepts a custom cidr and ignores invalid ones", () => {
    const frames = run("subnet-math", { cidr: "192.168.10.77/27" });
    const range = frames.find((f) => f.tag === "range")!;
    expect(cell(range, "192.168.10.64/27", "broadcast")).toBe("192.168.10.95");
    expect(cell(range, "192.168.10.64/27", "usable hosts")).toBe("2^5 − 2 = 30");
    expect(run("subnet-math", { cidr: "300.1.1.1/24" })[0]!.state.vars.address).toBe("10.1.1.10/24");
  });
});

describe("lpm-lookup", () => {
  const frames = run("lpm-lookup");
  it("checks each prefix and picks 198.51.100.0/27 over the /24 and the default", () => {
    const checks = frames.filter((f) => f.tag === "check");
    expect(checks.map((f) => f.state.vars["best so far"])).toEqual(["0.0.0.0/0 (0 bits)", "0.0.0.0/0 (0 bits)", "198.51.100.0/24 (24 bits)", "198.51.100.0/24 (24 bits)", "198.51.100.0/27 (27 bits)"]);
    const winner = frames.find((f) => f.tag === "winner")!;
    const rib = table(winner, /RIB/)!;
    expect(rib.rows.map((r) => r[3])).toEqual(["yes, 0 bits", "no", "yes, 24 bits", "no", "yes, 27 bits", "no", "no", "no", "no"]);
    expect(rib.tones![4]).toBe("done");
    expect(winner.state.vars.winner).toBe("198.51.100.0/27 via 10.255.1.202");
  });
  it("resolves the BGP next hop recursively down to the connected /31s and programs ECMP", () => {
    const res = last(frames.filter((f) => f.tag === "resolve"));
    expect(table(res, /Recursive/)!.rows.map((r) => r[1])).toEqual(["198.51.100.0/27 (BGP)", "10.255.1.202/32 (IS-IS)", "10.254.1.0/31 (connected)", "10.254.2.0/31 (connected)"]);
    const fib = table(frames.find((f) => f.tag === "fib")!, /FIB/)!;
    expect(fib.rows.map((r) => r[1])).toEqual(["10.254.1.0", "10.254.2.0"]);
  });
});

describe("arp-gateway", () => {
  it("ARPs for the gateway, caches the anycast MAC and sends the SYN to it", () => {
    const frames = run("arp-gateway");
    const states = frames.map((f) => table(f, /ARP cache/)?.rows[0]?.[2]).filter(Boolean);
    expect([...new Set(states)]).toEqual(["INCOMPLETE", "REACHABLE"]);
    const req = frames.find((f) => f.tag === "arp")!;
    expect(fields(header(req, "Ethernet"))["dst MAC"]).toBe("ff:ff:ff:ff:ff:ff");
    expect(fields(header(req, "ARP"))["target IP"]).toBe("10.1.1.1");
    const reply = frames.find((f) => f.tag === "reply")!;
    expect(fields(header(reply, "ARP"))["sender MAC"]).toBe("00:00:5e:00:01:01");
    expect(table(reply, /leaf1.ams neighbour/)!.rows[0]).toEqual(["10.1.1.10", "00:00:5e:00:53:0a", "the ARP request"]);
    const syn = frames.find((f) => f.tag === "send" && header(f, "IPv4"))!;
    expect(fields(header(syn, "Ethernet"))["dst MAC"]).toBe("00:00:5e:00:01:01");
    expect(fields(header(syn, "IPv4")).dst).toBe("10.1.2.20");
  });
  it("no-reply: three probes, then FAILED and EHOSTUNREACH; an unknown variant runs the default", () => {
    const frames = run("arp-gateway", { variant: "no-reply" });
    expect(frames.filter((f) => f.tag === "retry")).toHaveLength(2);
    expect(table(last(frames), /ARP cache/)!.rows[0]![2]).toBe("FAILED");
    expect(last(frames).state.vars["probes sent"]).toBe(3);
    expect(frames.some((f) => f.tag === "reply")).toBe(false);
    expect(run("arp-gateway", { variant: "bogus" }).some((f) => f.tag === "reply")).toBe(true);
  });
});

describe("pmtud-blackhole", () => {
  const frames = run("pmtud-blackhole");
  it("drops the 1,500-byte DF packet at the 1,450 tunnel and filters the ICMP frag-needed", () => {
    const drops = frames.filter((f) => f.tag === "drop");
    expect(fields(header(drops[0]!, "IPv4"))["total length"]).toBe("1,500");
    expect(drops[0]!.state.packets[0]).toMatchObject({ from: "gw1.ams", lost: true });
    const icmp = fields(header(drops[1]!, "ICMP"));
    expect([icmp.type, icmp.code, icmp["next-hop MTU"]]).toEqual(["3 (unreachable)", "4 (fragmentation needed)", "1450"]);
    expect(drops[1]!.state.packets[0]).toMatchObject({ to: "acme-web1", lost: true });
    const retx = frames.find((f) => f.tag === "retransmit")!;
    expect(cell(retx, /socket/, "next RTO")).toBe("3,200 ms");
    expect(cell(retx, /socket/, "bytes acknowledged")).toBe("0");
  });
  it("clamps both SYNs to MSS 1,410 so 1,450-byte packets fit", () => {
    const clamps = frames.filter((f) => f.tag === "clamp");
    expect(clamps.map((f) => fields(header(f, "TCP")).MSS)).toEqual(["1410", "1410"]);
    expect(clamps.map((f) => fields(header(f, "TCP")).flags)).toEqual(["SYN", "SYN ACK"]);
    const ok = last(frames.filter((f) => f.tag === "send"));
    expect(fields(header(ok, "IPv4"))["total length"]).toBe("1,450");
    expect(ok.state.packets[0]!.lost).toBeUndefined();
  });
});

describe("switch-pipeline", () => {
  const frames = run("switch-pipeline");
  it("forwards in hardware: ACL rule 30, TTL 64 → 63 with the real checksum, new MACs", () => {
    const acl = table(frames.find((f) => f.tag === "acl")!, /ACL/)!;
    expect(acl.rows[acl.tones!.indexOf("done")]![0]).toBe("30");
    const rw = frames.find((f) => f.tag === "rewrite")!;
    const ip = fields(header(rw, "IPv4"));
    expect(ip.TTL).toBe("63");
    const base = { totalLength: 60, id: 0x3a1f, flagsFragment: 0x4000, protocol: 6, src: "10.1.1.10", dst: "10.1.2.20" };
    expect(ip["header checksum"]).toBe(ipv4Checksum({ ...base, ttl: 63 }));
    expect(ip["header checksum"]).toBe("0xea7d");
    const eth = fields(header(rw, "Ethernet"));
    expect([eth["dst MAC"], eth["src MAC"]]).toEqual(["00:00:5e:00:53:81", "00:00:5e:00:53:80"]);
    expect(cell(frames.find((f) => f.tag === "egress")!, /counters/, "packets seen by CPU")).toBe("0");
  });
  it("punts the BGP KEEPALIVE to the CPU through CoPP instead of an egress port", () => {
    const punts = frames.filter((f) => f.tag === "punt");
    expect(fields(header(punts[0]!, "TCP"))["dst port"]).toBe("179");
    const fib = table(punts[1]!, /FIB/)!;
    expect(fib.rows[fib.tones!.indexOf("active")]).toEqual(["10.255.1.11/32", "receive", "CPU"]);
    const cpu = frames.find((f) => f.tag === "cpu")!;
    expect(cpu.state.nodes.find((n) => n.id === "cpu")!.state).toBe("hold timer reset");
    expect(cpu.state.nodes.find((n) => n.id === "out")!.tone).toBe("default");
  });
});

describe("linux-rx-path", () => {
  const frames = run("linux-rx-path");
  it("walks NIC → ring → NAPI → GRO → IP → TCP → socket → app in order", () => {
    const visited: string[] = [];
    for (const f of frames) for (const n of f.state.nodes) if (n.tone === "active" && !visited.includes(n.id)) visited.push(n.id);
    expect(visited).toEqual(["nic", "ring", "napi", "gro", "ip", "tcp", "sock", "app"]);
    const gro = table(frames.find((f) => f.state.nodes.some((n) => n.id === "gro" && n.tone === "active"))!, /GRO/)!;
    expect(last(gro.rows)).toEqual(["merged", "1", "5,840"]);
  });
  it("overflows the 1,024-descriptor ring in a 1 ms stall and drops 1,008 frames", () => {
    const burst = frames.find((f) => f.tag === "burst")!;
    const [occ, lost] = burst.state.chart!.series;
    expect(Math.max(...(occ!.points as number[]))).toBe(1024);
    expect(last(lost!.points)).toBe(1008);
    expect(burst.state.vars.rx_missed_errors).toBe("+1,008");
    expect(table(burst, /Where acme-db1 counts drops/)!.rows).toHaveLength(6);
  });
});
