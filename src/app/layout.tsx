import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "../index.css";
import "../styles/themes/light-premium.css";

export const metadata: Metadata = {
  title: "WZRD Studio",
  description: "Create, edit, and export AI-assisted video projects.",
  icons: {
    icon: [{ url: "/wzrdtechlogo.png", type: "image/png" }],
    shortcut: [{ url: "/wzrdtechlogo.png", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#050506",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
