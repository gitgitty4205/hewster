import { ComingSoon } from "@/components/coming-soon";
import HomeApp from "./page-client";

// Deploy trigger: keep root placeholder, app lives under /hewie.

export default function Home() {
  if (process.env.NEXT_PUBLIC_APP_MODE === "coming-soon") {
    return <ComingSoon />;
  }

  return <HomeApp />;
}
