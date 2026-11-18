// P222: rig 2의 R5 산출물 섹터(docs research rig2-design.md 2절 "산출물 섹터", 2.1, 3절 docs의 intake·keep과 loops의 produces, 5절, 9절 Q3, 11.4의 4번). 등록만 한다.
// - 섹터: role "sector"인 문서(폴더). intake는 register(기본: 제자리에 두고 보드가 적는다). move·copy는 받기만 하고 register처럼 돈다(경고).
//   keep: 개수(양의 정수, 섹터마다 살아 있는 산출물 n개)나 기간("90d"). 넘친 것은 등록부에서 밀려남(superseded, why keep)으로 표시만 하고 파일은 지우지 않는다.
//   경로가 "{owns}"인 섹터는 일마다 경로가 정해지는 칸(R7 전)이라 아직 산출물을 받지 않는다.
// - 내기: 자리 세션이 atrium done ok "<보고>" --artifact <경로>(여럿)로 낸다. 경로는 섹터 폴더 안의 파일이나 폴더여야 한다(아니면 done을 거절하고 섹터 경로를 알린다).
//   done 훅이 { "artifacts": ["<저장소 기준 경로>"] }를 돌려주면 그것도 받는다(틀린 경로는 거절하지 않고 장부에 artifact_warning 한 줄).
// - 등록: 표 rig_artifacts에 한 줄(섹터, 경로, SHA-256, 크기, 고리, 회, 일, 자리, 세션, 시각, 상태 new | accepted | superseded). 같은 경로를 다시 내면 앞 줄은 밀려남(why same_path).
//   회가 done으로 닫히면 그 회의 새것은 받아들임(accepted). 고리가 produces를 가졌는데 그 회가 아무것도 내지 않았으면 장부에 artifact_warning(produces_none) 한 줄.
// - 장부: artifact_filed · artifact_superseded · artifact_accepted · artifact_warning(rig-ledger.mjs). artifact_moved는 move가 들어올 때 더한다.
// - 읽기: atrium rig artifacts [--sector <이름>] [--run <회>] [--json](rig-admin), 판 API rig.artifacts, rig.map의 섹터 마디(최근 몇 개와 수)와 회 오버레이.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { rigEvent } from './rig-ledger.mjs';

export const ARTIFACT_STATES = ['new', 'accepted', 'superseded'];
export const LIVE_ARTIFACT = ['new', 'accepted'];
export const ARTIFACTS_MAX = 20; // done 한 번에 낼 수 있는 수
export const MAP_RECENT = 3; // 구조 지도 섹터 마디에 싣는 최근 산출물 수
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
const DIR_MAX_ENTRIES = 2000;
const DIR_SKIP = new Set(['.git', 'node_modules']);

function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const insideStrict = (root, f) => { const r = path.relative(root, f); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
const slash = (p) => String(p).split(path.sep).join('/').replace(/\\/g, '/');

// keep → { count } | { ms, text } | null(없음) | { bad: true }
export function parseKeep(v) {
  if (v == null) return null;
  if (Number.isInteger(v) && v > 0) return { count: v };
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^\d+$/.test(s) && Number(s) > 0) return { count: Number(s) };
    const m = /^(\d+(?:\.\d+)?)\s*([smhdw])$/.exec(s);
    if (m && Number(m[1]) > 0) return { ms: Math.floor(Number(m[1]) * UNIT_MS[m[2]]), text: s };
  }
  return { bad: true };
}
export const keepText = (k) => (!k ? null : k.count ? `최근 ${k.count}개` : `${k.text} 안`);

// 정의의 섹터 목록 → [{ name, rel(폴더, / 끝) | null, owns, intake, keep }]
export function sectorsOf(def) {
  const docs = (def && def.docs) || {};
  return Object.values(docs).filter((d) => d.role === 'sector').map((d) => ({ name: d.name, rel: d.rel ? (d.rel.endsWith('/') ? d.rel : `${d.rel}/`) : null, owns: !d.rel, layer: d.layer, intake: d.intake || 'register', keep: d.keepRule || parseKeep(d.keep) }));
}
const sectorList = (secs) => secs.filter((x) => x.rel).map((x) => `${x.name}(${x.rel})`).join(', ') || '(없음)';

// 경로 하나 → { ok, sector, rel, abs, dir } | { ok: false, reason }. p: 절대 경로(CLI가 세션의 현재 폴더로 푼다)나 저장소 기준 경로.
//   cwd: 부른 세션의 폴더(워크트리면 그 워크트리 안 경로를 저장소 기준으로 읽는다)
export function resolveArtifact(def, root, p, { cwd = null } = {}) {
  const secs = sectorsOf(def).filter((x) => x.rel && x.layer === 'project');
  const raw = String(p ?? '').trim();
  if (!raw) return { ok: false, reason: '빈 경로다' };
  if (!secs.length) return { ok: false, reason: '이 rig 정의에는 산출물을 받는 섹터(role "sector", 저장소 안 폴더)가 없다' };
  let abs = path.isAbsolute(raw) || /^[A-Za-z]:/.test(raw) ? path.resolve(raw) : path.resolve(root, raw);
  let base = root;
  if (!insideStrict(root, abs) && cwd && path.resolve(cwd) !== path.resolve(root) && insideStrict(cwd, abs)) base = cwd; // 워크트리 안의 산출물
  if (!insideStrict(base, abs)) return { ok: false, reason: `${raw}: 워크스페이스 밖이다. 산출물은 섹터 폴더 안에 둔다: ${sectorList(secs)}` };
  const rel = slash(path.relative(base, abs));
  const hit = secs.filter((x) => (rel + '/').startsWith(x.rel) && rel + '/' !== x.rel).sort((a, b) => b.rel.length - a.rel.length)[0];
  if (!hit) return { ok: false, reason: `${rel}: 섹터 폴더 밖이다. 산출물은 섹터 폴더 안에 둔다: ${sectorList(secs)}` };
  let st = null;
  try { st = fs.statSync(abs); } catch { return { ok: false, reason: `${rel}: 파일이 없다(먼저 쓰고 낸다)` }; }
  return { ok: true, sector: hit.name, rel, abs, dir: st.isDirectory(), size: st.isDirectory() ? null : st.size };
}

// 파일은 내용의 SHA-256, 폴더는 안의 (경로, 크기, 내용 SHA-256) 줄의 SHA-256 → { sha256, size }
export function hashArtifact(abs, dir) {
  const fileSha = (f) => { const h = crypto.createHash('sha256'); const fd = fs.openSync(f, 'r'); try { const buf = Buffer.alloc(1 << 16); let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); } return h.digest('hex'); };
  if (!dir) return { sha256: fileSha(abs), size: fs.statSync(abs).size };
  const lines = []; let size = 0;
  const walk = (d) => {
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of ents) {
      if (lines.length >= DIR_MAX_ENTRIES || DIR_SKIP.has(e.name)) continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) { walk(f); continue; }
      try { const s = fs.statSync(f); size += s.size; lines.push(`${slash(path.relative(abs, f))}\t${s.size}\t${fileSha(f)}`); } catch {}
    }
  };
  walk(abs);
  return { sha256: crypto.createHash('sha256').update(lines.join('\n')).digest('hex'), size };
}

export const sectorsFor = (b) => b.rigSectors || (b.rigSectors = new RigSectors(b));

export class RigSectors {
  constructor(b) { this.b = b; }
  store() { return this.b.store; }
  // 부른 세션의 켜진 rig와 일 → { r, def, unit, c, loop } | null
  ctxOf(caller) {
    const rig = this.b.rig;
    const r = rig && caller && caller.workspaceKey ? rig.active(caller.workspaceKey) : null;
    if (!r) return null;
    const st = this.store();
    const tr = st.openTryOf ? st.openTryOf(caller.sessionId) : null;
    const unit = tr ? st.getUnit(tr.unitId) : null;
    const c = unit && unit.caseId ? st.getCase(unit.caseId) : null;
    const def = c && this.b.branch && this.b.branch.flow && this.b.branch.flow.defOfCase ? this.b.branch.flow.defOfCase(c, r) || r.def : r.def;
    return { r, def, unit, c, tr, loop: c ? c.loop || null : null };
  }
  // done의 --artifact 검사(닫기 전). 하나라도 틀리면 던진다(bad_request, 일은 열린 채) → [{ sector, rel, abs, dir }]
  check(caller, list) {
    const paths = [...new Set((Array.isArray(list) ? list : [list]).map((x) => String(x ?? '').trim()).filter(Boolean))];
    if (!paths.length) return [];
    if (paths.length > ARTIFACTS_MAX) throw apiError('bad_request', `산출물은 done 한 번에 ${ARTIFACTS_MAX}개까지다(${paths.length}개). 폴더 하나로 묶어 낸다.`);
    const x = this.ctxOf(caller);
    if (!x || !caller.rigSeat) throw apiError('bad_request', '--artifact는 켜진 rig의 자리 세션이 산출물 섹터에 낸다. 이 세션은 rig 자리가 아니다. 산출물 경로는 보고 글에 적는다.');
    const out = []; const bad = [];
    for (const p of paths) { const a = resolveArtifact(x.def, x.r.root, p, { cwd: caller.cwd || null }); if (a.ok) out.push(a); else bad.push(a.reason); }
    if (bad.length) throw apiError('bad_request', `산출물을 받지 않았다(일은 열린 채다): ${bad.join(' / ')}`, { sectors: sectorsOf(x.def).filter((s) => s.rel).map((s) => ({ name: s.name, path: s.rel })) });
    return dedupe(out);
  }
  // done 훅이 돌려준 경로(저장소 기준). 틀린 것은 장부에 경고 → 맞은 것
  fromHook(caller, list) {
    const x = this.ctxOf(caller);
    if (!x || !Array.isArray(list) || !list.length) return [];
    const ok = [];
    for (const p of list.slice(0, ARTIFACTS_MAX)) {
      const a = resolveArtifact(x.def, x.r.root, p, { cwd: caller.cwd || null });
      if (a.ok) ok.push({ ...a, source: 'hook' });
      else rigEvent(this.b, { kind: 'artifact_warning', ws: caller.workspaceKey, caseId: x.c ? x.c.id : null, unitId: x.unit ? x.unit.id : null, seat: caller.rigSeat || null, session: caller.sessionId, value: 'hook_path', actor: 'hook', text: `done 훅이 돌려준 산출물을 받지 않았다: ${a.reason}`, data: { path: String(p), loop: x.loop } });
    }
    return ok;
  }
  // 등록(일을 닫은 뒤). arts: check·fromHook의 결과. ctx: 닫기 전에 잡은 ctxOf → [행]
  file(caller, arts, ctx) {
    if (!arts || !arts.length || !ctx) return [];
    const st = this.store(); const key = caller.workspaceKey; const now = Date.now();
    const rows = [];
    for (const a of dedupe(arts)) {
      let h = { sha256: null, size: a.size ?? null };
      try { h = hashArtifact(a.abs, a.dir); } catch (e) { this.b.log && this.b.log('rig artifact hash error', e.message); }
      const before = st.liveArtifactsAt(key, a.rel);
      const id = st.insertArtifact({ workspaceKey: key, sector: a.sector, path: a.rel, dir: a.dir, sha256: h.sha256, size: h.size, loop: ctx.loop, caseId: ctx.c ? ctx.c.id : null, unitId: ctx.unit ? ctx.unit.id : null, tryId: ctx.tr ? ctx.tr.id : null, seat: caller.rigSeat || null, sessionId: caller.sessionId, source: a.source || 'agent', t: now });
      const intake = (sectorsOf(ctx.def).find((s) => s.name === a.sector) || {}).intake || 'register';
      rigEvent(this.b, { kind: 'artifact_filed', ws: key, caseId: ctx.c ? ctx.c.id : null, unitId: ctx.unit ? ctx.unit.id : null, tryId: ctx.tr ? ctx.tr.id : null, seat: caller.rigSeat || null, session: caller.sessionId, value: a.sector, actor: a.source === 'hook' ? 'hook' : 'agent', ref: String(id), text: `${a.sector}: ${a.rel}${h.size != null ? ` (${h.size}바이트)` : ''}`, data: { artifact: id, sector: a.sector, path: a.rel, sha256: h.sha256, size: h.size, dir: a.dir, loop: ctx.loop, intake, source: a.source || 'agent' } });
      for (const old of before) this.supersede(key, old, { why: 'same_path', by: id });
      rows.push(st.getArtifact(id));
    }
    this.sweep(key, ctx.def, now);
    this.changed(key);
    return rows;
  }
  supersede(key, row, { why, by = null, keep = null }) {
    this.store().setArtifactState(row.id, 'superseded', { why, by });
    rigEvent(this.b, { kind: 'artifact_superseded', ws: key, caseId: row.caseId, unitId: row.unitId, seat: row.seat, session: row.sessionId, value: why, actor: 'board', ref: String(row.id), text: `${row.sector}: ${row.path}${why === 'same_path' ? ' — 같은 경로의 새것에 밀려남' : ` — keep(${keepText(keep)})을 넘어 밀려남(파일은 그대로)`}`, data: { artifact: row.id, sector: row.sector, path: row.path, why, by, ...(keep ? { keep: keep.count ?? keep.text } : {}) } });
  }
  // keep 규칙: 넘친 산출물을 밀려남으로(파일은 지우지 않는다) → 밀어낸 수
  sweep(key, def, now = Date.now()) {
    const st = this.store(); let n = 0;
    if (!st.artifacts) return 0;
    for (const s of sectorsOf(def)) {
      const k = s.keep;
      if (!k || k.bad) continue;
      const live = st.artifacts({ ws: key, sector: s.name, states: LIVE_ARTIFACT, limit: 100000 }); // 최근 것부터
      const out = k.count ? live.slice(k.count) : live.filter((r) => now - r.t > k.ms);
      for (const r of out) { this.supersede(key, r, { why: 'keep', keep: k }); n++; }
    }
    if (n) this.changed(key);
    return n;
  }
  // 회가 done으로 닫힘: 그 회의 새것은 받아들임. 고리가 produces를 가졌는데 아무것도 내지 않았으면 경고 한 줄
  onRunDone(c) {
    const st = this.store();
    if (!c || !st.artifacts) return;
    const rows = st.artifacts({ ws: c.workspaceKey, caseId: c.id, limit: 1000 });
    for (const r of rows.filter((x) => x.state === 'new')) {
      st.setArtifactState(r.id, 'accepted', { why: 'run_done' });
      rigEvent(this.b, { kind: 'artifact_accepted', caseId: c.id, unitId: r.unitId, seat: r.seat, session: r.sessionId, value: r.sector, actor: 'board', ref: String(r.id), text: `${r.sector}: ${r.path} — 회가 끝나 받아들임`, data: { artifact: r.id, sector: r.sector, path: r.path, why: 'run_done' } });
    }
    const r = this.b.rig ? this.b.rig.active(c.workspaceKey) : null;
    const def = r ? (this.b.branch && this.b.branch.flow && this.b.branch.flow.defOfCase ? this.b.branch.flow.defOfCase(c, r) || r.def : r.def) : null;
    const loop = def && def.loops && c.loop ? def.loops[c.loop] : null;
    if (loop && loop.produces && loop.produces.length && !rows.length) rigEvent(this.b, { kind: 'artifact_warning', caseId: c.id, session: c.owner, value: 'produces_none', actor: 'board', text: `고리 ${loop.name}는 ${loop.produces.join(', ')}에 산출물을 내는 고리인데 이 회는 아무것도 내지 않고 끝났다(atrium done ok "<보고>" --artifact <경로>)`, data: { loop: loop.name, produces: loop.produces } });
    if (rows.length) this.changed(c.workspaceKey);
  }
  changed(key) { if (this.b.api && this.b.api.broadcast) try { this.b.api.broadcast('rig.artifacts', { workspace: key }); } catch {} }

  // 목록(atrium rig artifacts, 판 API rig.artifacts) → { workspace, sectors: [{ name, path, intake, keep, live, total }], artifacts: [행 + exists], more }
  list(key, { sector = null, run = null, limit = 50, all = true } = {}) {
    const st = this.store(); const rig = this.b.rig;
    const r = rig ? rig.read(key) : null;
    const def = r && r.def ? r.def : null;
    const secs = sectorsOf(def);
    if (sector != null && !secs.some((s) => s.name === sector)) throw apiError('not_found', `그런 섹터가 없다: ${sector}. 섹터: ${secs.map((s) => s.name).join(', ') || '(없음)'}`);
    if (run != null) { const c = st.getCase(String(run)); if (!c || c.workspaceKey !== key) throw apiError('not_found', `이 워크스페이스의 회가 아니다: ${run}`); }
    if (def && rig.enabled(key)) this.sweep(key, def);
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 1000);
    const rows = st.artifacts({ ws: key, sector, caseId: run != null ? String(run) : null, states: all ? null : LIVE_ARTIFACT, limit: lim + 1 });
    const root = r && r.root;
    const names = (sid) => { const s = this.b.sessions && this.b.sessions.get(sid); if (s) return s.name; const x = st.getSession ? st.getSession(sid) : null; return x ? x.name : null; };
    const counts = st.artifactCounts(key);
    return {
      workspace: key,
      sectors: secs.map((s) => ({ name: s.name, path: s.rel, owns: s.owns, intake: s.intake, keep: s.keep && !s.keep.bad ? (s.keep.count ?? s.keep.text) : null, live: (counts[s.name] || {}).live || 0, total: (counts[s.name] || {}).total || 0 })),
      artifacts: rows.slice(0, lim).map((x) => ({ ...x, sessionName: names(x.sessionId), exists: root ? fs.existsSync(path.join(root, x.path)) : null })),
      more: rows.length > lim,
    };
  }
  // 구조 지도: 섹터 마디의 meta.artifacts와 회의 산출물
  forMap(key, def) {
    const st = this.store();
    if (!st.artifacts) return { sectors: {} };
    const counts = st.artifactCounts(key);
    const sectors = {};
    for (const s of sectorsOf(def)) {
      const recent = st.artifacts({ ws: key, sector: s.name, states: LIVE_ARTIFACT, limit: MAP_RECENT });
      const live = (counts[s.name] || {}).live || 0;
      sectors[s.name] = { live, total: (counts[s.name] || {}).total || 0, more: Math.max(0, live - recent.length), recent: recent.map(mapRow), intake: s.intake, keep: s.keep && !s.keep.bad ? (s.keep.count ?? s.keep.text) : null };
    }
    return { sectors };
  }
  ofRun(key, caseId) { const st = this.store(); return st.artifacts ? st.artifacts({ ws: key, caseId, limit: 100 }).map(mapRow) : []; }
}
const mapRow = (r) => ({ id: r.id, sector: r.sector, path: r.path, state: r.state, t: r.t, caseId: r.caseId, seat: r.seat, size: r.size });
function dedupe(arts) { const seen = new Set(); return arts.filter((a) => (seen.has(a.rel) ? false : (seen.add(a.rel), true))); }

// 판 API 처리기(backend.mjs handlers에 펼친다). 보기라 판 API 토큰과 기기 토큰이 본다
export function rigSectorHandlers(b) {
  const keyOf = async (p) => (await b.resolveWorkspace(p && p.workspace)).key;
  return {
    'rig.artifacts': async (p) => sectorsFor(b).list(await keyOf(p), { sector: p && p.sector != null ? String(p.sector) : null, run: p && (p.run || p.case) ? String(p.run || p.case) : null, limit: p && p.limit }),
  };
}
