import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Badge, ErrorBox, PageTitle, Spinner } from "../../components/ui";
import { fmtDate, useAdminUsers, type UserSort } from "../../lib/admin";
import { timeAgo } from "../../lib/utils";
import { inputClass, Pager, Select, Table, Td } from "./common";

const LIMIT = 50;

export default function Users() {
  // Filters live in the URL, so a filtered list can be bookmarked and the
  // back button returns to it from a learner's page.
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const role = params.get("role") ?? "";
  const sort = (params.get("sort") as UserSort) || "newest";
  const offset = Number(params.get("offset") ?? 0) || 0;
  const [text, setText] = useState(q);
  const set = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === "" || v === 0) next.delete(k);
      else next.set(k, String(v));
    }
    if (!("offset" in patch)) next.delete("offset");
    setParams(next, { replace: true });
  };
  useEffect(() => {
    const t = setTimeout(() => text !== q && set({ q: text }), 250);
    return () => clearTimeout(t);
  }, [text]);

  const users = useAdminUsers({ q, role, sort, offset, limit: LIMIT });
  return (
    <div>
      <PageTitle title="Users" subtitle="Every account. Open one to see its progress, usage and sessions, or to act on it." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className={`${inputClass} w-full sm:w-72`} placeholder="Search email or name" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search users" />
        <Select label="Role" value={role} onChange={(v) => set({ role: v })} options={[["", "Any role"], ["user", "Learners"], ["admin", "Admins"]]} />
        <Select<UserSort>
          label="Sort"
          value={sort}
          onChange={(v) => set({ sort: v === "newest" ? "" : v })}
          options={[["newest", "Newest"], ["oldest", "Oldest"], ["last_active", "Recently active"], ["lessons", "Most lessons"], ["email", "Email"]]}
        />
      </div>
      {users.error && <ErrorBox error={users.error} />}
      {!users.data ? (
        <Spinner className="mt-10" />
      ) : (
        <>
          <Table head={["Account", "Role", "Joined", "Last active", "Lessons", "Problems", "Status"]}>
            {users.data.items.map((u) => (
              <tr key={u.id} className="hover:bg-elev-2/50">
                <Td>
                  <Link to={`/admin/users/${u.id}`} className="font-medium hover:text-accent">
                    {u.display_name}
                  </Link>
                  <div className="text-xs text-muted">{u.email}</div>
                </Td>
                <Td>{u.role === "admin" ? <Badge className="text-accent">admin</Badge> : <span className="text-muted">learner</span>}</Td>
                <Td className="whitespace-nowrap">{fmtDate(u.created_at)}</Td>
                <Td className="whitespace-nowrap">{u.last_active ? fmtDate(`${u.last_active}T12:00:00Z`) : <span className="text-muted">never</span>}</Td>
                <Td className="tabular-nums">{u.lessons_completed}</Td>
                <Td className="tabular-nums">{u.problems_solved}</Td>
                <Td className="whitespace-nowrap text-xs text-muted">
                  {u.email_verified ? "verified" : "unverified"} · {u.onboarded ? "onboarded" : "not onboarded"}
                  {u.last_login_at && <div>signed in {timeAgo(u.last_login_at)}</div>}
                </Td>
              </tr>
            ))}
          </Table>
          {users.data.items.length === 0 && <p className="mt-4 text-sm text-muted">No accounts match.</p>}
          <Pager total={users.data.total} offset={users.data.offset} limit={users.data.limit} onChange={(o) => set({ offset: o })} />
        </>
      )}
    </div>
  );
}
