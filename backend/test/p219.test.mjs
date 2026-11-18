// P219 단위 시험: rig 2의 R1 문서(docs research rig2-design.md 2·3·5절, 11.4의 1번).
// v2 정의 해석과 v1 그대로, rig check의 문서 검사, 문서 바뀜 감지와 바꾼 쪽 고르기(자리·rig 밖 세션·훅·사람·모름), 쥔 쪽이 아닌 쓰기 경고,
// stale 계산, 머리의 문서 목록(일 머리 꼬리, atrium item, doc_load), writes → 증폭 쓰기 범위, 장부 kind, rig.map의 문서 마디·변. 가짜 판은 p217 틀
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
import { Branch } from '../src/branch.mjs';
import { Rig, validateRig } from '../src/rig.mjs';
import { seatAmpOf, writesVerdict, claudeSettingsAmp } from '../src/rig-amp.mjs';
import { RIG_EVENT_KINDS, rigEvent } from '../src/rig-ledger.mjs';
import { RigMap, defGraph, MAP_NODE_TYPES, MAP_EDGE_TYPES, E, docId } from '../src/rig-map.mjs';
import { seatHeader } from '../src/rig-flow.mjs';
import { RigDocs, validateDocs, pickChanger, staleOf, statDoc, seatDocsOf, docsTail, docLines, holdersOf, writesPaths } from '../src/rig-docs.mjs';
import { RigAdmin } from '../src/rig-admin.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(HERE, 'fixtures', 'rig-docs-sample');
const V1 = path.join(HERE, 'fixtures', 'rig-flow-sample');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p219-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const sampleDef = () => JSON.parse(fs.readFileSync(path.join(SAMPLE, '.atrium', 'rig.json'), 'utf8'));
const exists = (f) => { try { fs.statSync(f); return true; } catch { return false; } };
function writeRig(root, def) {
  fs.cpSync(SAMPLE, root, { recursive: true });
  const f = path.join(root, '.atrium', 'rig.json');
  fs.writeFileSync(f, JSON.stringify(def, null, 2));
  const t = new Date(Date.now() + Math.floor(Math.random() * 100000)); fs.utimesSync(f, t, t);
}
const ledger = (b, key, q = {}) => b.store.rigEvents({ ws: key, limit: 10000, ...q });
const bump = (f, text, ms = Date.now()) => { fs.appendFileSync(f, text); const t = new Date(ms); fs.utimesSync(f, t, t); };

// ---------- 가짜 판(p182 틀) + 자리 ----------
async function board({ dir = tmp(), def = sampleDef(), enable = true, batchMs = 40 } = {}) {
  if (def) writeRig(dir, def);
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p219test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const b = {
    cfg, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), sent: [], spawned: [],
    api: { broadcast: (n, d) => { (b.casts || (b.casts = [])).push({ n, d }); } }, log: () => {}, requireTerminal: () => {},
    adapter: { backend: 'hc', connected: true, readScreen: async () => '' },
    hooked: (s) => s.rt.hooked !== false,
    summary: (s) => { const d = deriveState(s.rt); return { sessionId: s.sessionId, name: s.name, state: d.state, ask: d.ask || null, error: d.error || null, rigSeat: s.rigSeat || null }; },
    ensureLink(from, to, patch = {}) {
      let l = store.linkByPair(from, to);
      if (!l) { l = { linkId: 'l' + crypto.randomBytes(4).toString('hex'), from, to, role: patch.role ?? null, spawned: !!patch.spawned, observed: !!patch.observed, createdAt: Date.now() }; store.insertLink(l); }
      return store.getLink(l.linkId);
    },
    linkEvent(l, kind, text = null, data = null) { return store.addLinkEvent(l.linkId, kind, text, data); },
    broadcastSession(s) { if (b.sessions.has(s.sessionId)) b.bus.emit('session', s, b.summary(s)); },
    async spawn(p) {
      const kind = p.kind || (p.launcherDef && p.launcherDef.harness) || 'claude';
      const s = add(p.name, { parentSessionId: p.parentSessionId || null, kind, cwd: p.cwd, onText: b.onSpawnText || null });
      if (p.branch) b.branch.noteChild(s.sessionId, p.branch);
      b.spawned.push(p);
      return { sessionId: s.sessionId, trust: { needsTrust: false } };
    },
    pushTree() { const idx = b.branch.relIndex(); return [...b.sessions.values()].map((s) => ({ sessionId: s.sessionId, parentSessionId: idx.workParentOf(s.sessionId), kind: s.kind || 'claude', state: deriveState(s.rt).state, delivering: b.queue.pending(s.sessionId), loops: 0, bg: null })); },
    closeSession(s, reason) { b.sessions.delete(s.sessionId); store.updateSession(s.sessionId, { closedAt: Date.now() }); b.bus.emit('closed', s, reason); },
    resolve: (r) => { for (const s of b.sessions.values()) if (s.name === r || s.sessionId === r) return s; throw Object.assign(new Error('no ' + r), { code: 'not_found' }); },
    resolveWorkspace: async (k) => { const w = store.getWorkspace(k || ws.key); if (!w) throw Object.assign(new Error('no ws'), { code: 'not_found' }); return w; },
    touch: () => {}, features: null,
  };
  b.rig = new Rig(b);
  b.rigDocs = new RigDocs(b, { pollMs: 50 }); // P219: 시험은 scan()을 손으로 부른다
  b.queue = new DeliveryQueue({
    store, cfg,
    view: (sid) => { const s = b.sessions.get(sid); if (!s) return { closed: true }; return { state: deriveState(s.rt).state, agentPresent: s.rt.term.present, termConnected: true, lastUserInputAt: 0, closed: false, kind: s.kind, hooked: b.hooked(s) }; },
    send: async (sid, text) => { if (b.stopped) return; b.sent.push({ sid, text }); const s = b.sessions.get(sid); if (s && s.agent) setTimeout(() => s.agent(text), 5); },
  });
  b.queue.start();
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: batchMs, verbs: { pollMs: 15, settleMs: 300, turnGraceMs: 300, answerGraceMs: 200 } });
  b.queue.on('delivery', (d) => { if (['confirmed', 'unconfirmed', 'failed', 'cancelled'].includes(d.status)) b.branch.onDeliveryEnd(d); });
  const add = (name, { kind = 'claude', hooked = kind === 'claude', workMs = 30, onText = null, ...extra } = {}) => {
    const s = { sessionId: crypto.randomUUID(), name, cwd: dir, paneId: `${name}:p1`, agentName: name, permissionMode: 'manual', kind, origin: 'board', parentSessionId: null, workspaceKey: ws.key, rt: newRuntime({ kind, hooked }), createdAt: Date.now(), ...extra };
    s.rt.term.present = true; s.rt.phase = 'running'; applyTermStatus(s.rt, 'idle');
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
  if (enable) store.setRigEnabled(ws.key, true);
  const F = () => b.branch.flow;
  const seat = (s, name) => F().setSeat(s, name);
  const by = (name) => [...b.sessions.values()].find((x) => x.name === name);
  return { b, dir, ws, add, F, seat, by, stop: async () => { b.stopped = true; b.queue.stop(); b.branch.notices.stop(); b.branch.units.stops.stop(); await tick(200); store.close(); } };
}


const U = (b) => b.branch.units;
const v2 = (raw, root = SAMPLE) => validateRig(raw, { root, exists });

// ---------- 정의 ----------
test('v2 정의: docs·loads·reads·writes·records를 읽고, load always는 모든 자리가 싣는다', () => {
  const r = v2(sampleDef());
  assert.ok(r.ok, r.reason);
  const d = r.def;
  assert.equal(d.version, 2);
  assert.deepEqual(Object.keys(d.docs), ['rules', 'facts', 'corrections']);
  assert.equal(d.docs.rules.rel, 'docs/rules.txt');
  assert.equal(d.docs.corrections.git, false);
  assert.deepEqual(d.docs.facts.stale, { afterChangeOf: 'rules' });
  assert.deepEqual(d.seatDocs.keeper, { loads: ['rules'], reads: ['facts'], writes: ['corrections'] });
  assert.deepEqual(d.hookDocs[0], { records: ['corrections'], reads: [] });
  assert.ok(d.warnings.some((w) => /owner\(retro\)는 R2/.test(w)), '받기만 하는 owner 경고');
  assert.deepEqual(holdersOf(d, 'corrections'), { seats: ['keeper'], hooks: [0], tools: [] });
  assert.deepEqual(holdersOf(d, 'rules'), { seats: [], hooks: [], tools: [] });
});

test('v1 정의는 그대로 돈다(문서 칸 없음, 경로 꼴 writes 그대로)', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(V1, '.atrium', 'rig.json'), 'utf8'));
  raw.seats.worker.writes = ['items/{item}/'];
  const r = validateRig(raw, { root: V1 });
  assert.ok(r.ok, r.reason);
  assert.equal(r.def.version, 1);
  assert.equal(r.def.docs, null);
  assert.deepEqual(r.def.seatDocs, {});
  assert.deepEqual(r.def.amp.seats.worker.writes, ['items/{item}/']);
  assert.equal(seatDocsOf(r.def, 'worker'), null);
  const g = defGraph(r.def);
  assert.equal(g.nodes.filter((n) => n.type === 'doc').length, 0);
  assert.ok(g.edges.some((e) => e.type === 'writes' && e.to === 'file:items/{item}/'));
});

test('rig check의 문서 검사: version, 없는 문서 이름, 저장소 밖, 역할과 맞지 않는 쓰기·기록', () => {
  const bad = (mut, re) => { const raw = sampleDef(); mut(raw); const r = v2(raw); assert.equal(r.ok, false, `통과하면 안 된다: ${re}`); assert.match(r.reason, re); };
  bad((x) => { delete x.version; }, /"version": 2/);
  bad((x) => { x.version = 3; }, /version은 1 또는 2/);
  bad((x) => { x.seats.keeper.loads = ['nope']; }, /loads에 docs에 없는 문서가 있다: nope/);
  bad((x) => { x.seats.keeper.reads = ['ghost']; }, /reads에 docs에 없는 문서/);
  bad((x) => { x.hooks[0].records = 'missing'; }, /records에 docs에 없는 문서/);
  bad((x) => { x.docs.rules.path = '../outside.md'; }, /저장소 밖/);
  bad((x) => { x.docs.rules.path = path.resolve(os.tmpdir(), 'x.md'); }, /저장소 밖/);
  bad((x) => { x.docs.rules.path = '~/rules.md'; }, /저장소 밖/);
  bad((x) => { x.hooks[0].records = 'rules'; }, /records는 장부 문서\(role "ledger"\)/);
  bad((x) => { x.docs.g = { path: '~/.claude/CLAUDE.md', role: 'canon', layer: 'global' }; x.seats.keeper.writes = ['g']; }, /global 층 문서라 쓰기 범위로 넘길 수 없다/);
  bad((x) => { x.docs.rules.role = 'rule'; }, /role은 canon, ledger, sector/);
  bad((x) => { x.docs.rules.intake = 'move'; }, /intake·keep은 role "sector"/);
  bad((x) => { x.docs.facts.stale = { after_change_of: 'zzz' }; }, /after_change_of가 없는 문서/);
  bad((x) => { x.docs.facts.stale = 'soon'; }, /stale은 "30d"/);
  bad((x) => { x.docs.rules.path = '{owns}'; }, /"\{owns\}"는 role "sector"/);
  bad((x) => { x.docs.rules.load = 'sometimes'; }, /load는 "always"/);
  bad((x) => { x.tools = { recur: { run: ['node', '.atrium/hooks/record.mjs'], records: 'facts' } }; }, /tools.recur.records는 장부 문서/);
  // 받기만 하는 칸: global 층 문서, sector의 intake·keep, {owns}
  const raw = sampleDef();
  raw.docs.g = { path: '~/.claude/CLAUDE.md', role: 'canon', layer: 'global' };
  raw.docs.out = { path: '{owns}', role: 'sector', intake: 'register' };
  raw.docs.reports = { path: 'reports/', role: 'sector', keep: 30 };
  raw.seats.keeper.loads = ['g'];
  raw.seats.keeper.writes = ['corrections', '{owns}', 'reports'];
  const r = v2(raw);
  assert.ok(r.ok, r.reason);
  assert.equal(r.def.docs.g.watch, false);
  assert.equal(r.def.docs.reports.dir, true);
  assert.equal(r.def.docs.reports.rel, 'reports/');
  assert.deepEqual(r.def.amp.seats.keeper.writes, ['ledger/corrections.jsonl', 'reports/']);
  assert.ok(r.def.warnings.some((w) => /layer global는 R7/.test(w)));
  assert.ok(r.def.warnings.some((w) => /\{owns\}"는 R5 전이라/.test(w)));
  // 정본을 자리가 바로 쓰면 경고(정의는 쓰인다)
  const raw2 = sampleDef(); raw2.seats.keeper.writes = ['corrections', 'rules'];
  const r2 = v2(raw2); assert.ok(r2.ok); assert.ok(r2.def.warnings.some((w) => /정본 문서 rules/.test(w)));
  // {owns}만 있으면 쓰기 범위를 좁히지 않는다
  const raw3 = sampleDef(); raw3.docs.out = { path: '{owns}', role: 'sector' }; raw3.seats.keeper.writes = ['{owns}'];
  const r3 = v2(raw3); assert.ok(r3.ok, r3.reason); assert.equal(r3.def.amp, null);
});

test('writes의 문서 → 증폭 쓰기 범위(경로): 정본은 막고 장부는 통과, Claude Code 설정은 PreToolUse를 기다린다', () => {
  const r = v2(sampleDef());
  const a = seatAmpOf(r.def, 'keeper');
  assert.deepEqual(a.writes, ['ledger/corrections.jsonl']);
  assert.deepEqual(writesPaths(['corrections', 'x/'], r.def.docs), ['ledger/corrections.jsonl', 'x/']);
  const base = SAMPLE;
  assert.equal(writesVerdict({ writes: a.writes, toolName: 'Edit', toolInput: { file_path: path.join(base, 'ledger', 'corrections.jsonl') }, base }), null);
  assert.match(writesVerdict({ writes: a.writes, toolName: 'Write', toolInput: { file_path: 'docs/rules.txt' }, base }), /쓰기 범위 밖이다: docs\/rules\.txt/);
  const s = claudeSettingsAmp({ ...a, protectedFiles: [], root: base, cwd: base });
  assert.ok(s.hooks.PreToolUse, '경로 목록이면 판이 PreToolUse를 답한다');
});

// ---------- 바꾼 쪽 고르기(순수) ----------
test('pickChanger: 도구 쓰기 신호 → 자리·rig 밖 세션·훅, 신호가 없으면 일하던 세션, 여럿이면 모름, 없으면 사람', () => {
  const abs = path.resolve('/w/docs/rules.txt');
  const sessions = [{ sessionId: 'a', name: 'keeper', seat: 'keeper', working: false }, { sessionId: 'b', name: 'helper', seat: null, working: false }];
  assert.deepEqual(pickChanger({ abs, mtimeMs: 1000, writes: [{ abs, sessionId: 'a', t: 1000 }], sessions }), { by: 'seat', basis: 'post_tool', seat: 'keeper', sessionId: 'a', name: 'keeper' });
  assert.equal(pickChanger({ abs, mtimeMs: 1000, writes: [{ abs, sessionId: 'b', t: 900 }], sessions }).by, 'session');
  assert.deepEqual(pickChanger({ abs, mtimeMs: 1000, writes: [{ abs, hook: 0, t: 1000 }], sessions }), { by: 'hook', basis: 'hook_ran', hook: 0 });
  // 다른 파일·오래된 신호·앞 바뀜 전의 신호는 쓰지 않는다
  assert.equal(pickChanger({ abs, mtimeMs: 5000, since: 2000, writes: [{ abs, sessionId: 'a', t: 1500 }], sessions }).by, 'human');
  assert.equal(pickChanger({ abs, mtimeMs: 5000, since: 2000, writes: [{ abs, sessionId: 'a', t: 5100 }], sessions }).by, 'seat');
  assert.equal(pickChanger({ abs, mtimeMs: 1000, writes: [{ abs: path.resolve('/w/other.md'), sessionId: 'a', t: 1000 }], sessions }).by, 'human');
  assert.equal(pickChanger({ abs, mtimeMs: 10 * 60 * 1000, writes: [{ abs, sessionId: 'a', t: 0 }], sessions }).by, 'human');
  // 폴더 문서는 안의 파일
  assert.equal(pickChanger({ abs: path.resolve('/w/reports'), dir: true, mtimeMs: 1000, writes: [{ abs: path.resolve('/w/reports/a.md'), sessionId: 'a', t: 1000 }], sessions }).by, 'seat');
  const w1 = sessions.map((x, i) => ({ ...x, working: i === 0 }));
  assert.deepEqual(pickChanger({ abs, mtimeMs: 1000, sessions: w1 }), { by: 'seat', basis: 'working', seat: 'keeper', sessionId: 'a', name: 'keeper' });
  const w2 = sessions.map((x) => ({ ...x, working: true }));
  assert.equal(pickChanger({ abs, mtimeMs: 1000, sessions: w2 }).by, 'unknown');
  assert.deepEqual(pickChanger({ abs, mtimeMs: 1000, sessions }), { by: 'human', basis: 'no_agent_working' });
});

test('stale: 기간과 after_change_of, 문서가 없으면 모름', () => {
  const dir = tmp();
  const d = v2(sampleDef()).def;
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  const now = Date.now();
  const rules = path.join(dir, 'docs', 'rules.txt'); const facts = path.join(dir, 'docs', 'facts.txt');
  bump(rules, 'a', now - 40 * 86400000); bump(facts, 'b', now - 50 * 86400000);
  const stats = { rules: statDoc(rules), facts: statDoc(facts), corrections: statDoc(path.join(dir, 'nope')) };
  assert.equal(staleOf(d.docs.rules, stats, now).stale, true);
  assert.equal(staleOf(d.docs.facts, stats, now).stale, true, 'rules가 facts보다 늦게 바뀌었다');
  assert.equal(staleOf(d.docs.corrections, stats, now), null);
  bump(rules, 'c', now - 1000); bump(facts, 'd', now);
  const s2 = { rules: statDoc(rules), facts: statDoc(facts) };
  assert.equal(staleOf(d.docs.rules, s2, now).stale, false);
  assert.equal(staleOf(d.docs.facts, s2, now).stale, false);
});

test('머리의 문서 목록: 세 줄 그대로, 셋째 줄 끝에 늘 싣는 문서 경로와 atrium item', () => {
  const d = v2(sampleDef()).def;
  const docs = seatDocsOf(d, 'keeper');
  assert.deepEqual(docs, { loads: [{ name: 'rules', path: 'docs/rules.txt', role: 'canon' }], reads: [{ name: 'facts', path: 'docs/facts.txt', role: 'canon' }] });
  const h = seatHeader({ seat: 'keeper', unitId: 'u1', caseId: 'c1', by: 'x', docs });
  assert.equal(h.split('\n').length, 3);
  assert.match(h.split('\n')[2], /먼저 읽을 문서: docs\/rules\.txt\. 문서 목록: `atrium item`\./);
  assert.equal(seatHeader({ seat: 'keeper', unitId: 'u1', caseId: 'c1', by: 'x' }).includes('문서'), false, '문서가 없으면 지금 머리 그대로');
  assert.equal(docsTail({ loads: [], reads: [{ path: 'a' }] }), '문서 목록: `atrium item`.');
  assert.deepEqual(docLines(docs), ['  docs/rules.txt (rules, canon): 이 문서를 먼저 읽는다', '  docs/facts.txt (facts, canon): 필요할 때 읽는다']);
});

test('장부 kind: 문서 사건 넷이 닫힌 목록에 있다', () => {
  for (const k of ['doc_load', 'doc_changed', 'doc_foreign_write', 'doc_stale']) assert.ok(RIG_EVENT_KINDS.includes(k), k);
  assert.ok(MAP_NODE_TYPES.includes('doc') && MAP_NODE_TYPES.includes('hook'));
  for (const t of ['loads', 'reads', 'records', 'writes']) assert.ok(MAP_EDGE_TYPES.includes(t), t);
});

// ---------- 가짜 판 ----------
test('판: 느린 고리가 keep 자리에 맡긴 일의 머리에 문서 목록, atrium item·me의 문서, doc_load', async () => {
  const B = await board();
  try {
    const { b, ws, add, seat } = B;
    const k = add('keeper'); seat(k, 'keeper');
    const F = b.branch.flow;
    await F.cycleTick(Date.now()); // 첫 회: 다음 시각만 정한다
    await F.cycleTick(Date.now() + 8 * 86400000);
    await until(() => k.texts.some((t) => /rig의 keeper 자리다/.test(t)));
    const head = k.texts.find((t) => /rig의 keeper 자리다/.test(t));
    const boardLines = head.split('\n').filter((l) => l.startsWith('[Atrium 보드]'));
    assert.equal(boardLines.length, 3);
    assert.match(boardLines[2], /먼저 읽을 문서: docs\/rules\.txt/);
    const it = U(b).item(k).item;
    assert.deepEqual(it.docs.loads.map((x) => x.path), ['docs/rules.txt']);
    assert.deepEqual(it.docs.reads.map((x) => x.path), ['docs/facts.txt']);
    const me = F.meOf(k);
    assert.deepEqual(me.writesDocs, ['corrections']);
    const loads = ledger(b, ws.key, { kinds: ['doc_load'] });
    assert.ok(loads.length >= 1);
    const L = loads[loads.length - 1];
    assert.equal(L.seat, 'keeper'); assert.equal(L.value, 'unit'); assert.ok(L.caseId && L.unitId && L.tryId);
    assert.deepEqual(L.data, { loads: ['rules'], reads: ['facts'] });
    // 사람이 자리에 앉힐 때의 알림에도
    const k2 = add('helper2');
    seat(k, null);
    F.setSeat(k2, 'keeper', { notify: true });
    await until(() => k2.texts.some((t) => /keeper 자리에 앉혔다/.test(t)));
    assert.match(k2.texts.find((t) => /keeper 자리에 앉혔다/.test(t)), /먼저 읽을 문서: docs\/rules\.txt/);
    assert.ok(ledger(b, ws.key, { kinds: ['doc_load'] }).some((r) => r.value === 'seat' && r.session === k2.sessionId));
  } finally { await B.stop(); }
});

test('판: 문서 바뀜과 바꾼 쪽(자리·rig 밖 세션·사람), 쥔 쪽이 아닌 쓰기 경고, 쉬는 동안 바뀐 것', async () => {
  const B = await board();
  try {
    const { b, ws, add, seat, dir } = B;
    const D = b.rigDocs;
    const k = add('keeper'); seat(k, 'keeper');
    const out = add('outsider');
    assert.equal(await D.scan(), 0, '처음 훑기는 기준만 잡는다');
    const rules = path.join(dir, 'docs', 'rules.txt'); const corr = path.join(dir, 'ledger', 'corrections.jsonl');
    // 1) keeper가 장부를 씀(PostToolUse 신호) → 자리, 쥔 쪽이라 경고 없음
    D.noteToolHook(k, { tool_name: 'Write', tool_input: { file_path: corr } });
    bump(corr, '{"x":1}\n');
    assert.equal(await D.scan(), 1);
    let rows = ledger(b, ws.key, { kinds: ['doc_changed', 'doc_foreign_write'] });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'doc_changed'); assert.equal(rows[0].value, 'seat'); assert.equal(rows[0].seat, 'keeper'); assert.equal(rows[0].session, k.sessionId); assert.equal(rows[0].actor, 'agent');
    assert.equal(rows[0].data.doc, 'corrections'); assert.equal(rows[0].data.basis, 'post_tool');
    // 2) keeper가 정본(rules)을 씀(상대 경로 신호) → 자리 + 쥔 쪽 아님 경고
    D.noteToolHook(k, { tool_name: 'Edit', tool_input: { file_path: 'docs/rules.txt' } });
    bump(rules, '- 새 규칙\n');
    await D.scan();
    rows = ledger(b, ws.key, { kinds: ['doc_changed', 'doc_foreign_write'] }).slice(1);
    assert.deepEqual(rows.map((r) => r.kind), ['doc_changed', 'doc_foreign_write']);
    assert.equal(rows[1].value, 'keeper'); assert.match(rows[1].text, /쥔 쪽이 아닌 keeper 자리\(@keeper\)가 문서 rules/);
    // 3) rig 밖 세션이 장부를 씀 → session + 경고
    D.noteToolHook(out, { tool_name: 'Write', tool_input: { file_path: corr } });
    bump(corr, '{"x":2}\n');
    await D.scan();
    rows = ledger(b, ws.key, { kinds: ['doc_changed', 'doc_foreign_write'] }).slice(3);
    assert.deepEqual(rows.map((r) => [r.kind, r.value]), [['doc_changed', 'session'], ['doc_foreign_write', '@outsider']]);
    // 4) 신호 없이, 일하는 세션 없이 바뀜 → 사람(경고 없음). 앞의 신호는 쓰였으니 남아 있지 않다
    assert.equal(D.writes.length, 0, '쓴 신호는 지운다');
    D.noteWrite({ abs: rules, sessionId: k.sessionId, t: Date.now() - 60000 }); // 앞 바뀜 전의 신호(지난 것)
    bump(rules, '- 사람이 고침\n');
    await D.scan();
    rows = ledger(b, ws.key, { kinds: ['doc_changed', 'doc_foreign_write'] }).slice(5);
    assert.deepEqual(rows.map((r) => [r.kind, r.value, r.actor]), [['doc_changed', 'human', 'human']]);
    // 5) 일하던 세션이 하나면 그 세션(신호 없음, Bash로 쓴 경우)
    applyTermStatus(k.rt, 'working'); b.broadcastSession(k);
    bump(rules, '- 셸로 고침\n');
    await D.scan();
    const w = ledger(b, ws.key, { kinds: ['doc_changed'] }).pop();
    assert.equal(w.value, 'seat'); assert.equal(w.data.basis, 'working');
    applyTermStatus(k.rt, 'idle');
    // 6) 판이 다시 뜸(새 RigDocs): 장부의 마지막 서명과 다르면 쉬는 동안 바뀐 것(모름)
    const D2 = new RigDocs(b, { pollMs: 50 });
    bump(corr, '{"x":3}\n', Date.now() + 5000);
    assert.equal(await D2.scan(), 1);
    const away = ledger(b, ws.key, { kinds: ['doc_changed'] }).pop();
    assert.equal(away.value, 'unknown'); assert.equal(away.data.basis, 'while_away');
    assert.equal(await D2.scan(), 0, '같은 서명이면 다시 남기지 않는다');
    // rig가 꺼지면 보지 않는다
    b.store.setRigEnabled(ws.key, false);
    bump(rules, 'off\n');
    assert.equal(await D2.scan(), 0);
  } finally { await B.stop(); }
});

test('판: records 훅이 쓴 장부는 훅으로 남고(쥔 쪽), status·rig check·rig.map에 문서 상태', async () => {
  const B = await board();
  try {
    const { b, ws, add, seat, dir } = B;
    const k = add('keeper'); seat(k, 'keeper');
    const F = b.branch.flow;
    await b.rigDocs.scan();
    await F.cycleTick(Date.now()); await F.cycleTick(Date.now() + 8 * 86400000);
    await until(() => U(b).item(k).item);
    await U(b).doneVerb(k, { result: 'ok', text: '규칙 셋을 봤다' });
    const corr = fs.readFileSync(path.join(dir, 'ledger', 'corrections.jsonl'), 'utf8');
    assert.match(corr, /규칙 셋을 봤다/);
    await b.rigDocs.scan();
    const ch = ledger(b, ws.key, { kinds: ['doc_changed', 'doc_foreign_write'] });
    assert.deepEqual(ch.map((r) => [r.kind, r.value, r.data.doc]), [['doc_changed', 'hook', 'corrections']]);
    assert.equal(ch[0].actor, 'hook'); assert.equal(ch[0].data.hook, 0);
    // rig.status
    const st = b.rig.status(ws.key);
    assert.equal(st.format, 2);
    const sd = Object.fromEntries(st.docs.map((x) => [x.name, x]));
    assert.equal(sd.corrections.last.by, 'hook');
    assert.equal(sd.rules.stale.stale, false);
    assert.equal(st.seats[0].loads[0], 'rules');
    // rig check 요약
    const chk = new RigAdmin(b, b.branch).check(ws.key);
    assert.ok(chk.ok, chk.reason);
    assert.equal(chk.summary.format, 2);
    assert.deepEqual(chk.summary.docs.map((x) => x.name), ['rules', 'facts', 'corrections']);
    // rig.map: 문서 마디(role, layer, 마지막 바뀜, stale)와 loads·reads·writes·records 변
    const m = new RigMap(b).get(ws.key);
    const nd = (id) => m.def.nodes.find((n) => n.id === id);
    assert.equal(nd(docId('rules')).meta.role, 'canon');
    assert.equal(nd(docId('rules')).meta.layer, 'project');
    assert.equal(nd(docId('corrections')).meta.last.by, 'hook');
    assert.equal(nd(docId('rules')).meta.stale.stale, false);
    assert.equal(nd('hook:0').type, 'hook');
    const ed = (id) => m.def.edges.find((e) => e.id === id);
    assert.equal(ed(E.loads('seat:keeper', 'rules')).type, 'loads');
    assert.equal(ed(E.loads('seat:keeper', 'rules')).meta.always, true);
    assert.equal(ed(E.reads('seat:keeper', 'facts')).to, docId('facts'));
    assert.equal(ed(E.writes('keeper', docId('corrections'))).to, docId('corrections'));
    assert.equal(ed(E.records('hook:0', 'corrections')).from, 'hook:0');
    assert.equal(m.def.nodes.some((n) => n.type === 'file' && n.label === 'ledger/corrections.jsonl'), false, '문서가 된 경로는 file 마디로 겹치지 않는다');
    for (const n of m.def.nodes) assert.ok(MAP_NODE_TYPES.includes(n.type), n.type);
    for (const e of m.def.edges) assert.ok(MAP_EDGE_TYPES.includes(e.type), e.type);
    // 장부 도움 함수가 문서 kind를 받는다(모르는 kind는 던진다)
    assert.ok(rigEvent(b, { kind: 'doc_stale', ws: ws.key, actor: 'board', data: { doc: 'rules' } }));
    assert.throws(() => rigEvent(b, { kind: 'doc_nope', ws: ws.key }), /모르는 kind/);
  } finally { await B.stop(); }
});
