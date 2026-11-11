// P114 e 단위 시험: herdr 서버를 job·프로세스 나무 밖에서 띄우는 실행기(herdr/detach.mjs).
// 명령 줄 따옴표, env 블록, 그리고 진짜로 띄워 본다(부모가 이 시험 프로세스가 아니고, env가 넘어가고, stdout이 로그로 간다)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { quoteArg, commandLine, envList, spawnDetached } from '../src/herdr/detach.mjs';

test('P114e 명령 줄과 env 블록', () => {
  assert.equal(quoteArg('server'), 'server');
  assert.equal(quoteArg('C:\\Program Files\\herdr\\herdr.exe'), '"C:\\Program Files\\herdr\\herdr.exe"');
  assert.equal(quoteArg('a "b"'), '"a \\"b\\""');
  assert.equal(quoteArg('C:\\dir with space\\'), '"C:\\dir with space\\\\"');
  assert.equal(quoteArg(''), '""');
  assert.equal(commandLine('C:\\h\\herdr.exe', ['--session', 'atrium-dev-x', 'server']), 'C:\\h\\herdr.exe --session atrium-dev-x server');
  assert.deepEqual(envList({ Path: 'C:\\w', ATRIUM_X: '1', path: 'C:\\later', 'BAD=K': 'x', N: null }), ['ATRIUM_X=1', 'path=C:\\later']);
});

test('P114e 실행기 실패: 없는 실행 파일은 win32 2로 던지고(어댑터는 spawn_failed, 그 밖은 예전 방식), 남는 파일에 env 값이 없다', { skip: process.platform !== 'win32', timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p114e-fail-'));
  try {
    const secret = `p114e-fail-secret-${Date.now()}`;
    await assert.rejects(spawnDetached({ file: path.join(dir, 'no-such.exe'), args: [], env: { ...process.env, P114E_SECRET: secret }, logFile: path.join(dir, 'out.log'), workDir: dir }), (e) => e.code === 'detach_failed' && e.win32 === 2);
    const files = fs.readdirSync(dir).map((f) => path.join(dir, f)).filter((f) => fs.statSync(f).isFile());
    for (const f of files) assert.equal(fs.readFileSync(f).includes(secret), false, `env value written to ${path.basename(f)}`);
    assert.deepEqual(fs.readdirSync(dir).filter((f) => /req|result/.test(f)), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('P114e 실행기: 부모 없이(나무 밖) 뜨고 env와 로그가 넘어간다', { skip: process.platform !== 'win32', timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p114e-'));
  let pid = null;
  try {
    const log = path.join(dir, 'out.log');
    // P114 2a-fix: 요청은 stdin으로 간다. env 값(사용자 API 키 같은 것)이 workDir 아래 어느 파일에도 남지 않아야 한다
    const secret = `p114e-secret-${process.pid}-${Date.now()}`;
    const env = { ...process.env, P114E_MARK: 'detached-ok-한글', P114E_SECRET: secret };
    const r = await spawnDetached({ file: process.execPath, args: ['-e', 'console.log("mark=" + process.env.P114E_MARK + " secret=" + (process.env.P114E_SECRET ? "set" : "missing")); setTimeout(() => {}, 20000)'], env, logFile: log, workDir: dir });
    pid = r.pid;
    assert.ok(pid > 0);
    assert.equal(typeof r.breakaway, 'boolean');
    const ppid = Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ParentProcessId`], { encoding: 'utf8' }).trim());
    assert.notEqual(ppid, process.pid);
    let parentAlive = true; try { process.kill(ppid, 0); } catch { parentAlive = false; }
    if (parentAlive) { const name = execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${ppid}").Name`], { encoding: 'utf8' }).trim(); assert.notEqual(name.toLowerCase(), 'node.exe', 'the launcher must have exited'); }
    for (let i = 0; i < 50 && !(fs.existsSync(log) && fs.readFileSync(log, 'utf8').includes('mark=')); i++) await new Promise((res) => setTimeout(res, 100));
    assert.match(fs.readFileSync(log, 'utf8'), /mark=detached-ok-한글 secret=set/); // 한글 값과 비밀 값이 env로 넘어갔다
    assert.deepEqual(fs.readdirSync(dir).filter((f) => /req|result/.test(f)), []); // 결과 파일을 지웠고 요청 파일은 없다
    const files = fs.readdirSync(dir, { recursive: true }).map((f) => path.join(dir, f)).filter((f) => fs.statSync(f).isFile());
    assert.ok(files.length >= 2); // 실행기 스크립트와 로그
    for (const f of files) assert.equal(fs.readFileSync(f).includes(secret), false, `env value written to ${path.basename(f)}`);
  } finally {
    if (pid) try { process.kill(pid); } catch {}
    await new Promise((res) => setTimeout(res, 300));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
