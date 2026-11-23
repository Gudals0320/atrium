// P338: 설정 › 봇 탭이 보는 읽기 전용 요약과 저장소별 병합 설정(.atrium/merge.json) 읽기·쓰기.
// - bots.status: 봇마다 지금 상태와 오늘 한 것. 병합 봇은 merger 기록(merger.status)과 오늘 닫힌 합치기 일(work_units origin merge),
//   할 일 정리 봇은 TodoTidy의 지난 한 시간 부른 수·상한과 오늘의 decision_tidy 이벤트(카드 수, 버린 수, 규칙으로 물러섬)를 센다.
//   판에 새로 쌓는 것은 없다(있는 표와 이벤트만 읽는다).
// - merger.configs: 워크스페이스마다(뿌리 폴더가 있는 것) .atrium/merge.json 네 칸(target, where, push, guide)과 그 프로젝트에서 기억한 답.
// - merger.config.set: 한 워크스페이스의 칸을 고쳐 그 파일에 쓴다. 칸 확인은 readMergeConfig와 같은 규칙이고, 기본값인 칸은 파일에서 뺀다.
import fs from 'node:fs';
import path from 'node:path';
import { readMergeConfig, MERGE_CONFIG, MERGE_WHERE, MERGER_MODES } from './merger.mjs';
import { ensureAtriumDir } from './doc-check.mjs';

const BRANCH_RE = /^(?![-/.])(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._\/-]{1,200}(?<![/.])$/; // merger.mjs와 같다
function apiError(code, message) { return Object.assign(new Error(message), { code }); }

// 그 날(이 PC 시간)의 0시
export function dayStart(now = Date.now()) { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }

// 오늘 닫힌 합치기 일 → { merged, failed }(치우기 일은 따로 discarded)
export function mergeToday(units = []) {
  const out = { merged: 0, failed: 0, discarded: 0 };
  for (const u of units) {
    if (!u) continue;
    if (u.meta && u.meta.discard) { if (u.status === 'done') out.discarded++; continue; }
    if (u.status === 'done') out.merged++;
    else if (u.status === 'failed') out.failed++;
  }
  return out;
}
// 병합 봇의 지금 상태: off(설정 끔) | working(합치는 중인 일) | waiting(줄 선 일) | idle
export function mergeState({ mode, jobs = [] }) {
  if (mode === 'off') return 'off';
  if (jobs.some((j) => j && j.state === 'merging')) return 'working';
  if (jobs.some((j) => j && j.state === 'queued')) return 'waiting';
  return 'idle';
}
// 오늘의 decision_tidy 이벤트 → { calls, cards, dropped, fallback }
export function tidyToday(events = []) {
  const out = { calls: 0, cards: 0, dropped: 0, fallback: 0 };
  for (const e of events) {
    const d = (e && e.data) || {};
    out.calls++;
    if (Number.isInteger(d.cards)) out.cards += d.cards;
    if (Number.isInteger(d.dropped)) out.dropped += d.dropped;
    if (d.fallback) out.fallback++;
  }
  return out;
}

// 칸 고치기(순수): 지금 값 + 고칠 칸 → 새 값 또는 throw. 빈 target·guide는 지움(기본)
export function patchMergeConfig(cur, patch = {}) {
  const next = { target: cur.target ?? null, where: cur.where || 'worktree', push: !!cur.push, guide: cur.guide ?? null };
  for (const [k, v] of Object.entries(patch || {})) {
    if (k === 'target') {
      const t = String(v ?? '').trim();
      if (t && !BRANCH_RE.test(t)) throw apiError('bad_request', 'target은 브랜치 이름이다: ' + t);
      next.target = t || null;
    } else if (k === 'where') {
      if (!MERGE_WHERE.includes(v)) throw apiError('bad_request', 'where는 ' + MERGE_WHERE.join(' 또는 ') + '이다');
      next.where = v;
    } else if (k === 'push') {
      if (typeof v !== 'boolean') throw apiError('bad_request', 'push는 true 또는 false다');
      next.push = v;
    } else if (k === 'guide') {
      const g = String(v ?? '').trim();
      if (g && (path.isAbsolute(g) || g.split(/[\\/]/).includes('..'))) throw apiError('bad_request', 'guide는 저장소 안 상대 경로다');
      next.guide = g ? g.split('\\').join('/') : null;
    } else throw apiError('bad_request', '모르는 칸: ' + k);
  }
  return next;
}
// 파일에 쓸 모양: 기본값인 칸은 뺀다(target 없음, where worktree, push false, guide 없음)
export function mergeConfigJson(c) {
  const j = {};
  if (c.target) j.target = c.target;
  if (c.where && c.where !== 'worktree') j.where = c.where;
  if (c.push) j.push = true;
  if (c.guide) j.guide = c.guide;
  return j;
}
// 저장소 뿌리에 쓴다. 파일에 다른 칸(모르는 칸)이 있으면 그대로 둔다. → readMergeConfig 결과
export function writeMergeConfig(root, patch) {
  if (!root || !fs.existsSync(root)) throw apiError('not_found', '프로젝트 폴더가 없다');
  const cur = readMergeConfig(root);
  const file = path.join(root, MERGE_CONFIG);
  let extra = {};
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); if (j && typeof j === 'object' && !Array.isArray(j)) extra = Object.fromEntries(Object.entries(j).filter(([k]) => !['target', 'where', 'push', 'guide'].includes(k))); } catch {}
  const next = patchMergeConfig(cur.config, patch);
  ensureAtriumDir(root);
  fs.writeFileSync(file, JSON.stringify({ ...extra, ...mergeConfigJson(next) }, null, 2) + '\n');
  return readMergeConfig(root);
}

export function botsHandlers(b) {
  const settings = () => (b.features && b.features.settings ? b.features.settings.get() : {});
  const status = () => {
    const set = settings(); const now = Date.now(); const since = dayStart(now);
    // 병합
    let merge = null;
    if (b.merger) {
      const st = b.merger.status(null);
      const mode = MERGER_MODES.includes(set.mergerMode) ? set.mergerMode : 'ask';
      const closed = b.store.mergeUnitsClosedSince ? b.store.mergeUnitsClosedSince(since) : [];
      merge = {
        mode, state: mergeState({ mode, jobs: st.jobs }),
        mergers: st.mergers.filter((m) => m.open).map((m) => ({ name: m.name, sessionId: m.sessionId, workspace: m.workspace, target: m.target, jobs: m.jobs, jobsMax: m.jobsMax })),
        open: { merging: st.jobs.filter((j) => j.state === 'merging').length, queued: st.jobs.filter((j) => j.state === 'queued').length },
        today: mergeToday(closed), problem: st.problem || null,
      };
    }
    // 할 일 정리
    let todoTidy = null;
    const tt = b.todoTidy;
    if (tt) {
      const c = tt.conf();
      const hour = (tt.calls || []).filter((x) => now - x < 3600_000).length;
      const evs = b.store.eventsAfter(since - 1, ['decision_tidy']);
      todoTidy = { mode: c.on ? 'on' : 'off', state: !c.on ? 'off' : tt.busy > 0 ? 'working' : 'idle', hour, perHour: c.perHour, today: tidyToday(evs), autoDecisions: set.autoDecisions !== false };
    }
    return { at: now, since, merge, todoTidy };
  };
  const rootOf = (key) => { const w = b.store.getWorkspace(key); return w && w.root ? w.root : null; };
  return {
    'bots.status': () => status(),
    'merger.configs': () => {
      const answers = (b.merger && b.merger.meta) ? b.merger.meta('mergerAnswers') || {} : {};
      return { file: MERGE_CONFIG, workspaces: b.store.workspaces().filter((w) => w.root && fs.existsSync(w.root)).map((w) => {
        const r = readMergeConfig(w.root);
        return { workspace: w.key, root: w.root, ...r.config, source: r.source, problems: r.problems, answer: answers[w.key] || null };
      }) };
    },
    'merger.config.set': async (p = {}) => {
      const key = (await b.resolveWorkspace(p && p.workspace)).key;
      const root = rootOf(key);
      const r = writeMergeConfig(root, p.patch || {});
      if (b.merger && b.merger.changed) b.merger.changed(key);
      return { workspace: key, ...r.config, source: r.source, problems: r.problems };
    },
  };
}
