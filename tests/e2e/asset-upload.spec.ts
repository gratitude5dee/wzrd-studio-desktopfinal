import { test, expect } from "@playwright/test";

test("legacy assets path redirects to the IP Vault", async ({ page }) => {
  // Auth is bypassed in `bun run test:e2e` via VITE_BYPASS_AUTH_FOR_TESTS=true.
  await page.goto("/assets", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/ip-vault$/, { timeout: 15000 });
  await expect(
    page.getByRole("heading", { name: "Rights registry for finalized assets" }),
  ).toBeVisible({ timeout: 15000 });
});
