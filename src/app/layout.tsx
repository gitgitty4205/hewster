import type { Metadata, Viewport } from "next";

import { AuthProvider } from "@/components/auth-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "PetNoteBook",
  description: "A calm pet care tracker for meals, activity, alerts, and weight.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const themeBootstrapScript = `
(() => {
  try {
    const themes = {
      slate: ["#999b96", "#f1f1ed", "#3f4540", "#686d67", "#ffffff", "#cccec8"],
      violet: ["#a7a0bd", "#f0edf5", "#58436f", "#78608f", "#ffffff", "#cec4d9"],
      sky: ["#8fa8b8", "#e9eef8", "#35506f", "#4f7ea8", "#ffffff", "#bdcada"],
      rose: ["#b69aa0", "#f5eeee", "#764e57", "#9a6874", "#ffffff", "#d7c1c6"],
      emerald: ["#8fa79b", "#eef3ef", "#4d6657", "#647e6d", "#ffffff", "#c4d2c8"],
      amber: ["#b5a06f", "#f4efe3", "#6f5a3a", "#8a5f2f", "#ffffff", "#d5c6a8"]
    };
    let themeId = null;
    const profile = JSON.parse(localStorage.getItem("hewster.petProfile") || "null");
    if (profile && themes[profile.themeId]) themeId = profile.themeId;
    const guestTheme = localStorage.getItem("hewster.userTheme:guest");
    if (themes[guestTheme]) themeId = guestTheme;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith("hewster.userTheme:") || key === "hewster.userTheme:guest") continue;
      const storedTheme = localStorage.getItem(key);
      if (themes[storedTheme]) themeId = storedTheme;
    }
    const theme = themes[themeId || "slate"];
    const root = document.documentElement;
    const language = localStorage.getItem("petnotebook.language");
    if (["en", "es", "fr", "zh-Hans", "zh-Hant", "ja", "ko", "de", "it", "pt", "hi", "ar"].includes(language)) root.lang = language;
    root.style.setProperty("--hewie-bg", theme[0]);
    root.style.setProperty("--hewie-active-bg", theme[1]);
    root.style.setProperty("--hewie-active-text", theme[2]);
    root.style.setProperty("--hewie-accent", theme[3]);
    root.style.setProperty("--hewie-accent-text", theme[4]);
    root.style.setProperty("--hewie-ring", theme[5]);
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
        className="min-h-full flex flex-col bg-stone-50 text-zinc-900"
        style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
        suppressHydrationWarning
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
