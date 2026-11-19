// P232 창 단위 시험: rig2-design 11.14. 만들기 대화상자의 기본 경로·이어진 회 칸, 켜기 전 요약의 정본 기준 줄과 저장소 훅 알림, 두 사전
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FALLBACK_ANSWERS, answersProblem, defSummary } from '../src/renderer/lib/rig-setup.js';
import { presetFiles, shortcutAnswers, DEFAULT_ANSWERS } from '../../backend/src/rig-presets.mjs';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(HERE, '..', 'src', 'renderer', f), 'utf8');

test('P232 대화상자 기본 답: 판(rig-presets)과 같은 .atrium/ 아래 경로, 이어진 회 0(끔)과 허용 목록 없음', () => {
  assert.equal(FALLBACK_ANSWERS.canon.path, DEFAULT_ANSWERS.canon.path);
  assert.equal(FALLBACK_ANSWERS.ledger.path, DEFAULT_ANSWERS.ledger.path);
  assert.equal(FALLBACK_ANSWERS.ledger.followups, 0); assert.equal(FALLBACK_ANSWERS.allow, null);
  const a = JSON.parse(JSON.stringify({ ...FALLBACK_ANSWERS, launcher: 'l1', ledger: { ...FALLBACK_ANSWERS.ledger, on: true, improve: true } }));
  assert.equal(answersProblem(a), null);
  assert.equal(answersProblem({ ...a, ledger: { ...a.ledger, followups: 51 } }), 'ledger');
  assert.equal(answersProblem({ ...a, ledger: { ...a.ledger, followups: 1.5 } }), 'ledger');
  assert.equal(answersProblem({ ...a, ledger: { ...a.ledger, followups: 3 } }), null);
});

test('P232 요약: 개선 고리의 이어진 회 수(있을 때만), 정본 경로', () => {
  const g = defSummary(presetFiles(shortcutAnswers('grow'), { launcher: 'claude' }).def);
  const imp = g.loops.find((l) => l.kind === 'improve');
  assert.equal(imp.followups, 3);
  assert.equal('followups' in g.loops.find((l) => l.kind === 'work'), false);
  assert.deepEqual(g.adds.canon, ['.atrium/canon/rules.md']);
  assert.equal(g.seats[0].permission, 'scoped'); assert.equal(g.seats[0].allow.length, 4);
});

test('P232 화면: 이어진 회 칸, 켜기 전 요약의 정본 기준 줄(만들기 대화상자의 꺼진 정의만)과 저장소 훅 알림, 두 사전의 같은 열쇠', () => {
  const src = read('RigSetup.jsx');
  assert.match(src, /data-field="ledger\.followups"/);
  assert.match(src, /data-role="rig-canon-base"/); assert.match(src, /t\('rigP232\.canonBase', \{ path: p \}\)/);
  assert.match(src, /beforeEnable && s\.adds\.canon\.map/);
  assert.match(src, /claudeHooks && <div className="mt-rigon-warn" data-role="rig-claude-hooks">\{t\('rigP232\.claudeHooks'\)\}/);
  assert.match(src, /claudeHooks=\{!!\(pre && pre\.claudeHooks\)\} beforeEnable=\{st\.status === 'off'\}/);
  assert.deepEqual(Object.keys(ko.rigP232).sort(), Object.keys(en.rigP232).sort());
  assert.equal(ko.rigP232.canonBase, '정본 {path}에 첫 규칙을 적어 두면 켤 때의 내용이 기준이 됩니다.');
  assert.match(ko.rigP232.claudeHooks, /이 저장소의 Claude Code 훅.*rig 자리에도 걸립니다/);
  assert.match(en.rigP232.claudeHooks, /Claude Code hooks .* also run in the rig seats/);
});
