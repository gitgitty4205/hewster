"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { CenteredLoadingIcon } from "@/components/centered-loading-icon";

export default function LegacyHewieLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  void children;

  useEffect(() => {
    const nextPath = pathname.replace(/^\/hewie/, "/notebook") || "/notebook";
    const query = window.location.search.replace(/^\?/, "");
    router.replace(query ? `${nextPath}?${query}` : nextPath);
  }, [pathname, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--hewie-bg,#999b96)] px-4 text-zinc-900">
      <CenteredLoadingIcon className="min-h-32" />
    </main>
  );
}
