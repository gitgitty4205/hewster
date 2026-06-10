import { mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const targetUrl = process.env.CHECK_URL || "http://localhost:3000/hewie/account-settings";
const screenshotPath = process.env.CHECK_SCREENSHOT_PATH || path.join(os.tmpdir(), "petnotebook-account-settings-check.png");
const accountSettingsSourcePath = path.resolve("src/app/account-settings/page.tsx");
const subscriptionPlanSourcePath = path.resolve("src/lib/subscription-plan.ts");
const petAvatarMenuSourcePath = path.resolve("src/components/pet-avatar-menu.tsx");

async function checkAccountSettingsBubbleBorders() {
  const source = await readFile(accountSettingsSourcePath, "utf8");
  const requiredBorderSnippets = [
    'className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"',
    'className="mt-2 flex w-full items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50',
    'className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50',
    ': "border-zinc-200 bg-zinc-50"',
  ];
  const oldRingOnlySnippets = [
    "rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200",
    "rounded-2xl bg-zinc-50 px-4 py-3 text-left ring-1 ring-zinc-200",
    "rounded-2xl bg-zinc-50 px-4 py-2 ring-1 ring-zinc-200",
    ': "border-transparent bg-zinc-50 ring-zinc-200"',
  ];

  for (const snippet of requiredBorderSnippets) {
    if (!source.includes(snippet)) {
      throw new Error(`Account Settings bubble border guard failed. Missing: ${snippet}`);
    }
  }

  for (const snippet of oldRingOnlySnippets) {
    if (source.includes(snippet)) {
      throw new Error(`Account Settings bubble border guard failed. Ring-only outline returned: ${snippet}`);
    }
  }
}

async function checkPetPlanLimits() {
  const [subscriptionSource, petAvatarSource, accountSettingsSource] = await Promise.all([
    readFile(subscriptionPlanSourcePath, "utf8"),
    readFile(petAvatarMenuSourcePath, "utf8"),
    readFile(accountSettingsSourcePath, "utf8"),
  ]);

  const requiredSnippets = [
    "export const FREE_PET_LIMIT = 1;",
    "export const PLUS_PET_LIMIT = 99;",
    "SUBSCRIPTION_PLAN_CONFIRMED_STORAGE_KEY",
    "petLimitForSubscriptionPlan(subscriptionPlan)",
    "Need to add more pets? Contact support and we'll help.",
    "Free includes 1 pet. Upgrade to Plus for unlimited pets, notebook sharing, and lifetime health history.",
    "<span>Add unlimited pets with</span>",
    "PetNotebook Plus",
    "Notebook sharing",
    "Keep everyone in sync",
    "Unlimited PDF reports",
    "Unlimited photos and files",
    "Lifetime health history",
    "Meals, reminders, and alerts",
    "Health records and daily logs",
    "handleUpgradeForMorePets",
    "upgrade=plus&returnToAddPet=1",
    "petnotebook.openAddPetUpgradeDialog",
  ];

  for (const snippet of requiredSnippets) {
    if (!subscriptionSource.includes(snippet) && !petAvatarSource.includes(snippet) && !accountSettingsSource.includes(snippet)) {
      throw new Error(`Pet plan limit guard failed. Missing: ${snippet}`);
    }
  }
}

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
  await checkAccountSettingsBubbleBorders();
  await checkPetPlanLimits();
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
