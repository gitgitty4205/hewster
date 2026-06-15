import type { Metadata, Viewport } from "next";

import { AuthProvider } from "@/components/auth-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "PetNoteBook",
  description: "A calm pet care tracker for meals, activity, alerts, and weight.",
  formatDetection: {
    address: false,
    email: false,
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const themeBootstrapScript = `
(() => {
  try {
    const canonicalThemeId = "slate";
    const themes = {
      slate: ["#999b96", "#f1f1ed", "#3f4540", "#686d67", "#ffffff", "#cccec8"],
      violet: ["#a7a0bd", "#f0edf5", "#58436f", "#78608f", "#ffffff", "#cec4d9"],
      sky: ["#8fa8b8", "#e9eef8", "#35506f", "#4f7ea8", "#ffffff", "#bdcada"],
      rose: ["#b69aa0", "#f5eeee", "#764e57", "#9a6874", "#ffffff", "#d7c1c6"],
      emerald: ["#8fa79b", "#eef3ef", "#4d6657", "#647e6d", "#ffffff", "#c4d2c8"],
      amber: ["#b5a06f", "#f4efe3", "#6f5a3a", "#8a5f2f", "#ffffff", "#d5c6a8"]
    };
    const getStoredUserId = () => {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !(key.includes("auth-token") || key.includes("supabase.auth.token"))) continue;
        try {
          const parsed = JSON.parse(localStorage.getItem(key) || "null");
          const session = parsed && (parsed.currentSession || parsed.session || (parsed.access_token && parsed.user ? parsed : null));
          const expiresAt = typeof session?.expires_at === "number" ? session.expires_at : null;
          if (session?.user?.id && (!expiresAt || expiresAt * 1000 > Date.now())) return session.user.id;
        } catch {}
      }
      return null;
    };
    let themeId = null;
    const userId = getStoredUserId();
    const userTheme = localStorage.getItem("hewster.userTheme:" + (userId || "guest"));
    if (themes[userTheme]) themeId = userTheme;
    const latestTheme = localStorage.getItem("hewster.userTheme:latest");
    if (!themeId && themes[latestTheme]) themeId = latestTheme;
    const theme = themes[themeId || canonicalThemeId];
    const root = document.documentElement;
    root.style.setProperty("--hewie-bg", theme[0]);
    root.style.setProperty("--hewie-active-bg", theme[1]);
    root.style.setProperty("--hewie-active-text", theme[2]);
    root.style.setProperty("--hewie-accent", theme[3]);
    root.style.setProperty("--hewie-accent-text", theme[4]);
    root.style.setProperty("--hewie-ring", theme[5]);
    localStorage.setItem("hewster.userTheme:latest", themeId || canonicalThemeId);
  } catch {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body
        className="min-h-full flex flex-col bg-[var(--hewie-bg)] text-zinc-900"
        style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
        suppressHydrationWarning
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
