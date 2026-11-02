// P18 이름 옮기기: 옛 창 프로필(Electron userData, multitask-app-real)을 새 프로필(atrium-app-real)로 복사한다.
// 새 프로필이 없을 때 한 번만(복사한 뒤에는 새 프로필이 있으므로 다시 하지 않는다). 창이 기억하는 것(localStorage: 사이드바 접힘·거르기, 알린 대기 등)을 지킨다.
// 잠금 파일은 빼고, 복사하지 못한 파일(옛 창이 잡고 있는 것)은 건너뛰고 적는다. 옛 프로필은 그대로 둔다. Electron 없이 돈다(단위 시험)
import fs from 'node:fs';
import path from 'node:path';

const SKIP = /^(SingletonLock|SingletonCookie|SingletonSocket|lockfile|LOCK)$/i;
export const PROFILE_MARKER = 'atrium-migrated-from.json';

// → null(옮길 것 없음) | { from, to, at, files, failed: ['상대 경로 까닭', ...] }
export function migrateAppProfile(from, to) {
  if (!from || !to || !fs.existsSync(from) || fs.existsSync(to)) return null;
  const r = { from, to, at: Date.now(), files: 0, failed: [] };
  const walk = (a, b) => {
    fs.mkdirSync(b, { recursive: true });
    for (const name of fs.readdirSync(a)) {
      if (SKIP.test(name)) continue;
      const x = path.join(a, name), y = path.join(b, name);
      try { if (fs.lstatSync(x).isDirectory()) walk(x, y); else { fs.copyFileSync(x, y); r.files++; } } catch (e) { r.failed.push(`${path.relative(from, x)} ${e.code || e.message}`); }
    }
  };
  walk(from, to);
  try { fs.writeFileSync(path.join(to, PROFILE_MARKER), JSON.stringify(r, null, 2)); } catch {}
  return r;
}
