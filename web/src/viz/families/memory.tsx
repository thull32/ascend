// Memory scenarios: a stack region (newest frame drawn on top) beside a heap
// region (boxes with addresses, refcounts and mark bits), with arrows for
// every pointer; or a page-table / cache-line grid for the scenarios about
// the memory hierarchy. Scenarios are scripts over the small `Mem` DSL.
import { Legend, Vars, toneClass, toneFill, toneStroke, type Tone } from "../primitives";
import { Frames, clone, type Family, type RendererProps } from "../engine";
import { cn } from "../../lib/utils";

export interface MemoryInput {
  values?: number[];
  n?: number;
  /** call-stack: which function to trace: "factorial" (default), "ways", "reverse" or "calls". */
  fn?: string;
  /** call-stack factorial: the base case is n <= base (0 or 1; default 0). */
  base?: number;
  /** call-stack factorial: the function name shown (default "factorial"). */
  name?: string;
  /** call-stack "calls": the chain of functions main() calls, outermost first. */
  calls?: string[];
  /** call-stack "calls": freeze the deepest point as a profiler sample. */
  sample?: boolean;
  /** reference-counting: write the steps in "python" or "rust" (default: language-neutral pseudocode). */
  lang?: string;
  /** dynamic-array-growth: a garbage-collected runtime (Go): old blocks stay alive while referenced. */
  gc?: boolean;
  /** stack-heap: how many threads (1..3); each extra thread gets its own stack over the shared heap. */
  threads?: number;
  [k: string]: unknown;
}

export interface Field {
  name: string;
  value: string;
  /** Heap object id this field points at (an arrow is drawn). */
  ptr?: string;
  tone?: Tone;
  /** Draw the arrow dashed (a borrow / weak reference). */
  dashed?: boolean;
}

export interface StackFrame {
  id: string;
  name: string;
  fields: Field[];
  tone?: Tone;
  /** Which thread's stack the frame is on (1 when omitted). */
  thread?: number;
}

export interface HeapObj {
  id: string;
  addr: string;
  label: string;
  fields: Field[];
  rc?: number;
  mark?: boolean;
  tone?: Tone;
  freed?: boolean;
}

export interface PageState {
  table: { vpn: number; pfn: number | null; tone?: Tone }[];
  frames: { pfn: number; vpn: number | null; tone?: Tone }[];
  disk: number[];
}

export interface CacheState {
  lineSize: number;
  n: number;
  memTones: (Tone | undefined)[];
  lines: { slot: number; line: number | null; tone?: Tone }[];
}

export interface MemoryState {
  stack: StackFrame[];
  heap: HeapObj[];
  pages?: PageState;
  cache?: CacheState;
  log: string[];
  vars: Record<string, unknown>;
}

type G = (input: MemoryInput) => ReturnType<Frames<MemoryState>["done"]>;

class Mem {
  s: MemoryState = { stack: [], heap: [], log: [], vars: {} };
  f: Frames<MemoryState>;
  private nextAddr = 0x1000;
  private frameSeq = 0;
  constructor() {
    this.f = new Frames<MemoryState>(() => clone(this.s));
  }
  frame(id: string): StackFrame {
    const fr = this.s.stack.find((x) => x.id === id);
    if (!fr) throw new Error(`unknown frame ${id}`);
    return fr;
  }
  obj(id: string): HeapObj {
    const o = this.s.heap.find((x) => x.id === id);
    if (!o) throw new Error(`unknown object ${id}`);
    return o;
  }
  top(): StackFrame | undefined {
    return this.s.stack[this.s.stack.length - 1];
  }
  call(name: string, fields: Field[] = [], tone: Tone = "active"): StackFrame {
    const fr: StackFrame = { id: `f${this.frameSeq++}`, name, fields, tone };
    for (const other of this.s.stack) other.tone = undefined;
    this.s.stack.push(fr);
    return fr;
  }
  /** Pop the top frame of one thread's stack (threads interleave in `stack`). */
  retThread(thread: number): StackFrame | undefined {
    for (let i = this.s.stack.length - 1; i >= 0; i--) {
      if ((this.s.stack[i]!.thread ?? 1) === thread) {
        const [fr] = this.s.stack.splice(i, 1);
        return fr;
      }
    }
    return undefined;
  }
  ret(): StackFrame | undefined {
    const fr = this.s.stack.pop();
    const t = this.top();
    if (t) t.tone = "active";
    return fr;
  }
  set(fr: StackFrame, name: string, value: string, ptr?: string, opts: { tone?: Tone; dashed?: boolean } = {}) {
    const fld = fr.fields.find((x) => x.name === name);
    if (fld) {
      fld.value = value;
      fld.ptr = ptr;
      fld.tone = opts.tone;
      fld.dashed = opts.dashed;
    } else fr.fields.push({ name, value, ptr, tone: opts.tone, dashed: opts.dashed });
  }
  unset(fr: StackFrame, name: string) {
    fr.fields = fr.fields.filter((x) => x.name !== name);
  }
  alloc(id: string, label: string, fields: Field[] = [], opts: { rc?: number; size?: number; tone?: Tone } = {}): HeapObj {
    const addr = `0x${this.nextAddr.toString(16)}`;
    this.nextAddr += opts.size ?? 0x20;
    const o: HeapObj = { id, addr, label, fields, rc: opts.rc, tone: opts.tone ?? "active" };
    this.s.heap.push(o);
    return o;
  }
  free(id: string) {
    const o = this.obj(id);
    o.freed = true;
    o.tone = "danger";
    o.rc = undefined;
    o.mark = undefined;
  }
  /** Drop freed objects from the picture. */
  purge() {
    this.s.heap = this.s.heap.filter((o) => !o.freed);
  }
  clearTones() {
    for (const o of this.s.heap) if (!o.freed) o.tone = undefined;
    for (const fr of this.s.stack) {
      fr.tone = undefined;
      for (const fld of fr.fields) fld.tone = undefined;
    }
    for (const o of this.s.heap) for (const fld of o.fields) fld.tone = undefined;
    const t = this.top();
    if (t) t.tone = "active";
  }
  vars(v: Record<string, unknown>) {
    this.s.vars = { ...this.s.vars, ...v };
  }
  note(text: string, tag = "step") {
    this.s.log = [...this.s.log.slice(-3), text];
    this.f.push(text, tag);
  }
}

const cap = (values: number[] | undefined, fallback: number[], max: number) => (values && values.length > 0 ? values.slice(0, max) : fallback);

// ---------- stack vs heap ----------

const stackHeap: G = (input) => {
  if ((input.threads ?? 1) >= 2) return stackHeapThreads(input);
  const { values } = input;
  const vals = cap(values, [4, 8, 15], 5);
  const m = new Mem();
  const main = m.call("main()", [{ name: "n", value: String(vals.length) }, { name: "list", value: "null" }]);
  m.vars({ "stack frames": 1, "heap objects": 0 });
  m.note("main() starts: its locals n and list live in a stack frame, which is freed automatically when main returns.", "call");
  const build = m.call("build(n)", [{ name: "n", value: String(vals.length) }, { name: "head", value: "null" }, { name: "i", value: "0" }]);
  m.vars({ "stack frames": 2 });
  m.note("Calling build(n) pushes a new frame on top of main's, and build's locals are separate from main's. (The picture draws the newest frame on top; in memory the stack grows toward lower addresses.)", "call");
  let prev: string | undefined;
  for (let i = 0; i < vals.length && !m.f.full; i++) {
    m.clearTones();
    const id = `node${i}`;
    m.alloc(id, `Node`, [{ name: "val", value: String(vals[i]) }, { name: "next", value: prev ? m.obj(prev).addr : "null", ptr: prev }]);
    m.set(build, "i", String(i));
    m.set(build, "head", m.obj(id).addr, id, { tone: "active" });
    m.vars({ "heap objects": i + 1 });
    m.note(`Iteration ${i}: malloc/new allocates a Node on the heap at ${m.obj(id).addr} and head now points at it; heap memory is not tied to any frame.`, "alloc");
    prev = id;
  }
  m.clearTones();
  m.set(main, "list", m.obj(prev!).addr, prev, { tone: "active" });
  m.ret();
  m.vars({ "stack frames": 1 });
  m.note("build returns head: its frame is popped and its locals vanish, but every Node survives because the heap is managed by explicit allocate/free, not by scope.", "return");
  const print = m.call("print(list)", [{ name: "p", value: m.obj(prev!).addr, ptr: prev, dashed: true }]);
  m.vars({ "stack frames": 2 });
  m.note("print(list) borrows the pointer: two frames now hold addresses into the same heap nodes; copying a pointer copies the address, not the object.", "call");
  m.unset(print, "p");
  m.ret();
  m.vars({ "stack frames": 1 });
  m.note("print returns and its frame is discarded; the heap is unchanged.", "return");
  let cur = prev;
  let freed = 0;
  while (cur && !m.f.full) {
    const o = m.obj(cur);
    const next = o.fields.find((x) => x.name === "next")?.ptr;
    m.clearTones();
    m.free(cur);
    freed++;
    m.set(main, "list", next ? m.obj(next).addr : "null", next);
    m.vars({ "heap objects": vals.length - freed });
    m.note(`free(${o.addr}): the node is returned to the allocator; main advances list to the next node first, otherwise the rest of the list would be leaked.`, "free");
    m.purge();
    cur = next;
  }
  m.ret();
  m.vars({ "stack frames": 0, "heap objects": 0 });
  m.note("main returns with the stack empty and every heap block freed. Stack memory is LIFO and automatic; heap memory outlives frames and must be released explicitly (or by a GC).", "done");
  return m.f.done();
};

/** Two or three threads: one stack each, one heap shared by all of them. */
const stackHeapThreads: G = ({ values, threads }) => {
  const vals = cap(values, [4, 8, 15], 5);
  const nThreads = Math.max(2, Math.min(3, Math.floor(threads ?? 2)));
  const m = new Mem();
  const on = (fr: StackFrame, t: number) => {
    fr.thread = t;
    return fr;
  };
  const main = on(m.call("main()", [{ name: "n", value: String(vals.length) }, { name: "list", value: "null" }]), 1);
  m.vars({ threads: 1, "stack frames": 1, "heap objects": 0 });
  m.note("main() starts on thread 1. Its locals n and list live in a frame on thread 1's stack; the heap belongs to the whole process.", "call");
  const build = on(m.call("build(n)", [{ name: "n", value: String(vals.length) }, { name: "head", value: "null" }, { name: "i", value: "0" }]), 1);
  m.vars({ "stack frames": 2 });
  m.note("main calls build(n): a new frame on top of thread 1's stack, with build's own n, head and i.", "call");
  let prev: string | undefined;
  for (let i = 0; i < vals.length && !m.f.full; i++) {
    m.clearTones();
    const id = `node${i}`;
    m.alloc(id, "Node", [{ name: "val", value: String(vals[i]) }, { name: "next", value: prev ? m.obj(prev).addr : "null", ptr: prev }]);
    m.set(build, "i", String(i));
    m.set(build, "head", m.obj(id).addr, id, { tone: "active" });
    m.vars({ "heap objects": i + 1 });
    m.note(`Iteration ${i}: a Node holding ${vals[i]} is allocated on the heap at ${m.obj(id).addr}, and head points at it.`, "alloc");
    prev = id;
  }
  const head = prev!;
  const addr = m.obj(head).addr;
  m.clearTones();
  m.set(main, "list", addr, head, { tone: "active" });
  m.retThread(1);
  m.vars({ "stack frames": 1 });
  m.note(`build returns head: its frame is popped, the nodes survive, and main's list holds ${addr}.`, "return");
  const workers: StackFrame[] = [];
  for (let t = 2; t <= nThreads && !m.f.full; t++) {
    m.clearTones();
    const w = on(m.call(`worker(p)`, [{ name: "p", value: addr, ptr: head, tone: "active" }]), t);
    workers.push(w);
    m.vars({ threads: t, "stack frames": 1 + workers.length });
    m.note(`main starts thread ${t} running worker(list). Thread ${t} gets a stack of its own, and its first frame holds p, a copy of the pointer: ${addr}, the same heap node main's list points at.`, "spawn");
  }
  const total = vals.reduce((a, b) => a + b, 0);
  const sums: StackFrame[] = [];
  for (const w of workers) {
    if (m.f.full) break;
    m.clearTones();
    const sm = on(m.call("sum(p)", [{ name: "p", value: addr, ptr: head, dashed: true }, { name: "total", value: String(total), tone: "done" }]), w.thread!);
    sums.push(sm);
    m.vars({ "stack frames": 1 + workers.length + sums.length });
    m.note(`On thread ${w.thread}, worker calls sum(p), which walks all ${vals.length} nodes through the shared heap: total = ${total}. sum's locals live on thread ${w.thread}'s stack, where thread 1 cannot see them.`, "call");
  }
  m.clearTones();
  const print = on(m.call("print(list)", [{ name: "p", value: addr, ptr: head, dashed: true }]), 1);
  m.vars({ "stack frames": 2 + workers.length + sums.length });
  m.note(`Meanwhile thread 1 calls print(list). Both threads now have a frame with a local named p; they never collide, because each lives on its own thread's stack. Both point at the same node.`, "call");
  m.clearTones();
  const node = m.obj(head);
  const old = node.fields[0]!.value;
  node.fields[0] = { name: "val", value: String(Number(old) + 1), tone: "danger" };
  node.tone = "danger";
  m.vars({ [`node ${addr}`]: `val ${old} → ${Number(old) + 1}` });
  m.note(`Thread 2 writes through its pointer: the node at ${addr} now holds ${Number(old) + 1}. There is only one heap, so thread 1's print sees the new value, or the old one, depending on timing. Without a lock this read and write are a data race.`, "write");
  m.clearTones();
  for (const sm of sums) m.retThread(sm.thread!);
  m.retThread(1);
  m.vars({ [`node ${addr}`]: undefined, "stack frames": 1 + workers.length });
  m.note("sum returns on its thread and print returns on thread 1. Each return pops a frame from its own thread's stack only; the heap is untouched.", "return");
  for (const w of workers) {
    if (m.f.full) break;
    m.clearTones();
    m.retThread(w.thread!);
    m.vars({ threads: nThreads - (workers.indexOf(w) + 1) + 1, "stack frames": 1 + workers.length - (workers.indexOf(w) + 1) });
    m.note(`worker returns and thread ${w.thread} exits: its whole stack is released at once. The nodes it pointed at stay, because they belong to the heap, not to the thread.`, "exit");
  }
  void print;
  let cur: string | undefined = head;
  let freed = 0;
  m.clearTones();
  while (cur && !m.f.full) {
    const o = m.obj(cur);
    const next = o.fields.find((x) => x.name === "next")?.ptr;
    m.clearTones();
    m.free(cur);
    freed++;
    m.set(main, "list", next ? m.obj(next).addr : "null", next);
    m.vars({ "heap objects": vals.length - freed });
    m.note(freed === 1 ? `main joins the other thread${nThreads > 2 ? "s" : ""}, so nothing else can still be reading the list, then frees ${o.addr}, advancing list to the next node first.` : `main frees ${o.addr}, again advancing list first.`, "free");
    m.purge();
    cur = next;
  }
  m.retThread(1);
  m.vars({ threads: 1, "stack frames": 0, "heap objects": 0 });
  m.note(`main returns. ${nThreads} threads had ${nThreads} private stacks and shared one heap: sharing a pointer is how threads communicate cheaply, and an unsynchronised write through it is how they race.`, "done");
  return m.f.done();
};

// ---------- call stack ----------

const callStack: G = (input) => {
  const fn = input.fn ?? "factorial";
  if (fn === "ways") return callStackWays(input);
  if (fn === "reverse") return callStackReverse(input);
  if (fn === "calls") return callStackChain(input);
  const { n, base } = input;
  const B = base === 1 ? 1 : 0;
  const F = input.name && /^[A-Za-z_][A-Za-z0-9_]{0,15}$/.test(input.name) ? input.name : "factorial";
  const N = Math.max(B, Math.min(6, Math.floor(n ?? 4)));
  const m = new Mem();
  const main = m.call("main()", [{ name: "result", value: "?" }]);
  m.vars({ depth: 1, "max depth": 1 });
  m.note(`main() calls ${F}(${N}). Each call needs its own frame holding the argument, the return address and any locals.`, "call");
  let maxDepth = 1;
  for (let k = N; k >= B && !m.f.full; k--) {
    m.call(`${F}(${k})`, [{ name: "n", value: String(k) }, { name: "ret →", value: k === N ? "main" : `${F}(${k + 1})` }]);
    maxDepth = Math.max(maxDepth, m.s.stack.length);
    m.vars({ depth: m.s.stack.length, "max depth": maxDepth });
    if (k === B) {
      m.note(`${F}(${k}) hits the base case (n ≤ ${B}): no further call, it will return 1. The stack is at its deepest: ${m.s.stack.length} frames, main plus ${N - B + 1} ${F} calls, so recursion depth is live memory.`, "base");
    } else {
      m.note(`${F}(${k}) cannot finish yet: it needs ${F}(${k - 1}) first, so it pushes another frame and waits. Its own n = ${k} stays parked in its frame.`, "call");
    }
  }
  let acc = 1;
  for (let k = B; k <= N && !m.f.full; k++) {
    const fr = m.ret();
    acc = k <= B ? 1 : acc * k;
    const caller = m.top();
    if (caller && caller !== main) {
      m.set(caller, `${F}(${k})`, String(acc), undefined, { tone: "done" });
      m.set(caller, "n × that", `${k + 1} × ${acc}`, undefined, { tone: "compare" });
      m.vars({ depth: m.s.stack.length, returned: acc });
      m.note(`${fr?.name} returns ${acc}: its frame is popped and the value lands in ${caller.name}, which resumes right after the call and multiplies by its own n: ${k + 1} × ${acc}.`, "return");
    } else {
      m.set(main, "result", String(acc), undefined, { tone: "done" });
      m.vars({ depth: m.s.stack.length, returned: acc });
      m.note(`${fr?.name} returns ${acc}: its frame is popped and main's result slot receives ${acc}.`, "return");
    }
  }
  const calls = N - B + 1;
  m.vars({ depth: 1, result: acc });
  m.note(`${F}(${N}) = ${acc}. ${calls} ${F} frames were pushed and popped in LIFO order; the stack pointer is the only bookkeeping the machine needs. The peak, ${maxDepth} frames, grows with n: ask for a large enough n and the stack runs out before the answer arrives.`, "done");
  return m.f.done();
};

/** Memoised climbing stairs: ways(i) = ways(i-1) + ways(i-2), ways(0) = ways(1) = 1. */
const callStackWays: G = ({ n }) => {
  const N = Math.max(1, Math.min(8, Math.floor(n ?? 6)));
  const m = new Mem();
  const main = m.call("main()", [{ name: "result", value: "?" }]);
  const memo = new Map<number, number>();
  let maxDepth = 1;
  let calls = 0;
  let hits = 0;
  const memoVar = () => (memo.size === 0 ? "{}" : `{${[...memo.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}: ${v}`).join(", ")}}`);
  const vars = () => m.vars({ depth: m.s.stack.length, "max depth": maxDepth, memo: memoVar(), calls, hits });
  vars();
  m.note(`main() calls ways(${N}) with an empty memo. Every call that misses the memo pushes a frame holding i, the return address and the half-finished sum.`, "call");
  const rec = (i: number, caller: StackFrame): number => {
    calls++;
    const fr = m.call(`ways(${i})`, [{ name: "i", value: String(i) }, { name: "ret →", value: caller === main ? "main" : caller.name }]);
    maxDepth = Math.max(maxDepth, m.s.stack.length);
    vars();
    if (i <= 1) {
      m.note(`ways(${i}) is not in the memo, and it is a base case (i ≤ 1): it returns 1 without another call. The stack holds ${m.s.stack.length} frames, main plus ${m.s.stack.length - 1} ways calls.`, "base");
      memo.set(i, 1);
      return 1;
    }
    m.note(`ways(${i}) is not in the memo: it pushes a frame and calls ways(${i - 1}) first. i = ${i} stays parked in its frame.`, "call");
    const a = rec(i - 1, fr);
    m.ret();
    m.clearTones();
    m.set(fr, `ways(${i - 1})`, String(a), undefined, { tone: "done" });
    vars();
    m.note(`ways(${i - 1}) returns ${a} and is stored in the memo; its frame is popped. ways(${i}) resumes with the first half, ${a}, and now needs ways(${i - 2}).`, "return");
    let b: number;
    if (memo.has(i - 2)) {
      calls++;
      hits++;
      b = memo.get(i - 2)!;
      m.set(fr, `ways(${i - 2})`, `${b} (memo)`, undefined, { tone: "done" });
      m.set(fr, "sum", `${a} + ${b} = ${a + b}`, undefined, { tone: "compare" });
      vars();
      m.note(`ways(${i - 2}) is already in the memo: a hit returns ${b} without pushing a frame. ways(${i}) = ${a} + ${b} = ${a + b}.`, "hit");
    } else {
      b = rec(i - 2, fr);
      m.ret();
      m.clearTones();
      m.set(fr, `ways(${i - 2})`, String(b), undefined, { tone: "done" });
      m.set(fr, "sum", `${a} + ${b} = ${a + b}`, undefined, { tone: "compare" });
      vars();
      m.note(`ways(${i - 2}) returns ${b} and is stored in the memo; its frame is popped. ways(${i}) = ${a} + ${b} = ${a + b}.`, "return");
    }
    memo.set(i, a + b);
    return a + b;
  };
  const r = rec(N, main);
  m.ret();
  m.clearTones();
  m.set(main, "result", String(r), undefined, { tone: "done" });
  vars();
  m.note(`ways(${N}) returns ${r} to main and its frame is popped; the memo now holds every state from 0 to ${N}.`, "return");
  m.vars({ depth: 1, result: r });
  m.note(`ways(${N}) = ${r}: ${memo.size} states computed, ${hits} memo hits, ${calls} calls. The peak was ${maxDepth} frames, main plus ${maxDepth - 1} ways calls: memoisation removed the repeated work, not the depth. ways(n) still recurses about n deep, which is what hits the recursion limit for large n.`, "done");
  return m.f.done();
};

/** Recursive list reversal: reverse_rec(head) recurses to the tail, then relinks on the way back. */
const callStackReverse: G = ({ values }) => {
  const vals = cap(values, [1, 2, 3, 4], 6);
  const m = new Mem();
  const ids = vals.map((_, i) => `node${i}`);
  vals.forEach((v, i) => m.alloc(ids[i]!, `Node ${v}`, [{ name: "val", value: String(v) }, { name: "next", value: "null" }]));
  vals.forEach((_, i) => {
    if (i + 1 < vals.length) {
      const nx = m.obj(ids[i + 1]!);
      m.obj(ids[i]!).fields[1] = { name: "next", value: nx.addr, ptr: ids[i + 1] };
    }
  });
  for (const o of m.s.heap) o.tone = undefined;
  const label = (i: number) => String(vals[i]);
  const listFrom = (start: number): string => {
    const out: string[] = [];
    let cur: string | undefined = ids[start];
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      out.push(m.obj(cur).fields[0]!.value);
      cur = m.obj(cur).fields[1]!.ptr;
    }
    return out.join(" → ");
  };
  const main = m.call("main()", [{ name: "head", value: m.obj(ids[0]!).addr, ptr: ids[0] }]);
  let maxDepth = 1;
  const vars = () => m.vars({ depth: m.s.stack.length, "max depth": maxDepth, [`from ${label(0)}`]: listFrom(0), [`from ${label(vals.length - 1)}`]: listFrom(vals.length - 1) });
  vars();
  m.note(`The list ${vals.join(" → ")} lives on the heap. main() calls reverse_rec(head) on node ${label(0)}; each call will get its own frame with its own head.`, "call");
  const frames: StackFrame[] = [];
  for (let i = 0; i < vals.length && !m.f.full; i++) {
    const fr = m.call(`reverse_rec(${label(i)})`, [{ name: "head", value: m.obj(ids[i]!).addr, ptr: ids[i] }]);
    frames.push(fr);
    maxDepth = Math.max(maxDepth, m.s.stack.length);
    vars();
    if (i === vals.length - 1) {
      m.note(`reverse_rec(${label(i)}): head.next is None, so this is the base case and it returns node ${label(i)}. ${vals.length} reverse_rec frames are alive, one per node: the recursion is as deep as the list is long.`, "base");
    } else {
      m.note(`reverse_rec(${label(i)}): node ${label(i)} has a successor, so it calls reverse_rec(${label(i + 1)}) and waits. Its head stays parked in its frame.`, "call");
    }
  }
  const last = ids[vals.length - 1]!;
  for (let i = vals.length - 2; i >= 0 && !m.f.full; i--) {
    const popped = m.ret();
    m.clearTones();
    const fr = frames[i]!;
    m.set(fr, "new_head", m.obj(last).addr, last, { tone: "done" });
    const succ = m.obj(ids[i + 1]!);
    succ.fields[1] = { name: "next", value: m.obj(ids[i]!).addr, ptr: ids[i], tone: "active" };
    m.obj(ids[i]!).fields[1] = { name: "next", value: "null", tone: "danger" };
    succ.tone = "compare";
    vars();
    m.note(`${popped?.name} returns node ${label(vals.length - 1)} and is popped. reverse_rec(${label(i)}) resumes: ${label(i + 1)}.next = ${label(i)} points the old successor back at it, and ${label(i)}.next = None makes ${label(i)} the tail. It returns node ${label(vals.length - 1)}.`, "relink");
  }
  m.ret();
  m.clearTones();
  m.set(main, "head", m.obj(last).addr, last, { tone: "done" });
  vars();
  m.note(`reverse_rec(${label(0)}) returns node ${label(vals.length - 1)} to main, which now holds the head of ${listFrom(vals.length - 1)}.`, "return");
  m.vars({ depth: 1 });
  m.note(`${vals.length} nodes needed ${vals.length} reverse_rec frames on top of main at the peak. Depth equals list length, so a long enough list overflows the stack, while the iterative loop does the same relinking with O(1) stack.`, "done");
  return m.f.done();
};

/** A chain of ordinary calls, optionally frozen once at its deepest point as a profiler sample. */
const callStackChain: G = ({ calls, sample }) => {
  const names = (calls && calls.length > 0 ? calls : ["handle_request", "parse", "validate"]).slice(0, 8);
  const bare = (s: string) => s.replace(/\(.*\)$/, "");
  const m = new Mem();
  m.call("main()", []);
  let maxDepth = 1;
  m.vars({ depth: 1, "max depth": 1 });
  m.note(`main() is running: one frame on the stack.`, "call");
  const stack = ["main"];
  for (let i = 0; i < names.length && !m.f.full; i++) {
    const nm = bare(names[i]!);
    const callerName = stack[stack.length - 1]!;
    m.call(`${nm}()`, [{ name: "ret →", value: `${callerName}()` }]);
    stack.push(nm);
    maxDepth = Math.max(maxDepth, m.s.stack.length);
    m.vars({ depth: m.s.stack.length, "max depth": maxDepth });
    m.note(`${callerName}() calls ${nm}(): a new frame goes on top, holding the locals of ${nm}() and the address in ${callerName}() to return to.`, "call");
  }
  if (sample && !m.f.full) {
    m.vars({ sample: stack.join(";") });
    m.note(`A sampling profiler interrupts the thread now and walks the frames from main() up to ${stack[stack.length - 1]}(), writing one sample: ${stack.join(";")}. It records only what is on the stack at this instant.`, "sample");
  }
  while (m.s.stack.length > 1 && !m.f.full) {
    const fr = m.ret();
    stack.pop();
    m.vars({ depth: m.s.stack.length, sample: undefined });
    m.note(`${fr?.name} returns: its frame is popped and ${stack[stack.length - 1]}() resumes right after the call.`, "return");
  }
  m.vars({ depth: 1 });
  m.note(
    sample
      ? `Back to main() alone. The sample saw exactly the frames that were live at one instant. A flame graph stacks thousands of such samples and merges identical prefixes, so a function's width is the share of samples in which it was on the stack.`
      : `Back to main() alone: ${names.length} frames were pushed and popped in LIFO order, peaking at ${maxDepth}.`,
    "done",
  );
  return m.f.done();
};

// ---------- mark & sweep ----------

const gcMarkSweep: G = () => {
  const m = new Mem();
  const main = m.call("main()", []);
  const A = m.alloc("A", "A");
  const B = m.alloc("B", "B");
  const C = m.alloc("C", "C");
  const D = m.alloc("D", "D");
  const E = m.alloc("E", "E");
  const F = m.alloc("F", "F");
  const G_ = m.alloc("G", "G");
  A.fields = [{ name: "next", value: B.addr, ptr: "B" }];
  B.fields = [{ name: "next", value: C.addr, ptr: "C" }];
  C.fields = [{ name: "next", value: "null" }];
  D.fields = [{ name: "next", value: "null" }];
  E.fields = [{ name: "next", value: F.addr, ptr: "F" }];
  F.fields = [{ name: "next", value: E.addr, ptr: "E" }];
  G_.fields = [{ name: "next", value: "null" }];
  m.set(main, "a", A.addr, "A");
  m.set(main, "d", D.addr, "D");
  for (const o of m.s.heap) {
    o.mark = false;
    o.tone = undefined;
  }
  m.vars({ phase: "before", live: "?", roots: "a, d" });
  m.note("Seven objects sit on the heap. Only a and d on the stack are roots. E and F point at each other but nothing on the stack reaches them, and G is orphaned.", "setup");
  const worklist: string[] = ["A", "D"];
  const marked: string[] = [];
  m.vars({ phase: "mark", worklist: [...worklist] });
  m.note("Mark phase: start a worklist with every object a root points at. Marking is a graph traversal from the roots.", "mark");
  while (worklist.length && !m.f.full) {
    const id = worklist.shift()!;
    const o = m.obj(id);
    m.clearTones();
    if (o.mark) {
      o.tone = "visited";
      m.vars({ worklist: [...worklist] });
      m.note(`${id} is already marked: skip it, so cycles cannot loop forever.`, "skip");
      continue;
    }
    o.mark = true;
    o.tone = "active";
    marked.push(id);
    const kids = o.fields.filter((x) => x.ptr && !m.obj(x.ptr).mark).map((x) => x.ptr!);
    for (const k of kids) {
      worklist.push(k);
      m.obj(k).tone = "frontier";
    }
    m.vars({ worklist: [...worklist], marked: [...marked] });
    m.note(kids.length ? `Mark ${id} live and push what it points at (${kids.join(", ")}) onto the worklist: anything reachable from a live object is live.` : `Mark ${id} live; it points at nothing else, so nothing is added.`, "mark");
  }
  m.clearTones();
  for (const o of m.s.heap) o.tone = o.mark ? "visited" : undefined;
  m.vars({ phase: "sweep", marked: [...marked] });
  m.note(`Marking done: ${marked.join(", ")} are reachable. Sweep phase walks the whole heap in address order and frees everything without a mark.`, "sweep");
  let freed = 0;
  for (const o of [...m.s.heap]) {
    if (m.f.full) break;
    m.clearTones();
    for (const p of m.s.heap) if (p.mark) p.tone = "visited";
    if (o.mark) {
      o.tone = "done";
      o.mark = false;
      m.note(`${o.id} at ${o.addr} is marked: keep it and clear the mark bit ready for the next collection.`, "keep");
    } else {
      m.free(o.id);
      freed++;
      m.vars({ freed });
      m.note(`${o.id} at ${o.addr} is unmarked: garbage, so its memory goes back to the free list${o.id === "E" || o.id === "F" ? " — even though something (its cycle partner) still points at it" : ""}.`, "free");
    }
  }
  m.purge();
  m.clearTones();
  m.vars({ phase: "done", live: marked.length, freed });
  m.note(`Collection complete: ${marked.length} objects live, ${freed} reclaimed. Cost is O(live) to mark plus O(heap) to sweep, and unreachable cycles are collected for free.`, "done");
  return m.f.done();
};

// ---------- reference counting ----------

interface RcScript {
  root: string;
  fnFrame: string;
  count: string;
  allocA: string;
  copyB: string;
  call: string;
  allocY: string;
  /** f returns: its locals release their references. */
  ret: string;
  cascade: string;
  dropB: string;
  dropA: string;
  freedA: string;
  allocPQ: string;
  link: string;
  unlink: string;
  leak: string;
  leakVars: Record<string, unknown>;
}

const RC_SCRIPTS: Record<string, RcScript> = {
  generic: {
    root: "main()",
    fnFrame: "f(p)",
    count: "rc",
    allocA: "a = new Obj(): the allocation starts with refcount 1, the one reference held by a.",
    copyB: "b = a: copying the reference increments the count to 2. Every copy is accounted for at the moment it is made.",
    call: "f(a) passes the reference as parameter p: the count rises to 3 for as long as f runs.",
    allocY: "Inside f, y = new Obj() with y.parent = p: Y starts at 1 and X rises to 4 because a heap field is a reference too.",
    ret: "f returns: p and y go out of scope, so X drops to 3 and Y drops to 0. Zero means nobody can reach Y, so it is freed right now.",
    cascade: "Freeing Y releases everything Y referenced: Y.parent is dropped, so X falls to 2. Frees cascade through the object graph.",
    dropB: "b = null: one reference gone, X is at 1. Nothing happens yet; a still holds it.",
    dropA: "a = null: the last reference is dropped and the count hits 0, so X is freed immediately, deterministically, with no separate collection phase.",
    freedA: "X's memory is back in the free list. This is the strength of refcounting: destruction happens at a predictable point.",
    allocPQ: "Now the weakness. p = new Obj(), q = new Obj(): two fresh objects, one reference each.",
    link: "p.next = q and q.prev = p: each object now holds a reference to the other, so both counts are 2.",
    unlink: "p = q = null: the stack no longer reaches P or Q, yet each still has count 1 from the other. Neither ever reaches 0.",
    leak: "main returns and P and Q are leaked: reference counting cannot collect cycles. Fixes are weak references or a backup tracing collector. Overhead: an increment/decrement on every copy.",
    leakVars: { leaked: "P, Q" },
  },
  python: {
    root: "<module>",
    fnFrame: "f(p)",
    count: "refcount",
    allocA: "a = Obj(): CPython stores a reference count in every object's header. The new object starts at 1, the reference held by a.",
    copyB: "b = a: binding another name to the same object increments the count to 2. No object is copied, only the reference.",
    call: "f(a) binds the argument to the parameter p: the count rises to 3 for as long as f runs.",
    allocY: "Inside f, y = Obj() and y.parent = p: Y starts at 1, and X rises to 4, because an attribute holding X is a reference too.",
    ret: "f returns and its frame releases its locals: p's reference goes, so X drops to 3, and y's goes, so Y drops to 0. Zero means nothing can reach Y, so CPython frees it on the spot.",
    cascade: "Freeing Y releases every reference Y held: its parent attribute goes, so X falls to 2. Frees cascade through the object graph.",
    dropB: "del b: one reference gone, X is at 1. Nothing happens yet; a still holds it.",
    dropA: "del a: the last reference is dropped and the count hits 0, so X is freed immediately, with no separate collection phase. This is why a file usually closes as soon as its last reference disappears.",
    freedA: "X's memory is back with the allocator. Destruction happened at a predictable point: the del statement.",
    allocPQ: "Now the weakness. p = Obj() and q = Obj(): two fresh objects, one reference each.",
    link: "p.next = q and q.prev = p: each object now holds a reference to the other, so both counts are 2.",
    unlink: "del p, q: no variable reaches P or Q any more, yet each still has a count of 1 from the other. Neither count can ever reach 0.",
    leak: "Reference counting alone will never free P and Q. CPython's cycle collector exists for exactly this: it periodically looks for groups of objects that only reference each other and frees them. Overhead of the counting itself: an increment or decrement on every new reference.",
    leakVars: { "unreachable cycle": "P, Q (left for the cycle collector)" },
  },
  rust: {
    root: "main()",
    fnFrame: "f(p: Rc<Obj>)",
    count: "strong",
    allocA: "let a = Rc::new(Obj::new()): the value lives in a heap block next to its strong count, which starts at 1, the Rc held by a.",
    copyB: "let b = Rc::clone(&a): cloning the Rc copies the pointer and increments the count to 2. The Obj itself is not copied.",
    call: "f(Rc::clone(&a)) passes a fresh clone as the parameter p: the count rises to 3 for as long as f runs.",
    allocY: "Inside f, let y = Rc::new(Child { parent: Rc::clone(&p) }): Y starts at 1, and X rises to 4, because the parent field holds an Rc too.",
    ret: "f returns, and its variables are dropped in reverse order, y first. y's drop takes Y to 0, so Y is freed right now, and freeing Y drops its parent field: X goes from 4 to 3. Drops cascade through the object graph.",
    cascade: "Then the parameter p is dropped, so X falls to 2. Every drop happens at a point you can read off the code.",
    dropB: "drop(b): one strong reference gone, X is at 1. Nothing happens yet; a still holds it.",
    dropA: "drop(a): the last strong reference is dropped and the count hits 0, so X is dropped and freed immediately, deterministically, with no collector.",
    freedA: "X's memory is back with the allocator. The free happened at a predictable point, the last drop.",
    allocPQ: "Now the weakness. let p = Rc::new(Node::new()) and let q = Rc::new(Node::new()): two fresh nodes, one strong reference each.",
    link: "Through RefCell, p.next = Some(Rc::clone(&q)) and q.prev = Some(Rc::clone(&p)): each node now holds a strong reference to the other, so both counts are 2.",
    unlink: "drop(p); drop(q): the stack no longer reaches P or Q, yet each still has a strong count of 1 from the other. Neither count can ever reach 0.",
    leak: "main returns and P and Q are leaked: Rc cannot free a cycle, and Rust has no collector to find it. The fix is to make one direction a Weak, which does not keep the value alive. Overhead: an increment or decrement on every clone and drop.",
    leakVars: { leaked: "P, Q" },
  },
};

const referenceCounting: G = ({ lang }) => {
  const t = RC_SCRIPTS[lang === "python" || lang === "rust" ? lang : "generic"]!;
  const rc = (o: string) => `${t.count}(${o})`;
  const m = new Mem();
  const main = m.call(t.root, []);
  const X = m.alloc("X", "Obj X", [], { rc: 1 });
  m.set(main, "a", X.addr, "X", { tone: "active" });
  m.vars({ [rc("X")]: 1 });
  m.note(t.allocA, "alloc");
  m.clearTones();
  X.rc = 2;
  m.set(main, "b", X.addr, "X", { tone: "active" });
  m.vars({ [rc("X")]: 2 });
  m.note(t.copyB, "retain");
  m.clearTones();
  const fn = m.call(t.fnFrame, [{ name: "p", value: X.addr, ptr: "X", tone: "active" }]);
  X.rc = 3;
  m.vars({ [rc("X")]: 3 });
  m.note(t.call, "retain");
  m.clearTones();
  const Y = m.alloc("Y", "Obj Y", [{ name: "parent", value: X.addr, ptr: "X" }], { rc: 1 });
  X.rc = 4;
  m.set(fn, "y", Y.addr, "Y", { tone: "active" });
  m.vars({ [rc("X")]: 4, [rc("Y")]: 1 });
  m.note(t.allocY, "alloc");
  m.clearTones();
  m.ret();
  X.rc = 3;
  Y.rc = 0;
  Y.tone = "danger";
  m.vars({ [rc("X")]: 3, [rc("Y")]: 0 });
  m.note(t.ret, "release");
  m.free("Y");
  X.rc = 2;
  X.tone = "compare";
  m.vars({ [rc("X")]: 2, [rc("Y")]: "freed" });
  m.note(t.cascade, "cascade");
  m.purge();
  m.clearTones();
  m.unset(main, "b");
  X.rc = 1;
  m.vars({ [rc("X")]: 1 });
  m.note(t.dropB, "release");
  m.clearTones();
  m.unset(main, "a");
  X.rc = 0;
  X.tone = "danger";
  m.vars({ [rc("X")]: 0 });
  m.note(t.dropA, "release");
  m.free("X");
  m.purge();
  m.vars({ [rc("X")]: "freed" });
  m.note(t.freedA, "free");
  const P = m.alloc("P", "Obj P", [], { rc: 1 });
  const Q = m.alloc("Q", "Obj Q", [], { rc: 1 });
  m.set(main, "p", P.addr, "P", { tone: "active" });
  m.set(main, "q", Q.addr, "Q", { tone: "active" });
  m.vars({ [rc("P")]: 1, [rc("Q")]: 1 });
  m.note(t.allocPQ, "alloc");
  m.clearTones();
  P.fields = [{ name: "next", value: Q.addr, ptr: "Q", tone: "active" }];
  Q.fields = [{ name: "prev", value: P.addr, ptr: "P", tone: "active" }];
  P.rc = 2;
  Q.rc = 2;
  m.vars({ [rc("P")]: 2, [rc("Q")]: 2 });
  m.note(t.link, "retain");
  m.clearTones();
  m.unset(main, "p");
  m.unset(main, "q");
  P.rc = 1;
  Q.rc = 1;
  P.tone = "compare";
  Q.tone = "compare";
  m.vars({ [rc("P")]: 1, [rc("Q")]: 1 });
  m.note(t.unlink, "leak");
  if (lang !== "python") m.ret();
  P.tone = "danger";
  Q.tone = "danger";
  m.vars(t.leakVars);
  m.note(t.leak, "done");
  return m.f.done();
};

// ---------- ownership & borrowing ----------

const ownershipBorrowing: G = () => {
  const m = new Mem();
  const main = m.call("main()", []);
  const buf = m.alloc("buf", "String buffer", [{ name: "bytes", value: '"hello"' }, { name: "cap", value: "5" }]);
  m.set(main, "s", `String{ptr, len 5}`, "buf", { tone: "active" });
  m.vars({ owner: "s", borrows: 0 });
  m.note("let s = String::from(\"hello\"): s is the unique owner of the heap buffer. Ownership means exactly one variable is responsible for freeing it.", "own");
  m.clearTones();
  m.set(main, "r1", "&s", "buf", { tone: "compare", dashed: true });
  m.vars({ borrows: 1, "borrow kind": "shared (&)" });
  m.note("let r1 = &s: a shared borrow. r1 can read the buffer but not free or mutate it; s is still the owner (dashed arrow = borrow).", "borrow");
  m.clearTones();
  m.set(main, "r2", "&s", "buf", { tone: "compare", dashed: true });
  m.vars({ borrows: 2 });
  m.note("let r2 = &s: any number of shared borrows may coexist, because readers cannot invalidate each other.", "borrow");
  m.clearTones();
  m.unset(main, "r1");
  m.unset(main, "r2");
  m.vars({ borrows: 0, "borrow kind": undefined });
  m.note("r1 and r2 go out of use: the borrows end. Nothing happens to the heap; borrows never own.", "end-borrow");
  m.clearTones();
  m.set(main, "mr", "&mut s", "buf", { tone: "danger", dashed: true });
  m.vars({ borrows: 1, "borrow kind": "exclusive (&mut)" });
  m.note("let mr = &mut s: an exclusive borrow. While mr is live no other borrow of s (shared or mutable) may exist, so writes can never race with reads.", "borrow-mut");
  m.clearTones();
  const buf2 = m.alloc("buf2", "String buffer", [{ name: "bytes", value: '"hello!"', tone: "active" }, { name: "cap", value: "10" }]);
  m.free("buf");
  m.set(main, "s", `String{ptr, len 6}`, "buf2");
  m.set(main, "mr", "&mut s", "buf2", { tone: "danger", dashed: true });
  m.vars({ "borrow kind": "exclusive (&mut)" });
  m.note(`mr.push('!'): len 5 already equals cap 5, so push reallocates. It allocates a buffer with cap 10 at ${buf2.addr}, copies the bytes, appends '!', frees the old buffer at ${buf.addr}, and updates s's pointer, all through the exclusive borrow. Any other reference into the old buffer would now dangle, which is why none may exist while mr is live.`, "mutate");
  m.purge();
  m.clearTones();
  m.unset(main, "mr");
  m.vars({ borrows: 0, "borrow kind": undefined });
  m.note("mr's last use is behind us, so the exclusive borrow ends and s is usable again.", "end-borrow");
  m.clearTones();
  m.set(main, "s", "(moved)", undefined, { tone: "muted" });
  m.set(main, "t", `String{ptr, len 6}`, "buf2", { tone: "active" });
  m.vars({ owner: "t" });
  m.note("let t = s: a move. The pointer/len/cap triple is copied to t and s is marked invalid; using s again is a compile error, so the buffer has one owner still.", "move");
  m.clearTones();
  const fn = m.call("len(v: &String)", [{ name: "v", value: "&t", ptr: "buf2", tone: "compare", dashed: true }]);
  m.vars({ borrows: 1, "borrow kind": "shared (&)" });
  m.note("len(&t): the function borrows rather than takes ownership, so t remains the owner after the call.", "borrow");
  m.unset(fn, "v");
  m.ret();
  m.clearTones();
  m.vars({ borrows: 0, "borrow kind": undefined, returned: 6 });
  m.note("len returns 6 and its borrow ends with its frame.", "return");
  m.clearTones();
  m.unset(main, "s");
  m.unset(main, "t");
  m.free("buf2");
  m.vars({ owner: "none" });
  m.note("End of scope: t, the owner, is dropped, so the buffer is freed exactly once. No double free (s was moved-from) and no leak (someone always owns it).", "drop");
  m.purge();
  m.ret();
  m.note("Ownership gives deterministic freeing without a GC; borrowing lends access with the rule 'many readers or one writer', checked at compile time.", "done");
  return m.f.done();
};

// ---------- virtual memory paging ----------

const virtualMemoryPaging: G = ({ values, n }) => {
  const seq = cap(values, [0, 1, 2, 0, 3, 4, 1, 5, 0], 24).map((v) => Math.abs(Math.floor(v)) % 8);
  const nFrames = Math.max(1, Math.min(8, Math.floor(n ?? 3)));
  const m = new Mem();
  const pages: PageState = {
    table: Array.from({ length: 8 }, (_, vpn) => ({ vpn, pfn: null })),
    frames: Array.from({ length: nFrames }, (_, pfn) => ({ pfn, vpn: null })),
    disk: [],
  };
  m.s.pages = pages;
  let hits = 0;
  let faults = 0;
  let evictions = 0;
  const fifo: number[] = [];
  const clear = () => {
    for (const e of pages.table) e.tone = e.pfn === null ? undefined : "visited";
    for (const fr of pages.frames) fr.tone = fr.vpn === null ? undefined : "visited";
  };
  m.vars({ "physical frames": nFrames, hits, faults, evictions });
  m.note(`The process sees 8 virtual pages but the machine has only ${nFrames} physical frames. The page table maps each virtual page number (VPN) to a physical frame number (PFN) or marks it not present.`, "setup");
  for (let i = 0; i < seq.length && !m.f.full; i++) {
    const vpn = seq[i]!;
    const entry = pages.table[vpn]!;
    clear();
    m.vars({ access: `page ${vpn}`, step: `${i + 1}/${seq.length}` });
    if (entry.pfn !== null) {
      hits++;
      entry.tone = "done";
      pages.frames[entry.pfn]!.tone = "done";
      m.vars({ hits });
      m.note(`Access page ${vpn}: the page-table entry is present with PFN ${entry.pfn}, so the MMU translates the address in hardware. A hit.`, "hit");
      continue;
    }
    faults++;
    entry.tone = "danger";
    m.vars({ faults });
    m.note(`Access page ${vpn}: the entry is not present, so the MMU raises a page fault and the OS takes over.`, "fault");
    let pfn = pages.frames.findIndex((fr) => fr.vpn === null);
    if (pfn === -1) {
      const victim = fifo.shift()!;
      const vEntry = pages.table[victim]!;
      pfn = vEntry.pfn!;
      vEntry.pfn = null;
      vEntry.tone = "compare";
      pages.frames[pfn]!.vpn = null;
      pages.frames[pfn]!.tone = "compare";
      pages.disk = [...pages.disk.filter((v) => v !== victim), victim];
      evictions++;
      m.vars({ evictions });
      m.note(`No free frame: evict page ${victim} (loaded earliest, FIFO) from PFN ${pfn}, writing it to disk if dirty, and mark its entry not present.`, "evict");
    }
    pages.disk = pages.disk.filter((v) => v !== vpn);
    entry.pfn = pfn;
    entry.tone = "active";
    pages.frames[pfn]!.vpn = vpn;
    pages.frames[pfn]!.tone = "active";
    fifo.push(vpn);
    m.note(`Load page ${vpn} from disk into PFN ${pfn}, set the table entry present, and retry the instruction; it now hits.`, "load");
  }
  clear();
  m.vars({ access: undefined, step: undefined, hits, faults, evictions, "fault rate": `${Math.round((faults / Math.max(1, seq.length)) * 100)}%` });
  m.note(`${seq.length} accesses: ${hits} hits, ${faults} faults, ${evictions} evictions. A hit costs a table walk (cached in the TLB); a fault that must read the page from disk costs orders of magnitude more, so locality decides performance.`, "done");
  return m.f.done();
};

// ---------- cache lines ----------

const cacheLines: G = ({ values, n }) => {
  const N = Math.max(8, Math.min(64, Math.floor(n ?? 64)));
  const lineSize = 8;
  const slots = 4;
  // Default: a sequential scan of the first two lines, then a stride of one
  // element per line across every remaining line, more lines than the cache holds.
  const custom = !!values && values.length > 0;
  const seq = custom
    ? values!.slice(0, 40).map((v) => Math.abs(Math.floor(v)) % N)
    : [...Array.from({ length: Math.min(16, N) }, (_, i) => i), ...Array.from({ length: Math.max(0, Math.ceil((N - 16) / lineSize)) }, (_, i) => 16 + i * lineSize)];
  const m = new Mem();
  const cache: CacheState = { lineSize, n: N, memTones: Array.from({ length: N }, () => undefined), lines: Array.from({ length: slots }, (_, slot) => ({ slot, line: null })) };
  m.s.cache = cache;
  let hits = 0;
  let misses = 0;
  let used = 0;
  const lru: number[] = [];
  const clear = () => {
    cache.memTones = cache.memTones.map((t) => (t === "done" ? "done" : undefined));
    for (const l of cache.lines) l.tone = l.line === null ? undefined : "visited";
    for (const l of cache.lines) if (l.line !== null) for (let k = 0; k < lineSize; k++) if (cache.memTones[l.line * lineSize + k] !== "done") cache.memTones[l.line * lineSize + k] = "visited";
  };
  m.vars({ "line size": `${lineSize} elements (64 B)`, "cache slots": slots, hits, misses });
  m.note(`Memory is fetched in whole cache lines of ${lineSize} elements, never single elements. The cache holds ${slots} lines. Touching one element pulls in its ${lineSize - 1} neighbours too.`, "setup");
  for (let i = 0; i < seq.length && !m.f.full; i++) {
    const idx = seq[i]!;
    const line = Math.floor(idx / lineSize);
    clear();
    used++;
    cache.memTones[idx] = "done";
    m.vars({ access: `a[${idx}]`, line, step: `${i + 1}/${seq.length}` });
    const slot = cache.lines.find((l) => l.line === line);
    if (slot) {
      hits++;
      slot.tone = "done";
      lru.splice(lru.indexOf(line), 1);
      lru.push(line);
      m.vars({ hits });
      m.note(`a[${idx}] lives in line ${line}, which is already cached in slot ${slot.slot}: a hit, served in a few cycles.`, "hit");
      continue;
    }
    misses++;
    let target = cache.lines.find((l) => l.line === null);
    if (!target) {
      const victim = lru.shift()!;
      target = cache.lines.find((l) => l.line === victim)!;
      target.line = null;
      for (let k = 0; k < lineSize; k++) if (cache.memTones[victim * lineSize + k] !== "done") cache.memTones[victim * lineSize + k] = undefined;
      m.vars({ misses });
      m.note(`a[${idx}] is in line ${line}, not cached: a miss. The cache is full, so the least recently used line (${victim}) is evicted from slot ${target.slot}.`, "evict");
    }
    target.line = line;
    target.tone = "active";
    for (let k = 0; k < lineSize; k++) if (cache.memTones[line * lineSize + k] !== "done") cache.memTones[line * lineSize + k] = "active";
    lru.push(line);
    m.vars({ misses, "elements fetched": misses * lineSize, "elements used": used });
    m.note(`Fetch all of line ${line} (a[${line * lineSize}..${line * lineSize + lineSize - 1}]) from RAM into slot ${target.slot}: ~100× slower than a hit, but the neighbours are now free to read.`, "miss");
  }
  clear();
  const fetched = misses * lineSize;
  m.vars({ access: undefined, line: undefined, step: undefined, hits, misses, "elements fetched": fetched, "elements used": used, "line utilisation": `${Math.round((used / Math.max(1, fetched)) * 100)}%` });
  m.note(
    custom
      ? `${seq.length} accesses: ${hits} hits, ${misses} misses. ${misses} line fetch${misses === 1 ? "" : "es"} moved ${fetched} elements from RAM to serve ${seq.length} reads. Locality, not element count, sets the cost.`
      : `${seq.length} accesses: ${hits} hits, ${misses} misses. The sequential scan used every element of each fetched line; the strided reads paid a full line fetch per element. Locality, not element count, sets the cost.`,
    "done",
  );
  return m.f.done();
};

// ---------- dynamic array growth ----------

const dynamicArrayGrowth: G = ({ values, gc }) => {
  const vals = cap(values, [1, 2, 3, 4, 5, 6, 7], 12);
  const m = new Mem();
  const main = m.call("main()", []);
  let capacity = 2;
  let len = 0;
  const slots: (number | null)[] = Array.from({ length: capacity }, () => null);
  let block = 0;
  const render = (arr: (number | null)[]) => `[${arr.map((v) => (v === null ? "·" : v)).join(", ")}]`;
  let cur = m.alloc(`blk${block}`, `block (cap ${capacity})`, [{ name: "slots", value: render(slots) }], { size: 0x10 * capacity });
  m.set(main, "v", `len 0, cap ${capacity}`, cur.id, { tone: "active" });
  let copies = 0;
  m.vars({ len, cap: capacity, "copies so far": copies });
  m.note(`v = new DynamicArray(): the stack holds a small header (len, cap, pointer); the elements live in a heap block with room for ${capacity}.`, "alloc");
  let alias: HeapObj | undefined;
  for (let i = 0; i < vals.length && !m.f.full; i++) {
    const x = vals[i]!;
    m.clearTones();
    if (len === capacity) {
      const newCap = capacity * 2;
      block++;
      const fresh: (number | null)[] = Array.from({ length: newCap }, () => null);
      const nb = m.alloc(`blk${block}`, `block (cap ${newCap})`, [{ name: "slots", value: render(fresh) }], { size: 0x10 * newCap });
      m.vars({ len, cap: capacity, "new cap": newCap });
      m.note(`append(${x}) but len = cap = ${capacity}: no room. Allocate a new block twice the size (${newCap}) on the heap; the old block is untouched for now.`, "grow");
      for (let k = 0; k < len && !m.f.full; k++) {
        fresh[k] = slots[k]!;
        copies++;
        nb.fields = [{ name: "slots", value: render(fresh), tone: "compare" }];
        cur.fields = [{ name: "slots", value: render(slots), tone: "compare" }];
        m.vars({ "copies so far": copies });
        m.note(`Copy element ${k} (${slots[k]}) into the new block: ${k + 1}/${len} moved.`, "copy");
      }
      m.clearTones();
      m.set(main, "v", `len ${len}, cap ${newCap}`, nb.id, { tone: "active" });
      if (gc) {
        m.vars({ cap: newCap, "new cap": undefined });
        const stale = alias !== undefined && alias.id === cur.id;
        if (stale) {
          cur.label = `old block (cap ${capacity}), kept alive by p`;
          cur.tone = "compare";
          m.set(main, "p", `&old[0] → ${cur.addr} (stale)`, cur.id, { tone: "compare", dashed: true });
          alias = undefined;
          m.note(`Point v at the new block. The old block is not freed: p still refers to it, so the garbage collector keeps it alive. p is now stale. It still reads the old elements, and a write through it no longer reaches v.`, "stale");
        } else {
          m.free(cur.id);
          m.note(`Point v at the new block. Nothing refers to the old block any more, so it is garbage, and the collector will reclaim it.`, "free");
          m.purge();
        }
        cur = nb;
        slots.length = 0;
        slots.push(...fresh);
        capacity = newCap;
        slots[len] = x;
        len++;
        m.clearTones();
        cur.fields = [{ name: "slots", value: render(slots), tone: "active" }];
        m.set(main, "v", `len ${len}, cap ${capacity}`, cur.id);
        m.vars({ len, cap: capacity, "new cap": undefined, "copies so far": copies });
        m.note(`append(${x}): now there is room, so write into slot ${len - 1} of the new block. ${capacity - len} spare slot(s) remain.`, "append");
        continue;
      }
      m.free(cur.id);
      const dangling = alias !== undefined && alias.id === cur.id;
      if (dangling) {
        m.set(main, "p", `${cur.addr} (dangling)`, cur.id, { tone: "danger", dashed: true });
        alias = undefined;
      }
      m.note(dangling ? `Point v at the new block and free the old one. The alias p still holds the old address: it is now dangling, and reading through it is undefined behaviour.` : `Point v at the new block and free the old one. Any pointer to the old block would now be dangling.`, "free");
      m.purge();
      if (dangling) m.set(main, "p", `${cur.addr} (dangling)`, undefined, { tone: "danger" });
      cur = nb;
      slots.length = 0;
      slots.push(...fresh);
      capacity = newCap;
    }
    slots[len] = x;
    len++;
    m.clearTones();
    cur.fields = [{ name: "slots", value: render(slots), tone: "active" }];
    m.set(main, "v", `len ${len}, cap ${capacity}`, cur.id);
    m.vars({ len, cap: capacity, "new cap": undefined, "copies so far": copies });
    m.note(`append(${x}): len < cap, so write into slot ${len - 1} in place, O(1). ${capacity - len} spare slot(s) remain.`, "append");
    if (i === 1 && alias === undefined && !main.fields.some((fl) => fl.name === "p")) {
      alias = cur;
      m.set(main, "p", `&v[0] → ${cur.addr}`, cur.id, { tone: "compare", dashed: true });
      m.note(gc ? `p = &v[0]: an alias into the current block. It shares v's elements only until the next growth moves them to a new block.` : `p = &v[0]: an alias into the current block. It is valid only until the next growth moves the elements.`, "alias");
    }
  }
  m.clearTones();
  m.vars({ len, cap: capacity, "total copies": copies, appends: vals.length });
  m.note(`${vals.length} appends cost ${copies} element copies in total. Because capacity doubles, copies sum to less than n, so append is O(1) amortised even though a single append can be O(n).`, "done");
  return m.f.done();
};

// ---------- Renderer ----------

const W = 380;
const STACK_X = 6;
const STACK_W = 150;
const HEAP_X = 196;
const HEAP_W = 168;
const ROW = 12;
const HEAD = 16;
const GAP = 8;

const TONES: Tone[] = ["default", "active", "compare", "done", "danger", "muted", "path", "visited", "frontier"];

function StackHeapView({ state }: { state: MemoryState }) {
  const frameH = (fr: StackFrame) => HEAD + 4 + Math.max(1, fr.fields.length) * ROW;
  const objH = (o: HeapObj) => HEAD + 4 + Math.max(1, o.fields.length) * ROW;
  const threaded = state.stack.some((fr) => fr.thread !== undefined);
  const threadIds = threaded ? [...new Set(state.stack.map((fr) => fr.thread ?? 1))].sort((a, b) => a - b) : [1];
  const LABEL = threaded ? 14 : 0;
  const stackTotal = state.stack.reduce((a, fr) => a + frameH(fr) + GAP, 0) + threadIds.length * LABEL;
  const heapTotal = state.heap.reduce((a, o) => a + objH(o) + GAP, 0);
  const H = Math.max(120, stackTotal, heapTotal) + 36;
  // Stack frames grow upward from the bottom; with threads, each thread's
  // stack is its own band, thread 1 lowest, with a label above it.
  const stackPos: Record<string, { y: number; h: number }> = {};
  const threadLabels: { t: number; y: number }[] = [];
  let y = H - 10;
  for (const t of threadIds) {
    for (const fr of state.stack) {
      if (threaded && (fr.thread ?? 1) !== t) continue;
      const h = frameH(fr);
      y -= h;
      stackPos[fr.id] = { y, h };
      y -= GAP;
    }
    if (threaded) {
      threadLabels.push({ t, y: y - 2 });
      y -= LABEL;
    }
  }
  const heapPos: Record<string, { y: number; h: number }> = {};
  let hy = 22;
  for (const o of state.heap) {
    const h = objH(o);
    heapPos[o.id] = { y: hy, h };
    hy += h + GAP;
  }
  const fieldY = (top: number, i: number) => top + HEAD + 4 + i * ROW + ROW / 2;
  const arrows: React.ReactNode[] = [];
  for (const fr of state.stack) {
    fr.fields.forEach((fl, i) => {
      if (!fl.ptr || !heapPos[fl.ptr]) return;
      const t = heapPos[fl.ptr]!;
      const tone = fl.tone ?? "default";
      const y1 = fieldY(stackPos[fr.id]!.y, i);
      const y2 = t.y + Math.min(t.h / 2, 14);
      const x1 = STACK_X + STACK_W;
      const x2 = HEAP_X;
      const cx = (x1 + x2) / 2;
      arrows.push(<path key={`${fr.id}-${fl.name}`} d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2 - 2} ${y2}`} fill="none" stroke={toneStroke[tone]} strokeWidth={tone === "default" ? 1.5 : 2.2} strokeDasharray={fl.dashed ? "4 3" : undefined} markerEnd={`url(#mem-arrow-${tone})`} opacity={tone === "muted" ? 0.4 : 1} />);
    });
  }
  for (const o of state.heap) {
    o.fields.forEach((fl, i) => {
      if (!fl.ptr || !heapPos[fl.ptr] || fl.ptr === o.id) return;
      const t = heapPos[fl.ptr]!;
      const tone = fl.tone ?? "default";
      const y1 = fieldY(heapPos[o.id]!.y, i);
      const y2 = t.y + t.h / 2;
      const x = HEAP_X + HEAP_W;
      const bulge = 12 + Math.min(20, Math.abs(y2 - y1) / 8);
      arrows.push(<path key={`${o.id}-${fl.name}`} d={`M ${x} ${y1} C ${x + bulge} ${y1}, ${x + bulge} ${y2}, ${x + 2} ${y2}`} fill="none" stroke={toneStroke[tone]} strokeWidth={tone === "default" ? 1.5 : 2.2} strokeDasharray={fl.dashed ? "4 3" : undefined} markerEnd={`url(#mem-arrow-${tone})`} />);
    });
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[380px] max-w-[560px]" role="img" aria-label="Stack and heap">
      <defs>
        {TONES.map((t) => (
          <marker key={t} id={`mem-arrow-${t}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={toneStroke[t]} />
          </marker>
        ))}
      </defs>
      <text x={STACK_X} y={12} fontSize="10" fill="var(--fg-muted)" fontWeight={600}>{threaded ? "STACKS · one per thread" : "STACK · newest frame on top"}</text>
      {threadLabels.map((l) => (
        <text key={`t${l.t}`} x={STACK_X} y={l.y} fontSize="9" fill="var(--fg-muted)">{`thread ${l.t}`}</text>
      ))}
      <text x={HEAP_X} y={12} fontSize="10" fill="var(--fg-muted)" fontWeight={600}>HEAP</text>
      <line x1={STACK_X} y1={H - 8} x2={STACK_X + STACK_W} y2={H - 8} stroke="var(--border)" strokeWidth={1} />
      {state.stack.length === 0 && (
        <text x={STACK_X + STACK_W / 2} y={H - 16} fontSize="10" textAnchor="middle" fill="var(--fg-muted)">(empty)</text>
      )}
      {state.heap.length === 0 && (
        <text x={HEAP_X + HEAP_W / 2} y={40} fontSize="10" textAnchor="middle" fill="var(--fg-muted)">(nothing allocated)</text>
      )}
      {state.stack.map((fr) => {
        const p = stackPos[fr.id]!;
        const tone = fr.tone ?? "default";
        return (
          <g key={fr.id}>
            <rect x={STACK_X} y={p.y} width={STACK_W} height={p.h} rx={6} fill={toneFill[tone]} stroke={toneStroke[tone]} strokeWidth={tone === "default" ? 1.2 : 2} />
            <text x={STACK_X + 6} y={p.y + 12} fontSize="10" fontWeight={600} fill="var(--fg)">{fr.name}</text>
            {fr.fields.map((fl, i) => (
              <text key={fl.name} x={STACK_X + 8} y={fieldY(p.y, i) + 3.5} fontSize="9" fontFamily="var(--font-mono)" fill={fl.tone === "muted" ? "var(--fg-muted)" : "var(--fg)"} opacity={fl.tone === "muted" ? 0.6 : 1}>
                {fl.name} = {fl.value}
              </text>
            ))}
          </g>
        );
      })}
      {state.heap.map((o) => {
        const p = heapPos[o.id]!;
        const tone = o.tone ?? "default";
        const badge = o.freed ? "freed" : o.rc !== undefined ? `rc ${o.rc}` : o.mark !== undefined ? (o.mark ? "✓ marked" : "unmarked") : undefined;
        return (
          <g key={o.id} opacity={o.freed ? 0.55 : 1}>
            <rect x={HEAP_X} y={p.y} width={HEAP_W} height={p.h} rx={6} fill={toneFill[tone]} stroke={toneStroke[tone]} strokeWidth={tone === "default" ? 1.2 : 2} strokeDasharray={o.freed ? "3 3" : undefined} />
            <text x={HEAP_X + 6} y={p.y + 12} fontSize="10" fontWeight={600} fill="var(--fg)" style={{ textDecoration: o.freed ? "line-through" : undefined }}>{o.label}</text>
            <text x={HEAP_X + HEAP_W - 6} y={p.y + 12} fontSize="9" textAnchor="end" fontFamily="var(--font-mono)" fill={badge && (o.freed || (o.rc !== undefined && o.rc === 0)) ? "var(--danger)" : "var(--fg-muted)"}>
              {badge ? `${badge} · ` : ""}{o.addr}
            </text>
            {o.fields.map((fl, i) => (
              <text key={fl.name} x={HEAP_X + 8} y={fieldY(p.y, i) + 3.5} fontSize="9" fontFamily="var(--font-mono)" fill="var(--fg)">
                {fl.name}: {fl.value}
              </text>
            ))}
          </g>
        );
      })}
      {arrows}
    </svg>
  );
}

function PagesView({ pages }: { pages: PageState }) {
  const cell = (tone: Tone | undefined, extra = "") => cn("rounded border px-2 py-0.5 font-mono text-xs", toneClass[tone ?? "default"], extra);
  return (
    <div className="flex flex-wrap gap-6">
      <div>
        <div className="mb-1 text-[11px] text-muted">Page table (VPN → PFN)</div>
        <div className="flex flex-col gap-1">
          {pages.table.map((e) => (
            <div key={e.vpn} className="flex items-center gap-2">
              <span className="w-12 font-mono text-[10px] text-muted">page {e.vpn}</span>
              <span className={cell(e.tone, "min-w-24 text-center")}>{e.pfn === null ? "not present" : `PFN ${e.pfn}`}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-[11px] text-muted">Physical frames (RAM)</div>
        <div className="flex flex-col gap-1">
          {pages.frames.map((fr) => (
            <div key={fr.pfn} className="flex items-center gap-2">
              <span className="w-12 font-mono text-[10px] text-muted">PFN {fr.pfn}</span>
              <span className={cell(fr.tone, "min-w-24 text-center")}>{fr.vpn === null ? "free" : `page ${fr.vpn}`}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 mb-1 text-[11px] text-muted">Swapped out to disk</div>
        <div className="flex flex-wrap gap-1">
          {pages.disk.length === 0 ? <span className="text-[10px] text-muted">(none)</span> : pages.disk.map((v) => <span key={v} className={cell("muted")}>page {v}</span>)}
        </div>
      </div>
    </div>
  );
}

function CacheView({ cache }: { cache: CacheState }) {
  const lines = Math.ceil(cache.n / cache.lineSize);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 text-[11px] text-muted">Cache ({cache.lines.length} slots, LRU)</div>
        <div className="flex flex-wrap gap-2">
          {cache.lines.map((l) => (
            <div key={l.slot} className={cn("rounded-md border px-2 py-1 font-mono text-xs", toneClass[l.tone ?? "default"])}>
              slot {l.slot}: {l.line === null ? "empty" : `line ${l.line}`}
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-[11px] text-muted">RAM: array a[0..{cache.n - 1}] in {cache.lineSize}-element cache lines</div>
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          {Array.from({ length: lines }, (_, li) => (
            <div key={li} className="flex flex-col">
              <div className="flex gap-0.5">
                {Array.from({ length: cache.lineSize }, (_, k) => {
                  const idx = li * cache.lineSize + k;
                  if (idx >= cache.n) return null;
                  return (
                    <div key={idx} className={cn("flex h-6 w-6 items-center justify-center rounded border font-mono text-[9px]", toneClass[cache.memTones[idx] ?? "default"])}>
                      {idx}
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-muted">line {li}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Renderer({ frame }: RendererProps<MemoryInput, MemoryState>) {
  const { state } = frame;
  return (
    <div className="flex flex-col items-start gap-3">
      {state.pages ? <PagesView pages={state.pages} /> : state.cache ? <CacheView cache={state.cache} /> : <StackHeapView state={state} />}
      <Vars vars={state.vars} />
      {state.pages ? (
        <Legend items={[{ tone: "done", label: "hit" }, { tone: "danger", label: "page fault" }, { tone: "compare", label: "evicted" }, { tone: "active", label: "loaded" }, { tone: "visited", label: "resident" }]} />
      ) : state.cache ? (
        <Legend items={[{ tone: "done", label: "element used" }, { tone: "active", label: "line just fetched" }, { tone: "visited", label: "cached" }, { tone: "default", label: "in RAM only" }]} />
      ) : (
        <Legend items={[{ tone: "active", label: "current frame / new object" }, { tone: "compare", label: "borrow / being changed" }, { tone: "visited", label: "marked live" }, { tone: "done", label: "kept / returned value" }, { tone: "danger", label: "freed / dangling" }, { tone: "muted", label: "moved-from" }]} />
      )}
    </div>
  );
}

export const memoryFamily: Family<MemoryInput, MemoryState> = {
  name: "Memory",
  description: "Stack frames and heap objects, garbage collection, ownership, paging and cache lines.",
  Renderer,
  algorithms: {
    "stack-heap": stackHeap,
    "call-stack": callStack,
    "gc-mark-sweep": gcMarkSweep,
    "reference-counting": referenceCounting,
    "ownership-borrowing": ownershipBorrowing,
    "virtual-memory-paging": virtualMemoryPaging,
    "cache-lines": cacheLines,
    "dynamic-array-growth": dynamicArrayGrowth,
  },
  labels: {
    "stack-heap": "Stack frames versus heap objects",
    "call-stack": "Call stack: frames pushed and popped",
    "gc-mark-sweep": "Garbage collection: mark and sweep",
    "reference-counting": "Reference counting",
    "ownership-borrowing": "Ownership and borrowing",
    "virtual-memory-paging": "Virtual memory: page table and faults",
    "cache-lines": "Cache lines and locality",
    "dynamic-array-growth": "Dynamic array growth by doubling",
  },
  examples: {
    "stack-heap": { values: [4, 8, 15] },
    "call-stack": { n: 4 },
    "gc-mark-sweep": {},
    "reference-counting": {},
    "ownership-borrowing": {},
    "virtual-memory-paging": { values: [0, 1, 2, 0, 3, 4, 1, 5, 0], n: 3 },
    "cache-lines": { n: 64 },
    "dynamic-array-growth": { values: [1, 2, 3, 4, 5, 6, 7] },
  },
  normalise: (raw) => {
    const values = Array.isArray(raw.values) ? (raw.values as unknown[]).map(Number).filter((x) => Number.isFinite(x)).slice(0, 40) : undefined;
    const nRaw = raw.n ?? raw.frames ?? raw.size ?? raw.depth;
    const n = nRaw === undefined ? undefined : Number(nRaw);
    const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
    const out: MemoryInput = { values: values && values.length > 0 ? values : undefined, n: n !== undefined && Number.isFinite(n) ? n : undefined };
    if (str(raw.fn)) out.fn = str(raw.fn);
    if (raw.base !== undefined && Number.isFinite(Number(raw.base))) out.base = Number(raw.base);
    if (str(raw.name)) out.name = str(raw.name);
    if (Array.isArray(raw.calls)) out.calls = (raw.calls as unknown[]).map(String).filter((c) => c.trim() !== "").slice(0, 8);
    if (raw.sample === true) out.sample = true;
    if (str(raw.lang)) out.lang = str(raw.lang)!.toLowerCase();
    if (raw.gc === true) out.gc = true;
    if (raw.threads !== undefined && Number.isFinite(Number(raw.threads))) out.threads = Number(raw.threads);
    return out;
  },
};
