-- Aurelius push worker (Cloudflare D1)
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
CREATE TABLE IF NOT EXISTS reminders (
  device TEXT NOT NULL,
  id TEXT NOT NULL,
  at INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL,
  PRIMARY KEY (device, id)
);
CREATE INDEX IF NOT EXISTS reminders_at ON reminders (at);
-- Reminders already claimed for delivery, so a later re-sync of the same (id, at) is not sent twice.
CREATE TABLE IF NOT EXISTS sent (
  device TEXT NOT NULL,
  id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (device, id, at)
);
