// P153 r7: 세션 맵 PC = 시안 B "Lineage"(experiments/mm-concepts/project/B.dc.html, ARCH 4절 I6). 무한 캔버스 덮개. 옛 열 지도(Mission.jsx ClassicMission)는 숨은 설정 missionStyle: classic으로만.
// - 배치는 lib/mission-lineage.js(순수 함수): 폴더 = 가로 띠(왼쪽 기둥: 이름·워크스페이스·세션 수·상태 비율 막대), 워크스페이스 = 띠 안의 줄,
//   줄마다 고정 칸(워크스페이스 · 리드 · 워커 · 다음 단계 · 솔로). 관계 선은 종류마다 모양·화살촉·작은 이름표. 왼쪽 레일은 폴더 > 워크스페이스 목차(누르면 그 줄로).
//   칸 머리는 화면 위(위 줄 아래)에 붙어 있고 끌기·확대를 따라 옮겨 간다(paint가 DOM에 바로).
// - 사용자가 정한 것(시안 B보다 이긴다): 이름 "세션 맵", 줌(− % + 맞춤)만(단계 단추·미니맵·범례·B의 오른쪽 서랍 없음), 빈 곳 눌러도 안 닫힘(닫기 Esc·단추),
//   늘 떠 있는 명령줄(CommandBar), 카드 누르기 = 명령줄 @태그(여럿, 다시 누르면 뺌), 맵 안에서 친 글자 = 명령줄, 더블클릭·Enter = 판의 그 세션으로(첫 클릭 태그는 되돌림),
//   워크스페이스 줄 머리를 Alt+끌기로 다른 폴더 띠에 놓으면 그 폴더로(group.move, 띠 밖·폴더 없음 띠 = 폴더 없음. P155: Alt 없이 끌면 늘 시점 이동),옛 지도의 작업 완료 꼬리표, 판과 같은 배경, 앱 기본 글꼴(강조는 굵기),
//   작업 중 테두리 빛(P107), 처음 열 때 읽힘(폭 맞춤으로 위에서부터), 사이드바 소속, 역할로 이어진 무리, 무채색(제목·바탕에 색 없음, 색은 상태와 선 종류만).
// - 성능: 보기는 ref, 세계 한 요소의 transform만 바꾼다. 확대 단계 클래스(lv-far 등)·배율 글·칸 머리 자리·배경 격자는 DOM에 바로. 멀리 타일 글 하한(--ik)은 멈춘 뒤에.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useStore, getState, setMissionOpen, toast, wsName } from './store.js';
import { lineageLayout, headDrag, relationDrop, relationCall, applyRelationStub, labelStep, LINE, tagScale, todayWorkspaces, dayStart, msToMidnight, keepSameMap, graphKey, keepSameGraph, factsKeeper, keepCardBoxes, SHEET } from './lib/mission-lineage.js'; // P210: keepSameMap·graphKey·keepSameGraph·factsKeeper(다시 셀 것만) // P202: 오늘 일한 폴더 먼저 // P178: labelStep(이름표 배율 계단) // P155: headDrag(Alt+끌기만 옮기기)
import { levelOf, zoomAt, wheelK, panBy, fitView, centerOn, pressIntent, viewKey, stepCard, ZOOM } from './lib/mission-terr.js';
import { roleModel, nodeTier, roleText, modelText, ageText, summaryColumn } from './lib/mission-model.js';
import { kindOf } from './lib/kinds.js';
import { bgShow, bgText, bgKindsText } from './lib/bg-work.js'; // P164
import { orchTag, sessionProgress, progressChip, progressRows, progressPopText } from './lib/orch.js'; // P296. P300: 안 진행 칩
import { STATE_LABEL, shellProgram, shellStateText } from './lib/labels.js'; // P309: 셸에서 실행 중인 프로그램
import { useT, errText } from './lib/i18n.js';
import { leadTags } from './lib/cmd-input.js';
import { MissionLight, DoneMark } from './Mission.jsx';
import { SummaryColumn } from './SummaryColumn.jsx';
import { commandDraft } from './Thread.jsx';
import { noteMap, timedLayout } from './perf-trace.js'; // P210: 배치 셈·그래프 읽기·카드 그리기 세기(성능 기록 map 묶음)
import { mapMergers } from './lib/merger.js'; // P276: merger를 head → 하위 줄기 위에
import { DecisionMark } from './Decisions.jsx'; // P284: 결정 카드 표식
import { ManagerChip } from './Plan.jsx'; // P306: 관리자 세션의 레인 칩(작게)
import { useRowFit } from './lib/row-fit.js'; // P307: 휴대폰 맵 카드 첫 줄에서 이름이 밀려나지 않게
import { GuardBadge } from './Guard.jsx'; // P341: 폭주 배지(오른쪽 위 무리)
import { TodoBadge, TodoPop } from './MapTodo.jsx'; // P331: 할 일 배지·그 자리 답하기 미니 창(P333: 배지는 오른쪽 위 작업 완료 꼬리표와 한 무리)
import { todoCount, opensTodo, todoPlace } from './lib/map-todo.js';
import { planCountFor } from './lib/plans.js';
import { RecordChip } from './Records.jsx'; // P334: 일 기록 단추
import { Card as BaseCard, cardFacts, BgIcon, BgBadge, branchOfLive, ST, IDLE, setCardDrawHook } from './MapCard.jsx'; // P356: 카드·카드 사실은 가벼운 공용 모듈(휴대폰 맵 탭도 쓴다)
export { cardFacts, BgIcon, BgBadge };
setCardDrawHook(() => noteMap('cards')); // P210: 카드 그리기 세기(판 화면만)
// P356: 판 store에 기대는 표식은 판 화면(PC 세션 맵·옛 휴대폰 맵)이 넘긴다
const PC_PARTS = { Decision: DecisionMark, Manager: ManagerChip, Record: RecordChip, Guard: GuardBadge, Todo: TodoBadge };
export const Card = memo(function PcCard(p) { return <BaseCard {...p} parts={PC_PARTS} />; });

const TOPH = 52; // 위 줄(세션 맵 머리) 높이(보기 칸 기준)
const RAIL = 0; // P153 r9: 목차 레일은 없앴다(앱 사이드바를 같이 쓴다)
const BOTTOM = 112; // 아래 명령줄 자리
const PAD = 16;
const OPEN_MAX = 0.85; // 처음 화면(폭 맞춤) 배율 상한
const OPEN_K = 0.85; // P374: 처음 화면 배율 = 카드 글(이름·상태·모델 줄·지금 일)이 화면 11px 이상인 배율(styles.css P374가 작은 줄을 13px로). 판이 보기 칸보다 크면 끌어서 본다
const DOT_GAP = 92, DOT_R = 1.8, DOT_MIN_GAP = 28; // 판 배경 점 격자(Canvas.jsx DOT_GAP, 점 지름 3.6)와 같다. 멀리서는 솎는다
const ATTN_MAX = 4;
// P347: 요약 열 바닥 범례(선 종류 → 사전 열쇠). 견본은 맵 선과 같은 모양(.mt-ta-edge.k-*)
const LEGEND = [['spawn', 'mmLegend.spawn'], ['role', 'mmLegend.role'], ['prompt', 'mmLegend.prompt'], ['cross', 'mmLegend.cross'], ['peer', 'mmLegend.peer'], ['lineage', 'mmLegend.lineage']];
// P178·P179: 오른쪽 상태 요약 열(옛 열 지도 요약 열, SummaryColumn.jsx). 열려 있으면 맞춤·가운데 맞추기가 그 폭을 비워 둔다. 접힘은 이 기기(창)에 기억한다
const SUM_W = 288, SUM_GAP = 12; // P179: 옛 요약 열 폭
const SUM_KEY = 'atrium.sessionMap.summary';
// P374: 판 목표 비(lib/mission-lineage.js SHEET.ASPECT). 숨은 조정 열쇠(시험·비교용): 'view' 또는 수(예 1.3333). 없거나 틀리면 SHEET.ASPECT
const ASPECT_KEY = 'atrium.sessionMap.aspect';
const loadAspect = () => { try { const v = localStorage.getItem(ASPECT_KEY); if (v === 'view') return 'view'; const n = Number(v); return v && n > 0.3 && n < 5 ? n : SHEET.ASPECT; } catch { return SHEET.ASPECT; } };
// 정한 적이 없으면 넓은 창(1280px 이상)에서만 처음부터 연다(좁은 창·태블릿 세로에서는 카드 자리가 먼저)
const SUM_WIDE = 1280;
const loadSumOpen = () => { const wide = typeof window === 'undefined' || window.innerWidth >= SUM_WIDE; try { const v = localStorage.getItem(SUM_KEY); return v == null ? wide : v !== '0'; } catch { return wide; } };
const saveSumOpen = (on) => { try { localStorage.setItem(SUM_KEY, on ? '1' : '0'); } catch { /* 기억 못 해도 지금 화면은 된다 */ } };
const clip = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
// P164: 뒤 일 표시 아이콘(겹친 두 사각형 = 뒤에서 도는 일). 움직이지 않는다
// P164: 미리 보기의 뒤 일 목록(종류와 설명·명령 한 줄)
export function BgList({ f, t }) {
  if (!f.bg) return null;
  return <div className="pkbg" data-role="ln-peek-bg"><span className="lb">{t('mmBg.title')}</span>{f.bgKinds}{(f.bg.items || []).map((x, i) => <span key={i} className="it"><BgIcon /><b>{t(`mmBg.kind.${['shell', 'agent'].includes(x.kind) ? x.kind : 'other'}`)}</b>{x.label ? <span className="lbl">{clip(x.label, 120)}</span> : <span className="dim">{t('mmBg.noLabel')}</span>}</span>)}</div>;
}
// P300: 미리 보기의 안 진행 갈래 목록(읽기 전용)
export function ProgList({ f, t, now }) {
  if (!f.progress) return null;
  return <div className="pkpg" data-role="ln-peek-progress"><span className="lb">{progressPopText(f.progress, t).head}</span>{f.prog.text}{progressRows(f.progress, t, now || Date.now()).map((x, i) => <span key={i} className={`it st-${x.state}`} data-state={x.state}><i /><b>{x.stateText}</b><span className="lbl">{clip(x.name, 80)}</span>{x.dur ? <span className="dim"> · {x.dur}</span> : null}</span>)}</div>;
}
// 상태 색 클래스(시안 st-*): 등급 → 색
const KINDS = ['spawn', 'role', 'prompt', 'cross'];
// P374: 깊이 접기는 없앴다(모든 단계를 늘 보인다). 예전에 편 가지 기억(atrium.sessionMap.expanded)은 한 번 지운다
try { if (typeof localStorage !== 'undefined') localStorage.removeItem('atrium.sessionMap.expanded'); } catch { /* 지우지 못해도 쓰지 않는다 */ }
// P153 r12: 놓자마자 보이는 관계(판 답을 기다리는 동안, applyRelationStub = P156 그래프 모양)는 두 세션 쌍마다 하나
// P276: merger 선(merger → head 줄기)과 합치는 하위로 가는 나무 선의 클래스·끝 점(휴대폰 맵도 쓴다)
export const mergeEdgeCls = (e) => `mt-ta-edge k-merge st-${e.state || 'queued'}${e.state === 'merging' ? ' active' : ''}${e.idle ? ' idle' : ''}`;
export const mergeTreeCls = (e) => (e.merging ? ' merging' : e.mergeFailed ? ' merge-failed' : '');
// P276: head 위에 얹은 merger 카드의 역할 자리는 '솔로' 대신 누구의 일을 합치는지(head 이름, 아니면 null)
export const mergerHead = (b, lay) => { const h = b && b.merger && b.merger.head && lay.tree.byId.get(b.merger.head); return h ? h.name : null; };
export const mergeTip = (p, e) => `url(#${p}-end-merge${e.state === 'failed' ? '-failed' : ''})`;
const relKey = (x) => [x.a, x.b].sort().join('|');
const putRel = (list, x) => [...list.filter((y) => relKey(y) !== relKey(x)), x];

// 카드 사실(보통 단계 줄들, 풍선 도움말, 휴대폰 시트가 같이 쓴다)


// P153 r8: 카드 미리 보기(마우스를 HOVER_MS 올리거나 키보드 초점). 카드 옆에 뜨고 마우스를 받지 않는다(누르기·끌기는 그대로 카드·판으로).
// 사실은 카드 사실 + 판의 세션 요약(마지막 답, 질문과 선택지, 오류) + 최근 이벤트 몇 개 + 깨어 있는 세션이면 터미널 지금 화면 끝줄(읽기만, 화면만 읽음 P136, 휠 보고 없음).
// 절전·끝난 세션은 저장된 정보만(터미널을 읽지 않는다). 이벤트·화면은 처음 볼 때 읽고 PEEK_TTL 동안 담아 둔다
const HOVER_MS = 500, PEEK_TTL = 4000, PEEK_LINES = 10;
const peekCache = new Map(); // sessionId → { at, events, screen }
const lastLines = (text, n) => String(text || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim()).slice(-n);
export function Peek({ pv, f, b, live, tier, t, now, folder }) { // P160·P166: 휴대폰 세션 맵의 길게 누르기 미리 보기도 같은 내용(PhoneMap.jsx)
  const sid = b.node.sessionId;
  const awake = !!live && !['sleeping', 'exited'].includes(live.state) && !String(sid).startsWith('fk-');
  const [data, setData] = useState(() => peekCache.get(sid) || null);
  useEffect(() => {
    const hit = peekCache.get(sid);
    if (hit && Date.now() - hit.at < PEEK_TTL) { setData(hit); return undefined; }
    let alive = true;
    const real = !String(sid).startsWith('fk-');
    Promise.all([
      real ? api.call('session.events', { session: sid, limit: 6 }).catch(() => []) : Promise.resolve([]),
      awake ? api.call('terminal.snapshot', { session: sid, format: 'text' }).then((r) => lastLines(r && r.text, PEEK_LINES)).catch(() => null) : Promise.resolve(null),
    ]).then(([events, screen]) => { const d = { at: Date.now(), events: (events || []).slice(-4), screen }; peekCache.set(sid, d); if (alive) setData(d); });
    return () => { alive = false; };
  }, [sid, awake]);
  const ask = live && live.ask;
  const qs = ask && ask.kind === 'question' ? (ask.questions || []) : [];
  const answer = live && live.lastAnswer;
  const err = f.err || (live && live.error && (live.error.message || String(live.error))) || null;
  const task = (b.node.lastPrompt || (live && live.lastPrompt) || f.task || '').trim();
  const st = ST[tier] || 'ready';
  return (
    <div className={`mt-sm-peek st-${st}`} data-role="ln-peek" data-id={pv.id} style={{ left: pv.x, top: pv.y, width: pv.w }} aria-hidden="true">
      <div className="pk1"><b>{b.node.name}</b><span className="pst"><i />{f.stateText}{f.age ? <span className="dim"> · {f.age}</span> : null}</span></div>
      <div className="pk2">{[f.role, [f.harness, f.model].filter(Boolean).join(' · '), folder].filter(Boolean).join('  ·  ')}</div>
      {task ? <div className="pkt"><span className="lb">{t(`mmTerr.kind.${f.taskKind}`)}</span>{clip(task, 600)}</div> : null}
      {qs.length ? qs.slice(0, 2).map((q, i) => <div key={i} className="pkq"><span className="lb">{t('mmPeek.asks')}</span>{q.question}{(q.options || []).length ? <span className="opts">{q.options.slice(0, 6).map((o, j) => <span key={j}>{o.label || String(o)}</span>)}</span> : null}</div>) : ask && ask.summary ? <div className="pkq"><span className="lb">{t('mmPeek.asks')}</span>{ask.summary}</div> : null}
      <BgList f={f} t={t} />
      <ProgList f={f} t={t} now={now} />
      {err ? <div className="pke">{clip(err, 400)}</div> : null}
      {answer ? <div className="pka"><span className="lb">{t('mmPeek.answer')}</span><span className="txt">{clip(answer, 400)}</span></div> : null}
      {data && data.events && data.events.length ? <div className="pkv"><span className="lb">{t('mmPeek.events')}</span>{data.events.slice().reverse().map((e) => <span key={e.id} className="ev">{e.kind}{e.data && e.data.to ? ` → ${STATE_LABEL[e.data.to] || e.data.to}` : e.data && e.data.command ? ` ${clip(e.data.command, 40)}` : ''}<span className="dim"> · {ageText(now - e.t, t)}</span></span>)}</div> : null}
      {awake ? (data && data.screen ? <pre className="pks" data-role="ln-peek-screen">{data.screen.join('\n')}</pre> : <div className="pkn dim">{data ? t('mmPeek.noScreen') : t('common.loading')}</div>) : <div className="pkn dim" data-role="ln-peek-asleep">{t('mmPeek.asleep')}</div>}
    </div>
  );
}

const FolderIcon = () => <svg className="mt-ta-iico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2.5h6.5A1.5 1.5 0 0 1 20 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" /></svg>;
const XIcon = ({ s = 20 }) => <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true" className="mt-ta-x"><path d="M6 6l12 12M18 6L6 18" /></svg>;
// 글자 키인가(명령줄로 보낼 것): 한 글자 키, 또는 IME 조합 시작(Process)
const typedKey = (e) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'Process' || (e.key && e.key.length === 1));

// P202: 오늘·이전 이름표(세계 좌표). 머리(두 열) = 열 위 큰 이름표와 밑줄, 줄(한 열) = 가로 줄 위에 "오늘", 아래에 "이전". 움직임 없이 글과 줄만
export function SectionMark({ s, px, t }) {
  const fs = Math.round(px * 1.15 * 10) / 10;
  if (s.mode === 'line') return (
    <div className="mt-sm-sec line" data-role="ln-section" data-kind="split" style={{ left: s.x, top: s.y, width: s.w, height: s.h }}>
      <span className="up" style={{ fontSize: fs }}>{t('mmSec.today')}</span><i aria-hidden="true" /><span className="dn" style={{ fontSize: fs }}>{t('mmSec.earlier')}</span>
    </div>);
  return (
    <div className={`mt-sm-sec head ${s.kind}`} data-role="ln-section" data-kind={s.kind} data-col={s.col} style={{ left: s.x, top: s.y, width: s.w, height: s.h }}>
      <span style={{ fontSize: fs * 1.25 }}>{t(s.kind === 'today' ? 'mmSec.today' : 'mmSec.earlier')}</span>
    </div>);
}

export function LineageMap() {
  const t = useT();
  const open = useStore((st) => st.missionOpen);
  const sessions = useStore((st) => st.sessions);
  const links = useStore((st) => st.links);
  const thread = useStore((st) => st.thread);
  const loops = useStore((st) => st.loops);
  const workspaces = useStore((st) => st.workspaces);
  const vgroups = useStore((st) => st.groups);
  const [graph, setGraph] = useState(null);
  const [tags, setTags] = useState([]); // 명령줄 앞머리 태그 이름들
  const [vsize, setVsize] = useState(null); // 보기 칸 크기 { w, h }
  const [moveWs, setMoveWs] = useState(null); // 끄는 중인 줄 키
  const [pv, setPv] = useState(null); // 미리 보기 { id, x, y, w }(덮개 기준)
  const pvRef = useRef(null), hoverTimer = useRef(0);
  pvRef.current = pv;
  // P331: 그 자리 답하기 미니 창 { id(맵 카드), sid, name }. 자리는 paint가 DOM에 바로 쓴다(끌기·확대를 따라간다)
  const [todo, setTodo] = useState(null);
  const todoRef = useRef(null), popRef = useRef(null), placeRef = useRef(null), tagSetRef = useRef(new Set());
  todoRef.current = todo;
  const rootRef = useRef(null), vpRef = useRef(null), worldRef = useRef(null), pctRef = useRef(null), bgRef = useRef(null);
  const view = useRef(null); // { k, x, y }
  const fitted = useRef(false);
  const moveTimer = useRef(0), glideTimer = useRef(0);
  const justDragged = useRef(false);
  const layRef = useRef(null), sizeRef = useRef(null);
  const [pending, setPending] = useState([]); // 놓자마자 보이는 관계(판 답을 기다리는 동안). [{ a, b, relation, ok }]
  const [reloadN, setReloadN] = useState(0);
  // P178: 이름표 배율 계단(lib/mission-lineage.js labelStep). 움직임이 멈춘 뒤에만 바꾸고(배치를 다시 센다), 바뀌면 보던 카드가 화면 같은 자리에 남게 보기를 옮긴다
  const [lstep, setLstep] = useState(1);
  const lstepRef = useRef(1), anchorRef = useRef(null), pendingView = useRef(null);
  const [sumOpen, setSumOpen] = useState(loadSumOpen);
  const [aspect, setAspect] = useState(loadAspect); // P374: 판 목표 비(열 때마다 다시 읽는다)
  useEffect(() => { if (open) setAspect(loadAspect()); }, [open]);
  useEffect(() => { if (open) setSumOpen(loadSumOpen()); }, [open]); // 열 때마다 이 기기의 기억(없으면 창 폭)을 다시 읽는다
  const sumRef = useRef(sumOpen);
  sumRef.current = sumOpen;

  // P210: 그래프는 그래프에 닿는 세션 값(graphKey: 이름·상태·소속·관계·마지막 지시 등, 활동 시각 빼고)·연결·전달·루프가 바뀔 때만 다시 읽는다.
  //   바뀜이 잇따라도 미뤄지기만 하지 않게 첫 바뀜에서 300ms 뒤 한 번 읽고 그 사이 바뀜은 같이 담는다(전에는 바뀔 때마다 다시 미뤄 바쁜 동안 읽지 않았다).
  //   새 그래프가 시각 값만 다르면 앞 그래프를 그대로 쓴다(keepSameGraph, 배치를 다시 세지 않는다)
  const gkey = useMemo(() => graphKey(sessions), [sessions]);
  const fetchT = useRef(0), fetchGen = useRef(0);
  useEffect(() => () => { clearTimeout(fetchT.current); fetchT.current = 0; fetchGen.current++; }, []);
  useEffect(() => {
    if (!open) { clearTimeout(fetchT.current); fetchT.current = 0; fetchGen.current++; setGraph(null); fitted.current = false; view.current = null; return; }
    if (fetchT.current) return; // 기다리는 읽기가 이 바뀜도 담는다
    const gen = fetchGen.current;
    fetchT.current = setTimeout(() => {
      fetchT.current = 0;
      const t0 = performance.now();
      // 판이 바꾼 관계가 든 새 그래프가 오면 답을 받은(ok) 놓기 흉내는 걷는다
      api.call('mission.graph').then((g) => { noteMap('graph', performance.now() - t0); if (gen !== fetchGen.current) return; setGraph((prev) => keepSameGraph(prev, g)); setPending((p) => (p.some((x) => x.ok) ? p.filter((x) => !x.ok) : p)); }).catch((e) => { if (gen === fetchGen.current) toast(t('mission.fail', { error: errText(e) }), 'error'); });
    }, graph ? 300 : 0);
  }, [open, gkey, links, thread, loops, reloadN]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onText = (e) => { const next = leadTags(e.detail); setTags((cur) => (cur.join('\n') === next.join('\n') ? cur : next)); };
    commandDraft.addEventListener('text', onText);
    return () => commandDraft.removeEventListener('text', onText);
  }, []);
  // P153 r12: 다른 곳(에이전트 atrium child --peer, 다른 창)에서 관계가 바뀌면 그래프를 다시 읽는다
  useEffect(() => (open ? api.on('relation.updated', () => setReloadN((n) => n + 1)) : undefined), [open]);

  const liveOf = (n) => (n && n.sessionId ? sessions.get(n.sessionId) : null);
  // P210: 등급이 하나도 바뀌지 않은 세션 갱신(활동 시각·턴 진행)은 앞 표 그대로(배치·역할 모델·카드가 다시 돌지 않는다)
  const tiersRef = useRef(null);
  const tiers = useMemo(() => (tiersRef.current = keepSameMap(tiersRef.current, new Map(graph ? graph.nodes.filter((n) => n.kind === 'session').map((n) => [n.id, nodeTier(n, liveOf(n))]) : []))), [graph, sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  // P202: 오늘 일한 워크스페이스(폴더 차례). 자정이 지나면 맵을 연 채로도 다시 센다(day가 바뀐다). 같은 모음이면 배치를 다시 세지 않게 글 열쇠로 묶는다
  const [day, setDay] = useState(() => dayStart());
  useEffect(() => { if (!open) return undefined; const id = setTimeout(() => setDay(dayStart()), msToMidnight() + 500); return () => clearTimeout(id); }, [open, day]);
  const todayKey = graph ? [...todayWorkspaces(graph.nodes.filter((n) => n.kind === 'session'), { liveOf, tierOf: (n) => tiers.get(n.id), now: Math.max(Date.now(), day) })].sort().join('\n') : '';
  const today = useMemo(() => new Set(todayKey ? todayKey.split('\n') : []), [todayKey]);
  // P202: 두 열 판단에 쓰는 맞춤 칸(요약 열·머리·명령줄을 뺀 보기 칸)
  const fitArea = vsize ? { w: vsize.w - RAIL - (sumOpen ? SUM_W + SUM_GAP : 0), h: vsize.h - TOPH - BOTTOM } : null;
  const fitKey = fitArea ? `${fitArea.w}x${fitArea.h}` : '';
  const names = useMemo(() => new Map((workspaces || []).map((w) => [w.key, wsName(w.key)])), [workspaces]);
  // 판 그래프 + 답을 기다리는 놓기(pending). 판이 받은 관계는 판 그래프(P156)에 들어 있다
  const g2 = useMemo(() => (graph ? applyRelationStub(graph, pending) : null), [graph, pending]);
  // P276: merger 자리(열린 합치기 일의 원래 부모 = head 위). 내용이 같으면 같은 배열(배치를 다시 세지 않는다)
  const mergerView = useStore((st) => st.merger);
  const mergerLast = useStore((st) => st.mergerLast);
  const mkey = JSON.stringify(mapMergers(mergerView, mergerLast));
  const mergers = useMemo(() => JSON.parse(mkey), [mkey]);
  // P335: 카드마다 오른쪽 위 꼬리표 수(할 일 배지 + 작업 완료 꼬리표). 배치가 그 위를 비운다(lib/mission-lineage.js tagPass). 내용이 같으면 같은 Map(배치를 다시 세지 않는다)
  const decisions = useStore((st) => st.decisions);
  const plans = useStore((st) => st.plans);
  const tagKey = useMemo(() => {
    if (!graph) return '';
    const pl = plans ? [...plans.values()] : null;
    return graph.nodes.filter((n) => n.kind === 'session').map((n) => { const k = (todoCount(decisions, n.sessionId, n.sessionId && pl ? planCountFor(pl, n.sessionId) : 0) > 0 ? 1 : 0) + (tiers.get(n.id) === 'review' ? 1 : 0); return k ? `${n.id}\t${k}` : null; }).filter(Boolean).join('\n');
  }, [graph, decisions, plans, tiers]);
  const tagRows = useMemo(() => new Map(tagKey ? tagKey.split('\n').map((x) => { const [id, k] = x.split('\t'); return [id, Number(k)]; }) : []), [tagKey]);
  const layOpts = useMemo(() => ({ vgroups, tiers, names, noFolder: t('mmTerr.noFolder'), spineText: (w, n) => [t('mmTerr.workspaces', { n: w }), t('mmTerr.sessions', { n })], chipText: (tier, n) => `${n} ${t(`mmTerr.chip.${tier}`)}`, today, columns: 'auto', view: fitArea, aspect, mergers, tags: tagRows }), [vgroups, tiers, names, t, today, fitKey, aspect, mergers, tagRows]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastLay = useRef(null); // P210: 앞 배치(같은 카드 상자는 앞 객체로)
  const lay0 = useMemo(() => (lastLay.current = keepCardBoxes(lastLay.current, g2 ? timedLayout(() => lineageLayout(g2, { ...layOpts, label: lstep })) : null)), [g2, layOpts, lstep]);
  const lay = lay0;
  // P335: 꼬리표 무리 배수(--tk, CSS .mt-sm-tags)는 배치의 이름표 계단(lay.label)을 따른다. 배치가 비운 자리와 같은 배수
  useLayoutEffect(() => { const w = worldRef.current; if (w && lay) { const v = String(tagScale(lay.label)); if (w.style.getPropertyValue('--tk') !== v) w.style.setProperty('--tk', v); } }, [lay]);
  // P178: 맞춤 보기를 셀 때 다른 계단의 배치(선 길 찾기 없이, 크기만)
  const layForRef = useRef(null);
  layForRef.current = (st) => (g2 ? timedLayout(() => lineageLayout(g2, { ...layOpts, label: st, routing: false })) : null);
  const roles = useMemo(() => (g2 && lay ? roleModel(g2, { tiers, tree: lay.tree }) : new Map()), [g2, lay, tiers]);
  layRef.current = lay;
  sizeRef.current = vsize;
  const now = Date.now();
  const relOfChild = useMemo(() => { const m = new Map(); if (lay) for (const e of lay.edges) if (e.tree) m.set(e.to, e.rel); return m; }, [lay]);
  const keepFacts = useMemo(() => factsKeeper(), []); // P210: 같은 사실이면 앞 객체(카드 memo)
  const factsOf = useCallback((id) => {
    const b = lay.cards.get(id), n = b.node, m = roles.get(id);
    const pid = m && m.parentId, p = pid ? lay.tree.byId.get(pid) : null;
    const pws = p ? p.workspaceKey || '' : null;
    return keepFacts(id, cardFacts({ ...n, _rel: relOfChild.get(id) }, liveOf(n), m, tiers.get(id), t, now, { parentName: p ? p.name : null, parentWs: p ? (pws ? wsName(pws) : t('mmapGroup.noWorkspace')) : null, cross: !!p && pws !== (n.workspaceKey || ''), kids: (lay.tree.kids.get(id) || []).length, mergerFor: mergerHead(b, lay) }));
  }, [lay, roles, tiers, sessions, t, relOfChild]); // eslint-disable-line react-hooks/exhaustive-deps
  const tagSet = useMemo(() => new Set(tags.map((x) => x.toLowerCase())), [tags]);
  tagSetRef.current = tagSet; // P331: 누르기가 태그를 넣는지 빼는지(빼는 누르기는 미니 창을 열지 않는다)

  // ---- 보기 쓰기(DOM에 바로) ----
  const paint = useCallback((v, { glide = false } = {}) => {
    view.current = v;
    clearTimeout(hoverTimer.current);
    if (pvRef.current) { pvRef.current = null; setPv(null); } // 끌거나 확대하면 미리 보기는 비킨다
    const w = worldRef.current, root = rootRef.current;
    const lv = levelOf(v.k);
    if (w) {
      if (glide) { w.classList.add('glide'); clearTimeout(glideTimer.current); glideTimer.current = setTimeout(() => { w.classList.remove('glide'); checkStep(); }, 480); } else w.classList.remove('glide');
      w.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
      if (!w.classList.contains(`lv-${lv}`)) { w.classList.remove('lv-far', 'lv-mid', 'lv-near'); w.classList.add(`lv-${lv}`); }
      if (root && root.dataset.level !== lv) root.dataset.level = lv;
    }
    // 배경 점은 세계의 형제 층(.mt-ta-bg)에 쓴다(세계를 감싼 요소에 변수를 쓰면 카드 전부의 스타일을 다시 센다)
    const bg = bgRef.current;
    // P153 r8: 점은 화면에서 크기가 정해져 있다(지름 DOT_R·배율, 1~1.8px). 멀리 줄이면 간격이 DOT_MIN_GAP보다 좁아지지 않게 두 배씩 솎고 옅게 한다(촘촘한 회색 무늬가 되지 않게)
    if (bg) {
      let gs = DOT_GAP * v.k; while (gs < DOT_MIN_GAP) gs *= 2;
      bg.style.backgroundSize = `${gs}px ${gs}px`; bg.style.backgroundPosition = `${v.x % gs - gs / 2}px ${v.y % gs - gs / 2}px`;
      bg.style.setProperty('--dot-r', `${Math.min(DOT_R, Math.max(1, DOT_R * v.k))}px`);
      bg.style.opacity = String(Math.max(0.45, Math.min(1, v.k / 0.5)));
    }
    // P260: 칸 머리 띠는 없앴다(칸은 배치 규칙으로만 남는다)
    // 멀리 타일 글 하한(--ik = 1/배율): 움직이는 동안은 그대로, 멈춘 뒤(160ms)·처음·미끄러지기 때 한 번
    const setIk = () => { const ww = worldRef.current, kk = view.current && view.current.k; if (!ww || !kk || levelOf(kk) !== 'far') return; const ik = (1 / kk).toFixed(3); if (ww.style.getPropertyValue('--ik') !== ik) ww.style.setProperty('--ik', ik); };
    if (w && lv === 'far' && (glide || !w.style.getPropertyValue('--ik'))) setIk();
    if (pctRef.current) pctRef.current.textContent = `${Math.round(v.k * 100)}%`;
    if (root && !glide) { if (root.dataset.moving !== '1') root.dataset.moving = '1'; clearTimeout(moveTimer.current); moveTimer.current = setTimeout(() => { delete root.dataset.moving; setIk(); checkStep(); }, 160); } // P349: 움직이는 동안 빛 고리는 CSS가 숨긴다(styles.css P349, 예전 P210 holdLights)
    if (placeRef.current) placeRef.current(glide); // P331: 미니 창이 카드를 따라간다
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // P178: 움직임이 멈춘 뒤 이름표 계단이 바뀌었으면 배치를 다시 센다. 화면 가운데에 가장 가까운 카드를 닻으로 남겨, 새 배치에서도 그 카드가 같은 화면 자리에 있게 한다
  function checkStep() {
    const v = view.current, L = layRef.current, s = sizeRef.current;
    if (!v || !L) return;
    const st = labelStep(v.k);
    if (st === lstepRef.current) return;
    const cx = s ? (s.w - sumW()) / 2 : 0, cy = s ? (s.h + TOPH - BOTTOM) / 2 : 0;
    let best = null;
    for (const [id, b] of L.cards) { const sx = b.x * v.k + v.x, sy = b.y * v.k + v.y, d = Math.hypot(sx + b.w * v.k / 2 - cx, sy + b.h * v.k / 2 - cy); if (!best || d < best.d) best = { id, sx, sy, d }; }
    anchorRef.current = best ? { id: best.id, sx: best.sx, sy: best.sy } : null;
    lstepRef.current = st;
    setLstep(st);
  }
  // 오른쪽 요약 칸이 차지하는 폭(접혀 있으면 0)
  const sumW = () => (sumRef.current ? SUM_W + SUM_GAP : 0);
  // P178: 보기를 정하는 함수 mk(배치, 칸 크기)를 이름표 계단과 맞을 때까지(몇 번) 다시 센다. 계단이 바뀌면 새 배치가 그려진 뒤 그 보기를 쓴다
  const settle = (mk, opts) => {
    const s = sizeRef.current;
    let st = lstepRef.current, L = layRef.current;
    if (!L || !s) return;
    let v = mk(L, s);
    const seen = new Set([st]);
    for (let i = 0; i < 6; i++) {
      const st2 = labelStep(v.k);
      if (st2 === st) break;
      // 두 계단 사이를 오가면(좁은 창: 글이 커지면 맞춤이 작아지고, 작아지면 글이 커진다) 글이 더 큰(작은 계단) 쪽에 머문다
      const next = seen.has(st2) ? Math.min(st, st2) : st2;
      seen.add(next);
      if (next === st) break;
      const L2 = layForRef.current(next); if (!L2) break;
      st = next; L = L2; v = mk(L, s);
    }
    // 보기 배율이 이 계단 밖이면 계단 안(가장 큰 배율)으로 줄인다. 그래야 멈춘 뒤 계단을 다시 바꾸지 않는다(배치가 그대로라 내용은 더 작게 들어간다)
    if (labelStep(v.k) !== st && st < 1) {
      const kk = st * Math.sqrt(1.1) * 0.995;
      if (v.k > kk) v = zoomAt(v, v.x + L.bounds.x * v.k, v.y + L.bounds.y * v.k, kk);
    }
    if (st !== lstepRef.current) { pendingView.current = { v, opts }; anchorRef.current = null; lstepRef.current = st; setLstep(st); } else paint(v, opts);
  };
  // 맞춤: 세계 전체를 레일 오른쪽·위 줄과 칸 머리 아래·명령줄 위 칸에
  const fitOf = (L, s) => { const f = fitView(L.bounds, s.w - RAIL - sumW(), s.h, { top: TOPH, bottom: BOTTOM, pad: PAD }); return { ...f, x: f.x + RAIL }; };
  // P374: 처음 연 화면 = 카드가 읽히는 배율(OPEN_K, 사용자 2026-11-26: 맞추려고 줄이지 않는다). 판 전체가 그보다 크게 들어가면 맞춤.
  //   아니면 OPEN_K로 응답 필요 카드(없으면 오류 카드)를 가운데에, 둘 다 없으면 일하는 카드가 가장 많은 띠(없으면 첫 띠)의 왼쪽 위를 보기 칸 왼쪽 위에.
  //   판 가장자리 밖이 보이지 않게 보기를 판 안으로 당긴다(판이 보기 칸보다 작은 쪽은 그대로). 맞춤 단추는 판 전체(fitOf)
  const openOf = (L, s) => {
    const f = fitOf(L, s);
    if (f.k >= OPEN_K) return f;
    const k = OPEN_K, vw = s.w - RAIL - sumW(), tr = tiersRef.current || new Map();
    const into = (v) => {
      const b = L.bounds, x0 = RAIL + PAD - b.x * k, x1 = RAIL + vw - PAD - (b.x + b.w) * k, y0 = TOPH + 8 - b.y * k, y1 = s.h - BOTTOM - PAD - (b.y + b.h) * k;
      return { k, x: x1 < x0 ? Math.min(x0, Math.max(x1, v.x)) : v.x, y: y1 < y0 ? Math.min(y0, Math.max(y1, v.y)) : v.y };
    };
    const hot = ['turn', 'alert'].map((t) => L.order.find((id) => tr.get(id) === t)).find(Boolean);
    if (hot) {
      // 세로는 그 카드를 가운데로, 가로는 그 띠 왼쪽(폴더·워크스페이스 이름)부터 보이게. 카드가 오른쪽 밖으로 나가면 카드를 가운데로
      const b = L.cards.get(hot), c = centerOn(b.x + b.w / 2, b.y + b.h / 2, k, vw, s.h, { top: TOPH, bottom: BOTTOM });
      const row = L.rows.find((r) => r.key === b.ws), bx = row ? row.ox || 0 : 0, x = RAIL + PAD - bx * k;
      return into({ ...c, x: x + (b.x + b.w) * k <= RAIL + vw - PAD ? x : c.x + RAIL });
    }
    const busy = (band) => [...L.cards.values()].filter((c) => tr.get(c.node.id) === 'work' && L.rows.some((r) => r.key === c.ws && (r.band || null) === (band.id || null))).length;
    const band = L.bands.reduce((a, b) => (busy(b) > busy(a) ? b : a), L.bands[0]);
    if (!band) return into({ k, x: RAIL + PAD - L.bounds.x * k, y: TOPH + 8 - L.bounds.y * k });
    return into({ k, x: RAIL + PAD - (band.x || 0) * k, y: TOPH + 8 - band.y * k });
  };
  const fit = useCallback((glide = true) => settle(fitOf, { glide }), [paint]); // eslint-disable-line react-hooks/exhaustive-deps
  const zoomCenter = useCallback((k2) => { const s = sizeRef.current, v = view.current; if (s && v) paint(zoomAt(v, (s.w - sumW() + RAIL) / 2, (s.h + TOPH - BOTTOM) / 2, k2), { glide: true }); }, [paint]); // eslint-disable-line react-hooks/exhaustive-deps
  const flyTo = useCallback((id, k) => {
    const L = layRef.current, s = sizeRef.current, v = view.current, b = L && L.cards.get(id);
    if (!b || !s || !v) return;
    const c = centerOn(b.x + b.w / 2, b.y + b.h / 2, k || Math.max(0.9, v.k), s.w - RAIL - sumW(), s.h, { top: TOPH, bottom: BOTTOM });
    paint({ ...c, x: c.x + RAIL }, { glide: true });
  }, [paint]); // eslint-disable-line react-hooks/exhaustive-deps
  // P153 r9: 앱 사이드바가 세션 맵을 움직인다(Sidebar.jsx가 getState().mapFocus를 부른다). 세션 = 지금 배율 그대로 가운데로, 워크스페이스 줄·폴더 띠 = 그 상자에 맞춤.
  // 간 뒤 그 카드·줄·띠를 세 번 반짝인다(.blink, 움직임 줄이기에서도 판 설정 workLight가 끔이 아니면 돈다)
  const blink = useCallback((sel) => { const root = rootRef.current, el = root && root.querySelector(sel); if (!el) return; el.classList.remove('blink'); void el.offsetWidth; el.classList.add('blink'); setTimeout(() => el.classList.remove('blink'), 2200); }, []);
  // P178: 카드 하나로 가기(배율은 그대로, 그 카드를 가운데로, 세 번 반짝임). 사이드바 세션 줄과 오른쪽 요약 칸이 같이 쓴다
  const focusCard = useCallback((id) => {
    const L = layRef.current, v = view.current, s = sizeRef.current, b = L && L.cards.get(id);
    if (!b || !v || !s) return false;
    const c = centerOn(b.x + b.w / 2, b.y + b.h / 2, v.k, s.w - RAIL - sumW(), s.h, { top: TOPH, bottom: BOTTOM });
    paint({ ...c, x: c.x + RAIL }, { glide: true });
    setTimeout(() => blink(`.mt-ta-slot[data-id="${CSS.escape(id)}"]`), 460);
    return true;
  }, [paint, blink]); // eslint-disable-line react-hooks/exhaustive-deps
  const fitBoxTo = useCallback((r) => { const s = sizeRef.current; if (!s || !r) return; const f = fitView(r, s.w - RAIL - sumW(), s.h, { top: TOPH, bottom: BOTTOM, pad: 40, max: OPEN_MAX }); paint({ ...f, x: f.x + RAIL }, { glide: true }); }, [paint]);
  useEffect(() => {
    if (!open) return undefined;
    const st = getState();
    st.mapFocus = {
      session: (sid) => { const L = layRef.current; const hit = L && [...L.cards.entries()].find(([, b]) => b.node.sessionId === sid); return hit ? focusCard(hit[0]) : false; },
      ws: (key) => { const L = layRef.current, r = L && L.rows.find((x) => x.key === key); if (!r) return false; fitBoxTo({ x: r.ox || 0, y: r.y, w: L.W, h: r.h }); setTimeout(() => blink(`.mt-sm-row[data-key="${CSS.escape(key)}"]`), 460); return true; },
      group: (gid) => { const L = layRef.current, b = L && L.bands.find((x) => (x.id || null) === (gid || null)); if (!b) return false; fitBoxTo({ x: b.x || 0, y: b.y, w: L.W, h: b.h }); setTimeout(() => blink(`.mt-sm-band[data-id="${CSS.escape(b.id || 'none')}"]`), 460); return true; },
    };
    return () => { if (getState().mapFocus === st.mapFocus) getState().mapFocus = null; };
  }, [open, paint, blink, fitBoxTo, focusCard]);

  useLayoutEffect(() => {
    const el = vpRef.current;
    if (!open || !el) return undefined;
    const read = () => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setVsize((v) => (v && v.w === Math.round(r.width) && v.h === Math.round(r.height) ? v : { w: Math.round(r.width), h: Math.round(r.height) })); };
    read();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', read);
    return () => { if (ro) ro.disconnect(); else window.removeEventListener('resize', read); };
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !lay || !vsize) return;
    if (!fitted.current) { fitted.current = true; settle(openOf); }
    else if (pendingView.current) { const p = pendingView.current; pendingView.current = null; paint(p.v, p.opts); }
    else if (anchorRef.current && view.current) {
      // P178: 이름표 계단이 바뀌어 배치가 달라졌다. 닻 카드가 같은 화면 자리에 남게 옮긴다
      const a = anchorRef.current, b = lay.cards.get(a.id), v = view.current;
      anchorRef.current = null;
      paint(b ? { k: v.k, x: a.sx - b.x * v.k, y: a.sy - b.y * v.k } : v);
    } else if (view.current) paint(view.current);
  }, [open, lay, vsize, paint]); // eslint-disable-line react-hooks/exhaustive-deps

  // 미리 보기: 카드 위에 HOVER_MS 머물면(또는 초점) 카드 옆에. 오른쪽에 자리가 없으면 왼쪽
  const onHover = useCallback((id, el) => {
    clearTimeout(hoverTimer.current);
    if (!id || !el) { if (pvRef.current) setPv(null); return; }
    if (todoRef.current && todoRef.current.id === id) return; // P331: 미니 창이 떠 있는 카드에는 미리 보기를 띄우지 않는다
    hoverTimer.current = setTimeout(() => {
      const root = rootRef.current; if (!root || !el.isConnected) return;
      const r = el.getBoundingClientRect(), R = root.getBoundingClientRect(), w = 380;
      let x = r.right - R.left + 12;
      if (x + w > R.width - 8) x = Math.max(8, r.left - R.left - 12 - w);
      const y = Math.max(60 + TOPH + 6, Math.min(r.top - R.top, R.height - 360));
      setPv({ id, x, y, w });
    }, HOVER_MS);
  }, []);

  const lastTag = useRef(null); // { id, at }: 마지막 카드 누르기(더블클릭이면 되돌린다)
  const go = useCallback((id, dbl = false) => {
    const L = layRef.current, b = L && L.cards.get(id);
    // 더블클릭의 첫 클릭이 넣거나 뺀 태그를 되돌린다(더블클릭은 판으로 가는 것이지 태그가 아니다)
    const lt = lastTag.current;
    if (dbl && b && lt && lt.id === id && Date.now() - lt.at < 800) commandDraft.dispatchEvent(new CustomEvent('tag', { detail: b.node.name }));
    lastTag.current = null;
    setMissionOpen(false);
    const st = getState();
    // P157: 날아가기(줌 아웃 → 이동 → 줌 인) 없이 그 세션 맞춤 보기로 한 번에
    if (b && b.node.sessionId) setTimeout(() => st.navigateTo && st.navigateTo(b.node.sessionId, { instant: true }), 30);
  }, []);
  const tag = useCallback((id, e) => {
    const L = layRef.current, b = L && L.cards.get(id);
    if (!b || justDragged.current) return;
    if (e && e.detail > 1) return; // 더블클릭의 둘째 클릭은 태그를 바꾸지 않는다(첫 클릭은 go가 되돌린다)
    // P331: 열린 할 일이 있으면 카드 옆에 미니 창(태그를 빼는 누르기는 아니다). 셸도 할 일이 있으면 연다
    const sid = b.node.sessionId, st = getState();
    const wasTagged = tagSetRef.current.has(String(b.node.name).toLowerCase());
    const count = todoCount(st.decisions, sid, sid && st.plans ? planCountFor([...st.plans.values()], sid) : 0);
    if (opensTodo({ count, wasTagged })) { clearTimeout(hoverTimer.current); if (pvRef.current) setPv(null); setTodo({ id, sid, name: b.node.name }); }
    else if (todoRef.current && todoRef.current.id === id) setTodo(null);
    if (b.node.agentKind === 'shell') return; // 셸은 메시지를 받지 않는다
    lastTag.current = { id, at: Date.now() };
    commandDraft.dispatchEvent(new CustomEvent('tag', { detail: b.node.name }));
  }, []);

  // ---- 줄 옮기기(소속만): 놓은 자리의 폴더 띠 → group.move. 폴더 없음 띠·띠 밖 = 폴더 없음 ----
  const bandAt = (L, wx, wy) => L.bands.find((x) => wx >= (x.x || 0) && wx <= (x.x || 0) + L.W && wy >= x.y && wy <= x.y + x.h) || null; // P202: 두 열이면 그 열의 띠
  const moveRow = useCallback((key, bandId) => {
    const L = layRef.current;
    const row = L && L.rows.find((r) => r.key === key);
    if (!row || (row.band || null) === (bandId || null)) return;
    const gs = getState().groups || [];
    const name = bandId ? (gs.find((g) => g.id === bandId) || {}).name : null;
    api.call('group.move', { workspace: key, group: bandId || null }).then(() => toast(bandId ? t('mmTerr.movedTo', { ws: wsName(key), folder: name || '' }) : t('mmTerr.movedOut', { ws: wsName(key) }))).catch((e) => toast(t('mmTerr.moveFail', { error: errText(e) }), 'error'));
  }, [t]);

  // ---- P153 r11·r12: 관계 바꾸기(Alt+카드 끌기). 놓자마자 맵에 보이고(pending), 판 relation.set(P156)을 부른다(계보는 사실이라 그대로, session.detach는 쓰지 않는다).
  // 실패하면 되돌리고 알린다. cycle(끈 세션 아래에 대상이 있다)은 따로 분명한 글 ----
  const setRelation = useCallback((dragId, drop) => {
    const L = layRef.current;
    const call = L && relationCall(L, dragId, drop);
    if (!call) return;
    const nm = (sid) => { const n = L.tree.nodes.find((x) => x.sessionId === sid); return n ? n.name : sid; };
    const done = () => toast(t(call.relation === 'sub' ? 'mmLine.relSub' : call.relation === 'peer' ? 'mmLine.relPeer' : 'mmLine.relNone', { name: nm(call.b), up: nm(call.a) }));
    setPending((p) => putRel(p, { ...call, ok: false }));
    api.call('relation.set', call).then(() => {
      done();
      setPending((p) => p.map((x) => (relKey(x) === relKey(call) ? { ...x, ok: true } : x)));
      setReloadN((n) => n + 1);
    }).catch((e) => {
      setPending((p) => p.filter((x) => relKey(x) !== relKey(call)));
      if (e && e.code === 'cycle') { toast(t('mmLine.relCycle', { name: nm(call.b), up: nm(call.a) }), 'error'); return; }
      toast(t('mmLine.relFail', { error: errText(e) }), 'error');
    });
  }, [t]);

  // ---- 끌기·두 손가락·휠·줄 머리 끌기 ----
  useEffect(() => {
    const el = vpRef.current;
    if (!open || !el) return undefined;
    const pts = new Map();
    let g = null; // { mode: 'press'|'drag'|'pinch'|'row', ... }
    const local = (e) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const setAlt = (on) => { if (on) { if (el.dataset.alt !== '1') el.dataset.alt = '1'; } else if (el.dataset.alt) delete el.dataset.alt; }; // P155
    const begin = () => {
      const v = view.current; if (!v) { g = null; return; }
      const p = [...pts.values()];
      if (p.length >= 2) g = { mode: 'pinch', v0: v, m0: { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }, d0: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1 };
      else if (p.length === 1) g = { mode: g && g.mode !== 'press' ? 'drag' : 'press', v0: v, p0: p[0] };
      else g = null;
    };
    // 끄는 줄과 그 안의 카드(세계에서 형제 요소라 함께 옮긴다)
    const rowEls = (key) => [...el.querySelectorAll(`.mt-sm-row[data-key="${CSS.escape(key)}"], .mt-ta-slot[data-ws="${CSS.escape(key)}"]`)];
    const hotBand = (id) => { for (const x of el.querySelectorAll('.mt-sm-band')) x.classList.toggle('drop', id != null && x.dataset.id === id); };
    const bandKey = (b) => (b ? b.id || 'none' : 'none');
    const endRow = (commit, p) => {
      const s = g; g = null;
      for (const ie of rowEls(s.key)) { ie.style.transform = ''; ie.classList.remove('moving'); }
      hotBand(null);
      el.classList.remove('dragging');
      setMoveWs(null);
      if (commit && s.moved) {
        const v = view.current, L = layRef.current;
        const bb = L && v ? bandAt(L, (p.x - v.x) / v.k, (p.y - v.y) / v.k) : null;
        moveRow(s.key, bb ? bb.id : null);
      }
    };
    // P153 r11: 카드 끌기(관계 바꾸기). 놓을 자리 미리 보기(.mt-sm-drop)와 대상 카드 강조는 DOM에 바로(끄는 동안 다시 그리지 않는다)
    const slotEl = (id) => el.querySelector(`.mt-ta-slot[data-id="${CSS.escape(id)}"]`);
    const showDrop = (d) => {
      const box = el.querySelector('.mt-sm-drop');
      for (const x of el.querySelectorAll('.mt-ta-slot.drop-target')) if (!d || x.dataset.id !== d.target) x.classList.remove('drop-target');
      if (!box) return;
      if (!d) { box.hidden = true; delete box.dataset.kind; return; }
      const L = layRef.current, tn = d.target && L ? (L.tree.byId.get(d.target) || {}).name : '';
      box.hidden = false; box.dataset.kind = d.kind;
      Object.assign(box.style, { left: `${d.box.x}px`, top: `${d.box.y}px`, width: `${d.box.w}px`, height: `${d.box.h}px` });
      const lb = box.firstChild; if (lb) lb.textContent = t(d.kind === 'sub' ? 'mmLine.dropSub' : d.kind === 'peer' ? 'mmLine.dropPeer' : 'mmLine.dropNone', { name: tn });
      if (d.target) { const te = slotEl(d.target); if (te) te.classList.add('drop-target'); }
    };
    const endCard = (commit) => {
      const s = g; g = null;
      const se = slotEl(s.id); if (se) { se.style.transform = ''; se.classList.remove('moving'); }
      showDrop(null);
      el.classList.remove('dragging', 'card-moving');
      if (commit && s.moved && s.drop) setRelation(s.id, s.drop);
    };
    const down = (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('.mt-ta-hud')) return;
      justDragged.current = false;
      if (e.target.closest('.mt-sm-fold')) return; // 접기 칩은 누르기만
      setAlt(e.altKey);
      // P153 r11: Alt+카드 끌기 = 관계 바꾸기(마우스 왼쪽만). Alt 없이 끌면 시점 이동
      const card = e.target.closest('.mt-ta-card');
      if (card && !pts.size && e.altKey && e.pointerType === 'mouse' && e.button === 0) { const p = local(e); pts.set(e.pointerId, p); g = { mode: 'card', id: card.dataset.id, p0: p, moved: false, drop: null }; return; }
      // P155: 줄 머리 옮기기는 Alt+끌기만(headDrag). Alt 없이 누르면 줄 머리에서도 시점 이동.
      // P153 r11: 잡는 자리는 줄 머리 + 워크스페이스 칸 빈 곳 전체(.mt-sm-grab, Alt를 누르는 동안만 누를 수 있다)
      const head = e.target.closest('.mt-sm-head, .mt-sm-grab');
      if (head && !pts.size && headDrag({ onHead: true, altKey: e.altKey, button: e.button, pointerType: e.pointerType }) === 'row') { const p = local(e); pts.set(e.pointerId, p); g = { mode: 'row', key: head.dataset.key, p0: p, moved: false }; return; }
      pts.set(e.pointerId, local(e));
      begin();
    };
    const move = (e) => {
      if (e.pointerType === 'mouse') setAlt(e.altKey); // 창 밖에서 Alt를 누르고 들어온 경우도 맞춘다
      if (!pts.has(e.pointerId) || !g) return;
      const lp = local(e);
      pts.set(e.pointerId, lp);
      if (g.mode === 'card') {
        const dx = lp.x - g.p0.x, dy = lp.y - g.p0.y, v = view.current;
        if (!g.moved && pressIntent({ dx, dy }) !== 'drag') return;
        if (!g.moved) { g.moved = true; el.classList.add('dragging', 'card-moving'); clearTimeout(hoverTimer.current); if (pvRef.current) setPv(null); try { el.setPointerCapture(e.pointerId); } catch { /* 잡지 못해도 끌기는 된다 */ } }
        justDragged.current = true;
        const se = slotEl(g.id);
        if (se && v) { se.classList.add('moving'); se.style.transform = `translate(${dx / v.k}px, ${dy / v.k}px)`; }
        const L = layRef.current;
        g.drop = L && v ? relationDrop(L, g.id, (lp.x - v.x) / v.k, (lp.y - v.y) / v.k) : null;
        showDrop(g.drop);
        return;
      }
      if (g.mode === 'row') {
        const dx = lp.x - g.p0.x, dy = lp.y - g.p0.y, v = view.current;
        if (!g.moved && pressIntent({ dx, dy }) !== 'drag') return;
        if (!g.moved) { g.moved = true; el.classList.add('dragging'); setMoveWs(g.key); try { el.setPointerCapture(e.pointerId); } catch { /* 잡지 못해도 끌기는 된다 */ } }
        justDragged.current = true;
        if (v) for (const ie of rowEls(g.key)) { ie.classList.add('moving'); ie.style.transform = `translate(${dx / v.k}px, ${dy / v.k}px)`; }
        const L = layRef.current;
        const bb = L && v ? bandAt(L, (lp.x - v.x) / v.k, (lp.y - v.y) / v.k) : null;
        hotBand(bandKey(bb));
        return;
      }
      const p = [...pts.values()];
      if (g.mode === 'pinch' && p.length >= 2) {
        const m = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }, d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
        const z = zoomAt(g.v0, g.m0.x, g.m0.y, g.v0.k * (d / g.d0));
        justDragged.current = true;
        paint(panBy(z, m.x - g.m0.x, m.y - g.m0.y));
        return;
      }
      if (p.length !== 1 || !g.p0) return;
      const dx = p[0].x - g.p0.x, dy = p[0].y - g.p0.y;
      if (g.mode === 'press' && pressIntent({ dx, dy }) === 'drag') { g.mode = 'drag'; el.classList.add('dragging'); try { el.setPointerCapture(e.pointerId); } catch { /* 잡지 못해도 끌기는 된다 */ } }
      if (g.mode === 'drag') { justDragged.current = true; paint(panBy(g.v0, dx, dy)); }
    };
    const up = (e) => {
      if (!pts.has(e.pointerId)) return;
      const lp = local(e);
      pts.delete(e.pointerId);
      if (g && g.mode === 'row') { endRow(e.type === 'pointerup', lp); return; }
      if (g && g.mode === 'card') { endCard(e.type === 'pointerup'); return; }
      if (!pts.size) { g = null; el.classList.remove('dragging'); } else begin();
    };
    // P374: 휠은 판을 끈다(세로, Shift+휠·가로 휠 = 가로). Ctrl·⌘+휠(터치패드 오므리기 포함)은 전처럼 확대·축소
    const wheel = (e) => {
      if (e.target.closest('.mt-ta-hud')) return;
      e.preventDefault();
      const v = view.current; if (!v) return;
      if (e.ctrlKey || e.metaKey) { const p = local(e); paint(zoomAt(v, p.x, p.y, wheelK(v.k, e.deltaY, e.deltaMode))); return; }
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      let dx = e.deltaX * unit, dy = e.deltaY * unit;
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      paint(panBy(v, -dx, -dy));
    };
    const click = (e) => { if (justDragged.current) { e.stopPropagation(); e.preventDefault(); justDragged.current = false; } };
    const esc = (e) => { if (e.key === 'Escape' && g && g.mode === 'row') { e.preventDefault(); e.stopPropagation(); pts.clear(); endRow(false); } else if (e.key === 'Escape' && g && g.mode === 'card') { e.preventDefault(); e.stopPropagation(); pts.clear(); endCard(false); } };
    // P155: Alt를 누르고 있는 동안 보기 칸에 data-alt="1"(줄 머리에 옮기기 커서·강조, styles.css 끝).
    // Alt만 눌렀다 떼면 창 메뉴로 초점이 가는 일이 없게 기본 동작을 막는다(세션 맵이 열린 동안만). 창이 초점을 잃으면 끈다
    const altKey = (e) => {
      if (e.key !== 'Alt') return;
      setAlt(e.type === 'keydown');
      if (!e.ctrlKey && !e.shiftKey && !e.metaKey) e.preventDefault();
    };
    const altOff = () => setAlt(false);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('click', click, true);
    window.addEventListener('keydown', esc, true);
    window.addEventListener('keydown', altKey, true); window.addEventListener('keyup', altKey, true); window.addEventListener('blur', altOff);
    return () => {
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel); el.removeEventListener('click', click, true); window.removeEventListener('keydown', esc, true);
      window.removeEventListener('keydown', altKey, true); window.removeEventListener('keyup', altKey, true); window.removeEventListener('blur', altOff);
      delete el.dataset.alt;
    };
  }, [open, paint, moveRow, setRelation, t]);

  // ---- 키: Esc 닫기, 친 글자는 명령줄로, 화살표 끌기, 카드에 초점이 있으면 ↑↓로 카드 다니기 ----
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      const tag2 = (e.target && e.target.tagName) || '';
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag2) || (e.target && e.target.isContentEditable);
      if (e.key === 'Escape' && !typing) { e.preventDefault(); setMissionOpen(false); return; }
      if (typing || getState().dialog) return;
      if (typedKey(e) && !(e.key === ' ' && e.target && e.target.closest && e.target.closest('.mt-ta-card'))) { commandDraft.dispatchEvent(new CustomEvent('focus')); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const card = e.target && e.target.closest ? e.target.closest('.mt-ta-card') : null;
      const L = layRef.current;
      if (card && L && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const next = stepCard(L.order.filter((id) => !L.cards.get(id).folded), card.dataset.id, e.key === 'ArrowDown' ? 1 : -1); // P198: 접힌 줄 안 세션은 건너뛴다
        const el = next && rootRef.current && rootRef.current.querySelector(`.mt-ta-card[data-id="${CSS.escape(next)}"]`);
        if (el) { el.focus({ preventScroll: true }); flyTo(next); }
        return;
      }
      const a = viewKey(e.key, { shift: e.shiftKey });
      if (!a || !a.pan) return;
      e.preventDefault();
      if (view.current) paint(panBy(view.current, a.pan[0], a.pan[1]), { glide: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, flyTo, paint]);
  // P331: 미니 창 자리. 카드 상자(세계) × 보기 = 보기 칸 좌표, 덮개 좌표는 보기 칸의 offsetTop을 더한다. 미끄러지는 보기(glide)는 같은 박자로 따라간다
  placeRef.current = (glide = false) => {
    const el = popRef.current, cur = todoRef.current, L = layRef.current, v = view.current, s = sizeRef.current, vp = vpRef.current;
    if (!el || !cur || !L || !v || !s) return;
    const b = L.cards.get(cur.id);
    if (!b || b.folded) { el.style.visibility = 'hidden'; return; }
    const p = todoPlace({ x: b.x * v.k + v.x, y: b.y * v.k + v.y, w: b.w * v.k, h: b.h * v.k }, { w: el.offsetWidth, h: el.offsetHeight }, { w: s.w, h: s.h, top: TOPH, bottom: BOTTOM, right: sumW() });
    el.style.transition = glide ? 'left 0.45s cubic-bezier(0.2, 0.7, 0.2, 1), top 0.45s cubic-bezier(0.2, 0.7, 0.2, 1)' : ''; // 세계 .mt-ta-world.glide와 같은 박자
    el.style.visibility = p.hidden ? 'hidden' : '';
    el.style.left = `${Math.round(p.x)}px`; el.style.top = `${Math.round(p.y + (vp ? vp.offsetTop : 0))}px`;
    el.dataset.side = p.side;
  };
  useEffect(() => { if (!open) setTodo(null); }, [open]);
  // P331: Esc·다른 곳 누르기로 닫는다(창 안 누르기·끌기 끝의 누르기는 아니다). Esc는 세션 맵 닫기보다 먼저 받는다
  const todoOn = !!todo;
  useEffect(() => {
    if (!todoOn) return undefined;
    const onKey = (e) => { if (e.key !== 'Escape' || getState().dialog) return; e.preventDefault(); e.stopImmediatePropagation(); setTodo(null); };
    const onClick = (e) => { const p = popRef.current; if (p && e.target && p.contains(e.target)) return; if (justDragged.current) return; setTodo(null); };
    window.addEventListener('keydown', onKey, true); window.addEventListener('click', onClick, true);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('click', onClick, true); };
  }, [todoOn]);
  useLayoutEffect(() => { if (todoOn && placeRef.current) placeRef.current(); }, [todoOn, lay, vsize, sumOpen]);
  window.__mtTa = { view: () => (view.current ? { ...view.current } : null), fit: () => fit(false), flyTo, lay: () => layRef.current, set: (v) => paint(v), tags: () => tags, rail: RAIL, top: TOPH, label: () => lstepRef.current, sumW }; // 시험이 읽는다

  if (!open) return null;
  const ids = lay ? lay.order : [];
  const shown = lay ? ids.filter((id) => !lay.cards.get(id).folded) : []; // P198: 접힌 줄 안 세션은 카드 항목이지만 그리지 않는다
  const attn = ids.filter((id) => tiers.get(id) === 'turn' || tiers.get(id) === 'alert').sort((a, b) => (tiers.get(a) === 'turn' ? 0 : 1) - (tiers.get(b) === 'turn' ? 0 : 1));
  const nWork = ids.filter((id) => tiers.get(id) === 'work').length, nDone = ids.filter((id) => tiers.get(id) === 'review').length;
  const tagOf = (id) => { const b = lay.cards.get(id); return !!b && tagSet.has(String(b.node.name).toLowerCase()); };
  const sum = summaryColumn(ids, (id) => tiers.get(id));
  // P178: 요약 칸 줄에 마우스를 올리면 그 카드를 강조한다(DOM에 바로, 다시 그리지 않는다)
  const sumHot = (id) => { const root = rootRef.current; if (!root) return; for (const x of root.querySelectorAll('.mt-ta-slot.sum-hot')) if (x.dataset.id !== id) x.classList.remove('sum-hot'); if (id) { const el = root.querySelector(`.mt-ta-slot[data-id="${CSS.escape(id)}"]`); if (el) el.classList.add('sum-hot'); } };
  const toggleSum = () => { const on = !sumOpen; saveSumOpen(on); setSumOpen(on); };
  // P179: 줄의 둘째 글(옛 요약 열과 같이): 응답 필요 = 질문이나 오류, 작업 중 = "지금: …", 작업 완료 = 역할
  const sumLine = (id, key) => {
    const f = factsOf(id);
    if (key === 'turn') return f.err || f.task || f.stateText;
    if (key === 'work') return f.task ? t('mmMap.sumNow', { text: f.task }) : f.stateText;
    return f.role || f.stateText;
  };
  const leads = lay ? new Set([...lay.cards.entries()].filter(([id, b]) => b.depth >= 0 && (lay.tree.kids.get(id) || []).some((c) => (c.workspaceKey || '') === (b.node.workspaceKey || ''))).map(([id]) => id)) : new Set();
  const edgeText = (e) => (e.cross ? t('mmTerr.edgeCross', { from: lay.tree.byId.get(e.from).name, ws: wsName(lay.tree.byId.get(e.to).workspaceKey || '') || t('mmTerr.noFolder') }) : e.rel === 'role' ? (e.role || t('mmLine.role')) : t('mmLine.task'));
  const col0 = lay ? (lay.cols.find((c) => c.key === 'lv') || { x: lay.headx + LINE.HEADW + 208 }).x : 0;

  return (
    <div className={`mt-mission mt-ta mt-sm nowheel nopan${moveWs ? ' isle-moving' : ''}`} data-role="mission" data-style="territories" data-layout="lineage" ref={rootRef}>
      <div className="mt-ta-vp" data-role="ta-viewport" ref={vpRef} data-ncol={lay ? lay.ncol || 1 : undefined}>
        <div className="mt-ta-bg" ref={bgRef} aria-hidden="true" />
        {!lay ? <div className="mt-ta-loading">{t('common.loading')}</div> : (
          <div className="mt-ta-world lv-far" data-role="ta-world" ref={worldRef} data-label={lay.label}>
            {lay.bands.map((b) => (
              <div key={`b:${b.id || 'none'}`} className={`mt-sm-band${b.odd ? ' odd' : ''}${b.loose ? ' loose' : ''}`} data-role="ln-band" data-id={b.id || 'none'} data-today={b.today ? '1' : undefined} data-col={b.col || 0} style={{ left: b.x || 0, top: b.y, height: b.h, width: lay.W }}>
                <div className="mt-sm-spine" style={{ width: lay.spine }}>
                  <span className="fk" style={{ fontSize: lay.px.kind }}>{b.loose ? t('mmLine.loose') : t('mmLine.folder')}</span>
                  <span className="fn" data-role="ln-band-name" style={{ fontSize: lay.px.name }}>{b.name}</span>
                  <span className="fs" data-role="ln-band-stat" style={{ fontSize: lay.px.stat }}><span>{t('mmTerr.workspaces', { n: b.nWs })}</span><span>{t('mmTerr.sessions', { n: b.sessions })}</span></span>
                  <span className="fbar" aria-hidden="true" style={{ height: lay.px.bar }}>{b.bar.map((c) => <i key={c.tier} className={`st-${ST[c.tier]}`} style={{ flexGrow: c.n }} />)}</span>
                </div>
              </div>
            ))}
            {lay.rows.map((r) => (
              <div key={`r:${r.key || '-'}`} className={`mt-sm-row${r.first ? ' first' : ''}`} data-role="ta-isle" data-key={r.key} style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
                {r.key ? <div className="mt-sm-grab" data-key={r.key} data-role="ln-row-grab" style={{ width: Math.max(LINE.HEADW, col0 + (r.ox || 0) - r.x - 40) }} /> : null}
                {/* P157: 옮기기 안내는 풍선(title)이 아니라 Alt를 누른 동안에만 보이는 작은 글(.mt-sm-althint) */}
                <div className="mt-sm-head" data-key={r.key} data-role="ta-isle-head" style={{ width: lay.headW, gap: (lay.heads.get(r.key) || {}).gap }}>
                  <span className="wsn" style={{ fontSize: lay.px.ws }}><FolderIcon /><span data-role="ta-isle-name">{r.key ? r.name : t('mmapGroup.noWorkspace')}</span></span>
                  {r.key ? <span className="mt-sm-althint" data-role="ln-alt-hint" style={{ fontSize: lay.px.hint }}>{t('mmLine.altMoveHint')}</span> : null}
                  <span className="wsc" style={{ gap: (lay.heads.get(r.key) || {}).cgap }}>{r.chips.map((c) => <span key={c.tier} className={`st-${ST[c.tier]}`} data-tier={c.tier} style={{ fontSize: lay.px.chip }}><i /><b>{c.n}</b> {t(`mmTerr.chip.${c.tier}`)}</span>)}</span>
                </div>
              </div>
            ))}
            {/* P202: 오늘·이전 이름표. 두 열 = 열마다 위 머리, 한 열 = 두 칸 사이 얇은 구분 줄(위 "오늘", 아래 "이전") */}
            {(lay.sections || []).map((s) => <SectionMark key={`sec:${s.kind}`} s={s} px={lay.px.name} t={t} />)}
            <svg className="mt-ta-edges" width={1} height={1} aria-hidden="true">
              <defs>
                {KINDS.map((k) => <marker key={k} id={`mt-sm-tip-${k}`} className={`mt-sm-tip k-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 L10 5 L0 10 z" /></marker>)}
                {/* P153 r11: 동료 선은 양 끝에 작은 점(화살촉 없음, 위아래가 없다) */}
                <marker id="mt-sm-end-peer" className="mt-sm-tip k-peer" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" markerUnits="userSpaceOnUse"><circle cx="5" cy="5" r="4" /></marker>
                {/* P276: merger 선은 캔버스 merger 선처럼 양 끝에 점(실패면 빨강) */}
                <marker id="mt-sm-end-merge" className="mt-sm-tip k-merge" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse"><circle cx="5" cy="5" r="4" /></marker>
                <marker id="mt-sm-end-merge-failed" className="mt-sm-tip k-merge st-failed" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse"><circle cx="5" cy="5" r="4" /></marker>
              </defs>
              {lay.edges.map((e) => {
                if (e.merger) return <path key={e.id} className={mergeEdgeCls(e)} data-role="ta-edge" data-merger="1" data-state={e.state} data-from={e.from} data-to={e.to} d={e.d} markerStart={mergeTip('mt-sm', e)} markerEnd={mergeTip('mt-sm', e)} />; // P276
                const k = e.peer ? 'peer' : e.lineage ? 'lineage' : e.cross ? 'cross' : e.rel;
                const tip = e.peer ? 'url(#mt-sm-end-peer)' : e.lineage ? undefined : `url(#mt-sm-tip-${KINDS.includes(k) ? k : 'spawn'})`;
                return <path key={e.id} className={`mt-ta-edge k-${k}${!e.peer && !e.lineage && (e.active || tiers.get(e.to) === 'work') ? ' active' : ''}${mergeTreeCls(e)}`} data-role="ta-edge" data-from={e.from} data-to={e.to} data-rel={e.rel} data-cross={e.cross ? '1' : undefined} d={e.d} markerEnd={tip} markerStart={e.peer ? tip : undefined} />;
              })}
            </svg>
            {lay.edges.filter((e) => e.label).map((e) => <span key={`l:${e.id}`} className={`mt-ta-elab k-${e.cross ? 'cross' : e.rel}`} data-role="ta-edge-label" style={{ left: e.label.x, top: e.label.y }}>{edgeText(e)}</span>)}
            {shown.map((id) => { const b = lay.cards.get(id); return <Card key={id} id={id} b={b} f={factsOf(id)} tier={tiers.get(id)} lead={leads.has(id)} tagged={tagOf(id)} onTag={tag} onOpen={go} onHover={onHover} t={t} todo />; })}
            {/* P153 r11: Alt+카드 끌기 때 놓을 자리(하위로·동료로·독립). 끄는 동안 DOM에 바로 쓴다 */}
            <div className="mt-sm-drop" data-role="ln-drop" hidden><span className="lb" /></div>
          </div>
        )}
        {lay && lay.cards.size === 0 && <div className="mt-ta-loading">{t('mission.empty')}</div>}
      </div>

      {pv && lay && lay.cards.get(pv.id) && (() => { const b = lay.cards.get(pv.id), row = lay.rows.find((r) => r.key === b.ws), band = row && lay.bands.find((x) => (x.id || null) === (row.band || null)); return <Peek pv={pv} b={b} f={factsOf(pv.id)} live={liveOf(b.node)} tier={tiers.get(pv.id)} t={t} now={now} folder={[band && band.name, row && row.name].filter(Boolean).join(' / ')} />; })()}
      {todo && lay && lay.cards.get(todo.id) ? <TodoPop key={todo.sid} sessionId={todo.sid} name={todo.name} popRef={popRef} onPlace={() => placeRef.current && placeRef.current()} onClose={() => setTodo(null)} /> : null}
      <div className="mt-ta-hud mt-sm-top" data-role="ta-top">
        <span className="mt-ta-title">{t('mission.title')}</span>
        <span className="mt-ta-attn" data-role="ta-attn">
          {attn.slice(0, ATTN_MAX).map((id) => {
            const b = lay.cards.get(id), tier = tiers.get(id);
            return <button key={id} type="button" className={`mt-sm-pill st-${ST[tier]}`} data-role="ta-attn-item" data-id={id} title={t('mmTerr.waitingTitle')} onClick={() => { flyTo(id); if (!tagOf(id)) tag(id); }}><i /><b>{b.node.name}</b><span>{t(`mmTerr.chip.${tier}`)}</span></button>;
          })}
          {attn.length > ATTN_MAX && <span className="mt-ta-amore">{t('mmTerr.more', { n: attn.length - ATTN_MAX })}</span>}
          {lay && nWork > 0 && <span className="mt-sm-pill quiet st-working" data-role="ln-count"><i /><b>{nWork}</b><span>{t('mmTerr.chip.work')}</span></span>}
          {lay && nDone > 0 && <span className="mt-sm-pill quiet st-done" data-role="ln-count"><i /><b>{nDone}</b><span>{t('mmTerr.chip.review')}</span></span>}
        </span>
        <span className="mt-ta-spacer" />
        <span className="mt-sm-zgrp" data-role="ta-dock">
          <button type="button" className="zb" data-action="ta-zoom-out" title={t('mmTerr.zoomOut')} aria-label={t('mmTerr.zoomOut')} onClick={() => zoomCenter(view.current.k / ZOOM.step)}><svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg></button>
          <span className="zpct" ref={pctRef} data-role="ta-zoom">100%</span>
          <button type="button" className="zb" data-action="ta-zoom-in" title={t('mmTerr.zoomIn')} aria-label={t('mmTerr.zoomIn')} onClick={() => zoomCenter(view.current.k * ZOOM.step)}><svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
          <button type="button" className="zb fit" data-action="ta-fit" title={t('mmTerr.fitTitle')} onClick={() => fit()}>{t('mmTerr.fit')}</button>
        </span>
        <button type="button" className="mt-ta-iconbtn" data-action="mission-close" title={t('mmTerr.close')} aria-label={t('mmTerr.close')} onClick={() => setMissionOpen(false)}><XIcon s={18} /></button>
      </div>
      {/* P179: 오른쪽 요약 열 = 옛 열 지도의 요약 열(SummaryColumn.jsx, 같은 부품). 창 오른쪽 끝에 위 줄 아래부터 바닥까지 붙는다. 접기는 열 가장자리의 작은 단추 */}
      {lay && sumOpen ? (
        <SummaryColumn role="ln-summary" className="mt-ta-hud mt-sm-sum" style={{ width: SUM_W }} sum={sum} t={t} nameOf={(id) => lay.cards.get(id).node.name} tierOf={(id) => tiers.get(id)}
          textOf={sumLine} legend={LEGEND.map(([k, key]) => ({ k, label: t(key) }))} legendTip={t('mmSum.hint')} itemTip={t('mmSum.itemTip')} onGo={(id) => focusCard(id)} onHot={sumHot} />
      ) : null}
      {lay && (
        <button type="button" className={`mt-ta-hud mt-sm-sum-edge${sumOpen ? ' on' : ''}`} data-action={sumOpen ? 'ln-sum-hide' : 'ln-sum-show'} style={sumOpen ? { right: SUM_W } : undefined}
          title={t(sumOpen ? 'mmSum.hide' : 'mmSum.show')} aria-label={t(sumOpen ? 'mmSum.hide' : 'mmSum.show')} aria-expanded={sumOpen} onClick={toggleSum}>
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d={sumOpen ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} /></svg>
          {!sumOpen && sum.turn.length ? <b data-role="ln-sum-edge-turn">{sum.turn.length}</b> : null}
        </button>
      )}
    </div>
  );
}
