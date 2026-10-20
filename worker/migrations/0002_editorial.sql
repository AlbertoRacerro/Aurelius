-- Additive/idempotent. No modifications to subscriptions or reminders.
CREATE TABLE IF NOT EXISTS editorial_ratings(article_id TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL,published_revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS editorial_limits(bucket INTEGER PRIMARY KEY,count INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS editorial_locks(name TEXT PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL);
