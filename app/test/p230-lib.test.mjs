// P230 단위 시험(창): rig2-design 11.12 — 고리 카드와 지금 돌리기 답 알림, 정기 점검을 저장소가 아닌 곳에서 고르면 경고, 막힌 fresh 옆 까닭,
// 관리자 없는 rig의 상한 카드(제목·단추 셋), 두 사전의 새 글.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkNoRepo, freshBlocked, wizardInit, wizardApplyShortcut, wizardSet } from '../src/renderer/lib/rig-setup.js';
import { loopCardView, canRunNow, runToast } from '../src/renderer/lib/rig-loop-card.js';
import { shortcutAnswers } from '../../backend/src/rig-presets.mjs';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const get = (o, k) => k.split('.').reduce((x, p) => (x == null ? x : x[p]), o);

test('P230 정기 점검 경고: 바로가기 check를 고르고 워크스페이스가 git 저장소가 아닐 때만(두 사전 "git 저장소가 없다")', () => {
  const a = shortcutAnswers('check');
  assert.equal(checkNoRepo(a, 'norepo'), true);
  assert.equal(checkNoRepo(a, 'ok'), false);
  assert.equal(checkNoRepo(a, 'nocommit'), false);
  assert.equal(checkNoRepo(a, undefined), false, '모르면 경고하지 않는다');
  assert.equal(checkNoRepo(shortcutAnswers('grow'), 'norepo'), false);
  assert.equal(checkNoRepo(null, 'norepo'), false);
  // 대화상자에서 바로가기를 누르면
  let w = wizardInit({ defaultLauncher: 'l1', status: { state: 'none' }, defaults: shortcutAnswers('check') });
  w = wizardApplyShortcut(w, { id: 'check', answers: shortcutAnswers('check') });
  assert.equal(checkNoRepo(w.answers, 'norepo'), true);
  assert.match(en.rigP230.noRepo, /no git repository to check/);
  assert.match(ko.rigP230.noRepo, /점검할 git 저장소가 없습니다/);
  assert.match(read('RigSetup.jsx'), /checkNoRepo\(a, git\)/);
});

test('P230 fresh 까닭: 요청 계기면 fresh가 막히고 그 옆에 까닭(두 사전)', () => {
  let w = wizardInit({ defaultLauncher: 'l1', status: { state: 'none' } });
  w = wizardSet(w, 'trigger', 'request');
  assert.equal(freshBlocked(w.answers), true); assert.equal(w.answers.session, 'keep');
  w = wizardSet(w, 'trigger', 'every');
  assert.equal(freshBlocked(w.answers), false);
  assert.equal(ko.rigP230.freshWhy, '요청으로 도는 고리는 맥락을 이어 가는 자리(keep)만 됩니다.');
  assert.match(en.rigP230.freshWhy, /requests can only use a seat that keeps its context \(keep\)/);
  assert.match(read('RigSetup.jsx'), /freshBlocked\(a\) && <span className="mt-rigq-why" data-role="rig-fresh-why"/);
});

test('P230 고리 카드: every 고리(rig 2 정의)만 지금 돌리기, 계기·상태·다음 시각·마지막 회', () => {
  const every = { name: 'check', kind: 'work', implicit: false, trigger: { type: 'every', every: '7d' }, entry: 'checker', state: 'waiting', nextAt: 123, lastRun: { id: 'c1', name: 'check 2026-11-19 10:00', state: 'done' }, held: 0 };
  const v = loopCardView(every);
  assert.equal(v.canRun, true); assert.equal(v.state, 'waiting'); assert.equal(v.nextAt, 123);
  assert.deepEqual(v.trigger, { key: 'rigP230.trigEvery', vars: { every: '7d', entry: 'checker' } });
  assert.deepEqual(v.last, { name: 'check 2026-11-19 10:00', state: 'done' });
  const req = loopCardView({ name: 'work', kind: 'work', trigger: { type: 'request', seat: 'main' }, entry: 'main', state: 'running', lastRun: null });
  assert.equal(req.canRun, false); assert.equal(req.nextAt, null); assert.equal(req.last, null); assert.equal(req.trigger.key, 'rigP230.trigRequest');
  assert.equal(canRunNow({ implicit: true, trigger: { type: 'every' } }), false, 'loops 없는 정의의 cycles는 아니다');
  assert.equal(loopCardView({ name: 'x', kind: 'improve', trigger: { type: 'event' }, state: 'weird' }).state, 'idle');
  for (const d of [en, ko]) for (const k of ['loopsHead', 'runNow', 'runNowTip', 'ran', 'next', 'last', 'noRuns', 'trigRequest', 'trigEvery', 'trigEvent', 'kindImprove', 'loopState.running', 'loopState.waiting', 'loopState.paused', 'loopState.idle']) assert.ok(get(d.rigP230, k), k);
  assert.match(read('RigSetup.jsx'), /status === 'on' && hasLoops && <RigLoopCards ws=\{ws\} \/>/);
  assert.match(read('RigLoopCards.jsx'), /api\.call\('rig\.run', \{ workspace: ws\.key, loop: name \}\)/);
});

test('P230 지금 돌리기 답 → 알림: 열었으면 회 이름, 건너뛰면 까닭(끝나지 않은 회 목록), 두 사전', () => {
  assert.deepEqual(runToast({ ran: true, name: 'retro 2026-11-19 10:00', case: 'c1' }), { key: 'rigP230.ran', vars: { name: 'retro 2026-11-19 10:00' }, kind: 'info' });
  assert.deepEqual(runToast({ ran: false, skipped: 'running', live: ['c1', 'c2'] }), { key: 'rigP230.skip.running', vars: { list: 'c1, c2' }, kind: 'error' });
  for (const why of ['paused', 'no_session', 'spawn_failed']) assert.equal(runToast({ ran: false, skipped: why }).key, `rigP230.skip.${why}`);
  assert.equal(runToast(null).key, 'rigP230.runFail');
  for (const d of [en, ko]) for (const why of ['running', 'paused', 'no_session', 'spawn_failed']) assert.ok(d.rigP230.skip[why]);
  assert.match(ko.rigP230.skip.running, /끝나지 않은 회가 있습니다\(\{list\}\)/);
});

test('P230 상한 카드(run_limit): 제목·메타·마지막 반려 까닭과 단추 셋(그대로 받기·한 번 더·회 멈추기), 두 사전', () => {
  const src = read('RigAsks.jsx');
  assert.match(src, /a\.kind === 'run_limit' \? t\('rigP230\.limitTitle'/);
  for (const a of ['accept', 'again', 'pause']) assert.match(src, new RegExp(`data-action="rig-ask-limit-${a}"[^>]*onClick=\\{\\(\\) => act\\('${a}'\\)\\}`));
  assert.match(src, /data-role="rig-ask-why"/);
  assert.equal(ko.rigP230.accept, '그대로 받기'); assert.equal(ko.rigP230.again, '한 번 더'); assert.equal(ko.rigP230.pause, '회 멈추기');
  assert.equal(en.rigP230.accept, 'Accept as is'); assert.equal(en.rigP230.again, 'One more round'); assert.equal(en.rigP230.pause, 'Pause run');
  for (const d of [en, ko]) for (const k of ['limitTitle', 'limitMeta', 'limitWhy', 'limitTip', 'accepted', 'againDone', 'paused']) assert.ok(d.rigP230[k], k);
  assert.match(ko.rigP230.limitTitle, /\{name\}/); assert.match(en.rigP230.limitMeta, /\{max\}/);
});
