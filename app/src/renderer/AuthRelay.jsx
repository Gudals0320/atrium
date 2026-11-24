// P359: 설정 › 런처 위의 API 키 칸과 중계기 상태. 런처 "Claude Code (API)"가 쓰는 키를 넣고 지운다.
// 키는 비밀번호 칸으로 받아 relay.setKey로 한 번 보내고 곧바로 칸을 비운다. 판은 키를 OS 보호 저장소로 암호화해 암호문만 두고, 창에는 있음/없음만 돌려준다.
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { toast } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { relayLine, lastErrorKind } from './lib/auth-relay.js';

export function ApiKeyPanel() {
  const t = useT();
  const [st, setSt] = useState(null);
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  useEffect(() => {
    let live = true;
    api.call('relay.status', {}).then((s) => { if (live) setSt(s); }).catch(() => {});
    const off = api.on('relay.status', (s) => { if (live) setSt((p) => ({ ...(p || {}), ...s })); });
    return () => { live = false; if (typeof off === 'function') off(); };
  }, []);
  const save = async () => {
    const k = val; setVal(''); // 보내는 즉시 칸을 비운다(창 상태에 남기지 않는다)
    if (!k.trim()) return;
    setBusy(true);
    try { const r = await api.call('relay.setKey', { key: k }); setSt((p) => ({ ...(p || {}), ...r })); toast(t('authRelay.saved')); }
    catch (e) { toast(t('authRelay.saveFailed', { error: errText(e) }), 'error'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!sure) { setSure(true); return; }
    setSure(false); setBusy(true);
    try { const r = await api.call('relay.removeKey', {}); setSt((p) => ({ ...(p || {}), ...r, running: false })); toast(t('authRelay.removed')); }
    catch (e) { toast(t('authRelay.saveFailed', { error: errText(e) }), 'error'); }
    finally { setBusy(false); }
  };
  const line = relayLine(st);
  const errKind = lastErrorKind(st);
  return (
    <div className="mt-apikey" data-role="api-key-panel">
      <div className="mt-apikey-head">
        <span className="mt-apikey-title">{t('authRelay.title')}</span>
        <span className="mt-api-tag" title={t('authRelay.tagTitle')}>API</span>
        <span className="mt-apikey-state" data-role="api-key-state" data-present={st && st.keyPresent ? '1' : '0'}>{st && st.keyPresent ? t('authRelay.keySaved') : t('authRelay.keyNone')}</span>
      </div>
      <div className="mt-apikey-row">
        {st && st.keyPresent
          ? <button className={`mt-btn small danger${sure ? ' armed' : ''}`} data-role="api-key-remove" disabled={busy} onClick={remove}>{sure ? t('authRelay.removeSure') : t('authRelay.remove')}</button>
          : <>
              <input type="password" className="mt-apikey-input" data-role="api-key-input" autoComplete="off" spellCheck={false} placeholder={t('authRelay.placeholder')} value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
              <button className="mt-btn small primary" data-role="api-key-save" disabled={busy || !val.trim()} onClick={save}>{t('authRelay.save')}</button>
            </>}
        <span className="mt-apikey-relay dim" data-role="relay-status">{t(line.key, line.vars)}{errKind ? ` · ${t('authRelay.lastError', { kind: errKind })}` : ''}</span>
      </div>
      <div className="mt-apikey-note dim">{t('authRelay.note')}</div>
    </div>
  );
}

// 작은 "API" 표시(노드·맵 카드·런처 목록)
export function ApiTag({ className = '' }) {
  const t = useT();
  return <span className={`mt-api-tag ${className}`} data-role="api-tag" title={t('authRelay.tagTitle')}>API</span>;
}
