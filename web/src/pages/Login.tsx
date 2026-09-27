import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { Button, ErrorBox } from "../components/ui";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-2xl font-semibold">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">Sign in to continue your roadmap.</p>
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await login(email, password);
            navigate(from, { replace: true });
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        {error ? <ErrorBox error={error} /> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          Sign in
        </Button>
      </form>
      <p className="mt-4 text-sm text-muted">
        New here?{" "}
        <Link to="/register" className="text-accent">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export function Field({ label, value, onChange, type = "text", autoComplete, hint, required = true }: { label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; hint?: string; required?: boolean }) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <label className="block text-sm" htmlFor={id}>
      <span className="mb-1 block font-medium">{label}</span>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        className="w-full rounded-lg border border-line bg-bg px-3 py-2 outline-none focus:border-accent"
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
