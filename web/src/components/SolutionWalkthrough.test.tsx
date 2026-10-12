// Problem walkthroughs step through a recorded run of the solution
// (content/problem-walkthroughs/<slug>.trace.json): every trace must load,
// point at real lines of its code, and drive the player.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { traceSteps, type SolutionTrace } from "./SolutionWalkthrough";
import { VizPlayer } from "../viz/VizPlayer";

// Tests run from web/.
const DIR = join(process.cwd(), "../content/problem-walkthroughs");
const traces = readdirSync(DIR)
  .filter((n) => n.endsWith(".trace.json"))
  .map((n) => [n, JSON.parse(readFileSync(join(DIR, n), "utf8")) as SolutionTrace] as const);

describe("problem walkthrough traces", () => {
  it("exist", () => {
    expect(traces.length).toBeGreaterThan(0);
  });

  it.each(traces)("%s points at lines of its own code", (_name, trace) => {
    const lines = trace.code.replace(/\n$/, "").split("\n").length;
    for (const f of trace.frames) {
      expect(f.line).toBeGreaterThanOrEqual(1);
      expect(f.line).toBeLessThanOrEqual(lines);
      expect(f.stack.length).toBeGreaterThan(0);
    }
  });
});

describe("traceSteps", () => {
  const trace: SolutionTrace = {
    problem: "p",
    code: "def f(a):\n    b = a + 1\n    return b\n",
    args: [1],
    result: "2",
    frames: [
      { line: 2, stack: ["f"], vars: { a: "1" } },
      { line: 3, stack: ["f"], vars: { a: "1", b: "2" } },
      { line: 3, stack: ["f"], vars: { a: "1", b: "2" }, ret: "2" },
    ],
  };

  it("marks what the last line changed and names returns", () => {
    const steps = traceSteps(trace);
    expect(steps.map((s) => s.state.changed)).toEqual([[], ["b"], []]);
    expect(steps[0]!.note).toBe("Line 2 is about to run");
    expect(steps[2]!.note).toBe("f returns 2");
  });

  it("renders the code with the current line marked", async () => {
    const { TraceViewForTest } = await import("./SolutionWalkthrough");
    const { container } = render(
      <VizPlayer frames={traceSteps(trace)} input={trace.code.trimEnd().split("\n")} Renderer={TraceViewForTest} title="t" />,
    );
    const current = container.querySelector("[data-current]");
    expect(current?.textContent).toContain("b = a + 1");
  });
});
