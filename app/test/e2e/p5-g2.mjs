// P5 완료 기준 3(G2): 일반 셸. 새 세션 대화상자로 띄운 셸과, 에이전트가 herdr pane split만 하고 둔 빈 패널이 셸 노드로 보이고 실행 중인 명령이 보인다.
// 셸에서 에이전트를 띄우면 같은 노드의 종류가 바뀐다(새 노드가 생기지 않는다). 셸에 @로 보내면 not_agent로 거부된다. 셸의 터미널 입력과 끄기가 된다. MT_E2E_OUT=p5
// 시험 에이전트에게 herdr --session·--machine·--remote를 쓰게 하지 않는다.
import { shot, logger, closeApp } from './harness.mjs';
import { launch, view, sessionBy, spawnDialog, nodeText, atrium, herdr, until, sleep, clickWs, PROJ } from './p5-lib.mjs';

const log = logger('p5-g2');
const { app, page } = await launch({ log });
await sleep(1200);
await clickWs(page, 'multitask');
const ids = async () => page.evaluate(() => [...window.__mt.getState().sessions.values()].map((s) => `${s.name}:${s.kind}`).sort());
const positions = () => page.evaluate(() => { const st = window.__mt.getState(); return [...st.nodes].map(([id, r]) => `${(st.sessions.get(id) || {}).name}:${Math.round(r.x)},${Math.round(r.y)}`).sort().join(' '); });
log('노드 자리(시작)', await positions());
const type = (paneId, text) => { herdr('pane.send_text', { pane_id: paneId, text }); herdr('pane.send_keys', { pane_id: paneId, keys: ['enter'] }); };

// 앞 실행이 남긴 셸은 끈다
for (const s of await page.evaluate(() => [...window.__mt.getState().sessions.values()].filter((x) => x.name === 'runsh' || (x.kind === 'shell' && x.origin === 'adopted')).map((x) => x.name))) { atrium('kill', s, '--yes'); log(`앞 실행의 ${s}를 끔`); }
await sleep(1000);

// 1) 대화상자로 셸을 띄우고 명령을 돌린다 → 셸 노드에 실행 중인 명령과 프로세스
await spawnDialog(page, { cwd: PROJ, name: 'runsh', kind: 'shell' }, log);
await sleep(2500);
let sh = await sessionBy(page, 'runsh');
log('runsh', { kind: sh.kind, state: sh.state, shell: sh.shell, origin: sh.origin });
type(sh.paneId, 'ping -n 25 127.0.0.1');
await until(async () => { const s = await sessionBy(page, 'runsh'); return s.state === 'shell_running' && s.shell.procs.length; }, 30000, 500);
sh = await sessionBy(page, 'runsh');
log('명령 실행 중', { state: sh.state, shell: sh.shell });
await page.evaluate((id) => window.__mt.getState().navigateTo(id), sh.sessionId);
await sleep(1500);
await shot(page, 'g2-1-shell-running-close', log);
// 중간 얼굴(배율을 낮춤)과 세션 줄에도 보인다
await page.evaluate(() => { const st = window.__mt.getState(); st.setViewport({ ...st.vpNow, zoom: 0.4 }); });
await sleep(1200);
await page.evaluate((id) => { const st = window.__mt.getState(); const r = st.nodes.get(id); const el = document.querySelector('.mt-canvas'); st.setViewport({ x: el.clientWidth / 2 - (r.x + r.w / 2) * 0.4, y: el.clientHeight / 2 - (r.y + r.h / 2) * 0.4, zoom: 0.4 }); }, sh.sessionId);
await sleep(1200);
log('중간 얼굴', await nodeText(page, 'runsh'));
log('세션 줄', (await view(page)).strip.find((x) => x.name === 'runsh'));
await shot(page, 'g2-2-shell-running-middle-and-strip', log);
await until(async () => (await sessionBy(page, 'runsh')).state === 'shell_idle', 40000, 1000);
log('명령 끝', (await sessionBy(page, 'runsh')).shell);

// 2) 셸의 터미널 입력: 노드 터미널에 직접 친다
await page.evaluate((id) => window.__mt.getState().navigateTo(id, { focusTerminal: true }), sh.sessionId);
await sleep(2000);
await page.click(`.mt-node[data-name="runsh"] .xterm`);
await page.keyboard.type('echo typed-in-board');
await page.keyboard.press('Enter');
await sleep(1500);
const screen = atrium('screen', 'runsh', '--text');
log('노드 자리(터미널 입력 뒤)', await positions());
log('터미널 입력 뒤 화면 끝', screen.split('\n').filter((l) => l.trim()).slice(-3));
await shot(page, 'g2-3-shell-terminal-input', log);

// 3) 에이전트가 pane split만 하고 둔 빈 패널 → 셸 노드(부모와 이어짐)
const before = await ids();
atrium('send', '@b', 'Use herdr to split your own pane to the right and leave the new pane as an empty shell: do not start any agent or command in it. Then reply with exactly the new pane id.');
log('b에게 빈 패널 나누기를 시킴');
let split = null;
for (let i = 0; i < 120 && !split; i++) {
  const b = await sessionBy(page, 'b');
  if (b.state === 'waiting' && b.ask && b.ask.kind === 'permission') { log('b 권한 요청', b.ask.summary); atrium('answer', 'b', '1'); await sleep(1500); continue; }
  split = await page.evaluate(() => [...window.__mt.getState().sessions.values()].find((s) => s.kind === 'shell' && s.origin === 'adopted') || null);
  await sleep(1000);
}
await until(async () => (await sessionBy(page, 'b')).state === 'ready', 90000, 1000).catch(() => {});
split = await page.evaluate(() => [...window.__mt.getState().sessions.values()].find((s) => s.kind === 'shell' && s.origin === 'adopted') || null);
log('b의 답', (await sessionBy(page, 'b')).lastAnswer);
log('세션 목록 전', before, '뒤', await ids());
log('나눈 패널 노드', split && { name: split.name, kind: split.kind, state: split.state, paneId: split.paneId, parent: split.parentSessionId && (await page.evaluate((id) => window.__mt.getState().sessions.get(id).name, split.parentSessionId)), workspaceKey: split.workspaceKey });
const links = await page.evaluate(() => [...window.__mt.getState().links.values()].map((l) => `${l.fromName}->${l.toName}${l.spawned ? '(띄움)' : ''}${l.role ? ` ${l.role}` : ''}`));
log('연결', links);
if (split) {
  await page.evaluate(([a, b]) => { const st = window.__mt.getState(); const rs = [a, b].map((id) => st.nodes.get(id)); const x0 = Math.min(...rs.map((r) => r.x)) - 80, y0 = Math.min(...rs.map((r) => r.y)) - 80, x1 = Math.max(...rs.map((r) => r.x + r.w)) + 80, y1 = Math.max(...rs.map((r) => r.y + r.h)) + 80; const el = document.querySelector('.mt-canvas'); const z = Math.min(0.6, el.clientWidth / (x1 - x0), el.clientHeight / (y1 - y0)); st.setViewport({ x: (el.clientWidth - (x1 - x0) * z) / 2 - x0 * z, y: (el.clientHeight - (y1 - y0) * z) / 2 - y0 * z, zoom: z }); }, [split.sessionId, split.parentSessionId]);
  await sleep(1500);
  log('나눈 패널 노드 표시', await nodeText(page, split.name));
  await shot(page, 'g2-4-split-empty-pane-shell-node', log);

  // 4) 셸에 @로 보내면 거부(not_agent)
  await page.click('[data-role=command]');
  await page.keyboard.insertText(`@${split.name} hi`);
  await page.keyboard.press('Escape');
  const opts = await page.evaluate(() => [...document.querySelectorAll('.mt-mention-item')].map((e) => e.innerText));
  await page.click('[data-role=command]');
  await page.keyboard.press('Enter');
  await sleep(800);
  const toasts = await page.evaluate(() => [...document.querySelectorAll('.mt-toast')].map((e) => e.innerText));
  log('셸에 보내기', { toasts, mentionMenu: opts });
  await shot(page, 'g2-5-send-to-shell-rejected', log);
  try { atrium('send', `@${split.name}`, 'hi'); log('보내짐(안 됨)'); } catch (e) { log('atrium도 거부', String(e.stderr || e.message).split('\n').find((l) => /not_agent/.test(l))); }
  await page.fill('[data-role=command]', '');

  // 5) 셸에서 에이전트를 띄우면 같은 노드의 종류가 바뀐다
  const sid = split.sessionId;
  type(split.paneId, 'claude --model haiku');
  log(`${split.name} 패널에서 claude를 띄움`);
  await until(async () => { const s = await page.evaluate((id) => window.__mt.getState().sessions.get(id), sid); return s && s.kind === 'claude' && ['ready', 'working', 'waiting', 'trust_wait'].includes(s.state); }, 60000, 1000);
  const promoted = await page.evaluate((id) => window.__mt.getState().sessions.get(id), sid);
  log('같은 노드(세션 ID 같음)', { sessionId: promoted.sessionId === sid, name: promoted.name, kind: promoted.kind, state: promoted.state, fromShell: promoted.fromShell, hooked: promoted.hooked, agentName: promoted.agentName });
  log('세션 목록', await ids());
  await sleep(2000);
  log('노드', await nodeText(page, promoted.name));
  await shot(page, 'g2-6-shell-became-claude-same-node', log);
  // 에이전트가 되었으니 이제 @로 보낼 수 있다
  if (promoted.state === 'ready') {
    atrium('send', `@${promoted.name}`, 'Reply with exactly: from-shell', '--wait');
    await until(async () => (await page.evaluate((id) => window.__mt.getState().sessions.get(id), sid)).state === 'ready', 60000, 1000).catch(() => {});
    log('에이전트가 된 노드의 답', (await page.evaluate((id) => window.__mt.getState().sessions.get(id), sid)).lastAnswer);
  }
  // claude를 끝내면(/exit) 같은 노드가 다시 셸이 된다
  type(promoted.paneId, '/exit');
  await until(async () => { const s = await page.evaluate((id) => window.__mt.getState().sessions.get(id), sid); return s && s.kind === 'shell'; }, 40000, 1000);
  log('claude가 끝난 뒤', await page.evaluate((id) => { const s = window.__mt.getState().sessions.get(id); return { name: s.name, kind: s.kind, state: s.state }; }, sid));
  await shot(page, 'g2-7-back-to-shell', log);
  // 셸에서 exit하면 패널이 없어지고 노드도 빠진다
  await sleep(2500); // claude가 화면을 정리하는 동안 친 글은 사라진다
  type(promoted.paneId, 'exit');
  await until(async () => !(await page.evaluate((id) => window.__mt.getState().sessions.has(id), sid)), 20000, 500);
  log('셸에서 exit → 노드 빠짐', await ids());
}

// 6) 셸 끄기: 확인 뒤 패널 닫기
type(sh.paneId, 'ping -n 30 127.0.0.1');
await until(async () => (await sessionBy(page, 'runsh')).state === 'shell_running', 20000, 500);
await page.evaluate((id) => window.__mt.getState().navigateTo(id), sh.sessionId);
await sleep(1200);
await page.click('.mt-node[data-name="runsh"] .mt-x[title="세션 끄기"]');
await page.waitForSelector('.mt-node[data-name="runsh"] .mt-kill .mt-btn.danger');
await sleep(600);
log('끄기 확인 문구', await page.evaluate(() => document.querySelector('.mt-node[data-name="runsh"] .mt-kill').innerText.replace(/\s+/g, ' ')));
await shot(page, 'g2-8-kill-shell-confirm', log);
await page.click('.mt-node[data-name="runsh"] .mt-kill .mt-btn.danger');
await until(async () => !(await sessionBy(page, 'runsh')), 20000, 500);
log('끈 뒤 herdr 패널', herdr('pane.list', {}).panes.map((p) => `${p.pane_id}:${p.agent || 'shell'}`));
log('노드 자리(끝)', await positions());
log('이벤트', atrium('events', '--limit', '300').split('\n').filter((l) => /adopted|shell_agent|closed/.test(l)).slice(-8));
await closeApp(app);
process.exit(0);
