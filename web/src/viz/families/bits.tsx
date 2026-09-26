// Bit manipulation: operands drawn as rows of binary digit cells (MSB on
// the left), the operation worked column by column, and the decimal value
// of every row shown beside it. Negative numbers use two's complement at
// the chosen word width.
import { Cells, Legend, Vars, type Tone } from "../primitives";
import { Frames, type Family, type RendererProps } from "../engine";

export interface BitsInput {
  a?: number;
  b?: number;
  values?: number[];
  /** Word width in bits (4..32); chosen automatically when omitted. */
  width?: number;
}

export interface BitRow {
  label: string;
  bits: (string | null)[];
  tones?: (Tone | undefined)[];
  /** Decimal readout shown to the right. */
  dec: string;
}

export interface BitsState {
  rows: BitRow[];
  width: number;
  vars: Record<string, unknown>;
  table?: { head: string[]; rows: (string | number)[][]; tones?: (Tone | undefined)[] };
}

type G = (input: BitsInput) => ReturnType<Frames<BitsState>["done"]>;

const MAX_VALUES = 12;
const LIMIT = 2 ** 31 - 1;

/** Two's-complement bit string of v at the given width, MSB first. */
export function toBits(v: number, width: number): string[] {
  const w = Math.max(1, Math.min(32, width));
  const u = w >= 32 ? v >>> 0 : (v & (2 ** w - 1)) >>> 0;
  return [...u.toString(2).padStart(w, "0")];
}

/** Interpret a bit string (MSB first) as signed or unsigned. */
function fromBits(bits: string[], signed: boolean): number {
  const u = parseInt(bits.join(""), 2);
  if (!signed || bits[0] !== "1") return u;
  return u - 2 ** bits.length;
}

function bitsNeeded(values: number[]): number {
  let need = 1;
  for (const v of values) {
    const mag = v < 0 ? -v - 1 : v;
    let b = 1;
    while (2 ** b <= mag) b++;
    need = Math.max(need, b + (v < 0 ? 1 : 0));
  }
  return need;
}

/** Choose a word width that fits every value, rounded up to a multiple of 4. */
function pickWidth(values: number[], explicit?: number, minimum = 4): number {
  if (explicit !== undefined && Number.isFinite(explicit)) return Math.max(1, Math.min(32, Math.round(explicit)));
  const need = bitsNeeded(values);
  const anyNeg = values.some((v) => v < 0);
  return Math.max(minimum, Math.min(32, Math.ceil((need + (anyNeg ? 1 : 0)) / 4) * 4));
}

function make(width: number) {
  const s: BitsState = { rows: [], width, vars: {} };
  const f = new Frames<BitsState>(() => ({
    rows: s.rows.map((r) => ({ ...r, bits: [...r.bits], tones: r.tones ? [...r.tones] : undefined })),
    width: s.width,
    vars: { ...s.vars },
    table: s.table ? { head: [...s.table.head], rows: s.table.rows.map((r) => [...r]), tones: s.table.tones ? [...s.table.tones] : undefined } : undefined,
  }));
  const row = (label: string, v: number | null, opts: { signed?: boolean; tone?: Tone; blank?: boolean } = {}): BitRow => {
    const bits = v === null || opts.blank ? Array.from({ length: s.width }, () => null) : toBits(v, s.width);
    const r: BitRow = { label, bits, tones: bits.map(() => opts.tone), dec: v === null ? "?" : String(opts.signed ? fromBits(toBits(v, s.width), true) : v) };
    return r;
  };
  const clearTones = () => {
    for (const r of s.rows) r.tones = r.bits.map(() => undefined);
  };
  return { s, f, row, clearTones };
}

const decOf = (bits: (string | null)[], signed: boolean) => (bits.some((b) => b === null) ? "?" : String(fromBits(bits as string[], signed)));

// ---------- AND / OR / XOR ----------

const andOrXor: G = ({ a = 12, b = 10, width }) => {
  const w = pickWidth([a, b], width);
  const { s, f, row, clearTones } = make(w);
  const signed = a < 0 || b < 0;
  const A = toBits(a, w);
  const B = toBits(b, w);
  s.rows = [row("a", a, { signed }), row("b", b, { signed })];
  s.vars = { a, b, width: w };
  f.push(`Write both operands in binary at ${w} bits: a = ${A.join("")}, b = ${B.join("")}. Each bitwise operator combines the two bits in one column independently of every other column.`, "operands");
  const ops: { sym: string; name: string; fn: (x: number, y: number) => number; rule: string }[] = [
    { sym: "&", name: "AND", fn: (x, y) => x & y, rule: "1 only when both bits are 1" },
    { sym: "|", name: "OR", fn: (x, y) => x | y, rule: "1 when either bit is 1" },
    { sym: "^", name: "XOR", fn: (x, y) => x ^ y, rule: "1 when the bits differ" },
  ];
  for (const op of ops) {
    if (f.full) break;
    const res = row(`a ${op.sym} b`, null, { blank: true });
    s.rows = [row("a", a, { signed }), row("b", b, { signed }), res];
    s.vars = { op: op.name, rule: op.rule };
    f.push(`${op.name} (${op.sym}): the result bit is ${op.rule}. Work from the least significant column (right) to the most significant (left).`, "op");
    for (let col = w - 1; col >= 0 && !f.full; col--) {
      const x = Number(A[col]);
      const y = Number(B[col]);
      const r = op.fn(x, y);
      clearTones();
      s.rows[0]!.tones![col] = "compare";
      s.rows[1]!.tones![col] = "compare";
      res.bits[col] = String(r);
      res.tones = res.bits.map((bit, i) => (i === col ? "active" : bit === null ? undefined : "done"));
      res.dec = decOf(res.bits, signed);
      s.vars = { op: op.name, bit: w - 1 - col, [`a[${w - 1 - col}]`]: x, [`b[${w - 1 - col}]`]: y, result: r };
      f.push(`Bit ${w - 1 - col}: ${x} ${op.sym} ${y} = ${r} (${op.rule}).`, "column");
    }
    clearTones();
    res.tones = res.bits.map(() => "done");
    const value = fromBits(res.bits as string[], signed);
    s.vars = { op: op.name, result: value };
    f.push(`a ${op.sym} b = ${res.bits.join("")} = ${value}. ${op.name === "AND" ? "AND masks: it keeps only bits set in both, so a & mask extracts fields." : op.name === "OR" ? "OR sets: it turns on bits without disturbing the others." : "XOR toggles: applying the same mask twice restores the original, and x ^ x = 0."}`, "result");
  }
  f.push(`Summary: ${a} & ${b} = ${a & b}, ${a} | ${b} = ${a | b}, ${a} ^ ${b} = ${a ^ b}. Each is O(1): the hardware evaluates all ${w} columns in parallel.`, "done");
  return f.done();
};

// ---------- Shifts ----------

const shift: G = ({ a, values, width }) => {
  const list = values && values.length > 0 ? values.slice(0, 6) : [a ?? 5];
  const anyNeg = list.some((v) => v < 0);
  const w = anyNeg ? pickWidth(list, width, 8) : pickWidth(list.map((v) => v * 4), width, 4);
  const { s, f, row, clearTones } = make(w);
  const signed = anyNeg;
  s.vars = { width: w, signed: anyNeg ? "two's complement" : "unsigned" };
  f.push(`A shift moves every bit sideways by k positions. Left shifts fill with zeros on the right; what falls off the ${w}-bit word on the left is lost.`, "intro");
  for (const v of list) {
    if (f.full) break;
    const base = row("x", v, { signed });
    s.rows = [base];
    s.vars = { x: v, width: w };
    f.push(`x = ${v} is ${base.bits.join("")} in ${w}-bit ${anyNeg ? "two's complement" : "binary"}${v < 0 ? " (the top bit set marks it negative)" : ""}.`, "value");
    for (const k of [1, 2]) {
      if (f.full) break;
      const bits = toBits(v, w);
      const lost = bits.slice(0, k);
      const shifted = [...bits.slice(k), ...Array.from({ length: k }, () => "0")];
      const out = fromBits(shifted, signed);
      const r: BitRow = { label: `x << ${k}`, bits: shifted, tones: shifted.map((_, i) => (i >= w - k ? "active" : "done")), dec: String(out) };
      base.tones = bits.map((bit, i) => (i < k ? (bit === "1" ? "danger" : "muted") : undefined));
      s.rows = [base, r];
      const overflow = lost.includes("1");
      s.vars = { x: v, k, "x << k": out, "x · 2^k": v * 2 ** k };
      f.push(overflow ? `x << ${k}: the top ${k} bit(s) "${lost.join("")}" fall off the word, so the result ${out} is not ${v} × ${2 ** k} = ${v * 2 ** k}: overflow.` : `x << ${k} = ${shifted.join("")} = ${out}, exactly ${v} × ${2 ** k}: each left shift doubles.`, overflow ? "overflow" : "shift-left");
    }
    if (f.full) break;
    {
      const bits = toBits(v, w);
      const sign = bits[0]!;
      const arith = [sign, ...bits.slice(0, w - 1)];
      const ar = fromBits(arith, signed);
      const r: BitRow = { label: "x >> 1", bits: arith, tones: arith.map((_, i) => (i === 0 ? "active" : "done")), dec: String(ar) };
      base.tones = bits.map((_, i) => (i === w - 1 ? "danger" : undefined));
      s.rows = [base, r];
      s.vars = { x: v, "x >> 1": ar, "floor(x / 2)": Math.floor(v / 2) };
      f.push(v < 0 ? `Arithmetic right shift copies the sign bit into the top: ${arith.join("")} = ${ar}, which is floor(${v} / 2) = ${Math.floor(v / 2)}; the low bit '${bits[w - 1]}' is discarded.` : `x >> 1 = ${arith.join("")} = ${ar}: the low bit '${bits[w - 1]}' is dropped, which is floor division by 2.`, "shift-right");
      if (v < 0 && !f.full) {
        const logical = ["0", ...bits.slice(0, w - 1)];
        const lr = fromBits(logical, false);
        const r2: BitRow = { label: "x >>> 1", bits: logical, tones: logical.map((_, i) => (i === 0 ? "compare" : "done")), dec: String(lr) };
        s.rows = [base, r, r2];
        s.vars = { x: v, "x >> 1": ar, "x >>> 1": lr };
        f.push(`Logical right shift fills the top with 0 instead: ${logical.join("")} = ${lr}, a large positive number. Languages differ on which shift >> means for signed values.`, "logical");
      }
    }
    clearTones();
  }
  f.push(`Shifts are O(1) and are how multiply/divide by powers of two, bit masks (1 << k) and packed fields are built.`, "done");
  return f.done();
};

// ---------- Count set bits ----------

const countBits: G = ({ values, a, width }) => {
  const list = values && values.length > 0 ? values.slice(0, 6) : [a ?? 13];
  const w = pickWidth(list, width);
  const { s, f, row } = make(w);
  const signed = list.some((v) => v < 0);
  f.push(`Brian Kernighan's trick: x & (x − 1) clears the lowest set bit of x, so the number of times you can do it before reaching 0 is the popcount.`, "intro");
  for (const v of list) {
    if (f.full) break;
    let x = v;
    let count = 0;
    s.rows = [row("x", x, { signed })];
    s.vars = { x: v, count };
    f.push(`x = ${v} = ${toBits(v, w).join("")}. Count starts at 0.`, "value");
    while (x !== 0 && !f.full) {
      const xb = toBits(x, w);
      const low = xb.lastIndexOf("1");
      const m1 = toBits(x - 1, w);
      const r1 = row("x", x, { signed });
      const r2 = row("x − 1", x - 1, { signed });
      r1.tones = xb.map((_, i) => (i === low ? "active" : i > low ? "muted" : undefined));
      r2.tones = m1.map((_, i) => (i >= low ? "compare" : undefined));
      s.rows = [r1, r2];
      s.vars = { x, "x − 1": x - 1, count };
      f.push(`Subtracting 1 borrows through the trailing zeros: bit ${w - 1 - low} (the lowest set bit) flips to 0 and every bit below it flips to 1; higher bits are untouched.`, "borrow");
      const next = x & (x - 1);
      const r3 = row("x & (x − 1)", next, { signed });
      r3.tones = toBits(next, w).map((_, i) => (i === low ? "danger" : i > low ? "muted" : "done"));
      s.rows = [r1, r2, r3];
      count++;
      s.vars = { x, "x & (x − 1)": next, count };
      f.push(`AND keeps only bits set in both: exactly the lowest set bit disappears, giving ${next}. Count is now ${count}.`, "clear");
      x = next;
    }
    s.rows = [row("x", 0, { tone: "done" })];
    s.vars = { value: v, popcount: count };
    f.push(`x reached 0 after ${count} step(s): ${v} has ${count} set bit(s). Cost is O(number of set bits), not O(word width).`, "result");
  }
  f.push(`Popcount underpins Hamming distance, bitset sizes and subset-DP iteration order; many CPUs expose it as a single instruction.`, "done");
  return f.done();
};

// ---------- Single number (XOR everything) ----------

const singleNumber: G = ({ values, width }) => {
  const list = values && values.length > 0 ? values.slice(0, MAX_VALUES) : [4, 1, 2, 1, 2];
  const w = pickWidth(list, width);
  const { s, f, row, clearTones } = make(w);
  const signed = list.some((v) => v < 0);
  const seen = new Map<number, number>();
  for (const v of list) seen.set(v, (seen.get(v) ?? 0) + 1);
  const tableTones = (): (Tone | undefined)[] => list.map((v) => ((seen.get(v) ?? 0) % 2 === 0 ? "muted" : "active"));
  s.table = { head: ["i", "value", "bits"], rows: list.map((v, i) => [i, v, toBits(v, w).join("")]), tones: list.map(() => undefined) };
  let acc = 0;
  s.rows = [row("acc", 0)];
  s.vars = { acc, n: list.length };
  f.push(`XOR has three properties: x ^ x = 0, x ^ 0 = x, and it is commutative and associative. So XOR-ing the whole array cancels every value that appears an even number of times.`, "intro");
  for (let i = 0; i < list.length && !f.full; i++) {
    const v = list[i]!;
    const next = acc ^ v;
    const ab = toBits(acc, w);
    const vb = toBits(v, w);
    const nb = toBits(next, w);
    const accRow = row("acc", acc, { signed });
    const vRow = row(`values[${i}]`, v, { signed });
    accRow.tones = ab.map((bit, j) => (bit !== vb[j] ? "compare" : undefined));
    vRow.tones = vb.map((bit, j) => (bit !== ab[j] ? "compare" : undefined));
    const resRow = row("acc ^ v", next, { signed });
    resRow.tones = nb.map((bit) => (bit === "1" ? "active" : "done"));
    s.rows = [accRow, vRow, resRow];
    s.table!.tones = list.map((_, j) => (j === i ? "active" : j < i ? "visited" : undefined));
    s.vars = { i, acc, v, "acc ^ v": next };
    f.push(next === 0 ? `acc ^ ${v}: the bits are identical, so every column gives 0; a previous ${v} has just been cancelled.` : `acc ^ ${v} = ${next}: columns where the two bits differ become 1, columns where they agree become 0.`, "xor");
    acc = next;
  }
  clearTones();
  s.rows = [row("acc", acc, { signed, tone: "done" })];
  s.table!.tones = tableTones();
  s.vars = { result: acc };
  f.push(`Final acc = ${acc}: the value that appears an odd number of times. O(n) time, O(1) extra space, no hash set.`, "done");
  return f.done();
};

// ---------- Power of two ----------

const powerOfTwo: G = ({ values, a, width }) => {
  const list = values && values.length > 0 ? values.slice(0, 8) : [a ?? 16, 18];
  const w = pickWidth(list, width);
  const { s, f, row } = make(w);
  f.push(`A power of two has exactly one set bit. Clearing the lowest set bit with n & (n − 1) therefore leaves 0 for powers of two and something non-zero for everything else.`, "intro");
  for (const n of list) {
    if (f.full) break;
    const nb = toBits(n, w);
    const ones = nb.filter((b) => b === "1").length;
    const r1 = row("n", n);
    r1.tones = nb.map((b) => (b === "1" ? "active" : undefined));
    s.rows = [r1];
    s.vars = { n, "set bits": ones };
    f.push(n <= 0 ? `n = ${n} is not positive, so it cannot be a power of two; the trick needs the n > 0 guard.` : `n = ${n} = ${nb.join("")} has ${ones} set bit(s).`, "value");
    if (n <= 0) {
      s.vars = { n, "power of two": false };
      f.push(`Verdict for ${n}: false (guard n > 0 fails).`, "verdict");
      continue;
    }
    const low = nb.lastIndexOf("1");
    const mb = toBits(n - 1, w);
    const r2 = row("n − 1", n - 1);
    r2.tones = mb.map((_, i) => (i >= low ? "compare" : undefined));
    s.rows = [r1, r2];
    s.vars = { n, "n − 1": n - 1 };
    f.push(`n − 1 = ${mb.join("")}: the lowest set bit and every bit below it flip.`, "borrow");
    const and = n & (n - 1);
    const r3 = row("n & (n − 1)", and);
    r3.tones = toBits(and, w).map((b, i) => (i === low ? "danger" : b === "1" ? "active" : "done"));
    s.rows = [r1, r2, r3];
    s.vars = { n, "n & (n − 1)": and, "power of two": and === 0 };
    f.push(and === 0 ? `n & (n − 1) = 0: the only set bit was cleared, so ${n} is a power of two (2^${w - 1 - low}).` : `n & (n − 1) = ${and} ≠ 0: a higher bit survived, so ${n} is not a power of two.`, "verdict");
  }
  f.push(`The test is O(1): one subtraction, one AND, one comparison, no loop over the bits.`, "done");
  return f.done();
};

// ---------- Subset masks ----------

const subsetMask: G = ({ values }) => {
  const items = values && values.length > 0 ? values.slice(0, 5) : [1, 2, 3];
  const n = items.length;
  const { s, f, row } = make(n);
  s.table = { head: ["mask", "bits", "subset", "size"], rows: [], tones: [] };
  s.vars = { n, items: items.join(", "), subsets: 2 ** n };
  f.push(`With n = ${n} items, an n-bit mask names one subset: bit i set (bit 0 is the rightmost column) means items[i] is included. Counting masks 0 … 2^n − 1 enumerates all ${2 ** n} subsets.`, "intro");
  for (let mask = 0; mask < 2 ** n && !f.full; mask++) {
    const bits = toBits(mask, n);
    const chosen = items.filter((_, i) => (mask >> i) & 1);
    const r = row("mask", mask);
    r.tones = bits.map((b) => (b === "1" ? "active" : "muted"));
    const itemRow: BitRow = { label: "items", bits: [...items].reverse().map(String), tones: [...items].reverse().map((_, j) => (bits[j] === "1" ? "done" : "muted")), dec: "" };
    s.rows = [itemRow, r];
    s.table!.rows.push([mask, bits.join(""), chosen.length ? `{${chosen.join(", ")}}` : "∅", chosen.length]);
    s.table!.tones = s.table!.rows.map((_, i) => (i === mask ? "active" : "visited"));
    s.vars = { mask, bits: bits.join(""), subset: chosen.length ? `{${chosen.join(", ")}}` : "∅", size: chosen.length };
    f.push(mask === 0 ? `mask 0 = ${bits.join("")}: no bits set, the empty subset.` : mask === 2 ** n - 1 ? `mask ${mask} = ${bits.join("")}: every bit set, the full set.` : `mask ${mask} = ${bits.join("")}: bits ${bits.map((b, j) => (b === "1" ? n - 1 - j : -1)).filter((x) => x >= 0).join(", ")} are set, so the subset is {${chosen.join(", ")}}.`, "mask");
  }
  s.table!.tones = s.table!.rows.map(() => "done");
  s.vars = { n, subsets: 2 ** n, note: "mask & (1 << i) tests membership; mask | (1 << i) adds; mask ^ (1 << i) toggles" };
  f.push(`All ${2 ** n} subsets visited in O(2^n). Because every proper subset of a mask is numerically smaller, iterating masks in increasing order is a valid order for subset DP.`, "done");
  return f.done();
};

// ---------- Renderer ----------

function Renderer({ frame }: RendererProps<BitsInput, BitsState>) {
  const { state } = frame;
  const positions = Array.from({ length: state.width }, (_, i) => state.width - 1 - i);
  const blank = positions.map(() => "");
  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex flex-col gap-1">
        {state.rows.map((r, i) => (
          <div key={`${r.label}-${i}`} className="flex items-start gap-2">
            <div className="w-24 shrink-0 pt-2 text-right font-mono text-xs text-muted">{r.label}</div>
            <Cells values={r.bits} tones={r.tones} labels={i === state.rows.length - 1 ? positions : blank} size="sm" />
            <div className="pt-2 font-mono text-sm text-fg">{r.dec === "" ? "" : `= ${r.dec}`}</div>
          </div>
        ))}
      </div>
      {state.table && (
        <div className="max-w-full overflow-x-auto">
          <table className="text-xs font-mono">
            <thead>
              <tr>
                {state.table.head.map((h) => (
                  <th key={h} className="px-2 py-0.5 text-left font-normal text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.table.rows.map((r, i) => {
                const tone = state.table!.tones?.[i];
                return (
                  <tr key={i} className={tone === "active" ? "bg-accent/20" : tone === "muted" ? "opacity-50" : tone === "done" ? "bg-success/10" : ""}>
                    {r.map((c, j) => (
                      <td key={j} className="px-2 py-0.5">{c}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Vars vars={state.vars} />
      <Legend items={[{ tone: "compare", label: "bits being combined" }, { tone: "active", label: "current / set bit" }, { tone: "done", label: "computed" }, { tone: "danger", label: "cleared / lost bit" }, { tone: "muted", label: "unchanged / zero" }]} />
    </div>
  );
}

export const bitsFamily: Family<BitsInput, BitsState> = {
  name: "Bits",
  description: "Bitwise operators, shifts, popcount and subset masks worked column by column.",
  Renderer,
  algorithms: {
    "and-or-xor": andOrXor,
    shift,
    "count-bits": countBits,
    "single-number": singleNumber,
    "power-of-two": powerOfTwo,
    "subset-mask": subsetMask,
  },
  labels: {
    "and-or-xor": "AND, OR, XOR column by column",
    shift: "Left and right shifts",
    "count-bits": "Count set bits (x & (x − 1))",
    "single-number": "Single number: XOR cancellation",
    "power-of-two": "Power of two test",
    "subset-mask": "Subsets as bit masks",
  },
  examples: {
    "and-or-xor": { a: 12, b: 10 },
    shift: { a: 5 },
    "count-bits": { values: [13] },
    "single-number": { values: [4, 1, 2, 1, 2] },
    "power-of-two": { values: [16, 18] },
    "subset-mask": { values: [1, 2, 3] },
  },
  normalise: (raw) => {
    const num = (v: unknown): number | undefined => {
      if (v === undefined || v === null || v === "") return undefined;
      const n = Math.trunc(Number(v));
      return Number.isFinite(n) ? Math.max(-LIMIT - 1, Math.min(LIMIT, n)) : undefined;
    };
    const values = Array.isArray(raw.values) ? (raw.values as unknown[]).map(num).filter((n): n is number => n !== undefined).slice(0, MAX_VALUES) : undefined;
    return { a: num(raw.a ?? raw.x ?? raw.n), b: num(raw.b ?? raw.y), values: values && values.length > 0 ? values : undefined, width: num(raw.width ?? raw.bits) };
  },
};
