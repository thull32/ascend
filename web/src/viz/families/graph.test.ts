import { describe, expect, it } from "vitest";
import { MAX_FRAMES } from "../engine";
import { graphFamily, type GraphInput } from "./graph";

const run = (name: string, raw: Record<string, unknown>) => graphFamily.algorithms[name]!(graphFamily.normalise!(raw));
const nodes = (...ids: string[]) => ids.map((id) => ({ id }));
const edges = (...pairs: string[]) => pairs.map((p) => ({ from: p[0]!, to: p[1]! }));

describe("graph family", () => {
  for (const [name, gen] of Object.entries(graphFamily.algorithms)) {
    it(`${name}: the example produces well-formed frames`, () => {
      const example = graphFamily.examples[name] as GraphInput;
      expect(example).toBeDefined();
      expect(graphFamily.labels?.[name]).toBeTruthy();
      const frames = gen(graphFamily.normalise!(example as unknown as Record<string, unknown>));
      expect(frames.length).toBeGreaterThan(0);
      expect(frames.length).toBeLessThanOrEqual(MAX_FRAMES + 1);
      for (const fr of frames) expect(fr.note.trim().length).toBeGreaterThan(0);
    });
  }
});

describe("dfs", () => {
  // The depth-first-search lesson's traced graph and its d/f table.
  const traced = {
    directed: true,
    start: "0",
    nodes: nodes("0", "1", "2", "3", "4", "5", "6", "7"),
    edges: edges("01", "03", "02", "13", "21", "25", "30", "34", "56", "54", "67", "75"),
  };

  it("stamps discovery and finish times from 1, as in the lesson's table", () => {
    const last = run("dfs", traced).at(-1)!;
    expect(last.state.labels).toEqual({ "0": "1/16", "1": "2/7", "2": "8/15", "3": "3/6", "4": "4/5", "5": "9/14", "6": "10/13", "7": "11/12" });
  });

  it("classifies every non-tree edge of the traced graph", () => {
    const tagged = run("dfs", traced)
      .filter((fr) => ["back edge", "forward", "cross"].includes(fr.tag ?? ""))
      .map((fr) => `${fr.tag}:${fr.note.split(":")[0]}`);
    expect(tagged).toEqual(["back edge:3→0", "forward:0→3", "cross:2→1", "back edge:7→5", "cross:5→4"]);
  });

  it("does not flag the edge back to the parent in an undirected graph", () => {
    const frames = run("dfs", {
      directed: false,
      start: "A",
      nodes: nodes("A", "B", "C", "D", "E", "F"),
      edges: edges("AB", "AC", "BD", "CD", "DE", "BF"),
    });
    const back = frames.filter((fr) => fr.tag === "back edge");
    expect(back).toHaveLength(1);
    expect(back[0]!.note.startsWith("C—A")).toBe(true);
    const enters = frames.filter((fr) => fr.tag === "enter").map((fr) => fr.note.slice(6, 7));
    expect(enters).toEqual(["A", "B", "D", "C", "E", "F"]);
    const tones = frames.at(-1)!.state.edgeTones;
    expect(tones).toEqual({ "A->B": "path", "B->D": "path", "C->D": "path", "D->E": "path", "B->F": "path", "A->C": "danger" });
  });
});

describe("cycle-detect", () => {
  it("runs the three-colour check (not a topological sort) and lets a black target pass", () => {
    const frames = run("cycle-detect", {
      directed: true,
      start: "A",
      nodes: nodes("A", "B", "C", "D", "E"),
      edges: edges("AB", "BC", "AC", "AD", "DE", "EA"),
    });
    expect(frames[0]!.note).toMatch(/grey/);
    expect(frames.some((fr) => /topological/i.test(fr.note))).toBe(false);
    const black = frames.find((fr) => fr.tag === "black")!;
    expect(black.note.startsWith("A→C: C is black")).toBe(true);
    expect(black.state.labels.C).toBe("black");
    const last = frames.at(-1)!;
    expect(last.tag).toBe("cycle");
    expect(last.state.vars.cycle).toBe("A → D → E → A");
  });

  it("shows the D → C check on the lesson's traced graph before finding E → F → G → E", () => {
    const frames = run("cycle-detect", {
      directed: true,
      start: "A",
      nodes: nodes("A", "B", "C", "D", "E", "F", "G"),
      edges: edges("AB", "AD", "BC", "DC", "DE", "EF", "FG", "GE"),
    });
    expect(frames.filter((fr) => fr.tag === "black").map((fr) => fr.note.slice(0, 4))).toEqual(["D→C:"]);
    expect(frames.at(-1)!.state.vars.cycle).toBe("E → F → G → E");
  });

  it("reports only the cycle in a wait-for graph, not the threads blocked behind it", () => {
    const last = run("cycle-detect", {
      directed: true,
      nodes: nodes("T1", "T2", "T3", "T4"),
      edges: [{ from: "T4", to: "T1" }, { from: "T1", to: "T2" }, { from: "T2", to: "T3" }, { from: "T3", to: "T2" }],
    }).at(-1)!;
    expect(last.state.vars.cycle).toBe("T2 → T3 → T2");
    expect(last.state.nodeTones.T1).toBe("active");
  });

  it("runs Floyd's tortoise and hare on nums = [1, 3, 4, 2, 2] when method is floyd", () => {
    const frames = run("cycle-detect", {
      method: "floyd",
      directed: true,
      start: "0",
      nodes: nodes("0", "1", "3", "2", "4"),
      edges: edges("01", "13", "32", "24", "42"),
    });
    const phase1 = frames.filter((fr) => fr.state.vars.iteration !== undefined).map((fr) => `${fr.state.vars.slow}${fr.state.vars.fast}`);
    expect(phase1).toEqual(["00", "13", "34", "24", "44"]);
    const phase2 = frames.filter((fr) => fr.state.vars.phase === 2).map((fr) => `${fr.state.vars.p}${fr.state.vars.slow}`);
    expect(phase2).toEqual(["04", "12", "34", "22"]);
    expect(frames.at(-1)!.state.vars.entry).toBe("2");
  });
});

describe("dijkstra", () => {
  it("pops stale heap entries visibly instead of dropping them silently", () => {
    const frames = run("dijkstra", {
      directed: true,
      start: "A",
      nodes: nodes("A", "B", "C", "D", "E"),
      edges: [{ from: "A", to: "B", w: 4 }, { from: "A", to: "C", w: 1 }, { from: "C", to: "B", w: 2 }, { from: "B", to: "D", w: 1 }, { from: "C", to: "D", w: 5 }, { from: "D", to: "E", w: 3 }],
    });
    // Every heap entry that leaves between two frames is either the settled node or listed as discarded.
    let heap: string[] = [];
    for (const fr of frames) {
      const next = (fr.state.vars.heap as string[] | undefined) ?? null;
      if (!next) continue;
      if (fr.tag === "settle") {
        const gone = heap.filter((e) => !next.includes(e));
        const settled = `${fr.state.vars.settled}:${fr.state.vars.dist}`;
        expect(gone.sort()).toEqual([settled, ...((fr.state.vars.discarded as string[]) ?? [])].filter((e) => heap.includes(e)).sort());
      }
      heap = next;
    }
    expect(frames.find((fr) => fr.state.vars.discarded)?.state.vars.discarded).toEqual(["B:4"]);
  });

  it("highlights the shortest-path tree edge even when the input lists it the other way round", () => {
    const last = run("dijkstra", { directed: false, start: "A", nodes: nodes("A", "B"), edges: [{ from: "B", to: "A", w: 1 }] }).at(-1)!;
    expect(last.state.edgeTones["B->A"]).toBe("path");
  });
});

describe("bellman-ford", () => {
  it("shows the round it reports when it exits early", () => {
    const frames = run("bellman-ford", {
      directed: true,
      start: "A",
      nodes: nodes("A", "B", "C", "D", "E"),
      edges: [{ from: "A", to: "B", w: 6 }, { from: "A", to: "D", w: 7 }, { from: "B", to: "C", w: 5 }, { from: "B", to: "D", w: 8 }, { from: "B", to: "E", w: -4 }, { from: "C", to: "B", w: -2 }, { from: "D", to: "C", w: -3 }, { from: "D", to: "E", w: 9 }, { from: "E", to: "A", w: 2 }, { from: "E", to: "C", w: 7 }],
    });
    const stable = frames.find((fr) => fr.tag === "stable")!;
    expect(stable.note).toMatch(/^Round 4:/);
    expect(stable.state.vars.round).toBe(4);
  });
});

describe("union-find", () => {
  const input = { nodes: nodes("A", "B", "C", "D", "E", "F", "G"), edges: edges("AB", "CD", "BC", "EF", "AD", "FG") };

  it("labels are parent pointers: D keeps p=C until a find compresses it", () => {
    const frames = run("union-find", input);
    expect(frames[6]!.state.labels).toMatchObject({ B: "p=A", C: "p=A", D: "p=C" });
    expect(frames[8]!.state.labels.D).toBe("p=C");
    expect(frames[9]!.note).toMatch(/compression points D/);
    expect(frames[9]!.state.labels.D).toBe("p=A");
  });

  it("describes ties as 'pick either root and increment its rank', not 'shorter under taller'", () => {
    const unions = run("union-find", input).filter((fr) => fr.tag === "union");
    expect(unions.map((fr) => fr.note)).toEqual([
      "Ranks tie at 0: hang B under A and raise A's rank to 1.",
      "Ranks tie at 0: hang D under C and raise C's rank to 1.",
      "Ranks tie at 1: hang C under A and raise A's rank to 2.",
      "Ranks tie at 0: hang F under E and raise E's rank to 1.",
      "Rank 0 is less than rank 1: hang G under E. No rank changes.",
    ]);
    expect(unions[2]!.state.vars.rank).toEqual({ A: 2 });
  });
});

describe("a-star", () => {
  const lesson = graphFamily.examples["a-star"] as GraphInput;

  it("breaks f ties towards larger g, so F is popped before E", () => {
    const frames = run("a-star", lesson as unknown as Record<string, unknown>);
    const expanded = frames.filter((fr) => fr.tag === "expand").map((fr) => fr.state.vars.expand);
    expect(expanded).toEqual(["A", "B", "C", "D"]);
    const last = frames.at(-1)!;
    expect(last.state.vars).toMatchObject({ pathCost: 13, expanded: 4, neverExpanded: ["E"] });
  });

  it("does not claim pruning when every node was expanded", () => {
    const last = run("a-star", { start: "A", goal: "C", nodes: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 50, y: 0 }, { id: "C", x: 100, y: 0 }], edges: [{ from: "A", to: "B", w: 5 }, { from: "B", to: "C", w: 5 }] }).at(-1)!;
    expect(last.note).toMatch(/saved nothing/);
    expect(last.note).not.toMatch(/pruned/);
  });
});

describe("low-link frames", () => {
  it("tarjan-scc gives the back edge and the inherited low-link their own frames", () => {
    const frames = run("tarjan-scc", graphFamily.examples["tarjan-scc"] as unknown as Record<string, unknown>);
    const back = frames.find((fr) => fr.tag === "back edge")!;
    expect(back.note).toMatch(/^C→A/);
    expect(back.state.labels.C).toBe("2/0");
    const inherit = frames.find((fr) => fr.tag === "low")!;
    expect(inherit.state.labels.B).toBe("1/0");
    expect(frames[frames.indexOf(back) + 1]).toBe(inherit);
  });

  it("bridges gives the back edge its own frame before the parent inherits it", () => {
    const frames = run("bridges", { nodes: nodes("A", "B", "C", "D", "E"), edges: edges("AB", "BC", "CA", "BD", "DE") });
    const back = frames.find((fr) => fr.tag === "back edge")!;
    expect(back.note).toMatch(/^C—A/);
    expect(back.state.labels.C).toBe("2/0");
    expect(frames.filter((fr) => fr.tag === "bridge").map((fr) => fr.note.split(": ")[1])).toEqual(["D—E is a bridge.", "B—D is a bridge."]);
  });
});

describe("grid-islands", () => {
  const grid = [[1, 1, 0, 0], [1, 0, 0, 1], [0, 0, 1, 1]];

  it("method bfs runs the matrix-traversal lesson's BFS trace, marking on push", () => {
    const frames = run("grid-islands", { method: "bfs", grid });
    expect(frames.some((fr) => /DFS|flood fill/i.test(fr.note))).toBe(false);
    const trace = frames.filter((fr) => fr.tag === "new island" || fr.tag === "pop").map((fr) => `${fr.tag}:${(fr.state.vars.queue as string[]).join(" ")}`);
    expect(trace).toEqual([
      "new island:(0, 0)",
      "pop:(0, 1) (1, 0)",
      "pop:(1, 0)",
      "pop:",
      "new island:(1, 3)",
      "pop:(2, 3)",
      "pop:(2, 2)",
      "pop:",
    ]);
    expect(frames.at(-1)!.state.vars.islands).toBe(2);
  });

  it("defaults to the DFS flood fill", () => {
    expect(run("grid-islands", { grid })[0]!.note).toMatch(/DFS/);
  });
});
