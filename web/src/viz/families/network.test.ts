import { describe, expect, it } from "vitest";
import type { NetworkInput } from "./network";
import { networkFamily } from "./network";

const run = (algo: string, input: Record<string, unknown> = {}) => networkFamily.algorithms[algo]!(networkFamily.normalise!({ ...input }) as NetworkInput);
const last = <T>(xs: T[]) => xs[xs.length - 1]!;

describe("network scenarios", () => {
  it("tcp-teardown recommends server-side close and tcp_tw_reuse, not SO_REUSEADDR", () => {
    const done = last(run("tcp-teardown"));
    expect(done.note).toContain("tcp_tw_reuse");
    expect(done.note).not.toContain("SO_REUSEADDR");
  });

  it("distance-vector does not claim split horizon fixes count-to-infinity", () => {
    expect(String(last(run("distance-vector")).state.vars["failure mode"])).toContain("not loops of three or more");
  });

  it("arp caches for tens of seconds and bgp uses Netflix's real AS number", () => {
    expect(run("arp").some((f) => f.note.includes("tens of seconds"))).toBe(true);
    const bgp = run("bgp-path");
    expect(bgp[0]!.state.hosts[0]!.name).toBe("AS 2906 (Netflix)");
    expect(bgp.some((f) => f.state.log.some((l) => l.includes("64500")))).toBe(false);
  });

  it("sliding window without loss shows the window, not loss, limiting throughput", () => {
    const frames = run("sliding-window-protocol", { loss: 0 });
    expect(frames.some((f) => f.tag === "timeout" || f.tag === "loss")).toBe(false);
    expect(frames.some((f) => f.tag === "idle")).toBe(true);
  });

  it("encapsulation also decapsulates on receive", () => {
    const frames = run("osi-encapsulation");
    expect(Math.max(...frames.map((f) => f.state.layers?.length ?? 0))).toBe(4);
    expect(last(frames).state.layers).toHaveLength(1);
  });

  it("a fresh HTTPS connection costs 3 round trips and a reused one 1", () => {
    const frames = run("https-tls-handshake", { reuse: true });
    expect(last(frames).state.vars["fresh connection"]).toBe("3 round trips");
    expect(last(frames).state.vars["reused connection"]).toBe("1 round trip");
    expect(last(run("https-tls-handshake")).note).toContain("3 round trips");
  });

  it("dns answers with the lesson's address and long polling holds for 25 s", () => {
    expect(run("dns-resolution").some((f) => f.state.log.some((l) => l.includes("104.20.23.154")))).toBe(true);
    expect(run("long-polling-vs-sse").some((f) => f.note.includes("25 s"))).toBe(true);
  });

  it("slow start's readout matches the note on every ACK frame", () => {
    for (const f of run("congestion-slow-start", { loss: 0 })) {
      const m = /cwnd doubles to (\d+)|cwnd \+= 1 → (\d+)/.exec(f.note);
      if (m) expect(f.state.vars.cwnd).toBe(Number(m[1] ?? m[2]));
    }
    expect(last(run("congestion-slow-start", { loss: 0 })).note).not.toContain("sawtooth");
  });
});

describe("leftovers: per-lesson CDN, slow replica, chat push, NAT addresses", () => {
  it("cdn-cache takes the lesson's asset, places and TTL, and mentions Open Connect only by default", () => {
    const frames = run("cdn-cache", { origin: "Suggest server", path: "/suggest?q=netf", asset: "suggestions", same: "prefix", maxAge: 300, closing: "TTL 300 s." });
    expect(frames[0]!.state.hosts.map((h) => h.name)).toContain("Suggest server");
    expect(frames.some((f) => f.note.includes("cache for 300 s"))).toBe(true);
    expect(frames.some((f) => f.note.includes("Open Connect") || f.note.includes("a day"))).toBe(false);
    expect(last(run("cdn-cache")).note).toContain("Open Connect");
  });

  it("least connections sends the slow replica fewer requests than round robin would", () => {
    const done = last(run("load-balancer-least-conn", { slow: 3, factor: 3 }));
    expect(done.state.vars.served).toBe("4 / 3 / 1");
    expect(done.state.vars["round robin would send"]).toBe("3 / 3 / 2");
  });

  it("websocket's closing no longer refers to this app", () => {
    expect(last(run("websocket-upgrade")).note).not.toContain("this app");
  });

  it("nat uses the lessons' addresses and allocates 51001 because 51000 is taken", () => {
    const frames = run("nat");
    expect(frames[0]!.state.hosts.map((h) => h.name)).toEqual(["Laptop 192.168.1.11", "NAT router 203.0.113.5", "Web server 104.20.23.154"]);
    expect(frames.some((f) => f.state.log.some((l) => l.includes("203.0.113.5:51001")))).toBe(true);
  });
});
