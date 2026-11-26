// P346 시험: 문서 시작(살아 있는 문서가 없는 저장소). 지휘 세션의 첫 위임 때 다음 전달 앞에 한 줄 알림(워크스페이스마다 한 번, 문서가 있거나 꺼졌으면 없음),
// atrium docs init(없는 파일만 만들고 있는 파일은 덮지 않음, .atrium/docs.json 예산, 화면 언어), atrium docs on|off(지휘 세션만), 계약 10과 허용 동사, 문서 규칙 글.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { checkDocs, loadDocConfig, docsOn, docRules, DOC_DONE_LINE, DOC_START_LINE, DOC_TEMPLATES, initDocs, needsDocStart, parseOnly, roomyBudget, INIT_NEXT, DOCS_CONFIG } from '../src/doc-check.mjs';
import { DocWatch, docHandlers } from '../src/doc-watch.mjs';
import { CONTRACT_VERSION, VERBS, contractJson } from '../src/cli-contract.mjs';
import { ORCH_SUB_VERBS, LEAD_ONLY_SUBS, permOf, opRefusal } from '../src/orchestration.mjs';
import { VERB_BRIEF } from '../src/verbs-notice.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p346-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const g = (cwd, ...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const put = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
function repo({ files = {} } = {}) {
  const root = tmp();
  g(root, 'init', '-q');
  put(root, 'README.md', '# 읽어 보기\n');
  for (const [k, v] of Object.entries(files)) put(root, k, v);
  g(root, 'add', '-A'); g(root, 'commit', '-q', '-m', 'x');
  return root;
}

// ---------- 1. 알림 조건 ----------
test('P346 알림 조건: git이고 BRIEF·ARCH·PLAN도 docs.json도 없을 때만', () => {
  const bare = repo();
  assert.equal(needsDocStart(bare), true);
  assert.equal(needsDocStart(tmp()), false, 'git이 아니면 없다');
  assert.equal(needsDocStart(null), false);
  assert.equal(needsDocStart(repo({ files: { 'docs/BRIEF.md': '# b\n' } })), false, 'BRIEF가 있으면 없다');
  assert.equal(needsDocStart(repo({ files: { 'docs/PLAN.md': '# p\n' } })), false);
  const withCfg = repo(); put(withCfg, DOCS_CONFIG, '{}');
  assert.equal(needsDocStart(withCfg), false, 'docs.json이 있으면 없다');
  const offed = repo(); put(offed, DOCS_CONFIG, '{ "off": true }');
  assert.equal(needsDocStart(offed), false, 'off면 없다');
  const legacy = repo({ files: { '.docs-budget.json': '{}' } });
  assert.equal(needsDocStart(legacy), false, '옛 예산 파일도 설정으로 본다');
  assert.ok(DOC_START_LINE.startsWith('[Atrium 보드] ') && DOC_START_LINE.length < 220);
  for (const w of ['atrium docs init', 'BRIEF', 'ARCH', 'PLAN', 'CLAUDE.md', 'atrium docs off']) assert.ok(DOC_START_LINE.includes(w), w);
});

// ---------- 2. init ----------
test('P346 init: 없는 것만 만들고 있는 것은 그대로, docs.json 예산(기존 문서는 넉넉히), 만든 뒤 점검이 켜지고 어긴 것이 없다', async () => {
  const claude = '# 규칙\n' + '사실 한 줄.\n'.repeat(900); // 4,000자를 넘는 CLAUDE.md
  const brief = '# 우리 BRIEF\n\n손으로 쓴 것.\n';
  const root = repo({ files: { 'CLAUDE.md': claude, 'docs/BRIEF.md': brief, 'docs/notes.md': '메모 '.repeat(300) } });
  const r = initDocs(root, { lang: 'ko' });
  assert.deepEqual(r.created.sort(), ['docs/ARCH.md', 'docs/PLAN.md']);
  assert.deepEqual(r.skipped, ['docs/BRIEF.md']);
  assert.equal(read(root, 'docs/BRIEF.md'), brief, '있는 파일은 덮지 않는다');
  assert.equal(read(root, 'docs/PLAN.md'), DOC_TEMPLATES.ko['PLAN.md']);
  assert.equal(read(root, 'docs/ARCH.md'), DOC_TEMPLATES.ko['ARCH.md']);
  assert.ok(read(root, 'docs/ARCH.md').includes('코드·데이터·흐름'), 'ARCH 풀이는 넓게');
  const cfg = JSON.parse(read(root, DOCS_CONFIG));
  assert.equal(cfg.dir, 'docs'); assert.equal(cfg.off, undefined);
  const claudeChars = [...claude].length;
  assert.ok(cfg.budgets['CLAUDE.md'] > claudeChars && cfg.budgets['CLAUDE.md'] === roomyBudget(claudeChars, 4000), 'CLAUDE.md는 지금 크기보다 넉넉히');
  assert.equal(cfg.budgets['AGENTS.md'], undefined, '없는 AGENTS.md는 적지 않는다');
  assert.ok(cfg.budgets['notes.md'] > 900, '기존 docs/*.md도 예산과 함께');
  assert.equal(cfg.budgets['PLAN.md'], 15000); assert.equal(cfg.budgets['ARCH.md'], 40000);
  assert.ok(cfg.total >= 70000);
  assert.ok(fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8').includes('/.atrium/'), '.atrium/은 git 밖');
  assert.equal(docsOn(root), true);
  const res = await checkDocs(root);
  assert.deepEqual(res.problems.map((p) => p.code), [], '틀과 기존 문서로 어긴 것이 없다(notes.md도 허락)');
  assert.equal(r.next.length, 3); assert.deepEqual(r.next, INIT_NEXT);
  assert.ok(r.lines.join('\n').includes('--record') && r.lines.join('\n').includes('atrium plan'));
  // 다시 부르면 아무것도 만들지 않고 사람이 적은 값은 그대로
  cfg.budgets['CLAUDE.md'] = 9999; cfg.leads = ['boss']; cfg.off = true;
  put(root, DOCS_CONFIG, JSON.stringify(cfg));
  const again = initDocs(root, { lang: 'en' });
  assert.deepEqual(again.created, []); assert.equal(again.skipped.length, 3);
  const cfg2 = JSON.parse(read(root, DOCS_CONFIG));
  assert.equal(cfg2.budgets['CLAUDE.md'], 9999); assert.deepEqual(cfg2.leads, ['boss']); assert.equal(cfg2.off, undefined, 'init은 켜기다');
});

test('P346 init: 영어 틀도 점검에 맞고(Now / Next / Open decisions), --only·--dir, 잘못된 값과 설정은 거절', async () => {
  const root = repo();
  const r = initDocs(root, { lang: 'en' });
  assert.equal(r.lang, 'en');
  assert.ok(read(root, 'docs/PLAN.md').includes('## Open decisions'));
  assert.ok(read(root, 'docs/BRIEF.md').includes('| Topic | Decision | Reason |'));
  const res = await checkDocs(root);
  assert.deepEqual(res.problems, [], '영어 PLAN 절도 세 절로 본다');
  const one = repo();
  const r1 = initDocs(one, { only: 'plan', dir: 'notes' });
  assert.deepEqual(r1.created, ['notes/PLAN.md']);
  assert.equal(fs.existsSync(path.join(one, 'notes', 'BRIEF.md')), false);
  assert.equal(loadDocConfig(one).config.dir, 'notes');
  assert.deepEqual(parseOnly('brief, arch'), ['BRIEF.md', 'ARCH.md']);
  assert.deepEqual(parseOnly(undefined), ['BRIEF.md', 'ARCH.md', 'PLAN.md']);
  assert.throws(() => parseOnly('readme'), /--only/);
  assert.throws(() => initDocs(repo(), { dir: '../out' }), /상대 경로/);
  const bad = repo(); put(bad, DOCS_CONFIG, '{ nope');
  assert.throws(() => initDocs(bad, {}), (e) => e.code === 'bad_config');
  assert.equal(fs.existsSync(path.join(bad, 'docs', 'BRIEF.md')), false, '설정을 못 읽으면 아무것도 만들지 않는다');
});

// ---------- 3. 판: 알림 한 번, init, 규칙 ----------
async function board(dir) {
  const store = new Store(path.join(tmp(), 'board.db')); // 판의 저장소는 워크스페이스 밖
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p346test', port: 0, dataDir: tmp(), sessionsDir: path.join(tmp(), 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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

test('P346 판: 지휘 세션의 첫 위임 → 다음 전달 앞에 알림 한 줄(한 번), 워커는 init 거절, 지휘 세션 init 뒤 done에 문서 규칙', async () => {
  const root = repo({ files: { 'CLAUDE.md': '# 규칙\n' } });
  const { b, add, stop } = await board(root);
  b.features = { settings: { get: () => ({ language: 'ko' }) } };
  try {
    const lead = add('lead');
    await b.branch.spawnChild(lead, { name: 'w1', prompt: '첫 일', wait: false });
    const w1 = [...b.sessions.values()].find((x) => x.name === 'w1');
    w1.onText = async (text, s) => { if (text.includes('첫 일')) await b.branch.units.done(s, { result: 'ok', text: '첫 보고' }); };
    await until(() => w1.texts.length === 1);
    assert.ok(!w1.texts[0].includes(DOC_START_LINE), '워커의 일 머리에는 없다');
    await until(() => lead.texts.length === 1);
    assert.ok(lead.texts[0].startsWith(DOC_START_LINE + '\n'), '리드의 다음 전달 앞에');
    assert.ok(!lead.texts[0].includes(docRules('docs')), '문서가 없으면 규칙은 없다');
    assert.equal(evs(b, 'doc_start').length, 1);
    assert.ok(b.store.getMeta('docsStart:' + lead.workspaceKey));
    // 워커는 문서를 시작하지 못한다
    await assert.rejects(b.branch.dispatch('docs', w1, { action: 'init' }), (e) => e.code === 'not_lead');
    await assert.rejects(b.branch.dispatch('docs', w1, { action: 'off' }), (e) => e.code === 'not_lead');
    await assert.rejects(b.branch.dispatch('docs', lead, { action: 'bogus' }), (e) => e.code === 'bad_request');
    // 둘째 위임(같은 워크스페이스)에는 다시 알리지 않는다
    await until(() => deriveState(lead.rt).state === 'ready'); await tick(100);
    await b.branch.spawnChild(lead, { name: 'w2', prompt: '둘째 일', wait: false });
    const w2 = [...b.sessions.values()].find((x) => x.name === 'w2');
    w2.onText = async (text, s) => { if (text.includes('둘째 일')) await b.branch.units.done(s, { result: 'ok', text: '둘째 보고' }); };
    await until(() => lead.texts.some((t) => t.includes('둘째 보고')));
    assert.ok(!lead.texts.find((t) => t.includes('둘째 보고')).includes(DOC_START_LINE), '한 번만');
    // 지휘 세션이 문서를 시작한다(화면 언어 ko)
    const r = await b.branch.dispatch('docs', lead, { action: 'init' });
    assert.equal(r.action, 'init'); assert.equal(r.lang, 'ko');
    assert.deepEqual(r.created.sort(), ['docs/ARCH.md', 'docs/BRIEF.md', 'docs/PLAN.md']);
    assert.equal(read(root, 'docs/PLAN.md'), DOC_TEMPLATES.ko['PLAN.md']);
    const st = await b.branch.dispatch('docs', lead, {});
    assert.equal(st.on, true); assert.equal(st.lead, true);
    // 이제 done 알림에 문서 규칙이 실린다(첫 번째는 묶음)
    await until(() => deriveState(lead.rt).state === 'ready'); await tick(100);
    await b.branch.verbs.prompt(lead, { name: 'w1', text: '셋째 일' });
    w1.onText = async (text, s) => { if (text.includes('셋째 일')) await b.branch.units.done(s, { result: 'ok', text: '셋째 보고' }); };
    await until(() => lead.texts.some((t) => t.includes('셋째 보고')));
    const n3 = lead.texts.find((t) => t.includes('셋째 보고'));
    assert.ok(n3.includes(docRules('docs')), 'init 뒤 done에는 규칙 묶음');
    assert.ok(!n3.includes(DOC_START_LINE));
    // 끄고 켜기
    const off = await b.branch.dispatch('docs', lead, { action: 'off' });
    assert.equal(off.off, true); assert.equal(docsOn(root), false);
    const on = await b.branch.dispatch('docs', lead, { action: 'on' });
    assert.equal(on.off, false); assert.equal(docsOn(root), true);
    assert.equal(evs(b, 'docs_init').length, 1); assert.equal(evs(b, 'docs_off').length, 1); assert.equal(evs(b, 'docs_on').length, 1);
  } finally { await stop(); }
});

test('P346 판: BRIEF가 있는 저장소·꺼 둔 저장소에는 알림이 없고 init은 덮지 않는다', async () => {
  const brief = '# 있는 BRIEF\n';
  for (const files of [{ 'docs/BRIEF.md': brief }, { '.atrium/docs.json': '{ "off": true }' }]) {
    const root = repo({ files });
    const { b, add, stop } = await board(root);
    try {
      const lead = add('lead');
      await b.branch.spawnChild(lead, { name: 'w1', prompt: '일', wait: false });
      const w1 = [...b.sessions.values()].find((x) => x.name === 'w1');
      w1.onText = async (text, s) => { if (text.includes('일')) await b.branch.units.done(s, { result: 'ok', text: '보고' }); };
      await until(() => lead.texts.length === 1);
      assert.ok(!lead.texts[0].includes(DOC_START_LINE));
      assert.equal(evs(b, 'doc_start').length, 0);
      if (files['docs/BRIEF.md']) {
        const r = await b.branch.dispatch('docs', lead, { action: 'init' });
        assert.deepEqual(r.skipped, ['docs/BRIEF.md']); assert.equal(read(root, 'docs/BRIEF.md'), brief);
      }
    } finally { await stop(); }
  }
});

test('P346 알림: 실은 전달이 실패하면 다음 전달에 다시, 그새 문서가 생기면 싣지 않는다', () => {
  const root = repo();
  const meta = new Map();
  const st = { getWorkspace: () => ({ root }), unitsFrom: () => [{}], addEvent: () => {}, getMeta: (k) => meta.get(k), setMeta: (k, v) => meta.set(k, v) };
  const q = new EventEmitter();
  const s = { sessionId: 's1', name: 'lead', workspaceKey: 'k' };
  const w = new DocWatch({ store: st, log: () => {}, queue: q, sessions: new Map([['s1', s]]) }, null);
  assert.equal(w.maybeStart(s, root), true);
  assert.equal(w.maybeStart(s, root), false, '워크스페이스마다 한 번');
  assert.equal(w.attachFront('s1', 'd1'), DOC_START_LINE);
  assert.equal(w.attachFront('s1', 'd2'), null);
  q.emit('delivery', { deliveryId: 'd1', status: 'failed' });
  assert.equal(w.attachFront('s1', 'd3'), DOC_START_LINE, '실패하면 다시');
  q.emit('delivery', { deliveryId: 'd3', status: 'cancelled' });
  put(root, 'docs/ARCH.md', '# a\n');
  assert.equal(w.attachFront('s1', 'd4'), null, '그새 문서가 생겼다');
  // 하위가 있는 세션(일 상위가 있음)은 지휘 세션이 아니다
  const root2 = repo();
  const w2 = new DocWatch({ store: { ...st, getWorkspace: () => ({ root: root2 }) }, log: () => {} }, { relIndex: () => ({ workParentOf: () => 'p' }) });
  assert.equal(w2.maybeStart({ sessionId: 's2', name: 'mid', workspaceKey: 'k2' }, root2), false);
});

test('P346 판 API: docs.init(이 PC의 판 토큰만, 덮지 않음)', async () => {
  const root = repo({ files: { 'docs/ARCH.md': '# 있는 ARCH\n' } });
  const ws = await workspaceOf(root);
  const store = new Store(path.join(tmp(), 'board.db'));
  store.insertWorkspace({ ...ws, createdAt: 1 });
  try {
    const h = docHandlers({ store, resolveWorkspace: async () => ({ key: ws.key }), features: { settings: { get: () => ({ language: 'en' }) } } });
    await assert.rejects(h['docs.init']({}, { auth: { kind: 'device' } }), (e) => e.code === 'forbidden');
    const r = await h['docs.init']({ only: 'arch,plan' }, { auth: { kind: 'local' } });
    assert.deepEqual(r.created, ['docs/PLAN.md']); assert.deepEqual(r.skipped, ['docs/ARCH.md']);
    assert.equal(read(root, 'docs/ARCH.md'), '# 있는 ARCH\n');
    assert.equal(r.lang, 'en'); assert.ok(read(root, 'docs/PLAN.md').includes('## Now'));
  } finally { store.close(); }
});

// ---------- 4. 계약·허용 동사·규칙 글 ----------
test('P346 계약 10: docs init·on·off, 지휘 세션만, 하위 오케스트레이션에는 docs가 없다', () => {
  assert.equal(CONTRACT_VERSION, 13); // P364: know로 12. // P360: revive·fork로 11
  const d = VERBS.find((v) => v.name === 'docs');
  assert.ok(d.args.join(' ').includes('init') && d.args.join(' ').includes('off'));
  for (const k of ['action', 'created', 'skipped', 'next']) assert.ok(d.out.includes(k), k);
  assert.match(d.does, /지휘 세션만/);
  assert.equal(contractJson().contract, 13); // P364. P360
  assert.deepEqual([...LEAD_ONLY_SUBS.docs], ['init', 'on', 'off']);
  assert.ok(!ORCH_SUB_VERBS.includes('docs'));
  const sub = permOf({ orch: { on: true }, relation: 'sub', parentId: 'p' });
  assert.deepEqual(opRefusal(sub, 'docs'), { verb: 'docs', why: 'scope' });
  const free = permOf({ orch: { on: true }, relation: 'none', verbs: ['help', ...VERBS.map((v) => v.name)] });
  assert.equal(opRefusal(free, 'docs'), null);
  assert.match(VERB_BRIEF.docs, /init/);
});

test('P346 문서 규칙: 고침은 코드가 합쳐진 뒤(같은 커밋을 요구하지 않는다)', () => {
  const rules = docRules('docs');
  assert.ok(rules.includes('합쳐진 뒤') && !rules.includes('같은 커밋'));
  assert.ok(DOC_DONE_LINE.includes('합쳐진 뒤') && !DOC_DONE_LINE.includes('같은 커밋'));
  assert.ok(DOC_DONE_LINE.length < 200);
});
