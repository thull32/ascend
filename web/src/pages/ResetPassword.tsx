import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, ErrorBox } from "../components/ui";
import { Field } from "./Login";

/** The token arrives in the URL fragment (#token=…), which browsers never
 *  send to a server or in a Referer header. */
function tokenFromHash(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
}

export default function ResetPassword() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [token] = useState(tokenFromHash);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (!token) {
    return (
      <div className="mx-auto max-w-sm py-10">
        <h1 className="text-2xl font-semibold">Reset link missing</h1>
        <p className="mt-2 text-sm text-muted">
          Open the link from the email exactly as it was sent, or{" "}
          <Link to="/forgot-password" className="text-accent">
            ask for a new one
          </Link>
          .
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <p className="mt-1 text-sm text-muted">Saving it signs you out on every other device.</p>
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api.post("/auth/password/reset", { token, password });
            history.replaceState(null, "", window.location.pathname); // drop the spent token from the address bar
            await refresh();
            navigate("/dashboard", { replace: true });
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint="At least 15 characters. A few unrelated words make a strong, memorable passphrase."
        />
        {error ? <ErrorBox error={error} /> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          Save and sign in
        </Button>
      </form>
      <p className="mt-4 text-sm text-muted">
        Link expired?{" "}
        <Link to="/forgot-password" className="text-accent">
          Ask for a new one
        </Link>
      </p>
    </div>
  );
}
