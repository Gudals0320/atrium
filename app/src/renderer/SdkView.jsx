// P363: SDK 세션(claude -p, 터미널 없음)의 가까이 얼굴. 대화 보기(ChatView: 대화 기록) 아래 입력칸·멈추기·프로세스 상태 줄.
// 보내기는 판의 session.send(대기열, 스티어링을 고르면 지금 턴에)라 명령줄·휴대폰 보내기와 같은 길이다
import { useState } from 'react';
import { api } from './api.js';
import { toast } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { ChatView } from './ChatView.jsx';
import { sdkDraft } from './lib/auth-relay.js';

export function SdkInput({ s, compact = false }) {
  const t = useT();
  const [val, setVal] = useState('');
  const [steer, setSteer] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const text = sdkDraft(val);
    if (!text || busy) return;
    setBusy(true);
    try { await api.call('session.send', { target: [s.address || s.name], text, ...(steer && s.state === 'working' ? { steer: true } : {}), source: 'bar' }); setVal(''); }
    catch (e) { toast(t('sdkSession.sendFailed', { error: errText(e) }), 'error'); }
    finally { setBusy(false); }
  };
  const stop = async () => { try { await api.call('session.sdkStop', { session: s.sessionId }); } catch (e) { toast(errText(e), 'error'); } };
  const alive = !!(s.sdk && s.sdk.alive);
  return (
    <div className={`mt-sdk-input nodrag${compact ? ' compact' : ''}`} data-role="sdk-input" onMouseDown={(e) => e.stopPropagation()}>
      <textarea className="mt-sdk-text" data-role="sdk-text" rows={compact ? 1 : 2} value={val} placeholder={t('sdkSession.placeholder')} spellCheck={false}
        onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
      <div className="mt-sdk-bar">
        <span className={`mt-sdk-proc dim${alive ? ' on' : ''}`} data-role="sdk-proc" data-alive={alive ? '1' : '0'}>{alive ? t('sdkSession.alive') : t('sdkSession.idle')}</span>
        {s.state === 'working' && <label className="mt-check" title={t('sdkSession.steerTitle')}><input type="checkbox" data-role="sdk-steer" checked={steer} onChange={(e) => setSteer(e.target.checked)} />{t('sdkSession.steer')}</label>}
        {alive && <button className="mt-btn small" data-action="sdk-stop" title={t('sdkSession.stopTitle')} onClick={stop}>{t('sdkSession.stop')}</button>}
        <button className="mt-btn small primary" data-action="sdk-send" disabled={busy || !sdkDraft(val)} onClick={send}>{t('sdkSession.send')}</button>
      </div>
    </div>
  );
}

export function SdkFace({ s }) {
  return (
    <div className="mt-sdk-face" data-role="sdk-face">
      <div className="mt-sdk-chat"><ChatView s={s} /></div>
      {s.state === 'error' && s.error && s.error.message ? <div className="mt-sdk-err" data-role="sdk-error" data-type={s.error.type || ''}>{String(s.error.message).slice(0, 300)}</div> : null}
      <SdkInput s={s} />
    </div>
  );
}
