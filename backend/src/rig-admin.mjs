// P188·P249: atrium rig(에이전트 명령)와 판 API의 rig 관리.
// - 역할 세션의 명령(put·accept·return·pass·drop·inbox, tune·raise·heard·role, beat·tool)은 rig3-items·rig3-tune·rig3-beat가 받는다.
// - check [파일] | log(읽기만): 그 워크스페이스의 빌더 세션, 그리고 rig가 꺼진(또는 없는) 워크스페이스의 어느 판 세션이든. log --events는 빌더 세션.
// - check: 후보 정의(파일 내용 또는 지금 rig.json)를 적용하지 않고 검사한다. log: 판(버전) 목록.
// - rollback <n>(판 API rig.rollback, 사람만): 판 n의 정의 파일 내용으로 rig.json을 다시 쓴다. 그것도 새 판으로 적힌다(누가: human).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RIG_FILE, validateRig } from './rig.mjs';
import { rigEvent, readEvents, eventLine } from './rig-ledger.mjs'; // P217: 장부
import { RIG3_BEAT_OPS } from './rig3-beat.mjs'; // P244: beat(사람만)·tool(역할의 도구)
import { RIG3_TUNE_OPS } from './rig3-tune.mjs'; // P245: tune·raise·heard(역할)·role(읽기)
import { RIG3_ITEM_OPS } from './rig3-items.mjs'; // P242: put·accept·return·pass·drop·inbox
import { bundleOf } from './rig3.mjs'; // P247: rig check의 same

function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
export const RIG_READ_OPS = ['check', 'log']; // P209: 읽기만(빌더 세션도 쓴다)
export const RIG_ADMIN_OPS = [...RIG_READ_OPS];

export class RigAdmin {
  // b: 백엔드(store, rig, rig3, sessions, log). branch: Branch
  constructor(b, branch) { this.b = b; this.branch = branch; }
  store() { return this.b.store; }
  rig() { if (!this.b.rig) throw apiError('rig_off', 'rig가 없다.'); return this.b.rig; }
  isBuilder(s) { return !!(this.b.rig3 && this.b.rig3.builder && this.b.rig3.builder.isBuilder(s)); } // P247

  // /branch/rig: 에이전트 세션
  async verb(s, o = {}) {
    const op = String(o.op || '');
    if (RIG3_ITEM_OPS.includes(op)) { if (!this.b.rig3 || !this.b.rig3.items) throw apiError('rig3_off', 'rig가 없다.'); return this.b.rig3.items.verb(s, o); } // P242
    if (RIG3_TUNE_OPS.includes(op)) { if (!this.b.rig3 || !this.b.rig3.tune) throw apiError('rig3_off', 'rig가 없다.'); return this.b.rig3.tune.verb(s, o); } // P245
    if (RIG3_BEAT_OPS.includes(op)) { if (!this.b.rig3 || !this.b.rig3.beat) throw apiError('rig3_off', 'rig가 없다.'); return this.b.rig3.beat.verb(s, o); } // P244
    if (!RIG_ADMIN_OPS.includes(op)) throw apiError('bad_request', `atrium rig: ${[...RIG3_ITEM_OPS, ...RIG3_TUNE_OPS, ...RIG3_BEAT_OPS, ...RIG_ADMIN_OPS].join(' | ')} 가운데 하나다: ${op || '(없음)'}`);
    if (!s.workspaceKey) throw apiError('forbidden', `atrium rig ${op}는 워크스페이스의 세션만 쓴다.`);
    const builder = this.isBuilder(s);
    if (op === 'log' && o.events) {
      if (!builder) throw apiError('forbidden', 'atrium rig log --events는 그 워크스페이스의 빌더 세션이 쓴다.');
      return this.events(s.workspaceKey, o);
    }
    const rig = this.rig();
    if (builder || (op === 'check' && !rig.enabled(s.workspaceKey))) return op === 'check' ? this.check(s.workspaceKey, o) : this.log(s.workspaceKey, o);
    throw apiError('forbidden', `atrium rig ${op}는 그 워크스페이스의 빌더 세션이 쓴다(check는 rig가 꺼진 워크스페이스의 어느 세션이든).`);
  }

  // 후보 정의 검사. o.text: 후보 내용(없으면 지금 rig.json). 적용하지 않는다
  check(key, o = {}) {
    const rig = this.rig();
    const root = rig.rootOf(key);
    if (!root) throw apiError('not_found', `워크스페이스를 찾을 수 없다: ${key}`);
    let text = o.text != null ? String(o.text) : null;
    const from = text != null ? (o.file || '(준 내용)') : RIG_FILE;
    if (text == null) { try { text = fs.readFileSync(path.join(root, RIG_FILE), 'utf8'); } catch { return { ok: false, from, reason: `${RIG_FILE}이 없다` }; } }
    const hash = sha(Buffer.from(text, 'utf8'));
    let raw;
    try { raw = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (e) { return { ok: false, from, hash, reason: `JSON이 아니다: ${e.message}` }; }
    const v = validateRig(raw, { root });
    const cur = rig.read(key);
    const c = rig.cache.get(key);
    const base = (c && c.good) || rig.lastGood(key);
    const out = { ok: v.ok, from, hash, current: { n: cur.n ?? null, hash: cur.hash || null }, same: false, warnings: v.ok ? [...(v.def.warnings || [])] : [] };
    if (!v.ok) return { ...out, reason: v.reason };
    const bundle = bundleOf(root, raw, hash).hash; out.bundle = bundle; out.same = !!(base && base.hash === bundle); // P247: 판은 정의·목적·정의서 묶음 해시로 견준다
    const r3 = v.def.rig3;
    return { ...out, summary: { format: 3, purpose: r3.purpose, roles: Object.values(r3.roles).map((r) => ({ name: r.name, owns: r.owns, tools: r.tools, launcher: r.launcher || 'claude', model: r.model })), flows: r3.flows.map((f) => `${f.item}: ${f.from.join('|')} → ${f.to.join('|')}${f.for ? ` (for ${f.for})` : ''}`), tools: Object.keys(r3.tools), beat: r3.beat } }; // P241: 역할·길
  }

  // 장부 읽기(판 API rig.events도 이 길) → { workspace, rows(+shown: 사람이 읽는 한 줄), last, more }
  events(key, o = {}) {
    const x = readEvents(this.b, key, o);
    return { ...x, rows: x.rows.map((r) => ({ ...r, shown: eventLine(r) })) };
  }

  // 판(버전) 목록
  log(key, o = {}) {
    const rig = this.rig(); const st = this.store();
    const cur = rig.read(key);
    const versions = st.rigVersions(key).map((v) => ({ n: v.n, hash: v.hash, t: v.t, by: v.by, note: v.note, current: v.n === cur.n }));
    const limit = Math.min(Math.max(Number(o.limit) || 50, 1), 500);
    return { workspace: key, current: cur.n ?? null, invalid: cur.invalid || null, versions: versions.slice(-limit) };
  }

  // 버전 n의 내용으로 rig.json을 다시 쓴다 → { n(새 버전), from, hash } | 거절
  rollback(key, n, { by = 'human', who = null } = {}) {
    const rig = this.rig(); const st = this.store();
    const want = Number(n);
    if (!Number.isInteger(want) || want < 1) throw apiError('bad_request', `되돌릴 버전 번호를 준다(atrium rig log): ${n}`);
    const x = rig.versionContent(key, want);
    if (!x) throw apiError('not_found', `버전 ${want}이 없다. 버전 목록: atrium rig log`);
    if (!x.buf) throw apiError('not_found', `버전 ${want}의 내용 파일을 읽지 못했다(데이터 폴더 rigs/).`);
    const root = rig.rootOf(key);
    const file = path.join(root, RIG_FILE);
    const before = rig.read(key);
    const hash = sha(x.buf);
    if (before.hash === hash && !before.invalid) return { workspace: key, n: before.n, from: want, hash, unchanged: true };
    // 다음 읽기가 이 내용을 그 누가로 적는다
    rig.pendingBy.set(key, { hash, by, note: `rollback ${want}` });
    const tmp = `${file}.atrium-rollback-${process.pid}`;
    fs.writeFileSync(tmp, x.buf);
    fs.renameSync(tmp, file);
    try { const t = new Date(); fs.utimesSync(file, t, t); } catch {}
    rig.cache.delete(key); // 같은 크기·같은 시각 칸이라도 다시 읽는다(마지막 맞은 정의는 버전 파일에서 다시 얻는다)
    const after = rig.read(key);
    st.addEvent(who ? who.sessionId : null, 'rig_rollback', { workspace: key, from: want, n: after.n, by, ok: after.hash === hash && !after.invalid, reason: after.invalid || null });
    rigEvent(this.b, { kind: 'rig_rollback', ws: key, defN: after.n ?? null, session: who ? who.sessionId : null, value: String(want), actor: 'human', ref: after.n ?? null, text: `버전 ${want}으로 되돌림 → 버전 ${after.n ?? '?'}${after.invalid ? `: ${after.invalid}` : ''}`, data: { from: want, ok: after.hash === hash && !after.invalid } });
    this.b.log && this.b.log(`rig rollback ${key} to #${want} by ${by}${who ? ` (${who.name})` : ''}: now #${after.n}${after.invalid ? ` (${after.invalid})` : ''}`);
    if (after.invalid || after.hash !== hash) {
      rig.pendingBy.delete(key);
      throw apiError('rig_invalid', `버전 ${want}으로 rig.json을 다시 썼지만 보드가 쓰지 않는다: ${after.invalid || '?'}`, { n: after.n });
    }
    return { workspace: key, n: after.n, from: want, hash, by };
  }

}

// 판 API 처리기(backend.mjs handlers에 펼친다). 판 API 토큰으로 붙은 연결(이 PC의 창·사람의 atrium call, auth.kind local)만. rig.events는 보기라 기기 토큰도
export function rigAdminHandlers(b) {
  const local = (c, what) => { if (!c || !c.auth || c.auth.kind !== 'local') throw apiError('forbidden', `${what}는 이 PC의 보드 창이나 사람의 atrium 명령에서만 한다(판 API 토큰).`); };
  const keyOf = async (p) => (await b.resolveWorkspace(p && p.workspace)).key;
  const A = () => b.branch.rigAdmin;
  const done = (r) => { if (b.broadcastWorkspaces) try { b.broadcastWorkspaces(); } catch {} return r; };
  return {
    'rig.check': async (p, c) => { local(c, 'rig check'); return A().check(await keyOf(p), p || {}); },
    'rig.log': async (p, c) => { local(c, 'rig log'); return A().log(await keyOf(p), p || {}); },
    'rig.rollback': async (p, c) => { local(c, 'rig rollback'); return done(A().rollback(await keyOf(p), p && p.n, { by: 'human' })); },
    'rig.events': async (p) => A().events(await keyOf(p), { since: p && p.since, kinds: p && p.kinds, limit: p && p.limit }), // P217: 장부 읽기
  };
}
