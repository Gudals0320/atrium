// P360: 세션 되살리기와 갈라 열기. 사람이 세션 이름이나 ID를 말하면 그 세션을 같은 대화로 되살리거나(atrium revive, 창의 "다시 열기"),
//   그 대화를 이어받는 새 세션을 띄운다(atrium fork, 창의 "SDK로 갈라 열기"). 판이 사람 말 없이 저절로 되살리거나 갈라 여는 길은 없다.
// - 되살리기(revive): 이름·세션 ID·판 밖 대화 ID를 풀어 지금 상태에 맞는 길로 같은 세션 ID(같은 대화)를 이어 띄운다.
//   잠듦 → 깨우기(sleep.mjs wakeFor), 사람이 끝냄(제자리 끝남) → 같은 자리 다시 열기(user-close.mjs), 닫힘·보관 → 판으로 다시 열기(recall.reopen,
//   보관도 풀린다, SDK 세션은 터미널 없이), 판 밖 대화 → 판으로 열기(recall.openConvo, 다른 곳에서 쓰는 대화는 거절). 살아 있으면 거절하고 그 이름을 돌려준다.
//   다시 연 세션은 이름(겹치면 -2)·마지막 자리·계보 부모·닫힐 때 뗀 선(역할 그대로)을 되찾고(restoreRelations), 되찾지 못한 것(닫힌 상대, 덩어리)은 응답에 적는다.
// - 갈라 열기(fork): Claude Code 세션(살아 있든 닫혔든, 대화형이든 SDK든)의 대화를 `--resume <원래> --fork-session --session-id <새 ID>`로 이어받는
//   새 세션을 띄운다. 원래 세션은 건드리지 않는다. 기본 런처는 원래 세션의 런처, 모델·노력은 원래 세션의 지금 값(model-now.mjs).
//   새 세션은 원래 세션 곁에 놓고 rt.forkFrom을 남긴다(창의 옅은 "갈라 옴" 계보 선). 관계는 기본 독립이고 peer면 부른 세션의 동료다.
//   응답에 과금(구독 | API), 첫 턴에 대화 전체를 캐시에 새로 쓴다는 것과 대화 크기(대략 토큰)를 적는다.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { keyed } from './msg.mjs';
import { transcriptPathFor } from './launch.mjs';
import { resumeModel } from './model-now.mjs';
import { reopenSession, reopenable } from './user-close.mjs';
import { isSdk, SDK_LAUNCHER_ID, SDK_BILLING } from './sdk-session.mjs';
import { findSession, shownName } from './session-label.mjs';
import { slotFor, settleRegions } from './canvas-ops.mjs';
import { PEER_ROLE } from './relations.mjs';
import { clip } from './text.mjs';
import { archiveState, itemKey } from './archive.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAIL_BYTES = 512 * 1024; // 대화 크기를 읽을 때 기록 끝에서 읽는 양
function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }

// 세션 런타임에 남길 갈라 온 대화 표(계보 선, 대화 기록이 생기기 전에 다시 띄울 때)
export const forkMark = (f) => ({ sessionId: (f && f.sessionId) || null, convId: String((f && f.convId) || '').toLowerCase() || null, name: (f && f.name) || null, at: (f && f.at) || Date.now() });

// 이름·ID → 지금 상태. 판의 세션(살아 있음·잠듦·끝남)이 닫힌 세션보다 먼저다. 닫힌 세션 이름이 겹치면 가장 늦게 닫힌 것.
//   → { state: 'live'|'sleeping'|'exited'|'closed'|'convo'|'none', s?, row?, convId?, archived? }
export function findTarget(b, ref) {
  const key = String(ref ?? '').trim().replace(/^@/, '');
  if (!key) throw apiError('bad_request', '되살릴 세션의 이름이나 세션 ID를 준다.');
  const live = findSession(b.sessions.values(), key) || [...b.sessions.values()].find((x) => x.agentName === key || x.sessionId.toLowerCase() === key.toLowerCase());
  if (live) {
    if (live.rt && live.rt.sleep) return { state: 'sleeping', s: live };
    if (live.rt && live.rt.exit && reopenable(live)) return { state: 'exited', s: live };
    return { state: 'live', s: live };
  }
  const st = b.store;
  let row = UUID_RE.test(key) ? st.closedSession(key) || st.closedSession(key.toLowerCase()) : null;
  if (!row) { const hit = findSession(st.closedSessions(), key); row = hit ? st.closedSession(hit.sessionId) : null; } // closedSessions는 늦게 닫힌 것부터
  if (row && row.reopenedAs) { // 다른 세션 ID로 옮겨 간 판에 올린 세션: 옮겨 간 세션을 본다
    const moved = b.sessions.get(row.reopenedAs);
    if (moved) return findTarget(b, moved.sessionId);
    const r2 = st.closedSession(row.reopenedAs);
    if (r2) row = r2;
  }
  if (row) return { state: 'closed', row, archived: archivedNow(b, row) };
  if (UUID_RE.test(key)) {
    const known = st.boardConversations ? st.boardConversations().get(key.toLowerCase()) : null;
    if (known) { const s = b.sessions.get(known.movedTo || known.sessionId); if (s) return findTarget(b, s.sessionId); const r = st.closedSession(known.sessionId); if (r) return { state: 'closed', row: r, archived: false }; }
    return { state: 'convo', convId: key.toLowerCase() };
  }
  return { state: 'none' };
}

// 닫힌 행이 지금 보관함에 있는가(손 보관이나 기간이 지난 자동 보관, archive.mjs archiveState)
function archivedNow(b, row) {
  const mark = (b.store.archiveMarks ? b.store.archiveMarks() : new Map()).get(itemKey('session', row.sessionId)) || null;
  const rt = row.runtime || {};
  const days = b.recall && b.recall.archiveDays ? b.recall.archiveDays() : 0;
  return archiveState({ lastAt: Math.max(rt.lastActivityAt || 0, row.closedAt || 0), mark, days }).archived || !!row.dismissedAt;
}
const nameOf = (b, sid) => { const x = b.sessions.get(sid); if (x) return shownName(x); const r = b.store.getSession(sid); return r ? r.label || r.name : String(sid).slice(0, 8); };

// 다시 연 세션의 관계를 되찾는다. 계보 부모(사실)를 다시 적고, 닫힐 때 판이 뗀 선(그 세션이 낀 선, 닫힌 때 무렵 지움)은 상대가 살아 있으면
//   역할 그대로 다시 연다(일시 선, 사람이 그 전에 끊은 선은 두다). 상대가 닫혀 있으면 되찾지 못한 것으로 적는다. 덩어리(붙여 묶기)는 되찾지 않는다.
//   → { parent, children, peers, roles: [{ name, role, dir }], missing: [{ name, why }], notRestored: ['docks'] }
export function restoreRelations(b, id, { closedAt = 0, parentSessionId = null } = {}) {
  const s = b.sessions.get(id);
  if (!s) return null;
  const out = { parent: null, children: [], peers: [], roles: [], missing: [], notRestored: ['docks'] };
  if (parentSessionId && parentSessionId !== id && b.store.getSession(parentSessionId)) {
    if (s.parentSessionId !== parentSessionId) { s.parentSessionId = parentSessionId; b.store.updateSession(id, { parentSessionId }); }
    if (!b.sessions.has(parentSessionId)) out.missing.push({ name: nameOf(b, parentSessionId), why: 'parent_closed' });
  }
  if (b.branch && b.branch.closed) b.branch.closed.delete(id);
  const touched = new Set();
  const seen = new Set();
  const all = b.store.links({ all: true }).filter((l) => l.from === id || l.to === id).reverse(); // 늦게 만든 선부터(한 쌍에 하나)
  for (const l of all) {
    const pair = `${l.from}>${l.to}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    if (!l.removedAt || l.transient) continue;
    if (closedAt && Math.abs(l.removedAt - closedAt) > 10000) continue;
    const other = l.from === id ? l.to : l.from;
    if (!b.sessions.has(other)) { out.missing.push({ name: nameOf(b, other), why: 'other_closed', ...(l.role ? { role: l.role } : {}) }); continue; }
    b.ensureLink(l.from, l.to, {});
    touched.add(other);
    if (l.role) out.roles.push({ name: nameOf(b, other), role: l.role, dir: l.from === id ? 'out' : 'in' });
  }
  const idx = b.branch && b.branch.relIndex ? b.branch.relIndex() : null;
  if (idx) {
    const wp = idx.workParentOf(id);
    if (wp) { out.parent = nameOf(b, wp); touched.add(wp); }
    for (const x of b.sessions.values()) if (x.sessionId !== id && idx.workParentOf(x.sessionId) === id) { out.children.push(nameOf(b, x.sessionId)); touched.add(x.sessionId); }
    out.peers = idx.peersOf(id).filter((p) => b.sessions.has(p.id)).map((p) => nameOf(b, p.id));
  }
  if (b.branch && b.branch.closed) for (const [cid, c] of b.branch.closed) if (c && c.parentSessionId === id && !out.missing.some((m) => m.name === c.name)) out.missing.push({ name: c.name, why: 'child_closed' });
  if (out.parent || out.children.length || out.roles.length) b.store.addEvent(id, 'relations_restored', { parent: out.parent, children: out.children, roles: out.roles.length, missing: out.missing.length });
  if (b.broadcastSession) for (const x of [s, ...[...touched].map((t) => b.sessions.get(t)).filter(Boolean)]) b.broadcastSession(x, { cause: 'revive:relations' });
  return out;
}

// 대화 기록의 대략 크기. 마지막 모델 답의 usage(입력 + 캐시 읽기·쓰기 + 출력)가 다음 요청의 크기와 같다. 없으면 파일 크기로 어림한다
export function convoSize(file) {
  let size = 0;
  try { size = fs.statSync(file).size; } catch { return null; }
  let text = '';
  try {
    const fd = fs.openSync(file, 'r');
    try { const n = Math.min(size, TAIL_BYTES); const buf = Buffer.alloc(n); fs.readSync(fd, buf, 0, n, size - n); text = buf.toString('utf8'); } finally { fs.closeSync(fd); }
  } catch {}
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.includes('"usage"')) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    const m = j && j.message;
    const u = m && m.usage;
    if (!u || m.model === '<synthetic>') continue;
    const tokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0);
    if (tokens > 0) return { tokens, bytes: size, how: 'usage' };
  }
  return { tokens: Math.round(size / 6), bytes: size, how: 'bytes' }; // JSONL은 글자보다 군더더기가 많다(대략)
}

// 원래 세션(판의 것이나 닫힌 행)의 대화 기록과 그 기록이 있는 폴더. → { file, cwd, convId } | null
export function transcriptOf(b, src) {
  const rt = src.runtime || src.rt || {};
  const conv = String(rt.claudeSessionId || (rt.term && rt.term.agentSessionId) || src.sessionId).toLowerCase();
  const projects = b.cfg.claudeProjects;
  const cands = [];
  if (rt.cwd) cands.push({ file: transcriptPathFor(projects, rt.cwd, conv), cwd: rt.cwd });
  if (src.cwd) cands.push({ file: transcriptPathFor(projects, src.cwd, conv), cwd: src.cwd });
  if (rt.transcriptPath) cands.push({ file: rt.transcriptPath, cwd: rt.cwd || src.cwd });
  const idx = b.store.getConvoById ? b.store.getConvoById(conv) : null;
  if (idx && idx.path) cands.push({ file: idx.path, cwd: idx.cwd || rt.cwd || src.cwd });
  for (const c of cands) { try { if (c.file && c.cwd && fs.statSync(c.file).isFile() && fs.existsSync(c.cwd)) return { ...c, convId: conv }; } catch {} }
  return null;
}

// 되살리기. by: 'agent:<이름>' | 'user'. → { name, sessionId, from: 'sleeping'|'exited'|'closed'|'archived'|'convo', ... }
export async function reviveSession(b, ref, { by = 'user' } = {}) {
  const t = findTarget(b, ref);
  if (t.state === 'none') throw apiError('not_found', `판에서 그 이름이나 세션 ID를 찾지 못했다: ${ref}. 닫힌·보관된 세션은 판 사이드바의 닫힌 세션과 보관함에 있다`);
  if (t.state === 'live') throw keyed(apiError('alive', `@${shownName(t.s)}은 살아 있다(되살릴 것이 없다). 일을 맡기려면 atrium prompt ${t.s.name}`, { name: t.s.name }), 'revive.err.alive', { name: shownName(t.s) });
  let out;
  if (t.state === 'sleeping') {
    const r = b.sleeper ? await b.sleeper.wakeFor(t.s, `revive:${by}`) : null;
    out = { sessionId: t.s.sessionId, name: t.s.name, from: 'sleeping', woke: true, ms: r && r.ms != null ? r.ms : null };
  } else if (t.state === 'exited') {
    const r = await reopenSession(b, { session: t.s.sessionId });
    out = { ...r, from: 'exited' };
  } else if (t.state === 'closed') {
    const r = await b.recall.reopen({ session: t.row.sessionId });
    out = { ...r, from: t.archived ? 'archived' : 'closed', was: t.row.name };
  } else {
    const r = await b.recall.openConvo({ convo: t.convId });
    out = { ...r, from: 'convo' };
  }
  b.store.addEvent(out.sessionId || null, 'revived', { by, from: out.from, name: out.name });
  b.log(`revived ${out.name} from=${out.from} by=${by}`);
  const s = b.sessions.get(out.sessionId);
  return { ...out, kind: (s && s.kind) || out.kind || 'claude', billing: s && isSdk(s) ? 'api' : 'subscription', state: s ? b.summary(s).state : null };
}

// 갈라 열 원래 세션을 푼다. 판의 세션이면 그 세션, 닫혔으면 그 행, 판 밖 대화 ID면 그 대화. Claude Code만 → { src, live, file, cwd, convId }
export function forkSource(b, ref) {
  const t = findTarget(b, ref);
  if (t.state === 'none') throw apiError('not_found', `판에서 그 이름이나 세션 ID를 찾지 못했다: ${ref}`);
  let src = null, live = false;
  if (t.state === 'convo') {
    const row = b.store.getConvoById ? b.store.getConvoById(t.convId) : null;
    if (!row || !row.path || (row.harness && row.harness !== 'claude')) throw apiError('not_found', `Claude Code 대화 기록을 찾지 못했다: ${t.convId}`);
    src = { sessionId: t.convId, name: null, cwd: row.cwd, kind: 'claude', convo: true, runtime: { transcriptPath: row.path, cwd: row.cwd } };
  } else if (t.s) { src = t.s; live = true; }
  else src = t.row;
  if ((src.kind || 'claude') !== 'claude') throw keyed(apiError('not_claude', `갈라 열기는 Claude Code 세션만 된다(@${shownName(src) || ref}는 ${src.kind}).`), 'revive.err.notClaude', { name: shownName(src) || String(ref) });
  if (live && !b.hooked(src) && !(src.rt && (src.rt.claudeSessionId || src.rt.transcriptPath))) throw apiError('no_transcript', `@${shownName(src)}의 대화 ID를 모른다.`);
  const tx = transcriptOf(b, src);
  if (!tx) throw keyed(apiError('no_transcript', `@${shownName(src) || ref}의 대화 기록이 없다(아직 첫 턴 전이거나 지워졌다). 갈라 열 대화가 없다.`), 'revive.err.noTranscript', { name: shownName(src) || String(ref) });
  return { src, live, ...tx };
}

// 갈라 열기. o: { launcher, name, model, effort, peer, caller(부른 세션), near(자리, 창) }
export async function forkSession(b, ref, o = {}) {
  const { src, live, file, cwd, convId } = forkSource(b, ref);
  const srcName = shownName(src) || convId.slice(0, 8);
  const info = !src.convo && b.store.spawnInfo ? b.store.spawnInfo(src.sessionId) || {} : {};
  const L = b.features && b.features.launchers;
  let launcher = o.launcher ? String(o.launcher) : isSdk(src) ? SDK_LAUNCHER_ID : info.launcher || null;
  if (launcher && L && !o.launcher) { try { L.get(launcher); } catch { launcher = null; } } // 원래 런처가 없어졌으면 기본 claude
  const plan = launcher && L ? L.get(launcher) : null;
  const sdk = !!(plan && (plan.harness === 'claude-sdk'));
  if (plan && !sdk && plan.harness !== 'claude') throw keyed(apiError('bad_request', `갈라 열기는 Claude Code 런처(대화형 또는 SDK)로만 된다: ${launcher}`), 'revive.err.launcher', { launcher });
  // 모델·노력: 준 값 > 원래 세션의 지금 값(대화 기록 → 판 DB) > 띄운 값
  const now = live ? (b.modelNowFor ? b.modelNowFor(src) : src.rt.modelNow) : b.recall && b.recall.closedModelNow ? b.recall.closedModelNow(src) : null;
  const rm = resumeModel('claude', { model: src.model || null, effort: src.effort || null }, now);
  const model = o.model || rm.model || null;
  const effort = o.effort || rm.effort || null;
  const name = b.recall.freeName(o.name ? String(o.name).replace(/^@/, '') : `${(src.name || 'fork').slice(0, 24)}-fork`, 's');
  const forkFrom = { sessionId: src.convo ? null : src.sessionId || null, convId, name: src.name ? srcName : null };
  if (sdk && b.authRelay && !b.authRelay.keyPresent()) throw keyed(apiError('auth_relay_no_key', 'API 키가 없어 SDK(API 크레딧)로 갈라 열 수 없다. 사람이 설정 › 런처의 API 키 칸에 넣어야 한다.'), 'authRelay.err.noKey');
  const peer = !!(o.peer && o.caller);
  const p = { cwd, name, ...(launcher ? { launcher } : { kind: 'claude', permissionMode: src.permissionMode || 'manual' }), ...(model ? { model } : {}), ...(effort ? { effort } : {}), forkFrom, ...(peer ? { parentSessionId: o.caller.sessionId } : {}) };
  const r = await b.spawn(p);
  const s = b.sessions.get(r.sessionId);
  // 자리: 원래 세션 곁(닫힌 세션은 마지막 자리 곁). 창이 준 자리가 있으면 그 곁
  const srcNode = src.convo ? null : b.store.nodeOf(src.sessionId);
  const near = o.near || (srcNode ? { x: srcNode.x, y: srcNode.y, w: srcNode.w, h: srcNode.h } : null);
  const mine = b.store.nodeOf(r.sessionId);
  if (near && mine && s) {
    const area = mine.area || '';
    const slot = slotFor(b, { wsKey: s.workspaceKey, size: { w: mine.w, h: mine.h }, near, area });
    b.store.setNode({ session_id: r.sessionId, x: Math.round(slot.x), y: Math.round(slot.y), w: mine.w, h: mine.h, z: mine.z || 0, size: mine.size || null, aspect: mine.aspect || null, area });
    settleRegions(b, 'fork');
  }
  if (peer && s && b.branch) {
    const l = b.ensureLink(o.caller.sessionId, s.sessionId, { role: PEER_ROLE, spawned: true });
    b.linkEvent(l, 'spawn', `atrium fork ${srcName} --peer`, { by: 'atrium fork', relation: 'peer' }, { quiet: true });
    b.branch.setRelation(o.caller, s, 'peer', { source: 'agent', by: o.caller.name, quiet: true });
  }
  const size = convoSize(file);
  b.store.addEvent(r.sessionId, 'forked', { from: forkFrom, launcher: launcher || null, sdk, model, effort, tokens: size ? size.tokens : null, by: o.caller ? `agent:${o.caller.name}` : 'user', peer });
  if (live) b.store.addEvent(src.sessionId, 'forked_to', { sessionId: r.sessionId, name: r.name });
  b.log(`forked ${srcName} → ${r.name} sdk=${sdk} model=${model || '-'} tokens≈${size ? size.tokens : '?'}`);
  if (s && b.broadcastSession) b.broadcastSession(s, { cause: 'fork' });
  return {
    sessionId: r.sessionId, name: r.name, from: { name: srcName, sessionId: forkFrom.sessionId, convId, live }, launcher: launcher || null,
    billing: sdk ? 'api' : 'subscription', sdk, model, effort, relation: peer ? 'peer' : 'none',
    size: size ? { tokens: size.tokens, bytes: size.bytes, how: size.how } : null, cacheNote: true,
  };
}

// 판 API(창·사람의 atrium). 창의 메뉴가 쓸 수 있는지 미리 묻는 forkInfo는 키·대화 크기만 본다(띄우지 않는다)
export function reviveHandlers(b) {
  return {
    'session.revive': (p = {}) => reviveSession(b, p.session, { by: 'user' }),
    'session.fork': (p = {}) => forkSession(b, p.session, { launcher: p.launcher || null, name: p.name || null, model: p.model || null, effort: p.effort || null, near: p.near || null }),
    'session.forkInfo': (p = {}) => {
      const keyPresent = !!(b.authRelay && b.authRelay.keyPresent());
      try { const x = forkSource(b, p.session); const size = convoSize(x.file); return { ok: true, keyPresent, tokens: size ? size.tokens : null }; }
      catch (e) { return { ok: false, keyPresent, code: e.code || 'error', message: clip(e.message, 200) }; }
    },
  };
}

// 에이전트 응답 글(atrium revive·fork). x: reviveSession·forkSession의 결과
export function reviveLines(x) {
  const out = [];
  const how = { sleeping: '잠든 세션을 깨웠다', exited: '끝난 세션을 같은 자리에서 다시 열었다', closed: '닫힌 세션을 판으로 다시 열었다', archived: '보관된 세션을 꺼내 판으로 다시 열었다', convo: '판 밖 대화를 판으로 열었다' }[x.from] || '되살렸다';
  out.push(`@${x.name}: ${how}(같은 세션 ID·같은 대화${x.resume === false ? ', 대화 기록이 없어 새로 시작' : ''}). 상태 ${x.state || '?'} · ${x.billing === 'api' ? 'API 크레딧(SDK)' : '구독'}`);
  if (x.was && x.was !== x.name) out.push(`이름 @${x.was}는 다른 세션이 쓰고 있어 @${x.name}로 열었다.`);
  const r = x.relations;
  if (r) {
    const bits = [];
    if (r.parent) bits.push(`상위 @${r.parent}`);
    if (r.children.length) bits.push(`하위 ${r.children.map((n) => '@' + n).join(', ')}`);
    if (r.peers.length) bits.push(`동료 ${r.peers.map((n) => '@' + n).join(', ')}`);
    if (r.roles.length) bits.push(`다시 이은 역할 선 ${r.roles.map((l) => `@${l.name}(${l.role})`).join(', ')}`);
    out.push(bits.length ? `되찾은 관계: ${bits.join(' · ')}` : '되찾은 관계: 없음(독립)');
    const why = { parent_closed: '상위가 닫혀 있음', other_closed: '상대가 닫혀 있음', child_closed: '하위가 닫혀 있음' };
    if (r.missing.length) out.push(`되찾지 못한 것: ${r.missing.map((m) => `@${m.name}(${why[m.why] || m.why})`).join(', ')}. 붙여 묶기 덩어리는 되찾지 않는다.`);
  }
  out.push(`일 맡기기: atrium prompt ${x.name} "<할 일>" · 화면 읽기: atrium read ${x.name}`);
  return out;
}
export function forkLines(x) {
  const out = [];
  out.push(`@${x.name}: @${x.from.name}의 대화를 이어받아 갈라 열었다(${x.sdk ? 'SDK, API 크레딧 과금' : '대화형, 구독 과금'}${x.model ? ` · 모델 ${x.model}` : ''}${x.effort ? ` · 노력 ${x.effort}` : ''}). 원래 세션은 그대로다.`);
  if (x.size) out.push(`대화 크기 약 ${x.size.tokens.toLocaleString('en-US')} 토큰${x.size.how === 'bytes' ? '(파일 크기로 어림)' : ''}. 첫 턴에 이 대화 전체를 캐시에 새로 쓴다${x.sdk ? '(API 크레딧에서 나간다)' : ''}.`);
  out.push(x.relation === 'peer' ? `관계: 너의 동료.` : '관계: 독립(너의 하위가 아니다. 보고는 오지 않는다).');
  out.push(`일 맡기기: atrium prompt ${x.name} "<할 일>" · 화면 읽기: atrium read ${x.name}`);
  return out;
}
