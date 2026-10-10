// Recursion and backtracking: a call tree that grows as calls happen, the
// current frame highlighted, returned values written on the nodes, and a
// live call-stack readout. Board-based algorithms (n-queens, flood fill)
// also show the board; hanoi shows the pegs.
import { Cells, Legend, Vars, toneClass, toneFill, toneStroke, type Tone } from "../primitives";
import { Frames, type Family, type Frame, type RendererProps } from "../engine";
import { cn } from "../../lib/utils";

export interface RecursionInput {
  n?: number;
  k?: number;
  values?: (number | string)[];
  target?: number;
  grid?: number[][];
  start?: [number, number];
  color?: number;
  /** factorial: the base case is n <= base (0 or 1; default 1). */
  base?: number;
  /** fibonacci: the values of f(0) and f(1) (default [0, 1]). */
  bases?: number[];
  /** fibonacci: the function name shown on the nodes (default "fib"). */
  name?: string;
  /** merge-sort-tree: "even-odd" shows the FFT's split by index parity instead of merge sort. */
  split?: string;
}

export interface RecNode {
  id: number;
  parent: number | null;
  label: string;
  /** Written under the node once the call returns. */
  result?: string;
  tone: Tone;
  depth: number;
}

export interface RecRow {
  label?: string;
  values: (string | number | null)[];
  tones?: (Tone | undefined)[];
  labels?: (string | number | null)[];
  pointers?: Record<string, number | undefined>;
}

export interface RecState {
  nodes: RecNode[];
  /** Call stack, bottom first. */
  stack: string[];
  vars: Record<string, unknown>;
  rows: RecRow[];
  results: string[];
  board?: { cells: (string | number | null)[][]; tones: Record<string, Tone> };
  pegs?: { names: string[]; discs: number[][] };
}

type G = (input: RecursionInput) => Frame<RecState>[];

const key = (r: number, c: number) => `${r},${c}`;
const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

function make() {
  const s: RecState = { nodes: [], stack: [], vars: {}, rows: [], results: [] };
  const f = new Frames<RecState>(() => ({
    nodes: s.nodes.map((n) => ({ ...n })),
    stack: [...s.stack],
    vars: { ...s.vars },
    rows: s.rows.map((r) => ({ ...r, values: [...r.values], tones: r.tones ? [...r.tones] : undefined, labels: r.labels ? [...r.labels] : undefined, pointers: r.pointers ? { ...r.pointers } : undefined })),
    results: [...s.results],
    board: s.board ? { cells: s.board.cells.map((row) => [...row]), tones: { ...s.board.tones } } : undefined,
    pegs: s.pegs ? { names: [...s.pegs.names], discs: s.pegs.discs.map((p) => [...p]) } : undefined,
  }));
  let calls = 0;
  let maxDepth = 0;
  /** Push a frame; `depth` and `calls` are always in the readout. */
  const push = (note: string, tag?: string) => {
    s.vars = { ...s.vars, depth: s.stack.length, calls };
    f.push(note, tag);
  };
  const enter = (label: string, parent: number | null): number => {
    calls++;
    const id = s.nodes.length;
    const depth = parent === null ? 0 : s.nodes[parent]!.depth + 1;
    if (parent !== null) s.nodes[parent]!.tone = "frontier";
    s.nodes.push({ id, parent, label, tone: "active", depth });
    s.stack.push(label);
    maxDepth = Math.max(maxDepth, s.stack.length);
    return id;
  };
  const leave = (id: number, result?: string, tone: Tone = "visited") => {
    const n = s.nodes[id]!;
    n.result = result;
    n.tone = tone;
    s.stack.pop();
    if (n.parent !== null) s.nodes[n.parent]!.tone = "active";
  };
  const resume = (id: number) => {
    s.nodes[id]!.tone = "active";
  };
  /** Draw a branch that is considered but never called (a pruned choice). */
  const ghost = (label: string, parent: number, result: string, tone: Tone = "danger") => {
    const id = s.nodes.length;
    s.nodes.push({ id, parent, label, result, tone, depth: s.nodes[parent]!.depth + 1 });
    return id;
  };
  const problem = (msg: string) => {
    f.push(msg, "input");
    return f.done();
  };
  return { s, f, push, enter, leave, resume, ghost, problem, calls: () => calls, maxDepth: () => maxDepth };
}

// ---- linear recursion ----

const factorial: G = ({ n, base }) => {
  const B = base === 0 ? 0 : 1;
  const N = clampInt(n, 0, 12, 5);
  const { s, f, push, enter, leave, problem, calls, maxDepth } = make();
  if (!Number.isFinite(Number(n)) && n !== undefined) return problem("factorial needs a non-negative integer n (n: 5).");
  push(`factorial(${N}) = ${N} × factorial(${N - 1}): every call pushes a frame and waits for the smaller answer, so nothing is multiplied until the base case returns.`);
  const rec = (k: number, parent: number | null): number => {
    const id = enter(`fact(${k})`, parent);
    if (k <= B) {
      push(`fact(${k}) is the base case (n ≤ ${B}): it returns 1 without recursing. The stack is ${s.stack.length} frame${s.stack.length === 1 ? "" : "s"} deep.`, "base");
      leave(id, "1", "done");
      push(parent === null ? "Return 1." : `Pop fact(${k}) and hand 1 back to fact(${k + 1}), which can now finish its multiply.`, "return");
      return 1;
    }
    push(`fact(${k}) needs fact(${k - 1}) first: push a frame and recurse (depth ${s.stack.length}).`, "call");
    const sub = rec(k - 1, id);
    const val = k * sub;
    leave(id, String(val));
    push(`fact(${k}) = ${k} × ${sub} = ${val}: the pending multiply completes, pop the frame and return ${val}.`, "return");
    return val;
  };
  const r = rec(N, null);
  push(`factorial(${N}) = ${r} after ${calls()} calls with a maximum stack depth of ${maxDepth()}: O(n) time and O(n) stack space, which is why a loop is preferred for large n.`, "done");
  return f.done();
};

const fibonacci: G = ({ n, bases, name }) => {
  const N = clampInt(n, 0, 10, 5);
  const F = name && /^[A-Za-z_][A-Za-z0-9_]{0,11}$/.test(name) ? name : "fib";
  const b0 = Number.isFinite(bases?.[0]) ? bases![0]! : 0;
  const b1 = Number.isFinite(bases?.[1]) ? bases![1]! : 1;
  const { s, f, push, enter, leave, resume, calls, maxDepth } = make();
  const computed = new Map<number, number>();
  const times = new Map<number, number>();
  push(`Naive recursive ${F}(${N}): ${F}(k) = ${F}(k−1) + ${F}(k−2), two calls per node${F === "fib" && b0 === 0 && b1 === 1 ? "" : `, with base cases ${F}(0) = ${b0} and ${F}(1) = ${b1}`}. Watch the same arguments come back again and again.`);
  const rec = (k: number, parent: number | null): number => {
    const seen = times.get(k) ?? 0;
    times.set(k, seen + 1);
    const id = enter(`${F}(${k})`, parent);
    const again = seen > 0 && k >= 2 ? ` This is call #${seen + 1} to ${F}(${k}): its value ${computed.get(k)} is already known, but naive recursion has no memory, so the whole subtree is recomputed.` : "";
    if (k <= 1) {
      const bv = k === 0 ? b0 : b1;
      leave(id, String(bv), "done");
      push(`${F}(${k}) = ${bv}: base case, return immediately.`, "base");
      return bv;
    }
    push(`${F}(${k}) needs ${F}(${k - 1}) and ${F}(${k - 2}); call ${F}(${k - 1}) first and leave this frame waiting.${again}`, "call");
    const a = rec(k - 1, id);
    if (f.full) return 0;
    resume(id);
    push(`Back in ${F}(${k}) with ${F}(${k - 1}) = ${a}; now call ${F}(${k - 2}).`, "call");
    const b = rec(k - 2, id);
    if (f.full) return 0;
    const v = a + b;
    computed.set(k, v);
    leave(id, String(v), seen > 0 ? "compare" : "visited");
    push(`${F}(${k}) = ${a} + ${b} = ${v}: pop and return.`, "return");
    return v;
  };
  const r = rec(N, null);
  const distinct = N + 1;
  s.vars = { ...s.vars, distinctArguments: distinct };
  push(`${F}(${N}) = ${r} took ${calls()} calls but there are only ${distinct} distinct arguments; the live stack never exceeded ${maxDepth()} frames. Memoising the ${distinct} results makes it O(n).`, "done");
  return f.done();
};

const hanoi: G = ({ n }) => {
  const N = clampInt(n, 0, 6, 3);
  const { s, f, push, enter, leave, resume, calls, maxDepth } = make();
  const names = ["A", "B", "C"];
  const pegs: number[][] = [range(N).map((i) => N - i), [], []];
  s.pegs = { names, discs: pegs };
  let moves = 0;
  if (N === 0) {
    push("No discs: nothing to move (0 moves).", "done");
    return f.done();
  }
  push(`Towers of Hanoi with ${N} discs: to move n discs A→C, move n−1 discs A→B out of the way, move disc n A→C, then move the n−1 discs B→C.`);
  const move = (disc: number, from: number, to: number) => {
    pegs[from]!.pop();
    pegs[to]!.push(disc);
    moves++;
    s.vars = { ...s.vars, moves };
  };
  const rec = (k: number, from: number, to: number, via: number, parent: number | null) => {
    if (f.full) return;
    const id = enter(`hanoi(${k}, ${names[from]}→${names[to]})`, parent);
    if (k === 1) {
      move(1, from, to);
      leave(id, "1 move", "done");
      push(`hanoi(1, ${names[from]}→${names[to]}): a single disc moves directly, disc 1 ${names[from]}→${names[to]} (move #${moves}).`, "move");
      return;
    }
    push(`hanoi(${k}, ${names[from]}→${names[to]}): first get the ${k - 1 === 1 ? "smaller disc" : `${k - 1} smaller discs`} out of the way onto ${names[via]}.`, "call");
    rec(k - 1, from, via, to, id);
    if (f.full) return;
    resume(id);
    move(k, from, to);
    push(`Disc ${k} is now free: move it ${names[from]}→${names[to]} (move #${moves}). Then bring the ${k - 1 === 1 ? "smaller disc" : `${k - 1} smaller discs`} from ${names[via]} onto it.`, "move");
    rec(k - 1, via, to, from, id);
    if (f.full) return;
    leave(id, `${2 ** k - 1} moves`);
    push(`hanoi(${k}, ${names[from]}→${names[to]}) complete: 2·(2^${k - 1} − 1) + 1 = ${2 ** k - 1} moves.`, "return");
  };
  rec(N, 0, 2, 1, null);
  push(`All ${N} discs on C in ${moves} = 2^${N} − 1 moves after ${calls()} calls; the tree is a full binary tree of depth ${maxDepth()}, so time is O(2^n) but stack space only O(n).`, "done");
  return f.done();
};

// ---- combinatorial enumeration ----

const permutations: G = ({ values }) => {
  const v = (values ?? [1, 2, 3]).slice(0, 4);
  const n = v.length;
  const { s, f, push, enter, leave, resume, problem, calls } = make();
  if (n === 0) return problem("permutations needs a list of values (values: [1, 2, 3]).");
  const used = new Array<boolean>(n).fill(false);
  const setRows = (path: (number | string)[]) => {
    s.rows = [
      { label: "path", values: [...path, ...range(n - path.length).map(() => null)], tones: path.map(() => "active" as Tone) },
      { label: "candidates (used ones greyed)", values: [...v], tones: used.map((u) => (u ? "muted" : undefined)) },
    ];
  };
  setRows([]);
  push(`Permutations of [${v.join(", ")}]: at each depth choose one unused element; a full path of length ${n} is one permutation. Expect ${n}! = ${range(n).reduce((a, i) => a * (i + 1), 1)} leaves.`);
  const rec = (path: (number | string)[], parent: number | null) => {
    if (f.full) return;
    const id = enter(`[${path.join(",")}]`, parent);
    setRows(path);
    if (path.length === n) {
      s.results.push(`[${path.join(",")}]`);
      leave(id, "✓", "done");
      push(`Path is full: record [${path.join(", ")}] as permutation #${s.results.length}, then unwind to try the next choice.`, "record");
      return;
    }
    push(`Depth ${path.length}: choose the next element from the unused {${v.filter((_, i) => !used[i]).join(", ")}}.`, "call");
    for (let i = 0; i < n; i++) {
      if (used[i] || f.full) continue;
      used[i] = true;
      rec([...path, v[i]!], id);
      used[i] = false;
      resume(id);
      setRows(path);
      push(`Back at [${path.join(",")}]: un-choose ${v[i]} so a later branch may use it (backtrack).`, "backtrack");
    }
    leave(id, "");
  };
  rec([], null);
  push(`${s.results.length} permutations from ${calls()} calls. Every node does O(n) work and the leaves alone number n!, so the total is O(n · n!).`, "done");
  return f.done();
};

const subsets: G = ({ values }) => {
  const v = (values ?? [1, 2, 3]).slice(0, 5);
  const n = v.length;
  const { s, f, push, enter, leave, resume, problem, calls } = make();
  if (n === 0) return problem("subsets needs a list of values (values: [1, 2, 3]).");
  const setRows = (i: number, chosen: (number | string)[]) => {
    s.rows = [{ label: "elements (deciding the highlighted one)", values: [...v], tones: v.map((x, j) => (j === i ? "active" : chosen.includes(x) ? "done" : j < i ? "muted" : undefined)) }];
  };
  push(`Subsets of [${v.join(", ")}]: each level makes one in-or-out decision for one element, so the tree is binary and has 2^${n} = ${2 ** n} leaves.`);
  const rec = (i: number, chosen: (number | string)[], parent: number | null) => {
    if (f.full) return;
    const id = enter(`{${chosen.join(",")}}`, parent);
    setRows(i, chosen);
    if (i === n) {
      s.results.push(`{${chosen.join(",")}}`);
      leave(id, "✓", "done");
      push(`All ${n} decisions made: record {${chosen.join(", ")}} as subset #${s.results.length}.`, "record");
      return;
    }
    push(`Decision ${i}: include ${v[i]} or not? Take the "include" branch first.`, "call");
    rec(i + 1, [...chosen, v[i]!], id);
    if (f.full) return;
    resume(id);
    setRows(i, chosen);
    push(`Back at {${chosen.join(",")}}: now the "exclude ${v[i]}" branch.`, "backtrack");
    rec(i + 1, chosen, id);
    if (f.full) return;
    leave(id, "");
    push(`Both branches for ${v[i]} explored; return to the parent.`, "return");
  };
  rec(0, [], null);
  push(`${s.results.length} = 2^${n} subsets from ${calls()} calls (the empty set and the full set are both leaves). O(2^n) leaves, O(n) stack depth.`, "done");
  return f.done();
};

const combinations: G = ({ values, n, k }) => {
  const v: (number | string)[] = values && values.length > 0 ? values.slice(0, 6) : range(clampInt(n, 1, 6, 4)).map((i) => i + 1);
  const N = v.length;
  const K = clampInt(k, 0, N, Math.min(2, N));
  const { s, f, push, enter, leave, resume, ghost, calls } = make();
  const setRows = (start: number, path: (number | string)[]) => {
    s.rows = [{ label: `candidates from index ${start}`, values: [...v], tones: v.map((x, j) => (path.includes(x) ? "done" : j < start ? "muted" : undefined)) }];
  };
  push(`Choose ${K} of [${v.join(", ")}]: pick in increasing index order so each combination appears once, and prune any branch that cannot still reach ${K} items.`);
  const rec = (start: number, path: (number | string)[], parent: number | null) => {
    if (f.full) return;
    const id = enter(`[${path.join(",")}]`, parent);
    setRows(start, path);
    if (path.length === K) {
      s.results.push(`[${path.join(",")}]`);
      leave(id, "✓", "done");
      push(`Path has k = ${K} items: record [${path.join(", ")}] as combination #${s.results.length}.`, "record");
      return;
    }
    const need = K - path.length;
    push(`Need ${need} more; candidates are indices ${start}..${N - 1} (${v.slice(start).join(", ") || "none"}).`, "call");
    for (let i = start; i < N; i++) {
      if (f.full) return;
      const left = N - i;
      if (left < need) {
        ghost(`[${[...path, v[i]!].join(",")}]`, id, "pruned");
        push(`Choosing ${v[i]} would leave only ${left - 1} element(s) after it, but ${need - 1} more are still needed: prune. This branch could never fill up, so it is never called.`, "prune");
        continue;
      }
      rec(i + 1, [...path, v[i]!], id);
      resume(id);
      setRows(start, path);
    }
    leave(id, "");
    push(`All candidates from index ${start} tried for [${path.join(",")}]; return.`, "return");
  };
  rec(0, [], null);
  push(`C(${N}, ${K}) = ${s.results.length} combinations from ${calls()} calls; pruned branches were never called. Pruning branches that cannot reach k is what makes this cheaper than enumerating all 2^${N} subsets.`, "done");
  return f.done();
};

// ---- constraint search ----

const nQueens: G = ({ n }) => {
  const N = clampInt(n, 1, 6, 4);
  const { s, f, push, enter, leave, resume, calls } = make();
  const cols = new Set<number>();
  const diag = new Set<number>();
  const anti = new Set<number>();
  const queens: number[] = [];
  s.board = { cells: Array.from({ length: N }, () => new Array<string | null>(N).fill(null)), tones: {} };
  let placements = 0;
  const paint = () => {
    const b = s.board!;
    b.tones = {};
    queens.forEach((c, r) => {
      b.tones[key(r, c)] = "done";
    });
    s.vars = { ...s.vars, cols: [...cols], diag: [...diag], anti: [...anti], placements };
  };
  paint();
  push(`${N}-queens: place one queen per row. A column c is safe for row r if no earlier queen shares the column, the diagonal r−c, or the anti-diagonal r+c.`);
  const rec = (row: number, label: string, parent: number | null): boolean => {
    if (f.full) return false;
    const id = enter(label, parent);
    if (row === N) {
      paint();
      leave(id, "solved", "done");
      push(`Row ${N} reached: all ${N} queens are placed without conflict. Solution found, unwind with true.`, "solution");
      return true;
    }
    paint();
    push(`Row ${row}: try each column left to right, skipping any attacked by the ${row} queen(s) already placed.`, "call");
    for (let c = 0; c < N; c++) {
      if (f.full) return false;
      // Report the reason in the order the code checks it: column, then diagonal, then anti-diagonal.
      const byCol = queens.findIndex((qc) => qc === c);
      const byDiag = queens.findIndex((qc, qr) => qr - qc === row - c);
      const byAnti = queens.findIndex((qc, qr) => qr + qc === row + c);
      const attacker = byCol >= 0 ? byCol : byDiag >= 0 ? byDiag : byAnti;
      if (attacker >= 0) {
        const qc = queens[attacker]!;
        const why = byCol >= 0 ? "same column" : byDiag >= 0 ? "same diagonal (r − c)" : "same anti-diagonal (r + c)";
        paint();
        s.board!.tones[key(row, c)] = "danger";
        s.board!.tones[key(attacker, qc)] = "compare";
        push(`(${row}, ${c}) is attacked by the queen at (${attacker}, ${qc}): ${why}. Skip.`, "conflict");
        continue;
      }
      queens.push(c);
      cols.add(c);
      diag.add(row - c);
      anti.add(row + c);
      placements++;
      s.board!.cells[row]![c] = "♛";
      paint();
      s.board!.tones[key(row, c)] = "active";
      push(`(${row}, ${c}) is safe: place a queen and recurse to row ${row + 1}.`, "place");
      if (rec(row + 1, `(${row},${c})`, id)) {
        leave(id, `col ${c}`, "done");
        return true;
      }
      if (f.full) return false;
      queens.pop();
      cols.delete(c);
      diag.delete(row - c);
      anti.delete(row + c);
      s.board!.cells[row]![c] = null;
      resume(id);
      paint();
      s.board!.tones[key(row, c)] = "danger";
      push(`Row ${row + 1} had no safe column with a queen at (${row}, ${c}): remove it and try the next column (backtrack).`, "backtrack");
    }
    leave(id, "✗", "danger");
    paint();
    push(`No column in row ${row} works: dead end, return false to row ${row - 1}.`, "fail");
    return false;
  };
  const ok = rec(0, "root", null);
  paint();
  push(ok ? `First solution: columns [${queens.join(", ")}] after ${placements} placements and ${calls()} calls, versus ${N}^${N} = ${N ** N} boards by brute force. Backtracking prunes as soon as a row is dead.` : `No ${N}-queens solution exists: every branch dead-ended after ${placements} placements and ${calls()} calls.`, "done");
  return f.done();
};

const floodFill: G = ({ grid, start, color }) => {
  const g = grid && grid.length > 0 ? grid.slice(0, 6).map((r) => r.slice(0, 6)) : [[1, 1, 0, 0, 1], [1, 0, 0, 1, 1], [1, 1, 1, 0, 0], [0, 0, 1, 0, 1], [0, 1, 1, 0, 1]];
  const R = g.length;
  const C = Math.min(...g.map((r) => r.length));
  const { s, f, push, enter, leave, resume, problem, calls, maxDepth } = make();
  if (C === 0) return problem("flood-fill needs a non-empty grid (grid: [[1,1,0],[1,0,0]]).");
  const sr = clampInt(start?.[0], 0, R - 1, 0);
  const sc = clampInt(start?.[1], 0, C - 1, 0);
  const old = g[sr]![sc]!;
  const newColor = clampInt(color, 0, 99, old === 2 ? 3 : 2);
  s.board = { cells: g.map((r) => r.slice(0, C)), tones: {} };
  if (newColor === old) {
    push(`Cell (${sr}, ${sc}) already has colour ${newColor}: return immediately, or the recursion would never terminate.`, "done");
    return f.done();
  }
  const onStack = new Set<string>();
  const paint = (cur?: [number, number]) => {
    const b = s.board!;
    b.tones = {};
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (b.cells[r]![c] === newColor) b.tones[key(r, c)] = "visited";
    for (const k of onStack) b.tones[k] = "frontier";
    if (cur) b.tones[key(cur[0], cur[1])] = "active";
  };
  const dirs: [number, number, string][] = [[-1, 0, "up"], [1, 0, "down"], [0, -1, "left"], [0, 1, "right"]];
  paint();
  push(`Flood fill from (${sr}, ${sc}): recolour every cell 4-connected to it that holds ${old} to ${newColor}. Each call paints one cell, then recurses into neighbours that still hold ${old}.`);
  let filled = 0;
  const rec = (r: number, c: number, parent: number | null) => {
    if (f.full) return;
    const id = enter(`fill(${r},${c})`, parent);
    s.board!.cells[r]![c] = newColor;
    filled++;
    onStack.add(key(r, c));
    const todo: string[] = [];
    const skip: string[] = [];
    for (const [dr, dc, name] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= R || nc >= C) skip.push(`${name} is off the grid`);
      else if (s.board!.cells[nr]![nc] !== old) skip.push(`${name} (${nr}, ${nc}) holds ${s.board!.cells[nr]![nc]}`);
      else todo.push(`${name} (${nr}, ${nc})`);
    }
    paint([r, c]);
    s.vars = { ...s.vars, filled };
    push(`fill(${r}, ${c}): paint it ${newColor}.${skip.length ? ` Skip: ${skip.join(", ")}.` : ""}${todo.length ? ` Recurse into ${todo.join(", ")}.` : " No neighbours left to visit."}`, "paint");
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= R || nc >= C || s.board!.cells[nr]![nc] !== old || f.full) continue;
      rec(nr, nc, id);
      resume(id);
    }
    onStack.delete(key(r, c));
    leave(id, "");
    paint();
    push(`fill(${r}, ${c}) done: all four neighbours handled, pop the frame.`, "return");
  };
  rec(sr, sc, null);
  paint();
  push(`${filled} cell(s) recoloured in ${calls()} calls with a maximum recursion depth of ${maxDepth()}. Painting before recursing is what stops revisits; O(R·C) time, and the stack can reach O(R·C) on a snake-shaped region.`, "done");
  return f.done();
};

// ---- divide and conquer ----

const binarySearchRecursive: G = ({ values, target }) => {
  const v = (values ?? [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]).map(Number).filter((x) => Number.isFinite(x)).slice(0, 40);
  const n = v.length;
  const { s, f, push, enter, leave, problem, calls, maxDepth } = make();
  if (n === 0) return problem("binary-search-recursive needs a sorted list of numbers (values: [2, 5, 8, 12]) and a target.");
  const T = target === undefined || !Number.isFinite(target) ? v[Math.floor((n - 1) * 0.7)]! : target;
  const setRow = (lo: number, hi: number, mid?: number) => {
    s.rows = [{ label: "values", values: [...v], tones: v.map((_, i) => (i === mid ? "compare" : i < lo || i > hi ? "muted" : "active")), pointers: { lo: lo < n ? lo : undefined, mid, hi: hi >= 0 ? hi : undefined } }];
  };
  setRow(0, n - 1);
  s.vars = { target: T };
  push(`Recursive binary search for ${T}: each call inspects the middle of [lo, hi] and makes exactly one recursive call on the half that can still contain the target, so the tree is a chain of depth ⌈log₂ ${n}⌉ + 1 at most.`);
  const rec = (lo: number, hi: number, parent: number | null): number => {
    const id = enter(`bs(${lo}, ${hi})`, parent);
    if (lo > hi) {
      setRow(lo, hi);
      leave(id, "-1", "danger");
      push(`lo = ${lo} > hi = ${hi}: the range is empty, ${T} is absent, return −1.`, "miss");
      return -1;
    }
    const mid = lo + Math.floor((hi - lo) / 2);
    setRow(lo, hi, mid);
    const m = v[mid]!;
    if (m === T) {
      s.rows[0]!.tones![mid] = "done";
      leave(id, String(mid), "done");
      push(`values[${mid}] = ${m} equals the target: found, return ${mid}.`, "found");
      return mid;
    }
    const goRight = m < T;
    push(`values[${mid}] = ${m} ${goRight ? "<" : ">"} ${T}: the target can only be in the ${goRight ? "right" : "left"} half, recurse on [${goRight ? mid + 1 : lo}, ${goRight ? hi : mid - 1}].`, goRight ? "go right" : "go left");
    const r = goRight ? rec(mid + 1, hi, id) : rec(lo, mid - 1, id);
    setRow(lo, hi, mid);
    leave(id, String(r), r >= 0 ? "visited" : "danger");
    push(`bs(${lo}, ${hi}) returns ${r} unchanged: the recursive call was in tail position, nothing is combined on the way up.`, "return");
    return r;
  };
  const r = rec(0, n - 1, null);
  push(`${r >= 0 ? `Found ${T} at index ${r}` : `${T} is not present`} after ${calls()} calls, depth ${maxDepth()}: one branch per level gives O(log n) time and O(log n) stack (O(1) if the compiler eliminates the tail call).`, "done");
  return f.done();
};

/** The FFT's recursion: split coefficients by index parity, combine with n/2 butterflies. */
const fftSplit: G = ({ values }) => {
  const raw = (values ?? ["a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7"]).slice(0, 8);
  let n = 1;
  while (n * 2 <= raw.length) n *= 2;
  const a = raw.slice(0, n).map(String);
  const { s, f, push, enter, leave, resume, problem, calls } = make();
  if (a.length === 0) return problem("merge-sort-tree with split even-odd needs a list of coefficients (values: [\"a0\", \"a1\", \"a2\", \"a3\"]).");
  const setRow = (idx: number[], tone: Tone) => {
    s.rows = [{ label: "coefficients (index below)", values: [...a], tones: a.map((_, i) => (idx.includes(i) ? tone : undefined)), labels: range(n) }];
  };
  setRow(range(n), "active");
  let butterflies = 0;
  push(`The FFT on ${n} coefficients ${a.join(", ")}: split by index parity, A(x) = E(x²) + x·O(x²), where E holds the even-indexed coefficients and O the odd-indexed ones. Recurse on both halves, then combine with n/2 butterflies.`);
  const rec = (idx: number[], parent: number | null) => {
    if (f.full) return;
    const label = `[${idx.map((i) => a[i]).join(",")}]`;
    const id = enter(label, parent);
    setRow(idx, "active");
    if (idx.length === 1) {
      leave(id, a[idx[0]!]!, "done");
      push(`[${a[idx[0]!]}] is a constant polynomial: its value at the only point, 1, is ${a[idx[0]!]} itself. Base case, return it.`, "base");
      return;
    }
    const even = idx.filter((_, j) => j % 2 === 0);
    const odd = idx.filter((_, j) => j % 2 === 1);
    const names = (xs: number[]) => xs.map((i) => a[i]).join(", ");
    push(`Split ${label} by position at level ${s.nodes[id]!.depth} of the tree: the even positions (${names(even)}) form E, the odd positions (${names(odd)}) form O. Evaluate E first.`, "split");
    rec(even, id);
    if (f.full) return;
    resume(id);
    setRow(idx, "active");
    rec(odd, id);
    if (f.full) return;
    resume(id);
    const half = idx.length / 2;
    butterflies += half;
    setRow(idx, "compare");
    leave(id, `${idx.length} values`);
    s.vars = { ...s.vars, butterflies };
    push(`Combine ${label}: ${half === 1 ? "1 butterfly takes" : `${half} butterflies each take`} E's value and O's value times a root of unity ω, and emit E + ωO and E − ωO. That gives ${idx.length} outputs, this polynomial's values at ${idx.length} roots of unity, in O(${idx.length}) work.`, "combine");
  };
  rec(range(n), null);
  setRow(range(n), "done");
  s.vars = { ...s.vars, butterflies };
  push(`${calls()} calls, ${Math.log2(n)} levels of splitting, and ${n / 2} butterflies at every level, ${butterflies} in all: two half-size calls plus linear combining, T(n) = 2T(n/2) + O(n) = O(n log n), the same shape as merge sort.`, "done");
  return f.done();
};

const mergeSortTree: G = (input) => {
  if (input.split === "even-odd") return fftSplit(input);
  const { values } = input;
  const a = (values ?? [38, 27, 43, 3, 9, 82, 10, 5]).map(Number).filter((x) => Number.isFinite(x)).slice(0, 8);
  const n = a.length;
  const { s, f, push, enter, leave, resume, problem, calls, maxDepth } = make();
  if (n === 0) return problem("merge-sort-tree needs a list of numbers (values: [38, 27, 43, 3]).");
  const setRow = (lo: number, hi: number, tone: Tone, mark?: number) => {
    s.rows = [{ label: "array (in place)", values: [...a], tones: a.map((_, i) => (i === mark ? "done" : i >= lo && i <= hi ? tone : undefined)), labels: range(n) }];
  };
  setRow(0, n - 1, "active");
  push(`Merge sort's recursion tree on ${n} values: split in halves until single elements, then merge sorted halves on the way back up.`);
  const rec = (lo: number, hi: number, parent: number | null) => {
    if (f.full) return;
    const id = enter(`[${a.slice(lo, hi + 1).join(",")}]`, parent);
    setRow(lo, hi, "active");
    if (lo === hi) {
      leave(id, `[${a[lo]}]`, "done");
      push(`[${a[lo]}] is a single element, so it is already sorted: return it.`, "base");
      return;
    }
    const mid = lo + Math.floor((hi - lo) / 2);
    push(`Split [${lo}..${hi}] into [${lo}..${mid}] and [${mid + 1}..${hi}] at level ${s.nodes[id]!.depth} of the tree (the root is level 0); sort the left half first.`, "split");
    rec(lo, mid, id);
    if (f.full) return;
    resume(id);
    setRow(lo, hi, "active");
    push(`Left half [${a.slice(lo, mid + 1).join(",")}] is sorted; now the right half.`, "call");
    rec(mid + 1, hi, id);
    if (f.full) return;
    resume(id);
    const left = a.slice(lo, mid + 1);
    const right = a.slice(mid + 1, hi + 1);
    let i = 0;
    let j = 0;
    let k = lo;
    while ((i < left.length || j < right.length) && !f.full) {
      const takeLeft = j >= right.length || (i < left.length && left[i]! <= right[j]!);
      a[k] = takeLeft ? left[i++]! : right[j++]!;
      setRow(lo, hi, "compare", k);
      push(`Merge: ${takeLeft ? (j >= right.length ? `the right half is used up, so copy left ${a[k]}` : `left ${a[k]} ≤ right ${right[j]}`) : i >= left.length ? `the left half is used up, so copy right ${a[k]}` : `right ${a[k]} < left ${left[i]}`}, write ${a[k]} at index ${k}.`, "merge");
      k++;
    }
    leave(id, `[${a.slice(lo, hi + 1).join(",")}]`);
    setRow(lo, hi, "done");
    push(`Merged into [${a.slice(lo, hi + 1).join(", ")}] with ${hi - lo + 1} writes; return the sorted slice to the parent.`, "return");
  };
  rec(0, n - 1, null);
  setRow(0, n - 1, "done");
  push(`Sorted after ${calls()} calls, with at most ${maxDepth()} frames on the stack: each level of the tree merges all ${n} elements, and there are ⌈log₂ ${n}⌉ levels of splitting, so O(n log n) total.`, "done");
  return f.done();
};

// ---- renderer ----

const NODE_H = 24;
const LEVEL_H = 54;
const PAD = 12;
const nodeW = (label: string) => Math.max(36, Math.min(180, label.length * 6.4 + 14));

function Tree({ nodes }: { nodes: RecNode[] }) {
  if (nodes.length === 0) return null;
  const byId = new Map<number, RecNode>();
  const children = new Map<number, number[]>();
  const roots: number[] = [];
  for (const n of nodes) {
    byId.set(n.id, n);
    if (n.parent === null) roots.push(n.id);
    else {
      const arr = children.get(n.parent);
      if (arr) arr.push(n.id);
      else children.set(n.parent, [n.id]);
    }
  }
  const leafW = Math.max(44, ...nodes.filter((n) => !children.has(n.id)).map((n) => nodeW(n.label) + 10));
  const pos = new Map<number, number>();
  let leaf = 0;
  let maxDepth = 0;
  const place = (id: number): number => {
    const kids = children.get(id) ?? [];
    const d = byId.get(id)!.depth;
    if (d > maxDepth) maxDepth = d;
    let x: number;
    if (kids.length === 0) {
      x = PAD + leaf * leafW + leafW / 2;
      leaf++;
    } else {
      const xs = kids.map(place);
      x = (xs[0]! + xs[xs.length - 1]!) / 2;
    }
    pos.set(id, x);
    return x;
  };
  for (const r of roots) place(r);
  const W = PAD * 2 + leaf * leafW;
  const H = PAD * 2 + (maxDepth + 1) * LEVEL_H;
  const top = (d: number) => PAD + d * LEVEL_H;
  return (
    <div className="max-h-[440px] w-full overflow-auto rounded-lg border border-line/60">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Call tree" style={{ display: "block" }}>
        {nodes.map((n) => {
          if (n.parent === null) return null;
          const live = n.tone === "active" || n.tone === "frontier";
          return <line key={`e${n.id}`} x1={pos.get(n.parent)} y1={top(n.depth - 1) + NODE_H} x2={pos.get(n.id)} y2={top(n.depth)} stroke={live ? "var(--accent)" : "var(--border)"} strokeWidth={live ? 2 : 1.2} />;
        })}
        {nodes.map((n) => {
          const w = nodeW(n.label);
          const cx = pos.get(n.id)!;
          const y = top(n.depth);
          const strong = n.tone !== "default" && n.tone !== "visited" && n.tone !== "muted";
          return (
            <g key={n.id}>
              <rect x={cx - w / 2} y={y} width={w} height={NODE_H} rx={6} fill={toneFill[n.tone]} stroke={toneStroke[n.tone]} strokeWidth={strong ? 2.5 : 1.5} />
              <text x={cx} y={y + NODE_H / 2 + 3.5} fontSize="10" textAnchor="middle" fill="var(--fg)" fontFamily="var(--font-mono)">
                {n.label}
              </text>
              {n.result !== undefined && n.result !== "" && (
                <text x={cx} y={y + NODE_H + 11} fontSize="9" textAnchor="middle" fill={n.tone === "danger" ? "var(--danger)" : "var(--success)"} fontFamily="var(--font-mono)" style={{ paintOrder: "stroke", stroke: "var(--bg-elev)", strokeWidth: 3 }}>
                  {`→ ${n.result}`}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function StackPanel({ stack }: { stack: string[] }) {
  return (
    <div className="shrink-0 sm:w-40">
      <div className="mb-1 text-[11px] text-muted">call stack (top first) · depth {stack.length}</div>
      <div className="flex flex-col gap-0.5">
        {stack.length === 0 && <div className="text-[11px] text-muted">empty</div>}
        {[...stack].reverse().map((fr, i) => (
          <div key={i} className={cn("truncate rounded border px-2 py-0.5 font-mono text-[11px]", i === 0 ? toneClass.active : toneClass.default)}>
            {fr}
          </div>
        ))}
      </div>
    </div>
  );
}

function Board({ board }: { board: NonNullable<RecState["board"]> }) {
  const C = board.cells[0]?.length ?? 0;
  return (
    <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `repeat(${C}, 2rem)` }}>
      {board.cells.map((row, r) =>
        row.map((v, c) => (
          <div key={key(r, c)} className={cn("flex h-8 w-8 items-center justify-center rounded border font-mono text-xs", toneClass[board.tones[key(r, c)] ?? "default"])}>
            {v ?? ""}
          </div>
        )),
      )}
    </div>
  );
}

function Pegs({ pegs }: { pegs: NonNullable<RecState["pegs"]> }) {
  const maxDisc = Math.max(1, ...pegs.discs.flat());
  const pegW = 16 + maxDisc * 12;
  return (
    <div className="flex items-end gap-4">
      {pegs.discs.map((discs, p) => (
        <div key={p} className="flex flex-col items-center gap-1">
          <div className="flex flex-col-reverse items-center justify-start gap-0.5 border-b-2 border-line" style={{ width: pegW, height: 10 + maxDisc * 12 }}>
            {discs.map((d) => (
              <div key={d} className="flex h-2.5 items-center justify-center rounded border border-accent bg-accent/40 text-[8px] leading-none" style={{ width: 12 + d * 12 }} />
            ))}
          </div>
          <div className="font-mono text-[10px] text-muted">{pegs.names[p]}</div>
        </div>
      ))}
    </div>
  );
}

function Renderer({ frame }: RendererProps<RecursionInput, RecState>) {
  const { state } = frame;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <Tree nodes={state.nodes} />
        </div>
        <StackPanel stack={state.stack} />
      </div>
      {state.rows.map((r, i) => (
        <div key={i}>
          {r.label && <div className="mb-1 text-[11px] text-muted">{r.label}</div>}
          <Cells values={r.values} tones={r.tones} labels={r.labels} pointers={r.pointers} size={r.values.length > 14 ? "sm" : "md"} />
        </div>
      ))}
      {state.board && <Board board={state.board} />}
      {state.pegs && <Pegs pegs={state.pegs} />}
      {state.results.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] text-muted">output ({state.results.length})</div>
          <div className="flex flex-wrap gap-1">
            {state.results.map((r, i) => (
              <span key={i} className={cn("rounded border px-1.5 py-0.5 font-mono text-[11px]", toneClass.done)}>
                {r}
              </span>
            ))}
          </div>
        </div>
      )}
      <Vars vars={state.vars} />
      <Legend items={[{ tone: "active", label: "current call" }, { tone: "frontier", label: "waiting on the stack" }, { tone: "visited", label: "returned" }, { tone: "done", label: "base case / solution" }, { tone: "danger", label: "pruned / dead end" }, { tone: "compare", label: "recomputed" }]} />
    </div>
  );
}

// ---- family ----

const pick = (raw: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (raw[k] !== undefined && raw[k] !== null) return raw[k];
  return undefined;
};
const asNum = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const asValues = (v: unknown): (number | string)[] | undefined => {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "number" || typeof x === "string").map((x) => (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)) ? Number(x) : x) as number | string).slice(0, 40);
  if (typeof v === "string") return [...v].slice(0, 40);
  return undefined;
};

export const recursionFamily: Family<RecursionInput, RecState> = {
  name: "Recursion",
  description: "Call trees that grow as calls happen, with the live stack, returned values, and backtracking over boards and grids.",
  Renderer,
  algorithms: {
    factorial,
    fibonacci,
    hanoi,
    permutations,
    subsets,
    combinations,
    "n-queens": nQueens,
    "binary-search-recursive": binarySearchRecursive,
    "merge-sort-tree": mergeSortTree,
    "flood-fill": floodFill,
  },
  labels: {
    factorial: "Factorial",
    fibonacci: "Fibonacci (naive recursion)",
    hanoi: "Towers of Hanoi",
    permutations: "Permutations",
    subsets: "Subsets (in / out)",
    combinations: "Combinations (choose k)",
    "n-queens": "N-queens backtracking",
    "binary-search-recursive": "Binary search (recursive)",
    "merge-sort-tree": "Merge sort recursion tree",
    "flood-fill": "Flood fill",
  },
  examples: {
    factorial: { n: 5 },
    fibonacci: { n: 5 },
    hanoi: { n: 3 },
    permutations: { values: [1, 2, 3] },
    subsets: { values: [1, 2, 3] },
    combinations: { values: [1, 2, 3, 4], k: 2 },
    "n-queens": { n: 4 },
    "binary-search-recursive": { values: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], target: 23 },
    "merge-sort-tree": { values: [38, 27, 43, 3, 9, 82, 10, 5] },
    "flood-fill": { grid: [[1, 1, 0, 0, 1], [1, 0, 0, 1, 1], [1, 1, 1, 0, 0], [0, 0, 1, 0, 1], [0, 1, 1, 0, 1]], start: [0, 0], color: 2 },
  },
  normalise: (raw) => {
    const grid = pick(raw, "grid", "image", "board", "matrix");
    const st = pick(raw, "start", "sr", "row");
    const startPair: [number, number] | undefined = Array.isArray(st) && st.length >= 2 ? [Number(st[0]) || 0, Number(st[1]) || 0] : typeof st === "number" ? [st, Number(pick(raw, "sc", "col", "c")) || 0] : undefined;
    return {
      n: asNum(pick(raw, "n", "discs", "disks", "size")),
      k: asNum(pick(raw, "k", "choose")),
      values: asValues(pick(raw, "values", "items", "nums", "elements", "array", "list")),
      target: asNum(pick(raw, "target", "key")),
      grid: Array.isArray(grid) && grid.every((r) => Array.isArray(r)) ? (grid as unknown[][]).slice(0, 6).map((r) => r.slice(0, 6).map((x) => (Number.isFinite(Number(x)) ? Number(x) : 0))) : undefined,
      start: startPair,
      color: asNum(pick(raw, "color", "colour", "newColor", "newColour", "fill")),
      base: asNum(raw.base),
      bases: Array.isArray(raw.bases) ? (raw.bases as unknown[]).map(asNum).filter((x): x is number => x !== undefined).slice(0, 2) : undefined,
      name: typeof raw.name === "string" ? raw.name : undefined,
      split: raw.split === "even-odd" ? "even-odd" : undefined,
    };
  },
};
