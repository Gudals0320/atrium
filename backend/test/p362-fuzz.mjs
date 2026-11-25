// P362 시험 도구(p362.test.mjs가 쓴다): 새 세션이 겹쳐 서던 길과 손 크기 노드가 자리까지 묶이던 길. 무작위 순서로 노드를 더하고(하위·동료·워크트리 워커·셸·끄기·핀·손 크기)
// 같은 영역의 살아 있는 노드끼리(덩어리 안은 빼고) 겹치지 않고, 워크트리 상자가 남의 노드와 겹치지 않으며, 핀 노드는 움직이지 않는지 본다.
// 가짜 판은 p350.test.mjs와 같은 꼴(backend.spawn의 자리 순서 그대로: placeSpawn → settleRegions)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { overlaps } from '../src/canvas.mjs';
import { Store } from '../src/store.mjs';
import { newRuntime } from '../src/state.mjs';
import { Backend } from '../src/backend.mjs';
import * as ops from '../src/canvas-ops.mjs';
import { Branch } from '../src/branch.mjs';
import { pathKey, normPath } from '../src/workspaces.mjs';
import { attachWorktrees } from '../src/worktrees.mjs';
import { isBoxKey } from '../src/worktree-areas.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p362-'));
const REPO = 'C:/repo';
const OUT = (n) => 'E:/worktrees/C_repo/' + n;

export function board() {
  const b = new Backend({ quietMs: 600000, port: 0, logDir: tmp() });
  b.store = new Store(path.join(tmp(), 'board.db'));
  b.sessions = new Map(); b.api = { broadcast: () => {} }; b.log = () => {}; b.touch = () => {}; b.broadcastWorkspaces = () => {}; b.bus ??= new EventEmitter();
  const mk = (root, kind, at) => { const key = kind === 'repo' ? pathKey(root + '/.git') : pathKey(root); b.store.insertWorkspace({ key, kind, root: normPath(root), createdAt: 1 }); if (at) b.store.setWorkspaceAnchor(key, at.x, at.y); return { key, root }; };
  const ws = mk(REPO, 'repo', { x: 0, y: 0 });
  const state = { wts: [] };
  const porcelain = () => ['worktree ' + REPO, 'HEAD 1', 'branch refs/heads/main', '', ...state.wts.flatMap((n) => ['worktree ' + OUT(n), 'HEAD 2', 'branch refs/heads/worktree-' + n, ''])].join('\n');
  b.worktrees = attachWorktrees(b, { tickMs: 0, list: async (root) => (normPath(root) === normPath(REPO) ? porcelain() : null), exists: () => true });
  b.branch = new Branch(b);
  let clock = 1000;
  const reg = (name, w, extra = {}) => {
    const s = { sessionId: 'id-' + name, name, kind: 'claude', workspaceKey: w.key, cwd: w.root, rt: newRuntime({ kind: 'claude' }), origin: 'board', createdAt: clock++, ...extra };
    b.sessions.set(s.sessionId, s); b.store.insertSession({ ...s, permissionMode: 'manual', runtime: s.rt }); return s;
  };
  const spawn = (name, w, { parent = null, worktree = null, quick = null, cwd = null, kind = 'claude', peer = false, rect = null } = {}) => {
    const branch = parent ? { role: '워커', depth: 2, by: parent.sessionId, at: clock, order: b.branch.nextOrder(parent.sessionId), worktree, ...(worktree ? { wtHome: 1 } : {}), ...(peer ? { relation: 'peer' } : {}) } : null;
    const s = reg(name, w, { parentSessionId: parent ? parent.sessionId : null, cwd: cwd || (parent ? parent.cwd : w.root), kind });
    if (branch) b.branch.noteChild(s.sessionId, branch);
    if (quick) s.wtSpawn = quick;
    if (rect) b.store.setNode({ session_id: s.sessionId, ...rect, z: 0 }); // 정해 둔 자리(사람이 둔 판)
    else ops.placeSpawn(b, s, { branch, worktree: quick || worktree, area: b.worktrees.areaOf(w.key, s.cwd) });
    ops.settleRegions(b, 'spawn');
    if (peer) { b.store.setRelation(parent.sessionId, s.sessionId, 'peer', 'agent', clock); b.branch._relRows = null; } // branch.child와 같이 띄운 뒤 동료로
    if (quick) s.quickWorktree = { name: quick, via: 'claude-w' };
    return s;
  };
  const close = (s) => {
    b.store.updateSession(s.sessionId, { closedAt: Date.now(), runtime: s.rt, closeReason: 'test' });
    b.sessions.delete(s.sessionId);
    ops.onSessionClosed(b, s);
  };
  return { b, ws, mk, state, spawn, reg, close };
}

// 같은 영역(상자 안은 그 상자)의 살아 있는 노드끼리 겹친 쌍(덩어리 안은 뺀다), 상자가 남의 노드와 겹친 쌍
export function violations(b) {
  const items = ops.canvasItems(b);
  const nodes = items.filter((i) => i.kind === 'node');
  const pins = ops.pinnedIds(b);
  const docks = b.store.docks();
  const dockOf = (id) => (docks.find((d) => d.members.includes(id)) || {}).dockId || null;
  const out = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], c = nodes[j];
    if ((a.wsKey || null) !== (c.wsKey || null)) continue;
    if (dockOf(a.id) && dockOf(a.id) === dockOf(c.id)) continue;
    if (pins.has(a.id) && pins.has(c.id)) continue; // 둘 다 사람이 둔 자리(핀끼리 겹치게 늘린 것은 사람이 한 일이고, 판은 핀을 옮기지 않는다)
    if (overlaps(a, c, -1)) out.push(`node ${b.nameOf(a.id)}|${b.nameOf(c.id)}`);
  }
  const regs = ops.regions(b, items);
  for (const [k, r] of regs) {
    if (!isBoxKey(k)) continue;
    for (const n of nodes) if (n.ws !== k && overlaps(r, n, -1)) out.push(`box ${k.split('|').pop()}|${b.nameOf(n.id)}`);
    for (const [k2, r2] of regs) if (k2 !== k && isBoxKey(k2) && k < k2 && overlaps(r, r2, -1)) out.push(`boxes ${k}|${k2}`);
  }
  return out;
}

// 씨앗이 있는 작은 난수
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// 무작위 판 하나: steps번 동작. → { log, bad: [{ step, op, v }] }
export async function fuzz(seed, steps = 40, { stopOnBad = true, trace = -1 } = {}) {
  const r = rng(seed);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const t = board();
  const { b, ws, spawn, close, state } = t;
  const h = b.handlers();
  const log = [];
  const bad = [];
  let n = 0;
  const live = () => [...b.sessions.values()];
  const agents = () => live().filter((s) => s.kind === 'claude');
  const pins = new Map(); // 핀 꽂은 세션 → 자리
  for (let step = 0; step < steps; step++) {
    if (step === trace) { const orig = b.store.setNode.bind(b.store); b.store.setNode = (x) => { console.log('setNode', b.nameOf(x.session_id), x.x, x.y, x.w, x.h, new Error().stack.split(String.fromCharCode(10)).slice(2, 5).map((l) => l.trim()).join(' < ')); return orig(x); }; b.log = (m) => console.log('LOG', m); } // 시험 도구: 한 걸음 따라가기
    const roll = r();
    let op;
    const name = 's' + (n++);
    if (!agents().length || roll < 0.12) { op = `root ${name}`; spawn(name, ws); }
    else if (roll < 0.2) { op = `shell ${name}`; spawn(name, ws, { kind: 'shell' }); }
    else if (roll < 0.45) { const p = pick(agents()); const root = r() < 0.2; op = `child ${name} of ${p.name}${root ? ' (repo root)' : ''}`; spawn(name, ws, { parent: p, cwd: root ? ws.root : p.rt.cwd || p.cwd }); } // 하위는 부모의 지금 폴더(워크트리 워커면 그 워크트리)에서, 가끔 리포 뿌리에서
    else if (roll < 0.55) { const p = pick(agents()); op = `peer ${name} of ${p.name}`; spawn(name, ws, { parent: p, peer: true }); }
    else if (roll < 0.63) { const p = pick(agents()); op = `wt ${name} of ${p.name}`; spawn(name, ws, { parent: p, worktree: name }); state.wts.push(name); b.sessions.get('id-' + name).rt.cwd = OUT(name); await b.worktrees.sync('t'); }
    else if (roll < 0.67) { op = `quick ${name}`; spawn(name, ws, { quick: name }); state.wts.push(name); const s = b.sessions.get('id-' + name); s.rt.cwd = OUT(name); await b.worktrees.sync('t'); }
    else if (roll < 0.74 && live().length > 2) { const s = pick(live()); op = `close ${s.name}`; close(s); pins.delete(s.sessionId); }
    else if (roll < 0.82 && live().length) {
      // 손 크기: 크기 단계(노드 메뉴) 또는 테두리 끌기(board.setNode cause resize)
      const s = pick(live());
      if (r() < 0.5) { const size = pick(['wide-large', 'wide-small', 'tall-normal', 'wide43-large', 'tall43-small']); op = `size ${s.name} ${size}`; ops.setSize(b, { session: s.sessionId, size }); }
      else { const nd = b.store.nodes().find((x) => x.session_id === s.sessionId); const w = Math.round(nd.w * (0.7 + r() * 0.8)), hh = Math.round(nd.h * (0.7 + r() * 0.8)); op = `resize ${s.name} ${w}x${hh}`; h['board.setNode']({ session: s.sessionId, x: nd.x, y: nd.y, w, h: hh, z: 0, cause: 'resize' }); }
    } else if (live().length) {
      // 핀: 사람이 빈자리로 끌어 옮긴다(창은 새 겹침이 생기는 끌기를 되돌린다)
      const s = pick(live());
      const nd = b.store.nodes().find((x) => x.session_id === s.sessionId);
      const others = ops.canvasItems(b).filter((i) => i.kind === 'node' && i.id !== s.sessionId);
      const regs = [...ops.regions(b).entries()].filter(([k]) => isBoxKey(k)).map(([, x]) => x);
      let spot = null;
      for (let i = 0; i < 30 && !spot; i++) { const c = { x: Math.round(nd.x + (r() - 0.5) * 6000), y: Math.round(nd.y + (r() - 0.3) * 4000), w: nd.w, h: nd.h }; if (!others.some((o) => overlaps(c, o, 40)) && !regs.some((o) => overlaps(c, o, 40))) spot = c; }
      if (!spot || ops.dockOf(b, s.sessionId) || isBoxKey(ops.areaOfNode(b, s.sessionId))) { op = `pin skip ${s.name}`; }
      else { op = `pin ${s.name} -> ${spot.x},${spot.y}`; h['board.setNode']({ session: s.sessionId, x: spot.x, y: spot.y, w: nd.w, h: nd.h, z: 0, cause: 'drag' }); }
    }
    log.push(op);
    // 핀 노드는 움직이지 않는다
    for (const sid of ops.pinnedIds(b)) { const nd = b.store.nodes().find((x) => x.session_id === sid); if (!pins.has(sid) || op.startsWith('pin ' + b.nameOf(sid) + ' ')) pins.set(sid, { x: nd.x, y: nd.y }); }
    const moved = [...pins].filter(([sid, p]) => b.sessions.has(sid) && ops.pinnedIds(b).has(sid)).filter(([sid, p]) => { const nd = b.store.nodes().find((x) => x.session_id === sid); return nd.x !== p.x || nd.y !== p.y; }).map(([sid]) => `pin moved ${b.nameOf(sid)}`);
    const v = [...violations(b), ...moved];
    if (v.length) { bad.push({ step, op, v }); if (stopOnBad) break; }
  }
  return { log, bad, b };
}

