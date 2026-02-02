import type { CorbitsEndpoint } from './types.js';

export const CORBITS_URLS: Record<CorbitsEndpoint, string> = {
  xai: 'https://xai.alez-848f79.api.corbits.dev',
  openai: 'https://open-ai.alez-848f79.api.corbits.dev',
  amazon: 'https://amazon.alez-848f79.api.corbits.dev',
};

export const DEFAULT_MARGIN_PERCENT = 30;
export const STRIPE_FEE_PERCENT = 0.029;
export const STRIPE_FEE_FIXED = 0.3;
export const MIN_TOPUP_USD = 10;
export const LOW_BALANCE_THRESHOLD = 5;
export const MAGIC_LINK_EXPIRY_MINUTES = 15;
export const ADMIN_SESSION_EXPIRY_HOURS = 1;
