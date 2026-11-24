// P352 단위 시험: 휴대폰 이상 동작 기록 받기(web.telemetry: 고른 필드만, 묶음·부팅 상한, 처음 보는 오류 종류 알림),
// 부팅 줄의 판단 까닭(why)과 가볍게 열림(lite), 요약(remote.errors, errorSummary)과 CLI 표(formatErrors), 연결 기록 화면은 tele를 빼고 본다
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { WebServer } from '../src/web.mjs';
import { logEntry, RemoteLog } from '../src/remote-log.mjs';
import { teleInfo, errorSummary, formatErrors, sinceMs, TELE_LINE_MAX, TELE_BOOT_MAX, TELE_BATCH_MAX } from '../src/phone-errors.mjs';

const device = (id = 'dev-1', name = 'iPhone') => ({ auth: { kind: 'device', device: { id, name }, meta: { remote: true, browser: 'Safari 27 · iOS' }, tsNode: { id: 'n1', name: 'phone-a' } } });
function board() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p352-'));
  const store = new Store(path.join(dir, 'board.db'));
  const tailscale = { status: () => null, on: () => {}, off: () => {}, stop: () => {} };
  const web = new WebServer({ cfg: { port: 1, dataDir: dir, profile: 'dev', terminalSession: 'atrium-dev-test' }, store, api: null, tailscale, settings: () => ({ remoteAccess: true }) });
  const sent = [];
  web.sendLocal = (ev, data) => sent.push({ ev, data });
  return { dir, web, sent, done: () => { web.stop(); store.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('teleInfo: 정한 필드만, 모르는 종류는 버림, 줄 하나 TELE_LINE_MAX 안', () => {
  assert.equal(teleInfo({ k: 'nope' }), null);
  const t = teleInfo({ k: 'api', m: 'board.get', code: 'timeout', ms: 5000.4, n: 3, text: 'user secret', token: 'abc', path: 'C:/x', msg: 'a\u0000b' });
  assert.deepEqual(t, { k: 'api', m: 'board.get', code: 'timeout', n: 3, ms: 5000, msg: 'a b' });
  assert.equal(teleInfo({ k: 'api', m: 'has space' }).m, 'other');
  const snap = teleInfo({ k: 'snap', why: 'send', view: 'session', sess: 'worker-1', conn: { ph: 'open', rtt: '42 ms', cl: 2, lc: 1006 }, app: '0.2.4', board: '0.2.4-dev.3', boot: { why: 'fast', lite: true }, scr: { w: 390, h: 844, dpr: 3 },
    steps: [{ s: 'open', t: 10 }], bytes: { 'board.get': 70000, 'bad key': 1 }, errs: ['api board.get timeout'], prev: { view: 'map', up: 2000 } });
  assert.equal(snap.sess, 'worker-1'); assert.deepEqual(snap.bytes, { 'board.get': 70000, other: 1 }); assert.equal(snap.conn.lc, '1006'); assert.equal(snap.prev.up, 2000);
  const big = teleInfo({ k: 'snap', errs: Array(5).fill('e'.repeat(100)), steps: Array.from({ length: 14 }, (_, i) => ({ s: 'msg', t: i, k: 'x'.repeat(30), b: 1 })), bytes: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`method.long.name.${i}`, 1e9])), prev: { view: 'map', steps: Array.from({ length: 14 }, (_, i) => ({ s: 'msg', t: i, k: 'y'.repeat(30), b: 1 })) } });
  assert.ok(JSON.stringify(big).length <= TELE_LINE_MAX);
});

test('logEntry: boot의 why·lite, tele', () => {
  const e = logEntry('boot', { crashed: true, why: 'hidden', lite: true });
  assert.equal(e.why, 'hidden'); assert.equal(e.lite, true);
  assert.equal(logEntry('boot', { why: 'made-up' }).why, undefined);
  assert.equal(logEntry('tele', { tele: { k: 'err', msg: 'x' } }).tele.k, 'err');
});

test('web.telemetry: 짝 맺은 기기만, 줄마다 tele 줄, 묶음·부팅 상한, 처음 보는 오류 종류만 알림, 연결 기록 화면은 tele를 뺀다', () => {
  const b = board();
  try {
    const h = b.web.handlers();
    assert.throws(() => h['web.telemetry']({ lines: [] }, { auth: { kind: 'web' } }), /paired/);
    const r = h['web.telemetry']({ bootAt: 111, lines: [{ k: 'api', m: 'board.get', code: 'timeout', n: 2 }, { k: 'bogus' }, { k: 'bytes', bytes: { 'board.get': 70000 } }] }, device());
    assert.deepEqual(r, { logged: 2 });
    const kinds = b.sent.filter((x) => x.ev === 'remote.errorKind');
    assert.equal(kinds.length, 1); assert.equal(kinds[0].data.m, 'board.get');
    h['web.telemetry']({ bootAt: 112, lines: [{ k: 'api', m: 'board.get', code: 'timeout' }] }, device());
    assert.equal(b.sent.filter((x) => x.ev === 'remote.errorKind').length, 1, '같은 종류는 다시 알리지 않는다');
    assert.ok(!b.sent.some((x) => x.ev === 'remote.logged' && x.data.event === 'tele'), 'tele 줄은 연결 기록 화면을 깨우지 않는다');
    // 한 번에 TELE_BATCH_MAX줄, 부팅마다 TELE_BOOT_MAX줄
    const many = Array.from({ length: 80 }, (_, i) => ({ k: 'api', m: `m${i}`, code: 'x' }));
    assert.equal(h['web.telemetry']({ bootAt: 200, lines: many }, device()).logged, TELE_BATCH_MAX);
    let total = 0;
    for (let i = 0; i < 10; i++) total += h['web.telemetry']({ bootAt: 300, lines: many }, device()).logged;
    assert.equal(total, TELE_BOOT_MAX);
    const shown = h['remote.log']({ limit: 50 }, { auth: { kind: 'local' } }).entries;
    assert.ok(shown.every((e) => e.event !== 'tele'));
    assert.ok(h['remote.log']({ limit: 50, tele: true }, { auth: { kind: 'local' } }).entries.some((e) => e.event === 'tele'));
    assert.throws(() => h['remote.errors']({}, device()), /only the board/);
  } finally { b.done(); }
});

test('web.boot: 판단 까닭(why)과 가볍게 열림(lite)을 남긴다', () => {
  const b = board();
  try {
    b.web.handlers()['web.boot']({ crashed: true, id: 1762500000000, lite: true, why: 'fast', crash: { view: 'map', up: 2000 } }, device());
    const e = b.web.remoteLog.entries.find((x) => x.event === 'boot');
    assert.equal(e.why, 'fast'); assert.equal(e.lite, true);
  } finally { b.done(); }
});

test('errorSummary·formatErrors: 종류별 묶음, 횟수 합, 가까운 상황 기록, 부팅 까닭, 받은 크기', () => {
  let now = 1_800_000_000_000;
  const log = new RemoteLog({ now: () => now });
  const dev = { deviceId: 'd1', deviceName: 'iPhone' };
  log.add('boot', { ...dev, crashed: true, why: 'hidden' });
  log.add('boot', { ...dev, crashed: true, why: 'fast', lite: true });
  log.add('tele', { ...dev, tele: { k: 'send', m: 'session.send', code: 'disconnected', n: 1, at: now } });
  now += 2000;
  log.add('tele', { ...dev, tele: { k: 'snap', why: 'send', at: now, view: 'session', sess: 'worker-1', conn: { ph: 'closed', cl: 3, lc: '1006' }, steps: [{ s: 'open', t: 100 }], bytes: { 'events.subscribe': 160000 }, boot: { why: 'fast', lite: true }, app: '0.2.4', board: '0.2.4' } });
  log.add('tele', { ...dev, tele: { k: 'send', m: 'session.send', code: 'disconnected', n: 2, at: now } });
  log.add('tele', { ...dev, tele: { k: 'err', msg: "Cannot read properties of undefined (reading 'x')", src: 'index.js:1:2', n: 4, at: now } });
  log.add('tele', { ...dev, tele: { k: 'bytes', at: now, bytes: { 'events.subscribe': 160000, 'board.get': 70000 } } });
  now -= 10 * 864e5; log.add('tele', { deviceId: 'd2', deviceName: 'old', tele: { k: 'ws', code: '1006', n: 1, at: now } }); now += 10 * 864e5; // 열흘 전에 받은 줄은 빠진다
  const s = errorSummary(log.entries, { since: now - 864e5 });
  assert.equal(s.groups.length, 2);
  const send = s.groups.find((g) => g.k === 'send');
  assert.equal(send.count, 3); assert.deepEqual(send.devices, ['iPhone']);
  assert.equal(send.ctx.sess, 'worker-1');
  assert.equal(s.boots.n, 2); assert.equal(s.boots.lite, 1); assert.deepEqual(s.boots.why, { hidden: 1, fast: 1 });
  assert.equal(s.bytes.iPhone.bytes['board.get'], 70000);
  const text = formatErrors(s, { sinceText: '최근 1d' });
  assert.match(text, /보내기 실패 session\.send disconnected {2}×3/);
  assert.match(text, /세션 worker-1/); assert.match(text, /events\.subscribe 160K/);
  assert.match(text, /화면 오류 "Cannot read/);
  assert.match(text, /다시 열림 까닭: hidden 1, fast 1/);
  assert.equal(sinceMs('6h'), 6 * 36e5); assert.equal(sinceMs('30m'), 30 * 6e4); assert.equal(sinceMs('2'), 2 * 864e5); assert.equal(sinceMs('x'), 864e5);
});
