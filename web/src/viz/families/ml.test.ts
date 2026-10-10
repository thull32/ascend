import { describe, expect, it } from "vitest";
import type { MlInput, MlState } from "./ml";
import { mlFamily } from "./ml";

const run = (algo: string, input: Record<string, unknown> = {}) => {
  const raw = { ...(mlFamily.examples[algo] ?? {}), ...input };
  return mlFamily.algorithms[algo]!(mlFamily.normalise!(raw) as MlInput);
};
const last = <T>(xs: T[]) => xs[xs.length - 1]!;
const vars = (s: MlState) => s.vars as Record<string, unknown>;

describe("agent-loop", () => {
  it("default PR task: the token total is the sum of every call, not the last call", () => {
    const frames = run("agent-loop");
    const done = last(frames);
    // 340 + 390 + 480 input tokens across the three model calls.
    expect(done.note).toContain("≈ 1,210 input tokens across all calls");
    expect(done.note).toContain("the last call sent only ≈ 480");
    expect(vars(done.state)["input sent so far"]).toBe("1,210");
  });

  it("default PR task: the count comes from a tool result, the model never counts", () => {
    const frames = run("agent-loop");
    const observations = frames.filter((f) => f.tag === "observe").map((f) => f.note);
    expect(observations.some((n) => n.includes("count 4: #412, #418, #421, #430"))).toBe(true);
    const answer = frames.find((f) => f.tag === "answer")!;
    expect(answer.note).not.toMatch(/computes the answer itself/);
  });

  it("a lesson script shows its own task, refusals and untrusted results", () => {
    const frames = run("agent-loop", {
      text: "Summarise my inbox",
      calls: [
        { call: "read_email(5)", result: "hidden instruction", untrusted: true, input: 1000 },
        { call: "send_email(x)", check: "recipient not allowed", denied: true, result: "denied", input: 1500 },
      ],
      final: { answer: "Five new emails.", input: 1800 },
    });
    expect(frames[0]!.note).toContain('Task: "Summarise my inbox"');
    expect(frames.some((f) => f.tag === "refuse" && f.note.includes("send_email(x) is refused"))).toBe(true);
    expect(frames.some((f) => f.tag === "observe" && f.note.includes("written by an outsider"))).toBe(true);
    expect(last(frames).note).toContain("≈ 4,300 input tokens across all calls");
    expect(last(frames).note).toContain("(1 refused)");
  });

  it("compact mode is one frame per iteration and can stop without an answer", () => {
    const frames = run("agent-loop", { compact: true, calls: [{ call: "a()", result: "x", input: 100 }, { call: "b()", result: "y", input: 200 }], stop: "Stopped." });
    expect(frames.map((f) => f.tag)).toEqual([undefined, "iteration", "iteration", "stop", "done"]);
    expect(last(frames).note).toContain("≈ 300 input tokens across all calls");
  });
});

describe("kv-cache", () => {
  it("generates as the lesson table: 12 K/V computations without the cache, 5 with, 15 scores", () => {
    const frames = run("kv-cache");
    expect(frames).toHaveLength(4);
    const v = vars(last(frames).state);
    expect(v["K/V computed (no cache)"]).toBe(12);
    expect(v["K/V computed (with cache)"]).toBe(5);
    expect(v["attention scores"]).toBe(15);
  });

  it("paged mode allocates a new block only when the last one is full", () => {
    const frames = run("kv-cache", { mode: "paged", blockSize: 2 });
    const blocks = frames.map((f) => vars(f.state)["blocks allocated"]);
    expect(blocks.slice(0, 3)).toEqual([2, 2, 3]);
  });

  it("prompt-cache mode reads the prefix and computes only the new tokens", () => {
    const frames = run("kv-cache", { mode: "prompt-cache" });
    const hit = frames.find((f) => vars(f.state)["K/V computed (request 2)"] !== undefined)!;
    expect(vars(hit.state)["K/V read from cache"]).toBe(3);
    expect(vars(hit.state)["K/V computed (request 2)"]).toBe(6);
    expect(vars(hit.state)["without prompt caching"]).toBe(9);
  });
});

describe("logistic-regression", () => {
  it("on centred separable data the loss falls every frame while ‖w‖ keeps growing", () => {
    const frames = run("logistic-regression", {
      steps: 40,
      every: 4,
      lr: 0.5,
      points: [[-3, -1.5, 0], [-2, -2.5, 0], [-2, -0.5, 0], [-1, -1, 0], [1, 1.5, 1], [2, 0.5, 1], [2, 2.5, 1], [3, 1.5, 1]],
    });
    const steps = frames.filter((f) => f.tag === "step");
    const loss = steps.map((f) => Number(vars(f.state).loss));
    const norm = steps.map((f) => Number(vars(f.state)["‖w‖"]));
    for (let i = 1; i < steps.length; i++) {
      expect(loss[i]!).toBeLessThan(loss[i - 1]!);
      expect(norm[i]!).toBeGreaterThan(norm[i - 1]!);
    }
    for (const f of steps) expect(vars(f.state).accuracy).toBe("8/8");
  });
});

describe("speculative-decoding", () => {
  it("counts the target's bonus token after an all-accepted round", () => {
    const done = last(run("speculative-decoding", { k: 4 }));
    expect(done.note).toContain("9 tokens from 2 target passes (4.50 per pass)");
  });
});

describe("fine-tuning", () => {
  it("states LoRA's size and the learning-rate ratio correctly", () => {
    const frames = run("fine-tuning");
    expect(frames[0]!.note).toContain("about 20M parameters, 0.3% of the model");
    expect(frames.some((f) => f.note.includes("a twentieth"))).toBe(true);
    expect(frames.some((f) => f.note.includes("a tenth"))).toBe(false);
  });
});

describe("next-token-sampling with a grammar mask", () => {
  it("zeroes disallowed tokens and renormalises the rest", () => {
    const frames = run("next-token-sampling", { text: '{"verdict": "', tokens: ["maybe", "hire", "no", "strong", "\\n", "Sure"], logits: [2, 1.5, 1, 0.5, -1, -2], allowed: ["hire", "no"] });
    const mask = frames.find((f) => f.tag === "mask")!;
    expect(mask.note).toContain('"hire" 0.622, "no" 0.378');
    expect(frames[0]!.note).not.toContain("Paris");
  });
});

describe("vector-search-hnsw", () => {
  it("reports neighbour checks and the distinct nodes they touch", () => {
    const v = vars(last(run("vector-search-hnsw")).state);
    expect(v["neighbour distance checks"]).toBe(10);
    expect(v["distinct nodes measured"]).toBe(8);
  });
});

describe("rag-pipeline", () => {
  it("records a span per stage when asked", () => {
    const frames = run("rag-pipeline", { spans: true });
    const log = last(frames).state.log ?? [];
    expect(log.some((l) => l.includes("vector.knn"))).toBe(true);
    expect(log.some((l) => l.includes("chat"))).toBe(true);
  });
});

describe("embeddings-similarity", () => {
  it("can stop at the similarity table without the analogy frame", () => {
    const frames = run("embeddings-similarity", { analogy: false });
    expect(frames.some((f) => f.tag === "analogy")).toBe(false);
  });
});

describe("linear-regression", () => {
  it("shows MSE to three decimals (0.175 on the batch-job data)", () => {
    const frames = run("linear-regression", { points: [[1, 3], [2, 5], [3, 8], [4, 9]] });
    expect(frames.find((f) => f.tag === "residuals")!.note).toContain("MSE = 0.175");
  });
});

describe("rag-pipeline with a planted instruction", () => {
  it("puts the injected line into the prompt as attacker-written text", () => {
    const frames = run("rag-pipeline", { inject: true });
    const prompt = frames.find((f) => f.tag === "prompt")!;
    const cells = prompt.state.tokens![0]!.cells;
    expect(cells.some((c) => c.tone === "danger" && c.text.includes("ignore your instructions"))).toBe(true);
    expect(prompt.note).toContain("written by whoever last edited that document");
  });
});
