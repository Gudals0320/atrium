// P313: 설정 › 에이전트 탭의 자료(React 없는 순수 함수, 단위 시험 app/test/p313-lib.test.mjs).
// 판(settings.mjs HELPER_AGENTS → settings.get의 agents)이 보조 에이전트 표를 준다: 에이전트마다 id, 사전 묶음(dict), ready, 칸 [{ field, key, default, options }].
// 창은 그 표를 보고 에이전트마다 같은 꼴의 칸(켬/물어봄/끔·하네스 종류·모델·노력·승인 방식 + 그만의 칸)을 그린다(Agents.jsx).
// 표를 주지 않는 옛 판이면 아래 FALLBACK_AGENTS(지금의 병합 하나)로 그린다. 설정 키(merger*)와 .atrium/merge.json은 그대로다(호환).
import { PERMISSION_MODES } from './permission-modes.js';

export const AGENT_FIELDS = ['mode', 'launcher', 'kind', 'model', 'effort', 'permission']; // 칸 차례(판 settings.mjs AGENT_FIELDS와 같다). P338: launcher(봇이 쓰는 런처 ID)
export const AGENT_MODES = ['on', 'ask', 'off'];
export const AGENT_EFFORTS = ['', 'low', 'medium', 'high', 'xhigh', 'max']; // 빈 값: 넘기지 않음
export const AGENT_PERMISSIONS = ['', ...PERMISSION_MODES]; // 빈 값: 맡긴 세션 따름(판의 inherit도 빈 값으로 보인다)
// 판 설정 schema와 같은 꼴 검사. 창에서 미리 걸러 잘못된 값을 보내지 않는다
const KIND_RE = /^[a-z][a-z0-9_-]{0,39}$/;
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:\/\[\]-]{0,79}$/;
const LAUNCHER_RE = /^[A-Za-z0-9_-]{0,40}$/; // P338: 봇의 런처 ID(빈 값 = 런처 없이)

// 표를 주지 않는 옛 판(P312 이전)에서 쓰는 표. 판 HELPER_AGENTS의 병합 줄과 같다
export const FALLBACK_AGENTS = [
  { id: 'merge', dict: 'merger', ready: true, fields: [
    { field: 'mode', key: 'mergerMode', default: 'ask', options: AGENT_MODES },
    { field: 'launcher', key: 'mergerLauncher', default: '' }, // P338: 옛 판에는 키가 없어 칸이 빠진다
    { field: 'kind', key: 'mergerKind', default: 'claude' },
    { field: 'model', key: 'mergerModel', default: 'claude-sonnet-5-5' },
    { field: 'effort', key: 'mergerEffort', default: 'medium', options: AGENT_EFFORTS },
    { field: 'permission', key: 'mergerPermission', default: '', options: ['', 'inherit', ...PERMISSION_MODES] },
  ] },
  { id: 'todoTidy', dict: 'todoTidy', ready: true, fields: [ // P316: 할 일 정리(판 todoTidy*). 옛 판에는 그 키가 없어 칸이 그려지지 않는다
    { field: 'mode', key: 'todoTidyMode', default: 'on', options: ['on', 'off'] },
    { field: 'launcher', key: 'todoTidyLauncher', default: '' },
    { field: 'kind', key: 'todoTidyKind', default: 'claude', options: ['claude', 'codex'] },
    { field: 'model', key: 'todoTidyModel', default: 'haiku' },
    { field: 'effort', key: 'todoTidyEffort', default: 'low', options: AGENT_EFFORTS },
  ] },
];

// 칸 하나가 고를 값 목록(창 쪽). 판이 준 options는 쓰되 permission의 inherit는 빈 값과 같아 뺀다
export function optionsOf(f) {
  if (f.field === 'mode') return Array.isArray(f.options) && f.options.length ? f.options : AGENT_MODES;
  if (f.field === 'effort') return Array.isArray(f.options) && f.options.length ? f.options : AGENT_EFFORTS;
  if (f.field === 'permission') return (Array.isArray(f.options) && f.options.length ? f.options : AGENT_PERMISSIONS).filter((x) => x !== 'inherit');
  if (f.field === 'kind' && Array.isArray(f.options) && f.options.length) return f.options; // P316: 고를 하네스가 정해진 에이전트(할 일 정리: claude·codex)
  return null;
}

// 판 표 + 설정 값 → 그릴 칸. 숨길 것: ready가 아님, 판 설정에 그 키가 없음(옛 판). 칸 값은 고를 값이 아니면 기본값으로
export function agentsOf(table, settings) {
  const list = Array.isArray(table) && table.length ? table : FALLBACK_AGENTS;
  if (!settings) return [];
  const out = [];
  for (const a of list) {
    if (!a || !a.id || !a.ready) continue;
    const fields = (a.fields || []).filter((f) => f && AGENT_FIELDS.includes(f.field) && f.key in settings)
      .sort((x, y) => AGENT_FIELDS.indexOf(x.field) - AGENT_FIELDS.indexOf(y.field))
      .map((f) => {
        const opts = optionsOf(f);
        let value = settings[f.key] == null ? f.default : settings[f.key];
        if (f.field === 'permission' && value === 'inherit') value = '';
        if (opts && !opts.includes(value)) value = opts.includes(f.default) ? f.default : opts[0];
        return { ...f, value, ...(opts ? { options: opts } : {}) };
      });
    if (!fields.length) continue; // 판에 그 에이전트의 키가 하나도 없다(옛 판)
    out.push({ id: a.id, dict: a.dict || a.id, fields });
  }
  return out;
}

// 칸에 친 값 → 보낼 값 또는 { error }(사전 <dict>.bad.<error>). 빈 칸(종류·모델)은 기본으로 되돌린다
export function agentValueOf(f, raw) {
  const v = String(raw == null ? '' : raw).trim();
  const opts = optionsOf(f);
  if (opts) return opts.includes(v) ? { value: v } : { error: f.field };
  if (f.field === 'kind') { const x = (v || f.default || '').toLowerCase(); return KIND_RE.test(x) ? { value: x } : { error: 'kind' }; }
  if (f.field === 'model') { const x = v || f.default || ''; return MODEL_RE.test(x) ? { value: x } : { error: 'model' }; }
  if (f.field === 'launcher') return LAUNCHER_RE.test(v) ? { value: v } : { error: 'key' };
  return { error: 'key' };
}

// 옛 탭 이름(P268 "merger" 탭)으로 연 곳도 에이전트 탭으로
export const settingsTabOf = (tab) => (tab === 'merger' ? 'agents' : tab);
