// P245: rig 4단계 — 조정과 되돌리기(docs research rig3-skeleton.md 2절 원리 3·4, 3·6·8·10절, rig3-roles.md 3.1·5절).
// - 재료: 역할마다 받은 반려(item_return, 낸 역할이 그 역할), 사람의 바로잡음(atrium rig heard "<요지>", 장부 role_heard, id heard-<n>),
//   그 역할이 후보였던 되돌린 남의 쓰기(rig3-guard의 role_foreign_write, id write-<장부 seq>). 근거 id는 항목 id(반려)·heard-<n>·write-<seq>다.
// - 조정 턴: 지난 답(tune·tune --none·raise) 뒤 재료가 정의 tune.after건(처음 값 3) 쌓였거나, tune.every사이클(처음 값 5)이 지났고 재료가 하나라도 있으면
//   판이 그 역할 세션에 조정 턴 글을 대기열로 넣는다(쉬면 넣는다. 장부 tune_turn). 글: 재료 목록과 근거 id, 지금 요령 칸, 줄 수 예산, 답 셋.
//   열린 턴은 역할이 답할 때까지 다시 열지 않는다.
// - 답 셋: atrium rig tune --file <새 요령 칸> --why "<한 줄>" --evidence <id…>, atrium rig tune --none "<까닭>", atrium rig raise "<무엇>".
//   tune은 판이 바로 반영하는 조건 셋을 본다: 고정 칸(맡은 것, 받는 것과 내는 것, 기준)이 그대로(파일에 정의서 전체를 주면 고정 칸을 견준다),
//   요령 칸이 줄 수 예산(tune.lines, 처음 값 20) 안, 근거 id가 그 역할의 재료에 실제로 있다. 아니면 거절 까닭을 돌려주고 장부 role_tune value rejected.
//   반영: 정의서의 요령 칸만 바꿔 쓰고(판의 쓰기라 guard.accept), 바뀐 줄 끝에 [v<판> · 근거]를 붙이고, 판(버전)을 올린다(rig.recordNow, by role:<역할>).
//   장부 role_tune(value applied, n 판, data prevN·why·evidence·diff), 기록 rig3_tunes.
// - 판(버전): rig.mjs가 v3 정의의 버전 해시를 정의·목적·모든 정의서의 해시 묶음으로 잡는다(rig3.mjs bundleOf). 정의서만 바뀌어도 판이 오르고 정의 검사가 다시 돈다.
//   rig3_bundle에 판마다 조각 해시, rig3_docs에 내용. 장부 rig_version의 data.changed가 그 판에서 바뀐 조각(role:<역할> 등).
// - 되돌리기(사람만): 판 API rig3.rollback { workspace, role, n } — 정의서 하나의 요령 칸을 판 n의 것으로 되돌린다(고정 칸과 다른 역할의 정의서는 그대로).
//   되돌리기도 새 판이고 장부 role_rollback. 되돌린 역할에게는 다음 깨우는 글에 알린다.
// - P252 올림에 답해 닫기: 빌더 atrium rig answer <올림> "<까닭>", 사람 판 API rig.raiseAnswer { workspace, raise, text }(rig 판의 올림 줄). 장부 raise_answer, 기록 rig3_tunes kind answer.
// - 보기: atrium rig role [<역할>](정의서와 조정 기록, 누구나 읽기), 판 API rig3.role, rig.status의 역할 줄 tune(판·조정 수·재료 수·열린 턴).
import fs from 'node:fs';
import path from 'node:path';
import { rigEvent } from './rig-ledger.mjs';
import { unifiedDiff } from './rig-diff.mjs';
import { checkRoleDoc, ROLE_DOC_FIXED, memoryDir, HUMAN, BUILDER_ROLE } from './rig-def.mjs';

export const RIG_TUNE_OPS = ['tune', 'raise', 'heard', 'role', 'answer']; // P252: answer(빌더가 올림에 답함)
export const TUNE_SECTION = '요령';
export const TUNE_FILE = 'tune.md'; // 역할이 새 요령 칸을 쓰는 곳(자기 기억 폴더 안)
export const WHY_MAX = 300;
export const HEARD_MAX = 500;
export const TEXT_MAX = 20000; // tune 파일 상한(자)
export const TURN_SHOWN = 20; // 조정 턴 글에 싣는 재료 줄
export const TAG_RE = /\s*\[v\d+(?:\s*·[^\]]*)?\]\s*$/; // 줄 끝 꼬리표 [v4 · hypothesis-3 heard-1]
const MAT_KINDS = ['item_return', 'role_heard', 'role_foreign_write'];
const ANSWER_KINDS = ['role_tune', 'role_raise'];

function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
// P252: 올림에 답해 닫기. 올림 id는 워크스페이스의 올림 차례 raise-<n>(rig3_tunes kind raise를 오래된 것부터 센다).
//   닫힘 둘: 빌더나 사람이 고치지 않고 한 줄로 답함(kind answer, 장부 raise_answer) | 올림 뒤에 빌더나 사람이 고친 판이 생김(P251 그대로).
//   답은 올린 역할의 다음 깨우는 글에 실린다(takeNotices, answer 줄의 state noted → told: 판이 다시 떠도 남는다).
export const RAISE_PREFIX = 'raise-';
// 올림 id 꼴(raise-3 또는 3) → 'raise-3' | null
export function raiseId(v) { const m = /^(?:raise-)?(\d{1,9})$/i.exec(String(v == null ? '' : v).trim()); return m ? RAISE_PREFIX + Number(m[1]) : null; }
// 올림마다 상태(순수). tunes: rig3Tunes(ws) 전부, vers: rigVersions(ws)
//   → [{ id, role, reason, t, state: waiting | answered | fixed, answer: { text, by, t } | null, fixedN }]
export function raiseStates(tunes, vers = []) {
  const all = tunes || [];
  const answers = new Map();
  for (const x of all) if (x.kind === 'answer') for (const id of x.evidence || []) if (!answers.has(id)) answers.set(id, x);
  return all.filter((x) => x.kind === 'raise').map((x, i) => {
    const id = RAISE_PREFIX + (i + 1);
    const a = answers.get(id) || null;
    const fix = (vers || []).find((v) => v.t > x.t && (v.by === 'builder' || v.by === 'human')) || null;
    const state = a && (!fix || a.t <= fix.t) ? 'answered' : fix ? 'fixed' : 'waiting';
    return { id, role: x.role, reason: x.why || '', t: x.t, state, answer: a ? { text: a.why || '', by: a.by || null, t: a.t } : null, fixedN: fix ? fix.n ?? null : null };
  });
}
// 기다리는 올림만(지도의 빌더 카드 "올림 n"·캔버스 점선·rig 판의 올림 줄) → [{ id, role, reason, t }]
export function waitingRaises(store, key) {
  let tunes = []; let vers = [];
  try { tunes = store.rig3Tunes(key, null) || []; } catch { tunes = []; }
  try { vers = store.rigVersions ? store.rigVersions(key) || [] : []; } catch { vers = []; }
  return raiseStates(tunes, vers).filter((x) => x.state === 'waiting').map((x) => ({ id: x.id, role: x.role, reason: x.reason, t: x.t }));
}
export const ANSWER_MAX = 300;
const clip = (s, n) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

// ---------- 순수 함수 ----------
export const stripTag = (line) => String(line).replace(TAG_RE, '').trimEnd();
// 요령 칸 몸 → 빈 줄을 뺀 줄 배열
export const bodyLines = (body) => String(body || '').replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
export const countLines = (body) => bodyLines(body).length;
// 꼬리표를 뗀 줄로 견주어 같은가
export const sameBody = (a, b) => { const x = bodyLines(a).map(stripTag); const y = bodyLines(b).map(stripTag); return x.length === y.length && x.every((l, i) => l === y[i]); };
// 정의서의 한 칸(## 머리 아래부터 다음 ## 앞까지)을 body로 바꾼다. 머리 줄은 그대로 둔다 → 새 글 | null(칸 없음)
export function replaceSection(doc, name, body) {
  const t = String(doc || '');
  const eol = /\r\n/.test(t) ? '\r\n' : '\n';
  const endNl = /\n$/.test(t);
  const lines = (endNl ? t.replace(/\r?\n$/, '') : t).split(/\r?\n/);
  const isHead = (l) => /^##\s+/.test(l);
  const i = lines.findIndex((l) => { const m = /^##\s+(.+?)\s*$/.exec(l); return m && (m[1] === name || m[1].startsWith(name + ' ') || m[1].startsWith(name + '(')); });
  if (i < 0) return null;
  let j = i + 1; while (j < lines.length && !isHead(lines[j])) j++;
  const add = String(body || '').replace(/\r\n/g, '\n').replace(/\n+$/, '');
  const out = [...lines.slice(0, i + 1), ...(add ? add.split('\n') : []), ...(j < lines.length ? [''] : []), ...lines.slice(j)];
  return out.join(eol) + (endNl ? eol : '');
}
// 역할이 준 새 요령 칸 글 → { ok, body } | { ok: false, code, reason, fixed? }
//   정의서 전체(## 머리가 있음)를 주면 고정 칸을 지금 정의서와 견주고 요령 칸만 꺼낸다. 아니면 글 전체가 요령 칸이다
export function parseTune(curDoc, text) {
  const t = String(text || '').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (!/^##\s/m.test(t)) return { ok: true, body: t.trim() };
  const cur = checkRoleDoc(curDoc); const nd = checkRoleDoc(t);
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const fixed = ROLE_DOC_FIXED.filter((k) => nd.sections[k] == null || norm(nd.sections[k]) !== norm(cur.sections[k]));
  if (fixed.length) return { ok: false, code: 'fixed_changed', fixed, reason: '고정 칸이 바뀌었다: ' + fixed.map((k) => '## ' + k).join(', ') + '. 역할은 요령 칸만 고친다(고정 칸은 사람·빌더가 고친다. 요령으로 풀 일이 아니면 atrium rig raise)' };
  if (nd.sections[TUNE_SECTION] == null) return { ok: false, code: 'no_section', reason: '## ' + TUNE_SECTION + ' 칸이 없다' };
  const extra = (t.match(/^##\s+(.+?)\s*$/gm) || []).map((h) => h.replace(/^##\s+/, '').trim()).filter((h) => !['맡은 것', '받는 것과 내는 것', '기준', '요령'].some((s) => h === s || h.startsWith(s + ' ') || h.startsWith(s + '(')));
  if (extra.length) return { ok: false, code: 'fixed_changed', fixed: extra, reason: '정의서에 없던 칸이 있다: ' + extra.join(', ') + '. 역할은 요령 칸만 고친다' };
  return { ok: true, body: nd.sections[TUNE_SECTION] };
}
// 새 요령 칸에 꼬리표를 붙인다: 지금 칸에 있던 줄(꼬리표를 떼고 같음)은 그 줄 그대로, 새 줄에는 [v<n> · 근거]
export function tagBody(oldBody, newBody, n, ids) {
  const old = new Map(); for (const l of bodyLines(oldBody)) if (!old.has(stripTag(l))) old.set(stripTag(l), l);
  const tag = ' [v' + n + (ids && ids.length ? ' · ' + ids.join(' ') : '') + ']';
  return String(newBody || '').replace(/\r\n/g, '\n').split('\n').map((l) => { const s = stripTag(l); if (!s.trim()) return ''; return old.has(s) ? old.get(s) : s + tag; }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export class RigTune {
  // b: 백엔드(store, rig, queue, sessions, log). roles: RigRoles(active, defOf, sessionsOf, items, beat, guard)
  constructor(b, roles) { this.b = b; this.roles = roles; this.notices = new Map(); /* '<키>|<역할>' → [글] (되돌림 알림, 다음 깨우는 글에) */ }
  store() { return this.b.store; }
  log(m) { if (this.b.log) this.b.log(m); }
  changed(key) { if (this.b.api && this.b.api.broadcast) try { this.b.api.broadcast('rig.roles', { workspace: key }); } catch {} }

  // ---------- 재료와 상태 ----------
  // 그 역할의 재료(sinceSeq 뒤) → [{ id, kind: return | heard | write, text, by, seq, t }]
  materials(key, role, sinceSeq = 0) {
    let rows = [];
    try { rows = this.store().rigEvents({ ws: key, kinds: MAT_KINDS, sinceSeq: sinceSeq || 0, limit: 100000 }) || []; } catch { rows = []; }
    const out = [];
    for (const e of rows) {
      const d = e.data || {};
      if (e.kind === 'item_return' && e.toSeat === role) out.push({ id: e.ref, kind: 'return', by: e.seat, text: d.reason || e.text || '', late: e.value === 'late', seq: e.seq, t: e.t });
      else if (e.kind === 'role_heard' && e.seat === role) out.push({ id: e.ref, kind: 'heard', by: HUMAN, text: d.text || e.text || '', seq: e.seq, t: e.t });
      else if (e.kind === 'role_foreign_write' && e.value !== 'failed' && ((d.candidates || []).includes(role) || e.seat === role)) out.push({ id: 'write-' + e.seq, kind: 'write', by: 'board', text: (d.path || e.ref) + ' (' + e.value + (d.owner ? ', 주인 ' + d.owner : ', 섹터 밖') + ((d.candidates || []).length > 1 ? ', 함께 일한 역할 ' + d.candidates.join('|') : '') + ')', seq: e.seq, t: e.t });
    }
    return out;
  }
  // P247(P245 답): 주기 조정 턴의 재료 — 지난 조정 뒤 그 역할이 받은 답 항목(for가 있는 길로 온 것: 그 역할이 낸 것에 대한 답).
  //   id와 종류만 싣고 내용은 역할이 읽는다. 세기 기준(after)에는 들지 않는다 → [{ id, kind: 'answer', item, by, seq, t }]
  answersOf(key, role, sinceSeq = 0) {
    const r = this.roles.defOf(key); const flows = r ? r.def.rig3.flows : [];
    let rows = [];
    try { rows = this.store().rigEvents({ ws: key, kinds: ['item_put'], sinceSeq: sinceSeq || 0, limit: 100000 }) || []; } catch { rows = []; }
    const out = [];
    for (const e of rows) {
      const f = e.line != null ? flows[e.line] : flows.find((x) => x.item === String(e.ref || '').replace(/-\d+$/, '') && x.from.includes(e.fromSeat || e.seat));
      if (!f || !f.for || !f.to.includes(role) || !e.ref) continue;
      if (out.some((x) => x.id === e.ref)) continue; // 다시 낸 판은 한 번만
      out.push({ id: e.ref, kind: 'answer', item: f.item, for: f.for, by: e.fromSeat || e.seat, seq: e.seq, t: e.t });
    }
    return out;
  }
  // → { lastAnswer, lastTurn, open, since, mats, cycles, answers }
  state(key, role) {
    const st = this.store();
    let ans = []; let turns = [];
    try { ans = (st.rigEvents({ ws: key, kinds: ANSWER_KINDS, limit: 100000, sinceSeq: 0 }) || []).filter((e) => e.seat === role && (e.kind === 'role_raise' || e.value === 'applied' || e.value === 'none')); } catch {}
    try { turns = (st.rigEvents({ ws: key, kinds: ['tune_turn'], limit: 100000, sinceSeq: 0 }) || []).filter((e) => e.seat === role); } catch {}
    const lastAnswer = ans.at(-1) || null; const lastTurn = turns.at(-1) || null;
    const since = lastAnswer ? lastAnswer.seq : 0;
    const open = !!lastTurn && (!lastAnswer || lastTurn.seq > lastAnswer.seq);
    const mats = this.materials(key, role, since);
    // 지난 답 뒤 열린 사이클 수(사이클 0, 첫 채움은 세지 않는다)
    let cycles = 0;
    try { let c = st.lastRig3Cycle(key); while (c && c.n >= 1 && (c.openSeq == null || c.openSeq > since) && cycles < 1000) { cycles++; c = st.getRig3Cycle(key, c.n - 1); } } catch {}
    const answers = this.answersOf(key, role, since); // P247: 주기 턴만의 재료
    return { lastAnswer, lastTurn, open, since, mats, cycles, answers };
  }
  // 조정 턴을 열 때인가 → 'after' | 'every' | null
  // P247: 세기 기준(after)은 반려·바로잡음·되돌린 쓰기만, 주기 기준(every)은 받은 답 항목도 재료로 친다
  due(x, tune) { if (x.open) return null; if (x.mats.length >= tune.after) return 'after'; if (x.cycles >= tune.every && (x.mats.length || (x.answers || []).length)) return 'every'; return null; }

  // 주기(RigRoles.keep): 기준에 닿았으면 조정 턴을 넣는다 → { tuneTurn: [id] } | null
  check(key, role, s, now = Date.now()) {
    const r = this.roles.active(key); if (!r || !s || !this.b.queue) return null;
    const r3 = r.def.rig3; if (!r3.roles[role]) return null;
    let x; try { x = this.state(key, role); } catch (e) { this.log('rig3 tune state ' + e.message); return null; }
    const why = this.due(x, r3.tune);
    if (!why) return null;
    const text = this.turnText(key, r, role, x, why);
    if (!text) return null;
    const q = this.b.queue.enqueue(s.sessionId, text, { origin: { kind: 'board' } });
    const d = this.roles.items && this.roles.items.track ? this.roles.items.track(q) : q;
    const cycle = this.cycle(key);
    rigEvent(this.b, { kind: 'tune_turn', ws: key, seat: role, session: s.sessionId, n: cycle, value: why, actor: 'board', ref: x.mats.map((m) => m.id).join(','), text: role + ' 조정 턴: 재료 ' + x.mats.length + '건' + (x.cycles ? ', 사이클 ' + x.cycles + '번' : '') + ' (' + (why === 'after' ? '재료 ' + r3.tune.after + '건' : r3.tune.every + '사이클') + ')', data: { why, materials: x.mats.map((m) => ({ id: m.id, kind: m.kind })), ...(why === 'every' && (x.answers || []).length ? { answers: x.answers.map((a) => ({ id: a.id, item: a.item })) } : {}), cycles: x.cycles, delivery: d && d.deliveryId } });
    this.log('rig3 tune turn ' + role + ' (' + why + ', ' + x.mats.length + ')');
    this.changed(key);
    return { tuneTurn: x.mats.map((m) => m.id) };
  }
  cycle(key) { try { return this.roles.beat ? this.roles.beat.current(key) : null; } catch { return null; } }
  docOf(r, role) { const rel = r.def.rig3.roles[role].doc; const abs = path.resolve(r.root, rel); let text = null; try { text = fs.readFileSync(abs, 'utf8'); } catch { text = null; } return { rel, abs, text }; }
  turnText(key, r, role, x, why) {
    const r3 = r.def.rig3; const doc = this.docOf(r, role);
    if (doc.text == null) return null;
    const body = checkRoleDoc(doc.text).sections[TUNE_SECTION] || '';
    const kindWord = { return: '반려', heard: '사람의 바로잡음', write: '판이 되돌린 섹터 밖 쓰기' };
    const shown = x.mats.slice(-TURN_SHOWN);
    const f = memoryDir(role) + TUNE_FILE;
    return [
      '[Atrium 보드] rig 조정 턴 — 역할 ' + role + '. 지난 조정 뒤 재료 ' + x.mats.length + '건' + (x.cycles ? ', 사이클 ' + x.cycles + '번' : '') + '(기준: 재료 ' + r3.tune.after + '건 또는 ' + r3.tune.every + '사이클). 새 일보다 먼저 한다.',
      '[Atrium 보드] 재료(근거 id):',
      ...(x.mats.length > shown.length ? ['- …앞의 ' + (x.mats.length - shown.length) + '건은 줄였다'] : []),
      ...shown.map((m) => '- ' + m.id + ' ' + kindWord[m.kind] + (m.kind === 'return' ? '(' + m.by + (m.late ? ', 늦은 반려' : '') + ')' : '') + ': ' + clip(m.text, 300)),
      ...(!x.mats.length ? ['- (반려·바로잡음·되돌린 쓰기는 없다)'] : []),
      // P247(P245 답): 주기 턴에는 지난 조정 뒤 받은 답 항목도 재료다(id와 종류만. 내용은 네가 파일을 읽는다. 되풀이되는 모양을 본다)
      ...(why === 'every' && (x.answers || []).length ? ['[Atrium 보드] 지난 조정 뒤 네가 낸 것에 돌아온 답 항목(근거 id로 쓸 수 있다. 판은 내용을 읽지 않았다. atrium rig inbox나 파일로 읽는다):', ...x.answers.slice(-TURN_SHOWN).map((a) => '- ' + a.id + ' ' + a.item + '(' + a.by + '가 ' + a.for + '에 답함)'), ...(x.answers.length > TURN_SHOWN ? ['- …앞의 ' + (x.answers.length - TURN_SHOWN) + '건은 줄였다'] : [])] : []),
      '[Atrium 보드] 지금 요령 칸(' + countLines(body) + '줄, 예산 ' + r3.tune.lines + '줄, ' + doc.rel + '):',
      body.trim() ? body.trim() : '(비었다)',
      '[Atrium 보드] 셋 가운데 하나로 답한다:',
      '- 고친다: 새 요령 칸 전체(줄 목록)를 ' + f + '에 쓰고 \x60atrium rig tune --file ' + f + ' --why "<한 줄>" --evidence <id> [<id>…]\x60. 판이 새 줄 끝에 [v<판> · 근거]를 붙여 정의서에 반영하고 판을 올린다. 고정 칸(맡은 것, 받는 것과 내는 것, 기준)은 바꾸지 못하고, ' + r3.tune.lines + '줄을 넘으면 합치거나 내린다.',
      '- 고칠 것이 없다: \x60atrium rig tune --none "<까닭>"\x60',
      '- 요령으로 풀 일이 아니다(같은 까닭이 되풀이되거나 책임·길·기준이 바뀌어야 한다): \x60atrium rig raise "<무엇>"\x60',
    ].join('\n');
  }

  // ---------- 명령(역할 세션) ----------
  ctx(s) {
    if (!s || !s.rigRole) throw apiError('forbidden', 'atrium rig tune·raise·heard는 rig 역할 세션만 쓴다(보드가 rig 역할로 띄운 세션).');
    const r = this.roles.active(s.workspaceKey);
    if (!r) throw apiError('rig_off', '이 워크스페이스에 켜진 rig가 없다(rig는 사람이 보드에서 켠다).');
    const role = r.def.rig3.roles[s.rigRole];
    if (!role) throw apiError('forbidden', '이 세션의 역할 ' + s.rigRole + '이 지금 rig 정의에 없다.');
    return { key: s.workspaceKey, r, role };
  }
  async verb(s, o = {}) {
    const op = String(o.op || '');
    if (op === 'role') {
      if (!s || !s.workspaceKey) throw apiError('forbidden', 'atrium rig role은 워크스페이스의 세션만 쓴다.');
      if (o.rollback != null) throw apiError('forbidden', '되돌리기는 사람만 한다: rig 판의 역할 줄에서 [되돌리기], 또는 판 API rig3.rollback. 역할은 요령 칸을 atrium rig tune으로 고친다.');
      const name = o.role || s.rigRole;
      if (!name) throw apiError('bad_request', '역할 이름을 준다: atrium rig role <역할>');
      return this.roleInfo(s.workspaceKey, name);
    }
    if (op === 'answer') { // P252: 빌더 세션만(사람은 rig 판의 올림 줄, 판 API rig.raiseAnswer)
      if (!s || s.rigRole !== BUILDER_ROLE || !s.workspaceKey) throw apiError('forbidden', 'atrium rig answer는 그 워크스페이스의 빌더 세션이 쓴다(사람은 rig 판의 올림 줄에서 답한다).');
      return this.answer(s.workspaceKey, { raise: o.raise, text: o.text, by: 'builder', session: s.sessionId });
    }
    const x = this.ctx(s);
    const who = { role: x.role.name, session: s.sessionId };
    if (op === 'tune') return o.none != null ? this.none(x.key, { ...who, reason: o.none === true ? o.reason : o.none }) : this.tune(x.key, { ...who, text: o.text, file: o.file, why: o.why, evidence: o.evidence });
    if (op === 'raise') return this.raise(x.key, { ...who, reason: o.reason });
    if (op === 'heard') return this.heard(x.key, { ...who, text: o.text });
    throw apiError('bad_request', 'atrium rig: ' + RIG_TUNE_OPS.join(' | ') + ' 가운데 하나다: ' + op);
  }
  heard(key, p) {
    const text = clip(p.text, HEARD_MAX);
    if (!text) throw apiError('bad_request', '사람이 한 말의 요지를 준다: atrium rig heard "<요지>"');
    let n = 1; try { n = (this.store().rigEvents({ ws: key, kinds: ['role_heard'], sinceSeq: 0, limit: 100000 }) || []).length + 1; } catch {}
    const id = 'heard-' + n;
    rigEvent(this.b, { kind: 'role_heard', ws: key, seat: p.role, session: p.session || null, n: this.cycle(key), actor: 'agent', ref: id, text: p.role + ': ' + text, data: { id, text } });
    this.changed(key);
    const x = this.state(key, p.role); const r = this.roles.active(key);
    return { id, materials: x.mats.length, after: r ? r.def.rig3.tune.after : null };
  }
  raise(key, p) {
    const reason = clip(p.reason, WHY_MAX);
    if (!reason) throw apiError('bad_request', '무엇을 올리는지 준다: atrium rig raise "<무엇>"');
    const x = this.state(key, p.role); const ids = x.mats.map((m) => m.id);
    this.store().insertRig3Tune({ ws: key, role: p.role, kind: 'raise', state: 'noted', why: reason, evidence: ids, cycle: this.cycle(key), sessionId: p.session || null, by: 'role:' + p.role, t: Date.now() });
    let id = null; try { id = RAISE_PREFIX + this.store().rig3Tunes(key, null).filter((t) => t.kind === 'raise').length; } catch {} // P252: 올림 id
    // P247: 빌더 세션이 있으면 대기열로 전한다(잠들었으면 깨운다). 변경 기록의 "사람이 볼 것" 줄은 그대로 남는다
    let toBuilder = null; try { toBuilder = this.roles.builder ? this.roles.builder.alert(key, { what: 'raise', id, role: p.role, reason, materials: ids }) : null; } catch {}
    rigEvent(this.b, { kind: 'role_raise', ws: key, seat: p.role, session: p.session || null, n: this.cycle(key), actor: 'agent', ref: ids.join(',') || null, text: p.role + ' → 빌더' + (id ? ' ' + id : '') + ': ' + reason + (toBuilder ? ' (빌더에게 전함)' : ''), data: { id, role: p.role, reason, materials: ids, toBuilder: !!toBuilder } });
    this.changed(key);
    return { raised: true, id, reason, materials: ids, toBuilder: !!toBuilder };
  }
  // P252: 올림에 고치지 않고 답해 닫는다. p: { raise, text, by: builder | human, session? } → { id, role, reason, answer, by }
  answer(key, p) {
    const id = raiseId(p.raise);
    if (!id) throw apiError('bad_request', '올림 id를 준다(raise-<n>): atrium rig answer <올림> "<까닭>"');
    const text = clip(p.text, ANSWER_MAX);
    if (!text) throw apiError('bad_request', '고치지 않는 까닭 한 줄을 준다: atrium rig answer ' + id + ' "<까닭>"');
    const by = p.by === 'human' ? 'human' : 'builder';
    const st = this.store();
    let vers = []; try { vers = st.rigVersions ? st.rigVersions(key) || [] : []; } catch {}
    const all = raiseStates(st.rig3Tunes(key, null) || [], vers);
    const x = all.find((r) => r.id === id);
    if (!x) throw apiError('not_found', '없는 올림: ' + id + '. 기다리는 올림: ' + (all.filter((r) => r.state === 'waiting').map((r) => r.id).join(', ') || '(없음)'));
    if (x.state === 'answered') throw apiError('already', id + '는 이미 답해 닫혔다(' + (x.answer.by === 'human' ? '사람' : '빌더') + ': ' + x.answer.text + ')');
    if (x.state === 'fixed') throw apiError('already', id + '는 그 뒤 고친 판' + (x.fixedN != null ? ' ' + x.fixedN : '') + '이 생겨 이미 닫혔다');
    st.insertRig3Tune({ ws: key, role: x.role, kind: 'answer', state: 'noted', why: text, evidence: [id], cycle: this.cycle(key), sessionId: p.session || null, by, t: Date.now() });
    rigEvent(this.b, { kind: 'raise_answer', ws: key, seat: x.role, session: p.session || null, n: this.cycle(key), value: by, actor: by === 'human' ? 'human' : 'agent', ref: id, text: id + ' ' + x.role + ' ← ' + (by === 'human' ? '사람' : '빌더') + '(고치지 않음): ' + text, data: { raise: id, role: x.role, reason: x.reason, answer: text, by } });
    this.log('rig3 raise answer ' + id + ' (' + x.role + ') by ' + by);
    this.changed(key);
    return { id, role: x.role, reason: x.reason, answer: text, by };
  }
  none(key, p) {
    const reason = clip(p.reason, WHY_MAX);
    if (!reason) throw apiError('bad_request', '고칠 것이 없는 까닭을 준다: atrium rig tune --none "<까닭>"');
    const x = this.state(key, p.role); const ids = x.mats.map((m) => m.id);
    this.store().insertRig3Tune({ ws: key, role: p.role, kind: 'none', state: 'noted', why: reason, evidence: ids, cycle: this.cycle(key), sessionId: p.session || null, by: 'role:' + p.role, t: Date.now() });
    rigEvent(this.b, { kind: 'role_tune', ws: key, seat: p.role, session: p.session || null, n: this.cycle(key), value: 'none', actor: 'agent', ref: ids.join(',') || null, text: p.role + ' 고칠 것 없음: ' + reason, data: { role: p.role, why: reason, materials: ids } });
    this.changed(key);
    return { none: true, reason };
  }
  // 거절: 기록과 장부를 남기고 던진다
  reject(key, p, code, reason) {
    try { this.store().insertRig3Tune({ ws: key, role: p.role, kind: 'tune', state: 'rejected', why: p.why || null, evidence: p.evidence || [], reason: code + ': ' + reason, cycle: this.cycle(key), sessionId: p.session || null, by: 'role:' + p.role, t: Date.now() }); } catch {}
    rigEvent(this.b, { kind: 'role_tune', ws: key, seat: p.role, session: p.session || null, n: this.cycle(key), value: 'rejected', actor: 'board', text: p.role + ' 조정 거절(' + code + '): ' + reason, data: { role: p.role, code, reason, evidence: p.evidence || [] } });
    this.changed(key);
    throw apiError('tune_rejected', '반영하지 않았다(' + code + '): ' + reason, { why: code });
  }
  // 요령 칸 고치기 → { n, prevN, added, removed, diff, lines }
  tune(key, p) {
    const r = this.roles.active(key);
    if (!r) throw apiError('rig_off', '이 워크스페이스에 켜진 rig가 없다.');
    const r3 = r.def.rig3; const role = r3.roles[p.role];
    if (!role) throw apiError('forbidden', '없는 역할: ' + p.role);
    let text = p.text;
    if (text == null) {
      if (!p.file) throw apiError('bad_request', '새 요령 칸 파일을 준다: atrium rig tune --file <파일> --why "<한 줄>" --evidence <id…> (고칠 것이 없으면 --none "<까닭>")');
      const abs = path.resolve(r.root, String(p.file));
      let st = null; try { st = fs.statSync(abs); } catch {}
      if (!st || !st.isFile()) throw apiError('not_found', '파일이 없다: ' + p.file);
      if (st.size > TEXT_MAX * 4) throw apiError('bad_request', '파일이 너무 크다(' + st.size + '바이트)');
      text = fs.readFileSync(abs, 'utf8');
    }
    if (String(text).length > TEXT_MAX) throw apiError('bad_request', '새 요령 칸이 너무 길다(' + String(text).length + '자, ' + TEXT_MAX + '자까지)');
    const why = clip(p.why, WHY_MAX);
    if (!why) throw apiError('bad_request', '까닭 한 줄을 준다: --why "<한 줄>"');
    const evidence = [...new Set((Array.isArray(p.evidence) ? p.evidence : String(p.evidence || '').split(/[\s,]+/)).map((x) => String(x).trim().replace(/^\[|\]$/g, '')).filter(Boolean))];
    const q = { ...p, why, evidence };
    if (!evidence.length) this.reject(key, q, 'no_evidence', '근거 id가 없다: --evidence <id> [<id>…](조정 턴 글의 재료 id: 반려된 항목, heard-<n>, write-<n>)');
    const doc = this.docOf(r, p.role);
    if (doc.text == null) throw apiError('not_found', '정의서를 읽지 못했다: ' + doc.rel);
    const cur = checkRoleDoc(doc.text);
    if (!cur.ok) this.reject(key, q, 'doc_broken', '지금 정의서에 칸이 빠졌다(' + cur.missing.join(', ') + '). 사람·빌더가 고칠 일이다');
    const pt = parseTune(doc.text, text);
    if (!pt.ok) this.reject(key, q, pt.code, pt.reason);
    const oldBody = cur.sections[TUNE_SECTION] || '';
    if (sameBody(oldBody, pt.body)) this.reject(key, q, 'tune_same', '지금 요령 칸과 같다. 고칠 것이 없으면 atrium rig tune --none "<까닭>"');
    const lines = countLines(pt.body);
    if (lines > r3.tune.lines) this.reject(key, q, 'over_budget', '요령 칸이 ' + lines + '줄이다. 예산 ' + r3.tune.lines + '줄 안으로 합치거나 내린다');
    const ids = new Set([...this.materials(key, p.role, 0), ...this.answersOf(key, p.role, 0)].map((m) => m.id)); // P247: 주기 턴의 답 항목도 근거가 된다
    const unknown = evidence.filter((id) => !ids.has(id));
    if (unknown.length) this.reject(key, q, 'no_evidence', '근거가 ' + p.role + '의 재료에 없다: ' + unknown.join(', ') + '. 재료: ' + ([...ids].slice(-12).join(', ') || '(없음)'));
    // 반영: 꼬리표, 요령 칸 바꿔 쓰기, 판 올리기
    const st = this.store();
    const prevN = (st.lastRigVersion(key) || {}).n ?? null;
    const want = (prevN || 0) + 1;
    const tagged = tagBody(oldBody, pt.body, want, evidence);
    const next = replaceSection(doc.text, TUNE_SECTION, tagged);
    let a = this.writeDoc(key, doc, next, { by: 'role:' + p.role, note: 'tune ' + p.role });
    if (!a.ok) this.reject(key, q, 'apply_failed', '판에 반영하지 못했다: ' + a.reason);
    let tagged2 = tagged;
    // P247(P245 답): 꼬리표는 반영된 실제 판 번호다. 쓰기와 판 남기기는 한 걸음(동기)이라 보통 같지만, 그새 다른 판이 먼저 들어왔으면 실제 판으로 다시 찍는다(판이 하나 더 남는다)
    if (a.n != null && a.n !== want) {
      const n1 = a.n;
      tagged2 = tagBody(oldBody, pt.body, n1, evidence);
      const doc2 = { ...doc, text: next };
      const b2 = this.writeDoc(key, doc2, replaceSection(next, TUNE_SECTION, tagged2), { by: 'role:' + p.role, note: 'tune ' + p.role + ' retag' });
      this.log('rig3 tune ' + p.role + ': 꼬리표를 반영된 판 ' + n1 + '으로 다시 찍음(짐작 ' + want + ')' + (b2.ok ? ' → 판 ' + b2.n : ' 실패: ' + b2.reason));
      if (b2.ok) a = { ...b2, tagN: n1 };
      else tagged2 = tagged;
    }
    const diff = unifiedDiff(oldBody, tagged2, { path: doc.rel + '#' + TUNE_SECTION });
    st.insertRig3Tune({ ws: key, role: p.role, kind: 'tune', state: 'applied', n: a.n, prevN, why, evidence, diff: diff.text, added: diff.added, removed: diff.removed, cycle: this.cycle(key), sessionId: p.session || null, by: 'role:' + p.role, t: Date.now() });
    rigEvent(this.b, { kind: 'role_tune', ws: key, defN: a.n, seat: p.role, session: p.session || null, n: this.cycle(key), value: 'applied', actor: 'agent', ref: evidence.join(','), text: p.role + ' 요령 칸 판 ' + (prevN ?? '-') + '→' + a.n + ' (+' + diff.added + ' −' + diff.removed + '): ' + why, data: { role: p.role, n: a.n, prevN, why, evidence, added: diff.added, removed: diff.removed, lines, diff: diff.text.slice(0, 4000) } });
    this.log('rig3 tune ' + p.role + ' v' + prevN + '→v' + a.n);
    this.changed(key);
    return { n: a.n, prevN, added: diff.added, removed: diff.removed, diff: diff.text, lines, budget: r3.tune.lines, doc: doc.rel };
  }
  // 정의서를 판이 쓰고(guard.accept) 새 판으로 남긴다 → rig.recordNow 결과. 실패하면 앞 내용으로 되돌린다
  writeDoc(key, doc, next, { by, note }) {
    const g = this.roles.guard;
    fs.writeFileSync(doc.abs, next);
    if (g && g.accept) try { g.accept(key, [doc.rel]); } catch (e) { this.log('rig3 guard accept ' + e.message); }
    const a = this.b.rig && this.b.rig.recordNow ? this.b.rig.recordNow(key, { by, note }) : { ok: false, reason: '판의 버전 기록이 없다' };
    if (!a.ok) { try { fs.writeFileSync(doc.abs, doc.text); if (g && g.accept) g.accept(key, [doc.rel]); } catch {} }
    try { this.b.rig.read(key); } catch {}
    return a;
  }

  // ---------- 되돌리기(사람) ----------
  // 정의서 하나의 요령 칸을 판 n의 것으로 → { n(새 판), from, unchanged? }
  rollback(key, { role, n, by = 'human' } = {}) {
    const r = this.roles.defOf(key);
    if (!r) throw apiError('rig_off', '이 워크스페이스에 rig 정의가 없다.');
    if (!r.def.rig3.roles[role]) throw apiError('not_found', '없는 역할: ' + role);
    const want = Number(n);
    if (!Number.isInteger(want) || want < 1) throw apiError('bad_request', '되돌릴 판 번호를 준다(1 이상)');
    const st = this.store();
    const sha = st.rig3Bundle(key, want)['role:' + role];
    const old = sha ? st.rig3Doc(key, sha) : null;
    if (old == null) throw apiError('not_found', '판 ' + want + '에 ' + role + ' 정의서가 남아 있지 않다(판 묶음은 P245부터 남는다)');
    const doc = this.docOf(r, role);
    if (doc.text == null) throw apiError('not_found', '정의서를 읽지 못했다: ' + doc.rel);
    const oldBody = checkRoleDoc(old).sections[TUNE_SECTION] || '';
    const curBody = checkRoleDoc(doc.text).sections[TUNE_SECTION] || '';
    const prevN = (st.lastRigVersion(key) || {}).n ?? null;
    if (oldBody.trim() === curBody.trim()) return { unchanged: true, from: want, n: prevN, role };
    const next = replaceSection(doc.text, TUNE_SECTION, oldBody);
    if (next == null) throw apiError('bad_request', '지금 정의서에 ## ' + TUNE_SECTION + ' 칸이 없다');
    const a = this.writeDoc(key, doc, next, { by, note: 'rollback ' + role + ' v' + want });
    if (!a.ok) throw apiError('rollback_failed', '되돌리지 못했다: ' + a.reason);
    const diff = unifiedDiff(curBody, oldBody, { path: doc.rel + '#' + TUNE_SECTION });
    st.insertRig3Tune({ ws: key, role, kind: 'rollback', state: 'applied', n: a.n, prevN, fromN: want, diff: diff.text, added: diff.added, removed: diff.removed, cycle: this.cycle(key), by, t: Date.now() });
    rigEvent(this.b, { kind: 'role_rollback', ws: key, defN: a.n, seat: role, n: this.cycle(key), value: String(want), actor: by === 'human' ? 'human' : 'board', ref: String(a.n), text: role + ' 요령 칸을 판 ' + want + '의 것으로 되돌림 → 판 ' + a.n + ' (+' + diff.added + ' −' + diff.removed + ')', data: { role, from: want, n: a.n, prevN, added: diff.added, removed: diff.removed, diff: diff.text.slice(0, 4000) } });
    const k = key + '|' + role; const l = this.notices.get(k) || [];
    l.push('[Atrium 보드] 사람이 네 정의서(' + doc.rel + ')의 요령 칸을 판 ' + want + '의 것으로 되돌렸다(새 판 ' + a.n + '). 지금 요령 칸:\n' + (oldBody.trim() || '(비었다)'));
    this.notices.set(k, l);
    this.log('rig3 rollback ' + role + ' to v' + want + ' → v' + a.n);
    this.changed(key);
    return { n: a.n, from: want, prevN, role, added: diff.added, removed: diff.removed };
  }
  // 되돌림 알림을 꺼낸다(RigItems 깨우는 글이 붙인다)
  //   P252: 올림에 온 답(answer 줄 state noted)도 붙이고 told로 바꾼다
  takeNotices(key, role) {
    const k = key + '|' + role; const l = this.notices.get(k) || []; this.notices.delete(k);
    let rows = []; try { rows = this.store().rig3Tunes(key, role, { states: ['noted'] }).filter((t) => t.kind === 'answer'); } catch { rows = []; }
    if (rows.length) {
      let byId = new Map(); try { byId = new Map(raiseStates(this.store().rig3Tunes(key, null) || []).map((r) => [r.id, r])); } catch {}
      for (const a of rows) {
        const id = (a.evidence || [])[0]; const r = byId.get(id);
        l.push('[Atrium 보드] 네가 빌더에게 올린 것(' + id + (r && r.reason ? ': "' + clip(r.reason, 160) + '"' : '') + ')에 ' + (a.by === 'human' ? '사람이' : '빌더가') + ' 고치지 않기로 하고 답했다: ' + a.why + ' — 정의·정의서는 그대로다. 같은 일이 되풀이되면 까닭을 더해 다시 올린다.');
        try { this.store().setRig3TuneState(a.id, 'told'); } catch {}
      }
    }
    return l;
  }

  // ---------- 보기 ----------
  // 정의서 조각이 바뀐 판 목록과 마지막으로 바뀐 판
  docVersions(key, role) {
    let h = []; try { h = this.store().rig3PartHistory(key, 'role:' + role); } catch { h = []; }
    const changes = [];
    for (let i = 0; i < h.length; i++) if (i === 0 || h[i].sha !== h[i - 1].sha) changes.push(h[i].n);
    return { n: changes.at(-1) ?? null, changes };
  }
  // rig.status 역할 줄: { n, tunes, rollbacks, raises, rejected, material, open, lines, budget, last }
  roleView(key, r3, role) {
    const st = this.store();
    let log = []; try { log = st.rig3Tunes(key, role); } catch { log = []; }
    let x = null; try { x = this.state(key, role); } catch { x = null; }
    const root = this.b.rig ? this.b.rig.rootOf(key) : null;
    let lines = null; try { lines = countLines(checkRoleDoc(fs.readFileSync(path.resolve(root, r3.roles[role].doc), 'utf8')).sections[TUNE_SECTION]); } catch {}
    const v = this.docVersions(key, role);
    const last = log.filter((t) => t.state !== 'rejected' && t.kind !== 'answer').at(-1) || null; // P252: 올림 답은 역할의 조정이 아니다
    return { n: v.n, tunes: log.filter((t) => t.kind === 'tune' && t.state === 'applied').length, rollbacks: log.filter((t) => t.kind === 'rollback').length, raises: log.filter((t) => t.kind === 'raise').length, rejected: log.filter((t) => t.state === 'rejected').length, material: x ? x.mats.length : 0, open: x ? x.open : false, lines, budget: r3.tune.lines, last: last ? { kind: last.kind, n: last.n, why: last.why, t: last.t } : null };
  }
  // atrium rig role · 판 API rig3.role: 정의서와 요령 칸, 조정 기록, 지금 재료
  roleInfo(key, role) {
    const r = this.roles.defOf(key);
    if (!r) throw apiError('rig_off', '이 워크스페이스에 rig 정의가 없다.');
    const r3 = r.def.rig3;
    if (!r3.roles[role]) throw apiError('not_found', '없는 역할: ' + role + '. 역할: ' + Object.keys(r3.roles).join(', '));
    const doc = this.docOf(r, role);
    const body = doc.text != null ? checkRoleDoc(doc.text).sections[TUNE_SECTION] || '' : null;
    const x = this.state(key, role);
    const v = this.docVersions(key, role);
    const log = this.store().rig3Tunes(key, role).map((t) => ({ id: t.id, kind: t.kind, state: t.state, n: t.n, prevN: t.prevN, fromN: t.fromN, why: t.why, evidence: t.evidence, added: t.added, removed: t.removed, reason: t.reason, cycle: t.cycle, by: t.by, t: t.t, diff: t.diff }));
    return { role, doc: doc.rel, text: doc.text, tune: body, lines: body != null ? countLines(body) : null, budget: r3.tune.lines, after: r3.tune.after, every: r3.tune.every, n: v.n, versions: v.changes, current: (this.store().lastRigVersion(key) || {}).n ?? null, log, materials: x.mats.map((m) => ({ id: m.id, kind: m.kind, text: m.text, by: m.by })), open: x.open, cycles: x.cycles };
  }
}

// 판 API: rig3.role { workspace, role }(읽기), rig3.rollback { workspace, role, n }(사람만: 이 PC의 창·사람의 atrium call)
export function rigTuneHandlers(b) {
  const local = (c, what) => { if (!c || !c.auth || c.auth.kind !== 'local') throw apiError('forbidden', what + '는 이 PC의 보드 창이나 사람의 atrium 명령에서만 한다(판 API 토큰).'); };
  const T = () => { if (!b.rig3 || !b.rig3.tune) throw apiError('rig_off', 'rig가 없다'); return b.rig3.tune; };
  return {
    'rig.role': async (p) => { const key = (await b.resolveWorkspace(p && p.workspace)).key; return T().roleInfo(key, String((p && p.role) || '')); },
    // P252: 사람이 rig 판의 올림 줄에서 답해 닫기 { workspace, raise, text }
    'rig.raiseAnswer': async (p, c) => { local(c, '올림에 답하기'); const key = (await b.resolveWorkspace(p && p.workspace)).key; return T().answer(key, { raise: p && p.raise, text: p && p.text, by: 'human' }); },
    'rig.roleRollback': async (p, c) => { local(c, '정의서 되돌리기'); const key = (await b.resolveWorkspace(p && p.workspace)).key; return T().rollback(key, { role: String((p && p.role) || ''), n: p && p.n, by: 'human' }); },
  };
}
