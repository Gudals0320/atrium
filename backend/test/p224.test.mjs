// P224 단위 시험: rig 2의 R6 제안과 승인(docs research rig2-design.md 2절, 2.1, 5절, 8절 R6, 9절 Q1, 11.3, 11.5의 4, 11.7의 1·6).
// diff 만들기·적용, 정의 검사(정본 writes는 오류, 섹터 accept), 제안 내기(대상·패치 꼴·까닭, proposals 섹터 등록, 장부), 정본 = 사람 승인과 정의 = 관리자 바로 반영
// (approve human이면 사람), 승인·거절·충돌, 거절이 다음 개선 회 글에 붙음, 승인 안 된 정본 바뀜과 되돌리기·받아들이기, 섹터 accept 세 값, 워크트리 산출물
// pending_merge → new·accepted·lost, 판 API rig.asks·rig.decide와 권한. 가짜 판은 p222 틀(진짜 저장소·전달 대기열·Branch·Rig, 가짜 에이전트)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { Rig, validateRig } from '../src/rig.mjs';
import { RIG_EVENT_KINDS } from '../src/rig-ledger.mjs';
import { RigDocs } from '../src/rig-docs.mjs';
import { RIG_ADMIN_OPS } from '../src/rig-admin.mjs';
import { sectorsFor, ARTIFACT_STATES, LIVE_ARTIFACT } from '../src/rig-sectors.mjs';
import { RigProposals, rigProposalHandlers, unifiedDiff, applyUnifiedDiff, isUnifiedDiff, diffLines } from '../src/rig-proposals.mjs';
import { VERBS } from '../src/cli-contract.mjs';
import { parseHookOutput } from '../src/hook-runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(HERE, 'fixtures');
const GROW = path.join(FX, 'rig-loops-grow');
const CHECK = path.join(FX, 'rig-loops-check');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p224-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const defOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, '.atrium', 'rig.json'), 'utf8'));
const exists = (f) => { try { fs.statSync(f); return true; } catch { return false; } };
const ledger = (b, key, q = {}) => b.store.rigEvents({ ws: key, limit: 10000, ...q });
const DAY = 86400000;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' } }).toString().trim();

// ---------- 가짜 판(p219 틀) ----------
async function board({ dir = tmp(), from = GROW, def = null, enable = true, batchMs = 40 } = {}) {
  if (path.resolve(from) !== path.resolve(dir)) fs.cpSync(from, dir, { recursive: true });
  if (def) { const f = path.join(dir, '.atrium', 'rig.json'); fs.writeFileSync(f, JSON.stringify(def, null, 2)); const t = new Date(Date.now() + Math.floor(Math.random() * 100000)); fs.utimesSync(f, t, t); }
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p224test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0, rigCycles: false };
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
  b.rigDocs = new RigDocs(b, { pollMs: 50 });
  b.rigProposals = new RigProposals(b); // P224
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
  const L = () => b.branch.flow.loops;
  const seat = (s, name) => F().setSeat(s, name);
  const by = (name) => [...b.sessions.values()].find((x) => x.name === name);
  return { b, dir, ws, add, F, L, seat, by, stop: async () => { b.stopped = true; b.queue.stop(); b.branch.notices.stop(); b.branch.units.stops.stop(); F().stopCycles(); await tick(200); store.close(); } };
}
const U = (b) => b.branch.units;
const human = { kind: 'human' };
const local = { auth: { kind: 'local' } };
const V = (b) => b.branch.verbs;
const gotUnit = (s) => until(() => s.texts.some((t) => t.includes('[Atrium 보드] 관계:')));

// 정기 점검 한 회: every 계기로 checker 자리 세션을 띄우고 일이 들어올 때까지
async function runOnce(t, at) {
  const fired = await t.L().tick(at);
  assert.equal(fired.length, 1, '회가 열린다');
  const s = t.by(fired[0].to);
  await gotUnit(s);
  return { s, caseId: fired[0].caseId };
}
const put = (dir, rel, body) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); return f; };


const P = (b) => b.rigProposals;
const H = (b) => rigProposalHandlers(b);
const verb = (b, s, o) => b.branch.rigAdmin.verb(s, o);
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const NEW_RULES = '# Rules\n\n- Keep answers short.\n- Cite the fact sheet when you state a number.\n';

// 규칙이 자라는 반복 작업 견본: main 자리 하나(keep, manager), retro(improve, every 7d, approve human)
async function grow(opts = {}) {
  const t = await board({ from: GROW, ...opts });
  // 시험 자료는 git이 CRLF로 꺼낼 수 있다. 정본을 LF로 다시 쓴다
  fs.writeFileSync(path.join(t.dir, 'docs', 'rules.txt'), '# Rules\n\n- Keep answers short.\n');
  fs.writeFileSync(path.join(t.dir, 'docs', 'facts.txt'), '# Facts\n\n- Product name: Example.\n');
  const main = t.add('main'); t.seat(main, 'main');
  await t.b.rigDocs.scan(); // 정본의 승인된 내용(처음 본 것)
  return { ...t, main };
}
// retro 회 하나를 열고 main이 그 일을 받을 때까지
async function retro(t, at) {
  // P230: 개선 고리는 지난 개선 회 뒤로 끝난 작업 회가 있어야 돈다("새 회 없음" 건너뛰기). 그 사이에 끝난 작업 회 하나를 둔다
  t.b.store.insertCase({ id: `cw${at}`, workspaceKey: t.ws.key, owner: t.main.sessionId, state: 'done', createdAt: at - 2, closedAt: at - 1, loop: 'work' });
  const fired = await t.L().tick(at);
  assert.equal(fired.length, 1, 'retro 회가 열린다');
  await until(() => t.main.texts.some((x) => x.includes('retro 고리')));
  return fired[0];
}

// ---------- 순수 함수 ----------
test('P224 diff: 통합 diff 만들기와 적용(맞는 자리 찾기, 맞지 않으면 거절, CRLF 그대로)', () => {
  const a = '# Rules\n\n- Keep answers short.\n';
  const d = unifiedDiff(a, NEW_RULES, { path: 'docs/rules.txt' });
  assert.equal(d.added, 1); assert.equal(d.removed, 0);
  assert.match(d.text, /^--- a\/docs\/rules.txt\n\+\+\+ b\/docs\/rules.txt\n@@ -1,3 \+1,4 @@/);
  assert.ok(isUnifiedDiff(d.text)); assert.ok(!isUnifiedDiff(NEW_RULES));
  assert.deepEqual(applyUnifiedDiff(a, d.text), { ok: true, text: NEW_RULES });
  // 위에 줄이 더 붙은 내용에도 맞는 자리를 찾는다
  assert.equal(applyUnifiedDiff('intro\n' + a, d.text).text, 'intro\n' + NEW_RULES);
  assert.equal(applyUnifiedDiff('# Other\n', d.text).ok, false);
  assert.match(applyUnifiedDiff(a, 'no hunks').reason, /덩어리/);
  assert.equal(applyUnifiedDiff('x\r\ny\r\n', '--- a/f\n+++ b/f\n@@ -1,2 +1,2 @@\n x\n-y\n+z\n').text, 'x\r\nz\r\n');
  assert.equal(unifiedDiff('same\n', 'same\n').text, '');
  assert.deepEqual(diffLines(['a', 'b'], ['a', 'c']).map((o) => o.t), [' ', '-', '+']);
});

test('P224 정의: 정본을 자리 writes에 두면 오류, 섹터 accept(auto 기본 | human | gate), approve 값', () => {
  const raw = defOf(GROW);
  const ok = validateRig(raw, { root: GROW, exists }); assert.ok(ok.ok, ok.reason);
  assert.ok(!ok.def.warnings.some((w) => /R6/.test(w)), 'approve는 이제 쓰인다');
  assert.equal(ok.def.docs.proposals.accept, 'auto');
  const w = structuredClone(raw); w.seats.main.writes = ['corrections', 'rules'];
  const r = validateRig(w, { root: GROW, exists }); assert.equal(r.ok, false); assert.match(r.reason, /seats\.main\.writes에 정본 문서 rules.*atrium rig propose --target rules/);
  for (const v of ['auto', 'human', 'gate']) { const x = structuredClone(raw); x.docs.proposals.accept = v; const y = validateRig(x, { root: GROW, exists }); assert.ok(y.ok, y.reason); assert.equal(y.def.docs.proposals.accept, v); }
  const bad = structuredClone(raw); bad.docs.proposals.accept = 'later'; assert.match(validateRig(bad, { root: GROW, exists }).reason, /accept는 auto, human, gate/);
  const notSec = structuredClone(raw); notSec.docs.rules.accept = 'human'; assert.match(validateRig(notSec, { root: GROW, exists }).reason, /intake·keep·accept는 role "sector"/);
  const ap = structuredClone(raw); ap.loops.retro.approve = 'boss'; assert.match(validateRig(ap, { root: GROW, exists }).reason, /approve는 human, manager, none/);
  for (const k of ['proposal_made', 'proposal_decided', 'proposal_applied', 'doc_unapproved', 'doc_reverted', 'doc_accepted', 'artifact_merged', 'artifact_lost']) assert.ok(RIG_EVENT_KINDS.includes(k), k);
  for (const op of ['propose', 'proposals', 'approve', 'reject']) assert.ok(RIG_ADMIN_OPS.includes(op), op);
  assert.match(VERBS.find((x) => x.name === 'rig').args[0], /propose --target/);
  assert.deepEqual(ARTIFACT_STATES, ['new', 'accepted', 'superseded', 'pending_merge', 'lost']);
  assert.ok(LIVE_ARTIFACT.includes('pending_merge'));
});

// ---------- 판: 정본 제안 ----------
test('P224 정본 제안: 개선 회 글이 propose를 알리고, 제안은 proposals 섹터에 등록·장부에 남고, 사람이 승인하면 보드가 반영한다(관리자 자리는 정하지 못함)', async () => {
  const t = await grow();
  const { b, ws, dir, main } = t;
  try {
    const t0 = Date.now();
    await t.L().tick(t0);
    const f = await retro(t, t0 + 7 * DAY + 1);
    const first = main.texts.find((x) => x.includes('retro 고리'));
    assert.match(first, /atrium rig propose --target <문서> --file <파일>/); assert.match(first, /정본\(rules\(docs\/rules\.txt\), facts\(docs\/facts\.txt\)\)은 직접 고치지 않는다/);
    assert.match(first, /정의\(\.atrium\/rig\.json\)도 제안으로 고친다\(--target definition, 사람 승인\)/, 'retro approve human');
    // 대상 검사
    await assert.rejects(async () => verb(b, main, { op: 'propose', target: 'corrections', text: 'x' }), /ledger 문서다. 제안은 정본/);
    await assert.rejects(async () => verb(b, main, { op: 'propose', target: 'nope', text: 'x' }), /정의에 없다.*정본 문서: rules, facts/);
    await assert.rejects(async () => verb(b, main, { op: 'propose', target: 'rules', text: read(dir, 'docs/rules.txt') }), /바뀌는 것이 없다/);
    const outsider = t.add('outsider');
    await assert.rejects(async () => verb(b, outsider, { op: 'propose', target: 'rules', text: NEW_RULES }), /자리 세션/);
    const res = await verb(b, main, { op: 'propose', target: 'rules', text: NEW_RULES, why: '숫자에 출처가 빠진 교정이 세 번 있었다' });
    const p = res.proposal;
    assert.match(p.id, /^p[0-9a-f]{6}$/); assert.equal(p.state, 'pending'); assert.equal(p.route, 'human'); assert.equal(p.kind, 'doc'); assert.equal(p.path, 'docs/rules.txt');
    assert.equal(p.loop, 'retro'); assert.equal(p.caseId, f.caseId); assert.equal(p.added, 1); assert.match(p.diff, /\+- Cite the fact sheet/);
    assert.equal(read(dir, 'docs/rules.txt'), '# Rules\n\n- Keep answers short.\n', '승인 전에는 그대로');
    // proposals 섹터(정의의 섹터 문서)에 기록 파일과 산출물 행
    assert.equal(p.file, `.atrium/proposals/${p.id}-rules.diff`);
    assert.match(read(dir, p.file), /# 까닭: 숫자에 출처가 빠진 교정이 세 번 있었다[\s\S]*\+- Cite the fact sheet/);
    const art = b.store.artifacts({ ws: ws.key, sector: 'proposals', limit: 5 });
    assert.equal(art.length, 1); assert.equal(art[0].source, 'proposal'); assert.equal(art[0].path, p.file); assert.equal(art[0].state, 'new'); assert.equal(art[0].caseId, f.caseId);
    const made = ledger(b, ws.key, { kinds: ['proposal_made'] });
    assert.equal(made.length, 1); assert.equal(made[0].value, 'rules'); assert.equal(made[0].ref, p.id); assert.equal(made[0].actor, 'agent'); assert.equal(made[0].data.route, 'human'); assert.equal(made[0].caseId, f.caseId);
    assert.ok(b.casts.some((c) => c.n === 'rig.asks'), '판 이벤트 rig.asks');
    // 응답 필요 카드
    const asks = (await H(b)['rig.asks']({}, local)).asks;
    assert.equal(asks.length, 1); assert.equal(asks[0].kind, 'proposal'); assert.equal(asks[0].id, `proposal:${p.id}`); assert.match(asks[0].proposal.diff, /Cite the fact sheet/); assert.equal(asks[0].proposal.why, '숫자에 출처가 빠진 교정이 세 번 있었다');
    // 관리자 자리(main)도 정본 제안은 정하지 못한다. 기기 아닌 연결도 거절
    await assert.rejects(async () => verb(b, main, { op: 'approve', id: p.id }), /사람이 승인한다/);
    await assert.rejects(async () => H(b)['rig.decide']({ id: `proposal:${p.id}`, action: 'approve' }, { auth: { kind: 'session' } }), /보드 창이나 연결한 기기/);
    // 사람이 휴대폰(기기)에서 승인 → 반영
    const out = await H(b)['rig.decide']({ id: `proposal:${p.id}`, action: 'approve' }, { auth: { kind: 'device' } });
    assert.equal(out.applied, true); assert.equal(out.proposal.state, 'applied'); assert.equal(out.proposal.decidedBy, 'device');
    assert.equal(read(dir, 'docs/rules.txt'), NEW_RULES);
    const dec = ledger(b, ws.key, { kinds: ['proposal_decided', 'proposal_applied'] });
    assert.deepEqual(dec.map((r) => [r.kind, r.value, r.actor]), [['proposal_decided', 'approved', 'human'], ['proposal_applied', 'applied', 'board']]);
    assert.equal(dec[1].data.before, sha('# Rules\n\n- Keep answers short.\n')); assert.equal(dec[1].data.after, sha(NEW_RULES));
    assert.equal(b.store.getArtifact(art[0].id).state, 'accepted'); assert.equal(b.store.getArtifact(art[0].id).stateWhy, 'approved');
    // P232(rig2-design 11.14의 11): 정본 반영 알림은 바로 보내지 않고 main 자리의 다음 회 머리에 붙는다
    assert.ok(b.store.seatNotes(ws.key, 'main').some((n) => n.text.includes(`정본 rules(docs/rules.txt)가 바뀌었다(제안 ${p.id} 승인·반영). 다시 읽는다.`)));
    await tick(100); assert.ok(!main.texts.some((x) => x.includes('다시 읽는다')), '바로 보내지 않는다');
    assert.equal((await H(b)['rig.asks']({}, local)).asks.length, 0);
    await assert.rejects(async () => H(b)['rig.decide']({ id: `proposal:${p.id}`, action: 'reject', reason: 'x' }, local), /이미 정해졌다/);
    // 문서 감시: 보드가 쓴 바뀜(승인된 제안 반영)이고 승인 안 된 바뀜이 아니다
    await tick(30); await b.rigDocs.scan();
    const ch = ledger(b, ws.key, { kinds: ['doc_changed'] }).filter((r) => r.data.doc === 'rules');
    assert.equal(ch.length, 1); assert.equal(ch[0].value, 'board'); assert.equal(ch[0].data.basis, 'board'); assert.match(ch[0].text, /보드\(승인된 제안 p[0-9a-f]+ 반영\)/);
    assert.equal(ledger(b, ws.key, { kinds: ['doc_unapproved'] }).length, 0);
    // atrium rig proposals(읽기)
    const list = await verb(b, outsider, { op: 'proposals' });
    assert.equal(list.proposals.length, 1); assert.equal(list.proposals[0].state, 'applied');
    const one = await verb(b, main, { op: 'proposals', id: p.id }); assert.match(one.proposal.diff, /Cite/);
  } finally { await t.stop(); }
});

test('P224 거절과 충돌: 거절은 한 줄 까닭과 함께 남고(산출물은 밀려남) 다음 개선 회 글에 붙는다. 통합 diff 제안, 승인 전에 대상이 바뀌면 충돌(failed)', async () => {
  const t = await grow();
  const { b, ws, dir, main } = t;
  try {
    const t0 = Date.now();
    await t.L().tick(t0);
    await retro(t, t0 + 7 * DAY + 1);
    const base = read(dir, 'docs/facts.txt');
    const diff = unifiedDiff(base, base + '- Release cadence: weekly.\n', { path: 'docs/facts.txt' }).text;
    const r1 = await verb(b, main, { op: 'propose', target: 'facts', text: diff, why: 'cadence asked twice' });
    assert.equal(r1.proposal.added, 1);
    assert.equal(ledger(b, ws.key, { kinds: ['proposal_made'] })[0].data.form, 'diff');
    await assert.rejects(async () => verb(b, main, { op: 'propose', target: 'facts', text: '--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n-nothing here\n+y\n' }), /diff를 docs\/facts\.txt에 적용하지 못했다/);
    await assert.rejects(async () => H(b)['rig.decide']({ id: `proposal:${r1.proposal.id}`, action: 'reject' }, local), /한 줄 까닭/);
    const rj = await H(b)['rig.decide']({ id: `proposal:${r1.proposal.id}`, action: 'reject', reason: 'cadence is per project, not a global fact' }, local);
    assert.equal(rj.proposal.state, 'rejected'); assert.equal(rj.proposal.reason, 'cadence is per project, not a global fact');
    assert.equal(read(dir, 'docs/facts.txt'), base);
    const d = ledger(b, ws.key, { kinds: ['proposal_decided'] }); assert.equal(d[0].value, 'rejected'); assert.equal(d[0].data.reason, 'cadence is per project, not a global fact');
    const a = b.store.getArtifact(b.store.getProposal(r1.proposal.id).artifactId); assert.equal(a.state, 'superseded'); assert.equal(a.stateWhy, 'rejected');
    assert.ok(b.store.seatNotes(ws.key, 'main').some((n) => n.text.includes('거절되었다: cadence is per project')), 'P232: 다음 회 머리에 붙는다');
    // 충돌: 제안 뒤에 사람이 손으로 고침
    const r2 = await verb(b, main, { op: 'propose', target: 'rules', text: NEW_RULES, why: 'cite facts' });
    fs.appendFileSync(path.join(dir, 'docs', 'rules.txt'), '- hand edit\n');
    const c = await H(b)['rig.decide']({ id: `proposal:${r2.proposal.id}`, action: 'approve' }, local);
    assert.equal(c.applied, false); assert.match(c.reason, /충돌/); assert.equal(c.proposal.state, 'failed');
    assert.match(read(dir, 'docs/rules.txt'), /hand edit/, '충돌이면 쓰지 않는다');
    assert.equal(ledger(b, ws.key, { kinds: ['proposal_applied'] })[0].value, 'conflict');
    assert.ok(b.store.seatNotes(ws.key, 'main').some((n) => n.text.includes('반영하지 못했다') && n.text.includes('충돌')), 'P232: 다음 회 머리에 붙는다');
    // 다음 개선 회의 글에 거절·반영 못 한 제안이 붙는다
    const doneRun = await U(b).doneVerb(main, { result: 'ok', text: 'retro done, 2 proposals' });
    assert.ok(doneRun);
    main.texts.length = 0;
    await retro(t, t0 + 14 * DAY + 2);
    const next = main.texts.find((x) => x.includes('retro 고리'));
    assert.match(next, /지난 회 뒤 거절되거나 반영되지 못한 제안/);
    assert.match(next, new RegExp(`${r1.proposal.id} facts \\(cadence asked twice\\): 거절 — cadence is per project`));
    assert.match(next, new RegExp(`${r2.proposal.id} rules .*반영 못 함 — .*충돌`));
  } finally { await t.stop(); }
});

test('P224 정의 제안: approve가 human이 아니면 관리자 자리의 제안은 바로 반영(새 버전, by manager), 다른 자리의 제안은 관리자 자리가 정한다. approve human이면 사람. 맞지 않는 정의는 거절', async () => {
  const def = defOf(GROW);
  def.loops.retro.approve = 'manager';
  def.seats.helper = { launcher: 'claude', session: 'keep' };
  def.loops.help = { kind: 'work', trigger: { request: 'helper' }, entry: 'helper' };
  const t = await grow({ def });
  const { b, ws, dir, main } = t;
  try {
    const helper = t.add('helper'); t.seat(helper, 'helper');
    const n0 = b.rig.read(ws.key).n;
    assert.ok(n0 >= 1);
    const cur = read(dir, '.atrium/rig.json');
    const next = JSON.parse(cur); next.docs.facts.stale = '30d';
    await assert.rejects(async () => verb(b, main, { op: 'propose', target: 'definition', text: '{ nope' }), /JSON이 아니다/);
    const broken = JSON.parse(cur); broken.seats.main.writes = ['rules'];
    await assert.rejects(async () => verb(b, main, { op: 'propose', target: 'definition', text: JSON.stringify(broken) }), /검사를 지나지 않는다.*정본 문서 rules/);
    const r = await verb(b, main, { op: 'propose', target: 'definition', text: JSON.stringify(next, null, 2) + '\n', why: 'facts go stale after a month' });
    assert.equal(r.autoApplied, true); assert.equal(r.applied, true); assert.equal(r.proposal.state, 'applied'); assert.equal(r.proposal.decidedBy, 'manager');
    const n1 = b.rig.read(ws.key).n;
    assert.equal(n1, n0 + 1); assert.equal(r.proposal.versionN, n1);
    const v = b.store.rigVersions(ws.key).at(-1); assert.equal(v.by, 'manager'); assert.equal(v.note, `proposal ${r.proposal.id}`);
    assert.equal(b.rig.read(ws.key).def.docs.facts.stale.text, '30d');
    assert.deepEqual(ledger(b, ws.key, { kinds: ['proposal_decided', 'proposal_applied'] }).map((x) => [x.value, x.actor]), [['approved', 'agent'], ['applied', 'board']]);
    assert.equal(ledger(b, ws.key, { kinds: ['proposal_applied'] })[0].data.version, n1);
    assert.equal((await H(b)['rig.asks']({}, local)).asks.length, 0, '관리자 길은 사람 목록에 없다');
    // 다른 자리(helper)의 정의 제안 → 관리자 자리가 정한다
    const next2 = JSON.parse(read(dir, '.atrium/rig.json')); next2.name = 'rules-grow-loop-2';
    const r2 = await verb(b, helper, { op: 'propose', target: 'definition', text: JSON.stringify(next2, null, 2) });
    assert.equal(r2.proposal.route, 'manager'); assert.equal(r2.proposal.state, 'pending');
    await until(() => main.texts.some((x) => x.includes(`atrium rig approve ${r2.proposal.id}`)));
    await assert.rejects(async () => verb(b, helper, { op: 'approve', id: r2.proposal.id }), /관리자 자리/);
    const ap = await verb(b, main, { op: 'approve', id: r2.proposal.id });
    assert.equal(ap.applied, true); assert.equal(b.rig.read(ws.key).def.name, 'rules-grow-loop-2'); assert.equal(b.rig.read(ws.key).n, n1 + 1);
    assert.ok(b.store.seatNotes(ws.key, 'helper').some((n) => n.text.includes('승인되어 .atrium/rig.json에 반영')), 'P232: 다음 회 머리에 붙는다');
  } finally { await t.stop(); }
  // approve human(견본 그대로): 관리자 자리의 정의 제안도 사람에게
  const t2 = await grow();
  try {
    const nx = JSON.parse(read(t2.dir, '.atrium/rig.json')); nx.name = 'x';
    const r = await verb(t2.b, t2.main, { op: 'propose', target: 'definition', text: JSON.stringify(nx) });
    assert.equal(r.proposal.route, 'human'); assert.equal(r.proposal.state, 'pending'); assert.ok(!r.autoApplied);
    const asks = (await H(t2.b)['rig.asks']({}, local)).asks; assert.equal(asks[0].proposal.target, 'definition');
    const out = await H(t2.b)['rig.decide']({ id: asks[0].id, action: 'approve' }, local);
    assert.equal(out.applied, true); assert.equal(t2.b.store.rigVersions(t2.ws.key).at(-1).by, 'human');
  } finally { await t2.stop(); }
});

// ---------- 판: 정본 지키기 ----------
test('P224 승인 안 된 정본 바뀜: 손으로 고치면 카드(diff), 되돌리기는 승인된 내용으로, 받아들이기는 그 내용을 승인된 것으로, 승인된 내용으로 돌아오면 카드가 걷힌다', async () => {
  const t = await grow();
  const { b, ws, dir } = t;
  try {
    const before = read(dir, 'docs/rules.txt');
    assert.equal(b.store.docMark(ws.key, 'rules').approvedSha, sha(before), '처음 본 내용이 승인된 내용');
    fs.writeFileSync(path.join(dir, 'docs', 'rules.txt'), before + '- Hand rule\n');
    await tick(30); await b.rigDocs.scan();
    const un = ledger(b, ws.key, { kinds: ['doc_unapproved'] });
    assert.equal(un.length, 1); assert.equal(un[0].value, 'rules'); assert.match(un[0].text, /승인 없이 바뀌었다\(사람 또는 바깥 프로그램\(추정\)\)/);
    let asks = (await H(b)['rig.asks']({}, local)).asks;
    assert.equal(asks.length, 1); assert.equal(asks[0].kind, 'doc_unapproved'); assert.equal(asks[0].doc, 'rules'); assert.equal(asks[0].who.by, 'human'); assert.equal(asks[0].who.guess, true); assert.match(asks[0].by, /사람 또는 바깥 프로그램/); assert.match(asks[0].diff, /\+- Hand rule/); assert.equal(asks[0].canRevert, true);
    const st = b.rig.status(ws.key).docs.find((d) => d.name === 'rules'); assert.ok(st.unapproved && st.unapproved.at);
    // 같은 내용을 다시 보아도 한 번
    await b.rigDocs.scan(); assert.equal(ledger(b, ws.key, { kinds: ['doc_unapproved'] }).length, 1);
    // 되돌리기
    const rv = await H(b)['rig.decide']({ id: asks[0].id, action: 'revert' }, local);
    assert.equal(rv.from, 'approved'); assert.equal(read(dir, 'docs/rules.txt'), before);
    assert.equal(ledger(b, ws.key, { kinds: ['doc_reverted'] }).length, 1);
    assert.equal((await H(b)['rig.asks']({}, local)).asks.length, 0);
    await tick(30); await b.rigDocs.scan();
    assert.equal(ledger(b, ws.key, { kinds: ['doc_unapproved'] }).length, 1, '되돌린 쓰기는 승인 안 된 바뀜이 아니다');
    // 다시 고치고 받아들이기
    fs.writeFileSync(path.join(dir, 'docs', 'rules.txt'), before + '- Accepted rule\n');
    await tick(30); await b.rigDocs.scan();
    asks = (await H(b)['rig.asks']({}, local)).asks; assert.equal(asks.length, 1);
    await H(b)['rig.decide']({ id: asks[0].id, action: 'accept' }, local);
    assert.equal(b.store.docMark(ws.key, 'rules').approvedSha, sha(before + '- Accepted rule\n'));
    assert.equal(ledger(b, ws.key, { kinds: ['doc_accepted'] }).length, 1);
    await assert.rejects(async () => H(b)['rig.decide']({ id: asks[0].id, action: 'accept' }, local), /승인 안 된 바뀜이 없다/);
    // 고쳤다가 승인된 내용으로 손으로 되돌리면 카드가 걷힌다
    fs.writeFileSync(path.join(dir, 'docs', 'rules.txt'), 'oops\n');
    await tick(30); await b.rigDocs.scan();
    assert.equal((await H(b)['rig.asks']({}, local)).asks.length, 1);
    fs.writeFileSync(path.join(dir, 'docs', 'rules.txt'), before + '- Accepted rule\n');
    await tick(30); await b.rigDocs.scan();
    assert.equal((await H(b)['rig.asks']({}, local)).asks.length, 0);
  } finally { await t.stop(); }
});

// ---------- 판: 섹터 받아들임 ----------
test('P224 섹터 accept: auto는 회가 done이면 받아들임, human은 새것으로 남고 응답 필요 카드에서 받아들임, gate는 done 훅의 accept 판정', async () => {
  const mk = (accept, hook) => { const d = defOf(CHECK); d.docs.reports.accept = accept; if (hook) d.hooks = [{ at: 'done', run: ['node', '.atrium/hooks/gate.mjs'] }]; return d; };
  const once = async (t, name) => {
    const t0 = Date.now(); await t.L().tick(t0);
    const fired = await t.L().tick(t0 + 7 * DAY + 1);
    const s = t.by(fired[0].to); await until(() => s.texts.some((x) => x.includes('[Atrium 보드] 관계:')));
    const f = path.join(t.dir, 'reports', name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, '# r\n');
    const out = await U(t.b).doneVerb(s, { result: 'ok', text: 'report', artifacts: [f] });
    return t.b.store.getArtifact(out.artifacts[0].id);
  };
  // human
  const t1 = await board({ from: CHECK, def: mk('human') });
  try {
    const a = await once(t1, 'w1.md');
    assert.equal(a.state, 'new', 'human 섹터는 회가 끝나도 새것');
    assert.equal(ledger(t1.b, t1.ws.key, { kinds: ['artifact_accepted'] }).length, 0);
    const asks = (await H(t1.b)['rig.asks']({}, local)).asks;
    assert.equal(asks.length, 1); assert.equal(asks[0].kind, 'artifact'); assert.equal(asks[0].artifact.path, 'reports/w1.md');
    await H(t1.b)['rig.decide']({ id: asks[0].id, action: 'accept' }, { auth: { kind: 'device' } });
    const x = t1.b.store.getArtifact(a.id); assert.equal(x.state, 'accepted'); assert.equal(x.stateWhy, 'human');
    const acc = ledger(t1.b, t1.ws.key, { kinds: ['artifact_accepted'] }); assert.equal(acc[0].actor, 'human');
    assert.equal((await H(t1.b)['rig.asks']({}, local)).asks.length, 0);
  } finally { await t1.stop(); }
  // gate: 훅이 accept true → 받아들임
  const t2 = await board({ from: CHECK, def: null });
  try {
    fs.mkdirSync(path.join(t2.dir, '.atrium', 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(t2.dir, '.atrium', 'hooks', 'gate.mjs'), "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const i=JSON.parse(s);process.stdout.write(JSON.stringify({action:'pass',accept:i.result==='ok'}));});\n");
    const f = path.join(t2.dir, '.atrium', 'rig.json'); fs.writeFileSync(f, JSON.stringify(mk('gate', true), null, 2)); const tt = new Date(Date.now() + 5000); fs.utimesSync(f, tt, tt);
    assert.ok(t2.b.rig.read(t2.ws.key).def.hooks.length === 1, t2.b.rig.read(t2.ws.key).invalid);
    const a = await once(t2, 'w2.md');
    assert.equal(a.state, 'accepted'); assert.equal(a.stateWhy, 'gate');
    assert.equal(ledger(t2.b, t2.ws.key, { kinds: ['artifact_accepted'] })[0].actor, 'hook');
    assert.equal(parseHookOutput('{"accept":["reports/a.md"]}').out.accept[0], 'reports/a.md'); assert.equal(parseHookOutput('{"accept":"yes"}').ok, false);
  } finally { await t2.stop(); }
  // gate인데 훅 판정이 없으면 새것 + 경고
  const t3 = await board({ from: CHECK, def: mk('gate') });
  try {
    const a = await once(t3, 'w3.md');
    assert.equal(a.state, 'new');
    const w = ledger(t3.b, t3.ws.key, { kinds: ['artifact_warning'] }); assert.equal(w.length, 1); assert.equal(w[0].value, 'gate_none');
  } finally { await t3.stop(); }
});

// ---------- 판: 워크트리 산출물 ----------
test('P224 워크트리 산출물: pending_merge(브랜치)로 적고, 합치면 new → 회가 끝났으면 accepted, 합치지 않고 워크트리를 지우면 lost', async () => {
  const dir = tmp();
  fs.cpSync(CHECK, dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'init');
  const t = await board({ dir, from: dir });
  const { b, ws } = t;
  try {
    const mkwt = (name) => { const wt = path.join(dir, '..', `${path.basename(dir)}-${name}`); git(dir, 'worktree', 'add', '-q', '-b', name, wt); return wt; };
    const t0 = Date.now(); await t.L().tick(t0);
    const fired = await t.L().tick(t0 + 7 * DAY + 1);
    const s = t.by(fired[0].to); await until(() => s.texts.some((x) => x.includes('[Atrium 보드] 관계:')));
    const wt = mkwt('wt-a'); s.cwd = wt;
    fs.mkdirSync(path.join(wt, 'reports'), { recursive: true }); fs.writeFileSync(path.join(wt, 'reports', 'w1.md'), '# from worktree\n');
    git(wt, 'add', '-A'); git(wt, 'commit', '-q', '-m', 'report');
    const out = await U(b).doneVerb(s, { result: 'ok', text: 'report', artifacts: [path.join(wt, 'reports', 'w1.md')] });
    let a = b.store.getArtifact(out.artifacts[0].id);
    assert.equal(a.state, 'pending_merge'); assert.equal(a.branch, 'wt-a'); assert.ok(a.forkSha);
    assert.equal(b.store.getCase(fired[0].caseId).state, 'done');
    assert.equal(a.state, 'pending_merge', '회가 끝나도 합치기 전에는 받아들이지 않는다');
    const filed = ledger(b, ws.key, { kinds: ['artifact_filed'] }); assert.match(filed[0].text, /워크트리 wt-a에 있음\(합치기 전\)/); assert.equal(filed[0].data.branch, 'wt-a');
    let list = sectorsFor(b).list(ws.key); assert.equal(list.artifacts[0].branch, 'wt-a'); assert.equal(list.artifacts[0].state, 'pending_merge');
    assert.equal(await sectorsFor(b).settleWorktrees(), 0, '아직 합치지 않았다');
    git(dir, 'merge', '-q', '--no-edit', 'wt-a');
    assert.equal(await sectorsFor(b).settleWorktrees(), 1);
    a = b.store.getArtifact(a.id); assert.equal(a.state, 'accepted', '합쳐졌고 회가 끝났다');
    const m = ledger(b, ws.key, { kinds: ['artifact_merged'] }); assert.equal(m.length, 1); assert.ok(['merged', 'same_hash'].includes(m[0].value));
    // 둘째 회: 합치지 않고 워크트리를 지운다
    const fired2 = await t.L().tick(t0 + 14 * DAY + 2);
    const s2 = t.by(fired2[0].to); await until(() => s2.texts.some((x) => x.includes('[Atrium 보드] 관계:')));
    const wt2 = mkwt('wt-b'); s2.cwd = wt2;
    fs.mkdirSync(path.join(wt2, 'reports'), { recursive: true }); fs.writeFileSync(path.join(wt2, 'reports', 'w2.md'), '# lost\n');
    const out2 = await U(b).doneVerb(s2, { result: 'ok', text: 'report', artifacts: [path.join(wt2, 'reports', 'w2.md')] });
    git(dir, 'worktree', 'remove', '--force', wt2);
    assert.equal(await sectorsFor(b).settleWorktrees(), 1);
    const lost = b.store.getArtifact(out2.artifacts[0].id); assert.equal(lost.state, 'lost'); assert.equal(lost.stateWhy, 'worktree_gone');
    assert.equal(ledger(b, ws.key, { kinds: ['artifact_lost'] }).length, 1);
    // 지도 섹터 마디의 최근 산출물에 브랜치
    const map = sectorsFor(b).forMap(ws.key, b.rig.active(ws.key).def);
    assert.ok(map.sectors.reports.recent.some((x) => x.branch === 'wt-a'));
    try { git(dir, 'worktree', 'prune'); } catch {}
  } finally { await t.stop(); fs.rmSync(dir, { recursive: true, force: true }); for (const n of ['wt-a', 'wt-b']) fs.rmSync(path.join(dir, '..', `${path.basename(dir)}-${n}`), { recursive: true, force: true }); }
});
