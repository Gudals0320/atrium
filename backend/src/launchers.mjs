// P33 호출자(launcher): 세션을 띄우는 방법 하나. 하네스(claude, codex, 터미널이 아는 다른 종류, 셸) + 모델 + 옵션의 조합이거나, 셸 패널에 칠 명령 한 줄이다.
// 목록은 판 기록(meta 표의 `launchers`)에 { v, items, favorites }로 둔다. favorites는 왼쪽 레일에 놓인 호출자 ID의 순서다.
// 하네스마다 무엇을 받고 어떻게 띄우는지는 아래 HARNESSES 표 한곳에 둔다. session.spawn { launcher }는 resolveLauncher로 띄울 값을 얻는다.
// P115: 목록은 새 키(launchers.v2)에 두고 옛 키는 남긴다(launcher-migrate.mjs). P255: 모델 연결(connection)은 걷어 냈다. 저장된 런처에 connection 칸이 남아 있어도
//       읽지 않고(오류 없이) 그 하네스의 기본 로그인으로 띄운다.
// P72: 새 판은 Claude Code, Codex, 셸 셋으로 시작했다. P122: 새 판은 Claude Code, Codex 둘이다(셸 런처는 사람이 "+"로 만든다).
// P72: Codex 모델은 Codex의 모델 목록 캐시(codex-models.mjs)를 읽는다. 읽지 못하면 아래 고정 목록이다.
// 환경 변수 값은 판 기록에 평문으로 남는다. 기본·예시 호출자에는 키를 넣지 않는다(설정 탭에 풀이가 있다).
// P97: 호출자에 실행 명령(startCommand, 예: 래퍼 명령 `mywrap claude`)을 둔다. 비우면 그 하네스의 명령. P115: 모든 에이전트 하네스. 판은 그 명령 뒤에 판의 인자를 붙여
//      터미널에 띄운다(hc 어댑터 startAgent). 이어 가기·되살리기·워크트리·하위 세션도 같은 실행 명령이다.
//      명령줄 붙여 넣기(parseCommandLine)는 한 줄(여러 줄도)을 하네스·실행 명령·모델·옵션·추가 인자·환경 변수로 나눈다. 판이 모르는 명령이면 명령 한 줄 호출자다.
import crypto from 'node:crypto';
import { normalizeOrchFields, ORCH_DEFAULTS } from './orchestration.mjs'; // P296
import fs from 'node:fs';
import path from 'node:path';
import { EFFORTS, PERMISSION_MODES } from './settings.mjs';
import { unlistedModel } from './codex-models.mjs';
import { psLine, psEnvPrefix } from './launch.mjs'; // P97. P115: psEnvPrefix는 launch.mjs
import { adapterOf, reservedArg, wrapperInfo } from './harness.mjs'; // P115: 하네스 어댑터 표. P309: 감싼 호출자(omh)
import { HERMES_EFFORTS, hermesEffortOf, hermesReasoningOf, reasoningIn, withoutReasoning, AGY_TIER_RE, agyModelArg } from './harness.mjs'; // P299: Hermes 노력 수준
import { OMO_EFFORTS, omoEffortOf, thinkingIn } from './harness.mjs'; // P329: omo 생각 수준(--thinking)
import { RELAY_PLACEHOLDER } from './auth-relay-core.mjs'; // P359: 옛 API 런처 표식(P363: 쓸 수 없음으로 옮긴다)
import { SDK_HARNESS, SDK_LAUNCHER_ID } from './sdk-session.mjs'; // P363: SDK 세션 종류
import { V2_KEY, migrateLaunchers, legacyInitialLaunchers } from './launcher-migrate.mjs'; // P115: 옮기기(옛 이름은 그 파일에만)
// P330: 하네스 계약 표(harness-contract.mjs, 근거 harness-contract.md). 칸 값 → 인자, 추가 인자와 칸의 겹침, 하네스 런처로 바꾸기, 점검
import { CODEX_EFFORTS, PI_THINKING, CONTRACTS, contractOf, effortArgsFor, hasEffortArg, approvalArgsFor, hasApprovalArgs, argOverlaps, moveArgsToFields, harnessOfCommand, contractHint, runCheck, modelArgsFor } from './harness-contract.mjs';
export { CODEX_EFFORTS };
export { LEGACY_KEYS } from './launcher-migrate.mjs';

export const META_KEY = V2_KEY; // P115: 연결 참조가 든 목록. 옛 키(launchers)는 옛 코드가 쓴다
export const LEGACY_META_KEY = 'launchers';
export const AGY_BYPASS_META = 'launchers.agyBypass'; // P205: AGY 승인 방식 옮김 표시(한 번만)
// P359의 대화형 API 런처 "Claude Code (API)"(claude-api). P363: 대화형 Claude Code는 요금제 월 API 크레딧을 쓰지 못해(구매 크레딧만) 걷었다.
//   손대지 않은 기본 런처는 지우고, 사람이 고친 런처·{{authRelay}}를 둔 사용자 런처는 쓸 수 없음(unusable: 'authRelay')으로 남겨 까닭을 보인다(조용히 구독으로 돌리지 않는다)
export const API_LAUNCHER_META = 'launchers.apiRelay';
export const API_LAUNCHER_ID = 'claude-api';
export const apiLauncher = () => ({ id: API_LAUNCHER_ID, name: 'Claude Code (API)', harness: 'claude', icon: '', model: 'sonnet', effort: '', permissionMode: 'manual', args: '', env: { ANTHROPIC_BASE_URL: RELAY_PLACEHOLDER }, command: '' });
export const RELAY_GONE_META = 'launchers.relayGone'; // P363: 옮김 표시(한 번만)
export const SDK_LAUNCHER_META = 'launchers.sdk'; // P363: SDK 런처를 한 번 더했다는 표시(사람이 지우면 다시 더하지 않는다)
// P363: 런처 "Claude Code SDK": 판이 claude -p(stream-json)로 돌리고 판 중계기를 거쳐 API 키(요금제 월 API 크레딧)로 과금. 워커 기본 모델은 sonnet
export const sdkLauncher = () => ({ id: SDK_LAUNCHER_ID, name: 'Claude Code SDK', harness: SDK_HARNESS, icon: '', model: 'sonnet', effort: '', permissionMode: '', args: '', env: {}, command: '' });
// P363: 대화형 claude 런처 env에 중계기 자리표시가 있는가(옛 API 런처 꼴)
export const relayLauncher = (l) => !!l && l.harness === 'claude' && !!l.env && Object.values(l.env).some((v) => String(v).includes(RELAY_PLACEHOLDER));
export const VERSION = 2;
export const COMMAND_MAX = 400;
export const NAME_MAX = 40;
export const ARGS_MAX = 300;
export const ENV_MAX = 20; // 이름 수
export const ENV_VALUE_MAX = 500;
export { MODEL_RE } from './model-name.mjs'; // P96: 모델 이름 검사는 model-name.mjs 한 곳
import { MODEL_RE } from './model-name.mjs';
const KIND_RE = /^[a-z][a-z0-9_-]{0,31}$/;
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const ICON_RE = /^[a-z][a-z0-9-]{0,19}$/;
const CTRL_RE = /[\x00-\x1f\x7f]/;
// 판이 정하는 값이라 호출자가 덮지 못하는 것: 환경 변수(판이 넣는 이름)와 claude 인자(판의 hook·세션 ID·이어 가기)
const RESERVED_ENV = /^(ATRIUM_|MTASK_|CLAUDECODE$|CLAUDE_CODE_ENTRYPOINT$)/;
export const RESERVED_CLAUDE_ARGS = new Set(['--settings', '--session-id', '--resume', '-r', '--continue', '-c', '--fork-session', '--permission-mode', '--model', '--effort', '--plugin-dir', '--append-system-prompt-file', '--worktree', '-w', '--no-chrome', '-p', '--print']);

// 하네스 정의. fields는 설정 탭이 보일 칸, models는 알려진 모델(직접 입력도 받는다), kind는 판이 기록하는 에이전트 종류
export const HARNESSES = {
  claude: { id: 'claude', kind: 'claude', label: 'Claude Code', fields: ['startCommand', 'model', 'effort', 'permissionMode', 'args', 'env'], models: ['haiku', 'sonnet', 'opus', 'claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'] },
  // P363: SDK 세션(claude -p stream-json, 판 중계기를 거쳐 API 키 과금). 권한은 늘 bypassPermissions, env·실행 명령 칸 없음. 모델 이름 풀기에는 넣지 않는다(sdk)
  [SDK_HARNESS]: { id: SDK_HARNESS, kind: 'claude', label: 'Claude Code SDK', fields: ['model', 'effort', 'args'], models: ['haiku', 'sonnet', 'opus', 'claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'], sdk: true },
  // P330: 노력 수준(-c model_reasoning_effort="<값>")·승인 방식(harness-contract.mjs CODEX_APPROVAL) 칸
  codex: { id: 'codex', kind: 'codex', label: 'Codex', fields: ['startCommand', 'model', 'effort', 'permissionMode', 'args'], models: ['gpt-6-astra'], efforts: ['', ...CODEX_EFFORTS], warnUnlisted: true }, // P72: models는 Codex 캐시를 읽지 못할 때의 목록. 목록에 없는 이름은 경고만 한다
  // P115: opencode·pi는 하네스 어댑터(harness.mjs)가 env·안내문·이어 가기를 맞춘다. 모델은 opencode가 "<제공자>/<모델>", pi가 --model 값
  // P330: opencode 승인 칸(dontAsk·bypassPermissions → --auto), pi 노력 칸(--thinking)
  opencode: { id: 'opencode', kind: 'opencode', label: 'opencode', fields: ['startCommand', 'model', 'permissionMode', 'args'], models: [] },
  pi: { id: 'pi', kind: 'pi', label: 'pi', fields: ['startCommand', 'model', 'effort', 'args'], models: [], efforts: ['', ...PI_THINKING] },
  // P192: AGY(Antigravity CLI). 모델은 `agy models`(agy-models.mjs)를 읽고, 노력 수준·승인 방식은 AGY 인자(--effort, --mode·--dangerously-skip-permissions)로 붙인다
  agy: { id: 'agy', kind: 'agy', label: 'Antigravity', fields: ['startCommand', 'model', 'effort', 'permissionMode', 'args'], models: ['gemini-3.8-flash-medium'] },
  // P270: dsh(DeepSeek Harness, 실행 명령 dsh-tui). 모델·노력 수준은 dsh 안 /model·/effort(전역 기억)라 칸이 없다. 승인 칸도 없다(Windows dsh-tui는 늘 전체 권한·묻지 않음)
  dsh: { id: 'dsh', kind: 'dsh', label: 'DeepSeek (dsh)', fields: ['startCommand', 'args'], models: [] },
  // P298: Hermes(Hermes Agent, OMH 플러그인이면 함께). 판은 hermes --tui로 띄운다. 모델은 -m(Hermes provider의 모델 이름).
  //   자체 오케스트레이션 하네스라 기본 orchestrates(orchestration.mjs ORCH_DEFAULTS). 기본 런처 목록에는 넣지 않는다(사람이 런처를 만든다)
  //   P299: 노력 수준 칸(efforts: Hermes --reasoning 값, 빈 값 = Hermes 설정 기본). --tui가 --reasoning을 받지 않아 판이 준비된 뒤 /reasoning <값>을 넣는다(harness.mjs).
  //   모델 목록은 판이 모른다(freeModel: --model 이름을 그대로 -m으로)
  //   P330: 승인 칸(dontAsk·bypassPermissions → --yolo. --tui도 받는다. 실행 명령 omh는 승인 인자를 받지 않아 붙이지 않는다)
  hermes: { id: 'hermes', kind: 'hermes', label: 'Hermes', fields: ['startCommand', 'model', 'effort', 'permissionMode', 'args'], models: [], efforts: ['', ...HERMES_EFFORTS], freeModel: true },
  // P329: omo(OmO, 엔진 senpi = pi 계열). 모델은 --model <제공자/ID>(목록은 omo --list-models의 Codex 구독 제공자 chatgpt-subscription, omo-models.mjs),
  //   목록 밖 이름도 그대로 넘긴다(freeModel). 노력 수준 칸은 omo --thinking 값(빈 값 = omo 설정 기본). 자체 오케스트레이션 하네스(ORCH_DEFAULTS).
  //   기본 런처 목록에는 넣지 않는다(사람이 "+"로 만든다)
  omo: { id: 'omo', kind: 'omo', label: 'OmO', fields: ['startCommand', 'model', 'effort', 'args'], models: [], efforts: ['', ...OMO_EFFORTS], freeModel: true },
  shell: { id: 'shell', kind: 'shell', label: 'Shell', fields: [], models: [] },
  command: { id: 'command', kind: 'shell', label: 'Command', fields: ['command', 'env'], models: [] },
};
// 터미널이 아는 그 밖의 종류(pi, grok 등)는 추가 인자만 받는다
export const harnessOf = (id) => HARNESSES[id] || (KIND_RE.test(String(id || '')) ? { id, kind: id, label: id, fields: ['startCommand', 'args'], models: [] } : null); // P115: 실행 명령은 모든 에이전트 하네스
// dyn: 하네스별로 읽어 온 목록 { codex: { models, hidden, labels, source } }(P72). 없으면 고정 목록
// P115: protocols는 그 하네스가 쓸 수 있는 연결 프로토콜(설정 탭이 맞지 않는 연결을 흐리게 보인다)
// P296: 런처의 자체 오케스트레이션 칸만(띄울 값에 싣는다)
export const orchFieldsOf = (l) => (l ? Object.fromEntries(['orchestrates', 'reportFallback', 'busy'].filter((k) => l[k] !== undefined).map((k) => [k, l[k]])) : {});
export const describeHarnesses = (dyn = {}) => Object.values(HARNESSES).map((h) => ({ orchDefault: !!(ORCH_DEFAULTS[h.kind] && ORCH_DEFAULTS[h.kind].orchestrates), fallbackDefault: (ORCH_DEFAULTS[h.kind] && ORCH_DEFAULTS[h.kind].reportFallback) || null, ...(dyn[h.id] ? { ...h, models: [...dyn[h.id].models], hiddenModels: [...(dyn[h.id].hidden || [])], modelLabels: { ...(dyn[h.id].labels || {}) }, modelSource: dyn[h.id].source || null } : { ...h }) }));
// P72: 하네스가 경고하는 목록 밖 모델 이름인가(Codex). 막지는 않는다
export function modelWarning(l, harnesses) {
  const h = (harnesses || []).find((x) => x.id === l.harness);
  if (!h || !h.warnUnlisted || !h.fields.includes('model')) return null;
  return unlistedModel(l.model, { models: h.models, hidden: h.hiddenModels || [] }) ? { key: 'launcherModels.unlisted', vars: { harness: h.label, model: l.model } } : null;
}

const err = (code, message, key, vars = {}) => Object.assign(new Error(message), { code, key: `launchers.err.${key}`, vars });

// 추가 인자 나누기. P205: 공백으로 나누되 따옴표를 안다: '...'는 글자 그대로, "..."는 안에서 \" \\만 이스케이프.
// 따옴표 밖의 역슬래시는 글자 그대로 둔다(Windows 경로 C:\x\y가 그대로). 따옴표가 없는 옛 인자는 예전과 같이 나뉜다
export function splitArgs(s) {
  const str = String(s || '');
  const out = [];
  let cur = '', inTok = false, q = null;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (q === "'") { if (c === "'") q = null; else cur += c; continue; }
    if (q === '"') {
      if (c === '\\' && (str[i + 1] === '"' || str[i + 1] === '\\')) { cur += str[++i]; continue; }
      if (c === '"') q = null; else cur += c;
      continue;
    }
    if (/\s/.test(c)) { if (inTok) { out.push(cur); cur = ''; inTok = false; } continue; }
    inTok = true;
    if (c === "'" || c === '"') q = c; else cur += c;
  }
  if (inTok) out.push(cur); // 닫히지 않은 따옴표는 끝까지 한 인자
  return out;
}
// splitArgs의 반대: 공백·따옴표가 든 인자만 따옴표로 싼다(다시 나누면 같은 배열)
export function joinArgs(args = []) {
  return args.map((a) => {
    const x = String(a);
    if (x && !/[\s'"]/.test(x)) return x;
    return x.includes("'") ? `"${x.replace(/(["\\])/g, '\\$1')}"` : `'${x}'`;
  }).join(' ');
}
// P205: 승인 방식 기본값. AGY는 권한 생략(샌드박스가 판 명령 atrium을 막아 다른 방식으로는 판 일을 못 한다), 나머지는 manual
export const defaultPermission = (harness) => (harness === 'agy' ? 'bypassPermissions' : 'manual');

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

// 직접 명령 글 검사: 한 줄(줄바꿈과 제어 문자 없음), 길이 제한. 앞뒤 빈칸은 뗀다. 빈 글이면 ''
export function checkCommand(text) {
  const c = String(text ?? '').trim();
  if (c.length > COMMAND_MAX) throw err('bad_request', `실행 명령이 너무 깁니다 (${c.length}자, ${COMMAND_MAX}자까지)`, 'commandLong', { n: c.length, max: COMMAND_MAX });
  if (CTRL_RE.test(c)) throw err('bad_request', "실행 명령은 줄바꿈, 탭, 제어 문자 없이 한 줄로 입력하세요.", 'commandLine');
  return c;
}


// ---------- P97: 실행 명령 ----------
export const START_MAX = 120;
const START_WORDS = 8;
// 첫 낱말은 PATH에서 찾는 명령 이름이다(이어 가기 명령 resume_argv의 첫 요소는 경로 없는 명령 이름이다). 뒤 낱말은 따옴표·셸 기호 없이
const START_FIRST_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const START_WORD_RE = /^[A-Za-z0-9_@%+=:,.\/\\~-]+$/;
// 실행 명령 → 낱말들. 비었으면 [](판은 claude를 쓴다)
export const startWords = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
// 판이 claude 세션을 다시 띄울 때 칠 실행 명령의 낱말들([]면 claude)
export const claudeStartOf = (s) => (s && s.kind === 'claude' ? startWords(s.startCommand) : []);
// P115: 그 하네스의 기본 명령 이름(실행 명령이 이것 하나면 비운다)
const defaultCommandOf = (harness) => { const h = harnessOf(harness); if (!h || h.id === 'claude') return 'claude'; const a = adapterOf(h.kind); return a ? a.command : h.kind; };
// 어댑터 startAgent에 넘길 값: 실행 명령이 있을 때만 { command }
export const startOpt = (s) => { const w = claudeStartOf(s); return w.length ? { command: w } : {}; };
// 실행 명령을 확인하고 정리한다. 빈칸이나 `claude` 하나면 ''(판의 기본)
// P115: 하네스마다 기본 명령(claude, codex …)과 판이 정하는 인자가 다르다
export function normalizeStartCommand(v, harness = 'claude') {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  const w = s.split(' ');
  if (s.length > START_MAX || w.length > START_WORDS || CTRL_RE.test(s) || !START_FIRST_RE.test(w[0]) || w.slice(1).some((x) => !START_WORD_RE.test(x))) throw Object.assign(new Error(`실행 명령: 첫 낱말은 명령 이름, 따옴표·셸 기호 없이 ${START_MAX}자까지`), { code: 'bad_request', key: 'launcherStart.bad', vars: { max: START_MAX } });
  const h = harnessOf(harness);
  const bad = !h || h.id === 'claude' ? w.find((x) => RESERVED_CLAUDE_ARGS.has(x.split('=')[0])) : reservedArg(h.kind, w.slice(1));
  if (bad) throw Object.assign(new Error(`보드가 정하는 인자: ${bad}`), { code: 'bad_request', key: 'launcherStart.reserved', vars: { arg: bad } });
  return s.toLowerCase() === defaultCommandOf(harness) ? '' : s;
}
// 명령 이름이 PATH에 있는가(Windows는 PATHEXT와 .ps1도). 30초 담아 둔다. 없어도 저장은 막지 않는다(PowerShell 별칭·함수일 수 있다)
const pathSeen = new Map();
export function onPath(cmd, { env = process.env, now = Date.now(), platform = process.platform } = {}) {
  const key = String(cmd || '').toLowerCase();
  if (!key) return true;
  const c = pathSeen.get(key);
  if (c && now - c.at < 30000) return c.ok;
  const pathVar = env[Object.keys(env).find((k) => k.toUpperCase() === 'PATH')] || '';
  const extVar = env[Object.keys(env).find((k) => k.toUpperCase() === 'PATHEXT')] || '.COM;.EXE;.BAT;.CMD';
  const exts = platform === 'win32' ? ['', ...extVar.toLowerCase().split(';').filter(Boolean), '.ps1'] : [''];
  let ok = false;
  for (const d of pathVar.split(platform === 'win32' ? ';' : path.delimiter).filter(Boolean)) {
    for (const e of exts) { try { if (fs.statSync(path.join(d, cmd + e)).isFile()) { ok = true; break; } } catch {} }
    if (ok) break;
  }
  pathSeen.set(key, { ok, at: now });
  return ok;
}
// 미리보기에 붙일 실행 명령 경고(첫 낱말이 PATH에 없음)
export function startWarning(l, find = onPath) {
  const w = startWords(l.startCommand);
  return w.length && !find(w[0]) ? { key: 'launcherStart.notFound', vars: { cmd: w[0] } } : null;
}

// 호출자 하나를 확인하고 정리한다. others는 이름 겹침을 볼 다른 호출자들. 하네스가 받지 않는 칸은 비운다
// P255: input.connection(옛 연결 참조)은 읽지 않는다
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
  if (!(h.efforts || EFFORTS).includes(effort)) throw err('bad_request', `추론 수준: ${effort}`, 'effort', { effort });
  const permissionMode = has('permissionMode') ? String(input.permissionMode || defaultPermission(h.id)) : '';
  if (has('permissionMode') && !PERMISSION_MODES.includes(permissionMode)) throw err('bad_request', `승인 방식: ${permissionMode}`, 'permissionMode', { mode: permissionMode });
  const args = has('args') ? String(input.args ?? '').trim() : '';
  if (args.length > ARGS_MAX || CTRL_RE.test(args)) throw err('bad_request', `추가 인자: 한 줄, ${ARGS_MAX}자까지`, 'args', { max: ARGS_MAX });
  if (h.id === 'claude' || h.sdk) { const bad = splitArgs(args).find((a) => RESERVED_CLAUDE_ARGS.has(a.split('=')[0]) || (h.sdk && ['--input-format', '--output-format', '--verbose'].includes(a.split('=')[0]))); if (bad) throw err('bad_request', `보드가 정하는 인자: ${bad}`, 'argsReserved', { arg: bad }); }
  else { const bad = reservedArg(h.kind, splitArgs(args)); if (bad) throw err('bad_request', `보드가 정하는 인자: ${bad}`, 'argsReserved', { arg: bad }); } // P115: 하네스 어댑터가 정하는 인자
  let command = '';
  if (has('command')) {
    command = checkCommand(input.command);
    if (!command) throw err('bad_request', "명령을 입력하세요.", 'commandEmpty');
  }
  const env = has('env') ? normalizeEnv(input.env) : {};
  // P309: 명령 한 줄 런처의 하네스 계열(빈 값 = 자동: 감싼 호출자 표(omh → hermes)에 있으면 그 계열, 아니면 셸 명령)
  let family = '';
  if (h.id === 'command') {
    family = String(input.family ?? '').trim();
    if (family && !COMMAND_FAMILIES.includes(family)) throw famErr(`하네스 계열: ${family}`, 'errFamily', { family: family.slice(0, 20) });
    const fam = familyOf({ harness: 'command', command, family });
    if (fam !== 'shell') {
      commandAgent(command, fam); // 명령 이름과 판이 정하는 인자를 확인한다(던진다)
      if (Object.keys(env).length) throw famErr('하네스 계열 런처는 환경 변수를 받지 않습니다(셸 명령으로 두거나 환경 변수를 지우세요).', 'errEnv');
    }
  }
  const startCommand = has('startCommand') ? normalizeStartCommand(input.startCommand, h.id) : ''; // P97. P115: 모든 에이전트 하네스
  // P296: 자체 오케스트레이션(에이전트 하네스만). 칸이 없으면 종류의 기본(orchestration.mjs ORCH_DEFAULTS)
  let orch = {};
  if (h.kind !== 'shell' || (h.id === 'command' && familyOf({ harness: 'command', command, family }) !== 'shell')) { try { orch = normalizeOrchFields(input); } catch (e) { throw err('bad_request', e.message, 'orchestrates', { key: e.key || 'orchestrates' }); } } // P309: 하네스 계열 명령 런처도
  return { id: input.id || null, name, harness: h.id, icon, model, effort, permissionMode, args, env, command, ...(startCommand ? { startCommand } : {}), ...(family ? { family } : {}), ...orch }; // 빈 실행 명령은 두지 않는다
}

// 직접 명령에 환경 변수를 붙인다(PowerShell: $env:이름='값'; 작은따옴표는 두 번). P115: launch.mjs로 옮겼다
export { psEnvPrefix };

// 띄울 때 확인할 곳: env에 ANTHROPIC_BASE_URL을 직접 둔 claude 런처는 그 주소가 닿는지만 본다
// P359: 값이 중계기 자리표시({{authRelay}})면 판 중계기를 거치는 API 런처다({ relay: true }, 판이 띄울 때 중계기를 띄우고 주소를 채운다)
export function gatewayOf(l) {
  const base = l.harness === 'claude' && l.env && l.env.ANTHROPIC_BASE_URL;
  if (base && String(base).includes(RELAY_PLACEHOLDER)) return null; // P363: 옛 API 런처(resolveLauncher가 쓸 수 없음으로 거절한다)
  return base ? { url: base, health: false } : null;
}

// 보여줄 종류(노드 로고). 아이콘이 하네스 종류와 다르면 세션에 flavor로 남긴다(P25)
// P309: 아이콘을 고르지 않았고 실행 명령(명령 한 줄 런처는 그 명령)이 감싼 호출자(omh)면 그 표시 종류(omh: 카드 이름 OMH)
export const flavorOf = (l) => {
  if (l.icon && l.icon !== harnessOf(l.harness).kind && l.icon !== l.harness) return l.icon;
  if (l.icon) return null;
  const w = wrapperInfo(l.harness === 'command' ? l.command : l.startCommand);
  return w && (l.harness === w.family || (l.harness === 'command' && familyOf(l) === w.family)) ? w.flavor : null;
};

// ---------- P309: 명령 한 줄 런처의 하네스 계열 ----------
// shell: 셸 패널에 그 줄을 친다(지금까지와 같다), hermes: Hermes 계열(어댑터 hermes: 화면 상태·state.db·이어 가기·안내문), agent: 그 밖의 에이전트(어댑터가 없으면
//   판 env와 PATH만, 상태는 터미널이 아는 것과 화면 기반 일반 규칙). 빈 값은 자동(감싼 호출자 표에 있으면 그 계열, 아니면 shell)
export const COMMAND_FAMILIES = ['shell', 'hermes', 'agent'];
const famErr = (message, key, vars = {}) => Object.assign(new Error(message), { code: 'bad_request', key: `launcherFamily.${key}`, vars }); // 창 사전 launcherFamily.*
export function familyOf(l) {
  if (!l || l.harness !== 'command') return null;
  if (l.family && COMMAND_FAMILIES.includes(l.family)) return l.family;
  const w = wrapperInfo(l.command);
  return w ? w.family : 'shell';
}
// P309: 하네스 계열 명령 런처를 그 계열의 에이전트 런처 모양으로(하위 세션 띄우기·물려받기가 보통 런처처럼 쓴다). 셸 명령이면 null
export function agentLauncherOf(l) {
  const fam = familyOf(l);
  if (!fam || fam === 'shell') return null;
  const a = commandAgent(l.command, fam);
  return { ...l, harness: a.kind, startCommand: a.startCommand.toLowerCase() === defaultCommandOf(a.kind) ? '' : a.startCommand, args: joinArgs(a.args), command: '', env: {}, family: undefined };
}
// 하네스 계열 명령 → { kind, startCommand, args }. 한 문장, 첫 낱말은 PATH에서 찾는 명령 이름(경로·따옴표 없이). 판이 정하는 인자는 거부
export function commandAgent(command, family) {
  const st = shellStatements(command);
  const words = st.length === 1 ? st[0] : null;
  if (!words || words.some(isSpaced) || !START_FIRST_RE.test(wordText(words[0]))) throw famErr('하네스 계열 런처의 명령은 한 줄, 첫 낱말은 명령 이름(경로·따옴표 없이)입니다.', 'errCommand');
  const first = wordText(words[0]);
  const base = exeBase(first);
  const kind = family === 'hermes' ? 'hermes' : KIND_RE.test(base) && base !== 'shell' && base !== 'command' ? base : 'agent';
  const args = words.slice(1).map(wordText);
  const bad = kind === 'claude' ? args.find((a) => RESERVED_CLAUDE_ARGS.has(a.split('=')[0])) : reservedArg(kind, args);
  if (bad) throw err('bad_request', `보드가 정하는 인자: ${bad}`, 'argsReserved', { arg: bad });
  return { kind, startCommand: first, args };
}

// 호출자 → session.spawn 값. over는 함께 준 값(모델, 노력 수준, 권한 모드, 추가 인자, 명령)이고 호출자 값을 덮는다
export function resolveLauncher(l, over = {}) {
  const h = harnessOf(l.harness);
  const pick = (k) => (over[k] !== undefined && over[k] !== null && over[k] !== '' ? over[k] : l[k]);
  const base = { kind: h.kind, flavor: flavorOf(l), launcher: l.name, launcherId: l.id || null, ...orchFieldsOf(l) }; // P296: 자체 오케스트레이션 칸(spawn이 세션에 남긴다)
  // P363: 옛 대화형 API 런처({{authRelay}})는 띄우지 않고 까닭을 보인다(조용히 구독으로 돌리지 않는다)
  if (l.unusable === 'authRelay' || relayLauncher(l)) throw Object.assign(new Error(`런처 ${l.name}는 대화형 API 과금 런처라 더 쓸 수 없습니다. 대화형 Claude Code는 요금제 월 API 크레딧을 쓰지 못합니다. 런처 "Claude Code SDK"를 쓰세요.`), { code: 'launcher_unusable', key: 'sdkSession.err.relayGone', vars: { name: l.name } });
  if (h.sdk) {
    const model = String(pick('model') || '').trim();
    if (!MODEL_RE.test(model)) throw err('bad_request', `모델: ${model}`, 'model', { model: model.slice(0, 40) });
    return { ...base, sdk: true, model: model || null, effort: pick('effort') || null, permissionMode: 'bypassPermissions', extraArgs: splitArgs(pick('args')), env: {}, gateway: null, command: '', startCommand: '' };
  }
  if (h.id === 'claude') {
    const model = String(pick('model') || '').trim();
    if (!MODEL_RE.test(model)) throw err('bad_request', `모델: ${model}`, 'model', { model: model.slice(0, 40) });
    return { ...base, model: model || null, effort: pick('effort') || null, permissionMode: pick('permissionMode') || 'manual', extraArgs: splitArgs(pick('args')), env: { ...(l.env || {}) }, gateway: gatewayOf(l), command: '', startCommand: l.startCommand || '' }; // P97: 실행 명령(빈 값은 claude)
  }
  if (h.id === 'shell') return { ...base, command: '' };
  if (h.id === 'command') {
    const c = over.command ? checkCommand(over.command) : l.command;
    const fam = familyOf({ ...l, command: c });
    if (fam === 'shell') return { ...base, command: psEnvPrefix(l.env) + c };
    // P309: 하네스 계열이면 셸에 치지 않고 그 계열의 에이전트로 띄운다(실행 명령 = 그 명령 이름, 나머지 = 추가 인자)
    const a = commandAgent(c, fam);
    const ah = harnessOf(a.kind);
    return { ...base, kind: a.kind, flavor: flavorOf({ ...l, command: c }), model: null, args: a.args, command: '', startCommand: a.startCommand.toLowerCase() === defaultCommandOf(a.kind) ? '' : a.startCommand, gateway: null, ...(a.kind === 'hermes' || a.kind === 'omo' ? { effort: over.effort || null } : {}), ...(ah && ah.fields.includes('permissionMode') ? { permissionMode: over.permissionMode || defaultPermission(ah.id) } : {}) };
  }
  const model = h.fields.includes('model') ? String(pick('model') || '').trim() : '';
  if (!MODEL_RE.test(model)) throw err('bad_request', `모델: ${model}`, 'model', { model: model.slice(0, 40) });
  // P115: 모델과 추가 인자를 따로 준다. 하네스 어댑터(harness.mjs)가 그 하네스의 모양(-m, --model, 설정의 model)으로 바꾼다
  const args = splitArgs(pick('args'));
  // P192: 노력 수준·승인 방식 칸이 있는 하네스(AGY)는 그 값을 그 하네스 인자로 붙인다(추가 인자에 이미 있으면 그것이 이긴다)
  const extra = h.fields.includes('effort') || h.fields.includes('permissionMode') ? harnessOptionArgs(h.kind, { effort: h.fields.includes('effort') ? pick('effort') : '', permissionMode: h.fields.includes('permissionMode') ? pick('permissionMode') || defaultPermission(h.id) : '', startCommand: l.startCommand || '' }, args) : []; // P330: 계약 표(Codex·pi·Hermes·opencode도)
  return { ...base, model: model || null, args: [...args, ...extra], command: '', startCommand: l.startCommand || '', gateway: gatewayOf(l), ...(h.kind === 'hermes' || h.kind === 'omo' ? { effort: pick('effort') || null } : {}), /* P299: 판이 준비된 뒤 /reasoning으로. P329: omo는 어댑터가 --thinking으로 */ ...(h.fields.includes('permissionMode') ? { permissionMode: pick('permissionMode') || defaultPermission(h.id) } : {}) };
}
// P208: Codex가 받는 추론 수준은 harness-contract.mjs CODEX_EFFORTS(config의 model_reasoning_effort)
const CODEX_EFFORT_KEY = 'model_reasoning_effort';
// P208: 명시한 노력 수준(atrium child --effort)을 Claude Code 밖 하네스의 인자로 옮긴다. 호출자 추가 인자의 같은 값을 빼고 넣는다(명시한 값이 이긴다).
//   판이 세션을 띄우는 공통 길(backend spawn)이 부른다. → { args, applied, ignored?, effort }
//   - codex: -c model_reasoning_effort="<값>"(호출자 인자의 -c/--config model_reasoning_effort=… 를 뺀다). Codex가 받지 않는 값은 던진다
//   - agy: --effort <값>(호출자 인자의 --effort를 뺀다). Claude Code와 같은 값만
//   - claude는 판이 --effort로 따로 넘긴다(바꾸지 않는다). 그 밖의 종류(opencode, pi 등)는 노력 수준을 받지 않는다(ignored)
export function effortArgsOf(kind, effort, args = []) {
  const a = (args || []).map(String);
  const e = String(effort || '').trim();
  if (!e || kind === 'claude') return { args: a, applied: false, effort: e || null };
  if (kind === 'codex') {
    if (!CODEX_EFFORTS.includes(e)) throw err('bad_request', `Codex 추론 수준은 ${CODEX_EFFORTS.join(', ')} 가운데 하나: ${e}`, 'effort', { effort: e.slice(0, 20) });
    const isKey = (v) => new RegExp(`^${CODEX_EFFORT_KEY}\\s*=`).test(String(v));
    const out = [];
    for (let i = 0; i < a.length; i++) {
      if ((a[i] === '-c' || a[i] === '--config') && isKey(a[i + 1])) { i++; continue; }
      if (/^(-c|--config)=/.test(a[i]) && isKey(a[i].replace(/^(-c|--config)=/, ''))) continue;
      out.push(a[i]);
    }
    return { args: [...out, '-c', `${CODEX_EFFORT_KEY}="${e}"`], applied: true, effort: e };
  }
  if (kind === 'agy') {
    if (!EFFORTS.includes(e)) throw err('bad_request', `추론 수준은 ${EFFORTS.filter(Boolean).join(', ')} 가운데 하나: ${e}`, 'effort', { effort: e.slice(0, 20) });
    const out = [];
    for (let i = 0; i < a.length; i++) { if (a[i] === '--effort') { i++; continue; } if (a[i].startsWith('--effort=')) continue; out.push(a[i]); }
    return { args: [...out, '--effort', e], applied: true, effort: e };
  }
  // P330: pi는 --thinking <값>(호출자 인자의 --thinking을 뺀다)
  if (kind === 'pi') {
    if (!PI_THINKING.includes(e)) throw err('bad_request', `pi 사고 수준은 ${PI_THINKING.join(', ')} 가운데 하나: ${e}`, 'effort', { effort: e.slice(0, 20) });
    const out = [];
    for (let i = 0; i < a.length; i++) { if (a[i] === '--thinking') { i++; continue; } if (a[i].startsWith('--thinking=')) continue; out.push(a[i]); }
    return { args: [...out, '--thinking', e], applied: true, effort: e };
  }
  // P299: hermes는 인자를 바꾸지 않는다(판이 준비된 뒤 /reasoning <값>을 넣는다, 이어 가기에도). 이름은 맞춰 바꾸고, 받지 않는 값·런처 인자에 --reasoning이 있으면 무시
  if (kind === 'hermes') {
    const v = hermesEffortOf(e);
    if (!v) return { args: a, applied: false, ignored: true, why: 'value', effort: e };
    const own = reasoningIn(a);
    if (own != null) return { args: a, applied: false, ignored: true, why: 'launcherArgs', effort: own };
    return { args: a, applied: true, effort: v };
  }
  // P329: omo는 인자를 바꾸지 않는다(어댑터가 --thinking <값>을 붙인다, 이어 가기에도). 런처 인자에 --thinking이 있으면 그 값을 따른다
  if (kind === 'omo') {
    const v = omoEffortOf(e);
    if (!v) return { args: a, applied: false, ignored: true, why: 'omoValue', effort: e };
    const own = thinkingIn(a);
    if (own != null) return { args: a, applied: false, ignored: true, why: 'omoLauncherArgs', effort: own };
    return { args: a, applied: true, effort: v };
  }
  return { args: a, applied: false, ignored: true, effort: e };
}
// 노력 수준을 무시한 까닭 한 줄(atrium child 응답). P299: Hermes의 까닭(받지 않는 값, 런처 인자의 --reasoning)
export const effortIgnoredLine = (kind, effort, why = null) => why === 'omoValue' ? `--effort ${effort}는 무시했다: omo는 ${OMO_EFFORTS.join(', ')}만 받는다(omo 설정의 기본을 따른다).`
  : why === 'omoLauncherArgs' ? `--effort는 무시했다: 런처 추가 인자의 --thinking ${effort}를 따른다.`
  : why === 'value' ? `--effort ${effort}는 무시했다: ${kind}는 ${HERMES_EFFORTS.join(', ')}만 받는다(${kind} 설정의 기본을 따른다).`
  : why === 'launcherArgs' ? `--effort는 무시했다: 런처 추가 인자의 --reasoning ${effort}를 따른다.`
  : CONTRACTS[kind] && CONTRACTS[kind].effort.via === 'slash' && !CONTRACTS[kind].effort.values ? `--effort ${effort}는 무시했다: ${kind}는 노력 수준을 인자로 받지 않는다(${kind} 안 ${CONTRACTS[kind].effort.slash}로 정한다).` // P330: 계약 표
  : `--effort ${effort}는 무시했다: ${kind}는 노력 수준을 받지 않는다(호출자 인자나 ${kind} 설정을 따른다).`;
// P192: 노력 수준·승인 방식 → 그 하네스 인자. 추가 인자에 같은 인자가 있으면 붙이지 않는다(런처 인자가 이긴다)
// P330: 계약 표(harness-contract.mjs): AGY --effort·--mode, Codex -c model_reasoning_effort·승인 표, pi --thinking, Hermes --yolo, opencode --auto.
//   Hermes 노력 수준은 인자가 아니다(준비된 뒤 /reasoning). 실행 명령 omh는 승인 인자를 받지 않는다
export function harnessOptionArgs(kind, { effort = '', permissionMode = '', startCommand = '' } = {}, args = []) {
  const out = [];
  const ea = effortArgsFor(kind, effort);
  if (ea && !hasEffortArg(kind, args)) out.push(...ea);
  if (permissionMode && !hasApprovalArgs(kind, args)) out.push(...approvalArgsFor(kind, permissionMode, startCommand));
  return out;
}

// 명령 미리보기: 사람이 읽는 명령줄. claude는 판이 덧붙이는 값(hook 설정 파일, 세션 ID, 플러그인)을 빼고 보인다. 환경 변수는 이름만 따로
export function previewLauncher(l) {
  const h = harnessOf(l.harness);
  const envNames = Object.keys(l.env || {});
  if (h.sdk) { // P363: 판이 백엔드 자식으로 돌리는 claude -p(터미널 없음)
    const a = ['claude', '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions'];
    if (l.model) a.push('--model', l.model);
    if (l.effort) a.push('--effort', l.effort);
    return { line: [a.join(' '), joinArgs(splitArgs(l.args))].filter(Boolean).join(' '), env: [], board: true, sdk: true };
  }
  if (h.id === 'claude') {
    const s = startWords(l.startCommand); // P97: 실행 명령(비면 claude)
    const a = [...(s.length ? s : ['claude']), '--permission-mode', l.permissionMode || 'manual'];
    if (l.model) a.push('--model', l.model);
    if (l.effort) a.push('--effort', l.effort);
    return { line: [a.join(' '), joinArgs(splitArgs(l.args))].filter(Boolean).join(' '), env: envNames, board: true };
  }
  if (h.id === 'shell') return { line: '', env: [], board: false, shell: true };
  if (h.id === 'command') {
    const fam = familyOf(l);
    if (fam === 'shell') return { line: psEnvPrefix(l.env) + l.command, env: envNames, board: false, typed: true };
    const a = commandAgent(l.command, fam); // P309: 하네스 계열이면 그 에이전트의 줄
    return { ...previewLauncher({ harness: a.kind, startCommand: a.startCommand, args: joinArgs(a.args), model: '', effort: '', env: {} }), family: fam };
  }
  const r = resolveLauncher(l);
  const a = adapterOf(h.kind);
  const s = startWords(l.startCommand); // P115: 실행 명령. 모델은 그 하네스의 모양(판이 덧붙이는 env·안내문·세션 ID는 빼고 보인다)
  const ra = h.kind === 'hermes' ? hermesReasoningOf(r.effort, r.args) : null; // P299: 판이 준비된 뒤 넣는 /reasoning(--tui는 --reasoning을 받지 않는다)
  const ha = h.kind === 'hermes' ? withoutReasoning(r.args) : r.args;
  const omh = h.kind === 'hermes' && wrapperInfo(s); // P309: omh는 모델을 인자가 아니라 env HERMES_MODEL로 받는다
  const th = h.kind === 'omo' && thinkingIn(r.args) == null ? omoEffortOf(r.effort) : null; // P329: omo 생각 수준(어댑터가 --thinking으로 붙인다)
  const mEnv = omh && r.model ? ['HERMES_MODEL'] : h.kind === 'opencode' && r.model ? ['OPENCODE_CONFIG_CONTENT'] : []; // P330: opencode는 모델을 설정 글(env)로 받는다
  return { line: [...(s.length ? s : [a ? a.command : h.kind]), ...(r.model && a && !omh ? a.modelArgs(r.model, r.args) : []), ...(th ? ['--thinking', th] : [])].join(' ') + (ha.length ? ' ' + joinArgs(ha) : ''), env: mEnv, board: !!a, ...(ra ? { after: `/reasoning ${ra}` } : {}) };
}

// ---------- P330: 하네스 계약에 맞추기(설정 › 런처의 안내·겹침 경고·바꾸기·점검) ----------
// 명령 한 줄 런처의 첫 낱말이 판이 아는 하네스(dsh-tui → dsh, omh → hermes + 실행 명령 omh, codex·agy·hermes·pi·opencode·claude)면 바꿀 하네스 런처 값. 아니면 null.
// 명령줄 붙여 넣기(parseCommandLine)와 같은 길로 나눈다. 이름·아이콘·ID·자체 오케스트레이션 칸은 그대로 둔다. 셸 계열을 사람이 고른 런처(family shell)도 권한다
export function convertCommandLauncher(l) {
  if (!l || l.harness !== 'command' || !String(l.command || '').trim()) return null;
  const st = shellStatements(l.command);
  if (st.length !== 1 || !harnessOfCommand(wordText(st[0][0]))) return null;
  const r = parseCommandLine(l.command, { kinds: [] });
  if (r.recognized.as === 'command' || r.recognized.as === 'empty') return null;
  const p = r.launcher;
  const out = { ...l, harness: p.harness, model: p.model || '', effort: p.effort || '', permissionMode: p.permissionMode || defaultPermission(p.harness), args: p.args || '', env: p.harness === 'claude' ? { ...(l.env || {}) } : {}, command: '', ...(p.startCommand ? { startCommand: p.startCommand } : { startCommand: '' }) };
  delete out.family;
  return { launcher: out, from: l.command, dropped: r.recognized.dropped || [] };
}
// 런처 하나의 계약 점검(미리보기에 싣는다): 칸 안내, 칸과 겹치는 추가 인자, 그 하네스가 모르는 인자, 그 모양으로 받지 않는 인자, 하네스 런처로 바꾸기 권함
export function launcherContract(l) {
  if (!l) return null;
  if (l.harness === 'command') { const c = convertCommandLauncher(l); return c ? { convert: { harness: c.launcher.harness, startCommand: c.launcher.startCommand || '' } } : null; }
  const h = harnessOf(l.harness);
  if (!h || h.id === 'shell') return null;
  const hint = contractHint(h.id, { startCommand: l.startCommand || '', permissionMode: l.permissionMode || defaultPermission(h.id) });
  if (!hint) return null;
  const ov = argOverlaps(h.id, splitArgs(l.args), l.startCommand || '');
  const overlaps = ov.items.map((x) => ({ arg: x.arg, field: x.field, value: x.value, ok: x.ok, movable: x.ok && h.fields.includes(x.field) }));
  // P330: AGY 단계 붙은 모델 ID + 노력 수준 → 보드가 단계를 떼고 넘긴다(알림)
  let tier = null;
  if (h.id === 'agy' && l.model && AGY_TIER_RE.test(l.model)) { const r = resolveLauncher(l); const base = agyModelArg(l.model, r.args); if (base !== l.model) tier = { model: l.model, base, effort: (r.args[r.args.indexOf('--effort') + 1]) || '' }; }
  return { hint, overlaps, unknown: ov.unknown, rejected: ov.rejected, ...(tier ? { tier } : {}) };
}
// 겹치는 인자를 칸으로(fields) 또는 명령 한 줄 런처를 하네스 런처로(harness). 저장하지 않는다(설정 탭이 칸을 채우고 사람이 저장한다)
export function fixLauncher(l, action) {
  if (action === 'harness') {
    const c = convertCommandLauncher(l);
    if (!c) throw err('bad_request', '판이 아는 하네스 명령이 아닙니다.', 'notConvertible');
    const m = moveArgsToFields(c.launcher, { fields: harnessOf(c.launcher.harness).fields, split: splitArgs, join: joinArgs });
    return { launcher: m.launcher, moved: m.moved, from: c.from };
  }
  const h = harnessOf(l.harness);
  if (!h || h.id === 'command' || h.id === 'shell') return { launcher: l, moved: [] };
  return moveArgsToFields(l, { fields: h.fields, split: splitArgs, join: joinArgs });
}
// 점검할 명령과 판이 붙일 인자: 실행 명령(비면 그 하네스 명령) + 계약의 판 인자 + 칸 값·추가 인자에서 나오는 인자
export function checkPlanOf(l) {
  let x = l;
  if (x.harness === 'command') { const c = convertCommandLauncher(x); if (c) x = c.launcher; else { const a = agentLauncherOf(x); if (!a) return null; x = a; } }
  const h = harnessOf(x.harness);
  if (!h || h.id === 'shell' || h.id === 'command') return null;
  const c = contractOf(h.id, x.startCommand || '');
  const sw = startWords(x.startCommand);
  const words = sw.length ? sw : [c ? c.command : defaultCommandOf(h.id)];
  let args = [];
  if (h.id === 'claude') { args = [...(x.model ? ['--model'] : []), ...(x.effort ? ['--effort'] : []), ...splitArgs(x.args)]; }
  else { const r = resolveLauncher(x); args = [...(r.model ? modelArgsFor(h.kind, r.model, x.startCommand || '') : []), ...(h.kind === 'hermes' ? withoutReasoning(r.args) : r.args)]; }
  const flags = c && c.helpPartial ? [] : [...(c ? c.boardFlags : []), ...args.filter((a) => /^-/.test(String(a))).map((a) => String(a).split('=')[0])]; // P329: omo 도움말은 짧아 판 줄만
  return { words, flags: [...new Set(flags)], harness: h.id, contract: c ? c.id : null };
}

// ---------- 기본값과 옮기기 ----------
const plain = (id, name, harness, x = {}) => ({ id, name, harness, icon: '', model: '', effort: '', permissionMode: '', args: '', env: {}, command: '', ...x });

// 처음 켤 때의 호출자 목록(옛 키 모양 v1). 옛 판(P33 전의 설정·세션이 있던 판)은 옛 새 세션 기본값을 옮긴다(launcher-migrate.mjs).
// P72·P122: 새 판은 Claude Code(권한 방식 manual), Codex 둘뿐이고 모두 즐겨찾기다. 같은 입력이면 같은 결과다(ID가 고정).
// 셸 런처는 사람이 설정 › 런처의 "+"로 만들고, 옛 판의 목록(셸 포함)은 바꾸지 않는다
export function initialLaunchers({ oldSettings = null, oldBoard = false, gateway = {} } = {}) {
  if (!oldBoard) return { v: 1, items: [plain('claude', 'Claude Code', 'claude', { permissionMode: 'manual' }), plain('codex', 'Codex', 'codex')], favorites: ['claude', 'codex'] };
  return legacyInitialLaunchers(oldSettings || {}, gateway);
}
// P115: 런처 env에 평문으로 든 인증 값(이름에 KEY·TOKEN·SECRET·PASSWORD). 판은 옮기지 않고 설정 탭이 알린다
const AUTH_ENV_RE = /(KEY|TOKEN|SECRET|PASSWORD)/i;
export const authNotices = (items) => items.map((l) => ({ id: l.id, name: l.name, env: Object.entries(l.env || {}).filter(([k, v]) => AUTH_ENV_RE.test(k) && String(v || '').trim()).map(([k]) => k) })).filter((x) => x.env.length);

// P255: 저장된 런처의 옛 연결 참조를 뺀 사본(없으면 그대로)
export const dropConnection = (l) => { if (!l || typeof l !== 'object' || !('connection' in l)) return l; const { connection, ...rest } = l; return rest; }; // eslint-disable-line no-unused-vars

// 판 기록에 둔 호출자 목록
export class Launchers {
  // codexModels: P72 Codex 모델 목록(codex-models.mjs CodexModels). 없으면 하네스의 고정 목록
  // gateway: 옛 환경 변수의 게이트웨이 주소({ healthUrl, baseUrl }, P33 전 판의 처음 목록만 읽는다)
  constructor({ store, broadcast = () => {}, gateway = {}, codexModels = null, agyModels = null, piModels = null, omoModels = null, log = () => {} }) {
    this.store = store; this.broadcast = broadcast; this.gateway = gateway || {}; this.codexModels = codexModels; this.agyModels = agyModels; this.piModels = piModels; this.omoModels = omoModels; this.log = log; // P329: omoModels // P192: agyModels
    this.migrated = this.ensure();
    this.agyBypassMoved = this.migrateAgyBypass();
    this.relayGone = this.dropRelayLaunchers();
    this.sdkLauncherAdded = this.addSdkLauncher();
  }
  // P363: 한 번만. 손대지 않은 기본 API 런처(claude-api)는 지우고, 고친 것·{{authRelay}}를 둔 사용자 런처는 쓸 수 없음으로 표시한다(레일에서도 뺀다)
  dropRelayLaunchers() {
    if (this.store.getMeta(RELAY_GONE_META)) return null;
    const d = this.store.getMeta(META_KEY);
    const out = { removed: [], marked: [] };
    if (d && Array.isArray(d.items)) {
      const def = apiLauncher();
      const same = (l) => l.id === API_LAUNCHER_ID && ['harness', 'model', 'effort', 'permissionMode', 'args', 'command'].every((k) => (l[k] || '') === (def[k] || '')) && JSON.stringify(l.env || {}) === JSON.stringify(def.env);
      const items = [];
      for (const l of d.items) {
        if (same(l)) { out.removed.push(l.name); continue; }
        if (relayLauncher(l)) { out.marked.push(l.name); items.push({ ...l, unusable: 'authRelay' }); continue; }
        items.push(l);
      }
      if (out.removed.length || out.marked.length) {
        const gone = new Set(d.items.filter((l) => same(l) || relayLauncher(l)).map((l) => l.id));
        this.store.setMeta(META_KEY, { ...d, items, favorites: (d.favorites || []).filter((id) => !gone.has(id)) });
        this.store.addEvent(null, 'launchers_relay_gone', out);
      }
    }
    this.store.setMeta(RELAY_GONE_META, { at: Date.now(), ...out });
    return out;
  }
  // P363: 한 번만, 목록 끝에 SDK 런처를 더한다(레일 즐겨찾기에는 넣지 않는다). 지우면 다시 더하지 않는다
  addSdkLauncher() {
    if (this.store.getMeta(SDK_LAUNCHER_META)) return false;
    const d = this.store.getMeta(META_KEY);
    let added = false;
    if (d && Array.isArray(d.items) && !d.items.some((l) => l.id === SDK_LAUNCHER_ID)) {
      const l = sdkLauncher();
      l.name = uniqueName(l.name, d.items);
      this.store.setMeta(META_KEY, { ...d, items: [...d.items, l] });
      added = true;
    }
    this.store.setMeta(SDK_LAUNCHER_META, { at: Date.now(), added });
    return added;
  }
  // P205: 한 번만, AGY 호출자 가운데 승인 방식이 manual(또는 빈 값)인 것을 권한 생략으로 옮긴다(P203: AGY 샌드박스가 판 명령을 막는다).
  // meta에 옮김 표시를 남겨 사람이 그 뒤 manual로 되돌려도 다시 옮기지 않는다. 다른 하네스는 건드리지 않는다
  migrateAgyBypass() {
    if (this.store.getMeta(AGY_BYPASS_META)) return [];
    const d = this.store.getMeta(META_KEY);
    const moved = [];
    if (d && Array.isArray(d.items)) {
      const items = d.items.map((l) => { if (l.harness !== 'agy' || (l.permissionMode && l.permissionMode !== 'manual')) return l; moved.push(l.name); return { ...l, permissionMode: 'bypassPermissions' }; });
      if (moved.length) { this.store.setMeta(META_KEY, { ...d, items }); this.store.addEvent(null, 'launchers_agy_bypass', { moved }); }
    }
    this.store.setMeta(AGY_BYPASS_META, { at: Date.now(), moved });
    return moved;
  }
  // 한 번만: 새 키(v2) 목록이 없으면 옛 키(없으면 처음 목록)를 옮겨 만든다. 이미 있으면 목록은 그대로(여러 번 돌려도 같다).
  // 옛 키와 옛 설정 키는 지우지 않는다(옛 판 코드로 돌아가도 그 값을 쓴다)
  ensure() { return this.store.getMeta(META_KEY) ? null : this.migrateV2(); }
  migrateV2() {
    let v1 = this.store.getMeta(LEGACY_META_KEY);
    let created = null;
    if (!v1) {
      const oldSettings = this.store.getMeta('settings');
      let anySession = false;
      try { anySession = !!this.store.db.prepare('SELECT 1 AS x FROM sessions LIMIT 1').get(); } catch {}
      v1 = initialLaunchers({ oldSettings, oldBoard: !!oldSettings || anySession, gateway: this.gateway });
      this.store.setMeta(LEGACY_META_KEY, v1); // 옛 코드도 같은 목록으로 뜨게(P33 전 판)
      created = { oldBoard: !!oldSettings || anySession, favorites: v1.favorites };
    }
    const m = migrateLaunchers(v1);
    this.store.setMeta(META_KEY, m.list);
    if (m.report.keptBaseUrl.length || m.report.droppedCheckUrl.length) this.store.addEvent(null, 'launchers_migrated', m.report);
    return { ...(created || { oldBoard: true, favorites: m.list.favorites }), v2: m.report };
  }
  // P255: 옛 연결 참조(connection)는 읽을 때 뺀다(오류 없이 무시, 다음 저장 때 사라진다)
  data() { const d = this.store.getMeta(META_KEY) || { v: VERSION, items: [], favorites: [] }; const items = (Array.isArray(d.items) ? d.items : []).map(dropConnection); const ids = new Set(items.map((x) => x.id)); return { v: d.v, items, favorites: (d.favorites || []).filter((id) => ids.has(id)) }; }
  save(d) { this.store.setMeta(META_KEY, d); const out = this.list(); this.broadcast('launchers.updated', out); return out; }
  // 하네스별로 읽어 온 모델 목록(P72: codex)
  modelLists() { const out = {}; if (this.codexModels) { try { out.codex = this.codexModels.read(); } catch {} } if (this.agyModels) { try { out.agy = this.agyModels.read(); } catch {} } if (this.piModels) { try { out.pi = this.piModels.read(); } catch {} } if (this.omoModels) { try { out.omo = this.omoModels.read(); } catch {} } return out; } // P192: agy. P201: pi. P329: omo
  // P192: 뒤에서 받는 목록(AGY)을 잠깐 기다린다(atrium models). ms 안에 못 받으면 지금 아는 목록
  async freshModelLists(ms = 8000) { const w = [this.agyModels, this.piModels, this.omoModels].filter(Boolean).map((m) => m.refresh().catch(() => {})); if (w.length) await Promise.race([Promise.all(w), new Promise((r) => setTimeout(r, ms).unref?.())]); return this.modelLists(); } // P201: pi도
  harnesses() { return describeHarnesses(this.modelLists()); }
  // P97: warns는 경고 모두(모델 목록 밖, 실행 명령이 PATH에 없음). warn은 첫 경고(옛 창)
  // P330: contract는 하네스 계약 점검(칸 안내, 겹치는 추가 인자, 모르는 인자, 하네스 런처로 바꾸기 권함)
  previewOf(l, hs) { const warns = [modelWarning(l, hs), startWarning(l)].filter(Boolean); let contract = null; try { contract = launcherContract(l); } catch {} return { ...previewLauncher(l), ...(warns.length ? { warn: warns[0], warns } : {}), ...(contract ? { contract } : {}) }; }
  // P115: notices는 env에 평문 인증 값이 든 런처(설정 탭이 알린다)
  list() {
    const d = this.data();
    const hs = this.harnesses();
    return { launchers: d.items.map((l) => ({ ...l, favorite: d.favorites.includes(l.id), preview: this.previewOf(l, hs) })), favorites: d.favorites, harnesses: hs, notices: authNotices(d.items) };
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
  // P330: 칸으로 옮기기(action fields)·하네스 런처로 바꾸기(action harness). 저장하지 않고 바뀐 값과 그 미리보기를 돌려준다
  fix(p) {
    const d = this.data();
    const l = normalizeLauncher((p && p.launcher) || {}, { others: d.items });
    const r = fixLauncher(l, p && p.action === 'harness' ? 'harness' : 'fields');
    const n = normalizeLauncher({ ...r.launcher, id: l.id }, { others: d.items });
    return { launcher: n, moved: r.moved, preview: this.previewOf(n, this.harnesses()) };
  }
  // P330: 점검. 실행 명령에 --version·--help만 붙여 돌려(모델 호출 없음, 몇 초 제한) 설치 판과 판이 붙일 인자가 도움말에 있는지
  async check(p, { run } = {}) {
    const d = this.data();
    const l = normalizeLauncher((p && p.launcher) || {}, { others: d.items });
    const plan = checkPlanOf(l);
    if (!plan) throw err('bad_request', '점검할 에이전트 명령이 없습니다(셸·셸 명령 런처).', 'checkNone');
    const r = await runCheck({ words: plan.words, flags: plan.flags, ...(run ? { run } : {}) });
    this.log(`launcher check ${plan.words.join(' ')}: ${r.error || (r.ok ? 'ok' : 'missing ' + r.flags.filter((f) => !f.ok).map((f) => f.flag).join(' '))}`);
    return { ...r, harness: plan.harness, contract: plan.contract };
  }
  // P97: 붙여 넣은 명령줄을 호출자 칸으로 나눈다(저장하지 않는다). kinds: 터미널이 아는 에이전트 종류. except: 고치는 중인 호출자 ID(이름 겹침에서 뺀다)
  parse(p) {
    const d = this.data();
    const r = parseCommandLine(p && p.text, { kinds: (p && p.kinds) || [] });
    r.launcher.name = uniqueName(r.name, d.items.filter((x) => x.id !== (p && p.except)));
    let preview = null;
    try { const l = normalizeLauncher({ ...r.launcher, id: null }, { others: [] }); preview = this.previewOf(l, this.harnesses()); }
    catch (e) { preview = { error: { code: e.code, key: e.key, vars: e.vars, message: e.message } }; }
    return { launcher: r.launcher, recognized: r.recognized, preview };
  }
}

// ---------- P97: 명령줄 붙여 넣기 ----------
// 셸 글 → 문장들(낱말 배열). 작은따옴표·큰따옴표는 묶음이고 벗긴다(큰따옴표 안의 PowerShell ` 이스케이프는 다음 글자). 줄 끝의 이어 쓰기(\ ` ^)는 이어 붙인다.
// 줄바꿈, ;, &&, ||는 문장을 나눈다. 따옴표 안의 빈칸이 든 낱말은 spaced에 표시한다
export function shellStatements(text) {
  const src = String(text || '').replace(/\r\n?/g, '\n').replace(/[ \t]*[\\`^][ \t]*\n/g, ' ');
  const out = []; let cur = []; let word = null; let spaced = false; let q = null;
  const push = () => { if (word !== null) { cur.push(spaced ? { text: word, spaced: true } : word); word = null; spaced = false; } };
  const end = () => { push(); if (cur.length) out.push(cur); cur = []; };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === q) q = null;
      else if (q === '"' && c === '`' && i + 1 < src.length) word += src[++i];
      else { if (/\s/.test(c)) spaced = true; word += c; }
      continue;
    }
    if (c === "'" || c === '"') { q = c; if (word === null) word = ''; continue; }
    if (c === '\n' || c === ';') { end(); continue; }
    if ((c === '&' || c === '|') && src[i + 1] === c) { end(); i++; continue; }
    if (/\s/.test(c)) { push(); continue; }
    word = (word ?? '') + c;
  }
  end();
  return out;
}
const wordText = (w) => (typeof w === 'string' ? w : w.text);
const isSpaced = (w) => typeof w !== 'string' && !!w.spaced;
// 실행 파일 이름(경로·확장자를 뺀 소문자)
const exeBase = (w) => wordText(w).replace(/^.*[\\/]/, '').replace(/\.(exe|cmd|ps1|bat)$/i, '').toLowerCase();
const isClaudeWord = (w) => /^(claude|claude-code)$/.test(exeBase(w));
const hasDir = (w) => /[\\/]/.test(wordText(w));
// 값을 받는 판의 인자(빼면서 값도 함께 뺀다). --resume·-r·--worktree·-w는 값이 없어도 된다
const RESERVED_WITH_VALUE = new Set(['--settings', '--session-id', '--plugin-dir', '--append-system-prompt-file']);
const RESERVED_OPT_VALUE = new Set(['--resume', '-r', '--worktree', '-w']);
const PERMISSION_FROM_FLAG = { '--dangerously-skip-permissions': 'bypassPermissions' };

// 붙여 넣은 글 → { launcher(칸 값), name(제안 이름), recognized: { as: claude|codex|kind|command|empty, harness, board, startCommand, mapped: [{ arg, field }], dropped: [글], env: [이름], skipped: [문장], why? } }
// kinds: 터미널이 아는 에이전트 종류(claude, codex 밖은 추가 인자만 받는다)
export function parseCommandLine(text, { kinds = [] } = {}) {
  const stmts = shellStatements(text);
  const env = {}; const envNames = []; const skipped = []; let cmd = null;
  const setEnv = (k, v) => { if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) return false; env[k] = v; if (!envNames.includes(k)) envNames.push(k); return true; };
  for (const st of stmts) {
    let w = st;
    const first = wordText(w[0]);
    // PowerShell: $env:이름='값' 또는 $env:이름 = '값'
    const m = /^\$env:([A-Za-z_][A-Za-z0-9_]*)(=(.*))?$/i.exec(first);
    if (m) {
      const v = m[2] !== undefined ? m[3] : wordText(w[1] || '') === '=' ? w.slice(2).map(wordText).join(' ') : null;
      if (v !== null && setEnv(m[1], v)) continue;
    }
    // export·set 이름=값(bash, cmd)
    if (/^(export|set)$/i.test(first) && w.length > 1 && w.slice(1).every((x) => wordText(x).indexOf('=') > 0)) { for (const x of w.slice(1)) { const t = wordText(x); setEnv(t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)); } continue; }
    if (first === 'env') w = w.slice(1);
    // 이름=값 앞머리(bash)
    while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(wordText(w[0]))) { const t = wordText(w[0]); setEnv(t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)); w = w.slice(1); }
    if (!w.length) continue;
    if (cmd) skipped.push(cmd.map(wordText).join(' '));
    cmd = w;
  }
  const rec = { as: 'empty', harness: null, board: false, startCommand: '', mapped: [], dropped: [], env: envNames, skipped };
  const blank = { name: '', harness: 'claude', icon: '', model: '', effort: '', permissionMode: 'manual', args: '', env: {}, command: '', startCommand: '' };
  if (!cmd) return { launcher: { ...blank, env }, name: '', recognized: rec };
  const known = new Set(kinds.filter((k) => k !== 'claude' && k !== 'codex'));
  const contractKind = (w) => { const x = harnessOfCommand(wordText(w)); return x && x.harness !== 'claude' && x.startCommand !== 'omh' ? x.harness : null; }; // P330: dsh-tui·dst → dsh 등(계약 표)
  const isWrapper = (w) => !!wrapperInfo([wordText(w)]); // P309: 감싼 호출자(omh)는 그 계열(hermes)의 실행 명령
  const at = cmd.findIndex((w) => isClaudeWord(w) || exeBase(w) === 'codex' || known.has(exeBase(w)) || isWrapper(w) || !!contractKind(w));
  const asCommand = (why) => {
    const line = psLine(cmd.map(wordText));
    return { launcher: { ...blank, harness: 'command', permissionMode: '', command: line, env }, name: exeBase(cmd[0]) || 'command', recognized: { ...rec, as: 'command', harness: 'command', why } };
  };
  if (at < 0) return asCommand('unknown');
  const wrapper = cmd.slice(0, at);
  const agent = cmd[at];
  const rest = cmd.slice(at + 1);
  const wrapped = isWrapper(agent) ? wrapperInfo([wordText(agent)]) : null;
  const kind = isClaudeWord(agent) ? 'claude' : wrapped ? wrapped.family : contractKind(agent) || exeBase(agent);
  // P115: 래퍼 명령(실행 명령)은 모든 에이전트 하네스가 받는다
  if (wrapper.some(isSpaced) || isSpaced(agent)) return asCommand('quoted');
  const out = { model: '', effort: '', permissionMode: '', args: [] };
  const dropped = []; const mapped = [];
  for (let k = 0; k < rest.length; k++) {
    const a = wordText(rest[k]);
    const eq = a.startsWith('--') ? a.indexOf('=') : -1;
    const flag = eq > 0 ? a.slice(0, eq) : a;
    const inline = eq > 0 ? a.slice(eq + 1) : undefined;
    const value = () => (inline !== undefined ? inline : k + 1 < rest.length ? wordText(rest[++k]) : '');
    // 빈칸이 든 값은 추가 인자(빈칸으로 나눈다)에 넣을 수 없다. 바로 앞이 값을 받는 플래그였으면 함께 뺀다
    if (isSpaced(rest[k])) { const prev = out.args[out.args.length - 1]; if (prev && prev.startsWith('-') && !prev.includes('=')) { out.args.pop(); dropped.push(`${prev} "${a}"`); } else dropped.push(`"${a}"`); continue; }
    if (kind === 'claude') {
      if (flag === '--model') { out.model = value(); mapped.push({ arg: '--model', field: 'model' }); continue; }
      if (flag === '--effort') { out.effort = value(); mapped.push({ arg: '--effort', field: 'effort' }); continue; }
      if (flag === '--permission-mode') { out.permissionMode = value(); mapped.push({ arg: '--permission-mode', field: 'permissionMode' }); continue; }
      if (PERMISSION_FROM_FLAG[flag]) { out.permissionMode = PERMISSION_FROM_FLAG[flag]; mapped.push({ arg: flag, field: 'permissionMode' }); continue; }
      if (RESERVED_CLAUDE_ARGS.has(flag)) {
        let v = '';
        if (inline === undefined && (RESERVED_WITH_VALUE.has(flag) || (RESERVED_OPT_VALUE.has(flag) && k + 1 < rest.length && !wordText(rest[k + 1]).startsWith('-')))) v = ` ${wordText(rest[++k])}`;
        dropped.push(a + v); continue;
      }
    } else if (kind === 'omo') { // P329: omo --model <제공자/ID> · --thinking <수준>
      if (flag === '--model') { out.model = value(); mapped.push({ arg: '--model', field: 'model' }); continue; }
      if (flag === '--thinking') { const v = value(); const e = omoEffortOf(v); if (e) { out.effort = e; mapped.push({ arg: '--thinking', field: 'effort' }); } else dropped.push(`--thinking ${v}`); continue; }
    } else if (kind === 'codex') {
      if (flag === '-m' || flag === '--model') { out.model = value(); mapped.push({ arg: flag, field: 'model' }); continue; }
      if (/^-m./.test(a)) { out.model = a.slice(2); mapped.push({ arg: '-m', field: 'model' }); continue; }
    }
    out.args.push(a);
  }
  if (out.args.length) mapped.push({ arg: joinArgs(out.args), field: 'args' });
  let startCommand = ''; let agentPath = null;
  const exe = kind === 'claude' ? 'claude' : CONTRACTS[kind] && !wrapped ? CONTRACTS[kind].command : kind; // P330: dsh의 명령은 dsh-tui
  if (wrapper.length) startCommand = [...wrapper, agent].map(wordText).join(' ');
  else if (hasDir(agent) && wrapped) startCommand = exeBase(agent); // P309: 감싼 호출자를 경로로 주면 PATH의 그 이름으로(실행 명령 omh)
  else if (hasDir(agent)) agentPath = wordText(agent); // 경로로 준 명령은 PATH의 그 명령으로(이어 가기 명령의 첫 낱말은 명령 이름이어야 한다)
  else if (exeBase(agent) !== exe) startCommand = wordText(agent);
  if (startCommand.toLowerCase() === exe) startCommand = '';
  // 판이 정하는 인자(하네스 어댑터)는 뺀다
  if (kind !== 'claude') { const words = out.args; const kept = []; for (let i = 0; i < words.length; i++) { if (reservedArg(kind, [words[i], words[i + 1] || ''])) { dropped.push(words[i]); continue; } kept.push(words[i]); } out.args = kept; }
  const harness = kind;
  // P330: 칸과 겹치는 인자(모델·노력·승인)는 그 하네스 계약대로 칸으로 옮긴다(설정 탭의 "칸으로 옮기기"와 같은 결과)
  let fx = { model: out.model, effort: kind === 'claude' || kind === 'omo' ? out.effort : '', permissionMode: kind === 'claude' ? out.permissionMode || 'manual' : '', args: joinArgs(out.args) };
  if (kind !== 'claude' && harnessOf(kind)) {
    const mv = moveArgsToFields({ harness: kind, startCommand, ...fx }, { fields: harnessOf(kind).fields, split: splitArgs, join: joinArgs });
    fx = { model: mv.launcher.model, effort: mv.launcher.effort, permissionMode: mv.launcher.permissionMode, args: mv.launcher.args };
    for (const m of mv.moved) mapped.push({ arg: m.arg, field: m.field });
    if (mapped.length && mapped.some((m) => m.field === 'args')) { const i = mapped.findIndex((m) => m.field === 'args'); mapped.splice(i, 1); if (fx.args) mapped.push({ arg: fx.args, field: 'args' }); }
  }
  const label = kind === 'claude' ? 'Claude' : kind === 'codex' ? 'Codex' : kind;
  const name = [startCommand || (kind === 'claude' && !fx.model ? 'Claude Code' : wrapped ? wrapped.label : label), fx.model].filter(Boolean).join(' ');
  const launcher = { ...blank, harness, model: fx.model, effort: fx.effort, permissionMode: fx.permissionMode, args: fx.args, env: kind === 'claude' ? env : {}, startCommand };
  // P115: env의 ANTHROPIC_BASE_URL은 연결로 옮길 값이라 알린다(설정 탭에서 연결을 만들어 고른다)
  const baseUrl = kind === 'claude' && env.ANTHROPIC_BASE_URL ? env.ANTHROPIC_BASE_URL : null;
  // claude 밖은 환경 변수를 받지 않는다(터미널에 넘길 길이 없다): 있으면 명령 한 줄로
  if (kind !== 'claude' && envNames.length) return asCommand('envNotClaude');
  return { launcher, name, recognized: { ...rec, as: kind === 'claude' || kind === 'codex' ? kind : 'kind', harness, board: kind === 'claude', startCommand, mapped, dropped, ...(agentPath ? { agentPath } : {}), ...(baseUrl ? { baseUrl } : {}) } };
}
// 겹치지 않는 이름(대소문자 무시). 40자까지 자르고 겹치면 " 2", " 3"…
export function uniqueName(want, items = []) {
  const base = (String(want || '').trim() || 'Launcher').slice(0, NAME_MAX);
  const taken = new Set(items.map((x) => String(x.name).toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i < 100; i++) { const n = `${base.slice(0, NAME_MAX - 1 - String(i).length)} ${i}`; if (!taken.has(n.toLowerCase())) return n; }
  return base;
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
