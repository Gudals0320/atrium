// P219: rig 2의 R1 문서(docs research rig2-design.md 2절 "문서", 2.1 "판이 하는 일", 3절 정의 형식, 5절 장부 사건, 11.4의 1번).
// - 정의 칸: "version": 2와 docs { <이름>: { path, role: canon | ledger | sector, layer, load, owner, stale, git, intake, keep } },
//   자리의 loads·reads·writes(문서 이름. writes는 지금 경로 꼴도 그대로 받는다), 훅·도구의 records(장부 문서)·reads.
//   layer는 project만 쓴다(global·type은 R7 전이라 받기만 하고 판이 보지 않는다). owner는 고리 이름(P221). P222(R5): sector의 intake(register 기본, move·copy는 받기만)·keep(개수나 기간)은 rig-sectors.mjs가 쓴다.
//   v1 정의(위 칸이 없는 것)는 그대로 돈다.
// - 판이 문서를 본다(RigDocs): 켜진 rig의 project 층 문서 경로(파일·폴더)를 가벼운 주기 검사(수정 시각·크기)로 보고, 바뀌면 누가 바꿨는지 골라
//   장부에 doc_changed를 남긴다. 고르는 신호: 도구 사용 뒤 hook(PostToolUse의 파일 쓰기 도구 대상 경로), records 훅이 돈 때, 그때 일하던 세션.
//   모르면 unknown. 쥔 쪽(writes에 그 문서가 있는 자리, records가 그 문서인 훅·도구)이 아닌 에이전트가 쓰면 doc_foreign_write.
// - stale(오래됨)은 계산해 rig.status·rig.map에 표시한다. P221(rig2-design 11.5의 5): 문서가 신선 → 오래됨으로 넘어갈 때 장부에 doc_stale 한 줄을 쓰고,
//   그 문서가 다시 바뀌기 전에는(서명이 같으면) 되풀이하지 않는다(판이 다시 떠도 장부의 마지막 doc_stale 서명으로 안다).
// - P221(11.5의 2): doc_changed의 data.basis는 바꾼 쪽을 고른 근거 넷 가운데 하나다: agent_working(그때 일하던 에이전트·훅·도구), case_run(그 쪽이 rig 회의 일을 쥐고 있었다),
//   no_agent_working(일하던 에이전트가 없었다: 사람 또는 바깥 프로그램으로 추정), git_author(판이 보지 못한 바뀜을 git 커밋 작성자로 추정). 고른 신호는 data.signal(post_tool, working 등)
// - 머리의 문서 목록: 자리 세션의 일 머리 셋째 줄 끝에 loads 경로를 적고, 자세한 목록(loads·reads, 경로와 한 줄 안내)은 atrium item이 보인다(docLines).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { rigEvent } from './rig-ledger.mjs';
import { shownName } from './session-label.mjs';
import { parseKeep, sectorsFor } from './rig-sectors.mjs'; // P222. P224: 워크트리 산출물 합침 보기

export const DOC_ROLES = ['canon', 'ledger', 'sector'];
export const DOC_LAYERS = ['global', 'type', 'project'];
export const DOC_INTAKES = ['register', 'move', 'copy'];
export const DOC_ACCEPTS = ['auto', 'human', 'gate']; // P224(11.7의 1): 섹터의 받아들임
export const DOC_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/;
export const OWNS = '{owns}';
export const DOCS_POLL_MS = 3000;
export const WRITE_NOTE_MS = 2 * 60 * 1000; // 도구 쓰기 신호를 기억하는 시간
export const WORKING_SLACK_MS = 3000; // 수정 시각 앞뒤로 일하던 세션을 볼 여유
const DIR_MAX_ENTRIES = 2000;
const DIR_MAX_DEPTH = 6;
const DIR_SKIP = new Set(['.git', 'node_modules']);
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
const parseSpan = (v) => { if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.floor(v) : null; const m = /^\s*(\d+(?:\.\d+)?)\s*([smhdw])\s*$/.exec(String(v || '')); return m ? Math.floor(Number(m[1]) * UNIT_MS[m[2]]) : null; };
const isAbs = (p) => path.isAbsolute(p) || /^[A-Za-z]:/.test(p) || p.startsWith('/') || p.startsWith('\\');
const insideOrSame = (root, f) => { const r = path.relative(root, f); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
const strList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x);
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

// 정의에 v2 문서 칸이 있는가(version 2가 필요한 칸)
export function usesDocFields(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.docs != null) return true;
  const seats = raw.seats && typeof raw.seats === 'object' && !Array.isArray(raw.seats) ? Object.values(raw.seats) : [];
  if (seats.some((x) => x && typeof x === 'object' && (x.loads != null || x.reads != null))) return true;
  if (Array.isArray(raw.hooks) && raw.hooks.some((h) => h && typeof h === 'object' && (h.records != null || h.reads != null))) return true;
  const tools = raw.tools && typeof raw.tools === 'object' && !Array.isArray(raw.tools) ? Object.values(raw.tools) : [];
  return tools.some((x) => x && typeof x === 'object' && (x.records != null || x.reads != null));
}

// 문서 경로 → { rel(저장소 기준, / 구분), dir, abs } | { owns: true } | { outside: true }. layer project만 저장소 안을 요구한다
export function docPathOf(p, root) {
  if (p === OWNS) return { owns: true };
  const dir = /[\\/]$/.test(p);
  let abs = null;
  if (p.startsWith('~')) abs = path.join(os.homedir(), p.slice(1));
  else if (isAbs(p)) abs = path.resolve(p);
  else abs = root ? path.resolve(root, p) : null;
  if (root && abs && !insideOrSame(root, abs)) return { outside: true, abs };
  if (!root && (isAbs(p) || p.startsWith('~') || String(p).split(/[\\/]+/).includes('..'))) return { outside: true, abs };
  const rel = root && abs ? path.relative(root, abs).split(path.sep).join('/') : String(p).replace(/\\/g, '/').replace(/\/+$/, '');
  if (!rel) return { outside: true, abs }; // 저장소 뿌리 그 자체는 문서가 아니다
  return { rel: dir ? `${rel}/` : rel, dir, abs };
}

// 검사 → { ok, docs: { <이름>: doc } | null, seatDocs: { <자리>: { loads, reads, writes } }, hookDocs: { <훅 index>: { records, reads } }, toolDocs, warnings }
//   doc: { name, path(정의 글), rel(저장소 기준, 폴더는 / 끝) | null, dir, role, layer, load, owner, stale: { ms } | { afterChangeOf } | null, git, intake, keep, watch }
//   watch: 판이 바뀜을 보는 문서(project 층, 경로가 {owns}가 아님)
export function validateDocs(raw, { root = null, exists = null } = {}) {
  const bad = (reason) => ({ ok: false, reason });
  const warnings = [];
  const version = raw.version == null ? 1 : raw.version;
  if (version !== 1 && version !== 2) return bad(`version은 1 또는 2다: ${JSON.stringify(raw.version)}`);
  const empty = { ok: true, version, docs: null, seatDocs: {}, hookDocs: {}, toolDocs: {}, warnings };
  if (!usesDocFields(raw)) return empty;
  if (version !== 2) return bad('docs와 자리·훅·도구의 loads·reads·records는 rig 2 칸이다. 정의 맨 위에 "version": 2를 둔다');
  const docs = {};
  if (raw.docs != null) {
    if (typeof raw.docs !== 'object' || Array.isArray(raw.docs)) return bad('docs는 { "<이름>": { "path", "role" } } 객체다');
    for (const [name, x] of Object.entries(raw.docs)) {
      const at = `docs.${name}`;
      if (!DOC_NAME_RE.test(name)) return bad(`${at}: 문서 이름은 글자·숫자로 시작하고 글자·숫자·_·.·-로 40자까지다`);
      if (!x || typeof x !== 'object' || Array.isArray(x)) return bad(`${at}는 객체여야 한다({ "path", "role" })`);
      if (typeof x.path !== 'string' || !x.path.trim()) return bad(`${at}.path는 파일 경로나 폴더(끝에 /) 글이다`);
      if (!DOC_ROLES.includes(x.role)) return bad(`${at}.role은 ${DOC_ROLES.join(', ')} 가운데 하나다: ${JSON.stringify(x.role)}`);
      const layer = x.layer == null ? 'project' : x.layer;
      if (!DOC_LAYERS.includes(layer)) return bad(`${at}.layer는 ${DOC_LAYERS.join(', ')} 가운데 하나다: ${JSON.stringify(x.layer)}`);
      if (x.load != null && x.load !== 'always') return bad(`${at}.load는 "always"다(모든 자리가 싣는다)`);
      if (x.owner != null && (typeof x.owner !== 'string' || !x.owner)) return bad(`${at}.owner는 고리 이름 글이다`);
      if (x.git != null && typeof x.git !== 'boolean') return bad(`${at}.git은 true 또는 false다`);
      let stale = null;
      if (x.stale != null) {
        if (typeof x.stale === 'string' || typeof x.stale === 'number') { const ms = parseSpan(x.stale); if (!ms) return bad(`${at}.stale은 "30d" 꼴의 기간이거나 { "after_change_of": "<문서>" }다: ${JSON.stringify(x.stale)}`); stale = { ms, text: String(x.stale) }; }
        else if (x.stale && typeof x.stale === 'object' && !Array.isArray(x.stale) && typeof x.stale.after_change_of === 'string') stale = { afterChangeOf: x.stale.after_change_of };
        else return bad(`${at}.stale은 "30d" 꼴의 기간이거나 { "after_change_of": "<문서>" }다`);
      }
      if ((x.intake != null || x.keep != null || x.accept != null) && x.role !== 'sector') return bad(`${at}.intake·keep·accept는 role "sector"(산출물 섹터) 문서에만 쓴다`);
      if (x.accept != null && !DOC_ACCEPTS.includes(x.accept)) return bad(`${at}.accept는 ${DOC_ACCEPTS.join(', ')} 가운데 하나다(auto: 회가 done이면 받아들임, human: 사람이 응답 필요 목록에서, gate: done 훅의 accept 판정): ${JSON.stringify(x.accept)}`);
      if (x.intake != null && !DOC_INTAKES.includes(x.intake)) return bad(`${at}.intake는 ${DOC_INTAKES.join(', ')} 가운데 하나다: ${JSON.stringify(x.intake)}`);
      const keepRule = parseKeep(x.keep);
      if (keepRule && keepRule.bad) return bad(`${at}.keep은 개수(양의 정수, 예: 20)나 기간("90d", "12w")이다: ${JSON.stringify(x.keep)}`);
      const p = x.path.trim();
      if (p === OWNS && x.role !== 'sector') return bad(`${at}.path "{owns}"는 role "sector"(일마다 정해지는 산출물 자리)에만 쓴다`);
      let loc = { rel: null, dir: /[\\/]$/.test(p), abs: null };
      if (layer === 'project') {
        loc = docPathOf(p, root);
        if (loc.outside) return bad(`${at}.path가 저장소 밖이다: ${p}. project 층 문서는 워크스페이스 안 경로다(전역·유형 문서는 layer "global"·"type", R7 전에는 받기만 한다)`);
        if (!loc.owns && root && exists && !exists(loc.abs)) warnings.push(`${at}: ${loc.rel}이 아직 없다(만들면 보드가 그때부터 바뀜을 본다)`);
      } else warnings.push(`${at}: layer ${layer}는 R7(층) 전이라 받기만 한다. 보드가 이 문서의 바뀜을 보지 않고 머리에는 경로만 적는다`);
      // P222(R5): 섹터는 등록만 한다. move·copy는 받기만(register처럼 제자리에 둔다), {owns}·저장소 밖 섹터는 아직 산출물을 받지 않는다
      if (x.intake === 'move' || x.intake === 'copy') warnings.push(`${at}.intake "${x.intake}"는 아직 안 된다(받기만). 보드는 register처럼 산출물을 제자리에 두고 적는다`);
      if (x.role === 'sector' && loc.owns) warnings.push(`${at}: 경로 "{owns}"인 섹터는 일마다 경로가 정해지기 전(R7)이라 아직 산출물을 받지 않는다`);
      else if (x.role === 'sector' && layer !== 'project') warnings.push(`${at}: ${layer} 층 섹터는 R7(층) 전이라 산출물을 받지 않는다(저장소 안 폴더만 받는다)`);
      else if (x.role === 'sector' && loc.rel && !loc.dir) warnings.push(`${at}.path는 폴더로 읽는다(${loc.rel}/). 섹터는 산출물이 들어가는 폴더다`);
      docs[name] = { name, path: p, rel: loc.owns ? null : loc.rel || null, dir: !!loc.dir || (x.role === 'sector' && !!loc.rel), role: x.role, layer, load: x.load || null, owner: x.owner || null, stale, git: x.git !== false, intake: x.role === 'sector' ? x.intake || 'register' : null, accept: x.role === 'sector' ? x.accept || 'auto' : null, keep: x.keep ?? null, keepRule: keepRule || null, watch: layer === 'project' && !loc.owns && !!loc.rel };
    }
    for (const d of Object.values(docs)) if (d.stale && d.stale.afterChangeOf && !has(docs, d.stale.afterChangeOf)) return bad(`docs.${d.name}.stale.after_change_of가 없는 문서를 가리킨다: ${d.stale.afterChangeOf}`);
  }
  const known = (n) => has(docs, n);
  const docList = Object.keys(docs).join(', ') || '(없음)';
  const names = (v, at) => {
    if (v == null) return { ok: true, list: [] };
    if (!strList(v)) return { ok: false, reason: `${at}는 문서 이름 배열이다` };
    const miss = v.filter((n) => !known(n));
    if (miss.length) return { ok: false, reason: `${at}에 docs에 없는 문서가 있다: ${miss.join(', ')}. 문서: ${docList}` };
    return { ok: true, list: [...new Set(v)] };
  };
  const always = Object.values(docs).filter((d) => d.load === 'always').map((d) => d.name);
  const seatDocs = {};
  const seats = raw.seats && typeof raw.seats === 'object' && !Array.isArray(raw.seats) ? raw.seats : {};
  for (const [seat, x] of Object.entries(seats)) {
    if (!x || typeof x !== 'object') continue;
    const at = `seats.${seat}`;
    const lo = names(x.loads, `${at}.loads`); if (!lo.ok) return bad(lo.reason);
    const re = names(x.reads, `${at}.reads`); if (!re.ok) return bad(re.reason);
    const writes = [];
    if (Array.isArray(x.writes)) for (const w of x.writes) {
      if (typeof w !== 'string') continue; // 모양은 validateAmp가 본다
      if (w === OWNS) { warnings.push(`${at}.writes의 "{owns}"는 R5 전이라 받기만 한다(쓰기 범위로 넘기지 않는다)`); continue; }
      if (!known(w)) continue; // 지금 경로 꼴
      const d = docs[w];
      if (d.layer !== 'project') return bad(`${at}.writes의 ${w}는 ${d.layer} 층 문서라 쓰기 범위로 넘길 수 없다(저장소 밖)`);
      if (!d.rel) return bad(`${at}.writes의 ${w}는 경로가 "{owns}"라 R5 전에는 쓰기 범위로 넘기지 않는다`);
      // P224(11.5의 4): 정본은 제안과 승인으로만 고친다(Q1). 자리의 writes에 두면 정의 오류
      if (d.role === 'canon') return bad(`${at}.writes에 정본 문서 ${w}가 있다. 정본은 자리가 직접 쓰지 않고 제안과 승인으로 고친다: atrium rig propose --target ${w} --file <새 내용>(사람이 승인하면 보드가 반영한다)`);
      writes.push(w);
    }
    const loads = [...new Set([...always, ...lo.list])];
    const reads = re.list.filter((n) => !loads.includes(n));
    for (const n of loads) if (docs[n].role === 'sector') warnings.push(`${at}.loads의 ${n}는 산출물 섹터다. 늘 싣는 문서는 보통 정본(canon)이다`);
    seatDocs[seat] = { loads, reads, writes };
  }
  const hookDocs = {};
  const recordsOf = (v, at) => {
    if (v == null) return { ok: true, list: [] };
    const list = typeof v === 'string' ? [v] : v;
    const r = names(list, `${at}.records`); if (!r.ok) return r;
    const wrong = r.list.filter((n) => docs[n].role !== 'ledger');
    if (wrong.length) return { ok: false, reason: `${at}.records는 장부 문서(role "ledger")를 가리킨다: ${wrong.map((n) => `${n}(${docs[n].role})`).join(', ')}` };
    const outside = r.list.filter((n) => !docs[n].rel);
    if (outside.length) warnings.push(`${at}.records의 ${outside.join(', ')}는 저장소 밖 문서라 보드가 바뀜을 보지 않는다`);
    return r;
  };
  if (Array.isArray(raw.hooks)) raw.hooks.forEach((h, i) => {
    if (!h || typeof h !== 'object' || hookDocs.bad) return;
    const at = `hooks[${i}]`;
    const rc = recordsOf(h.records, at); if (!rc.ok) { hookDocs.bad = rc.reason; return; }
    const rd = names(h.reads, `${at}.reads`); if (!rd.ok) { hookDocs.bad = rd.reason; return; }
    if (rc.list.length || rd.list.length) hookDocs[i] = { records: rc.list, reads: rd.list };
  });
  if (hookDocs.bad) return bad(hookDocs.bad);
  const toolDocs = {};
  const tools = raw.tools && typeof raw.tools === 'object' && !Array.isArray(raw.tools) ? raw.tools : {};
  for (const [name, x] of Object.entries(tools)) {
    if (!x || typeof x !== 'object') continue;
    const at = `tools.${name}`;
    const rc = recordsOf(x.records, at); if (!rc.ok) return bad(rc.reason);
    const rd = names(x.reads, `${at}.reads`); if (!rd.ok) return bad(rd.reason);
    if (rc.list.length || rd.list.length) toolDocs[name] = { records: rc.list, reads: rd.list };
  }
  return { ok: true, version, docs, seatDocs, hookDocs, toolDocs, warnings };
}

// 쓰기 범위의 문서 이름 → 경로(rig-amp가 쓴다). 문서가 아닌 글은 그대로(지금 경로 꼴), "{owns}"는 뺀다
export function writesPaths(list, docs) {
  const out = [];
  for (const w of list) {
    if (w === OWNS) continue;
    if (docs && has(docs, w)) { if (docs[w].rel) out.push(docs[w].rel); continue; }
    out.push(w);
  }
  return out;
}

// 문서를 쥔 쪽: writes에 그 문서가 있는 자리, records가 그 문서인 훅(index)·도구 → { seats, hooks, tools }
export function holdersOf(def, name) {
  const seats = Object.entries(def.seatDocs || {}).filter(([, x]) => x.writes.includes(name)).map(([s]) => s);
  const hooks = Object.entries(def.hookDocs || {}).filter(([, x]) => x.records.includes(name)).map(([i]) => Number(i));
  const tools = Object.entries(def.toolDocs || {}).filter(([, x]) => x.records.includes(name)).map(([t]) => t);
  return { seats, hooks, tools };
}

// 자리의 문서 목록(머리·atrium item) → { loads: [{ name, path, role }], reads: [...] } | null
export function seatDocsOf(def, seat) {
  const x = def && def.seatDocs && def.seatDocs[seat];
  if (!x || (!x.loads.length && !x.reads.length)) return null;
  const one = (n) => { const d = def.docs[n]; return { name: n, path: d.rel || d.path, role: d.role }; };
  return { loads: x.loads.map(one), reads: x.reads.map(one) };
}
export const DOC_LOAD_HINT = '이 문서를 먼저 읽는다';
export const DOC_READ_HINT = '필요할 때 읽는다';
// 머리 셋째 줄 끝에 붙이는 꼬리(짧게): 늘 싣는 문서 경로 몇 개 + 자세한 목록은 atrium item
export function docsTail(d, max = 3) {
  if (!d) return '';
  const head = d.loads.slice(0, max).map((x) => x.path);
  const more = d.loads.length - head.length + d.reads.length;
  const a = head.length ? `먼저 읽을 문서: ${head.join(', ')}.` : '';
  const b = more > 0 ? `문서 목록: \`atrium item\`.` : '';
  return [a, b].filter(Boolean).join(' ');
}
// 머리에 문서 목록을 붙였다(doc_load). where: 'unit'(일 머리) | 'seat'(자리 알림)
export function docLoadEvent(b, { ws = null, caseId = null, unitId = null, tryId = null, seat, session, docs, where = 'unit', ref = null }) {
  if (!docs) return null;
  return rigEvent(b, { kind: 'doc_load', ws, caseId, unitId, tryId, seat, session, value: where, actor: 'board', ref, text: `머리에 문서 목록: 실음 ${docs.loads.map((x) => x.name).join(', ') || '-'} · 읽음 ${docs.reads.map((x) => x.name).join(', ') || '-'}`, data: { loads: docs.loads.map((x) => x.name), reads: docs.reads.map((x) => x.name) } });
}
// atrium item의 문서 줄
export function docLines(d) {
  if (!d) return [];
  return [
    ...d.loads.map((x) => `  ${x.path} (${x.name}, ${x.role}): ${DOC_LOAD_HINT}`),
    ...d.reads.map((x) => `  ${x.path} (${x.name}, ${x.role}): ${DOC_READ_HINT}`),
  ];
}

// ---------- 바뀜 보기 ----------
// 파일·폴더의 지금 서명 → { exists, sig, mtimeMs, files } (폴더는 안의 파일 수·크기 합·가장 늦은 수정 시각, 깊이와 수 상한)
export function statDoc(abs, dir) {
  let st = null;
  try { st = fs.statSync(abs); } catch { return { exists: false, sig: 'none', mtimeMs: null, files: 0 }; }
  if (!st.isDirectory()) return { exists: true, sig: `f:${st.mtimeMs}:${st.size}`, mtimeMs: st.mtimeMs, files: 1 };
  let n = 0, size = 0, mt = st.mtimeMs;
  const walk = (d, depth) => {
    if (depth > DIR_MAX_DEPTH || n >= DIR_MAX_ENTRIES) return;
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (n >= DIR_MAX_ENTRIES) return;
      if (DIR_SKIP.has(e.name)) continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) { walk(f, depth + 1); continue; }
      try { const s = fs.statSync(f); n++; size += s.size; if (s.mtimeMs > mt) mt = s.mtimeMs; } catch {}
    }
  };
  walk(abs, 0);
  return { exists: true, sig: `d:${n}:${size}:${mt}`, mtimeMs: mt, files: n, dir: !!dir };
}
// stale 판정 → { stale: bool, why } | null(모름: 문서가 없음)
export function staleOf(doc, stats, now = Date.now()) {
  const me = stats[doc.name];
  if (!doc.stale || !me || !me.exists || me.mtimeMs == null) return null;
  if (doc.stale.ms) { const age = now - me.mtimeMs; return { stale: age > doc.stale.ms, why: `${doc.stale.text || `${doc.stale.ms}ms`} 동안 안 바뀌면 오래됨`, ageMs: age }; }
  const o = stats[doc.stale.afterChangeOf];
  if (!o || !o.exists || o.mtimeMs == null) return null;
  return { stale: o.mtimeMs > me.mtimeMs, why: `${doc.stale.afterChangeOf}가 바뀐 뒤 그대로면 오래됨` };
}
// 바꾼 쪽 고르기(순수 함수). o: { doc, abs(문서 절대 경로), dir, mtimeMs, since(앞 바뀜의 수정 시각: 그 전에 난 신호는 쓰지 않는다), now, writes: [{ abs, sessionId?, hook?, tool?, t }], sessions: [{ sessionId, name, seat, working(mtime 무렵 일하던가), caseId?, unitId?, tryId? }] }
//   → { by: seat | session | hook | tool | human | unknown, basis, seat?, sessionId?, name?, hook?, tool?, candidates? }
export function pickChanger({ abs, dir, mtimeMs, since = null, now = Date.now(), writes = [], sessions = [] }) {
  const hit = (f) => (dir ? insideOrSame(abs, f) : path.resolve(f).toLowerCase() === path.resolve(abs).toLowerCase());
  // P219 개발용 판: 사람이 손으로 고친 것이 2분 안의 앞선 자리 쓰기 신호에 붙었다. 앞 바뀜 뒤의 신호만 쓴다(쓴 신호는 RigDocs가 지운다)
  const win = (t) => (mtimeMs == null || Math.abs(t - mtimeMs) <= WRITE_NOTE_MS) && (since == null || t > since);
  const w = writes.filter((x) => x.abs && hit(x.abs) && win(x.t)).sort((a, b) => b.t - a.t)[0];
  if (w) {
    if (w.board) return { by: 'board', basis: 'board', why: w.why || null, proposal: w.proposal || null }; // P224: 보드가 쓴 것(승인된 제안 반영, 제안 기록, 되돌리기)
    if (w.hook != null) return { by: 'hook', basis: 'hook_ran', hook: w.hook };
    if (w.tool) return { by: 'tool', basis: 'tool_ran', tool: w.tool, sessionId: w.sessionId || null };
    const s = sessions.find((x) => x.sessionId === w.sessionId) || { sessionId: w.sessionId, name: w.name || null, seat: w.seat || null };
    return { by: s.seat ? 'seat' : 'session', basis: 'post_tool', seat: s.seat || null, sessionId: s.sessionId, name: s.name || null };
  }
  const working = sessions.filter((x) => x.working);
  if (working.length === 1) { const s = working[0]; return { by: s.seat ? 'seat' : 'session', basis: 'working', seat: s.seat || null, sessionId: s.sessionId, name: s.name || null }; }
  if (working.length > 1) return { by: 'unknown', basis: 'several_working', candidates: working.map((x) => x.name || x.sessionId) };
  return { by: 'human', basis: 'no_agent_working' };
}
// P221(11.5의 2): 바꾼 쪽을 고른 근거 → agent_working | case_run | no_agent_working | git_author
export const DOC_BASES = ['agent_working', 'case_run', 'no_agent_working', 'git_author'];
export function basisOf(who, s = null, gitAuthor = null) {
  if (who.by === 'board') return 'board'; // P224: 다섯째 근거(보드가 직접 씀: 승인된 제안 반영·되돌리기)
  if (who.by === 'human') return 'no_agent_working';
  if (['seat', 'session', 'hook', 'tool'].includes(who.by)) return s && s.caseId ? 'case_run' : 'agent_working';
  if (who.signal === 'several_working') return 'agent_working';
  return gitAuthor ? 'git_author' : 'no_agent_working';
}
// 화면·장부 글의 바꾼 쪽. 일하던 에이전트가 없었으면 "사람 또는 바깥 프로그램(추정)"
export const HUMAN_GUESS = '사람 또는 바깥 프로그램(추정)';
export function changerLabel(who, gitAuthor = null) {
  if (who.by === 'seat') return `${who.seat} 자리(@${who.name})`;
  if (who.by === 'session') return `rig 밖 세션 @${who.name}`;
  if (who.by === 'hook') return `훅 ${who.hook}`;
  if (who.by === 'tool') return `도구 ${who.tool}`;
  if (who.by === 'board') return who.why === 'proposal' ? `보드(승인된 제안 ${who.proposal || ''} 반영)` : who.why === 'revert' ? '보드(사람이 고른 되돌리기)' : '보드';
  if (who.signal === 'while_away' && !gitAuthor) return '모름(보드가 꺼져 있던 동안 바뀜)';
  if (who.by === 'human' || who.basis === 'no_agent_working') return HUMAN_GUESS;
  if (who.basis === 'git_author' && gitAuthor) return `git 커밋 작성자 ${gitAuthor}(추정)`;
  return '모름';
}
const ACTOR_OF = { seat: 'agent', session: 'agent', hook: 'hook', tool: 'board', human: 'human', unknown: 'board', board: 'board' };
const gitRun = (root, args) => new Promise((resolve) => { execFile('git', ['-C', root, ...args], { timeout: 4000, windowsHide: true }, (e, out) => resolve(e ? null : String(out).trim())); });

// P224: 정본 문서의 승인 안 된 바뀜 → { at, by } | null
function unapprovedOf(st, key, doc) { const m = st && st.docMark ? st.docMark(key, doc) : null; return m && m.unapprovedAt ? { at: m.unapprovedAt, by: m.unapprovedBy || null } : null; }

// 판에 붙는 문서 보기. b: 백엔드(store, sessions, rig, summary, log, cfg)
export class RigDocs {
  constructor(b, { pollMs = null } = {}) {
    this.b = b; this.seen = new Map(); /* `${ws}|${doc}` → { sig, mtimeMs } */ this.writes = []; this.busy = false;
    this.pollMs = pollMs ?? ((b.cfg && Number(b.cfg.rigDocsPollMs)) || DOCS_POLL_MS);
  }
  start() { if (this.timer) return; this.timer = setInterval(() => { this.scan().catch((e) => this.b.log && this.b.log('rig docs scan error', e.stack)); }, this.pollMs); if (this.timer.unref) this.timer.unref(); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  // 신호: 파일 쓰기 도구를 쓴 세션(PostToolUse), records 훅·도구가 돈 때
  noteWrite(x) {
    const now = Date.now();
    this.writes.push({ ...x, t: x.t ?? now });
    this.writes = this.writes.filter((w) => now - w.t <= WRITE_NOTE_MS).slice(-500);
  }
  noteToolHook(s, body) {
    if (!s || !body) return;
    const tool = String(body.tool_name || '');
    if (!['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) return;
    const inp = body.tool_input || {};
    const f = inp.file_path || inp.notebook_path || inp.path;
    if (!f) return;
    const base = (s.rt && s.rt.cwd) || s.cwd || process.cwd();
    this.noteWrite({ abs: path.resolve(base, String(f)), sessionId: s.sessionId, name: shownName(s) || s.name, seat: s.rigSeat || null });
  }
  // records 훅이 돈 뒤(rig.runAt): 그 장부 문서들을 그 훅이 쓴 것으로 본다
  noteRecords(key, def, { hook = null, tool = null, sessionId = null } = {}) {
    const r = this.b.rig ? this.b.rig.read(key) : null; if (!r || !r.root || !def || !def.docs) return;
    const list = hook != null ? ((def.hookDocs || {})[hook] || {}).records || [] : tool ? ((def.toolDocs || {})[tool] || {}).records || [] : [];
    for (const n of list) { const d = def.docs[n]; if (d && d.rel) this.noteWrite({ abs: path.resolve(r.root, d.rel), hook, tool, sessionId }); }
  }
  // 그 워크스페이스 문서들의 지금 상태(rig.status·rig.map) → [{ name, path, rel, role, layer, load, owner, git, watch, exists, mtimeMs, files, stale, last }]
  stateOf(key, def, { now = Date.now() } = {}) {
    if (!def || !def.docs) return [];
    const root = this.b.rig ? this.b.rig.rootOf(key) : null;
    const stats = {};
    for (const d of Object.values(def.docs)) stats[d.name] = d.rel && root ? statDoc(path.resolve(root, d.rel), d.dir) : { exists: null, mtimeMs: null };
    const last = this.lastChanges(key);
    const holders = (n) => holdersOf(def, n);
    return Object.values(def.docs).map((d) => ({ name: d.name, path: d.path, rel: d.rel, dir: d.dir, role: d.role, layer: d.layer, load: d.load, owner: d.owner, git: d.git, watch: d.watch, exists: stats[d.name].exists, mtimeMs: stats[d.name].mtimeMs, files: stats[d.name].files ?? null, stale: staleOf(d, stats, now), last: last[d.name] || null, holders: holders(d.name), ...(d.role === 'canon' ? { unapproved: unapprovedOf(this.b.store, key, d.name) } : {}) })); // P224
  }
  // 문서마다 마지막 doc_changed(장부) → { <문서>: { t, by, seat, session, sessionName, seq } }
  lastChanges(key) {
    const st = this.b.store; if (!st.rigEvents) return {};
    const rows = st.rigEvents({ ws: key, kinds: ['doc_changed'], limit: 500 });
    const out = {};
    for (const r of rows) { const d = r.data && r.data.doc; if (d) out[d] = { t: r.t, by: r.value, seat: r.seat || null, session: r.session || null, name: (r.data && r.data.name) || null, seq: r.seq, sig: (r.data && r.data.sig) || null }; }
    return out;
  }
  // 그 무렵 일하던 이 워크스페이스의 에이전트 세션들
  sessionsAt(key, mtimeMs) {
    const b = this.b; const st = b.store; const out = [];
    for (const s of b.sessions.values()) {
      if (s.workspaceKey !== key || (s.kind || 'claude') === 'shell') continue;
      let working = false;
      if (mtimeMs != null && st.stateAt) {
        const a = st.stateAt(s.sessionId, Math.ceil(mtimeMs)); const z = st.stateAt(s.sessionId, Math.ceil(mtimeMs) - WORKING_SLACK_MS); const c = st.stateAt(s.sessionId, Math.ceil(mtimeMs) + WORKING_SLACK_MS);
        working = [a, z, c].includes('working');
      }
      if (!working && b.summary && mtimeMs != null && Date.now() - mtimeMs <= this.pollMs * 2 + WORKING_SLACK_MS) { try { working = b.summary(s).state === 'working'; } catch {} }
      const tr = st.openTryOf ? st.openTryOf(s.sessionId) : null; const u = tr && st.getUnit ? st.getUnit(tr.unitId) : null;
      out.push({ sessionId: s.sessionId, name: shownName(s) || s.name, seat: s.rigSeat || null, working, caseId: u ? u.caseId || null : null, unitId: u ? u.id : null, tryId: tr ? tr.id : null });
    }
    return out;
  }
  // 한 번 훑는다 → 남긴 사건 수
  async scan({ now = Date.now() } = {}) {
    if (this.busy) return 0; this.busy = true;
    let n = 0;
    try {
      const st = this.b.store;
      if (!this.b.rig || !st.workspaces) return 0;
      for (const w of st.workspaces()) {
        const r = this.b.rig.active(w.key);
        if (!r || !r.def.docs) continue;
        let last = null;
        for (const d of Object.values(r.def.docs)) {
          if (!d.watch) continue;
          const abs = path.resolve(r.root, d.rel);
          const cur = statDoc(abs, d.dir);
          const k = `${w.key}|${d.name}`;
          const prev = this.seen.get(k);
          this.seen.set(k, { sig: cur.sig, mtimeMs: cur.mtimeMs });
          if (d.role === 'canon' && this.b.rigProposals) this.b.rigProposals.baseline(w.key, d, abs); // P224: 정본의 승인된 내용(처음 본 것)
          if (!prev) {
            // 처음 본다: 장부의 마지막 서명과 다르면 판이 쉬는 동안 바뀐 것(누가는 모름)
            if (last == null) last = this.lastChanges(w.key);
            const was = last[d.name];
            if (was && was.sig && was.sig !== cur.sig) { await this.changed(w.key, r, d, abs, cur, { away: true, now }); n++; }
            continue;
          }
          if (prev.sig !== cur.sig) { await this.changed(w.key, r, d, abs, cur, { now, since: prev.mtimeMs }); n++; }
          if (d.stale) this.noteStale(w.key, r, d, cur, now); // P221: 신선 → 오래됨에 한 번(돌려주는 수는 바뀐 문서 수 그대로)
        }
      }
      // P224(11.7의 6): 워크트리 산출물이 합쳐졌는지(약 30초마다)
      this.scans = (this.scans || 0) + 1;
      if (this.scans % Math.max(1, Math.round(30000 / this.pollMs)) === 0) { try { await sectorsFor(this.b).settleWorktrees(); } catch (e) { this.b.log && this.b.log('rig worktree artifacts error', e.stack); } }
    } finally { this.busy = false; }
    return n;
  }
  // P221: 문서가 오래됨이면 doc_stale 한 줄(그 서명에 한 번). → 썼으면 true
  noteStale(key, r, d, cur, now = Date.now()) {
    if (!cur.exists || cur.mtimeMs == null) return false;
    const stats = { [d.name]: cur };
    if (d.stale.afterChangeOf) { const o = r.def.docs[d.stale.afterChangeOf]; stats[o.name] = o && o.rel ? statDoc(path.resolve(r.root, o.rel), o.dir) : { exists: null, mtimeMs: null }; }
    const sv = staleOf(d, stats, now);
    if (!sv || !sv.stale) return false;
    this.staleNoted = this.staleNoted || new Set();
    const k = `${key}|${d.name}|${cur.sig}`;
    if (this.staleNoted.has(k)) return false;
    this.staleNoted.add(k);
    const st = this.b.store;
    const last = st.rigEvents ? st.rigEvents({ ws: key, kinds: ['doc_stale'], limit: 200 }).reverse().find((x) => x.data && x.data.doc === d.name) : null;
    if (last && last.data && last.data.sig === cur.sig) return false; // 판이 다시 뜨기 전에 이미 썼다
    rigEvent(this.b, { kind: 'doc_stale', ws: key, value: d.stale.afterChangeOf ? 'after_change_of' : 'age', actor: 'board', text: `문서 ${d.name}(${d.rel})가 오래됐다: ${sv.why}`, data: { doc: d.name, path: d.rel, role: d.role, why: sv.why, ...(d.stale.afterChangeOf ? { afterChangeOf: d.stale.afterChangeOf } : { ms: d.stale.ms }), ...(sv.ageMs != null ? { ageMs: sv.ageMs } : {}), sig: cur.sig, mtimeMs: cur.mtimeMs } });
    if (this.b.log) this.b.log(`rig doc ${key} ${d.name} stale`);
    return true;
  }
  async changed(key, r, d, abs, cur, { away = false, now = Date.now(), since = null } = {}) {
    const sessions = this.sessionsAt(key, cur.mtimeMs);
    const who = away ? { by: 'unknown', basis: 'while_away' } : pickChanger({ abs, dir: d.dir, mtimeMs: cur.mtimeMs, since, now, writes: this.writes, sessions });
    who.signal = who.basis; // P221: 고른 신호(자세히)는 signal, basis는 넷 가운데 하나(아래)
    // 이 문서에 닿은 신호는 한 번 쓰고 지운다(다음 바뀜이 옛 신호에 붙지 않게)
    const hitDoc = (f) => (d.dir ? insideOrSame(abs, f) : path.resolve(f).toLowerCase() === path.resolve(abs).toLowerCase());
    this.writes = this.writes.filter((w) => !(w.abs && hitDoc(w.abs) && w.t <= now));
    const s = who.sessionId ? sessions.find((x) => x.sessionId === who.sessionId) || null : null;
    let git = null;
    if (d.git) {
      const [status, log] = await Promise.all([gitRun(r.root, ['status', '--porcelain', '--', d.rel]), gitRun(r.root, ['log', '-1', '--format=%h %s', '--', d.rel])]);
      if (status != null || log != null) git = { dirty: !!status, last: log || null };
    }
    // P221: 근거(basis) 넷. 판이 보지 못한 바뀜(모름)은 커밋된 것이면 git 커밋 작성자로 추정
    let gitAuthor = null;
    if (who.by === 'unknown' && who.signal !== 'several_working' && d.git && git && !git.dirty) gitAuthor = await gitRun(r.root, ['log', '-1', '--format=%an', '--', d.rel]);
    who.basis = basisOf(who, s, gitAuthor);
    const label = changerLabel(who, gitAuthor);
    const what = cur.exists ? (cur.dir ? `폴더 파일 ${cur.files}개` : '바뀜') : '지워짐';
    const base = { ws: key, caseId: s ? s.caseId : null, unitId: s ? s.unitId : null, tryId: s ? s.tryId : null, seat: who.seat || null, session: who.sessionId || null };
    rigEvent(this.b, { ...base, kind: 'doc_changed', value: who.by, actor: ACTOR_OF[who.by] || 'board', text: `문서 ${d.name}(${d.rel}) ${what}: ${label}`, data: { doc: d.name, path: d.rel, role: d.role, by: who.by, basis: who.basis, signal: who.signal, ...(gitAuthor ? { gitAuthor } : {}), name: who.name || null, ...(who.hook != null ? { hook: who.hook } : {}), ...(who.tool ? { tool: who.tool } : {}), ...(who.candidates ? { candidates: who.candidates } : {}), sig: cur.sig, mtimeMs: cur.mtimeMs, exists: cur.exists, ...(git ? { git } : {}) } });
    // 쥔 쪽이 아닌 에이전트·훅·도구가 씀(사람과 모름은 경고하지 않는다)
    const h = holdersOf(r.def, d.name);
    const foreign = (who.by === 'seat' && !h.seats.includes(who.seat)) || who.by === 'session' || (who.by === 'hook' && !h.hooks.includes(who.hook)) || (who.by === 'tool' && !h.tools.includes(who.tool));
    if (foreign) {
      const holders = [...h.seats.map((x) => `${x} 자리`), ...h.hooks.map((x) => `훅 ${x}`), ...h.tools.map((x) => `도구 ${x}`)];
      rigEvent(this.b, { ...base, kind: 'doc_foreign_write', value: who.by === 'seat' ? who.seat : who.by === 'session' ? `@${who.name}` : who.by, actor: ACTOR_OF[who.by] || 'board', text: `쥔 쪽이 아닌 ${label}가 문서 ${d.name}(${d.rel})를 썼다. 쥔 쪽: ${holders.join(', ') || '없음(아무도 쓰지 않는 문서)'}`, data: { doc: d.name, path: d.rel, by: who.by, holders, basis: who.basis } });
    }
    if (d.role === 'canon' && this.b.rigProposals) try { this.b.rigProposals.onCanonChanged(key, d, abs, { who, label }); } catch (e) { this.b.log && this.b.log('rig canon guard error', e.stack); } // P224(11.5의 4)
    if (this.b.log) this.b.log(`rig doc ${key} ${d.name} changed by ${who.by}${who.name ? ` @${who.name}` : ''} (${who.basis})${foreign ? ' FOREIGN' : ''}`);
    return who;
  }
}
