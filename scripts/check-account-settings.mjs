import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const targetUrl = process.env.CHECK_URL || "http://localhost:3000/hewie/account-settings";
const screenshotPath = process.env.CHECK_SCREENSHOT_PATH || path.join(os.tmpdir(), "petnotebook-account-settings-check.png");

async function launchBrowser() {
  for (const channel of ["chrome", "msedge"]) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      // Try the next installed browser channel.
    }
  }
  return chromium.launch({ headless: true });
}

async function main() {
  await mkdir(path.dirname(screenshotPath), { recursive: true });

  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    const origin = new URL(targetUrl).origin;
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.evaluate(() => {
      const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
      window.localStorage.setItem("sb-check-auth-token", JSON.stringify({
        access_token: "check-access-token",
        refresh_token: "check-refresh-token",
        expires_at: expiresAt,
        token_type: "bearer",
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          aud: "authenticated",
          role: "authenticated",
          email: "mhemsing@hprodev.com",
          user_metadata: {
            first_name: "M",
            last_name: "Hemsing",
            full_name: "M Hemsing",
          },
        },
      }));
      window.localStorage.setItem("hewster.pageIntro.completed", "true");
    });

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator('input[value="mhemsing@hprodev.com"]').waitFor({ state: "visible", timeout: 10_000 });
    await page.locator('input[value="M"]').waitFor({ state: "visible", timeout: 5_000 });
    await page.locator('input[value="Hemsing"]').waitFor({ state: "visible", timeout: 5_000 });
    await page.getByRole("button", { name: /sign out/i }).waitFor({ state: "visible", timeout: 5_000 });

    const signInVisible = await page.getByRole("link", { name: /sign in/i }).isVisible().catch(() => false);
    if (signInVisible) {
      throw new Error("Account Settings showed Sign In despite a stored account session.");
    }

    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Account Settings check passed: ${targetUrl}`);
    console.log(`Screenshot: ${screenshotPath}`);
  } catch (error) {
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
    const bodyText = await page.locator("body").innerText({ timeout: 1_000 }).catch(() => "");
    console.error(`Account Settings check failed: ${targetUrl}`);
    console.error(`Screenshot: ${screenshotPath}`);
    console.error(bodyText.slice(0, 800));
    console.error(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(() => {
  process.exitCode = 1;
});
