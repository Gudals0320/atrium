// P321: 빠른 워크트리 세션과 병합 맡기기(설계 P318 4절, 조각 S4·S5). 사람이 판에서 워크트리 세션을 띄우고, 다 되면 카드 메뉴로 병합을 merger에게 맡긴다.
// - 띄우기(판 API session.worktree { workspace, name, launcher, peerOf?, prompt? }): 리포 워크스페이스에서만. 부모 세션이 없는 사람의 띄우기라
//   atrium child가 아니라 Backend.spawn에 worktree 값을 더한 꼴이다.
//   · Claude Code: claude -w <이름>(지금처럼. 브랜치는 Claude Code가 worktree-<이름>으로 만든다. 자리는 기본 .claude/worktrees/<이름>이고
//     사용자의 WorktreeCreate hook이 다른 곳(다른 드라이브)에 만들 수 있다. P337: 판은 자리를 짐작하지 않고 git 워크트리 목록의 브랜치로 찾는다).
//     신뢰를 받지 않은 리포면 리포 뿌리에서 먼저 띄워 신뢰 질문을 카드에 보이고, 사람이 답해 ready가 되면 같은 패널에서 claude -w로 다시 띄운다
//     (하위의 신뢰 관문과 같은 길, branch.mjs relaunchInWorktree. 첫 지시는 다시 띄운 뒤에 넣는다). 신뢰는 대신 답하지 않는다.
//   · 다른 하네스: 판이 git worktree add -b worktree-<이름> <리포>/.claude/worktrees/<이름> <리포의 지금 브랜치>로 만든 뒤 그 폴더(--cwd)에서 띄운다.
//     브랜치 이름이 Claude Code와 같아 워크트리 상자(worktrees.mjs)·merger(mergeVerdict)·치우기가 하네스와 상관없이 같은 길을 쓴다(사용자 hook은 Claude Code에만 걸린다).
//     이것이 판의 첫 git 쓰기다(사람이 띄울 때만). 띄우기가 실패하면 만든 워크트리와 브랜치를 지운다.
//   · 관계: peerOf(리포의 head, 창이 판정해 보낸다)가 있으면 사람이 정한 동료(relation peer, 출처 user)로 잇는다. 없으면 독립. 일 상위는 없다.
//   · 첫 지시를 주면 앞에 판 알림 두 줄(관계, 끝내는 법)을 붙인다. 비우면 띄우기만 한다.
// - 병합 맡기기(판 API merge.request { session, dryRun? }): 워크트리 브랜치에서 일하는 세션에게 일 하나(origin merge_request)를 연다.
//   from = 그 세션의 동료 head(열린, merger 아닌 같은 워크스페이스 동료)면 head, 없으면 그 세션 자신(사람이 맡김: meta.human).
//   일 머리는 "done 글(브랜치·끝 커밋·시험·얻는 것)을 atrium done ok로 써라"이고, 그 세션의 done ok가 지금 하위 흐름 그대로 merger로 간다(merger.mjs planFor·take).
//   · head가 받는 쪽이면 실패·결정·정리 알림이 head로 간다(지금 하위 흐름과 같다). merger가 꺼진 리포면 done이 head에게 가고 head가 합친다.
//   · 사람이 받는 쪽이면: merger에게 넘기지 못한 done, merger의 실패는 그 세션의 결정 카드(P284)로 사람에게. 합침 정리 알림은 보내지 않는다(소식 한 줄은 남는다).
//     merger가 꺼진 리포면 맡기지 않고 까닭을 돌려준다(merger_off). 설정이 ask이고 답이 없으면 merger 묻기 카드를 띄우고 merger_ask.
//   · 병합되면 그 세션은 지금 워커처럼 닫고 보관한다(merger.mjs finishOk).
// - P325 치우기(판 API worktree.discard { session, keepBranch = true, force = false, dryRun? }, 설계 4.5, 조각 S6): 합치지 않고 버린다.
//   확인 값(dryRun)은 병합 맡기기 값(mergeView)에 워크트리 자리(path)와 길(via: merger | board)을 더한 것이다.
//   먼저 판이 세션을 닫고 보관한다(claude -w의 나가기 질문은 남기기로 답한다: P71 kill worktree keep). 지우는 것은 그 뒤에 한다.
//   · merger가 켜진 리포(enabledFor): merger에게 치우기 일(work_units origin merge, meta.discard)을 맡긴다. merger가 git worktree remove [--force],
//     남기기 끔일 때만 git branch -D를 하고 done으로 닫는다. 판은 ok를 믿기 전에 git으로 본다(워크트리 목록에 없고, 지우라 했으면 브랜치도 없나).
//   · 꺼진 리포: 판이 직접 git worktree remove [--force] → git branch -D(남기기 끔일 때만). 사람이 누른 때만 하는 판의 git 쓰기다.
//   · 커밋 안 한 변경이 있으면 force 없이는 거절(dirty). 결과는 소식 한 줄과 창 알림(worktree.discarded).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { branchProbe, branchOf, revOf } from './git.mjs';
import { predictTrust, repoHasCommit } from './launch.mjs';
import { shownName } from './session-label.mjs';
import { deriveState } from './state.mjs';
import { relationHeader } from './branch-relations.mjs';
import { PS_DONE_TAIL } from './work-units.mjs';
import { readMergeConfig, workCwd, short } from './merger.mjs';
import { relaunchInWorktree } from './branch.mjs';
import { clip } from './text.mjs';
import { resolveLauncher } from './launchers.mjs';
import { WT_NAME_RE, wtBranch, autoName, findClaudeWt, wtFolderTaken } from './worktree-names.mjs';
import { parseWorktreeList } from './worktree-areas.mjs'; // P337

function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const newId = (p, n = 3) => p + crypto.randomBytes(n).toString('hex');
const slash = (p) => (p ? String(p).split(path.sep).join('/') : p);
const BT = '\x60';

export { WT_NAME_RE, wtBranch, autoName, nameFromPrompt } from './worktree-names.mjs';
export const WT_ORIGIN = 'merge_request';
export const wtDir = (root, name) => path.join(root, '.claude', 'worktrees', name);
// 띄우는 길(순수). kind: 하네스 종류 → { via: 'claude-w', cwd, worktree } | { via: 'git', cwd, git: [git 인자] }
export function launchPlan({ kind, root, name, base = 'HEAD' }) {
  if (!kind || kind === 'claude') return { via: 'claude-w', cwd: root, worktree: name };
  const dir = wtDir(root, name);
  return { via: 'git', cwd: dir, git: ['-C', root, 'worktree', 'add', '-b', wtBranch(name), dir, base || 'HEAD'] };
}
// 첫 지시 앞의 판 알림 줄(관계, 끝내는 법). 첫 줄은 text.mjs RELATION_LINE 꼴이라 카드에는 사람의 지시만 보인다
export function quickHeader({ head = null, name }) {
  const rel = head ? relationHeader({ relation: 'peer', parent: head }) : '[Atrium 보드] 관계: 너는 사람이 판에서 띄운 워크트리 세션이다(일 상위 없음). 사람과 직접 일한다.';
  const how = '[Atrium 보드] 이 세션은 브랜치 ' + wtBranch(name) + '의 워크트리에서 일한다. 일은 이 브랜치에 커밋해 둔다. 사람이 판에서 "병합 맡기기"를 누르면 보드가 done 보고를 청하고 병합을 merger에게 맡긴다.';
  return rel + '\n' + how;
}
// 병합 맡기기 일 머리(세 줄). 첫 줄은 RELATION_LINE 꼴
export function mergeRequestHeader({ unitId, head = null, kind = null, merger = true }) {
  return [
    '[Atrium 보드] 관계: 사람이 판에서 이 세션의 병합을 맡겼다(일 ' + unitId + ', 보고는 ' + (head ? '@' + head : '사람') + '. 지금 일 보기: ' + BT + 'atrium item' + BT + ').',
    '[Atrium 보드] 할 일을 모두 이 브랜치에 커밋한 뒤 ' + BT + 'atrium done ok "<보고>"' + BT + '로 닫는다: 브랜치, 끝 커밋, 돌린 시험과 결과, 사용자가 얻는 것 한 줄. 커밋할 것이 없거나 지금 맡길 수 없으면 ' + BT + 'atrium done failed "<까닭>"' + BT + '.' + (kind === 'codex' ? ' ' + PS_DONE_TAIL : ''),
    merger || !head ? '[Atrium 보드] 닫으면 보드가 너를 재우고 병합을 merger에게 맡긴다. 병합되면 보드가 이 세션을 닫고 보관한다.'
      : '[Atrium 보드] 이 리포는 merger가 꺼져 있어 닫으면 보드가 done 글을 @' + head + '에게 보내고 @' + head + '가 합친다.',
  ].join('\n');
}
// 병합 맡기기 일의 할 일(첫 줄이 카드와 알림의 일 이름)
export function mergeRequestSpec({ branch, tip, ahead, dirty, target }) {
  return '병합 맡기기: ' + (branch || '?') + ' → ' + (target || '?') + '\n\n- 끝 커밋 ' + short(tip) + ', ' + (target || '?') + '보다 앞선 커밋 ' + (ahead ?? '?') + '개, 커밋 안 한 변경 ' + (dirty ?? '?') + '개\n- 커밋 안 한 변경이 있으면 커밋하고, 시험을 돌린 뒤 done 글을 쓴다.';
}
// merger가 받지 못한 까닭(mergeVerdict why) → 사람이 읽을 말
const WHY_TEXT = { off: '이 리포는 merger가 꺼져 있다', answered_off: '이 리포는 merger를 쓰지 않기로 답했다', not_git: 'git 폴더가 아니다', not_worktree: '워크트리가 아니다', other_repo: '다른 저장소의 워크트리다', detached: '브랜치가 없다(떼어 둔 HEAD)', no_target: '합칠 브랜치를 모른다', same_branch: '합칠 브랜치와 같은 브랜치다', no_commits: '합칠 브랜치보다 앞선 커밋이 없다', ask: '이 리포에서 merger를 쓸지 아직 답하지 않았다' };
export const whyText = (why) => WHY_TEXT[why] || String(why || '까닭 모름');
// 사람에게 남길 결정 카드 질문(한 줄, decisions ASK_QUESTION_MAX 안쪽)
export function humanCardQuestion({ name, kind, line }) {
  const head = kind === 'merge_failed' ? '@' + name + ' 병합 실패' : '@' + name + ' 병합을 맡기지 못함';
  return clip(head + ': ' + String(line || '').replace(/\s+/g, ' ').trim(), 190);
}

// P325: 치우기 git 인자(순수). remove: 워크트리 지우기, branch: 브랜치 지우기(남기기 끔이고 브랜치가 있을 때만, 아니면 null)
export function discardGitArgs({ root, path: dir, branch, keepBranch = true, force = false }) {
  return { remove: ['-C', root, 'worktree', 'remove', ...(force ? ['--force'] : []), dir], branch: !keepBranch && branch ? ['-C', root, 'branch', '-D', branch] : null };
}
// 치운 결과 한 줄(소식·로그)
export function discardResultText(job, r) {
  if (!r.removed) return '워크트리 치우기 실패: ' + (r.error || '까닭 모름');
  const b = job.branch ? (job.keepBranch ? '브랜치 ' + job.branch + ' 남김' : r.branchDeleted ? '브랜치 ' + job.branch + ' 지움' : '브랜치 ' + job.branch + ' 못 지움' + (r.error ? ' (' + r.error + ')' : '')) : '브랜치 없음';
  return '워크트리 치움(' + (r.via === 'merger' ? 'merger' : '보드') + '): ' + job.path + ', ' + b;
}
const same = (a, b) => !!a && !!b && slash(path.resolve(a)).toLowerCase() === slash(path.resolve(b)).toLowerCase();

function gitRun(args, timeout = 30000) {
  return new Promise((res) => execFile('git', args, { encoding: 'utf8', windowsHide: true, timeout }, (err, out, errOut) => res({ ok: !err, out: String(out || ''), err: String(errOut || (err && err.message) || '') })));
}

export class WorktreeSessions {
  // b: 백엔드(sessions, store, spawn, resolve, resolveWorkspace, branch, merger, decisions, worktrees, queue, bus, cfg, log)
  constructor(b, { trustWaitMs } = {}) {
    this.b = b; this.trustWaitMs = trustWaitMs;
    this.gates = new Map(); // 세션 ID → { worktree, at, prompt }(신뢰 관문: 사람이 신뢰에 답하면 claude -w로 다시 띄운다)
    this.passing = new Set();
    if (b.bus && typeof b.bus.on === 'function') {
      b.bus.on('session', (s, sum) => { try { this.onSession(s, sum); } catch (e) { b.log('worktree session gate error', e.stack); } });
      b.bus.on('closed', (s) => { this.gates.delete(s.sessionId); });
    }
  }
  store() { return this.b.store; }
  // 워크스페이스(판 기록의 줄: key, kind, root)
  async wsOf(ref) { const w = await this.b.resolveWorkspace(ref); const row = this.b.store.getWorkspace ? this.b.store.getWorkspace(w.key) : null; return { ...w, ...(row || {}) }; }
  isMerger(s) { return !!(this.b.merger && this.b.merger.isMerger(s)); }
  // 그 세션의 동료 head(열린, merger·셸 아닌 같은 워크스페이스 동료 가운데 하나. 사람이 판에서 이은 것이 먼저)
  headOf(s) {
    const br = this.b.branch; if (!br || !br.relIndex) return null;
    const peers = br.relIndex().peersOf(s.sessionId).map((p) => ({ p, x: this.b.sessions.get(p.id) })).filter(({ x }) => x && !x.closedAt && x.kind !== 'shell' && !this.isMerger(x) && x.workspaceKey === s.workspaceKey);
    peers.sort((a, b) => (b.p.source === 'user') - (a.p.source === 'user'));
    return peers.length ? peers[0].x : null;
  }
  // 그 리포의 살아 있는 워크트리 목록(판이 읽어 둔 것, 없으면 git으로 읽는다). P337: hook이 저장소 밖에 만든 워크트리도 든다
  async liveOf(root, wsKey = null) {
    const have = wsKey && this.b.worktrees && this.b.worktrees.live ? this.b.worktrees.live(wsKey) : null;
    if (have) return have;
    const r = await gitRun(['-C', root, 'worktree', 'list', '--porcelain'], 5000);
    return r.ok ? parseWorktreeList(r.out).filter((w) => !w.main) : [];
  }
  // 이름이 그 리포에서 비었는가 → null | 까닭. dir_exists: 기본 자리의 폴더, 또는 같은 폴더 이름의 워크트리(P337: hook이 다른 곳에 만든 것. 같은 이름이면 hook이 그것을 다시 연다)
  async nameProblem(root, name, wsKey = null) {
    if (!WT_NAME_RE.test(name)) return 'bad_name';
    const lower = name.toLowerCase();
    if ([...this.b.sessions.values()].some((x) => !x.closedAt && [x.name, x.label, x.agentName].some((n) => n && String(n).toLowerCase() === lower))) return 'name_taken';
    if (fs.existsSync(wtDir(root, name))) return 'dir_exists';
    if (wtFolderTaken(await this.liveOf(root, wsKey), name)) return 'dir_exists';
    if (await revOf(root, 'refs/heads/' + wtBranch(name))) return 'branch_exists';
    return null;
  }
  // 창의 빠른 창이 띄우기 전에 보는 값: 자동 이름, 브랜치·자리, head 후보 검사는 창이 한다
  async preview(p = {}) {
    const ws = await this.wsOf(p.workspace);
    if (ws.kind !== 'repo') return { workspace: ws.key, repo: false };
    const root = ws.root;
    const taken = [...this.b.sessions.values()].filter((x) => !x.closedAt).flatMap((x) => [x.name, x.label].filter(Boolean));
    try { for (const d of fs.readdirSync(path.join(root, '.claude', 'worktrees'))) taken.push(d); } catch {}
    for (const w of await this.liveOf(root, ws.key)) { const n = String(w.path || '').split('/').filter(Boolean).pop(); if (n) taken.push(n); } // P337: 다른 자리의 워크트리 폴더 이름
    let name = p.name ? String(p.name) : autoName(new Date(), taken);
    for (let i = 0; i < 30 && !p.name && (await this.nameProblem(root, name, ws.key)); i++) { taken.push(name); name = autoName(new Date(), taken); }
    const problem = await this.nameProblem(root, name, ws.key);
    return { workspace: ws.key, repo: true, root: slash(root), name, problem, branch: wtBranch(name), path: '.claude/worktrees/' + name, base: await branchOf(root).catch(() => null), hasCommit: repoHasCommit(root) };
  }

  // ---------- 띄우기 ----------
  async create(p = {}) {
    const b = this.b;
    const ws = await this.wsOf(p.workspace);
    if (ws.kind !== 'repo') throw apiError('not_repo', '워크트리 세션은 Git 저장소에서만 띄울 수 있습니다: ' + slash(ws.root));
    const root = ws.root;
    const name = String(p.name || '').trim();
    const bad = await this.nameProblem(root, name, ws.key);
    if (bad === 'bad_name') throw apiError('bad_request', '이름은 영문 소문자로 시작하고 소문자, 숫자, -만 씁니다(32자까지): ' + name);
    if (bad) throw apiError('name_taken', bad === 'name_taken' ? '이미 사용 중인 이름입니다: ' + name : bad === 'dir_exists' ? '같은 이름의 워크트리 폴더가 이미 있습니다: ' + name : '브랜치가 이미 있습니다: ' + wtBranch(name), { why: bad });
    if (!repoHasCommit(root)) throw apiError('needs_commit', '이 저장소(' + slash(root) + ')에 커밋이 없어 워크트리를 만들 수 없습니다. 먼저 첫 커밋을 만드세요. 보드에서 대신 생성하지는 않습니다.');
    const head = p.peerOf ? b.resolve(p.peerOf) : null;
    if (head && head.workspaceKey !== ws.key) throw apiError('bad_request', '동료로 이을 세션(@' + shownName(head) + ')이 이 리포에 없습니다.');
    // 종류: 런처를 풀어 본다(spawn이 다시 푼다)
    const L = b.features && b.features.launchers;
    const launcher = p.launcher ? (L ? L.get(p.launcher) : null) : null;
    if (p.launcher && !launcher) throw apiError('no_launcher', '런처를 찾을 수 없습니다: ' + p.launcher);
    const kind = launcher ? resolveLauncher(launcher).kind : String(p.kind || 'claude');
    if (kind === 'shell' || kind === 'command') throw apiError('bad_request', '워크트리 세션은 에이전트 하네스로만 띄웁니다(셸·직접 명령 제외).');
    const base = (await branchOf(root).catch(() => null)) || 'HEAD';
    const plan = launchPlan({ kind, root, name, base });
    const prompt = p.prompt && String(p.prompt).trim() ? quickHeader({ head: head ? shownName(head) : null, name }) + '\n\n' + String(p.prompt).trim() : null;
    const gate = plan.via === 'claude-w' && predictTrust(root, b.cfg.claudeJson).needsTrust;
    let made = false;
    if (plan.via === 'git') {
      const r = await gitRun(plan.git);
      if (!r.ok) throw apiError('git_failed', 'git worktree add가 실패했습니다: ' + clip(r.err.trim(), 300));
      made = true;
      if (b.worktrees) await b.worktrees.sync('worktree session').catch(() => {}); // 상자를 먼저 세워 노드가 그 안에 서게
    }
    const sp = { cwd: plan.cwd, name, ...(p.launcher ? { launcher: p.launcher } : { kind }), ...(p.model ? { model: p.model } : {}), ...(plan.via === 'claude-w' && !gate ? { worktree: name } : {}), ...(prompt && !gate ? { prompt } : {}) };
    let r;
    try { r = await b.spawn(sp); }
    catch (e) {
      if (made) { await gitRun(['-C', root, 'worktree', 'remove', '--force', plan.cwd]); await gitRun(['-C', root, 'branch', '-D', wtBranch(name)]); b.log('worktree session ' + name + ' spawn failed, removed its worktree'); }
      throw e;
    }
    const s = b.sessions.get(r.sessionId);
    if (s) s.quickWorktree = { name, via: plan.via };
    if (gate && s) this.gates.set(s.sessionId, { worktree: name, at: Date.now(), prompt });
    if (head && s && b.branch) b.branch.setRelation(head, s, 'peer', { source: 'user', by: 'user', quiet: true });
    if (plan.via === 'claude-w' && s && !gate) this.watchWorktree(s, root, name);
    this.store().addEvent(r.sessionId, 'worktree_session', { name, via: plan.via, kind, branch: wtBranch(name), base: plan.via === 'git' ? base : null, peerOf: head ? head.sessionId : null, gate: !!gate, prompt: !!prompt });
    b.log('worktree session ' + name + ' (' + plan.via + ', ' + kind + (head ? ', peer of ' + head.name : '') + (gate ? ', trust gate' : '') + ')');
    return { ...r, worktree: { name, branch: wtBranch(name), path: slash(plan.via === 'git' ? plan.cwd : wtDir(root, name)), via: plan.via, base: plan.via === 'git' ? base : null, gate: !!gate }, peer: head ? shownName(head) : null };
  }
  // claude -w는 첫 요청(hook) 전까지 판에 리포 뿌리에서 도는 것으로 보인다. 워크트리 폴더가 생기면 hook을 기다리지 않고 그 폴더를 세션의 폴더로 보고
  //   git을 다시 읽는다(카드가 노란 상자에 들고 병합 맡기기가 보인다. 하위의 --worktree 워커는 worktrees.mjs expectedWt가 같은 일을 한다). hook이 오면 hook을 따른다
  // P337: 폴더는 기본 자리(<리포>/.claude/worktrees/<이름>)에 생기거나, 사용자 hook이 다른 곳에 만든다. 기본 자리에 없으면 git 워크트리 목록에서 브랜치 worktree-<이름>을 찾는다
  async findWorktreeDir(root, name) {
    const dir = wtDir(root, name);
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const r = await gitRun(['-C', root, 'worktree', 'list', '--porcelain'], 5000);
    const hit = r.ok ? findClaudeWt(parseWorktreeList(r.out).filter((w) => !w.main && !w.prunable), name) : null;
    return hit && fs.existsSync(hit.path) ? hit.path : null;
  }
  watchWorktree(s, root, name, { everyMs = 1000, maxMs = 90000 } = {}) {
    const b = this.b; const t0 = Date.now();
    const tick = async () => {
      if (!b.sessions.has(s.sessionId)) return;
      if (s.rt && s.rt.cwd && path.resolve(s.rt.cwd).toLowerCase() !== path.resolve(s.cwd).toLowerCase()) { if (b.worktrees) b.worktrees.kick('worktree session'); return; } // hook이 이미 알렸다
      const dir = await this.findWorktreeDir(root, name).catch(() => null);
      if (!b.sessions.has(s.sessionId)) return;
      if (dir) {
        if (s.rt) s.rt.cwd = slash(dir);
        if (b.probeGit) b.probeGit(s, dir);
        if (b.worktrees) b.worktrees.kick('worktree session');
        this.store().addEvent(s.sessionId, 'worktree_session_in', { dir: slash(dir), ms: Date.now() - t0 });
        return;
      }
      if (Date.now() - t0 < maxMs) { const t = setTimeout(() => tick().catch(() => {}), everyMs); if (t.unref) t.unref(); }
    };
    tick().catch(() => {});
  }
  // 신뢰 관문: 사람이 신뢰에 답해 ready(또는 그 사이 들어간 지시로 working·waiting)가 되면 claude -w로 다시 띄운다
  onSession(s, sum) {
    const g = this.gates.get(s.sessionId);
    if (!g || this.passing.has(s.sessionId)) return;
    if (!['ready', 'working', 'waiting'].includes(sum.state)) return;
    this.passing.add(s.sessionId);
    relaunchInWorktree(this.b, s, g.worktree, { since: g.at, ...(this.trustWaitMs != null ? { trustWaitMs: this.trustWaitMs } : {}) })
      .then((r) => {
        this.gates.delete(s.sessionId);
        if (!r) return;
        this.store().addEvent(s.sessionId, 'trust_gate_passed', { worktree: g.worktree, trusted: r.trusted, slipped: !!r.slipped, args: r.args, quick: true });
        this.b.log('worktree session trust gate passed ' + s.name + ': relaunch with -w ' + g.worktree);
        this.b.broadcastSession(s, { cause: 'trust_gate' });
        this.watchWorktree(s, s.cwd, g.worktree);
        const text = [g.prompt, r.slipped].filter(Boolean).join('\n\n');
        if (text) this.b.queue.enqueue(s.sessionId, text, { origin: { kind: 'human' } });
      })
      .catch((e) => { this.b.log('worktree session trust gate failed ' + s.name + ': ' + (e.stack || e.message)); this.store().addEvent(s.sessionId, 'trust_gate_failed', { error: e.code || e.message, quick: true }); })
      .finally(() => this.passing.delete(s.sessionId));
  }

  // ---------- 병합 맡기기 ----------
  async mergeView(s) {
    const b = this.b;
    if (!s) throw apiError('not_found', '세션을 찾을 수 없습니다.');
    if (s.kind === 'shell') throw apiError('not_agent', '셸 세션은 병합을 맡길 수 없습니다.');
    if (this.isMerger(s)) throw apiError('bad_request', 'merger 세션입니다.');
    const ws = s.workspaceKey; const w = ws && b.store.getWorkspace ? b.store.getWorkspace(ws) : null; const root = w && w.root;
    if (!root) throw apiError('not_repo', '이 세션의 리포를 찾을 수 없습니다.');
    const cfg = readMergeConfig(root);
    const target = cfg.config.target || (await branchOf(root).catch(() => null));
    const cwd = workCwd(s);
    const probe = cwd ? await branchProbe(cwd, target).catch(() => null) : null;
    const head = this.headOf(s);
    const m = b.merger;
    const mode = m ? m.modeFor(ws) : { mode: 'off', answer: null };
    return { session: s.sessionId, name: shownName(s) || s.name, workspace: ws, root: slash(root), worktree: !!(probe && probe.isWorktree), branch: probe ? probe.branch : null, tip: probe ? probe.tip : null, ahead: probe ? probe.ahead : null, dirty: probe ? probe.dirty : null,
      path: probe && probe.isWorktree ? slash(probe.root) : null, target, head: head ? shownName(head) : null, headId: head ? head.sessionId : null, mode: mode.mode, answer: mode.answer, enabled: !!(m && m.enabledFor(ws)), busy: !!this.store().openTryOf(s.sessionId) };
  }
  async request(p = {}) {
    const b = this.b; const st = this.store();
    const s = b.resolve(p.session);
    const v = await this.mergeView(s);
    if (p.dryRun) return v;
    if (!v.worktree || !v.branch) throw apiError('not_worktree', '@' + v.name + '는 워크트리 브랜치에서 일하지 않습니다(병합할 브랜치가 없다).');
    if (v.branch === v.target) throw apiError('same_branch', '@' + v.name + '의 브랜치가 합칠 브랜치(' + v.target + ')와 같습니다.');
    if (v.ahead === 0 && v.dirty === 0) throw apiError('no_commits', '@' + v.name + '의 브랜치에 ' + v.target + '보다 앞선 커밋도, 커밋 안 한 변경도 없습니다(병합할 것이 없다).');
    if (v.busy) throw apiError('busy', '@' + v.name + '는 맡은 일이 열려 있습니다. 그 일이 닫힌 뒤 다시 맡기세요.');
    if (!v.enabled && !v.headId) {
      if (v.mode === 'ask' && v.answer == null && b.merger) { b.merger.ask(v.workspace, { child: v.name, branch: v.branch, target: v.target, root: v.root }); throw apiError('merger_ask', '이 리포에서 merger를 쓸지 먼저 답하세요(판의 merger 카드). 답한 뒤 다시 맡기세요.', { workspace: v.workspace }); }
      throw apiError('merger_off', '이 리포는 merger가 꺼져 있어 맡길 곳이 없습니다(설정 › 에이전트 › 병합에서 켜거나 직접 합치세요).', { workspace: v.workspace });
    }
    const human = !v.headId;
    const unit = { id: newId('u'), from: human ? s.sessionId : v.headId, to: s.sessionId, origin: WT_ORIGIN, spec: mergeRequestSpec(v), status: 'open', createdAt: Date.now(), meta: { human, by: 'human', branch: v.branch, tip: v.tip, target: v.target, merger: v.enabled } };
    st.insertUnit(unit);
    const hold = st.queuedUnitsOf(s.sessionId).some((u) => u.id !== unit.id);
    st.addEvent(s.sessionId, 'unit_open', { unitId: unit.id, from: human ? '(human)' : v.head, origin: WT_ORIGIN, held: hold, chars: unit.spec.length });
    st.addEvent(s.sessionId, 'merge_request', { unitId: unit.id, branch: v.branch, tip: v.tip, target: v.target, ahead: v.ahead, head: v.head, human, enabled: v.enabled });
    b.log('merge request ' + unit.id + ' @' + v.name + ' ' + v.branch + ' -> ' + v.target + (human ? ' (human)' : ' (head ' + v.head + ')'));
    if (hold) b.branch.units.queued.add(s.sessionId);
    else b.branch.units.dispatch(st.getUnit(unit.id));
    return { unit: unit.id, held: hold, ...v };
  }
  headerFor(unit) {
    const t = this.b.sessions.get(unit.to);
    const m = unit.meta || {};
    return mergeRequestHeader({ unitId: unit.id, head: m.human ? null : this.b.branch.units.nameOf(unit.from), kind: t ? t.kind || 'claude' : null, merger: m.merger !== false });
  }
  // 사람이 받는 쪽인 일의 끝을 사람에게(결정 카드). kind: 'unrouted'(merger에게 넘기지 못한 done) | 'merge_failed'(merger가 합치지 못함)
  tellHuman(s, { kind, line, why = null }) {
    const d = this.b.decisions;
    if (!s || !d) return null;
    try {
      const r = d.create(s, { kind: 'decide', question: humanCardQuestion({ name: shownName(s) || s.name, kind, line }), options: [], why: why ? clip(why, 190) : null }, 'ask');
      this.store().addEvent(s.sessionId, 'merge_request_told', { kind, card: r.id });
      return r.id;
    } catch (e) { this.b.log('merge request card ' + s.name + ' ' + (e.code || e.message)); return null; }
  }
  // work-units done이 부른다: 사람이 맡긴 병합 일의 done이 merger로 가지 않았다
  onUnrouted(caller, unit, result, text, merge) {
    const line = result === 'failed' ? String(text || '').split('\n').map((l) => l.trim()).find(Boolean) || '' : whyText(merge && merge.why) + (merge && merge.probe && merge.probe.branch ? ' (' + merge.probe.branch + ')' : '');
    return this.tellHuman(caller, { kind: 'unrouted', line });
  }
  // work-units done이 부른다: 사람이 맡긴 병합을 merger가 합치지 못했다(하위는 재운 채)
  onMergeFailed(mu, text, extra = []) {
    const m = mu.meta || {};
    const s = m.childId ? this.b.sessions.get(m.childId) : null;
    const line = String(text || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
    return this.tellHuman(s, { kind: 'merge_failed', line, why: extra.map((x) => String(x).replace(/^\[Atrium 보드\] /, '')).join(' ') });
  }
  // ---------- P325 치우기 ----------
  async discardView(s) {
    const v = await this.mergeView(s);
    const m = this.b.merger;
    return { ...v, via: m && m.enabledFor(v.workspace) ? 'merger' : 'board' };
  }
  async discard(p = {}) {
    const b = this.b; const st = this.store();
    const s = b.resolve(p.session);
    const v = await this.discardView(s);
    if (p.dryRun) return v;
    if (!v.worktree || !v.path) throw apiError('not_worktree', '@' + v.name + '는 워크트리에서 일하지 않습니다(치울 워크트리가 없다).');
    if (v.branch && v.branch === v.target) throw apiError('same_branch', '@' + v.name + '의 브랜치가 합칠 브랜치(' + v.target + ')와 같습니다. 치우지 않습니다.');
    if (same(v.path, v.root)) throw apiError('not_worktree', '리포 뿌리는 치우지 않습니다: ' + v.root);
    const force = !!p.force; const keepBranch = p.keepBranch !== false || !v.branch;
    if (v.dirty > 0 && !force) throw apiError('dirty', '@' + v.name + '의 워크트리에 커밋 안 한 변경이 ' + v.dirty + '개 있습니다. 변경까지 지우려면 force를 켭니다.', { dirty: v.dirty });
    const job = { name: v.name, sessionId: s.sessionId, kind: s.kind || 'claude', workspace: v.workspace, root: v.root, path: v.path, branch: v.branch, tip: v.tip, ahead: v.ahead, dirty: v.dirty, target: v.target, keepBranch, force };
    st.addEvent(s.sessionId, 'worktree_discard', { via: v.via, path: v.path, branch: v.branch, ahead: v.ahead, dirty: v.dirty, keepBranch, force });
    b.log('worktree discard @' + v.name + ' ' + v.path + ' (' + v.via + (keepBranch ? ', keep branch' : ', delete branch') + (force ? ', force' : '') + ')');
    // 세션 닫기(워크트리는 남긴다: claude -w의 나가기 질문에 남기기로 답한다). 지우기는 판·merger가 한다
    const br = b.branch;
    if (br && br.byParentKill) br.byParentKill.add(s.sessionId); // 위 세션에게 닫힘 알림을 보내지 않는다
    try { await b.kill({ session: s.sessionId, confirm: true, worktree: 'keep', after: 'archive' }); }
    catch (e) { if (br && br.byParentKill) br.byParentKill.delete(s.sessionId); throw e; }
    if (v.via === 'merger' && b.merger) {
      const r = b.merger.takeDiscard(job);
      return { ...v, closed: true, via: 'merger', unit: r.unit, merger: r.merger, keepBranch, force };
    }
    const r = await this.removeDirect(job);
    this.discarded(job, { via: 'board', ...r });
    return { ...v, closed: true, via: 'board', keepBranch, force, ...r };
  }
  // 판이 직접 지운다(merger 꺼짐, 또는 merger를 띄우지 못함). 막 끝난 세션이 폴더를 쥐고 있을 수 있어(Windows) 몇 번 다시 해 본다
  //   → { removed, branchDeleted, error }
  async removeDirect(job, { tries = 5, waitMs = 1000 } = {}) {
    const args = discardGitArgs(job);
    let r = null;
    for (let i = 0; i < tries; i++) {
      r = await gitRun(args.remove);
      if (r.ok) break;
      if (i < tries - 1) await new Promise((res) => setTimeout(res, waitMs));
    }
    if (!r.ok) return { removed: false, branchDeleted: false, error: clip('git worktree remove: ' + r.err.trim(), 300) };
    if (this.b.worktrees) this.b.worktrees.kick('worktree discard');
    if (!args.branch) return { removed: true, branchDeleted: false, error: null };
    const d = await gitRun(args.branch);
    return { removed: true, branchDeleted: d.ok, error: d.ok ? null : clip('git branch -D: ' + d.err.trim(), 300) };
  }
  // 치운 결과를 사람에게(소식 한 줄, 창 알림). merger 길은 merger.mjs가 done 뒤에 부른다
  discarded(job, r) {
    const st = this.store();
    const ok = !!r.removed && !r.error;
    const text = '@' + job.name + ' ' + discardResultText(job, r);
    try { st.addNews({ sessionId: job.sessionId, name: job.name, at: Date.now(), kind: 'discard', task: '치우기: @' + job.name, text, result: ok ? 'ok' : 'failed' }); } catch (e) { this.b.log('discard news ' + e.message); }
    try { st.addEvent(job.sessionId, 'worktree_discarded', { via: r.via, removed: !!r.removed, branchDeleted: !!r.branchDeleted, error: r.error || null }); } catch {}
    try { if (this.b.api && this.b.api.broadcast) this.b.api.broadcast('worktree.discarded', { name: job.name, workspace: job.workspace, branch: job.branch, path: job.path, via: r.via, removed: !!r.removed, branchDeleted: !!r.branchDeleted, keepBranch: job.keepBranch, error: r.error || null }); } catch {}
    this.b.log('worktree discarded @' + job.name + ' via ' + r.via + ': ' + text);
  }
  handlers() {
    return {
      'worktree.discard': (p) => this.discard(p),
      'session.worktree': (p) => this.create(p),
      'session.worktreePreview': (p) => this.preview(p),
      'merge.request': (p) => this.request(p),
    };
  }
}
