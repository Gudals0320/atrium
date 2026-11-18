// P182: rig(하네스 정의) 1단계. docs research harness-arch.md 13절("이름과 자리", "켜기", "정의 읽기", "훅", "deliver 훅의 자리", "done 훅", "atrium guide").
// - 정의는 워크스페이스 뿌리(본 체크아웃, workspaces.root)의 .atrium/rig.json이다. 워크트리 세션도 본 체크아웃의 정의를 따른다.
//   P190(16절): 판이 .atrium/을 쓰는 것은 사람이 고른 동작 rig.create·rig.save뿐이다(rig-setup.mjs). 제작 세션은 스스로 쓴다.
// - 켜기는 사람만(판 API rig.enable·rig.disable, workspaces.rig_enabled). 꺼졌거나 정의가 없는 워크스페이스는 훅도 기록도 없다(오늘과 같다).
// - 읽기: 부를 때마다 파일 수정 시각·크기로 캐시하고 바뀌면 다시 읽어 검사한다. 잘못된 정의는 마지막으로 맞았던 정의를 그대로 쓰고
//   판 이벤트 rig_invalid(까닭)를 한 번 남긴다(같은 내용이면 다시 남기지 않는다). atrium guide와 rig.status가 그 까닭을 보인다.
// - 정의 해시(파일 바이트의 SHA-256)를 모든 훅 실행 기록(rig_hook_runs)에 남긴다.
// - 훅: 같은 길목의 훅은 정의 순서대로 돌고, 고친 글(rewrite·append)이 다음 훅으로 넘어가며, 첫 거절에서 멈춘다.
//   실패(hook-runner.mjs)는 onFail을 따른다: 기본 pass(hook_failed 이벤트를 남기고 이어 간다), block이면 거절과 같다.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { runHook, pathish, HOOK_TIMEOUT_MS, HOOK_TIMEOUT_MAX_MS } from './hook-runner.mjs';
import { cleanEnv } from './proc-env.mjs';
import { shownName } from './session-label.mjs';
import { isModelName } from './model-name.mjs'; // P209: 자리 model
import { EFFORTS } from './settings.mjs'; // P209: 자리 effort(Claude Code)
import { CODEX_EFFORTS } from './launchers.mjs'; // P209: 자리 effort(Codex, P208의 model_reasoning_effort 옮기기와 같은 표)
import { AMP_ATS, validateAmp } from './rig-amp.mjs'; // P189: 6단계 증폭 칸(writes, pre-tool, stopVerify)
import { rigEvent } from './rig-ledger.mjs'; // P217: 장부
import { validateDocs } from './rig-docs.mjs'; // P219: rig 2 문서(docs, loads·reads·writes·records)
import { spreadLoops, loopFlowReason, finishLoops } from './rig-loops.mjs'; // P221: rig 2 고리(loops)

export const RIG_FILE = '.atrium/rig.json';
export const HOOK_ATS = ['deliver', 'done', 'tool-before', 'tool-after', ...AMP_ATS];
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
export function validateRig(raw, { root, exists = isFile, cycleMinMs = CYCLE_MIN_MS } = {}) {
  const bad = (reason) => ({ ok: false, reason });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('정의는 JSON 객체여야 한다');
  const dv = validateDocs(raw, { root, exists: root ? (f) => { try { fs.statSync(f); return true; } catch { return false; } } : null }); // P219
  if (!dv.ok) return dv;
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
  // P185: 자리·흐름(3단계, docs research harness-arch.md 14절). P221: loops가 있으면 고리마다의 flow 줄을 펴서 같은 검사를 지난다
  const sp = spreadLoops(raw);
  if (!sp.ok) return sp;
  const fl0 = validateFlow(sp.raw, { root, exists, tools });
  if (!fl0.ok) return { ok: false, reason: loopFlowReason(fl0.reason, sp.lineOf) };
  const fl = sp.lineOf ? { ...fl0, flow: { ...fl0.flow, warnings: fl0.flow.warnings.map((w) => loopFlowReason(w, sp.lineOf)) } } : fl0;
  // P188: 느린 고리(15절)
  const cy = validateCycles(raw, fl.flow, { root, exists, cycleMinMs });
  if (!cy.ok) return cy;
  const amp = validateAmp(raw, { seats: fl.flow.seats, docs: dv.docs }); if (!amp.ok) return amp; // P189. P219: writes의 문서 이름 → 경로
  const lp = finishLoops(raw, fl.flow, cy.cycles, dv.docs, sp.lineOf, { cycleMinMs }); if (!lp.ok) return lp; // P221: 고리(loops 없으면 work·improve로 읽음)
  // P219: version, docs(문서), seatDocs(자리의 loads·reads·writes 문서), hookDocs·toolDocs(records·reads). 문서 경고는 정의 경고에 더한다
  return { ok: true, def: { name: typeof raw.name === 'string' ? raw.name : null, hooks, guide, tools, ...fl.flow, warnings: [...fl.flow.warnings, ...dv.warnings, ...lp.warnings, ...(amp.warnings || [])], cycles: cy.cycles, loops: lp.loops, amp: amp.amp, version: dv.version, docs: dv.docs, seatDocs: dv.seatDocs, hookDocs: dv.hookDocs, toolDocs: dv.toolDocs } };
}

// ---------- P195: 워크트리 자리의 저장소 조건 ----------
// worktree 자리는 일마다 claude -w로 새 워크트리를 만든다. 워크스페이스가 git 저장소이고 커밋(HEAD)이 있어야 한다.
// 폴더의 git 상태 → 'ok' | 'norepo' | 'nocommit'. 잠깐(3초) 기억한다(rig.get·status가 자주 부른다)
const gitStateMemo = new Map();
export function gitStateOf(root, { run = null, now = Date.now() } = {}) {
  if (!root) return 'norepo';
  const m = !run && gitStateMemo.get(root);
  if (m && now - m.at < 3000) return m.v;
  const exec = run || ((args) => execFileSync('git', ['-C', root, ...args], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, windowsHide: true }).toString().trim());
  let v;
  try { v = exec(['rev-parse', '--is-inside-work-tree']) === 'true' ? 'nocommit' : 'norepo'; } catch { v = 'norepo'; }
  if (v === 'nocommit') { try { exec(['rev-parse', '--verify', '-q', 'HEAD']); v = 'ok'; } catch { v = 'nocommit'; } }
  if (!run) gitStateMemo.set(root, { at: now, v });
  return v;
}
// 정의의 worktree 자리와 git 상태 → 경고 글 목록(없으면 []). state: gitStateOf 결과
export function worktreeWarnings(seats, state) {
  if (state === 'ok' || !seats) return [];
  const list = (Array.isArray(seats) ? seats : Object.values(seats)).filter((x) => x && x.worktree).map((x) => x.name);
  if (!list.length) return [];
  const why = state === 'norepo' ? '워크스페이스가 git 저장소가 아니다(git init과 첫 커밋이 필요하다)' : '저장소에 커밋이 없다(첫 커밋이 필요하다)';
  return [`이 자리는 워크트리를 쓴다(${list.join(', ')}): git 저장소와 첫 커밋이 필요하다. 지금은 ${why}. 이대로 켜면 첫 맡기기가 워크트리를 만들지 못해 실패한다.`];
}

// ---------- P188: 느린 고리(cycles), 정의 버전, 사람만 고치는 목록(15절 "5단계") ----------
export const CYCLE_MIN_MS = 60 * 60 * 1000; // 주기는 1시간 이상
export const CYCLE_STALE_MS = 24 * 60 * 60 * 1000; // 오래 열린 건: 마지막 넘김 뒤 이만큼(줄의 stale로 바꾼다)
export const CYCLE_RUN_TIMEOUT_MS = 60000;
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
// "7d", "12h", "90m", "30s" 또는 밀리초 수 → ms | null
export function parseEvery(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*([smhdw])\s*$/.exec(String(v || ''));
  return m ? Math.floor(Number(m[1]) * UNIT_MS[m[2]]) : null;
}
// 주기의 하한. 개발용 판(profile dev)에서만 ATRIUM_RIG_CYCLE_MIN_MS로 줄인다(시험용)
export function cycleMinOf(cfg, env = process.env) {
  const v = Number(env.ATRIUM_RIG_CYCLE_MIN_MS);
  return cfg && cfg.profile === 'dev' && v > 0 ? Math.floor(v) : CYCLE_MIN_MS;
}
// cycles: [{ every, to: <자리> | "manager", run?, stale?, timeoutMs? }] → { ok, cycles: [{ index, every, everyMs, to(자리 이름), run, staleMs, timeoutMs }] }
export function validateCycles(raw, flow, { root = null, exists = isFile, cycleMinMs = CYCLE_MIN_MS } = {}) {
  const bad = (reason) => ({ ok: false, reason });
  if (raw.cycles == null) return { ok: true, cycles: [] };
  if (!Array.isArray(raw.cycles)) return bad('cycles는 줄 배열이다(예: [{ "every": "7d", "to": "manager" }])');
  if (!flow.seats) return bad('cycles는 seats(자리)와 함께 쓴다(주기마다 그 자리에 일을 만든다)');
  const out = [];
  for (let i = 0; i < raw.cycles.length; i++) {
    const x = raw.cycles[i]; const at = `cycles[${i}]`;
    if (!x || typeof x !== 'object' || Array.isArray(x)) return bad(`${at}는 객체여야 한다({ "every", "to" })`);
    const everyMs = parseEvery(x.every);
    if (!everyMs) return bad(`${at}.every는 "7d", "12h", "90m" 꼴의 주기다: ${JSON.stringify(x.every)}`);
    if (everyMs < cycleMinMs) return bad(`${at}.every는 ${Math.round(cycleMinMs / 60000)}분 이상이다: ${x.every}`);
    let to = x.to == null ? 'manager' : x.to;
    if (typeof to !== 'string') return bad(`${at}.to는 자리 이름이나 "manager"다`);
    if (!Object.prototype.hasOwnProperty.call(flow.seats, to)) {
      if (to !== 'manager') return bad(`${at}.to가 없는 자리를 가리킨다: ${to}. 자리: ${Object.keys(flow.seats).join(', ')}`);
      if (!flow.manager) return bad(`${at}.to가 manager인데 정의에 manager(관리자 자리)가 없다`);
      to = flow.manager;
    }
    if (x.run != null) {
      if (!Array.isArray(x.run) || !x.run.length || x.run.some((w) => typeof w !== 'string' || !w)) return bad(`${at}.run은 빈 칸 없는 글 배열이어야 한다(예: ["node", ".atrium/tools/summary.mjs"])`);
      if (root) {
        if (pathish(x.run[0]) && !exists(path.resolve(root, x.run[0])) && !['.exe', '.cmd', '.bat', '.com'].some((e) => exists(path.resolve(root, x.run[0] + e)))) return bad(`${at}.run의 파일이 없다: ${x.run[0]}`);
        if (!pathish(x.run[0]) && x.run[1] && /[\\/]/.test(x.run[1]) && path.extname(x.run[1]) && !x.run[1].startsWith('-') && !exists(path.resolve(root, x.run[1]))) return bad(`${at}.run의 스크립트가 없다: ${x.run[1]}`);
      }
    }
    const staleMs = x.stale == null ? CYCLE_STALE_MS : parseEvery(x.stale);
    if (!staleMs) return bad(`${at}.stale은 "1d", "12h" 꼴이다: ${JSON.stringify(x.stale)}`);
    if (x.timeoutMs != null && !(Number(x.timeoutMs) > 0)) return bad(`${at}.timeoutMs는 양수다(최대 ${HOOK_TIMEOUT_MAX_MS * 5})`);
    out.push({ index: i, every: String(x.every), everyMs, to, run: x.run ? x.run.slice() : null, staleMs, timeoutMs: Math.min(Number(x.timeoutMs) || CYCLE_RUN_TIMEOUT_MS, HOOK_TIMEOUT_MAX_MS * 5) });
  }
  return { ok: true, cycles: out };
}

// JSON 포인터(RFC 6901)로 값 읽기. 없으면 undefined
export function pointerGet(obj, ptr) {
  if (ptr === '') return obj;
  if (typeof ptr !== 'string' || !ptr.startsWith('/')) return undefined;
  let cur = obj;
  for (const raw of ptr.slice(1).split('/')) {
    const k = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (cur == null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, k)) return undefined;
    cur = cur[k];
  }
  return cur;
}
export const POINTER_RE = /^(\/[^\/]*)+$/;
// 키 차례와 상관없이 같은 값인가
const canon = (v) => JSON.stringify(v === undefined ? null : v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((kk) => [kk, x[kk]])) : x));
export const samePointer = (a, b, p) => canon(pointerGet(a, p)) === canon(pointerGet(b, p)) && (pointerGet(a, p) === undefined) === (pointerGet(b, p) === undefined);
// 후보 정의(raw)가 기준(base)에서 바꾼 보호 포인터
export const protectedHits = (raw, base, pointers) => (base && pointers ? pointers.filter((p) => !samePointer(raw, base, p)) : []);
const fileSha = (f) => { try { return sha(fs.readFileSync(f)); } catch { return null; } };
// 데이터 폴더 rigs/ 아래 워크스페이스 폴더 이름(키에는 :, / 등이 있다)
export const rigDirName = (key) => `${String(key).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(-60) || 'ws'}-${sha(String(key)).slice(0, 8)}`;

// ---------- P195: 자리가 rig 밖 세션에 보내기 ----------
// may의 칸: 자리 이름 | "@<세션 이름>"(rig 밖 그 세션) | "*"(자리 없는 세션 모두). 관리자 자리(manager)는 적지 않아도 rig 밖 세션에 글을 보낸다
export const OUTSIDE_NAME_RE = /^@[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
export const isOutsideMay = (n) => n === '*' || (typeof n === 'string' && n.startsWith('@'));
// 자리(seat: 검사한 자리, manager: 정의의 manager)가 rig 밖 세션 t(shownName·name)에 글을 보내도 되나
export function mayReachOutside(seat, manager, names = []) {
  if (!seat) return false;
  if (manager && seat.name === manager) return true;
  const may = seat.may || [];
  if (may.includes('*')) return true;
  const want = new Set(names.filter(Boolean).map((x) => `@${String(x).toLowerCase()}`));
  return may.some((m) => m.startsWith('@') && want.has(m.toLowerCase()));
}

// ---------- P185: 자리(seats)·흐름(flow)·results·manager ----------
export const DEFAULT_RESULTS = ['ok', 'failed'];
export const SEAT_NAME_RE = /^[a-z][a-z0-9_]{0,23}$/; // 세션 이름(<자리>-<n>)이 되므로 -는 받지 않는다
export const RESULT_RE = /^[a-z][a-z0-9_]{0,23}$/;
export const SEAT_MAX_LIVE = 3;
export const SEAT_KINDS = ['claude', 'codex', 'opencode', 'pi'];
// P209: 자리의 노력 수준(seats.<자리>.effort). 하네스마다 받는 값. Claude Code는 claude --effort, Codex는 model_reasoning_effort로 넘긴다.
//   opencode·pi는 노력 수준 칸이 없다. 런처 이름 자리는 정의만으로 하네스를 모르므로 둘을 합친 값을 받고 atrium rig check가 런처의 종류로 다시 본다
export const SEAT_EFFORTS = { claude: EFFORTS.filter(Boolean), codex: CODEX_EFFORTS.slice() };
// 자리 effort가 그 종류에 맞나 → null(맞음) | 까닭
export function seatEffortError(kind, effort) {
  const ok = SEAT_EFFORTS[kind];
  if (!ok) return `${kind} 자리는 effort를 받지 않는다(Claude Code·Codex만)`;
  return ok.includes(effort) ? null : `${kind} 자리의 effort는 ${ok.join(', ')} 가운데 하나다: ${effort}`;
}
// → { ok, flow: { results, seats, flow, manager, warnings } } | { ok: false, reason }
//   seats: { <이름>: { name, launcher, session: keep|fresh, worktree, tools: [..] | null, may: [..], maxLive, guide, effort, model } } | null(자리 없음: 1~2단계 rig)
//   P209: effort·model은 그 자리 세션을 띄울 때 호출자 기본값을 덮는다(null이면 런처·주인의 것). model은 종류 이름 자리만(런처 자리는 그 런처의 모델)
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
    if (x.may != null && (!Array.isArray(x.may) || x.may.some((t) => typeof t !== 'string'))) return bad(`${at}.may는 자리 이름, "@<세션 이름>", "*"의 배열이다`);
    if (x.may != null) { const badOut = x.may.find((t) => t.startsWith('@') && !OUTSIDE_NAME_RE.test(t)); if (badOut) return bad(`${at}.may의 rig 밖 세션 이름이 맞지 않다: ${badOut}. "@<보드의 세션 이름>"(영문·숫자로 시작, 영문·숫자·-·_ 32자까지) 또는 "*"(자리 없는 세션 모두)다`); }
    if (x.max_live != null && (session !== 'fresh' || !Number.isInteger(x.max_live) || x.max_live < 1)) return bad(`${at}.max_live는 fresh 자리의 1 이상 정수다`);
    if (x.guide != null) {
      if (typeof x.guide !== 'string' || !x.guide) return bad(`${at}.guide는 파일 경로 글이다`);
      if (root && (!inside(root, path.resolve(root, x.guide)) || !exists(path.resolve(root, x.guide)))) return bad(`${at}.guide의 파일이 워크스페이스 안에 없다: ${x.guide}`);
    }
    const kindSeat = SEAT_KINDS.includes(x.launcher.trim()) ? x.launcher.trim() : null;
    if (x.effort != null) {
      if (typeof x.effort !== 'string' || !x.effort) return bad(`${at}.effort는 노력 수준 낱말이다(Claude Code: ${SEAT_EFFORTS.claude.join(', ')}. Codex: ${SEAT_EFFORTS.codex.join(', ')})`);
      const why = kindSeat ? seatEffortError(kindSeat, x.effort) : [...SEAT_EFFORTS.claude, ...SEAT_EFFORTS.codex].includes(x.effort) ? null : `${at}.effort는 ${[...new Set([...SEAT_EFFORTS.claude, ...SEAT_EFFORTS.codex])].join(', ')} 가운데 하나다: ${x.effort}`;
      if (why) return bad(why.startsWith(at) ? why : `${at}.effort: ${why}`);
    }
    if (x.model != null) {
      if (!isModelName(x.model)) return bad(`${at}.model은 모델 이름이다(영문·숫자로 시작, 영문·숫자·._:/[]- 80자까지): ${JSON.stringify(x.model)}`);
      if (!kindSeat) return bad(`${at}.model은 launcher가 종류 이름(${SEAT_KINDS.join(', ')})인 자리에만 쓴다. 런처 자리는 그 런처의 모델로 띄운다(다른 모델이면 그 모델의 런처를 launcher에 쓴다)`);
    }
    seats[name] = { name, launcher: x.launcher.trim(), session, worktree: x.worktree === true, tools: x.tools ? x.tools.slice() : null, may: x.may ? x.may.slice() : [], maxLive: session === 'fresh' ? x.max_live || SEAT_MAX_LIVE : 1, guide: x.guide || null, effort: x.effort || null, model: x.model || null };
  }
  const seatNames = Object.keys(seats);
  const known = (n) => Object.prototype.hasOwnProperty.call(seats, n);
  // P195: may에는 자리 이름 말고 rig 밖 세션("@<이름>")과 "*"(자리 없는 세션 모두)도 쓴다. 그쪽에는 글만 간다(일은 만들지 않는다)
  for (const s of Object.values(seats)) { const miss = s.may.filter((n) => !isOutsideMay(n) && !known(n)); if (miss.length) return bad(`seats.${s.name}.may에 없는 자리가 있다: ${miss.join(', ')}. rig 밖 세션이면 "@<이름>"이나 "*"로 쓴다`); }
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
  // 경고: 상한 없는 되돌아감. 받는 자리에서 상한 없는 done 값 줄만 따라 보낸 자리로 돌아올 수 있으면 판이 끝없이 넘길 수 있다
  //   (assign 줄은 에이전트가 보낼 때만 돌고, 상한 있는 줄이 낀 고리는 그 줄이 끊는다)
  const warnings = [];
  const next = new Map(seatNames.map((n) => [n, new Set()]));
  for (const l of flow) if (l.on !== 'assign' && l.max == null) for (const t of l.to) next.get(l.from).add(t);
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
    this.cache = new Map(); // 워크스페이스 키 → { sig, hash, def, invalid, good: { def, hash, raw, n } | null, noted }
    this.pendingBy = new Map(); // P188: 워크스페이스 키 → { hash, by, note }(rollback이 다시 쓴 내용을 다음 읽기가 그 누가로 적는다)
    this.versionDefs = new Map(); // P188: `${키}|${n}` → { def, hash, raw, n }(건이 쥔 버전의 정의)
    this.alertMarks = new Map(); // P188: 같은 보호 알림을 되풀이하지 않는다
  }
  cycleMin() { return cycleMinOf(this.b.cfg); }
  store() { return this.b.store; }
  rootOf(key) { const w = key ? this.store().getWorkspace(key) : null; return w ? w.root : null; }
  fileOf(key) { const r = this.rootOf(key); return r ? path.join(r, RIG_FILE) : null; }
  enabled(key) { const st = key && this.store().rigState ? this.store().rigState(key) : null; return !!(st && st.enabled); }
  // P223: 사람이 그 자리의 unattended(묻지 않음)를 승인했는가
  permitted(key, seat) { return !!(key && seat && this.store().rigPermitted && this.store().rigPermitted(key, seat)); }
  // P223: 정의에서 permission이 unattended인 자리 이름들
  unattendedSeats(def) { return def && def.amp ? Object.entries(def.amp.seats || {}).filter(([, x]) => x.permission === 'unattended').map(([n]) => n) : []; }
  // P223: 사람의 승인(켜기 확인, rig.permit). seats: 승인할 자리 이름들(unattended 자리만 받는다) → 승인한 자리
  permit(key, seats, by = 'human') {
    const r = this.read(key);
    const want = this.unattendedSeats(r.def);
    const list = (seats == null ? want : seats).filter((n) => want.includes(n) && !this.permitted(key, n));
    for (const n of list) {
      this.store().setRigPermit(key, n, by);
      rigEvent(this.b, { kind: 'seat_permission', ws: key, defN: r.n ?? null, seat: n, value: 'approved', actor: 'human', text: `${n}: unattended(묻지 않음)를 사람이 승인(${by})`, data: { asked: 'unattended', permission: 'unattended', approved: true, by } });
    }
    if (list.length && this.b.log) this.b.log(`rig permit ${key}: ${list.join(', ')}`);
    return list;
  }

  // 정의 읽기(수정 시각·크기 캐시). → { present, def(쓸 정의: 맞은 것 또는 마지막 맞은 것), hash, invalid(지금 파일의 잘못 까닭 | null), file, root }
  read(key) {
    const root = this.rootOf(key); const file = root ? path.join(root, RIG_FILE) : null;
    if (!file) return { present: false, def: null, hash: null, invalid: null, file: null, root: null };
    let stat = null;
    try { stat = fs.statSync(file); } catch { stat = null; }
    const c = this.cache.get(key) || { sig: null, good: null };
    if (!stat || !stat.isFile()) { this.cache.set(key, { ...c, sig: null, def: null, hash: null, invalid: null }); return { present: false, def: null, hash: null, invalid: null, file, root }; }
    const on = this.enabled(key); // P188: 버전과 보호는 켜진 rig만(꺼진 워크스페이스는 지금과 같다). 켜면 다시 읽어 남긴다
    const sig = `${stat.mtimeMs}:${stat.size}:${on ? 1 : 0}`;
    if (c.sig !== sig) {
      let next;
      try {
        if (stat.size > RIG_MAX_BYTES) throw new Error(`파일이 너무 크다(${stat.size}바이트)`);
        const buf = fs.readFileSync(file);
        const hash = sha(buf);
        let raw;
        try { raw = JSON.parse(buf.toString('utf8').replace(/^﻿/, '')); } catch (e) { throw Object.assign(new Error(`JSON이 아니다: ${e.message}`), { hash }); }
        const v = validateRig(raw, { root, cycleMinMs: this.cycleMin() });
        if (!v.ok) throw Object.assign(new Error(v.reason), { hash });
        // P188: 새 해시면 버전으로 남긴다. 사람만 고치는 포인터를 바꿨으면 쓰지 않고 마지막 맞은 버전을 쓴다
        const a = on ? this.adopt(key, { buf, hash, raw, def: v.def, mtimeMs: stat.mtimeMs, prev: c.good }) : { ok: true, n: null };
        if (!a.ok) throw Object.assign(new Error(a.reason), { hash, fallback: a.fallback, protectedHits: a.hits });
        next = { sig, hash, def: v.def, invalid: null, good: { def: v.def, hash, raw, n: a.n } };
      } catch (e) {
        const good = e.fallback || c.good || this.lastGood(key);
        next = { sig, hash: good ? good.hash : null, def: good ? good.def : null, invalid: e.message, badHash: e.hash || null, good, protectedHits: e.protectedHits || null };
        const mark = `${e.hash || sig}:${e.message}`;
        if (c.noted !== mark) {
          next.noted = mark;
          if (e.protectedHits) this.alert(key, { kind: 'pointer', items: e.protectedHits, hash: e.hash, reason: e.message, usingN: good ? good.n : null });
          else { try { this.store().addEvent(null, 'rig_invalid', { workspace: key, reason: e.message, hash: e.hash || null, usingHash: good ? good.hash : null }); } catch {} rigEvent(this.b, { kind: 'rig_invalid', ws: key, defN: good ? good.n ?? null : null, actor: 'board', text: e.message, data: { hash: e.hash || null, usingHash: good ? good.hash : null } }); }
          this.b.log && this.b.log(`rig_invalid ${key}: ${e.message}${good ? ' (using last good)' : ''}`);
        } else next.noted = c.noted;
      }
      this.cache.set(key, next);
    }
    const x = this.cache.get(key);
    return { present: true, def: x.def, hash: x.hash, invalid: x.invalid, file, root, n: x.good ? x.good.n ?? null : null, protectedHits: x.protectedHits || null };
  }

  // ---------- P188: 버전 ----------
  dataDir() { return this.b.cfg && this.b.cfg.dataDir ? this.b.cfg.dataDir : null; }
  versionPath(key, n, hash) { const d = this.dataDir(); return d ? path.join(d, 'rigs', rigDirName(key), `${n}-${hash}.json`) : null; }
  // 맞는 정의의 새 해시 → { ok, n } | { ok: false, reason, hits, fallback }
  adopt(key, { buf, hash, raw, def, mtimeMs, prev }) {
    const st = this.store();
    if (!st.lastRigVersion) return { ok: true, n: null };
    const last = st.lastRigVersion(key);
    if (last && last.hash === hash) return { ok: true, n: last.n };
    const base = prev && prev.raw ? prev : this.lastGood(key);
    const prot = st.rigProtected ? st.rigProtected(key) : null;
    const hits = base && prot ? protectedHits(raw, base.raw, prot.pointers) : [];
    if (hits.length) return { ok: false, hits, fallback: base, reason: `사람만 고치는 자리를 바꿔 이 정의를 쓰지 않는다(버전 ${base.n ?? '?'}을 그대로 쓴다): ${hits.join(', ')}. 바꾸려면 사람이 보드의 rig 메뉴에서 그 자리를 목록에서 뺀다.` };
    const pend = this.pendingBy.get(key);
    const by = pend && pend.hash === hash ? pend.by : this.byOf(key, mtimeMs, (base && base.def) || def);
    const note = pend && pend.hash === hash ? pend.note || null : !last ? 'first' : null;
    if (pend && pend.hash === hash) this.pendingBy.delete(key);
    const n = st.insertRigVersion({ workspaceKey: key, hash, by, note });
    const f = this.versionPath(key, n, hash);
    if (f) {
      try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); st.setRigVersionFile(key, n, path.relative(this.dataDir(), f).split(path.sep).join('/')); }
      catch (e) { this.b.log && this.b.log(`rig version file ${key} ${n}: ${e.message}`); }
    }
    this.versionDefs.set(`${key}|${n}`, { def, hash, raw, n });
    try { st.addEvent(null, 'rig_version', { workspace: key, n, hash, by, note }); } catch {}
    rigEvent(this.b, { kind: 'rig_version', ws: key, defN: n, actor: by === 'manager' ? 'agent' : by === 'human' ? 'human' : 'board', ref: n, text: `버전 ${n} ${hash.slice(0, 12)} · ${by}${note ? ` · ${note}` : ''}`, data: { changed_by: by, hash, note } });
    this.b.log && this.b.log(`rig version ${key} #${n} ${hash.slice(0, 12)} by ${by}`);
    return { ok: true, n };
  }
  // 누가 바꿨나: 파일 수정 시각에 관리자 자리 세션이 일하는 턴 중이었으면 manager, 아니면 unknown(사람의 되돌리기는 pendingBy로 human)
  //   P190: 사람이 맡긴 제작 일(rig.describe: 만들기와 말로 고치기)이 열려 있던 때의 고침은 human
  byOf(key, mtimeMs, def) {
    if (this.b.rigSetup && this.b.rigSetup.humanAt(key, mtimeMs)) return 'human';
    const seat = def && def.manager;
    if (!seat || !this.b.sessions) return 'unknown';
    const st = this.store();
    for (const s of this.b.sessions.values()) {
      if (s.workspaceKey !== key || s.rigSeat !== seat) continue;
      const at = st.stateAt ? st.stateAt(s.sessionId, Math.ceil(mtimeMs)) : null;
      if (at === 'working') return 'manager';
      const now = this.b.summary ? this.b.summary(s) : null;
      if (!at && now && now.state === 'working') return 'manager';
    }
    return 'unknown';
  }
  // P190: 사람이 고른 동작(rig.create·rig.save, 제작 세션의 done)이 쓴 rig.json을 켜짐과 상관없이 지금 버전으로 남긴다(누가 by).
  //   꺼진 rig는 read()가 버전을 남기지 않으므로(P188) 여기서 남긴다. 같은 해시면 그 버전. → { ok, n } | { ok: false, reason, hits? }
  recordNow(key, { by = 'human', note = null } = {}) {
    const root = this.rootOf(key); const file = root ? path.join(root, RIG_FILE) : null;
    if (!file) return { ok: false, reason: '워크스페이스가 없다' };
    let buf; try { buf = fs.readFileSync(file); } catch { return { ok: false, reason: `${RIG_FILE}이 없다` }; }
    const hash = sha(buf);
    let raw; try { raw = JSON.parse(buf.toString('utf8').replace(/^﻿/, '')); } catch (e) { return { ok: false, reason: `JSON이 아니다: ${e.message}` }; }
    const v = validateRig(raw, { root, cycleMinMs: this.cycleMin() });
    if (!v.ok) return { ok: false, reason: v.reason };
    const c = this.cache.get(key);
    let mtimeMs = Date.now(); try { mtimeMs = fs.statSync(file).mtimeMs; } catch {}
    this.pendingBy.set(key, { hash, by, note });
    const a = this.adopt(key, { buf, hash, raw, def: v.def, mtimeMs, prev: c && c.good });
    if (this.pendingBy.get(key) && this.pendingBy.get(key).hash === hash && a.ok) this.pendingBy.delete(key);
    this.cache.delete(key); // 다음 읽기가 다시 본다(켜진 rig는 같은 해시라 같은 버전)
    return a;
  }
  // 마지막으로 남긴 버전(프로세스가 다시 뜬 뒤 기준) → { def, hash, raw, n } | null
  lastGood(key) {
    const st = this.store();
    const last = st.lastRigVersion ? st.lastRigVersion(key) : null;
    return last ? this.loadVersion(key, last) : null;
  }
  loadVersion(key, row) {
    const k = `${key}|${row.n}`;
    if (this.versionDefs.has(k)) return this.versionDefs.get(k);
    const d = this.dataDir();
    if (!d || !row.file) return null;
    try {
      const buf = fs.readFileSync(path.join(d, row.file));
      const raw = JSON.parse(buf.toString('utf8').replace(/^\uFEFF/, ''));
      const v = validateRig(raw, { root: this.rootOf(key), cycleMinMs: this.cycleMin() });
      if (!v.ok) return null;
      const x = { def: v.def, hash: row.hash, raw, n: row.n };
      this.versionDefs.set(k, x);
      return x;
    } catch { return null; }
  }
  // 건이 쥔 버전의 정의(지금 쓰는 버전이면 지금 정의) → def | null
  versionDef(key, n) {
    if (n == null) return null;
    const r = this.read(key);
    const c = this.cache.get(key);
    if (c && c.good && c.good.n === n) return c.good.def;
    const row = this.store().rigVersion ? this.store().rigVersion(key, n) : null;
    const x = row ? this.loadVersion(key, row) : null;
    return x ? x.def : r.def;
  }
  currentN(key) { const r = this.read(key); return r.n ?? null; }
  // P217: 장부 줄의 지금 버전(정의를 새로 읽지 않는다: 읽기가 rig_version을 다시 부르지 않게)
  cachedN(key) { const c = this.cache.get(key); if (c && c.good && c.good.n != null) return c.good.n; const v = this.store().lastRigVersion ? this.store().lastRigVersion(key) : null; return v ? v.n : null; }
  versionContent(key, n) {
    const row = this.store().rigVersion(key, n);
    if (!row) return null;
    const d = this.dataDir();
    try { return { row, buf: fs.readFileSync(path.join(d, row.file)) }; } catch { return { row, buf: null }; }
  }

  // P195: 워크스페이스 키가 바뀌었다(폴더가 저장소가 됨, workspace-merge-ops.mjs). 표는 store.rekeyWorkspace가 옮겼고
  //   여기서는 데이터 폴더 rigs/<옛 폴더>/의 버전 파일을 새 폴더로 옮기고 경로를 고치며, 옛 키의 기억을 버린다. → 옮긴 파일 수
  rekey(from, to) {
    let moved = 0;
    const d = this.dataDir();
    const a = rigDirName(from), z = rigDirName(to);
    if (d && a !== z) {
      const src = path.join(d, 'rigs', a), dst = path.join(d, 'rigs', z);
      try {
        if (fs.existsSync(src)) {
          fs.mkdirSync(dst, { recursive: true });
          for (const f of fs.readdirSync(src)) {
            const t = path.join(dst, f);
            if (fs.existsSync(t)) continue; // 대상에 같은 이름이 있으면(번호를 민 버전도 옛 파일 이름 그대로라 겹치지 않는다) 그대로 둔다
            fs.renameSync(path.join(src, f), t); moved++;
          }
          try { fs.rmdirSync(src); } catch {}
        }
      } catch (e) { this.b.log && this.b.log(`rig rekey files ${from} → ${to}: ${e.message}`); }
      if (this.store().retargetRigVersionFiles) this.store().retargetRigVersionFiles(to, `rigs/${a}/`, `rigs/${z}/`);
    }
    for (const m of [this.cache, this.pendingBy, this.alertMarks]) { m.delete(from); m.delete(to); }
    for (const k of [...this.versionDefs.keys()]) if (k.startsWith(`${from}|`) || k.startsWith(`${to}|`)) this.versionDefs.delete(k);
    return moved;
  }

  // P195: 정의에 적힌 자리 이름(잘못된 정의도 JSON이면 seats의 열쇠). rig가 꺼졌거나 잘못일 때 자리 이름으로 보낸 것을 알아보는 데 쓴다
  seatNamesLoose(key) {
    const r = this.read(key);
    if (!r.present) return [];
    if (r.def && r.def.seats) return Object.keys(r.def.seats);
    try { const raw = JSON.parse(fs.readFileSync(r.file, 'utf8').replace(/^﻿/, '')); return raw && raw.seats && typeof raw.seats === 'object' && !Array.isArray(raw.seats) ? Object.keys(raw.seats) : []; } catch { return []; }
  }

  // ---------- P188: 사람만 고치는 목록 ----------
  // P189가 쓰는 읽기: { pointers, files: [{ path, sha256, at }] } | null
  rigProtected(key) { return this.store().rigProtected ? this.store().rigProtected(key) : null; }
  // 보호 파일 가운데 해시가 다른 것 → [{ path, want, got }]
  changedFiles(key) {
    const p = this.rigProtected(key); const root = this.rootOf(key);
    if (!p || !p.files.length || !root) return [];
    return p.files.map((f) => ({ path: f.path, want: f.sha256, got: fileSha(path.resolve(root, f.path)) })).filter((x) => x.got !== x.want);
  }
  // 알림: 판 이벤트 rig_protected, 관리자 자리 세션에 판 알림, 사람에게 응답 필요(복귀 요약의 needs_you 줄, rig 메뉴)
  alert(key, { kind, items, hash = null, reason, usingN = null }) {
    const mark = `${kind}:${JSON.stringify(items)}:${hash || ''}`;
    if (this.alertMarks.get(key) === mark) return false;
    this.alertMarks.set(key, mark);
    const st = this.store();
    const r = this.cache.get(key);
    const def = (r && r.good && r.good.def) || null;
    const seat = def && def.manager;
    const to = seat && this.b.sessions ? [...this.b.sessions.values()].filter((s) => s.workspaceKey === key && s.rigSeat === seat) : [];
    try { st.addEvent(to[0] ? to[0].sessionId : null, 'rig_protected', { workspace: key, kind, items, hash, reason, usingN, manager: to.map((s) => s.name) }); } catch {}
    rigEvent(this.b, { kind: 'rig_protected', ws: key, defN: usingN, actor: 'board', value: kind, text: reason, data: { items, hash } });
    this.b.log && this.b.log(`rig_protected ${key} ${kind}: ${items.join ? items.join(', ') : items}`);
    const text = kind === 'pointer'
      ? `[Atrium 보드] rig: 정의(.atrium/rig.json)가 사람만 고치는 자리(${items.join(', ')})를 바꿔 보드가 그 정의를 쓰지 않는다(버전 ${usingN ?? '?'}을 그대로 쓴다). 그 자리는 되돌리고, 바꿔야 하면 사람에게 묻는다. 버전: atrium rig log`
      : `[Atrium 보드] rig: 사람만 고치는 파일(${items.join(', ')})의 내용이 사람이 승인한 때와 달라 rig 도구가 돌지 않는다. 그 파일을 되돌리거나 사람에게 다시 승인해 달라고 한다(보드의 rig 메뉴).`;
    for (const s of to) try { this.b.queue.enqueue(s.sessionId, text); } catch {}
    if (this.b.api && this.b.api.broadcast) try { this.b.api.broadcast('rig.alert', { workspace: key, kind, items }); } catch {}
    return true;
  }
  alerts(key, limit = 10) {
    const st = this.store();
    if (!st.db) return [];
    return st.db.prepare("SELECT t, data FROM events WHERE kind = 'rig_protected' ORDER BY id DESC LIMIT 200").all().map((e) => ({ t: e.t, ...(JSON.parse(e.data || '{}')) })).filter((x) => x.workspace === key).slice(0, limit);
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
    const wtGit = def && def.seats && Object.values(def.seats).some((x) => x.worktree) ? gitStateOf(w.root) : null;
    return {
      workspace: key, root: w.root, file: RIG_FILE, enabled: !!st.enabled, enabledAt: st.enabledAt ?? null,
      present: r.present, valid: r.present && !r.invalid, invalid: r.invalid, hash: r.hash, usingLastGood: !!(r.invalid && def),
      state: !r.present ? 'none' : !def ? 'invalid' : st.enabled ? 'on' : 'off', // invalid가 있고 def도 있으면 마지막 맞은 정의를 쓰는 중
      hooks: def ? def.hooks.map((h) => ({ at: h.at, from: h.at === 'deliver' ? h.from : undefined, tool: h.tool || undefined, run: h.run, onFail: h.onFail })) : [],
      tools: def && def.tools ? Object.values(def.tools).map((x) => ({ name: x.name, run: x.run, desc: x.desc, timeoutMs: x.timeoutMs, parallel: x.parallel })) : [], // P183: 켜기 확인 창이 보인다
      cycleRuns: def && def.cycles ? def.cycles.filter((x) => x.run).map((x) => ({ every: x.every, run: x.run })) : [], // P188: 느린 고리의 run도 사용자 계정으로 돈다
      guide: !!(def && def.guide), name: def ? def.name : null,
      format: def ? def.version || 1 : null, docs: def && def.docs && this.b.rigDocs ? this.b.rigDocs.stateOf(key, def) : [], // P219: 문서(마지막 바뀜, stale)
      // P185: 자리·흐름(켜기 확인 창과 노드 메뉴의 "자리 정하기"가 쓴다)
      seats: def && def.seats ? Object.values(def.seats).map((x) => ({ name: x.name, launcher: x.launcher, session: x.session, worktree: x.worktree, tools: x.tools, may: x.may, maxLive: x.maxLive, guide: x.guide, effort: x.effort || null, model: x.model || null, ...((def.seatDocs || {})[x.name] || {}), ...this.permissionOf(key, def, x.name) })) : [], // P209: effort·model. P219: loads·reads·writes(문서). P223: permission
      flow: def ? def.flow || [] : [], results: def ? def.results || [] : [], manager: def ? def.manager || null : null,
      warnings: def ? [...(def.warnings || []), ...worktreeWarnings(def.seats, wtGit || 'ok'), ...this.permitWarnings(key, def)] : [], worktreeGit: wtGit && wtGit !== 'ok' ? wtGit : null, // P195: 워크트리 자리의 저장소 조건(norepo | nocommit | null)
      // P188: 지금 버전, 느린 고리, 사람만 고치는 목록과 어긋난 것
      version: r.n ?? null, cycles: def && def.cycles ? def.cycles.map((x) => ({ every: x.every, to: x.to, run: x.run })) : [],
      loops: def && this.b.branch && this.b.branch.flow && this.b.branch.flow.loops ? this.b.branch.flow.loops.view(key, def) : [], // P221: 고리와 상태
      protected: this.rigProtected(key) || { pointers: [], files: [] }, protectedHits: r.protectedHits || [], changedFiles: this.changedFiles(key).map((x) => x.path),
    };
  }
  // P223: 자리의 권한(rig.status seats[])
  permissionOf(key, def, seat) {
    const sa = def && def.amp && def.amp.seats ? def.amp.seats[seat] : null;
    const asked = (sa && sa.permission) || 'ask';
    const approved = asked === 'unattended' ? this.permitted(key, seat) : null;
    return { permission: asked, allow: (sa && sa.allow) || [], ...(asked === 'unattended' ? { approved, runsAs: approved ? 'unattended' : 'scoped' } : {}) };
  }
  // P223: 승인 전 unattended 자리의 경고(rig status, atrium rig check)
  permitWarnings(key, def) { return this.unattendedSeats(def).filter((n) => !this.permitted(key, n)).map((n) => `seats.${n}.permission "unattended"는 사람이 아직 승인하지 않아 scoped로 돈다. 승인: 이 PC의 보드 창(rig 켜기 확인)`); }
  setEnabled(key, on, by = 'human') {
    const w = this.store().getWorkspace(key);
    if (!w) throw apiError('not_found', `워크스페이스를 찾을 수 없다: ${key}`);
    this.store().setRigEnabled(key, !!on);
    const r = this.read(key);
    if (on && by === 'human') this.permit(key, null, 'enable'); // P223: 켜기 확인 창이 보인 unattended 자리를 사람이 승인했다
    this.store().addEvent(null, on ? 'rig_enabled' : 'rig_disabled', { workspace: key, by, hash: r.hash, present: r.present });
    rigEvent(this.b, { kind: on ? 'rig_enabled' : 'rig_disabled', ws: key, defN: r.n ?? null, actor: by === 'remote' || by === 'human' ? 'human' : 'board', text: `rig ${on ? '켜짐' : '꺼짐'}(${by})`, data: { by, hash: r.hash } });
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
      const gate = (rowId, decision, why) => this.gateEvent(ctx, h, rowId, decision, why); // P217: 장부 줄(관문)
      if (!res.ok) {
        const blocked = h.onFail === 'block';
        const rowId = st.insertHookRun({ ...rec, decision: blocked ? 'blocked' : 'failed', error: res.error, reason: blocked ? `훅 실패(onFail block): ${res.error}` : null });
        try { st.addEvent(rec.sessionId, 'hook_failed', { workspace: ctx.key, at: ctx.at, hook: h.index, argv: h.run, error: res.error, onFail: h.onFail, rigHash: r.hash }); } catch {}
        runs.push({ at: ctx.at, hook: h.index, decision: blocked ? 'blocked' : 'failed', error: res.error, rowId });
        gate(rowId, blocked ? 'blocked' : 'failed', res.error);
        if (blocked) return out({ action: 'reject', reason: `rig 훅 ${h.index}(${h.run.join(' ')})이 실패했다: ${res.error}` });
        continue;
      }
      const o = res.out;
      if (this.b.rigDocs && r.def.hookDocs && r.def.hookDocs[h.index]) this.b.rigDocs.noteRecords(ctx.key, r.def, { hook: h.index, sessionId: ctx.session ? ctx.session.id : null }); // P219: records 훅이 쓴 장부
      const before = text; const beforeArgs = args;
      if (o.action === 'reject') {
        const rowId = st.insertHookRun({ ...rec, decision: 'reject', reason: o.reason || null, note: o.note || null });
        runs.push({ at: ctx.at, hook: h.index, decision: 'reject', reason: o.reason || null, rowId });
        gate(rowId, 'reject', o.reason || null);
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
      const rowId = st.insertHookRun({ ...rec, decision: o.action, reason: o.reason || null, note: o.note || null, beforeText: changed ? before : argsChanged ? JSON.stringify(beforeArgs) : null });
      runs.push({ at: ctx.at, hook: h.index, decision: o.action, rowId, ...(changed || argsChanged ? { changed: true } : {}), ...(o.reason ? { reason: o.reason } : {}) });
      gate(rowId, o.action, o.reason || o.note || null);
    }
    return out({ action: 'pass', reason: null });
  }

  // P217: 훅 판정 한 줄을 장부에(gate). ctx.ledger: 부르는 쪽이 아는 건·넘김 자리(흐름의 넘김 글은 받을 세션이 아직 없다)
  gateEvent(ctx, h, rowId, decision, why = null) {
    const L = ctx.ledger || {};
    let caseId = L.caseId || null;
    if (!caseId && ctx.unit && ctx.unit.id && this.store().getUnit) { const u = this.store().getUnit(ctx.unit.id); caseId = u ? u.caseId || null : null; }
    const seat = ctx.session ? ctx.session.seat || null : null;
    rigEvent(this.b, {
      kind: 'gate', ws: ctx.key, caseId, unitId: ctx.unit ? ctx.unit.id : null, tryId: ctx.try ? ctx.try.id : null,
      seat: L.seat !== undefined ? L.seat : seat, session: ctx.session ? ctx.session.id : null, fromSeat: L.fromSeat ?? null, toSeat: L.toSeat ?? null, line: L.line ?? null,
      value: decision, actor: 'hook', ref: rowId, text: `${ctx.at} 훅 ${h.index}(${h.run.slice(-1)[0]})${why ? `: ${why}` : ''}`,
      data: { at: ctx.at, hook: h.index, ...(ctx.from && ctx.from.kind ? { from: ctx.from.kind } : {}), ...(ctx.tool ? { tool: ctx.tool, toolRun: ctx.toolRunId || null } : {}), ...(ctx.result != null ? { result: ctx.result } : {}) },
    });
  }
  // deliver 훅: 받는 세션의 워크스페이스 rig. target: 받는 세션(띄우기 전 child면 { workspaceKey, name, kind, model, cwd }), from: { kind: human|agent, session? }
  //   → { action: pass | reject, text, reason } (rig가 없거나 꺼졌으면 그대로 pass, 기록 없음)
  async deliver({ target, workspaceKey = null, from, text, ledger = null }) { // P217: ledger(장부 줄의 건·넘김 자리)
    const key = workspaceKey || (target && target.workspaceKey) || null;
    const r = this.active(key);
    if (!r || !r.def.hooks.some((h) => h.at === 'deliver')) return { action: 'pass', text, reason: null, runs: [] };
    const tr = target && target.sessionId ? this.store().openTryOf(target.sessionId) : null;
    const unit = tr ? this.store().getUnit(tr.unitId) : null;
    return this.runAt(r, {
      key, at: 'deliver', session: sessionInfo(target), from: { kind: from.kind, ...(from.seat ? { seat: from.seat } : {}), ...(from.session ? { session: sessionInfo(from.session) } : {}) }, // P185: flow면 보낸 자리(seat)
      unit: unit ? { id: unit.id, from: unit.from, spec: unit.spec, origin: unit.origin } : null, try: tr ? { id: tr.id, startedAt: tr.startedAt } : null,
      text, match: (h) => h.from === 'any' || h.from === from.kind, ledger,
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
// P188: 일 머리를 세 줄 이하로 둘 때 셋째 줄 끝에 붙이는 rig 안내(짧게)
export const RIG_HEADER_TAIL = '이 워크스페이스에는 rig(작업 규칙)가 있다: `atrium guide`.';

// 판 API 처리기(backend.mjs handlers에 펼친다). 켜기는 판 API 토큰으로 붙은 연결(이 PC의 창·사람의 atrium 명령, auth.kind local)만.
// 기기 토큰(휴대폰·원격)은 상태를 보고 끄기만 한다(P195). 에이전트의 세션 토큰은 이 API에 붙지 못하고, /branch/*에는 rig를 켜는 명령이 없다
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
    // P223: unattended 자리 승인(이 PC의 창만). p.seats(없으면 정의의 unattended 자리 모두)
    'rig.permit': async (p, c) => {
      local(c);
      const key = await keyOf(p || {});
      const approved = b.rig.permit(key, p && Array.isArray(p.seats) ? p.seats.map(String) : p && p.seat ? [String(p.seat)] : null, 'human');
      if (b.broadcastWorkspaces) b.broadcastWorkspaces();
      return { ...b.rig.status(key), approved };
    },
    // P195: 끄기는 원격 기기(기기 토큰)도 한다. 끄면 저장소의 프로그램이 멈출 뿐이다. 켜기·고치기는 이 PC의 창에서만
    'rig.disable': async (p, c) => {
      if (!c || !c.auth || !['local', 'device'].includes(c.auth.kind)) throw apiError('forbidden', 'rig 끄기는 보드 창이나 연결한 기기에서 한다.');
      const r = b.rig.setEnabled(await keyOf(p), false, c.auth.kind === 'device' ? 'remote' : 'human');
      if (b.broadcastWorkspaces) b.broadcastWorkspaces();
      return r;
    },
  };
}
