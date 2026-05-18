import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pet Notebook",
  description: "A calm pet care tracker for meals, activity, alerts, and weight.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body
        className="min-h-full flex flex-col bg-stone-50 text-zinc-900"
        style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
