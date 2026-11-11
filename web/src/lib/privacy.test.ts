import { beforeEach, describe, expect, it } from "vitest";
import { markPrivacySeen, PRIVACY_UPDATED, PRIVACY_UPDATED_ON, privacyChangeUnseen } from "./privacy";

describe("privacyChangeUnseen", () => {
  beforeEach(() => localStorage.clear());

  it("tells learners who joined before the change, until they have seen it", () => {
    const old = { id: "a", created_at: "2026-10-01T09:00:00Z" };
    expect(privacyChangeUnseen(old)).toBe(true);
    markPrivacySeen("a");
    expect(privacyChangeUnseen(old)).toBe(false);
    expect(privacyChangeUnseen({ id: "b", created_at: "2026-10-01T09:00:00Z" })).toBe(true);
  });

  it("does not bother learners who joined under the current page", () => {
    expect(privacyChangeUnseen({ id: "c", created_at: `${PRIVACY_UPDATED_ON}T00:00:01Z` })).toBe(false);
  });

  it("keeps the two forms of the date in step", () => {
    const d = new Date(`${PRIVACY_UPDATED_ON}T12:00:00Z`);
    expect(d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })).toBe(PRIVACY_UPDATED);
  });
});
