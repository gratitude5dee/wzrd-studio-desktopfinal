import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    host: "https://wzrd.tech",
    rules: {
      allow: "/",
      userAgent: "*",
    },
    sitemap: "https://wzrd.tech/sitemap.xml",
  };
}
