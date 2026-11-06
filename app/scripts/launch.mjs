// Atrium 실행기(P69). 설치 폴더(ATRIUM_INSTALL_DIR, 기본 %LOCALAPPDATA%\atrium\versions)에 launch.mjs로 복사되어 바로가기(Atrium.cmd)가 부른다.
// current.json이 가리키는 버전의 app\scripts\real.mjs를 불러 그 버전의 창을 띄운다. 업데이트 뒤에도 바로가기를 다시 만들 필요가 없다.
// 이 파일은 Node 기본 모듈만 쓴다(설치 폴더에는 node_modules가 없다). 인자는 real.mjs에 그대로 넘긴다(--dry-run 등)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
let cur = null;
try { cur = JSON.parse(fs.readFileSync(path.join(DIR, 'current.json'), 'utf8')); } catch {}
if (!cur || !cur.current) { console.error(`설치된 버전이 없습니다: ${path.join(DIR, 'current.json')}\n저장소 폴더에서 atrium install을 먼저 합니다`); process.exit(1); }
const real = path.join(DIR, cur.current, 'app', 'scripts', 'real.mjs');
if (!fs.existsSync(real)) { console.error(`버전 폴더가 없습니다: ${path.join(DIR, cur.current)}`); process.exit(1); }
const r = spawnSync(process.execPath, [real, ...process.argv.slice(2)], { cwd: path.join(DIR, cur.current, 'app'), stdio: 'inherit' });
process.exit(r.status ?? 1);
