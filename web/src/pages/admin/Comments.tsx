import { useState } from "react";
import { Link } from "react-router";
import { Badge, Button, ErrorBox, PageTitle, Spinner } from "../../components/ui";
import { adminApi, fmtDateTime, targetHref, useAdminAction, useAdminComments } from "../../lib/admin";
import { Pager } from "./common";

const LIMIT = 50;

export default function Comments() {
  const [offset, setOffset] = useState(0);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const q = useAdminComments({ include_deleted: includeDeleted, offset, limit: LIMIT });
  const remove = useAdminAction((id: string) => adminApi.deleteComment(id));
  return (
    <div>
      <PageTitle
        title="Comments"
        subtitle="Every discussion comment, newest first. Removing one blanks its text, as its author deleting it would; replies keep their place."
        actions={
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => {
                setIncludeDeleted(e.target.checked);
                setOffset(0);
              }}
            />
            Show removed
          </label>
        }
      />
      {(q.error || remove.error) && <ErrorBox error={q.error ?? remove.error} className="mb-4" />}
      {!q.data ? (
        <Spinner className="mt-10" />
      ) : (
        <>
          <ul className="space-y-3">
            {q.data.items.map((c) => (
              <li key={c.id} className="rounded-xl border border-line bg-elev p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  {c.author_id ? (
                    <Link className="font-medium text-fg hover:text-accent" to={`/admin/users/${c.author_id}`}>
                      {c.author_name} <span className="font-normal text-muted">{c.author_email}</span>
                    </Link>
                  ) : (
                    <span>deleted user</span>
                  )}
                  <span>on</span>
                  <Link className="text-accent hover:underline" to={targetHref(c.target_kind, c.target_slug)}>
                    {c.target_slug}
                  </Link>
                  {c.parent_id && <Badge>reply</Badge>}
                  <span>{fmtDateTime(c.created_at)}</span>
                  {c.deleted ? (
                    <Badge className="ml-auto">removed</Badge>
                  ) : (
                    <Button variant="ghost" className="ml-auto px-2 py-1 text-xs text-danger" disabled={remove.isPending} onClick={() => confirm("Remove this comment's text?") && remove.mutate(c.id)}>
                      Remove
                    </Button>
                  )}
                </div>
                {!c.deleted && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{c.body}</p>}
              </li>
            ))}
          </ul>
          {q.data.items.length === 0 && <p className="text-sm text-muted">No comments.</p>}
          <Pager total={q.data.total} offset={q.data.offset} limit={q.data.limit} onChange={setOffset} />
        </>
      )}
    </div>
  );
}
