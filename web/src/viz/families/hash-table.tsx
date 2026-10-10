// Hash tables: separate chaining, open addressing with linear probing and
// tombstones, and growth by rehashing. Keys are hashed with the classic
// 31-polynomial string hash (Java's String.hashCode, 32-bit) or, when a lesson
// asks for it, 32-bit FNV-1a, and reduced modulo the bucket count; every
// frame's note spells out that computation so the learner can follow it by
// hand.
import { Cells, Legend, Vars, toneClass, type Tone } from "../primitives";
import { Frames, type Family, type RendererProps } from "../engine";
import { cn } from "../../lib/utils";

export type HashOp = [string, ...unknown[]] | { op: string; key?: unknown; value?: unknown };
export interface HashInput {
  buckets: number;
  operations: HashOp[];
  /** resize: grow when n / m exceeds this (default 0.75). */
  loadFactor?: number;
  /** resize: the new bucket count is max(m + 1, round(m × growth)) (default 2, doubling). */
  growth?: number;
  /** String hash: "java" (31·h + c, default) or "fnv1a" (32-bit FNV-1a over UTF-8 bytes). */
  hash?: "java" | "fnv1a";
}

export interface Slot {
  key: string;
  value: string | null;
  tone?: Tone;
  tombstone?: boolean;
}
export interface Table {
  label?: string;
  slots: Slot[][];
  tones: (Tone | undefined)[];
}
export interface HashState {
  mode: "chaining" | "open";
  table: Table;
  /** Old table shown (muted) while a resize migrates entries. */
  old?: Table;
  /** Bucket pointers: { hash: 3, probe: 5 }. */
  pointers: Record<string, number | undefined>;
  /** Last hash computation, shown in a readout. */
  hash?: { key: string; h: number; m: number; idx: number };
  vars: Record<string, unknown>;
  ops: string[];
  opIndex: number;
}

type G = (input: HashInput) => ReturnType<Frames<HashState>["done"]>;

const MAX_BUCKETS = 16;
const MAX_OPS = 40;

/** Polynomial string hash h = 31·h + c (Java's String.hashCode), as unsigned 32-bit. */
export function hashKey(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

/** 32-bit FNV-1a over the key's UTF-8 bytes. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h >>> 0;
}

type HashFn = (s: string) => number;
const hashFnOf = (input: HashInput): HashFn => (input.hash === "fnv1a" ? fnv1a : hashKey);
const hashName = (input: HashInput) => (input.hash === "fnv1a" ? "32-bit FNV-1a over the bytes" : "hash = 31·h + c over the characters, like Java's String.hashCode");

/** Append v to a list value shown as "[a, b]" (null starts a new list). */
const appendValue = (old: string | null, v: string | null): string => {
  const item = v ?? "";
  if (old !== null && old.startsWith("[") && old.endsWith("]")) return old.length > 2 ? `${old.slice(0, -1)}, ${item}]` : `[${item}]`;
  return old === null ? `[${item}]` : `[${old}, ${item}]`;
};

interface ParsedOp {
  name: "set" | "get" | "delete" | "append" | "unknown";
  raw: string;
  key: string;
  value: string | null;
  text: string;
}
const SET = new Set(["set", "put", "insert", "add", "store", "write"]);
const GET = new Set(["get", "lookup", "find", "search", "read", "contains", "has"]);
const DEL = new Set(["delete", "remove", "del", "erase", "unset"]);
function parseOps(ops: HashOp[]): ParsedOp[] {
  const out: ParsedOp[] = [];
  for (const op of (Array.isArray(ops) ? ops : []).slice(0, MAX_OPS)) {
    let raw = "";
    let key: unknown;
    let value: unknown;
    if (Array.isArray(op)) [raw, key, value] = [String(op[0] ?? ""), op[1], op[2]];
    else if (op && typeof op === "object") {
      const o = op as Record<string, unknown>;
      raw = String(o.op ?? o.name ?? o.type ?? "");
      key = o.key ?? o.k;
      value = o.value ?? o.v;
    } else if (typeof op === "string") {
      const parts = (op as string).trim().split(/[\s(),]+/).filter(Boolean);
      [raw, key, value] = [parts[0] ?? "", parts[1], parts[2]];
    }
    const n = raw.toLowerCase();
    const name: ParsedOp["name"] = SET.has(n) ? "set" : GET.has(n) ? "get" : DEL.has(n) ? "delete" : n === "append" ? "append" : "unknown";
    const k = key === undefined || key === null ? "" : String(key);
    const v = value === undefined || value === null ? null : String(value);
    const text = name === "set" || name === "append" ? `${name}(${k}${v === null ? "" : `, ${v}`})` : `${name === "unknown" ? raw : name}(${k})`;
    out.push({ name, raw, key: k, value: v, text });
  }
  return out;
}

function make(mode: HashState["mode"], m: number, ops: ParsedOp[]) {
  const table: Table = { slots: Array.from({ length: m }, () => []), tones: new Array<Tone | undefined>(m).fill(undefined) };
  const s: HashState = { mode, table, pointers: {}, vars: {}, ops: ops.map((o) => o.text), opIndex: -1 };
  const copyTable = (t: Table): Table => ({ label: t.label, slots: t.slots.map((c) => c.map((e) => ({ ...e }))), tones: [...t.tones] });
  const f = new Frames<HashState>(() => ({
    mode: s.mode,
    table: copyTable(s.table),
    old: s.old ? copyTable(s.old) : undefined,
    pointers: { ...s.pointers },
    hash: s.hash ? { ...s.hash } : undefined,
    vars: { ...s.vars },
    ops: s.ops,
    opIndex: s.opIndex,
  }));
  const clearTones = () => {
    for (const c of s.table.slots) for (const e of c) e.tone = undefined;
    s.table.tones.fill(undefined);
    if (s.old) {
      for (const c of s.old.slots) for (const e of c) e.tone = "muted";
      s.old.tones.fill("muted");
    }
  };
  const count = () => s.table.slots.reduce((acc, c) => acc + c.filter((e) => !e.tombstone).length, 0);
  const tombstones = () => s.table.slots.reduce((acc, c) => acc + c.filter((e) => e.tombstone).length, 0);
  const show = (v: string | null) => (v === null ? "" : ` → ${v}`);
  return { s, f, clearTones, count, tombstones, show };
}

const alpha = (n: number, m: number) => Number((n / Math.max(1, m)).toFixed(2));

/** Shared driver for chaining, with optional growth (used by `resize`). */
/** Fraction of uniformly random hash values whose bucket differs between mod a and mod b. */
export function movedFraction(a: number, b: number): number {
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  const l = (a / gcd(a, b)) * b;
  let same = 0;
  for (let r = 0; r < l; r++) if (r % a === r % b) same++;
  return 1 - same / l;
}

function chainingRun(input: HashInput, grow: boolean): ReturnType<Frames<HashState>["done"]> {
  const m0 = input.buckets;
  const ops = parseOps(input.operations);
  const hashOf = hashFnOf(input);
  const lf = grow ? (input.loadFactor ?? 0.75) : Infinity;
  const growth = input.growth !== undefined && input.growth > 1 ? input.growth : 2;
  const grownSize = (old: number) => Math.max(old + 1, Math.round(old * growth));
  const doubling = growth >= 2;
  let resizes = 0;
  const { s, f, clearTones, count, show } = make("chaining", m0, ops);
  const m = () => s.table.slots.length;
  const vars = () => ({ n: count(), m: m(), α: alpha(count(), m()) });
  s.vars = vars();
  f.push(
    grow
      ? `${m0} buckets with separate chaining (${hashName(input)}) and a load-factor bound of ${lf}: whenever n / m exceeds ${lf} the table ${growth === 2 ? "doubles" : `grows from ${m0} to ${grownSize(m0)} buckets`} and every key is rehashed with the new modulus.`
      : `${m0} buckets, each the head of a chain of entries; hash(key) mod ${m0} picks the bucket (${hashName(input)}) and colliding keys simply share a chain.`,
  );
  if (ops.length === 0) f.push(`No operations given: the table stays empty.`, "empty");
  const hashTo = (key: string, op: ParsedOp) => {
    const h = hashOf(key);
    const idx = h % m();
    clearTones();
    s.table.tones[idx] = "compare";
    s.pointers = { hash: idx };
    s.hash = { key, h, m: m(), idx };
    s.vars = vars();
    f.push(`${op.text}: hash("${key}") = ${h} and ${h} mod ${m()} = ${idx}, so the entry belongs in bucket ${idx}.`, "hash");
    return idx;
  };
  const walk = (idx: number, key: string): number => {
    const chain = s.table.slots[idx]!;
    for (let j = 0; j < chain.length && !f.full; j++) {
      const e = chain[j]!;
      clearTones();
      s.table.tones[idx] = "compare";
      for (let t = 0; t < j; t++) chain[t]!.tone = "visited";
      e.tone = e.key === key ? "done" : "compare";
      if (e.key === key) {
        f.push(`Compare "${key}" with chain entry ${j + 1}, "${e.key}": equal, found after ${j + 1} comparison${j === 0 ? "" : "s"}.`, "found");
        return j;
      }
      f.push(`Compare "${key}" with chain entry ${j + 1}, "${e.key}": different keys that share a bucket, keep walking the chain.`, "walk");
    }
    return -1;
  };
  for (let i = 0; i < ops.length && !f.full; i++) {
    const op = ops[i]!;
    s.opIndex = i;
    if (op.name === "unknown") {
      clearTones();
      f.push(`Unknown operation "${op.raw}"; skipped. Use set, get or delete.`, "skip");
      continue;
    }
    const idx = hashTo(op.key, op);
    const chain = s.table.slots[idx]!;
    const j = walk(idx, op.key);
    if (op.name === "get") {
      s.vars = { ...vars(), result: j >= 0 ? (chain[j]!.value ?? "present") : "absent" };
      if (j >= 0) f.push(`get("${op.key}")${show(chain[j]!.value)}: ${j + 1} comparison${j === 0 ? "" : "s"} in a chain of ${chain.length}.`, "get");
      else {
        s.table.tones[idx] = "danger";
        f.push(chain.length === 0 ? `Bucket ${idx} is empty, so "${op.key}" is absent: one hash and zero comparisons.` : `Chain of ${chain.length} exhausted with no match: "${op.key}" is absent.`, "miss");
      }
    } else if (op.name === "delete") {
      if (j < 0) {
        s.table.tones[idx] = "danger";
        f.push(`"${op.key}" is not in bucket ${idx}, so there is nothing to delete.`, "miss");
      } else {
        chain[j]!.tone = "danger";
        f.push(`Unlink "${op.key}" from the chain: with a linked chain that is an O(1) pointer change once found.`, "unlink");
        chain.splice(j, 1);
        clearTones();
        s.table.tones[idx] = "done";
        s.vars = vars();
        f.push(`Deleted. n = ${count()}, α = ${alpha(count(), m())}; nothing else in the table moved.`, "delete");
      }
    } else {
      if (j >= 0) {
        if (op.name === "append") {
          chain[j]!.value = appendValue(chain[j]!.value, op.value);
          chain[j]!.tone = "done";
          f.push(`Key exists: append "${op.value ?? ""}" to its list${show(chain[j]!.value)}. Still one entry for "${op.key}": the group grows, the table does not.`, "append");
        } else {
          chain[j]!.value = op.value;
          chain[j]!.tone = "done";
          f.push(`Key exists: overwrite its value${show(op.value)} in place. A map never holds two entries for one key.`, "update");
        }
      } else {
        const value = op.name === "append" ? appendValue(null, op.value) : op.value;
        chain.push({ key: op.key, value, tone: "done" });
        s.table.tones[idx] = "done";
        s.vars = vars();
        f.push(`${chain.length === 1 ? "Bucket empty" : `Chain end reached with no match`}: ${op.name === "append" ? `new key, so start its list: add ("${op.key}", ${value})` : `append ("${op.key}"${op.value === null ? "" : `, ${op.value}`})`} to bucket ${idx}${chain.length > 1 ? ` (chain length now ${chain.length}: a collision)` : ""}. n = ${count()}, α = ${alpha(count(), m())}.`, "insert");
        if (grow && count() > lf * m() && !f.full) resize(lf);
      }
    }
  }
  function resize(bound: number) {
    const oldM = m();
    const newM = grownSize(oldM);
    const n = count();
    resizes++;
    s.old = { label: `old (${oldM} buckets)`, slots: s.table.slots, tones: new Array<Tone | undefined>(oldM).fill("muted") };
    s.table = { label: `new (${newM} buckets)`, slots: Array.from({ length: newM }, () => []), tones: new Array<Tone | undefined>(newM).fill(undefined) };
    clearTones();
    s.pointers = {};
    s.vars = { n, m: newM, α: alpha(n, newM), threshold: bound };
    f.push(`n = ${n} > ${bound} × ${oldM} = ${bound * oldM}: the load-factor bound is exceeded, so allocate ${newM} buckets and rehash every entry (the hash values are unchanged, only the modulus is).`, "grow");
    let rehashed = 0;
    let moved = 0;
    for (let b = 0; b < oldM && !f.full; b++) {
      const chain = s.old.slots[b]!;
      while (chain.length && !f.full) {
        const e = chain.shift()!;
        const h = hashOf(e.key);
        const idx = h % newM;
        s.table.slots[idx]!.push({ key: e.key, value: e.value });
        rehashed++;
        if (idx !== b) moved++;
        clearTones();
        s.old.tones[b] = "compare";
        s.table.tones[idx] = "done";
        s.table.slots[idx]![s.table.slots[idx]!.length - 1]!.tone = "done";
        s.pointers = { hash: idx };
        s.hash = { key: e.key, h, m: newM, idx };
        s.vars = { rehashed, moved, n, m: newM };
        f.push(idx === b ? `Rehash "${e.key}": ${h} mod ${newM} = ${idx}, the same bucket number it had under mod ${oldM}, so this key stays put (it is still copied into the new array).` : `Rehash "${e.key}": ${h} mod ${newM} = ${idx}, but it was in bucket ${b} under mod ${oldM}: this key moves.`, idx === b ? "stays" : "moves");
      }
    }
    const pct = Math.round(movedFraction(oldM, newM) * 100);
    s.old = undefined;
    clearTones();
    s.pointers = {};
    s.hash = undefined;
    s.vars = { ...vars(), rehashed, moved };
    f.push(`Rehash complete: ${rehashed === 2 ? "both" : `all ${rehashed}`} entries recomputed in O(n), and ${moved} of ${rehashed} changed bucket; α is back to ${alpha(n, newM)}. For random hash values, going from mod ${oldM} to mod ${newM} moves about ${pct}% of keys.${newM >= 2 * oldM ? " Spread over the inserts that filled the table, the resize costs O(1) amortised per insert." : ""}`, "resized");
  }
  clearTones();
  s.opIndex = ops.length;
  s.pointers = {};
  s.vars = vars();
  const n = count();
  f.push(
    grow
      ? doubling || resizes === 0
        ? `${n} keys in ${m()} buckets: α = ${alpha(n, m())}. Doubling keeps α bounded, so lookups stay O(1 + α) on average; the price is an occasional O(n) pause, which is why latency-sensitive systems rehash incrementally.`
        : `${n} keys in ${m()} buckets: α = ${alpha(n, m())}. Every resize recomputes every key's bucket, because the modulus changed; growing by a constant factor such as doubling is what keeps that O(n) pause O(1) amortised per insert.`
      : `${n} keys in ${m()} buckets: α = n/m = ${alpha(n, m())}, the expected chain length. Lookup costs O(1 + α), which is O(1) as long as resizing keeps α bounded.`,
    "done",
  );
  return f.done();
}

const chaining: G = (input) => chainingRun(input, false);
const resize: G = (input) => chainingRun(input, true);

const openAddressing: G = (input) => {
  const m = input.buckets;
  const ops = parseOps(input.operations);
  const hashOf = hashFnOf(input);
  const { s, f, clearTones, count, tombstones, show } = make("open", m, ops);
  const slotAt = (i: number) => s.table.slots[i]![0];
  const vars = () => ({ n: count(), tombstones: tombstones(), m, α: alpha(count() + tombstones(), m) });
  s.vars = vars();
  f.push(`Open addressing with ${m} slots: every entry lives in the slot array itself (${hashName(input)}, mod ${m}). On a collision, linear probing tries slot h+1, h+2, … until it finds what it needs.`);
  if (ops.length === 0) f.push(`No operations given: all slots stay empty.`, "empty");
  for (let i = 0; i < ops.length && !f.full; i++) {
    const op = ops[i]!;
    s.opIndex = i;
    if (op.name === "unknown") {
      clearTones();
      f.push(`Unknown operation "${op.raw}"; skipped. Use set, get or delete.`, "skip");
      continue;
    }
    const h = hashOf(op.key);
    const home = h % m;
    const writes = op.name === "set" || op.name === "append";
    clearTones();
    s.table.tones[home] = "compare";
    s.pointers = { hash: home };
    s.hash = { key: op.key, h, m, idx: home };
    s.vars = vars();
    f.push(`${op.text}: hash("${op.key}") = ${h} and ${h} mod ${m} = ${home}, so start probing at slot ${home}.`, "hash");
    let firstTomb = -1;
    let outcome: "found" | "empty" | "full" = "full";
    let at = -1;
    let probes = 0;
    for (let p = 0; p < m && !f.full; p++) {
      const idx = (home + p) % m;
      const e = slotAt(idx);
      probes = p + 1;
      clearTones();
      for (let t = 0; t < p; t++) s.table.tones[(home + t) % m] = "visited";
      s.table.tones[idx] = "compare";
      s.pointers = { hash: home, probe: idx };
      if (!e) {
        outcome = "empty";
        at = idx;
        s.table.tones[idx] = writes ? "done" : "danger";
        f.push(p === 0 ? `Slot ${idx} is empty${writes ? ": no collision, the home slot is free" : `, so "${op.key}" is absent: an empty slot ends every probe sequence`}.` : `Slot ${idx} is empty after ${p} occupied slot${p === 1 ? "" : "s"}${writes ? ": the probe sequence ends here" : `, so "${op.key}" is absent; if it had been inserted it would sit somewhere in that run`}.`, "empty");
        break;
      }
      if (e.tombstone) {
        if (firstTomb < 0) firstTomb = idx;
        e.tone = "frontier";
        f.push(`Slot ${idx} holds a tombstone: a key was deleted here, so keep probing${writes ? " but remember this slot as reusable" : "; if the slot were simply emptied, keys placed beyond it would become unreachable"}.`, "tombstone");
        continue;
      }
      if (e.key === op.key) {
        outcome = "found";
        at = idx;
        e.tone = "done";
        f.push(`Slot ${idx} holds "${e.key}": a match after ${p + 1} probe${p === 0 ? "" : "s"}.`, "found");
        break;
      }
      e.tone = "compare";
      f.push(`Slot ${idx} holds "${e.key}" ≠ "${op.key}": a collision, move to slot ${(idx + 1) % m}.`, "probe");
    }
    if (op.name === "get") {
      s.vars = { ...vars(), probes, result: outcome === "found" ? (slotAt(at)!.value ?? "present") : "absent" };
      if (outcome === "found") f.push(`get("${op.key}")${show(slotAt(at)!.value)} after ${probes} probe${probes === 1 ? "" : "s"}.`, "get");
      else if (outcome === "full") f.push(`Probed all ${m} slots without an empty one: "${op.key}" is absent, but a table this full is far past the load factor at which it should have grown.`, "miss");
      else f.push(`get("${op.key}") → absent after ${probes} probe${probes === 1 ? "" : "s"}.`, "miss");
    } else if (op.name === "delete") {
      if (outcome !== "found") f.push(`"${op.key}" is not in the table, so nothing to delete.`, "miss");
      else {
        const e = slotAt(at)!;
        e.tombstone = true;
        e.value = null;
        e.tone = "danger";
        s.vars = vars();
        f.push(`Replace "${op.key}" with a tombstone rather than emptying slot ${at}: later probes must still pass through it to reach keys that were placed beyond it. Tombstones count toward α until the next resize.`, "delete");
      }
    } else {
      if (outcome === "found") {
        const e = slotAt(at)!;
        e.value = op.name === "append" ? appendValue(e.value, op.value) : op.value;
        e.tone = "done";
        f.push(op.name === "append" ? `Key exists at slot ${at}: append "${op.value ?? ""}" to its list${show(e.value)}.` : `Key exists at slot ${at}: overwrite its value${show(op.value)} in place.`, op.name === "append" ? "append" : "update");
      } else if (outcome === "empty" || firstTomb >= 0) {
        const target = firstTomb >= 0 ? firstTomb : at;
        const value = op.name === "append" ? appendValue(null, op.value) : op.value;
        s.table.slots[target] = [{ key: op.key, value, tone: "done" }];
        clearTones();
        s.table.tones[target] = "done";
        s.pointers = { hash: home, probe: target };
        s.vars = { ...vars(), probes, displacement: (target - home + m) % m };
        f.push(`Store ("${op.key}"${value === null ? "" : `, ${value}`}) in slot ${target}${firstTomb >= 0 ? " by reusing the first tombstone seen" : ""}${target === home ? ", its home slot" : `, ${(target - home + m) % m} past its home slot ${home}: this is primary clustering, and every later key hashing into the run pays for it`}. α = ${alpha(count() + tombstones(), m)}.`, "insert");
      } else {
        s.table.tones.fill("danger");
        f.push(`Every slot is occupied: the table is full and must resize before "${op.key}" can be inserted.`, "full");
      }
    }
  }
  clearTones();
  s.opIndex = ops.length;
  s.pointers = {};
  s.vars = vars();
  f.push(`${count()} keys and ${tombstones()} tombstone${tombstones() === 1 ? "" : "s"} in ${m} slots: α = ${alpha(count() + tombstones(), m)}. Linear probing is cache-friendly but probe counts explode as α → 1 (about ${((1 + 1 / Math.pow(1 - Math.min(0.9, alpha(count() + tombstones(), m)), 2)) / 2).toFixed(1)} expected probes for a miss now), so such tables resize around α ≈ 0.7.`, "done");
  return f.done();
};

// ---- renderer ----

function Chip({ e }: { e: Slot }) {
  return (
    <div className={cn("flex h-8 items-center gap-1 rounded-md border px-2 font-mono text-xs transition-colors", toneClass[e.tone ?? "default"])}>
      {e.tombstone ? <span className="text-muted">†</span> : (
        <>
          <span>{e.key}</span>
          {e.value !== null && <span className="text-muted">: {e.value}</span>}
        </>
      )}
    </div>
  );
}

function ChainTable({ t, pointers }: { t: Table; pointers: Record<string, number | undefined> }) {
  const ptrs = Object.entries(pointers).filter(([, v]) => v !== undefined) as [string, number][];
  return (
    <div className="flex flex-col gap-1">
      {t.label && <div className="mb-0.5 text-[11px] text-muted">{t.label}</div>}
      {t.slots.map((chain, i) => {
        const names = ptrs.filter(([, v]) => v === i).map(([k]) => k);
        return (
          <div key={i} className="flex items-center gap-1">
            <div className="w-12 text-right text-[10px] font-semibold text-accent">{names.length ? `${names.join(",")} →` : ""}</div>
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border font-mono text-[10px] transition-colors", toneClass[t.tones[i] ?? "default"])}>{i}</div>
            {chain.length === 0 ? (
              <span className="pl-1 font-mono text-[11px] text-muted">∅</span>
            ) : (
              chain.map((e, j) => (
                <div key={j} className="flex items-center gap-1">
                  <span className="text-xs text-muted">→</span>
                  <Chip e={e} />
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

function OpenTable({ t, pointers }: { t: Table; pointers: Record<string, number | undefined> }) {
  const values = t.slots.map((c) => {
    const e = c[0];
    if (!e) return null;
    if (e.tombstone) return "†";
    return e.value === null ? e.key : `${e.key}:${e.value}`;
  });
  const tones = t.slots.map((c, i) => c[0]?.tone ?? t.tones[i]);
  return <Cells values={values} tones={tones} pointers={pointers} size="sm" />;
}

function Renderer({ frame }: RendererProps<HashInput, HashState>) {
  const { state } = frame;
  return (
    <div className="flex flex-col items-start gap-3">
      {state.ops.length > 0 && (
        <div className="flex max-w-full flex-wrap gap-1 font-mono text-[10px]">
          {state.ops.map((o, i) => (
            <span key={i} className={cn("rounded border px-1.5 py-0.5", i === state.opIndex ? "border-accent bg-accent/20 text-fg" : i < state.opIndex ? "border-line text-muted opacity-60" : "border-line text-muted")}>
              {o}
            </span>
          ))}
        </div>
      )}
      {state.hash && (
        <div className="rounded-md border border-line bg-elev-2 px-2 py-1 font-mono text-[11px]">
          hash(&quot;{state.hash.key}&quot;) = {state.hash.h} <span className="text-muted">·</span> {state.hash.h} mod {state.hash.m} = <span className="font-semibold text-accent">{state.hash.idx}</span>
        </div>
      )}
      {state.old && <ChainTable t={state.old} pointers={{}} />}
      {state.mode === "chaining" ? <ChainTable t={state.table} pointers={state.pointers} /> : <OpenTable t={state.table} pointers={state.pointers} />}
      <Vars vars={state.vars} />
      <Legend items={[{ tone: "compare", label: "hashed to / comparing" }, { tone: "visited", label: "probed" }, { tone: "done", label: "found / stored" }, { tone: "frontier", label: "tombstone" }, { tone: "danger", label: "absent / deleted" }]} />
    </div>
  );
}

export const hashTableFamily: Family<HashInput, HashState> = {
  name: "Hash table",
  description: "Hashing keys into buckets: chaining, open addressing with tombstones, and resizing.",
  Renderer,
  algorithms: { chaining, "open-addressing": openAddressing, resize },
  labels: { chaining: "Separate chaining", "open-addressing": "Open addressing (linear probing)", resize: "Resize and rehash" },
  examples: {
    chaining: { buckets: 5, operations: [["set", "apple", 1], ["set", "grape", 2], ["set", "melon", 3], ["set", "kiwi", 4], ["get", "grape"], ["delete", "apple"], ["get", "apple"]] },
    "open-addressing": { buckets: 8, operations: [["set", "apple", 1], ["set", "grape", 2], ["set", "melon", 3], ["set", "kiwi", 4], ["get", "kiwi"], ["delete", "grape"], ["get", "melon"], ["set", "plum", 5]] },
    resize: { buckets: 4, operations: [["set", "a", 1], ["set", "b", 2], ["set", "c", 3], ["set", "d", 4], ["set", "e", 5]] },
  },
  normalise: (raw) => {
    const b = Number(raw.buckets ?? raw.size ?? raw.capacity ?? raw.m);
    const lf = Number(raw.loadFactor ?? raw.maxLoad ?? raw.threshold);
    const growth = Number(raw.growth);
    return {
      buckets: Number.isFinite(b) && b >= 1 ? Math.min(MAX_BUCKETS, Math.floor(b)) : 8,
      operations: Array.isArray(raw.operations) ? (raw.operations as HashOp[]).slice(0, MAX_OPS) : Array.isArray(raw.ops) ? (raw.ops as HashOp[]).slice(0, MAX_OPS) : [],
      loadFactor: Number.isFinite(lf) && lf > 0 ? lf : undefined,
      growth: Number.isFinite(growth) && growth > 1 ? Math.min(4, growth) : undefined,
      hash: String(raw.hash ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") === "fnv1a" ? "fnv1a" : undefined,
    };
  },
};
