// P114: 터미널 백엔드 고르기(herdr | hc). 판이 어댑터를 만드는 한 곳(backend.mjs)이 부른다.
// - ATRIUM_TERMINAL_BACKEND(환경 변수)가 이기고, 없으면 판 설정 terminalBackend(숨은 설정, 화면 없음), 없으면 herdr
// - 바꾸면 다음에 백엔드가 뜰 때 적용된다. 기본을 hc로 바꾸는 것은 개발용 판에서 모든 시험이 통과한 뒤다(사용자 결정, P114 2a)
// - hc 어댑터는 같은 판 세션 이름(cfg.herdrSession)을 HC_SESSION으로 쓰고, 고정한 hc를 판 데이터 폴더(<데이터>\hc\bin)에 받는다(ATRIUM_HC로 바꾼다)
import { HerdrAdapter } from './herdr/adapter.mjs';
import { HcAdapter } from './hc/adapter.mjs';
import { envVar } from './config.mjs';

export const TERMINAL_BACKENDS = ['herdr', 'hc'];
export function pickTerminalBackend({ env = process.env, settings = {} } = {}) {
  const raw = envVar('TERMINAL_BACKEND', env) || (settings && settings.terminalBackend) || 'herdr';
  const v = String(raw).trim().toLowerCase();
  return { backend: TERMINAL_BACKENDS.includes(v) ? v : 'herdr', source: envVar('TERMINAL_BACKEND', env) ? 'env' : settings && settings.terminalBackend ? 'setting' : 'default', invalid: TERMINAL_BACKENDS.includes(v) ? null : String(raw) };
}
export function createTerminalAdapter(cfg, settings = {}, { env = process.env } = {}) {
  const pick = pickTerminalBackend({ env, settings });
  const adapter = pick.backend === 'hc'
    ? new HcAdapter({ session: cfg.herdrSession, dataDir: cfg.dataDir, logDir: cfg.logDir, hcPath: envVar('HC', env) || null, env })
    : new HerdrAdapter({ herdrPath: cfg.herdrPath, session: cfg.herdrSession, logDir: cfg.logDir, protocols: cfg.herdrProtocols, tested: cfg.herdrTested });
  adapter.backend ||= 'herdr';
  adapter.backendPick = pick;
  return adapter;
}
