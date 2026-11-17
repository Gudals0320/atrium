// 저장소(store.mjs)의 P204 표: 동료 소식(peer_news)과 세션마다 읽은 자리(peer_news_seen).
// 동료 소식: 세션이 한 일을 판이 남기는 한 줄. kind: turn(턴 끝: 받은 일 + 답 첫 줄) | done(atrium done 값 + 보고 첫 줄) | log(atrium log 한 줄).
// 누구에게도 보내지 않는다. 동료는 필요할 때 atrium news로 읽는다(peer-news.mjs).
// 오래 쌓지 않는다: 세션마다 최근 NEWS_KEEP_ROWS줄, NEWS_KEEP_MS(7일)까지. 넣을 때 그 세션의 넘친 줄과 판 전체의 오래된 줄을 지운다.
// 옮기기: CREATE TABLE IF NOT EXISTS라 옛 board.db에는 빈 표가 생긴다. SQL은 store.mjs와 store-*.mjs에만 둔다(ARCH 5절 "저장소").

export const NEWS_KEEP_ROWS = 200;
export const NEWS_KEEP_MS = 7 * 24 * 3600 * 1000;

export const NEWS_SCHEMA = `
CREATE TABLE IF NOT EXISTS peer_news (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, name TEXT, at INTEGER NOT NULL, kind TEXT NOT NULL, task TEXT, text TEXT NOT NULL, result TEXT, prompt_at INTEGER) STRICT;
CREATE INDEX IF NOT EXISTS peer_news_session ON peer_news(session_id, id);
CREATE INDEX IF NOT EXISTS peer_news_at ON peer_news(at);
CREATE TABLE IF NOT EXISTS peer_news_seen (session_id TEXT PRIMARY KEY, last_id INTEGER NOT NULL) STRICT;
`;

const newsRow = (r) => (r ? { id: Number(r.id), sessionId: r.session_id, name: r.name ?? null, at: r.at, kind: r.kind, task: r.task ?? null, text: r.text, result: r.result ?? null, promptAt: r.prompt_at ?? null } : null);
const marks = (ids) => ids.map(() => '?').join(', ');

export function installNews(Store) {
  Object.assign(Store.prototype, {
    // 한 줄을 넣고 보관 상한을 지킨다 → 넣은 줄
    addNews(n, { keepRows = NEWS_KEEP_ROWS, keepMs = NEWS_KEEP_MS } = {}) {
      const r = this.st('INSERT INTO peer_news (session_id, name, at, kind, task, text, result, prompt_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(n.sessionId, n.name ?? null, n.at, n.kind, n.task ?? null, n.text, n.result ?? null, n.promptAt ?? null);
      this.st('DELETE FROM peer_news WHERE session_id = ? AND id <= (SELECT id FROM peer_news WHERE session_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)').run(n.sessionId, n.sessionId, keepRows);
      this.st('DELETE FROM peer_news WHERE at < ?').run(n.at - keepMs);
      return newsRow(this.st('SELECT * FROM peer_news WHERE id = ?').get(r.lastInsertRowid));
    },
    // 그 세션의 마지막 줄(kind를 주면 그 종류의)
    lastNewsOf(sessionId, kind = null) {
      return newsRow(kind ? this.st('SELECT * FROM peer_news WHERE session_id = ? AND kind = ? ORDER BY id DESC LIMIT 1').get(sessionId, kind) : this.st('SELECT * FROM peer_news WHERE session_id = ? ORDER BY id DESC LIMIT 1').get(sessionId));
    },
    // 세션들의 줄: after(그 id 뒤)부터 오래된 것부터 limit줄
    newsAfter(ids, after, limit) {
      if (!ids.length) return [];
      return this.st(`SELECT * FROM peer_news WHERE session_id IN (${marks(ids)}) AND id > ? ORDER BY id LIMIT ?`).all(...ids, after, limit).map(newsRow);
    },
    // 세션들의 최근 limit줄(오래된 것부터 돌려준다)
    newsRecent(ids, limit) {
      if (!ids.length) return [];
      return this.st(`SELECT * FROM peer_news WHERE session_id IN (${marks(ids)}) ORDER BY id DESC LIMIT ?`).all(...ids, limit).map(newsRow).reverse();
    },
    // 읽지 않은 줄의 수(세션마다)
    newsCounts(ids, after) {
      if (!ids.length) return [];
      return this.st(`SELECT session_id, COUNT(*) AS n FROM peer_news WHERE session_id IN (${marks(ids)}) AND id > ? GROUP BY session_id`).all(...ids, after).map((r) => ({ sessionId: r.session_id, n: Number(r.n) }));
    },
    newsSeen(sessionId) { const r = this.st('SELECT last_id FROM peer_news_seen WHERE session_id = ?').get(sessionId); return r ? Number(r.last_id) : 0; },
    setNewsSeen(sessionId, lastId) { this.st('INSERT INTO peer_news_seen (session_id, last_id) VALUES (?, ?) ON CONFLICT(session_id) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)').run(sessionId, lastId); },
  });
}
