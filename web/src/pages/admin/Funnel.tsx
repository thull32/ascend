import { useState } from "react";
import { Link } from "react-router";
import { Card, ErrorBox, PageTitle, Spinner } from "../../components/ui";
import { fmt, fmtDate, useAdminFunnel, type Cohort, type Funnel as Data } from "../../lib/admin";
import { Section, Select, Stat, Table, Td } from "./common";

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);
const pctText = (n: number, d: number) => {
  const p = pct(n, d);
  return p === null ? "—" : `${p}%`;
};

type Step = { key: keyof Cohort; label: string; of?: keyof Cohort };

/** Each step counts learners who reached it; return visits are out of those
 *  whose week 2 or week 4 is over. */
const STEPS: Step[] = [
  { key: "signed_up", label: "Signed up" },
  { key: "onboarded", label: "Finished onboarding" },
  { key: "started_lesson", label: "Opened a lesson" },
  { key: "completed_lesson", label: "Finished a lesson" },
  { key: "completed_module", label: "Finished a module" },
  { key: "week2_active", label: "Came back in week 2", of: "week2_eligible" },
  { key: "week4_active", label: "Came back in week 4", of: "week4_eligible" },
];

function sum(cohorts: Cohort[], key: keyof Cohort) {
  return cohorts.reduce((s, c) => s + (c[key] as number), 0);
}

export default function Funnel() {
  const [weeks, setWeeks] = useState("12");
  const q = useAdminFunnel(Number(weeks));
  return (
    <div>
      <PageTitle
        title="Funnel"
        subtitle="Where learners drop off, by the week they signed up (UTC, weeks start Monday). A cohort only counts towards a return week once that week is over."
        actions={<Select label="Window" value={weeks} onChange={setWeeks} options={[["8", "8 weeks"], ["12", "12 weeks"], ["26", "26 weeks"], ["52", "52 weeks"]]} />}
      />
      {q.error && <ErrorBox error={q.error} />}
      {!q.data ? <Spinner className="mt-10" /> : <Body data={q.data} />}
    </div>
  );
}

function Body({ data }: { data: Data }) {
  const total = sum(data.cohorts, "signed_up");
  const value = (s: Step) => sum(data.cohorts, s.key);
  const base = (s: Step) => (s.of ? sum(data.cohorts, s.of) : total);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Signed up" value={fmt(total)} sub={`in the last ${data.weeks} weeks`} />
        <Stat label="Finished a lesson" value={pctText(sum(data.cohorts, "completed_lesson"), total)} sub={`${fmt(sum(data.cohorts, "completed_lesson"))} learners`} />
        <Stat label="Came back in week 2" value={pctText(sum(data.cohorts, "week2_active"), sum(data.cohorts, "week2_eligible"))} sub={`of ${fmt(sum(data.cohorts, "week2_eligible"))} old enough to tell`} />
        <Stat label={`Quiet for ${data.quiet_days} days`} value={fmt(data.quiet_learners)} sub={`${fmt(data.quiet_never_started)} never opened a lesson · all time`} />
      </div>

      <Section title="From sign-up to habit">
        <Card>
          {total === 0 ? (
            <p className="text-sm text-muted">No sign-ups in this window.</p>
          ) : (
            <ol className="space-y-2.5" aria-label="Funnel steps">
              {STEPS.map((s) => {
                const n = value(s);
                const d = base(s);
                const p = pct(n, d);
                return (
                  <li key={s.key} className="grid grid-cols-[10rem_1fr_7rem] items-center gap-3 text-sm sm:grid-cols-[12rem_1fr_8rem]" title={`${s.label}: ${fmt(n)} of ${fmt(d)}`}>
                    <span className="text-muted">{s.label}</span>
                    <span className="h-5 rounded-r bg-elev-2" aria-hidden>
                      <span className="block h-full rounded-r-[4px] bg-chart" style={{ width: `${p ?? 0}%`, minWidth: n > 0 ? 2 : 0 }} />
                    </span>
                    <span className="tabular-nums">
                      {fmt(n)} <span className="text-muted">{p === null ? "" : `· ${p}%`}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="mt-3 text-xs text-muted">Percentages are of everyone who signed up in the window, except the return weeks, which are of the learners whose week 2 or week 4 has ended.</p>
        </Card>
      </Section>

      <Section title="By sign-up week">
        <Table head={["Week of", "Signed up", ...STEPS.slice(1).map((s) => s.label)]}>
          {[...data.cohorts].reverse().map((c) => (
            <tr key={c.week}>
              <Td className="whitespace-nowrap">{fmtDate(`${c.week}T12:00:00Z`)}</Td>
              <Td className="tabular-nums">{fmt(c.signed_up)}</Td>
              {STEPS.slice(1).map((s) => (
                <Cell key={s.key} n={c[s.key] as number} d={s.of ? (c[s.of] as number) : c.signed_up} early={!!s.of && c.signed_up > 0 && (c[s.of] as number) === 0} />
              ))}
            </tr>
          ))}
        </Table>
        <p className="mt-2 text-xs text-muted">Shading follows the percentage. “too early” means no one in that week has reached it yet.</p>
      </Section>

      <Section title="Where quiet learners stopped">
        {data.stop_points.length === 0 ? (
          <p className="text-sm text-muted">No learner has gone quiet after opening a lesson.</p>
        ) : (
          <Table head={["Last lesson they touched", "Track", "Left it unfinished", "Finished it, then stopped"]}>
            {data.stop_points.map((s) => (
              <tr key={s.slug}>
                <Td>
                  <Link className="hover:text-accent" to={`/learn/${s.slug}`}>
                    {s.title ?? s.slug}
                  </Link>
                </Td>
                <Td className="text-muted">{s.track ?? "—"}</Td>
                <Td className="tabular-nums">{fmt(s.stopped_in)}</Td>
                <Td className="tabular-nums">{fmt(s.stopped_after)}</Td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-2 text-xs text-muted">
          Learners with no activity for {data.quiet_days} days, by the lesson they last opened or finished. Many stopping mid-lesson suggests that lesson loses people; many stopping
          after it suggests the next step is unclear.
        </p>
      </Section>
    </>
  );
}

function Cell({ n, d, early }: { n: number; d: number; early: boolean }) {
  if (early) return <Td className="text-xs text-muted">too early</Td>;
  const p = pct(n, d);
  if (p === null) return <Td className="text-muted">—</Td>;
  return (
    <Td className="tabular-nums">
      <span className="-mx-1.5 rounded px-1.5 py-0.5" style={{ background: `color-mix(in oklab, var(--chart) ${Math.round(p * 0.45)}%, transparent)` }} title={`${n} of ${d}`}>
        {p}%
      </span>
    </Td>
  );
}
