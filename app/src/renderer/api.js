// 판 API 클라이언트(창 쪽). 백엔드 WebSocket(ws://127.0.0.1:<포트>/api?token=…)에 붙는다(ARCH 6절).
// 요청 {id, method, params} → 응답 {id, result | error}. 백엔드가 먼저 보내는 것은 {event, data}다.
// 끊기면 1초 뒤 다시 붙는다. 그때 main 프로세스가 백엔드가 없으면 다시 띄운다(ARCH 1절 백엔드 수명).
import { perfLog } from './perf.js';
import { clientIdOf, clientQuery } from './lib/multiclient.js';

// P47: 창 프로필마다 오래 가는 클라이언트 ID(localStorage mt.clientId). 이름은 mt.clientName이 있으면 그것, 없으면 main이 준 기기 이름
function loadClientId() {
  let saved = null;
  try { saved = localStorage.getItem('mt.clientId'); } catch {}
  const rand = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const id = clientIdOf(saved, rand);
  if (id !== saved) try { localStorage.setItem('mt.clientId', id); } catch {}
  return id;
}
function clientName(info) { try { const n = localStorage.getItem('mt.clientName'); if (n) return n; } catch {} return info.deviceName || null; }

export const CONNECT_TIMEOUT_MS = 10000; // 소켓이 이 안에 열리지 않으면(CONNECTING에 멈춤) 정리하고 다시 붙는다(이슈 #1-15)

export class Api {
  constructor() {
    this.n = 0;
    this.wait = new Map();
    this.listeners = new Map(); // event → Set(fn)
    this.status = 'connecting';
    this.info = null;
    this.clientId = typeof localStorage !== 'undefined' ? loadClientId() : null; // P47
    this.gen = 0; // 연결 세대. 옛 connect()의 늦은 응답과 옛 소켓의 이벤트는 무시한다(이슈 #1-14)
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.listeners.get(event).delete(fn);
  }
  emit(event, data) { const s = this.listeners.get(event); if (s) for (const fn of [...s]) { try { fn(data); } catch (e) { console.error(e); } } }

  setStatus(s, detail) { this.status = s; perfLog('ws', { status: s }); this.emit('$status', { status: s, detail }); }

  async connect() {
    const gen = ++this.gen;
    clearTimeout(this.openTimer);
    this.setStatus('connecting');
    let info;
    try { info = await window.mt.backend(); } catch (e) { if (gen !== this.gen) return; this.setStatus('error', String(e && e.message || e)); return this.retry(); }
    if (gen !== this.gen) return; // 그사이 새 connect()가 시작했다
    this.info = info;
    this.drop(this.ws);
    // P47: 클라이언트 ID·기기 이름·종류를 연결 주소로 알린다(백엔드 multiclient.mjs parseClientHello). 웹 화면(P48)은 info.clientKind = 'web'
    this.clientName = clientName(info);
    const q = clientQuery({ clientId: this.clientId, name: this.clientName, kind: info.clientKind || 'desktop' });
    // P48: 웹 화면은 같은 출처와 기기 토큰(web.js의 info.wsUrl). P49: 웹도 클라이언트 값을 함께 붙인다
    const base = info.wsUrl || `ws://127.0.0.1:${info.port}/api?token=${info.token}`;
    const ws = new WebSocket(q ? `${base}${base.includes('?') ? '&' : '?'}${q}` : base);
    this.ws = ws;
    const live = () => gen === this.gen && this.ws === ws;
    this.openTimer = setTimeout(() => {
      if (!live() || ws.readyState !== 0) return; // 0 = CONNECTING
      this.drop(ws);
      this.setStatus('closed'); this.emit('$close'); this.retry();
    }, CONNECT_TIMEOUT_MS);
    ws.onopen = async () => {
      if (!live()) return;
      clearTimeout(this.openTimer);
      this.setStatus('open');
      try { const r = await this.call('events.subscribe'); this.emit('$open', r); } catch (e) { console.error(e); }
    };
    ws.onmessage = (ev) => {
      if (!live()) return;
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.event) return this.emit(m.event, m.data);
      const w = this.wait.get(m.id); if (!w) return; this.wait.delete(m.id);
      if (m.error) w.rej(Object.assign(new Error(m.error.message), { code: m.error.code, key: m.error.key, vars: m.error.vars })); else w.res(m.result); // key·vars: 화면 글 열쇠(P16, lib/i18n.js errText)
    };
    ws.onclose = () => {
      if (!live()) return;
      clearTimeout(this.openTimer);
      for (const w of this.wait.values()) w.rej(Object.assign(new Error('disconnected'), { code: 'disconnected' }));
      this.wait.clear();
      this.setStatus('closed'); this.emit('$close'); this.retry();
    };
  }
  // 옛 소켓을 떼어 내고 닫는다. 기다리던 요청은 끊김으로 끝낸다
  drop(ws) {
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = null;
    try { ws.close(); } catch {}
    for (const w of this.wait.values()) w.rej(Object.assign(new Error('disconnected'), { code: 'disconnected' }));
    this.wait.clear();
  }
  retry() { clearTimeout(this.retryTimer); this.retryTimer = setTimeout(() => this.connect(), 1000); }

  call(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return Promise.reject(Object.assign(new Error('not connected to the backend'), { code: 'disconnected' }));
    const id = ++this.n;
    return new Promise((res, rej) => { this.wait.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
}

export const api = new Api();
