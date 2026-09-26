import { useMemo, useState } from "react";
import { PageTitle } from "../components/ui";
import { catalogue } from "../viz/registry";
import { VizFromSpec } from "../viz/VizBlock";
import { cn } from "../lib/utils";

/** Every registered visualisation, runnable with its example input and editable JSON. */
export default function VizGallery() {
  const cat = useMemo(() => catalogue(), []);
  const [type, setType] = useState(cat[0]?.type ?? "array");
  const family = cat.find((c) => c.type === type);
  const [algo, setAlgo] = useState(family?.algorithms[0] ?? "");
  const currentAlgo = family?.algorithms.includes(algo) ? algo : (family?.algorithms[0] ?? "");
  const example = family?.family.examples[currentAlgo] ?? {};
  const [json, setJson] = useState<string | null>(null);
  const specText = json ?? JSON.stringify({ type, algorithm: currentAlgo, ...(example as object) }, null, 2);
  const spec = useMemo(() => {
    try {
      return JSON.parse(specText) as { type: string };
    } catch {
      return null;
    }
  }, [specText]);
  const total = cat.reduce((n, c) => n + c.algorithms.length, 0);
  return (
    <div>
      <PageTitle title="Visualisations" subtitle={`${total} steppable animations across ${cat.length} families. Pick one, then edit the JSON to change the input; lessons embed these with the same JSON.`} />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {cat.map((c) => (
          <button
            key={c.type}
            onClick={() => {
              setType(c.type);
              setAlgo(c.algorithms[0] ?? "");
              setJson(null);
            }}
            className={cn("rounded-full border px-3 py-1 text-sm", c.type === type ? "border-accent bg-accent/10" : "border-line text-muted hover:text-fg")}
          >
            {c.family.name} ({c.algorithms.length})
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {family?.algorithms.map((a) => (
          <button
            key={a}
            onClick={() => {
              setAlgo(a);
              setJson(null);
            }}
            className={cn("rounded-md border px-2 py-0.5 text-xs", a === currentAlgo ? "border-accent bg-accent/10" : "border-line text-muted hover:text-fg")}
          >
            {family.family.labels?.[a] ?? a}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>{spec ? <VizFromSpec spec={spec} /> : <p className="text-sm text-danger">Invalid JSON.</p>}</div>
        <textarea value={specText} onChange={(e) => setJson(e.target.value)} spellCheck={false} className="h-80 w-full rounded-lg border border-line bg-code p-2 font-mono text-xs outline-none focus:border-accent" aria-label="Visualisation JSON" />
      </div>
    </div>
  );
}
