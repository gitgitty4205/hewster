import { readFile } from "node:fs/promises";

const activityFeedPath = new URL("../src/components/activity-feed.tsx", import.meta.url);
const historyPagePath = new URL("../src/app/history/page.tsx", import.meta.url);

const activityFeed = await readFile(activityFeedPath, "utf8");
const historyPage = await readFile(historyPagePath, "utf8");

const lockedTimeBadgeClass =
  "rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 ring-1 ring-zinc-200/80";

const requiredActivityFeedSnippets = [
  `const timelineTimeBadgeClassName = "${lockedTimeBadgeClass}";`,
  'className="rounded-2xl bg-zinc-50/75 p-2.5 ring-1 ring-zinc-200/70"',
  'grid-cols-[1.35rem_minmax(0,1fr)_auto]',
  'grid-cols-[1.35rem_1fr]',
  'className="flex w-5 justify-center"',
  'className={`flex size-5 shrink-0 items-center justify-center rounded-full ${style.dot}`}',
];

const forbiddenActivityFeedSnippets = [
  'const timelineTimeBadgeClassName = "hewie-time-badge";',
  'grid-cols-[2.25rem_minmax(0,1fr)_auto]',
  'className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-full ${style.dot}`}',
];

for (const snippet of requiredActivityFeedSnippets) {
  if (!activityFeed.includes(snippet)) {
    throw new Error(`Today timeline format lock failed. Missing ActivityFeed snippet: ${snippet}`);
  }
}

for (const snippet of forbiddenActivityFeedSnippets) {
  if (activityFeed.includes(snippet)) {
    throw new Error(`Today timeline format lock failed. Found old ActivityFeed snippet: ${snippet}`);
  }
}

if (!historyPage.includes(lockedTimeBadgeClass)) {
  throw new Error("History timeline compact time badge changed. Re-check Today timeline before accepting this change.");
}

if (activityFeed.includes("leading-none text-zinc-500 ring-1 ring-zinc-200/80")) {
  throw new Error("Today timeline time badge is thinner than History. Use the locked History badge class.");
}

console.log("Timeline format lock passed.");
