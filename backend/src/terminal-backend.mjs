// P114·P117: 판의 터미널 백엔드(herdr | hc). 판이 어댑터를 만드는 한 곳(backend.mjs)이 부른다.
// - 판마다 정한 백엔드를 판 기록(meta terminalBackend: { backend, by, at, from? })에 둔다. 처음 뜰 때 정한다:
//   herdr 세션 기록이 있는 옛 판(판 기록에 세션이 있거나 herdr 세션 폴더가 있음)은 herdr, 없는 새 판은 NEW_BOARD_BACKEND.
//   옛 판은 사람이 옮기기(terminal-move.mjs)를 누를 때까지 herdr다. 옮기기·되돌리기가 이 기록을 바꾼다
// - ATRIUM_TERMINAL_BACKEND(환경 변수)는 기록보다 이기고 기록하지 않는다(개발·시험)
// - P114의 숨은 설정 terminalBackend는 없앴다. 판 기록의 settings에 'hc'로 남아 있으면(P114 개발용 판) 한 번 그 값으로 정한다
// - 판의 어댑터는 늘 TerminalRouter다. 정한 백엔드가 주이고, 판에 다른 백엔드의 패널을 가진 세션이 남아 있으면 그 백엔드도 붙인다
// - hc 어댑터는 같은 판 세션 이름(cfg.herdrSession)을 HC_SESSION으로 쓰고, 고정한 hc를 판 데이터 폴더(<데이터>\hc\bin)에 받는다(ATRIUM_HC로 바꾼다)
import fs from 'node:fs';
import { HerdrAdapter, herdrSessionDir } from './herdr/adapter.mjs';
import { HcAdapter } from './hc/adapter.mjs';
import { envVar } from './config.mjs';
import { TerminalRouter, TERMINAL_BACKENDS, paneBackend } from './terminal-router.mjs';

export { TERMINAL_BACKENDS, paneBackend };
// 새 판(herdr 세션 기록 없음)의 백엔드. P117: herdr-core(사용자 결정 2026-11-11). 옛 판은 옮기기를 누를 때까지 herdr다
export const NEW_BOARD_BACKEND = 'hc';

const norm = (v) => { const x = String(v || '').trim().toLowerCase(); return TERMINAL_BACKENDS.includes(x) ? x : null; };

// 이 판의 백엔드를 정한다(순수 함수). meta: 판 기록의 terminalBackend, settings: 판 기록의 settings(옛 숨은 설정), oldBoard: herdr 세션 기록이 있는가
// → { backend, source: 'env'|'board'|'setting'|'old-board'|'new-board', invalid, persist }
export function decideTerminalBackend({ env = process.env, meta = null, settings = {}, oldBoard = false, newBoard = NEW_BOARD_BACKEND } = {}) {
  const raw = envVar('TERMINAL_BACKEND', env);
  if (raw) { const b = norm(raw); return { backend: b || 'herdr', source: 'env', invalid: b ? null : String(raw), persist: false }; }
  if (meta && norm(meta.backend)) return { backend: norm(meta.backend), source: 'board', by: meta.by || null, invalid: null, persist: false };
  if (settings && norm(settings.terminalBackend) === 'hc') return { backend: 'hc', source: 'setting', invalid: null, persist: true };
  if (oldBoard) return { backend: 'herdr', source: 'old-board', invalid: null, persist: true };
  return { backend: norm(newBoard) || 'herdr', source: 'new-board', invalid: null, persist: true };
}
// P114의 모양(시험과 옛 호출). settings.terminalBackend가 있으면 그것, 없으면 herdr
export function pickTerminalBackend({ env = process.env, settings = {} } = {}) {
  const raw = envVar('TERMINAL_BACKEND', env) || (settings && settings.terminalBackend) || 'herdr';
  const v = String(raw).trim().toLowerCase();
  return { backend: TERMINAL_BACKENDS.includes(v) ? v : 'herdr', source: envVar('TERMINAL_BACKEND', env) ? 'env' : settings && settings.terminalBackend ? 'setting' : 'default', invalid: TERMINAL_BACKENDS.includes(v) ? null : String(raw) };
}
// herdr 세션 기록이 있는 옛 판인가: 판 기록에 세션 행이 있거나(열린·닫힌), 판이 herdr 서버를 본 적이 있거나, 이 판의 herdr 세션 폴더가 있다
export function isOldBoard({ store, session, exists = (p) => fs.existsSync(p) }) {
  try { if (store && store.anySessionRow && store.anySessionRow()) return true; } catch {}
  try { if (store && store.getMeta('herdrServerPid')) return true; } catch {}
  try { if (session && exists(herdrSessionDir(session))) return true; } catch {}
  return false;
}

export function makeAdapter(name, cfg, { env = process.env } = {}) {
  const a = name === 'hc'
    ? new HcAdapter({ session: cfg.herdrSession, dataDir: cfg.dataDir, logDir: cfg.logDir, hcPath: envVar('HC', env) || null, env })
    : new HerdrAdapter({ herdrPath: cfg.herdrPath, session: cfg.herdrSession, logDir: cfg.logDir, protocols: cfg.herdrProtocols, tested: cfg.herdrTested });
  a.backend ||= 'herdr';
  return a;
}
// 판의 어댑터(라우터). decision: decideTerminalBackend의 값(없으면 settings로 P114처럼), others: 판에 남은 다른 백엔드의 이름들
export function createTerminalAdapter(cfg, settings = {}, { env = process.env, decision = null, others = [] } = {}) {
  const pick = decision || pickTerminalBackend({ env, settings });
  const primary = makeAdapter(pick.backend, cfg, { env });
  primary.backendPick = pick;
  const router = new TerminalRouter({ primary, others: others.filter((n) => n !== pick.backend && TERMINAL_BACKENDS.includes(n)).map((n) => makeAdapter(n, cfg, { env })) });
  return router;
}
