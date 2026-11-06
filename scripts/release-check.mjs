#!/usr/bin/env node
// 릴리즈 확인(P69). 앱 안 업데이트는 릴리즈 태그와 app·backend의 package.json version으로 버전을 읽는다. 태그를 달기 전과 뒤에 돌린다.
//   node scripts/release-check.mjs <태그>            예: v0.2.0. main이 dev와 같은 커밋인지, 두 version이 태그와 같은지, 태그가 있으면 main을 가리키는지
//   node scripts/release-check.mjs <태그> --remote   origin/main·origin/dev로 본다(git fetch 뒤)
// 종료 코드: 0 통과, 1 맞지 않음, 2 실행 불가(인자, git 오류)
// 릴리즈 절차(작업은 dev에서 한다):
//   1. dev에서 app/package.json·backend/package.json과 두 잠금 파일 맨 위의 version을 새 버전으로 올려 커밋하고 푸시한다.
//   2. git checkout main && git merge --ff-only dev, 그리고 node scripts/release-check.mjs v<버전>이 통과하면 main에 git tag -a v<버전>을 달고 main과 태그를 푸시한다.
//   3. GitHub에서 그 태그로 정식 릴리즈를 만든다(초안·사전 릴리즈는 앱 안 업데이트가 보지 않는다). node scripts/release-check.mjs v<버전> --remote로 원격을 확인한다.
//   4. 다시 dev로 돌아간다(git checkout dev).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function checkRelease({ tag, main, dev, tagCommit, appVersion, backendVersion }) {
  const problems = [];
  const version = String(tag || '').replace(/^v/, '');
  if (!/^v\d+\.\d+\.\d+$/.test(String(tag || ''))) problems.push(`태그는 v<주>.<부>.<수> 꼴이어야 합니다(사전 릴리즈는 업데이트가 보지 않습니다): ${tag}`);
  if (!main) problems.push('main 브랜치가 없습니다');
  if (!dev) problems.push('dev 브랜치가 없습니다');
  if (main && dev && main !== dev) problems.push(`main(${main.slice(0, 8)})이 dev(${dev.slice(0, 8)})와 다릅니다. main을 dev로 fast-forward합니다: git checkout main && git merge --ff-only dev`);
  if (appVersion !== version) problems.push(`app/package.json version(${appVersion})이 태그(${version})와 다릅니다`);
  if (backendVersion !== version) problems.push(`backend/package.json version(${backendVersion})이 태그(${version})와 다릅니다`);
  if (tagCommit && main && tagCommit !== main) problems.push(`태그 ${tag}가 main이 아닌 커밋(${tagCommit.slice(0, 8)})을 가리킵니다`);
  return problems;
}

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
const versionAt = (ref, file) => { const s = git('show', `${ref}:${file}`); try { return s ? JSON.parse(s).version : null; } catch { return null; } };

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const args = process.argv.slice(2);
  const tag = args.find((a) => !a.startsWith('--'));
  if (!tag) { console.error('사용: node scripts/release-check.mjs <태그> [--remote]'); process.exit(2); }
  const remote = args.includes('--remote');
  const mainRef = remote ? 'origin/main' : 'main', devRef = remote ? 'origin/dev' : 'dev';
  const main = git('rev-parse', '--verify', `${mainRef}^{commit}`), dev = git('rev-parse', '--verify', `${devRef}^{commit}`);
  const tagCommit = git('rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`);
  const problems = checkRelease({ tag, main, dev, tagCommit, appVersion: main && versionAt(mainRef, 'app/package.json'), backendVersion: main && versionAt(mainRef, 'backend/package.json') });
  if (problems.length) { console.error(`릴리즈 확인 실패 (${tag}):`); for (const p of problems) console.error(`- ${p}`); process.exit(1); }
  console.log(`릴리즈 확인 통과: ${tag}, ${mainRef} = ${devRef} = ${main.slice(0, 8)}${tagCommit ? ', 태그가 main을 가리킴' : ', 태그 아직 없음'}`);
}
