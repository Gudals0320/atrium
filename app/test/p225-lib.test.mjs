// P225: 무인 자리 승인 카드(P224 RigAskCard의 seat_permit)의 두 사전 글
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('P225 두 사전: rigPermitNeed 글이 같은 키와 같은 자리 표시', () => {
  const ks = Object.keys(ko.rigPermitNeed);
  assert.deepEqual(Object.keys(en.rigPermitNeed), ks);
  const marks = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
  for (const k of ks) assert.equal(marks(en.rigPermitNeed[k]), marks(ko.rigPermitNeed[k]), k);
  assert.equal(ko.rigPermitNeed.line, '무인 자리 승인: {seat}');
});

test('P225 RigAskCard: seat_permit 카드는 제목·승인 단추(이 PC 창만)를 그린다', () => {
  const src = fs.readFileSync(path.join(HERE, '..', 'src', 'renderer', 'RigAsks.jsx'), 'utf8');
  assert.match(src, /a\.kind === 'seat_permit' \? t\('rigPermitNeed\.line'/);
  assert.match(src, /a\.kind === 'seat_permit' && !remoteView\(\) && <button[^>]*data-action="rig-ask-permit"/);
});
