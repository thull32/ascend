import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "../lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex justify-center", className)} role="status" aria-label="Loading">
      <Loader2 className="h-6 w-6 animate-spin text-muted" />
    </div>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
export function Button({ variant = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: "bg-accent-strong text-white hover:bg-accent disabled:opacity-50",
    secondary: "bg-elev-2 text-fg hover:bg-line border border-line disabled:opacity-50",
    ghost: "text-fg hover:bg-elev-2 disabled:opacity-50",
    danger: "bg-danger/90 text-white hover:bg-danger disabled:opacity-50",
  };
  return (
    <button
      className={cn("inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed", styles[variant], className)}
      {...props}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-line bg-elev p-4 sm:p-5", className)}>{children}</div>;
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-md bg-elev-2 px-2 py-0.5 text-xs font-medium text-muted", className)}>{children}</span>;
}

export function ErrorBox({ error, className }: { error: unknown; className?: string }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className={cn("rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger", className)} role="alert">
      {message}
    </div>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Progress({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-elev-2", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Crumbs({ items }: { items: { to?: string; label: string }[] }) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden>/</span>}
          {it.to ? (
            <Link to={it.to} className="hover:text-fg">
              {it.label}
            </Link>
          ) : (
            <span className="text-fg">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-8 text-center">
      <p className="font-medium">{title}</p>
      {body && <p className="mt-1 text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
