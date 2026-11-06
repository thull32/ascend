import { useState } from "react";
import { ErrorBox, PageTitle, Spinner } from "../../components/ui";
import { useAdminAudit } from "../../lib/admin";
import { AuditTable, Pager } from "./common";

const LIMIT = 50;

export default function Audit() {
  const [offset, setOffset] = useState(0);
  const q = useAdminAudit({ offset, limit: LIMIT });
  return (
    <div>
      <PageTitle title="Audit log" subtitle="Every change made through the admin dashboard or the operator token, newest first. Kept for a year; it stores no email addresses or comment text." />
      {q.error && <ErrorBox error={q.error} />}
      {!q.data ? (
        <Spinner className="mt-10" />
      ) : q.data.items.length === 0 ? (
        <p className="text-sm text-muted">No changes yet.</p>
      ) : (
        <>
          <AuditTable entries={q.data.items} />
          <Pager total={q.data.total} offset={q.data.offset} limit={q.data.limit} onChange={setOffset} />
        </>
      )}
    </div>
  );
}
