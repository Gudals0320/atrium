// 완료 기준 7(ARCH 4절 C1): 창을 닫았다 다시 열면 배치가 그대로이고, 세션은 계속 돌았고, 화면이 돌아온다.
// 창을 닫은 동안 atrium로 b에 글을 보내 턴을 돌린다(창 없이도 세션이 돈다는 증거).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { launch, shot, logger, sessionsOf, sleep, until, REPO } from './harness.mjs';

const log = logger('c7-reopen');
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8' });
const snap = (page) => page.evaluate(async () => {
  const st = window.__mt.getState();
  const b = await window.__mt.api.call('board.get');
  const screens = {};
  for (const [id, t] of window.__mt.terms) {
    const buf = t.buffer.active; const lines = [];
    for (let r = 0; r < t.rows; r++) lines.push(buf.getLine(r).translateToString(true).replace(/\s+$/, ''));
    const h = (await window.__mt.api.call('terminal.snapshot', { session: id, format: 'text' })).text.split('\n').map((l) => l.replace(/\s+$/, ''));
    screens[st.sessions.get(id).name] = { rows: lines.length, diff: lines.filter((l, i) => l !== (h[i] || '')).length, nonEmpty: lines.filter(Boolean).length };
  }
  return {
    nodes: Object.fromEntries(b.nodes.map((n) => [st.sessions.get(n.session_id)?.name, `${n.x},${n.y} ${n.w}x${n.h}`])),
    viewport: b.viewport, transform: document.querySelector('.react-flow__viewport').style.transform,
    sessions: Object.fromEntries([...st.sessions.values()].map((s) => [s.name, `${s.state} pane=${s.paneId}`])),
    attached: st.attached.length, screens,
  };
});

// 1) 열고, a를 원래 크기로 돌리고(c6에서 키웠다), 넷이 보이게 맞춘다
let { app, page, mainPid } = await launch({ log });
const A = (await sessionsOf(page)).find((s) => s.name === 'a').id;
await page.evaluate((id) => window.__mt.api.call('board.setNode', { session: id, x: 0, y: 0, w: 720, h: 460 }), A);
await page.reload();
await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 30000 });
await page.locator('.react-flow__controls-fitview').click();
await sleep(3000);
const before = await snap(page);
log('닫기 전', before);
await shot(page, 'c7-before-close', log);
await app.close();
log(`창 닫음(main pid ${mainPid})`);

// 2) 창이 없는 동안: 백엔드와 세션은 그대로 돈다. b에 글을 보내 턴 하나를 돌린다.
log('창 닫은 뒤 atrium status', atrium('status').split('\n')[0]);
log('atrium send', atrium('send', '@b', 'Reply with exactly: while-window-closed', '--wait', '--timeout', '60').trim().split('\n').slice(-2));
await sleep(3000);
log('atrium ls', atrium('ls').trim().split('\n').filter((l) => !l.includes('↳')));

// 3) 다시 연다
({ app, page, mainPid } = await launch({ log }));
await sleep(3500);
const after = await snap(page);
log('다시 연 뒤', after);
log('배치 같음', JSON.stringify(before.nodes) === JSON.stringify(after.nodes), '뷰포트 같음', JSON.stringify(before.viewport) === JSON.stringify(after.viewport), before.transform === after.transform);
log('b 마지막 답(창이 닫힌 동안의 턴)', (await sessionsOf(page)).find((s) => s.name === 'b').lastAnswer);
await shot(page, 'c7-after-reopen', log);
await app.close();
