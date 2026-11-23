// P329: omo(OmO)가 쓸 수 있는 Codex 모델 목록. omo의 엔진은 pi 계열(senpi)이라 `omo --list-models [찾기]`의 표 꼴이 pi와 같다
// ("provider  model  context  max-out  thinking  images"). omo의 전체 목록은 로그인과 상관없이 제공자 수십 개(이 PC 2천 줄 넘음)를 찍어
// 고르기 창에 맞지 않으므로, 사용자가 쓰려는 Codex 구독 제공자(chatgpt-subscription)만 찾아 받는다. 목록 밖 이름도 런처 모델 칸에 그대로 쓸 수 있다(freeModel).
// 받기·담아 두기는 pi 목록(pi-models.mjs)과 같은 틀이다. 이 모듈은 omo 설정·로그인 파일(~/.omo/agent/auth.json)을 열지 않는다
import { execFile, exec } from 'node:child_process';
import { AgyModels, RUN_TIMEOUT_MS } from './agy-models.mjs';
import { parsePiModels } from './pi-models.mjs';

export const OMO_CODEX_PROVIDER = 'chatgpt-subscription';
// omo --list-models <찾기>를 띄운다(창 없이). 인자는 판이 정한 고정 글이다
export function runOmoModels({ command = 'omo', search = OMO_CODEX_PROVIDER, timeout = RUN_TIMEOUT_MS, platform = process.platform } = {}) {
  const win = platform === 'win32';
  const cmd = win && /\s/.test(command) && !/^".*"$/.test(command) ? `"${command}"` : command;
  return new Promise((resolve, reject) => {
    const done = (e, out) => (e ? reject(e) : resolve(String(out || '')));
    const o = { encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 };
    if (win) exec(`${cmd} --list-models ${search}`, o, done); else execFile(cmd, ['--list-models', search], o, done);
  });
}
// 표 → 그 제공자의 모델만(찾기는 모델 이름에도 걸려 다른 제공자 줄이 섞일 수 있다)
export function parseOmoModels(text, provider = OMO_CODEX_PROVIDER) {
  const r = parsePiModels(text);
  if (!r.ok) return r;
  const models = r.models.filter((m) => m.startsWith(`${provider}/`));
  return models.length ? { ok: true, models, labels: {} } : { ok: false, why: 'empty' };
}
export const omoModels = ({ command = 'omo', fallback = [], run = () => runOmoModels({ command }), ...o } = {}) => new AgyModels({ fallback, run, parse: (t) => parseOmoModels(t), source: 'omo', ...o });
