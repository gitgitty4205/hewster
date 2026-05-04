"use client";

import { BellPlus, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  alertsCount?: number;
};

const APP_BASE = "/hewie";

const items = [
  { label: "Today", href: `${APP_BASE}` },
  { label: "Log", href: `${APP_BASE}/log` },
  { label: "Activity", href: `${APP_BASE}/activity` },
  { label: "Weight", href: `${APP_BASE}/weight` },
  { label: "History", href: `${APP_BASE}/history` },
  { label: "alerts", href: `${APP_BASE}/alerts`, icon: BellPlus },
  { label: "settings", href: `${APP_BASE}/meals`, icon: Settings2 },
];

export function BottomNav({ alertsCount = 0 }: Props) {
  const pathname = usePathname();

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md px-3 pb-3">
      <nav className="flex items-center justify-between gap-1 rounded-[28px] border border-white/50 bg-white/82 px-1.5 py-2 shadow-[0_-10px_28px_rgba(15,23,42,0.10)] backdrop-blur-md">
        {items.map((item) => {
          const active = pathname === item.href || (item.href === APP_BASE && pathname === "/poop-history");
          const showBadge = item.href === `${APP_BASE}/alerts` && alertsCount > 0;

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`relative flex min-w-0 flex-1 items-center justify-center rounded-2xl px-1.5 py-2.5 text-[11px] font-semibold transition ${
                active
                  ? "bg-violet-100 text-violet-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_1px_3px_rgba(15,23,42,0.08)]"
                  : "text-zinc-600 hover:bg-zinc-100/80"
              }`}
            >
              {item.icon ? (
                <item.icon className="size-4" strokeWidth={2.25} />
              ) : (
                <span className="truncate">{item.label}</span>
              )}
              {showBadge ? (
                <span className="absolute right-1 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-violet-500 px-1 text-[10px] font-semibold text-white">
                  {alertsCount > 9 ? "9+" : alertsCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
