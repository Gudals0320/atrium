// P191: 하네스 7단계 — 판 안에서 rig 만들기와 고치기(docs research harness-arch.md 16절). 순수 함수만 둔다(단위 시험 test/p191-lib.test.mjs).
// 판 API(P190): rig.templates, rig.create, rig.describe, rig.get, rig.save, rig.spawnSeat, 이미 있는 rig.enable·rig.seat.
// - 이름표 메뉴 항목(menuEntry): 정의가 없으면 "Rig 만들기", 있으면 "Rig 보기·고치기". 원격 기기는 보기만.
// - 만들기 대화상자(wizard*): 길 고르기 → (틀) 자리마다 런처 / (말로) 글과 제작 세션 런처 → (말로) 만드는 중 → 미리보기 → 켜기 확인 → 앉히기 → 끝
// - 미리보기 자료(previewModel): 자리 상자와 흐름 화살표, 값 이름, max·else
// - rig 판 표(table*): 정의 → 표 줄, 줄 고치기·더하기·지우기, 잠금(보호 포인터), 저장 자료(rig.save의 seats·flow·results 세 칸)

// ---------- 정의 읽기 ----------
// 정의의 자리는 객체({ 이름: {...} }, rig.json 모양)나 배열([{ name, ... }], rig.status 모양) 어느 쪽이든 받는다
export function seatList(def) {
  const s = def && def.seats;
  if (!s) return [];
  if (Array.isArray(s)) return s.filter((x) => x && x.name).map((x) => ({ ...x }));
  return Object.entries(s).map(([name, x]) => ({ ...(x || {}), name }));
}
// 흐름 줄의 to는 하나 또는 여럿
const toList = (to) => [].concat(to == null ? [] : to).filter((x) => x != null && x !== '');

// ---------- 이름표 메뉴 ----------
// rig.status(또는 rig.get) 답 → 'create' | 'view' | null(아직 모름·오류). 원격 기기는 정의가 있을 때 보기만 있고 만들기는 없다
export function menuEntry(status, { remote = false } = {}) {
  if (!status || status.state === 'error') return null;
  if (status.state === 'none') return remote ? null : 'create';
  return 'view';
}

// ---------- 런처 ----------
// 판의 호출자 목록(st.launchers) → 고를 수 있는 런처 [{ id, name, harness }]. 셸·명령 런처는 자리에 못 앉으므로 뺀다
export function launcherChoices(data) {
  const ls = (data && data.launchers) || [];
  return ls.filter((l) => l && l.id && l.harness !== 'shell' && l.harness !== 'command').map((l) => ({ id: l.id, name: l.name || l.id, harness: l.harness }));
}
// 자리마다 런처 기본값: 틀이 정한 런처가 목록에 있으면 그것, 아니면 defaultLauncher(그 워크스페이스에서 마지막으로 쓴 것), 그것도 없으면 목록의 첫째
export function defaultLaunchers(template, defaultLauncher, choices = []) {
  const ids = new Set(choices.map((c) => c.id));
  const fallback = defaultLauncher && (!choices.length || ids.has(defaultLauncher)) ? defaultLauncher : (choices[0] ? choices[0].id : defaultLauncher || '');
  const out = {};
  for (const s of seatList(template)) out[s.name] = fallback;
  return out;
}

// ---------- 만들기 대화상자 ----------
// 단계: path(길 고르기) → launchers(틀) | describe(말로) → building(말로, 제작 세션이 끝날 때까지) → preview → enable → seat → done
export const WIZARD_STEPS = ['path', 'launchers', 'describe', 'building', 'preview', 'enable', 'seat', 'done'];
export function wizardInit({ defaultLauncher = '', status = null } = {}) {
  const w = { step: 'path', path: null, template: null, launchers: {}, text: '', builderLauncher: defaultLauncher || '', builder: null, error: null, seatPick: {} };
  // 이미 정의가 있고 꺼져 있으면(말로 만들기 뒤 상자를 닫았다가 다시 연 때 등) 미리보기부터
  if (status && status.state === 'off') return { ...w, step: 'preview' };
  if (status && status.state === 'on') return { ...w, step: 'seat' };
  return w;
}
// 틀 고르기 → 자리마다 런처 단계
export function wizardPickTemplate(w, template, defaultLauncher, choices) {
  return { ...w, step: 'launchers', path: 'template', template: template.id, templateDef: template, launchers: defaultLaunchers(template, defaultLauncher, choices), error: null };
}
export function wizardPickDescribe(w) { return { ...w, step: 'describe', path: 'describe', template: null, templateDef: null, error: null }; }
export function wizardSetLauncher(w, seat, id) { return { ...w, launchers: { ...w.launchers, [seat]: id } }; }
export function wizardBack(w) {
  if (w.step === 'launchers' || w.step === 'describe') return { ...w, step: 'path', error: null };
  if (w.step === 'preview' && w.path === 'template') return { ...w, step: 'launchers', error: null };
  return w;
}
// 다음으로 갈 수 있나(단추를 막을지)
export function wizardCanNext(w) {
  if (w.step === 'launchers') return seatList(w.templateDef).every((s) => !!w.launchers[s.name]);
  if (w.step === 'describe') return !!String(w.text || '').trim() && !!w.builderLauncher;
  return true;
}
// 판 API 부르기 자료: 틀이면 rig.create, 말로면 rig.describe
export function wizardRequest(w, workspace) {
  if (w.step === 'launchers') return { method: 'rig.create', params: { workspace, template: w.template, launchers: { ...w.launchers } } };
  if (w.step === 'describe') return { method: 'rig.describe', params: { workspace, text: String(w.text).trim(), launcher: w.builderLauncher } };
  return null;
}
// 부른 결과를 받아 다음 단계로
export function wizardAfterRequest(w, res) {
  if (w.step === 'launchers') return { ...w, step: 'preview', error: null };
  if (w.step === 'describe') return { ...w, step: 'building', builder: { session: res && res.session, name: res && res.name, state: 'working' }, error: null };
  return w;
}
// 제작 세션 소식(판 이벤트 rig.builder 또는 rig.get의 builder)과 지금 rig 상태로 building 단계를 넘긴다.
//   맞는 정의가 생겼으면(off·on) 미리보기로, 실패·멈춤이면 building에 남아 까닭을 보인다
export function wizardOnBuilder(w, builder, status) {
  if (w.step !== 'building') return w;
  const b = { ...(w.builder || {}), ...(builder || {}) };
  const st = status && status.state;
  if ((st === 'off' || st === 'on') && b.state !== 'working') return { ...w, builder: b, step: st === 'on' ? 'seat' : 'preview' };
  return { ...w, builder: b };
}
export function wizardAfterEnable(w) { return { ...w, step: 'seat' }; }
// 앉히기: keep 자리마다 { kind: 'session', session } | { kind: 'spawn' } | { kind: 'skip' }
export function wizardSetSeat(w, seat, pick) { return { ...w, seatPick: { ...w.seatPick, [seat]: pick } }; }

// 제작 세션 상태 → 보일 글 열쇠와 값. builder: { session, name, state: working|done|stopped, result: ok|failed, text, why }
export function builderView(b) {
  if (!b) return null;
  const state = b.state === 'done' ? (b.result === 'failed' ? 'failed' : 'ok') : b.state === 'stopped' ? 'stopped' : 'working';
  return { state, name: b.name || '', session: b.session || null, text: b.text || b.why || '' };
}

// ---------- 앉히기 ----------
// keep 자리 목록과 자리마다 고를 수 있는 세션(같은 워크스페이스, 에이전트, 끝나지 않음, 다른 keep 자리에 앉지 않음)
//   seated: rig.get의 { 자리: [세션 요약] }
export function keepSeats(def, seated = {}) {
  return seatList(def).filter((s) => (s.session || 'fresh') === 'keep').map((s) => ({ name: s.name, launcher: s.launcher || '', seated: (seated[s.name] || [])[0] || null }));
}
export function seatCandidates(sessions, ws, seat) {
  return (sessions || []).filter((s) => s && (s.workspaceKey || '') === (ws || '') && (s.kind || 'claude') !== 'shell' && s.state !== 'exited' && (!s.rigSeat || s.rigSeat === seat))
    .map((s) => ({ sessionId: s.sessionId, name: s.name, current: s.rigSeat === seat }));
}
// 앉히기 고른 것 → 부를 판 API 목록
export function seatActions(workspace, picks) {
  const out = [];
  for (const [seat, p] of Object.entries(picks || {})) {
    if (!p || p.kind === 'skip') continue;
    if (p.kind === 'session' && p.session) out.push({ method: 'rig.seat', params: { session: p.session, seat } });
    if (p.kind === 'spawn') out.push({ method: 'rig.spawnSeat', params: { workspace, seat } });
  }
  return out;
}

// ---------- 미리보기 ----------
// 정의 → { seats: [{ name, mode, launcher, worktree, x, y, w, h }], arrows: [{ from, to, on, max, else, d, lx, ly, back }], results, width, height }
//   자리 상자는 흐름 차례(assign을 받는 쪽이 뒤)대로 한 줄. 되돌아가는 줄(같은 자리로, 또는 왼쪽으로)은 상자 위로 둥글게
export function previewModel(def, { box = { w: 132, h: 54 }, gap = 72, pad = 16 } = {}) {
  const seats = seatList(def);
  if (!seats.length) return { seats: [], arrows: [], results: (def && def.results) || [], width: 0, height: 0 };
  const flow = Array.isArray(def && def.flow) ? def.flow : [];
  // 차례: 정의의 자리 차례를 기본으로, 흐름에서 assign으로 받는 자리는 보내는 자리 뒤에
  const order = seats.map((s) => s.name);
  for (const l of flow) {
    if (l.on !== 'assign') continue;
    for (const to of toList(l.to)) {
      const a = order.indexOf(l.from), b = order.indexOf(to);
      if (a >= 0 && b >= 0 && b < a) { order.splice(b, 1); order.splice(order.indexOf(l.from) + 1, 0, to); }
    }
  }
  const top = pad + 40; // 되돌아가는 줄의 자리
  const pos = new Map();
  order.forEach((n, i) => pos.set(n, { x: pad + i * (box.w + gap), y: top }));
  const byName = new Map(seats.map((s) => [s.name, s]));
  const boxes = order.map((n) => { const s = byName.get(n); const p = pos.get(n); return { name: n, mode: (s.session || 'fresh') === 'keep' ? 'keep' : 'fresh', launcher: s.launcher || '', worktree: !!s.worktree, x: p.x, y: p.y, w: box.w, h: box.h }; });
  const arrows = [];
  let backN = 0, fwdN = new Map();
  for (const l of flow) {
    for (const to of toList(l.to)) {
      const a = pos.get(l.from), b = pos.get(to);
      if (!a || !b) continue;
      const max = l.max == null || l.max === '' ? null : Number(l.max);
      const base = { from: l.from, to, on: l.on, max, else: l.else || null };
      if (b.x > a.x) {
        const k = `${l.from}>${to}`; const n = fwdN.get(k) || 0; fwdN.set(k, n + 1);
        const y = a.y + box.h * 0.5 + (n - 0) * 14 - 7;
        const xa = a.x + box.w, xb = b.x;
        arrows.push({ ...base, back: false, d: `M${xa} ${y} L${xb} ${y}`, lx: (xa + xb) / 2, ly: y - 6 });
      } else {
        // 되돌아감: 위로 둥근 곡선(같은 자리면 그 상자 위 고리)
        const n = backN++;
        const xa = a.x + box.w * 0.5 + 10, xb = b.x + box.w * 0.5 - 10;
        const hgt = 28 + n * 14;
        const y = a.y;
        const d = a === b
          ? `M${xa} ${y} C${xa + 20} ${y - hgt} ${xb - 20} ${y - hgt} ${xb} ${y}`
          : `M${xa} ${y} C${xa} ${y - hgt} ${xb} ${y - hgt} ${xb} ${y}`;
        arrows.push({ ...base, back: true, d, lx: (xa + xb) / 2, ly: y - hgt * 0.75 - 4 });
      }
    }
  }
  const results = Array.isArray(def && def.results) ? def.results : [];
  return { seats: boxes, arrows, results, width: pad * 2 + order.length * box.w + (order.length - 1) * gap, height: top + box.h + pad + 18 };
}
// 화살표 이름표 글: "값" 또는 "값 ≤max → else"
export const arrowLabel = (a) => (a.max != null ? `${a.on} ≤${a.max}${a.else ? ` → ${a.else}` : ''}` : a.on);

// ---------- rig 판 표 ----------
// 정의 → 표 { seats: [{ key, name, session, launcher, worktree, extra, orig }], flow: [{ key, from, on, to, max, else, orig }], results: [{ key, value, orig }] }
//   extra: 표에 없는 자리 칸(tools, may, max_live, guide 등)은 그대로 다시 쓴다. orig: 원래 차례(잠금 포인터용, 새 줄은 null)
const SEAT_FIELDS = new Set(['name', 'launcher', 'session', 'worktree']);
let seq = 0;
const newKey = (p) => `${p}${++seq}`;
export function tableFromDef(def) {
  const raw = def && def.seats;
  const seats = seatList(def).map((s, i) => {
    const src = raw && !Array.isArray(raw) ? (raw[s.name] || {}) : s;
    const extra = {};
    for (const [k, v] of Object.entries(src)) if (!SEAT_FIELDS.has(k) && v != null) extra[k] = v;
    // rig.status 모양(maxLive·may 빈 배열 등)은 다시 쓰지 않는다
    if (Array.isArray(raw)) { delete extra.maxLive; if (Array.isArray(extra.may) && !extra.may.length) delete extra.may; if (extra.tools == null) delete extra.tools; delete extra.guide; }
    return { key: newKey('s'), name: s.name, session: s.session === 'keep' ? 'keep' : 'fresh', launcher: s.launcher || '', worktree: !!s.worktree, extra, orig: s.name };
  });
  const flow = (Array.isArray(def && def.flow) ? def.flow : []).map((l, i) => ({ key: newKey('f'), from: l.from || '', on: l.on || '', to: toList(l.to).join(', '), max: l.max == null ? '' : String(l.max), else: l.else || '', orig: l.index != null ? l.index : i }));
  const results = (Array.isArray(def && def.results) ? def.results : []).map((v, i) => ({ key: newKey('r'), value: v, orig: i }));
  return { seats, flow, results };
}
export function tableEdit(tb, part, key, field, value) {
  return { ...tb, [part]: tb[part].map((r) => (r.key === key ? { ...r, [field]: value } : r)) };
}
export function tableAdd(tb, part, defaults = {}) {
  const row = part === 'seats' ? { key: newKey('s'), name: '', session: 'fresh', launcher: defaults.launcher || '', worktree: false, extra: {}, orig: null }
    : part === 'flow' ? { key: newKey('f'), from: '', on: 'ok', to: '', max: '', else: '', orig: null }
      : { key: newKey('r'), value: '', orig: null };
  return { ...tb, [part]: [...tb[part], row] };
}
export function tableRemove(tb, part, key) { return { ...tb, [part]: tb[part].filter((r) => r.key !== key) }; }

// 잠금: 보호 포인터(JSON 포인터, 예 "/seats/main", "/flow/1/max", "/results")가 그 줄이나 그 줄의 칸, 또는 그 줄을 품은 칸을 가리키면 잠근다
const unesc = (s) => s.replace(/~1/g, '/').replace(/~0/g, '~');
const parts = (p) => String(p || '').split('/').slice(1).map(unesc);
// 줄의 포인터 경로: seats는 원래 이름, flow·results는 원래 차례. 새 줄은 잠그지 않는다(단 칸 전체가 잠기면 더하기도 막는다)
export function rowLocked(locked, part, row, field = null) {
  if (!row || row.orig == null) return false;
  const id = String(row.orig);
  for (const p of locked || []) {
    const ps = parts(p);
    if (!ps.length) return true; // "" 또는 "/"(정의 전체)
    if (ps[0] !== part) continue;
    if (ps.length === 1) return true; // 칸 전체
    if (ps[1] !== id) continue;
    if (ps.length === 2 || field == null) return true; // 줄 전체, 또는 줄 단위로 묻는다
    const f = part === 'flow' && field === 'else' ? 'else' : field;
    if (ps[2] === f) return true;
  }
  return false;
}
// 칸 전체가 잠겼나(더하기를 막는다)
export function partLocked(locked, part) { return (locked || []).some((p) => { const ps = parts(p); return !ps.length || (ps[0] === part && ps.length === 1); }); }
// 지울 수 있나: 잠긴 줄은 못 지우고, flow·results는 잠긴 줄보다 앞의 줄을 지우면 차례가 밀려 포인터가 바뀌므로 막는다
export function canRemove(locked, tb, part, row) {
  if (partLocked(locked, part) || rowLocked(locked, part, row)) return false;
  if (part === 'seats' || row.orig == null) return true;
  const lockedIdx = tb[part].filter((r) => r.orig != null && rowLocked(locked, part, r)).map((r) => r.orig);
  return !lockedIdx.some((i) => i > row.orig);
}

// 표 → rig.save 자료 { seats, flow, results }(rig.json의 그 세 칸 모양). 표 검사(빈 이름 등)에 걸리면 { error: { key, row } }
export function tableToSave(tb) {
  const seats = {};
  for (const r of tb.seats) {
    const name = String(r.name || '').trim();
    if (!name) return { error: { key: 'rigPanel.errSeatName' } };
    if (seats[name]) return { error: { key: 'rigPanel.errSeatDup', vars: { name } } };
    if (!String(r.launcher || '').trim()) return { error: { key: 'rigPanel.errLauncher', vars: { name } } };
    const s = { launcher: String(r.launcher).trim(), session: r.session === 'keep' ? 'keep' : 'fresh' };
    if (r.worktree) s.worktree = true;
    seats[name] = { ...s, ...(r.extra || {}) };
  }
  const flow = [];
  for (const r of tb.flow) {
    const to = String(r.to || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (!r.from || !r.on || !to.length) return { error: { key: 'rigPanel.errFlow' } };
    const l = { from: r.from, on: r.on, to: to.length === 1 ? to[0] : to };
    const max = String(r.max ?? '').trim();
    if (max !== '') {
      const n = Number(max);
      if (!Number.isInteger(n) || n < 1) return { error: { key: 'rigPanel.errMax', vars: { value: max } } };
      l.max = n;
    }
    if (r.else) l.else = r.else;
    flow.push(l);
  }
  const results = [];
  for (const r of tb.results) { const v = String(r.value || '').trim(); if (v) results.push(v); }
  return { seats, flow, results };
}
// 저장할 것이 있나(처음 표와 다르면)
export function tableDirty(a, b) { return JSON.stringify(tableToSave(a)) !== JSON.stringify(tableToSave(b)); }

// 원격 기기는 보기만: 만들기·저장·켜기·앉히기·말로 고치기를 숨긴다
export const canEdit = ({ remote = false } = {}) => !remote;
