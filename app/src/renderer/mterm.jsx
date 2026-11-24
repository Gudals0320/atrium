// P355: 휴대폰 전용 페이지(MobileSession.jsx)의 터미널 보기. 이 묶음(mterm.js·mterm.css)은 세션 화면에서 "터미널"을 고를 때만 읽는다(xterm, TerminalView).
// 옛 휴대폰 세션 화면(Phone.jsx PhoneSession)이 하던 것을 그대로 한다:
// - DOM으로 그린다(webgl 끔, 높은 DPR), 길게 눌러 고르기·복사(touchSelect), 글자 크기는 페이지 글자 크기(mt.phoneTermScale)
// - 손가락으로 끌면 휠로 바꿔 스크롤한다(touchWheelDelta). 터미널을 눌러도 화면 키보드가 뜨지 않는다(바로 치기를 켰을 때만 뜬다)
// - 이 휴대폰이 패널 크기를 가져간다(terminal.focus, 다시 붙으면 다시)
// - 한 번에 하나만 붙는다. 세션 화면을 떠나거나 답 보기로 바꾸면 이 조각이 내려가고 TerminalView가 떼고(terminal.detach) xterm을 버린다
// TerminalView는 판 store의 세션 대신 info({ kind, state })를 쓰고, 판 배율은 term-flow.js의 배율 1(xyflow를 읽지 않는다)
import '@xterm/xterm/css/xterm.css';
import './mterm.css';
import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { TerminalView, terms } from './TerminalView.jsx';
import { touchWheelDelta } from './lib/phone.js';

window.__mtMobileTerm = { terms }; // 시험이 읽는다(붙은 터미널 수)

export function MobileTerm({ sessionId, info, scale, direct = false, onInput, onDirectEnd }) {
  const boxRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const directRef = useRef(direct); directRef.current = direct;
  const endRef = useRef(onDirectEnd); endRef.current = onDirectEnd;
  // 터미널 칸의 크기(TerminalView가 패널 크기를 맞춘다)
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  // 이 휴대폰이 패널 크기를 가져간다(P47). 붙을 때까지 몇 번 해 본다. 다시 붙으면 다시
  useEffect(() => {
    let n = 0, stop = false, timer = 0;
    const tryFocus = () => { if (stop) return; api.call('terminal.focus', { session: sessionId }).catch(() => { if (++n < 20 && !stop) timer = setTimeout(tryFocus, 300); }); };
    timer = setTimeout(tryFocus, 250);
    const off = api.on('$open', () => { n = 0; clearTimeout(timer); timer = setTimeout(tryFocus, 600); });
    return () => { stop = true; clearTimeout(timer); off(); };
  }, [sessionId]);
  // 화면 키보드: 바로 치기가 아니면 xterm 입력 칸을 inputmode none으로(눌러도 키보드가 뜨지 않는다). 손가락으로 끌면 휠로 바꿔 스크롤한다
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const quiet = () => {
      const ta = el.querySelector('.xterm-helper-textarea');
      if (!ta) return;
      const want = directRef.current ? 'text' : 'none';
      if (ta.getAttribute('inputmode') === want) return;
      ta.setAttribute('inputmode', want);
      if (want === 'none') ta.setAttribute('aria-hidden', 'true'); else ta.removeAttribute('aria-hidden');
    };
    const iv = setInterval(quiet, 300);
    const onOut = (e) => { if (e.target && e.target.classList && e.target.classList.contains('xterm-helper-textarea') && directRef.current && endRef.current) endRef.current(); };
    let y0 = null, last = null, dragging = false;
    const onStart = (e) => { if (e.touches.length !== 1) { y0 = null; return; } y0 = last = e.touches[0].clientY; dragging = false; };
    const onMove = (e) => {
      if (y0 == null || e.touches.length !== 1) return;
      const tch = e.touches[0];
      if (!dragging && Math.abs(tch.clientY - y0) < 8) return;
      dragging = true;
      e.preventDefault();
      const dy = tch.clientY - last; last = tch.clientY;
      const screen = el.querySelector('.xterm-screen');
      if (screen && dy) screen.dispatchEvent(new WheelEvent('wheel', { deltaY: touchWheelDelta(dy), deltaMode: 0, clientX: tch.clientX, clientY: tch.clientY, bubbles: true, cancelable: true }));
    };
    const onEnd = () => { y0 = null; };
    el.addEventListener('focusout', onOut, true);
    el.addEventListener('touchstart', onStart, { passive: true, capture: true });
    el.addEventListener('touchmove', onMove, { passive: false, capture: true });
    el.addEventListener('touchend', onEnd, { capture: true });
    el.addEventListener('touchcancel', onEnd, { capture: true });
    return () => {
      clearInterval(iv);
      el.removeEventListener('focusout', onOut, true);
      el.removeEventListener('touchstart', onStart, { capture: true });
      el.removeEventListener('touchmove', onMove, { capture: true });
      el.removeEventListener('touchend', onEnd, { capture: true });
      el.removeEventListener('touchcancel', onEnd, { capture: true });
    };
  }, [sessionId]);
  return (
    <div className="mt-ms-termbox" ref={boxRef} data-role="mp-termbox" data-direct={direct ? '1' : undefined}>
      {box.w > 0 && box.h > 0 && <TerminalView sessionId={sessionId} width={box.w} height={box.h} fontScale={scale} webgl={false} touchSelect info={info} onInput={onInput} />}
    </div>
  );
}
