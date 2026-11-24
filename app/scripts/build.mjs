// 창 화면(renderer)을 묶는다: src/renderer → dist/renderer.js, dist/renderer.css, dist/index.html, dist/fonts/(P11 글꼴)
// P353: 묶음이 넷이다. boot.js(첫 스크립트, 휴대폰이면 mobile을 아니면 renderer를 읽는다), renderer(판 화면 main.jsx), mobile(휴대폰 전용 페이지),
//   (P356: fullmap 묶음은 뺐다. 휴대폰 맵 탭은 mobile 묶음이 늦게 읽는 조각 MobileMap.jsx와 고른 CSS dist/mobilemap.css). 함께 쓰는 모듈은 dist/chunk-<해시>.js로 나눈다(splitting). CSS는 묶음마다 하나
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SHELL_MARK = '__ATRIUM_SHELL__'; // P282: 16자. 같은 길이의 해시로 바꿔 소스맵 자리가 어긋나지 않는다
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(ROOT, 'dist');
fs.mkdirSync(out, { recursive: true });
// P353: 지난 빌드의 묶음 조각(이름에 해시)은 지운다(dist에 쌓이지 않게)
for (const f of fs.readdirSync(out)) if (/^chunk-[A-Za-z0-9]+\.(js|css)(\.map)?$/.test(f)) fs.rmSync(path.join(out, f));

await esbuild.build({
  entryPoints: { boot: path.join(ROOT, 'src', 'renderer', 'boot.js'), renderer: path.join(ROOT, 'src', 'renderer', 'main.jsx'), mobile: path.join(ROOT, 'src', 'renderer', 'mobile.jsx') }, // P356: fullmap(옛 전체 맵) 묶음은 뺐다(맵 탭이 판 세션 맵과 같은 모양)
  outdir: out,
  bundle: true,
  splitting: true, // P353
  chunkNames: 'chunk-[hash]',
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
// P356: 휴대폰 페이지 맵 탭의 CSS = 판 화면 CSS에서 세션 맵 카드·띠·선 규칙만(scripts/css-pick.mjs). 맵 탭을 열 때 읽는다
{
  const { pickCss, MAP_KEEP } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'css-pick.mjs')).href);
  const src = ['styles.css', 'phone.css'].map((f) => fs.readFileSync(path.join(ROOT, 'src', 'renderer', f), 'utf8')).join('\n');
  fs.writeFileSync(path.join(out, 'mobilemap.css'), pickCss(src, MAP_KEEP));
}
// 종류 로고 같은 그림은 그대로 옮긴다(lib/kinds.js가 dist/index.html 기준 assets/… 주소로 가리킨다)
fs.rmSync(path.join(out, 'assets'), { recursive: true, force: true }); // 지운 그림(예: 옛 Claude 봇)이 dist에 남지 않게
fs.cpSync(path.join(ROOT, 'src', 'renderer', 'assets'), path.join(out, 'assets'), { recursive: true });

// P282: 화면 빌드 표식. 자리 글을 넣은 채 묶은 renderer.js와 renderer.css·index.html의 내용 해시(16자)를 renderer.js 안(__SHELL_BUILD__)과
// dist/build.json에 함께 넣는다. 백엔드가 /web/me로 build.json 값을 알리고, 원격 웹 화면은 자기 값과 다르면 다시 불러온다(shell-update.js)
// P353: 묶음을 나눈 뒤로 표식은 함께 쓰는 조각에 있을 수 있다. 모든 js·css(소스맵 빼고)를 해시에 넣고, 표식이 든 파일마다 바꾼다
{
  const code = fs.readdirSync(out).filter((f) => /\.(js|css)$/.test(f) && f !== 'sw.js').sort();
  const marked = code.filter((f) => f.endsWith('.js') && fs.readFileSync(path.join(out, f), 'utf8').includes(SHELL_MARK));
  if (!marked.length) throw new Error('no output has the shell build mark');
  const h = crypto.createHash('sha256');
  for (const f of ['index.html', ...code]) { h.update(f); h.update(fs.readFileSync(path.join(out, f))); }
  const build = h.digest('hex').slice(0, SHELL_MARK.length);
  for (const f of marked) { const p = path.join(out, f); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').split(SHELL_MARK).join(build)); }
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
