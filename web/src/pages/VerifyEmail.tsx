import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ErrorBox, Spinner } from "../components/ui";

export default function VerifyEmail() {
  const { user, refresh } = useAuth();
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  const [error, setError] = useState<unknown>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; // a link works once; do not spend it twice in dev double-render
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    api
      .post("/auth/email/verify", { token })
      .then(async () => {
        history.replaceState(null, "", window.location.pathname);
        setState("done");
        await refresh();
      })
      .catch((err: unknown) => {
        setError(err);
        setState("failed");
      });
  }, [refresh]);
  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-2xl font-semibold">Confirm your email</h1>
      {state === "working" && <Spinner className="mt-6" />}
      {state === "done" && (
        <p className="mt-4 text-sm" data-testid="email-verified">
          Thanks, your address is confirmed. You can now reset your password by email if you ever need to.{" "}
          <Link to={user ? "/dashboard" : "/login"} className="text-accent">
            Continue
          </Link>
        </p>
      )}
      {state === "failed" && (
        <div className="mt-4 space-y-2 text-sm">
          <ErrorBox error={error} />
          <p className="text-muted">While signed in, use "Send the link again" at the top of any page for a fresh one.</p>
        </div>
      )}
    </div>
  );
}
