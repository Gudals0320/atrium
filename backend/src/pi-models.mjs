// P201: pi가 쓸 수 있는 모델 목록. `pi --list-models`는 로그인이나 키가 있는 제공자의 모델만 표로 찍는다
// (1.5.2: 머리줄 "provider  model  context  max-out  thinking  images", 줄마다 "anthropic  claude-haiku-5-5  1M  128K  yes  yes").
// pi --model 값은 "<제공자>/<모델 ID>"이므로 목록도 그 꼴로 둔다. 네트워크를 거치지 않아 1초 안에 끝난다.
// 받기·담아 두기는 AGY 목록(agy-models.mjs AgyModels)과 같은 틀을 쓴다. 이 모듈은 pi 설정·로그인 파일(~/.pi/agent/auth.json)을 열지 않는다
import { execFile, exec } from 'node:child_process';
import { AgyModels, TTL_MS, FAIL_RETRY_MS, RUN_TIMEOUT_MS } from './agy-models.mjs';
import { isModelName } from './model-name.mjs';

// `pi --list-models` 출력 → { ok, models: ['제공자/ID'], labels: {} } | { ok: false, why }
export function parsePiModels(text) {
  const models = [];
  let head = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const cols = raw.trim().split(/\s+/);
    if (cols.length < 2 || !cols[0]) continue;
    if (cols[0].toLowerCase() === 'provider' && cols[1].toLowerCase() === 'model') { head = true; continue; }
    if (!head) continue; // 머리줄 앞의 글(경고 등)은 건너뛴다
    const id = `${cols[0]}/${cols[1]}`;
    if (!/^[A-Za-z0-9._-]+$/.test(cols[0]) || !isModelName(cols[1]) || models.includes(id)) continue;
    models.push(id);
  }
  return models.length ? { ok: true, models, labels: {} } : { ok: false, why: 'empty' };
}

// pi --list-models를 띄운다(창 없이). Windows의 pi는 pi.cmd라 셸로 띄운다(인자는 판이 정한 고정 글)
export function runPiModels({ command = 'pi', timeout = RUN_TIMEOUT_MS, platform = process.platform } = {}) {
  const win = platform === 'win32';
  const cmd = win && /\s/.test(command) && !/^".*"$/.test(command) ? `"${command}"` : command;
  return new Promise((resolve, reject) => {
    const done = (e, out) => (e ? reject(e) : resolve(String(out || '')));
    const o = { encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 1024 * 1024 };
    if (win) exec(`${cmd} --list-models`, o, done); else execFile(cmd, ['--list-models'], o, done);
  });
}

export const piModels = ({ command = 'pi', fallback = [], run = () => runPiModels({ command }), ...o } = {}) => new AgyModels({ fallback, run, parse: parsePiModels, source: 'pi', ...o });
export { TTL_MS, FAIL_RETRY_MS };
