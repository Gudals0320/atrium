// P366: API 크레딧 장부를 걷고 남긴 창 쪽: SDK 세션 금액 칩(lib/sdk-cost.js), "SDK 키" 문구, 걷은 열쇠·파일
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';
import { usd, sessionCost } from '../src/renderer/lib/sdk-cost.js';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');

test('금액 글과 세션 금액: usage.get 값(sdkCosts) 또는 sdkCosts 그 자체에서', () => {
  assert.equal(usd(2.256), '$2.26');
  assert.equal(usd(0.004, { small: true }), '<$0.01');
  assert.equal(usd(0.004), '$0.00');
  assert.equal(usd(null), '—');
  const u = { providers: {}, sdkCosts: { sessions: { S: 2.26 }, unpriced: 0 } };
  assert.equal(sessionCost(u, 'S'), 2.26);
  assert.equal(sessionCost(u.sdkCosts, 'S'), 2.26);
  assert.equal(sessionCost(u, 'X'), null);
  assert.equal(sessionCost(null, 'S'), null);
  assert.equal(sessionCost({ apiCredits: { sessions: { S: 1 } } }, 'S'), null, '옛 apiCredits 값은 보지 않는다');
});

test('사전: 키 칸은 "SDK 키", 금액 칩 툴팁, 장부 열쇠(apiCredits) 없음, 두 언어 같은 열쇠', () => {
  assert.equal(en.authRelay.title, 'SDK key');
  assert.equal(ko.authRelay.title, 'SDK 키');
  assert.match(en.authRelay.note, /monthly API credits/); assert.match(en.authRelay.note, /purchased credits/); assert.match(en.authRelay.note, /this PC only/);
  assert.match(ko.authRelay.note, /월 API 크레딧/); assert.match(ko.authRelay.note, /구매 크레딧/); assert.match(ko.authRelay.note, /이 PC에만 암호화/);
  for (const d of [en, ko]) {
    assert.equal(d.apiCredits, undefined);
    assert.match(d.sdkCost.title, /\{updated\}/);
    assert.ok(!/interactive|대화형/i.test(d.authRelay.note + d.authRelay.tagTitle), '키 칸에 대화형 API 과금 문구가 없다');
  }
});

test('걷은 파일과 길: 장부 화면·보조가 없고, 런처 탭은 SDK 런처 줄 아래에 키 칸을 둔다', () => {
  for (const f of ['ApiCredits.jsx', 'lib/api-credits.js']) assert.ok(!fs.existsSync(path.join(R, f)), f);
  const src = (f) => fs.readFileSync(path.join(R, f), 'utf8');
  for (const f of ['Usage.jsx', 'MobileApp.jsx', 'mobile-store.js', 'SpawnDialog.jsx', 'Decisions.jsx', 'main.jsx', 'Launchers.jsx', 'SessionNode.jsx', 'MapCard.jsx']) {
    const s = src(f);
    for (const w of ['apiCredits', 'ApiCredits', 'credits.alert', 'phone.credits', 'decision-board', 'startCreditAlerts']) assert.ok(!s.includes(w), `${f}: ${w}`);
  }
  const ln = src('Launchers.jsx');
  assert.match(ln, /l\.id === sdkId \? <ApiKeyPanel under \/>/);
  assert.match(src('SessionNode.jsx'), /from '\.\/SdkCost\.jsx'/);
});
