// P251: 세션 맵의 rig 구조 지도 한 장(docs research rig3-map.md 3.2). 배치는 lib/rig-map.js mapLayout(순수), 자료는 판 API rig.map(store rigMaps).
// 왼쪽에서 오른쪽으로 읽는다: 머리 띠(켜짐·판·사이클과 다음 박자·사람이 볼 것·멈춘 역할) / "rig 밖"(사람, 빌더) / "rig"(역할 기둥: 카드 + 섹터·도구) / 사이클 띠 / 변경 기록 띠.
// 범례 없이 선마다 글이 붙는다. 지도는 그림이다: 역할·빌더 카드를 누르면 명령줄 @태그, 두 번 누르면 판의 그 세션, 머리 띠를 누르면 rig 판. 조작은 rig 판에 둔다.
// 멀리서(.lv-far)는 테두리, 역할 이름, 상태 색만 남긴다(styles.css 끝 .mt-rm).
import { memo } from 'react';
import { STATE_LABEL, agoText } from './lib/labels.js';
import { flowText, untilText, periodText, BUILDER_ROLE } from './lib/rig-map.js';

const ST = { working: 'working', waiting: 'needs', trust_wait: 'needs', error: 'error', ready: 'ready', sleeping: 'sleeping', exited: 'exited' };
const stOf = (s) => (!s ? 'none' : ST[s] || 'ready');
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const Clock = () => <svg className="mt-rm-clock" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" /><path d="M8 4.6V8l2.4 1.6" /></svg>;
const clip = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1) + '…' : x; };

// 역할 세션의 지금 값(창의 세션 값이 이긴다) → { sessionId, name, state, task }
export function liveRole(r, sid, live) {
  const cur = sid && live ? live.get(sid) : null;
  const s = r && r.session;
  if (!cur && !s) return null;
  const state = cur ? cur.state : s.asleep ? 'sleeping' : s.state;
  return { sessionId: sid || s.sessionId, name: cur ? cur.name : s.name, state, task: cur && cur.state === 'working' ? cur.lastPrompt : null };
}

function Head({ m, t, now, onPanel }) {
  const h = m.head || {};
  const u = untilText(h.nextAt, now);
  const parts = [
    <b key="s" className={`mt-rm-st ${m.status}`}><i />{t('rigMap.title')} · {t(`rigMap.${m.status === 'on' ? 'on' : m.status === 'off' ? 'off' : 'invalid'}`)}</b>,
    m.name ? <span key="n" className="nm">{m.name}</span> : null,
    m.versionN != null ? <span key="v">{t('rigMap.version', { n: m.versionN })}</span> : null,
    h.cycle != null ? <span key="c"><Clock />{t('rigMap.cycle', { n: h.cycle })}{u ? <span className="dim"> ({t('rigMap.nextBeat', { when: t(`rigMap.unit.${u.unit}`, { n: u.n }) })})</span> : null}</span> : null,
    h.attention ? <span key="a" className="warn" data-role="rm-attention">{t('rigMap.attention', { n: h.attention })}</span> : null,
    h.stalled ? <span key="x" className="bad" data-role="rm-stalled">{t('rigMap.stalled', { n: h.stalled })}</span> : null,
  ].filter(Boolean);
  return <button type="button" className="mt-rm-head" data-role="rm-head" title={t('rigMap.openPanel')} onClick={onPanel} style={{ height: 64 }}>{parts}</button>;
}

function RoleCard({ r, b, lv, t, onTag, onGo }) {
  const st = lv ? lv.state : r.gaveUp ? 'gaveUp' : null;
  const cls = `mt-rm-role st-${stOf(st)}${st === 'working' ? ' hot' : ''}`;
  const stText = !lv ? (r.gaveUp ? t('rigMap.gaveUp') : t('rigMap.noSession')) : STATE_LABEL[st] || st;
  return (
    <div className={cls} style={{ left: b.x, top: b.y, width: b.w, height: b.h }} data-role="rm-role" data-name={r.name} data-state={st || 'none'} role="button" tabIndex={0}
      onClick={() => lv && onTag(lv.name)} onDoubleClick={() => lv && onGo(lv.sessionId)} onKeyDown={(e) => { if (e.key === 'Enter' && lv) onGo(lv.sessionId); }}>
      {r.beat ? <span className="beat" data-role="rm-beat"><Clock />{periodText(r.beat.every, r.beat.at, t)}</span> : null}
      <span className="r1"><span className="rn" data-role="rm-role-name">{r.name}</span><span className="rs"><i />{stText}</span></span>
      <span className="r2 det">{[r.launcher, r.model].filter(Boolean).join(' · ')}{r.docN != null ? <span> · {t('rigMap.docN', { n: r.docN })}</span> : null}</span>
      <span className="r3 det">
        {r.received ? <span className="ct">{t('rigMap.received', { n: r.received })}</span> : null}
        {r.unanswered ? <span className="ct warn">{t('rigMap.unanswered', { n: r.unanswered })}</span> : null}
        {r.material ? <span className="ct">{t('rigMap.material', { n: r.material })}</span> : null}
        {r.foreign ? <span className="ct bad">{t('rigMap.foreign', { n: r.foreign })}</span> : null}
      </span>
      {lv && lv.task ? <span className="r4 det" data-role="rm-task">{clip(lv.task, 90)}</span> : null}
    </div>
  );
}

function Sector({ s, t }) {
  return (
    <div className={`mt-rm-sector det${s.side ? ' side' : ''}`} style={{ left: s.x, top: s.y, width: s.w, height: s.h }} data-role="rm-sector" data-path={s.path}>
      <span className="sp">└ {s.path}{s.side ? <span className="dim"> · {s.role}</span> : null}</span>
      {s.items.map((it) => <span key={it.id} className={`si is-${it.state}`} data-role="rm-item" data-id={it.id} data-state={it.state} title={it.reason || ''}><b>{it.id}</b><span>{t(`rigMap.state.${it.state}`)}</span></span>)}
      {s.more ? <span className="sm">{t('rigMap.more', { n: s.more })}</span> : null}
    </div>
  );
}

function Tool({ x, t, now }) {
  const st = x.last ? (x.last.status === 'done' && !x.alarms ? 'ok' : 'bad') : 'none';
  return (
    <div className={`mt-rm-tool det tl-${st}${x.side ? ' side' : ''}`} style={{ left: x.x, top: x.y, width: x.w, height: x.h }} data-role="rm-tool" data-name={x.name}>
      <span className="t1">{x.every ? <Clock /> : '⚙'} <b>{x.name}</b>{x.every ? <span className="dim" data-role="rm-tool-every"> {periodText(x.every, null, t)}</span> : null}</span>
      <span className="t2">{x.last ? t('rigMap.toolLast', { ago: agoText(x.last.at) }) + ' · ' + x.last.status : t('rigMap.toolNever')}{x.alarms ? <span className="bad"> · {t('rigMap.alarms', { n: x.alarms })}</span> : null}</span>
    </div>
  );
}

// 선의 마우스 풍선: 그 길로 마지막에 오간 항목(번호, 상태, 때, 반려면 까닭)
const flowTip = (f, t) => (f && f.last && f.last.length ? f.last.map((x) => `${x.id} · ${t(`rigMap.state.${x.state}`)} · ${agoText(x.t)}${x.reason ? ` · "${clip(x.reason, 80)}"` : ''}`).join('\n') : t('rigMap.pathNone'));

export const RigMap = memo(function RigMap({ m, g, x, y, live, sid, t, now, onTag, onGo, onPanel, onUnfold, onEntry, entryOpen }) {
  if (!m || !g) return null;
  if (g.folded) {
    return (
      <div className="mt-rm folded" style={{ left: x, top: y, width: g.w, height: g.h }} data-role="rig-map" data-ws={m.workspace} data-status={m.status}>
        <button type="button" className="mt-rm-fold" data-action="rm-unfold" onClick={() => onUnfold(m.workspace)}><b>{t('rigMap.folded')}</b>{m.name ? <span className="nm">{m.name}</span> : null}<span className="dim">{t('rigMap.unfold')}</span></button>
      </div>
    );
  }
  const flows = m.flows || [];
  const byName = new Map((m.roles || []).map((r) => [r.name, r]));
  const bl = m.builder ? liveRole({ session: m.builder }, m.builder.sessionId, live) : null;
  const nRaise = (m.raises || []).length;
  return (
    <div className={`mt-rm${g.dim ? ' dim' : ''}`} style={{ left: x, top: y, width: g.w, height: g.h }} data-role="rig-map" data-ws={m.workspace} data-status={m.status}>
      <Head m={m} t={t} now={now} onPanel={() => onPanel(m.workspace)} />
      {m.status !== 'on' ? <button type="button" className="mt-rm-refold" data-action="rm-fold" onClick={() => onUnfold(m.workspace)}>{t('rigMap.fold')}</button> : null}
      <div className="mt-rm-col out" style={{ left: g.out.x, top: g.out.y, width: g.out.w, height: g.out.h }}><span className="ch">{t('rigMap.outside')}</span></div>
      <div className="mt-rm-col in" style={{ left: g.zone.x, top: g.zone.y, width: g.zone.w, height: g.zone.h }}><span className="ch">{t('rigMap.inside')}</span></div>
      {g.side ? <div className="mt-rm-col side" style={{ left: g.side.x, top: g.side.y - 30, width: g.side.w, height: g.side.h + 30 }}><span className="ch">{t('rigMap.side')}</span></div> : null}
      {g.human ? <div className="mt-rm-human" style={{ left: g.human.x, top: g.human.y, width: g.human.w, height: g.human.h }} data-role="rm-human"><b>{t('rigMap.human')}</b><span className="det">{t('rigMap.humanSub')}: {(m.intake || []).map((i) => i.item).join(', ')}</span></div> : null}
      <div className={`mt-rm-builder st-${stOf(bl && bl.state)}`} style={{ left: g.builder.x, top: g.builder.y, width: g.builder.w, height: g.builder.h }} data-role="rm-builder" role="button" tabIndex={0}
        onClick={() => bl && onTag(bl.name)} onDoubleClick={() => bl && onGo(bl.sessionId)}>
        <b>{t('rigMap.builder')}</b>
        <span className="rs"><i />{bl ? STATE_LABEL[bl.state] || bl.state : t('rigMap.builderNone')}</span>
        {nRaise ? <span className="warn" data-role="rm-raises">{t('rigMap.raises', { n: nRaise })}</span> : null}
      </div>
      <svg className="mt-rm-lines" width={g.w} height={g.h} aria-hidden="true">
        <defs>
          <marker id={`rm-tip-${m.workspace.replace(/[^A-Za-z0-9]/g, '')}`} className="mt-rm-tip" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 L10 5 L0 10 z" /></marker>
        </defs>
        {g.lines.map((l) => <path key={l.id} className={`mt-rm-line k-${l.kind}${l.hot ? ' hot' : ''}`} data-role="rm-line" data-kind={l.kind} data-from={l.from} data-to={l.to || ''} d={l.d} markerEnd={l.kind === 'fix' ? undefined : `url(#rm-tip-${m.workspace.replace(/[^A-Za-z0-9]/g, '')})`} />)}
        {g.lines.filter((l) => l.openEnd).map((l) => <circle key={'o' + l.id} className="mt-rm-open" data-role="rm-open-return" cx={l.openEnd[0]} cy={l.openEnd[1]} r={7} />)}
      </svg>
      {g.lines.map((l) => {
        const f = l.flow != null ? flows[l.flow] : null;
        const text = l.kind === 'fix' ? t('rigMap.fix') : l.kind === 'raise' ? t('rigMap.raises', { n: l.n }) : flowText(f, t);
        return <span key={'l' + l.id} className={`mt-rm-lab det k-${l.kind}${l.hot ? ' hot' : ''}`} data-role="rm-line-label" style={{ left: l.label.x, top: l.label.y, maxWidth: l.label.w }} title={f ? flowTip(f, t) : undefined}>{text}</span>;
      })}
      {[...g.roles.entries()].map(([n, b]) => <RoleCard key={n} r={byName.get(n)} b={b} lv={liveRole(byName.get(n), sid.get(n), live)} t={t} onTag={onTag} onGo={onGo} />)}
      {g.sectors.map((s) => <Sector key={s.role + s.path} s={s} t={t} />)}
      {g.tools.map((x) => <Tool key={x.role + x.name} x={x} t={t} now={now} />)}
      <div className="mt-rm-cycle det" style={{ left: g.cycle.x, top: g.cycle.y, width: g.cycle.w, height: g.cycle.h }} data-role="rm-cycle">
        <b>{t('rigMap.cycleBand', { n: m.head && m.head.cycle != null ? m.head.cycle : '-' })}</b>
        {(m.cycleItems || []).length ? m.cycleItems.map((c) => <span key={c.k} className={`ci w-${c.what}`} data-role="rm-cycle-item" title={c.reason || ''}>{CIRCLED[c.k - 1] || c.k + '.'} {c.id} {t(`rigMap.what.${c.what}`)}{c.reason ? <span className="dim"> "{clip(c.reason, 28)}"</span> : null}</span>) : <span className="dim">{t('rigMap.cycleEmpty')}</span>}
        {m.cycleMore ? <span className="dim">{t('rigMap.cycleMore', { n: m.cycleMore })}</span> : null}
      </div>
      {g.entry ? (
        <div className={`mt-rm-entry det${entryOpen ? ' open' : ''}`} style={{ left: g.entry.x, top: g.entry.y, width: g.entry.w, height: g.entry.h }} data-role="rm-entry">
          <b>{t('rigMap.entry')}</b>
          <span className="et">{entryOpen ? m.entry.text : clip(m.entry.text.replace(/^#+\s*/, ''), 180)}</span>
          <button type="button" className="mt-rm-entry-btn" data-action="rm-entry" onClick={() => onEntry(m.workspace)}>{t(entryOpen ? 'rigMap.entryClose' : 'rigMap.entryOpen')}</button>
        </div>
      ) : null}
    </div>
  );
});
export { BUILDER_ROLE };
