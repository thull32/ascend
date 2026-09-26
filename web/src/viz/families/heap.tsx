// Binary heaps: the backing array and the implicit tree it encodes are
// drawn side by side with identical tones, and every sift is shown one
// comparison at a time with its path highlighted.
import { Cells, Circle, Legend, Vars, toneStroke, type Tone } from "../primitives";
import { Frames, type Family, type RendererProps } from "../engine";
import { Readouts, type Readout } from "./tree";

export type HeapOp = ["push", number] | ["pop"];

export interface HeapInput {
  values: number[];
  operations?: HeapOp[];
  kind?: "min" | "max";
  k?: number;
}

export interface HeapView {
  label: string;
  kind: "min" | "max";
  values: number[];
  tones: (Tone | undefined)[];
  /** Live heap size; indices ≥ size are not part of the heap (heap-sort's sorted suffix). */
  size: number;
  /** Indices along the current sift path; consecutive pairs are highlighted edges. */
  path: number[];
}

export interface HeapState {
  heaps: HeapView[];
  readouts: Readout[];
  vars: Record<string, unknown>;
}

const MAX_VALUES = 31;
const MAX_OPS = 40;

type G = (input: HeapInput) => ReturnType<Frames<HeapState>["done"]>;

class H {
  s: HeapState = { heaps: [], readouts: [], vars: {} };
  f = new Frames<HeapState>(() => ({
    heaps: this.s.heaps.map((h) => ({ ...h, values: [...h.values], tones: [...h.tones], path: [...h.path] })),
    readouts: this.s.readouts.map((r) => ({ ...r, values: [...r.values], tones: r.tones ? [...r.tones] : undefined, labels: r.labels ? [...r.labels] : undefined, pointers: r.pointers ? { ...r.pointers } : undefined })),
    vars: { ...this.s.vars },
  }));
  constructor(views: { label: string; kind: "min" | "max"; values?: number[] }[]) {
    this.s.heaps = views.map((v) => ({ label: v.label, kind: v.kind, values: [...(v.values ?? [])], tones: (v.values ?? []).map(() => undefined), size: (v.values ?? []).length, path: [] }));
  }
  heap(i = 0): HeapView {
    const h = this.s.heaps[i];
    if (!h) throw new Error(`no heap ${i}`);
    return h;
  }
  /** True when `a` should sit above `b`. */
  beats(h: HeapView, a: number, b: number): boolean {
    return h.kind === "min" ? a < b : a > b;
  }
  word(h: HeapView): string {
    return h.kind === "min" ? "smaller" : "larger";
  }
  clear(): void {
    for (const h of this.s.heaps) {
      h.tones = h.values.map((_, i) => (i >= h.size ? "done" : undefined));
      h.path = [];
    }
  }
  /** Clear tones but keep heap `hi`'s last sift path and mark where it ended. */
  showPath(hi: number): void {
    const h = this.heap(hi);
    const path = [...h.path];
    this.clear();
    h.path = path;
    const end = path[path.length - 1];
    if (end !== undefined && end < h.size) h.tones[end] = "active";
  }
  at(h: HeapView, i: number): number {
    const v = h.values[i];
    if (v === undefined) throw new Error(`index ${i} out of range`);
    return v;
  }
  swap(h: HeapView, i: number, j: number): void {
    const vi = this.at(h, i);
    const vj = this.at(h, j);
    h.values[i] = vj;
    h.values[j] = vi;
  }
  /** Sift index `i` up; with `quiet` no frames are pushed (the path is still recorded). */
  siftUp(hi: number, i: number, quiet = false): number {
    const h = this.heap(hi);
    const path = [i];
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      const vi = this.at(h, i);
      const vp = this.at(h, p);
      if (!quiet) {
        this.clear();
        h.path = [...path];
        h.tones[i] = "active";
        h.tones[p] = "compare";
      }
      if (this.beats(h, vi, vp)) {
        this.swap(h, i, p);
        if (!quiet) {
          h.tones[i] = "compare";
          h.tones[p] = "active";
          this.f.push(`${vi} at index ${i} is ${this.word(h)} than its parent ${vp} at index ${p} = ⌊(${i}−1)/2⌋: swap them and keep sifting up.`, "swap up");
        }
        i = p;
        path.push(i);
      } else {
        if (!quiet) this.f.push(`${vi} is not ${this.word(h)} than its parent ${vp}: the heap property holds along this path, stop.`, "settled");
        break;
      }
      if (this.f.full) break;
    }
    h.path = path;
    return i;
  }
  /** Sift index `i` down within the live heap; with `quiet` no frames are pushed. */
  siftDown(hi: number, i: number, quiet = false, ctx = ""): number {
    const h = this.heap(hi);
    const path = [i];
    for (;;) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let best = i;
      if (l < h.size && this.beats(h, this.at(h, l), this.at(h, best))) best = l;
      if (r < h.size && this.beats(h, this.at(h, r), this.at(h, best))) best = r;
      if (!quiet) {
        this.clear();
        h.path = [...path];
        h.tones[i] = "active";
        if (l < h.size) h.tones[l] = "compare";
        if (r < h.size) h.tones[r] = "compare";
      }
      const kids = [l, r].filter((c) => c < h.size).map((c) => this.at(h, c));
      if (best === i) {
        if (!quiet) this.f.push(`${ctx}${this.at(h, i)} at index ${i} is already ${kids.length ? `${this.word(h)} than or equal to its child${kids.length > 1 ? "ren" : ""} ${kids.join(" and ")}` : "a leaf"}: stop.`, "settled");
        break;
      }
      const vi = this.at(h, i);
      const vb = this.at(h, best);
      this.swap(h, i, best);
      if (!quiet) {
        h.tones[i] = "compare";
        h.tones[best] = "active";
        this.f.push(`${ctx}Children of index ${i} are ${kids.join(" and ")}; the ${this.word(h)} one, ${vb} at index ${best}, beats ${vi}: swap and continue down.`, "swap down");
      }
      i = best;
      path.push(i);
      if (this.f.full) break;
    }
    h.path = path;
    return i;
  }
}

function pushValue(H_: H, hi: number, v: number, quiet = false): void {
  const h = H_.heap(hi);
  h.values.length = h.size;
  h.values.push(v);
  h.size = h.values.length;
  h.tones = h.values.map(() => undefined);
  if (!quiet) {
    H_.clear();
    h.tones[h.size - 1] = "active";
    h.path = [h.size - 1];
    H_.f.push(`push(${v}): append at index ${h.size - 1}, the next free slot (the tree stays complete), then sift up.`, "push");
  }
  H_.siftUp(hi, h.size - 1, quiet);
}

function popValue(H_: H, hi: number, quiet = false): number | undefined {
  const h = H_.heap(hi);
  if (h.size === 0) return undefined;
  const top = H_.at(h, 0);
  const last = h.size - 1;
  if (last === 0) {
    h.values = [];
    h.size = 0;
    h.tones = [];
    h.path = [];
    if (!quiet) H_.f.push(`pop(): the heap held only ${top}; it is now empty.`, "pop");
    return top;
  }
  H_.swap(h, 0, last);
  h.values.length = last;
  h.size = last;
  h.tones = h.values.map(() => undefined);
  if (!quiet) {
    H_.clear();
    h.tones[0] = "active";
    H_.f.push(`pop(): remove the root ${top} (the ${h.kind}), move the last leaf ${H_.at(h, 0)} into index 0 to keep the tree complete, then sift it down.`, "pop");
  }
  H_.siftDown(hi, 0, quiet);
  return top;
}

const kindOf = (input: HeapInput, fallback: "min" | "max" = "min") => input.kind ?? fallback;

const pushPop: G = (input) => {
  const kind = kindOf(input);
  const ops: HeapOp[] = input.operations && input.operations.length ? input.operations : [...input.values.map((v): HeapOp => ["push", v]), ...input.values.map((): HeapOp => ["pop"])].slice(0, MAX_OPS);
  const H_ = new H([{ label: `${kind}-heap`, kind }]);
  const out: number[] = [];
  const sync = (i: number) => {
    H_.s.readouts = [
      { label: "operations", values: ops.map((o) => (o[0] === "push" ? `push ${o[1]}` : "pop")), tones: ops.map((_, j) => (j < i ? "visited" : j === i ? "active" : undefined)), labels: [], pointers: i < ops.length ? { next: i } : undefined },
      { label: "popped (in order)", values: [...out], tones: out.map(() => "done" as Tone) },
    ];
    H_.s.vars = { size: H_.heap().size, peak: Math.max(H_.heap().size, Number(H_.s.vars.peak ?? 0)) };
  };
  if (ops.length === 0) {
    H_.f.push(`No operations: give \`values\` (pushed then popped) or \`operations\` like [["push", 5], ["pop"]].`, "empty");
    return H_.f.done();
  }
  sync(0);
  H_.f.push(`A ${kind}-heap in an array: children of index i are 2i+1 and 2i+2, parent is ⌊(i−1)/2⌋. Every parent is ${kind === "min" ? "≤" : "≥"} its children, so the ${kind} is always at index 0.`);
  ops.forEach((op, i) => {
    if (H_.f.full) return;
    sync(i);
    if (op[0] === "push") {
      pushValue(H_, 0, op[1]);
    } else {
      const v = popValue(H_, 0);
      if (v === undefined) {
        H_.clear();
        H_.f.push(`pop() on an empty heap: nothing to remove.`, "empty");
      } else out.push(v);
    }
    sync(i + 1);
  });
  H_.clear();
  sync(ops.length);
  H_.f.push(`Each push and pop touches one root-to-leaf path: O(log n). Popped order ${out.length ? out.join(", ") : "(nothing)"}; peak size ${H_.s.vars.peak}.`, "done");
  return H_.f.done();
};

const heapify: G = (input) => {
  const kind = kindOf(input);
  const H_ = new H([{ label: `${kind}-heap`, kind, values: input.values }]);
  const h = H_.heap();
  const n = h.size;
  if (n === 0) {
    H_.f.push(`No values to heapify.`, "empty");
    return H_.f.done();
  }
  H_.clear();
  H_.f.push(`Floyd's heapify: take the array as-is, then sift down every internal node from the last one, index ⌊n/2⌋−1 = ${Math.floor(n / 2) - 1}, back to the root. Leaves are already valid heaps.`);
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    H_.clear();
    for (let j = i + 1; j < n; j++) h.tones[j] = "visited";
    h.tones[i] = "active";
    H_.s.vars = { i, "subtrees fixed": n - 1 - i };
    H_.f.push(`Index ${i} (value ${H_.at(h, i)}): both of its subtrees are already heaps, so one sift-down makes the subtree rooted here a heap.`, "sift");
    H_.siftDown(0, i, false);
    if (H_.f.full) return H_.f.done();
  }
  H_.clear();
  h.tones = h.values.map(() => "done");
  H_.s.vars = { n, "naive n pushes": `O(n log n)`, "Floyd": "O(n)" };
  H_.f.push(`Heapified in O(n): most nodes are near the bottom and sift only a step or two, so the total sift work sums to a geometric series ≤ 2n, not n log n.`, "done");
  return H_.f.done();
};

const heapSort: G = (input) => {
  const kind = kindOf(input, "max");
  const H_ = new H([{ label: `${kind}-heap · sorted suffix`, kind, values: input.values }]);
  const h = H_.heap();
  const n = h.size;
  if (n === 0) {
    H_.f.push(`No values to sort.`, "empty");
    return H_.f.done();
  }
  const order = kind === "max" ? "ascending" : "descending";
  H_.clear();
  H_.f.push(`Heap sort, ${order}: first heapify the array in place into a ${kind}-heap, then repeatedly swap the root (the ${kind}) to the end and shrink the heap by one.`);
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    H_.siftDown(0, i, false, `Heapify, index ${i}: `);
    if (H_.f.full) return H_.f.done();
  }
  H_.clear();
  h.tones[0] = "done";
  H_.s.vars = { phase: "extract", heapSize: h.size };
  H_.f.push(`The array is a ${kind}-heap: the ${kind}, ${H_.at(h, 0)}, is at index 0. Now extract.`, "heapified");
  while (h.size > 1) {
    const last = h.size - 1;
    const top = H_.at(h, 0);
    H_.swap(h, 0, last);
    h.size = last;
    H_.clear();
    h.tones[0] = "active";
    h.tones[last] = "done";
    H_.s.vars = { phase: "extract", heapSize: h.size, sorted: h.values.slice(h.size) };
    H_.f.push(`Swap root ${top} with the last heap element ${H_.at(h, 0)} at index ${last}, then shrink the heap to ${h.size}: ${top} is now in its final sorted position.`, "extract");
    H_.siftDown(0, 0, false);
    if (H_.f.full) return H_.f.done();
  }
  h.size = 0;
  H_.clear();
  H_.s.vars = { sorted: [...h.values] };
  H_.f.push(`Sorted ${order} in place: O(n) heapify + n extractions × O(log n) = O(n log n) worst case, O(1) extra space, but not stable.`, "done");
  return H_.f.done();
};

const topK: G = (input) => {
  const kind = kindOf(input);
  const k = Math.max(1, Math.min(input.k ?? 3, Math.max(1, input.values.length)));
  const keep = kind === "min" ? "largest" : "smallest";
  const H_ = new H([{ label: `${kind}-heap, capacity ${k}`, kind }]);
  const h = H_.heap();
  const stream = input.values;
  const status: (Tone | undefined)[] = stream.map(() => undefined);
  const sync = (i: number) => {
    H_.s.readouts = [{ label: "stream", values: [...stream], tones: status.map((t, j) => (j === i ? "active" : t)), pointers: i < stream.length ? { i } : undefined }];
    H_.s.vars = { k, size: h.size, threshold: h.size >= k ? h.values[0] : "none yet" };
  };
  if (stream.length === 0) {
    H_.f.push(`No values to stream.`, "empty");
    return H_.f.done();
  }
  sync(0);
  H_.f.push(`Top-${k} ${keep} with a ${kind}-heap of size ${k}: the root is the ${kind === "min" ? "smallest" : "largest"} of the ${k} best seen so far, so it is the only element a newcomer must beat.`);
  stream.forEach((v, i) => {
    if (H_.f.full) return;
    sync(i);
    if (h.size < k) {
      pushValue(H_, 0, v);
      status[i] = "done";
    } else {
      const root = H_.at(h, 0);
      H_.clear();
      h.tones[0] = "compare";
      sync(i);
      if (H_.beats(h, v, root) || v === root) {
        status[i] = "muted";
        H_.f.push(`${v} vs root ${root}: ${v} is not ${kind === "min" ? "larger" : "smaller"} than the ${kind === "min" ? "smallest" : "largest"} of the current top ${k}, so reject it in O(1).`, "reject");
      } else {
        h.values[0] = v;
        h.tones[0] = "active";
        status[i] = "done";
        H_.f.push(`${v} vs root ${root}: ${v} beats it, so ${root} leaves the top ${k}. Overwrite the root with ${v} and sift down.`, "replace");
        H_.siftDown(0, 0, false);
      }
    }
    sync(i + 1);
  });
  H_.clear();
  h.tones = h.values.map(() => "done");
  sync(stream.length);
  const result = [...h.values].sort((a, b) => (kind === "min" ? b - a : a - b));
  H_.s.vars = { k, [`top ${k} ${keep}`]: result, [`${k}th ${keep} (root)`]: h.values[0] };
  H_.f.push(`The heap holds the ${k} ${keep}: ${result.join(", ")}. n values × O(log k) each = O(n log k), with O(k) memory, which is why it works on streams.`, "done");
  return H_.f.done();
};

const twoHeapsMedian: G = (input) => {
  const H_ = new H([{ label: "low (max-heap)", kind: "max" }, { label: "high (min-heap)", kind: "min" }]);
  const low = H_.heap(0);
  const high = H_.heap(1);
  const stream = input.values;
  const medians: (number | string)[] = [];
  const median = () => (low.size > high.size ? H_.at(low, 0) : low.size === 0 ? null : (H_.at(low, 0) + H_.at(high, 0)) / 2);
  const sync = (i: number) => {
    H_.s.readouts = [
      { label: "stream", values: [...stream], tones: stream.map((_, j) => (j < i ? "visited" : j === i ? "active" : undefined)), pointers: i < stream.length ? { i } : undefined },
      { label: "median after each value", values: [...medians], tones: medians.map(() => "done" as Tone) },
    ];
    H_.s.vars = { "low size": low.size, "high size": high.size, median: median() };
  };
  if (stream.length === 0) {
    H_.f.push(`No values to stream.`, "empty");
    return H_.f.done();
  }
  sync(0);
  H_.f.push(`Running median with two heaps: low is a max-heap of the smaller half, high a min-heap of the larger half. Invariants: every low value ≤ every high value, and low.size − high.size ∈ {0, 1}.`);
  stream.forEach((v, i) => {
    if (H_.f.full) return;
    sync(i);
    pushValue(H_, 0, v, true);
    H_.showPath(0);
    H_.f.push(`Push ${v} into low (max-heap) and sift up; the sift path is highlighted.`, "push low");
    const moved = popValue(H_, 0, true)!;
    pushValue(H_, 1, moved, true);
    H_.showPath(1);
    if (low.size) low.tones[0] = "compare";
    H_.f.push(`Move low's max, ${moved}, across to high: this guarantees every value in low is ≤ every value in high.`, "cross");
    if (high.size > low.size) {
      const back = popValue(H_, 1, true)!;
      pushValue(H_, 0, back, true);
      H_.showPath(0);
      if (high.size) high.tones[0] = "compare";
      H_.f.push(`high now has more elements than low, so move high's min, ${back}, back to low to restore the size balance.`, "rebalance");
    }
    const m = median();
    medians.push(m ?? "–");
    H_.clear();
    if (low.size) low.tones[0] = "done";
    if (high.size && low.size === high.size) high.tones[0] = "done";
    sync(i + 1);
    H_.f.push(low.size === high.size ? `Sizes equal (${low.size} each): the median is the average of the two roots, (${H_.at(low, 0)} + ${H_.at(high, 0)}) / 2 = ${m}.` : `low has one extra element: the median is low's root, ${m}.`, "median");
  });
  H_.clear();
  if (low.size) low.tones[0] = "done";
  if (high.size && low.size === high.size) high.tones[0] = "done";
  sync(stream.length);
  H_.f.push(`Each value costs at most three heap operations, O(log n), and the median is always readable from the roots in O(1). Sorting after every insert would be O(n log n) per query.`, "done");
  return H_.f.done();
};

// ---- renderer ----

function HeapTree({ h }: { h: HeapView }) {
  const n = h.size;
  const r = 14;
  const SX = 2 * r + 6;
  const SY = 46;
  const depth = n === 0 ? 0 : Math.floor(Math.log2(n)) + 1;
  const leaves = Math.max(1, 2 ** Math.max(0, depth - 1));
  const W = leaves * SX + 8;
  const Hh = Math.max(1, depth) * SY + 8;
  const pos = (i: number): [number, number] => {
    const d = Math.floor(Math.log2(i + 1));
    const p = i - (2 ** d - 1);
    const slot = (W - 8) / 2 ** d;
    return [4 + (p + 0.5) * slot, r + 4 + d * SY];
  };
  if (n === 0) return <div className="rounded-md border border-dashed border-line px-3 py-4 text-center text-xs text-muted">empty heap</div>;
  const onPath = new Set<string>();
  for (let i = 1; i < h.path.length; i++) onPath.add(`${Math.min(h.path[i - 1]!, h.path[i]!)}-${Math.max(h.path[i - 1]!, h.path[i]!)}`);
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} width={W} height={Hh} className="shrink-0" role="img" aria-label="Heap as a tree">
      {Array.from({ length: n }, (_, i) => {
        if (i === 0) return null;
        const p = Math.floor((i - 1) / 2);
        const [x1, y1] = pos(p);
        const [x2, y2] = pos(i);
        const hot = onPath.has(`${p}-${i}`);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={hot ? toneStroke.path : toneStroke.default} strokeWidth={hot ? 2.5 : 1.5} />;
      })}
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = pos(i);
        return <Circle key={i} x={x} y={y} r={r} label={h.values[i] ?? ""} tone={h.tones[i] ?? "default"} />;
      })}
    </svg>
  );
}

function Renderer({ frame }: RendererProps<HeapInput, HeapState>) {
  const { state } = frame;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-6">
        {state.heaps.map((h, i) => (
          <div key={i} className="flex flex-col items-start gap-2">
            <div className="text-[11px] text-muted">{h.label}</div>
            <HeapTree h={h} />
            <Cells values={h.values} tones={h.tones} pointers={h.path.length ? { i: h.path[h.path.length - 1] } : undefined} size="sm" />
          </div>
        ))}
        <Readouts readouts={state.readouts} />
      </div>
      <Vars vars={state.vars} />
      <Legend items={[{ tone: "active", label: "moving element" }, { tone: "compare", label: "compared with" }, { tone: "path", label: "sift path" }, { tone: "visited", label: "processed" }, { tone: "done", label: "final / sorted" }, { tone: "muted", label: "rejected" }]} />
    </div>
  );
}

function parseOps(raw: unknown): HeapOp[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ops: HeapOp[] = [];
  for (const item of raw) {
    let op: string | undefined;
    let val: unknown;
    if (Array.isArray(item)) {
      op = String(item[0] ?? "");
      val = item[1];
    } else if (typeof item === "string") {
      const [a, b] = item.trim().split(/[\s(]+/);
      op = a;
      val = b?.replace(")", "");
    } else if (typeof item === "number") {
      op = "push";
      val = item;
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      op = String(o.op ?? o.type ?? o.action ?? "");
      val = o.value ?? o.val ?? o.v;
    }
    op = op?.toLowerCase();
    if (op === "push" || op === "insert" || op === "add" || op === "offer") {
      const n = Number(val);
      if (Number.isFinite(n)) ops.push(["push", n]);
    } else if (op === "pop" || op === "extract" || op === "poll" || op === "remove" || op === "extract-min" || op === "extract-max") ops.push(["pop"]);
    if (ops.length >= MAX_OPS) break;
  }
  return ops.length ? ops : undefined;
}

export const heapFamily: Family<HeapInput, HeapState> = {
  name: "Heap",
  description: "Binary heaps as an array and a tree: push, pop, heapify, heap sort and the top-k and two-heaps patterns.",
  Renderer,
  algorithms: {
    "push-pop": pushPop,
    heapify,
    "heap-sort": heapSort,
    "top-k": topK,
    "two-heaps-median": twoHeapsMedian,
  },
  labels: {
    "push-pop": "Push and pop",
    heapify: "Heapify (Floyd)",
    "heap-sort": "Heap sort",
    "top-k": "Top-k with a bounded heap",
    "two-heaps-median": "Running median with two heaps",
  },
  examples: {
    "push-pop": { values: [], kind: "min", operations: [["push", 5], ["push", 3], ["push", 8], ["push", 1], ["pop"], ["push", 2], ["pop"], ["pop"]] },
    heapify: { values: [9, 4, 7, 1, 8, 3, 6, 2, 5], kind: "min" },
    "heap-sort": { values: [4, 10, 3, 5, 1, 8], kind: "max" },
    "top-k": { values: [3, 2, 1, 5, 6, 4, 9, 7], k: 3, kind: "min" },
    "two-heaps-median": { values: [5, 15, 1, 3, 8, 7] },
  },
  normalise: (raw) => {
    const values = Array.isArray(raw.values) ? (raw.values as unknown[]).map(Number).filter((n) => Number.isFinite(n)).slice(0, MAX_VALUES) : [];
    const operations = parseOps(raw.operations ?? raw.ops);
    const kindRaw = String(raw.kind ?? raw.heap ?? "").toLowerCase();
    const kind = kindRaw.startsWith("max") ? "max" : kindRaw.startsWith("min") ? "min" : undefined;
    const k = raw.k === undefined ? undefined : Number(raw.k);
    // If the author gave values but the example only had operations, use the values.
    const opsFromExample = Object.values(heapFamily.examples).some((e) => e.operations !== undefined && e.operations === raw.operations);
    return { values, operations: opsFromExample && values.length ? undefined : operations, kind, k: k !== undefined && Number.isFinite(k) ? Math.max(1, Math.floor(k)) : undefined };
  },
};
