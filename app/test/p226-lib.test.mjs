// P226(rig2-design 11.10): 무인 자리 안내 글. 승인 카드와 켜기 확인이 "셸로 저장소 안 어디든 쓰고 지울 수 있다"를 분명히 말한다(두 사전)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('P226 두 사전: 무인 자리 글(켜기 확인 줄·경고, 승인 카드 위험 줄·풍선)이 셸로 저장소 어디든 쓰고 지울 수 있다고 말한다', () => {
  assert.equal(ko.rigPerm.unattended, '질문 없이: 셸로 저장소 안 어디든 쓰고 지울 수 있습니다');
  assert.equal(ko.rigPermitNeed.risk, ko.rigPerm.unattended);
  for (const s of [ko.rigPerm.unattendedWarn, ko.rigPermitNeed.tip]) assert.match(s, /셸로는? 저장소 안 어디든 쓰고 지울 수 있습니다/);
  for (const s of [en.rigPerm.unattended, en.rigPerm.unattendedWarn, en.rigPermitNeed.risk, en.rigPermitNeed.tip]) assert.match(s, /write and delete anywhere in the repository through the shell|through the shell they can write and delete anywhere in the repository|the shell can write and delete anywhere in the repository/);
  assert.ok(!/writes outside its scope are blocked|쓰기 범위 밖은 막음/.test(en.rigPerm.unattended + ko.rigPerm.unattended + en.rigPermitNeed.tip + ko.rigPermitNeed.tip), '범위 밖이 막힌다고 말하지 않는다(셸은 막지 못한다)');
  // scoped: 셸로 쓰거나 지우는 명령은 묻는다
  assert.match(ko.rigPerm.scoped, /셸로 쓰거나 지우는 명령은 묻습니다/);
  assert.match(en.rigPerm.scoped.other, /Shell writes and deletes ask/);
  assert.deepEqual(Object.keys(en.rigPermitNeed), Object.keys(ko.rigPermitNeed));
});

test('P226 RigAskCard: seat_permit 카드는 위험 한 줄(rigPermitNeed.risk)을 늘 보인다. 켜기 확인은 무인 자리 줄에 rigPerm.unattended', () => {
  const src = fs.readFileSync(path.join(HERE, '..', 'src', 'renderer', 'RigAsks.jsx'), 'utf8');
  assert.match(src, /a\.kind === 'seat_permit' && <div className="mt-rigask-risk" data-role="rig-ask-risk">\{t\('rigPermitNeed\.risk'\)\}/);
  const reg = fs.readFileSync(path.join(HERE, '..', 'src', 'renderer', 'Regions.jsx'), 'utf8');
  assert.match(reg, /x\.permission === 'unattended' \? 'rigPerm\.unattended'/);
  assert.match(reg, /t\('rigPerm\.unattendedWarn'\)/);
  const css = fs.readFileSync(path.join(HERE, '..', 'src', 'renderer', 'styles.css'), 'utf8');
  assert.match(css, /\.mt-rigask-risk \{/);
});
