// P114·P129: 판의 터미널 백엔드는 herdr-core(hc) 하나다. 판이 어댑터를 만드는 한 곳(backend.mjs)이 부른다.
// - hc 어댑터는 판의 터미널 세션 이름(cfg.terminalSession)을 HC_SESSION으로 쓰고, 고정한 hc를 판 데이터 폴더(<데이터>\hc\bin)에 받는다(ATRIUM_HC로 바꾼다)
// - 옛 판(다른 터미널 백엔드에서 세션을 띄운 판)은 판이 뜰 때 옮기기 모듈이 이 어댑터를 감싸 옮긴다(herdr-migrate/index.mjs)
import { HcAdapter } from './hc/adapter.mjs';
import { envVar } from './config.mjs';

export function createTerminalAdapter(cfg, { env = process.env } = {}) {
  return new HcAdapter({ session: cfg.terminalSession, dataDir: cfg.dataDir, logDir: cfg.logDir, hcPath: envVar('HC', env) || null, env });
}
