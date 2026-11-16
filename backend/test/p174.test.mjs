// P174 단위 시험: 정리 대상(missed) Codex 대화를 Claude 대화와 같은 규칙으로 휴지통에 보낸다.
// 지울 계획(rollout .jsonl·.jsonl.zst, 눌린 짝·하위 에이전트 rollout 함께), 거절(뿌리 밖, ID 불일치, 하위 에이전트 파일, 도는 명령줄, 방금 기록됨,
// 데스크톱 앱·편집기 확장, 판 세션), Claude 쪽은 그대로, 판에서 끈 Codex 세션 삭제. codex 없이 돈다. Codex 홈은 직접 만든 가짜다(실제 ~/.codex는 읽지 않는다)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { EventEmitter } from 'node:events';
import { Store } from '../src/store.mjs';
import { pathKey, normPath } from '../src/workspaces.mjs';
import { codexRolloutName, indexCodexRollouts, listCodexFiles } from '../src/codex-convos.mjs';
import { Recall } from '../src/recall.mjs';
import { trashPlan, planPaths, REFUSE_LABEL } from '../src/missed.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p174-'));
const CID = (n) => `01a17400-0000-7000-8000-0000000000${String(n).padStart(2, '0')}`;
const SUB = (n) => `01a17401-0000-7000-8000-0000000000${String(n).padStart(2, '0')}`;
const AT = '2026-11-01T01:00:00.000Z';
const meta = (id, cwd, { source = 'cli', originator = 'codex-tui' } = {}) => JSON.stringify({ timestamp: AT, ordinal: 0, type: 'session_meta', payload: { id, timestamp: AT, cwd, originator, cli_version: '0.167.2', source } });
const user = (text) => JSON.stringify({ timestamp: AT, ordinal: 1, type: 'event_msg', payload: { type: 'item_completed', item: { type: 'UserMessage', id: 'u', content: [{ type: 'text', text }] } } });
const OLD = Date.now() - 3600000;
function rollout(home, id, { cwd, child = null, zst = false, day = '2026/11/01', mtime = OLD, src = {} } = {}) {
  const dir = path.join(home, 'sessions', ...day.split('/'));
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `rollout-2026-11-01T10-00-00-${id}${child ? `_${child}` : ''}.jsonl${zst ? '.zst' : ''}`);
  const text = [meta(child || id, cwd, child ? { source: { subagent: 'x' } } : src), user('지시')].join('\n') + '\n';
  fs.writeFileSync(f, zst ? zlib.zstdCompressSync(Buffer.from(text)) : text);
  fs.utimesSync(f, new Date(mtime), new Date(mtime));
  return f;
}

// ---------- 지울 계획(순수 함수) ----------
test('P174: rollout 이름 읽기(대화 ID, 하위 에이전트, 눌림)', () => {
  assert.deepEqual(codexRolloutName(`rollout-2026-11-01T10-00-00-${CID(1)}.jsonl`), { id: CID(1), child: null, zst: false });
  assert.deepEqual(codexRolloutName(`rollout-2026-11-01T10-00-00-${CID(1)}_${SUB(1)}.jsonl.zst`), { id: CID(1), child: SUB(1), zst: true });
  assert.equal(codexRolloutName(`${CID(1)}.jsonl`), null);
});

test('P174: Codex 대화 계획 — 뿌리 안 rollout(.jsonl·.jsonl.zst)은 보내고, 같은 대화의 눌린 짝과 하위 에이전트 rollout을 함께 보낸다', () => {
  const home = tmp(); const root = path.join(home, 'sessions');
  const f = rollout(home, CID(1), { cwd: 'C:/gone' });
  const z = rollout(home, CID(1), { cwd: 'C:/gone', zst: true });
  const sub = rollout(home, CID(1), { cwd: 'C:/gone', child: SUB(1), day: '2026/11/02' });
  const other = rollout(home, CID(2), { cwd: 'C:/gone' });
  const fz = rollout(home, CID(3), { cwd: 'C:/gone', zst: true });
  const outside = path.join(tmp(), 'x', path.basename(other));
  const files = { [CID(1)]: [f, z, sub, other, outside], [CID(3)]: [fz] };
  const base = { cls: 'missed', binding: { bound: false }, harness: 'codex', entrypoints: ['cli'] };
  const plan = trashPlan([{ ...base, convId: CID(1), path: f }, { ...base, convId: CID(3), path: fz }], { roots: [tmp()], codexRoots: [root], codexFiles: (id) => files[id] || [] });
  assert.deepEqual(plan.refused, []);
  assert.equal(plan.ok.length, 2);
  // 다른 대화의 rollout, 뿌리 밖 파일은 함께 보내지 않는다
  assert.deepEqual(planPaths(plan.ok[0]).map(pathKey).sort(), [f, z, sub].map(pathKey).sort());
  assert.equal(plan.ok[0].dir, null); assert.equal(plan.ok[0].harness, 'codex');
  assert.deepEqual(planPaths(plan.ok[1]).map(pathKey), [pathKey(fz)]);
});

test('P174: Codex 대화 거절 — 뿌리 밖, ID 불일치, 하위 에이전트 파일, 도는·묶인, 데스크톱 앱, 편집기 확장, 판 세션, 정리 대상 아님', () => {
  const home = tmp(); const root = path.join(home, 'sessions');
  const f = rollout(home, CID(1), { cwd: 'C:/gone' });
  const sub = rollout(home, CID(1), { cwd: 'C:/gone', child: SUB(1) });
  const base = { convId: CID(1), path: f, cls: 'missed', binding: { bound: false }, harness: 'codex', entrypoints: ['cli'] };
  const cases = [
    [{ ...base, path: path.join(tmp(), path.basename(f)) }, 'outside_root'],
    [{ ...base, path: `${root}/../x/${path.basename(f)}` }, 'bad_path'],
    [{ ...base, convId: CID(2) }, 'not_uuid'],
    [{ ...base, path: sub }, 'not_uuid'],
    [{ ...base, path: path.join(path.dirname(f), `${CID(1)}.jsonl`) }, 'not_uuid'],
    [{ ...base, binding: { bound: true, open: true, where: 'terminal' } }, 'running'],
    [{ ...base, binding: { bound: true, where: 'unknown', sure: false } }, 'bound'],
    [{ ...base, desktop: true }, 'desktop'],
    [{ ...base, entrypoints: ['codex-vscode'] }, 'editor'],
    [{ ...base, boardKnown: true }, 'board_session'],
    [{ ...base, cls: 'board' }, 'not_missed'],
    [{ ...base, harness: 'pi' }, 'harness'],
  ];
  for (const [it, why] of cases) {
    const plan = trashPlan([it], { roots: [root], codexRoots: [root] });
    assert.deepEqual(plan.refused.map((r) => r.reason), [why], why);
    assert.ok(REFUSE_LABEL[why], why);
  }
  // Codex 홈이 없으면(설정 끔) 뿌리 밖
  assert.deepEqual(trashPlan([base], { roots: [root] }).refused.map((r) => r.reason), ['outside_root']);
});

test('P174: Claude 쪽 계획은 그대로(옆 폴더, Codex 뿌리에 있는 UUID 파일은 Claude 뿌리가 아니면 거절)', () => {
  const root = tmp(); const id = '0000aaaa-0000-4000-8000-000000000174';
  const f = path.join(root, 'p', `${id}.jsonl`);
  const plan = trashPlan([{ convId: id, path: f, cls: 'missed', binding: { bound: false } }], { roots: [root], dirExists: () => true, codexRoots: [tmp()] });
  assert.equal(plan.ok.length, 1); assert.equal(plan.ok[0].dir, f.slice(0, -6)); assert.deepEqual(plan.ok[0].extras, []);
  const cx = tmp();
  assert.deepEqual(trashPlan([{ convId: id, path: path.join(cx, `${id}.jsonl`), cls: 'missed', binding: { bound: false }, harness: 'claude' }], { roots: [root], codexRoots: [cx] }).refused.map((r) => r.reason), ['outside_root']);
});

test('P174: indexCodexRollouts는 하위 에이전트와 눌린 짝까지 부모 ID 아래 모은다(목록 읽기 listCodexFiles는 그대로)', async () => {
  const home = tmp();
  const f = rollout(home, CID(1), { cwd: 'C:/x' }), z = rollout(home, CID(1), { cwd: 'C:/x', zst: true }), s = rollout(home, CID(1), { cwd: 'C:/x', child: SUB(1), day: '2026/11/03' });
  const idx = await indexCodexRollouts(home);
  assert.deepEqual(idx.get(CID(1)).map(pathKey).sort(), [f, z, s].map(pathKey).sort());
  assert.deepEqual((await listCodexFiles(home)).map((x) => pathKey(x.path)), [pathKey(f)]);
});

// ---------- 판(Recall) ----------
function fakeBackend({ codexHome, procs = [] }) {
  const dataDir = tmp();
  const store = new Store(path.join(dataDir, 'board.db'));
  const b = {
    cfg: { convoRoots: [path.join(dataDir, 'no-claude')], codexConvoHome: codexHome, claudeSessionsDir: path.join(dataDir, 'cs'), desktopSessionsDir: null, convoScanMs: 60000, claudeProjects: path.join(dataDir, 'no-claude'), sessionsDir: path.join(dataDir, 'sessions'), hookTimeoutSec: 2, claudeJson: path.join(dataDir, 'none.json'), claudeCommand: 'claude', recoverGraceMs: 50, dataDir },
    store, bus: new EventEmitter(), sessions: new Map(), killing: new Set(), api: { broadcast: () => {} }, log: () => {}, hooked: () => true,
    ensureWorkspace: () => false, broadcastWorkspaces: () => {}, broadcastSession: () => {}, probeGit: () => {},
  };
  const trashed = [];
  const r = new Recall(b, {
    resolveCwd: async (cwd) => ({ key: pathKey(cwd), kind: 'folder', root: normPath(cwd) }),
    readProcs: async () => procs,
    trash: async (paths) => { for (const p of paths) { fs.rmSync(p, { recursive: true, force: true }); trashed.push(p); } return { trashed: paths, failed: [] }; },
  });
  return { b, r, store, trashed };
}

test('P174 판: 폴더가 없어진 Codex 대화가 정리 대상에 들고, 지우면 rollout과 하위 에이전트 rollout이 휴지통으로 간다. 도는·방금 기록·데스크톱·판 세션은 남는다', async () => {
  const home = tmp(); const gone = path.join(tmp(), 'gone-repo'); // 만들지 않은 폴더
  const f1 = rollout(home, CID(1), { cwd: gone });
  const s1 = rollout(home, CID(1), { cwd: gone, child: SUB(1) });
  const f2 = rollout(home, CID(2), { cwd: gone, zst: true });
  const f3 = rollout(home, CID(3), { cwd: gone }); // 도는 codex resume
  const f4 = rollout(home, CID(4), { cwd: gone, mtime: Date.now() }); // 방금 기록됨
  const f5 = rollout(home, CID(5), { cwd: gone, src: { source: 'vscode', originator: 'Codex Desktop' } }); // 데스크톱 앱
  const f6 = rollout(home, CID(6), { cwd: gone }); // 판 세션
  const f7 = rollout(home, CID(7), { cwd: gone, src: { source: 'vscode', originator: 'codex_vscode' } }); // 편집기 확장
  const { r, store, trashed } = fakeBackend({ codexHome: home, procs: [{ pid: 4321, name: 'codex.exe', cmd: `codex resume ${CID(3)}` }] });
  store.insertSession({ sessionId: 'aaaaaaaa-0000-4000-8000-000000000174', name: 'cx', cwd: gone, permissionMode: 'manual', createdAt: 1, runtime: { term: {} }, kind: 'codex', origin: 'board', harnessPlan: { harnessSessionId: CID(6) } });
  await r.scan({ wait: true });
  await r.refreshProcs();
  const ml = await r.missedList();
  const listed = ml.folders.flatMap((g) => g.items.map((i) => i.convId)).sort();
  // 데스크톱·편집기 확장·판 세션·도는 대화는 정리 대상이 아니다. 방금 기록된 것은 목록에 있어도 지울 때 막힌다
  assert.deepEqual(listed, [CID(1), CID(2), CID(4)].sort());
  const ask = await r.missedDelete({ all: true });
  assert.equal(ask.needsConfirm, true); assert.equal(ask.count, 3); assert.equal(trashed.length, 0);
  const all = await r.missedDelete({ all: true, confirm: true });
  assert.deepEqual(all.convos.sort(), [CID(1), CID(2)].sort());
  assert.deepEqual(all.refused.map((x) => [x.convId, x.reason]), [[CID(4), 'bound']]);
  assert.deepEqual(trashed.map(pathKey).sort(), [f1, s1, f2].map(pathKey).sort());
  for (const f of [f1, s1, f2]) assert.equal(fs.existsSync(f), false);
  for (const f of [f3, f4, f5, f6, f7]) assert.ok(fs.existsSync(f));
  assert.ok(fs.existsSync(path.dirname(f3)), 'Codex 날짜 폴더는 남는다');
  assert.equal(store.getConvoById(CID(1)), null);
  // 골라 지우기: 도는 대화, 데스크톱 앱 대화, 편집기 확장 대화, 판 세션 대화는 거절
  const ref = await r.missedDelete({ convos: [CID(3), CID(5), CID(6), CID(7)], confirm: true });
  assert.equal(ref.trashed, 0);
  assert.deepEqual(Object.fromEntries(ref.refused.map((x) => [x.convId, x.reason])), { [CID(3)]: 'running', [CID(5)]: 'desktop', [CID(6)]: 'board_session', [CID(7)]: 'editor' });
  // 다시 훑어도 지운 대화는 돌아오지 않는다
  await r.scan({ wait: true });
  assert.equal(store.getConvoById(CID(1)), null); assert.equal(store.getConvoById(CID(2)), null);
});

test('P174 판: 판에서 끈 Codex 세션을 삭제하면 그 rollout(과 하위 에이전트 rollout)을 휴지통으로 보내고 행을 지운다. 아직 돌면 보관한다', async () => {
  const home = tmp(); const ws = tmp();
  const f = rollout(home, CID(11), { cwd: ws, mtime: Date.now() }); // 막 끈 세션이라 방금 기록됨은 묶임이 아니다
  const s = rollout(home, CID(11), { cwd: ws, child: SUB(11) });
  const g = rollout(home, CID(12), { cwd: ws, zst: true });
  const { r, store, trashed } = fakeBackend({ codexHome: home, procs: [{ pid: 99, name: 'codex.exe', cmd: `codex resume ${CID(13)}` }] });
  const add = (sid, name, conv) => { store.insertSession({ sessionId: sid, name, cwd: ws, permissionMode: 'manual', createdAt: 1, runtime: { term: {} }, kind: 'codex', origin: 'board', harnessPlan: { harnessSessionId: conv } }); store.updateSession(sid, { closedAt: Date.now(), closeReason: 'killed' }); };
  add('aaaaaaaa-0000-4000-8000-000000001101', 'c1', CID(11));
  add('aaaaaaaa-0000-4000-8000-000000001102', 'c2', CID(12));
  add('aaaaaaaa-0000-4000-8000-000000001103', 'c3', CID(13));
  rollout(home, CID(13), { cwd: ws });
  const out = await r.forgetClosed('aaaaaaaa-0000-4000-8000-000000001101', { waitMs: 0 });
  assert.equal(out.deleted, true); assert.equal(out.convo, CID(11)); assert.equal(out.trashed, 2);
  assert.deepEqual(trashed.map(pathKey).sort(), [f, s].map(pathKey).sort());
  assert.equal(store.closedSession('aaaaaaaa-0000-4000-8000-000000001101'), null);
  // 눌린 rollout만 남은 세션도(색인 전이라 파일에서 찾는다)
  const out2 = await r.forgetClosed('aaaaaaaa-0000-4000-8000-000000001102', { waitMs: 0 });
  assert.equal(out2.deleted, true); assert.equal(fs.existsSync(g), false);
  // 아직 도는 대화(명령줄)는 지우지 않고 보관한다
  const out3 = await r.forgetClosed('aaaaaaaa-0000-4000-8000-000000001103', { waitMs: 0 });
  assert.equal(out3.deleted, false); assert.equal(out3.reason, 'running'); assert.equal(out3.archived, true);
  assert.ok(store.closedSession('aaaaaaaa-0000-4000-8000-000000001103'));
});
