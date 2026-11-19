// P251·P253: 세션 맵의 rig 구조 지도 한 장(docs research rig3-map.md 8절). 배치는 lib/rig-map.js mapLayout(순수), 자료는 판 API rig.map(store rigMaps).
// 위에서 아래로: 머리 띠(rig 이름, 켜짐·판, 사이클·다음 박자, 빌더, 사람이 볼 것, rig 판 단추) / 역할 카드 한 줄과 쌍마다 선 하나 / 사이클 띠 / 변경 기록 띠.
// 사람과 빌더에게는 선을 긋지 않는다: 사람 입력은 받는 역할 카드의 "입력" 줄, 빌더는 머리 띠 칸, 올림은 올린 역할 카드의 "올림" 줄.
// 머리 띠를 누르면 접히고 펴진다(MissionLineage가 기억). 역할 카드를 누르면 명령줄 @태그, 두 번 누르면 판의 그 세션. 조작은 rig 판에 둔다.
// 멀리서(.lv-far)는 테두리, 역할 이름, 상태 색만 남긴다(styles.css 끝 .mt-rm2).
import { memo } from 'react';
import { STATE_LABEL, agoText } from './lib/labels.js';
import { untilText, periodText, rowText, BUILDER_ROLE } from './lib/rig-map.js';
import { kindOf } from './lib/kinds.js';

const ST = { working: 'working', waiting: 'needs', trust_wait: 'needs', error: 'error', ready: 'ready', sleeping: 'sleeping', exited: 'exited' };
const stOf = (s) => (!s ? 'none' : ST[s] || 'ready');
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const Clock = () => <svg className="mt-rm2-clock" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" /><path d="M8 4.6V8l2.4 1.6" /></svg>;
const clip = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1) + '…' : x; };
const launcherName = (l) => { if (!l) return ''; const k = kindOf(l); return k && k.id === l ? k.label : l; };

// 역할 세션의 지금 값(창의 세션 값이 이긴다) → { sessionId, name, state, task }
export function liveRole(r, sid, live) {
  const cur = sid && live ? live.get(sid) : null;
  const s = r && r.session;
  if (!cur && !s) return null;
  const state = cur ? cur.state : s.asleep ? 'sleeping' : s.state;
  return { sessionId: sid || s.sessionId, name: cur ? cur.name : s.name, state, task: cur && cur.state === 'working' ? cur.lastPrompt : null };
}

function Head({ m, g, t, now, bl, folded, onFold, onPanel }) {
  const h = m.head || {};
  const u = untilText(h.nextAt, now);
  const nRaise = (m.raises || []).length;
  const st = m.status === 'on' ? t('rigMap2.headOn', { n: m.versionN ?? '-' }) : m.status === 'off' ? t('rigMap2.headOff', { n: m.versionN ?? '-' }) : t('rigMap2.headInvalid');
  return (
    <div className="mt-rm2-head" style={{ width: g.w, height: g.head.h }} data-role="rm-head" data-folded={folded ? '1' : '0'} role="button" tabIndex={0} title={t('rigMap2.foldTip')}
      onClick={onFold} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFold(); } }}>
      <span className="chev" aria-hidden="true">{folded ? '▸' : '▾'}</span>
      <b className="nm" data-role="rm-name">{m.name || t('rigMap.title')}</b>
      <span className={`chip st ${m.status}`} data-role="rm-status"><i />{st}</span>
      {h.cycle != null ? <span className="chip" data-role="rm-cycle-chip"><Clock />{u ? t('rigMap2.headNext', { n: h.cycle, when: t(`rigMap.unit.${u.unit}`, { n: u.n }) }) : t('rigMap2.headCycle', { n: h.cycle })}</span> : null}
      <span className={`chip bl st-${stOf(bl && bl.state)}`} data-role="rm-builder"><i />{bl ? t('rigMap2.builder', { state: STATE_LABEL[bl.state] || bl.state }) : t('rigMap2.builderNone')}{nRaise ? <b className="warn" data-role="rm-raises"> · {t('rigMap2.raises', { n: nRaise })}</b> : null}</span>
      <span className={`chip${h.attention ? ' warn' : ''}`} data-role="rm-attention">{t('rigMap2.attention', { n: h.attention || 0 })}</span>
      {h.stalled ? <span className="chip bad" data-role="rm-stalled">{t('rigMap.stalled', { n: h.stalled })}</span> : null}
      <button type="button" className="panel" data-action="rm-panel" title={t('rigMap2.panelTip')} onClick={(e) => { e.stopPropagation(); onPanel(); }}>{t('rigMap2.panel')}</button>
    </div>
  );
}

function toolText(x, t) {
  const per = x.every ? periodText(x.every, null, t) : t('rigMap2.toolOnCall');
  const st = x.running ? t('rigMap2.toolRunning') : !x.last ? (x.every ? t('rigMap.toolNever') : null) : x.last.status === 'done' && !x.alarms ? t('rigMap2.toolOk') : t('rigMap2.toolFail');
  return [per, st].filter(Boolean).join(' · ');
}

function Line({ l, t, nRaise }) {
  const lab = <span className="lk">{t(`rigMap2.row.${l.k}`)}</span>;
  switch (l.k) {
    case 'session': return <span className="ln" data-row="session">{lab}<span className="lv">{[launcherName(l.launcher), l.model].filter(Boolean).join(' · ')}</span></span>;
    case 'beat': { const p = periodText(l.every, l.at, t); return <span className="ln" data-row="beat" data-role="rm-beat">{lab}<span className="lv"><Clock />{l.cycle ? t('rigMap2.beatCycle', { period: p }) : p}</span></span>; }
    case 'owns': return <span className="ln" data-row="owns">{lab}<span className="lv">{l.paths.map((p) => <code key={p} data-role="rm-sector">{p}</code>)}</span></span>;
    case 'recent': return <span className="ln" data-row="recent">{lab}<span className="lv">{l.items.map((it) => <span key={it.id} className={`it is-${it.state}`} data-role="rm-item" data-id={it.id} data-state={it.state} title={it.reason || ''}>{it.id} <i>{t(`rigMap.state.${it.state}`)}</i></span>)}{l.more ? <span className="dim">{t('rigMap.more', { n: l.more })}</span> : null}</span></span>;
    case 'tool': { const x = l.tool; const bad = x.last && (x.last.status !== 'done' || x.alarms); return <span className="ln" data-row="tool" data-role="rm-tool" data-name={x.name} title={x.last ? t('rigMap.toolLast', { ago: agoText(x.last.at) }) : ''}>{lab}<span className="lv"><code>{x.name}</code> · <span className={bad ? 'bad' : ''}>{toolText(x, t)}</span>{x.alarms ? <span className="bad"> · {t('rigMap.alarms', { n: x.alarms })}</span> : null}</span></span>; }
    case 'intake': return <span className="ln" data-row="intake" data-role="rm-intake">{lab}<span className="lv">{t('rigMap2.intake', { items: l.items.join(', ') })}</span></span>;
    case 'counts': return <span className="ln" data-row="counts">{lab}<span className="lv">{[l.received ? t('rigMap.received', { n: l.received }) : null, l.unanswered ? <span key="u" className="warn">{t('rigMap.unanswered', { n: l.unanswered })}</span> : null, l.material ? t('rigMap.material', { n: l.material }) : null, l.foreign ? <span key="f" className="bad">{t('rigMap.foreign', { n: l.foreign })}</span> : null].filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x]))}</span></span>;
    case 'raise': return <span className="ln" data-row="raise" data-role="rm-role-raise">{lab}<span className="lv warn">{t('rigMap2.raiseWait', { n: l.n || nRaise })}</span></span>;
    default: return null;
  }
}

function RoleCard({ r, b, lv, t, onTag, onGo }) {
  const st = lv ? lv.state : r.gaveUp ? 'gaveUp' : null;
  const cls = `mt-rm2-role st-${stOf(st)}${st === 'working' ? ' hot' : ''}`;
  const stText = !lv ? (r.gaveUp ? t('rigMap.gaveUp') : t('rigMap.noSession')) : STATE_LABEL[st] || st;
  return (
    <div className={cls} style={{ left: b.x, top: b.y, width: b.w, height: b.h }} data-role="rm-role" data-name={r.name} data-state={st || 'none'} data-lines={b.lines.length} role="button" tabIndex={0}
      title={lv && lv.task ? clip(lv.task, 200) : undefined}
      onClick={() => lv && onTag(lv.name)} onDoubleClick={() => lv && onGo(lv.sessionId)} onKeyDown={(e) => { if (e.key === 'Enter' && lv) onGo(lv.sessionId); }}>
      <span className="r1"><b className="rn" data-role="rm-role-name">{r.name}</b>{r.docN != null ? <span className="doc">{t('rigMap.docN', { n: r.docN })}</span> : null}<span className="rs"><i />{stText}</span></span>
      {b.lines.map((l, i) => <Line key={l.k + i} l={l} t={t} />)}
    </div>
  );
}

// 선의 마우스 풍선: 그 쌍의 길로 마지막에 오간 항목(번호, 상태, 때, 반려면 까닭)
const pairTip = (p, flows, t) => {
  const last = flows.filter((f) => p.rows.some((r) => r.item === f.item)).flatMap((f) => f.last || []).sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 4);
  return last.length ? last.map((x) => `${x.id} · ${t(`rigMap.state.${x.state}`)} · ${agoText(x.t)}${x.reason ? ` · "${clip(x.reason, 80)}"` : ''}`).join('\n') : t('rigMap.pathNone');
};

export const RigMap = memo(function RigMap({ m, g, x, y, scale = 1, live, sid, t, now, onTag, onGo, onPanel, onFold, onEntry, entryOpen }) {
  if (!m || !g) return null;
  const bl = m.builder ? liveRole({ session: m.builder }, m.builder.sessionId, live) : null;
  const head = <Head m={m} g={g} t={t} now={now} bl={bl} folded={g.folded} onFold={() => onFold(m.workspace, !g.folded)} onPanel={() => onPanel(m.workspace)} />;
  if (g.folded) {
    return <div className={`mt-rm2 folded${g.dim ? ' dim' : ''}`} style={{ left: x, top: y, width: g.w, height: g.h, transform: scale !== 1 ? `scale(${scale})` : undefined }} data-role="rig-map" data-ws={m.workspace} data-status={m.status} data-folded="1">{head}</div>;
  }
  const flows = m.flows || [];
  const byName = new Map((m.roles || []).map((r) => [r.name, r]));
  const tip = `rm2-tip-${String(m.workspace).replace(/[^A-Za-z0-9]/g, '')}`;
  return (
    <div className={`mt-rm2${g.dim ? ' dim' : ''}`} style={{ left: x, top: y, width: g.w, height: g.h, transform: scale !== 1 ? `scale(${scale})` : undefined }} data-role="rig-map" data-ws={m.workspace} data-status={m.status} data-folded="0">
      {head}
      <svg className="mt-rm2-lines" width={g.w} height={g.h} aria-hidden="true">
        <defs><marker id={tip} className="mt-rm2-tip" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" /></marker></defs>
        {g.pairs.map((p) => <path key={p.key} className={`mt-rm2-line${p.straight ? '' : ' lane'}${p.rows.some((r) => r.waiting) ? ' hot' : ''}`} data-role="rm-line" data-a={p.a} data-b={p.b} data-kind={p.straight ? 'straight' : 'lane'} data-tip-a={p.tipA ? '1' : '0'} data-tip-b={p.tipB ? '1' : '0'} d={p.d} markerStart={p.tipA ? `url(#${tip})` : undefined} markerEnd={p.tipB ? `url(#${tip})` : undefined} />)}
      </svg>
      {g.pairs.map((p) => (
        <span key={'l' + p.key} className={`mt-rm2-lab${p.rows.some((r) => r.waiting) ? ' hot' : ''}`} data-role="rm-line-label" data-a={p.a} data-b={p.b} style={{ left: p.label.x, top: p.label.y, width: p.label.w, height: p.label.h }} title={pairTip(p, flows, t)}>
          {p.rows.map((r) => <span key={r.dir + r.item} className="lr" data-role="rm-label-row" data-dir={r.dir} data-open={r.open ? '1' : '0'}>{r.open ? <i className="open" data-role="rm-open-return" title={t('rigMap2.openReturn')} /> : null}{rowText(r)}</span>)}
        </span>
      ))}
      {g.order.map((n) => <RoleCard key={n} r={byName.get(n)} b={g.roles.get(n)} lv={liveRole(byName.get(n), sid.get(n), live)} t={t} onTag={onTag} onGo={onGo} />)}
      {!g.order.length ? <span className="mt-rm2-none" style={{ left: 32, top: g.head.h + 24 }}>{t('rigMap2.noRoles')}</span> : null}
      <div className="mt-rm2-band det" style={{ left: g.cycle.x, top: g.cycle.y, width: g.cycle.w, height: g.cycle.h }} data-role="rm-cycle">
        <b>{t('rigMap.cycleBand', { n: m.head && m.head.cycle != null ? m.head.cycle : '-' })}</b>
        <span className="bt">{(m.cycleItems || []).length ? m.cycleItems.map((c) => <span key={c.k} className={`ci w-${c.what}`} data-role="rm-cycle-item" title={c.reason || ''}>{CIRCLED[c.k - 1] || c.k + '.'} {c.id} {t(`rigMap.what.${c.what}`)}{c.reason ? <span className="dim"> "{clip(c.reason, 28)}"</span> : null}</span>) : <span className="dim">{t('rigMap.cycleEmpty')}</span>}
        {m.cycleMore ? <span className="dim">{t('rigMap.cycleMore', { n: m.cycleMore })}</span> : null}</span>
      </div>
      <div className={`mt-rm2-band entry det${entryOpen && m.entry ? ' open' : ''}`} style={{ left: g.entry.x, top: g.entry.y, width: g.entry.w, height: g.entry.h }} data-role="rm-entry">
        <b>{t('rigMap.entry')}</b>
        <span className="bt">{m.entry ? (entryOpen ? m.entry.text : clip(m.entry.text.replace(/^#+\s*/, ''), 220)) : <span className="dim">{t('rigMap2.entryEmpty')}</span>}</span>
        {m.entry ? <button type="button" className="mt-rm2-entry-btn" data-action="rm-entry" onClick={() => onEntry(m.workspace)}>{t(entryOpen ? 'rigMap.entryClose' : 'rigMap.entryOpen')}</button> : null}
      </div>
    </div>
  );
});
export { BUILDER_ROLE };
