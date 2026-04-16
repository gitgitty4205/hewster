import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hewster's Notebook",
  description: "A calm pet care tracker for meals, activity, alerts, and weight.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body
        className="min-h-full flex flex-col bg-stone-50 text-zinc-900"
        style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
