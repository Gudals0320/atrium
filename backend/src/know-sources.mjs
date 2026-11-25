// P364: atrium know의 원천 목록. 워크스페이스 뿌리(본 저장소 체크아웃)에서 읽기만 한다.
// - 추적되는 글(md·txt): 문서(doc), docs/log(log), experiments·.atrium/records(record, 이름에 review·검토가 있으면 review)
// - 추적되는 코드: 주석만(code)
// - git 밖 기록: docs/(따로 받은 저장소여도), experiments/, .atrium/records/의 글 파일
// - 판 DB: 그 워크스페이스 세션들의 work_units.spec, unit_tries.done_text, 결정·할 일 카드(db)
// 빼는 것: 대화 기록(~/.claude/projects), 바이너리, 큰 파일(MAX_BYTES), node_modules·빌드 결과, 비밀 같은 이름의 파일.
// worker thread(know-worker.mjs) 안에서 돈다: git·파일 읽기가 동기라 판의 이벤트 고리를 막지 않게.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ownerOfPath, ownerOfName, unitsIn, redact } from './know-text.mjs';

export const MAX_BYTES = 1024 * 1024; // 이보다 큰 파일은 넣지 않는다
export const MAX_FILES = 60000;
const TEXT_EXT = new Set(['.md', '.markdown', '.txt']);
const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.css', '.scss', '.cs', '.py', '.sh', '.ps1', '.psm1', '.rs', '.go', '.c', '.h', '.cc', '.cpp', '.hpp', '.java', '.kt', '.swift', '.rb', '.php', '.lua', '.yml', '.yaml', '.toml']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out', 'coverage', 'vendor', '.next', '.cache', 'generated', 'target', '__pycache__', '.venv', 'venv', 'bower_components']);
// git 밖 기록을 찾는 폴더(워크스페이스 뿌리 기준)
export const LOCAL_ROOTS = ['docs', 'experiments', '.atrium/records'];
const SECRET_NAME = /^(?:\.env(?:\..*)?|.*credential.*|.*secrets?(?:\.[a-z]+)?|.*private[-_]?key.*|auth\.json|.*\.pem|.*\.key|.*\.p12|.*\.pfx)$/i;

const ext = (p) => path.posix.extname(p).toLowerCase();
const skippedPath = (rel) => rel.split('/').some((s, i, a) => (i < a.length - 1 && SKIP_DIRS.has(s))) || SECRET_NAME.test(path.posix.basename(rel));
// 경로 → 종류 | null(넣지 않음)
export function kindOf(rel, tracked = true) {
  if (skippedPath(rel)) return null;
  const e = ext(rel);
  if (TEXT_EXT.has(e)) {
    if (/^docs\/log\//i.test(rel)) return 'log';
    if (/^(?:experiments|\.atrium\/records)\//i.test(rel)) {
      const base = path.posix.basename(rel);
      // 시험 폴더의 txt는 대부분 화면·이벤트 캡처와 시험 출력이라(이 저장소에서 2,421개·22MB) 기록·보고·검토·메모 이름일 때만 넣는다. md는 모두
      if (e === '.txt' && !/record|report|review|summary|notes?|memo|result|findings|보고|검토|기록|결과|메모/i.test(base)) return null;
      return /review|검토/i.test(base) ? 'review' : 'record';
    }
    return 'doc';
  }
  if (tracked && CODE_EXT.has(e)) return 'code';
  return null;
}

export function gitOut(root, args, { maxBuffer = 256 * 1024 * 1024 } = {}) {
  const r = spawnSync('git', ['-c', 'core.quotePath=false', '--no-optional-locks', '-C', root, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer, timeout: 120000 });
  return r.status === 0 ? r.stdout : null;
}
export const isRepo = (root) => (gitOut(root, ['rev-parse', '--is-inside-work-tree']) || '').trim() === 'true';

// 추적되는 파일(git ls-files) + git 밖 기록 폴더의 글 → [{ rel, kind, tracked }]
export function listFiles(root) {
  const out = []; const seen = new Set();
  const add = (rel, tracked) => { if (seen.has(rel) || out.length >= MAX_FILES) return; const k = kindOf(rel, tracked); if (!k) return; seen.add(rel); out.push({ rel, kind: k, tracked }); };
  const repo = isRepo(root);
  if (repo) for (const rel of (gitOut(root, ['ls-files', '-z']) || '').split('\0')) if (rel) add(rel, true);
  const walk = (relDir, allowCode) => {
    let ents; try { ents = fs.readdirSync(path.join(root, relDir), { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (out.length >= MAX_FILES) return;
      const rel = relDir ? `${relDir}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(rel, allowCode); }
      else if (e.isFile()) add(rel, allowCode);
    }
  };
  if (repo) { for (const r of LOCAL_ROOTS) walk(r, false); }
  else walk('', true); // git이 아닌 폴더 워크스페이스: 폴더 전체(코드도)
  return { repo, files: out };
}

// git 이력 → 파일마다 처음 생긴 때·마지막 바뀐 때, 커밋 제목의 단위 번호. 지난번 HEAD에서 이어 읽는다(조상이 아니면 처음부터)
export function scanGitLog(idx, root, full = false) {
  const head = (gitOut(root, ['rev-parse', 'HEAD']) || '').trim();
  if (!head) return { head: null, commits: 0 };
  const old = idx.meta('gitHead');
  if (old === head && !full) return { head, commits: 0 };
  let range = head;
  if (old && !full && spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', old, head], { windowsHide: true }).status === 0) range = `${old}..${head}`;
  else idx.clearGit();
  const log = gitOut(root, ['log', '--no-renames', '--name-only', '--format=%x1e%H%x1f%ct%x1f%s', range]) || '';
  let n = 0;
  for (const block of log.split('\x1e')) {
    if (!block.trim()) continue;
    const [first, ...files] = block.split('\n');
    const [sha, ct, subject = ''] = first.split('\x1f');
    if (!sha || !ct) continue;
    const t = Number(ct) * 1000; n++;
    idx.putCommit(sha, t, redact(subject).slice(0, 300), unitsIn(subject));
    for (const f of files) if (f.trim()) idx.noteGitFile(f.trim(), t);
  }
  idx.setMeta('gitHead', head);
  return { head, commits: n };
}

export const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
// 파일 → { text, size, mtime, born } | null(없음·큼·바이너리)
export function readText(abs) {
  let st; try { st = fs.statSync(abs); } catch { return null; }
  if (!st.isFile() || st.size > MAX_BYTES) return { skip: true, st };
  const buf = fs.readFileSync(abs);
  if (buf.subarray(0, 4096).includes(0)) return { skip: true, st };
  return { text: buf.toString('utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n'), st };
}
export const tokenOf = (st) => `${st.size}:${Math.floor(st.mtimeMs)}`;
export const bornOf = (st) => (st.birthtimeMs > 0 ? Math.min(st.birthtimeMs, st.mtimeMs) : st.mtimeMs);
// 경로의 단위(docs/log/p364-know.md, experiments/p364/…, .atrium/records/p364-u1/…, backend/test/p364.test.mjs)
export const ownerOf = (rel) => ownerOfPath(rel);

// ---------- 판 DB 행 → 원천 ----------
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
// 결정·할 일 카드의 글. 사람의 답은 "사용자: …" 줄로 넣는다(색인으로는 찾되 발췌·열기에서는 가려진다)
export function decisionText(r) {
  const opts = Array.isArray(json(r.options)) ? json(r.options) : [];
  const cmds = Array.isArray(json(r.cmds)) ? json(r.cmds) : [];
  return [r.question, ...(opts.length ? [`보기: ${opts.join(' | ')}`] : []), ...(r.why ? [`맥락: ${r.why}`] : []), ...cmds.map((c) => `명령: ${c}`),
    ...(r.answer ? String(r.answer).split('\n').map((l) => `사용자: ${l}`) : [])].filter(Boolean).join('\n');
}
// boardRowsOf 결과 → [{ path, kind: 'db', born, changed, unit, heading, text }]
export function boardSources(rows) {
  const name = (id) => rows.sessions.get(id) || null;
  const out = [];
  const unitOfText = (t) => { const us = unitsIn(t); return us.size === 1 ? [...us][0] : null; };
  for (const u of rows.units) {
    if (!u.spec || !u.spec.trim()) continue;
    const who = name(u.to_session);
    out.push({ path: `db:work_units/${u.id}`, born: u.created_at, changed: u.created_at, unit: ownerOfName(who) || unitOfText(u.spec), heading: `일 ${u.id} → ${who || '?'}`, text: u.spec });
  }
  for (const t of rows.tries) {
    if (!t.done_text || !t.done_text.trim()) continue;
    const who = name(t.session_id);
    const at = t.ended_at || 0;
    out.push({ path: `db:unit_tries/${t.id}`, born: at, changed: at, unit: ownerOfName(who) || unitOfText(t.done_text), heading: `done ${t.result || ''} ${who || '?'} (일 ${t.unit_id})`.replace(/\s+/g, ' '), text: t.done_text });
  }
  for (const d of rows.decisions) {
    if (!d.question) continue;
    const who = d.name || name(d.session_id);
    out.push({ path: `db:decisions/${d.id}`, born: d.created_at, changed: d.answered_at || d.created_at, unit: ownerOfName(who), heading: `${d.kind && d.kind !== 'decision' ? `할 일(${d.kind})` : '결정'} #${d.id} ${who || ''}`.trim(), text: decisionText(d) });
  }
  return out;
}
