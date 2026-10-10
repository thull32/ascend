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

describe("string fixes", () => {
  it("run-length writes runs of one bare, and each frame's count matches its note", () => {
    const frames = check("run-length", { text: "aaabccdddd" });
    expect(frames.at(-1)!.state.vars.encoded).toBe("a3bc2d4");
    for (const f of frames.filter((x) => x.tag === "extend" || x.tag === "emit")) expect(f.note).toContain(`count ${f.state.vars.count}`);
  });

  it("z-algorithm keeps a closed box and never moves it on an empty match", () => {
    const frames = check("z-algorithm", { text: "aabxaab" });
    const boxes = frames.filter((f) => f.tag === "box").map((f) => f.state.vars.box);
    expect(boxes).toEqual(["[1, 1]", "[4, 6]"]);
    expect(frames.at(-1)!.state.vars.z).toEqual([7, 1, 0, 0, 3, 1, 0]);
  });

  it("rabin-karp takes the lesson's base and modulus and hashes digits by value", () => {
    const frames = check("rabin-karp", { text: "3141592653", pattern: "59", base: 10, mod: 13 });
    expect(frames[0]!.state.vars["hash(pattern)"]).toBe(7);
    const hashes = frames.filter((f) => f.tag === "skip" || f.tag === "candidate").map((f) => f.state.vars["hash(window)"]);
    expect(hashes).toEqual([5, 1, 2, 2, 7, 1, 0, 0, 1]);
  });

  it("expand-palindrome tries every centre", () => {
    const frames = check("expand-palindrome", { text: "abacabad" });
    expect(frames.filter((f) => f.tag === "centre")).toHaveLength(15);
    expect(frames.at(-1)!.note).toContain('"abacaba"');
  });

  it("kmp slides the pattern on a partial mismatch without moving i", () => {
    const frames = check("kmp", { text: "ushehershers", pattern: "hers" });
    expect(frames.some((f) => f.tag === "shift")).toBe(true);
    expect(frames.at(-1)!.note).toContain("4, 8");
  });
});
