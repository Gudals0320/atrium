// P361 시험용 가짜 위쪽 서버(api.anthropic.com 대신, 127.0.0.1만). 개발용 판의 ATRIUM_AUTH_RELAY_UPSTREAM으로 준다.
// - GET /v1/organizations/analytics/cost: 요청 범위의 1시간 칸 가운데 몇 칸에 비용을 넣어 돌려준다(data_refreshed_at = 지금 - 1시간)
//   x-api-key가 sk-test-admin-로 시작하지 않으면 401. 받은 키 값은 어디에도 쓰지 않는다(앞머리만 본다)
// - 그 밖(/v1/messages 등): 401. 실제 모델을 부르지 않는다
// 스스로 끝난다(기본 30분). 실행: node p361-fake-up.mjs <포트> [분]
import http from 'node:http';

const PORT = Number(process.argv[2] || 48296);
const MIN = Number(process.argv[3] || 30);
const H = 3600000;
const s = http.createServer((q, r) => {
  q.resume();
  const u = new URL(q.url, 'http://x');
  const key = String(q.headers['x-api-key'] || '');
  if (u.pathname === '/v1/organizations/analytics/cost' && q.method === 'GET') {
    if (!key.startsWith('sk-test-admin-')) { r.writeHead(401, { 'content-type': 'application/json' }); return r.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid' } })); }
    const from = Date.parse(u.searchParams.get('starting_at')), to = Date.parse(u.searchParams.get('ending_at'));
    const now = Date.now();
    const refreshed = Math.floor((now - H) / H) * H;
    const data = [];
    for (let t = from; t < Math.min(to, refreshed); t += H) {
      const h = new Date(t).getUTCHours();
      if (h % 3 !== 0) continue;
      data.push({ starting_at: new Date(t).toISOString().replace('.000', ''), ending_at: new Date(t + H).toISOString().replace('.000', ''), group: {}, cost: { currency: 'USD', amount: (85 + (h * 7) % 60).toFixed(6), list_amount: '0.000000', requests: 3 } });
    }
    r.writeHead(200, { 'content-type': 'application/json' });
    return r.end(JSON.stringify({ data, has_more: false, next_page: null, data_refreshed_at: new Date(refreshed).toISOString() }));
  }
  r.writeHead(401, { 'content-type': 'application/json' });
  r.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'fake upstream' } }));
});
s.listen(PORT, '127.0.0.1', () => process.stdout.write(`fake upstream ${PORT} pid ${process.pid}\n`));
setTimeout(() => process.exit(0), MIN * 60000).unref?.();
setTimeout(() => process.exit(0), MIN * 60000);
