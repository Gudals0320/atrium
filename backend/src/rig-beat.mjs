// P244: rig 3단계 — 박자, 도구의 박자, 사이클 요약과 변경 기록(docs research rig3-skeleton.md 3·4·5·7·8절, rig3-roles.md 12절).
// - 박자: 정의 beat { every, at?, role? }대로 판이 사이클을 연다(rig3_cycles 한 줄, 장부 cycle_open). 켤 때 사이클 0(첫 채움)을 두고, 박자마다 n+1.
//   박자 역할이 있으면 그 세션에 깨우는 글을 대기열로 넣는다(일하는 턴을 끊지 않는다. 아직 넣지 않은 깨우는 글이 있으면 그 글에 더한다).
//   시각: at이 있으면 그날 at에서 every 간격의 칸, 없으면 지난 박자(없으면 켠 때) + every. 판이 꺼졌거나 PC가 잠들어 칸을 놓쳤으면
//   다음 주기에 한 번만 친다(value late). 친 뒤의 다음 칸은 지금 뒤의 칸이라 밀린 것을 몰아 치지 않는다.
//   사람의 손 박자: 판 API rig3.beat(이 PC의 창·사람의 atrium call). 역할 세션의 atrium rig beat는 거절한다.
//   역할 칸 beat(roles.<역할>.beat)는 사이클을 열지 않고 그 역할만 깨운다(장부 role_beat).
// - 도구: v3 정의의 tools를 판이 돌린다. 역할은 atrium rig tool <이름> [인자…]로 자기 도구만 부른다. every가 있는 도구는 판이 시계로 돌리고 역할을 깨우지 않는다.
//   실행은 tool-exec.mjs의 실행기(execTool)와 장부 표(tool_runs)를 쓴다. 출력은 그 도구를 가진 역할의 첫 섹터 tool-logs/<도구>-<실행 ID>.log.
//   실행 시작·끝에 rig3-guard toolBegin·toolEnd를 불러 도구가 쓴 것을 그 역할의 쓰기로 본다.
//   경보: 종료 코드가 0이 아니거나(시간 넘김·못 띄움 포함) 출력 줄이 "ALARM:"으로 시작하면 경보다. 시계 실행의 경보는 가진 역할을 깨운다.
// - 사이클 요약: 박자가 사이클 n을 열면 판이 지난 사이클(n-1)을 장부에서 모은다(길마다 낸 것·받음·반려·pass·drop, 돈 도구, 남의 쓰기 되돌림, 멈춤).
//   그리고 한 번짜리 AI 실행(claude -p, 설정 rig3SummaryModel, 기본 haiku, ANTHROPIC_API_KEY를 뺀 환경)으로 사람이 읽는 한 꼭지를 쓰게 해
//   .atrium/CHANGELOG.md 맨 위에 더한다(판의 쓰기라 guard.accept). P245: 꼭지의 숫자·id·판 번호·시각은 모두 판이 쓰고(entryBody), AI는 칸마다 글만
//   JSON({ summary, ran, roles, decide })으로 돌려준다. 숫자가 든 문장은 판이 지운다(cleanProse). AI가 실패하거나 남는 글이 없으면 숫자만 꼭지.
//   도구 기록은 도구마다 최근 TOOL_LOGS_KEEP(200)개만 남긴다(pruneToolLogs, 실행이 끝날 때).
// - 장부(RIG_BEAT_KINDS): cycle_open(value enable | clock | late | human, n), cycle_entry(value ai | numbers, n), role_tool(value done | failed | alarm, data.by clock | role), role_beat.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { rigEvent } from './rig-ledger.mjs';
import { execTool, rootedRun, readTail, badCmdArg, CMD_SAFE_ARG, findExe, spawnPlan, killTree } from './tool-exec.mjs';
import { cleanEnv } from './proc-env.mjs';
import { HUMAN } from './rig-def.mjs';

export const RIG_BEAT_OPS = ['beat', 'tool'];
export const CHANGELOG = '.atrium/CHANGELOG.md';
export const TOOL_LOG_DIR = 'tool-logs';
export const TOOL_TIMEOUT_MS = 30 * 60 * 1000;
export const TOOL_WAIT_MS = 100000;
export const TOOL_LOG_MAX = 20 * 1024 * 1024;
export const TOOL_LOGS_KEEP = 200; // P245(설계 쪽 덧붙임): 도구마다 tool-logs/에 남기는 최근 기록 파일 수
export const LATE_MS = 60000; // 박자 칸을 이만큼 넘겨 치면 놓친 박자(late)로 남긴다
export const SUMMARY_TIMEOUT_MS = 180000;
export const SUMMARY_MODEL = 'haiku';
export const ENTRY_MAX = 8000; // AI가 쓴 꼭지의 상한(자)
export const ENTRIES_SHOWN = 5;
export const ALARM_RE = /^\s*ALARM:\s*(.*)$/m;
const EMPTY_CHANGELOG = (lang) => (lang === 'en' ? '# rig changelog\n\nThe board adds one section per cycle (newest first).\n\n' : '# rig 변경 기록\n\n판이 사이클마다 한 꼭지를 더한다(새 것이 위).\n\n');

function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t.unref) t.unref(); });
const pad = (n) => String(n).padStart(2, '0');
export const hhmm = (t) => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
export const ymdhm = (t) => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + hhmm(t); };

// 다음 박자 시각. beat: { everyMs, at }, last: 지난 박자(없으면 null), base: 켠 때 → ms
//   at이 있으면 last(없으면 base)가 든 날의 at을 기준으로 every 간격의 칸 가운데 last보다 뒤의 첫 칸
export function nextDue(beat, last, base) {
  const from = last != null ? last : base;
  if (!beat || !beat.everyMs) return null;
  if (!beat.at) return from + beat.everyMs;
  const [h, m] = beat.at.split(':').map(Number);
  const d = new Date(from); d.setHours(h, m, 0, 0);
  const anchor = d.getTime();
  const k = Math.floor((from - anchor) / beat.everyMs) + 1;
  const slot = anchor + k * beat.everyMs;
  // last가 없으면(처음) 켠 때가 칸과 같아도 그 칸을 친다
  return last == null && from === anchor + (k - 1) * beat.everyMs ? from : slot;
}
// P245: 도구 하나의 기록 파일(<도구>-tr<id>.log)을 최근 keep개만 남기고 지운다(수정 시각 순) → 지운 수
export function pruneToolLogs(dir, tool, keep = TOOL_LOGS_KEEP) {
  let names = []; try { names = fs.readdirSync(dir); } catch { return 0; }
  const pre = tool + '-tr';
  const mine = names.filter((n) => n.startsWith(pre) && /^[0-9a-f]+\.log$/.test(n.slice(pre.length))).map((n) => { let t = 0; try { t = fs.statSync(path.join(dir, n)).mtimeMs; } catch {} return { n, t }; });
  if (mine.length <= keep) return 0;
  mine.sort((a, b) => a.t - b.t || (a.n < b.n ? -1 : 1));
  let gone = 0;
  for (const x of mine.slice(0, mine.length - keep)) { try { fs.unlinkSync(path.join(dir, x.n)); gone++; } catch {} }
  return gone;
}
// 출력 꼬리의 경보 줄 → 글 | null
export function alarmOf(tail) { const m = ALARM_RE.exec(String(tail || '')); return m ? (m[1].trim() || 'ALARM') : null; }
// 항목 id 꼴(종류-n)
const ID_IN_TEXT = /\b([a-z][a-z0-9_-]{0,39}-\d{1,9})\b/g;

// ---------- 사이클 요약 ----------
// 장부 줄(그 사이클 구간) → 모은 것. r3: 정의, cycle: { n, from, to, by }
export function collectCycle(r3, rows, cycle) {
  const flows = r3.flows.map((f, i) => ({ index: i, item: f.item, from: f.from, to: f.to, put: 0, redo: 0, intake: 0, accepted: 0, returned: 0, passed: 0, dropped: 0, ids: [] }));
  const flowOfItem = (id, role) => { const m = /^(.*)-\d+$/.exec(String(id || '')); const kind = m ? m[1] : null; return flows.find((f) => f.item === kind && (!role || f.from.includes(role))) || flows.find((f) => f.item === kind) || null; };
  const addId = (f, id) => { if (f && id && !f.ids.includes(id)) f.ids.push(id); };
  const out = { n: cycle.n, from: cycle.from, to: cycle.to, by: cycle.by, flows, returns: [], drops: [], passTurn: {}, tools: {}, foreign: [], nudges: [], stalls: [], gaveUp: [], respawns: 0, deniedWrites: 0, tunes: [], builder: [], decide: [], ids: [] };
  for (const e of rows) {
    const d = e.data || {};
    if (e.kind === 'item_put') { const f = flows[e.line] || flowOfItem(e.ref, e.fromSeat); if (f) { if (e.value === 'redo') f.redo++; else if (e.value === 'intake') { f.intake++; f.put++; } else f.put++; addId(f, e.ref); } }
    else if (e.kind === 'item_accept') { const f = flows[e.line] || flowOfItem(e.ref, e.fromSeat); if (f) { f.accepted++; addId(f, e.ref); } }
    else if (e.kind === 'item_return') { const f = (e.line != null ? flows[e.line] : null) || flowOfItem(e.ref, e.toSeat); if (f) { f.returned++; addId(f, e.ref); } out.returns.push({ id: e.ref, by: e.seat, to: e.toSeat, reason: d.reason || e.text || '', late: e.value === 'late' }); if (e.toSeat === HUMAN) out.decide.push({ what: 'intake_returned', id: e.ref, by: e.seat, reason: d.reason || '' }); }
    else if (e.kind === 'item_pass') { if (e.value === 'turn') out.passTurn[e.seat] = (out.passTurn[e.seat] || 0) + 1; else { const f = flows[e.line] || flowOfItem(e.ref, e.fromSeat); if (f) { f.passed++; addId(f, e.ref); } } }
    else if (e.kind === 'item_drop') { const f = flowOfItem(e.ref, e.seat); if (f) { f.dropped++; addId(f, e.ref); } out.drops.push({ id: e.ref, by: e.seat, reason: d.reason || '' }); }
    else if (e.kind === 'role_tool') {
      const t = out.tools[d.tool] || (out.tools[d.tool] = { name: d.tool, role: e.seat, runs: 0, clock: 0, byRole: 0, failed: 0, alarms: [] });
      t.runs++; if (d.by === 'clock') t.clock++; else t.byRole++;
      if (e.value === 'failed' || e.value === 'alarm') { if (d.exit !== 0) t.failed++; if (d.alarm || e.value === 'alarm') t.alarms.push({ run: e.ref, text: d.alarm || d.error || ('exit ' + d.exit) }); }
    }
    else if (e.kind === 'role_foreign_write') { out.foreign.push({ path: d.path || e.ref, action: e.value, owner: d.owner || null, candidates: d.candidates || (e.seat ? [e.seat] : []) }); if (e.value === 'unrestorable' || e.value === 'failed') out.decide.push({ what: 'foreign_' + e.value, path: d.path || e.ref }); }
    else if (e.kind === 'item_nudge') out.nudges.push({ role: e.seat, items: d.items || [] });
    else if (e.kind === 'item_stalled') { out.stalls.push({ role: e.seat, items: d.items || [] }); out.decide.push({ what: 'stalled', role: e.seat, items: d.items || [], toBuilder: !!d.toBuilder }); }
    else if (e.kind === 'role_gave_up') { out.gaveUp.push(e.seat); out.decide.push({ what: 'gave_up', role: e.seat }); }
    else if (e.kind === 'role_respawn') out.respawns++;
    // P245: 역할이 바꾼 것(조정·고칠 것 없음·사람의 되돌리기)과 빌더에게 올림(사람이 볼 것)
    else if (e.kind === 'role_tune' && e.value === 'applied') out.tunes.push({ kind: 'tune', role: e.seat, n: d.n ?? e.defN ?? null, prevN: d.prevN ?? null, added: d.added || 0, removed: d.removed || 0, why: d.why || '', evidence: d.evidence || [] });
    else if (e.kind === 'role_tune' && e.value === 'none') out.tunes.push({ kind: 'none', role: e.seat, why: d.why || '' });
    else if (e.kind === 'role_rollback') out.tunes.push({ kind: 'rollback', role: e.seat, n: d.n ?? null, from: d.from ?? null, added: d.added || 0, removed: d.removed || 0 });
    else if (e.kind === 'role_raise') out.decide.push({ what: 'raise', role: e.seat, reason: d.reason || '', toBuilder: !!d.toBuilder }); // P247: 빌더에게 전했어도 사람이 볼 것에 남긴다
    else if (e.kind === 'rig_version' && d.changed_by === 'builder') out.builder.push({ n: e.defN ?? e.ref ?? null, changed: d.changed || null }); // P247: 빌더가 고친 판
    else if (e.kind === 'role_write_denied') out.deniedWrites++;
  }
  for (const t of Object.values(out.tools)) if (t.alarms.length >= 2) out.decide.push({ what: 'tool_alarms', tool: t.name, n: t.alarms.length });
  out.tools = Object.values(out.tools);
  out.ids = [...new Set(flows.flatMap((f) => f.ids).concat(out.returns.map((x) => x.id), out.drops.map((x) => x.id), out.stalls.flatMap((x) => x.items), out.nudges.flatMap((x) => x.items), out.tunes.flatMap((x) => x.evidence || [])))]; // P245: 조정의 근거 id
  // 빈 사이클: 항목·도구·되돌림·멈춤이 하나도 없다(역할 세션 띄움 같은 줄은 세지 않는다)
  out.empty = !out.ids.length && !out.tools.length && !out.foreign.length && !out.stalls.length && !out.nudges.length && !out.gaveUp.length && !Object.keys(out.passTurn).length && !out.tunes.length && !out.decide.length && !out.builder.length;
  return out;
}

const L = {
  ko: {
    head: (c) => '## 사이클 ' + c.n + ' · ' + ymdhm(c.from) + ' ~ ' + hhmm(c.to) + (c.n === 0 ? ' (첫 채움)' : c.by === 'human' ? ' (손 박자)' : c.by === 'late' ? ' (놓친 박자)' : ''),
    ran: '**돈 것**', none: '- 없음',
    flow: (f) => '- ' + f.item + ' (' + f.from.map((x) => (x === HUMAN ? '입력 창구' : x)).join('|') + ' → ' + f.to.join('|') + '): 낸 ' + f.put + (f.redo ? ' · 다시 냄 ' + f.redo : '') + ' · 받음 ' + f.accepted + ' · 반려 ' + f.returned + (f.passed ? ' · pass ' + f.passed : '') + (f.dropped ? ' · 버림 ' + f.dropped : '') + (f.ids.length ? ' — ' + f.ids.map((x) => '[' + x + ']').join(' ') : ''),
    ret: (r) => '- 반려 [' + r.id + '] (' + r.by + (r.late ? ', 늦은 반려' : '') + '): ' + r.reason,
    drop: (r) => '- 버림 [' + r.id + '] (' + r.by + '): ' + r.reason,
    pass: (role, n) => '- ' + role + ': 박자에 낼 것 없음 ' + n,
    tools: '**도구**',
    tool: (t) => '- ' + t.name + ' (' + t.role + '): ' + t.runs + '번(시계 ' + t.clock + ', 역할 ' + t.byRole + ')' + (t.alarms.length ? ', 경보 ' + t.alarms.length + ': ' + t.alarms.map((a) => a.text).join(' / ') : ''),
    guard: (f) => '- 남의 쓰기 되돌림: ' + f.path + ' (' + f.action + (f.candidates.length ? ', ' + f.candidates.join('|') : '') + ')',
    stall: (s) => '- 멈춘 역할: ' + s.role + ' (' + s.items.map((x) => '[' + x + ']').join(' ') + ')',
    gaveUp: (r) => '- 다시 띄우기를 그만둔 역할: ' + r,
    roles: '**역할이 바꾼 것**', rolesNone: '- 없음',
    tune: (x) => x.kind === 'none' ? '- ' + x.role + ': 조정 턴에 고칠 것 없음 — ' + x.why : x.kind === 'rollback' ? '- ' + x.role + ' 요령 칸을 사람이 판 ' + x.from + '의 것으로 되돌림 → 판 ' + x.n + ' (+' + x.added + ' −' + x.removed + ')' : '- ' + x.role + ' 요령 칸 판 ' + (x.prevN ?? '-') + '→' + x.n + ' (+' + x.added + ' −' + x.removed + '): ' + x.why + (x.evidence.length ? ' — 근거 ' + x.evidence.map((i) => '[' + i + ']').join(' ') : ''),
    builder: '**빌더가 고친 것**', builderNone: '- 없음',
    bld: (x) => '- 판 ' + (x.n ?? '-') + ': ' + (x.changed && x.changed.length ? x.changed.map((p) => (p === 'rig.json' ? '정의' : p === 'purpose' ? '목적' : String(p).startsWith('role:') ? '정의서 ' + String(p).slice(5) : p)).join(', ') + ' 바뀜' : '정의를 처음 남김'),
    toB: ' (빌더에게 전함)',
    decide: '**사람이 볼 것**',
    dec: (d) => d.what === 'raise' ? '- ' + d.role + '가 요령으로 풀 일이 아니라고 빌더에게 올렸다: ' + d.reason : d.what === 'stalled' ? '- ' + d.role + '가 받은 것에 답하지 않고 멈췄다: ' + d.items.map((x) => '[' + x + ']').join(' ') : d.what === 'gave_up' ? '- ' + d.role + ' 역할 세션이 거듭 끝나 판이 다시 띄우기를 그만뒀다(rig를 껐다 켜면 다시 띄운다)' : d.what === 'intake_returned' ? '- 넣은 입력 [' + d.id + ']가 ' + d.by + '에게 반려됐다: ' + d.reason : d.what === 'tool_alarms' ? '- 도구 ' + d.tool + '가 경보를 ' + d.n + '번 냈다' : '- 되돌리지 못한 남의 쓰기: ' + d.path,
    numbers: '(판이 모은 숫자만으로 썼다)',
  },
  en: {
    head: (c) => '## Cycle ' + c.n + ' · ' + ymdhm(c.from) + ' – ' + hhmm(c.to) + (c.n === 0 ? ' (first fill)' : c.by === 'human' ? ' (manual beat)' : c.by === 'late' ? ' (missed beat)' : ''),
    ran: '**What ran**', none: '- Nothing',
    flow: (f) => '- ' + f.item + ' (' + f.from.map((x) => (x === HUMAN ? 'intake' : x)).join('|') + ' → ' + f.to.join('|') + '): put ' + f.put + (f.redo ? ' · redone ' + f.redo : '') + ' · accepted ' + f.accepted + ' · returned ' + f.returned + (f.passed ? ' · passed ' + f.passed : '') + (f.dropped ? ' · dropped ' + f.dropped : '') + (f.ids.length ? ' — ' + f.ids.map((x) => '[' + x + ']').join(' ') : ''),
    ret: (r) => '- Returned [' + r.id + '] (' + r.by + (r.late ? ', late' : '') + '): ' + r.reason,
    drop: (r) => '- Dropped [' + r.id + '] (' + r.by + '): ' + r.reason,
    pass: (role, n) => '- ' + role + ': nothing to put on the beat ' + n,
    tools: '**Tools**',
    tool: (t) => '- ' + t.name + ' (' + t.role + '): ' + t.runs + ' runs (clock ' + t.clock + ', role ' + t.byRole + ')' + (t.alarms.length ? ', alarms ' + t.alarms.length + ': ' + t.alarms.map((a) => a.text).join(' / ') : ''),
    guard: (f) => '- Foreign write undone: ' + f.path + ' (' + f.action + (f.candidates.length ? ', ' + f.candidates.join('|') : '') + ')',
    stall: (s) => '- Stalled role: ' + s.role + ' (' + s.items.map((x) => '[' + x + ']').join(' ') + ')',
    gaveUp: (r) => '- Gave up respawning: ' + r,
    roles: '**What roles changed**', rolesNone: '- Nothing',
    tune: (x) => x.kind === 'none' ? '- ' + x.role + ': nothing to tune — ' + x.why : x.kind === 'rollback' ? '- ' + x.role + ' know-how rolled back by a person to version ' + x.from + ' → version ' + x.n + ' (+' + x.added + ' −' + x.removed + ')' : '- ' + x.role + ' know-how version ' + (x.prevN ?? '-') + '→' + x.n + ' (+' + x.added + ' −' + x.removed + '): ' + x.why + (x.evidence.length ? ' — evidence ' + x.evidence.map((i) => '[' + i + ']').join(' ') : ''),
    builder: '**What the builder fixed**', builderNone: '- Nothing',
    bld: (x) => '- Version ' + (x.n ?? '-') + ': ' + (x.changed && x.changed.length ? x.changed.map((p) => (p === 'rig.json' ? 'definition' : p === 'purpose' ? 'purpose' : String(p).startsWith('role:') ? 'role doc ' + String(p).slice(5) : p)).join(', ') + ' changed' : 'definition first recorded'),
    toB: ' (sent to the builder)',
    decide: '**For you to look at**',
    dec: (d) => d.what === 'raise' ? '- ' + d.role + ' raised to the builder (not a know-how fix): ' + d.reason : d.what === 'stalled' ? '- ' + d.role + ' stopped without answering: ' + d.items.map((x) => '[' + x + ']').join(' ') : d.what === 'gave_up' ? '- The ' + d.role + ' role session kept exiting; the board stopped respawning it (turn the rig off and on to retry)' : d.what === 'intake_returned' ? '- Your input [' + d.id + '] was returned by ' + d.by + ': ' + d.reason : d.what === 'tool_alarms' ? '- Tool ' + d.tool + ' raised ' + d.n + ' alarms' : '- Foreign write that could not be undone: ' + d.path,
    numbers: '(written from the board\'s counts only)',
  },
};
// 꼭지 몸(머리 줄 빼고). P245(설계 쪽 덧붙임): 숫자와 id 칸은 모두 판이 쓰고, AI는 칸마다 글(무엇이 왜 바뀌었나)만 쓴다.
//   prose: { summary, ran, roles, decide } — cleanProse를 거친 AI 글(숫자 없음). 없으면 숫자만 꼭지
export const PROSE_SLOTS = ['summary', 'ran', 'roles', 'decide'];
export function entryBody(facts, lang = 'ko', prose = null) {
  const t = L[lang] || L.ko;
  const p = prose || {};
  const say = (k) => (p[k] ? [p[k]] : []);
  const ran = facts.flows.filter((f) => f.put || f.redo || f.accepted || f.returned || f.passed || f.dropped).map(t.flow);
  for (const r of facts.returns) ran.push(t.ret(r));
  for (const r of facts.drops) ran.push(t.drop(r));
  for (const [role, n] of Object.entries(facts.passTurn)) ran.push(t.pass(role, n));
  for (const f of facts.foreign) ran.push(t.guard(f));
  for (const s of facts.stalls) ran.push(t.stall(s));
  for (const r of facts.gaveUp) ran.push(t.gaveUp(r));
  return [
    ...(p.summary ? [p.summary, ''] : []),
    t.ran, ...say('ran'), ...(ran.length ? ran : [t.none]), '',
    ...(facts.tools.length ? [t.tools, ...facts.tools.map(t.tool), ''] : []),
    t.roles, ...say('roles'), ...(facts.tunes.length ? facts.tunes.map(t.tune) : [t.rolesNone]), '',
    t.builder, ...(facts.builder.length ? facts.builder.map((x) => (typeof x === 'string' ? '- ' + x : t.bld(x))) : [t.builderNone]), '',
    t.decide, ...say('decide'), ...(facts.decide.length ? facts.decide.map((d) => t.dec(d) + (d.toBuilder ? t.toB : '')) : [t.none]),
  ].join('\n');
}
// 숫자만으로 쓴 꼭지(AI 글 없음)
export const numbersBody = (facts, lang = 'ko') => entryBody(facts, lang, null);
export const entryHead = (facts, lang = 'ko') => (L[lang] || L.ko).head(facts);
// 한 번짜리 AI 실행에 줄 글: 판이 쓴 꼭지(숫자·id)를 보이고, 칸마다 글만 JSON으로 받는다
export function summaryPrompt(facts, draft, lang = 'ko') {
  const ko = lang !== 'en';
  return [
    ko ? '너는 작업 조직(rig)의 한 사이클 변경 기록에 사람이 읽는 설명 글을 붙인다. 숫자·id·판 번호·시각은 판이 이미 썼다(아래 초안). 도구는 쓰지 않는다.' : 'You add plain-language explanation to one cycle of a work rig\'s changelog. The board already wrote every number, id, version and time (draft below). Use no tools.',
    ko ? '돌려줄 것: JSON 객체 하나만 {"summary": "...", "ran": "...", "roles": "...", "decide": "..."}. summary는 사이클 전체 한두 문장, ran은 돈 것, roles는 역할이 무엇을 왜 바꿨나, decide는 사람이 볼 것을 쉬운 말로. 할 말이 없으면 빈 글.' : 'Reply with one JSON object only: {"summary": "...", "ran": "...", "roles": "...", "decide": "..."}. summary: one or two sentences for the whole cycle; ran: what ran; roles: what roles changed and why; decide: what a person should look at. Plain words. Empty string when there is nothing to say.',
    ko ? '규칙: 숫자(아라비아 숫자)·항목 id·판 번호·시각을 쓰지 않는다(숫자가 든 문장은 판이 지운다). 역할과 항목 종류는 이름으로 말한다. 자료에 없는 것은 지어내지 않는다. 칸마다 세 문장 안.' : 'Rules: never write digits, item ids, version numbers or times (the board deletes any sentence with a digit). Name roles and item kinds by name. Invent nothing that is not in the data. At most three sentences per field.',
    ko ? '한국어로 쓴다.' : 'Write in English.',
    '', ko ? '자료(JSON):' : 'Data (JSON):', JSON.stringify(facts),
    '', ko ? '판이 쓴 초안:' : 'Board draft:', draft,
  ].join('\n');
}
export const PROSE_MAX = 400; // 칸마다 글 상한(자)
// AI 답 → { summary, ran, roles, decide, dropped } | null. 숫자가 든 문장(아라비아·전각 숫자, [ ] 꼴)은 지운다. 남는 글이 없으면 null(숫자만 꼭지)
export function cleanProse(text) {
  let s = String(text || '').replace(/\r\n/g, '\n').trim();
  s = s.replace(/^\x60\x60\x60[a-z]*\n?/i, '').replace(/\n?\x60\x60\x60$/, '').trim();
  let j = null;
  try { j = JSON.parse(s); } catch { const m = /\{[\s\S]*\}/.exec(s); if (m) try { j = JSON.parse(m[0]); } catch { j = null; } }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const out = {}; let dropped = 0; let kept = 0;
  for (const k of PROSE_SLOTS) {
    if (typeof j[k] !== 'string') continue;
    const parts = j[k].replace(/\s+/g, ' ').trim().split(/(?<=[.!?。])\s+/).filter(Boolean);
    const good = parts.filter((x) => { const bad = /[0-9０-９]|\[|\]|^#|^\s*[-*]\s/.test(x); if (bad) dropped++; return !bad; });
    let v = good.join(' ').trim();
    if (v.length > PROSE_MAX) v = v.slice(0, PROSE_MAX - 1) + '…';
    if (v) { out[k] = v; kept++; }
  }
  return kept ? { ...out, dropped } : null;
}
// 변경 기록 파일에 꼭지를 더한다(새 것이 위) → 새 내용
export function addEntry(old, entry, lang = 'ko') {
  const base = old && old.trim() ? old.replace(/\r\n/g, '\n') : EMPTY_CHANGELOG(lang);
  const i = base.search(/^## /m);
  const block = entry.trim() + '\n\n';
  return i < 0 ? base.replace(/\n*$/, '\n\n') + block : base.slice(0, i) + block + base.slice(i);
}

// ---------- 한 번짜리 AI 실행 ----------
// claude -p(구독으로 돈다: ANTHROPIC_API_KEY를 뺀 환경) → { ok, text, meta: { model, ms, inputTokens, outputTokens, costUsd, error } }
export function summaryEnv(base = process.env) {
  const env = cleanEnv(base);
  for (const k of Object.keys(env)) if (k.toUpperCase() === 'ANTHROPIC_API_KEY') delete env[k];
  return env;
}
export function summaryArgs(model) { return ['-p', '--model', model, '--tools', '', '--no-session-persistence', '--output-format', 'json']; }
//   cmd: 띄울 앞 낱말(기본 ['claude']. 시험은 [node, 가짜 스크립트])
export function runClaudeOnce(prompt, { model = SUMMARY_MODEL, cwd, timeoutMs = SUMMARY_TIMEOUT_MS, cmd = ['claude'], env = summaryEnv(), platform = process.platform } = {}) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    let plan;
    try { plan = spawnPlan([...cmd, ...summaryArgs(model)], { cwd, env, platform }); } catch (e) { return resolve({ ok: false, text: '', meta: { model, ms: 0, error: e.message } }); }
    let child; let out = ''; let err = ''; let done = false; let timedOut = false;
    const end = (x) => { if (done) return; done = true; clearTimeout(timer); resolve(x); };
    try { child = spawn(plan.file, plan.args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], windowsVerbatimArguments: plan.verbatim }); }
    catch (e) { return resolve({ ok: false, text: '', meta: { model, ms: 0, error: e.message } }); }
    const timer = setTimeout(() => { timedOut = true; killTree(child, platform); }, timeoutMs);
    child.stdout.on('data', (d) => { if (out.length < 2e6) out += d; });
    child.stderr.on('data', (d) => { if (err.length < 1e5) err += d; });
    child.on('error', (e) => end({ ok: false, text: '', meta: { model, ms: Date.now() - t0, error: e.message } }));
    child.on('close', (code) => {
      const ms = Date.now() - t0;
      if (timedOut) return end({ ok: false, text: '', meta: { model, ms, error: 'timeout' } });
      let j = null; try { j = JSON.parse(out); } catch {}
      const u = j && j.usage ? j.usage : {};
      const meta = { model, ms, exit: code, inputTokens: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) || null, outputTokens: u.output_tokens ?? null, costUsd: j && j.total_cost_usd != null ? j.total_cost_usd : null, error: null };
      if (code !== 0 || !j || j.is_error) return end({ ok: false, text: '', meta: { ...meta, error: (j && j.result) || err.trim().slice(0, 300) || ('exit ' + code) } });
      end({ ok: true, text: String(j.result || ''), meta });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
  });
}

export class RigBeat {
  // b: 백엔드(store, rig, queue, sessions, cfg, features.settings, log). roles: RigRoles(active, sessionsOf, items, guard)
  constructor(b, roles) {
    this.b = b; this.roles = roles;
    this.live = new Map(); // 실행 ID → { key, role, tool, done }
    this.byTool = new Map(); // '<키>|<도구>' → 실행 ID
    this.writing = new Set(); // '<키>|<n>' 쓰는 중인 꼭지
    this.tried = new Set(); // 이번 판 실행에서 꼭지를 쓰려 한 사이클(실패해도 되풀이하지 않는다)
    this.runner = null; // 시험: async (prompt, { model, cwd }) => { ok, text, meta }
    this.execCtx = { logMax: TOOL_LOG_MAX, platform: process.platform, kill: new Map() }; // tool-exec.mjs execTool의 맥락
  }
  store() { return this.b.store; }
  ms(name, dflt) { const v = this.b.cfg && this.b.cfg[name]; return v != null && Number(v) >= 0 ? Number(v) : dflt; }
  settings() { try { return this.b.features && this.b.features.settings ? this.b.features.settings.get() : {}; } catch { return {}; } }
  lang() { return this.settings().language === 'en' ? 'en' : 'ko'; }
  log(m) { if (this.b.log) this.b.log(m); }

  // ---------- 사이클 ----------
  current(key) { try { const c = this.store().lastRig3Cycle(key); return c ? c.n : null; } catch { return null; } }
  // 켤 때: 사이클이 하나도 없으면 사이클 0(첫 채움)을 둔다
  ensureBase(key, now = Date.now()) {
    const st = this.store();
    if (st.lastRig3Cycle(key)) return null;
    rigEvent(this.b, { kind: 'cycle_open', ws: key, n: 0, value: 'enable', actor: 'board', text: '사이클 0(첫 채움): rig를 켬' });
    st.insertRig3Cycle({ ws: key, n: 0, openedAt: now, by: 'enable', openSeq: st.lastRigSeq(key) });
    return 0;
  }
  base(key) { const c = this.store().firstRig3Cycle(key); return c ? c.openedAt : null; }

  // 주기(RigRoles.tick, 켜진 v3 rig마다)
  async tick(key, r, now = Date.now()) {
    const r3 = r.def.rig3;
    this.ensureBase(key, now);
    const st = this.store();
    const base = this.base(key);
    const out = [];
    if (r3.beat) {
      const last = st.rig3ClockLast(key, 'beat');
      const due = nextDue(r3.beat, last, base);
      if (due != null && now >= due) out.push({ beat: await this.strike(key, { by: now - due > this.ms('rig3BeatLateMs', LATE_MS) ? 'late' : 'clock', due, now }) });
    }
    for (const role of Object.values(r3.roles)) {
      if (!role.beat) continue;
      const last = st.rig3ClockLast(key, 'role:' + role.name);
      const due = nextDue(role.beat, last, base);
      if (due == null || now < due) continue;
      st.setRig3Clock(key, 'role:' + role.name, now);
      out.push({ roleBeat: role.name });
      this.wakeRole(key, role.name, [], '박자(' + role.name + ')', now);
      rigEvent(this.b, { kind: 'role_beat', ws: key, seat: role.name, value: now - due > LATE_MS ? 'late' : 'clock', n: this.current(key), actor: 'board', text: role.name + ' 박자' });
    }
    for (const tool of Object.values(r3.tools)) {
      if (!tool.everyMs) continue;
      const owner = this.ownerOf(r3, tool.name); if (!owner) continue;
      const last = st.rig3ClockLast(key, 'tool:' + tool.name);
      const due = nextDue({ everyMs: tool.everyMs, at: null }, last, base);
      if (now < due) continue;
      st.setRig3Clock(key, 'tool:' + tool.name, now);
      if (this.byTool.has(key + '|' + tool.name)) { out.push({ toolSkipped: tool.name }); continue; }
      try { const x = await this.start(key, owner, tool.name, [], { by: 'clock' }); out.push({ tool: tool.name, run: x.id }); }
      catch (e) { this.log('rig3 tool ' + tool.name + ' clock: ' + (e.code || e.message)); }
    }
    this.catchUp(key, r3);
    return out;
  }
  // 박자를 친다(시계·놓친 박자·사람) → { n, prev }
  async strike(key, { by = 'clock', due = null, now = Date.now() } = {}) {
    const r = this.roles.active(key);
    if (!r) throw apiError('rig_off', '이 워크스페이스에 켜진 rig가 없다(박자는 켜진 rig에서 친다).');
    const r3 = r.def.rig3;
    const st = this.store();
    this.ensureBase(key, now);
    const prev = st.lastRig3Cycle(key);
    const n = prev.n + 1;
    rigEvent(this.b, { kind: 'cycle_open', ws: key, n, value: by, actor: by === 'human' ? 'human' : 'board', text: '사이클 ' + n + (by === 'late' ? ' (놓친 박자 ' + (due ? hhmm(due) : '') + '를 한 번 침)' : by === 'human' ? ' (손 박자)' : ''), data: { due, prev: prev.n } });
    st.insertRig3Cycle({ ws: key, n, openedAt: now, by, dueAt: due, openSeq: st.lastRigSeq(key) });
    st.setRig3Clock(key, 'beat', now);
    this.log('rig3 beat ' + key + ' cycle ' + n + ' (' + by + ')');
    if (r3.beat && r3.beat.role) this.wakeRole(key, r3.beat.role, this.toolLines(key, prev.openedAt, now), '박자 — 사이클 ' + n + ' 열림' + (by === 'late' ? '(판이 꺼져 있어 놓친 박자를 지금 한 번 친다)' : by === 'human' ? '(사람이 손으로 침)' : ''), now);
    this.summarize(key, prev.n).catch((e) => this.log('rig3 summary error ' + (e && e.stack || e)));
    this.changed(key);
    return { n, prev: prev.n, by };
  }
  // 판 API rig3.beat(사람)
  async beatNow(key) { return this.strike(key, { by: 'human', now: Date.now() }); }
  // 닫혔는데 꼭지가 없는 사이클(판이 꼭지를 쓰다 꺼짐)을 이어 쓴다(판 실행마다 한 번)
  catchUp(key, r3) {
    let rows = []; try { rows = this.store().rig3CyclesNeedingEntry(key); } catch { rows = []; }
    for (const c of rows) {
      const k = key + '|' + c.n;
      if (this.writing.has(k) || this.tried.has(k)) continue;
      this.summarize(key, c.n).catch((e) => this.log('rig3 summary error ' + (e && e.stack || e)));
    }
  }

  // ---------- 깨우기 ----------
  // 역할 세션에 판 글을 대기열로 넣는다(일하는 턴을 끊지 않는다. 아직 넣지 않은 깨우는 글이 있으면 거기에 더한다)
  wakeRole(key, role, lines, head, now = Date.now()) {
    const items = this.roles.items;
    const extra = lines.length ? lines : ['- 받은 것: ' + this.inboxLine(key, role)];
    return items.notifyLines(key, role, extra, head);
  }
  inboxLine(key, role) { try { const c = this.roles.items.counts(key, role); return c.pending || c.unanswered || c.returned ? '아래 수를 보고 atrium rig inbox' : '없음'; } catch { return '-'; } }
  // 깨우는 글 머리의 사이클 줄(RigItems.wakeText가 부른다)
  cycleLine(key, role) {
    const st = this.store();
    const c = st.lastRig3Cycle ? st.lastRig3Cycle(key) : null;
    if (!c) return null;
    const runs = this.toolRows(key, c.openedAt, Date.now()).filter((e) => e.seat === role);
    const tools = runs.length ? ' 이번 사이클에 돈 네 도구: ' + this.toolSum(runs) + '.' : '';
    return '[Atrium 보드] 사이클 ' + c.n + (c.n === 0 ? '(첫 채움: 섹터가 비어 있으면 먼저 채운다)' : '') + '.' + tools;
  }
  toolRows(key, from, to) { try { return this.store().rigEvents({ ws: key, kinds: ['role_tool'], sinceT: from, limit: 5000 }).filter((e) => e.t < to); } catch { return []; } }
  toolSum(rows) {
    const by = new Map();
    for (const e of rows) { const d = e.data || {}; const x = by.get(d.tool) || { n: 0, alarm: 0, last: null }; x.n++; if (e.value !== 'done') x.alarm++; x.last = e; by.set(d.tool, x); }
    return [...by.entries()].map(([t, x]) => t + ' ' + x.n + '번' + (x.alarm ? '(경보 ' + x.alarm + ')' : '') + ', 마지막 ' + (x.last.value === 'done' ? '정상' : x.last.value) + ' ' + ((x.last.data && x.last.data.log) || '')).join('; ');
  }
  // 박자 사이에 돈 도구 줄(박자 역할의 깨우는 글)
  toolLines(key, from, to) {
    const rows = this.toolRows(key, from, to);
    const lines = [rows.length ? '- 이번 박자 사이에 돈 도구: ' + this.toolSum(rows) : '- 이번 박자 사이에 돈 도구: 없음'];
    return lines;
  }

  // ---------- 도구 ----------
  ownerOf(r3, tool) { return Object.values(r3.roles).find((r) => r.tools.includes(tool))?.name || null; }
  // /branch/rig의 beat·tool(rig-admin.mjs verb가 넘긴다)
  async verb(s, o = {}) {
    const op = String(o.op || '');
    if (op === 'beat') throw apiError('forbidden', 'atrium rig beat(손 박자)는 사람만 친다: rig 판의 "지금 박자" 단추나 판 API rig3.beat. 역할은 박자를 치지 않는다(박자에 답할 것이 없으면 atrium rig pass "<까닭>").');
    if (op !== 'tool') throw apiError('bad_request', 'atrium rig: ' + RIG_BEAT_OPS.join(' | ') + ' 가운데 하나다: ' + op);
    if (!s || !s.rigRole) throw apiError('forbidden', 'atrium rig tool은 rig 역할 세션만 쓴다(보드가 rig 역할로 띄운 세션).');
    const r = this.roles.active(s.workspaceKey);
    if (!r) throw apiError('rig_off', '이 워크스페이스에 켜진 rig가 없다(rig는 사람이 보드에서 켠다).');
    const r3 = r.def.rig3; const role = r3.roles[s.rigRole];
    if (!role) throw apiError('forbidden', '이 세션의 역할 ' + s.rigRole + '이 지금 rig 정의에 없다.');
    if (!o.tool) return { role: role.name, tools: role.tools.map((t) => ({ name: t, desc: r3.tools[t].desc || '', run: r3.tools[t].run, every: r3.tools[t].every })) };
    const name = String(o.tool);
    if (!r3.tools[name]) throw apiError('unknown_tool', 'rig에 도구 ' + name + '가 없다. 네 도구: ' + (role.tools.join(', ') || '(없음)'));
    if (!role.tools.includes(name)) throw apiError('forbidden', '도구 ' + name + '는 ' + (this.ownerOf(r3, name) || '다른 역할') + '의 것이다. 역할은 자기 도구만 부른다. 네 도구: ' + (role.tools.join(', ') || '(없음)'));
    const args = Array.isArray(o.args) ? o.args.map(String) : [];
    const x = await this.start(s.workspaceKey, role.name, name, args, { by: 'role', session: s.sessionId });
    const wait = o.waitMs != null ? Number(o.waitMs) : this.ms('rig3ToolWaitMs', TOOL_WAIT_MS);
    await Promise.race([x.done, sleep(Math.max(0, wait))]);
    const row = this.store().getToolRun(x.id);
    const over = row && row.status !== 'running';
    if (!over) this.live.get(x.id) && (this.live.get(x.id).tellRole = s.sessionId);
    return { run: this.pub(row), running: !over };
  }
  pub(row) { if (!row) return null; const tail = row.status !== 'running' ? readTail(row.logPath) : null; return { id: row.id, tool: row.tool, args: row.args, status: row.status, exitCode: row.exitCode, startedAt: row.startedAt, endedAt: row.endedAt, log: row.logPath, tail, alarm: tail != null ? alarmOf(tail) : null, error: row.error }; }
  // 도구 실행을 띄운다 → { id, done: Promise }. by: role | clock
  async start(key, role, name, args, { by = 'role', session = null } = {}) {
    const r = this.roles.active(key);
    if (!r) throw apiError('rig_off', '켜진 rig가 없다');
    const r3 = r.def.rig3; const tool = r3.tools[name]; const owner = r3.roles[role];
    if (!tool || !owner || !owner.tools.includes(name)) throw apiError('forbidden', '도구 ' + name + '는 ' + role + '의 것이 아니다');
    const tk = key + '|' + name;
    if (this.byTool.has(tk)) throw apiError('tool_busy', '도구 ' + name + '의 실행 ' + this.byTool.get(tk) + '이 아직 돈다. 도구마다 한 번에 하나다.', { runId: this.byTool.get(tk) });
    const root = r.root;
    const env = { ...cleanEnv(process.env), ATRIUM_WORKSPACE_ROOT: root, ATRIUM_RIG_ROLE: role, ATRIUM_RIG_TOOL: name, ATRIUM_RIG_CYCLE: String(this.current(key) ?? ''), ATRIUM_RIG_BY: by };
    const runWords = rootedRun(tool.run, root);
    const exe = findExe(runWords[0], { cwd: root, env });
    if (process.platform === 'win32' && exe && /\.(cmd|bat)$/i.test(exe)) { const bad = badCmdArg(args); if (bad != null) throw apiError('cmd_args', '도구 ' + name + '는 .cmd·.bat이라 인자에 쓸 수 없는 글자가 있다: ' + JSON.stringify(String(bad).slice(0, 80)) + '. 쓸 수 있는 글자: ' + CMD_SAFE_ARG.source); }
    const id = 'tr' + crypto.randomBytes(5).toString('hex');
    const sectorRel = owner.owns[0] + TOOL_LOG_DIR + '/' + name + '-' + id + '.log';
    const logPath = path.join(root, sectorRel);
    const startedAt = Date.now();
    const st = this.store();
    st.insertToolRun({ id, sessionId: session || '', workspaceKey: key, tool: name, argv: [...tool.run, ...args], args, cwd: root, rigHash: r.hash || null, status: 'running', startedAt, logPath, hooks: [] });
    this.byTool.set(tk, id);
    const guard = this.roles.guard;
    if (guard && guard.toolBegin) try { guard.toolBegin(key, role, id); } catch (e) { this.log('rig3 guard toolBegin ' + e.message); }
    this.log('rig3 tool ' + name + ' ' + id + ' (' + role + ', ' + by + '): ' + [...runWords, ...args].join(' '));
    const done = execTool(this.execCtx, { id, argv: [...runWords, ...args], cwd: root, env, tool: { ...tool, timeoutMs: this.ms('rig3ToolTimeoutMs', TOOL_TIMEOUT_MS) }, logPath })
      .then((res) => this.finish(key, { id, role, name, by, session, startedAt, logPath, sectorRel, res }))
      .catch((e) => { try { st.updateToolRun(id, { status: 'error', endedAt: Date.now(), error: String(e && e.message || e) }); } catch {} })
      .finally(() => { this.byTool.delete(tk); this.live.delete(id); this.execCtx.kill.delete(id); if (guard && guard.toolEnd) try { guard.toolEnd(key, role, id); } catch (e) { this.log('rig3 guard toolEnd ' + e.message); } });
    this.live.set(id, { key, role, tool: name, done });
    return { id, done };
  }
  finish(key, { id, role, name, by, session, startedAt, logPath, sectorRel, res }) {
    const st = this.store();
    const endedAt = Date.now();
    const tail = readTail(logPath);
    const alarm = alarmOf(tail);
    const failed = res.status !== 'done' || res.exitCode !== 0;
    st.updateToolRun(id, { status: res.status, exitCode: res.exitCode ?? null, endedAt, logBytes: res.bytes, logCut: res.cut, outSha256: res.sha, error: res.error || null });
    const value = alarm ? 'alarm' : failed ? 'failed' : 'done';
    try { const gone = pruneToolLogs(path.dirname(logPath), name, this.ms('rig3ToolLogsKeep', TOOL_LOGS_KEEP)); if (gone) this.log('rig3 tool ' + name + ': 오래된 기록 ' + gone + '개 지움'); } catch (e) { this.log('rig3 tool logs prune ' + e.message); } // P245: 도구마다 최근 기록만
    rigEvent(this.b, { kind: 'role_tool', ws: key, seat: role, session: session || null, n: this.current(key), value, actor: 'board', ref: id, text: name + ' ' + (by === 'clock' ? '(시계) ' : '') + res.status + (res.exitCode != null ? ' 종료 코드 ' + res.exitCode : '') + (alarm ? ' 경보: ' + alarm : ''), data: { tool: name, by, exit: res.exitCode ?? null, status: res.status, alarm, error: res.error || null, ms: endedAt - startedAt, log: sectorRel } });
    this.log('rig3 tool ' + name + ' ' + id + ' ' + res.status + ' exit=' + res.exitCode + (alarm ? ' alarm' : '') + ' ' + (endedAt - startedAt) + 'ms');
    const live = this.live.get(id);
    if (by === 'clock' && (alarm || failed)) this.wakeRole(key, role, ['- 도구 ' + name + '가 ' + (alarm ? '경보를 냈다: ' + alarm : '실패했다(' + (res.error || '종료 코드 ' + res.exitCode) + ')') + '. 출력: ' + sectorRel, ...(tail ? ['  마지막 줄: ' + tail.trim().split('\n').slice(-3).join(' / ').slice(0, 300)] : [])], '도구 경보', endedAt);
    else if (live && live.tellRole) this.wakeRole(key, role, ['- 네가 부른 도구 ' + name + '(' + id + ')가 끝났다: ' + res.status + (res.exitCode != null ? ' 종료 코드 ' + res.exitCode : '') + (alarm ? ', 경보: ' + alarm : '') + '. 출력: ' + sectorRel], '도구 끝남', endedAt);
    this.changed(key);
    return { value, alarm };
  }
  // 보드가 꺼질 때
  stopAll() { for (const [id, k] of this.execCtx.kill) { try { k(); } catch {} try { this.store().updateToolRun(id, { status: 'lost', endedAt: Date.now(), error: '보드가 꺼지며 끝냈다' }); } catch {} } }

  // ---------- 사이클 요약과 변경 기록 ----------
  facts(key, n) {
    const r = this.roles.defOf(key);
    if (!r) return null;
    const st = this.store();
    const c = st.getRig3Cycle(key, n); if (!c) return null;
    const next = st.getRig3Cycle(key, n + 1);
    const to = next ? next.openedAt : Date.now();
    // 구간은 cycle_open 줄의 seq로 자른다(같은 ms의 줄도 갈린다). seq가 없는 옛 줄이면 시각으로
    const rows = c.openSeq != null
      ? st.rigEvents({ ws: key, sinceSeq: c.openSeq - 1, limit: 100000 }).filter((e) => !next || next.openSeq == null || e.seq < next.openSeq)
      : st.rigEvents({ ws: key, sinceT: c.openedAt, limit: 100000 }).filter((e) => e.t < to);
    return collectCycle(r.def.rig3, rows, { n, from: c.openedAt, to, by: c.by });
  }
  // 지난 사이클 n의 꼭지를 쓴다(AI 한 번, 실패하면 숫자만) → { n, by, entry } | null
  async summarize(key, n) {
    const k = key + '|' + n;
    if (this.writing.has(k)) return null;
    const st = this.store();
    const c = st.getRig3Cycle(key, n);
    if (!c || c.entryState === 'done' || c.entryState === 'empty') return null;
    this.writing.add(k); this.tried.add(k);
    try {
      st.setRig3CycleEntry(key, n, { entryState: 'writing' });
      const facts = this.facts(key, n);
      if (!facts) { st.setRig3CycleEntry(key, n, { entryState: null }); return null; }
      if (n === 0 && facts.empty) { st.setRig3CycleEntry(key, n, { entryState: 'empty' }); return null; }
      const skipAi = facts.empty; // 빈 사이클은 AI를 부르지 않고 숫자만(없음)으로 쓴다
      const lang = this.lang();
      const draft = numbersBody(facts, lang);
      let body = null; let meta = null;
      const model = String(this.settings().rig3SummaryModel || this.b.cfg && this.b.cfg.rig3SummaryModel || SUMMARY_MODEL);
      if (skipAi) meta = { model: null, skipped: 'empty' };
      else try {
        const cwd = path.join(this.b.cfg.dataDir || '.', 'rig-summary');
        fs.mkdirSync(cwd, { recursive: true });
        const run = this.runner || ((p, o) => runClaudeOnce(p, o));
        const res = await run(summaryPrompt(facts, draft, lang), { model, cwd });
        meta = res.meta || { model };
        const prose = res.ok ? cleanProse(res.text) : null; // P245: AI는 글만. 숫자가 든 문장은 지운다
        if (prose) { body = entryBody(facts, lang, prose); meta = { ...meta, dropped: prose.dropped }; }
        if (res.ok && !prose) meta = { ...meta, error: 'rejected_body' };
      } catch (e) { meta = { model, error: e.message }; }
      const by = body ? 'ai' : 'numbers';
      const entry = entryHead(facts, lang) + '\n\n' + (body || draft + (skipAi ? '' : '\n\n' + (L[lang] || L.ko).numbers));
      this.writeChangelog(key, entry, lang);
      st.setRig3CycleEntry(key, n, { entryState: 'done', entry, entryBy: by, entryAt: Date.now(), entryMeta: meta });
      rigEvent(this.b, { kind: 'cycle_entry', ws: key, n, value: by, actor: 'board', ref: CHANGELOG, text: '사이클 ' + n + ' 꼭지(' + (by === 'ai' ? 'AI ' + (meta && meta.model || '') : '숫자만' + (meta && meta.error ? ': ' + String(meta.error).slice(0, 80) : '')) + ')', data: { meta, ids: facts.ids } });
      this.log('rig3 cycle ' + n + ' entry ' + by + (meta && meta.ms ? ' ' + meta.ms + 'ms' : '') + (meta && meta.error ? ' (' + meta.error + ')' : ''));
      this.changed(key);
      return { n, by, entry };
    } catch (e) {
      try { st.setRig3CycleEntry(key, n, { entryState: null }); } catch {}
      throw e;
    } finally { this.writing.delete(k); }
  }
  writeChangelog(key, entry, lang) {
    const r = this.roles.defOf(key);
    const root = r && r.root; if (!root) return;
    const f = path.join(root, CHANGELOG);
    let old = ''; try { old = fs.readFileSync(f, 'utf8'); } catch {}
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, addEntry(old, entry, lang));
    const g = this.roles.guard; if (g && g.accept) try { g.accept(key, [CHANGELOG]); } catch (e) { this.log('rig3 guard accept ' + e.message); }
  }

  // ---------- 보기(rig.status의 rig3.cycle) ----------
  view(key, r3) {
    const st = this.store();
    if (!st.lastRig3Cycle) return null;
    const c = st.lastRig3Cycle(key);
    const base = this.base(key);
    const last = st.rig3ClockLast(key, 'beat');
    const nextAt = r3.beat && base != null ? nextDue(r3.beat, last, base) : null;
    const entries = st.rig3CycleEntries(key, ENTRIES_SHOWN).map((x) => ({ n: x.n, at: x.entryAt, by: x.entryBy, text: x.entry }));
    const writing = st.rig3CyclesNeedingEntry(key).filter((x) => this.writing.has(key + '|' + x.n)).map((x) => x.n);
    const tools = Object.values(r3.tools).map((t) => { const l = st.rig3ClockLast(key, 'tool:' + t.name); return { name: t.name, every: t.every, owner: this.ownerOf(r3, t.name), nextAt: t.everyMs && base != null ? nextDue({ everyMs: t.everyMs, at: null }, l, base) : null, running: this.byTool.has(key + '|' + t.name) }; });
    return { n: c ? c.n : null, openedAt: c ? c.openedAt : null, by: c ? c.by : null, beat: r3.beat ? { every: r3.beat.every, at: r3.beat.at, role: r3.beat.role } : null, nextAt, entries, writing, changelog: CHANGELOG, tools };
  }
  changed(key) { if (this.b.api && this.b.api.broadcast) try { this.b.api.broadcast('rig.roles', { workspace: key }); } catch {} }
}

// 판 API(사람만): rig3.beat { workspace } — 손 박자
export function rigBeatHandlers(b) {
  const local = (c, what) => { if (!c || !c.auth || c.auth.kind !== 'local') throw apiError('forbidden', what + '는 이 PC의 보드 창이나 사람의 atrium 명령에서만 한다(판 API 토큰).'); };
  return {
    'rig.beat': async (p, c) => { local(c, '손 박자'); const key = (await b.resolveWorkspace(p && p.workspace)).key; if (!b.rig3 || !b.rig3.beat) throw apiError('rig_off', 'rig가 없다'); return b.rig3.beat.beatNow(key); },
  };
}
