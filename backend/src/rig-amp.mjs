// P189: rig 6단계, 종류별 증폭(docs research harness-arch.md 15절 "6단계", harness-layered.md 7절).
// 정의는 그대로 두고, 받는 종류가 있으면 같은 판단을 더 이른 시점에 한다. 증폭이 없어도 정의는 돈다(done 훅, 도구 관문, 0단계 멈춤 알림).
// - 대상은 켜진 rig의 자리 세션뿐이다(sessions.rig_seat이 그 정의의 자리). 자리 없는 세션, 꺼진 워크스페이스, 증폭 칸이 없는 정의는 지금과 같다.
// - 정의 칸(rig.mjs validateRig가 validateAmp를 한 줄로 부른다):
//   seats.<자리>.writes: false(파일 쓰기 없음) | ["경로", …](세션 폴더 기준 쓰기 범위. {item}은 지금 일 ID) | true·없음(제한 없음)
//   hooks[].at "pre-tool": Claude Code 도구 호출 직전 관문. 거르는 칸은 match(도구 이름 정규식)와 seat(자리 이름 또는 배열)
//   stopVerify: true(정의 전체) 또는 seats.<자리>.stopVerify(자리가 이긴다): 열린 시도를 쥔 자리 세션의 턴 끝을 한 번 돌려보낸다
// - 종류별:
//   Claude Code: 세션 설정 파일 permissions.deny(writes false → Edit(//**), 사람만 고치는 파일 → Edit(//경로)),
//     PreToolUse를 판이 기다려 답함(pre-tool 훅, writes 경로 목록), Stop에 decision block(stopVerify).
//   Codex: writes false → -s read-only(Windows에서 localhost HTTP는 막히지 않아 atrium done을 칠 수 있다, P189 확인).
//     경로 목록은 Codex가 작업 폴더를 늘 쓰기 가능으로 두어 좁히지 못하므로 붙이지 않는다.
//   opencode·pi: 붙이지 않는다(P189 보고의 표).
import path from 'node:path';
import fs from 'node:fs';
import { rigEvent } from './rig-ledger.mjs'; // P217: 장부(훅 아닌 관문)

export const AMP_ATS = ['pre-tool'];
// 판이 자리를 위해 띄울 때(rig-flow spawnSeat → branch.spawnChild → backend.spawn) 넘기는 자리 이름의 열쇠.
// Symbol이라 에이전트의 /branch/child 본문(JSON)이나 판 API로는 넣지 못한다(에이전트는 자리를 정하지 못한다)
export const SEAT_SPAWN = Symbol.for('atrium.rigSeatSpawn');
export const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
export const EDIT_ALL = 'Edit(//**)'; // 모든 드라이브의 모든 파일(문서: Windows 경로는 /c/… 꼴로 맞춘 뒤 맞춘다)
export const PRE_TOOL_TIMEOUT_PAD_SEC = 5; // 훅 시간 제한 위에 판이 답할 여유
export const PRE_TOOL_TIMEOUT_MAX_SEC = 70;
export const PRE_TOOL_WRITES_TIMEOUT_SEC = 10; // 쓰기 범위만 볼 때(판 안에서 끝난다)
export const STOP_TIMEOUT_SEC = 10;
export const STOP_BLOCKS_PER_TRY = 1;

const isAbs = (p) => path.isAbsolute(p) || /^[A-Za-z]:/.test(p) || p.startsWith('/') || p.startsWith('\\');
const badRel = (p) => isAbs(p) || String(p).split(/[\\/]+/).includes('..');

// 정의 검사 → { ok: true, amp: null | { stopVerify, seats: { <자리>: { writes, stopVerify } }, preTool: [{ index, match, seats }] } } | { ok: false, reason }
// raw: 정의 JSON, seats: validateFlow가 고른 자리(없으면 null)
export function validateAmp(raw, { seats = null } = {}) {
  const bad = (reason) => ({ ok: false, reason });
  const known = (n) => !!(seats && Object.prototype.hasOwnProperty.call(seats, n));
  if (raw.stopVerify != null && typeof raw.stopVerify !== 'boolean') return bad('stopVerify는 true 또는 false다');
  if (raw.stopVerify && !seats) return bad('stopVerify는 seats(자리)와 함께 쓴다(자리 세션의 턴 끝을 돌려보낸다)');
  const seatAmp = {};
  for (const [name, x] of Object.entries(raw.seats && typeof raw.seats === 'object' && !Array.isArray(raw.seats) ? raw.seats : {})) {
    if (!x || typeof x !== 'object') continue; // 모양 검사는 validateFlow가 한다
    const at = `seats.${name}`;
    let writes = null;
    if (x.writes != null) {
      if (x.writes === false) writes = false;
      else if (x.writes === true) writes = null;
      else if (Array.isArray(x.writes) && x.writes.every((p) => typeof p === 'string' && p.trim())) {
        const off = x.writes.find(badRel);
        if (off) return bad(`${at}.writes의 경로는 세션 폴더 기준 상대 경로다(절대 경로·..는 쓰지 않는다): ${off}`);
        writes = x.writes.map((p) => p.trim());
      } else return bad(`${at}.writes는 false 또는 경로 배열이다(예: ["items/{item}/"])`);
    }
    if (x.stopVerify != null && typeof x.stopVerify !== 'boolean') return bad(`${at}.stopVerify는 true 또는 false다`);
    if (writes !== null || x.stopVerify != null) seatAmp[name] = { writes, stopVerify: x.stopVerify ?? null };
  }
  const preTool = [];
  const hooks = Array.isArray(raw.hooks) ? raw.hooks : [];
  for (let i = 0; i < hooks.length; i++) {
    const h = hooks[i]; if (!h || typeof h !== 'object') continue;
    const at = `hooks[${i}]`;
    if (h.at !== 'pre-tool') {
      if (h.match != null || h.seat != null) return bad(`${at}.match·seat은 pre-tool 훅에만 쓴다`);
      continue;
    }
    if (!seats) return bad(`${at}: pre-tool 훅은 seats(자리)와 함께 쓴다(자리 세션의 도구 호출 직전에 돈다)`);
    let match = null;
    if (h.match != null) {
      if (typeof h.match !== 'string' || !h.match) return bad(`${at}.match는 도구 이름 정규식 글이다(예: "Bash|Write")`);
      try { new RegExp(`^(?:${h.match})$`); } catch (e) { return bad(`${at}.match가 정규식이 아니다: ${e.message}`); }
      match = h.match;
    }
    let only = null;
    if (h.seat != null) {
      const list = Array.isArray(h.seat) ? h.seat : [h.seat];
      if (!list.length || list.some((n) => typeof n !== 'string' || !known(n))) return bad(`${at}.seat이 없는 자리를 가리킨다: ${JSON.stringify(h.seat)}`);
      only = list.slice();
    }
    preTool.push({ index: i, match, seats: only });
  }
  const has = raw.stopVerify != null || Object.keys(seatAmp).length || preTool.length;
  return { ok: true, amp: has ? { stopVerify: raw.stopVerify === true, seats: seatAmp, preTool } : null };
}

// 그 자리의 증폭 값(정의만으로) → { writes, stopVerify, preTool: [hook 정의…] }
export function seatAmpOf(def, seat) {
  const a = def && def.amp; if (!a) return { writes: null, stopVerify: false, preTool: [] };
  const sa = a.seats[seat] || {};
  const stopVerify = sa.stopVerify != null ? sa.stopVerify : a.stopVerify;
  const preTool = a.preTool.filter((p) => !p.seats || p.seats.includes(seat)).map((p) => ({ ...p, hook: def.hooks.find((h) => h.index === p.index) })).filter((p) => p.hook);
  return { writes: sa.writes ?? null, stopVerify: !!stopVerify, preTool };
}

// Claude Code 권한 규칙의 절대 경로(Windows는 /c/… 꼴로 맞춘다. 문서: //는 파일 시스템 뿌리)
export function rulePath(abs) {
  let p = path.resolve(abs).split(path.sep).join('/');
  const m = /^([A-Za-z]):\/?(.*)$/.exec(p);
  if (m) p = `/${m[1].toLowerCase()}/${m[2]}`;
  return `/${p.replace(/^\/+/, '/')}`.replace(/\/+$/, '');
}
// 사람만 고치는 파일의 경로 뿌리들: 워크스페이스 뿌리, 세션이 그 뿌리의 워크트리 안이면 그 워크트리
function protectBases(root, cwd) {
  const out = [root];
  if (cwd) {
    const rel = path.relative(root, cwd).split(path.sep).join('/');
    const m = /^\.claude\/worktrees\/([^/]+)/.exec(rel);
    if (m) out.push(path.join(root, '.claude', 'worktrees', m[1]));
  }
  return out;
}

// 세션 설정 파일에 넣을 증폭 → { deny: [규칙], hooks: { <이벤트>: { timeout, onFailure? } } } | null
//   x: { writes, stopVerify, preTool, protectedFiles: [상대 경로], root, cwd }
export function claudeSettingsAmp(x) {
  if (!x) return null;
  const deny = [];
  // writes false: 모든 경로의 Edit(파일을 고치는 모든 도구)을 거부한다. 도구 이름만 쓰면(Edit, Write) 도구가 맥락에서 빠져
  //   모델이 막힌 줄 모르고 셸로 파일을 썼다(P189 개발용 판). 경로 규칙이면 도구는 남고 호출이 "denied by your permission settings"로 돌아온다
  if (x.writes === false) deny.push(EDIT_ALL);
  // 경로 규칙은 Edit(…)만: Claude Code는 Edit 규칙을 파일을 고치는 모든 도구(Write·MultiEdit·NotebookEdit)에 쓰고, Write(경로)는 "never matches"라고 경고한다(P189 개발용 판)
  for (const f of x.protectedFiles || []) for (const base of protectBases(x.root, x.cwd)) deny.push(`Edit(${rulePath(path.resolve(base, f))})`);
  const hooks = {};
  const waitPre = x.preTool.length || Array.isArray(x.writes);
  if (waitPre) {
    const maxMs = x.preTool.reduce((n, p) => n + (p.hook.timeoutMs || 0), 0); // 같은 도구에 여러 훅이 차례로 돌 수 있다
    const sec = x.preTool.length ? Math.min(Math.ceil(maxMs / 1000) + PRE_TOOL_TIMEOUT_PAD_SEC, PRE_TOOL_TIMEOUT_MAX_SEC) : PRE_TOOL_WRITES_TIMEOUT_SEC;
    hooks.PreToolUse = { timeout: Math.max(sec, PRE_TOOL_WRITES_TIMEOUT_SEC), ...(x.preTool.some((p) => p.hook.onFail === 'block') ? { onFailure: 'block' } : {}) };
  }
  if (x.stopVerify) hooks.Stop = { timeout: STOP_TIMEOUT_SEC };
  const uniq = [...new Set(deny)];
  if (!uniq.length && !Object.keys(hooks).length) return null;
  return { deny: uniq, hooks };
}
// 설정 파일 JSON에 증폭을 덮어 쓴다(판이 만든 파일이라 deny는 모두 판의 것). 바뀌었으면 true
export function applySettingsAmp(j, amp, baseTimeoutSec = 2) {
  const before = JSON.stringify(j);
  const deny = amp ? amp.deny : [];
  if (deny.length) j.permissions = { ...(j.permissions || {}), deny };
  else if (j.permissions && j.permissions.deny) { const { deny: _d, ...rest } = j.permissions; j.permissions = rest; if (!Object.keys(rest).length) delete j.permissions; }
  for (const [ev, list] of Object.entries(j.hooks || {})) {
    for (const g of list || []) for (const h of g.hooks || []) {
      if (h.type !== 'http') continue;
      const want = amp && amp.hooks[ev];
      h.timeout = want ? want.timeout : baseTimeoutSec;
      if (want && want.onFailure) h.onFailure = want.onFailure; else delete h.onFailure;
    }
  }
  return JSON.stringify(j) !== before;
}

// Codex 인자: writes false면 샌드박스·승인 인자를 걷어 내고 -s read-only(승인을 건너뛰던 것은 -a never). 그 밖은 그대로
const SANDBOX_VALUE_FLAGS = new Set(['-s', '--sandbox']);
const SANDBOX_BARE_FLAGS = new Set(['--dangerously-bypass-approvals-and-sandbox', '--yolo', '--full-auto']);
const APPROVAL_FLAGS = new Set(['-a', '--ask-for-approval']);
const SANDBOX_KEY = /^sandbox_mode\s*=/;
export function codexArgsAmp(args = [], writes = null) {
  const a = (args || []).map(String);
  if (writes !== false) return a;
  const out = []; let bypass = false; let hasApproval = false;
  for (let i = 0; i < a.length; i++) {
    const w = a[i]; const flag = w.split('=')[0];
    if (SANDBOX_VALUE_FLAGS.has(flag)) { if (!w.includes('=')) i++; continue; }
    if (SANDBOX_BARE_FLAGS.has(w)) { if (w !== '--full-auto') bypass = true; continue; }
    if ((w === '-c' || w === '--config') && SANDBOX_KEY.test(a[i + 1] || '')) { i++; continue; }
    if ((w.startsWith('--config=') && SANDBOX_KEY.test(w.slice(9))) || (w.startsWith('-c') && w.length > 2 && SANDBOX_KEY.test(w.slice(2)))) continue;
    if (APPROVAL_FLAGS.has(flag)) hasApproval = true;
    out.push(w);
  }
  if (bypass && !hasApproval) out.push('--ask-for-approval', 'never');
  out.push('--sandbox', 'read-only');
  return out;
}

// 쓰기 범위(경로 목록) 판정: 파일 쓰기 도구의 대상이 범위 밖이면 까닭, 안이면 null
export function writesVerdict({ writes, toolName, toolInput, base, unitId = null }) {
  if (!Array.isArray(writes) || !EDIT_TOOLS.includes(toolName)) return null;
  const file = toolInput && (toolInput.file_path || toolInput.notebook_path || toolInput.path);
  if (!file) return null;
  const abs = path.resolve(base, String(file));
  const norm = (p) => path.resolve(p).toLowerCase();
  const roots = writes.filter((p) => unitId || !p.includes('{item}')).map((p) => path.resolve(base, p.split('{item}').join(unitId || '')));
  const ok = roots.some((r) => { const rel = path.relative(norm(r), norm(abs)); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); });
  return ok ? null : `rig 자리의 쓰기 범위 밖이다: ${String(file)}. 쓸 수 있는 곳: ${writes.join(', ')}`;
}

// PreToolUse 응답 본문
export const denyBody = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
// Stop 응답 본문
export const stopBlockBody = (reason) => ({ decision: 'block', reason });
export function stopReason(results) {
  const vals = (results && results.length ? results : ['ok', 'failed']).join('|');
  return `[Atrium 보드] 이 자리의 일이 아직 열려 있다. 일을 마쳤으면 \`atrium done ${vals} "<보고>"\`로 닫고, 아직이면 이어서 한다. 사람이나 다른 자리의 답을 기다리는 중이면 그대로 멈춰도 된다(다시 막지 않는다).`;
}

// 판에 붙는 증폭기. b: 백엔드(store, sessions, rig, log, hooked)
export class RigAmp {
  constructor(b) { this.b = b; this.stopBlocks = new Map(); /* 시도 ID → 막은 수 */ }

  // 사람만 고치는 목록: P188 rig.mjs의 rigProtected(workspaceKey) 하나가 읽는다 → { pointers, files: [{ path, sha256, at }] } | null
  protectedOf(key) { return this.b.rig ? this.b.rig.rigProtected(key) : null; }

  // 그 세션의 증폭 맥락 → null | { key, r, seat, kind, writes, stopVerify, preTool, protectedFiles, root, cwd }
  ctxOf(s) {
    if (!s || !s.rigSeat || !this.b.rig) return null;
    const r = this.b.rig.active(s.workspaceKey);
    if (!r || !r.def.seats || !r.def.seats[s.rigSeat]) return null;
    const sa = seatAmpOf(r.def, s.rigSeat);
    const prot = this.protectedOf(s.workspaceKey);
    const protectedFiles = prot && Array.isArray(prot.files) ? prot.files.map((f) => f && f.path).filter((p) => typeof p === 'string' && p && !badRel(p)) : [];
    return { key: s.workspaceKey, r, seat: s.rigSeat, kind: s.kind || 'claude', ...sa, protectedFiles, root: r.root, cwd: (s.rt && s.rt.cwd) || s.cwd || r.root };
  }
  // Claude Code 세션 설정 파일에 넣을 증폭(writeSessionSettings의 amp)
  claudeAmp(s) { const x = this.ctxOf(s); return x && x.kind === 'claude' ? claudeSettingsAmp(x) : null; }
  // Codex 인자
  launcherArgs(s, args) { const x = this.ctxOf(s); return x && x.kind === 'codex' ? codexArgsAmp(args, x.writes) : (args || []); }
  // 설정 파일을 지금 정의·자리에 맞춘다(자리를 정하거나 정의가 바뀐 뒤 다음 턴부터). 바뀌었으면 true
  syncSettings(s) {
    if (!s || (s.kind || 'claude') !== 'claude' || !s.settingsPath) return false;
    const amp = this.claudeAmp(s);
    const sig = JSON.stringify(amp);
    if (s.ampSig === sig) return false;
    try {
      const j = JSON.parse(fs.readFileSync(s.settingsPath, 'utf8'));
      const changed = applySettingsAmp(j, amp, (this.b.cfg && this.b.cfg.hookTimeoutSec) || 2);
      if (changed) fs.writeFileSync(s.settingsPath, JSON.stringify(j, null, 2));
      s.ampSig = sig;
      if (changed) { try { this.b.store.addEvent(s.sessionId, 'rig_amp_settings', { seat: s.rigSeat || null, deny: amp ? amp.deny.length : 0, hooks: amp ? Object.keys(amp.hooks) : [] }); } catch {} }
      return changed;
    } catch (e) { this.b.log && this.b.log(`rig amp settings ${s.name}: ${e.message}`); return false; }
  }

  // hook 수신기: 이 hook에 판이 판단을 끝내고 답해야 하는가(아니면 지금처럼 먼저 200)
  wants(s, ev) {
    if (ev !== 'PreToolUse' && ev !== 'Stop') return false;
    if ((s.kind || 'claude') !== 'claude') return false;
    const x = this.ctxOf(s); if (!x) return false;
    if (ev === 'PreToolUse') return x.preTool.length > 0 || Array.isArray(x.writes);
    return x.stopVerify;
  }
  // → 응답 본문(객체) | null(빈 200 = 통과)
  async answer(s, ev, body) {
    const x = this.ctxOf(s); if (!x) return null;
    if (ev === 'PreToolUse') return this.preTool(s, x, body);
    if (ev === 'Stop') return this.stop(s, x, body);
    return null;
  }
  async preTool(s, x, body) {
    const st = this.b.store;
    const tr = st.openTryOf ? st.openTryOf(s.sessionId) : null;
    const toolName = String(body.tool_name || ''); const toolInput = body.tool_input || {};
    const w = writesVerdict({ writes: x.writes, toolName, toolInput, base: x.cwd, unitId: tr ? tr.unitId : null });
    if (w) { try { st.addEvent(s.sessionId, 'rig_pre_tool', { decision: 'deny', why: 'writes', tool: toolName }); } catch {} this.gateEvent(s, x, tr, 'pre-tool', { why: 'writes', tool: toolName, target: String(toolInput.file_path || toolInput.path || toolInput.notebook_path || '') || null }, w); return denyBody(w); }
    const hooks = x.preTool.filter((p) => !p.match || new RegExp(`^(?:${p.match})$`).test(toolName)).map((p) => p.index);
    if (!hooks.length) return null;
    const unit = tr && st.getUnit ? st.getUnit(tr.unitId) : null;
    const { sessionInfo } = await import('./rig.mjs');
    const res = await this.b.rig.runAt(x.r, {
      key: x.key, at: 'pre-tool', session: sessionInfo(s), from: { kind: 'agent', session: sessionInfo(s) },
      unit: unit ? { id: unit.id, from: unit.from, spec: unit.spec, origin: unit.origin } : null, try: tr ? { id: tr.id, startedAt: tr.startedAt } : null,
      after: { toolName, toolInput, toolUseId: body.tool_use_id || null }, match: (h) => hooks.includes(h.index),
    });
    if (res.action === 'reject') return denyBody(`[Atrium rig] ${res.reason || '도구 호출 직전 관문이 거절했다'}`);
    return null;
  }
  // P217: 훅이 아닌 관문(쓰기 범위, stopVerify)의 장부 줄. 값은 reject(돌려보냄), ref는 없다(훅 실행 행이 없다)
  gateEvent(s, x, tr, at, data, why) {
    const u = tr && this.b.store.getUnit ? this.b.store.getUnit(tr.unitId) : null;
    rigEvent(this.b, { kind: 'gate', ws: x.key || s.workspaceKey, caseId: u ? u.caseId || null : null, unitId: tr ? tr.unitId : null, tryId: tr ? tr.id : null, seat: x.seat || s.rigSeat || null, session: s.sessionId, value: 'reject', actor: 'board', text: `${at}: ${why}`, data: { at, hook: null, ...data } });
  }
  // 판이 다시 떴을 때: 기록(events rig_stop_block)에서 그 시도를 막은 수
  blocksFromLog(sessionId, tryId) {
    try { const r = this.b.store.st("SELECT COUNT(*) AS n FROM events WHERE session_id = ? AND kind = 'rig_stop_block' AND data LIKE ?").get(sessionId, `%"tryId":"${String(tryId).replace(/[%_"]/g, '')}"%`); return r ? r.n : 0; } catch { return 0; }
  }
  stop(s, x, body) {
    const st = this.b.store;
    const tr = st.openTryOf ? st.openTryOf(s.sessionId) : null;
    if (!tr) return null; // 열린 시도가 없으면 막지 않는다
    if (body.stop_hook_active === true) return null; // 이미 Stop hook으로 이어 가는 중
    const n = this.stopBlocks.has(tr.id) ? this.stopBlocks.get(tr.id) : this.blocksFromLog(s.sessionId, tr.id);
    if (n >= STOP_BLOCKS_PER_TRY) return null; // 시도마다 한 번. 그 뒤는 0단계 멈춤 알림이 상위에게 간다
    this.stopBlocks.set(tr.id, n + 1);
    try { st.addEvent(s.sessionId, 'rig_stop_block', { tryId: tr.id, unitId: tr.unitId, seat: x.seat, n: n + 1 }); } catch {}
    this.gateEvent(s, x, tr, 'stop-verify', { n: n + 1 }, '턴 끝을 한 번 돌려보냈다(stopVerify)');
    return stopBlockBody(stopReason(x.r.def.results));
  }
}
