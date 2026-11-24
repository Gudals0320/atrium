// P257 시험: 문서 점검을 판의 기능으로(doc-check.mjs 점검 본체, doc-watch.mjs 판의 길목).
// 점검 항목(예산·합계, 허락한 꼴, PLAN 세 절, 끝남 표시, BRIEF 행, HEAD보다 커짐), 워크스페이스마다 문서 자리(.atrium/docs.json, 옛 예산 파일, 따로 받은 문서 저장소),
// .atrium/ 늦게 만들기와 .git/info/exclude, 한 줄 경고(막지 않음)가 지휘 세션 턴 끝과 done 알림에 붙는 것, 짧은 규칙을 싣는 때와 길이, 판 API와 atrium docs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; // 이슈 #18: 한글·공백 경로(URL 인코딩)
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { checkDocs, loadDocConfig, docsOn, warnLine, problemSig, docRules, DOC_DONE_LINE, workerTail, ensureAtriumDir, excludeFileOf, reportLines, WARN_MAX } from '../src/doc-check.mjs';
import { DocWatch, docHandlers } from '../src/doc-watch.mjs';
import { unitHeader, doneNotice } from '../src/work-units.mjs';
import { VERBS, VERB_NAMES } from '../src/cli-contract.mjs';
import { ATRIUM_ALLOW } from '../src/branch.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p257-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const g = (cwd, ...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const put = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
const PLAN_OK = '# 계획\n\n## 지금: 일 하나\n- a\n\n## 다음: 일 둘\n- b\n\n## 열린 결정\n- c\n';
const BRIEF_OK = '# 개요\n\n| 정한 것 | 까닭 |\n|---|---|\n| 짧은 행 | 짧다 |\n';
const ARCH_OK = '# 구조\n\n지금의 구조.\n';
// 문서가 맞는 저장소(git, 커밋 하나)
function repo({ docs = true, commit = true } = {}) {
  const root = tmp();
  g(root, 'init', '-q');
  put(root, 'README.md', '# 읽어 보기\n'); put(root, 'CLAUDE.md', '# 규칙\n');
  if (docs) { put(root, 'docs/BRIEF.md', BRIEF_OK); put(root, 'docs/ARCH.md', ARCH_OK); put(root, 'docs/PLAN.md', PLAN_OK); }
  if (commit) { g(root, 'add', '-A'); g(root, 'commit', '-q', '-m', 'x'); }
  return root;
}
const codes = (res) => res.problems.map((p) => p.code).sort();

// ---------- 1. 점검 항목 ----------
test('P257 점검: 맞는 문서는 어긴 것이 없고, 문서가 없는 워크스페이스는 꺼져 있다', async () => {
  const root = repo();
  const res = await checkDocs(root);
  assert.equal(res.on, true); assert.equal(res.dir, 'docs'); assert.equal(res.privateRepo, false);
  assert.deepEqual(res.problems, []);
  assert.ok(res.rows.some((r) => r.file === 'docs/ARCH.md') && res.rows.some((r) => r.file === 'CLAUDE.md'));
  assert.equal(problemSig(res), ''); assert.equal(warnLine(res), null);
  const bare = repo({ docs: false });
  const off = await checkDocs(bare);
  assert.equal(off.on, false); assert.equal(docsOn(bare), false);
  assert.match(reportLines(off)[0], /꺼짐/);
});

test('P257 점검: 파일 예산과 합계 예산(.atrium/docs.json)', async () => {
  const root = repo();
  put(root, '.atrium/docs.json', JSON.stringify({ budgets: { 'ARCH.md': 5 }, total: 30 }));
  const res = await checkDocs(root);
  assert.equal(res.source, '.atrium/docs.json');
  assert.deepEqual(codes(res), ['budget', 'total']);
  const b = res.problems.find((p) => p.code === 'budget');
  assert.equal(b.file, 'docs/ARCH.md'); assert.match(b.text, /예산 5자/);
  assert.equal(res.total.over, true);
});

test('P257 점검: 허락한 꼴(git 안의 마크다운만, info/exclude로 뺀 기록은 보지 않는다)', async () => {
  const root = repo();
  put(root, 'NOTES.md', '뿌리 메모'); put(root, 'docs/LESSON.md', '교훈'); put(root, 'docs/scratch/a.md', '임시');
  put(root, 'docs/research/r.md', '조사'); put(root, 'src/readme.md', '코드 옆 글'); // 허락: research/, 문서 자리 밖 폴더
  put(root, 'docs/log/p1.md', '기록'); put(root, 'docs/decisions.md', '결정 로그');
  fs.appendFileSync(path.join(root, '.git', 'info', 'exclude'), '\n/docs/decisions.md\n/docs/log/\n');
  put(root, 'docs/old.md', '무시된 것'); put(root, '.gitignore', 'docs/old.md\n');
  const res = await checkDocs(root);
  const shape = res.problems.filter((p) => p.code === 'shape').map((p) => p.file).sort();
  assert.deepEqual(shape, ['NOTES.md', 'docs/LESSON.md', 'docs/scratch/a.md']);
});

test('P257 점검: PLAN의 세 절과 끝남 표시, BRIEF 행', async () => {
  const root = repo();
  put(root, 'docs/PLAN.md', '# 계획\n\n## 지금: 일\n- (P12) 끝남\n\n## 메모\n- x\n');
  put(root, 'docs/BRIEF.md', BRIEF_OK + '| ' + 'ㄱ'.repeat(520) + ' | 길다 |\n');
  const res = await checkDocs(root);
  assert.deepEqual(codes(res), ['brief_row', 'growth', 'plan_done', 'plan_missing', 'plan_sections'], 'BRIEF는 긴 행만큼 HEAD보다 커졌다');
  assert.match(res.problems.find((p) => p.code === 'plan_sections').text, /## 메모/);
  assert.match(res.problems.find((p) => p.code === 'plan_missing').text, /다음, 열린 결정/);
  assert.match(res.problems.find((p) => p.code === 'plan_done').text, /끝남 표시 2개/);
});

test('P257 점검: HEAD보다 커졌는지(git diff만), 커밋하면 사라진다', async () => {
  const root = repo();
  put(root, 'docs/ARCH.md', ARCH_OK + '덧붙인 문단. '.repeat(200));
  let res = await checkDocs(root);
  assert.deepEqual(codes(res), ['growth']);
  assert.match(res.problems[0].text, /docs\/ARCH\.md가 HEAD보다 [\d,]+자 커졌다/);
  put(root, 'docs/BRIEF.md', BRIEF_OK + '조금'); // 허용(+500) 안
  res = await checkDocs(root);
  assert.deepEqual(codes(res), ['growth']);
  g(root, 'add', '-A'); g(root, 'commit', '-q', '-m', 'y');
  res = await checkDocs(root);
  assert.deepEqual(res.problems, []);
});

test('P257 문서 자리: 따로 받은 문서 저장소(docs/.git), 옛 예산 파일, dir 바꾸기, 끄기', async () => {
  // 공개 저장소 + 비공개 문서 저장소(multitask의 꼴): 문서는 공개 저장소 git 밖
  const root = repo({ docs: false });
  fs.appendFileSync(path.join(root, '.git', 'info', 'exclude'), '\n/docs/\n');
  const docs = path.join(root, 'docs'); fs.mkdirSync(docs);
  g(docs, 'init', '-q');
  put(docs, 'BRIEF.md', BRIEF_OK); put(docs, 'ARCH.md', ARCH_OK); put(docs, 'PLAN.md', PLAN_OK); put(docs, 'testing.md', '# 시험\n');
  put(docs, '.docs-budget.json', JSON.stringify({ budgets: { 'docs/ARCH.md': 60000 }, total: 105000 })); // 옛 꼴 키
  fs.appendFileSync(path.join(docs, '.git', 'info', 'exclude'), '\n/log/\n/decisions.md\n');
  put(docs, 'log/p1.md', '기록'); put(docs, 'decisions.md', '옛 결정 로그');
  g(docs, 'add', '-A'); g(docs, 'commit', '-q', '-m', 'docs');
  let res = await checkDocs(root);
  assert.equal(res.privateRepo, true); assert.equal(res.source, 'docs/.docs-budget.json');
  assert.equal(loadDocConfig(root).config.budgets['ARCH.md'], 60000);
  assert.equal(res.total.budget, 105000);
  assert.deepEqual(res.problems, []);
  put(docs, 'ARCH.md', ARCH_OK + '가'.repeat(1500)); put(docs, 'NOTE.md', '꼴 밖');
  res = await checkDocs(root);
  assert.deepEqual(codes(res), ['growth', 'shape'], '커짐은 문서 저장소의 HEAD로, 꼴은 문서 저장소의 git 목록으로');
  // dir 바꾸기(.atrium/docs.json)
  const r2 = repo({ docs: false });
  put(r2, 'notes/BRIEF.md', BRIEF_OK); put(r2, 'notes/PLAN.md', '## 이상한 절\n');
  put(r2, '.atrium/docs.json', JSON.stringify({ dir: 'notes' }));
  res = await checkDocs(r2);
  assert.equal(res.on, true); assert.equal(res.dir, 'notes');
  assert.ok(res.problems.some((p) => p.code === 'plan_sections' && p.file === 'notes/PLAN.md'));
  // 끄기
  put(r2, '.atrium/docs.json', JSON.stringify({ dir: 'notes', off: true }));
  assert.equal(docsOn(r2), false); assert.equal((await checkDocs(r2)).on, false);
  // 잘못된 설정은 기본으로 돌고 까닭을 남긴다
  const r3 = repo(); put(r3, '.atrium/docs.json', '{ 깨짐');
  res = await checkDocs(r3);
  assert.equal(res.on, true); assert.match(res.note, /docs\.json을 읽지 못했다/);
});

// ---------- 2. 한 줄 경고와 짧은 규칙 ----------
test('P257 한 줄 경고: 판 알림 꼴 한 줄, 앞의 둘과 수, 상한', async () => {
  const many = { problems: Array.from({ length: 6 }, (_, i) => ({ code: 'c' + i, file: 'f' + i, text: 'x', short: '문제 ' + i + ' ' + '가'.repeat(120) })) };
  const line = warnLine(many);
  assert.ok(line.startsWith('[Atrium 보드] 문서 점검(막지 않는다): '));
  assert.ok(!line.includes('\n')); assert.ok(line.length <= WARN_MAX);
  const two = warnLine({ problems: many.problems.slice(0, 3).map((p) => ({ ...p, short: '짧음' })) });
  assert.match(two, /짧음; 짧음 외 1개\. 자세히: atrium docs$/);
});

test('P257 짧은 규칙: 길이와 내용(규칙 묶음 2천 자 이하, 한 줄, 일 머리 한 마디)', () => {
  const rules = docRules('docs');
  assert.ok(rules.length <= 2000 && rules.length >= 200, String(rules.length));
  for (const w of ['BRIEF', 'ARCH', 'PLAN', '지금 / 다음 / 열린 결정', '합쳐진 뒤', '보고만', 'ARCH·PLAN과 다르면']) assert.ok(rules.includes(w), w);
  assert.ok(!rules.includes('\n'));
  assert.ok(DOC_DONE_LINE.startsWith('[Atrium 보드] ') && DOC_DONE_LINE.length < 200);
  const tail = workerTail('docs');
  assert.match(tail, /문서\(docs\/\)는 고치지 않고 바꿀 문장을 done 보고에 적는다/);
  const h = unitHeader({ parent: 'lead', unitId: 'u1', docs: tail });
  assert.equal(h.split('\n').length, 3, '판 줄은 세 줄 그대로');
  assert.ok(h.split('\n')[2].endsWith(tail));
  assert.equal(unitHeader({ parent: 'lead', unitId: 'u1' }), unitHeader({ parent: 'lead', unitId: 'u1', docs: null }));
  const n = doneNotice({ child: 'w', unitId: 'u1', result: 'ok', text: '보고', spec: '일', extra: [DOC_DONE_LINE] });
  assert.ok(n.endsWith('보고\n\n' + DOC_DONE_LINE));
  assert.equal(doneNotice({ child: 'w', unitId: 'u1', result: 'ok', text: '보고', spec: '일' }).endsWith('보고'), true);
});

// ---------- 3. .atrium/ 늦게 만들기와 .git/info/exclude ----------
test('P257 .atrium/: 만들고 info/exclude에 한 번만(.gitignore는 건드리지 않는다), 워크트리는 공통 git 폴더', () => {
  const root = repo();
  assert.equal(fs.existsSync(path.join(root, '.atrium')), false);
  const r = ensureAtriumDir(root);
  assert.deepEqual([r.created, r.excluded], [true, true]);
  assert.ok(fs.statSync(path.join(root, '.atrium')).isDirectory());
  put(root, '.atrium/log/x.md', '기록');
  assert.equal(g(root, 'status', '--porcelain', '--untracked-files=all').includes('.atrium'), false, 'git 밖');
  assert.equal(fs.existsSync(path.join(root, '.gitignore')), false);
  const again = ensureAtriumDir(root);
  assert.deepEqual([again.created, again.excluded], [false, false]);
  const ex = fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8');
  assert.equal(ex.split('\n').filter((l) => l.trim() === '/.atrium/').length, 1);
  // git 워크트리(.git이 파일): 공통 git 폴더의 info/exclude
  const wt = path.join(tmp(), 'wt');
  g(root, 'worktree', 'add', '-q', wt);
  assert.equal(path.resolve(excludeFileOf(wt)), path.resolve(root, '.git', 'info', 'exclude'));
  // git이 아니면 exclude 없음
  const plain = tmp();
  assert.equal(excludeFileOf(plain), null);
});

// ---------- 4. 판: 지휘 세션 턴 끝·done 알림(진짜 저장소·전달 대기열·Branch, 가짜 에이전트) ----------
async function board(dir) {
  const store = new Store(path.join(tmp(), 'board.db')); // 판의 저장소는 워크스페이스 밖
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p257test', port: 0, dataDir: tmp(), sessionsDir: path.join(tmp(), 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const b = {
    cfg, apiToken: 't', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), sent: [], rig: null, features: null, touch: () => {},
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
    broadcastSession(s) { if (b.sessions.has(s.sessionId)) b.bus.emit('session', s, b.summary(s)); },
    async spawn(p) { const s = add(p.name, { parentSessionId: p.parentSessionId || null }); if (p.branch) b.branch.noteChild(s.sessionId, p.branch); return { sessionId: s.sessionId, trust: { needsTrust: false } }; },
    pushTree() { return []; },
    closeSession(s, reason) { b.sessions.delete(s.sessionId); b.bus.emit('closed', s, reason); },
    resolveWorkspace: async () => ({ key: ws.key }),
  };
  b.queue = new DeliveryQueue({
    store, cfg,
    view: (sid) => { const s = b.sessions.get(sid); if (!s) return { closed: true }; return { state: deriveState(s.rt).state, agentPresent: s.rt.term.present, termConnected: true, lastUserInputAt: 0, closed: false, kind: s.kind, hooked: b.hooked(s) }; },
    inspect: async () => ({ box: 'empty', seen: false }),
    send: async (sid, text) => { if (b.stopped) return; b.sent.push({ sid, text }); const s = b.sessions.get(sid); if (s && s.agent) setTimeout(() => s.agent(text), 5); },
  });
  b.queue.beforeDeliver = (d) => (b.docs ? b.docs.beforeDeliver(d) : undefined); // backend.mjs와 같은 잇기
  b.queue.start();
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 40, verbs: { pollMs: 15, settleMs: 800, turnGraceMs: 300, answerGraceMs: 200 } });
  // P288: 점검(git 여러 번)은 PC가 바쁘면 판의 상한(DOC_WAIT_MS 3초)을 넘는다. 이 시험은 경고가 알림에 실리는지를 보므로
  // 전달이 점검 끝을 기다리게 상한을 넉넉히 둔다(점검이 끝나면 곧바로 보내므로 평소에는 느려지지 않는다). 상한을 넘으면 그냥 보내는 동작은 '전달' 시험이 본다
  b.docs.waitMs = 60000;
  b.queue.on('delivery', (d) => { if (['confirmed', 'unconfirmed', 'failed', 'cancelled'].includes(d.status)) b.branch.onDeliveryEnd(d); });
  const add = (name, { workMs = 60, onText = null, ...extra } = {}) => {
    const s = { sessionId: crypto.randomUUID(), name, cwd: dir, paneId: name + ':p1', agentName: name, permissionMode: 'manual', kind: 'claude', origin: 'board', parentSessionId: null, workspaceKey: ws.key, rt: newRuntime({ kind: 'claude', hooked: true }), createdAt: Date.now(), ...extra };
    s.rt.term.present = true; s.rt.phase = 'running'; applyTermStatus(s.rt, 'idle');
    store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
    b.sessions.set(s.sessionId, s);
    s.texts = [];
    s.agent = (text) => {
      s.texts.push(text);
      applyHook(s.rt, { hook_event_name: 'UserPromptSubmit', prompt: text }); b.queue.onUserPromptSubmit(s.sessionId, text); applyTermStatus(s.rt, 'working');
      b.broadcastSession(s);
      setTimeout(async () => {
        if (b.stopped) return;
        const h = s.onText || onText;
        if (h) try { await h(text, s); } catch (e) { s.err = e; }
        if (b.stopped) return;
        applyHook(s.rt, { hook_event_name: 'Stop', last_assistant_message: '답' }); applyTermStatus(s.rt, 'idle');
        b.broadcastSession(s);
      }, workMs);
    };
    b.broadcastSession(s);
    return s;
  };
  // 사람이 그 세션에게 일을 시켜 한 턴 돌린다
  // 턴 끝에 판이 시작한 점검이 끝날 때까지 기다린다(고정 틈이 아니라 점검 끝이라는 사건으로)
  const turn = async (s) => { const n = s.texts.length; b.queue.enqueue(s.sessionId, '사람의 일 ' + n, { origin: { kind: 'human' } }); await until(() => s.texts.length === n + 1 && deriveState(s.rt).state === 'ready'); await tick(50); await until(() => !b.docs.waiting.has(s.sessionId)); };
  const stop = async () => { b.stopped = true; b.queue.stop(); b.branch.notices.stop(); b.branch.units.stops.stop(); await tick(200); store.close(); };
  return { b, ws, add, turn, stop };
}
const evs = (b, kind) => b.store.db.prepare('SELECT * FROM events WHERE kind = ? ORDER BY id').all(kind).map((e) => ({ ...e, data: JSON.parse(e.data || 'null') }));

test('P257 판: 첫 위임에 .atrium/(git 밖), 일 머리에 문서 한 마디, done 알림에 규칙과 경고, 지휘 세션 턴 끝 한 줄(막지 않음)', async () => {
  const root = repo();
  put(root, '.atrium/docs.json', '{ "budgets": { "ARCH.md": 5 } }'); // 예산을 넘긴 저장소(.atrium/은 지우고 시작)
  const cfgText = fs.readFileSync(path.join(root, '.atrium', 'docs.json'), 'utf8');
  fs.rmSync(path.join(root, '.atrium'), { recursive: true });
  put(root, '.atrium-docs.json', cfgText); // 잠시 밖에
  const { b, add, turn, stop } = await board(root);
  try {
    const lead = add('lead');
    const report = '했다. ARCH 5절이 바뀐다.';
    // 첫 위임 전에는 .atrium/이 없다
    assert.equal(fs.existsSync(path.join(root, '.atrium')), false);
    let w1;
    const r = await b.branch.spawnChild(lead, { name: 'w1', prompt: '첫 일', wait: false });
    assert.ok(r.firstPrompt.unit);
    assert.ok(fs.existsSync(path.join(root, '.atrium')), '첫 위임 때 만든다');
    assert.ok(fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8').includes('/.atrium/'));
    assert.equal(evs(b, 'atrium_dir').length, 1);
    fs.renameSync(path.join(root, '.atrium-docs.json'), path.join(root, '.atrium', 'docs.json')); // 이제 예산 설정
    w1 = [...b.sessions.values()].find((x) => x.name === 'w1');
    w1.onText = async (text, s) => { if (text.includes('첫 일')) await b.branch.units.done(s, { result: 'ok', text: report }); };
    await until(() => w1.texts.length === 1);
    const head = w1.texts[0].split('\n');
    assert.ok(head[2].endsWith(workerTail('docs')), '일 머리 셋째 줄 끝');
    // done 알림: 규칙 묶음(첫 done) + 경고 한 줄(점검이 도는 동안 잠깐 붙잡아 그 알림에 싣는다)
    await until(() => lead.texts.length === 1);
    const notice = lead.texts[0];
    assert.match(notice, /^\[Atrium 보드\] @w1가 일 u/);
    assert.ok(notice.includes(report));
    assert.ok(notice.includes(docRules('docs')), '첫 done에는 규칙 묶음');
    const warn = notice.split('\n').pop();
    assert.match(warn, /^\[Atrium 보드\] 문서 점검\(막지 않는다\): ARCH\.md [\d,]+자 > 5\. 자세히: atrium docs$/);
    assert.equal(evs(b, 'doc_check').at(-1).data.why, 'done');
    // 하위(일 상위가 있는 세션)의 턴 끝에는 점검하지 않는다
    assert.equal(evs(b, 'doc_check').filter((e) => e.session_id === w1.sessionId).length, 0);
    await until(() => deriveState(lead.rt).state === 'ready'); await tick(150);
    // 지휘 세션 턴 끝: 같은 문제는 되풀이하지 않는다
    const nWarn = evs(b, 'doc_warn').length;
    await turn(lead);
    await turn(lead);
    assert.ok(!lead.texts.at(-1).includes('문서 점검'), '같은 문제는 다시 붙지 않는다');
    assert.equal(evs(b, 'doc_warn').length, nWarn);
    // 문제가 바뀌면 다음 지시 끝에 한 줄(막지 않는다: 글은 그대로 들어간다)
    put(root, 'docs/PLAN.md', PLAN_OK + '\n## 메모\n- x\n');
    await turn(lead); // 이 턴 끝에 점검
    await turn(lead); // 다음 지시에 경고
    const last = lead.texts.at(-1);
    assert.ok(last.startsWith('사람의 일'), '지시는 그대로');
    assert.match(last.split('\n').pop(), /^\[Atrium 보드\] 문서 점검\(막지 않는다\): ARCH\.md .*; PLAN 절 밖 1개\. 자세히: atrium docs$/);
    // 두 번째 done: 규칙은 한 줄
    await b.branch.verbs.prompt(lead, { name: 'w1', text: '둘째 일' });
    w1.onText = async (text, s) => { if (text.includes('둘째 일')) await b.branch.units.done(s, { result: 'ok', text: '둘째 보고' }); };
    await until(() => lead.texts.some((t) => t.includes('둘째 보고')));
    const n2 = lead.texts.find((t) => t.includes('둘째 보고'));
    assert.ok(n2.includes(DOC_DONE_LINE) && !n2.includes(docRules('docs')));
    assert.match(n2.split('\n').pop(), /문서 점검\(막지 않는다\)/, 'done 알림은 같은 문제여도 경고를 싣는다');
    // 고치면 조용하다
    fs.rmSync(path.join(root, '.atrium', 'docs.json')); put(root, 'docs/PLAN.md', PLAN_OK);
    await turn(lead); await turn(lead);
    assert.ok(!lead.texts.at(-1).includes('문서 점검'));
  } finally { await stop(); }
});

test('P257 판: 문서가 없는 워크스페이스는 아무것도 싣지 않고, 사람이 정한 지휘 세션(leads)만 본다', async () => {
  const root = repo({ docs: false });
  const { b, add, turn, stop } = await board(root);
  try {
    const lead = add('lead');
    await b.branch.spawnChild(lead, { name: 'w1', prompt: '일', wait: false });
    const w1 = [...b.sessions.values()].find((x) => x.name === 'w1');
    await until(() => w1.texts.length === 1);
    assert.ok(!w1.texts[0].includes('문서('), '문서가 없으면 머리에 한 마디도 없다');
    assert.deepEqual(b.docs.doneLines(lead), []);
    // 문서가 생기고 leads가 정해지면 그 세션만
    put(root, 'docs/PLAN.md', '## 이상\n');
    put(root, '.atrium/docs.json', JSON.stringify({ leads: ['boss'] }));
    const boss = add('boss');
    assert.equal(b.docs.isLead(lead, root), false); assert.equal(b.docs.isLead(boss, root), true);
    await turn(lead);
    assert.equal(evs(b, 'doc_check').filter((e) => e.session_id === lead.sessionId).length, 0);
    await turn(boss);
    assert.equal(evs(b, 'doc_check').filter((e) => e.session_id === boss.sessionId).length, 1);
  } finally { await stop(); }
});

test('P257 전달: 점검이 도는 동안 잠깐 붙잡고(waitMs 뒤에는 그냥 보낸다), 스티어링·다시 보내기에는 붙이지 않는다', async () => {
  const root = repo();
  let release; const slow = new Promise((r) => { release = r; });
  const st = { getWorkspace: () => ({ root }), unitsFrom: () => [{}], addEvent: () => {}, updateDeliveryText: () => {} };
  const w = new DocWatch({ store: st, log: () => {} }, null, { waitMs: 60, checker: async () => { await slow; return { problems: [{ code: 'budget', file: 'x', short: '넘음', text: 'x' }] }; } });
  const s = { sessionId: 's1', name: 'lead', workspaceKey: 'k' };
  const p = w.runFor(s, root, { force: true });
  const d = { deliveryId: 'd1', sessionId: 's1', text: '글', attempts: 0 };
  assert.equal(w.beforeDeliver(d), 'wait');
  await tick(80);
  assert.equal(w.beforeDeliver(d), undefined, '상한이 지나면 기다리지 않는다');
  assert.equal(d.text, '글');
  release(); await p;
  assert.equal(w.beforeDeliver({ deliveryId: 'd2', sessionId: 's1', text: '스티어', typeNow: true, attempts: 0 }), undefined);
  assert.equal(w.pending.has('s1'), true, '스티어링에는 싣지 않고 남겨 둔다');
  const d3 = { deliveryId: 'd3', sessionId: 's1', text: '다음', attempts: 0 };
  w.beforeDeliver(d3);
  assert.equal(d3.text, '다음\n\n[Atrium 보드] 문서 점검(막지 않는다): 넘음. 자세히: atrium docs');
  assert.equal(w.pending.has('s1'), false);
});

// ---------- 5. 판 API·atrium docs·계약 ----------
test('P257 판 API: docs.status, 켜기(.atrium/·exclude·docs.json)·끄기는 이 PC의 판 토큰만', async () => {
  const root = repo();
  const ws = await workspaceOf(root);
  const store = new Store(path.join(tmp(), 'board.db'));
  store.insertWorkspace({ ...ws, createdAt: 1 });
  try {
    const h = docHandlers({ store, resolveWorkspace: async () => ({ key: ws.key }) });
    const st = await h['docs.status']({});
    assert.equal(st.on, true); assert.ok(Array.isArray(st.lines));
    await assert.rejects(h['docs.enable']({}, { auth: { kind: 'device' } }), (e) => e.code === 'forbidden');
    const on = await h['docs.enable']({ dir: 'docs' }, { auth: { kind: 'local' } });
    assert.equal(on.created, true); assert.equal(on.present, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, '.atrium', 'docs.json'), 'utf8')), { dir: 'docs' });
    await h['docs.disable']({}, { auth: { kind: 'local' } });
    assert.equal(docsOn(root), false);
    await h['docs.enable']({}, { auth: { kind: 'local' } });
    assert.equal(docsOn(root), true);
  } finally { store.close(); }
});

test('P257 계약: docs 동사(더하기만), 옛 docs-guard는 없다', () => {
  assert.ok(VERB_NAMES.includes('docs'));
  const v = VERBS.find((x) => x.name === 'docs');
  assert.equal(v.args.at(-1), '[--json]'); assert.ok(v.out.includes('problems'));
  for (const r of ['Bash(atrium docs)', 'Bash(atrium docs *)', 'PowerShell(atrium docs)']) assert.ok(ATRIUM_ALLOW.includes(r), r + ': 판이 띄운 세션이 묻지 않고 친다');
  const here = path.dirname(fileURLToPath(import.meta.url));
  assert.equal(fs.existsSync(path.join(here, '..', '..', 'scripts', 'docs-guard.mjs')), false);
  const settings = fs.readFileSync(path.join(here, '..', '..', '.claude', 'settings.json'), 'utf8');
  assert.ok(!settings.includes('docs-guard') && !settings.includes('check-docs'));
});
