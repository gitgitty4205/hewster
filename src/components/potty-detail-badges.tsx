import type { ActivityLog } from "@/lib/hewster-data";
import { ExpandableNoteText } from "@/components/expandable-note-text";
import { Ban } from "lucide-react";

function poopBadgeClasses(detail: string | null) {
  const normalized = detail?.trim().toLowerCase() ?? "";
  const bristolType = normalized.match(/^type\s+([1-7])\b/)?.[1];

  if (normalized === "no poop") {
    return "bg-zinc-200 text-zinc-900 ring-1 ring-zinc-600";
  }

  switch (bristolType) {
    case "1":
      return "bg-[#6B7280] text-[#111827] ring-1 ring-[#4b5563]";
    case "2":
      return "bg-[#9CA3AF] text-[#374151] ring-1 ring-[#6B7280]";
    case "3":
      return "bg-[#92532A] text-[#2f1608] ring-1 ring-[#6f3d1d]";
    case "4":
      return "bg-[#d8a23a] text-[#3f2a08] ring-1 ring-[#a87418]";
    case "5":
      return "bg-[#F0892A] text-orange-950 ring-1 ring-[#b96514]";
    case "6":
      return "bg-[#FA8072] text-[#4a120f] ring-1 ring-[#d95f54]";
    case "7":
      return "bg-[#e8645e] text-[#4a120f] ring-1 ring-[#bf403b]";
    default:
      break;
  }

  switch (normalized) {
    case "type 1: very firm, small pieces":
      return "bg-[#6B7280] text-[#111827] ring-1 ring-[#4b5563]";
    case "type 2: firm, slightly uneven log":
    case "type 2: firm, uneven log":
      return "bg-[#9CA3AF] text-[#374151] ring-1 ring-[#6B7280]";
    case "type 3: formed log with light cracks":
    case "type 3: formed log, light cracks":
      return "bg-[#92532A] text-[#2f1608] ring-1 ring-[#6f3d1d]";
    case "type 4: smooth, well-formed log":
    case "type 4: smooth, well-formed":
      return "bg-[#d8a23a] text-[#3f2a08] ring-1 ring-[#a87418]";
    case "type 5: soft, formed pieces":
      return "bg-[#F0892A] text-orange-950 ring-1 ring-[#b96514]";
    case "type 6: very soft, loose pieces":
      return "bg-[#FA8072] text-[#4a120f] ring-1 ring-[#d95f54]";
    case "type 7: fully liquid":
      return "bg-[#e8645e] text-[#4a120f] ring-1 ring-[#bf403b]";
    case "no poop":
      return "bg-zinc-200 text-zinc-900 ring-1 ring-zinc-600";
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

function NoPoopIcon() {
  return <Ban className="mr-1.5 h-4 w-4 text-zinc-500" strokeWidth={2.25} />;
}

export function PottyDetailBadges({
  detail,
  notes,
  align = "left",
  inset = true,
}: {
  detail: string | null;
  notes?: string | null;
  align?: "left" | "right";
  inset?: boolean;
}) {
  const { event, bristol, bristolType, bristolDescription } = parsePottyDetail(detail);
  const showPee = event === "Pee" || event === "Pee & Poop";
  const showPoop = event === "Poop" || event === "Pee & Poop" || Boolean(bristol);
  const showNoPoop = event === "No Poop";
  const showGenericPotty = Boolean(detail) && !showPee && !showPoop && !showNoPoop;
  const alignItems = align === "right" ? "items-end text-right" : "items-start text-left";
  const rowJustify = align === "right" ? "justify-end" : "justify-start";
  const marginTop = inset ? "mt-2" : "";
  const visibleNotes = notes
    ?.split("\n")
    .filter((line) => !line.startsWith("Attachments: "))
    .join("\n")
    .trim();

  return (
    <div className={`${marginTop} flex flex-col gap-1.5 ${alignItems}`}>
      {showPee ? (
        <div className={`flex w-full ${rowJustify}`}>
          <span className={`${pottyBadgeClasses("Pee")} whitespace-nowrap`}>
            <PeeSplash />
            Pee
          </span>
        </div>
      ) : null}
      {showPoop ? (
        <div className={`flex w-full max-w-full flex-nowrap items-center gap-1.5 ${rowJustify}`}>
          <span className={`${pottyBadgeClasses(bristol ?? "Poop")} whitespace-nowrap`}>
            <span className="mr-1.5 text-[16px] leading-none">{"\u{1F4A9}"}</span>
            {bristolType ?? "Poop"}
          </span>
          {bristolDescription ? (
            <span className="min-w-0 whitespace-nowrap text-xs font-medium leading-5 text-zinc-600">{bristolDescription}</span>
          ) : null}
        </div>
      ) : null}
      {showNoPoop ? (
        <div className={`flex w-full ${rowJustify}`}>
          <span className={`${pottyBadgeClasses("No Poop")} whitespace-nowrap`}>
            <NoPoopIcon />
            No Poop
          </span>
        </div>
      ) : null}
      {showGenericPotty ? (
        <div className={`flex w-full ${rowJustify}`}>
          <span className={`${pottyBadgeClasses("Pee")} whitespace-nowrap`}>Potty Break</span>
        </div>
      ) : null}
      {visibleNotes ? <ExpandableNoteText className="text-sm text-zinc-600">{visibleNotes}</ExpandableNoteText> : null}
    </div>
  );
}

export function pottyDetailForBadge(activity: ActivityLog) {
  if (!["pee", "poop", "potty"].includes(activity.activityType)) return null;
  return activity.detail ?? activity.activityType;
}
