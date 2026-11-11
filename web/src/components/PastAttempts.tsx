// A learner's own graded attempts at one exercise or problem, newest first,
// with a way back into the editor. The server keeps them (see the privacy
// page for how long), so they follow the learner across devices.
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, History } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Submission } from "../lib/types";
import { cn, timeAgo } from "../lib/utils";
import { Button, ErrorBox, Spinner } from "./ui";

export const pastAttemptsKey = (userId: string | undefined, targetSlug: string) => ["submissions", userId, targetSlug] as const;

const LANG_LABEL: Record<string, string> = { python: "Python", javascript: "JavaScript", typescript: "TypeScript" };

interface Props {
  targetSlug: string;
  /** Languages the editor offers here; attempts in others cannot be loaded. */
  languages: string[];
  onLoad: (s: Submission) => void;
}

export function PastAttempts({ targetSlug, languages, onLoad }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const q = useQuery({
    queryKey: pastAttemptsKey(user?.id, targetSlug),
    queryFn: () => api.get<Submission[]>(`/submissions/${encodeURIComponent(targetSlug)}`),
    enabled: open && !!user,
    staleTime: 30_000,
  });
  if (!user) return null;
  return (
    <div className="border-t border-line" data-testid="past-attempts">
      <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted hover:text-fg" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <History className="h-3.5 w-3.5" />
        Your past attempts
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          {q.error ? (
            <ErrorBox error={q.error} />
          ) : !q.data ? (
            <Spinner className="my-2" />
          ) : q.data.length === 0 ? (
            <p className="text-xs text-muted">No graded attempts yet. Each time you run the tests while signed in, the attempt is saved here.</p>
          ) : (
            <>
              <ul className="space-y-1.5">
                {q.data.map((s) => (
                  <li key={s.id} className="rounded-lg border border-line text-xs">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5">
                      <span className={cn("font-medium tabular-nums", s.passed ? "text-success" : "text-warn")}>
                        {s.passed ? "Passed" : "Failed"} {s.passed_count}/{s.total_count}
                      </span>
                      <span className="text-muted">{LANG_LABEL[s.language] ?? s.language}</span>
                      <span className="text-muted" title={new Date(s.created_at).toLocaleString()}>
                        {timeAgo(s.created_at)}
                      </span>
                      <span className="ml-auto flex gap-1">
                        <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => setShown((x) => (x === s.id ? null : s.id))} aria-expanded={shown === s.id}>
                          {shown === s.id ? "Hide code" : "Show code"}
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-2 py-0.5 text-xs"
                          disabled={!languages.includes(s.language)}
                          title={languages.includes(s.language) ? undefined : "This exercise no longer offers that language"}
                          onClick={() => onLoad(s)}
                        >
                          Load into editor
                        </Button>
                      </span>
                    </div>
                    {shown === s.id && <pre className="max-h-72 overflow-auto border-t border-line bg-code p-2.5 font-mono text-[11px] leading-relaxed">{s.code}</pre>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">Your 20 most recent. Attempts older than 180 days are deleted, except your latest and your latest passing one.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
