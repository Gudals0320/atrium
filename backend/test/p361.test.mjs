// P361: API 크레딧 장부. 붙여 넣기 읽기(한국어·영어, 표만·페이지 전체, 음수 잔액, 시간대), 지출 나누기 규칙, 가격 계산과 캐시 토큰,
//   만료 알림 한 번(할 일 "나중에" 판 카드), 공식 비용 조회(가짜 위쪽 서버, Admin 키는 자식만 풂), 키 값이 답·로그·기록에 없음.
//   시험 글은 결제 페이지의 꼴로 지은 것이다(실제 조직 정보가 아니다)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { parseBilling, costOf, modelKey, allocate, creditView, nextGrantOf, planGuess, dateIn, moneyOf, slimView, relayItems } from '../src/api-credits.mjs';
import { CreditBook, BOARD_CARD_SID, cleanGrant, expiryCardText } from '../src/credit-book.mjs';
import { costQuery, costRowsOf, UsageTap } from '../src/auth-relay-core.mjs';
import { AuthRelay } from '../src/auth-relay.mjs';
import { creditLines, usageLines } from '../src/usage-text.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-run-p361-'));
const win = process.platform === 'win32';
const fakeKey = (p = 'sk-test-') => p + crypto.randomBytes(24).toString('hex');
const KST = 540;
const H = 3600000, D = 86400000;

const KO_PAGE = [
  '결제', '크레딧 잔액', '-US$4.33', '미납 잔액', '프로모션 크레딧 US$327.11 사용 가능', '자동 충전', '꺼짐', '',
  '프로모션 크레딧',
  '이름\t잔액 / 총액\t적용 대상\t만료일\t부여 날짜',
  'API credit (Ultra)\tUS$127.11 / US$130.33\tAgent SDK, API, 배치 API, Playground, 관리형 에이전트\t2026년 11월 27일 오전 9:00 GMT+9\t2026년 10월 24일',
  'API credit (Ultra)\tUS$200.00 / US$200.00\tAgent SDK, API, 배치 API, Playground, 관리형 에이전트\t2026년 12월 27일 오전 9:00 GMT+9\t2026년 11월 24일',
  '청구서 내역', '날짜\t유형\t상태\t비용', '2026년 11월 24일\tAPI credit (Ultra) (US$200.00)\t2026년 12월 27일 만료 예정\tUS$0.00',
].join('\n');
// 표의 칸마다 한 줄(화면을 통째로 고른 꼴), 잔액과 "/ 총액"이 갈라짐, 만료·부여 차례가 바뀜
const EN_PAGE = [
  'Billing', 'Credit balance', '-US$4.33', 'Amount due', 'US$327.11 in promotional credits available', 'Auto reload', 'Off',
  'Promotional credits', 'Name', 'Balance / Total', 'Applies to', 'Expires', 'Granted',
  'API credit (Ultra)', 'US$127.11 / US$130.33', 'Agent SDK', 'API', 'Batch API', 'Playground', 'Managed Agents', 'Nov 27, 2026, 9:00 AM GMT+9', 'Oct 24, 2026',
  'API credit (Ultra)', 'US$200.00', '/ US$200.00', 'Agent SDK', 'API', 'Nov 24, 2026', 'Dec 27, 2026, 9:00 AM GMT+9',
  'Invoice history', 'Nov 24, 2026\tAPI credit (Ultra) (US$200.00)\tScheduled to expire Dec 27, 2026\tUS$0.00',
].join('\n');

test('붙여 넣기(한국어, 페이지 전체): 지급 둘, 음수 구매 잔액(미납), 프로모션 합, 자동 충전 꺼짐, GMT+9 만료', () => {
  const r = parseBilling(KO_PAGE, { tzOffsetMin: 0 });
  assert.equal(r.found, true); assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.purchased, { balance: -4.33, due: true });
  assert.equal(r.promoAvailable, 327.11); assert.equal(r.autoReload, false);
  assert.equal(r.grants.length, 2, '청구서 내역 줄은 지급이 아니다');
  const [a, b] = r.grants;
  assert.equal(a.name, 'API credit (Ultra)'); assert.equal(a.kind, 'plan'); assert.equal(a.plan, 'Ultra');
  assert.equal(a.remaining, 127.11); assert.equal(a.total, 130.33);
  assert.deepEqual(a.appliesTo, ['Agent SDK', 'API', '배치 API', 'Playground', '관리형 에이전트']);
  assert.equal(new Date(a.expiresAt).toISOString(), '2026-11-27T00:00:00.000Z', 'GMT+9 오전 9시 = UTC 0시(이 PC 시간대와 상관없이)');
  assert.equal(a.grantedOn, '2026-10-24'); assert.equal(a.hasTime, true);
  assert.equal(b.remaining, 200); assert.equal(new Date(b.expiresAt).toISOString(), '2026-12-27T00:00:00.000Z'); assert.equal(b.grantedOn, '2026-11-24');
});

test('붙여 넣기(영어, 칸마다 한 줄): 갈라진 "/ 총액", 바뀐 날짜 차례, 다음 절 앞에서 끊음', () => {
  const r = parseBilling(EN_PAGE, { tzOffsetMin: 0 });
  assert.deepEqual(r.purchased, { balance: -4.33, due: true });
  assert.equal(r.promoAvailable, 327.11); assert.equal(r.autoReload, false);
  assert.equal(r.grants.length, 2);
  assert.deepEqual(r.grants[0].appliesTo, ['Agent SDK', 'API', 'Batch API', 'Playground', 'Managed Agents']);
  assert.equal(r.grants[1].remaining, 200); assert.equal(r.grants[1].total, 200);
  assert.equal(new Date(r.grants[1].expiresAt).toISOString(), '2026-12-27T00:00:00.000Z'); assert.equal(r.grants[1].grantedOn, '2026-11-24');
  assert.deepEqual(r.warnings, []);
});

test('붙여 넣기(표만): 잔액 줄 없이 지급만, 시간대 없는 날짜는 이 PC 시간대, 오후·다른 시간대, 프로모션 지급', () => {
  const only = 'API credit (Max)\t$12.50 / $100.00\tAPI\t2026-12-01 18:30\t2026-11-01\nSpring promo\t$5 / $10\tAPI, Playground\tDec 3, 2026, 5:00 PM GMT-8\tNov 2, 2026';
  const r = parseBilling(only, { tzOffsetMin: KST });
  assert.equal(r.purchased, null); assert.equal(r.found, true);
  assert.equal(r.grants[0].kind, 'plan'); assert.equal(r.grants[0].plan, 'Max');
  assert.equal(new Date(r.grants[0].expiresAt).toISOString(), '2026-12-01T09:30:00.000Z', '시간대가 없으면 이 PC(+9)');
  assert.equal(r.grants[1].kind, 'promo'); assert.equal(r.grants[1].remaining, 5);
  assert.equal(new Date(r.grants[1].expiresAt).toISOString(), '2026-12-04T01:00:00.000Z', '오후 5시 GMT-8');
  assert.ok(parseBilling('아무것도 없는 글').warnings.includes('nothing'));
});

test('금액·날짜 조각: 음수 꼴, 점 날짜, 12시 오전·오후', () => {
  for (const [s, v] of [['-US$4.33', -4.33], ['US$-4.33', -4.33], ['−$1,234.50', -1234.5], ['USD $7', 7], ['$0.00', 0]]) assert.equal(moneyOf(s), v, s);
  assert.equal(dateIn('2026. 11. 27. 오후 12:05 GMT+9').ms, Date.UTC(2026, 10, 27, 3, 5));
  assert.equal(dateIn('Nov 27, 2026 12:00 AM UTC').ms, Date.UTC(2026, 10, 27, 0, 0));
  assert.equal(dateIn('27 Nov 2026', 0).date, '2026-11-27');
  assert.equal(dateIn('만료 없음'), null);
});

test('가격: 캐시 쓰기 5분·1시간, 캐시 읽기, Haiku 5.5 긴 프롬프트, 날짜 꼬리 모델 ID, 모르는 모델', () => {
  assert.equal(modelKey('claude-opus-5-5-20261101'), 'opus-5-5');
  assert.equal(modelKey('claude-sonnet-5'), 'sonnet-5'); assert.equal(modelKey('claude-opus-4-1'), 'opus-4-1'); assert.equal(modelKey('mystery-1'), null);
  // opus-5-5: 입력 4, 5분 쓰기 5, 1시간 쓰기 8, 읽기 0.2, 출력 20 ($/MTok)
  assert.equal(costOf({ model: 'claude-opus-5-5', in: 1e6, out: 1e6, cacheW: 2e6, cacheW1h: 1e6, cacheR: 1e6 }), 4 + 20 + 5 + 8 + 0.2);
  // haiku-5-5 10만 이하 / 넘음
  assert.equal(costOf({ model: 'claude-haiku-5-5', in: 50000, out: 1000, cacheW: 0, cacheR: 40000 }), (50000 * 0.1 + 40000 * 0.01 + 1000 * 0.5) / 1e6);
  assert.equal(costOf({ model: 'claude-haiku-5-5', in: 50000, out: 1000, cacheW: 10000, cacheR: 50000 }), (50000 * 0.5 + 10000 * 0.625 + 50000 * 0.05 + 1000 * 2.5) / 1e6);
  assert.equal(costOf({ model: 'mystery', in: 5, out: 5 }), null);
  assert.equal(costOf({ model: 'mystery', in: 0, out: 0 }), 0, '토큰이 없으면 0(실패한 요청)');
  // 중계기 탭이 1시간 캐시 쓰기를 읽는다(없으면 칸이 없다)
  const t = new UsageTap();
  t.push('data: {"type":"message_start","message":{"model":"claude-opus-5-5","usage":{"input_tokens":3,"cache_creation_input_tokens":500,"cache_creation":{"ephemeral_5m_input_tokens":200,"ephemeral_1h_input_tokens":300},"cache_read_input_tokens":0,"output_tokens":1}}}\n');
  assert.deepEqual(t.end(), { model: 'claude-opus-5-5', in: 3, out: 1, cacheW: 500, cacheR: 0, cacheW1h: 300 });
  // ep cli(대화형)는 월 크레딧이 덮지 않는 지출
  const it = relayItems([{ at: 1, model: 'claude-opus-5-5', in: 1e6, out: 0, ep: 'sdk-cli', session: 's' }, { at: 2, model: 'claude-opus-5-5', in: 1e6, out: 0, ep: 'cli' }, { at: 3, refused: 'no_secret' }]);
  assert.deepEqual(it.map((x) => x.covered), [true, false]);
});

test('나누기: 월 크레딧 먼저, 같은 무리는 먼저 만료되는 것부터, 대화형은 월 크레딧을 건너뛰고, 만료 뒤·본 때 전 지출은 받지 않고, 넘치면 구매(음수)', () => {
  const T0 = Date.UTC(2026, 10, 25, 0);
  const ledger = {
    pastedAt: T0,
    purchased: { balance: 1, seenAt: T0 },
    grants: [
      { id: 'late', kind: 'plan', remaining: 200, expiresAt: T0 + 30 * D, seenAt: T0 },
      { id: 'soon', kind: 'plan', remaining: 10, expiresAt: T0 + 2 * D, seenAt: T0 },
      { id: 'promo', kind: 'promo', remaining: 5, expiresAt: T0 + 1 * D, seenAt: T0 },
    ],
  };
  const a = allocate(ledger, [
    { at: T0 - H, usd: 50, covered: true }, // 붙여 넣기 전: 빼지 않는다
    { at: T0 + H, usd: 12, covered: true }, // soon 10 → late 2
    { at: T0 + 2 * H, usd: 3, covered: false }, // 대화형: promo 3
    { at: T0 + 3 * D, usd: 4, covered: true }, // soon 만료 뒤: late 4
    { at: T0 + 3 * D, usd: 9, covered: false }, // promo 만료 뒤: 구매 1 → -8
  ]);
  assert.deepEqual(a.grants.soon, { spent: 10, left: 0 });
  assert.deepEqual(a.grants.late, { spent: 6, left: 194 });
  assert.deepEqual(a.grants.promo, { spent: 3, left: 2 });
  assert.equal(a.purchasedSpent, 9); assert.equal(a.purchasedLeft, -8);
  // 시간 칸이 붙여 넣은 때에 걸치면 걸친 비율만(1시간 칸의 뒤 15분 = 1/4)
  const b = allocate({ pastedAt: T0 + 45 * 60000, grants: [{ id: 'g', kind: 'plan', remaining: 100, seenAt: T0 + 45 * 60000 }] }, [{ at: T0, end: T0 + H, usd: 8 }]);
  assert.equal(b.grants.g.spent, 2);
  // 손으로 고친 지급(본 때가 늦음)은 그 전 지출을 받지 않는다
  const c = allocate({ pastedAt: T0, grants: [{ id: 'old', kind: 'plan', remaining: 5, seenAt: T0 }, { id: 'new', kind: 'plan', remaining: 5, seenAt: T0 + 5 * H, expiresAt: T0 + D }] }, [{ at: T0 + H, usd: 4 }]);
  assert.equal(c.grants.new.spent, 0); assert.equal(c.grants.old.spent, 4);
});

test('보기: 합계·남은 날·곧 만료·바닥·다음 지급·세션별 금액·공식과 중계기 합치기', () => {
  const now = Date.UTC(2026, 10, 25, 12);
  const ledger = { pastedAt: now - 2 * H, purchased: { balance: -4.33, due: true, seenAt: now - 2 * H }, autoReload: false, plan: { name: 'Ultra', amount: 200, day: 24 },
    grants: [cleanGrant({ name: 'API credit (Ultra)', total: 130.33, remaining: 127.11, expiresAt: Date.UTC(2026, 10, 27), grantedOn: '2026-10-24' }, { now: now - 2 * H }), cleanGrant({ name: 'API credit (Ultra)', total: 200, remaining: 200, expiresAt: Date.UTC(2026, 11, 27), grantedOn: '2026-11-24' }, { now: now - 2 * H })] };
  const recs = [{ at: now - H, session: 's1', ep: 'sdk-cli', model: 'claude-opus-5-5', in: 1e6, out: 1e5, cacheW: 0, cacheR: 0, status: 200 }, { at: now - H, session: 's1', model: 'mystery', in: 3, out: 3, status: 200, ep: 'sdk-cli' }];
  const v = creditView({ ledger, relayRecs: recs, now });
  assert.equal(v.basis, 'estimate'); assert.equal(v.unpriced, 1);
  assert.equal(v.sessions.s1, 6);
  assert.equal(v.grants[0].spent, 6); assert.equal(v.grants[0].left, 121.11);
  assert.equal(v.grants[0].soon, true); assert.equal(v.grants[1].soon, false);
  assert.deepEqual(v.totals, { plan: 321.11, promo: 0, purchased: -4.33, usable: 321.11 });
  assert.equal(v.purchased.due, true); assert.equal(v.exhausted, false);
  assert.equal(v.expiring.length, 1);
  assert.ok(v.nextGrant && v.nextGrant.amount === 200 && /^2026-12-24$/.test(v.nextGrant.date));
  // 공식: [from, coveredUntil) 시간은 공식 칸, 그 밖은 중계기
  const official = { at: now, from: now - 3 * H, to: now + H, coveredUntil: now - H / 2, refreshedAt: now - H / 2, rows: [{ s: now - 2 * H, e: now - H, usd: 30 }] };
  const w = creditView({ ledger, relayRecs: recs, official, now });
  assert.equal(w.basis, 'official');
  assert.equal(w.grants[0].spent, 30, '공식 칸 안의 중계기 기록은 두 번 세지 않는다');
  const late = creditView({ ledger, relayRecs: [{ ...recs[0], at: now - 10 * 60000 }], official, now });
  assert.equal(late.grants[0].spent, 36, '공식 값이 아직 없는 시간은 중계기 추정을 더한다');
  // 바닥
  const empty = creditView({ ledger: { ...ledger, grants: [] }, now });
  assert.equal(empty.exhausted, true);
  const slim = slimView(v); assert.equal(slim.grants.length, 2); assert.equal(slim.totals.usable, 321.11);
  assert.deepEqual(nextGrantOf({ day: 31, amount: 200 }, new Date(2026, 1, 10).getTime()).date, '2026-02-28', '짧은 달은 마지막 날');
  assert.deepEqual(planGuess(parseBilling(KO_PAGE).grants), { name: 'Ultra', amount: 200, day: 24 });
  // atrium usage 줄
  const lines = creditLines(v, now).join('\n');
  assert.match(lines, /쓸 수 있음 \$321\.11/); assert.match(lines, /API credit \(Ultra\)\[월\]: \$121\.11 \/ \$130\.33/); assert.match(lines, /구매 잔액 -\$4\.33\(미납\)/); assert.match(lines, /다음 지급 예정: 2026-12-24 \$200\.00/); assert.match(lines, /곧 만료/);
  assert.ok(usageLines({ providers: {}, apiCredits: v }, now).some((l) => l.startsWith('API 크레딧')));
});

// 판 흉내: 판 기록 meta, 결정 카드 저장소, 알림
function fakeBoard() {
  const meta = new Map(); const cards = []; const events = []; const sent = [];
  const decStore = {
    addDecision: (d) => { const c = { ...d, id: cards.length + 1, state: 'open' }; cards.push(c); return c; },
    endDecision: (id, o) => { const c = cards.find((x) => x.id === id); if (!c || c.state !== 'open') return null; c.state = o.state; c.via = o.via; return c; },
  };
  return { cards, events, sent, meta, b: { store: { getMeta: (k) => meta.get(k) ?? null, setMeta: (k, v) => meta.set(k, JSON.parse(JSON.stringify(v))), addEvent: (...a) => events.push(a) }, api: { broadcast: (e, v) => sent.push([e, v]) }, decisions: { store: () => decStore, changed: () => {} }, features: { settings: { get: () => ({ language: 'ko' }) } }, log: () => {} } };
}

test('만료 알림: 지급마다 한 번, 판 "나중에" 카드, 만료 뒤 카드를 닫고, 판이 다시 떠도 다시 알리지 않는다', () => {
  let now = Date.UTC(2026, 10, 25, 0);
  const fb = fakeBoard();
  const relay = { allRequests: () => [], adminPresent: () => false };
  const book = new CreditBook(fb.b, { relay, now: () => now });
  const pv = book.preview(KO_PAGE);
  assert.equal(pv.grants.length, 2); assert.deepEqual(pv.planGuess, { name: 'Ultra', amount: 200, day: 24 });
  assert.equal(fb.meta.size, 0, '미리 보기는 저장하지 않는다');
  book.saveParsed(pv);
  const alerts = fb.sent.filter(([e]) => e === 'credits.alert');
  assert.equal(alerts.length, 1, '11/27 지급만(3일 안)');
  assert.equal(fb.cards.length, 1);
  const card = fb.cards[0];
  assert.equal(card.sessionId, BOARD_CARD_SID); assert.equal(card.kind, 'later'); assert.ok(card.cond);
  assert.equal(card.question, expiryCardText({ name: 'API credit (Ultra)', left: 127.11, expiresAt: Date.UTC(2026, 10, 27) }, 'ko').question);
  assert.match(card.question, /^API credit \(Ultra\) \$127\.11이 11\/27 \d{2}:00에 만료$/);
  book.checkAlerts(); book.checkAlerts();
  assert.equal(fb.cards.length, 1, '다시 알리지 않는다');
  // 판이 다시 뜸(같은 기록)
  const book2 = new CreditBook(fb.b, { relay, now: () => now });
  book2.checkAlerts();
  assert.equal(fb.cards.length, 1);
  // 만료가 지나면 카드를 닫는다
  now = Date.UTC(2026, 10, 27, 1);
  book2.cache = null; book2.checkAlerts();
  assert.equal(fb.cards[0].state, 'closed'); assert.equal(fb.cards[0].via, 'credit_over');
  // 손 편집: 더하기·고치기·지우기, 바닥이면 SDK 띄우기 경고
  const id = book2.view().grants[0].id;
  book2.grantOp({ op: 'update', id, grant: { remaining: 0 } });
  assert.equal(book2.view().grants.find((g) => g.id === id).remaining, 0);
  for (const g of book2.view().grants) book2.grantOp({ op: 'remove', id: g.id });
  assert.equal(book2.view().grants.length, 0);
  book2.setPurchased({ balance: -1 });
  assert.equal(book2.spawnWarning().key, 'apiCredits.exhaustedWarn');
  book2.grantOp({ op: 'add', grant: { name: 'Promo', total: 10, remaining: 10, expiresAt: now + 30 * D } });
  assert.equal(book2.spawnWarning(), null);
  assert.throws(() => book2.grantOp({ op: 'add', grant: { name: '', remaining: 1 } }), (e) => e.key === 'apiCredits.err.name');
  assert.throws(() => book2.setPlan({ day: 40 }), (e) => e.key === 'apiCredits.err.day');
});

test('비용 조회 경로와 답 읽기(beta 칸, 센트 → 달러, 다음 쪽)', () => {
  const q = costQuery({ from: Date.UTC(2026, 10, 1), to: Date.UTC(2026, 10, 2), page: 'page_x' });
  assert.match(q, /^\/v1\/organizations\/analytics\/cost\?/);
  assert.match(q, /starting_at=2026-11-01T00%3A00%3A00Z/); assert.match(q, /time_bucket_width=1h/); assert.match(q, /page=page_x/);
  const r = costRowsOf({ data: [{ starting_at: '2026-11-01T00:00:00Z', ending_at: '2026-11-01T01:00:00Z', cost: { amount: '41280.000000', currency: 'USD' } }], has_more: true, next_page: 'p2', data_refreshed_at: '2026-11-01T05:00:00Z' });
  assert.deepEqual(r, { rows: [{ s: Date.UTC(2026, 10, 1), e: Date.UTC(2026, 10, 1, 1), usd: 412.8 }], refreshedAt: Date.UTC(2026, 10, 1, 5), next: 'p2' });
});

test('Admin 키: 암호문만 디스크에, 비용 조회는 자식이 키를 붙여 묻고(beta·쪽 넘김), 답·로그·상태·보기에 키 값이 없음, 실패도 값 없이', { skip: !win && 'DPAPI는 Windows만' }, async () => {
  const dir = tmp();
  const admin = fakeKey('sk-ant-admin01-');
  const apiKey = fakeKey();
  const seen = [];
  let mode = 'ok';
  const up = http.createServer((q, s) => {
    seen.push({ url: q.url, key: q.headers['x-api-key'] || null, beta: q.headers['anthropic-beta'] || null, ver: q.headers['anthropic-version'] || null });
    q.resume();
    if (mode === 'bad') { s.writeHead(401, { 'content-type': 'application/json' }); return s.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: `bad key ${q.headers['x-api-key']}` } })); }
    const u = new URL(q.url, 'http://x');
    const page2 = u.searchParams.get('page') === 'p2';
    s.writeHead(200, { 'content-type': 'application/json' });
    s.end(JSON.stringify(page2
      ? { data: [{ starting_at: '2026-11-25T01:00:00Z', ending_at: '2026-11-25T02:00:00Z', cost: { amount: '250.000000' } }], has_more: false, next_page: null, data_refreshed_at: '2026-11-25T03:00:00Z' }
      : { data: [{ starting_at: '2026-11-25T00:00:00Z', ending_at: '2026-11-25T01:00:00Z', cost: { amount: '1000.000000' } }], has_more: true, next_page: 'p2', data_refreshed_at: '2026-11-25T03:00:00Z' }));
  });
  await new Promise((r) => up.listen(0, '127.0.0.1', r));
  const logs = [];
  const r = new AuthRelay({ dataDir: dir, upstream: `http://127.0.0.1:${up.address().port}`, log: (m) => logs.push(m) });
  try {
    await r.setKey(apiKey);
    const res = await r.setAdminKey(admin);
    assert.deepEqual(res, { adminKeyPresent: true });
    const onDisk = fs.readFileSync(path.join(dir, 'auth-relay', 'admin.bin'), 'utf8');
    assert.ok(!onDisk.includes(admin) && onDisk.length > 50, '디스크에는 암호문만');
    assert.equal(r.status().adminKeyPresent, true);
    const out = await r.queryCost({ from: Date.UTC(2026, 10, 25, 0), to: Date.UTC(2026, 10, 25, 4) });
    assert.equal(out.pages, 2);
    assert.deepEqual(out.rows.map((x) => x.usd), [10, 2.5]);
    assert.equal(out.refreshedAt, Date.UTC(2026, 10, 25, 3));
    assert.equal(seen.length, 2);
    for (const x of seen) { assert.equal(x.key, admin, 'Admin 키는 자식이 붙인다'); assert.equal(x.beta, 'analytics-usage-cost-2026-08-24'); assert.ok(x.ver); assert.match(x.url, /^\/v1\/organizations\/analytics\/cost\?/); }
    // 장부 책이 공식 값을 쓴다
    const fb = fakeBoard();
    let now = Date.UTC(2026, 10, 25, 4);
    const book = new CreditBook(fb.b, { relay: r, now: () => now });
    book.saveParsed({ grants: [{ name: 'API credit (Ultra)', total: 200, remaining: 200, expiresAt: Date.UTC(2026, 11, 27) }] });
    await book.refreshOfficial({ force: true });
    const v = book.view();
    assert.equal(v.basis, 'official'); assert.equal(v.adminKey, true);
    // 실패: 까닭만(키 없음)
    mode = 'bad';
    await assert.rejects(() => r.queryCost({ from: Date.UTC(2026, 10, 25, 0), to: Date.UTC(2026, 10, 25, 4) }), (e) => e.code === 'cost_failed' && e.vars.why === 'http_401:authentication_error' && !e.message.includes(admin));
    await book.refreshOfficial({ force: true });
    const v2 = book.view();
    assert.equal(v2.officialError, 'http_401:authentication_error');
    const all = JSON.stringify([v, v2, r.status(), fb.meta.get('apiCredits'), fb.sent, fb.events]) + logs.join('\n') + (fs.existsSync(r.logFile) ? fs.readFileSync(r.logFile, 'utf8') : '');
    for (const k of [admin, apiKey]) assert.ok(!all.includes(k), '답·로그·기록·알림에 키 값이 없다');
    assert.deepEqual(await r.removeAdminKey(), { adminKeyPresent: false });
    assert.equal(fs.existsSync(path.join(dir, 'auth-relay', 'admin.bin')), false);
    await assert.rejects(() => r.queryCost({ from: 0, to: 1 }), (e) => e.code === 'no_admin_key');
    void now;
  } finally { await r.stop(); up.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
