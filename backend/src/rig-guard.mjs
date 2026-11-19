// P243: rig 남의 쓰기 되돌리기(docs research rig3-skeleton.md 2절 원리 5 "쓰는 범위는 쥔 것으로 정해진다. 묻지 않고 막는다").
// - 하네스를 가리지 않는다. 하네스의 훅이 아니라 판이 아는 것(역할 세션의 상태 전환, 판이 돌리는 도구의 시작·끝)으로 턴의 경계를 잡는다.
//   Claude Code 편집 도구의 PreToolUse 거절(P241)과 Codex -C 가두기는 그대로 두고, 이 검사가 모든 하네스(Claude Code, Codex, Antigravity, opencode, pi …)에 덧붙는 받침이다.
// - 기준 목록: 판이 v3 rig 워크스페이스의 파일 목록(상대 경로 → 크기, 수정 시각, SHA-256)을 데이터 폴더 rig3-guard/<워크스페이스 id>/base.json에 들고,
//   되돌릴 수 있게 파일 내용을 같은 폴더 keep/<해시 앞 둘>/<해시>에 둔다(내용 주소라 같은 내용은 한 벌. 파일당 KEEP_FILE_MAX, 합 KEEP_TOTAL_MAX).
//   빼는 폴더: 이름이 GUARD_SKIP_NAMES인 폴더(어느 깊이든), 경로 GUARD_SKIP_PATHS, 정의의 ignore 칸(rig3.mjs). 파일만 본다(빈 폴더는 보지 않는다).
// - 검사(check): 역할 세션이 일함으로 들어갈 때와 일함이 끝날 때, 도구 실행의 시작과 끝마다 워크스페이스를 기준과 견준다.
//   P246 일함: (가) 판 상태 working·waiting, (나) 그 역할의 도구 실행(toolBegin·toolEnd, 구간이 따로다), (다) 그 세션의 프로세스 나무에 하네스 밖의 일
//   (Claude Code는 claude 아래 도구 명령, 다른 하네스는 하네스가 뜬 뒤 생긴 셸. sleep.mjs scanBackground·harnessWork), (라) Claude Code의 rt.bg(Stop의 background_tasks).
//   판 상태가 일함에서 나올 때 (다)·(라)를 바로 보고(sleeper.backgroundNow), 뒤 일이 있으면 구간을 열어 둔다(span.bg). 연 구간은 BG_POLL_MS마다 다시 보고
//   뒤 일이 없어지면 닫으며 검사한다(bg_end). 뒤 일이 도는 동안 다시 턴이 시작되면 같은 구간을 잇는다.
//   한계: 셸이 끝나고 떨어져 나간 프로세스(분리 실행)는 나무에 없어 보지 못한다. 그 프로세스가 주인이 쉬는 동안 쓴 것은 되돌린다.
//   크기·수정 시각이 같으면 그대로 보고, 다른 것만 해시한다(내용이 같으면 시각만 고친다). 구간 시작의 검사는 계기 시각 뒤에 고쳐진 파일을 다음 검사로 넘긴다.
// - 누가 썼나: 바뀜은 지난 검사 뒤에 일어났다. 그 창(지난 검사의 계기 ~ 이번 검사의 계기) 동안 일하던 역할이 후보다(일 구간은 순번으로 센다).
//   후보가 없으면 판 밖(사람)의 바뀜이라 받아들인다. 바뀐 곳의 주인(섹터 또는 기억 폴더의 역할)이 후보에 있으면 주인의 것이라 받아들인다.
//   그 밖(주인이 그동안 쉬었다, 어느 역할의 섹터도 아니다, .atrium/의 정의·목적·정의서)은 남의 쓰기다. 후보가 여럿이면 장부에 다 적는다.
// - 되돌리기: 바뀐 파일은 이전 내용으로, 새 파일은 지우지 않고 격리 폴더(quarantine/<시각>-<순번>/<상대 경로>)로 옮기고, 지운 파일은 되살린다.
//   남의 쓰기 내용도 격리에 남긴다. 이전 내용이 없으면(한도를 넘어 두지 않았다) 되돌리지 못한다고 장부에 남기고 지금 것을 기준으로 받는다.
//   장부 role_foreign_write(value restored | quarantined | revived | unrestorable | failed). 후보 역할에게 한 줄을 알린다(잠들었으면 깰 때).
// - 판 자신의 쓰기(입력 창구 파일, 정의서 조정 반영 등)는 accept(key, [상대 경로])로 기준에 받아들인다(쓰기 직후 부른다).
// - 비용: 검사마다 걸린 시간과 수를 로그에(rig3 guard …), 처음 기준을 만들 때는 장부 role_guard_base에 남긴다.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { rigEvent } from './rig-ledger.mjs';
import { memoryDir, BUILDER_ROLE, builderOwns, builderWrites } from './rig-def.mjs'; // P247: 빌더의 일 구간과 쓰기 범위
import { backgroundOf, SLEEP_TICK_MS } from './sleep.mjs'; // P246: 뒤 일(일함 (다)·(라))

export const GUARD_SKIP_NAMES = ['.git', 'node_modules', '.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.cache'];
export const GUARD_SKIP_PATHS = ['.claude/worktrees/'];
export const KEEP_FILE_MAX = 8 * 1024 * 1024;
export const KEEP_TOTAL_MAX = 512 * 1024 * 1024;
export const BUSY_STATES = new Set(['working', 'waiting']); // 이 상태 동안은 턴 안이다
export const BG_POLL_MS = SLEEP_TICK_MS; // P246: 뒤 일로 열어 둔 구간을 다시 보는 간격(판의 뒤 일 주기와 같다. cfg.rig3GuardBgPollMs, 0이면 끔)
export const BOARD_WRITE_MS = 60000;
export const CLOCK_SLACK_MS = 20; // P246: 구간 시작 검사가 넘기는 바뀜의 시각 여유(파일 시각의 거친 시계) // accept 뒤 이만큼은 그 경로의 바뀜을 판의 것으로 본다(검사가 accept보다 먼저 읽었을 때)
const GC_EVERY = 10; // 바뀜이 있던 검사 n번마다 쓰지 않는 keep을 지운다
export const foreignNotice = (role, paths, { owns = [], others = [], quarantine = null } = {}) =>
  [
    '[Atrium 보드] 네 턴 동안(돌린 스크립트 포함) 섹터 밖에 쓴 것을 되돌렸다: ' + paths.join(', ') + '.', // P244(P243 답): 스크립트의 부수 효과도 네 턴의 것
    '자기 섹터(' + owns.join(', ') + ')와 기억 폴더(' + memoryDir(role) + ')에만 쓰고, 남에게 줄 것은 항목으로 낸다.',
    others.length ? '(같은 때 ' + others.join(', ') + '도 일하고 있어 누가 썼는지 가리지 못했다. 네가 쓰지 않았으면 넘어간다.)' : '',
    quarantine ? '되돌리기 전 내용은 판이 따로 두었다: ' + quarantine : '',
  ].filter(Boolean).join(' ');

// P247: 빌더가 쓰기 범위 밖에 쓴 것을 되돌렸을 때
export const builderForeignNotice = (paths, { writes = [], others = [], quarantine = null } = {}) =>
  [
    '[Atrium 보드] 네(빌더) 턴 동안 빌더의 쓰기 범위 밖에 쓴 것을 되돌렸다: ' + paths.join(', ') + '.',
    '빌더는 ' + writes.join(', ') + '에만 쓴다. 역할의 섹터와 기억 폴더는 역할의 것이다.',
    others.length ? '(같은 때 ' + others.join(', ') + '도 일하고 있어 누가 썼는지 가리지 못했다. 네가 쓰지 않았으면 넘어간다.)' : '',
    quarantine ? '되돌리기 전 내용은 판이 따로 두었다: ' + quarantine : '',
  ].filter(Boolean).join(' ');
const lower = (s) => String(s).toLowerCase();
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
// 경로의 주인 → { role, kind: 'sector' | 'memory' } | null. 대소문자는 무시한다(Windows)
export function ownerOf(r3, rel) {
  const low = lower(rel);
  for (const r of Object.values(r3.roles)) for (const p of r.owns) if (low.startsWith(lower(p))) return { role: r.name, kind: 'sector' };
  for (const r of Object.values(r3.roles)) if (low.startsWith(lower(memoryDir(r.name)))) return { role: r.name, kind: 'memory' };
  return null;
}
// 빼는 규칙 → { names: Set, paths: [소문자, /로 끝남] }
export function skipRules(r3) {
  return { names: new Set(GUARD_SKIP_NAMES.map(lower)), paths: [...GUARD_SKIP_PATHS, ...((r3 && r3.ignore) || [])].map(lower) };
}
// 상대 경로(폴더면 dir true)가 빠지는가
export function isSkipped(rules, rel, dir = false) {
  const low = lower(rel);
  const segs = low.split('/');
  if (segs.slice(0, dir ? segs.length : -1).some((x) => rules.names.has(x))) return true;
  const p = dir ? low + '/' : low;
  return rules.paths.some((x) => p.startsWith(x));
}
// 워크스페이스를 훑는다 → Map(상대 경로 → { size, mtimeMs }). 심볼 링크·정션은 따라가지 않는다
export async function walk(root, rules) {
  const out = new Map();
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    let ents;
    try { ents = await fsp.readdir(path.join(root, rel), { withFileTypes: true }); } catch { continue; }
    const files = [];
    for (const e of ents) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!isSkipped(rules, r, true)) stack.push(r); }
      else if (e.isFile() && !isSkipped(rules, r)) files.push(r);
    }
    await Promise.all(files.map(async (r) => { try { const st = await fsp.stat(path.join(root, r)); out.set(r, { size: st.size, mtimeMs: Math.floor(st.mtimeMs) }); } catch {} }));
  }
  return out;
}
// 바뀜 하나의 판단(순수) → { legit, why }
//   cands: 그 창 동안 일하던 역할, owner: ownerOf 결과, board: 판 자신의 쓰기인가
//   P247: builder — 바뀐 곳이 빌더의 쓰기 범위(.atrium/, 도구 스크립트)이고 역할의 것이 아니다. 빌더가 후보면 받아들인다
export function judge({ cands, owner, board = false, builder = false }) {
  if (board) return { legit: true, why: 'board' };
  if (!cands.length) return { legit: true, why: 'outside' };
  if (owner && cands.includes(owner.role)) return { legit: true, why: 'owner' };
  if (!owner && builder && cands.includes(BUILDER_ROLE)) return { legit: true, why: 'builder' };
  return { legit: false, why: owner ? 'other_sector' : 'no_sector' };
}

export class RigGuard {
  // b: 백엔드(cfg.dataDir, store, sessions, queue, log). roles: RigRoles(defOf, sessionsOf)
  constructor(b, roles) {
    this.b = b; this.roles = roles;
    this.ws = new Map(); // 워크스페이스 키 → 상태
    this.seq = 0; // 일 구간과 검사 계기의 순번
  }
  num(name, dflt) { const v = this.b.cfg && this.b.cfg[name]; return v != null && Number(v) >= 0 ? Number(v) : dflt; }
  log(m) { if (this.b.log) this.b.log(m); }
  // 워크스페이스의 정의 → { root, r3 } | null. 정의가 잘못되면(역할이 rig.json을 깨뜨린 때도) 마지막 맞은 정의로 지킨다
  ctx(key) {
    const r = this.roles.defOf(key);
    if (r && r.def && r.def.rig3 && r.root) { const x = { root: r.root, r3: r.def.rig3 }; this.good = this.good || new Map(); this.good.set(key, x); return x; }
    let raw = null; try { raw = this.roles.b.rig ? this.roles.b.rig.read(key) : null; } catch { raw = null; }
    return raw && raw.present && this.good && this.good.has(key) ? this.good.get(key) : null;
  }
  dirOf(key) { return path.join((this.b.cfg && (this.b.cfg.dataDir || this.b.cfg.sessionsDir)) || '.', 'rig-guard', crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 16)); }
  st(key) {
    let x = this.ws.get(key);
    if (!x) {
      x = { key, dir: this.dirOf(key), base: undefined, root: null, lastSeq: 0, chain: Promise.resolve(), busy: new Map(), tools: new Map(), spans: [], pending: new Map(), boardWrites: new Map(), changedScans: 0, last: null };
      this.ws.set(key, x);
    }
    return x;
  }

  // ---------- 턴 경계(판 상태) ----------
  // backend.broadcastSession이 상태가 바뀔 때 부른다(모든 하네스). from·to: 판 상태(working, ready, waiting, sleeping, exited …)
  onState(s, from, to) {
    if (!s || !s.rigRole || !s.workspaceKey) return null;
    if (s.rigRole === BUILDER_ROLE) return this.onBuilder(s, from, to); // P247
    const x = this.ctx(s.workspaceKey);
    if (!x || !x.r3.roles[s.rigRole]) return null;
    return this.track(s, from, to);
  }
  // P247: 빌더 세션도 역할처럼 일 구간을 연다(후보 '@builder'). 일함에서 나오면 검사가 끝난 뒤 빌더의 턴 뒤 일(꺼진 rig의 판 남기기)
  onBuilder(s, from, to) {
    const B = this.roles.builder;
    const p = this.ctx(s.workspaceKey) ? this.track(s, from, to) : null;
    const left = B ? B.onState(s, from, to) : false;
    if (left) Promise.resolve(p).then(() => B.afterTurn(s.workspaceKey)).catch((e) => this.log('rig3 builder after turn ' + (e && e.stack || e)));
    return p;
  }
  track(s, from, to) {
    const st = this.st(s.workspaceKey);
    const was = st.busy.get(s.sessionId);
    const now = BUSY_STATES.has(to);
    let p = null;
    if (now) {
      if (!was) p = this.begin(st, s.rigRole, (span) => st.busy.set(s.sessionId, span), 'start');
      else { was.leaving = false; was.bg = null; } // P246: 뒤 일 동안(또는 뒤 일을 보는 동안) 다시 턴이 시작됐다: 같은 구간을 잇는다
    } else if (was && !was.leaving) p = this.leave(st, s, was);
    if (from === 'sleeping' && to !== 'sleeping') this.flush(s.workspaceKey, s.rigRole);
    return p;
  }
  // ---------- P246: 뒤 일 ----------
  // 세션의 뒤 일(일함 (다)·(라)) → { n, via } | null, 또는 그 Promise. 잠재우기(sleeper)가 있으면 프로세스를 지금 본다. 없으면(시험) rt.bg만
  bgProbe(s) {
    const sl = this.b.sleeper;
    if (sl && typeof sl.backgroundNow === 'function') return sl.backgroundNow(s).catch(() => null);
    return (s.kind || 'claude') === 'claude' && s.rt && s.rt.bg && !s.rt.sleep ? backgroundOf(s.rt.bg, null) : null;
  }
  // 판 상태가 일함에서 나왔다(또는 뒤 일로 연 구간을 다시 본다): 뒤 일이 있으면 구간을 열어 두고, 없으면 닫고 검사한다
  leave(st, s, span) {
    span.leaving = true;
    const held = !!span.bg;
    const done = (bg) => {
      if (st.busy.get(s.sessionId) !== span || !span.leaving) return null; // 그새 다시 일함이 되었거나 닫혔다
      span.leaving = false;
      const alive = this.b.sessions && this.b.sessions.get(s.sessionId);
      if (bg && alive && !alive.closedAt) {
        span.bg = { n: bg.n, via: bg.via, at: Date.now() };
        if (!held) this.log('rig3 guard ' + st.key + ' hold ' + span.role + ': background ' + bg.n + ' (' + bg.via + ')');
        this.arm();
        return { held: true, background: span.bg };
      }
      st.busy.delete(s.sessionId);
      span.bg = null;
      return this.end(st, span, held ? 'bg_end' : 'end');
    };
    const v = this.bgProbe(s);
    return v && typeof v.then === 'function' ? v.then(done) : done(v);
  }
  // 뒤 일로 연 구간을 다시 본다(주기). 시험은 직접 부른다
  async sweep() {
    const out = [];
    for (const st of [...this.ws.values()]) {
      for (const [sid, span] of [...st.busy]) {
        if (!span.bg || span.leaving) continue;
        const s = this.b.sessions && this.b.sessions.get(sid);
        if (!s || s.closedAt) { st.busy.delete(sid); span.end = ++this.seq; continue; }
        out.push(await this.leave(st, s, span));
      }
    }
    if (!this.held()) this.disarm();
    return out;
  }
  held() { for (const st of this.ws.values()) for (const sp of st.busy.values()) if (sp.bg) return true; return false; }
  arm() {
    const ms = this.num('rig3GuardBgPollMs', BG_POLL_MS);
    if (this.timer || !ms) return;
    this.timer = setInterval(() => { if (!this._sweeping) { this._sweeping = true; this.sweep().catch((e) => this.log('rig3 guard sweep error ' + (e && e.stack || e))).finally(() => { this._sweeping = false; }); } }, ms);
    if (this.timer.unref) this.timer.unref();
  }
  disarm() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  stop() { this.disarm(); }

  // 판이 돌리는 도구 실행(역할의 것)의 시작·끝. 도구가 쓴 것도 그 역할의 일 구간에 든다
  toolBegin(key, role, runId) {
    const x = this.ctx(key); if (!x || !x.r3.roles[role]) return null;
    const st = this.st(key);
    return this.begin(st, role, (span) => st.tools.set(String(runId), span), 'tool_start');
  }
  toolEnd(key, role, runId) {
    const st = this.ws.get(key); const span = st && st.tools.get(String(runId));
    if (!span) return null;
    st.tools.delete(String(runId));
    return this.end(st, span, 'tool_end');
  }
  // 일 구간 시작: 먼저 검사(계기 순번 t0, 이 구간은 t0 뒤에 열려 후보가 아니다), 그 뒤 구간을 연다
  begin(st, role, hold, why) {
    const t0 = ++this.seq;
    const span = { role, start: t0 + 0.5, end: null };
    st.spans.push(span); hold(span);
    return this.schedule(st.key, { why, role, t0, wall: Date.now() });
  }
  end(st, span, why) {
    const t0 = ++this.seq;
    span.end = t0;
    return this.schedule(st.key, { why, role: span.role, t0 });
  }
  // 창 (from, t0] 동안 일하던 역할
  candidates(st, from, t0) {
    const out = new Set();
    for (const sp of st.spans) if (sp.start < t0 && (sp.end == null || sp.end > from)) out.add(sp.role);
    return [...out];
  }
  // 닫힌 세션의 구간은 닫는다(상태 전환 없이 판에서 빠진 세션)
  reap(st) {
    for (const [sid, span] of [...st.busy]) {
      const s = this.b.sessions && this.b.sessions.get(sid);
      if (!s || s.closedAt) { st.busy.delete(sid); span.end = ++this.seq; }
    }
  }
  schedule(key, trig) {
    const st = this.st(key);
    const p = st.chain.then(() => this.check(key, trig)).catch((e) => { this.log('rig3 guard error ' + (e && e.stack || e)); return null; });
    st.chain = p;
    return p;
  }
  // 켜기·백엔드 시작: 기준이 없으면 만든다
  prime(key) { return this.ctx(key) ? this.schedule(key, { why: 'prime', role: null, t0: ++this.seq }) : null; }
  // 다른 일이 모두 끝날 때까지(시험·끄기)
  idle(key) { const st = this.ws.get(key); return st ? st.chain : Promise.resolve(); }

  // ---------- 판 자신의 쓰기 ----------
  // 판이 워크스페이스에 쓴 파일(상대 경로)을 기준에 받아들인다. 바로 표시해 두고(진행 중인 검사가 먼저 읽어도 판의 것으로 본다) 기준은 차례에 맞춰 고친다
  accept(key, rels) {
    const st = this.st(key);
    const list = (Array.isArray(rels) ? rels : [rels]).map((r) => String(r).replace(/\\/g, '/').replace(/^\.\//, ''));
    const until = Date.now() + BOARD_WRITE_MS;
    for (const r of list) st.boardWrites.set(lower(r), until);
    const p = st.chain.then(async () => {
      const x = this.ctx(key); if (!x) return;
      await this.load(st, x.root);
      if (!st.base) return; // 기준을 만들 때 들어간다
      for (const r of list) {
        const abs = path.join(x.root, r);
        try { const s = await fsp.stat(abs); if (!s.isFile()) { st.base.files.delete(r); continue; } st.base.files.set(r, await this.keep(st, abs, { size: s.size, mtimeMs: Math.floor(s.mtimeMs) })); }
        catch { st.base.files.delete(r); }
      }
      await this.save(st);
    }).catch((e) => this.log('rig3 guard accept error ' + (e && e.stack || e)));
    st.chain = p;
    return p;
  }
  isBoardWrite(st, rel) {
    const t = st.boardWrites.get(lower(rel));
    if (t == null) return false;
    if (t < Date.now()) { st.boardWrites.delete(lower(rel)); return false; }
    return true;
  }

  // ---------- 기준 저장 ----------
  async load(st, root) {
    if (st.base !== undefined && st.root === root) return;
    st.root = root; st.base = null;
    try {
      const j = JSON.parse(await fsp.readFile(path.join(st.dir, 'base.json'), 'utf8'));
      if (j && j.v === 1 && j.root === root) st.base = { files: new Map(Object.entries(j.files || {}).map(([k, v]) => [k, { size: v[0], mtimeMs: v[1], sha: v[2] || null }])), kept: j.kept || 0, t: j.t || 0 };
    } catch {}
  }
  async save(st) {
    if (!st.base) return;
    await fsp.mkdir(st.dir, { recursive: true });
    const files = {}; for (const [k, v] of st.base.files) files[k] = [v.size, v.mtimeMs, v.sha];
    const tmp = path.join(st.dir, 'base.json.tmp');
    await fsp.writeFile(tmp, JSON.stringify({ v: 1, ws: st.key, root: st.root, t: Date.now(), kept: st.base.kept, files }));
    await fsp.rename(tmp, path.join(st.dir, 'base.json'));
  }
  blobPath(st, sha) { return path.join(st.dir, 'keep', sha.slice(0, 2), sha); }
  // 파일을 읽어 해시하고(한도 안이면) 내용을 둔다 → 기준 칸 { size, mtimeMs, sha }
  async keep(st, abs, stat, buf = null) {
    if (stat.size > this.num('rig3GuardKeepFileMax', KEEP_FILE_MAX)) return { size: stat.size, mtimeMs: stat.mtimeMs, sha: null };
    const data = buf || await fsp.readFile(abs);
    const sha = sha256(data);
    const bp = this.blobPath(st, sha);
    if (!fs.existsSync(bp) && (st.base ? st.base.kept : 0) + data.length <= this.num('rig3GuardKeepTotalMax', KEEP_TOTAL_MAX)) {
      await fsp.mkdir(path.dirname(bp), { recursive: true });
      await fsp.writeFile(bp, data);
      if (st.base) st.base.kept += data.length;
    }
    return { size: stat.size, mtimeMs: stat.mtimeMs, sha };
  }
  // 쓰지 않는 keep을 지운다
  async gc(st) {
    const used = new Set([...st.base.files.values()].map((v) => v.sha).filter(Boolean));
    let kept = 0;
    const kd = path.join(st.dir, 'keep');
    let dirs = []; try { dirs = await fsp.readdir(kd); } catch { return; }
    for (const d of dirs) {
      let names = []; try { names = await fsp.readdir(path.join(kd, d)); } catch { continue; }
      for (const n of names) {
        const f = path.join(kd, d, n);
        if (!used.has(n)) { try { await fsp.unlink(f); } catch {} continue; }
        try { kept += (await fsp.stat(f)).size; } catch {}
      }
    }
    st.base.kept = kept;
  }

  // ---------- 검사 ----------
  async check(key, trig) {
    const x = this.ctx(key); if (!x) return null;
    const st = this.st(key);
    const t = Date.now();
    await this.load(st, x.root);
    this.reap(st);
    const rules = skipRules(x.r3);
    const cur = await walk(x.root, rules);
    const from = st.lastSeq;
    if (!st.base) { // 처음: 기준을 만든다(받아들이기만 한다)
      st.base = { files: new Map(), kept: 0, t };
      for (const [rel, c] of cur) { try { st.base.files.set(rel, await this.keep(st, path.join(x.root, rel), c)); } catch {} }
      await this.save(st);
      st.lastSeq = Math.max(st.lastSeq, trig.t0);
      const ms = Date.now() - t;
      const notKept = [...st.base.files.values()].filter((v) => !v.sha).length;
      rigEvent(this.b, { kind: 'role_guard_base', ws: key, actor: 'board', n: cur.size, text: '파일 ' + cur.size + '개 기준, ' + ms + 'ms' + (notKept ? ', 크기 한도를 넘어 되돌리지 못하는 파일 ' + notKept + '개' : ''), data: { files: cur.size, kept: st.base.kept, notKept, ms, skip: rules.paths, why: trig.why } });
      this.log('rig3 guard ' + key + ' base: ' + cur.size + ' files, ' + ms + 'ms');
      st.last = { t, ms, files: cur.size, hashed: cur.size, foreign: 0, why: trig.why };
      return { built: true, files: cur.size, ms };
    }
    const cands = this.candidates(st, from, trig.t0);
    const changes = []; let hashed = 0;
    // 구간 시작의 검사는 그 계기 뒤(수정 시각이 계기 시각 이후)의 바뀜을 판단하지 않고 다음 검사에 넘긴다(새로 연 구간의 역할이 이미 쓰기 시작했을 수 있다)
    // P246: 파일 시각은 Windows의 거친 시계(약 16ms 틱)로 찍혀 계기 뒤에 쓴 파일이 계기보다 조금 이르게 보일 수 있다(전체 시험 부하에서 P243 시험이 흔들림). CLOCK_SLACK_MS만큼 앞당겨 본다
    const wall = trig.wall != null ? trig.wall - CLOCK_SLACK_MS : null;
    const later = (c) => wall != null && c.mtimeMs >= wall;
    let deferred = 0;
    for (const [rel, c] of cur) {
      const b0 = st.base.files.get(rel);
      if ((!b0 || b0.size !== c.size || b0.mtimeMs !== c.mtimeMs) && later(c)) { deferred++; continue; }
      if (!b0) { changes.push({ rel, what: 'created', cur: c }); continue; }
      if (b0.size === c.size && b0.mtimeMs === c.mtimeMs) continue;
      if (c.size <= this.num('rig3GuardKeepFileMax', KEEP_FILE_MAX) && b0.sha) {
        let buf; try { buf = await fsp.readFile(path.join(x.root, rel)); } catch { continue; }
        hashed++;
        if (sha256(buf) === b0.sha) { b0.mtimeMs = c.mtimeMs; b0.size = c.size; continue; }
        changes.push({ rel, what: 'changed', cur: c, buf });
      } else changes.push({ rel, what: 'changed', cur: c });
    }
    for (const rel of [...st.base.files.keys()]) {
      if (cur.has(rel)) continue;
      if (isSkipped(rules, rel)) { st.base.files.delete(rel); continue; } // 정의의 ignore가 늘었다
      if (trig.wall != null) { let dm = 0; try { dm = Math.floor((await fsp.stat(path.dirname(path.join(x.root, rel)))).mtimeMs); } catch { dm = Infinity; } if (dm >= wall) { deferred++; continue; } } // 지운 때는 폴더의 수정 시각으로 본다
      changes.push({ rel, what: 'deleted' });
    }
    const foreign = [];
    let qdir = null;
    for (const ch of changes) {
      const owner = ownerOf(x.r3, ch.rel);
      const v = judge({ cands, owner, board: this.isBoardWrite(st, ch.rel), builder: !owner && builderOwns(x.r3, ch.rel) });
      const abs = path.join(x.root, ch.rel);
      if (v.legit) {
        if (ch.what === 'deleted') st.base.files.delete(ch.rel);
        else { try { st.base.files.set(ch.rel, await this.keep(st, abs, ch.cur, ch.buf)); } catch { st.base.files.delete(ch.rel); } }
        continue;
      }
      if (!qdir) qdir = path.join(st.dir, 'quarantine', new Date(t).toISOString().replace(/[-:]/g, '').replace(/\..*$/, '') + '-' + trig.t0);
      foreign.push({ ...ch, owner, why: v.why, ...(await this.revert(st, x.root, ch, qdir)) });
    }
    if (changes.length) st.changedScans++;
    if (changes.length && st.changedScans % GC_EVERY === 0) await this.gc(st);
    if (changes.length) await this.save(st);
    st.lastSeq = Math.max(st.lastSeq, trig.t0);
    st.spans = st.spans.filter((sp) => sp.end == null || sp.end > st.lastSeq);
    const ms = Date.now() - t;
    st.last = { t, ms, files: cur.size, hashed, changes: changes.length, foreign: foreign.length, deferred, why: trig.why };
    this.log('rig3 guard ' + key + ' ' + trig.why + (trig.role ? ' ' + trig.role : '') + ': files ' + cur.size + ', changed ' + changes.length + ', hashed ' + hashed + ', foreign ' + foreign.length + (deferred ? ', deferred ' + deferred : '') + ', ' + ms + 'ms');
    if (foreign.length) this.report(key, x.r3, foreign, cands, { ms, trig, qdir });
    return { changes: changes.length, foreign: foreign.map((f) => ({ path: f.rel, what: f.what, action: f.action, owner: f.owner ? f.owner.role : null })), cands, ms, files: cur.size, hashed };
  }
  // 남의 쓰기 하나를 되돌린다 → { action, quarantine, error? }
  async revert(st, root, ch, qdir) {
    const abs = path.join(root, ch.rel);
    const q = path.join(qdir, ch.rel);
    const b0 = st.base.files.get(ch.rel);
    const blob = b0 && b0.sha ? this.blobPath(st, b0.sha) : null;
    const hasBlob = !!blob && fs.existsSync(blob);
    try {
      if (ch.what === 'created') {
        await fsp.mkdir(path.dirname(q), { recursive: true });
        try { await fsp.rename(abs, q); } catch { await fsp.copyFile(abs, q); await fsp.unlink(abs); }
        return { action: 'quarantined', quarantine: q };
      }
      if (ch.what === 'changed') {
        if (!hasBlob) { st.base.files.set(ch.rel, { size: ch.cur.size, mtimeMs: ch.cur.mtimeMs, sha: null }); return { action: 'unrestorable', lost: b0 && b0.sha ? 'no_copy' : 'too_big' }; }
        await fsp.mkdir(path.dirname(q), { recursive: true });
        if (ch.buf) await fsp.writeFile(q, ch.buf); else await fsp.copyFile(abs, q);
        await fsp.copyFile(blob, abs);
        const s = await fsp.stat(abs);
        st.base.files.set(ch.rel, { size: s.size, mtimeMs: Math.floor(s.mtimeMs), sha: b0.sha });
        return { action: 'restored', quarantine: q };
      }
      // deleted
      if (!hasBlob) { st.base.files.delete(ch.rel); return { action: 'unrestorable', lost: b0 && b0.sha ? 'no_copy' : 'too_big' }; }
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.copyFile(blob, abs);
      const s = await fsp.stat(abs);
      st.base.files.set(ch.rel, { size: s.size, mtimeMs: Math.floor(s.mtimeMs), sha: b0.sha });
      return { action: 'revived', quarantine: null };
    } catch (e) {
      return { action: 'failed', error: e.code || e.message, quarantine: null };
    }
  }
  // 장부와 알림
  report(key, r3, foreign, cands, { ms, trig, qdir }) {
    const sid = (role) => { const s = this.roles.sessionsOf(key, role)[0]; return s ? s.sessionId : null; };
    for (const f of foreign) {
      const what = { created: '새 파일', changed: '고침', deleted: '지움' }[f.what];
      const act = { quarantined: '격리', restored: '되돌림', revived: '되살림', unrestorable: '되돌리지 못함', failed: '실패' }[f.action];
      rigEvent(this.b, {
        kind: 'role_foreign_write', ws: key, seat: cands.length === 1 ? cands[0] : null, session: cands.length === 1 ? sid(cands[0]) : null, actor: 'board', value: f.action, ref: f.rel,
        text: f.rel + ' ' + what + ' → ' + act + ' (' + (cands.join('|') || '-') + (f.owner ? ', 주인 ' + f.owner.role : ', 섹터 밖') + ')',
        data: { path: f.rel, what: f.what, action: f.action, owner: f.owner ? f.owner.role : null, ownerKind: f.owner ? f.owner.kind : null, why: f.why, candidates: cands, quarantine: f.quarantine || null, error: f.error || null, unrestorable: f.lost || null, trigger: trig.why, by: trig.role, ms },
      });
    }
    const paths = foreign.filter((f) => f.action !== 'failed').map((f) => f.rel);
    if (!paths.length) return;
    for (const role of cands) this.notify(key, role, role === BUILDER_ROLE ? builderForeignNotice(paths, { writes: builderWrites(r3), others: cands.filter((c) => c !== role), quarantine: qdir }) : foreignNotice(role, paths, { owns: r3.roles[role] ? r3.roles[role].owns : [], others: cands.filter((c) => c !== role), quarantine: qdir }));
  }
  // 그 역할에게 한 줄. 잠들었거나 세션이 없으면 깰 때(또는 다음 띄움 뒤 상태가 바뀔 때)
  notify(key, role, text) {
    const st = this.st(key);
    const s = this.roles.sessionsOf(key, role)[0];
    if (!s || (s.rt && s.rt.sleep) || !this.b.queue) { const l = st.pending.get(role) || []; l.push(text); st.pending.set(role, l); return 'pending'; }
    try { this.b.queue.enqueue(s.sessionId, text, { origin: { kind: 'board' } }); return 'sent'; } catch (e) { this.log('rig3 guard notify ' + role + ': ' + e.message); return 'failed'; }
  }
  flush(key, role) {
    const st = this.ws.get(key); const l = st && st.pending.get(role);
    if (!l || !l.length) return;
    st.pending.delete(role);
    for (const t of l) this.notify(key, role, t);
  }
  // 판이 미루어 둔 알림을 꺼낸다(깨우는 글에 붙일 때. 2단계의 깨우는 글이 쓸 수 있다)
  takeNotices(key, role) { const st = this.ws.get(key); const l = (st && st.pending.get(role)) || []; if (st) st.pending.delete(role); return l; }
  view(key) { const st = this.ws.get(key); return st ? { last: st.last, files: st.base ? st.base.files.size : null, kept: st.base ? st.base.kept : null, busy: [...new Set([...st.busy.values(), ...st.tools.values()].map((s) => s.role))], background: [...new Set([...st.busy.values()].filter((s) => s.bg).map((s) => s.role))] } : null; }
}
