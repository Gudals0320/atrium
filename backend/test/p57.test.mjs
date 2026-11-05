// P57(원격 강화 S1) 단위 시험: 짝 맺은 기기를 짝 맺은 Tailscale 기기에 묶는다.
// whois JSON 해석(가짜 출력), tailnet 주소 형식 검사, whois 결과 기억과 만료, 로그인 불일치·다른 노드·whois 실패·옛 기기·이 PC 안 기기의 바깥 사용 거부,
// 같은 노드 허용, 그리고 serve 흉내 요청(HTTP·WebSocket)으로 짝 맺기 → 사용 → 다른 노드에서 같은 자격 거부, 허락 카드의 Tailscale 기기 이름, 진단 줄
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import WebSocket from 'ws';
import { Store } from '../src/store.mjs';
import { ApiServer } from '../src/api.mjs';
import { WebServer } from '../src/web.mjs';
import {
  isTailnetAddr, requestAddr, parseWhois, WhoisCache, whoisMatch, nodeCheck, needsRepair, runTailscale, isReadOnly, TailscaleWatch, diagnose,
  WHOIS_TTL_MS, WHOIS_FAIL_TTL_MS,
} from '../src/tailscale.mjs';
import { checkText } from '../bin/atrium-remote.mjs';
import { fakeWhois } from '../../app/test/e2e/p49-fake-tailscale.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p57-'));
const NAME = 'pc.example.ts.net';
const PORT = 47876;
const A = '100.64.0.2', B = '100.64.0.3', OTHER = '100.64.0.4', TAGGED = '100.64.0.9';
const r = (headers, remoteAddress = '127.0.0.1') => ({ headers, socket: { remoteAddress } });
const viaServe = (ip = A, login = 'me@example.com', extra = {}) => ({ host: NAME, ...(login ? { 'tailscale-user-login': login } : {}), 'x-forwarded-for': ip, 'x-forwarded-proto': 'https', 'x-forwarded-host': NAME, ...extra });

test('whois JSON 해석: 노드 StableID, 이름, 로그인, 태그(가짜 출력과 실제 모양의 키)', () => {
  const w = parseWhois(fakeWhois(A));
  assert.deepEqual(w, { id: 'nFAKE0002CNTRL', name: 'laptop-a', dnsName: 'laptop-a.example.ts.net', login: 'me@example.com', tags: [] });
  assert.deepEqual(parseWhois(fakeWhois(TAGGED)).tags, ['tag:server']);
  assert.equal(parseWhois(fakeWhois(TAGGED)).login, 'tagged-devices');
  // ComputedName이 없으면 Name의 첫 마디
  const j = fakeWhois(B); delete j.Node.ComputedName;
  assert.equal(parseWhois(j).name, 'laptop-b');
  // 모양이 틀리면 null
  for (const bad of [null, {}, { Node: {} }, { Node: { StableID: '' }, UserProfile: {} }, { Node: { StableID: 'x' } }, { Node: { StableID: 5 }, UserProfile: {} }]) assert.equal(parseWhois(bad), null, JSON.stringify(bad));
});

test('주소 형식: tailnet 주소(100.64.0.0/10, fd7a:115c:a1e0::/48)만, 쉼표 여럿·빈 값·포트·다른 범위는 거부', () => {
  for (const ok of ['100.64.0.1', '100.127.255.254', '100.100.100.100', 'fd7a:115c:a1e0::1', 'fd7a:115c:a1e0:ab12:4843:cd96:6258:b240', 'FD7A:115C:A1E0::abcd']) assert.ok(isTailnetAddr(ok), ok);
  for (const bad of ['', ' ', '100.63.255.255', '100.128.0.1', '10.0.0.1', '127.0.0.1', '192.168.0.2', '100.64.0.2:443', '100.64.0.2, 100.64.0.3', '100.64.0.2,100.64.0.3', ' 100.64.0.2', '100.64.00.2', '100.64.0.256', '100.64.0', 'fd7a:115c:a1e1::1', 'fd7a:115c::1', '::1', '::ffff:100.64.0.2', 'fd7a:115c:a1e0::1%eth0', 'fd7a:115c:a1e0::1::2', '--json', 'laptop.example.ts.net', null, undefined, 100]) assert.equal(isTailnetAddr(bad), false, String(bad));
  // 요청에서 주소 꺼내기: 루프백(이 PC의 serve)에서 온 요청의 X-Forwarded-For 한 값만
  assert.equal(requestAddr(r({ 'x-forwarded-for': A })), A);
  assert.equal(requestAddr(r({ 'x-forwarded-for': ` ${A} ` })), A, '앞뒤 빈칸');
  assert.equal(requestAddr(r({ 'x-forwarded-for': `${A}, ${B}` })), null, '쉼표 여럿');
  assert.equal(requestAddr(r({ 'x-forwarded-for': '' })), null, '빈 값');
  assert.equal(requestAddr(r({})), null, '없음');
  assert.equal(requestAddr(r({ 'x-forwarded-for': [A, B] })), null, '배열');
  assert.equal(requestAddr(r({ 'x-forwarded-for': '8.8.8.8' })), null, 'tailnet 밖');
  assert.equal(requestAddr(r({ 'x-forwarded-for': A }, '100.64.0.9')), null, '루프백이 아닌 곳에서 온 요청은 머리글을 믿지 않는다');
  // whois 읽기 명령: 주소가 형식에 맞을 때만
  assert.ok(isReadOnly(['whois', '--json', A]));
  assert.ok(!isReadOnly(['whois', '--json', '8.8.8.8']));
  assert.ok(!isReadOnly(['whois', A]));
  assert.ok(!isReadOnly(['whois', '--json', A, 'extra']));
});

test('읽기 명령 막이: whois는 tailnet 주소만 tailscale에 넘긴다', async () => {
  await assert.rejects(runTailscale('tailscale', ['whois', '--json', '--help']), /read-only/);
  await assert.rejects(runTailscale('tailscale', ['whois', '--json', `${A},${B}`]), /read-only/);
  await assert.rejects(runTailscale('tailscale', ['whois', '--json', '']), /read-only/);
});

test('whois 결과 기억과 만료: 성공은 60초, 실패는 잠깐, 같은 주소 동시 요청은 한 번만 부른다', async () => {
  let t = 1_000_000; const calls = [];
  let fail = false;
  const run = async (bin, args) => { calls.push(args[2]); await new Promise((res) => setTimeout(res, 5)); if (fail) throw new Error('failed to connect to local tailscaled'); const w = fakeWhois(args[2]); if (!w) throw new Error('no match'); return JSON.stringify(w); };
  const c = new WhoisCache({ bin: 'tailscale', run, now: () => t });
  const [x, y] = await Promise.all([c.lookup(A), c.lookup(A)]);
  assert.equal(x.ok, true); assert.equal(y.who.id, 'nFAKE0002CNTRL');
  assert.deepEqual(calls, [A], '동시 요청은 한 번');
  t += WHOIS_TTL_MS - 1; await c.lookup(A); assert.equal(calls.length, 1, '60초 안은 기억');
  t += 2; fail = true;
  assert.deepEqual(await c.lookup(A), { ok: false, reason: 'whois_failed' }, '만료 뒤 다시 읽고, 실패하면 실패');
  assert.equal(calls.length, 2);
  t += WHOIS_FAIL_TTL_MS - 1; await c.lookup(A); assert.equal(calls.length, 2, '실패도 잠깐 기억');
  fail = false; t += 2;
  assert.equal((await c.lookup(A)).ok, true); assert.equal(calls.length, 3);
  assert.deepEqual(await c.lookup('100.64.0.77'), { ok: false, reason: 'whois_failed' }, '모르는 주소');
  assert.deepEqual(await c.lookup('8.8.8.8'), { ok: false, reason: 'bad_addr' });
  assert.equal(calls.includes('8.8.8.8'), false, '형식이 틀리면 부르지 않는다');
  assert.deepEqual(await new WhoisCache({ bin: null, run }).lookup(A), { ok: false, reason: 'disabled' }, 'ATRIUM_TAILSCALE=none');
  // 모양이 틀린 출력
  assert.deepEqual(await new WhoisCache({ bin: 't', run: async () => '{"Node":{}}' }).lookup(A), { ok: false, reason: 'unknown_node' });
  assert.deepEqual(await new WhoisCache({ bin: 't', run: async () => 'not json' }).lookup(A), { ok: false, reason: 'whois_failed' });
  // 상한: 오래된 것부터 버린다
  const small = new WhoisCache({ bin: 't', run, now: () => t, max: 2 });
  await small.lookup(A); await small.lookup(B); await small.lookup(OTHER);
  assert.deepEqual([...small.map.keys()], [B, OTHER]);
  // 시간 초과: run이 실패로 끝나면 실패(runTailscale은 RUN_TIMEOUT_MS에 끝낸다)
  const slow = new WhoisCache({ bin: 't', run: () => Promise.reject(Object.assign(new Error('timeout'), { killed: true, signal: 'SIGTERM' })) });
  assert.equal((await slow.lookup(A)).ok, false);
});

test('기기 확인(순수): 로그인 불일치·다른 노드·whois 실패·옛 기기·이 PC 안 기기는 바깥에서 거부, 같은 노드만 허용', () => {
  const ok = (ip) => ({ ok: true, who: parseWhois(fakeWhois(ip)) });
  const devA = { id: 'd1', name: 'my laptop', origin: 'tailscale', tsNode: { id: 'nFAKE0002CNTRL', name: 'laptop-a', login: 'me@example.com' } };
  // 같은 노드
  assert.deepEqual(nodeCheck(r(viaServe(A)), devA, ok(A), PORT), { ok: true, remote: true, reason: null, node: { id: 'nFAKE0002CNTRL', name: 'laptop-a', login: 'me@example.com' } });
  assert.equal(nodeCheck(r(viaServe(A, 'ME@example.com')), devA, ok(A), PORT).ok, true, '로그인 대소문자 무시');
  // 다른 노드(같은 사용자)
  assert.equal(nodeCheck(r(viaServe(B)), devA, ok(B), PORT).reason, 'other_node');
  // 로그인 불일치: 머리글은 me, whois는 other
  assert.equal(nodeCheck(r(viaServe(OTHER, 'me@example.com')), devA, ok(OTHER), PORT).reason, 'login_mismatch');
  assert.equal(whoisMatch(r(viaServe(OTHER, 'me@example.com')), ok(OTHER)).ok, false);
  // 머리글 없음(태그 기기): whois 로그인 tagged-devices와 다르다
  assert.equal(whoisMatch(r(viaServe(TAGGED, null)), ok(TAGGED)).reason, 'login_mismatch');
  // whois 실패
  assert.equal(nodeCheck(r(viaServe(A)), devA, { ok: false, reason: 'whois_failed' }, PORT).reason, 'whois_failed');
  assert.equal(nodeCheck(r(viaServe(A)), devA, null, PORT).reason, 'whois_failed', '결과 없음도 거부');
  // tsNode 없는 옛 기기(이 작업 전에 바깥에서 짝 맺음)
  const legacy = { id: 'd0', name: 'old', via: 'code' };
  assert.equal(nodeCheck(r(viaServe(A)), legacy, ok(A), PORT).reason, 'not_bound');
  assert.ok(needsRepair(legacy)); assert.ok(!needsRepair(devA));
  // 이 PC 안에서 짝 맺은 기기
  const local = { id: 'd2', name: 'pc browser', origin: 'local' };
  assert.equal(nodeCheck(r(viaServe(A)), local, ok(A), PORT).reason, 'local_only');
  assert.ok(!needsRepair(local));
  // 이 PC 안 요청은 기기 확인이 상관없다
  for (const d of [devA, legacy, local]) assert.equal(nodeCheck(r({ host: `127.0.0.1:${PORT}` }), d, null, PORT).ok, true);
  // 같은 노드라도 기록한 로그인과 다르면 거부
  assert.equal(nodeCheck(r(viaServe(A)), { ...devA, tsNode: { ...devA.tsNode, login: 'someone@example.com' } }, ok(A), PORT).reason, 'other_user');
});

test('진단: "짝 맺은 기기는 Tailscale 기기에 묶임" 줄과 묶이지 않은 옛 기기 수', () => {
  const ctx = { port: PORT, hosts: [], devices: 2, built: true, sameUser: true, allowed: [] };
  const line = (unbound) => diagnose({ installed: false, disabled: true }, { ...ctx, unbound }).checks.find((c) => c.id === 'nodes');
  assert.deepEqual(line(0), { id: 'nodes', level: 'ok', vars: { n: 0 } });
  assert.deepEqual(line(2), { id: 'nodes', level: 'warn', vars: { n: 2 } });
  assert.equal(line(undefined).level, 'skip', '백엔드 없이 읽으면 모름');
  assert.match(checkText(line(0), PORT), /Tailscale 기기에 묶임/);
  assert.match(checkText(line(2), PORT), /옛 기기 2대/);
});

// ---------- HTTP·WebSocket(serve 흉내 머리글) ----------
const fakeRun = (state) => async (bin, args) => {
  const a = args.join(' ');
  if (a === 'status --json') return JSON.stringify({ BackendState: 'Running', Self: { DNSName: `${NAME}.`, UserID: 1 }, User: { 1: { LoginName: 'me@example.com' } }, CurrentTailnet: { MagicDNSEnabled: true }, CertDomains: [NAME] });
  if (a === 'serve status --json') return JSON.stringify({ Web: { [`${NAME}:443`]: { Handlers: { '/': { Proxy: `http://127.0.0.1:${state.port}` } } } } });
  if (args[0] === 'whois') { state.whois.push(args[2]); if (state.whoisDown) throw new Error('failed to connect to local tailscaled'); const w = fakeWhois(args[2]); if (!w) throw new Error('no match'); return JSON.stringify(w); }
  throw new Error('unexpected');
};
async function boot() {
  const dir = tmp();
  const dist = path.join(dir, 'dist'); fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Atrium</title>');
  process.env.ATRIUM_WEB_DIST = dist;
  const store = new Store(path.join(dir, 'board.db'));
  const srv = http.createServer();
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const port = srv.address().port;
  const state = { port, whois: [], whoisDown: false };
  const tsw = new TailscaleWatch({ port, bin: 'tailscale', run: fakeRun(state) });
  await tsw.refresh();
  const logs = [];
  const web = new WebServer({ cfg: { port, dataDir: dir, profile: 'dev', herdrSession: 'atrium-dev-test' }, store, api: null, tailscale: tsw, log: (m) => logs.push(m) });
  const apiToken = 'board-api-token-for-test';
  const api = new ApiServer({ token: apiToken, handlers: { ...web.handlers(), whoami: (p, c) => ({ kind: c.auth.kind, remote: c.remote, tsNode: c.auth.tsNode || null }) }, authorize: (req) => web.authorize(req, apiToken), onClose: () => {} });
  web.api = api;
  srv.on('request', (req, res) => { if (web.handleHttp(req, res)) return; res.writeHead(404); res.end(); });
  srv.on('upgrade', (req, s, h) => api.handleUpgrade(req, s, h));
  const close = async () => { api.close(); web.stop(); tsw.stop(); await new Promise((res) => srv.close(res)); store.close(); delete process.env.ATRIUM_WEB_DIST; };
  return { port, web, store, apiToken, state, logs, close };
}
const raw = (port, p, { method = 'GET', headers = {}, body } = {}) => new Promise((res, rej) => {
  const q = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (resp) => { const ch = []; resp.on('data', (d) => ch.push(d)); resp.on('end', () => { const t = Buffer.concat(ch).toString(); let j = null; try { j = JSON.parse(t); } catch {} res({ status: resp.statusCode, body: j }); }); });
  q.on('error', rej); if (body) q.write(body); q.end();
});
const wsOpen = (url, headers = {}) => new Promise((res) => {
  const ws = new WebSocket(url, { headers });
  ws.on('open', () => res({ ok: true, ws }));
  ws.on('unexpected-response', (_q, resp) => res({ ok: false, status: resp.statusCode }));
  ws.on('error', () => res({ ok: false }));
});
const wsCall = (ws, method, params = {}) => new Promise((res) => { const id = Math.random(); const on = (m0) => { const m = JSON.parse(String(m0)); if (m.id === id) { ws.off('message', on); res(m); } }; ws.on('message', on); ws.send(JSON.stringify({ id, method, params })); });
const ORIGIN = `https://${NAME}`;
const json = { 'content-type': 'application/json' };

test('serve 흉내: 노트북 A로 코드 짝 맺기 → 사용 → 같은 자격을 노트북 B에서 쓰면 거부', async () => {
  const b = await boot();
  try {
    const local = await wsOpen(`ws://127.0.0.1:${b.port}/api?token=${b.apiToken}`);
    const code = (await wsCall(local.ws, 'device.code')).result.code;
    const pr = await raw(b.port, '/web/pair/code', { method: 'POST', headers: { ...viaServe(A), origin: ORIGIN, ...json }, body: JSON.stringify({ code, name: 'my browser' }) });
    assert.equal(pr.status, 200);
    const token = pr.body.token;
    // 기록에 확인한 Tailscale 기기
    const rec = b.store.getMeta('webDevices')[0];
    assert.deepEqual(rec.tsNode, { id: 'nFAKE0002CNTRL', name: 'laptop-a', login: 'me@example.com' });
    assert.equal(rec.origin, 'tailscale'); assert.equal(rec.name, 'my browser', '브라우저가 보낸 이름은 별칭');
    // A에서 사용
    const auth = { authorization: `Bearer ${token}` };
    assert.equal((await raw(b.port, '/web/me', { headers: { ...viaServe(A), ...auth } })).status, 200);
    const devA = await wsOpen(`ws://127.0.0.1:${b.port}/api?device=${token}`, { ...viaServe(A), origin: ORIGIN });
    assert.equal(devA.ok, true);
    const who = (await wsCall(devA.ws, 'whoami')).result;
    assert.equal(who.remote, true); assert.deepEqual(who.tsNode, { id: 'nFAKE0002CNTRL', name: 'laptop-a' });
    devA.ws.close();
    // 같은 자격을 B에서: HTTP 401(다시 짝 맺기), WebSocket 거부
    const me = await raw(b.port, '/web/me', { headers: { ...viaServe(B), ...auth } });
    assert.equal(me.status, 401); assert.equal(me.body.error.code, 'tailscale_node');
    assert.equal((await raw(b.port, '/web/upload?name=x.txt', { method: 'POST', headers: { ...viaServe(B), origin: ORIGIN, ...auth }, body: 'x' })).status, 401);
    assert.equal((await wsOpen(`ws://127.0.0.1:${b.port}/api?device=${token}`, { ...viaServe(B), origin: ORIGIN })).ok, false);
    // 다른 사용자의 기기, 머리글과 whois 로그인 불일치
    assert.equal((await wsOpen(`ws://127.0.0.1:${b.port}/api?device=${token}`, { ...viaServe(OTHER, 'me@example.com'), origin: ORIGIN })).ok, false);
    assert.equal((await raw(b.port, '/web/me', { headers: { ...viaServe(OTHER, 'me@example.com'), ...auth } })).status, 403);
    // 주소가 없거나 여럿이면 거부
    assert.equal((await raw(b.port, '/web/me', { headers: { ...viaServe(`${A}, ${B}`), ...auth } })).status, 403);
    const noXff = viaServe(A); delete noXff['x-forwarded-for'];
    assert.equal((await raw(b.port, '/web/me', { headers: { ...noXff, ...auth } })).status, 403);
    // 로그: 까닭은 남기고 비밀(토큰)은 남기지 않는다
    assert.ok(b.logs.some((l) => /refused: tailscale node other_node/.test(l)), b.logs.join('\n'));
    assert.ok(!b.logs.some((l) => l.includes(token)));
    // 이 PC 안에서는 그대로 쓴다
    assert.equal((await raw(b.port, '/web/me', { headers: { host: `127.0.0.1:${b.port}`, ...auth } })).status, 200);
    // whois는 주소마다 기억한다(A는 한 번만)
    assert.equal(b.state.whois.filter((x) => x === A).length, 1);
    local.ws.close();
  } finally { await b.close(); }
});

test('serve 흉내: 허락 짝 맺기는 PC 카드에 Tailscale 기기 이름, 다른 기기는 토큰을 받지 못함', async () => {
  const b = await boot();
  try {
    const local = await wsOpen(`ws://127.0.0.1:${b.port}/api?token=${b.apiToken}`);
    const rq = await raw(b.port, '/web/pair/request', { method: 'POST', headers: { ...viaServe(A), origin: ORIGIN, ...json }, body: JSON.stringify({ name: 'Chrome on Windows' }) });
    assert.equal(rq.status, 200);
    const view = (await wsCall(local.ws, 'device.list')).result;
    assert.deepEqual(view.requests[0].tsNode, { name: 'laptop-a', login: 'me@example.com' }, '카드에 Tailscale이 확인한 이름');
    assert.equal(view.requests[0].name, 'Chrome on Windows');
    await wsCall(local.ws, 'device.approve', { id: rq.body.requestId });
    const q = `/web/pair/poll?id=${rq.body.requestId}&secret=${encodeURIComponent(rq.body.secret)}`;
    assert.equal((await raw(b.port, q, { headers: { ...viaServe(B), origin: ORIGIN } })).status, 404, '다른 노드는 같은 요청 비밀로도 못 받는다');
    assert.equal((await raw(b.port, q, { headers: { host: `127.0.0.1:${b.port}`, origin: `http://127.0.0.1:${b.port}` } })).status, 404, '이 PC 안에서도 못 받는다');
    const got = await raw(b.port, q, { headers: { ...viaServe(A), origin: ORIGIN } });
    assert.equal(got.body.status, 'approved');
    const list = (await wsCall(local.ws, 'device.list')).result.devices;
    assert.equal(list[0].tsNode.name, 'laptop-a'); assert.equal(list[0].tsNode.id, 'nFAKE0002CNTRL');
    assert.equal((await wsOpen(`ws://127.0.0.1:${b.port}/api?device=${got.body.token}`, { ...viaServe(A), origin: ORIGIN })).ok, true);
    assert.equal((await wsOpen(`ws://127.0.0.1:${b.port}/api?device=${got.body.token}`, { ...viaServe(B), origin: ORIGIN })).ok, false);
    // 다른 사용자의 기기나 whois와 맞지 않는 요청은 짝 맺기 요청부터 거부
    assert.equal((await raw(b.port, '/web/pair/request', { method: 'POST', headers: { ...viaServe(OTHER, 'me@example.com'), origin: ORIGIN, ...json }, body: '{}' })).status, 403);
    local.ws.close();
  } finally { await b.close(); }
});

test('serve 흉내: 이 PC 안 기기·옛 기기는 바깥에서 거부, whois 실패면 바깥 요청 거부, 진단에 옛 기기 수', async () => {
  const b = await boot();
  try {
    const local = await wsOpen(`ws://127.0.0.1:${b.port}/api?token=${b.apiToken}`);
    // 이 PC 안에서 짝 맺은 기기
    const code = (await wsCall(local.ws, 'device.code')).result.code;
    const pc = await raw(b.port, '/web/pair/code', { method: 'POST', headers: { host: `127.0.0.1:${b.port}`, origin: `http://127.0.0.1:${b.port}`, ...json }, body: JSON.stringify({ code, name: 'pc tab' }) });
    assert.equal(pc.status, 200);
    assert.equal(b.store.getMeta('webDevices')[0].origin, 'local');
    assert.equal(b.store.getMeta('webDevices')[0].tsNode, undefined);
    assert.equal((await raw(b.port, '/web/me', { headers: { host: `127.0.0.1:${b.port}`, authorization: `Bearer ${pc.body.token}` } })).status, 200, '이 PC 안에서는 쓴다');
    const r1 = await raw(b.port, '/web/me', { headers: { ...viaServe(A), authorization: `Bearer ${pc.body.token}` } });
    assert.equal(r1.status, 401); assert.match(r1.body.error.message, /only on this PC/);
    assert.equal((await wsOpen(`ws://127.0.0.1:${b.port}/api?device=${pc.body.token}`, { ...viaServe(A), origin: ORIGIN })).ok, false);
    // 옛 기기: 기록에 tsNode도 origin도 없다(이 작업 전에 바깥에서 짝 맺음). 모르는 필드는 그대로 둔다
    const legacy = b.web.devices.add({ name: 'old laptop', via: 'code' });
    const all = b.store.getMeta('webDevices');
    const i = all.findIndex((d) => d.id === legacy.device.id);
    const { origin, ...old } = all[i]; all[i] = { ...old, futureField: 'kept' }; b.store.setMeta('webDevices', all);
    const r2 = await raw(b.port, '/web/me', { headers: { ...viaServe(A), authorization: `Bearer ${legacy.token}` } });
    assert.equal(r2.status, 401); assert.match(r2.body.error.message, /pair it again/);
    assert.equal((await wsOpen(`ws://127.0.0.1:${b.port}/api?device=${legacy.token}`, { ...viaServe(A), origin: ORIGIN })).ok, false);
    const d = (await wsCall(local.ws, 'remote.status')).result;
    assert.deepEqual(d.checks.find((c) => c.id === 'nodes'), { id: 'nodes', level: 'warn', vars: { n: 1 } }, '이 PC 안 기기는 세지 않는다');
    const listed = (await wsCall(local.ws, 'device.list')).result.devices.find((x) => x.id === legacy.device.id);
    assert.equal(listed.futureField, 'kept'); assert.equal(listed.tsNode, undefined);
    b.web.devices.touch(legacy.device.id, true);
    assert.equal(b.store.getMeta('webDevices').find((x) => x.id === legacy.device.id).futureField, 'kept');
    // whois 실패(Tailscale 꺼짐): 바깥 요청은 짝 맺기도 사용도 거부
    const code2 = (await wsCall(local.ws, 'device.code')).result.code;
    const ok = await raw(b.port, '/web/pair/code', { method: 'POST', headers: { ...viaServe(A), origin: ORIGIN, ...json }, body: JSON.stringify({ code: code2, name: 'a' }) });
    assert.equal(ok.status, 200);
    b.state.whoisDown = true; b.web.tailscale.whoisCache.clear();
    const down = await raw(b.port, '/web/me', { headers: { ...viaServe(A), authorization: `Bearer ${ok.body.token}` } });
    assert.equal(down.status, 403, 'whois 실패는 403(토큰은 버리지 않는다)'); assert.equal(down.body.error.code, 'tailscale_node');
    assert.equal((await wsOpen(`ws://127.0.0.1:${b.port}/api?device=${ok.body.token}`, { ...viaServe(A), origin: ORIGIN })).ok, false);
    const code3 = (await wsCall(local.ws, 'device.code')).result.code;
    assert.equal((await raw(b.port, '/web/pair/code', { method: 'POST', headers: { ...viaServe(B), origin: ORIGIN, ...json }, body: JSON.stringify({ code: code3, name: 'b' }) })).status, 403);
    assert.ok((await wsCall(local.ws, 'device.list')).result.code, 'whois 실패는 코드를 쓰지 않는다');
    local.ws.close();
  } finally { await b.close(); }
});

test('Tailscale 읽기를 끄면(ATRIUM_TAILSCALE=none) 바깥 기기 요청은 모두 거부', async () => {
  const dir = tmp(); const store = new Store(path.join(dir, 'b.db'));
  const web = new WebServer({ cfg: { port: PORT, dataDir: dir, profile: 'dev' }, store, api: null, tailscale: new TailscaleWatch({ port: PORT, bin: null }), settings: () => ({ remoteSameUser: false }) }); // 사용자 제한을 꺼도(P49) 기기 확인은 막는다
  const logs = []; web.log = (m) => logs.push(m);
  const { token } = web.devices.add({ name: 'x', via: 'code', tsNode: { id: 'nFAKE0002CNTRL', name: 'laptop-a', login: 'me@example.com' } });
  const req = { url: `/api?device=${token}`, headers: { ...viaServe(A), host: `127.0.0.1:${PORT}`, origin: `http://127.0.0.1:${PORT}` }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(await web.authorize(req, 'x'), null);
  assert.ok(logs.some((l) => /tailscale node disabled/.test(l)), logs.join('\n'));
  web.stop(); store.close();
});
