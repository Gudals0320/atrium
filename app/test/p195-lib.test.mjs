// P195 단위 시험(창): rig를 처음 써 본 보고에서 고친 것 — 원격 rig 판의 안내 한 줄과 끄기 단추, 워크트리 틀 막기(까닭), 워크트리 자리 경고. 두 사전.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canEdit, canDisable, templateBlockKey, seatBlockKey, templateList } from '../src/renderer/lib/rig-setup.js';
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

test('P195 워크트리 틀 막기와 자리 경고: 사전 열쇠와 대화상자', () => {
  assert.equal(templateBlockKey('norepo'), 'rigP195.wtNoRepo');
  assert.equal(templateBlockKey('nocommit'), 'rigP195.wtNoCommit');
  assert.equal(templateBlockKey(undefined), null);
  assert.equal(seatBlockKey('norepo'), 'rigP195.seatNoRepo');
  assert.equal(seatBlockKey('nocommit'), 'rigP195.seatNoCommit');
  assert.equal(seatBlockKey(null), null);
  for (const k of ['wtNoRepo', 'wtNoCommit', 'seatNoRepo', 'seatNoCommit']) {
    assert.ok(get(ko, `rigP195.${k}`), `ko ${k}`); assert.ok(get(en, `rigP195.${k}`), `en ${k}`);
  }
  assert.match(ko.rigP195.wtNoRepo, /git 저장소가 아닙니다/); assert.match(ko.rigP195.wtNoCommit, /커밋이 없습니다/);
  assert.match(en.rigP195.seatNoRepo, /first commit/);
  // 틀 목록은 막힘을 그대로 넘긴다
  const list = templateList({ templates: [{ id: 'x', title: 't', desc: 'd', en: { title: 'T', desc: 'D' }, seats: {}, blocked: 'norepo' }] }, 'en');
  assert.equal(list[0].blocked, 'norepo'); assert.equal(list[0].title, 'T');
  const src = read('RigSetup.jsx');
  assert.match(src, /api\.call\('rig\.templates', \{ workspace: ws\.key \}\)/, '틀 목록에 워크스페이스를 준다');
  assert.match(src, /disabled=\{!!x\.blocked\}/);
  assert.match(src, /data-role="rig-template-blocked">\{t\(templateBlockKey\(x\.blocked\)\)\}/);
  assert.equal((src.match(/data-role="rig-worktree-warn"/g) || []).length, 2, '켜기 확인과 rig 판');
});
