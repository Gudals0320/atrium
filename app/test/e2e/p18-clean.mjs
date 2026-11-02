// P18 시험 정리: p18-migrate.mjs가 만든 시험 판을 끄고 지운다. 시험 이름(atrium-dev-p18-*)과 backend/.dev/p18 아래, 시험 폴더, 그 폴더의 대화 기록만.
// 1) 판 세션 끄기 2) 백엔드 끄기(API) 3) 시험 herdr 서버 끄기와 세션 지우기 4) 시험 데이터·창 프로필·시험 폴더·시험 대화 기록 지우기
// 사용: node test/e2e/p18-clean.mjs [--keep-dirs]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../../backend/src/config.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev', 'p18');
const DIR = 'C:\\Workspace\\mtask-p18-ws';
const PROJECT = path.join(os.homedir(), '.claude', 'projects', 'C--Workspace-mtask-p18-ws-demo');
const HERDR = loadConfig({ argv: ['--dev'], env: {} }).herdrPath;
const SESSIONS = ['atrium-dev-p18-old', 'atrium-dev-p18-new'];
const keep = process.argv.includes('--keep-dirs');
const base = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE|MTASK_|ATRIUM_)/.test(k)));
const say = (...a) => console.log(...a);
const tryRun = (file, args, env = {}) => { try { return execFileSync(file, args, { encoding: 'utf8', env: { ...base(), ...env }, timeout: 60000 }).trim(); } catch (e) { return `(실패) ${String(e.stderr || e.message).split('\n')[0]}`; } };

for (const [name, data] of [['atrium-dev-p18-new', 'new'], ['atrium-dev-p18-old', 'old']]) {
  const env = { ATRIUM_HERDR_SESSION: name, ATRIUM_PORT: '47834', ATRIUM_DATA_DIR: path.join(DEV, data) };
  const cli = path.join(REPO, 'backend', 'bin', 'atrium.mjs');
  let info = null; try { info = JSON.parse(fs.readFileSync(path.join(DEV, data, 'backend.json'), 'utf8')); } catch {}
  if (!info || info.legacyTombstone) continue; // 옮긴 옛 폴더의 backend.json은 새 백엔드를 가리킨다
  const ls = tryRun(process.execPath, [cli, '--json', 'ls'], env);
  if (ls.startsWith('[')) for (const s of JSON.parse(ls)) say(`kill ${s.name}`, tryRun(process.execPath, [cli, 'kill', s.name, '--yes'], env));
  say(`backend stop ${name}`, tryRun(process.execPath, [cli, 'backend', 'stop'], env));
}
for (const s of SESSIONS) {
  say(`herdr stop ${s}`, tryRun(HERDR, ['--session', s, 'server', 'stop']));
  say(`herdr delete ${s}`, tryRun(HERDR, ['session', 'delete', s]));
}
if (!keep) {
  for (const d of ['old', 'new', 'oldapp', 'newapp'].map((x) => path.join(DEV, x))) { fs.rmSync(d, { recursive: true, force: true }); say('지움', d); }
  fs.rmSync(DIR, { recursive: true, force: true }); say('지움', DIR);
  if (fs.existsSync(PROJECT)) { fs.rmSync(PROJECT, { recursive: true, force: true }); say('지움(시험 대화 기록)', PROJECT); }
}
say('남은 herdr 세션', tryRun(HERDR, ['session', 'list']).split('\n').filter((l) => /atrium-dev-p18/.test(l)));
