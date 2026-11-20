// P269: rig를 걷어 낸 뒤 옛 판 DB에 남은 rig 역할 세션(sessions.rig_role, 빌더 @builder 포함)을 보통 세션으로 한 번 바꾼다.
//   P250(정의에서 빠진 역할 떼기)의 규칙을 rig 코드 없이 옮겼다. 판이 뜰 때(backend.start) 부르고, 바꾼 세션은 rig_role을 비우므로 다음부터는 할 일이 없다.
// - Claude Code: 권한 모드는 사용자의 보통 값(호출자 'claude'의 승인 방식, 없으면 manual). 세션 설정 파일에서 rig가 넣은 거절 규칙(deny),
//   PreToolUse 시간 제한, auto·bypass 끄기 칸을 걷어 낸다. 이어 가기 명령(resumeArgv)도 다시 만든다. 판 DB와 설정 파일에 남아 어떤 깨우기·되살리기·재시작에도 먹는다.
// - Codex 등: 무인 인자는 띄울 때 역할 표시가 있을 때만 붙었다(rig 코드가 없어 이제 붙지 않는다). 표시만 뗀다.
// - 떠 있는 역할 세션은 끄지도 재우지도 않는다(그 프로세스는 처음 값으로 돌다가 다음 실행부터 보통). 알림은 없다(안정판에 나간 적이 없다).
import fs from 'node:fs';
import { buildResumeArgv } from './launch.mjs';

// 세션 설정 파일 permissions에 rig가 쓰던 칸(Claude Code 2.1.328 설정 스키마)
export const RIG_PERMISSION_KEYS = ['disableAutoMode', 'disableBypassPermissionsMode', 'denyInsteadOfPrompting'];

// 설정 파일 JSON에서 rig가 넣은 것을 걷는다(옛 rig-writes.mjs applySettingsAmp(j, null, …) 그대로). 바뀌었으면 true
//   - deny: 판이 만든 파일이라 deny는 모두 rig의 것이다(보통 세션에는 없다) → 지운다
//   - allow: 판의 기본 규칙(baseAllow, branch.settingsExtra의 allow). 주지 않으면 지금 것 그대로
//   - permissions의 rig 칸을 지우고, 판 hook(type http)의 시간 제한을 보통 값으로 돌리고 onFailure를 지운다
export function stripRigSettings(j, baseTimeoutSec = 2, baseAllow = null) {
  const before = JSON.stringify(j);
  const drop = (k) => { if (j.permissions && k in j.permissions) { const { [k]: _x, ...rest } = j.permissions; j.permissions = rest; if (!Object.keys(rest).length) delete j.permissions; } };
  drop('deny');
  const allow = [...new Set(baseAllow || ((j.permissions && j.permissions.allow) || []))];
  if (allow.length) j.permissions = { ...(j.permissions || {}), allow };
  else drop('allow');
  for (const k of RIG_PERMISSION_KEYS) drop(k);
  for (const list of Object.values(j.hooks || {})) {
    for (const g of list || []) for (const h of g.hooks || []) {
      if (h.type !== 'http') continue;
      h.timeout = baseTimeoutSec;
      delete h.onFailure;
    }
  }
  return JSON.stringify(j) !== before;
}

// 사용자의 보통 Claude Code 권한 모드: 호출자 'claude'(기본 호출자)의 승인 방식, 없으면 manual(spawnPlanOf의 기본)
export function plainPermission(b) {
  const L = b.features && b.features.launchers;
  let l = null; try { l = L && L.find ? L.find('claude') : null; } catch { l = null; }
  return l && l.harness === 'claude' && l.permissionMode ? String(l.permissionMode) : 'manual';
}

// 세션 하나(판이 쥔 것이나 DB 줄)를 보통 띄우기 값으로 → { kind, permissionMode?, settings?, resumeArgv? }
export function plainLaunch(b, s) {
  const kind = s.kind || 'claude';
  if (kind !== 'claude') return { kind };
  const mode = plainPermission(b);
  s.permissionMode = mode;
  let settings = false;
  if (s.settingsPath && fs.existsSync(s.settingsPath)) {
    try {
      const j = JSON.parse(fs.readFileSync(s.settingsPath, 'utf8'));
      const base = b.branch && b.branch.settingsExtra ? (b.branch.settingsExtra(s.sessionId).allow || []) : null;
      settings = stripRigSettings(j, (b.cfg && b.cfg.hookTimeoutSec) || 2, base);
      if (settings) fs.writeFileSync(s.settingsPath, JSON.stringify(j, null, 2));
    } catch (e) { if (b.log) b.log(`old rig role settings ${s.name}: ${e.message}`); }
  }
  const fields = { permissionMode: mode };
  if (s.resumeArgv && typeof b.launchOf === 'function') {
    try {
      s.resumeArgv = buildResumeArgv({ claudeCommand: (b.cfg && b.cfg.claudeCommand) || 'claude', ...b.launchOf(s, { launch: false }) });
      s.resumeVerified = false;
      Object.assign(fields, { resumeArgv: s.resumeArgv, resumeVerified: false });
    } catch (e) { if (b.log) b.log(`old rig role resume ${s.name}: ${e.message}`); }
  }
  b.store.updateSession(s.sessionId, fields);
  return { kind, permissionMode: mode, settings, resumeArgv: !!fields.resumeArgv };
}

// 판이 뜰 때 한 번: rig_role이 남은 세션(열림·닫힘 모두)을 보통 세션으로 → [{ sessionId, name, role, kind, permissionMode?, settings?, resumeArgv? }]
export function retireRigRoles(b) {
  const rows = b.store.oldRigRoles ? b.store.oldRigRoles() : [];
  const out = [];
  for (const { sessionId, role } of rows) {
    const s = (b.sessions && b.sessions.get(sessionId)) || b.store.getSession(sessionId);
    let plain = null;
    if (s) {
      delete s.rigRole; delete s.rig3AmpSig;
      try { plain = plainLaunch(b, s); } catch (e) { if (b.log) b.log(`old rig role ${s.name}: ${e.stack || e.message}`); }
    }
    b.store.clearOldRigRole(sessionId);
    try { b.store.addEvent(sessionId, 'rig_role_retired', { role, plain }); } catch {}
    out.push({ sessionId, name: s ? s.name : null, role, ...(plain || {}) });
  }
  if (out.length && b.log) b.log(`old rig roles → plain sessions: ${out.map((x) => `${x.name || x.sessionId}(${x.role})`).join(', ')}`);
  return out;
}
