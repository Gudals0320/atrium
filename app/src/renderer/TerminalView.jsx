// 가까이 얼굴: 제어기 프레임을 xterm.js로 그리고 입력을 제어기로 넘긴다(ARCH 7.2, E4).
// - allowProposedApi + unicode11(이모지 폭). 프레임의 크기가 바뀌면 쓰기 전에 xterm 크기를 맞춘다.
// - 붙여넣기는 괄호 붙여넣기로 감싸고, 휠은 SGR 마우스 시퀀스로 바꾼다. ctrl+g(외부 편집기)는 막는다.
// - WebGL 렌더러는 예산(기본 8) 안에서만 쓰고, 넘거나 컨텍스트를 잃으면 DOM으로 그린다(BRIEF 위험 2).
// - P6a(H4): 노드를 눌러 들어간 뒤 붙기 전에 친 글(store.pendingInput)은 붙자마자 넣고 초점을 준다.
// - P38: 판 배율 아래에서도 끌어 고르기가 마우스 밑 글자를 따라가게 xterm의 마우스 → 칸 계산에 확대·축소 전 자리를 넘긴다(unscalePoint).
//   고르는 동안 포인터는 글 고르기 모양. 복사·붙여넣기·휠 뒤와 고른 자리의 글이 바뀌면 선택을 지운다(clearsSelection). 복사는 줄 끝 빈칸을 뺀다.
import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import { api } from './api.js';
import { useStore, takePendingInput, pendingFor } from './store.js';
import { wrapPaste, wheelToSgr, keyAction, frameBytes, unscalePoint, clearsSelection, copyText } from './lib/term-input.js';
import { RendererBudget, DEFAULT_WEBGL_BUDGET } from './lib/faces.js';
import { onFrame, onWritten, markInput, setTerminal, perfLog } from './perf.js';
import { termTheme, TERM_FONT, TERM_FONT_SIZE, TERM_LINE_HEIGHT } from './lib/tokens.js';
import { useT, errText } from './lib/i18n.js';

function readNumber(key, dflt) {
  const q = new URLSearchParams(location.search).get(key);
  let v = q;
  try { v ??= localStorage.getItem(`mt.${key}`); } catch {}
  const n = Number(v);
  return Number.isFinite(n) && v !== null && v !== '' ? n : dflt;
}
export const budget = new RendererBudget(readNumber('webglBudget', DEFAULT_WEBGL_BUDGET));
export const terms = new Map(); // sessionId → Terminal (시험과 E6에서 읽는다)

// P38: xterm은 마우스 위치를 칸으로 바꿀 때 판의 CSS 확대·축소를 모른다(화면 px를 확대·축소 전 칸 크기로 나눈다).
// 마우스 서비스(선택, 링크, 마우스 보고가 함께 쓴다)에 확대·축소 전 자리를 넘긴다. xterm 6.0.0의 내부(_core._mouseService)라
// 판 올릴 때 확인한다. 없으면 기록만 남기고 그대로 둔다(배율 1에서는 그대로 맞는다)
function fixMouseScale(term, sessionId) {
  const ms = term._core && term._core._mouseService;
  if (!ms || typeof ms.getCoords !== 'function' || typeof ms.getMouseReportCoords !== 'function') { window.mt.log(`xterm mouse service not found ${sessionId}: selection may drift when zoomed`); return; }
  const unscale = (ev, el) => unscalePoint({ clientX: ev.clientX, clientY: ev.clientY, rect: el.getBoundingClientRect(), width: el.offsetWidth, height: el.offsetHeight });
  const getCoords = ms.getCoords.bind(ms), getReport = ms.getMouseReportCoords.bind(ms);
  ms.getCoords = (ev, el, ...rest) => getCoords(unscale(ev, el), el, ...rest);
  ms.getMouseReportCoords = (ev, el) => getReport(unscale(ev, el), el);
}

// P11: 색은 tokens.css --term-…, 글꼴은 앱에 넣은 JetBrains Mono(한글 Nanum Gothic Coding). 글 크기와 줄 높이는 lib/tokens.js

// reserve: P11 승인 줄이 붙으면 그 높이(월드 px)만큼 터미널 아래를 비운다. 패널 줄 수가 줄어 Claude Code 대화상자가 줄 위에 보인다
export function TerminalView({ sessionId, width, height, reserve = 0, onActivate, onInput, focusTick }) {
  const t = useT();
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;
  const hostRef = useRef(null);
  const ref = useRef({});
  const [status, setStatus] = useState({ kind: 'attaching' });
  const [hint, setHint] = useState(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    const st = ref.current = { pid: null, alive: true, acc: 0, lastSize: null };
    const term = new Terminal({ allowProposedApi: true, fontFamily: TERM_FONT, fontSize: TERM_FONT_SIZE, lineHeight: TERM_LINE_HEIGHT, fontWeight: 500, fontWeightBold: 700, scrollback: 0, cursorBlink: false, theme: termTheme(), drawBoldTextInBrightColors: false });
    const u11 = new Unicode11Addon();
    term.loadAddon(u11);
    term.unicode.activeVersion = '11';
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    terms.set(sessionId, term);
    fixMouseScale(term, sessionId);

    let renderer = budget.acquire(sessionId);
    perfLog('term_mount', { sessionId, renderer, used: budget.used });
    if (renderer === 'webgl') {
      try {
        const gl = new WebglAddon();
        gl.onContextLoss(() => {
          perfLog('webgl_context_loss', { sessionId, alive: st.alive });
          // 컨텍스트를 잃은 터미널은 DOM으로 그린다. 정리 중 오류가 나도 그 터미널 안에서 끝낸다(E5 2.5)
          try { gl.dispose(); } catch (e) { perfLog('webgl_dispose_error', { sessionId, message: e.message }); window.mt.log(`webgl dispose error ${sessionId}: ${e.stack || e.message}`); }
          budget.release(sessionId, { contextLost: true });
          setTerminal(sessionId, { renderer: 'dom', contextLost: true });
          window.mt.log(`webgl context lost ${sessionId}`);
        });
        term.loadAddon(gl);
      } catch (e) { budget.release(sessionId); renderer = 'dom'; window.mt.log(`webgl failed ${sessionId}: ${e.message}`); }
    }

    const send = (data) => {
      if (!data) return;
      markInput(sessionId);
      if (onInputRef.current) onInputRef.current();
      api.call('terminal.input', { session: sessionId, data }).catch((e) => setHint(t('terminal.inputFail', { error: errText(e) })));
    };
    const flash = (t) => { setHint(t); clearTimeout(st.hintTimer); st.hintTimer = setTimeout(() => setHint(null), 2500); };

    term.onData(send);
    term.attachCustomKeyEventHandler((e) => {
      const a = keyAction(e, term.hasSelection());
      if (a === 'block-ctrl-g') { e.preventDefault(); flash(t('terminal.ctrlG')); return false; }
      if (a === 'paste') return false; // 브라우저 붙여넣기 이벤트로 넘긴다(아래에서 감싼다)
      if (a === 'copy') {
        const sel = copyText(term.getSelection());
        navigator.clipboard.writeText(sel).catch(() => {});
        if (clearsSelection('copy', { hasSelection: term.hasSelection() })) term.clearSelection(); // P38
        e.preventDefault(); flash(t('terminal.copied')); return false;
      }
      return true;
    });
    term.attachCustomWheelEventHandler((ev) => {
      const screen = host.querySelector('.xterm-screen') || host;
      const r = wheelToSgr({ deltaY: ev.deltaY, deltaMode: ev.deltaMode, clientX: ev.clientX, clientY: ev.clientY, rect: screen.getBoundingClientRect(), cols: term.cols, rows: term.rows, acc: st.acc });
      st.acc = r.acc;
      if (r.seq && clearsSelection('wheel', { hasSelection: term.hasSelection() })) term.clearSelection(); // P38: 다시 그린 화면에서 선택이 다른 글 위에 남지 않게
      send(r.seq);
      ev.preventDefault();
      return false;
    });
    // 붙여넣기: xterm보다 먼저(캡처 단계) 받아 괄호 붙여넣기로 감싼다. 감싸지 않으면 줄마다 따로 제출된다(E4 2.5).
    const onPaste = (e) => {
      e.preventDefault(); e.stopPropagation();
      const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
      if (clearsSelection('paste', { hasSelection: term.hasSelection() })) term.clearSelection(); // P38
      send(wrapPaste(text));
    };
    host.addEventListener('paste', onPaste, true);
    // P38: 끄는 중(왼쪽 단추를 누른 채)에는 노드 밖으로 나가도 포인터를 글 고르기 모양으로 두고, 프레임으로 선택을 지우지 않는다
    const endDrag = () => { st.dragging = false; document.body.classList.remove('mt-term-selecting'); window.removeEventListener('mouseup', endDrag, true); };
    const onDown = (e) => { if (e.button !== 0) return; st.dragging = true; document.body.classList.add('mt-term-selecting'); window.addEventListener('mouseup', endDrag, true); };
    host.addEventListener('mousedown', onDown, true);
    st.selText = '';
    term.onSelectionChange(() => { st.selText = term.hasSelection() ? term.getSelection() : ''; });

    const offFrame = api.on('terminal.frame', (f) => {
      if (f.sessionId !== sessionId || !st.alive) return;
      if (st.pid !== null && f.controllerPid !== st.pid) return;
      const bytes = frameBytes(f.bytes);
      const t0 = onFrame(sessionId, bytes.length, f.width, f.height);
      if (f.width && f.height && (f.width !== term.cols || f.height !== term.rows)) term.resize(f.width, f.height); // 쓰기 전에 크기 맞추기(E4)
      term.write(bytes, () => {
        onWritten(t0);
        // P38: 고른 자리의 글이 바뀌었으면(화면이 다시 그려짐) 선택을 지운다
        if (term.hasSelection() && clearsSelection('frame', { dragging: st.dragging, before: st.selText, after: term.getSelection() })) { perfLog('term_selection_cleared', { sessionId, why: 'frame' }); term.clearSelection(); }
      });
    });
    // 백엔드에 다시 붙으면(백엔드 재시작, C2) 옛 연결의 제어기는 이미 놓였다. 다시 붙는다.
    const offOpen = api.on('$open', () => { if (st.alive) { perfLog('term_reattach_on_reconnect', { sessionId }); setStatus({ kind: 'attaching' }); setRetry((x) => x + 1); } });
    const offDetached = api.on('terminal.detached', (d) => {
      if (d.sessionId !== sessionId || !st.alive || (st.pid !== null && d.controllerPid !== st.pid)) return;
      perfLog('term_detached', { sessionId, reason: d.reason });
      setStatus({ kind: 'detached', reason: d.reason });
    });

    const dims = fit.proposeDimensions() || { cols: 100, rows: 30 };
    const cols = Math.max(20, dims.cols), rows = Math.max(8, dims.rows);
    term.resize(cols, rows);
    st.lastSize = `${cols}x${rows}`;
    setTerminal(sessionId, { renderer, cols, rows });
    api.call('terminal.attach', { session: sessionId, cols, rows })
      .then((r) => {
        st.pid = r.controllerPid;
        if (!st.alive) return;
        setStatus({ kind: 'attached', pid: r.controllerPid });
        // H4: 들어가며 친 글이 있으면 넣고 터미널에 초점을 준다
        if (pendingFor(sessionId)) { const buf = takePendingInput(sessionId); if (buf) { perfLog('pending_input', { sessionId, chars: buf.length }); send(buf); } term.focus(); }
      })
      .catch((e) => { if (st.alive) setStatus({ kind: 'error', reason: e.message }); });
    st.term = term; st.fit = fit;

    return () => {
      st.alive = false;
      perfLog('term_unmount', { sessionId });
      offFrame(); offDetached(); offOpen();
      host.removeEventListener('paste', onPaste, true);
      host.removeEventListener('mousedown', onDown, true);
      endDrag();
      api.call('terminal.detach', { session: sessionId }).catch(() => {});
      budget.release(sessionId);
      terms.delete(sessionId);
      setTerminal(sessionId, null);
      term.dispose();
    };
  }, [sessionId, retry]);

  // 노드 크기가 바뀌면 패널 크기를 맞춘다(노드 크기 = 패널 크기, ARCH 7.2). 돌아온 프레임의 w·h로 xterm 크기가 바뀐다.
  useEffect(() => {
    const st = ref.current;
    if (!st.fit) return;
    const refit = () => {
      if (!st.fit) return;
      const d = st.fit.proposeDimensions();
      if (!d) return;
      const cols = Math.max(20, d.cols), rows = Math.max(8, d.rows);
      const key = `${cols}x${rows}`;
      if (key === st.lastSize) return;
      st.lastSize = key;
      setTerminal(sessionId, { cols, rows });
      api.call('terminal.resize', { session: sessionId, cols, rows }).catch(() => {});
    };
    // P17: 덩어리 분할선·바깥 크기로 여러 노드 크기가 한꺼번에 바뀌면 120ms 때 아직 자리가 덜 잡혀 한 줄 모자라게 잴 때가 있다. 한 번 더 잰다
    const t = setTimeout(refit, 120), t2 = setTimeout(refit, 600);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [sessionId, width, height, reserve]);

  useEffect(() => {
    const st = ref.current;
    if (!focusTick || !st.term) return;
    // 붙기 전에는 초점을 주지 않는다(그동안 친 키는 창이 모은다). 붙은 터미널이면 모아 둔 글을 지금 넣는다
    if (!st.pid) return;
    if (pendingFor(sessionId)) { const buf = takePendingInput(sessionId); if (buf) { perfLog('pending_input', { sessionId, chars: buf.length, attached: true }); api.call('terminal.input', { session: sessionId, data: buf }).catch(() => {}); } }
    st.term.focus();
  }, [focusTick, sessionId]);

  // herdr가 다시 뜨거나(C3) 백엔드가 다시 붙어 제어기가 끝났으면, 세션이 다시 살아난 뒤 저절로 다시 붙는다.
  // 다른 클라이언트가 이 패널을 가져간 경우(takeover)는 서로 빼앗지 않게 저절로 붙지 않는다. 같은 끊김에 다섯 번까지.
  const herdrUp = useStore((st) => st.herdr.connected);
  const sstate = useStore((st) => (st.sessions.get(sessionId) || {}).state);
  const autoTries = useRef(0);
  useEffect(() => {
    if (status.kind === 'attached') { autoTries.current = 0; return; }
    if (status.kind !== 'detached' && status.kind !== 'error') return;
    if (status.reason === 'takeover' || !herdrUp || !sstate || sstate === 'exited' || sstate === 'starting' || autoTries.current >= 5) return;
    const t = setTimeout(() => { autoTries.current++; perfLog('term_auto_reattach', { sessionId, reason: status.reason, state: sstate }); setStatus({ kind: 'attaching' }); setRetry((x) => x + 1); }, 800);
    return () => clearTimeout(t);
  }, [status.kind, status.reason, herdrUp, sstate, sessionId]);

  return (
    <div className="mt-term-wrap nodrag nowheel nopan" onMouseDown={() => onActivate && onActivate()}>
      <div className="mt-term" ref={hostRef} data-session={sessionId} style={reserve ? { bottom: reserve } : undefined} />
      {status.kind === 'attaching' && <div className="mt-term-note">{t('terminal.attaching')}</div>}
      {(status.kind === 'detached' || status.kind === 'error') && (
        <div className="mt-term-cover">
          <div>{t('terminal.detached', { reason: status.reason })}</div>
          <button className="mt-btn" onClick={() => { autoTries.current = 0; setStatus({ kind: 'attaching' }); setRetry((x) => x + 1); }} data-action="term-reattach">{t('terminal.reattach')}</button>
        </div>
      )}
      {hint && <div className="mt-term-hint">{hint}</div>}
    </div>
  );
}
