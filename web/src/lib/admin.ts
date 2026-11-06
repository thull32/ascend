// The admin dashboard's API: shapes mirror crates/core/src/services/admin.rs
// (the server is the source of truth), and hooks over /api/admin.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Difficulty, ProgressSummary } from "./types";

export interface Paged<T> {
  total: number;
  offset: number;
  limit: number;
  items: T[];
}

export interface Totals {
  users: number;
  users_new_7d: number;
  users_new_30d: number;
  users_verified: number;
  users_onboarded: number;
  admins: number;
  active_1d: number;
  active_7d: number;
  active_30d: number;
  lessons_completed: number;
  submissions: number;
  submissions_7d: number;
  quiz_attempts: number;
  interviews: number;
  comments: number;
  live_sessions: number;
  ai_requests_today: number;
  ai_input_tokens_today: number;
  ai_output_tokens_today: number;
}

export interface DayCount {
  day: string;
  signups: number;
  active: number;
  submissions: number;
}

export interface Overview {
  totals: Totals;
  daily: DayCount[];
  lessons_total: number;
  problems_total: number;
}

export type UserSort = "newest" | "oldest" | "last_active" | "lessons" | "email";

export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: string;
  target_company: string | null;
  email_verified: boolean;
  onboarded: boolean;
  created_at: string;
  last_login_at: string | null;
  last_active: string | null;
  lessons_completed: number;
  problems_solved: number;
}

export interface Account {
  id: string;
  email: string;
  display_name: string;
  role: string;
  target_company: string | null;
  target_level: string | null;
  weekly_hours: number;
  preferred_language: string;
  timezone: string | null;
  email_verified_at: string | null;
  onboarded_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_label: string;
  action: string;
  target_id: string | null;
  target_email: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface UserDetail {
  account: Account;
  progress: ProgressSummary;
  activity: string[];
  submissions: { id: string; target_kind: string; target_slug: string; language: string; passed: boolean; passed_count: number; total_count: number; runtime_ms: number | null; created_at: string }[];
  quizzes: { lesson_slug: string; source: string; score: number; total: number; created_at: string }[];
  interviews: { id: string; kind: string; assistant_mode: string; problem_slug: string | null; status: string; score: number | null; duration_minutes: number; started_at: string; ended_at: string | null }[];
  ai_usage: { day: string; requests: number; input_tokens: number; output_tokens: number; cache_read_tokens: number }[];
  sessions: { created_at: string; last_seen_at: string; expires_at: string; user_agent: string | null }[];
  counts: { comments: number; conversations: number; review_items: number; review_due: number; episodes_heard: number };
  audit: AuditEntry[];
}

export interface LessonStats {
  slug: string;
  title: string;
  minutes: number;
  difficulty: Difficulty;
  has_quiz: boolean;
  has_viz: boolean;
  quiz_questions: number;
  exercises: number;
  started: number;
  completed: number;
  quiz_attempts: number;
  quiz_learners: number;
  quiz_avg: number | null;
  exercise_attempts: number;
  comments: number;
}

export interface ContentReport {
  version: string;
  lessons: number;
  quiz_questions: number;
  exercises: number;
  problems: number;
  tracks: { slug: string; title: string; phase: number; lesson_count: number; estimated_hours: number; modules: { slug: string; title: string; estimated_hours: number; lessons: LessonStats[] }[] }[];
  problem_stats: { slug: string; title: string; difficulty: Difficulty; patterns: string[]; tests: number; has_walkthrough: boolean; attempts: number; learners: number; solvers: number; comments: number }[];
}

export interface CommentRow {
  id: string;
  author_id: string | null;
  author_email: string | null;
  author_name: string | null;
  target_kind: "lesson" | "problem";
  target_slug: string;
  parent_id: string | null;
  body: string;
  deleted: boolean;
  created_at: string;
}

export interface UsageReport {
  days: number;
  by_day: { day: string; users: number; requests: number; input_tokens: number; output_tokens: number; cache_read_tokens: number }[];
  top_users: { id: string; email: string; display_name: string; requests: number; input_tokens: number; output_tokens: number }[];
}

export interface Invite {
  id: string;
  note: string;
  max_uses: number;
  uses: number;
  expires_at: string | null;
  created_at: string;
}

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString();
  return s ? `?${s}` : "";
};

export const useAdminOverview = () => useQuery({ queryKey: ["admin", "overview"], queryFn: () => api.get<Overview>("/admin/overview"), staleTime: 30_000 });

export const useAdminUsers = (p: { q?: string; role?: string; sort: UserSort; offset: number; limit: number }) =>
  useQuery({ queryKey: ["admin", "users", p], queryFn: () => api.get<Paged<UserRow>>(`/admin/users${qs(p)}`), placeholderData: keepPreviousData, staleTime: 15_000 });

export const useAdminUser = (id: string) => useQuery({ queryKey: ["admin", "user", id], queryFn: () => api.get<UserDetail>(`/admin/users/${id}`), staleTime: 15_000 });

export const useAdminContent = () => useQuery({ queryKey: ["admin", "content"], queryFn: () => api.get<ContentReport>("/admin/content"), staleTime: 60_000 });

export const useAdminComments = (p: { include_deleted: boolean; offset: number; limit: number }) =>
  useQuery({ queryKey: ["admin", "comments", p], queryFn: () => api.get<Paged<CommentRow>>(`/admin/comments${qs(p)}`), placeholderData: keepPreviousData });

export const useAdminUsage = (days: number) => useQuery({ queryKey: ["admin", "usage", days], queryFn: () => api.get<UsageReport>(`/admin/ai-usage?days=${days}`), staleTime: 60_000 });

export const useAdminAudit = (p: { offset: number; limit: number }) =>
  useQuery({ queryKey: ["admin", "audit", p], queryFn: () => api.get<Paged<AuditEntry>>(`/admin/audit${qs(p)}`), placeholderData: keepPreviousData });

export const useAdminInvites = () => useQuery({ queryKey: ["admin", "invites"], queryFn: () => api.get<Invite[]>("/admin/invites") });

/** A change: refreshes every admin view afterwards, since most actions
 *  touch several (a deletion changes the list, the totals and the log). */
export function useAdminAction<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: ["admin"] }) });
}

export const adminApi = {
  setRole: (id: string, role: "user" | "admin") => api.put<Account>(`/admin/users/${id}/role`, { role }),
  signOut: (id: string) => api.post<{ sessions: number }>(`/admin/users/${id}/sign-out`),
  passwordReset: (id: string) => api.post<{ ok: boolean }>(`/admin/users/${id}/password-reset`),
  deleteUser: (id: string) => api.delete<{ ok: boolean }>(`/admin/users/${id}`),
  deleteComment: (id: string) => api.delete<{ ok: boolean }>(`/admin/comments/${id}`),
  createInvite: (body: { uses: number; days?: number; note: string }) => api.post<{ link: string }>("/admin/invites", body),
  revokeInvite: (id: string) => api.delete<{ revoked: number }>(`/admin/invites/${id}`),
};

/** Where a comment's target lives in the app. */
export const targetHref = (kind: string, slug: string) => (kind === "lesson" ? `/learn/${slug}` : `/practice/${slug}`);

export const fmt = (n: number) => n.toLocaleString();
export const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");
export const fmtDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
