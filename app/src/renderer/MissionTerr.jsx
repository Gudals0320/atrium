// P152·P153: 세션 맵(옛 이름 미션 맵·작업 관계도) A "Territories"(ARCH 4절 I6). 사용자가 고른 시안 A를 실제 데이터로 그린 무한 캔버스 덮개. 옛 열 지도(Mission.jsx ClassicMission)는 숨은 설정 missionStyle: classic으로만 고른다.
// - 배치와 셈은 lib/mission-terr.js(순수 함수): 폴더 = 색 점선 영토, 워크스페이스 = 섬(이름과 상태 수 칩), 팀 = 섬 안 점선 무리(리드 위 → 하위 아래), 혼자인 세션 = 무리 오른쪽 기둥,
//   폴더 밖 워크스페이스 = 영토 없는 점선 섬. 소속·차례는 사이드바와 같다. 역할·관계·요약은 lib/mission-model.js(지금 모델 P137).
// - 무한 캔버스: 끌어 시점 이동, 휠(마우스 자리 중심)·두 손가락 확대·축소, 줌(− % + 맞춤), 화살표로 이동. 배경은 판(무한 캔버스)과 같은 색·점 격자(확대를 따른다).
//   빈 곳을 눌러도 닫히지 않는다. 닫기는 닫기 단추·Esc. 조금(5px) 움직이면 끌기라 카드 누르기와 갈린다. 열 때마다 맞춤으로 시작한다(P153: 세계 비율을 보기 칸에 맞춰 짠다).
//   P153: 멀리/보통/가까이 단추·미니맵·범례는 없앴다. 확대에 따른 카드 글(멀리 타일 ↔ 사실)은 단추 없이 배율로만 바뀐다(lv-far·lv-mid·lv-near 클래스).
// - P153 누르기: 카드를 누르면 그 세션이 아래 통합 명령줄(CommandBar, 세션 맵이 열린 동안 늘 보인다)에 @태그로 들어가고 다시 누르면 빠진다(여럿 가능, 태그된 카드는 테두리 표시).
//   세션 맵 안에서 친 글자는 명령줄로 간다(입력칸을 누르지 않아도). Enter는 명령줄의 보내기 그대로(세션 맵은 열린 채). 더블클릭·Enter(카드에 초점)는 세션 맵을 닫고 판의 그 세션으로 간다.
//   살펴보기 띠는 없다. 세부 사실은 마우스를 올리면 풍선 도움말. "나를 기다리는 것" 단추는 그 카드로 날아가 태그한다.
// - P153 소속 옮기기: 섬 머리(이름 줄)를 끌어 다른 폴더 영토에 놓으면 그 폴더로(group.move, 사이드바와 같은 길), 영토 밖에 놓으면 폴더 없음. 자리는 자동 배치가 정한다. Esc로 취소.
// - 성능: 보기는 ref에 두고 세계 한 요소의 transform만 바꾼다(움직이는 동안 React가 다시 그리지 않는다). 확대 단계 클래스·배율 글·배경 격자도 DOM에 바로 쓴다.
//   카드는 멀리 타일과 보통 사실을 둘 다 그려 두고 단계 클래스로만 갈아 끼운다. 움직이는 동안만 will-change(멈추면 떼어 글을 또렷하게 다시 그린다).
// - 진행 중 테두리 빛: P107 빛 층(MissionLight .mt-mm-light, lib/work-light.js, 판 설정 workLight와 움직임 줄이기 규칙)을 그대로 쓰고 크기만 카드에 맞춘다(styles.css P152·P153 덩어리).
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useStore, getState, setMissionOpen, toast, wsName } from './store.js';
import { territoryLayout, TERR, levelOf, zoomAt, wheelK, panBy, fitView, centerOn, pressIntent, viewKey, stepCard, ZOOM } from './lib/mission-terr.js';
import { roleModel, nodeTier, roleText, modelText, ageText } from './lib/mission-model.js';
import { kindOf } from './lib/kinds.js';
import { STATE_LABEL } from './lib/labels.js';
import { useT, errText } from './lib/i18n.js';
import { leadTags } from './lib/cmd-input.js';
import { MissionLight, DoneMark } from './Mission.jsx';
import { commandDraft } from './Thread.jsx';

const TOP = 96; // 위 떠 있는 줄 아래부터 맞춘다
const BOTTOM = 112; // 아래 명령줄 자리(명령줄이 카드를 가리지 않게)
const FIT_PAD = 32;
// 멀리 타일: 이름 12.5px·상태 10.5px(화면)를 지키는 배율 하한. 한 줄 이름 + 상태가 카드(150) 안에 드는 가장 작은 배율이 READ_K, 두 줄 이름이 드는 배율이 TWO_LINES_K
const READ_K = 0.23, TWO_LINES_K = 0.34;
const DOT_GAP = 92, DOT_R = 1.8; // 판 배경 점 격자(Canvas.jsx DOT_GAP, 점 지름 3.6)와 같다
const ATTN_MAX = 4;
const clip = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const branchOfLive = (live) => (live && live.git && live.git.isWorktree && live.git.branch) || null;
// 상태 색 클래스(시안 st-*): 등급 → 색
const ST = { turn: 'needs', alert: 'error', work: 'working', review: 'done', rest: 'ready', sleep: 'sleeping', done: 'exited' };
const IDLE = new Set(['rest', 'sleep', 'done']);

// 카드 사실(보통 단계 네 줄, 풍선 도움말이 같이 쓴다)
export function cardFacts(n, live, m, tier, t, now, { parentName = null, parentWs = null, cross = false, kids = 0 } = {}) {
  const kind = (live && (live.flavor || live.kind)) || n.agentKind || 'claude';
  const k = kindOf(kind);
  const shell = k.id === 'shell';
  const state = live ? live.state : n.state;
  const cmd = live && live.shell && live.shell.atPrompt === false ? live.shell.command || (live.shell.procs || []).join(', ') : null;
  const stateText = tier === 'review' ? t('doneMark.tag') : shell && state !== 'exited' && state !== 'sleeping' ? (cmd ? STATE_LABEL.shell_running : STATE_LABEL.shell_idle) : STATE_LABEL[state] || state || '';
  const turnAt = n.turnAt || (live && live.state === 'working' && live.turn && live.turn.startedAt) || null;
  const activeAt = n.activeAt || (live && live.lastActivityAt) || null;
  const age = tier === 'work' && turnAt ? ageText(now - turnAt, t) : activeAt ? ageText(now - activeAt, t) : null;
  const model = shell ? null : live && live.model ? modelText(live.model, live.effort) : modelText(n.model, n.effort);
  const role = m ? (m.rank === 'solo' ? t('mmTerr.solo') : roleText(m, t, { short: true })) : ''; // P153: 혼자는 시안처럼 짧게(관계 줄이 '연결 없음'을 말한다)
  const lp = n.lastPrompt || (live && live.lastPrompt) || null;
  const ask = n.ask || (live && live.ask && (live.ask.summary || live.ask.kind)) || null;
  const err = live && live.error ? (live.error.message || String(live.error)) : n.error || null;
  let taskKind, task;
  if (tier === 'work') { taskKind = 'now'; task = cmd ? `$ ${cmd}` : lp; }
  else if (tier === 'turn') { taskKind = 'ask'; task = ask || lp; }
  else if (tier === 'alert') { taskKind = 'fail'; task = lp || ask; }
  else if (tier === 'review') { taskKind = 'did'; task = lp; }
  else { taskKind = 'last'; task = lp; }
  const rel = parentName ? t(`mmTerr.rel.${['spawn', 'role', 'prompt'].includes(n._rel) ? n._rel : 'spawn'}`, { name: parentName }) : kids ? t('mmTerr.leads', { n: kids }) : t('mmTerr.rel.none');
  const relText = cross && parentWs ? t('mmTerr.rel.inWs', { text: rel, ws: parentWs }) : rel;
  const branch = n.gitBranch || branchOfLive(live);
  // P153: 카드 맨 아래 줄은 다른 워크스페이스에서 온 것(선이 멀리 간다)·브랜치·루프만. 같은 나무 안 부모·'연결 없음'·'n개를 이끎'은 선과 무리가 말하니 뺀다(풍선 도움말에는 남긴다)
  const extra = [branch ? `⎇ ${branch}` : null, n.loops ? `⟳${n.loops}` : null];
  const more = [cross && parentWs ? relText : null, ...extra].filter(Boolean).join(' · ');
  const relAll = [relText, ...extra].filter(Boolean).join(' · ');
  return { kind, k, shell, state, stateText, age, model, role, taskKind, task: task ? clip(task, 200) : null, err: tier === 'alert' && err ? clip(err, 200) : null, more, relAll, harness: k.label };
}

// 카드 하나. 멀리 타일(이름·상태 큰 글)과 보통 사실을 둘 다 그리고 단계 클래스(.lv-far 등)로 갈아 끼운다
const Card = memo(function Card({ id, b, f, tier, tagged, onTag, onOpen, t }) {
  const n = b.node;
  const st = ST[tier] || 'ready';
  const cls = `mt-ta-slot st-${st}${f.shell ? ' shell' : ''}${IDLE.has(tier) ? ' idle' : ''}${b.lead ? ' lead' : ''}${tagged ? ' tagged' : ''}`;
  const tip = [`@${n.name}${f.role ? ` · ${f.role}` : ''}`, `${f.stateText}${f.age ? ` · ${f.age}` : ''}`, [f.harness, f.model].filter(Boolean).join(' · '), f.task ? `${t(`mmTerr.kind.${f.taskKind}`)}: ${f.task}` : null, f.err, f.relAll, t(f.shell ? 'mmTerr.cardTipShell' : 'mmTerr.cardTip')].filter(Boolean).join('\n');
  return (
    <div className={cls} style={{ left: b.x, top: b.y, width: b.w, height: b.h }} data-role="ta-slot" data-id={id} data-tier={tier} data-ws={b.ws}>
      <div className="mt-ta-card" role="button" tabIndex={0} aria-pressed={tagged ? 'true' : 'false'} data-role="mm-node" data-kind="session" data-id={id} data-name={n.name} data-tier={tier} data-tagged={tagged ? '1' : undefined} title={tip} aria-label={tip.replace(/\n/g, ', ')}
        onClick={() => onTag(id)} onDoubleClick={() => onOpen(id)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(id); } else if (e.key === ' ') { e.preventDefault(); onTag(id); } }}>
        {tier === 'work' && <MissionLight role="ta-light" />}
        {tier === 'review' && <span className="mt-mm-donetag" data-role="mm-done"><DoneMark />{t('doneMark.tag')}</span>}
        <span className="mt-ta-tile" aria-hidden="true"><span className="tn">{n.name}</span><span className="ts">{tier === 'review' ? <span className="mt-ta-tdone"><DoneMark />{f.stateText}</span> : <><i />{f.stateText}</>}</span></span>
        <span className="mt-ta-full">
          <span className="c1"><span className="cname" data-role="ta-name">{n.name}</span><span className="cst" data-role="ta-state">{tier === 'review' ? (f.age ? <span className="cago">{f.age}</span> : null) : <><i />{f.stateText}{f.age ? <span className="cago"> · {f.age}</span> : null}</>}</span></span>
          <span className="c2" data-role="ta-meta">{f.role ? <span className="crole">{f.role}</span> : null}{f.role ? <span className="dotsep">·</span> : null}<span className="hb">{f.k.mark}</span><span>{f.harness}</span>{f.model ? <><span className="dotsep">·</span><span>{f.model}</span></> : null}</span>
          <span className={`c3${f.err ? ' one' : ''}`} data-role="ta-task">{f.task ? <b>{t(`mmTerr.kind.${f.taskKind}`)}</b> : null}{f.task || t('mmMap3.noTask')}</span>
          {f.err ? <span className="cerr" data-role="ta-err">{f.err}</span> : null}
          {f.more ? <span className="c4" data-role="ta-more">{f.more}</span> : null}
        </span>
      </div>
    </div>
  );
});

const FolderIcon = () => <svg className="mt-ta-iico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2.5h6.5A1.5 1.5 0 0 1 20 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" /></svg>;
const XIcon = ({ s = 20 }) => <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true" className="mt-ta-x"><path d="M6 6l12 12M18 6L6 18" /></svg>;

// 글자 키인가(명령줄로 보낼 것): 한 글자 키, 또는 IME 조합 시작(Process)
const typedKey = (e) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'Process' || (e.key && e.key.length === 1));

export function TerritoryMap() {
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
  const [moveWs, setMoveWs] = useState(null); // 끄는 중인 섬 키(놓을 영토 강조)
  const rootRef = useRef(null), vpRef = useRef(null), worldRef = useRef(null), pctRef = useRef(null), bgRef = useRef(null);
  const view = useRef(null); // { k, x, y }
  const fitted = useRef(false);
  const moveTimer = useRef(0), glideTimer = useRef(0);
  const justDragged = useRef(false);
  const layRef = useRef(null), sizeRef = useRef(null);

  useEffect(() => {
    if (!open) { setGraph(null); fitted.current = false; view.current = null; return undefined; }
    let alive = true;
    const timer = setTimeout(() => api.call('mission.graph').then((g) => alive && setGraph(g)).catch((e) => toast(t('mission.fail', { error: errText(e) }), 'error')), graph ? 300 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [open, sessions, links, thread, loops]); // eslint-disable-line react-hooks/exhaustive-deps
  // 명령줄 글을 듣는다(태그된 카드 표시)
  useEffect(() => {
    const onText = (e) => { const next = leadTags(e.detail); setTags((cur) => (cur.join('\n') === next.join('\n') ? cur : next)); };
    commandDraft.addEventListener('text', onText);
    return () => commandDraft.removeEventListener('text', onText);
  }, []);

  const order = useMemo(() => (workspaces || []).map((w) => w.key), [workspaces]);
  const liveOf = (n) => (n && n.sessionId ? sessions.get(n.sessionId) : null);
  const tiers = useMemo(() => new Map(graph ? graph.nodes.filter((n) => n.kind === 'session').map((n) => [n.id, nodeTier(n, liveOf(n))]) : []), [graph, sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  const names = useMemo(() => new Map((workspaces || []).map((w) => [w.key, wsName(w.key)])), [workspaces]);
  // 세계 비율은 보기 칸(위 줄·명령줄을 뺀 칸)에 맞춘다. 0.1 단위로 둥글려 창 크기가 조금 바뀔 때마다 다시 짜지 않게
  const aspect = vsize ? Math.round(((vsize.w - FIT_PAD * 2) / Math.max(200, vsize.h - TOP - BOTTOM - FIT_PAD * 2)) * 10) / 10 : TERR.ASPECT;
  const lay = useMemo(() => (graph ? territoryLayout(graph, { order, vgroups, tiers, names, aspect }) : null), [graph, order, vgroups, tiers, names, aspect]);
  const roles = useMemo(() => (graph && lay ? roleModel(graph, { tiers, tree: lay.tree }) : new Map()), [graph, lay, tiers]);
  layRef.current = lay;
  sizeRef.current = vsize;
  const now = Date.now();
  const leads = useMemo(() => new Set(lay ? lay.rings.map((r) => r.lead) : []), [lay]);
  const relOfChild = useMemo(() => { const m = new Map(); if (lay) for (const e of lay.edges) if (e.tree) m.set(e.to, e.rel); return m; }, [lay]);
  const factsOf = useCallback((id) => {
    const b = lay.cards.get(id), n = b.node, m = roles.get(id);
    const pid = m && m.parentId, p = pid ? lay.tree.byId.get(pid) : null;
    const pws = p ? p.workspaceKey || '' : null;
    return cardFacts({ ...n, _rel: relOfChild.get(id) }, liveOf(n), m, tiers.get(id), t, now, { parentName: p ? p.name : null, parentWs: p ? (pws ? wsName(pws) : t('mmapGroup.noWorkspace')) : null, cross: !!p && pws !== (n.workspaceKey || ''), kids: (lay.tree.kids.get(id) || []).length });
  }, [lay, roles, tiers, sessions, t, relOfChild]); // eslint-disable-line react-hooks/exhaustive-deps
  const tagSet = useMemo(() => new Set(tags.map((x) => x.toLowerCase())), [tags]);

  // ---- 보기 쓰기(DOM에 바로) ----
  const paint = useCallback((v, { glide = false } = {}) => {
    view.current = v;
    const w = worldRef.current, vp = vpRef.current, root = rootRef.current;
    const lv = levelOf(v.k);
    if (w) {
      if (glide) { w.classList.add('glide'); clearTimeout(glideTimer.current); glideTimer.current = setTimeout(() => w.classList.remove('glide'), 480); } else w.classList.remove('glide');
      w.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
      if (!w.classList.contains(`lv-${lv}`)) { w.classList.remove('lv-far', 'lv-mid', 'lv-near'); w.classList.add(`lv-${lv}`); }
      if (root && root.dataset.level !== lv) root.dataset.level = lv;
    }
    // 배경: 판과 같은 점 격자(간격·점 크기가 배율을 따른다)
    // 배경 점은 세계의 형제 층(.mt-ta-bg)에 쓴다(세계를 감싼 요소에 변수를 쓰면 카드 전부의 스타일을 다시 센다)
    const bg = bgRef.current;
    if (bg) { const gs = DOT_GAP * v.k; bg.style.backgroundSize = `${gs}px ${gs}px`; bg.style.backgroundPosition = `${v.x % gs - gs / 2}px ${v.y % gs - gs / 2}px`; bg.style.setProperty('--dot-r', `${Math.max(0.6, DOT_R * v.k)}px`); }
    // P153: 멀리 타일 글은 화면에서 일정 크기 밑으로 줄지 않게(--ik = 1/배율, CSS가 글 크기를 키운다). 이름은 두 줄이 들어가는 배율부터 두 줄(--tl)
    // --ik는 6% 계단으로만 바꾼다(휠 한 칸마다 모든 카드 글을 다시 재지 않게, 128세션 휠 p95)
    // 끄는·휠 도는 동안은 글 크기를 그대로 두고(배율과 함께 커지고 작아진다) 멈춘 뒤(160ms) 한 번 맞춘다. 처음 그릴 때와 미끄러지기(glide)는 바로
    const setIk = () => { const ww = worldRef.current, kk = view.current && view.current.k; if (!ww || !kk || levelOf(kk) !== 'far') return; const ik = Math.pow(1.06, Math.round(Math.log(1 / kk) / Math.log(1.06))).toFixed(3); if (ww.style.getPropertyValue('--ik') !== ik) { ww.style.setProperty('--ik', ik); ww.style.setProperty('--tl', kk >= TWO_LINES_K ? '2' : '1'); } };
    if (w && lv === 'far' && (glide || !w.style.getPropertyValue('--ik'))) setIk();
    if (pctRef.current) pctRef.current.textContent = `${Math.round(v.k * 100)}%`;
    // 움직이는 동안만 will-change(멈추면 떼어 또렷하게)
    if (root && !glide) { if (root.dataset.moving !== '1') root.dataset.moving = '1'; clearTimeout(moveTimer.current); moveTimer.current = setTimeout(() => { delete root.dataset.moving; setIk(); }, 160); }
  }, []);
  const fitOf = (L, s) => fitView(L.bounds, s.w, s.h, { top: TOP, bottom: BOTTOM, pad: FIT_PAD });
  // P153: 처음 연 화면. 맞춤이 읽을 수 있는 배율(READ_K)보다 작으면 READ_K로 세계 왼쪽 위에 붙여 연다(맞춤 단추는 늘 전체)
  const openOf = (L, s) => { const f = fitOf(L, s); return f.k >= READ_K ? f : { k: READ_K, x: FIT_PAD - L.bounds.x * READ_K, y: TOP + FIT_PAD / 2 - L.bounds.y * READ_K }; };
  const fit = useCallback((glide = true) => { const L = layRef.current, s = sizeRef.current; if (L && s) paint(fitOf(L, s), { glide }); }, [paint]);
  const zoomCenter = useCallback((k2) => { const s = sizeRef.current, v = view.current; if (s && v) paint(zoomAt(v, s.w / 2, (s.h + TOP - BOTTOM) / 2, k2), { glide: true }); }, [paint]);
  const flyTo = useCallback((id, k) => {
    const L = layRef.current, s = sizeRef.current, v = view.current, b = L && L.cards.get(id);
    if (!b || !s || !v) return;
    paint(centerOn(b.x + b.w / 2, b.y + b.h / 2, k || Math.max(0.9, v.k), s.w, s.h, { top: TOP, bottom: BOTTOM }), { glide: true });
  }, [paint]);

  // 보기 칸 크기
  useLayoutEffect(() => {
    const el = vpRef.current;
    if (!open || !el) return undefined;
    const read = () => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setVsize((v) => (v && v.w === Math.round(r.width) && v.h === Math.round(r.height) ? v : { w: Math.round(r.width), h: Math.round(r.height) })); };
    read();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', read);
    return () => { if (ro) ro.disconnect(); else window.removeEventListener('resize', read); };
  }, [open]);
  // 처음은 맞춤. 판이 바뀌거나 창 크기가 바뀌면 보기는 그대로
  useLayoutEffect(() => {
    if (!open || !lay || !vsize) return;
    if (!fitted.current) { fitted.current = true; paint(openOf(lay, vsize)); }
    else if (view.current) paint(view.current);
  }, [open, lay, vsize, paint]);

  const go = useCallback((id) => {
    const L = layRef.current, b = L && L.cards.get(id);
    setMissionOpen(false);
    const st = getState();
    if (b && b.node.sessionId) setTimeout(() => st.navigateTo && st.navigateTo(b.node.sessionId), 30);
  }, []);
  const tag = useCallback((id) => {
    const L = layRef.current, b = L && L.cards.get(id);
    if (!b || justDragged.current || b.node.agentKind === 'shell') return; // 셸은 메시지를 받지 않는다
    commandDraft.dispatchEvent(new CustomEvent('tag', { detail: b.node.name }));
  }, []);

  // ---- 섬 옮기기(소속만): 놓은 자리의 영토 → group.move ----
  const terrAt = (L, wx, wy) => (L.terrs.find((x) => wx >= x.x && wx <= x.x + x.w && wy >= x.y && wy <= x.y + x.h) || null);
  const moveIsle = useCallback((key, terrId) => {
    const L = layRef.current;
    const isle = L && L.isles.find((i) => i.key === key);
    if (!isle || (isle.folder || null) === (terrId || null)) return;
    const gs = getState().groups || [];
    const name = terrId ? (gs.find((g) => g.id === terrId) || {}).name : null;
    api.call('group.move', { workspace: key, group: terrId || null }).then(() => toast(terrId ? t('mmTerr.movedTo', { ws: wsName(key), folder: name || '' }) : t('mmTerr.movedOut', { ws: wsName(key) }))).catch((e) => toast(t('mmTerr.moveFail', { error: errText(e) }), 'error'));
  }, [t]);

  // ---- 끌기·두 손가락·휠·섬 머리 끌기 ----
  useEffect(() => {
    const el = vpRef.current;
    if (!open || !el) return undefined;
    const pts = new Map(); // pointerId → { x, y }
    let g = null; // { mode: 'press'|'drag'|'pinch'|'isle', ... }
    const local = (e) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const begin = () => {
      const v = view.current; if (!v) { g = null; return; }
      const p = [...pts.values()];
      if (p.length >= 2) g = { mode: 'pinch', v0: v, m0: { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }, d0: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1 };
      else if (p.length === 1) g = { mode: g && g.mode !== 'press' ? 'drag' : 'press', v0: v, p0: p[0] };
      else g = null;
    };
    // 끄는 섬과 그 안의 카드·무리(세계에서 형제 요소라 함께 옮긴다)
    const isleEls = (key) => [...el.querySelectorAll(`.mt-ta-isl[data-key="${CSS.escape(key)}"], .mt-ta-slot[data-ws="${CSS.escape(key)}"], .mt-ta-ring[data-ws="${CSS.escape(key)}"]`)];
    const hotTerr = (id) => { for (const x of el.querySelectorAll('.mt-ta-terr')) x.classList.toggle('drop', x.dataset.id === id); el.classList.toggle('drop-none', id === ''); };
    const endIsle = (commit, p) => {
      const s = g; g = null;
      for (const ie of isleEls(s.key)) { ie.style.transform = ''; ie.classList.remove('moving'); }
      hotTerr(null);
      el.classList.remove('dragging');
      setMoveWs(null);
      if (commit && s.moved) {
        const v = view.current, L = layRef.current;
        const tt = L && v ? terrAt(L, (p.x - v.x) / v.k, (p.y - v.y) / v.k) : null;
        moveIsle(s.key, tt ? tt.id : null);
      }
    };
    const down = (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('.mt-ta-hud')) return; // 떠 있는 판(단추)은 끌지 않는다
      justDragged.current = false;
      const head = e.target.closest('.mt-ta-ihead');
      if (head && !pts.size) { // 섬 머리에서 시작한 끌기 = 소속 옮기기
        const p = local(e);
        pts.set(e.pointerId, p);
        g = { mode: 'isle', key: head.dataset.key, p0: p, moved: false };
        return;
      }
      pts.set(e.pointerId, local(e));
      begin();
    };
    const move = (e) => {
      if (!pts.has(e.pointerId) || !g) return;
      const lp = local(e);
      pts.set(e.pointerId, lp);
      if (g.mode === 'isle') {
        const dx = lp.x - g.p0.x, dy = lp.y - g.p0.y, v = view.current;
        if (!g.moved && pressIntent({ dx, dy }) !== 'drag') return;
        if (!g.moved) { g.moved = true; el.classList.add('dragging'); setMoveWs(g.key); try { el.setPointerCapture(e.pointerId); } catch { /* 잡지 못해도 끌기는 된다 */ } }
        justDragged.current = true;
        if (v) for (const ie of isleEls(g.key)) { ie.classList.add('moving'); ie.style.transform = `translate(${dx / v.k}px, ${dy / v.k}px)`; }
        const L = layRef.current;
        const tt = L && v ? terrAt(L, (lp.x - v.x) / v.k, (lp.y - v.y) / v.k) : null;
        hotTerr(tt ? tt.id : '');
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
      if (g && g.mode === 'isle') { endIsle(e.type === 'pointerup', lp); return; }
      if (!pts.size) { g = null; el.classList.remove('dragging'); } else begin(); // 두 손가락에서 하나를 떼면 남은 손가락으로 이어 끈다
    };
    const wheel = (e) => {
      if (e.target.closest('.mt-ta-hud')) return;
      e.preventDefault();
      const v = view.current; if (!v) return;
      const p = local(e);
      paint(zoomAt(v, p.x, p.y, wheelK(v.k, e.deltaY, e.deltaMode)));
    };
    // 끈 뒤의 click은 태그가 아니다
    const click = (e) => { if (justDragged.current) { e.stopPropagation(); e.preventDefault(); justDragged.current = false; } };
    // 섬 끌기 중 Esc = 취소
    const esc = (e) => { if (e.key === 'Escape' && g && g.mode === 'isle') { e.preventDefault(); e.stopPropagation(); pts.clear(); endIsle(false); } };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('click', click, true);
    window.addEventListener('keydown', esc, true);
    return () => {
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel); el.removeEventListener('click', click, true); window.removeEventListener('keydown', esc, true);
    };
  }, [open, paint, moveIsle]);

  // ---- 키: Esc 닫기, 친 글자는 명령줄로, 화살표 끌기, 카드에 초점이 있으면 ↑↓로 카드 다니기 ----
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      const tag2 = (e.target && e.target.tagName) || '';
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag2) || (e.target && e.target.isContentEditable);
      if (e.key === 'Escape' && !typing) { e.preventDefault(); setMissionOpen(false); return; }
      if (typing || getState().dialog) return;
      if (typedKey(e) && !(e.key === ' ' && e.target && e.target.closest && e.target.closest('.mt-ta-card'))) { commandDraft.dispatchEvent(new CustomEvent('focus')); return; } // 기본 동작은 막지 않는다: 그 글자는 초점이 옮겨 간 입력칸이 받는다
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const card = e.target && e.target.closest ? e.target.closest('.mt-ta-card') : null;
      const L = layRef.current;
      if (card && L && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const next = stepCard(L.order, card.dataset.id, e.key === 'ArrowDown' ? 1 : -1);
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
  window.__mtTa = { view: () => (view.current ? { ...view.current } : null), fit: () => fit(false), flyTo, lay: () => layRef.current, set: (v) => paint(v), tags: () => tags }; // 시험이 읽는다

  if (!open) return null;
  const gName = (key) => (key ? wsName(key) : t('mmapGroup.noWorkspace'));
  const ids = lay ? lay.order : [];
  const attn = ids.filter((id) => tiers.get(id) === 'turn' || tiers.get(id) === 'alert').sort((a, b) => (tiers.get(a) === 'turn' ? 0 : 1) - (tiers.get(b) === 'turn' ? 0 : 1));
  const nWs = lay ? lay.isles.length : 0;
  const nFolders = lay ? lay.terrs.length : 0;
  const tagOf = (id) => { const b = lay.cards.get(id); return !!b && tagSet.has(String(b.node.name).toLowerCase()); };

  return (
    <div className={`mt-mission mt-ta nowheel nopan${moveWs ? ' isle-moving' : ''}`} data-role="mission" data-style="territories" ref={rootRef}>
      <div className="mt-ta-vp" data-role="ta-viewport" ref={vpRef}>
        <div className="mt-ta-bg" ref={bgRef} aria-hidden="true" />
        {!lay ? <div className="mt-ta-loading">{t('common.loading')}</div> : (
          <div className="mt-ta-world lv-far" data-role="ta-world" ref={worldRef}>
            {lay.terrs.map((x) => (
              <div key={`t:${x.id}`} className={`mt-ta-terr c${x.color}`} data-role="ta-terr" data-id={x.id} style={{ left: x.x, top: x.y, width: x.w, height: x.h }}>
                <div className="mt-ta-thead"><span className="mt-ta-tname" data-role="ta-terr-name">{x.name}</span><span className="mt-ta-tsub">{`${t('mmTerr.workspaces', { n: x.nWs })} · ${t('mmTerr.sessions', { n: x.sessions })}`}</span></div>
              </div>
            ))}
            {lay.isles.map((i) => (
              <div key={`i:${i.key || '-'}`} className={`mt-ta-isl${i.loose ? ' loose' : ''}`} data-role="ta-isle" data-key={i.key} style={{ left: i.x, top: i.y, width: i.w, height: i.h }}>
                <div className="mt-ta-ihead" data-key={i.key} title={i.key ? t('mmTerr.isleTip', { ws: gName(i.key) }) : undefined} data-role="ta-isle-head">
                  <FolderIcon /><span className="mt-ta-iname" data-role="ta-isle-name">{gName(i.key)}</span>
                  {i.loose && <span className="mt-ta-itag">{t('mmTerr.noFolder')}</span>}
                  <span className="mt-ta-ichips">{i.chips.map((c) => <span key={c.tier} className={`mt-ta-ichip st-${ST[c.tier]}`} data-tier={c.tier}><i /><b>{c.n}</b><span className="lb"> {t(`mmTerr.chip.${c.tier}`)}</span></span>)}</span>
                </div>
              </div>
            ))}
            {lay.rings.map((r) => (
              <div key={`r:${r.id}`} className="mt-ta-ring" data-role="ta-ring" data-lead={r.lead} data-ws={r.ws} style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
                <div className="mt-ta-rlabel">{t('mmTerr.team')} <b>{lay.tree.byId.get(r.lead).name}</b> · {t('mmTerr.sessions', { n: r.n + r.away })}{r.away ? ` ${t('mmTerr.away', { n: r.away })}` : ''}</div>
              </div>
            ))}
            <svg className="mt-ta-edges" width={1} height={1} aria-hidden="true">
              {lay.edges.map((e) => <path key={e.id} className={`mt-ta-edge k-${e.cross ? 'cross' : e.rel}${e.active || tiers.get(e.to) === 'work' ? ' active' : ''}`} data-role="ta-edge" data-from={e.from} data-to={e.to} data-rel={e.rel} data-cross={e.cross ? '1' : undefined} d={e.d} />)}
            </svg>
            {lay.edges.filter((e) => e.label).map((e) => {
              const text = e.cross ? t('mmTerr.edgeCross', { from: lay.tree.byId.get(e.from).name, ws: gName(lay.tree.byId.get(e.to).workspaceKey || '') }) : e.rel === 'role' ? t('mmTerr.edgeRole', { role: e.role || t('mmRole.worker') }) : t('mmTerr.edgePrompt');
              return <span key={`l:${e.id}`} className={`mt-ta-elab k-${e.cross ? 'cross' : e.rel}`} data-role="ta-edge-label" style={{ left: e.label.x, top: e.label.y }}>{text}</span>;
            })}
            {ids.map((id) => { const b = lay.cards.get(id); return <Card key={id} id={id} b={{ ...b, lead: leads.has(id) }} f={factsOf(id)} tier={tiers.get(id)} tagged={tagOf(id)} onTag={tag} onOpen={go} t={t} />; })}
          </div>
        )}
        {lay && lay.cards.size === 0 && <div className="mt-ta-loading">{t('mission.empty')}</div>}
      </div>

      <div className="mt-ta-hud mt-ta-top" data-role="ta-top">
        <span className="mt-ta-title">{t('mission.title')}</span>
        {lay && <span className="mt-ta-sub" data-role="ta-summary">{t('mmTerr.summary', { folders: t('mmTerr.folders', { n: nFolders }), workspaces: t('mmTerr.workspaces', { n: nWs }), sessions: t('mmTerr.sessions', { n: lay.cards.size }) })}</span>}
        <span className="mt-ta-attn" data-role="ta-attn">
          {attn.slice(0, ATTN_MAX).map((id) => {
            const b = lay.cards.get(id), f = factsOf(id), tier = tiers.get(id);
            return <button key={id} type="button" className={`mt-ta-abtn st-${ST[tier]}`} data-role="ta-attn-item" data-id={id} title={t('mmTerr.waitingTitle')} onClick={() => { flyTo(id); if (!tagOf(id)) tag(id); }}><i /><b>{b.node.name}</b><span className="tx">{f.err || f.task || f.stateText}</span></button>;
          })}
          {attn.length > ATTN_MAX && <span className="mt-ta-amore">{t('mmTerr.more', { n: attn.length - ATTN_MAX })}</span>}
        </span>
        <span className="mt-ta-spacer" />
        <button type="button" className="mt-ta-iconbtn" data-action="mission-close" title={t('mmTerr.close')} aria-label={t('mmTerr.close')} onClick={() => setMissionOpen(false)}><XIcon /></button>
      </div>

      <div className="mt-ta-hud mt-ta-zoom" data-role="ta-dock">
        <button type="button" className="zb" data-action="ta-zoom-out" title={t('mmTerr.zoomOut')} aria-label={t('mmTerr.zoomOut')} onClick={() => zoomCenter(view.current.k / ZOOM.step)}><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg></button>
        <span className="zpct" ref={pctRef} data-role="ta-zoom">100%</span>
        <button type="button" className="zb" data-action="ta-zoom-in" title={t('mmTerr.zoomIn')} aria-label={t('mmTerr.zoomIn')} onClick={() => zoomCenter(view.current.k * ZOOM.step)}><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
        <button type="button" className="zb fit" data-action="ta-fit" title={t('mmTerr.fitTitle')} onClick={() => fit()}>{t('mmTerr.fit')}</button>
      </div>
    </div>
  );
}
