// P338 단위 시험: 설정 › 봇 탭의 읽기 전용 요약(bots.status)과 저장소별 병합 설정(.atrium/merge.json) 읽기·쓰기.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { readMergeConfig } from '../src/merger.mjs';
import { dayStart, mergeToday, mergeState, tidyToday, patchMergeConfig, mergeConfigJson, writeMergeConfig, botsHandlers } from '../src/bots.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p338-'));

test('dayStart는 그 날 0시', () => {
  const t = new Date(2026, 10, 23, 15, 30).getTime();
  assert.equal(dayStart(t), new Date(2026, 10, 23).getTime());
});

test('오늘 병합 수: 합침·실패를 세고 치우기 일은 따로', () => {
  const r = mergeToday([{ status: 'done', meta: {} }, { status: 'done' }, { status: 'failed', meta: {} }, { status: 'done', meta: { discard: true } }, null]);
  assert.deepEqual(r, { merged: 2, failed: 1, discarded: 1 });
});

test('병합 봇 상태: 끔 > 합치는 중 > 기다림 > 쉼', () => {
  assert.equal(mergeState({ mode: 'off', jobs: [{ state: 'merging' }] }), 'off');
  assert.equal(mergeState({ mode: 'on', jobs: [{ state: 'queued' }, { state: 'merging' }] }), 'working');
  assert.equal(mergeState({ mode: 'ask', jobs: [{ state: 'queued' }] }), 'waiting');
  assert.equal(mergeState({ mode: 'on', jobs: [] }), 'idle');
});

test('할 일 정리 오늘: 부른 수, 카드, 버린 수, 규칙으로 물러섬', () => {
  const r = tidyToday([{ data: { cards: 2 } }, { data: { cards: 0, dropped: 1 } }, { data: { cards: null, fallback: 'timeout' } }]);
  assert.deepEqual(r, { calls: 3, cards: 2, dropped: 1, fallback: 1 });
});

test('merge.json 칸 고치기: 확인 규칙과 기본값 빼기', () => {
  const base = { target: null, where: 'worktree', push: false, guide: null };
  assert.deepEqual(patchMergeConfig(base, { target: 'dev', push: true }), { target: 'dev', where: 'worktree', push: true, guide: null });
  assert.deepEqual(patchMergeConfig({ ...base, target: 'dev' }, { target: '' }).target, null);
  assert.equal(patchMergeConfig(base, { guide: 'docs\\merge.md' }).guide, 'docs/merge.md');
  assert.throws(() => patchMergeConfig(base, { target: '../x' }), /브랜치/);
  assert.throws(() => patchMergeConfig(base, { where: 'elsewhere' }), /where/);
  assert.throws(() => patchMergeConfig(base, { push: 'yes' }), /push/);
  assert.throws(() => patchMergeConfig(base, { guide: '../out.md' }), /guide/);
  assert.throws(() => patchMergeConfig(base, { other: 1 }), /모르는 칸/);
  assert.deepEqual(mergeConfigJson({ target: null, where: 'worktree', push: false, guide: null }), {});
  assert.deepEqual(mergeConfigJson({ target: 'dev', where: 'main', push: true, guide: 'g.md' }), { target: 'dev', where: 'main', push: true, guide: 'g.md' });
});

test('merge.json 쓰기: 파일을 만들고 모르는 칸은 남기며 readMergeConfig가 같은 값을 읽는다', () => {
  const root = tmp();
  let r = writeMergeConfig(root, { target: 'dev', where: 'main' });
  assert.deepEqual(r.config, { target: 'dev', where: 'main', push: false, guide: null });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, '.atrium', 'merge.json'), 'utf8')), { target: 'dev', where: 'main' });
  fs.writeFileSync(path.join(root, '.atrium', 'merge.json'), JSON.stringify({ target: 'dev', note: 'keep' }));
  r = writeMergeConfig(root, { push: true });
  const j = JSON.parse(fs.readFileSync(path.join(root, '.atrium', 'merge.json'), 'utf8'));
  assert.deepEqual(j, { note: 'keep', target: 'dev', push: true });
  assert.equal(readMergeConfig(root).config.push, true);
  assert.throws(() => writeMergeConfig(path.join(root, 'none'), { push: true }), /폴더/);
});

test('bots.status·merger.configs·merger.config.set: 판 자료로 요약하고 저장소 파일에 쓴다', async () => {
  const dir = tmp();
  const store = new Store(path.join(dir, 'board.db'));
  const root = path.join(dir, 'repo'); fs.mkdirSync(root);
  const now = Date.now();
  // 오늘 닫힌 합치기 일 둘(합침, 실패), 어제 것 하나
  store.insertUnit({ id: 'u1', from: 'a', to: 'm', origin: 'merge', spec: 's', status: 'done', createdAt: now - 1000, closedAt: now - 500, meta: {} });
  store.insertUnit({ id: 'u2', from: 'a', to: 'm', origin: 'merge', spec: 's', status: 'failed', createdAt: now - 1000, closedAt: now - 400, meta: {} });
  store.insertUnit({ id: 'u3', from: 'a', to: 'm', origin: 'merge', spec: 's', status: 'done', createdAt: now - 3 * 86400_000, closedAt: now - 2 * 86400_000, meta: {} });
  store.addEvent('s1', 'decision_tidy', { cards: 2, dropped: 1 }, now - 100);
  store.addEvent('s1', 'decision_tidy', { cards: 1 }, now - 2 * 86400_000);
  const set = { mergerMode: 'on', todoTidyMode: 'on', todoTidyPerHour: 30, autoDecisions: true };
  const ws = { key: 'w1', root };
  const b = {
    store: Object.assign(Object.create(store), { getWorkspace: (k) => (k === 'w1' ? ws : null), workspaces: () => [ws, { key: 'w2', root: null }] }),
    features: { settings: { get: () => set } },
    merger: { status: () => ({ mergers: [{ name: 'merger-x', sessionId: 'm', open: true, workspace: 'w1', target: 'dev', jobs: 2, jobsMax: 5 }], jobs: [{ state: 'merging' }], problem: null }), meta: () => ({ w1: 'on' }), changed: () => {} },
    todoTidy: { conf: () => ({ on: true, perHour: 30 }), calls: [now - 10, now - 4000_000], busy: 0 },
    resolveWorkspace: async (k) => ({ key: k }),
  };
  const h = botsHandlers(b);
  const s = h['bots.status']();
  assert.equal(s.merge.state, 'working');
  assert.deepEqual(s.merge.today, { merged: 1, failed: 1, discarded: 0 });
  assert.equal(s.merge.mergers[0].name, 'merger-x');
  assert.equal(s.todoTidy.hour, 1);
  assert.equal(s.todoTidy.state, 'idle');
  assert.equal(s.todoTidy.today.cards, 2);
  assert.equal(s.todoTidy.today.dropped, 1);
  const c = h['merger.configs']();
  assert.equal(c.workspaces.length, 1);
  assert.equal(c.workspaces[0].answer, 'on');
  assert.equal(c.workspaces[0].where, 'worktree');
  const w = await h['merger.config.set']({ workspace: 'w1', patch: { target: 'dev' } });
  assert.equal(w.target, 'dev');
  assert.equal(readMergeConfig(root).config.target, 'dev');
  set.todoTidyMode = 'off'; b.todoTidy.conf = () => ({ on: false, perHour: 30 });
  assert.equal(h['bots.status']().todoTidy.state, 'off');
  store.close && store.close();
});
