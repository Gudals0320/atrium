// P182·P241·P249: rig(작업 조직 정의). 정의는 워크스페이스 뿌리(본 체크아웃, workspaces.root)의 .atrium/rig.json이고 꼴은 version 3(역할 조직)이다.
// - 검사는 rig3.mjs validateRigDef. version이 3이 아닌 옛 꼴(version 2 이하, version 없음)은 한 줄 오류다(옮기는 도구 없음, P249).
// - 켜기는 사람만(판 API rig.enable·rig.disable, workspaces.rig_enabled). 켜면 역할 세션을 띄우고 끄면 재운다(rig-roles.mjs).
// - 읽기: 부를 때마다 파일 수정 시각·크기(그리고 목적·정의서 묶음)로 캐시하고 바뀌면 다시 읽어 검사한다. 잘못된 정의는 마지막으로 맞았던 정의를 그대로 쓰고
//   판 이벤트 rig_invalid(까닭)를 한 번 남긴다(같은 내용이면 다시 남기지 않는다). atrium guide와 rig.status가 그 까닭을 보인다.
// - 판(버전): 켜진 rig의 정의·목적·정의서 묶음 해시가 바뀌면 rig_versions에 새 판을 적고 정의 파일을 데이터 폴더 rigs/에 남긴다. 되돌리기는 rig-admin.mjs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { rigEvent } from './rig-ledger.mjs'; // P217: 장부
import { validateRigDef, rigGuide, bundleSig, bundleOf, partLabel, bundleMtime } from './rig-def.mjs'; // P241

export const RIG_FILE = '.atrium/rig.json';
const RIG_MAX_BYTES = 1024 * 1024;
function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// P249: 옛 꼴 정의(rig 1·2)의 한 줄 오류
export const oldRigReason = (v) => `옛 rig 정의(version ${v == null ? '없음' : JSON.stringify(v)})는 더 읽지 않는다. rig 정의는 version 3(역할 조직)만 쓴다. 보드의 영역 메뉴에서 "빌더에게 말하기"로 다시 짓는다`;
// 정의를 검사하고 고른 모양으로 → { ok: true, def } | { ok: false, reason }
export function validateRig(raw, { root = null, exists } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: '정의는 JSON 객체여야 한다' };
  if (raw.version !== 3) return { ok: false, reason: oldRigReason(raw.version) };
  return validateRigDef(raw, { root, ...(exists ? { exists } : {}) });
}

// 데이터 폴더 rigs/ 아래 워크스페이스 폴더 이름
export const rigDirName = (key) => `${String(key).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(-60) || 'ws'}-${sha(String(key)).slice(0, 8)}`;

export class Rig {
  // b: 백엔드(store, sessions, rig3, log)
  constructor(b) {
    this.b = b;
    this.cache = new Map(); // 워크스페이스 키 → { sig, hash, def, invalid, good: { def, hash, raw, n } | null, noted }
    this.pendingBy = new Map(); // P188: 워크스페이스 키 → { hash, by, note }(되돌리기가 다시 쓴 내용을 다음 읽기가 그 누가로 적는다)
    this.versionDefs = new Map(); // P188: `${키}|${n}` → { def, hash, raw, n }
  }
  store() { return this.b.store; }
  rootOf(key) { const w = key ? this.store().getWorkspace(key) : null; return w ? w.root : null; }
  fileOf(key) { const r = this.rootOf(key); return r ? path.join(r, RIG_FILE) : null; }
  enabled(key) { const st = key && this.store().rigState ? this.store().rigState(key) : null; return !!(st && st.enabled); }

  // 정의 읽기(수정 시각·크기 캐시). → { present, def(쓸 정의: 맞은 것 또는 마지막 맞은 것), hash, invalid(지금 파일의 잘못 까닭 | null), file, root }
  read(key) {
    const root = this.rootOf(key); const file = root ? path.join(root, RIG_FILE) : null;
    if (!file) return { present: false, def: null, hash: null, invalid: null, file: null, root: null };
    let stat = null;
    try { stat = fs.statSync(file); } catch { stat = null; }
    const c = this.cache.get(key) || { sig: null, good: null };
    if (!stat || !stat.isFile()) { this.cache.set(key, { ...c, sig: null, def: null, hash: null, invalid: null }); return { present: false, def: null, hash: null, invalid: null, file, root }; }
    const on = this.enabled(key); // P188: 버전과 보호는 켜진 rig만(꺼진 워크스페이스는 지금과 같다). 켜면 다시 읽어 남긴다
    const sig0 = `${stat.mtimeMs}:${stat.size}:${on ? 1 : 0}`;
    const sig = c.v3raw ? `${sig0}|${bundleSig(root, c.v3raw)}` : sig0; // P245: v3은 목적·정의서도 본다(정의서만 바뀌어도 다시 검사)
    if (c.sig !== sig) {
      let next; let v3raw = null;
      try {
        if (stat.size > RIG_MAX_BYTES) throw new Error(`파일이 너무 크다(${stat.size}바이트)`);
        const buf = fs.readFileSync(file);
        let hash = sha(buf);
        let raw;
        try { raw = JSON.parse(buf.toString('utf8').replace(/^﻿/, '')); } catch (e) { throw Object.assign(new Error(`JSON이 아니다: ${e.message}`), { hash }); }
        if (raw && raw.version === 3) v3raw = raw;
        const v = validateRig(raw, { root });
        if (!v.ok) throw Object.assign(new Error(v.reason), { hash });
        // P245: v3의 판(버전) = 정의·목적·모든 정의서의 해시 묶음
        const bundle = bundleOf(root, raw, hash);
        if (bundle) hash = bundle.hash;
        // P188: 새 해시면 버전(판)으로 남긴다
        const a = on ? this.adopt(key, { buf, hash, raw, def: v.def, mtimeMs: bundleMtime(root, raw, stat.mtimeMs), parts: bundle.parts }) : { ok: true, n: null };
        next = { sig: v3raw ? `${sig0}|${bundleSig(root, v3raw)}` : sig0, v3raw, hash, def: v.def, invalid: null, good: { def: v.def, hash, raw, n: a.n } };
      } catch (e) {
        const good = c.good || this.lastGood(key);
        next = { sig: v3raw ? `${sig0}|${bundleSig(root, v3raw)}` : sig0, v3raw, hash: good ? good.hash : null, def: good ? good.def : null, invalid: e.message, badHash: e.hash || null, good };
        const mark = `${e.hash || sig}:${e.message}`;
        if (c.noted !== mark) {
          next.noted = mark;
          try { this.store().addEvent(null, 'rig_invalid', { workspace: key, reason: e.message, hash: e.hash || null, usingHash: good ? good.hash : null }); } catch {}
          rigEvent(this.b, { kind: 'rig_invalid', ws: key, defN: good ? good.n ?? null : null, actor: 'board', text: e.message, data: { hash: e.hash || null, usingHash: good ? good.hash : null } });
          this.b.log && this.b.log(`rig_invalid ${key}: ${e.message}${good ? ' (using last good)' : ''}`);
        } else next.noted = c.noted;
      }
      this.cache.set(key, next);
    }
    const x = this.cache.get(key);
    return { present: true, def: x.def, hash: x.hash, invalid: x.invalid, file, root, n: x.good ? x.good.n ?? null : null };
  }


  // ---------- P188: 버전 ----------
  dataDir() { return this.b.cfg && this.b.cfg.dataDir ? this.b.cfg.dataDir : null; }
  versionPath(key, n, hash) { const d = this.dataDir(); return d ? path.join(d, 'rigs', rigDirName(key), `${n}-${hash}.json`) : null; }
  // 맞는 정의의 새 해시 → { ok, n } | { ok: false, reason, hits, fallback }
  adopt(key, { buf, hash, raw, def, mtimeMs, parts = null }) {
    const st = this.store();
    if (!st.lastRigVersion) return { ok: true, n: null };
    const last = st.lastRigVersion(key);
    if (last && last.hash === hash) return { ok: true, n: last.n };
    const base = this.lastGood(key);
    const pend = this.pendingBy.get(key);
    const by = pend && pend.hash === hash ? pend.by : this.byOf(key, mtimeMs);
    const note = pend && pend.hash === hash ? pend.note || null : !last ? 'first' : null;
    if (pend && pend.hash === hash) this.pendingBy.delete(key);
    const n = st.insertRigVersion({ workspaceKey: key, hash, by, note });
    const f = this.versionPath(key, n, hash);
    if (f) {
      try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); st.setRigVersionFile(key, n, path.relative(this.dataDir(), f).split(path.sep).join('/')); }
      catch (e) { this.b.log && this.b.log(`rig version file ${key} ${n}: ${e.message}`); }
    }
    this.versionDefs.set(`${key}|${n}`, { def, hash, raw, n });
    // P245: v3은 묶음 조각(정의·목적·정의서)의 해시와 내용을 판에 남기고, 그 판에서 바뀐 조각을 장부에 적는다
    let changed = null;
    if (parts && st.setRig3Bundle) { const was = last && st.rig3Bundle ? st.rig3Bundle(key, last.n) : {}; st.setRig3Bundle(key, n, parts); changed = last && Object.keys(was).length ? parts.filter((p) => was[p.part] !== p.sha).map((p) => p.part) : null; }
    try { st.addEvent(null, 'rig_version', { workspace: key, n, hash, by, note }); } catch {}
    rigEvent(this.b, { kind: 'rig_version', ws: key, defN: n, actor: String(by).startsWith('role:') ? 'agent' : by === 'human' ? 'human' : 'board', ref: n, text: `버전 ${n} ${hash.slice(0, 12)} · ${by}${note ? ` · ${note}` : ''}${changed && changed.length ? ` · 바뀐 것: ${changed.map(partLabel).join(', ')}` : ''}`, data: { changed_by: by, hash, note, ...(parts ? { changed } : {}) } });
    this.b.log && this.b.log(`rig version ${key} #${n} ${hash.slice(0, 12)} by ${by}`);
    if (parts && this.b.rig3 && this.b.rig3.onVersion) try { this.b.rig3.onVersion(key, { n, by, note, changed, prev: base ? base.def : null, def }); } catch (e) { this.b.log && this.b.log('rig3 onVersion ' + e.message); } // P247: 떠 있는 역할에게 정의서 바뀜 알림·다시 띄울 표시
    return { ok: true, n };
  }
  // 누가 바꿨나: 파일 수정 시각에 빌더 세션이 일하던 중이면 builder, 아니면 unknown(사람의 되돌리기는 pendingBy로 human)
  byOf(key, mtimeMs) {
    if (this.b.rig3 && this.b.rig3.builder && this.b.rig3.builder.wroteAt(key, mtimeMs)) return 'builder'; // P247
    return 'unknown';
  }
  // 판이 아는 쓰기(빌더 세션이 쓴 정의, 되돌리기)가 쓴 rig.json을 켜짐과 상관없이 지금 판으로 남긴다(누가 by).
  //   꺼진 rig는 read()가 버전을 남기지 않으므로(P188) 여기서 남긴다. 같은 해시면 그 버전. → { ok, n } | { ok: false, reason, hits? }
  recordNow(key, { by = 'human', note = null } = {}) {
    const root = this.rootOf(key); const file = root ? path.join(root, RIG_FILE) : null;
    if (!file) return { ok: false, reason: '워크스페이스가 없다' };
    let buf; try { buf = fs.readFileSync(file); } catch { return { ok: false, reason: `${RIG_FILE}이 없다` }; }
    let hash = sha(buf);
    let raw; try { raw = JSON.parse(buf.toString('utf8').replace(/^﻿/, '')); } catch (e) { return { ok: false, reason: `JSON이 아니다: ${e.message}` }; }
    const v = validateRig(raw, { root });
    if (!v.ok) return { ok: false, reason: v.reason };
    const bundle = bundleOf(root, raw, hash); // P245: 판은 묶음 해시
    hash = bundle.hash;
    let mtimeMs = Date.now(); try { mtimeMs = fs.statSync(file).mtimeMs; } catch {}
    mtimeMs = bundleMtime(root, raw, mtimeMs); // P247
    this.pendingBy.set(key, { hash, by, note });
    const a = this.adopt(key, { buf, hash, raw, def: v.def, mtimeMs, parts: bundle.parts });
    if (this.pendingBy.get(key) && this.pendingBy.get(key).hash === hash && a.ok) this.pendingBy.delete(key);
    this.cache.delete(key); // 다음 읽기가 다시 본다(켜진 rig는 같은 해시라 같은 버전)
    return a;
  }
  // 마지막으로 남긴 버전(프로세스가 다시 뜬 뒤 기준) → { def, hash, raw, n } | null
  lastGood(key) {
    const st = this.store();
    const last = st.lastRigVersion ? st.lastRigVersion(key) : null;
    return last ? this.loadVersion(key, last) : null;
  }
  loadVersion(key, row) {
    const k = `${key}|${row.n}`;
    if (this.versionDefs.has(k)) return this.versionDefs.get(k);
    const d = this.dataDir();
    if (!d || !row.file) return null;
    try {
      const buf = fs.readFileSync(path.join(d, row.file));
      const raw = JSON.parse(buf.toString('utf8').replace(/^\uFEFF/, ''));
      const v = validateRig(raw, { root: this.rootOf(key) });
      if (!v.ok) return null;
      const x = { def: v.def, hash: row.hash, raw, n: row.n };
      this.versionDefs.set(k, x);
      return x;
    } catch { return null; }
  }
  currentN(key) { const r = this.read(key); return r.n ?? null; }
  // P217: 장부 줄의 지금 버전(정의를 새로 읽지 않는다: 읽기가 rig_version을 다시 부르지 않게)
  cachedN(key) { const c = this.cache.get(key); if (c && c.good && c.good.n != null) return c.good.n; const v = this.store().lastRigVersion ? this.store().lastRigVersion(key) : null; return v ? v.n : null; }
  versionContent(key, n) {
    const row = this.store().rigVersion(key, n);
    if (!row) return null;
    const d = this.dataDir();
    try { return { row, buf: fs.readFileSync(path.join(d, row.file)) }; } catch { return { row, buf: null }; }
  }

  // P195: 워크스페이스 키가 바뀌었다(폴더가 저장소가 됨, workspace-merge-ops.mjs). 표는 store.rekeyWorkspace가 옮겼고
  //   여기서는 데이터 폴더 rigs/<옛 폴더>/의 버전 파일을 새 폴더로 옮기고 경로를 고치며, 옛 키의 기억을 버린다. → 옮긴 파일 수
  rekey(from, to) {
    let moved = 0;
    const d = this.dataDir();
    const a = rigDirName(from), z = rigDirName(to);
    if (d && a !== z) {
      const src = path.join(d, 'rigs', a), dst = path.join(d, 'rigs', z);
      try {
        if (fs.existsSync(src)) {
          fs.mkdirSync(dst, { recursive: true });
          for (const f of fs.readdirSync(src)) {
            const t = path.join(dst, f);
            if (fs.existsSync(t)) continue; // 대상에 같은 이름이 있으면(번호를 민 버전도 옛 파일 이름 그대로라 겹치지 않는다) 그대로 둔다
            fs.renameSync(path.join(src, f), t); moved++;
          }
          try { fs.rmdirSync(src); } catch {}
        }
      } catch (e) { this.b.log && this.b.log(`rig rekey files ${from} → ${to}: ${e.message}`); }
      if (this.store().retargetRigVersionFiles) this.store().retargetRigVersionFiles(to, `rigs/${a}/`, `rigs/${z}/`);
    }
    for (const m of [this.cache, this.pendingBy]) { m.delete(from); m.delete(to); }
    for (const k of [...this.versionDefs.keys()]) if (k.startsWith(`${from}|`) || k.startsWith(`${to}|`)) this.versionDefs.delete(k);
    return moved;
  }

  // 켜졌고 쓸 정의가 있으면 그 읽기 결과, 아니면 null
  active(key) {
    if (!key || !this.enabled(key)) return null;
    const r = this.read(key);
    return r.present && r.def ? r : null;
  }
  activeForSession(sessionId) { const s = this.b.sessions.get(sessionId); return s ? this.active(s.workspaceKey) : null; }

  // ---------- 판 API(사람) ----------
  status(key) {
    const w = this.store().getWorkspace(key);
    if (!w) throw apiError('not_found', `워크스페이스를 찾을 수 없다: ${key}`);
    const st = this.store().rigState(key) || {};
    const r = this.read(key);
    const def = r.def;
    return {
      workspace: key, root: w.root, file: RIG_FILE, enabled: !!st.enabled, enabledAt: st.enabledAt ?? null,
      present: r.present, valid: r.present && !r.invalid, invalid: r.invalid, hash: r.hash, usingLastGood: !!(r.invalid && def),
      state: !r.present ? 'none' : !def ? 'invalid' : st.enabled ? 'on' : 'off', // invalid가 있고 def도 있으면 마지막 맞은 정의를 쓰는 중
      name: def ? def.name : null, format: def ? def.version : null, version: r.n ?? null, warnings: def ? def.warnings || [] : [],
      rig3: def && this.b.rig3 ? this.b.rig3.view(key, def) : null, // P241: 역할(읽기만 하는 구조 보기)
    };
  }
  // 창의 rig 판(rig.get): 상태 + 정의 원문 + 빌더 세션
  get(key) {
    const s0 = this.status(key);
    let definition = null;
    if (s0.present) { try { definition = JSON.parse(fs.readFileSync(path.join(s0.root, RIG_FILE), 'utf8').replace(/^\uFEFF/, '')); } catch { definition = null; } }
    const last = this.store().lastRigVersion ? this.store().lastRigVersion(key) : null;
    const versionN = s0.version ?? (last && s0.hash && last.hash === s0.hash ? last.n : null);
    return {
      workspace: key, root: s0.root, file: RIG_FILE, status: s0.state, enabled: s0.enabled, why: s0.invalid || null, usingLastGood: s0.usingLastGood,
      definition, hash: s0.hash, versionN, warnings: s0.warnings, format: s0.format, rig3: s0.rig3 || null,
      builder3: this.b.rig3 && this.b.rig3.builder ? this.b.rig3.builder.view(key) : null, // P247: 빌더 세션(rig가 없는 워크스페이스에서도)
    };
  }
  setEnabled(key, on, by = 'human') {
    const w = this.store().getWorkspace(key);
    if (!w) throw apiError('not_found', `워크스페이스를 찾을 수 없다: ${key}`);
    const was = this.enabled(key);
    this.store().setRigEnabled(key, !!on);
    const r = this.read(key);
    this.store().addEvent(null, on ? 'rig_enabled' : 'rig_disabled', { workspace: key, by, hash: r.hash, present: r.present });
    rigEvent(this.b, { kind: on ? 'rig_enabled' : 'rig_disabled', ws: key, defN: r.n ?? null, actor: by === 'remote' || by === 'human' ? 'human' : 'board', text: `rig ${on ? '켜짐' : '꺼짐'}(${by})`, data: { by, hash: r.hash } });
    this.b.log && this.b.log(`rig ${on ? 'enabled' : 'disabled'} ${key}`);
    if (r.def && this.b.rig3 && on !== was) this.b.rig3.onEnabled(key, !!on).catch((e) => this.b.log && this.b.log('rig roles enable error', e.stack)); // P241: 켜면 역할 세션을 띄우고 끄면 재운다
    return this.status(key);
  }

  // ---------- atrium guide ----------
  // → { state, invalid, hash, text, file }  state: none | off | on | invalid. 켜진 rig면 역할 명령 안내(rig-def.mjs)
  guide(caller) {
    const key = caller.workspaceKey;
    const r = key ? this.read(key) : { present: false };
    const on = key ? this.enabled(key) : false;
    const base = { workspace: key, root: r.root || null, file: RIG_FILE, invalid: r.invalid || null, hash: r.hash || null };
    if (!r.present) return { ...base, state: 'none', text: null };
    if (!on) return { ...base, state: r.invalid && !r.def ? 'invalid' : 'off', text: null };
    if (!r.def) return { ...base, state: 'invalid', text: null };
    return { ...base, state: 'on', topics: [], rig3: true, text: rigGuide(r.def.rig3, caller.rigRole || null) }; // P242: 역할의 항목 명령
  }
}

// 켜진 rig가 있는 워크스페이스의 일 머리에 붙는 한 줄(짧게)
export const RIG_HEADER_LINE = '[Atrium 보드] 이 워크스페이스에는 rig(작업 규칙)가 있다. 안내: `atrium guide`.';
// P188: 일 머리를 세 줄 이하로 둘 때 셋째 줄 끝에 붙이는 rig 안내(짧게)
export const RIG_HEADER_TAIL = '이 워크스페이스에는 rig(작업 규칙)가 있다: `atrium guide`.';

// 판 API 처리기(backend.mjs handlers에 펼친다). 켜기는 판 API 토큰으로 붙은 연결(이 PC의 창·사람의 atrium 명령, auth.kind local)만.
// 기기 토큰(휴대폰·원격)은 상태를 보고 끄기만 한다(P195). 에이전트의 세션 토큰은 이 API에 붙지 못한다
export function rigHandlers(b) {
  const local = (c) => { if (!c || !c.auth || c.auth.kind !== 'local') throw apiError('forbidden', 'rig 켜기·끄기는 이 PC의 보드 창에서만 한다(판 API 토큰).'); };
  const keyOf = async (p) => (await b.resolveWorkspace(p && p.workspace)).key;
  return {
    'rig.status': async (p) => b.rig.status(await keyOf(p)),
    'rig.get': async (p) => b.rig.get(await keyOf(p)),
    // P183: 켜기는 사람이 확인한 뒤에만(confirm: true). 없으면 켜지 않고 상태를 돌려준다(창의 확인 한 줄이 보인다)
    'rig.enable': async (p, c) => {
      local(c);
      if (!p || p.confirm !== true) return { ...b.rig.status(await keyOf(p || {})), needsConfirm: true };
      const r = b.rig.setEnabled(await keyOf(p), true, 'human');
      if (b.broadcastWorkspaces) b.broadcastWorkspaces();
      return r;
    },
    // P195: 끄기는 원격 기기(기기 토큰)도 한다. 켜기는 이 PC의 창에서만
    'rig.disable': async (p, c) => {
      if (!c || !c.auth || !['local', 'device'].includes(c.auth.kind)) throw apiError('forbidden', 'rig 끄기는 보드 창이나 연결한 기기에서 한다.');
      const r = b.rig.setEnabled(await keyOf(p), false, c.auth.kind === 'device' ? 'remote' : 'human');
      if (b.broadcastWorkspaces) b.broadcastWorkspaces();
      return r;
    },
  };
}
