// Audio editions: lessons rewritten for listening (content/AUDIO_GUIDE.md).
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "./auth";
import { useFeatures } from "./queries";

export interface AudioChapter {
  title: string;
  start: number;
  end: number;
}

export interface Episode {
  name: string;
  title: string;
  lesson: string | null;
  review: string | null;
  track: string;
  module: string;
  module_title: string;
  order: number;
  duration: number;
  bytes: number;
  fit: "great" | "partial" | "screen" | null;
  desk: string[];
  chapters: AudioChapter[];
  published: string;
}

export interface AudioListing {
  episodes: Episode[];
  has_feed: boolean;
}

/** The published episodes, for signed-in learners on a deployment with audio. */
export function useAudio() {
  const { user } = useAuth();
  const features = useFeatures();
  return useQuery({
    queryKey: ["audio"],
    queryFn: () => api.get<AudioListing>("/audio"),
    enabled: !!user && !!features.data?.audio,
    staleTime: 5 * 60_000,
  });
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

// Per-browser listening state: where each episode was left, and which were
// finished. A convenience, so it lives in localStorage and may be lost.
const POS = "ascend.audio.position.";
const HEARD = "ascend.audio.heard";

export function savedPosition(name: string): number {
  try {
    return Number(localStorage.getItem(POS + name)) || 0;
  } catch {
    return 0;
  }
}

export function savePosition(name: string, seconds: number) {
  try {
    localStorage.setItem(POS + name, String(Math.floor(seconds)));
  } catch {
    /* storage unavailable */
  }
}

export function heardSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HEARD) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function markHeard(name: string) {
  try {
    const s = heardSet();
    s.add(name);
    localStorage.setItem(HEARD, JSON.stringify([...s]));
    localStorage.removeItem(POS + name);
  } catch {
    /* storage unavailable */
  }
}
