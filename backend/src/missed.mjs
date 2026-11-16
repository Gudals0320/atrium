// 판 밖 대화의 분류와 missed 지우기(P13, BRIEF "판 밖 대화", ARCH 5절 "판 밖 대화 노드·missed").
// - 분류(classifyConvo, 순수 함수): 판에 올림(board), 보관(archived), missed(지울 대화), 도는 시험 대화(live), 데스크톱(desktop), 판 세션(boardSession), 그 밖.
//   missed는 보관(오래돼서 접어 둔 것)과 다르다. 폴더가 없어졌거나 이 앱의 시험 폴더에서 한 CLI·SDK 대화이고, 사용자가 처음부터 지울 것이라 부른 이름 그대로다.
// - 지우기(trashPlan은 순수 함수, trashPaths는 PowerShell): 대화 기록 <대화 ID>.jsonl과 옆의 <대화 ID>/ 폴더만 Windows 휴지통으로 보낸다(바로 지우지 않는다).
//   대화 기록 폴더 뿌리(ATRIUM_CLAUDE_PROJECTS) 밖, 이름이 UUID가 아닌 파일, 지우는 순간 도는 대화·묶인 대화·데스크톱 대화는 거부한다.
//   P174: Codex 대화(rollout)도 같은 규칙으로 보낸다. 뿌리는 $CODEX_HOME/sessions, 이름은 rollout-…-<대화 ID>.jsonl(.zst), 묶임은 잠금 파일·명령줄·방금 기록됨,
//   Codex 데스크톱 앱·편집기 확장 대화는 거부. 같은 대화의 눌린 짝과 하위 에이전트 대화(rollout-…-<부모>_<자식>)는 부모와 함께 보낸다.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { pathKey } from './workspaces.mjs';
import { codexRolloutName } from './codex-convos.mjs';

export const TEST_PREFIX = 'mtask-'; // 이 이름으로 시작하는 폴더(경로의 어느 마디든)는 이 앱의 시험 폴더다(C:\Workspace\mtask-p10-cli 등)
const UUID_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const under = (k, root) => !!root && (k === root || k.startsWith(root + '/'));
// 판 코드 저장소(와 그 워크트리)의 시험 폴더: backend/.dev, experiments 아래
const CODE_TEST = /^(?:\/\.claude\/worktrees\/[^/]+)?\/(?:backend\/\.dev|experiments)(?:\/|$)/;

// 이 앱의 시험 폴더인가 → 'code' | 'tmp' | 'prefix' | null. codeRoots: 판 코드 저장소 폴더들(본 저장소와 이 워크트리), tmp: OS 임시 폴더
export function testDirKind(cwd, { codeRoots = [], tmp = null, prefix = TEST_PREFIX } = {}) {
  const k = pathKey(cwd);
  if (!k) return null;
  for (const r of codeRoots) { const rk = pathKey(r); if (rk && under(k, rk) && CODE_TEST.test(k.slice(rk.length))) return 'code'; }
  if (tmp && under(k, pathKey(tmp))) return 'tmp';
  const pf = String(prefix || '').toLowerCase();
  if (pf && k.split('/').slice(1).some((seg) => seg.startsWith(pf))) return 'prefix';
  return null;
}

const isDesktop = (eps) => (eps || []).some((e) => /desktop/i.test(e));
const isCliOrSdk = (eps) => (eps || []).some((e) => e === 'cli' || /^sdk/i.test(e));

// 대화 하나의 분류. row: 색인 줄(entrypoints, prompts, cwd), binding: convos.mjs bindingOf 결과, boardKnown: 판 세션(열림·닫힘)이 아는 대화인가,
// archived: archive.mjs archiveState().archived, exists: cwd가 남아 있나, testDir: testDirKind 결과
// → { cls, why? }. cls: board | archived | missed | live | desktop | boardSession | sdk | noPrompt | other
//   live: 지금 도는데 폴더가 없거나 시험 폴더(missed가 되지 않고 캔버스에도 올리지 않는다)
export function classifyConvo({ row, binding = { bound: false }, boardKnown = false, archived = false, exists = true, testDir = null }) {
  const eps = row.entrypoints || [];
  if (!row.prompts) return { cls: 'noPrompt' };
  if (isDesktop(eps) || (binding.bound && binding.where === 'desktop')) return { cls: 'desktop' };
  if (boardKnown) return { cls: 'boardSession' };
  if (!isCliOrSdk(eps)) return { cls: 'other' };
  const gone = !row.cwd || !exists;
  if (gone || testDir) {
    if (binding.bound && binding.open) return { cls: 'live', why: gone ? 'gone' : testDir };
    return { cls: 'missed', why: gone ? 'gone' : testDir };
  }
  if (!eps.includes('cli')) return { cls: 'sdk' };
  if (archived) return { cls: 'archived' };
  return { cls: 'board' };
}

// 지울 계획(순수 함수). items: [{ convId, path, cwd?, cls, binding, boardKnown, desktop, harness?, entrypoints? }] (부르는 쪽이 지우기 직전에 다시 판정한 값),
// roots: Claude 대화 기록 폴더 뿌리들, dirExists(p): 옆 폴더가 있는가
// P174: harness 'codex'는 codexRoots($CODEX_HOME/sessions) 아래 rollout-…-<대화 ID>.jsonl(.zst)만. 옆 폴더는 없고,
// codexFiles(convId): 그 대화의 rollout 파일 모두(codex-convos.mjs indexCodexRollouts) 중 같은 대화의 눌린·안 눌린 짝과 하위 에이전트 대화를 함께 보낸다(extras)
// → { ok: [{ convId, file, dir, extras, harness }], refused: [{ convId, reason }] }
export function trashPlan(items, { roots = [], dirExists = () => false, codexRoots = [], codexFiles = () => [] } = {}) {
  const rootKeys = roots.map(pathKey).filter(Boolean);
  const codexKeys = codexRoots.map(pathKey).filter(Boolean);
  const ok = [], refused = [];
  for (const it of items) {
    const file = String(it.path || '');
    const k = pathKey(file);
    const base = file.split(/[\\/]/).pop() || '';
    const no = (reason) => refused.push({ convId: it.convId, reason });
    const codex = !!it.harness && it.harness !== 'claude';
    if (codex && it.harness !== 'codex') { no('harness'); continue; } // 판이 지우는 법을 모르는 하네스의 기록
    const id = String(it.convId || '').toLowerCase();
    if (!path.isAbsolute(file) || k.split('/').includes('..')) { no('bad_path'); continue; }
    const inRoots = (keys, p) => keys.some((r) => p.startsWith(r + '/'));
    if (!inRoots(codex ? codexKeys : rootKeys, k)) { no('outside_root'); continue; }
    if (codex) {
      const r = codexRolloutName(base);
      if (!r || r.child || !UUID.test(id) || r.id !== id) { no('not_uuid'); continue; }
    } else if (!UUID_FILE.test(base) || !UUID.test(id) || base.slice(0, -6).toLowerCase() !== id) { no('not_uuid'); continue; }
    if (it.desktop) { no('desktop'); continue; }
    // Codex 편집기 확장(codex-vscode)·알 수 없는 출처의 대화는 데스크톱 대화처럼 두지 않고 지우지 않는다(분류가 이미 missed로 두지 않는다. 한 번 더 막는다)
    if (codex && (it.entrypoints || []).some((e) => e !== 'cli' && !/^sdk/i.test(e))) { no('editor'); continue; }
    if (it.boardKnown) { no('board_session'); continue; }
    // binding은 지우기용 판정(출처 추측은 빼고 세션 파일, 명령줄, 데스크톱 목록, 방금 기록됨만): 도는 중이거나 어딘가 묶였으면 지우지 않는다
    if (it.binding && it.binding.bound) { no(it.binding.open ? 'running' : it.binding.where === 'desktop' ? 'desktop' : 'bound'); continue; }
    if (it.cls !== 'missed') { no('not_missed'); continue; }
    if (codex) {
      // 같은 대화의 다른 파일(눌린 짝, 하위 에이전트 대화)도 같은 뿌리 아래, 이름의 부모 ID가 이 대화인 것만
      const extras = [...new Set((codexFiles(id) || []).map(String))].filter((p) => {
        const pk = pathKey(p);
        if (pk === k || !path.isAbsolute(p) || pk.split('/').includes('..') || !inRoots(codexKeys, pk)) return false;
        const r = codexRolloutName(p.split(/[\\/]/).pop());
        return !!r && r.id === id;
      });
      ok.push({ convId: it.convId, file, dir: null, extras, harness: 'codex' });
      continue;
    }
    const dir = file.slice(0, -6);
    ok.push({ convId: it.convId, file, dir: dirExists(dir) ? dir : null, extras: [], harness: 'claude' });
  }
  return { ok, refused };
}
// 계획 하나가 휴지통으로 보낼 경로(대화 기록, 옆 폴더, Codex의 함께 보낼 파일)
export const planPaths = (x) => [x.file, ...(x.dir ? [x.dir] : []), ...(x.extras || [])];
export const REFUSE_LABEL = { trash_failed: "휴지통으로 이동 실패", bad_path: "유효하지 않은 경로", outside_root: "대화 기록 폴더 외부의 파일", not_uuid: "파일명이 대화 ID와 맞지 않음", desktop: '데스크톱 앱 대화', editor: '편집기 확장 등 다른 곳의 Codex 대화', board_session: '보드 세션의 대화', running: "실행 중인 대화", bound: "다른 터미널에서 사용 중인 대화", not_missed: "정리 대상이 아닌 대화", not_found: "대화 목록에서 찾을 수 없음", harness: '보드가 지울 수 없는 종류의 대화' };

// 파일과 폴더를 Windows 휴지통으로(Microsoft.VisualBasic FileSystem, 대화상자 없이). 경로 목록은 JSON 파일로 넘긴다(따옴표 문제 없이).
// → { trashed: [path], failed: [{ path, error }] }. 지운 뒤 그 경로가 남아 있으면 실패로 본다
export function trashPaths(paths, { tmpDir }) {
  if (!paths.length) return Promise.resolve({ trashed: [], failed: [] });
  fs.mkdirSync(tmpDir, { recursive: true });
  const list = path.join(tmpDir, `trash-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(list, JSON.stringify(paths), 'utf8');
  const ps = `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName Microsoft.VisualBasic
$out = @(); foreach ($p in (Get-Content -Raw -Encoding UTF8 -LiteralPath $env:MT_TRASH_LIST | ConvertFrom-Json)) {
  try {
    if (Test-Path -LiteralPath $p -PathType Container) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, 'OnlyErrorDialogs', 'SendToRecycleBin') }
    elseif (Test-Path -LiteralPath $p -PathType Leaf) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin') }
    $out += [pscustomobject]@{ p = $p; e = $null }
  } catch { $out += [pscustomobject]@{ p = $p; e = $_.Exception.Message } }
}
ConvertTo-Json -Compress -InputObject @($out)`;
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 120000, env: { ...process.env, MT_TRASH_LIST: list } }, (err, out) => {
      try { fs.unlinkSync(list); } catch {}
      let rows = [];
      try { rows = [].concat(JSON.parse(out || '[]') || []); } catch {}
      const errs = new Map(rows.filter((r) => r && r.e).map((r) => [r.p, r.e]));
      const trashed = [], failed = [];
      for (const p of paths) {
        if (fs.existsSync(p)) failed.push({ path: p, error: errs.get(p) || (err ? err.message : 'still there') });
        else trashed.push(p);
      }
      resolve({ trashed, failed });
    });
  });
}

// 지운 뒤 비게 된 프로젝트 폴더(대화 기록 폴더 뿌리 바로 아래 <폴더 이름>)를 지운다. 뿌리 자체는 지우지 않는다
export function removeEmptyProjectDirs(files, roots) {
  const rootKeys = new Set(roots.map(pathKey));
  const removed = [];
  for (const d of new Set(files.map((f) => path.dirname(f)))) {
    if (rootKeys.has(pathKey(d))) continue;
    if (!rootKeys.has(pathKey(path.dirname(d)))) continue; // 뿌리 바로 아래 폴더만
    try { if (!fs.readdirSync(d).length) { fs.rmdirSync(d); removed.push(d); } } catch {}
  }
  return removed;
}
