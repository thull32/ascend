import { describe, expect, it } from "vitest";
import type { Frame } from "../engine";
import type { FabricInput, FabricState, FabTable } from "./fabric-core";
import { fabricFamily } from "./fabric";
import { scenarios } from "./fabric-scenarios-ops";

const run = (name: string, input: Record<string, unknown> = {}): Frame<FabricState>[] => fabricFamily.algorithms[name]!(fabricFamily.normalise!({ ...input }) as FabricInput);
const last = <T>(xs: T[]) => xs[xs.length - 1]!;
const byTag = (frames: Frame<FabricState>[], tag: string) => frames.filter((f) => f.tag === tag);
const one = (frames: Frame<FabricState>[], tag: string) => {
  const found = byTag(frames, tag);
  expect(found, `frames tagged ${tag}`).toHaveLength(1);
  return found[0]!;
};
const table = (f: Frame<FabricState>, title: string | RegExp): FabTable => {
  const t = f.state.tables.find((x) => (typeof title === "string" ? x.title === title : title.test(x.title)));
  expect(t, `table ${String(title)} in frame ${f.tag}`).toBeDefined();
  return t!;
};
const node = (f: Frame<FabricState>, id: string) => f.state.nodes.find((n) => n.id === id)!;
const field = (f: Frame<FabricState>, header: string, k: string) => f.state.headers?.stack.find((h) => h.name === header)?.fields.find((x) => x.k === k)?.v;

describe("ops pack registration", () => {
  it("registers the five module-08 scenarios in the family", () => {
    expect(Object.keys(scenarios).sort()).toEqual(["intent-drift", "netconf-commit", "probe-localisation", "spine-drain", "telemetry-blind"]);
    for (const name of Object.keys(scenarios)) {
      const n = run(name).length;
      expect(n, name).toBeGreaterThanOrEqual(8);
      expect(n, name).toBeLessThanOrEqual(25);
    }
  });
});

describe("intent-drift", () => {
  const frames = run("intent-drift");
  const running = (f: Frame<FabricState>) => table(f, "running on leaf1.ams").rows.map((r) => r.join(" = "));

  it("tells the story in order: render, diff, drift, merge, replace, idempotent rerun", () => {
    expect(frames.map((f) => f.tag)).toEqual(["topology", "intent", "render", "send", "drift", "triage", "intent", "diff", "merge", "merged", "replace", "replaced", "idempotent"]);
  });

  it("detects drift as a running value that differs from the render", () => {
    const drift = one(frames, "drift");
    expect(running(drift)).toContain("swp52 (spine2) = mtu 9216, isis metric 1000");
    expect(table(drift, "rendered (intended)").rows).toContainEqual(["swp52 (spine2)", "mtu 9216, isis metric 10"]);
  });

  it("deleting the segment drops two rendered lines; the diff has one change and two removals", () => {
    expect(table(frames[2]!, "rendered from the source of truth").rows).toHaveLength(8);
    const diff = one(frames, "diff");
    expect(table(diff, "diff: running → intended").rows.map((r) => r[0])).toEqual(["~", "−", "−"]);
  });

  it("merge fixes the changed value but leaves the deleted lines on the device", () => {
    const merged = one(frames, "merged");
    expect(running(merged)).toContain("swp52 (spine2) = mtu 9216, isis metric 10");
    expect(running(merged)).toContain("vlan 300 = vni 10102 (Acme staging)");
    expect(running(merged)).toContain("swp5 = access vlan 300");
    expect(table(merged, "diff: running → intended").rows.map((r) => r[1])).toEqual(["vlan 300", "swp5"]);
    expect(merged.state.vars["diff lines"]).toBe(2);
  });

  it("replace removes them, so running equals the render and a rerun pushes nothing", () => {
    const replaced = one(frames, "replaced");
    expect(table(replaced, "running on leaf1.ams").rows).toEqual(table(replaced, "rendered (intended)").rows);
    expect(running(replaced).some((l) => l.includes("vlan 300"))).toBe(false);
    expect(replaced.state.vars["diff lines"]).toBe(0);
    expect(last(frames).state.vars["changes pushed"]).toBe(0);
  });
});

describe("netconf-commit", () => {
  const ops = (frames: Frame<FabricState>[]) => frames.map((f) => field(f, "NETCONF", "operation")).filter((v, i, a) => v !== undefined && v !== a[i - 1]);

  it("runs hello, lock, edit-config, validate, commit confirmed, then loses the session", () => {
    const frames = run("netconf-commit");
    expect(frames).toHaveLength(12);
    expect(ops(frames)).toEqual(["hello", "lock", "edit-config", "validate", "commit", "get", "rpc-reply"]);
    const commit = one(frames, "commit");
    expect(field(commit, "NETCONF", "detail")).toBe("confirmed, confirm-timeout 120, persist chg-4711");
    expect(table(commit, "leaf1.ams datastores").rows[0]).toEqual(["running", "172.16.0.2/32, 172.16.10.0/24", "r42 (unconfirmed)"]);
  });

  it("the typo locks the automation out: its RPC and its reconnect are both dropped", () => {
    const lockout = byTag(run("netconf-commit"), "lockout");
    expect(lockout).toHaveLength(2);
    for (const f of lockout) expect(f.state.packets.some((p) => p.lost && p.to === "leaf1.ams")).toBe(true);
  });

  it("counts the confirm timer down and rolls back to r41 at expiry", () => {
    const frames = run("netconf-commit");
    const timers = frames.map((f) => f.state.vars["confirm timer"]).filter((v, i, a) => v !== undefined && v !== a[i - 1]);
    expect(timers).toEqual(["120 s", "117 s", "87 s", "60 s", "expired"]);
    const rollback = one(frames, "rollback");
    expect(table(rollback, "leaf1.ams datastores").rows[0]).toEqual(["running", "172.16.0.0/24, 172.16.10.0/24", "r41 (rolled back)"]);
    expect(rollback.state.log.some((l) => l.includes("rolled back to r41"))).toBe(true);
    expect(last(frames).state.vars.result).toBe("change failed, rolled back to r41");
  });

  it("variant confirm verifies, confirms with the persist-id and keeps r42", () => {
    const frames = run("netconf-commit", { variant: "confirm" });
    expect(frames).toHaveLength(10);
    expect(frames.some((f) => f.state.packets.some((p) => p.lost))).toBe(false);
    expect(field(one(frames, "confirm"), "NETCONF", "detail")).toBe("persist-id chg-4711 (confirming)");
    expect(table(last(frames), "leaf1.ams datastores").rows[0]).toEqual(["running", "172.16.0.20/32, 172.16.10.0/24", "r42"]);
  });

  it("an unknown variant falls back to the default rollback run", () => {
    expect(run("netconf-commit", { variant: 7 }).map((f) => f.note)).toEqual(run("netconf-commit").map((f) => f.note));
  });
});

describe("telemetry-blind", () => {
  const observed = (f: Frame<FabricState>) => table(f, "dead or congested?").rows.map((r) => r[3]);
  const series = (f: Frame<FabricState>, name: string) => f.state.chart!.series.find((s) => s.name === name)!.points;

  it("congested: leaf2's own series goes blank while spine1 reports the saturation", () => {
    const frames = run("telemetry-blind");
    expect(frames).toHaveLength(9);
    const absence = one(frames, "absence");
    expect(series(absence, "reported by leaf2")).toEqual([38, null, null, null]);
    expect(series(absence, "reported by spine1")).toEqual([38, 99.8, 99.8, 99.8]);
    expect(table(absence, "collector: gNMI subscriptions").rows[0]).toEqual(["leaf2.ams", "10:00:00", "NO DATA 30 s"]);
    expect(field(frames[0]!, "IPv4", "DSCP")).toBe("0 (best effort)");
  });

  it("congested: the OOB heartbeat answers and the neighbours see the link up and full", () => {
    const frames = run("telemetry-blind");
    const hb = one(frames, "heartbeat");
    expect(hb.state.packets.some((p) => p.lost)).toBe(false);
    expect(observed(one(frames, "neighbours"))).toEqual(["no answer", "replies, 0.6 ms", "up, adjacency Up", "399 of 400 Gb/s"]);
    expect(one(frames, "verdict").state.vars.verdict).toBe("alive, uplinks saturated");
    expect(field(last(frames), "IPv4", "DSCP")).toBe("16 (CS2, OAM)");
  });

  it("dead: the OOB ping is lost, the neighbours see the links down, and the verdict is dead", () => {
    const frames = run("telemetry-blind", { variant: "dead" });
    expect(frames).toHaveLength(8);
    expect(one(frames, "heartbeat").state.packets.some((p) => p.lost && p.to === "leaf2.ams")).toBe(true);
    expect(observed(one(frames, "neighbours"))).toEqual(["no answer", "no reply", "down since 10:00:05", "0"]);
    expect(one(frames, "verdict").state.vars.verdict).toBe("dead");
    expect(last(frames).state.links.filter((l) => l.down && (l.a === "leaf2.ams" || l.b === "leaf2.ams"))).toHaveLength(4);
  });
});

describe("probe-localisation", () => {
  const frames = run("probe-localisation");
  const streams = (tag: string) => table(one(frames, tag), /^TWAMP-light streams/).rows;

  it("ping uses one path, and it is not the bad spine", () => {
    const ping = one(frames, "ping");
    const spines = ping.state.packets.map((p) => (p.from.startsWith("spine") ? p.from : p.to)).filter((x) => x.startsWith("spine"));
    expect(new Set(spines).size).toBe(1);
    expect(spines[0]).not.toBe("spine3.ams");
    expect(table(ping, /^ping/).rows[0]).toEqual(["100", "100", "0%", "0.052 ms"]);
  });

  it("16 source ports cover all four spines and the mapping fills in every stream's spine", () => {
    expect(streams("probes").every((r) => r[2] === "?")).toBe(true);
    const mapped = streams("map");
    expect(mapped).toHaveLength(16);
    expect(mapped.map((r) => r[1])).toEqual(Array.from({ length: 16 }, (_, i) => String(50001 + i)));
    const counts = ["spine1", "spine2", "spine3", "spine4"].map((s) => mapped.filter((r) => r[2] === s).length);
    expect(counts).toEqual([4, 5, 3, 4]);
    expect(one(frames, "map").state.vars["streams per spine"]).toBe("spine1 4 · spine2 5 · spine3 3 · spine4 4");
  });

  it("every degraded stream shares spine3 and no other stream is degraded", () => {
    const rows = streams("results");
    const degraded = rows.filter((r) => parseFloat(r[3]!) > 1);
    expect(degraded).toHaveLength(3);
    expect(new Set(degraded.map((r) => r[2]))).toEqual(new Set(["spine3"]));
    expect(rows.filter((r) => r[2] === "spine3").every((r) => parseFloat(r[3]!) > 1)).toBe(true);
    const group = table(one(frames, "group"), "grouped by spine");
    expect(group.rows.find((r) => r[0] === "spine3")).toEqual(["spine3", "3", "3.93%"]);
    expect(one(frames, "results").state.vars["loss averaged over all streams"]).toBe("0.7%");
  });

  it("a second leaf pair narrows it to the spine3 → leaf3 link, and the counters agree", () => {
    const tri = table(one(frames, "triangulate"), "streams through spine3.ams, by leaf pair");
    expect(tri.rows.map((r) => [r[0], r[3]])).toEqual([
      ["leaf1 → leaf3", "3.93%"],
      ["leaf2 → leaf3", "3.96%"],
      ["leaf1 → leaf2", "0.00%"],
    ]);
    const counters = table(one(frames, "counters"), /^the suspect link/).rows;
    const sent = parseFloat(counters[0]![2]!);
    const ok = parseFloat(counters[1]![2]!);
    expect(Math.round((sent - ok) * 1000)).toBe(117); // millions
    expect(Math.round(((sent - ok) / sent) * 1000) / 10).toBe(3.9);
  });

  it("costing out the link rehashes every stream over the three other spines with zero loss", () => {
    const fix = one(frames, "fix");
    const rows = table(fix, /^same streams after the cost-out/).rows;
    expect(rows.every((r) => r[2] !== "spine3" && r[3] === "0.00%")).toBe(true);
    expect(table(fix, "leaf1.ams next hops for leaf3's prefixes").rows.map((r) => r[1])).toEqual(["spine1", "spine2", "spine4"]);
    expect(last(frames).state.vars["chance a spine gets no stream (16 random ports)"]).toBe("1.0% each");
  });
});

describe("spine-drain", () => {
  const frames = run("spine-drain");
  const checks = (f: Frame<FabricState>) => table(f, "pre-check: load per uplink if spine2 is drained").rows;

  it("follows pre-check, drain, verify, work, restore, verify", () => {
    expect(frames.map((f) => f.tag)).toEqual(["topology", "precheck", "precheck", "drain", "move", "verify", "work", "verify", "restore", "done"]);
  });

  it("the pre-check multiplies load by 4/3 and blocks at 14:00, passes at 02:00", () => {
    const [at14, at02] = byTag(frames, "precheck");
    const r14 = checks(at14!);
    expect(r14.filter((r) => r[3] === "BLOCK").map((r) => r[0])).toEqual(["leaf3.ams", "ams–sin circuits"]);
    expect(r14.find((r) => r[0] === "leaf3.ams")!.slice(1)).toEqual(["270 Gb/s", "360 Gb/s (90%)", "BLOCK"]);
    for (const r of r14.slice(0, 4)) expect(parseInt(r[2]!, 10)).toBe(Math.round((parseInt(r[1]!, 10) * 4) / 3));
    expect(checks(at02!).every((r) => r[3] === "pass")).toBe(true);
    expect(checks(at02!).find((r) => r[0] === "leaf3.ams")!.slice(1)).toEqual(["165 Gb/s", "220 Gb/s (55%)", "pass"]);
  });

  it("the drain costs spine2 at 16,777,214 per link, so its paths cost 16,777,224 and leave ECMP", () => {
    const drain = one(frames, "drain");
    expect(node(drain, "spine2.ams").state).toBe("metric 16,777,214");
    const nh = table(drain, "leaf3.ams next hops for leaf1's loopback 10.255.1.11/32").rows;
    expect(nh.map((r) => [r[1], r[2], r[3]])).toEqual([
      ["spine1", "20", "yes"],
      ["spine2", "16,777,224", "no"],
      ["spine3", "20", "yes"],
      ["spine4", "20", "yes"],
    ]);
  });

  it("traffic moves off spine2 before the reboot and returns after the restore", () => {
    const series = (name: string) => last(frames).state.chart!.series.find((s) => s.name === name)!.points;
    expect(series("spine2")).toEqual([165, 0, 0, 165, 165]);
    expect(series("spine1")).toEqual([165, 220, 220, 165, 165]);
    const move = one(frames, "move");
    expect(move.state.links.find((l) => l.a === "leaf3.ams" && l.b === "spine2.ams")!.width).toBe(0);
    expect(move.state.links.find((l) => l.a === "spine1.ams" && l.b === "spine1.sin")!.label).toBe("70 of 100G");
    const work = one(frames, "work");
    expect(work.state.links.filter((l) => l.down)).toHaveLength(5);
    expect(table(work, "impact during the reboot").rows[0]).toEqual(["packets lost", "0"]);
  });

  it("ends with every spine back at metric 10 and the post-check matching the pre-check", () => {
    const done = last(frames);
    expect(done.state.nodes.filter((n) => n.kind === "spine" && n.id.endsWith(".ams")).map((n) => n.state)).toEqual(["metric 10", "metric 10", "metric 10", "metric 10"]);
    const post = table(done, "post-check against the pre-check snapshot").rows;
    for (const r of post.slice(0, 4)) expect(r[1]).toBe(r[2]);
    expect(done.state.links.some((l) => l.down)).toBe(false);
  });
});
