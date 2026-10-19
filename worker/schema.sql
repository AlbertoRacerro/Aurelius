-- Aurelius push worker (Cloudflare D1). Version 1 (first deployment).
-- After the first deployment, schema changes must be shipped as idempotent migrations, not edits here.
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  ntfy TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  seen INTEGER NOT NULL,
  fails INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL DEFAULT 0
);
-- state: 0 scheduled (replaced by each sync), 1 claimed for delivery (kept so a re-sync never re-sends
-- the same id+time), 2 waiting for a retry after a transient failure (survives re-syncs).
CREATE TABLE IF NOT EXISTS reminders (
  device TEXT NOT NULL,
  id TEXT NOT NULL,
  at INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL,
  state INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device, id, at)
);
CREATE INDEX IF NOT EXISTS reminders_due ON reminders (state, at);
