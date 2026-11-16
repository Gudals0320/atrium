// 견본 요약 도구(rig 흐름 시험 자료). atrium tool summary로 부르거나 느린 고리(cycles)의 run으로 돈다.
// 느린 고리는 stdin에 JSON({ at: "cycle", line, since, until, … })을 준다. 도구로 부르면 stdin이 비어 있다.
// 출력: 워크스페이스의 .atrium 아래 파일 수와 받은 입력 한 줄
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.ATRIUM_WORKSPACE_ROOT || process.cwd();
let raw = '';
const done = () => {
  let input = {};
  try { input = raw.trim() ? JSON.parse(raw) : {}; } catch { input = {}; }
  const count = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0); } catch { return 0; } };
  const files = count(path.join(root, '.atrium'));
  const args = process.argv.slice(2);
  process.stdout.write(`[rig flow sample] summary: .atrium files ${files}${input.at ? `, called by ${input.at} line ${input.line}` : ''}${args.length ? `, args ${args.join(' ')}` : ''}\n`);
};
if (process.stdin.isTTY) done();
else { process.stdin.setEncoding('utf8'); process.stdin.on('data', (d) => { raw += d; }); process.stdin.on('end', done); process.stdin.on('error', done); }
