import type { MetadataRoute } from "next";

/**
 * /admin вже захищено паролем — тут лише щоб пошуковики не індексували
 * сам факт існування цього шляху (аудит безпеки, 2026-09-18). Раніше
 * robots.txt не було взагалі (404).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/admin",
    },
  };
}
