import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      changeFrequency: "weekly",
      lastModified: new Date("2026-07-14T00:00:00.000Z"),
      priority: 1,
      url: "https://wzrd.tech",
    },
  ];
}
