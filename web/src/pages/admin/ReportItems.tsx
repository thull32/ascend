import { useState } from "react";
import { Link } from "react-router";
import { Badge, Button, ErrorBox } from "../../components/ui";
import { adminApi, fmtDateTime, reportCategoryLabel, targetHref, useAdminAction, type ReportRow, type ReportStatus } from "../../lib/admin";
import { cn, timeAgo } from "../../lib/utils";

/** The reporter's attempt; the code is fetched, and audited, only when opened. */
function Attempt({ a }: { a: NonNullable<ReportRow["attempt"]> }) {
  const open = useAdminAction(() => adminApi.submissionCode(a.id));
  const [shown, setShown] = useState(false);
  const toggle = () => {
    if (shown) return setShown(false);
    if (open.data) return setShown(true);
    open.mutate(undefined, { onSuccess: () => setShown(true) });
  };
  return (
    <div className="mt-3 rounded-lg border border-line text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5">
        <span className="text-muted">Their latest attempt:</span>
        <span className={cn("font-medium tabular-nums", a.passed ? "text-success" : "text-warn")}>
          {a.passed ? "passed" : "failed"} {a.passed_count}/{a.total_count}
        </span>
        <span className="text-muted">{a.language}</span>
        <span className="text-muted" title={fmtDateTime(a.created_at)}>
          {timeAgo(a.created_at)}
        </span>
        <Button variant="ghost" className="ml-auto px-2 py-0.5 text-xs" disabled={open.isPending} onClick={toggle} aria-expanded={shown} title="Each opening is recorded in the audit log">
          {shown ? "Hide code" : open.isPending ? "Opening…" : "View code"}
        </Button>
      </div>
      {open.error ? <ErrorBox error={open.error} className="m-2" /> : null}
      {shown && <pre className="max-h-80 overflow-auto border-t border-line bg-code p-2.5 font-mono leading-relaxed">{open.data?.code}</pre>}
    </div>
  );
}

/** Problem reports as cards, with the actions to close or reopen each. */
export function ReportItems({ reports, showReporter = true }: { reports: ReportRow[]; showReporter?: boolean }) {
  const update = useAdminAction(({ id, status }: { id: string; status: ReportStatus }) => adminApi.setReportStatus(id, status));
  return (
    <ul className="space-y-3">
      {reports.map((r) => (
        <li key={r.id} className={cn("rounded-xl border border-line bg-elev p-4", r.status !== "open" && "opacity-75")} data-testid="report">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge className={cn(r.category === "mistake" || r.category === "broken" ? "text-danger" : "text-muted")}>{reportCategoryLabel[r.category]}</Badge>
            <Link className="font-medium hover:text-accent" to={targetHref(r.target_kind, r.target_slug)}>
              {r.target_title ?? r.target_slug}
            </Link>
            <span className="text-xs text-muted">{r.target_kind}</span>
            <span className="ml-auto text-xs text-muted" title={fmtDateTime(r.created_at)}>
              {timeAgo(r.created_at)}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{r.message}</p>
          {r.attempt && <Attempt a={r.attempt} />}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
            {showReporter &&
              (r.reporter_id ? (
                <Link className="hover:text-accent" to={`/admin/users/${r.reporter_id}`}>
                  {r.reporter_name} · {r.reporter_email}
                </Link>
              ) : (
                <span>account deleted</span>
              ))}
            {r.status !== "open" && (
              <span>
                {r.status} {r.closed_at && timeAgo(r.closed_at)}
                {r.closed_by && ` by ${r.closed_by}`}
              </span>
            )}
            <span className="ml-auto flex gap-1">
              {r.status === "open" ? (
                <>
                  <Button variant="secondary" className="px-2 py-1 text-xs" disabled={update.isPending} onClick={() => update.mutate({ id: r.id, status: "resolved" })}>
                    Resolved
                  </Button>
                  <Button variant="ghost" className="px-2 py-1 text-xs" disabled={update.isPending} onClick={() => update.mutate({ id: r.id, status: "dismissed" })}>
                    Dismiss
                  </Button>
                </>
              ) : (
                <Button variant="ghost" className="px-2 py-1 text-xs" disabled={update.isPending} onClick={() => update.mutate({ id: r.id, status: "open" })}>
                  Reopen
                </Button>
              )}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
