// P165: 음성 입력(마이크 단추와 녹음 훅). 명령줄(CommandBar.jsx)과 휴대폰 입력칸(Phone.jsx, PhoneFull.jsx)이 같이 쓴다.
// - 누르면 녹음 시작, 다시 누르면 끝. 마이크 소리를 16kHz 16비트 PCM으로 바꿔 판 API 웹소켓의 바이너리 프레임으로 보내고(api.sendBinary),
//   백엔드(backend/src/voice.mjs)가 Soniox 실시간 전사로 넘겨 받은 글 토막(voice.text)을 녹음을 시작한 커서 자리에 넣는다(lib/voice-text.js)
// - 미확정 글은 inline이면 입력칸 안에 흐리게(명령줄의 겹), 아니면 입력칸 위 한 줄에 흐리게(휴대폰) 보이고 확정 글만 입력칸에 들어간다
// - 창이 숨거나 판 연결이 끊기면 멈춘다. 키는 창에 오지 않는다(없으면 백엔드가 voice_no_key로 거절한다)
// - 움직임은 넣지 않는다(듣는 중은 빨간 점 고정 표시, reduced motion에서도 같다)
// - P176: 녹음이 사람 모르게 이어지지 않게. 마이크 단추가 안 보이면(바가 숨음, 덮개에 가림, 화면 밖) 화면 위에 녹음 알약(VoicePill:
//   빨간 점·지난 시간·누르면 멈춤)을 띄운다. 창이 숨으면(최소화·트레이) 멈추고 알린다. 말 없음 자동 멈춤은 백엔드가 한다(voice.mjs idleMs).
//   멈출 때 까닭(user·send·hidden·unmount)을 voice.stop에 실어 보내 판 기록의 끝 줄에 남긴다
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api.js';
import { toast } from './store.js';
import { useT, t as tNow } from './lib/i18n.js';
import { Icon } from './lib/icons.jsx';
import { voiceStart, voiceApply, voiceEdit, liveRange, shiftPos, toPcm16, voiceErrorKey, pillWanted, voiceElapsed, stopOnHide } from './lib/voice-text.js';

const ERROR_SHOW_MS = 4000;
const PRE_BUFFER_MAX = 40; // 시작 응답 전 소리 토막(약 3초)
const PILL_CHECK_MS = 500; // P176: 마이크 단추가 보이는지 다시 보는 간격(알약의 지난 시간도 이때 바뀐다)
const INFO_ENDS = new Set(['limit', 'silence']); // P176: 저절로 멈춘 것은 오류가 아니라 알림

// 마이크 열기 → { close(), rate }. onPcm(Int16Array)
async function openMic(onPcm) {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
  if (!md || !md.getUserMedia) throw Object.assign(new Error('insecure'), { code: typeof window !== 'undefined' && window.isSecureContext === false ? 'insecure' : 'nomic' });
  let stream;
  try { stream = await md.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch (e) { throw Object.assign(new Error(e && e.message || 'mic'), { code: (e && e.name) || 'denied' }); }
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  try { if (ctx.state === 'suspended') await ctx.resume(); } catch {}
  const src = ctx.createMediaStreamSource(stream);
  // ScriptProcessor: 따로 모듈 파일이 없어도 되고 iOS Safari에서도 돈다. 4096 표본(48kHz면 85ms)마다 보낸다
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  proc.onaudioprocess = (e) => { try { onPcm(toPcm16(e.inputBuffer.getChannelData(0), ctx.sampleRate)); } catch {} };
  src.connect(proc);
  proc.connect(ctx.destination); // Chromium은 출력에 이어야 처리가 돈다(출력은 비어 있어 소리는 나지 않는다)
  let closed = false;
  return {
    rate: ctx.sampleRate,
    close() {
      if (closed) return;
      closed = true;
      try { proc.onaudioprocess = null; proc.disconnect(); src.disconnect(); } catch {}
      for (const tr of stream.getTracks()) try { tr.stop(); } catch {}
      try { ctx.close(); } catch {}
    },
  };
}

// 녹음 훅. text·setText: 입력칸 글 상태, taRef: 입력칸. inline: 미확정 글을 입력칸 안에 넣는가
// → { state, live(흐린 범위, inline), interim(흐린 글, inline 아님), active, since(녹음 시작 때), toggle, stop(ms, 까닭), finish(ms), current()(들은 글을 넣은 지금 글) }
export function useVoice({ text, setText, taRef, inline = true }) {
  const [state, setState] = useState('idle'); // idle | connecting | listening | stopping | error
  const [errKey, setErrKey] = useState(null);
  const [live, setLive] = useState(null);
  const [interim, setInterim] = useState('');
  const [since, setSince] = useState(0); // P176
  const r = useRef({ reg: null, known: text, id: null, mic: null, pre: [], waiters: [], caret: null, gen: 0, endTimer: null, interim: '' });
  const textRef = useRef(text);
  textRef.current = text;
  const stateRef = useRef(state);
  stateRef.current = state;

  // 손으로 고친 글: 자리를 옮긴다. 들은 글을 넣은 뒤에는 커서를 되돌린다
  useLayoutEffect(() => {
    const v = r.current;
    if (v.reg && v.known !== text) {
      v.reg = voiceEdit(v.known, text, v.reg);
      if (inline) setLive(liveRange(v.reg));
    }
    v.known = text;
    if (v.caret) {
      const el = taRef.current, c = v.caret;
      v.caret = null;
      if (el && document.activeElement === el) try { el.setSelectionRange(c[0], c[1]); } catch {}
    }
  }, [text, inline, taRef]);

  const apply = useCallback((msg) => {
    const v = r.current;
    if (!v.reg) return;
    let base = textRef.current;
    if (v.known !== base) { v.reg = voiceEdit(v.known, base, v.reg); v.known = base; }
    const m = inline ? msg : { final: msg.final, interim: '' };
    if (!inline) { v.interim = msg.interim || ''; setInterim(v.interim); }
    if (!m.final && !inline) return;
    const out = voiceApply(base, v.reg, m);
    v.reg = out.reg;
    if (out.text === base) { if (inline) setLive(liveRange(v.reg)); return; }
    const el = taRef.current;
    if (el && document.activeElement === el) v.caret = [shiftPos(el.selectionStart, out.at, out.removed, out.added), shiftPos(el.selectionEnd, out.at, out.removed, out.added)];
    v.known = out.text; textRef.current = out.text;
    setText(out.text);
    if (inline) setLive(liveRange(v.reg));
  }, [inline, setText, taRef]);

  // 끝(멈춤 완료, 오류, 끊김). 남은 미확정 글은 보통 글로 둔다
  const finalize = useCallback((reason, error) => {
    const v = r.current;
    if (v.mic) { v.mic.close(); v.mic = null; }
    clearTimeout(v.endTimer); v.endTimer = null;
    if (!inline && v.reg && v.interim) {
      // 휴대폰: 확정 안 된 채 끝난 글도 입력칸에 넣는다(지우지 않는다)
      const base = textRef.current;
      const reg = v.known !== base ? voiceEdit(v.known, base, v.reg) : v.reg;
      const out = voiceApply(base, reg, { final: v.interim });
      if (out.text !== base) { textRef.current = out.text; v.known = out.text; setText(out.text); }
    }
    v.interim = ''; setInterim('');
    v.reg = null; // 명령줄은 미확정 글이 이미 입력칸에 있다(voiceDone: 보통 글로 남는다)
    v.id = null; v.pre = []; v.gen++;
    setLive(null);
    const waiters = v.waiters; v.waiters = [];
    for (const w of waiters) w();
    const bad = reason && !['done', 'cancel'].includes(reason);
    if (bad) {
      const key = voiceErrorKey(reason === 'error' ? error || 'error' : reason);
      setErrKey(key); setState('error');
      toast(tNow(key), INFO_ENDS.has(reason) ? 'info' : 'error');
      setTimeout(() => setState((s) => (s === 'error' ? 'idle' : s)), ERROR_SHOW_MS);
    } else setState('idle');
  }, [inline, setText]);

  const start = useCallback(async () => {
    const v = r.current;
    if (stateRef.current === 'connecting' || stateRef.current === 'listening' || stateRef.current === 'stopping') return;
    const gen = ++v.gen;
    const el = taRef.current;
    const base = textRef.current;
    const caret = el && document.activeElement === el ? el.selectionEnd : base.length; // 초점이 없으면 글 끝
    setErrKey(null); setState('connecting'); setSince(Date.now());
    v.pre = [];
    const onPcm = (pcm) => {
      if (gen !== r.current.gen) return;
      if (r.current.id) api.sendBinary(pcm.buffer);
      else if (r.current.pre.length < PRE_BUFFER_MAX) r.current.pre.push(pcm);
    };
    try {
      v.mic = await openMic(onPcm);
      if (gen !== v.gen) { if (v.mic) v.mic.close(); v.mic = null; return; }
      const res = await api.call('voice.start', {});
      if (gen !== v.gen) { api.call('voice.stop', { id: res.id }).catch(() => {}); return; }
      v.reg = voiceEdit(base, textRef.current, voiceStart(base, caret)); // 기다리는 사이 친 글이 있으면 자리를 맞춘다
      v.known = textRef.current;
      v.id = res.id;
      for (const pcm of v.pre) api.sendBinary(pcm.buffer);
      v.pre = [];
      setState('listening');
    } catch (e) {
      if (gen !== v.gen) return;
      finalize(e && e.code === 'disconnected' ? 'disconnected' : 'error', e && e.code);
    }
  }, [taRef, finalize]);

  // 멈춤: 소리를 끊고 남은 확정 글을 기다린다(voice.end). 오래 안 오면 그대로 끝. why: 멈춘 까닭(P176, 판 기록에 남는다)
  const stop = useCallback((waitMs = 1500, why = 'user') => {
    const v = r.current;
    const st = stateRef.current;
    if (st === 'connecting') { v.gen++; finalize('cancel'); return Promise.resolve(); }
    if (st !== 'listening' && st !== 'stopping') return Promise.resolve();
    const done = new Promise((res) => v.waiters.push(res));
    if (st === 'listening') {
      setState('stopping');
      if (v.mic) { v.mic.close(); v.mic = null; }
      const id = v.id;
      api.call('voice.stop', { id, reason: why }).catch(() => {});
    }
    clearTimeout(v.endTimer);
    v.endTimer = setTimeout(() => finalize('done'), waitMs);
    return done;
  }, [finalize]);

  // Enter로 보내기 전: 녹음을 끝내고 남은 확정 글을 잠깐(ms) 받는다
  const finish = useCallback((ms = 1000) => stop(ms, 'send'), [stop]);

  const toggle = useCallback(() => {
    const st = stateRef.current;
    if (st === 'listening' || st === 'connecting') stop(1500, 'user');
    else if (st !== 'stopping') start();
  }, [start, stop]);

  useEffect(() => {
    const offText = api.on('voice.text', (d) => { if (d && d.id && d.id === r.current.id) apply(d); });
    const offEnd = api.on('voice.end', (d) => { if (d && d.id && d.id === r.current.id) finalize(d.reason, d.error); });
    const offClose = api.on('$close', () => { const st = stateRef.current; if (st === 'listening' || st === 'stopping' || st === 'connecting') { r.current.gen++; finalize('disconnected'); } });
    // 창이 숨으면(최소화·트레이·다른 화면) 멈추고 알린다(P176: 알림은 돌아왔을 때도 잠시 남는다)
    const onHide = (vis) => {
      if (!stopOnHide(vis, stateRef.current)) return;
      stop(500, 'hidden');
      toast(tNow('voice.hidden'), 'info');
    };
    const onVis = () => onHide(document.visibilityState);
    document.addEventListener('visibilitychange', onVis);
    const offWin = typeof window !== 'undefined' && window.mt && window.mt.onWindowHidden ? window.mt.onWindowHidden(() => onHide('hidden')) : () => {}; // 창(Electron) 최소화·트레이
    return () => {
      offText(); offEnd(); offClose(); offWin();
      document.removeEventListener('visibilitychange', onVis);
      const v = r.current;
      if (v.id) api.call('voice.stop', { id: v.id, reason: 'unmount' }).catch(() => {}); // 입력칸이 화면에서 사라짐(휴대폰 화면 바꿈 등)
      if (v.mic) v.mic.close();
      v.mic = null; v.id = null; v.gen++;
      clearTimeout(v.endTimer);
    };
  }, [apply, finalize, stop]);

  const active = state === 'connecting' || state === 'listening' || state === 'stopping';
  return { state, errKey, live, interim, active, since, toggle, stop, finish, current: () => textRef.current };
}

// P176: 마이크 단추가 지금 사람에게 보이는가(숨은 바·가린 덮개·화면 밖이면 아니다)
function buttonVisible(el) {
  if (!el || !el.isConnected || typeof document === 'undefined') return false;
  const rect = el.getBoundingClientRect();
  const view = { w: window.innerWidth, h: window.innerHeight };
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  let hit = false;
  try { const at = document.elementFromPoint(cx, cy); hit = !!(at && (at === el || el.contains(at))); } catch {}
  const hidden = !!el.closest('[data-hidden="1"]') || document.visibilityState === 'hidden';
  return !pillWanted({ active: true, rect, view, hit, hidden });
}

// P176: 녹음 중 단추가 안 보이는가(PILL_CHECK_MS마다 다시 본다) → { away, now }
function useAway(ref, active) {
  const [s, set] = useState({ away: false, now: Date.now() });
  useEffect(() => {
    if (!active) { set((x) => (x.away ? { away: false, now: Date.now() } : x)); return undefined; }
    const check = () => set({ away: !buttonVisible(ref.current), now: Date.now() });
    const first = requestAnimationFrame(check);
    const id = setInterval(check, PILL_CHECK_MS);
    return () => { cancelAnimationFrame(first); clearInterval(id); };
  }, [ref, active]);
  return s;
}

// P176: 화면 위 녹음 알약. 빨간 점·지난 시간, 누르면 멈춘다. 어떤 덮개보다 위에 그린다(body에 붙인다)
export function VoicePill({ voice, now }) {
  const t = useT();
  const st = voice.state;
  const label = st === 'connecting' ? t('voice.connecting') : st === 'stopping' ? t('voice.stopping') : t('voice.listening');
  const time = voiceElapsed((now || Date.now()) - (voice.since || Date.now()));
  return createPortal(
    <button type="button" className="mt-voice-pill" data-role="voice-pill" data-state={st} title={t('voice.pillStop')} aria-label={`${label} ${time}. ${t('voice.pillStop')}`}
      onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={() => { if (st !== 'stopping') voice.stop(1500, 'user'); }}>
      <span className="mt-voice-pill-dot" aria-hidden="true" />
      <span className="mt-voice-pill-label">{label}</span>
      <span className="mt-voice-pill-time">{time}</span>
      <span className="mt-voice-pill-stop">{t('voice.pillStopShort')}</span>
    </button>,
    document.body,
  );
}

// 마이크 단추. 듣는 중은 빨간 점(움직임 없음), 오류는 짧게 표시한다. P176: 녹음 중 단추가 안 보이면 위에 알약
export function VoiceButton({ voice, className = '' }) {
  const t = useT();
  const st = voice.state;
  const btnRef = useRef(null);
  const away = useAway(btnRef, voice.active);
  const title = st === 'listening' ? t('voice.stop') : st === 'connecting' ? t('voice.connecting') : st === 'stopping' ? t('voice.stopping') : st === 'error' && voice.errKey ? t(voice.errKey) : t('voice.start');
  return (
    <>
    <button ref={btnRef} type="button" className={`mt-voice-btn ${className}`} data-action="voice" data-state={st} aria-pressed={voice.active} aria-label={title} title={title}
      onPointerDown={(e) => e.preventDefault() /* 입력칸 초점과 커서를 그대로 둔다 */} onMouseDown={(e) => e.preventDefault()} onClick={voice.toggle}>
      <Icon name="mic" />
      {(st === 'listening' || st === 'stopping') && <span className="mt-voice-dot" aria-hidden="true" />}
    </button>
    {voice.active && away.away && <VoicePill voice={voice} now={away.now} />}
    </>
  );
}

// 휴대폰: 입력칸 위의 흐린 미확정 글 한 줄
export function VoiceInterim({ voice }) {
  const t = useT();
  if (!voice.active) return null;
  return <div className="mt-voice-live" data-role="voice-live" data-state={voice.state}>{voice.interim || (voice.state === 'connecting' ? t('voice.connecting') : t('voice.listening'))}</div>;
}
