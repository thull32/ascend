import { describe, expect, it } from "vitest";
import { MAX_FRAMES } from "../engine";
import { makeSystemFamily, type SystemInput } from "./system-core";
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
