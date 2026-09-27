// "Tell the coach what you already know": free text in, reviewable roadmap
// suggestions out. The model proposes; the learner decides (nothing changes
// until they press Apply).
import { Check, Sparkles } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { useCoachStatus, useSetModulePreference } from "../lib/queries";
import { cn } from "../lib/utils";
import { Button, ErrorBox } from "./ui";

interface Suggestion {
  module: string;
  preference: "confident" | "priority";
  reason: string;
}

export function RoadmapPersonaliser({ moduleTitles }: { moduleTitles: Record<string, string> }) {
  const status = useCoachStatus();
  const setPref = useSetModulePreference();
  const [open, setOpen] = useState(false);
  const [background, setBackground] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<{ summary: string; suggestions: Suggestion[] } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState(false);

  if (!status.data?.enabled) return null;

  const suggest = async () => {
    setBusy(true);
    setError(null);
    setApplied(false);
    try {
      const r = await api.post<{ summary: string; suggestions: Suggestion[] }>("/coach/roadmap-suggestions", { background });
      setResult(r);
      setSelected(new Set(r.suggestions.map((s) => s.module)));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!result) return;
    setBusy(true);
    try {
      for (const s of result.suggestions.filter((s) => selected.has(s.module))) {
        await setPref.mutateAsync({ slug: s.module, preference: s.preference });
      }
      setApplied(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-8 rounded-xl border border-accent/40 bg-accent/5 p-4" data-testid="roadmap-personaliser">
      <button className="flex w-full items-center gap-2 text-left font-medium" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Sparkles className="h-4 w-4 text-accent" /> Tell the coach what you already know
        <span className="ml-auto text-xs text-muted">{open ? "Hide" : "Personalise with AI"}</span>
      </button>
      {open && (
        <div className="mt-3">
          <p className="text-sm text-muted">
            Describe your experience in your own words. The coach suggests modules to skip and modules to prioritise, with a reason for each. Nothing changes until you apply.
          </p>
          <textarea
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="e.g. 4 years of backend work in Go and Postgres; I've built REST APIs and Kafka consumers, but I've never done DP problems and I freeze on system design interviews."
            className="mt-3 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            data-testid="background-input"
          />
          <Button className="mt-2" onClick={suggest} disabled={busy || background.trim().length < 20}>
            {busy && !result ? "Thinking…" : "Suggest changes"}
          </Button>
          {error ? <ErrorBox error={error} className="mt-3" /> : null}
          {result && (
            <div className="mt-4">
              <p className="text-sm">{result.summary}</p>
              {result.suggestions.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No changes suggested: the default roadmap fits.</p>
              ) : (
                <ul className="mt-3 space-y-2" data-testid="roadmap-suggestions">
                  {result.suggestions.map((s) => (
                    <li key={s.module}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-elev px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selected.has(s.module)}
                          onChange={() =>
                            setSelected((prev) => {
                              const n = new Set(prev);
                              if (n.has(s.module)) n.delete(s.module);
                              else n.add(s.module);
                              return n;
                            })
                          }
                        />
                        <span className="min-w-0">
                          <span className={cn("mr-2 rounded px-1.5 py-0.5 text-[10px] uppercase", s.preference === "confident" ? "bg-success/20 text-success" : "bg-accent/20 text-accent")}>
                            {s.preference === "confident" ? "skip" : "priority"}
                          </span>
                          <span className="font-medium">{moduleTitles[s.module] ?? s.module}</span>
                          <span className="mt-0.5 block text-muted">{s.reason}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {result.suggestions.length > 0 && (
                <div className="mt-3 flex items-center gap-3">
                  <Button onClick={apply} disabled={busy || selected.size === 0 || applied}>
                    <Check className="h-4 w-4" /> Apply {selected.size} change{selected.size === 1 ? "" : "s"}
                  </Button>
                  {applied && <span className="text-sm text-success">Applied. Your roadmap below is updated.</span>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
