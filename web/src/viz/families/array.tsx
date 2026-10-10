// Array algorithms: searching, two pointers, sliding windows, sorting.
import { Bars, Cells, Legend, Vars, type Tone } from "../primitives";
import { Frames, type Family, type RendererProps } from "../engine";

export interface ArrayInput {
  values: number[];
  target?: number;
  /** Window size for sliding windows; target difference for prefix-sum (subarray sum equals k). */
  k?: number;
  /** prefix-sum: use P[0] = 0 and P[i + 1] = P[i] + values[i] (n + 1 entries). */
  leadingZero?: boolean;
  /** prefix-sum: finish with the range-sum query values[l..r] (inclusive). */
  query?: [number, number];
  /** prefix-sum: count subarrays whose sum is divisible by mod (remainder buckets). */
  mod?: number;
  /** prefix-sum: finish by pointing at the largest running sum (sweep line / difference array). */
  peak?: boolean;
  /** two-pointers-sum: trace the closest-pair-sum loop instead of stopping at an exact match. */
  closest?: boolean;
  /** binary-search-first-true: name of the predicate (e.g. "feasible"); probes are then phrased as name(value). */
  predicate?: string;
}

export interface ArrayState {
  values: number[];
  tones: (Tone | undefined)[];
  pointers: Record<string, number | undefined>;
  vars: Record<string, unknown>;
  /** Show bars (sorting) instead of cells. */
  bars?: boolean;
  /** Secondary row (e.g. prefix sums, stack contents). */
  aux?: { label: string; values: (string | number | null)[]; tones?: (Tone | undefined)[] };
  /** Third row (e.g. counting sort's output, prefix residues). */
  aux2?: { label: string; values: (string | number | null)[]; tones?: (Tone | undefined)[] };
}

type G = (input: ArrayInput) => ReturnType<Frames<ArrayState>["done"]>;

/** "a + b" written as "a − 3" when b is negative. */
const plus = (a: number, b: number) => (b < 0 ? `${a} − ${-b}` : `${a} + ${b}`);

function make(values: number[], bars = false) {
  const s: ArrayState = { values: [...values], tones: values.map(() => undefined), pointers: {}, vars: {}, bars };
  const f = new Frames<ArrayState>(() => ({ ...s, values: [...s.values], tones: [...s.tones], pointers: { ...s.pointers }, vars: { ...s.vars }, aux: s.aux ? { ...s.aux, values: [...s.aux.values], tones: s.aux.tones ? [...s.aux.tones] : undefined } : undefined, aux2: s.aux2 ? { ...s.aux2, values: [...s.aux2.values], tones: s.aux2.tones ? [...s.aux2.tones] : undefined } : undefined }));
  const clearTones = () => s.tones.fill(undefined);
  return { s, f, clearTones };
}

const linearSearch: G = ({ values, target = 0 }) => {
  const { s, f, clearTones } = make(values);
  s.vars = { target };
  f.push(`Scan left to right looking for ${target}.`);
  for (let i = 0; i < values.length; i++) {
    clearTones();
    for (let j = 0; j < i; j++) s.tones[j] = "muted";
    s.tones[i] = "compare";
    s.pointers = { i };
    if (values[i] === target) {
      s.tones[i] = "done";
      f.push(`values[${i}] = ${values[i]} equals the target. Found after ${i + 1} comparisons.`, "found");
      return f.done();
    }
    f.push(`values[${i}] = ${values[i]} ≠ ${target}; keep going.`, "compare");
  }
  clearTones();
  f.push(`Reached the end without finding ${target}: ${values.length} comparisons, O(n).`, "miss");
  return f.done();
};

const binarySearch: G = ({ values, target = 0 }) => {
  const { s, f, clearTones } = make(values);
  let lo = 0;
  let hi = values.length - 1;
  let steps = 0;
  s.vars = { target, lo, hi };
  f.push(`Sorted array. Invariant: if the target is present it lies within [lo, hi] = [${lo}, ${hi}].`);
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    steps++;
    clearTones();
    for (let i = 0; i < values.length; i++) if (i < lo || i > hi) s.tones[i] = "muted";
    s.tones[mid] = "compare";
    s.pointers = { lo, mid, hi };
    s.vars = { target, lo, hi, mid, comparisons: steps };
    const v = values[mid]!;
    if (v === target) {
      s.tones[mid] = "done";
      f.push(`values[mid] = ${v} equals the target. Found at index ${mid} after ${steps} comparisons (at most ⌊log₂ ${values.length}⌋ + 1 = ${Math.floor(Math.log2(Math.max(1, values.length))) + 1} for ${values.length} elements).`, "found");
      return f.done();
    }
    if (v < target) {
      f.push(`values[mid] = ${v} < ${target}, so the target can only be to the right: lo = mid + 1 = ${mid + 1}.`, "go right");
      lo = mid + 1;
    } else {
      f.push(`values[mid] = ${v} > ${target}, so the target can only be to the left: hi = mid − 1 = ${mid - 1}.`, "go left");
      hi = mid - 1;
    }
  }
  clearTones();
  s.pointers = { lo, hi };
  s.vars = { target, lo, hi, comparisons: steps };
  f.push(`lo (${lo}) > hi (${hi}): the range is empty, the target is absent. ${steps} comparisons.`, "miss");
  return f.done();
};

const binarySearchFirstTrue: G = ({ values, target = 0, predicate }) => {
  // Predicate: values[i] >= target. Find the first index where it holds.
  const { s, f, clearTones } = make(values);
  const name = typeof predicate === "string" && predicate.trim() ? predicate.trim() : undefined;
  let lo = 0;
  let hi = values.length;
  let probes = 0;
  f.push(
    name
      ? `The cells are candidate answers, not data. ${name}(x) is false below ${target} and true from ${target} on: once it holds, it holds for every larger candidate. Find the first true. Search range [lo, hi) = [0, ${hi}).`
      : `Predicate P(i) = values[i] ≥ ${target} is monotone (false…false true…true). Find the first true. Search space [lo, hi) = [0, ${hi}).`,
  );
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    probes++;
    clearTones();
    for (let i = 0; i < values.length; i++) if (i < lo || i >= hi) s.tones[i] = "muted";
    s.tones[mid] = "compare";
    s.pointers = { lo, mid, hi: hi < values.length ? hi : undefined };
    const ok = values[mid]! >= target;
    s.vars = name ? { lo, hi, mid, [`${name}(${values[mid]})`]: ok } : { lo, hi, mid, "P(mid)": ok };
    if (name) {
      f.push(ok ? `Check ${name}(${values[mid]}): true. ${values[mid]} might be the answer, so it stays in range: hi = mid, index ${mid}.` : `Check ${name}(${values[mid]}): false, and so is every smaller candidate: lo = mid + 1, index ${mid + 1}.`, ok ? "true" : "false");
    } else if (ok) {
      f.push(`P(${mid}) is true, so the answer is ≤ ${mid}: hi = mid.`, "true");
    } else {
      f.push(`P(${mid}) is false, so the answer is > ${mid}: lo = mid + 1.`, "false");
    }
    if (ok) hi = mid;
    else lo = mid + 1;
  }
  clearTones();
  if (lo < values.length) s.tones[lo] = "done";
  s.pointers = { lo };
  s.vars = { answer: lo };
  if (name) f.push(lo < values.length ? `lo = hi = index ${lo}: ${values[lo]} is the smallest candidate where ${name} holds, found with ${probes} checks of ${name} instead of ${values.length}.` : `lo = hi = ${lo}: no candidate satisfies ${name}.`, "done");
  else f.push(lo < values.length ? `lo = hi = ${lo}: the first index with values[i] ≥ ${target}.` : `No index satisfies the predicate; answer is n = ${lo} (insertion point).`, "done");
  return f.done();
};

const closestPairSum: G = ({ values, target = 0 }) => {
  const { s, f, clearTones } = make(values);
  let lo = 0;
  let hi = values.length - 1;
  let best: number | null = null;
  let iter = 0;
  s.pointers = { lo, hi };
  s.vars = { target };
  f.push(`Sorted array, closest pair sum to ${target}. lo and hi start at the two ends, ${hi} apart; every iteration moves one of them inward, so the loop runs at most n − 1 = ${Math.max(0, values.length - 1)} times whatever the data.`);
  while (lo < hi) {
    iter++;
    const sum = values[lo]! + values[hi]!;
    const improved = best === null || Math.abs(sum - target) < Math.abs(best - target);
    if (improved) best = sum;
    clearTones();
    s.tones[lo] = "compare";
    s.tones[hi] = "compare";
    s.pointers = { lo, hi };
    s.vars = { target, s: sum, best, iteration: iter };
    const move = sum < target ? "lo += 1" : "hi -= 1";
    f.push(`Iteration ${iter}: ${values[lo]} + ${values[hi]} = ${sum}. ${improved ? `That is the closest so far: best = ${sum}.` : `No closer than best = ${best}.`} ${sum} ${sum < target ? "<" : "≥"} ${target}, so ${move}.`, sum < target ? "lo++" : "hi--");
    if (sum < target) lo++;
    else hi--;
  }
  clearTones();
  s.pointers = { lo, hi };
  s.vars = { target, best, iterations: iter };
  f.push(`lo = hi = ${lo}: lo < hi fails and the loop stops after ${iter} iterations for n = ${values.length}. The closest sum is ${best ?? "undefined (fewer than two values)"}. The sort costs O(n log n); the walk is O(n).`, "done");
  return f.done();
};

const twoPointersSum: G = (input) => {
  if (input.closest) return closestPairSum(input);
  const { values, target = 0 } = input;
  const { s, f, clearTones } = make(values);
  let i = 0;
  let j = values.length - 1;
  f.push(`Sorted array. Start pointers at both ends; the sum tells us which pointer to move.`);
  while (i < j) {
    clearTones();
    s.tones[i] = "compare";
    s.tones[j] = "compare";
    s.pointers = { i, j };
    const sum = values[i]! + values[j]!;
    s.vars = { target, sum };
    if (sum === target) {
      s.tones[i] = "done";
      s.tones[j] = "done";
      f.push(`${values[i]} + ${values[j]} = ${target}. Found the pair at (${i}, ${j}).`, "found");
      return f.done();
    }
    if (sum < target) {
      f.push(`${values[i]} + ${values[j]} = ${sum} < ${target}: only a larger left value can help, so i++.`, "i++");
      i++;
    } else {
      f.push(`${values[i]} + ${values[j]} = ${sum} > ${target}: only a smaller right value can help, so j−−.`, "j--");
      j--;
    }
  }
  clearTones();
  f.push(`Pointers met: no pair sums to ${target}. Each element was visited once: O(n).`, "miss");
  return f.done();
};

const slidingWindowMaxSum: G = ({ values, k = 3 }) => {
  const { s, f, clearTones } = make(values);
  const kk = Math.max(1, Math.min(k, values.length));
  let sum = 0;
  for (let i = 0; i < kk; i++) sum += values[i]!;
  let best = sum;
  let bestAt = 0;
  clearTones();
  for (let i = 0; i < kk; i++) s.tones[i] = "active";
  s.pointers = { L: 0, R: kk - 1 };
  s.vars = { k: kk, sum, best };
  f.push(`Build the first window of size k = ${kk}: sum = ${sum}.`);
  for (let r = kk; r < values.length; r++) {
    const l = r - kk;
    sum += values[r]! - values[l]!;
    clearTones();
    for (let i = l + 1; i <= r; i++) s.tones[i] = "active";
    s.tones[l] = "muted";
    s.tones[r] = "compare";
    s.pointers = { L: l + 1, R: r };
    if (sum > best) {
      best = sum;
      bestAt = l + 1;
    }
    s.vars = { k: kk, sum, best, bestStart: bestAt };
    f.push(`Slide: add values[${r}] = ${values[r]}, remove values[${l}] = ${values[l]} → sum = ${sum}. Best so far ${best}.`, "slide");
  }
  clearTones();
  for (let i = bestAt; i < bestAt + kk; i++) s.tones[i] = "done";
  s.pointers = {};
  f.push(`Maximum window sum is ${best} starting at index ${bestAt}. One pass, O(n), instead of O(n·k).`, "done");
  return f.done();
};

const slidingWindowLongestUnique: G = ({ values }) => {
  const { s, f, clearTones } = make(values);
  const last = new Map<number, number>();
  let l = 0;
  let best = 0;
  let bestL = 0;
  f.push(`Variable window: expand R; when a duplicate enters, jump L past its previous position.`);
  for (let r = 0; r < values.length; r++) {
    const v = values[r]!;
    const prev = last.get(v);
    let note = `values[${r}] = ${v} is new to the window.`;
    if (prev !== undefined && prev >= l) {
      l = prev + 1;
      note = `values[${r}] = ${v} already appears at ${prev}; move L to ${l} to restore uniqueness.`;
    }
    last.set(v, r);
    if (r - l + 1 > best) {
      best = r - l + 1;
      bestL = l;
    }
    clearTones();
    for (let i = 0; i < l; i++) s.tones[i] = "muted";
    for (let i = l; i <= r; i++) s.tones[i] = "active";
    s.tones[r] = "compare";
    s.pointers = { L: l, R: r };
    s.vars = { window: r - l + 1, best };
    f.push(`${note} Window [${l}, ${r}] has ${r - l + 1} unique values; best = ${best}.`, "expand");
  }
  clearTones();
  for (let i = bestL; i < bestL + best; i++) s.tones[i] = "done";
  s.pointers = {};
  f.push(`Longest run of distinct values has length ${best}. L and R each move at most n times: O(n).`, "done");
  return f.done();
};

const prefixSum: G = ({ values, leadingZero, query, k, mod, peak }) => {
  const n = values.length;
  const { s, f } = make(values);
  const m = mod !== undefined && Number.isFinite(mod) && Math.floor(mod) >= 2 ? Math.floor(mod) : undefined;
  const target = m === undefined && k !== undefined && Number.isFinite(k) ? k : undefined;
  const lz = Boolean(leadingZero) || m !== undefined || target !== undefined;
  const P: (number | null)[] = Array.from({ length: lz ? n + 1 : n }, () => null);
  const label = lz ? "P[j] = sum of the first j values (P[0] = 0)" : "prefix[i] = sum of values[0..i]";
  /** Paint the prefix row: filled cells visited, `cur` done, plus explicit overrides. */
  const paint = (cur: number | null, extra: Record<number, Tone> = {}) => {
    s.aux = { label, values: [...P], tones: P.map((v, j) => extra[j] ?? (j === cur ? "done" : v !== null ? "visited" : undefined)) };
  };
  const list = (xs: number[]) => xs.join(", ");
  if (n === 0) {
    f.push("There are no values, so there is nothing to sum: give a non-empty values list.", "input");
    return f.done();
  }
  if (lz) P[0] = 0;
  let acc = 0;

  if (target !== undefined) {
    // Subarray sum equals k: look up P[j] - k among earlier prefixes, then record P[j].
    const seen = new Map<number, number>([[0, 1]]);
    const fmtSeen = () => [...seen.entries()].map(([key, c]) => `${key}:${c}`).join(", ");
    const found: string[] = [];
    let count = 0;
    paint(0);
    s.vars = { k: target, count, seen: fmtSeen() };
    f.push(`Count the subarrays that sum to ${target}. Two prefixes that differ by ${target} bracket such a subarray. P[0] = 0 is the empty prefix, already seen once; for each new prefix, look up P − ${target} among the earlier ones before recording it.`);
    for (let j = 1; j <= n; j++) {
      const v = values[j - 1]!;
      const prev = acc;
      acc += v;
      P[j] = acc;
      const want = acc - target;
      const hits: number[] = [];
      for (let i = 0; i < j; i++) if (P[i] === want) hits.push(i);
      count += hits.length;
      seen.set(acc, (seen.get(acc) ?? 0) + 1);
      s.tones.fill(undefined);
      const extra: Record<number, Tone> = {};
      for (const i of hits) {
        extra[i] = "active";
        for (let q = i; q < j; q++) s.tones[q] = "active";
        found.push(`[${values.slice(i, j).join(", ")}]`);
      }
      s.tones[j - 1] = "compare";
      paint(j, extra);
      s.vars = { k: target, prefix: acc, [`look up ${acc} − ${target}`]: want, count, seen: fmtSeen() };
      const head = `P[${j}] = P[${j - 1}] + values[${j - 1}] = ${plus(prev, v)} = ${acc}. Look up ${acc} − ${target} = ${want}:`;
      f.push(
        hits.length === 0
          ? `${head} no earlier prefix has that value, so count stays ${count}.`
          : `${head} ${hits.length === 1 ? `P[${hits[0]}] has it` : `P[${list(hits)}] have it`}, so ${hits.map((i) => `values[${i}..${j - 1}]`).join(" and ")} ${hits.length === 1 ? "sums" : "each sum"} to ${target}. count = ${count}.`,
        hits.length ? "hit" : "miss",
      );
    }
    s.tones.fill(undefined);
    s.pointers = {};
    paint(null);
    s.vars = { k: target, count };
    f.push(`${count} subarray${count === 1 ? "" : "s"} sum to ${target}${found.length ? `: ${found.join(", ")}` : ""}. One pass, O(n): each prefix is looked up before it is recorded, and the seed P[0] = 0 is what counts subarrays that start at index 0.`, "done");
    return f.done();
  }

  if (m !== undefined) {
    // Remainder buckets: equal residues bound a subarray divisible by m.
    const R: (number | null)[] = P.map(() => null);
    const counts = new Array<number>(m).fill(0);
    const rlabel = `P[j] mod ${m}`;
    const paintR = (cur: number | null, same: number[]) => {
      s.aux2 = { label: rlabel, values: [...R], tones: R.map((v, j) => (j === cur ? "done" : same.includes(j) ? "active" : v !== null ? "visited" : undefined)) };
    };
    let total = 0;
    R[0] = 0;
    counts[0] = 1;
    paint(0);
    paintR(0, []);
    s.vars = { mod: m, total, [`count[0..${m - 1}]`]: counts.join(" ") };
    f.push(`Count the subarrays whose sum is divisible by ${m}. The sum of a subarray is P[j] − P[i], and it is divisible by ${m} exactly when P[i] and P[j] leave the same remainder. P[0] = 0 has remainder 0, so count[0] starts at 1.`);
    for (let j = 1; j <= n; j++) {
      const v = values[j - 1]!;
      const prev = acc;
      acc += v;
      P[j] = acc;
      const r = ((acc % m) + m) % m;
      R[j] = r;
      const same: number[] = [];
      for (let i = 0; i < j; i++) if (R[i] === r) same.push(i);
      const c = counts[r]!;
      total += c;
      counts[r]!++;
      s.tones.fill(undefined);
      s.tones[j - 1] = "compare";
      const extra: Record<number, Tone> = {};
      for (const i of same) extra[i] = "active";
      paint(j, extra);
      paintR(j, same);
      s.vars = { mod: m, total, [`count[0..${m - 1}]`]: counts.join(" ") };
      const head = `P[${j}] = ${plus(prev, v)} = ${acc}, remainder ${r}.`;
      f.push(
        c === 0
          ? `${head} No earlier prefix has remainder ${r}, so total stays ${total}; count[${r}] becomes ${counts[r]}.`
          : `${head} ${c} earlier prefix${c === 1 ? " has" : "es have"} remainder ${r} (P[${list(same)}]), so ${c} more subarray${c === 1 ? "" : "s"} ending at index ${j - 1} ${c === 1 ? "is" : "are"} divisible by ${m}: total = ${total}; count[${r}] becomes ${counts[r]}.`,
        c ? "hit" : "miss",
      );
    }
    s.tones.fill(undefined);
    s.pointers = {};
    paint(null);
    paintR(null, []);
    s.vars = { mod: m, total, [`count[0..${m - 1}]`]: counts.join(" ") };
    f.push(`${total} subarray${total === 1 ? "" : "s"} have a sum divisible by ${m}. Each prefix added the number of earlier prefixes with its remainder, so a bucket holding c prefixes contributes c(c − 1)/2 pairs. One pass, ${m} counters.`, "done");
    return f.done();
  }

  paint(lz ? 0 : null);
  f.push(lz ? `P[0] = 0 is the empty prefix, and P[i + 1] = P[i] + values[i]. Build it once in O(n); then the sum of values[l..r] is P[r + 1] − P[l], one subtraction.` : `prefix[i] = sum of values[0..i]. Build it once in O(n); then any range sum is one subtraction.`);
  for (let i = 0; i < n; i++) {
    const prev = acc;
    acc += values[i]!;
    s.tones.fill(undefined);
    s.tones[i] = "compare";
    if (lz) {
      P[i + 1] = acc;
      paint(i + 1);
      f.push(`P[${i + 1}] = P[${i}] + values[${i}] = ${plus(prev, values[i]!)} = ${acc}.`, "build");
    } else {
      P[i] = acc;
      paint(i);
      f.push(i === 0 ? `prefix[0] = values[0] = ${acc}.` : `prefix[${i}] = prefix[${i - 1}] + values[${i}] = ${plus(prev, values[i]!)} = ${acc}.`, "build");
    }
  }
  const q = Array.isArray(query) && query.length === 2 && Number.isInteger(query[0]) && Number.isInteger(query[1]) && query[0] >= 0 && query[0] <= query[1] && query[1] < n ? query : undefined;
  if (q) {
    const [l, r] = q;
    s.tones.fill(undefined);
    for (let i = l; i <= r; i++) s.tones[i] = "active";
    let hiIdx: number;
    let loIdx: number | null;
    if (lz) {
      hiIdx = r + 1;
      loIdx = l;
    } else {
      hiIdx = r;
      loIdx = l === 0 ? null : l - 1;
    }
    const hiV = P[hiIdx]!;
    const loV = loIdx === null ? 0 : P[loIdx]!;
    const extra: Record<number, Tone> = {};
    if (loIdx !== null) extra[loIdx] = "danger";
    paint(hiIdx, extra);
    s.vars = { [`sum(${l}, ${r})`]: hiV - loV };
    const terms = values.slice(l, r + 1).join(" + ");
    const formula = lz ? `P[${hiIdx}] − P[${loIdx}] = ${hiV} − ${loV}` : loIdx === null ? `prefix[${hiIdx}] = ${hiV}` : `prefix[${hiIdx}] − prefix[${loIdx}] = ${hiV} − ${loV}`;
    f.push(`sum(${l}, ${r}) = ${formula} = ${hiV - loV} (${terms}): one subtraction, O(1) per query, however long the range.`, "query");
  } else if (peak) {
    const nums = P.map((v) => v ?? -Infinity);
    const best = Math.max(...nums);
    const extra: Record<number, Tone> = {};
    nums.forEach((v, j) => {
      if (v === best) extra[j] = "done";
    });
    s.tones.fill(undefined);
    paint(null, extra);
    s.vars = { peak: best };
    const where = nums.map((v, j) => (v === best ? j : -1)).filter((j) => j >= 0);
    f.push(`The running sum peaks at ${best}, at ${where.length > 1 ? "indices" : "index"} ${list(where)}. One pass over the row finds it.`, "peak");
  } else {
    s.tones.fill(undefined);
    paint(null);
    s.vars = {};
    f.push(`${lz ? "P" : "The prefix row"} is complete: ${list(P as number[])}. One addition per element, O(n); from here any range sum is one subtraction.`, "done");
  }
  return f.done();
};

const kadane: G = ({ values }) => {
  const { s, f, clearTones } = make(values);
  const n = values.length;
  if (n === 0) {
    f.push("There are no values: the maximum subarray of an empty array is undefined. Give a non-empty values list.", "input");
    return f.done();
  }
  f.push(`Kadane: cur is the best sum of a subarray ending at the current index, best the best seen anywhere. At each index, extend the running subarray or start fresh there: restart only when cur is negative (cur ≥ 0 extends, so ties keep the longer run).`);
  let cur = values[0]!;
  let best = cur;
  let start = 0;
  let bestL = 0;
  let bestR = 0;
  const paint = (i: number) => {
    clearTones();
    for (let j = start; j <= i; j++) s.tones[j] = "active";
    s.tones[i] = "compare";
    s.pointers = { start, i };
    s.vars = { cur, best };
  };
  paint(0);
  f.push(`Start with the first element: cur = best = ${cur}, the run is [0, 0].`, "start");
  for (let i = 1; i < n; i++) {
    const v = values[i]!;
    let note: string;
    let tag: string;
    if (cur < 0) {
      note = `cur = ${cur} < 0 would only drag ${v} down: restart at ${i}, cur = ${v}.`;
      cur = v;
      start = i;
      tag = "restart";
    } else {
      note = `cur = ${cur} ≥ 0, so extend: cur = ${plus(cur, v)} = ${cur + v}.`;
      cur += v;
      tag = "extend";
    }
    const improved = cur > best;
    if (improved) {
      best = cur;
      bestL = start;
      bestR = i;
    }
    paint(i);
    f.push(`${note} ${improved ? `New best = ${best}, over [${bestL}, ${bestR}].` : `best stays ${best}.`}`, tag);
  }
  clearTones();
  for (let j = bestL; j <= bestR; j++) s.tones[j] = "done";
  s.pointers = {};
  s.vars = { cur, best };
  f.push(`Maximum subarray sum is ${best} over [${bestL}, ${bestR}]: ${values.slice(bestL, bestR + 1).join(", ")}. O(n) time, O(1) space.`, "done");
  return f.done();
};

const dutchFlag: G = ({ values }) => {
  const { s, f, clearTones } = make(values);
  let lo = 0;
  let mid = 0;
  let hi = values.length - 1;
  const a = s.values;
  // Every frame shows the state after its step: values, pointers and regions agree with the note.
  const paint = (touched: number[]) => {
    clearTones();
    for (let i = 0; i < lo; i++) s.tones[i] = "done";
    for (let i = lo; i < mid; i++) s.tones[i] = "visited";
    for (let i = hi + 1; i < a.length; i++) s.tones[i] = "danger";
    for (const t of touched) s.tones[t] = "compare";
    s.pointers = { lo, mid, hi };
    s.vars = { lo, mid, hi };
  };
  paint([]);
  f.push(`Three-way partition (0/1/2). Invariant: [0, lo) are 0s, [lo, mid) are 1s, (hi, n) are 2s and [mid, hi] is unknown. Each step examines a[mid] and shrinks the unknown region by one.`);
  while (mid <= hi) {
    const v = a[mid]!;
    if (v === 0) {
      const ol = lo;
      const om = mid;
      [a[lo], a[mid]] = [a[mid]!, a[lo]!];
      lo++;
      mid++;
      paint(ol === om ? [om] : [ol, om]);
      f.push(ol === om ? `a[${om}] was 0 and lo = mid, so it is already in place: lo and mid both advance, to ${lo}.` : `a[${om}] was 0: swapped with the ${a[om]} at a[${ol}], which was already examined, then lo and mid both advance, to ${lo} and ${mid}.`, "swap lo");
    } else if (v === 2) {
      const oh = hi;
      [a[mid], a[hi]] = [a[hi]!, a[mid]!];
      hi--;
      paint(oh === mid ? [mid] : [mid, oh]);
      f.push(oh === mid ? `a[${mid}] was 2 and mid = hi, so it stays where it is: hi moves to ${hi}.` : `a[${mid}] was 2: swapped with a[${oh}], then hi moves to ${hi}. mid stays at ${mid}, because the ${a[mid]} that arrived has not been examined yet.`, "swap hi");
    } else {
      mid++;
      paint([mid - 1]);
      f.push(`a[${mid - 1}] = 1 already belongs in the middle region: mid advances to ${mid}.`, "skip");
    }
  }
  paint([]);
  f.push(`mid (${mid}) has passed hi (${hi}): the unknown region is empty. Partitioned in one pass with O(1) extra space.`, "done");
  return f.done();
};

const monotonicNextGreater: G = ({ values }) => {
  const { s, f, clearTones } = make(values);
  const stack: number[] = [];
  const ans: (number | null)[] = values.map(() => null);
  s.aux = { label: "stack (indices)", values: [] };
  f.push(`Next greater element with a stack of indices whose values never increase upwards: each index is pushed and popped at most once.`);
  for (let i = 0; i < values.length; i++) {
    while (stack.length && values[stack[stack.length - 1]!]! < values[i]!) {
      const j = stack.pop()!;
      ans[j] = values[i]!;
      clearTones();
      s.tones[i] = "compare";
      s.tones[j] = "done";
      s.aux = { label: "stack (indices)", values: [...stack] };
      s.pointers = { i };
      s.vars = { answer: [...ans] };
      f.push(`values[${i}] = ${values[i]} > values[${j}] = ${values[j]}: pop ${j}, its next greater is ${values[i]}.`, "pop");
    }
    stack.push(i);
    clearTones();
    s.tones[i] = "active";
    for (const j of stack) s.tones[j] = "frontier";
    s.aux = { label: "stack (indices)", values: [...stack] };
    s.pointers = { i };
    s.vars = { answer: [...ans] };
    f.push(`Push ${i}. Stack values never increase upwards: ${stack.map((j, q) => (q === 0 ? `${values[j]}` : `${values[stack[q - 1]!] === values[j] ? "=" : ">"} ${values[j]}`)).join(" ") || "∅"}.`, "push");
  }
  clearTones();
  s.vars = { answer: ans.map((v) => (v === null ? -1 : v)) };
  s.aux = { label: "stack (indices)", values: [...stack] };
  f.push(`Indices left on the stack have no greater element to their right (−1). Total work O(n).`, "done");
  return f.done();
};

// ---- sorting (bars) ----

const bubbleSort: G = ({ values }) => {
  const { s, f, clearTones } = make(values, true);
  const a = s.values;
  const n = a.length;
  f.push(`Bubble sort: repeatedly swap adjacent out-of-order pairs; the largest unsorted value "bubbles" to the end.`);
  for (let pass = 0; pass < n - 1; pass++) {
    let swapped = false;
    for (let i = 0; i < n - 1 - pass; i++) {
      clearTones();
      for (let j = n - pass; j < n; j++) s.tones[j] = "done";
      s.tones[i] = "compare";
      s.tones[i + 1] = "compare";
      if (a[i]! > a[i + 1]!) {
        [a[i], a[i + 1]] = [a[i + 1]!, a[i]!];
        swapped = true;
        f.push(`${a[i + 1]} > ${a[i]}: swap.`, "swap");
      } else {
        f.push(`${a[i]} ≤ ${a[i + 1]}: in order.`, "compare");
      }
      if (f.full) return f.done();
    }
    if (!swapped) break;
  }
  clearTones();
  s.tones.fill("done");
  f.push(`Sorted. Worst case O(n²) comparisons; early exit makes an already-sorted input O(n).`, "done");
  return f.done();
};

const insertionSort: G = ({ values }) => {
  const { s, f, clearTones } = make(values, true);
  const a = s.values;
  f.push(`Insertion sort: grow a sorted prefix by inserting each next element into place.`);
  for (let i = 1; i < a.length; i++) {
    const key = a[i]!;
    let j = i - 1;
    clearTones();
    for (let k = 0; k < i; k++) s.tones[k] = "visited";
    s.tones[i] = "active";
    f.push(`Take a[${i}] = ${key}; shift larger prefix elements right until its slot appears.`, "pick");
    while (j >= 0 && a[j]! > key) {
      a[j + 1] = a[j]!;
      j--;
      clearTones();
      for (let k = 0; k <= i; k++) s.tones[k] = "visited";
      s.tones[j + 1] = "compare";
      f.push(`a[${j + 1}] > ${key}: shift right.`, "shift");
      if (f.full) return f.done();
    }
    a[j + 1] = key;
    clearTones();
    for (let k = 0; k <= i; k++) s.tones[k] = "visited";
    s.tones[j + 1] = "done";
    f.push(`Insert ${key} at index ${j + 1}. Prefix [0..${i}] is sorted.`, "insert");
  }
  clearTones();
  s.tones.fill("done");
  f.push(`Sorted. O(n²) worst case, but O(n) on nearly-sorted input, which is why Timsort uses it for small runs.`, "done");
  return f.done();
};

const selectionSort: G = ({ values }) => {
  const { s, f, clearTones } = make(values, true);
  const a = s.values;
  f.push(`Selection sort: find the minimum of the unsorted suffix and swap it to the front.`);
  for (let i = 0; i < a.length - 1; i++) {
    let m = i;
    for (let j = i + 1; j < a.length; j++) {
      clearTones();
      for (let k = 0; k < i; k++) s.tones[k] = "done";
      s.tones[m] = "active";
      s.tones[j] = "compare";
      if (a[j]! < a[m]!) {
        m = j;
        f.push(`a[${j}] = ${a[j]} is a new minimum.`, "min");
      } else f.push(`a[${j}] = ${a[j]} ≥ current min ${a[m]}.`, "compare");
      if (f.full) return f.done();
    }
    [a[i], a[m]] = [a[m]!, a[i]!];
    clearTones();
    for (let k = 0; k <= i; k++) s.tones[k] = "done";
    f.push(`Swap min ${a[i]} into position ${i}.`, "swap");
  }
  clearTones();
  s.tones.fill("done");
  f.push(`Sorted with exactly n−1 swaps and O(n²) comparisons regardless of input.`, "done");
  return f.done();
};

const mergeSort: G = ({ values }) => {
  const { s, f, clearTones } = make(values, true);
  const a = s.values;
  f.push(`Merge sort: split in halves recursively, then merge sorted halves with two pointers.`);
  const rec = (lo: number, hi: number, depth: number) => {
    if (hi - lo < 1 || f.full) return;
    // Left half gets floor(len / 2) elements, as in a[:len(a) // 2].
    const mid = lo + Math.floor((hi - lo + 1) / 2) - 1;
    clearTones();
    for (let i = lo; i <= hi; i++) s.tones[i] = "active";
    f.push(`Split [${lo}, ${hi}] into [${lo}, ${mid}] and [${mid + 1}, ${hi}] (depth ${depth}).`, "split");
    rec(lo, mid, depth + 1);
    rec(mid + 1, hi, depth + 1);
    const left = a.slice(lo, mid + 1);
    const right = a.slice(mid + 1, hi + 1);
    let i = 0;
    let j = 0;
    let k = lo;
    while (i < left.length || j < right.length) {
      const takeLeft = j >= right.length || (i < left.length && left[i]! <= right[j]!);
      a[k] = takeLeft ? left[i++]! : right[j++]!;
      clearTones();
      for (let t = lo; t <= hi; t++) s.tones[t] = t < k ? "visited" : "compare";
      s.tones[k] = "done";
      f.push(`Merge: take ${a[k]} from the ${takeLeft ? "left" : "right"} half into position ${k}.`, "merge");
      k++;
      if (f.full) return;
    }
  };
  rec(0, a.length - 1, 0);
  clearTones();
  s.tones.fill("done");
  f.push(`Sorted. log₂ n levels × O(n) merge work = O(n log n), always. Needs O(n) scratch space; stable.`, "done");
  return f.done();
};

const quickSort: G = ({ values }) => {
  const { s, f, clearTones } = make(values, true);
  const a = s.values;
  f.push(`Quick sort (Lomuto partition, last element pivot): put the pivot in its final place, recurse on both sides.`);
  const rec = (lo: number, hi: number) => {
    if (lo >= hi || f.full) return;
    const pivot = a[hi]!;
    let i = lo;
    clearTones();
    for (let t = lo; t <= hi; t++) s.tones[t] = "active";
    s.tones[hi] = "danger";
    s.pointers = { lo, hi };
    f.push(`Partition [${lo}, ${hi}] around pivot ${pivot}.`, "pivot");
    for (let j = lo; j < hi; j++) {
      clearTones();
      for (let t = lo; t < i; t++) s.tones[t] = "visited";
      s.tones[j] = "compare";
      s.tones[hi] = "danger";
      s.pointers = { i, j };
      if (a[j]! < pivot) {
        [a[i], a[j]] = [a[j]!, a[i]!];
        f.push(`${a[i]} < ${pivot}: swap into the "less than" region, i++.`, "swap");
        i++;
      } else f.push(`${a[j]} ≥ ${pivot}: leave it.`, "compare");
      if (f.full) return;
    }
    [a[i], a[hi]] = [a[hi]!, a[i]!];
    clearTones();
    s.tones[i] = "done";
    s.pointers = {};
    f.push(`Place pivot ${pivot} at index ${i}: everything left is smaller, everything right is ≥.`, "place");
    rec(lo, i - 1);
    rec(i + 1, hi);
  };
  rec(0, a.length - 1);
  clearTones();
  s.tones.fill("done");
  f.push(`Sorted. Average O(n log n), in place; worst case O(n²) with bad pivots (sorted input + last-element pivot).`, "done");
  return f.done();
};

const countingSort: G = ({ values }) => {
  const { s, f, clearTones } = make(values);
  const n = values.length;
  if (values.some((v) => v < 0 || !Number.isInteger(v))) {
    f.push("Counting sort needs non-negative integer keys, because each key is used as an index into the count array.", "input");
    return f.done();
  }
  const max = Math.max(0, ...values);
  if (max > 60) {
    f.push(`The largest key is ${max}, so the count array would need ${max + 1} slots for ${n} values. Counting sort wants a key range about the size of the input; use keys up to 60 here.`, "input");
    return f.done();
  }
  const counts = new Array<number>(max + 1).fill(0);
  const out: (number | null)[] = values.map(() => null);
  s.aux = { label: "count[key]", values: [...counts] };
  f.push(`Counting sort: the keys are small non-negative integers (0..${max}), so count how often each occurs, turn the counts into starting positions, then place each element. No comparisons.`);
  for (let i = 0; i < n; i++) {
    counts[values[i]!]!++;
    clearTones();
    s.tones[i] = "compare";
    s.pointers = { i };
    s.aux = { label: "count[key]", values: [...counts], tones: counts.map((_, v) => (v === values[i] ? "done" : undefined)) };
    f.push(`values[${i}] = ${values[i]}: count[${values[i]}] becomes ${counts[values[i]!]}.`, "count");
  }
  // Prefix pass: start[v] = number of keys smaller than v, the first output slot for key v.
  const start: number[] = [...counts];
  let total = 0;
  clearTones();
  s.pointers = {};
  for (let v = 0; v <= max; v++) {
    const c = counts[v]!;
    start[v] = total;
    total += c;
    s.aux = { label: "start[key]: first output slot for each key", values: [...start.slice(0, v + 1), ...counts.slice(v + 1)], tones: counts.map((_, u) => (u === v ? "done" : u < v ? "visited" : undefined)) };
    s.vars = { "running total": total };
    f.push(c === 0 ? `Key ${v} does not occur: start[${v}] = ${start[v]}, and the running total stays ${total}.` : `Key ${v} occurs ${c} time${c === 1 ? "" : "s"}: ${start[v]} smaller key${start[v] === 1 ? " comes" : "s come"} first, so start[${v}] = ${start[v]}; the running total becomes ${total}.`, "prefix");
  }
  s.vars = {};
  s.aux2 = { label: "out", values: [...out] };
  for (let i = 0; i < n; i++) {
    const x = values[i]!;
    const pos = start[x]!;
    out[pos] = x;
    start[x] = pos + 1;
    clearTones();
    for (let t = 0; t < i; t++) s.tones[t] = "visited";
    s.tones[i] = "compare";
    s.pointers = { i };
    s.aux = { label: "start[key]: next output slot for each key", values: [...start], tones: start.map((_, v) => (v === x ? "active" : undefined)) };
    s.aux2 = { label: "out", values: [...out], tones: out.map((v, j) => (j === pos ? "done" : v !== null ? "visited" : undefined)) };
    f.push(`values[${i}] = ${x} goes to out[start[${x}]] = out[${pos}]; start[${x}] becomes ${pos + 1}, the slot for the next ${x}.`, "place");
  }
  clearTones();
  s.pointers = {};
  s.aux = { label: "start[key]: next output slot for each key", values: [...start] };
  s.aux2 = { label: "out", values: [...out], tones: out.map(() => "done") };
  f.push(`Sorted: ${out.join(", ")}. Elements were placed in input order, so equal keys keep their order (stable). O(n + k) with k = ${max + 1} keys, and not a single comparison.`, "done");
  return f.done();
};

const reverse: G = ({ values }) => {
  const { s, f, clearTones } = make(values);
  const a = s.values;
  let i = 0;
  let j = a.length - 1;
  f.push(`Reverse in place by swapping from both ends toward the middle.`);
  while (i < j) {
    [a[i], a[j]] = [a[j]!, a[i]!];
    clearTones();
    s.tones[i] = "done";
    s.tones[j] = "done";
    s.pointers = { i, j };
    f.push(`Swap a[${i}] and a[${j}].`, "swap");
    i++;
    j--;
  }
  clearTones();
  s.pointers = {};
  f.push(`Reversed with ⌊n/2⌋ swaps, O(1) extra space.`, "done");
  return f.done();
};

const rotate: G = ({ values, k = 2 }) => {
  const { s, f, clearTones } = make(values);
  const a = s.values;
  const n = a.length;
  const kk = ((k % n) + n) % n;
  const rev = (l: number, r: number, label: string) => {
    while (l < r) {
      [a[l], a[r]] = [a[r]!, a[l]!];
      clearTones();
      s.tones[l] = "compare";
      s.tones[r] = "compare";
      f.push(`${label}: swap a[${l}] and a[${r}].`, "swap");
      l++;
      r--;
    }
  };
  f.push(`Rotate right by k = ${kk} using three reversals: reverse all, then reverse the first k, then the rest.`);
  rev(0, n - 1, "Reverse whole array");
  rev(0, kk - 1, `Reverse first ${kk}`);
  rev(kk, n - 1, `Reverse last ${n - kk}`);
  clearTones();
  s.tones.fill("done");
  f.push(`Rotated in O(n) time and O(1) space.`, "done");
  return f.done();
};

const moveZeroes: G = ({ values }) => {
  const { s, f, clearTones } = make(values);
  const a = s.values;
  let w = 0;
  f.push(`Two pointers, same direction: w marks where the next non-zero goes.`);
  for (let r = 0; r < a.length; r++) {
    clearTones();
    for (let t = 0; t < w; t++) s.tones[t] = "visited";
    s.tones[r] = "compare";
    s.pointers = { w, r };
    if (a[r] !== 0) {
      [a[w], a[r]] = [a[r]!, a[w]!];
      f.push(`a[${r}] = ${a[w]} is non-zero: swap to position ${w}, w++.`, "swap");
      w++;
    } else f.push(`a[${r}] is zero: skip.`, "skip");
  }
  clearTones();
  for (let t = 0; t < w; t++) s.tones[t] = "done";
  s.pointers = {};
  f.push(`All non-zeros moved forward in order; zeros trail. O(n), stable, in place.`, "done");
  return f.done();
};

const removeDuplicates: G = ({ values }) => {
  const { s, f, clearTones } = make(values);
  const a = s.values;
  let w = 0;
  f.push(`Sorted input: keep a write pointer; only copy a value when it differs from the last kept one.`);
  for (let r = 0; r < a.length; r++) {
    clearTones();
    for (let t = 0; t < w; t++) s.tones[t] = "visited";
    s.tones[r] = "compare";
    s.pointers = { w, r };
    if (w === 0 || a[r] !== a[w - 1]) {
      a[w] = a[r]!;
      f.push(`a[${r}] = ${a[r]} is new: write at ${w}.`, "write");
      w++;
    } else f.push(`a[${r}] = ${a[r]} duplicates a[${w - 1}]: skip.`, "skip");
  }
  clearTones();
  for (let t = 0; t < w; t++) s.tones[t] = "done";
  for (let t = w; t < a.length; t++) s.tones[t] = "muted";
  s.vars = { k: w };
  f.push(`First ${w} slots hold the unique values. O(n), O(1) space.`, "done");
  return f.done();
};

function Renderer({ frame }: RendererProps<ArrayInput, ArrayState>) {
  const { state } = frame;
  return (
    <div className="flex flex-col items-start gap-3">
      {state.bars ? <Bars values={state.values} tones={state.tones} /> : <Cells values={state.values} tones={state.tones} pointers={state.pointers} />}
      {state.aux && (
        <div>
          <div className="mb-1 text-[11px] text-muted">{state.aux.label}</div>
          <Cells values={state.aux.values} tones={state.aux.tones} size="sm" />
        </div>
      )}
      {state.aux2 && (
        <div>
          <div className="mb-1 text-[11px] text-muted">{state.aux2.label}</div>
          <Cells values={state.aux2.values} tones={state.aux2.tones} size="sm" />
        </div>
      )}
      <Vars vars={state.vars} />
      <Legend items={[{ tone: "compare", label: "comparing" }, { tone: "active", label: "window / range" }, { tone: "done", label: "final" }, { tone: "muted", label: "excluded" }]} />
    </div>
  );
}

export const arrayFamily: Family<ArrayInput, ArrayState> = {
  name: "Array",
  description: "Searching, pointers, windows and sorting on a flat array.",
  Renderer,
  algorithms: {
    "linear-search": linearSearch,
    "binary-search": binarySearch,
    "binary-search-first-true": binarySearchFirstTrue,
    "two-pointers-sum": twoPointersSum,
    "sliding-window-max-sum": slidingWindowMaxSum,
    "sliding-window-longest-unique": slidingWindowLongestUnique,
    "prefix-sum": prefixSum,
    kadane,
    "dutch-flag": dutchFlag,
    "monotonic-stack-next-greater": monotonicNextGreater,
    "bubble-sort": bubbleSort,
    "insertion-sort": insertionSort,
    "selection-sort": selectionSort,
    "merge-sort": mergeSort,
    "quick-sort": quickSort,
    "counting-sort": countingSort,
    reverse,
    rotate,
    "move-zeroes": moveZeroes,
    "remove-duplicates": removeDuplicates,
  },
  labels: {
    "linear-search": "Linear search",
    "binary-search": "Binary search",
    "binary-search-first-true": "Binary search on a predicate",
    "two-pointers-sum": "Two pointers: pair sum",
    "sliding-window-max-sum": "Sliding window: max sum of size k",
    "sliding-window-longest-unique": "Sliding window: longest unique run",
    "prefix-sum": "Prefix sums",
    kadane: "Kadane's maximum subarray",
    "dutch-flag": "Dutch national flag partition",
    "monotonic-stack-next-greater": "Monotonic stack: next greater",
    "bubble-sort": "Bubble sort",
    "insertion-sort": "Insertion sort",
    "selection-sort": "Selection sort",
    "merge-sort": "Merge sort",
    "quick-sort": "Quick sort",
    "counting-sort": "Counting sort",
    reverse: "Reverse in place",
    rotate: "Rotate by k",
    "move-zeroes": "Move zeroes",
    "remove-duplicates": "Remove duplicates (sorted)",
  },
  examples: {
    "linear-search": { values: [4, 8, 15, 16, 23, 42], target: 23 },
    "binary-search": { values: [1, 3, 4, 7, 9, 12, 15, 20, 24, 31], target: 15 },
    "binary-search-first-true": { values: [1, 2, 4, 4, 4, 7, 9], target: 4 },
    "two-pointers-sum": { values: [1, 2, 4, 6, 8, 11, 15], target: 14 },
    "sliding-window-max-sum": { values: [2, 1, 5, 1, 3, 2, 7, 1], k: 3 },
    "sliding-window-longest-unique": { values: [1, 2, 3, 1, 2, 4, 5, 3] },
    "prefix-sum": { values: [3, 1, 4, 1, 5, 9, 2] },
    kadane: { values: [-2, 1, -3, 4, -1, 2, 1, -5, 4] },
    "dutch-flag": { values: [2, 0, 2, 1, 1, 0, 2, 0, 1] },
    "monotonic-stack-next-greater": { values: [2, 1, 5, 6, 2, 3] },
    "bubble-sort": { values: [5, 1, 4, 2, 8, 3] },
    "insertion-sort": { values: [7, 3, 5, 1, 6, 2] },
    "selection-sort": { values: [6, 2, 8, 1, 4] },
    "merge-sort": { values: [8, 3, 5, 1, 9, 2, 7, 4] },
    "quick-sort": { values: [7, 2, 9, 4, 3, 8, 5] },
    "counting-sort": { values: [3, 1, 4, 1, 5, 0, 2, 1] },
    reverse: { values: [1, 2, 3, 4, 5, 6] },
    rotate: { values: [1, 2, 3, 4, 5, 6, 7], k: 3 },
    "move-zeroes": { values: [0, 1, 0, 3, 12, 0, 5] },
    "remove-duplicates": { values: [1, 1, 2, 2, 2, 3, 4, 4] },
  },
  normalise: (raw) => ({
    values: Array.isArray(raw.values) ? (raw.values as unknown[]).map(Number).filter((n) => Number.isFinite(n)).slice(0, 40) : [1, 2, 3],
    target: raw.target === undefined ? undefined : Number(raw.target),
    k: raw.k === undefined ? undefined : Number(raw.k),
    leadingZero: raw.leadingZero === true ? true : undefined,
    query: Array.isArray(raw.query) && raw.query.length === 2 ? [Number(raw.query[0]), Number(raw.query[1])] : undefined,
    mod: raw.mod === undefined ? undefined : Number(raw.mod),
    peak: raw.peak === true ? true : undefined,
    closest: raw.closest === true ? true : undefined,
    predicate: typeof raw.predicate === "string" ? raw.predicate.slice(0, 24) : undefined,
  }),
};
