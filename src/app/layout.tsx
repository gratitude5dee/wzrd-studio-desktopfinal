import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import PwaRegistration from "@/components/pwa/PwaRegistration";

import "../index.css";
import "../styles/themes/light-premium.css";

export const metadata: Metadata = {
  applicationName: "WZRD",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "WZRD",
  },
  icons: {
    apple: [
      {
        sizes: "180x180",
        type: "image/png",
        url: "/brand/wzrd-icon-180.png",
      },
    ],
    icon: [{ type: "image/png", url: "/wzrdtechlogo.png" }],
    shortcut: [{ type: "image/png", url: "/wzrdtechlogo.png" }],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  initialScale: 1,
  themeColor: "#050506",
  viewportFit: "cover",
  width: "device-width",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
