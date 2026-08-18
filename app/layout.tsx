import type { CSSProperties } from "react";
import type { Metadata } from "next";
import "./globals.css";
import { visualisationConfig } from "@/lib/visualisation-config";

export const metadata: Metadata = {
  title: "Red Ripple Field",
  description: "A quiet field of expanding red ripples.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      style={
        { "--background": visualisationConfig.backgroundColor } as CSSProperties
      }
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
