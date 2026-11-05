// P48(원격 R2): 웹 화면의 짝 맺기. 로그인하지 않은 브라우저는 보드를 보지 못하고 이 화면만 본다.
// PC 보드(설정 > 연결된 기기)에서 만든 6자리 코드를 넣거나, PC에 허락을 청하고 PC 창에서 "허락"을 누르면 짝을 맺는다.
// P56(원격 S2·S3): 짝을 맺으면 기기 토큰 대신 몇 분짜리 등록 허가를 받고, 이 브라우저에서 패스키(Windows Hello 등)를 만들어야 기기가 생긴다.
//   세션이 끝나면(12시간, 연결이 끊긴 채 30분, 4401) "다시 확인" 화면에서 패스키로 다시 확인한다. 짝이 풀렸으면 짝 맺기 화면으로 간다.
//   패스키를 쓸 수 없는 브라우저(보안 출처가 아님, WebAuthn 없음, IP 주소)는 이유를 보이고 막는다. 토큰으로 되돌아가는 길은 없다.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useT, setLanguage } from './lib/i18n.js';
import { webMe, markPaired } from './web.js';
import { BRAND_WORDMARK } from './lib/icons.jsx';
import { passkeySupport, savedPasskey, clearPasskey, registerPasskey, loginPasskey, webauthnError } from './lib/passkey.js';

// 기본 기기 이름: 브라우저와 OS
export function guessDeviceName(ua = navigator.userAgent) {
  const b = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${b} · ${os}` : b;
}

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
  let j = null; try { j = await r.json(); } catch {}
  if (!r.ok) throw Object.assign(new Error((j && j.error && j.error.message) || String(r.status)), { code: j && j.error && j.error.code, status: r.status, retryAfterMs: j && j.error && j.error.retryAfterMs });
  return j;
}
function useNow(on) { const [n, set] = useState(Date.now()); useEffect(() => { if (!on) return; const id = setInterval(() => set(Date.now()), 1000); return () => clearInterval(id); }, [on]); return n; }

// 패스키·서버 오류를 화면 글로
function passkeyWhy(e, t) {
  const k = webauthnError(e);
  if (k) return t(`pair.pk_${k}`);
  if (e && (e.code === 'bad_grant')) return t('pair.grantExpired');
  if (e && e.code === 'ip_host') return t('pair.unsupported_ip_host', { url: `http://localhost:${location.port}/` });
  return t('pair.pkFailed', { error: (e && e.message) || String(e) });
}

function Card({ children, onSubmit }) {
  return (
    <div className="mt-pair" data-role="pair">
      <form className="mt-pair-card" onSubmit={onSubmit || ((e) => e.preventDefault())}>
        <img className="mt-pair-brand" src={BRAND_WORDMARK} alt="Atrium" draggable={false} />
        {children}
      </form>
    </div>
  );
}

// 짝을 맺은 뒤: 등록 허가로 패스키를 만든다(몸짓이 필요한 브라우저가 있어 버튼으로)
function RegisterStep({ grant, onDone, onRestart }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const now = useNow(true);
  const left = Math.max(0, Math.ceil((grant.expiresAt - now) / 1000));
  async function create() {
    setBusy(true); setError(null);
    try { await registerPasskey(grant.grant); markPaired(); onDone(); } catch (e) { setError(passkeyWhy(e, t)); setBusy(false); }
  }
  return (
    <div className="mt-pair-wait" data-role="passkey-register">
      <h3>{t('pair.passkeyTitle')}</h3>
      <p className="mt-pair-note">{t('pair.passkeyNote')}</p>
      <div className="mt-card-actions">
        <button type="button" className="mt-btn primary" disabled={busy || left <= 0} onClick={create} data-action="passkey-create">{t('pair.createPasskey')}</button>
        <button type="button" className="mt-btn ghost" onClick={onRestart}>{t('common.cancel')}</button>
      </div>
      <div className="mt-pair-hint">{left > 0 ? t('pair.grantLeft', { s: left }) : t('pair.grantExpired')}</div>
      {error && <div className="mt-pair-error" data-role="pair-error">{error}</div>}
    </div>
  );
}

function PairScreen({ onDone, onHaveKey }) {
  const t = useT();
  const [name, setName] = useState(guessDeviceName());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [req, setReq] = useState(null); // { requestId, secret, check, expiresAt }
  const [grant, setGrant] = useState(null); // P56: { grant, expiresAt } 등록 허가(이 페이지의 메모리에만)
  const timer = useRef(null);
  const why = (e) => (e.code === 'rate_limited' ? t('pair.rateLimited', { s: Math.ceil((e.retryAfterMs || 60000) / 1000) }) : e.code === 'bad_code' || e.code === 'no_code' ? t('pair.badCode') : t('pair.failed', { error: e.message }));

  async function submitCode(e) {
    e.preventDefault(); setBusy(true); setError(null);
    try { setGrant(await post('/web/pair/code', { code: code.trim(), name })); } catch (err) { setError(why(err)); }
    setBusy(false);
  }
  async function ask() {
    setBusy(true); setError(null);
    try { setReq(await post('/web/pair/request', { name })); } catch (err) { setError(why(err)); }
    setBusy(false);
  }
  useEffect(() => {
    if (!req) return;
    const poll = async () => {
      try {
        const r = await fetch(`/web/pair/poll?id=${encodeURIComponent(req.requestId)}&secret=${encodeURIComponent(req.secret)}`, { cache: 'no-store' }).then((x) => x.json());
        if (r.status === 'approved') { setReq(null); return setGrant({ grant: r.grant, expiresAt: r.expiresAt }); }
        if (r.status === 'denied') { setReq(null); return setError(t('pair.denied')); }
        if (r.status !== 'pending') { setReq(null); return setError(t('pair.expired')); }
      } catch {}
      timer.current = setTimeout(poll, 1500);
    };
    timer.current = setTimeout(poll, 1000);
    return () => clearTimeout(timer.current);
  }, [req]); // eslint-disable-line react-hooks/exhaustive-deps

  if (grant) return <Card><RegisterStep grant={grant} onDone={onDone} onRestart={() => { setGrant(null); setCode(''); }} /></Card>;
  return (
    <Card onSubmit={submitCode}>
      <h3>{t('pair.title')}</h3>
      <p className="mt-pair-note">{t('pair.note')}</p>
      <label>{t('pair.name')}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} data-field="pair-name" /></label>
      {!req && (
        <>
          <label>{t('pair.code')}
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" autoFocus data-field="pair-code" className="mt-pair-code" />
          </label>
          <div className="mt-pair-hint">{t('pair.codeHint')}</div>
          <div className="mt-card-actions">
            <button className="mt-btn primary" disabled={busy || code.length !== 6} data-action="pair-submit">{t('pair.connect')}</button>
            <span className="mt-pair-or">{t('pair.or')}</span>
            <button type="button" className="mt-btn" disabled={busy} onClick={ask} data-action="pair-ask">{t('pair.ask')}</button>
          </div>
          <div className="mt-pair-hint"><button type="button" className="mt-btn small ghost" onClick={onHaveKey} data-action="passkey-have">{t('pair.haveKey')}</button></div>
        </>
      )}
      {req && (
        <div className="mt-pair-wait" data-role="pair-wait">
          <div>{t('pair.waiting')}</div>
          <div className="mt-pair-check" data-role="pair-check">{req.check}</div>
          <div className="mt-pair-hint">{t('pair.checkHint')}</div>
          <div className="mt-card-actions"><button type="button" className="mt-btn ghost" onClick={() => setReq(null)}>{t('common.cancel')}</button></div>
        </div>
      )}
      {error && <div className="mt-pair-error" data-role="pair-error">{error}</div>}
    </Card>
  );
}

// 다시 확인: 패스키로 서명해 새 세션을 받는다
function ReauthScreen({ saved, onDone, onPair, note }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function verify() {
    setBusy(true); setError(null);
    try {
      const r = await loginPasskey(saved && saved.credentialId);
      if (r.status === 'unpaired') { onPair(t('reauth.unpaired')); return; }
      markPaired(); onDone();
    } catch (e) { setError(e && e.code === 'rate_limited' ? t('pair.rateLimited', { s: Math.ceil((e.retryAfterMs || 60000) / 1000) }) : passkeyWhy(e, t)); setBusy(false); }
  }
  return (
    <Card>
      <div data-role="reauth">
        <h3>{t('reauth.title')}</h3>
        <p className="mt-pair-note">{saved && saved.name ? t('reauth.note', { name: saved.name }) : t('reauth.noteAny')}</p>
        {note && <div className="mt-pair-hint">{note}</div>}
        <div className="mt-card-actions">
          <button type="button" className="mt-btn primary" disabled={busy} onClick={verify} autoFocus data-action="passkey-verify">{t('reauth.verify')}</button>
          <button type="button" className="mt-btn ghost" disabled={busy} onClick={() => { clearPasskey(); onPair(null); }} data-action="reauth-pair">{t('reauth.repair')}</button>
        </div>
        {error && <div className="mt-pair-error" data-role="pair-error">{error}</div>}
      </div>
    </Card>
  );
}

function Unsupported({ sup }) {
  const t = useT();
  return (
    <Card>
      <div data-role="passkey-unsupported" data-reason={sup.reason}>
        <h3>{t('pair.unsupportedTitle')}</h3>
        <p className="mt-pair-note">{t(`pair.unsupported_${sup.reason}`, { url: sup.localUrl || 'http://localhost/' })}</p>
        {sup.reason === 'ip_host' && sup.localUrl && <p><a href={sup.localUrl} data-action="open-localhost">{sup.localUrl}</a></p>}
        <div className="mt-pair-hint">{t('pair.unsupportedNote')}</div>
      </div>
    </Card>
  );
}

function UnpairedNote() { const t = useT(); return t('reauth.unpaired'); }
function Gate({ sup, onDone, initial, initialNote }) {
  const [mode, setMode] = useState(initial);
  const [note, setNote] = useState(initialNote || null);
  if (!sup.ok) return <Unsupported sup={sup} />;
  if (mode === 'login') return <ReauthScreen saved={savedPasskey()} onDone={onDone} note={null} onPair={(n) => { setNote(n); setMode('pair'); }} />;
  return (
    <>
      {note && <div className="mt-pair-banner" data-role="pair-note">{note}</div>}
      <PairScreen onDone={onDone} onHaveKey={() => setMode('login')} />
    </>
  );
}

// 로그인한 브라우저면 곧바로, 아니면 다시 확인이나 짝 맺기 화면을 보이고 마친 뒤에 끝난다
export async function webGate() {
  let me = null;
  try { me = await webMe(); } catch { if (savedPasskey()) { markPaired(); return; } } // 백엔드가 잠깐 없으면 처음 화면이 연결 오류를 보인다
  if (me) { markPaired(); return; }
  try { if (/^ko\b/i.test(navigator.language || '')) setLanguage('ko'); } catch {}
  const sup = passkeySupport(window);
  // 기억한 패스키가 아직 짝인지 먼저 묻는다(짝이 풀렸으면 곧바로 짝 맺기 화면). credential ID는 비밀이 아니다
  let initial = savedPasskey() ? 'login' : 'pair', unpaired = false;
  if (sup.ok && initial === 'login') {
    try { const r = await post('/web/passkey/login/options', { credentialId: savedPasskey().credentialId }); if (r.status === 'unpaired') { clearPasskey(); initial = 'pair'; unpaired = true; } } catch {}
  }
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await new Promise((res) => root.render(<Gate sup={sup} onDone={res} initial={initial} initialNote={unpaired ? <UnpairedNote /> : null} />));
  root.unmount(); host.remove();
}
