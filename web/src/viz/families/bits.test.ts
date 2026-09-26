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
