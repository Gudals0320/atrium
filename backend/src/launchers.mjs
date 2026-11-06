// P33 호출자(launcher): 세션을 띄우는 방법 하나. 하네스(claude, codex, herdr가 아는 다른 종류, 셸) + 모델 + 옵션의 조합이거나, 셸 패널에 칠 명령 한 줄이다.
// 목록은 판 기록(meta 표의 `launchers`)에 { v, items, favorites }로 둔다. favorites는 왼쪽 레일에 놓인 호출자 ID의 순서다.
// 하네스마다 무엇을 받고 어떻게 띄우는지는 아래 HARNESSES 표 한곳에 둔다. session.spawn { launcher }는 resolveLauncher로 띄울 값을 얻는다.
// P25의 DeepSeek(opencodex 게이트웨이)는 "Claude Code + 환경 변수(게이트웨이)" 호출자의 한 예다(exampleDeepseek). 판은 게이트웨이를 켜지 않고 닿는지만 본다.
// P72: 새 판에는 DeepSeek 예시를 만들지 않는다(Claude Code, Codex, 셸 셋). 옛 판(P33 전의 설정·세션이 있던 판)은 그대로 DeepSeek를 옮긴다.
// P72: Codex 모델은 Codex의 모델 목록 캐시(codex-models.mjs)를 읽는다. 읽지 못하면 아래 고정 목록이다.
// 환경 변수 값은 판 기록에 평문으로 남는다. 기본·예시 호출자에는 키를 넣지 않는다(설정 탭에 풀이가 있다).
import crypto from 'node:crypto';
import { EFFORTS, PERMISSION_MODES } from './settings.mjs';
import { unlistedModel } from './codex-models.mjs';
import { FLAVOR as DEEPSEEK, DEFAULT_MODEL as DEEPSEEK_MODEL, DEFAULT_HEALTH_URL, COMMAND_MAX, proxyEnv, baseUrlOf, checkCommand } from './deepseek.mjs';

export const META_KEY = 'launchers';
export const VERSION = 1;
export const NAME_MAX = 40;
export const ARGS_MAX = 300;
export const ENV_MAX = 20; // 이름 수
export const ENV_VALUE_MAX = 500;
export const MODEL_RE = /^[A-Za-z0-9._:/\[\]-]*$/;
const KIND_RE = /^[a-z][a-z0-9_-]{0,31}$/;
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const ICON_RE = /^[a-z][a-z0-9-]{0,19}$/;
const CTRL_RE = /[\x00-\x1f\x7f]/;
// 판이 정하는 값이라 호출자가 덮지 못하는 것: 환경 변수(herdr·판이 넣는 이름)와 claude 인자(판의 hook·세션 ID·이어 가기)
const RESERVED_ENV = /^(HERDR_|ATRIUM_|MTASK_|CLAUDECODE$|CLAUDE_CODE_ENTRYPOINT$)/;
const RESERVED_CLAUDE_ARGS = new Set(['--settings', '--session-id', '--resume', '-r', '--continue', '-c', '--fork-session', '--permission-mode', '--model', '--effort', '--plugin-dir', '--append-system-prompt-file', '--worktree', '-w', '--no-chrome', '-p', '--print']);

// 하네스 정의. fields는 설정 탭이 보일 칸, models는 알려진 모델(직접 입력도 받는다), kind는 판이 기록하는 herdr 종류
export const HARNESSES = {
  claude: { id: 'claude', kind: 'claude', label: 'Claude Code', fields: ['model', 'effort', 'permissionMode', 'allowHerdr', 'args', 'env', 'checkUrl'], models: ['haiku', 'sonnet', 'opus', 'claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'] },
  codex: { id: 'codex', kind: 'codex', label: 'Codex', fields: ['model', 'args'], models: ['gpt-6-astra'], warnUnlisted: true }, // P72: models는 Codex 캐시를 읽지 못할 때의 목록. 목록에 없는 이름은 경고만 한다
  shell: { id: 'shell', kind: 'shell', label: 'Shell', fields: [], models: [] },
  command: { id: 'command', kind: 'shell', label: 'Command', fields: ['command', 'env'], models: [] },
};
// herdr가 아는 그 밖의 종류(pi, grok 등)는 추가 인자만 받는다
export const harnessOf = (id) => HARNESSES[id] || (KIND_RE.test(String(id || '')) ? { id, kind: id, label: id, fields: ['args'], models: [] } : null);
// dyn: 하네스별로 읽어 온 목록 { codex: { models, hidden, labels, source } }(P72). 없으면 고정 목록
export const describeHarnesses = (dyn = {}) => Object.values(HARNESSES).map((h) => (dyn[h.id] ? { ...h, models: [...dyn[h.id].models], hiddenModels: [...(dyn[h.id].hidden || [])], modelLabels: { ...(dyn[h.id].labels || {}) }, modelSource: dyn[h.id].source || null } : { ...h }));
// P72: 하네스가 경고하는 목록 밖 모델 이름인가(Codex). 막지는 않는다
export function modelWarning(l, harnesses) {
  const h = (harnesses || []).find((x) => x.id === l.harness);
  if (!h || !h.warnUnlisted || !h.fields.includes('model')) return null;
  return unlistedModel(l.model, { models: h.models, hidden: h.hiddenModels || [] }) ? { key: 'launcherModels.unlisted', vars: { harness: h.label, model: l.model } } : null;
}

const err = (code, message, key, vars = {}) => Object.assign(new Error(message), { code, key: `launchers.err.${key}`, vars });

// 추가 인자: 빈칸으로 나눈다(따옴표로 묶지 않는다)
export const splitArgs = (s) => String(s || '').split(/\s+/).filter(Boolean);

// 환경 변수: { 이름: 값 } 또는 "이름=값" 줄 글. 이름 검사, 판이 쓰는 이름 거부, 값은 한 줄
export function normalizeEnv(v) {
  let pairs = [];
  if (v == null || v === '') pairs = [];
  else if (typeof v === 'string') pairs = v.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf('='); if (i < 1) throw err('bad_request', `환경 변수는 이름=값: ${l.slice(0, 40)}`, 'envLine', { line: l.slice(0, 40) }); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; });
  else if (typeof v === 'object' && !Array.isArray(v)) pairs = Object.entries(v);
  else throw err('bad_request', '환경 변수 형식', 'envLine', { line: String(v).slice(0, 40) });
  if (pairs.length > ENV_MAX) throw err('bad_request', `환경 변수는 ${ENV_MAX}개까지`, 'envMany', { max: ENV_MAX });
  const out = {};
  for (const [k, raw] of pairs) {
    const val = String(raw ?? '');
    if (!ENV_NAME_RE.test(k)) throw err('bad_request', `환경 변수 이름: ${k}`, 'envName', { name: String(k).slice(0, 40) });
    if (RESERVED_ENV.test(k)) throw err('bad_request', `보드가 정하는 환경 변수: ${k}`, 'envReserved', { name: k });
    if (val.length > ENV_VALUE_MAX || CTRL_RE.test(val)) throw err('bad_request', `환경 변수 값(${k}): 한 줄, ${ENV_VALUE_MAX}자까지`, 'envValue', { name: k, max: ENV_VALUE_MAX });
    out[k] = val;
  }
  return out;
}

function checkUrlOf(v) {
  const u = String(v ?? '').trim();
  if (!u) return '';
  let x; try { x = new URL(u); } catch { x = null; }
  if (!x || !/^https?:$/.test(x.protocol) || u.length > 300) throw err('bad_request', `확인 주소: ${u.slice(0, 60)}`, 'checkUrl', { url: u.slice(0, 60) });
  return u;
}

// 호출자 하나를 확인하고 정리한다. others는 이름 겹침을 볼 다른 호출자들. 하네스가 받지 않는 칸은 비운다
export function normalizeLauncher(input, { others = [] } = {}) {
  if (!input || typeof input !== 'object') throw err('bad_request', "런처를 지정하세요.", 'empty');
  const name = String(input.name ?? '').trim();
  if (!name || name.length > NAME_MAX || CTRL_RE.test(name)) throw err('bad_request', `이름은 1~${NAME_MAX}자 한 줄`, 'name', { max: NAME_MAX });
  if (others.some((o) => o.id !== input.id && o.name.toLowerCase() === name.toLowerCase())) throw err('name_taken', `이미 사용 중인 런처 이름입니다: ${name}`, 'nameTaken', { name });
  const h = harnessOf(String(input.harness || 'claude'));
  if (!h) throw err('bad_request', `하네스: ${input.harness}`, 'harness', { harness: String(input.harness).slice(0, 32) });
  const has = (f) => h.fields.includes(f);
  const icon = String(input.icon ?? '').trim();
  if (icon && !ICON_RE.test(icon)) throw err('bad_request', `아이콘: ${icon}`, 'icon', { icon: icon.slice(0, 20) });
  const model = has('model') ? String(input.model ?? '').trim() : '';
  if (model.length > 80 || !MODEL_RE.test(model)) throw err('bad_request', `모델: 영문·숫자·._:/[]-만, 80자까지`, 'model', { model: model.slice(0, 40) });
  const effort = has('effort') ? String(input.effort ?? '') : '';
  if (!EFFORTS.includes(effort)) throw err('bad_request', `추론 수준: ${effort}`, 'effort', { effort });
  const permissionMode = has('permissionMode') ? String(input.permissionMode || 'manual') : '';
  if (has('permissionMode') && !PERMISSION_MODES.includes(permissionMode)) throw err('bad_request', `승인 방식: ${permissionMode}`, 'permissionMode', { mode: permissionMode });
  const args = has('args') ? String(input.args ?? '').trim() : '';
  if (args.length > ARGS_MAX || CTRL_RE.test(args)) throw err('bad_request', `추가 인자: 한 줄, ${ARGS_MAX}자까지`, 'args', { max: ARGS_MAX });
  if (h.id === 'claude') { const bad = splitArgs(args).find((a) => RESERVED_CLAUDE_ARGS.has(a.split('=')[0])); if (bad) throw err('bad_request', `보드가 정하는 인자: ${bad}`, 'argsReserved', { arg: bad }); }
  let command = '';
  if (has('command')) {
    try { command = checkCommand(input.command); } catch (e) { throw err('bad_request', e.message, e.key === 'deepseekCommandLong' ? 'commandLong' : 'commandLine', { max: COMMAND_MAX, n: String(input.command || '').trim().length }); }
    if (!command) throw err('bad_request', "명령을 입력하세요.", 'commandEmpty');
  }
  const env = has('env') ? normalizeEnv(input.env) : {};
  const checkUrl = has('checkUrl') ? checkUrlOf(input.checkUrl) : '';
  return { id: input.id || null, name, harness: h.id, icon, model, effort, permissionMode, allowHerdr: has('allowHerdr') ? !!input.allowHerdr : false, args, env, command, checkUrl };
}

// 직접 명령에 환경 변수를 붙인다(PowerShell: $env:이름='값'; 작은따옴표는 두 번)
export const psEnvPrefix = (env) => Object.entries(env || {}).map(([k, v]) => `$env:${k}='${String(v).replace(/'/g, "''")}'; `).join('');

// 띄울 때 확인할 게이트웨이: 확인 주소를 주면 그 health(2xx, status ok), 아니면 ANTHROPIC_BASE_URL이 닿는지(무슨 HTTP 답이든)
export function gatewayOf(l) {
  if (l.harness !== 'claude') return null;
  if (l.checkUrl) return { url: l.checkUrl, health: true };
  const base = l.env && l.env.ANTHROPIC_BASE_URL;
  return base ? { url: base, health: false } : null;
}

// 보여줄 종류(노드 로고). 아이콘이 하네스 종류와 다르면 세션에 flavor로 남긴다(P25 flavor deepseek와 같은 길)
export const flavorOf = (l) => (l.icon && l.icon !== harnessOf(l.harness).kind && l.icon !== l.harness ? l.icon : null);

// 호출자 → session.spawn 값. over는 함께 준 값(모델, 노력 수준, 권한 모드, herdr 자동 승인, 추가 인자, 명령)이고 호출자 값을 덮는다
export function resolveLauncher(l, over = {}) {
  const h = harnessOf(l.harness);
  const pick = (k) => (over[k] !== undefined && over[k] !== null && over[k] !== '' ? over[k] : l[k]);
  const base = { kind: h.kind, flavor: flavorOf(l), launcher: l.name, launcherId: l.id || null };
  if (h.id === 'claude') {
    const model = String(pick('model') || '').trim();
    if (!MODEL_RE.test(model)) throw err('bad_request', `모델: ${model}`, 'model', { model: model.slice(0, 40) });
    return { ...base, model: model || null, effort: pick('effort') || null, permissionMode: pick('permissionMode') || 'manual', allowHerdr: over.allowHerdr != null ? !!over.allowHerdr : !!l.allowHerdr, extraArgs: splitArgs(pick('args')), env: { ...(l.env || {}) }, gateway: gatewayOf(l), command: '' };
  }
  if (h.id === 'shell') return { ...base, command: '' };
  if (h.id === 'command') { const c = over.command ? checkCommand(over.command) : l.command; return { ...base, command: psEnvPrefix(l.env) + c }; }
  const model = h.fields.includes('model') ? String(pick('model') || '').trim() : '';
  if (!MODEL_RE.test(model)) throw err('bad_request', `모델: ${model}`, 'model', { model: model.slice(0, 40) });
  return { ...base, args: [...(model ? ['-m', model] : []), ...splitArgs(pick('args'))], command: '' };
}

// 명령 미리보기: 사람이 읽는 명령줄. claude는 판이 덧붙이는 값(hook 설정 파일, 세션 ID, herdr 스킬)을 빼고 보인다. 환경 변수는 이름만 따로
export function previewLauncher(l) {
  const h = harnessOf(l.harness);
  const envNames = Object.keys(l.env || {});
  if (h.id === 'claude') {
    const a = ['claude', '--permission-mode', l.permissionMode || 'manual'];
    if (l.model) a.push('--model', l.model);
    if (l.effort) a.push('--effort', l.effort);
    return { line: [...a, ...splitArgs(l.args)].join(' '), env: envNames, board: true };
  }
  if (h.id === 'shell') return { line: '', env: [], board: false, shell: true };
  if (h.id === 'command') return { line: psEnvPrefix(l.env) + l.command, env: envNames, board: false, typed: true };
  const r = resolveLauncher(l);
  return { line: [h.kind, ...r.args].join(' '), env: [], board: false };
}

// ---------- 기본값과 옮기기 ----------
const claudeDefault = (o = {}) => ({ id: 'claude', name: 'Claude Code', harness: 'claude', icon: '', model: o.claudeModel || '', effort: o.claudeEffort || '', permissionMode: o.claudePermissionMode || 'manual', allowHerdr: !!o.claudeAllowHerdr, args: '', env: {}, command: '', checkUrl: '' });
const codexDefault = (o = {}) => ({ id: 'codex', name: 'Codex', harness: 'codex', icon: '', model: '', effort: '', permissionMode: '', allowHerdr: false, args: o.codexArgs || '', env: {}, command: '', checkUrl: '' });
const shellDefault = () => ({ id: 'shell', name: 'Shell', harness: 'shell', icon: '', model: '', effort: '', permissionMode: '', allowHerdr: false, args: '', env: {}, command: '', checkUrl: '' });
// P25 DeepSeek: Claude Code + opencodex 게이트웨이 환경 변수. 옛 판에 직접 명령이 있었으면 그 명령 호출자다(아이콘은 DeepSeek)
export function exampleDeepseek(o = {}, gw = {}) {
  const healthUrl = gw.healthUrl || DEFAULT_HEALTH_URL;
  if (o.deepseekCommand) return { id: 'deepseek', name: 'DeepSeek', harness: 'command', icon: DEEPSEEK, model: '', effort: '', permissionMode: '', allowHerdr: false, args: '', env: {}, command: o.deepseekCommand, checkUrl: '' };
  return { id: 'deepseek', name: 'DeepSeek', harness: 'claude', icon: DEEPSEEK, model: o.deepseekModel || DEEPSEEK_MODEL, effort: '', permissionMode: o.claudePermissionMode || 'manual', allowHerdr: !!o.claudeAllowHerdr, args: '', env: proxyEnv(baseUrlOf({ baseUrl: gw.baseUrl || null, healthUrl })), command: '', checkUrl: healthUrl };
}
export const LEGACY_KEYS = ['claudeModel', 'claudeEffort', 'claudePermissionMode', 'claudeAllowHerdr', 'codexArgs', 'deepseekModel', 'deepseekCommand'];

// 처음 켤 때의 호출자 목록. 옛 판(설정을 저장한 적이 있거나 세션 기록이 있음)은 옛 새 세션 기본값을 옮기고 레일 네 단추(Claude, Codex, DeepSeek, 셸)를 그 순서로 즐겨찾기에 둔다.
// P72: 새 판은 Claude Code(권한 방식 manual), Codex, 셸 셋뿐이고 모두 즐겨찾기다. 게이트웨이 호출자는 설정 탭에서 직접 만든다. 같은 입력이면 같은 결과다(ID가 고정)
export function initialLaunchers({ oldSettings = null, oldBoard = false, gateway = {} } = {}) {
  if (!oldBoard) return { v: VERSION, items: [claudeDefault(), codexDefault(), shellDefault()], favorites: ['claude', 'codex', 'shell'] };
  const o = oldSettings || {};
  const items = [claudeDefault(o), codexDefault(o), shellDefault(), exampleDeepseek(o, gateway)];
  return { v: VERSION, items, favorites: ['claude', 'codex', 'deepseek', 'shell'] };
}

// 판 기록에 둔 호출자 목록
export class Launchers {
  // codexModels: P72 Codex 모델 목록(codex-models.mjs CodexModels). 없으면 하네스의 고정 목록
  constructor({ store, broadcast = () => {}, gateway = {}, codexModels = null }) {
    this.store = store; this.broadcast = broadcast; this.gateway = gateway; this.codexModels = codexModels;
    this.migrated = this.ensure();
  }
  // 한 번만: 목록이 없으면 만든다. 이미 있으면 아무것도 하지 않는다(여러 번 돌려도 같다). 옛 설정 키는 지우지 않는다(옛 판 코드로 돌아가도 그 값을 쓴다)
  ensure() {
    if (this.store.getMeta(META_KEY)) return null;
    const oldSettings = this.store.getMeta('settings');
    let anySession = false;
    try { anySession = !!this.store.db.prepare('SELECT 1 AS x FROM sessions LIMIT 1').get(); } catch {}
    const v = initialLaunchers({ oldSettings, oldBoard: !!oldSettings || anySession, gateway: this.gateway });
    this.store.setMeta(META_KEY, v);
    return { oldBoard: !!oldSettings || anySession, favorites: v.favorites };
  }
  data() { const d = this.store.getMeta(META_KEY) || { v: VERSION, items: [], favorites: [] }; const ids = new Set(d.items.map((x) => x.id)); return { v: d.v, items: d.items, favorites: (d.favorites || []).filter((id) => ids.has(id)) }; }
  save(d) { this.store.setMeta(META_KEY, d); const out = this.list(); this.broadcast('launchers.updated', out); return out; }
  // 하네스별로 읽어 온 모델 목록(P72: codex)
  modelLists() { const out = {}; if (this.codexModels) { try { out.codex = this.codexModels.read(); } catch {} } return out; }
  harnesses() { return describeHarnesses(this.modelLists()); }
  previewOf(l, hs) { const w = modelWarning(l, hs); return { ...previewLauncher(l), ...(w ? { warn: w } : {}) }; }
  list() {
    const d = this.data();
    const hs = this.harnesses();
    return { launchers: d.items.map((l) => ({ ...l, favorite: d.favorites.includes(l.id), preview: this.previewOf(l, hs) })), favorites: d.favorites, harnesses: hs };
  }
  // 이름이나 ID(대소문자 무시)
  find(ref) {
    const r = String(ref ?? '').trim().toLowerCase();
    if (!r) return null;
    const items = this.data().items;
    return items.find((l) => l.id.toLowerCase() === r) || items.find((l) => l.name.toLowerCase() === r) || null;
  }
  get(ref) { const l = this.find(ref); if (!l) throw err('no_launcher', `런처를 찾을 수 없습니다: ${ref}`, 'notFound', { ref: String(ref).slice(0, 40) }); return l; }
  create(p) {
    const d = this.data();
    const l = normalizeLauncher({ ...(p && p.launcher ? p.launcher : p), id: null }, { others: d.items });
    l.id = 'l' + crypto.randomBytes(4).toString('hex');
    d.items.push(l);
    if (p && (p.favorite || (p.launcher && p.launcher.favorite))) d.favorites.push(l.id);
    return { launcher: l, ...this.save(d) };
  }
  update(p) {
    const d = this.data();
    const cur = this.get(p && (p.id || p.launcher && p.launcher.id));
    const patch = (p && p.patch) || (p && p.launcher) || {};
    const l = normalizeLauncher({ ...cur, ...patch, id: cur.id }, { others: d.items });
    d.items = d.items.map((x) => (x.id === cur.id ? l : x));
    return { launcher: l, ...this.save(d) };
  }
  delete(p) {
    const d = this.data();
    const cur = this.get(p && p.id);
    d.items = d.items.filter((x) => x.id !== cur.id);
    d.favorites = d.favorites.filter((x) => x !== cur.id);
    return this.save(d);
  }
  // 즐겨찾기 켜기·끄기. index를 주면 그 자리에(없으면 끝)
  favorite(p) {
    const d = this.data();
    const cur = this.get(p && p.id);
    const fav = d.favorites.filter((x) => x !== cur.id);
    if (p.favorite !== false) { const i = Number.isInteger(p.index) ? Math.max(0, Math.min(p.index, fav.length)) : fav.length; fav.splice(i, 0, cur.id); }
    d.favorites = fav;
    return this.save(d);
  }
  // 즐겨찾기 순서: ids는 즐겨찾기 ID 전부를 새 순서로
  order(p) {
    const d = this.data();
    const ids = Array.isArray(p && p.ids) ? p.ids.map(String) : null;
    if (!ids || ids.length !== d.favorites.length || new Set(ids).size !== ids.length || ids.some((x) => !d.favorites.includes(x))) throw err('bad_request', "즐겨찾기 순서에는 현재 즐겨찾기에 추가된 ID가 모두 포함되어야 합니다.", 'order');
    d.favorites = ids;
    return this.save(d);
  }
  // 아직 저장하지 않은 호출자의 미리보기와 확인(설정 탭이 고르는 대로 부른다)
  preview(p) {
    const d = this.data();
    const l = normalizeLauncher((p && p.launcher) || p, { others: d.items });
    return { launcher: l, preview: this.previewOf(l, this.harnesses()) };
  }
}

// 게이트웨이가 닿는가. health면 2xx이고 status가 ok여야 하고, 아니면 무슨 HTTP 답이든 닿은 것으로 본다. 안 닿으면 gateway_down
export async function checkGateway({ url, health = false, name = '', timeoutMs = 2000, fetchImpl = globalThis.fetch }) {
  let why;
  try {
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!health) return { ok: true, url };
    if (r.ok) {
      const body = await r.json().catch(() => null);
      if (!body || body.status == null || body.status === 'ok') return { ok: true, url };
      why = `status ${body.status}`;
    } else why = `HTTP ${r.status}`;
  } catch (e) { why = e && e.name === 'TimeoutError' ? 'timeout' : (e && (e.cause && e.cause.code)) || (e && e.message) || 'unreachable'; }
  throw err('gateway_down', `${name ? `${name}: ` : ''}게이트웨이에 연결할 수 없습니다 (${url}: ${why}). 게이트웨이를 실행한 뒤 다시 시도하세요.`, 'gatewayDown', { url, why, name });
}
