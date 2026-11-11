// When the privacy page last changed in substance, and what changed. Bump
// all three together: learners who joined before PRIVACY_UPDATED_ON see a
// banner with PRIVACY_CHANGE until they read the page or dismiss it.
import type { User } from "./types";

export const PRIVACY_UPDATED = "10 November 2026";
export const PRIVACY_UPDATED_ON = "2026-11-10";
export const PRIVACY_CHANGE =
  "Admins can now open code you submit for grading, one attempt at a time, and every opening is logged. You can also see your own past attempts under each exercise and problem.";

const key = (userId: string) => `ascend:privacy-seen:${userId}`;

/** Whether this learner joined before the latest change and has not seen it in this browser. */
export function privacyChangeUnseen(user: Pick<User, "id" | "created_at">): boolean {
  if (user.created_at >= PRIVACY_UPDATED_ON) return false;
  try {
    return localStorage.getItem(key(user.id)) !== PRIVACY_UPDATED_ON;
  } catch {
    return false;
  }
}

export function markPrivacySeen(userId: string) {
  try {
    localStorage.setItem(key(userId), PRIVACY_UPDATED_ON);
  } catch {
    /* ignore */
  }
}
