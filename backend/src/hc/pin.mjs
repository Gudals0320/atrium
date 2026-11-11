// P114: 판이 쓰는 herdr-core(hc)를 버전과 SHA-256으로 고정해 판 폴더에 받는다.
// - PATH·레지스트리·설치 스크립트(install.ps1)는 쓰지 않는다. install.ps1은 사용자 PATH(HKCU\Environment)에 폴더를 더한다(P114 1단계)
// - 자리: <판 데이터 폴더>\hc\bin\(herdr-core.exe, hc.exe, conpty\conpty.dll, conpty\x64\OpenConsole.exe, VERSION). 경로는 버전과 상관없이 같다:
//   hc update는 도는 실행 파일 자리를 바꾸고 코어만 다시 띄운다(터미널은 산다). 그래서 버전을 올릴 때는 새 빌드를 staging에 받은 뒤
//   `hc update --from <staging>\herdr-core.exe`를 bin의 hc로 부른다(core.mjs upgradeCore). 코어가 꺼져 있으면 파일을 바로 바꾼다
// - 받은 zip은 manifest를 믿지 않고 여기 적은 SHA-256과 맞춘다. 풀기는 Windows의 tar.exe(System32, zip을 연다)
// - ATRIUM_HC로 실행 파일을 주면 받지 않고 그것을 쓴다(개발·시험)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

export const HC_PIN = Object.freeze({
  version: '0.1.20',
  generation: 1,
  target: 'windows-x86_64',
  url: 'https://releases.herdr.dev/core/0.1.20/herdr-core-windows-x86_64.zip',
  sha256: '13b29c61a9932ea028c36ccc419bcf3ec679f2fd6c528f93c8fbd1d7331ee20b',
  // herdr-core.exe의 Authenticode 서명자(P114 1단계: CN=herdr, 유효). 릴리스 검사가 본다
  signer: 'CN=herdr',
});
export const HC_FILES = ['herdr-core.exe', path.join('conpty', 'conpty.dll'), path.join('conpty', 'x64', 'OpenConsole.exe')];

export const hcRoot = (dataDir) => path.join(dataDir, 'hc');
export const hcBinDir = (dataDir) => path.join(hcRoot(dataDir), 'bin');
export const hcExeIn = (dir) => path.join(dir, 'herdr-core.exe');

const run = (file, args, opts = {}) => new Promise((res) => execFile(file, args, { encoding: 'utf8', windowsHide: true, timeout: 30000, ...opts }, (err, so, se) => res({ code: err ? (err.code ?? 1) : 0, out: String(so || '').trim(), err: String(se || '').trim() })));

// `hc --version`의 출력("hc 0.1.20") → '0.1.20'
export const parseHcVersion = (s) => { const m = String(s || '').match(/^hc\s+v?(\d+\.\d+\.\d+[0-9A-Za-z.+-]*)/m); return m ? m[1] : null; };
export async function hcVersionOf(exe) { const r = await run(exe, ['--version'], { timeout: 10000 }); return r.code === 0 ? parseHcVersion(r.out) : null; }

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')));
  });
}

// 폴더에 hc가 다 있는가(실행 파일과 ConPTY 두 파일)
export const hasHcFiles = (dir) => HC_FILES.every((f) => { try { return fs.statSync(path.join(dir, f)).isFile(); } catch { return false; } });

async function download(url, file, fetchImpl = globalThis.fetch) {
  const r = await fetchImpl(url, { redirect: 'follow' });
  if (!r.ok) throw Object.assign(new Error(`download failed: HTTP ${r.status} ${url}`), { code: 'download_failed' });
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}
function extract(zip, dir) {
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'); // Git Bash의 tar는 zip을 못 연다
  return run(tar, ['-xf', zip, '-C', dir], { timeout: 120000 });
}
// bin 옆에 hc.exe 이름을 둔다(터미널 안 에이전트가 치는 `hc`). 하드링크, 안 되면 복사
function linkHcName(dir) {
  const exe = hcExeIn(dir), alias = path.join(dir, 'hc.exe');
  try { fs.rmSync(alias, { force: true }); } catch {}
  try { fs.linkSync(exe, alias); } catch { fs.copyFileSync(exe, alias); }
}

// 고정한 빌드를 staging 폴더에 받아 검증하고 푼다 → { dir, version }. 실패하면 던지고 staging을 지운다
export async function stageHc({ dataDir, pin = HC_PIN, fetchImpl, log = () => {} }) {
  const staging = path.join(hcRoot(dataDir), `staging-${pin.version}-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(staging, { recursive: true });
  try {
    const zip = path.join(staging, 'hc.zip');
    log(`hc ${pin.version}: downloading ${pin.url}`);
    await download(pin.url, zip, fetchImpl);
    const got = await sha256File(zip);
    if (got !== pin.sha256) throw Object.assign(new Error(`hc ${pin.version}: SHA-256 mismatch (got ${got})`), { code: 'checksum_mismatch' });
    const out = path.join(staging, 'x');
    fs.mkdirSync(out);
    const x = await extract(zip, out);
    if (x.code !== 0 || !hasHcFiles(out)) throw Object.assign(new Error(`hc ${pin.version}: archive does not hold a complete hc (${x.err || x.code})`), { code: 'bad_archive' });
    const v = await hcVersionOf(hcExeIn(out));
    if (v !== pin.version) throw Object.assign(new Error(`hc ${pin.version}: unpacked build reports ${v}`), { code: 'bad_version' });
    fs.rmSync(zip, { force: true });
    return { dir: out, staging, version: v };
  } catch (e) { fs.rmSync(staging, { recursive: true, force: true }); throw e; }
}

// 판의 hc를 준비한다 → { exe, dir, version, source: 'env'|'installed'|'fetched'|'pending', pending? }
// - 이미 bin에 고정 버전이 있으면 그대로(받지 않는다)
// - 없으면 받아서 bin에 둔다
// - bin에 다른 버전이 있고 코어가 그 파일로 돌면(coreRunning) 바꾸지 않고 pending(staging 폴더)을 돌려준다. 바꾸기는 upgradeCore가 한다
export async function ensureHc({ dataDir, pin = HC_PIN, envExe = null, coreRunning = false, fetchImpl, log = () => {} }) {
  if (envExe) {
    const v = await hcVersionOf(envExe);
    if (!v) throw Object.assign(new Error(`ATRIUM_HC is not a working hc: ${envExe}`), { code: 'not_found' });
    return { exe: envExe, dir: path.dirname(envExe), version: v, source: 'env' };
  }
  const bin = hcBinDir(dataDir);
  let current = null;
  if (hasHcFiles(bin)) current = (fs.existsSync(path.join(bin, 'VERSION')) ? fs.readFileSync(path.join(bin, 'VERSION'), 'utf8').trim() : null) || (await hcVersionOf(hcExeIn(bin)));
  if (current === pin.version) { if (!fs.existsSync(path.join(bin, 'hc.exe'))) linkHcName(bin); return { exe: hcExeIn(bin), dir: bin, version: current, source: 'installed' }; }
  const st = await stageHc({ dataDir, pin, fetchImpl, log });
  if (current && coreRunning) { log(`hc ${current} is running from ${bin}; ${pin.version} staged at ${st.dir}`); return { exe: hcExeIn(bin), dir: bin, version: current, source: 'pending', pending: st }; }
  // 코어가 쓰지 않는 bin: 옛 것을 비키고 새 것을 놓는다
  if (fs.existsSync(bin)) { const old = path.join(hcRoot(dataDir), `old-${Date.now()}`); fs.renameSync(bin, old); fs.rmSync(old, { recursive: true, force: true }); }
  fs.renameSync(st.dir, bin);
  fs.rmSync(st.staging, { recursive: true, force: true });
  fs.writeFileSync(path.join(bin, 'VERSION'), pin.version + '\n');
  linkHcName(bin);
  log(`hc ${pin.version} installed at ${bin}`);
  return { exe: hcExeIn(bin), dir: bin, version: pin.version, source: 'fetched' };
}
