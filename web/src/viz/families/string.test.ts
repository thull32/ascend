import { describe, expect, it } from "vitest";
import { MAX_FRAMES } from "../engine";
import { stringFamily, type StringInput } from "./string";

const check = (algo: string, input: StringInput) => {
  const frames = stringFamily.algorithms[algo]!(input);
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.length).toBeLessThanOrEqual(MAX_FRAMES + 1);
  for (const fr of frames) expect(fr.note.trim().length).toBeGreaterThan(0);
  return frames;
};

describe("string family", () => {
  const algos = Object.keys(stringFamily.algorithms);
  it("implements the catalogue", () => {
    expect(algos.sort()).toEqual(["anagram-window", "expand-palindrome", "kmp", "rabin-karp", "reverse-words", "run-length", "z-algorithm"].sort());
    for (const a of algos) {
      expect(stringFamily.examples[a]).toBeDefined();
      expect(stringFamily.labels?.[a]).toBeDefined();
    }
  });
  for (const algo of algos) {
    it(`${algo}: example and edge inputs`, () => {
      check(algo, stringFamily.examples[algo]!);
      check(algo, { text: "", pattern: "" });
      check(algo, { text: "a", pattern: "a" });
      check(algo, { text: "a".repeat(40), pattern: "a".repeat(20) });
      check(algo, { text: "abc", pattern: "abcdef" });
      check(algo, { text: "ab ".repeat(13), pattern: "ba" });
    });
  }
  it("finds kmp matches and reports them in the final note", () => {
    const frames = check("kmp", { text: "abababca", pattern: "abab" });
    expect(frames[frames.length - 1]!.note).toContain("0, 2");
  });
  it("normalise tolerates loose input", () => {
    const n = stringFamily.normalise!;
    expect(n({ text: 12345, pattern: null })).toEqual({ text: "12345", pattern: undefined });
    expect(n({ s: "x".repeat(100) }).text.length).toBe(40);
    expect(n({ values: ["a", "b"], target: "ab" })).toEqual({ text: "ab", pattern: "ab" });
    expect(n({})).toEqual({ text: "", pattern: undefined });
  });
});
