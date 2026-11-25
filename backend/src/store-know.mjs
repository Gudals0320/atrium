// P364: 작업 지식 색인(atrium know)의 SQL. 판 DB(board.db)가 아니라 판 데이터 폴더의 know/<워크스페이스>.sqlite이고, 워크스페이스(리포)마다 따로다.
// 색인은 SQLite FTS5(trigram, BM25)만 쓴다(임베딩 없음). 덩어리 글은 chunk에 한 번만 두고 fts는 그 표를 가리킨다(external content).
// 판 DB 읽기(boardRowsOf)도 여기 둔다: SQL은 store.mjs와 store-*.mjs에만 둔다(ARCH 5절 "저장소"). 판 DB는 읽기만 한다.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const KNOW_SCHEMA_VERSION = 'know-1';
const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS source (path TEXT PRIMARY KEY, origin TEXT NOT NULL, kind TEXT NOT NULL, token TEXT, hash TEXT NOT NULL, born REAL NOT NULL, changed REAL NOT NULL, unit TEXT, size INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS chunk (id INTEGER PRIMARY KEY, path TEXT NOT NULL, a INTEGER NOT NULL, b INTEGER NOT NULL, heading TEXT NOT NULL, body TEXT NOT NULL, unit TEXT);
CREATE INDEX IF NOT EXISTS chunk_path ON chunk(path);
CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(path, heading, body, content='chunk', content_rowid='id', tokenize='trigram');
CREATE TABLE IF NOT EXISTS unitlink (unit TEXT NOT NULL, path TEXT NOT NULL, a INTEGER NOT NULL, b INTEGER NOT NULL, PRIMARY KEY (unit, path, a, b)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS gitfile (path TEXT PRIMARY KEY, born REAL NOT NULL, changed REAL NOT NULL);
CREATE TABLE IF NOT EXISTS commits (sha TEXT PRIMARY KEY, t REAL NOT NULL, subject TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS commitunit (unit TEXT NOT NULL, sha TEXT NOT NULL, PRIMARY KEY (unit, sha)) WITHOUT ROWID;
`;

export class KnowIndex {
  constructor(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.file = file;
    this.cache = new Map();
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY;');
    if (this.meta('schema') && this.meta('schema') !== KNOW_SCHEMA_VERSION) this.reset();
    this.db.exec(SCHEMA);
    this.setMeta('schema', KNOW_SCHEMA_VERSION);
  }
  st(sql) { let s = this.cache.get(sql); if (!s) { s = this.db.prepare(sql); this.cache.set(sql, s); } return s; }
  close() { try { this.db.close(); } catch {} }
  meta(key) { try { const r = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key); return r ? r.value : null; } catch { return null; } }
  setMeta(key, value) { this.st('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value == null ? null : String(value)); }
  // 처음부터 다시 짓기(know build --full, 표 모양이 바뀜)
  reset() {
    for (const t of ['fts', 'chunk', 'source', 'unitlink', 'gitfile', 'commits', 'commitunit', 'meta']) this.db.exec(`DROP TABLE IF EXISTS ${t}`);
    this.cache = new Map();
    this.db.exec(SCHEMA);
    this.setMeta('schema', KNOW_SCHEMA_VERSION);
  }
  tx(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const r = fn(); this.db.exec('COMMIT'); return r; } catch (e) { try { this.db.exec('ROLLBACK'); } catch {} throw e; } }

  // ---------- 원천 ----------
  sources(origin = null) { return origin ? this.st('SELECT * FROM source WHERE origin = ?').all(origin) : this.st('SELECT * FROM source').all(); }
  source(p) { return this.st('SELECT * FROM source WHERE path = ?').get(p) || null; }
  setToken(p, token) { this.st('UPDATE source SET token = ? WHERE path = ?').run(token, p); }
  setDates(p, born, changed) { this.st('UPDATE source SET born = ?, changed = ? WHERE path = ?').run(born, changed, p); }
  removeSource(p) {
    for (const c of this.st('SELECT id, path, heading, body FROM chunk WHERE path = ?').all(p)) this.st("INSERT INTO fts (fts, rowid, path, heading, body) VALUES ('delete', ?, ?, ?, ?)").run(c.id, c.path, c.heading, c.body);
    this.st('DELETE FROM chunk WHERE path = ?').run(p);
    this.st('DELETE FROM unitlink WHERE path = ?').run(p);
    this.st('DELETE FROM source WHERE path = ?').run(p);
  }
  // src: { path, origin, kind, token, hash, born, changed, unit, size }, chunks: [{ heading, a, b, body, unit }], links: [[unit, a, b]]
  putSource(src, chunks, links) {
    this.removeSource(src.path);
    this.st('INSERT INTO source (path, origin, kind, token, hash, born, changed, unit, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(src.path, src.origin, src.kind, src.token ?? null, src.hash, src.born, src.changed, src.unit ?? null, src.size | 0);
    for (const c of chunks) {
      const r = this.st('INSERT INTO chunk (path, a, b, heading, body, unit) VALUES (?, ?, ?, ?, ?, ?)').run(src.path, c.a, c.b, c.heading || '', c.body, c.unit ?? src.unit ?? null);
      this.st('INSERT INTO fts (rowid, path, heading, body) VALUES (?, ?, ?, ?)').run(Number(r.lastInsertRowid), src.path, c.heading || '', c.body);
    }
    for (const [u, a, b] of links) this.st('INSERT OR IGNORE INTO unitlink (unit, path, a, b) VALUES (?, ?, ?, ?)').run(u, src.path, a, b);
  }

  // ---------- git 이력(파일이 처음 생긴 때·마지막 바뀐 때, 커밋 제목의 단위 번호) ----------
  gitFiles() { const m = new Map(); for (const r of this.st('SELECT * FROM gitfile').all()) m.set(r.path, r); return m; }
  clearGit() { this.db.exec('DELETE FROM gitfile; DELETE FROM commits; DELETE FROM commitunit;'); }
  noteGitFile(p, t) { this.st('INSERT INTO gitfile (path, born, changed) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET born = min(born, excluded.born), changed = max(changed, excluded.changed)').run(p, t, t); }
  putCommit(sha, t, subject, units) {
    this.st('INSERT OR REPLACE INTO commits (sha, t, subject) VALUES (?, ?, ?)').run(sha, t, subject);
    for (const u of units) this.st('INSERT OR IGNORE INTO commitunit (unit, sha) VALUES (?, ?)').run(u, sha);
  }
  commit(prefix) { return this.st('SELECT * FROM commits WHERE sha LIKE ? ORDER BY t DESC LIMIT 2').all(`${prefix}%`); }

  // ---------- 찾기 ----------
  // FTS5 trigram BM25(경로 2, 제목 3, 본문 1). cut 앞에 생긴 원천만
  match(expr, { kind = null, cut, limit }) {
    return this.st(`SELECT c.id, c.path, c.a, c.b, c.heading, c.body, c.unit, s.kind, s.born, s.changed, s.origin, bm25(fts, 2.0, 3.0, 1.0) AS score
      FROM fts JOIN chunk c ON c.id = fts.rowid JOIN source s ON s.path = c.path
      WHERE fts MATCH ? AND (? IS NULL OR s.kind = ?) AND s.born < ? ORDER BY score LIMIT ?`).all(expr, kind, kind, cut, limit);
  }
  // 두 글자 낱말: 부분 문자열(맞은 낱말 수가 많은 것부터)
  substring(terms, { kind = null, cut, limit }) {
    const hit = terms.map(() => "(instr(lower(c.path || ' ' || c.heading || ' ' || c.body), ?) > 0)").join(' + ');
    return this.db.prepare(`SELECT c.id, c.path, c.a, c.b, c.heading, c.body, c.unit, s.kind, s.born, s.changed, s.origin, (${hit}) AS n
      FROM chunk c JOIN source s ON s.path = c.path WHERE (? IS NULL OR s.kind = ?) AND s.born < ? AND n > 0 ORDER BY n DESC, s.changed DESC, c.id LIMIT ?`).all(...terms, kind, kind, cut, limit);
  }
  chunkSpan(p) { return this.st('SELECT min(a) AS a, max(b) AS b FROM chunk WHERE path = ?').get(p); }
  unitLinks(u) { return this.st('SELECT l.path, l.a, l.b, s.kind, s.born, s.changed, s.origin FROM unitlink l JOIN source s ON s.path = l.path WHERE l.unit = ? ORDER BY l.path, l.a').all(u); }
  ownedSources(u) { return this.st('SELECT * FROM source WHERE unit = ?').all(u); }
  unitCommits(u) { return this.st('SELECT c.sha, c.t, c.subject FROM commitunit cu JOIN commits c ON c.sha = cu.sha WHERE cu.unit = ? ORDER BY c.t').all(u); }
  stats() {
    const one = (sql) => this.db.prepare(sql).get();
    return { sources: one('SELECT count(*) AS n FROM source').n, chunks: one('SELECT count(*) AS n FROM chunk').n, commits: one('SELECT count(*) AS n FROM commits').n,
      byKind: Object.fromEntries(this.db.prepare('SELECT kind, count(*) AS n FROM source GROUP BY kind').all().map((r) => [r.kind, r.n])) };
  }
}

// ---------- 판 DB 읽기(읽기 전용 연결) ----------
// 그 워크스페이스 세션들의 일(spec), 시도의 done 보고, 결정·할 일 카드. → { sessions: Map(id → name), units, tries, decisions }
export function boardRowsOf(dbFile, workspaceKey) {
  const out = { sessions: new Map(), units: [], tries: [], decisions: [] };
  if (!dbFile || !fs.existsSync(dbFile)) return out;
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const has = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
    const cols = (t) => new Set(db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name));
    if (!has('sessions') || !cols('sessions').has('workspace_key')) return out;
    for (const r of db.prepare('SELECT session_id, name FROM sessions WHERE workspace_key = ?').all(workspaceKey)) out.sessions.set(r.session_id, r.name);
    if (!out.sessions.size) return out;
    db.exec('CREATE TEMP TABLE ks (id TEXT PRIMARY KEY)');
    const ins = db.prepare('INSERT OR IGNORE INTO ks (id) VALUES (?)');
    for (const id of out.sessions.keys()) ins.run(id);
    if (has('work_units')) out.units = db.prepare('SELECT id, from_session, to_session, spec, created_at FROM work_units WHERE to_session IN (SELECT id FROM ks) OR from_session IN (SELECT id FROM ks)').all();
    if (has('unit_tries') && has('work_units')) out.tries = db.prepare('SELECT t.id, t.unit_id, t.session_id, t.ended_at, t.result, t.done_text FROM unit_tries t JOIN work_units u ON u.id = t.unit_id WHERE t.done_text IS NOT NULL AND (u.to_session IN (SELECT id FROM ks) OR u.from_session IN (SELECT id FROM ks))').all();
    if (has('decisions')) {
      const c = cols('decisions');
      out.decisions = db.prepare(`SELECT id, session_id, name, question, options, why, answer, created_at, answered_at${c.has('kind') ? ', kind' : ", NULL AS kind"}${c.has('cmds') ? ', cmds' : ', NULL AS cmds'} FROM decisions WHERE session_id IN (SELECT id FROM ks)`).all();
    }
  } finally { try { db.close(); } catch {} }
  return out;
}
// 포인터 하나의 판 DB 원문(know open db:<표>/<행>). 표는 셋만
export function boardRowText(dbFile, table, row) {
  if (!dbFile || !fs.existsSync(dbFile)) return null;
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    if (table === 'work_units') { const r = db.prepare('SELECT spec FROM work_units WHERE id = ?').get(row); return r ? r.spec : null; }
    if (table === 'unit_tries') { const r = db.prepare('SELECT done_text FROM unit_tries WHERE id = ?').get(row); return r ? r.done_text : null; }
    if (table === 'decisions') { const r = db.prepare('SELECT * FROM decisions WHERE id = ?').get(Number(row)); return r || null; }
    return null;
  } finally { try { db.close(); } catch {} }
}
