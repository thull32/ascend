import { useSearchParams } from "react-router";
import { ErrorBox, PageTitle, Spinner } from "../../components/ui";
import { useAdminReports, type ReportStatus } from "../../lib/admin";
import { Pager, Select } from "./common";
import { ReportItems } from "./ReportItems";

const LIMIT = 50;

export default function Reports() {
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") ?? "open") as ReportStatus | "all";
  const offset = Number(params.get("offset") ?? 0) || 0;
  const set = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, String(v));
    if (!("offset" in patch)) next.delete("offset");
    setParams(next, { replace: true });
  };
  const q = useAdminReports({ status: status === "all" ? undefined : status, offset, limit: LIMIT });
  return (
    <div>
      <PageTitle
        title="Problem reports"
        subtitle="What learners flagged in lessons and problems. Fix the content in the repo, then mark the report resolved. Closed reports are kept for a year."
        actions={
          <Select<ReportStatus | "all">
            label="Show"
            value={status}
            onChange={(v) => set({ status: v })}
            options={[["open", "Open"], ["resolved", "Resolved"], ["dismissed", "Dismissed"], ["all", "All"]]}
          />
        }
      />
      {q.error && <ErrorBox error={q.error} />}
      {!q.data ? (
        <Spinner className="mt-10" />
      ) : q.data.items.length === 0 ? (
        <p className="text-sm text-muted">{status === "open" ? "Nothing open. Learners report problems from the foot of each lesson and problem." : "None."}</p>
      ) : (
        <>
          <ReportItems reports={q.data.items} />
          <Pager total={q.data.total} offset={q.data.offset} limit={q.data.limit} onChange={(o) => set({ offset: o })} />
        </>
      )}
    </div>
  );
}
