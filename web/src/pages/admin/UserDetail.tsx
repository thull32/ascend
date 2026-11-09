import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Badge, Button, Card, Crumbs, ErrorBox, PageTitle, Progress, Spinner } from "../../components/ui";
import { adminApi, fmt, fmtDate, fmtDateTime, useAdminAction, useAdminUser, type UserDetail as Detail } from "../../lib/admin";
import { useAuth } from "../../lib/auth";
import { useCurriculum, useFeatures } from "../../lib/queries";
import { cn } from "../../lib/utils";
import { AuditTable, inputClass, Section, Stat, Table, Td } from "./common";
import { ReportItems } from "./ReportItems";

export default function UserDetail() {
  const { id = "" } = useParams();
  const q = useAdminUser(id);
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <Spinner className="mt-16" />;
  return <Page d={q.data} />;
}

function Page({ d }: { d: Detail }) {
  const a = d.account;
  const p = d.progress;
  const curriculum = useCurriculum();
  const trackTitle = (slug: string) => curriculum.data?.tracks.find((t) => t.slug === slug)?.title ?? slug;
  return (
    <div>
      <Crumbs items={[{ to: "/admin/users", label: "Users" }, { label: a.display_name }]} />
      <PageTitle
        title={
          <span className="flex items-center gap-3">
            {a.display_name}
            {a.role === "admin" && <Badge className="text-accent">admin</Badge>}
          </span>
        }
        subtitle={a.email}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Field label="Joined" value={fmtDateTime(a.created_at)} />
            <Field
              label="Invite"
              value={
                d.invite ? (
                  <Link className="hover:text-accent" to={`/admin/users?invite=${d.invite.invite_id}`}>
                    {d.invite.note || <span className="font-mono text-xs">{d.invite.invite_id}</span>}
                  </Link>
                ) : (
                  "none (open sign-up)"
                )
              }
            />
            <Field label="Last sign-in" value={fmtDateTime(a.last_login_at)} />
            <Field label="Email" value={a.email_verified_at ? `verified ${fmtDate(a.email_verified_at)}` : "not verified"} />
            <Field label="Onboarded" value={a.onboarded_at ? fmtDate(a.onboarded_at) : "not yet"} />
            <Field label="Target" value={`${a.target_level ?? "—"} at ${a.target_company ?? "—"}`} />
            <Field label="Weekly hours" value={String(a.weekly_hours)} />
            <Field label="Language" value={a.preferred_language} />
            <Field label="Time zone" value={a.timezone ?? "UTC"} />
            <Field label="Account id" value={<span className="font-mono text-xs">{a.id}</span>} />
          </dl>
        </Card>
        <Actions d={d} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Lessons" value={`${p.lessons_completed} / ${p.lessons_total}`} sub={`${p.lessons_in_progress} in progress`} />
        <Stat label="Problems solved" value={`${p.problems_solved} / ${p.problems_total}`} />
        <Stat label="Quizzes passed" value={p.quizzes_passed} />
        <Stat label="Streak" value={`${p.streak_days} d`} sub={`${p.xp} XP`} />
        <Stat label="Review" value={d.counts.review_items} sub={`${d.counts.review_due} due · ${d.counts.episodes_heard} episodes heard`} />
      </div>

      <Section title="Activity, last 26 weeks">
        <ActivityGrid days={d.activity} />
      </Section>

      <Section title="Progress by track">
        <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          {p.per_track.map((t) => (
            <div key={t.track_slug}>
              <div className="flex justify-between text-sm">
                <span>{trackTitle(t.track_slug)}</span>
                <span className="tabular-nums text-muted">
                  {t.completed} / {t.total}
                </span>
              </div>
              <Progress value={t.completed} max={t.total} className="mt-1" />
            </div>
          ))}
        </div>
        {p.last_lesson && (
          <p className="mt-3 text-xs text-muted">
            Last lesson:{" "}
            <Link className="text-accent hover:underline" to={`/learn/${p.last_lesson}`}>
              {p.last_lesson}
            </Link>
          </p>
        )}
      </Section>

      <Section title="Graded submissions">
        <p className="mb-2 text-xs text-muted">The most recent 50. Code is not shown here: it stays between the learner and the grader.</p>
        {d.submissions.length === 0 ? (
          <Empty />
        ) : (
          <Table head={["When", "Target", "Language", "Result", "Runtime"]}>
            {d.submissions.map((s) => (
              <tr key={s.id}>
                <Td className="whitespace-nowrap text-muted">{fmtDateTime(s.created_at)}</Td>
                <Td>
                  <Link className="hover:text-accent" to={s.target_kind === "problem" ? `/practice/${s.target_slug}` : `/learn/${s.target_slug.split("#")[0]}`}>
                    {s.target_slug}
                  </Link>
                  <span className="ml-2 text-xs text-muted">{s.target_kind}</span>
                </Td>
                <Td>{s.language}</Td>
                <Td className={cn("whitespace-nowrap tabular-nums", s.passed ? "text-success" : "text-danger")}>
                  {s.passed ? "passed" : "failed"} {s.passed_count}/{s.total_count}
                </Td>
                <Td className="tabular-nums text-muted">{s.runtime_ms != null ? `${s.runtime_ms} ms` : "—"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <div className="grid gap-x-6 lg:grid-cols-2">
        <Section title="Quiz attempts">
          {d.quizzes.length === 0 ? (
            <Empty />
          ) : (
            <Table head={["When", "Lesson", "Score"]}>
              {d.quizzes.map((x, i) => (
                <tr key={i}>
                  <Td className="whitespace-nowrap text-muted">{fmtDate(x.created_at)}</Td>
                  <Td>
                    <Link className="hover:text-accent" to={`/learn/${x.lesson_slug}`}>
                      {x.lesson_slug}
                    </Link>
                    {x.source !== "authored" && <span className="ml-2 text-xs text-muted">{x.source}</span>}
                  </Td>
                  <Td className={cn("tabular-nums", x.total > 0 && x.score * 10 >= x.total * 7 ? "text-success" : "text-muted")}>
                    {x.score}/{x.total}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
        <Section title="Mock interviews">
          <p className="mb-2 text-xs text-muted">Scores only; transcripts are private.</p>
          {d.interviews.length === 0 ? (
            <Empty />
          ) : (
            <Table head={["Started", "Kind", "Status", "Score"]}>
              {d.interviews.map((x) => (
                <tr key={x.id}>
                  <Td className="whitespace-nowrap text-muted">{fmtDate(x.started_at)}</Td>
                  <Td>
                    {x.kind}
                    {x.assistant_mode !== "solo" && <span className="ml-2 text-xs text-muted">{x.assistant_mode}</span>}
                    {x.problem_slug && <div className="text-xs text-muted">{x.problem_slug}</div>}
                  </Td>
                  <Td>{x.status}</Td>
                  <Td className="tabular-nums">{x.score ?? "—"}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
        <Section title="AI usage, last 30 days">
          <p className="mb-2 text-xs text-muted">{d.counts.conversations} coach conversation(s). Their messages are private.</p>
          {d.ai_usage.length === 0 ? (
            <Empty />
          ) : (
            <Table head={["Day", "Requests", "Input", "Cached", "Output"]}>
              {d.ai_usage.map((x) => (
                <tr key={x.day}>
                  <Td className="whitespace-nowrap text-muted">{x.day}</Td>
                  <Td className="tabular-nums">{fmt(x.requests)}</Td>
                  <Td className="tabular-nums">{fmt(x.input_tokens)}</Td>
                  <Td className="tabular-nums text-muted">{fmt(x.cache_read_tokens)}</Td>
                  <Td className="tabular-nums">{fmt(x.output_tokens)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
        <Section title="Sessions">
          {d.sessions.length === 0 ? (
            <Empty text="Not signed in anywhere." />
          ) : (
            <Table head={["Device", "Signed in", "Last seen", "Expires"]}>
              {d.sessions.map((s, i) => (
                <tr key={i}>
                  <Td className="max-w-56 truncate text-xs" >
                    <span title={s.user_agent ?? ""}>{s.user_agent ?? "unknown"}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{fmtDate(s.created_at)}</Td>
                  <Td className="whitespace-nowrap text-muted">{fmtDateTime(s.last_seen_at)}</Td>
                  <Td className="whitespace-nowrap text-muted">{fmtDate(s.expires_at)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      </div>

      <Section title="Problem reports">{d.reports.length === 0 ? <Empty text="None." /> : <ReportItems reports={d.reports} showReporter={false} />}</Section>

      <Section title="Admin changes to this account">
        {d.audit.length === 0 ? <Empty text="None." /> : <AuditTable entries={d.audit} showTarget={false} />}
      </Section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/60 py-1 sm:block sm:border-0 sm:py-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

const Empty = ({ text = "Nothing yet." }: { text?: string }) => <p className="text-sm text-muted">{text}</p>;

/** 26 weeks of activity days as a calendar strip: a column per week,
 *  Monday at the top. Binary (active or not), so one colour and a legend. */
function ActivityGrid({ days }: { days: string[] }) {
  const active = new Set(days);
  const today = new Date();
  const utc = (d: Date) => d.toISOString().slice(0, 10);
  // Start on the Monday 25 weeks before this week's Monday.
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) - 25 * 7);
  const weeks: { day: string; future: boolean }[][] = [];
  for (let w = 0; w < 26; w++) {
    const col = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + w * 7 + i);
      col.push({ day: utc(d), future: d > today });
    }
    weeks.push(col);
  }
  return (
    <div>
      <div className="flex gap-[3px] overflow-x-auto" role="img" aria-label={`${days.length} active days in the last 26 weeks`}>
        {weeks.map((col, w) => (
          <div key={w} className="flex flex-col gap-[3px]">
            {col.map((c) => (
              <div key={c.day} title={`${c.day}${active.has(c.day) ? ": active" : ""}`} className={cn("h-3 w-3 rounded-[3px]", c.future ? "bg-transparent" : active.has(c.day) ? "bg-chart" : "bg-elev-2")} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-[3px] bg-chart" /> active
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-[3px] bg-elev-2" /> no activity
        </span>
        <span>· {days.length} active days · days are the learner's own</span>
      </div>
    </div>
  );
}

function Actions({ d }: { d: Detail }) {
  const a = d.account;
  const { user } = useAuth();
  const features = useFeatures();
  const navigate = useNavigate();
  const self = user?.id === a.id;
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const done = (msg: string) => () => setNote(msg);
  const fail = (e: unknown) => setNote(e instanceof Error ? e.message : String(e));

  const role = useAdminAction((r: "user" | "admin") => adminApi.setRole(a.id, r));
  const signOut = useAdminAction(() => adminApi.signOut(a.id));
  const reset = useAdminAction(() => adminApi.passwordReset(a.id));
  const resetLink = useAdminAction(() => adminApi.passwordResetLink(a.id));
  const [link, setLink] = useState<string | null>(null);
  const remove = useAdminAction(() => adminApi.deleteUser(a.id));
  const busy = role.isPending || signOut.isPending || reset.isPending || resetLink.isPending || remove.isPending;
  const takeLink = () =>
    confirm(`Make a password reset link for ${a.email}? Anyone with it can set their password for the next hour, so send it only to them. Any earlier reset link stops working.`) &&
    resetLink.mutate(undefined, {
      onSuccess: (r) => {
        setLink(r.url);
        setNote(null);
        void navigator.clipboard?.writeText(r.url).catch(() => {});
      },
      onError: fail,
    });

  return (
    <Card>
      <h2 className="text-sm font-medium text-muted">Actions</h2>
      <div className="mt-3 flex flex-col gap-2">
        {a.role === "admin" ? (
          <Button variant="secondary" disabled={busy || self} title={self ? "Another admin has to do this" : undefined} onClick={() => confirm(`Remove ${a.email}'s admin role?`) && role.mutate("user", { onSuccess: done("Admin role removed."), onError: fail })}>
            Remove admin role
          </Button>
        ) : (
          <Button variant="secondary" disabled={busy} onClick={() => confirm(`Make ${a.email} an admin? They will see every account.`) && role.mutate("admin", { onSuccess: done("Now an admin."), onError: fail })}>
            Make admin
          </Button>
        )}
        <Button variant="secondary" disabled={busy || !features.data?.email} title={features.data?.email ? undefined : "Email is not set up on this deployment"} onClick={() => reset.mutate(undefined, { onSuccess: done(`Reset link sent to ${a.email}.`), onError: fail })}>
          Send password reset link
        </Button>
        <Button variant="secondary" disabled={busy} data-testid="reset-link" onClick={takeLink}>
          Copy a password reset link
        </Button>
        {link && (
          <div className="rounded-lg border border-border p-3 text-xs">
            <p>Copied. Send it to {a.email} yourself; it works once, for an hour.</p>
            <input readOnly className={cn(inputClass, "mt-2 w-full font-mono")} value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Password reset link" />
          </div>
        )}
        <Button variant="secondary" disabled={busy || d.sessions.length === 0} onClick={() => confirm(`Sign ${a.email} out of every device?`) && signOut.mutate(undefined, { onSuccess: (r) => setNote(`Ended ${r.sessions} session(s).`), onError: fail })}>
          Sign out everywhere
        </Button>
        {!confirming ? (
          <Button variant="danger" disabled={busy || self || a.role === "admin"} title={a.role === "admin" ? "Remove the admin role first" : undefined} onClick={() => setConfirming(true)}>
            Delete account
          </Button>
        ) : (
          <div className="rounded-lg border border-danger/40 p-3">
            <p className="text-xs">
              This deletes the account and its progress, submissions, conversations and interviews now. Comments stay, shown as from a deleted user. Type <strong>{a.email}</strong> to confirm.
            </p>
            <input className={cn(inputClass, "mt-2 w-full")} value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type the email to confirm" />
            <div className="mt-2 flex gap-2">
              <Button variant="danger" disabled={typed.trim().toLowerCase() !== a.email || remove.isPending} onClick={() => remove.mutate(undefined, { onSuccess: () => navigate("/admin/users", { replace: true }), onError: fail })}>
                Delete for good
              </Button>
              <Button variant="ghost" onClick={() => (setConfirming(false), setTyped(""))}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
      {note && (
        <p className="mt-3 text-sm text-muted" role="status">
          {note}
        </p>
      )}
      <p className="mt-4 text-xs text-muted">Every action is recorded in the audit log.</p>
    </Card>
  );
}
