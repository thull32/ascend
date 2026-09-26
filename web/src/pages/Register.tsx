import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { Button, ErrorBox } from "../components/ui";
import { Field } from "./Login";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-muted">Free forever. Your progress syncs across devices.</p>
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await register(email, password, name);
            navigate("/onboarding", { replace: true });
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Display name" value={name} onChange={setName} autoComplete="nickname" />
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" hint="At least 10 characters." />
        {error ? <ErrorBox error={error} /> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          Create account
        </Button>
      </form>
      <p className="mt-4 text-sm text-muted">
        Already have one?{" "}
        <Link to="/login" className="text-accent">
          Sign in
        </Link>
      </p>
    </div>
  );
}
