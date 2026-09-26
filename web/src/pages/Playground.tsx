import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { CodeEditor, type Language } from "../components/CodeEditor";
import { Button, PageTitle } from "../components/ui";
import { evalCode, onRunnerStatus, warmRunner } from "../runner";
import { cn } from "../lib/utils";

const SAMPLES: Record<Language, string> = {
  python: `# Runs in your browser (Pyodide). Try the standard library.\nimport heapq\n\nh = []\nfor x in [5, 1, 8, 3]:\n    heapq.heappush(h, x)\nprint([heapq.heappop(h) for _ in range(len(h))])\n`,
  javascript: `// Runs in a sandboxed Web Worker.\nconst counts = new Map();\nfor (const w of "the quick the lazy the".split(" ")) counts.set(w, (counts.get(w) ?? 0) + 1);\nconsole.log([...counts].sort((a, b) => b[1] - a[1]));\n`,
  typescript: `// TypeScript is stripped with sucrase, then run.\ntype Interval = [number, number];\nfunction merge(xs: Interval[]): Interval[] {\n  const s = [...xs].sort((a, b) => a[0] - b[0]);\n  const out: Interval[] = [];\n  for (const [a, b] of s) {\n    const last = out[out.length - 1];\n    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]);\n  }\n  return out;\n}\nconsole.log(merge([[1,3],[2,6],[8,10],[9,12]]));\n`,
};

export default function Playground() {
  const [language, setLanguage] = useState<Language>("python");
  const [code, setCode] = useState(SAMPLES.python);
  const [out, setOut] = useState<{ stdout: string; error?: string; ms: number } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    warmRunner(language);
    return onRunnerStatus(language, (m) => setStatus(m === "ready" ? null : m));
  }, [language]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title="Playground" subtitle="Scratch space that runs Python, JavaScript or TypeScript entirely in your browser. Nothing is sent to a server." />
      <div className="mb-2 flex items-center gap-2">
        {(["python", "javascript", "typescript"] as Language[]).map((l) => (
          <button
            key={l}
            onClick={() => {
              setLanguage(l);
              setCode(SAMPLES[l]);
              setOut(null);
            }}
            className={cn("rounded-md px-2.5 py-1 text-xs font-medium", l === language ? "bg-elev-2 text-fg" : "text-muted hover:text-fg")}
          >
            {l}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted">{status}</span>
        <Button
          onClick={async () => {
            setBusy(true);
            setOut(await evalCode(language, code));
            setBusy(false);
          }}
          disabled={busy}
          data-testid="run"
        >
          <Play className="h-4 w-4" /> Run
        </Button>
      </div>
      <CodeEditor value={code} onChange={setCode} language={language} height="360px" />
      {out && (
        <pre className={cn("mt-3 max-h-80 overflow-auto rounded-lg border border-line bg-code p-3 text-xs", out.error && "border-danger/40")} data-testid="output">
          {out.stdout}
          {out.error && <span className="text-danger">{out.error}</span>}
          {"\n"}
          <span className="text-muted">— {Math.round(out.ms)} ms</span>
        </pre>
      )}
    </div>
  );
}
