// P359: OS 보호 저장소(Windows DPAPI, 현재 사용자 범위)로 짧은 글을 암호화·복호화한다.
// 값은 늘 표준 입력으로 넘기고(명령줄·환경 변수에 싣지 않는다) 결과는 표준 출력으로 받는다. 값·결과를 로그에 남기지 않는다.
// 엔트로피(atrium-auth-relay)를 더해 같은 사용자의 다른 프로그램이 이 값만 따로 풀어 쓰기 어렵게 한다(완전한 격리는 아니다: 같은 사용자 권한이면 풀 수 있다).
import { spawn } from 'node:child_process';

const ENTROPY = 'atrium-auth-relay';
const script = (mode) => [
  "$ErrorActionPreference='Stop'",
  'Add-Type -AssemblyName System.Security',
  '$in=[Console]::In.ReadToEnd().Trim()',
  `$ent=[Text.Encoding]::UTF8.GetBytes('${ENTROPY}')`,
  mode === 'protect'
    ? "$b=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($in),$ent,'CurrentUser'); [Console]::Out.Write([Convert]::ToBase64String($b))"
    : "$b=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($in),$ent,'CurrentUser'); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($b))",
].join('; ');

// PowerShell 자식 env: PSModulePath를 뺀다(PowerShell 7 셸에서 부르면 5.1이 모듈을 잘못 읽는다)
const psEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([k]) => k.toUpperCase() !== 'PSMODULEPATH'));

function run(mode, input, { timeoutMs = 20000, platform = process.platform } = {}) {
  if (platform !== 'win32') return Promise.reject(Object.assign(new Error('OS 보호 저장소는 Windows에서만 씁니다'), { code: 'no_protected_store' }));
  return new Promise((resolve, reject) => {
    const p = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script(mode)], { env: psEnv(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = []; let errLen = 0;
    const t = setTimeout(() => { try { p.kill(); } catch {} }, timeoutMs);
    p.stdout.on('data', (c) => out.push(c));
    p.stderr.on('data', (c) => { errLen += c.length; }); // 오류 글에 값이 섞일 수 있어 길이만 센다
    p.on('error', (e) => { clearTimeout(t); reject(Object.assign(new Error(`powershell: ${e.code || 'spawn failed'}`), { code: 'protect_failed' })); });
    p.on('close', (code) => {
      clearTimeout(t);
      const text = Buffer.concat(out).toString('utf8');
      if (code !== 0 || !text) return reject(Object.assign(new Error(`${mode} failed (exit ${code}, stderr ${errLen}B)`), { code: mode === 'protect' ? 'protect_failed' : 'unprotect_failed' }));
      resolve(text);
    });
    p.stdin.end(String(input));
  });
}

export const protect = (plain, o) => run('protect', plain, o);
export const unprotect = (b64, o) => run('unprotect', b64, o);
