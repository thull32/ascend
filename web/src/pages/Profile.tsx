import { useState } from "react";
import { useAuth } from "../lib/auth";
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
              await update({ display_name: name, target_company: company, target_level: level, weekly_hours: Number(hours), preferred_language: language as "python" });
              setSaved(true);
            } catch (err) {
              setError(err);
            }
          }}
        >
          <Field label="Display name" value={name} onChange={setName} />
          <Field label="Target company" value={company} onChange={setCompany} />
          <Field label="Target level" value={level} onChange={setLevel} />
          <Field label="Weekly hours" type="number" value={hours} onChange={setHours} />
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Preferred language</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value as "python")} className="w-full rounded-lg border border-line bg-bg px-3 py-2">
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
            </select>
          </label>
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
    </div>
  );
}
