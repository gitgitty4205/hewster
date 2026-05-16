import type { ActivityLog } from "@/lib/hewster-data";

function poopBadgeClasses(detail: string | null) {
  const normalized = detail?.trim().toLowerCase() ?? "";

  switch (normalized) {
    case "no poop":
      return "bg-zinc-200 text-zinc-900 ring-1 ring-zinc-600";
    case "type 1: very firm, small pieces":
    case "type 2: firm, slightly uneven log":
      return "bg-stone-200 text-stone-900 ring-1 ring-stone-400/80";
    case "type 3: formed log with light cracks":
      return "bg-orange-200 text-orange-950 ring-1 ring-orange-400/80";
    case "type 4: smooth, well-formed log":
      return "bg-amber-200 text-amber-950 ring-1 ring-amber-400/80";
    case "type 5: soft, formed pieces":
      return "bg-orange-300 text-orange-950 ring-1 ring-orange-500/70";
    case "type 6: very soft, loose pieces":
      return "bg-rose-200 text-rose-950 ring-1 ring-rose-400/80";
    case "type 7: fully liquid":
      return "bg-rose-300 text-rose-950 ring-1 ring-rose-500/70";
    default:
      return "bg-orange-200 text-orange-950 ring-1 ring-orange-400/80";
  }
}

function isPeeDetail(detail: string | null) {
  const normalized = detail?.trim().toLowerCase() ?? "";
  return normalized === "pee";
}

function isPeeAndPoopDetail(detail: string | null) {
  const normalized = detail?.trim().toLowerCase() ?? "";
  return normalized === "pee & poop";
}

function pottyBadgeClasses(detail: string | null) {
  if (isPeeDetail(detail)) {
    return "inline-flex h-7 items-center rounded-full bg-[#fff7dc]/90 px-3 text-xs font-bold leading-none text-[#6f5200] ring-1 ring-[#f0d27a]/65";
  }

  if (isPeeAndPoopDetail(detail)) {
    return "inline-flex h-7 items-center rounded-full bg-gradient-to-r from-[#fff7dc]/90 to-orange-50/80 px-3 text-xs font-bold leading-none text-orange-900 ring-1 ring-orange-200/70";
  }

  return `inline-flex h-7 items-center rounded-full px-3 text-xs font-bold leading-none ${poopBadgeClasses(detail)}`;
}

export function parsePottyDetail(detail: string | null) {
  const rawDetail = detail ?? "";
  const normalizedDetail = rawDetail.replace(/â€¢|�\?�/g, "•");
  const pottyEvents = ["Pee & Poop", "No Poop", "Poop", "Pee"];
  const event = pottyEvents.find((part) => normalizedDetail === part) ??
    pottyEvents.find((part) => normalizedDetail.startsWith(`${part} `) || normalizedDetail.startsWith(`${part} • `)) ??
    null;
  const bristol = normalizedDetail.match(/Type \d: [^•]+/)?.[0]?.trim() ?? (normalizedDetail.startsWith("Type ") ? normalizedDetail : null);
  const [bristolType, bristolDescription] = bristol?.split(": ") ?? [];

  return { event, bristol, bristolType, bristolDescription };
}

function PeeSplash() {
  return <span className="mr-1 text-sm leading-none">{"\u{1F4A6}"}</span>;
}

export function PottyDetailBadges({
  detail,
  notes,
  align = "left",
}: {
  detail: string | null;
  notes?: string | null;
  align?: "left" | "right";
}) {
  const { event, bristol, bristolType, bristolDescription } = parsePottyDetail(detail);
  const showPee = event === "Pee" || event === "Pee & Poop";
  const showPoop = event === "Poop" || event === "Pee & Poop" || Boolean(bristol);
  const showNoPoop = event === "No Poop";
  const showGenericPotty = Boolean(detail) && !showPee && !showPoop && !showNoPoop;
  const alignItems = align === "right" ? "items-end text-right" : "items-start text-left";
  const rowJustify = align === "right" ? "justify-end" : "justify-start";

  return (
    <div className={`mt-2 flex flex-col gap-1.5 ${alignItems}`}>
      {showPee ? (
        <div className={`flex w-full ${rowJustify}`}>
          <span className={`${pottyBadgeClasses("Pee")} whitespace-nowrap`}>
            <PeeSplash />
            Pee
          </span>
        </div>
      ) : null}
      {showPoop ? (
        <div className={`flex w-full max-w-full flex-wrap items-center gap-2 ${rowJustify}`}>
          <span className={`${pottyBadgeClasses(bristol ?? "Poop")} whitespace-nowrap`}>
            <span className="mr-1">{"\u{1F4A9}"}</span>
            {bristolType ?? "Poop"}
          </span>
          {bristolDescription ? (
            <span className="min-w-0 text-xs font-medium leading-5 text-zinc-600">{bristolDescription}</span>
          ) : null}
        </div>
      ) : null}
      {showNoPoop ? (
        <div className={`flex w-full ${rowJustify}`}>
          <span className={`${pottyBadgeClasses("No Poop")} whitespace-nowrap`}>No Poop</span>
        </div>
      ) : null}
      {showGenericPotty ? (
        <div className={`flex w-full ${rowJustify}`}>
          <span className={`${pottyBadgeClasses("Pee")} whitespace-nowrap`}>Potty Break</span>
        </div>
      ) : null}
      {notes ? <p className="text-sm text-zinc-600">{notes}</p> : null}
    </div>
  );
}

export function pottyDetailForBadge(activity: ActivityLog) {
  if (!["pee", "poop", "potty"].includes(activity.activityType)) return null;
  return activity.detail ?? activity.activityType;
}
