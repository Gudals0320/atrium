// P282: /web/me가 싣는 화면 빌드 표식(web.mjs shellBuild)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shellBuild } from '../src/web.mjs';

test('shellBuild: dist/build.json의 표식, 바뀌면 다시 읽고, 없거나 깨졌으면 null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p282-'));
  try {
    assert.equal(shellBuild(dir), null);
    fs.writeFileSync(path.join(dir, 'build.json'), JSON.stringify({ build: '0123456789abcdef' }));
    assert.equal(shellBuild(dir), '0123456789abcdef');
    fs.writeFileSync(path.join(dir, 'build.json'), JSON.stringify({ build: 'fedcba98765432100' }));
    assert.equal(shellBuild(dir), 'fedcba98765432100');
    fs.writeFileSync(path.join(dir, 'build.json'), '{"build":"<x>"}');
    assert.equal(shellBuild(dir), null);
    fs.writeFileSync(path.join(dir, 'build.json'), 'not json');
    assert.equal(shellBuild(dir), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
