// P9 창 시험 공통: 이 워크트리의 시험 판(herdr 세션 atrium-dev-p9, 포트 47821, backend/.dev/)으로만 띄운다.
// 실제 판 프로필(--dev 없음)로 띄우는 시험도 네 값(세션, 포트, 데이터 폴더, 창 프로필)을 모두 덮는다. 빠지면 p9-guard가 띄우지 않는다.
// 다른 판(atrium, atrium-dev, p5~p8)과 그 세션은 건드리지 않는다. 결과는 experiments/p9/(MT_E2E_OUT=p9)
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { _electron as electron, chromium } from 'playwright';
import { APP_ROOT, REPO, OUT, sleep, until, shot, logger, closeApp } from './harness.mjs';
import { assertTestBoard } from './p9-guard.mjs';
import { regionsOf, overlaps, bbox } from '../../../backend/src/canvas.mjs';

export const DEV = path.join(REPO, 'backend', '.dev');
export const ENV = {
  ATRIUM_HERDR_SESSION: 'atrium-dev-p9',
  ATRIUM_PORT: '47821',
  ATRIUM_DATA_DIR: path.join(DEV, 'data'),
  ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  MT_HERDR_SESSION: 'atrium-dev-p9',
};
export const DIRS = { a: 'C:\\Workspace\\mtask-p9-a', b: 'C:\\Workspace\\mtask-p9-b', c: 'C:\\Workspace\\mtask-p9-c', shortcut: 'C:\\Workspace\\mtask-p9-shortcut' };

if ((process.env.ATRIUM_HERDR_SESSION ?? process.env.MTASK_HERDR_SESSION) && (process.env.ATRIUM_HERDR_SESSION ?? process.env.MTASK_HERDR_SESSION) !== ENV.ATRIUM_HERDR_SESSION) throw new Error('P9 시험은 atrium-dev-p9에서만');
if (process.env.MT_E2E_OUT !== 'p9') throw new Error('MT_E2E_OUT=p9를 명령줄에서 준다(harness가 먼저 읽는다)');
assertTestBoard(ENV, { root: DEV });
fs.mkdirSync(DEV, { recursive: true });
Object.assign(process.env, ENV); // 이 스크립트가 부르는 atrium와 herdr 도구도 같은 판을 쓴다

const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)));
const envFor = (over = {}) => { const e = { ...ENV, ...over }; assertTestBoard(e, { root: DEV }); return { ...cleanEnv(), ...e }; };

async function ready(page, log) {
  page.on('console', (m) => { if (m.type() === 'error') log(`[console.error] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => log(`[pageerror] ${e.message}`));
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
}
// Playwright로 띄운다. profile: 'real'(--dev 없음, npm run real과 같은 인자) | 'dev'
export async function launchProfile({ profile, env = {}, log = console.log }) {
  const app = await electron.launch({ args: profile === 'dev' ? ['.', '--dev'] : ['.'], cwd: APP_ROOT, env: envFor(env), timeout: 60000 });
  const page = await app.firstWindow();
  await ready(page, log);
  const pid = await app.evaluate(() => process.pid);
  log(`창 열림(${profile}) main pid=${pid}`);
  return { app, page, pid };
}
// 바로가기가 부르는 real.cmd로 띄운다. real.cmd는 Electron을 떼어 띄우고 끝나므로 원격 디버깅 포트로 붙는다
export function runRealCmd(args = [], env = {}) {
  const out = execFileSync('cmd.exe', ['/d', '/c', path.join(APP_ROOT, 'scripts', 'real.cmd'), ...args], { encoding: 'utf8', env: envFor(env), cwd: DEV });
  const m = /pid (\d+)/.exec(out);
  return { out: out.trim(), pid: m ? Number(m[1]) : null };
}
export async function attachCdp(port, log = console.log) {
  const browser = await until(async () => { try { return await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { return null; } }, 60000, 500);
  const page = await until(async () => browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('index.html')) || null, 60000, 500);
  await ready(page, log);
  return { browser, page };
}
export const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
// 창(본 프로세스)의 제목. Electron 창 제목은 OS 창 제목이다
export const windowTitle = (pid) => execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).MainWindowTitle`], { encoding: 'utf8' }).trim();

export const atrium = (...args) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...args], { encoding: 'utf8', env: envFor() });
export const herdr = (m, p = {}) => JSON.parse(execFileSync(process.execPath, [path.join(REPO, 'experiments', 'p4', 'tools', 'h.mjs'), m, JSON.stringify(p)], { encoding: 'utf8', env: envFor() }));
export const call = (page, method, params = {}) => page.evaluate(([m, p]) => window.__mt.api.call(m, p), [method, params]);
export const writeJson = (name, v) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(v, null, 2));
export const sessionBy = (page, name) => page.evaluate((n) => [...window.__mt.getState().sessions.values()].find((s) => s.name === n) || null, name);

// 창이 그린 판(세션 노드, 그룹, 메모·칸반)으로 영역을 계산한다(창과 같은 canvas.mjs)
export async function boardShape(page) {
  const st = await page.evaluate(() => {
    const s = window.__mt.getState();
    const nodes = [...s.nodes].filter(([id]) => s.sessions.has(id)).map(([id, r]) => ({ id, name: s.sessions.get(id).name, ws: s.sessions.get(id).workspaceKey || null, x: r.x, y: r.y, w: r.w, h: r.h }));
    const groups = [...s.groups.values()].filter((g) => g.x != null).map((g) => ({ ws: g.workspaceKey || null, x: g.x, y: g.y, w: g.w, h: g.h }));
    const items = [...s.memos.values(), ...s.kanbans.values()].map((m) => ({ ws: m.workspaceKey || null, x: m.x, y: m.y, w: m.w, h: m.h }));
    return { nodes, groups, items, workspaces: s.workspaces.map((w) => ({ key: w.key, name: w.name, x: w.x, y: w.y })) };
  });
  const regs = regionsOf(st.workspaces, [...st.nodes, ...st.groups, ...st.items]);
  const name = (k) => (st.workspaces.find((w) => w.key === k) || {}).name || k;
  const list = [...regs];
  const overlapsList = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (overlaps(list[i][1], list[j][1], -1)) overlapsList.push(`${name(list[i][0])}|${name(list[j][0])}`);
  const shapes = Object.fromEntries(list.map(([k, r]) => { const own = st.nodes.filter((n) => n.ws === k); const b = bbox(own); return [name(k), { region: r, nodes: own.length, columns: new Set(own.map((n) => n.x)).size, bbox: b }]; }));
  return { overlaps: overlapsList, shapes, nodes: st.nodes };
}
// 판 세션의 하위 세션 명령(POST /branch/child)을 그 세션으로서 부른다. 토큰은 판 토큰의 HMAC(branch.mjs token)
export function branchChild(sessionId, body) {
  const info = JSON.parse(fs.readFileSync(path.join(ENV.ATRIUM_DATA_DIR, 'backend.json'), 'utf8'));
  const token = crypto.createHmac('sha256', info.token).update(`branch:${sessionId}`).digest('hex');
  const data = Buffer.from(JSON.stringify(body));
  return new Promise((res, rej) => {
    const req = http.request({ host: '127.0.0.1', port: info.port, path: '/branch/child', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': data.length, 'x-mt-session': sessionId, authorization: `Bearer ${token}` } }, (r) => { const ch = []; r.on('data', (d) => ch.push(d)); r.on('end', () => { try { res({ status: r.statusCode, body: JSON.parse(Buffer.concat(ch).toString('utf8')) }); } catch (e) { rej(e); } }); });
    req.on('error', rej); req.end(data);
  });
}
export { sleep, until, shot, logger, closeApp, OUT, REPO, APP_ROOT };
