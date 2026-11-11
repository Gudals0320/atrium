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

test('P114e 실행기: 부모 없이(나무 밖) 뜨고 env와 로그가 넘어간다', { skip: process.platform !== 'win32', timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p114e-'));
  let pid = null;
  try {
    const log = path.join(dir, 'out.log');
    const env = { ...process.env, P114E_MARK: 'detached-ok' };
    const r = await spawnDetached({ file: process.execPath, args: ['-e', 'console.log("mark=" + process.env.P114E_MARK); setTimeout(() => {}, 20000)'], env, logFile: log, workDir: dir });
    pid = r.pid;
    assert.ok(pid > 0);
    assert.equal(typeof r.breakaway, 'boolean');
    const ppid = Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ParentProcessId`], { encoding: 'utf8' }).trim());
    assert.notEqual(ppid, process.pid);
    let parentAlive = true; try { process.kill(ppid, 0); } catch { parentAlive = false; }
    if (parentAlive) { const name = execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${ppid}").Name`], { encoding: 'utf8' }).trim(); assert.notEqual(name.toLowerCase(), 'node.exe', 'the launcher must have exited'); }
    for (let i = 0; i < 50 && !(fs.existsSync(log) && fs.readFileSync(log, 'utf8').includes('mark=')); i++) await new Promise((res) => setTimeout(res, 100));
    assert.match(fs.readFileSync(log, 'utf8'), /mark=detached-ok/);
    assert.deepEqual(fs.readdirSync(dir).filter((f) => /req|result/.test(f)), []); // 요청·결과 파일을 지웠다
  } finally {
    if (pid) try { process.kill(pid); } catch {}
    await new Promise((res) => setTimeout(res, 300));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
