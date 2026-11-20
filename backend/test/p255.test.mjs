// P255 시험: 메모리 칩의 CPU(세션들·PC 전체), 모델 연결(P115) 걷어 내기 뒤 옛 연결 값 무시.
// 진짜 프로세스 표를 읽지 않는다(가짜 표와 가짜 os.cpus()만).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResourceMonitor, treeCpu, cpuTimes, cpuPct, systemCpuPct, cpuKey } from '../src/resources.mjs';
import { Store } from '../src/store.mjs';
import { Launchers, normalizeLauncher, resolveLauncher, describeHarnesses, dropConnection, META_KEY } from '../src/launchers.mjs';
import { migrateLaunchers } from '../src/launcher-migrate.mjs';
import { harnessLaunch } from '../src/harness.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p255-'));
const MB = 1048576;
const T0 = 1_700_000_000_000;
// CPU 시간은 100ns 단위(1초 = 1e7)
const S = 1e7;

test('1 treeCpu: 앞 측정과의 차이, 그 사이 새로 뜬 프로세스는 전부, 앞 측정이 없으면 null', () => {
  const before = new Map([[1, { pid: 1, created: T0, cpu: 5 * S }], [2, { pid: 2, created: T0 + 10, cpu: 1 * S }]]);
  const prev = cpuTimes(before);
  const now = [{ pid: 1, created: T0, cpu: 8 * S }, { pid: 2, created: T0 + 10, cpu: 1 * S }, { pid: 3, created: T0 + 40000, cpu: 2 * S }];
  assert.equal(treeCpu(now, prev, T0 + 30000), 5 * S, '3초 + 0 + 새 프로세스 2초');
  assert.equal(treeCpu(now, null, null), null);
  // PID 재사용(생성 시각이 다르다)은 앞 값으로 빼지 않는다. 앞 측정 전에 생긴 낯선 프로세스는 세지 않는다
  assert.equal(treeCpu([{ pid: 1, created: T0 + 5, cpu: 9 * S }], prev, T0 + 30000), 0);
  assert.equal(cpuKey({ pid: 7, created: null }), '7|');
});

test('2 cpuPct·systemCpuPct: 코어 수로 나눈 PC 대비 %, 모르면 null', () => {
  assert.equal(cpuPct(3 * S, 30000, 1), 10);
  assert.equal(cpuPct(3 * S, 30000, 4), 2.5);
  assert.equal(cpuPct(null, 30000, 4), null);
  assert.equal(cpuPct(1, 0, 4), null);
  assert.equal(cpuPct(1000 * S, 1000, 1), 100, '100%를 넘지 않는다');
  const a = [{ times: { user: 100, nice: 0, sys: 100, idle: 800, irq: 0 } }, { times: { user: 0, nice: 0, sys: 0, idle: 1000, irq: 0 } }];
  const b = [{ times: { user: 300, nice: 0, sys: 200, idle: 1300, irq: 0 } }, { times: { user: 100, nice: 0, sys: 0, idle: 1900, irq: 0 } }];
  assert.equal(systemCpuPct(a, b), 22.2); // 바쁜 400 / 전체 1800
  assert.equal(systemCpuPct(a, b.slice(0, 1)), null);
  assert.equal(systemCpuPct(null, b), null);
});

test('3 ResourceMonitor: 첫 측정은 CPU를 모르고, 둘째 측정부터 세션마다·세션들·PC 전체', async () => {
  let n = 0;
  const tables = [
    new Map([[100, { pid: 100, ppid: 1, ws: 10 * MB, name: 'pwsh.exe', created: T0, cpu: 1 * S }], [101, { pid: 101, ppid: 100, ws: 300 * MB, name: 'claude.exe', created: T0 + 5, cpu: 20 * S }], [200, { pid: 200, ppid: 1, ws: 5 * MB, name: 'pwsh.exe', created: T0, cpu: 0 }]]),
    new Map([[100, { pid: 100, ppid: 1, ws: 10 * MB, name: 'pwsh.exe', created: T0, cpu: 1 * S }], [101, { pid: 101, ppid: 100, ws: 300 * MB, name: 'claude.exe', created: T0 + 5, cpu: 26 * S }], [200, { pid: 200, ppid: 1, ws: 5 * MB, name: 'pwsh.exe', created: T0, cpu: 0 }]]),
  ];
  const ats = [T0 + 100000, T0 + 130000];
  const cpus = [
    [{ times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } }, { times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } }],
    [{ times: { user: 3000, nice: 0, sys: 0, idle: 27000, irq: 0 } }, { times: { user: 0, nice: 0, sys: 0, idle: 30000, irq: 0 } }],
  ];
  let c = 0;
  const m = new ResourceMonitor({
    sessions: () => [{ sessionId: 'a', name: 'a', state: 'working', paneId: 'p1' }, { sessionId: 'b', name: 'b', state: 'ready', paneId: 'p2' }],
    processInfo: async (pane) => ({ shell_pid: pane === 'p1' ? 100 : 200, foreground_processes: pane === 'p1' ? [{ pid: 101, name: 'claude.exe' }] : [] }),
    controllers: () => [], readTable: async () => { const i = n++; return { procs: tables[i], at: ats[i] }; }, cpus: () => cpus[c++],
  });
  const s1 = await m.sample();
  assert.deepEqual(s1.cpu, { sessionsPct: null, systemPct: null, cores: 2, spanMs: null });
  assert.equal(s1.sessions[0].cpuPct, null);
  const s2 = await m.sample();
  // 30초 동안 6초 CPU, 코어 둘 → 10%
  assert.equal(s2.sessions[0].cpuPct, 10);
  assert.equal(s2.sessions[1].cpuPct, 0);
  assert.equal(s2.cpu.sessionsPct, 10);
  assert.equal(s2.cpu.systemPct, 5); // 바쁜 3000 / 전체 60000
  assert.equal(s2.cpu.spanMs, 30000);
  assert.equal(s2.sessionsMB, 315, '메모리 셈은 그대로');
});

test('4 연결 걷어 내기: 런처 칸과 하네스 표에 연결이 없고, 옛 연결 참조는 오류 없이 버린다', () => {
  for (const h of describeHarnesses()) { assert.equal(h.fields.includes('connection'), false, h.id); assert.equal('protocols' in h, false, h.id); }
  const l = normalizeLauncher({ name: 'gw', harness: 'claude', connection: 'cdeadbeef00' });
  assert.equal('connection' in l, false);
  const pi = normalizeLauncher({ name: 'pi gw', harness: 'pi', connection: 'cgone', model: 'm1' });
  assert.equal('connection' in pi, false);
  const r = resolveLauncher({ ...l, id: 'l1', connection: 'cdeadbeef00' });
  assert.equal('connectionId' in r, false);
  assert.deepEqual(dropConnection({ id: 'x', connection: 'c1', name: 'n' }), { id: 'x', name: 'n' });
  assert.deepEqual(dropConnection({ id: 'x' }), { id: 'x' });
  // 하네스 실행 값: 옛 연결 값을 주어도 하네스 기본 로그인(제공자 -c·확장 -e 없음)
  const cx = harnessLaunch({ kind: 'codex', sessionId: 'S', model: 'm1', connection: { id: 'c1', name: 'g', protocol: 'openai-responses', baseUrl: 'http://x/v1' } });
  assert.ok(!cx.args.some((a) => /model_provider/.test(a)));
  const oc = harnessLaunch({ kind: 'opencode', sessionId: '00000000-0000-0000-0000-000000000001', model: 'm1' });
  assert.deepEqual(JSON.parse(oc.env.OPENCODE_CONFIG_CONTENT), { model: 'm1' });
});

test('5 옛 판 기록: meta의 연결 목록과 런처의 connection 칸은 읽어도 무시한다(오류 없이)', () => {
  const dir = tmp();
  try {
    const store = new Store(path.join(dir, 'board.db'));
    store.setMeta('connections', { v: 1, items: [{ id: 'cabc', name: 'gw', protocol: 'anthropic-messages', baseUrl: 'http://127.0.0.1:1', auth: { env: 'K', scheme: 'x-api-key' } }] });
    store.setMeta(META_KEY, { v: 2, items: [{ id: 'l1', name: 'GW', harness: 'claude', icon: '', model: '', effort: '', permissionMode: 'manual', args: '', env: {}, command: '', connection: 'cabc' }], favorites: ['l1'] });
    const L = new Launchers({ store });
    const list = L.list();
    assert.equal('connections' in list, false);
    assert.equal('connection' in list.launchers[0], false);
    assert.equal('connection' in L.get('GW'), false);
    // 고쳐 저장하면 사라진다
    L.update({ id: 'l1', patch: { model: 'haiku' } });
    assert.equal('connection' in store.getMeta(META_KEY).items[0], false);
    store.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('6 옮기기(v1 → v2): env의 ANTHROPIC_BASE_URL은 env에 그대로, 연결을 만들지 않는다, 옛 connection 칸은 뺀다', () => {
  const v1 = { v: 1, items: [{ id: 'g', name: 'Gw', harness: 'claude', env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' }, checkUrl: 'http://127.0.0.1:9/healthz' }, { id: 'c', name: 'Cx', harness: 'codex', connection: 'cold' }], favorites: ['g'] };
  const m = migrateLaunchers(v1);
  assert.equal('connections' in m, false);
  assert.deepEqual(m.list.items[0].env, { ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' });
  assert.equal('checkUrl' in m.list.items[0], false);
  assert.equal('connection' in m.list.items[1], false);
  assert.deepEqual(m.report, { keptBaseUrl: ['Gw'], droppedCheckUrl: [] });
});
