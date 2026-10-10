import { describe, expect, it } from "vitest";
import { MAX_FRAMES } from "../engine";
import { bitsFamily, toBits, type BitsInput } from "./bits";

const check = (algo: string, input: BitsInput) => {
  const frames = bitsFamily.algorithms[algo]!(input);
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.length).toBeLessThanOrEqual(MAX_FRAMES + 1);
  for (const fr of frames) expect(fr.note.trim().length).toBeGreaterThan(0);
  return frames;
};

describe("bits family", () => {
  const algos = Object.keys(bitsFamily.algorithms);
  it("implements the catalogue", () => {
    expect(algos.sort()).toEqual(["and-or-xor", "count-bits", "power-of-two", "shift", "single-number", "subset-mask"].sort());
    for (const a of algos) {
      expect(bitsFamily.examples[a]).toBeDefined();
      expect(bitsFamily.labels?.[a]).toBeDefined();
    }
  });
  for (const algo of algos) {
    it(`${algo}: example and edge inputs`, () => {
      check(algo, bitsFamily.examples[algo]!);
      check(algo, {});
      check(algo, { values: [], a: 0, b: 0 });
      check(algo, { values: [7], a: 1 });
      check(algo, { values: [5, 5, 5, 5], a: 5, b: 5 });
      check(algo, { values: [5, -5, 127], a: -3, b: 2 ** 31 - 1 });
      check(algo, { values: Array.from({ length: 12 }, (_, i) => 2 ** 31 - 1 - i), a: 2 ** 31 - 1, b: -(2 ** 31), width: 32 });
    });
  }
  it("toBits uses two's complement", () => {
    expect(toBits(5, 4).join("")).toBe("0101");
    expect(toBits(-5, 8).join("")).toBe("11111011");
    expect(toBits(-1, 32).join("")).toBe("1".repeat(32));
  });
  it("single-number ends on the odd-count value", () => {
    const frames = check("single-number", { values: [4, 1, 2, 1, 2] });
    expect(frames[frames.length - 1]!.state.vars.result).toBe(4);
  });
  it("normalise tolerates loose input", () => {
    const n = bitsFamily.normalise!;
    expect(n({ a: "12", b: 10.7, values: ["1", "x", 3] })).toEqual({ a: 12, b: 10, values: [1, 3], width: undefined });
    expect(n({ values: [] }).values).toBeUndefined();
    expect(n({ x: 3, y: 4, bits: 8 })).toEqual({ a: 3, b: 4, values: undefined, width: 8 });
  });
});

describe("bits generator fixes", () => {
  const run = (algo: string, raw: Record<string, unknown>) => bitsFamily.algorithms[algo]!(bitsFamily.normalise!(raw));
  it("shift tags real overflow only: -5 << 1 is exact, 127 << 1 wraps to -2", () => {
    const frames = run("shift", { values: [5, -5, 127] });
    const left = frames.filter((fr) => fr.tag === "shift-left" || fr.tag === "overflow");
    const neg = left.filter((fr) => fr.state.vars.x === -5);
    expect(neg.map((fr) => fr.tag)).toEqual(["shift-left", "shift-left"]);
    expect(neg.map((fr) => fr.state.vars["x << k"])).toEqual([-10, -20]);
    const big = left.filter((fr) => fr.state.vars.x === 127);
    expect(big.map((fr) => fr.tag)).toEqual(["overflow", "overflow"]);
    expect(big[0]!.state.vars["x << k"]).toBe(-2);
    for (const fr of neg) expect(fr.note).not.toContain("overflow");
  });
  it("shift can show successive right shifts only, filling unsigned values with 0", () => {
    const frames = run("shift", { a: 13, left: [], right: 4 });
    expect(frames.some((fr) => fr.tag === "shift-left" || fr.tag === "overflow")).toBe(false);
    const rights = frames.filter((fr) => fr.tag === "shift-right");
    expect(rights.map((fr) => fr.state.rows.at(-1)!.dec)).toEqual(["6", "3", "1", "0"]);
    expect(frames[0]!.state.width).toBe(4);
  });
  it("and-or-xor runs the add-without-plus carry loop to 5 + 3 = 8", () => {
    const frames = run("and-or-xor", { a: 5, b: 3, ops: ["xor", "and"], carry: true });
    expect(frames.some((fr) => fr.state.rows.some((r) => r.label === "a | b"))).toBe(false);
    const carries = frames.filter((fr) => fr.tag === "carry");
    expect(carries[0]!.state.rows.find((r) => r.label === "(a & b) << 1")!.dec).toBe("2");
    expect(carries[0]!.note).toContain("6 + 2 = 8");
    expect(frames.at(-1)!.state.vars.sum).toBe(8);
  });
  it("and-or-xor with b = -a shows lowbit: 12 & -12 = 4", () => {
    const frames = run("and-or-xor", { a: 12, b: -12, ops: ["and"] });
    expect(frames.some((fr) => fr.state.rows.some((r) => r.label === "-a = ~a + 1" && r.bits.join("") === "11110100"))).toBe(true);
    const result = frames.find((fr) => fr.tag === "result")!;
    expect(result.state.vars.result).toBe(4);
    expect(result.note).toContain("lowbit(12) = 4");
  });
  it("count-bits leading-zeros mode tracks the longest run for HyperLogLog", () => {
    const frames = run("count-bits", { mode: "leading-zeros", width: 8, values: [178, 75, 41, 220, 75, 23, 99, 150] });
    expect(frames.filter((fr) => fr.tag === "duplicate").length).toBe(1);
    const last = frames.at(-1)!.state.vars;
    expect(last["longest run R"]).toBe(3);
    expect(last["distinct hashes"]).toBe(7);
    expect(frames.some((fr) => fr.note.includes("x & (x − 1)"))).toBe(false);
  });
  it("subset-mask says 'bit 0 is set' for a single bit", () => {
    const notes = run("subset-mask", { values: [1, 2, 3] }).map((fr) => fr.note);
    expect(notes.some((n) => n.includes("bit 0 is set"))).toBe(true);
    expect(notes.some((n) => /bits \d+ are set/.test(n))).toBe(false);
  });
});
