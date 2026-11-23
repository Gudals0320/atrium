// P321 단위 시험: 빠른 워크트리 세션(worktree-session.mjs, worktree-names.mjs)과 병합 맡기기(merge.request → work-units done → merger).
// p267 시험의 가짜 판(진짜 저장소·전달 대기열·Branch·진짜 git)을 쓴다. herdr·hc와 claude 없이 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { promptTask } from '../src/text.mjs';
import { WorktreeSessions, autoName, nameFromPrompt, launchPlan, quickHeader, mergeRequestHeader, mergeRequestSpec, wtBranch, wtDir, WT_NAME_RE, humanCardQuestion, whyText } from '../src/worktree-session.mjs';

const tmp = (p = 'mtask-p321-') => fs.mkdtempSync(path.join(os.tmpdir(), p));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const G = (dir, ...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', windowsHide: true }).trim();

// ---------- 시험 저장소: 합칠 브랜치 dev가 본 체크아웃에 걸려 있다. 하위마다 워크트리와 커밋 ----------
function repo() {
  const dir = tmp();
  G(dir, 'init', '-q', '-b', 'dev');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  G(dir, 'add', '.'); G(dir, 'commit', '-q', '-m', 'init');
  return dir;
}
function worktree(dir, name, { commit = true, file = name + '.txt', text = name + '\n' } = {}) {
  const wt = path.join(dir, '.claude', 'worktrees', name);
  G(dir, 'worktree', 'add', '-q', '-b', 'worktree-' + name, wt, 'dev');
  if (commit) { fs.writeFileSync(path.join(wt, file), text); G(wt, 'add', '.'); G(wt, 'commit', '-q', '-m', 'work ' + name); }
  return wt;
}

// ---------- 가짜 판(p180 시험의 틀 + 잠재우기·끄기·띄우기) ----------
async function board({ dir = repo(), settings = { mergerMode: 'on' }, jobs, spawnFail = false, trust = true } = {}) {
  const trustDirs = trust ? [dir] : [];
  const store = new Store(path.join(tmp('mtask-p321db-'), 'board.db'));
  const ws = await workspaceOf(dir);
  try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p321test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const events = [];
  const b = {
    cfg, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), spawned: [], killed: [], slept: [], events,
    api: { broadcast: (e, v) => events.push([e, v]) }, log: () => {}, requireTerminal: () => {},
    adapter: { backend: 'hc', connected: true, readScreen: async () => '', agentKinds: async () => [{ kind: 'claude' }, { kind: 'codex' }] },
    hooked: (s) => s.rt.hooked !== false,
    summary: (s) => { const d = deriveState(s.rt); return { state: s.rt.sleep ? 'sleeping' : d.state, ask: d.ask || null, error: d.error || null }; },
    ensureLink(from, to, patch = {}) {
      let l = store.linkByPair(from, to);
      if (!l) { l = { linkId: 'l' + crypto.randomBytes(4).toString('hex'), from, to, role: patch.role ?? null, spawned: !!patch.spawned, observed: !!patch.observed, createdAt: Date.now() }; store.insertLink(l); }
      return store.getLink(l.linkId);
    },
    linkEvent(l, kind, text = null, data = null) { return store.addLinkEvent(l.linkId, kind, text, data); },
    broadcastSession(s) { if (b.sessions.has(s.sessionId)) b.bus.emit('session', s, b.summary(s)); },
    async resolveWorkspace(ref) { return { key: ref || ws.key }; },
    async spawn(p) {
      if (spawnFail) throw Object.assign(new Error('터미널 없음'), { code: 'terminal_down' });
      const s = add(p.name, { cwd: p.cwd, kind: p.kind || 'claude', model: p.model || null, effort: p.effort || null, permissionMode: p.permissionMode || 'manual' });
      b.spawned.push(p);
      if (b.onSpawn) b.onSpawn(s, p);
      return { sessionId: s.sessionId, trust: { needsTrust: false } };
    },
    async kill(p) {
      const s = b.sessions.get(p.session);
      if (!s) throw Object.assign(new Error('없음'), { code: 'not_found' });
      b.killed.push({ name: s.name, after: p.after || null });
      b.closeSession(s, 'killed');
      return { closed: true, name: s.name, ...(p.after === 'archive' ? { after: { archived: true } } : {}) };
    },
    sleeper: { going: new Map(), wakes: new Map(), async wakeFor(s) { s.rt.sleep = null; b.broadcastSession(s); return { awake: true }; }, async sleep(s, o) { b.slept.push({ name: s.name, ...o }); s.rt.sleep = { at: Date.now(), by: o.by }; b.broadcastSession(s); return { slept: true }; } },
    closeSession(s, reason) { b.sessions.delete(s.sessionId); store.updateSession(s.sessionId, { closedAt: Date.now() }); b.bus.emit('closed', s, reason); },
  };
  b.queue = new DeliveryQueue({
    store, cfg,
    view: (sid) => { const s = b.sessions.get(sid); if (!s) return { closed: true }; return { state: deriveState(s.rt).state, agentPresent: s.rt.term.present, termConnected: true, lastUserInputAt: 0, closed: false, kind: s.kind, hooked: b.hooked(s) }; },
    send: async (sid, text) => { if (b.stopped) return; const s = b.sessions.get(sid); if (s && s.rt.sleep) { s.rt.sleep = null; } if (s && s.agent) setTimeout(() => s.agent(text), 5); },
  });
  b.queue.start();
  b.resolve = (ref) => { const s = [...b.sessions.values()].find((x) => x.sessionId === ref || x.name === ref); if (!s) throw Object.assign(new Error('없음'), { code: 'not_found' }); return s; };
  b.cfg.claudeJson = path.join(tmp('mtask-p321cj-'), 'claude.json');
  fs.writeFileSync(b.cfg.claudeJson, JSON.stringify({ projects: trustDirs.reduce((o, d) => ({ ...o, [path.resolve(d).split(path.sep).join('/')]: { hasTrustDialogAccepted: true } }), {}) }));
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20, verbs: { pollMs: 15, settleMs: 800, turnGraceMs: 300, answerGraceMs: 200 }, merger: { settings: () => settings, sleepDelayMs: 10, ...(jobs ? { jobs } : {}) } });
  b.wtSessions = new WorktreeSessions(b, { trustWaitMs: 50 });
  b.queue.on('delivery', (d) => { if (['confirmed', 'unconfirmed', 'failed', 'cancelled'].includes(d.status)) b.branch.onDeliveryEnd(d); });
  const add = (name, { kind = 'claude', hooked = kind === 'claude', workMs = 40, onText = null, cwd = dir, ...extra } = {}) => {
    const s = { sessionId: crypto.randomUUID(), name, cwd, paneId: name + ':p1', agentName: name, permissionMode: 'manual', kind, origin: 'board', parentSessionId: null, workspaceKey: ws.key, rt: newRuntime({ kind, hooked }), createdAt: Date.now(), ...extra };
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
        if (hooked) applyHook(s.rt, { hook_event_name: 'Stop', last_assistant_message: '답' });
        applyTermStatus(s.rt, 'idle');
        b.broadcastSession(s);
      }, s.workMs ?? workMs);
    };
    b.broadcastSession(s);
    return s;
  };
  const M = () => b.branch.merger;
  const U = () => b.branch.units;
  const worker = (name, wt, { parent, result = 'ok', text = null, kind = 'claude' } = {}) => add(name, { cwd: wt, kind, parentSessionId: parent.sessionId, onText: async (t, s) => { if (t.includes('맡긴 일 u')) s.doneOut = await U().doneVerb(s, { result, text: text || name + ': 브랜치 worktree-' + name + ' 끝냄; 시험 통과' }); } });
  const mergerAct = (act) => { b.onSpawn = (s) => { s.onText = async (t, x) => { const m = /합치는 일 (u[0-9a-f]+)/.exec(t); if (!m) return; const u = b.store.getUnit(m[1]); const [r, txt] = await act(u, x); x.mergeOut = x.mergeOut || []; x.mergeOut.push(await U().doneVerb(x, { result: r, text: txt })); }; }; };
  // P290: 병합 정리 알림(merger가 닫힐 때)은 따로 본다(sumS)
  const isSum = (d) => /^\[Atrium 보드\] 병합 정리: /.test(d.text);
  const toS = (s) => store.db.prepare('SELECT * FROM deliveries WHERE session_id = ?').all(s.sessionId).filter((d) => !isSum(d));
  const sumS = (s) => store.db.prepare('SELECT * FROM deliveries WHERE session_id = ?').all(s.sessionId).filter(isSum);
  const stop = async () => { b.stopped = true; b.queue.stop(); b.branch.notices.stop(); U().stops.stop(); await tick(200); store.close(); };
  return { b, dir, ws, add, worker, mergerAct, M, U, toS, sumS, stop, events };
}
const assign = async (b, lead, name) => { await b.branch.verbs.prompt(lead, { name, text: name + '의 일: 고쳐라' }); };

const norm = (p) => path.resolve(p).toLowerCase();

test('P321 이름: 자동 이름 wt-<월일>-<a…z>, 겹치면 다음 글자, 첫 지시의 영문 낱말로 짓기', () => {
  const d = new Date(2026, 10, 23);
  assert.equal(autoName(d, []), 'wt-1123-a');
  assert.equal(autoName(d, ['wt-1123-a', 'WT-1123-B']), 'wt-1123-c');
  const all = 'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => 'wt-1123-' + c);
  assert.equal(autoName(d, all), 'wt-1123-27');
  assert.equal(nameFromPrompt('Login bug 고치기'), 'login-bug');
  assert.equal(nameFromPrompt('fix the search results page now'), 'fix-the-search');
  assert.equal(nameFromPrompt('로그인 버그'), null);
  assert.equal(nameFromPrompt('2 bugs'), 'wt-2-bugs');
  assert.equal(nameFromPrompt(''), null);
  for (const n of ['wt-1123-a', 'login-bug', 'a']) assert.ok(WT_NAME_RE.test(n), n);
  for (const n of ['Login', '1abc', 'a_b', 'a'.repeat(33), '']) assert.ok(!WT_NAME_RE.test(n), n);
});

test('P321 띄우는 길: Claude Code는 claude -w, 다른 하네스는 git worktree add -b worktree-<이름> <리포>/.claude/worktrees/<이름> <기준>', () => {
  const root = path.resolve('/repo/x');
  assert.deepEqual(launchPlan({ kind: 'claude', root, name: 'a1' }), { via: 'claude-w', cwd: root, worktree: 'a1' });
  const p = launchPlan({ kind: 'codex', root, name: 'a1', base: 'dev' });
  assert.equal(p.via, 'git');
  assert.equal(p.cwd, path.join(root, '.claude', 'worktrees', 'a1'));
  assert.deepEqual(p.git, ['-C', root, 'worktree', 'add', '-b', 'worktree-a1', path.join(root, '.claude', 'worktrees', 'a1'), 'dev']);
  assert.equal(launchPlan({ kind: 'pi', root, name: 'b' }).git[7], 'HEAD');
  assert.equal(wtBranch('a1'), 'worktree-a1');
});

test('P321 머리: 첫 지시 앞 판 줄 둘(관계 동료/독립, 끝내는 법)은 카드의 지시에서 떨어지고 병합 맡기기 머리도 같다', () => {
  const h = quickHeader({ head: 'lead', name: 'a1' });
  const lines = h.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^\[Atrium 보드\] 관계: 너는 @lead의 동료다/);
  assert.match(lines[1], /브랜치 worktree-a1/);
  assert.equal(promptTask(h + '\n\n고쳐라'), '고쳐라');
  assert.match(quickHeader({ name: 'a1' }), /^\[Atrium 보드\] 관계: 너는 사람이 판에서 띄운 워크트리 세션이다/);
  const m = mergeRequestHeader({ unitId: 'u1', head: null, kind: 'codex' });
  assert.equal(m.split('\n').length, 3);
  assert.match(m, /보고는 사람/); assert.match(m, /atrium done ok --file/);
  assert.match(mergeRequestHeader({ unitId: 'u1', head: 'lead' }), /보고는 @lead/);
  assert.equal(promptTask(m + '\n\n' + mergeRequestSpec({ branch: 'worktree-a1', tip: 'abcdef1234', ahead: 2, dirty: 0, target: 'dev' })).split('\n')[0], '병합 맡기기: worktree-a1 → dev');
  assert.match(humanCardQuestion({ name: 'a1', kind: 'merge_failed', line: '충돌' }), /^@a1 병합 실패: 충돌$/);
  assert.equal(whyText('no_commits'), '합칠 브랜치보다 앞선 커밋이 없다');
});

test('P321 session.worktree: 다른 하네스는 판이 git worktree add 뒤 그 폴더에서, Claude Code는 리포 뿌리에서 -w로, 동료 잇기, 이름 겹침·커밋 없음 거절', async () => {
  const { b, dir, ws, add, stop } = await board();
  try {
    const lead = add('lead');
    const r = await b.wtSessions.create({ workspace: ws.key, name: 'cx1', kind: 'codex', peerOf: lead.sessionId, prompt: 'fix it' });
    const sp = b.spawned.at(-1);
    assert.equal(norm(sp.cwd), norm(wtDir(dir, 'cx1')));
    assert.equal(sp.kind, 'codex'); assert.equal(sp.worktree, undefined);
    assert.match(sp.prompt, /^\[Atrium 보드\] 관계: 너는 @lead의 동료다[\s\S]*\n\nfix it$/);
    assert.ok(fs.existsSync(wtDir(dir, 'cx1')));
    assert.equal(G(wtDir(dir, 'cx1'), 'rev-parse', '--abbrev-ref', 'HEAD'), 'worktree-cx1');
    assert.equal(r.worktree.via, 'git'); assert.equal(r.worktree.base, 'dev'); assert.equal(r.peer, 'lead');
    const s = b.sessions.get(r.sessionId);
    assert.deepEqual(b.branch.relIndex().peersOf(s.sessionId).map((p) => p.id), [lead.sessionId]);
    assert.equal(b.branch.relIndex().workParentOf(s.sessionId), null, '일 상위 없음');
    const r2 = await b.wtSessions.create({ workspace: ws.key, name: 'cl1', kind: 'claude' });
    const sp2 = b.spawned.at(-1);
    assert.equal(norm(sp2.cwd), norm(dir)); assert.equal(sp2.worktree, 'cl1'); assert.equal(sp2.prompt, undefined, '첫 지시를 비우면 띄우기만');
    assert.equal(r2.worktree.gate, false); assert.equal(r2.peer, null);
    // claude -w가 워크트리를 만들면 hook 전에도 그 폴더를 세션의 폴더로 본다
    const s2 = b.sessions.get(r2.sessionId);
    fs.mkdirSync(wtDir(dir, 'cl1'), { recursive: true }); fs.writeFileSync(path.join(wtDir(dir, 'cl1'), '.git'), 'gitdir: x\n');
    await until(() => s2.rt.cwd && norm(s2.rt.cwd) === norm(wtDir(dir, 'cl1')), 5000);
    await assert.rejects(b.wtSessions.create({ workspace: ws.key, name: 'cx1', kind: 'codex' }), (e) => e.code === 'name_taken');
    await assert.rejects(b.wtSessions.create({ workspace: ws.key, name: 'Bad_Name', kind: 'codex' }), (e) => e.code === 'bad_request');
    G(dir, 'branch', 'worktree-taken');
    await assert.rejects(b.wtSessions.create({ workspace: ws.key, name: 'taken', kind: 'codex' }), (e) => e.code === 'name_taken' && e.why === 'branch_exists');
    const pv = await b.wtSessions.preview({ workspace: ws.key });
    assert.equal(pv.repo, true); assert.match(pv.name, /^wt-\d{4}-[a-z]$/); assert.equal(pv.problem, null); assert.equal(pv.branch, 'worktree-' + pv.name); assert.equal(pv.base, 'dev');
  } finally { await stop(); }
});

test('P321 session.worktree: 띄우기가 실패하면 판이 만든 워크트리와 브랜치를 지운다, 커밋 없는 리포는 needs_commit', async () => {
  const { b, dir, ws, stop } = await board({ spawnFail: true });
  try {
    await assert.rejects(b.wtSessions.create({ workspace: ws.key, name: 'gone', kind: 'codex' }), (e) => e.code === 'terminal_down');
    assert.ok(!fs.existsSync(wtDir(dir, 'gone')));
    assert.equal(G(dir, 'branch', '--list', 'worktree-gone'), '');
  } finally { await stop(); }
  const empty = tmp(); G(empty, 'init', '-q', '-b', 'dev');
  const x = await board({ dir: empty });
  try { await assert.rejects(x.b.wtSessions.create({ workspace: x.ws.key, name: 'n1', kind: 'codex' }), (e) => e.code === 'needs_commit'); } finally { await x.stop(); }
});

test('P321 신뢰 관문: 신뢰 안 받은 리포의 Claude Code는 리포 뿌리에서 -w 없이 띄우고 첫 지시를 붙잡는다', async () => {
  const { b, ws, stop } = await board({ trust: false });
  try {
    const r = await b.wtSessions.create({ workspace: ws.key, name: 'g1', kind: 'claude', prompt: 'go' });
    const sp = b.spawned.at(-1);
    assert.equal(sp.worktree, undefined); assert.equal(sp.prompt, undefined);
    assert.equal(r.worktree.gate, true);
    assert.ok(b.wtSessions.gates.has(r.sessionId));
    assert.match(b.wtSessions.gates.get(r.sessionId).prompt, /\n\ngo$/);
  } finally { await stop(); }
});

// 워크트리 세션: 판이 만든 워크트리 폴더에서 일하고 커밋한다. onText: 병합 맡기기 일 머리를 받으면 done
const wtWorker = (x, name, { result = 'ok', commit = true } = {}) => {
  const wt = worktree(x.dir, name, { commit });
  const s = x.add(name, { cwd: wt, onText: async (t, s) => { if (t.includes('병합을 맡겼다(일 u')) s.doneOut = await x.U().doneVerb(s, { result, text: name + ': 브랜치 worktree-' + name + ' 끝냄; 시험 통과; 사용자가 얻는 것 빠름' }); } });
  s.git = { isWorktree: true, cwd: wt };
  return s;
};

test('P321 병합 맡기기(사람): 일을 열고 done ok가 merger로 간다, 합치면 세션을 닫고 보관, 사람에게 정리 알림은 없다', async () => {
  const x = await board();
  const { b, dir, mergerAct, M, U, toS, stop } = x;
  try {
    const w = wtWorker(x, 'h1');
    mergerAct(async (u) => { G(dir, 'merge', '-q', '--no-ff', u.meta.branch, '-m', 'm'); return ['ok', '합침 ' + G(dir, 'rev-parse', 'HEAD')]; });
    const dry = await b.wtSessions.request({ session: w.sessionId, dryRun: true });
    assert.equal(dry.branch, 'worktree-h1'); assert.equal(dry.target, 'dev'); assert.equal(dry.ahead, 1); assert.equal(dry.head, null); assert.equal(dry.enabled, true);
    const r = await b.wtSessions.request({ session: w.sessionId });
    const u = b.store.getUnit(r.unit);
    assert.equal(u.origin, 'merge_request'); assert.equal(u.from, w.sessionId); assert.equal(u.meta.human, true);
    await until(() => w.doneOut);
    assert.match(w.texts[0], /^\[Atrium 보드\] 관계: 사람이 판에서 이 세션의 병합을 맡겼다\(일 u[0-9a-f]+, 보고는 사람/);
    assert.equal(w.doneOut.claimedBy, 'merger');
    await until(() => b.killed.some((k) => k.name === 'h1'));
    assert.equal(b.killed.find((k) => k.name === 'h1').after, 'archive');
    const mu = b.store.mergeUnitOf(u.id);
    assert.equal(mu.meta.human, true); assert.equal(mu.status, 'done');
    await tick(300);
    assert.equal(toS(w).filter((d) => /병합 정리/.test(d.text)).length, 0);
  } finally { await stop(); }
});

test('P321 병합 맡기기(head 동료): from = head, merger 실패는 head에게, 사람 결정 카드는 없다', async () => {
  const x = await board();
  const { b, dir, add, mergerAct, toS, stop } = x;
  try {
    const lead = add('lead');
    const w = wtWorker(x, 'p1');
    b.branch.setRelation(lead, w, 'peer', { source: 'user', by: 'user', quiet: true });
    mergerAct(async () => ['failed', '못 합침: 충돌 a.txt']);
    const r = await b.wtSessions.request({ session: w.sessionId });
    assert.equal(r.head, 'lead');
    assert.equal(b.store.getUnit(r.unit).from, lead.sessionId);
    await until(() => w.doneOut);
    assert.match(w.texts[0], /보고는 @lead/);
    await until(() => toS(lead).some((d) => /못 합침: 충돌/.test(d.text)));
    assert.equal(b.store.openDecisions(w.sessionId).length, 0);
  } finally { await stop(); }
});

test('P321 병합 맡기기(사람): merger 실패와 넘기지 못한 done은 그 세션의 결정 카드로 사람에게', async () => {
  const x = await board();
  const { b, mergerAct, toS, stop } = x;
  try {
    const w = wtWorker(x, 'f1');
    mergerAct(async () => ['failed', '못 합침: 충돌 a.txt']);
    await b.wtSessions.request({ session: w.sessionId });
    await until(() => b.store.openDecisions(w.sessionId).length === 1);
    assert.match(b.store.openDecisions(w.sessionId)[0].question, /^@f1 병합 실패: 못 합침: 충돌 a\.txt/);
    assert.equal(toS(w).filter((d) => /못 합침/.test(d.text)).length, 0, '재운 세션에 실패 글을 보내지 않는다');
  } finally { await stop(); }
  const y = await board();
  try {
    const w = wtWorker(y, 'n1', { result: 'failed' });
    await y.b.wtSessions.request({ session: w.sessionId });
    await until(() => w.doneOut);
    assert.equal(w.doneOut.claimedBy, 'record');
    assert.match(y.b.store.openDecisions(w.sessionId)[0].question, /^@n1 병합을 맡기지 못함: n1: 브랜치/);
  } finally { await y.stop(); }
});

test('P321 병합 맡기기: merger 꺼짐(head 없음) 거절, head가 있으면 head에게 done, ask면 묻기 카드, 워크트리 아님·바쁨 거절', async () => {
  const x = await board({ settings: { mergerMode: 'off' } });
  try {
    const w = wtWorker(x, 'o1');
    await assert.rejects(x.b.wtSessions.request({ session: w.sessionId }), (e) => e.code === 'merger_off');
    const lead = x.add('lead');
    x.b.branch.setRelation(lead, w, 'peer', { source: 'user', by: 'user', quiet: true });
    await x.b.wtSessions.request({ session: w.sessionId });
    await until(() => w.doneOut);
    assert.equal(w.doneOut.claimedBy, 'queue');
    assert.match(w.texts[0], /merger가 꺼져 있어 닫으면 보드가 done 글을 @lead에게 보내고/);
    await until(() => x.toS(lead).some((d) => /@o1가 일 u[0-9a-f]+\("병합 맡기기: worktree-o1 → dev"\)을 닫았다: ok/.test(d.text)));
  } finally { await x.stop(); }
  const y = await board({ settings: { mergerMode: 'ask' } });
  try {
    const w = wtWorker(y, 'a1');
    await assert.rejects(y.b.wtSessions.request({ session: w.sessionId }), (e) => e.code === 'merger_ask');
    assert.equal(y.M().asks().length, 1);
    const e0 = wtWorker(y, 'e0', { commit: false });
    y.b.merger.answer(y.ws.key, 'on');
    await assert.rejects(y.b.wtSessions.request({ session: e0.sessionId }), (e) => e.code === 'no_commits');
    const root = y.add('root');
    await assert.rejects(y.b.wtSessions.request({ session: root.sessionId }), (e) => e.code === 'not_worktree');
  } finally { await y.stop(); }
  const z = await board();
  try {
    const w = wtWorker(z, 'b1');
    w.workMs = 400;
    await z.b.wtSessions.request({ session: w.sessionId });
    await assert.rejects(z.b.wtSessions.request({ session: w.sessionId }), (e) => e.code === 'busy');
  } finally { await z.stop(); }
});
