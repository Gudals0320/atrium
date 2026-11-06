// P69 바꾸기: 업데이트의 마지막 단계(P71: 손으로 하는 되돌리기는 뺐다). 옛 백엔드가 떼어 띄우고 스스로 끝난다(updater.mjs). herdr 서버는 끄지 않는다.
// 사용: node update-swap.mjs <작업 파일(swap-job.json)>
// 1. 옛 백엔드와 옛 창(Electron main)이 끝나기를 기다린다.
// 2. current.json을 새 버전으로 바꾸고 새 버전의 백엔드를 띄운다. 새 백엔드는 다시 켤 때처럼 herdr 세션에 다시 붙는다(ARCH 4절 C3). 판 플러그인도 새 백엔드가 다시 만든다.
// 3. 정해진 시간 안에 건강 확인(/health, herdr 연결)을 통과하지 못하면 current.json을 옛 것으로 돌리고 옛 백엔드를 다시 띄운다.
// 4. 결과를 설치 폴더의 last-update.json에 남기고(새 백엔드가 읽어 창에 알린다), 창이 있었으면 그 버전의 창을 다시 띄운다.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { writeCurrent, writeResult, pruneVersions, writeLauncher, cleanEnv, CURRENT_FILE } from './update.mjs';

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const t0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function log(...a) { try { fs.appendFileSync(job.logFile, `${new Date().toISOString()} [swap] ${a.join(' ')}\n`); } catch {} }
const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
async function waitGone(pids, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (!pids.some(alive)) return true; await sleep(200); }
  return !pids.some(alive);
}
async function load(root) {
  const mod = (f) => import(pathToFileURL(path.join(root, 'backend', 'src', f)).href);
  const [client, config] = await Promise.all([mod('client.mjs'), mod('config.mjs')]);
  return { client, cfg: config.loadConfig({ argv: job.profileArgv || [], env: process.env }) };
}
// root의 백엔드를 띄우고 ms 안에 건강 확인(/health, herdr 연결)을 통과하는지 본다
async function startAt(root, ms) {
  const { client, cfg } = await load(root);
  const end = Date.now() + ms;
  let timer;
  const late = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${Math.round(ms / 1000)}초 안에 뜨지 않음`)), ms); });
  try {
    const r = await Promise.race([client.startBackend(cfg, { nodePath: job.nodePath }), late]);
    const info = client.backendInfo(cfg);
    if (!info || !(await client.health(info.port))) throw new Error('/health에 답하지 않음');
    const c = new client.ApiClient(info); await c.open();
    try {
      for (;;) {
        const st = await c.call('backend.status');
        if (st.herdr && st.herdr.connected) return { pid: st.pid, port: st.port, already: !!r.already };
        if (Date.now() > end) throw new Error('herdr에 다시 붙지 못함');
        await sleep(300);
      }
    } finally { c.close(); }
  } finally { clearTimeout(timer); }
}
// 뜨다 만 새 백엔드를 끈다(옛 백엔드가 아닌 것만)
async function stopAt(root) {
  try {
    const { client, cfg } = await load(root);
    const info = client.backendInfo(cfg);
    if (!info || info.pid === job.oldBackendPid || !alive(info.pid)) return;
    log(`stopping failed backend pid=${info.pid}`);
    await client.stopBackend(cfg).catch(() => {});
    if (alive(info.pid)) { try { process.kill(info.pid); } catch {} }
    await waitGone([info.pid], 10000);
  } catch (e) { log('stop failed backend error', e.message); }
}
function setCurrent(v) {
  if (v) writeCurrent(job.installDir, v);
  else { try { fs.rmSync(path.join(job.installDir, CURRENT_FILE), { force: true }); } catch {} }
}
function relaunch(root) {
  const real = path.join(root, 'app', 'scripts', 'real.mjs');
  if (!fs.existsSync(real)) return log(`relaunch skipped: no ${real}`);
  const p = spawn(job.nodePath || process.execPath, [real, ...(job.relaunchArgs || [])], { cwd: path.join(root, 'app'), env: cleanEnv(process.env), detached: true, stdio: 'ignore', windowsHide: true });
  p.on('error', (e) => log('relaunch error', e.message));
  p.unref();
  log(`relaunched window from ${path.basename(root)} pid=${p.pid}`);
}

async function main() {
  log(`start kind=${job.kind} from=${job.from && job.from.tag} to=${job.to && job.to.tag} wait=${JSON.stringify(job.waitPids)}`);
  const result = { kind: job.kind, at: null, ok: false, from: job.from, to: job.to, rolledBack: false, error: null, ms: 0 };
  if (!(await waitGone(job.waitPids || [], job.waitMs || 30000))) {
    // 옛 백엔드가 끝나지 않았다. 아무것도 바꾸지 않는다
    result.error = '옛 백엔드가 끝나지 않아 바꾸지 않았습니다';
    log(result.error);
    return finish(result, job.fromRoot);
  }
  setCurrent(job.currentAfter);
  try {
    const r = await startAt(job.toRoot, job.healthMs || 60000);
    result.ok = true; result.backendPid = r.pid;
    log(`new backend up pid=${r.pid} in ${Date.now() - t0}ms`);
  } catch (e) {
    result.error = String(e.message || e).slice(0, 500);
    log(`new backend failed: ${result.error}`);
    await stopAt(job.toRoot);
    setCurrent(job.currentBefore);
    result.rolledBack = true;
    try { const r = await startAt(job.fromRoot, Math.max(job.healthMs || 0, 60000)); result.backendPid = r.pid; log(`old backend back pid=${r.pid}`); }
    catch (err) { result.rollbackError = String(err.message || err).slice(0, 500); log(`old backend failed too: ${result.rollbackError}`); }
  }
  return finish(result, result.ok ? job.toRoot : job.fromRoot);
}
function finish(result, activeRoot) {
  result.at = Date.now(); result.ms = result.at - t0;
  try {
    if (result.ok) {
      if (job.toInstalled) writeLauncher(job.installDir, job.toRoot); // 바로가기의 실행기를 새 버전 것으로
      result.pruned = pruneVersions(job.installDir).removed;
    } else if (job.kind === 'update' && job.to && job.to.tag && result.rolledBack) {
      // 뜨지 못한 새 버전은 지운다(current.json이 가리키지 않을 때만)
      result.pruned = pruneVersions(job.installDir).removed;
    }
  } catch (e) { log('cleanup error', e.message); }
  writeResult(job.installDir, result);
  log(`result ${JSON.stringify(result)}`);
  if (job.relaunch) relaunch(activeRoot);
  try { fs.rmSync(process.argv[2], { force: true }); } catch {}
}

main().catch((e) => { log('swap crashed', e.stack); try { writeResult(job.installDir, { kind: job.kind, at: Date.now(), ok: false, from: job.from, to: job.to, error: `바꾸기 오류: ${e.message}` }); } catch {} process.exit(1); }).then(() => process.exit(0));
