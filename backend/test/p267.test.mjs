// P267 단위 시험: 합치기 merger를 판의 기능으로(merger.mjs, work-units done 갈래, store-units 합치기 일, git 읽기, 멈춤 알림, 설정·물음).
// 진짜 저장소·전달 대기열·Branch와 진짜 git 저장소(합칠 브랜치 dev, 하위 워크트리), 가짜 에이전트·잠재우기·끄기·띄우기. herdr·hc와 claude 없이 돈다.
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
import { workspaceOf, branchProbe, worktreeList, parseWorktreeList, revOf, isAncestor } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch, boardSkill } from '../src/branch.mjs';
import { unitHeader } from '../src/work-units.mjs';
import { promptTask, isBoardNotice } from '../src/text.mjs';
import { readMergeConfig, mergerNameOf, mergeVerdict, mergeJobText, mergeHeader, mergerWorktreeOf, MERGER_JOBS, MERGE_CHILD_TAIL, readMergerGuide, mergerHandlers, pickMergerSpawn } from '../src/merger.mjs';
import { SETTINGS, DEFAULTS, normalizePatch } from '../src/settings.mjs';
import { VERBS } from '../src/cli-contract.mjs';

const tmp = (p = 'mtask-p267-') => fs.mkdtempSync(path.join(os.tmpdir(), p));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const G = (dir, ...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', windowsHide: true }).trim();

// ---------- 시험 저장소: 합칠 브랜치 dev가 본 체크아웃에 걸려 있다. 하위마다 워크트리와 커밋 ----------
function repo() {
  const dir = tmp();
  G(dir, 'init', '-q', '-b', 'dev');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  G(dir, 'add', '.'); G(dir, 'commit', '-q', '-m', 'init');
  // P346: 이 시험은 병합 흐름만 본다. 문서 시작 알림(살아 있는 문서가 없는 저장소의 첫 위임)이 알림 글 앞에 붙지 않게 문서 점검을 꺼 둔다(git 밖)
  fs.mkdirSync(path.join(dir, '.atrium'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.atrium', 'docs.json'), '{ "off": true }\n');
  fs.appendFileSync(path.join(dir, '.git', 'info', 'exclude'), '\n/.atrium/\n');
  return dir;
}
function worktree(dir, name, { commit = true, file = name + '.txt', text = name + '\n' } = {}) {
  const wt = path.join(dir, '.claude', 'worktrees', name);
  G(dir, 'worktree', 'add', '-q', '-b', 'worktree-' + name, wt, 'dev');
  if (commit) { fs.writeFileSync(path.join(wt, file), text); G(wt, 'add', '.'); G(wt, 'commit', '-q', '-m', 'work ' + name); }
  return wt;
}

// ---------- 가짜 판(p180 시험의 틀 + 잠재우기·끄기·띄우기) ----------
async function board({ dir = repo(), settings = { mergerMode: 'on' }, jobs, spawnFail = false } = {}) {
  const store = new Store(path.join(tmp('mtask-p267db-'), 'board.db'));
  const ws = await workspaceOf(dir);
  try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p267test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20, verbs: { pollMs: 15, settleMs: 800, turnGraceMs: 300, answerGraceMs: 200 }, merger: { settings: () => settings, sleepDelayMs: 10, ...(jobs ? { jobs } : {}) } });
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

test('P267 merge.json: 넷 칸, 기본값, 잘못된 칸은 기본값과 문제 줄', () => {
  const d = tmp();
  assert.deepEqual(readMergeConfig(d), { config: { target: null, where: 'worktree', push: false, guide: null }, source: null, problems: [] });
  fs.mkdirSync(path.join(d, '.atrium'));
  fs.writeFileSync(path.join(d, '.atrium', 'merge.json'), JSON.stringify({ target: 'dev', where: 'main', push: true, guide: 'docs/merge.md' }));
  assert.deepEqual(readMergeConfig(d).config, { target: 'dev', where: 'main', push: true, guide: 'docs/merge.md' });
  fs.writeFileSync(path.join(d, '.atrium', 'merge.json'), JSON.stringify({ target: '-x', where: 'there', push: 'yes', guide: '../x', extra: 1 }));
  const r = readMergeConfig(d);
  assert.deepEqual(r.config, { target: null, where: 'worktree', push: false, guide: null });
  assert.equal(r.problems.length, 5);
  fs.writeFileSync(path.join(d, '.atrium', 'merge.json'), '{ no');
  assert.match(readMergeConfig(d).problems[0], /JSON/);
});

test('P267 이름·판정·일 글: 워크스페이스+브랜치 이름, 판정 갈래, 머리는 판 알림 꼴', () => {
  assert.equal(mergerNameOf({ wsName: 'multitask', target: 'dev' }), 'merger-multitask-dev');
  assert.equal(mergerNameOf({ wsName: 'My Repo!', target: 'feature/x' }), 'merger-my-repo-feature-x');
  assert.equal(mergerNameOf({ wsName: 'multitask', target: 'dev', taken: new Set(['merger-multitask-dev']) }), 'merger-multitask-dev-2');
  assert.ok(mergerNameOf({ wsName: 'a-very-long-workspace-name', target: 'release/2026-11-very-long' }).length <= 32);
  const p = { isWorktree: true, commonDir: 'C:/r/.git', branch: 'worktree-a', ahead: 2 };
  assert.deepEqual(mergeVerdict({ mode: 'on', probe: p, repoCommonDir: 'c:/r/.git', target: 'dev' }), { route: true, why: 'ok', ask: false });
  const why = (o) => mergeVerdict({ mode: 'on', probe: p, repoCommonDir: 'C:/r/.git', target: 'dev', ...o }).why;
  assert.equal(why({ mode: 'off' }), 'off');
  assert.equal(why({ isMerger: true }), 'merger');
  assert.equal(why({ probe: null }), 'not_git');
  assert.equal(why({ probe: { ...p, isWorktree: false } }), 'not_worktree');
  assert.equal(why({ repoCommonDir: 'C:/other/.git' }), 'other_repo');
  assert.equal(why({ probe: { ...p, branch: null } }), 'detached');
  assert.equal(why({ target: null }), 'no_target');
  assert.equal(why({ probe: { ...p, branch: 'dev' } }), 'same_branch');
  assert.equal(why({ probe: { ...p, ahead: 0 } }), 'no_commits');
  assert.deepEqual(mergeVerdict({ mode: 'ask', probe: p, target: 'dev' }), { route: false, why: 'ask', ask: true });
  assert.equal(mergeVerdict({ mode: 'ask', answer: 'on', probe: p, target: 'dev' }).route, true);
  assert.deepEqual(mergeVerdict({ mode: 'ask', answer: 'off', probe: p, target: 'dev' }), { route: false, why: 'answered_off', ask: false });
  const job = mergeJobText({ child: 'p1', parent: 'lead', worktree: 'C:/r/.claude/worktrees/p1', branch: 'worktree-p1', tip: 'abc', ahead: 2, dirty: 0, target: 'dev', holder: 'C:/r', mergerWorktree: 'C:/r/.atrium/merge/dev', where: 'worktree', push: true, guide: 'docs/merge.md', configSource: '.atrium/merge.json', doneText: '끝냈다' });
  assert.match(job, /^병합: @p1 \(worktree-p1 → dev\)/);
  for (const re of [/맡긴 부모: @lead/, /하위의 워크트리: C:\/r\/\.claude\/worktrees\/p1/, /끝 커밋 abc/, /앞선 커밋 2개/, /커밋 안 한 변경 0개/, /걸린 체크아웃: C:\/r/, /너의 워크트리: C:\/r\/\.atrium\/merge\/dev/, /push\): 켜짐/, /저장소 안내: docs\/merge\.md/, /## @p1의 done 글\n끝냈다$/]) assert.match(job, re);
  assert.match(mergeJobText({ child: 'p1', parent: 'l', worktree: 'w', branch: 'b', target: 'dev', holder: null, mergerWorktree: 'm', where: 'worktree', push: false }), /어디에도 걸려 있지 않다: 너의 워크트리가 건다[\s\S]*push\): 꺼짐/);
  const h = mergeHeader({ unitId: 'u1', parent: 'lead', child: 'p1' });
  assert.equal(h.split('\n').length, 3);
  assert.equal(promptTask(h + '\n\n' + job), job, '카드에는 일 글만 지시로');
  assert.match(h, /atrium done ok "합침 <해시> …"/); assert.match(h, /atrium done failed "못 합침\|합쳤지만 고침 필요\|결정 필요: …"/);
  assert.match(mergerWorktreeOf('C:/r', 'feature/x'), /\/\.atrium\/merge\/feature-x$/);
  const ch = unitHeader({ parent: 'lead', unitId: 'u2', merge: MERGE_CHILD_TAIL });
  assert.equal(ch.split('\n').length, 3); assert.match(ch.split('\n')[2], /merger에게 맡긴다/);
  const g = readMergerGuide();
  for (const re of [/ok = 더 볼 것이 없다/, /failed = 부모가 봐야 한다/, /못 합침:/, /합쳤지만 고침 필요:/, /결정 필요:/, /merge --ff-only/, /하위에게 지시하지 않는다/, /push.*켜짐일 때만/]) assert.match(g, re);
});

test('P267 설정·계약·스킬: mergerMode 기본 ask, 모델 sonnet medium, guide merger, 판 스킬 9절 문구', () => {
  assert.equal(DEFAULTS.mergerMode, 'ask'); assert.deepEqual(SETTINGS.mergerMode.options, ['on', 'ask', 'off']);
  assert.equal(DEFAULTS.mergerModel, 'claude-sonnet-5-5'); assert.equal(DEFAULTS.mergerEffort, 'medium'); assert.equal(DEFAULTS.mergerKind, 'claude');
  assert.deepEqual(normalizePatch({ mergerMode: 'on', mergerModel: 'haiku' }), { mergerMode: 'on', mergerModel: 'haiku' });
  assert.throws(() => normalizePatch({ mergerMode: 'maybe' }));
  assert.equal(MERGER_JOBS, 5);
  assert.deepEqual(VERBS.find((v) => v.name === 'guide').args, ['[merger]', '[--json]']);
  const sk = boardSkill();
  assert.match(sk, /브랜치에서 일한 워커가 \x60atrium done ok\x60로 닫으면 보드가 그 워커를 재우고 병합을 merger에게 맡긴다\. 합쳐지면 보드가 그 워커를 닫고 보관한다\./);
  assert.match(sk, /그 밖의 끝난 워커는 끄지 않고 둔다\(사람이 끄라고 할 때만 \x60atrium child-kill <이름>\x60/);
  assert.doesNotMatch(sk, /끝난 워커는 끄지 않고 둔다\. 사람이 끄라고 할 때만/);
});

test('P267 git 읽기: 워크트리·브랜치·끝 커밋·앞선 커밋·커밋 안 한 변경, 브랜치가 걸린 체크아웃, 조상', async () => {
  const dir = repo();
  const wt = worktree(dir, 'g1');
  fs.writeFileSync(path.join(wt, 'dirty.txt'), 'x');
  const p = await branchProbe(wt, 'dev');
  assert.equal(p.isWorktree, true); assert.equal(p.branch, 'worktree-g1'); assert.equal(p.ahead, 1); assert.equal(p.dirty, 1);
  assert.equal(p.tip, G(wt, 'rev-parse', 'HEAD'));
  const r = await branchProbe(dir);
  assert.equal(r.isWorktree, false); assert.equal(r.branch, 'dev'); assert.equal(r.ahead, null);
  assert.equal(r.commonDir.toLowerCase(), p.commonDir.toLowerCase());
  const list = await worktreeList(dir);
  assert.equal(list.find((w) => w.branch === 'dev').path.toLowerCase(), path.resolve(dir).split(path.sep).join('/').toLowerCase());
  assert.ok(list.some((w) => w.branch === 'worktree-g1'));
  assert.equal(await revOf(dir, 'dev'), G(dir, 'rev-parse', 'dev'));
  assert.equal(await revOf(dir, 'nope'), null);
  assert.equal(await isAncestor(dir, 'dev', 'worktree-g1'), true);
  assert.equal(await isAncestor(dir, 'worktree-g1', 'dev'), false);
  assert.deepEqual(parseWorktreeList('worktree C:/a\nHEAD 1\nbranch refs/heads/dev\n\nworktree C:/b\nHEAD 2\ndetached\n'), [{ path: 'C:/a', head: '1', branch: 'dev', detached: false, bare: false }, { path: 'C:/b', head: '2', branch: null, detached: true, bare: false }]);
  assert.equal(await branchProbe(tmp()), null, 'git이 아님');
});

test('P267 흐름: 첫 done ok에 merger를 띄우고 하위를 재운다, 합침 ok → 부모 안 깨움·소식·items 합침·하위 닫고 보관, 할 일 없으면 merger도 닫는다', async () => {
  const { b, dir, add, worker, mergerAct, M, U, toS, sumS, stop } = await board();
  try {
    const lead = add('lead', { permissionMode: 'acceptEdits' });
    const wt = worktree(dir, 'p1');
    const w = worker('p1', wt, { parent: lead });
    mergerAct(async (u) => { G(dir, 'merge', '-q', '--no-ff', u.meta.branch, '-m', 'Merge ' + u.meta.child); G(dir, 'worktree', 'remove', '--force', u.meta.worktree); G(dir, 'branch', '-D', u.meta.branch); return ['ok', '합침 ' + G(dir, 'rev-parse', 'HEAD') + ' ' + u.meta.child + ' → dev']; });
    w.git = { isWorktree: true };
    await assign(b, lead, 'p1');
    await until(() => w.doneOut);
    assert.equal(w.doneOut.claimedBy, 'merger'); assert.ok(w.doneOut.merge.unit);
    assert.match(w.texts[0].split('\n')[2], /merger에게 맡긴다/, '하위 일 머리 셋째 줄');
    await until(() => b.spawned.length === 1);
    const sp = b.spawned[0];
    assert.equal(sp.name, mergerNameOf({ wsName: path.basename(dir), target: 'dev' }));
    assert.equal(sp.kind, 'claude'); assert.equal(sp.model, 'claude-sonnet-5-5'); assert.equal(sp.effort, 'medium'); assert.equal(sp.permissionMode, 'acceptEdits');
    assert.equal(path.resolve(sp.cwd).toLowerCase(), path.resolve(dir).toLowerCase());
    assert.ok(fs.existsSync(path.join(dir, '.atrium')), '.atrium/(git 밖)');
    await until(() => b.slept.some((x) => x.name === 'p1'));
    assert.deepEqual(b.slept.find((x) => x.name === 'p1'), { name: 'p1', by: 'merge', mode: 'hand', scope: 'session' });
    const ms = [...b.sessions.values()].find((x) => x.name === sp.name);
    await until(() => ms.texts.length >= 1);
    const job = ms.texts[0];
    assert.match(job, /^\[Atrium 보드\] 관계: 너는 이 워크스페이스의 merger다\. 아래는 @lead가 맡긴 @p1의 결과를 합치는 일 u/);
    assert.match(job, /병합: @p1 \(worktree-p1 → dev\)/); assert.match(job, /p1: 브랜치 worktree-p1 끝냄; 시험 통과/);
    assert.match(job, /# merger 안내/, '처음 일에는 안내');
    await until(() => ms.mergeOut && ms.mergeOut.length === 1);
    assert.equal(ms.mergeOut[0].claimedBy, 'record');
    await until(() => b.killed.some((x) => x.name === 'p1'));
    assert.deepEqual(b.killed.find((x) => x.name === 'p1'), { name: 'p1', after: 'archive' });
    await tick(150);
    assert.equal(toS(lead).length, 0, '부모에게 아무것도 가지 않았다');
    const it = U().items(lead).items.find((x) => x.to === 'p1');
    assert.equal(it.result, 'ok'); assert.equal(it.claimedBy, 'merger');
    await until(() => U().items(lead).items.find((x) => x.to === 'p1').merge.hash);
    const mg = U().items(lead).items.find((x) => x.to === 'p1').merge;
    assert.equal(mg.state, 'merged'); assert.equal(mg.hash, G(dir, 'rev-parse', 'dev'));
    const news = b.store.newsRecent([ms.sessionId], 5);
    assert.ok(news.some((n) => n.kind === 'merge' && n.text === '@p1 합침 ' + mg.hash.slice(0, 9) + ' → dev'), JSON.stringify(news));
    assert.equal(news.filter((n) => n.kind === 'done').length, 0, '합침은 done 줄 대신 합침 줄');
    await until(() => b.killed.some((x) => x.name === sp.name));
    assert.equal(b.killed.find((x) => x.name === sp.name).after, 'archive');
    // P290: merger가 닫힐 때 판이 부모에게 정리 알림 하나
    await until(() => sumS(lead).length === 1);
    assert.match(sumS(lead)[0].text, /^\[Atrium 보드\] 병합 정리: @merger-.*가 닫히기 전에 합친 것 1개\n- @p1: ok, 합침 [0-9a-f]{9} → dev/);
    const st = M().status();
    assert.equal(st.mergers[0].open, false); assert.equal(st.mergers[0].gen, 1);
  } finally { await stop(); }
});

test('P267 merger 하나가 둘을 차례로: 두 번째 done ok는 같은 merger에 줄 서고, 다른 부모의 일도 같은 merger가 받는다', async () => {
  const { b, dir, add, worker, mergerAct, U, toS, stop } = await board();
  try {
    const lead = add('lead'); const lead2 = add('lead2');
    const w1 = worker('a1', worktree(dir, 'a1'), { parent: lead });
    const w2 = worker('a2', worktree(dir, 'a2'), { parent: lead2 });
    let seen = 0;
    mergerAct(async (u) => { seen++; await tick(80); G(dir, 'merge', '-q', '--no-ff', u.meta.branch, '-m', 'm'); return ['ok', '합침 ' + G(dir, 'rev-parse', 'HEAD')]; });
    await assign(b, lead, 'a1'); await assign(b, lead2, 'a2');
    await until(() => w1.doneOut && w2.doneOut);
    await until(() => seen === 2, 8000);
    assert.equal(b.spawned.length, 1, '워크스페이스+브랜치마다 하나');
    await until(() => b.killed.filter((x) => x.name === 'a1' || x.name === 'a2').length === 2);
    assert.equal(toS(lead).length + toS(lead2).length, 0);
    assert.equal(U().items(lead2).items.find((x) => x.to === 'a2').merge.state, 'merged');
    assert.equal(await isAncestor(dir, 'worktree-a1', 'dev'), true);
    assert.equal(await isAncestor(dir, 'worktree-a2', 'dev'), true);
  } finally { await stop(); }
});

test('P267 실패·고침 필요: merger failed는 부모에게만 가고 하위는 재운 채 둔다, 다시 시키면 새 일·다시 done ok면 다시 merger', async () => {
  const { b, dir, add, worker, mergerAct, U, toS, stop } = await board();
  try {
    const lead = add('lead');
    const wt = worktree(dir, 'f1');
    const w = worker('f1', wt, { parent: lead });
    let n = 0;
    mergerAct(async (u) => { n++; if (n === 1) return ['failed', '결정 필요: a.txt가 dev와 겹친다']; G(dir, 'merge', '-q', '--no-ff', u.meta.branch, '-m', 'm'); return ['ok', '합침 x']; });
    await assign(b, lead, 'f1');
    await until(() => toS(lead).length === 1, 8000);
    const msg = toS(lead)[0].text;
    assert.match(msg, /^\[Atrium 보드\] @merger-.*가 일 u[0-9a-f]+\("병합: @f1 \(worktree-f1 → dev\)"\)을 닫았다: failed\n결정 필요: a\.txt가 dev와 겹친다/);
    assert.match(msg, /@f1는 재운 채 둔다\(워크트리 .*\.claude\/worktrees\/f1, 브랜치 worktree-f1\)/); assert.match(msg, /atrium prompt f1 "<할 일>"/);
    assert.equal(isBoardNotice(msg), true);
    await until(() => b.slept.some((x) => x.name === 'f1'));
    await tick(100);
    assert.ok(!b.killed.some((x) => x.name === 'f1'), '하위를 닫지 않는다');
    assert.ok(b.sessions.has(w.sessionId));
    assert.equal(U().items(lead).items.find((x) => x.origin !== 'merge').merge.state, 'failed');
    w.doneOut = null;
    fs.writeFileSync(path.join(wt, 'fix.txt'), 'fix'); G(wt, 'add', '.'); G(wt, 'commit', '-q', '-m', 'fix');
    await assign(b, lead, 'f1');
    await until(() => w.doneOut || w.err, 5000).catch((e) => { throw new Error('again: ' + JSON.stringify({ err: w.err && w.err.message, texts: w.texts.length, sleep: w.rt.sleep })); });
    assert.equal(w.doneOut.claimedBy, 'merger');
    await until(() => b.killed.some((x) => x.name === 'f1'), 8000);
    assert.equal(toS(lead).length, 1, '합침 ok는 부모를 깨우지 않는다');
  } finally { await stop(); }
});

test('P267 설정: off는 지금처럼 부모에게, ask는 사람에게 판 카드로 한 번(그동안 부모에게), 답 on·off를 기억한다', async () => {
  const settings = { mergerMode: 'off' };
  const { b, dir, ws, add, worker, mergerAct, M, stop, events } = await board({ settings });
  try {
    mergerAct(async () => ['ok', '합침 x']);
    const lead = add('lead');
    const w1 = worker('o1', worktree(dir, 'o1'), { parent: lead });
    w1.git = { isWorktree: true };
    await assign(b, lead, 'o1'); await until(() => w1.doneOut);
    assert.equal(w1.doneOut.claimedBy, 'queue'); assert.equal(b.spawned.length, 0);
    assert.doesNotMatch(w1.texts[0], /merger에게 맡긴다/, '꺼졌으면 머리 한 마디도 없다');
    settings.mergerMode = 'ask';
    const w2 = worker('o2', worktree(dir, 'o2'), { parent: lead });
    await assign(b, lead, 'o2'); await until(() => w2.doneOut);
    assert.equal(w2.doneOut.claimedBy, 'queue'); assert.equal(w2.doneOut.mergeAsk, true);
    const asks = events.filter(([e]) => e === 'merger.ask');
    assert.equal(asks.length, 1);
    assert.deepEqual(Object.keys(asks[0][1]).sort(), ['at', 'branch', 'child', 'root', 'target', 'workspace', 'workspaceName']);
    assert.equal(asks[0][1].workspace, ws.key); assert.equal(asks[0][1].child, 'o2'); assert.equal(asks[0][1].branch, 'worktree-o2'); assert.equal(asks[0][1].target, 'dev');
    const h = mergerHandlers(b);
    assert.equal((await h['merger.asks']()).asks.length, 1);
    const w3 = worker('o3', worktree(dir, 'o3'), { parent: lead });
    await assign(b, lead, 'o3'); await until(() => w3.doneOut);
    assert.equal(events.filter(([e]) => e === 'merger.ask').length, 1, '워크스페이스마다 한 번');
    const a = await h['merger.answer']({ workspace: ws.key, answer: 'on' });
    assert.equal(a.enabled, true); assert.equal((await h['merger.asks']()).asks.length, 0);
    assert.ok(events.some(([e, v]) => e === 'merger.answered' && v.answer === 'on'));
    const w4 = worker('o4', worktree(dir, 'o4'), { parent: lead });
    await assign(b, lead, 'o4'); await until(() => w4.doneOut);
    assert.equal(w4.doneOut.claimedBy, 'merger');
    await h['merger.answer']({ workspace: ws.key, answer: 'off' });
    const w5 = worker('o5', worktree(dir, 'o5'), { parent: lead });
    await assign(b, lead, 'o5'); await until(() => w5.doneOut);
    assert.equal(w5.doneOut.claimedBy, 'queue'); assert.equal(w5.doneOut.mergeAsk, undefined);
    assert.equal(events.filter(([e]) => e === 'merger.ask').length, 1);
    await assert.rejects(() => h['merger.answer']({ workspace: ws.key, answer: 'maybe' }), (e) => e.code === 'bad_request');
    await h['merger.answer']({ workspace: ws.key, answer: 'ask' });
    assert.equal(M().modeFor(ws.key).answer, null);
    const st = await h['merger.status']({ workspace: ws.key });
    assert.equal(st.mode, 'ask'); assert.equal(st.enabled, false); assert.equal(st.settings.mergerModel, 'claude-sonnet-5-5');
  } finally { await stop(); }
});

test('P267 merge.json: target·push가 일 머리에, 합칠 브랜치가 어디에도 안 걸렸으면 merger 워크트리가 건다고 알린다', async () => {
  const { b, dir, add, worker, mergerAct, stop } = await board();
  try {
    G(dir, 'branch', 'release');
    fs.mkdirSync(path.join(dir, '.atrium'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.atrium', 'merge.json'), JSON.stringify({ target: 'release', push: true, guide: 'docs/merge.md' }));
    let job = null;
    mergerAct(async (u) => { job = u; return ['ok', '합침 x']; });
    const lead = add('lead');
    const wt = path.join(dir, '.claude', 'worktrees', 'r1');
    G(dir, 'worktree', 'add', '-q', '-b', 'worktree-r1', wt, 'release');
    fs.writeFileSync(path.join(wt, 'r.txt'), 'r'); G(wt, 'add', '.'); G(wt, 'commit', '-q', '-m', 'r');
    worker('r1', wt, { parent: lead });
    await assign(b, lead, 'r1');
    await until(() => job);
    assert.equal(job.meta.target, 'release'); assert.equal(job.meta.push, true); assert.equal(job.meta.holder, null);
    assert.match(job.spec, /합칠 브랜치: release \(어디에도 걸려 있지 않다: 너의 워크트리가 건다\)/);
    assert.match(job.spec, /push\): 켜짐, 저장소 안내: docs\/merge\.md \(\.atrium\/merge\.json\)/);
    assert.match(job.meta.mergerWorktree, /\/\.atrium\/merge\/release$/);
  } finally { await stop(); }
});

test('P267 교대: 합치기 일 다섯 번을 닫으면 merger를 닫고 보관하고, 줄 선 일은 같은 이름의 새 merger가 받는다', async () => {
  const { b, dir, add, worker, mergerAct, M, stop } = await board();
  try {
    const lead = add('lead');
    const by = [];
    mergerAct(async (u, x) => { by.push([x.sessionId, u.meta.child]); return ['ok', '합침 x']; });
    for (let i = 1; i <= 6; i++) worker('j' + i, worktree(dir, 'j' + i), { parent: lead });
    for (let i = 1; i <= 6; i++) await assign(b, lead, 'j' + i);
    await until(() => by.length === 6, 15000);
    const first = by[0][0];
    assert.deepEqual(by.slice(0, 5).map((x) => x[0]), Array(5).fill(first), '다섯 번은 같은 merger');
    assert.notEqual(by[5][0], first, '여섯째는 새 merger');
    assert.ok(b.spawned.length >= 2);
    assert.equal(b.spawned[0].name, b.spawned[1].name, '같은 이름을 다시 쓴다');
    const firstName = b.spawned[0].name;
    assert.equal(b.killed.find((x) => x.name === firstName).after, 'archive');
    assert.ok(M().status().mergers[0].gen >= 2);
  } finally { await stop(); }
});

test('P267 멈춤 알림: merger가 done 없이 쉬면 그 일의 부모에게, merger가 닫히면 줄 선 일은 새 merger가 받는다', async () => {
  const { b, dir, add, worker, toS, stop } = await board();
  try {
    const lead = add('lead');
    worker('s1', worktree(dir, 's1'), { parent: lead });
    let hold = true; const got = [];
    b.onSpawn = (s) => { s.onText = async (t, x) => { const m = /합치는 일 (u[0-9a-f]+)/.exec(t); if (!m) return; got.push([x.name, x.sessionId, m[1]]); if (!hold) await b.branch.units.doneVerb(x, { result: 'ok', text: '합침 y' }); }; };
    await assign(b, lead, 's1');
    await until(() => got.length === 1);
    await until(() => toS(lead).length === 1, 5000);
    assert.match(toS(lead)[0].text, /^\[Atrium 보드\] 맡긴 일이 멈췄다: @merger-.*의 일 u[0-9a-f]+\("병합: @s1 \(worktree-s1 → dev\)"\): 보고\(atrium done\) 없이 턴을 끝내고 쉰다/);
    const w2 = worker('s2', worktree(dir, 's2'), { parent: lead });
    await assign(b, lead, 's2');
    await until(() => w2.doneOut);
    hold = false;
    const m1 = b.sessions.get(got[0][1]);
    b.closeSession(m1, 'pane closed outside board');
    await until(() => got.length === 2, 5000);
    assert.notEqual(got[1][1], got[0][1]);
    assert.equal(b.spawned.length, 2);
    await until(() => toS(lead).some((d) => /세션이 닫혔다/.test(d.text)), 5000);
  } finally { await stop(); }
});

test('P267 Claude Code가 아닌 하위(hook 없음)도 같은 길, 판정은 git: 워크트리가 아니거나 앞선 커밋이 없으면 지금처럼 부모에게', async () => {
  const { b, dir, add, worker, mergerAct, stop } = await board();
  try {
    mergerAct(async () => ['ok', '합침 z']);
    const lead = add('lead');
    const c1 = worker('cx1', worktree(dir, 'cx1'), { parent: lead, kind: 'codex' });
    await assign(b, lead, 'cx1');
    await until(() => c1.doneOut);
    assert.equal(c1.doneOut.claimedBy, 'merger');
    await until(() => b.slept.some((x) => x.name === 'cx1'));
    const r1 = worker('root1', dir, { parent: lead });
    await assign(b, lead, 'root1'); await until(() => r1.doneOut);
    assert.equal(r1.doneOut.claimedBy, 'queue');
    const e1 = worker('empty1', worktree(dir, 'empty1', { commit: false }), { parent: lead });
    await assign(b, lead, 'empty1'); await until(() => e1.doneOut);
    assert.equal(e1.doneOut.claimedBy, 'queue');
    const f1 = worker('fd1', worktree(dir, 'fd1'), { parent: lead, result: 'failed', text: '못 했다' });
    await assign(b, lead, 'fd1'); await until(() => f1.doneOut);
    assert.equal(f1.doneOut.claimedBy, 'queue');
    assert.ok(!b.slept.some((x) => x.name === 'fd1'));
  } finally { await stop(); }
});

test('P267 claude -w 하위: 띄운 폴더(s.cwd)가 본 체크아웃이어도 판이 읽은 지금 폴더(s.git.cwd)가 워크트리면 merger로', async () => {
  const { b, dir, add, worker, mergerAct, stop } = await board();
  try {
    mergerAct(async () => ['ok', '합침 w']);
    const lead = add('lead');
    const wt = worktree(dir, 'cw1');
    const w = worker('cw1', dir, { parent: lead });
    w.git = { cwd: wt.split(path.sep).join('/'), isWorktree: true };
    await assign(b, lead, 'cw1');
    await until(() => w.doneOut);
    assert.equal(w.doneOut.claimedBy, 'merger');
    await until(() => b.spawned.length === 1);
  } finally { await stop(); }
});

test('P267 merger를 띄우지 못하면 원래 done을 부모에게 그대로(돌려보낸 까닭 한 줄)', async () => {
  const { b, dir, add, worker, toS, stop } = await board({ spawnFail: true });
  try {
    const lead = add('lead');
    const w = worker('x1', worktree(dir, 'x1'), { parent: lead });
    await assign(b, lead, 'x1');
    await until(() => w.doneOut);
    await until(() => toS(lead).length === 1);
    const t = toS(lead)[0].text;
    assert.match(t, /^\[Atrium 보드\] @x1가 일 u[0-9a-f]+\("x1의 일: 고쳐라"\)을 닫았다: ok\nx1: 브랜치 worktree-x1 끝냄/);
    assert.match(t, /merger에게 맡기지 못해 너에게 그대로 보낸다\(terminal_down\)/);
    const mu = b.store.db.prepare("SELECT * FROM work_units WHERE origin = 'merge'").get();
    assert.equal(mu.status, 'cancelled');
  } finally { await stop(); }
});


// ---------- P275: merger의 ok는 판이 git으로 확인한 뒤에만 합침, 설치된 하네스에서 merger 종류 고르기 ----------
test('P275 거짓 합침: merger가 합치지 않고 ok → failed처럼(부모 알림, 하위 재운 채, 일 상태 failed)', async () => {
  const { b, dir, add, worker, mergerAct, U, toS, stop } = await board();
  try {
    const lead = add('lead');
    const wt = worktree(dir, 'v1');
    const w = worker('v1', wt, { parent: lead });
    mergerAct(async () => ['ok', '합침 완료']);
    await assign(b, lead, 'v1');
    await until(() => toS(lead).length === 1, 8000);
    const msg = toS(lead)[0].text;
    assert.match(msg, /을 닫았다: failed\n합침 완료/);
    assert.match(msg, /done ok로 닫았지만 보드가 확인하니 합칠 브랜치 dev\([0-9a-f]{9}\)에 @v1의 끝 커밋 [0-9a-f]{9}이 없다/);
    assert.match(msg, /@v1는 재운 채 둔다/);
    await until(() => b.slept.some((x) => x.name === 'v1'));
    await tick(150);
    assert.ok(!b.killed.some((x) => x.name === 'v1'), '하위를 닫지 않는다');
    assert.ok(b.sessions.has(w.sessionId));
    const mu = b.store.mergeUnitOf(w.doneOut.unit);
    assert.equal(mu.status, 'failed');
    assert.equal(mu.meta.failed.unverified, true);
    assert.equal(mu.meta.failed.contains, false);
    assert.equal(mu.meta.merged, undefined);
    assert.equal(b.store.lastTryOfUnit(mu.id).result, 'failed');
    const items = U().items(lead).items;
    assert.equal(items.find((x) => x.origin === 'merge').status, 'failed');
    const src = items.find((x) => x.origin !== 'merge');
    assert.equal(src.merge.state, 'failed');
    assert.match(src.merge.line, /끝 커밋/);
    assert.equal(await isAncestor(dir, mu.meta.tip, 'dev'), false);
  } finally { await stop(); }
});

test('P275 참 합침: merger가 합치고 ok → 지금처럼(하위 닫고 보관, 부모 깨우지 않음, 해시 기록)', async () => {
  const { b, dir, add, worker, mergerAct, stop, toS } = await board();
  try {
    const lead = add('lead');
    const wt = worktree(dir, 'v2');
    const w = worker('v2', wt, { parent: lead });
    mergerAct(async (u) => { G(dir, 'merge', '-q', '--no-ff', u.meta.branch, '-m', 'm'); return ['ok', '합침 ' + G(dir, 'rev-parse', 'HEAD')]; });
    await assign(b, lead, 'v2');
    await until(() => b.killed.some((x) => x.name === 'v2'), 8000);
    const mu = b.store.mergeUnitOf(w.doneOut.unit);
    assert.equal(mu.status, 'done');
    assert.equal(mu.meta.merged.contains, true);
    assert.equal(mu.meta.merged.hash, G(dir, 'rev-parse', 'dev'));
    assert.equal(toS(lead).length, 0);
  } finally { await stop(); }
});

test('P275 확인 못함: 합칠 브랜치를 읽지 못하면 ok여도 failed(확인하지 못했다)', async () => {
  const { b, dir, add, worker, mergerAct, stop, toS } = await board();
  try {
    const lead = add('lead');
    const wt = worktree(dir, 'v3');
    const w = worker('v3', wt, { parent: lead });
    mergerAct(async (u) => { const mu = b.store.getUnit(u.id); b.store.updateUnit(u.id, { meta: { ...mu.meta, target: 'gone-branch' } }); return ['ok', '합침 y']; });
    await assign(b, lead, 'v3');
    await until(() => toS(lead).length === 1, 8000);
    assert.match(toS(lead)[0].text, /gone-branch에 @v3의 끝 커밋 [0-9a-f]{9}이 들어갔는지 git으로 확인하지 못했다/);
    const mu = b.store.mergeUnitOf(w.doneOut.unit);
    assert.equal(mu.status, 'failed');
    assert.equal(mu.meta.failed.contains, null);
    assert.ok(!b.killed.some((x) => x.name === 'v3'));
  } finally { await stop(); }
});

test('P275 merger 종류 고르기(순수): 설치 목록 조합별', () => {
  const set = { mergerKind: 'claude', mergerModel: 'claude-sonnet-5-5', mergerEffort: 'medium' };
  const K = (c, x) => [{ kind: 'claude', installed: c, path: c ? 'claude' : null }, { kind: 'codex', installed: x, path: x ? 'codex' : null }];
  assert.deepEqual(pickMergerSpawn({ kinds: K(true, true), set }), { kind: 'claude', model: 'claude-sonnet-5-5', effort: 'medium', picked: 'setting', wanted: 'claude' });
  assert.deepEqual(pickMergerSpawn({ kinds: K(false, true), set }), { kind: 'codex', model: null, effort: 'medium', picked: 'installed', wanted: 'claude' });
  assert.equal(pickMergerSpawn({ kinds: K(false, false), set }), null);
  assert.deepEqual(pickMergerSpawn({ kinds: K(true, false), set: { ...set, mergerKind: 'codex' } }), { kind: 'claude', model: 'claude-sonnet-5-5', effort: 'medium', picked: 'installed', wanted: 'codex' });
  assert.deepEqual(pickMergerSpawn({ kinds: K(true, true), set: { ...set, mergerKind: 'codex' } }), { kind: 'codex', model: null, effort: 'medium', picked: 'setting', wanted: 'codex' });
  assert.equal(pickMergerSpawn({ kinds: K(true, true), set: { ...set, mergerKind: 'codex', mergerModel: 'gpt-x' } }).model, 'gpt-x');
  assert.equal(pickMergerSpawn({ kinds: K(true, true), set: { mergerKind: '' } }).kind, 'claude');
  assert.equal(pickMergerSpawn({ kinds: [], set: { ...set, mergerKind: 'codex' } }).kind, 'codex');
  assert.equal(pickMergerSpawn({ kinds: [{ kind: 'claude' }], set }).picked, 'setting');
  assert.equal(pickMergerSpawn({ kinds: K(true, true), set: { ...set, mergerKind: 'pi' } }).kind, 'claude');
});

test('P275 Claude가 없고 Codex만 있으면 Codex merger를 띄운다(dev60 재현)', async () => {
  const { b, dir, add, M, stop } = await board({ settings: { mergerMode: 'on', mergerKind: 'claude', mergerModel: 'claude-sonnet-5-5', mergerEffort: 'medium' } });
  try {
    const parent = add('audit-parent', { kind: 'codex' });
    b.adapter.agentKinds = async () => [{ kind: 'claude', installed: false, path: null }, { kind: 'codex', installed: true, path: 'codex' }];
    const ws = parent.workspaceKey;
    const s = await M().spawnFor(ws + '|dev', { from: parent.sessionId, meta: { ws, root: dir, target: 'dev' } });
    assert.equal(s.kind, 'codex');
    assert.equal(b.spawned[0].model, undefined);
    assert.equal(b.spawned[0].effort, 'medium');
  } finally { await stop(); }
});

test('P275 둘 다 없으면 merger를 띄우지 않고 부모에게 done을 그대로, 사람에게 까닭(merger.problem, status.problem)', async () => {
  const { b, dir, add, worker, M, toS, stop, events } = await board();
  try {
    b.adapter.agentKinds = async () => [{ kind: 'claude', installed: false, path: null }, { kind: 'codex', installed: false, path: null }];
    const lead = add('lead');
    const wt = worktree(dir, 'n1');
    worker('n1', wt, { parent: lead });
    await assign(b, lead, 'n1');
    await until(() => toS(lead).length === 1, 8000);
    const msg = toS(lead)[0].text;
    assert.match(msg, /을 닫았다: ok/);
    assert.match(msg, /merger에게 맡기지 못해 너에게 그대로 보낸다\(merger를 띄울 하네스가 이 PC에 설치돼 있지 않다/);
    assert.equal(b.spawned.length, 0);
    const p = events.find(([e]) => e === 'merger.problem');
    assert.ok(p, '창에 알림');
    assert.match(p[1].why, /설치돼 있지 않다/);
    assert.match(M().status().problem.why, /설치돼 있지 않다/);
  } finally { await stop(); }
});

// ---------- P320(P318 S2): 같은 워크트리 보조 하위의 done ok는 병합 일로 넘기지 않는다 ----------
test('P320 판정(순수): 하위의 작업 트리 뿌리가 부모의 것과 같으면 parent_worktree(대소문자·빗금 무관), 다르면 지금처럼', () => {
  const p = { isWorktree: true, commonDir: 'C:/r/.git', root: 'C:/r/.claude/worktrees/lead', branch: 'worktree-lead', ahead: 2 };
  const v = (o) => mergeVerdict({ mode: 'on', probe: p, repoCommonDir: 'C:/r/.git', target: 'dev', ...o });
  assert.deepEqual(v({ parentRoot: 'c:\\r\\.claude\\worktrees\\lead' }), { route: false, why: 'parent_worktree', ask: false });
  assert.equal(v({ parentRoot: 'C:/r' }).why, 'ok', '부모가 본 체크아웃이면 자기 워크트리 하위 → 병합');
  assert.equal(v({ parentRoot: 'C:/r/.claude/worktrees/other' }).why, 'ok');
  assert.equal(v({ parentRoot: null }).why, 'ok', '부모 뿌리를 모르면 지금처럼');
  assert.equal(v({ parentRoot: p.root, mode: 'ask' }).ask, false, '물음 카드도 띄우지 않는다');
});

test('P320 흐름: 워크트리 리드가 --worktree 없이 띄운 보조 하위(같은 워크트리) done ok → 병합 일 없음·부모가 보고 받음, 자기 워크트리 하위 done ok → 지금처럼 병합', async () => {
  const { b, dir, add, worker, mergerAct, toS, stop } = await board();
  try {
    mergerAct(async () => ['ok', '합침 q']);
    const top = add('top');
    const lwt = worktree(dir, 'lead1');
    const lead = add('lead1', { cwd: lwt, parentSessionId: top.sessionId });
    const helper = worker('helper1', lwt, { parent: lead, text: 'helper1: 창 시안 끝냄' });
    await assign(b, lead, 'helper1');
    await until(() => helper.doneOut);
    assert.equal(helper.doneOut.claimedBy, 'queue', '병합 일이 아니라 보통 done');
    assert.equal(b.store.db.prepare("SELECT COUNT(*) AS n FROM work_units WHERE origin = 'merge'").get().n, 0, '병합 일 없음');
    assert.equal(b.spawned.length, 0, 'merger를 띄우지 않는다');
    assert.ok(!b.slept.some((x) => x.name === 'helper1'));
    await until(() => toS(lead).some((d) => /helper1: 창 시안 끝냄/.test(d.text)));
    const own = worker('own1', worktree(dir, 'own1'), { parent: lead });
    await assign(b, lead, 'own1');
    await until(() => own.doneOut);
    assert.equal(own.doneOut.claimedBy, 'merger', '자기 워크트리 하위는 지금처럼 병합');
    await until(() => b.spawned.length === 1);
  } finally { await stop(); }
});
