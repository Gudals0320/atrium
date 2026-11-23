// P334: 일 기록(atrium done ok|failed "<보고>" --record <파일>). 조사·감사·제안·측정·인계 같은 긴 일의 결과물은 저장소 문서(docs/)로 커밋하지 않고
//   판이 워크스페이스 주 체크아웃의 .atrium/records/<세션 이름>-<일 ID>/로 복사해 둔다(워크트리를 치워도 남게. .atrium/은 P257대로 .git/info/exclude로 git 밖).
// - 받는 파일: 그 세션의 작업 폴더·워크스페이스 뿌리·주 체크아웃 안의 보통 파일만(진짜 경로로 본다: 정션·심볼릭 링크로 밖을 가리키면 거절).
//   .git 안, 비밀 같은 이름(.env, 키·인증서, id_rsa, secret·token·password·credential이 든 이름)은 거절한다. 파일 하나 RECORD_FILE_MAX, 한 일에 RECORD_FILES_MAX개까지.
// - 일(work_units.records)에 { dir, files: [{ name, bytes }], at }를 남기고, 위 세션이 받는 done 글·merger 정리 알림 줄에 "기록 <경로>"가 붙고,
//   창(PC 카드·세션 맵·휴대폰)이 그 세션의 마지막 기록을 눌러 연다(records.read).
import fs from 'node:fs';
import path from 'node:path';
import { ATRIUM_DIR, ensureAtriumDir } from './doc-check.mjs';

export const RECORDS_DIR = ATRIUM_DIR + '/records';
export const RECORD_FILE_MAX = 2 * 1024 * 1024;
export const RECORD_FILES_MAX = 20;
export const RECORD_LINES_MAX = 5; // 알림에 보이는 파일 줄 수(나머지는 폴더 한 줄)

function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const slash = (p) => String(p).split(path.sep).join('/');
const real = (p) => { try { return fs.realpathSync.native(p); } catch { try { return fs.realpathSync(p); } catch { return null; } } };
const low = (p) => (process.platform === 'win32' ? slash(p).toLowerCase() : slash(p));
// a가 dir 안(같거나 아래)인가
export function inside(a, dir) { const x = low(a).replace(/\/+$/, ''), d = low(dir).replace(/\/+$/, ''); return x === d || x.startsWith(d + '/'); }

// 비밀 같은 이름(파일 이름 기준)
const SECRET_NAMES = [
  /^\.env(\..*)?$/i, /^\.?(npmrc|netrc|pypirc|pgpass|git-credentials)$/i, /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /\.(pem|key|p12|pfx|jks|keystore|kdbx|ppk|asc|gpg|crt|cer)$/i,
  /secret|credential|passw(or)?d|token|api[-_]?key|private[-_]?key/i,
];
export const secretName = (name) => SECRET_NAMES.some((r) => r.test(String(name || '')));

// 주 체크아웃: 뿌리의 .git이 폴더면 그 뿌리, 파일(gitdir: …, 워크트리)이면 공통 git 폴더(…/.git)의 부모. git이 아니면 그 폴더
export function mainCheckoutOf(root) {
  if (!root) return null;
  const g = path.join(root, '.git');
  let st; try { st = fs.statSync(g); } catch { return root; }
  if (st.isDirectory()) return root;
  let txt = ''; try { txt = fs.readFileSync(g, 'utf8'); } catch { return root; }
  const m = /^gitdir:\s*(.+)$/m.exec(txt);
  if (!m) return root;
  const gitDir = path.resolve(root, m[1].trim());
  let common = ''; try { common = fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim(); } catch {}
  const c = common ? path.resolve(gitDir, common) : gitDir;
  return path.basename(c).toLowerCase() === '.git' ? path.dirname(c) : root;
}

// 기록 폴더 이름: <세션 이름>-<일 ID>(파일 이름에 못 쓰는 글자는 -)
export function recordFolder(name, unitId) {
  const n = String(name || 'session').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60) || 'session';
  return n + '-' + String(unitId || 'unit').replace(/[^\w-]+/g, '');
}

// 받은 경로들을 검사한다 → [{ src, name, bytes }]. roots: 받는 폴더들(진짜 경로로 비교)
export function checkRecordFiles(paths, roots, { fileMax = RECORD_FILE_MAX, filesMax = RECORD_FILES_MAX } = {}) {
  const list = (Array.isArray(paths) ? paths : [paths]).filter((p) => p != null && String(p).trim()).map(String);
  if (!list.length) return [];
  if (list.length > filesMax) throw apiError('bad_request', `기록 파일이 너무 많다(${list.length}개, ${filesMax}개까지). 한 파일로 묶거나 폴더 목록 파일을 쓴다.`);
  const okRoots = [...new Set((roots || []).filter(Boolean).map(real).filter(Boolean))];
  if (!okRoots.length) throw apiError('bad_request', '이 세션의 작업 폴더를 몰라 기록 파일을 받을 수 없다.');
  const out = [];
  for (const p of list) {
    if (!path.isAbsolute(p)) throw apiError('bad_request', `기록 파일 경로는 절대 경로다: ${p}`);
    const r = real(p);
    if (!r) throw apiError('bad_request', `기록 파일이 없다: ${p}`);
    let st; try { st = fs.statSync(r); } catch (e) { throw apiError('bad_request', `기록 파일을 읽지 못했다: ${p} (${e.message})`); }
    if (!st.isFile()) throw apiError('bad_request', `기록은 파일만 받는다(폴더 아님): ${p}`);
    if (!okRoots.some((d) => inside(r, d))) throw apiError('bad_request', `저장소(작업 폴더) 밖 파일은 기록으로 받지 않는다: ${p}`);
    if (low(r).split('/').some((seg) => seg === '.git' || seg === '.ssh')) throw apiError('bad_request', `.git·.ssh 안 파일은 기록으로 받지 않는다: ${p}`);
    const name = path.basename(r);
    if (secretName(name)) throw apiError('bad_request', `비밀이 든 것 같은 이름이라 기록으로 받지 않는다: ${name}. 비밀을 빼고 다른 이름으로 준다.`);
    if (st.size > fileMax) throw apiError('bad_request', `기록 파일이 너무 크다: ${name} (${st.size}바이트, ${fileMax}바이트까지)`);
    out.push({ src: r, name, bytes: st.size });
  }
  return out;
}

// 검사한 파일을 주 체크아웃의 .atrium/records/<폴더>/로 복사한다 → { dir, files: [{ name, bytes }], at }
export function copyRecords(files, main, folder, { now = Date.now() } = {}) {
  if (!files.length) return null;
  ensureAtriumDir(main); // .atrium/을 만들고 git 밖(.git/info/exclude)에
  const dir = path.join(main, RECORDS_DIR, folder);
  fs.mkdirSync(dir, { recursive: true });
  const used = new Set(fs.readdirSync(dir).map((n) => n.toLowerCase()));
  const done = [];
  for (const f of files) {
    let name = f.name; const ext = path.extname(name); const base = name.slice(0, name.length - ext.length);
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base}-${i}${ext}`; // 같은 이름은 -2, -3
    used.add(name.toLowerCase());
    fs.copyFileSync(f.src, path.join(dir, name));
    done.push({ name, bytes: f.bytes });
  }
  return { dir: slash(dir), files: done, at: now };
}

// 알림 줄: "기록 <경로>"(파일마다, RECORD_LINES_MAX개까지. 넘으면 폴더 한 줄)
export function recordLines(rec) {
  if (!rec || !rec.files || !rec.files.length) return [];
  const shown = rec.files.length > RECORD_LINES_MAX ? rec.files.slice(0, RECORD_LINES_MAX - 1) : rec.files;
  const lines = shown.map((f) => `기록 ${rec.dir}/${f.name}`);
  if (shown.length < rec.files.length) lines.push(`기록 ${rec.dir}/ (외 ${rec.files.length - shown.length}개)`);
  return lines;
}
// 요약(창)에 싣는 꼴
export const recordBrief = (unitId, rec) => (rec && rec.files && rec.files.length ? { unitId, dir: rec.dir, count: rec.files.length, files: rec.files.map((f) => f.name), at: rec.at } : null);

// 기록 파일 하나를 읽는다(창의 보기). 폴더 밖 이름은 거절
export function readRecord(rec, name = null, { max = RECORD_FILE_MAX } = {}) {
  if (!rec || !rec.files || !rec.files.length) throw apiError('not_found', '이 일에 남긴 기록이 없다.');
  const f = name ? rec.files.find((x) => x.name === name) : rec.files[0];
  if (!f) throw apiError('not_found', `기록에 없는 파일: ${name}`);
  const p = path.join(rec.dir, f.name);
  let buf; try { buf = fs.readFileSync(p); } catch (e) { throw apiError('not_found', `기록 파일을 읽지 못했다(지워졌을 수 있다): ${slash(p)}`); }
  const clipped = buf.length > max;
  const body = clipped ? buf.subarray(0, max) : buf;
  const binary = body.subarray(0, 8000).includes(0);
  return { name: f.name, path: slash(p), bytes: buf.length, text: binary ? null : body.toString('utf8'), binary, clipped, markdown: /\.(md|markdown|mdx)$/i.test(f.name) };
}
