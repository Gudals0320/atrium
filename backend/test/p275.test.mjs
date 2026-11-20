// P275 단위 시험: 업데이트·설치가 띄우는 자식(npm 등)의 환경에서 판이 터미널에서 지우는 비밀을 뺀다(update.mjs childEnv·run).
// 가짜 값만 쓴다. 실제 키·실제 설치 폴더는 쓰지 않는다
import test from 'node:test';
import assert from 'node:assert/strict';
import { childEnv, cleanEnv, run } from '../src/update.mjs';
import { cleanEnv as termEnv } from '../src/proc-env.mjs';

const FAKE = 'fake-value-for-test';
const base = () => ({
  PATH: 'C:\\bin', Path: 'C:\\bin', SystemRoot: 'C:\\Windows', USERPROFILE: 'C:\\Users\\u', APPDATA: 'C:\\Users\\u\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', TEMP: 'C:\\t',
  HTTPS_PROXY: 'http://proxy.invalid:8080', HTTP_PROXY: 'http://proxy.invalid:8080', NO_PROXY: 'localhost', npm_config_registry: 'https://registry.invalid/', NODE_EXTRA_CA_CERTS: 'C:\\ca.pem',
  SONIOX_API_KEY: FAKE, QA_PRIVATE_KEY: FAKE, qa_other_secret: FAKE, ATRIUM_ENV_DENY: 'QA_PRIVATE_KEY, QA_OTHER_SECRET', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', ELECTRON_RUN_AS_NODE: '1',
});

test('P275 childEnv: 비밀(SONIOX_API_KEY, ATRIUM_ENV_DENY의 이름, 대소문자 무관)과 목록 변수를 빼고 npm에 필요한 env는 남긴다', () => {
  const e = childEnv(base());
  for (const k of ['SONIOX_API_KEY', 'QA_PRIVATE_KEY', 'qa_other_secret', 'ATRIUM_ENV_DENY', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'ELECTRON_RUN_AS_NODE']) assert.equal(k in e, false, k);
  for (const k of ['PATH', 'Path', 'SystemRoot', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'npm_config_registry', 'NODE_EXTRA_CA_CERTS']) assert.equal(e[k], base()[k], k);
  assert.equal(Object.values(e).includes(FAKE), false);
  // 옛 이름 MTASK_ENV_DENY도 읽고 뺀다
  const old = childEnv({ PATH: 'x', MTASK_ENV_DENY: 'OLD_KEY', OLD_KEY: FAKE });
  assert.deepEqual(old, { PATH: 'x' });
});

test('P275 터미널 거르기와 같은 비밀을 뺀다(터미널 env에 없는 비밀은 업데이트 자식에도 없다)', () => {
  const t = termEnv(base()); const u = childEnv(base());
  for (const k of ['SONIOX_API_KEY', 'QA_PRIVATE_KEY', 'qa_other_secret']) { assert.equal(k in t, false); assert.equal(k in u, false); }
});

test('P275 바꾸기·다시 띄우기(판 자신)의 cleanEnv는 판의 키와 목록을 지닌다(음성 입력, 새 판의 거르기)', () => {
  const e = cleanEnv(base());
  assert.equal(e.SONIOX_API_KEY, FAKE);
  assert.equal(e.ATRIUM_ENV_DENY, base().ATRIUM_ENV_DENY);
  assert.equal('ELECTRON_RUN_AS_NODE' in e, false);
});

test('P275 run(npm·설치가 쓰는 길)이 띄운 자식 프로세스의 env에 비밀이 없다(가짜 값)', async () => {
  const keep = { ...process.env };
  try {
    Object.assign(process.env, { SONIOX_API_KEY: FAKE, QA_PRIVATE_KEY: FAKE, ATRIUM_ENV_DENY: 'QA_PRIVATE_KEY', HTTPS_PROXY: 'http://proxy.invalid:8080', npm_config_registry: 'https://registry.invalid/' });
    const r = await run(process.execPath, ['-e', 'console.log(JSON.stringify(Object.keys(process.env)))'], { timeoutMs: 20000 });
    const keys = JSON.parse(r.out.trim().split(/\r?\n/).pop()).map((k) => k.toUpperCase());
    for (const k of ['SONIOX_API_KEY', 'QA_PRIVATE_KEY', 'ATRIUM_ENV_DENY']) assert.equal(keys.includes(k), false, k);
    for (const k of ['PATH', 'HTTPS_PROXY', 'NPM_CONFIG_REGISTRY']) assert.equal(keys.includes(k), true, k);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k];
    Object.assign(process.env, keep);
  }
});
