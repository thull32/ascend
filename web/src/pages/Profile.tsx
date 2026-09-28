import { useState } from "react";
import { deviceTimeZone, useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Button, Card, ErrorBox, PageTitle } from "../components/ui";
import { Field } from "./Login";

export default function Profile() {
  const { user, update, logout } = useAuth();
  const [name, setName] = useState(user?.display_name ?? "");
  const [company, setCompany] = useState(user?.target_company ?? "");
  const [level, setLevel] = useState(user?.target_level ?? "");
  const [hours, setHours] = useState(String(user?.weekly_hours ?? 8));
  const [language, setLanguage] = useState(user?.preferred_language ?? "python");
  const [timezone, setTimezone] = useState(user?.timezone ?? deviceTimeZone() ?? "UTC");
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  if (!user) return null;
  return (
    <div className="mx-auto max-w-lg">
      <PageTitle title="Profile" subtitle={user.email} />
      <Card>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setSaved(false);
            try {
              await update({ display_name: name, target_company: company, target_level: level, weekly_hours: Number(hours), preferred_language: language as "python", timezone });
              setSaved(true);
            } catch (err) {
              setError(err);
            }
          }}
        >
          <Field label="Display name" value={name} onChange={setName} />
          <Field label="Target company" value={company} onChange={setCompany} required={false} />
          <Field label="Target level" value={level} onChange={setLevel} required={false} />
          <Field label="Weekly hours" type="number" value={hours} onChange={setHours} />
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Preferred language</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value as "python")} className="w-full rounded-lg border border-line bg-bg px-3 py-2">
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
            </select>
          </label>
          <TimeZoneField value={timezone} onChange={setTimezone} />
          {error ? <ErrorBox error={error} /> : null}
          {saved && <p className="text-sm text-success">Saved.</p>}
          <Button type="submit">Save</Button>
        </form>
      </Card>
      <Card className="mt-4">
        <h2 className="font-medium">Sessions</h2>
        <p className="mt-1 text-sm text-muted">Sign out of every device, including this one.</p>
        <Button
          variant="danger"
          className="mt-3"
          onClick={async () => {
            await api.post("/auth/logout-all");
            await logout().catch(() => undefined);
            window.location.href = "/";
          }}
        >
          Sign out everywhere
        </Button>
      </Card>
      <DeleteAccount />
    </div>
  );
}

/** Streak days are counted in this zone. The list is the browser's own
 *  (IANA names); the server checks each against Postgres's tz database. */
function TimeZoneField({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const device = deviceTimeZone();
  const zones = supportedTimeZones();
  const options = zones.includes(value) ? zones : [value, ...zones];
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">Time zone</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-line bg-bg px-3 py-2">
        {options.map((tz) => (
          <option key={tz} value={tz}>
            {tz.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-muted">
        Your streak counts days in this zone.
        {device && device !== value ? (
          <>
            {" "}
            <button type="button" className="underline" onClick={() => onChange(device)}>
              Use this device's zone ({device.replaceAll("_", " ")})
            </button>
          </>
        ) : null}
      </span>
    </label>
  );
}

function supportedTimeZones(): string[] {
  try {
    return [...Intl.supportedValuesOf("timeZone"), "UTC"].filter((tz, i, all) => all.indexOf(tz) === i);
  } catch {
    return ["UTC"];
  }
}

/** Permanent deletion. Progress, submissions, interviews and coach history go
 *  with the account; comments stay so replies keep their context, but are
 *  shown as written by a deleted user. */
function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="mt-4 border-danger/40">
      <h2 className="font-medium">Delete account</h2>
      <p className="mt-1 text-sm text-muted">
        Permanently removes your progress, submissions, mock interviews and coach conversations. Your comments stay, shown as
        written by a deleted user. This cannot be undone.
      </p>
      {!open ? (
        <Button variant="danger" className="mt-3" onClick={() => setOpen(true)}>
          Delete my account…
        </Button>
      ) : (
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setBusy(true);
            try {
              await api.delete("/auth/me", { password });
              window.location.href = "/";
            } catch (err) {
              setError(err);
              setBusy(false);
            }
          }}
        >
          <Field label="Confirm with your password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
          {error ? <ErrorBox error={error} /> : null}
          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={busy || password.length === 0}>
              {busy ? "Deleting…" : "Delete permanently"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setOpen(false); setPassword(""); setError(null); }}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
