// 판 API 클라이언트(창 쪽). 백엔드 WebSocket(ws://127.0.0.1:<포트>/api?token=…)에 붙는다(ARCH 6절).
// 요청 {id, method, params} → 응답 {id, result | error}. 백엔드가 먼저 보내는 것은 {event, data}다.
// 끊기면 다시 붙는다. 그때 main 프로세스가 백엔드가 없으면 다시 띄운다(ARCH 1절 백엔드 수명).
// P49: 다시 붙기는 백오프(lib/reconnect.js), 15초마다 ping으로 왕복 지연을 재고 죽은 연결을 알아챈다. 깨어남·온라인이면 곧바로 다시 붙는다.
import { perfLog } from './perf.js';
import { clientIdOf, clientQuery } from './lib/multiclient.js';
import { connInit, connStep, retryDelay, pingTimedOut, rttLabel, prevCloseParam, PING_EVERY_MS, PING_TIMEOUT_MS } from './lib/reconnect.js'; // P49. P82: prevCloseParam

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

export const BIG_MSG = 8000; // P86: 이보다 큰 메시지는 단계 기록에 남긴다
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
    this.conn = connInit(); // P49: 다시 붙기 상태
    this.rtts = []; this.rtt = null; this.pingSentAt = null;
    this.openedAt = null; this.lastClose = null; this.closeLog = []; // P82
    this.onStep = null; // P86: 단계 기록(crash-watch.js가 둔다). (이름, 값) → 동기로 적는다
    if (typeof window !== 'undefined' && window.addEventListener) {
      const wake = () => this.wake();
      window.addEventListener('online', wake);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
    }
  }
  // P49: 연결 상태 바꾸기와 알리기(띠, 짝 맺기 화면)
  step(ev) { this.conn = connStep(this.conn, ev); this.emit('$conn', this.conn); }
  // 깨어남(노트북 잠자기 뒤, 탭이 다시 보임), 네트워크가 돌아옴: 열려 있으면 곧바로 ping, 아니면 곧바로 다시 붙는다
  wake() {
    if (this.ws && this.ws.readyState === 1) { this.ping(); return; }
    if (this.conn.phase === 'unpaired') return;
    clearTimeout(this.retryTimer); this.retryTimer = setTimeout(() => this.connect(), 0);
  }
  ping() {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return;
    const now = Date.now();
    if (pingTimedOut(this.pingSentAt, now, PING_TIMEOUT_MS)) { this.dead(ws); return; }
    if (this.pingSentAt != null) return; // 답을 기다리는 중
    this.pingSentAt = now;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : now);
    this.call('ping', { t: t0 }).then(() => {
      const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
      this.rtts.push(ms); if (this.rtts.length > 10) this.rtts.shift();
      this.rtt = rttLabel(this.rtts); this.emit('$rtt', { rtt: this.rtt, last: Math.round(ms) });
    }).catch((e) => { if (e && e.code === 'unknown_method') this.rtt = null; }).finally(() => { if (this.ws === ws) this.pingSentAt = null; });
    clearTimeout(this.pingDeadline); this.pingDeadline = setTimeout(() => { if (this.ws === ws && pingTimedOut(this.pingSentAt, Date.now(), PING_TIMEOUT_MS)) this.dead(ws); }, PING_TIMEOUT_MS + 100);
  }
  // 답이 없는 연결: 닫고 끊김으로 다룬다
  dead(ws) {
    if (this.ws !== ws) return;
    perfLog('ws', { status: 'dead' });
    this.drop(ws); this.ws = null; this.pingSentAt = null; clearInterval(this.pingTimer);
    this.noteClose({ code: 'timeout', wasClean: false });
    this.step({ type: 'close', code: 'timeout' });
    this.setStatus('closed'); this.emit('$close'); this.retry();
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.listeners.get(event).delete(fn);
  }
  emit(event, data) { const s = this.listeners.get(event); if (s) for (const fn of [...s]) { try { fn(data); } catch (e) { console.error(e); } } }

  setStatus(s, detail) { this.status = s; perfLog('ws', { status: s }); this.emit('$status', { status: s, detail }); }
  // P82: 직전 닫힘(브라우저가 본 코드, 깨끗이 닫혔나, 붙어 있던 ms). 다음 연결 주소의 pc 값으로 백엔드에 알린다(연결 기록의 connect). closeLog는 시험이 읽는다
  noteClose({ code, wasClean }) {
    const ms = this.openedAt ? Date.now() - this.openedAt : 0;
    this.openedAt = null;
    this.lastClose = { code, wasClean: !!wasClean, ms };
    this.closeLog.push({ ...this.lastClose, at: Date.now() }); if (this.closeLog.length > 20) this.closeLog.shift();
    perfLog('ws_close', this.lastClose);
  }

  async connect() {
    const gen = ++this.gen;
    clearTimeout(this.openTimer);
    this.setStatus('connecting');
    let info;
    try { info = await window.mt.backend(); } catch (e) { if (gen !== this.gen) return; this.step({ type: 'close', code: e && (e.code === 'not_paired' || e.code === 'remote_blocked') ? e.code : 'backend' }); /* P58: remote_blocked면 막음 화면 */ this.setStatus('error', String(e && e.message || e)); return this.retry(); }
    if (gen !== this.gen) return; // 그사이 새 connect()가 시작했다
    this.info = info;
    this.drop(this.ws);
    // P47: 클라이언트 ID·기기 이름·종류를 연결 주소로 알린다(백엔드 multiclient.mjs parseClientHello). 웹 화면(P48)은 info.clientKind = 'web'
    this.clientName = clientName(info);
    const pc = prevCloseParam(this.lastClose); // P82
    const q = [clientQuery({ clientId: this.clientId, name: this.clientName, kind: info.clientKind || 'desktop' }), pc ? `pc=${encodeURIComponent(pc)}` : ''].filter(Boolean).join('&');
    // P48: 웹 화면은 같은 출처와 기기 토큰(web.js의 info.wsUrl). P49: 웹도 클라이언트 값을 함께 붙인다
    const base = info.wsUrl || `ws://127.0.0.1:${info.port}/api?token=${info.token}`;
    const ws = new WebSocket(q ? `${base}${base.includes('?') ? '&' : '?'}${q}` : base);
    this.ws = ws;
    const live = () => gen === this.gen && this.ws === ws;
    this.openTimer = setTimeout(() => {
      if (!live() || ws.readyState !== 0) return; // 0 = CONNECTING
      this.drop(ws);
      this.noteClose({ code: 'open_timeout', wasClean: false });
      this.step({ type: 'close', code: 'open_timeout' });
      this.setStatus('closed'); this.emit('$close'); this.retry();
    }, CONNECT_TIMEOUT_MS);
    ws.onopen = async () => {
      if (!live()) return;
      clearTimeout(this.openTimer);
      this.openedAt = Date.now(); this.lastClose = null; // P82: 알렸다
      if (this.onStep) this.onStep('open', { in: this.inB || 0 }); // P86: in = 지금까지 받은 바이트
      this.step({ type: 'open' });
      this.pingSentAt = null; clearInterval(this.pingTimer); this.pingTimer = setInterval(() => this.ping(), PING_EVERY_MS);
      setTimeout(() => this.ping(), 1000);
      this.setStatus('open');
      try { const r = await this.call('events.subscribe'); this.emit('$open', r); } catch (e) { console.error(e); }
    };
    ws.onmessage = (ev) => {
      if (!live()) return;
      const size = typeof ev.data === 'string' ? ev.data.length : ev.data.byteLength || 0;
      this.inB = (this.inB || 0) + size; // P84: 받은 양(죽기 전 기록)
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      // P86: 큰 메시지는 받자마자 종류 이름(이벤트 또는 요청 이름)과 바이트만 적는다(내용 없음)
      if (size >= BIG_MSG && this.onStep) { const w0 = m.event ? null : this.wait.get(m.id); this.onStep('msg', { k: m.event || (w0 && w0.m) || 'reply', b: size }); }
      if (m.event) return this.emit(m.event, m.data);
      const w = this.wait.get(m.id); if (!w) return; this.wait.delete(m.id);
      if (m.error) w.rej(Object.assign(new Error(m.error.message), { code: m.error.code, key: m.error.key, vars: m.error.vars })); else w.res(m.result); // key·vars: 화면 글 열쇠(P16, lib/i18n.js errText)
    };
    ws.onclose = (ev) => {
      if (!live()) return;
      clearTimeout(this.openTimer);
      clearInterval(this.pingTimer); this.pingSentAt = null;
      this.noteClose({ code: ev && ev.code, wasClean: ev && ev.wasClean }); // P82
      this.step({ type: 'close', code: ev && ev.code }); // P49: 4401이면 짝이 끊겼다
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
  // P49: 백오프. 짝이 끊겼으면(4401) 곧바로 한 번 더 붙어 본다. 웹 어댑터의 backend()가 401을 보고 짝 맺기 화면으로 다시 연다
  retry() {
    clearTimeout(this.retryTimer);
    const web = typeof window !== 'undefined' && window.mt && window.mt.web;
    const d = retryDelay(this.conn, { maxMs: web ? undefined : 2000 }); // PC 창은 2초까지(main이 백엔드를 다시 띄운다)
    this.retryTimer = setTimeout(() => this.connect(), d == null ? 0 : d);
  }

  call(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return Promise.reject(Object.assign(new Error('not connected to the backend'), { code: 'disconnected' }));
    const id = ++this.n;
    return new Promise((res, rej) => { this.wait.set(id, { res, rej, m: method }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
}

export const api = new Api();
