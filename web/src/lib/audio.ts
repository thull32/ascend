// Audio editions: lessons rewritten for listening (content/AUDIO_GUIDE.md).
import { useQuery, type QueryClient } from "@tanstack/react-query";
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

/** A narrated walkthrough of one of a lesson's visualisations. */
export interface Walkthrough {
  name: string;
  title: string;
  lesson: string;
  track: string;
  module: string;
  /** The visualisation's title in the lesson, which identifies it. */
  viz: string;
  duration: number;
  cues: { frame: number; to?: number | null; start: number }[];
}

export interface Listen {
  position: number;
  heard: boolean;
}

export interface AudioListing {
  episodes: Episode[];
  walkthroughs?: Walkthrough[];
  has_feed: boolean;
  /** Where the learner is in each episode they have started, on any device. */
  listens: Record<string, Listen>;
}

/** One question of a daily review. */
export interface ReviewItem {
  question: string;
  lesson: string;
  lesson_title: string;
  start: number;
  box: number;
  got: boolean | null;
}

export interface DailyReview {
  day: string;
  title: string;
  duration: number;
  bytes: number;
  items: ReviewItem[];
  created_at: string;
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

// Listening state lives on the server, so an episode started on a phone
// resumes on a laptop and a finished lesson episode counts as progress.
// Saving updates the cached listing at once; the request follows.
export function saveListen(qc: QueryClient, name: string, position: number, finished = false) {
  qc.setQueryData<AudioListing>(["audio"], (old) =>
    old ? { ...old, listens: { ...old.listens, [name]: { position, heard: finished || !!old.listens[name]?.heard } } } : old,
  );
  return api.put(`/audio/listens/${encodeURIComponent(name)}`, { position, finished }).catch(() => {
    /* best effort: the next save carries the position */
  });
}

// Listening state used to be kept per browser. Upload what an old version
// left in localStorage once, then forget it.
const POS = "ascend.audio.position.";
const HEARD = "ascend.audio.heard";

export async function migrateLocalListens(listing: AudioListing) {
  let local: [string, number, boolean][] = [];
  try {
    const heard = new Set(JSON.parse(localStorage.getItem(HEARD) ?? "[]") as string[]);
    const names = new Set(heard);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(POS)) names.add(k.slice(POS.length));
    }
    local = [...names].map((n) => [n, Number(localStorage.getItem(POS + n)) || 0, heard.has(n)]);
  } catch {
    return;
  }
  const known = new Set([...listing.episodes.map((e) => e.name), ...(listing.walkthroughs ?? []).map((w) => w.name)]);
  for (const [name, position, heard] of local) {
    const server = listing.listens[name];
    if (known.has(name) && (!server || (heard && !server.heard) || (!server.heard && position > server.position))) {
      await api.put(`/audio/listens/${encodeURIComponent(name)}`, { position, finished: heard }).catch(() => {});
    }
  }
  try {
    for (const [name] of local) localStorage.removeItem(POS + name);
    localStorage.removeItem(HEARD);
  } catch {
    /* storage unavailable */
  }
}
