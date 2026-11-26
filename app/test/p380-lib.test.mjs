// P380 단위 시험: OmO 로고(kinds.js omo.logo). 그림 파일·출처 한 줄·제삼자 고지(Sustainable Use License 전문)가 함께 있고,
//   레일 단추(badge)도 같은 그림(바탕 있는 타일이라 logoBadge 없음), 내 차례에도 같은 그림. 다른 종류의 로고는 그대로
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kindOf, KINDS, logoFor } from '../src/renderer/lib/kinds.js';

const at = (p) => new URL(p, import.meta.url);

test('P380 OmO 로고: assets/kinds/omo.svg, 파일·출처·고지가 함께 있다', () => {
  const k = kindOf('omo');
  assert.equal(k.logo, 'assets/kinds/omo.svg');
  assert.equal(k.logoBadge ?? null, null, '바탕 있는 타일이라 레일 단추도 같은 그림');
  assert.equal(logoFor(k, 'ready'), k.logo); assert.equal(logoFor(k, 'waiting'), k.logo);
  assert.equal(kindOf('OMO').logo, k.logo, '종류 이름 대소문자');
  const svg = fs.readFileSync(at('../src/renderer/assets/kinds/omo.svg'), 'utf8');
  assert.match(svg, /^<svg [^>]*viewBox="0 0 1024 1024"/);
  assert.ok(!/<script|href=|url\(/i.test(svg), '바깥 주소·스크립트 없는 그림');
  const src = fs.readFileSync(at('../src/renderer/assets/kinds/omo.SOURCE.txt'), 'utf8');
  assert.match(src, /code-yeongyu\/oh-my-openagent@[0-9a-f]{7}/); assert.match(src, /packages\/web\/public\/brand\/omo-mark\.svg/); assert.match(src, /Sustainable Use License/);
  const notice = fs.readFileSync(at('../THIRD_PARTY_NOTICES.txt'), 'utf8');
  assert.match(notice, /OmO 로고/); assert.match(notice, /omo-mark\.svg/); assert.match(notice, /Sustainable Use License/);
  assert.match(notice, /You must ensure that anyone who gets a copy of any part of the software from you also gets a copy of these/, '약관 전문');
  assert.match(notice.split('\n')[1], /OmO/, '머리 상표 줄');
});

test('P380 다른 종류의 표지는 그대로(글자 기호 Om은 OmO 모양 칸에 남는다)', () => {
  assert.equal(KINDS.omo.mark, 'Om'); assert.equal(KINDS.omo.shape, 'hexagon');
  assert.equal(KINDS.agy.logo, 'assets/kinds/agy.png'); assert.equal(KINDS.hermes.logo, 'assets/kinds/hermes.png');
  assert.equal(KINDS.shell.logo, null);
});
