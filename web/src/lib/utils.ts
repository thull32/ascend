import { clsx, type ClassValue } from "clsx";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${Math.round(h * 10) / 10} h`;
}

export function difficultyColor(d: string): string {
  switch (d) {
    case "intro":
      return "text-muted";
    case "easy":
      return "text-success";
    case "medium":
      return "text-warn";
    case "hard":
      return "text-danger";
    case "expert":
      return "text-fuchsia-400";
    default:
      return "text-muted";
  }
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function titleCase(slug: string): string {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** Theme is a per-device preference stored in localStorage. */
export function applyTheme(theme: "dark" | "light") {
  document.documentElement.classList.toggle("light", theme === "light");
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem("ascend:theme", theme);
  } catch {
    /* storage unavailable */
  }
}
export function loadTheme(): "dark" | "light" {
  try {
    const t = localStorage.getItem("ascend:theme");
    if (t === "light" || t === "dark") return t;
  } catch {
    /* ignore */
  }
  return "dark";
}
