// Deployment configuration (public values only). PUSH_API is the Cloudflare Worker that sends Web Push;
// VAPID_PUBLIC is its application server key. Both stay empty until the worker is deployed, and the app
// works fully without them (no closed-app reminders).
export const APP_VERSION = '2.4.1';
export const PUSH_API = 'https://aurelius-push.albertoracerro.workers.dev';
export const VAPID_PUBLIC = 'BJBx7D6coDykgoTrTjMFlakT2TsrvUOC4Vdrx61SylKb2d24rKkwxId4I2DHTDsw46pYChcA5dSUR7sEHFyKZII';
