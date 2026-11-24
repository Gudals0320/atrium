// P352: 휴대폰 화면(phoneScreen()인 부팅)의 이상 동작 기록. 화면 오류(window.onerror, unhandledrejection), 실패한 판 API(메서드·오류 코드·걸린 시간),
// 보내기·키 보내기 실패, 웹소켓 다시 붙기(까닭·횟수), 받은 답 크기(메서드·이벤트별 바이트 합)를 모아 묶어서(TELE_FLUSH_MS마다, 페이지가 가려질 때) 판에 보낸다(web.telemetry).
// 판은 원격 기록(backend/src/remote-log.mjs)에 tele 줄로 남기고 `atrium remote errors`가 종류별로 묶어 보인다(backend/src/phone-errors.mjs).
// - 같은 것(종류·메서드·코드·글·자리)은 한 줄로 묶어 횟수(n)만 올린다. 줄 하나 TELE_LINE_MAX 바이트, 부팅마다 TELE_BOOT_MAX줄(넘치면 cap 줄 하나)
// - 일이 분명히 잘못되면(보이는 채 죽은 뒤 다시 열림, 같은 API가 이어 실패, 보내기 실패, 길게 끊김·다시 붙기 고리) 그때 상황(snap)을 자동으로 한 줄 남긴다:
//   화면, 열린 세션 이름, 최근 부팅 단계, 받은 크기, 연결 상태, 앱·판 버전, 이 부팅의 판단(why). SNAP_GAP_MS에 한 번, 부팅마다 SNAP_BOOT_MAX번
// - 사용자 대화 글·경로·토큰은 넣지 않는다. 오류 글은 scrub으로 경로·주소·긴 낱말·긴 따옴표 글을 지우고 자른다
// 순수 부분(TeleBuffer, scrub, fitLine)은 단위 시험(test/p352-lib.test.mjs)이 부른다. startPhoneTelemetry만 window를 만진다
export const TELE_FLUSH_MS = 10_000;
export const TELE_LINE_MAX = 2048;
export const TELE_BOOT_MAX = 200;
export const TELE_BATCH_MAX = 40; // 한 번에 보내는 줄 수
export const TELE_PENDING_MAX = 80; // 못 보내고 쥐고 있는 줄 수
export const TELE_BYTES_EVERY_MS = 60_000; // 받은 크기 줄은 이 사이에 한 번(바뀌었을 때)
export const SNAP_GAP_MS = 30_000;
export const SNAP_BOOT_MAX = 10;
export const API_REPEAT = 3, API_REPEAT_MS = 60_000; // 같은 메서드가 이 사이에 이만큼 실패하면 상황 기록
export const WS_LOOP = 5, WS_LOOP_MS = 120_000; // 다시 붙기 고리
export const WS_DOWN_MS = 60_000; // 이보다 길게 끊겼다가 다시 붙으면 상황 기록
export const TELE_KINDS = ['err', 'rej', 'api', 'send', 'ws', 'bytes', 'snap', 'cap', 'lay']; // P355: lay(배치 값, 부팅마다 한 번)
const QUIET = new Set(['web.telemetry']); // 자기 보내기 실패는 세지 않는다

const CODE = /^[A-Za-z0-9_.:$-]{1,48}$/;
export const codeOf = (v) => (v == null || v === '' ? null : CODE.test(String(v)) ? String(v) : 'other');
// 오류 글에서 내용이 될 만한 것을 지운다: 주소, 경로, 긴 따옴표 글, 긴 낱말(토큰·ID), 숫자 덩어리
export function scrub(s, n = 160) {
  let t = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ');
  t = t.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<url>')
    .replace(/[A-Za-z]:[\\/][^\s'"`)]*/g, '<path>')
    .replace(/(^|[\s('"`])\/[^\s'"`)]+/g, '$1<path>')
    .replace(/(['"`])([^'"`]{25,})\1/g, '$1…$1')
    .replace(/[A-Za-z0-9_+/=-]{25,}/g, '<id>')
    .replace(/\d{5,}/g, '<n>')
    .replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}
// 스크립트 자리: 파일 이름(주소·경로 없이)과 줄:칸
export function srcOf(file, line, col) {
  const base = String(file || '').split(/[?#]/)[0].split(/[\\/]/).pop();
  const b = /^[A-Za-z0-9_.-]{1,60}$/.test(base) ? base : '';
  const pos = [line, col].filter((x) => Number.isInteger(x) && x >= 0).join(':');
  return [b, pos].filter(Boolean).join(':') || null;
}
export const teleKey = (x) => [x.k, x.m || '', x.code || '', x.msg || '', x.src || ''].join('|');

// 줄 하나를 상한 안으로. 큰 것(errs, steps, bytes, prev)부터 버리고 글을 줄인다. 그래도 넘치면 null
export function fitLine(o, max = TELE_LINE_MAX) {
  const len = (x) => JSON.stringify(x).length;
  let x = { ...o };
  if (len(x) <= max) return x;
  for (const k of ['errs', 'prev', 'steps', 'bytes']) { if (x[k] != null) { const { [k]: _, ...rest } = x; x = rest; if (len(x) <= max) return x; } }
  if (x.msg) { x = { ...x, msg: String(x.msg).slice(0, 60) }; if (len(x) <= max) return x; }
  return null;
}

export class TeleBuffer {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.pending = new Map(); // 열쇠 → 보낼 줄(묶음)
    this.out = []; // 꺼냈지만 못 보내 되돌린 줄, 상황 기록
    this.sent = 0; this.dropped = 0; this.capNoted = false;
    this.bytes = {}; this.bytesDirty = false; this.bytesAt = 0;
    this.recent = []; // 최근 오류 열쇠(상황 기록의 errs)
    this.fails = new Map(); // 메서드 → 실패 시각들
    this.closes = []; this.downSince = null;
    this.snaps = 0; this.snapAt = -Infinity;
  }
  // 하나 적기. 돌려줌: 묶인 줄
  note(k, f = {}) {
    const t = this.now();
    const it = { k, ...(f.m ? { m: codeOf(f.m) } : {}), ...(f.code != null ? { code: codeOf(f.code) } : {}), ...(f.msg ? { msg: scrub(f.msg) } : {}), ...(f.src ? { src: String(f.src).slice(0, 80) } : {}) };
    if (f.steer === true) it.steer = true;
    const key = teleKey(it);
    let x = this.pending.get(key);
    if (x) { x.n += 1; x.last = t; } else if (this.pending.size >= TELE_PENDING_MAX) { this.dropped++; return null; } else { x = { ...it, n: 1, at: t }; this.pending.set(key, x); }
    if (Number.isFinite(f.ms)) x.ms = Math.max(0, Math.round(f.ms));
    if (k !== 'bytes' && k !== 'snap') {
      const label = [it.k, it.m, it.code, it.msg].filter(Boolean).join(' ').slice(0, 100);
      this.recent = [label, ...this.recent.filter((r) => r !== label)].slice(0, 5);
    }
    return x;
  }
  addBytes(k, b) {
    if (!Number.isFinite(b) || b <= 0) return;
    const key = codeOf(k) || 'other';
    this.bytes[key] = (this.bytes[key] || 0) + b;
    this.bytesDirty = true;
  }
  bytesTop(n = 12) {
    return Object.fromEntries(Object.entries(this.bytes).sort((a, b) => b[1] - a[1]).slice(0, n));
  }
  // 판 API 실패. 같은 메서드가 API_REPEAT_MS 안에 API_REPEAT번이면 true(상황 기록할 때). 끊김(disconnected)은 다시 붙기 고리가 맡는다
  apiFail(m, code, ms) {
    if (QUIET.has(m)) return false;
    this.note('api', { m, code, ms });
    if (code === 'disconnected') return false;
    const t = this.now();
    const a = (this.fails.get(m) || []).filter((x) => t - x < API_REPEAT_MS);
    a.push(t); this.fails.set(m, a);
    return a.length >= API_REPEAT;
  }
  // 소켓이 닫힘. 돌려줌: 'loop'(WS_LOOP_MS 안에 WS_LOOP번) 또는 null
  wsClose(code) {
    const t = this.now();
    this.note('ws', { code: code == null ? 'none' : code });
    if (this.downSince == null) this.downSince = t;
    this.closes = [...this.closes.filter((x) => t - x < WS_LOOP_MS), t];
    return this.closes.length >= WS_LOOP ? 'loop' : null;
  }
  // 소켓이 열림. 돌려줌: 끊겨 있던 ms(끊긴 적이 없으면 null)
  wsOpen() {
    if (this.downSince == null) return null;
    const ms = this.now() - this.downSince;
    this.downSince = null;
    return ms;
  }
  wantSnap() {
    const t = this.now();
    return this.snaps < SNAP_BOOT_MAX && t - this.snapAt >= SNAP_GAP_MS;
  }
  // 상황 기록 한 줄(ctx는 startPhoneTelemetry가 만든다)
  snap(why, ctx = {}) {
    if (!this.wantSnap()) return null;
    this.snaps += 1; this.snapAt = this.now();
    const line = fitLine({ k: 'snap', why: codeOf(why), at: this.now(), ...ctx, bytes: this.bytesTop(), ...(this.recent.length ? { errs: [...this.recent] } : {}) });
    if (line) this.out.push(line);
    return line;
  }
  // 보낼 줄 꺼내기(부팅마다 TELE_BOOT_MAX줄). 넘치면 cap 줄 하나
  drain({ force = false } = {}) {
    const t = this.now();
    const lines = [...this.out];
    this.out = [];
    for (const x of this.pending.values()) lines.push({ ...x });
    this.pending.clear();
    if (this.bytesDirty && (force || t - this.bytesAt >= TELE_BYTES_EVERY_MS)) { lines.push({ k: 'bytes', at: t, bytes: this.bytesTop(16) }); this.bytesDirty = false; this.bytesAt = t; }
    const room = Math.max(0, TELE_BOOT_MAX - this.sent - (this.capNoted ? 0 : 1));
    const take = [];
    for (const l of lines) { const f = fitLine(l); if (!f) { this.dropped++; continue; } if (take.length < Math.min(room, TELE_BATCH_MAX)) take.push(f); else if (take.length >= room) this.dropped++; else this.out.push(f); }
    if (this.dropped && !this.capNoted && this.sent + take.length < TELE_BOOT_MAX) { take.push({ k: 'cap', at: t, n: this.dropped }); this.capNoted = true; }
    this.out = this.out.slice(0, TELE_PENDING_MAX);
    this.sent += take.length;
    return take;
  }
  // 보내지 못한 줄을 되돌린다(쥐는 수에 상한)
  requeue(lines) {
    this.sent = Math.max(0, this.sent - lines.length);
    this.out = [...lines, ...this.out].slice(0, TELE_PENDING_MAX);
  }
}

// P355: 배치 값 한 줄(아래 잘림을 숫자로 보려고 부팅마다 한 번). 창 크기(iw·ih), 문서 높이(ch), 보이는 높이·위치(vh·vt, visualViewport),
// 화면(sw·sh), 안전 영역 네 값(st·sr·sb·sl, env(safe-area-inset-*)), 페이지 뿌리의 아래 끝(rb), 맨 아래 줄(on: tabs | input | keys)의 아래 끝(tb),
// 홈 화면 앱인지(sd), 키보드가 열렸는지(kb). 값은 CSS px(소수 한 자리). 잘림 = rb - (vt + vh)
export const LAY_FIELDS = ['iw', 'ih', 'ch', 'vh', 'vt', 'sw', 'sh', 'st', 'sr', 'sb', 'sl', 'rb', 'tb'];
const n1 = (v) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e5 ? Math.round(v * 10) / 10 : null);
export function layoutLine(m = {}, at = Date.now()) {
  const lay = {};
  for (const f of LAY_FIELDS) { const v = n1(m[f]); if (v != null) lay[f] = v; }
  if (m.sd != null) lay.sd = !!m.sd;
  if (m.kb != null) lay.kb = !!m.kb;
  if (m.on === 'tabs' || m.on === 'input' || m.on === 'keys') lay.on = m.on;
  return { k: 'lay', at, lay };
}
// 지금 화면에서 잰다(휴대폰 페이지의 [data-role=mp] 뿌리와 맨 아래 줄)
export function measureLayout(win = window, doc = document) {
  const vv = win.visualViewport;
  const probe = doc.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  doc.body.appendChild(probe);
  const cs = win.getComputedStyle(probe);
  const px = (v) => parseFloat(v) || 0;
  const sa = { st: px(cs.paddingTop), sr: px(cs.paddingRight), sb: px(cs.paddingBottom), sl: px(cs.paddingLeft) };
  probe.remove();
  const root = doc.querySelector('[data-role=mp]');
  const low = doc.querySelector('.mt-mp-tabs') || doc.querySelector('[data-role=mp-input]') || doc.querySelector('[data-role=mp-keys]');
  let sd = false;
  try { sd = win.matchMedia('(display-mode: standalone)').matches || win.navigator.standalone === true; } catch {}
  return {
    iw: win.innerWidth, ih: win.innerHeight, ch: doc.documentElement.clientHeight,
    vh: vv ? vv.height : null, vt: vv ? vv.offsetTop : null, sw: win.screen && win.screen.width, sh: win.screen && win.screen.height, ...sa,
    rb: root ? root.getBoundingClientRect().bottom : null, tb: low ? low.getBoundingClientRect().bottom : null,
    on: low ? (low.classList.contains('mt-mp-tabs') ? 'tabs' : low.dataset.role === 'mp-input' ? 'input' : 'keys') : null,
    sd, kb: doc.documentElement.classList.contains('mt-kb-open'),
  };
}
// 기록을 켰으면(휴대폰 페이지) 배치 값을 한 번 남긴다. 돌려줌: 남긴 줄(이미 남겼거나 기록이 꺼졌으면 null)
export function noteLayout() {
  if (!rt || rt.layoutNoted) return null;
  let m;
  try { m = measureLayout(); } catch { return null; }
  rt.layoutNoted = true;
  const line = layoutLine(m);
  rt.buf.out.push(line);
  rt.soon();
  return line;
}

// ---------- 화면에서 돌리기 ----------
let rt = null;
// opts: api(판 API 클라이언트), boot(crash-watch bootState), context()(화면, 열린 세션 이름), steps()(이 부팅의 단계 기록), versions()({ app, board })
export function startPhoneTelemetry({ api, boot = {}, context = () => ({}), steps = () => [], versions = () => ({}) }) {
  if (rt) return rt;
  const buf = new TeleBuffer();
  const ctxOf = (extra = {}) => {
    let c = {};
    try { c = context() || {}; } catch {}
    let st = [];
    try { st = (steps() || []).slice(-8); } catch {}
    let v = {};
    try { v = versions() || {}; } catch {}
    const conn = api.conn || {};
    return {
      ...(c.view ? { view: codeOf(c.view) } : {}),
      ...(c.session ? { sess: String(c.session).slice(0, 40) } : {}),
      ...(st.length ? { steps: st } : {}),
      conn: { ph: codeOf(conn.phase) || 'none', ...(api.rtt ? { rtt: String(api.rtt).slice(0, 16) } : {}), cl: (api.closeLog || []).length, ...(api.lastClose ? { lc: codeOf(api.lastClose.code) } : {}) },
      ...(v.app ? { app: String(v.app).slice(0, 32) } : {}), ...(v.board ? { board: String(v.board).slice(0, 32) } : {}),
      boot: { why: boot.why || null, ...(boot.lite ? { lite: true } : {}), ...(boot.light ? { light: true } : {}) },
      scr: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
      ...extra,
    };
  };
  let flushTimer = null;
  const flush = ({ force = false } = {}) => {
    clearTimeout(flushTimer); flushTimer = null;
    if (!api.ws || api.ws.readyState !== 1) return;
    const lines = buf.drain({ force });
    if (!lines.length) return;
    api.call('web.telemetry', { bootAt, lines }).catch(() => buf.requeue(lines));
  };
  const soon = () => { if (!flushTimer) flushTimer = setTimeout(flush, 1500); };
  const snapNow = (why, extra) => { if (buf.snap(why, ctxOf(extra))) soon(); };
  const bootAt = Date.now();
  window.addEventListener('error', (e) => { buf.note('err', { msg: e && e.message, src: srcOf(e && e.filename, e && e.lineno, e && e.colno) }); soon(); });
  window.addEventListener('unhandledrejection', (e) => { const r = e && e.reason; buf.note('rej', { code: r && r.code, msg: r && (r.message || (typeof r === 'string' ? r : r.name)) }); soon(); });
  api.tap = (ev, d) => {
    if (ev === 'in') buf.addBytes(d.k, d.b);
    else if (ev === 'fail') { if (buf.apiFail(d.m, d.code, d.ms)) snapNow('api', { m: codeOf(d.m) }); }
    else if (ev === 'close') { if (buf.wsClose(d.code) === 'loop') snapNow('wsloop'); }
    else if (ev === 'open') { const ms = buf.wsOpen(); if (ms != null && ms >= WS_DOWN_MS) snapNow('down', { dn: ms }); soon(); }
  };
  setInterval(flush, TELE_FLUSH_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush({ force: true }); });
  window.addEventListener('pagehide', () => flush({ force: true }));
  // 보이는 채 죽은 뒤 다시 열림(가려진 채 죽음은 iOS의 정리라 빼고): 죽은 페이지의 상태(boot 줄과 같은 것)와 함께
  if (boot.crashed && !boot.hidden) snapNow('reload', boot.report ? { prev: boot.report } : {});
  rt = {
    buf, flush, snapNow, soon, layoutNoted: false,
    // 보내기·키 보내기 실패(Phone.jsx). 늘 상황을 함께 남긴다
    sendFail(m, e, { steer = false } = {}) { buf.note('send', { m, code: (e && e.code) || 'error', steer }); snapNow('send', { m: codeOf(m) }); },
  };
  return rt;
}
// 휴대폰 화면이 아니면(기록을 켜지 않았으면) 아무것도 하지 않는다
export const teleSendFail = (m, e, opts) => { if (rt) rt.sendFail(m, e, opts); };
export const phoneTelemetry = () => rt;
