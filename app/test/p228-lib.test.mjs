// P228 단위 시험(창): Rig 만들기 대화상자(rig2-design 11.2·11.3·11.11) — 세 질문과 바로가기 둘, 답 바꾸기, rig.create 자료,
// 켜기 전 요약(고리·계기·자리·덧붙임)과 자리 권한 줄, "질문 없이 돌리기" 경고 문구(두 사전), 3자리 틀이 없음, 옛 3자리 정의는 그대로 읽힘.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  wizardInit, wizardApplyShortcut, wizardSet, wizardCanNext, wizardRequest, wizardAfterRequest, wizardRefineRequest, wizardOnBuilder, wizardPickDescribe,
  answersProblem, apiAnswers, presetsView, reviewLauncherDefault, everyMode, everyHours, everyOf, defSummary, permLine, tableFromDef, tableToSave, FALLBACK_ANSWERS, launcherChoices,
} from '../src/renderer/lib/rig-setup.js';
import { presetFiles, shortcutAnswers, SHORTCUTS, DEFAULT_ANSWERS } from '../../backend/src/rig-presets.mjs';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const WS = 'C:/w/new';
const CH = launcherChoices({ launchers: [{ id: 'l-claude', name: 'Claude', harness: 'claude' }, { id: 'l-codex', name: 'Codex', harness: 'codex' }] });
// 판의 rig.presets 답(백엔드 모듈 그대로)
const PRESETS = { shortcuts: SHORTCUTS.map((s) => ({ id: s.id, title: s.title, desc: s.desc, en: s.en, answers: shortcutAnswers(s.id) })), defaults: DEFAULT_ANSWERS };

test('P228 창의 기본 답은 판의 기본과 같은 모양이고, 바로가기 목록은 화면 언어로', () => {
  assert.deepEqual(FALLBACK_ANSWERS, JSON.parse(JSON.stringify(DEFAULT_ANSWERS)));
  const ko1 = presetsView(PRESETS, 'ko'); const en1 = presetsView(PRESETS, 'en');
  assert.deepEqual(ko1.shortcuts.map((s) => s.title), ['정기 점검', '규칙이 자라는 반복 작업']);
  assert.deepEqual(en1.shortcuts.map((s) => s.title), ['Regular check', 'Repeated work with growing rules']);
  assert.deepEqual(presetsView({ error: 'x' }).shortcuts, []); assert.equal(presetsView(null).defaults, FALLBACK_ANSWERS);
});

test('P228 세 질문: 처음은 모두 꺼짐, request는 keep, every는 1d·7d·n시간, 검토 런처는 다른 종류. 막힘(자리 이름·런처·빈 경로)', () => {
  let w = wizardInit({ defaultLauncher: 'l-claude', status: { state: 'none' }, defaults: PRESETS.defaults, choices: CH });
  assert.equal(w.step, 'ask');
  for (const k of ['canon', 'ledger', 'sector', 'check', 'review']) assert.equal(w.answers[k].on, false, k);
  assert.equal(w.answers.launcher, 'l-claude'); assert.equal(w.answers.review.launcher, 'l-codex', '검토 자리는 다른 종류');
  assert.equal(reviewLauncherDefault([{ id: 'a', harness: 'claude' }], 'a'), 'a');
  assert.equal(wizardCanNext(w), true);
  w = wizardSet(w, 'trigger', 'every'); w = wizardSet(w, 'session', 'fresh');
  assert.equal(w.answers.every, '7d');
  w = wizardSet(w, 'trigger', 'request');
  assert.equal(w.answers.session, 'keep', 'request를 고르면 keep');
  assert.equal(everyMode('6h'), 'h'); assert.equal(everyHours('6h'), 6); assert.equal(everyOf('h', '12'), '12h'); assert.equal(everyOf('1d', 3), '1d'); assert.equal(everyOf('h', 0), '1h');
  assert.equal(answersProblem(wizardSet(w, 'seat', 'Main').answers), 'seat');
  assert.equal(answersProblem(wizardSet(w, 'launcher', '').answers), 'launcher');
  assert.equal(answersProblem(wizardSet(wizardSet(w, 'canon.on', true), 'canon.path', ' ').answers), 'canon');
  assert.equal(answersProblem(wizardSet(wizardSet(w, 'review.on', true), 'seat', 'reviewer').answers), 'seat');
  assert.equal(wizardCanNext(wizardSet(w, 'seat', '')), false);
  for (const k of ['seat', 'launcher', 'every', 'canon', 'ledger', 'sector', 'check', 'answers']) { assert.ok(ko.rigP228.bad[k], k); assert.ok(en.rigP228.bad[k], k); }
  w = wizardSet(wizardSet(w, 'permission', 'scoped'), 'unattended', true);
  assert.equal(wizardSet(w, 'permission', 'ask').answers.unattended, false, 'ask로 돌리면 질문 없이 돌리기도 끈다');
});

test('P228 바로가기 둘: 누르면 답을 채우고(런처는 그대로), 그 뒤 바꿀 수 있다. rig.create는 답을 그대로 보내고 판의 정의는 rig check를 지난다', () => {
  let w = wizardInit({ defaultLauncher: 'l-codex', defaults: PRESETS.defaults, choices: CH });
  w = wizardApplyShortcut(w, PRESETS.shortcuts[0]);
  const a = w.answers;
  assert.equal(a.shortcut, 'check'); assert.equal(a.trigger, 'every'); assert.equal(a.every, '7d'); assert.equal(a.session, 'fresh'); assert.equal(a.permission, 'scoped');
  assert.equal(a.sector.on, true); assert.equal(a.ledger.on, true); assert.equal(a.canon.on, false); assert.equal(a.launcher, 'l-codex', '런처는 사람이 고른 것');
  w = wizardSet(w, 'every', '1d'); w = wizardSet(w, 'review.on', true);
  const req = wizardRequest(w, WS);
  assert.equal(req.method, 'rig.create'); assert.equal(req.params.workspace, WS);
  assert.equal(req.params.answers.every, '1d'); assert.equal(req.params.answers.review.on, true); assert.equal(req.params.answers.review.launcher, w.answers.review.launcher);
  assert.equal(apiAnswers({ ...w.answers, review: { on: false, launcher: 'x' } }).review.launcher, '', '꺼진 검토 자리의 런처는 보내지 않는다');
  // 판이 같은 답으로 만든 정의
  const out = presetFiles(req.params.answers, { launcher: 'claude', reviewLauncher: 'codex' });
  assert.deepEqual(out.def.loops.work.trigger, { every: '1d' }); assert.ok(out.def.seats.reviewer);
  // 규칙이 자라는 일
  w = wizardApplyShortcut(w, PRESETS.shortcuts[1]);
  assert.equal(w.answers.shortcut, 'grow'); assert.equal(w.answers.trigger, 'request'); assert.equal(w.answers.session, 'keep');
  assert.equal(w.answers.canon.on, true); assert.equal(w.answers.ledger.improve, true); assert.equal(w.answers.sector.on, false); assert.equal(w.answers.review.on, false, '앞 바로가기에서 켠 것은 지운다');
  w = wizardAfterRequest({ ...w, step: 'ask' }, { ok: true, written: ['.atrium/rig.json'] });
  assert.equal(w.step, 'preview'); assert.deepEqual(w.created.written, ['.atrium/rig.json']);
});

test('P228 말로 설명하기: 처음부터(제작 세션) 또는 요약 단계에서 만든 정의를 다듬기 → 만드는 중 → 요약으로 돌아온다', () => {
  let w = wizardInit({ defaultLauncher: 'l-claude' });
  assert.equal(wizardPickDescribe(w).step, 'describe');
  w = { ...w, step: 'preview' };
  assert.equal(wizardRefineRequest(w, WS), null, '빈 글이면 보내지 않는다');
  w = { ...w, refine: ' 검토 자리를 codex로 ' };
  assert.deepEqual(wizardRefineRequest(w, WS), { method: 'rig.describe', params: { workspace: WS, text: '검토 자리를 codex로', launcher: 'l-claude' } });
  w = wizardAfterRequest(w, { session: 'b1', name: 'rig-builder' });
  assert.equal(w.step, 'building'); assert.equal(w.refine, '');
  assert.equal(wizardOnBuilder(w, { state: 'done', result: 'ok' }, { state: 'off' }).step, 'preview');
});

test('P228 켜기 전 요약: 고리·계기·자리·덧붙임과 자리 권한 줄(ask·scoped·unattended)', () => {
  const chk = defSummary(presetFiles(shortcutAnswers('check'), { launcher: 'claude' }).def);
  assert.equal(chk.legacy, false);
  assert.deepEqual(chk.loops, [{ name: 'work', kind: 'work', trigger: 'every', every: '7d', entry: 'checker', produces: ['reports/'], approve: null }]);
  assert.equal(chk.seats[0].permission, 'scoped'); assert.ok(chk.seats[0].allow.length > 10);
  assert.deepEqual(chk.adds, { canon: [], ledger: ['ledger/checks.jsonl'], sector: ['reports/'], check: [], review: null });
  assert.deepEqual(permLine(chk.seats[0]), { key: 'rigPerm.scoped', vars: { n: chk.seats[0].allow.length }, warn: false });
  const grow = defSummary(presetFiles({ ...shortcutAnswers('grow'), check: { on: true }, review: { on: true }, unattended: true, permission: 'scoped' }, { launcher: 'claude', reviewLauncher: 'codex' }).def);
  assert.deepEqual(grow.loops.map((l) => [l.name, l.kind, l.trigger, l.every, l.approve]), [['work', 'work', 'request', null, null], ['improve', 'improve', 'every', '7d', 'human']]);
  assert.deepEqual(grow.adds.canon, ['docs/rules.md']); assert.deepEqual(grow.adds.sector, [], '제안 폴더는 산출물 폴더로 세지 않는다');
  assert.deepEqual(grow.adds.check, ['node .atrium/hooks/check.mjs']); assert.equal(grow.adds.review, 'reviewer');
  assert.deepEqual(grow.seats.map((x) => x.permission), ['unattended', 'scoped']);
  assert.deepEqual(permLine(grow.seats[0]), { key: 'rigPerm.unattended', vars: {}, warn: true });
  assert.deepEqual(permLine({ permission: 'ask', allow: [] }), { key: 'rigP228.permAsk', vars: {}, warn: false });
  assert.equal(grow.seats[1].writes, false);
});

test('P228 "질문 없이 돌리기" 경고는 11.10의 문장 그대로(두 사전), 대화상자 체크 옆과 요약·켜기 확인에 보인다', () => {
  assert.equal(ko.rigPerm.unattended, '질문 없이: 셸로 저장소 안 어디든 쓰고 지울 수 있습니다');
  assert.equal(en.rigPerm.unattended, 'Never asks: it can write and delete anywhere in the repository through the shell');
  const src = read('RigSetup.jsx');
  assert.match(src, /data-role="rig-unattended-warn">\{t\('rigPerm\.unattended'\)\}/);
  assert.match(src, /data-role="rig-perm-line">\{t\(p\.key, p\.vars\)\}/);
  assert.match(src, /<EnablePerms def=\{st\.definition\} \/>/, '켜기 단계의 자리 권한');
  assert.match(src, /api\.call\('rig\.enable', \{ workspace: ws\.key, confirm: true \}\)/, '켜기 확인(무인 승인)은 지금 길');
});

test('P228 3자리 틀은 대화상자에 없고, 옛 3자리 정의는 요약에서 그대로 읽힌다(흐름 그림). rig 2 정의의 표 저장은 맨 위 flow를 보내지 않는다', () => {
  const src = read('RigSetup.jsx');
  assert.match(src, /api\.call\('rig\.presets'/);
  assert.doesNotMatch(src, /rig\.templates|main-worker|wizardPickTemplate|data-action="rig-template"/);
  for (const d of [ko, en]) { assert.equal(d.rigSetup.step, undefined); assert.equal(d.rigSetup.launchersIntro, undefined); assert.equal(d.rigSetup.create, undefined); }
  for (const k of ['qWhen', 'qWho', 'qAdds', 'whenRequest', 'whenEvery', 'unattended', 'sumTitle', 'refine', 'describe']) { assert.ok(ko.rigP228[k], k); assert.ok(en.rigP228[k], k); }
  assert.doesNotMatch(JSON.stringify(ko.rigP228) + JSON.stringify(en.rigP228), /사건이 생길 때|when an event happens/i, 'event 계기는 묻지 않는다(요약의 loopEvent는 제작 세션이 만든 정의를 보일 때만)');
  assert.doesNotMatch(src, /value="event"/);
  const legacy = { name: 'Main + worker', results: ['ok', 'failed'], seats: { main: { launcher: 'claude', session: 'keep' }, worker: { launcher: 'claude', session: 'fresh' } }, flow: [{ from: 'main', on: 'assign', to: 'worker' }], manager: 'main' };
  const s = defSummary(legacy);
  assert.equal(s.legacy, true); assert.deepEqual(s.seats.map((x) => x.permission), ['ask', 'ask']);
  assert.match(src, /s\.legacy \? <><div className="dim" data-role="rig-summary-legacy">/);
  const tb = tableFromDef(presetFiles(shortcutAnswers('grow'), { launcher: 'claude' }).def);
  assert.equal('flow' in tableToSave(tb, { loops: true }), false);
  assert.ok(tableToSave(tb, { loops: true }).seats.main.loads, '자리의 다른 칸은 지킨다');
  assert.ok('flow' in tableToSave(tableFromDef(legacy)));
});
