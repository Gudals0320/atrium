// P224: rig 2의 R6 제안과 승인(docs research rig2-design.md 2절 "제안과 승인", 2.1, 5절 proposal_*, 8절 R6, 9절 Q1, 11.3, 11.5의 4, 11.7).
// - 내기: 켜진 rig의 자리 세션(보통 개선 고리의 입구 자리)이 atrium rig propose --target <정본 문서 | definition> --file <파일> [--why "<까닭>"].
//   파일은 대상의 새 내용 전체가 기본이고, 통합 diff(--- / +++ / @@ 줄)면 제안 때 지금 내용에 적용해 새 내용으로 바꿔 둔다(맞지 않으면 거절).
//   제안 때 대상의 SHA-256과 내용을 함께 적고(rig_proposals), 반영할 때 대상이 그새 바뀌었으면 충돌(failed)이다.
//   제안은 proposals 섹터의 산출물로 등록한다(정의의 섹터 proposals, 없으면 그 고리의 produces 섹터, 그것도 없으면 보드가 쓰는 .atrium/proposals/).
//   그 폴더에 <id>-<대상>.diff(머리 줄 + 통합 diff)를 보드가 쓰고 rig_artifacts에 source proposal로 적는다.
// - 승인 길(Q1): 정본 문서(role canon)는 사람(응답 필요 목록, 휴대폰 포함). 정의(definition)는 고리의 approve가 human이면 사람,
//   아니면 관리자 자리: 관리자 자리가 낸 제안은 바로 반영하고(새 버전), 다른 자리가 낸 제안은 관리자 자리(atrium rig approve|reject)나 사람이 정한다.
// - 반영: 문서는 보드가 새 내용을 쓰고(문서 감시에는 "보드(승인된 제안 반영)"로 남는다) 그 내용을 승인된 내용으로 적는다. 정의는 rig.json을 쓰고 rig.recordNow로
//   새 버전을 남긴다(사람만 고치는 자리를 바꾸면 되돌리고 failed). 거절은 한 줄 까닭과 함께 남아 다음 개선 회의 첫 일 글에 붙는다.
// - 정본 지키기(11.5의 4): 보드가 처음 본 정본 내용을 승인된 내용으로 적고(rig_doc_marks), 승인 없이 바뀌면(사람 손 포함) "승인 안 된 바뀜"으로 두어
//   응답 필요 목록에 [되돌리기](승인된 내용, 없으면 git HEAD) [받아들이기]를 띄운다.
// - 응답 필요 목록(rig.asks): 사람 승인 제안, 승인 안 된 정본 바뀜, 받아들임 human 섹터의 새 산출물. 판 이벤트 rig.asks로 다시 읽는다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { rigEvent } from './rig-ledger.mjs';
import { sectorsFor, sectorsOf, hashArtifact } from './rig-sectors.mjs';
import { shownName } from './session-label.mjs';

export const DEFINITION = 'definition';
export const RIG_JSON = '.atrium/rig.json';
export const DEFAULT_PROPOSALS_DIR = '.atrium/proposals/';
export const PROPOSAL_STATES = ['pending', 'applied', 'rejected', 'failed'];
export const PROPOSAL_MAX = 256 * 1024; // 새 내용 상한
export const WHY_MAX = 300;
export const REASON_MAX = 200;
export const MARK_TEXT_MAX = 512 * 1024; // 승인된 내용을 저장하는 상한(되돌리기용)
export const DIFF_LINES_MAX = 400; // 카드에 싣는 diff 줄
const DIFF_CELLS_MAX = 4e6;
function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const oneLine = (s, max) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
const newId = () => 'p' + crypto.randomBytes(3).toString('hex');

// ---------- 줄 diff(순수 함수) ----------
export function splitLines(s) {
  const t = String(s ?? '');
  if (!t) return { lines: [], eol: '\n', endNl: false };
  const eol = /\r\n/.test(t) ? '\r\n' : '\n';
  const endNl = /\n$/.test(t);
  return { lines: (endNl ? t.replace(/\r?\n$/, '') : t).split(/\r?\n/), eol, endNl };
}
// a, b: 줄 배열 → [{ t: ' ' | '-' | '+', s }]
export function diffLines(a, b) {
  let p = 0; while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0; while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  const A = a.slice(p, a.length - q), B = b.slice(p, b.length - q);
  const mid = [];
  if (A.length * B.length > DIFF_CELLS_MAX) { for (const s of A) mid.push({ t: '-', s }); for (const s of B) mid.push({ t: '+', s }); }
  else {
    const n = A.length, m = B.length, W = m + 1;
    const L = new Int32Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * W + j] = A[i] === B[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) { if (A[i] === B[j]) { mid.push({ t: ' ', s: A[i] }); i++; j++; } else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) mid.push({ t: '-', s: A[i++] }); else mid.push({ t: '+', s: B[j++] }); }
    while (i < n) mid.push({ t: '-', s: A[i++] }); while (j < m) mid.push({ t: '+', s: B[j++] });
  }
  return [...a.slice(0, p).map((s) => ({ t: ' ', s })), ...mid, ...a.slice(a.length - q).map((s) => ({ t: ' ', s }))];
}
// 통합 diff 글 → { text, added, removed } (같으면 text '')
export function unifiedDiff(aText, bText, { path: p = 'file', context = 3 } = {}) {
  const ops = diffLines(splitLines(aText).lines, splitLines(bText).lines);
  let added = 0, removed = 0;
  for (const o of ops) { if (o.t === '+') added++; else if (o.t === '-') removed++; }
  if (!added && !removed) return { text: '', added, removed };
  const out = [`--- a/${p}`, `+++ b/${p}`];
  // 바뀐 줄 둘레 context줄씩 묶어 덩어리로
  const idx = ops.map((o, i) => (o.t !== ' ' ? i : -1)).filter((i) => i >= 0);
  let k = 0;
  while (k < idx.length) {
    let s = Math.max(0, idx[k] - context), e = Math.min(ops.length - 1, idx[k] + context);
    while (k + 1 < idx.length && idx[k + 1] - context <= e + 1) { k++; e = Math.min(ops.length - 1, idx[k] + context); }
    let oa = 1, ob = 1; for (let i = 0; i < s; i++) { if (ops[i].t !== '+') oa++; if (ops[i].t !== '-') ob++; }
    let la = 0, lb = 0; const body = [];
    for (let i = s; i <= e; i++) { const o = ops[i]; if (o.t !== '+') la++; if (o.t !== '-') lb++; body.push(`${o.t}${o.s}`); }
    out.push(`@@ -${la ? oa : oa - 1},${la} +${lb ? ob : ob - 1},${lb} @@`, ...body);
    k++;
  }
  return { text: out.join('\n') + '\n', added, removed };
}
export const isUnifiedDiff = (t) => /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m.test(String(t || '')) && /^(?:---|\+\+\+) /m.test(String(t || ''));
// 통합 diff를 base 글에 적용 → { ok, text } | { ok: false, reason }. 줄 머리 ' ' '-' '+'와 덩어리 머리만 읽는다(다른 줄은 무시)
export function applyUnifiedDiff(base, diff) {
  const B = splitLines(base);
  const hunks = []; let cur = null;
  for (const raw of String(diff).replace(/\r?\n$/, '').split(/\r?\n/)) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(raw);
    if (m) { cur = { oldStart: Number(m[1]), lines: [] }; hunks.push(cur); continue; }
    if (!cur || raw.startsWith('---') || raw.startsWith('+++') || raw.startsWith('\\')) continue;
    const c = raw[0];
    if (c === ' ' || c === '-' || c === '+') cur.lines.push({ t: c, s: raw.slice(1) });
    else if (raw === '') cur.lines.push({ t: ' ', s: '' });
  }
  if (!hunks.length) return { ok: false, reason: 'diff에 덩어리(@@ 줄)가 없다' };
  const lines = B.lines.slice(); let offset = 0; let floor = 0;
  for (let h = 0; h < hunks.length; h++) {
    const hk = hunks[h];
    const old = hk.lines.filter((x) => x.t !== '+').map((x) => x.s);
    const neu = hk.lines.filter((x) => x.t !== '-').map((x) => x.s);
    const want = Math.max(0, (old.length ? hk.oldStart - 1 : hk.oldStart) + offset);
    const at = (i) => i >= floor && i + old.length <= lines.length && old.every((s, j) => lines[i + j] === s);
    let pos = at(want) ? want : -1;
    for (let d = 1; pos < 0 && d <= lines.length; d++) { if (at(want - d)) pos = want - d; else if (at(want + d)) pos = want + d; }
    if (pos < 0) return { ok: false, reason: `diff의 ${h + 1}번째 덩어리(@@ -${hk.oldStart})가 지금 내용과 맞지 않는다. 새 내용 전체를 --file로 준다` };
    lines.splice(pos, old.length, ...neu);
    offset += neu.length - old.length; floor = pos + neu.length;
  }
  const endNl = B.lines.length ? B.endNl : true;
  return { ok: true, text: lines.length ? lines.join(B.eol) + (endNl ? B.eol : '') : '' };
}

const readBuf = (abs) => { try { return fs.readFileSync(abs); } catch { return null; } };
const writeAtomic = (abs, text) => {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.atrium-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, abs);
};
const gitShow = (root, rel) => { try { return execFileSync('git', ['-C', root, 'show', `HEAD:${rel}`], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }).toString('utf8'); } catch { return null; } };

export const proposalsFor = (b) => b.rigProposals || (b.rigProposals = new RigProposals(b));

export class RigProposals {
  constructor(b) { this.b = b; }
  store() { return this.b.store; }
  changed(key) { if (this.b.api && this.b.api.broadcast) try { this.b.api.broadcast('rig.asks', { workspace: key || null }); } catch {} }
  nameOf(sid) { if (!sid) return null; const s = this.b.sessions && this.b.sessions.get(sid); if (s) return shownName(s) || s.name; const r = this.store().getSession ? this.store().getSession(sid) : null; return r ? shownName(r) || r.name : null; }

  // 대상 → { kind: doc | definition, target, rel, abs, doc? }
  targetOf(r, target) {
    const t = String(target ?? '').trim();
    const canon = Object.values((r.def && r.def.docs) || {}).filter((d) => d.role === 'canon' && d.layer === 'project' && d.rel && !d.dir).map((d) => d.name);
    const list = `정본 문서: ${canon.join(', ') || '(없음)'}, 또는 definition(.atrium/rig.json)`;
    if (!t) throw apiError('bad_request', `--target을 준다. ${list}`);
    if (t === DEFINITION) return { kind: 'definition', target: DEFINITION, rel: RIG_JSON, abs: path.join(r.root, RIG_JSON) };
    const d = r.def.docs && Object.prototype.hasOwnProperty.call(r.def.docs, t) ? r.def.docs[t] : null;
    if (!d) throw apiError('bad_request', `그런 문서가 정의에 없다: ${t}. ${list}`);
    if (d.role !== 'canon') throw apiError('bad_request', `${t}는 ${d.role} 문서다. 제안은 정본(role canon)이나 definition을 고친다(장부·섹터는 쥔 쪽이 직접 쓴다). ${list}`);
    if (d.layer !== 'project' || !d.rel) throw apiError('bad_request', `${t}는 저장소 밖(${d.layer} 층) 문서라 R7(층) 전에는 제안으로 고치지 않는다`);
    if (d.dir) throw apiError('bad_request', `${t}는 폴더다. 제안은 파일 하나를 고친다`);
    return { kind: 'doc', target: t, rel: d.rel, abs: path.resolve(r.root, d.rel), doc: d };
  }
  // 제안이 들어갈 섹터 → { name, rel, implicit }
  sectorFor(def, loopName) {
    const secs = sectorsOf(def).filter((s) => s.rel && s.layer === 'project');
    const loop = def && def.loops && loopName ? def.loops[loopName] : null;
    return secs.find((s) => s.name === 'proposals') || (loop && secs.find((s) => (loop.produces || []).includes(s.name))) || { name: 'proposals', rel: DEFAULT_PROPOSALS_DIR, implicit: true };
  }

  // atrium rig propose. caller: 자리 세션. o: { target, text, file, why } → { proposal, applied? }
  propose(caller, o = {}) {
    const st = this.store(); const b = this.b;
    const r = b.rig && caller.workspaceKey ? b.rig.active(caller.workspaceKey) : null;
    if (!r) throw apiError('rig_off', '이 워크스페이스에는 켜진 rig가 없다. 제안은 켜진 rig의 자리 세션이 낸다.');
    if (!caller.rigSeat || !r.def.seats || !r.def.seats[caller.rigSeat]) throw apiError('forbidden', 'atrium rig propose는 rig 자리 세션(보통 개선 고리의 입구 자리)이 낸다. 너는 자리 없는 세션이다.');
    const key = caller.workspaceKey;
    const T = this.targetOf(r, o.target);
    const text = o.text == null ? '' : String(o.text);
    if (!text.trim()) throw apiError('bad_request', '--file에 새 내용(또는 통합 diff)을 준다');
    if (Buffer.byteLength(text, 'utf8') > PROPOSAL_MAX) throw apiError('bad_request', `제안이 너무 크다(${PROPOSAL_MAX}바이트까지)`);
    const baseBuf = readBuf(T.abs);
    const baseText = baseBuf ? baseBuf.toString('utf8') : '';
    let newText = text;
    let form = 'full';
    if (isUnifiedDiff(text)) { const a = applyUnifiedDiff(baseText, text); if (!a.ok) throw apiError('bad_request', `diff를 ${T.rel}에 적용하지 못했다: ${a.reason}`); newText = a.text; form = 'diff'; }
    if (newText === baseText) throw apiError('bad_request', `바뀌는 것이 없다(${T.rel}의 지금 내용과 같다)`);
    if (!newText.trim()) throw apiError('bad_request', '새 내용이 비었다. 문서를 지우는 제안은 받지 않는다');
    if (T.kind === 'definition') {
      let raw; try { raw = JSON.parse(newText.replace(/^\uFEFF/, '')); } catch (e) { throw apiError('bad_request', `정의 제안이 JSON이 아니다: ${e.message}`); }
      const v = b.branch && b.branch.rigAdmin ? b.branch.rigAdmin.check(key, { text: newText, file: '(제안)' }) : { ok: true };
      if (!v.ok) throw apiError('bad_request', `정의 제안이 검사를 지나지 않는다: ${v.reason}`);
      void raw;
    }
    const why = oneLine(o.why, WHY_MAX) || null;
    const ctx = sectorsFor(b).ctxOf(caller) || {};
    const def = ctx.def || r.def;
    const loop = ctx.loop && def.loops ? def.loops[ctx.loop] : null;
    const isMgr = !!(def.manager && caller.rigSeat === def.manager);
    // 정의 제안의 승인 길: 그 회의 고리(회 밖이면 이 자리가 입구인 고리들) 가운데 approve human이 있으면 사람
    const loopsOf = loop ? [loop] : Object.values(def.loops || {}).filter((l) => l.entry === caller.rigSeat);
    const route = T.kind === 'doc' || loopsOf.some((l) => l.approve === 'human') ? 'human' : 'manager';
    const id = newId();
    const newSha = sha(Buffer.from(newText, 'utf8'));
    const diff = unifiedDiff(baseText, newText, { path: T.rel });
    // proposals 섹터에 <id>-<대상>.diff를 쓰고 산출물로 등록한다
    const sec = this.sectorFor(def, ctx.loop || null);
    const fileRel = `${sec.rel}${id}-${T.target}.diff`;
    const fileAbs = path.resolve(r.root, fileRel);
    let artifactId = null;
    try {
      const head = [`# 제안 ${id} · 대상 ${T.target}(${T.rel}) · ${caller.rigSeat} 자리${ctx.loop ? ` · 고리 ${ctx.loop}` : ''}`, `# 까닭: ${why || '-'}`, `# 승인: ${route === 'human' ? '사람' : '관리자 자리'}`, ''].join('\n');
      if (b.rigDocs) b.rigDocs.noteWrite({ abs: fileAbs, board: true, why: 'proposal_file', proposal: id });
      writeAtomic(fileAbs, head + '\n' + diff.text);
      const h = hashArtifact(fileAbs, false);
      artifactId = st.insertArtifact({ workspaceKey: key, sector: sec.name, path: fileRel, dir: false, sha256: h.sha256, size: h.size, loop: ctx.loop || null, caseId: ctx.c ? ctx.c.id : null, unitId: ctx.unit ? ctx.unit.id : null, tryId: ctx.tr ? ctx.tr.id : null, seat: caller.rigSeat, sessionId: caller.sessionId, source: 'proposal', t: Date.now() });
      rigEvent(b, { kind: 'artifact_filed', ws: key, caseId: ctx.c ? ctx.c.id : null, unitId: ctx.unit ? ctx.unit.id : null, seat: caller.rigSeat, session: caller.sessionId, value: sec.name, actor: 'board', ref: String(artifactId), text: `${sec.name}: ${fileRel} (제안 ${id})`, data: { artifact: artifactId, sector: sec.name, path: fileRel, sha256: h.sha256, size: h.size, loop: ctx.loop || null, source: 'proposal', proposal: id, ...(sec.implicit ? { implicit: true } : {}) } });
    } catch (e) { b.log && b.log('rig proposal file error', e.message); }
    const row = st.insertProposal({ id, workspaceKey: key, target: T.target, kind: T.kind, path: T.rel, baseSha: baseBuf ? sha(baseBuf) : null, baseText: baseBuf && baseBuf.length <= MARK_TEXT_MAX ? baseText : null, newText, newSha, why, route, loop: ctx.loop || null, caseId: ctx.c ? ctx.c.id : null, unitId: ctx.unit ? ctx.unit.id : null, seat: caller.rigSeat, sessionId: caller.sessionId, artifactId, file: artifactId ? fileRel : null });
    rigEvent(b, { kind: 'proposal_made', ws: key, caseId: row.caseId, unitId: row.unitId, seat: caller.rigSeat, session: caller.sessionId, value: T.target, actor: 'agent', ref: id, text: `제안 ${id}: ${T.target}${why ? ` · ${why}` : ''} (+${diff.added} −${diff.removed}, 승인 ${route === 'human' ? '사람' : '관리자'})`, data: { proposal: id, target: T.target, kind: T.kind, path: T.rel, route, form, added: diff.added, removed: diff.removed, loop: ctx.loop || null, artifact: artifactId } });
    b.log && b.log(`rig proposal ${key} ${id} ${T.target} by ${caller.rigSeat} route ${route}`);
    let out = { proposal: this.view(row) };
    if (T.kind === 'definition' && route === 'manager' && isMgr) out = { ...this.decide(key, id, 'approve', { by: 'manager', who: caller, auto: true }), autoApplied: true };
    else if (route === 'manager') this.toManager(key, r.def, row);
    this.changed(key);
    return out;
  }
  // 관리자 자리에 알림(정의 제안을 다른 자리가 냈다)
  toManager(key, def, row) {
    const seat = def && def.manager; if (!seat || !this.b.sessions || !this.b.queue) return;
    const to = [...this.b.sessions.values()].filter((s) => s.workspaceKey === key && s.rigSeat === seat && s.sessionId !== row.sessionId);
    for (const s of to) try { this.b.queue.enqueue(s.sessionId, `[Atrium 보드] rig: ${row.seat} 자리가 정의(.atrium/rig.json) 고침을 제안했다(${row.id}${row.why ? `: ${row.why}` : ''}). 보기: atrium rig proposals. 정하기: atrium rig approve ${row.id} 또는 atrium rig reject ${row.id} "<까닭>"`); } catch {}
  }
  // 제안을 낸 세션에 판 알림 한 줄
  //   P232(rig2-design 11.14의 11): 지금 할 일이 없는 알림이다. 그 자리의 다음 회 머리 글에 붙인다(쉬는 keep 세션의 턴을 쓰지 않는다). 자리가 없으면 바로 보낸다
  tell(row, text) {
    const flow = this.b.branch && this.b.branch.flow;
    if (row.seat && flow && flow.noteForSeat && flow.noteForSeat(row.workspaceKey, row.seat, `[Atrium 보드] rig: ${text}`, 'proposal')) return;
    const s = row.sessionId && this.b.sessions ? this.b.sessions.get(row.sessionId) : null;
    if (s && this.b.queue) try { this.b.queue.enqueue(s.sessionId, `[Atrium 보드] rig: ${text}`); } catch {}
  }

  // 정하기. action approve | reject. by: human | device | manager → 제안 보기
  decide(key, id, action, { by = 'human', reason = null, who = null, auto = false } = {}) {
    const st = this.store();
    const row = st.getProposal(String(id || '').trim());
    if (!row || (key && row.workspaceKey !== key)) throw apiError('not_found', `그런 제안이 없다: ${id}`);
    if (row.state !== 'pending') throw apiError('bad_state', `제안 ${row.id}은 이미 정해졌다(${row.state})`);
    if (by === 'manager' && row.route !== 'manager') throw apiError('forbidden', `제안 ${row.id}은 사람이 승인한다(${row.kind === 'doc' ? '정본 문서' : '고리의 approve가 human'}). 관리자 자리는 정하지 못한다`);
    if (!['approve', 'reject'].includes(action)) throw apiError('bad_request', `approve 또는 reject다: ${action}`);
    const k = row.workspaceKey;
    const actor = by === 'manager' ? 'agent' : 'human';
    const base = { ws: k, caseId: row.caseId, unitId: row.unitId, seat: who ? who.rigSeat || null : null, session: who ? who.sessionId : null, ref: row.id };
    if (action === 'reject') {
      const why = oneLine(reason, REASON_MAX);
      if (!why) throw apiError('bad_request', '거절은 한 줄 까닭과 함께 한다(다음 개선 회가 읽는다)');
      st.setProposal(row.id, { state: 'rejected', decidedAt: Date.now(), decidedBy: by, reason: why });
      rigEvent(this.b, { ...base, kind: 'proposal_decided', value: 'rejected', actor, text: `제안 ${row.id}(${row.target}) 거절: ${why}`, data: { proposal: row.id, target: row.target, by, reason: why } });
      if (row.artifactId) { const a = st.getArtifact(row.artifactId); if (a && a.state !== 'superseded') st.setArtifactState(a.id, 'superseded', { why: 'rejected' }); }
      this.tell(row, `제안 ${row.id}(${row.target})이 거절되었다: ${why}. 다음 개선 회의 첫 일 글에 이 까닭이 붙는다.`);
      this.changed(k); sectorsFor(this.b).changed(k);
      return { proposal: this.view(st.getProposal(row.id)) };
    }
    rigEvent(this.b, { ...base, kind: 'proposal_decided', value: 'approved', actor, text: `제안 ${row.id}(${row.target}) 승인${auto ? '(관리자 자리가 낸 정의 제안이라 바로 반영)' : ''}`, data: { proposal: row.id, target: row.target, by, ...(auto ? { auto: true } : {}) } });
    const res = this.apply(row, { by });
    st.setProposal(row.id, { state: res.ok ? 'applied' : 'failed', decidedAt: Date.now(), decidedBy: by, reason: res.ok ? null : res.reason, versionN: res.n ?? null });
    rigEvent(this.b, { ...base, kind: 'proposal_applied', value: res.ok ? 'applied' : res.conflict ? 'conflict' : 'failed', actor: 'board', text: res.ok ? `제안 ${row.id} 반영: ${row.path}${res.n != null ? ` → 정의 버전 ${res.n}` : ''}` : `제안 ${row.id} 반영 못 함: ${res.reason}`, data: { proposal: row.id, target: row.target, path: row.path, before: row.baseSha, after: res.ok ? row.newSha : null, ...(res.n != null ? { version: res.n } : {}), ...(res.ok ? {} : { reason: res.reason }) } });
    if (row.artifactId) { const a = st.getArtifact(row.artifactId); if (a && a.state === 'new') sectorsFor(this.b).accept(k, a, { why: res.ok ? 'approved' : 'decided', actor: 'board', text: res.ok ? '제안이 승인되어 반영됨' : '제안을 승인했지만 반영하지 못함' }); }
    // P232(11.14의 11): 정본 반영은 "정본 <이름>가 바뀌었다(p…). 다시 읽는다"(다음 회 머리)
    if (!auto) this.tell(row, res.ok ? (row.kind === 'doc' ? `정본 ${row.target}(${row.path})가 바뀌었다(제안 ${row.id} 승인·반영). 다시 읽는다.` : `제안 ${row.id}(${row.target})이 승인되어 ${row.path}에 반영되었다${res.n != null ? `(정의 버전 ${res.n})` : ''}.`) : `제안 ${row.id}(${row.target})을 승인했지만 반영하지 못했다: ${res.reason}`);
    else if (!res.ok) this.tell(row, `정의 제안 ${row.id}을 반영하지 못했다: ${res.reason}`);
    this.b.log && this.b.log(`rig proposal ${k} ${row.id} approved by ${by}: ${res.ok ? 'applied' : res.reason}`);
    this.changed(k); sectorsFor(this.b).changed(k);
    if (this.b.broadcastWorkspaces && row.kind === 'definition') try { this.b.broadcastWorkspaces(); } catch {}
    return { proposal: this.view(st.getProposal(row.id)), applied: res.ok, ...(res.ok ? {} : { reason: res.reason }) };
  }
  // 반영 → { ok, n? } | { ok: false, reason, conflict? }
  apply(row, { by }) {
    const b = this.b; const st = this.store();
    const root = b.rig ? b.rig.rootOf(row.workspaceKey) : null;
    if (!root) return { ok: false, reason: '워크스페이스를 찾을 수 없다' };
    const abs = path.resolve(root, row.path);
    const cur = readBuf(abs);
    const curSha = cur ? sha(cur) : null;
    if (curSha !== row.baseSha) return { ok: false, conflict: true, reason: `제안 뒤에 ${row.path}가 바뀌었다(충돌). 지금 내용으로 다시 제안한다` };
    if (row.kind === 'definition') {
      const rig = b.rig;
      try { writeAtomic(abs, row.newText); try { const t = new Date(); fs.utimesSync(abs, t, t); } catch {} } catch (e) { return { ok: false, reason: `rig.json을 쓰지 못했다: ${e.message}` }; }
      const a = rig.recordNow(row.workspaceKey, { by: by === 'manager' ? 'manager' : 'human', note: `proposal ${row.id}` });
      if (!a.ok) { try { if (cur) writeAtomic(abs, cur); } catch {} rig.cache.delete(row.workspaceKey); return { ok: false, reason: a.reason || '정의를 쓰지 않았다' }; }
      return { ok: true, n: a.n ?? null };
    }
    // 정본 문서: 승인된 내용을 먼저 적고(문서 감시가 승인 안 된 바뀜으로 보지 않게) 쓴다
    const big = Buffer.byteLength(row.newText, 'utf8') > MARK_TEXT_MAX;
    st.setDocMark(row.workspaceKey, row.target, { path: row.path, approvedSha: row.newSha, approvedText: big ? null : row.newText, approvedAt: Date.now(), approvedBy: `proposal ${row.id}`, unapprovedSha: null, unapprovedAt: null, unapprovedBy: null });
    if (b.rigDocs) b.rigDocs.noteWrite({ abs, board: true, why: 'proposal', proposal: row.id });
    try { writeAtomic(abs, row.newText); } catch (e) { return { ok: false, reason: `${row.path}를 쓰지 못했다: ${e.message}` }; }
    return { ok: true };
  }

  // ---------- 정본 지키기(11.5의 4) ----------
  // 처음 본 정본 내용을 승인된 내용으로(이미 있으면 그대로)
  //   P232(11.14의 8): 표시가 다른 경로의 것이면(rig를 지우고 다른 경로로 다시 만듦) 지금 내용으로 다시 잡는다
  baseline(key, d, abs) {
    const st = this.store();
    if (!st.docMark) return;
    const m = st.docMark(key, d.name);
    if (m && (!d.rel || !m.path || m.path === d.rel)) return;
    if (m) { this.setBase(key, d, abs, 'path_changed'); return; }
    const buf = readBuf(abs);
    st.setDocMark(key, d.name, { path: d.rel, approvedSha: buf ? sha(buf) : null, approvedText: buf && buf.length <= MARK_TEXT_MAX ? buf.toString('utf8') : null, approvedAt: Date.now(), approvedBy: 'first_seen' });
  }
  // 지금 내용을 승인된 내용으로(승인 안 된 바뀜 표시를 거둔다)
  setBase(key, d, abs, by) {
    const buf = readBuf(abs);
    this.store().setDocMark(key, d.name, { path: d.rel, approvedSha: buf ? sha(buf) : null, approvedText: buf && buf.length <= MARK_TEXT_MAX ? buf.toString('utf8') : null, approvedAt: Date.now(), approvedBy: by, unapprovedSha: null, unapprovedAt: null, unapprovedBy: null });
  }
  // P232(rig2-design 11.9의 8, 11.14의 8): 정본의 기준은 rig를 켤 때의 내용이다(rig.create의 시작 글이 아니다). 켜질 때 정본마다 지금 내용을 승인된 내용으로 잡는다.
  //   만들기와 켜기 사이에 사람이 손으로 쓴 첫 규칙이 "승인 안 된 바뀜"이 되지 않는다. 꺼 둔 동안 바뀐 것도 켤 때의 내용으로 받는다
  onEnabled(key, r) {
    if (!r || !r.def || !r.def.docs || !r.root) return 0;
    let n = 0;
    for (const d of Object.values(r.def.docs)) {
      if (d.role !== 'canon' || !d.rel) continue;
      this.setBase(key, d, path.resolve(r.root, d.rel), 'enabled'); n++;
    }
    if (n) this.changed(key);
    return n;
  }
  // P233(rig2-design 11.15의 6): 켜기 확인 창에 보일 정본 차이. 꺼짐 → 켜짐마다 기준을 다시 잡는 것은 그대로이고,
  //   정본이 마지막 승인 내용(rig_doc_marks.approved_*)과 다르면 [{ doc, path, added, removed, diff, clipped }]. 처음 켤 때(켠 적이 없음)는 견줄 것이 없어 빈 목록
  canonDrift(key, r) {
    const st = this.store();
    if (!r || !r.def || !r.def.docs || !r.root || !st.docMark) return [];
    if (!this.everEnabled(key)) return [];
    const out = [];
    for (const d of Object.values(r.def.docs)) {
      if (d.role !== 'canon' || !d.rel) continue;
      const m = st.docMark(key, d.name);
      if (!m || m.path !== d.rel || (m.approvedSha == null && m.approvedText == null)) continue;
      const buf = readBuf(path.resolve(r.root, d.rel));
      const now = buf ? sha(buf) : null;
      if (now === m.approvedSha) continue;
      const df = m.approvedText != null ? clipDiff(unifiedDiff(m.approvedText, buf ? buf.toString('utf8') : '', { path: d.rel })) : null;
      out.push({ doc: d.name, path: d.rel, added: df ? df.added : null, removed: df ? df.removed : null, ...(df ? { diff: df.text, clipped: df.clipped } : {}), exists: !!buf });
    }
    return out;
  }
  everEnabled(key) {
    const st = this.store();
    try { if (st.rigEvents && st.rigEvents({ ws: key, kinds: ['rig_enabled'], limit: 1 }).length) return true; } catch {}
    try { const s = st.rigState ? st.rigState(key) : null; if (s && s.enabledAt) return true; } catch {}
    return false;
  }
  // 문서 감시가 본 정본 바뀜. 승인된 내용과 같으면(되돌아옴, 승인된 반영) 표시를 거두고, 다르면 승인 안 된 바뀜
  onCanonChanged(key, d, abs, { who = null, label = null } = {}) {
    const st = this.store();
    const m = st.docMark(key, d.name);
    if (!m) { this.baseline(key, d, abs); return null; }
    const buf = readBuf(abs);
    const now = buf ? sha(buf) : null;
    if (now === m.approvedSha) { if (m.unapprovedAt) { st.setDocMark(key, d.name, { unapprovedSha: null, unapprovedAt: null, unapprovedBy: null }); this.changed(key); } return null; }
    if (m.unapprovedSha === now && m.unapprovedAt) return null;
    const by = label || (who && who.by) || null;
    // 화면이 말로 옮기도록 구조 값으로 둔다(label은 장부 글과 같은 한국어)
    const byJson = JSON.stringify({ by: who ? who.by : null, seat: who && who.seat ? who.seat : null, name: who && who.name ? who.name : null, guess: !!(who && (who.by === 'human' || who.basis === 'no_agent_working')), label: by });
    st.setDocMark(key, d.name, { path: d.rel, unapprovedSha: now, unapprovedAt: Date.now(), unapprovedBy: byJson });
    rigEvent(this.b, { kind: 'doc_unapproved', ws: key, seat: who && who.seat ? who.seat : null, session: who && who.sessionId ? who.sessionId : null, value: d.name, actor: 'board', text: `정본 ${d.name}(${d.rel})가 승인 없이 바뀌었다(${by || '모름'}). 사람이 되돌리거나 받아들인다`, data: { doc: d.name, path: d.rel, sha: now, approved: m.approvedSha, by: who ? who.by : null, exists: !!buf } });
    this.changed(key);
    return { doc: d.name };
  }
  // 되돌리기: 승인된 내용(없으면 git HEAD)으로 다시 쓴다
  revertDoc(key, doc, { by = 'human' } = {}) {
    const st = this.store(); const b = this.b;
    const m = st.docMark(key, doc);
    if (!m || !m.unapprovedAt) throw apiError('bad_state', `정본 ${doc}에 승인 안 된 바뀜이 없다`);
    const root = b.rig ? b.rig.rootOf(key) : null;
    if (!root) throw apiError('not_found', '워크스페이스를 찾을 수 없다');
    let text = m.approvedText; let from = 'approved';
    if (text == null && m.approvedSha == null) throw apiError('bad_state', `${m.path}는 승인된 때 없던 파일이다. 받아들이거나 손으로 지운다`);
    if (text == null) { text = gitShow(root, m.path); from = 'git'; }
    if (text == null) throw apiError('bad_state', `${m.path}의 승인된 내용을 갖고 있지 않고 git HEAD에도 없다. 손으로 고치거나 받아들인다`);
    const abs = path.resolve(root, m.path);
    if (b.rigDocs) b.rigDocs.noteWrite({ abs, board: true, why: 'revert' });
    writeAtomic(abs, text);
    const nowSha = sha(Buffer.from(text, 'utf8'));
    st.setDocMark(key, doc, { approvedSha: nowSha, approvedText: text.length <= MARK_TEXT_MAX ? text : null, unapprovedSha: null, unapprovedAt: null, unapprovedBy: null });
    rigEvent(b, { kind: 'doc_reverted', ws: key, value: doc, actor: 'human', text: `정본 ${doc}(${m.path})를 ${from === 'git' ? 'git HEAD의 내용' : '승인된 내용'}으로 되돌렸다(${by})`, data: { doc, path: m.path, from, by, sha: nowSha } });
    this.changed(key);
    return { doc, path: m.path, from };
  }
  acceptDoc(key, doc, { by = 'human' } = {}) {
    const st = this.store(); const b = this.b;
    const m = st.docMark(key, doc);
    if (!m || !m.unapprovedAt) throw apiError('bad_state', `정본 ${doc}에 승인 안 된 바뀜이 없다`);
    const root = b.rig ? b.rig.rootOf(key) : null;
    const buf = root ? readBuf(path.resolve(root, m.path)) : null;
    st.setDocMark(key, doc, { approvedSha: buf ? sha(buf) : null, approvedText: buf && buf.length <= MARK_TEXT_MAX ? buf.toString('utf8') : null, approvedAt: Date.now(), approvedBy: by, unapprovedSha: null, unapprovedAt: null, unapprovedBy: null });
    rigEvent(b, { kind: 'doc_accepted', ws: key, value: doc, actor: 'human', text: `정본 ${doc}(${m.path})의 바뀜을 사람이 받아들였다(${by})`, data: { doc, path: m.path, by, sha: buf ? sha(buf) : null } });
    this.changed(key);
    return { doc, path: m.path };
  }
  docDiff(m) {
    const root = this.b.rig ? this.b.rig.rootOf(m.workspaceKey) : null;
    if (!root || m.approvedText == null) return null;
    const buf = readBuf(path.resolve(root, m.path));
    return clipDiff(unifiedDiff(m.approvedText, buf ? buf.toString('utf8') : '', { path: m.path }));
  }

  // ---------- 보기 ----------
  view(row, { diff = true } = {}) {
    if (!row) return null;
    const d = diff ? clipDiff(unifiedDiff(row.baseText ?? '', row.newText, { path: row.path })) : null;
    return { id: row.id, workspace: row.workspaceKey, target: row.target, kind: row.kind, path: row.path, why: row.why, route: row.route, state: row.state, loop: row.loop, caseId: row.caseId, seat: row.seat, sessionName: this.nameOf(row.sessionId), t: row.t, decidedAt: row.decidedAt, decidedBy: row.decidedBy, reason: row.reason, versionN: row.versionN, file: row.file, ...(d ? { diff: d.text, added: d.added, removed: d.removed, clipped: d.clipped } : {}) };
  }
  list(key, { states = null, limit = 50 } = {}) { return { workspace: key, proposals: this.store().proposals({ ws: key, states, limit }).map((r) => this.view(r, { diff: false })) }; }
  // 개선 회의 첫 일 글에 붙일 지난 거절(since 뒤) → 줄들
  lessons(key, since = 0, max = 10) {
    const rows = this.store().proposals({ ws: key, states: ['rejected', 'failed'], since, limit: max });
    return rows.map((r) => `- ${r.id} ${r.target}${r.why ? ` (${oneLine(r.why, 80)})` : ''}: ${r.state === 'rejected' ? '거절' : '반영 못 함'} — ${r.reason || '-'}`);
  }
  // 응답 필요 목록(rig.asks): 모든 워크스페이스 → [{ id, kind, workspace, wsName, t, ... }] 오래된 것부터
  asks({ ws = null } = {}) {
    const st = this.store(); const b = this.b; const out = [];
    if (!st.proposals) return out;
    const wsName = (k) => { const w = st.getWorkspace ? st.getWorkspace(k) : null; return w ? w.name || path.basename(w.root || k) : k; };
    for (const row of st.proposals({ ws, states: ['pending'], route: 'human', limit: 200 })) out.push({ id: `proposal:${row.id}`, kind: 'proposal', workspace: row.workspaceKey, wsName: wsName(row.workspaceKey), t: row.t, proposal: this.view(row) });
    const byOf = (s) => { try { const x = JSON.parse(s); return x && typeof x === 'object' ? x : { label: s }; } catch { return s ? { label: s } : null; } };
    for (const m of st.docMarks(ws)) if (m.unapprovedAt) out.push({ id: `doc:${m.workspaceKey}|${m.doc}`, kind: 'doc_unapproved', workspace: m.workspaceKey, wsName: wsName(m.workspaceKey), t: m.unapprovedAt, doc: m.doc, path: m.path, by: (byOf(m.unapprovedBy) || {}).label || null, who: byOf(m.unapprovedBy), canRevert: m.approvedText != null || m.approvedSha != null, ...(() => { const d = this.docDiff(m); return d ? { diff: d.text, added: d.added, removed: d.removed, clipped: d.clipped } : {}; })() });
    // 받아들임 human 섹터의 새 산출물
    const keys = ws ? [ws] : (st.workspaces ? st.workspaces().map((w) => w.key) : []);
    for (const k of keys) {
      const r = b.rig ? b.rig.active(k) : null;
      if (!r) continue;
      const human = sectorsOf(r.def).filter((s) => s.accept === 'human').map((s) => s.name);
      // P225(11.9의 10): gate 섹터에서 done 훅이 판정을 주지 않은 새것(state_why gate_none)도 같은 카드
      const gate = sectorsOf(r.def).filter((s) => s.accept === 'gate').map((s) => s.name);
      const gateNone = st.newArtifactsIn ? st.newArtifactsIn(k, gate).filter((a) => a.stateWhy === 'gate_none') : [];
      for (const a of [...(st.newArtifactsIn ? st.newArtifactsIn(k, human) : []), ...gateNone]) out.push({ id: `artifact:${a.id}`, kind: 'artifact', workspace: k, wsName: wsName(k), t: a.t, artifact: { id: a.id, sector: a.sector, path: a.path, size: a.size, loop: a.loop, caseId: a.caseId, seat: a.seat, sessionName: this.nameOf(a.sessionId) } });
    }
    // P230(rig2-design 11.12의 3): 관리자 자리가 없는 rig의 상한에 닿은 회(멈춘 회는 숨긴다: 잇기에 다시 뜬다)
    for (const c of st.humanAskCases ? st.humanAskCases(ws) : []) {
      if (c.pausedAt || (b.branch && b.branch.flow && b.branch.flow.loops && b.branch.flow.loops.isPaused(c.workspaceKey, c.loop))) continue;
      const a = c.humanAsk || {};
      out.push({ id: `run:${c.id}`, kind: 'run_limit', workspace: c.workspaceKey, wsName: wsName(c.workspaceKey), t: a.t || c.createdAt, run: { id: c.id, name: c.name || null, loop: c.loop || null, seat: a.seat || null, to: a.to || [], result: a.result || null, max: a.max ?? null, line: a.line ?? null, reason: a.text || '', sessionName: this.nameOf(a.session), self: a.self || null } }); // P231: self(올라갈 곳이 그 자리 자신이라 사람에게 옴)
    }
    // P225(rig2-design 11.8의 1·2): 무인 자리 승인(승인 전 unattended 자리. 승인은 이 PC의 창만)
    for (const x of b.rig && b.rig.permitNeeds ? b.rig.permitNeeds(ws) : []) out.push({ id: `permit:${x.workspace}|${x.seat}`, kind: 'seat_permit', workspace: x.workspace, wsName: wsName(x.workspace), t: b.rig.pendingSince ? b.rig.pendingSince(x.workspace, x.seat) : Date.now(), seat: x.seat, defN: x.defN });
    // P239(rig2-design 11.18의 4): scoped·ask 자리의 권한 모드가 바뀜(자리 터미널에서 Shift+Tab으로 돌리면 사라진다). 잠든·닫힌 세션은 다시 뜨면 띄운 모드다
    for (const s of b.sessions ? b.sessions.values() : []) {
      const d = s.rt && s.rt.rigModeDrift;
      if (!d || !s.rigSeat || s.closedAt || s.rt.sleep || (ws && s.workspaceKey !== ws)) continue;
      out.push({ id: `mode:${s.sessionId}`, kind: 'mode_drift', workspace: s.workspaceKey, wsName: wsName(s.workspaceKey), t: d.at, seat: s.rigSeat, mode: d.mode, back: d.back || 'manual', sessionId: s.sessionId, sessionName: this.nameOf(s.sessionId) });
    }
    return out.sort((x, y) => x.t - y.t);
  }
  // 응답 필요 카드의 단추 → 결과
  answer(id, action, { reason = null, by = 'human' } = {}) {
    const s = String(id || '');
    if (s.startsWith('proposal:')) return this.decide(null, s.slice(9), action === 'approve' ? 'approve' : action === 'reject' ? 'reject' : action, { by, reason });
    if (s.startsWith('doc:')) {
      const [key, doc] = s.slice(4).split('|');
      if (action === 'revert') return this.revertDoc(key, doc, { by });
      if (action === 'accept') return this.acceptDoc(key, doc, { by });
      throw apiError('bad_request', `revert 또는 accept다: ${action}`);
    }
    if (s.startsWith('artifact:')) {
      const a = this.store().getArtifact(Number(s.slice(9)));
      if (!a) throw apiError('not_found', `그런 산출물이 없다: ${s}`);
      if (action !== 'accept') throw apiError('bad_request', `accept다: ${action}`);
      const row = sectorsFor(this.b).acceptHuman(a.workspaceKey, a.id, { by });
      this.changed(a.workspaceKey);
      return { artifact: row };
    }
    if (s.startsWith('run:')) { // P230: 상한에 닿은 회 — accept(그대로 받기) | again(한 번 더) | pause(회 멈추기)
      return this.b.branch.flow.answerHuman(s.slice(4), action, { by: by === 'device' ? 'remote' : 'human' });
    }
    if (s.startsWith('permit:')) { // P225: 무인 자리 승인(rig.permit과 같은 길, 이 PC의 창만)
      const [key, seat] = s.slice(7).split('|');
      if (by !== 'human') throw apiError('forbidden', '무인 자리 승인은 이 PC의 보드 창에서만 한다.');
      if (action !== 'approve') throw apiError('bad_request', `approve다: ${action}`);
      const approved = this.b.rig.permit(key, [seat], 'human');
      this.changed(key);
      if (this.b.broadcastWorkspaces) try { this.b.broadcastWorkspaces(); } catch {}
      return { approved };
    }
    if (s.startsWith('mode:')) throw apiError('bad_request', '권한 모드 카드는 단추가 없다. 자리 터미널에서 Shift+Tab으로 manual로 돌리면 사라진다.'); // P239
    throw apiError('bad_request', `모르는 카드: ${s}`);
  }
}
function clipDiff(d) {
  if (!d || !d.text) return d ? { ...d, clipped: false } : null;
  const lines = d.text.split('\n');
  return lines.length > DIFF_LINES_MAX ? { ...d, text: lines.slice(0, DIFF_LINES_MAX).join('\n') + '\n…', clipped: true } : { ...d, clipped: false };
}

// 판 API 처리기(backend.mjs handlers에 펼친다). 보기와 정하기는 이 PC의 창(판 API 토큰)과 연결한 기기(휴대폰)
export function rigProposalHandlers(b) {
  const who = (c, what) => { if (!c || !c.auth || !['local', 'device'].includes(c.auth.kind)) throw apiError('forbidden', `${what}는 보드 창이나 연결한 기기에서 한다.`); return c.auth.kind === 'device' ? 'device' : 'human'; };
  const keyOf = async (p) => (await b.resolveWorkspace(p && p.workspace)).key;
  return {
    'rig.asks': async (p, c) => { who(c, 'rig 응답 보기'); return { asks: proposalsFor(b).asks({ ws: p && p.workspace ? await keyOf(p) : null }) }; },
    'rig.proposals': async (p) => proposalsFor(b).list(await keyOf(p), { states: p && Array.isArray(p.states) ? p.states : null, limit: p && p.limit }),
    'rig.proposal': async (p) => { const r = b.store.getProposal(String((p && p.id) || '')); if (!r) throw apiError('not_found', `그런 제안이 없다: ${p && p.id}`); return { proposal: proposalsFor(b).view(r) }; },
    // { id: "proposal:<id>" | "doc:<ws>|<문서>" | "artifact:<id>" | "run:<회>"(P230), action: approve | reject | revert | accept | again | pause, reason? }
    'rig.decide': async (p, c) => { const by = who(c, 'rig 승인·거절'); return proposalsFor(b).answer(p && p.id, p && p.action, { reason: p && p.reason, by }); },
  };
}
