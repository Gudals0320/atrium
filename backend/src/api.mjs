// API 서버(ARCH 6절): 127.0.0.1의 WebSocket. 요청 {id, method, params} → 응답 {id, result} 또는 {id, error: {code, message}}.
// 백엔드가 먼저 보내는 것은 {event, data}다(events.subscribe를 부른 클라이언트에게, 터미널 프레임은 붙은 클라이언트에게만).
import { WebSocketServer } from 'ws';
import { parseClientHello } from './multiclient.mjs';

export class ApiServer {
  constructor({ token, handlers, onClose, onOpen, log }) {
    this.token = token; this.handlers = handlers; this.onClose = onClose; this.onOpen = onOpen || (() => {}); this.log = log || (() => {});
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });
    this.clients = new Set();
    this.wss.on('connection', (ws, req) => this._connection(ws, req));
  }
  // http 서버의 upgrade 이벤트에서 부른다
  handleUpgrade(req, socket, head) {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname !== '/api' || u.searchParams.get('token') !== this.token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
  }
  // P47: 연결 주소의 client(오래 가는 ID)·name(기기 이름)·kind(desktop|web|tray|cli)로 클라이언트를 알아본다(multiclient.mjs). 없으면 익명(CLI, 옛 창)
  _connection(ws, req) {
    const hello = parseClientHello(new URL((req && req.url) || '/api', 'http://127.0.0.1').searchParams);
    const client = {
      ws, subscribed: false, ...hello, connectedAt: Date.now(), lastInputAt: null,
      sendEvent: (event, data) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ event, data })); },
    };
    this.clients.add(client);
    this.onOpen(client);
    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return ws.send(JSON.stringify({ id: null, error: { code: 'bad_json', message: 'invalid JSON' } })); }
      const h = this.handlers[msg.method];
      if (!h) return ws.send(JSON.stringify({ id: msg.id, error: { code: 'unknown_method', message: msg.method } }));
      try {
        const result = await h(msg.params || {}, client);
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ id: msg.id, result: result ?? null }));
      } catch (e) {
        if (!e.code) this.log(`api ${msg.method} failed: ${e.stack}`);
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ id: msg.id, error: { code: e.code || 'internal', message: e.message, ...(e.key ? { key: e.key, vars: e.vars || {} } : {}) } })); // P16: 화면 글 열쇠(msg.mjs)
      }
    });
    ws.on('close', () => { this.clients.delete(client); this.onClose(client); });
    ws.on('error', () => {});
  }
  broadcast(event, data) { for (const c of this.clients) if (c.subscribed) c.sendEvent(event, data); }
  close() { for (const c of this.clients) c.ws.close(); this.wss.close(); }
}
