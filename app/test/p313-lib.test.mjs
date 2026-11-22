// P313 단위 시험: 설정 › 에이전트 탭(lib/agents.js). 보조 에이전트 표 → 칸, 옛 설정 키 그대로 읽힘, 옛 판(표 없음), 사전에 "합치기"가 남지 않음.
import test from 'node:test';
import assert from 'node:assert/strict';
import { agentsOf, agentValueOf, optionsOf, FALLBACK_AGENTS, AGENT_FIELDS, AGENT_PERMISSIONS, settingsTabOf } from '../src/renderer/lib/agents.js';
import { HELPER_AGENTS, agentsTable, SETTINGS, AGENT_FIELDS as BACK_FIELDS } from '../../backend/src/settings.mjs';
import { MERGER_DEFAULTS } from '../src/renderer/lib/merger.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const board = { mergerMode: 'on', mergerKind: 'codex', mergerModel: 'gpt-x', mergerEffort: 'high', mergerPermission: 'dontAsk' };

test('P313 판 표 → 칸: 병합 하나(켬/물어봄/끔·하네스·모델·노력·승인 방식 차례), 할 일 정리는 숨김', () => {
  const list = agentsOf(agentsTable(), board);
  assert.deepEqual(list.map((a) => a.id), ['merge']);
  const m = list[0];
  assert.equal(m.dict, 'merger');
  assert.deepEqual(m.fields.map((f) => f.field), ['mode', 'kind', 'model', 'effort', 'permission']);
  assert.deepEqual(m.fields.map((f) => f.key), ['mergerMode', 'mergerKind', 'mergerModel', 'mergerEffort', 'mergerPermission']);
  assert.deepEqual(m.fields.map((f) => f.value), ['on', 'codex', 'gpt-x', 'high', 'dontAsk']);
  assert.ok(!m.fields.find((f) => f.field === 'permission').options.includes('inherit'), 'inherit는 빈 값(맡긴 세션 따름)과 같아 목록에서 뺀다');
  assert.ok(HELPER_AGENTS.some((a) => a.id === 'todoTidy' && a.ready), 'P316: 할 일 정리는 켜졌다(판 설정에 그 키가 없으면 칸이 없다)');
});

test('P313 옛 설정 키(merger*) 그대로 읽힘: 기본값·inherit·모르는 값', () => {
  const m = agentsOf(agentsTable(), { mergerMode: 'ask' })[0];
  assert.deepEqual(m.fields.map((f) => f.field), ['mode'], '판에 없는 키의 칸은 그리지 않는다');
  const d = agentsOf(agentsTable(), { ...MERGER_DEFAULTS, mergerPermission: 'inherit', mergerEffort: 'weird' })[0];
  assert.equal(d.fields.find((f) => f.field === 'permission').value, '');
  assert.equal(d.fields.find((f) => f.field === 'effort').value, 'medium');
  assert.equal(d.fields.find((f) => f.field === 'model').value, 'claude-sonnet-5-5');
  assert.deepEqual(agentsOf(agentsTable(), {}), [], '병합 키가 하나도 없는 옛 판이면 탭이 없다');
  assert.deepEqual(agentsOf(agentsTable(), null), []);
});

test('P313 옛 판(표 없음)은 창의 FALLBACK_AGENTS: 판 표와 같다', () => {
  assert.deepEqual(agentsOf(null, board), agentsOf(agentsTable(), board));
  assert.deepEqual(agentsOf([], board), agentsOf(agentsTable(), board));
  const back = agentsTable(), front = FALLBACK_AGENTS;
  assert.deepEqual(front.map((a) => [a.id, a.dict, a.ready]), back.map((a) => [a.id, a.dict, a.ready]));
  for (let i = 0; i < back.length; i++) assert.deepEqual(front[i].fields.map((f) => [f.field, f.key, f.default]), back[i].fields.map((f) => [f.field, f.key, f.default]));
  assert.deepEqual(AGENT_FIELDS, BACK_FIELDS);
  for (const a of HELPER_AGENTS) for (const k of Object.values(a.keys)) assert.ok(SETTINGS[k], '표의 키는 설정에 있다: ' + k);
});

test('P313 새 보조 에이전트를 표에 더하면 같은 꼴의 칸이 생긴다', () => {
  const table = [...agentsTable(), { id: 'docs', dict: 'docsTidy', ready: true, fields: [{ field: 'model', key: 'docsModel', default: 'm1' }, { field: 'mode', key: 'docsMode', default: 'off', options: ['on', 'off'] }] }];
  const list = agentsOf(table, { ...board, docsMode: 'on' });
  assert.deepEqual(list.map((a) => a.id), ['merge', 'docs']);
  assert.deepEqual(list[1].fields.map((f) => [f.field, f.value]), [['mode', 'on']], '판에 없는 키(docsModel)는 빠지고 칸은 차례대로');
  assert.deepEqual(list[1].fields[0].options, ['on', 'off']);
});

test('P313 칸 값 검사', () => {
  const f = Object.fromEntries(agentsOf(agentsTable(), board)[0].fields.map((x) => [x.field, x]));
  assert.deepEqual(agentValueOf(f.mode, 'off'), { value: 'off' });
  assert.deepEqual(agentValueOf(f.mode, 'nope'), { error: 'mode' });
  assert.deepEqual(agentValueOf(f.kind, ' Codex '), { value: 'codex' });
  assert.deepEqual(agentValueOf(f.kind, ''), { value: 'claude' });
  assert.deepEqual(agentValueOf(f.kind, 'a b'), { error: 'kind' });
  assert.deepEqual(agentValueOf(f.model, ''), { value: 'claude-sonnet-5-5' });
  assert.deepEqual(agentValueOf(f.model, 'bad model'), { error: 'model' });
  assert.deepEqual(agentValueOf(f.effort, ''), { value: '' });
  assert.deepEqual(agentValueOf(f.permission, 'inherit'), { error: 'permission' });
  assert.deepEqual(agentValueOf(f.permission, ''), { value: '' });
  assert.deepEqual(optionsOf({ field: 'permission' }), AGENT_PERMISSIONS);
  for (const k of ['mode', 'kind', 'model', 'effort', 'permission']) { assert.ok(ko.merger.bad[k]); assert.ok(en.merger.bad[k]); }
});

test('P313 옛 탭 이름 merger → agents', () => {
  assert.equal(settingsTabOf('merger'), 'agents');
  assert.equal(settingsTabOf('launchers'), 'launchers');
  assert.equal(settingsTabOf(null), null);
});

test('P313 사전: 에이전트 탭·병합·칸 이름이 두 사전에, "합치기" 글이 남지 않음', () => {
  for (const d of [ko, en]) {
    assert.ok(d.agents.tab && d.agents.note && d.agents.effortNone && d.agents.permissionInherit);
    for (const k of AGENT_FIELDS) assert.ok(d.agents.field[k], k);
    for (const a of HELPER_AGENTS) { assert.ok(d[a.dict].name, a.dict); assert.ok(d[a.dict].desc, a.dict); }
    for (const k of ['kind', 'model', 'effort', 'permission']) assert.ok(d.merger[k + 'Hint'], k);
    assert.ok(d.merger.modeHint && d.merger.modeNote && d.merger.modeSet.on);
  }
  assert.equal(ko.agents.tab, '에이전트'); assert.equal(en.agents.tab, 'Agents');
  assert.equal(ko.merger.name, '병합'); assert.equal(en.merger.name, 'Merge');
  const walk = (o, at, out) => { for (const [k, v] of Object.entries(o)) { if (typeof v === 'string') { if (/합치기|합치는 중|합침/.test(v)) out.push(at + k + ': ' + v); } else if (v && typeof v === 'object') walk(v, at + k + '.', out); } return out; };
  assert.deepEqual(walk(ko, '', []), []);
  assert.ok(!/Merging/.test(en.merger.tab));
});

test('P313 판 설정 풀이와 판 알림 글에 "합치기"가 남지 않음', async () => {
  for (const [k, v] of Object.entries(SETTINGS)) assert.ok(!/합치기/.test(v.label || ''), k);
  const m = await import('../../backend/src/merger.mjs');
  assert.ok(!/합치기/.test(m.MERGE_CHILD_TAIL));
  assert.match(m.MERGE_CHILD_TAIL, /병합을 merger에게 맡긴다/);
});
