// P123: herdr-core(hc) 판의 업데이트 확인. 업데이터가 지금 도는 터미널 서버의 프로토콜을 새 버전의 herdr 프로토콜에서만 찾아,
// hc 판(세대 1)은 "herdr 프로토콜 1을 받지 않음(22)"으로 업데이트하지 못했다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as U from '../src/update.mjs';
import { Updater } from '../src/updater.mjs';
import { HERDR_PROTOCOLS } from '../src/config.mjs';
import { HC_PIN } from '../src/hc/pin.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `mtask-p123-${p}-`));
const rm = (d) => fs.rmSync(d, { recursive: true, force: true });
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const ready = (d) => { write(path.join(d, 'app', 'dist', 'index.html'), ''); write(U.electronExe(d), ''); write(path.join(d, 'backend', 'node_modules', 'ws', 'index.js'), ''); };
const verifyOut = (d, o) => write(path.join(d, 'backend', 'src', 'update-verify.mjs'), `console.log(JSON.stringify(${JSON.stringify(o)}));\n`);

test('미리 보기 출력: herdr 프로토콜과 hc 세대를 따로 내고, 옛 업데이터를 위해 protocols에 둘 다 둔다', () => {
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(HERE, '..', 'src', 'update-verify.mjs')], { cwd: path.join(HERE, '..'), encoding: 'utf8', timeout: 60000 });
  const info = JSON.parse(r.stdout.trim().split(/\r?\n/).pop());
  assert.deepEqual(info.problems, []);
  assert.deepEqual(info.herdrProtocols, HERDR_PROTOCOLS);
  assert.deepEqual(info.hcGenerations, [HC_PIN.generation]);
  // 0.1.6까지의 업데이터 판정(`info.protocols.includes(protocol)`)이 herdr 판(22)과 hc 판(1) 둘 다 통과한다
  for (const p of [...HERDR_PROTOCOLS, HC_PIN.generation]) assert.ok(info.protocols.includes(p), `protocols에 ${p}`);
});

test('verifyRoot: hc 판은 hc 세대에서, herdr 판은 herdr 프로토콜에서 찾는다', async () => {
  const d = tmp('verify');
  try {
    ready(d);
    verifyOut(d, { version: '0.1.7', protocols: [22, 1], herdrProtocols: [22], hcGenerations: [1], problems: [] });
    assert.equal((await U.verifyRoot(d, { protocol: 1, terminal: 'hc' })).ok, true);
    assert.equal((await U.verifyRoot(d, { protocol: 22, terminal: 'herdr' })).ok, true);
    // herdr 판에 프로토콜 1은 hc 세대와 섞지 않는다
    let v = await U.verifyRoot(d, { protocol: 1, terminal: 'herdr' });
    assert.equal(v.ok, false); assert.ok(v.problems.some((p) => /herdr 프로토콜 1/.test(p)));
    v = await U.verifyRoot(d, { protocol: 2, terminal: 'hc' });
    assert.equal(v.ok, false); assert.ok(v.problems.some((p) => /herdr-core 세대 2/.test(p)));
    // hc를 모르는 옛 버전(세대 목록 없음)으로는 hc 판을 바꾸지 않는다
    verifyOut(d, { version: '0.1.5', protocols: [22], problems: [] });
    v = await U.verifyRoot(d, { protocol: 1, terminal: 'hc' });
    assert.equal(v.ok, false); assert.ok(v.problems.some((p) => /herdr-core를 모르는/.test(p)));
    // herdr 판은 새 칸이 없는 버전도 protocols로 본다(지금과 같다)
    assert.equal((await U.verifyRoot(d, { protocol: 22 })).ok, true);
  } finally { rm(d); }
});

test('업데이터: hc 판이면 준비에 terminal hc를 넘긴다', async () => {
  const d = tmp('up');
  const inst = path.join(d, 'versions');
  const codeRoot = path.join(inst, 'v0.1.6');
  write(path.join(codeRoot, 'backend', 'package.json'), JSON.stringify({ version: '0.1.6' }));
  write(path.join(codeRoot, 'app', 'package.json'), JSON.stringify({ version: '0.1.6' }));
  write(path.join(inst, 'current.json'), JSON.stringify({ current: 'v0.1.6' }));
  const meta = new Map();
  const b = {
    cfg: { profile: 'real', logDir: path.join(d, 'logs') }, herdrCompat: { ok: true, protocol: 1 }, adapter: { backend: 'hc' }, features: null,
    store: { getMeta: (k) => (meta.has(k) ? JSON.parse(JSON.stringify(meta.get(k))) : null), setMeta: (k, v) => meta.set(k, JSON.parse(JSON.stringify(v))), addEvent() {} },
    api: { broadcast() {} }, stop: async () => {},
  };
  const prepared = [];
  try {
    const up = new Updater(b, {
      env: { ATRIUM_INSTALL_DIR: inst }, codeRoot, timers: false, leaveWaitMs: 50,
      fetchJson: async () => ({ tag_name: 'v0.1.7', prerelease: false, draft: false, tarball_url: 'https://api.github.com/repos/Gudals0320/atrium/tarball/v0.1.7', html_url: 'https://github.com/Gudals0320/atrium/releases/tag/v0.1.7', published_at: new Date().toISOString(), body: '' }),
      prepare: async ({ release: rel, protocol, terminal }) => { prepared.push({ tag: rel.tag, protocol, terminal }); throw new Error('stop here'); },
      spawnSwap: () => {}, exit: () => {},
    });
    await up.check('timer');
    await up.handlers['update.apply']({ confirm: true }, { auth: { kind: 'local' } });
    const end = Date.now() + 3000; while (!prepared.length && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(prepared, [{ tag: 'v0.1.7', protocol: 1, terminal: 'hc' }]);
  } finally { rm(d); }
});
