// P269: rig를 걷어 냈다. 창의 rig 화면(rig 판, 세션 맵 rig 묶음, 캔버스 rig 선, 휴대폰 rig 시트, 영역 메뉴 rig 줄)과 그 사전·CSS가 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/renderer');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

test('P269 rig 화면 파일이 없다', () => {
  for (const f of ['Rig.jsx', 'RigLines.jsx', 'RigMap.jsx', 'lib/rig-map.js', 'lib/rig.js']) assert.ok(!fs.existsSync(path.join(SRC, f)), f);
});

test('P269 창 코드에 rig 길이 없다(판 API rig.*, rigMaps, rig 대화상자, rig 꼬리표, rig 묶음 배치)', () => {
  const bad = /rig-map|lib\/rig\.js|RigLines|RigMap|RigPanel|RigTag|rigMaps|rigpanel|'rig\.(status|map)'|rigBlocks|rigCardBoxes|hideRigSessions|rigRole|rigMenu/;
  for (const f of walk(SRC).filter((x) => /\.(jsx?|mjs)$/.test(x))) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), bad, path.relative(SRC, f));
});

test('P269 사전과 CSS에 rig 화면 글·규칙이 없다(옛 전달 까닭 rigLoopHold만 남는다)', () => {
  for (const d of [ko, en]) {
    const keys = Object.keys(d).filter((k) => /^rig/.test(k));
    assert.deepEqual(keys, ['rigLoopHold']);
  }
  const css = read('styles.css') + read('phone.css');
  assert.doesNotMatch(css, /mt-rig|mt-rm2|k-rig|mt-sm-rig|mt-pm-rig|rigask|\.rigc\b|\.rig\b/);
});
