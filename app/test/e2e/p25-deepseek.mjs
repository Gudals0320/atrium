// P25 창 시험: 왼쪽 레일의 DeepSeek 단추. 판: herdr 세션 atrium-dev-p25, 포트 47843, 이 워크트리의 backend/.dev(experiments/p25/tools/env.cjs).
// 시험 폴더는 새로 만든 C:\Workspace\mtask-p25-ws\demo 하나. 대화 목록은 그 폴더의 대화만 읽는다.
// DeepSeek API를 쓰므로 턴은 한 번(권한 질문 하나가 드는 한 마디 지시)만 한다. 직접 명령 시험은 `echo` 뒤 `claude --model haiku`(지시는 보내지 않는다).
// 사용: node experiments/p25/tools/e2e.cjs p25-deepseek.mjs
// 차례: 1 레일 단추(대화상자 없음, 터미널 초점, 모델) → 2 노드·레일 로고 → 3 한 마디 지시와 승인 줄, hook 상태, 답 → 4 이어 가기(등록 확인, 잠재우고 깨우기)
//       → 5 직접 명령 → 6 Shift+누르기 대화상자 → 7 설정 화면
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from 'playwright';
import { APP_ROOT, REPO, OUT, sleep, until, logger, closeApp } from './harness.mjs';
import { assertTestBoard } from './p9-guard.mjs';

if (process.env.MT_E2E_OUT !== 'p25') throw new Error('MT_E2E_OUT=p25를 명령줄에서 준다');
const T = createRequire(import.meta.url)(path.join(REPO, 'experiments', 'p25', 'tools', 'env.cjs'));
const DIR = T.DIR;
const ENV = Object.fromEntries(Object.entries(T.P25_ENV).filter(([k]) => k.startsWith('ATRIUM_')));
assertTestBoard(ENV, { root: T.DEV });
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(DIR, { recursive: true });

const DS_MODEL = 'ocx-claude-deepseek--deepseek-flash[1m]';
const log = logger('p25-deepseek');
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)));
const env = { ...cleanEnv(), ...ENV, MT_HERDR_SESSION: ENV.ATRIUM_HERDR_SESSION };
if (env.MT_HERDR_SESSION !== 'atrium-dev-p25') throw new Error('herdr 세션은 atrium-dev-p25만');
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
let ds = null, dc = null;
try {
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1584, 921));
  await call(page, 'settings.set', { language: 'ko' });
  await call(page, 'workspace.open', { path: DIR });
  await page.waitForSelector('.mt-wsbtn[data-name="demo"]');
  await page.click('.mt-wsbtn[data-name="demo"]');
  await until(() => page.evaluate(() => { const s = window.__mt.getState(); const w = s.workspaces.find((x) => x.key === s.currentWs); return w && w.name === 'demo'; }), 10000);
  // 권한 질문이 뜨도록 manual, herdr 자동 승인 끔. DeepSeek 설정은 기본값
  await call(page, 'settings.set', { claudePermissionMode: 'manual', claudeAllowHerdr: false, claudeEffort: '', deepseekModel: DS_MODEL, deepseekCommand: '' });

  // 1. 레일의 DeepSeek 단추: Codex 아래, 대화상자 없이 뜨고 그 터미널로 들어간다
  const order = await page.$$eval('[data-role="rail-left"] .mt-tool', (els) => els.map((e) => e.getAttribute('data-action')));
  step('DeepSeek 단추는 레일의 Codex 바로 아래', order.indexOf('spawn-deepseek') === order.indexOf('spawn-codex') + 1, order);
  const before = new Set((await sessions(page)).map((s) => s.id));
  await page.click('[data-role="rail-left"] [data-action="spawn-deepseek"]');
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
    const rail = document.querySelector('[data-role="rail-left"] [data-action="spawn-deepseek"] img');
    const badge = n && n.querySelector('[data-role="flavor-badge"]');
    return { nodeClass: n && [...n.classList].find((c) => c.startsWith('kind-')), head: head && head.getAttribute('src'), rail: rail && rail.getAttribute('src'), badge: badge && badge.textContent, badgeTitle: badge && badge.title };
  }, ds.id);
  step('노드는 DeepSeek 로고와 DeepSeek 표시, 레일은 파랑 바탕 단추', look.nodeClass === 'kind-deepseek' && /deepseek\.svg$/.test(look.head || '') && /deepseek-badge\.svg$/.test(look.rail || '') && look.badge === 'DeepSeek', look);
  await shot(page, 'p25-1-node');
  const railBox = await page.$eval('[data-role="rail-left"]', (e) => { const r = e.getBoundingClientRect(); return { x: Math.max(0, r.x - 6), y: Math.max(0, r.y - 6), width: r.width + 260, height: r.height + 12 }; });
  await page.hover('[data-role="rail-left"] [data-action="spawn-deepseek"]');
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
  await page.waitForSelector(`.mt-node[data-session="${ds.id}"] [data-role="approval"] [data-choice="1"]`, { timeout: 15000 });
  const bar = await page.$eval(`.mt-node[data-session="${ds.id}"] [data-role="approval"]`, (e) => e.innerText.replace(/\s+/g, ' '));
  step('승인 줄이 보인다(허용, 거부, 터미널에서 답하기)', /허용/.test(bar) && /거부/.test(bar), { bar });
  await sleep(800);
  await shot(page, 'p25-3-approval', await nodeBox(page, ds.id));
  await page.click(`.mt-node[data-session="${ds.id}"] [data-role="approval"] [data-choice="1"]`);
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

  // 5. 설정의 직접 명령: 새 셸 패널에 그대로 친다(echo 뒤 claude --model haiku). hook 없는 에이전트이고 표시는 DeepSeek
  // claude는 뜰 때 화면을 지우므로 echo 결과를 시험 폴더의 파일로 남겨 친 명령이 그대로 돌았는지 본다
  const MARK = path.join(DIR, 'p25-direct.txt');
  fs.rmSync(MARK, { force: true });
  const CMD = 'echo P25-DIRECT > p25-direct.txt; claude --model haiku';
  await call(page, 'settings.set', { deepseekCommand: CMD });
  const before2 = new Set((await sessions(page)).map((s) => s.id));
  await page.click('[data-role="rail-left"] [data-action="spawn-deepseek"]');
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

  // 6. Shift+누르기: 대화상자의 종류 DeepSeek, 직접 명령 칸(설정 값), 비우면 모델·권한 칸
  await page.click('[data-role="rail-left"] [data-action="spawn-deepseek"]', { modifiers: ['Shift'] });
  await page.waitForSelector('[data-role="spawn"]', { timeout: 5000 });
  const dlg = await page.evaluate(() => { const f = document.querySelector('[data-role="spawn"]'); const q = (s) => f.querySelector(s); return { kind: q('[data-field=kind]').value, command: q('[data-field=deepseek-command]') && q('[data-field=deepseek-command]').value, model: !!q('[data-field=model]'), prompt: !!q('[data-field=prompt]') }; });
  step('Shift+누르기 대화상자: 종류 DeepSeek, 직접 명령이 채워지면 모델·첫 지시 칸 없음', dlg.kind === 'deepseek' && dlg.command === CMD && !dlg.model && !dlg.prompt, dlg);
  await page.fill('[data-field=deepseek-command]', '');
  await sleep(200);
  const dlg2 = await page.evaluate(() => { const f = document.querySelector('[data-role="spawn"]'); const m = f.querySelector('[data-field=model]'); return { model: m && m.value, prompt: !!f.querySelector('[data-field=prompt]') }; });
  step('직접 명령을 비우면 DeepSeek 모델 칸과 첫 지시 칸', dlg2.model === DS_MODEL && dlg2.prompt, dlg2);
  await shot(page, 'p25-7-dialog');
  await page.click('[data-role="spawn"] button[type=button]').catch(() => {});

  // 7. 설정 화면의 DeepSeek 모델과 직접 명령
  await page.click('[data-role="top-right"] [data-action="settings-open"]');
  await page.waitForSelector('[data-field=setting-deepseekCommand]', { timeout: 5000 });
  const sv = await page.evaluate(() => ({ model: document.querySelector('[data-field=setting-deepseekModel]').value, command: document.querySelector('[data-field=setting-deepseekCommand]').value }));
  step('설정 화면에 DeepSeek 모델과 직접 명령이 보인다', sv.model === DS_MODEL && sv.command === CMD, sv);
  await page.fill('[data-field=setting-deepseekCommand]', 'echo a');
  await page.press('[data-field=setting-deepseekCommand]', 'Enter');
  await until(async () => (await call(page, 'settings.get')).settings.deepseekCommand === 'echo a', 5000).then(() => step('설정 화면에서 직접 명령을 바꾼다', true), () => step('설정 화면에서 직접 명령을 바꾼다', false));
  const bad = await call(page, 'settings.set', { deepseekCommand: 'a\nb' }).then(() => null, (e) => String(e.message || e));
  step('줄바꿈이 든 직접 명령은 거부한다', bad && /deepseekCommand/.test(bad), { bad });
  await page.evaluate(() => document.querySelector('[data-field=setting-deepseekCommand]').scrollIntoView({ block: 'center' }));
  await sleep(300);
  await shot(page, 'p25-8-settings');
  await page.click('[data-action="settings-close"]').catch(() => {});
} catch (e) {
  step('시험 중 오류', false, e.stack || e.message);
  await shot(page, 'p25-error').catch(() => {});
} finally {
  try {
    for (const s of await sessions(page)) { try { atrium('kill', s.name, '--yes'); } catch (e) { log('kill 오류', s.name, e.message); } }
    await call(page, 'settings.set', { deepseekCommand: '', claudePermissionMode: 'manual', language: 'en' });
  } catch (e) { log('정리 오류', e.message); }
  await closeApp(app);
}
fs.writeFileSync(path.join(OUT, 'p25-deepseek.json'), JSON.stringify(results, null, 2));
log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
