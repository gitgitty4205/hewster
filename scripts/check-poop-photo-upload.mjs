import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const targetUrl = process.env.CHECK_URL || "http://localhost:3000/hewie";
const screenshotPath = process.env.CHECK_SCREENSHOT_PATH || path.join(os.tmpdir(), "petnotebook-poop-photo-upload-check.png");

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
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.evaluate(() => {
      window.localStorage.setItem("hewster.pageIntro.completed", "true");
      window.localStorage.setItem("sb-check-auth-token", JSON.stringify({
        access_token: "check-access-token",
        refresh_token: "check-refresh-token",
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
        token_type: "bearer",
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          aud: "authenticated",
          role: "authenticated",
          email: "check@example.com",
          user_metadata: { first_name: "Check", last_name: "User", full_name: "Check User" },
        },
      }));
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });

    await page.getByRole("button", { name: /^potty$/i }).click();
    await page.getByRole("button", { name: /poop/i }).filter({ hasNotText: /no poop/i }).first().click();
    await page.getByText("Attach Image", { exact: true }).waitFor({ state: "visible", timeout: 5_000 });
    await page.locator('label[aria-label="Take Picture"]').waitFor({ state: "visible", timeout: 5_000 });
    await page.locator('label[aria-label="Add Photos"]').waitFor({ state: "visible", timeout: 5_000 });

    if (await page.getByText("Add Poop Photos", { exact: true }).isVisible().catch(() => false)) {
      throw new Error("Poop photo upload header should not be visible.");
    }

    if (await page.getByText("Add Poop Photo", { exact: true }).isVisible().catch(() => false)) {
      throw new Error("Old poop photo upload button should not be visible.");
    }

    if (await page.getByText("Take Picture", { exact: true }).isVisible().catch(() => false)) {
      throw new Error("Take Picture should be an icon-only control.");
    }

    if (await page.getByText("Add Photos", { exact: true }).isVisible().catch(() => false)) {
      throw new Error("Add Photos should be an icon-only control.");
    }

    if (await page.getByText("Optional photos for color, texture, or anything unusual.", { exact: true }).isVisible().catch(() => false)) {
      throw new Error("Poop photo upload description should not be visible.");
    }

    const fileInputs = page.locator('input[type="file"][accept="image/*"]');
    const inputCount = await fileInputs.count();
    if (inputCount !== 2) {
      throw new Error(`Expected 2 poop photo upload inputs, found ${inputCount}.`);
    }

    const cameraInput = page.locator('input[type="file"][accept="image/*"][capture="environment"]');
    await cameraInput.waitFor({ state: "attached", timeout: 5_000 });

    const multiPhotoInput = page.locator('input[type="file"][accept="image/*"][multiple]');
    await multiPhotoInput.waitFor({ state: "attached", timeout: 5_000 });

    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Poop photo upload check passed: ${targetUrl}`);
    console.log(`Screenshot: ${screenshotPath}`);
  } catch (error) {
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
    const bodyText = await page.locator("body").innerText({ timeout: 1_000 }).catch(() => "");
    console.error(`Poop photo upload check failed: ${targetUrl}`);
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
