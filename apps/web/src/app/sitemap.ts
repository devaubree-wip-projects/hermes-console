import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Seules les routes réellement publiques sont indexables ; les vues produit
// vivent sous /:tenantSlug/** et sont protégées par l'auth.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/login`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${siteUrl}/register`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
