// 창 화면(renderer)을 한 파일로 묶는다: src/renderer → dist/renderer.js, dist/renderer.css, dist/index.html, dist/fonts/(P11 글꼴)
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SHELL_MARK = '__ATRIUM_SHELL__'; // P282: 16자. 같은 길이의 해시로 바꿔 소스맵 자리가 어긋나지 않는다
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(ROOT, 'dist');
fs.mkdirSync(out, { recursive: true });

await esbuild.build({
  entryPoints: { renderer: path.join(ROOT, 'src', 'renderer', 'main.jsx') },
  outdir: out,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome140',
  jsx: 'automatic',
  loader: { '.js': 'jsx', '.woff2': 'file', '.woff': 'file' },
  // P11: 글꼴 파일(npm의 OFL 글꼴, src/renderer/fonts.css)은 dist/fonts/로 옮긴다. 창은 오프라인에서도 글꼴이 나온다
  assetNames: 'fonts/[name]-[hash]',
  sourcemap: true,
  define: { 'process.env.NODE_ENV': '"production"', __SHELL_BUILD__: JSON.stringify(SHELL_MARK) }, // P282: 화면 빌드 표식 자리(아래에서 해시로 바꾼다)
  logLevel: 'warning',
});
fs.copyFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), path.join(out, 'index.html'));
// 종류 로고 같은 그림은 그대로 옮긴다(lib/kinds.js가 dist/index.html 기준 assets/… 주소로 가리킨다)
fs.rmSync(path.join(out, 'assets'), { recursive: true, force: true }); // 지운 그림(예: 옛 Claude 봇)이 dist에 남지 않게
fs.cpSync(path.join(ROOT, 'src', 'renderer', 'assets'), path.join(out, 'assets'), { recursive: true });

// P282: 화면 빌드 표식. 자리 글을 넣은 채 묶은 renderer.js와 renderer.css·index.html의 내용 해시(16자)를 renderer.js 안(__SHELL_BUILD__)과
// dist/build.json에 함께 넣는다. 백엔드가 /web/me로 build.json 값을 알리고, 원격 웹 화면은 자기 값과 다르면 다시 불러온다(shell-update.js)
{
  const rjs = path.join(out, 'renderer.js');
  const src = fs.readFileSync(rjs, 'utf8');
  if (!src.includes(SHELL_MARK)) throw new Error('renderer.js has no shell build mark');
  const h = crypto.createHash('sha256');
  for (const [f, body] of [['index.html', fs.readFileSync(path.join(out, 'index.html'))], ['renderer.js', src], ['renderer.css', fs.existsSync(path.join(out, 'renderer.css')) ? fs.readFileSync(path.join(out, 'renderer.css')) : '']]) { h.update(f); h.update(body); }
  const build = h.digest('hex').slice(0, SHELL_MARK.length);
  fs.writeFileSync(rjs, src.split(SHELL_MARK).join(build));
  fs.writeFileSync(path.join(out, 'build.json'), JSON.stringify({ build }) + '\n');
}

// P74: 원격 웹 화면의 서비스 워커(dist/sw.js). 껍데기 파일(sw-rules.js가 고른 것)의 내용 해시를 버전으로 넣는다.
// 껍데기가 바뀌면 sw.js의 바이트가 바뀌어 브라우저가 새 서비스 워커를 받고 캐시를 바꾼다. Electron 창은 쓰지 않는다
const { shellList } = await import(pathToFileURL(path.join(ROOT, 'src', 'renderer', 'lib', 'sw-rules.js')).href);
const walk = (dir, base = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), `${base}${e.name}/`) : [`${base}${e.name}`]));
const shellFiles = walk(out).filter((f) => f !== 'sw.js').sort();
const shell = shellList(shellFiles);
const hash = crypto.createHash('sha256');
for (const f of ['index.html', ...shellFiles.filter((x) => shell.includes(`./${x}`))]) { hash.update(f); hash.update(fs.readFileSync(path.join(out, f))); }
await esbuild.build({
  entryPoints: [path.join(ROOT, 'src', 'renderer', 'sw.js')],
  outfile: path.join(out, 'sw.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  define: { __SW_VERSION__: JSON.stringify(hash.digest('hex').slice(0, 16)), __SW_SHELL__: JSON.stringify(shell) },
  logLevel: 'warning',
});
console.log('built', path.relative(process.cwd(), out));
