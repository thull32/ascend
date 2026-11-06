import { lazy, Suspense } from "react";
import { NavLink, Route, Routes } from "react-router";
import { Spinner } from "../../components/ui";
import { useAdminOverview } from "../../lib/admin";
import { useAuth } from "../../lib/auth";
import { cn } from "../../lib/utils";

const Overview = lazy(() => import("./Overview"));
const Users = lazy(() => import("./Users"));
const UserDetail = lazy(() => import("./UserDetail"));
const Content = lazy(() => import("./Content"));
const Comments = lazy(() => import("./Comments"));
const Invites = lazy(() => import("./Invites"));
const Usage = lazy(() => import("./Usage"));
const Audit = lazy(() => import("./Audit"));
const Reports = lazy(() => import("./Reports"));
const Funnel = lazy(() => import("./Funnel"));
const NotFound = lazy(() => import("../NotFound"));

const tabs = [
  { to: "/admin", label: "Overview", end: true },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/funnel", label: "Funnel" },
  { to: "/admin/content", label: "Content" },
  { to: "/admin/reports", label: "Reports" },
  { to: "/admin/comments", label: "Comments" },
  { to: "/admin/invites", label: "Invites" },
  { to: "/admin/ai", label: "AI usage" },
  { to: "/admin/audit", label: "Audit log" },
];

/** The admin dashboard. The server enforces the role on every request;
 *  this check only avoids showing an admin shell to learners. */
export default function Admin() {
  const { user } = useAuth();
  if (user?.role !== "admin") return <NotFound />;
  return <Shell />;
}

function Shell() {
  const overview = useAdminOverview();
  const open = overview.data?.totals.reports_open ?? 0;
  return (
    <div>
      <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line pb-px" aria-label="Admin">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", isActive ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}
          >
            {t.label}
            {t.to === "/admin/reports" && open > 0 && (
              <span className="ml-1.5 rounded-full bg-accent-strong px-1.5 py-px text-xs text-white" aria-label={`${open} open`}>
                {open}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <Suspense fallback={<Spinner className="mt-16" />}>
        <Routes>
          <Route index element={<Overview />} />
          <Route path="users" element={<Users />} />
          <Route path="users/:id" element={<UserDetail />} />
          <Route path="content" element={<Content />} />
          <Route path="comments" element={<Comments />} />
          <Route path="reports" element={<Reports />} />
          <Route path="funnel" element={<Funnel />} />
          <Route path="invites" element={<Invites />} />
          <Route path="ai" element={<Usage />} />
          <Route path="audit" element={<Audit />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </div>
  );
}
