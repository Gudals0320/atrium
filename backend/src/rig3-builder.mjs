// P247: rig 3 5단계 — 빌더 세션(docs research rig3-skeleton.md 7절, rig3-roles.md 10절).
// - 워크스페이스마다 하나, 사람이 주인, 길 밖. 세션의 rigRole이 BUILDER_ROLE('@builder')이다(sessions.rig_role로 판이 다시 떠도 알아본다).
//   rig 판(v3이거나 rig가 없는 워크스페이스)의 "빌더에게 말하기"(판 API rig3.builder)가 있으면 그 세션으로, 없으면 띄운다. 빌더를 꺼도 rig는 돈다.
// - 띄울 때 싣는 글: 빌더 지침 파일(rig3-builder-guide.md, 설계 쪽이 다시 쓴다) + 지금 정의·목적·정의서 + 최근 변경 기록 꼭지 + 기다리는 raise·멈춘 역할.
// - 쓰기 범위: .atrium/와 정의가 가리키는 도구 스크립트(rig3.mjs builderWrites). Claude Code는 역할처럼 무인(bypassPermissions)에 PreToolUse가 범위 밖 편집을 막는다.
//   턴 뒤 되돌리기(rig3-guard)는 빌더의 일 구간을 알고 그 경로의 주인으로 친다(역할이 .atrium/에 쓴 것은 그대로 되돌린다).
// - 빌더가 일하던 때 바뀐 정의·목적·정의서의 새 판은 누가 builder다(Rig.byOf → wroteAt). 꺼진 rig는 빌더 턴이 끝날 때 맞는 정의를 판으로 남긴다(recordNow).
// - 역할의 raise와 "한 번 일깨운 뒤에도 멈춘 역할"은 빌더 세션이 있으면 대기열로 전한다(잠들었으면 대기열이 깨운다). 없으면 지금처럼 변경 기록과 rig 판.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rigEvent } from './rig-ledger.mjs';
import { shownName } from './session-label.mjs';
import { deriveState } from './state.mjs';
import { BUILDER_ROLE, builderWrites, RIG3_DIR } from './rig3.mjs';

export { BUILDER_ROLE };
export const BUILDER_NAME = 'builder';
export const GUIDE_FILE = fileURLToPath(new URL('./rig3-builder-guide.md', import.meta.url));
export const BUILDER_TEXT_MAX = 2000;
export const LOAD_LIMITS = { rig: 12000, purpose: 6000, doc: 6000, docsTotal: 30000, entry: 6000 };
export const WINDOW_KEEP = 20; // 빌더의 일 구간(벽시계) 몇 개를 들고 있나
export const WROTE_SLACK_MS = 3000; // 구간 앞뒤 여유(파일 시각과 상태 바뀜의 틈)
const BUSY = new Set(['working', 'waiting']);
const ROLE_SPAWN = Symbol.for('atrium.rig3RoleSpawn'); // rig3-roles.mjs ROLE_SPAWN과 같은 열쇠
function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const clipTo = (t, n, rel) => (t.length > n ? t.slice(0, n) + '\n…(잘림: 전체는 ' + rel + ')' : t);

export function readGuide(file = GUIDE_FILE) { try { return fs.readFileSync(file, 'utf8').replace(/^﻿/, ''); } catch (e) { return '(빌더 지침 파일을 읽지 못했다: ' + e.message + ')'; } }

// 빌더 세션에 싣는 첫 글(순수). x: { guide, root, state, n, writes, rigText, purpose: { rel, text }, docs: [{ rel, text }], entry, alerts: [줄] }
export function builderLoadText(x) {
  const L = LOAD_LIMITS;
  const out = [
    '[Atrium 보드] 너는 이 워크스페이스의 rig 빌더다. 길 밖에서 rig를 짓고 고친다. 사람이 이 터미널에서 너와 이야기한다. 아래 지침을 따른다.',
    '[Atrium 보드] 쓰는 곳: ' + x.writes.join(', ') + '. 그 밖(역할의 섹터, 역할의 기억 폴더)에 쓰면 판이 막거나 되돌린다. 켜는 것은 사람이 창에서 한다.',
    '[Atrium 보드] 지금 rig: ' + (x.state === 'none' ? '없음(.atrium/rig.json이 없다)' : x.state === 'invalid' ? '정의가 잘못됐다' + (x.why ? ': ' + x.why : '') : (x.state === 'on' ? '켜짐' : '꺼짐') + (x.n != null ? ', 판 ' + x.n : '')) + '. 워크스페이스: ' + String(x.root || '').split(path.sep).join('/'),
    '[Atrium 보드] 지금은 아래를 읽고 "준비됨" 한 줄로 답한 뒤 사람의 말을 기다린다. 판이 역할의 raise나 멈춘 역할을 알려 오면 고칠지 판단하고, 사용자에게 물을 것은 사용자가 이 터미널에 올 때 말한다.',
    '',
    '## 빌더 지침',
    String(x.guide || '').trim(),
  ];
  if (x.rigText != null) out.push('', '## 지금 정의 (' + RIG3_DIR + '/rig.json)', clipTo(String(x.rigText).trim(), L.rig, RIG3_DIR + '/rig.json'));
  if (x.purpose && x.purpose.text != null) out.push('', '## 목적 (' + x.purpose.rel + ')', clipTo(String(x.purpose.text).trim(), L.purpose, x.purpose.rel));
  let total = 0;
  for (const d of x.docs || []) {
    if (d.text == null) { out.push('', '## 정의서 (' + d.rel + ')', '(없다)'); continue; }
    if (total >= L.docsTotal) { out.push('', '## 정의서 (' + d.rel + ')', '(길어서 싣지 않았다. 파일을 읽는다)'); continue; }
    const t = clipTo(String(d.text).trim(), L.doc, d.rel); total += t.length;
    out.push('', '## 정의서 (' + d.rel + ')', t);
  }
  if (x.entry) out.push('', '## 최근 변경 기록 꼭지', clipTo(String(x.entry).trim(), L.entry, 'rig 판의 변경 기록'));
  out.push('', '## 기다리는 것 (역할의 raise, 멈춘 역할)', ...(x.alerts && x.alerts.length ? x.alerts : ['(없다)']));
  return out.join('\n');
}
// 빌더에게 전하는 한 줄(raise·멈춘 역할)
export function alertText(a) {
  if (a.what === 'raise') return '[Atrium 보드] 역할 ' + a.role + '이 빌더에게 올렸다(raise, 요령으로 풀 일이 아님): ' + String(a.reason || '').replace(/[.。]+\s*$/, '') + (a.materials && a.materials.length ? ' (재료: ' + a.materials.join(', ') + ')' : '') + '. 모양(정의·목적·정의서의 고정 칸)을 고칠 일인지 판단한다. 뜻이 바뀌는 것은 사용자에게 안을 낸다. 요령 칸은 역할의 것이다.';
  return '[Atrium 보드] 역할 ' + a.role + '이 받은 것에 답하지 않고 멈췄다(판이 한 번 일깨운 뒤에도 그대로): ' + (a.items || []).join(', ') + '. 정의서·길이 막는 것인지 본다(역할의 터미널은 atrium read ' + a.role + ').';
}

// 판 API: rig3.builder { workspace, text?, model?, effort? }(사람만: 이 PC의 창·사람의 atrium call) → { session, name, spawned }
export function rig3BuilderHandlers(b) {
  const local = (c, what) => { if (!c || !c.auth || c.auth.kind !== 'local') throw apiError('forbidden', what + '는 이 PC의 보드 창이나 사람의 atrium 명령에서만 한다(판 API 토큰).'); };
  return {
    'rig3.builder': async (p, c) => {
      local(c, '빌더에게 말하기');
      if (!b.rig3 || !b.rig3.builder) throw apiError('rig3_off', 'rig 3이 없다');
      const key = (await b.resolveWorkspace(p && p.workspace)).key;
      return b.rig3.builder.talk(key, { text: p && p.text, model: p && p.model ? String(p.model) : null, effort: p && p.effort ? String(p.effort) : null });
    },
  };
}

export class Rig3Builder {
  // b: 백엔드(sessions, spawn, queue, store, rig, log). roles: Rig3Roles(defOf, active, beat, pickName, changed)
  constructor(b, roles) { this.b = b; this.roles = roles; this.windows = new Map(); /* 키 → [{ start, end }] */ this.busy = new Map(); /* 세션 ID → start */ }
  log(m) { if (this.b.log) this.b.log(m); }
  rootOf(key) { return this.b.rig && this.b.rig.rootOf ? this.b.rig.rootOf(key) : null; }
  writes(key) { const r = this.roles.defOf(key); return builderWrites(r ? r.def.rig3 : null); }
  isBuilder(s) { return !!(s && s.rigRole === BUILDER_ROLE); }
  sessionOf(key) { return [...this.b.sessions.values()].find((x) => x.workspaceKey === key && x.rigRole === BUILDER_ROLE && !x.closedAt) || null; }

  // ---------- 말하기(판 API rig3.builder) ----------
  // 있으면 그 세션(text가 있으면 사람의 말로 넣는다), 없으면 띄우고 첫 글을 싣는다 → { session, name, spawned }
  async talk(key, { text = null, model = null, effort = null } = {}) {
    const root = this.rootOf(key);
    if (!root) throw apiError('not_found', '워크스페이스를 찾을 수 없다: ' + key);
    const say = text == null ? '' : String(text).trim();
    if (say.length > BUILDER_TEXT_MAX) throw apiError('bad_request', '글이 너무 길다(' + say.length + '자, ' + BUILDER_TEXT_MAX + '자까지)');
    const r = this.b.rig ? this.b.rig.read(key) : null;
    if (r && r.present && r.def && !r.def.v3) throw apiError('rig2', '이 워크스페이스의 rig는 rig 2 정의다. 빌더는 rig 3(version 3)이나 rig가 없는 워크스페이스에서 쓴다.');
    let s = this.sessionOf(key); let spawned = false;
    if (!s) {
      const name = this.roles.pickName(BUILDER_NAME) || BUILDER_NAME + '-' + Date.now().toString(36);
      const res = await this.b.spawn({ name, cwd: root, kind: 'claude', ...(model ? { model } : {}), ...(effort ? { effort } : {}), [ROLE_SPAWN]: BUILDER_ROLE });
      s = this.b.sessions.get(res.sessionId);
      if (!s) throw apiError('spawn_failed', '빌더 세션이 판에 등록되지 않았다');
      if (s.rigRole !== BUILDER_ROLE) { s.rigRole = BUILDER_ROLE; if (this.b.store.setSessionRole) this.b.store.setSessionRole(s.sessionId, BUILDER_ROLE); }
      if (this.b.queue) this.b.queue.enqueue(s.sessionId, this.loadText(key), { origin: { kind: 'board' } });
      spawned = true;
      rigEvent(this.b, { kind: 'builder_spawn', ws: key, session: s.sessionId, actor: 'human', text: '@' + (shownName(s) || s.name) + ' 빌더를 띄움', data: { model: model || null, writes: this.writes(key) } });
      try { this.b.store.addEvent(s.sessionId, 'rig3_builder_spawn', { workspace: key }); } catch {}
      this.log('rig3 builder ' + key + ' spawned ' + s.name);
    }
    if (say && this.b.queue) this.b.queue.enqueue(s.sessionId, say, { origin: { kind: 'human' } });
    this.roles.changed(key);
    return { session: s.sessionId, name: shownName(s) || s.name, spawned };
  }
  // 첫 글의 재료를 모은다
  loadText(key) {
    const root = this.rootOf(key);
    const rig = this.b.rig;
    let st = { state: 'none', version: null, invalid: null };
    try { if (rig && rig.status) st = rig.status(key); } catch {}
    const rd = (rel) => { try { return fs.readFileSync(path.resolve(root, rel), 'utf8'); } catch { return null; } };
    const r = this.roles.defOf(key); const r3 = r ? r.def.rig3 : null;
    let entry = null;
    try { const v = r3 && this.roles.beat ? this.roles.beat.view(key, r3) : null; const e = v && v.entries && v.entries[0]; if (e) entry = (e.title ? e.title + '\n' : '') + (e.body || ''); } catch {}
    return builderLoadText({
      guide: readGuide(), root, state: st.state || 'none', why: st.invalid || null, n: st.version ?? null, writes: this.writes(key),
      rigText: rd(RIG3_DIR + '/rig.json'),
      purpose: r3 ? { rel: r3.purpose, text: rd(r3.purpose) } : null,
      docs: r3 ? Object.values(r3.roles).map((x) => ({ rel: x.doc, text: rd(x.doc) })) : [],
      entry, alerts: this.waiting(key),
    });
  }
  // 빌더에게 아직 전하지 못한 raise·멈춘 역할(최근 장부) → [줄]
  waiting(key, limit = 10) {
    let rows = [];
    try { rows = this.b.store.rigEvents({ ws: key, kinds: ['role_raise', 'item_stalled'], limit: 200 }) || []; } catch { rows = []; }
    return rows.filter((e) => !(e.data && e.data.toBuilder)).slice(-limit).map((e) => '- ' + new Date(e.t).toISOString().slice(0, 16).replace('T', ' ') + ' ' + (e.kind === 'role_raise' ? e.seat + ' raise: ' + ((e.data && e.data.reason) || e.text || '') : e.seat + ' 멈춤: ' + (((e.data && e.data.items) || []).join(', '))));
  }

  // ---------- raise·멈춘 역할 전달 ----------
  // a: { what: raise | stalled, role, reason?, items?, materials? } → 'sent' | null(빌더 없음)
  alert(key, a) {
    const s = this.sessionOf(key);
    if (!s || !this.b.queue) return null;
    try { this.b.queue.enqueue(s.sessionId, alertText(a), { origin: { kind: 'board' } }); } catch (e) { this.log('rig3 builder alert ' + e.message); return null; }
    this.log('rig3 builder ' + key + ' alert ' + a.what + ' ' + a.role);
    return 'sent';
  }

  // ---------- 일 구간(누가 builder) ----------
  // rig3-guard onState가 부른다. 일함에서 나왔으면 true
  onState(s, from, to) {
    const key = s.workspaceKey; if (!key) return false;
    const now = Date.now();
    const list = this.windows.get(key) || []; this.windows.set(key, list);
    if (BUSY.has(to)) {
      if (!this.busy.has(s.sessionId)) { this.busy.set(s.sessionId, now); list.push({ sid: s.sessionId, start: now, end: null }); while (list.length > WINDOW_KEEP) list.shift(); }
      return false;
    }
    if (!this.busy.has(s.sessionId)) return false;
    this.busy.delete(s.sessionId);
    const w = [...list].reverse().find((x) => x.sid === s.sessionId && x.end == null); if (w) w.end = now;
    return true;
  }
  // 그 시각에 빌더가 일하고 있었나(벽시계, 여유 포함)
  wroteAt(key, t) {
    if (t == null) return false;
    const list = this.windows.get(key) || [];
    return list.some((w) => t >= w.start - WROTE_SLACK_MS && (w.end == null || t <= w.end + WROTE_SLACK_MS));
  }
  // 빌더 턴이 끝난 뒤: 꺼진 rig의 맞는 정의는 판으로 남긴다(누가 builder). 켜진 rig는 read()가 남기고 byOf가 builder로 적는다
  afterTurn(key) {
    const rig = this.b.rig; if (!rig) return null;
    let r; try { r = rig.read(key); } catch (e) { this.log('rig3 builder read ' + e.message); return null; }
    let a = null;
    if (r.present && !r.invalid && r.def && r.def.v3 && !rig.enabled(key)) a = rig.recordNow(key, { by: 'builder', note: 'builder' });
    this.roles.changed(key);
    return a;
  }
  view(key) {
    const s = this.sessionOf(key);
    const sum = s && this.b.summary ? (() => { try { return this.b.summary(s); } catch { return null; } })() : null;
    return { session: s ? { sessionId: s.sessionId, name: shownName(s) || s.name, state: sum ? sum.state : s.rt ? deriveState(s.rt).state : null, asleep: !!(s.rt && s.rt.sleep) } : null, writes: this.writes(key) };
  }
}
