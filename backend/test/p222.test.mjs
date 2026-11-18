// P222 단위 시험: rig 2의 R5 산출물 섹터(docs research rig2-design.md 2절, 3절 intake·keep·produces, 5절, 9절 Q3, 11.3, 11.4의 4번). 등록만.
// 섹터 정의 검사(intake·keep·produces), done --artifact 받기(섹터 안·밖, 여럿, 없음, rig 밖 세션), done 훅이 돌려준 산출물,
// 등록 행과 상태(새것·받아들임·밀려남: 같은 경로, keep 개수·기간), 장부 kind, atrium rig artifacts·rig.artifacts 거르기, rig.map 섹터 마디와 회의 산출물,
// atrium item·every 회 글의 산출물 안내, 정기 점검 견본. 가짜 판은 p221 틀(진짜 저장소·전달 대기열·Branch·Rig, 가짜 에이전트)
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
import { RIG_EVENT_KINDS } from '../src/rig-ledger.mjs';
import { RigMap } from '../src/rig-map.mjs';
import { RigDocs } from '../src/rig-docs.mjs';
import { RIG_ADMIN_OPS } from '../src/rig-admin.mjs';
import { parseKeep, resolveArtifact, hashArtifact, sectorsOf, rigSectorHandlers, ARTIFACT_STATES } from '../src/rig-sectors.mjs';
import { parseHookOutput } from '../src/hook-runner.mjs';
import { VERBS } from '../src/cli-contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(HERE, 'fixtures');
const GROW = path.join(FX, 'rig-loops-grow');
const CHECK = path.join(FX, 'rig-loops-check');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p222-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const defOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, '.atrium', 'rig.json'), 'utf8'));
const exists = (f) => { try { fs.statSync(f); return true; } catch { return false; } };
const ledger = (b, key, q = {}) => b.store.rigEvents({ ws: key, limit: 10000, ...q });
const DAY = 86400000;

// ---------- 가짜 판(p219 틀) ----------
async function board({ dir = tmp(), from = GROW, def = null, enable = true, batchMs = 40 } = {}) {
  fs.cpSync(from, dir, { recursive: true });
  if (def) { const f = path.join(dir, '.atrium', 'rig.json'); fs.writeFileSync(f, JSON.stringify(def, null, 2)); const t = new Date(Date.now() + Math.floor(Math.random() * 100000)); fs.utimesSync(f, t, t); }
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p221test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0, rigCycles: false };
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

// ---------- 정의 ----------
test('P222 섹터 정의: intake(register 기본, move·copy는 받기만), keep(개수·기간, 틀리면 거절), produces(없는 문서·sector 아님은 거절, 받지 못하는 섹터는 경고)', () => {
  assert.deepEqual(parseKeep(12), { count: 12 });
  assert.deepEqual(parseKeep('5'), { count: 5 });
  assert.deepEqual(parseKeep('90d'), { ms: 90 * DAY, text: '90d' });
  assert.equal(parseKeep(null), null);
  for (const b of [0, -1, 1.5, 'forever', '0d', {}]) assert.ok(parseKeep(b).bad, String(b));
  const ok = validateRig(defOf(CHECK), { root: CHECK, exists });
  assert.ok(ok.ok, ok.reason);
  assert.equal(ok.def.docs.reports.intake, 'register'); assert.deepEqual(ok.def.docs.reports.keepRule, { count: 12 }); assert.equal(ok.def.docs.reports.dir, true);
  assert.deepEqual(ok.def.loops.check.produces, ['reports']);
  assert.ok(!ok.def.warnings.some((w) => /R5/.test(w)), ok.def.warnings.join(' | '));
  assert.deepEqual(sectorsOf(ok.def).map((s) => [s.name, s.rel, s.intake]), [['reports', 'reports/', 'register']]);
  const v = (f) => { const raw = defOf(CHECK); f(raw); return validateRig(raw, { root: CHECK, exists }); };
  assert.match(v((x) => { x.docs.reports.keep = 'forever'; }).reason, /keep은 개수/);
  assert.match(v((x) => { x.docs.reports.keep = 0; }).reason, /keep은 개수/);
  assert.match(v((x) => { x.docs.reports.intake = 'link'; }).reason, /intake는 register, move, copy/);
  assert.match(v((x) => { x.docs['check-log'].keep = 3; }).reason, /intake·keep은 role "sector"/);
  assert.match(v((x) => { x.loops.check.produces = ['nope']; }).reason, /produces에 docs에 없는 문서/);
  assert.match(v((x) => { x.loops.check.produces = ['check-log']; }).reason, /produces는 role "sector"/);
  const mv = v((x) => { x.docs.reports.intake = 'move'; x.docs.reports.keep = '30d'; });
  assert.ok(mv.ok, mv.reason); assert.ok(mv.def.warnings.some((w) => /intake "move"는 아직 안 된다/.test(w)));
  assert.deepEqual(mv.def.docs.reports.keepRule, { ms: 30 * DAY, text: '30d' });
  const ow = v((x) => { x.docs.out = { path: '{owns}', role: 'sector' }; x.loops.check.produces = ['reports', 'out']; });
  assert.ok(ow.ok, ow.reason);
  assert.ok(ow.def.warnings.some((w) => /경로 "\{owns\}"인 섹터는/.test(w)) && ow.def.warnings.some((w) => /produces의 out는 아직 산출물을 받지 못하는 섹터/.test(w)));
  const fl = v((x) => { x.docs.reports.path = 'reports'; });
  assert.ok(fl.ok); assert.ok(fl.def.warnings.some((w) => /폴더로 읽는다\(reports\/\)/.test(w))); assert.equal(sectorsOf(fl.def)[0].rel, 'reports/');
});

test('P222 경로 판정(resolveArtifact): 섹터 폴더 안만, 가장 깊은 섹터, 워크스페이스 밖·섹터 밖·없는 파일은 까닭과 섹터 경로, 폴더 산출물의 해시', () => {
  const dir = tmp();
  try {
    const raw = { version: 2, docs: { out: { path: 'out/', role: 'sector' }, deep: { path: 'out/deep/', role: 'sector' }, notes: { path: 'notes.txt', role: 'canon' } }, seats: { a: { launcher: 'claude', session: 'fresh' } }, loops: { w: { kind: 'work', trigger: { every: '1d' }, entry: 'a', produces: ['out'] } } };
    const r = validateRig(raw, { root: dir, exists }); assert.ok(r.ok, r.reason);
    put(dir, 'out/a.md', 'a'); put(dir, 'out/deep/b.md', 'bb'); put(dir, 'notes.txt', 'n'); put(dir, 'out/site/index.html', '<p>');
    const a = resolveArtifact(r.def, dir, 'out/a.md'); assert.ok(a.ok); assert.equal(a.sector, 'out'); assert.equal(a.rel, 'out/a.md'); assert.equal(a.dir, false);
    const d = resolveArtifact(r.def, dir, path.join(dir, 'out', 'deep', 'b.md')); assert.equal(d.sector, 'deep', '가장 깊은 섹터');
    const site = resolveArtifact(r.def, dir, 'out/site'); assert.ok(site.ok); assert.equal(site.dir, true);
    assert.match(resolveArtifact(r.def, dir, 'notes.txt').reason, /섹터 폴더 밖이다.*out\(out\/\)/);
    assert.match(resolveArtifact(r.def, dir, 'out').reason, /섹터 폴더 밖/, '섹터 폴더 자체는 산출물이 아니다');
    assert.match(resolveArtifact(r.def, dir, path.join(os.tmpdir(), 'x.md')).reason, /워크스페이스 밖/);
    assert.match(resolveArtifact(r.def, dir, 'out/none.md').reason, /파일이 없다/);
    // 워크트리(세션 폴더)의 같은 섹터 경로
    const wt = tmp(); put(wt, 'out/c.md', 'c');
    const w = resolveArtifact(r.def, dir, path.join(wt, 'out', 'c.md'), { cwd: wt }); assert.ok(w.ok, w.reason); assert.equal(w.rel, 'out/c.md');
    fs.rmSync(wt, { recursive: true, force: true });
    const h1 = hashArtifact(path.join(dir, 'out/a.md'), false);
    assert.equal(h1.sha256, crypto.createHash('sha256').update('a').digest('hex')); assert.equal(h1.size, 1);
    const h2 = hashArtifact(path.join(dir, 'out/site'), true); put(dir, 'out/site/index.html', '<p>x');
    assert.notEqual(hashArtifact(path.join(dir, 'out/site'), true).sha256, h2.sha256, '폴더 해시는 안의 내용을 따른다');
    // 훅 출력의 artifacts
    assert.deepEqual(parseHookOutput('{"artifacts":["out/a.md"]}').out.artifacts, ['out/a.md']);
    assert.equal(parseHookOutput('{"artifacts":"out/a.md"}').ok, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------- 판: 내기·등록 ----------
test('P222 정기 점검 견본: 자리가 보고서를 섹터에 낸다(--artifact) → 등록 행(새것), artifact_filed, 회가 끝나면 받아들임. 회 글과 atrium item이 산출물 섹터를 알린다', async () => {
  const t = await board({ from: CHECK });
  const { b, ws, dir } = t;
  try {
    const t0 = Date.now();
    await t.L().tick(t0);
    const { s, caseId } = await runOnce(t, t0 + 7 * DAY + 1);
    const first = s.texts.find((x) => x.includes('[Atrium 보드] 관계:'));
    assert.match(first, /--artifact reports\//); assert.match(first, /산출물 섹터: reports\(reports\/\)/);
    const item = U(b).item(s); assert.deepEqual(item.item.produces, [{ name: 'reports', path: 'reports/' }]);
    const f = put(dir, 'reports/2026-w47.md', '# Weekly check\n- CI: green\n');
    const out = await U(b).doneVerb(s, { result: 'ok', text: 'weekly check written', artifacts: [f] });
    assert.equal(out.artifacts.length, 1);
    assert.equal(out.artifacts[0].path, 'reports/2026-w47.md'); assert.equal(out.artifacts[0].sector, 'reports');
    assert.equal(out.artifacts[0].sha256, crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'));
    const rows = b.store.artifacts({ ws: ws.key, limit: 10 });
    assert.equal(rows.length, 1);
    const a = rows[0];
    assert.equal(a.loop, 'check'); assert.equal(a.caseId, caseId); assert.equal(a.seat, 'checker'); assert.equal(a.sessionId, s.sessionId); assert.equal(a.source, 'agent');
    assert.ok(a.unitId && a.tryId && a.t > 0 && a.size > 0);
    assert.equal(b.store.getCase(caseId).state, 'done');
    assert.equal(a.state, 'accepted', '회가 done으로 닫혀 받아들임'); assert.equal(a.stateWhy, 'run_done');
    const filed = ledger(b, ws.key, { kinds: ['artifact_filed'] });
    assert.equal(filed.length, 1); assert.equal(filed[0].value, 'reports'); assert.equal(filed[0].caseId, caseId); assert.equal(filed[0].data.path, 'reports/2026-w47.md'); assert.equal(filed[0].data.loop, 'check'); assert.equal(filed[0].ref, String(a.id));
    assert.equal(ledger(b, ws.key, { kinds: ['artifact_accepted'] }).length, 1);
    assert.equal(ledger(b, ws.key, { kinds: ['artifact_warning'] }).length, 0);
    // 장부 차례: done → artifact_filed → case_done → artifact_accepted
    const ks = ledger(b, ws.key, { caseIds: [caseId] }).map((r) => r.kind).filter((k) => ['done', 'artifact_filed', 'case_done', 'artifact_accepted'].includes(k));
    assert.deepEqual(ks, ['done', 'artifact_filed', 'case_done', 'artifact_accepted']);
  } finally { await t.stop(); }
});

test('P222 --artifact 받기: 섹터 밖·없는 파일은 거절(일은 열린 채, 섹터 경로를 알림), 여럿은 모두, 없이 닫으면 produces 고리에 경고 한 줄, rig 밖 세션은 거절', async () => {
  const t = await board({ from: CHECK });
  const { b, ws, dir } = t;
  try {
    const t0 = Date.now();
    await t.L().tick(t0);
    const { s, caseId } = await runOnce(t, t0 + 7 * DAY + 1);
    const ledgerFile = path.join(dir, 'ledger', 'checks.jsonl');
    await assert.rejects(U(b).doneVerb(s, { result: 'ok', text: 'x', artifacts: [ledgerFile] }), (e) => e.code === 'bad_request' && /섹터 폴더 밖이다.*reports\(reports\/\)/.test(e.message) && e.sectors[0].path === 'reports/');
    await assert.rejects(U(b).doneVerb(s, { result: 'ok', text: 'x', artifacts: [path.join(dir, 'reports', 'none.md')] }), /파일이 없다/);
    assert.ok(b.store.openTryOf(s.sessionId), '거절이면 일은 열린 채');
    assert.equal(b.store.artifacts({ ws: ws.key }).length, 0);
    // 여럿: 하나라도 틀리면 아무것도 적지 않는다
    const f1 = put(dir, 'reports/a.md', 'a'); const f2 = put(dir, 'reports/b.md', 'b');
    await assert.rejects(U(b).doneVerb(s, { result: 'ok', text: 'x', artifacts: [f1, ledgerFile] }), /섹터 폴더 밖/);
    assert.equal(b.store.artifacts({ ws: ws.key }).length, 0);
    const out = await U(b).doneVerb(s, { result: 'ok', text: 'two', artifacts: [f1, f2, f1] });
    assert.deepEqual(out.artifacts.map((x) => x.path).sort(), ['reports/a.md', 'reports/b.md'], '같은 경로는 한 번');
    assert.equal(ledger(b, ws.key, { kinds: ['artifact_filed'] }).length, 2);
    assert.equal(b.store.getCase(caseId).state, 'done');
    // 없이 닫은 회: produces 고리라 경고 한 줄
    const r2 = await runOnce(t, t0 + 14 * DAY + 2);
    const o2 = await U(b).doneVerb(r2.s, { result: 'ok', text: 'nothing this week' });
    assert.equal(o2.artifacts, undefined);
    const warn = ledger(b, ws.key, { kinds: ['artifact_warning'] });
    assert.equal(warn.length, 1); assert.equal(warn[0].value, 'produces_none'); assert.equal(warn[0].caseId, r2.caseId); assert.deepEqual(warn[0].data.produces, ['reports']);
    // rig 밖 세션(자리 없음)
    const loose = t.add('loose');
    await assert.rejects(Promise.resolve().then(() => b.rigSectors.check(loose, [f1])), (e) => e.code === 'bad_request' && /rig 자리가 아니다/.test(e.message));
  } finally { await t.stop(); }
});

test('P222 등록 상태: 같은 경로를 다시 내면 앞 줄은 밀려남(same_path), keep 개수를 넘으면 밀려남(keep, 파일은 그대로), 기간 keep은 읽을 때 밀어낸다', async () => {
  const def = defOf(CHECK); def.docs.reports.keep = 2;
  const t = await board({ from: CHECK, def });
  const { b, ws, dir } = t;
  try {
    const t0 = Date.now();
    await t.L().tick(t0);
    let at = t0 + 7 * DAY + 1;
    const ids = [];
    for (const name of ['w1.md', 'w2.md', 'w1.md', 'w3.md']) {
      const { s } = await runOnce(t, at);
      const f = put(dir, `reports/${name}`, `${name} ${at}`);
      const o = await U(b).doneVerb(s, { result: 'ok', text: name, artifacts: [f] });
      ids.push(o.artifacts[0].id);
      at += 7 * DAY + 1;
    }
    const byId = (id) => b.store.getArtifact(id);
    assert.equal(byId(ids[0]).state, 'superseded'); assert.equal(byId(ids[0]).stateWhy, 'same_path'); assert.equal(byId(ids[0]).supersededBy, ids[2]);
    assert.equal(byId(ids[1]).state, 'superseded'); assert.equal(byId(ids[1]).stateWhy, 'keep', 'keep 2: w1(새)·w3만 산다');
    assert.equal(byId(ids[2]).state, 'accepted'); assert.equal(byId(ids[3]).state, 'accepted');
    assert.ok(exists(path.join(dir, 'reports', 'w2.md')), 'keep은 파일을 지우지 않는다');
    const sup = ledger(b, ws.key, { kinds: ['artifact_superseded'] });
    assert.deepEqual(sup.map((r) => r.value), ['same_path', 'keep']);
    assert.equal(sup[1].data.keep, 2);
    assert.deepEqual(ARTIFACT_STATES, ['new', 'accepted', 'superseded']);
    // 기간 keep: 정의를 1d로 바꾸고 읽으면 하루 넘은 것을 밀어낸다
    const d2 = defOf(dir); d2.docs.reports.keep = '1d'; fs.writeFileSync(path.join(dir, '.atrium', 'rig.json'), JSON.stringify(d2, null, 2));
    b.store.db.prepare('UPDATE rig_artifacts SET t = ? WHERE id = ?').run(Date.now() - 2 * DAY, ids[2]);
    const l = b.branch.rigAdmin.artifacts(ws.key, {});
    assert.equal(b.store.getArtifact(ids[2]).state, 'superseded'); assert.equal(b.store.getArtifact(ids[2]).stateWhy, 'keep');
    assert.equal(b.store.getArtifact(ids[3]).state, 'accepted');
    assert.equal(l.sectors[0].keep, '1d'); assert.equal(l.sectors[0].live, 1);
  } finally { await t.stop(); }
});

test('P222 done 훅이 돌려준 산출물도 받는다(source hook), 틀린 경로는 거절하지 않고 artifact_warning(hook_path)', async () => {
  const def = defOf(CHECK);
  def.hooks = [{ at: 'done', run: ['node', '.atrium/hooks/file-report.mjs'] }];
  const t = await board({ from: CHECK, def });
  const { b, ws, dir } = t;
  try {
    put(dir, '.atrium/hooks/file-report.mjs', "process.stdout.write(JSON.stringify({ action: 'pass', artifacts: ['reports/from-hook.md', 'ledger/checks.jsonl'] }));\n");
    put(dir, 'reports/from-hook.md', 'h');
    const t0 = Date.now();
    await t.L().tick(t0);
    const { s, caseId } = await runOnce(t, t0 + 7 * DAY + 1);
    const out = await U(b).doneVerb(s, { result: 'ok', text: 'hooked' });
    assert.deepEqual(out.artifacts.map((x) => x.path), ['reports/from-hook.md']);
    const a = b.store.artifacts({ ws: ws.key })[0]; assert.equal(a.source, 'hook'); assert.equal(a.caseId, caseId);
    const f = ledger(b, ws.key, { kinds: ['artifact_filed'] }); assert.equal(f[0].actor, 'hook');
    const w = ledger(b, ws.key, { kinds: ['artifact_warning'] }); assert.equal(w.length, 1); assert.equal(w[0].value, 'hook_path'); assert.match(w[0].text, /섹터 폴더 밖/);
  } finally { await t.stop(); }
});

// ---------- 읽기 ----------
test('P222 atrium rig artifacts(어느 세션이든 읽기)·rig.artifacts: 섹터·회로 거르기, 모르는 섹터·회는 not_found. rig.map 섹터 마디(최근·수·+n)와 회의 산출물', async () => {
  const t = await board({ from: CHECK });
  const { b, ws, dir } = t;
  try {
    const t0 = Date.now();
    await t.L().tick(t0);
    const runs = [];
    let at = t0 + 7 * DAY + 1;
    for (let i = 0; i < 2; i++) {
      const { s, caseId } = await runOnce(t, at);
      const fs1 = [0, 1, 2].map((j) => put(dir, `reports/r${i}-${j}.md`, `${i}${j}`));
      await U(b).doneVerb(s, { result: 'ok', text: 'r', artifacts: fs1 });
      runs.push(caseId); at += 7 * DAY + 1;
    }
    const loose = t.add('reader');
    const all = await b.branch.rigAdmin.verb(loose, { op: 'artifacts' });
    assert.equal(all.artifacts.length, 6); assert.equal(all.sectors[0].name, 'reports'); assert.equal(all.sectors[0].live, 6); assert.equal(all.sectors[0].keep, 12);
    assert.ok(all.artifacts.every((x) => x.exists === true && x.sessionName));
    assert.ok(all.artifacts[0].id > all.artifacts[5].id, '최근 것부터');
    const one = await b.branch.rigAdmin.verb(loose, { op: 'artifacts', run: runs[0] });
    assert.equal(one.artifacts.length, 3); assert.ok(one.artifacts.every((x) => x.caseId === runs[0]));
    assert.equal((await b.branch.rigAdmin.verb(loose, { op: 'artifacts', sector: 'reports', limit: 2 })).more, true);
    await assert.rejects(b.branch.rigAdmin.verb(loose, { op: 'artifacts', sector: 'nope' }), (e) => e.code === 'not_found' && /섹터: reports/.test(e.message));
    await assert.rejects(b.branch.rigAdmin.verb(loose, { op: 'artifacts', run: 'c-none' }), (e) => e.code === 'not_found');
    assert.ok(RIG_ADMIN_OPS.includes('artifacts'));
    const h = rigSectorHandlers(b);
    assert.equal((await h['rig.artifacts']({ workspace: ws.key, case: runs[1] }, local)).artifacts.length, 3);
    // 지도
    const map = new RigMap(b).get(ws.key, { caseId: runs[1] });
    const node = map.def.nodes.find((n) => n.id === 'doc:reports');
    assert.equal(node.meta.role, 'sector');
    assert.equal(node.meta.artifacts.live, 6); assert.equal(node.meta.artifacts.recent.length, 3); assert.equal(node.meta.artifacts.more, 3);
    assert.deepEqual(node.meta.artifacts.recent.map((x) => x.path), ['reports/r1-2.md', 'reports/r1-1.md', 'reports/r1-0.md']);
    assert.equal(map.overlay.case, runs[1]); assert.equal(map.overlay.artifacts.length, 3); assert.ok(map.overlay.artifacts.every((x) => x.caseId === runs[1]));
    assert.equal(map.cases.find((c) => c.id === runs[0]).artifacts, 3);
    assert.equal(new RigMap(b).get(ws.key).def.nodes.find((n) => n.id === 'doc:check-log').meta.artifacts, undefined, '섹터가 아닌 문서에는 싣지 않는다');
  } finally { await t.stop(); }
});

test('P222 장부 kind와 계약: 산출물 kind가 닫힌 목록에, done에 --artifact, rig 동사에 artifacts', () => {
  for (const k of ['artifact_filed', 'artifact_superseded', 'artifact_accepted', 'artifact_warning']) assert.ok(RIG_EVENT_KINDS.includes(k), k);
  const done = VERBS.find((v) => v.name === 'done'); assert.ok(done.args.some((a) => /--artifact/.test(a))); assert.ok(done.out.includes('artifacts'));
  const rig = VERBS.find((v) => v.name === 'rig'); assert.ok(rig.args.some((a) => /artifacts \[--sector/.test(a)));
  const src = fs.readFileSync(path.join(HERE, '..', 'bin', 'atrium-child.mjs'), 'utf8');
  assert.match(src, /MULTI = new Set\(\['artifact'\]\)/);
});
