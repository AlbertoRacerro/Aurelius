-- Separate from public editorial payloads. No personal text is stored in D1.
CREATE TABLE IF NOT EXISTS personal_limits (bucket INTEGER PRIMARY KEY, count INTEGER NOT NULL);
