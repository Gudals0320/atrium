// P360: 되살리기와 갈라 열기(창). 사람이 누를 때만 판이 되살리거나 갈라 연다.
// - 다시 열기(session.revive): 닫힘 줄·보관함 줄(보관된 것은 꺼내기와 다시 열기를 한 번에)·끝난 세션 줄에서 같은 대화로. 실패하면 까닭을 토스트로.
// - SDK로 갈라 열기(session.fork, 런처 claude-sdk): 노드 메뉴·닫힘 줄·보관함 줄. Claude Code 세션만. API 키가 없으면 흐리게 두고 까닭을 제목으로.
//   갈라 연 세션은 원래 세션 곁에 놓이고 P363의 SDK 표시가 붙는다. 원래 세션과 옅은 "갈라 옴" 계보 선(ForkEdge)으로 잇는다.
import { useEffect, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import { api } from './api.js';
import { getState, toast, goWhenOpen } from './store.js';
import { useT, t, errText } from './lib/i18n.js';
import { shifted, linkLabelHidden } from './lib/link-labels.js';
import { labelFit } from './lib/labels.js';
import { forkable, forkTitle, fmtTokens, forkLines } from './lib/revive.js';
export { forkLines };

// 판의 API 키가 있는가(relay.status). 설정에서 키를 넣거나 빼면 relay.status 이벤트로 바뀐다
export function useRelayKey() {
  const [on, setOn] = useState(null);
  useEffect(() => {
    let live = true;
    api.call('relay.status', {}).then((s) => { if (live) setOn(!!(s && s.keyPresent)); }).catch(() => { if (live) setOn(false); });
    const off = api.on('relay.status', (s) => { if (live && s && s.keyPresent !== undefined) setOn(!!s.keyPresent); });
    return () => { live = false; if (off) off(); };
  }, []);
  return on;
}

// 다시 열기(어느 상태든 같은 길). 토스트는 판의 응답대로(보관된 것을 꺼냈는지, 대화를 이어 갔는지)
export async function reviveOf(ref, { go = true } = {}) {
  const r = await api.call('session.revive', { session: ref });
  const key = r.from === 'archived' ? 'revive.doneArchived' : r.resume === false ? 'revive.doneFresh' : 'revive.done';
  toast(t(key, { name: r.name }));
  if (go && r.sessionId) goWhenOpen(r.sessionId);
  return r;
}

// SDK로 갈라 열기. 응답의 대화 크기와 캐시 안내를 토스트로
export async function forkSdkOf(ref, { go = true } = {}) {
  const r = await api.call('session.fork', { session: ref, launcher: 'claude-sdk' });
  toast(t('revive.forked', { name: r.name, from: (r.from && r.from.name) || '?', tokens: r.size ? fmtTokens(r.size.tokens) : '?' }));
  if (go && r.sessionId) goWhenOpen(r.sessionId);
  return r;
}

// 노드 메뉴의 한 줄. 키가 없으면 흐리게 두고 까닭을 제목으로
export function ForkSdkRow({ s, onClose }) {
  const tt = useT();
  const key = useRelayKey();
  const [busy, setBusy] = useState(false);
  if (!forkable(s)) return null;
  const off = key === false;
  const go = () => {
    if (off || busy) return;
    setBusy(true);
    forkSdkOf(s.sessionId).then(() => { setBusy(false); onClose(); }, (e) => { setBusy(false); toast(tt('revive.forkFail', { error: errText(e) }), 'error'); });
  };
  return (
    <div className="mt-menu-row" data-role="fork-sdk-row">
      <button className={`mt-btn small${off ? ' dim-off' : ''}`} data-action="fork-sdk" aria-disabled={off ? 'true' : 'false'} disabled={busy} title={forkTitle(tt, key)} onClick={go}>{busy ? tt('revive.forking') : tt('revive.forkSdk')}</button>
      <span className="dim">{off ? tt('revive.noKey') : tt('revive.forkHint')}</span>
    </div>
  );
}

// 사이드바 줄의 작은 단추(닫힘 줄·보관함 줄). run: Sidebar의 바쁨 표시 감싸개
export function ForkSdkButton({ c, run, cls = 'mt-btn small ghost' }) {
  const tt = useT();
  const key = useRelayKey();
  if (!forkable(c)) return null;
  const off = key === false;
  return <button className={`${cls}${off ? ' dim-off' : ''}`} data-action="fork-sdk" aria-disabled={off ? 'true' : 'false'} title={forkTitle(tt, key)} onClick={(e) => { e.stopPropagation(); if (!off) run(c.sessionId, () => forkSdkOf(c.sessionId)); }}>{tt('revive.forkShort')}</button>;
}

// 갈라 온 계보 선(원래 세션 → 갈라 연 세션). 옅은 점선과 작은 글
export function ForkEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) {
  const tt = useT();
  const [path, lx0, ly0] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const [lx, ly] = shifted(lx0, ly0, data);
  const fit = labelFit(data);
  const hidden = !data || fit.compact || linkLabelHidden(data, { x: lx, y: ly });
  return <>
    <BaseEdge id={id} path={path} className="mt-edge fork" interactionWidth={0} />
    {/* 양 끝 점: 선이 다른 노드 밑을 지나도 어디서 시작해 어디에 닿는지 보이게(원래 세션 → 갈라 연 세션) */}
    <circle className="mt-edge-end fork" data-role="fork-end" data-end="source" cx={sourceX} cy={sourceY} r={3.5} />
    <circle className="mt-edge-end fork" data-role="fork-end" data-end="target" cx={targetX} cy={targetY} r={3.5} />
    {!hidden && <EdgeLabelRenderer>
      <div className="mt-edge-label fork nodrag nopan" data-role="fork-line" data-edge={id} style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, pointerEvents: 'none', '--fitw': `${fit.maxWidth}px` }}>{tt('revive.forkLine')}</div>
    </EdgeLabelRenderer>}
  </>;
}

export const reviveState = () => getState(); // 시험이 쓰는 자리(창 store)
