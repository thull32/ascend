// Live-coding block used by lessons (exercise fences) and reused by the
// Problem page. Runs tests in a worker, shows per-test results, persists a
// submission when signed in, and can hand the code to the coach.
import { CheckCircle2, ChevronDown, Lightbulb, Play, RotateCcw, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useInvalidateProgress } from "../lib/queries";
import type { ExerciseSpec, TestCase } from "../lib/types";
import { cn } from "../lib/utils";
import { onRunnerStatus, runTests, warmRunner } from "../runner";
import type { RunResponse, TestResult } from "../runner/protocol";
import { CodeEditor, type Language } from "./CodeEditor";
import { Button, ErrorBox } from "./ui";
import { useCoachDock } from "./CoachDock";
import { Markdown } from "./Markdown";

interface Props {
  source: string;
  lessonSlug?: string;
}

export default function ExerciseBlock({ source, lessonSlug }: Props) {
  const spec = useMemo<ExerciseSpec | null>(() => {
    try {
      return JSON.parse(source) as ExerciseSpec;
    } catch {
      return null;
    }
  }, [source]);
  if (!spec) return <ErrorBox error="Malformed exercise block" />;
  return (
    <section className="not-prose my-8" data-testid="exercise">
      <h3 className="mb-1 text-lg font-semibold">Exercise: {spec.title}</h3>
      <div className="prose-ascend prose prose-sm mb-3 max-w-none text-muted">
        <ExercisePrompt text={spec.prompt} />
      </div>
      <CodeRunner
        targetKind="exercise"
        targetSlug={lessonSlug ? `${lessonSlug}#${spec.id}` : spec.id}
        entry={spec.entry}
        languages={spec.languages}
        starter={spec.starter}
        tests={spec.tests}
        hints={spec.hints}
        timeLimitMs={spec.time_limit_ms}
        coachContext={lessonSlug ? { kind: "lesson", slug: lessonSlug } : undefined}
      />
    </section>
  );
}

function ExercisePrompt({ text }: { text: string }) {
  return <Markdown source={text} />;
}

export interface CodeRunnerProps {
  targetKind: "exercise" | "problem";
  targetSlug: string;
  entry: string | Record<string, string>;
  languages: string[];
  starter: Record<string, string>;
  tests: TestCase[];
  hints: string[];
  timeLimitMs: number;
  coachContext?: { kind: "lesson" | "problem"; slug: string };
  height?: string;
  onPassed?: () => void;
  /** Called on every code change; used by the interview room. */
  onCodeChange?: (code: string, language: Language) => void;
  /** Disable the coach hand-off (solo interview mode). */
  noCoach?: boolean;
}

const LANG_LABEL: Record<string, string> = { python: "Python", javascript: "JavaScript", typescript: "TypeScript" };

function storageKey(slug: string, lang: string) {
  return `ascend:code:${slug}:${lang}`;
}

export function CodeRunner(props: CodeRunnerProps) {
  const { user } = useAuth();
  const invalidate = useInvalidateProgress();
  const dock = useCoachDock();
  const langs = props.languages.filter((l) => l in props.starter) as Language[];
  const preferred = (user?.preferred_language ?? "python") as Language;
  const [language, setLanguage] = useState<Language>(langs.includes(preferred) ? preferred : (langs[0] ?? "python"));
  const [code, setCode] = useState<string>(() => load(props.targetSlug, language, props.starter));
  const [result, setResult] = useState<RunResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const [showHidden, setShowHidden] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const runId = useRef(0);

  useEffect(() => {
    warmRunner(language);
    return onRunnerStatus(language, (m) => setStatus(m === "ready" ? null : m));
  }, [language]);

  useEffect(() => {
    setCode(load(props.targetSlug, language, props.starter));
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, props.targetSlug]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(props.targetSlug, language), code);
    } catch {
      /* ignore */
    }
    props.onCodeChange?.(code, language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, language]);

  const entry = typeof props.entry === "string" ? props.entry : (props.entry[language] ?? Object.values(props.entry)[0] ?? "solution");

  const run = async () => {
    const id = ++runId.current;
    setRunning(true);
    setResult(null);
    setSaved(null);
    try {
      const res = await runTests(language, code, entry, props.tests, props.timeLimitMs);
      if (id !== runId.current) return;
      setResult(res);
      const passedCount = res.results.filter((r) => r.passed).length;
      if (user && !res.compileError) {
        try {
          await api.post("/submissions", {
            target_kind: props.targetKind,
            target_slug: props.targetSlug,
            language,
            code,
            passed_count: passedCount,
            total_count: props.tests.length,
            runtime_ms: Math.round(res.totalMs),
            results: res.results.map((r) => ({ i: r.index, p: r.passed, e: r.error ?? null })),
          });
          setSaved(passedCount === props.tests.length ? "Solved and saved to your progress." : "Attempt saved.");
          invalidate();
        } catch {
          setSaved("Could not save this attempt.");
        }
      }
      if (passedCount === props.tests.length && res.results.length > 0) props.onPassed?.();
    } finally {
      if (id === runId.current) setRunning(false);
    }
  };

  const reset = () => {
    setCode(props.starter[language] ?? "");
    setResult(null);
  };

  const passed = result ? result.results.filter((r) => r.passed).length : 0;
  const total = props.tests.length;
  const allPassed = !!result && !result.compileError && passed === total;

  return (
    <div className="rounded-xl border border-line bg-elev">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <div className="flex gap-1">
          {langs.map((l) => (
            <button
              key={l}
              onClick={() => setLanguage(l)}
              className={cn("rounded-md px-2.5 py-1 text-xs font-medium", l === language ? "bg-elev-2 text-fg" : "text-muted hover:text-fg")}
            >
              {LANG_LABEL[l] ?? l}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted">{status ?? `${total} tests · ${Math.round(props.timeLimitMs / 1000)}s limit`}</span>
        <Button variant="ghost" onClick={reset} title="Reset to starter code" className="px-2">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button onClick={run} disabled={running} data-testid="run-tests">
          <Play className="h-4 w-4" /> {running ? "Running…" : "Run tests"}
        </Button>
      </div>
      <CodeEditor value={code} onChange={setCode} language={language} height={props.height ?? "340px"} />
      {result && (
        <div className="border-t border-line px-3 py-3" data-testid="results">
          {result.compileError ? (
            <pre className="whitespace-pre-wrap rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">{result.compileError}</pre>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                <span className={cn("flex items-center gap-1.5 font-medium", allPassed ? "text-success" : "text-warn")}>
                  {allPassed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {passed} / {total} passed
                </span>
                <span className="text-xs text-muted">{Math.round(result.totalMs)} ms</span>
                {saved && <span className="text-xs text-muted">{saved}</span>}
                {!user && <span className="text-xs text-muted">Sign in to save attempts.</span>}
              </div>
              <ul className="space-y-1.5">
                {result.results.map((r) => (
                  <TestRow key={r.index} r={r} reveal={showHidden} />
                ))}
              </ul>
              {result.results.some((r) => r.hidden && !r.passed) && !showHidden && (
                <button className="mt-2 text-xs text-accent" onClick={() => setShowHidden(true)}>
                  Reveal hidden test inputs
                </button>
              )}
            </>
          )}
        </div>
      )}
      {(props.hints.length > 0 || (props.coachContext && !props.noCoach)) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
          {props.hints.length > 0 && hintsShown < props.hints.length && (
            <Button variant="ghost" onClick={() => setHintsShown((h) => h + 1)}>
              <Lightbulb className="h-4 w-4" /> Hint {hintsShown + 1} of {props.hints.length}
            </Button>
          )}
          {props.coachContext && !props.noCoach && user && (
            <Button
              variant="ghost"
              onClick={() => dock.open({ ...props.coachContext!, code, language }, "I'm stuck on this exercise. Can you ask me a question that helps me find the next step (no full solution)?")}
            >
              Ask the coach
            </Button>
          )}
        </div>
      )}
      {hintsShown > 0 && (
        <ol className="space-y-1 border-t border-line px-4 py-3 text-sm">
          {props.hints.slice(0, hintsShown).map((h, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-muted">{i + 1}.</span>
              <span>{h}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function load(slug: string, lang: string, starter: Record<string, string>): string {
  try {
    const v = localStorage.getItem(storageKey(slug, lang));
    if (v) return v;
  } catch {
    /* ignore */
  }
  return starter[lang] ?? "";
}

function TestRow({ r, reveal }: { r: TestResult; reveal: boolean }) {
  const [open, setOpen] = useState(false);
  const hiddenMasked = r.hidden && !reveal;
  return (
    <li className={cn("rounded-lg border px-2.5 py-1.5 text-xs", r.passed ? "border-success/30" : "border-danger/40 bg-danger/5")}>
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((o) => !o)} disabled={hiddenMasked && r.passed}>
        {r.passed ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-danger" />}
        <span className="font-medium">
          Test {r.index + 1}
          {r.label ? ` · ${r.label}` : ""}
          {r.hidden ? " · hidden" : ""}
        </span>
        <span className="ml-auto text-muted">{r.ms.toFixed(1)} ms</span>
        {!(hiddenMasked && r.passed) && <ChevronDown className={cn("h-3.5 w-3.5 text-muted transition-transform", open && "rotate-180")} />}
      </button>
      {open && !(hiddenMasked && r.passed) && (
        <div className="mt-2 space-y-1 font-mono">
          {!hiddenMasked && (
            <>
              <div>
                <span className="text-muted">input: </span>
                {fmt(r.args)}
              </div>
              <div>
                <span className="text-muted">expected: </span>
                {fmt(r.expected)}
              </div>
            </>
          )}
          {r.error ? (
            <div className="whitespace-pre-wrap text-danger">{r.error}</div>
          ) : (
            <div>
              <span className="text-muted">got: </span>
              {fmt(r.actual)}
            </div>
          )}
          {r.stdout && <pre className="mt-1 max-h-32 overflow-auto rounded bg-code p-2 text-muted">{r.stdout}</pre>}
        </div>
      )}
    </li>
  );
}

function fmt(v: unknown): string {
  const s = JSON.stringify(v);
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
}
