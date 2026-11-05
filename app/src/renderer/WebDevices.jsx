// P48(원격 R2): 설정의 "연결된 기기" 탭과 PC 창의 허락 요청 카드.
// - 탭: 웹 화면 주소, 짝 맺기 코드 만들기(PC 창만), 허락 요청(PC 창만), 짝 맺은 기기(이름, 짝 맺은 때, 마지막 접속, 끊기)
// - 카드: 브라우저가 허락을 청하면 PC 창 위쪽에 뜬다. 확인 번호를 브라우저 화면과 견주고 허락하거나 거절한다
// 백엔드가 device.updated로 바뀐 목록을 보낸다(기기 클라이언트에는 목록만). 기기에서 자기를 끊으면 짝 맺기 화면으로 돌아간다
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { toast } from './store.js';
import { useT, errText, tOr } from './lib/i18n.js';
import { isWeb } from './web.js';
import { webLogout } from './lib/passkey.js'; // P56
import { logRow, reasonKeys } from './lib/remote.js'; // P58

const when = (t) => (t ? new Date(t).toLocaleString() : '—');
// P57: Tailscale 기기에 묶이지 않은 옛 바깥 기기(backend tailscale.mjs needsRepair와 같은 규칙)
export const needsRepair = (d) => !!d && !(d.tsNode && d.tsNode.id) && d.origin !== 'local';

function useDevices() {
  const [view, setView] = useState(null);
  useEffect(() => {
    let live = true;
    const load = () => api.call('device.list').then((v) => live && setView(v)).catch(() => {});
    load();
    const off1 = api.on('device.updated', (v) => setView((prev) => ({ ...(prev || {}), ...v })));
    const off2 = api.on('$open', load);
    return () => { live = false; off1(); off2(); };
  }, []);
  return view;
}
function useNow(ms, on) { const [n, set] = useState(Date.now()); useEffect(() => { if (!on) return; const id = setInterval(() => set(Date.now()), ms); return () => clearInterval(id); }, [ms, on]); return n; }

async function decide(id, allow, t) {
  try { await api.call(allow ? 'device.approve' : 'device.deny', { id }); toast(allow ? t('webDevices.allowed') : t('webDevices.denied')); } catch (e) { toast(t('webDevices.failed', { error: errText(e) }), 'error'); }
}

function Requests({ requests }) {
  const t = useT();
  if (!requests || !requests.length) return null;
  return (
    <div className="mt-wdev-reqs" data-role="device-requests">
      {requests.map((r) => (
        <div key={r.id} className="mt-wdev-req" data-request={r.id}>
          {/* P57: Tailscale이 확인한 기기 이름을 크게, 브라우저가 보낸 이름은 별칭으로 작게 */}
          <span className="mt-wdev-who">
            <span data-role="request-node">{t('webDevices.request', { name: r.tsNode ? r.tsNode.name : r.name })}</span>
            <span className="mt-wdev-sub dim" data-role="request-alias">{r.tsNode ? [t('webDevices.alias', { name: r.name }), r.tsNode.login && t('webDevices.tsLogin', { login: r.tsNode.login })].filter(Boolean).join(' · ') : t('webDevices.requestLocal')}</span>
          </span>
          <span className="mt-wdev-check" data-role="request-check">{r.check}</span>
          <button type="button" className="mt-btn small primary" onClick={() => decide(r.id, true, t)} data-action="device-allow">{t('webDevices.allow')}</button>
          <button type="button" className="mt-btn small ghost" onClick={() => decide(r.id, false, t)} data-action="device-deny">{t('webDevices.deny')}</button>
        </div>
      ))}
    </div>
  );
}

export function DevicesTab() {
  const t = useT();
  const view = useDevices();
  const [web, setWeb] = useState(null);
  const now = useNow(1000, !!(view && view.code));
  useEffect(() => { api.call('web.status').then(setWeb).catch(() => {}); }, []);
  const code = view && view.code && view.code.expiresAt > now ? view.code : null;
  const me = view && view.me;
  // P59: 웹 화면(기기)은 자기 짝만 풀 수 있다(device.forget). 다른 기기를 풀고 이름을 바꾸는 것은 이 PC만(device.revoke)
  const revoke = async (d) => {
    try {
      await api.call(isWeb ? 'device.forget' : 'device.revoke', isWeb ? {} : { id: d.id });
      toast(t('webDevices.revoked', { name: d.name }));
    } catch (e) { toast(t('webDevices.failed', { error: errText(e) }), 'error'); }
  };
  return (
    <div className="mt-wdev" data-role="devices-tab">
      <p className="mt-set-note">{t('webDevices.note')}</p>
      {web && <div className="mt-wdev-url">{t('webDevices.url')} <code data-role="web-url">{web.url}</code>{!web.built && <span className="mt-wdev-warn"> {t('webDevices.notBuilt')}</span>}</div>}
      {!isWeb && (
        <div className="mt-wdev-code" data-role="device-code">
          {code ? (
            <>
              <span className="mt-wdev-codebig" data-role="pair-code">{code.code}</span>
              <span className="dim">{t('webDevices.codeLeft', { s: Math.max(0, Math.ceil((code.expiresAt - now) / 1000)) })}</span>
              <button type="button" className="mt-btn small ghost" onClick={() => api.call('device.cancelCode').catch(() => {})}>{t('common.cancel')}</button>
            </>
          ) : (
            <button type="button" className="mt-btn" data-action="device-new-code" onClick={() => api.call('device.code').catch((e) => toast(t('webDevices.failed', { error: errText(e) }), 'error'))}>{t('webDevices.newCode')}</button>
          )}
          <span className="mt-set-hint">{t('webDevices.codeHint')}</span>
        </div>
      )}
      {!isWeb && view && <Requests requests={view.requests} />}
      <RemoteAccess />
      <RemoteStatus />
      <RemoteRules />
      <h4 className="mt-wdev-h">{t('webDevices.tab')}</h4>
      <div className="mt-wdev-list" data-role="device-list">
        {view && !view.devices.length && <div className="dim">{t('webDevices.none')}</div>}
        {view && view.devices.map((d) => (
          <div key={d.id} className={`mt-wdev-row${d.needsRepair ? ' repair' : ''}`} data-device={d.id} data-needs-repair={d.needsRepair ? '1' : undefined}>
            <span className="mt-wdev-who">
              <span className="mt-wdev-name" data-role="device-node">{d.tsNode ? d.tsNode.name || d.name : d.name}{me && me.id === d.id ? <span className="mt-wdev-me"> {t('webDevices.thisBrowser')}</span> : null}</span>
              {/* P56: 패스키 전에 토큰으로 짝 맺은 기기, P57: Tailscale 기기에 묶이지 않은 기기는 더 쓸 수 없다. 지우고 다시 짝 맺는다.
                  P57: Tailscale 기기에 묶인 기기는 브라우저 이름을 별칭으로, 이 PC 안 기기는 그렇게 적는다 */}
              {d.needsRepair || needsRepair(d)
                ? <span className="mt-wdev-sub mt-wdev-warn warn" title={t('webDevices.needsRepairHint')} data-role="needs-repair" data-bind="repair">{t('webDevices.needsRepair')}</span>
                : <span className="mt-wdev-sub dim" data-role="device-bind" data-bind={d.tsNode ? 'tailscale' : 'local'}>{d.tsNode ? t('webDevices.alias', { name: d.name }) : t('webDevices.localOnly')}</span>}
            </span>
            <span className="dim">{t('webDevices.paired', { at: when(d.createdAt) })}</span>
            <span className="dim">{t('webDevices.lastSeen', { at: when(d.lastSeenAt) })}</span>
            {d.sessions != null && !d.needsRepair && <span className="dim" data-role="device-sessions">{t('webDevices.sessions', { n: d.sessions })}</span>}
            <button type="button" className="mt-btn small danger" onClick={() => revoke(d)} data-action="device-revoke">{t('webDevices.revoke')}</button>
          </div>
        ))}
      </div>
      {isWeb && <div className="mt-wdev-url"><button type="button" className="mt-btn small ghost" data-action="web-sign-out" onClick={() => webLogout().then(() => location.reload())}>{t('webDevices.signOut')}</button></div>}
      {!isWeb && <RemoteLog />}
    </div>
  );
}

// P58(S4): 원격 받기 스위치(판 설정 remoteAccess). 끄면 짝 맺은 기기와 Tailscale로 온 요청을 모두 거부하고 붙은 원격 연결을 닫는다. 이 PC의 창에서만 바꾼다
function RemoteAccess() {
  const t = useT();
  const [s, setS] = useState(null);
  useEffect(() => { api.call('settings.get').then((r) => setS(r.settings)).catch(() => {}); const off = api.on('settings.updated', (v) => setS(v)); return off; }, []);
  if (!s || !('remoteAccess' in s)) return null;
  const on = s.remoteAccess !== false;
  const set = (v) => api.call('settings.set', { remoteAccess: v }).then((r) => toast(v ? t('remoteAccess.allowed') : t('remoteAccess.blocked', { n: (r.remote && r.remote.closed) || 0 }))).catch((e) => toast(t('webDevices.failed', { error: errText(e) }), 'error'));
  return (
    <div className={`mt-remote-access${on ? '' : ' off'}`} data-role="remote-access" data-on={on ? '1' : '0'}>
      <label className="mt-remote-row">
        <input type="checkbox" checked={on} disabled={isWeb} data-field="remoteAccess" onChange={(e) => set(e.target.checked)} />
        <b>{t('remoteAccess.label')}</b>
      </label>
      <span className="mt-set-hint">{on ? t('remoteAccess.onHint') : t('remoteAccess.offHint')}</span>
    </div>
  );
}

// P58(S4): 연결 기록(최근 것부터). 짝 맺기, 연결·끊김, 거부와 까닭, 짝 풀기, 원격 받기 끄기·켜기. 새 줄은 remote.logged로 따라온다
function RemoteLog() {
  const t = useT();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let live = true;
    const load = () => api.call('remote.log', { limit: 100 }).then((r) => live && setRows(r.entries)).catch(() => {});
    load();
    let timer = null;
    const off1 = api.on('remote.logged', () => { clearTimeout(timer); timer = setTimeout(load, 300); }); // 합친 줄(count)도 다시 읽어 맞춘다
    const off2 = api.on('$open', load);
    return () => { live = false; clearTimeout(timer); off1(); off2(); };
  }, []);
  if (!rows) return null;
  // P59: 'tailscale_node:other_node'처럼 앞말이 있는 까닭은 통째 글, 없으면 앞말 글과 뒤 코드(P56 passkey:<코드>, P57 tailscale_node:<까닭>)
  const reasonText = (r) => { const k = reasonKeys(r); return tOr(k.full, k.prefix ? `${tOr(k.prefix, r.split(':')[0])}: ${tOr(`remoteLog.reason_${k.rest}`, k.rest)}` : r); };
  return (
    <div className="mt-remote-log" data-role="remote-log">
      <h4 className="mt-wdev-h">{t('remoteLog.title')}</h4>
      <span className="mt-set-hint">{t('remoteLog.hint')}</span>
      {!rows.length && <div className="dim">{t('remoteLog.none')}</div>}
      <div className="mt-remote-log-list">
        {rows.map((e, i) => {
          const r = logRow(e);
          return (
            <div key={`${e.at}-${i}`} className={`mt-remote-log-row${r.bad ? ' bad' : ''}`} data-event={e.event} data-reason={e.reason || ''}>
              <span className="dim mono">{new Date(e.at).toLocaleString()}</span>
              <span className="mt-remote-log-ev">{t(r.key)}{r.reason ? ` · ${reasonText(r.reason)}` : ''}{r.count ? ` ×${r.count}` : ''}</span>
              <span className="mt-remote-log-who">{r.who || ''}{r.remote === true ? ` · ${t('peers.remote')}` : r.remote === false ? ` · ${t('remoteLog.local')}` : ''}{r.browser ? ` · ${r.browser}` : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// P49(원격 R3): Tailscale 진단과 노트북에서 열 주소(atrium remote status와 같은 값, 백엔드 remote.status). 읽기만 한다
const CHECK_VARS = (c) => ({ ...c.vars, version: c.vars && c.vars.version ? ` (${c.vars.version})` : '', state: c.vars && c.vars.state ? ` (${c.vars.state})` : '' });
function RemoteStatus() {
  const t = useT();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = (fresh) => { setBusy(true); api.call('remote.status', { fresh }).then(setD).catch(() => {}).finally(() => setBusy(false)); };
  useEffect(() => { load(true); }, []);
  if (!d) return null;
  return (
    <div className="mt-remote" data-role="remote-status">
      <div className="mt-remote-head">
        <h4 className="mt-wdev-h">{t('remote.title')}</h4>
        <span className={`mt-remote-badge${d.ready ? ' ok' : ''}`} data-role="remote-ready">{t(d.ready ? 'remote.ready' : 'remote.notReady')}</span>
        <button type="button" className="mt-btn small ghost" disabled={busy} onClick={() => load(true)} data-action="remote-refresh">{t('remote.refresh')}</button>
      </div>
      <p className="mt-set-note">{t('remote.note')}</p>
      {d.url && <div className="mt-wdev-url">{t('remote.laptopUrl')} <code data-role="remote-url">{d.url}</code></div>}
      {d.enable && <div className="mt-wdev-url">{t('remote.enableCmd', { cmd: '' })}<code data-role="remote-enable">{d.enable}</code></div>}
      <ul className="mt-remote-checks">
        {d.checks.map((c) => (
          <li key={c.id} className={`lv-${c.level}`} data-check={c.id} data-level={c.level}>
            <span className="mt-remote-mark" />
            {t(`remote.check_${c.id}_${c.level}`, CHECK_VARS(c))}
          </li>
        ))}
      </ul>
    </div>
  );
}
// 로그인 사용자 제한(판 설정 remoteSameUser, remoteAllowedLogins). 이 PC의 창에서만 바꾼다
function RemoteRules() {
  const t = useT();
  const [s, setS] = useState(null);
  const [allowed, setAllowed] = useState(null);
  useEffect(() => { api.call('settings.get').then((r) => setS(r.settings)).catch(() => {}); const off = api.on('settings.updated', (v) => setS(v)); return off; }, []);
  if (!s || !('remoteSameUser' in s)) return null;
  const set = (patch) => api.call('settings.set', patch).then(() => toast(t('remote.saved'))).catch((e) => toast(t('webDevices.failed', { error: errText(e) }), 'error'));
  return (
    <div className="mt-remote-rules" data-role="remote-rules">
      <label className="mt-remote-row">
        <input type="checkbox" checked={s.remoteSameUser !== false} disabled={isWeb} data-field="remoteSameUser" onChange={(e) => set({ remoteSameUser: e.target.checked })} />
        <span>{t('remote.sameUser')}</span>
      </label>
      <span className="mt-set-hint">{t('remote.sameUserHint')}</span>
      <div className="mt-remote-row">
        <input type="text" className="mt-set-text" spellCheck={false} disabled={isWeb} data-field="remoteAllowedLogins" placeholder={t('remote.allowed')} value={allowed ?? s.remoteAllowedLogins ?? ''} onChange={(e) => setAllowed(e.target.value)} />
        <button type="button" className="mt-btn small" disabled={isWeb || allowed == null} onClick={() => set({ remoteAllowedLogins: allowed }).then(() => setAllowed(null))}>{t('remote.save')}</button>
      </div>
      {/* P56: 웹 화면 세션의 수명(로그인 뒤 몇 시간, 연결이 끊긴 채 몇 분) */}
      <SessionLimit field="remoteSessionHours" label={t('remote.sessionHours')} s={s} set={set} min={1} max={168} />
      <SessionLimit field="remoteIdleMinutes" label={t('remote.idleMinutes')} s={s} set={set} min={5} max={1440} />
      <span className="mt-set-hint">{t('remote.sessionHint')}</span>
      {isWeb && <span className="mt-set-hint">{t('remote.onlyPc')}</span>}
    </div>
  );
}
function SessionLimit({ field, label, s, set, min, max }) {
  const t = useT();
  const [v, setV] = useState(null);
  if (!(field in s)) return null;
  const val = v ?? String(s[field]);
  const ok = /^\d+$/.test(val) && Number(val) >= min && Number(val) <= max;
  return (
    <div className="mt-remote-row">
      <span>{label}</span>
      <input type="number" className="mt-set-text" min={min} max={max} disabled={isWeb} data-field={field} value={val} onChange={(e) => setV(e.target.value)} style={{ width: 90 }} />
      {v != null && <button type="button" className="mt-btn small" disabled={isWeb || !ok} onClick={() => set({ [field]: Number(val) }).then(() => setV(null))} data-action={`save-${field}`}>{t('remote.save')}</button>}
    </div>
  );
}

// PC 창 위쪽의 허락 요청 카드(웹 화면에는 없다)
export function PairRequestBanner() {
  const view = useDevices();
  if (isWeb || !view || !view.requests || !view.requests.length) return null;
  return <div className="mt-wdev-banner" data-role="pair-request-banner"><Requests requests={view.requests} /></div>;
}
