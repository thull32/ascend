// TanStack Query hooks. Content queries are cached for a long time (the
// server sets ETags and content only changes on deploy); user state queries
// are short-lived.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "./auth";
import type { CoachStatus, Curriculum, Lesson, Module, Problem, ProblemSummary, ProgressSummary, Roadmap, SearchHit, Track } from "./types";

const CONTENT_STALE = 30 * 60 * 1000;

/** Optional features this deployment has (an AI key, an email provider). */
export const useFeatures = () =>
  useQuery({ queryKey: ["features"], queryFn: () => api.get<{ ai: boolean; email: boolean; contact: string | null; signups: "open" | "invite"; audio: boolean }>("/features"), staleTime: 10 * 60_000 });
export const useCurriculum = () => useQuery({ queryKey: ["curriculum"], queryFn: () => api.get<Curriculum>("/curriculum"), staleTime: CONTENT_STALE });
export const useTrack = (slug: string) => useQuery({ queryKey: ["track", slug], queryFn: () => api.get<Track>(`/curriculum/tracks/${slug}`), staleTime: CONTENT_STALE });
export const useModule = (track: string, module: string) =>
  useQuery({ queryKey: ["module", track, module], queryFn: () => api.get<Module>(`/curriculum/modules/${track}/${module}`), staleTime: CONTENT_STALE });
export const useLesson = (slug: string) => useQuery({ queryKey: ["lesson", slug], queryFn: () => api.get<Lesson>(`/lessons/${slug}`), staleTime: CONTENT_STALE });
export const useProblems = (params: { pattern?: string; list?: string; difficulty?: string } = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return useQuery({ queryKey: ["problems", qs], queryFn: () => api.get<ProblemSummary[]>(`/problems${qs ? `?${qs}` : ""}`), staleTime: CONTENT_STALE });
};
export const useProblem = (slug: string) => useQuery({ queryKey: ["problem", slug], queryFn: () => api.get<Problem>(`/problems/${slug}`), staleTime: CONTENT_STALE });
export const useSearch = (q: string) =>
  useQuery({ queryKey: ["search", q], queryFn: () => api.get<SearchHit[]>(`/search?q=${encodeURIComponent(q)}`), enabled: q.trim().length > 1, staleTime: 60_000 });

export function useProgress() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["progress", user?.id], queryFn: () => api.get<ProgressSummary>("/progress"), enabled: !!user, staleTime: 15_000 });
}
export function useRoadmap() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["roadmap", user?.id], queryFn: () => api.get<Roadmap>("/roadmap"), staleTime: 15_000 });
}
export function useCoachStatus() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["coach-status", user?.id], queryFn: () => api.get<CoachStatus>("/coach/status"), enabled: !!user, staleTime: 60_000 });
}

export function useInvalidateProgress() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["progress"] });
    void qc.invalidateQueries({ queryKey: ["roadmap"] });
  };
}

export function useSetLessonStatus() {
  const invalidate = useInvalidateProgress();
  return useMutation({
    mutationFn: ({ slug, status }: { slug: string; status: "in_progress" | "completed" }) => api.put(`/progress/lessons/${slug}`, { status }),
    onSuccess: invalidate,
  });
}

export function useSetModulePreference() {
  const invalidate = useInvalidateProgress();
  return useMutation({
    mutationFn: ({ slug, preference }: { slug: string; preference: "normal" | "confident" | "priority" }) => api.put(`/progress/modules/${slug}`, { preference }),
    onSuccess: invalidate,
  });
}
