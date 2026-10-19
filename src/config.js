// Deployment configuration (public values only). PUSH_API is the Cloudflare Worker that sends Web Push;
// VAPID_PUBLIC is its application server key. Both stay empty until the worker is deployed, and the app
// works fully without them (no closed-app reminders).
export const APP_VERSION = '2.0.0';
export const PUSH_API = '';
export const VAPID_PUBLIC = '';
