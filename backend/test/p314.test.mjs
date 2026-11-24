// P314 단위 시험: 사용량 탐침. 원천 순서·낡음(주기 탐침은 Codex(P347: Hermes 사용량은 걷었다), Claude·잔액은 펼칠 때만, 일하는 세션이면 묻지 않음, 실패 뒤 쉼),
// 출력 읽기(codex app-server, claude /usage 글과 리셋 시각), 옛 Hermes 값·설정은 읽어도 무시,
// 잔액 읽개(출력 꼴, 키 미노출, grant 없음 → 없음, PSModulePath 빼기), Claude 탐침 인자·빈 프로젝트 폴더 치우기, atrium usage 글
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { UsageBook, shouldProbe, staleOf, usageLines, PROVIDERS, EXTRAS } from '../src/usage.mjs';
import * as probeMod from '../src/usage-probe.mjs';
import { codexProbeUsageOf, claudeProbeUsageOf, parseResetText, balanceEntriesOf, probeCodex, probeClaude, probeBalance, balanceArgv, probeEnv, claudeProbeArgs, claudeProjectDirName, removeIfEmptyTree, CLAUDE_PROBE_SETTINGS } from '../src/usage-probe.mjs';
import { SETTINGS, DEFAULTS, Settings } from '../src/settings.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures');
const READER = path.join(HERE, '..', 'bin', 'atrium-balance.mjs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p314-'));
const NOW = Date.parse('2026-11-22T02:43:00Z');
const MIN = 60000;

const CLAUDE_TEXT = [
  'You are currently using your subscription to power your Claude Code usage',
  '',
  'Current session: 12% used · resets 3:50pm (Asia/Seoul)',
  'Current week (all models): 55% used · resets Nov 26, 6am (Asia/Seoul)',
  'Current week (Fable): 13% used · resets Nov 26, 6am (Asia/Seoul)',
  '',
  "What's contributing to your usage?",
  'Last 24h · 2321 requests · 58 sessions',
  '  86%  Start fresh when you switch tasks · run /clear',
].join('\n');
const CODEX_RESULT = { rateLimits: { limitId: 'codex', primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: 1795328730 }, secondary: { usedPercent: 17, windowDurationMins: 10080, resetsAt: 1795854467 }, credits: { hasCredits: true, unlimited: false, balance: '34781.12' }, planType: 'plus' }, accountId: 'not-read' };
// P347: 옛 판 기록에 남은 Hermes 값의 꼴(hermes usage --json을 읽은 값). 읽어도 무시하는지 본다
const HERMES_JSON = { provider: 'openai-codex', source: 'usage_api', title: 'Account limits', plan: 'Plus', fetched_at: '2026-11-22T02:42:47Z', windows: [{ label: 'Session', used_percent: 20.0, resets_at: '2026-11-22T06:25:30+00:00', detail: null }, { label: 'Weekly', used_percent: 17.0, resets_at: '2026-11-28T08:27:47+00:00', detail: null }], details: [], unavailable_reason: null };

test('P314 codex app-server 결과 → 5h·주간·크레딧·요금제, 출처 probe:codex(계정 id는 싣지 않는다)', () => {
  const e = codexProbeUsageOf(CODEX_RESULT, NOW);
  assert.equal(e.provider, 'codex'); assert.equal(e.source, 'probe:codex'); assert.equal(e.plan, 'plus');
  assert.deepEqual(e.windows.map((w) => [w.id, w.usedPct, w.resetsAt]), [['5h', 20, 1795328730000], ['week', 17, 1795854467000]]);
  assert.deepEqual(e.credits, { hasCredits: true, unlimited: false, balance: '34781.12' });
  assert.ok(!JSON.stringify(e).includes('not-read'));
  assert.equal(codexProbeUsageOf({}, NOW), null);
  assert.equal(codexProbeUsageOf({ rateLimits: { primary: { usedPercent: 'x' } } }, NOW), null);
});

test('P314 claude /usage 글 → 세션(5h)·주간·모델별 주간(week:<모델>), 리셋 시각은 적힌 시간대로', () => {
  const e = claudeProbeUsageOf(CLAUDE_TEXT, NOW);
  assert.equal(e.source, 'probe:claude');
  assert.deepEqual(e.windows.map((w) => [w.id, w.usedPct]), [['5h', 12], ['week', 55], ['week:Fable', 13]]);
  assert.equal(new Date(e.windows[1].resetsAt).toISOString(), '2026-11-25T21:00:00.000Z'); // 11월 26일 06시 KST
  assert.equal(new Date(e.windows[0].resetsAt).toISOString(), '2026-11-22T06:50:00.000Z'); // 오늘 15:50 KST
  assert.equal(claudeProbeUsageOf('nothing here', NOW), null);
  // 5시간 창이 비면 그 줄이 없다(실측) → 주간만
  assert.deepEqual(claudeProbeUsageOf('Current week (all models): 55% used · resets Nov 26, 6am (Asia/Seoul)', NOW).windows.map((w) => w.id), ['week']);
});

test('P314 리셋 시각 글: 날짜+시각, 시각만(지났으면 다음 날), 해 넘김, 분, 모르는 시간대는 이 PC 시각', () => {
  assert.equal(new Date(parseResetText('Nov 26, 6:30pm (UTC)', NOW)).toISOString(), '2026-11-26T18:30:00.000Z');
  assert.equal(new Date(parseResetText('1am (UTC)', NOW)).toISOString(), '2026-11-23T01:00:00.000Z'); // 02:43Z에 본 1am → 내일
  assert.equal(new Date(parseResetText('Jan 2, 12am (UTC)', Date.parse('2026-12-30T00:00:00Z'))).toISOString(), '2027-01-02T00:00:00.000Z');
  assert.equal(new Date(parseResetText('Nov 26 at 6am (America/New_York)', NOW)).toISOString(), '2026-11-26T11:00:00.000Z');
  assert.ok(Number.isFinite(parseResetText('Nov 26, 6am (Not/AZone)', NOW)));
  assert.equal(parseResetText('soon', NOW), null);
  assert.equal(parseResetText('Foo 3, 6am', NOW), null);
});

test('P314 낡음·부를지: 켜짐·낡음·일하지 않음·묻는 중 아님·간격(실패 뒤는 30분)', () => {
  const staleMs = 10 * MIN;
  assert.equal(staleOf(null, NOW, staleMs), true);
  assert.equal(staleOf({ at: NOW - 11 * MIN }, NOW, staleMs), true);
  assert.equal(staleOf({ at: NOW - 9 * MIN }, NOW, staleMs), false);
  const base = { on: true, stale: true, busy: false, inflight: false, now: NOW, staleMs };
  assert.equal(shouldProbe(base), true);
  assert.equal(shouldProbe({ ...base, on: false }), false);
  assert.equal(shouldProbe({ ...base, stale: false }), false);
  assert.equal(shouldProbe({ ...base, busy: true }), false);
  assert.equal(shouldProbe({ ...base, inflight: true }), false);
  assert.equal(shouldProbe({ ...base, lastTry: NOW - 5 * MIN }), false);
  assert.equal(shouldProbe({ ...base, lastTry: NOW - 11 * MIN }), true);
  assert.equal(shouldProbe({ ...base, lastTry: NOW - 11 * MIN, lastOk: false }), false);
  assert.equal(shouldProbe({ ...base, lastTry: NOW - 31 * MIN, lastOk: false }), true);
});

function book({ settings = {}, busy = () => false, data = {} } = {}) {
  let now = NOW;
  const calls = [];
  const sent = [];
  const meta = { usage: data };
  const vals = {
    codex: () => codexProbeUsageOf(CODEX_RESULT, now),
    claude: () => claudeProbeUsageOf(CLAUDE_TEXT, now),
    hermes: () => ({ provider: 'hermes', source: 'probe:hermes', at: now, windows: [{ id: '5h', usedPct: 20, resetsAt: now + 60 * MIN }] }), // P347: 옛 탐침을 주어도 부르지 않는다
    balance: () => balanceEntriesOf('{"provider":"deepseek","balance":"12.345","currency":"USD"}', now),
  };
  const probe = Object.fromEntries(Object.entries(vals).map(([k, f]) => [k, async () => { calls.push(k); return f(); }]));
  const b = new UsageBook({ store: { getMeta: (k) => meta[k] ?? null, setMeta: (k, v) => { meta[k] = v; } }, broadcast: (e, v) => sent.push([e, v]), settings: () => settings, now: () => now, pollMs: 0, probe, busy });
  return { b, calls, sent, meta, setNow: (t) => { now = t; }, vals };
}
const flush = () => new Promise((r) => setTimeout(r, 5));

test('P314 원천 순서: 주기(tick)는 Codex만, Claude·잔액은 펼칠 때(refresh)만. 새 값이면 묻지 않는다', async () => {
  const x = book();
  x.b.tick(); await flush();
  assert.deepEqual(x.calls, ['codex']);
  assert.equal(x.b.data.codex.source, 'probe:codex');
  x.b.tick(); await flush();
  assert.deepEqual(x.calls, ['codex'], '방금 받은 값은 낡지 않았다');
  x.b.refresh(); await flush();
  assert.deepEqual(x.calls.sort(), ['balance', 'claude', 'codex'].sort());
  assert.equal(x.b.get().providers.deepseek.balance.total, 12.35);
  assert.deepEqual(x.b.get().providers.claude.windows.map((w) => w.id), ['5h', 'week', 'week:Fable']);
  assert.ok(x.sent.some(([e, v]) => e === 'usage.updated' && Array.isArray(v.probing)));
});

test('P314 상태 줄·rollout이 새 값을 주면 묻지 않는다. 낡으면(간격 지남) 다시, 그 종류 세션이 일하면 묻지 않는다, 설정 끔이면 안 묻는다', async () => {
  const fresh = { codex: { provider: 'codex', source: 'rollout', at: NOW - 2 * MIN, windows: [{ id: '5h', usedPct: 1, resetsAt: null }] } };
  const x = book({ data: fresh });
  x.b.tick(); await flush();
  assert.deepEqual(x.calls, []);
  x.setNow(NOW + 9 * MIN); x.b.tick(); await flush();
  assert.deepEqual(x.calls, ['codex'], '간격(10분)이 지나 낡았다');
  const y = book({ busy: (k) => k === 'codex' });
  y.b.tick(); await flush();
  assert.deepEqual(y.calls, [], 'Codex 세션이 일하는 중');
  const z = book({ settings: { usageProbe: false } });
  z.b.tick(); z.b.refresh(); await flush();
  assert.deepEqual(z.calls, []);
  assert.equal(z.b.get().probeOn, false);
  const m = book({ settings: { usageProbeMin: 60 }, data: { codex: { ...fresh.codex, at: NOW - 30 * MIN } } });
  m.b.tick(); await flush();
  assert.deepEqual(m.calls, [], '간격 60분이면 30분 된 값은 아직 새 값');
});

test('P314 실패한 탐침(값 없음)은 30분 쉬고 다시 묻는다', async () => {
  const x = book();
  x.b.probe.codex = async () => { x.calls.push('codex'); return null; };
  x.b.tick(); await flush();
  x.setNow(NOW + 11 * MIN); x.b.tick(); await flush();
  assert.deepEqual(x.calls, ['codex']);
  x.setNow(NOW + 31 * MIN); x.b.tick(); await flush();
  assert.deepEqual(x.calls, ['codex', 'codex']);
});

test('P347 Hermes 사용량을 걷었다: 탐침을 부르지 않고, 판 기록의 옛 hermes 값은 싣지 않고 다시 쓰지도 않는다', async () => {
  const old = { provider: 'hermes', source: 'probe:hermes', at: NOW - MIN, hermesProvider: 'openai-codex', plan: 'Plus', sameAs: 'codex', windows: [{ id: '5h', minutes: 300, usedPct: 20, resetsAt: NOW + 60 * MIN }] };
  const x = book({ settings: { usageHermes: true }, data: { hermes: old } });
  x.b.tick(); x.b.refresh(); await flush(); await flush();
  assert.ok(!x.calls.includes('hermes'), '설정에 옛 usageHermes가 켜져 있어도 묻지 않는다');
  assert.equal('hermes' in x.b.get().providers, false);
  x.b.save();
  assert.equal('hermes' in x.meta.usage, false, '다시 저장하면 옛 값이 빠진다');
  assert.equal(x.b.set({ ...old, at: NOW }), false, '옛 꼴의 값이 와도 오류 없이 버린다');
  assert.equal('hermes' in x.b.get().providers, false, '보이지 않는다');
  assert.equal('hermes' in x.meta.usage, false, '판 기록에도 남지 않는다');
  for (const k of ['hermesProbeUsageOf', 'probeHermes', 'sameAccount']) assert.equal(k in probeMod, false, k);
  assert.equal('hermes' in PROVIDERS || EXTRAS.includes('hermes'), false);
});

test('P347 옛 설정 usageHermes는 읽어도 무시(오류 없음)', () => {
  assert.equal('usageHermes' in SETTINGS, false); assert.equal('usageHermes' in DEFAULTS, false);
  const meta = { settings: { usageHermes: true, usageProbe: false } };
  const s = new Settings({ store: { getMeta: (k) => meta[k] ?? null, setMeta: (k, v) => { meta[k] = v; } }, broadcast: () => {} });
  const v = s.get();
  assert.equal('usageHermes' in v, false);
  assert.equal(v.usageProbe, false);
});

test('P314 Claude 상태 줄 값이 와도 탐침의 모델별 주간 창은 리셋 전까지 잇는다', async () => {
  const x = book();
  x.b.refresh(); await flush();
  x.b.report('claude', { rate_limits: { five_hour: { used_percentage: 30, resets_at: Math.round((NOW + 3600000) / 1000) }, seven_day: { used_percentage: 56, resets_at: Math.round((NOW + 86400000) / 1000) } } });
  const c = x.b.get().providers.claude;
  assert.equal(c.source, 'statusline');
  assert.deepEqual(c.windows.map((w) => [w.id, w.usedPct]), [['5h', 30], ['week', 56], ['week:Fable', 13]]);
});

test('P314 잔액 읽개 출력 꼴: 알려진 프로바이더의 숫자만, 오류 줄·모르는 프로바이더·이상한 통화는 버린다', () => {
  const out = balanceEntriesOf(['{"provider":"deepseek","balance":"12.345","currency":"USD"}', '{"provider":"openrouter","error":"http 401"}', '{"provider":"evil","balance":"1"}', 'not json', '{"provider":"openrouter","balance":"3","currency":"usd!"}'].join('\n'), NOW);
  assert.deepEqual(out.map((e) => [e.provider, e.balance.total, e.balance.currency, e.source]), [['deepseek', 12.35, 'USD', 'probe:balance'], ['openrouter', 3, null, 'probe:balance']]);
});

function balanceServer() {
  return new Promise((resolve) => {
    const seen = [];
    const srv = http.createServer((req, res) => {
      seen.push({ url: req.url, auth: req.headers.authorization });
      if (req.headers.authorization !== 'Bearer secret-p314-key') { res.writeHead(401); res.end('{}'); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.url.startsWith('/user/balance')) res.end(JSON.stringify({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '50.00' }, { currency: 'USD', total_balance: '7.25' }] }));
      else res.end(JSON.stringify({ data: { total_credits: 20, total_usage: 4.5 } }));
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, seen, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

test('P314 잔액 읽개(bin/atrium-balance.mjs): 키는 자기 환경에서만 읽고 출력에 내지 않는다. 가짜 secret-run 거쳐 판이 숫자만 받는다', async () => {
  const { srv, seen, base } = await balanceServer();
  try {
    const env = { ...process.env, P314_FAKE_KEY: 'secret-p314-key', ATRIUM_BALANCE_DEEPSEEK_URL: base + '/user/balance', PSModulePath: 'C:/should-be-removed' };
    delete env.DEEPSEEK_API_KEY; delete env.OPENROUTER_API_KEY;
    const sr = { argv: [process.execPath, path.join(FIX, 'p314-fake-secret-run.mjs')] };
    let raw = null;
    const run = async (file, args, o) => { const { runOnce } = await import('../src/usage-probe.mjs'); raw = await runOnce(file, args, o); return raw; };
    const got = await probeBalance({ secretRun: sr, grant: 'atrium-usage', reader: READER, env, run, now: () => NOW });
    assert.deepEqual(got.map((e) => [e.provider, e.balance.total, e.balance.currency]), [['deepseek', 7.25, 'USD']]);
    assert.ok(!raw.out.includes('secret-p314-key') && !raw.err.includes('secret-p314-key'), '키 값이 출력에 없다');
    assert.ok(!JSON.stringify(got).includes('secret-p314-key'));
    assert.equal(seen.length, 1); assert.equal(seen[0].auth, 'Bearer secret-p314-key');
    // grant가 없으면(가짜 secret-run이 1로 끝남) 조용히 없음
    assert.equal(await probeBalance({ secretRun: sr, grant: 'no-such-grant', reader: READER, env }), null);
    // secret-run을 못 찾으면 없음
    assert.equal(await probeBalance({ secretRun: null, grant: 'atrium-usage', reader: READER, env }), null);
  } finally { srv.close(); }
});

test('P314 잔액 읽개: 키가 없는 프로바이더는 건너뛰고, 거절(401)은 HTTP 상태만 낸다', async () => {
  const { srv, base } = await balanceServer();
  try {
    const { runOnce } = await import('../src/usage-probe.mjs');
    const env = { ...process.env, DEEPSEEK_API_KEY: 'wrong-key-p314', OPENROUTER_API_KEY: 'secret-p314-key', ATRIUM_BALANCE_DEEPSEEK_URL: base + '/user/balance', ATRIUM_BALANCE_OPENROUTER_URL: base + '/api/v1/credits' };
    const r = await runOnce(process.execPath, [READER], { env, timeoutMs: 20000 });
    assert.equal(r.code, 0);
    assert.ok(!r.out.includes('wrong-key-p314') && !r.out.includes('secret-p314-key'));
    const lines = r.out.trim().split(/\r?\n/).map((l) => JSON.parse(l)).sort((a, b) => a.provider.localeCompare(b.provider));
    assert.deepEqual(lines, [{ provider: 'deepseek', error: 'http 401' }, { provider: 'openrouter', balance: '15.5', currency: 'USD' }]);
    const none = await runOnce(process.execPath, [READER], { env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot || '' }, timeoutMs: 20000 });
    assert.equal(none.out.trim(), '', '키가 없으면 아무 줄도 없다');
  } finally { srv.close(); }
});

test('P314 secret-run 부르기 꼴: powershell -File <ps1> <grant> -- <node> <읽개>', () => {
  const a = balanceArgv({ secretRun: { ps1: 'X:/sr/secret-run.ps1' }, grant: 'atrium-usage', node: 'N:/node.exe', reader: 'R:/atrium-balance.mjs' });
  assert.deepEqual(a, ['powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'X:/sr/secret-run.ps1', 'atrium-usage', '--', 'N:/node.exe', 'R:/atrium-balance.mjs']]);
  assert.equal(balanceArgv({ secretRun: null, grant: 'g', reader: 'r' }), null);
});

test('P314 탐침 자식 env: 판·세션 변수와 API 키는 넘기지 않는다', () => {
  const e = probeEnv({ PATH: 'p', ATRIUM_PORT: '1', HC_SESSION: 'x', CLAUDECODE: '1', ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'k', USERPROFILE: 'u' });
  assert.deepEqual(Object.keys(e).sort(), ['PATH', 'USERPROFILE']);
});

test('P314 Claude 탐침: 사용자 설정·훅·MCP를 끄고 대화를 남기지 않는 인자, 빈 프로젝트 폴더만 치운다, 모델 턴이 돌면 버린다', async () => {
  const dir = tmp(); const projects = tmp();
  try {
    let seen = null;
    const run = async (file, args, o) => {
      seen = { file, args, cwd: o.cwd };
      fs.mkdirSync(path.join(projects, claudeProjectDirName(o.cwd), 'memory'), { recursive: true }); // Claude Code가 빈 폴더를 만든다(실측)
      return { code: 0, out: JSON.stringify({ type: 'result', is_error: false, num_turns: 0, total_cost_usd: 0, result: CLAUDE_TEXT }) };
    };
    const e = await probeClaude({ command: 'claude', dir, projectsDir: projects, run, now: () => NOW });
    assert.deepEqual(e.windows.map((w) => w.id), ['5h', 'week', 'week:Fable']);
    assert.deepEqual(seen.args, claudeProbeArgs(path.join(dir, 'claude-settings.json')));
    for (const a of ['--setting-sources', 'local', '--strict-mcp-config', '--no-session-persistence', '/usage']) assert.ok(seen.args.includes(a), a);
    assert.equal(seen.cwd, path.join(dir, 'claude'));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'claude-settings.json'), 'utf8')), CLAUDE_PROBE_SETTINGS);
    assert.equal(fs.existsSync(path.join(projects, claudeProjectDirName(seen.cwd))), false, '빈 프로젝트 폴더는 치운다');
    // 모델 턴이 돌았으면(/usage가 명령으로 읽히지 않음) 버린다. 기록 파일이 생겼으면 남긴다
    const run2 = async (file, args, o) => { const d = path.join(projects, claudeProjectDirName(o.cwd)); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'x.jsonl'), '{}'); return { code: 0, out: JSON.stringify({ num_turns: 1, result: CLAUDE_TEXT }) }; };
    assert.equal(await probeClaude({ dir, projectsDir: projects, run: run2 }), null);
    assert.equal(fs.existsSync(path.join(projects, claudeProjectDirName(seen.cwd), 'x.jsonl')), true);
    assert.equal(await probeClaude({ dir, projectsDir: projects, run: async () => ({ code: 1, out: '' }) }), null);
    assert.equal(removeIfEmptyTree(path.join(projects, 'nope')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(projects, { recursive: true, force: true }); }
});

test('P314 codex app-server 탐침(가짜 서버): JSON-RPC 세 줄로 값을 받는다. 명령이 없으면 null', async () => {
  const cmd = `"${process.execPath}" "${path.join(FIX, 'p314-fake-codex.mjs')}"`;
  const e = await probeCodex({ command: process.platform === 'win32' ? cmd : process.execPath, timeoutMs: 15000, now: () => NOW, ...(process.platform === 'win32' ? {} : {}) });
  if (process.platform === 'win32') {
    assert.equal(e.source, 'probe:codex'); assert.equal(e.credits.balance, '120.5');
  }
  assert.equal(await probeCodex({ command: 'atrium-no-such-codex-p314', timeoutMs: 8000 }), null);
});

test('P314 설정: usageProbe(기본 켬), usageProbeMin(10분, 2~240)', () => {
  assert.equal(DEFAULTS.usageProbe, true); assert.equal(DEFAULTS.usageProbeMin, 10);
  assert.equal(SETTINGS.usageProbeMin.min, 2); assert.equal(SETTINGS.usageProbeMin.max, 240);
});

test('P314 atrium usage 글: 출처(직접 물음), 모델별 주간, 잔액. P347: 옛 hermes 값은 글에 없다', () => {
  const view = { providers: {
    claude: claudeProbeUsageOf(CLAUDE_TEXT, NOW), codex: codexProbeUsageOf(CODEX_RESULT, NOW), agy: null,
    hermes: { provider: 'hermes', source: 'probe:hermes', at: NOW, hermesProvider: HERMES_JSON.provider, sameAs: 'codex', windows: [{ id: '5h', usedPct: 20 }] },
    deepseek: balanceEntriesOf('{"provider":"deepseek","balance":"7.25","currency":"USD"}', NOW)[0],
  }, alertsOn: true };
  const t = usageLines(view, NOW).join('\n');
  assert.match(t, /claude \/usage에 직접 물음/);
  assert.match(t, /주간\(Fable\) 13%/);
  assert.doesNotMatch(t, /Hermes|hermes/);
  assert.match(t, /DeepSeek 잔액: 7\.25 USD/);
  const t2 = usageLines({ providers: { ...view.providers, hermes: { ...view.providers.hermes, sameAs: null } } }, NOW).join('\n');
  assert.doesNotMatch(t2, /Hermes/);
  assert.deepEqual(PROVIDERS, ['claude', 'codex', 'agy']); assert.deepEqual(EXTRAS, ['deepseek', 'openrouter']);
});
