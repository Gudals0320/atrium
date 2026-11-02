// P22 창 시험: 그룹·한 줄 메모 빼기와 Delete 키 닫기. 판: herdr 세션 atrium-dev-p22, 포트 47840, 이 워크트리의 backend/.dev(experiments/p22/tools/env.cjs).
// 시험 폴더는 새로 만든 C:\Workspace\mtask-p22-ws\demo 하나, 시험 claude는 haiku 여섯(s1~s6)에 짧은 지시. 대화 목록은 그 폴더의 대화만 읽는다.
// 사용: node experiments/p22/tools/e2e.cjs p22-remove.mjs
// 차례: 0 준비 → 1 그룹을 만들 곳이 없다 → 2 그룹이 있던 판 기록(시험용으로 만든 것)을 띄우면 그룹이 지워지고 노드는 그 자리 → 3 한 줄 메모 칸이 뜨지 않는다
//       → 4 터미널 안 Delete는 글자를 지운다 → 5 메모 노드는 그대로 → 6 Delete 하나(취소, 보관) → 7 멀리 본 하나(대화상자) → 8 여럿(취소, 보관) → 9 여럿 삭제 → 10 하나 삭제
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { _electron as electron } from 'playwright';
import { APP_ROOT, REPO, OUT, sleep, until, logger, closeApp } from './harness.mjs';
import { assertTestBoard } from './p9-guard.mjs';

// P28: 다른 단계 판(experiments/<MT_E2E_OUT>/tools/env.cjs, 예: p28)에서도 돌린다. 결과도 그 폴더에 남는다
if (!['p22', 'p28'].includes(process.env.MT_E2E_OUT)) throw new Error('MT_E2E_OUT=p22(또는 p28)를 명령줄에서 준다');
const T = createRequire(import.meta.url)(path.join(REPO, 'experiments', process.env.MT_E2E_OUT, 'tools', 'env.cjs'));
const DIR = T.DIR, PROJECT = T.PROJECT;
const ENV = Object.fromEntries(Object.entries(T.P22_ENV || T.P28_ENV).filter(([k]) => k.startsWith('ATRIUM_')));
assertTestBoard(ENV, { root: T.DEV });
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(DIR, { recursive: true });

const log = logger('p22-remove');
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)));
const env = { ...cleanEnv(), ...ENV, MT_HERDR_SESSION: ENV.ATRIUM_HERDR_SESSION };
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env, timeout: 180000 });
const call = (page, m, p = {}) => page.evaluate(([mm, pp]) => window.__mt.api.call(mm, pp), [m, p]);
const callErr = (page, m, p = {}) => page.evaluate(([mm, pp]) => window.__mt.api.call(mm, pp).then(() => null, (e) => e.code || e.message || 'error'), [m, p]);
const sess = (page, name) => page.evaluate((n) => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === n); return s ? { id: s.sessionId, state: s.state, groupId: s.groupId } : null; }, name);
const NAMES = ['s1', 's2', 's3', 's4', 's5', 's6'];

const results = [];
const step = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); log(`${ok ? '통과' : '실패'} ${name}`, detail ?? ''); };
const shot = async (page, name) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); log('스크린숏', path.relative(REPO, f)); };
const waitState = (page, n, states, ms = 120000) => until(async () => { const x = await sess(page, n); return x && [].concat(states).includes(x.state) ? x : null; }, ms, 300);
const gone = (page, n, ms = 60000) => until(async () => !(await sess(page, n)), ms, 300);
// 노드 하나에 화면을 맞춘다(노드 너비가 화면에서 px가 되는 배율)
async function viewNode(page, n, px) {
  await page.evaluate(([nn, w]) => {
    const st = window.__mt.getState();
    const s = [...st.sessions.values()].find((x) => x.name === nn);
    const r = st.nodes.get(s.sessionId);
    const el = document.querySelector('.mt-canvas');
    const zoom = w / r.w;
    st.setViewport({ x: el.clientWidth / 2 - (r.x + r.w / 2) * zoom, y: el.clientHeight / 2 - (r.y + r.h / 2) * zoom, zoom });
  }, [n, px]);
  await sleep(900);
}
// 터미널에 들어가지 않고 고른다(Ctrl+누르기). 그 전에 초점을 뺀다(터미널 안 Delete는 가로채지 않는다)
async function pick(page, names, { clear = true } = {}) {
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  if (clear) { await page.evaluate(() => window.__mt.getState().clearSelection()); await sleep(200); }
  for (const n of names) {
    const el = page.locator(`.mt-node[data-name="${n}"]`).first();
    const head = page.locator(`.mt-node[data-name="${n}"] .mt-node-name`).first();
    await ((await head.isVisible().catch(() => false)) ? head : el).click({ modifiers: ['Control'] });
    await sleep(250);
  }
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  return page.evaluate(() => window.__mt.getState().selected.map((id) => window.__mt.getState().sessions.get(id).name));
}
// 판 기록의 노드 자리(창의 nodes는 시험이 board.setNode로 옮긴 것을 다시 읽기 전까지 옛 값일 수 있다)
const nodeRects = async (page) => { const b = await call(page, 'board.get'); const names = Object.fromEntries((await call(page, 'session.list')).map((s) => [s.sessionId, s.name])); return Object.fromEntries(b.nodes.filter((n) => names[n.session_id]).map((n) => [names[n.session_id], { x: n.x, y: n.y, w: n.w, h: n.h }])); };

async function launch() {
  const app = await electron.launch({ args: ['.', '--dev'], cwd: APP_ROOT, env, timeout: 60000 });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => log(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') log(`[console.error] ${m.text().slice(0, 300)}`); });
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1584, 921));
  await sleep(800);
  return { app, page };
}

let { app, page } = await launch();
try {
  await call(page, 'settings.set', { key: 'language', value: 'ko' });
  await call(page, 'settings.set', { key: 'sleepAfterMin', value: 0 }); // 시험 중 잠재우지 않는다
  await call(page, 'workspace.open', { path: DIR });

  // 0. haiku claude 여섯. 준비된 뒤 첫 지시(atrium send --wait). 노드는 3열 격자로 멀리 둔다
  for (const n of NAMES) if (!(await sess(page, n))) atrium('spawn', DIR, '--name', n, '--model', 'haiku');
  for (const n of NAMES) await waitState(page, n, 'ready', 150000);
  for (const [i, n] of NAMES.entries()) {
    const s = await sess(page, n);
    await call(page, 'board.setNode', { session: s.id, x: (i % 3) * 1400, y: Math.floor(i / 3) * 1100, w: 720, h: 460, cause: 'p22 test' });
  }
  for (const n of NAMES) { const out = atrium('send', `@${n}`, 'Reply with exactly: OK', '--wait'); log(`send ${n}`, out.trim().split('\n').slice(-1)[0]); }
  for (const n of NAMES) await waitState(page, n, 'ready', 120000);
  await page.evaluate(() => window.__mt.getState().fitAll && window.__mt.getState().fitAll(0));
  await sleep(1200);

  // 1. 그룹을 만들 곳이 화면 어디에도 없다
  const ui = await page.evaluate(() => ({
    railGroup: !!document.querySelector('[data-action="group-new"]'),
    chipGroup: !!document.querySelector('[data-action="chip-group"]'),
    groupNodes: document.querySelectorAll('.react-flow__node-group').length,
    nodeGroupBadge: document.querySelectorAll('.mt-node-group').length,
    memoButtons: document.querySelectorAll('[data-action="memo"]').length,
    rail: [...document.querySelectorAll('[data-role="rail-left"] [data-action]')].map((b) => b.dataset.action),
    chips: [...document.querySelectorAll('[data-role="chips"] [data-action]')].map((b) => b.dataset.action),
  }));
  step('1a 왼쪽 레일과 아래 칩에 그룹이 없다', !ui.railGroup && !ui.chipGroup, { rail: ui.rail, chips: ui.chips });
  step('1b 캔버스에 그룹 영역과 노드 그룹 표시가 없다', ui.groupNodes === 0 && ui.nodeGroupBadge === 0, ui);
  await shot(page, 'p22-01-board');
  await page.click('[data-action="chip-spawn"]');
  await page.waitForSelector('[data-role="spawn"]', { timeout: 10000 });
  const spawnText = await page.locator('[data-role="spawn"]').innerText();
  step('1c 새 세션 대화상자에 그룹이 없다', !/그룹|group/i.test(spawnText), spawnText.replace(/\s+/g, ' ').slice(0, 200));
  await shot(page, 'p22-02-spawn-dialog');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__mt.getState().dialog && document.querySelector('[data-role="spawn"] .mt-btn.ghost') && document.querySelector('[data-role="spawn"] .mt-btn.ghost').click());
  await sleep(300);
  await page.click('[data-action="mission-rail"]');
  await page.waitForSelector('[data-role="mission"] [data-role="mm-node"]', { timeout: 15000 });
  await sleep(600);
  const mm = await page.evaluate(() => ({ heads: [...document.querySelectorAll('.mt-mm-colhead')].map((x) => x.textContent), groups: document.querySelectorAll('[data-role="mm-node"][data-kind="group"]').length, member: document.querySelectorAll('[data-role="mm-edge"][data-kind="member"]').length }));
  step('1d 미션 맵은 두 열이고 그룹 열·노드·소속 선이 없다', mm.heads.length === 2 && !mm.groups && !mm.member, mm);
  await shot(page, 'p22-03-mission');
  await page.click('[data-action="mission-close"]');
  await sleep(300);
  await page.click('.mt-cmd-input');
  await page.keyboard.type('@');
  await sleep(400);
  const mentions = await page.evaluate(() => [...document.querySelectorAll('.mt-mention-item')].map((x) => x.textContent));
  step('1e 명령 바 @ 목록에 그룹이 없다', mentions.length === 7 && mentions.every((x) => !/그룹|group/i.test(x)), mentions);
  await shot(page, 'p22-04-mention');
  await page.keyboard.press('Backspace');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  const apiErr = { group: await callErr(page, 'group.list'), create: await callErr(page, 'group.create', { members: ['s1', 's2'] }), batch: await callErr(page, 'batch.run', { group: 'x', prompts: ['a'] }), note: await callErr(page, 'note.add', { session: 's1', text: 'x' }) };
  step('1f 판 API에 group.*, batch.*, note.*가 없다', Object.values(apiErr).every((e) => e && e !== null), apiErr);

  // 2. 그룹이 있던 판 기록(P21까지의 모양을 시험용으로 만든 것)을 띄운다. 창을 닫고 백엔드를 끈 뒤 board.db에 그룹을 넣고 다시 띄운다
  const before = await nodeRects(page);
  const ids = Object.fromEntries(await Promise.all(NAMES.map(async (n) => [n, (await sess(page, n)).id])));
  await closeApp(app);
  log('backend stop', atrium('backend', 'stop').trim());
  await sleep(1500);
  const dbFile = path.join(ENV.ATRIUM_DATA_DIR, 'board.db');
  {
    const db = new DatabaseSync(dbFile);
    const cols = new Set(db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name));
    if (!cols.has('group_id')) db.exec('ALTER TABLE sessions ADD COLUMN group_id TEXT');
    db.exec('CREATE TABLE IF NOT EXISTS groups (group_id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, cwd TEXT, created_at INTEGER NOT NULL, x REAL, y REAL, w REAL, h REAL, max_concurrent INTEGER, updated_at INTEGER, workspace_key TEXT) STRICT');
    db.exec('CREATE TABLE IF NOT EXISTS batch_items (item_id TEXT PRIMARY KEY, group_id TEXT NOT NULL, seq INTEGER NOT NULL, name TEXT, prompt TEXT NOT NULL, model TEXT, permission_mode TEXT, status TEXT NOT NULL, session_id TEXT, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL) STRICT');
    db.exec('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, session_id TEXT, group_id TEXT, text TEXT NOT NULL, created_at INTEGER NOT NULL) STRICT');
    const ws = db.prepare('SELECT workspace_key FROM sessions WHERE session_id = ?').get(ids.s1).workspace_key;
    const a = before.s1, b = before.s2;
    const now = Date.now();
    db.prepare('INSERT INTO groups (group_id, name, color, cwd, created_at, x, y, w, h, max_concurrent, updated_at, workspace_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('gp22', 'team', '#7aa7f0', DIR.replace(/\\/g, '/'), now, a.x - 20, a.y - 64, b.x + b.w - a.x + 40, a.h + 84, 2, now, ws);
    db.prepare('INSERT INTO groups (group_id, name, created_at) VALUES (?, ?, ?)').run('gp22cli', 'cli', now); // P1 CLI --group(영역 없음)
    db.prepare("UPDATE sessions SET group_id = 'gp22' WHERE session_id IN (?, ?)").run(ids.s1, ids.s2);
    db.prepare("INSERT INTO batch_items (item_id, group_id, seq, name, prompt, status, created_at, updated_at) VALUES ('ip22', 'gp22', 1, 'team-1', 'never', 'queued', ?, ?)").run(now, now);
    // 그룹 대상 루프(하루에 한 번, 지금 보내지 않는다). 지워지지 않으면 시험이 실패로 본다
    db.prepare("INSERT INTO loops (loop_id, target_kind, target_id, prompt, trig, stop, status, next_at, per, history, created_at, updated_at) VALUES ('rp22', 'group', 'gp22', 'never', ?, '{}', 'active', ?, '{}', '[]', ?, ?)").run(JSON.stringify({ type: 'interval', everyMs: 86400000, immediate: false }), now + 86400000, now, now);
    db.prepare("INSERT INTO notes (session_id, text, created_at) VALUES (?, '옛 한 줄 메모', ?)").run(ids.s1, now);
    db.close();
    log('옛 판 기록을 만들었다', { groups: 2, members: ['s1', 's2'], batch: 1, loop: 'rp22', note: 1 });
  }
  const relaunchAt = Date.now();
  ({ app, page } = await launch());
  for (const n of NAMES) await waitState(page, n, 'ready', 120000);
  const after = await nodeRects(page);
  const ev = (await call(page, 'session.events', { limit: 400 })).filter((e) => e.kind === 'groups_removed' && e.t >= relaunchAt);
  const db2 = new DatabaseSync(dbFile, { readOnly: true });
  const tables = db2.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  const leftGroupIds = db2.prepare('SELECT COUNT(*) AS n FROM sessions WHERE group_id IS NOT NULL').get().n;
  const groupLoops = db2.prepare("SELECT COUNT(*) AS n FROM loops WHERE target_kind = 'group'").get().n;
  const notesLeft = tables.includes('notes') ? db2.prepare('SELECT COUNT(*) AS n FROM notes').get().n : null;
  db2.close();
  const moved = NAMES.filter((n) => JSON.stringify(before[n]) !== JSON.stringify(after[n]));
  step('2a 처음 뜰 때 그룹·묶음 항목·그룹 대상 루프를 지우고 판 이벤트로 남긴다', ev.length === 1 && ev[0].data.groups.length === 2 && ev[0].data.loops.length === 1 && ev[0].data.batchItems.queued === 1 && ev[0].data.members.length === 2, ev[0] && ev[0].data);
  step('2b 표가 지워지고 세션 소속이 풀린다(옛 한 줄 메모 표는 그대로 둔다)', !tables.includes('groups') && !tables.includes('batch_items') && leftGroupIds === 0 && groupLoops === 0 && notesLeft >= 1, { tables: tables.filter((t) => /group|batch|note/.test(t)), leftGroupIds, groupLoops, notesLeft });
  step('2c 노드는 그 자리에 남는다', moved.length === 0, { moved, s1: after.s1, s2: after.s2 });
  const ui2 = await page.evaluate(() => ({ groupNodes: document.querySelectorAll('.react-flow__node-group').length, badges: document.querySelectorAll('.mt-node-group').length, loops: [...window.__mt.getState().loops.values()].length }));
  step('2d 창에 그룹 배경·표시·루프가 남지 않는다', ui2.groupNodes === 0 && ui2.badges === 0 && ui2.loops === 0, ui2);
  await page.evaluate(() => window.__mt.getState().fitAll && window.__mt.getState().fitAll(0));
  await sleep(1200);
  await shot(page, 'p22-05-migrated');

  // 3. 한 줄 메모 칸이 뜨지 않는다: s1 터미널에 치고(손댐) s2로 옮긴다. 브리핑에 메모 줄이 없다
  await viewNode(page, 's1', 720);
  await page.locator('.mt-node[data-name="s1"] .mt-term-wrap').first().click();
  await sleep(1500);
  await page.keyboard.type('zz');
  await sleep(500);
  await page.keyboard.press('Control+U');
  await sleep(500);
  await viewNode(page, 's2', 720);
  await page.locator('.mt-node[data-name="s2"] .mt-node-name').first().click();
  let memoSeen = false;
  for (let i = 0; i < 12; i++) { if (await page.evaluate(() => !!document.querySelector('[data-role="leave-memo"], [data-role="memo"], [data-field="memo"]'))) memoSeen = true; await sleep(250); }
  step('3a 손댄 세션에서 옮겨도 한 줄 메모 칸이 뜨지 않는다', !memoSeen);
  await shot(page, 'p22-06-no-leave-memo');
  await page.locator('.mt-node[data-name="s2"] [data-action="brief"]').first().click();
  await page.waitForSelector('.mt-node[data-name="s2"] [data-role="briefing"]', { timeout: 15000 });
  await sleep(500);
  const brief = await page.locator('.mt-node[data-name="s2"] [data-role="briefing"]').innerText();
  step('3b 브리핑은 지시·답·상태를 보이고 메모 줄이 없다', /마지막 답/.test(brief) && !/메모/.test(brief), brief.replace(/\s+/g, ' ').slice(0, 240));
  await shot(page, 'p22-07-briefing');
  await page.locator('.mt-node[data-name="s2"] [data-action="brief-close"]').first().click();

  // 4. 터미널 안 Delete는 글자를 지운다(가로채지 않는다)
  await viewNode(page, 's1', 720);
  await page.locator('.mt-node[data-name="s1"] .mt-term-wrap').first().click();
  await sleep(1500);
  await page.keyboard.type('qwxyz');
  await sleep(400);
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowLeft'); await sleep(120); }
  await page.keyboard.press('Delete');
  await sleep(1200);
  const screen = (await call(page, 'terminal.snapshot', { session: 's1', format: 'text' })).text;
  const killOpen = await page.evaluate(() => !!document.querySelector('[data-role="kill-confirm"], [data-role="close-dialog"]'));
  step('4 터미널 안 Delete는 글자를 지우고 닫기 확인을 열지 않는다', /qwyz/.test(screen) && !/qwxyz/.test(screen) && !killOpen, { line: (screen.split('\n').find((l) => /qw/.test(l)) || '').trim(), killOpen });
  await shot(page, 'p22-08-terminal-delete');
  await page.keyboard.press('Control+U');
  await sleep(400);

  // 5. 메모 노드: 골라 Delete를 눌러도 그대로, 편집 중 Delete는 글자를 지운다
  const s3r = after.s3;
  const memo = await call(page, 'memo.create', { text: 'abcd', x: s3r.x, y: s3r.y + 560, w: 360, h: 220 });
  await sleep(800);
  await viewNode(page, 's3', 700);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.locator(`.mt-memo-node[data-memo="${memo.memoId}"] .mt-mdrag`).first().click();
  await sleep(300);
  await page.keyboard.press('Delete');
  await sleep(800);
  const memoKept = await page.evaluate((id) => window.__mt.getState().memos.has(id) && !document.querySelector('[data-role="close-dialog"], [data-role="kill-confirm"]'), memo.memoId);
  await page.locator(`.mt-memo-node[data-memo="${memo.memoId}"] [data-role="memo-view"]`).first().dblclick();
  await page.waitForSelector(`.mt-memo-node[data-memo="${memo.memoId}"] [data-field="memo-text"]`, { timeout: 5000 });
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Delete');
  await sleep(200);
  const memoDraft = await page.locator(`.mt-memo-node[data-memo="${memo.memoId}"] [data-field="memo-text"]`).inputValue();
  step('5 메모 노드는 Delete로 지우지 않고, 편집 중 Delete는 글자를 지운다', memoKept && memoDraft === 'bcd', { memoKept, memoDraft });
  await page.keyboard.press('Escape');
  await sleep(300);
  await call(page, 'memo.delete', { memo: memo.memoId, confirm: true }).catch(() => {});

  // 6. 하나: Delete → 그 노드의 X와 같은 확인. 취소, 다시 Delete → 보관
  await viewNode(page, 's2', 720);
  let sel = await pick(page, ['s2']);
  await page.keyboard.press('Delete');
  await page.waitForSelector('.mt-node[data-name="s2"] [data-role="kill-confirm"][data-loading="0"]', { timeout: 15000 });
  const killText = await page.locator('.mt-node[data-name="s2"] [data-role="kill-confirm"]').innerText();
  step('6a 하나를 고르고 Delete를 누르면 그 노드에 X와 같은 닫기 확인(보관·삭제·취소)', sel.length === 1 && /보관/.test(killText) && /삭제/.test(killText) && /취소/.test(killText), { sel, text: killText.replace(/\s+/g, ' ').slice(0, 200) });
  await shot(page, 'p22-09-delete-one');
  await page.locator('.mt-node[data-name="s2"] [data-action="close-cancel"]').first().click();
  await sleep(600);
  step('6b 취소하면 닫지 않는다', !!(await sess(page, 's2')) && !(await page.evaluate(() => !!document.querySelector('[data-role="kill-confirm"]'))));
  sel = await pick(page, ['s2']);
  await page.keyboard.press('Delete');
  await page.waitForSelector('.mt-node[data-name="s2"] [data-role="kill-confirm"][data-loading="0"]', { timeout: 15000 });
  await page.locator('.mt-node[data-name="s2"] [data-action="close-archive"]').first().click();
  await gone(page, 's2');
  await sleep(800);
  const arch1 = JSON.stringify(await call(page, 'archive.list', {}));
  step('6c 보관을 누르면 닫고 보관함에 둔다', !(await sess(page, 's2')) && arch1.includes(ids.s2), { inArchive: arch1.includes(ids.s2) });
  await shot(page, 'p22-10-archived-one');

  // 7. 멀리 보아 머리줄의 X가 숨은 노드는 같은 확인을 창 가운데 대화상자로 연다
  await page.evaluate(() => window.__mt.getState().fitAll && window.__mt.getState().fitAll(0));
  await sleep(1200);
  sel = await pick(page, ['s1']);
  await page.keyboard.press('Delete');
  await page.waitForSelector('[data-role="close-dialog"][data-count="1"]', { timeout: 10000 });
  await sleep(1200);
  const far = await page.locator('[data-role="close-dialog"]').innerText();
  step('7 멀리 본 노드 하나는 대화상자로 같은 확인', sel.length === 1 && /@s1/.test(far) && /보관/.test(far), far.replace(/\s+/g, ' ').slice(0, 200));
  await shot(page, 'p22-11-delete-far');
  await page.click('[data-role="close-dialog"] [data-action="close-cancel"]');
  await sleep(500);

  // 8. 여럿: 한 확인창에 수를 보인다. 취소, 다시 Delete → 보관
  sel = await pick(page, ['s3', 's4']);
  await page.keyboard.press('Delete');
  await page.waitForSelector('[data-role="close-dialog"][data-count="2"]', { timeout: 10000 });
  const many = await page.locator('[data-role="close-dialog"]').innerText();
  step('8a 여럿을 고르면 한 확인창에 수와 이름', sel.length === 2 && /2개/.test(many) && /@s3/.test(many) && /@s4/.test(many), many.replace(/\s+/g, ' ').slice(0, 240));
  await shot(page, 'p22-12-delete-many');
  await page.click('[data-role="close-dialog"] [data-action="close-cancel"]');
  await sleep(600);
  step('8b 취소하면 하나도 닫지 않는다', !!(await sess(page, 's3')) && !!(await sess(page, 's4')));
  sel = await pick(page, ['s3', 's4']);
  await page.keyboard.press('Delete');
  await page.waitForSelector('[data-role="close-dialog"][data-count="2"]', { timeout: 10000 });
  await page.click('[data-role="close-dialog"] [data-action="close-archive"]');
  await gone(page, 's3'); await gone(page, 's4');
  await sleep(800);
  const arch2 = JSON.stringify(await call(page, 'archive.list', {}));
  step('8c 보관을 누르면 고른 세션 모두를 닫고 보관한다', arch2.includes(ids.s3) && arch2.includes(ids.s4));
  await shot(page, 'p22-13-archived-many');

  // 9. 여럿 삭제: 대화 기록은 휴지통으로, 닫힌 세션 행도 지운다
  const tx = (n) => path.join(PROJECT, `${ids[n]}.jsonl`);
  const hadTx = ['s5', 's6'].map((n) => fs.existsSync(tx(n)));
  sel = await pick(page, ['s5', 's6']);
  await page.keyboard.press('Delete');
  await page.waitForSelector('[data-role="close-dialog"][data-count="2"]', { timeout: 10000 });
  await page.click('[data-role="close-dialog"] [data-action="close-delete"]');
  await gone(page, 's5'); await gone(page, 's6');
  await sleep(1500);
  const closed = JSON.stringify(await call(page, 'recall.closed', {}));
  step('9 여럿 삭제: 고른 세션 모두를 닫고 대화 기록을 휴지통으로', sel.length === 2 && hadTx.every(Boolean) && ['s5', 's6'].every((n) => !fs.existsSync(tx(n)) && !closed.includes(ids[n])), { hadTx, now: ['s5', 's6'].map((n) => fs.existsSync(tx(n))) });
  await shot(page, 'p22-14-deleted-many');

  // 10. 하나 삭제(그 노드의 확인에서)
  await viewNode(page, 's1', 720);
  sel = await pick(page, ['s1']);
  await page.keyboard.press('Delete');
  await page.waitForSelector('.mt-node[data-name="s1"] [data-role="kill-confirm"][data-loading="0"]', { timeout: 15000 });
  await page.locator('.mt-node[data-name="s1"] [data-action="close-delete"]').first().click();
  await gone(page, 's1');
  await sleep(1500);
  step('10 하나 삭제: 닫고 대화 기록을 휴지통으로', !(await sess(page, 's1')) && !fs.existsSync(tx('s1')));
  await page.evaluate(() => window.__mt.getState().fitAll && window.__mt.getState().fitAll(0));
  await sleep(1000);
  await shot(page, 'p22-15-end');
} catch (e) {
  log('오류', e.stack);
  results.push({ name: '오류', ok: false, detail: e.message });
  await shot(page, 'p22-error').catch(() => {});
} finally {
  const pass = results.filter((r) => r.ok).length;
  log(`결과 ${pass}/${results.length}`);
  fs.writeFileSync(path.join(OUT, 'p22-remove.json'), JSON.stringify(results, null, 2));
  await closeApp(app);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
