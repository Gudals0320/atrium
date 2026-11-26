// P11: 캔버스 위에 떠 있는 크롬(목업 app/design/board-mock/ ?scene=ours). P6a~P10의 위쪽 줄(InboxBar)과 아래쪽 워크스페이스 단추(Regions)가 하던 일을 옮겼다.
// - 위 왼쪽(P294, P302 차례): 사이드바(창 왼쪽 끝에 붙은 탭), 세션 수(누르면 세션 맵) · 작업 중 · 작업 완료 · 할 일(P305, 옛 내 몫), 그 뒤 응답 필요(N으로 다음) · 문제.
//   찾기는 위 막대에 칸이 없고 Ctrl+F로만 떠 있는 창을 연다(P214). 워크스페이스 탭 줄은 없앴다(사이드바에서 고른다)
// - 위 오른쪽(P294): 상태. 연결(점), 다른 기기, 메모리, 사용량, 바뀐 것, 설정
// - 왼쪽 레일: 선택, 새 세션(레일에 고정한 런처, P33), 메모, 칸반, 그룹, 손으로 잇기, 전체 보기, 작업 중만 또렷하게(P85)
// - 오른쪽 레일: 사이드바(리포), 미션 맵, 루프, 보관함, 설정
// - 아래: 빠른 동작 칩 줄, 줌 알약(− n% +, 누르면 전체 보기). 명령 입력은 CommandBar.jsx
// 새 기능은 없다. 모든 단추는 이미 있던 동작을 부른다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GuardBadge } from './Guard.jsx'; // P341: 메모리 알약 줄의 폭주 표시
import { resOrder } from './lib/guard.js'; // P348: 메모리 알약 펼침의 세션 목록 차례
import { ResTrend } from './ResTrend.jsx'; // P370: 펼침 맨 위의 추이 그림(열린 동안만 받는다)
import { useStore, getState, openDialog, toast, wsName, setMissionOpen, setSpotlight, markAllSeen } from './store.js';
import { QuickName } from './QuickName.jsx'; // P97: 레일 빠른 생성의 이름 칸
import { favoriteLaunchers, launcherIcon, launcherMark, launcherTooltip } from './lib/launchers.js'; // P33: 레일 = 즐겨찾기 호출자
import { api } from './api.js';
import { useConnSteady } from './steady.js'; // P82
import { isWeb } from './web.js';
import { createItem } from './Memo.jsx';
import { arrangeBoard, BOARD_ARRANGED } from './Regions.jsx'; // P31: 칩의 정리는 판 전체
import { toggleSidebar, openArchiveBox, useSide } from './Sidebar.jsx';
import { LoopList } from './Loops.jsx';
import { useDialog } from './dialog.js'; // P52
import { useInbox } from './InboxBar.jsx';
import { DecisionPill } from './Decisions.jsx'; // P284: 결정 카드
import { PlanPanelHost } from './Plan.jsx'; // P306: 목표 판(화면 기준, 하나)
import { seenTargets, cpuLine, fmtPct } from './lib/p255.js'; // P255: 작업 완료 모두 읽기, 메모리 칩의 CPU
import { KindIcon } from './SessionNode.jsx';
import { DevicesPill } from './Peers.jsx'; // P47: 다른 기기 n
import { UsagePill } from './Usage.jsx'; // P211: 구독 사용량. 레일 호출자 단추에는 보이지 않는다(로고만, 2026-11-18 사용자 요청)
import { Icon } from './lib/icons.jsx';
import { STATE_LABEL, EXIT_LABEL, ago, askLine } from './lib/labels.js';
import { useT, errText, fmtTime } from './lib/i18n.js';
import { goSession } from './lib/go-session.js';
import { topFit, fitWatch } from './lib/top-pills.js'; // P294: 위 알약 접기 단계
import { sleepIdle, asleepStats, memByRepo, fmtMB } from './sleep.js'; // P21(D4), P24: 리포별로 묶는다. P168 뒤: fmtMB는 모르는 값(null)을 ?로

function useNow(ms = 1000) { const [n, set] = useState(Date.now()); useEffect(() => { const t = setInterval(() => set(Date.now()), ms); return () => clearInterval(t); }, [ms]); return n; }
const go = (id) => goSession(id, { st: getState(), closeMap: () => setMissionOpen(false) }); // P328: 위 알약 목록도 세션 맵에서는 맵을 닫고 한 번에

// 펼침 목록: 알약 아래로 펼치고 바깥을 누르거나 Esc면 닫는다
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown, true); window.removeEventListener('keydown', onKey); };
  }, [open]);
  return [open, setOpen, ref];
}

// ---------- 위 왼쪽 ----------
// P294: 워크스페이스 알약 줄(탭, 묶음 칩, "+n", +)은 없앴다. 워크스페이스는 사이드바에서 고르고 연다(워크스페이스 ⋯ 메뉴 › 새 워크스페이스 열기).
// 위 왼쪽에는 사람이 볼 것(응답 필요·할 일·작업 완료·문제·세션)을, 위 오른쪽에는 상태(연결·기기·메모리·사용량·변경 내역·설정)를 둔다.
// 좁은 창에서는 왼쪽 알약의 글을 숨기고 수만 보이며(compact), 그래도 모자라면 오른쪽 알약의 글도 숨기고(tight),
// 그래도 모자라면(사이드바를 연 좁은 창) 왼쪽 무리를 한 줄 아래로 내린다(stack). 규칙은 lib/top-pills.js topFit

function SidebarButton() {
  const t = useT();
  const open = useSide((st) => st.open);
  return <button className={`mt-cp round${open ? ' on' : ''}`} data-action="sidebar" title={t('top.sidebar')} onClick={toggleSidebar}><Icon name="sidebar" /></button>;
}

export function TopLeft() {
  const t = useT();
  const { needsYou, review, problems, working } = useInbox();
  const fit = useTopFit();
  return (
    <div className={`mt-cluster tl${fit === 'full' ? '' : ' compact'}${fit === 'stack' ? ' stack' : ''}`} data-role="top-left" data-fit={fit}>
      <SidebarButton />
      {/* P9: 개발용 판이면 표시한다. 실제 판에는 없다 */}
      {api.info && api.info.profile === 'dev' && <span className="mt-dev-badge" data-role="dev-badge" title={t('top.devBadge', { session: api.info.terminalSession, port: api.info.port })}>dev</span>}
      {/* P302: 세션 · 작업 중 · 작업 완료 · 할 일, 그 뒤 응답 필요 · 문제(lib/top-pills.js PEOPLE_PILLS). 세션 말고는 0이면 숨긴다 */}
      <SessionsPill />
      {working.length > 0 && <ListPill list={working} label={t('p302.working')} cls="working" role="working" line={(s) => (s.lastPrompt || '').replace(/\s+/g, ' ').slice(0, 120)} empty={t('p302.workingEmpty')} />}
      {review.length > 0 && <ListPill list={review} label={t('top.review')} cls="review" role="review" line={(s) => (s.lastAnswer || '').replace(/\s+/g, ' ').slice(0, 120)} empty={t('top.reviewEmpty')} readAll />}
      <DecisionPill />{/* P284: 할 일 n(P305, 응답 필요와 따로 센다) */}
      <PlanPanelHost />
      <TurnPill needsYou={needsYou} />
      {problems.length > 0 && <ListPill list={problems} label={t('top.issues')} cls="problem" role="problems" line={(s) => (s.state === 'exited' ? [EXIT_LABEL[s.exit && s.exit.kind], s.exit && s.exit.error].filter(Boolean).join(': ') /* P337: 끝 화면의 오류 문장 */ : STATE_LABEL[s.state]) || ''} empty={t('top.issuesEmpty')} />}
    </div>
  );
}

// P294: 위 두 무리의 폭을 재서 접기 단계를 정한다(lib/top-pills.js topFit). 단계마다 잰 폭을 담아 두고, 알약 글·수·언어가 바뀌면(textContent) 다시 펼쳐 잰다.
// 잴 때는 그리기 전(useLayoutEffect)이라 깜빡이지 않는다. 오른쪽 무리의 접기(tight)는 오른쪽 무리에 클래스를 단다
function useTopFit() {
  const [fit, setFit] = useState('full');
  const seen = useRef({ key: '', fullL: null, compactL: null, fullR: null, compactR: null });
  const [, bump] = useState(0);
  useLayoutEffect(() => {
    const tl = document.querySelector('.mt-cluster.tl');
    const tr = document.querySelector('.mt-cluster.tr');
    if (!tl || !tr) return;
    const m = seen.current;
    const key = `${tl.textContent}|${tr.textContent}|${tl.childElementCount}|${tr.childElementCount}`;
    if (key !== m.key) { m.key = key; m.fullL = m.compactL = m.fullR = m.compactR = null; if (fit !== 'full') { setFit('full'); return; } }
    const w = (el) => Math.ceil(el.scrollWidth);
    if (fit === 'full') { m.fullL = w(tl); m.fullR = w(tr); }
    else if (fit === 'compact') m.compactL = w(tl);
    else if (fit === 'tight') m.compactR = w(tr);
    const box = tl.offsetParent || document.documentElement; // 판 칸(사이드바가 열리면 그만큼 좁다)
    const next = topFit({ win: box.clientWidth, left: tl.offsetLeft, right: box.clientWidth - (tr.offsetLeft + tr.offsetWidth), fullL: m.fullL, compactL: m.compactL, fullR: m.fullR, compactR: m.compactR });
    tr.classList.toggle('compact', next === 'tight' || next === 'stack');
    // 찾기 창·고른 노드 막대는 위 왼쪽 무리 아래에 놓인다(styles.css --mt-tl-bottom). 내린 줄이면 그만큼 내려간다
    const bottom = `${Math.round(tl.offsetTop + tl.offsetHeight)}px`;
    if (document.documentElement.style.getPropertyValue('--mt-tl-bottom') !== bottom) document.documentElement.style.setProperty('--mt-tl-bottom', bottom);
    tr.dataset.fit = next;
    if (next !== fit) setFit(next);
  });
  // P323: 관찰자는 한 번만 만든다. 렌더마다 새로 걸면 observe 알림이 다시 렌더를 불러 끝없이 돌았다(lib/top-pills.js fitWatch)
  const watch = useRef(null);
  const targets = () => {
    const tl = document.querySelector('.mt-cluster.tl');
    const els = [tl && tl.offsetParent]; // 사이드바를 열고 닫으면 판 칸 폭이 바뀐다
    for (const el of document.querySelectorAll('.mt-cluster.tl, .mt-cluster.tr')) { els.push(el); for (const k of el.children) els.push(k); }
    return els;
  };
  useLayoutEffect(() => {
    const kick = () => bump((n) => n + 1);
    window.addEventListener('resize', kick);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => { if (watch.current) watch.current.onResize(entries); });
      watch.current = fitWatch(ro, kick);
      watch.current.sync(targets());
    }
    return () => { window.removeEventListener('resize', kick); if (ro) ro.disconnect(); watch.current = null; };
  }, []);
  // 렌더마다 지켜볼 원소만 맞춘다(새 알약만 observe, 빠진 알약은 놓는다). 폭이 그대로면 다시 재지 않는다
  useLayoutEffect(() => { if (watch.current) watch.current.sync(targets()); });
  return fit;
}

// P294: 세션 n(옛 연결 알약의 세션 수). 누르면 세션 맵을 열고 닫는다(P32 연결 알약과 같다). 백엔드와 끊겨 있으면 맵을 열지 않는다
function SessionsPill() {
  const t = useT();
  const count = useStore((st) => st.sessions.size);
  const conn = useStore((st) => st.conn);
  const mission = useStore((st) => st.missionOpen);
  const canOpen = conn === 'open';
  const toggle = () => { if (canOpen || mission) setMissionOpen(!mission); };
  return (
    <button type="button" className={`mt-cp sessions${mission ? ' on' : ''}`} data-role="sessions-pill" data-action="sessions-mission" data-count={count} aria-pressed={mission}
      title={[t('top.connSessions', { n: count }), canOpen || mission ? t(mission ? 'mmap.pillClose' : 'mmap.pillOpen') : null].filter(Boolean).join('\n')} onClick={toggle}>
      <span className="mt-cp-label">{t('top.sessions', { n: count })}</span> <span className="mono">{count}</span>{/* P302: "이름 수" 꼴(세션 6) */}
    </button>
  );
}

// ---------- 위 오른쪽 ----------
const wsTag = (s, currentWs) => <span className={`mt-chip-ws${(s.workspaceKey || null) === (currentWs || null) ? '' : ' other'}`} data-ws={s.workspaceKey || ''}>{wsName(s.workspaceKey)}</span>;

// 내 차례 알약과 그 목록(BRIEF 4절, ARCH 4절 A1). 목록의 줄을 누르거나 N을 누르면 노드를 옮기지 않고 화면이 그 세션으로 간다
function TurnPill({ needsYou }) {
  const t = useT();
  const [open, setOpen, ref] = useDropdown();
  const focusId = useStore((st) => st.focusId);
  const currentWs = useStore((st) => st.currentWs);
  const now = useNow();
  const n = needsYou.length;
  if (!n) return null; // P214: 0이면 숨긴다(값이 생기면 나타난다)
  return (
    <div className="mt-drop" ref={ref}>
      <button className={`mt-cp turn${n ? ' hot' : ''}${open ? ' on' : ''}`} data-role="inbox" data-count={n} title={n ? t('top.turnTitle') : t('top.turnNone')} onClick={() => setOpen((o) => !o)}>
        <span className="mt-turn-dot" /><span className="mt-cp-label">{t('top.turn')}</span> <b className="mono">{n}</b>
      </button>
      {open && (
        <div className="mt-dropdown" data-role="inbox-list">
          <div className="mt-dropdown-head"><span>{t('top.turn')}</span>{n > 0 && <span className="mt-kbd">{t('top.nextKey')}</span>}</div>
          {needsYou.map((s) => (
            <button key={s.sessionId} className={`mt-chip need${focusId === s.sessionId ? ' current' : ''}`} data-session={s.sessionId} data-name={s.name} onClick={() => { setOpen(false); go(s.sessionId); }} title={askLine(s)}>
              <span className="mt-chip-line"><b>@{s.name}</b> {wsTag(s, currentWs)} <span className="mt-chip-time">{ago(s.waitingSince || (s.ask && s.ask.since) || s.createdAt, now)}</span></span>
              <span className="mt-chip-what">{askLine(s)}</span>
            </button>
          ))}
          {!n && <div className="mt-dropdown-empty">{t('top.turnEmpty')}</div>}
        </div>
      )}
    </div>
  );
}

function ListPill({ list, label, cls, role, line, empty, readAll = false }) {
  const t = useT();
  const [open, setOpen, ref] = useDropdown();
  const [busy, setBusy] = useState(false);
  const unseen = readAll ? seenTargets(list) : [];
  // P255: 모두 읽기. 목록의 작업 완료를 모두 본 것으로 표시한다(세션마다 하나씩 보는 것과 같다)
  const doReadAll = async () => { setBusy(true); try { await markAllSeen(unseen); } finally { setBusy(false); setOpen(false); } };
  const currentWs = useStore((st) => st.currentWs);
  return (
    <div className="mt-drop" ref={ref}>
      <button className={`mt-cp ${cls}${list.length ? ' has' : ''}${open ? ' on' : ''}`} data-role={role} data-count={list.length} title={label} onClick={() => setOpen((o) => !o)}>
        <span className="mt-cp-label">{label}</span> <span className="mono">{list.length}</span>
      </button>
      {open && (
        <div className="mt-dropdown" data-role={`${role}-list`}>
          <div className="mt-dropdown-head"><span>{label}</span>{readAll && unseen.length > 0 && <button type="button" className="mt-btn small mt-read-all" data-action="read-all" disabled={busy} title={t('p255.readAllTitle')} onClick={doReadAll}>{t('p255.readAll')}</button>}</div>
          {list.map((s) => (
            <button key={s.sessionId} className={`mt-chip ${cls}`} data-session={s.sessionId} data-name={s.name} onClick={() => { setOpen(false); go(s.sessionId); }} title={line(s)}>
              <span className="mt-chip-line"><b>@{s.name}</b> {wsTag(s, currentWs)}</span>
              {line(s) && <span className="mt-chip-what">{line(s)}</span>}
            </button>
          ))}
          {!list.length && <div className="mt-dropdown-empty">{empty}</div>}
        </div>
      )}
    </div>
  );
}

function ConnPill() {
  const t = useT();
  const rawConn = useStore((st) => st.conn);
  const { grace } = useConnSteady(); // P82: 웹 화면은 짧은 끊김(2초 안)에 알약을 바꾸지 않는다
  const conn = isWeb && grace ? 'open' : rawConn;
  const term = useStore((st) => st.terminal);
  const count = useStore((st) => st.sessions.size);
  const links = useStore((st) => st.links.size);
  const [starting, setStarting] = useState(false);
  const startTerminal = async () => { setStarting(true); try { await api.call('terminal.start'); toast(t('top.terminalStarted')); } catch (e) { toast(t('top.terminalStartFail', { error: errText(e) }), 'error'); } setStarting(false); };
  const termBlocked = !!(term.missing || term.level === 'missing' || term.level === 'incompatible'); // P40: 띠가 까닭과 할 일을 보인다
  const ok = conn === 'open' && term.connected && !termBlocked;
  const connWord = (c) => t(c === 'open' ? 'top.connected' : c === 'connecting' ? 'top.connecting' : 'top.disconnected');
  // P32: 누르면 미션 맵을 열고(열려 있으면 닫고) 올리면 연결 풀이. 백엔드와 끊겨 있으면 맵을 읽을 수 없으므로 누르기를 받지 않는다(터미널 서버만 끊긴 때는 판 데이터로 연다)
  const mission = useStore((st) => st.missionOpen);
  const canOpen = conn === 'open';
  const title = [t('top.connBackend', { state: connWord(conn) }), t('top.connTerminal', { session: term.session || '?', version: term.hcVersion || term.version ? ` (${term.hcVersion || term.version})` : '', state: connWord(term.connected ? 'open' : 'closed') }), t('top.connSessions', { n: count }), t('top.connLinks', { n: links }), canOpen ? t(mission ? 'mmap.pillClose' : 'mmap.pillOpen') : null].filter(Boolean).join('\n');
  const toggle = () => { if (canOpen || mission) setMissionOpen(!mission); };
  const badText = conn !== 'open' ? t('top.backendState', { state: connWord(conn) }) : termBlocked ? t(term.level === 'incompatible' ? 'top.terminalIncompatible' : 'terminalMove.top.hcMissing') : term.connected === false ? t('top.terminalDown') : null;
  return <>
    <span className={`mt-cp conn${ok ? '' : ' bad'}${canOpen ? ' click' : ''}${mission ? ' on' : ''}`} data-role="conn" data-action="conn-mission" title={title} role={canOpen ? 'button' : undefined} tabIndex={canOpen ? 0 : undefined} aria-pressed={canOpen ? mission : undefined} onClick={toggle} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}>
      <span className={`mt-dot ${ok ? 'ok' : 'bad'}`} />
      {/* P347: 점(연결 상태 색) 옆에 늘 "세션 맵" 글. 연결이 나쁘면 그 까닭 글이 뒤에 붙는다 */}
      <span className="mt-conn-label" data-role="conn-label">{t('mapPill.label')}</span>
      {badText ? <span className="mt-conn-state" data-role="conn-state">{badText}</span> : null}
      <span hidden data-role="links">{links}</span>
    </span>
    {conn === 'open' && term.connected === false && !termBlocked && <button className="mt-cp accent" disabled={starting} onClick={startTerminal} data-action="terminal-start">{t('top.terminalStart')}</button>}
  </>;
}

// P21(D4): 누르면 펼침 목록(세션별 메모리, 잠든 세션과 아낀 메모리, 쉬는 세션 모두 잠재우기). 잠든 세션을 누르면 그 노드로 간다(깨우지 않는다)
// P24: 목록은 리포별로 묶는다(리포 이름, 깨어 있는 메모리, 잠든 수와 아낀 메모리). 동작은 쉬는 리포 모두 잠재우기
function ResourcePill({ maxControllers }) {
  const t = useT();
  const r = useStore((st) => st.resources);
  const attached = useStore((st) => st.attached.length);
  const sessions = useStore((st) => st.sessions);
  const workspaces = useStore((st) => st.workspaces);
  const [open, setOpen, ref] = useDropdown();
  const [busy, setBusy] = useState(false);
  if (!r) return null;
  const z = asleepStats(sessions);
  const asleepLine = z.n ? t('sleep.memAsleep', { n: z.n, mb: fmtMB(z.mb) }) : t('sleep.memAsleepNone');
  const title = [
    asleepLine,
    t('top.resSessions', { n: r.sessionCount, mb: fmtMB(r.sessionsMB) }),
    ...r.sessions.map((x) => t('top.resSession', { name: x.name, mb: fmtMB(x.memMB), claude: fmtMB(x.claudeMB), n: x.procs })),
    t('top.resControllers', { n: r.controllers.count, mb: fmtMB(r.controllers.memMB), attached, max: maxControllers }),
    r.terminalServer ? t('top.resTerminal', { mb: fmtMB(r.terminalServer.memMB) }) : t('top.resNoTerminal'),
    t('top.resBackend', { mb: fmtMB(r.backend.memMB) }),
    t('top.resStates', { working: r.running, waiting: r.waiting }),
    t('p255.cpu', cpuLine(r)),
    t('top.resAt', { time: fmtTime(r.at), ms: r.ms }),
  ].join('\n');
  const repos = memByRepo(r.sessions, sessions, workspaces); // 잰 뒤 잠든 세션은 잠든 줄로만
  const order = resOrder(r.sessions, sessions); // P348: 위 세션 목록
  const cores = (r.cpu && r.cpu.cores) || 1; // P348: 줄의 CPU는 코어 하나 대비로(폭주 배지·설정 기준과 같은 잣대)
  const doSleep = async () => { setBusy(true); await sleepIdle(); setBusy(false); };
  return (
    <div className="mt-drop" ref={ref}>
      <button className={`mt-cp res${open ? ' on' : ''}${r.sessions.some((x) => x.guard && x.guard.kind === 'suspect') ? ' guard' : ''}`} title={title} data-role="resources" data-asleep={z.n} data-guard={r.sessions.filter((x) => x.guard).length || undefined} onClick={() => setOpen((o) => !o)}>
        <span className="dim">{t('top.memory')}</span><span className="mono">{fmtMB(r.sessionsMB)}</span>
        {z.n > 0 && <span className="mt-res-asleep" data-role="res-asleep" title={asleepLine}><Icon name="moon" />{z.n}</span>}
      </button>
      {open && (
        <div className="mt-dropdown" data-role="resources-list">
          <div className="mt-dropdown-head"><span>{t('sleep.memHead')} · {fmtMB(r.sessionsMB)}</span>{r.intervalMs ? <span className="dim mt-res-every" data-role="res-every" title={t('p348.everyTitle', { ms: r.readMs ?? r.ms })}>{t('p348.every', { s: Math.round(r.intervalMs / 1000) })}</span> : null}</div>
          <ResTrend cores={cores} />
          {/* P348: 세션 목록을 판 전체·PC 전체 값 위에, 폭주·무거움 먼저, CPU·메모리 큰 순(측정마다 다시 그린다) */}
          <div className="mt-res-top" data-role="res-top">
            {order.map((x) => (
              <button key={x.sessionId} className={`mt-chip${x.guard ? ` mt-res-guard k-${x.guard.kind}${x.guard.paused ? ' paused' : ''}` : ''}`} data-role="res-row" data-session={x.sessionId} data-name={x.name} data-guard={x.guard ? x.guard.kind : undefined} onClick={() => { setOpen(false); go(x.sessionId); }}>
                <span className="mt-chip-line"><b>@{x.name}</b>{x.cpuPct != null && <span className="mono" data-role="res-row-cpu" title={t('p348.rowCpuTitle')}> CPU {fmtPct(x.cpuPct * cores)}</span>} <span className="mono">{fmtMB(x.memMB)}</span> <span className="dim">{STATE_LABEL[x.state] || x.state}</span></span>
                {x.guard ? <span className="mt-chip-line mt-guard-line"><GuardBadge sessionId={x.sessionId} where="list" /></span> : null}
              </button>
            ))}
          </div>
          <div className="mt-res-sum" data-role="res-asleep-line">{asleepLine}</div>
          <div className="mt-res-sum" data-role="res-cpu" title={t('p255.cpuTitle')}>{t('p255.cpu', cpuLine(r))}</div>
          {repos.map((g) => (
            <div key={g.key || '-'} className="mt-res-group" data-role="res-repo" data-ws={g.key} data-name={g.name}>
              <div className="mt-res-repo"><b>{g.name}</b> <span className="mono">{fmtMB(g.memMB)}</span>{g.asleep.length > 0 && <span className="mt-res-asleep" data-role="res-repo-asleep"><Icon name="moon" />{t('sleep.memRepoAsleep', { n: g.asleep.length, mb: fmtMB(g.savedMB) })}</span>}</div>
              {g.asleep.map((s) => (
                <button key={s.sessionId} className="mt-chip asleep" data-session={s.sessionId} data-name={s.name} data-role="res-asleep-row" onClick={() => { setOpen(false); go(s.sessionId); }}>
                  <span className="mt-chip-line"><Icon name="moon" /> {t('sleep.memRowAsleep', { name: s.name, mb: fmtMB(s.sleep && s.sleep.memMB) })}</span>
                </button>
              ))}
            </div>
          ))}
          <div className="mt-card-actions"><button className="mt-btn small" data-action="sleep-idle" disabled={busy} title={t('sleep.sleepIdleTitle')} onClick={doSleep}><Icon name="moon" />{t('sleep.sleepIdle')}</button></div>
        </div>
      )}
    </div>
  );
}

export function TopRight({ maxControllers }) {
  const t = useT();
  return (
    <div className="mt-cluster tr" data-role="top-right">
      <ConnPill />
      <DevicesPill />
      <ResourcePill maxControllers={maxControllers} />
      <UsagePill />
      <button className="mt-cp round" onClick={() => openDialog({ kind: 'settings' })} data-action="settings-open" title={t('top.settings')}><Icon name="gear" /></button>
    </div>
  );
}

// ---------- 도구 레일 ----------
function Tool({ icon, kind, label, on, onClick, action, pressed }) {
  return (
    <button className={`mt-tool${on ? ' on' : ''}`} title={label} aria-label={label} aria-pressed={pressed} data-action={action} onClick={onClick}>
      {kind ? <KindIcon kind={kind} title={label} badge /> : <Icon name={icon} />}
    </button>
  );
}
const Sep = () => <span className="mt-rail-sep" />;
// P33: 즐겨찾기 호출자 하나. Shift+누르기는 그 호출자를 채운 새 세션 창.
// P97: 누르면 바로 띄우지 않고 단추 옆에 세션 이름 칸(QuickName.jsx)을 연다. 다시 누르면 닫는다
// 아이콘은 하네스 로고(고른 아이콘이 먼저), 셸은 터미널, 직접 명령은 터미널 위에 이름 첫 글자. 마우스를 올리면 이름과 명령 미리보기
function LauncherTool({ l, open, onOpen }) {
  const t = useT();
  const kind = launcherIcon(l);
  const tip = launcherTooltip(l, { shellText: t('launchers.shellPreview'), envText: t('launchers.envShort') });
  const go = (e) => (e && e.shiftKey ? openDialog({ kind: 'spawn', launcher: l.id }) : onOpen(open ? null : { id: l.id, el: e.currentTarget }));
  return (
    <button className={`mt-tool${open ? ' on' : ''}`} title={tip} aria-label={l.name} aria-haspopup="dialog" aria-expanded={open} data-action="launch" data-launcher={l.id} data-name={l.name} onClick={go}>
      {kind === 'shell' ? <Icon name="terminal" /> : kind ? <KindIcon kind={kind} title={tip} badge /> : <span className="mt-tool-mark" data-role="launcher-mark">{launcherMark(l)}</span>}
    </button>
  );
}
// 즐겨찾기가 많으면 이 칸만 위아래로 넘긴다(레일은 창 높이를 넘지 않는다). P97: 끝의 +는 설정 › 런처 › 새 런처(명령줄 붙여 넣기 칸에 초점)
function Favorites() {
  const t = useT();
  const data = useStore((st) => st.launchers);
  const favs = favoriteLaunchers(data);
  const [open, setOpen] = useState(null); // { id, el }: 이름 칸을 연 단추
  const cur = open && favs.find((l) => l.id === open.id);
  return (
    <div className="mt-rail-favs" data-role="rail-favorites">
      {favs.map((l) => <LauncherTool key={l.id} l={l} open={!!cur && cur.id === l.id} onOpen={setOpen} />)}
      <button className="mt-tool add" title={t('quickName.addLauncher')} aria-label={t('quickName.addLauncher')} data-action="launcher-add" onClick={() => openDialog({ kind: 'settings', tab: 'launchers', newLauncher: true })}><Icon name="plus" /></button>
      {cur && <QuickName launcher={cur} anchor={open.el} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function LeftRail({ linking, setLinking }) {
  const t = useT();
  const spot = useStore((st) => st.spotlight);
  return (
    <div className="mt-rail left" data-role="rail-left">
      <Tool icon="pointer" on={!linking} label={t('rail.select')} action="tool-select" onClick={() => { setLinking(false); getState().clearSelection && getState().clearSelection(); }} />
      {/* 손으로 잇기는 선택과 서로 바뀌는 모드라 바로 아래에 둔다 */}
      <Tool icon="link" on={linking} label={t('rail.link')} action="link-mode" onClick={() => setLinking(!linking)} />
      <Sep />
      <Favorites />
      <Sep />
      <Tool icon="note" label={t('rail.memo')} action="memo-new" onClick={() => createItem('memo')} />
      <Tool icon="kanban" label={t('rail.kanban')} action="kanban-new" onClick={() => createItem('kanban')} />
      <Sep />
      <Tool icon="expand" label={t('spaceFit.rail')} action="fit-all" onClick={() => getState().fitAll && getState().fitAll(250)} />
      {/* P85: 멀리 보기에서 일함·내 차례·오류 밖의 노드를 더 물린다. 이 창 프로필에 남는다(단축키 없음) */}
      <Tool icon="spot" on={spot} pressed={spot} label={t(spot ? 'spotlight.off' : 'spotlight.on')} action="spotlight" onClick={() => setSpotlight(!spot)} />
    </div>
  );
}

export function RightRail({ loopsOpen, setLoopsOpen }) {
  const t = useT();
  const sideOpen = useSide((st) => st.open);
  const mission = useStore((st) => st.missionOpen);
  return (
    <div className="mt-rail right" data-role="rail-right">
      <Tool icon="folder" on={sideOpen} label={t('rail.sidebar')} action="sidebar-rail" onClick={toggleSidebar} />
      <Tool icon="flower" on={mission} label={t('rail.mission')} action="mission-rail" onClick={() => setMissionOpen(!mission)} />
      <Tool icon="repeat" on={loopsOpen} label={t('rail.loops')} action="loops-open" onClick={() => setLoopsOpen(!loopsOpen)} />
      <Sep />
      <Tool icon="archive" label={t('rail.archive')} action="archive-open" onClick={openArchiveBox} />
      <Sep />
      <Tool icon="gear" label={t('rail.settings')} action="settings-rail" onClick={() => openDialog({ kind: 'settings' })} />
    </div>
  );
}

// 오른쪽 레일의 루프 목록(모든 루프). 만들기는 노드 ⋯ 메뉴에서 한다
export function LoopsPanel({ onClose }) {
  const t = useT();
  const loops = useStore((st) => st.loops);
  const now = useNow();
  const list = [...loops.values()];
  const box = useDialog(onClose, { modal: false }); // P52: 떠 있는 창. Esc로 닫는다
  if (!list.length) return <div ref={box} className="mt-loops-panel"><div className="mt-loop-list" data-role="loop-list"><div className="mt-card-head"><span className="mt-card-title">{t('loops.title')}</span><button className="mt-card-min" onClick={onClose}><Icon name="x" /></button></div><div className="dim">{t('loops.panelEmpty')}</div></div></div>;
  return <div ref={box} className="mt-loops-panel"><LoopList loops={list} now={now} onClose={onClose} /></div>;
}

// ---------- 아래 ----------
// 빠른 동작 칩. 칩마다 테두리 색이 다르다(tokens.css --chip-ring-n)
export function ChipRow() {
  const t = useT();
  const boardArranged = useStore((st) => st.arranged.has(BOARD_ARRANGED));
  const shown = useStore((st) => st.bottomShown); // P43: 명령 바와 함께 숨고 나타난다(CommandBar.jsx useAutoHide)
  const chips = [
    [t('chips.spawn'), 'chip-spawn', t('chips.spawnTitle'), () => openDialog({ kind: 'spawn' })],
    // P31: 칩의 정리는 판 전체(영역도 다시 놓는다). 영역 이름표의 정리는 그 영역 안만
    [t('chips.arrange'), 'chip-arrange', t('arrangeAll.title'), () => arrangeBoard()],
    ...(boardArranged ? [[t('arrangeAll.undo'), 'chip-arrange-undo', t('arrangeAll.undoTitle'), () => arrangeBoard(true)]] : []),
    [t('chips.mission'), 'chip-mission', t('chips.missionTitle'), () => setMissionOpen(true)],
    [t('chips.fit'), 'chip-fit', t('spaceFit.chip'), () => getState().fitAll && getState().fitAll(250)],
  ];
  return (
    <div className="mt-chips" data-role="chips" data-hidden={shown ? undefined : '1'}>
      {chips.map(([label, action, title, fn], i) => <button key={action} className="mt-qchip" style={{ '--chip-ring': `var(--chip-ring-${(i % 7) + 1})` }} data-action={action} title={title} onClick={fn}>{label}</button>)}
    </div>
  );
}

export function ZoomPill() {
  const t = useT();
  const pct = useStore((st) => Math.round((st.vpNow ? st.vpNow.zoom : 1) * 100)); // P112: 보이는 숫자(%)가 바뀔 때만 다시 그린다
  const by = (f) => getState().zoomBy && getState().zoomBy(f);
  return (
    <div className="mt-cp zoom" data-role="zoom">
      <button title={t('zoom.out')} data-action="zoom-out" onClick={() => by(1 / 1.25)}><Icon name="minus" /></button>
      <button className="mt-zoom-n mono" title={t('spaceFit.zoom')} data-action="zoom-fit" onClick={() => getState().fitAll && getState().fitAll(250)}>{pct}%</button>
      <button title={t('zoom.in')} data-action="zoom-in" onClick={() => by(1.25)}><Icon name="plus" /></button>
    </div>
  );
}
