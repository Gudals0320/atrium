// P221: rig 2의 R2 고리(docs research rig2-design.md 2절 "고리", 2.1 "판이 하는 일"의 고리 줄, 3절 loops 칸, 4절, 5절, 11.3·11.4).
// - 정의 칸 loops: { "<이름>": { kind: work | improve, trigger: { request: <입구 자리> } | { every: "7d", notify?, at? } | { event, … }, entry, flow, holds, produces, approve, task? } }.
//   loops의 flow 줄은 고리 차례대로 이어 붙여 지금 흐름(validateFlow)으로 검사하고 줄 번호를 그대로 쓴다(줄마다 어느 고리인지 lines에 적는다).
//   event 계기, produces(R5), approve(R6), at(R7), steps는 받기만 한다(경고). task는 every 회의 첫 일 글(P223: rig2-design 11.6의 4로 정식 칸. request 고리에는 쓰지 않는다).
// - loops가 없는 정의(v1, loops 없는 v2)는 그대로 돈다: seats + flow는 이름이 work인 작업 고리 하나(implicit, 건은 지금처럼 자리 세션의 첫 맡기기가 연다),
//   cycles[i]는 개선 고리 improve(둘째부터 improve-<i+1>)의 every 계기(시각은 그대로 rig_cycles, 도는 길은 rig-flow cycleTick).
// - 회 = 건(rig_cases, kind 이름 그대로). 회는 고리(loop)와 이름(name)을 쥔다. request 계기: 사람이나 rig 밖 세션이 입구 자리(keep)에 보낸 글이
//   새 회를 연다(입구 세션이 주인, 그 글이 입구 자리의 일). 입구 세션이 그 고리의 회를 쥐고 있으면 글은 이어지는 지시다.
//   every 계기: 판이 주기를 지켜 입구 자리에 새 회의 일(improve는 장부 요약, work는 task). 고리에 끝나지 않은 회가 있으면 건너뛴다(loop_skip running).
// - 멈추기·잇기(manager 자리와 사람): 고리를 멈추면 새 회(계기), 새 넘김, 자리 줄 띄우기를 막는다(멈춘 동안 온 요청은 줄에 서고 잇기에 회를 연다).
//   회를 멈추면 그 회의 새 넘김만 막는다. 일하는 세션은 끊지 않는다. 멈춘 동안 done이 만든 넘김은 회에 붙잡아 두었다가 잇기에 넘긴다.
//   P223(11.6의 6): 멈춘 동안 온 요청은 실패한 전달이 아니라 전달 대기열에 붙잡는다(까닭 loop_paused, delivery.mjs park). 잇기가 그 전달로 회의 일을 넣는다.
// - P223(11.6의 3) 회 저절로 닫기: 고리(loops에 쓴 고리)의 회는 입구 자리의 done이 닫는 것에 더해, 입구 세션(회의 주인)이 쉼 기준(잠재우기와 같은 세션 쉼 시간,
//   기본 30분) 동안 쉬고 그 회에 주인 밖의 열린 일·붙잡은 넘김이 없으면 판이 닫는다(case_done, value auto). 주인의 열린 일은 함께 닫는다(done auto).
//   그 전에 온 사람 글은 같은 회의 이어지는 지시이고(주인이 회를 쥐고 있다), 닫힌 뒤 온 글은 새 회를 연다. 멈춘 회·고리와 막힌 회는 닫지 않는다.
//   종료 세션으로 막힌 회(blocked, P216)와 글로 가른다: "멈춤(사람·관리자가 멈춤, 잇기: atrium rig resume)" / "막힘(세션 종료, atrium rig retry)".
import crypto from 'node:crypto';
import { shownName } from './session-label.mjs';
import { rigEvent } from './rig-ledger.mjs';
import { HUMAN_FROM } from './rig-templates.mjs';
import { SEAT_SPAWN } from './rig-amp.mjs';
import { idleSince } from './sleep.mjs'; // P223: 회 저절로 닫기의 쉼(잠재우기와 같은 기준)
import { deriveState } from './state.mjs';

const newUnitId = () => 'u' + crypto.randomBytes(3).toString('hex');
function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
export const LOOP_KINDS = ['work', 'improve'];
export const LOOP_NAME_RE = /^[a-z][a-z0-9_-]{0,23}$/;
export const LOOP_APPROVES = ['human', 'manager', 'none'];
export const LOOP_EVENTS = ['doc_changed', 'artifact_filed', 'ledger_count'];
export const LOOP_ATS = ['session-start'];
export const LOOP_STATES = ['running', 'waiting', 'paused', 'idle']; // 돎 · 기다림(계기를 기다림) · 멈춤 · 쉼(계기가 걸릴 수 없음: 입구 세션 없음, event 계기)
export const IMPLICIT_WORK = 'work';
export const RUN_NAME_MAX = 40;
export const TASK_MAX = 4000; // P223: loops.<고리>.task(every 회의 첫 일 글) 길이
export const NAME_MAX = 80;
export const RUN_IDLE_MS = 30 * 60000; // P223: 회 저절로 닫기의 쉼 기본(세션 잠재우기 sessionSleepAfterMin의 기본과 같다)
const BUSY_STATES = new Set(['working', 'waiting', 'starting', 'trust_wait']); // 쉬는 것이 아니다(일함·사람의 답을 기다림·뜨는 중)
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
const parseSpan = (v) => { if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.floor(v) : null; const m = /^\s*(\d+(?:\.\d+)?)\s*([smhdw])\s*$/.exec(String(v || '')); return m ? Math.floor(Number(m[1]) * UNIT_MS[m[2]]) : null; };
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const strList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x);
export const implicitCycleLoop = (i) => (i === 0 ? 'improve' : `improve-${i + 1}`);
const LIVE = new Set(['open', 'blocked', 'waiting_owner']);
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// ---------- 회 이름(옛 F1-1): 첫 요청의 첫 줄에서 규칙으로(LLM 없이) ----------
// 판 알림 줄([Atrium …]), 빈 줄, 구분선·코드 울타리를 건너뛰고, 머리 꾸밈(#, >, -, *, 1., 맨 앞 @이름, 따옴표, 강조)을 떼고, 공백을 하나로,
// 끝 문장부호를 떼고, 40자를 넘으면 낱말 경계(절반 넘는 곳)에서 자르고 …를 붙인다. 뽑을 것이 없으면 null
export function runNameOf(text, max = RUN_NAME_MAX) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  for (const raw of lines) {
    let l = raw.trim();
    if (!l || /^\[Atrium/.test(l) || /^-{3,}/.test(l) || /^\x60{3}/.test(l)) continue;
    l = l.replace(/^(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)+/, '').replace(/^(?:@[A-Za-z0-9_-]+[\s,:]*)+/, '').replace(/[*_\x60]{1,3}/g, '').replace(/^["'“‘「『]+|["'”’」』]+$/g, '').replace(/\s+/g, ' ').trim();
    l = l.replace(/[.:;,!?。]+$/, '').trim();
    if (!l) continue;
    if (l.length <= max) return l;
    const cut = l.slice(0, max);
    const sp = cut.lastIndexOf(' ');
    return (sp >= max * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,.:;]+$/, '') + '…';
  }
  return null;
}
// 회 이름 고치기의 글 검사 → 이름 | 던짐
export function cleanRunName(v) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (!s) throw apiError('bad_request', '회 이름을 준다: atrium rig name <회> "<이름>"');
  if (s.length > NAME_MAX) throw apiError('bad_request', `회 이름은 ${NAME_MAX}자까지다(${s.length}자)`);
  if (/^\[Atrium/.test(s)) throw apiError('bad_request', '회 이름은 보드 알림 머리로 시작할 수 없다');
  return s;
}

// ---------- 정의 검사 ----------
// 흐름 검사 앞: loops의 flow 줄을 한 목록으로 펴고 줄마다 어느 고리의 몇째 줄인지 → { ok, raw(flow를 편 사본), lineOf: [{ loop, j }] } | { ok: false, reason }
export function spreadLoops(raw) {
  const bad = (reason) => ({ ok: false, reason });
  if (raw.loops == null) return { ok: true, raw, lineOf: null };
  if (!raw.loops || typeof raw.loops !== 'object' || Array.isArray(raw.loops)) return bad('loops는 { "<고리>": { "kind", "trigger", "entry", "flow" } } 객체다');
  if ((raw.version == null ? 1 : raw.version) !== 2) return bad('loops는 rig 2 칸이다. 정의 맨 위에 "version": 2를 둔다');
  if (!Object.keys(raw.loops).length) return bad('loops에 고리가 없다');
  if (raw.flow != null) return bad('loops가 있으면 flow 줄은 고리 안(loops.<고리>.flow)에 둔다. 맨 위 flow는 loops가 없는 정의의 작업 고리 하나다');
  if (raw.cycles != null) return bad('loops가 있으면 cycles 대신 개선 고리(kind "improve", trigger { "every": "7d" })를 쓴다');
  if (raw.seats == null) return bad('loops는 seats(자리)와 함께 쓴다');
  const flow = []; const lineOf = [];
  for (const [name, x] of Object.entries(raw.loops)) {
    if (!LOOP_NAME_RE.test(name)) return bad(`loops.${name}: 고리 이름은 영문 소문자로 시작하고 소문자·숫자·_·-로 24자까지다`);
    if (!x || typeof x !== 'object' || Array.isArray(x)) return bad(`loops.${name}는 객체여야 한다({ "kind", "trigger", "entry" })`);
    if (x.flow == null) continue;
    if (!Array.isArray(x.flow)) return bad(`loops.${name}.flow는 줄 배열이다`);
    x.flow.forEach((l, j) => { flow.push(l); lineOf.push({ loop: name, j }); });
  }
  return { ok: true, raw: { ...raw, flow }, lineOf };
}
// 흐름 검사의 까닭에 든 flow[i]를 loops.<고리>.flow[j]로
export const loopFlowReason = (reason, lineOf) => (lineOf ? String(reason).replace(/flow\[(\d+)\]/g, (m, i) => (lineOf[Number(i)] ? `loops.${lineOf[Number(i)].loop}.flow[${lineOf[Number(i)].j}]` : m)) : reason);

// 흐름·주기·문서 검사 뒤 → { ok, loops: { <이름>: loop }, warnings } | { ok: false, reason }
//   loop: { name, kind, implicit, trigger: { type: request|every|event, seat?, every?, everyMs?, notify?, at?, event? }, entry, lines: [줄 번호], holds, reads, produces, approve, task, cycle? }
export function finishLoops(raw, fl, cycles, docs, lineOf, { cycleMinMs = 3600000 } = {}) {
  const bad = (reason) => ({ ok: false, reason });
  const warnings = [];
  const seats = fl.seats || {};
  const known = (n) => has(seats, n);
  const docNames = (v, at, role = null) => {
    if (v == null) return { ok: true, list: [] };
    if (!strList(v)) return { ok: false, reason: `${at}는 문서 이름 배열이다` };
    const miss = v.filter((n) => !has(docs, n));
    if (miss.length) return { ok: false, reason: `${at}에 docs에 없는 문서가 있다: ${miss.join(', ')}. 문서: ${docs ? Object.keys(docs).join(', ') || '(없음)' : '(없음)'}` };
    if (role) { const wrong = v.filter((n) => docs[n].role !== role); if (wrong.length) return { ok: false, reason: `${at}는 role "${role}" 문서를 가리킨다: ${wrong.map((n) => `${n}(${docs[n].role})`).join(', ')}` }; }
    return { ok: true, list: [...new Set(v)] };
  };
  const loops = {};
  if (raw.loops == null) {
    // v1과 loops 없는 v2(4절): seats + flow = 작업 고리 work, cycles[i] = 개선 고리 improve(-n)
    if (fl.seats) {
      const names = Object.keys(seats);
      const a = (fl.flow || []).find((l) => l.on === 'assign');
      const entry = fl.manager || (a ? a.from : names[0]);
      loops[IMPLICIT_WORK] = { name: IMPLICIT_WORK, kind: 'work', implicit: true, trigger: { type: 'request', seat: entry }, entry, lines: (fl.flow || []).map((l) => l.index), holds: [], reads: [], produces: [], approve: null, task: null };
    }
    for (const cy of cycles || []) {
      const name = implicitCycleLoop(cy.index);
      loops[name] = { name, kind: 'improve', implicit: true, trigger: { type: 'every', every: cy.every, everyMs: cy.everyMs, notify: null, at: null }, entry: cy.to, lines: [], holds: [], reads: [], produces: [], approve: null, task: null, cycle: cy.index };
    }
    for (const d of Object.values(docs || {})) {
      if (d.owner && has(loops, d.owner)) loops[d.owner].holds.push(d.name);
      else if (d.owner) warnings.push(`docs.${d.name}.owner(${d.owner})는 고리 이름이다. 이 정의에는 그 고리가 없다(loops가 없으면 고리는 ${Object.keys(loops).join(', ') || '없음'})`);
    }
    return { ok: true, loops, warnings };
  }
  const requestEntry = new Map();
  for (const [name, x] of Object.entries(raw.loops)) {
    const at = `loops.${name}`;
    if (!LOOP_KINDS.includes(x.kind)) return bad(`${at}.kind는 ${LOOP_KINDS.join(' 또는 ')}다(작업 고리 work: 요청을 받아 일을 한다, 개선 고리 improve: 장부를 읽고 고친다): ${JSON.stringify(x.kind)}`);
    const t = x.trigger;
    if (!t || typeof t !== 'object' || Array.isArray(t)) return bad(`${at}.trigger는 { "request": "<입구 자리>" } 또는 { "every": "7d" }다`);
    const kinds = ['request', 'every', 'event'].filter((k) => t[k] != null);
    if (kinds.length !== 1) return bad(`${at}.trigger에는 request·every·event 가운데 하나만 둔다`);
    let trigger;
    if (t.request != null) {
      if (typeof t.request !== 'string' || !known(t.request)) return bad(`${at}.trigger.request가 없는 자리를 가리킨다: ${t.request}. 자리: ${Object.keys(seats).join(', ')}`);
      trigger = { type: 'request', seat: t.request };
    } else if (t.every != null) {
      const everyMs = parseSpan(t.every);
      if (!everyMs) return bad(`${at}.trigger.every는 "7d", "1d", "6h" 꼴의 주기다: ${JSON.stringify(t.every)}`);
      if (everyMs < cycleMinMs) return bad(`${at}.trigger.every는 ${Math.round(cycleMinMs / 60000)}분 이상이다: ${t.every}`);
      let notify = t.notify == null ? null : t.notify;
      if (notify === 'manager') notify = fl.manager || null;
      if (notify != null && (typeof notify !== 'string' || !known(notify))) return bad(`${at}.trigger.notify가 없는 자리를 가리킨다: ${t.notify}`);
      if (t.at != null) { if (!LOOP_ATS.includes(t.at)) return bad(`${at}.trigger.at은 ${LOOP_ATS.join(', ')}다: ${JSON.stringify(t.at)}`); warnings.push(`${at}.trigger.at(${t.at})은 R7(새 훅 길목) 전이라 받기만 한다. 보드는 주기만 지킨다`); }
      trigger = { type: 'every', every: String(t.every), everyMs, notify, at: t.at || null };
    } else {
      if (!LOOP_EVENTS.includes(t.event)) return bad(`${at}.trigger.event는 ${LOOP_EVENTS.join(', ')} 가운데 하나다: ${JSON.stringify(t.event)}`);
      warnings.push(`${at}.trigger.event는 R2 뒤의 계기라 받기만 한다. 이 고리는 회를 열지 않는다`);
      trigger = { type: 'event', event: t.event };
    }
    let entry = x.entry == null ? (trigger.type === 'request' ? trigger.seat : null) : x.entry;
    if (entry == null) return bad(`${at}.entry(입구 자리)가 필요하다: 계기가 걸리면 이 자리에 회의 첫 일이 간다`);
    if (typeof entry !== 'string' || !known(entry)) return bad(`${at}.entry가 없는 자리를 가리킨다: ${entry}. 자리: ${Object.keys(seats).join(', ')}`);
    if (trigger.type === 'request' && trigger.seat !== entry) return bad(`${at}: trigger.request(${trigger.seat})와 entry(${entry})가 다르다. 요청은 입구 자리로 온다`);
    if (trigger.type === 'request') {
      if (seats[entry].session !== 'keep') return bad(`${at}: request 계기의 입구 자리(${entry})는 keep 자리다(사람과 rig 밖 세션이 그 자리의 세션에 요청을 보낸다)`);
      if (requestEntry.has(entry)) return bad(`${at}: 자리 ${entry}는 이미 request 고리 ${requestEntry.get(entry)}의 입구다. 한 자리는 request 고리 하나의 입구다(요청이 어느 고리의 회를 여는지 정해지게)`);
      requestEntry.set(entry, name);
    }
    const lines = (lineOf || []).map((o, i) => (o.loop === name ? i : -1)).filter((i) => i >= 0);
    const myFlow = (fl.flow || []).filter((l) => lines.includes(l.index));
    if (myFlow.length && !myFlow.some((l) => l.from === entry || l.to.includes(entry))) return bad(`${at}: 입구 자리 ${entry}가 이 고리의 flow 줄에 없다(입구에서 시작하거나 입구로 돌아오는 줄이 있어야 한다)`);
    const ho = docNames(x.holds, `${at}.holds`); if (!ho.ok) return bad(ho.reason);
    const rd = docNames(x.reads, `${at}.reads`); if (!rd.ok) return bad(rd.reason);
    const pr = docNames(x.produces, `${at}.produces`, 'sector'); if (!pr.ok) return bad(pr.reason);
    if (pr.list.length) warnings.push(`${at}.produces(${pr.list.join(', ')})는 R5(산출물 섹터) 전이라 받기만 한다`);
    if (x.approve != null) { if (!LOOP_APPROVES.includes(x.approve)) return bad(`${at}.approve는 ${LOOP_APPROVES.join(', ')} 가운데 하나다: ${JSON.stringify(x.approve)}`); warnings.push(`${at}.approve(${x.approve})는 R6(제안과 승인) 전이라 받기만 한다`); }
    if (x.steps != null) { if (!strList(x.steps)) return bad(`${at}.steps는 글 배열이다`); warnings.push(`${at}.steps는 받기만 한다(보드가 돌리지 않는다)`); }
    if (x.task != null && (typeof x.task !== 'string' || !x.task.trim())) return bad(`${at}.task는 글이다(every 회의 첫 일 글: 판이 회를 열 때 입구 자리에 보내는 일)`);
    if (x.task != null && x.task.length > TASK_MAX) return bad(`${at}.task는 ${TASK_MAX}자까지다(${x.task.length}자). 긴 지시는 자리의 guide나 정본 문서에 두고 task에서 가리킨다`);
    if (x.task != null && trigger.type !== 'every') warnings.push(`${at}.task는 every 고리의 회에만 쓴다(request 회의 일은 요청 글이다). 이 고리에서는 쓰이지 않는다`);
    if (x.task == null && trigger.type === 'every' && x.kind === 'work') warnings.push(`${at}: every 작업 고리에 task가 없다. 회마다 "안내(atrium guide)와 문서를 따르라"는 한 줄만 간다`);
    if (lines.length && x.kind === 'improve') warnings.push(`${at}: 개선 고리에 flow 줄이 있다. 보통 개선 고리는 입구 자리 하나가 장부를 읽고 고친다`);
    loops[name] = { name, kind: x.kind, implicit: false, trigger, entry, lines, holds: ho.list, reads: rd.list, produces: pr.list, approve: x.approve || null, task: x.task ? String(x.task) : null };
  }
  // 문서의 owner(쥔 고리)는 고리 이름이고, 그 고리의 holds에 든다. 한 문서를 두 고리가 쥐면 경고
  for (const d of Object.values(docs || {})) {
    if (d.owner && !has(loops, d.owner)) return bad(`docs.${d.name}.owner가 없는 고리를 가리킨다: ${d.owner}. 고리: ${Object.keys(loops).join(', ')}`);
    if (d.owner && !loops[d.owner].holds.includes(d.name)) loops[d.owner].holds.push(d.name);
    const holders = Object.values(loops).filter((l) => l.holds.includes(d.name)).map((l) => l.name);
    if (holders.length > 1) warnings.push(`docs.${d.name}를 고리 여럿(${holders.join(', ')})이 쥔다. 쥔 고리는 하나가 좋다(쓰는 쪽이 하나여야 바뀜이 누구 것인지 보인다)`);
  }
  // 어느 고리에도 들지 않은 자리
  const used = new Set(Object.values(loops).flatMap((l) => [l.entry, ...(fl.flow || []).filter((x) => l.lines.includes(x.index)).flatMap((x) => [x.from, ...x.to, ...(x.else ? [x.else] : [])])]));
  const loose = Object.keys(seats).filter((n) => !used.has(n) && n !== fl.manager);
  if (loose.length) warnings.push(`어느 고리에도 들지 않은 자리: ${loose.join(', ')}`);
  return { ok: true, loops, warnings };
}

const WHO = { human: '사람', manager: '관리자 자리', remote: '연결한 기기', owner: '회의 주인' };
export const whoText = (by) => WHO[by] || by || '?';
const IMPROVE_STALE_MS = 24 * 60 * 60 * 1000;
const utc = (t) => new Date(t).toISOString().replace('T', ' ').slice(0, 16);

// 판에 붙는 고리(RigFlow가 만든다). b: 백엔드, flow: RigFlow
export class RigLoops {
  constructor(b, flow) { this.b = b; this.flow = flow; this.skipNoted = new Set(); this.ticking = false; }
  store() { return this.b.store; }
  loopsOf(def) { return (def && def.loops) || {}; }
  changed(key) { this.flow.changed(key); if (this.b.api && this.b.api.broadcast) try { this.b.api.broadcast('rig.loops', { workspace: key }); } catch {} }

  // 새 회(건)가 드는 고리: 그 자리가 입구인 request 고리 → 그 자리가 흐름에 있는 작업 고리 → 입구가 그 자리인 작업 고리 → 첫 작업 고리
  loopForSeat(def, seat) {
    const L = Object.values(this.loopsOf(def));
    const flow = (def && def.flow) || [];
    const hit = L.find((l) => l.trigger.type === 'request' && l.entry === seat)
      || L.find((l) => l.kind === 'work' && flow.some((x) => l.lines.includes(x.index) && (x.from === seat || x.to.includes(seat))))
      || L.find((l) => l.kind === 'work' && l.entry === seat)
      || L.find((l) => l.kind === 'work');
    return hit ? hit.name : null;
  }
  // 그 자리가 입구인 request 고리(정의에 loops가 있을 때만. loops 없는 정의의 작업 고리는 지금처럼 자리의 첫 맡기기가 건을 연다)
  requestLoopOf(def, seat) { return Object.values(this.loopsOf(def)).find((l) => !l.implicit && l.trigger.type === 'request' && l.entry === seat) || null; }
  // 고리가 있는 정의면 그 회의 고리 줄만(loops 없는 정의는 줄 모두)
  linesOf(def, c, lines) {
    const L = this.loopsOf(def);
    const loop = c && c.loop && has(L, c.loop) ? L[c.loop] : null;
    return loop && !loop.implicit ? lines.filter((l) => loop.lines.includes(l.index)) : lines;
  }
  isPaused(key, loop) { if (!key || !loop || !this.store().getLoopRow) return false; const r = this.store().getLoopRow(key, loop); return !!(r && r.pausedAt); }
  // 회의 새 넘김을 막는가 → null | { by: run | loop, loop?, at, who }
  pauseOf(c) {
    if (!c) return null;
    if (c.pausedAt) return { by: 'run', at: c.pausedAt, who: c.pausedBy };
    const r = c.loop && this.store().getLoopRow ? this.store().getLoopRow(c.workspaceKey, c.loop) : null;
    return r && r.pausedAt ? { by: 'loop', loop: c.loop, at: r.pausedAt, who: r.pausedBy } : null;
  }
  // 멈춤 글(종료 세션으로 막힌 회 blocked와 가른다)
  pausedText(c, p = this.pauseOf(c)) {
    const nm = c.name ? ` "${c.name}"` : '';
    return p.by === 'loop'
      ? `회 ${c.id}${nm}의 고리 ${p.loop}가 멈춰 있다(${whoText(p.who)}가 멈춤, 막힌 것이 아니다). 일하는 세션은 그대로 돌고 새 넘김만 잇기를 기다린다. 잇기: atrium rig resume ${p.loop}`
      : `회 ${c.id}${nm}가 멈춰 있다(${whoText(p.who)}가 멈춤, 막힌 것이 아니다). 일하는 세션은 그대로 돌고 새 넘김만 잇기를 기다린다. 잇기: atrium rig resume ${c.id}`;
  }

  // ---------- request 계기 ----------
  // 사람(from { kind: human })이나 rig 밖 세션(from { kind: agent, session })이 자리 세션 s에 보낸 글. s가 request 고리의 입구가 아니면 null(지금 그대로).
  //   입구 세션이 그 고리의 끝나지 않은 회를 쥐고 있으면 null(이어지는 지시). 고리가 멈췄으면 요청을 줄에 세운다 → { held: true, loop, id }.
  //   그 밖은 새 회 → { made, caseId, loop, name }
  onRequest(s, from, text) {
    if (!s || !s.rigSeat || !this.b.rig) return null;
    const r = this.b.rig.active(s.workspaceKey);
    if (!r) return null;
    const loop = this.requestLoopOf(r.def, s.rigSeat);
    if (!loop) return null;
    const st = this.store();
    const tr = st.openTryOf(s.sessionId); const u = tr ? st.getUnit(tr.unitId) : null;
    const cur = u && u.caseId ? st.getCase(u.caseId) : null;
    if (cur && cur.loop === loop.name && LIVE.has(cur.state)) return null;
    const human = from.kind === 'human';
    if (this.isPaused(s.workspaceKey, loop.name)) {
      const id = st.insertLoopRequest({ workspaceKey: s.workspaceKey, loop: loop.name, sessionId: s.sessionId, fromKind: human ? 'human' : 'agent', fromSession: human ? null : from.session.sessionId, text });
      // P223: 전달 대기열에 붙잡는다(실패로 남기지 않는다). 잇기가 이 전달로 넣는다
      const d = this.b.queue && this.b.queue.park ? this.b.queue.park(s.sessionId, text, 'loop_paused', { origin: human ? { kind: 'human' } : { kind: 'agent', session: from.session.sessionId }, loop: loop.name, workspace: s.workspaceKey }) : null;
      if (d && st.setLoopRequestDelivery) st.setLoopRequestDelivery(id, d.deliveryId);
      rigEvent(this.b, { kind: 'loop_skip', ws: s.workspaceKey, seat: loop.entry, session: s.sessionId, value: 'paused', actor: human ? 'human' : 'agent', ref: d ? d.deliveryId : id, text: `${loop.name}: 고리가 멈춰 요청을 대기열에 붙잡았다(잇기에 회가 열린다)`, data: { loop: loop.name, trigger: 'request', held: id, ...(d ? { deliveryId: d.deliveryId } : {}) } });
      this.b.log && this.b.log(`rig loop ${s.workspaceKey} ${loop.name} paused: request held #${id}${d ? ` delivery ${d.deliveryId}` : ''}`);
      this.changed(s.workspaceKey);
      return { held: true, loop: loop.name, id, d };
    }
    return this.openRequest(r, loop, s, from, text);
  }
  openRequest(r, loop, s, from, text, { heldId = null, deliveryId = null } = {}) { // P223: deliveryId(붙잡았던 전달로 넣는다)
    const key = s.workspaceKey;
    const human = from.kind === 'human';
    const by = human ? { sessionId: HUMAN_FROM, name: 'human' } : from.session;
    const name = runNameOf(text) || `${loop.name} 회`;
    const c = this.flow.newCase(key, s, human ? 'human' : 'agent', { loop: loop.name, name, trigger: 'request' });
    const uid = newUnitId();
    rigEvent(this.b, { kind: 'loop_trigger', ws: key, caseId: c.id, unitId: uid, seat: loop.entry, toSeat: loop.entry, session: s.sessionId, value: 'request', actor: human ? 'human' : 'agent', text: `${loop.name}: ${human ? '사람' : `@${shownName(by) || by.name}`}의 요청`, data: { loop: loop.name, trigger: 'request', from: human ? 'human' : by.sessionId, ...(heldId ? { held: heldId } : {}) } });
    const made = this.flow.units().create(by, s, text, 'request', { id: uid, fromId: by.sessionId, caseId: c.id, seat: s.rigSeat, via: { by: by.sessionId, request: loop.name }, ...(deliveryId ? { deliveryId } : {}) });
    if (deliveryId && made.held && this.b.queue && this.b.queue.dropPark) this.b.queue.dropPark(deliveryId, 'cancelled', 'loop_unit_queued'); // P223: 일이 입구 세션의 줄에 섰다(차례가 오면 일 머리와 함께 간다)
    this.changed(key);
    return { made, caseId: c.id, loop: loop.name, name };
  }

  // ---------- every 계기 ----------
  async tick(now = Date.now()) {
    const b = this.b; const st = this.store();
    if (!b.rig || !st.workspaces || !st.getLoopRow || this.ticking) return [];
    this.ticking = true;
    const fired = [];
    try {
      for (const w of st.workspaces()) {
        const r = b.rig.active(w.key);
        if (!r) continue;
        for (const loop of Object.values(this.loopsOf(r.def))) {
          if (loop.implicit || loop.trigger.type !== 'every') continue;
          try { const x = await this.tickLoop(w.key, r, loop, now); if (x) fired.push(x); }
          catch (e) { b.log && b.log('rig loop tick error', e.stack); }
        }
        try { this.autoClose(w.key, r, now); } catch (e) { b.log && b.log('rig run auto close error', e.stack); } // P223
      }
    } finally { this.ticking = false; }
    return fired;
  }
  nextEvent(key, loop, nextAt, why) {
    rigEvent(this.b, { kind: 'loop_next', ws: key, seat: loop.entry, value: new Date(nextAt).toISOString(), actor: 'board', text: `${loop.name}: 다음 회 ${utc(nextAt)}(UTC)`, data: { loop: loop.name, nextAt, why } });
  }
  skipOnce(key, loop, mark, why, text) {
    if (this.skipNoted.has(mark)) return;
    this.skipNoted.add(mark);
    if (this.skipNoted.size > 500) this.skipNoted = new Set([...this.skipNoted].slice(-200));
    rigEvent(this.b, { kind: 'loop_skip', ws: key, seat: loop.entry, value: why, actor: 'board', text: `${loop.name}: ${text}`, data: { loop: loop.name, trigger: 'every' } });
    this.b.log && this.b.log(`rig loop ${key} ${loop.name} skipped: ${why}`);
  }
  async tickLoop(key, r, loop, now) {
    const st = this.store();
    const every = loop.trigger.everyMs;
    const sig = JSON.stringify([every, loop.entry, loop.kind]);
    const row = st.getLoopRow(key, loop.name);
    // 새 고리이거나 계기의 모양이 바뀌면 지금부터 한 주기 뒤
    if (!row || row.sig !== sig || row.nextAt == null) { const nextAt = now + every; st.setLoopRow(key, loop.name, { nextAt, sig }); this.nextEvent(key, loop, nextAt, 'armed'); this.changed(key); return null; }
    if (now < row.nextAt) return null;
    const mark = `${key}|${loop.name}|${row.nextAt}`;
    if (row.pausedAt) { this.skipOnce(key, loop, `${mark}|paused`, 'paused', '고리가 멈춰 있어 이번 회를 열지 않는다(잇기 뒤 한 번 돈다)'); return null; }
    const live = st.liveCasesOfLoop(key, loop.name);
    if (live.length) {
      this.skipOnce(key, loop, `${mark}|running`, 'running', `끝나지 않은 회(${live.map((c) => c.id).join(', ')})가 있어 이번 회를 건너뛴다`);
      const nextAt = now + every; st.setLoopRow(key, loop.name, { nextAt }); this.nextEvent(key, loop, nextAt, 'skipped'); this.changed(key);
      return null;
    }
    const out = await this.fireEvery(key, r, loop, { since: row.lastAt || row.nextAt - every, now, mark });
    if (!out) return null;
    const nextAt = now + every;
    st.setLoopRow(key, loop.name, { nextAt, lastAt: now });
    this.nextEvent(key, loop, nextAt, 'fired');
    return out;
  }
  // 한 회: 입구 자리에 새 회의 일. keep 자리에 앉은 세션이 없으면 열지 않는다(다음 시각 그대로, 한 번 기록). fresh 자리는 보드가 띄운다(위 세션 없음)
  async fireEvery(key, r, loop, { since, now, mark = null }) {
    const b = this.b; const st = this.store();
    const seat = r.def.seats[loop.entry];
    let t = null; let spawned = false;
    if (seat.session === 'keep') {
      t = this.flow.seatedOf(key, loop.entry).sort((a, c) => (a.createdAt || 0) - (c.createdAt || 0))[0] || null;
      if (!t) { this.skipOnce(key, loop, `${mark || key}|no_session`, 'no_session', `keep 자리 ${loop.entry}에 앉은 세션이 없어 회를 열지 않는다(앉으면 돈다)`); return null; }
    } else {
      try { t = await this.spawnEntry(key, r, loop.entry); spawned = true; }
      catch (e) { this.skipOnce(key, loop, `${mark || key}|spawn`, 'spawn_failed', `${loop.entry} 자리 세션을 띄우지 못했다: ${e.message}`); return null; }
    }
    const name = `${loop.name} ${dayOf(now)}`;
    const c = this.flow.newCase(key, t, 'cycle', { loop: loop.name, name, trigger: 'every' });
    const uid = newUnitId();
    rigEvent(b, { kind: 'loop_trigger', ws: key, caseId: c.id, unitId: uid, seat: loop.entry, toSeat: loop.entry, session: t.sessionId, value: 'every', actor: 'cycle', text: `${loop.name}: ${loop.trigger.every}마다`, data: { loop: loop.name, trigger: 'every', every: loop.trigger.every, since, until: now } });
    if (spawned) {
      st.insertCaseItem({ caseId: c.id, sessionId: t.sessionId, seat: loop.entry, worktree: null, worktreePath: null });
      rigEvent(b, { kind: 'seat_spawn', caseId: c.id, seat: loop.entry, session: t.sessionId, toSeat: loop.entry, actor: 'board', text: `@${shownName(t) || t.name}(${loop.name} 고리)`, data: { launcher: seat.launcher, session: seat.session, loop: loop.name } });
    }
    const text = this.everyText(key, r, loop, { since, now });
    const made = this.flow.units().create(t, t, text, 'cycle', { id: uid, caseId: c.id, seat: loop.entry, via: { by: t.sessionId, loop: loop.name, every: loop.trigger.every } });
    const nt = loop.trigger.notify ? this.flow.seatedOf(key, loop.trigger.notify)[0] || null : null;
    if (nt && nt !== t) try { b.queue.enqueue(nt.sessionId, `[Atrium 보드] rig 고리 ${loop.name}(${loop.trigger.every}마다)의 회 ${c.id} "${name}"가 열렸다: ${loop.entry} 자리 @${shownName(t) || t.name}.`); } catch {}
    b.log && b.log(`rig loop ${key} ${loop.name} → ${t.name} case ${c.id} unit ${made.unit.id}`);
    this.changed(key);
    return { loop: loop.name, caseId: c.id, unitId: made.unit.id, to: t.name, name, spawned };
  }
  // fresh 입구 자리 세션을 띄운다(위 세션 없이, rig.spawnSeat과 같은 길: 자리의 런처·effort·model)
  async spawnEntry(key, r, seatName) {
    const b = this.b; const st = this.store();
    const x = r.def.seats[seatName];
    if (!b.rigSetup || typeof b.spawn !== 'function') throw apiError('spawn_failed', '보드가 세션을 띄우지 못한다');
    const L = b.rigSetup.launcherOf(x.launcher);
    const name = b.rigSetup.freeName(`${seatName}-${st.nextSeatN(key, seatName)}`, () => `${seatName}-${st.nextSeatN(key, seatName)}`);
    const res = await b.spawn({ cwd: r.root, name, ...L.spawn, ...(x.effort ? { effort: x.effort } : {}), ...(x.model ? { model: x.model } : {}), [SEAT_SPAWN]: seatName });
    const s = b.sessions.get(res.sessionId);
    if (!s) throw apiError('spawn_failed', `${seatName} 자리 세션이 보드에 등록되지 않았다.`);
    st.setSessionSeat(s.sessionId, seatName); s.rigSeat = seatName;
    st.addEvent(s.sessionId, 'rig_seat_spawn', { seat: seatName, by: 'loop', launcher: L.ref, session: x.session });
    if (b.broadcastSession) b.broadcastSession(s, { cause: 'rig_seat' });
    return s;
  }
  // every 회의 첫 일 글. improve: 판의 장부 요약(느린 고리와 같은 꼴). work: task(없으면 안내를 따르라는 한 줄)
  everyText(key, r, loop, { since, now }) {
    const head = `보드의 ${loop.name} 고리(${loop.trigger.every}마다)가 연 회다.`;
    const docs = r.def.docs || {};
    const holds = loop.holds.map((n) => (docs[n] ? `${n}(${docs[n].rel || docs[n].path})` : n));
    if (loop.kind === 'improve') {
      const body = this.flow.cycleSummary(key, r, { index: loop.name, every: loop.trigger.every, staleMs: IMPROVE_STALE_MS }, { since, now });
      const intro = `${head} ${utc(since)}부터 ${utc(now)}까지(UTC)의 rig 장부 요약을 읽고, ${holds.length ? `이 고리가 쥔 문서(${holds.join(', ')})와 ` : ''}정의(.atrium/rig.json)·안내·정본에 고칠 것이 있으면 고친다(고친 정의는 버전으로 남는다: atrium rig log, atrium rig check). 끝나면 done으로 한 일을 보고한다.`;
      return body.replace(/^[^\n]*/, intro);
    }
    return [head, loop.task || '이 자리의 안내(atrium guide)와 문서를 따라 이번 회의 일을 하고, 끝나면 done으로 한 일을 보고한다.', ...(holds.length ? ['', `이 고리가 쥔 문서: ${holds.join(', ')}`] : [])].join('\n');
  }

  // ---------- P223: 회 저절로 닫기(11.6의 3) ----------
  // 쉼 기준: cfg.rigRunIdleMs(시험) → 세션 잠재우기 시간(설정 sessionSleepAfterMin, 0이면 끔이라 기본) → 30분
  idleMs() {
    const c = this.b.cfg || {};
    if (c.rigRunIdleMs != null) return Number(c.rigRunIdleMs);
    const ms = this.b.sleeper && this.b.sleeper.sessionAfterMs ? this.b.sleeper.sessionAfterMs() : 0;
    return ms > 0 ? ms : RUN_IDLE_MS;
  }
  // 그 회를 닫지 않는 까닭 | null(닫는다). 고리(loops에 쓴 고리)의 끝나지 않은 회만
  autoCloseWhy(c, now, idleMs) {
    const st = this.store();
    if (!c || !['open', 'waiting_owner'].includes(c.state)) return 'state';
    if (c.pausedAt) return 'paused';
    if (c.held && c.held.length) return 'held';
    const s = this.b.sessions.get(c.owner);
    if (!s) return 'no_owner';
    const state = deriveState(s.rt || {}).state;
    if (BUSY_STATES.has(state)) return 'busy';
    if (now - idleSince(s) < idleMs) return 'recent';
    const open = st.unitsOfCase(c.id).filter((u) => u.status === 'open');
    if (open.some((u) => u.to !== c.owner)) return 'open_work'; // 다른 자리의 일(줄에 선 일 포함)
    if (this.b.queue && this.b.queue.list(c.owner).some((d) => !d.parked && d.status !== 'cancelled')) return 'delivering'; // 입구 세션에 갈 글이 남았다
    return null;
  }
  autoClose(key, r, now = Date.now()) {
    const st = this.store(); const closed = [];
    const idleMs = this.idleMs();
    for (const loop of Object.values(this.loopsOf(r.def))) {
      if (loop.implicit || loop.trigger.type === 'event' || this.isPaused(key, loop.name)) continue;
      for (const c of st.liveCasesOfLoop(key, loop.name)) {
        if (this.autoCloseWhy(c, now, idleMs)) continue;
        // 주인(입구 세션)의 열린 일을 닫는다(done 없이 쉬었다). 아니면 다음 사람 글이 그 일의 이어지는 지시가 되고, 새 회의 일이 줄에 선다
        const tr = st.openTryOf(c.owner);
        for (const u of st.unitsOfCase(c.id).filter((x) => x.status === 'open')) {
          if (tr && tr.unitId === u.id) st.updateTry(tr.id, { endedAt: now, stopReason: 'auto' });
          st.updateUnit(u.id, { status: 'done', closedAt: now });
          st.addEvent(c.owner, 'unit_auto_done', { unitId: u.id, tryId: tr && tr.unitId === u.id ? tr.id : null, caseId: c.id });
        }
        const mins = Math.round(idleMs / 60000);
        this.flow.closeDone(c, `입구 세션이 ${mins}분 쉬고 열린 일이 없어 판이 닫음`, 'auto');
        this.b.log && this.b.log(`rig run ${c.id} auto closed (${loop.name}, idle ${mins}m)`);
        closed.push(c.id);
        try { this.flow.units().pump(c.owner); } catch {}
      }
    }
    if (closed.length) this.changed(key);
    return closed;
  }

  // ---------- 멈추기·잇기(옛 F1-4) ----------
  // target: 고리 이름 | 회(건) ID. by: human | manager | remote, who: 관리자 자리 세션
  resolve(key, target) {
    const r = this.b.rig ? this.b.rig.active(key) : null;
    if (!r) throw apiError('rig_off', '이 워크스페이스에는 켜진 rig가 없다.');
    const id = String(target ?? '').trim();
    if (!id) throw apiError('bad_request', '고리 이름이나 회 ID를 준다: atrium rig pause|resume <고리|회>');
    const L = this.loopsOf(r.def);
    if (has(L, id)) return { r, loop: L[id] };
    const c = this.store().getCase(id);
    if (!c || c.workspaceKey !== key) throw apiError('not_found', `이 워크스페이스에 그런 고리나 회가 없다: ${id}. 고리: ${Object.keys(L).join(', ') || '(없음)'}. 회 보기: atrium rig status`);
    return { r, c };
  }
  pause(key, target, { by = 'human', who = null } = {}) {
    const st = this.store(); const x = this.resolve(key, target); const now = Date.now();
    const actor = by === 'manager' ? 'agent' : 'human';
    const base = { ws: key, seat: who ? who.rigSeat || null : null, session: who ? who.sessionId : null, actor };
    if (x.loop) {
      const row = st.getLoopRow(key, x.loop.name);
      if (row && row.pausedAt) return { workspace: key, loop: x.loop.name, paused: true, already: true, at: row.pausedAt, by: row.pausedBy };
      st.setLoopRow(key, x.loop.name, { pausedAt: now, pausedBy: by });
      const live = st.liveCasesOfLoop(key, x.loop.name).map((c) => c.id);
      rigEvent(this.b, { ...base, kind: 'loop_paused', value: x.loop.name, text: `고리 ${x.loop.name} 멈춤(${whoText(by)}): 새 회·넘김·자리 띄우기를 막는다. 일하는 세션은 그대로`, data: { loop: x.loop.name, by, live } });
      this.b.log && this.b.log(`rig loop ${key} ${x.loop.name} paused by ${by}`);
      this.changed(key);
      return { workspace: key, loop: x.loop.name, paused: true, at: now, by, live };
    }
    const c = x.c;
    if (!LIVE.has(c.state)) throw apiError('case_closed', `회 ${c.id}는 이미 ${c.state}다. 끝나지 않은 회만 멈춘다.`);
    if (c.pausedAt) return { workspace: key, case: c.id, name: c.name, paused: true, already: true, at: c.pausedAt, by: c.pausedBy };
    st.updateCase(c.id, { pausedAt: now, pausedBy: by });
    rigEvent(this.b, { ...base, kind: 'run_paused', caseId: c.id, value: c.state, text: `회 ${c.id}${c.name ? ` "${c.name}"` : ''} 멈춤(${whoText(by)}): 이 회의 새 넘김을 막는다`, data: { loop: c.loop, by } });
    this.b.log && this.b.log(`rig run ${c.id} paused by ${by}`);
    this.changed(key);
    return { workspace: key, case: c.id, name: c.name, loop: c.loop, paused: true, at: now, by };
  }
  async resume(key, target, { by = 'human', who = null } = {}) {
    const st = this.store(); const x = this.resolve(key, target);
    const actor = by === 'manager' ? 'agent' : 'human';
    const base = { ws: key, seat: who ? who.rigSeat || null : null, session: who ? who.sessionId : null, actor };
    if (x.loop) {
      const name = x.loop.name;
      const row = st.getLoopRow(key, name);
      if (!row || !row.pausedAt) return { workspace: key, loop: name, paused: false, already: true };
      st.setLoopRow(key, name, { pausedAt: null, pausedBy: null });
      rigEvent(this.b, { ...base, kind: 'loop_resumed', value: name, text: `고리 ${name} 잇기(${whoText(by)})`, data: { loop: name, by, pausedAt: row.pausedAt } });
      let released = 0;
      for (const c of st.liveCasesOfLoop(key, name)) if (!c.pausedAt) released += await this.release(c);
      const opened = [];
      for (const q of st.heldLoopRequests(key, name)) {
        // P223: 붙잡은 전달. 사람이 그새 취소했으면 회를 열지 않는다. 고친 글이 있으면 그 글
        const d = q.deliveryId && this.b.queue ? this.b.queue.items.get(q.deliveryId) || null : null;
        if (q.deliveryId && (!d || !d.parked)) { st.setLoopRequest(q.id, 'cancelled'); continue; }
        const s = this.b.sessions.get(q.sessionId) && this.b.sessions.get(q.sessionId).rigSeat === x.loop.entry ? this.b.sessions.get(q.sessionId) : this.flow.seatedOf(key, x.loop.entry)[0] || null;
        if (!s) { st.setLoopRequest(q.id, 'dropped'); if (d) this.b.queue.dropPark(d.deliveryId, 'failed', 'loop_no_session'); continue; }
        if (d && d.sessionId !== s.sessionId) { this.b.queue.dropPark(d.deliveryId, 'cancelled', 'loop_moved'); } // 입구 세션이 바뀌었다(새 세션에 새 전달)
        const from = q.fromKind === 'human' ? { kind: 'human' } : { kind: 'agent', session: this.b.sessions.get(q.fromSession) || { sessionId: q.fromSession, name: this.flow.nameOf(q.fromSession) } };
        const o = this.openRequest(x.r, x.loop, s, from, d ? d.text : q.text, { heldId: q.id, deliveryId: d && d.sessionId === s.sessionId ? d.deliveryId : null });
        st.setLoopRequest(q.id, 'opened', o.caseId);
        opened.push({ case: o.caseId, name: o.name });
      }
      this.b.log && this.b.log(`rig loop ${key} ${name} resumed by ${by}: handoffs ${released}, requests ${opened.length}`);
      this.flow.pumpSoon();
      this.changed(key);
      return { workspace: key, loop: name, paused: false, released, opened };
    }
    const c = x.c;
    if (!c.pausedAt) return { workspace: key, case: c.id, name: c.name, paused: false, already: true };
    st.updateCase(c.id, { pausedAt: null, pausedBy: null });
    rigEvent(this.b, { ...base, kind: 'run_resumed', caseId: c.id, value: c.state, text: `회 ${c.id}${c.name ? ` "${c.name}"` : ''} 잇기(${whoText(by)})`, data: { loop: c.loop, by, pausedAt: c.pausedAt } });
    const c2 = st.getCase(c.id);
    const loopPaused = this.pauseOf(c2);
    const released = loopPaused ? 0 : await this.release(c2);
    this.flow.pumpSoon();
    this.changed(key);
    return { workspace: key, case: c.id, name: c.name, paused: false, released, ...(loopPaused ? { loopPaused: loopPaused.loop } : {}) };
  }
  // 멈춘 동안 붙잡은 넘김을 넘긴다 → 넘긴 수
  async release(c) {
    const st = this.store(); const b = this.b;
    const held = (c && c.held) || [];
    if (!held.length) return 0;
    st.updateCase(c.id, { held: [] });
    const r = b.rig ? b.rig.active(c.workspaceKey) : null;
    if (!r) return 0;
    let n = 0;
    for (const h of held) {
      const unit = st.getUnit(h.unitId);
      const caller = b.sessions.get(h.session) || { sessionId: h.session, name: this.flow.nameOf(h.session), rigSeat: h.seat, workspaceKey: c.workspaceKey };
      const c1 = st.getCase(c.id);
      const def = this.flow.defOfCase(c1, r);
      if (!unit || !def || !def.seats || !def.seats[h.seat]) continue;
      const ctx = { key: c.workspaceKey, r, def, seat: def.seats[h.seat], name: h.seat };
      const lines = this.linesOf(def, c1, def.flow.filter((l) => l.from === h.seat && l.on === h.result));
      try { await this.flow.afterDone(caller, unit, h.result, h.text, { ctx, c: c1, lines }); n++; }
      catch (e) { b.log && b.log('rig release error', e.stack); }
    }
    return n;
  }

  // ---------- 회 이름 고치기 ----------
  name(key, caseId, text, { by = 'human', who = null } = {}) {
    const st = this.store();
    const id = String(caseId ?? '').trim();
    if (!id) throw apiError('bad_request', '회 ID를 준다: atrium rig name <회> "<이름>"');
    const c = st.getCase(id);
    if (!c || c.workspaceKey !== key) throw apiError('not_found', `이 워크스페이스의 회가 아니다: ${id}`);
    const nm = cleanRunName(text);
    st.updateCase(id, { name: nm, nameBy: by });
    rigEvent(this.b, { kind: 'run_named', caseId: id, seat: who ? who.rigSeat || null : null, session: who ? who.sessionId : null, value: by, actor: by === 'human' || by === 'remote' ? 'human' : 'agent', text: `"${c.name || '-'}" → "${nm}"`, data: { name: nm, before: c.name, by, loop: c.loop } });
    this.changed(key);
    return { workspace: key, case: id, name: nm, before: c.name, by };
  }

  // ---------- 보이기 ----------
  // 고리 목록과 상태(rig.status, rig.map, atrium rig status) → [{ name, kind, implicit, trigger, entry, lines, holds, reads, produces, approve, state, why, paused, nextAt, lastRun, runs, held }]
  view(key, def) {
    const st = this.store();
    if (!def) return [];
    const stats = st.loopRunStats ? st.loopRunStats(key) : {};
    return Object.values(this.loopsOf(def)).map((l) => {
      const row = st.getLoopRow ? st.getLoopRow(key, l.name) : null;
      let s = stats[l.name] || { total: 0, live: 0, last: null };
      if (l.implicit && l.name === IMPLICIT_WORK && stats['']) { const o = stats['']; s = { total: s.total + o.total, live: s.live + o.live, last: !s.last || (o.last && o.last.createdAt > s.last.createdAt) ? o.last : s.last }; } // R2 전의 건(고리 없음)은 작업 고리 work의 회로
      let nextAt = null;
      if (l.trigger.type === 'every') nextAt = l.implicit ? ((st.getCycle && st.getCycle(key, l.cycle)) || {}).nextAt ?? null : row ? row.nextAt ?? null : null;
      const entry = def.seats ? def.seats[l.entry] : null;
      const seated = this.flow.seatedOf(key, l.entry).length > 0;
      const armed = l.trigger.type === 'event' ? false : entry && entry.session === 'keep' ? seated : !!entry;
      const state = row && row.pausedAt ? 'paused' : s.live > 0 ? 'running' : armed ? 'waiting' : 'idle';
      const last = s.last;
      return {
        name: l.name, kind: l.kind, implicit: !!l.implicit, trigger: { ...l.trigger }, entry: l.entry, lines: l.lines.slice(), holds: l.holds.slice(), reads: (l.reads || []).slice(), produces: (l.produces || []).slice(), approve: l.approve || null, ...(l.cycle != null ? { cycle: l.cycle } : {}), task: l.task || null, // P223: task
        state, why: state === 'idle' ? (l.trigger.type === 'event' ? 'event' : 'no_session') : null,
        paused: row && row.pausedAt ? { at: row.pausedAt, by: row.pausedBy } : null, nextAt,
        lastRun: last ? { id: last.id, name: last.name, state: last.state, at: last.createdAt, closedAt: last.closedAt, paused: !!last.pausedAt } : null,
        runs: { live: s.live, total: s.total }, held: st.heldLoopRequests ? st.heldLoopRequests(key, l.name).length : 0,
      };
    });
  }
}

// 판 API 처리기(backend.mjs handlers에 펼친다). rig.loops는 보기(판 API 토큰·기기 토큰). 멈추기는 이 PC의 창·사람의 atrium 명령과 연결한 기기(끄기와 같다),
//   잇기·회 이름 고치기는 이 PC의 창·사람의 atrium 명령만(판 API 토큰)
export function rigLoopHandlers(b) {
  const keyOf = async (p) => (await b.resolveWorkspace(p && p.workspace)).key;
  const L = () => b.branch.flow.loops;
  const local = (c, what) => { if (!c || !c.auth || c.auth.kind !== 'local') throw apiError('forbidden', `${what}는 이 PC의 보드 창이나 사람의 atrium 명령에서만 한다(판 API 토큰).`); };
  return {
    'rig.loops': async (p) => { const key = await keyOf(p); const r = b.rig ? b.rig.read(key) : null; return { workspace: key, loops: L().view(key, r && r.def) }; },
    'rig.pause': async (p, c) => { if (!c || !c.auth || !['local', 'device'].includes(c.auth.kind)) throw apiError('forbidden', 'rig 멈추기는 보드 창이나 연결한 기기에서 한다.'); return L().pause(await keyOf(p), p && (p.target || p.loop || p.case), { by: c.auth.kind === 'device' ? 'remote' : 'human' }); },
    'rig.resume': async (p, c) => { local(c, 'rig 잇기'); return L().resume(await keyOf(p), p && (p.target || p.loop || p.case), { by: 'human' }); },
    'rig.name': async (p, c) => { local(c, '회 이름 고치기'); return L().name(await keyOf(p), p && (p.case || p.caseId), p && p.name, { by: 'human' }); },
  };
}
