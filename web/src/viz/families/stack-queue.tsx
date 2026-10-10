// Stacks, queues and deques, plus the classic problems built on them. Every
// generator replays a list of operations (or scans an input sequence) and
// shows the containers involved side by side, so the learner sees exactly
// which end each operation touches.
import { Cells, Legend, Vars, toneClass, type Tone } from "../primitives";
import { Frames, type Family, type RendererProps } from "../engine";
import { cn } from "../../lib/utils";

export type Op = [string, ...unknown[]];
export interface SQInput {
  operations?: Op[];
  /** balanced-parentheses: the string to check. */
  input?: string;
  /** sliding-window-max: the sequence. */
  values?: number[];
  k?: number;
  /** min-stack: "on-new-min" (default; push to the min stack only when x ≤ its top) or "parallel" (push min(x, top) on every push). */
  variant?: "on-new-min" | "parallel";
}

export interface Container {
  label: string;
  kind: "stack" | "queue" | "deque";
  items: (string | number)[];
  tones?: (Tone | undefined)[];
  /** Small text shown with each item (e.g. the index it came from). */
  sub?: (string | number | undefined)[];
}
export interface Seq {
  label: string;
  values: (string | number | null)[];
  tones?: (Tone | undefined)[];
  labels?: (string | number | null | undefined)[];
  pointers?: Record<string, number | undefined>;
}
export interface SQState {
  containers: Container[];
  sequence?: Seq;
  output?: Seq;
  vars: Record<string, unknown>;
  /** Operation timeline: chips shown above the containers. */
  ops?: string[];
  opIndex?: number;
}

type G = (input: SQInput) => ReturnType<Frames<SQState>["done"]>;

const MAX_OPS = 60;
const MAX_LEN = 40;

function make(containers: Container[], ops?: string[]) {
  const s: SQState = { containers, vars: {}, ops, opIndex: -1 };
  const f = new Frames<SQState>(() => ({
    containers: s.containers.map((c) => ({ ...c, items: [...c.items], tones: c.tones ? [...c.tones] : undefined, sub: c.sub ? [...c.sub] : undefined })),
    sequence: s.sequence ? { ...s.sequence, values: [...s.sequence.values], tones: s.sequence.tones ? [...s.sequence.tones] : undefined, labels: s.sequence.labels ? [...s.sequence.labels] : undefined, pointers: { ...s.sequence.pointers } } : undefined,
    output: s.output ? { ...s.output, values: [...s.output.values], tones: s.output.tones ? [...s.output.tones] : undefined, labels: s.output.labels ? [...s.output.labels] : undefined } : undefined,
    vars: { ...s.vars },
    ops: s.ops,
    opIndex: s.opIndex,
  }));
  const clearTones = () => {
    for (const c of s.containers) c.tones = c.items.map(() => undefined);
  };
  const mark = (c: Container, i: number, t: Tone) => {
    c.tones ??= c.items.map(() => undefined);
    if (i >= 0 && i < c.items.length) c.tones[i] = t;
  };
  return { s, f, clearTones, mark };
}

interface ParsedOp {
  name: string;
  arg: string | number | undefined;
  text: string;
}
const canon = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");
function parseOps(ops: Op[] | undefined): ParsedOp[] {
  if (!Array.isArray(ops)) return [];
  const out: ParsedOp[] = [];
  for (const op of ops.slice(0, MAX_OPS)) {
    let name = "";
    let arg: unknown;
    if (Array.isArray(op)) {
      name = String(op[0] ?? "");
      arg = op[1];
    } else if (typeof op === "string") {
      const [n, ...rest] = (op as string).trim().split(/[\s(),]+/);
      name = n ?? "";
      arg = rest[0];
    } else if (op && typeof op === "object") {
      const o = op as Record<string, unknown>;
      name = String(o.op ?? o.name ?? o.type ?? "");
      arg = o.value ?? o.arg ?? o.x;
    }
    const a = arg === undefined || arg === null || arg === "" ? undefined : typeof arg === "number" ? arg : Number.isFinite(Number(arg)) && String(arg).trim() !== "" ? Number(arg) : String(arg);
    out.push({ name: canon(name), arg: a, text: a === undefined ? `${name}()` : `${name}(${a})` });
  }
  return out;
}

const PUSH = new Set(["push", "enqueue", "offer", "add", "append", "insert", "put"]);
const POP = new Set(["pop", "dequeue", "poll", "remove", "shift", "popleft", "take"]);
const PEEK = new Set(["peek", "top", "front", "first", "head"]);
const MIN = new Set(["getmin", "min", "minimum"]);
const SIZE = new Set(["size", "len", "length", "isempty", "empty"]);

const stackOps: G = ({ operations }) => {
  const ops = parseOps(operations);
  const st: Container = { label: "stack", kind: "stack", items: [] };
  const { s, f, clearTones, mark } = make([st], ops.map((o) => o.text));
  s.output = { label: "popped (in order)", values: [] };
  s.vars = { size: 0 };
  f.push(`A stack has one end, the top: push writes there and pop reads there, so the last item in is the first out (LIFO).`);
  if (ops.length === 0) f.push(`No operations given: an empty stack, size 0.`, "empty");
  for (let i = 0; i < ops.length && !f.full; i++) {
    const op = ops[i]!;
    s.opIndex = i;
    clearTones();
    if (PUSH.has(op.name)) {
      st.items.push(op.arg ?? 0);
      mark(st, st.items.length - 1, "active");
      s.vars = { size: st.items.length, top: st.items[st.items.length - 1] };
      const below = st.items.length - 1;
      f.push(`push(${op.arg}): place it on top; ${below === 0 ? "the stack was empty, so it is also the bottom" : `the ${below} item${below === 1 ? " below is" : "s below are"} untouched`}. size = ${st.items.length}.`, "push");
    } else if (POP.has(op.name)) {
      if (st.items.length === 0) {
        s.vars = { size: 0, error: "underflow" };
        f.push(`pop() on an empty stack: underflow. A real implementation throws or returns null, so callers must check isEmpty first.`, "underflow");
        continue;
      }
      const v = st.items.pop()!;
      s.output!.values.push(v);
      s.output!.tones = s.output!.values.map((_, j) => (j === s.output!.values.length - 1 ? "done" : undefined));
      if (st.items.length) mark(st, st.items.length - 1, "compare");
      s.vars = { size: st.items.length, popped: v, top: st.items[st.items.length - 1] };
      f.push(`pop() → ${v}: the most recently pushed item leaves first; ${st.items.length ? `${st.items[st.items.length - 1]} is the new top` : "the stack is now empty"}. size = ${st.items.length}.`, "pop");
    } else if (PEEK.has(op.name)) {
      if (st.items.length === 0) {
        f.push(`peek() on an empty stack: nothing to read.`, "peek");
        continue;
      }
      mark(st, st.items.length - 1, "compare");
      s.vars = { size: st.items.length, top: st.items[st.items.length - 1] };
      f.push(`peek() → ${st.items[st.items.length - 1]}: read the top without removing it.`, "peek");
    } else if (SIZE.has(op.name)) {
      s.vars = { size: st.items.length, isEmpty: st.items.length === 0 };
      f.push(`${op.name === "size" || op.name === "len" || op.name === "length" ? `size() → ${st.items.length}` : `isEmpty() → ${st.items.length === 0}`}: a counter kept alongside the stack answers this in O(1).`, "size");
    } else {
      f.push(`Unknown operation "${op.text}" for a stack; skipped. Use push, pop or peek.`, "skip");
    }
  }
  clearTones();
  s.opIndex = ops.length;
  f.push(`Every operation touched only the top: push, pop and peek are O(1) each, and every pop returned the most recently pushed item still on the stack.`, "done");
  return f.done();
};

const queueOps: G = ({ operations }) => {
  const ops = parseOps(operations);
  const q: Container = { label: "queue", kind: "queue", items: [] };
  const { s, f, clearTones, mark } = make([q], ops.map((o) => o.text));
  s.output = { label: "dequeued (in order)", values: [] };
  s.vars = { size: 0 };
  f.push(`A queue has two ends: enqueue appends at the back and dequeue removes from the front, so the first item in is the first out (FIFO).`);
  if (ops.length === 0) f.push(`No operations given: an empty queue, size 0.`, "empty");
  for (let i = 0; i < ops.length && !f.full; i++) {
    const op = ops[i]!;
    s.opIndex = i;
    clearTones();
    if (PUSH.has(op.name)) {
      q.items.push(op.arg ?? 0);
      mark(q, q.items.length - 1, "active");
      s.vars = { size: q.items.length, front: q.items[0], back: q.items[q.items.length - 1] };
      f.push(`enqueue(${op.arg}): append at the back; ${q.items[0]} stays at the front. size = ${q.items.length}.`, "enqueue");
    } else if (POP.has(op.name)) {
      if (q.items.length === 0) {
        s.vars = { size: 0, error: "underflow" };
        f.push(`dequeue() on an empty queue: underflow, there is nothing at the front to remove.`, "underflow");
        continue;
      }
      const v = q.items.shift()!;
      s.output!.values.push(v);
      s.output!.tones = s.output!.values.map((_, j) => (j === s.output!.values.length - 1 ? "done" : undefined));
      if (q.items.length) mark(q, 0, "compare");
      s.vars = { size: q.items.length, dequeued: v, front: q.items[0], back: q.items[q.items.length - 1] };
      f.push(`dequeue() → ${v}: the oldest item leaves from the front; ${q.items.length ? `${q.items[0]} is the new front` : "the queue is now empty"}. size = ${q.items.length}.`, "dequeue");
    } else if (PEEK.has(op.name)) {
      if (q.items.length === 0) {
        f.push(`peek() on an empty queue: nothing at the front.`, "peek");
        continue;
      }
      mark(q, 0, "compare");
      f.push(`peek() → ${q.items[0]}: read the front without removing it.`, "peek");
    } else if (SIZE.has(op.name)) {
      s.vars = { size: q.items.length, isEmpty: q.items.length === 0 };
      f.push(`size() → ${q.items.length}.`, "size");
    } else {
      f.push(`Unknown operation "${op.text}" for a queue; skipped. Use enqueue, dequeue or peek.`, "skip");
    }
  }
  clearTones();
  s.opIndex = ops.length;
  f.push(`Items left in the order they arrived. With a linked list or ring buffer both ends are O(1); shifting an array on dequeue would cost O(n) per operation.`, "done");
  return f.done();
};

const DQ_FRONT_PUSH = new Set(["pushfront", "appendleft", "offerfirst", "addfirst", "unshift", "pushleft", "addfront"]);
const DQ_BACK_PUSH = new Set(["pushback", "append", "offerlast", "addlast", "push", "pushright", "addback", "enqueue", "add", "offer"]);
const DQ_FRONT_POP = new Set(["popfront", "popleft", "pollfirst", "removefirst", "shift", "dequeue", "poll"]);
const DQ_BACK_POP = new Set(["popback", "pop", "polllast", "removelast", "popright"]);
const DQ_FRONT_PEEK = new Set(["front", "peekfront", "peekfirst", "first", "peekleft"]);
const DQ_BACK_PEEK = new Set(["back", "peekback", "peeklast", "last", "peekright", "peek"]);

const dequeOps: G = ({ operations }) => {
  const ops = parseOps(operations);
  const dq: Container = { label: "deque", kind: "deque", items: [] };
  const { s, f, clearTones, mark } = make([dq], ops.map((o) => o.text));
  s.output = { label: "removed (in order)", values: [] };
  s.vars = { size: 0 };
  f.push(`A deque (double-ended queue) allows push and pop at both the front and the back, all in O(1); it generalises both the stack and the queue.`);
  if (ops.length === 0) f.push(`No operations given: an empty deque.`, "empty");
  const removed = (v: string | number, end: string) => {
    s.output!.values.push(v);
    s.output!.tones = s.output!.values.map((_, j) => (j === s.output!.values.length - 1 ? "done" : undefined));
    s.vars = { size: dq.items.length, removed: v, front: dq.items[0], back: dq.items[dq.items.length - 1] };
    f.push(`pop${end}() → ${v}: removed from the ${end.toLowerCase()}; ${dq.items.length ? `now front = ${dq.items[0]}, back = ${dq.items[dq.items.length - 1]}` : "the deque is empty"}.`, `pop ${end.toLowerCase()}`);
  };
  for (let i = 0; i < ops.length && !f.full; i++) {
    const op = ops[i]!;
    s.opIndex = i;
    clearTones();
    if (DQ_FRONT_PUSH.has(op.name)) {
      dq.items.unshift(op.arg ?? 0);
      mark(dq, 0, "active");
      s.vars = { size: dq.items.length, front: dq.items[0], back: dq.items[dq.items.length - 1] };
      f.push(`pushFront(${op.arg}): it becomes the new front; the back is unchanged. size = ${dq.items.length}.`, "push front");
    } else if (DQ_BACK_PUSH.has(op.name)) {
      dq.items.push(op.arg ?? 0);
      mark(dq, dq.items.length - 1, "active");
      s.vars = { size: dq.items.length, front: dq.items[0], back: dq.items[dq.items.length - 1] };
      f.push(`pushBack(${op.arg}): it becomes the new back; the front is unchanged. size = ${dq.items.length}.`, "push back");
    } else if (DQ_FRONT_POP.has(op.name)) {
      if (dq.items.length === 0) {
        f.push(`popFront() on an empty deque: underflow.`, "underflow");
        continue;
      }
      removed(dq.items.shift()!, "Front");
    } else if (DQ_BACK_POP.has(op.name)) {
      if (dq.items.length === 0) {
        f.push(`popBack() on an empty deque: underflow.`, "underflow");
        continue;
      }
      removed(dq.items.pop()!, "Back");
    } else if (DQ_FRONT_PEEK.has(op.name) || DQ_BACK_PEEK.has(op.name)) {
      const front = DQ_FRONT_PEEK.has(op.name);
      if (dq.items.length === 0) {
        f.push(`peek on an empty deque: nothing to read.`, "peek");
        continue;
      }
      const idx = front ? 0 : dq.items.length - 1;
      mark(dq, idx, "compare");
      f.push(`${front ? "front" : "back"}() → ${dq.items[idx]}: read without removing.`, "peek");
    } else if (SIZE.has(op.name)) {
      s.vars = { size: dq.items.length };
      f.push(`size() → ${dq.items.length}.`, "size");
    } else {
      f.push(`Unknown operation "${op.text}" for a deque; skipped. Use pushFront, pushBack, popFront or popBack.`, "skip");
    }
  }
  clearTones();
  s.opIndex = ops.length;
  f.push(`Both ends were O(1) throughout. A ring buffer (Python's collections.deque, Rust's VecDeque) or a doubly linked list gives exactly this.`, "done");
  return f.done();
};

const PAIRS: Record<string, string> = { ")": "(", "]": "[", "}": "{", ">": "<" };
const OPENERS = new Set(Object.values(PAIRS));

const balancedParentheses: G = ({ input = "" }) => {
  const chars = [...input].slice(0, MAX_LEN);
  const st: Container = { label: "stack of openers", kind: "stack", items: [], sub: [] };
  const { s, f, clearTones, mark } = make([st]);
  const seqTones: (Tone | undefined)[] = chars.map(() => undefined);
  const seq: Seq = { label: "input", values: chars, tones: seqTones, pointers: {} };
  s.sequence = seq;
  const openStack: number[] = [];
  f.push(chars.length === 0 ? `The empty string has no brackets: the stack stays empty, so it is balanced.` : `Scan left to right: every opener is pushed, every closer must match the top of the stack. Balanced means the stack is empty at the end.`);
  for (let i = 0; i < chars.length && !f.full; i++) {
    const ch = chars[i]!;
    clearTones();
    seq.pointers = { i };
    seqTones[i] = "compare";
    s.vars = { i, depth: st.items.length };
    if (OPENERS.has(ch)) {
      st.items.push(ch);
      st.sub!.push(i);
      openStack.push(i);
      mark(st, st.items.length - 1, "active");
      seqTones[i] = "frontier";
      s.vars = { i, depth: st.items.length };
      f.push(`'${ch}' is an opener: push it. Depth ${st.items.length}; a matching closer must come before anything outside it closes.`, "push");
    } else if (PAIRS[ch] !== undefined) {
      if (st.items.length === 0) {
        seqTones[i] = "danger";
        s.vars = { i, depth: 0, result: false };
        f.push(`'${ch}' is a closer but the stack is empty: nothing is open, so the string is not balanced. (This case must not crash: check isEmpty before pop.)`, "fail");
        return f.done();
      }
      const top = st.items[st.items.length - 1]!;
      if (top === PAIRS[ch]) {
        const j = openStack.pop()!;
        st.items.pop();
        st.sub!.pop();
        seqTones[i] = "done";
        seqTones[j] = "done";
        for (const k of openStack) seqTones[k] = "frontier";
        if (st.items.length) mark(st, st.items.length - 1, "compare");
        s.vars = { i, depth: st.items.length };
        f.push(`'${ch}' matches the top '${top}' (opened at index ${j}): pop it. Depth ${st.items.length}.`, "match");
      } else {
        seqTones[i] = "danger";
        mark(st, st.items.length - 1, "danger");
        s.vars = { i, depth: st.items.length, result: false };
        f.push(`'${ch}' does not match the top '${top}': the most recent opener must close first, so the string is not balanced.`, "fail");
        return f.done();
      }
    } else {
      seqTones[i] = "muted";
      f.push(`'${ch}' is not a bracket: ignore it.`, "skip");
    }
  }
  clearTones();
  seq.pointers = {};
  if (st.items.length === 0) {
    for (let i = 0; i < chars.length; i++) if (seqTones[i] !== "muted") seqTones[i] = "done";
    s.vars = { result: true };
    f.push(`End of input with an empty stack: every opener was closed in the right order, so the string is balanced. O(n) time, O(n) stack in the worst case.`, "done");
  } else {
    for (const k of openStack) seqTones[k] = "danger";
    for (let i = 0; i < st.items.length; i++) mark(st, i, "danger");
    s.vars = { result: false, unclosed: st.items.length };
    f.push(`End of input but ${st.items.length} opener${st.items.length === 1 ? " is" : "s are"} still on the stack: not balanced. This is why the function returns "stack is empty", not just "no mismatch seen".`, "fail");
  }
  return f.done();
};

const queueViaTwoStacks: G = ({ operations }) => {
  const ops = parseOps(operations);
  const inb: Container = { label: "in (push here)", kind: "stack", items: [] };
  const out: Container = { label: "out (pop here)", kind: "stack", items: [] };
  const { s, f, clearTones, mark } = make([inb, out], ops.map((o) => o.text));
  s.output = { label: "dequeued (in order)", values: [] };
  let moves = 0;
  let count = 0;
  const vars = () => ({ size: inb.items.length + out.items.length, moves, ops: count, "moves/op": count ? Number((moves / count).toFixed(2)) : 0 });
  s.vars = vars();
  f.push(`Two stacks make a queue: enqueue pushes onto "in"; dequeue pops from "out", refilling it by draining "in" only when it is empty, which reverses the order back to FIFO.`);
  if (ops.length === 0) f.push(`No operations given: both stacks are empty.`, "empty");
  const drain = (): boolean => {
    if (out.items.length > 0) return true;
    if (inb.items.length === 0) return false;
    const total = inb.items.length;
    while (inb.items.length && !f.full) {
      const v = inb.items.pop()!;
      out.items.push(v);
      moves++;
      clearTones();
      mark(out, out.items.length - 1, "active");
      s.vars = vars();
      const k = total - inb.items.length;
      f.push(
        `"out" is empty, so transfer: pop ${v} from "in" and push it onto "out" (move ${k} of ${total}). ` +
          (k === total
            ? `"in" is now empty and the oldest item, ${v}, is on top of "out", ready to leave first.`
            : k === 1
              ? `The newest item moves first, so it ends up at the bottom of "out".`
              : `It lands on top of ${out.items[out.items.length - 2]}: popping one stack into another reverses the order.`),
        "move",
      );
    }
    return true;
  };
  for (let i = 0; i < ops.length && !f.full; i++) {
    const op = ops[i]!;
    s.opIndex = i;
    count++;
    clearTones();
    if (PUSH.has(op.name)) {
      inb.items.push(op.arg ?? 0);
      mark(inb, inb.items.length - 1, "active");
      s.vars = vars();
      f.push(`enqueue(${op.arg}): push onto "in" in O(1); "out" is not touched.`, "enqueue");
    } else if (POP.has(op.name)) {
      if (!drain()) {
        s.vars = { ...vars(), error: "underflow" };
        f.push(`dequeue() with both stacks empty: underflow.`, "underflow");
        continue;
      }
      const v = out.items.pop()!;
      s.output!.values.push(v);
      s.output!.tones = s.output!.values.map((_, j) => (j === s.output!.values.length - 1 ? "done" : undefined));
      clearTones();
      if (out.items.length) mark(out, out.items.length - 1, "compare");
      s.vars = { ...vars(), dequeued: v };
      f.push(`dequeue() → ${v}: pop the top of "out"${out.items.length ? `; ${out.items.length} item${out.items.length === 1 ? " remains" : "s remain"} there, so the next dequeue${out.items.length === 1 ? " is" : "s are"} free` : ""}.`, "dequeue");
    } else if (PEEK.has(op.name)) {
      if (!drain()) {
        f.push(`peek() on an empty queue: nothing at the front.`, "peek");
        continue;
      }
      clearTones();
      mark(out, out.items.length - 1, "compare");
      f.push(`peek() → ${out.items[out.items.length - 1]}: the top of "out" is the front of the queue.`, "peek");
    } else {
      count--;
      f.push(`Unknown operation "${op.text}"; skipped. Use enqueue/push and dequeue/pop.`, "skip");
    }
  }
  clearTones();
  s.opIndex = ops.length;
  s.vars = vars();
  f.push(`Each element crosses from "in" to "out" at most once, so ${moves} moves over ${count} operations: amortised O(1) per operation even though a single dequeue can cost O(n).`, "done");
  return f.done();
};

const minStack: G = ({ operations, variant }) => {
  if (variant === "parallel") return minStackParallel(operations);
  const ops = parseOps(operations);
  const st: Container = { label: "stack", kind: "stack", items: [] };
  const mn: Container = { label: "min stack", kind: "stack", items: [] };
  const { s, f, clearTones, mark } = make([st, mn], ops.map((o) => o.text));
  const num = (v: string | number | undefined) => (typeof v === "number" ? v : Number(v ?? 0));
  const vars = () => ({ size: st.items.length, min: mn.items[mn.items.length - 1] });
  s.vars = vars();
  f.push(`Min-stack: a second stack holds the running minimum. Its top is always the minimum of everything currently in the main stack, so getMin is O(1).`);
  if (ops.length === 0) f.push(`No operations given: both stacks are empty.`, "empty");
  for (let i = 0; i < ops.length && !f.full; i++) {
    const op = ops[i]!;
    s.opIndex = i;
    clearTones();
    if (PUSH.has(op.name)) {
      const v = num(op.arg);
      st.items.push(v);
      mark(st, st.items.length - 1, "active");
      const top = mn.items[mn.items.length - 1];
      if (top === undefined || v <= num(top)) {
        mn.items.push(v);
        mark(mn, mn.items.length - 1, "active");
        s.vars = vars();
        f.push(top === undefined ? `push(${v}): the min stack is empty, so ${v} is also the current minimum: push it there too.` : `push(${v}): ${v} ≤ current min ${top}, so push it onto the min stack as well (ties are pushed so a later pop of the duplicate does not lose the min).`, "push");
      } else {
        mark(mn, mn.items.length - 1, "compare");
        s.vars = vars();
        f.push(`push(${v}): ${v} > current min ${top}, so the min stack is unchanged; the minimum is still ${top}.`, "push");
      }
    } else if (POP.has(op.name)) {
      if (st.items.length === 0) {
        f.push(`pop() on an empty stack: underflow.`, "underflow");
        continue;
      }
      const v = st.items.pop()!;
      const top = mn.items[mn.items.length - 1];
      if (top !== undefined && num(top) === num(v)) {
        mn.items.pop();
        if (mn.items.length) mark(mn, mn.items.length - 1, "compare");
        s.vars = { ...vars(), popped: v };
        const below = mn.items[mn.items.length - 1];
        f.push(`pop() → ${v}: it equals the min stack's top, so pop that too; ${below === undefined ? "both stacks are now empty" : num(below) === num(v) ? `the min stack still holds another ${v}, recorded by the tie, so the minimum stays ${v}` : `the minimum reverts to ${below}`}.`, "pop");
      } else {
        if (mn.items.length) mark(mn, mn.items.length - 1, "compare");
        s.vars = { ...vars(), popped: v };
        f.push(`pop() → ${v}: it is not the current minimum (${top}), so the min stack is unchanged.`, "pop");
      }
    } else if (MIN.has(op.name)) {
      if (mn.items.length === 0) {
        f.push(`getMin() on an empty stack: no minimum exists.`, "getMin");
        continue;
      }
      mark(mn, mn.items.length - 1, "done");
      s.vars = vars();
      f.push(`getMin() → ${mn.items[mn.items.length - 1]}: read the top of the min stack, O(1), no scan of the main stack.`, "getMin");
    } else if (PEEK.has(op.name)) {
      if (st.items.length === 0) {
        f.push(`top() on an empty stack: nothing to read.`, "peek");
        continue;
      }
      mark(st, st.items.length - 1, "compare");
      f.push(`top() → ${st.items[st.items.length - 1]}.`, "peek");
    } else {
      f.push(`Unknown operation "${op.text}"; skipped. Use push, pop, top or getMin.`, "skip");
    }
  }
  clearTones();
  s.opIndex = ops.length;
  f.push(`push, pop, top and getMin were all O(1). The cost is O(n) extra space in the worst case (a strictly decreasing sequence of pushes).`, "done");
  return f.done();
};

/** The parallel min-stack: the min stack is as tall as the main stack and min[i] = min(main[0..i]). */
function minStackParallel(operations: Op[] | undefined): ReturnType<Frames<SQState>["done"]> {
  const ops = parseOps(operations);
  const st: Container = { label: "stack", kind: "stack", items: [] };
  const mn: Container = { label: "min stack", kind: "stack", items: [] };
  const { s, f, clearTones, mark } = make([st, mn], ops.map((o) => o.text));
  const num = (v: string | number | undefined) => (typeof v === "number" ? v : Number(v ?? 0));
  const vars = () => ({ size: st.items.length, min: mn.items[mn.items.length - 1] });
  s.vars = vars();
  f.push(`Min-stack, parallel version: a second stack as tall as the main one, where each entry is the minimum of the main stack from the bottom up to that height. Its top is the current minimum, so getMin is O(1).`);
  if (ops.length === 0) f.push(`No operations given: both stacks are empty.`, "empty");
  for (let i = 0; i < ops.length && !f.full; i++) {
    const op = ops[i]!;
    s.opIndex = i;
    clearTones();
    if (PUSH.has(op.name)) {
      const v = num(op.arg);
      const top = mn.items[mn.items.length - 1];
      const m = top === undefined ? v : Math.min(v, num(top));
      st.items.push(v);
      mn.items.push(m);
      mark(st, st.items.length - 1, "active");
      mark(mn, mn.items.length - 1, "active");
      s.vars = vars();
      f.push(
        top === undefined
          ? `push(${v}): both stacks are empty, so ${v} is the minimum so far: push ${v} onto each.`
          : `push(${v}): ${v} goes onto the main stack and min(${v}, ${top}) = ${m} onto the min stack${v < num(top) ? `: ${v} is a new minimum` : v === num(top) ? `: a tie, recorded again like any other push` : `: the minimum is still ${top}, and it is recorded again at this height`}.`,
        "push",
      );
    } else if (POP.has(op.name)) {
      if (st.items.length === 0) {
        f.push(`pop() on an empty stack: underflow.`, "underflow");
        continue;
      }
      const v = st.items.pop()!;
      mn.items.pop();
      if (mn.items.length) mark(mn, mn.items.length - 1, "compare");
      s.vars = { ...vars(), popped: v };
      f.push(`pop() → ${v}: pop both stacks together, with no comparison; ${mn.items.length ? `the min stack's top, ${mn.items[mn.items.length - 1]}, is the minimum of what remains` : "both stacks are now empty"}.`, "pop");
    } else if (MIN.has(op.name)) {
      if (mn.items.length === 0) {
        f.push(`getMin() on an empty stack: no minimum exists.`, "getMin");
        continue;
      }
      mark(mn, mn.items.length - 1, "done");
      s.vars = vars();
      f.push(`getMin() → ${mn.items[mn.items.length - 1]}: read the top of the min stack, O(1), no scan of the main stack.`, "getMin");
    } else if (PEEK.has(op.name)) {
      if (st.items.length === 0) {
        f.push(`top() on an empty stack: nothing to read.`, "peek");
        continue;
      }
      mark(st, st.items.length - 1, "compare");
      f.push(`top() → ${st.items[st.items.length - 1]}.`, "peek");
    } else {
      f.push(`Unknown operation "${op.text}"; skipped. Use push, pop, top or getMin.`, "skip");
    }
  }
  clearTones();
  s.opIndex = ops.length;
  f.push(`push, pop, top and getMin were all O(1), and duplicates needed no special case because the two stacks always move together. The cost is a min stack exactly as tall as the main one: O(n) extra space, always.`, "done");
  return f.done();
}

const slidingWindowMax: G = ({ values = [], k = 3 }) => {
  const vals = values.slice(0, MAX_LEN);
  const kk = Math.max(1, Math.min(Math.floor(k), Math.max(1, vals.length)));
  const dq: Container = { label: "deque of indices (values shown)", kind: "deque", items: [], sub: [] };
  const { s, f, clearTones, mark } = make([dq]);
  const seqTones: (Tone | undefined)[] = vals.map(() => undefined);
  const seq: Seq = { label: "values", values: vals, tones: seqTones, pointers: {} };
  s.sequence = seq;
  s.output = { label: "window max", values: [], labels: [] };
  const idx: number[] = [];
  const syncDq = () => {
    dq.items = idx.map((i) => vals[i]!);
    dq.sub = idx.map((i) => `i=${i}`);
    dq.tones = dq.items.map(() => undefined);
  };
  const paint = (i: number) => {
    const L = i - kk + 1;
    for (let j = 0; j < vals.length; j++) seqTones[j] = j >= L && j <= i ? "active" : j < L ? "muted" : undefined;
    seqTones[i] = "compare";
    seq.pointers = L >= 0 ? { L, i } : { i };
  };
  if (vals.length === 0) {
    f.push(`No values: there are no windows, so the answer is an empty list.`, "empty");
    return f.done();
  }
  f.push(`Sliding window maximum with k = ${kk}: keep a deque of indices whose values are decreasing from front to back, so the front is always the max of the current window.`);
  for (let i = 0; i < vals.length && !f.full; i++) {
    const v = vals[i]!;
    while (idx.length && vals[idx[idx.length - 1]!]! <= v && !f.full) {
      const j = idx.pop()!;
      syncDq();
      paint(i);
      s.vars = { i, k: kk, deque: idx.map((t) => vals[t]) };
      f.push(vals[j] === v ? `values[${i}] = ${v} equals values[${j}] = ${vals[j]} at the back: evict the older ${v} from the back, because the newer one is just as large and stays in the window longer.` : `values[${i}] = ${v} > values[${j}] = ${vals[j]} at the back: evict ${vals[j]} from the back, because it can never be a window max while ${v} is in the same window.`, "evict back");
    }
    idx.push(i);
    syncDq();
    mark(dq, dq.items.length - 1, "active");
    paint(i);
    s.vars = { i, k: kk, deque: idx.map((t) => vals[t]) };
    f.push(`Push index ${i} (value ${v}) at the back; the deque stays decreasing: ${idx.map((t) => vals[t]).join(" ≥ ")}.`, "push back");
    if (idx[0]! <= i - kk) {
      const j = idx.shift()!;
      syncDq();
      paint(i);
      s.vars = { i, k: kk, deque: idx.map((t) => vals[t]) };
      f.push(`Index ${j} (value ${vals[j]}) at the front has left the window [${i - kk + 1}, ${i}]: expire it from the front.`, "expire front");
    }
    if (i >= kk - 1) {
      const m = vals[idx[0]!]!;
      s.output!.values.push(m);
      s.output!.labels!.push(`[${i - kk + 1}..${i}]`);
      s.output!.tones = s.output!.values.map((_, t) => (t === s.output!.values.length - 1 ? "done" : undefined));
      syncDq();
      mark(dq, 0, "done");
      paint(i);
      s.vars = { i, k: kk, deque: idx.map((t) => vals[t]), max: m };
      f.push(`Window [${i - kk + 1}, ${i}] is complete: its max is the front of the deque, ${m}.`, "record");
    }
  }
  clearTones();
  seq.pointers = {};
  for (let j = 0; j < vals.length; j++) seqTones[j] = undefined;
  s.vars = { k: kk, result: s.output!.values };
  f.push(`Each index is pushed once and popped at most once, so the whole pass is O(n) rather than O(n·k). Result: [${s.output!.values.join(", ")}].`, "done");
  return f.done();
};

// ---- renderer ----

function ContainerView({ c }: { c: Container }) {
  if (c.kind === "stack") {
    return (
      <div className="flex flex-col items-center">
        <div className="mb-1 text-[11px] text-muted">{c.label}</div>
        <div className="relative flex min-h-[3rem] min-w-[3.75rem] flex-col-reverse gap-1 rounded-b-lg border-x-2 border-b-2 border-line px-1 pb-1 pt-1">
          {c.items.length === 0 && <div className="py-2 text-center text-[10px] text-muted">empty</div>}
          {c.items.map((v, i) => (
            <div key={i} className={cn("flex h-8 min-w-12 items-center justify-center gap-1 rounded-md border px-2 font-mono text-xs transition-colors", toneClass[c.tones?.[i] ?? "default"])}>
              <span>{v}</span>
              {c.sub?.[i] !== undefined && <span className="text-[9px] text-muted">{c.sub[i]}</span>}
            </div>
          ))}
        </div>
        <div className="mt-1 text-[10px] text-muted">{c.items.length ? "↑ top" : ""}</div>
      </div>
    );
  }
  const n = c.items.length;
  const pointers = n > 0 ? { front: 0, back: n - 1 } : {};
  return (
    <div className="flex flex-col items-start">
      <div className="mb-1 text-[11px] text-muted">{c.label}</div>
      {n === 0 ? <div className="rounded-md border border-dashed border-line px-3 py-2 text-[10px] text-muted">empty</div> : <Cells values={c.items} tones={c.tones} labels={c.sub ?? c.items.map(() => "")} pointers={pointers} size="sm" />}
    </div>
  );
}

function Renderer({ frame }: RendererProps<SQInput, SQState>) {
  const { state } = frame;
  return (
    <div className="flex flex-col items-start gap-3">
      {state.ops && state.ops.length > 0 && (
        <div className="flex max-w-full flex-wrap gap-1 font-mono text-[10px]">
          {state.ops.map((o, i) => (
            <span key={i} className={cn("rounded border px-1.5 py-0.5", i === state.opIndex ? "border-accent bg-accent/20 text-fg" : i < (state.opIndex ?? -1) ? "border-line text-muted opacity-60" : "border-line text-muted")}>
              {o}
            </span>
          ))}
        </div>
      )}
      {state.sequence && (
        <div>
          <div className="mb-1 text-[11px] text-muted">{state.sequence.label}</div>
          <Cells values={state.sequence.values} tones={state.sequence.tones} labels={state.sequence.labels} pointers={state.sequence.pointers} />
        </div>
      )}
      <div className="flex flex-wrap items-start gap-6">
        {state.containers.map((c) => (
          <ContainerView key={c.label} c={c} />
        ))}
      </div>
      {state.output && state.output.values.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] text-muted">{state.output.label}</div>
          <Cells values={state.output.values} tones={state.output.tones} labels={state.output.labels ?? state.output.values.map(() => "")} size="sm" />
        </div>
      )}
      <Vars vars={state.vars} />
      <Legend items={[{ tone: "active", label: "just pushed / window" }, { tone: "compare", label: "read / current" }, { tone: "done", label: "result" }, { tone: "danger", label: "error" }, { tone: "muted", label: "left the window" }]} />
    </div>
  );
}

const toOps = (v: unknown): Op[] | undefined => (Array.isArray(v) ? (v.slice(0, MAX_OPS) as Op[]) : undefined);

export const stackQueueFamily: Family<SQInput, SQState> = {
  name: "Stack & queue",
  description: "LIFO and FIFO containers, deques, and the classic problems built on them.",
  Renderer,
  algorithms: {
    "stack-ops": stackOps,
    "queue-ops": queueOps,
    "deque-ops": dequeOps,
    "balanced-parentheses": balancedParentheses,
    "queue-via-two-stacks": queueViaTwoStacks,
    "min-stack": minStack,
    "sliding-window-max": slidingWindowMax,
  },
  labels: {
    "stack-ops": "Stack: push and pop",
    "queue-ops": "Queue: enqueue and dequeue",
    "deque-ops": "Deque: both ends",
    "balanced-parentheses": "Balanced parentheses",
    "queue-via-two-stacks": "Queue from two stacks",
    "min-stack": "Min-stack",
    "sliding-window-max": "Sliding window maximum (monotonic deque)",
  },
  examples: {
    "stack-ops": { operations: [["push", 3], ["push", 7], ["push", 1], ["pop"], ["push", 9], ["pop"], ["pop"], ["pop"]] },
    "queue-ops": { operations: [["enqueue", 1], ["enqueue", 2], ["enqueue", 3], ["dequeue"], ["dequeue"], ["enqueue", 4], ["enqueue", 5], ["dequeue"]] },
    "deque-ops": { operations: [["pushBack", 2], ["pushBack", 3], ["pushFront", 1], ["popBack"], ["pushFront", 0], ["popFront"], ["popFront"]] },
    "balanced-parentheses": { input: "{[()]}(]" },
    "queue-via-two-stacks": { operations: [["enqueue", 1], ["enqueue", 2], ["enqueue", 3], ["dequeue"], ["enqueue", 4], ["dequeue"], ["dequeue"], ["dequeue"]] },
    "min-stack": { operations: [["push", 5], ["push", 3], ["push", 7], ["push", 3], ["getMin"], ["pop"], ["getMin"], ["pop"], ["pop"], ["getMin"]] },
    "sliding-window-max": { values: [1, 3, -1, -3, 5, 3, 6, 7], k: 3 },
  },
  normalise: (raw) => {
    const str = raw.input ?? raw.text ?? raw.s ?? raw.string ?? raw.expression;
    return {
      operations: toOps(raw.operations) ?? toOps(raw.ops),
      input: str === undefined || str === null ? undefined : String(str).slice(0, MAX_LEN),
      values: Array.isArray(raw.values) ? (raw.values as unknown[]).map(Number).filter((n) => Number.isFinite(n)).slice(0, MAX_LEN) : undefined,
      k: raw.k === undefined ? undefined : Number(raw.k),
      variant: raw.variant === "parallel" ? "parallel" : undefined,
    };
  },
};
