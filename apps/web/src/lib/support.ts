/**
 * Email de support affiché dans le footer public et les pages légales.
 * Le fallback est volontairement invalide : renseigner `NEXT_PUBLIC_SUPPORT_EMAIL`
 * en production.
 */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.invalid";
