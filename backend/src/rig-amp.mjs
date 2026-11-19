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
// - P223(rig2-design 11.6의 12): seats.<자리>.permission = ask(기본, 지금 그대로) | scoped | unattended, seats.<자리>.allow = [Claude Code 권한 규칙](scoped에서 묻지 않는 명령).
//   scoped: Claude Code는 --permission-mode acceptEdits(P226부터 manual, 아래) + 세션 설정 파일 permissions.allow(allow) + 쓰기 범위 밖은 PreToolUse가 "ask"(질문이 응답 필요로 뜬다).
//           Codex는 -s workspace-write -a on-request(writes false면 -s read-only).
//   unattended: Claude Code는 bypassPermissions + 쓰기 범위 밖은 PreToolUse가 "deny". Codex는 -s workspace-write -a never.
//     사람만 고른다: 켜기 확인(rig.enable confirm)이나 rig.permit이 그 자리를 승인한다(rig_permits). 승인 전 unattended 자리는 scoped로 돈다.
// - P225(rig2-design 11.8의 1·2): 승인은 그 자리의 위험한 칸(permission·writes·allow·tools·launcher)의 해시(seatPermitHash)에 묶인다. 칸이 바뀌면 승인이 풀린다.
// - P226(rig2-design 11.10): scoped는 acceptEdits를 쓰지 않는다(acceptEdits는 작업 폴더 안 셸 지우기·쓰기를 묻지 않고 허락했다).
//   Claude Code scoped = 기본 권한 모드(manual) + allow: writes 경로마다 Edit(//<절대 경로>/**)(Edit 규칙이 모든 편집 도구를 덮는다. writes가 없으면 세션 폴더),
//   자리의 allow. 셸로 하는 쓰기·지우기는 묻고 응답 필요로 뜬다. 셸로 감싼 PowerShell·cmd 허용 규칙(Bash(powershell …))은 정의 오류다.
//   셸 안의 셸 거절(SHELL_IN_SHELL_DENY 규칙 + PreToolUse)은 판의 고정 기준이라 scoped·unattended에 늘 걸리고 정의로 끄지 못한다.
//   seats.<자리>.deny(Claude Code 권한 규칙)로 더 막는다. Codex scoped는 그대로 -s workspace-write(경로를 좁히지 못한다: 좁은 writes면 검사기가 경고).
//   승인 해시에는 런처가 푼 종류·모델·인자(launch)를 넣는다.
//   Codex 자리의 allow는 쓰이지 않는다(Codex scoped는 샌드박스와 모델의 판단): 검사기가 경고한다(11.8의 4).
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { rigEvent } from './rig-ledger.mjs'; // P217: 장부(훅 아닌 관문)
import { writesPaths, OWNS } from './rig-docs.mjs'; // P219: writes의 문서 이름 → 경로

export const AMP_ATS = ['pre-tool'];
export const SEAT_PERMISSIONS = ['ask', 'scoped', 'unattended']; // P223
// P223: 자리 권한 → Claude Code 권한 모드(ask는 띄우는 값 그대로)
//   P226: scoped는 기본 모드(Claude Code의 manual). 묻지 않는 것은 설정 파일의 allow(writes의 Edit 규칙, 자리의 allow)뿐이다
export const CLAUDE_PERMISSION_MODE = { scoped: 'manual', unattended: 'bypassPermissions' };
// P226: 판의 고정 거절(scoped·unattended). Bash 도구로 부르는 셸 안의 셸. 정의로 끄지 못한다(PreToolUse의 nestedShell도 같은 것을 본다)
export const SHELL_IN_SHELL_DENY = ['cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe'].map((x) => `Bash(${x}:*)`);
// P223: 자리 권한 → Codex 샌드박스·승인
export const CODEX_APPROVAL = { scoped: 'on-request', unattended: 'never' };
// P223: allow 규칙의 꼴(Claude Code 권한 규칙: 도구 이름, 괄호 안 지정자). 예: "Bash(git log:*)", "Read", "mcp__x__y"
const ALLOW_RULE_RE = /^[A-Za-z][A-Za-z0-9_-]*(\(.+\))?$/;
// 판이 자리를 위해 띄울 때(rig-flow spawnSeat → branch.spawnChild → backend.spawn) 넘기는 자리 이름의 열쇠.
// Symbol이라 에이전트의 /branch/child 본문(JSON)이나 판 API로는 넣지 못한다(에이전트는 자리를 정하지 못한다)
export const SEAT_SPAWN = Symbol.for('atrium.rigSeatSpawn');
// P234(rig2-design 11.16의 2): 판이 자리를 위해 띄울 때 넘기는 그 회의 고리({ loop }). fresh 자리는 띄울 때부터 그 회의 계기로 설정 파일을 쓴다(spawnEntry는 회를 띄운 뒤에 연다)
export const SEAT_RUN = Symbol.for('atrium.rigSeatRun');
// P234(11.16의 1·2): 자리 설정 파일 permissions에 판이 쓰는 칸. Claude Code 2.1.328 설정 스키마(--settings 파일에서 먹는 것을 헤드리스로 확인)
//   disableAutoMode "disable": auto mode를 끈다(권한 질문의 "switch to auto mode" 선택지, --permission-mode auto는 default로 돈다). 모든 rig 자리
//   disableBypassPermissionsMode "disable": bypassPermissions를 끈다. scoped·ask 자리(unattended는 bypassPermissions로 돈다)
//   denyInsteadOfPrompting true: 물을 호출을 묻지 않고 거절하고 모델에게 알린다(턴은 이어진다). 판이 연 회(every 고리)의 scoped 자리
export const PERMISSION_KEYS = ['disableAutoMode', 'disableBypassPermissionsMode', 'denyInsteadOfPrompting'];
// P234: 판이 연 회(묻지 않고 거절)가 되는 고리 계기. every 고리의 회는 every·followups·지금 돌리기(now) 어느 것으로 열려도 요청한 사람이 곁에 없다고 본다
export const PROMPTLESS_TRIGGERS = ['every'];
// P234(11.16의 3): 받을 "Yes"가 없는 권한 질문의 장부 까닭
export const NO_YES_WHY = '받을 Yes가 없는 선택지 꼴';
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
//   P219: docs(validateDocs의 문서)가 있으면 writes의 문서 이름을 그 문서 경로(저장소 기준)로 바꾼다. "{owns}"는 R5 전이라 뺀다(그것만 있으면 제한 없음)
//   P223: seats.<자리>.permission·allow → amp.seats[자리].permission·allow. warnings(정의는 쓰인다)를 함께 돌려준다
export function validateAmp(raw, { seats = null, docs = null } = {}) {
  const bad = (reason) => ({ ok: false, reason });
  const warnings = [];
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
        writes = writesPaths(x.writes.map((p) => p.trim()), docs);
        if (!writes.length && x.writes.some((p) => p.trim() === OWNS)) writes = null;
      } else return bad(`${at}.writes는 false 또는 경로 배열이다(예: ["items/{item}/"])`);
    }
    if (x.stopVerify != null && typeof x.stopVerify !== 'boolean') return bad(`${at}.stopVerify는 true 또는 false다`);
    // P223: 자리 권한
    const permission = x.permission == null ? 'ask' : x.permission;
    if (!SEAT_PERMISSIONS.includes(permission)) return bad(`${at}.permission은 ${SEAT_PERMISSIONS.join(', ')} 가운데 하나다(ask: 지금처럼 묻는다, scoped: 쓰기 범위와 allow 안에서는 묻지 않는다, unattended: 묻지 않는다. 사람만 고른다): ${JSON.stringify(x.permission)}`);
    let allow = [];
    if (x.allow != null) {
      if (!Array.isArray(x.allow) || x.allow.some((r) => typeof r !== 'string' || !r.trim())) return bad(`${at}.allow는 Claude Code 권한 규칙 글의 배열이다(예: ["Bash(git log:*)", "Bash(gh pr list:*)"])`);
      const off = x.allow.find((r) => !ALLOW_RULE_RE.test(r.trim()));
      if (off) return bad(`${at}.allow의 규칙이 Claude Code 권한 규칙 꼴(도구 이름, 괄호 안 지정자)이 아니다: ${off}`);
      // P226: 셸로 감싼 PowerShell·cmd 허용 규칙은 이어 붙인 명령을 통과시킨다(Bash(powershell -Command …:*)) → 정의 오류
      const wrapped = x.allow.find((r) => wrappedShellRule(r.trim()));
      if (wrapped) return bad(`${at}.allow에 셸로 감싼 ${wrappedShellRule(wrapped.trim())} 규칙이 있다: ${wrapped}. 그 안에 이어 붙인 명령(; Remove-Item 등)을 허용 목록이 보지 못한다. PowerShell 명령은 PowerShell(Get-ChildItem:*) 꼴로 쓴다`);
      allow = [...new Set(x.allow.map((r) => r.trim()))];
      if (permission !== 'scoped') warnings.push(`${at}.allow는 permission "scoped" 자리에서만 쓴다(${permission}에서는 쓰지 않는다)`);
      if (allow.length && typeof x.launcher === 'string' && x.launcher.trim() === 'codex') warnings.push(codexAllowWarning(at)); // P225
    }
    // P226: 자리의 거절 규칙(Claude Code 권한 규칙 꼴). 판의 고정 거절(셸 안의 셸)에 더한다. 어느 권한에서나 쓴다
    let deny = [];
    if (x.deny != null) {
      if (!Array.isArray(x.deny) || x.deny.some((r) => typeof r !== 'string' || !r.trim())) return bad(`${at}.deny는 Claude Code 권한 규칙 글의 배열이다(예: ["Bash(git push:*)", "PowerShell(Remove-Item:*)"])`);
      const off = x.deny.find((r) => !ALLOW_RULE_RE.test(r.trim()));
      if (off) return bad(`${at}.deny의 규칙이 Claude Code 권한 규칙 꼴(도구 이름, 괄호 안 지정자)이 아니다: ${off}`);
      deny = [...new Set(x.deny.map((r) => r.trim()))];
      if (typeof x.launcher === 'string' && x.launcher.trim() !== 'claude' && SEAT_KIND_NAMES.includes(x.launcher.trim())) warnings.push(`${at}.deny는 Claude Code 자리에서만 쓴다(${x.launcher.trim()}에서는 쓰지 않는다)`);
    }
    // P226(11.10): Codex scoped는 작업 폴더 전체를 쓸 수 있다. 좁은 writes는 지켜지지 않는다
    if (permission !== 'ask' && Array.isArray(writes) && typeof x.launcher === 'string' && x.launcher.trim() === 'codex') warnings.push(codexWritesWarning(at));
    if (permission === 'unattended') {
      warnings.push(`${at}.permission "unattended"는 사람이 승인해야 쓰인다(rig 켜기 확인 창이나 창의 승인). 승인 전에는 scoped로 돈다`);
      if (writes === null) warnings.push(`${at}.permission "unattended"인데 writes(쓰기 범위)가 없다. 묻지 않고 어디든 쓴다`);
    }
    if (permission === 'scoped' && writes === null && !allow.length) warnings.push(`${at}.permission "scoped"인데 writes와 allow가 없다. 세션 폴더 안 파일 고치기만 묻지 않는다`);
    if (writes !== null || x.stopVerify != null || permission !== 'ask' || deny.length) seatAmp[name] = { writes, stopVerify: x.stopVerify ?? null, ...(permission !== 'ask' ? { permission, allow } : {}), ...(deny.length ? { deny } : {}) };
  }
  const preTool = [];
  const hooks = Array.isArray(raw.hooks) ? raw.hooks : [];
  for (let i = 0; i < hooks.length; i++) {
    const h = hooks[i]; if (!h || typeof h !== 'object') continue;
    const at = `hooks[${i}]`;
    if (h.at !== 'pre-tool') {
      if (h.match != null || (h.seat != null && h.at !== 'done')) return bad(h.match != null ? `${at}.match는 pre-tool 훅에만 쓴다` : `${at}.seat은 pre-tool·done 훅에만 쓴다`); // P230: done 훅의 seat(rig.mjs가 검사)
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
  return { ok: true, amp: has ? { stopVerify: raw.stopVerify === true, seats: seatAmp, preTool } : null, ...(warnings.length ? { warnings } : {}) };
}

// 그 자리의 증폭 값(정의만으로) → { writes, stopVerify, preTool: [hook 정의…] }
//   P223: permission(정의의 값)과 allow
export function seatAmpOf(def, seat) {
  const a = def && def.amp; if (!a) return { writes: null, stopVerify: false, preTool: [], permission: 'ask', allow: [], deny: [] };
  const sa = a.seats[seat] || {};
  const stopVerify = sa.stopVerify != null ? sa.stopVerify : a.stopVerify;
  const preTool = a.preTool.filter((p) => !p.seats || p.seats.includes(seat)).map((p) => ({ ...p, hook: def.hooks.find((h) => h.index === p.index) })).filter((p) => p.hook);
  return { writes: sa.writes ?? null, stopVerify: !!stopVerify, preTool, permission: sa.permission || 'ask', allow: sa.allow || [], deny: sa.deny || [] };
}
const SEAT_KIND_NAMES = ['claude', 'codex', 'opencode', 'pi']; // rig.mjs SEAT_KINDS(서로 부르지 않게 따로 둔다)
// P226: 셸로 감싼 셸 규칙인가 → 'powershell' | 'cmd' | 'pwsh' | null. Bash(…) 규칙의 지정자 앞이 셸이면
export function wrappedShellRule(rule) {
  const m = /^Bash\((.*)\)$/.exec(String(rule || '').trim());
  if (!m) return null;
  return nestedShell(m[1].replace(/:\*$/, '').replace(/\*$/, ''));
}
// P226: Codex 자리의 좁은 writes 경고
export const codexWritesWarning = (at) => `${at}.writes: Codex에서는 작업 폴더 전체가 쓰기 범위다(-s workspace-write는 경로를 좁히지 못한다). 쓰지 않는 자리는 writes: false(-s read-only)로 둔다`;
// P225: Codex 자리의 allow 경고(런처 이름 자리는 rig-admin seatNotes가 런처의 종류로 본다)
export const codexAllowWarning = (at) => `${at}.allow는 Codex 자리에서 쓰지 않는다. Codex의 scoped는 샌드박스(-s workspace-write)와 모델의 판단(-a on-request)이라 허용 목록이 없다`;
// P225: 무인 승인이 묶이는 자리의 해시. permission·writes(경로로 바꾼 값)·allow·tools·launcher. 이 가운데 하나라도 바뀌면 옛 승인은 쓰이지 않는다
//   P226(11.10의 3): launch = 런처가 푼 실제 실행 값({ kind, model, args, … }, rig.mjs seatLaunchOf). 런처 정의를 고치면 승인이 풀린다. deny도 넣는다
export function seatPermitHash(def, seat, launch = null) {
  const x = def && def.seats ? def.seats[seat] : null;
  const sa = def && def.amp && def.amp.seats ? def.amp.seats[seat] || {} : {};
  const body = { permission: sa.permission || 'ask', writes: sa.writes === undefined ? null : sa.writes, allow: sa.allow || [], deny: sa.deny || [], tools: x ? x.tools ?? null : null, launcher: x ? x.launcher || null : null, model: x ? x.model || null : null, launch: launch || null };
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
}
// P223: 정의의 자리 권한 → 실제로 쓰는 권한. unattended는 사람이 승인한 자리만(아니면 scoped)
export const effectivePermission = (permission, approved) => (permission === 'unattended' && !approved ? 'scoped' : permission || 'ask');

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

// P234(11.16의 2): 자리의 회가 판이 연 회(묻지 않고 거절)인가 → { promptless, why, loops }
//   fresh 자리: 그 회의 고리(loop)의 계기. 모르면 unknown(묻는다)
//   keep 자리: 그 자리에 닿는 고리(입구이거나 흐름 줄의 받는 자리)의 계기. 모두 every면 promptless,
//     request 고리가 하나라도 있으면 묻는다(요청한 쪽이 곁에 있다. every와 섞이면 why "mixed"), 닿는 고리가 없으면 none(묻는다)
export function seatRunOf(def, seat, { loop = null } = {}) {
  const x = def && def.seats ? def.seats[seat] : null;
  const L = (def && def.loops) || {};
  const typeOf = (l) => (l && l.trigger ? l.trigger.type : null);
  if (!x) return { promptless: false, why: 'unknown', loops: [] };
  if (x.session !== 'keep') {
    const l = loop ? L[loop] : null;
    if (!l) return { promptless: false, why: 'unknown', loops: loop ? [loop] : [] };
    const t = typeOf(l);
    return { promptless: PROMPTLESS_TRIGGERS.includes(t), why: t || 'unknown', loops: [l.name || loop] };
  }
  const flow = (def && def.flow) || [];
  const reach = Object.values(L).filter((l) => l.entry === seat || (l.lines || []).some((i) => { const f = flow.find((z) => z.index === i); return !!(f && Array.isArray(f.to) && f.to.includes(seat)); }));
  const types = new Set(reach.map(typeOf).filter((t) => t === 'every' || t === 'request')); // event 계기는 아직 회를 열지 않는다
  const names = reach.map((l) => l.name);
  if (!types.size) return { promptless: false, why: 'none', loops: names };
  if (types.has('request')) return { promptless: false, why: types.has('every') ? 'mixed' : 'request', loops: names };
  return { promptless: true, why: 'every', loops: names };
}
// P234: 자리 설정 파일 permissions의 판 칸(PERMISSION_KEYS). permission은 실제로 쓰는 값, promptless는 seatRunOf
export function seatPermissionKeys({ permission = 'ask', promptless = false } = {}) {
  return { disableAutoMode: 'disable', ...(permission !== 'unattended' ? { disableBypassPermissionsMode: 'disable' } : {}), ...(permission === 'scoped' && promptless ? { denyInsteadOfPrompting: true } : {}) };
}

// 세션 설정 파일에 넣을 증폭 → { deny: [규칙], allow: [규칙], hooks: { <이벤트>: { timeout, onFailure? } }, permissions: { <PERMISSION_KEYS> } } | null
//   x: { writes, stopVerify, preTool, protectedFiles: [상대 경로], root, cwd, permission(실제로 쓰는 값), allow, promptless(P234) }
//   P234: rig 자리면 늘 permissions(auto mode 끄기)가 있어 null이 아니다
export function claudeSettingsAmp(x) {
  if (!x) return null;
  const deny = [];
  // writes false: 모든 경로의 Edit(파일을 고치는 모든 도구)을 거부한다. 도구 이름만 쓰면(Edit, Write) 도구가 맥락에서 빠져
  //   모델이 막힌 줄 모르고 셸로 파일을 썼다(P189 개발용 판). 경로 규칙이면 도구는 남고 호출이 "denied by your permission settings"로 돌아온다
  if (x.writes === false) deny.push(EDIT_ALL);
  // 경로 규칙은 Edit(…)만: Claude Code는 Edit 규칙을 파일을 고치는 모든 도구(Write·MultiEdit·NotebookEdit)에 쓰고, Write(경로)는 "never matches"라고 경고한다(P189 개발용 판)
  for (const f of x.protectedFiles || []) for (const base of protectBases(x.root, x.cwd)) deny.push(`Edit(${rulePath(path.resolve(base, f))})`);
  // P226: 판의 고정 거절(셸 안의 셸)은 scoped·unattended에 늘. 자리의 deny는 어느 권한에서나
  if (x.permission === 'scoped' || x.permission === 'unattended') deny.push(...SHELL_IN_SHELL_DENY);
  deny.push(...(x.deny || []));
  const hooks = {};
  const waitPre = x.preTool.length || Array.isArray(x.writes) || x.permission === 'scoped' || x.permission === 'unattended'; // P225: scoped는 셸 안의 셸을 거른다. P226: unattended도
  if (waitPre) {
    const maxMs = x.preTool.reduce((n, p) => n + (p.hook.timeoutMs || 0), 0); // 같은 도구에 여러 훅이 차례로 돌 수 있다
    const sec = x.preTool.length ? Math.min(Math.ceil(maxMs / 1000) + PRE_TOOL_TIMEOUT_PAD_SEC, PRE_TOOL_TIMEOUT_MAX_SEC) : PRE_TOOL_WRITES_TIMEOUT_SEC;
    hooks.PreToolUse = { timeout: Math.max(sec, PRE_TOOL_WRITES_TIMEOUT_SEC), ...(x.preTool.some((p) => p.hook.onFail === 'block') ? { onFailure: 'block' } : {}) };
  }
  if (x.stopVerify) hooks.Stop = { timeout: STOP_TIMEOUT_SEC };
  const uniq = [...new Set(deny)];
  const allow = x.permission === 'scoped' ? [...new Set([...scopedEditRules(x), ...(x.allow || [])])] : []; // P223: scoped 자리의 묻지 않는 규칙. P226: writes의 Edit 규칙
  const permissions = seatPermissionKeys({ permission: x.permission || 'ask', promptless: !!x.promptless }); // P234
  return { deny: uniq, ...(allow.length ? { allow } : {}), hooks, permissions };
}
// P226: scoped 자리의 범위 안 편집 허용 규칙. writes 경로마다 Edit(//<절대 경로>/**)(세션 폴더 기준. {item}은 그 앞까지: 일마다 좁히는 것은 PreToolUse가 묻는다).
//   writes가 없으면(제한 없음) 세션 폴더, false면 없다(Edit(//**) 거절이 있다)
export function scopedEditRules(x) {
  if (!x || x.writes === false) return [];
  const base = x.cwd || x.root;
  if (!base) return [];
  const dirs = Array.isArray(x.writes) ? x.writes.map((p) => p.split('{item}')[0]) : ['.'];
  return [...new Set(dirs.map((p) => {
    const abs = path.resolve(base, p || '.');
    const file = !/[\\/]$/.test(p) && path.extname(p) && !p.includes('{item}'); // 파일 하나(docs/rules.md 꼴)는 그 파일만
    return file ? `Edit(${rulePath(abs)})` : `Edit(${rulePath(abs)}/**)`;
  }))];
}
// 설정 파일 JSON에 증폭을 덮어 쓴다(판이 만든 파일이라 deny는 모두 판의 것). 바뀌었으면 true
//   P223: allow는 판의 기본 규칙(baseAllow, branch.settingsExtra의 allow) + 증폭의 allow. baseAllow를 주지 않으면 지금 allow에 더하기만 한다
export function applySettingsAmp(j, amp, baseTimeoutSec = 2, baseAllow = null) {
  const before = JSON.stringify(j);
  const deny = amp ? amp.deny : [];
  if (deny.length) j.permissions = { ...(j.permissions || {}), deny };
  else if (j.permissions && j.permissions.deny) { const { deny: _d, ...rest } = j.permissions; j.permissions = rest; if (!Object.keys(rest).length) delete j.permissions; }
  const extra = (amp && amp.allow) || [];
  const allow = [...new Set([...(baseAllow || ((j.permissions && j.permissions.allow) || [])), ...extra])];
  if (allow.length) j.permissions = { ...(j.permissions || {}), allow };
  else if (j.permissions && j.permissions.allow) { const { allow: _a, ...rest } = j.permissions; j.permissions = rest; if (!Object.keys(rest).length) delete j.permissions; }
  // P234: auto·bypass 끄기, 묻지 않고 거절(판의 칸이라 증폭에 없으면 뺀다)
  const want = (amp && amp.permissions) || {};
  for (const k of PERMISSION_KEYS) {
    if (want[k] != null) j.permissions = { ...(j.permissions || {}), [k]: want[k] };
    else if (j.permissions && k in j.permissions) { const { [k]: _x, ...rest } = j.permissions; j.permissions = rest; if (!Object.keys(rest).length) delete j.permissions; }
  }
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
const APPROVAL_KEY = /^approval_policy\s*=/; // P223
//   P223: permission scoped·unattended면 샌드박스·승인 인자를 걷어 내고 -s workspace-write(writes false면 read-only) -a on-request | never
export function codexArgsAmp(args = [], writes = null, permission = 'ask') {
  const a = (args || []).map(String);
  if (CODEX_APPROVAL[permission]) {
    const out = [];
    for (let i = 0; i < a.length; i++) {
      const w = a[i]; const flag = w.split('=')[0];
      if (SANDBOX_VALUE_FLAGS.has(flag) || APPROVAL_FLAGS.has(flag)) { if (!w.includes('=')) i++; continue; }
      if (SANDBOX_BARE_FLAGS.has(w)) continue;
      if ((w === '-c' || w === '--config') && (SANDBOX_KEY.test(a[i + 1] || '') || APPROVAL_KEY.test(a[i + 1] || ''))) { i++; continue; }
      if ((w.startsWith('--config=') && (SANDBOX_KEY.test(w.slice(9)) || APPROVAL_KEY.test(w.slice(9)))) || (w.startsWith('-c') && w.length > 2 && (SANDBOX_KEY.test(w.slice(2)) || APPROVAL_KEY.test(w.slice(2))))) continue;
      out.push(w);
    }
    out.push('--sandbox', writes === false ? 'read-only' : 'workspace-write', '--ask-for-approval', CODEX_APPROVAL[permission]);
    return out;
  }
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

// P225: 셸 안의 셸(Bash 도구로 cmd·powershell·pwsh를 부름). 허용 목록 판단을 비켜 가므로(따옴표 안 스크립트는 한 명령으로 맞는다) scoped 자리는 묻지 않고 거절하고
//   PowerShell 도구·Glob·Read를 쓰게 한다. 명령의 앞이나 &&·||·;·|·&·( 뒤에 오는 cmd(.exe)·powershell(.exe)·pwsh(.exe)만 본다(경로·따옴표가 붙어도)
const NESTED_SHELL_RE = /(?:^|&&|\|\||[;|&\n(]|\$\()\s*["']?(?:[A-Za-z]:)?(?:[^\s;&|'"]*[\\/])?(cmd|powershell|pwsh)(?:\.exe)?["']?(?=\s|$)/i;
export function nestedShell(command) { const m = NESTED_SHELL_RE.exec(String(command || '')); return m ? m[1].toLowerCase() : null; }
export const NESTED_SHELL_REASON = '[Atrium rig] 이 자리(scoped·unattended)는 Bash 도구 안에서 cmd·powershell·pwsh를 부르지 않는다(허용 목록이 그 안의 명령을 보지 못한다). 파일 목록·내용·찾기는 PowerShell 도구(Get-ChildItem, Get-Content, Select-String, Test-Path)나 Glob·Read·Grep 도구로 한다.';
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

// P234: 거절된 호출의 대상(셸 도구는 명령, 파일 도구는 경로, 그 밖은 입력 JSON 앞부분)
export function deniedTarget(tool, input) {
  const i = input || {};
  const v = i.command ?? i.file_path ?? i.notebook_path ?? i.path ?? i.url ?? i.pattern ?? null;
  const t = v != null ? String(v) : Object.keys(i).length ? JSON.stringify(i) : '';
  return t.replace(/\s+/g, ' ').trim().slice(0, 300) || null;
}

// PreToolUse 응답 본문
export const denyBody = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
// P223: scoped 자리의 쓰기 범위 밖 → 묻는다(acceptEdits여도 권한 질문이 뜨고, 판은 응답 필요로 보인다)
export const askBody = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason } });
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
    const asked = sa.permission;
    const permission = effectivePermission(asked, asked === 'unattended' && this.approved(s.workspaceKey, s.rigSeat, r.def)); // P223. P225: 그 정의의 해시
    const run = this.runOf(s, r); // P234: 판이 연 회면 scoped 자리는 묻지 않고 거절
    return { key: s.workspaceKey, r, seat: s.rigSeat, kind: s.kind || 'claude', ...sa, asked, permission, protectedFiles, root: r.root, cwd: (s.rt && s.rt.cwd) || s.cwd || r.root, run, promptless: run.promptless };
  }
  // P234(11.16의 2): 그 세션의 회 계기(seatRunOf). fresh 자리는 띄울 때 받은 고리(s.rigRun) → 그 세션의 회(rig_case_items) → 열린 시도의 회
  runOf(s, r) {
    let loop = s.rigRun && s.rigRun.loop ? s.rigRun.loop : null;
    const seat = r.def.seats[s.rigSeat];
    if (!loop && seat && seat.session !== 'keep') {
      const st = this.b.store;
      try {
        const caseId = (st.caseOfSession && st.caseOfSession(s.sessionId)) || (() => { const tr = st.openTryOf ? st.openTryOf(s.sessionId) : null; const u = tr && st.getUnit ? st.getUnit(tr.unitId) : null; return u ? u.caseId : null; })();
        const c = caseId && st.getCase ? st.getCase(caseId) : null;
        if (c && c.loop) loop = c.loop;
      } catch {}
    }
    return seatRunOf(r.def, s.rigSeat, { loop });
  }
  // P234(11.16의 2): 이 세션은 물을 호출을 묻지 않고 거절하는가(scoped 자리, 판이 연 회, 설정 파일에 denyInsteadOfPrompting이 들어 있음)
  //   Claude Code 2.1.328은 denyInsteadOfPrompting으로 거절할 때 PermissionDenied 훅을 보내지 않고 PermissionRequest 훅만 보낸다(개발용 판·헤드리스 확인).
  //   판의 PermissionRequest 답은 비어 있으므로(결정 없음) 그 호출은 거절된다. 판은 그 훅을 질문(응답 필요)으로 두지 않고 거절로 적는다
  refusesPrompt(s) {
    if (!s || (s.kind || 'claude') !== 'claude' || !s.rigSeat || !s.settingsPath) return false;
    const x = this.ctxOf(s);
    if (!x || x.permission !== 'scoped' || !x.promptless) return false;
    try { const j = JSON.parse(fs.readFileSync(s.settingsPath, 'utf8')); return !!(j.permissions && j.permissions.denyInsteadOfPrompting === true); } catch { return false; }
  }
  // P234(11.16의 2): 묻지 않고 거절한 호출(PermissionDenied 훅: tool_name, tool_input, reason, 또는 위의 PermissionRequest) → 장부 gate(data.at "permission", value reject, target = 명령)
  //   via: 'PermissionDenied' | 'PermissionRequest'. 같은 호출(tool_use_id, 없으면 도구·입력)은 한 번만 적는다
  onPermissionDenied(s, body, { via = 'PermissionDenied' } = {}) {
    const x = this.ctxOf(s); if (!x) return null;
    const key = `${s.sessionId}|${(body && body.tool_use_id) || `${body && body.tool_name}|${JSON.stringify((body && body.tool_input) || null)}|${Math.floor(Date.now() / 5000)}`}`;
    if (!this.deniedSeen) this.deniedSeen = new Map();
    const now = Date.now();
    for (const [k, t] of this.deniedSeen) if (now - t > 60000) this.deniedSeen.delete(k);
    if (this.deniedSeen.has(key)) return null;
    this.deniedSeen.set(key, now);
    const st = this.b.store;
    const tr = st.openTryOf ? st.openTryOf(s.sessionId) : null;
    const tool = String((body && body.tool_name) || '');
    const target = deniedTarget(tool, (body && body.tool_input) || {});
    const reason = body && body.reason != null ? String(body.reason).slice(0, 300) : null;
    try { st.addEvent(s.sessionId, 'rig_permission_denied', { tool, target, reason, promptless: !!x.promptless, via }); } catch {}
    this.gateEvent(s, x, tr, 'permission', { tool, target, reason, promptless: !!x.promptless, via }, `${tool || '?'} ${x.promptless ? '묻지 않고 거절' : '거절'}: ${target || '-'}`, 'reject');
    return { tool, target };
  }
  // P234(11.16의 3): rig 자리 권한 질문에 받을 그냥 "Yes"가 없다(Claude Code 문구가 바뀜) → 판 로그와 장부 gate(value blocked). 질문마다 한 번
  noteNoYes(s, ask) {
    if (!ask || ask.kind !== 'permission' || ask.noYesNoted) return false;
    const x = this.ctxOf(s); if (!x) return false;
    ask.noYesNoted = true;
    const st = this.b.store;
    const tr = st.openTryOf ? st.openTryOf(s.sessionId) : null;
    const choices = (ask.choices || []).map((c) => `${c.n}. ${c.label}`);
    const target = ask.summary ? String(ask.summary).slice(0, 200) : null;
    this.b.log && this.b.log(`rig permission ask without a plain Yes ${s.name} (${x.seat}): ${choices.join(' | ')}`);
    try { st.addEvent(s.sessionId, 'rig_permission_no_yes', { tool: ask.tool || null, choices }); } catch {}
    this.gateEvent(s, x, tr, 'permission', { tool: ask.tool || null, target, choices, why: 'no_yes' }, `${NO_YES_WHY}: ${choices.join(' | ')}`, 'blocked');
    return true;
  }
  // P223: 사람이 그 자리의 unattended를 승인했는가(rig.mjs rig_permits)
  approved(key, seat, def = null) { return !!(this.b.rig && this.b.rig.permitted && this.b.rig.permitted(key, seat, def)); } // P225: def(그 정의의 자리 해시로 본다)
  // P223: 자리 세션을 띄울 때의 권한 → { asked, permission, claudeMode | null, codex: { sandbox, approval } | null, pending }
  seatPermission(key, seat) {
    const r = this.b.rig ? this.b.rig.active(key) : null;
    if (!r || !r.def.seats || !r.def.seats[seat]) return null;
    const sa = seatAmpOf(r.def, seat);
    const approved = sa.permission === 'unattended' && this.approved(key, seat, r.def);
    const permission = effectivePermission(sa.permission, approved);
    return { asked: sa.permission, permission, pending: sa.permission === 'unattended' && !approved, claudeMode: CLAUDE_PERMISSION_MODE[permission] || null, codex: CODEX_APPROVAL[permission] ? { sandbox: sa.writes === false ? 'read-only' : 'workspace-write', approval: CODEX_APPROVAL[permission] } : null, allow: permission === 'scoped' ? sa.allow : [], writes: sa.writes };
  }
  // P223: 자리 세션을 띄운 뒤 장부에 권한 결정 한 줄(seat_permission, value = 실제로 쓰는 권한). ask는 적지 않는다(지금 그대로)
  notePermission(s, { caseId = null } = {}) {
    if (!s || !s.rigSeat) return null;
    const p = this.seatPermission(s.workspaceKey, s.rigSeat);
    if (!p || (p.asked === 'ask')) return null;
    const kind = s.kind || 'claude';
    const how = kind === 'claude' ? `--permission-mode ${s.permissionMode || p.claudeMode}${p.allow.length ? `, allow ${p.allow.length}` : ''}` : kind === 'codex' && p.codex ? `-s ${p.codex.sandbox} -a ${p.codex.approval}` : '이 종류는 권한 칸을 받지 않는다';
    const text = `${s.rigSeat}: ${p.permission}${p.pending ? '(unattended는 사람의 승인 전이라 scoped)' : ''} · ${how}`;
    return rigEvent(this.b, { kind: 'seat_permission', ws: s.workspaceKey, caseId, seat: s.rigSeat, session: s.sessionId, value: p.permission, actor: 'board', text, data: { asked: p.asked, permission: p.permission, pending: p.pending, kind, mode: kind === 'claude' ? s.permissionMode || p.claudeMode : null, codex: kind === 'codex' ? p.codex : null, allow: p.allow, writes: Array.isArray(p.writes) ? p.writes : p.writes === false ? false : null } });
  }
  // Claude Code 세션 설정 파일에 넣을 증폭(writeSessionSettings의 amp)
  claudeAmp(s) { const x = this.ctxOf(s); return x && x.kind === 'claude' ? claudeSettingsAmp(x) : null; }
  // Codex 인자
  launcherArgs(s, args) { const x = this.ctxOf(s); return x && x.kind === 'codex' ? codexArgsAmp(args, x.writes, x.permission) : (args || []); } // P223: 자리 권한
  // 설정 파일을 지금 정의·자리에 맞춘다(자리를 정하거나 정의가 바뀐 뒤 다음 턴부터). 바뀌었으면 true
  syncSettings(s) {
    if (!s || (s.kind || 'claude') !== 'claude' || !s.settingsPath) return false;
    const amp = this.claudeAmp(s);
    const sig = JSON.stringify(amp);
    if (s.ampSig === sig) return false;
    try {
      const j = JSON.parse(fs.readFileSync(s.settingsPath, 'utf8'));
      const base = this.b.branch && this.b.branch.settingsExtra ? (this.b.branch.settingsExtra(s.sessionId).allow || []) : null; // P223: 판의 기본 allow
      const changed = applySettingsAmp(j, amp, (this.b.cfg && this.b.cfg.hookTimeoutSec) || 2, base);
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
    if (ev === 'PreToolUse') return x.preTool.length > 0 || Array.isArray(x.writes) || x.permission === 'scoped'; // P225
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
    // P225: scoped 자리의 셸 안의 셸은 묻지 않고 거절한다(모델이 PowerShell 도구·Glob·Read로 다시 한다)
    if ((x.permission === 'scoped' || x.permission === 'unattended') && toolName === 'Bash') { // P226: unattended도(판의 고정 기준)
      const sh = nestedShell(toolInput.command);
      if (sh) { try { st.addEvent(s.sessionId, 'rig_pre_tool', { decision: 'deny', why: 'nested_shell', tool: toolName, shell: sh }); } catch {} this.gateEvent(s, x, tr, 'pre-tool', { why: 'nested_shell', tool: toolName, shell: sh }, `셸 안의 셸(${sh})을 거절(scoped: PowerShell 도구·Glob·Read로)`); return denyBody(NESTED_SHELL_REASON); }
    }
    const w = writesVerdict({ writes: x.writes, toolName, toolInput, base: x.cwd, unitId: tr ? tr.unitId : null });
    // P223: scoped 자리는 쓰기 범위 밖을 묻는다(응답 필요로 뜬다), 그 밖(ask·unattended)은 거부
    if (w && x.permission === 'scoped') { try { st.addEvent(s.sessionId, 'rig_pre_tool', { decision: 'ask', why: 'writes', tool: toolName }); } catch {} this.gateEvent(s, x, tr, 'pre-tool', { why: 'writes', tool: toolName, ask: true, target: String(toolInput.file_path || toolInput.path || toolInput.notebook_path || '') || null }, `${w} (scoped: 사람에게 묻는다)`, 'ask'); return askBody(`[Atrium rig] ${w}. 이 자리(scoped)는 쓰기 범위 밖을 사람에게 묻는다.`); }
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
  gateEvent(s, x, tr, at, data, why, value = 'reject') { // P223: value ask(scoped 자리가 사람에게 물음)
    const u = tr && this.b.store.getUnit ? this.b.store.getUnit(tr.unitId) : null;
    rigEvent(this.b, { kind: 'gate', ws: x.key || s.workspaceKey, caseId: u ? u.caseId || null : null, unitId: tr ? tr.unitId : null, tryId: tr ? tr.id : null, seat: x.seat || s.rigSeat || null, session: s.sessionId, value, actor: 'board', text: `${at}: ${why}`, data: { at, hook: null, ...data } });
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
