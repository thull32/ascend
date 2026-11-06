import { Card, ErrorBox, PageTitle, Spinner } from "../../components/ui";
import { fmt, useAdminOverview } from "../../lib/admin";
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
        <Stat label="Signed in now" value={fmt(t.live_sessions)} sub="unexpired sessions" />
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
      <p className="mt-4 text-xs text-muted">{fmt(t.comments)} comments are live. The last 30 days are shown; hover a column for its day.</p>
    </div>
  );
}
