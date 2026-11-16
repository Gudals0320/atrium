// 판이 띄우는 세션·터미널에 비밀 변수(SONIOX_API_KEY와 ATRIUM_ENV_DENY의 이름)를 넘기지 않는다
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanEnv, envDenyList, stripDenied, DEFAULT_ENV_DENY } from '../src/proc-env.mjs';
import { coreEnv } from '../src/hc/core.mjs';
import { terminalEnv } from '../src/hc/model.mjs';

test('envDenyList: 기본은 SONIOX_API_KEY, ATRIUM_ENV_DENY(쉼표)를 더한다', () => {
  assert.deepEqual(DEFAULT_ENV_DENY, ['SONIOX_API_KEY']);
  assert.deepEqual(envDenyList({}), ['SONIOX_API_KEY']);
  assert.deepEqual(envDenyList({ ATRIUM_ENV_DENY: ' foo_key, BAR ,,SONIOX_API_KEY' }), ['SONIOX_API_KEY', 'FOO_KEY', 'BAR']);
  assert.deepEqual(envDenyList({ MTASK_ENV_DENY: 'old' }), ['SONIOX_API_KEY', 'OLD']);
});

test('stripDenied: 대소문자를 가리지 않고 뺀다', () => {
  assert.deepEqual(stripDenied({ soniox_api_key: 'x', PATH: 'p' }, ['SONIOX_API_KEY']), { PATH: 'p' });
});

test('cleanEnv·coreEnv: 거부 목록의 변수를 뺀다(코어 env를 터미널 프로그램이 물려받는다)', () => {
  const base = { PATH: 'p', SONIOX_API_KEY: 'secret', OTHER_KEY: 'o', KEEP: 'k', ATRIUM_ENV_DENY: 'OTHER_KEY' };
  assert.deepEqual(cleanEnv(base), { PATH: 'p', KEEP: 'k' });
  const ce = coreEnv(base, { session: 's', configHome: 'C:\\cfg' });
  assert.equal('SONIOX_API_KEY' in ce, false);
  assert.equal('OTHER_KEY' in ce, false);
  assert.equal(ce.KEEP, 'k');
});

test('terminalEnv: 거부 목록은 빈 값으로 덮고 extra로도 넘기지 않는다', () => {
  const e = terminalEnv({ extra: { SONIOX_API_KEY: 'secret', FOO: 1 }, deny: ['SONIOX_API_KEY'] });
  assert.equal(e.SONIOX_API_KEY, '');
  assert.equal(e.FOO, '1');
  assert.equal('SONIOX_API_KEY' in terminalEnv({ extra: { FOO: 1 } }), false);
});
