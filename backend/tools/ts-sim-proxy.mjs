#!/usr/bin/env node
// P49(원격 R3) 시험 도구: tailscale serve 흉내. 127.0.0.1의 한 포트에서 HTTP·WebSocket을 받아 대상 포트로 넘기며,
// serve가 하는 것처럼 Host를 Tailscale 이름(예시 pc.example.ts.net)으로 바꾸고, 들어온 Tailscale-* 머리글을 지운 뒤
// Tailscale-User-Login·Tailscale-User-Name과 X-Forwarded-For/Proto/Host를 넣는다(https://tailscale.com/kb/1312/serve).
// 브라우저 주소와 판이 보는 출처를 맞추려고 Origin도 https://<이름>으로 바꾼다(실제로는 브라우저가 https://<이름>에서 연다).
// 사용: node backend/tools/ts-sim-proxy.mjs --listen 47869 --target 47868 [--name pc.example.ts.net] [--login me@example.com|none]
// 받는 주소는 늘 127.0.0.1이다. 네트워크에 열지 않는다.
import http from 'node:http';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

export function simHeaders(headers, cfg) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) if (!k.toLowerCase().startsWith('tailscale-')) out[k.toLowerCase()] = v; // serve는 들어온 사용자 머리글을 지운다
  out.host = cfg.host || cfg.name;
  if (out.origin) out.origin = `https://${cfg.name}`;
  if (cfg.login) { out['tailscale-user-login'] = cfg.login; out['tailscale-user-name'] = cfg.userName || 'Test User'; }
  out['x-forwarded-for'] = cfg.ip || '100.64.0.2';
  out['x-forwarded-proto'] = 'https';
  out['x-forwarded-host'] = cfg.name;
  return out;
}

// cfg는 도는 중에 바꿀 수 있다(login, host). close()는 열린 연결을 모두 끊는다(끊김 시험)
export function startTsSim({ listen, target, name = 'pc.example.ts.net', login = 'me@example.com', log = () => {} }) {
  const cfg = { name, login, host: null };
  const socks = new Set();
  const srv = http.createServer((req, res) => {
    const up = http.request({ host: '127.0.0.1', port: target, method: req.method, path: req.url, headers: simHeaders(req.headers, cfg) }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', (e) => { if (!res.headersSent) res.writeHead(502); res.end(String(e.message)); });
    req.pipe(up);
  });
  srv.on('connection', (s) => { socks.add(s); s.on('close', () => socks.delete(s)); });
  srv.on('upgrade', (req, sock, head) => {
    const up = net.connect(target, '127.0.0.1', () => {
      const h = simHeaders(req.headers, cfg);
      up.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(h).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('\r\n')}\r\n\r\n`);
      if (head && head.length) up.write(head);
      sock.pipe(up); up.pipe(sock);
    });
    socks.add(up); up.on('close', () => { socks.delete(up); sock.destroy(); });
    sock.on('close', () => up.destroy());
    up.on('error', () => sock.destroy()); sock.on('error', () => up.destroy());
  });
  const ready = new Promise((r) => srv.listen(listen, '127.0.0.1', r));
  return {
    cfg, ready,
    close: () => new Promise((r) => { for (const s of socks) s.destroy(); srv.close(() => r()); }),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2); const get = (k, d) => (a.includes(`--${k}`) ? a[a.indexOf(`--${k}`) + 1] : d);
  const login = get('login', 'me@example.com');
  const p = startTsSim({ listen: Number(get('listen', 47869)), target: Number(get('target', 47868)), name: get('name', 'pc.example.ts.net'), login: login === 'none' ? null : login });
  await p.ready; console.log(`ts-sim on 127.0.0.1:${get('listen', 47869)} → ${get('target', 47868)}`);
}
