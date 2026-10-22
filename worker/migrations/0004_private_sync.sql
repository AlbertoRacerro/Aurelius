-- Latest context is separate per client; credentials and full backups remain out of D1.
CREATE TABLE IF NOT EXISTS private_clients (
 client TEXT PRIMARY KEY, revision INTEGER NOT NULL, device TEXT NOT NULL DEFAULT '',
 context_hash TEXT NOT NULL, context TEXT NOT NULL, captured INTEGER NOT NULL, sha TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS private_suggestions (
 device TEXT NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL, client TEXT NOT NULL,
 context_hash TEXT NOT NULL, expires INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, ref_type TEXT NOT NULL, ref_id TEXT NOT NULL,
 PRIMARY KEY(device,id,at)
);
CREATE TABLE IF NOT EXISTS private_refresh (id INTEGER PRIMARY KEY CHECK(id=1), until_ms INTEGER NOT NULL);
INSERT OR IGNORE INTO private_refresh(id,until_ms) VALUES(1,0);
