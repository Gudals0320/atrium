// P58(원격 강화 S4): PC 창에서 원격 연결을 보고 끊는 데 쓰는 순수 함수(단위 시험 app/test/p58-lib.test.mjs).
// 백엔드 쪽(연결 기록, 새로 붙음 판단, 끊기, 원격 받기)은 backend/src/remote-log.mjs와 web.mjs에 있다.

// 알약에서 끊기·짝 풀기를 보일 클라이언트: 짝 맺은 기기(deviceId)로 붙은 웹 클라이언트
export const isDeviceClient = (c) => !!(c && c.kind === 'web' && c.deviceId);

// remote.connected { kind: 'paired'|'connected', device: { name }, remote, login, browser } → 알림 글 열쇠와 값
export function noticeOf(ev) {
  if (!ev || !ev.device) return null;
  const name = ev.device.name || '?';
  const key = ev.kind === 'paired' ? 'remoteNotice.paired' : ev.remote ? 'remoteNotice.connectedRemote' : 'remoteNotice.connected';
  const detail = [ev.login, ev.browser].filter(Boolean).join(' · ');
  return { key, vars: { name }, detail };
}

// 토스트는 늘, OS 알림은 창이 숨었거나 초점이 없을 때(사람이 창을 보고 있지 않을 때)
export function noticeWay({ visible = true, focused = true } = {}) {
  return { toast: true, os: !visible || !focused };
}

// 연결 기록 한 줄 → 글 열쇠와 값. 까닭은 remoteLog.reason_<코드>가 있으면 그 글, 없으면 코드 그대로(P56·P57이 더하는 까닭)
export const LOG_EVENTS = ['pair.request', 'pair.ok', 'pair.fail', 'connect', 'disconnect', 'deny', 'unpair', 'kick', 'remote.block', 'remote.allow'];
export function logRow(e) {
  const ev = LOG_EVENTS.includes(e && e.event) ? e.event : 'other';
  return {
    key: `remoteLog.ev_${ev.replace('.', '_')}`,
    reason: e && e.reason ? e.reason : null,
    who: [e && e.deviceName, e && e.login, e && e.addr].filter(Boolean).join(' · '),
    browser: (e && e.browser) || null,
    remote: e && e.remote != null ? !!e.remote : null,
    count: e && e.count > 1 ? e.count : null,
    bad: ev === 'deny' || ev === 'pair.fail',
  };
}

// 웹 화면: 백엔드가 원격을 막았는가(연결이 4403으로 닫혔거나 /web/me가 remote_blocked)
export const CLOSE_BLOCKED = 4403;
export const CLOSE_KICKED = 4402;
export const isBlockedClose = (code) => code === CLOSE_BLOCKED || code === 'remote_blocked';
