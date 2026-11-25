// P359: 판 중계기(auth relay). 머리글 바꾸기, 경로 비밀, 사용량 읽기, 자식 프로세스(가짜 위쪽 서버), 암호문만 디스크에, 값이 로그·답에 없음
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { matchPath, rewriteHeaders, UsageTap, relayUrl, RELAY_PLACEHOLDER, keyOk } from '../src/auth-relay-core.mjs';
import { AuthRelay, usesRelay } from '../src/auth-relay.mjs';

const SECRET = 'abcdefghijklmnopqrstuvwx';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'p359-'));
const fakeKey = () => 'sk-test-' + crypto.randomBytes(24).toString('hex');
// 시험은 OS 보호 저장소 대신 base64 뒤집기(암호문이 평문과 다름만 본다). 자식은 진짜 DPAPI로 푸니 Windows에서는 진짜 protect도 따로 본다
const win = process.platform === 'win32';

test('경로: 비밀 앞머리와 세션, /api/hello와 /v1/*만 지나간다', () => {
  assert.deepEqual(matchPath(`/${SECRET}/sid-1/v1/messages?beta=true`, SECRET), { ok: true, session: 'sid-1', path: '/v1/messages?beta=true' });
  assert.equal(matchPath(`/${SECRET}/sid-1/api/hello`, SECRET).ok, true);
  assert.equal(matchPath('/v1/messages', SECRET).status, 403);
  assert.equal(matchPath(`/${SECRET.replace('a', 'b')}/s/v1/messages`, SECRET).why, 'bad_secret');
  assert.equal(matchPath(`/${SECRET}/s/admin`, SECRET).status, 404);
  assert.equal(matchPath(`/${SECRET}/s/v1/../x`, SECRET).status, 404);
  assert.equal(relayUrl({ port: 5, secret: SECRET, sessionId: 'x' }), `http://127.0.0.1:5/${SECRET}/x`);
});

test('머리글: Authorization·들어온 x-api-key·accept-encoding·host를 빼고 oauth beta를 지우고 키를 붙인다', () => {
  const h = rewriteHeaders({ host: 'h', authorization: 'Bearer zzz', 'x-api-key': 'other', 'accept-encoding': 'gzip', 'anthropic-beta': 'oauth-2025-04-20, claude-code-20250219,interleaved', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, 'KEY');
  assert.equal(h.authorization, undefined); assert.equal(h.host, undefined); assert.equal(h['accept-encoding'], undefined);
  assert.equal(h['x-api-key'], 'KEY');
  assert.equal(h['anthropic-beta'], 'claude-code-20250219,interleaved');
  assert.equal(h['anthropic-version'], '2023-06-01');
  assert.equal(rewriteHeaders({ 'anthropic-beta': 'oauth-2025-04-20' }, 'K')['anthropic-beta'], undefined, 'oauth만 있으면 머리글째 뺀다');
});

test('사용량: SSE의 모델·입력·출력·캐시 토큰(조각이 잘려도)', () => {
  const sse = 'event: message_start\ndata: {"type":"message_start","message":{"model":"claude-haiku-5-5","usage":{"input_tokens":12,"cache_creation_input_tokens":300,"cache_read_input_tokens":40,"output_tokens":1}}}\n\nevent: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":57}}\n\n';
  const t = new UsageTap();
  for (let i = 0; i < sse.length; i += 7) t.push(Buffer.from(sse.slice(i, i + 7)));
  assert.deepEqual(t.end(), { model: 'claude-haiku-5-5', in: 12, out: 57, cacheW: 300, cacheR: 40 });
  const e = new UsageTap(); e.push('{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'); assert.equal(e.end().errType, 'authentication_error');
});

test('키 모양, 자리표시', () => {
  assert.ok(keyOk(fakeKey())); assert.ok(!keyOk('short')); assert.ok(!keyOk('has space in it aaaaaaaaaaaaaaaaaaaa'));
  assert.ok(usesRelay({ ANTHROPIC_BASE_URL: RELAY_PLACEHOLDER })); assert.ok(!usesRelay({ ANTHROPIC_BASE_URL: 'http://x' })); assert.ok(!usesRelay(null));
});

test('키 없으면 중계기를 띄우지 않고 까닭(설정)을 준다', async () => {
  const r = new AuthRelay({ dataDir: tmp() });
  await assert.rejects(() => r.fillEnv({ ANTHROPIC_BASE_URL: RELAY_PLACEHOLDER }, 's1'), (e) => e.code === 'auth_relay_no_key' && e.key === 'authRelay.err.noKey');
  assert.deepEqual(await r.fillEnv({ A: 'b' }, 's1'), { A: 'b' }, '자리표시가 없으면 손대지 않는다');
  assert.equal(r.status().running, false);
});

test('키 모양이 아니면 저장하지 않는다', async () => {
  const r = new AuthRelay({ dataDir: tmp(), protect: async () => 'x' });
  await assert.rejects(() => r.setKey('abc'), (e) => e.key === 'authRelay.err.keyShape');
  assert.equal(r.keyPresent(), false);
});

test('중계기 끝까지(가짜 위쪽): 키는 암호문만 디스크에, 머리글 바꿈, 스트리밍, 기록에 값 없음, 비밀 없는 요청 거부, 지우기', { skip: !win && 'DPAPI는 Windows만' }, async () => {
  const dir = tmp();
  const key = fakeKey();
  const seen = [];
  // 가짜 api.anthropic.com: 받은 머리글을 적고, SSE를 두 번에 나눠 보낸다(사이에 지연)
  const up = http.createServer((q, s) => {
    seen.push({ url: q.url, method: q.method, auth: q.headers.authorization || null, xkey: q.headers['x-api-key'] || null, beta: q.headers['anthropic-beta'] || null });
    q.resume();
    if (q.method === 'HEAD') { s.writeHead(200); return s.end(); }
    s.writeHead(200, { 'content-type': 'text/event-stream' });
    s.write('event: message_start\ndata: {"type":"message_start","message":{"model":"claude-haiku-5-5","usage":{"input_tokens":3,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":1}}}\n\n');
    setTimeout(() => { s.write('event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":9}}\n\n'); s.end(); }, 300);
  });
  await new Promise((r) => up.listen(0, '127.0.0.1', r));
  const logs = [];
  const r = new AuthRelay({ dataDir: dir, upstream: `http://127.0.0.1:${up.address().port}`, log: (m) => logs.push(m) });
  try {
    const res = await r.setKey(key);
    assert.deepEqual(res, { keyPresent: true });
    const onDisk = fs.readFileSync(path.join(dir, 'auth-relay', 'key.bin'), 'utf8');
    assert.ok(!onDisk.includes(key) && onDisk.length > 50, '디스크에는 암호문만');
    const env = await r.fillEnv({ ANTHROPIC_BASE_URL: RELAY_PLACEHOLDER, OTHER: 'x' }, 'sess-1');
    assert.match(env.ANTHROPIC_BASE_URL, /^http:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_-]+\/sess-1$/);
    assert.equal(env.OTHER, 'x');
    const st = r.status();
    assert.equal(st.running, true); assert.equal(st.keyPresent, true);
    assert.ok(!JSON.stringify(st).includes(key), '상태에 값 없음');
    // 스트리밍: 첫 조각이 끝보다 먼저 닿는다
    const base = env.ANTHROPIC_BASE_URL;
    const chunks = [];
    const t0 = Date.now();
    await new Promise((resolve, reject) => {
      const q = http.request(base + '/v1/messages?beta=true', { method: 'POST', headers: { authorization: 'Bearer sub-oauth-token-value', 'anthropic-beta': 'oauth-2025-04-20,claude-code-20250219', 'content-type': 'application/json' } }, (s) => {
        assert.equal(s.statusCode, 200);
        s.on('data', (c) => chunks.push({ at: Date.now() - t0, n: c.length }));
        s.on('end', resolve);
      });
      q.on('error', reject); q.end('{"model":"claude-haiku-5-5","max_tokens":5,"messages":[]}');
    });
    assert.ok(chunks.length >= 2 && chunks[chunks.length - 1].at - chunks[0].at >= 200, '버퍼 없이 조각마다 흘린다');
    const m = seen.find((x) => x.method === 'POST');
    assert.equal(m.url, '/v1/messages?beta=true'); assert.equal(m.auth, null); assert.equal(m.xkey, key); assert.equal(m.beta, 'claude-code-20250219');
    // 비밀 없는 요청은 위쪽에 닿지 않는다
    const port = r.status().port;
    const code = await new Promise((resolve) => http.request(`http://127.0.0.1:${port}/v1/messages`, { method: 'POST' }, (s) => { s.resume(); resolve(s.statusCode); }).end('{}'));
    assert.equal(code, 403);
    assert.equal(seen.filter((x) => x.method === 'POST').length, 1);
    await new Promise((res) => setTimeout(res, 200));
    const recs = r.recent();
    const rec = recs.find((x) => x.status === 200);
    assert.equal(rec.model, 'claude-haiku-5-5'); assert.equal(rec.in, 3); assert.equal(rec.out, 9); assert.equal(rec.session, 'sess-1');
    assert.ok(recs.some((x) => x.refused === 'no_secret'));
    const logText = fs.readFileSync(path.join(dir, 'auth-relay', 'requests.jsonl'), 'utf8') + logs.join('\n');
    assert.ok(!logText.includes(key) && !logText.includes('sub-oauth-token-value'), '기록·로그에 키·토큰 없음');
    // 127.0.0.1만 듣는다
    assert.ok(await new Promise((resolve) => { const s = http.request({ host: '::1', port, path: '/' }, () => resolve(false)); s.on('error', () => resolve(true)); s.end(); }), '::1에는 듣지 않는다');
    // 지우기: 파일이 사라지고 중계기가 멈춘다
    assert.deepEqual(await r.removeKey(), { keyPresent: false });
    assert.equal(fs.existsSync(path.join(dir, 'auth-relay', 'key.bin')), false);
    assert.equal(r.status().running, false);
    await assert.rejects(() => r.fillEnv({ ANTHROPIC_BASE_URL: RELAY_PLACEHOLDER }, 's'), (e) => e.code === 'auth_relay_no_key');
  } finally { await r.stop(); up.close(); }
});

test('죽으면 다시 띄우고 알린다, 같은 포트·비밀', { skip: !win && 'DPAPI는 Windows만' }, async () => {
  const dir = tmp();
  const notices = [];
  const r = new AuthRelay({ dataDir: dir, upstream: 'http://127.0.0.1:9', onNotice: (n) => notices.push(n) });
  try {
    await r.setKey(fakeKey());
    await r.ensure();
    const { port, pid } = r.status();
    process.kill(pid);
    for (let i = 0; i < 100 && !(r.status().running && r.status().pid !== pid); i++) await new Promise((x) => setTimeout(x, 100));
    assert.equal(r.status().running, true);
    assert.equal(r.status().port, port, '같은 포트로');
    assert.equal(notices[0].kind, 'restarted');
    // 위쪽이 닿지 않으면 502와 마지막 오류 종류
    const base = r.url('s9');
    const code = await new Promise((resolve) => http.request(base + '/v1/messages', { method: 'POST' }, (s) => { s.resume(); resolve(s.statusCode); }).end('{}'));
    assert.equal(code, 502);
    await new Promise((x) => setTimeout(x, 100));
    assert.match(r.status().lastError.kind, /ECONNREFUSED|upstream/);
  } finally { await r.stop(); }
});


// P363: 대화형 API 런처(claude-api)는 걷었다. 런처·띄우기 시험은 p363.test.mjs(SDK 세션)로 옮겼다
