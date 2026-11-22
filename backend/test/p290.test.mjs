// P290: merger가 닫힐 때 판이 부모별로 합치기 정리 알림을 하나씩 보낸다(다시 보내지 않음, 판이 죽어 정리 없이 사라진 merger의 남은 것)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Store } from '../src/store.mjs';
import { Merger, mergeSummaryText, gainOf, reviewOf, devBuildOf, childDoneOf, mergeJobText } from '../src/merger.mjs';

const SET = { mergerMode: 'on', mergerKind: 'claude', mergerModel: 'claude-sonnet-5-5', mergerEffort: 'medium' };
const K = [{ kind: 'claude', installed: true }];

function board(dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p290-'))) {
  const store = new Store(path.join(dir, 'board.db'));
  const adapter = Object.assign(new EventEmitter(), { connected: true, agentKinds: async () => K });
  const sent = []; const logs = [];
  const b = {
    store, adapter, sessions: new Map(), log: (m) => logs.push(m), api: { broadcast: () => {} },
    queue: { enqueue: (sid, text) => { const d = { deliveryId: 'd' + sent.length, sessionId: sid, text }; sent.push(d); return d; } },
    docs: { doneLines: (p) => (p.name === 'lead-a' ? ['[Atrium 보드] 문서: 꼬리'] : []) },
    async spawn(p) { const s = { sessionId: crypto.randomUUID(), name: p.name, kind: p.kind, cwd: p.cwd }; b.sessions.set(s.sessionId, s); return { sessionId: s.sessionId }; },
    async kill({ session }) { b.sessions.delete(session); return { after: { archived: true } }; },
  };
  for (const n of ['lead-a', 'lead-b']) b.sessions.set(n + '-id', { sessionId: n + '-id', name: n });
  const units = { queued: new Set(), nameOf: (id) => (b.sessions.get(id) || {}).name || id, dispatch: () => ({}), pump: () => null };
  const m = new Merger(b, units, { settings: () => SET, kindsWaitMs: 100, recoverDelayMs: 10 });
  const key = 'ws1|dev';
  const job = (from, child, gain) => {
    const meta = { key, ws: 'ws1', root: dir.split(path.sep).join('/'), target: 'dev', child, childId: child + '-id', tip: 'abc' };
    const u = { id: 'u' + crypto.randomBytes(3).toString('hex'), from, to: '', origin: 'merge', spec: mergeJobText({ ...meta, parent: from, branch: 'wt-' + child, mergerWorktree: 'x', where: 'worktree', push: false, doneText: 'p: 브랜치 wt-' + child + '; 시험 통과; 사용자가 얻는 것 ' + gain + '; 기록 r.md' }), status: 'open', createdAt: Date.now(), source: null, meta };
    store.insertUnit(u); return u;
  };
  const close = (mm, s, u, result, text, hash = 'f00dbeef1234') => {
    const r = mm.onMergeDone(s, store.getUnit(u.id), result, text, result === 'ok' ? { hash, contains: true } : null);
    store.updateUnit(u.id, { status: r.result === 'failed' ? 'failed' : 'done', closedAt: Date.now() });
    return r;
  };
  return { dir, b, m, store, sent, logs, key, job, close, stop: () => store.close() };
}

test('P290 순수: 줄 만들기', () => {
  assert.equal(gainOf('a; 사용자가 얻는 것 merger 정리 알림이 온다; 기록 x'), 'merger 정리 알림이 온다');
  assert.equal(gainOf('없음'), null);
  assert.equal(reviewOf('합침 abc\n검토 experiments/p290/review.md, dev.70'), 'experiments/p290/review.md');
  assert.equal(devBuildOf('검토 experiments/p290/review.md, dev.70'), 'dev.70');
  assert.equal(childDoneOf('머리\n\n## @w1의 done 글\n본문'), '본문');
  const t = mergeSummaryText({ merger: 'merger-x', units: [{ status: 'failed', meta: { child: 'w2' } }], extra: ['꼬리'] });
  assert.equal(t, '[Atrium 보드] 병합 정리: @merger-x가 닫히기 전에 합친 것 0개, 실패 1개\n- @w2: 실패(이미 알림)\n\n꼬리');
});

test('P290 두 부모의 일 셋 → idle로 닫힘에 부모마다 알림 하나, 다시 보내지 않음', async () => {
  const x = board();
  try {
    const a1 = x.job('lead-a-id', 'w1', '창에 버튼'); const a2 = x.job('lead-a-id', 'w2', '휴대폰 탭'); const b1 = x.job('lead-b-id', 'w3', '빠른 시험');
    const s = await x.m.ensure(x.key);
    assert.ok(s);
    x.close(x.m, s, a1, 'ok', '합침 f00dbeef1 → dev\n검토 experiments/p1/review.md, dev.70');
    x.close(x.m, s, a2, 'failed', '못 합침: 충돌');
    x.close(x.m, s, b1, 'ok', '합침 cafe → dev\n검토 experiments/p3/review.md, dev.71', 'cafe00001111');
    assert.equal(x.sent.length, 0, '닫히기 전에는 보내지 않는다');
    const r = await x.m.lifecycle(s);
    assert.equal(r.why, 'idle');
    assert.equal(x.sent.length, 2, '부모마다 하나');
    const toA = x.sent.find((d) => d.sessionId === 'lead-a-id'); const toB = x.sent.find((d) => d.sessionId === 'lead-b-id');
    assert.equal(toA.text, [
      '[Atrium 보드] 병합 정리: @' + s.name + '가 닫히기 전에 합친 것 1개, 실패 1개',
      '- @w1: ok, 합침 f00dbeef1 → dev · dev.70 · 사용자가 얻는 것: 창에 버튼 · 검토 experiments/p1/review.md',
      '- @w2: 실패(이미 알림)',
      '', '[Atrium 보드] 문서: 꼬리'].join('\n'));
    assert.equal(toB.text, '[Atrium 보드] 병합 정리: @' + s.name + '가 닫히기 전에 합친 것 1개\n- @w3: ok, 합침 cafe00001 → dev · dev.71 · 사용자가 얻는 것: 빠른 시험 · 검토 experiments/p3/review.md');
    assert.equal(x.store.getUnit(a1.id).meta.summary, 'sent');
    assert.deepEqual(x.m.summarize(x.key, 'again', 'test'), [], '다시 보내지 않는다');
    await x.m.recover('test');
    assert.equal(x.sent.length, 2);
  } finally { x.stop(); }
});

test('P290 exited → 알림, 판이 죽어 정리 없이 사라진 merger → recover 또는 다음 merger 닫힘에 남은 것', async () => {
  const x = board();
  try {
    const a1 = x.job('lead-a-id', 'w1', '하나');
    const s = await x.m.ensure(x.key);
    x.close(x.m, s, a1, 'ok', '합침 1');
    await x.m.retire(s, 'exited');
    assert.equal(x.sent.length, 1);
    assert.match(x.sent[0].text, /합친 것 1개\n- @w1: ok, 합침 f00dbeef1 → dev · 사용자가 얻는 것: 하나/);

    const b2 = x.job('lead-b-id', 'w5', '둘');
    const s2 = await x.m.ensure(x.key);
    x.close(x.m, s2, b2, 'failed', '결정 필요: 둘 중 하나');
    x.b.sessions.delete(s2.sessionId); // 판이 죽었다(정리 없이 사라짐)
    const mk = () => new Merger(x.b, { queued: new Set(), nameOf: (id) => id, dispatch: () => ({}), pump: () => null }, { settings: () => SET, kindsWaitMs: 100, recoverDelayMs: 10 });
    const m2 = mk();
    await m2.recover('restart');
    assert.equal(x.sent.length, 2);
    assert.equal(x.sent[1].sessionId, 'lead-b-id');
    assert.equal(x.sent[1].text, '[Atrium 보드] 병합 정리: @' + s2.name + '가 닫히기 전에 합친 것 0개, 실패 1개\n- @w5: 실패(이미 알림)');

    const a3 = x.job('lead-a-id', 'w6', '셋'); const s3 = await m2.ensure(x.key);
    x.close(m2, s3, a3, 'ok', '합침');
    x.b.sessions.delete(s3.sessionId); // 다시 사라짐, recover는 아직
    const a4 = x.job('lead-a-id', 'w7', '넷'); const s4 = await m2.ensure(x.key);
    x.close(m2, s4, a4, 'ok', '합침');
    await m2.lifecycle(s4);
    assert.equal(x.sent.length, 3);
    assert.match(x.sent[2].text, /합친 것 2개\n- @w6: ok.*\n- @w7: ok/);
  } finally { x.stop(); }
});

test('P290 사람이 닫음(onClosing), 닫힌 부모는 보내지 않고 dropped', async () => {
  const x = board();
  try {
    const a1 = x.job('lead-a-id', 'w1', '하나'); const g = x.job('gone-id', 'w2', '둘');
    const s = await x.m.ensure(x.key);
    x.close(x.m, s, a1, 'ok', '합침'); x.close(x.m, s, g, 'ok', '합침');
    x.m.onClosing(s);
    assert.equal(x.sent.length, 1);
    assert.equal(x.store.getUnit(g.id).meta.summary, 'dropped');
  } finally { x.stop(); }
});
