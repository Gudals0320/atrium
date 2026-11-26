// P380 단위 시험: OmO(omo) 세션으로 가는 글·명령 출력에서 위험 낱말 빼기(risky-words.mjs), atrium prompt --raw(머리 없이 맨 앞, 일 연결 유지), 계약 13.
// 진짜 저장소·전달 대기열·Branch, 가짜 에이전트(p180 시험의 틀). herdr·hc와 claude 없이 돈다. 이 파일도 그 낱말을 붙여 쓰지 않는다(W)
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
import { Branch, boardSkill, callerKind } from '../src/branch.mjs';
import { CONTRACT_VERSION, VERBS, shortHelp, contractJson } from '../src/cli-contract.mjs';
import { dropRiskyWords, hasRiskyWord, hasStandaloneRiskyWord, riskyKind, safeFor, RISKY_SHOWN } from '../src/risky-words.mjs';
import { HARNESS_PROMPT, harnessLaunch } from '../src/harness.mjs';
import { orchPromptLines } from '../src/orchestration.mjs';

const W = ['open', 'code'].join(''); // 그 낱말(소문자)

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p380-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp() } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p380test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const b = {
    cfg, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), sent: [], spawned: [],
    api: { broadcast: () => {} }, log: () => {}, requireTerminal: () => {},
    adapter: { backend: 'hc', connected: true, readScreen: async () => '' },
    hooked: (s) => s.rt.hooked !== false,
    summary: (s) => { const d = deriveState(s.rt); return { state: d.state, ask: d.ask || null, error: d.error || null }; },
    ensureLink(from, to, patch = {}) {
      let l = store.linkByPair(from, to);
      if (!l) { l = { linkId: 'l' + crypto.randomBytes(4).toString('hex'), from, to, role: patch.role ?? null, spawned: !!patch.spawned, observed: !!patch.observed, createdAt: Date.now() }; store.insertLink(l); }
      return store.getLink(l.linkId);
    },
    linkEvent(l, kind, text = null, data = null) { return store.addLinkEvent(l.linkId, kind, text, data); },
    // 상태가 바뀌면 판처럼 bus로 알린다(Branch.onSession → WorkUnits.onSession)
    broadcastSession(s) { if (b.sessions.has(s.sessionId)) b.bus.emit('session', s, b.summary(s)); },
    async spawn(p) {
      const s = add(p.name, { parentSessionId: p.parentSessionId || null });
      if (p.branch) b.branch.noteChild(s.sessionId, p.branch);
      b.spawned.push(p);
      return { sessionId: s.sessionId, trust: { needsTrust: false } };
    },
    closeSession(s, reason) { b.sessions.delete(s.sessionId); store.updateSession(s.sessionId, { closedAt: Date.now() }); b.bus.emit('closed', s, reason); },
  };
  b.queue = new DeliveryQueue({
    store, cfg,
    view: (sid) => { const s = b.sessions.get(sid); if (!s) return { closed: true }; return { state: deriveState(s.rt).state, agentPresent: s.rt.term.present, termConnected: true, lastUserInputAt: 0, closed: false, kind: s.kind, hooked: b.hooked(s) }; },
    send: async (sid, text) => { if (b.stopped) return; b.sent.push({ sid, text }); const s = b.sessions.get(sid); if (s && s.agent) setTimeout(() => s.agent(text), 5); },
  });
  b.queue.start();
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20, verbs: { pollMs: 15, settleMs: 800, turnGraceMs: 300, answerGraceMs: 200 } });
  b.queue.on('delivery', (d) => { if (['confirmed', 'unconfirmed', 'failed', 'cancelled'].includes(d.status)) b.branch.onDeliveryEnd(d); });
  // 가짜 에이전트: 글을 받으면 일하고(workMs) 쉰다. onText(text, s)는 일하는 중에 부른다(done을 치는 워커 등)
  const add = (name, { kind = 'claude', hooked = kind === 'claude', workMs = 80, onText = null, ...extra } = {}) => {
    const s = { sessionId: crypto.randomUUID(), name, cwd: dir, paneId: `${name}:p1`, agentName: name, permissionMode: 'manual', kind, origin: 'board', parentSessionId: null, workspaceKey: ws.key, rt: newRuntime({ kind, hooked }), createdAt: Date.now(), ...extra };
    idle(s);
    store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
    b.sessions.set(s.sessionId, s);
    s.texts = [];
    s.agent = (text) => {
      s.texts.push(text);
      if (hooked) { applyHook(s.rt, { hook_event_name: 'UserPromptSubmit', prompt: text }); b.queue.onUserPromptSubmit(s.sessionId, text); applyTermStatus(s.rt, 'working'); }
      else { applyTermStatus(s.rt, 'working'); b.queue.onAgentWorking(s.sessionId); }
      b.broadcastSession(s);
      const h = s.onText || onText;
      setTimeout(async () => {
        if (b.stopped) return;
        if (h) try { await h(text, s); } catch (e) { s.err = e; }
        if (b.stopped) return;
        if (hooked) applyHook(s.rt, { hook_event_name: 'Stop', last_assistant_message: `답: ${text.slice(-20)}` });
        applyTermStatus(s.rt, 'idle');
        b.broadcastSession(s);
      }, workMs);
    };
    b.broadcastSession(s);
    return s;
  };
  const busy = (s) => { applyHook(s.rt, { hook_event_name: 'UserPromptSubmit', prompt: '사람의 일' }); applyTermStatus(s.rt, 'working'); b.broadcastSession(s); };
  const rest = (s) => { applyHook(s.rt, { hook_event_name: 'Stop', last_assistant_message: '끝' }); applyTermStatus(s.rt, 'idle'); b.broadcastSession(s); };
  return { b, dir, ws, add, busy, rest, stop: async () => { b.stopped = true; b.queue.stop(); b.branch.notices.stop(); await tick(400); store.close(); } };
}
function idle(s) { s.rt.term.present = true; s.rt.phase = 'running'; applyTermStatus(s.rt, 'idle'); }
const U = (b) => b.branch.units;
const units = (b) => b.store.db.prepare('SELECT * FROM work_units').all();
const tries = (b) => b.store.db.prepare('SELECT * FROM unit_tries').all();
const toParent = (b, p) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ?').all(p.sessionId);
function serve(b) {
  const srv = http.createServer((req, res) => { if (!b.branch.handleHttp(req, res)) { res.writeHead(404); res.end(); } });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => { b.cfg.port = srv.address().port; r(srv); }));
}
function runCli(args, env) {
  return new Promise((resolve) => {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MTASK_|ATRIUM_|HERDR_|HC_)/.test(k)));
    execFile(process.execPath, [path.join(HERE, '..', 'bin', 'atrium-child.mjs'), ...args], { env: { ...clean, ...env }, timeout: 30000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}
const envOf = (b, s) => ({ ATRIUM_PORT: String(b.cfg.port), ATRIUM_SESSION_ID: s.sessionId, ATRIUM_SESSION_TOKEN: b.branch.token(s.sessionId), ATRIUM_TERMINAL_SESSION: b.cfg.terminalSession });


// ---------- 거르는 함수 ----------
test('P380 위험 낱말: 홀로 선 소문자 낱말만 OpenCode로. 경로·파일 이름·URL·코드 칸·플래그 값·식별자·대문자는 그대로, omo 종류만', () => {
  for (const [a, want] of [[`run ${W} now`, `run ${RISKY_SHOWN} now`], [`(${W}, pi)`, `(${RISKY_SHOWN}, pi)`], [`use ${W}.`, `use ${RISKY_SHOWN}.`], [`pi·${W}`, `pi·${RISKY_SHOWN}`], [W, RISKY_SHOWN], [`${W}: 줄`, `${RISKY_SHOWN}: 줄`]]) assert.equal(dropRiskyWords(a), want, a);
  // 그대로 둘 것(에이전트가 그대로 써야 하는 글): 경로·파일 이름·URL·코드 칸·플래그 값·식별자·따옴표 안
  for (const keep of [`a/b/${W}.json`, `C:\\x\\${W}\\y`, `~/.config/${W}/${W}.jsonc`, `${W}.json`, `https://github.com/x/${W}`, '`' + W + '`', '`atrium child w --kind ' + W + '`', `--kind ${W}`, `--kind=${W}`, `-m ${W}`, `${W}-foo`, `foo_${W}`, `my${W}`, `@${W}1`, `${W}1`, `'${W}'`, `"${W}"`, `${W}://x`]) assert.equal(dropRiskyWords(keep), keep, keep);
  // 한 글 안에 섞이면 홀로 선 것만
  assert.equal(dropRiskyWords(`${W} 설정은 ~/.config/${W}/${W}.json에 있다. 띄우기: atrium child w --kind ${W}`), `${RISKY_SHOWN} 설정은 ~/.config/${W}/${W}.json에 있다. 띄우기: atrium child w --kind ${W}`);
  assert.equal(hasStandaloneRiskyWord(`--kind ${W}`), false); assert.equal(hasStandaloneRiskyWord(`run ${W}`), true);
  assert.equal(dropRiskyWords('OPENCODE_CONFIG_CONTENT'), 'OPENCODE_CONFIG_CONTENT', '대문자 env 이름은 그대로');
  assert.equal(dropRiskyWords('OpenCode'), 'OpenCode');
  assert.equal(dropRiskyWords('그냥 글'), '그냥 글');
  assert.equal(dropRiskyWords(null), null); assert.equal(dropRiskyWords(3), 3);
  assert.equal(hasRiskyWord(`x${W}y`), true); assert.equal(hasRiskyWord(dropRiskyWords(`x ${W} y`)), false);
  assert.equal(riskyKind('omo'), true); assert.equal(riskyKind('OMO'), true);
  for (const k of ['claude', 'codex', W, 'pi', 'hermes', 'omh', '', null]) assert.equal(riskyKind(k), false, String(k));
  assert.equal(safeFor('omo', W), RISKY_SHOWN); assert.equal(safeFor('claude', W), W, '다른 종류는 그대로');
  assert.deepEqual(callerKind({ kind: 'omo' }), { kind: 'omo' }); assert.deepEqual(callerKind({ kind: 'claude', flavor: 'deepseek' }), { kind: 'claude', flavor: 'deepseek' }); assert.equal(callerKind(null), null);
});

test('P380 omo가 받는 안내문: 판·하네스·자체 오케스트레이션 안내문에 낱말이 없고, 있으면 어댑터가 바꾼 파일을 따로 쓴다', () => {
  assert.equal(hasRiskyWord(HARNESS_PROMPT), false, '하네스 안내문');
  for (const scope of [null, 'sub', 'free']) { let lines; try { lines = orchPromptLines(scope); } catch { lines = null; } if (lines) assert.equal(hasRiskyWord([].concat(lines).join('\n')), false, `오케스트레이션 안내문 ${scope}`); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p380h-'));
  const plain = harnessLaunch({ kind: 'omo', sessionId: 's1', instructions: { file: path.join(dir, 'p.md'), text: '보드 안내' }, filesDir: dir });
  assert.equal(plain.args[plain.args.indexOf('--append-system-prompt') + 1], path.join(dir, 'p.md'), '낱말이 없으면 공용 파일 그대로');
  assert.equal(plain.files.length, 0);
  const risky = harnessLaunch({ kind: 'omo', sessionId: 's2', instructions: { file: path.join(dir, 'p.md'), text: `안내 ${W} 줄` }, filesDir: dir });
  const f = risky.args[risky.args.indexOf('--append-system-prompt') + 1];
  assert.notEqual(f, path.join(dir, 'p.md')); assert.ok(f.includes('s2'));
  assert.equal(risky.files.length, 1); assert.equal(risky.files[0].file, f); assert.equal(risky.files[0].text, `안내 ${RISKY_SHOWN} 줄`);
  // pi(같은 꼴의 다른 종류)는 그대로
  const pi = harnessLaunch({ kind: 'pi', sessionId: 's3', instructions: { file: path.join(dir, 'p.md'), text: `안내 ${W} 줄` }, filesDir: dir });
  assert.equal(pi.args[pi.args.indexOf('--append-system-prompt') + 1], path.join(dir, 'p.md'));
});

test('P380 omo로 가는 글: 판 알림·에이전트 글은 낱말을 바꿔 넣고(기록도), 사람이 친 글과 다른 종류의 세션은 그대로', async () => {
  const { b, add, stop } = await board();
  try {
    const om = add('om1', { kind: 'omo', hooked: false });
    const cc = add('cc1');
    const lead = add('lead');
    b.queue.enqueue(om.sessionId, `[Atrium 보드] 알림: ${W} 워커를 띄웠다. 설정 ~/.config/${W}/${W}.json, 다시 띄우기 --kind ${W}`); // 판 알림(origin board)
    await until(() => om.texts.length === 1);
    assert.equal(om.texts[0], `[Atrium 보드] 알림: ${RISKY_SHOWN} 워커를 띄웠다. 설정 ~/.config/${W}/${W}.json, 다시 띄우기 --kind ${W}`, '홀로 선 낱말만, 경로·플래그 값은 그대로');
    await until(() => deriveState(om.rt).state === 'ready');
    await b.branch.verbs.prompt(lead, { name: 'om1', text: `${W} 설정을 봐라` }); // 에이전트 글
    await until(() => om.texts.length === 2);
    assert.equal(om.texts[1], `${RISKY_SHOWN} 설정을 봐라`);
    const rows = b.store.db.prepare('SELECT text FROM deliveries WHERE session_id = ?').all(om.sessionId);
    assert.ok(rows.every((r) => !hasStandaloneRiskyWord(r.text)), '판 기록에도 바꾼 글');
    await until(() => deriveState(om.rt).state === 'ready');
    b.queue.enqueue(om.sessionId, `사람이 친 ${W}`, { origin: { kind: 'human' } });
    await until(() => om.texts.length === 3);
    assert.equal(om.texts[2], `사람이 친 ${W}`, '사람이 친 글은 그대로');
    b.queue.enqueue(cc.sessionId, `[Atrium 보드] 알림: ${W} 워커`);
    await until(() => cc.texts.length === 1);
    assert.equal(cc.texts[0], `[Atrium 보드] 알림: ${W} 워커`, 'Claude Code 세션은 그대로');
  } finally { await stop(); }
});

test('P380 omo가 친 atrium 명령 출력: 응답의 caller로 알고 사람 글·오류에서 홀로 선 낱말만 뺀다. 이름·--json은 그대로, 다른 종류도 그대로', async () => {
  const { b, add, stop } = await board();
  const srv = await serve(b);
  try {
    const om = add('om1', { kind: 'omo', hooked: false });
    const cc = add('cc1');
    add(`${W}1`, { kind: W, hooked: false }); // 이름(식별자)과 종류에 그 낱말
    const r1 = await runCli(['read', `${W}1`], envOf(b, om));
    assert.equal(r1.code, 0, r1.stderr);
    assert.ok(r1.stdout.includes(`@${W}1 (${RISKY_SHOWN}, `), r1.stdout); // 이름은 그대로, 종류 글은 바꿈
    assert.equal(hasStandaloneRiskyWord(r1.stdout), false, r1.stdout);
    const j = await runCli(['read', `${W}1`, '--json'], envOf(b, om));
    assert.equal(JSON.parse(j.stdout).kind, W, '--json은 그대로(읽는 쪽이 대소문자를 가린다)');
    const r2 = await runCli(['me'], envOf(b, om));
    assert.equal(r2.code, 0, r2.stderr); assert.equal(hasStandaloneRiskyWord(r2.stdout), false, r2.stdout);
    const r4 = await runCli(['read', `${W}9`], envOf(b, om)); // 없는 이름 → 오류 글(stderr)
    assert.notEqual(r4.code, 0); assert.equal(hasStandaloneRiskyWord(r4.stderr + r4.stdout), false, r4.stderr);
    const r5 = await runCli(['read', `${W}1`], envOf(b, cc));
    assert.equal(r5.code, 0, r5.stderr); assert.ok(r5.stdout.includes(`(${W}, `), 'Claude Code 세션의 출력은 그대로');
  } finally { srv.close(); await stop(); }
});

test('P380 child --kind는 대소문자를 가리지 않는다(OmO가 본 표기 그대로 쳐도 된다)', async () => {
  const { b, add, stop } = await board();
  try {
    const lead = add('lead');
    const r = await b.branch.spawnChild(lead, { name: 'k1', kind: 'Claude', wait: false }).catch((e) => e);
    assert.ok(!(r instanceof Error) || r.code !== 'bad_request' || !/종류/.test(r.message), String(r && r.message));
    const r2 = await b.branch.spawnChild(lead, { name: 'k2', kind: 'SHELL' }).catch((e) => e);
    assert.ok(r2 instanceof Error && /셸/.test(r2.message), '대문자 SHELL도 셸로 읽어 거절');
  } finally { await stop(); }
});

// ---------- --raw ----------
test('P380 prompt --raw: 하위에게 새 일이어도 머리 없이 글이 맨 앞, 일 연결(일·시도·item)은 그대로, 머리는 판 연결 기록에만', async () => {
  const { b, add, stop } = await board();
  try {
    const lead = add('lead');
    const w1 = add('w1', { parentSessionId: lead.sessionId, workMs: 60 });
    const r = await b.branch.verbs.prompt(lead, { name: 'w1', text: '/ulw-execute m1-diode --light', raw: true });
    assert.equal(r.unit.kind, 'new');
    await until(() => w1.texts.length === 1);
    assert.equal(w1.texts[0], '/ulw-execute m1-diode --light', '머리 없이 그대로');
    const u = units(b); assert.equal(u.length, 1); assert.equal(u[0].origin, 'raw'); assert.equal(u[0].to_session, w1.sessionId);
    assert.equal(tries(b).length, 1);
    assert.equal(b.branch.units.item(w1).item.id, u[0].id, 'atrium item이 그 일을 본다');
    const ev = b.store.db.prepare("SELECT * FROM link_events WHERE kind = 'prompt'").all().map((e) => ({ ...e, data: e.data ? JSON.parse(e.data) : null }));
    const rec = ev.find((e) => e.data && e.data.raw);
    assert.ok(rec, '연결 기록에 raw'); assert.match(rec.data.header, /^\[Atrium 보드\] 관계: 너는 @lead의 하위 워커다/, '넣지 않은 머리는 판 기록에');
    // done으로 닫으면 위에 한 번(일 연결 유지)
    await until(() => deriveState(w1.rt).state === 'ready');
    const d = b.branch.units.done(w1, { result: 'ok', text: '실행 끝' });
    assert.equal(d.parent, 'lead');
    // 같은 하위에게 --raw 없이 새 일이면 머리가 붙는다(옛 그대로)
    await b.branch.verbs.prompt(lead, { name: 'w1', text: '보통 일' });
    await until(() => w1.texts.length === 2);
    assert.match(w1.texts[1], /^\[Atrium 보드\] 관계:/);
  } finally { await stop(); }
});

test('P380 prompt --raw: 판의 손이 앞에 붙이는 글(attachFront: 사람의 답·판 명령 알림)도 붙이지 않는다. --raw 없으면 붙는다', async () => {
  const { b, add, stop } = await board();
  try {
    const lead = add('lead');
    const x = add('x', { workMs: 40 });
    b.queue.attachFront = () => '[Atrium 보드] 앞에 붙는 답';
    await b.branch.verbs.prompt(lead, { name: 'x', text: '/handoff', raw: true });
    await until(() => x.texts.length === 1);
    assert.equal(x.texts[0], '/handoff');
    await until(() => deriveState(x.rt).state === 'ready');
    await b.branch.verbs.prompt(lead, { name: 'x', text: '보통 글' });
    await until(() => x.texts.length === 2);
    assert.equal(x.texts[1], '[Atrium 보드] 앞에 붙는 답\n\n보통 글');
  } finally { await stop(); }
});

test('P380 prompt --raw: 붙잡아 둔 일(받는 세션에 다른 위 세션의 열린 시도)도 나중에 머리 없이 들어간다', async () => {
  const { b, add, stop } = await board();
  try {
    const x = add('x'); const lead = add('lead');
    const w1 = add('w1', { parentSessionId: x.sessionId, workMs: 60 });
    await b.branch.verbs.prompt(x, { name: 'w1', text: 'x의 일' });
    await until(() => w1.texts.length === 1);
    b.store.setRelation(lead.sessionId, w1.sessionId, 'sub', 'user'); b.branch._relRows = null; // 사람이 w1을 lead 아래로 옮겼다(p180과 같은 틀)
    const r = await b.branch.verbs.prompt(lead, { name: 'w1', text: '/ulw-plan', raw: true });
    assert.equal(r.unit.held, true, '앞 시도가 끝날 때까지 판이 붙잡는다');
    await until(() => w1.texts.length === 2, 3000);
    assert.equal(w1.texts[1], '/ulw-plan', '붙잡아 둔 --raw 일도 머리 없이');
    assert.equal(units(b).find((u) => u.spec === '/ulw-plan').origin, 'raw');
  } finally { await stop(); }
});

test('P380 CLI: atrium prompt --raw가 raw를 넘기고, 계약 13·help에 --raw와 슬래시 명령 까닭', async () => {
  assert.equal(CONTRACT_VERSION, 13);
  assert.equal(contractJson().contract, 13);
  const p = VERBS.find((v) => v.name === 'prompt');
  assert.ok(p.args.includes('[--raw]')); assert.match(p.does, /슬래시 명령/); assert.match(p.does, /맨 앞/); assert.match(p.does, /atrium item으로 안다/);
  assert.match(shortHelp(), /--raw/);
  assert.equal(hasRiskyWord(shortHelp()) || hasRiskyWord(JSON.stringify(contractJson())), false, 'help·계약에 낱말 없음');
  const skill = boardSkill();
  assert.match(skill, /--raw/); assert.match(skill, /atrium item`으로 안다/); assert.match(skill, /OmO 계획 검토자/); assert.match(skill, /\.omo\/plans\/\*\.md/); assert.match(skill, /셸 스크립트로 만든 계획 파일은 도구 기록에 잡히지 않는다/);
  const { b, add, stop } = await board();
  const srv = await serve(b);
  try {
    const lead = add('lead');
    const w1 = add('w1', { parentSessionId: lead.sessionId, workMs: 40 });
    const r = await runCli(['prompt', 'w1', '/ulw-execute plan-a', '--raw'], envOf(b, lead));
    assert.equal(r.code, 0, r.stderr);
    await until(() => w1.texts.length === 1);
    assert.equal(w1.texts[0], '/ulw-execute plan-a');
    assert.match(r.stdout, /일 u[0-9a-f]+로 맡겼다/);
  } finally { srv.close(); await stop(); }
});
