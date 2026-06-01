import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const targetUrl = process.env.CHECK_URL || "http://localhost:3000/hewie";
const screenshotPath = process.env.CHECK_SCREENSHOT_PATH || path.join(os.tmpdir(), "petnotebook-floating-menu-check.png");
const floatingMenuSelector = '[aria-label="Open notebook pages"]';
const openingGateText = "Opening Hewster's Notebook";
const hydrationErrorText = "Hydration failed because the server rendered HTML didn't match the client";

async function launchBrowser() {
  const preferredChannels = ["chrome", "msedge"];

  for (const channel of preferredChannels) {
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
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.evaluate(() => {
      window.localStorage.setItem("hewster.pageIntro.completed", "true");
      window.localStorage.setItem("hewster.alertBadgeCount", "1");
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
          user_metadata: {
            first_name: "Check",
            last_name: "User",
            full_name: "Check User",
          },
        },
      }));
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });

    const floatingMenu = page.locator(floatingMenuSelector);
    await floatingMenu.waitFor({ state: "visible", timeout: 10_000 });
    const nextIssueOverlay = page.locator("[data-nextjs-dialog-overlay]");
    const overlayCount = await nextIssueOverlay.count();
    if (overlayCount > 0) {
      throw new Error("Next.js issue overlay is visible.");
    }

    const hydrationError = pageErrors.find((message) => message.includes(hydrationErrorText));
    if (hydrationError) {
      throw new Error(hydrationError);
    }

    const buttonState = await floatingMenu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const styles = window.getComputedStyle(element);

      return {
        backgroundColor: styles.backgroundColor,
        height: rect.height,
        opacity: Number(styles.opacity),
        right: window.innerWidth - rect.right,
        top: rect.top,
        width: rect.width,
      };
    });

    if (
      buttonState.width < 48 ||
      buttonState.height < 48 ||
      buttonState.opacity < 0.95 ||
      buttonState.right < 8 ||
      buttonState.top < 0 ||
      buttonState.backgroundColor === "rgba(0, 0, 0, 0)"
    ) {
      throw new Error(`Floating menu is present but not reliably visible: ${JSON.stringify(buttonState)}`);
    }
    await page.waitForTimeout(2_500);
    await floatingMenu.click();
    await page.locator("text=Pages").first().waitFor({ state: "visible", timeout: 5_000 });

    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Floating menu check passed: ${targetUrl}`);
    console.log(`Screenshot: ${screenshotPath}`);
  } catch (error) {
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
    const bodyText = await page.locator("body").innerText({ timeout: 1_000 }).catch(() => "");
    const stuckOnOpeningGate = bodyText.includes(openingGateText);
    const stuckOnHydrationError = bodyText.includes(hydrationErrorText) || pageErrors.some((message) => message.includes(hydrationErrorText));
    console.error(`Floating menu check failed: ${targetUrl}`);
    if (stuckOnOpeningGate) {
      console.error("The notebook is still blocked by the opening auth gate.");
    }
    if (stuckOnHydrationError) {
      console.error("The notebook is showing a React hydration error.");
    }
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
