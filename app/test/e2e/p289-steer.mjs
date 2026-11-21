// P289 창 시험: 이름 붙은 Claude Code 세션(위 가로줄에 이름이 끼어 그려진다)에 일하는 중 "지금 넣기"(스티어링).
// 판: 터미널 세션 atrium-dev-p289, 포트 48039, 이 워크트리의 backend/.dev(data, app). 창의 원격 디버깅 포트 9520.
// 장면(새 폴더 C:\\Workspace\\mtask-p289-a, git 아님): claude haiku "lead"를 띄우고 /rename으로 이름을 붙인다. ping으로 긴 턴을 만든다.
// 단계: setup | run <before|after> | stop. before는 고치기 전 백엔드(P289_BACKEND), after는 이 워크트리 백엔드로 띄운 뒤 돈다.
// 결과는 experiments/p289/<round>/(git 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [STAGE = 'run', ROUND = 'after'] = process.argv.slice(2);
if (!['setup', 'run', 'stop'].includes(STAGE)) throw new Error('단계: setup | run <round> | stop');
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p289', ROUND);
const CONVOS = 'C:\\Workspace\\mtask-p289-projects';
const BOARD = { session: 'atrium-dev-p289', port: 48039, cdp: 9520 };
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD.session, ATRIUM_HERDR_SESSION: BOARD.session, ATRIUM_PORT: String(BOARD.port),
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', MT_E2E_OUT: path.join('p289', ROUND),
};
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
Object.assign(process.env, ENV);
for (const d of [OUT, CONVOS]) fs.mkdirSync(d, { recursive: true });
const { logger, sleep, until, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p289-${STAGE}-${ROUND}`);
const BIN = process.env.P289_BACKEND || path.join(REPO, 'backend', 'bin', 'atrium.mjs');
const atrium = (...a) => execFileSync(process.execPath, [BIN, '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const sessions = () => call('session.list');
const lead = () => sessions().find((s) => s.name === 'lead');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const F = 'C:\\Workspace\\mtask-p289-a';
if (!/^C:\\Workspace\\mtask-p289-[a-z]+$/.test(F)) throw new Error('시험 폴더는 C:\\Workspace\\mtask-p289-*만');
const screenText = () => atrium('screen', 'lead', '--text');

async function setup() {
  log('백엔드', atrium('backend', 'start').trim().slice(0, 200));
  fs.mkdirSync(path.join(F, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(F, 'README.md'), '# mtask-p289-a\n');
  // 오래 도는 턴은 ping만 허용해 만든다(P85). mkdir은 묻는다(권한 질문 장면)
  fs.writeFileSync(path.join(F, '.claude', 'settings.local.json'), JSON.stringify({ permissions: { allow: ['Bash(ping:*)', 'Bash(ping -n *)'] } }, null, 2));
  call('workspace.open', { path: F, select: true });
  const r = call('session.spawn', { cwd: F, name: 'lead', model: 'haiku' });
  log('띄움 lead', r.sessionId);
  await until(() => { const s = lead(); return s && s.state === 'ready'; }, 180000, 2000);
  atrium('input', 'lead', '/rename planning thread\\r');
  await sleep(4000);
  const scr = screenText();
  fs.writeFileSync(path.join(OUT, 'screen-setup.txt'), scr);
  check('장면: 이름 붙은 위 가로줄', /─ planning thread ─/.test(scr), scr.split('\n').filter((l) => /─{12,}/.test(l)).slice(-2));
}

const groupRow = async (page) => page.evaluate(() => { const li = document.querySelector('[data-role=delivery-group] .mt-dq-item'); return li ? { text: li.innerText.replace(/\s+/g, ' ').slice(0, 300), status: li.dataset.status, why: (li.querySelector('[data-steer-why]') || {}).dataset?.steerWhy || null } : null; });
async function snap(page, name) {
  const el = await page.$('.mt-bottom');
  const file = path.join(OUT, `${name}.png`);
  if (el) await el.screenshot({ path: file }); else await page.screenshot({ path: file });
  log('그림', file);
}
async function waitWorking(ms = 90000) { await until(() => { const s = lead(); return s && s.state === 'working'; }, ms, 700); }
async function waitState(st, ms = 180000) { await until(() => { const s = lead(); return s && st.includes(s.state); }, ms, 1000); }
const delivs = () => call('delivery.list', { session: 'lead', limit: 20 });

async function run() {
  const { app, page } = await launch({ log, args: [`--remote-debugging-port=${BOARD.cdp}`] });
  try {
    await page.setViewportSize?.({ width: 1500, height: 900 }).catch(() => {});
    await waitState(['ready'], 60000);
    // 장면 A: 이름 붙은 화면, 긴 턴(ping) 중 대기 글 → "지금 넣기"를 거듭 누른다
    atrium('send', '@lead', 'Use the Bash tool to run this exact command: ping -n 40 127.0.0.1 . When it ends, reply with one short line.');
    await waitWorking();
    await sleep(4000);
    atrium('send', '@lead', 'steer check A, reply with the word PINEAPPLE once the ping ends');
    await until(() => delivs().some((d) => d.status === 'queued'), 20000, 500);
    const dA = delivs().find((d) => d.status === 'queued');
    log('대기 글', dA.deliveryId, dA.reason);
    await page.waitForSelector('[data-role=delivery-group] [data-action=delivery-now]', { timeout: 20000 });
    await snap(page, 'A1-queued');
    const t0 = Date.now();
    let presses = 0;
    for (let i = 0; i < 3; i++) { const ok = await page.click('[data-role=delivery-group] [data-action=delivery-now]', { timeout: 1500 }).then(() => true, () => false); if (ok) presses++; else break; await sleep(2500); } // 들어가면 줄이 사라진다
    log('누른 수', presses);
    const rowA = await groupRow(page);
    await snap(page, 'A2-after-now');
    const afterA = call('delivery.list', { session: 'lead', limit: 20 }).find((d) => d.deliveryId === dA.deliveryId);
    const stillWorking = lead().state === 'working';
    log('A 결과', { status: afterA.status, reason: afterA.reason, stillWorking, ms: Date.now() - t0, row: rowA });
    const typed = ['sent', 'confirmed'].includes(afterA.status) && /typed/.test(afterA.reason || '');
    if (ROUND === 'after') check('A: 이름 붙은 화면에 지금 턴으로 들어감(now_typed, 턴이 끝나기 전)', typed && stillWorking && afterA.sentAt - t0 < 15000, { ...afterA, afterPressMs: afterA.sentAt - t0 });
    else check('A(고치기 전): 일하는 동안 들어가지 않고 대기열에 남음', afterA.status === 'queued' && stillWorking, afterA);
    const evA = JSON.parse(atrium('--json', 'events', 'lead', '--limit', '80'));
    fs.writeFileSync(path.join(OUT, 'events-A.json'), JSON.stringify(evA, null, 1));
    await waitState(['ready'], 240000);
    await sleep(3000);
    const finalA = call('delivery.list', { session: 'lead', limit: 30 }).find((d) => d.deliveryId === dA.deliveryId);
    check('A: 글은 한 번 확인됨', finalA.status === 'confirmed', finalA);
    const msgs = JSON.parse(atrium('--json', 'messages', 'lead'));
    const n = JSON.stringify(msgs).split('steer check A').length - 1;
    log('대화에 steer check A 수', n);
    if (ROUND !== 'after') return;
    // 장면 B: 권한 질문 중 "지금 넣기" → 까닭(질문·권한 화면)이 대기 글 줄에 보인다
    atrium('send', '@lead', 'Use the Bash tool to run: mkdir zz-p289-dir . Then reply done.');
    await waitState(['waiting'], 90000);
    atrium('send', '@lead', 'steer check B, reply with the word MANGO');
    await until(() => delivs().some((d) => d.status === 'queued'), 20000, 500);
    await page.waitForSelector('[data-role=delivery-group] [data-action=delivery-now]', { timeout: 20000 });
    await page.click('[data-role=delivery-group] [data-action=delivery-now]');
    await sleep(2500);
    await page.click('[data-role=delivery-group] [data-action=delivery-now]').catch(() => {});
    await sleep(1500);
    const toasts = await page.evaluate(() => [...document.querySelectorAll('.mt-toast, [data-role=toast]')].map((e) => e.innerText));
    const rowB = await groupRow(page);
    await snap(page, 'B1-waiting-why');
    await page.screenshot({ path: path.join(OUT, 'B1-window.png') });
    check('B: 대기 글 줄에 까닭(waiting)', rowB && rowB.why === 'waiting', rowB);
    log('알림', toasts);
    atrium('answer', 'lead', 'reject');
    await waitState(['ready'], 240000);
    await sleep(3000);
    const dB = call('delivery.list', { session: 'lead', limit: 30 }).find((d) => /^steer check B/.test(d.text || ''));
    check('B: 답한 뒤 한 번 들어감', dB && dB.status === 'confirmed', dB);
    fs.writeFileSync(path.join(OUT, 'events-B.json'), atrium('--json', 'events', 'lead', '--limit', '80'));
  } finally {
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
    await closeApp(app);
  }
}

async function stop() {
  for (const s of sessions()) { try { atrium('kill', s.sessionId, '--yes'); } catch (e) { log('끄기 실패', s.name, e.message.slice(0, 120)); } }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').trim()); } catch (e) { log('terminal stop', e.message.slice(0, 200)); }
  try { log(atrium('backend', 'stop').trim()); } catch (e) { log('backend stop', e.message.slice(0, 200)); }
}

try {
  if (STAGE === 'setup') await setup(); else if (STAGE === 'run') await run(); else await stop();
} catch (e) { log('오류', e.stack); results.push({ name: 'error', ok: false, detail: e.message }); }
const fail = results.filter((r) => !r.ok).length;
log(`끝: ${results.length - fail}/${results.length} 통과`);
process.exit(fail ? 1 : 0);
