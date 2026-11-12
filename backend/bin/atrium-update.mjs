// P69: atrium install, atrium update [--check] [--yes]. P71: --rollback(손으로 앞 버전 되돌리기)은 뺐다
// - install: 최신 릴리즈를 설치 폴더(ATRIUM_INSTALL_DIR, 기본 %LOCALAPPDATA%\atrium\versions)에 깔고 실행기(Atrium.cmd)와 바탕화면 바로가기를 만든다.
//   바로가기는 실행기를 부르고 실행기는 current.json의 버전을 띄우므로, 업데이트 뒤에도 바로가기를 다시 만들 필요가 없다. 도는 백엔드와 터미널 서버는 건드리지 않는다.
// - update: 백엔드가 돌면 판 API(update.*)로 창의 "업데이트" 단추와 같은 일을 한다(백엔드만 바꾸고 터미널의 세션은 그대로). 돌지 않으면 받아서 current.json만 바꾼다.
// - P70 --channel stable|dev: 그 한 번만 채널을 바꾼다. 없으면 백엔드가 돌 때는 판 설정 updateChannel을, 돌지 않을 때와 install은 stable을 따른다.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { connect, backendInfo, health } from '../src/client.mjs';
import * as U from '../src/update.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STEP = { download: '받는 중', extract: '푸는 중', install: '의존성 설치 중', build: '빌드 중', verify: '확인 중' };

function fileLog(cfg) {
  const f = path.join(cfg.logDir, 'update.log');
  return (l) => { try { fs.mkdirSync(cfg.logDir, { recursive: true }); fs.appendFileSync(f, `${new Date().toISOString()} [cli] ${l}\n`); } catch {} };
}
async function latestRelease(apiUrl, channel = 'stable') {
  const rel = await U.fetchLatest(U.httpGetJson, apiUrl, channel);
  if (!rel) throw new Error(channel === 'dev' ? '릴리즈가 없습니다' : '정식 릴리즈가 없습니다');
  return rel;
}
// --channel 값. 없으면 null, 맞지 않으면 던진다
export function channelFlag(flags) {
  const v = flags.channel;
  if (v === undefined || v === false) return null;
  if (!U.CHANNELS.includes(String(v))) throw new Error(`--channel에는 ${U.CHANNELS.join(' 또는 ')}를 지정하세요`);
  return String(v);
}
// 받고 준비해서 current.json을 바꾼다(백엔드가 없을 때와 install)
async function installRelease(cfg, dir, apiUrl, rel) {
  const log = fileLog(cfg);
  const cur = U.readCurrent(dir);
  if (cur && cur.current === rel.tag && fs.existsSync(path.join(dir, rel.tag))) { console.log(`이미 ${rel.tag}가 설치되어 있습니다`); return { already: true }; }
  let last = '';
  const r = await U.prepareRelease({ dir, release: rel, apiUrl, log, step: (s, d) => { const line = `${STEP[s] || s}${d && d.part ? ` (${d.part})` : ''}`; if (line !== last) { console.log(`  ${line}`); last = line; } } });
  U.switchCurrent(dir, rel.tag);
  const pruned = U.pruneVersions(dir).removed;
  return { root: r.root, pruned };
}

export async function updateCommand(cfg, cmd, flags, { out, json }) {
  const dir = U.installDirOf();
  const apiUrl = U.updateApiOf();
  const allowed = U.installAllowed(cfg, dir);
  const here = U.runningVersion(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), dir);
  const channel = channelFlag(flags);
  if (flags.rollback) throw new Error('--rollback은 없어졌습니다(P71). 새 백엔드가 뜨지 못하면 업데이트가 저절로 지금 버전으로 되돌아갑니다.');

  if (cmd === 'install') {
    if (!allowed.ok) throw new Error(allowed.message);
    console.log(`설치 폴더: ${dir}`);
    const rel = await latestRelease(apiUrl, channel || 'stable');
    console.log(`최신 릴리즈(${channel || 'stable'} 채널): ${rel.tag}`);
    const r = await installRelease(cfg, dir, apiUrl, rel);
    const { launcher, icon } = U.writeLauncher(dir, path.join(dir, rel.tag));
    let shortcut = null;
    if (!flags['no-shortcut']) {
      const ps = path.join(dir, rel.tag, 'app', 'scripts', 'make-shortcut.ps1');
      const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps, '-Target', launcher, ...(icon ? ['-Icon', icon] : []), ...(typeof flags.shortcut === 'string' ? ['-Dest', path.resolve(flags.shortcut)] : [])];
      const p = spawnSync('powershell.exe', args, { encoding: 'utf8', windowsHide: true });
      if (p.status !== 0) console.error(`바로가기를 만들지 못했습니다: ${(p.stderr || p.stdout || '').trim().split(/\r?\n/).pop()}`);
      else shortcut = String(p.stdout).trim().split(/\r?\n/).pop();
    }
    if (json) return out({ installDir: dir, tag: rel.tag, ...r, launcher, shortcut });
    console.log(`설치함: ${rel.tag}${r.already ? '(이미 있음)' : ''}\n실행기: ${launcher}${shortcut ? `\n바로가기: ${shortcut}` : ''}`);
    if (r.pruned && r.pruned.length) console.log(`지운 옛 버전: ${r.pruned.join(', ')}`);
    if (channel === 'dev') console.log('앱도 dev 빌드를 알리게 하려면 설정 › 일반 › 업데이트에서 dev 채널을 고르거나 atrium settings set updateChannel dev를 실행합니다.');
    console.log('도는 백엔드와 터미널 서버(herdr-core)는 그대로입니다. 바로가기로 열면 설치한 버전의 창이 뜹니다. 백엔드도 설치한 버전으로 바꾸려면 트레이 메뉴의 "백엔드 다시 시작"을 누릅니다(세션은 그대로).');
    return;
  }

  // update
  const info = backendInfo(cfg);
  const up = !!(info && (await health(info.port)));
  if (flags.check) {
    if (up) {
      const c = await connect(cfg);
      try { const v = await c.call('update.check', channel ? { channel } : {}); return print(v, out, json); } finally { c.close(); }
    }
    const v = { current: { version: here.version, tag: here.tag, installed: here.installed }, channel: channel || 'stable', latest: null, available: false, error: null, installDir: dir };
    try { v.latest = await latestRelease(apiUrl, v.channel); v.available = U.compareVersions(v.latest.version, here.version) > 0; } catch (e) { v.error = e.message; }
    return print(v, out, json);
  }
  if (!up) {
    if (!allowed.ok) throw new Error(allowed.message);
    const rel = await latestRelease(apiUrl, channel || 'stable');
    const cur = U.readCurrent(dir);
    if (cur && cur.current && U.compareVersions(rel.version, cur.current) <= 0) return console.log(`새 버전이 없습니다(설치 ${cur.current}, 최신 ${rel.tag})`);
    console.log(`백엔드가 돌지 않습니다. ${rel.tag}를 받아 설치 폴더의 지금 버전으로 바꿉니다`);
    const r = await installRelease(cfg, dir, apiUrl, rel);
    return out({ installed: rel.tag, ...r });
  }
  // 백엔드가 돈다: 판 API로
  const c = await connect(cfg);
  const startedAt = Date.now();
  let job = null, closed = false;
  c.on((ev, d) => {
    if (ev !== 'update.state' || !d.job) return;
    const j = d.job;
    const line = j.phase === 'failed' ? `실패: ${j.error}` : j.phase === 'restarting' ? `바꾸는 중: 백엔드를 다시 띄웁니다(세션은 그대로)` : `${STEP[j.step] || j.step}${j.part ? ` (${j.part})` : ''}`;
    if (!job || line !== job.line) console.log(`  ${line}`);
    job = { ...j, line };
  });
  c.ws.on('close', () => { closed = true; });
  await c.call('events.subscribe');
  const r = await c.call('update.apply', { confirm: !!flags.yes, ...(channel ? { channel } : {}) });
  if (r.needsConfirm) { console.log(`확인 필요: ${r.message}\n계속하려면 --yes`); process.exitCode = 2; c.close(); return; }
  console.log(`업데이트 시작: ${r.to}`);
  while (!closed && !(job && job.phase === 'failed')) await sleep(300);
  if (!closed) { c.close(); process.exitCode = 1; return; }
  // 새 백엔드와 바꾸기 결과를 기다린다
  const end = Date.now() + 5 * 60 * 1000;
  while (Date.now() < end) {
    const res = U.readResult(dir);
    if (res && res.at >= startedAt) {
      if (json) return out(res);
      console.log(res.ok ? `끝: ${res.to && res.to.tag}로 바꿨습니다(${(res.ms / 1000).toFixed(1)}초)` : `실패해 ${res.from && (res.from.tag || res.from.version)}로 되돌렸습니다: ${res.error}${res.rollbackError ? `\n옛 백엔드도 뜨지 못했습니다: ${res.rollbackError}` : ''}`);
      if (!res.ok) process.exitCode = 1;
      return;
    }
    await sleep(500);
  }
  console.log('바꾸기 결과를 기다리다 시간이 지났습니다. atrium update --check로 확인합니다');
  process.exitCode = 1;
}

function print(v, out, json) {
  if (json) return out(v);
  console.log(`지금 버전: ${v.current.version}${v.current.installed ? ` (설치 ${v.current.tag})` : ' (설치 폴더 밖)'}`);
  if (v.channel) console.log(`채널: ${v.channel}${v.once ? ' (이번 한 번)' : ''}`);
  if (v.latest) console.log(`최신 릴리즈: ${v.latest.tag}${v.available ? ' — 새 버전이 있습니다(atrium update --yes)' : ' — 최신입니다'}${v.latest.url ? `\n  ${v.latest.url}` : ''}`);
  if (v.error) console.log(`확인 오류: ${v.error === 'no_release' ? (v.channel === 'dev' ? '릴리즈가 없습니다' : '정식 릴리즈가 없습니다') : v.error}`);
  if (v.checkedAt) console.log(`마지막 확인: ${new Date(v.checkedAt).toLocaleString()}`);
}
