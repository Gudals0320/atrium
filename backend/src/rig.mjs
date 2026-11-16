// P182: rig(하네스 정의) 1단계. docs research harness-arch.md 13절("이름과 자리", "켜기", "정의 읽기", "훅", "deliver 훅의 자리", "done 훅", "atrium guide").
// - 정의는 워크스페이스 뿌리(본 체크아웃, workspaces.root)의 .atrium/rig.json이다. 워크트리 세션도 본 체크아웃의 정의를 따른다. 판은 .atrium/을 만들지 않는다.
// - 켜기는 사람만(판 API rig.enable·rig.disable, workspaces.rig_enabled). 꺼졌거나 정의가 없는 워크스페이스는 훅도 기록도 없다(오늘과 같다).
// - 읽기: 부를 때마다 파일 수정 시각·크기로 캐시하고 바뀌면 다시 읽어 검사한다. 잘못된 정의는 마지막으로 맞았던 정의를 그대로 쓰고
//   판 이벤트 rig_invalid(까닭)를 한 번 남긴다(같은 내용이면 다시 남기지 않는다). atrium guide와 rig.status가 그 까닭을 보인다.
// - 정의 해시(파일 바이트의 SHA-256)를 모든 훅 실행 기록(rig_hook_runs)에 남긴다.
// - 훅: 같은 길목의 훅은 정의 순서대로 돌고, 고친 글(rewrite·append)이 다음 훅으로 넘어가며, 첫 거절에서 멈춘다.
//   실패(hook-runner.mjs)는 onFail을 따른다: 기본 pass(hook_failed 이벤트를 남기고 이어 간다), block이면 거절과 같다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runHook, pathish, HOOK_TIMEOUT_MS, HOOK_TIMEOUT_MAX_MS } from './hook-runner.mjs';
import { cleanEnv } from './proc-env.mjs';
import { shownName } from './session-label.mjs';

export const RIG_FILE = '.atrium/rig.json';
export const HOOK_ATS = ['deliver', 'done', 'tool-before', 'tool-after'];
export const HOOK_FROMS = ['human', 'agent', 'flow', 'any']; // P185: flow(흐름 줄이 만든 넘김 글)
export const GUIDE_MAX = 20000;
// P183: 도구(2단계). 시간 제한 기본 30분, 상한 6시간(넘으면 깎는다). 이름은 글자·숫자·_·.·-
export const TOOL_TIMEOUT_MS = 30 * 60 * 1000;
export const TOOL_TIMEOUT_MAX_MS = 6 * 60 * 60 * 1000;
export const TOOL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/;
export const TOOL_RUN_HINT = '도구의 run은 node, python, .exe를 바로 적는다(.cmd·.bat이면 cmd.exe를 거쳐 에이전트가 준 인자에 [A-Za-z0-9 _.,:=/@+-] 밖의 글자를 쓰지 못한다)';
const RIG_MAX_BYTES = 1024 * 1024;
function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
// 뿌리 안의 경로인가(정의가 가리키는 안내 파일)
const inside = (root, f) => { const r = path.relative(root, f); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };

// 정의를 검사하고 고른 모양으로 → { ok: true, def } | { ok: false, reason }
// def: { hooks: [{ index, at, from, tool, run, onFail, timeoutMs }], guide: { default?, topics } | null, tools(2단계가 읽는다), name }
export function validateRig(raw, { root, exists = isFile } = {}) {
  const bad = (reason) => ({ ok: false, reason });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('정의는 JSON 객체여야 한다');
  const hooks = [];
  if (raw.hooks != null) {
    if (!Array.isArray(raw.hooks)) return bad('hooks는 배열이어야 한다');
    for (let i = 0; i < raw.hooks.length; i++) {
      const h = raw.hooks[i]; const at = `hooks[${i}]`;
      if (!h || typeof h !== 'object' || Array.isArray(h)) return bad(`${at}는 객체여야 한다`);
      if (!HOOK_ATS.includes(h.at)) return bad(`${at}.at은 ${HOOK_ATS.join(', ')} 가운데 하나다: ${h.at}`);
      if (!Array.isArray(h.run) || !h.run.length || h.run.some((w) => typeof w !== 'string' || !w)) return bad(`${at}.run은 빈 칸 없는 글 배열이어야 한다(예: ["node", ".atrium/hooks/x.mjs"])`);
      if (h.from != null && (h.at !== 'deliver' || !HOOK_FROMS.includes(h.from))) return bad(h.at !== 'deliver' ? `${at}.from은 deliver 훅에만 쓴다` : `${at}.from은 ${HOOK_FROMS.join(', ')} 가운데 하나다: ${h.from}`);
      if (h.tool != null && (!String(h.at).startsWith('tool-') || typeof h.tool !== 'string')) return bad(`${at}.tool은 tool-before·tool-after 훅에만 쓰는 도구 이름이다`);
      if (h.onFail != null && !['pass', 'block'].includes(h.onFail)) return bad(`${at}.onFail은 pass 또는 block이다: ${h.onFail}`);
      if (h.timeoutMs != null && !(Number(h.timeoutMs) > 0)) return bad(`${at}.timeoutMs는 양수다(최대 ${HOOK_TIMEOUT_MAX_MS})`);
      // 없는 스크립트: 경로 꼴 첫 낱말, 또는 해석기(node, python 등) 뒤 경로 꼴 둘째 낱말(확장자가 있는 것)
      if (root) {
        if (pathish(h.run[0]) && !exists(path.resolve(root, h.run[0])) && !['.cmd', '.bat', '.exe', '.com'].some((e) => exists(path.resolve(root, h.run[0] + e)))) return bad(`${at}.run의 파일이 없다: ${h.run[0]}`);
        if (!pathish(h.run[0]) && h.run[1] && /[\\/]/.test(h.run[1]) && path.extname(h.run[1]) && !h.run[1].startsWith('-') && !exists(path.resolve(root, h.run[1]))) return bad(`${at}.run의 스크립트가 없다: ${h.run[1]}`);
      }
      hooks.push({ index: i, at: h.at, from: h.from || 'any', tool: h.tool || null, run: h.run.slice(), onFail: h.onFail || 'pass', timeoutMs: Math.min(Number(h.timeoutMs) || HOOK_TIMEOUT_MS, HOOK_TIMEOUT_MAX_MS) });
    }
  }
  let guide = null;
  if (raw.guide != null) {
    const files = typeof raw.guide === 'string' ? { default: raw.guide } : raw.guide && typeof raw.guide === 'object' && !Array.isArray(raw.guide) ? raw.guide : null;
    if (!files) return bad('guide는 파일 경로 글이거나 { "default": 경로, "<주제>": 경로 }다');
    for (const [k, v] of Object.entries(files)) {
      if (typeof v !== 'string' || !v) return bad(`guide.${k}는 파일 경로 글이어야 한다`);
      if (root && (!inside(root, path.resolve(root, v)) || !exists(path.resolve(root, v)))) return bad(`guide.${k}의 파일이 워크스페이스 안에 없다: ${v}`);
    }
    const { default: dflt = null, ...topics } = files;
    guide = { default: dflt, topics };
  }
  // P183: 도구. { "<이름>": { run: [...], desc?, timeoutMs?, parallel? } }
  let tools = null;
  if (raw.tools != null) {
    if (typeof raw.tools !== 'object' || Array.isArray(raw.tools)) return bad('tools는 객체여야 한다');
    tools = {};
    for (const [name, x] of Object.entries(raw.tools)) {
      const at = `tools.${name}`;
      if (!TOOL_NAME_RE.test(name)) return bad(`${at}: 도구 이름은 글자·숫자로 시작하고 글자·숫자·_·.·-로 40자까지다`);
      if (!x || typeof x !== 'object' || Array.isArray(x)) return bad(`${at}는 객체여야 한다({ "run": [...] })`);
      if (!Array.isArray(x.run) || !x.run.length || x.run.some((w) => typeof w !== 'string' || !w)) return bad(`${at}.run은 빈 칸 없는 글 배열이어야 한다(예: ["node", "tools/x.mjs"]). ${TOOL_RUN_HINT}`);
      if (x.desc != null && typeof x.desc !== 'string') return bad(`${at}.desc는 글이다`);
      if (x.timeoutMs != null && !(Number(x.timeoutMs) > 0)) return bad(`${at}.timeoutMs는 양수다(최대 ${TOOL_TIMEOUT_MAX_MS})`);
      if (x.parallel != null && typeof x.parallel !== 'boolean') return bad(`${at}.parallel은 true 또는 false다`);
      if (root) {
        if (pathish(x.run[0]) && !exists(path.resolve(root, x.run[0])) && !['.exe', '.cmd', '.bat', '.com'].some((e) => exists(path.resolve(root, x.run[0] + e)))) return bad(`${at}.run의 파일이 없다: ${x.run[0]}. ${TOOL_RUN_HINT}`);
        if (!pathish(x.run[0]) && x.run[1] && /[\\/]/.test(x.run[1]) && path.extname(x.run[1]) && !x.run[1].startsWith('-') && !exists(path.resolve(root, x.run[1]))) return bad(`${at}.run의 스크립트가 없다: ${x.run[1]}`);
      }
      tools[name] = { name, run: x.run.slice(), desc: x.desc || '', timeoutMs: Math.min(Number(x.timeoutMs) || TOOL_TIMEOUT_MS, TOOL_TIMEOUT_MAX_MS), parallel: x.parallel === true };
    }
  }
  // P185: 자리·흐름(3단계, docs research harness-arch.md 14절)
  const fl = validateFlow(raw, { root, exists, tools });
  if (!fl.ok) return fl;
  return { ok: true, def: { name: typeof raw.name === 'string' ? raw.name : null, hooks, guide, tools, ...fl.flow } };
}

// ---------- P185: 자리(seats)·흐름(flow)·results·manager ----------
export const DEFAULT_RESULTS = ['ok', 'failed'];
export const SEAT_NAME_RE = /^[a-z][a-z0-9_]{0,23}$/; // 세션 이름(<자리>-<n>)이 되므로 -는 받지 않는다
export const RESULT_RE = /^[a-z][a-z0-9_]{0,23}$/;
export const SEAT_MAX_LIVE = 3;
export const SEAT_KINDS = ['claude', 'codex', 'opencode', 'pi'];
// → { ok, flow: { results, seats, flow, manager, warnings } } | { ok: false, reason }
//   seats: { <이름>: { name, launcher, session: keep|fresh, worktree, tools: [..] | null, may: [..], maxLive, guide } } | null(자리 없음: 1~2단계 rig)
//   flow: [{ index, from, on, to: [..], max, else }]. warnings: 상한 없는 되돌아감 등(정의는 쓰인다)
export function validateFlow(raw, { root = null, exists = isFile, tools = null } = {}) {
  const bad = (reason) => ({ ok: false, reason });
  const hasAny = raw.results != null || raw.seats != null || raw.flow != null || raw.manager != null;
  if (!hasAny) return { ok: true, flow: { results: DEFAULT_RESULTS.slice(), seats: null, flow: [], manager: null, warnings: [] } };
  let results = DEFAULT_RESULTS.slice();
  if (raw.results != null) {
    if (!Array.isArray(raw.results) || !raw.results.length) return bad('results는 낱말 배열이어야 한다(예: ["ok", "failed", "rejected"])');
    for (const r of raw.results) if (typeof r !== 'string' || !RESULT_RE.test(r) || r === 'assign') return bad(`results의 낱말은 영문 소문자로 시작하는 24자까지의 낱말이다(assign은 쓸 수 없다): ${JSON.stringify(r)}`);
    if (new Set(raw.results).size !== raw.results.length) return bad('results에 같은 낱말이 둘 있다');
    results = raw.results.slice();
  }
  if (raw.seats == null) return bad('results·flow·manager는 seats(자리)와 함께 쓴다');
  if (typeof raw.seats !== 'object' || Array.isArray(raw.seats) || !Object.keys(raw.seats).length) return bad('seats는 { "<자리>": { "launcher": …, "session": "keep" | "fresh" } } 객체다');
  const seats = {};
  for (const [name, x] of Object.entries(raw.seats)) {
    const at = `seats.${name}`;
    if (!SEAT_NAME_RE.test(name)) return bad(`${at}: 자리 이름은 영문 소문자로 시작하고 소문자·숫자·_로 24자까지다(세션 이름 <자리>-<n>이 된다)`);
    if (!x || typeof x !== 'object' || Array.isArray(x)) return bad(`${at}는 객체여야 한다`);
    if (typeof x.launcher !== 'string' || !x.launcher.trim()) return bad(`${at}.launcher는 보드의 런처 이름이나 종류(${SEAT_KINDS.join(', ')})다`);
    const session = x.session == null ? 'fresh' : x.session;
    if (!['keep', 'fresh'].includes(session)) return bad(`${at}.session은 keep 또는 fresh다: ${x.session}`);
    if (x.worktree != null && typeof x.worktree !== 'boolean') return bad(`${at}.worktree는 true 또는 false다`);
    if (x.worktree && session !== 'fresh') return bad(`${at}.worktree는 fresh 자리에만 쓴다(일마다 새 워크트리)`);
    if (x.worktree && SEAT_KINDS.includes(x.launcher) && x.launcher !== 'claude') return bad(`${at}.worktree는 Claude Code 자리에만 쓴다(claude -w)`);
    if (x.tools != null) {
      if (!Array.isArray(x.tools) || x.tools.some((t) => typeof t !== 'string')) return bad(`${at}.tools는 도구 이름 배열이다`);
      const miss = x.tools.filter((t) => !tools || !tools[t]);
      if (miss.length) return bad(`${at}.tools에 정의에 없는 도구가 있다: ${miss.join(', ')}`);
    }
    if (x.may != null && (!Array.isArray(x.may) || x.may.some((t) => typeof t !== 'string'))) return bad(`${at}.may는 자리 이름 배열이다`);
    if (x.max_live != null && (session !== 'fresh' || !Number.isInteger(x.max_live) || x.max_live < 1)) return bad(`${at}.max_live는 fresh 자리의 1 이상 정수다`);
    if (x.guide != null) {
      if (typeof x.guide !== 'string' || !x.guide) return bad(`${at}.guide는 파일 경로 글이다`);
      if (root && (!inside(root, path.resolve(root, x.guide)) || !exists(path.resolve(root, x.guide)))) return bad(`${at}.guide의 파일이 워크스페이스 안에 없다: ${x.guide}`);
    }
    seats[name] = { name, launcher: x.launcher.trim(), session, worktree: x.worktree === true, tools: x.tools ? x.tools.slice() : null, may: x.may ? x.may.slice() : [], maxLive: session === 'fresh' ? x.max_live || SEAT_MAX_LIVE : 1, guide: x.guide || null };
  }
  const seatNames = Object.keys(seats);
  const known = (n) => Object.prototype.hasOwnProperty.call(seats, n);
  for (const s of Object.values(seats)) { const miss = s.may.filter((n) => !known(n)); if (miss.length) return bad(`seats.${s.name}.may에 없는 자리가 있다: ${miss.join(', ')}`); }
  const flow = [];
  if (raw.flow != null) {
    if (!Array.isArray(raw.flow)) return bad('flow는 줄 배열이다');
    for (let i = 0; i < raw.flow.length; i++) {
      const l = raw.flow[i]; const at = `flow[${i}]`;
      if (!l || typeof l !== 'object' || Array.isArray(l)) return bad(`${at}는 객체여야 한다({ "from", "on", "to" })`);
      if (!known(l.from)) return bad(`${at}.from이 없는 자리를 가리킨다: ${l.from}. 자리: ${seatNames.join(', ')}`);
      if (l.on !== 'assign' && !results.includes(l.on)) return bad(`${at}.on은 assign 또는 results의 낱말(${results.join(', ')})이다: ${l.on}`);
      const to = Array.isArray(l.to) ? l.to : [l.to];
      if (!to.length || to.some((t) => !known(t))) return bad(`${at}.to가 없는 자리를 가리킨다: ${JSON.stringify(l.to)}. 자리: ${seatNames.join(', ')}`);
      if (l.on === 'assign' && to.length !== 1) return bad(`${at}: assign 줄의 to는 자리 하나다`);
      if (l.max != null && (!Number.isInteger(l.max) || l.max < 0)) return bad(`${at}.max는 0 이상 정수다`);
      if (l.else != null && (!known(l.else) || l.max == null)) return bad(l.max == null ? `${at}.else는 max와 함께 쓴다` : `${at}.else가 없는 자리를 가리킨다: ${l.else}`);
      if (l.max != null && l.on === 'assign') return bad(`${at}: max는 done 값 줄에 쓴다(assign 줄이 아니다)`);
      flow.push({ index: i, from: l.from, on: l.on, to, max: l.max ?? null, else: l.else ?? null });
    }
  }
  const manager = raw.manager == null ? null : raw.manager;
  if (manager != null && !known(manager)) return bad(`manager가 없는 자리를 가리킨다: ${manager}`);
  // 경고: 되돌아감(받는 자리에서 흐름을 따라 보낸 자리로 돌아올 수 있음)인데 상한이 없는 done 값 줄
  const warnings = [];
  const next = new Map(seatNames.map((n) => [n, new Set()]));
  for (const l of flow) for (const t of l.to) next.get(l.from).add(t);
  const reach = (a, b) => { const seen = new Set(); const st = [a]; while (st.length) { const x = st.pop(); if (x === b) return true; if (seen.has(x)) continue; seen.add(x); for (const y of next.get(x) || []) st.push(y); } return false; };
  for (const l of flow) if (l.on !== 'assign' && l.max == null && l.to.some((t) => t === l.from || reach(t, l.from))) warnings.push(`flow[${l.index}](${l.from} ${l.on} → ${l.to.join(', ')})는 되돌아가는 줄인데 max(상한)가 없다. 끝없이 돌 수 있다`);
  return { ok: true, flow: { results, seats, flow, manager, warnings } };
}

// 훅 입력의 세션 칸
export const sessionInfo = (s) => (s ? { id: s.sessionId || null, name: shownName(s) || s.name || null, kind: s.kind || 'claude', model: s.model || null, cwd: (s.rt && s.rt.cwd) || s.cwd || null, seat: s.rigSeat || null } : null); // P185: seat

export class Rig {
  // b: 백엔드(store, sessions, log). opts.env: 훅에 줄 환경(시험용. 기본 cleanEnv(process.env))
  constructor(b, { env = null } = {}) {
    this.b = b; this.envOverride = env;
    this.cache = new Map(); // 워크스페이스 키 → { sig, hash, def, invalid, good: { def, hash } | null, noted }
  }
  store() { return this.b.store; }
  rootOf(key) { const w = key ? this.store().getWorkspace(key) : null; return w ? w.root : null; }
  fileOf(key) { const r = this.rootOf(key); return r ? path.join(r, RIG_FILE) : null; }
  enabled(key) { const st = key && this.store().rigState ? this.store().rigState(key) : null; return !!(st && st.enabled); }

  // 정의 읽기(수정 시각·크기 캐시). → { present, def(쓸 정의: 맞은 것 또는 마지막 맞은 것), hash, invalid(지금 파일의 잘못 까닭 | null), file, root }
  read(key) {
    const root = this.rootOf(key); const file = root ? path.join(root, RIG_FILE) : null;
    if (!file) return { present: false, def: null, hash: null, invalid: null, file: null, root: null };
    let stat = null;
    try { stat = fs.statSync(file); } catch { stat = null; }
    const c = this.cache.get(key) || { sig: null, good: null };
    if (!stat || !stat.isFile()) { this.cache.set(key, { ...c, sig: null, def: null, hash: null, invalid: null }); return { present: false, def: null, hash: null, invalid: null, file, root }; }
    const sig = `${stat.mtimeMs}:${stat.size}`;
    if (c.sig !== sig) {
      let next;
      try {
        if (stat.size > RIG_MAX_BYTES) throw new Error(`파일이 너무 크다(${stat.size}바이트)`);
        const buf = fs.readFileSync(file);
        const hash = sha(buf);
        let raw;
        try { raw = JSON.parse(buf.toString('utf8').replace(/^﻿/, '')); } catch (e) { throw Object.assign(new Error(`JSON이 아니다: ${e.message}`), { hash }); }
        const v = validateRig(raw, { root });
        if (!v.ok) throw Object.assign(new Error(v.reason), { hash });
        next = { sig, hash, def: v.def, invalid: null, good: { def: v.def, hash } };
      } catch (e) {
        next = { sig, hash: c.good ? c.good.hash : null, def: c.good ? c.good.def : null, invalid: e.message, badHash: e.hash || null, good: c.good };
        const mark = `${e.hash || sig}:${e.message}`;
        if (c.noted !== mark) {
          next.noted = mark;
          try { this.store().addEvent(null, 'rig_invalid', { workspace: key, reason: e.message, hash: e.hash || null, usingHash: c.good ? c.good.hash : null }); } catch {}
          this.b.log && this.b.log(`rig_invalid ${key}: ${e.message}${c.good ? ' (using last good)' : ''}`);
        } else next.noted = c.noted;
      }
      this.cache.set(key, next);
    }
    const x = this.cache.get(key);
    return { present: true, def: x.def, hash: x.hash, invalid: x.invalid, file, root };
  }
  // 켜졌고 쓸 정의가 있으면 그 읽기 결과, 아니면 null
  active(key) {
    if (!key || !this.enabled(key)) return null;
    const r = this.read(key);
    return r.present && r.def ? r : null;
  }
  activeForSession(sessionId) { const s = this.b.sessions.get(sessionId); return s ? this.active(s.workspaceKey) : null; }

  // ---------- 판 API(사람) ----------
  status(key) {
    const w = this.store().getWorkspace(key);
    if (!w) throw apiError('not_found', `워크스페이스를 찾을 수 없다: ${key}`);
    const st = this.store().rigState(key) || {};
    const r = this.read(key);
    const def = r.def;
    return {
      workspace: key, root: w.root, file: RIG_FILE, enabled: !!st.enabled, enabledAt: st.enabledAt ?? null,
      present: r.present, valid: r.present && !r.invalid, invalid: r.invalid, hash: r.hash, usingLastGood: !!(r.invalid && def),
      state: !r.present ? 'none' : !def ? 'invalid' : st.enabled ? 'on' : 'off', // invalid가 있고 def도 있으면 마지막 맞은 정의를 쓰는 중
      hooks: def ? def.hooks.map((h) => ({ at: h.at, from: h.at === 'deliver' ? h.from : undefined, tool: h.tool || undefined, run: h.run, onFail: h.onFail })) : [],
      tools: def && def.tools ? Object.values(def.tools).map((x) => ({ name: x.name, run: x.run, desc: x.desc, timeoutMs: x.timeoutMs, parallel: x.parallel })) : [], // P183: 켜기 확인 창이 보인다
      guide: !!(def && def.guide), name: def ? def.name : null,
      // P185: 자리·흐름(켜기 확인 창과 노드 메뉴의 "자리 정하기"가 쓴다)
      seats: def && def.seats ? Object.values(def.seats).map((x) => ({ name: x.name, launcher: x.launcher, session: x.session, worktree: x.worktree, tools: x.tools, may: x.may, maxLive: x.maxLive, guide: x.guide })) : [],
      flow: def ? def.flow || [] : [], results: def ? def.results || [] : [], manager: def ? def.manager || null : null, warnings: def ? def.warnings || [] : [],
    };
  }
  setEnabled(key, on, by = 'human') {
    const w = this.store().getWorkspace(key);
    if (!w) throw apiError('not_found', `워크스페이스를 찾을 수 없다: ${key}`);
    this.store().setRigEnabled(key, !!on);
    const r = this.read(key);
    this.store().addEvent(null, on ? 'rig_enabled' : 'rig_disabled', { workspace: key, by, hash: r.hash, present: r.present });
    this.b.log && this.b.log(`rig ${on ? 'enabled' : 'disabled'} ${key}`);
    return this.status(key);
  }

  // ---------- 훅 ----------
  env() { return this.envOverride || cleanEnv(process.env); }
  // 한 길목의 훅들을 차례로 → { action: pass | reject, text, reason, runs, hash }
  //   ctx: { key, at, session, from: { kind, session? }, unit, try, text?, result?, doneText?, match(h) }
  //   P183: 도구 훅은 ctx.tool·args(tool-before는 args를 고칠 수 있다), tool-after는 ctx.after(exitCode·durationMs·outputTail·logPath). toolRunId는 기록에.
  //   → tool-before는 고친 args, tool-after는 덧붙일 글들(appends)을 함께 돌려준다
  async runAt(r, ctx) {
    const st = this.store();
    const hooks = r.def.hooks.filter((h) => h.at === ctx.at && (!ctx.match || ctx.match(h)));
    let text = ctx.text;
    let args = ctx.args != null ? ctx.args.slice() : null;
    const appends = [];
    const runs = [];
    const out = (extra) => ({ ...extra, text, ...(args ? { args } : {}), appends, runs, hash: r.hash });
    for (const h of hooks) {
      const input = {
        v: 1, at: ctx.at, rigHash: r.hash, workspace: { key: ctx.key, root: r.root },
        session: ctx.session || null, from: ctx.from || null, unit: ctx.unit || null, try: ctx.try || null,
        ...(text != null ? { text } : {}), ...(ctx.result != null ? { result: ctx.result } : {}), ...(ctx.doneText != null ? { doneText: ctx.doneText } : {}),
        ...(ctx.tool != null ? { tool: ctx.tool } : {}), ...(args ? { args } : {}), ...(ctx.after || {}),
      };
      const res = await runHook({ run: h.run, cwd: r.root, env: this.env(), input, timeoutMs: h.timeoutMs });
      const rec = { workspaceKey: ctx.key, at: ctx.at, hookIndex: h.index, argv: h.run, rigHash: r.hash, sessionId: ctx.session ? ctx.session.id : null, unitId: ctx.unit ? ctx.unit.id : null, tryId: ctx.try ? ctx.try.id : null, ms: res.ms, toolRunId: ctx.toolRunId || null };
      if (!res.ok) {
        const blocked = h.onFail === 'block';
        st.insertHookRun({ ...rec, decision: blocked ? 'blocked' : 'failed', error: res.error, reason: blocked ? `훅 실패(onFail block): ${res.error}` : null });
        try { st.addEvent(rec.sessionId, 'hook_failed', { workspace: ctx.key, at: ctx.at, hook: h.index, argv: h.run, error: res.error, onFail: h.onFail, rigHash: r.hash }); } catch {}
        runs.push({ at: ctx.at, hook: h.index, decision: blocked ? 'blocked' : 'failed', error: res.error });
        if (blocked) return out({ action: 'reject', reason: `rig 훅 ${h.index}(${h.run.join(' ')})이 실패했다: ${res.error}` });
        continue;
      }
      const o = res.out;
      const before = text; const beforeArgs = args;
      if (o.action === 'reject') {
        st.insertHookRun({ ...rec, decision: 'reject', reason: o.reason || null, note: o.note || null });
        runs.push({ at: ctx.at, hook: h.index, decision: 'reject', reason: o.reason || null });
        return out({ action: 'reject', reason: o.reason || `rig 훅 ${h.index}이 거절했다(까닭 없음)` });
      }
      if (text != null && ctx.at === 'deliver') {
        if (o.action === 'rewrite' && typeof o.text === 'string' && o.text.trim()) text = o.text;
        if (o.append) text = `${text.replace(/\s+$/, '')}\n${o.append}`;
      }
      if (ctx.at === 'tool-before' && o.action === 'rewrite' && Array.isArray(o.args)) args = o.args.map(String);
      if (ctx.at === 'tool-after' && o.append) appends.push(o.append);
      const changed = before !== text;
      const argsChanged = beforeArgs !== args;
      st.insertHookRun({ ...rec, decision: o.action, reason: o.reason || null, note: o.note || null, beforeText: changed ? before : argsChanged ? JSON.stringify(beforeArgs) : null });
      runs.push({ at: ctx.at, hook: h.index, decision: o.action, ...(changed || argsChanged ? { changed: true } : {}), ...(o.reason ? { reason: o.reason } : {}) });
    }
    return out({ action: 'pass', reason: null });
  }

  // deliver 훅: 받는 세션의 워크스페이스 rig. target: 받는 세션(띄우기 전 child면 { workspaceKey, name, kind, model, cwd }), from: { kind: human|agent, session? }
  //   → { action: pass | reject, text, reason } (rig가 없거나 꺼졌으면 그대로 pass, 기록 없음)
  async deliver({ target, workspaceKey = null, from, text }) {
    const key = workspaceKey || (target && target.workspaceKey) || null;
    const r = this.active(key);
    if (!r || !r.def.hooks.some((h) => h.at === 'deliver')) return { action: 'pass', text, reason: null, runs: [] };
    const tr = target && target.sessionId ? this.store().openTryOf(target.sessionId) : null;
    const unit = tr ? this.store().getUnit(tr.unitId) : null;
    return this.runAt(r, {
      key, at: 'deliver', session: sessionInfo(target), from: { kind: from.kind, ...(from.seat ? { seat: from.seat } : {}), ...(from.session ? { session: sessionInfo(from.session) } : {}) }, // P185: flow면 보낸 자리(seat)
      unit: unit ? { id: unit.id, from: unit.from, spec: unit.spec, origin: unit.origin } : null, try: tr ? { id: tr.id, startedAt: tr.startedAt } : null,
      text, match: (h) => h.from === 'any' || h.from === from.kind,
    });
  }
  // done 훅: 부르는 세션의 워크스페이스 rig. → { action, reason }
  async done({ caller, tryRow, unit, result, text }) {
    const key = caller.workspaceKey;
    const r = this.active(key);
    if (!r || !r.def.hooks.some((h) => h.at === 'done')) return { action: 'pass', reason: null, runs: [] };
    return this.runAt(r, {
      key, at: 'done', session: sessionInfo(caller), from: { kind: 'agent', session: sessionInfo(caller) },
      unit: unit ? { id: unit.id, from: unit.from, spec: unit.spec, origin: unit.origin } : null, try: tryRow ? { id: tryRow.id, startedAt: tryRow.startedAt } : null,
      result, doneText: text,
    });
  }

  // ---------- atrium guide [주제] ----------
  // → { rig: { state, invalid, hash, topic, topics, text, clipped, file } }  state: none | off | on | invalid
  guide(caller, topic = null) {
    const key = caller.workspaceKey;
    const r = key ? this.read(key) : { present: false };
    const on = key ? this.enabled(key) : false;
    const base = { workspace: key, root: r.root || null, file: RIG_FILE, invalid: r.invalid || null, hash: r.hash || null };
    if (!r.present) return { ...base, state: 'none', text: null };
    if (!on) return { ...base, state: r.invalid && !r.def ? 'invalid' : 'off', text: null };
    if (!r.def) return { ...base, state: 'invalid', text: null };
    const g = r.def.guide;
    const topics = g ? Object.keys(g.topics) : [];
    base.tools = r.def.tools ? Object.keys(r.def.tools) : []; // P183: atrium tool로 부를 도구 이름
    if (!g) return { ...base, state: 'on', topics, text: null };
    const want = topic ? String(topic) : null;
    const rel = want ? g.topics[want] || (want === 'default' ? g.default : null) : g.default || (topics.length ? g.topics[topics[0]] : null);
    if (want && !rel) return { ...base, state: 'on', topics, topic: want, missing: true, text: null };
    let text = null, clipped = false;
    try {
      const f = path.resolve(r.root, rel);
      if (!inside(r.root, f)) throw new Error('워크스페이스 밖');
      text = fs.readFileSync(f, 'utf8').replace(/^﻿/, '');
      if (text.length > GUIDE_MAX) { text = text.slice(0, GUIDE_MAX); clipped = true; }
    } catch (e) { return { ...base, state: 'on', topics, topic: want, error: `안내 파일을 읽지 못했다(${rel}): ${e.message}`, text: null }; }
    return { ...base, state: 'on', topics, topic: want || (g.default ? 'default' : topics[0]), path: rel, text, clipped };
  }
}

// 켜진 rig가 있는 워크스페이스의 일 머리에 붙는 한 줄(짧게)
export const RIG_HEADER_LINE = '[Atrium 보드] 이 워크스페이스에는 rig(작업 규칙)가 있다. 안내: `atrium guide`.';

// 판 API 처리기(backend.mjs handlers에 펼친다). 켜고 끄기는 판 API 토큰으로 붙은 연결(이 PC의 창·사람의 atrium 명령, auth.kind local)만.
// 기기 토큰(휴대폰·원격)은 상태만 본다. 에이전트의 세션 토큰은 이 API에 붙지 못하고, /branch/*에는 rig를 켜는 명령이 없다
export function rigHandlers(b) {
  const local = (c) => { if (!c || !c.auth || c.auth.kind !== 'local') throw apiError('forbidden', 'rig 켜기·끄기는 이 PC의 보드 창에서만 한다(판 API 토큰).'); };
  const keyOf = async (p) => (await b.resolveWorkspace(p.workspace)).key;
  const set = async (p, c, on) => { local(c); const r = b.rig.setEnabled(await keyOf(p), on, 'human'); if (b.broadcastWorkspaces) b.broadcastWorkspaces(); return r; };
  return {
    'rig.status': async (p) => b.rig.status(await keyOf(p)),
    // P183: 켜기는 사람이 확인한 뒤에만(confirm: true). 없으면 켜지 않고 돌 훅·도구의 명령을 돌려준다(창의 확인 창이 보인다).
    //   정의가 나중에 바뀌어도 다시 묻지 않고, 끌 때는 묻지 않는다
    'rig.enable': async (p, c) => {
      local(c);
      if (!p || p.confirm !== true) return { ...b.rig.status(await keyOf(p || {})), needsConfirm: true };
      return set(p, c, true);
    },
    'rig.disable': (p, c) => set(p, c, false),
  };
}
