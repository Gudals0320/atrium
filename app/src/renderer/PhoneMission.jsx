// P87: 휴대폰 미션 맵(작업 관계도). 세션 목록 머리줄의 단추로 연다. 누가 누구의 무슨 역할인지, 무엇이 일하는지를 세로 나무로 보인다.
// - 자료는 mission.graph만 받는다(이름, 역할, 상태, 부모·하위, 연결). 대화(session.messages)와 터미널은 받지 않는다. 상태는 판의 세션 요약(이미 받은 것)으로 덧입힌다
// - 배치는 lib/phone-mission.js(워크스페이스 무리마다 위 → 아래 나무, 부모 아래 들여쓴 하위 세션, 역할 이름표, 나무에 들지 못한 연결은 "→ @받는 쪽")
// - 강조는 P85 등급: 일함은 강조색 테두리와 천천히 깜빡이는 점, 응답 필요·오류는 따로 눈에 띄게, 쉼·잠듦·끝남은 흐리게. 정지 화면에서도 테두리와 상태 글로 가른다
// - 줄을 누르면 그 세션 화면(Phone.jsx PhoneSession)을 연다. 돌아오면 마지막 그래프와 스크롤 자리를 그대로 그린다(모듈에 둔다)
// - 두 손가락 확대는 넣지 않는다: 줄은 화면 폭에 맞춰 접히고 글은 목록과 같은 크기라 확대할 것이 없다. 페이지 확대는 P74처럼 막혀 있다
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useStore, wsName } from './store.js';
import { useT, errText } from './lib/i18n.js';
import { STATE_LABEL } from './lib/labels.js';
import { phoneMission, PM_FOLD_KEY } from './lib/phone-mission.js';
import { toneOf } from './lib/phone.js';

const REFRESH_MS = 600; // 판이 바뀌면 이만큼 모았다가 다시 받는다
let cache = null; // 마지막 mission.graph
let scrollAt = 0; // 마지막 스크롤 자리
const store = () => { try { return localStorage; } catch { return null; } };
const readFolded = () => { try { return JSON.parse(store().getItem(PM_FOLD_KEY) || '[]'); } catch { return []; } };
const Chev = ({ dir = 'right' }) => <svg className="mt-ph-chev" viewBox="0 0 24 24" aria-hidden="true"><path d={dir === 'left' ? 'm15 18-6-6 6-6' : dir === 'down' ? 'm6 9 6 6 6-6' : 'm9 18 6-6-6-6'} /></svg>;

function stateText(r, live) {
  const s = live || { state: r.state, kind: r.agentKind };
  if (s.kind === 'shell' && s.state !== 'exited' && s.state !== 'sleeping') return s.shell && s.shell.atPrompt === false ? STATE_LABEL.shell_running : STATE_LABEL.shell_idle;
  return STATE_LABEL[s.state] || s.state || '';
}

function Row({ r, live, onOpen }) {
  const t = useT();
  const tone = toneOf(live || { state: r.state, kind: r.agentKind });
  return (
    <button type="button" className={`mt-pm-row t-${r.tier}`} data-role="pm-row" data-session={r.sessionId} data-name={r.name} data-tier={r.tier} data-depth={r.depth} onClick={() => onOpen(r.sessionId)}>
      {r.depth > 0 && (
        <span className="mt-pm-tree" aria-hidden="true">
          {r.guides.map((on, i) => <i key={i} className={on ? 'on' : ''} />)}
          <i className={`elbow${r.last ? ' last' : ''}${r.active ? ' active' : ''}`} />
        </span>
      )}
      <span className="mt-pm-card">
        <span className="mt-pm-top">
          <span className="mt-ph-dot" data-tone={tone} />
          <b className="mt-pm-name">{r.name}</b>
          {r.depth > r.indent && <span className="mt-pm-deep">{t('phoneMission.depth', { n: r.depth + 1 })}</span>}
          <span className="mt-pm-state" data-role="pm-state">{r.tier === 'turn' ? t('phoneMission.turn') : stateText(r, live)}</span>
        </span>
        {(r.role || r.from || r.loops > 0) && (
          <span className="mt-pm-meta">
            {r.role && <span className="mt-pm-role" data-role="pm-role">{r.role}</span>}
            {r.from && <span className="mt-pm-from" data-role="pm-from">{t('phoneMission.from', { name: r.from.name, ws: r.from.key ? wsName(r.from.key) : t('phone.noRepo') })}</span>}
            {r.loops > 0 && <span className="mt-pm-loop">⟳{r.loops}</span>}
          </span>
        )}
        {r.ask && (r.tier === 'turn' || r.tier === 'alert') && <span className="mt-pm-ask" data-role="pm-ask">{r.ask}</span>}
        {r.links.length > 0 && (
          <span className="mt-pm-links">
            {r.links.map((l, i) => <span key={i} className={`mt-pm-link${l.active ? ' active' : ''}`} data-role="pm-link">→ {l.to}{l.role ? ` · ${l.role}` : ''}</span>)}
          </span>
        )}
      </span>
    </button>
  );
}

export function PhoneMission({ onBack, onOpen, conn }) {
  const t = useT();
  const sessions = useStore((st) => st.sessions);
  const links = useStore((st) => st.links);
  const thread = useStore((st) => st.thread);
  const loops = useStore((st) => st.loops);
  const workspaces = useStore((st) => st.workspaces);
  const [graph, setGraph] = useState(cache);
  const [fail, setFail] = useState(null);
  const [folded, setFolded] = useState(readFolded);
  const scrollRef = useRef(null);
  const restored = useRef(false);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => api.call('mission.graph').then((g) => { cache = g; if (alive) { setGraph(g); setFail(null); } }).catch((e) => { if (alive) setFail(e); }), graph ? REFRESH_MS : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [sessions, links, thread, loops]); // eslint-disable-line react-hooks/exhaustive-deps
  // 돌아오면 마지막 스크롤 자리로(그래프를 그린 뒤 한 번)
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !graph || restored.current) return;
    restored.current = true;
    el.scrollTop = scrollAt;
  }, [graph]);

  const order = useMemo(() => (workspaces || []).map((w) => w.key), [workspaces]);
  const lay = useMemo(() => (graph ? phoneMission(graph, { live: sessions, order, folded }) : null), [graph, sessions, order, folded]);
  const toggle = (key) => setFolded((f) => { const k = key || '-'; const n = f.includes(k) ? f.filter((x) => x !== k) : [...f, k]; try { store().setItem(PM_FOLD_KEY, JSON.stringify(n)); } catch {} return n; });
  const c = lay ? lay.counts : null;
  return (
    <div className="mt-ph-list mt-pm" data-role="phone-mission">
      <header className="mt-ph-head">
        <button type="button" className="mt-pm-back" data-action="phone-mission-back" aria-label={t('phoneMission.back')} onClick={onBack}><Chev dir="left" /><span>{t('phone.list')}</span></button>
        <b className="mt-pm-title">{t('phoneMission.title')}</b>
        {conn}
      </header>
      {c && (
        <div className="mt-pm-sum" data-role="pm-sum">
          <span className="mt-pm-chip t-work" data-n={c.work}><i />{t('phoneMission.working', { n: c.work })}</span>
          <span className="mt-pm-chip t-turn" data-n={c.turn}><i />{t('phoneMission.needs', { n: c.turn })}</span>
          <span className="mt-pm-chip">{t('phoneMission.all', { n: c.all })}</span>
        </div>
      )}
      <div className="mt-ph-scroll mt-pm-scroll" data-role="pm-scroll" ref={scrollRef} onScroll={(e) => { scrollAt = e.currentTarget.scrollTop; }}>
        {!lay && !fail && <div className="mt-ph-empty">{t('common.loading')}</div>}
        {!lay && fail && <div className="mt-ph-empty" data-role="pm-fail">{t('mission.fail', { error: errText(fail) })}</div>}
        {lay && lay.groups.map((g) => (
          <section key={g.key || '-'} className={`mt-pm-group${g.folded ? ' folded' : ''}`} data-role="pm-group" data-ws={g.key || ''}>
            <button type="button" className="mt-ph-group" data-action="pm-fold" aria-expanded={!g.folded} onClick={() => toggle(g.key)}>
              <Chev dir={g.folded ? 'right' : 'down'} />
              <span className="mt-ph-group-name">{g.key ? wsName(g.key) : t('phone.noRepo')}</span>
              {g.work > 0 && <span className="mt-pm-gn t-work" title={t('phoneMission.working', { n: g.work })}><i />{g.work}</span>}
              {g.turn > 0 && <span className="mt-pm-gn t-turn" title={t('phoneMission.needs', { n: g.turn })}><i />{g.turn}</span>}
              <span className="mt-ph-group-n">{g.count}</span>
            </button>
            {g.rows.map((r) => <Row key={r.id} r={r} live={r.sessionId ? sessions.get(r.sessionId) : null} onOpen={onOpen} />)}
          </section>
        ))}
        {lay && lay.groups.length === 0 && <div className="mt-ph-empty" data-role="pm-empty">{t('phone.empty')}</div>}
        {lay && lay.groups.length > 0 && <div className="mt-pm-hint">{t('phoneMission.hint')}</div>}
      </div>
    </div>
  );
}
