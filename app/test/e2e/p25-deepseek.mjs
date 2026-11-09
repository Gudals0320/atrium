// P25 창 시험: 왼쪽 레일의 DeepSeek 단추. 판: herdr 세션 atrium-dev-p25, 포트 47843, 이 워크트리의 backend/.dev(experiments/p25/tools/env.cjs).
// 시험 폴더는 새로 만든 C:\Workspace\mtask-p25-ws\demo 하나. 대화 목록은 그 폴더의 대화만 읽는다.
// DeepSeek API를 쓰므로 턴은 한 번(권한 질문 하나가 드는 한 마디 지시)만 한다. 직접 명령 시험은 `echo` 뒤 `claude --model haiku`(지시는 보내지 않는다).
// 사용: node experiments/p25/tools/e2e.cjs p25-deepseek.mjs
// 차례: 1 레일 단추(대화상자 없음, 터미널 초점, 모델) → 2 노드·레일 로고 → 3 한 마디 지시와 승인 줄, hook 상태, 답 → 4 이어 가기(등록 확인, 잠재우고 깨우기)
//       → 5 직접 명령 → 6 Shift+누르기 대화상자 → 7 설정 화면
// P33: DeepSeek는 "Claude Code + 게이트웨이 환경 변수" 호출자(id deepseek)다. 레일 단추는 즐겨찾기 호출자, 직접 명령은 따로 만든 명령 호출자(아이콘 deepseek), 설정은 호출자 탭.
//      실제 게이트웨이로 띄우고 지시를 보내는 1~4는 P25_LIVE=1일 때만 한다. 없으면 게이트웨이 주소를 닫힌 포트로 바꿔 "닿지 않음" 알림까지만 본다(DeepSeek API를 쓰지 않는다).
//      판 값은 MT_E2E_OUT 단계의 env.cjs에서 읽는다(P33 판: node experiments/p33/tools/e2e.cjs p25-deepseek.mjs).
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from 'playwright';
import { APP_ROOT, REPO, OUT, sleep, until, logger, closeApp } from './harness.mjs';
import { assertTestBoard } from './p9-guard.mjs';

if (!['p25', 'p33'].includes(process.env.MT_E2E_OUT)) throw new Error('MT_E2E_OUT=p25를 명령줄에서 준다');
const T = createRequire(import.meta.url)(path.join(REPO, 'experiments', process.env.MT_E2E_OUT, 'tools', 'env.cjs')); // P33: 그 단계의 판 값
const DIR = T.DIR;
const ENV = Object.fromEntries(Object.entries(T.P25_ENV || T.P33_ENV).filter(([k]) => k.startsWith('ATRIUM_')));
const LIVE = !!process.env.P25_LIVE;
assertTestBoard(ENV, { root: T.DEV });
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(DIR, { recursive: true });

const DS_MODEL = 'ocx-claude-deepseek--deepseek-flash[1m]';
const log = logger('p25-deepseek');
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)));
const env = { ...cleanEnv(), ...ENV, MT_HERDR_SESSION: ENV.ATRIUM_HERDR_SESSION };
if (!['atrium-dev-p25', 'atrium-dev-p33'].includes(env.MT_HERDR_SESSION)) throw new Error('herdr 세션은 atrium-dev-p25(또는 P33 판)만');
const toasts = (page) => page.$$eval('.mt-toast', (els) => els.map((e) => e.textContent));
const DS = '[data-role="rail-left"] [data-launcher="deepseek"]';
const herdr = (method, params = {}) => JSON.parse(execFileSync(process.execPath, [path.join(REPO, 'experiments', 'p4', 'tools', 'h.mjs'), method, JSON.stringify(params)], { encoding: 'utf8', env }));
const screenOf = (paneId, { source = 'visible', lines } = {}) => { const r = herdr('pane.read', { pane_id: paneId, source, format: 'text', ...(lines ? { lines } : {}) }); return (r && r.read && r.read.text) || JSON.stringify(r).slice(0, 300); };
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env, timeout: 300000 });
const call = (page, m, p = {}) => page.evaluate(([mm, pp]) => window.__mt.api.call(mm, pp), [m, p]);
const sessions = (page) => page.evaluate(() => [...window.__mt.getState().sessions.values()].map((s) => ({ id: s.sessionId, name: s.name, kind: s.kind, flavor: s.flavor, state: s.state, hooked: s.hooked, hooks: s.hooks, resume: s.resume, model: s.model, ask: s.ask, lastAnswer: s.lastAnswer, paneId: s.paneId, fromShell: s.fromShell, sleep: s.sleep, waking: s.waking })));
const byId = async (page, id) => (await sessions(page)).find((s) => s.id === id);
const focusIn = (page, id) => page.evaluate((sid) => { const a = document.activeElement; const node = a && a.closest('.react-flow__node'); return { focusId: window.__mt.getState().focusId, inNode: !!(node && node.getAttribute('data-id') === sid), xterm: !!(a && a.classList.contains('xterm-helper-textarea')) }; }, id);
const spawnEvent = async (page, id) => { const ev = await call(page, 'session.events', { session: id }); const e = ev.find((x) => x.kind === 'spawn'); return e ? e.data : null; };
const results = [];
const step = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); log(`${ok ? '통과' : '실패'} ${name}`, detail ?? ''); };
const shot = async (page, name, clip) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f, ...(clip ? { clip } : {}) }); log('스크린숏', path.relative(REPO, f)); };
const waitState = (page, id, states, ms = 120000) => until(async () => { const x = await byId(page, id); return x && [].concat(states).includes(x.state) && !x.waking ? x : null; }, ms, 500);
const nodeBox = (page, id) => page.evaluate((sid) => { const n = document.querySelector(`.react-flow__node[data-id="${sid}"]`); if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: Math.min(r.width + 16, innerWidth - Math.max(0, r.x - 8)), height: Math.min(r.height + 16, innerHeight - Math.max(0, r.y - 8)) }; }, id);
const goNode = (page, id) => page.evaluate((sid) => { const s = window.__mt.getState(); s.navigateTo && s.navigateTo(sid); }, id);

const app = await electron.launch({ args: ['.', '--dev'], cwd: APP_ROOT, env, timeout: 60000 });
const page = await app.firstWindow();
page.on('pageerror', (e) => log(`[pageerror] ${e.message}`));
let ds = null, dc = null, dsCmd = null;
try {
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1584, 921));
  await call(page, 'settings.set', { language: 'ko' });
  await call(page, 'workspace.open', { path: DIR });
  await page.waitForSelector('.mt-wsbtn[data-name="demo"]');
  await page.click('.mt-wsbtn[data-name="demo"]');
  await until(() => page.evaluate(() => { const s = window.__mt.getState(); const w = s.workspaces.find((x) => x.key === s.currentWs); return w && w.name === 'demo'; }), 10000);
  // 권한 질문이 뜨도록 manual, herdr 자동 승인 끔. DeepSeek 호출자는 기본값(P33: 옛 settings.set deepseek*)이고 레일에서 Codex 바로 아래에 둔다.
  // LIVE가 아니면 게이트웨이 주소를 닫힌 포트로 바꿔 실제 opencodex에 닿지 않게 한다
  const gwPort = LIVE ? null : await new Promise((res) => { const sv = net.createServer(); sv.listen(0, '127.0.0.1', () => { const pt = sv.address().port; sv.close(() => res(pt)); }); });
  const gwPatch = LIVE ? {} : { env: { ANTHROPIC_BASE_URL: `http://127.0.0.1:${gwPort}`, CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1' }, checkUrl: `http://127.0.0.1:${gwPort}/healthz` };
  await call(page, 'launcher.update', { id: 'deepseek', patch: { harness: 'claude', model: DS_MODEL, permissionMode: 'manual', allowHerdr: false, effort: '', icon: 'deepseek', ...gwPatch } });
  await call(page, 'launcher.favorite', { id: 'codex', index: 1 }); // 판에서 Codex를 뺐을 수 있다(P33 시험)
  const favs0 = (await call(page, 'launcher.list')).favorites.filter((x) => x !== 'deepseek');
  await call(page, 'launcher.favorite', { id: 'deepseek', index: favs0.includes('codex') ? favs0.indexOf('codex') + 1 : favs0.length });
  await sleep(300);

  // 1. 레일의 DeepSeek 단추: Codex 아래, 대화상자 없이 뜨고 그 터미널로 들어간다
  const order = await page.$$eval('[data-role="rail-favorites"] [data-action="launch"]', (els) => els.map((e) => e.getAttribute('data-launcher')));
  step('DeepSeek 단추는 레일의 Codex 바로 아래', order.indexOf('deepseek') === order.indexOf('codex') + 1, order);
  const before = new Set((await sessions(page)).map((s) => s.id));
  if (!LIVE) {
    // P33: 게이트웨이가 없으면 띄우기 전에 opencodex 안내를 띄우고 세션을 만들지 않는다
    await page.click(DS);
    const tx = await until(async () => (await toasts(page)).find((x) => /opencodex/.test(x)), 8000).catch(() => null);
    step('게이트웨이가 닿지 않으면 opencodex 안내, 세션은 만들지 않는다', tx && (await sessions(page)).every((s) => before.has(s.id)), { toast: tx });
    const railImg = await page.$eval(`${DS} img`, (e) => e.getAttribute('src')).catch(() => null);
    step('레일은 파랑 바탕 DeepSeek 단추', /deepseek-badge\.svg$/.test(railImg || ''), { railImg });
    await shot(page, 'p25-1-gateway-down');
  } else {
  await page.click(DS);
  await sleep(300);
  step('DeepSeek 단추는 대화상자를 열지 않는다', !(await page.$('[data-role="spawn"]')));
  ds = await until(async () => (await sessions(page)).find((s) => !before.has(s.id)), 30000);
  const f1 = await until(async () => { const f = await focusIn(page, ds.id); return f.focusId === ds.id && f.inNode && f.xterm ? f : null; }, 20000).catch(() => null);
  step('새 DeepSeek 세션 노드의 터미널로 들어간다', f1, f1 || (await focusIn(page, ds.id)));
  const ev = await spawnEvent(page, ds.id);
  const args = (ev && ev.args) || [];
  step('판이 띄우는 Claude Code(종류 claude, flavor deepseek, hook)이고 모델은 DeepSeek', ds.kind === 'claude' && ds.flavor === 'deepseek' && ds.hooked && args[args.indexOf('--model') + 1] === DS_MODEL && args.includes('--settings') && !args.includes('--effort'),
    { name: ds.name, kind: ds.kind, flavor: ds.flavor, hooked: ds.hooked, model: ds.model, args: args.filter((a) => !a.includes('\\') && !a.includes('/')) });
  ds = await waitState(page, ds.id, ['ready', 'trust_wait', 'waiting'], 90000).catch(() => ds);
  step('DeepSeek 세션이 준비된다(ready)', ds.state === 'ready', { state: ds.state });

  // 2. 노드 머리줄과 아이콘 얼굴의 DeepSeek 로고, 레일 단추 그림
  await sleep(1000);
  const look = await page.evaluate((sid) => {
    const n = document.querySelector(`.mt-node[data-session="${sid}"]`);
    const head = n && n.querySelector('.mt-head-kind img');
    const rail = document.querySelector('[data-role="rail-left"] [data-launcher="deepseek"] img');
    const badge = n && n.querySelector('[data-role="flavor-badge"]');
    return { nodeClass: n && [...n.classList].find((c) => c.startsWith('kind-')), head: head && head.getAttribute('src'), rail: rail && rail.getAttribute('src'), badge: badge && badge.textContent, badgeTitle: badge && badge.title };
  }, ds.id);
  step('노드는 DeepSeek 로고와 DeepSeek 표시, 레일은 파랑 바탕 단추', look.nodeClass === 'kind-deepseek' && /deepseek\.svg$/.test(look.head || '') && /deepseek-badge\.svg$/.test(look.rail || '') && look.badge === 'DeepSeek', look);
  await shot(page, 'p25-1-node');
  const railBox = await page.$eval('[data-role="rail-left"]', (e) => { const r = e.getBoundingClientRect(); return { x: Math.max(0, r.x - 6), y: Math.max(0, r.y - 6), width: r.width + 260, height: r.height + 12 }; });
  await page.hover(DS);
  await sleep(600);
  await shot(page, 'p25-2-rail', railBox);
  const side = await page.evaluate((name) => { const r = [...document.querySelectorAll('.mt-sb-line')].find((x) => x.textContent.includes(`@${name}`)); return r ? r.textContent : null; }, ds.name);
  if (side != null) step('사이드바 줄에도 DeepSeek', /DeepSeek/.test(side), { side });

  // 3. 한 마디 지시(턴 하나): 권한 질문 하나 → 승인 줄에서 허용 → 답. P25_SKIP_TURN=1이면 3·4를 건너뛴다(DeepSeek API를 다시 쓰지 않고 나머지만 다시 볼 때)
  if (!process.env.P25_SKIP_TURN) {
  const hooks0 = ds.hooks.count;
  const prompt = 'Use the Bash tool to run exactly this command and nothing else: node -e "console.log(\'P25-\' + \'DEEPSEEK\')" . Then reply with only its output.';
  const sendOut = atrium('send', `@${ds.name}`, prompt, '--wait');
  log('send', sendOut.trim().split('\n').slice(-3).join(' | '));
  ds = await waitState(page, ds.id, ['waiting'], 180000).catch(async () => byId(page, ds.id));
  step('DeepSeek 세션이 권한을 묻는다(hook의 PermissionRequest)', ds.state === 'waiting' && ds.ask && (ds.ask.kind === 'permission'), { state: ds.state, ask: ds.ask && { kind: ds.ask.kind, tool: ds.ask.tool, summary: ds.ask.summary } });
  await goNode(page, ds.id);
  // P104: 판의 승인 줄은 없다(사람은 터미널에서 답한다). 시험은 CLI와 같은 session.answer로 답한다
  const bars = await page.$$eval(`.mt-node[data-session="${ds.id}"] [data-role="approval"]`, (l) => l.length);
  step('P104: 노드에 승인 줄이 없다', bars === 0, { bars });
  await sleep(800);
  await shot(page, 'p25-3-approval', await nodeBox(page, ds.id));
  await page.evaluate(([id, tu]) => window.__mt.api.call('session.answer', { session: id, toolUseId: tu, choice: 1 }), [ds.id, ds.ask && ds.ask.toolUseId]);
  ds = await waitState(page, ds.id, ['ready'], 180000).catch(async () => byId(page, ds.id));
  step('허용하면 턴을 마치고 DeepSeek의 답이 hook으로 온다', ds.state === 'ready' && /P25-DEEPSEEK/.test(ds.lastAnswer || ''), { state: ds.state, lastAnswer: (ds.lastAnswer || '').slice(0, 200) });
  step('hook 상태: hook이 왔고 토큰이 맞다', ds.hooks.count > hooks0 && ds.hooks.lastAuthOk === true, ds.hooks);
  await sleep(800);
  await shot(page, 'p25-4-answer', await nodeBox(page, ds.id));

  // 4. 이어 가기: herdr에 판의 인자(설정 파일, DeepSeek 모델)로 등록됐는지, 잠재운 뒤 깨우면 같은 대화로 이어 가는지(지시는 보내지 않는다)
  ds = await until(async () => { const x = await byId(page, ds.id); return x.resume && x.resume.verified ? x : null; }, 60000, 1000).catch(async () => byId(page, ds.id));
  step('이어 가기 등록 확인(resume verified)', ds.resume && ds.resume.verified, ds.resume);
  await call(page, 'session.sleep', { session: ds.id });
  ds = await waitState(page, ds.id, ['sleeping'], 60000).catch(async () => byId(page, ds.id));
  step('잠재우기가 된다(DeepSeek도 Claude Code라서)', ds.state === 'sleeping', { state: ds.state });
  await call(page, 'session.wake', { session: ds.id });
  ds = await waitState(page, ds.id, ['ready'], 120000).catch(async () => byId(page, ds.id));
  const evs = await call(page, 'session.events', { session: ds.id });
  const woke = evs.filter((e) => /wake|woke|resume/.test(e.kind)).map((e) => e.kind);
  const screen = screenOf(ds.paneId);
  step('깨우면 같은 세션으로 이어 간다(ready, flavor 그대로)', ds.state === 'ready' && ds.flavor === 'deepseek', { state: ds.state, flavor: ds.flavor, events: woke.slice(-6) });
  log('wake screen tail', screen.slice(-400));
  await shot(page, 'p25-5-woken', await nodeBox(page, ds.id));

  } else log('P25_SKIP_TURN: 3(지시와 승인 줄)·4(이어 가기)를 건너뛴다');
  } // LIVE

  // 5. 설정의 직접 명령: 새 셸 패널에 그대로 친다(echo 뒤 claude --model haiku). hook 없는 에이전트이고 표시는 DeepSeek
  // claude는 뜰 때 화면을 지우므로 echo 결과를 시험 폴더의 파일로 남겨 친 명령이 그대로 돌았는지 본다
  const MARK = path.join(DIR, 'p25-direct.txt');
  fs.rmSync(MARK, { force: true });
  const CMD = 'echo P25-DIRECT > p25-direct.txt; claude --model haiku';
  dsCmd = (await call(page, 'launcher.create', { launcher: { name: 'DeepSeek CLI', harness: 'command', icon: 'deepseek', command: CMD }, favorite: true })).launcher; // P33: 옛 settings.set deepseekCommand
  await sleep(300);
  const before2 = new Set((await sessions(page)).map((s) => s.id));
  await page.click(`[data-role="rail-left"] [data-launcher="${dsCmd.id}"]`);
  dc = await until(async () => (await sessions(page)).find((s) => !before2.has(s.id)), 30000);
  const ev2 = await spawnEvent(page, dc.id);
  step('직접 명령으로 띄운 세션: 셸 패널, flavor deepseek, 명령을 그대로 기록', dc.flavor === 'deepseek' && ev2 && ev2.command === CMD && ev2.kind === 'shell', { kind: dc.kind, flavor: dc.flavor, ev: ev2 && { kind: ev2.kind, command: ev2.command } });
  dc = await until(async () => { const x = await byId(page, dc.id); return x.kind === 'claude' ? x : null; }, 60000, 500).catch(async () => byId(page, dc.id));
  step('셸에서 claude가 뜨면 같은 노드가 hook 없는 claude가 된다(표시는 DeepSeek)', dc.kind === 'claude' && !dc.hooked && dc.fromShell && dc.flavor === 'deepseek', { kind: dc.kind, hooked: dc.hooked, fromShell: dc.fromShell, state: dc.state });
  await sleep(4000);
  const markBuf = fs.existsSync(MARK) ? fs.readFileSync(MARK) : null; // Windows PowerShell의 >는 UTF-16LE(BOM)로 쓴다
  const markText = markBuf ? (markBuf[0] === 0xff && markBuf[1] === 0xfe ? markBuf.subarray(2).toString('utf16le') : markBuf.toString('utf8')).replace(/^﻿/, '').trim() : null;
  const scrText = screenOf(dc.paneId);
  step('친 명령이 그대로 돌았다(echo가 쓴 파일, 화면은 haiku claude, 판이 덧붙인 인자 없음)', markText === 'P25-DIRECT' && /Haiku/.test(scrText || ''), { markText, screen: String(scrText || '').split('\n').filter((l) => /Claude Code|Haiku/.test(l)).slice(0, 3) });
  fs.rmSync(MARK, { force: true });
  const look2 = await page.evaluate((sid) => { const n = document.querySelector(`.mt-node[data-session="${sid}"]`); const head = n && n.querySelector('.mt-head-kind img'); const badge = n && n.querySelector('[data-role="flavor-badge"]'); return { head: head && head.getAttribute('src'), badgeTitle: badge && badge.title }; }, dc.id);
  step('직접 명령 노드도 DeepSeek 로고, hook 없음 표시', /deepseek\.svg$/.test(look2.head || '') && /hook/.test(look2.badgeTitle || ''), look2);
  await goNode(page, dc.id);
  await sleep(1500);
  await shot(page, 'p25-6-direct', await nodeBox(page, dc.id));

  // 6. Shift+누르기: 직접 명령 호출자는 그 호출자(명령 미리보기, 모델·첫 지시 칸 없음), DeepSeek 호출자로 바꾸면 DeepSeek 모델 칸과 첫 지시 칸
  await page.click(`[data-role="rail-left"] [data-launcher="${dsCmd.id}"]`, { modifiers: ['Shift'] });
  await page.waitForSelector('[data-role="spawn"]', { timeout: 5000 });
  const dlg = await page.evaluate(() => { const f = document.querySelector('[data-role="spawn"]'); const q = (s) => f.querySelector(s); return { launcher: q('[data-field=launcher]').value, preview: (q('[data-role=launcher-preview]') || {}).textContent, model: !!q('[data-field=model]'), prompt: !!q('[data-field=prompt]') }; });
  step('Shift+누르기 대화상자: 직접 명령 호출자, 명령 미리보기, 모델·첫 지시 칸 없음', dlg.launcher === dsCmd.id && dlg.preview === CMD && !dlg.model && !dlg.prompt, dlg);
  await page.selectOption('[data-role="spawn"] [data-field=launcher]', 'deepseek');
  await sleep(200);
  const dlg2 = await page.evaluate(() => { const f = document.querySelector('[data-role="spawn"]'); const m = f.querySelector('[data-field=model]'); return { model: m && m.value, prompt: !!f.querySelector('[data-field=prompt]') }; });
  step('DeepSeek 호출자를 고르면 DeepSeek 모델 칸과 첫 지시 칸', dlg2.model === DS_MODEL && dlg2.prompt, dlg2);
  await shot(page, 'p25-7-dialog');
  await page.click('[data-role="spawn"] button[type=button]').catch(() => {});

  // 7. 설정 화면(P33: 호출자 탭)의 DeepSeek 모델과 직접 명령
  await page.click('[data-role="top-right"] [data-action="settings-open"]');
  await page.click('[data-role="settings-tabs"] [data-tab="launchers"]');
  await page.waitForSelector('[data-role="launchers-list"]', { timeout: 5000 });
  const sv = await page.evaluate((id) => ({ model: document.querySelector('[data-role=launcher-row][data-launcher=deepseek]').title || document.querySelector('[data-role=launcher-row][data-launcher=deepseek] .mt-ln-line').title, command: document.querySelector(`[data-role=launcher-row][data-launcher="${id}"] .mt-ln-line`).title }), dsCmd.id);
  step('설정 화면에 DeepSeek 모델과 직접 명령이 보인다', sv.model.includes(DS_MODEL) && sv.command === CMD, sv);
  await page.click(`[data-role=launcher-row][data-launcher="${dsCmd.id}"] [data-action=launcher-edit]`);
  await page.fill('[data-field=launcher-command]', 'echo a');
  await page.click('[data-action=launcher-save]');
  await until(async () => (await call(page, 'launcher.list')).launchers.find((l) => l.id === dsCmd.id).command === 'echo a', 5000).then(() => step('설정 화면에서 직접 명령을 바꾼다', true), () => step('설정 화면에서 직접 명령을 바꾼다', false));
  const bad = await call(page, 'launcher.update', { id: dsCmd.id, patch: { command: 'a\nb' } }).then(() => null, (e) => String(e.key || e.message || e));
  step('줄바꿈이 든 직접 명령은 거부한다', bad && /한 줄/.test(bad), { bad });
  await sleep(300);
  await shot(page, 'p25-8-settings');
  await page.click('[data-action="settings-close"]').catch(() => {});
} catch (e) {
  step('시험 중 오류', false, e.stack || e.message);
  await shot(page, 'p25-error').catch(() => {});
} finally {
  try {
    for (const s of await sessions(page)) { try { atrium('kill', s.name, '--yes'); } catch (e) { log('kill 오류', s.name, e.message); } }
    if (dsCmd) await call(page, 'launcher.delete', { id: dsCmd.id });
    await call(page, 'settings.set', { language: 'en' });
  } catch (e) { log('정리 오류', e.message); }
  await closeApp(app);
}
fs.writeFileSync(path.join(OUT, 'p25-deepseek.json'), JSON.stringify(results, null, 2));
log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
