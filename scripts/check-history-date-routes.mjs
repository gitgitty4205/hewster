import { readFile } from "node:fs/promises";

const checks = [
  {
    file: "src/app/history/page.tsx",
    name: "History reads the requested date from the URL",
    pattern: /const requestedHistoryDay = searchParams\.get\("date"\);/,
  },
  {
    file: "src/app/history/page.tsx",
    name: "History selects a valid requested past date",
    pattern: /setSelectedDay\(requestedHistoryDay\);/,
  },
  {
    file: "src/app/history/page.tsx",
    name: "History preserves date when selecting days",
    pattern: /router\.replace\(`\$\{historyPath\}\?date=\$\{dayKey\}`,\s*\{\s*scroll:\s*false\s*\}\);/s,
  },
  {
    file: "src/app/history/page.tsx",
    name: "Past activity edit links carry the selected day",
    pattern: /router\.push\(`\$\{logPath\}\?date=\$\{dayKey\}&editActivity=\$\{encodeURIComponent\(activityId\)\}`\);/,
  },
  {
    file: "src/app/history/page.tsx",
    name: "Past meal edit links carry the selected day",
    pattern: /router\.push\(`\$\{logPath\}\?date=\$\{dayKey\}&editMeal=\$\{mealId\}`\);/,
  },
  {
    file: "src/app/log/page.tsx",
    name: "Log reads date and edit params from the URL",
    pattern: /const requestedLogDay = searchParams\.get\("date"\);[\s\S]*const requestedEditActivityId = searchParams\.get\("editActivity"\);[\s\S]*const requestedEditMealId = searchParams\.get\("editMeal"\);/,
  },
  {
    file: "src/app/log/page.tsx",
    name: "Log updates its day when URL date changes",
    pattern: /setLogDayKey\(\(current\) => current === nextLogDay \? current : nextLogDay\);[\s\S]*\}, \[requestedEditActivityId, requestedEditMealId, requestedLogDay\]\);/,
  },
  {
    file: "src/app/log/page.tsx",
    name: "History editor waits until requested URL date is active",
    pattern: /if \(requestedLogDay && isValidDayKey\(requestedLogDay\) && requestedLogDay !== logDayKey\) return;/,
  },
  {
    file: "src/app/log/page.tsx",
    name: "Past Entries link carries the current log date back to History",
    pattern: /<Link href=\{`\$\{historyPath\}\?date=\$\{logDayKey\}`\}/,
  },
];

const contents = new Map();

async function readCached(file) {
  if (!contents.has(file)) {
    contents.set(file, await readFile(file, "utf8"));
  }
  return contents.get(file);
}

let failures = 0;

for (const check of checks) {
  const source = await readCached(check.file);
  if (!check.pattern.test(source)) {
    failures += 1;
    console.error(`FAIL: ${check.name} (${check.file})`);
  } else {
    console.log(`PASS: ${check.name}`);
  }
}

if (failures > 0) {
  console.error(`History date route check failed with ${failures} issue${failures === 1 ? "" : "s"}.`);
  process.exitCode = 1;
} else {
  console.log("History date route check passed.");
}
