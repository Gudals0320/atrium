// P195 단위 시험(창): rig를 처음 써 본 보고에서 고친 것 — 원격 rig 판의 안내 한 줄과 끄기 단추, 워크트리 자리 경고. 두 사전.
// P228: 워크트리 틀 막기는 3자리 틀과 함께 내렸다(틀 목록이 없다). 옛 워크트리 정의의 자리 경고는 그대로.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canEdit, canDisable, seatBlockKey } from '../src/renderer/lib/rig-setup.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const get = (dict, key) => key.split('.').reduce((o, k) => (o ? o[k] : undefined), dict);

test('P195 원격 기기: 고치기는 못 하고 끄기는 한다', () => {
  assert.equal(canEdit({ remote: true }), false);
  assert.equal(canDisable({ remote: true }), true);
  assert.equal(canDisable({}), true);
});

test('P195 원격 rig 판의 안내 한 줄: 켜기·고치기는 판을 띄운 PC의 창, 까닭(사용자 계정), 끄기는 여기서도(두 사전)', () => {
  assert.match(ko.rigP195.remoteNote, /판을 띄운 PC의 창에서만/);
  assert.match(ko.rigP195.remoteNote, /사용자 계정/);
  assert.match(ko.rigP195.remoteNote, /끄기는 여기서도/);
  assert.match(en.rigP195.remoteNote, /board window on the PC that runs the board/);
  assert.match(en.rigP195.remoteNote, /user account/);
  assert.match(en.rigP195.remoteNote, /turn it off here/);
  const src = read('RigSetup.jsx');
  assert.match(src, /\{remote && <div className="mt-rigpanel-remote dim" data-role="rig-remote-note">\{t\('rigP195\.remoteNote'\)\}<\/div>\}/);
  assert.match(src, /canDisable\(\{ remote \}\) && status === 'on' && <button[^>]*data-action="rig-panel-off"/, '켜진 rig의 끄기 단추는 원격에도');
  assert.match(src, /edit && status === 'off' && !setup/, '켜기 단계는 이 PC만');
});

test('P195 워크트리 자리 경고: 사전 열쇠와 켜기 확인·rig 판(P228: 틀 막기는 내렸다)', () => {
  assert.equal(seatBlockKey('norepo'), 'rigP195.seatNoRepo');
  assert.equal(seatBlockKey('nocommit'), 'rigP195.seatNoCommit');
  assert.equal(seatBlockKey(null), null);
  for (const k of ['seatNoRepo', 'seatNoCommit']) { assert.ok(get(ko, `rigP195.${k}`), `ko ${k}`); assert.ok(get(en, `rigP195.${k}`), `en ${k}`); }
  for (const k of ['wtNoRepo', 'wtNoCommit']) { assert.equal(get(ko, `rigP195.${k}`), undefined, `ko ${k} 지움`); assert.equal(get(en, `rigP195.${k}`), undefined, `en ${k} 지움`); }
  assert.match(en.rigP195.seatNoRepo, /first commit/);
  const src = read('RigSetup.jsx');
  assert.doesNotMatch(src, /rig\.templates|templateBlockKey|data-action="rig-template"/);
  assert.equal((src.match(/data-role="rig-worktree-warn"/g) || []).length, 2, '켜기 확인과 rig 판');
});
