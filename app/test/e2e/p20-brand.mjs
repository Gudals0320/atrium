// P20 창 시험: 초록 강조색, 내 차례는 주황(주의색), Claude 심볼(노드는 바탕 없음, 레일 단추는 주황 바탕), 명령 입력의 Atrium 로고,
// 처음 화면(로고와 텍스트 로고)과 설정 아래 텍스트 로고. 찍어 두고 몇 가지 색과 그림 주소를 확인한다.
// 판: herdr 세션 atrium-dev-p20, 포트 47836, backend/.dev/p20. 시험 폴더는 새로 만든 C:\Workspace\mtask-p20-ws\demo 하나, 시험 claude는 haiku.
// 사용: MT_E2E_OUT=p20 node test/e2e/p20-brand.mjs
// P28: 처음 화면은 텍스트 로고 하나(어두운 글자와 밝은 글자 두 겹), 설정 아래 텍스트 로고는 뺐다. 판 값은 MT_E2E_HERDR_SESSION·MT_E2E_PORT·MT_E2E_DEV·MT_E2E_DIR로 덮는다
//   (예: node experiments/p28/tools/e2e.cjs p20-brand.mjs, 결과는 experiments/p28)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from 'playwright';
import { APP_ROOT, REPO, OUT, sleep, until, logger, closeApp } from './harness.mjs';
import { assertTestBoard } from './p9-guard.mjs';

if (!['p20', 'p28'].includes(process.env.MT_E2E_OUT)) throw new Error('MT_E2E_OUT=p20(또는 p28)을 명령줄에서 준다');
const DEV = process.env.MT_E2E_DEV || path.join(REPO, 'backend', '.dev', 'p20');
const DIR = process.env.MT_E2E_DIR || 'C:\\Workspace\\mtask-p20-ws\\demo';
const PROJECT = path.join(os.homedir(), '.claude', 'projects', DIR.replace(/[^A-Za-z0-9]/g, '-'));
const ENV = {
  ATRIUM_HERDR_SESSION: process.env.MT_E2E_HERDR_SESSION || 'atrium-dev-p20', ATRIUM_PORT: process.env.MT_E2E_PORT || '47836',
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: PROJECT, ATRIUM_CLAUDE_DESKTOP: 'none',
};
assertTestBoard(ENV, { root: DEV });
fs.mkdirSync(DIR, { recursive: true });

const log = logger('p20-brand');
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k))), ...ENV };
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env });
const results = [];
const step = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); log(`${ok ? '통과' : '실패'} ${name}`, detail ?? ''); };
const shot = (page, n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });

const app = await electron.launch({ args: ['.', '--dev'], cwd: APP_ROOT, env, timeout: 60000 });
const page = await app.firstWindow();
try {
  // 1. 처음 화면: 텍스트 로고 하나(P28: 아이콘 없음, 어두운 글자 위에 밝은 글자가 차오르는 두 겹)
  await page.waitForSelector('[data-role="splash"] .mt-splash-word', { timeout: 20000 }).catch(() => {});
  await sleep(900);
  const splash = await page.evaluate(() => { const s = document.querySelector('[data-role="splash"]'); if (!s) return null; const imgs = [...s.querySelectorAll('img')]; return { imgs: imgs.map((i) => ({ src: i.getAttribute('src'), w: i.naturalWidth })), text: s.textContent }; });
  if (splash) await shot(page, 'p20-1-splash');
  step('처음 화면에 텍스트 로고만 보인다(아이콘 없음)', splash && splash.imgs.length === 2 && splash.imgs.every((i) => i.w > 0 && /atrium-wordmark/.test(i.src)), splash);

  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1584, 921));
  await page.evaluate((d) => window.__mt.api.call('workspace.open', { path: d }), DIR);

  // 2. 강조색과 그림
  const look = await page.evaluate(() => {
    const css = (sel, prop) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
    const v = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    return {
      accent: v('--accent'), accent2: v('--accent-2'), attn: v('--attn'), working: v('--con-line-working'),
      toolOn: css('.mt-tool.on', 'backgroundColor'),
      mark: (document.querySelector('.mt-cmd .mt-mark') || {}).getAttribute?.('src') || null,
      railClaude: (document.querySelector('[data-role="rail-left"] [data-action="spawn"] img') || {}).getAttribute?.('src') || null,
    };
  });
  step('강조색은 초록, 내 차례는 주황', look.accent === '#1cb66d' && look.accent2 === '#75ec9c' && look.attn === '#ff6b3d' && /28, 182, 109/.test(look.working) && look.toolOn === 'rgb(28, 182, 109)', look);
  step('명령 입력 왼쪽은 Atrium 로고, 레일의 Claude 단추는 주황 바탕 심볼', look.mark === 'assets/brand/atrium-icon.svg' && look.railClaude === 'assets/kinds/claude-badge.svg', { mark: look.mark, rail: look.railClaude });

  // 3. 세션: 노드 머리줄 Claude 심볼, 일하는 중 초록 테두리, 내 차례 주황
  atrium('spawn', DIR, '--name', 'c1', '--model', 'haiku');
  atrium('spawn', DIR, '--name', 'sh1', '--kind', 'shell');
  await until(() => page.evaluate(() => [...window.__mt.getState().sessions.values()].some((s) => s.name === 'c1' && s.state === 'ready')), 90000);
  await sleep(1500);
  atrium('send', '@c1', 'Use the AskUserQuestion tool to ask me one question: Continue? with the options Yes and No. Do nothing else.', '--wait');
  await until(() => page.evaluate(() => [...window.__mt.getState().sessions.values()].some((s) => s.name === 'c1' && s.state === 'waiting')), 120000).catch(() => {});
  await page.evaluate(() => window.__mt.getState().fitAll && window.__mt.getState().fitAll(0));
  await sleep(1500);
  const node = await page.evaluate(() => {
    const n = document.querySelector('.mt-node[data-name="c1"]');
    return n ? { icon: (n.querySelector('.mt-head-kind img') || {}).getAttribute?.('src') || null, border: getComputedStyle(n).borderTopColor, state: [...window.__mt.getState().sessions.values()].find((s) => s.name === 'c1').state } : null;
  });
  step('노드 머리줄은 바탕 없는 Claude 심볼, 내 차례 노드는 주황 테두리', node && node.icon === 'assets/kinds/claude.svg' && node.state === 'waiting' && node.border === 'rgb(255, 107, 61)', node);
  await shot(page, 'p20-2-board');
  const c1 = await page.$('.mt-node[data-name="c1"]');
  if (c1) await c1.screenshot({ path: path.join(OUT, 'p20-3-node-turn.png') });
  const bottom = await page.$('.mt-cmd');
  if (bottom) await page.screenshot({ path: path.join(OUT, 'p20-4-bottom.png'), clip: { x: 330, y: 760, width: 924, height: 160 } });

  // 4. 설정(P28: 아래 텍스트 로고를 뺐다)
  await page.click('[data-role="top-right"] [data-action="settings-open"]');
  await page.waitForSelector('[data-role="settings"] [data-role="settings-tabs"]', { timeout: 5000 });
  await sleep(300);
  await shot(page, 'p20-5-settings');
  step('설정에 텍스트 로고가 없다(P28)', await page.evaluate(() => !document.querySelector('[data-role="settings"] img')));
} catch (e) {
  step('시험 중 오류', false, e.message);
} finally {
  for (const n of ['c1', 'sh1']) { try { atrium('kill', n, '--yes', '--delete'); } catch {} }
  await closeApp(app);
}
fs.writeFileSync(path.join(OUT, 'p20-brand.json'), JSON.stringify(results, null, 2));
log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
