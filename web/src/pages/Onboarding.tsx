import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { useCurriculum, useSetModulePreference } from "../lib/queries";
import { Button, ErrorBox, Spinner } from "../components/ui";
import { cn } from "../lib/utils";

const COMPANIES = ["Netflix", "Google", "Meta", "Amazon", "Apple", "Microsoft", "Stripe", "Other top-tier"];
const LEVELS = ["Senior engineer", "Staff engineer", "Not sure yet"];

export default function Onboarding() {
  const { user, update } = useAuth();
  const curriculum = useCurriculum();
  const setPref = useSetModulePreference();
  const navigate = useNavigate();
  const [company, setCompany] = useState(user?.target_company ?? "Netflix");
  const [level, setLevel] = useState(user?.target_level ?? "Senior engineer");
  const [hours, setHours] = useState(user?.weekly_hours ?? 8);
  const [language, setLanguage] = useState(user?.preferred_language ?? "python");
  const [confident, setConfident] = useState<Set<string>>(new Set());
  const [step, setStep] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (!curriculum.data) return <Spinner className="mt-20" />;
  const modules = curriculum.data.tracks.filter((t) => t.phase <= 2).flatMap((t) => t.modules.map((m) => ({ ...m, track: t.title })));

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await update({ target_company: company, target_level: level, weekly_hours: hours, preferred_language: language as "python", onboarded: true });
      await Promise.all([...confident].map((slug) => setPref.mutateAsync({ slug, preference: "confident" })));
      navigate("/roadmap", { replace: true });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl py-6">
      <p className="text-xs uppercase tracking-wide text-muted">Step {step + 1} of 3</p>
      {step === 0 && (
        <section>
          <h1 className="mt-1 text-2xl font-semibold">Where are you headed?</h1>
          <p className="mt-1 text-sm text-muted">The coach and the roadmap use this to calibrate the bar.</p>
          <h2 className="mt-6 text-sm font-medium">Target company</h2>
          <Chips options={COMPANIES} value={company} onChange={setCompany} />
          <h2 className="mt-6 text-sm font-medium">Target level</h2>
          <Chips options={LEVELS} value={level} onChange={setLevel} />
          <h2 className="mt-6 text-sm font-medium">Preferred language for exercises</h2>
          <Chips options={["python", "javascript", "typescript"]} value={language} onChange={(v) => setLanguage(v as "python")} />
          <div className="mt-8">
            <Button onClick={() => setStep(1)}>Continue</Button>
          </div>
        </section>
      )}
      {step === 1 && (
        <section>
          <h1 className="mt-1 text-2xl font-semibold">How much time each week?</h1>
          <p className="mt-1 text-sm text-muted">Be honest; the roadmap estimates your finish date from this.</p>
          <div className="mt-6 flex items-center gap-4">
            <input type="range" min={2} max={30} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="flex-1 accent-[var(--accent)]" aria-label="Weekly hours" />
            <span className="w-24 text-right font-mono text-lg">{hours} h/week</span>
          </div>
          <div className="mt-8 flex gap-2">
            <Button variant="secondary" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button onClick={() => setStep(2)}>Continue</Button>
          </div>
        </section>
      )}
      {step === 2 && (
        <section>
          <h1 className="mt-1 text-2xl font-semibold">What do you already know well?</h1>
          <p className="mt-1 text-sm text-muted">Mark modules you are confident in. They stay available but drop out of your roadmap. You can change this any time.</p>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {modules.map((m) => {
              const on = confident.has(m.slug);
              return (
                <li key={m.slug}>
                  <button
                    onClick={() =>
                      setConfident((s) => {
                        const n = new Set(s);
                        if (on) n.delete(m.slug);
                        else n.add(m.slug);
                        return n;
                      })
                    }
                    className={cn("w-full rounded-lg border px-3 py-2 text-left text-sm", on ? "border-accent bg-accent/10" : "border-line hover:bg-elev-2")}
                  >
                    <div className="font-medium">{m.title}</div>
                    <div className="text-xs text-muted">{m.track}</div>
                  </button>
                </li>
              );
            })}
          </ul>
          {error ? <ErrorBox error={error} className="mt-4" /> : null}
          <div className="mt-8 flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={finish} disabled={busy}>
              Build my roadmap
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function Chips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} className={cn("rounded-full border px-3 py-1.5 text-sm", o === value ? "border-accent bg-accent/10 text-fg" : "border-line text-muted hover:text-fg")}>
          {o}
        </button>
      ))}
    </div>
  );
}
