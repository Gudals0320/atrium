// P304: 리포(워크스페이스)별 목표·마일스톤(설계 experiments/p301/p301-design.md 1절). 워크스페이스마다 계획 문서 한 장(JSON)과 바뀜 기록.
// - 문서 꼴(import·export도 같은 꼴): { version: 1, goal, metrics: [{ id, name, target, now, unit }], focus, milestones: [{ code, title, purpose, doneWhen, state, doneAt,
//   items: [{ id, text, note, who, done, snoozeUntil }] }], nextItem: { <코드>: <다음 번호> } }
// - 차례는 배열 차례다. 마일스톤 state: open | done. 항목이 다 체크돼도 저절로 닫지 않는다(끝 기준은 글이라 head나 사람이 닫는다).
// - 항목 ID는 "<마일스톤 코드>.<번호>"(만든 차례, 지워도 다시 쓰지 않는다 = nextItem). 코드를 바꾸면 그 항목 ID들도 바뀐다(응답과 기록에 보인다).
// - who: user | head. done: null | { at, by: user | head | <세션 이름>, via: pc | remote | agent | foryou | import }.
// - 바뀜은 순수 함수 applyPlanOp(doc, op, { now, actor }) → { doc, result, log }(칸반 applyKanbanOp와 같은 짜임). 받은 문서는 바꾸지 않는다.
// - 사람(창·휴대폰)은 HUMAN_OPS만 한다(설계 2절: 체크·풀기, 항목 글·메모·더하기·지우기, focus, 마일스톤 끝내기·다시 열기, 측정값 지금, 미루기). 목표·마일스톤 구조는 head 명령으로만.
export const PLAN_VERSION = 1;
// 상한(설계 1.1)
export const PLAN = {
  goalMax: 300, metricsMax: 8, metricNameMax: 60, metricValueMax: 40,
  milestonesMax: 40, codeMax: 12, titleMax: 120, textBlockMax: 600,
  itemsMax: 60, itemTextMax: 300, noteMax: 600, docBytesMax: 200 * 1024,
  logKeep: 500, logShow: 20,
};
export const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const WHO = ['user', 'head'];
export const VIAS = ['pc', 'remote', 'agent', 'foryou', 'import'];
export const MS_STATES = ['open', 'done'];
// 사람이 창에서 하는 연산(설계 9절 1: 구조와 목표 문장은 head)
export const HUMAN_OPS = Object.freeze(['check', 'uncheck', 'itemAdd', 'itemEdit', 'itemRm', 'focus', 'msDone', 'msReopen', 'metricNow', 'snooze']);
export const OPS = Object.freeze(['goal', 'metric', 'metricRm', 'metricNow', 'ms', 'msDone', 'msReopen', 'msRm', 'focus', 'itemAdd', 'itemEdit', 'itemRm', 'check', 'uncheck', 'snooze']);

const err = (code, message, extra = {}) => Object.assign(new Error(message), { code }, extra);
const bad = (m, extra) => err('bad_request', m, extra);
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const block = (s) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();

export function emptyPlan() { return { version: PLAN_VERSION, goal: null, metrics: [], focus: null, milestones: [], nextItem: {} }; }
// 비었나(목표·측정값·마일스톤이 없다)
export const isEmptyPlan = (d) => !d || (!d.goal && !(d.metrics || []).length && !(d.milestones || []).length);

// ---------- 글 검사 ----------
function textOf(v, what, max, { multi = false, required = true } = {}) {
  const s = v == null ? '' : multi ? block(v) : oneLine(v);
  if (!s) { if (required) throw bad(what + '이(가) 비었다.'); return null; }
  if (s.length > max) throw err('too_long', what + '이(가) 너무 길다(' + s.length + '자, ' + max + '자까지).', { limit: max, now: s.length });
  return s;
}
function codeOf(v, what = '마일스톤 코드') {
  const s = String(v ?? '').trim();
  if (!s) throw bad(what + '를 준다(예: M2).');
  if (s.length > PLAN.codeMax || !CODE_RE.test(s)) throw bad(what + '는 ' + PLAN.codeMax + '자까지, 영문·숫자로 시작하고 영문·숫자·.·_·-만 쓴다: ' + s);
  return s;
}
function whoOf(v, fallback = 'head') {
  if (v == null || v === '') return fallback;
  const s = String(v).trim().toLowerCase();
  if (!WHO.includes(s)) throw bad('누가는 user 또는 head다: ' + v);
  return s;
}

// ---------- 찾기 ----------
export function findMs(doc, code) {
  if (code == null) return null;
  const c = String(code).trim();
  return doc.milestones.find((m) => m.code === c) || doc.milestones.find((m) => m.code.toLowerCase() === c.toLowerCase()) || null;
}
export function findItem(doc, id) {
  const s = String(id ?? '').trim();
  for (const m of doc.milestones) {
    const i = m.items.findIndex((x) => x.id === s || x.id.toLowerCase() === s.toLowerCase());
    if (i >= 0) return { ms: m, index: i, item: m.items[i] };
  }
  return null;
}
function needMs(doc, code) { const m = findMs(doc, code); if (!m) throw err('not_found', '마일스톤이 없다: ' + code + (doc.milestones.length ? '(있는 것: ' + doc.milestones.map((x) => x.code).join(', ') + ')' : '(아직 마일스톤이 없다)')); return m; }
function needItem(doc, id) { const f = findItem(doc, id); if (!f) throw err('not_found', '항목이 없다: ' + id + '(항목 ID는 "M2.4" 꼴. 목록: atrium plan --all)'); return f; }
function findMetric(doc, ref) {
  const s = oneLine(ref);
  return doc.metrics.find((x) => x.id === s) || doc.metrics.find((x) => x.name === s) || doc.metrics.find((x) => x.name.toLowerCase() === s.toLowerCase()) || null;
}
const nextNo = (doc, code) => { const n = Number(doc.nextItem[code]) || 1; const used = Math.max(0, ...findMs(doc, code).items.map((x) => Number(String(x.id).slice(code.length + 1)) || 0)); return Math.max(n, used + 1); };
function newItemId(doc, ms) { const n = nextNo(doc, ms.code); doc.nextItem[ms.code] = n + 1; return ms.code + '.' + n; }
function placeIndex(doc, before, after) {
  if (before != null) return doc.milestones.indexOf(needMs(doc, before));
  if (after != null) return doc.milestones.indexOf(needMs(doc, after)) + 1;
  return null;
}

// ---------- 요약(칩·내 몫·me 한 줄이 쓴다) ----------
export function msCounts(m, now = Date.now()) {
  const total = m.items.length;
  const done = m.items.filter((x) => x.done).length;
  const user = m.items.filter((x) => x.who === 'user');
  const userLeft = user.filter((x) => !x.done).length;
  return { total, done, userLeft, userTotal: user.length, headLeft: total - done - userLeft, allChecked: total > 0 && done === total, snoozed: m.items.filter((x) => !x.done && x.snoozeUntil && x.snoozeUntil > now).length };
}
// → { goal, focus: { code, title, done, total, userLeft, allChecked, state } | null, milestones: [{ code, title, state, done, total, userLeft }], metrics, empty }
export function planSummary(doc, now = Date.now()) {
  if (!doc) return null;
  const milestones = doc.milestones.map((m) => ({ code: m.code, title: m.title, state: m.state, ...msCounts(m, now) }));
  const f = doc.focus ? milestones.find((m) => m.code === doc.focus) || null : null;
  return { goal: doc.goal || null, focus: f, milestones, metrics: doc.metrics.length, empty: isEmptyPlan(doc) };
}
// 사람에게 넘길 focus 항목(내 몫 카드 후보, 오래된 차례): who=user, 체크 안 됨
export function focusUserItems(doc, now = Date.now()) {
  const m = doc && doc.focus ? findMs(doc, doc.focus) : null;
  if (!m || m.state === 'done') return [];
  return m.items.filter((x) => x.who === 'user' && !x.done).map((x) => ({ ...x, ms: m.code, msTitle: m.title, snoozed: !!(x.snoozeUntil && x.snoozeUntil > now) }));
}

// ---------- 연산 ----------
// op: { op, ... }. ctx: { now, actor: { by, via } }. → { doc, result, log: [{ op, ref, summary }] }
export function applyPlanOp(doc0, op, { now = Date.now(), actor = { by: 'head', via: 'agent' } } = {}) {
  const doc = structuredClone(doc0 || emptyPlan());
  if (!doc.nextItem) doc.nextItem = {};
  const log = [];
  const say = (ref, summary) => log.push({ op: op.op, ref: ref ?? null, summary });
  const mark = () => ({ at: now, by: actor.by, via: actor.via });
  switch (op && op.op) {
    case 'goal': {
      const g = op.text == null || op.text === '' ? null : textOf(op.text, '목표', PLAN.goalMax);
      doc.goal = g;
      say(null, g ? '목표 바꿈' : '목표 지움');
      return { doc, result: { goal: g }, log };
    }
    case 'metric': { // 이름(또는 id)으로 찾아 없으면 만들고 있으면 고친다
      let m = op.id ? findMetric(doc, op.id) : findMetric(doc, op.name);
      const name = op.name != null ? textOf(op.name, '측정값 이름', PLAN.metricNameMax) : null;
      const val = (k, what) => (op[k] === undefined ? undefined : op[k] === null || op[k] === '' ? null : textOf(op[k], what, PLAN.metricValueMax));
      const target = val('target', '목표 값'), nowV = val('now', '지금 값'), unit = val('unit', '단위');
      if (!m) {
        if (!name) throw bad('새 측정값은 이름을 준다.');
        if (doc.metrics.length >= PLAN.metricsMax) throw err('too_many', '측정값은 ' + PLAN.metricsMax + '개까지다. 쓰지 않는 것을 지운다: atrium plan metric "<이름>" --rm');
        const used = new Set(doc.metrics.map((x) => x.id));
        let n = 1; while (used.has('m' + n)) n++;
        m = { id: 'm' + n, name, target: target ?? null, now: nowV ?? null, unit: unit ?? null };
        doc.metrics.push(m);
        say(m.id, '측정값 더함: ' + name);
        return { doc, result: { metric: m.id, created: true }, log };
      }
      if (op.rename != null) m.name = textOf(op.rename, '측정값 이름', PLAN.metricNameMax);
      if (target !== undefined) m.target = target;
      if (nowV !== undefined) m.now = nowV;
      if (unit !== undefined) m.unit = unit;
      say(m.id, '측정값 고침: ' + m.name);
      return { doc, result: { metric: m.id, created: false }, log };
    }
    case 'metricNow': { // 사람: 지금 값만
      const m = findMetric(doc, op.metric ?? op.id ?? op.name);
      if (!m) throw err('not_found', '측정값이 없다: ' + (op.metric ?? op.id ?? op.name));
      m.now = op.now == null || op.now === '' ? null : textOf(op.now, '지금 값', PLAN.metricValueMax);
      say(m.id, m.name + ' 지금 ' + (m.now ?? '-'));
      return { doc, result: { metric: m.id }, log };
    }
    case 'metricRm': {
      const m = findMetric(doc, op.metric ?? op.id ?? op.name);
      if (!m) throw err('not_found', '측정값이 없다: ' + (op.metric ?? op.id ?? op.name));
      doc.metrics.splice(doc.metrics.indexOf(m), 1);
      say(m.id, '측정값 지움: ' + m.name);
      return { doc, result: { metric: m.id }, log };
    }
    case 'ms': { // 없으면 만들고 있으면 고친다
      const code = codeOf(op.code);
      let m = findMs(doc, code);
      const fields = {};
      if (op.title !== undefined) fields.title = textOf(op.title, '마일스톤 이름', PLAN.titleMax);
      if (op.purpose !== undefined) fields.purpose = textOf(op.purpose, '목적', PLAN.textBlockMax, { multi: true, required: false });
      if (op.doneWhen !== undefined) fields.doneWhen = textOf(op.doneWhen, '끝 기준', PLAN.textBlockMax, { multi: true, required: false });
      if (op.before != null && op.after != null) throw bad('--before와 --after는 함께 쓰지 않는다.');
      const created = !m;
      if (created) {
        if (!fields.title) throw bad('새 마일스톤은 이름을 준다: atrium plan ms ' + code + ' "<이름>"');
        if (doc.milestones.length >= PLAN.milestonesMax) throw err('too_many', '마일스톤은 ' + PLAN.milestonesMax + '개까지다.');
        if (op.newCode != null) throw bad('--code(코드 바꾸기)는 있는 마일스톤에만 쓴다.');
        m = { code, title: fields.title, purpose: fields.purpose ?? null, doneWhen: fields.doneWhen ?? null, state: 'open', doneAt: null, items: [] };
        const at = placeIndex(doc, op.before, op.after);
        if (at == null) doc.milestones.push(m); else doc.milestones.splice(at, 0, m);
        if (!doc.nextItem[code]) doc.nextItem[code] = 1;
        if (!doc.focus) doc.focus = code; // 첫 마일스톤은 저절로 지금(focus)
        say(code, '마일스톤 더함: ' + code + ' ' + m.title);
        return { doc, result: { code, created: true, focus: doc.focus }, log };
      }
      Object.assign(m, fields);
      if (op.before != null || op.after != null) {
        if (String(op.before ?? op.after).trim().toLowerCase() === m.code.toLowerCase()) throw bad('자기 앞뒤로 옮길 수 없다.');
        doc.milestones.splice(doc.milestones.indexOf(m), 1);
        doc.milestones.splice(placeIndex(doc, op.before, op.after), 0, m);
      }
      let renamed = null;
      if (op.newCode != null) {
        const nc = codeOf(op.newCode, '새 코드');
        if (nc !== m.code) {
          const other = findMs(doc, nc);
          if (other && other !== m) throw err('exists', '이미 있는 코드다: ' + nc);
          const old = m.code;
          renamed = {};
          for (const it of m.items) { const nid = nc + it.id.slice(old.length); renamed[it.id] = nid; it.id = nid; }
          doc.nextItem[nc] = doc.nextItem[old] || m.items.length + 1; delete doc.nextItem[old];
          if (doc.focus === old) doc.focus = nc;
          m.code = nc;
          say(nc, '마일스톤 코드 ' + old + ' → ' + nc);
        }
      }
      if (Object.keys(fields).length || op.before != null || op.after != null) say(m.code, '마일스톤 고침: ' + m.code);
      return { doc, result: { code: m.code, created: false, ...(renamed ? { renamed } : {}) }, log };
    }
    case 'msDone': case 'msReopen': {
      const m = needMs(doc, op.code);
      const done = op.op === 'msDone';
      m.state = done ? 'done' : 'open';
      m.doneAt = done ? now : null;
      say(m.code, m.code + (done ? ' 끝냄' : ' 다시 엶'));
      return { doc, result: { code: m.code, state: m.state, ...msCounts(m, now) }, log };
    }
    case 'msRm': {
      const m = needMs(doc, op.code);
      doc.milestones.splice(doc.milestones.indexOf(m), 1);
      delete doc.nextItem[m.code];
      if (doc.focus === m.code) doc.focus = (doc.milestones.find((x) => x.state === 'open') || doc.milestones[0] || {}).code || null;
      say(m.code, '마일스톤 지움: ' + m.code + '(항목 ' + m.items.length + ')');
      return { doc, result: { code: m.code, removedItems: m.items.length, focus: doc.focus }, log };
    }
    case 'focus': {
      const m = needMs(doc, op.code);
      const from = doc.focus;
      doc.focus = m.code;
      say(m.code, 'focus ' + (from || '-') + ' → ' + m.code);
      return { doc, result: { code: m.code, from }, log };
    }
    case 'itemAdd': {
      const m = needMs(doc, op.ms ?? op.code);
      if (m.items.length >= PLAN.itemsMax) throw err('too_many', m.code + '의 항목은 ' + PLAN.itemsMax + '개까지다.');
      const it = { id: newItemId(doc, m), text: textOf(op.text, '항목 글', PLAN.itemTextMax), note: op.note == null || op.note === '' ? null : textOf(op.note, '메모', PLAN.noteMax, { multi: true }), who: whoOf(op.who), done: null, snoozeUntil: null };
      const at = op.index == null ? m.items.length : Math.max(0, Math.min(m.items.length, Math.trunc(Number(op.index)) || 0));
      m.items.splice(at, 0, it);
      say(it.id, it.id + ' 더함(' + it.who + ')');
      return { doc, result: { id: it.id, ms: m.code, who: it.who, ...msCounts(m, now) }, log };
    }
    case 'itemEdit': {
      const f = needItem(doc, op.id);
      const it = f.item;
      const changed = [];
      if (op.text !== undefined) { it.text = textOf(op.text, '항목 글', PLAN.itemTextMax); changed.push('글'); }
      if (op.note !== undefined) { it.note = op.note == null || op.note === '' ? null : textOf(op.note, '메모', PLAN.noteMax, { multi: true }); changed.push('메모'); }
      if (op.who !== undefined) { it.who = whoOf(op.who); changed.push('누가 ' + it.who); }
      let id = it.id, from = null;
      if (op.move != null) { // { ms, index? } 또는 "M3" / "M3:2"
        const mv = typeof op.move === 'string' ? (() => { const mm = String(op.move).match(/^(.+?)(?::(\d+))?$/); return { ms: mm[1], index: mm[2] != null ? Number(mm[2]) - 1 : null }; })() : op.move;
        const to = needMs(doc, mv.ms);
        if (to !== f.ms && to.items.length >= PLAN.itemsMax) throw err('too_many', to.code + '의 항목은 ' + PLAN.itemsMax + '개까지다.');
        f.ms.items.splice(f.index, 1);
        if (to !== f.ms) { from = it.id; it.id = newItemId(doc, to); id = it.id; }
        const at = mv.index == null ? to.items.length : Math.max(0, Math.min(to.items.length, Math.trunc(Number(mv.index)) || 0));
        to.items.splice(at, 0, it);
        changed.push(from ? '옮김 ' + from + ' → ' + id : '자리 옮김');
      }
      if (!changed.length) throw bad('고칠 것을 준다: --text, --note, --who, --move');
      say(id, id + ' 고침(' + changed.join(', ') + ')');
      return { doc, result: { id, ...(from ? { from } : {}), changed }, log };
    }
    case 'itemRm': {
      const f = needItem(doc, op.id);
      f.ms.items.splice(f.index, 1);
      say(f.item.id, f.item.id + ' 지움');
      return { doc, result: { id: f.item.id, ms: f.ms.code, ...msCounts(f.ms, now) }, log };
    }
    case 'check': case 'uncheck': {
      const ids = (Array.isArray(op.ids) ? op.ids : [op.ids ?? op.id]).filter((x) => x != null && String(x).trim());
      if (!ids.length) throw bad('항목 ID를 준다(예: M2.4).');
      const on = op.op === 'check';
      const out = [];
      const fs = ids.map((id) => needItem(doc, id)); // 하나라도 없으면 아무것도 바꾸지 않는다
      for (const f of fs) {
        const was = !!f.item.done;
        if (on && !was) f.item.done = mark();
        if (!on && was) f.item.done = null;
        if (on) f.item.snoozeUntil = null;
        out.push({ id: f.item.id, ms: f.ms.code, changed: was !== on });
        if (was !== on) say(f.item.id, f.item.id + (on ? ' 체크' : ' 체크 풂'));
      }
      const touched = [...new Set(fs.map((f) => f.ms))].map((m) => ({ code: m.code, ...msCounts(m, now) }));
      return { doc, result: { items: out, milestones: touched }, log };
    }
    case 'snooze': { // 사람: 내 몫 카드 미루기(until = 시각 | null)
      const f = needItem(doc, op.id);
      const u = op.until == null || op.until === '' ? null : Number(op.until);
      if (u != null && !(u > 0)) throw bad('미루기 시각이 잘못됐다.');
      f.item.snoozeUntil = u;
      say(f.item.id, f.item.id + (u ? ' 미룸' : ' 미루기 풂'));
      return { doc, result: { id: f.item.id, snoozeUntil: u }, log };
    }
    default: throw bad('알 수 없는 계획 연산이다: ' + (op && op.op));
  }
}
// 여러 연산을 차례로(하나라도 실패하면 아무것도 바꾸지 않는다)
export function applyPlanOps(doc, ops, ctx) {
  let d = doc || emptyPlan();
  const results = [], log = [];
  for (const op of ops) { const r = applyPlanOp(d, op, ctx); d = r.doc; results.push({ op: op.op, ...r.result }); log.push(...r.log); }
  checkSize(d);
  return { doc: d, results, log };
}
export function docBytes(doc) { return Buffer.byteLength(JSON.stringify(doc), 'utf8'); }
function checkSize(doc) { const n = docBytes(doc); if (n > PLAN.docBytesMax) throw err('too_long', '계획 문서가 너무 크다(' + Math.round(n / 1024) + 'KB, ' + PLAN.docBytesMax / 1024 + 'KB까지).', { limit: PLAN.docBytesMax, now: n }); }

// ---------- 가져오기 검사 ----------
// 받은 JSON(설계 1.1 꼴) → 고른 문서. 문제가 있으면 모두 모아 bad_plan(problems 목록)으로 거절한다
export function validatePlanDoc(input) {
  const problems = [];
  const p = (m) => { if (problems.length < 30) problems.push(m); };
  let raw = input;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw.replace(/^﻿/, '')); } catch (e) { throw err('bad_plan', 'JSON을 읽지 못했다: ' + e.message, { problems: ['JSON: ' + e.message] }); } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw err('bad_plan', '계획은 JSON 객체다({ version, goal, metrics, focus, milestones }).', { problems: ['객체가 아니다'] });
  if (!['version', 'name', 'goal', 'metrics', 'milestones', 'focus'].some((k) => k in raw)) p('계획 꼴이 아니다(version, goal, metrics, focus, milestones 가운데 하나도 없다)');
  if (raw.version != null && Number(raw.version) !== PLAN_VERSION) p('version은 ' + PLAN_VERSION + '이다(받은 값 ' + raw.version + ')');
  const out = emptyPlan();
  const str = (v, what, max, multi = false) => {
    if (v == null || v === '') return null;
    if (typeof v !== 'string' && typeof v !== 'number') { p(what + ': 글이 아니다'); return null; }
    const s = multi ? block(v) : oneLine(v);
    if (s.length > max) p(what + ': ' + s.length + '자(' + max + '자까지)');
    return s || null;
  };
  out.goal = str(raw.goal, 'goal', PLAN.goalMax);
  const metrics = raw.metrics == null ? [] : Array.isArray(raw.metrics) ? raw.metrics : (p('metrics는 배열이다'), []);
  if (metrics.length > PLAN.metricsMax) p('metrics: ' + metrics.length + '개(' + PLAN.metricsMax + '개까지)');
  const mids = new Set();
  metrics.slice(0, PLAN.metricsMax).forEach((m, i) => {
    if (!m || typeof m !== 'object') return p('metrics[' + i + ']: 객체가 아니다');
    const name = str(m.name, 'metrics[' + i + '].name', PLAN.metricNameMax);
    if (!name) p('metrics[' + i + ']: name이 없다');
    let id = m.id != null ? String(m.id).trim() : '';
    if (!id || mids.has(id) || !/^[A-Za-z0-9_-]{1,16}$/.test(id)) { let n = 1; while (mids.has('m' + n)) n++; id = 'm' + n; }
    mids.add(id);
    out.metrics.push({ id, name: name || '?', target: str(m.target, 'metrics[' + i + '].target', PLAN.metricValueMax), now: str(m.now, 'metrics[' + i + '].now', PLAN.metricValueMax), unit: str(m.unit, 'metrics[' + i + '].unit', PLAN.metricValueMax) });
  });
  const mss = raw.milestones == null ? [] : Array.isArray(raw.milestones) ? raw.milestones : (p('milestones는 배열이다'), []);
  if (mss.length > PLAN.milestonesMax) p('milestones: ' + mss.length + '개(' + PLAN.milestonesMax + '개까지)');
  const codes = new Set(), ids = new Set();
  mss.slice(0, PLAN.milestonesMax).forEach((m, i) => {
    const at = 'milestones[' + i + ']';
    if (!m || typeof m !== 'object') return p(at + ': 객체가 아니다');
    const code = String(m.code ?? '').trim();
    if (!code || code.length > PLAN.codeMax || !CODE_RE.test(code)) p(at + '.code: "' + code + '"(' + PLAN.codeMax + '자까지, 영문·숫자로 시작, 영문·숫자·.·_·-)');
    if (codes.has(code.toLowerCase())) p(at + '.code: 같은 코드가 두 번 있다(' + code + ')');
    codes.add(code.toLowerCase());
    const title = str(m.title, at + '.title', PLAN.titleMax);
    if (!title) p(at + '.title이 없다');
    const state = m.state == null ? 'open' : String(m.state);
    if (!MS_STATES.includes(state)) p(at + '.state: open 또는 done(받은 값 ' + state + ')');
    const items = m.items == null ? [] : Array.isArray(m.items) ? m.items : (p(at + '.items는 배열이다'), []);
    if (items.length > PLAN.itemsMax) p(at + '.items: ' + items.length + '개(' + PLAN.itemsMax + '개까지)');
    const ms = { code, title: title || code, purpose: str(m.purpose, at + '.purpose', PLAN.textBlockMax, true), doneWhen: str(m.doneWhen, at + '.doneWhen', PLAN.textBlockMax, true), state: MS_STATES.includes(state) ? state : 'open', doneAt: state === 'done' ? (Number(m.doneAt) > 0 ? Number(m.doneAt) : null) : null, items: [] };
    let maxNo = 0;
    const pending = [];
    items.slice(0, PLAN.itemsMax).forEach((it, j) => {
      const ia = at + '.items[' + j + ']';
      if (!it || typeof it !== 'object') return p(ia + ': 객체가 아니다');
      const text = str(it.text, ia + '.text', PLAN.itemTextMax);
      if (!text) p(ia + '.text가 없다');
      const who = it.who == null ? 'head' : String(it.who).toLowerCase();
      if (!WHO.includes(who)) p(ia + '.who: user 또는 head(받은 값 ' + it.who + ')');
      let done = null;
      if (it.done != null && it.done !== false) {
        const d = it.done === true ? {} : it.done;
        if (typeof d !== 'object') p(ia + '.done: null 또는 { at, by, via }');
        else done = { at: Number(d.at) > 0 ? Number(d.at) : null, by: d.by != null ? oneLine(d.by).slice(0, 64) || 'import' : 'import', via: VIAS.includes(d.via) ? d.via : 'import' };
      }
      // ID: "<코드>.<번호>". 맞지 않거나 겹치면 새로 매긴다
      let no = null;
      const mm = String(it.id ?? '').trim().match(/^(.+)\.(\d+)$/);
      if (mm && mm[1].toLowerCase() === code.toLowerCase() && !ids.has((code + '.' + Number(mm[2])).toLowerCase())) no = Number(mm[2]);
      const row = { id: null, text: text || '?', note: str(it.note, ia + '.note', PLAN.noteMax, true), who: WHO.includes(who) ? who : 'head', done, snoozeUntil: Number(it.snoozeUntil) > 0 ? Number(it.snoozeUntil) : null };
      if (no != null && no > 0) { row.id = code + '.' + no; ids.add(row.id.toLowerCase()); maxNo = Math.max(maxNo, no); }
      pending.push(row);
      ms.items.push(row);
    });
    for (const row of pending) if (!row.id) { maxNo++; row.id = code + '.' + maxNo; ids.add(row.id.toLowerCase()); }
    const given = raw.nextItem && Number(raw.nextItem[code]);
    out.nextItem[code] = Math.max(maxNo + 1, given > 0 ? given : 1);
    out.milestones.push(ms);
  });
  if (raw.focus != null && raw.focus !== '') {
    const f = out.milestones.find((m) => m.code.toLowerCase() === String(raw.focus).trim().toLowerCase());
    if (!f) p('focus: 없는 마일스톤이다(' + raw.focus + ')'); else out.focus = f.code;
  } else out.focus = (out.milestones.find((m) => m.state === 'open') || {}).code || null;
  if (problems.length) throw err('bad_plan', '가져올 계획에 문제가 ' + problems.length + '개 있다: ' + problems.slice(0, 5).join('; ') + (problems.length > 5 ? ' …' : ''), { problems });
  checkSize(out);
  return out;
}
// 가져오기 미리보기 수
export function importCounts(doc) {
  const items = doc.milestones.flatMap((m) => m.items);
  return { goal: doc.goal ? 1 : 0, metrics: doc.metrics.length, milestones: doc.milestones.length, items: items.length, user: items.filter((x) => x.who === 'user').length, checked: items.filter((x) => x.done).length, focus: doc.focus };
}

// ---------- 내보내기 ----------
export function planMarkdown(doc, { name = null } = {}) {
  const L = [];
  L.push('# ' + (name ? name + ' 목표' : '목표'));
  L.push('');
  L.push(doc.goal || '(목표 없음)');
  if (doc.metrics.length) { L.push(''); L.push('## 측정값'); L.push(''); for (const m of doc.metrics) L.push('- ' + m.name + ': ' + (m.now ?? '-') + ' → ' + (m.target ?? '-') + (m.unit ? ' ' + m.unit : '')); }
  for (const m of doc.milestones) {
    const c = msCounts(m);
    L.push('');
    L.push('## ' + m.code + ' ' + m.title + (m.state === 'done' ? ' (끝)' : '') + (doc.focus === m.code ? ' · 지금' : '') + ' · ' + c.done + '/' + c.total);
    if (m.purpose) { L.push(''); L.push('목적: ' + m.purpose); }
    if (m.doneWhen) { L.push(''); L.push('끝 기준: ' + m.doneWhen); }
    if (m.items.length) L.push('');
    for (const it of m.items) L.push('- [' + (it.done ? 'x' : ' ') + '] ' + it.id + ' (' + (it.who === 'user' ? '사용자' : 'head') + ') ' + it.text + (it.note ? ' — ' + it.note.replace(/\n/g, ' ') : ''));
  }
  return L.join('\n') + '\n';
}
