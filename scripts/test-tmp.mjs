#!/usr/bin/env node
// 시험 실행기(P205): `node --test`를 실행마다 만든 임시 뿌리 하나 아래에서 돌리고, 끝나면 그 뿌리를 지운다.
// 시험들은 os.tmpdir() 아래에 mtask-*·p1xx-* 폴더를 만들고 거의 지우지 않아, 전체 시험 한 번에 약 1만 개가 %TEMP%에 쌓였다.
// TEMP·TMP·TMPDIR을 이 뿌리로 바꿔 넘기면 시험 파일(과 그 자식 프로세스)의 os.tmpdir()이 모두 이 안을 가리킨다.
// 지우는 것은 이 실행이 방금 만든 뿌리 하나뿐이다(다른 경로는 건드리지 않는다).
// 쓰기: node ../scripts/test-tmp.mjs [node --test 인자...]   (인자가 없으면 test/*.test.mjs)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const RUN_PREFIX = 'mtask-run-';

// 실행 하나의 임시 뿌리를 만든다. base는 원래 임시 폴더.
export function makeRunRoot(base = os.tmpdir()) {
  return fs.mkdtempSync(path.join(base, RUN_PREFIX));
}

// 뿌리를 지운다. 이 실행기가 만든 것(이름이 mtask-run-으로 시작하고 base 바로 아래)만 지운다.
// 남은 자식 프로세스가 파일을 잡고 있으면 몇 번 다시 해 보고, 그래도 남으면 false.
export function removeRunRoot(root, base = os.tmpdir()) {
  const abs = path.resolve(root);
  if (path.dirname(abs).toLowerCase() !== path.resolve(base).toLowerCase()) throw new Error(`시험 임시 뿌리가 아니다: ${abs}`);
  if (!path.basename(abs).startsWith(RUN_PREFIX)) throw new Error(`시험 임시 뿌리가 아니다: ${abs}`);
  try { fs.rmSync(abs, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {}
  return !fs.existsSync(abs);
}

// 자식에게 줄 환경: 임시 폴더 변수 셋을 뿌리로
export function tmpEnv(root, env = process.env) {
  return { ...env, TEMP: root, TMP: root, TMPDIR: root };
}

async function main() {
  const args = process.argv.slice(2);
  const base = os.tmpdir();
  const root = makeRunRoot(base);
  const child = spawn(process.execPath, ['--test', ...(args.length ? args : ['test/*.test.mjs'])], { stdio: 'inherit', env: tmpEnv(root) });
  const fwd = (sig) => { try { child.kill(sig); } catch {} };
  process.on('SIGINT', fwd); process.on('SIGTERM', fwd);
  const code = await new Promise((resolve) => child.on('exit', (c, sig) => resolve(c ?? (sig ? 1 : 0))));
  if (!removeRunRoot(root, base)) console.error(`[test-tmp] 임시 뿌리를 다 지우지 못했다(남은 프로세스가 잡고 있을 수 있다): ${root}`);
  process.exit(code);
}

const self = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (self) main();
