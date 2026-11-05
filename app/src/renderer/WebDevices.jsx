// P48(원격 R2): 설정의 "연결된 기기" 탭과 PC 창의 허락 요청 카드.
// - 탭: 웹 화면 주소, 짝 맺기 코드 만들기(PC 창만), 허락 요청(PC 창만), 짝 맺은 기기(이름, 짝 맺은 때, 마지막 접속, 끊기)
// - 카드: 브라우저가 허락을 청하면 PC 창 위쪽에 뜬다. 확인 번호를 브라우저 화면과 견주고 허락하거나 거절한다
// 백엔드가 device.updated로 바뀐 목록을 보낸다(기기 클라이언트에는 목록만). 기기에서 자기를 끊으면 짝 맺기 화면으로 돌아간다
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { toast } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { isWeb } from './web.js';
import { webLogout } from './lib/passkey.js'; // P56

const when = (t) => (t ? new Date(t).toLocaleString() : '—');

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
          <span>{t('webDevices.request', { name: r.name })}</span>
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
  const revoke = async (d) => {
    try {
      await api.call('device.revoke', { id: d.id });
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
      <RemoteStatus />
      <RemoteRules />
      <h4 className="mt-wdev-h">{t('webDevices.tab')}</h4>
      <div className="mt-wdev-list" data-role="device-list">
        {view && !view.devices.length && <div className="dim">{t('webDevices.none')}</div>}
        {view && view.devices.map((d) => (
          <div key={d.id} className={`mt-wdev-row${d.needsRepair ? ' repair' : ''}`} data-device={d.id} data-needs-repair={d.needsRepair ? '1' : undefined}>
            <span className="mt-wdev-name">{d.name}{me && me.id === d.id ? <span className="mt-wdev-me"> {t('webDevices.thisBrowser')}</span> : null}</span>
            {/* P56: 패스키 전에 토큰으로 짝 맺은 기기는 더 쓸 수 없다. 지우고 다시 짝 맺는다 */}
            {d.needsRepair && <span className="mt-wdev-warn" title={t('webDevices.needsRepairHint')} data-role="needs-repair">{t('webDevices.needsRepair')}</span>}
            <span className="dim">{t('webDevices.paired', { at: when(d.createdAt) })}</span>
            <span className="dim">{t('webDevices.lastSeen', { at: when(d.lastSeenAt) })}</span>
            {d.sessions != null && !d.needsRepair && <span className="dim" data-role="device-sessions">{t('webDevices.sessions', { n: d.sessions })}</span>}
            <button type="button" className="mt-btn small danger" onClick={() => revoke(d)} data-action="device-revoke">{t('webDevices.revoke')}</button>
          </div>
        ))}
      </div>
      {isWeb && <div className="mt-wdev-url"><button type="button" className="mt-btn small ghost" data-action="web-sign-out" onClick={() => webLogout().then(() => location.reload())}>{t('webDevices.signOut')}</button></div>}
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
