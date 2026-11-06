// P34: 데스크톱 앱(Claude Code 데스크톱의 Code 탭) 세션을 판으로 한 번에 가져온다(BRIEF "데스크톱 앱" 행의 한 번 옮기기).
// - 원본 읽기: 앱 세션 목록(convos.mjs listDesktopSessions)과 그 대화 기록. 둘 다 읽기만 한다.
// - 갈라 열기는 파일 갈래다(E11): 원본 대화 기록의 줄마다 sessionId만 새 ID로 바꿔 새 파일로 쓴다('wx', 있는 파일을 덮지 않는다). 모델은 부르지 않는다.
//   쓰는 곳은 그 세션 폴더의 ~/.claude/projects/<폴더>/다. 워크트리가 지워졌으면 원본 저장소 폴더 쪽에 쓰고 거기서 이어 간다
//   (대화 기록 안의 cwd는 옛 워크트리 경로로 남는다. 2026-11-02 가짜 자료로 `claude --resume`이 이어 가는 것을 확인했다. docs/log/p34-desktop-import.md 작업 기록).
// - 가져온 것마다 잠든 판 세션(종류 claude, 패널 없음, P21)을 그 리포 영역의 빈자리에 만든다. 누르면 P21 깨우기 길로 `claude --resume <새 ID>`가 된다.
// - 장부(store-imports.mjs): 앱 세션 ID, 원본 대화 ID, 세대, 새 대화 ID, 판 세션 ID, 갈라 연 시점. 원본이 그 시점 뒤로 이어졌으면 "더 씀"이다.
// - 안전: 개발용 프로필에서는 앱 목록 폴더를 환경 변수로 따로 주었고 그 폴더가 개발용 데이터 폴더 안일 때만 허용한다(importAllowed).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { workspaceOf } from './git.mjs';
import { writeSessionSettings, buildResumeArgv, transcriptPathFor, slash } from './launch.mjs';
import { listDesktopSessions, readLiveSessions, readTranscriptSummary } from './convos.mjs';
import { isSyntheticUserText } from './transcript.mjs';
import { newRuntime } from './state.mjs';
import { slotFor, settleRegions } from './canvas-ops.mjs';
import { NEW_NODE as NODE, NEW_NODE_STEP, DEFAULT_ASPECT } from './canvas.mjs'; // P73: 새 노드는 16:9 가로 보통
import { HARNESSES, MODEL_RE } from './launchers.mjs';
import { EFFORTS, PERMISSION_MODES } from './settings.mjs';
import { pathKey, normPath } from './workspaces.mjs';
import { BACKEND_ROOT } from './config.mjs';
import { keyed } from './msg.mjs';
import { takenNames } from './session-label.mjs'; // P66

export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/; // 판 세션 이름(backend.mjs와 같다)
export const STATUSES = ['new', 'imported', 'more', 'onBoard', 'noTranscript', 'noFolder'];
function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const within = (child, parent) => { const c = pathKey(child), p = pathKey(parent); return c === p || c.startsWith(p + '/'); };
const isDir = (p) => { try { return !!p && fs.statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return !!p && fs.statSync(p).isFile(); } catch { return false; } };

// ---------- 안전: 개발용 프로필 막기 ----------
// 실제 판은 기본 앱 폴더를 쓴다. 개발용 판은 ATRIUM_CLAUDE_DESKTOP을 따로 주었고 그 폴더가 데이터 폴더(또는 backend/.dev) 안일 때만 → { ok, reason }
export function importAllowed(cfg, { devRoot = path.join(BACKEND_ROOT, '.dev') } = {}) {
  if (!cfg.desktopSessionsDir) return { ok: false, reason: 'no_desktop_dir' };
  if (cfg.profile !== 'dev') return { ok: true, reason: null };
  if (!cfg.desktopExplicit) return { ok: false, reason: 'dev_default_dir' };
  if (!within(cfg.desktopSessionsDir, cfg.dataDir) && !within(cfg.desktopSessionsDir, devRoot)) return { ok: false, reason: 'dev_outside_data' };
  return { ok: true, reason: null };
}

// ---------- 파일 갈래(순수 함수) ----------
// 원본 글 → 갈래 글. 줄마다 sessionId만 바꾼다. 줄바꿈으로 끝나지 않은 마지막 조각(쓰는 중)은 넣지 않는다(P29 4번).
// 읽지 못하는 줄은 그대로 둔다. → { text, lines(넣은 줄 수), pointUuid(마지막 답 uuid), pointAt, dropped(뺀 바이트) }
export function forkText(src, newId) {
  const s = String(src || '');
  const end = s.lastIndexOf('\n');
  const body = end < 0 ? '' : s.slice(0, end + 1);
  const lines = body ? body.slice(0, -1).split('\n') : [];
  let pointUuid = null, pointAt = null;
  const out = lines.map((line) => {
    const raw = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (!raw.trim()) return raw;
    let o; try { o = JSON.parse(raw); } catch { return raw; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return raw;
    if (o.type === 'assistant' && !o.isSidechain && o.uuid) { pointUuid = o.uuid; pointAt = o.timestamp ? Date.parse(o.timestamp) || null : null; }
    if (!('sessionId' in o)) return raw;
    o.sessionId = newId;
    return JSON.stringify(o);
  });
  return { text: out.length ? out.join('\n') + '\n' : '', lines: lines.length, pointUuid, pointAt, dropped: s.length - body.length };
}

// 한 줄이 사람의 지시인가, 글이 있는 답인가(parseTranscriptChunks와 같은 기준)
function messageKind(o) {
  if (!o || o.isSidechain || o.isMeta) return null;
  if (o.type === 'user' && o.message) {
    const c = o.message.content;
    const text = typeof c === 'string' ? c : Array.isArray(c) && !c.some((p) => p && p.type === 'tool_result') ? c.filter((p) => p && p.type === 'text').map((p) => p.text).join('\n') : '';
    return text && !isSyntheticUserText(text) ? 'prompt' : null;
  }
  if (o.type === 'assistant' && o.message && Array.isArray(o.message.content) && o.message.content.some((p) => p && p.type === 'text' && p.text)) return 'answer';
  return null;
}
// 원본이 갈라 연 시점 뒤로 이어진 만큼. 같은 대화면 시점 uuid와 넣은 줄 수 가운데 뒤의 것부터, 대화 ID가 바뀌었으면(새 기록) 시점 uuid 뒤부터(없으면 처음부터) 센다
// → { found, prompts, answers }
export function countSince(src, { pointUuid = null, lines = 0, sameConv = true } = {}) {
  const s = String(src || '');
  const end = s.lastIndexOf('\n');
  const all = end < 0 ? [] : s.slice(0, end).split('\n');
  let idx = -1;
  if (pointUuid) for (let i = all.length - 1; i >= 0; i--) { if (all[i].includes(pointUuid)) { let o; try { o = JSON.parse(all[i]); } catch { continue; } if (o && o.uuid === pointUuid) { idx = i; break; } } }
  const start = sameConv ? Math.max(idx, lines - 1) : idx;
  let prompts = 0, answers = 0;
  for (let i = start + 1; i < all.length; i++) {
    let o; try { o = JSON.parse(all[i]); } catch { continue; }
    const k = messageKind(o);
    if (k === 'prompt') prompts++; else if (k === 'answer') answers++;
  }
  return { found: idx >= 0, prompts, answers };
}

// ---------- 후보 하나(순수 함수) ----------
// 상태: 보관된 것은 목록에서 빠진다(null). 판 세션인 대화 → onBoard, 기록 없음 → noTranscript, 옮긴 뒤 안 씀 → imported, 폴더 없음 → noFolder, 옮긴 뒤 더 씀 → more, 아니면 new
export function candidateStatus({ archived = false, onBoard = false, transcript = true, folder = true, ledger = null, more = 0 }) {
  if (archived) return null;
  if (onBoard) return 'onBoard';
  if (!transcript) return 'noTranscript';
  if (ledger && !more) return 'imported';
  if (!folder) return 'noFolder';
  return ledger ? 'more' : 'new';
}
// 기본 고름: 새것과 더 씀. 지금 도는 것은 뺀다
export const defaultPick = (c) => (c.status === 'new' || c.status === 'more') && !c.running;

// 이름: 워크트리 이름이나 브랜치가 판 이름 글자로만 되어 있으면 그것(겹치면 -2, -3…), 아니면 <리포 이름>-<번호>
export function safeRepoName(name) {
  const s = String(name || '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').replace(/-+$/, '').slice(0, 26);
  return s || 'repo';
}
export function importName({ worktreeName = null, branch = null, repoName = 'repo', taken = new Set() }) {
  const free = (n) => NAME_RE.test(n) && n !== 'all' && !taken.has(n);
  for (const c of [worktreeName, branch]) {
    if (!c || !NAME_RE.test(c) || c === 'all') continue;
    if (free(c)) return c;
    for (let i = 2; i < 1000; i++) { const n = `${c.slice(0, 32 - String(i).length - 1)}-${i}`; if (free(n)) return n; }
  }
  const base = safeRepoName(repoName);
  for (let i = 1; ; i++) { const n = `${base}-${i}`; if (free(n)) return n; }
}

// 앱 세션에 기록된 모델·노력 수준·권한 모드. 판이 모르는 값이면 fallback(첫 즐겨찾기 Claude Code 호출자)의 값 → { model, effort, permissionMode, replaced: [] }
const MODEL_ALIAS_RE = /^(?:claude-[a-z0-9.-]+|haiku|sonnet|opus|fable|opusplan|default)(?:\[1m\])?$/;
export function knownModel(m) { return !!m && MODEL_RE.test(m) && (HARNESSES.claude.models.includes(m) || MODEL_ALIAS_RE.test(m)); }
export function launchValues(info, fallback = {}) {
  const fb = { model: fallback.model || null, effort: fallback.effort || null, permissionMode: fallback.permissionMode || 'manual' };
  const replaced = [];
  let model = info.model || null;
  if (model === 'default') model = null; // 앱의 기본 모델: 판도 지정하지 않는다
  else if (model && !knownModel(model)) { replaced.push('model'); model = fb.model; }
  else if (!model) model = fb.model;
  let effort = info.effort || null;
  if (effort && !EFFORTS.includes(effort)) { replaced.push('effort'); effort = fb.effort; }
  else if (!effort) effort = fb.effort;
  let permissionMode = info.permissionMode === 'default' ? 'manual' : info.permissionMode || null;
  if (permissionMode && !PERMISSION_MODES.includes(permissionMode)) { replaced.push('permissionMode'); permissionMode = fb.permissionMode; }
  else if (!permissionMode) permissionMode = fb.permissionMode;
  return { model, effort: effort || null, permissionMode, replaced };
}

// 앱 세션의 폴더와 대화 기록 위치. 대화 기록은 앱이 claude를 띄운 폴더(cwd, 워크트리, 원본)의 프로젝트 폴더에서 찾는다.
// 폴더가 없으면(워크트리가 지워짐) 원본 저장소 폴더: originCwd → <저장소>/.claude/worktrees/<이름>의 저장소 → 남아 있는 위 폴더의 git 루트
export const WORKTREE_PATH_RE = /^(.*)[\\/]\.claude[\\/]worktrees[\\/][^\\/]+(?:[\\/].*)?$/;
export async function folderPlan(info, { claudeProjects, gitRoot = gitTop } = {}) {
  const runCwd = info.worktreePath || info.cwd || info.originCwd || null;
  const cands = [...new Set([info.cwd, info.worktreePath, info.originCwd].filter(Boolean))];
  let source = null;
  if (info.cliSessionId) for (const c of cands) { const p = transcriptPathFor(claudeProjects, c, info.cliSessionId); if (isFile(p)) { source = p; break; } }
  if (!runCwd) return { source, cwd: null, folder: 'missing', runCwd: null };
  if (isDir(runCwd)) return { source, cwd: path.resolve(runCwd), folder: 'same', runCwd };
  let repo = null;
  if (info.originCwd && isDir(info.originCwd) && pathKey(info.originCwd) !== pathKey(runCwd)) repo = info.originCwd;
  if (!repo) { const m = WORKTREE_PATH_RE.exec(runCwd); if (m && isDir(m[1])) repo = m[1]; }
  if (!repo) {
    let up = path.dirname(path.resolve(runCwd));
    while (up && !isDir(up) && path.dirname(up) !== up) up = path.dirname(up);
    const top = isDir(up) ? await gitRoot(up) : null;
    if (top && isDir(top)) repo = top;
  }
  return repo ? { source, cwd: path.resolve(repo), folder: 'repo', runCwd } : { source, cwd: null, folder: 'missing', runCwd };
}
async function gitTop(dir) { const ws = await workspaceOf(dir); return ws && ws.kind === 'repo' ? ws.root : null; }

// ---------- 판에 붙는 부분 ----------
export function attachDesktopImport(b, opts) { return new DesktopImport(b, opts); }

export class DesktopImport {
  constructor(b, { list = listDesktopSessions, live = readLiveSessions, resolveWs = workspaceOf, newId = () => crypto.randomUUID() } = {}) {
    this.b = b; this.cfg = b.cfg; this.store = b.store; this.newId = newId;
    this.listFn = list; this.liveFn = live; this.resolveWs = resolveWs;
    this.cache = new Map();
    this.chain = Promise.resolve(); // 가져오기는 한 번에 하나(장부 중복 막기)
    this.titles = new Map(); // 판 세션 ID → { title, gen, at }(노드에 보일 앱 제목)
    for (const r of this.store.desktopImports()) this.titles.set(r.sessionId, { title: r.title, gen: r.gen, at: r.createdAt });
    this.handlers = {
      'desktop.list': (p) => this.list(p),
      'desktop.import': (p) => this.importMany(p),
    };
  }
  // 세션이 놓일 워크스페이스(G1). git 워크트리는 workspaceOf가 본 저장소로 푼다. git이 아닌 폴더가 앱의 원본 폴더(originCwd) 아래면 그 원본 폴더의 워크스페이스다
  async wsFor(cwd, info) {
    const ws = await this.resolveWs(cwd);
    if (ws.kind !== 'repo' && info.originCwd && isDir(info.originCwd) && pathKey(cwd) !== pathKey(info.originCwd) && within(cwd, info.originCwd)) return this.resolveWs(info.originCwd);
    return ws;
  }
  guard() {
    const g = importAllowed(this.cfg);
    if (!g.ok) throw keyed(apiError('import_blocked', `이 보드에서는 데스크톱 앱 가져오기를 사용할 수 없습니다 (${g.reason}). 개발용 보드에서는 ATRIUM_CLAUDE_DESKTOP으로 데이터 폴더 안의 테스트용 앱 목록을 지정하세요.`, { reason: g.reason }), 'desktopImportBlocked', { reason: g.reason });
  }
  fallback() {
    const L = this.b.features && this.b.features.launchers;
    if (!L) return {};
    const d = L.data();
    const fav = d.favorites.map((id) => d.items.find((x) => x.id === id)).find((l) => l && l.harness === 'claude');
    return fav ? { model: fav.model || null, effort: fav.effort || null, permissionMode: fav.permissionMode || 'manual', allowHerdr: !!fav.allowHerdr, name: fav.name } : {};
  }
  summaryExtra(s) { const t = this.titles.get(s.sessionId); return t ? { imported: { from: 'desktop', title: t.title, gen: t.gen, at: t.at } } : {}; }

  // 후보 목록. 보관된 것은 뺀다
  async candidates() {
    this.guard();
    const infos = this.listFn(this.cfg.desktopSessionsDir, this.cache);
    const live = this.liveFn(this.cfg.claudeSessionsDir);
    const ledger = this.store.latestDesktopImports();
    const board = this.store.boardConversations();
    const wsCache = new Map();
    const out = [];
    for (const info of infos) {
      if (info.isArchived) continue;
      const ids = [info.cliSessionId, ...info.priorCliSessionIds].filter(Boolean);
      const run = ids.map((id) => live.get(id)).find(Boolean) || null;
      const led = ledger.get(info.sessionId) || null;
      const plan = await folderPlan(info, { claudeProjects: this.cfg.claudeProjects });
      const onBoard = !!(info.cliSessionId && board.has(info.cliSessionId));
      let more = 0, since = null;
      if (led && plan.source) {
        try {
          since = countSince(await fs.promises.readFile(plan.source, 'utf8'), { pointUuid: led.pointUuid, lines: led.pointLines, sameConv: led.sourceConv === info.cliSessionId });
          more = since.prompts + since.answers;
        } catch {}
      }
      const status = candidateStatus({ archived: false, onBoard, transcript: !!plan.source, folder: !!plan.cwd, ledger: led, more });
      let ws = null;
      if (plan.cwd) { const k = `${pathKey(plan.cwd)}|${info.originCwd ? pathKey(info.originCwd) : ''}`; if (!wsCache.has(k)) wsCache.set(k, await this.wsFor(plan.cwd, info)); ws = wsCache.get(k); }
      const c = {
        appSessionId: info.sessionId, convId: info.cliSessionId, title: info.title, lastActivityAt: info.lastActivityAt, starred: info.isStarred, adopted: info.adoptedFromOtherSurface,
        cwd: plan.runCwd ? normPath(plan.runCwd) : null, target: plan.cwd ? normPath(plan.cwd) : null, folder: plan.folder, transcript: !!plan.source,
        repo: ws ? { key: ws.key, kind: ws.kind, root: normPath(ws.root), name: path.basename(ws.root) } : info.originCwd ? { key: null, kind: null, root: normPath(info.originCwd), name: path.basename(info.originCwd) } : null,
        worktree: info.worktreeName || null, branch: info.branch || null, model: info.model || null,
        running: !!run, runningWhere: run ? (/desktop/i.test(run.entrypoint || '') ? 'desktop' : 'terminal') : null,
        status, imported: led ? { gen: led.gen, sessionId: led.sessionId, name: (this.b.sessions.get(led.sessionId) || {}).name || null, at: led.createdAt } : null,
        more: since ? { prompts: since.prompts, answers: since.answers } : null,
      };
      c.pick = defaultPick(c);
      out.push({ c, info, plan, led });
    }
    out.sort((a, b2) => (b2.c.lastActivityAt || 0) - (a.c.lastActivityAt || 0));
    return out;
  }
  async list() {
    const all = await this.candidates();
    const repos = new Map();
    for (const { c } of all) {
      const k = (c.repo && (c.repo.key || c.repo.root)) || '';
      if (!repos.has(k)) repos.set(k, { key: c.repo ? c.repo.key : null, root: c.repo ? c.repo.root : null, name: c.repo ? c.repo.name : null, items: [] });
      repos.get(k).items.push(c);
    }
    const counts = Object.fromEntries(STATUSES.map((s) => [s, all.filter((x) => x.c.status === s).length]));
    return { allowed: true, total: all.length, picked: all.filter((x) => x.c.pick).length, running: all.filter((x) => x.c.running).length, counts, repos: [...repos.values()] };
  }

  // 가져오기: ids(앱 세션 ID 목록) 또는 all(기본 고름 전부). 고른 것 가운데 가져올 수 없는 것은 까닭과 함께 건너뛴다
  importMany(p = {}) {
    const job = this.chain.then(() => this._importMany(p));
    this.chain = job.catch(() => {});
    return job;
  }
  async _importMany(p) {
    const b = this.b;
    const all = await this.candidates();
    const want = p.all ? all.filter((x) => x.c.pick) : (Array.isArray(p.ids) ? p.ids : []).map((id) => all.find((x) => x.c.appSessionId === id) || { missing: id });
    if (!want.length) return { imported: [], skipped: [], total: 0 };
    const fb = this.fallback();
    const taken = takenNames(b.sessions.values()); // P66: 판의 이름(label)도 피한다
    const imported = [], skipped = [];
    let i = 0;
    for (const x of want) {
      i++;
      const progress = (name) => b.api && b.api.broadcast('desktop.import.progress', { done: i, total: want.length, name });
      if (x.missing) { skipped.push({ appSessionId: x.missing, reason: 'not_found' }); progress(null); continue; }
      const c = x.c;
      const why = c.status === 'imported' ? 'already' : c.status === 'onBoard' ? 'on_board' : c.status === 'noTranscript' ? 'no_transcript' : c.status === 'noFolder' ? 'no_folder' : null;
      if (why) { skipped.push({ appSessionId: c.appSessionId, title: c.title, reason: why }); progress(null); continue; }
      try {
        const r = await this.importOne(x, { fb, taken });
        imported.push({ ...r, title: c.title, running: c.running });
        progress(r.name);
      } catch (e) {
        skipped.push({ appSessionId: c.appSessionId, title: c.title, reason: e.code || 'error', message: e.message });
        progress(null);
      }
    }
    if (imported.length) { settleRegions(b, 'import'); if (b.recall) b.recall.changed().catch(() => {}); }
    b.log && b.log(`desktop import: ${imported.length} imported, ${skipped.length} skipped`);
    return { imported, skipped, total: want.length, runningWarned: imported.some((r) => r.running) };
  }

  async importOne({ c, info, plan, led }, { fb, taken }) {
    const b = this.b, cfg = this.cfg;
    const newId = this.newId();
    const src = await fs.promises.readFile(plan.source, 'utf8');
    const fork = forkText(src, newId);
    if (!fork.lines) throw apiError('empty', "대화 기록이 비어 있습니다.");
    const dest = transcriptPathFor(cfg.claudeProjects, plan.cwd, newId);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.writeFile(dest, fork.text, { flag: 'wx' });
    try {
      const ws = await this.wsFor(plan.cwd, info);
      const name = importName({ worktreeName: info.worktreeName, branch: info.branch, repoName: path.basename(ws.root), taken });
      taken.add(name);
      const vals = launchValues(info, fb);
      const sum = await readTranscriptSummary(dest).catch(() => null);
      const s = this.createSleeping({ id: newId, cwd: plan.cwd, name, ws, ...vals, allowHerdr: !!fb.allowHerdr, summary: sum });
      const gen = this.store.addDesktopImport({ appSessionId: c.appSessionId, sourceConv: info.cliSessionId, newConv: newId, sessionId: s.sessionId, pointUuid: fork.pointUuid, pointAt: fork.pointAt, pointLines: fork.lines, title: info.title, createdAt: Date.now() });
      this.titles.set(s.sessionId, { title: info.title, gen, at: Date.now() });
      this.store.addEvent(s.sessionId, 'desktop_imported', { appSessionId: c.appSessionId, sourceConv: info.cliSessionId, gen, folder: plan.folder, cwd: slash(plan.cwd), lines: fork.lines, dropped: fork.dropped, replaced: vals.replaced, prevGen: led ? led.gen : null });
      b.broadcastSession(s, { cause: 'import' });
      return { appSessionId: c.appSessionId, sessionId: s.sessionId, name, gen, convId: newId, folder: plan.folder, cwd: normPath(plan.cwd), workspaceKey: ws.key, model: vals.model, effort: vals.effort, permissionMode: vals.permissionMode, replaced: vals.replaced };
    } catch (e) {
      await fs.promises.rm(dest, { force: true }).catch(() => {}); // 판 세션을 만들지 못했으면 방금 쓴 갈래만 지운다
      throw e;
    }
  }

  // 잠든 판 세션 하나(패널 없음). 깨우면 sleep.mjs가 convoOf(세션 ID = 새 대화 ID)로 이어 간다
  createSleeping({ id, cwd, name, ws, model, effort, permissionMode, allowHerdr, summary }) {
    const b = this.b, cfg = this.cfg;
    b.ensureWorkspace(ws, `import ${name}`);
    const hookToken = crypto.randomBytes(24).toString('hex');
    const extra = b.branch ? b.branch.settingsExtra(id) : {};
    const settingsPath = writeSessionSettings({ file: path.join(cfg.sessionsDir, `${id}.json`), hookUrl: b.hookUrl, token: hookToken, sessionId: id, timeoutSec: cfg.hookTimeoutSec, allowHerdr, ...extra });
    const launch = { sessionId: id, settingsPath, permissionMode, model, effort, extraArgs: [], ...(b.plugin || {}) };
    const resumeArgv = buildResumeArgv({ claudeCommand: cfg.claudeCommand, ...launch });
    const now = Date.now();
    const rt = newRuntime({ kind: 'claude', hooked: true });
    rt.sleep = { at: now, by: 'import', convId: id };
    rt.herdr = { status: null, launchPending: false, agentSessionId: null, present: false, at: now };
    if (summary) { rt.lastPrompt = summary.lastPrompt || null; rt.lastPromptAt = summary.lastPromptAt || null; rt.lastAnswer = summary.lastAnswer || null; rt.lastAnswerAt = summary.lastAnswerAt || null; rt.lastActivityAt = summary.lastAt || null; }
    const s = { sessionId: id, name, cwd, paneId: null, herdrWorkspaceId: null, agentName: name, model, effort, permissionMode, settingsPath, hookToken, resumeArgv, resumeVerified: false, createdAt: now, closedAt: null, seenAt: now, touchedAt: now, rt, lastState: null, kind: 'claude', origin: 'board', parentSessionId: null, workspaceKey: ws.key, flavor: null, extraArgs: [] };
    this.store.insertSession({ ...s, runtime: rt });
    b.sessions.set(id, s);
    const area = b.worktrees ? b.worktrees.areaOf(ws.key, cwd) : '';
    const slot = slotFor(b, { wsKey: ws.key, size: NODE, area });
    this.store.setNode({ session_id: id, x: slot.x, y: slot.y, w: NODE.w, h: NODE.h, z: 0, size: NEW_NODE_STEP, aspect: DEFAULT_ASPECT, area });
    this.store.addEvent(id, 'spawn', { name, kind: 'claude', cwd: slash(cwd), workspace: ws.key, args: [], allowHerdr, imported: true });
    if (b.api) b.api.broadcast('session.created', { sessionId: id, name, workspaceKey: ws.key, imported: true });
    if (b.probeGit) b.probeGit(s, cwd);
    return s;
  }
}
