// P291: 원격 허용 주소 흔들림(바쁜 PC에서 tailscale CLI가 실패·시간 초과), whois 일시 실패, 421 안내
import test from 'node:test';
import assert from 'node:assert/strict';
import { TailscaleWatch, WhoisCache, settleHosts, certainOff, readWhy, SHRINK_CONFIRM } from '../src/tailscale.mjs';
import { misdirected, misdirectedPage } from '../src/web.mjs';

const NAME = 'pc.example-tailnet.ts.net';
const status = (o = {}) => JSON.stringify({ BackendState: o.state || 'Running', Version: '1.0', Self: { UserID: 1, HostName: 'pc', DNSName: NAME + '.' }, User: { 1: { LoginName: o.login || 'me@example.com' } }, CurrentTailnet: { Name: 'example', MagicDNSSuffix: 'example-tailnet.ts.net', MagicDNSEnabled: true }, CertDomains: [NAME] });
const serve = (port) => JSON.stringify({ Web: { [NAME + ':8443']: { Handlers: { '/': { Proxy: 'http://127.0.0.1:' + port } } } } });
const PORT = 48041;
const FULL = [NAME, NAME + ':443', NAME + ':8443'];

// 상황을 바꿔 가며 읽히는 가짜 tailscale
function fake() {
  const st = { status: 'ok', serve: 'ok', login: 'me@example.com' };
  const run = async (bin, args) => {
    const a = args.join(' ');
    if (a === 'status --json') {
      if (st.status === 'timeout') throw Object.assign(new Error('Command failed: timeout'), { killed: true });
      if (st.status === 'stopped') return status({ state: 'Stopped' });
      if (st.status === 'logout') return status({ state: 'NeedsLogin' });
      if (st.status === 'missing') throw Object.assign(new Error('spawn tailscale ENOENT'), { code: 'ENOENT' });
      return status({ login: st.login });
    }
    if (a === 'serve status --json') { if (st.serve === 'timeout') throw new Error('serve timeout'); return serve(PORT); }
    throw new Error('unexpected ' + a);
  };
  return { st, run };
}

test('상태 읽기 실패·꺼짐 한 번으로 허용 목록이 비지 않는다, 줄어듦은 연속일 때만', async () => {
  const f = fake(); const logs = []; const changes = [];
  const w = new TailscaleWatch({ port: PORT, bin: 't', run: f.run, log: (m) => logs.push(m), onChange: (ts, info) => changes.push(info) });
  await w.refresh();
  assert.deepEqual(w.hosts(), FULL);
  assert.equal(w.selfLogin(), 'me@example.com');
  assert.equal(changes.length, 1); assert.deepEqual(changes[0].added, FULL);
  // 시간 초과(꺼짐으로 읽힘) 두 번: 그대로
  f.st.status = 'timeout';
  await w.refresh(); await w.refresh();
  assert.deepEqual(w.hosts(), FULL, '일시 실패로 비우지 않는다');
  assert.equal(w.selfLogin(), 'me@example.com', '로그인도 그대로');
  assert.match(logs.join('\n'), /keeping hosts 3 \(1\/3\)/);
  assert.match(logs.join('\n'), /status failed/);
  // 한 번 잘 읽히면 셈이 처음으로
  f.st.status = 'ok'; await w.refresh();
  f.st.status = 'stopped'; await w.refresh(); await w.refresh();
  assert.deepEqual(w.hosts(), FULL, 'Stopped 두 번도 그대로');
  await w.refresh();
  assert.deepEqual(w.hosts(), [NAME, NAME + ':443'], '연속 세 번이면 줄인다(꺼지면 serve를 읽지 않아 판의 https 포트 항목이 빠진다)');
  assert.deepEqual(changes.at(-1).removed, [NAME + ':8443']);
  assert.match(changes.at(-1).why, /state Stopped/);
});

test('serve status만 실패하면 마지막으로 잘 읽은 serve로 판의 https 포트 항목을 지킨다', async () => {
  const f = fake(); const logs = [];
  const w = new TailscaleWatch({ port: PORT, bin: 't', run: f.run, log: (m) => logs.push(m) });
  await w.refresh();
  f.st.serve = 'timeout';
  for (let i = 0; i < 5; i++) await w.refresh();
  assert.deepEqual(w.hosts(), FULL, 'hosts 2로 줄지 않는다');
  assert.equal(logs.length, 0, '빌린 serve로 같은 목록이면 줄어듦도 아니다');
  // 처음부터 serve를 못 읽으면 빌릴 것이 없다(2개)
  const g = fake(); g.st.serve = 'timeout';
  const w2 = new TailscaleWatch({ port: PORT, bin: 't', run: g.run });
  await w2.refresh();
  assert.deepEqual(w2.hosts(), [NAME, NAME + ':443']);
  assert.match(readWhy(w2.last), /serve status failed/);
});

test('로그아웃(NeedsLogin)과 Tailscale 없음은 곧바로 줄인다', async () => {
  const f = fake(); const w = new TailscaleWatch({ port: PORT, bin: 't', run: f.run });
  await w.refresh();
  f.st.status = 'logout'; await w.refresh();
  assert.deepEqual(w.hosts(), []); assert.equal(w.selfLogin(), null);
  const g = fake(); const w2 = new TailscaleWatch({ port: PORT, bin: 't', run: g.run });
  await w2.refresh(); g.st.status = 'missing'; await w2.refresh();
  assert.deepEqual(w2.hosts(), []);
});

test('settleHosts: 늘어남은 곧바로, 다른 줄어든 결과가 섞이면 셈을 처음부터', () => {
  const ts = (hosts) => ({ status: { running: true, dnsName: hosts ? NAME : null, login: 'me' }, serve: { board: { port: 8443 } } });
  let a = settleHosts(null, ts(true), null);
  assert.deepEqual(a.hosts, FULL); assert.equal(a.changed, true);
  const err = { error: 'timeout', status: { running: false, backendState: 'Unknown' }, serve: null };
  const two = { status: { running: true, dnsName: NAME, login: 'me' }, serve: { board: null } };
  a = settleHosts(a, err, null); assert.equal(a.held, true); assert.equal(a.n, 1);
  a = settleHosts(a, two, null); assert.equal(a.held, true); assert.equal(a.n, 1, '다른 결과는 다시 1');
  a = settleHosts(a, two, null); a = settleHosts(a, two, null);
  assert.deepEqual(a.hosts, [NAME, NAME + ':443']);
  assert.equal(certainOff(err), false);
  assert.equal(certainOff({ installed: false }), true);
  assert.equal(SHRINK_CONFIRM, 3);
});

const A = '100.101.102.103';
const who = (id) => JSON.stringify({ Node: { StableID: id, Name: 'laptop.example-tailnet.ts.net.', ComputedName: 'laptop' }, UserProfile: { LoginName: 'me@example.com' } });

test('whois 일시 실패: 짧게 다시 묻고, 그래도 실패면 마지막 성공을 짧게 쓴다', async () => {
  let t = 1e6, mode = 'ok', calls = 0;
  const run = async () => { calls++; if (mode === 'fail') throw Object.assign(new Error('timeout'), { killed: true }); if (mode === 'flaky') { mode = 'ok'; throw new Error('once'); } return who(mode === 'other' ? 'nOTHER' : 'nLAPTOP'); };
  const c = new WhoisCache({ bin: 't', run, now: () => t, wait: async () => {} });
  assert.equal((await c.lookup(A)).who.id, 'nLAPTOP');
  // 한 번만 실패: 다시 물어 성공
  t += 61_000; mode = 'flaky'; calls = 0;
  const r1 = await c.lookup(A); assert.equal(r1.ok, true); assert.equal(r1.stale, undefined); assert.equal(calls, 2);
  // 두 번 다 실패: 마지막 성공(stale)
  t += 61_000; mode = 'fail';
  const r2 = await c.lookup(A); assert.equal(r2.ok, true); assert.equal(r2.stale, true); assert.equal(r2.who.id, 'nLAPTOP');
  // 실패 기억(5초) 안에서도 마지막 성공
  assert.equal((await c.lookup(A)).ok, true);
  // 유효 시간(5분)이 지나면 실패
  t += 5 * 60_000;
  assert.deepEqual(await c.lookup(A), { ok: false, reason: 'whois_failed' });
  // 모르는 주소는 빌릴 것이 없다
  assert.equal((await c.lookup('100.101.102.104')).ok, false);
  // 기기가 정말 다르면(whois 성공, 다른 StableID) 그 결과를 준다(nodeCheck가 other_node로 거절)
  mode = 'other'; t += 10_000;
  assert.equal((await c.lookup(A)).who.id, 'nOTHER');
});

test('whois 일시 실패에도 짝 맺은 기기의 /web/me가 통과한다(짝 유지)', async () => {
  const { nodeCheck } = await import('../src/tailscale.mjs');
  let t = 1e6, mode = 'ok';
  const c = new WhoisCache({ bin: 't', run: async () => { if (mode === 'fail') throw new Error('x'); return who('nLAPTOP'); }, now: () => t, wait: async () => {} });
  const req = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: NAME + ':8443', 'x-forwarded-for': A, 'tailscale-user-login': 'me@example.com' } };
  const dev = { id: 'd1', tsNode: { id: 'nLAPTOP', login: 'me@example.com' } };
  assert.equal(nodeCheck(req, dev, await c.lookup(A), PORT).ok, true);
  t += 61_000; mode = 'fail';
  const r = nodeCheck(req, dev, await c.lookup(A), PORT);
  assert.equal(r.ok, true, '일시 실패로 끊지 않는다');
  assert.equal(nodeCheck(req, { id: 'd2', tsNode: { id: 'nOTHER' } }, await c.lookup(A), PORT).reason, 'other_node', '다른 기기는 그대로 거절');
});

test('421: 브라우저 페이지 열기는 사람이 읽을 안내와 다시 읽기, 그 밖은 짧은 글', () => {
  const res = () => { const o = { status: 0, headers: null, body: '' }; return Object.assign(o, { writeHead(s, h) { o.status = s; o.headers = h; }, end(b) { o.body = String(b || ''); } }); };
  const a = res(); misdirected({ method: 'GET', headers: { accept: 'text/html,*/*', 'accept-language': 'ko-KR,ko;q=0.9' } }, a);
  assert.equal(a.status, 421); assert.match(a.headers['content-type'], /text\/html/);
  assert.match(a.body, /판이 이 주소를 잠시 확인하지 못했습니다/); assert.match(a.body, /http-equiv="refresh"/);
  assert.match(a.headers['content-security-policy'], /default-src 'none'/);
  const b = res(); misdirected({ method: 'GET', headers: { accept: 'text/html' } }, b);
  assert.match(b.body, /could not confirm this address/);
  const c = res(); misdirected({ method: 'GET', headers: { accept: 'application/json' } }, c);
  assert.equal(c.body, 'misdirected request');
  assert.doesNotMatch(misdirectedPage('ko'), /<script/i);
});
