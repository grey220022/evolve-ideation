import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Evolve — AI Agent Skills Reviewer",
  description:
    "Connect a GitHub repo, scan .claude/ and skills/ for SKILL.md files, and get structured improvement suggestions from GLM",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
