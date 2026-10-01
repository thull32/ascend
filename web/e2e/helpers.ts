import { expect, type Page } from "@playwright/test";

export function uniqueEmail(prefix = "e2e") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export async function register(page: Page, opts: { skipOnboarding?: boolean } = {}) {
  const email = uniqueEmail();
  // Against an invite-only deployment, set E2E_INVITE to a multi-use code.
  const invite = process.env.E2E_INVITE;
  await page.goto(invite ? `/register?invite=${encodeURIComponent(invite)}` : "/register");
  await page.getByLabel("Display name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  if (!opts.skipOnboarding) {
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Build my roadmap" }).click();
    await expect(page).toHaveURL(/\/roadmap/);
  }
  return email;
}
