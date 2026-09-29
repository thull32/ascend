// @vitest-environment node
// The browser's comparison rule against the corpus every implementation
// shares (crates/grader/conformance.json): the server records its own
// verdict, so a learner must never see a pass here and a fail there.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matches } from "./harness";

interface Case {
  expected: unknown;
  actual: unknown;
  any_order?: boolean;
  match: boolean;
}
const corpus = JSON.parse(readFileSync(new URL("../../../crates/grader/conformance.json", import.meta.url), "utf8")) as { cases: Case[] };

describe("comparison conformance", () => {
  it.each(corpus.cases.map((c, i) => [i, c] as const))("case %i", (_i, c) => {
    expect(matches(c.expected, c.actual, !!c.any_order)).toBe(c.match);
  });
});
