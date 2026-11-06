import { Link } from "react-router";
import { Button, Card, ErrorBox, PageTitle, Spinner } from "../../components/ui";
import { adminApi, fmt, fmtDate, fmtDateTime, useAdminAction, useAdminDigest, useAdminOverview } from "../../lib/admin";
import { BarChart } from "./BarChart";
import { Stat } from "./common";

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");

export default function Overview() {
  const q = useAdminOverview();
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <Spinner className="mt-16" />;
  const { totals: t, daily } = q.data;
  return (
    <div>
      <PageTitle title="Admin" subtitle="Accounts, learning and usage across Ascend. Days are UTC except active learners, which count each learner's own day." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Accounts" value={fmt(t.users)} sub={`+${fmt(t.users_new_7d)} this week · +${fmt(t.users_new_30d)} in 30 days`} />
        <Stat label="Active learners" value={fmt(t.active_7d)} sub={`last 7 days · ${fmt(t.active_1d)} today · ${fmt(t.active_30d)} in 30 days`} />
        <Stat label="Onboarded" value={pct(t.users_onboarded, t.users)} sub={`${fmt(t.users_verified)} verified emails · ${fmt(t.admins)} admin(s)`} />
        <Link to="/admin/reports" className="rounded-xl hover:ring-1 hover:ring-accent">
          <Stat label="Open problem reports" value={fmt(t.reports_open)} sub="from learners, in lessons and problems" />
        </Link>
        <Stat label="Lessons completed" value={fmt(t.lessons_completed)} sub={`across ${fmt(q.data.lessons_total)} lessons`} />
        <Stat label="Graded submissions" value={fmt(t.submissions)} sub={`${fmt(t.submissions_7d)} this week`} />
        <Stat label="Quiz attempts" value={fmt(t.quiz_attempts)} sub={`${fmt(t.interviews)} mock interviews`} />
        <Stat label="AI today" value={fmt(t.ai_requests_today)} sub={`requests · ${fmt(t.ai_input_tokens_today)} in / ${fmt(t.ai_output_tokens_today)} out tokens`} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <BarChart title="Sign-ups" bars={daily.map((d) => ({ label: d.day, value: d.signups }))} />
        </Card>
        <Card>
          <BarChart title="Active learners" summable={false} bars={daily.map((d) => ({ label: d.day, value: d.active }))} />
        </Card>
        <Card>
          <BarChart title="Graded submissions" bars={daily.map((d) => ({ label: d.day, value: d.submissions }))} />
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted">
        {fmt(t.comments)} comments are live and {fmt(t.live_sessions)} sessions unexpired. The last 30 days are shown; hover a column for its day.
      </p>
      <Digest />
    </div>
  );
}

/** The Monday email: whether it reaches this admin, and what it would say. */
function Digest() {
  const q = useAdminDigest();
  const toggle = useAdminAction((on: boolean) => adminApi.setDigest(on));
  if (!q.data) return q.error ? <ErrorBox error={q.error} className="mt-6" /> : null;
  const d = q.data;
  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Weekly email</h2>
          <p className="mt-1 text-sm text-muted">
            {d.mail_enabled ? (
              <>
                Mondays at 16:00 UTC, to every admin who has it on. Next: {fmtDateTime(d.next_send)}.
                {d.last_sent && ` Last sent for the week of ${fmtDate(`${d.last_sent.week}T12:00:00Z`)} to ${d.last_sent.recipients} admin(s).`}
              </>
            ) : (
              <span className="text-warn">Email is not set up on this server (RESEND_API_KEY and EMAIL_FROM), so nothing is sent.</span>
            )}
          </p>
        </div>
        {d.subscribed !== null && (
          <Button variant="secondary" disabled={toggle.isPending} onClick={() => toggle.mutate(!d.subscribed)}>
            {d.subscribed ? "Turn off for me" : "Turn on for me"}
          </Button>
        )}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-accent">Preview, with the last seven days</summary>
        <div className="mt-2 rounded-lg border border-line bg-bg p-3 text-sm">
          <p className="font-medium">{d.preview.subject}</p>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-muted">{d.preview.text}</pre>
        </div>
      </details>
    </Card>
  );
}
