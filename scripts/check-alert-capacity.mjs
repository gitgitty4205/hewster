import { chromium } from "playwright";

const targetUrl = process.env.CHECK_URL || "http://localhost:3000/hewie/alerts";
const customMedicationCount = Number.parseInt(process.env.ALERT_CAPACITY_MED_COUNT || "24", 10);
const manualAlertCount = Number.parseInt(process.env.ALERT_CAPACITY_MANUAL_COUNT || "8", 10);

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

function dayKeyForToday() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function main() {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const todayKey = dayKeyForToday();

  await page.addInitScript(
    ({ customMedicationCount, manualAlertCount, todayKey }) => {
      const medTime = (index) => `${todayKey}T00:${String((5 + index) % 60).padStart(2, "0")}`;
      const mealTemplates = Array.from({ length: 6 }, (_, index) => ({
        id: index + 1,
        name: `Capacity Meal ${index + 1}`,
        plannedTime: `12:${String(index + 1).padStart(2, "0")} AM`,
        food: "Capacity check",
        notes: "",
      }));
      const collisionMedications = [
        { id: 7777, name: "Collision Probiotics", startDateTime: medTime(0) },
        { id: 7777, name: "Collision Metronidazole", startDateTime: medTime(1) },
      ];
      const medications = [
        ...collisionMedications.map((medication, index) => ({
          id: medication.id,
          kind: "medication",
          name: medication.name,
          dose: "1 tablet",
          scheduleKind: "custom",
          mealIds: [],
          customTiming: "with-food",
          medicationType: "oral",
          customScheduleMode: "one",
          startDateTime: medication.startDateTime,
          customScheduleCreatedAt: medication.startDateTime,
          repeatEveryHours: "",
          repeatForDays: "",
          mealPlanDoseCount: "",
          scheduleSteps: [{ id: 7000 + index, everyHours: "", forDays: "" }],
          ongoing: true,
          asNeeded: false,
          notes: "",
          active: true,
        })),
        ...Array.from({ length: customMedicationCount }, (_, index) => ({
        id: 9000 + index,
        kind: "medication",
        name: `Capacity Med ${index + 1}`,
        dose: "1 tablet",
        scheduleKind: "custom",
        mealIds: [],
        customTiming: "with-food",
        medicationType: "oral",
        customScheduleMode: "one",
        startDateTime: medTime(index),
        customScheduleCreatedAt: medTime(index),
        repeatEveryHours: "",
        repeatForDays: "",
        mealPlanDoseCount: "",
        scheduleSteps: [{ id: index + 1, everyHours: "", forDays: "" }],
        ongoing: true,
        asNeeded: false,
        notes: "",
        active: true,
        })),
      ];
      const manualAlerts = Array.from({ length: manualAlertCount }, (_, index) => ({
        id: `capacity-manual-${index + 1}`,
        profileSlug: "hewie",
        title: `Capacity Manual ${index + 1}`,
        message: "Capacity check",
        scope: "today",
        time: `00:${String(index + 1).padStart(2, "0")}`,
        createdDayKey: todayKey,
        resolved: false,
        createdAt: `${todayKey}T00:00:00.000Z`,
        resolvedAt: null,
      }));

      window.localStorage.clear();
      window.localStorage.setItem("hewster.todayKey", todayKey);
      window.localStorage.setItem("hewster.mealTemplates", JSON.stringify(mealTemplates));
      window.localStorage.setItem(
        "hewster.dailyMeals",
        JSON.stringify(
          mealTemplates.map((meal) => ({
            mealId: meal.id,
            actualTime: null,
            status: "upcoming",
            fedNotes: null,
            skippedCareItemIds: [],
            dayKey: todayKey,
          }))
        )
      );
      window.localStorage.setItem("hewster.activityLogs", JSON.stringify([]));
      window.localStorage.setItem("hewster.weightLogs", JSON.stringify([]));
      window.localStorage.setItem("hewster.mealLogs", JSON.stringify([]));
      window.localStorage.setItem("hewster.manualAlerts", JSON.stringify(manualAlerts));
      window.localStorage.setItem("hewster.supplementSettings", JSON.stringify([]));
      window.localStorage.setItem("hewster.medicationSettings", JSON.stringify(medications));
    },
    { customMedicationCount, manualAlertCount, todayKey }
  );

  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("text=Unresolved Alerts", { timeout: 15_000 });

    const expectedTitles = [
      ...Array.from({ length: 6 }, (_, index) => `Capacity Meal ${index + 1} missing`),
      "Collision Probiotics missing",
      "Collision Metronidazole missing",
      ...Array.from({ length: customMedicationCount }, (_, index) => `Capacity Med ${index + 1} missing`),
      ...Array.from({ length: manualAlertCount }, (_, index) => `Capacity Manual ${index + 1}`),
    ];
    const missingTitles = [];

    for (const title of expectedTitles) {
      if ((await page.getByText(title, { exact: true }).count()) === 0) {
        missingTitles.push(title);
      }
    }

    if (missingTitles.length) {
      throw new Error(`Alerts page did not render ${missingTitles.length} expected cards: ${missingTitles.join(", ")}`);
    }

    const visibleCardCount = await page.locator("article").filter({ has: page.locator("svg") }).count();
    if (visibleCardCount < expectedTitles.length) {
      throw new Error(`Expected at least ${expectedTitles.length} alert cards, found ${visibleCardCount}.`);
    }

    console.log(`Alert capacity check passed: ${expectedTitles.length} unresolved alerts rendered on ${targetUrl}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
