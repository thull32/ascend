// Dynamic programming: a 1-D row or a 2-D table filled bottom-up. Every
// frame highlights the cell being computed, the cells its transition reads,
// and states the transition with the actual numbers; the final frame walks
// the recorded choices back to reconstruct the answer.
import { Fragment } from "react";
import { Cells, Legend, Vars, toneClass, type Tone } from "../primitives";
import { Frames, type Family, type Frame, type RendererProps } from "../engine";
import { cn } from "../../lib/utils";

export interface DpInput {
  n?: number;
  values?: number[];
  coins?: number[];
  amount?: number;
  a?: string;
  b?: string;
  weights?: number[];
  capacity?: number;
  grid?: number[][];
  rows?: number;
  cols?: number;
  s?: string;
  words?: string[];
}

type Cell = string | number | null;

export interface DpRow {
  label?: string;
  values: Cell[];
  tones: (Tone | undefined)[];
  labels?: (string | number | null)[];
  pointers?: Record<string, number | undefined>;
  /** A DP row: filled cells are shown as "visited" between highlights. */
  dp?: boolean;
}

export interface DpTable {
  label?: string;
  cells: Cell[][];
  tones: Record<string, Tone>;
  rowLabels?: (string | number)[];
  colLabels?: (string | number)[];
  dp?: boolean;
}

export interface DpState {
  rows: DpRow[];
  tables: DpTable[];
  /** The transition for the current cell, with real numbers substituted. */
  formula?: string;
  vars: Record<string, unknown>;
}

type G = (input: DpInput) => Frame<DpState>[];

const key = (r: number, c: number) => `${r},${c}`;
const fmt = (v: number) => (v === Infinity ? "∞" : v === -Infinity ? "−∞" : String(v));
const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const nulls = (n: number): Cell[] => Array.from({ length: n }, () => null);
const grid2d = (r: number, c: number): Cell[][] => Array.from({ length: r }, () => nulls(c));

function make() {
  const s: DpState = { rows: [], tables: [], vars: {} };
  const f = new Frames<DpState>(() => ({
    rows: s.rows.map((r) => ({ ...r, values: [...r.values], tones: [...r.tones], labels: r.labels ? [...r.labels] : undefined, pointers: r.pointers ? { ...r.pointers } : undefined })),
    tables: s.tables.map((t) => ({ ...t, cells: t.cells.map((row) => [...row]), tones: { ...t.tones }, rowLabels: t.rowLabels ? [...t.rowLabels] : undefined, colLabels: t.colLabels ? [...t.colLabels] : undefined })),
    formula: s.formula,
    vars: { ...s.vars },
  }));
  const row = (label: string, values: Cell[], labels?: (string | number | null)[], dp = false): DpRow => {
    const r: DpRow = { label, values, tones: values.map(() => undefined), labels, dp };
    s.rows.push(r);
    return r;
  };
  const table = (label: string, cells: Cell[][], rowLabels?: (string | number)[], colLabels?: (string | number)[], dp = false): DpTable => {
    const t: DpTable = { label, cells, tones: {}, rowLabels, colLabels, dp };
    s.tables.push(t);
    return t;
  };
  /** Reset tones: filled DP cells become "visited", everything else default. */
  const base = () => {
    for (const r of s.rows) r.tones = r.values.map((v) => (r.dp && v !== null ? "visited" : undefined));
    for (const t of s.tables) {
      t.tones = {};
      if (t.dp) t.cells.forEach((cellsRow, ri) => cellsRow.forEach((v, ci) => { if (v !== null) t.tones[key(ri, ci)] = "visited"; }));
    }
  };
  const problem = (msg: string) => {
    s.formula = undefined;
    f.push(msg, "input");
    return f.done();
  };
  return { s, f, row, table, base, problem };
}

// ---- 1-D rows ----

const linearRecurrence = (kind: "fibonacci" | "climbing-stairs"): G => ({ n }) => {
  const N = clampInt(n, 0, 30, kind === "fibonacci" ? 8 : 7);
  const { s, f, row, base } = make();
  const isFib = kind === "fibonacci";
  const dp = row(isFib ? "dp[i] = F(i)" : "dp[i] = ways to reach step i", nulls(N + 1), undefined, true);
  s.vars = { n: N };
  f.push(isFib ? `Bottom-up Fibonacci: fill dp[0..${N}] left to right so both cells a transition reads already exist.` : `Climbing ${N} stairs taking 1 or 2 steps: the last move came from step i−1 or i−2, so dp[i] = dp[i−1] + dp[i−2].`);
  dp.values[0] = isFib ? 0 : 1;
  base();
  dp.tones[0] = "active";
  s.formula = `dp[0] = ${dp.values[0]}`;
  f.push(isFib ? "Base case dp[0] = 0." : "Base case dp[0] = 1: there is one way to stand at the bottom (do nothing).", "base");
  if (N >= 1) {
    dp.values[1] = 1;
    base();
    dp.tones[1] = "active";
    s.formula = "dp[1] = 1";
    f.push(isFib ? "Base case dp[1] = 1." : "Base case dp[1] = 1: a single 1-step.", "base");
  }
  for (let i = 2; i <= N && !f.full; i++) {
    const a = dp.values[i - 1] as number;
    const b = dp.values[i - 2] as number;
    dp.values[i] = a + b;
    base();
    dp.tones[i] = "active";
    dp.tones[i - 1] = "compare";
    dp.tones[i - 2] = "compare";
    s.formula = `dp[${i}] = dp[${i - 1}] + dp[${i - 2}] = ${a} + ${b} = ${a + b}`;
    f.push(`dp[${i}] = dp[${i - 1}] + dp[${i - 2}] = ${a} + ${b} = ${a + b}; both cells it reads were filled in earlier steps.`, "fill");
  }
  base();
  dp.tones[N] = "done";
  const ans = dp.values[N];
  s.formula = isFib ? `F(${N}) = ${ans}` : `ways(${N}) = ${ans}`;
  s.vars = { n: N, answer: ans };
  f.push(isFib ? `F(${N}) = ${ans}. Each cell is computed once from two neighbours: O(n) time, and since only the last two cells are ever read, O(1) space suffices.` : `${ans} ways to climb ${N} stairs. O(n) time; keeping only the last two cells makes it O(1) space. It is the Fibonacci sequence shifted by one.`, "done");
  return f.done();
};

const coinChange: G = ({ coins, amount }) => {
  const cs = [...new Set((coins ?? [1, 3, 4]).map((c) => Math.floor(c)).filter((c) => c > 0))].sort((a, b) => a - b).slice(0, 8);
  const A = clampInt(amount, 0, 30, 6);
  const { s, f, row, base, problem } = make();
  if (cs.length === 0) return problem("Coin change needs at least one positive coin denomination (coins: [1, 3, 4]).");
  const coinRow = row("coins", cs, cs.map(() => ""));
  const dp = row("dp[a] = fewest coins that make amount a", nulls(A + 1), undefined, true);
  const val: number[] = [0];
  const choice: number[] = [0];
  s.vars = { amount: A };
  f.push(`Minimum coins for ${A} with {${cs.join(", ")}}: dp[a] = 1 + min over coins c ≤ a of dp[a − c], filled from 0 upwards.`);
  dp.values[0] = 0;
  base();
  dp.tones[0] = "active";
  s.formula = "dp[0] = 0";
  f.push("Base case dp[0] = 0: amount 0 needs no coins.", "base");
  for (let a = 1; a <= A && !f.full; a++) {
    let best = Infinity;
    let via = -1;
    const parts: string[] = [];
    base();
    dp.tones[a] = "active";
    for (let ci = 0; ci < cs.length; ci++) {
      const c = cs[ci]!;
      if (c > a) continue;
      const d = val[a - c]!;
      parts.push(`dp[${a - c}] = ${fmt(d)}`);
      dp.tones[a - c] = "compare";
      coinRow.tones[ci] = "compare";
      if (d + 1 < best) {
        best = d + 1;
        via = c;
      }
    }
    val[a] = best;
    choice[a] = via;
    dp.values[a] = fmt(best);
    if (via >= 0) coinRow.tones[cs.indexOf(via)] = "done";
    if (parts.length === 0) {
      s.formula = `dp[${a}] = ∞`;
      f.push(`Every coin is larger than ${a}, so nothing can be read: dp[${a}] = ∞ (unreachable).`, "fill");
    } else if (best === Infinity) {
      s.formula = `dp[${a}] = 1 + min(${parts.join(", ")}) = ∞`;
      f.push(`dp[${a}] = 1 + min(${parts.join(", ")}) = ∞: every smaller amount a coin could lead to is itself unreachable.`, "fill");
    } else {
      s.formula = `dp[${a}] = 1 + min(${parts.join(", ")}) = ${best}  (coin ${via})`;
      f.push(`dp[${a}] = 1 + min(${parts.join(", ")}) = ${best}: the best option is coin ${via} on top of dp[${a - via}] = ${val[a - via]}.`, "fill");
    }
  }
  base();
  if (val[A] === Infinity) {
    dp.tones[A] = "danger";
    s.formula = `dp[${A}] = ∞`;
    s.vars = { amount: A, answer: -1 };
    f.push(`dp[${A}] = ∞: amount ${A} cannot be made from {${cs.join(", ")}}, so the answer is −1. O(amount × coins) time.`, "done");
    return f.done();
  }
  const used: number[] = [];
  for (let a = A; a > 0; a -= choice[a]!) {
    used.push(choice[a]!);
    dp.tones[a] = "path";
  }
  dp.tones[0] = "path";
  dp.tones[A] = "done";
  for (const c of used) coinRow.tones[cs.indexOf(c)] = "done";
  s.formula = `dp[${A}] = ${val[A]}: ${used.join(" + ")} = ${A}`;
  s.vars = { amount: A, answer: val[A], coinsUsed: used };
  f.push(`Fewest coins for ${A} is ${val[A]}: ${used.join(" + ")}. Following the recorded choice from ${A} back to 0 reconstructs it. O(amount × coins) time, O(amount) space.`, "done");
  return f.done();
};

const houseRobber: G = ({ values }) => {
  const v = (values ?? [2, 7, 9, 3, 1]).slice(0, 20);
  const n = v.length;
  const { s, f, row, base, problem } = make();
  if (n === 0) return problem("House robber needs a list of house values (values: [2, 7, 9, 3, 1]).");
  const hv = row("house value", v, range(n));
  const dp = row("dp[i] = best loot from houses 0..i", nulls(n), undefined, true);
  const d: number[] = [];
  f.push(`Rob non-adjacent houses for maximum loot: dp[i] = max(skip house i → dp[i−1], rob it → dp[i−2] + value[i]).`);
  d[0] = v[0]!;
  dp.values[0] = d[0];
  base();
  dp.tones[0] = "active";
  hv.tones[0] = "compare";
  s.formula = `dp[0] = value[0] = ${d[0]}`;
  f.push(`Base case dp[0] = ${d[0]}: with one house, rob it.`, "base");
  if (n >= 2) {
    d[1] = Math.max(v[0]!, v[1]!);
    dp.values[1] = d[1];
    base();
    dp.tones[1] = "active";
    dp.tones[0] = "compare";
    hv.tones[1] = "compare";
    s.formula = `dp[1] = max(value[0], value[1]) = max(${v[0]}, ${v[1]}) = ${d[1]}`;
    f.push(`Base case dp[1] = max(${v[0]}, ${v[1]}) = ${d[1]}: two adjacent houses, take the better one.`, "base");
  }
  for (let i = 2; i < n && !f.full; i++) {
    const skip = d[i - 1]!;
    const take = d[i - 2]! + v[i]!;
    d[i] = Math.max(skip, take);
    dp.values[i] = d[i];
    base();
    dp.tones[i] = "active";
    dp.tones[i - 1] = "compare";
    dp.tones[i - 2] = "compare";
    hv.tones[i] = "compare";
    s.formula = `dp[${i}] = max(dp[${i - 1}], dp[${i - 2}] + value[${i}]) = max(${skip}, ${d[i - 2]} + ${v[i]}) = ${d[i]}`;
    f.push(take > skip ? `Rob house ${i}: ${d[i - 2]} + ${v[i]} = ${take} beats skipping it (${skip}), so dp[${i}] = ${take}.` : `Skip house ${i}: robbing it gives ${d[i - 2]} + ${v[i]} = ${take}, no better than dp[${i - 1}] = ${skip}, so dp[${i}] = ${skip}.`, take > skip ? "rob" : "skip");
  }
  const robbed: number[] = [];
  for (let i = n - 1; i >= 0; ) {
    if (i === 0) {
      robbed.push(0);
      break;
    }
    if (d[i] === d[i - 1]) i--;
    else {
      robbed.push(i);
      i -= 2;
    }
  }
  robbed.reverse();
  base();
  dp.tones[n - 1] = "done";
  for (const i of robbed) hv.tones[i] = "done";
  s.formula = `dp[${n - 1}] = ${d[n - 1]} = ${robbed.map((i) => v[i]).join(" + ")}`;
  s.vars = { answer: d[n - 1], houses: robbed };
  f.push(`Best loot ${d[n - 1]} by robbing houses [${robbed.join(", ")}] (${robbed.map((i) => v[i]).join(" + ")}); walking back, an unchanged cell means "skipped". O(n) time, O(1) space with two variables.`, "done");
  return f.done();
};

const lis: G = ({ values }) => {
  const v = (values ?? [10, 9, 2, 5, 3, 7, 101, 18]).slice(0, 12);
  const n = v.length;
  const { s, f, row, base, problem } = make();
  if (n === 0) return problem("LIS needs a list of values (values: [10, 9, 2, 5, 3, 7, 101, 18]).");
  const vr = row("values", v, range(n));
  const dp = row("dp[i] = length of the longest increasing subsequence ending at i", nulls(n), undefined, true);
  const d: number[] = [];
  const prev: number[] = [];
  f.push(`LIS in O(n²): dp[i] = 1 + max dp[j] over j < i with values[j] < values[i]; every cell scans everything to its left.`);
  for (let i = 0; i < n && !f.full; i++) {
    d[i] = 1;
    prev[i] = -1;
    dp.values[i] = 1;
    base();
    dp.tones[i] = "active";
    vr.tones[i] = "active";
    s.formula = `dp[${i}] = 1`;
    f.push(`dp[${i}] starts at 1: ${v[i]} on its own is an increasing subsequence of length 1.`, "init");
    for (let j = 0; j < i && !f.full; j++) {
      base();
      dp.tones[i] = "active";
      vr.tones[i] = "active";
      dp.tones[j] = "compare";
      vr.tones[j] = "compare";
      vr.pointers = { j, i };
      if (v[j]! < v[i]!) {
        if (d[j]! + 1 > d[i]!) {
          const old = d[i]!;
          d[i] = d[j]! + 1;
          prev[i] = j;
          dp.values[i] = d[i];
          s.formula = `dp[${i}] = max(dp[${i}], dp[${j}] + 1) = max(${old}, ${d[j]} + 1) = ${d[i]}`;
          f.push(`values[${j}] = ${v[j]} < ${v[i]} and dp[${j}] + 1 = ${d[j]! + 1} > ${old}: extend the subsequence ending at ${j}, dp[${i}] = ${d[i]}.`, "extend");
        } else {
          s.formula = `dp[${i}] = max(dp[${i}], dp[${j}] + 1) = max(${d[i]}, ${d[j]} + 1) = ${d[i]}`;
          f.push(`values[${j}] = ${v[j]} < ${v[i]} but dp[${j}] + 1 = ${d[j]! + 1} is no better than the current ${d[i]}.`, "compare");
        }
      } else {
        s.formula = `values[${j}] = ${v[j]} ≥ ${v[i]}: dp[${j}] cannot be extended`;
        f.push(`values[${j}] = ${v[j]} ≥ ${v[i]}: it cannot come before ${v[i]} in an increasing subsequence, skip.`, "compare");
      }
    }
    vr.pointers = undefined;
  }
  let best = 0;
  for (let i = 1; i < n; i++) if (d[i]! > d[best]!) best = i;
  const seq: number[] = [];
  base();
  for (let i = best; i >= 0; i = prev[i]!) {
    seq.unshift(i);
    dp.tones[i] = "path";
    vr.tones[i] = "done";
  }
  dp.tones[best] = "done";
  s.formula = `max(dp) = dp[${best}] = ${d[best]}`;
  s.vars = { answer: d[best], subsequence: seq.map((i) => v[i]) };
  f.push(`LIS length ${d[best]}: [${seq.map((i) => v[i]).join(", ")}], reconstructed by following prev from the maximum cell (index ${best}), not the last one. O(n²) time; patience sorting gets O(n log n).`, "done");
  return f.done();
};

const maxSubarray: G = ({ values }) => {
  const v = (values ?? [-2, 1, -3, 4, -1, 2, 1, -5, 4]).slice(0, 20);
  const n = v.length;
  const { s, f, row, base, problem } = make();
  if (n === 0) return problem("Maximum subarray needs a list of values (values: [-2, 1, -3, 4, -1, 2, 1, -5, 4]).");
  const vr = row("values", v, range(n));
  const dp = row("dp[i] = best sum of a subarray ending at i", nulls(n), undefined, true);
  const d: number[] = [];
  const start: number[] = [];
  f.push(`Kadane as a DP table: dp[i] = values[i] + max(dp[i−1], 0). A subarray ending at i either extends the best one ending at i−1 or starts fresh.`);
  d[0] = v[0]!;
  start[0] = 0;
  dp.values[0] = d[0];
  base();
  dp.tones[0] = "active";
  vr.tones[0] = "compare";
  s.formula = `dp[0] = values[0] = ${d[0]}`;
  f.push(`Base case dp[0] = ${d[0]}: the only subarray ending at 0 is [${v[0]}].`, "base");
  let best = 0;
  for (let i = 1; i < n && !f.full; i++) {
    const prev = d[i - 1]!;
    const extend = prev > 0;
    d[i] = v[i]! + Math.max(prev, 0);
    start[i] = extend ? start[i - 1]! : i;
    dp.values[i] = d[i];
    if (d[i]! > d[best]!) best = i;
    base();
    dp.tones[i] = "active";
    dp.tones[i - 1] = "compare";
    vr.tones[i] = "compare";
    s.formula = `dp[${i}] = values[${i}] + max(dp[${i - 1}], 0) = ${v[i]} + max(${prev}, 0) = ${d[i]}`;
    f.push(extend ? `dp[${i - 1}] = ${prev} > 0 helps, so extend: dp[${i}] = ${v[i]} + ${prev} = ${d[i]}. Best so far ${d[best]}.` : `dp[${i - 1}] = ${prev} ≤ 0 would only drag ${v[i]} down, so start fresh: dp[${i}] = ${v[i]}. Best so far ${d[best]}.`, extend ? "extend" : "restart");
  }
  base();
  for (let i = start[best]!; i <= best; i++) vr.tones[i] = "done";
  dp.tones[best] = "done";
  s.formula = `max(dp) = dp[${best}] = ${d[best]}`;
  s.vars = { answer: d[best], range: [start[best], best] };
  f.push(`Maximum subarray sum ${d[best]} over [${start[best]}, ${best}] = [${v.slice(start[best], best + 1).join(", ")}]. The answer is the maximum cell, not the last. O(n) time, O(1) space.`, "done");
  return f.done();
};

const wordBreak: G = ({ s: str0, a, words: words0 }) => {
  const str = (str0 ?? a ?? "catsanddog").slice(0, 20);
  const words = [...new Set((words0 ?? ["cat", "cats", "and", "sand", "dog"]).filter((w) => w.length > 0))].slice(0, 12);
  const n = str.length;
  const { s, f, row, base, problem } = make();
  if (n === 0) return problem('Word break needs a non-empty string (s: "catsanddog") and a dictionary (words: ["cat", "sand", "dog"]).');
  if (words.length === 0) return problem('Word break needs a non-empty dictionary (words: ["cat", "sand", "dog"]).');
  const chars = row("s", [...str], range(n));
  const dp = row("dp[i] = the prefix s[0..i) can be segmented", nulls(n + 1), range(n + 1), true);
  const via: number[] = [];
  s.vars = { dict: words };
  f.push(`Word break: dp[i] is true when some dictionary word ends exactly at i and the prefix before that word is itself breakable.`);
  dp.values[0] = "T";
  base();
  dp.tones[0] = "active";
  s.formula = "dp[0] = T";
  f.push("Base case dp[0] = T: the empty prefix is trivially segmentable.", "base");
  for (let i = 1; i <= n && !f.full; i++) {
    const matches = words.filter((w) => w.length <= i && str.slice(i - w.length, i) === w);
    const found = matches.find((w) => dp.values[i - w.length] === "T");
    base();
    dp.tones[i] = "active";
    if (found) {
      const j = i - found.length;
      via[i] = j;
      dp.values[i] = "T";
      for (let k = j; k < i; k++) chars.tones[k] = "compare";
      dp.tones[j] = "compare";
      s.formula = `dp[${i}] = dp[${j}] ∧ ("${found}" ∈ dict) = T ∧ T = T`;
      f.push(`"${found}" ends at ${i} and dp[${j}] = T (the prefix "${str.slice(0, j)}" is breakable), so dp[${i}] = T.`, "true");
    } else if (matches.length > 0) {
      dp.values[i] = "F";
      const w0 = matches[0]!;
      for (let k = i - w0.length; k < i; k++) chars.tones[k] = "compare";
      for (const w of matches) dp.tones[i - w.length] = "compare";
      s.formula = `dp[${i}] = ${matches.map((w) => `dp[${i - w.length}] ∧ "${w}"`).join(" ∨ ")} = F`;
      f.push(`${matches.map((w) => `"${w}" ends at ${i} but dp[${i - w.length}] = F`).join("; ")}: no breakable prefix precedes a word, so dp[${i}] = F.`, "false");
    } else {
      dp.values[i] = "F";
      s.formula = `dp[${i}] = F (no word ends at ${i})`;
      f.push(`No dictionary word ends at index ${i} (prefix "${str.slice(0, i)}"), so dp[${i}] = F.`, "false");
    }
  }
  base();
  if (dp.values[n] !== "T") {
    dp.tones[n] = "danger";
    s.formula = `dp[${n}] = F`;
    s.vars = { dict: words, answer: false };
    f.push(`dp[${n}] = F: "${str}" cannot be segmented into words from {${words.join(", ")}}. O(n · |dict| · L) time with the substring compare.`, "done");
    return f.done();
  }
  const parts: string[] = [];
  let alt = 0;
  for (let i = n; i > 0; ) {
    const j = via[i]!;
    parts.unshift(str.slice(j, i));
    for (let k = j; k < i; k++) chars.tones[k] = alt % 2 === 0 ? "done" : "path";
    dp.tones[i] = "path";
    alt++;
    i = j;
  }
  dp.tones[n] = "done";
  s.formula = `dp[${n}] = T: "${str}" = ${parts.join(" | ")}`;
  s.vars = { dict: words, answer: true, split: parts };
  f.push(`dp[${n}] = T: "${str}" = ${parts.join(" | ")}, reconstructed by following the recorded split points back to 0. O(n · |dict| · L) time.`, "done");
  return f.done();
};

// ---- 2-D tables ----

const lcs: G = ({ a, b }) => {
  const A = (a ?? "abcde").slice(0, 12);
  const B = (b ?? "ace").slice(0, 12);
  const m = A.length;
  const n = B.length;
  const { s, f, table, base } = make();
  const t = table("dp[i][j] = LCS length of a[0..i) and b[0..j)", grid2d(m + 1, n + 1), ["∅", ...A], ["∅", ...B], true);
  const d = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  s.vars = { a: A, b: B };
  f.push(`LCS of "${A}" and "${B}": rows are prefixes of a, columns prefixes of b. A match extends the diagonal; a mismatch takes the better of dropping a character from either string.`);
  for (let i = 0; i <= m; i++) t.cells[i]![0] = 0;
  for (let j = 0; j <= n; j++) t.cells[0]![j] = 0;
  base();
  for (let i = 0; i <= m; i++) t.tones[key(i, 0)] = "active";
  for (let j = 0; j <= n; j++) t.tones[key(0, j)] = "active";
  s.formula = "dp[0][j] = dp[i][0] = 0";
  f.push("Base cases: an empty prefix shares nothing with anything, so row 0 and column 0 are 0.", "base");
  for (let i = 1; i <= m && !f.full; i++)
    for (let j = 1; j <= n && !f.full; j++) {
      base();
      t.tones[key(i, j)] = "active";
      if (A[i - 1] === B[j - 1]) {
        d[i]![j] = d[i - 1]![j - 1]! + 1;
        t.cells[i]![j] = d[i]![j]!;
        t.tones[key(i - 1, j - 1)] = "compare";
        s.formula = `dp[${i}][${j}] = dp[${i - 1}][${j - 1}] + 1 = ${d[i - 1]![j - 1]} + 1 = ${d[i]![j]}`;
        f.push(`a[${i - 1}] = b[${j - 1}] = '${A[i - 1]}': a match extends the diagonal, dp[${i}][${j}] = ${d[i - 1]![j - 1]} + 1 = ${d[i]![j]}.`, "match");
      } else {
        const up = d[i - 1]![j]!;
        const left = d[i]![j - 1]!;
        d[i]![j] = Math.max(up, left);
        t.cells[i]![j] = d[i]![j]!;
        t.tones[key(i - 1, j)] = "compare";
        t.tones[key(i, j - 1)] = "compare";
        s.formula = `dp[${i}][${j}] = max(dp[${i - 1}][${j}], dp[${i}][${j - 1}]) = max(${up}, ${left}) = ${d[i]![j]}`;
        f.push(`'${A[i - 1]}' ≠ '${B[j - 1]}': drop one character from either string, dp[${i}][${j}] = max(up ${up}, left ${left}) = ${d[i]![j]}.`, "mismatch");
      }
    }
  base();
  const seq: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (A[i - 1] === B[j - 1]) {
      t.tones[key(i, j)] = "done";
      seq.unshift(A[i - 1]!);
      i--;
      j--;
    } else {
      t.tones[key(i, j)] = "path";
      if (d[i - 1]![j]! >= d[i]![j - 1]!) i--;
      else j--;
    }
  }
  s.formula = `dp[${m}][${n}] = ${d[m]![n]}: "${seq.join("")}"`;
  s.vars = { a: A, b: B, answer: d[m]![n], lcs: seq.join("") };
  f.push(`LCS length ${d[m]![n]}: "${seq.join("")}". Walk back from dp[${m}][${n}]: a diagonal step on a match emits a character; on a mismatch move toward the larger neighbour. O(m·n) time and space.`, "done");
  return f.done();
};

const editDistance: G = ({ a, b }) => {
  const A = (a ?? "kitten").slice(0, 12);
  const B = (b ?? "sitting").slice(0, 12);
  const m = A.length;
  const n = B.length;
  const { s, f, table, base } = make();
  const t = table("dp[i][j] = edits to turn a[0..i) into b[0..j)", grid2d(m + 1, n + 1), ["∅", ...A], ["∅", ...B], true);
  const d = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  s.vars = { a: A, b: B };
  f.push(`Edit distance "${A}" → "${B}": each interior cell reads three neighbours: diagonal (substitute or match), up (delete from a), left (insert from b).`);
  for (let i = 0; i <= m; i++) {
    d[i]![0] = i;
    t.cells[i]![0] = i;
  }
  for (let j = 0; j <= n; j++) {
    d[0]![j] = j;
    t.cells[0]![j] = j;
  }
  base();
  for (let i = 0; i <= m; i++) t.tones[key(i, 0)] = "active";
  for (let j = 0; j <= n; j++) t.tones[key(0, j)] = "active";
  s.formula = "dp[i][0] = i (delete all),  dp[0][j] = j (insert all)";
  f.push("Base cases: turning a prefix into the empty string takes i deletions, and the empty string into a prefix takes j insertions. The border is i and j, not 0.", "base");
  for (let i = 1; i <= m && !f.full; i++)
    for (let j = 1; j <= n && !f.full; j++) {
      base();
      t.tones[key(i, j)] = "active";
      const diag = d[i - 1]![j - 1]!;
      const up = d[i - 1]![j]!;
      const left = d[i]![j - 1]!;
      if (A[i - 1] === B[j - 1]) {
        d[i]![j] = diag;
        t.cells[i]![j] = diag;
        t.tones[key(i - 1, j - 1)] = "compare";
        s.formula = `dp[${i}][${j}] = dp[${i - 1}][${j - 1}] = ${diag}  (match '${A[i - 1]}')`;
        f.push(`a[${i - 1}] = b[${j - 1}] = '${A[i - 1]}': no edit needed, copy the diagonal: dp[${i}][${j}] = ${diag}.`, "match");
      } else {
        const v = 1 + Math.min(diag, up, left);
        d[i]![j] = v;
        t.cells[i]![j] = v;
        t.tones[key(i - 1, j - 1)] = "compare";
        t.tones[key(i - 1, j)] = "compare";
        t.tones[key(i, j - 1)] = "compare";
        const op = diag <= up && diag <= left ? `substitute '${A[i - 1]}'→'${B[j - 1]}'` : up <= left ? `delete '${A[i - 1]}'` : `insert '${B[j - 1]}'`;
        s.formula = `dp[${i}][${j}] = 1 + min(diag ${diag}, up ${up}, left ${left}) = ${v}`;
        f.push(`'${A[i - 1]}' ≠ '${B[j - 1]}': dp[${i}][${j}] = 1 + min(substitute ${diag}, delete ${up}, insert ${left}) = ${v}; cheapest is to ${op}.`, "edit");
      }
    }
  base();
  const ops: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && A[i - 1] === B[j - 1] && d[i]![j] === d[i - 1]![j - 1]) {
      t.tones[key(i, j)] = "done";
      i--;
      j--;
    } else if (i > 0 && j > 0 && d[i]![j] === d[i - 1]![j - 1]! + 1) {
      t.tones[key(i, j)] = "path";
      ops.unshift(`sub '${A[i - 1]}'→'${B[j - 1]}'`);
      i--;
      j--;
    } else if (i > 0 && d[i]![j] === d[i - 1]![j]! + 1) {
      t.tones[key(i, j)] = "path";
      ops.unshift(`del '${A[i - 1]}'`);
      i--;
    } else {
      t.tones[key(i, j)] = "path";
      ops.unshift(`ins '${B[j - 1]}'`);
      j--;
    }
  }
  t.tones[key(m, n)] = "done";
  s.formula = `dp[${m}][${n}] = ${d[m]![n]}`;
  s.vars = { a: A, b: B, answer: d[m]![n], edits: ops };
  f.push(`Edit distance ${d[m]![n]}${ops.length ? `: ${ops.join(", ")}` : ""}. Walking back from dp[${m}][${n}] recovers the edits (diagonal on a match costs nothing). O(m·n) time; two rows suffice for space.`, "done");
  return f.done();
};

const knapsack01: G = ({ weights, values, capacity }) => {
  const ws0 = weights ?? [1, 3, 4, 5];
  const vs0 = values ?? [1, 4, 5, 7];
  const n = Math.min(ws0.length, vs0.length, 6);
  const ws = ws0.slice(0, n).map((w) => Math.max(0, Math.floor(w)));
  const vs = vs0.slice(0, n);
  const W = clampInt(capacity, 0, 15, 7);
  const { s, f, row, table, base, problem } = make();
  if (n === 0) return problem("0/1 knapsack needs parallel weights and values lists (weights: [1, 3, 4, 5], values: [1, 4, 5, 7]) and a capacity.");
  const itemLabels = range(n).map((i) => `item ${i + 1}`);
  const wr = row("weight", ws, itemLabels);
  const vr = row("value", vs, itemLabels);
  const t = table("dp[i][c] = best value using items 1..i within capacity c", grid2d(n + 1, W + 1), ["no items", ...range(n).map((i) => `item ${i + 1}`)], range(W + 1), true);
  const d = Array.from({ length: n + 1 }, () => new Array<number>(W + 1).fill(0));
  s.vars = { capacity: W };
  f.push(`0/1 knapsack, capacity ${W}: row i decides item i once. dp[i][c] = max(skip → dp[i−1][c], take → value + dp[i−1][c − weight]); "take" always reads the previous row, so each item counts at most once.`);
  for (let c = 0; c <= W; c++) t.cells[0]![c] = 0;
  base();
  for (let c = 0; c <= W; c++) t.tones[key(0, c)] = "active";
  s.formula = "dp[0][c] = 0";
  f.push("Base case: with no items the best value is 0 at every capacity.", "base");
  for (let i = 1; i <= n && !f.full; i++)
    for (let c = 0; c <= W && !f.full; c++) {
      const w = ws[i - 1]!;
      const v = vs[i - 1]!;
      const skip = d[i - 1]![c]!;
      base();
      t.tones[key(i, c)] = "active";
      t.tones[key(i - 1, c)] = "compare";
      wr.tones[i - 1] = "compare";
      vr.tones[i - 1] = "compare";
      if (w <= c) {
        const take = d[i - 1]![c - w]! + v;
        t.tones[key(i - 1, c - w)] = "compare";
        d[i]![c] = Math.max(skip, take);
        t.cells[i]![c] = d[i]![c]!;
        s.formula = `dp[${i}][${c}] = max(dp[${i - 1}][${c}], ${v} + dp[${i - 1}][${c - w}]) = max(${skip}, ${v} + ${d[i - 1]![c - w]}) = ${d[i]![c]}`;
        f.push(take > skip ? `Item ${i} (w=${w}, v=${v}) fits in ${c}: taking it gives ${v} + dp[${i - 1}][${c - w}] = ${take} > skip ${skip}, so dp[${i}][${c}] = ${take}.` : `Item ${i} (w=${w}, v=${v}) fits in ${c} but taking it gives ${v} + ${d[i - 1]![c - w]} = ${take}, no better than skipping (${skip}): dp[${i}][${c}] = ${skip}.`, take > skip ? "take" : "skip");
      } else {
        d[i]![c] = skip;
        t.cells[i]![c] = skip;
        s.formula = `dp[${i}][${c}] = dp[${i - 1}][${c}] = ${skip}  (weight ${w} > ${c})`;
        f.push(`Item ${i} weighs ${w} > capacity ${c}, so it cannot be taken: copy dp[${i - 1}][${c}] = ${skip}.`, "skip");
      }
    }
  base();
  const taken: number[] = [];
  let c = W;
  for (let i = n; i >= 1; i--) {
    if (d[i]![c] !== d[i - 1]![c]) {
      taken.unshift(i);
      t.tones[key(i, c)] = "done";
      c -= ws[i - 1]!;
      wr.tones[i - 1] = "done";
      vr.tones[i - 1] = "done";
    } else t.tones[key(i, c)] = "path";
  }
  t.tones[key(n, W)] = "done";
  const totalW = taken.reduce((acc, i) => acc + ws[i - 1]!, 0);
  s.formula = `dp[${n}][${W}] = ${d[n]![W]} = ${taken.map((i) => vs[i - 1]).join(" + ") || "0"}`;
  s.vars = { capacity: W, answer: d[n]![W], items: taken, weightUsed: totalW };
  f.push(`Best value ${d[n]![W]} with items {${taken.join(", ")}} (weight ${totalW} ≤ ${W}). Walk up from dp[${n}][${W}]: a change from the row above means the item was taken, then subtract its weight. O(n·W) pseudo-polynomial time.`, "done");
  return f.done();
};

function gridOf(input: DpInput, dfltR: number, dfltC: number): number[][] {
  if (input.grid && input.grid.length > 0 && input.grid.every((r) => Array.isArray(r) && r.length > 0)) {
    const C = Math.min(...input.grid.map((r) => r.length));
    return input.grid.map((r) => r.slice(0, C));
  }
  const R = clampInt(input.rows, 1, 8, dfltR);
  const C = clampInt(input.cols, 1, 8, dfltC);
  return Array.from({ length: R }, () => new Array<number>(C).fill(0));
}

const binom = (n: number, k: number) => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
};

const uniquePaths: G = (input) => {
  const g = gridOf(input, 3, 4);
  const R = g.length;
  const C = g[0]!.length;
  const { s, f, table, base } = make();
  const obstacles = g.flat().some((v) => v === 1);
  const t = table("dp[r][c] = number of paths from (0, 0) to (r, c)", grid2d(R, C), range(R), range(C), true);
  const d = Array.from({ length: R }, () => new Array<number>(C).fill(0));
  const mark = () => {
    base();
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (g[r]![c] === 1) t.tones[key(r, c)] = "danger";
  };
  s.vars = { rows: R, cols: C };
  f.push(`Unique paths on a ${R}×${C} grid moving only right or down: a cell is reached from above or from the left, so dp[r][c] = dp[r−1][c] + dp[r][c−1].${obstacles ? " Obstacles (1) contribute 0." : ""}`);
  for (let r = 0; r < R && !f.full; r++)
    for (let c = 0; c < C && !f.full; c++) {
      mark();
      t.tones[key(r, c)] = "active";
      if (g[r]![c] === 1) {
        d[r]![c] = 0;
        t.cells[r]![c] = 0;
        s.formula = `dp[${r}][${c}] = 0 (obstacle)`;
        f.push(`(${r}, ${c}) is an obstacle: no path passes through it, dp = 0.`, "obstacle");
        continue;
      }
      if (r === 0 && c === 0) {
        d[0]![0] = 1;
        t.cells[0]![0] = 1;
        s.formula = "dp[0][0] = 1";
        f.push("Base case dp[0][0] = 1: exactly one way to be at the start.", "base");
        continue;
      }
      const up = r > 0 ? d[r - 1]![c]! : 0;
      const left = c > 0 ? d[r]![c - 1]! : 0;
      d[r]![c] = up + left;
      t.cells[r]![c] = d[r]![c]!;
      const parts: string[] = [];
      if (r > 0) {
        t.tones[key(r - 1, c)] = "compare";
        parts.push(`dp[${r - 1}][${c}] = ${up}`);
      }
      if (c > 0) {
        t.tones[key(r, c - 1)] = "compare";
        parts.push(`dp[${r}][${c - 1}] = ${left}`);
      }
      s.formula = `dp[${r}][${c}] = ${r > 0 ? `dp[${r - 1}][${c}]` : "0"} + ${c > 0 ? `dp[${r}][${c - 1}]` : "0"} = ${up} + ${left} = ${d[r]![c]}`;
      f.push(r === 0 || c === 0 ? `Edge cell (${r}, ${c}): only one neighbour exists (${parts[0]}), so dp = ${d[r]![c]}.` : `dp[${r}][${c}] = above + left = ${up} + ${left} = ${d[r]![c]}: every path arrives from one of those two cells.`, "fill");
    }
  mark();
  t.tones[key(R - 1, C - 1)] = "done";
  const ans = d[R - 1]![C - 1]!;
  s.formula = `dp[${R - 1}][${C - 1}] = ${ans}`;
  s.vars = { rows: R, cols: C, answer: ans };
  f.push(`${ans} unique path(s) to (${R - 1}, ${C - 1}).${obstacles ? "" : ` Without obstacles this is C(${R + C - 2}, ${R - 1}) = ${binom(R + C - 2, R - 1)}: choose which of the ${R + C - 2} moves go down.`} O(R·C) time; one rolling row suffices for space.`, "done");
  return f.done();
};

const minPathSum: G = (input) => {
  const g = gridOf({ ...input, grid: input.grid ?? [[1, 3, 1], [1, 5, 1], [4, 2, 1]] }, 3, 3);
  const R = g.length;
  const C = g[0]!.length;
  const { s, f, table, base } = make();
  const gt = table("grid cost", g.map((r) => [...r]), range(R), range(C));
  const t = table("dp[r][c] = cheapest path cost from (0, 0) to (r, c)", grid2d(R, C), range(R), range(C), true);
  const d = Array.from({ length: R }, () => new Array<number>(C).fill(0));
  f.push(`Minimum path sum, moving right or down: dp[r][c] = grid[r][c] + min(dp[r−1][c], dp[r][c−1]). Same fill order as unique paths; the combine changes from + to min.`);
  for (let r = 0; r < R && !f.full; r++)
    for (let c = 0; c < C && !f.full; c++) {
      base();
      t.tones[key(r, c)] = "active";
      gt.tones[key(r, c)] = "compare";
      const cost = g[r]![c]!;
      if (r === 0 && c === 0) {
        d[0]![0] = cost;
        t.cells[0]![0] = cost;
        s.formula = `dp[0][0] = grid[0][0] = ${cost}`;
        f.push(`Base case dp[0][0] = ${cost}: the start cell's own cost.`, "base");
        continue;
      }
      const up = r > 0 ? d[r - 1]![c]! : Infinity;
      const left = c > 0 ? d[r]![c - 1]! : Infinity;
      if (r > 0) t.tones[key(r - 1, c)] = "compare";
      if (c > 0) t.tones[key(r, c - 1)] = "compare";
      d[r]![c] = cost + Math.min(up, left);
      t.cells[r]![c] = d[r]![c]!;
      s.formula = `dp[${r}][${c}] = grid[${r}][${c}] + min(up, left) = ${cost} + min(${fmt(up)}, ${fmt(left)}) = ${d[r]![c]}`;
      f.push(r === 0 ? `Top row: only the left neighbour exists, dp[0][${c}] = ${cost} + ${left} = ${d[r]![c]}.` : c === 0 ? `Left column: only the neighbour above exists, dp[${r}][0] = ${cost} + ${up} = ${d[r]![c]}.` : `dp[${r}][${c}] = ${cost} + min(above ${up}, left ${left}) = ${d[r]![c]}: arrive from the cheaper neighbour.`, "fill");
    }
  base();
  const path: string[] = [];
  let r = R - 1;
  let c = C - 1;
  for (;;) {
    path.unshift(`(${r}, ${c})`);
    t.tones[key(r, c)] = "path";
    gt.tones[key(r, c)] = "path";
    if (r === 0 && c === 0) break;
    if (r > 0 && (c === 0 || d[r - 1]![c]! <= d[r]![c - 1]!)) r--;
    else c--;
  }
  t.tones[key(R - 1, C - 1)] = "done";
  const ans = d[R - 1]![C - 1]!;
  s.formula = `dp[${R - 1}][${C - 1}] = ${ans}`;
  s.vars = { answer: ans, path };
  f.push(`Minimum path sum ${ans} along ${path.join(" → ")}. Walk back from the corner, each time stepping to whichever of above/left produced the min. O(R·C) time.`, "done");
  return f.done();
};

const palindromeSubstrings: G = ({ a, s: str0 }) => {
  const str = (a ?? str0 ?? "babad").slice(0, 12);
  const n = str.length;
  const { s, f, row, table, base, problem } = make();
  if (n === 0) return problem('Palindromic substrings needs a non-empty string (a: "babad").');
  const chars = row("s", [...str], range(n));
  const lbl = range(n).map((i) => `${i}:${str[i]}`);
  const t = table("pal[i][j] = s[i..j] is a palindrome (i ≤ j)", grid2d(n, n), lbl, lbl, true);
  const pal = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  let count = 0;
  let bi = 0;
  let bj = 0;
  f.push(`Interval DP on "${str}": pal[i][j] = s[i] == s[j] and pal[i+1][j−1]. Fill by increasing length, because each cell needs the strictly shorter interval inside it.`);
  base();
  for (let i = 0; i < n; i++) {
    pal[i]![i] = true;
    t.cells[i]![i] = "T";
    t.tones[key(i, i)] = "active";
    count++;
  }
  s.formula = "pal[i][i] = T";
  s.vars = { count };
  f.push(`Length 1: every single character is a palindrome, so the whole diagonal is T (${n} palindromes so far).`, "len 1");
  for (let len = 2; len <= n && !f.full; len++)
    for (let i = 0; i + len - 1 < n && !f.full; i++) {
      const j = i + len - 1;
      const same = str[i] === str[j];
      const inner = len === 2 ? true : pal[i + 1]![j - 1]!;
      pal[i]![j] = same && inner;
      t.cells[i]![j] = pal[i]![j] ? "T" : "F";
      if (pal[i]![j]) {
        count++;
        if (len > bj - bi + 1) {
          bi = i;
          bj = j;
        }
      }
      base();
      t.tones[key(i, j)] = "active";
      chars.tones[i] = "compare";
      chars.tones[j] = "compare";
      if (len > 2) t.tones[key(i + 1, j - 1)] = "compare";
      s.vars = { count, length: len };
      if (len === 2) {
        s.formula = `pal[${i}][${j}] = (s[${i}] == s[${j}]) = ('${str[i]}' == '${str[j]}') = ${same ? "T" : "F"}`;
        f.push(`Length 2, "${str.slice(i, j + 1)}": two characters form a palindrome only if they are equal, so pal[${i}][${j}] = ${same ? "T" : "F"}.`, same ? "true" : "false");
      } else {
        s.formula = `pal[${i}][${j}] = (s[${i}] == s[${j}]) ∧ pal[${i + 1}][${j - 1}] = ('${str[i]}' == '${str[j]}') ∧ ${inner ? "T" : "F"} = ${pal[i]![j] ? "T" : "F"}`;
        f.push(pal[i]![j] ? `"${str.slice(i, j + 1)}": ends match ('${str[i]}') and the inside "${str.slice(i + 1, j)}" is a palindrome, so pal[${i}][${j}] = T.` : !same ? `"${str.slice(i, j + 1)}": ends '${str[i]}' ≠ '${str[j]}', so pal[${i}][${j}] = F without looking inside.` : `"${str.slice(i, j + 1)}": ends match but the inside "${str.slice(i + 1, j)}" is not a palindrome, so pal[${i}][${j}] = F.`, pal[i]![j] ? "true" : "false");
      }
    }
  base();
  t.tones[key(bi, bj)] = "done";
  for (let k = bi; k <= bj; k++) chars.tones[k] = "done";
  s.formula = `count = ${count}, longest = pal[${bi}][${bj}] = "${str.slice(bi, bj + 1)}"`;
  s.vars = { count, longest: str.slice(bi, bj + 1) };
  f.push(`${count} palindromic substring(s); the longest is "${str.slice(bi, bj + 1)}" at pal[${bi}][${bj}]. Only the upper triangle is used: O(n²) time and space.`, "done");
  return f.done();
};

// ---- renderer ----

function Table({ t }: { t: DpTable }) {
  const C = t.cells[0]?.length ?? 0;
  return (
    <div className="inline-flex flex-col">
      {t.label && <div className="mb-1 text-[11px] text-muted">{t.label}</div>}
      <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `auto repeat(${C}, 2rem)` }}>
        <div />
        {range(C).map((c) => (
          <div key={`h${c}`} className="flex h-5 items-end justify-center font-mono text-[10px] text-muted">
            {t.colLabels?.[c] ?? c}
          </div>
        ))}
        {t.cells.map((cellsRow, r) => (
          <Fragment key={r}>
            <div className="flex h-8 items-center justify-end whitespace-nowrap pr-1.5 font-mono text-[10px] text-muted">{t.rowLabels?.[r] ?? r}</div>
            {cellsRow.map((v, c) => {
              const tone = t.tones[key(r, c)];
              return (
                <div key={c} className={cn("flex h-8 w-8 items-center justify-center rounded border font-mono text-xs transition-colors", v === null && !tone ? "border-line/40 bg-transparent text-muted" : toneClass[tone ?? "default"])}>
                  {v === null ? "" : v}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function Renderer({ frame }: RendererProps<DpInput, DpState>) {
  const { state } = frame;
  return (
    <div className="flex flex-col items-start gap-3">
      {state.rows.map((r, i) => (
        <div key={i}>
          {r.label && <div className="mb-1 text-[11px] text-muted">{r.label}</div>}
          <Cells values={r.values} tones={r.tones} labels={r.labels} pointers={r.pointers} size={r.values.length > 14 ? "sm" : "md"} />
        </div>
      ))}
      <div className="flex flex-wrap items-start gap-4">
        {state.tables.map((t, i) => (
          <Table key={i} t={t} />
        ))}
      </div>
      {state.formula && <div className="rounded-md border border-line bg-elev-2 px-2.5 py-1 font-mono text-xs">{state.formula}</div>}
      <Vars vars={state.vars} />
      <Legend items={[{ tone: "active", label: "cell being filled" }, { tone: "compare", label: "cells it reads" }, { tone: "visited", label: "already filled" }, { tone: "path", label: "reconstruction" }, { tone: "done", label: "answer" }]} />
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
const asNums = (v: unknown, cap = 40): number[] | undefined => {
  if (Array.isArray(v)) return v.map(Number).filter((n) => Number.isFinite(n)).slice(0, cap);
  if (typeof v === "string") return v.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n)).slice(0, cap);
  return undefined;
};
const asStr = (v: unknown, cap: number): string | undefined => (typeof v === "string" ? v.slice(0, cap) : typeof v === "number" ? String(v).slice(0, cap) : undefined);
const asGrid = (v: unknown): number[][] | undefined => {
  if (!Array.isArray(v) || v.length === 0 || !v.every((r) => Array.isArray(r) && r.length > 0)) return undefined;
  return (v as unknown[][]).slice(0, 8).map((r) => r.slice(0, 8).map((x) => (Number.isFinite(Number(x)) ? Number(x) : 0)));
};

export const dpFamily: Family<DpInput, DpState> = {
  name: "Dynamic programming",
  description: "Bottom-up tables: the cell being filled, the cells it reads, the transition with real numbers, and the reconstructed answer.",
  Renderer,
  algorithms: {
    fibonacci: linearRecurrence("fibonacci"),
    "climbing-stairs": linearRecurrence("climbing-stairs"),
    "coin-change": coinChange,
    "house-robber": houseRobber,
    lis,
    lcs,
    "edit-distance": editDistance,
    "knapsack-01": knapsack01,
    "unique-paths": uniquePaths,
    "min-path-sum": minPathSum,
    "word-break": wordBreak,
    "palindrome-substrings": palindromeSubstrings,
    "max-subarray": maxSubarray,
  },
  labels: {
    fibonacci: "Fibonacci (bottom-up)",
    "climbing-stairs": "Climbing stairs",
    "coin-change": "Coin change (fewest coins)",
    "house-robber": "House robber",
    lis: "Longest increasing subsequence",
    lcs: "Longest common subsequence",
    "edit-distance": "Edit distance",
    "knapsack-01": "0/1 knapsack",
    "unique-paths": "Unique paths",
    "min-path-sum": "Minimum path sum",
    "word-break": "Word break",
    "palindrome-substrings": "Palindromic substrings",
    "max-subarray": "Maximum subarray (Kadane)",
  },
  examples: {
    fibonacci: { n: 8 },
    "climbing-stairs": { n: 7 },
    "coin-change": { coins: [1, 3, 4], amount: 6 },
    "house-robber": { values: [2, 7, 9, 3, 1] },
    lis: { values: [10, 9, 2, 5, 3, 7, 101, 18] },
    lcs: { a: "abcde", b: "ace" },
    "edit-distance": { a: "horse", b: "ros" },
    "knapsack-01": { weights: [1, 3, 4, 5], values: [1, 4, 5, 7], capacity: 7 },
    "unique-paths": { rows: 3, cols: 4 },
    "min-path-sum": { grid: [[1, 3, 1], [1, 5, 1], [4, 2, 1]] },
    "word-break": { s: "catsanddog", words: ["cat", "cats", "and", "sand", "dog"] },
    "palindrome-substrings": { a: "babad" },
    "max-subarray": { values: [-2, 1, -3, 4, -1, 2, 1, -5, 4] },
  },
  normalise: (raw) => {
    const words = pick(raw, "words", "dict", "dictionary", "wordDict");
    return {
      n: asNum(pick(raw, "n", "steps", "stairs")),
      values: asNums(pick(raw, "values", "nums", "items", "houses", "array", "sequence", "vals")),
      coins: asNums(pick(raw, "coins", "denominations"), 12),
      amount: asNum(pick(raw, "amount", "target", "total", "sum")),
      a: asStr(pick(raw, "a", "s1", "text1", "word1", "str1", "x", "s", "text", "str", "string", "word"), 12),
      b: asStr(pick(raw, "b", "s2", "text2", "word2", "str2", "y", "t", "pattern"), 12),
      weights: asNums(pick(raw, "weights", "w", "sizes"), 12),
      capacity: asNum(pick(raw, "capacity", "W", "maxWeight", "limit")),
      grid: asGrid(pick(raw, "grid", "matrix", "costs", "board")),
      rows: asNum(pick(raw, "rows", "m", "height")),
      cols: asNum(pick(raw, "cols", "columns", "width")),
      s: asStr(pick(raw, "s", "text", "str", "string", "word", "a"), 20),
      words: Array.isArray(words) ? (words as unknown[]).map(String).filter((w) => w.length > 0).slice(0, 12) : typeof words === "string" ? words.split(/[,\s]+/).filter((w) => w.length > 0).slice(0, 12) : undefined,
    };
  },
};
