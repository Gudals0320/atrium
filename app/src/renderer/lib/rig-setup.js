// P191: 하네스 7단계 — 판 안에서 rig 만들기와 고치기(docs research harness-arch.md 16절). 순수 함수만 둔다(단위 시험 test/p191-lib.test.mjs).
// 판 API(P190): rig.presets(P228), rig.create, rig.describe, rig.get, rig.save, rig.spawnSeat, 이미 있는 rig.enable·rig.seat.
// - 이름표 메뉴 항목(menuEntry): 정의가 없으면 "Rig 만들기", 있으면 "Rig 보기·고치기". 원격 기기는 보기만.
// - 만들기 대화상자(wizard*, P228: rig2-design 11.2·11.3): 세 질문(언제 도나·누가 하나·덧붙임)과 바로가기 둘 → rig.create { answers } → 켜기 전 요약(고리·계기·자리·덧붙임, 자리 권한 줄)
//   → 켜기 확인 → 앉히기 → 끝. 말로 설명하기(제작 세션)는 처음부터 만들거나, 만든 정의를 요약 단계에서 다듬는 길이다. 옛 3자리 틀은 내렸다.
// - 요약 자료(defSummary): 정의 → 고리·자리·덧붙임·권한
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
// P194: 정의의 launcher(런처 id, 런처 이름, 종류 이름)를 화면에 보일 이름으로. 런처 id·이름이면 판의 런처 이름, 종류 이름(claude 등)은 그대로
export function launcherLabel(choices, ref) {
  const v = String(ref || '');
  if (!v) return '';
  const c = (choices || []).find((x) => x.id === v) || (choices || []).find((x) => String(x.name || '').toLowerCase() === v.toLowerCase());
  return c ? c.name : v;
}
// P194: 제작 세션의 보고 글처럼 사람이 읽는 글 안의 런처 id를 판의 런처 이름으로 바꾼다(id가 판의 런처일 때만)
export function namedLaunchers(text, choices) {
  const s = String(text || '');
  const ids = (choices || []).filter((c) => c.id && c.name && c.name !== c.id);
  if (!ids.length) return s;
  const by = new Map(ids.map((c) => [c.id, c.name]));
  const re = new RegExp(`\\b(${ids.map((c) => c.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g');
  return s.replace(re, (m) => by.get(m) || m);
}
// ---------- 만들기 대화상자(P228: 세 질문 + 덧붙임) ----------
// 단계: ask(세 질문과 바로가기) | describe(말로) → building(말로, 제작 세션이 끝날 때까지) → preview(켜기 전 요약) → enable → seat → done
export const WIZARD_STEPS = ['ask', 'describe', 'building', 'preview', 'enable', 'seat', 'done'];
export const ADDS = ['canon', 'ledger', 'sector', 'check', 'review'];
export const SEAT_NAME_RE = /^[a-z][a-z0-9_]{0,23}$/;
const clone = (x) => JSON.parse(JSON.stringify(x));
// 판이 rig.presets를 주기 전에도 쓰는 기본 답(백엔드 rig-presets.mjs DEFAULT_ANSWERS와 같은 모양)
export const FALLBACK_ANSWERS = {
  shortcut: null, trigger: 'request', every: '7d', seat: 'main', launcher: '', session: 'keep', permission: 'ask', unattended: false, task: '',
  canon: { on: false, path: 'docs/rules.md' }, ledger: { on: false, path: 'ledger/log.jsonl', improve: false, days: 7 },
  sector: { on: false, path: 'reports/' }, check: { on: false, script: '.atrium/hooks/check.mjs' }, review: { on: false, launcher: '' },
};
// rig.presets 답 → { shortcuts: [{ id, title, desc, answers }](화면 언어), defaults }
export function presetsView(res, lang = 'ko') {
  const ok = res && !res.error;
  const shortcuts = ok ? (res.shortcuts || []).map((x) => (lang === 'en' && x.en ? { ...x, title: x.en.title || x.title, desc: x.en.desc || x.desc } : x)) : [];
  return { shortcuts, defaults: ok && res.defaults ? res.defaults : FALLBACK_ANSWERS, error: res && res.error ? res.error : null };
}
// 검토 자리 런처 기본값: 입구 자리와 다른 종류(harness)의 첫 런처, 없으면 다른 런처, 그것도 없으면 같은 런처
export function reviewLauncherDefault(choices = [], launcher = '') {
  const me = choices.find((c) => c.id === launcher);
  const other = choices.find((c) => me && c.harness && c.harness !== me.harness) || choices.find((c) => c.id !== launcher);
  return other ? other.id : launcher;
}
export function wizardInit({ defaultLauncher = '', status = null, defaults = null, choices = [] } = {}) {
  const answers = { ...clone(defaults || FALLBACK_ANSWERS), launcher: defaultLauncher || '' };
  answers.review = { ...answers.review, launcher: reviewLauncherDefault(choices, answers.launcher) };
  const w = { step: 'ask', answers, text: '', refine: '', builderLauncher: defaultLauncher || '', builder: null, error: null, seatPick: {} };
  // 이미 정의가 있고 꺼져 있으면(말로 만들기 뒤 상자를 닫았다가 다시 연 때 등) 요약부터
  if (status && status.state === 'off') return { ...w, step: 'preview' };
  if (status && status.state === 'on') return { ...w, step: 'seat' };
  return w;
}
// 바로가기를 누르면 답을 채운다(런처는 사람이 고른 것을 그대로 둔다). 그 뒤 무엇이든 바꿀 수 있다
export function wizardApplyShortcut(w, sc) {
  const a = clone(sc.answers || {});
  const answers = { ...clone(FALLBACK_ANSWERS), ...a, shortcut: sc.id, launcher: w.answers.launcher };
  for (const k of ADDS) answers[k] = { ...FALLBACK_ANSWERS[k], ...(a[k] || {}) };
  answers.review.launcher = w.answers.review.launcher;
  return { ...w, answers, error: null };
}
// 답 한 칸 바꾸기. key: 'trigger' | 'every' | 'seat' | … | 'canon.on' | 'ledger.path' …
//   request를 고르면 자리는 keep(요청은 keep 자리의 세션에 온다). 덧붙임 칸은 바로가기 표시를 지우지 않는다(바꿔 쓴 것도 그 바로가기에서 시작한 것)
export function wizardSet(w, key, value) {
  const a = clone(w.answers);
  const [k, f] = key.split('.');
  if (f) a[k] = { ...a[k], [f]: value }; else a[k] = value;
  if (k === 'trigger' && value === 'request') a.session = 'keep';
  if (k === 'trigger' && value === 'every' && !a.every) a.every = '7d';
  if (k === 'permission' && value === 'ask') a.unattended = false;
  return { ...w, answers: a, error: null };
}
// 정해진 때: '1d' | '7d' | '<n>h' ↔ 고르기('1d' | '7d' | 'h')와 시간 수
export const everyMode = (e) => (e === '1d' || e === '7d' ? e : 'h');
export const everyHours = (e) => { const m = /^(\d+)h$/.exec(String(e || '')); return m ? Number(m[1]) : 6; };
export const everyOf = (mode, hours) => (mode === 'h' ? `${Math.max(1, Math.floor(Number(hours) || 1))}h` : mode);
// 다음으로 갈 수 있나(단추를 막을지). ask: 자리 이름·런처, 정해진 때, 켠 덧붙임의 경로
export function answersProblem(a) {
  if (!a) return 'answers';
  if (!SEAT_NAME_RE.test(String(a.seat || ''))) return 'seat';
  if (!a.launcher) return 'launcher';
  if (a.trigger === 'every' && !/^(1d|7d|\d+h)$/.test(String(a.every || ''))) return 'every';
  if (a.trigger === 'every' && /^0+h$/.test(String(a.every))) return 'every';
  if (a.canon.on && !String(a.canon.path || '').trim()) return 'canon';
  if (a.ledger.on && !String(a.ledger.path || '').trim()) return 'ledger';
  if (a.ledger.on && a.ledger.improve && !(Number(a.ledger.days) >= 1)) return 'ledger';
  if (a.sector.on && !String(a.sector.path || '').trim()) return 'sector';
  if (a.check.on && !String(a.check.script || '').trim()) return 'check';
  if (a.review.on && a.seat === 'reviewer') return 'seat';
  return null;
}
export function wizardCanNext(w) {
  if (w.step === 'ask') return !answersProblem(w.answers);
  if (w.step === 'describe') return !!String(w.text || '').trim() && !!w.builderLauncher;
  return true;
}
export function wizardPickDescribe(w) { return { ...w, step: 'describe', error: null }; }
export function wizardBack(w) {
  if (w.step === 'describe') return { ...w, step: 'ask', error: null };
  return w;
}
// 판에 보내는 답(화면에서만 쓰는 칸 없이). 켜지 않은 덧붙임도 그대로 보낸다(판이 on만 본다)
export const apiAnswers = (a) => ({ ...clone(a), review: { ...a.review, launcher: a.review.on ? a.review.launcher || a.launcher : '' } });
// 판 API 부르기 자료: 세 질문이면 rig.create { answers }, 말로면 rig.describe. 요약 단계의 말로 다듬기는 wizardRefineRequest
export function wizardRequest(w, workspace) {
  if (w.step === 'ask') return { method: 'rig.create', params: { workspace, answers: apiAnswers(w.answers) } };
  if (w.step === 'describe') return { method: 'rig.describe', params: { workspace, text: String(w.text).trim(), launcher: w.builderLauncher } };
  return null;
}
export function wizardRefineRequest(w, workspace) {
  const text = String(w.refine || '').trim();
  return text ? { method: 'rig.describe', params: { workspace, text, launcher: w.builderLauncher || w.answers.launcher } } : null;
}
// 부른 결과를 받아 다음 단계로
export function wizardAfterRequest(w, res) {
  if (w.step === 'ask') return { ...w, step: 'preview', created: res || null, error: null };
  if (w.step === 'describe' || w.step === 'preview') return { ...w, step: 'building', refine: '', builder: { session: res && res.session, name: res && res.name, state: 'working' }, error: null };
  return w;
}
// 제작 세션 소식(판 이벤트 rig.builder 또는 rig.get의 builder)과 지금 rig 상태로 building 단계를 넘긴다.
//   맞는 정의가 생겼으면(off·on) 요약으로, 실패·멈춤이면 building에 남아 까닭을 보인다
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

// ---------- 켜기 전 요약(P228, 11.11) ----------
// 정의(rig.json 내용) → { loops, seats, adds, legacy }
//   loops: [{ name, kind, trigger: 'request' | 'every' | 'event' | null, every, entry, produces: [경로], approve }]
//   seats: [{ name, launcher, session, permission: ask|scoped|unattended, allow: [규칙], writes: [경로·문서] | false | null }]
//   adds: { canon: [경로], ledger: [경로], sector: [경로], check: [명령], review: 자리 | null }. legacy: loops 없는 정의(옛 틀 등)
export function defSummary(def) {
  const d = def || {};
  const docs = d.docs && typeof d.docs === 'object' ? d.docs : {};
  const pathOf = (n) => (docs[n] && docs[n].path) || n;
  const seats = seatList(d).map((s) => ({
    name: s.name, launcher: s.launcher || '', session: s.session === 'keep' ? 'keep' : 'fresh',
    permission: ['scoped', 'unattended'].includes(s.permission) ? s.permission : 'ask', allow: Array.isArray(s.allow) ? s.allow : [],
    writes: s.writes === false ? false : Array.isArray(s.writes) ? s.writes.map(pathOf) : null,
  }));
  const loopsRaw = d.loops && typeof d.loops === 'object' ? d.loops : null;
  const loops = loopsRaw ? Object.entries(loopsRaw).map(([name, x]) => {
    const t = (x && x.trigger) || {};
    const trigger = t.request != null ? 'request' : t.every != null ? 'every' : t.event != null ? 'event' : null;
    return { name, kind: (x && x.kind) || 'work', trigger, every: t.every || null, entry: (x && x.entry) || t.request || null, produces: ((x && x.produces) || []).map(pathOf), approve: (x && x.approve) || null };
  }) : [];
  const byRole = (r) => Object.values(docs).filter((x) => x && x.role === r).map((x) => x.path);
  const entries = new Set(loops.map((l) => l.entry));
  const flowTo = loopsRaw ? Object.values(loopsRaw).flatMap((x) => (x && Array.isArray(x.flow) ? x.flow : [])) : [];
  const review = flowTo.find((l) => l.on === 'ok' && entries.has(l.from) && !entries.has([].concat(l.to)[0]));
  const proposals = new Set(loops.filter((l) => l.kind === 'improve').flatMap((l) => l.produces));
  return {
    loops, seats, legacy: !loopsRaw,
    adds: {
      canon: byRole('canon'), ledger: byRole('ledger'), sector: byRole('sector').filter((p) => !proposals.has(p)),
      check: (Array.isArray(d.hooks) ? d.hooks : []).filter((h) => h && h.at === 'done').map((h) => [].concat(h.run || []).join(' ')),
      review: review ? [].concat(review.to)[0] : null,
    },
  };
}
// 자리 권한 줄의 사전 열쇠와 값. unattended는 11.10의 경고 문장(rigPerm.unattended) 그대로
export function permLine(seat) {
  if (seat.permission === 'unattended') return { key: 'rigPerm.unattended', vars: {}, warn: true };
  if (seat.permission === 'scoped') return { key: 'rigPerm.scoped', vars: { n: seat.allow.length }, warn: false };
  return { key: 'rigP228.permAsk', vars: {}, warn: false };
}

// 제작 세션 상태 → 보일 글 열쇠와 값. builder: { session, name, state: working|done|stopped, result: ok|failed, text, why }
export function builderView(b) {
  if (!b) return null;
  const state = b.state === 'done' ? (b.result === 'failed' ? 'failed' : 'ok') : b.state === 'stopped' ? 'stopped' : 'working';
  return { state, name: b.name || '', session: b.session || null, text: (state === 'stopped' ? b.stopWhy || b.why || b.text : b.text || b.why) || '' };
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
  // 같은 자리 사이 같은 방향의 상한 없는 줄은 한 화살표로 모은다(값 이름은 "ok · failed"). 겹쳐 그려지지 않게
  const merged = [];
  for (const a of arrows) {
    const same = a.max == null && merged.find((x) => x.max == null && x.from === a.from && x.to === a.to);
    if (same) { same.ons.push(a.on); same.on = same.ons.join(' · '); continue; }
    merged.push({ ...a, ons: [a.on] });
  }
  const results = Array.isArray(def && def.results) ? def.results : [];
  return { seats: boxes, arrows: merged, results, width: pad * 2 + order.length * box.w + (order.length - 1) * gap, height: top + box.h + pad + 18 };
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
//   P228: loops가 있는 정의(rig 2)는 flow 줄이 고리 안에 있어 맨 위 flow를 보내지 않는다(보내면 정의 오류). loops: 정의에 loops가 있는가
export function tableToSave(tb, { loops = false } = {}) {
  const seats = {};
  for (const r of tb.seats) {
    const name = String(r.name || '').trim();
    if (!name) return { error: { key: 'rigPanel.errSeatName' } };
    if (seats[name]) return { error: { key: 'rigPanel.errSeatDup', vars: { name } } };
    if (!String(r.launcher || '').trim()) return { error: { key: 'rigPanel.errLauncher', vars: { name } } };
    // rig.save는 자리마다 지금 칸 위에 준 칸을 얹는다(null은 그 칸을 뺀다). 그래서 worktree를 끈 자리는 null을 보낸다
    const s = { launcher: String(r.launcher).trim(), session: r.session === 'keep' ? 'keep' : 'fresh', worktree: r.worktree && r.session !== 'keep' ? true : null };
    seats[name] = { ...(r.extra || {}), ...s };
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
  return loops ? { seats, results } : { seats, flow, results };
}
// 저장할 것이 있나(처음 표와 다르면)
export function tableDirty(a, b) { return JSON.stringify(tableToSave(a)) !== JSON.stringify(tableToSave(b)); }

// 원격 기기는 보기만: 만들기·저장·켜기·앉히기·말로 고치기를 숨긴다
export const canEdit = ({ remote = false } = {}) => !remote;
// P195: 끄기는 원격 기기도 한다(저장소의 프로그램을 멈출 뿐이다). 켜기·고치기는 판을 띄운 PC의 창에서만
export const canDisable = () => true;
// P195: rig.get·status의 worktreeGit(정의에 워크트리 자리가 있는데 저장소 조건이 안 됨) → 사전 열쇠
export const seatBlockKey = (g) => (g === 'norepo' ? 'rigP195.seatNoRepo' : g === 'nocommit' ? 'rigP195.seatNoCommit' : null);

// P230(rig2-design 11.12의 6): 정기 점검 바로가기를 저장소가 아닌 워크스페이스에서 고르면 경고한다. git: rig.presets의 git(norepo | nocommit | ok | 없음)
export const checkNoRepo = (a, git) => !!a && a.shortcut === 'check' && git === 'norepo';
// P230(11.12의 9): 요청 계기를 고르면 fresh가 막힌다(request 입구는 keep만). 막힌 fresh 옆에 까닭을 보인다
export const freshBlocked = (a) => !!a && a.trigger === 'request';
