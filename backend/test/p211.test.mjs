// P211 단위 시험: 구독 사용량. Claude 상태 줄 입력 읽기(rate_limits 있음·없음), 판의 상태 줄 명령(사용자 상태 줄 출력을 바이트 그대로,
// 사용자 명령 없음·실패·시간 넘김, 판에 알리기), Codex rollout 끝 읽기(바뀐 파일만), AGY 입력 읽기(quota_buckets), 장부(usage.updated, 90% 알림 한 번, 설정 끄기),
// 세션 설정 파일·AGY --settings의 statusLine, usage.get·atrium usage(계약에 더하기만).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { CONTRACT_VERSION, VERB_NAMES, VERBS } from '../src/cli-contract.mjs';
import { writeSessionSettings } from '../src/launch.mjs';
import { agySettingsArgs, AGY_BOARD_SETTINGS, ADAPTERS } from '../src/harness.mjs';
import { claudeUsageOf, codexUsageOf, agyUsageOf, lastRateLimits, CodexUsageReader, UsageBook, alertsOf, statusLineCommand, writeStatusLineScript, writeStatusLineShim, usageLines, toMs, windowIdOf, ALERT_PCT } from '../src/usage.mjs';
import { SETTINGS, DEFAULTS } from '../src/settings.mjs';
import { userCommandOf, reportOf, defaultLine } from '../bin/atrium-statusline.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', 'bin', 'atrium-statusline.mjs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p211-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const fwd = (p) => p.split(path.sep).join('/');
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MTASK_|ATRIUM_|HERDR_|HC_)/.test(k)));

const CLAUDE_IN = { model: { id: 'claude-haiku-4-5', display_name: 'Haiku 4.5' }, rate_limits: { five_hour: { used_percentage: 34.2, resets_at: 1794980783 }, seven_day: { used_percentage: 86, resets_at: '2026-11-21T10:00:00Z' } }, context_window: { used_percentage: 3 } };

// ---------- 읽기 ----------
test('P211 Claude 상태 줄 입력: rate_limits가 있으면 5h·주간 창, 없으면 null', () => {
  const e = claudeUsageOf(CLAUDE_IN, 1000);
  assert.equal(e.provider, 'claude'); assert.equal(e.source, 'statusline'); assert.equal(e.at, 1000); assert.equal(e.model, 'Haiku 4.5');
  assert.deepEqual(e.windows, [{ id: '5h', minutes: 300, usedPct: 34.2, resetsAt: 1794980783000 }, { id: 'week', minutes: 10080, usedPct: 86, resetsAt: Date.parse('2026-11-21T10:00:00Z') }]);
  assert.equal(claudeUsageOf({ model: { id: 'x' } }), null);
  assert.equal(claudeUsageOf({ rate_limits: {} }), null);
  assert.equal(claudeUsageOf(null), null);
  // 리셋 시각이 없어도 사용률만으로
  assert.deepEqual(claudeUsageOf({ rate_limits: { five_hour: { used_percentage: 5 } } }).windows, [{ id: '5h', minutes: 300, usedPct: 5, resetsAt: null }]);
  assert.equal(toMs(1794980783), 1794980783000); assert.equal(toMs(1794980783000), 1794980783000); assert.equal(toMs('x'), null);
  assert.equal(windowIdOf(300), '5h'); assert.equal(windowIdOf(10080), 'week'); assert.equal(windowIdOf(60), '60m');
});

test('P211 상태 줄 명령의 입력 고르기: Claude는 rate_limits와 모델만, AGY는 quota·credit 칸만(대화 글은 보내지 않는다)', () => {
  assert.deepEqual(reportOf('claude', { ...CLAUDE_IN, transcript_path: 'C:/x.jsonl', cwd: 'C:/w' }), { rate_limits: CLAUDE_IN.rate_limits, model: { id: 'claude-haiku-4-5', display_name: 'Haiku 4.5' } });
  assert.equal(reportOf('claude', { model: { id: 'x' } }), null);
  const agy = reportOf('agy', { quota_buckets: { a: { remaining_fraction: 0.5 } }, workspace: { cwd: 'C:/w' }, model: { display_name: 'G' } });
  assert.deepEqual(Object.keys(agy).sort(), ['model', 'quota_buckets']);
  assert.equal(defaultLine('claude', CLAUDE_IN), 'Haiku 4.5 · 5h 34% 1W 86%');
  assert.equal(defaultLine('claude', null), '');
  // 사용자 상태 줄 명령: 설정 파일의 statusLine.command(꺼짐·판 명령은 뺀다), base64 인자가 먼저
  const read = (txt) => () => txt;
  assert.equal(userCommandOf({ 'user-settings': 'f' }, read('{"statusLine":{"type":"command","command":"node a.js"}}')), 'node a.js');
  assert.equal(userCommandOf({ 'user-settings': 'f' }, read('{"statusLine":{"type":"command","command":"node a.js","enabled":false}}')), null);
  assert.equal(userCommandOf({ 'user-settings': 'f' }, read('{"statusLine":{"type":"command","command":"node x/atrium-statusline.mjs claude"}}')), null);
  assert.equal(userCommandOf({ 'user-settings': 'f' }, () => { throw new Error('ENOENT'); }), null);
  assert.equal(userCommandOf({ 'user-cmd-b64': Buffer.from('echo hi').toString('base64'), 'user-settings': 'f' }, read('{}')), 'echo hi');
});

test('P211 Codex: rollout 줄의 마지막 rate_limits(limit_id codex 먼저), 5h·주간·크레딧·요금제', () => {
  const rl = { limit_id: 'codex', primary: { used_percent: 18, window_minutes: 300, resets_at: 1794980783 }, secondary: { used_percent: 81, window_minutes: 10080, resets_at: 1795060753 }, credits: { has_credits: true, unlimited: false, balance: '12.5' }, plan_type: 'plus' };
  const line = (r, ts) => JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'token_count', rate_limits: r } });
  const text = [line({ ...rl, primary: { ...rl.primary, used_percent: 1 } }, '2026-11-18T00:00:00Z'), line(rl, '2026-11-18T01:00:00Z'), line({ ...rl, limit_id: 'other', primary: { used_percent: 99, window_minutes: 60 } }, '2026-11-18T02:00:00Z'), '{"type":"x"}'].join('\n');
  const h = lastRateLimits(text);
  assert.equal(h.rl.primary.used_percent, 18); assert.equal(h.at, Date.parse('2026-11-18T01:00:00Z'));
  const e = codexUsageOf(h.rl, h.at);
  assert.deepEqual(e.windows.map((w) => [w.id, w.usedPct, w.resetsAt]), [['5h', 18, 1794980783000], ['week', 81, 1795060753000]]);
  assert.deepEqual(e.credits, { hasCredits: true, unlimited: false, balance: '12.5' });
  assert.equal(e.plan, 'plus'); assert.equal(e.source, 'rollout');
  assert.equal(codexUsageOf({ limit_id: 'codex' }), null);
});

test('P211 Codex: 오늘·어제 폴더의 rollout을 읽고, 바뀐 파일만 늘어난 만큼 다시 읽는다', () => {
  const home = tmp();
  const now = new Date(2026, 10, 18, 12, 0, 0).getTime();
  const dir = path.join(home, 'sessions', '2026', '11', '18');
  const old = path.join(home, 'sessions', '2026', '11', '10');
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(old, { recursive: true });
  const mk = (pct, ts) => JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'token_count', rate_limits: { limit_id: 'codex', primary: { used_percent: pct, window_minutes: 300, resets_at: 1794980783 } } } }) + '\n';
  const f1 = path.join(dir, 'rollout-a.jsonl'), f2 = path.join(dir, 'rollout-b.jsonl');
  fs.writeFileSync(f1, '{"type":"session_meta"}\n' + 'x'.repeat(300 * 1024) + '\n' + mk(10, '2026-11-18T01:00:00Z'));
  fs.writeFileSync(f2, mk(20, '2026-11-18T02:00:00Z'));
  fs.writeFileSync(path.join(old, 'rollout-c.jsonl'), mk(99, '2026-11-18T03:00:00Z')); // 오늘·어제 밖은 보지 않는다
  fs.writeFileSync(path.join(dir, 'other.jsonl'), mk(98, '2026-11-18T04:00:00Z')); // rollout-이 아닌 파일
  const r = new CodexUsageReader({ home, now: () => now });
  let b = r.poll();
  assert.equal(b.rl.primary.used_percent, 20); assert.equal(b.file, f2);
  const reads = r.reads;
  assert.equal(r.poll().rl.primary.used_percent, 20);
  assert.equal(r.reads, reads, '바뀌지 않은 파일은 다시 읽지 않는다');
  fs.appendFileSync(f1, mk(30, '2026-11-18T05:00:00Z'));
  b = r.poll();
  assert.equal(b.rl.primary.used_percent, 30); assert.equal(b.file, f1);
  assert.equal(r.reads, reads + 1, '늘어난 파일 하나만 읽는다');
  // 늘어난 부분에 사용량 줄이 없으면 앞 값을 그대로 둔다
  fs.appendFileSync(f1, '{"type":"response_item"}\n');
  assert.equal(r.poll().rl.primary.used_percent, 30);
  assert.equal(new CodexUsageReader({ home: null }).poll(), null);
  fs.rmSync(home, { recursive: true, force: true });
});

test('P211 AGY 상태 줄 입력: quota_buckets(이름 → 남은 몫, 리셋까지 초)를 사용률 창으로', () => {
  const e = agyUsageOf({ model: { display_name: 'Gemini' }, quota_buckets: { gemini: { remaining_fraction: 0.25, reset_in_seconds: 3600 }, flash: { remaining_fraction: 1 }, bad: {} } }, 1000);
  assert.deepEqual(e.windows, [{ id: 'gemini', minutes: null, usedPct: 75, resetsAt: 1000 + 3600000 }, { id: 'flash', minutes: null, usedPct: 0, resetsAt: null }]);
  assert.equal(e.provider, 'agy'); assert.equal(e.model, 'Gemini');
  assert.deepEqual(agyUsageOf({ quota_buckets: [{ name: 'pro', remaining_fraction: 0.1, reset_time: '2026-11-18T10:00:00Z' }] }, 0).windows, [{ id: 'pro', minutes: null, usedPct: 90, resetsAt: Date.parse('2026-11-18T10:00:00Z') }]);
  assert.equal(agyUsageOf({ quota_buckets: {} }), null);
  // AGY 1.5.10에서 받은 모양: quota { 이름: { remaining_fraction, reset_time, reset_in_seconds } }, plan_tier. 이름 끝 -5h·-weekly는 창 길이
  const real = agyUsageOf({ plan_tier: 'pro', email: 'x@example.com', quota: { 'gemini-5h': { remaining_fraction: 0.8, reset_time: '2026-11-18T05:00:00Z', reset_in_seconds: 600 }, 'gemini-weekly': { remaining_fraction: 0.35, reset_time: '2026-11-20T00:00:00Z', reset_in_seconds: 7200 } } }, 1000);
  assert.deepEqual(real.windows.map((w) => [w.id, w.minutes, w.usedPct, w.resetsAt]), [['gemini-5h', 300, 20, 601000], ['gemini-weekly', 10080, 65, 7201000]]);
  assert.equal(real.plan, 'pro');
  assert.deepEqual(Object.keys(reportOf('agy', { quota: {}, plan_tier: 'pro', email: 'x@example.com', user_email: 'y', cwd: 'C:/w' })).sort(), ['model', 'plan_tier', 'quota']);
  assert.equal(agyUsageOf({ model: 'x' }), null);
});

// ---------- 상태 줄 명령(진짜 프로세스) ----------
function runLine(args, input, env = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const c = execFile(process.execPath, [SCRIPT, ...args], { env: { ...cleanEnv(), ...env }, encoding: 'buffer', timeout: 20000 }, (err, stdout) => resolve({ code: err ? err.code : 0, stdout, ms: Date.now() - t0 }));
    c.stdin.end(Buffer.from(JSON.stringify(input)));
  });
}
const userScript = (dir, body) => { const f = path.join(dir, `u-${crypto.randomBytes(3).toString('hex')}.cjs`); fs.writeFileSync(f, body); return f; };
const settingsWith = (dir, command) => { const f = path.join(dir, `s-${crypto.randomBytes(3).toString('hex')}.json`); fs.writeFileSync(f, JSON.stringify({ statusLine: { type: 'command', command } })); return f; };
const nodeCmd = (f) => `"${fwd(process.execPath)}" "${fwd(f)}"`;

test('P211 상태 줄 명령: 사용자 상태 줄의 출력을 바이트 그대로 내보낸다(같은 입력)', async () => {
  const dir = tmp();
  // 입력을 읽어 색·한글·줄 끝 없는 글을 쓴다(입력이 그대로 넘어왔는지 모델 이름으로 본다)
  const u = userScript(dir, "let r='';process.stdin.on('data',d=>r+=d);process.stdin.on('end',()=>{const j=JSON.parse(r);process.stdout.write(Buffer.concat([Buffer.from('\\x1b[32m'+j.model.display_name+' 한글 ✓\\x1b[0m','utf8'),Buffer.from([0xff,0x00,0x41])]));});");
  const direct = await new Promise((res) => { const c = execFile(process.execPath, [u], { encoding: 'buffer' }, (e, out) => res(out)); c.stdin.end(JSON.stringify(CLAUDE_IN)); });
  const r = await runLine(['claude', '--user-settings', settingsWith(dir, nodeCmd(u))], CLAUDE_IN);
  assert.equal(r.code, 0);
  assert.ok(direct.length > 10);
  assert.ok(Buffer.compare(r.stdout, direct) === 0, `바이트가 같다: ${r.stdout.toString('hex')} vs ${direct.toString('hex')}`);
  // base64로 받은 사용자 명령(AGY)도 같다
  const r2 = await runLine(['agy', '--user-cmd-b64', Buffer.from(nodeCmd(u)).toString('base64')], CLAUDE_IN);
  assert.ok(Buffer.compare(r2.stdout, direct) === 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('P211 상태 줄 명령: 사용자 명령이 없거나 실패하거나 시간을 넘기면 판의 짧은 기본 줄(늘 0으로 끝난다)', async () => {
  const dir = tmp();
  const none = await runLine(['claude', '--user-settings', path.join(dir, 'missing.json')], CLAUDE_IN);
  assert.equal(none.code, 0); assert.equal(none.stdout.toString('utf8'), 'Haiku 4.5 · 5h 34% 1W 86%');
  const failing = userScript(dir, 'process.exit(3)');
  const f = await runLine(['claude', '--user-settings', settingsWith(dir, nodeCmd(failing))], CLAUDE_IN);
  assert.equal(f.code, 0); assert.equal(f.stdout.toString('utf8'), 'Haiku 4.5 · 5h 34% 1W 86%');
  const slow = userScript(dir, "setTimeout(()=>process.stdout.write('late'),10000)");
  const s = await runLine(['claude', '--user-settings', settingsWith(dir, nodeCmd(slow))], CLAUDE_IN, { ATRIUM_STATUSLINE_TIMEOUT_MS: '400' });
  assert.equal(s.code, 0); assert.equal(s.stdout.toString('utf8'), 'Haiku 4.5 · 5h 34% 1W 86%');
  assert.ok(s.ms < 5000, `시간 상한에서 끊는다(${s.ms}ms)`);
  // AGY는 사용자 명령이 없으면 아무것도 쓰지 않는다(AGY 기본 줄을 쌓아 둔다)
  const quiet = await runLine(['agy', '--default', 'none'], { quota_buckets: {} });
  assert.equal(quiet.code, 0); assert.equal(quiet.stdout.length, 0);
  // 깨진 입력도 막지 않는다
  const bad = await new Promise((res) => { const c = execFile(process.execPath, [SCRIPT, 'claude'], { env: cleanEnv() }, (e, out) => res({ code: e ? e.code : 0, out })); c.stdin.end('not json'); });
  assert.equal(bad.code, 0); assert.equal(bad.out, '');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('P211 상태 줄 명령: 판에 사용량을 알린다(POST /branch/usage-report, 세션 토큰. AGY는 토큰 파일)', async () => {
  const got = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { got.push({ url: req.url, auth: req.headers.authorization, sid: req.headers['x-mt-session'], body: JSON.parse(b) }); res.writeHead(200); res.end('{}'); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = String(srv.address().port);
  await runLine(['claude'], CLAUDE_IN, { ATRIUM_PORT: port, ATRIUM_SESSION_ID: 's1', ATRIUM_SESSION_TOKEN: 'tok1' });
  assert.equal(got.length, 1);
  assert.deepEqual(got[0], { url: '/branch/usage-report', auth: 'Bearer tok1', sid: 's1', body: { kind: 'claude', input: { rate_limits: CLAUDE_IN.rate_limits, model: { id: 'claude-haiku-4-5', display_name: 'Haiku 4.5' } } } });
  // rate_limits가 없으면 알리지 않는다
  await runLine(['claude'], { model: { id: 'x' } }, { ATRIUM_PORT: port, ATRIUM_SESSION_ID: 's1', ATRIUM_SESSION_TOKEN: 'tok1' });
  assert.equal(got.length, 1);
  const data = tmp(); fs.mkdirSync(path.join(data, 'sessions')); fs.writeFileSync(path.join(data, 'sessions', 's2.token'), 'tok2\n');
  await runLine(['agy', '--default', 'none'], { quota_buckets: { g: { remaining_fraction: 0.5 } }, cwd: 'C:/w' }, { ATRIUM_PORT: port, ATRIUM_SESSION_ID: 's2', ATRIUM_DATA_DIR: data });
  assert.equal(got.length, 2); assert.equal(got[1].auth, 'Bearer tok2'); assert.deepEqual(got[1].body, { kind: 'agy', input: { quota_buckets: { g: { remaining_fraction: 0.5 } }, model: null } });
  // 판이 없어도(포트 닫힘) 출력은 나오고 0으로 끝난다
  srv.close();
  const r = await runLine(['claude'], CLAUDE_IN, { ATRIUM_PORT: port, ATRIUM_SESSION_ID: 's1', ATRIUM_SESSION_TOKEN: 'tok1' });
  assert.equal(r.code, 0); assert.equal(r.stdout.toString('utf8'), 'Haiku 4.5 · 5h 34% 1W 86%');
  fs.rmSync(data, { recursive: true, force: true });
});

// ---------- 장부 ----------
function memStore() { const m = new Map(); return { getMeta: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), setMeta: (k, v) => m.set(k, JSON.stringify(v)), m }; }

test('P211 장부: 값이 바뀌면 usage.updated, 같으면 1분 안에 다시 보내지 않는다. 판 기록에 남아 다시 떠도 보인다', () => {
  let now = 1_000_000;
  const store = memStore(); const sent = [];
  const book = new UsageBook({ store, broadcast: (e, v) => sent.push([e, v]), now: () => now, settings: () => ({ usageAlerts: true }) });
  assert.deepEqual(book.get().providers, { claude: null, codex: null, agy: null });
  assert.deepEqual(book.report('claude', CLAUDE_IN), { ok: true, changed: true });
  assert.equal(sent.filter(([e]) => e === 'usage.updated').length, 1);
  now += 1000;
  assert.deepEqual(book.report('claude', CLAUDE_IN), { ok: true, changed: false });
  assert.equal(sent.filter(([e]) => e === 'usage.updated').length, 1, '같은 값은 바로 다시 보내지 않는다');
  assert.equal(book.get().providers.claude.at, now, '받은 때는 따라간다');
  now += 61000;
  book.report('claude', CLAUDE_IN);
  assert.equal(sent.filter(([e]) => e === 'usage.updated').length, 2, '1분 뒤에는 받은 때를 보낸다');
  assert.deepEqual(book.report('claude', { model: {} }), { ok: false, changed: false });
  assert.deepEqual(book.report('nope', CLAUDE_IN), { ok: false, changed: false });
  const again = new UsageBook({ store, now: () => now });
  assert.equal(again.get().providers.claude.windows[1].usedPct, 86);
});

test('P211 90% 알림: 창마다 리셋될 때까지 한 번, 리셋 뒤 새 창은 다시. 설정을 끄면 알리지 않는다', () => {
  let now = Date.parse('2026-11-18T00:00:00Z');
  const store = memStore(); const alerts = []; let on = true;
  const book = new UsageBook({ store, broadcast: (e, v) => e === 'usage.alert' && alerts.push(v), now: () => now, settings: () => ({ usageAlerts: on }) });
  const reset1 = now + 3 * 3600000;
  const rl = (p5, pw, r5 = reset1) => ({ rate_limits: { five_hour: { used_percentage: p5, resets_at: r5 / 1000 }, seven_day: { used_percentage: pw, resets_at: (now + 5 * 86400000) / 1000 } } });
  book.report('claude', rl(89.9, 50));
  assert.equal(alerts.length, 0, '90% 아래는 알리지 않는다');
  book.report('claude', rl(90, 50));
  assert.equal(alerts.length, 1); assert.deepEqual([alerts[0].provider, alerts[0].window, alerts[0].usedPct], ['claude', '5h', 90]);
  book.report('claude', rl(95, 50));
  book.report('claude', rl(97, 50));
  assert.equal(alerts.length, 1, '같은 창은 리셋 전까지 한 번');
  // 다시 띄운 판도 같은 창을 다시 알리지 않는다(판 기록)
  const book2 = new UsageBook({ store, broadcast: (e, v) => e === 'usage.alert' && alerts.push(v), now: () => now, settings: () => ({ usageAlerts: true }) });
  book2.report('claude', rl(98, 50));
  assert.equal(alerts.length, 1);
  // 리셋 뒤 새 창
  now = reset1 + 60000;
  book.report('claude', rl(91, 50, now + 5 * 3600000));
  assert.equal(alerts.length, 2);
  // 설정을 끄면 알리지 않는다
  on = false;
  book.report('codex', null);
  assert.equal(book.set(codexUsageOf({ primary: { used_percent: 99, window_minutes: 300, resets_at: (now + 3600000) / 1000 } }, now)), true);
  assert.equal(alerts.length, 2);
  assert.equal(book.get().alertsOn, false);
  // 리셋이 지난 창의 높은 값은 알리지 않는다
  assert.deepEqual(alertsOf({ provider: 'x', windows: [{ id: '5h', usedPct: 99, resetsAt: now - 1 }] }, new Set(), now), []);
  assert.equal(ALERT_PCT, 90);
  assert.equal(SETTINGS.usageAlerts.type, 'boolean'); assert.equal(DEFAULTS.usageAlerts, true);
});

test('P211 장부: Codex rollout을 읽어 넣는다(옛 값이 나중 값을 덮지 않는다)', () => {
  const home = tmp();
  const now = new Date(2026, 10, 18, 12).getTime();
  const dir = path.join(home, 'sessions', '2026', '11', '18'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'rollout-x.jsonl'), JSON.stringify({ timestamp: '2026-11-18T01:00:00Z', payload: { type: 'token_count', rate_limits: { limit_id: 'codex', primary: { used_percent: 40, window_minutes: 300 }, plan_type: 'pro' } } }) + '\n');
  const book = new UsageBook({ store: memStore(), codexHome: home, now: () => now, pollMs: 0 });
  book.start(); book.stop();
  const c = book.get().providers.codex;
  assert.equal(c.windows[0].usedPct, 40); assert.equal(c.plan, 'pro'); assert.equal(c.at, Date.parse('2026-11-18T01:00:00Z'));
  assert.equal(book.set({ ...c, at: c.at - 1000, windows: [{ ...c.windows[0], usedPct: 1 }] }), false);
  fs.rmSync(home, { recursive: true, force: true });
});

// ---------- 설정 파일과 AGY --settings ----------
test('P211 Claude 세션 설정 파일: 판의 statusLine(판 데이터 폴더의 명령, 사용자 설정 파일 경로, 사용자 padding)', () => {
  const dir = tmp();
  const userSettings = path.join(dir, 'user-settings.json');
  fs.writeFileSync(userSettings, JSON.stringify({ statusLine: { type: 'command', command: 'node u.js', padding: 2 } }));
  const script = writeStatusLineScript(path.join(dir, 'plugin'));
  assert.equal(fs.readFileSync(script, 'utf8'), fs.readFileSync(SCRIPT, 'utf8'));
  const book = new UsageBook({ store: memStore(), script, node: 'C:\\Program Files\\nodejs\\node.exe', claudeUserSettings: userSettings });
  const sl = book.claudeStatusLine();
  assert.equal(sl.type, 'command'); assert.equal(sl.padding, 2);
  assert.equal(sl.command, `"C:/Program Files/nodejs/node.exe" "${fwd(script)}" claude --user-settings "${fwd(userSettings)}"`);
  const f = writeSessionSettings({ file: path.join(dir, 's.json'), hookUrl: 'http://127.0.0.1:1/hooks/claude', token: 't', sessionId: 'x', statusLine: sl });
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')).statusLine, sl);
  const g = writeSessionSettings({ file: path.join(dir, 's2.json'), hookUrl: 'http://127.0.0.1:1/hooks/claude', token: 't', sessionId: 'y' });
  assert.equal(JSON.parse(fs.readFileSync(g, 'utf8')).statusLine, undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('P211 AGY --settings: 판의 상태 줄 명령을 더한다. 사용자 명령은 이어 부르고, 없으면 AGY 기본 줄을 쌓는다. 사용자가 끄면 그대로', () => {
  const dir = tmp();
  const agyUser = path.join(dir, 'agy-settings.json');
  fs.writeFileSync(agyUser, JSON.stringify({ statusLine: { type: '', command: '', enabled: true } }));
  const book = new UsageBook({ store: memStore(), script: 'C:/d/plugin/atrium-statusline.mjs', node: 'C:/n/node.exe', agyUserSettings: agyUser });
  const fn = (u) => book.agyStatusLine(u);
  const settingsOf = (args) => JSON.parse(args[args.indexOf('--settings') + 1]);
  // 사용자 명령 없음: 판 명령은 아무것도 쓰지 않고(--default none) AGY 기본 줄 위에 쌓는다
  const a = settingsOf(agySettingsArgs([], AGY_BOARD_SETTINGS, undefined, fn));
  assert.equal(a.altScreenMode, 'always');
  assert.deepEqual(a.statusLine, { type: 'command', enabled: true, command: '"C:/n/node.exe" "C:/d/plugin/atrium-statusline.mjs" agy --default none', stack_with_default: true });
  // 호출자 --settings의 사용자 명령: base64로 넘겨 이어 부른다(사용자의 다른 statusLine 키는 둔다)
  const b = settingsOf(agySettingsArgs(['--settings', '{"statusLine":{"type":"command","command":"my-line --x","stack_with_default":false},"verbosity":"low"}'], AGY_BOARD_SETTINGS, undefined, fn));
  assert.equal(b.verbosity, 'low'); assert.equal(b.statusLine.stack_with_default, false);
  assert.equal(b.statusLine.command, `"C:/n/node.exe" "C:/d/plugin/atrium-statusline.mjs" agy --user-cmd-b64 ${Buffer.from('my-line --x').toString('base64')}`);
  // 사용자가 끈 상태 줄은 그대로
  const c = settingsOf(agySettingsArgs(['--settings', '{"statusLine":{"enabled":false}}'], AGY_BOARD_SETTINGS, undefined, fn));
  assert.deepEqual(c.statusLine, { enabled: false });
  // AGY 설정 파일의 사용자 명령도 이어 부른다
  fs.writeFileSync(agyUser, JSON.stringify({ statusLine: { type: 'command', command: 'agy-line', enabled: true } }));
  assert.ok(settingsOf(agySettingsArgs([], AGY_BOARD_SETTINGS, undefined, fn)).statusLine.command.includes(Buffer.from('agy-line').toString('base64')));
  // statusLine 함수가 없으면 P203 그대로
  assert.deepEqual(settingsOf(agySettingsArgs([])), { altScreenMode: 'always' });
  // 어댑터가 ctx.statusLine을 넘긴다
  const built = ADAPTERS.agy.build({ model: 'm', launcherArgs: [], statusLine: fn });
  assert.equal(settingsOf(built.args).statusLine.type, 'command');
  assert.equal(statusLineCommand({ node: 'n', script: 's', kind: 'claude' }), '"n" "s" claude');
  // AGY는 큰따옴표를 \"로 넘겨 cmd가 못 읽는다: 꾸러미(.cmd) 경로를 따옴표 없이(빈칸이 있을 때만 묶는다)
  assert.equal(statusLineCommand({ shim: 'C:/d/plugin/atrium-statusline.cmd', kind: 'agy', quietDefault: true }), 'C:/d/plugin/atrium-statusline.cmd agy --default none');
  const sbook = new UsageBook({ store: memStore(), script: 'C:/d/plugin/atrium-statusline.mjs', node: 'C:/n/node.exe', agyShim: 'C:/d/plugin/atrium-statusline.cmd', agyUserSettings: agyUser });
  assert.equal(sbook.agyStatusLine(null).command, 'C:/d/plugin/atrium-statusline.cmd agy --user-cmd-b64 ' + Buffer.from('agy-line').toString('base64'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('P211 AGY 꾸러미(.cmd): cmd에서 따옴표 없이 불러도 입력을 넘기고 판의 기본 줄을 낸다', { skip: process.platform !== 'win32' }, async () => {
  const dir = tmp();
  writeStatusLineScript(dir);
  const shim = writeStatusLineShim(dir);
  const out = await new Promise((res) => { const c = execFile('cmd.exe', ['/d', '/s', '/c', `${fwd(shim)} claude`], { env: cleanEnv(), encoding: 'utf8' }, (e, o) => res({ code: e ? e.code : 0, o })); c.stdin.end(JSON.stringify(CLAUDE_IN)); });
  assert.equal(out.code, 0); assert.equal(out.o, 'Haiku 4.5 · 5h 34% 1W 86%');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------- usage.get · atrium usage ----------
async function board() {
  const dir = tmp();
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p211test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const b = {
    cfg, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(),
    api: { broadcast: () => {} }, log: () => {}, requireTerminal: () => {},
    adapter: { backend: 'hc', connected: true, readScreen: async () => '' },
    hooked: (s) => s.rt.hooked !== false,
    summary: (s) => { const d = deriveState(s.rt); return { state: d.state }; },
    broadcastSession() {},
  };
  b.usage = new UsageBook({ store, now: () => Date.parse('2026-11-18T00:10:00Z') });
  b.queue = new DeliveryQueue({ store, cfg, view: () => ({ closed: true }), send: async () => {} });
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20 });
  const s = { sessionId: crypto.randomUUID(), name: 'lead', cwd: dir, paneId: 'p1', agentName: 'lead', permissionMode: 'manual', kind: 'claude', origin: 'board', parentSessionId: null, workspaceKey: ws.key, rt: newRuntime({ kind: 'claude', hooked: true }), createdAt: Date.now() };
  store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
  b.sessions.set(s.sessionId, s);
  const srv = http.createServer((req, res) => { if (!b.branch.handleHttp(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  cfg.port = srv.address().port;
  return { b, s, dir, stop: async () => { srv.close(); b.branch.notices.stop(); await tick(50); store.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
function runCli(args, env) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(HERE, '..', 'bin', 'atrium-child.mjs'), ...args], { env: { ...cleanEnv(), ...env }, timeout: 30000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}

test('P211 atrium usage(계약에 더하기만)와 /branch/usage-report: 상태 줄 명령이 알린 값이 atrium usage에 보인다', async () => {
  assert.equal(CONTRACT_VERSION, 12); // P364: know로 12. // P360: revive·fork로 11. // P346: docs init·on·off로 10. // P296: 오케스트레이션 허용 동사로 9. // P292. P284. P269
  assert.ok(VERB_NAMES.includes('usage'));
  assert.deepEqual(VERBS.find((v) => v.name === 'usage').out, ['providers', 'alertsOn', 'at']);
  const { b, s, stop } = await board();
  try {
    const env = { ATRIUM_PORT: String(b.cfg.port), ATRIUM_SESSION_ID: s.sessionId, ATRIUM_SESSION_TOKEN: b.branch.token(s.sessionId), ATRIUM_TERMINAL_SESSION: b.cfg.terminalSession };
    let r = await runCli(['usage'], env);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Claude: 모름/); assert.match(r.stdout, /Codex: 모름/); assert.match(r.stdout, /AGY: 모름/);
    // 상태 줄 명령(진짜 프로세스)이 판에 알린다
    const line = await runLine(['claude'], { ...CLAUDE_IN, rate_limits: { five_hour: { used_percentage: 34, resets_at: (Date.parse('2026-11-18T02:10:00Z')) / 1000 } } }, env);
    assert.equal(line.code, 0);
    assert.equal(b.usage.get().providers.claude.windows[0].usedPct, 34);
    r = await runCli(['usage'], env);
    assert.match(r.stdout, /Claude: 5시간 34%\(리셋 2시간 뒤\) · 받은 때 0분 전 · 출처 보드가 띄운 세션의 상태 줄/);
    r = await runCli(['usage', '--json'], env);
    const j = JSON.parse(r.stdout);
    assert.equal(j.providers.claude.windows[0].id, '5h'); assert.equal(j.providers.codex, null); assert.equal(j.alertsOn, true);
    // 토큰이 틀리면 받지 않는다
    const bad = await runLine(['claude'], CLAUDE_IN, { ...env, ATRIUM_SESSION_TOKEN: 'nope' });
    assert.equal(bad.code, 0);
    assert.equal(b.usage.get().providers.claude.windows[0].usedPct, 34);
  } finally { await stop(); }
});

test('P211 atrium usage 글: 창·리셋·크레딧·요금제·받은 때', () => {
  const now = Date.parse('2026-11-18T00:00:00Z');
  const lines = usageLines({ providers: { claude: null, codex: { provider: 'codex', source: 'rollout', at: now - 5 * 60000, plan: 'plus', credits: { hasCredits: true, unlimited: false, balance: '10.5' }, windows: [{ id: '5h', usedPct: 18, resetsAt: now + 90 * 60000 }, { id: 'week', usedPct: 81, resetsAt: now + 3 * 86400000 }] }, agy: null }, alertsOn: true }, now);
  assert.match(lines.join('\n'), /Codex\(plus\): 5시간 18%\(리셋 1시간 30분 뒤\) · 주간 81%\(리셋 3일 뒤\) · 크레딧 10.5 · 받은 때 5분 전 · 출처 Codex 세션 기록/);
});
