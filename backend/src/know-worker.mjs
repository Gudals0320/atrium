// P364: atrium know의 worker thread. 색인 짓기·고치기·찾기가 동기(git, 파일, SQLite)라 판의 이벤트 고리 밖에서 돈다.
// 한 번에 하나씩 받는다(메시지 차례). 받는 것 { id, op, args } → 주는 것 { id, ok, result | error: { code, message } }
import { parentPort } from 'node:worker_threads';
import { runOp, closeAll } from './know-core.mjs';

parentPort.on('message', (m) => {
  if (!m || m.op === 'close') { closeAll(); parentPort.postMessage({ id: m && m.id, ok: true, result: null }); return; }
  try { parentPort.postMessage({ id: m.id, ok: true, result: runOp(m.op, m.args || {}) }); }
  catch (e) { parentPort.postMessage({ id: m.id, ok: false, error: { code: e.code || 'error', message: e.message || String(e) } }); }
});
