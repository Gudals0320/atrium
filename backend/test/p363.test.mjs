// P363: SDK 세션 종류(claude -p stream-json, 판 중계기). 띄우는 인자·env(키 없음), stream 해석 → 상태·마지막 답, 과금 오류,
//   전달(대기열·스티어링), 쉬면 프로세스가 끝나고 --resume으로 이어 감, 옛 API 런처 걷기와 {{authRelay}} 런처 옮기기, models 목록
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSdkArgs, sdkEnv, readStreamEvent, applyStreamEvent, isBillingText, SdkHost, SDK_LAUNCHER_ID, userLine } from '../src/sdk-session.mjs';
import { newRuntime, deriveState } from '../src/state.mjs';
import { canTypeNow, blockReason } from '../src/delivery.mjs';
import { Store } from '../src/store.mjs';
import { Backend } from '../src/backend.mjs';
import { Launchers, META_KEY, apiLauncher, resolveLauncher, RELAY_GONE_META } from '../src/launchers.mjs';
import { DEFAULTS } from '../src/settings.mjs';
import { buildCatalog, resolveModel } from '../src/models.mjs';
import { entrypointOf } from '../src/auth-relay-core.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'p363-'));
const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'p363-fake-claude.mjs');
const until = async (f, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = f(); if (v) return v; await new Promise((r) => setTimeout(r, 25)); } throw new Error('timeout'); };

test('띄우는 인자: 처음은 --session-id(+ --worktree), 다시는 --resume. 권한은 bypassPermissions, stream-json', () => {
  const a = buildSdkArgs({ sessionId: 'S1', worktree: 'wt1', settingsPath: 'C:/x/s.json', model: 'haiku', effort: 'low', pluginDir: 'C:/p', systemPromptFile: 'C:/p.md', extraArgs: ['--add-dir', 'C:/y'] });
  assert.deepEqual(a.slice(0, 6), ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose']);
  assert.deepEqual(a.slice(6, 10), ['--session-id', 'S1', '--worktree', 'wt1']);
  for (const [f, v] of [['--permission-mode', 'bypassPermissions'], ['--settings', 'C:/x/s.json'], ['--model', 'haiku'], ['--effort', 'low'], ['--plugin-dir', 'C:/p'], ['--append-system-prompt-file', 'C:/p.md']]) assert.equal(a[a.indexOf(f) + 1], v, f);
  assert.deepEqual(a.slice(-2), ['--add-dir', 'C:/y']);
  const r = buildSdkArgs({ sessionId: 'S1', resume: true, worktree: 'wt1', settingsPath: 's' });
  assert.equal(r[r.indexOf('--resume') + 1], 'S1');
  assert.ok(!r.includes('--session-id') && !r.includes('--worktree'), '다시 띄울 때는 워크트리를 만들지 않는다');
});

test('env: API 키·인증 변수·판 변수·부모 Claude Code 변수를 빼고 ANTHROPIC_BASE_URL만 중계기', () => {
  const e = sdkEnv({ PATH: 'p', ANTHROPIC_API_KEY: 'sk-x', ANTHROPIC_AUTH_TOKEN: 't', ANTHROPIC_BASE_URL: 'http://other', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', ATRIUM_PORT: '47800', HC_SESSION: 'atrium', SONIOX_API_KEY: 'v' }, { relayUrl: 'http://127.0.0.1:5/sec/S1' });
  assert.deepEqual(e, { PATH: 'p', ANTHROPIC_BASE_URL: 'http://127.0.0.1:5/sec/S1' });
});

test('stream 해석: result → 쉼과 마지막 답, 과금 오류 → 오류(billing_error)와 까닭', () => {
  const rt = newRuntime({ kind: 'claude', hooked: true });
  rt.phase = 'running'; rt.term.present = true; rt.term.status = 'working'; rt.turn = { startedAt: 1, endedAt: null };
  applyStreamEvent(rt, readStreamEvent({ type: 'system', subtype: 'init', cwd: 'C:/w', session_id: 'S' }));
  assert.equal(deriveState(rt).state, 'working');
  applyStreamEvent(rt, readStreamEvent({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } }));
  applyStreamEvent(rt, readStreamEvent({ type: 'result', subtype: 'success', is_error: false, result: 'ONE', num_turns: 1 }));
  assert.equal(deriveState(rt).state, 'ready'); assert.equal(rt.lastAnswer, 'ONE'); assert.ok(rt.turn.endedAt);
  rt.term.status = 'working';
  applyStreamEvent(rt, readStreamEvent({ type: 'assistant', message: { content: [{ type: 'text', text: 'Credit balance is too low' }] }, error: 'billing_error' }));
  applyStreamEvent(rt, readStreamEvent({ type: 'result', subtype: 'success', is_error: true, result: 'Credit balance is too low' }));
  const d = deriveState(rt);
  assert.equal(d.state, 'error'); assert.equal(d.error.type, 'billing_error'); assert.match(d.error.message, /Credit balance/);
  assert.ok(isBillingText('Your credit balance is too low to access the Anthropic API.'));
  assert.ok(!isBillingText('all good'));
  assert.equal(userLine('a\nb'), JSON.stringify({ type: 'user', message: { role: 'user', content: 'a\nb' } }) + '\n');
});

test('중계기 기록의 entrypoint: User-Agent의 괄호 끝 낱말만', () => {
  assert.equal(entrypointOf('claude-cli/2.1.332 (external, sdk-cli)'), 'sdk-cli');
  assert.equal(entrypointOf('claude-cli/2.1.332 (external, cli)'), 'cli');
  assert.equal(entrypointOf('curl/8'), null);
});

test('런처: 기본 API 런처는 지우고, 고친 것·{{authRelay}} 사용자 런처는 쓸 수 없음(까닭), SDK 런처를 한 번 더한다', () => {
  const dir = tmp();
  try {
    const store = new Store(path.join(dir, 'board.db'));
    const mine = { id: 'mine', name: 'My API', harness: 'claude', icon: '', model: 'opus', effort: '', permissionMode: 'manual', args: '', env: { ANTHROPIC_BASE_URL: '{{authRelay}}' }, command: '' };
    store.setMeta(META_KEY, { v: 2, items: [{ id: 'claude', name: 'Claude Code', harness: 'claude', icon: '', model: '', effort: '', permissionMode: 'manual', args: '', env: {}, command: '' }, apiLauncher(), mine], favorites: ['claude', 'claude-api', 'mine'] });
    store.setMeta('launchers.apiRelay', { at: 1, added: true });
    const ls = new Launchers({ store });
    assert.deepEqual(ls.relayGone, { removed: ['Claude Code (API)'], marked: ['My API'] });
    const got = store.getMeta(META_KEY);
    assert.deepEqual(got.items.map((l) => l.id), ['claude', 'mine', SDK_LAUNCHER_ID]);
    assert.deepEqual(got.favorites, ['claude'], '레일에서도 뺀다');
    assert.equal(got.items[1].unusable, 'authRelay');
    assert.throws(() => resolveLauncher(ls.get('mine')), (e) => e.code === 'launcher_unusable' && e.key === 'sdkSession.err.relayGone');
    const sdk = resolveLauncher(ls.get(SDK_LAUNCHER_ID), { model: 'haiku', effort: 'low' });
    assert.deepEqual([sdk.sdk, sdk.kind, sdk.model, sdk.effort, sdk.permissionMode], [true, 'claude', 'haiku', 'low', 'bypassPermissions']);
    assert.ok(store.getMeta(RELAY_GONE_META));
    // 다시 켜도 같다(한 번만). SDK 런처를 지우면 다시 더하지 않는다
    ls.delete({ id: SDK_LAUNCHER_ID });
    const ls2 = new Launchers({ store });
    assert.equal(ls2.find(SDK_LAUNCHER_ID), null);
    assert.equal(ls2.relayGone, null);
    store.close();
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
});

test('atrium models: SDK 런처는 과금 sdk로 나오고 이름으로만 고른다(모델 이름 sonnet은 구독 하네스로)', () => {
  const launchers = [{ id: 'claude', name: 'Claude Code', harness: 'claude', model: '', env: {} }, { id: SDK_LAUNCHER_ID, name: 'Claude Code SDK', harness: 'claude-sdk', model: 'sonnet', env: {} }, { id: 'old', name: 'Old API', harness: 'claude', model: '', env: { ANTHROPIC_BASE_URL: '{{authRelay}}' }, unusable: 'authRelay' }];
  const cat = buildCatalog({ launchers, harnessModels: {} });
  const e = cat.entries.find((x) => x.launcherId === SDK_LAUNCHER_ID);
  assert.equal(e.billing, 'sdk'); assert.match(e.command, /--launcher/);
  assert.ok(!cat.entries.some((x) => x.launcherId === 'old'), '쓸 수 없는 옛 런처는 목록에 없다');
  assert.equal(resolveModel('Claude Code SDK', cat).entry.launcherId, SDK_LAUNCHER_ID);
  const s = resolveModel('sonnet', cat);
  assert.ok(s.ok && !s.entry.billing, 'sonnet은 SDK로 풀리지 않는다');
});

// ---- 판 통합(가짜 claude -p, 가짜 중계기) ----
function sdkBoard({ idleMs = 300, keyed = true } = {}) {
  const dir = tmp();
  const fake = path.join(dir, 'fake'); fs.mkdirSync(fake);
  process.env.P363_FAKE_DIR = fake;
  const b = new Backend({ quietMs: 600000, port: 0, logDir: dir, sessionsDir: path.join(dir, 'sessions'), claudeJson: path.join(dir, 'none.json'), claudeCommand: 'claude', claudeProjects: path.join(dir, 'projects'), hookTimeoutSec: 2 });
  b.store = new Store(path.join(dir, 'board.db'));
  b.sessions = new Map(); b.termOk = true; b.hookUrl = 'http://127.0.0.1:1/hook'; b.plugin = { pluginDir: 'C:/plug', systemPromptFile: 'C:/plug.md' };
  b.branch = { settingsExtra: (sid) => ({ env: { ATRIUM_SESSION: sid } }), noteChild() {}, placeChild: () => null, holds: () => false };
  b.features = { settings: { get: () => ({ ...DEFAULTS }) }, launchers: null };
  b.features.launchers = new Launchers({ store: b.store });
  const queued = [];
  b.queue = { enqueue: (sid, text) => { queued.push({ sid, text }); return { deliveryId: 'd1' }; }, pending: () => 0, poke() {}, cancelSession() {} };
  b.api = { broadcast() {} };
  b.broadcastSession = () => {}; b.broadcastWorkspaces = () => {}; b.probeGit = () => {};
  b.authRelay = { ensure: async () => { if (!keyed) throw Object.assign(new Error('no key'), { code: 'auth_relay_no_key', key: 'authRelay.err.noKey' }); }, url: (sid) => `http://127.0.0.1:9/sec/${sid}` };
  const calls = [];
  b.adapter = { connected: false, agentKinds: async () => [], refreshSubscription: async () => {}, createWorkspace: async (o) => { calls.push(o); throw new Error('no terminal for SDK'); } };
  b.sdk = new SdkHost(b, { idleMs, command: [process.execPath, FAKE] });
  return { b, dir, fake, calls, queued, log: () => fs.readFileSync(path.join(fake, 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) };
}

test('SDK 세션: 터미널 없이 띄우고 두 턴(둘째가 첫째를 기억), 쉬면 프로세스가 끝나고 다음 글은 --resume으로 이어 간다. env에 키 없음', async () => {
  const { b, dir, calls, queued, log } = sdkBoard();
  try {
    const r = await b.spawn({ cwd: dir, launcher: SDK_LAUNCHER_ID, model: 'haiku', name: 'sdk1', prompt: 'first hello' });
    assert.equal(calls.length, 0, '터미널(hc)을 쓰지 않는다');
    assert.equal(r.billing, 'sdk');
    const s = b.sessions.get(r.sessionId);
    assert.deepEqual([s.billing, s.paneId, s.model, s.permissionMode], ['sdk', null, 'haiku', 'bypassPermissions']);
    assert.equal(b.store.getSession(r.sessionId).billing, 'sdk', '판 기록에 남는다');
    assert.equal(deriveState(s.rt).state, 'ready', '띄우자마자 받을 수 있다');
    assert.deepEqual(queued, [{ sid: r.sessionId, text: 'first hello' }], '첫 요청은 판의 대기열로');
    const set = JSON.parse(fs.readFileSync(r.settingsPath, 'utf8'));
    assert.ok(set.hooks.UserPromptSubmit && set.hooks.Stop, '판 hook'); assert.equal(set.env.ATRIUM_SESSION, r.sessionId);
    assert.ok(!JSON.stringify(set).includes('ANTHROPIC'), '설정 파일에 키·주소가 없다');
    // 전달 view: 터미널이 없어도 연결됨, 쉬면 바로 보낸다
    const view = b.deliveryView(r.sessionId);
    assert.equal(view.termConnected, true); assert.equal(blockReason(view, Date.now(), { inputQuietMs: 3000 }), null);
    // 첫 턴
    await b.sendPrompt(r.sessionId, 'first hello');
    assert.equal(deriveState(s.rt).state, 'working');
    assert.ok(canTypeNow(b.deliveryView(r.sessionId)), '일하는 중 스티어링(typeNow)을 받는다');
    assert.equal(blockReason(b.deliveryView(r.sessionId), Date.now(), { inputQuietMs: 3000 }), 'working', '기본 대기열은 턴 뒤로');
    await until(() => deriveState(s.rt).state === 'ready' && s.rt.lastAnswer);
    assert.match(s.rt.lastAnswer, /n=1 first=first hello resume=false/);
    // 둘째 턴은 같은 프로세스
    await b.sendPrompt(r.sessionId, 'second');
    await until(() => /n=2/.test(s.rt.lastAnswer || ''));
    assert.equal(log().length, 1, '같은 프로세스');
    const l0 = log()[0];
    assert.equal(l0.hasKey, false, 'env에 API 키가 없다'); assert.equal(l0.base, `http://127.0.0.1:9/sec/${r.sessionId}`);
    assert.ok(l0.argv.includes('--session-id') && l0.argv.includes('haiku') && l0.argv.includes('bypassPermissions'));
    // 쉬면 끝난다
    await until(() => !b.sdk.alive(r.sessionId), 5000);
    assert.equal(deriveState(s.rt).state, 'ready', '프로세스가 끝나도 쉼(받을 수 있음)');
    assert.equal(b.sdk.view(s).alive, false);
    // 다음 글: --resume으로 다시 띄우고 앞 대화를 기억한다
    await b.sendPrompt(r.sessionId, 'third');
    await until(() => /n=3/.test(s.rt.lastAnswer || ''));
    assert.match(s.rt.lastAnswer, /first=first hello resume=true/);
    assert.equal(log()[1].resume, true); assert.ok(log()[1].argv.includes('--resume'));
    // 닫기: 프로세스를 끊고 판에서 닫는다
    const k = await b.kill({ session: 'sdk1', confirm: true });
    assert.equal(k.closed, true);
    assert.ok(!b.sessions.has(r.sessionId));
  } finally { await b.sdk.stopAll(); b.store.close(); }
});

test('SDK 세션: 과금 오류는 까닭과 함께 오류, 턴 중 프로세스가 죽으면 오류(sdk_exit)', async () => {
  const { b, dir } = sdkBoard({ idleMs: 60000 });
  try {
    const r = await b.spawn({ cwd: dir, launcher: SDK_LAUNCHER_ID, name: 'sdk2' });
    const s = b.sessions.get(r.sessionId);
    await b.sendPrompt(r.sessionId, 'please BILLING');
    await until(() => deriveState(s.rt).state === 'error');
    assert.equal(deriveState(s.rt).error.type, 'billing_error');
    assert.match(s.rt.lastError.message, /Credit balance/);
    // 다음 글을 보내면 오류가 지워지고 다시 돈다
    await b.sendPrompt(r.sessionId, 'SLOW work');
    assert.equal(deriveState(s.rt).state, 'working');
    await b.stopSdkTurn({ session: 'sdk2' });
    assert.equal(deriveState(s.rt).state, 'ready', '판이 멈춘 것은 오류가 아니다');
    await b.sendPrompt(r.sessionId, 'SLOW again');
    const pid = b.sdk.view(s).pid;
    process.kill(pid);
    await until(() => deriveState(s.rt).state === 'error');
    assert.equal(deriveState(s.rt).error.type, 'sdk_exit');
  } finally { await b.sdk.stopAll(); b.store.close(); }
});

test('SDK 세션: 키가 없으면 세션을 만들지 않고 까닭을 준다', async () => {
  const { b, dir } = sdkBoard({ keyed: false });
  try {
    await assert.rejects(() => b.spawn({ cwd: dir, launcher: SDK_LAUNCHER_ID }), (e) => e.code === 'auth_relay_no_key' && e.key === 'authRelay.err.noKey');
    assert.equal(b.sessions.size, 0);
  } finally { b.store.close(); }
});
