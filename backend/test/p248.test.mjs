// P248 시험: 세션에 보내는 글의 대기열과 스티어링(사용자 결정 2026-11-19). 사람(session.send)은 기본 대기열, steer를 고르면
// 일하는 Claude Code 입력 칸에(대기 메시지), 쉬면 보통 보내기, 스티어링 못 하는 세션은 대기열과 까닭. 에이전트는 atrium prompt 기본 대기열, --steer(= --now).
// done 보고와 판 알림은 늘 대기열. 안내 글에 한 줄. 진짜 저장소·전달 대기열·Branch, 가짜 에이전트(p181 시험의 틀)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch, boardSkill } from '../src/branch.mjs';
import { Backend } from '../src/backend.mjs';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { BOARD_SYSTEM_PROMPT } from '../src/launch.mjs';
import { HARNESS_PROMPT } from '../src/harness.mjs';
import { VERBS, shortHelp } from '../src/cli-contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p248-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp(), batchMs = 40 } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p248test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const b = {
    cfg, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), sent: [], spawned: [], boxes: new Map(), rig: null, features: null, touch: () => {},
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
    // backend.pushTree와 같은 꼴(P92·P159): 나무의 부모는 일 부모
    pushTree() { const idx = b.branch.relIndex(); return [...b.sessions.values()].map((s) => ({ sessionId: s.sessionId, parentSessionId: idx.workParentOf(s.sessionId), kind: s.kind || 'claude', state: deriveState(s.rt).state, delivering: b.queue.pending(s.sessionId), loops: 0, bg: null })); },
    closeSession(s, reason) { b.sessions.delete(s.sessionId); store.updateSession(s.sessionId, { closedAt: Date.now() }); b.bus.emit('closed', s, reason); },
  };
  b.queue = new DeliveryQueue({
    store, cfg,
    view: (sid) => { const s = b.sessions.get(sid); if (!s) return { closed: true }; return { state: deriveState(s.rt).state, agentPresent: s.rt.term.present, termConnected: true, lastUserInputAt: 0, closed: false, kind: s.kind, hooked: b.hooked(s) }; },
    inspect: async (sid) => ({ box: b.boxes.get(sid) || 'empty', seen: false }), // P90·P143: 입력 칸 읽기(스티어링 길)
    send: async (sid, text) => { if (b.stopped) return; b.sent.push({ sid, text }); const s = b.sessions.get(sid); if (s && s.agent) setTimeout(() => s.agent(text), 5); },
  });
  b.queue.start();
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: batchMs, verbs: { pollMs: 15, settleMs: 800, turnGraceMs: 300, answerGraceMs: 200 } });
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
      const wasBusy = deriveState(s.rt).state === 'working'; // P248: 일하는 중에 받은 글(Claude Code 대기 메시지)은 확인(hook)만 오고 턴은 그대로다(p143의 가짜 에이전트)
      if (hooked) { applyHook(s.rt, { hook_event_name: 'UserPromptSubmit', prompt: text }); b.queue.onUserPromptSubmit(s.sessionId, text); applyTermStatus(s.rt, 'working'); }
      else { applyTermStatus(s.rt, 'working'); b.queue.onAgentWorking(s.sessionId); }
      b.broadcastSession(s);
      if (wasBusy) return;
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
  return { b, dir, ws, add, busy, rest, stop: async () => { b.stopped = true; b.queue.stop(); b.branch.notices.stop(); b.branch.units.stops.stop(); await tick(400); store.close(); } };
}
function idle(s) { s.rt.term.present = true; s.rt.phase = 'running'; applyTermStatus(s.rt, 'idle'); }
const U = (b) => b.branch.units;
const units = (b) => b.store.db.prepare('SELECT * FROM work_units').all();
const tries = (b) => b.store.db.prepare('SELECT * FROM unit_tries').all();
const toParent = (b, p) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ? ORDER BY created_at').all(p.sessionId);
const stopNotices = (b, p) => toParent(b, p).filter((d) => d.text.startsWith('[Atrium 보드] 맡긴 일이 멈췄다'));
const doneNotices = (b, p) => toParent(b, p).filter((d) => /^\[Atrium 보드\] @\S+가 일 u/.test(d.text));
const working = (s) => deriveState(s.rt).state === 'working';
const ready = (s) => deriveState(s.rt).state === 'ready';

const humanSend = (b, p) => Backend.prototype.send.call(b, p); // 사람의 보내기 칸·휴대폰 입력 줄(session.send)
const row = (b, id) => b.store.getDelivery(id) || {};
function serve(b) {
  const srv = http.createServer((req, res) => { if (!b.branch.handleHttp(req, res)) { res.writeHead(404); res.end(); } });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => { b.cfg.port = srv.address().port; r(srv); }));
}
function runCli(args, env) {
  return new Promise((resolve) => {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MTASK_|ATRIUM_|HERDR_)/.test(k)));
    execFile(process.execPath, [path.join(HERE, '..', 'bin', 'atrium-child.mjs'), ...args], { env: { ...clean, ...env }, timeout: 30000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}
// 판(enqueue)이 받은 넣기 선택을 모은다
function spyQueue(b) { const seen = []; const orig = b.queue.enqueue.bind(b.queue); b.queue.enqueue = (sid, text, opts = {}) => { seen.push({ sid, text, opts }); return orig(sid, text, opts); }; return seen; }

// ---------- 사람(session.send) ----------
test('P248 사람: 기본은 대기열(일하는 Claude Code에도 턴이 끝날 때까지 기다린다)', async () => {
  const { b, add, busy, rest, stop } = await board();
  try {
    const lead = add('lead'); busy(lead);
    const r = await humanSend(b, { target: ['lead'], text: '끝나면 이것도' });
    const d = r.deliveries[0];
    assert.equal(d.steer, undefined, '고르지 않으면 steer 칸이 없다');
    await tick(120);
    assert.equal(row(b, d.deliveryId).status, 'queued'); assert.equal(row(b, d.deliveryId).reason, 'working');
    assert.equal(b.sent.length, 0);
    rest(lead);
    await until(() => row(b, d.deliveryId).status === 'confirmed');
    assert.notEqual(row(b, d.deliveryId).reason, 'typed', '턴이 끝난 뒤 보통 보내기');
  } finally { await stop(); }
});

test('P248 사람: 스티어링을 고르면 일하는 Claude Code의 입력 칸에 넣는다(Claude Code 대기 메시지, typed). 쓰다 만 글이 있으면 비키는 길(aside)로', async () => {
  const { b, add, busy, stop } = await board();
  try {
    const seen = spyQueue(b);
    const lead = add('lead'); busy(lead);
    const r = await humanSend(b, { target: ['lead'], text: '방향 정정: B 말고 A', steer: true });
    const d = r.deliveries[0];
    assert.deepEqual(d.steer, { ok: true });
    assert.deepEqual(seen[0].opts.typeNow, true); assert.equal(seen[0].opts.aside, true, '--steer와 같은 길(쓰다 만 글은 비킨다)');
    await until(() => row(b, d.deliveryId).status === 'confirmed');
    assert.equal(row(b, d.deliveryId).reason, 'typed');
    assert.deepEqual(b.sent.map((x) => x.text), ['방향 정정: B 말고 A']);
    assert.equal(deriveState(lead.rt).state, 'working', '턴은 그대로 돈다');
  } finally { await stop(); }
});

test('P248 사람: 쉬는 세션에 스티어링을 고르면 보통 보내기와 같다(곧바로)', async () => {
  const { b, add, stop } = await board();
  try {
    add('lead');
    const r = await humanSend(b, { target: ['lead'], text: '쉬는 중', steer: true });
    const d = r.deliveries[0];
    assert.deepEqual(d.steer, { ok: true });
    await until(() => row(b, d.deliveryId).status === 'confirmed');
    assert.notEqual(row(b, d.deliveryId).reason, 'typed');
    assert.deepEqual(b.sent.map((x) => x.text), ['쉬는 중']);
  } finally { await stop(); }
});

test('P248 사람: 스티어링할 수 없는 세션(다른 종류·hook 없음)은 대기열로 보내고 까닭을 돌려준다', async () => {
  const { b, add, stop } = await board();
  try {
    const seen = spyQueue(b);
    const cx = add('cx', { kind: 'opencode' }); const nh = add('nh', { hooked: false }); // P271: Codex는 스티어링을 받는다(p271.test)
    applyTermStatus(cx.rt, 'working'); applyTermStatus(nh.rt, 'working');
    const r = await humanSend(b, { target: ['cx', 'nh'], text: '정정', steer: true });
    const by = Object.fromEntries(r.deliveries.map((d) => [d.name, d]));
    assert.deepEqual(by.cx.steer, { ok: false, why: 'kind' }); assert.deepEqual(by.nh.steer, { ok: false, why: 'no_hook' });
    assert.ok(seen.every((x) => !x.opts.typeNow && !x.opts.aside), '대기열 길');
    await tick(120);
    for (const d of r.deliveries) { assert.equal(row(b, d.deliveryId).status, 'queued'); assert.equal(row(b, d.deliveryId).reason, 'working'); }
    assert.equal(b.sent.length, 0);
  } finally { await stop(); }
});

test('P248 사람: 옛 휴대폰(whileWorking type)은 그대로 받는다(비키지 않는 바로 넣기)', async () => {
  const { b, add, busy, stop } = await board();
  try {
    const seen = spyQueue(b);
    const lead = add('lead'); busy(lead);
    const r = await humanSend(b, { target: ['lead'], text: '옛 휴대폰', whileWorking: 'type' });
    assert.equal(r.deliveries[0].steer, undefined);
    assert.equal(seen[0].opts.typeNow, true); assert.equal(seen[0].opts.aside, undefined);
  } finally { await stop(); }
});

// ---------- 에이전트(atrium prompt) ----------
test('P248 에이전트: 기본은 대기열, --steer는 --now와 같은 길(일하는 Claude Code의 지금 턴에)', async () => {
  const { b, add, busy, stop } = await board();
  const srv = await serve(b);
  try {
    const lead = add('lead'); const peer = add('peer');
    busy(lead);
    const q = await b.branch.verbs.prompt(peer, { name: 'lead', text: '끝난 뒤에 볼 것' });
    assert.equal(q.delivery.status, 'queued'); assert.equal(q.delivery.reason, 'working');
    const s = await b.branch.verbs.prompt(peer, { name: 'lead', text: '지금 방향 정정', steer: true });
    assert.equal(s.delivery.how, 'typed'); assert.equal(s.delivery.reason, 'typed');
    await assert.rejects(b.branch.verbs.prompt(peer, { name: 'lead', text: 'x', steer: true, wait: true }), (e) => e.code === 'bad_request' && /--steer·--now와 --wait/.test(e.message));
    const env = b.branch.envFor(peer.sessionId);
    const both = await runCli(['prompt', 'lead', 'x', '--steer', '--wait'], env);
    assert.equal(both.code, 2); assert.match(both.stderr, /--steer·--now와 --wait는 함께 쓸 수 없다/);
    const pt = await runCli(['prompt', 'lead', '하나', '더', '--steer'], env);
    assert.equal(pt.code, 0, pt.stderr);
    assert.match(pt.stdout, /@lead는 일하는 중이라 Claude Code의 대기 메시지로 바로 넣었다/);
    assert.match(pt.stdout, /--steer로 보냈으니 기다리지 않는다/);
    const pj = JSON.parse((await runCli(['prompt', 'lead', '셋', '--steer', '--json'], env)).stdout);
    assert.equal(pj.delivery.how, 'typed');
    assert.deepEqual(b.sent.map((x) => x.text), ['지금 방향 정정', '하나 더', '셋'], '대기열 글은 아직 기다린다');
    const ev = b.store.db.prepare("SELECT * FROM link_events WHERE kind = 'prompt' ORDER BY id").all();
    assert.equal(JSON.parse(ev[1].data).now, true, '기록은 --now와 같다');
  } finally { srv.close(); await stop(); }
});

test('P248 done 보고와 판 알림은 늘 대기열: 일하는 상위에게 하위의 done 보고는 턴이 끝난 뒤', async () => {
  const { b, add, busy, rest, stop } = await board();
  try {
    const seen = spyQueue(b);
    const lead = add('lead');
    const w1 = add('w1', { parentSessionId: lead.sessionId, workMs: 30 });
    const r = await b.branch.verbs.prompt(lead, { name: 'w1', text: '로그를 정리해라' });
    assert.equal(r.unit.kind, 'new');
    await until(() => ready(w1) && b.sent.length >= 1);
    busy(lead);
    U(b).done(w1, { result: 'ok', text: '정리했다' });
    await until(() => doneNotices(b, lead).length === 1);
    const n = doneNotices(b, lead)[0];
    await tick(120);
    assert.equal(row(b, n.delivery_id).status, 'queued'); assert.equal(row(b, n.delivery_id).reason, 'working');
    const toLead = seen.filter((x) => x.sid === lead.sessionId);
    assert.ok(toLead.length >= 1 && toLead.every((x) => !x.opts.typeNow && !x.opts.aside), 'done 보고·판 알림은 스티어링하지 않는다');
    rest(lead);
    await until(() => row(b, n.delivery_id).status === 'confirmed');
  } finally { await stop(); }
});

// ---------- 안내 글 ----------
test('P248 안내 글: 판 시스템 글·atrium help·atrium 스킬에 대기열·스티어링 한 줄, 계약에 --steer', () => {
  const line = /지금 하는 일이 끝난 뒤 들어가면 될 글은 그냥 보낸다\(대기열\)\. 받는 쪽이 지금 하고 있는 일의 방향에 대한 추가 정보·정정이면 `?--steer`?\(스티어링/;
  assert.match(BOARD_SYSTEM_PROMPT, line);
  assert.match(boardSkill(), line); assert.match(boardSkill('delegate'), line);
  assert.match(shortHelp(), /--steer\(스티어링, 옛 이름 --now\)/);
  assert.match(shortHelp(), /done 보고와 판 알림은 늘 대기열/);
  assert.ok(VERBS.find((v) => v.name === 'prompt').args.includes('[--wait | --steer]'));
  const long = fs.readFileSync(path.join(HERE, '..', 'bin', 'atrium-child.mjs'), 'utf8').match(/const HELP = `([\s\S]*?)`;/)[1];
  assert.match(long, /\[--wait \| --steer\]/); assert.match(long, /--steer\(스티어링, 옛 이름 --now\)는 받는 쪽이 지금 하고 있는 일의 방향/);
  assert.match(long, /done 보고와 판 알림은 늘 대기열/);
});
