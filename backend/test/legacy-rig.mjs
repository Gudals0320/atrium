// P228: 옛 3자리 틀(메인 + 워커, + 검토자, 워크트리판) 시험 도움. 판의 Rig 만들기 대화상자에서는 내렸지만(rig2-design 11.1),
// 그 틀로 만든 rig.json은 그대로 읽고 돈다. 다른 시험이 "3자리 rig 하나"를 빨리 만들 때 이것을 쓴다(옛 rig.create { template }과 같은 결과).
import fs from 'node:fs';
import path from 'node:path';

export const LEGACY_IDS = ['main-worker', 'main-worker-reviewer', 'main-worker-reviewer-worktree'];
const guidePath = (seat) => `.atrium/seats/${seat}.txt`;
const GUIDES = {
  main: () => 'main 자리: 사람의 요청을 받아 일을 나누고 결과를 모아 답한다. 일을 맡길 때: atrium prompt worker "<할 일>". 보드가 맡긴 일이면 atrium done ok "<요약>"으로 닫는다.\n',
  worker: () => 'worker 자리: 맡은 일 하나를 끝까지 한다. 끝나면 atrium done ok "<한 것>", 못 했으면 atrium done failed "<까닭>".\n',
  reviewer: () => 'reviewer 자리: worker가 끝낸 일을 확인한다. 채우면 atrium done ok "<확인한 것>", 고칠 것이 있으면 atrium done rejected "<고칠 것>", 확인할 수 없으면 atrium done failed "<까닭>".\n',
};
function shape(id) {
  const reviewer = id !== 'main-worker';
  const worktree = id === 'main-worker-reviewer-worktree';
  const seats = { main: { session: 'keep' }, worker: { session: 'fresh', ...(worktree ? { worktree: true } : {}) }, ...(reviewer ? { reviewer: { session: 'fresh' } } : {}) };
  const results = reviewer ? ['ok', 'failed', 'rejected'] : ['ok', 'failed'];
  const flow = reviewer
    ? [
      { from: 'main', on: 'assign', to: 'worker' },
      { from: 'worker', on: 'ok', to: 'reviewer' },
      { from: 'worker', on: 'failed', to: 'main' },
      { from: 'reviewer', on: 'rejected', to: 'worker', max: 2, else: 'main' },
      { from: 'reviewer', on: 'ok', to: 'main' },
      { from: 'reviewer', on: 'failed', to: 'main' },
    ]
    : [
      { from: 'main', on: 'assign', to: 'worker' },
      { from: 'worker', on: 'ok', to: 'main' },
      { from: 'worker', on: 'failed', to: 'main' },
    ];
  return { seats, results, flow };
}
const NAMES = { 'main-worker': 'Main + worker', 'main-worker-reviewer': 'Main + worker + reviewer', 'main-worker-reviewer-worktree': 'Main + worker (worktree) + reviewer' };
// 옛 틀 + 자리마다 런처 → { def, guides }
export function legacyTemplateFiles(id, launchers = {}) {
  if (!LEGACY_IDS.includes(id)) throw new Error(`모르는 옛 틀: ${id}`);
  const s = shape(id);
  const seats = {}; const guides = {};
  for (const [name, x] of Object.entries(s.seats)) {
    seats[name] = { launcher: launchers[name] || 'claude', session: x.session, ...(x.worktree ? { worktree: true } : {}), guide: guidePath(name) };
    guides[guidePath(name)] = GUIDES[name]();
  }
  return { def: { name: NAMES[id], results: s.results, seats, flow: s.flow.map((l) => ({ ...l })), manager: 'main' }, guides };
}
// 옛 rig.create { template }과 같은 일: 자리 안내(있으면 그대로)와 rig.json을 쓰고 버전 하나(누가 human, note "create <틀>")
export function legacyCreate(b, key, id, launchers = {}) {
  const root = b.rig.rootOf(key);
  const { def, guides } = legacyTemplateFiles(id, launchers);
  const written = []; const kept = [];
  for (const [rel, text] of Object.entries(guides)) {
    const f = path.join(root, rel);
    if (fs.existsSync(f)) { kept.push(rel); continue; }
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); written.push(rel);
  }
  fs.writeFileSync(path.join(root, '.atrium', 'rig.json'), JSON.stringify(def, null, 2) + '\n', { flag: 'wx' });
  const a = b.rig.recordNow(key, { by: 'human', note: `create ${id}` });
  return { ok: true, version: a.ok ? a.n ?? null : null, written, kept };
}
