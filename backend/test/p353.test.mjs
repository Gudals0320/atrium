// P353: 휴대폰 전용 페이지의 요약 API(phone.mjs)와 휴대폰 연결의 이벤트 거르기(api.mjs broadcast)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowOf, lineOf, askOf, cardsOf, PhoneFeed, phoneRoute, GONE_MAX, LINE_MAX } from '../src/phone.mjs';
import { ApiServer } from '../src/api.mjs';
import { KEY_NAMES } from '../src/keys.mjs';

const long = (n) => 'x'.repeat(n);
// 판 요약을 흉내(실제 summary의 큰 칸들까지 넣어 줄이 그것을 버리는지 본다)
function sum(i, over = {}) {
  return {
    sessionId: 'id-' + String(i).padStart(4, '0') + '-aaaaaaaa-bbbb-cccc-dddddddddddd', name: 's' + i, workspaceKey: 'c:/w/ws' + (i % 5), kind: i % 4 ? 'claude' : 'shell', state: i % 3 ? 'sleeping' : 'ready',
    createdAt: 1e12 + i, lastActivityAt: 1e12 + i * 10, lastAnswer: long(300) + '\nsecond', lastPrompt: long(300), lastAnswerAt: 1e12, parentSessionId: i > 5 ? 'id-0001-aaaaaaaa-bbbb-cccc-dddddddddddd' : null,
    model: 'claude-haiku-5-5', cwd: 'c:/w/ws' + (i % 5), git: { isRepo: true, branch: 'dev', changedFiles: 3 }, hooks: { count: 40 }, trust: {}, resume: { registered: true }, sleep: { at: 1, memMB: 400 },
    turn: { startedAt: 1, endedAt: 2 }, background: null, shell: i % 4 ? null : { atPrompt: true, command: 'ls -la', program: false }, ...over,
  };
}

test('세션 줄: 목록에 쓰는 칸만, 한 줄은 120자, 큰 칸(답·지시 전문, git, hook)은 뺀다', () => {
  const r = rowOf(sum(1));
  assert.equal(r.name, 's1'); assert.equal(r.state, 'sleeping'); assert.equal(r.model, 'haiku-5-5');
  assert.ok(r.line.text.length <= LINE_MAX + 1, '끝의 … 하나');
  for (const k of ['lastAnswer', 'lastPrompt', 'git', 'hooks', 'trust', 'resume', 'cwd', 'turn']) assert.ok(!(k in r), k);
});

test('세션 60개의 처음 줄 모음은 30KB 아래', () => {
  const rows = Array.from({ length: 60 }, (_, i) => rowOf(sum(i)));
  const bytes = JSON.stringify(rows).length;
  assert.ok(bytes < 30000, String(bytes));
});

test('한 줄: 권한 질문은 도구 이름을 떼고, 셸은 명령, 일하는 중이면 지시', () => {
  assert.deepEqual(lineOf({ state: 'waiting', ask: { kind: 'permission', tool: 'Bash', summary: 'Bash: mkdir x' } }), { kind: 'ask', key: 'permission', tool: 'Bash', text: 'mkdir x' });
  assert.equal(lineOf({ state: 'ready', kind: 'shell', shell: { command: 'npm test' } }).text, 'npm test');
  assert.equal(lineOf({ state: 'working', lastPrompt: 'do it\nmore', lastAnswer: 'old' }).text, 'do it');
  assert.equal(lineOf({ state: 'trust_wait' }).key, 'trust');
});

test('기다리는 요청은 보기 번호와 짧은 글만', () => {
  const a = askOf({ kind: 'permission', tool: 'Bash', toolUseId: 't1', since: 5, question: 'Do you want to proceed?', choices: [{ n: 1, label: 'Yes', selected: true }, { n: 2, label: long(200) }], suggestions: [{ a: 1 }] });
  assert.equal(a.choices.length, 2); assert.ok(a.choices[1].label.length <= 61); assert.ok(!('suggestions' in a));
});

test('판 버전: 바뀐 줄만 오르고, since 뒤의 차이와 지운 세션만 준다. boot가 다르면 모두', () => {
  const f = new PhoneFeed({ boot: 'b1' });
  f.refresh([sum(1), sum(2), sum(3)]);
  const r0 = f.rev;
  assert.equal(f.touch(sum(1)), null, '그대로면 오르지 않는다');
  const x = f.touch(sum(2, { state: 'working' }));
  assert.equal(x.rev, r0 + 1);
  f.refresh([sum(1), sum(2, { state: 'working' })]); // s3 사라짐
  const d = f.since(r0, 'b1');
  assert.equal(d.full, false);
  assert.deepEqual(d.rows.map((r) => r.name), ['s2']);
  assert.deepEqual(d.gone, [sum(3).sessionId]);
  assert.equal(f.since(r0, 'other').full, true);
  assert.equal(f.since(r0, 'other').rows.length, 2);
  assert.equal(f.since(f.rev + 5, 'b1').full, true, '판보다 앞선 버전(모르는 값)은 모두');
});

test('지운 기록이 넘치면 그보다 앞의 since는 모두 받는다', () => {
  const f = new PhoneFeed({ boot: 'b' });
  for (let i = 0; i < GONE_MAX + 5; i++) { f.touch(sum(i)); }
  const early = 1;
  for (let i = 0; i < GONE_MAX + 5; i++) f.remove(sum(i).sessionId);
  assert.equal(f.since(early, 'b').full, true);
});

test('휴대폰 이벤트: 줄이 바뀔 때만 phone.row, 할 일은 짧게, 전달은 연 세션만, 큰 판 이벤트는 버린다', () => {
  const f = new PhoneFeed({ boot: 'b' });
  const b = { sessions: new Map(), summary: (s) => s };
  const r1 = phoneRoute(f, b, 'session.updated', sum(1));
  assert.equal(r1()[0], 'phone.row');
  assert.equal(phoneRoute(f, b, 'session.updated', sum(1)), null, '그대로면 보내지 않는다');
  assert.equal(phoneRoute(f, b, 'session.removed', { sessionId: sum(1).sessionId })()[0], 'phone.gone');
  const c = phoneRoute(f, b, 'decision.changed', { cards: [{ id: 1, kind: 'decide', sessionId: 'x', name: 'a', question: 'q', options: ['y'], why: long(900), createdAt: 1, cmds: [1, 2], timingBy: 'agent' }] })();
  assert.equal(c[0], 'phone.cards'); assert.ok(c[1].cards[0].why.length <= 301); assert.ok(!('cmds' in c[1].cards[0]));
  const dv = phoneRoute(f, b, 'delivery', { deliveryId: 'd1', sessionId: 'S', status: 'queued', text: long(500) });
  assert.equal(dv({ phoneOpen: 'S' })[0], 'delivery'); assert.ok(dv({ phoneOpen: 'S' })[1].text.length <= 121);
  assert.equal(dv({ phoneOpen: 'T' }), null);
  for (const e of ['resources', 'board.changed', 'thread.item', 'usage.updated', 'convo.nodes', 'clients.updated', 'link.updated']) assert.equal(phoneRoute(f, b, e, {}), null, e);
  assert.deepEqual(phoneRoute(f, b, 'settings.updated', { language: 'ko', big: long(5000) })(), ['phone.settings', { language: 'ko' }]);
});

test('broadcast: 휴대폰 연결은 판 이벤트를 받지 않고 휴대폰 이벤트만, 판 연결은 그대로, 전체 맵을 연 휴대폰 연결은 둘 다', () => {
  const api = new ApiServer({ token: 't', handlers: {} });
  const got = { board: [], phone: [], both: [] };
  const mk = (k, o) => ({ subscribed: true, ...o, sendEvent: (e) => got[k].push(e) });
  api.clients = new Set([mk('board', {}), mk('phone', { phone: true, phoneRows: true }), mk('both', { phone: false, phoneRows: true })]);
  const f = new PhoneFeed({ boot: 'b' });
  let routes = 0;
  api.phoneRoute = (e, d) => { routes++; return phoneRoute(f, { sessions: new Map() }, e, d); };
  api.broadcast('session.updated', sum(1));
  api.broadcast('resources', { big: 1 });
  api.broadcast('delivery', { deliveryId: 'd', sessionId: 'z', status: 'queued' });
  assert.deepEqual(got.board, ['session.updated', 'resources', 'delivery']);
  assert.deepEqual(got.phone, ['phone.row']);
  assert.deepEqual(got.both, ['session.updated', 'phone.row', 'resources', 'delivery']);
  assert.equal(routes, 3, '이벤트마다 한 번만 셈한다');
  api.clients = new Set(); api.close();
});

test('할 일 카드 목록을 짧게', () => { assert.deepEqual(cardsOf([{ id: 2, kind: 'do', sessionId: 's', name: 'n', question: 'q', options: null, createdAt: 3, deferred: true, wakeAt: 9 }]), [{ id: 2, kind: 'do', sessionId: 's', name: 'n', question: 'q', options: [], why: null, createdAt: 3, deferred: true, wakeAt: 9 }]); });

test('빠른 키 y·n도 session.keys 허용 목록에 있다', () => { for (const k of ['esc', 'enter', 'up', 'down', '1', '2', '3', 'y', 'n']) assert.ok(KEY_NAMES.includes(k), k); });
