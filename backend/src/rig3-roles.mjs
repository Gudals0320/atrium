// P241: rig 3 1단계의 역할 세션(docs research rig3-skeleton.md 4절 "판이 하는 일", rig3-roles.md 3.2·11.3).
// - 켜면(rig.enable, 사람만) 역할마다 늘 떠 있는 세션 하나를 띄운다. 판이 고르는 이름은 <역할>(쓰였으면 <역할>-<n>), 폴더는 워크스페이스 뿌리.
// - 무인: Claude Code는 --permission-mode bypassPermissions, Codex는 -s workspace-write -a never(+ -C <첫 섹터> --add-dir <나머지·기억>).
//   켜기 확인 한 번이 승인이다(rig 2의 무인 승인 행·자리 승인 카드는 없다).
// - 쓰기 범위 = 쥔 섹터 + 자기 기억 폴더(.atrium/roles/<역할>/). Claude Code는 세션 설정 파일(rig 2와 같은 writeSessionSettings 길)의
//   PreToolUse를 판이 기다려 답한다: 편집 도구(Edit·Write·MultiEdit·NotebookEdit)가 범위 밖이면 묻지 않고 거절, Bash 안의 셸(cmd·powershell·pwsh)도 거절.
//   정의 파일(rig.json, 목적, 정의서)은 설정 파일 deny에도 넣는다. 셸 명령의 쓰기는 막지 못한다(P241 조사, 보고).
// - 첫 글(판 알림)에 목적·정의서·기억을 싣는다(rig3.mjs loadText). 기억은 역할이 .atrium/roles/<역할>/memory.md에 직접 쓴다.
// - 주기(ROLE_TICK_MS)마다: 역할 세션이 없으면(닫힘) 또는 끝난 채(exited) ROLE_DEAD_GRACE_MS가 지나면 끝난 세션을 닫고 같은 글을 실어 새로 띄운다.
//   다시 띄우기는 역할마다 RESPAWN_WINDOW_MS 안에 RESPAWN_MAX번까지. 넘으면 그만두고 장부에 role_gave_up(다시 켜면 풀린다).
//   쉬는 역할 세션(ready, ROLE_IDLE_MS 넘게)은 판이 혼자 재운다(sleeper.sleep scope session). 잠든 세션에 전달이 오면 지금 길(대기열)이 깨운다.
// - 장부(rig_events): role_spawn, role_respawn, role_gave_up, role_write_denied, role_slept(rig-ledger RIG3_EVENT_KINDS). seat 열에 역할 이름.
// - 끄면 다시 띄우기를 멈추고 역할 세션을 재운다(P242: 닫지 않는다. 일하는 턴은 끝난 뒤 재우고, 아직 넣지 않은 판 알림은 거둔다). 켜면 잠든 역할 세션을 깨운다(role_woke).
import fs from 'node:fs';
import path from 'node:path';
import { rigEvent } from './rig-ledger.mjs';
import { claudeSettingsAmp, applySettingsAmp, writesVerdict, nestedShell, codexArgsAmp, denyBody } from './rig-amp.mjs';
import { sleepTarget, sessionActivity, idleSince } from './sleep.mjs';
import { deriveState } from './state.mjs';
import { shownName } from './session-label.mjs';
import { Rig3Guard } from './rig3-guard.mjs'; // P243: 턴 끝 남의 쓰기 되돌리기
import { roleWrites, roleProtected, roleRoute, codexRoleArgs, loadText, readLoadFiles, checkRoleDoc, memoryDir, BUILDER_ROLE, builderWrites } from './rig3.mjs';
import { Rig3Builder } from './rig3-builder.mjs'; // P247: 빌더 세션
import { Rig3Items } from './rig3-items.mjs'; // P242: 항목·길·받음
import { Rig3Beat } from './rig3-beat.mjs'; // P244: 박자·도구·사이클 요약
import { Rig3Tune } from './rig3-tune.mjs'; // P245: 조정과 되돌리기

// 판이 역할을 위해 띄울 때(backend.spawn) 넘기는 역할 이름의 열쇠. Symbol이라 판 API 본문으로는 넣지 못한다
export const ROLE_SPAWN = Symbol.for('atrium.rig3RoleSpawn');
export const ROLE_TICK_MS = 10000;
export const ROLE_IDLE_MS = 15 * 60 * 1000;
export const ROLE_DEAD_GRACE_MS = 8000; // 끝난 세션을 판의 다른 되살리기(relaunchIfEmpty 등)에 먼저 맡기는 시간
export const RESPAWN_MAX = 3;
export const RESPAWN_WINDOW_MS = 10 * 60 * 1000;
export const SLEEP_RETRY_MS = 5 * 60 * 1000;
export const ROLE_PERMISSION_MODE = 'bypassPermissions';
export const ROLE_NESTED_SHELL_REASON = '[Atrium rig] rig 역할 세션은 Bash 도구 안에서 cmd·powershell·pwsh를 부르지 않는다(판이 그 안의 쓰기를 보지 못한다). 파일 목록·내용·찾기는 PowerShell 도구나 Glob·Read·Grep 도구로 한다.';
export const builderDenyReason = (file, writes) => `[Atrium rig] 빌더의 쓰기 범위 밖이다: ${file}. 빌더가 쓰는 곳: ${writes.join(', ')}. 역할의 섹터와 기억 폴더는 역할의 것이다(읽기만 한다).`; // P247
export const roleDenyReason = (role, file, writes) => `[Atrium rig] 역할 ${role}의 쓰기 범위 밖이다: ${file}. 쓸 수 있는 곳: ${writes.join(', ')}. 다른 섹터는 그 역할의 것이다(읽기만 한다).`;

export class Rig3Roles {
  constructor(b) {
    this.b = b;
    this.spawning = new Set(); // '<키>|<역할>'
    this.respawns = new Map(); // '<키>|<역할>' → [시각…]
    this.gaveUp = new Set();
    this.exitSeen = new Map(); // 세션 ID → 처음 끝난 것을 본 때
    this.sleepFail = new Map(); // 세션 ID → 마지막 재우기 실패 때
    this.ticking = false;
    this.items = new Rig3Items(b, this); // P242
    this.offSleep = new Set(); // P242: 끈 rig(키) — 역할 세션을 모두 재울 때까지 주기마다 본다(일하는 턴은 끝나기를 기다린다)
    this.guard = new Rig3Guard(b, this); // P243
    this.beat = new Rig3Beat(b, this); // P244
    this.tune = new Rig3Tune(b, this); // P245
    this.builder = new Rig3Builder(b, this); // P247
    this.docNotices = new Map(); // P247: '<키>|<역할>' → [글] (정의·정의서가 바뀜, 다음 깨우는 글에)
    this.restart = new Set(); // P247: 쥔 섹터·도구·런처가 바뀐 역할('<키>|<역할>'), 다음 쉴 때 다시 띄운다
  }
  ms(name, dflt) { const v = this.b.cfg && this.b.cfg[name]; return v != null && Number(v) >= 0 ? Number(v) : dflt; }
  store() { return this.b.store; }
  // 켜진 v3 rig의 읽기 결과 | null
  active(key) { const r = key && this.b.rig ? this.b.rig.active(key) : null; return r && r.def && r.def.v3 ? r : null; }
  // 판이 아는 v3 정의(켜짐과 상관없이) | null
  defOf(key) { const r = key && this.b.rig ? this.b.rig.read(key) : null; return r && r.def && r.def.v3 ? r : null; }
  // 그 세션의 역할 맥락 → { key, r, r3, role, writes, root } | null
  //   켜짐과 상관없이 정의(마지막 맞은 정의)가 있으면 지킨다: 끈 뒤에도 떠 있는 역할 세션은 무인(bypass)이므로 쓰기 범위를 풀지 않는다
  ctxOf(s) {
    if (!s || !s.rigRole) return null;
    const r = this.defOf(s.workspaceKey);
    const r3 = r && r.def.rig3;
    const role = r3 && r3.roles[s.rigRole];
    if (!role) return null;
    return { key: s.workspaceKey, r, r3, role, writes: roleWrites(role), root: r.root };
  }
  sessionsOf(key, role) { return [...this.b.sessions.values()].filter((x) => x.workspaceKey === key && x.rigRole === role && !x.closedAt); }

  // ---------- 띄우기 값(backend.spawn이 부른다) ----------
  // Claude Code 세션 설정 파일의 증폭(rig 2 claudeSettingsAmp와 같은 꼴: deny, hooks.PreToolUse, permissions)
  claudeAmp(key, roleName, cwd = null) {
    if (roleName === BUILDER_ROLE) { // P247: 빌더(rig가 없는 워크스페이스에서도)
      const root = this.b.rig ? this.b.rig.rootOf(key) : null; if (!root) return null;
      const d = this.defOf(key);
      return claudeSettingsAmp({ writes: builderWrites(d ? d.def.rig3 : null), stopVerify: false, preTool: [], protectedFiles: [], root, cwd: cwd || root, permission: 'unattended', allow: [], deny: [], promptless: false });
    }
    const r = this.defOf(key); const r3 = r && r.def.rig3; const role = r3 && r3.roles[roleName];
    if (!role) return null;
    return claudeSettingsAmp({ writes: roleWrites(role), stopVerify: false, preTool: [], protectedFiles: roleProtected(r3), root: r.root, cwd: cwd || r.root, permission: 'unattended', allow: [], deny: [], promptless: false });
  }
  // backend.spawn: 이 역할 세션을 띄울 값 → { role, permissionMode, amp } | null(v3 역할이 아니다)
  launchOf(key, roleName, { kind = 'claude', cwd = null } = {}) {
    if (roleName === BUILDER_ROLE) return { role: BUILDER_ROLE, permissionMode: kind === 'claude' ? ROLE_PERMISSION_MODE : null, amp: kind === 'claude' ? this.claudeAmp(key, BUILDER_ROLE, cwd) : null }; // P247
    const r = this.defOf(key);
    if (!r || !r.def.rig3.roles[roleName]) return null;
    return { role: roleName, permissionMode: kind === 'claude' ? ROLE_PERMISSION_MODE : null, amp: kind === 'claude' ? this.claudeAmp(key, roleName, cwd) : null };
  }
  // 하네스(Codex) 인자: 무인과 섹터(-C, --add-dir). 다른 종류는 그대로
  launcherArgs(s, args) {
    if (!s || !s.rigRole || (s.kind || 'claude') !== 'codex') return args || [];
    const r = this.defOf(s.workspaceKey); const role = r && r.def.rig3.roles[s.rigRole];
    if (!role) return args || [];
    return codexRoleArgs(codexArgsAmp(args || [], null, 'unattended'), r.root, role);
  }

  // 설정 파일을 지금 정의에 맞춘다(rig 2 RigAmp.syncSettings 대신. 턴 시작·끝, 다시 띄우기 전). 바뀌었으면 true
  //   Claude Code는 떠 있는 동안 --settings를 다시 읽지 않으므로 다음에 띄울 때(깨우기 포함)부터 먹는다. 쓰기 범위는 PreToolUse가 지금 정의로 바로 본다
  syncSettings(s) {
    if (!s || !s.rigRole || (s.kind || 'claude') !== 'claude' || !s.settingsPath) return false;
    const amp = this.claudeAmp(s.workspaceKey, s.rigRole, (s.rt && s.rt.cwd) || s.cwd);
    if (!amp) return false; // 정의가 없으면 손대지 않는다(지금 거절 규칙을 남긴다)
    const sig = JSON.stringify(amp);
    if (s.rig3AmpSig === sig) return false;
    try {
      const j = JSON.parse(fs.readFileSync(s.settingsPath, 'utf8'));
      const base = this.b.branch && this.b.branch.settingsExtra ? (this.b.branch.settingsExtra(s.sessionId).allow || []) : null;
      const changed = applySettingsAmp(j, amp, (this.b.cfg && this.b.cfg.hookTimeoutSec) || 2, base);
      if (changed) fs.writeFileSync(s.settingsPath, JSON.stringify(j, null, 2));
      s.rig3AmpSig = sig;
      return changed;
    } catch (e) { this.b.log && this.b.log(`rig3 settings ${s.name}: ${e.message}`); return false; }
  }

  // ---------- hook(PreToolUse) ----------
  wants(s, ev) { return ev === 'PreToolUse' && (s.kind || 'claude') === 'claude' && (!!this.ctxOf(s) || s.rigRole === BUILDER_ROLE); } // P247: 빌더도
  // P247: 빌더 세션의 PreToolUse: 셸 안의 셸과 쓰기 범위(.atrium/, 도구 스크립트) 밖 편집을 막는다
  builderAnswer(s, body) {
    const root = this.b.rig ? this.b.rig.rootOf(s.workspaceKey) : null; if (!root) return null;
    const toolName = String(body.tool_name || ''); const input = body.tool_input || {};
    if (toolName === 'Bash' && nestedShell(input.command)) return denyBody(ROLE_NESTED_SHELL_REASON);
    const writes = this.builder.writes(s.workspaceKey);
    if (!writesVerdict({ writes, toolName, toolInput: input, base: root })) return null;
    const file = String(input.file_path || input.notebook_path || input.path || '');
    try { this.store().addEvent(s.sessionId, 'rig3_denied', { role: BUILDER_ROLE, why: 'writes', tool: toolName, target: file }); } catch {}
    return denyBody(builderDenyReason(file, writes));
  }
  async answer(s, ev, body) {
    if (s && s.rigRole === BUILDER_ROLE) return ev === 'PreToolUse' ? this.builderAnswer(s, body) : null; // P247
    const x = this.ctxOf(s); if (!x || ev !== 'PreToolUse') return null;
    const toolName = String(body.tool_name || ''); const input = body.tool_input || {};
    if (toolName === 'Bash') {
      const sh = nestedShell(input.command);
      if (sh) { this.denied(s, x, { why: 'nested_shell', tool: toolName, shell: sh, target: String(input.command || '').slice(0, 200) }); return denyBody(ROLE_NESTED_SHELL_REASON); }
    }
    const w = writesVerdict({ writes: x.writes, toolName, toolInput: input, base: x.root });
    if (!w) return null;
    const file = String(input.file_path || input.notebook_path || input.path || '');
    this.denied(s, x, { why: 'writes', tool: toolName, target: file });
    return denyBody(roleDenyReason(x.role.name, file, x.writes));
  }
  denied(s, x, data) {
    try { this.store().addEvent(s.sessionId, 'rig3_denied', { role: x.role.name, ...data }); } catch {}
    rigEvent(this.b, { kind: 'role_write_denied', ws: x.key, seat: x.role.name, session: s.sessionId, value: data.why, actor: 'board', text: `${data.tool} ${data.why === 'writes' ? '섹터 밖 쓰기' : '셸 안의 셸'} 거절: ${data.target || '-'}`, data });
  }

  // ---------- 켜기·띄우기 ----------
  // rig.setEnabled 뒤(켜기·끄기). 켜면 역할마다 세션이 없으면 띄운다 → [{ role, name | error }]
  async onEnabled(key, on) {
    for (const k of [...this.gaveUp]) if (k.startsWith(key + '|')) this.gaveUp.delete(k);
    for (const k of [...this.respawns.keys()]) if (k.startsWith(key + '|')) this.respawns.delete(k);
    if (!on) { // P242: 끄면 역할 세션을 재운다(닫지 않는다). 아직 넣지 않은 판 알림은 거두고, 일하는 턴은 끝난 뒤 재운다
      this.offSleep.add(key);
      this.items.cancelQueued(key);
      const out = await this.sleepOff(key);
      this.changed(key);
      return out;
    }
    this.offSleep.delete(key);
    const r = this.active(key); if (!r) return [];
    this.guard.prime(key); // P243: 기준 목록이 없으면 만든다
    try { this.beat.ensureBase(key); } catch (e) { this.b.log && this.b.log('rig3 beat base ' + e.message); } // P244: 사이클 0(첫 채움)
    const out = [];
    // P242: 켜면 잠든 역할 세션을 깨운다(같은 대화로 잇는다)
    for (const role of Object.keys(r.def.rig3.roles)) for (const s of this.sessionsOf(key, role)) {
      if (!(s.rt && s.rt.sleep) || !this.b.sleeper || !this.b.sleeper.wake) continue;
      try { await this.b.sleeper.wake(s, 'rig'); rigEvent(this.b, { kind: 'role_woke', ws: key, seat: role, session: s.sessionId, actor: 'board', text: `@${shownName(s) || s.name} rig를 켜 깨움` }); out.push({ role, name: s.name, woke: true }); }
      catch (e) { this.b.log && this.b.log(`rig3 wake ${s.name}: ${e.code || e.message}`); out.push({ role, name: s.name, wakeError: e.code || e.message }); }
    }
    for (const role of Object.keys(r.def.rig3.roles)) {
      if (this.sessionsOf(key, role).length) { if (!out.some((x) => x.role === role)) out.push({ role, name: this.sessionsOf(key, role)[0].name, kept: true }); continue; }
      try { const s = await this.spawnRole(key, role, 'spawn'); out.push({ role, name: s.name }); }
      catch (e) { out.push({ role, error: e.code || e.message }); this.b.log && this.b.log(`rig3 role ${role} spawn failed: ${e.stack || e.message}`); }
    }
    this.changed(key);
    return out;
  }
  // 섹터와 기억 폴더가 없으면 만든다(켜기는 사람이 고른 동작이다. 폴더만 만들고 파일은 쓰지 않는다)
  ensureDirs(root, role) { for (const p of roleWrites(role)) { try { fs.mkdirSync(path.resolve(root, p), { recursive: true }); } catch {} } }
  pickName(role) {
    const taken = new Set([...this.b.sessions.values()].flatMap((x) => [x.name, shownName(x)]).filter(Boolean).map((x) => String(x).toLowerCase()));
    for (const n of (this.b.spawningNames || [])) taken.add(String(n).toLowerCase());
    if (!taken.has(role)) return role;
    for (let i = 2; i < 1000; i++) if (!taken.has(`${role}-${i}`)) return `${role}-${i}`;
    return null;
  }
  // 역할 세션 하나를 띄우고 첫 글(목적·정의서·기억)을 넣는다. why: spawn | respawn → 세션
  async spawnRole(key, roleName, why = 'spawn', prev = null) {
    const r = this.active(key);
    if (!r) throw Object.assign(new Error('켜진 rig 3이 아니다'), { code: 'rig3_off' });
    const r3 = r.def.rig3; const role = r3.roles[roleName];
    if (!role) throw Object.assign(new Error(`없는 역할: ${roleName}`), { code: 'rig3_role' });
    const k = `${key}|${roleName}`;
    if (this.spawning.has(k)) throw Object.assign(new Error('띄우는 중'), { code: 'rig3_spawning' });
    this.spawning.add(k);
    try {
      this.ensureDirs(r.root, role);
      const route = roleRoute(role);
      const name = this.pickName(roleName);
      const p = { name, cwd: r.root, ...(route.kind ? { kind: route.kind } : {}), ...(route.launcher ? { launcher: route.launcher } : {}), ...(role.model ? { model: role.model } : {}), ...(role.effort ? { effort: role.effort } : {}), [ROLE_SPAWN]: roleName }; // P242: effort
      const res = await this.b.spawn(p);
      const s = this.b.sessions.get(res.sessionId);
      if (!s) throw Object.assign(new Error(`${roleName} 역할 세션이 판에 등록되지 않았다`), { code: 'spawn_failed' });
      if (s.rigRole !== roleName) { s.rigRole = roleName; if (this.store().setSessionRole) this.store().setSessionRole(s.sessionId, roleName); }
      const text = loadText(r3, roleName, readLoadFiles(r.root, r3, roleName), { root: r.root, why, inbox: this.inboxLines(key, roleName) });
      if (this.b.queue) this.b.queue.enqueue(s.sessionId, text, { origin: { kind: 'board' } });
      const kind = why === 'spawn' ? 'role_spawn' : 'role_respawn';
      rigEvent(this.b, { kind, ws: key, seat: roleName, session: s.sessionId, actor: 'board', text: `@${shownName(s) || s.name}${prev ? ` (앞 세션 @${prev.name}: ${prev.why})` : ''}`, data: { why, kind: s.kind || 'claude', launcher: role.launcher || 'claude', model: role.model || null, effort: role.effort || null, permissionMode: s.permissionMode || null, writes: roleWrites(role), ...(prev ? { prev } : {}) } });
      try { this.store().addEvent(s.sessionId, 'rig3_role_spawn', { role: roleName, why, prev: prev || null }); } catch {}
      this.b.log && this.b.log(`rig3 role ${roleName} ${why} ${s.name} (${s.sessionId})`);
      if (this.b.broadcastSession) try { this.b.broadcastSession(s, { cause: 'rig3_role' }); } catch {}
      return s;
    } finally { this.spawning.delete(k); }
  }

  // P242: 끈 rig의 역할 세션을 재운다. 쉬는(ready) 세션만 재우고, 일하는 턴이 있는 세션은 다음 주기에 다시 본다. 다 재우면 키를 뗀다 → [{ role, slept | waiting }]
  async sleepOff(key, now = Date.now()) {
    const out = [];
    const r = this.defOf(key);
    if (!r || this.active(key)) { this.offSleep.delete(key); return out; }
    const sl = this.b.sleeper;
    let left = 0;
    for (const role of Object.keys(r.def.rig3.roles)) for (const s of this.sessionsOf(key, role)) {
      if ((s.rt && (s.rt.sleep || s.rt.exit)) || (sl && sl.isAsleep && sl.isAsleep(s))) continue;
      const st = s.rt ? deriveState(s.rt).state : null;
      if (!sl || st !== 'ready') { left++; out.push({ role, waiting: st || 'unknown' }); continue; }
      try {
        await sl.sleep(s, { by: 'rig', mode: 'hand', scope: 'session' });
        rigEvent(this.b, { kind: 'role_slept', ws: key, seat: role, session: s.sessionId, value: 'rig_off', actor: 'board', text: `@${shownName(s) || s.name} rig를 꺼 재움` });
        out.push({ role, slept: s.name });
      } catch (e) { left++; out.push({ role, waiting: e.code || e.message }); }
    }
    if (!left) this.offSleep.delete(key);
    return out;
  }

  // ---------- 주기 ----------
  async tick(now = Date.now()) {
    if (this.ticking) return [];
    this.ticking = true;
    const out = [];
    try {
      for (const key of [...this.offSleep]) { try { for (const x of await this.sleepOff(key, now)) out.push({ ws: key, off: true, ...x }); } catch (e) { this.b.log && this.b.log(`rig3 off sleep: ${e.message}`); } } // P242
      const st = this.store();
      for (const w of st.workspaces ? st.workspaces() : []) {
        let r = null; try { r = this.active(w.key); } catch { r = null; }
        if (!r) continue;
        for (const role of Object.keys(r.def.rig3.roles)) {
          try { const x = await this.keep(w.key, role, now); if (x) out.push({ ws: w.key, role, ...x }); }
          catch (e) { this.b.log && this.b.log(`rig3 tick ${role}: ${e.stack || e.message}`); }
        }
        try { for (const x of await this.beat.tick(w.key, r, now)) out.push({ ws: w.key, ...x }); } catch (e) { this.b.log && this.b.log(`rig3 beat tick: ${e.stack || e.message}`); } // P244: 박자·every 도구
      }
    } finally { this.ticking = false; }
    return out;
  }
  // 역할 하나를 지킨다 → 한 일 | null
  async keep(key, role, now = Date.now()) {
    const k = `${key}|${role}`;
    if (this.spawning.has(k) || this.gaveUp.has(k)) return null;
    const live = this.sessionsOf(key, role);
    const alive = live.filter((s) => !(s.rt && s.rt.exit && !s.rt.sleep));
    for (const s of alive) this.exitSeen.delete(s.sessionId);
    if (alive.length && this.restart.has(k)) { const x = await this.redo(key, role, alive[0]); if (x) return x; } // P247: 쥔 섹터·도구가 바뀌었으면 쉴 때 다시 띄운다
    if (alive.length) { const w = this.items.watch(key, role, alive[0], now); return w || this.tune.check(key, role, alive[0], now) || this.idle(alive[0], now); } // P242: 받은 것에 답하지 않고 멈춘 역할을 먼저 본다. P245: 조정 턴(재료가 쌓였으면)
    let prev = null;
    if (live.length) { // 끝난 채(exited)
      const s = live[0];
      const seen = this.exitSeen.get(s.sessionId) || now;
      this.exitSeen.set(s.sessionId, seen);
      if (now - seen < this.ms('rig3DeadGraceMs', ROLE_DEAD_GRACE_MS)) return { waiting: 'exited' };
      prev = { sessionId: s.sessionId, name: s.name, why: 'exited', exit: s.rt.exit ? s.rt.exit.kind || null : null };
      for (const x of live) { try { if (this.b.kill) await this.b.kill({ session: x.sessionId, confirm: true }); } catch (e) { this.b.log && this.b.log(`rig3 close exited ${x.name}: ${e.message}`); } this.exitSeen.delete(x.sessionId); }
    } else {
      const last = this.lastSpawn(key, role);
      prev = last ? { sessionId: last.session, name: last.name || last.session, why: 'closed' } : null;
    }
    const times = (this.respawns.get(k) || []).filter((t) => now - t < this.ms('rig3RespawnWindowMs', RESPAWN_WINDOW_MS));
    if (prev && times.length >= this.ms('rig3RespawnMax', RESPAWN_MAX)) {
      this.gaveUp.add(k);
      rigEvent(this.b, { kind: 'role_gave_up', ws: key, seat: role, actor: 'board', n: times.length, text: `${role}: ${Math.round(this.ms('rig3RespawnWindowMs', RESPAWN_WINDOW_MS) / 60000)}분 안에 ${times.length}번 다시 띄워 그만둔다. rig를 껐다 켜면 다시 띄운다`, data: { prev } });
      this.b.log && this.b.log(`rig3 role ${role}: gave up respawning`);
      this.changed(key);
      return { gaveUp: true };
    }
    if (prev) { times.push(now); this.respawns.set(k, times); }
    const s = await this.spawnRole(key, role, prev ? 'respawn' : 'spawn', prev);
    this.changed(key);
    return { spawned: s.name, why: prev ? prev.why : 'missing' };
  }
  // ---------- P247: 정의·정의서가 바뀐 판 ----------
  // Rig.adopt가 새 판을 남긴 뒤 부른다. 떠 있는 역할에게 다음 깨우는 글에 알리고, 쥔 섹터·도구·런처가 바뀐 역할은 다시 띄울 표시를 한다
  onVersion(key, { n, by, note = null, changed = null, prev = null, def = null } = {}) {
    if (!def || !def.v3 || !changed || !changed.length) return [];
    const r3 = def.rig3; const out = [];
    const pick = (x) => (x ? JSON.stringify({ owns: x.owns, tools: x.tools, launcher: x.launcher || 'claude', model: x.model || null, effort: x.effort || null }) : null);
    for (const role of Object.keys(r3.roles)) {
      if (by === 'role:' + role) continue; // 자기 조정
      if (note && String(note).startsWith('rollback ' + role + ' ')) continue; // 사람의 되돌림은 따로 알린다(P245)
      const parts = changed.filter((p) => p === 'rig.json' || p === 'purpose' || p === 'role:' + role);
      if (!parts.length) continue;
      const k = key + '|' + role;
      const was = prev && prev.rig3 ? prev.rig3.roles[role] : null;
      const moved = parts.includes('rig.json') && was && pick(was) !== pick(r3.roles[role]);
      if (moved) this.restart.add(k);
      const what = parts.map((p) => (p === 'rig.json' ? '정의(rig.json)' : p === 'purpose' ? '목적(' + r3.purpose + ')' : '정의서(' + r3.roles[role].doc + ')'));
      const text = '[Atrium 보드] 판 ' + n + '(' + (by === 'builder' ? '빌더' : by === 'human' ? '사람' : by) + ')에서 ' + what.join(', ') + '이 바뀌었다. ' + (parts.includes('role:' + role) ? '정의서가 바뀌었다, 다시 읽는다: ' + r3.roles[role].doc + '. ' : '') + (parts.includes('purpose') ? '목적 문서를 다시 읽는다. ' : '') + (parts.includes('rig.json') ? '받는 것·내는 것은 atrium guide로 다시 본다.' : '') + (moved ? ' 쥔 섹터·도구가 바뀌어 다음 쉴 때 판이 이 세션을 새로 띄운다.' : '');
      const l = (this.docNotices.get(k) || []).filter((x) => !x.startsWith('[Atrium 보드] 판 ')); // 앞선 바뀜 알림은 새 것으로 갈음한다
      l.push(text.trim()); this.docNotices.set(k, l);
      out.push({ role, parts, restart: !!moved });
    }
    if (out.length) this.b.log && this.b.log('rig3 version ' + n + ' by ' + by + ': notices ' + out.map((x) => x.role + (x.restart ? '(restart)' : '')).join(', '));
    return out;
  }
  takeDocNotices(key, role) { const k = key + '|' + role; const l = this.docNotices.get(k) || []; this.docNotices.delete(k); return l; }
  // 다시 띄울 표시가 있는 역할: 쉬거나(ready) 잠들었으면 닫고 새로 띄운다. 일하는 중이거나 넣을 글이 남았으면 다음 주기에 → 한 일 | null
  async redo(key, role, s) {
    if (!this.active(key)) return null;
    const asleep = !!(s.rt && s.rt.sleep);
    const st = s.rt ? deriveState(s.rt).state : null;
    if (!asleep && st !== 'ready') return { waiting: 'redefine' };
    const q = this.b.queue;
    if (!asleep && q && q._ofSession && q._ofSession(s.sessionId).some((d) => d.status === 'queued' || d.status === 'sending')) return { waiting: 'redefine' };
    const k = key + '|' + role;
    this.restart.delete(k);
    this.docNotices.delete(k); // 새로 뜨는 세션은 지금 정의·정의서를 싣는다
    try { if (this.b.kill) await this.b.kill({ session: s.sessionId, confirm: true }); } catch (e) { this.b.log && this.b.log('rig3 redefine close ' + s.name + ': ' + e.message); }
    const n = await this.spawnRole(key, role, 'respawn', { sessionId: s.sessionId, name: s.name, why: 'redefined' });
    this.changed(key);
    return { spawned: n.name, why: 'redefined' };
  }
  // P242: 다시 뜨는 역할에게 실을 받은 것 줄(답하지 않은 것, 답 항목이 없는 것, 반려된 것)
  inboxLines(key, role) {
    try {
      const x = this.items.inbox(key, role);
      return [
        ...x.received.map((i) => `- 받음 기다림: ${i.id} (${i.kind}, ${i.role === 'human' ? '입력 창구' : i.role}${i.from ? `, ${i.from}에서` : ''}): ${i.path}`),
        ...x.unanswered.map((i) => `- 받았고 답 항목(${i.need.join('|')})이 없음: ${i.id}: ${i.path}`),
        ...x.returned.map((i) => `- 반려된 네 항목: ${i.id} (${i.by.map((b) => `${b.role} "${b.reason}"`).join(', ')})`),
      ];
    } catch { return []; }
  }
  // 장부의 마지막 띄움(그 역할) → { session, name } | null
  lastSpawn(key, role) {
    let rows = [];
    try { rows = this.store().rigEvents({ ws: key, kinds: ['role_spawn', 'role_respawn'], limit: 500, tail: true }) || []; } catch { rows = []; }
    const row = rows.filter((x) => x.seat === role).sort((a, b) => b.seq - a.seq)[0];
    if (!row || !row.session) return null;
    const s = this.store().getSession ? this.store().getSession(row.session) : null;
    return { session: row.session, name: s ? s.name : null };
  }
  // 쉬는 역할 세션을 재운다 → 한 일 | null
  async idle(s, now = Date.now()) {
    const sl = this.b.sleeper;
    if (!sl || s.rt.sleep || (sl.isAsleep && sl.isAsleep(s))) return null;
    const after = this.ms('rig3IdleMs', ROLE_IDLE_MS);
    if (!after) return null;
    const failed = this.sleepFail.get(s.sessionId);
    if (failed && now - failed < SLEEP_RETRY_MS) return null;
    const st = s.rt ? deriveState(s.rt).state : null;
    if (st !== 'ready') return null;
    if (now - idleSince(s) < after) return null;
    const x = sl.info ? sl.info(s) : null;
    const why = x ? sessionActivity(x, { mode: 'hand' }) || sleepTarget(x, { mode: 'hand' }) : null;
    if (why) return { notSleeping: why };
    const idleMin = Math.round((now - idleSince(s)) / 60000); // 재우기가 idleSince를 바꾸기 전에 센다
    try {
      await sl.sleep(s, { by: 'rig', mode: 'hand', scope: 'session' });
      rigEvent(this.b, { kind: 'role_slept', ws: s.workspaceKey, seat: s.rigRole, session: s.sessionId, actor: 'board', text: `@${shownName(s) || s.name} 쉰 지 ${idleMin}분` });
      this.changed(s.workspaceKey);
      return { slept: s.name };
    } catch (e) {
      this.sleepFail.set(s.sessionId, now);
      this.b.log && this.b.log(`rig3 sleep ${s.name}: ${e.code || e.message}`);
      return { sleepFailed: e.code || e.message };
    }
  }
  changed(key) { if (this.b.api && this.b.api.broadcast) try { this.b.api.broadcast('rig.roles', { workspace: key }); } catch {} }

  // ---------- 보기(rig.status의 rig3) ----------
  view(key, def) {
    const r3 = def && def.rig3; if (!r3) return null;
    const root = this.b.rig ? this.b.rig.rootOf(key) : null;
    const summary = (s) => { try { return this.b.summary ? this.b.summary(s) : null; } catch { return null; } };
    const roles = Object.values(r3.roles).map((r) => {
      let docMissing = null;
      if (root) { try { docMissing = checkRoleDoc(fs.readFileSync(path.resolve(root, r.doc), 'utf8')).missing; } catch { docMissing = ['(파일 없음)']; } }
      const s = this.sessionsOf(key, r.name)[0] || null;
      const sum = s ? summary(s) : null;
      return {
        name: r.name, owns: r.owns, tools: r.tools, launcher: r.launcher || 'claude', model: r.model || null, effort: r.effort || null, doc: r.doc, docMissing: docMissing || [], memory: r.memory, memoryDir: memoryDir(r.name),
        gets: r3.flows.filter((f) => f.to.includes(r.name)).map((f) => f.item), puts: r3.flows.filter((f) => f.from.includes(r.name)).map((f) => f.item),
        session: s ? { sessionId: s.sessionId, name: shownName(s) || s.name, kind: s.kind || 'claude', state: sum ? sum.state : deriveState(s.rt).state, asleep: !!(s.rt && s.rt.sleep) } : null,
        gaveUp: this.gaveUp.has(`${key}|${r.name}`),
      };
    });
    let it = null; try { it = this.items.view(key, r3); } catch (e) { this.b.log && this.b.log('rig3 items view', e.message); } // P242: 길마다 수, 역할마다 받은 것
    for (const x of roles) x.items = it && it.roles[x.name] ? it.roles[x.name] : null;
    for (const x of roles) { try { x.tune = this.tune.roleView(key, r3, x.name); } catch (e) { x.tune = null; this.b.log && this.b.log('rig3 tune view', e.message); } } // P245: 정의서 판·조정 수·재료
    return { builder: this.builder.view(key), purpose: r3.purpose, beat: r3.beat, roles, flows: r3.flows.map((f, i) => ({ item: f.item, from: f.from, to: f.to, for: f.for, counts: it ? it.flows[i] : null })), tools: Object.values(r3.tools).map((t) => ({ name: t.name, run: t.run, every: t.every })), tune: r3.tune, intake: it ? it.intake : null, cycle: (() => { try { return this.beat.view(key, r3); } catch (e) { this.b.log && this.b.log('rig3 beat view', e.message); return null; } })() }; // P244: 사이클·다음 박자·최근 꼭지
  }
}
