// P330: 런처 틀의 하네스 계약 안내·겹침·바꾸기 권함·점검 줄(lib/launchers.js contractView, checkRows)과 두 사전의 키
import test from 'node:test';
import assert from 'node:assert/strict';
import { contractView, checkRows } from '../src/renderer/lib/launchers.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const codex = { hint: { id: 'codex', source: 'codex', modelVia: 'arg', modelHow: '-m <model>', effortVia: 'config', effortHow: '-c model_reasoning_effort="<v>"', efforts: ['low', 'high'], approval: [], approvalVia: 'table' }, overlaps: [{ arg: '--approve-for-me', field: 'permissionMode', value: 'auto', ok: true, movable: true }, { arg: '--effort ultra', field: 'effort', value: 'ultra', ok: false, movable: false }], unknown: ['--wat'], rejected: [] };

test('P330 contractView: 칸 안내 세 줄, 겹침(옮길 수 있음·값 밖·모르는 인자), 목록 표시', () => {
  const v = contractView(codex);
  assert.deepEqual(v.hint.map((h) => h.key), ['launcherContract.model', 'launcherContract.effort', 'launcherContract.approvalEmpty']);
  assert.equal(v.hint[0].vars.sourceKey, 'launcherContract.source_codex');
  assert.deepEqual(v.overlaps.map((o) => [o.key, o.tone]), [['launcherContract.overlap', 'warn'], ['launcherContract.overlapBad', 'bad'], ['launcherContract.unknown', 'warn']]);
  assert.equal(v.movable, true); assert.equal(v.flag, true);
  const conv = contractView({ convert: { harness: 'dsh', startCommand: '' } });
  assert.deepEqual(conv.convert, { harness: 'dsh', startCommand: '' }); assert.equal(conv.flag, true);
  const hermes = contractView({ hint: { source: 'hermes', modelHow: '-m <model>', effortVia: 'slash', effortHow: '/reasoning <v>', efforts: ['low'], approval: ['--yolo'], approvalVia: 'table' }, overlaps: [], unknown: [], rejected: [{ arg: '--reasoning', why: 'effortNotArg' }] });
  assert.deepEqual(hermes.hint.map((h) => h.key), ['launcherContract.model', 'launcherContract.effortSlash', 'launcherContract.approval']);
  assert.deepEqual(hermes.overlaps.map((o) => o.key), ['launcherContract.rejected_effortNotArg']); assert.equal(hermes.flag, true);
  const dsh = contractView({ hint: { source: 'dsh', modelHow: '/model', effortVia: 'slash', effortHow: '/effort', efforts: [], approval: null, approvalVia: 'none' }, overlaps: [], unknown: [], rejected: [] });
  assert.deepEqual(dsh.hint.map((h) => h.key), ['launcherContract.model', 'launcherContract.effortInside', 'launcherContract.approvalNone']); assert.equal(dsh.flag, false);
  assert.deepEqual(contractView(null), { hint: [], overlaps: [], movable: false, convert: null, flag: false });
});

test('P330 checkRows: 판 줄, 있는 인자·없는 인자, 못 찾음', () => {
  assert.deepEqual(checkRows({ ok: false, command: 'codex', version: 'codex-cli 0.167.2', flags: [{ flag: '-c', ok: true }, { flag: '--approve-for-me', ok: false }] }).map((r) => [r.key, r.tone]), [['launcherCheck.version', 'ok'], ['launcherCheck.flagOk', 'ok'], ['launcherCheck.flagMissing', 'bad']]);
  assert.deepEqual(checkRows({ ok: false, error: 'notFound', command: 'omh' }).map((r) => r.key), ['launcherCheck.err_notFound']);
  assert.deepEqual(checkRows(null), []);
});

test('P330 두 사전에 같은 키(launcherContract·launcherCheck)', () => {
  for (const sec of ['launcherContract', 'launcherCheck']) {
    assert.ok(en[sec] && ko[sec], sec);
    assert.deepEqual(Object.keys(ko[sec]).sort(), Object.keys(en[sec]).sort(), sec);
  }
  for (const s of ['claude', 'codex', 'agy', 'pi', 'opencode', 'dsh', 'hermes']) assert.ok(ko.launcherContract['source_' + s] && en.launcherContract['source_' + s], s);
  for (const e of ['notFound', 'timeout', 'failed']) assert.ok(ko.launcherCheck['err_' + e], e);
});
