// P366: API 크레딧 장부(P361)를 걷었다. 남긴 것: 판 중계기 키(SDK 키) 넣기·지우기, SDK 세션 금액(중계기 기록 × 가격표), 옛 판 기록 지우기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { costOf, modelKey, sessionCosts, PRICES_UPDATED } from '../src/sdk-cost.mjs';
import { AuthRelay } from '../src/auth-relay.mjs';
import { UsageTap } from '../src/auth-relay-core.mjs';
import { Store } from '../src/store.mjs';
import { Backend, dropCreditLedger } from '../src/backend.mjs';
import { phoneRoute } from '../src/phone.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'p366-'));
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('가격표: 모델 열쇠, 캐시 쓰기 5분·1시간, 캐시 읽기, Haiku 5.5 긴 프롬프트, 모르는 모델은 null', () => {
  assert.equal(modelKey('claude-sonnet-5-5'), 'sonnet-5-5');
  assert.equal(modelKey('claude-opus-5-5-20261101'), 'opus-5-5');
  assert.equal(modelKey('claude-opus-5-5[1m]'), 'opus-5-5');
  assert.equal(modelKey('nope-1'), null);
  // sonnet 5.5: 입력 2, 캐시 쓰기 5분 2.5, 1시간 4, 읽기 0.1, 출력 10 ($/MTok)
  near(costOf({ model: 'claude-sonnet-5-5', in: 1e6, out: 0, cacheW: 0, cacheR: 0 }), 2);
  near(costOf({ model: 'claude-sonnet-5-5', in: 0, out: 1e6, cacheW: 1e6, cacheW1h: 4e5, cacheR: 1e6 }), 10 + 0.6 * 2.5 + 0.4 * 4 + 0.1);
  near(costOf({ model: 'claude-haiku-5-5', in: 50000, out: 0, cacheW: 0, cacheR: 60000 }), (50000 * 0.5 + 60000 * 0.05) / 1e6);
  assert.equal(costOf({ model: 'mystery', in: 10, out: 10 }), null);
  assert.equal(costOf({ model: 'mystery', in: 0, out: 0 }), 0, '토큰이 없으면 0(가격을 몰라도)');
  assert.match(PRICES_UPDATED, /^\d{4}-\d{2}-\d{2}$/);
  // 중계기는 1시간 캐시 쓰기 칸을 읽는다
  const tap = new UsageTap();
  tap.push('data: {"type":"message_start","message":{"usage":{"input_tokens":5,"cache_creation_input_tokens":100,"cache_creation":{"ephemeral_5m_input_tokens":60,"ephemeral_1h_input_tokens":40},"cache_read_input_tokens":7,"output_tokens":1}}}\n');
  assert.equal(tap.end().cacheW1h, 40);
});

test('SDK 세션 금액: 세션마다 더하고, 거절·토큰 없음은 빼고, 가격 모르는 요청은 수만 센다', () => {
  const at = Date.now();
  const recs = [
    { at, session: 'A', ep: 'sdk-cli', model: 'claude-sonnet-5-5', in: 1e6, out: 0, cacheW: 0, cacheR: 0 },
    { at, session: 'A', ep: 'sdk-cli', model: 'claude-sonnet-5-5', in: 0, out: 1e5, cacheW: 0, cacheR: 0 },
    { at, session: 'B', ep: 'sdk-cli', model: 'claude-opus-5-5', in: 0, out: 1e6, cacheW: 0, cacheR: 0 },
    { at, session: 'B', refused: 'bad_secret', status: 403 },
    { at, session: 'C', ep: 'sdk-cli', model: 'claude-sonnet-5-5', status: 500 },
    { at, session: 'C', ep: 'sdk-cli', model: 'other-model', in: 10, out: 10 },
    { at, ep: 'sdk-cli', model: 'claude-sonnet-5-5', in: 1e6 }, // 세션 없음
    null, { session: 'A', model: 'claude-sonnet-5-5', in: 1e6 }, // 시각 없음
  ];
  const v = sessionCosts(recs);
  assert.deepEqual(Object.keys(v.sessions).sort(), ['A', 'B']);
  near(v.sessions.A, 3); near(v.sessions.B, 20);
  assert.equal(v.unpriced, 1);
  assert.equal(v.prices.updated, PRICES_UPDATED);
  assert.deepEqual(sessionCosts([]).sessions, {});
});

test('판: usage.get의 sdkCosts는 중계기 기록에서 오고, 기록이 그대로면 담아 둔 값을 준다', () => {
  const dir = tmp();
  const b = new Backend({ quietMs: 600000, port: 0, logDir: dir, sessionsDir: path.join(dir, 'sessions'), claudeJson: path.join(dir, 'none.json'), claudeCommand: 'claude', claudeProjects: path.join(dir, 'projects'), hookTimeoutSec: 2 });
  let recs = [{ at: 1, session: 'S', model: 'claude-sonnet-5-5', in: 1e6 }];
  b.authRelay = { allRequests: () => recs };
  const v1 = b.sdkCosts();
  near(v1.sessions.S, 2);
  assert.equal(b.sdkCosts(), v1, '같은 기록 배열이면 다시 셈하지 않는다');
  recs = [...recs, { at: 2, session: 'S', model: 'claude-sonnet-5-5', in: 1e6 }];
  near(b.sdkCosts().sessions.S, 4);
  b.authRelay = null;
  assert.deepEqual(b.sdkCosts().sessions, {});
});

test('SDK 키(중계기 키) 넣기·지우기: 값은 돌려주지 않고 상태에 Admin 키 칸이 없다', async () => {
  const dir = tmp();
  const r = new AuthRelay({ dataDir: dir, protect: async (k) => `enc:${k.length}` });
  assert.equal(r.keyPresent(), false);
  await assert.rejects(() => r.setKey('short'), (e) => e.key === 'authRelay.err.keyShape');
  const out = await r.setKey('sk-test-' + 'a'.repeat(32));
  assert.deepEqual(out, { keyPresent: true });
  assert.equal(r.keyPresent(), true);
  assert.ok(!fs.readFileSync(r.keyFile, 'utf8').includes('sk-test-'), '암호문만');
  const st = r.status();
  assert.equal(st.keyPresent, true);
  assert.ok(!('adminKeyPresent' in st));
  assert.equal(typeof r.setAdminKey, 'undefined'); assert.equal(typeof r.queryCost, 'undefined');
  assert.deepEqual(await r.removeKey(), { keyPresent: false });
  assert.equal(r.keyPresent(), false);
});

test('옛 판 지우기: meta apiCredits, auth-relay/admin.bin, 열린 판 카드(board)를 한 번 지우고 다시 뜨면 할 것이 없다', () => {
  const dir = tmp();
  const store = new Store(path.join(dir, 'board.db'));
  try {
    store.setMeta('apiCredits', { ledger: { grants: [] }, alerted: {}, official: null });
    store.setMeta('other', { keep: 1 });
    const card = store.addDecision({ sessionId: 'board', name: 'Atrium', question: 'API credit (Ultra) $127.11 expires', options: [], createdAt: Date.now(), kind: 'later' });
    const kept = store.addDecision({ sessionId: 'S1', name: 's1', question: 'keep me', options: [], createdAt: Date.now(), kind: 'later' });
    const relay = new AuthRelay({ dataDir: dir, protect: async () => 'x' });
    fs.mkdirSync(relay.dir, { recursive: true });
    fs.writeFileSync(path.join(relay.dir, 'admin.bin'), 'ciphertext');
    fs.writeFileSync(relay.keyFile, 'ciphertext-key');
    const logs = [];
    const b = { store, authRelay: relay, log: (m) => logs.push(m) };
    const r = dropCreditLedger(b);
    assert.deepEqual(r, { meta: true, adminKey: true, cards: 1 });
    assert.equal(store.getMeta('apiCredits'), null);
    assert.deepEqual(store.getMeta('other'), { keep: 1 });
    assert.ok(!fs.existsSync(path.join(relay.dir, 'admin.bin')));
    assert.ok(fs.existsSync(relay.keyFile), 'SDK 키는 남긴다');
    assert.equal(store.getDecision(card.id).state, 'closed');
    assert.equal(store.getDecision(kept.id).state, 'open', '세션 카드는 건드리지 않는다');
    assert.equal(logs.length, 1);
    assert.deepEqual(dropCreditLedger(b), { meta: false, adminKey: false, cards: 0 }, '두 번째는 할 것이 없다');
    assert.equal(logs.length, 1, '할 것이 없으면 로그도 없다');
  } finally { store.close(); }
});

test('걷은 길: 장부 모듈이 없고, 휴대폰은 usage.updated를 보내지 않으며, 판 소스에 장부 처리기·경고가 없다', () => {
  for (const f of ['api-credits.mjs', 'credit-book.mjs']) assert.ok(!fs.existsSync(path.join(SRC, f)), f);
  assert.equal(phoneRoute({}, {}, 'usage.updated', { apiCredits: {}, sdkCosts: {} }), null);
  const be = fs.readFileSync(path.join(SRC, 'backend.mjs'), 'utf8');
  for (const s of ["'credits.", 'setAdminKey', 'creditWarning', 'credits_exhausted', 'CreditBook']) assert.ok(!be.includes(s), s);
  for (const f of ['auth-relay.mjs', 'auth-relay-child.mjs', 'auth-relay-core.mjs', 'usage-text.mjs', 'phone.mjs', 'decisions.mjs', 'branch.mjs']) {
    const s = fs.readFileSync(path.join(SRC, f), 'utf8');
    for (const w of ['queryCost', 'costQuery', "mode === 'cost'", 'creditLines', 'slimView', 'BOARD_SID', 'creditWarning']) assert.ok(!s.includes(w), `${f}: ${w}`);
  }
});
