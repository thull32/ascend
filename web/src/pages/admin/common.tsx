import type { ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "../../components/ui";
import { cn } from "../../lib/utils";
import type { AuditEntry } from "../../lib/admin";
import { fmtDateTime } from "../../lib/admin";

/** A headline number. */
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-elev p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-line", className)}>
      <table className="w-full text-left text-sm">
        <thead className="bg-elev-2 text-xs text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cn("px-3 py-2 align-top", className)}>{children}</td>;

export function Pager({ total, offset, limit, onChange }: { total: number; offset: number; limit: number; onChange: (offset: number) => void }) {
  if (total <= limit) return <p className="mt-2 text-xs text-muted">{total.toLocaleString()} in all</p>;
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-muted">
      <span>
        {(offset + 1).toLocaleString()}–{Math.min(total, offset + limit).toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
          Previous
        </Button>
        <Button variant="secondary" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>
          Next
        </Button>
      </div>
    </div>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

const ACTIONS: Record<string, string> = {
  set_role: "Changed role",
  sign_out_everywhere: "Signed out everywhere",
  delete_user: "Deleted account",
  send_password_reset: "Sent password reset",
  delete_comment: "Removed comment",
  create_invite: "Created invite",
  revoke_invite: "Revoked invite",
  set_report_status: "Updated report",
};

function describe(e: AuditEntry): string {
  const d = e.detail as Record<string, unknown>;
  switch (e.action) {
    case "set_role":
      return `${String(d.from)} → ${String(d.to)}`;
    case "sign_out_everywhere":
      return `${String(d.sessions)} session(s)`;
    case "delete_comment":
      return `on ${String(d.target_kind)} ${String(d.target_slug)}`;
    case "create_invite":
      return `${String(d.uses)} use(s)${d.days ? `, ${String(d.days)} days` : ""}${d.note ? ` · ${String(d.note)}` : ""}`;
    case "revoke_invite":
      return `invite ${String(d.invite)}`;
    case "set_report_status":
      return `${String(d.from)} → ${String(d.to)} · ${String(d.target_kind)} ${String(d.target_slug)}`;
    default:
      return "";
  }
}

export function AuditTable({ entries, showTarget = true }: { entries: AuditEntry[]; showTarget?: boolean }) {
  return (
    <Table head={["When", "Who", "What", ...(showTarget ? ["Account"] : []), "Detail"]}>
      {entries.map((e) => (
        <tr key={e.id}>
          <Td className="whitespace-nowrap text-muted">{fmtDateTime(e.created_at)}</Td>
          <Td>{e.actor_label}</Td>
          <Td className="whitespace-nowrap">{ACTIONS[e.action] ?? e.action}</Td>
          {showTarget && (
            <Td>
              {e.target_id ? (
                e.target_email ? (
                  <Link className="text-accent hover:underline" to={`/admin/users/${e.target_id}`}>
                    {e.target_email}
                  </Link>
                ) : (
                  <span className="font-mono text-xs text-muted" title="This account no longer exists">
                    {e.target_id.slice(0, 8)} (deleted)
                  </span>
                )
              ) : (
                <span className="text-muted">—</span>
              )}
            </Td>
          )}
          <Td className="text-muted">{describe(e)}</Td>
        </tr>
      ))}
    </Table>
  );
}

/** A select styled like the app's inputs. */
export function Select<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <span className="sr-only sm:not-sr-only">{label}</span>
      <select className="rounded-lg border border-line bg-elev px-2.5 py-2 text-sm text-fg" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export const inputClass = "rounded-lg border border-line bg-elev px-3 py-2 text-sm text-fg placeholder:text-muted";
