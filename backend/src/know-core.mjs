// P364: atrium know의 본체(동기). know-worker.mjs가 worker thread 안에서 부르고, 시험은 바로 부른다.
// - refresh: 색인을 짓거나(처음·--full) 바뀐 것만 고친다(경로·크기·고친 시각 → 해시). git 이력, 파일, 판 DB 행
// - search: FTS5 trigram BM25 상위 k개의 위치·날짜·단위·종류·짧은 발췌. 두 글자 낱말은 부분 문자열
//   P371: 순위·포인터·발췌의 단위는 절(제목 경계)이다. 한 파일은 맞은 낱말이 가장 몰린 절 하나가 대표하고(다른 맞은 절은 꼬리표),
//   발췌는 그 절 안에서 맞은 줄(줄 번호)과 그 둘레다. 같은 글의 복사본은 한 자리로 접고(같은 글 꼬리표), 부른 세션의 단위(selfUnit)에 딸린
//   자기 파일(작업 파일·기록·판 일·done, 코드는 빼고)은 --self가 아니면 뺀다(지휘 세션·사람은 단위가 없어 그대로)
// - open: 포인터의 원문(색인에 든 원천만), unit: 그 단위의 파일·기록·판 일·커밋을 순위와 상관없이
// - format: 사람·에이전트가 읽는 글(첫 줄에 돌려준 글자 수) 또는 JSON(total_chars)
// 결정 상태: 쓰는 쪽이 .atrium/know.json superseded에 선언한 것만 "대체됨 → 지금: …"으로 붙인다(LLM 판정 없음). 결과의 status 칸
import fs from 'node:fs';
import path from 'node:path';
import { KnowIndex, boardRowsOf, boardRowText } from './store-know.mjs';
import { listFiles, scanGitLog, readText, tokenOf, bornOf, ownerOf, sha1, boardSources, decisionText, gitOut } from './know-sources.mjs';
import { mdChunks, commentChunks, unitsIn, lex, ftsExpr, shortTerms, sectionExcerpt, maskLine, parsePointer, parseWhen, normalizeRetired, retiredFlags, normalizeSuperseded, supersededOf, supersededLine, redact,
  normLines, copyReason, NO_CUT, OPEN_LINES_MAX, KNOW_K_DEFAULT, KNOW_K_MAX, KNOW_KINDS, ALSO_MAX, dayOf, minuteOf, parseUnit } from './know-text.mjs';

const kerr = (code, message) => Object.assign(new Error(message), { code });
const indexes = new Map(); // 색인 파일 → KnowIndex(worker 안에서 열어 둔다)
const lastRefresh = new Map(); // 색인 파일 → 마지막 고침 시각
export const FRESH_MS = 3000; // 이보다 가까이 고쳤으면 묻기 전 고침을 건너뛴다

export function indexOf(file) {
  let idx = indexes.get(file);
  if (!idx) { idx = new KnowIndex(file); indexes.set(file, idx); }
  return idx;
}
export function closeAll() { for (const i of indexes.values()) i.close(); indexes.clear(); lastRefresh.clear(); }

// 원천 하나의 덩어리와 단위 연결
function chunksOf(rel, kind, text) {
  const raw = kind === 'code' ? commentChunks(text, path.posix.extname(rel)) : mdChunks(text);
  const chunks = []; const links = [];
  for (const c of raw) {
    const body = redact(c.body);
    let unit = null;
    if (kind === 'code') {
      const seen = new Set();
      c.body.split('\n').forEach((l, i) => { const n = c.a + i; for (const u of unitsIn(l)) { seen.add(u); links.push([u, n, n]); } }); // P371: body의 i번째 줄 = 원문 a+i줄
      if (seen.size === 1) unit = [...seen][0];
    } else for (const u of unitsIn(`${c.heading}\n${c.body}`)) links.push([u, c.a, c.b]);
    chunks.push({ heading: c.heading, a: c.a, b: c.b, sa: c.sa, sb: c.sb, body, unit }); // P371: 절 범위
  }
  return { chunks, links };
}
// 색인 짓기·고치기. o: { root, key, dbFile, indexFile, full }
export function refresh(o) {
  const t0 = performance.now();
  const idx = indexOf(o.indexFile);
  if (o.full) idx.reset();
  const stats = { indexed: 0, removed: 0, unchanged: 0, skipped: 0 };
  idx.tx(() => {
    const repo = fs.existsSync(path.join(o.root, '.git')) || null;
    const git = repo ? scanGitLog(idx, o.root, !!o.full) : { head: null, commits: 0 };
    stats.commits = git.commits;
    const gf = idx.gitFiles();
    const seen = new Set();
    const { files } = fs.existsSync(o.root) ? listFiles(o.root) : { files: [] };
    for (const f of files) {
      const abs = path.join(o.root, f.rel);
      let st; try { st = fs.statSync(abs); } catch { continue; }
      const g = f.tracked ? gf.get(f.rel) : null;
      const old = idx.source(f.rel);
      // 생긴 때: 추적 파일은 처음 커밋, git 밖 파일은 처음 본 때(만든 시각·고친 시각 가운데 앞선 것)를 지킨다(고쳐도 뒤로 밀리지 않는다)
      const born = g ? g.born : old && old.origin === 'file' ? Math.min(old.born, bornOf(st)) : bornOf(st);
      const changed = g ? Math.max(g.changed, 0) : st.mtimeMs;
      const token = tokenOf(st);
      if (old && old.token === token && old.kind === f.kind) { seen.add(f.rel); stats.unchanged++; if (old.born !== born || old.changed !== changed) idx.setDates(f.rel, born, changed); continue; }
      const r = readText(abs);
      if (!r || r.skip) { stats.skipped++; continue; }
      const hash = sha1(r.text);
      seen.add(f.rel);
      if (old && old.hash === hash && old.kind === f.kind) { idx.setToken(f.rel, token); if (old.born !== born || old.changed !== changed) idx.setDates(f.rel, born, changed); stats.unchanged++; continue; }
      const { chunks, links } = chunksOf(f.rel, f.kind, r.text);
      const unit = ownerOf(f.rel);
      idx.putSource({ path: f.rel, origin: 'file', kind: f.kind, token, hash, born, changed, unit, size: r.text.length }, chunks, links);
      stats.indexed++;
    }
    // 판 DB(그 워크스페이스 세션들의 일·done 보고·카드)
    const rows = o.key ? boardRowsOf(o.dbFile, o.key) : null;
    for (const s of rows ? boardSources(rows) : []) {
      const hash = sha1(`${s.heading}\n${s.text}\n${s.changed}`);
      seen.add(s.path);
      const old = idx.source(s.path);
      if (old && old.hash === hash) { stats.unchanged++; continue; }
      const body = redact(s.text);
      const links = [...unitsIn(body)].map((u) => [u, 0, 0]);
      if (s.unit && !links.some((l) => l[0] === s.unit)) links.push([s.unit, 0, 0]);
      const lines = body.split('\n').length;
      idx.putSource({ path: s.path, origin: 'db', kind: 'db', token: null, hash, born: s.born, changed: s.changed, unit: s.unit, size: body.length }, mdChunks(body).map((c) => ({ ...c, heading: c.heading || s.heading })), links.map(([u]) => [u, 1, lines]));
      stats.indexed++;
    }
    for (const s of idx.sources()) if (!seen.has(s.path)) { idx.removeSource(s.path); stats.removed++; }
    idx.setMeta('builtAt', Date.now());
  });
  lastRefresh.set(o.indexFile, Date.now());
  const st = idx.stats();
  let bytes = 0; for (const sfx of ['', '-wal']) try { bytes += fs.statSync(o.indexFile + sfx).size; } catch {}
  return { ...stats, ...st, bytes, seconds: Math.round(performance.now() - t0) / 1000 };
}
function ensureFresh(o) {
  const idx = indexOf(o.indexFile);
  const built = idx.meta('builtAt');
  if (!built) return refresh(o); // 처음 물을 때 짓는다
  const last = lastRefresh.get(o.indexFile) || 0;
  if (o.noRefresh || Date.now() - last < (o.freshMs ?? FRESH_MS)) return null;
  return refresh(o);
}

// --before: 시각(YYYY-MM-DD[THH:MM], ISO) 또는 커밋(해시·ref) → 밀리초
export function cutoffOf(before, root) {
  if (before == null || before === '') return NO_CUT;
  const t = parseWhen(before);
  if (t != null) return t;
  if (/^[A-Za-z0-9_./~^-]{2,80}$/.test(String(before))) {
    const out = gitOut(root, ['show', '-s', '--format=%ct', `${before}^{commit}`, '--']);
    if (out && /^\d+$/.test(out.trim())) return Number(out.trim()) * 1000;
  }
  throw kerr('bad_request', `--before에는 날짜·시각(2026-11-20, 2026-11-20T18:00)이나 이 저장소의 커밋을 준다: ${before}`);
}
// 저장소의 선언(.atrium/know.json, git 밖): retired(걷어낸 기능), superseded(대체된 결정). 없거나 깨졌으면 둘 다 빈 목록
export function configOf(root) {
  let j = null;
  try { j = JSON.parse(fs.readFileSync(path.join(root, '.atrium', 'know.json'), 'utf8').replace(/^\uFEFF/, '')); } catch {}
  return { retired: normalizeRetired(j && j.retired), superseded: normalizeSuperseded(j && j.superseded) };
}
// 결과의 상태 칸: 대체 선언에 맞으면 { state: 'superseded', now, pointer, id, since, scope, more }, 아니면 null
const statusOf = (list) => (list.length ? { state: 'superseded', ...list[0], ...(list.length > 1 ? { more: list.slice(1) } : {}) } : null);

// 찾기. a: { q, k, kind, before, self, selfUnit }
export function search(o, a = {}) {
  const q = String(a.q || '').trim();
  if (!q) throw kerr('bad_request', '물음을 준다: atrium know "<물음>"');
  const k = Math.max(1, Math.min(KNOW_K_MAX, Number(a.k) || KNOW_K_DEFAULT));
  const kind = a.kind ? String(a.kind) : null;
  if (kind && !KNOW_KINDS.includes(kind)) throw kerr('bad_request', `--kind는 ${KNOW_KINDS.join('|')}`);
  const cut = cutoffOf(a.before, o.root);
  const built = ensureFresh(o);
  const idx = indexOf(o.indexFile);
  const terms = lex(q); const expr = ftsExpr(terms);
  // 두 글자 이하 낱말은 부분 문자열로(한 글자뿐인 물음도)
  const shorts = terms.length ? shortTerms(terms) : [...new Set(q.toLowerCase().split(/\s+/).filter(Boolean))].slice(0, 8);
  let rows; let mode;
  if (expr) {
    rows = idx.match(expr, { kind, cut, limit: 240 });
    mode = 'fts5';
    if (shorts.length && rows.length) {
      mode = 'fts5+substring';
      const hits = (r) => { const t = `${r.path} ${r.heading} ${r.body}`.toLowerCase(); return shorts.filter((s) => t.includes(s)).length; };
      rows = rows.map((r) => ({ ...r, score: r.score * (1 + 0.5 * hits(r)) })).sort((x, y) => x.score - y.score);
    }
  } else if (shorts.length) { rows = idx.substring(shorts, { kind, cut, limit: 240 }); mode = 'substring'; }
  else throw kerr('bad_request', '찾을 낱말이 없다(두 글자 이상의 낱말을 준다)');
  const conf = configOf(o.root);
  const searchTerms = terms.length ? [...terms] : shorts;
  const files = rankSections(rows, searchTerms, mode);
  const selfUnit = a.self ? null : parseUnit(a.selfUnit);
  const results = []; const kept = []; let hidden = 0;
  for (const f of files) {
    const r = f.rep.row;
    // 자기 단위의 것(코드 주석은 남긴다): 부른 세션이 이미 가진 글이라 자리만 차지한다
    if (selfUnit && r.kind !== 'code' && (r.sunit === selfUnit || (r.origin === 'db' && r.unit === selfUnit))) { hidden++; continue; }
    const ex = sectionExcerpt(f.rep.parts, searchTerms);
    if (!ex.text) continue;
    const pointer = r.origin === 'db' ? r.path : `${r.path}:${f.rep.sa}-${f.rep.sb}`;
    const me = { path: r.path, origin: r.origin, hash: r.hash, unit: r.sunit || null, lines: normLines(f.rep.parts.map((p) => p.body).join('\n')) };
    const twin = kept.find((x) => copyReason(x.me, me));
    if (twin) { (twin.res.copies ||= []).push(pointer); continue; }
    const body = f.rep.parts.map((p) => p.body).join('\n');
    const hit = { path: r.path, a: f.rep.sa, b: f.rep.sb, unit: r.unit, heading: f.rep.heading, body };
    const src = { path: r.path, changed: r.changed };
    const flags = retiredFlags(conf.retired, src, hit, cut);
    const sup = supersededOf(conf.superseded, hit, cut);
    if (sup.length) flags.unshift('대체됨');
    if (cut < NO_CUT && r.changed >= cut) flags.push(`뒤에 바뀜(${dayOf(r.changed)})`);
    const also = r.origin === 'db' ? [] : f.others.slice(0, ALSO_MAX).map((s) => `${s.sa}-${s.sb}`);
    const res = { pointer, kind: r.kind, date: dayOf(r.changed), at: Math.round(r.changed), unit: r.unit || r.sunit || null,
      ...(f.rep.heading && r.origin !== 'db' ? { heading: f.rep.heading.slice(0, 80) } : {}), flags, status: statusOf(sup), excerpt: ex.text,
      ...(ex.line != null && r.origin !== 'db' ? { line: ex.line } : {}), ...(also.length ? { also } : {}), ...(sup.length ? { notes: sup.map(supersededLine) } : {}) };
    results.push(res); kept.push({ me, res });
    if (results.length >= k) break;
  }
  return { command: 'search', mode, q, k, kind, before: a.before || null, results, ...(parseUnit(a.selfUnit) ? { self: { unit: parseUnit(a.selfUnit), included: !!a.self, hidden } } : {}), ...(built ? { built: brief(built) } : {}) };
}
// P371: 덩어리 행 → 파일 순위. 행은 이미 점수 순(작을수록 좋음)이다. 같은 절(경로·sa)의 덩어리를 묶고, 절마다 맞은 낱말 수(cov)를 센다.
// 절 점수 = 가장 좋은 덩어리 점수 × (1 + 0.25 × (cov − 1)). 파일 대표 = cov가 가장 큰 절(같으면 점수), 파일 순위 = 대표 절의 점수.
// → [{ rep: { row, sa, sb, heading, parts, score, cov }, others: [다른 맞은 절, 점수 순] }]
export function rankSections(rows, terms, mode = 'fts5') {
  const covers = (text, t) => text.includes(t) || (t.length >= 4 && /^[가-힣]+$/.test(t) && text.includes(t.slice(0, 3)));
  const secs = new Map();
  rows.forEach((r, i) => {
    const s0 = mode === 'substring' ? i : r.score; // 부분 문자열은 이미 맞은 수 순이라 차례가 점수
    const key = `${r.path}\n${r.sa ?? r.a}`;
    let g = secs.get(key);
    if (!g) { g = { row: r, sa: r.sa ?? r.a, sb: r.sb ?? r.b, heading: r.heading || '', parts: [], best: s0, hit: new Set() }; secs.set(key, g); }
    if (s0 < g.best) { g.best = s0; g.row = r; }
    g.parts.push({ a: r.a, body: r.body });
    const text = `${r.heading || ''}\n${r.body || ''}`.toLowerCase();
    for (const t of terms) if (covers(text, t)) g.hit.add(t);
  });
  const byFile = new Map();
  for (const g of secs.values()) {
    g.cov = g.hit.size;
    g.score = mode === 'substring' ? g.best - 1000 * g.cov : g.best * (1 + 0.25 * Math.max(0, g.cov - 1));
    g.parts.sort((x, y) => x.a - y.a);
    const list = byFile.get(g.row.path) || [];
    list.push(g); byFile.set(g.row.path, list);
  }
  const files = [];
  for (const list of byFile.values()) {
    list.sort((x, y) => y.cov - x.cov || x.score - y.score);
    const [rep, ...rest] = list;
    files.push({ rep, others: rest.filter((s) => s.cov > 0).sort((x, y) => x.score - y.score) }); // 경로만 맞은 절은 꼬리표에 넣지 않는다
  }
  return files.sort((x, y) => x.rep.score - y.rep.score);
}
const brief = (b) => ({ seconds: b.seconds, indexed: b.indexed, removed: b.removed, sources: b.sources });

// 원문 열기. a: { pointer, context, before }
export function open(o, a = {}) {
  const p = parsePointer(a.pointer);
  if (!p) throw kerr('bad_request', '포인터를 준다: atrium know open <경로:줄-줄 | db:<표>/<행> | git:<커밋>>');
  const cut = cutoffOf(a.before, o.root);
  ensureFresh(o);
  const idx = indexOf(o.indexFile);
  const ctx = Math.max(0, Math.min(50, Number(a.context) || 0));
  if (p.type === 'git') {
    const c = idx.commit(p.sha);
    if (c.length !== 1) throw kerr('not_found', c.length ? '커밋 앞머리가 여럿에 맞는다. 더 길게 준다' : '색인에 없는 커밋이다');
    if (c[0].t >= cut) throw kerr('not_found', '--before 경계 뒤의 커밋이다');
    return { command: 'open', pointer: `git:${c[0].sha.slice(0, 12)}`, text: `${c[0].sha.slice(0, 12)} ${minuteOf(c[0].t)} ${maskLine(c[0].subject)}` };
  }
  const src = idx.source(p.path);
  if (!src) throw kerr('not_found', `색인에 없는 원천이다: ${p.path}(atrium know 결과의 포인터를 준다)`);
  if (src.born >= cut) throw kerr('not_found', '--before 경계 뒤에 생긴 원천이다');
  let lines;
  if (src.origin === 'db') {
    const v = boardRowText(o.dbFile, p.table, p.row);
    if (v == null) throw kerr('not_found', '판 DB에서 그 행을 찾지 못했다');
    lines = (typeof v === 'string' ? v : decisionText(v)).replace(/\r\n/g, '\n').split('\n');
  } else {
    const r = readText(path.join(o.root, src.path));
    if (!r || r.skip) throw kerr('not_found', '파일이 없거나 읽을 수 없다(지워졌거나 커졌다)');
    lines = r.text.split('\n');
  }
  const a0 = p.a || 1; const b0 = p.b || lines.length;
  if (a0 > lines.length) throw kerr('bad_request', `줄 범위가 원문(${lines.length}줄)을 벗어난다`);
  const from = Math.max(1, a0 - ctx); const to = Math.min(lines.length, b0 + ctx, from + OPEN_LINES_MAX - 1);
  const body = [];
  for (let n = from; n <= to; n++) body.push(`${String(n).padStart(5)}  ${maskLine(lines[n - 1])}`);
  const more = Math.min(lines.length, b0 + ctx) > to ? `\n(… ${Math.min(lines.length, b0 + ctx) - to}줄 더. 범위를 좁히거나 파일을 직접 연다)` : '';
  const sup = supersededOf(configOf(o.root).superseded, { path: src.path, a: from, b: to, unit: src.unit, heading: '', body: lines.slice(from - 1, to).join('\n') }, cut);
  return { command: 'open', pointer: p.type === 'db' ? src.path : `${src.path}:${from}-${to}`, kind: src.kind, date: dayOf(src.changed), status: statusOf(sup), text: body.join('\n') + more + (sup.length ? `\n${sup.map(supersededLine).join('\n')}` : '') };
}

// 단위 나열. a: { unit, before }
const KIND_ORDER = ['doc', 'log', 'record', 'review', 'db', 'code', 'commit'];
export function unit(o, a = {}) {
  const u = parseUnit(a.unit);
  if (!u) throw kerr('bad_request', '단위 번호를 준다(예: atrium know unit P201)');
  const cut = cutoffOf(a.before, o.root);
  ensureFresh(o);
  const idx = indexOf(o.indexFile);
  const items = []; const owned = new Set();
  for (const s of idx.ownedSources(u)) {
    if (s.born >= cut) continue;
    owned.add(s.path);
    const span = idx.chunkSpan(s.path);
    items.push({ pointer: s.origin === 'db' ? s.path : `${s.path}:${span && span.a ? span.a : 1}-${span && span.b ? span.b : 1}`, kind: s.kind, date: dayOf(s.changed), at: s.changed, unit: u, how: '단위의 것' });
  }
  const byPath = new Map();
  for (const l of idx.unitLinks(u)) {
    if (owned.has(l.path) || l.born >= cut) continue;
    const g = byPath.get(l.path);
    if (g) g.n++; else byPath.set(l.path, { ...l, n: 1 });
  }
  const LINK_MAX = 60;
  const linked = [...byPath.values()].sort((x, y) => KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind) || x.changed - y.changed);
  for (const l of linked.slice(0, LINK_MAX)) items.push({ pointer: l.origin === 'db' ? l.path : `${l.path}:${l.a}-${l.b}`, kind: l.kind, date: dayOf(l.changed), at: l.changed, unit: u, how: l.n > 1 ? `언급 ${l.n}곳` : '언급' });
  const commits = idx.unitCommits(u).filter((c) => c.t < cut);
  const COMMIT_MAX = 40;
  for (const c of commits.slice(-COMMIT_MAX)) items.push({ pointer: `git:${c.sha.slice(0, 12)}`, kind: 'commit', date: dayOf(c.t), at: c.t, unit: u, how: maskLine(c.subject).slice(0, 100) });
  items.sort((x, y) => (x.how === '단위의 것' ? 0 : 1) - (y.how === '단위의 것' ? 0 : 1) || KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind) || x.at - y.at);
  return { command: 'unit', unit: u, before: a.before || null, results: items.map(({ at, ...x }) => x), more: { links: Math.max(0, linked.length - LINK_MAX), commits: Math.max(0, commits.length - COMMIT_MAX) } };
}

// ---------- 출력 ----------
function block(cmd, x) {
  if (cmd === 'open') return x.text;
  if (cmd === 'unit') return `${x.pointer}  [${x.kind} · ${x.date}] ${x.how}`;
  const meta = [x.kind, x.date, x.unit || '단위 없음', ...(x.flags || [])].join(' · ');
  // P371: 발췌 앞의 L<줄>은 맞은 줄의 원문 줄 번호. 같은 글(접은 복사본 자리)과 같은 파일의 다른 맞은 절은 꼬리표 한 줄씩
  const copies = x.copies && x.copies.length ? `\n  같은 글: ${x.copies.slice(0, 3).map((p) => p.replace(/:\d+-\d+$/, '')).join(', ')}${x.copies.length > 3 ? ` 외 ${x.copies.length - 3}곳` : ''}` : '';
  const also = x.also && x.also.length ? `\n  다른 절: ${x.also.join(', ')}` : '';
  return `${x.pointer}  [${meta}]${x.heading ? ` § ${x.heading}` : ''}\n  ${x.line ? `L${x.line} ` : ''}${x.excerpt}${copies}${also}${(x.notes || []).map((n) => `\n  ${n}`).join('')}`;
}
// 결과 → { out(그대로 찍을 글), pointers: [{ pointer, chars }], total }. 첫 줄의 글자 수는 마지막 줄바꿈까지 센 out 전체의 글자 수다
export function format(res, json = false) {
  const cmd = res.command;
  const items = cmd === 'open' ? [res] : res.results || [];
  const blocks = items.map((x) => block(cmd, x));
  const sizes = json ? items.map((x) => JSON.stringify(x).length) : blocks.map((b) => b.length + 1);
  let n = 0; let out = '';
  for (let i = 0; i < 4; i++) {
    if (json) out = JSON.stringify({ total_chars: n, ...res }) + '\n';
    else {
      const head = cmd === 'search' ? `총 ${n}자 · ${res.mode} · ${items.length}건${res.before ? ` · ${res.before} 앞` : ''}${res.built ? ` · 색인 고침 ${res.built.seconds}초` : ''}`
        : cmd === 'unit' ? `총 ${n}자 · ${res.unit} · ${items.length}곳${res.more && (res.more.links || res.more.commits) ? ` (더 있음: 언급 ${res.more.links}, 커밋 ${res.more.commits})` : ''}`
        : cmd === 'open' ? `총 ${n}자 · ${res.pointer}${res.kind ? ` [${res.kind} · ${res.date}]` : ''}`
        : `총 ${n}자 · ${cmd}`;
      const tail = cmd === 'search' && items.length ? '원문: atrium know open <포인터> [--context n] 또는 그 파일을 직접 연다' : cmd === 'search' ? '없다. 낱말을 바꾸거나 --kind를 뺀다' : null;
      const self = cmd === 'search' && res.self && res.self.hidden ? `자기 단위 ${res.self.unit}의 것 ${res.self.hidden}곳은 뺐다(--self로 넣는다)` : null; // P371
      out = [head, ...blocks, ...(self ? [self] : []), ...(tail ? [tail] : []), ...(res.lines || [])].join('\n') + '\n';
    }
    if (out.length === n) break;
    n = out.length;
  }
  return { out, pointers: items.map((x, i) => ({ pointer: x.pointer, chars: sizes[i] })), total: out.length };
}

// worker 진입: op → 결과(format까지)
export function runOp(op, args = {}) {
  const o = args.ctx;
  if (op === 'build') { const r = refresh({ ...o, full: !!args.full }); return { command: 'build', stats: r, ...format({ command: 'build', lines: [JSON.stringify(r)] }, false), ...(args.json ? { out: JSON.stringify({ command: 'build', stats: r }) + '\n' } : {}) }; }
  if (op === 'refresh') return refresh(o);
  const res = op === 'search' ? search(o, args) : op === 'open' ? open(o, args) : op === 'unit' ? unit(o, args) : null;
  if (!res) throw kerr('bad_request', `알 수 없는 know 명령: ${op}`);
  return { ...format(res, !!args.json), result: res };
}
