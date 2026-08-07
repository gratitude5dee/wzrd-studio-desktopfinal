import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#05070a",
    description: "WZRD is a creator operating system for turning passing signals into culture.",
    display: "standalone",
    id: "/",
    icons: [
      {
        purpose: "any",
        sizes: "192x192",
        src: "/brand/wzrd-icon-192.png",
        type: "image/png",
      },
      {
        purpose: "any",
        sizes: "512x512",
        src: "/brand/wzrd-icon-512.png",
        type: "image/png",
      },
      {
        purpose: "maskable",
        sizes: "512x512",
        src: "/brand/wzrd-icon-maskable-512.png",
        type: "image/png",
      },
    ],
    lang: "en-US",
    name: "WZRD — Creator OS",
    scope: "/",
    short_name: "WZRD",
    start_url: "/",
    theme_color: "#05070a",
  };
}
