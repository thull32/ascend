// Array algorithms: searching, two pointers, sliding windows, sorting.
import { Bars, Cells, Legend, Vars, type Tone } from "../primitives";
import { Frames, type Family, type RendererProps } from "../engine";

export interface ArrayInput {
  values: number[];
  target?: number;
  k?: number;
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
}

type G = (input: ArrayInput) => ReturnType<Frames<ArrayState>["done"]>;

function make(values: number[], bars = false) {
  const s: ArrayState = { values: [...values], tones: values.map(() => undefined), pointers: {}, vars: {}, bars };
  const f = new Frames<ArrayState>(() => ({ ...s, values: [...s.values], tones: [...s.tones], pointers: { ...s.pointers }, vars: { ...s.vars }, aux: s.aux ? { ...s.aux, values: [...s.aux.values], tones: s.aux.tones ? [...s.aux.tones] : undefined } : undefined }));
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
      f.push(`values[mid] = ${v} equals the target. Found at index ${mid} after ${steps} comparisons (⌈log₂ ${values.length}⌉ = ${Math.ceil(Math.log2(Math.max(2, values.length)))} max).`, "found");
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

const binarySearchFirstTrue: G = ({ values, target = 0 }) => {
  // Predicate: values[i] >= target. Find the first index where it holds.
  const { s, f, clearTones } = make(values);
  let lo = 0;
  let hi = values.length;
  f.push(`Predicate P(i) = values[i] ≥ ${target} is monotone (false…false true…true). Find the first true. Search space [lo, hi) = [0, ${hi}).`);
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    clearTones();
    for (let i = 0; i < values.length; i++) if (i < lo || i >= hi) s.tones[i] = "muted";
    s.tones[mid] = "compare";
    s.pointers = { lo, mid, hi: hi < values.length ? hi : undefined };
    s.vars = { lo, hi, mid, "P(mid)": values[mid]! >= target };
    if (values[mid]! >= target) {
      f.push(`P(${mid}) is true, so the answer is ≤ ${mid}: hi = mid.`, "true");
      hi = mid;
    } else {
      f.push(`P(${mid}) is false, so the answer is > ${mid}: lo = mid + 1.`, "false");
      lo = mid + 1;
    }
  }
  clearTones();
  if (lo < values.length) s.tones[lo] = "done";
  s.pointers = { lo };
  s.vars = { answer: lo };
  f.push(lo < values.length ? `lo = hi = ${lo}: the first index with values[i] ≥ ${target}.` : `No index satisfies the predicate; answer is n = ${lo} (insertion point).`, "done");
  return f.done();
};

const twoPointersSum: G = ({ values, target = 0 }) => {
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

const prefixSum: G = ({ values }) => {
  const { s, f } = make(values);
  const prefix: (number | null)[] = values.map(() => null);
  let acc = 0;
  s.aux = { label: "prefix", values: [...prefix] };
  f.push(`prefix[i] = sum of values[0..i]. Build it once in O(n); then any range sum is one subtraction.`);
  for (let i = 0; i < values.length; i++) {
    acc += values[i]!;
    prefix[i] = acc;
    s.tones.fill(undefined);
    s.tones[i] = "compare";
    s.aux = { label: "prefix", values: [...prefix], tones: prefix.map((_, j) => (j === i ? "done" : j < i ? "visited" : undefined)) };
    f.push(`prefix[${i}] = prefix[${i - 1}] + values[${i}] = ${acc - values[i]!} + ${values[i]} = ${acc}.`, "build");
  }
  if (values.length >= 3) {
    const a = 1;
    const b = values.length - 2;
    s.tones.fill(undefined);
    for (let i = a; i <= b; i++) s.tones[i] = "active";
    s.aux = { label: "prefix", values: [...prefix], tones: prefix.map((_, j) => (j === b ? "done" : j === a - 1 ? "danger" : undefined)) };
    s.vars = { [`sum[${a}..${b}]`]: prefix[b]! - prefix[a - 1]! };
    f.push(`Range sum [${a}, ${b}] = prefix[${b}] − prefix[${a - 1}] = ${prefix[b]} − ${prefix[a - 1]} = ${prefix[b]! - prefix[a - 1]!}. O(1) per query.`, "query");
  }
  return f.done();
};

const kadane: G = ({ values }) => {
  const { s, f, clearTones } = make(values);
  let cur = 0;
  let best = -Infinity;
  let start = 0;
  let bestL = 0;
  let bestR = 0;
  f.push(`Kadane: at each index decide "extend the running subarray or start fresh here".`);
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    let note: string;
    if (cur + v < v) {
      cur = v;
      start = i;
      note = `cur + ${v} < ${v}: the running sum was a burden, restart at ${i}.`;
    } else {
      cur += v;
      note = `Extend: cur = ${cur}.`;
    }
    if (cur > best) {
      best = cur;
      bestL = start;
      bestR = i;
    }
    clearTones();
    for (let j = start; j <= i; j++) s.tones[j] = "active";
    s.tones[i] = "compare";
    s.pointers = { start, i };
    s.vars = { cur, best };
    f.push(`${note} best = ${best}.`, cur === v && start === i ? "restart" : "extend");
  }
  clearTones();
  for (let j = bestL; j <= bestR; j++) s.tones[j] = "done";
  s.pointers = {};
  f.push(`Maximum subarray sum is ${best} over [${bestL}, ${bestR}]. O(n) time, O(1) space.`, "done");
  return f.done();
};

const dutchFlag: G = ({ values }) => {
  const { s, f, clearTones } = make(values);
  let lo = 0;
  let mid = 0;
  let hi = values.length - 1;
  const a = s.values;
  f.push(`Three-way partition (0/1/2). Invariant: [0,lo) are 0s, [lo,mid) are 1s, (hi,n) are 2s, [mid,hi] unknown.`);
  while (mid <= hi) {
    clearTones();
    for (let i = 0; i < lo; i++) s.tones[i] = "done";
    for (let i = lo; i < mid; i++) s.tones[i] = "visited";
    for (let i = hi + 1; i < a.length; i++) s.tones[i] = "danger";
    s.tones[mid] = "compare";
    s.pointers = { lo, mid, hi };
    const v = a[mid]!;
    if (v === 0) {
      [a[lo], a[mid]] = [a[mid]!, a[lo]!];
      f.push(`a[mid] = 0: swap with a[lo], advance both.`, "swap lo");
      lo++;
      mid++;
    } else if (v === 2) {
      [a[mid], a[hi]] = [a[hi]!, a[mid]!];
      f.push(`a[mid] = 2: swap with a[hi], shrink hi. mid stays (the swapped-in value is unknown).`, "swap hi");
      hi--;
    } else {
      f.push(`a[mid] = 1: already in the middle region, advance mid.`, "skip");
      mid++;
    }
  }
  clearTones();
  f.push(`Partitioned in one pass with O(1) extra space.`, "done");
  return f.done();
};

const monotonicNextGreater: G = ({ values }) => {
  const { s, f, clearTones } = make(values);
  const stack: number[] = [];
  const ans: (number | null)[] = values.map(() => null);
  s.aux = { label: "stack (indices)", values: [] };
  f.push(`Next greater element with a decreasing stack of indices: each index is pushed and popped at most once.`);
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
    f.push(`Push ${i}. Stack values stay decreasing: ${stack.map((j) => values[j]).join(" > ") || "∅"}.`, "push");
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
    const mid = lo + Math.floor((hi - lo) / 2);
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
  const max = Math.max(0, ...values);
  const counts = new Array<number>(max + 1).fill(0);
  s.aux = { label: "count[value]", values: [...counts] };
  f.push(`Counting sort: values are small non-negative integers (max ${max}), so count occurrences instead of comparing.`);
  for (let i = 0; i < values.length; i++) {
    counts[values[i]!]!++;
    clearTones();
    s.tones[i] = "compare";
    s.aux = { label: "count[value]", values: [...counts], tones: counts.map((_, v) => (v === values[i] ? "done" : undefined)) };
    f.push(`count[${values[i]}]++ → ${counts[values[i]!]}.`, "count");
  }
  let k = 0;
  for (let v = 0; v <= max; v++) {
    for (let c = 0; c < counts[v]!; c++) {
      s.values[k] = v;
      clearTones();
      for (let t = 0; t < k; t++) s.tones[t] = "visited";
      s.tones[k] = "done";
      s.aux = { label: "count[value]", values: [...counts], tones: counts.map((_, i) => (i === v ? "active" : undefined)) };
      f.push(`Write value ${v} at index ${k}.`, "write");
      k++;
    }
  }
  clearTones();
  s.tones.fill("done");
  f.push(`Sorted in O(n + k) with k = ${max + 1} buckets: no comparisons at all.`, "done");
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
  }),
};
