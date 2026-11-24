// P352: 휴대폰 화면의 이상 동작 기록(창 app/src/renderer/lib/phone-telemetry.js가 web.telemetry로 보낸다). 연결 기록(remote-log.jsonl)의 tele 줄.
// - teleInfo: 받는 필드만 고른다(종류, 메서드·이벤트 이름, 오류 코드, 걸린 ms, 횟수, 다듬은 오류 글, 스크립트 자리, 상황 기록의 화면·세션 이름·단계·받은 크기·연결·버전·부팅 판단).
//   대화 글·경로·토큰이 들어갈 자리가 없다. 줄 하나 TELE_LINE_MAX 바이트를 넘으면 큰 것부터 버린다
// - errorSummary: `atrium remote errors`(remote.errors)가 보이는 요약. 오류를 종류·메서드·코드·글로 묶어 횟수·기기·처음·마지막과 가장 가까운 상황 기록(snap)을 붙인다.
//   부팅 줄(boot)의 판단 까닭(why)과 가볍게 열린 수, 메서드별 받은 크기(기기의 마지막 bytes 줄)도 함께
// - formatErrors: CLI의 짧은 표(한국어)
import { crashInfo, stepsInfo, stepsLabel, crashLabel } from './web-crash.mjs';

export const TELE_KINDS = ['err', 'rej', 'api', 'send', 'ws', 'bytes', 'snap', 'cap'];
export const ERROR_KINDS = ['err', 'rej', 'api', 'send', 'ws'];
export const TELE_LINE_MAX = 2048;
export const TELE_BATCH_MAX = 50; // 한 번에 받는 줄
export const TELE_BOOT_MAX = 200; // 부팅마다 받는 줄
export const SNAP_NEAR_MS = 3 * 60_000; // 오류 묶음에 붙일 상황 기록을 찾는 범위
const CODE = /^[A-Za-z0-9_.:$-]{1,48}$/;
const code = (v) => (v == null || v === '' ? null : CODE.test(String(v)) ? String(v) : 'other');
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const int = (v, max) => (Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), max) : null);
const ver = (v) => (typeof v === 'string' && /^[0-9A-Za-z.+-]{1,32}$/.test(v) ? v : null);

function bytesOf(b) {
  if (!b || typeof b !== 'object') return null;
  const o = {};
  for (const [k, v] of Object.entries(b).slice(0, 16)) { const c = code(k); const n = int(v, 1e13); if (c && n != null) o[c] = n; }
  return Object.keys(o).length ? o : null;
}
export function teleInfo(x) {
  if (!x || typeof x !== 'object' || !TELE_KINDS.includes(x.k)) return null;
  const o = { k: x.k };
  for (const f of ['m', 'code', 'why', 'view']) { const c = code(x[f]); if (c) o[f] = c; }
  for (const [f, max] of [['n', 1e9], ['ms', 864e5 * 30], ['at', 1e14], ['last', 1e14], ['dn', 864e5 * 30]]) { const v = int(x[f], max); if (v != null) o[f] = v; }
  if (x.msg) o.msg = clip(x.msg, 200);
  if (typeof x.src === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(x.src)) o.src = x.src;
  if (x.steer === true) o.steer = true;
  if (x.sess) o.sess = clip(x.sess, 40);
  const steps = stepsInfo(x.steps); if (steps) o.steps = steps.slice(-8);
  const bytes = bytesOf(x.bytes); if (bytes) o.bytes = bytes;
  if (x.conn && typeof x.conn === 'object') {
    const c = { ph: code(x.conn.ph) || 'none' };
    if (typeof x.conn.rtt === 'string' && /^[0-9A-Za-z .~<>=-]{1,16}$/.test(x.conn.rtt)) c.rtt = x.conn.rtt;
    const cl = int(x.conn.cl, 1e6); if (cl != null) c.cl = cl;
    const lc = code(x.conn.lc); if (lc) c.lc = lc;
    o.conn = c;
  }
  const app = ver(x.app); if (app) o.app = app;
  const board = ver(x.board); if (board) o.board = board;
  if (x.boot && typeof x.boot === 'object') { const b = {}; const w = code(x.boot.why); if (w) b.why = w; if (x.boot.lite === true) b.lite = true; if (x.boot.light === true) b.light = true; if (Object.keys(b).length) o.boot = b; }
  if (x.scr && typeof x.scr === 'object') { const s = {}; for (const f of ['w', 'h']) { const v = int(x.scr[f], 1e5); if (v != null) s[f] = v; } if (Number.isFinite(x.scr.dpr) && x.scr.dpr > 0 && x.scr.dpr <= 10) s.dpr = Math.round(x.scr.dpr * 100) / 100; if (Object.keys(s).length) o.scr = s; }
  if (Array.isArray(x.errs)) { const e = x.errs.slice(0, 5).map((v) => clip(v, 100)).filter(Boolean); if (e.length) o.errs = e; }
  const prev = crashInfo(x.prev); if (prev) o.prev = prev;
  // 상한: 큰 것부터 버린다
  for (const f of ['errs', 'prev', 'steps', 'bytes']) { if (JSON.stringify(o).length <= TELE_LINE_MAX) break; delete o[f]; }
  if (JSON.stringify(o).length > TELE_LINE_MAX) return null;
  return o;
}
// 오류 묶음 열쇠와 사람이 읽는 이름
export const teleKey = (t) => [t.k, t.m || '', t.code || '', t.msg || '', t.src || ''].join('|');
const KIND_TEXT = { err: '화면 오류', rej: '처리 안 된 거부', api: 'API 실패', send: '보내기 실패', ws: '다시 연결', bytes: '받은 크기', snap: '상황 기록', cap: '기록 상한' };
export const kindText = (k) => KIND_TEXT[k] || k;
const SNAP_TEXT = { reload: '보이는 채 닫힌 뒤 다시 열림', api: '같은 API 반복 실패', send: '보내기 실패', wsloop: '다시 연결 반복', down: '오래 끊겼다가 다시 연결' };
export const snapText = (w) => SNAP_TEXT[w] || w || '';

// entries: 연결 기록(오래된 것부터, RemoteLog.entries). since: 이 시각 뒤만
export function errorSummary(entries, { since = 0, limit = 20 } = {}) {
  const list = (entries || []).filter((e) => (e.lastAt || e.at) >= since);
  const tele = list.filter((e) => e.event === 'tele' && e.tele);
  const snaps = tele.filter((e) => e.tele.k === 'snap');
  const groups = new Map();
  for (const e of tele) {
    const t = e.tele;
    if (!ERROR_KINDS.includes(t.k)) continue;
    const key = teleKey(t);
    let g = groups.get(key);
    if (!g) { g = { k: t.k, m: t.m || null, code: t.code || null, msg: t.msg || null, src: t.src || null, count: 0, devices: new Set(), first: e.at, last: e.at, lastDevice: null }; groups.set(key, g); }
    g.count += t.n || 1;
    g.devices.add(e.deviceName || e.deviceId || '?');
    g.first = Math.min(g.first, t.at || e.at);
    const last = t.last || t.at || e.at;
    if (last >= g.last) { g.last = last; g.lastDevice = e.deviceId || null; }
  }
  const near = (g) => {
    let best = null, bd = Infinity;
    for (const s of snaps) {
      if (g.lastDevice && s.deviceId && s.deviceId !== g.lastDevice) continue;
      const d = Math.abs((s.tele.at || s.at) - g.last);
      if (d <= SNAP_NEAR_MS && d < bd) { best = s; bd = d; }
    }
    return best ? { at: best.tele.at || best.at, ...best.tele } : null;
  };
  const out = [...groups.values()].sort((a, b) => b.last - a.last).slice(0, limit).map((g) => ({ ...g, devices: [...g.devices], ctx: near(g) }));
  const boots = list.filter((e) => e.event === 'boot');
  const why = {};
  for (const b of boots) { const w = b.why || 'old'; why[w] = (why[w] || 0) + 1; }
  const bytes = {};
  for (const e of tele) if (e.tele.k === 'bytes' && e.tele.bytes) bytes[e.deviceName || e.deviceId || '?'] = { at: e.at, bytes: e.tele.bytes };
  return {
    since, groups: out,
    snaps: snaps.slice(-limit).reverse().map((s) => ({ at: s.tele.at || s.at, device: s.deviceName || null, ...s.tele })),
    boots: { n: boots.length, lite: boots.filter((b) => b.lite === true).length, why },
    bytes,
  };
}

const p2 = (n) => String(n).padStart(2, '0');
const when = (t) => { const d = new Date(t); return `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; };
const kb = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)}M` : b >= 1000 ? `${Math.round(b / 1000)}K` : `${b}B`);
export const bytesLabel = (b) => Object.entries(b || {}).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => `${k} ${kb(v)}`).join(', ');
export function ctxLabel(c) {
  if (!c) return '';
  const p = [];
  if (c.why) p.push(snapText(c.why));
  if (c.view) p.push(`화면 ${c.view}`);
  if (c.sess) p.push(`세션 ${c.sess}`);
  if (c.conn) p.push(`연결 ${c.conn.ph}${c.conn.rtt ? ` ${c.conn.rtt}` : ''}${c.conn.cl ? ` 끊김 ${c.conn.cl}번` : ''}${c.conn.lc ? ` 마지막 ${c.conn.lc}` : ''}`);
  if (c.dn != null) p.push(`끊겨 있던 ${Math.round(c.dn / 1000)}s`);
  if (c.boot && c.boot.why) p.push(`부팅 ${c.boot.why}${c.boot.lite ? ' 가볍게' : ''}`);
  if (c.app || c.board) p.push(`버전 ${c.app || '?'}/${c.board || '?'}`);
  if (c.scr) p.push(`${c.scr.w}x${c.scr.h}@${c.scr.dpr}`);
  return p.join(' · ');
}
// CLI 표
export function formatErrors(s, { sinceText = '' } = {}) {
  const L = [];
  L.push(`휴대폰 이상 동작${sinceText ? ` (${sinceText})` : ''}: 묶음 ${s.groups.length}개, 상황 기록 ${s.snaps.length}개, 다시 열림 ${s.boots.n}번(가볍게 ${s.boots.lite}번)`);
  const why = Object.entries(s.boots.why).map(([k, v]) => `${k} ${v}`).join(', ');
  if (why) L.push(`  다시 열림 까닭: ${why}`);
  if (!s.groups.length) L.push('  오류·실패 없음');
  for (const g of s.groups) {
    const head = [kindText(g.k), g.m, g.code, g.msg ? `"${g.msg}"` : null, g.src].filter(Boolean).join(' ');
    L.push(`- ${head}  ×${g.count}  ${when(g.first)}~${when(g.last)}  ${g.devices.join(', ')}`);
    if (g.ctx) {
      L.push(`    상황: ${ctxLabel(g.ctx)}`);
      if (g.ctx.steps) L.push(`    단계: ${stepsLabel(g.ctx.steps)}`);
      if (g.ctx.bytes) L.push(`    받은 크기: ${bytesLabel(g.ctx.bytes)}`);
      if (g.ctx.prev) L.push(`    닫히기 전: ${crashLabel(g.ctx.prev)}`);
    }
  }
  const snapOnly = s.snaps.filter((x) => !s.groups.some((g) => g.ctx && g.ctx.at === x.at));
  if (snapOnly.length) {
    L.push('상황 기록(오류 묶음에 붙지 않은 것):');
    for (const x of snapOnly.slice(0, 8)) {
      L.push(`- ${when(x.at)} ${x.device || ''} ${ctxLabel(x)}`);
      if (x.prev) L.push(`    닫히기 전: ${crashLabel(x.prev)}${x.prev.steps ? ` · 단계 ${stepsLabel(x.prev.steps)}` : ''}`);
      if (x.bytes) L.push(`    받은 크기: ${bytesLabel(x.bytes)}`);
    }
  }
  for (const [dev, b] of Object.entries(s.bytes)) L.push(`받은 크기(${dev}, ${when(b.at)}까지): ${bytesLabel(b.bytes)}`);
  return L.join('\n');
}
// --since 1d, 6h, 30m → ms
export function sinceMs(v, dflt = 864e5) {
  const m = /^(\d+(?:\.\d+)?)\s*([smhdw]?)$/i.exec(String(v == null ? '' : v).trim());
  if (!m) return dflt;
  const u = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5, '': 864e5 }[m[2].toLowerCase()];
  return Math.round(Number(m[1]) * u);
}
