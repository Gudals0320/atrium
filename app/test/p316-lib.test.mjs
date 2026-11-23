// P316 단위 시험: 설정 › 에이전트 › 할 일 정리 칸(lib/agents.js). 켬/끔·하네스 고르기(Claude Code·Codex)·모델·노력, 사전 두 벌.
import test from 'node:test';
import assert from 'node:assert/strict';
import { agentsOf, agentValueOf, optionsOf, FALLBACK_AGENTS } from '../src/renderer/lib/agents.js';
import { agentsTable, DEFAULTS } from '../../backend/src/settings.mjs';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

test('P316 할 일 정리 칸: 판 설정이 있으면 병합 다음에 켬/끔·하네스·모델·노력', () => {
  const list = agentsOf(agentsTable(), DEFAULTS);
  assert.deepEqual(list.map((a) => a.id), ['merge', 'todoTidy']);
  const t = list[1];
  assert.deepEqual(t.fields.map((f) => [f.field, f.value]), [['mode', 'on'], ['launcher', ''], ['kind', 'claude'], ['model', 'haiku'], ['effort', 'low']]); // P338: launcher(봇의 런처 ID)
  assert.deepEqual(t.fields[0].options, ['on', 'off'], '물어봄 없음');
  assert.deepEqual(t.fields[2].options, ['claude', 'codex'], '하네스는 고르기');
  assert.deepEqual(agentsOf(FALLBACK_AGENTS, DEFAULTS), list, '옛 판 표(창의 것)와 같다');
  assert.deepEqual(agentsOf(agentsTable(), { mergerMode: 'on' }).map((a) => a.id), ['merge'], '옛 판(할 일 정리 키 없음)에서는 숨김');
});

test('P316 할 일 정리 값 검사: 하네스는 목록 안, 모델은 꼴, 모르는 하네스는 기본으로 보임', () => {
  const f = Object.fromEntries(agentsOf(agentsTable(), { ...DEFAULTS, todoTidyKind: 'pi' })[1].fields.map((x) => [x.field, x]));
  assert.equal(f.kind.value, 'claude', '모르는 값은 기본으로');
  assert.deepEqual(agentValueOf(f.kind, 'codex'), { value: 'codex' });
  assert.deepEqual(agentValueOf(f.kind, 'pi'), { error: 'kind' });
  assert.deepEqual(agentValueOf(f.mode, 'ask'), { error: 'mode' });
  assert.deepEqual(agentValueOf(f.model, ''), { value: 'haiku' });
  assert.deepEqual(agentValueOf(f.model, 'sonnet'), { value: 'sonnet' });
  assert.equal(optionsOf({ field: 'kind' }), null, '병합처럼 목록 없는 하네스 칸은 글칸');
});

test('P316 사전: 할 일 정리 묶음이 두 사전에 같은 열쇠로', () => {
  const keys = (o, at = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, at + k + '.') : [at + k])).sort();
  assert.deepEqual(keys(ko.todoTidy), keys(en.todoTidy));
  for (const d of [ko, en]) {
    for (const k of ['name', 'desc', 'modeHint', 'modeNote', 'kindHint', 'modelHint', 'effortHint', 'perHour', 'perHourHint', 'perHourSet']) assert.ok(d.todoTidy[k], k);
    for (const m of ['on', 'off']) { assert.ok(d.todoTidy.modes[m]); assert.ok(d.todoTidy.modeSet[m]); }
    for (const h of ['claude', 'codex']) assert.ok(d.todoTidy.kinds[h]);
    for (const b of ['mode', 'kind', 'model', 'effort', 'key', 'perHour']) assert.ok(d.todoTidy.bad[b], b);
  }
});
