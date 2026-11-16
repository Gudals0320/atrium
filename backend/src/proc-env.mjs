// 터미널 서버와 그 프로그램에 줄 환경(hc 어댑터·코어가 쓴다). P129: 옛 herdr 어댑터에서 옮겼다.
import { execFile } from 'node:child_process';

// 부모 Claude Code 세션 표시 변수와 판 자신의 변수를 뺀 환경. 옛 터미널 백엔드(herdr)의 패널 변수(HERDR_*)도 뺀다:
// 판을 그 안에서 띄운 옛 PC에서 새 터미널의 프로그램이 옛 세션을 가리키지 않게(옛 이름 받기)
// 판이 띄우는 세션·터미널에 넘기지 않는 비밀 변수. 판 자신만 쓰는 키(음성 입력의 SONIOX_API_KEY)가 에이전트에게 새지 않게 한다.
// ATRIUM_ENV_DENY(쉼표로 나눈 이름)를 더 받는다. 이름은 대소문자를 가리지 않는다
export const DEFAULT_ENV_DENY = ['SONIOX_API_KEY'];
export function envDenyList(base = process.env) {
  const more = String(base.ATRIUM_ENV_DENY ?? base.MTASK_ENV_DENY ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return [...new Set([...DEFAULT_ENV_DENY, ...more].map((x) => x.toUpperCase()))];
}
export function stripDenied(env, deny = envDenyList()) {
  const set = new Set(deny.map((x) => String(x).toUpperCase()));
  return Object.fromEntries(Object.entries(env).filter(([k]) => !set.has(k.toUpperCase())));
}

// 거부 목록(envDenyList)의 비밀 변수도 뺀다. 목록은 base에서 읽는다(빼기 전에)
export function cleanEnv(base = process.env) {
  const kept = Object.fromEntries(Object.entries(base).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|HERDR_|MTASK_|ATRIUM_)/i.test(k)));
  return stripDenied(kept, envDenyList(base));
}

function execText(file, args, opts = {}) {
  return new Promise((res) => {
    execFile(file, args, { encoding: 'utf8', windowsHide: true, timeout: 20000, ...opts }, (err, stdout, stderr) => res({ code: err ? (err.code ?? 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
}

// P40: 레지스트리의 Machine+User PATH(펼친 값). 새 터미널에 줄 PATH의 출처다(백엔드가 뜬 뒤 설치한 프로그램도 찾게). 1분 동안 기억한다. 못 읽으면 null
let regPathCache = null;
export async function registryPath() {
  if (regPathCache && Date.now() - regPathCache.at < 60000) return regPathCache.value;
  const ps = "$m = [Environment]::GetEnvironmentVariable('Path','Machine'); $u = [Environment]::GetEnvironmentVariable('Path','User'); [Environment]::ExpandEnvironmentVariables((@($m, $u) | Where-Object { $_ }) -join ';')";
  const r = await execText('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 10000 });
  const value = r.code === 0 ? r.stdout.trim() : '';
  regPathCache = { at: Date.now(), value: value || null };
  return regPathCache.value;
}
