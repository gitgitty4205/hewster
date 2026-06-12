import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const targetUrl = process.env.CHECK_URL || "http://localhost:3000/hewie";
const screenshotPath = process.env.CHECK_SCREENSHOT_PATH || path.join(os.tmpdir(), "petnotebook-meal-log-snapshot-check.png");

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
      const todayKey = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const loggedAt = new Date();
      loggedAt.setHours(8, 15, 0, 0);
      const loggedIso = loggedAt.toISOString();

      window.localStorage.clear();
      window.localStorage.setItem("hewster.pageIntro.completed", "true");
      window.localStorage.setItem("hewster.todayKey", todayKey);
      window.localStorage.setItem("hewster.mealTemplates", JSON.stringify([
        { id: 1, name: "New Breakfast", plannedTime: "08:00", food: "New Food", notes: "New meal plan notes" },
      ]));
      window.localStorage.setItem("hewster.dailyMealState", JSON.stringify([
        { mealId: 1, actualTime: "08:15", status: "done", fedNotes: null, skippedCareItemIds: [], dayKey: todayKey },
      ]));
      window.localStorage.setItem("hewster.mealLogs", JSON.stringify([
        {
          id: `${todayKey}-1`,
          profileSlug: "hewie",
          dayKey: todayKey,
          mealId: 1,
          mealName: "Old Breakfast",
          food: "Old Food",
          defaultNotes: "Old meal plan notes",
          fedNotes: null,
          skippedCareItemIds: [],
          loggedCareItems: [],
          actualTime: "08:15",
          createdAt: loggedIso,
        },
      ]));
      window.localStorage.setItem("hewster.activityLogs", JSON.stringify([]));
      window.localStorage.setItem("hewster.weightLogs", JSON.stringify([]));
      window.localStorage.setItem("hewster.manualAlerts", JSON.stringify([]));
      window.localStorage.setItem("hewster.supplementSettings", JSON.stringify([
        {
          id: 99,
          kind: "supplement",
          name: "Probiotics",
          amount: "1 cap",
          notes: "Old deleted probiotic notes",
          active: true,
          mealIds: [1],
          asNeeded: false,
          scheduleKind: "meal",
        },
      ]));
      window.localStorage.setItem("hewster.medicationSettings", JSON.stringify([]));
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });

    await page.getByText("Old Breakfast: Old Food").waitFor({ state: "visible", timeout: 10_000 });
    const bodyText = await page.locator("body").innerText({ timeout: 5_000 });
    if (bodyText.includes("Old deleted probiotic notes") || bodyText.includes("Probiotics")) {
      throw new Error("Logged meal rendered current/deleted supplement settings instead of its saved care snapshot.");
    }

    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Meal log snapshot check passed: ${targetUrl}`);
    console.log(`Screenshot: ${screenshotPath}`);
  } catch (error) {
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
    const bodyText = await page.locator("body").innerText({ timeout: 1_000 }).catch(() => "");
    console.error(`Meal log snapshot check failed: ${targetUrl}`);
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
