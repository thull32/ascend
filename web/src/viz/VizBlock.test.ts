// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseSpec, runSpec } from "./VizBlock";
import type { VizSpec } from "./engine";

describe("malformed visualisation blocks become warnings, not crashes", () => {
  it("accepts only JSON objects", () => {
    for (const bad of ["", "not json", "null", "42", '"text"', "[1,2]"]) expect(parseSpec(bad)).toBeNull();
    expect(parseSpec('{"type":"array"}')).toEqual({ type: "array" });
  });

  it("reports a missing or unknown type", () => {
    expect(runSpec({} as VizSpec)).toEqual({ error: 'Visualisation block has no "type".' });
    expect("error" in runSpec({ type: "nope", algorithm: "x" })).toBe(true);
  });

  it("never resolves names through Object.prototype", () => {
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(runSpec({ type: name, algorithm: "x" })).toEqual({ error: `Unknown visualisation type "${name}".` });
      const result = runSpec({ type: "array", algorithm: name });
      expect("error" in result && result.error.startsWith(`Unknown array algorithm "${name}"`)).toBe(true);
    }
  });

  it("turns inputs that break a family's normaliser or generator into an error", () => {
    const hostile = [
      { type: "array", algorithm: "binary-search", values: "not an array", target: { nested: true } },
      { type: "graph", algorithm: "dijkstra", nodes: "A,B", edges: 7 },
      { type: "tree", algorithm: "bst-insert", values: [null, {}, "x"] },
      { type: "dp", algorithm: "lcs", a: 12, b: null },
      { type: "hash-table", algorithm: "chaining", operations: [["set"], 5, null] },
    ];
    for (const spec of hostile) {
      const result = runSpec(spec as unknown as VizSpec);
      // Either the input was sanitised into something renderable or the
      // failure is reported; it must never throw.
      expect("frames" in result || "error" in result).toBe(true);
    }
  });
});
