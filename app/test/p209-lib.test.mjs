// P209 단위 시험: rig 판 표가 자리의 effort·model(표에 없는 칸)을 그대로 다시 쓴다. rig 상태 모양의 빈 값(null)은 더하지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tableFromDef, tableToSave, tableEdit } from '../src/renderer/lib/rig-setup.js';

test('P209 표: rig.json의 effort·model은 extra로 남고 저장 자료에 그대로', () => {
  const def = { seats: { main: { launcher: 'claude', session: 'keep', effort: 'medium' }, worker: { launcher: 'claude', session: 'fresh', effort: 'low', model: 'haiku' } }, flow: [], results: ['ok', 'failed'] };
  let tb = tableFromDef(def);
  assert.deepEqual(tb.seats.find((r) => r.name === 'worker').extra, { effort: 'low', model: 'haiku' });
  const key = tb.seats.find((r) => r.name === 'worker').key;
  tb = tableEdit(tb, 'seats', key, 'session', 'fresh');
  const out = tableToSave(tb);
  assert.equal(out.seats.main.effort, 'medium');
  assert.equal(out.seats.worker.effort, 'low'); assert.equal(out.seats.worker.model, 'haiku');
});

test('P209 표: rig 상태 모양(배열)의 effort·model null은 저장 자료에 넣지 않는다', () => {
  const st = { seats: [{ name: 'main', launcher: 'claude', session: 'keep', worktree: false, tools: null, may: [], maxLive: 1, guide: null, effort: null, model: null }, { name: 'worker', launcher: 'codex', session: 'fresh', worktree: false, tools: null, may: [], maxLive: 3, guide: null, effort: 'minimal', model: null }], flow: [], results: [] };
  const out = tableToSave(tableFromDef(st));
  assert.equal('effort' in out.seats.main, false); assert.equal('model' in out.seats.main, false);
  assert.equal(out.seats.worker.effort, 'minimal'); assert.equal('model' in out.seats.worker, false);
});
