// Graph algorithms on an explicit node/edge list (or a grid). Layout is
// precomputed once per input (circle layout unless x/y are given) so frames
// only carry tones and variables.
import { Arrow, Circle, Legend, Vars, type Tone } from "../primitives";
import { Frames, type Family, type RendererProps } from "../engine";

export interface GraphNodeIn {
  id: string;
  x?: number;
  y?: number;
}
export interface GraphEdgeIn {
  from: string;
  to: string;
  w?: number;
}
export interface GraphInput {
  nodes: GraphNodeIn[];
  edges: GraphEdgeIn[];
  directed?: boolean;
  start?: string;
  goal?: string;
  grid?: number[][];
  /** cycle-detect: "floyd" runs tortoise and hare on a functional graph. grid-islands: "bfs" fills each island by BFS (default DFS). */
  method?: string;
}

export interface GraphState {
  nodeTones: Record<string, Tone>;
  edgeTones: Record<string, Tone>;
  labels: Record<string, string>;
  vars: Record<string, unknown>;
  grid?: { cells: number[][]; tones: Record<string, Tone> };
}

const ek = (a: string, b: string) => `${a}->${b}`;

function adjacency(input: GraphInput): Map<string, { to: string; w: number; key: string }[]> {
  const adj = new Map<string, { to: string; w: number; key: string }[]>();
  for (const n of input.nodes) adj.set(n.id, []);
  for (const e of input.edges) {
    const w = e.w ?? 1;
    adj.get(e.from)?.push({ to: e.to, w, key: ek(e.from, e.to) });
    if (!input.directed) adj.get(e.to)?.push({ to: e.from, w, key: ek(e.from, e.to) });
  }
  return adj;
}

function make(input: GraphInput) {
  const s: GraphState = { nodeTones: {}, edgeTones: {}, labels: {}, vars: {} };
  const f = new Frames<GraphState>(() => ({ nodeTones: { ...s.nodeTones }, edgeTones: { ...s.edgeTones }, labels: { ...s.labels }, vars: { ...s.vars }, grid: s.grid ? { cells: s.grid.cells.map((r) => [...r]), tones: { ...s.grid.tones } } : undefined }));
  const adj = adjacency(input);
  const start = input.start ?? input.nodes[0]?.id ?? "";
  return { s, f, adj, start };
}

type G = (input: GraphInput) => ReturnType<Frames<GraphState>["done"]>;

const bfs: G = (input) => {
  const { s, f, adj, start } = make(input);
  const dist: Record<string, number> = { [start]: 0 };
  const queue = [start];
  s.nodeTones[start] = "frontier";
  s.labels[start] = "0";
  s.vars = { queue: [...queue] };
  f.push(`BFS from ${start}: a FIFO queue explores nodes in order of distance (number of edges).`);
  while (queue.length) {
    const u = queue.shift()!;
    s.nodeTones[u] = "active";
    s.vars = { queue: [...queue], visiting: u };
    f.push(`Dequeue ${u} (distance ${dist[u]}).`, "dequeue");
    for (const { to, key } of adj.get(u) ?? []) {
      if (dist[to] === undefined) {
        dist[to] = dist[u]! + 1;
        queue.push(to);
        s.nodeTones[to] = "frontier";
        s.edgeTones[key] = "path";
        s.labels[to] = String(dist[to]);
        s.vars = { queue: [...queue], visiting: u };
        f.push(`Discover ${to} via ${u}: distance ${dist[to]}, enqueue.`, "discover");
      }
    }
    s.nodeTones[u] = "visited";
  }
  s.vars = { distances: dist };
  f.push(`Every node is dequeued once and every edge examined once: O(V + E). Labels are shortest-path lengths.`, "done");
  return f.done();
};

// Recursive DFS with one clock for discovery and finish times (the clock is
// incremented before each stamp, so the first discovery is time 1, as in the
// lessons' tables). Directed graphs classify every non-tree edge by the colour
// of its target (grey: back, black: forward or cross). In an undirected graph
// the edge back to the parent is the tree edge seen from the other end, and an
// edge to a finished vertex was already classified from that vertex, so the
// only frames are tree edges and genuine back edges.
const dfs: G = (input) => {
  const { s, f, adj, start } = make(input);
  const directed = Boolean(input.directed);
  const sep = directed ? "→" : "—";
  let t = 0;
  const disc: Record<string, number> = {};
  const fin: Record<string, number> = {};
  const path: string[] = [];
  let backEdges = 0;
  const vars = (extra: Record<string, unknown> = {}) => ({ stack: [...path], time: t, ...extra });
  f.push(`DFS from ${start}: go deep before wide; the call stack holds only the current path and remembers where to return.`);
  const visit = (u: string, via: string | null) => {
    disc[u] = ++t;
    path.push(u);
    s.nodeTones[u] = "active";
    s.labels[u] = `${disc[u]}/`;
    s.vars = vars();
    f.push(`Enter ${u}: discovery time ${disc[u]}; the path is now ${path.join(", ")}.`, "enter");
    for (const { to, key } of adj.get(u) ?? []) {
      if (!directed && key === via) continue;
      const e = `${u}${sep}${to}`;
      if (disc[to] === undefined) {
        s.edgeTones[key] = "path";
        visit(to, key);
      } else if (fin[to] === undefined) {
        backEdges++;
        s.edgeTones[key] = "danger";
        s.vars = vars({ edge: `${e} back` });
        f.push(
          directed
            ? `${e}: ${to} is grey, still on the current path, so this is a back edge: a cycle.`
            : `${e}: ${to} is an ancestor still on the path and not ${u}'s parent, so this is a back edge: a cycle.`,
          "back edge",
        );
      } else if (directed) {
        const forward = disc[u]! < disc[to]!;
        s.edgeTones[key] = "muted";
        s.vars = vars({ edge: `${e} ${forward ? "forward" : "cross"}` });
        f.push(
          forward
            ? `${e}: ${to} is black and was discovered after ${u} (${disc[u]} < ${disc[to]}), a descendant already finished: a forward edge, not a cycle.`
            : `${e}: ${to} is black and was discovered before ${u} (${disc[to]} < ${disc[u]}), in a finished subtree: a cross edge, not a cycle.`,
          forward ? "forward" : "cross",
        );
      }
    }
    fin[u] = ++t;
    path.pop();
    s.labels[u] = `${disc[u]}/${fin[u]}`;
    s.nodeTones[u] = "visited";
    s.vars = vars();
    f.push(`Finish ${u}: every edge out of it is explored; finish time ${fin[u]}.`, "finish");
  };
  visit(start, null);
  for (const n of input.nodes) if (disc[n.id] === undefined) visit(n.id, null);
  s.vars = { time: t };
  const cycles = backEdges === 0 ? "No back edge, so the graph has no cycle." : `${backEdges} back edge${backEdges === 1 ? "" : "s"}, so the graph has a cycle.`;
  f.push(
    directed
      ? `Labels show discovery/finish times. ${cycles}${backEdges === 0 ? " Decreasing finish time is a topological order." : " Without cycles, decreasing finish time would be a topological order."}`
      : `Labels show discovery/finish times. Every edge was a tree edge or a back edge. ${cycles}`,
    "done",
  );
  return f.done();
};

const dijkstra: G = (input) => {
  const { s, f, adj, start } = make(input);
  const dist: Record<string, number> = {};
  const prev: Record<string, string> = {};
  const prevKey: Record<string, string> = {};
  for (const n of input.nodes) {
    dist[n.id] = Infinity;
    s.labels[n.id] = "∞";
  }
  dist[start] = 0;
  s.labels[start] = "0";
  const done = new Set<string>();
  const pq: [number, string][] = [[0, start]];
  s.nodeTones[start] = "frontier";
  f.push(`Dijkstra from ${start}: always settle the closest unsettled node; its distance can never improve (non-negative weights).`);
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    // Lazy deletion: an entry for a node that is already settled is stale
    // (a better entry was pushed later and popped first). Pop and discard it,
    // and say so in the next settle frame so the heap never shrinks silently.
    const stale: string[] = [];
    while (pq.length && done.has(pq[0]![1])) {
      const [dd, n] = pq.shift()!;
      stale.push(`${n}:${dd}`);
    }
    if (!pq.length) break;
    const [d, u] = pq.shift()!;
    done.add(u);
    s.nodeTones[u] = "active";
    s.vars = { settled: u, dist: d, heap: pq.map(([dd, n]) => `${n}:${dd}`), ...(stale.length ? { discarded: stale } : {}) };
    const skipped = stale.length ? `Pop and discard the stale ${stale.length === 1 ? "entry" : "entries"} ${stale.join(", ")} (already settled). ` : "";
    f.push(`${skipped}Pop ${u} with distance ${d}: settle it.`, "settle");
    for (const { to, w, key } of adj.get(u) ?? []) {
      if (done.has(to)) continue;
      const nd = d + w;
      if (nd < dist[to]!) {
        const old = dist[to];
        dist[to] = nd;
        prev[to] = u;
        prevKey[to] = key;
        pq.push([nd, to]);
        s.labels[to] = String(nd);
        s.nodeTones[to] = "frontier";
        s.edgeTones[key] = "compare";
        s.vars = { settled: u, relax: `${u}→${to}`, heap: pq.map(([dd, n]) => `${n}:${dd}`) };
        f.push(`Relax ${u}→${to} (w=${w}): ${old === Infinity ? "∞" : old} → ${nd}.`, "relax");
      }
    }
    s.nodeTones[u] = "visited";
  }
  for (const k of Object.values(prevKey)) s.edgeTones[k] = "path";
  for (const k of Object.keys(s.edgeTones)) if (s.edgeTones[k] === "compare") s.edgeTones[k] = "muted";
  if (input.goal && prev[input.goal] !== undefined) {
    let v = input.goal;
    while (v) {
      s.nodeTones[v] = "done";
      v = prev[v]!;
    }
  }
  s.vars = { distances: dist };
  f.push(`Shortest-path tree highlighted. With a binary heap: O((V + E) log V).`, "done");
  return f.done();
};

const bellmanFord: G = (input) => {
  const { s, f, start } = make(input);
  const dist: Record<string, number> = {};
  for (const n of input.nodes) {
    dist[n.id] = Infinity;
    s.labels[n.id] = "∞";
  }
  dist[start] = 0;
  s.labels[start] = "0";
  const edges = input.directed ? input.edges : input.edges.flatMap((e) => [e, { from: e.to, to: e.from, w: e.w }]);
  const V = input.nodes.length;
  f.push(`Bellman-Ford: relax every edge V−1 = ${V - 1} times. Works with negative weights; detects negative cycles.`);
  for (let round = 1; round < V; round++) {
    let changed = false;
    for (const e of edges) {
      const w = e.w ?? 1;
      if (dist[e.from]! + w < dist[e.to]!) {
        dist[e.to] = dist[e.from]! + w;
        s.labels[e.to] = String(dist[e.to]);
        changed = true;
        s.edgeTones[ek(e.from, e.to)] = "compare";
        s.nodeTones[e.to] = "frontier";
        s.vars = { round, relaxed: `${e.from}→${e.to}` };
        f.push(`Round ${round}: relax ${e.from}→${e.to} (w=${w}) → ${dist[e.to]}.`, "relax");
        if (f.full) return f.done();
      }
    }
    if (!changed) {
      s.vars = { round, relaxed: "none" };
      f.push(`Round ${round}: nothing changed, so distances are final. Early exit.`, "stable");
      break;
    }
  }
  for (const e of edges) {
    if (dist[e.from]! + (e.w ?? 1) < dist[e.to]!) {
      s.edgeTones[ek(e.from, e.to)] = "danger";
      f.push(`Edge ${e.from}→${e.to} can still relax after V−1 rounds: a negative cycle is reachable.`, "negative cycle");
      return f.done();
    }
  }
  for (const k of Object.keys(s.edgeTones)) s.edgeTones[k] = "muted";
  for (const n of input.nodes) if (dist[n.id] !== Infinity) s.nodeTones[n.id] = "visited";
  s.vars = { distances: dist };
  f.push(`No negative cycle. Complexity O(V·E).`, "done");
  return f.done();
};

const topoKahn: G = (input) => {
  const { s, f, adj } = make({ ...input, directed: true });
  const indeg: Record<string, number> = {};
  for (const n of input.nodes) indeg[n.id] = 0;
  for (const e of input.edges) indeg[e.to] = (indeg[e.to] ?? 0) + 1;
  for (const n of input.nodes) s.labels[n.id] = `in:${indeg[n.id]}`;
  const queue = input.nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id);
  for (const q of queue) s.nodeTones[q] = "frontier";
  const order: string[] = [];
  s.vars = { queue: [...queue], order: [] };
  f.push(`Kahn's algorithm: repeatedly remove a node with in-degree 0. Nodes with no prerequisites start in the queue.`);
  while (queue.length) {
    const u = queue.shift()!;
    order.push(u);
    s.nodeTones[u] = "done";
    s.labels[u] = `#${order.length}`;
    s.vars = { queue: [...queue], order: [...order] };
    f.push(`Take ${u} (in-degree 0) as position ${order.length}.`, "take");
    for (const { to, key } of adj.get(u) ?? []) {
      indeg[to]!--;
      s.edgeTones[key] = "muted";
      s.labels[to] = `in:${indeg[to]}`;
      if (indeg[to] === 0) {
        queue.push(to);
        s.nodeTones[to] = "frontier";
        s.vars = { queue: [...queue], order: [...order] };
        f.push(`Removing ${u} drops ${to}'s in-degree to 0: enqueue.`, "unlock");
      }
    }
  }
  if (order.length < input.nodes.length) {
    for (const n of input.nodes) if (!order.includes(n.id)) s.nodeTones[n.id] = "danger";
    f.push(`Only ${order.length}/${input.nodes.length} nodes were ordered: the remaining nodes form a cycle.`, "cycle");
  } else f.push(`Topological order: ${order.join(" → ")}. O(V + E).`, "done");
  return f.done();
};

const topoDfs: G = (input) => {
  const { s, f, adj } = make({ ...input, directed: true });
  const state: Record<string, 0 | 1 | 2> = {};
  const out: string[] = [];
  f.push(`DFS topological sort: a node is appended after all its descendants finish; reverse the finish order.`);
  const visit = (u: string): boolean => {
    state[u] = 1;
    s.nodeTones[u] = "active";
    f.push(`Enter ${u}.`, "enter");
    for (const { to, key } of adj.get(u) ?? []) {
      if (state[to] === 1) {
        s.edgeTones[key] = "danger";
        f.push(`${u}→${to} hits a node on the stack: cycle, no topological order exists.`, "cycle");
        return false;
      }
      if (!state[to]) {
        s.edgeTones[key] = "path";
        if (!visit(to)) return false;
      }
    }
    state[u] = 2;
    out.push(u);
    s.nodeTones[u] = "done";
    s.labels[u] = `#${input.nodes.length - out.length + 1}`;
    s.vars = { finishOrder: [...out] };
    f.push(`Finish ${u}: it goes before everything already finished.`, "finish");
    return true;
  };
  for (const n of input.nodes) if (!state[n.id] && !visit(n.id)) return f.done();
  f.push(`Reverse finish order: ${[...out].reverse().join(" → ")}.`, "done");
  return f.done();
};

const dagBuild: G = (input) => {
  const { s, f } = make({ ...input, directed: true });
  const present = new Set<string>();
  const shown = new Set<string>();
  for (const n of input.nodes) s.nodeTones[n.id] = "muted";
  f.push(`Build the DAG one dependency at a time and check that each edge keeps it acyclic.`);
  const reaches = (from: string, to: string): boolean => {
    const stack = [from];
    const seen = new Set<string>();
    while (stack.length) {
      const u = stack.pop()!;
      if (u === to) return true;
      if (seen.has(u)) continue;
      seen.add(u);
      for (const e of input.edges) if (shown.has(ek(e.from, e.to)) && e.from === u) stack.push(e.to);
    }
    return false;
  };
  for (const e of input.edges) {
    for (const id of [e.from, e.to]) {
      if (!present.has(id)) {
        present.add(id);
        s.nodeTones[id] = "frontier";
        f.push(`Add node ${id}.`, "add node");
      }
    }
    const key = ek(e.from, e.to);
    if (reaches(e.to, e.from)) {
      s.edgeTones[key] = "danger";
      f.push(`Adding ${e.from}→${e.to} would create a cycle because ${e.to} already reaches ${e.from}. Rejected.`, "cycle");
      continue;
    }
    shown.add(key);
    s.edgeTones[key] = "path";
    s.nodeTones[e.from] = "visited";
    s.nodeTones[e.to] = "visited";
    f.push(`Add edge ${e.from}→${e.to}: ${e.to} depends on ${e.from}.`, "add edge");
  }
  f.push(`The DAG is complete. A topological order now gives a valid build/execution schedule.`, "done");
  return f.done();
};

const components: G = (input) => {
  const { s, f, adj } = make({ ...input, directed: false });
  const comp: Record<string, number> = {};
  let c = 0;
  const tones: Tone[] = ["path", "done", "compare", "danger", "frontier"];
  f.push(`Connected components: run a traversal from every unvisited node; each run finds one component.`);
  for (const n of input.nodes) {
    if (comp[n.id] !== undefined) continue;
    c++;
    const stack = [n.id];
    f.push(`Start component ${c} from ${n.id}.`, "new component");
    while (stack.length) {
      const u = stack.pop()!;
      if (comp[u] !== undefined) continue;
      comp[u] = c;
      s.nodeTones[u] = tones[(c - 1) % tones.length]!;
      s.labels[u] = `C${c}`;
      for (const { to, key } of adj.get(u) ?? []) {
        if (comp[to] === undefined) stack.push(to);
        s.edgeTones[key] = tones[(c - 1) % tones.length]!;
      }
      f.push(`${u} joins component ${c}.`, "visit");
    }
  }
  s.vars = { components: c };
  f.push(`${c} component(s). O(V + E).`, "done");
  return f.done();
};

const cycleDetect: G = (input) => (input.method === "floyd" ? floydCycle(input) : input.directed ? directedCycle(input) : undirectedCycle(input));

// Three-colour check (white: undiscovered, grey: on the current DFS path,
// black: finished). Stops at the first edge into a grey vertex and reports the
// cycle as the path segment from that vertex plus the closing edge.
const directedCycle: G = (input) => {
  const { s, f, adj } = make({ ...input, directed: true });
  const colour: Record<string, "grey" | "black"> = {};
  const path: string[] = [];
  const vars = (extra: Record<string, unknown> = {}) => ({ path: [...path], ...extra });
  f.push(`Three-colour cycle check: white is undiscovered, grey is on the current DFS path, black is finished. An edge into a grey vertex closes a cycle; an edge into a black vertex cannot.`);
  const visit = (u: string): boolean => {
    colour[u] = "grey";
    path.push(u);
    s.nodeTones[u] = "active";
    s.labels[u] = "grey";
    s.vars = vars();
    f.push(`Enter ${u}: colour it grey. The current path is ${path.join(" → ")}.`, "enter");
    for (const { to, key } of adj.get(u) ?? []) {
      if (colour[to] === "grey") {
        const cyc = path.slice(path.indexOf(to));
        for (let i = 0; i < cyc.length; i++) {
          s.edgeTones[ek(cyc[i]!, cyc[(i + 1) % cyc.length]!)] = "danger";
          s.nodeTones[cyc[i]!] = "danger";
        }
        s.vars = vars({ cycle: [...cyc, to].join(" → ") });
        f.push(`${u}→${to}: ${to} is grey, still on the path, so this is a back edge. Cycle: ${[...cyc, to].join(" → ")}. Stop.`, "cycle");
        return true;
      }
      if (colour[to] === "black") {
        s.edgeTones[key] = "muted";
        s.vars = vars({ checked: `${u}→${to}` });
        f.push(`${u}→${to}: ${to} is black, already finished and not on the path. Visited, but not a cycle.`, "black");
        continue;
      }
      s.edgeTones[key] = "path";
      if (visit(to)) return true;
    }
    colour[u] = "black";
    path.pop();
    s.nodeTones[u] = "visited";
    s.labels[u] = "black";
    s.vars = vars();
    f.push(`Every edge out of ${u} is explored: colour it black.`, "finish");
    return false;
  };
  const order = input.start ? [input.start, ...input.nodes.map((n) => n.id).filter((id) => id !== input.start)] : input.nodes.map((n) => n.id);
  for (const id of order) if (!colour[id] && visit(id)) return f.done();
  s.vars = {};
  f.push(`No edge ever reached a grey vertex: the graph has no cycle. O(V + E).`, "done");
  return f.done();
};

// Floyd's tortoise and hare on a functional graph (every node has exactly one
// outgoing edge, such as i → nums[i]). Phase 1: slow moves one step, fast two,
// until they meet. Phase 2: a pointer from the start and slow from the meeting
// point move one step each; they meet at the cycle's entry.
const floydCycle: G = (input) => {
  const { s, f } = make({ ...input, directed: true });
  const next: Record<string, string> = {};
  for (const e of input.edges) if (next[e.from] === undefined) next[e.from] = e.to;
  const start = input.start ?? input.nodes[0]?.id ?? "";
  const show = (marks: Record<string, string>) => {
    s.labels = {};
    s.nodeTones = {};
    for (const [name, at] of Object.entries(marks)) {
      s.labels[at] = s.labels[at] ? `${s.labels[at]} ${name}` : name;
      s.nodeTones[at] = s.nodeTones[at] ? "done" : name === "slow" ? "active" : "frontier";
    }
  };
  let slow = start;
  let fast = start;
  show({ slow, fast });
  s.vars = { iteration: 0, slow, fast };
  f.push(`Floyd's tortoise and hare: every node has exactly one outgoing edge. slow and fast both start at ${start}; each iteration slow takes one step and fast takes two.`);
  let it = 0;
  for (;;) {
    if (next[fast] === undefined || next[next[fast]!] === undefined) {
      s.vars = { iteration: it, slow, fast };
      f.push(`fast ran off the end at ${fast}: there is no cycle.`, "done");
      return f.done();
    }
    it++;
    slow = next[slow]!;
    fast = next[next[fast]!]!;
    show({ slow, fast });
    s.vars = { iteration: it, slow, fast };
    if (slow === fast) {
      f.push(`Iteration ${it}: slow moves to ${slow}, fast moves two steps to ${fast}. They meet at ${slow}, so there is a cycle.`, "meet");
      break;
    }
    f.push(`Iteration ${it}: slow moves to ${slow}, fast moves two steps to ${fast}.`, "step");
    if (f.full) return f.done();
  }
  const meet = slow;
  let p = start;
  let step = 0;
  show({ p, slow });
  s.vars = { phase: 2, step, p, slow };
  f.push(`Phase 2: p starts again at ${start} while slow stays at the meeting point ${meet}. Both now move one step at a time.`, "phase 2");
  while (p !== slow) {
    step++;
    p = next[p]!;
    slow = next[slow]!;
    show({ p, slow });
    s.vars = { phase: 2, step, p, slow };
    f.push(p === slow ? `Step ${step}: p moves to ${p} and slow moves to ${slow}. They meet at ${p}: the entry of the cycle.` : `Step ${step}: p moves to ${p} and slow moves to ${slow}.`, p === slow ? "entry" : "step");
    if (f.full) return f.done();
  }
  const entry = p;
  const cyc = [entry];
  for (let v = next[entry]!; v !== entry; v = next[v]!) cyc.push(v);
  s.labels = {};
  s.nodeTones = { [entry]: "danger" };
  for (const v of cyc) if (v !== entry) s.nodeTones[v] = "visited";
  for (const e of input.edges) if (e.to === entry) s.edgeTones[ek(e.from, e.to)] = "danger";
  s.labels[entry] = "entry";
  const into = input.edges.filter((e) => e.to === entry).map((e) => e.from);
  s.vars = { cycle: [...cyc, entry].join(" → "), entry };
  const why = entry === start ? `${entry} is where the walk started, so there is no tail` : `${entry} has two incoming edges, from ${into.join(" and ")}: one from the tail and one closing the cycle`;
  f.push(`The cycle is ${[...cyc, entry].join(" → ")}. Its entry ${why}. O(n) time, O(1) extra space.`, "done");
  return f.done();
};

const undirectedCycle: G = (input) => {
  const { s, f, adj } = make(input);
  const parent: Record<string, string | null> = {};
  f.push(`Undirected cycle detection: DFS; an edge to a visited node that is not the parent closes a cycle.`);
  const visit = (u: string, p: string | null): boolean => {
    parent[u] = p;
    s.nodeTones[u] = "active";
    f.push(`Visit ${u}.`, "visit");
    for (const { to, key } of adj.get(u) ?? []) {
      if (parent[to] === undefined) {
        s.edgeTones[key] = "path";
        if (visit(to, u)) return true;
      } else if (to !== p) {
        s.edgeTones[key] = "danger";
        f.push(`${u}—${to}: ${to} was already visited and is not the parent → cycle.`, "cycle");
        return true;
      }
    }
    s.nodeTones[u] = "visited";
    return false;
  };
  for (const n of input.nodes) if (parent[n.id] === undefined && visit(n.id, null)) return f.done();
  f.push(`No cycle: the graph is a forest.`, "done");
  return f.done();
};

const bipartite: G = (input) => {
  const { s, f, adj } = make({ ...input, directed: false });
  const color: Record<string, 0 | 1> = {};
  f.push(`2-colouring by BFS: neighbours must get the opposite colour. A conflict means an odd cycle.`);
  for (const n of input.nodes) {
    if (color[n.id] !== undefined) continue;
    color[n.id] = 0;
    s.nodeTones[n.id] = "path";
    const queue = [n.id];
    while (queue.length) {
      const u = queue.shift()!;
      for (const { to, key } of adj.get(u) ?? []) {
        if (color[to] === undefined) {
          color[to] = color[u] === 0 ? 1 : 0;
          s.nodeTones[to] = color[to] === 0 ? "path" : "compare";
          queue.push(to);
          f.push(`Colour ${to} opposite to ${u}.`, "colour");
        } else if (color[to] === color[u]) {
          s.edgeTones[key] = "danger";
          f.push(`${u} and ${to} share a colour: not bipartite (odd cycle).`, "conflict");
          return f.done();
        }
      }
    }
  }
  f.push(`Every edge joins different colours: the graph is bipartite.`, "done");
  return f.done();
};

const prim: G = (input) => {
  const { s, f, adj, start } = make({ ...input, directed: false });
  const inTree = new Set<string>([start]);
  s.nodeTones[start] = "done";
  let total = 0;
  f.push(`Prim: grow one tree from ${start}; always add the cheapest edge leaving the tree (cut property).`);
  while (inTree.size < input.nodes.length) {
    let best: { u: string; to: string; w: number; key: string } | null = null;
    for (const u of inTree) for (const e of adj.get(u) ?? []) if (!inTree.has(e.to) && (!best || e.w < best.w)) best = { u, ...e };
    if (!best) break;
    for (const u of inTree) for (const e of adj.get(u) ?? []) if (!inTree.has(e.to) && s.edgeTones[e.key] !== "path") s.edgeTones[e.key] = "compare";
    f.push(`Candidate edges leaving the tree are highlighted; cheapest is ${best.u}—${best.to} (w=${best.w}).`, "choose");
    for (const k of Object.keys(s.edgeTones)) if (s.edgeTones[k] === "compare") s.edgeTones[k] = "muted";
    inTree.add(best.to);
    total += best.w;
    s.edgeTones[best.key] = "path";
    s.nodeTones[best.to] = "done";
    s.vars = { treeWeight: total };
    f.push(`Add ${best.to}; tree weight ${total}.`, "add");
  }
  f.push(`Minimum spanning tree weight ${total}. With a heap: O(E log V).`, "done");
  return f.done();
};

const kruskal: G = (input) => {
  const { s, f } = make({ ...input, directed: false });
  const parent: Record<string, string> = {};
  for (const n of input.nodes) parent[n.id] = n.id;
  const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
  const edges = [...input.edges].sort((a, b) => (a.w ?? 1) - (b.w ?? 1));
  let total = 0;
  let count = 0;
  f.push(`Kruskal: sort edges by weight; add an edge if it joins two different components (union-find).`);
  for (const e of edges) {
    const key = ek(e.from, e.to);
    const a = find(e.from);
    const b = find(e.to);
    s.edgeTones[key] = "compare";
    f.push(`Consider ${e.from}—${e.to} (w=${e.w ?? 1}).`, "consider");
    if (a === b) {
      s.edgeTones[key] = "danger";
      f.push(`Both ends already connected: would form a cycle, skip.`, "skip");
      s.edgeTones[key] = "muted";
      continue;
    }
    parent[a] = b;
    total += e.w ?? 1;
    count++;
    s.edgeTones[key] = "path";
    s.nodeTones[e.from] = "done";
    s.nodeTones[e.to] = "done";
    s.vars = { treeWeight: total, edges: count };
    f.push(`Union: add the edge; tree weight ${total}.`, "union");
    if (count === input.nodes.length - 1) break;
  }
  f.push(`MST weight ${total}. Sorting dominates: O(E log E).`, "done");
  return f.done();
};

// Union by rank with path compression, as in the lessons: find both roots;
// if the ranks differ, hang the lower-rank root under the higher; on a tie,
// hang the second root under the first and increment the first's rank. Labels
// are parent pointers and change only when a pointer is actually written (by a
// union or by a find's path compression); colouring uses a read-only root walk
// so it never compresses behind the learner's back.
const unionFind: G = (input) => {
  const { s, f } = make({ ...input, directed: false });
  const parent: Record<string, string> = {};
  const rank: Record<string, number> = {};
  for (const n of input.nodes) {
    parent[n.id] = n.id;
    rank[n.id] = 0;
    s.labels[n.id] = `p=${n.id}`;
  }
  const rootOf = (x: string): string => {
    let r = x;
    while (parent[r] !== r) r = parent[r]!;
    return r;
  };
  const compressed: string[] = [];
  const find = (x: string): string => {
    const r = rootOf(x);
    for (let y = x; parent[y] !== r && y !== r; ) {
      const next = parent[y]!;
      parent[y] = r;
      s.labels[y] = `p=${r}`;
      compressed.push(y);
      y = next;
    }
    return r;
  };
  const ranks = () => Object.fromEntries(input.nodes.filter((n) => parent[n.id] === n.id && rank[n.id]! > 0).map((n) => [n.id, rank[n.id]!]));
  s.vars = { rank: ranks() };
  f.push(`Union-find: each node starts as its own root (p is its parent pointer, rank 0). Each edge is a union: find both roots, then link them by rank.`);
  for (const e of input.edges) {
    const key = ek(e.from, e.to);
    compressed.length = 0;
    const a = find(e.from);
    const b = find(e.to);
    s.edgeTones[key] = "compare";
    s.vars = { union: `${e.from}, ${e.to}`, roots: `${a}, ${b}`, rank: ranks() };
    const comp = compressed.length ? ` Path compression points ${compressed.join(" and ")} straight at the root.` : "";
    f.push(`union(${e.from}, ${e.to}): find gives roots ${a} and ${b}.${comp}`, "find");
    if (a === b) {
      s.edgeTones[key] = "danger";
      f.push(`Same root: ${e.from} and ${e.to} are already connected, so this edge would close a cycle. union returns false.`, "same set");
      continue;
    }
    let note: string;
    if (rank[a]! < rank[b]!) {
      parent[a] = b;
      s.labels[a] = `p=${b}`;
      note = `Rank ${rank[a]} is less than rank ${rank[b]}: hang ${a} under ${b}. No rank changes.`;
    } else if (rank[a]! > rank[b]!) {
      parent[b] = a;
      s.labels[b] = `p=${a}`;
      note = `Rank ${rank[b]} is less than rank ${rank[a]}: hang ${b} under ${a}. No rank changes.`;
    } else {
      parent[b] = a;
      s.labels[b] = `p=${a}`;
      rank[a]!++;
      note = `Ranks tie at ${rank[a]! - 1}: hang ${b} under ${a} and raise ${a}'s rank to ${rank[a]}.`;
    }
    s.edgeTones[key] = "path";
    const root = rootOf(e.from);
    for (const n of input.nodes) if (rootOf(n.id) === root) s.nodeTones[n.id] = "done";
    s.vars = { union: `${e.from}, ${e.to}`, root, rank: ranks() };
    f.push(note, "union");
  }
  f.push(`With path compression + union by rank, each operation is amortised α(n) ≈ constant.`, "done");
  return f.done();
};

const floydWarshall: G = (input) => {
  const { s, f } = make(input);
  const ids = input.nodes.map((n) => n.id);
  const d: Record<string, Record<string, number>> = {};
  for (const a of ids) {
    d[a] = {};
    for (const b of ids) d[a]![b] = a === b ? 0 : Infinity;
  }
  for (const e of input.edges) {
    d[e.from]![e.to] = Math.min(d[e.from]![e.to]!, e.w ?? 1);
    if (!input.directed) d[e.to]![e.from] = Math.min(d[e.to]![e.from]!, e.w ?? 1);
  }
  const show = () => Object.fromEntries(ids.map((a) => [a, ids.map((b) => (d[a]![b] === Infinity ? "∞" : d[a]![b])).join(" ")]));
  s.vars = { matrix: show() };
  f.push(`Floyd–Warshall: for each intermediate node k, allow paths through k. dist[i][j] = min(dist[i][j], dist[i][k] + dist[k][j]).`);
  for (const k of ids) {
    for (const n of ids) s.nodeTones[n] = undefined as unknown as Tone;
    s.nodeTones[k] = "active";
    let improved = 0;
    for (const i of ids) for (const j of ids) if (d[i]![k]! + d[k]![j]! < d[i]![j]!) {
      d[i]![j] = d[i]![k]! + d[k]![j]!;
      improved++;
    }
    s.vars = { k, improved, matrix: show() };
    f.push(`k = ${k}: ${improved} pair(s) improved by routing through ${k}.`, "relax");
  }
  f.push(`All-pairs shortest paths in O(V³) with O(V²) memory.`, "done");
  return f.done();
};

const tarjanScc: G = (input) => {
  const { s, f, adj } = make({ ...input, directed: true });
  let index = 0;
  const idx: Record<string, number> = {};
  const low: Record<string, number> = {};
  const onStack = new Set<string>();
  const stack: string[] = [];
  let comps = 0;
  const tones: Tone[] = ["path", "done", "compare", "frontier", "danger"];
  f.push(`Tarjan's SCC: DFS tracking low-link = smallest index reachable; a node whose low-link equals its index roots a component.`);
  const strong = (u: string) => {
    idx[u] = low[u] = index++;
    stack.push(u);
    onStack.add(u);
    s.nodeTones[u] = "active";
    s.labels[u] = `${idx[u]}/${low[u]}`;
    s.vars = { stack: [...stack] };
    f.push(`Visit ${u}: index ${idx[u]}, low ${low[u]}.`, "visit");
    for (const { to, key } of adj.get(u) ?? []) {
      if (idx[to] === undefined) {
        s.edgeTones[key] = "path";
        strong(to);
        const before: number = low[u]!;
        low[u] = Math.min(before, low[to]!);
        s.labels[u] = `${idx[u]}/${low[u]}`;
        if (low[u] !== before) {
          s.nodeTones[u] = "active";
          s.vars = { stack: [...stack] };
          f.push(`Back in ${u}: ${to}'s subtree reaches index ${low[to]}, so low(${u}) = min(${before}, ${low[to]}) = ${low[u]}.`, "low");
        }
      } else if (onStack.has(to)) {
        const before: number = low[u]!;
        low[u] = Math.min(before, idx[to]!);
        s.edgeTones[key] = "compare";
        s.labels[u] = `${idx[u]}/${low[u]}`;
        s.vars = { stack: [...stack] };
        f.push(`${u}→${to}: ${to} is still on the stack, so low(${u}) = min(${before}, index(${to}) = ${idx[to]}) = ${low[u]}.`, "back edge");
      }
    }
    if (low[u] === idx[u]) {
      comps++;
      const members: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        members.push(w);
        s.nodeTones[w] = tones[(comps - 1) % tones.length]!;
      } while (w !== u);
      s.vars = { stack: [...stack], component: members };
      f.push(`low(${u}) = index(${u}): pop {${members.join(", ")}} as SCC ${comps}.`, "scc");
    }
  };
  for (const n of input.nodes) if (idx[n.id] === undefined) strong(n.id);
  f.push(`${comps} strongly connected component(s) in one DFS: O(V + E).`, "done");
  return f.done();
};

const bridges: G = (input) => {
  const { s, f, adj } = make({ ...input, directed: false });
  let t = 0;
  const disc: Record<string, number> = {};
  const low: Record<string, number> = {};
  const found: string[] = [];
  f.push(`Bridges: DFS with low-link. Edge u—v is a bridge if v's subtree cannot reach u or above (low[v] > disc[u]).`);
  const visit = (u: string, p: string | null) => {
    disc[u] = low[u] = t++;
    s.nodeTones[u] = "active";
    s.labels[u] = `${disc[u]}/${low[u]}`;
    f.push(`Visit ${u}.`, "visit");
    for (const { to, key } of adj.get(u) ?? []) {
      if (to === p) continue;
      if (disc[to] === undefined) {
        s.edgeTones[key] = "path";
        visit(to, u);
        const before: number = low[u]!;
        low[u] = Math.min(before, low[to]!);
        s.labels[u] = `${disc[u]}/${low[u]}`;
        if (low[to]! > disc[u]!) {
          s.edgeTones[key] = "danger";
          found.push(`${u}—${to}`);
          s.vars = { bridges: [...found] };
          f.push(`low(${to}) = ${low[to]} > disc(${u}) = ${disc[u]}: ${u}—${to} is a bridge.`, "bridge");
        } else if (low[u] !== before) {
          s.vars = { bridges: [...found] };
          f.push(`Back in ${u}: ${to}'s subtree reaches discovery time ${low[to]}, so low(${u}) = min(${before}, ${low[to]}) = ${low[u]}, and ${u}—${to} is not a bridge.`, "low");
        }
      } else if (disc[to]! < disc[u]!) {
        // A back edge to an ancestor. (Seen from the ancestor's side, the same
        // edge leads to an already-visited descendant and changes nothing.)
        const before: number = low[u]!;
        low[u] = Math.min(before, disc[to]!);
        s.labels[u] = `${disc[u]}/${low[u]}`;
        s.edgeTones[key] = "compare";
        s.vars = { bridges: [...found] };
        f.push(`${u}—${to} is a back edge to an ancestor: low(${u}) = min(${before}, disc(${to}) = ${disc[to]}) = ${low[u]}.`, "back edge");
      }
    }
    s.nodeTones[u] = "visited";
  };
  for (const n of input.nodes) if (disc[n.id] === undefined) visit(n.id, null);
  s.vars = { bridges: found };
  f.push(`${found.length} bridge(s). Removing any one disconnects the graph.`, "done");
  return f.done();
};

const aStar: G = (input) => {
  const goal = input.goal ?? input.nodes[input.nodes.length - 1]?.id ?? "";
  const pos = Object.fromEntries(input.nodes.map((n, i) => [n.id, [n.x ?? (i * 17) % 100, n.y ?? (i * 31) % 100]]));
  const h = (a: string) => {
    const [ax, ay] = pos[a] ?? [0, 0];
    const [gx, gy] = pos[goal] ?? [0, 0];
    return Math.round(Math.hypot((ax ?? 0) - (gx ?? 0), (ay ?? 0) - (gy ?? 0)) / 10);
  };
  const { s, f, adj, start } = make(input);
  const g: Record<string, number> = { [start]: 0 };
  const prev: Record<string, string> = {};
  const open: string[] = [start];
  const closed = new Set<string>();
  for (const n of input.nodes) s.labels[n.id] = `h=${h(n.id)}`;
  s.nodeTones[goal] = "danger";
  f.push(`A* from ${start} to ${goal}: like Dijkstra but ordered by f = g + h, where h is an admissible estimate (here scaled straight-line distance).`);
  while (open.length) {
    // Order by f = g + h; break ties towards larger g (deeper along a path),
    // as the lesson recommends. sort is stable, so remaining ties keep push order.
    open.sort((a, b) => g[a]! + h(a) - (g[b]! + h(b)) || g[b]! - g[a]!);
    const u = open.shift()!;
    if (u === goal) {
      let v = goal;
      while (prev[v]) {
        s.edgeTones[ek(prev[v]!, v)] = "path";
        s.nodeTones[v] = "done";
        v = prev[v]!;
      }
      s.nodeTones[start] = "done";
      const skipped = input.nodes.map((n) => n.id).filter((id) => id !== goal && !closed.has(id));
      s.vars = { pathCost: g[goal], expanded: closed.size, ...(skipped.length ? { neverExpanded: skipped } : {}) };
      const rest = skipped.length
        ? `${skipped.join(", ")} ${skipped.length === 1 ? "was" : "were"} never expanded: f told A* ${skipped.length === 1 ? "it" : "they"} could not beat the goal.`
        : `every other node was expanded, so on this graph the heuristic saved nothing.`;
      f.push(`Goal popped with cost ${g[goal]} after expanding ${closed.size} node(s); ${rest}`, "done");
      return f.done();
    }
    closed.add(u);
    s.nodeTones[u] = "active";
    s.vars = { expand: u, f: g[u]! + h(u), open: open.map((n) => `${n}:${g[n]! + h(n)}`) };
    f.push(`Expand ${u} (g=${g[u]}, h=${h(u)}, f=${g[u]! + h(u)}).`, "expand");
    for (const { to, w, key } of adj.get(u) ?? []) {
      if (closed.has(to)) continue;
      const ng = g[u]! + w;
      if (g[to] === undefined || ng < g[to]!) {
        g[to] = ng;
        prev[to] = u;
        if (!open.includes(to)) open.push(to);
        s.labels[to] = `g=${ng} h=${h(to)}`;
        if (to !== goal) s.nodeTones[to] = "frontier";
        s.edgeTones[key] = "compare";
        f.push(`Relax ${u}→${to}: g=${ng}, f=${ng + h(to)}.`, "relax");
      }
    }
    s.nodeTones[u] = "visited";
  }
  f.push(`Goal unreachable.`, "done");
  return f.done();
};

// ---- grid ----

const gridIslands: G = (input) => (input.method === "bfs" ? gridIslandsBfs(input) : gridIslandsDfs(input));

// Number of islands by BFS, as in the matrix-traversal lesson: directions in
// the order right, down, left, up; a cell is marked when it is pushed, so no
// cell is ever queued twice. One frame per scan hit and per pop.
const gridIslandsBfs: G = (input) => {
  const grid = input.grid ?? [[1, 1, 0], [0, 1, 0], [0, 0, 1]];
  const { s, f } = make({ nodes: [], edges: [] });
  s.grid = { cells: grid.map((r) => [...r]), tones: {} };
  const R = grid.length;
  const C = grid[0]?.length ?? 0;
  const tones: Tone[] = ["path", "done", "compare", "frontier"];
  const dirs: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const seen = new Set<string>();
  const cell = (y: number, x: number) => `(${y}, ${x})`;
  let islands = 0;
  s.vars = { islands, queue: [] };
  f.push(`Count islands: scan cells in order; each unseen land cell starts a BFS that marks its whole island. Cells are marked when pushed, so none is queued twice.`);
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      if (grid[r]![c] !== 1 || seen.has(`${r},${c}`)) continue;
      islands++;
      const tone = tones[(islands - 1) % tones.length]!;
      seen.add(`${r},${c}`);
      s.grid.tones[`${r},${c}`] = "frontier";
      const queue: [number, number][] = [[r, c]];
      s.vars = { islands, queue: queue.map(([y, x]) => cell(y, x)) };
      f.push(`Scan finds unseen land at ${cell(r, c)}: island ${islands}. Mark it and push it.`, "new island");
      while (queue.length) {
        const [y, x] = queue.shift()!;
        s.grid.tones[`${y},${x}`] = tone;
        const pushed: string[] = [];
        for (const [dy, dx] of dirs) {
          const ny = y + dy;
          const nx = x + dx;
          const k = `${ny},${nx}`;
          if (ny < 0 || nx < 0 || ny >= R || nx >= C || grid[ny]![nx] !== 1 || seen.has(k)) continue;
          seen.add(k);
          s.grid.tones[k] = "frontier";
          queue.push([ny, nx]);
          pushed.push(cell(ny, nx));
        }
        s.vars = { islands, popped: cell(y, x), queue: queue.map(([qy, qx]) => cell(qy, qx)) };
        f.push(`Pop ${cell(y, x)} into island ${islands}; ${pushed.length ? `mark and push its unseen land ${pushed.length === 1 ? "neighbour" : "neighbours"} ${pushed.join(" and ")}.` : "no unseen land neighbours."}`, "pop");
        if (f.full) return f.done();
      }
    }
  s.vars = { islands };
  f.push(`${islands} island(s). Every cell is scanned once and enqueued at most once: O(R·C).`, "done");
  return f.done();
};

const gridIslandsDfs: G = (input) => {
  const grid = input.grid ?? [[1, 1, 0], [0, 1, 0], [0, 0, 1]];
  const { s, f } = make({ nodes: [], edges: [] });
  s.grid = { cells: grid.map((r) => [...r]), tones: {} };
  let islands = 0;
  const R = grid.length;
  const C = grid[0]?.length ?? 0;
  const tones: Tone[] = ["path", "done", "compare", "frontier"];
  f.push(`Count islands: scan cells; each unvisited land cell starts a flood fill (DFS) that marks its whole island.`);
  const seen = new Set<string>();
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      if (grid[r]![c] !== 1 || seen.has(`${r},${c}`)) continue;
      islands++;
      const stack: [number, number][] = [[r, c]];
      f.push(`Land at (${r}, ${c}) not yet visited: island ${islands}.`, "new island");
      while (stack.length) {
        const [y, x] = stack.pop()!;
        const k = `${y},${x}`;
        if (y < 0 || x < 0 || y >= R || x >= C || grid[y]![x] !== 1 || seen.has(k)) continue;
        seen.add(k);
        s.grid!.tones[k] = tones[(islands - 1) % tones.length]!;
        stack.push([y + 1, x], [y - 1, x], [y, x + 1], [y, x - 1]);
        f.push(`Flood (${y}, ${x}) into island ${islands}.`, "flood");
        if (f.full) return f.done();
      }
    }
  s.vars = { islands };
  f.push(`${islands} island(s). Each cell is visited once: O(R·C).`, "done");
  return f.done();
};

const gridBfs: G = (input) => {
  const grid = input.grid ?? [[0, 0, 0, 1], [1, 1, 0, 1], [0, 0, 0, 0], [0, 1, 1, 0]];
  const { s, f } = make({ nodes: [], edges: [] });
  s.grid = { cells: grid.map((r) => [...r]), tones: {} };
  const R = grid.length;
  const C = grid[0]?.length ?? 0;
  const dist: Record<string, number> = { "0,0": 0 };
  const prev: Record<string, string> = {};
  const queue: [number, number][] = [[0, 0]];
  s.grid.tones["0,0"] = "frontier";
  f.push(`Shortest path in a grid (1 = wall) from top-left to bottom-right: BFS, because every move costs 1.`);
  while (queue.length) {
    const [y, x] = queue.shift()!;
    const k = `${y},${x}`;
    s.grid.tones[k] = "visited";
    if (y === R - 1 && x === C - 1) {
      let cur = k;
      while (cur) {
        s.grid.tones[cur] = "path";
        cur = prev[cur]!;
      }
      s.vars = { distance: dist[k] };
      f.push(`Reached the goal at distance ${dist[k]}; path highlighted.`, "done");
      return f.done();
    }
    for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const ny = y + dy;
      const nx = x + dx;
      const nk = `${ny},${nx}`;
      if (ny < 0 || nx < 0 || ny >= R || nx >= C || grid[ny]![nx] === 1 || dist[nk] !== undefined) continue;
      dist[nk] = dist[k]! + 1;
      prev[nk] = k;
      queue.push([ny, nx]);
      s.grid.tones[nk] = "frontier";
    }
    s.vars = { visiting: k, dist: dist[k], queue: queue.length };
    f.push(`Expand (${y}, ${x}) at distance ${dist[k]}; enqueue unvisited open neighbours.`, "expand");
    if (f.full) return f.done();
  }
  f.push(`Goal unreachable.`, "done");
  return f.done();
};

function layout(input: GraphInput): Record<string, [number, number]> {
  const n = input.nodes.length;
  const out: Record<string, [number, number]> = {};
  input.nodes.forEach((node, i) => {
    if (node.x !== undefined && node.y !== undefined) out[node.id] = [node.x, node.y];
    else {
      const a = (2 * Math.PI * i) / Math.max(1, n) - Math.PI / 2;
      out[node.id] = [50 + 40 * Math.cos(a), 50 + 40 * Math.sin(a)];
    }
  });
  return out;
}

function Renderer({ frame, input }: RendererProps<GraphInput, GraphState>) {
  const { state } = frame;
  if (state.grid) {
    return (
      <div className="flex flex-col gap-3">
        <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `repeat(${state.grid.cells[0]?.length ?? 1}, 2rem)` }}>
          {state.grid.cells.map((row, r) =>
            row.map((v, c) => {
              const tone = state.grid!.tones[`${r},${c}`];
              const wall = v === 1 && !tone && !input.grid?.some(() => false);
              return (
                <div
                  key={`${r}-${c}`}
                  className="flex h-8 w-8 items-center justify-center rounded border text-[10px] font-mono"
                  style={{
                    background: tone ? `var(--tone-${tone})` : wall ? "var(--fg-muted)" : "var(--bg-elev-2)",
                    borderColor: tone ? "var(--accent)" : "var(--border)",
                    opacity: wall ? 0.5 : 1,
                  }}
                >
                  {v}
                </div>
              );
            }),
          )}
        </div>
        <Vars vars={state.vars} />
      </div>
    );
  }
  const pos = layout(input);
  const W = 360;
  const H = 260;
  const px = (v: number) => 30 + (v / 100) * (W - 60);
  const py = (v: number) => 30 + (v / 100) * (H - 60);
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto max-h-[320px] w-full max-w-[520px]" style={{ minWidth: 300 }} role="img" aria-label="Graph">
        {input.edges.map((e) => {
          const a = pos[e.from];
          const b = pos[e.to];
          if (!a || !b) return null;
          const tone = state.edgeTones[ek(e.from, e.to)] ?? "default";
          const [x1, y1] = [px(a[0]), py(a[1])];
          const [x2, y2] = [px(b[0]), py(b[1])];
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.hypot(dx, dy) || 1;
          const r = 17;
          const sx = x1 + (dx / len) * r;
          const sy = y1 + (dy / len) * r;
          const tx = x2 - (dx / len) * r;
          const ty = y2 - (dy / len) * r;
          const label = e.w !== undefined ? String(e.w) : undefined;
          return input.directed ? (
            <Arrow key={ek(e.from, e.to)} x1={sx} y1={sy} x2={tx} y2={ty} tone={tone} label={label} />
          ) : (
            <g key={ek(e.from, e.to)}>
              <line x1={sx} y1={sy} x2={tx} y2={ty} stroke={`var(--stroke-${tone})`} strokeWidth={tone === "default" ? 1.5 : 3} opacity={tone === "muted" ? 0.35 : 1} />
              {label && (
                <text x={(sx + tx) / 2} y={(sy + ty) / 2 - 4} fontSize="10" textAnchor="middle" fill="var(--fg-muted)" style={{ paintOrder: "stroke", stroke: "var(--bg-elev)", strokeWidth: 3 }}>
                  {label}
                </text>
              )}
            </g>
          );
        })}
        {input.nodes.map((n) => {
          const p = pos[n.id]!;
          return <Circle key={n.id} x={px(p[0])} y={py(p[1])} label={n.id} tone={state.nodeTones[n.id] ?? "default"} sub={state.labels[n.id]} />;
        })}
        <style>{`
          :root { --stroke-default: var(--border); --stroke-active: var(--accent); --stroke-compare: var(--warn); --stroke-done: var(--success); --stroke-danger: var(--danger); --stroke-muted: var(--border); --stroke-path: var(--accent); --stroke-visited: var(--success); --stroke-frontier: var(--warn);
                  --tone-path: color-mix(in srgb, var(--accent) 55%, var(--bg-elev-2)); --tone-done: color-mix(in srgb, var(--success) 35%, var(--bg-elev-2)); --tone-compare: color-mix(in srgb, var(--warn) 35%, var(--bg-elev-2)); --tone-frontier: color-mix(in srgb, var(--warn) 22%, var(--bg-elev-2)); --tone-visited: color-mix(in srgb, var(--success) 18%, var(--bg-elev-2)); --tone-active: color-mix(in srgb, var(--accent) 35%, var(--bg-elev-2)); --tone-danger: color-mix(in srgb, var(--danger) 35%, var(--bg-elev-2)); --tone-muted: transparent; --tone-default: var(--bg-elev-2); }
        `}</style>
      </svg>
      <Vars vars={state.vars} />
      <Legend items={[{ tone: "active", label: "current" }, { tone: "frontier", label: "frontier / queued" }, { tone: "visited", label: "settled" }, { tone: "path", label: "tree / path edge" }, { tone: "danger", label: "cycle / goal" }]} />
    </div>
  );
}

const sample: GraphInput = {
  directed: false,
  start: "A",
  nodes: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }, { id: "F" }],
  edges: [{ from: "A", to: "B", w: 4 }, { from: "A", to: "C", w: 2 }, { from: "B", to: "D", w: 5 }, { from: "C", to: "D", w: 8 }, { from: "C", to: "E", w: 10 }, { from: "D", to: "E", w: 2 }, { from: "D", to: "F", w: 6 }, { from: "E", to: "F", w: 3 }],
};
const dag: GraphInput = {
  directed: true,
  nodes: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }, { id: "F" }],
  edges: [{ from: "A", to: "B" }, { from: "A", to: "C" }, { from: "B", to: "D" }, { from: "C", to: "D" }, { from: "D", to: "E" }, { from: "C", to: "F" }, { from: "F", to: "E" }],
};

export const graphFamily: Family<GraphInput, GraphState> = {
  name: "Graph",
  description: "Traversal, shortest paths, DAGs, spanning trees and connectivity.",
  Renderer,
  algorithms: {
    bfs,
    dfs,
    dijkstra,
    "bellman-ford": bellmanFord,
    "topo-sort-kahn": topoKahn,
    "topo-sort-dfs": topoDfs,
    "dag-build": dagBuild,
    "connected-components": components,
    "cycle-detect": cycleDetect,
    bipartite,
    prim,
    kruskal,
    "union-find": unionFind,
    "a-star": aStar,
    "floyd-warshall": floydWarshall,
    "tarjan-scc": tarjanScc,
    bridges,
    "grid-islands": gridIslands,
    "grid-bfs": gridBfs,
  },
  labels: {
    bfs: "Breadth-first search",
    dfs: "Depth-first search",
    dijkstra: "Dijkstra's shortest paths",
    "bellman-ford": "Bellman–Ford",
    "topo-sort-kahn": "Topological sort (Kahn)",
    "topo-sort-dfs": "Topological sort (DFS)",
    "dag-build": "Building a DAG",
    "connected-components": "Connected components",
    "cycle-detect": "Cycle detection",
    bipartite: "Bipartite check",
    prim: "Prim's MST",
    kruskal: "Kruskal's MST",
    "union-find": "Union-find",
    "a-star": "A* search",
    "floyd-warshall": "Floyd–Warshall",
    "tarjan-scc": "Tarjan's SCC",
    bridges: "Bridges (low-link)",
    "grid-islands": "Number of islands",
    "grid-bfs": "Grid shortest path",
  },
  examples: {
    bfs: sample,
    dfs: dag,
    dijkstra: { ...sample, goal: "F" },
    "bellman-ford": { directed: true, start: "A", nodes: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }], edges: [{ from: "A", to: "B", w: 4 }, { from: "A", to: "C", w: 5 }, { from: "B", to: "C", w: -3 }, { from: "C", to: "D", w: 2 }, { from: "B", to: "D", w: 6 }] },
    "topo-sort-kahn": dag,
    "topo-sort-dfs": dag,
    "dag-build": { ...dag, edges: [...dag.edges, { from: "E", to: "A" }] },
    "connected-components": { nodes: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }, { id: "F" }, { id: "G" }], edges: [{ from: "A", to: "B" }, { from: "B", to: "C" }, { from: "D", to: "E" }, { from: "F", to: "G" }, { from: "G", to: "F" }] },
    "cycle-detect": { directed: true, nodes: dag.nodes, edges: [...dag.edges, { from: "E", to: "B" }] },
    bipartite: { nodes: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }], edges: [{ from: "A", to: "B" }, { from: "B", to: "C" }, { from: "C", to: "D" }, { from: "D", to: "A" }, { from: "D", to: "E" }] },
    prim: sample,
    kruskal: sample,
    "union-find": { nodes: sample.nodes, edges: [{ from: "A", to: "B" }, { from: "C", to: "D" }, { from: "B", to: "C" }, { from: "A", to: "D" }, { from: "E", to: "F" }] },
    "a-star": { directed: false, start: "A", goal: "F", nodes: [{ id: "A", x: 5, y: 50 }, { id: "B", x: 30, y: 20 }, { id: "C", x: 30, y: 80 }, { id: "D", x: 55, y: 50 }, { id: "E", x: 75, y: 15 }, { id: "F", x: 95, y: 50 }], edges: [{ from: "A", to: "B", w: 4 }, { from: "A", to: "C", w: 4 }, { from: "B", to: "D", w: 4 }, { from: "C", to: "D", w: 4 }, { from: "B", to: "E", w: 5 }, { from: "D", to: "F", w: 5 }, { from: "E", to: "F", w: 5 }] },
    "floyd-warshall": { directed: true, nodes: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }], edges: [{ from: "A", to: "B", w: 3 }, { from: "B", to: "C", w: 1 }, { from: "A", to: "C", w: 7 }, { from: "C", to: "D", w: 2 }, { from: "D", to: "A", w: 6 }] },
    "tarjan-scc": { directed: true, nodes: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }, { id: "F" }], edges: [{ from: "A", to: "B" }, { from: "B", to: "C" }, { from: "C", to: "A" }, { from: "B", to: "D" }, { from: "D", to: "E" }, { from: "E", to: "D" }, { from: "E", to: "F" }] },
    bridges: { nodes: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }, { id: "F" }], edges: [{ from: "A", to: "B" }, { from: "B", to: "C" }, { from: "C", to: "A" }, { from: "C", to: "D" }, { from: "D", to: "E" }, { from: "E", to: "F" }, { from: "F", to: "D" }] },
    "grid-islands": { nodes: [], edges: [], grid: [[1, 1, 0, 0, 0], [1, 0, 0, 1, 1], [0, 0, 0, 1, 0], [0, 1, 0, 0, 0], [1, 1, 0, 0, 1]] },
    "grid-bfs": { nodes: [], edges: [], grid: [[0, 0, 0, 1, 0], [1, 1, 0, 1, 0], [0, 0, 0, 0, 0], [0, 1, 1, 1, 0], [0, 0, 0, 1, 0]] },
  },
  normalise: (raw) => {
    const nodes = Array.isArray(raw.nodes) ? (raw.nodes as unknown[]).map((n) => (typeof n === "string" ? { id: n } : (n as GraphNodeIn))).slice(0, 30) : [];
    const edges = Array.isArray(raw.edges) ? (raw.edges as GraphEdgeIn[]).slice(0, 80) : [];
    const ids = new Set(nodes.map((n) => n.id));
    for (const e of edges) for (const id of [e.from, e.to]) if (!ids.has(id)) {
      ids.add(id);
      nodes.push({ id });
    }
    return { nodes, edges, directed: Boolean(raw.directed), start: raw.start as string | undefined, goal: raw.goal as string | undefined, grid: raw.grid as number[][] | undefined, ...(typeof raw.method === "string" ? { method: raw.method } : {}) };
  },
};
