// P69 단위 시험(백엔드): 앱 안 업데이트. 버전 비교, 릴리즈 API 응답 읽기(정식만), 받기 주소 검사, 압축 풀기, current.json 바꾸기와 되돌리기,
// 오래된 버전 지우기, 실패한 준비의 정리, 미리 보기, 업데이터(확인·업데이트·바꾸기 시작), 바꾸기 프로세스(성공과 되돌리기)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as U from '../src/update.mjs';
import { Updater, relaunchArgsOf } from '../src/updater.mjs';
import { SETTINGS } from '../src/settings.mjs';
import { checkRelease } from '../../scripts/release-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SWAP = path.join(HERE, '..', 'src', 'update-swap.mjs');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `mtask-p69-${p}-`));
const rm = (d) => fs.rmSync(d, { recursive: true, force: true });
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const pkg = (v) => JSON.stringify({ name: 'x', version: v });

// tar 만들기(ustar, pax 머리)
function entry(name, body = Buffer.alloc(0), type = '0') {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100, 'utf8');
  h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124);
  h.write('00000000000\0', 136); h.write('        ', 148); h.write(type, 156); h.write('ustar\0', 257); h.write('00', 263);
  let sum = 0; for (const x of h) sum += x;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return Buffer.concat([h, body, Buffer.alloc((512 - (body.length % 512)) % 512)]);
}
function paxEntry(recs, type) {
  const lines = Object.entries(recs).map(([k, v]) => { const rest = ` ${k}=${v}\n`; let n = Buffer.byteLength(rest) + 1; for (;;) { const s = `${n}${rest}`; if (Buffer.byteLength(s) === n) return s; n = Buffer.byteLength(s); } });
  return entry('PaxHeader', Buffer.from(lines.join('')), type);
}
function tarOf(files, { top = 'Owner-atrium-abc1234', gz = true } = {}) {
  const parts = [paxEntry({ comment: 'abc1234def' }, 'g'), entry(`${top}/`, undefined, '5')];
  for (const [name, body] of Object.entries(files)) {
    const full = `${top}/${name}`;
    if (Buffer.byteLength(full) > 100) parts.push(paxEntry({ path: full }, 'x'));
    parts.push(entry(full.slice(0, 100), Buffer.from(body)));
  }
  parts.push(Buffer.alloc(1024));
  const tar = Buffer.concat(parts);
  return gz ? zlib.gzipSync(tar) : tar;
}

test('버전 비교: v 접두어, 숫자 크기, 사전 버전은 정식보다 낮다', () => {
  assert.ok(U.compareVersions('0.1.10', '0.1.9') > 0);
  assert.equal(U.compareVersions('v0.2.0', '0.2.0'), 0);
  assert.ok(U.compareVersions('1.0.0', '0.9.99') > 0);
  assert.ok(U.compareVersions('0.2.0-rc.1', '0.2.0') < 0);
  assert.ok(U.compareVersions('0.2.0-rc.2', '0.2.0-rc.10') < 0);
  assert.ok(U.compareVersions('0.2.0-alpha', '0.2.0-beta') < 0);
  assert.ok(U.compareVersions('garbage', '0.0.1') < 0);
  assert.equal(U.versionOfTag('v1.2.3'), '1.2.3');
  assert.ok(U.nodeSatisfies('22.13.0', '>=22.13')); assert.ok(U.nodeSatisfies('24.1.0', '>=22.13'));
  assert.ok(!U.nodeSatisfies('22.12.9', '>=22.13')); assert.ok(!U.nodeSatisfies('20.18.0', '>=22.13'));
});

test('릴리즈 API 응답 읽기: 정식 릴리즈만, 태그는 버전 꼴만', () => {
  const j = { tag_name: 'v0.2.0', name: 'Atrium 0.2.0', html_url: 'https://github.com/Gudals0320/atrium/releases/tag/v0.2.0', body: 'Notes\r\nline', draft: false, prerelease: false, published_at: '2026-11-01T00:00:00Z', tarball_url: 'https://api.github.com/repos/Gudals0320/atrium/tarball/v0.2.0' };
  const r = U.parseRelease(j);
  assert.equal(r.tag, 'v0.2.0'); assert.equal(r.version, '0.2.0'); assert.equal(r.notes, 'Notes\nline'); assert.equal(r.tarball, j.tarball_url);
  assert.equal(r.publishedAt, Date.parse('2026-11-01T00:00:00Z'));
  assert.equal(U.parseRelease({ ...j, draft: true }), null);
  assert.equal(U.parseRelease({ ...j, prerelease: true }), null);
  assert.equal(U.parseRelease({ ...j, tag_name: 'nightly' }), null);
  assert.equal(U.parseRelease({ ...j, html_url: 'javascript:alert(1)' }).url, null);
  assert.equal(U.parseRelease(null), null);
  assert.ok(U.parseRelease({ ...j, body: 'x'.repeat(5000) }).notes.length <= 4001);
});

test('받기 주소 검사: 이 저장소의 GitHub https 주소만, 가짜 서버는 API를 127.0.0.1로 바꾼 시험에서만', () => {
  const ok = (u, api) => U.checkDownloadUrl(u, api).ok;
  assert.ok(ok('https://api.github.com/repos/Gudals0320/atrium/tarball/v0.2.0'));
  assert.ok(ok('https://codeload.github.com/Gudals0320/atrium/legacy.tar.gz/refs/tags/v0.2.0'));
  assert.ok(ok('https://github.com/gudals0320/Atrium/archive/refs/tags/v0.2.0.tar.gz'));
  assert.equal(U.checkDownloadUrl('http://api.github.com/repos/Gudals0320/atrium/tarball/v1').reason, 'not_https');
  assert.equal(U.checkDownloadUrl('https://evil.example/Gudals0320/atrium/x.tgz').reason, 'host');
  assert.equal(U.checkDownloadUrl('https://api.github.com/repos/someone/atrium/tarball/v1').reason, 'repo');
  assert.equal(U.checkDownloadUrl('https://github.com/Gudals0320/atrium-evil/x.tgz').reason, 'repo');
  assert.equal(U.checkDownloadUrl('https://u:p@github.com/Gudals0320/atrium/x').reason, 'credentials');
  assert.equal(U.checkDownloadUrl('not a url').reason, 'bad_url');
  // 가짜 서버
  const api = 'http://127.0.0.1:47897/repos/Gudals0320/atrium/releases/latest';
  assert.ok(ok('http://127.0.0.1:47897/tarball/v0.2.0', api));
  assert.ok(!ok('http://127.0.0.1:47898/tarball/v0.2.0', api));
  assert.ok(!ok('http://127.0.0.1:47897/tarball/v0.2.0')); // 기본 API면 받지 않는다
  assert.ok(!ok('http://example.com/tarball', 'http://example.com/releases/latest'));
  assert.ok(U.checkApiUrl(api).ok); assert.ok(U.checkApiUrl(U.DEFAULT_UPDATE_API).ok); assert.ok(!U.checkApiUrl('http://example.com/x').ok);
});

test('압축 풀기: 맨 위 폴더를 떼고, pax 긴 경로를 읽고, 바깥 경로는 거부한다', () => {
  const d = tmp('untar');
  try {
    const long = `app/${'deep/'.repeat(25)}file.txt`;
    const r = U.untar(tarOf({ 'app/package.json': pkg('0.2.0'), 'backend/src/a.mjs': 'export const a = 1;\n', [long]: 'L' }), d);
    assert.equal(r.files, 3);
    assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'app', 'package.json'), 'utf8')).version, '0.2.0');
    assert.equal(fs.readFileSync(path.join(d, ...long.split('/')), 'utf8'), 'L');
    assert.ok(!fs.existsSync(path.join(d, 'Owner-atrium-abc1234')));
    for (const bad of ['../evil.txt', 'x/../../evil.txt', 'C:/evil.txt']) {
      const t = Buffer.concat([entry(`top/${bad}`, Buffer.from('x')), Buffer.alloc(1024)]);
      assert.throws(() => U.untar(t, path.join(d, 'z')), (e) => e.code === 'bad_archive', bad);
    }
    assert.ok(!fs.existsSync(path.join(d, '..', 'evil.txt')));
  } finally { rm(d); }
});

test('current.json 바꾸기(P71: 손으로 하는 되돌리기와 previous는 뺐다)', () => {
  const d = tmp('current');
  try {
    assert.equal(U.readCurrent(d), null);
    U.switchCurrent(d, 'v0.1.0', 1);
    assert.deepEqual(U.readCurrent(d), { current: 'v0.1.0', switchedAt: 1 });
    const s = U.switchCurrent(d, 'v0.2.0', 2);
    assert.equal(s.before.current, 'v0.1.0');
    assert.deepEqual(U.readCurrent(d), { current: 'v0.2.0', switchedAt: 2 });
    assert.deepEqual(fs.readdirSync(d).filter((f) => f.endsWith('.tmp')), []);
  } finally { rm(d); }
});

test('오래된 버전 지우기: 지금 버전만 남기고(P71: 앞 버전도 지운다), 남은 준비 폴더도 지운다. 버전이 아닌 폴더는 둔다', () => {
  const d = tmp('prune');
  try {
    for (const n of ['v0.1.0', 'v0.2.0', 'v0.3.0', 'v0.4.0.staging', 'v0.5.0.staging', 'notes', 'v0.0.1']) fs.mkdirSync(path.join(d, n));
    U.writeCurrent(d, { current: 'v0.3.0', previous: 'v0.2.0' });
    const r = U.pruneVersions(d, { keepStaging: ['v0.5.0'] });
    assert.deepEqual(r.removed.sort(), ['v0.0.1', 'v0.1.0', 'v0.2.0', 'v0.4.0.staging']);
    assert.deepEqual(fs.readdirSync(d).sort(), ['current.json', 'notes', 'v0.3.0', 'v0.5.0.staging']);
    assert.deepEqual(U.listVersions(d), ['v0.3.0']);
  } finally { rm(d); }
});

test('설치 폴더: ATRIUM_INSTALL_DIR가 덮고, 개발용 판은 실제 설치 폴더를 바꾸지 않는다', () => {
  assert.equal(U.installDirOf({ ATRIUM_INSTALL_DIR: 'C:\\x\\versions' }), path.resolve('C:\\x\\versions'));
  assert.ok(U.isDefaultInstallDir(U.installDirOf({})));
  assert.equal(U.installAllowed({ profile: 'dev' }, U.defaultInstallDir()).ok, false);
  assert.equal(U.installAllowed({ profile: 'dev' }, path.resolve('C:\\x\\versions')).ok, true);
  assert.equal(U.installAllowed({ profile: 'real' }, U.defaultInstallDir()).ok, true);
  assert.equal(U.updateApiOf({}), U.DEFAULT_UPDATE_API);
  assert.equal(U.updateApiOf({ ATRIUM_UPDATE_API: 'http://127.0.0.1:47897/x' }), 'http://127.0.0.1:47897/x');
  const r = U.runningVersion(path.join('C:\\x\\versions', 'v0.2.0'), path.resolve('C:\\x\\versions'));
  assert.equal(r.installed, true); assert.equal(r.tag, 'v0.2.0');
  assert.equal(U.runningVersion(path.resolve(HERE, '..', '..'), path.resolve('C:\\x\\versions')).installed, false);
  assert.equal(SETTINGS.updateCheck.default, true);
  assert.deepEqual(relaunchArgsOf(['.', '--dev', '--remote-debugging-port=9333', '--inspect=1', 'x'], 'dev'), ['--dev', '--remote-debugging-port=9333']);
  assert.deepEqual(relaunchArgsOf(['.', '--remote-debugging-port=9333'], 'real'), []);
});

// 준비에 쓸 가짜 npm: 받은 폴더에 빌드 결과와 Electron 실행 파일을 만든다
const fakeNpm = (fail) => async (args, cwd) => {
  if (fail && fail(args, cwd)) throw new Error(`npm ${args.join(' ')} failed`);
  if (args[0] === 'ci' && path.basename(cwd) === 'backend') write(path.join(cwd, 'node_modules', 'ws', 'index.js'), '');
  if (args[0] === 'ci' && path.basename(cwd) === 'app') write(path.join(cwd, 'node_modules', 'electron', 'dist', 'electron.exe'), '');
  if (args[0] === 'run') write(path.join(cwd, 'dist', 'index.html'), '<html></html>');
};
const release = (v) => ({ tag: `v${v}`, version: v, tarball: 'https://api.github.com/repos/Gudals0320/atrium/tarball/v' + v });
const tree = (v, extra = {}) => tarOf({ 'app/package.json': pkg(v), 'backend/package.json': pkg(v), 'app/scripts/launch.mjs': '// launcher\n', ...extra });

test('준비: 받아서 풀고, npm ci·빌드·미리 보기 뒤 <태그>로 옮긴다. 진행을 알린다', async () => {
  const d = tmp('prepare');
  try {
    const steps = [];
    const r = await U.prepareRelease({ dir: d, release: release('0.2.0'), step: (s) => steps.push(s), fetchBuf: async () => tree('0.2.0'), npm: fakeNpm(), verify: async () => ({ ok: true, problems: [] }) });
    assert.equal(r.root, path.join(d, 'v0.2.0'));
    assert.ok(fs.existsSync(path.join(d, 'v0.2.0', 'app', 'dist', 'index.html')));
    assert.ok(!fs.existsSync(path.join(d, 'v0.2.0.staging')));
    assert.deepEqual([...new Set(steps)], ['download', 'extract', 'install', 'build', 'verify']);
    U.writeCurrent(d, { current: 'v0.2.0', previous: null });
    await assert.rejects(U.prepareRelease({ dir: d, release: release('0.2.0'), fetchBuf: async () => tree('0.2.0'), npm: fakeNpm() }), (e) => e.code === 'already_current');
  } finally { rm(d); }
});

test('실패한 준비의 정리: 버전이 다른 압축, npm 실패, 미리 보기 실패, 받기 실패면 준비 폴더를 지우고 이유를 던진다', async () => {
  const d = tmp('prepfail');
  try {
    const run = (o) => U.prepareRelease({ dir: d, release: release('0.3.0'), fetchBuf: async () => tree('0.3.0'), npm: fakeNpm(), verify: async () => ({ ok: true, problems: [] }), ...o });
    await assert.rejects(run({ fetchBuf: async () => tree('0.2.9') }), (e) => e.code === 'version_mismatch');
    await assert.rejects(run({ npm: fakeNpm((a) => a[0] === 'run') }), /npm run build failed/);
    await assert.rejects(run({ verify: async () => ({ ok: false, problems: ['herdr 프로토콜 22을 받지 않음(23)'] }) }), (e) => e.code === 'verify_failed' && /프로토콜/.test(e.message));
    await assert.rejects(run({ fetchBuf: async () => { throw new Error('offline'); } }), /offline/);
    await assert.rejects(run({ fetchBuf: async () => tarOf({ 'README.md': 'x' }) }), /backend·app이 없습니다|버전/);
    assert.deepEqual(fs.readdirSync(d), []);
  } finally { rm(d); }
});

test('받기: 넘겨 주기 주소도 검사한다(이 저장소 밖으로 넘기면 받지 않는다)', async () => {
  const http = await import('node:http');
  const srv = http.createServer((req, res) => {
    if (req.url === '/repos/Gudals0320/atrium/releases/latest') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ tag_name: 'v9.9.9', tarball_url: `http://127.0.0.1:${srv.address().port}/tb` })); }
    if (req.url === '/tb') { res.writeHead(302, { location: '/tb2' }); return res.end(); }
    if (req.url === '/tb2') return res.end('DATA');
    if (req.url === '/away') { res.writeHead(302, { location: 'https://evil.example/x' }); return res.end(); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const api = `http://127.0.0.1:${srv.address().port}/repos/Gudals0320/atrium/releases/latest`;
    const j = await U.httpGetJson(api);
    assert.equal(U.parseRelease(j).tag, 'v9.9.9');
    assert.equal(String(await U.download(j.tarball_url, { apiUrl: api })), 'DATA');
    await assert.rejects(U.download(`http://127.0.0.1:${srv.address().port}/away`, { apiUrl: api }), (e) => e.code === 'bad_download_url');
    await assert.rejects(U.httpGetJson(`http://127.0.0.1:${srv.address().port}/nope`), (e) => e.code === 'no_release');
  } finally { srv.close(); }
});

test('미리 보기: 빌드 결과·Electron·모듈이 없거나 herdr 프로토콜이 맞지 않으면 문제로 알린다', async () => {
  const d = tmp('verify');
  try {
    write(path.join(d, 'backend', 'src', 'update-verify.mjs'), "console.log('noise'); console.log(JSON.stringify({ version: '0.2.0', protocols: [23], problems: [] }));\n");
    let v = await U.verifyRoot(d, { protocol: 22 });
    assert.equal(v.ok, false);
    assert.ok(v.problems.some((p) => /app\/dist/.test(p)) && v.problems.some((p) => /Electron/.test(p)) && v.problems.some((p) => /프로토콜 22/.test(p)));
    write(path.join(d, 'app', 'dist', 'index.html'), ''); write(U.electronExe(d), ''); write(path.join(d, 'backend', 'node_modules', 'ws', 'index.js'), '');
    v = await U.verifyRoot(d, { protocol: 23 });
    assert.equal(v.ok, true, v.problems.join(';'));
    write(path.join(d, 'backend', 'src', 'update-verify.mjs'), 'process.exit(3);\n');
    v = await U.verifyRoot(d, {});
    assert.ok(v.problems.some((p) => /미리 보기 실패/.test(p)));
  } finally { rm(d); }
});

// 업데이터(백엔드 쪽): 가짜 판
function fakeBoard(d, profile = 'real') {
  const meta = new Map(), events = [];
  const b = {
    cfg: { profile, logDir: path.join(d, 'logs') }, herdrCompat: { ok: true, protocol: 22 }, features: null, stopped: null,
    store: { getMeta: (k) => (meta.has(k) ? JSON.parse(JSON.stringify(meta.get(k))) : null), setMeta: (k, v) => meta.set(k, JSON.parse(JSON.stringify(v))), addEvent() {} },
    api: { broadcast: (e, x) => events.push([e, x]) },
    stop: async (why) => { b.stopped = why; },
  };
  return { b, meta, events };
}
const until = async (f, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (f()) return true; await new Promise((r) => setTimeout(r, 20)); } return false; };

test('업데이터: 확인(판 기록에 둠), 확인을 묻고, 원격 기기는 막고, 준비 뒤 창의 PID를 모아 바꾸기 프로세스를 띄우고 이 백엔드만 끝낸다', async () => {
  const d = tmp('updater');
  try {
    const inst = path.join(d, 'versions');
    const codeRoot = path.join(inst, 'v0.1.0');
    write(path.join(codeRoot, 'app', 'package.json'), pkg('0.1.0'));
    U.writeCurrent(inst, { current: 'v0.1.0', previous: null });
    const { b, meta, events } = fakeBoard(d);
    let latest = { tag_name: 'v0.1.0', tarball_url: 'https://api.github.com/repos/Gudals0320/atrium/tarball/v0.1.0' };
    const swaps = [], exits = [], prepared = [];
    const up = new Updater(b, {
      env: { ATRIUM_INSTALL_DIR: inst }, codeRoot, timers: false, leaveWaitMs: 100,
      fetchJson: async () => latest,
      prepare: async ({ release: rel, step, protocol }) => { prepared.push({ tag: rel.tag, protocol }); step('download'); step('build'); const root = path.join(inst, rel.tag); fs.mkdirSync(root, { recursive: true }); return { root }; },
      spawnSwap: (file, job) => swaps.push({ file, job }), exit: (c) => exits.push(c),
    });
    assert.equal(up.view().current.installed, true); assert.equal(up.view().current.tag, 'v0.1.0');
    let v = await up.handlers['update.check']();
    assert.equal(v.available, false); assert.ok(v.checkedAt);
    await assert.rejects(up.handlers['update.apply']({ confirm: true }, { auth: { kind: 'local' } }), (e) => e.code === 'no_update');
    latest = { ...latest, tag_name: 'v0.2.0', tarball_url: 'https://api.github.com/repos/Gudals0320/atrium/tarball/v0.2.0', html_url: 'https://github.com/Gudals0320/atrium/releases/tag/v0.2.0' };
    v = await up.check('timer');
    assert.equal(v.available, true); assert.equal(v.latest.tag, 'v0.2.0'); assert.equal(meta.get('update').latest.tag, 'v0.2.0');
    assert.ok(events.some(([e, x]) => e === 'update.state' && x.available));
    assert.equal(v.latest.tarball, undefined); // 창에는 받기 주소를 보이지 않는다
    // 원격 기기는 업데이트하지 못한다. 확인을 묻는다
    await assert.rejects(up.handlers['update.apply']({ confirm: true }, { auth: { kind: 'device' } }), (e) => e.code === 'forbidden');
    const ask = await up.handlers['update.apply']({}, { auth: { kind: 'local' } });
    assert.equal(ask.needsConfirm, true); assert.equal(ask.to, 'v0.2.0');
    // 창이 update.restart를 받으면 PID를 알린다
    const origBroadcast = b.api.broadcast;
    b.api.broadcast = (e, x) => { origBroadcast(e, x); if (e === 'update.restart') up.handlers['update.leaving']({ pid: 4242, args: ['.', '--dev', '--evil'] }); };
    const r = await up.handlers['update.apply']({ confirm: true }, { auth: { kind: 'local' } });
    assert.deepEqual(r, { started: true, to: 'v0.2.0' });
    await assert.rejects(up.handlers['update.apply']({ confirm: true }), (e) => e.code === 'update_busy');
    assert.ok(await until(() => exits.length === 1), 'exit');
    assert.deepEqual(prepared, [{ tag: 'v0.2.0', protocol: 22 }]);
    const { job, file } = swaps[0];
    assert.equal(job.kind, 'update'); assert.equal(job.toRoot, path.join(inst, 'v0.2.0')); assert.equal(job.toInstalled, true);
    assert.deepEqual(job.waitPids, [process.pid, 4242]); assert.equal(job.oldBackendPid, process.pid);
    assert.equal(job.relaunch, true); assert.deepEqual(job.relaunchArgs, ['--dev']);
    assert.deepEqual(job.currentBefore.current, 'v0.1.0');
    assert.deepEqual(Object.keys(job.currentAfter).sort(), ['current', 'switchedAt']); assert.equal(job.currentAfter.current, 'v0.2.0'); // P71: previous 없음
    assert.deepEqual(job.profileArgv, []);
    assert.ok(fs.existsSync(file));
    assert.equal(b.stopped, 'update'); assert.deepEqual(exits, [0]);
    assert.ok(events.some(([e, x]) => e === 'update.restart' && x.to.tag === 'v0.2.0'));
    assert.deepEqual(events.filter(([e, x]) => e === 'update.state' && x.job).map(([, x]) => x.job.phase).filter((p, i, a) => p !== a[i - 1]), ['prepare', 'restarting']);
    // 바꾸기 결과가 남아 있으면 다음 백엔드가 판 기록에 옮긴다(한 번)
    U.writeResult(inst, { kind: 'update', at: 123, ok: true, to: { tag: 'v0.2.0' } });
    const up2 = new Updater(fakeBoard(d).b, { env: { ATRIUM_INSTALL_DIR: inst }, codeRoot: path.join(inst, 'v0.2.0'), timers: false });
    assert.equal(up2.view().lastResult.at, 123);
    // 백엔드가 뜬 뒤에 결과가 써져도 창이 물을 때 읽는다
    U.writeResult(inst, { kind: 'update', at: 456, ok: false, rolledBack: true, to: { tag: 'v0.3.0' } });
    assert.equal(up2.view().lastResult.at, 456);
  } finally { rm(d); }
});

test('업데이터: 준비가 실패하면 실패를 보이고 백엔드는 그대로(P71: 손으로 하는 되돌리기 API는 없다)', async () => {
  const d = tmp('updfail');
  try {
    const inst = path.join(d, 'versions');
    const codeRoot = path.join(inst, 'v0.1.0');
    write(path.join(codeRoot, 'app', 'package.json'), pkg('0.1.0'));
    U.writeCurrent(inst, { current: 'v0.1.0', previous: null });
    const { b } = fakeBoard(d, 'dev');
    const exits = [];
    const up = new Updater(b, { env: { ATRIUM_INSTALL_DIR: inst }, codeRoot, timers: false, fetchJson: async () => ({ tag_name: 'v0.2.0', tarball_url: 'https://api.github.com/repos/Gudals0320/atrium/tarball/v0.2.0' }), prepare: async () => { throw new Error('npm ci failed'); }, exit: (c) => exits.push(c), spawnSwap: () => assert.fail('no swap') });
    await up.handlers['update.apply']({ confirm: true });
    assert.ok(await until(() => up.job && up.job.phase === 'failed'));
    assert.match(up.view().job.error, /npm ci failed/);
    assert.equal(b.stopped, null); assert.deepEqual(exits, []);
    assert.equal(up.handlers['update.rollback'], undefined);
  } finally { rm(d); }
});

// 바꾸기 프로세스: 가짜 버전 폴더(client.mjs·config.mjs를 흉내 낸다). bad면 백엔드가 뜨지 못한다
function fakeRoot(inst, tag, { bad = false } = {}) {
  const root = path.join(inst, tag);
  write(path.join(root, 'app', 'package.json'), pkg(tag.slice(1)));
  write(path.join(root, 'app', 'scripts', 'launch.mjs'), `// launcher ${tag}\n`);
  write(path.join(root, 'backend', 'src', 'config.mjs'), 'export const loadConfig = ({ argv }) => ({ profile: argv.includes("--dev") ? "dev" : "real" });\n');
  write(path.join(root, 'backend', 'src', 'client.mjs'), `import fs from 'node:fs';
const LOG = ${JSON.stringify(path.join(inst, 'started.log'))};
export async function startBackend() { fs.appendFileSync(LOG, '${tag}${bad ? ' fail' : ''}\\n'); if (${bad}) throw new Error('백엔드가 시작되지 않았습니다'); return { started: true }; }
export const backendInfo = () => (${bad} ? null : { pid: 999999, port: 1, token: 't' });
export const health = async () => !${bad};
export const stopBackend = async () => ({});
export class ApiClient { async open() {} close() {} async call() { return { pid: 999999, port: 1, herdr: { connected: true } }; } }
`);
  return root;
}
function runSwap(inst, job) {
  const file = path.join(inst, U.JOB_FILE);
  fs.writeFileSync(file, JSON.stringify({ installDir: inst, waitPids: [], oldBackendPid: 1, relaunch: false, healthMs: 5000, nodePath: process.execPath, profileArgv: [], logFile: path.join(inst, 'swap.log'), ...job }));
  const r = spawnSync(process.execPath, [SWAP, file], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(file));
  return U.readResult(inst);
}

test('바꾸기 프로세스: 새 백엔드가 뜨면 current.json을 새 버전으로 두고, 실행기를 바꾸고, 옛 버전은 지운다(P71)', () => {
  const d = tmp('swapok');
  try {
    const inst = path.join(d, 'versions');
    fakeRoot(inst, 'v0.0.9'); const from = fakeRoot(inst, 'v0.1.0'); const to = fakeRoot(inst, 'v0.2.0');
    U.writeCurrent(inst, { current: 'v0.1.0', previous: 'v0.0.9' });
    const res = runSwap(inst, { kind: 'update', fromRoot: from, toRoot: to, toInstalled: true, from: { tag: 'v0.1.0' }, to: { tag: 'v0.2.0' }, currentBefore: U.readCurrent(inst), currentAfter: { current: 'v0.2.0' } });
    assert.equal(res.ok, true, res.error); assert.equal(res.rolledBack, false);
    assert.deepEqual(U.readCurrent(inst), { current: 'v0.2.0', switchedAt: null });
    assert.deepEqual(res.pruned.sort(), ['v0.0.9', 'v0.1.0']);
    assert.deepEqual(U.listVersions(inst), ['v0.2.0']);
    assert.equal(fs.readFileSync(path.join(inst, U.LAUNCHER), 'utf8'), '// launcher v0.2.0\n');
    assert.ok(fs.existsSync(path.join(inst, U.LAUNCHER_CMD)));
    assert.equal(fs.readFileSync(path.join(inst, 'started.log'), 'utf8'), 'v0.2.0\n');
  } finally { rm(d); }
});

test('바꾸기 프로세스: 새 백엔드가 뜨지 못하면 current.json을 옛 것으로 돌리고 옛 백엔드를 다시 띄우고 뜨지 못한 버전을 지운다', () => {
  const d = tmp('swapbad');
  try {
    const inst = path.join(d, 'versions');
    fakeRoot(inst, 'v0.1.0'); const from = fakeRoot(inst, 'v0.2.0'); const to = fakeRoot(inst, 'v0.3.0', { bad: true });
    U.writeCurrent(inst, { current: 'v0.2.0', previous: 'v0.1.0', switchedAt: 5 });
    const before = U.readCurrent(inst);
    const res = runSwap(inst, { kind: 'update', fromRoot: from, toRoot: to, toInstalled: true, from: { tag: 'v0.2.0' }, to: { tag: 'v0.3.0' }, currentBefore: before, currentAfter: { current: 'v0.3.0' } });
    assert.equal(res.ok, false); assert.equal(res.rolledBack, true); assert.match(res.error, /시작되지 않았습니다/);
    assert.equal(res.rollbackError, undefined);
    assert.deepEqual(U.readCurrent(inst), before);
    assert.deepEqual(U.listVersions(inst), ['v0.2.0']); // 자동 되돌리기는 옛 코드 폴더(fromRoot)로 하고, 지금 버전만 남긴다(P71)
    assert.equal(fs.readFileSync(path.join(inst, 'started.log'), 'utf8'), 'v0.3.0 fail\nv0.2.0\n');
  } finally { rm(d); }
});

test('바꾸기 프로세스: 옛 백엔드가 끝나지 않으면 아무것도 바꾸지 않는다', () => {
  const d = tmp('swapwait');
  try {
    const inst = path.join(d, 'versions');
    const from = fakeRoot(inst, 'v0.1.0'); const to = fakeRoot(inst, 'v0.2.0');
    U.writeCurrent(inst, { current: 'v0.1.0', previous: null });
    const before = U.readCurrent(inst);
    // 이 시험 프로세스(살아 있음)를 기다리게 한다. 기다림은 waitMs로 줄인다
    const file = path.join(inst, U.JOB_FILE);
    fs.writeFileSync(file, JSON.stringify({ kind: 'update', installDir: inst, fromRoot: from, toRoot: to, from: { tag: 'v0.1.0' }, to: { tag: 'v0.2.0' }, currentBefore: before, currentAfter: { current: 'v0.2.0', previous: 'v0.1.0' }, waitPids: [process.pid], waitMs: 800, relaunch: false, healthMs: 1000, nodePath: process.execPath, logFile: path.join(inst, 'swap.log') }));
    const r = spawnSync(process.execPath, [SWAP, file], { encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, r.stderr);
    const res = U.readResult(inst);
    assert.equal(res.ok, false); assert.match(res.error, /끝나지 않아/);
    assert.deepEqual(U.readCurrent(inst), before);
    assert.ok(!fs.existsSync(path.join(inst, 'started.log')));
  } finally { rm(d); }
});

test('바꾸기 프로세스: 옛 백엔드가 기다린 뒤에도 끝나지 않으면 그 프로세스를 끄고 바꾼다(2026-11-07)', () => {
  const d = tmp('swapkill');
  // 끝나지 않는 옛 백엔드 흉내(붙잡힌 연결로 http.close가 끝나지 않던 경우)
  const old = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  try {
    const inst = path.join(d, 'versions');
    const from = fakeRoot(inst, 'v0.1.0'); const to = fakeRoot(inst, 'v0.2.0');
    U.writeCurrent(inst, { current: 'v0.1.0', previous: null });
    const res = runSwap(inst, { kind: 'update', fromRoot: from, toRoot: to, toInstalled: true, from: { tag: 'v0.1.0' }, to: { tag: 'v0.2.0' }, currentBefore: U.readCurrent(inst), currentAfter: { current: 'v0.2.0' }, waitPids: [old.pid], oldBackendPid: old.pid, waitMs: 800, killWaitMs: 5000 });
    assert.equal(res.ok, true, res.error); assert.equal(res.forced, true);
    assert.equal(U.readCurrent(inst).current, 'v0.2.0');
    assert.throws(() => process.kill(old.pid, 0), '옛 백엔드는 꺼졌다');
    assert.match(fs.readFileSync(path.join(inst, 'swap.log'), 'utf8'), /killing it/);
  } finally { try { old.kill(); } catch {} rm(d); }
});

test('릴리즈 확인: main이 dev와 같고, 두 version이 태그와 같고, 태그가 main을 가리켜야 한다', () => {
  const ok = { tag: 'v0.2.0', main: 'a'.repeat(40), dev: 'a'.repeat(40), tagCommit: null, appVersion: '0.2.0', backendVersion: '0.2.0' };
  assert.deepEqual(checkRelease(ok), []);
  assert.deepEqual(checkRelease({ ...ok, tagCommit: 'a'.repeat(40) }), []);
  assert.match(checkRelease({ ...ok, dev: 'b'.repeat(40) }).join(), /fast-forward/);
  assert.match(checkRelease({ ...ok, appVersion: '0.1.9' }).join(), /app\/package\.json/);
  assert.match(checkRelease({ ...ok, backendVersion: '0.1.9' }).join(), /backend\/package\.json/);
  assert.match(checkRelease({ ...ok, tagCommit: 'c'.repeat(40) }).join(), /main이 아닌 커밋/);
  assert.match(checkRelease({ ...ok, tag: 'v0.2.0-rc.1' }).join(), /사전 릴리즈/);
  assert.match(checkRelease({ ...ok, dev: null }).join(), /dev 브랜치가 없습니다/);
});
