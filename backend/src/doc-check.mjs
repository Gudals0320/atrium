// P257: 문서 점검(판이 돌리는 정적 점검). 옛 scripts/check-docs.mjs(ledger 훅)를 판 안으로 옮겼다. git 훅·Claude Code 훅 없이 모든 하네스에서 돈다.
// - 보는 것: 파일별·합계 크기 예산, 허락한 파일 꼴(git 안의 마크다운만: git ls-files, .git/info/exclude로 뺀 기록은 보지 않는다),
//   PLAN의 세 절(지금 / 다음 / 열린 결정), PLAN에 남은 끝남 표시, BRIEF 정한 것 표 행 길이, HEAD보다 커졌는지(git diff만 읽어서).
// - 어겨도 막지 않는다. 판이 지휘 세션의 다음 지시나 done 알림에 한 줄 경고를 붙인다(doc-watch.mjs).
// - 문서 자리는 워크스페이스마다 정한다: 워크스페이스 뿌리의 .atrium/docs.json { dir, budgets, total, leads, off }.
//   없으면 <dir>/.docs-budget.json·뿌리의 .docs-budget.json(옛 예산 파일, "docs/ARCH.md" 꼴 키)을 읽는다. dir 기본은 docs.
//   문서 자리가 따로 받은 git 저장소(<dir>/.git, 공개 저장소의 비공개 문서)면 그 안의 파일 목록과 HEAD는 그 저장소에서 읽는다.
// - .atrium/은 늦게 만든다(첫 위임 때, 사람이 켤 때). git 밖에 두려고 .git/info/exclude에 줄을 더한다(.gitignore가 아니다).
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

export const ATRIUM_DIR = '.atrium';
export const DOCS_CONFIG = '.atrium/docs.json';
export const DOC_DEFAULTS = {
  dir: 'docs',
  // 뿌리 파일(CLAUDE.md·AGENTS.md)은 뿌리 기준, 그 밖은 문서 자리 기준 이름
  budgets: { 'CLAUDE.md': 4000, 'AGENTS.md': 4000, 'BRIEF.md': 20000, 'ARCH.md': 40000, 'PLAN.md': 15000, 'testing.md': 8000, 'README.md': 12000 },
  total: 70000,
  rootAllow: ['README.md', 'README.ko.md', 'CHANGELOG.md', 'CLAUDE.md', 'AGENTS.md', 'LICENSE.md'],
  docsAllow: ['README.md', 'BRIEF.md', 'ARCH.md', 'PLAN.md', 'testing.md'],
  docsDirs: ['research', 'experiments', 'log'],
  briefRowMax: 500,
  growth: { 'BRIEF.md': 500, 'ARCH.md': 1000 }, // HEAD보다 이만큼 넘게 커지면 경고(문장 하나를 고쳐 쓰는 몇십 자는 괜찮다)
};
const ROOT_FILES = ['CLAUDE.md', 'AGENTS.md'];
const LIVE = ['BRIEF.md', 'ARCH.md', 'PLAN.md', 'testing.md', 'README.md'];
const MD = /\.(md|mdx|markdown)$/i;
const PLAN_H2 = /^(지금|다음)(\s*[:：].*)?$|^열린 결정$/;
const PLAN_DONE = /끝남|끝났다|완료했다|\(P\d+[a-z]?\)/g;

const norm = (s) => String(s).replace(/\r\n/g, '\n');
export const countChars = (s) => [...norm(s)].length;
const fmt = (n) => Number(n).toLocaleString('en-US');
const exists = (p) => { try { fs.statSync(p); return true; } catch { return false; } };
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const readJson = (p) => { const t = readText(p); if (t == null) return null; try { return JSON.parse(t.replace(/^﻿/, '')); } catch (e) { return { __bad: e.message }; } };

function git(cwd, args, timeout = 8000) {
  return new Promise((res) => execFile('git', args, { cwd, encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024, env: cleanGitEnv() }, (err, out) => res(err ? null : String(out))));
}
// 훅 안 등에서 넘어온 GIT_DIR·GIT_INDEX_FILE이 다른 저장소를 가리키지 않게 지운다
function cleanGitEnv() { return Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))); }

// 설정 → { ok, config, source, note }. 잘못된 설정은 기본값으로 돌고 note에 까닭(점검 결과의 한 줄)
export function loadDocConfig(root) {
  const config = { ...DOC_DEFAULTS, budgets: { ...DOC_DEFAULTS.budgets }, growth: { ...DOC_DEFAULTS.growth }, leads: [], off: false };
  let source = null; let note = null;
  const own = readJson(path.join(root, DOCS_CONFIG));
  let user = null;
  if (own && own.__bad) note = DOCS_CONFIG + '을 읽지 못했다: ' + own.__bad;
  else if (own) { user = own; source = DOCS_CONFIG; }
  if (typeof (user && user.dir) === 'string' && user.dir.trim()) config.dir = user.dir.trim().replace(/\\/g, '/').replace(/^\.\/|\/+$/g, '') || '.';
  if (!user) {
    for (const rel of [config.dir + '/.docs-budget.json', '.docs-budget.json']) {
      const j = readJson(path.join(root, rel));
      if (j && j.__bad) { note = rel + '을 읽지 못했다: ' + j.__bad; break; }
      if (j) { user = j; source = rel; break; }
    }
  }
  if (user) {
    for (const [k0, v] of Object.entries(user.budgets || {})) {
      const k = k0.startsWith(config.dir + '/') ? k0.slice(config.dir.length + 1) : k0; // 옛 키 "docs/ARCH.md"
      if (Number.isFinite(v) && v > 0) config.budgets[k] = v;
    }
    if (Number.isFinite(user.total) && user.total > 0) config.total = user.total;
    if (Array.isArray(user.leads)) config.leads = user.leads.map((x) => String(x).replace(/^@/, '')).filter(Boolean);
    if (user.off === true) config.off = true;
    for (const k of ['docsAllow', 'docsDirs', 'rootAllow']) if (Array.isArray(user[k])) config[k] = user[k].map(String);
  }
  return { config, source, note };
}

// 문서 자리의 꼴 → { docsAbs, privateRepo, present }. present: 살아 있는 문서(BRIEF·ARCH·PLAN) 가운데 하나라도 있다
export function docPlace(root, config) {
  const docsAbs = path.resolve(root, config.dir);
  const privateRepo = config.dir !== '.' && exists(path.join(docsAbs, '.git'));
  const present = ['BRIEF.md', 'ARCH.md', 'PLAN.md'].some((f) => exists(path.join(docsAbs, f)));
  return { docsAbs, privateRepo, present };
}

// 이 워크스페이스에서 점검을 하는가(꺼 두지 않았고 문서가 있다)
export function docsOn(root) {
  if (!root) return false;
  const { config } = loadDocConfig(root);
  return !config.off && docPlace(root, config).present;
}

// git 안의 마크다운 목록(따로 받은 문서 저장소면 그 저장소에서). git이 아니면 폴더를 한 겹만 본다
async function listFiles(root, config, place) {
  const out = new Set();
  const lsRoot = await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ':(glob)*.md', ...(place.privateRepo || config.dir === '.' ? [] : [':(glob)' + config.dir + '/**'])]);
  if (lsRoot != null) for (const f of lsRoot.split('\0').filter(Boolean)) out.add(f);
  else for (const f of safeDir(root)) if (MD.test(f)) out.add(f);
  if (place.privateRepo) {
    const ls = await git(place.docsAbs, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
    if (ls != null) for (const f of ls.split('\0').filter(Boolean)) out.add(config.dir + '/' + f);
  } else if (lsRoot == null && config.dir !== '.') {
    for (const f of safeDir(place.docsAbs)) out.add(config.dir + '/' + f);
  }
  return [...out];
}
function safeDir(dir) { try { return fs.readdirSync(dir, { withFileTypes: true }).map((d) => d.isDirectory() ? d.name + '/x' : d.name); } catch { return []; } }

// HEAD보다 늘어난 글자 수(git diff만 읽는다). 저장소가 아니거나 HEAD에 없으면 null
async function growthOf(repo, rel) {
  const out = await git(repo, ['diff', '--no-color', '--no-ext-diff', '--unified=0', 'HEAD', '--', rel]);
  if (out == null) return null;
  let add = 0, del = 0;
  for (const l of norm(out).split('\n')) {
    if (l.startsWith('+++') || l.startsWith('---')) continue;
    if (l.startsWith('+')) add += countChars(l.slice(1)) + 1;
    else if (l.startsWith('-')) del += countChars(l.slice(1)) + 1;
  }
  return add - del;
}

function h2s(text) { return norm(text).split('\n').filter((l) => /^## /.test(l)).map((l) => l.slice(3).trim()); }

// 점검 → { root, on, dir, privateRepo, source, note, rows: [{ file, chars, budget, over }], total, problems: [{ code, file, text, short }] }
export async function checkDocs(root, { config: given = null } = {}) {
  const loaded = given ? { config: given, source: 'given', note: null } : loadDocConfig(root);
  const { config } = loaded;
  const place = docPlace(root, config);
  const res = { root, on: !config.off && place.present, dir: config.dir, privateRepo: place.privateRepo, source: loaded.source, note: loaded.note, rows: [], total: { chars: 0, budget: config.total, over: false }, problems: [] };
  if (!res.on) return res;
  const P = (code, file, text, short) => res.problems.push({ code, file, text, short });
  const dirRel = (f) => config.dir === '.' ? f : config.dir + '/' + f;
  const abs = (f) => ROOT_FILES.includes(f) ? path.join(root, f) : path.join(place.docsAbs, f);
  const shown = (f) => ROOT_FILES.includes(f) ? f : dirRel(f);

  // 1. 예산
  for (const [f, budget] of Object.entries(config.budgets)) {
    const t = readText(abs(f));
    if (t == null) continue;
    const chars = countChars(t);
    if (ROOT_FILES.includes(f) || LIVE.includes(f)) res.total.chars += chars;
    const over = chars > budget;
    res.rows.push({ file: shown(f), chars, budget, over });
    if (over) P('budget', shown(f), shown(f) + ': ' + fmt(chars) + '자, 예산 ' + fmt(budget) + '자(' + fmt(chars - budget) + '자 넘음)', f + ' ' + fmt(chars) + '자 > ' + fmt(budget));
  }
  if (res.total.chars > config.total) { res.total.over = true; P('total', null, '살아 있는 문서 합계 ' + fmt(res.total.chars) + '자, 예산 ' + fmt(config.total) + '자. 옮기지 말고 줄인다', '합계 ' + fmt(res.total.chars) + '자 > ' + fmt(config.total)); }

  // 2. 허락한 파일 꼴(git 안의 마크다운만)
  const files = await listFiles(root, config, place);
  for (const rel of files) {
    if (!MD.test(rel)) continue;
    const parts = rel.split('/');
    const inDocs = config.dir === '.' ? parts.length <= 2 : rel.startsWith(config.dir + '/');
    if (config.dir === '.' && parts.length === 1) {
      if (!config.rootAllow.includes(rel) && !config.docsAllow.includes(rel)) P('shape', rel, '뿌리에 허락하지 않은 마크다운: ' + rel + '. 기록이면 git 밖(.atrium/log/)에 둔다', rel + ' 꼴 밖');
      continue;
    }
    if (parts.length === 1) { if (!config.rootAllow.includes(rel)) P('shape', rel, '뿌리에 허락하지 않은 마크다운: ' + rel + '. 기록이면 git 밖(.atrium/log/)에 둔다', rel + ' 꼴 밖'); continue; }
    if (!inDocs) continue;
    const sub = config.dir === '.' ? parts : rel.slice(config.dir.length + 1).split('/');
    if (sub.length === 1) { if (!config.docsAllow.includes(sub[0])) P('shape', rel, dirRel('') + ' 바로 아래에 허락하지 않은 문서: ' + rel + '. 문서는 ' + config.docsAllow.join(', ') + '뿐이다(기록은 git 밖)', rel + ' 꼴 밖'); }
    else if (!config.docsDirs.includes(sub[0])) P('shape', rel, dirRel('') + ' 아래에 허락하지 않은 폴더: ' + dirRel(sub[0]) + '/ (' + rel + '). 폴더는 ' + config.docsDirs.join(', ') + '뿐이다', dirRel(sub[0]) + '/ 꼴 밖');
  }

  // 3·4. PLAN의 세 절과 끝남 표시
  const plan = readText(path.join(place.docsAbs, 'PLAN.md'));
  if (plan != null) {
    const hs = h2s(plan);
    const bad = hs.filter((h) => !PLAN_H2.test(h));
    if (bad.length) P('plan_sections', dirRel('PLAN.md'), dirRel('PLAN.md') + '에 세 절(지금 / 다음 / 열린 결정) 밖의 절 ' + bad.length + '개: "## ' + bad.slice(0, 3).join('", "## ') + '"', 'PLAN 절 밖 ' + bad.length + '개');
    const missing = ['지금', '다음', '열린 결정'].filter((w) => !hs.some((h) => h === w || h.startsWith(w + ':') || h.startsWith(w + '：') || h.startsWith(w + ' ')));
    if (missing.length) P('plan_missing', dirRel('PLAN.md'), dirRel('PLAN.md') + '에 없는 절: ' + missing.join(', '), 'PLAN 절 없음: ' + missing.join('·'));
    const done = norm(plan).match(PLAN_DONE);
    if (done) P('plan_done', dirRel('PLAN.md'), dirRel('PLAN.md') + '에 끝남 표시 ' + done.length + '개(' + [...new Set(done)].slice(0, 4).join(', ') + '). 끝난 일은 PLAN에서 지운다', 'PLAN 끝남 표시 ' + done.length + '개');
  }

  // 5. BRIEF 정한 것 표 행
  const brief = readText(path.join(place.docsAbs, 'BRIEF.md'));
  if (brief != null) {
    const long = norm(brief).split('\n').filter((l) => l.startsWith('|') && countChars(l) > config.briefRowMax);
    if (long.length) P('brief_row', dirRel('BRIEF.md'), dirRel('BRIEF.md') + ': ' + config.briefRowMax + '자를 넘는 표 행 ' + long.length + '개(예: "' + long[0].slice(0, 40) + '…"). 행을 다시 쓴다', 'BRIEF 긴 행 ' + long.length + '개');
  }

  // 6. HEAD보다 커졌는가(git diff만)
  const repo = place.privateRepo ? place.docsAbs : root;
  for (const [f, slack] of Object.entries(config.growth)) {
    if (!exists(abs(f))) continue;
    const rel = place.privateRepo ? f : path.relative(root, abs(f)).split(path.sep).join('/');
    const g = await growthOf(repo, rel);
    if (g != null && g > slack) P('growth', shown(f), shown(f) + '가 HEAD보다 ' + fmt(g) + '자 커졌다(허용 +' + fmt(slack) + '). 덧붙이지 않고 틀린 문장을 고쳐 쓴다', f + ' HEAD보다 +' + fmt(g));
  }
  return res;
}

// 문제 묶음의 서명(같은 문제면 다시 알리지 않는다)
export const problemSig = (res) => (res && res.problems && res.problems.length ? res.problems.map((p) => p.code + ':' + (p.file || '')).sort().join('|') : '');

// 한 줄 경고(막지 않는다). 앞의 둘만 보이고 나머지는 수
export const WARN_MAX = 300;
export function warnLine(res) {
  if (!res || !res.problems || !res.problems.length) return null;
  const ps = res.problems;
  const head = ps.slice(0, 2).map((p) => p.short).join('; ');
  const more = ps.length > 2 ? ' 외 ' + (ps.length - 2) + '개' : '';
  const line = '[Atrium 보드] 문서 점검(막지 않는다): ' + head + more + '. 자세히: atrium docs';
  return line.length > WARN_MAX ? line.slice(0, WARN_MAX - 1) + '…' : line;
}

// 판이 싣는 짧은 규칙. done 알림에 붙는다(지휘 세션이 처음 받는 done에는 RULES, 그 뒤로는 한 줄)
export const DOC_DONE_LINE = '[Atrium 보드] 문서: 이 보고가 ARCH·PLAN과 다르면 틀린 문장을 고친다(덧붙이지 않고 다시 쓴다, 그 코드와 같은 커밋에).';
export function docRules(dir = 'docs') {
  const d = dir === '.' ? '' : dir + '/';
  return '[Atrium 보드] 문서 규칙(' + (d || '뿌리') + '): 문서는 내용의 지금 상태만 담고, 다시 쓰고 덧붙이지 않는다. '
    + d + 'BRIEF.md = 왜·무엇·정한 것(정한 것 표 행 500자 이하, 바뀌면 그 행을 다시 쓴다), '
    + d + 'ARCH.md = 지금의 구조만(조율 값 없음), '
    + d + 'PLAN.md = 지금 / 다음 / 열린 결정만(정해지면 BRIEF 행, 끝난 일은 지운다). '
    + '작업 기록은 보드(일, done 보고)에 있고 문서가 아니다. 고치는 것은 지휘 세션(너)이고 워커는 바꿀 문장을 보고만 한다. '
    + '문서 고침은 그 코드와 같은 커밋에 넣는다. 이 보고가 ARCH·PLAN과 다르면 틀린 문장을 고친다.';
}
// 일 머리 셋째 줄 끝(일을 받는 쪽: 문서는 고치지 않고 보고만)
export const workerTail = (dir = 'docs') => '문서(' + (dir === '.' ? 'BRIEF·ARCH·PLAN' : dir + '/') + ')는 고치지 않고 바꿀 문장을 done 보고에 적는다.';

// .atrium/을 만들고 git 밖에 둔다(.git/info/exclude). → { created, excluded, exclude }
export function ensureAtriumDir(root) {
  const r = { created: false, excluded: false, exclude: null };
  if (!root || !exists(root)) return r;
  const dir = path.join(root, ATRIUM_DIR);
  if (!exists(dir)) { fs.mkdirSync(dir, { recursive: true }); r.created = true; }
  const ex = excludeFileOf(root);
  if (!ex) return r;
  r.exclude = ex;
  const cur = readText(ex) ?? '';
  const has = norm(cur).split('\n').some((l) => /^\/?\.atrium\/?$/.test(l.trim()));
  if (!has) {
    fs.mkdirSync(path.dirname(ex), { recursive: true });
    fs.appendFileSync(ex, (cur && !cur.endsWith('\n') ? '\n' : '') + '# Atrium: 판의 폴더(git 밖)\n/.atrium/\n');
    r.excluded = true;
  }
  return r;
}
// 뿌리의 .git이 폴더면 그 info/exclude, 파일(gitdir: …, 워크트리·하위 모듈)이면 공통 git 폴더의 info/exclude
export function excludeFileOf(root) {
  const g = path.join(root, '.git');
  let st; try { st = fs.statSync(g); } catch { return null; }
  if (st.isDirectory()) return path.join(g, 'info', 'exclude');
  const m = /^gitdir:\s*(.+)$/m.exec(readText(g) || '');
  if (!m) return null;
  const gitDir = path.resolve(root, m[1].trim());
  const common = (readText(path.join(gitDir, 'commondir')) || '').trim();
  return path.join(common ? path.resolve(gitDir, common) : gitDir, 'info', 'exclude');
}

// 사람이 읽는 결과(atrium docs, scripts/check-docs.mjs)
export function reportLines(res) {
  if (!res.on) return ['문서 점검: 꺼짐(' + (res.note || (res.dir + '/에 BRIEF·ARCH·PLAN이 없거나 ' + DOCS_CONFIG + '의 off')) + ')'];
  const lines = ['문서 점검: ' + res.dir + '/' + (res.privateRepo ? '(따로 받은 저장소)' : '') + (res.source ? ', 설정 ' + res.source : ', 기본 설정')];
  if (res.note) lines.push('  설정: ' + res.note);
  for (const r of res.rows) lines.push('  ' + r.file.padEnd(18) + ' ' + fmt(r.chars).padStart(8) + ' / ' + fmt(r.budget).padStart(8) + (r.over ? '  넘음' : ''));
  lines.push('  ' + '합계'.padEnd(18) + ' ' + fmt(res.total.chars).padStart(8) + ' / ' + fmt(res.total.budget).padStart(8) + (res.total.over ? '  넘음' : ''));
  if (!res.problems.length) lines.push('어긴 것 없음.');
  else { lines.push('어긴 것 ' + res.problems.length + '개(막지 않는다. 지휘 세션이 고친다):'); for (const p of res.problems) lines.push('- ' + p.text); }
  return lines;
}
