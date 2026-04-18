/**
 * Client-side document titles for public routes.
 *
 * Landing titles mirror scripts/generate-seo-pages.mjs (PAGE_TITLES) so
 * client-side language switches keep the tab title consistent with what
 * Googlebot indexes. If you change one, change both.
 *
 * Other routes are English-only on purpose: they're utility pages whose
 * titles mostly matter for the Umami Pages dashboard (which you read), not
 * for the visitor's tab label.
 */

const LANDING_TITLES: Record<string, string> = {
  en: 'CasaTab — Track Every Cost of Buying Your Home',
  es: 'CasaTab — Controla cada gasto de la compra de tu casa',
  fr: "CasaTab — Suivez chaque frais d'achat de votre maison",
  de: 'CasaTab — Alle Kosten beim Hauskauf im Blick',
  nl: 'CasaTab — Elke kost van je woningaankoop bijhouden',
  pt: 'CasaTab — Acompanhe cada custo da compra da sua casa',
}

export function landingTitle(language: string): string {
  const base = language.split('-')[0]
  return LANDING_TITLES[base] ?? LANDING_TITLES.en
}

export const LOGIN_TITLE = 'Log in to CasaTab'
export const SIGNUP_TITLE = 'Sign up for CasaTab'
export const PRIVACY_TITLE = 'Privacy Policy — CasaTab'
export const FORGOT_PASSWORD_TITLE = 'Reset your password — CasaTab'
export const RESET_PASSWORD_TITLE = 'Set a new password — CasaTab'
export const AUTH_ACTION_TITLE = 'Account action — CasaTab'
export const INVITE_TITLE = "You're invited to CasaTab"
