// P186 단위 시험: 세션 맵 미리 보기의 최근 훅 판정과 도구 실행(판 API rig.recent, rig-flow.mjs recentOf). 진짜 저장소.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { rigFlowHandlers, recentOf } from '../src/rig-flow.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p186-'));

test('recentOf: 한 세션의 최근 훅 판정과 도구 실행, 최근 것부터, 다른 세션은 빠진다', () => {
  const store = new Store(path.join(tmp(), 'board.db'));
  for (let i = 0; i < 7; i++) store.insertHookRun({ t: 1000 + i, workspaceKey: 'w', at: 'deliver', hookIndex: 0, argv: ['node', '.atrium/hooks/x.mjs', `--n=${i}`, 'more'], decision: i === 6 ? 'reject' : 'pass', reason: i === 6 ? 'too long' : null, sessionId: 'A', ms: 12 });
  store.insertHookRun({ t: 2000, workspaceKey: 'w', at: 'deliver', hookIndex: 0, argv: ['node'], decision: 'pass', sessionId: 'B' });
  store.insertToolRun({ id: 't1', sessionId: 'A', workspaceKey: 'w', tool: 'build', argv: ['npm', 'run', 'build'], args: [], status: 'done', exitCode: 0, startedAt: 10, endedAt: 20 });
  store.insertToolRun({ id: 't2', sessionId: 'A', workspaceKey: 'w', tool: 'test', argv: ['npm', 'test'], args: ['--x'], status: 'failed', exitCode: 1, startedAt: 30, endedAt: 50 });
  const r = recentOf(store, 'A', 5);
  assert.equal(r.hooks.length, 5);
  assert.equal(r.hooks[0].decision, 'reject');
  assert.equal(r.hooks[0].reason, 'too long');
  assert.equal(r.hooks[0].run, 'node .atrium/hooks/x.mjs --n=6'); // 앞 셋만
  assert.deepEqual(r.tools.map((x) => x.tool), ['test', 'build']);
  assert.equal(r.tools[0].exitCode, 1);
  const none = recentOf(store, 'C', 5);
  assert.deepEqual([none.hooks, none.tools], [[], []]);
});

test('rig.recent 판 API: session이 필요하고, 기기 토큰도 볼 수 있다(보기만), limit은 1~20', () => {
  const store = new Store(path.join(tmp(), 'board.db'));
  for (let i = 0; i < 30; i++) store.insertHookRun({ t: i, at: 'deliver', hookIndex: 0, argv: ['node'], decision: 'pass', sessionId: 'S1' });
  const b = { store, resolve: (r) => { if (r === 'a' || r === 'S1') return { sessionId: 'S1', name: 'a' }; throw Object.assign(new Error('no'), { code: 'not_found' }); } };
  const h = rigFlowHandlers(b);
  assert.throws(() => h['rig.recent']({}), (e) => e.code === 'bad_request');
  assert.equal(h['rig.recent']({ session: 'a' }, { auth: { kind: 'device' } }).hooks.length, 5);
  assert.equal(h['rig.recent']({ session: 'a', limit: 99 }).hooks.length, 20);
  assert.throws(() => h['rig.recent']({ session: 'zz' }), (e) => e.code === 'not_found');
});
