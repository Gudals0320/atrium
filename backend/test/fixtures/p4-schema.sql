-- P4(커밋 d2be610)의 backend/src/store.mjs가 만드는 board.db 스키마. P5 판 옮기기 시험의 고정 자료(backend/test/p5.test.mjs)
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT) STRICT;
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY, name TEXT NOT NULL, cwd TEXT NOT NULL, group_id TEXT,
  pane_id TEXT, workspace_id TEXT, agent_name TEXT,
  model TEXT, effort TEXT, permission_mode TEXT NOT NULL, settings_path TEXT NOT NULL, hook_token TEXT NOT NULL,
  resume_argv TEXT, resume_verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, closed_at INTEGER, seen_at INTEGER, runtime TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS sessions_open ON sessions(closed_at);
CREATE TABLE IF NOT EXISTS groups (group_id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, cwd TEXT, created_at INTEGER NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS nodes (session_id TEXT PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL, z INTEGER NOT NULL DEFAULT 0) STRICT;
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, t INTEGER NOT NULL, session_id TEXT, kind TEXT NOT NULL, data TEXT) STRICT;
CREATE INDEX IF NOT EXISTS events_session ON events(session_id, id);
CREATE INDEX IF NOT EXISTS events_t ON events(t);
CREATE TABLE IF NOT EXISTS deliveries (
  delivery_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL, reason TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, sent_at INTEGER, confirmed_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE INDEX IF NOT EXISTS deliveries_session ON deliveries(session_id, created_at);
CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, session_id TEXT, group_id TEXT, text TEXT NOT NULL, created_at INTEGER NOT NULL) STRICT;
CREATE INDEX IF NOT EXISTS notes_session ON notes(session_id, id);
CREATE TABLE IF NOT EXISTS batch_items (
  item_id TEXT PRIMARY KEY, group_id TEXT NOT NULL, seq INTEGER NOT NULL, name TEXT, prompt TEXT NOT NULL, model TEXT, permission_mode TEXT,
  status TEXT NOT NULL, session_id TEXT, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS batch_items_group ON batch_items(group_id, seq);
CREATE TABLE IF NOT EXISTS links (
  link_id TEXT PRIMARY KEY, from_session TEXT NOT NULL, to_session TEXT NOT NULL, role TEXT,
  spawned INTEGER NOT NULL DEFAULT 0, observed INTEGER NOT NULL DEFAULT 0, count INTEGER NOT NULL DEFAULT 0,
  last_text TEXT, last_kind TEXT, last_at INTEGER, notify_delivery TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, removed_at INTEGER
) STRICT;
CREATE INDEX IF NOT EXISTS links_pair ON links(from_session, to_session);
CREATE TABLE IF NOT EXISTS link_events (id INTEGER PRIMARY KEY, link_id TEXT NOT NULL, t INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT, data TEXT) STRICT;
CREATE INDEX IF NOT EXISTS link_events_link ON link_events(link_id, id);
ALTER TABLE sessions ADD COLUMN touched_at INTEGER;
ALTER TABLE sessions ADD COLUMN kind TEXT;
ALTER TABLE sessions ADD COLUMN origin TEXT;
ALTER TABLE sessions ADD COLUMN parent_session_id TEXT;
ALTER TABLE deliveries ADD COLUMN group_id TEXT;
ALTER TABLE groups ADD COLUMN x REAL;
ALTER TABLE groups ADD COLUMN y REAL;
ALTER TABLE groups ADD COLUMN w REAL;
ALTER TABLE groups ADD COLUMN h REAL;
ALTER TABLE groups ADD COLUMN max_concurrent INTEGER;
ALTER TABLE groups ADD COLUMN updated_at INTEGER;
