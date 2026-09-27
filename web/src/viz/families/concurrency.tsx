// Concurrency scenarios: threads on a tick-by-tick timeline (rows = threads,
// columns = ticks) sharing a counter, a lock, a queue or a set of forks. Every
// scenario is a short script over the `Conc` DSL; the renderer is shared and
// shows the timeline, the shared state, any queues, and (for deadlocks) the
// wait-for graph.
import { Arrow, Cells, Circle, Legend, Vars, toneClass, type Tone } from "../primitives";
import { Frames, type Family, type RendererProps } from "../engine";
import { cn } from "../../lib/utils";

export interface ConcurrencyInput {
  threads?: number;
  capacity?: number;
  permits?: number;
  tasks?: number;
  [k: string]: unknown;
}

/** What a thread is doing during one tick. */
export type Seg = "run" | "cs" | "blocked" | "wait" | "idle" | "done" | "stall";
export interface Cell {
  k: Seg;
  /** Short label drawn inside the cell (≤ 7 chars). */
  l?: string;
  /** Override tone (e.g. a lost write drawn in danger). */
  t?: Tone;
}
export interface ThreadRow {
  id: string;
  label: string;
  cells: Cell[];
  /** Per-thread private state, e.g. "r = 1" or "holds A". */
  state?: string;
}
export interface Queue {
  label: string;
  items: (string | number)[];
  capacity?: number;
  tones?: (Tone | undefined)[];
}
export interface WaitFor {
  nodes: { id: string; tone?: Tone; sub?: string }[];
  edges: { from: string; to: string; label?: string; tone?: Tone }[];
}

export interface ConcurrencyState {
  threads: ThreadRow[];
  tick: number;
  /** Shared memory readout: counter value, lock owner, cache-line state… */
  shared: Record<string, unknown>;
  queues: Queue[];
  waitFor?: WaitFor;
  /** Program output or event log (last few lines). */
  log: string[];
  vars: Record<string, unknown>;
}

export const segTone: Record<Seg, Tone> = { run: "active", cs: "path", blocked: "danger", wait: "compare", idle: "muted", done: "done", stall: "frontier" };

class Conc {
  s: ConcurrencyState;
  f: Frames<ConcurrencyState>;
  private finished = new Set<string>();
  constructor(threads: (string | { id: string; label?: string })[]) {
    this.s = {
      threads: threads.map((t) => (typeof t === "string" ? { id: t, label: t, cells: [] } : { id: t.id, label: t.label ?? t.id, cells: [] })),
      tick: 0,
      shared: {},
      queues: [],
      log: [],
      vars: {},
    };
    this.f = new Frames<ConcurrencyState>(() => ({
      threads: this.s.threads.map((t) => ({ ...t, cells: t.cells.map((c) => ({ ...c })) })),
      tick: this.s.tick,
      shared: { ...this.s.shared },
      queues: this.s.queues.map((q) => ({ ...q, items: [...q.items], tones: q.tones ? [...q.tones] : undefined })),
      waitFor: this.s.waitFor ? { nodes: this.s.waitFor.nodes.map((n) => ({ ...n })), edges: this.s.waitFor.edges.map((e) => ({ ...e })) } : undefined,
      log: [...this.s.log],
      vars: { ...this.s.vars },
    }));
  }
  ids(): string[] {
    return this.s.threads.map((t) => t.id);
  }
  thread(id: string): ThreadRow {
    const t = this.s.threads.find((x) => x.id === id);
    if (!t) throw new Error(`unknown thread ${id}`);
    return t;
  }
  /** Advance one tick: every thread gets a cell (idle unless given, done once finished). */
  tick(cells: Record<string, Seg | Cell | undefined>, note: string, tag?: string): void {
    for (const t of this.s.threads) {
      const c = cells[t.id] ?? (this.finished.has(t.id) ? "done" : "idle");
      t.cells.push(typeof c === "string" ? { k: c } : { ...c });
    }
    this.s.tick++;
    this.f.push(note, tag);
  }
  /** A frame without advancing time (intro, takeaway). */
  note(text: string, tag = "note"): void {
    this.f.push(text, tag);
  }
  state(id: string, text: string | undefined): void {
    this.thread(id).state = text;
  }
  finish(id: string): void {
    this.finished.add(id);
    this.thread(id).state = "done";
  }
  shared(obj: Record<string, unknown>): void {
    this.s.shared = { ...this.s.shared, ...obj };
  }
  queue(label: string, items: (string | number)[], capacity?: number, tones?: (Tone | undefined)[]): void {
    const q: Queue = { label, items: [...items], capacity, tones };
    const i = this.s.queues.findIndex((x) => x.label === label);
    if (i >= 0) this.s.queues[i] = q;
    else this.s.queues.push(q);
  }
  waitFor(w: WaitFor | undefined): void {
    this.s.waitFor = w;
  }
  log(line: string): void {
    this.s.log = [...this.s.log.slice(-5), line];
  }
  set(vars: Record<string, unknown>): void {
    this.s.vars = { ...this.s.vars, ...vars };
  }
}

type G = (input: ConcurrencyInput) => ReturnType<Frames<ConcurrencyState>["done"]>;

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};
const tids = (n: number, prefix = "T") => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// ---------- generic lock simulation (deadlock + dining philosophers) ----------

interface LockSpec {
  id: string;
  /** Locks needed, in the order the thread tries to take them. */
  needs: string[];
}

/**
 * Runs threads that each acquire a list of locks in order, hold them for
 * `work` ticks, then release everything. One frame per tick. Returns
 * "deadlock" when a tick passes with every live thread blocked.
 */
function runLockSim(c: Conc, specs: LockSpec[], opts: { verb: string; release: string; work: number; maxTicks: number; tag?: string }): "deadlock" | "ok" | "limit" {
  const owner = new Map<string, string>();
  const st = new Map(specs.map((s) => [s.id, { held: [] as string[], idx: 0, working: 0, done: false }]));
  const allLocks = [...new Set(specs.flatMap((s) => s.needs))];
  const readout = () => Object.fromEntries(allLocks.map((l) => [l, owner.get(l) ?? "free"]));
  for (let t = 0; t < opts.maxTicks; t++) {
    const events: string[] = [];
    const cells: Record<string, Cell> = {};
    const edges: WaitFor["edges"] = [];
    let progressed = false;
    for (const sp of specs) {
      const me = st.get(sp.id)!;
      if (me.done) continue;
      if (me.working > 0) {
        me.working--;
        if (me.working === 0) {
          for (const l of me.held) owner.delete(l);
          events.push(`${sp.id} ${opts.release} ${list(me.held)}`);
          me.held = [];
          me.done = true;
          c.finish(sp.id);
          cells[sp.id] = { k: "run", l: "release" };
          progressed = true;
        } else {
          cells[sp.id] = { k: "cs", l: opts.verb };
        }
        continue;
      }
      if (me.idx >= sp.needs.length) {
        me.working = opts.work;
        cells[sp.id] = { k: "cs", l: opts.verb };
        events.push(`${sp.id} holds ${list(me.held)} and ${opts.verb}s`);
        c.state(sp.id, `holds ${me.held.join(", ")} · ${opts.verb}ing`);
        progressed = true;
        continue;
      }
      const want = sp.needs[me.idx]!;
      const holder = owner.get(want);
      if (holder === undefined) {
        owner.set(want, sp.id);
        me.held.push(want);
        me.idx++;
        cells[sp.id] = { k: "run", l: `take ${want}` };
        events.push(`${sp.id} takes ${want}`);
        c.state(sp.id, `holds ${me.held.join(", ")}`);
        progressed = true;
      } else {
        cells[sp.id] = { k: "blocked", l: `want ${want}` };
        events.push(`${sp.id} wants ${want} but ${holder} holds it, so it blocks (still holding ${me.held.join(", ") || "nothing"})`);
        c.state(sp.id, `holds ${me.held.join(", ") || "–"} · waits ${want}`);
        edges.push({ from: sp.id, to: holder, label: want, tone: "compare" });
      }
    }
    c.shared(readout());
    const live = specs.filter((s) => !st.get(s.id)!.done);
    if (edges.length > 0) c.waitFor({ nodes: live.map((s) => ({ id: s.id, tone: edges.some((e) => e.from === s.id) ? "danger" : "active" })), edges });
    else c.waitFor(undefined);
    if (!progressed && live.length > 0) {
      // Every live thread is blocked: find the cycle in the wait-for graph.
      const next = new Map(edges.map((e) => [e.from, e.to]));
      const seen: string[] = [];
      let cur: string | undefined = live[0]!.id;
      while (cur && !seen.includes(cur)) {
        seen.push(cur);
        cur = next.get(cur);
      }
      const cycle = cur ? [...seen.slice(seen.indexOf(cur)), cur] : seen;
      c.waitFor({ nodes: live.map((s) => ({ id: s.id, tone: "danger" })), edges: edges.map((e) => ({ ...e, tone: "danger" })) });
      c.tick(cells, `Nobody can move: ${events.join("; ")}. The wait-for graph has a cycle ${cycle.join(" → ")}, so this is a deadlock — each thread waits for a lock that only a waiting thread can release.`, "deadlock");
      return "deadlock";
    }
    c.tick(cells, `${events.join("; ")}.`, opts.tag);
    if (live.length === 0) return "ok";
    if (c.f.full) return "limit";
  }
  return "limit";
}

// ---------- scenarios ----------

const raceCondition: G = ({ threads }) => {
  const n = clampInt(threads, 2, 4, 2);
  const ids = tids(n);
  const c = new Conc(ids);
  let counter = 0;
  c.shared({ counter });
  c.set({ threads: n });
  c.note(`${n} threads each run counter++ on one shared counter. The compiler turns counter++ into three instructions — load, add 1, store — and the scheduler may switch threads between any two of them.`);
  const t1 = ids[0]!;
  c.state(t1, "r = 0");
  c.tick({ [t1]: { k: "run", l: "load" } }, `${t1} loads counter (0) into a private register r.`, "load");
  c.state(t1, "r = 1");
  c.tick({ [t1]: { k: "run", l: "add" } }, `${t1} adds 1 in its register: r = 1. The shared counter is still 0.`, "add");
  counter = 1;
  c.shared({ counter });
  c.state(t1, "stored 1");
  c.tick({ [t1]: { k: "run", l: "store" } }, `${t1} stores r: counter = 1. Run without interruption, the increment is correct.`, "store");
  c.note(`Now all ${n} threads run counter++ at the same time and the scheduler interleaves their loads before any store happens.`);
  const loads: Record<string, Cell> = {};
  for (const id of ids) {
    loads[id] = { k: "run", l: "load" };
    c.state(id, `r = ${counter}`);
  }
  c.tick(loads, `All ${n} threads load counter = ${counter} before anyone stores: every register holds ${counter}.`, "load");
  const adds: Record<string, Cell> = {};
  for (const id of ids) {
    adds[id] = { k: "run", l: "add" };
    c.state(id, `r = ${counter + 1}`);
  }
  c.tick(adds, `Each thread adds 1 to its own copy: every register now holds ${counter + 1}.`, "add");
  const want = counter + 1;
  for (let i = 0; i < n; i++) {
    const id = ids[i]!;
    counter = want;
    c.shared({ counter });
    c.state(id, `stored ${want}`);
    if (i === 0) c.tick({ [id]: { k: "run", l: "store" } }, `${id} stores ${want}: counter = ${want}.`, "store");
    else {
      c.tick({ [id]: { k: "run", l: "store", t: "danger" } }, `${id} stores ${want} as well: counter stays ${want}. ${ids[i - 1]}'s increment is overwritten — a lost update.`, "lost");
    }
  }
  c.set({ expected: n + 1, actual: counter, lost: n + 1 - counter });
  c.note(`Expected ${n + 1}, got ${counter}: ${n} increment${n > 1 ? "s" : ""} raced and ${n - 1} ${n - 1 === 1 ? "was" : "were"} lost. The result depends on timing, so it may pass every test and fail in production; fix it with a mutex or an atomic fetch-and-add.`, "done");
  return c.f.done();
};

const mutex: G = ({ threads }) => {
  const n = clampInt(threads, 2, 4, 2);
  const ids = tids(n);
  const c = new Conc(ids);
  let counter = 0;
  c.shared({ counter, lock: "free", waiting: "–" });
  c.note(`The same counter++ but wrapped in lock(); load; add; store; unlock(). Only the thread holding the mutex may touch the counter, so the three instructions become one indivisible unit.`);
  for (let i = 0; i < n; i++) {
    const me = ids[i]!;
    const others = ids.slice(i + 1);
    const blocked = (): Record<string, Cell> => Object.fromEntries(others.map((o) => [o, { k: "blocked", l: "lock()" } as Cell]));
    c.shared({ lock: me, waiting: others.join(", ") || "–" });
    for (const o of others) c.state(o, "blocked on lock");
    c.state(me, "owns lock");
    c.tick({ ...blocked(), [me]: { k: "run", l: "lock()" } }, i === 0 ? `${me} acquires the mutex. ${list(others)} also call lock() and block: the kernel parks them until the mutex is free.` : `unlock() woke ${me}, which acquires the mutex${others.length ? `; ${list(others)} keep waiting` : ""}.`, "lock");
    c.state(me, `r = ${counter}`);
    c.tick({ ...blocked(), [me]: { k: "cs", l: "load" } }, `${me} loads counter = ${counter}. Nobody else can load a stale value meanwhile.`, "load");
    c.state(me, `r = ${counter + 1}`);
    c.tick({ ...blocked(), [me]: { k: "cs", l: "add" } }, `${me} adds 1: r = ${counter + 1}.`, "add");
    counter++;
    c.shared({ counter });
    c.state(me, `stored ${counter}`);
    c.tick({ ...blocked(), [me]: { k: "cs", l: "store" } }, `${me} stores ${counter}: counter = ${counter}.`, "store");
    c.shared({ lock: "free" });
    c.finish(me);
    c.tick({ ...blocked(), [me]: { k: "run", l: "unlock" } }, `${me} releases the mutex${others.length ? ` and the kernel wakes ${others[0]}` : ""}. The critical section ran as one atomic unit.`, "unlock");
    if (c.f.full) break;
  }
  c.shared({ waiting: "–" });
  c.set({ counter, "critical-section ticks": 3 * n, "parallelism inside lock": "none" });
  c.note(`counter = ${n}: every increment survived because load–add–store never interleaved. The price is serialisation — the ${n} threads spent ${3 * n} ticks in single file — which is why lock-held sections should be as short as possible.`, "done");
  return c.f.done();
};

const deadlock: G = ({ threads }) => {
  const n = clampInt(threads, 2, 4, 2);
  const ids = tids(n);
  const locks = ["A", "B", "C", "D"].slice(0, n);
  const c = new Conc(ids);
  c.set({ threads: n, locks: locks.join(", ") });
  c.note(`${n} threads, ${n} locks. ${ids.map((id, i) => `${id} takes ${locks[i]} then ${locks[(i + 1) % n]}`).join("; ")}. Each thread takes its locks in a different order — that is the trap.`);
  const specs = ids.map((id, i) => ({ id, needs: [locks[i]!, locks[(i + 1) % n]!] }));
  runLockSim(c, specs, { verb: "work", release: "releases", work: 1, maxTicks: 12, tag: "lock" });
  c.note(`All four Coffman conditions hold: mutual exclusion (a lock has one owner), hold-and-wait (each thread keeps ${locks[0]}-style locks while waiting), no preemption (locks cannot be taken away), and circular wait (the cycle above). Break any one and deadlock is impossible.`, "analysis");
  c.note(`Fix: break circular wait with a global lock order — every thread takes the alphabetically smaller lock first. Replaying with that rule:`, "fix");
  const ordered = ids.map((id, i) => ({ id, needs: [locks[i]!, locks[(i + 1) % n]!].sort() }));
  const res = runLockSim(c, ordered, { verb: "work", release: "releases", work: 1, maxTicks: 30, tag: "ordered" });
  c.note(res === "ok" ? `Every thread finished: with a total order on locks no cycle can form, because a thread waiting for lock X only ever holds locks smaller than X. Other options: try-lock with backoff, or a single coarse lock.` : `Lock ordering removes the cycle; the simulation stopped at the tick limit.`, "done");
  return c.f.done();
};

const producerConsumer: G = ({ threads, capacity }) => {
  const n = clampInt(threads, 2, 4, 2);
  const cap = clampInt(capacity, 1, 5, 3);
  const P = Math.ceil(n / 2);
  const C = n - P;
  const prods = tids(P, "P");
  const cons = tids(C, "C");
  const c = new Conc([...prods, ...cons]);
  const buffer: number[] = [];
  let nextItem = 1;
  let putsBlocked = 0;
  let takesBlocked = 0;
  const syncQ = () => c.queue(`bounded buffer (capacity ${cap})`, buffer, cap);
  syncQ();
  c.shared({ count: 0, "not_full waiters": "–", "not_empty waiters": "–" });
  c.note(`${P} producer${P > 1 ? "s" : ""} put items into a bounded buffer of capacity ${cap}; ${C} consumer${C > 1 ? "s" : ""} take them. put() must wait while the buffer is full and take() while it is empty — two condition variables, not_full and not_empty, guarded by one mutex.`);
  const blockedP = new Set<string>();
  const blockedC = new Set<string>();
  const phaseA = cap + 1;
  const phaseB = phaseA + cap + 2;
  for (let t = 0; t < phaseB + 3 && !c.f.full; t++) {
    const actP = t < phaseA || t >= phaseB;
    const actC = t >= phaseA;
    const events: string[] = [];
    const cells: Record<string, Cell> = {};
    for (const p of prods) {
      if (!(actP || blockedP.has(p))) continue;
      if (buffer.length < cap) {
        const item = nextItem++;
        buffer.push(item);
        cells[p] = { k: "run", l: `put ${item}` };
        events.push(`${blockedP.has(p) ? `${p} wakes (not_full signalled) and ` : `${p} `}puts item ${item} (${buffer.length}/${cap})`);
        blockedP.delete(p);
        c.state(p, `produced ${item}`);
      } else {
        if (!blockedP.has(p)) {
          events.push(`${p} finds the buffer full and waits on not_full`);
          putsBlocked++;
        }
        blockedP.add(p);
        cells[p] = { k: "wait", l: "full" };
        c.state(p, "waiting: full");
      }
    }
    for (const q of cons) {
      if (!(actC || blockedC.has(q))) continue;
      if (buffer.length > 0) {
        const item = buffer.shift()!;
        cells[q] = { k: "run", l: `take ${item}` };
        events.push(`${blockedC.has(q) ? `${q} wakes (not_empty signalled) and ` : `${q} `}takes item ${item} (${buffer.length}/${cap})`);
        blockedC.delete(q);
        c.state(q, `consumed ${item}`);
      } else {
        if (!blockedC.has(q)) {
          events.push(`${q} finds the buffer empty and waits on not_empty`);
          takesBlocked++;
        }
        blockedC.add(q);
        cells[q] = { k: "wait", l: "empty" };
        c.state(q, "waiting: empty");
      }
    }
    syncQ();
    c.shared({ count: buffer.length, "not_full waiters": [...blockedP].join(", ") || "–", "not_empty waiters": [...blockedC].join(", ") || "–" });
    if (events.length === 0) events.push(t < phaseA ? `consumers are busy elsewhere; producers keep filling` : `producers are busy elsewhere; consumers drain`);
    c.tick(cells, `${events.join("; ")}.`, t < phaseA ? "fill" : t < phaseB ? "drain" : "steady");
  }
  c.set({ "put() blocked": putsBlocked, "take() blocked": takesBlocked, capacity: cap });
  c.note(`The buffer decouples the two sides: producers never wait unless the buffer is full, consumers never spin on an empty buffer, and the capacity bounds memory (backpressure). This pattern is every work queue, pipe and channel you will use.`, "done");
  return c.f.done();
};

const readersWriters: G = ({ threads }) => {
  const n = clampInt(threads, 2, 6, 4);
  const writerIdx = Math.min(2, n - 1);
  const ids: string[] = [];
  let r = 1;
  for (let i = 0; i < n; i++) ids.push(i === writerIdx ? "W1" : `R${r++}`);
  const early = ids.slice(0, writerIdx);
  const late = ids.slice(writerIdx + 1);
  const c = new Conc(ids);
  let readers = 0;
  c.shared({ readers: 0, writer: "none", "waiting writers": 0, "waiting readers": "–" });
  c.note(`A read–write lock: any number of readers may hold it together, but a writer needs it exclusively. ${early.length} reader${early.length !== 1 ? "s" : ""} arrive first, then a writer, then ${late.length} more reader${late.length !== 1 ? "s" : ""}.`);
  const holding = new Set<string>();
  const reading = (): Record<string, Cell> => Object.fromEntries([...holding].map((id) => [id, { k: "cs", l: "read" } as Cell]));
  for (const id of early) {
    holding.add(id);
    readers++;
    c.shared({ readers });
    c.state(id, "reading");
    c.tick({ ...reading(), [id]: { k: "run", l: "rlock" } }, readers === 1 ? `${id} takes the read lock: readers = 1.` : `${id} also takes the read lock: readers = ${readers}. Readers never exclude each other.`, "read-lock");
  }
  c.shared({ "waiting writers": 1 });
  c.state("W1", "waiting: readers > 0");
  c.tick({ ...reading(), W1: { k: "blocked", l: "wlock" } }, early.length ? `W1 calls write-lock but readers = ${readers}, so it blocks and registers as a waiting writer.` : `W1 calls write-lock: nobody holds the lock, so it proceeds.`, "write-wait");
  for (const id of late) c.state(id, "waiting: writer queued");
  const lateWait = (): Record<string, Cell> => Object.fromEntries(late.map((id) => [id, { k: "wait", l: "rlock" } as Cell]));
  if (late.length && early.length) {
    c.shared({ "waiting readers": late.join(", ") });
    c.tick({ ...reading(), W1: { k: "blocked", l: "wlock" }, ...lateWait() }, `${list(late)} arrive${late.length === 1 ? "s" : ""} wanting to read. With writer preference they queue behind W1 even though readers are active — otherwise a steady stream of readers would starve the writer forever.`, "read-wait");
  }
  for (const id of early) {
    holding.delete(id);
    readers--;
    c.shared({ readers });
    c.finish(id);
    c.tick({ ...reading(), [id]: { k: "run", l: "unlock" }, W1: { k: "blocked", l: "wlock" }, ...lateWait() }, readers > 0 ? `${id} releases: readers = ${readers}; W1 still waits for the last reader.` : `${id} releases: readers = 0, so the lock is handed to W1.`, "read-unlock");
  }
  c.shared({ writer: "W1", "waiting writers": 0 });
  c.state("W1", "writing (exclusive)");
  c.tick({ W1: { k: "cs", l: "write" }, ...lateWait() }, `W1 holds the lock exclusively and writes. No reader can observe a half-written state.`, "write");
  c.shared({ writer: "none", "waiting readers": "–" });
  c.finish("W1");
  for (const id of late) {
    holding.add(id);
    c.state(id, "reading");
  }
  readers = late.length;
  c.shared({ readers });
  c.tick({ W1: { k: "run", l: "unlock" }, ...Object.fromEntries(late.map((id) => [id, { k: "run", l: "rlock" } as Cell])) }, late.length ? `W1 releases; all ${late.length} waiting reader${late.length > 1 ? "s" : ""} wake at once and read in parallel (readers = ${late.length}).` : `W1 releases the lock.`, "write-unlock");
  if (late.length) {
    for (const id of late) c.finish(id);
    readers = 0;
    c.shared({ readers });
    c.tick(Object.fromEntries(late.map((id) => [id, { k: "run", l: "unlock" } as Cell])), `${list(late)} finish and release: readers = 0.`, "read-unlock");
  }
  c.set({ "readers ran in parallel": early.length + late.length, "writes serialised": 1 });
  c.note(`Reads share, writes exclude. Choose reader- or writer-preference deliberately: reader-preference starves writers under constant read load; writer-preference makes reads bursty. RCU and seqlocks go further and never block readers at all.`, "done");
  return c.f.done();
};

const semaphore: G = ({ threads, permits, k, slots }) => {
  const n = clampInt(threads, 2, 6, 4);
  const permitsIn = permits ?? k ?? slots;
  const total = clampInt(permitsIn, 1, Math.max(1, n - 1), Math.min(2, n - 1));
  const ids = tids(n);
  const c = new Conc(ids);
  const HOLD = 2;
  let free = total;
  const holders = new Map<string, number>();
  const waitq: string[] = [];
  const done = new Set<string>();
  c.shared({ permits: free, holders: "–" });
  c.queue("wait queue (FIFO)", []);
  c.note(`A counting semaphore with ${total} permit${total > 1 ? "s" : ""} guards a pool of ${total} resources (think database connections). acquire() decrements the count or blocks at 0; release() increments and wakes one waiter. Each of the ${n} threads needs a resource for ${HOLD} ticks.`);
  for (let t = 0; t < 40 && done.size < n && !c.f.full; t++) {
    const events: string[] = [];
    const cells: Record<string, Cell> = {};
    for (const id of ids) {
      const left = holders.get(id);
      if (left === undefined) continue;
      if (left <= 1) {
        holders.delete(id);
        free++;
        done.add(id);
        c.finish(id);
        cells[id] = { k: "run", l: "V()" };
        events.push(`${id} releases (permits ${free - 1} → ${free})`);
      } else {
        holders.set(id, left - 1);
        cells[id] = { k: "cs", l: "use" };
      }
    }
    const candidates = [...waitq, ...ids.filter((id) => !holders.has(id) && !done.has(id) && !waitq.includes(id))];
    for (const id of candidates) {
      if (holders.has(id) || done.has(id)) continue;
      if (free > 0) {
        free--;
        holders.set(id, HOLD);
        const wasWaiting = waitq.includes(id);
        if (wasWaiting) waitq.splice(waitq.indexOf(id), 1);
        cells[id] = { k: "run", l: "P()" };
        c.state(id, "holds a permit");
        events.push(`${wasWaiting ? `${id} is woken and ` : `${id} `}acquires (permits → ${free})`);
      } else {
        if (!waitq.includes(id)) {
          waitq.push(id);
          events.push(`${id} finds 0 permits and blocks`);
        }
        cells[id] = { k: "blocked", l: "P()" };
        c.state(id, "blocked: 0 permits");
      }
    }
    c.shared({ permits: free, holders: [...holders.keys()].join(", ") || "–" });
    c.queue("wait queue (FIFO)", waitq);
    c.tick(cells, `${events.join("; ") || "everyone is using a resource"}.`, "tick");
  }
  c.set({ permits: total, threads: n, "max concurrent": total, "ticks": c.s.tick });
  c.note(`At most ${total} threads were ever inside at once; the rest queued in FIFO order. A mutex is a semaphore with one permit plus ownership (only the locker may unlock). Use semaphores for bounded resources and bounded parallelism, not for mutual exclusion.`, "done");
  return c.f.done();
};

const conditionVariable: G = ({ threads }) => {
  const n = clampInt(threads, 2, 4, 2);
  const consumers = tids(n - 1, "C");
  const c = new Conc([...consumers, "P"]);
  const queue: number[] = [];
  const waiters: string[] = [];
  c.shared({ mutex: "free", "cv waiters": "–" });
  c.queue("queue", queue);
  c.note(`Consumers want an item but the queue is empty. Busy-polling would burn CPU; a condition variable lets a thread sleep until the predicate (queue non-empty) may have changed. Rule: check the predicate in a while loop, under the mutex.`);
  const waitCells = (): Record<string, Cell> => Object.fromEntries(waiters.map((w) => [w, { k: "wait", l: "wait" } as Cell]));
  for (const cid of consumers) {
    c.shared({ mutex: cid });
    c.state(cid, "owns mutex");
    c.tick({ ...waitCells(), [cid]: { k: "run", l: "lock" } }, `${cid} locks the mutex and checks the predicate: the queue is empty.`, "lock");
    waiters.push(cid);
    c.shared({ mutex: "free", "cv waiters": waiters.join(", ") });
    c.state(cid, "asleep on cv");
    c.tick({ ...waitCells() }, `${cid} calls cv.wait(mutex): atomically releases the mutex and goes to sleep. Atomicity matters — if the release and the sleep were separate, a signal in between would be lost.`, "wait");
  }
  c.shared({ mutex: "P" });
  c.state("P", "owns mutex");
  c.tick({ ...waitCells(), P: { k: "run", l: "lock" } }, `The producer locks the mutex (free, because the waiters released it).`, "lock");
  queue.push(42);
  c.queue("queue", queue);
  c.tick({ ...waitCells(), P: { k: "cs", l: "push" } }, `P pushes item 42 under the mutex.`, "push");
  const woken = waiters.shift()!;
  c.shared({ "cv waiters": waiters.join(", ") || "–" });
  c.state(woken, "woken; needs mutex");
  c.tick({ ...waitCells(), [woken]: { k: "blocked", l: "reacq" }, P: { k: "run", l: "signal" } }, `P calls cv.notify_one(): ${woken} is moved from the cv's wait list to the mutex's wait list — it cannot run yet because P still holds the mutex.${waiters.length ? ` ${list(waiters)} keep sleeping (notify_all would wake everyone).` : ""}`, "signal");
  c.shared({ mutex: "free" });
  c.finish("P");
  c.tick({ ...waitCells(), [woken]: { k: "blocked", l: "reacq" }, P: { k: "run", l: "unlock" } }, `P unlocks; the mutex is handed to ${woken}.`, "unlock");
  c.shared({ mutex: woken });
  c.state(woken, "owns mutex");
  c.tick({ ...waitCells(), [woken]: { k: "run", l: "check" } }, `${woken} returns from wait() holding the mutex and re-checks the predicate in its while loop: the queue has 1 item, so it proceeds. (Spurious wakeups and a faster consumer stealing the item are why the check is a loop, not an if.)`, "recheck");
  queue.shift();
  c.queue("queue", queue);
  c.tick({ ...waitCells(), [woken]: { k: "cs", l: "pop" } }, `${woken} pops 42.`, "pop");
  c.shared({ mutex: "free" });
  c.finish(woken);
  c.tick({ ...waitCells(), [woken]: { k: "run", l: "unlock" } }, `${woken} unlocks and continues with the item.${waiters.length ? ` ${list(waiters)} still sleep until the next notify.` : ""}`, "unlock");
  c.set({ pattern: "lock; while(!pred) cv.wait(lock); …; unlock", "signal side": "lock; change state; notify; unlock" });
  c.note(`A condition variable is not the condition — it is a wait list attached to a mutex. State lives in the predicate; the cv only says "something may have changed, look again".`, "done");
  return c.f.done();
};

const eventLoop: G = () => {
  const c = new Conc([{ id: "js", label: "JS thread" }, { id: "timer", label: "timer (host)" }, { id: "net", label: "network (host)" }]);
  const micro: string[] = [];
  const macro: string[] = [];
  const stack: string[] = [];
  const sync = () => {
    c.queue("call stack", stack);
    c.queue("microtask queue", micro);
    c.queue("macrotask queue", macro);
  };
  sync();
  c.note(`Program: log("A"); setTimeout(cb, 0); fetch(url).then(onResponse); Promise.resolve().then(m); log("B"). One JS thread runs everything; the host provides timers and I/O on other threads and posts callbacks back through queues.`);
  stack.push("script", "log");
  sync();
  c.log(`> A`);
  c.tick({ js: { k: "run", l: "log A" } }, `The script starts on the call stack; console.log("A") runs synchronously.`, "sync");
  stack.pop();
  stack.push("setTimeout");
  sync();
  c.tick({ js: { k: "run", l: "setTmo" }, timer: { k: "cs", l: "0 ms" } }, `setTimeout(cb, 0) hands a timer to the host and returns immediately. cb is not queued yet — the timer must expire first, and even "0 ms" means "after the current script".`, "sync");
  stack.pop();
  stack.push("fetch");
  sync();
  c.tick({ js: { k: "run", l: "fetch" }, timer: { k: "cs", l: "0 ms" }, net: { k: "cs", l: "GET" } }, `fetch() starts a request on the host's network thread and returns a pending promise. The JS thread never blocks waiting for the socket.`, "sync");
  stack.pop();
  stack.push(".then");
  micro.push("m");
  sync();
  c.tick({ js: { k: "run", l: ".then" }, net: { k: "cs", l: "GET" } }, `Promise.resolve().then(m): the promise is already settled, so m is queued as a microtask. Meanwhile the timer expired: cb is queued as a macrotask.`, "sync");
  macro.push("cb");
  stack.pop();
  stack.push("log");
  c.log(`> B`);
  sync();
  c.tick({ js: { k: "run", l: "log B" }, net: { k: "cs", l: "GET" } }, `console.log("B") runs. Nothing queued has run yet because the script is still on the stack.`, "sync");
  stack.length = 0;
  sync();
  c.tick({ js: { k: "idle" }, net: { k: "cs", l: "GET" } }, `The script finishes and the stack is empty. Now the event loop looks at its queues: microtasks first, always.`, "loop");
  micro.shift();
  stack.push("m");
  c.log(`> C`);
  sync();
  c.tick({ js: { k: "run", l: "m" }, net: { k: "cs", l: "GET" } }, `Drain the microtask queue: m runs and logs "C". Any microtasks m queues would run now too, before any macrotask.`, "microtask");
  macro.shift();
  stack.length = 0;
  stack.push("cb");
  c.log(`> D`);
  sync();
  c.tick({ js: { k: "run", l: "cb" }, net: { k: "cs", l: "GET" } }, `Take one macrotask: cb runs and logs "D". After each macrotask the loop drains microtasks again.`, "macrotask");
  stack.length = 0;
  macro.push("onResponse");
  sync();
  c.tick({ js: { k: "idle" }, net: { k: "run", l: "done" } }, `The response arrives on the network thread; onResponse is queued (as a promise reaction it will go through the microtask queue once the promise resolves). The JS thread was idle, not blocked.`, "io");
  macro.shift();
  stack.push("onResponse");
  c.log(`> E`);
  sync();
  c.tick({ js: { k: "run", l: "onResp" } }, `onResponse runs and logs "E".`, "macrotask");
  stack.length = 0;
  sync();
  c.set({ output: "A B C D E", rule: "sync → all microtasks → one macrotask → repeat" });
  c.note(`Output order: A B C D E. Because one thread runs every callback, a 200 ms synchronous loop delays every timer, click and response by 200 ms — move CPU work to a Worker, and never block on I/O.`, "done");
  return c.f.done();
};

const threadPool: G = ({ threads, tasks }) => {
  const workers = clampInt(threads, 1, 6, 3);
  const nTasks = clampInt(tasks, 1, 10, 6);
  const durations = [3, 1, 2, 2, 1, 3, 2, 1, 2, 1];
  const ids = tids(workers, "W");
  const c = new Conc(ids);
  const queue = Array.from({ length: nTasks }, (_, i) => ({ id: `t${i + 1}`, d: durations[i % durations.length]! }));
  const serial = queue.reduce((a, t) => a + t.d, 0);
  const running = new Map<string, { id: string; left: number }>();
  let doneCount = 0;
  const syncQ = () => c.queue("task queue", queue.map((t) => `${t.id}(${t.d})`));
  syncQ();
  c.shared({ "tasks done": 0, idle: ids.join(", ") });
  c.note(`${nTasks} tasks (durations in ticks shown in brackets) are submitted to a pool of ${workers} worker thread${workers > 1 ? "s" : ""}. Creating a thread per task would cost ~50 µs and a stack each; the pool reuses ${workers} threads and bounds concurrency.`);
  for (let t = 0; t < 40 && doneCount < nTasks && !c.f.full; t++) {
    const events: string[] = [];
    const cells: Record<string, Cell> = {};
    for (const w of ids) {
      const r = running.get(w);
      if (!r) continue;
      r.left--;
      if (r.left === 0) {
        running.delete(w);
        doneCount++;
        events.push(`${w} finishes ${r.id}`);
        c.state(w, "idle");
      }
    }
    for (const w of ids) {
      if (running.has(w)) {
        cells[w] = { k: "cs", l: running.get(w)!.id };
        continue;
      }
      const next = queue.shift();
      if (next) {
        running.set(w, { id: next.id, left: next.d });
        cells[w] = { k: "run", l: next.id };
        events.push(`${w} takes ${next.id} (${next.d} tick${next.d > 1 ? "s" : ""})`);
        c.state(w, `running ${next.id}`);
      } else {
        cells[w] = { k: "idle" };
      }
    }
    syncQ();
    c.shared({ "tasks done": doneCount, idle: ids.filter((w) => !running.has(w)).join(", ") || "–" });
    if (events.length === 0) events.push("all workers busy; the queue waits");
    c.tick(cells, `${events.join("; ")}.`, "tick");
  }
  const makespan = c.s.tick;
  c.set({ workers, tasks: nTasks, "serial time": serial, makespan, utilisation: `${Math.round((serial / (workers * makespan)) * 100)}%` });
  c.note(`All ${nTasks} tasks done in ${makespan} ticks versus ${serial} serially (${workers} workers, ${Math.round((serial / (workers * makespan)) * 100)}% busy). Size the pool to the bottleneck: ≈ cores for CPU-bound work, more for I/O-bound; give the queue a bound so a burst turns into backpressure instead of out-of-memory.`, "done");
  return c.f.done();
};

const channels: G = () => {
  const c = new Conc([{ id: "S", label: "sender" }, { id: "R", label: "receiver" }]);
  const buf: number[] = [];
  c.shared({ channel: "unbuffered", "receiver ready": "no" });
  c.note(`Go-style channels. Phase 1: an unbuffered channel, where a send completes only when a receiver takes the value. Phase 2: a buffered channel of capacity 2.`);
  c.state("S", "blocked in ch <- 1");
  c.tick({ S: { k: "blocked", l: "send 1" } }, `S executes ch <- 1. No receiver is waiting, so S blocks: an unbuffered send is a rendezvous, not a drop-off.`, "send");
  c.shared({ "receiver ready": "yes", "last handoff": 1 });
  c.state("S", "sent 1");
  c.state("R", "got 1");
  c.tick({ S: { k: "run", l: "send 1" }, R: { k: "run", l: "<-ch" } }, `R executes <-ch: the value 1 is handed straight from S to R and both continue. The handoff is a synchronisation point — everything S did before the send happens-before everything R does after the receive.`, "rendezvous");
  c.state("S", "blocked in ch <- 2");
  c.state("R", "processing 1");
  c.shared({ "receiver ready": "no" });
  c.tick({ S: { k: "blocked", l: "send 2" }, R: { k: "cs", l: "work 1" } }, `R is busy processing 1, so S blocks again on ch <- 2. A slow receiver throttles the sender automatically: backpressure for free.`, "send");
  c.shared({ "receiver ready": "yes", "last handoff": 2 });
  c.state("S", "sent 2");
  c.state("R", "got 2");
  c.tick({ S: { k: "run", l: "send 2" }, R: { k: "run", l: "<-ch" } }, `R receives 2. Two sends, two blocking waits: the sender ran exactly at the receiver's pace.`, "rendezvous");
  c.shared({ channel: "buffered (cap 2)", "receiver ready": "no" });
  c.queue("channel buffer (cap 2)", buf, 2);
  c.note(`Phase 2: ch := make(chan int, 2). Sends succeed without a receiver while the buffer has room.`);
  buf.push(3);
  c.queue("channel buffer (cap 2)", buf, 2);
  c.state("S", "sent 3 (buffered)");
  c.state("R", "processing 2");
  c.tick({ S: { k: "run", l: "send 3" }, R: { k: "cs", l: "work 2" } }, `S sends 3: it goes into the buffer (1/2) and S returns immediately even though R is busy.`, "send");
  buf.push(4);
  c.queue("channel buffer (cap 2)", buf, 2);
  c.state("S", "sent 4 (buffered)");
  c.tick({ S: { k: "run", l: "send 4" }, R: { k: "cs", l: "work 2" } }, `S sends 4: buffer 2/2, now full.`, "send");
  c.state("S", "blocked: buffer full");
  c.tick({ S: { k: "blocked", l: "send 5" }, R: { k: "cs", l: "work 2" } }, `S tries to send 5 and blocks: a buffered channel only delays backpressure by its capacity, it does not remove it.`, "send");
  buf.shift();
  buf.push(5);
  c.queue("channel buffer (cap 2)", buf, 2);
  c.state("S", "sent 5");
  c.state("R", "got 3");
  c.tick({ S: { k: "run", l: "send 5" }, R: { k: "run", l: "<-ch" } }, `R receives 3, freeing a slot; S's pending send of 5 completes into the buffer (now [4, 5]).`, "receive");
  c.finish("S");
  c.shared({ channel: "closed by sender" });
  c.tick({ S: { k: "run", l: "close" }, R: { k: "run", l: "<-ch" } }, `S closes the channel. R can still drain 4 and 5; the next receive returns the zero value with ok = false, so range loops end cleanly.`, "close");
  c.set({ unbuffered: "handoff + synchronisation", buffered: "decouples up to cap, then blocks", select: "wait on several channels at once" });
  c.note(`Rule of thumb: unbuffered for handing work over with a happens-before guarantee, small buffers for smoothing bursts, and never an unbounded queue — the bound is what makes overload visible.`, "done");
  return c.f.done();
};

const casLoop: G = ({ threads }) => {
  const n = clampInt(threads, 2, 4, 2);
  const ids = tids(n);
  const c = new Conc(ids);
  let counter = 0;
  let attempts = 0;
  let failures = 0;
  const expected = new Map<string, number>();
  c.shared({ counter });
  c.note(`Lock-free increment: each thread does { old = load(counter); } while (!CAS(counter, old, old + 1)). CAS (compare-and-swap) is one atomic instruction: "if counter still equals old, set it to old + 1 and return true; otherwise return false".`);
  const reads: Record<string, Cell> = {};
  for (const id of ids) {
    expected.set(id, counter);
    reads[id] = { k: "run", l: "load" };
    c.state(id, `old = ${counter}`);
  }
  c.tick(reads, `All ${n} threads load counter = 0 and compute 0 + 1 = 1. So far identical to the race.`, "load");
  const pending = [...ids];
  while (pending.length && !c.f.full) {
    const id = pending.shift()!;
    const old = expected.get(id)!;
    attempts++;
    if (old === counter) {
      counter++;
      c.shared({ counter });
      c.finish(id);
      c.tick({ [id]: { k: "cs", l: `CAS ok` } }, `${id}: CAS(expected ${old}, new ${old + 1}) — counter is still ${old}, so the swap happens atomically: counter = ${counter}.`, "cas-ok");
    } else {
      failures++;
      c.state(id, `CAS failed (saw ${counter})`);
      c.tick({ [id]: { k: "stall", l: "CAS ✗" } }, `${id}: CAS(expected ${old}, new ${old + 1}) fails — counter is ${counter}, not ${old}. Nothing was lost: the stale update was rejected instead of overwriting.`, "cas-fail");
      expected.set(id, counter);
      c.state(id, `old = ${counter}`);
      c.tick({ [id]: { k: "run", l: "reload" } }, `${id} reloads counter = ${counter} and retries with new = ${counter + 1}. No lock was ever held, so no thread can block the others.`, "retry");
      pending.push(id);
    }
  }
  c.set({ counter, increments: n, "CAS attempts": attempts, "CAS failures": failures });
  c.note(`counter = ${counter}: correct without a lock. Guarantee: at least one CAS succeeds per round, so the system always progresses (lock-free), but a particular thread may retry many times (not wait-free) — ${attempts} attempts for ${n} increments here. Hardware fetch_add does the whole increment in one instruction; CAS loops are for updates that are not a single add.`, "done");
  return c.f.done();
};

const falseSharing: G = () => {
  const c = new Conc([{ id: "c0", label: "core 0 (a++)" }, { id: "c1", label: "core 1 (b++)" }]);
  let invalidations = 0;
  let writes0 = 0;
  let writes1 = 0;
  c.shared({ layout: "a and b in the same 64-byte line", "core 0 copy": "Invalid", "core 1 copy": "Invalid", invalidations: 0 });
  c.queue("cache line 0x1040", ["a", "b", "…", "…", "…", "…", "…", "…"], 8, ["active", "compare", "muted", "muted", "muted", "muted", "muted", "muted"]);
  c.note(`Two threads increment two different counters, a and b. They never touch each other's data — but a and b sit 8 bytes apart, inside the same 64-byte cache line, and the coherence protocol (MESI) tracks ownership per line, not per byte.`);
  writes0++;
  c.shared({ "core 0 copy": "Modified", "core 1 copy": "Invalid" });
  c.tick({ c0: { k: "run", l: "a++" }, c1: { k: "stall", l: "RFO" } }, `Core 0 writes a: it requests the line for ownership and holds it in Modified state. Core 1, wanting to write b, must wait for the line.`, "write");
  for (let i = 0; i < 5; i++) {
    const zeroWrites = i % 2 === 1;
    invalidations++;
    if (zeroWrites) writes0++;
    else writes1++;
    c.shared({ "core 0 copy": zeroWrites ? "Modified" : "Invalid", "core 1 copy": zeroWrites ? "Invalid" : "Modified", invalidations });
    c.tick(zeroWrites ? { c0: { k: "run", l: "a++" }, c1: { k: "stall", l: "RFO" } } : { c0: { k: "stall", l: "RFO" }, c1: { k: "run", l: "b++" } }, zeroWrites ? `Core 0 wants a again: it invalidates core 1's copy and pulls the line back (~40–100 ns across cores). Core 1 stalls.` : `Core 1 writes b: it must invalidate core 0's copy and fetch the line. Core 0 stalls. The line ping-pongs although the two variables are logically unrelated.`, "bounce");
  }
  const sharedWrites = writes0 + writes1;
  c.set({ "writes in 6 ticks (shared line)": sharedWrites, invalidations });
  c.note(`In 6 ticks the two cores completed ${sharedWrites} writes and forced ${invalidations} invalidations: each core spends most of its time waiting for the line. This is false sharing — sharing by address, not by intent.`, "analysis");
  c.shared({ layout: "a and b on separate lines (alignas(64) / padding)", "core 0 copy": "Modified (line 0x1040)", "core 1 copy": "Modified (line 0x1080)", invalidations });
  c.queue("cache line 0x1040", ["a", "pad", "pad", "pad", "pad", "pad", "pad", "pad"], 8, ["active", "muted", "muted", "muted", "muted", "muted", "muted", "muted"]);
  c.queue("cache line 0x1080", ["b", "pad", "pad", "pad", "pad", "pad", "pad", "pad"], 8, ["compare", "muted", "muted", "muted", "muted", "muted", "muted", "muted"]);
  let padded = 0;
  for (let i = 0; i < 4; i++) {
    padded += 2;
    c.tick({ c0: { k: "run", l: "a++" }, c1: { k: "run", l: "b++" } }, i === 0 ? `Pad a to its own 64-byte line (alignas(64) or a padding array). Now each core holds its own line in Modified state and writes at full speed: 2 writes per tick, zero coherence traffic.` : `Both cores keep writing locally; no invalidations.`, "padded");
  }
  c.set({ "writes in 4 ticks (padded)": padded, "invalidations (padded)": 0 });
  c.note(`Shared line: ${sharedWrites} writes in 6 ticks. Padded: ${padded} writes in 4 ticks. Watch for it whenever per-thread counters, locks or flags live in one array or struct; find it with perf c2c, fix it with padding or truly thread-local data.`, "done");
  return c.f.done();
};

const diningPhilosophers: G = ({ threads }) => {
  const n = clampInt(threads, 2, 6, 5);
  const ids = tids(n, "P");
  const c = new Conc(ids);
  c.set({ philosophers: n, forks: n });
  c.note(`${n} philosophers sit around a table with ${n} forks, one between each pair. To eat, P${1} needs forks F1 (left) and F2 (right). Naive rule: pick up your left fork, then your right.`);
  const naive = ids.map((id, i) => ({ id, needs: [`F${i + 1}`, `F${((i + 1) % n) + 1}`] }));
  runLockSim(c, naive, { verb: "eat", release: "puts down", work: 1, maxTicks: 12, tag: "naive" });
  c.note(`Every philosopher holds one fork and waits for the neighbour's: circular wait with no one able to release. Real programs hit this with two mutexes taken in opposite orders.`, "analysis");
  c.note(`Fix (Dijkstra's resource hierarchy): number the forks and always pick up the lower-numbered one first. Only P${n} changes behaviour — it now reaches for F1 before F${n} — which is enough to break the cycle. Replay:`, "fix");
  const ordered = ids.map((id, i) => ({ id, needs: [`F${i + 1}`, `F${((i + 1) % n) + 1}`].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))) }));
  const res = runLockSim(c, ordered, { verb: "eat", release: "puts down", work: 1, maxTicks: 40, tag: "ordered" });
  c.note(res === "ok" ? `Everyone ate in ${c.s.tick} ticks. Alternatives: a waiter (semaphore of n−1 seats) so at most n−1 philosophers try at once, or try-lock with backoff. All of them break one Coffman condition.` : `Ordering broke the cycle; the simulation stopped at the tick limit.`, "done");
  return c.f.done();
};

// ---------- renderer ----------

function Renderer({ frame }: RendererProps<ConcurrencyInput, ConcurrencyState>) {
  const { state } = frame;
  const ticks = Math.max(1, ...state.threads.map((t) => t.cells.length));
  const cur = state.tick - 1;
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto pb-1">
        <div className="inline-grid items-center gap-x-1 gap-y-1" style={{ gridTemplateColumns: `minmax(72px, max-content) repeat(${ticks}, 36px) minmax(80px, max-content)` }}>
          <div className="text-[10px] text-muted">thread</div>
          {Array.from({ length: ticks }, (_, i) => (
            <div key={i} className={cn("text-center font-mono text-[10px]", i === cur ? "font-semibold text-accent" : "text-muted")}>
              t{i + 1}
            </div>
          ))}
          <div className="text-[10px] text-muted">private state</div>
          {state.threads.map((t) => (
            <RowFragment key={t.id} t={t} ticks={ticks} cur={cur} />
          ))}
        </div>
      </div>
      {Object.keys(state.shared).length > 0 && (
        <div>
          <div className="mb-1 text-[11px] text-muted">shared memory</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(state.shared).map(([k, v]) => (
              <span key={k} className="rounded-md border border-line bg-elev-2 px-2 py-1 font-mono text-[11px]">
                <span className="text-muted">{k} = </span>
                <span className="text-fg">{typeof v === "string" ? v : JSON.stringify(v)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {state.queues.map((q) => {
        const items: (string | number | null)[] = [...q.items];
        const tones: (Tone | undefined)[] = q.tones ? [...q.tones] : q.items.map(() => "active" as Tone);
        if (q.capacity !== undefined) while (items.length < q.capacity) {
          items.push(null);
          tones.push(undefined);
        }
        return (
          <div key={q.label}>
            <div className="mb-1 text-[11px] text-muted">{q.label}</div>
            {items.length === 0 ? <div className="font-mono text-[11px] text-muted">(empty)</div> : <Cells values={items} tones={tones} labels={items.map(() => "")} size="sm" />}
          </div>
        );
      })}
      {state.waitFor && <WaitForGraph w={state.waitFor} />}
      {state.log.length > 0 && (
        <div className="rounded-md bg-code px-3 py-2 font-mono text-[11px] text-muted">
          {state.log.map((l, i) => (
            <div key={i} className={i === state.log.length - 1 ? "text-fg" : ""}>
              {l}
            </div>
          ))}
        </div>
      )}
      <Vars vars={state.vars} />
      <Legend items={[{ tone: "active", label: "running" }, { tone: "path", label: "critical section / holding" }, { tone: "danger", label: "blocked on lock" }, { tone: "compare", label: "waiting on condition" }, { tone: "frontier", label: "retry / stall" }, { tone: "done", label: "finished" }, { tone: "muted", label: "idle" }]} />
    </div>
  );
}

function RowFragment({ t, ticks, cur }: { t: ThreadRow; ticks: number; cur: number }) {
  return (
    <>
      <div className="truncate pr-1 text-xs font-medium" title={t.label}>
        {t.label}
      </div>
      {Array.from({ length: ticks }, (_, i) => {
        const cell = t.cells[i];
        if (!cell) return <div key={i} className="h-7" />;
        const tone = cell.t ?? segTone[cell.k];
        return (
          <div key={i} className={cn("flex h-7 items-center justify-center rounded border font-mono text-[9px] transition-colors", toneClass[tone], i === cur && "ring-2 ring-accent/50")} title={`${cell.k}${cell.l ? `: ${cell.l}` : ""}`}>
            {cell.l ?? (cell.k === "idle" ? "" : cell.k === "done" ? "✓" : cell.k)}
          </div>
        );
      })}
      <div className="truncate pl-1 font-mono text-[10px] text-muted" title={t.state}>
        {t.state ?? ""}
      </div>
    </>
  );
}

function WaitForGraph({ w }: { w: WaitFor }) {
  const W = 260;
  const H = 170;
  const cx = W / 2;
  const cy = H / 2 + 4;
  const R = Math.min(64, 20 + w.nodes.length * 11);
  const pos: Record<string, [number, number]> = {};
  w.nodes.forEach((n, i) => {
    const a = (i / w.nodes.length) * Math.PI * 2 - Math.PI / 2;
    pos[n.id] = [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  });
  return (
    <div>
      <div className="mb-1 text-[11px] text-muted">wait-for graph (edge = "waits for a lock held by")</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-64 max-w-full" role="img" aria-label="Wait-for graph">
        {w.edges.map((e, i) => {
          const a = pos[e.from];
          const b = pos[e.to];
          if (!a || !b) return null;
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const len = Math.hypot(dx, dy) || 1;
          const r = 18;
          // Two-node cycles: bend each direction slightly so both arrows show.
          const nx = (-dy / len) * 6;
          const ny = (dx / len) * 6;
          return <Arrow key={i} x1={a[0] + (dx / len) * r + nx} y1={a[1] + (dy / len) * r + ny} x2={b[0] - (dx / len) * r + nx} y2={b[1] - (dy / len) * r + ny} tone={e.tone ?? "compare"} label={e.label} />;
        })}
        {w.nodes.map((n) => {
          const p = pos[n.id]!;
          return <Circle key={n.id} x={p[0]} y={p[1]} r={16} label={n.id} tone={n.tone ?? "default"} sub={n.sub} />;
        })}
      </svg>
    </div>
  );
}

export const concurrencyFamily: Family<ConcurrencyInput, ConcurrencyState> = {
  name: "Concurrency",
  description: "Threads on a timeline sharing counters, locks, queues and forks: races, mutual exclusion, deadlock, and coordination primitives.",
  Renderer,
  algorithms: {
    "race-condition": raceCondition,
    mutex,
    deadlock,
    "producer-consumer": producerConsumer,
    "readers-writers": readersWriters,
    semaphore,
    "condition-variable": conditionVariable,
    "event-loop": eventLoop,
    "thread-pool": threadPool,
    channels,
    "cas-loop": casLoop,
    "false-sharing": falseSharing,
    "dining-philosophers": diningPhilosophers,
  },
  labels: {
    "race-condition": "Race condition: lost update",
    mutex: "Mutex around a critical section",
    deadlock: "Deadlock and lock ordering",
    "producer-consumer": "Producer–consumer with a bounded buffer",
    "readers-writers": "Readers–writers lock",
    semaphore: "Counting semaphore",
    "condition-variable": "Condition variable wait/notify",
    "event-loop": "JavaScript event loop",
    "thread-pool": "Thread pool and task queue",
    channels: "Channels: unbuffered vs buffered",
    "cas-loop": "Compare-and-swap retry loop",
    "false-sharing": "False sharing of a cache line",
    "dining-philosophers": "Dining philosophers",
  },
  examples: {
    "race-condition": { threads: 2 },
    mutex: { threads: 2 },
    deadlock: { threads: 2 },
    "producer-consumer": { threads: 2, capacity: 3 },
    "readers-writers": { threads: 4 },
    semaphore: { threads: 4, permits: 2 },
    "condition-variable": { threads: 2 },
    "event-loop": {},
    "thread-pool": { threads: 3, tasks: 6 },
    channels: {},
    "cas-loop": { threads: 2 },
    "false-sharing": {},
    "dining-philosophers": { threads: 5 },
  },
  normalise: (raw) => {
    const num = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(v));
    return {
      ...raw,
      threads: num(raw.threads ?? raw.n ?? raw.workers ?? raw.philosophers),
      capacity: num(raw.capacity ?? raw.size ?? raw.buffer),
      permits: num(raw.permits ?? raw.slots),
      tasks: num(raw.tasks ?? raw.jobs),
    };
  },
};
