#!/usr/bin/env node
// P372 옛 앱 빌드(고치기 전 화면을 견줄 때): 그 커밋의 앱과 backend/src를 git archive로 git 밖 폴더에 풀어 빌드한다.
// 앱이 백엔드 소스를 상대 경로로 가져와(app/src/main, Canvas.jsx 등 → ../../../backend/src) backend/src가 없으면 빌드가 깨진다.
// 이것을 빼먹어 옛 빌드가 세 번 실패했다(사례 13·16·19, experiments/know-baseline/cases.md). 풀고 나서·빌드 뒤에 backend/src와 dist가 있는지 보고, 없으면 실패한다.
// node_modules는 지금 워크트리의 app·backend 것을 정션으로 잇는다. 지울 때는 --clean이 정션부터 끊는다(정션째 지우면 원래 node_modules가 지워질 수 있다).
// 쓰기(워크트리 뿌리에서): node scripts/old-build.mjs <커밋|브랜치> [--out <폴더>]   → <폴더>/app/dist (P3xx_DIST 같은 값으로 준다)
//       node scripts/old-build.mjs --clean <폴더>
// 기본 폴더는 backend/.dev/old-<커밋 8자>(git 밖). 폴더는 backend/.dev 또는 app/ 아래만 받는다.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 풀 것: 앱 소스·빌드 스크립트·에셋과 백엔드 소스(앱이 상대 경로로 가져온다)
export const OLD_PATHS = ['app/src', 'app/scripts', 'app/assets', 'app/package.json', 'backend/src', 'backend/package.json'];
export const MUST = ['app/src', 'app/scripts/build.mjs', 'backend/src'];
const MARK = '.old-build';
const inside = (p, root) => { const r = path.relative(path.resolve(root), path.resolve(p)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };

const git = (repo, args, opts = {}) => spawnSync('git', args, { cwd: repo, encoding: opts.buffer ? 'buffer' : 'utf8', maxBuffer: 1024 * 1024 * 1024 });

// 그 커밋에 있는 것만(옛 커밋에는 app/assets가 없을 수 있다)
export function treePaths(repo, ref) { return OLD_PATHS.filter((p) => git(repo, ['cat-file', '-e', `${ref}:${p}`]).status === 0); }

// 풀린 폴더 검사 → 문제 글 목록
export function checkOldTree(dir) {
  return MUST.filter((p) => !fs.existsSync(path.join(dir, p))).map((p) => p === 'backend/src'
    ? `${path.join(dir, 'backend', 'src')}가 없다: 앱이 백엔드 소스를 상대 경로(../../../backend/src)로 가져오므로 옛 빌드에 backend/src를 함께 푼다(git archive <커밋> app/src app/scripts backend/src …)`
    : `${path.join(dir, p)}가 없다`);
}
export function checkOldBuild(dir) {
  const out = checkOldTree(dir);
  if (!fs.existsSync(path.join(dir, 'app', 'dist', 'index.html'))) out.push(`${path.join(dir, 'app', 'dist', 'index.html')}가 없다: 빌드가 끝나지 않았다`);
  return out;
}

function junction(target, at) { if (fs.existsSync(target) && !fs.existsSync(at)) fs.symlinkSync(target, at, 'junction'); }

// → { out, dist, ref, sha }
export function oldBuild({ repo = REPO, ref, out, link = true, log = () => {} }) {
  if (!ref) throw new Error('old-build: 커밋을 준다');
  const sha = git(repo, ['rev-parse', '--verify', `${ref}^{commit}`]).stdout.trim();
  if (!sha) throw new Error(`old-build: 커밋 ${ref}를 찾지 못했다`);
  out = path.resolve(out || path.join(repo, 'backend', '.dev', `old-${sha.slice(0, 8)}`));
  if (!inside(out, path.join(repo, 'backend', '.dev')) && !inside(out, path.join(repo, 'app'))) throw new Error(`old-build: 폴더 ${out}는 backend/.dev 또는 app/ 아래여야 한다(git 밖)`);
  if (fs.existsSync(out) && fs.readdirSync(out).length) throw new Error(`old-build: ${out}가 비어 있지 않다. node scripts/old-build.mjs --clean ${out}로 먼저 지운다`);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, MARK), `${sha}\n`);
  const paths = treePaths(repo, sha);
  if (!paths.includes('backend/src')) throw new Error(`old-build: ${sha.slice(0, 8)}에 backend/src가 없다(앱이 백엔드 소스를 가져오는 구조 전의 커밋?)`);
  const tar = git(repo, ['archive', '--format=tar', sha, ...paths], { buffer: true });
  if (tar.status !== 0) throw new Error(`old-build: git archive 실패: ${String(tar.stderr).slice(0, 300)}`);
  const x = spawnSync('tar', ['-xf', '-'], { cwd: out, input: tar.stdout, maxBuffer: 64 * 1024 * 1024 });
  if (x.status !== 0) throw new Error(`old-build: 풀기 실패: ${String(x.stderr).slice(0, 300)}`);
  log(`풀었다: ${paths.join(' ')} → ${out}`);
  const bad = checkOldTree(out);
  if (bad.length) throw new Error('old-build: 풀린 트리가 모자라다\n  - ' + bad.join('\n  - '));
  if (link) { junction(path.join(repo, 'app', 'node_modules'), path.join(out, 'app', 'node_modules')); junction(path.join(repo, 'backend', 'node_modules'), path.join(out, 'backend', 'node_modules')); }
  const b = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: path.join(out, 'app'), encoding: 'utf8' });
  if (b.status !== 0) throw new Error(`old-build: 빌드 실패(${b.status}): ${(b.stderr || b.stdout || '').slice(-800)}`);
  const after = checkOldBuild(out);
  if (after.length) throw new Error('old-build: 빌드 뒤 검사 실패\n  - ' + after.join('\n  - '));
  log(`빌드했다: ${path.join(out, 'app', 'dist')}`);
  return { out, dist: path.join(out, 'app', 'dist'), ref, sha };
}

// 정션부터 끊고 지운다(이 도구가 만든 폴더만: 표식 파일)
export function cleanOld(dir) {
  dir = path.resolve(dir);
  if (!fs.existsSync(path.join(dir, MARK))) throw new Error(`old-build --clean: ${dir}는 이 도구가 만든 폴더가 아니다(${MARK} 없음)`);
  for (const p of ['app/node_modules', 'backend/node_modules']) { const at = path.join(dir, p); try { if (fs.lstatSync(at).isSymbolicLink()) fs.unlinkSync(at); } catch {} }
  for (const p of ['app/node_modules', 'backend/node_modules']) if (fs.existsSync(path.join(dir, p)) && fs.lstatSync(path.join(dir, p)).isSymbolicLink()) throw new Error(`old-build --clean: 정션 ${p}를 끊지 못했다. 지우지 않는다`);
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  return !fs.existsSync(dir);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  try {
    if (a[0] === '--clean') { if (!a[1]) throw new Error('사용: node scripts/old-build.mjs --clean <폴더>'); console.log(cleanOld(a[1]) ? `지웠다: ${a[1]}` : `남았다: ${a[1]}`); }
    else {
      const i = a.indexOf('--out');
      const r = oldBuild({ ref: a.find((x, j) => !x.startsWith('--') && !(i >= 0 && j === i + 1)), out: i >= 0 ? a[i + 1] : undefined, log: (m) => console.log(m) });
      console.log(`dist: ${r.dist}\n지울 때: node scripts/old-build.mjs --clean ${r.out}`);
    }
  } catch (e) { console.error(e.message); process.exit(1); }
}
