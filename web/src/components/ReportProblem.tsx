import { Check, Flag } from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/utils";
import { Button, ErrorBox } from "./ui";

const CATEGORIES = [
  ["mistake", "Something is wrong", "A wrong answer, a bug in an example, a false claim"],
  ["broken", "Something is broken", "A visualisation, exercise or audio that doesn't work"],
  ["unclear", "Hard to follow", "An explanation that skips a step or loses you"],
  ["other", "Something else", ""],
] as const;

type Category = (typeof CATEGORIES)[number][0];

/** "Report a problem" under a lesson or problem: goes to the admin queue. */
export function ReportProblem({ kind, slug }: { kind: "lesson" | "problem"; slug: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("mistake");
  const [message, setMessage] = useState("");
  const send = useMutation({
    mutationFn: () => api.post<{ id: string }>("/reports", { target_kind: kind, target_slug: slug, category, message }),
    onSuccess: () => setMessage(""),
  });
  if (!user) return null;

  if (send.isSuccess && !open) {
    return (
      <p className="mt-8 flex items-center gap-1.5 text-sm text-muted" role="status">
        <Check className="h-4 w-4 text-success" /> Thanks, we got your report. We read every one.
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-8 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg" data-testid="report-problem">
        <Flag className="h-4 w-4" /> Spotted a problem? Report it
      </button>
    );
  }
  const tooShort = message.trim().length < 10;
  return (
    <form
      className="mt-8 rounded-xl border border-line bg-elev p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!tooShort) send.mutate(undefined, { onSuccess: () => setOpen(false) });
      }}
    >
      <h2 className="flex items-center gap-1.5 font-semibold">
        <Flag className="h-4 w-4" /> Report a problem with this {kind}
      </h2>
      <fieldset className="mt-3 grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">What kind of problem?</legend>
        {CATEGORIES.map(([value, label, hint]) => (
          <label key={value} className={cn("flex cursor-pointer gap-2 rounded-lg border p-2.5 text-sm", category === value ? "border-accent bg-elev-2" : "border-line hover:bg-elev-2")}>
            <input type="radio" name="category" value={value} checked={category === value} onChange={() => setCategory(value)} className="mt-0.5 accent-[var(--color-accent)]" />
            <span>
              <span className="font-medium">{label}</span>
              {hint && <span className="block text-xs text-muted">{hint}</span>}
            </span>
          </label>
        ))}
      </fieldset>
      <label className="mt-3 block text-sm">
        <span className="text-muted">What did you notice? Where in the {kind} is it?</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={2000}
          required
          className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="e.g. In the second worked example, step 3 says the window shrinks, but the code grows it."
        />
      </label>
      <p className="mt-1 text-xs text-muted">
        Only the Ascend team sees reports, with your name and email so we can follow up.
        {kind === "problem" && " Your latest graded attempt at this problem is attached, so we can check it if the problem is the tests."}
      </p>
      {send.error ? <ErrorBox error={send.error} className="mt-2" /> : null}
      <div className="mt-3 flex gap-2">
        <Button type="submit" disabled={send.isPending || tooShort}>
          Send report
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
