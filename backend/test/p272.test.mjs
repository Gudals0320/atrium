// 이슈 #18: 지원 Node 버전 확인(node-check.mjs), engines·README가 같은 최소 버전을 말하는지, PowerShell 7에서 서명 읽기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nodeSatisfies, nodeProblem, engineRange, rangeText } from '../src/node-check.mjs';
import * as U from '../src/update.mjs';
import { winPowerShellEnv, winPowerShellExe, authenticodeOf } from '../src/hc/pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('이슈 #18 지원 Node: 22.x는 22.15부터(22.13 한글 경로 종료, 22.14 zstd 없음), 24.14부터(24.10~24.13 한글 경로 종료). 지금 Node는 통과', () => {
  const range = engineRange();
  assert.equal(range, '^22.15.0 || >=24.14.0');
  for (const v of ['22.13.0', '22.14.0', '22.12.9', '20.18.0', 'v22.14.1', '23.11.1', '24.0.0', '24.11.0', '24.13.1']) assert.ok(!nodeSatisfies(v, range), v);
  for (const v of ['22.15.0', '22.15.1', '22.23.5', '24.14.0', '24.19.0', 'v25.9.0', '26.0.0-pre']) assert.ok(nodeSatisfies(v, range), v);
  assert.equal(nodeProblem('24.11.0', range), '지원하지 않는 Node 버전입니다(24.11.0). 필요한 버전: 22.x는 22.15 이상, 또는 24.14 이상(https://nodejs.org/)');
  assert.equal(rangeText('>=22.13'), '22.13 이상');
  assert.equal(nodeProblem('22.15.0', range), null);
  assert.equal(nodeProblem(), null);
  assert.equal(U.nodeSatisfies, nodeSatisfies); // update.mjs는 같은 함수를 낸다
  // 다른 꼴: 하나만 쓴 >=, 범위 끝 <, 같음. 모르는 꼴은 막지 않는다
  assert.ok(nodeSatisfies('22.13.0', '>=22.13') && !nodeSatisfies('22.12.0', '>=22.13'));
  assert.ok(nodeSatisfies('22.15.0', '>=22.15 <23') && !nodeSatisfies('23.0.0', '>=22.15 <23'));
  assert.ok(nodeSatisfies('1.0.0', null) && nodeSatisfies('1.0.0', '~22') && nodeSatisfies('1.0.0', '22.x'));
});

test('이슈 #18 같은 범위: 두 package.json의 engines, README 두 벌의 배지와 요구 표', () => {
  const range = engineRange();
  for (const p of ['backend/package.json', 'app/package.json']) assert.equal(JSON.parse(read(p)).engines.node, range, p);
  for (const p of ['README.md', 'README.ko.md']) {
    const t = read(p);
    assert.ok(t.includes('alt="Node.js 22.15+ or 24.14+"') && t.includes('badge/Node.js-22.15%2B%20%7C%2024.14%2B'), `${p} 배지`);
    const row = t.split('\n').find((l) => l.startsWith('| [Node.js](https://nodejs.org/) |'));
    assert.ok(row && row.includes('22.15') && row.includes('24.14'), `${p} 요구 표`);
  }
});

test('이슈 #18 백엔드·CLI·업데이트 미리 보기는 다른 모듈보다 먼저 Node를 본다', () => {
  for (const p of ['backend/src/main.mjs', 'backend/bin/atrium.mjs']) {
    const t = read(p);
    const imports = [...t.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
    assert.deepEqual(imports.filter((x) => !x.startsWith('node:')), [p.startsWith('backend/bin') ? '../src/node-check.mjs' : './node-check.mjs'], p);
  }
  const nc = read('backend/src/node-check.mjs');
  assert.deepEqual([...nc.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]).filter((x) => !x.startsWith('node:')), []);
  const uv = read('backend/src/update-verify.mjs');
  assert.ok(uv.indexOf("import('./node-check.mjs')") < uv.indexOf("import('./update.mjs')"));
});

test('이슈 #18 자식 Windows PowerShell의 env에는 PSModulePath가 없다(대소문자 무관), 실행 파일은 System32의 것', () => {
  const env = winPowerShellEnv({ PATH: 'x', PSModulePath: 'a', psmodulepath: 'b', SystemRoot: 'C:\\Windows' });
  assert.deepEqual(env, { PATH: 'x', SystemRoot: 'C:\\Windows' });
  assert.equal(winPowerShellExe({ SystemRoot: 'D:\\Win' }), path.join('D:\\Win', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'));
});

// PowerShell 7의 PSModulePath를 물려받은 상태(pwsh에서 릴리스 검사를 돌린 것과 같다)에서 서명을 읽는다. pwsh가 없으면 건너뛴다
let pwshModulePath = null;
if (process.platform === 'win32') {
  try { pwshModulePath = execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', '$env:PSModulePath'], { encoding: 'utf8', windowsHide: true, timeout: 20000 }).trim() || null; } catch {}
}
test('이슈 #18 PowerShell 7의 PSModulePath를 물려받아도 서명 상태를 읽는다', { skip: !pwshModulePath && 'pwsh 없음' }, async () => {
  const before = process.env.PSModulePath;
  process.env.PSModulePath = pwshModulePath;
  try {
    const s = await authenticodeOf(path.join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe'));
    assert.equal(s && s.status, 'Valid');
    assert.match(String(s.subject), /CN=/);
  } finally { if (before === undefined) delete process.env.PSModulePath; else process.env.PSModulePath = before; }
});
