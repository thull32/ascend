import { useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api";
import { Button, ErrorBox } from "../components/ui";
import { Field } from "./Login";

/** Asks for a reset link. The answer is the same whether or not an account
 *  exists, so this page cannot be used to find out who has signed up. */
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      {sent ? (
        <p className="mt-4 text-sm" data-testid="reset-sent">
          If an account exists for <strong>{email}</strong>, we have sent it a link to choose a new password. The link works once and expires in
          an hour. Check your spam folder if it does not arrive in a few minutes.
        </p>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api.post("/auth/password/forgot", { email });
              setSent(true);
            } catch (err) {
              setError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="text-sm text-muted">Enter the email address you signed up with and we will send you a link.</p>
          <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
          {error ? <ErrorBox error={error} /> : null}
          <Button type="submit" className="w-full" disabled={busy}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-4 text-sm text-muted">
        <Link to="/login" className="text-accent">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
