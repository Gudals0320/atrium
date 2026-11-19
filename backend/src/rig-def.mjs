// P241: rig 1단계(docs research rig3-skeleton.md 8·9절, rig3-roles.md 3.1·11·12절). 정의(version 3)를 읽고 검사하고, 역할 세션에 실을 글과 쓰기 범위를 만든다.
// - 이 파일은 순수 함수만 둔다(판 상태를 모른다). 역할 세션을 띄우고 지키는 일은 rig-roles.mjs가 한다.
// - rig.mjs validateRig는 raw.version이 3이면 validateRigDef을 부르고 그 결과를 그대로 쓴다. 옛 꼴(version 2 이하)은 rig.mjs가 한 줄 오류로 거절한다(P249).
//   정의의 칸은 def.rig3에 있다: { purpose, beat, roles, flows, tools, tune }(이름 rig3은 판 안의 칸 이름이다).
// - 정의 칸(뼈대 8절): purpose(목적 문서 경로), beat({ every, at?, role? }), roles({ <역할>: { owns: [폴더], tools?: [도구], launcher?, model?, beat? } }),
//   P242: 역할 칸 effort(노력 수준, 모델처럼 띄울 때 하네스에 넘긴다).
//   flows([{ item, from: 역할|human|[…], to: 역할|[…], for? }]), tools({ <이름>: { run: [...], every?, desc? } }), tune({ after, every, lines }).
//   옛 rig 칸(seats, loops, hooks, manager, results, permission, docs, guide, stopVerify, cycles)은 오류다.
// - 2·3단계가 쓸 칸(flows의 for, 도구의 every, 박자)은 읽어 고른 꼴로 두기만 한다. 동작은 다음 단계다.
// - 역할 정의서 .atrium/roles/<역할>.md의 네 칸: 맡은 것, 받는 것과 내는 것, 기준(고정 칸), 요령(조정 칸). 칸이 빠지면 오류.
// - 역할의 기억: .atrium/roles/<역할>/memory.md(역할이 직접 쓴다. 판은 내용을 보지 않고 띄울 때 싣기만 한다).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const RIG_VERSION = 3;
export const RIG_DIR = '.atrium';
export const ROLES_DIR = '.atrium/roles';
import { HUMAN, BUILDER_ROLE } from './rig-def-names.mjs'; // P251: 창도 들여오는 이름 값
export { HUMAN, BUILDER_ROLE }; // HUMAN: 입력 창구(길의 from에만)
export const ROLE_NAME_RE = /^[a-z][a-z0-9_]{0,23}$/; // 세션 이름(<역할>, <역할>-<n>)이 되므로 -는 받지 않는다
export const ITEM_NAME_RE = /^[a-z][a-z0-9_-]{0,39}$/;
export const TOOL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/;
export const ROLE_KINDS = ['claude', 'codex']; // 무인 인자를 아는 종류. 그 밖은 판의 런처 이름
export const ROLE_DOC_SECTIONS = ['맡은 것', '받는 것과 내는 것', '기준', '요령'];
export const ROLE_DOC_FIXED = ['맡은 것', '받는 것과 내는 것', '기준']; // 고정 칸(역할이 고치지 못한다)
export const TUNE_DEFAULT = { after: 3, every: 5, lines: 20 }; // 뼈대 10절의 처음 값
export const LOAD_MAX = { purpose: 6000, role: 12000, memory: 8000 };
// P247: 빌더 세션(워크스페이스마다 하나, 길 밖). 세션의 rigRole 값이다(역할 이름 꼴이 아니라 정의의 역할과 겹치지 않는다)
// P247(P246 답, 설계 쪽): 긴 일의 차례. 모든 역할 세션의 첫 글과 atrium guide에 싣는다
//   도구가 없는 역할에는 명령 이름을 싣지 않는다(정의에 도구를 더하는 것은 빌더의 일이다)
export const longJobLine = (hasTools = true) => '[Atrium 보드] 오래 걸리는 일은 턴을 붙들지 않는다. 먼저 판이 돌리는 도구' + (hasTools ? '(`atrium rig tool`)' : '(네 도구가 정의에 있을 때)') + '로, 아니면 하네스의 뒤 실행(백그라운드 실행)으로 한다. 분리 실행(Start-Process, start, nohup, setsid)으로는 하지 않는다: 판이 그 프로세스를 보지 못해 그것이 쓴 것을 되돌린다.';
export const LONG_JOB_LINE = longJobLine(true); // 실을 글의 칸마다 상한(넘으면 자르고 경로를 알린다)
const V3_KEYS = ['version', 'name', 'purpose', 'beat', 'roles', 'flows', 'tools', 'tune', 'ignore']; // P243: ignore(판이 남의 쓰기를 보지 않는 폴더)
const V2_KEYS = ['seats', 'loops', 'hooks', 'manager', 'results', 'permission', 'docs', 'guide', 'stopVerify', 'cycles', 'flow'];

const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
const isAbs = (p) => path.isAbsolute(p) || /^[A-Za-z]:/.test(p) || p.startsWith('/') || p.startsWith('\\');
// 섹터 경로를 고른 꼴로: 앞뒤 공백, \ → /, ./ 떼기, 끝에 / 하나. 절대 경로·..·빈 값은 null
export function normSector(p) {
  if (typeof p !== 'string') return null;
  let s = p.trim().replace(/\\/g, '/');
  if (!s || isAbs(s)) return null;
  s = s.replace(/^(\.\/)+/, '').replace(/\/+/g, '/');
  if (!s || s === '.' || s === './' || s.split('/').includes('..')) return null;
  return s.endsWith('/') ? s : s + '/';
}
// 섹터 a와 b가 겹치는가(같거나 하나가 다른 하나 안). 대소문자는 무시한다(Windows)
export function sectorsOverlap(a, b) { const x = a.toLowerCase(), y = b.toLowerCase(); return x.startsWith(y) || y.startsWith(x); }
// "1d", "12h", "30m", "45s" → ms | null
export function parseDuration(v) {
  const m = /^(\d+(?:\.\d+)?)\s*([smhd])$/.exec(String(v == null ? '' : v).trim());
  if (!m) return null;
  const n = Number(m[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]];
  return n > 0 ? n : null;
}
const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// 역할 정의서의 칸 검사. text: 파일 내용 → { ok, missing: [칸 이름], sections: { 칸: 내용 } }
//   칸은 '## <칸 이름>' 머리(뒤에 덧붙인 글은 무시: '## 요령 (조정 칸)'도 요령). 다른 ## 머리는 그대로 둔다
export function checkRoleDoc(text) {
  const sections = {};
  let cur = null;
  for (const line of String(text || '').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) { const name = ROLE_DOC_SECTIONS.find((s) => m[1] === s || m[1].startsWith(s + ' ') || m[1].startsWith(s + '(')); cur = name || null; if (name && sections[name] == null) sections[name] = ''; continue; }
    if (cur) sections[cur] += line + '\n';
  }
  for (const k of Object.keys(sections)) sections[k] = sections[k].trim();
  const missing = ROLE_DOC_SECTIONS.filter((s) => sections[s] == null);
  return { ok: !missing.length, missing, sections };
}
export const roleDocPath = (role) => `${ROLES_DIR}/${role}.md`;
export const memoryDir = (role) => `${ROLES_DIR}/${role}/`;
export const memoryPath = (role) => `${ROLES_DIR}/${role}/memory.md`;

// 정의 검사 → { ok: true, def } | { ok: false, reason }
//   root가 있으면 목적 문서·정의서·도구 스크립트가 있는지, 정의서의 네 칸이 있는지도 본다(없으면 오류)
export function validateRigDef(raw, { root = null, exists = isFile, read = (f) => fs.readFileSync(f, 'utf8') } = {}) {
  const bad = (reason) => ({ ok: false, reason });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('정의는 JSON 객체여야 한다');
  if (raw.version !== RIG_VERSION) return bad(`version은 3이다: ${JSON.stringify(raw.version)}`);
  const old = V2_KEYS.filter((k) => raw[k] != null);
  if (old.length) return bad(`정의에 옛 rig 칸이 있다: ${old.join(', ')}. rig 정의는 purpose, beat, roles, flows, tools, tune만 쓴다`);
  const unknown = Object.keys(raw).filter((k) => !V3_KEYS.includes(k));
  if (unknown.length) return bad(`rig 정의에 모르는 칸이 있다: ${unknown.join(', ')}. 칸: ${V3_KEYS.join(', ')}`);
  const warnings = [];
  // 목적
  if (typeof raw.purpose !== 'string' || !raw.purpose.trim()) return bad('purpose는 목적 문서 경로 글이다(예: ".atrium/purpose.md")');
  const purpose = raw.purpose.trim().replace(/\\/g, '/');
  if (isAbs(purpose) || purpose.split('/').includes('..')) return bad(`purpose는 워크스페이스 안 상대 경로다: ${raw.purpose}`);
  if (root && !exists(path.resolve(root, purpose))) return bad(`purpose의 목적 문서가 없다: ${purpose}`);
  // 도구(이름 확인용으로 먼저)
  const tools = {};
  if (raw.tools != null) {
    if (typeof raw.tools !== 'object' || Array.isArray(raw.tools)) return bad('tools는 객체다({ "<이름>": { "run": [...] } })');
    for (const [name, x] of Object.entries(raw.tools)) {
      const at = `tools.${name}`;
      if (!TOOL_NAME_RE.test(name)) return bad(`${at}: 도구 이름은 글자·숫자로 시작하고 글자·숫자·_·.·-로 40자까지다`);
      if (!x || typeof x !== 'object' || Array.isArray(x)) return bad(`${at}는 객체다({ "run": [...] })`);
      if (!Array.isArray(x.run) || !x.run.length || x.run.some((w) => typeof w !== 'string' || !w)) return bad(`${at}.run은 빈 칸 없는 글 배열이다(예: ["node", "tools/x.mjs"])`);
      if (x.every != null && parseDuration(x.every) == null) return bad(`${at}.every는 "30m", "1h", "1d" 꼴이다: ${JSON.stringify(x.every)}`);
      if (x.desc != null && typeof x.desc !== 'string') return bad(`${at}.desc는 글이다`);
      if (root && x.run[1] && /[\\/]/.test(x.run[1]) && path.extname(x.run[1]) && !x.run[1].startsWith('-') && !exists(path.resolve(root, x.run[1]))) return bad(`${at}.run의 스크립트가 없다: ${x.run[1]}`);
      tools[name] = { name, run: x.run.slice(), every: x.every != null ? String(x.every) : null, everyMs: x.every != null ? parseDuration(x.every) : null, desc: x.desc || '' };
    }
  }
  // 역할
  if (!raw.roles || typeof raw.roles !== 'object' || Array.isArray(raw.roles) || !Object.keys(raw.roles).length) return bad('roles는 역할이 하나 이상인 객체다({ "<역할>": { "owns": ["폴더/"] } })');
  const roles = {};
  const toolOwner = {};
  const sectors = []; // [{ role, path }]
  for (const [name, x] of Object.entries(raw.roles)) {
    const at = `roles.${name}`;
    if (name === HUMAN) return bad(`${at}: human은 입력 창구 이름이라 역할 이름으로 쓰지 않는다`);
    if (!ROLE_NAME_RE.test(name)) return bad(`${at}: 역할 이름은 영문 소문자로 시작하고 소문자·숫자·_로 24자까지다`);
    if (!x || typeof x !== 'object' || Array.isArray(x)) return bad(`${at}는 객체다({ "owns": ["폴더/"] })`);
    const extra = Object.keys(x).filter((k) => !['owns', 'tools', 'launcher', 'model', 'effort', 'beat'].includes(k));
    if (extra.length) return bad(`${at}에 모르는 칸이 있다: ${extra.join(', ')}. 칸: owns, tools, launcher, model, effort, beat`);
    const owns = list(x.owns);
    if (!owns.length) return bad(`${at}.owns는 역할이 쥔 폴더 하나 이상이다(예: ["data/"])`);
    const norm = [];
    for (const p of owns) {
      const n = normSector(p);
      if (!n) return bad(`${at}.owns의 경로는 워크스페이스 안 상대 폴더다(절대 경로·..·빈 값 안 됨): ${JSON.stringify(p)}`);
      if (sectorsOverlap(n, RIG_DIR + '/')) return bad(`${at}.owns에 ${RIG_DIR}/를 넣지 않는다(정의와 정의서는 역할의 섹터가 아니다. 기억은 ${memoryDir(name)}에 따로 쓴다): ${p}`);
      if (!norm.includes(n)) norm.push(n);
    }
    for (const n of norm) {
      const hit = sectors.find((s) => sectorsOverlap(s.path, n));
      if (hit) return bad(hit.role === name ? `${at}.owns의 섹터가 서로 겹친다: ${hit.path}, ${n}` : `섹터가 겹친다: ${hit.role}의 ${hit.path}와 ${name}의 ${n}. 섹터는 한 역할만 쥔다`);
      sectors.push({ role: name, path: n });
    }
    const rt = list(x.tools);
    for (const t of rt) {
      if (typeof t !== 'string' || !tools[t]) return bad(`${at}.tools에 없는 도구가 있다: ${JSON.stringify(t)}. 도구: ${Object.keys(tools).join(', ') || '(없음)'}`);
      if (toolOwner[t] && toolOwner[t] !== name) return bad(`도구 ${t}를 ${toolOwner[t]}와 ${name} 둘이 가졌다. 도구는 한 역할만 가진다`);
      toolOwner[t] = name;
    }
    let launcher = null;
    if (x.launcher != null) { if (typeof x.launcher !== 'string' || !x.launcher.trim()) return bad(`${at}.launcher는 claude, codex 또는 판의 런처 이름이다`); launcher = x.launcher.trim(); }
    let model = null;
    if (x.model != null) { if (typeof x.model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:\/\[\]-]{0,79}$/.test(x.model.trim())) return bad(`${at}.model은 모델 이름 글이다: ${JSON.stringify(x.model)}`); model = x.model.trim(); }
    let effort = null; // P242: 노력 수준(모델처럼 하네스에 넘긴다. Claude Code --effort, Codex model_reasoning_effort). 화면에는 없고 빌더가 정한다
    if (x.effort != null) { if (typeof x.effort !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(x.effort.trim())) return bad(`${at}.effort는 노력 수준 낱말이다(예: low, medium, high): ${JSON.stringify(x.effort)}`); effort = x.effort.trim(); }
    let beat = null;
    if (x.beat != null) { const b = readBeat(x.beat, `${at}.beat`); if (b.reason) return bad(b.reason); beat = b.beat; }
    roles[name] = { name, owns: norm, tools: [...new Set(rt)], launcher, model, effort, beat, doc: roleDocPath(name), memory: memoryPath(name) };
  }
  // 정의서(파일과 네 칸)
  if (root) {
    for (const r of Object.values(roles)) {
      const f = path.resolve(root, r.doc);
      if (!exists(f)) return bad(`역할 ${r.name}의 정의서가 없다: ${r.doc}(칸: ${ROLE_DOC_SECTIONS.map((s) => '## ' + s).join(', ')})`);
      let text = ''; try { text = read(f); } catch (e) { return bad(`역할 ${r.name}의 정의서를 읽지 못했다(${r.doc}): ${e.message}`); }
      const c = checkRoleDoc(text);
      if (!c.ok) return bad(`역할 ${r.name}의 정의서(${r.doc})에 칸이 빠졌다: ${c.missing.map((s) => '## ' + s).join(', ')}`);
    }
  }
  // 박자
  let beat = null;
  if (raw.beat != null) {
    const b = readBeat(raw.beat, 'beat'); if (b.reason) return bad(b.reason); beat = b.beat;
    if (beat.role && !roles[beat.role]) return bad(`beat.role이 없는 역할이다: ${beat.role}. 역할: ${Object.keys(roles).join(', ')}`);
  }
  // 길
  const flows = [];
  if (raw.flows != null && !Array.isArray(raw.flows)) return bad('flows는 배열이다([{ "item": "...", "from": "...", "to": "..." }])');
  const rawFlows = raw.flows || [];
  const items = new Set(rawFlows.map((f) => f && f.item).filter((x) => typeof x === 'string'));
  for (let i = 0; i < rawFlows.length; i++) {
    const f = rawFlows[i]; const at = `flows[${i}]`;
    if (!f || typeof f !== 'object' || Array.isArray(f)) return bad(`${at}는 객체다({ "item", "from", "to" })`);
    const extra = Object.keys(f).filter((k) => !['item', 'from', 'to', 'for'].includes(k));
    if (extra.length) return bad(`${at}에 모르는 칸이 있다: ${extra.join(', ')}. 칸: item, from, to, for`);
    if (typeof f.item !== 'string' || !ITEM_NAME_RE.test(f.item)) return bad(`${at}.item은 항목 종류 이름이다(영문 소문자로 시작, 소문자·숫자·_·-): ${JSON.stringify(f.item)}`);
    const from = list(f.from); const to = list(f.to);
    if (!from.length || from.some((x) => typeof x !== 'string')) return bad(`${at}.from은 역할 이름이나 human, 또는 그 배열이다`);
    if (!to.length || to.some((x) => typeof x !== 'string')) return bad(`${at}.to는 역할 이름이나 그 배열이다`);
    const missFrom = from.filter((x) => x !== HUMAN && !roles[x]);
    if (missFrom.length) return bad(`${at}.from에 없는 역할이 있다: ${missFrom.join(', ')}. 역할: ${Object.keys(roles).join(', ')}(입력 창구는 human)`);
    if (to.includes(HUMAN)) return bad(`${at}.to에 human을 쓰지 않는다(human은 입력 창구라 from에만 쓴다)`);
    const missTo = to.filter((x) => !roles[x]);
    if (missTo.length) return bad(`${at}.to에 없는 역할이 있다: ${missTo.join(', ')}. 역할: ${Object.keys(roles).join(', ')}`);
    const self = to.filter((x) => from.includes(x));
    if (self.length) return bad(`${at}: 역할이 낸 것을 자기가 받지 않는다: ${self.join(', ')}`);
    if (f.for != null && (typeof f.for !== 'string' || !items.has(f.for))) return bad(`${at}.for는 이 정의의 다른 길이 나르는 항목 종류다: ${JSON.stringify(f.for)}`);
    flows.push({ index: i, item: f.item, from: [...new Set(from)], to: [...new Set(to)], for: f.for || null });
  }
  const dup = flows.find((f, i) => flows.some((g, j) => j < i && g.item === f.item && g.from.some((x) => f.from.includes(x))));
  if (dup) return bad(`flows[${dup.index}]: 같은 역할이 같은 종류(${dup.item})를 내는 길이 둘이다. 받는 역할이 여럿이면 to를 배열로 쓴다`);
  // 조정 처음 값
  let tune = { ...TUNE_DEFAULT };
  if (raw.tune != null) {
    if (typeof raw.tune !== 'object' || Array.isArray(raw.tune)) return bad('tune은 객체다({ "after": 3, "every": 5, "lines": 20 })');
    for (const k of Object.keys(raw.tune)) {
      if (!['after', 'every', 'lines'].includes(k)) return bad(`tune에 모르는 칸이 있다: ${k}. 칸: after, every, lines`);
      const n = raw.tune[k]; if (!Number.isInteger(n) || n < 1) return bad(`tune.${k}는 1 이상의 정수다: ${JSON.stringify(n)}`);
      tune[k] = n;
    }
  }
  // 역할로 세우는 조건 셋(뼈대 3절)은 경고로만: 섹터(owns는 위에서 필수), 깨우는 것(받는 길·박자·도구), 내는 길
  for (const r of Object.values(roles)) {
    const gets = flows.some((f) => f.to.includes(r.name)); const puts = flows.some((f) => f.from.includes(r.name));
    const woken = gets || (beat && beat.role === r.name) || !!r.beat || r.tools.some((t) => tools[t].every);
    if (!woken) warnings.push(`역할 ${r.name}: 받는 길도 박자도 없다(깨울 것이 없다)`);
    if (!puts) warnings.push(`역할 ${r.name}: 내는 길이 없다(낸 것을 받을 역할이 없다)`);
  }
  for (const t of Object.keys(tools)) if (!toolOwner[t]) warnings.push(`도구 ${t}: 가진 역할이 없다(roles.<역할>.tools)`);
  // P243: ignore(판이 남의 쓰기를 찾지 않는 폴더, rig-guard.mjs의 기본 목록에 더한다). .atrium/은 넣지 않는다
  const ignore = [];
  if (raw.ignore != null) {
    if (!Array.isArray(raw.ignore)) return bad('ignore는 폴더 경로 배열이다(예: ["build/", "cache/"])');
    for (const p of raw.ignore) {
      const n = normSector(p);
      if (!n) return bad(`ignore의 경로는 워크스페이스 안 상대 폴더다(절대 경로·..·빈 값 안 됨): ${JSON.stringify(p)}`);
      if (sectorsOverlap(n, RIG_DIR + '/')) return bad(`ignore에 ${RIG_DIR}/를 넣지 않는다(정의와 정의서는 판이 늘 지킨다): ${p}`);
      if (!ignore.includes(n)) ignore.push(n);
    }
  }
  const rig3 = { purpose, beat, roles, flows, tools, tune, ignore };
  return { ok: true, def: { name: typeof raw.name === 'string' ? raw.name : null, version: RIG_VERSION, v3: true, warnings, rig3 } };
}
function readBeat(v, at) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { reason: `${at}는 객체다({ "every": "1d", "at": "07:00", "role": "<역할>" })` };
  const extra = Object.keys(v).filter((k) => !['every', 'at', 'role'].includes(k));
  if (extra.length) return { reason: `${at}에 모르는 칸이 있다: ${extra.join(', ')}. 칸: every, at, role` };
  const everyMs = parseDuration(v.every);
  if (everyMs == null) return { reason: `${at}.every는 "30m", "1h", "1d" 꼴이다: ${JSON.stringify(v.every)}` };
  if (v.at != null && !(typeof v.at === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.at))) return { reason: `${at}.at은 "HH:MM"(24시간) 꼴이다: ${JSON.stringify(v.at)}` };
  if (v.role != null && typeof v.role !== 'string') return { reason: `${at}.role은 역할 이름이다` };
  return { beat: { every: String(v.every), everyMs, at: v.at || null, role: v.role || null } };
}

// ---------- 역할 세션 ----------
// 역할의 쓰기 범위(워크스페이스 기준 상대 경로): 쥔 섹터 + 자기 기억 폴더
export const roleWrites = (role) => [...role.owns, memoryDir(role.name)];
// 역할 세션이 고치지 못하게 설정 파일 deny에도 넣는 정의 파일(PreToolUse가 먼저 막지만 받침으로 둔다)
export const roleProtected = (r3) => [RIG_DIR + '/rig.json', r3.purpose, ...Object.values(r3.roles).map((r) => r.doc)];
// 역할 세션의 종류·런처 → { kind, launcher }(spawn에 넘길 값). 종류 이름이면 kind, 아니면 판의 런처 이름
export function roleRoute(role) {
  const l = role.launcher || 'claude';
  return ROLE_KINDS.includes(l) ? { kind: l, launcher: null } : { kind: null, launcher: l };
}
// Codex 역할의 인자: 무인(-s workspace-write -a never)에 -C <첫 섹터>, --add-dir <나머지 섹터·기억 폴더>(P241 조사: elevated 샌드박스에서 다른 섹터 쓰기가 막힌다).
//   base: 정리된 인자(rig-writes.mjs codexUnattendedArgs의 결과). 같은 칸(-C, --cd, --add-dir)은 걷어 내고 판의 값을 붙인다
export function codexRoleArgs(base, root, role) {
  const out = [];
  const a = (base || []).map(String);
  for (let i = 0; i < a.length; i++) {
    const w = a[i]; const flag = w.split('=')[0];
    if (flag === '-C' || flag === '--cd' || flag === '--add-dir') { if (!w.includes('=')) i++; continue; }
    out.push(w);
  }
  const abs = (p) => path.resolve(root, p);
  const [first, ...rest] = role.owns;
  out.push('-C', abs(first));
  for (const p of [...rest, memoryDir(role.name)]) out.push('--add-dir', abs(p));
  return out;
}

// 역할 세션에 싣는 첫 글(판 알림). files: { purpose, role, memory }(글 또는 null). 칸마다 LOAD_MAX에서 자른다
export function loadText(r3, roleName, files = {}, { root = null, why = 'spawn', inbox = null } = {}) {
  const r = r3.roles[roleName];
  const gets = r3.flows.filter((f) => f.to.includes(roleName)).map((f) => `${f.item}(${f.from.join('|')}에게서)`);
  const puts = r3.flows.filter((f) => f.from.includes(roleName)).map((f) => `${f.item}(${f.to.join('|')}에게)`);
  const clipTo = (t, n, rel) => (t.length > n ? `${t.slice(0, n)}
…(잘림: 전체는 ${rel})` : t);
  const block = (title, rel, text, n, empty) => [`## ${title} (${rel})`, text != null && String(text).trim() ? clipTo(String(text).replace(/^﻿/, '').trim(), n, rel) : empty].join('\n');
  const head = [
    `[Atrium 보드] 너는 rig 역할 ${roleName}이다${why === 'respawn' ? '(세션이 끝나 판이 새로 띄웠다)' : ''}. 이 세션은 늘 떠 있다. 쉬면 판이 재우고, 일이 오면 판이 깨운다.`,
    `[Atrium 보드] 쓰는 곳: ${r.owns.join(', ')}, 기억 ${memoryDir(roleName)}. 그 밖에 쓰면 판이 묻지 않고 막는다. 모든 섹터는 읽어도 된다. ${RIG_DIR}/의 정의와 정의서는 고치지 않는다.`,
    `[Atrium 보드] 받는 것: ${gets.join(', ') || '없음'}. 내는 것: ${puts.join(', ') || '없음'}. 도구: ${r.tools.join(', ') || '없음'}(판이 돌린다).`,
    ...ITEM_HOWTO, // P242: 항목 명령(짧게)
    ...(r.tools.length ? [`[Atrium 보드] 도구: \`atrium rig tool <이름> [인자…]\`(네 도구만, 판이 돌리고 출력은 네 섹터의 tool-logs/에 남는다). every가 있는 도구는 판이 시계로 돌리고 경보("ALARM:" 줄이나 실패)일 때만 너를 깨운다.`] : []), // P244
    ...(r3.beat && r3.beat.role === roleName ? [`[Atrium 보드] 박자: 판이 ${r3.beat.every}${r3.beat.at ? `(${r3.beat.at} 기준)` : ''}마다 사이클을 열고 너를 깨운다. 낼 것이 없으면 \`atrium rig pass "<까닭>"\`.`] : []), // P244
    TUNE_HOWTO(r3), // P245: 바로잡음·조정
    longJobLine(r.tools.length > 0), // P247: 긴 일의 차례(도구 → 하네스 뒤 실행, 분리 실행은 안 됨)
    '[Atrium 보드] 지금은 아래를 읽고 "준비됨" 한 줄로 답한 뒤 기다린다. 받은 것이 오면 판이 깨운다. 사람이 이 터미널에서 말하면 따른다.',
    `[Atrium 보드] 기억은 ${memoryPath(roleName)}에 네가 직접 쓴다(다음에 새로 뜨는 너에게 남길 것). 판은 내용을 보지 않고 띄울 때 싣기만 한다.`,
  ];
  return [
    ...head, '',
    block('목적', r3.purpose, files.purpose, LOAD_MAX.purpose, '(목적 문서를 읽지 못했다)'), '',
    block('정의서', r.doc, files.role, LOAD_MAX.role, '(정의서를 읽지 못했다)'), '',
    block('기억', memoryPath(roleName), files.memory, LOAD_MAX.memory, '(아직 없다)'),
    ...(inbox && inbox.length ? ['', '## 받은 것 (판이 쥔 것. 다시 뜨기 전에 온 것)', ...inbox] : []), // P242
    ...(root ? ['', `(워크스페이스: ${root.split(path.sep).join('/')})`] : []),
  ].join('\n');
}
// P242: 항목 명령 쓰는 법(역할 세션의 첫 글과 atrium guide). 짧게
export const ITEM_HOWTO = [
  '[Atrium 보드] 낸다: 네 섹터에 파일을 쓰고 `atrium rig put <종류> <파일> [--from <받은 항목>]`. 판이 길대로 받는 역할에게 보낸다. 낸 파일은 고치지 않는다(고치려면 `atrium rig put <종류> <파일> --redo <항목>`으로 다음 판).',
  '[Atrium 보드] 받은 것에 답한다: `atrium rig accept <항목>` | `return <항목> "<까닭>"`(낸 역할에게 돌아간다) | `pass <항목> "<까닭>"`(받은 것을 답 항목 없이 닫는다). 박자에 낼 것이 없으면 `pass "<까닭>"`(박자에만 답하고 받은 것은 닫지 않는다). 받음은 그 항목에서 이어진 항목을 내기 전까지 반려로 뒤집을 수 있다. 반려된 네 항목은 `put <종류> <파일> --redo <항목>`이나 `drop <항목> "<까닭>"`으로 끝낸다. 목록: `atrium rig inbox`.',
];
// P245: 조정 쓰는 법(역할 세션의 첫 글과 atrium guide). 짧게
export const TUNE_HOWTO = (r3) => `[Atrium 보드] 사람이 이 터미널에서 네 일하는 법을 바로잡으면 \`atrium rig heard "<요지>"\`로 남긴다. 반려·바로잡음이 ${r3.tune.after}건 쌓이거나 (하나라도 있고) ${r3.tune.every}사이클이 지나면 판이 조정 턴을 준다: 정의서의 요령 칸만 네가 고친다(\`atrium rig tune\`, 고정 칸은 못 고친다, ${r3.tune.lines}줄 안). 요령으로 풀 일이 아니면 \`atrium rig raise "<무엇>"\`.`;
// P242: atrium guide(rig). 역할 세션이면 그 역할의 받는 것·내는 것과 항목 명령
export function rigGuide(r3, roleName = null) {
  const r = roleName ? r3.roles[roleName] : null;
  const lines = ['rig(역할 조직). 역할은 대화하지 않고 항목을 넘긴다.'];
  if (r) {
    const gets = r3.flows.filter((f) => f.to.includes(roleName)).map((f) => `${f.item}(${f.from.join('|')}에게서${f.for ? `, ${f.for}에 대한 답` : ''})`);
    const puts = r3.flows.filter((f) => f.from.includes(roleName)).map((f) => `${f.item}(${f.to.join('|')}에게${f.for ? `, 받은 ${f.for}마다` : ''})`);
    lines.push(`너는 역할 ${roleName}. 쓰는 곳: ${r.owns.join(', ')}, 기억 ${memoryDir(roleName)}.`, `받는 것: ${gets.join(', ') || '없음'}. 내는 것: ${puts.join(', ') || '없음'}.`);
  }
  const forFlows = r3.flows.filter((f) => f.for);
  if (forFlows.length) lines.push(`답이 필요한 길: ${forFlows.map((f) => `${f.from.join('|')}가 받은 ${f.for}마다 ${f.item}을 낸다(--from <받은 ${f.for}>)`).join('; ')}. 낼 것이 없으면 pass <항목> "<까닭>".`);
  if (r && r.tools.length) lines.push(`네 도구: ${r.tools.join(', ')}. 부르기: atrium rig tool <이름> [인자…](판이 돌리고 출력은 네 섹터의 tool-logs/에). every가 있는 도구는 판이 시계로 돌리고 경보일 때만 너를 깨운다.`); // P244
  return [...lines, ...ITEM_HOWTO.map((l) => l.replace('[Atrium 보드] ', '')), TUNE_HOWTO(r3).replace('[Atrium 보드] ', ''), longJobLine(!r || r.tools.length > 0).replace('[Atrium 보드] ', '')].join('\n'); // P245: 조정. P247: 긴 일
}
// ---------- P245: 판(버전) 묶음 ----------
// 판 하나 = 정의(rig.json)·목적 문서·모든 정의서의 해시 묶음. rig.mjs read()가 v3 정의의 캐시 표시와 버전 해시에 쓴다.
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
// 묶음 파일 목록(정의 raw에서. 검사 전에도 쓴다) → [{ part, rel }]
export function bundleFiles(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== RIG_VERSION) return [];
  const out = [];
  if (typeof raw.purpose === 'string' && raw.purpose.trim()) out.push({ part: 'purpose', rel: raw.purpose.trim().replace(/\\/g, '/') });
  if (raw.roles && typeof raw.roles === 'object' && !Array.isArray(raw.roles)) for (const name of Object.keys(raw.roles)) if (ROLE_NAME_RE.test(name)) out.push({ part: 'role:' + name, rel: roleDocPath(name) });
  return out;
}
// 캐시 표시: 묶음 파일의 수정 시각·크기(정의서만 바뀌어도 정의 검사가 다시 돈다)
export function bundleSig(root, raw) {
  if (!root) return '';
  return bundleFiles(raw).map((f) => { try { const s = fs.statSync(path.resolve(root, f.rel)); return `${s.mtimeMs}:${s.size}`; } catch { return 'x'; } }).join(',');
}
// 묶음: rigSha(rig.json 해시) + 목적·정의서의 해시와 내용 → { hash, parts: [{ part, sha, text? }] }
export function bundleOf(root, raw, rigSha) {
  const parts = [{ part: 'rig.json', sha: rigSha }];
  for (const f of bundleFiles(raw)) {
    let text = null; try { text = fs.readFileSync(path.resolve(root, f.rel), 'utf8'); } catch { text = null; }
    parts.push(text == null ? { part: f.part, sha: 'missing' } : { part: f.part, sha: sha256(text), text });
  }
  return { hash: sha256(JSON.stringify(parts.map((p) => [p.part, p.sha]))), parts };
}
// P247: 묶음 파일 가운데 가장 늦은 수정 시각(정의서만 바뀐 판의 "누가"를 그 시각으로 본다)
export function bundleMtime(root, raw, base = 0) {
  let t = base;
  if (root) for (const f of bundleFiles(raw)) { try { t = Math.max(t, fs.statSync(path.resolve(root, f.rel)).mtimeMs); } catch {} }
  return t;
}
// ---------- P247: 빌더의 쓰기 범위 ----------
// 정의가 가리키는 도구 스크립트(run[1]이 경로꼴인 것, 워크스페이스 안 상대 경로)
export function toolScripts(r3) {
  if (!r3 || !r3.tools) return [];
  return [...new Set(Object.values(r3.tools).map((t) => t.run && t.run[1]).filter((p) => typeof p === 'string' && /[\\/]/.test(p) && path.extname(p) && !p.startsWith('-') && !isAbs(p) && !p.split(/[\\/]/).includes('..')).map((p) => p.replace(/\\/g, '/').replace(/^(\.\/)+/, '')))];
}
// 빌더가 쓰는 곳: .atrium/(정의·목적·정의서·도구 스크립트 자리 .atrium/tools/)와 정의가 가리키는 그 밖의 도구 스크립트
export const builderWrites = (r3) => [RIG_DIR + '/', ...toolScripts(r3).filter((p) => !p.toLowerCase().startsWith(RIG_DIR + '/'))];
// 상대 경로가 빌더의 쓰기 범위인가(역할의 섹터·기억 폴더 판단은 먼저 한다: rig3-guard ownerOf)
export function builderOwns(r3, rel) {
  const low = String(rel).replace(/\\/g, '/').toLowerCase();
  return builderWrites(r3).some((p) => (p.endsWith('/') ? low.startsWith(p.toLowerCase()) : low === p.toLowerCase()));
}
// 묶음 조각 이름 → 사람 말(장부 글)
export const partLabel = (p) => (p === 'rig.json' ? '정의' : p === 'purpose' ? '목적' : p.startsWith('role:') ? `정의서 ${p.slice(5)}` : p);

// 싣는 파일을 읽는다(없으면 null)
export function readLoadFiles(root, r3, roleName) {
  const rd = (rel) => { try { return fs.readFileSync(path.resolve(root, rel), 'utf8'); } catch { return null; } };
  const r = r3.roles[roleName];
  return { purpose: rd(r3.purpose), role: rd(r.doc), memory: rd(r.memory) };
}
