// P49(원격 R3): 웹 화면 위쪽의 "다시 연결 중" 띠와 구석의 왕복 지연(ms).
// 연결 상태는 api.js(lib/reconnect.js)가 $conn으로, 지연은 $rtt로 알린다. PC 창에는 띄우지 않는다(연결 알약이 있다)
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useT } from './lib/i18n.js';
import { showBanner } from './lib/reconnect.js';

export function RemoteBar() {
  const t = useT();
  const [conn, setConn] = useState(api.conn);
  const [rtt, setRtt] = useState(api.rtt);
  useEffect(() => {
    const a = api.on('$conn', (c) => setConn({ ...c }));
    const b = api.on('$rtt', (r) => setRtt(r.rtt));
    const c = api.on('$close', () => setRtt(null));
    return () => { a(); b(); c(); };
  }, []);
  return (
    <>
      {conn.phase === 'blocked' && ( // P58: PC에서 원격 받기를 껐다. 백오프로 계속 다시 붙어 보고, 켜지면 저절로 돌아온다
        <div className="mt-blocked" role="alert" data-role="remote-blocked">
          <div className="mt-blocked-card">
            <h3>{t('remoteAccess.blockedTitle')}</h3>
            <p>{t('remoteAccess.blockedBody')}</p>
            <button type="button" className="mt-btn small" data-action="reconnect-now" onClick={() => api.wake()}>{t('remote.retryNow')}</button>
          </div>
        </div>
      )}
      {showBanner(conn) && (
        <div className="mt-reconnect" role="status" data-role="reconnect-banner" data-close={conn.lastClose ?? ''}>
          <span className="mt-reconnect-dot" />
          <span>{conn.lastClose === 4402 ? t('remoteAccess.kicked') : t('remote.reconnecting')}</span>
          <button type="button" className="mt-btn small ghost" data-action="reconnect-now" onClick={() => api.wake()}>{t('remote.retryNow')}</button>
        </div>
      )}
      {rtt != null && conn.phase === 'open' && <div className="mt-rtt" title={t('remote.rttTitle')} data-role="rtt">{t('remote.rtt', { ms: rtt })}</div>}
    </>
  );
}
