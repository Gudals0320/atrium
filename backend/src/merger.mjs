// P267: 합치기 merger를 판의 기능으로(docs research merger-feature.md). 판 쪽: 찾기·띄우기, 합치기 일 머리, 수명, .atrium/merge.json 읽기, 하위 재우기·닫기·보관, 사람에게 묻기.
// - 브랜치(워크트리)에서 일한 하위가 atrium done ok로 닫으면(work-units.mjs doneVerb → planFor) 판이 git을 읽어 본다:
//   하위 폴더가 그 워크스페이스 저장소의 워크트리이고, 브랜치가 합칠 브랜치와 다르고, 합칠 브랜치보다 앞선 커밋이 있고, 이 워크스페이스에서 기능이 켜졌는가.
//   맞으면 done 값을 부모에게 보내지 않고(claimed_by merger) 합치기 일(work_units.origin merge, from = 원래 부모, to = merger)을 만들어 그 워크스페이스·합칠 브랜치의 merger에게 넣는다.
//   아니면 지금처럼 부모에게 간다. 설정이 ask이고 이 워크스페이스의 답이 없으면 사람에게 판 카드(merger.ask 이벤트)로 한 번 묻고, 답이 올 때까지 지금처럼 부모에게 간다.
// - 하위는 그 턴이 끝나면 판이 바로 재운다(Windows에서 워크트리 폴더가 풀리게). merger가 ok로 닫으면 판이 하위를 닫고 보관한다(워크트리·브랜치는 merger가 지웠다).
//   merger가 failed로 닫으면 그 글이 원래 부모에게만 가고 하위는 재운 채 둔다(부모가 다시 시키면 깨어나 같은 워크트리에서 잇는다).
// - merger의 ok는 부모를 깨우지 않는다: 소식(peer_news kind merge) 한 줄과 부모의 atrium items의 "합침"으로만 보인다.
// - merger는 워크스페이스 + 합칠 브랜치마다 하나(meta mergers). 합치기 일 MERGER_JOBS번을 닫으면, 또는 줄 선 일이 없고 그 워크스페이스에 브랜치에서 일하는 하위가 없으면
//   그 턴이 끝난 뒤 판이 닫고 보관한다. 남은 일은 새 merger가 받는다(같은 이름을 다시 쓴다). merger의 워크트리 폴더(.atrium/merge/<브랜치>)는 남는다.
// - 판은 git을 읽기만 한다(git.mjs branchProbe·worktreeList·revOf·isAncestor). 합치기·충돌·시험·올리기·워크트리와 브랜치 지우기는 merger 에이전트가 한다(merger-guide.md).
// - merger의 멈춤(done 없이 쉼, 오류, 닫힘)은 일 표의 멈춤 알림(unit-stops.mjs)이 그 일의 from = 원래 부모에게 알린다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { branchProbe, worktreeList, revOf, branchOf, isAncestor } from './git.mjs';
import { shownName } from './session-label.mjs';
import { ensureAtriumDir, excludeFileOf } from './doc-check.mjs';
import { DEFAULTS } from './settings.mjs';
import { workspaceNames } from './workspaces.mjs';
import { clip } from './text.mjs';

export const MERGER_JOBS = 5; // 합치기 일 다섯 번마다 새 merger(설계 13절, 설정 칸으로 내지 않는다)
export const MERGER_MODES = ['on', 'ask', 'off'];
export const MERGE_CONFIG = '.atrium/merge.json';
export const MERGE_WHERE = ['worktree', 'main'];
export const MERGER_GUIDE_FILE = fileURLToPath(new URL('./merger-guide.md', import.meta.url));
export const SLEEP_TRIES = 3; // 하위 재우기를 몇 번 해 보나(턴이 끝날 때마다 한 번)
const META_RECS = 'mergers';
const META_ANSWERS = 'mergerAnswers';
const META_ASKS = 'mergerAsks';
const BRANCH_RE = /^(?![-/.])(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._\/-]{1,200}(?<![/.])$/;
const NAME_MAX = 32;
const BT = '\x60';
function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const newId = (p, n = 3) => p + crypto.randomBytes(n).toString('hex');
const slash = (p) => (p ? String(p).split(path.sep).join('/') : p);
const same = (a, b) => !!a && !!b && slash(path.resolve(a)).toLowerCase() === slash(path.resolve(b)).toLowerCase();
export const mergeKey = (ws, target) => ws + '|' + target;
export const short = (h) => (h ? String(h).slice(0, 9) : '?');

export function readMergerGuide(file = MERGER_GUIDE_FILE) { try { return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); } catch (e) { return '(merger 안내 파일을 읽지 못했다: ' + e.message + ')'; } }

// .atrium/merge.json → { config: { target, where, push, guide }, source, problems }. 칸은 이 넷으로 그친다(설계 7절). 잘못된 칸은 기본값으로 두고 problems에 적는다
export function readMergeConfig(root) {
  const config = { target: null, where: 'worktree', push: false, guide: null };
  const problems = [];
  const file = root ? path.join(root, MERGE_CONFIG) : null;
  let raw = null;
  try { raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); } catch { return { config, source: null, problems }; }
  let j;
  try { j = JSON.parse(raw); } catch (e) { return { config, source: MERGE_CONFIG, problems: [MERGE_CONFIG + '을 읽지 못했다(JSON): ' + e.message] }; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { config, source: MERGE_CONFIG, problems: [MERGE_CONFIG + '은 객체여야 한다'] };
  for (const k of Object.keys(j)) if (!['target', 'where', 'push', 'guide'].includes(k)) problems.push('모르는 칸: ' + k);
  if (j.target != null) { if (typeof j.target === 'string' && BRANCH_RE.test(j.target)) config.target = j.target; else problems.push('target은 브랜치 이름이다: ' + JSON.stringify(j.target)); }
  if (j.where != null) { if (MERGE_WHERE.includes(j.where)) config.where = j.where; else problems.push('where는 worktree 또는 main이다: ' + JSON.stringify(j.where)); }
  if (j.push != null) { if (typeof j.push === 'boolean') config.push = j.push; else problems.push('push는 true 또는 false다: ' + JSON.stringify(j.push)); }
  if (j.guide != null) {
    const g = typeof j.guide === 'string' ? j.guide.trim() : '';
    if (g && !path.isAbsolute(g) && !g.split(/[\\/]/).includes('..')) config.guide = g.split('\\').join('/'); else problems.push('guide는 저장소 안 상대 경로다: ' + JSON.stringify(j.guide));
  }
  return { config, source: MERGE_CONFIG, problems };
}

// merger 이름: merger-<워크스페이스>-<브랜치>(영문 소문자로 시작, 소문자·숫자·-·_, 32자까지). 닫힌 세션의 이름은 다시 쓸 수 있다. 열린 다른 세션이 쓰면 -2, -3…
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
export function mergerNameOf({ wsName, target, taken = new Set() }) {
  const w = slug(wsName).slice(0, 12).replace(/-+$/, '');
  let base = ('merger-' + (w ? w + '-' : '') + slug(target)).slice(0, NAME_MAX).replace(/[-_]+$/, '');
  if (!/^[a-z]/.test(base)) base = 'merger';
  const has = (n) => [...taken].some((x) => String(x).toLowerCase() === n);
  if (!has(base)) return base;
  for (let i = 2; i < 100; i++) { const n = base.slice(0, NAME_MAX - String(i).length - 1) + '-' + i; if (!has(n)) return n; }
  return 'merger-' + Date.now().toString(36);
}
// merger의 워크트리 폴더(합칠 브랜치마다 하나, 세대가 바뀌어도 남는다). .atrium/은 git 밖(판이 .git/info/exclude에 둔다)
export const mergerWorktreeOf = (root, target) => slash(path.join(root, '.atrium', 'merge', slug(target) || 'target'));

// 판정(순수). → { route, why, ask }
//   why: merger(merger 자신·합치기 일), off, answered_off, not_git, not_worktree, other_repo, detached, no_target, same_branch, no_commits, ask, ok
export function mergeVerdict({ mode = 'ask', answer = null, probe = null, repoCommonDir = null, target = null, isMerger = false }) {
  const no = (why, extra = {}) => ({ route: false, why, ask: false, ...extra });
  if (isMerger) return no('merger');
  if (mode === 'off') return no('off');
  if (!probe) return no('not_git');
  if (!probe.isWorktree) return no('not_worktree');
  if (repoCommonDir && !same(probe.commonDir, repoCommonDir)) return no('other_repo');
  if (!probe.branch) return no('detached');
  if (!target) return no('no_target');
  if (probe.branch === target) return no('same_branch');
  if (!(probe.ahead > 0)) return no('no_commits');
  if (mode === 'ask' && answer !== 'on') return answer === 'off' ? no('answered_off') : no('ask', { ask: true });
  return { route: true, why: 'ok', ask: false };
}

// 합치기 일의 할 일(판이 쓰는 머리 + 하위의 done 글 그대로). 첫 줄이 카드와 알림의 일 이름이 된다
export function mergeJobText(x) {
  const yes = (v) => (v ? '켜짐' : '꺼짐');
  const lines = [
    '합치기: @' + x.child + ' (' + x.branch + ' → ' + x.target + ')',
    '',
    '- 맡긴 부모: @' + x.parent,
    '- 하위: @' + x.child + (x.childKind && x.childKind !== 'claude' ? ' (종류 ' + x.childKind + ')' : ''),
    '- 하위의 워크트리: ' + slash(x.worktree),
    '- 브랜치: ' + x.branch + ', 끝 커밋 ' + (x.tip || '?') + ', 합칠 브랜치보다 앞선 커밋 ' + (x.ahead ?? '?') + '개, 커밋 안 한 변경 ' + (x.dirty ?? '?') + '개',
    '- 합칠 브랜치: ' + x.target + (x.holder ? ' (걸린 체크아웃: ' + slash(x.holder) + ')' : ' (어디에도 걸려 있지 않다: 너의 워크트리가 건다)'),
    '- 너의 워크트리: ' + slash(x.mergerWorktree),
    '- 합치는 곳(where): ' + x.where + ', 원격에 올리기(push): ' + yes(x.push) + (x.guide ? ', 저장소 안내: ' + x.guide : '') + (x.configSource ? ' (' + x.configSource + ')' : ' (기본값, ' + MERGE_CONFIG + ' 없음)'),
  ];
  if (x.problems && x.problems.length) lines.push('- ' + MERGE_CONFIG + ' 문제(기본값을 썼다): ' + x.problems.join('; '));
  lines.push('', '## @' + x.child + '의 done 글', String(x.doneText || '').replace(/\s+$/, ''));
  return lines.join('\n');
}
// 합치기 일 머리(세 줄, 판 알림 꼴). 첫 줄은 text.mjs RELATION_LINE 꼴이라 카드에는 아래 할 일만 지시로 보인다
export function mergeHeader({ unitId, parent, child }) {
  return [
    '[Atrium 보드] 관계: 너는 이 워크스페이스의 merger다. 아래는 @' + parent + '가 맡긴 @' + child + '의 결과를 합치는 일 ' + unitId + '이다(지금 일과 줄 선 일 수: ' + BT + 'atrium item' + BT + ').',
    '[Atrium 보드] 끝나면 ' + BT + 'atrium done ok "합침 <해시> …"' + BT + '(더 볼 것이 없다: 합쳤고 워크트리와 브랜치를 지웠다)나 ' + BT + 'atrium done failed "못 합침|합쳤지만 고침 필요|결정 필요: …"' + BT + '(부모가 봐야 한다: 워크트리를 남긴다)로 닫는다.',
    '[Atrium 보드] 하위에게 지시하지 않는다. 안내: ' + BT + 'atrium guide merger' + BT + '(처음 일에는 아래에 붙였다).',
  ].join('\n');
}
// 하위 일 머리 셋째 줄 끝(브랜치에서 일하는 하위, 기능이 꺼지지 않은 워크스페이스)
export const MERGE_CHILD_TAIL = '브랜치에서 일했으면 done ok 뒤 보드가 너를 재우고 합치기를 merger에게 맡긴다: done 글에 브랜치, 끝 커밋, 돌린 시험과 결과, 사용자가 얻는 것 한 줄을 적는다.';
// merger가 failed로 닫은 글 끝에 붙는 줄(부모가 받는다)
export function mergeFailLines({ child, worktree, branch, merger }) {
  return ['[Atrium 보드] @' + merger + '가 합치지 못했거나 고침이 필요하다. @' + child + '는 재운 채 둔다(워크트리 ' + slash(worktree) + ', 브랜치 ' + branch + '). 고칠 것은 ' + BT + 'atrium prompt ' + child + ' "<할 일>"' + BT + '로 다시 시킨다(깨어나 같은 워크트리에서 잇는다). 다 고쳐 done ok가 오면 보드가 다시 merger에게 맡긴다.'];
}
// 부모에게 돌려보낼 때(merger를 띄우지 못함) 붙는 줄
export const mergeFallbackLine = (why) => '[Atrium 보드] 보드가 이 결과를 merger에게 맡기지 못해 너에게 그대로 보낸다(' + why + '). 지금처럼 네가 합친다.';
// 부모의 atrium items에 보이는 합치기 상태
export function mergeState(mu, lastTry) {
  if (!mu) return null;
  if (mu.status === 'done') return 'merged';
  if (mu.status === 'failed') return 'failed';
  if (mu.status === 'cancelled') return 'cancelled';
  return mu.to && lastTry ? 'merging' : 'queued';
}

export class Merger {
  // b: 백엔드(sessions, store, spawn, kill, sleeper, queue, adapter, api, log). units: WorkUnits. opts.settings: () => 설정(시험)
  constructor(b, units, { settings = null, jobs = MERGER_JOBS, sleepDelayMs = 300 } = {}) {
    this.b = b; this.units = units; this.jobs = jobs; this.sleepDelayMs = sleepDelayMs; this._settings = settings;
    this.pendingSleep = new Map(); // 하위 세션 ID → 해 본 수(턴이 끝나면 재운다)
    this.sleeping = new Set();
    this.pendingCheck = new Set(); // 합치기 일을 닫은 merger(그 턴이 끝나면 수명을 본다)
    this.retiring = new Set(); // 닫는 중인 merger
    this.spawning = new Map(); // 키 → 띄우는 약속
    this.commonDirs = new Map(); // 워크스페이스 뿌리 → git 공통 폴더
  }
  store() { return this.b.store; }
  log(m) { if (this.b.log) this.b.log(m); }
  emit(e, v) { try { if (this.b.api && this.b.api.broadcast) this.b.api.broadcast(e, v); } catch {} }
  settings() { if (this._settings) return { ...DEFAULTS, ...this._settings() }; const f = this.b.features; try { return f && f.settings ? f.settings.get() : DEFAULTS; } catch { return DEFAULTS; } }
  nameOf(id) { return this.units.nameOf(id); }
  // ---------- 기록(판 기록 meta) ----------
  meta(k) { return this.store().getMeta(k) || {}; }
  recs() { return this.meta(META_RECS); }
  rec(key) { return this.recs()[key] || null; }
  saveRec(key, r) { const all = this.recs(); if (r) all[key] = r; else delete all[key]; this.store().setMeta(META_RECS, all); }
  recOfSession(sid) { for (const [k, r] of Object.entries(this.recs())) if (r && r.sessionId === sid) return [k, r]; return [null, null]; }
  isMerger(s) { return !!s && (!!s.mergerKey || !!this.recOfSession(s.sessionId)[0]); }
  sessionOfKey(key) { const r = this.rec(key); const s = r && r.sessionId ? this.b.sessions.get(r.sessionId) : null; return s && !s.closedAt ? s : null; }
  wsRoot(ws) { const w = this.store().getWorkspace ? this.store().getWorkspace(ws) : null; return w && w.root ? w.root : null; }
  wsName(ws) { try { return workspaceNames(this.store().workspaces()).get(ws) || null; } catch { return null; } }
  // 이 워크스페이스의 모드: 설정(on|ask|off)과 기억한 답
  modeFor(ws) { const st = this.settings(); const mode = MERGER_MODES.includes(st.mergerMode) ? st.mergerMode : 'ask'; return { mode, answer: this.meta(META_ANSWERS)[ws] || null }; }
  enabledFor(ws) { const { mode, answer } = this.modeFor(ws); return mode === 'on' || (mode === 'ask' && answer === 'on'); }

  // ---------- 하위 일 머리 한 줄 ----------
  childTail(t) {
    if (!t || this.isMerger(t)) return null;
    const info = this.units.branch && this.units.branch.info ? this.units.branch.info.get(t.sessionId) : null;
    const wt = (t.git && t.git.isWorktree) || (info && info.worktree);
    if (!wt) return null;
    const { mode, answer } = this.modeFor(t.workspaceKey);
    return mode === 'off' || (mode === 'ask' && answer === 'off') ? null : MERGE_CHILD_TAIL;
  }
  // 합치기 일 머리와 꼬리(그 merger의 처음 일이면 안내를 붙인다)
  headerFor(unit) { const m = unit.meta || {}; return mergeHeader({ unitId: unit.id, parent: this.nameOf(unit.from), child: m.child || '?' }); }
  tailFor(unit) {
    const [k, r] = this.recOfSession(unit.to);
    if (!k || r.guided) return '';
    this.saveRec(k, { ...r, guided: true });
    return '\n\n' + readMergerGuide().trim();
  }

  // ---------- done ok의 갈래(work-units doneVerb) ----------
  async repoCommonDir(root) {
    if (this.commonDirs.has(root)) return this.commonDirs.get(root);
    const p = await branchProbe(root).catch(() => null);
    const c = p ? p.commonDir : null;
    if (c) this.commonDirs.set(root, c);
    return c;
  }
  // → null(이 기능과 상관없음) | { route: false, why, ask } | { route: true, ... }
  async planFor(child, unit) {
    if (!child || !unit || unit.origin === 'merge') return null;
    const isMerger = this.isMerger(child);
    const ws = child.workspaceKey; const root = ws ? this.wsRoot(ws) : null;
    if (!root) return null;
    const { mode, answer } = this.modeFor(ws);
    if (mode === 'off' || isMerger) return mergeVerdict({ mode, isMerger });
    const cfg = readMergeConfig(root);
    const parent = this.b.sessions.get(unit.from) || null;
    const target = cfg.config.target || (parent && parent.cwd ? await branchOf(parent.cwd).catch(() => null) : null) || (await branchOf(root).catch(() => null));
    const [probe, repoCommonDir] = await Promise.all([child.cwd ? branchProbe(child.cwd, target).catch(() => null) : null, this.repoCommonDir(root)]);
    const v = mergeVerdict({ mode, answer, probe, repoCommonDir, target });
    const out = { ...v, unitId: unit.id, ws, root, target, probe, cfg };
    if (v.ask) this.ask(ws, { child: shownName(child) || child.name, branch: probe.branch, target, root });
    if (!v.route) return out;
    const list = await worktreeList(root).catch(() => null);
    const h = list ? list.find((w) => w.branch === target) : null;
    return { ...out, holder: h ? h.path : null };
  }
  // 합치기 일을 만들고 merger에게 넣는다(없으면 띄운다). done()이 부른다(동기) → { unit, merger }
  take(plan, child, unit, text) {
    const st = this.store();
    const key = mergeKey(plan.ws, plan.target);
    const c = plan.cfg.config;
    const childName = shownName(child) || child.name;
    const meta = { key, ws: plan.ws, root: slash(plan.root), target: plan.target, child: childName, childId: child.sessionId, childKind: child.kind || 'claude', parentId: unit.from,
      worktree: slash(plan.probe.root), branch: plan.probe.branch, tip: plan.probe.tip, dirty: plan.probe.dirty, ahead: plan.probe.ahead, holder: plan.holder ? slash(plan.holder) : null,
      where: c.where, push: c.push, guide: c.guide, mergerWorktree: mergerWorktreeOf(plan.root, plan.target) };
    const spec = mergeJobText({ ...meta, parent: this.nameOf(unit.from), configSource: plan.cfg.source, problems: plan.cfg.problems, doneText: text });
    const mu = { id: newId('u'), from: unit.from, to: '', origin: 'merge', spec, status: 'open', createdAt: Date.now(), source: unit.id, meta };
    st.insertUnit(mu);
    st.addEvent(child.sessionId, 'merge_open', { unitId: mu.id, source: unit.id, key, branch: meta.branch, tip: meta.tip, target: meta.target });
    this.log('merge ' + mu.id + ' @' + childName + ' ' + meta.branch + ' -> ' + meta.target + ' (' + plan.ws + ')');
    this.pendingSleep.set(child.sessionId, 0);
    this.sleepSoon(child);
    const s = this.sessionOfKey(key);
    if (s && !this.retiring.has(s.sessionId)) this.assign(st.getUnit(mu.id), s);
    else this.ensure(key).catch(() => {});
    this.changed(plan.ws);
    const r = this.rec(key);
    return { unit: mu.id, merger: s ? shownName(s) || s.name : r ? r.name : null };
  }
  // 합치기 일을 그 merger에게 넣는다(앞 일이 열려 있으면 판이 붙잡아 둔다)
  assign(mu, s) {
    const st = this.store();
    st.updateUnit(mu.id, { to: s.sessionId });
    const hold = !!st.openTryOf(s.sessionId) || st.queuedUnitsOf(s.sessionId).some((u) => u.id !== mu.id) || this.retiring.has(s.sessionId);
    st.addEvent(s.sessionId, 'unit_open', { unitId: mu.id, from: this.nameOf(mu.from), origin: 'merge', held: hold, chars: mu.spec.length });
    if (hold) { this.units.queued.add(s.sessionId); return null; }
    return this.units.dispatch(st.getUnit(mu.id));
  }
  // 그 키의 merger를 찾거나 띄우고, 맡은 merger가 없는 합치기 일을 넣는다(키마다 하나씩 차례로)
  ensure(key) {
    if (this.spawning.has(key)) return this.spawning.get(key);
    const job = this._ensure(key).finally(() => this.spawning.delete(key));
    this.spawning.set(key, job);
    return job;
  }
  async _ensure(key) {
    const st = this.store();
    const waiting = () => st.unassignedMergeUnits().filter((u) => u.meta && u.meta.key === key);
    if (!waiting().length) return null;
    let s = this.sessionOfKey(key);
    try {
      if (!s || this.retiring.has(s.sessionId)) s = await this.spawnFor(key, waiting()[0]);
    } catch (e) {
      this.log('merger spawn failed ' + key + ': ' + (e.code || e.message));
      for (const u of waiting()) this.fallback(u, e.code || e.message || 'spawn failed');
      return null;
    }
    for (const u of waiting()) this.assign(u, s);
    this.changed(key.split('|')[0]);
    return s;
  }
  // merger 띄우기(설정의 종류·모델·노력. 판에 그 종류가 없으면 부모의 종류·런처·모델). 승인 방식은 그 일을 맡긴 부모의 것
  async spawnFor(key, mu) {
    const b = this.b; const m = mu.meta || {};
    const ws = m.ws; const target = m.target;
    const root = this.wsRoot(ws) || m.root;
    const set = this.settings();
    const parent = b.sessions.get(mu.from) || null;
    const kinds = b.adapter && b.adapter.agentKinds ? await b.adapter.agentKinds().catch(() => []) : [];
    const kind = String(set.mergerKind || 'claude');
    let p;
    if (!kinds.length || kinds.some((k) => k.kind === kind)) p = { kind, ...(set.mergerModel ? { model: set.mergerModel } : {}), ...(set.mergerEffort ? { effort: set.mergerEffort } : {}) };
    else if (parent) p = { kind: parent.kind || 'claude', ...(parent.model ? { model: parent.model } : {}), ...(parent.harnessPlan && parent.harnessPlan.launcher ? { launcher: parent.harnessPlan.launcher } : {}) };
    else throw apiError('no_kind', 'merger 종류(' + kind + ')가 보드에 없고 일을 맡긴 세션도 닫혔다');
    const taken = new Set([...b.sessions.values()].filter((x) => !x.closedAt).flatMap((x) => [x.name, shownName(x)].filter(Boolean)));
    const old = this.rec(key);
    const name = mergerNameOf({ wsName: this.wsName(ws) || path.basename(root || ''), target, taken });
    try { if (root && excludeFileOf(root)) ensureAtriumDir(root); } catch (e) { this.log('merger atrium dir ' + e.message); }
    const res = await b.spawn({ name, cwd: root, ...p, ...(parent && parent.permissionMode ? { permissionMode: parent.permissionMode } : {}) });
    const s = b.sessions.get(res.sessionId);
    if (!s) throw apiError('spawn_failed', 'merger 세션이 판에 등록되지 않았다');
    s.mergerKey = key;
    const rec = { key, ws, target, root: slash(root), sessionId: s.sessionId, name: s.name, jobs: 0, gen: ((old && old.gen) || 0) + 1, spawnedAt: Date.now(), guided: false, kind: p.kind, model: p.model || null };
    this.saveRec(key, rec);
    try { this.store().addEvent(s.sessionId, 'merger_spawn', { key, gen: rec.gen, kind: p.kind, model: p.model || null, effort: p.effort || null }); } catch {}
    this.log('merger ' + key + ' spawned ' + s.name + ' gen ' + rec.gen);
    return s;
  }
  // merger를 띄우지 못했다: 합치기 일을 취소하고 원래 done 값을 부모에게 그대로 보낸다
  fallback(mu, why) {
    const st = this.store(); const b = this.b;
    st.updateUnit(mu.id, { status: 'cancelled', closedAt: Date.now() });
    const m = mu.meta || {};
    this.pendingSleep.delete(m.childId);
    const src = mu.source ? st.getUnit(mu.source) : null;
    const tr = src ? st.lastTryOfUnit(src.id) : null;
    const parent = b.sessions.get(mu.from);
    if (!src || !tr || !parent) return;
    const d = b.queue.enqueue(parent.sessionId, this.units.noticeOf({ unit: src, result: tr.result, text: tr.doneText, extra: [mergeFallbackLine(why)] }));
    st.updateTry(tr.id, { claimedBy: 'queue', noticeDeliveryId: d.deliveryId });
    st.addEvent(parent.sessionId, 'merge_fallback', { unitId: mu.id, source: src.id, why });
  }

  // ---------- merger가 합치기 일을 닫았다(work-units done) ----------
  // → { retire, extra }(extra: failed면 부모가 받는 글 끝 줄)
  onMergeDone(caller, unit, result, text) {
    const st = this.store();
    const m = unit.meta || {};
    const [key, rec] = this.recOfSession(caller.sessionId);
    let retire = false;
    if (key) { const jobs = (rec.jobs || 0) + 1; this.saveRec(key, { ...rec, jobs }); retire = jobs >= this.jobs; }
    if (retire) this.retiring.add(caller.sessionId);
    this.pendingCheck.add(caller.sessionId);
    const firstLine = String(text || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
    if (result === 'ok') {
      st.updateUnit(unit.id, { meta: { ...m, merged: { at: Date.now(), line: clip(firstLine, 200) } } });
      this.finishOk(caller, unit).catch((e) => this.log('merge finish ' + unit.id + ' ' + e.message));
      this.changed(m.ws);
      return { retire, extra: [] };
    }
    st.updateUnit(unit.id, { meta: { ...m, failed: { at: Date.now(), line: clip(firstLine, 200) } } });
    this.changed(m.ws);
    return { retire, extra: mergeFailLines({ child: m.child || '?', worktree: m.worktree, branch: m.branch, merger: shownName(caller) || caller.name }) };
  }
  // 합침: 합칠 브랜치의 끝 커밋을 읽고(하위의 끝 커밋이 들어갔는지도) 소식 한 줄, 하위를 닫고 보관한다
  async finishOk(caller, unit) {
    const st = this.store(); const m = unit.meta || {};
    const root = m.root || this.wsRoot(m.ws);
    const hash = root && m.target ? await revOf(root, m.target).catch(() => null) : null;
    const contains = root && m.tip && m.target ? await isAncestor(root, m.tip, m.target).catch(() => null) : null;
    const cur = st.getUnit(unit.id);
    const cm = (cur && cur.meta) || m;
    st.updateUnit(unit.id, { meta: { ...cm, merged: { ...(cm.merged || {}), hash, contains } } });
    try { st.addNews({ sessionId: caller.sessionId, name: shownName(caller) || caller.name, at: Date.now(), kind: 'merge', task: '합치기: @' + (m.child || '?'), text: '@' + (m.child || '?') + ' 합침 ' + short(hash) + (m.target ? ' → ' + m.target : '') + (contains === false ? ' (끝 커밋이 ' + m.target + '에 없다)' : ''), result: 'ok' }); } catch (e) { this.log('merge news ' + e.message); }
    this.changed(m.ws);
    if (m.childId) await this.closeChild(m.childId);
  }
  async closeChild(sid) {
    const b = this.b; const br = this.units.branch;
    this.pendingSleep.delete(sid);
    if (b.sleeper && b.sleeper.going && b.sleeper.going.has(sid)) await b.sleeper.going.get(sid).catch(() => {});
    const s = b.sessions.get(sid);
    if (!s) return null;
    if (br && br.byParentKill) br.byParentKill.add(sid); // 부모에게 닫힘 알림을 보내지 않는다
    try {
      const r = await b.kill({ session: sid, confirm: true, after: 'archive' });
      this.store().addEvent(sid, 'merge_closed', { archived: !!(r && r.after && r.after.archived) });
      this.log('merge closed child ' + s.name);
      return r;
    } catch (e) { if (br && br.byParentKill) br.byParentKill.delete(sid); this.log('merge close child ' + s.name + ' failed: ' + (e.code || e.message)); return null; }
  }

  // ---------- 상태 변화(branch bus 'session') ----------
  onSession(s, sum) {
    const sid = s.sessionId; const rest = sum.state === 'ready' || sum.state === 'error';
    if (this.pendingSleep.has(sid) && rest) this.sleepSoon(s);
    if (sum.state === 'exited' && this.isMerger(s) && !this.retiring.has(sid)) { this.retire(s, 'exited').catch(() => {}); return; }
    if (this.pendingCheck.has(sid) && rest && !this.store().openTryOf(sid)) { this.pendingCheck.delete(sid); this.lifecycle(s).catch((e) => this.log('merger lifecycle ' + e.message)); }
  }
  // 하위 재우기(턴이 끝난 뒤. 거절되면 다음 턴 끝에 다시, SLEEP_TRIES번까지)
  sleepSoon(s) {
    const sid = s.sessionId;
    if (this.sleeping.has(sid) || !this.b.sleeper) return;
    const t = setTimeout(() => {
      const x = this.b.sessions.get(sid);
      if (!x || !this.pendingSleep.has(sid) || this.sleeping.has(sid)) return;
      const state = this.b.summary ? this.b.summary(x).state : null;
      if (state !== 'ready' && state !== 'error') return;
      if (x.rt && x.rt.sleep) { this.pendingSleep.delete(sid); return; }
      const n = this.pendingSleep.get(sid) || 0;
      if (n >= SLEEP_TRIES) { this.pendingSleep.delete(sid); return; }
      this.pendingSleep.set(sid, n + 1);
      this.sleeping.add(sid);
      Promise.resolve().then(() => this.b.sleeper.sleep(x, { by: 'merge', mode: 'hand', scope: 'session' }))
        .then(() => { this.pendingSleep.delete(sid); try { this.store().addEvent(sid, 'merge_sleep', { ok: true }); } catch {} })
        .catch((e) => { this.log('merge sleep ' + x.name + ' refused: ' + (e.code || e.message)); try { this.store().addEvent(sid, 'merge_sleep', { ok: false, error: e.code || e.message }); } catch {} })
        .finally(() => this.sleeping.delete(sid));
    }, this.sleepDelayMs);
    if (t.unref) t.unref();
  }
  // 그 워크스페이스에서 브랜치(워크트리)에서 일하는 중인 하위(열린 일이 있는 세션)
  openBranchWork(ws, except) {
    const root = this.wsRoot(ws);
    return [...this.b.sessions.values()].filter((x) => x.workspaceKey === ws && x !== except && !this.isMerger(x) && this.store().openTryOf(x.sessionId)
      && ((x.git && x.git.isWorktree) || (root && x.cwd && !same(x.cwd, root)))).length;
  }
  // merger의 턴이 끝났고 열린 일이 없다: 다섯 번을 채웠거나 할 일이 없으면 닫고 보관한다
  async lifecycle(s) {
    const [key, rec] = this.recOfSession(s.sessionId);
    if (!key) return null;
    if (this.retiring.has(s.sessionId) || (rec.jobs || 0) >= this.jobs) return this.retire(s, 'jobs');
    if (this.store().queuedUnitsOf(s.sessionId).length) { this.units.pump(s.sessionId); return null; }
    if (this.openBranchWork(rec.ws, s) > 0) return null;
    return this.retire(s, 'idle');
  }
  // merger를 닫고 보관한다. 줄 선 일은 떼어 두었다가 새 merger에게 넣는다
  async retire(s, why) {
    const b = this.b; const st = this.store(); const sid = s.sessionId; const br = this.units.branch;
    const [key, rec] = this.recOfSession(sid);
    this.retiring.add(sid);
    try {
      for (const u of st.queuedUnitsOf(sid)) if (u.origin === 'merge') st.updateUnit(u.id, { to: '' });
      this.units.queued.delete(sid);
      if (br && br.byParentKill) br.byParentKill.add(sid);
      if (b.sleeper && b.sleeper.going && b.sleeper.going.has(sid)) await b.sleeper.going.get(sid).catch(() => {});
      if (b.sessions.has(sid)) await b.kill({ session: sid, confirm: true, after: 'archive' }).catch((e) => this.log('merger close ' + s.name + ' failed: ' + (e.code || e.message)));
      if (key) this.saveRec(key, { ...rec, sessionId: null, jobs: 0, closedAt: Date.now(), closedWhy: why });
      try { st.addEvent(sid, 'merger_retire', { key, why, jobs: rec ? rec.jobs : null }); } catch {}
      this.log('merger ' + (key || '?') + ' retired ' + s.name + ' (' + why + ')');
    } finally { this.retiring.delete(sid); this.pendingCheck.delete(sid); }
    if (key) { this.changed(rec.ws); if (st.unassignedMergeUnits().some((u) => u.meta && u.meta.key === key)) await this.ensure(key); }
    return { retired: s.name, why };
  }
  // 일 표가 merger의 닫힘을 볼 때(units.onClosed가 줄 선 일을 취소하기 전에): 줄 선 합치기 일을 떼어 두고 새 merger에게 넣는다
  onClosing(s) {
    if (!this.isMerger(s) || this.retiring.has(s.sessionId)) return;
    const st = this.store(); const [key, rec] = this.recOfSession(s.sessionId);
    const moved = st.queuedUnitsOf(s.sessionId).filter((u) => u.origin === 'merge');
    for (const u of moved) st.updateUnit(u.id, { to: '' });
    if (key) this.saveRec(key, { ...rec, sessionId: null, jobs: 0, closedAt: Date.now(), closedWhy: 'closed' });
    this.pendingCheck.delete(s.sessionId);
    if (key && moved.length) { const t = setTimeout(() => this.ensure(key).catch(() => {}), 0); if (t.unref) t.unref(); }
    if (key) this.changed(rec.ws);
  }

  // ---------- 사람에게 묻기(설정 ask, 워크스페이스마다 한 번) ----------
  ask(ws, info) {
    const asks = this.meta(META_ASKS);
    if (asks[ws]) return asks[ws];
    const card = { workspace: ws, workspaceName: this.wsName(ws), root: slash(info.root), at: Date.now(), child: info.child, branch: info.branch, target: info.target };
    this.store().setMeta(META_ASKS, { ...asks, [ws]: card });
    try { this.store().addEvent(null, 'merger_ask', card); } catch {}
    this.emit('merger.ask', card);
    this.log('merger ask ' + ws);
    return card;
  }
  asks() { return Object.values(this.meta(META_ASKS)); }
  // answer: on | off(기억) | ask(잊는다: 다음 브랜치 하위의 done ok에 다시 묻는다)
  answer(ws, answer) {
    if (!['on', 'off', 'ask'].includes(answer)) throw apiError('bad_request', 'answer는 on, off, ask 가운데 하나다: ' + answer);
    const answers = this.meta(META_ANSWERS); const asks = this.meta(META_ASKS);
    if (answer === 'ask') delete answers[ws]; else answers[ws] = answer;
    delete asks[ws];
    this.store().setMeta(META_ANSWERS, answers); this.store().setMeta(META_ASKS, asks);
    try { this.store().addEvent(null, 'merger_answer', { workspace: ws, answer }); } catch {}
    const out = { workspace: ws, answer, ...this.modeFor(ws), enabled: this.enabledFor(ws) };
    this.emit('merger.answered', out);
    this.changed(ws);
    return out;
  }

  // ---------- 창이 보는 자료(merger.status) ----------
  changed(ws) { this.emit('merger.updated', { workspace: ws || null }); }
  status(ws = null) {
    const st = this.store(); const set = this.settings();
    const mergers = Object.values(this.recs()).filter((r) => r && (!ws || r.ws === ws)).map((r) => {
      const s = r.sessionId ? this.b.sessions.get(r.sessionId) : null;
      return { key: r.key, workspace: r.ws, target: r.target, name: s ? shownName(s) || s.name : r.name, sessionId: s ? s.sessionId : null, open: !!s, jobs: r.jobs || 0, jobsMax: this.jobs, gen: r.gen || 0, worktree: mergerWorktreeOf(r.root || this.wsRoot(r.ws) || '.', r.target), kind: r.kind || null, model: r.model || null };
    });
    const jobs = st.openMergeUnits().filter((u) => !ws || (u.meta && u.meta.ws === ws)).map((u) => this.jobView(u));
    const answers = this.meta(META_ANSWERS);
    return { mode: MERGER_MODES.includes(set.mergerMode) ? set.mergerMode : 'ask', enabled: ws ? this.enabledFor(ws) : null, settings: { mergerMode: set.mergerMode, mergerKind: set.mergerKind, mergerModel: set.mergerModel, mergerEffort: set.mergerEffort },
      answers: ws ? { [ws]: answers[ws] || null } : answers, asks: this.asks().filter((a) => !ws || a.workspace === ws), mergers, jobs, jobsMax: this.jobs };
  }
  // 합치기 일 하나(창이 하위 → merger 선을 그리는 자료)
  jobView(u) {
    const m = u.meta || {}; const tr = this.store().lastTryOfUnit(u.id);
    return { unit: u.id, source: u.source, state: mergeState(u, tr), workspace: m.ws, target: m.target, branch: m.branch, tip: m.tip, child: m.child, childId: m.childId, childOpen: !!(m.childId && this.b.sessions.has(m.childId)), parentId: u.from, parent: this.nameOf(u.from), mergerId: u.to || null, merger: u.to ? this.nameOf(u.to) : null, createdAt: u.createdAt, closedAt: u.closedAt, hash: m.merged ? m.merged.hash || null : null };
  }
  // 부모의 atrium items 한 줄에 붙는 합치기 상태
  itemMerge(u) {
    if (!u || u.origin === 'merge') return null;
    const mu = this.store().mergeUnitOf(u.id);
    if (!mu) return null;
    const tr = this.store().lastTryOfUnit(mu.id); const m = mu.meta || {};
    return { unit: mu.id, state: mergeState(mu, tr), merger: mu.to ? this.nameOf(mu.to) : null, hash: m.merged ? m.merged.hash || null : null, line: m.failed ? m.failed.line : m.merged ? m.merged.line : null };
  }
}

// 판 API(창·휴대폰·사람의 atrium call). 설정 값은 settings.set(mergerMode, mergerKind, mergerModel, mergerEffort)
export function mergerHandlers(b) {
  const m = () => { if (!b.merger) throw apiError('merger_off', 'merger 기능이 없다'); return b.merger; };
  const wsOf = async (p, required) => { if (!(p && p.workspace) && !required) return null; return (await b.resolveWorkspace(p && p.workspace)).key; };
  return {
    'merger.status': async (p = {}) => m().status(await wsOf(p, false)),
    'merger.asks': () => ({ asks: m().asks() }),
    'merger.answer': async (p = {}) => m().answer(await wsOf(p, true), String((p && p.answer) || '')),
  };
}
