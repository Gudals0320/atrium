// P359: 판 중계기 자식 프로세스. 판 백엔드가 node로 띄우고 표준 입력으로 설정 한 줄(JSON)을 준다:
//   { keyFile(암호문 파일), port(0이면 OS가 고른다), secret(경로 앞머리), upstream?(시험용 127.0.0.1 주소) }
// 키는 이 프로세스가 OS 보호 저장소로 직접 푼다(판 백엔드·세션 env·명령줄에 싣지 않는다). 127.0.0.1만 듣는다.
// 표준 출력은 JSON 줄: { t: 'ready', port } | { t: 'req', … 값 없는 요청 기록 } | { t: 'fatal', why }. 키·토큰 값은 쓰지 않는다
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import { matchPath, rewriteHeaders, UsageTap, keyOk, entrypointOf, costQuery, costRowsOf, COST_BETA, COST_VERSION } from './auth-relay-core.mjs';
import { unprotect } from './dpapi.mjs';

const say = (o) => { try { process.stdout.write(JSON.stringify(o) + '\n'); } catch {} };
const fatal = (why) => { say({ t: 'fatal', why }); setTimeout(() => process.exit(3), 50); };

function readConfig() {
  return new Promise((resolve) => {
    let s = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { s += c; const i = s.indexOf('\n'); if (i >= 0) { process.stdin.pause(); resolve(s.slice(0, i)); } });
    process.stdin.on('end', () => resolve(s));
  });
}

// P361: 한 번 묻고 끝나는 비용 조회. 설정 { mode: 'cost', adminKeyFile, from, to, upstream? }.
//   Admin 키는 이 프로세스가 OS 보호 저장소로 직접 풀고, 답은 { t: 'cost', rows, refreshedAt, pages } | { t: 'fatal', why }만 쓴다(키·응답 본문은 쓰지 않는다)
function getJson(up, pathQ, key) {
  return new Promise((resolve) => {
    const q = up.mod.request({ host: up.host, port: up.port, path: pathQ, method: 'GET', headers: { 'x-api-key': key, 'anthropic-version': COST_VERSION, 'anthropic-beta': COST_BETA, 'user-agent': 'Atrium (board credit ledger)', accept: 'application/json' }, timeout: 30000 }, (r) => {
      const buf = []; let n = 0;
      r.on('data', (c) => { n += c.length; if (n < 8 * 1024 * 1024) buf.push(c); });
      r.on('end', () => { let j = null; try { j = JSON.parse(Buffer.concat(buf).toString('utf8')); } catch {} resolve({ status: r.statusCode, j }); });
      r.on('error', () => resolve({ status: 0, j: null }));
    });
    q.on('timeout', () => q.destroy(new Error('timeout')));
    q.on('error', (e) => resolve({ status: 0, j: null, err: (e && e.code) || 'error' }));
    q.end();
  });
}
async function costMain(cfg, up) {
  let key = '';
  try { key = (await unprotect(fs.readFileSync(cfg.adminKeyFile, 'utf8').trim())).trim(); }
  catch (e) { return fatal(e && e.code === 'ENOENT' ? 'no_admin_key' : 'decrypt_failed'); }
  if (!keyOk(key)) return fatal('no_admin_key');
  const rows = []; let refreshedAt = null; let page = null; let pages = 0;
  do {
    const r = await getJson(up, costQuery({ from: cfg.from, to: cfg.to, page }), key);
    if (r.status !== 200 || !r.j) {
      const et = r.j && r.j.error && typeof r.j.error.type === 'string' ? r.j.error.type.slice(0, 40) : null;
      return fatal(r.status ? `http_${r.status}${et ? `:${et}` : ''}` : (r.err || 'network'));
    }
    const x = costRowsOf(r.j);
    rows.push(...x.rows); refreshedAt = x.refreshedAt ?? refreshedAt; page = x.next; pages++;
  } while (page && pages < 10);
  say({ t: 'cost', rows, refreshedAt, pages });
  setTimeout(() => process.exit(0), 20);
}

async function main() {
  let cfg;
  try { cfg = JSON.parse(await readConfig()); } catch { return fatal('bad_config'); }
  if (cfg.mode === 'cost') {
    let cu = { mod: https, host: 'api.anthropic.com', port: 443 };
    if (cfg.upstream) { const u = new URL(cfg.upstream); if (u.hostname !== '127.0.0.1' || u.protocol !== 'http:') return fatal('bad_upstream'); cu = { mod: http, host: '127.0.0.1', port: Number(u.port) }; }
    return costMain(cfg, cu);
  }
  let key = '';
  try { key = (await unprotect(fs.readFileSync(cfg.keyFile, 'utf8').trim())).trim(); }
  catch (e) { return fatal(e && e.code === 'ENOENT' ? 'no_key' : 'decrypt_failed'); }
  if (!keyOk(key)) return fatal('no_key');
  // 시험용 위쪽 주소는 127.0.0.1의 http만 받는다
  let up = { mod: https, host: 'api.anthropic.com', port: 443 };
  if (cfg.upstream) { const u = new URL(cfg.upstream); if (u.hostname !== '127.0.0.1' || u.protocol !== 'http:') return fatal('bad_upstream'); up = { mod: http, host: '127.0.0.1', port: Number(u.port) }; }
  const agent = new up.mod.Agent({ keepAlive: true });
  const server = http.createServer((req, res) => {
    const t0 = Date.now();
    const m = matchPath(req.url, cfg.secret);
    if (!m.ok) { req.resume(); res.writeHead(m.status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ type: 'error', error: { type: 'relay_refused', message: m.why } })); say({ t: 'req', at: t0, method: req.method, status: m.status, refused: m.why }); return; }
    const rec = { t: 'req', at: t0, method: req.method, path: m.path.slice(0, 120), session: m.session, ep: entrypointOf(req.headers['user-agent']) }; // P363: entrypoint(cli | sdk-cli 등)만
    const tap = new UsageTap();
    const u = up.mod.request({ host: up.host, port: up.port, path: m.path, method: req.method, headers: rewriteHeaders(req.headers, key), agent }, (r) => {
      rec.status = r.statusCode;
      const h = { ...r.headers }; delete h.connection; delete h['keep-alive'];
      res.writeHead(r.statusCode, h);
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
      r.on('data', (c) => tap.push(c));
      r.pipe(res);
      r.on('end', () => { Object.assign(rec, tap.end(), { ms: Date.now() - t0 }); say(rec); });
      r.on('error', () => { rec.err = 'upstream_reset'; say(rec); });
    });
    u.on('error', (e) => { rec.status = 502; rec.err = (e && e.code) || 'upstream_error'; rec.ms = Date.now() - t0; say(rec); if (!res.headersSent) { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ type: 'error', error: { type: 'relay_upstream', message: rec.err } })); } else res.destroy(); });
    req.on('aborted', () => u.destroy());
    req.pipe(u);
  });
  server.on('error', (e) => fatal(e && e.code === 'EADDRINUSE' ? 'port_in_use' : 'listen_failed'));
  server.listen(Number(cfg.port) || 0, '127.0.0.1', () => say({ t: 'ready', port: server.address().port, pid: process.pid }));
  // 부모가 사라지면(표준 입력이 닫히면) 끝낸다
  process.stdin.resume(); process.stdin.on('end', () => process.exit(0));
}
main();
