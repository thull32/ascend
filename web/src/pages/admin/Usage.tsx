import { useState } from "react";
import { Link } from "react-router";
import { Card, ErrorBox, PageTitle, Spinner } from "../../components/ui";
import { fmt, useAdminUsage } from "../../lib/admin";
import { BarChart } from "./BarChart";
import { Section, Select, Stat, Table, Td } from "./common";

/** Every day in the window, so quiet days show as zero rather than vanish. */
function fill<T extends { day: string }>(rows: T[], days: number, zero: (day: string) => T): T[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: T[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i)).toISOString().slice(0, 10);
    out.push(byDay.get(d) ?? zero(d));
  }
  return out;
}

const compact = (n: number) => (n >= 1e6 ? `${Math.round(n / 1e5) / 10}M` : n >= 1e3 ? `${Math.round(n / 100) / 10}k` : String(n));

export default function Usage() {
  const [days, setDays] = useState("30");
  const q = useAdminUsage(Number(days));
  return (
    <div>
      <PageTitle
        title="AI usage"
        subtitle="Model calls for the coach, quizzes, roadmaps and interviews, per UTC day. Counters are kept 90 days."
        actions={<Select label="Window" value={days} onChange={setDays} options={[["7", "7 days"], ["30", "30 days"], ["90", "90 days"]]} />}
      />
      {q.error && <ErrorBox error={q.error} />}
      {!q.data ? (
        <Spinner className="mt-10" />
      ) : (
        <Body data={q.data} />
      )}
    </div>
  );
}

function Body({ data }: { data: NonNullable<ReturnType<typeof useAdminUsage>["data"]> }) {
  const rows = fill(data.by_day, data.days, (day) => ({ day, users: 0, requests: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 }));
  const sum = (k: "requests" | "input_tokens" | "output_tokens" | "cache_read_tokens") => rows.reduce((s, r) => s + r[k], 0);
  const input = sum("input_tokens");
  const cached = sum("cache_read_tokens");
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Requests" value={fmt(sum("requests"))} />
        <Stat label="Input tokens" value={compact(input)} />
        <Stat label="Cached input read" value={compact(cached)} sub={input + cached > 0 ? `${Math.round((cached / (input + cached)) * 100)}% of input from cache` : undefined} />
        <Stat label="Output tokens" value={compact(sum("output_tokens"))} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <BarChart title="Requests" bars={rows.map((r) => ({ label: r.day, value: r.requests }))} />
        </Card>
        <Card>
          <BarChart title="Output tokens" bars={rows.map((r) => ({ label: r.day, value: r.output_tokens }))} format={compact} />
        </Card>
        <Card>
          <BarChart title="Learners using AI" summable={false} bars={rows.map((r) => ({ label: r.day, value: r.users }))} />
        </Card>
      </div>
      <Section title="Heaviest users">
        {data.top_users.length === 0 ? (
          <p className="text-sm text-muted">No AI use in this window.</p>
        ) : (
          <Table head={["Account", "Requests", "Input tokens", "Output tokens"]}>
            {data.top_users.map((u) => (
              <tr key={u.id}>
                <Td>
                  <Link className="font-medium hover:text-accent" to={`/admin/users/${u.id}`}>
                    {u.display_name}
                  </Link>
                  <div className="text-xs text-muted">{u.email}</div>
                </Td>
                <Td className="tabular-nums">{fmt(u.requests)}</Td>
                <Td className="tabular-nums">{fmt(u.input_tokens)}</Td>
                <Td className="tabular-nums">{fmt(u.output_tokens)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
