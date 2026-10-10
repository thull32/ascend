import { describe, expect, it } from "vitest";
import { MAX_FRAMES, type Frame } from "../engine";
import { consistentHashing, makeSystemFamily, requestFlow, type SystemInput, type SystemState } from "./system-core";
import { labelsA, scenariosA } from "./system-scenarios-a";

const EXPECTED = [
  "cache-aside",
  "write-through",
  "write-behind",
  "cache-stampede",
  "sharding-range",
  "sharding-hash",
  "replication-leader-follower",
  "replication-multi-leader",
  "quorum",
  "raft-log-replication",
  "two-phase-commit",
  "saga",
  "outbox",
  "idempotency-key",
  "lamport-clock",
  "vector-clock",
  "gossip",
  "distributed-lock",
  "leader-lease",
  "crdt-counter",
  "mvcc",
  "wal",
  "b-tree-index",
  "lsm-tree",
  "bloom-filter",
];

/** Inputs seen in content/tracks plus edge cases every scenario must survive. */
const INPUTS: SystemInput[] = [
  {},
  { nodes: 0, replicas: 0, requests: 0, keys: [] },
  { nodes: 1, replicas: 1, requests: 1, keys: ["only"] },
  { nodes: 2, replicas: 2, requests: 3 },
  { nodes: 3, replicas: 3, requests: 4 },
  { nodes: 4, replicas: 5, requests: 40 },
  { nodes: 999, replicas: 999, requests: 100000, keys: Array.from({ length: 200 }, (_, i) => `k${i}`) },
  { nodes: -5, replicas: Number.NaN, requests: Number.POSITIVE_INFINITY, keys: ["a", "a", "a"] },
  { keys: ["evt-1", "evt-2", "evt-3", "evt-9"] },
  { keys: ["42", "42", "47", "abc", "-1"] },
];

const family = makeSystemFamily(scenariosA, labelsA);

describe("system scenario pack A", () => {
  it("implements exactly the catalogue names assigned to pack A, with labels", () => {
    expect(Object.keys(scenariosA).sort()).toEqual([...EXPECTED].sort());
    for (const name of EXPECTED) expect(labelsA[name], `label for ${name}`).toBeTruthy();
  });

  for (const name of EXPECTED) {
    describe(name, () => {
      for (const input of INPUTS) {
        it(`produces valid frames for ${JSON.stringify(input).slice(0, 60)}`, () => {
          const gen = scenariosA[name]!;
          const frames = gen(family.normalise!({ ...input }));
          expect(frames.length).toBeGreaterThanOrEqual(8);
          expect(frames.length).toBeLessThanOrEqual(20);
          expect(frames.length).toBeLessThanOrEqual(MAX_FRAMES + 1);
          for (const f of frames) {
            expect(typeof f.note).toBe("string");
            expect(f.note.trim().length).toBeGreaterThan(0);
            expect(f.note).not.toContain("undefined");
            expect(f.note).not.toContain("NaN");
            const ids = new Set(f.state.nodes.map((n) => n.id));
            expect(ids.size).toBe(f.state.nodes.length);
            for (const m of f.state.messages) {
              expect(ids.has(m.from), `message from unknown node ${m.from} in ${name}`).toBe(true);
              expect(ids.has(m.to), `message to unknown node ${m.to} in ${name}`).toBe(true);
            }
            if (f.state.table) {
              for (const row of f.state.table.rows) for (const cell of row) expect(String(cell)).not.toContain("undefined");
            }
          }
          const last = frames[frames.length - 1]!;
          expect(last.tag).toBe("done");
        });
      }

      it("is pure: the same input gives the same frames twice", () => {
        const gen = scenariosA[name]!;
        const a = gen({ nodes: 3, replicas: 3, requests: 4 });
        const b = gen({ nodes: 3, replicas: 3, requests: 4 });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      });

      it("snapshots are independent between frames", () => {
        const frames = scenariosA[name]!({});
        const first = frames[0]!;
        const last = frames[frames.length - 1]!;
        expect(first.state).not.toBe(last.state);
        expect(first.state.nodes).not.toBe(last.state.nodes);
      });
    });
  }
});

// ---------- regression tests for the walkthrough fixes ----------

const run = (name: string, input: Record<string, unknown>): Frame<SystemState>[] => {
  const all = makeSystemFamily({ ...scenariosA, "consistent-hashing": consistentHashing, "request-flow": requestFlow }, {});
  return all.algorithms[name]!(all.normalise!({ ...input }));
};
const notes = (fs: Frame<SystemState>[]) => fs.map((f) => f.note).join("\n");
const validMessages = (fs: Frame<SystemState>[]) => {
  for (const f of fs) {
    const ids = new Set(f.state.nodes.map((n) => n.id));
    for (const m of f.state.messages) expect(ids.has(m.from) && ids.has(m.to), `${m.from} → ${m.to}`).toBe(true);
  }
};

describe("consistent hashing", () => {
  it("places the requested number of keys, spreads nodes, and moves only about 1/(n+1) to the new node", () => {
    const fs = run("consistent-hashing", { nodes: 4, keys: 12 });
    const last = fs[fs.length - 1]!.state.ring!;
    expect(last.keys).toHaveLength(12);
    const old = last.nodes.filter((n) => n.id !== "N5").map((n) => n.angle).sort((a, b) => a - b);
    const gaps = old.map((a, i) => ((old[(i + 1) % old.length]! - a + 360) % 360));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(80);
    const placed = fs.find((f) => f.tag === "placed")!.state.ring!.keys;
    const moved = last.keys.filter((k) => placed.find((p) => p.id === k.id)!.owner !== k.owner);
    expect(moved.length).toBeGreaterThanOrEqual(1);
    expect(moved.length).toBeLessThanOrEqual(3);
    for (const k of moved) expect(k.owner).toBe("N5");
  });
  it("honours lesson keys, positions and replicas", () => {
    const fs = run("consistent-hashing", { nodes: 3, keys: ["a", "b", "c"], positions: [10, 130, 250], replicas: 2 });
    expect(fs[0]!.state.ring!.nodes.map((n) => n.angle)).toEqual([10, 130, 250]);
    expect(fs.find((f) => f.tag === "place")!.note).toContain("hold");
  });
});

describe("idempotency key", () => {
  it("uses one key per operation and refuses the concurrent duplicate while the key is in progress", () => {
    const fs = run("idempotency-key", { requests: 3 });
    expect(notes(fs)).not.toMatch(/for this attempt/);
    const dup = fs.find((f) => f.note.includes("409"))!;
    expect(dup.state.table!.rows[0]![2]).toBe("in progress");
    expect(fs[fs.length - 1]!.state.vars.charges).toBe(1);
  });
  it("relabels per lesson and has a unique-constraint sink mode", () => {
    const fs = run("idempotency-key", { service: "Links API", request: "POST /v1/links", changed: "another URL", response: "201 x7Kq", record: "link x7Kq", target: "", effect: "mint x7Kq", effects: "links", requests: 2 });
    expect(notes(fs)).not.toMatch(/\$20|charge/);
    expect(fs[fs.length - 1]!.state.vars.links).toBe(1);
    const sink = run("idempotency-key", { store: "unique", requests: 3 });
    expect(sink[sink.length - 1]!.state.table!.rows).toHaveLength(1);
    expect(notes(sink)).not.toMatch(/409/);
  });
});

describe("request flow variants", () => {
  for (const variant of ["redirect", "latency", "aggregate", "chain", "trace", "trace-ascend", "trust", "layers"]) {
    it(`${variant} produces valid frames`, () => {
      const fs = run("request-flow", { variant, nodes: 5 });
      expect(fs.length).toBeGreaterThanOrEqual(8);
      expect(fs[fs.length - 1]!.tag).toBe("done");
      validMessages(fs);
    });
  }
  it("keeps the default scenario that the visualisation-engine lesson quotes", () => {
    expect(run("request-flow", {})[6]!.note).toBe("Fall through to the database (~5 ms).");
  });
  it("chain availability compounds per hop", () => {
    expect(run("request-flow", { variant: "chain", nodes: 5 }).at(-1)!.state.vars["end-to-end availability"]).toBe("99.5%");
  });
});

describe("storage engines", () => {
  it("LSM counts the fifth put in the WAL and keeps tombstones through a grace period", () => {
    const fs = run("lsm-tree", {});
    expect(fs.find((f) => f.state.messages[0]?.label === "put d=5")!.state.nodes.find((n) => n.id === "wal")!.state).toBe("5 records");
    const grace = run("lsm-tree", { grace: "gc_grace_seconds" });
    const l1 = grace.at(-1)!.state.table!.rows.find((r) => String(r[0]).startsWith("L1"))!;
    expect(String(l1[1])).toContain("c=⊥");
    expect(run("lsm-tree", { variant: "parts" }).length).toBeGreaterThanOrEqual(8);
  });
  it("WAL recovery does not present an undo phase as universal", () => {
    expect(notes(run("wal", {}))).toContain("Postgres has no undo phase");
  });
  it("B-tree never calls a full leaf roomy, and the composite index walks one lesson's comments", () => {
    expect(notes(run("b-tree-index", { keys: [52, 55, 58, 61] }))).not.toMatch(/has room \(4\/4\)/);
    expect(notes(run("b-tree-index", { variant: "composite" }))).toContain("LIMIT 3");
  });
  it("Bloom filter probes look like the lesson's keys, and the digest sends the key the peer lacks", () => {
    const fs = run("bloom-filter", { keys: ["colour=red", "size=L", "brand=acme"] });
    const probes = fs.filter((f) => f.note.startsWith("Query")).map((f) => /"([^"]+)"/.exec(f.note)![1]!);
    for (const p of probes) expect(p).toMatch(/^(colour|size|brand)=/);
    const digest = run("bloom-filter", { variant: "digest", keys: ["k1", "k2", "k3", "k7", "k9"] });
    expect(digest.some((f) => f.state.messages.some((m) => m.from === "B" && m.label.startsWith("k9")))).toBe(true);
  });
  it("MVCC has a table-snapshot form", () => {
    expect(notes(run("mvcc", { variant: "table" }))).toContain("snapshot");
  });
});

describe("replication and quorums", () => {
  it("quorum reads contact only R replicas and repair before answering; an in-flight write shows the inversion", () => {
    const fs = run("quorum", { replicas: 3 });
    const read = fs.find((f) => f.tag === "read")!;
    expect(read.state.messages).toHaveLength(2);
    const repair = fs.findIndex((f) => f.tag === "repair");
    const answer = fs.findIndex((f) => f.state.messages[0]?.label === "x=v2" && f.state.messages[0]?.to === "client");
    expect(repair).toBeGreaterThan(0);
    expect(repair).toBeLessThan(answer);
    expect(notes(fs)).not.toMatch(/compare-and-set/);
  });
  it("partition and Paxos variants", () => {
    expect(notes(run("quorum", { variant: "partition" }))).toContain("reject the write");
    const px = run("quorum", { variant: "paxos" }).at(-1)!.state.table!.rows;
    expect(px.map((r) => r[2])).toEqual(["2:X", "2:X", "2:X"]);
  });
  it("asynchronous mode never switches to synchronous", () => {
    const fs = run("replication-leader-follower", { replicas: 2, mode: "async" });
    for (const f of fs) expect(String(f.state.vars.mode)).not.toMatch(/synchronous \(/);
    expect(notes(fs)).toContain("acknowledged write x=3 is gone");
  });
  it("Kafka and per-zone cache variants", () => {
    expect(notes(run("replication-leader-follower", { variant: "kafka" }))).toContain("NotEnoughReplicas");
    validMessages(run("replication-leader-follower", { variant: "zones" }));
  });
  it("multi-leader resolution reaches every leader", () => {
    const fs = run("replication-multi-leader", { nodes: 3 });
    const resolved = fs.find((f) => f.tag === "resolve")!;
    for (const id of ["EU", "US", "APAC"]) expect(resolved.state.nodes.find((n) => n.id === id)!.state).toBe("title = 'Draft B'");
  });
  it("Raft log replication honours five nodes", () => {
    expect(run("raft-log-replication", { nodes: 5 })[0]!.state.table!.rows).toHaveLength(5);
  });
});

describe("partitioning", () => {
  it("hash sharding only calls a split even when it is", () => {
    for (const keys of [undefined, ["alice", "bob", "hank", "judy", "mia", "peggy"]]) {
      const bal = run("sharding-hash", keys ? { keys } : {}).find((f) => f.tag === "balance")!;
      const counts = String(bal.state.vars["keys per shard"]).split(" / ").map(Number);
      if (Math.max(...counts) - Math.min(...counts) > 1) expect(bal.note).toContain("uneven");
      expect(bal.note).not.toContain("roughly uniform");
    }
  });
  it("fixed partitions move whole partitions, never keys between partitions", () => {
    const fs = run("sharding-hash", { variant: "fixed", nodes: 3, keys: 12 });
    const add = fs.find((f) => f.tag === "add node")!;
    const before = fs[fs.findIndex((f) => f.tag === "add node") - 1]!;
    expect(add.state.table!.rows.map((r) => r[2])).toEqual(before.state.table!.rows.map((r) => r[2]));
    expect(add.state.table!.rows.filter((r) => r[1] === "N4")).toHaveLength(3);
  });
  it("the shuffle variant puts the hot key's rows in one partition; range sharding honours a key count", () => {
    expect(run("sharding-hash", { variant: "shuffle" }).some((f) => f.tag === "skew")).toBe(true);
    expect(run("sharding-range", { keys: 12 }).filter((f) => f.state.messages[0]?.label.startsWith("PUT"))).toHaveLength(12);
  });
});

describe("transactions and coordination", () => {
  it("outbox: the database readout always matches the table, and the crash leaves only the last row pending", () => {
    const fs = run("outbox", { requests: 4 });
    for (const f of fs) {
      const sent = f.state.table!.rows.filter((r) => r[2] === "sent").length;
      const db = f.state.nodes.find((n) => n.id === "db")!.state!;
      if (db.includes("sent")) expect(db).toContain(`${sent} sent`);
    }
    const crash = fs.find((f) => f.tag === "crash")!;
    expect(crash.state.table!.rows.map((r) => r[2])).toEqual(["sent", "sent", "sent", "pending"]);
  });
  it("saga compensations use each step's own explanation", () => {
    const fs = run("saga", { nodes: 3 });
    const comp = fs.filter((f) => f.state.messages[0]?.label.startsWith("C"));
    expect(comp.filter((f) => f.note.includes("refund is a new transaction"))).toHaveLength(1);
    const custom = run("saga", { steps: [{ service: "PSP", step: "T1 authorise", undo: "C1 void", why: "Voided." }, { service: "Entitlements", step: "T2 grant", undo: "C2 revoke", why: "Revoked." }, { service: "PSP", step: "T3 capture" }] });
    expect(custom[0]!.state.nodes.map((n) => n.label)).toEqual(["Orchestrator", "PSP", "Entitlements"]);
  });
  it("G-Counter converges on every replica and the healed node is no longer cut off", () => {
    const last = run("crdt-counter", { nodes: 3 }).find((f) => f.tag === "converged")!;
    const values = last.state.table!.rows.map((r) => r[r.length - 1]);
    expect(new Set(values).size).toBe(1);
    for (const n of last.state.nodes) expect(n.state).not.toContain("cut off");
  });
  it("gossip push-pull with fanout 3 sends three exchanges per node per round; SWIM variant", () => {
    const round = run("gossip", { nodes: 8, fanout: 3, mode: "push-pull" }).find((f) => f.tag === "round")!;
    expect(round.state.table!.rows[0]![4]).toBe(24);
    expect(run("gossip", { variant: "suspicion" }).some((f) => f.state.messages.some((m) => m.label.startsWith("ping-req")))).toBe(true);
  });
  it("leases: a fenced lease rejects the paused holder's epoch; Raft lease reads need no lease store", () => {
    expect(notes(run("leader-lease", { fencing: true, epoch: 7 }))).toContain("older than 8");
    const raft = run("leader-lease", { variant: "raft" });
    expect(raft[0]!.state.nodes.some((n) => n.id === "store")).toBe(false);
  });
  it("distributed lock can fence with the storage's conditional write", () => {
    expect(notes(run("distributed-lock", { fence: "conditional" }))).toContain("condition no longer holds");
  });
  it("write-through does not promise that cache and database never disagree", () => {
    const n = notes(run("write-through", {}));
    expect(n).not.toMatch(/never disagree|guaranteed fresh/);
    expect(n).toContain("The cache says 14, the database says 13");
  });
});
