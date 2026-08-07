import type { Metadata } from "next";

import CanonicalCreatorOSLanding from "@/components/creator-os/CanonicalCreatorOSLanding";
import FirstVisitIntroGate from "@/components/landing/FirstVisitIntroGate";

export const metadata: Metadata = {
  metadataBase: new URL("https://wzrd.tech"),
  alternates: {
    canonical: "/",
  },
  title: "WZRD.tech — Creator OS",
  description: "A creator operating system for turning passing signals into culture.",
  openGraph: {
    description: "A creator operating system for turning passing signals into culture.",
    images: [
      {
        alt: "WZRD.tech — Creator OS",
        height: 630,
        type: "image/svg+xml",
        url: "/creator-os/og-creator-os.svg",
        width: 1200,
      },
    ],
    siteName: "WZRD.tech",
    title: "WZRD.tech — Creator OS",
    type: "website",
    url: "/",
  },
  robots: {
    follow: true,
    index: true,
  },
  twitter: {
    card: "summary_large_image",
    images: ["/creator-os/og-creator-os.svg"],
    title: "WZRD.tech — Creator OS",
  },
};

export default function Page() {
  return (
    <>
      <FirstVisitIntroGate />
      <CanonicalCreatorOSLanding />
    </>
  );
}
