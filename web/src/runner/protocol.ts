// Messages between the UI and the runner workers. Both workers speak the
// same protocol so the Exercise/Problem components don't care which language
// is executing.
import type { TestCase } from "../lib/types";

export interface RunRequest {
  id: number;
  kind: "run";
  code: string;
  entry: string;
  tests: TestCase[];
  timeLimitMs: number;
}

export interface EvalRequest {
  id: number;
  kind: "eval";
  code: string;
  timeLimitMs: number;
}

export type RunnerRequest = RunRequest | EvalRequest;

export interface TestResult {
  index: number;
  passed: boolean;
  label?: string | null;
  hidden: boolean;
  args: unknown[];
  expected: unknown;
  actual?: unknown;
  error?: string;
  stdout?: string;
  ms: number;
}

export interface RunResponse {
  id: number;
  kind: "run";
  results: TestResult[];
  compileError?: string;
  totalMs: number;
  /** JavaScript runner: the code after TypeScript stripping, which is what
   *  the server grades for a TypeScript submission. */
  compiled?: string;
}

export interface EvalResponse {
  id: number;
  kind: "eval";
  stdout: string;
  error?: string;
  ms: number;
}

export interface ReadyResponse {
  id: -1;
  kind: "ready";
}

export interface StatusResponse {
  id: -1;
  kind: "status";
  message: string;
}

export type RunnerResponse = RunResponse | EvalResponse | ReadyResponse | StatusResponse;
