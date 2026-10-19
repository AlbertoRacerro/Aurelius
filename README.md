# Aurelius — semester OS 2026/27

Personal semester planner for iPhone: a Home Screen web app (PWA) served by GitHub Pages at
**https://albertoracerro.github.io/Aurelius/**, with an optional Cloudflare Worker that sends Web Push
reminders while the app is closed.

## What it does

- **Ora** (opens here): the block you should be doing now, time left, what comes next, and any ended
  block or focus session still waiting to be recorded.
- **Block accounting**: *Sì, tutto* records the block (one tap; for "Studio (materia da scegliere)" you
  tap the subject). *In parte* / *Altro* open a minute splitter (e.g. ATP 45 + POCI 30 + pausa 15).
  *Non so* stops asking and leaves the time as *non registrato* — unknown, never "wasted". Any block
  can be corrected later from the day list.
- **Focus timer**: 25/45/60 min on the current subject, pause/resume, stops itself at the planned
  length (also if the app was closed), then asks to confirm or correct subject and minutes.
- **Piano**: recurring Monday–Sunday template; any day can be overridden for one week or one date.
- **Statistiche**: study vs plan, per-subject and per-day hours, breaks, unaccounted time, the weekly
  targets (28 h floor, 35–36 h target, 40 h stretch — provisional, from the affirmations), backlog,
  history and a short factual weekly review.

Rules the code enforces (see `src/ledger.js`): planned time never counts unless confirmed; the same
minute is never counted twice (timer + block confirmation, overlapping corrections); time before you
started using the app is never asked about.

The seeded timetable comes from the 15 Oct 2026 affirmations and is marked *provvisorio*. Where the
source is contradictory or silent (real lesson hours, which two gym sessions, weekend hours, review
times, per-subject targets, exam dates) the app lists the point under **Piano › Da chiarire** instead
of guessing.

## Data

Everything is stored on the device (`localStorage['aurelius.v2']`, previous copy in `aurelius.v2.prev`).
The summer 2026 app's key `aurelius` is never written: on first run it is copied into the new state
as read-only history and snapshotted to `aurelius.v1.snapshot`. The old app still works at
`legacy/estate-2026.html`. **Altro › Esporta backup** writes a JSON file (share sheet on iPhone);
*Ripristina* accepts new backups and summer exports. Corrupt data is preserved, never deleted.

On iPhone, each Home Screen app has its own storage. Open Aurelius from the **same Home Screen icon**
you used in summer so it finds that data; if you reinstall the icon, export a backup first and
restore it in the new one.

## Notifications (Web Push, no Apple Developer account)

Requirements: iOS/iPadOS 16.4+, Aurelius added to the Home Screen from Safari and opened from the
icon, notifications enabled from **Altro › Attiva notifiche** (iOS only allows the prompt after a tap).
The worker sends a reminder at the end of each block (tap → that block's accounting) and when a focus
session ends. Delivery goes through Apple's push service: usually seconds, not guaranteed to the
second; the cron runs once a minute and sends up to 30 s early. Focus modes silence it unless Aurelius
is an allowed app. Optional ntfy topic (Altro › Impostazioni avanzate) is used as a fallback when a
push fails.

### One-time operator setup

```sh
cd worker
npx wrangler login          # once: opens Cloudflare in the browser (free account is enough)
./deploy.sh                 # creates D1, schema, secrets, deploys, writes src/config.js
cd .. && git commit -am "chore: configure push worker" && git push origin HEAD:main
```

Then, on the iPhone: open Aurelius from the Home Screen › Altro › Attiva notifiche › Consenti ›
Invia prova. The VAPID private key stays in `~/.config/aurelius-push/vapid.json` (not in the repo).

Worker cost: Cloudflare Workers free plan (100k requests/day, Cron Triggers, D1 free tier); this app
uses about 1,500 cron invocations per day plus a few API calls.

## Development

```sh
npm install
npm test                     # unit tests (core logic + push worker crypto/API)
npx playwright test          # iPhone-width browser tests with a controlled clock
python3 -m http.server 4173  # then open http://localhost:4173/
```

No build step: `index.html` loads ES modules from `src/`. Bump `CACHE` in `sw.js` and `APP_VERSION`
in `src/config.js` when releasing.

Not yet: multi-device sync and JarvisOS integration. The state is a single versioned JSON document
(`schema`, `migrate()` in `src/store.js`) with append-only time entries, designed to be synced later.
