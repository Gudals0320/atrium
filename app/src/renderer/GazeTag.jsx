// P354: 시선 태그. 판 화면이 멈추면(이동·확대·관성이 끝나고 GAZE_REST_MS 그대로) 화면 가운데 세션을 골라(lib/gaze-pick.js gazePick)
//   명령줄에 'gaze' 이벤트로 알린다(넣을지는 CommandBar.jsx가 lib/gaze-pick.js gazeTag로 정한다). 판(Canvas)에 하나만 둔다.
//   - 누른 세션(P176 'autotag')이 먼저다. 그 노드가 화면 밖으로 완전히 나가면 고름이 풀리고(release) 시선 세션으로 돌아간다
//   - 빈 판을 누르면(P176, null) 판이 다시 움직일 때까지 고르지 않는다
//   - 명령줄이 초점을 받으면('gazeask') 바로 한 번 다시 고른다(열면 이미 태그되어 있게)
//   - 데스크톱만(손가락 화면은 하지 않는다), 세션 맵이 열린 동안과 설정이 꺼지면 고르지 않는다
import { useEffect } from 'react';
import { useStoreApi } from '@xyflow/react';
import { getState, setGazeId } from './store.js';
import { commandDraft } from './Thread.jsx';
import { gazePick, onScreen, canReceive } from './lib/gaze-pick.js';

export const GAZE_REST_MS = 450;
const isCoarse = () => { try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; } };

export function useGazeTag() {
  const flow = useStoreApi();
  useEffect(() => {
    if (isCoarse()) return undefined;
    let timer = 0;
    let clickId = null; // 누른 세션(고름)
    let blockAt = null; // 빈 판을 누른 때의 화면 변환(그대로인 동안 고르지 않는다)
    let gazeName = null; // 지금 시선으로 태그된 세션 이름(CommandBar가 'auto'로 알린다)
    const same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    const run = () => {
      timer = 0;
      const st = getState();
      if (!st.gazeOn || st.missionOpen) return;
      const fs = flow.getState();
      const tf = fs.transform;
      if (blockAt) { if (same(blockAt, tf)) return; blockAt = null; }
      const view = { x: tf[0], y: tf[1], zoom: tf[2] }, screen = { width: fs.width, height: fs.height };
      let release = false;
      if (clickId) {
        if (onScreen(st.nodes.get(clickId), view, screen)) return;
        clickId = null; release = true;
      }
      const nodes = [];
      for (const [id, r] of st.nodes) { const s = st.sessions.get(id); if (canReceive(s)) nodes.push({ id, name: s.name, x: r.x, y: r.y, w: r.w, h: r.h }); }
      const curS = gazeName ? [...st.sessions.values()].find((s) => s.name === gazeName) : null;
      const p = gazePick({ nodes, view, screen, current: curS ? curS.sessionId ?? null : null });
      commandDraft.dispatchEvent(new CustomEvent('gaze', { detail: { name: p ? p.name : null, release } }));
    };
    const later = () => { clearTimeout(timer); timer = setTimeout(run, GAZE_REST_MS); };
    let last = flow.getState().transform;
    const off = flow.subscribe((fs) => { if (fs.transform !== last && !same(fs.transform, last)) { last = fs.transform; later(); } });
    const onClick = (e) => {
      const name = e.detail || null;
      if (!name) { clickId = null; blockAt = flow.getState().transform; return; }
      const s = [...getState().sessions.values()].find((x) => x.name === name);
      clickId = s ? s.sessionId : null; blockAt = null;
    };
    const onAsk = () => { if (!timer) run(); }; // 움직이는 중이면 멈춘 뒤에 고른다
    const onAuto = (e) => {
      const d = e.detail || {};
      gazeName = d.by === 'gaze' ? d.name : null;
      const s = gazeName ? [...getState().sessions.values()].find((x) => x.name === gazeName) : null;
      setGazeId(s ? s.sessionId : null);
    };
    commandDraft.addEventListener('autotag', onClick);
    commandDraft.addEventListener('gazeask', onAsk);
    commandDraft.addEventListener('auto', onAuto);
    timer = setTimeout(run, GAZE_REST_MS + 300); // 판을 처음 그린 뒤
    return () => { off(); clearTimeout(timer); commandDraft.removeEventListener('autotag', onClick); commandDraft.removeEventListener('gazeask', onAsk); commandDraft.removeEventListener('auto', onAuto); setGazeId(null); };
  }, [flow]);
}
