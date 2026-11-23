// P338: 설정 › 봇 탭의 자료(React 없는 순수 함수, 단위 시험 app/test/p338-lib.test.mjs).
// 봇 = 판이 스스로 띄워 쓰는 보조 에이전트(판 settings.mjs HELPER_AGENTS: 병합 merge, 할 일 정리 todoTidy). 칸 표와 값은 lib/agents.js agentsOf가 만든다.
// 런처 고르기: 봇은 하네스·모델·노력을 글자 칸으로 받지 않고 설정 › 런처의 런처(또는 하네스)를 고른다. 판 설정 키(merger*·todoTidy*)는 그대로라
//   런처를 고르면 그 런처의 하네스·모델·노력(병합 봇은 승인 방식도)을 그 봇의 키에 쓴다. 모델·노력 목록은 그 하네스 표(launchers.mjs HARNESSES,
//   P330 계약의 노력 값)가 준다. 그 하네스가 받지 않는 칸은 보이지 않는다.
import { agentsOf } from './agents.js';
import { AGENT_HARNESSES, harnessFields, harnessModels, harnessEfforts, orderedLaunchers } from './launchers.js';
import { PERMISSION_MODES } from './permission-modes.js';

export const BOT_STATES = ['off', 'idle', 'waiting', 'working'];

// 판 표 + 설정 → 봇 목록. 칸을 field 이름으로 찾게 f를 붙인다
export function botsOf(table, settings) {
  return agentsOf(table, settings).map((a) => ({ ...a, f: Object.fromEntries(a.fields.map((x) => [x.field, x])) }));
}
// 봇이 받는 하네스(할 일 정리: claude·codex로 정해짐). null = 에이전트 하네스 모두
export const allowedKinds = (bot) => (bot && bot.f.kind && Array.isArray(bot.f.kind.options) && bot.f.kind.options.length ? bot.f.kind.options : null);

// 고를 수 있는 런처: 에이전트 하네스(셸·직접 명령 밖)이고 봇이 받는 하네스인 것. 즐겨찾기 차례
export function launcherPicks(data, allowed = null) {
  if (!data || !Array.isArray(data.launchers)) return [];
  return orderedLaunchers(data).filter((l) => l && l.harness && l.harness !== 'shell' && l.harness !== 'command' && (!allowed || allowed.includes(l.harness)))
    .map((l) => ({ id: l.id, name: l.name, harness: l.harness, model: l.model || '', effort: l.effort || '', permissionMode: l.permissionMode || '' }));
}
// 고를 수 있는 하네스(런처 없이). 판 하네스 표의 에이전트 하네스 → 기본 종류 → 지금 값
export function harnessPicks(harnesses, allowed = null, current = '') {
  const named = (harnesses || []).map((h) => h.id).filter((id) => id !== 'shell' && id !== 'command');
  const out = [];
  for (const id of allowed || [...named, ...AGENT_HARNESSES]) if (!out.includes(id)) out.push(id);
  if (current && !out.includes(current)) out.push(current);
  return out;
}
const norm = (v) => String(v == null ? '' : v).trim();
// 지금 값과 맞는 런처(하네스·모델·노력이 같음, 모델·노력이 빈 런처는 봇의 기본값과 같다고 본다). 없으면 null
export function pickedLauncher(picks, bot) {
  if (!bot || !bot.f.kind) return null;
  const kind = bot.f.kind.value, model = bot.f.model ? norm(bot.f.model.value) : '', effort = bot.f.effort ? norm(bot.f.effort.value) : '';
  const dm = bot.f.model ? norm(bot.f.model.default) : '';
  for (const l of picks || []) {
    if (l.harness !== kind) continue;
    if (bot.f.model && norm(l.model || dm) !== model) continue;
    if (bot.f.effort && norm(l.effort) !== effort) continue;
    return l;
  }
  return null;
}
// 런처 하나를 고르면 쓸 값: [[설정 키, 값]]. 모델이 빈 런처는 봇의 기본 모델, 노력이 봇이 받지 않는 값이면 빈 값(넘기지 않음),
//   승인 방식(병합 봇)은 그 하네스가 승인 칸을 가질 때만
export function patchFromLauncher(bot, l, harnesses) {
  const out = [];
  if (!bot || !l) return out;
  if (bot.f.kind) out.push([bot.f.kind.key, l.harness]);
  if (bot.f.model) out.push([bot.f.model.key, norm(l.model) || bot.f.model.default]);
  if (bot.f.effort) { const ok = (bot.f.effort.options || []).includes(norm(l.effort)); out.push([bot.f.effort.key, ok ? norm(l.effort) : '']); }
  if (bot.f.permission && harnessFields(harnesses, l.harness).includes('permissionMode') && (bot.f.permission.options || []).includes(l.permissionMode)) out.push([bot.f.permission.key, l.permissionMode]);
  return out;
}
// 하네스만 고르면: 하네스와, 그 하네스가 모르는 모델이면 기본 모델로 되돌리기(목록이 있는 하네스만)
export function patchFromHarness(bot, kind, harnesses) {
  const out = [];
  if (!bot || !bot.f.kind) return out;
  out.push([bot.f.kind.key, kind]);
  if (bot.f.model) {
    const list = harnessModels(harnesses, kind);
    if (list.length && !list.includes(norm(bot.f.model.value))) out.push([bot.f.model.key, list.includes(bot.f.model.default) ? bot.f.model.default : list[0]]);
  }
  if (bot.f.effort) { const e = effortChoices(harnesses, kind, bot.f.effort.options); if (!e.list.includes(norm(bot.f.effort.value))) out.push([bot.f.effort.key, '']); }
  return out;
}
// 모델 칸: { show, list, free }. 하네스가 모델 칸을 받지 않으면 show false. 목록이 비면 글자 칸(free)
export function modelChoices(harnesses, kind, value = '') {
  const show = harnessFields(harnesses, kind).includes('model');
  const list = [...harnessModels(harnesses, kind)];
  const v = norm(value);
  if (show && list.length && v && !list.includes(v)) list.push(v);
  return { show, list, free: show && !list.length };
}
// 노력 칸: { show, list }. 하네스 노력 값(계약) 가운데 그 봇의 설정이 받는 값만(빈 값 = 넘기지 않음은 늘)
export function effortChoices(harnesses, kind, botOptions = ['', 'low', 'medium', 'high', 'xhigh', 'max']) {
  const show = harnessFields(harnesses, kind).includes('effort');
  const h = harnessEfforts(harnesses, kind);
  return { show, list: (botOptions || []).filter((o) => o === '' || h.includes(o)) };
}
// 승인 칸(병합 봇): 하네스가 승인 칸을 가질 때만
export const permissionShown = (harnesses, kind) => harnessFields(harnesses, kind).includes('permissionMode');
export const PERMISSIONS = ['', ...PERMISSION_MODES];

// 상태 줄: 판 bots.status → { state, parts: [{ key, vars }], go: 누르면 갈 세션 ID | null }. 판에 요약이 없으면(옛 판) 설정 값만으로 켬·끔
export function statusOf(id, st, settings = {}) {
  if (id === 'merge') {
    const m = st && st.merge;
    if (!m) return { state: settings.mergerMode === 'off' ? 'off' : 'idle', parts: [], go: null };
    const parts = [{ key: 'bots.today.merged', vars: { n: m.today.merged } }];
    if (m.today.failed) parts.push({ key: 'bots.today.failed', vars: { n: m.today.failed }, bad: true });
    if (m.open.queued) parts.push({ key: 'bots.today.queued', vars: { n: m.open.queued } });
    if (m.mergers.length) parts.push({ key: 'bots.today.sessions', vars: { names: m.mergers.map((x) => '@' + x.name).join(', ') } });
    return { state: m.state, parts, go: m.mergers.length ? m.mergers[0].sessionId : null };
  }
  if (id === 'todoTidy') {
    const x = st && st.todoTidy;
    if (!x) return { state: settings.todoTidyMode === 'off' ? 'off' : 'idle', parts: [], go: null };
    const parts = [{ key: 'bots.today.hour', vars: { n: x.hour, max: x.perHour } }, { key: 'bots.today.cards', vars: { n: x.today.cards } }];
    if (x.today.dropped) parts.push({ key: 'bots.today.dropped', vars: { n: x.today.dropped } });
    if (x.today.fallback) parts.push({ key: 'bots.today.fallback', vars: { n: x.today.fallback } });
    return { state: x.state, parts, go: null, capped: x.perHour > 0 && x.hour >= x.perHour };
  }
  return { state: 'idle', parts: [], go: null };
}

// ---- 병합 봇의 저장소별 표(.atrium/merge.json) ----
const BRANCH_RE = /^(?![-/.])(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._\/-]{1,200}(?<![/.])$/; // 판 merger.mjs와 같다
export const MERGE_WHERE = ['worktree', 'main'];
// 판 merger.configs + 워크스페이스 이름 → 표 줄(이름 차례)
export function mergeRows(configs, workspaces = []) {
  const list = (configs && Array.isArray(configs.workspaces)) ? configs.workspaces : [];
  const nameOf = (k) => { const w = (workspaces || []).find((x) => x.key === k); return w ? w.name : k; };
  return list.map((c) => ({ ...c, name: nameOf(c.workspace) })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
// 칸에 친 값 → { value } | { error }(사전 bots.bad.<error>)
export function mergeFieldOf(field, raw) {
  if (field === 'target') { const v = norm(raw); return !v || BRANCH_RE.test(v) ? { value: v } : { error: 'target' }; }
  if (field === 'where') return MERGE_WHERE.includes(raw) ? { value: raw } : { error: 'where' };
  if (field === 'push') return typeof raw === 'boolean' ? { value: raw } : { error: 'push' };
  if (field === 'guide') { const v = norm(raw).split('\\').join('/'); return !v || (!/^([A-Za-z]:|\/)/.test(v) && !v.split('/').includes('..')) ? { value: v } : { error: 'guide' }; }
  return { error: 'key' };
}
