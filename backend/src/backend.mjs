// Atrium 백엔드: 모듈을 묶고 판 API를 구현한다. 터미널은 어댑터로만 부른다.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createTerminalAdapter } from './terminal-backend.mjs'; // P129: 터미널 백엔드는 hc 하나
import { openTerminal, startMigration, stopMigration, migrationView } from './herdr-migrate/index.mjs'; // P129·P132: 옛 판 옮기기(herdr → herdr-core, 계속 지원)
import { Store } from './store.mjs';
import { ApiServer } from './api.mjs';
import { VoiceRelay } from './voice.mjs'; // P165
import { TailscaleWatch, tailscaleHosts } from './tailscale.mjs'; // P49(R3): Tailscale 상태 읽기
import { envVar } from './config.mjs';
import { WebServer, isLocalProcess } from './web.mjs'; // P48(R2): 웹 화면, 짝 맺기, 기기 토큰, 폴더 목록, 업로드
import { DeliveryQueue, bgOnlyOf, steerBlock } from './delivery.mjs';
import { docHandlers } from './doc-watch.mjs'; // P257: 문서 점검 판 API(docs.status·enable·disable)
import { initRepo, gitStateAt } from './ws-git-init.mjs'; // P195: 프로젝트 열기의 Git 저장소로 시작
import { mergerHandlers } from './merger.mjs'; // P267: merger.status | asks | answer
import { botsHandlers } from './bots.mjs'; // P338: bots.status, merger.configs, merger.config.set
import { retireRigRoles } from './old-roles.mjs'; // P269: 옛 rig 역할 세션을 보통 세션으로(한 번)
import { TerminalRelay } from './relay.mjs';
import { PerfTrace } from './perf-trace.mjs'; // P146: 성능 기록
import { Peers, peerHandlers } from './peers.mjs'; // P47: 붙은 클라이언트와 알림 받을 클라이언트
import { viewportKey, viewportFor } from './multiclient.mjs'; // P47: 클라이언트별 화면 위치
import { gitProbe, workspaceOf } from './git.mjs';
import { readMessages, lastExchange, userPromptsSince } from './transcript.mjs';
import { tailLines, isTrustDialog, trustDialogOf, TRUST_SCREEN_KINDS, parseChoices, parsePromptLine, parsePermissionDialog, shellPromptState, parseWorktreeExit, promptOnScreen, claudeInputBox, codexInputBox, dshInputBox, hermesInputBox, hermesPasteState, codexPasteState, codexPasteWanted, hermesReasoningShown, hermesStateOf, isOmhScreen } from './screen.mjs'; // P299: hermesReasoningShown. P309: 셸 안 Hermes·OMH 화면
import { parseTargets, toLF, clip, isBoardNotice, promptTask } from './text.mjs';
import { planAnswer, checkSteps, sameAsk } from './answer.mjs';
import { checkKeys, keyChain, keysBy } from './keys.mjs'; // P104: 휴대폰 키 줄
import { reopenSession } from './user-close.mjs'; // P125
import { writeSessionSettings, fillSessionHooks, buildStartArgs, buildResumeArgv, buildResumeArgs, predictTrust, transcriptPathFor, slash, recoveryPlan, writeBoardPlugin } from './launch.mjs';
import { newRuntime, applyHook, applyTermStatus, applyAgentDetected, applyAgentReleased, applyExitCode, applyExitText, applyTermDisconnected, deriveState, flags, worktreeExitAsk, trackWaiting, screenPermissionAsk } from './state.mjs';
import { worktreeOf, waitClaudeExit, beginBoardExit, endBoardExit } from './worktree-exit.mjs'; // P71: 워크트리 나가기 질문
import { summarizeChanges, CHANGE_KINDS } from './changes.mjs';
import { ResourceMonitor, childProcesses, tableReader } from './resources.mjs';
import { ResourceGuard, transitOf } from './resource-guard.mjs'; // P341: 폭주 감시·우선순위 낮추기
import { ProcControl } from './proc-control.mjs'; // P341: 일시정지·끄기 도우미
import { UsageBook, writeStatusLineScript, writeStatusLineShim } from './usage.mjs'; // P211: 구독 사용량
import { AuthRelay } from './auth-relay.mjs'; // P359: 판 중계기(API 키 과금). P363: SDK 세션이 쓴다
import { CreditBook } from './credit-book.mjs'; // P361: API 크레딧 장부
import { SdkHost, isSdk, SDK_IDLE_MS, SDK_BILLING } from './sdk-session.mjs'; // P363: SDK 세션 종류(claude -p stream-json)
import { probeCodex, probeClaude, probeBalance, findSecretRun } from './usage-probe.mjs'; // P314: 사용량 탐침
import { tailText, screenAnswerText, ROLE_RE } from './links.mjs';
import { workspaceNames, workspaceCounts, elsewhereOf, pathKey } from './workspaces.mjs';
import { migrateWorkspaces } from './migrate.mjs';
import { adoptTwin, reconcileWorkspaces } from './workspace-merge-ops.mjs'; // P37: 폴더 워크스페이스가 저장소가 되면 합치기
import { migrateSingleCanvas } from './migrate-canvas.mjs';
import { NEW_NODE, NEW_NODE_STEP, DEFAULT_ASPECT } from './canvas.mjs'; // P73: 새 세션 크기
import { canvasHandlers, slotFor, placeSpawn, markPinned, anchorWorkspace, onSessionClosed, autoDockSplit, noteNodeMove, settleRegions, migrateDocks, migrateBoxesInside, reflowLines, markHandSize, handSizes } from './canvas-ops.mjs';
import { attachFeatures } from './features.mjs'; // P6b: 출력 보기, Thread, 메모, 칸반, 루프, 미션 맵, 설정(ARCH 4절 I)
import { PERMISSION_MODES as MODES, touchesRemoteRules, resolveBotSettings, EFFORTS } from './settings.mjs';
import { attachRecall } from './recall.mjs'; // P7: 되살리기, 닫힌 세션 다시 열기, 판 밖 대화(ARCH 4절 J)
import { ensureShimExe } from './shim-exe.mjs'; // P208: atrium.exe 꾸러미
import { attachBranch, childShims, childBundle, approvalArgsOf } from './branch.mjs'; // P8: 가지 펼치기(하위 세션 명령, 상한, 나무 자리, ARCH 4절 K)
import { resolveLauncher, checkGateway, checkCommand, splitArgs, startWords, startOpt, effortArgsOf, effortIgnoredLine } from './launchers.mjs'; // P330: effortIgnoredLine
import { takesModel, modelIgnoredLine } from './harness-contract.mjs'; // P330 // P33: 호출자. P97: 실행 명령
import { humanPrompt } from './decisions.mjs'; // P284: 터미널에 직접 친 글
import { orchOf, orchPromptLines } from './orchestration.mjs'; // P296: 자체 오케스트레이션
import { HARNESS_PROMPT, adapterOf, harnessResumable, harnessLaunch, writeLaunchFiles, codexSessionOf, agySessionOf, agyHomeOf, removeWrapperDir, hermesReasoningOf, reasoningIn, omoEffortOf, thinkingIn, piLike } from './harness.mjs'; // P299: Hermes 노력 수준. P329: omo 생각 수준·pi 계열
import { hermesHomeOf, hermesSessionOf, hermesLastAnswer, hermesUsageOf, hermesBusyOf, hermesProgressOf, omhHomeOf } from './hermes.mjs'; // P298: Hermes(+OMH) state.db 읽기 전용
import { registerInnerReader } from './inner-work.mjs'; // P298: Hermes 바쁨 읽개
import { registerProgressReader, registerKindProgress, ProgressWatcher } from './inner-progress.mjs'; // P300: 안 진행 읽개와 감시
import { claudeSubagentProgress } from './claude-subagents.mjs'; // P322: Claude Code 서브에이전트 칩
import { codexSubagentProgress } from './codex-subagents.mjs'; // P326: Codex 서브에이전트 칩
import { dshHomeOf, dshSessionOf, findDshSession, readDshLastAnswer, refreshDshModel, waitDshAnswer } from './dsh.mjs'; // P270: dsh(DeepSeek Harness, dsh-tui) // P115: Claude Code 밖 하네스(env·PATH의 atrium·안내문·이어 가기)
import { attachWorktrees } from './worktrees.mjs'; // P27: 워크트리 영역
import { WorktreeSessions } from './worktree-session.mjs'; // P321: 빠른 워크트리 세션, 병합 맡기기
import { writeHarnessFiles, writeTokenFile, tokenFileOf } from './launch.mjs'; // P115
import { attachDesktopImport } from './desktop-import.mjs'; // P34: 데스크톱 앱 세션 가져오기
import { attachUpdater } from './updater.mjs'; // P69: 앱 안 업데이트
import { attachSleep, draftAfterInput, terminalReportsOnly, backgroundList } from './sleep.mjs'; // P21: 쉬는 Claude 세션 잠재우기와 깨우기(ARCH 5절 잠재우기, 기능 번호 D4 제안)
import { draftEdit, draftMover, stashKeyChanged, clearKeyChanged } from './draft-aside.mjs'; // P128: 쓰다 만 글을 비키고 지시를 보낸 뒤 되돌린다
import { migrateLegacyData, fixLegacyRecords, writeTombstone, MARKER } from './rename-migrate.mjs'; // P18: 이름 옮기기(multitask → Atrium)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const PERMISSION_MODES = new Set(MODES);
const NODE = { ...NEW_NODE, size: NEW_NODE_STEP, aspect: DEFAULT_ASPECT }; // P73: 새 세션은 16:9 가로 보통(canvas.mjs NEW_NODE)
const TOUCH_WRITE_MS = 10000; // 터미널 입력마다 손댄 시각을 쓰지 않는다
const KIND_RE = /^[a-z][a-z0-9_-]{0,31}$/;
const OPEN_PROMPT_MS = 30 * 60 * 1000; // F1: 보낸 지시에 받는 쪽 상태 변화를 이만큼 이어 붙인다
const SHELL = 'shell'; // G2(P5): 에이전트 없는 일반 셸(PowerShell) 패널의 종류
const SHELL_POLL_MS = 2000; // G2: 셸이 프롬프트에서 쉬는지 명령을 돌리는지 보는 간격(화면 읽기 하나에 1ms 안쪽)
const SHELL_PROGRAM_QUIET_MS = 30000; // P309: 프롬프트 줄이 화면에 없는(화면을 차지한) 프로그램의 화면이 이만큼 그대로면 "셸에서 실행 중인 프로그램"(일하는 중으로 세지 않는다)
const SHELL_PROCS_MS = 30000; // G2: 명령을 돌리는 셸의 자식 프로세스 이름을 다시 읽는 간격(PowerShell 한 번, 약 0.5초). 새 명령이 시작되면 바로 읽는다. 오래 도는 명령(npm run dev 등)에 PowerShell을 자주 띄우지 않게 30초로 둔다
// F3: hook이 없는 세션을 끌 때 보내는 키. Claude Code는 /exit, 나머지는 ctrl+c 두 번(codex는 두 번째에 끝난다)
const EXIT_TEXT = { claude: '/exit' };

function apiError(code, message) { return Object.assign(new Error(message), { code }); }
import { m, confirmResult, keyed } from './msg.mjs'; // P16: 화면 글 열쇠
import { closePlan, checkAfter } from './ws-close.mjs'; // P44: 워크스페이스 지우기 판단
import { groupHandlers, readGroups, dropWorkspaces, GROUPS_META, syncWsGroups, wsLabels } from './ws-groups.mjs'; // P44: 가상 그룹. P91: 폴더 위계 묶음(저절로)
import { refreshModel, findCodexRollout, findPiSession, shownModel, sameModel, readPiLastAnswer, resumeModel } from './model-now.mjs'; // P137: 하네스가 지금 쓰는 모델
import { codexHomeOf } from './codex-models.mjs';
import { TempLinks, linkPatch, tempUntilAfter } from './temp-links.mjs'; // P171: 일시 연결
import { linkRelationPlan, linkDefaultRole, LINK_CHOICES } from './relations.mjs'; // P175: 잇는 자리에서 하위·동료
import { shownName, findSession, takenNames, nameOwner, renameSession } from './session-label.mjs';
import { PhoneFeed, phoneHandlers, phoneRoute } from './phone.mjs'; // P353: 휴대폰 전용 간소 페이지(요약 줄, 차이 받기, 휴대폰 이벤트) // P66: 판의 이름(표시 이름)과 에이전트 주소
import { preToolUseDecision } from './atrium-allow.mjs'; // P308: 따옴표 꼴 atrium 명령 허용
import { TodoTidy } from './todo-tidy.mjs'; // P316: 할 일 정리
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
// HTTP 서버 닫기(2026-11-07): http.close는 열린 연결이 모두 끝나야 끝나므로, 쉬는 연결은 바로, 나머지는 forceMs 뒤 끊는다
export async function closeHttp(server, forceMs = 1000) {
  const closed = new Promise((r) => server.close(() => r()));
  try { server.closeIdleConnections(); } catch {}
  const force = setTimeout(() => { try { server.closeAllConnections(); } catch {} }, forceMs);
  await closed;
  clearTimeout(force);
}

// P33: session.spawn 값 → 띄울 값. launcher를 주면 그 호출자를 풀고 함께 준 값이 덮는다.
// P115: 옛 길(P25의 kind·flavor 바로 띄우기)은 없앴다. 그 런처는 연결을 쓰는 보통 claude 런처로 옮겼다(launcher-migrate.mjs)
// P41: launcherDef는 판 기록에 없는 호출자 값(atrium child가 게이트웨이 모델을 그 게이트웨이 호출자의 env로 띄울 때)
export function spawnPlanOf(b, p) {
  const L = b.features && b.features.launchers;
  const over = { model: p.model, effort: p.effort, permissionMode: p.permissionMode, args: Array.isArray(p.args) ? p.args.join(' ') : p.args, command: p.command };
  if (p.launcherDef) { const r = resolveLauncher(p.launcherDef, over); return { ...r, startCommand: p.launcherDef.startCommand || null }; } // P97: 실행 명령이 없는 정의는 부모의 것을 물려받는다(spawn)
  if (p.launcher) {
    if (!L) throw keyed(apiError('no_launcher', `런처를 찾을 수 없습니다: ${p.launcher}`), 'launchers.err.notFound', { ref: String(p.launcher) });
    return resolveLauncher(L.get(p.launcher), over);
  }
  const kind = p.kind || 'claude';
  return { kind, flavor: null, launcher: null, command: '', model: p.model || null, effort: p.effort || null, permissionMode: p.permissionMode || 'manual', extraArgs: [], env: null, gateway: null, args: Array.isArray(p.args) ? p.args.map(String) : splitArgs(p.args), startCommand: null };
}

export class Backend {
  constructor(cfg) {
    this.cfg = cfg;
    this.sessions = new Map(); // sessionId → { ...행, rt, lastState }
    this.termOk = false;
    this.termCompat = null;
    this.termStopping = false;
    this.killing = new Set();
    this.logFile = path.join(cfg.logDir, 'backend.log');
    this.bus = new EventEmitter(); // P6b 기능(features.mjs)에 알린다: session, closed, screenAnswer
    // P54: 판 API는 포트를 연 뒤 바로 요청을 받지만, 처리는 start()가 끝날 때까지 기다린다(뜨는 중의 relay 없음, 터미널 서버에 붙기 전 terminal.stop)
    this.ready = new Promise((r) => { this._markReady = r; });
  }

  log(...a) {
    const line = `${new Date().toISOString()} ${a.join(' ')}`;
    try { fs.appendFileSync(this.logFile, line + '\n'); } catch {}
    if (process.stdout.isTTY) console.log(line);
  }

  // ---------- 시작과 끝 ----------
  // P54: 실패해도 기다리던 요청은 풀어 준다(백엔드는 곧 끝난다)
  async start() {
    try { return await this.startInner(); } finally { this._markReady(); }
  }
  async startInner() {
    const cfg = this.cfg;
    for (const d of [cfg.dataDir, cfg.sessionsDir, cfg.logDir]) fs.mkdirSync(d, { recursive: true });
    try {
      const prev = JSON.parse(fs.readFileSync(cfg.backendFile, 'utf8'));
      if (prev.pid !== process.pid && pidAlive(prev.pid)) throw apiError('already_running', `백엔드가 이미 실행 중입니다 (PID ${prev.pid}, 포트 ${prev.port})`);
    } catch (e) { if (e.code === 'already_running') throw e; }
    // P18: 옛 이름(multitask) 판을 옮긴다(실제 판 프로필에서 한 번). 옮기지 못하면 LegacyBlocked를 던져 뜨지 않는다(새 판을 빈 채로 만들지 않게)
    this.migration = await migrateLegacyData(cfg, { log: (m) => this.log(m) });

    this.store = new Store(cfg.dbFile);
    if (this.migration) {
      this.migration.fixed = fixLegacyRecords(this.store, cfg, this.migration);
      const { from, to, data, move, legacyBackend, problems, fixed } = this.migration;
      if (data === 'moved' || problems.length) this.store.addEvent(null, 'rename_migrated', { from, to, data, move, legacyBackend, problems, fixed });
      this.log(`rename migration ${JSON.stringify({ data, problems, fixed })}`);
    }
    const hb = this.store.getMeta('heartbeat');
    this.previousRun = hb ? { lastHeartbeatAt: hb, downMs: Date.now() - hb, cleanShutdown: !!this.store.getMeta('cleanShutdown') } : null;
    this.store.setMeta('cleanShutdown', false);
    this.apiToken = this.store.getMeta('apiToken') || crypto.randomBytes(24).toString('hex');
    this.store.setMeta('apiToken', this.apiToken);
    this.startedAt = Date.now();
    this.hookUrl = `http://127.0.0.1:${cfg.port}/hooks/claude`;

    // P48(R2): 웹 화면, 짝 맺기, 기기 토큰. 판 API 토큰 연결은 이 PC의 프로세스만, 기기 연결은 같은 출처의 브라우저만 받는다(web.mjs)
    // P49(R3): Tailscale 상태 읽기(바꾸지 않는다). 이름을 Host 허용 목록에 넣고 로그인 사용자를 제한한다
    this.tailscale = new TailscaleWatch({ port: cfg.port, log: (m) => this.log(m), onChange: (ts, info) => this.log(`tailscale: ${ts.status && ts.status.running ? 'running' : 'not running'}, hosts ${info ? info.hosts.length : tailscaleHosts(ts).length}${info && info.added.length ? ` +[${info.added.join(', ')}]` : ''}${info && info.removed.length ? ` -[${info.removed.join(', ')}]` : ''}${info ? `; ${info.why}` : ''}`) }); // P291: 바뀐 이름과 까닭
    this.web = new WebServer({ cfg, store: this.store, api: null, log: (m) => this.log(m), recentDirs: () => this.recentDirs(), tailscale: this.tailscale, settings: () => (this.features ? this.features.settings.get() : {}), wsName: (k) => workspaceNames(this.store.workspaces()).get(k) || null }); // P88: wsName = 푸시 알림의 프로젝트 이름
    this.phoneFeed = new PhoneFeed(); // P353
    this.api = new ApiServer({ token: this.apiToken, ready: this.ready, handlers: { ...this.handlers(), ...this.web.handlers() }, authorize: (req) => this.web.authorize(req, this.apiToken), onOpen: (c) => { this.web.clientOpened(c); if (this.peers) this.peers.opened(); }, onClose: (c) => { this.web.clientClosed(c); if (this.relay) this.relay.detachClient(c); if (this.sleeper) this.sleeper.dropClient(c); if (this.voice) this.voice.dropClient(c); if (this.peers) this.peers.closed(); }, onBinary: (c, d) => this.voice.onBinary(c, d), log: (m) => this.log(m) });
    this.web.api = this.api;
    this.api.phoneRoute = (e, d) => phoneRoute(this.phoneFeed, this, e, d); // P353: 휴대폰 연결이 받을 이벤트
    // P165: 음성 입력 중계(Soniox). 키는 SONIOX_API_KEY에서 백엔드만 읽는다. ATRIUM_SONIOX_URL은 개발용 판의 가짜 서버 시험용
    // P176: ATRIUM_VOICE_IDLE_MS(개발용 판만)는 말 없음 자동 멈춤 시간을 줄이는 시험용
    const voiceIdle = cfg.profile === 'dev' ? Number(process.env.ATRIUM_VOICE_IDLE_MS) : NaN;
    this.voice = new VoiceRelay({ log: (m) => this.log(m), ...(cfg.profile === 'dev' && process.env.ATRIUM_SONIOX_URL ? { url: process.env.ATRIUM_SONIOX_URL } : {}), ...(voiceIdle > 0 ? { idleMs: voiceIdle } : {}) });
    Object.assign(this.api.handlers, this.voice.handlers);
    this.web.push.tree = () => this.pushTree(); // P92: 작업 사이클 끝 판단(하위 세션 나무, 전달·루프·뒤 일)
    this.tailscale.start();
    this.peers = new Peers({ api: this.api, log: (m) => this.log(m) });
    this.http = http.createServer((req, res) => this.onHttp(req, res));
    this.http.on('upgrade', (req, sock, head) => this.api.handleUpgrade(req, sock, head));
    // 포트는 고정이다. 이미 띄운 세션의 hook 주소가 설정 파일 안에 있기 때문이다(ARCH 1절).
    await new Promise((res, rej) => { this.http.once('error', rej); this.http.listen(cfg.port, '127.0.0.1', res); });
    fs.writeFileSync(cfg.backendFile, JSON.stringify({ pid: process.pid, port: cfg.port, token: this.apiToken, startedAt: this.startedAt, profile: cfg.profile, terminalSession: cfg.terminalSession }, null, 2));
    // P18: 옮긴 옛 폴더의 backend.json도 이 백엔드를 가리킨다(열린 옛 창이 옛 백엔드를 다시 띄우지 않고 이 판에 붙는다)
    if (cfg.legacy && fs.existsSync(path.join(cfg.legacy.dataDir, MARKER))) writeTombstone(cfg.legacy.dataDir, { pid: process.pid, port: cfg.port, token: this.apiToken, terminalSession: cfg.terminalSession, movedTo: cfg.dataDir });

    // P129: 터미널 백엔드는 hc 하나다(terminal-backend.mjs). 옛 판이면 옮기기 모듈이 hc(주)와 옛 백엔드를 함께 쥐는 라우터를 준다(뜬 뒤 저절로 옮긴다)
    this.adapter = await openTerminal(this, createTerminalAdapter(cfg));
    this.adapter.resolveTarget = (t) => { const s = this.sessions.get(t) || [...this.sessions.values()].find((x) => x.agentName === t || x.paneId === t); return s ? s.paneId : null; };
    this.log(`terminal backend: hc${this.adapter.mixed && this.adapter.mixed() ? ` (moving from ${this.adapter.backends().filter((n) => n !== 'hc').join(',')})` : ''}`);
    this.adapter.on('log', (m) => this.log(`[${this.adapter.backend}]`, m));
    // P21: 판 터미널에서 친 글로 보내지 않은 초안이 있는지 기억한다(초안이 있으면 잠재우지 않는다)
    // P126: 휠·초점 알림처럼 터미널이 대신 보낸 보고뿐인 입력은 "사람이 치는 중"(전달 규칙 4)으로 세지 않는다
    this.relay = new TerminalRelay({ adapter: this.adapter, remoteBatchMs: envVar('REMOTE_BATCH_MS') != null ? Number(envVar('REMOTE_BATCH_MS')) : undefined, onInput: (sid, data, c) => { const s = this.sessions.get(sid); if (s) { if (!terminalReportsOnly(data)) s.lastUserInputAt = Date.now(); if (this.sleeper && !terminalReportsOnly(data)) this.sleeper.noteInput(c); s.draft = draftAfterInput(s.draft, data); this.noteDraftKeys(s, data); this.touch(s); } if (c) this.peers.touch(c); }, log: (m) => this.log(m) });
    this.keyChain = keyChain(); // P104: session.keys를 세션마다 차례로

    for (const row of this.store.openSessions()) {
      const rt = row.runtime || newRuntime({ kind: row.kind, hooked: row.origin === 'board' && row.kind === 'claude' });
      // P1~P3에서 만든 세션의 runtime에는 종류가 없다(모두 판이 띄운 Claude Code)
      rt.kind ??= row.kind; rt.hooked ??= row.origin === 'board' && row.kind === 'claude';
      delete rt.boardExit; // P119: 닫는 도중 백엔드가 꺼졌으면 그 닫기는 끝났다(남은 질문은 사람에게 보인다)
      // P363: SDK 세션의 프로세스는 백엔드와 함께 끝났다. 늘 받을 수 있는 쉼으로 두고(다음 글에서 --resume) 끊긴 턴은 오류로 보인다
      if (row.billing === SDK_BILLING) { if (rt.term.status === 'working') rt.lastError = { type: 'sdk_exit', message: 'board restarted during the turn', at: Date.now() }; rt.term.present = true; rt.term.status = 'idle'; rt.term.launchPending = false; rt.phase = 'running'; rt.exit = null; }
      this.sessions.set(row.sessionId, { ...row, rt, lastState: null });
    }
    // P22: 그룹과 묶음 실행을 뺐다. 옛 판의 그룹·묶음 항목·그룹 대상 루프를 지우고 무엇을 지웠는지 판 이벤트로 남긴다. 노드는 그 자리에 둔다
    const dropped = this.store.dropGroups();
    if (dropped) { this.store.addEvent(null, 'groups_removed', dropped); this.log(`groups removed ${JSON.stringify(dropped)}`); }
    // P5: P4까지의 판(board.db)을 리포지토리 워크스페이스로 옮긴다. 세션은 시작 폴더로 정하고 노드 자리는 그대로 둔다
    const mig = await migrateWorkspaces(this.store, { resolve: workspaceOf });
    for (const [sid, key] of mig.sessionKeys) { const s = this.sessions.get(sid); if (s) s.workspaceKey = key; }
    if (mig.sessions) { this.store.addEvent(null, 'workspaces_migrated', mig.report); this.log(`workspaces migrated ${JSON.stringify(mig.report)}`); }
    // P6a: 워크스페이스마다 따로이던 판을 캔버스 하나로(영역이 겹치지 않게 통째로 옮김, H1)
    const canv = migrateSingleCanvas(this.store);
    if (canv) { this.store.addEvent(null, 'canvas_migrated', canv); this.log(`single canvas migrated ${JSON.stringify(canv)}`); }
    // P17: 옛 한 줄 덩어리 행을 한 마디짜리 분할 나무로 바꾼다(모양 그대로, H5)
    migrateDocks(this);
    // P37: 같은 폴더를 가리키는 폴더 키와 저장소 키가 함께 있으면(폴더가 판에 열린 뒤 저장소가 됨) 하나로 합친다. 여러 번 돌려도 같다
    await reconcileWorkspaces(this, 'start', { quiet: true }).catch((e) => this.log('workspace merge error', e.stack));
    // P35: 옛 판의 워크트리 위성 영역(리포 영역 바깥)을 리포 영역 안으로 한 번 다시 놓는다(겹침 풀기보다 먼저)
    migrateBoxesInside(this);
    // P9: 이미 겹친 영역은 뜰 때 편다(영역째 오른쪽·아래로 밀어 상대 자리를 지킨다, H1)
    syncWsGroups(this, 'start'); // P91: 폴더가 안팎인 워크스페이스를 한 묶음으로(영역 겹침 풀기가 묶음을 한 덩어리로 본다)
    settleRegions(this, 'start');
    // P211: 구독 사용량(판의 상태 줄 명령이 알린 Claude·AGY 값, Codex rollout). 상태 줄 명령 파일은 판 데이터 폴더 plugin/에 둔다.
    //   하위 세션 명령(설정 파일의 statusLine)보다 먼저 만든다
    this.usage = new UsageBook({
      store: this.store, broadcast: (e, v) => this.api.broadcast(e, v), settings: () => (this.features && this.features.settings ? this.features.settings.get() : {}),
      codexHome: cfg.usageCodexHome, claudeUserSettings: cfg.claudeUserSettings, agyUserSettings: path.join(cfg.agyHome || agyHomeOf(), 'settings.json'),
      script: writeStatusLineScript(path.join(cfg.dataDir, 'plugin')), node: process.execPath, agyShim: process.platform === 'win32' ? writeStatusLineShim(path.join(cfg.dataDir, 'plugin')) : null, pollMs: cfg.usagePollMs, log: (m) => this.log(m),
      // P314: 값이 낡으면 하네스 자신의 사용량 명령으로 묻는다. 그 종류의 판 세션이 일하는 중이면 묻지 않는다(곧 상태 줄·rollout이 준다)
      probe: cfg.usageProbe === false ? {} : {
        codex: () => probeCodex({ command: cfg.usageCodexCommand || 'codex' }),
        claude: () => probeClaude({ command: cfg.usageClaudeCommand || 'claude', dir: path.join(cfg.dataDir, 'usage-probe'), projectsDir: cfg.usageClaudeProjects }),
        balance: () => { const sr = findSecretRun(); return sr ? probeBalance({ secretRun: sr, grant: cfg.usageGrant || 'atrium-usage' }) : Promise.resolve(null); },
      },
      busy: (k) => [...this.sessions.values()].some((s) => !s.closedAt && (s.kind || 'claude') === k && s.rt && s.rt.term && s.rt.term.status === 'working'),
      extra: () => { if (!this.credits) return {}; try { return { apiCredits: this.credits.view() }; } catch (e) { this.log(`api credits view failed: ${e.message}`); return {}; } }, // P361
    });
    this.api.handlers['usage.get'] = () => this.usage.get();
    // P359: 판 중계기. 키는 OS 보호 저장소로 암호화한 암호문만 데이터 폴더에 두고, 푸는 것은 중계기 자식 프로세스뿐이다.
    //   키 넣기·지우기는 이 PC의 창에서만(휴대폰 등 기기 연결은 거부). 답과 로그에는 키 값이 없다(있음/없음만)
    this.authRelay = new AuthRelay({ dataDir: cfg.dataDir, upstream: cfg.authRelayUpstream || (cfg.profile === 'dev' ? process.env.ATRIUM_AUTH_RELAY_UPSTREAM || null : null), log: (m) => this.log(m), onChange: (st) => { this.api.broadcast('relay.status', st); if (this.credits) this.credits.relayChanged(); }, onNotice: (n) => this.relayNotice(n), onMoved: (urlOf) => this.relayMoved(urlOf) });
    const pcOnly = (fn) => (p, c) => { if (c && c.auth && c.auth.kind !== 'local') throw apiError('forbidden', 'only the board on this PC can do this'); return fn(p || {}, c); };
    this.api.handlers['relay.status'] = (p = {}) => ({ ...this.authRelay.status(), recent: this.authRelay.recent(Math.min(Math.max(Number(p && p.limit) || 10, 1), 100)) });
    this.api.handlers['relay.setKey'] = pcOnly((p) => this.authRelay.setKey(p.key));
    this.api.handlers['relay.removeKey'] = pcOnly(() => this.authRelay.removeKey());
    this.api.handlers['relay.stop'] = pcOnly(async () => { await this.authRelay.stop(); return this.authRelay.status(); }); // 다음 SDK 세션 프로세스를 띄울 때 다시 켠다
    // P361: API 크레딧 장부. 붙여 넣기 미리 보기·저장·손 편집과 Admin 키 넣기·지우기는 이 PC의 창에서만. 보기는 usage.get의 apiCredits로도 간다
    this.credits = new CreditBook(this, { relay: this.authRelay, onChange: () => { if (this.usage) this.usage.sendNow(); } });
    this.api.handlers['relay.setAdminKey'] = pcOnly(async (p) => { const r = await this.authRelay.setAdminKey(p.key); this.credits.refreshOfficial({ force: true }).catch(() => {}); return r; });
    this.api.handlers['relay.removeAdminKey'] = pcOnly(async () => { const r = await this.authRelay.removeAdminKey(); await this.credits.refreshOfficial({ force: true }).catch(() => {}); return r; });
    this.api.handlers['credits.get'] = () => this.credits.view();
    this.api.handlers['credits.preview'] = pcOnly((p) => this.credits.preview(p.text));
    this.api.handlers['credits.save'] = pcOnly((p) => this.credits.saveParsed(p));
    this.api.handlers['credits.grant'] = pcOnly((p) => this.credits.grantOp(p));
    this.api.handlers['credits.purchased'] = pcOnly((p) => this.credits.setPurchased(p));
    this.api.handlers['credits.plan'] = pcOnly((p) => this.credits.setPlan(p.plan || null));
    this.api.handlers['credits.clear'] = pcOnly(() => this.credits.clear());
    this.api.handlers['credits.refresh'] = async () => { await this.credits.refreshOfficial({ open: true }).catch(() => {}); return this.credits.view(); };
    // P363: SDK 세션 프로세스(claude -p). 쉬면 idleMs 뒤 끝내고 다음 글에서 --resume
    this.sdk = new SdkHost(this, { idleMs: cfg.sdkIdleMs ?? SDK_IDLE_MS, command: cfg.sdkCommandArgv || null });
    this.api.handlers['usage.refresh'] = () => { if (this.credits) this.credits.refreshOfficial({ open: true }).catch(() => {}); return this.usage.refresh(); }; // P314: 알약을 펼칠 때. P361: 공식 비용도(10분 지났으면)
    // P316: 할 일 정리(자동 할 일 카드 후보를 작은 모델로 걸러 냄, decisions.mjs autoTurn). 단위 시험 판에서는 끈다(진짜 claude를 부르지 않게)
    // P338: 할 일 정리 봇이 런처를 골랐으면 하네스·모델·노력은 그 런처(settings.mjs resolveBotSettings)
    this.todoTidy = new TodoTidy({ settings: () => (this.features && this.features.settings ? resolveBotSettings(this.features.settings.get(), (id) => (this.features.launchers ? this.features.launchers.find(id) : null)) : {}), dir: (cfg.todoTidy ?? !process.env.NODE_TEST_CONTEXT) ? path.join(cfg.dataDir, 'todo-tidy') : null, ...(cfg.todoTidyCall ? { call: cfg.todoTidyCall } : {}), log: (m) => this.log(m) });
    // P298: Hermes의 바쁨 읽개(busy 칸 { reader: 'hermes' }). 그 세션이 띄운 하위 에이전트가 돌거나 턴 임대가 살아 있으면 바쁨
    registerInnerReader('hermes', ({ session }) => { const id = session ? this.harnessSessionIdOf(session) : null; return id ? hermesBusyOf({ id, home: this.hermesHome() }) : null; });
    // P300: Hermes의 안 진행 읽개(같은 busy 칸 { reader: 'hermes' }). OMH dag-ulw 실행 기록, 없으면 Hermes 자체 위임(state.db)
    registerProgressReader('hermes', ({ session, now }) => { const id = session ? this.harnessSessionIdOf(session) : null; return id ? hermesProgressOf({ id, home: this.hermesHome(), omhHome: omhHomeOf(), now }) : null; });
    // P322: Claude Code 세션의 이번 턴 서브에이전트(대화 기록 옆 subagents/, 읽기 전용). 보통 세션(오케스트레이션 아님)에도 종류로 꽂는다
    this.subCache = new Map();
    registerProgressReader('claude-subagents', ({ session: s, now }) => s ? claudeSubagentProgress({ transcript: s.rt.transcriptPath || transcriptPathFor(this.cfg.claudeProjects, s.cwd, s.rt.claudeSessionId || s.sessionId), turnStartedAt: (s.rt.turn && s.rt.turn.startedAt) || s.createdAt || 0, now, stops: new Set(s.rt.subStops || []), cache: this.subCache }) : null);
    registerKindProgress('claude', 'claude-subagents');
    // P326: Codex 세션도 같은 칩(하위 스레드 rollout의 session_meta parent_thread_id = 판 세션의 Codex 스레드 ID). 스레드 ID 찾기는 15초 동안 기억한다
    registerProgressReader('codex-subagents', ({ session: s, now }) => {
      if (!s) return null;
      const t = Date.now();
      if (!s._subTid || t - s._subTid.at > 15000) s._subTid = { at: t, id: this.harnessSessionIdOf(s) };
      return s._subTid.id ? codexSubagentProgress({ threadId: s._subTid.id, home: this.cfg.codexConvoHome || codexHomeOf(), turnStartedAt: (s.rt.turn && s.rt.turn.startedAt) || s.createdAt || 0, now, cache: this.subCache }) : null;
    });
    registerKindProgress('codex', 'codex-subagents');
    // P8: 하위 세션 명령. 플러그인에 일 맡기기 스킬과 atrium 명령을 더하고, 이미 띄운 세션의 설정 파일에 env와 승인 규칙을 더한다
    this.branch = attachBranch(this);
    Object.assign(this.api.handlers, this.branch.handlers);
    this.branch.refreshSettings();
    // P4: 판 플러그인 폴더(판이 띄우는 Claude Code에 --plugin-dir로 넘긴다)
    this.plugin = writeBoardPlugin({ dir: path.join(cfg.dataDir, 'plugin'), ...this.branch.pluginExtra() });
    // P115: Claude Code 밖 하네스에 주는 것: 데이터 폴더 bin/의 atrium(그 세션의 PATH 앞)과 하네스와 상관없는 안내문 파일
    // P184: 하네스의 atrium은 데이터 폴더 bin/lib/에 둔 코드를 부른다(샌드박스 Codex가 판 코드 폴더를 읽지 못해도 데이터 폴더만 읽히면 된다)
    const hbin = path.join(cfg.dataDir, 'bin');
    this.harnessFiles = writeHarnessFiles({ dir: path.join(cfg.dataDir, 'plugin'), binDir: hbin, bin: childShims({ script: path.join(hbin, 'lib', 'bin', 'atrium-child.mjs') }), lib: childBundle(), prompt: HARNESS_PROMPT });
    // P208: PowerShell·cmd가 cmd를 거치지 않게 실행 파일 꾸러미(atrium.exe)를 두 bin 폴더에 둔다(글이 바뀌었을 때만 csc로 빌드, 기다리지 않는다).
    //   단위 시험(node --test)은 빌드하지 않는다(cfg.shimExe로 켜고 끈다)
    if (cfg.shimExe ?? !process.env.NODE_TEST_CONTEXT) this.shimExe = ensureShimExe({ dirs: [hbin, path.join(this.plugin.pluginDir, 'bin')], buildDir: path.join(cfg.dataDir, 'tmp', 'shim-build'), log: (m) => this.log(m) }).catch(() => null);
    // P18: 데이터 폴더를 옮겼으면 --settings·--plugin-dir 경로가 바뀌었다. 이어 가기 인자를 다시 만든다
    if (this.migration && this.migration.data === 'moved') {
      let n = 0;
      for (const s of this.sessions.values()) if (this.hooked(s) && s.resumeArgv) { s.resumeArgv = buildResumeArgv({ claudeCommand: cfg.claudeCommand, ...this.launchOf(s, { launch: false }) }); s.resumeVerified = false; this.store.updateSession(s.sessionId, { resumeArgv: s.resumeArgv, resumeVerified: false }); n++; }
      this.migration.fixed.resumeArgv = n;
    }
    this.adopting = new Set();

    this.queue = new DeliveryQueue({
      store: this.store, cfg, view: (sid, d) => this.deliveryView(sid, d), send: (sid, text) => this.sendPrompt(sid, text),
      // P79: 제출 확인이 늦을 때 화면의 입력 칸을 본다(Claude Code. P106: Codex도 보되 Enter만 하고 다시 보내지 않는다. P270: dsh는 Claude Code처럼. 다른 종류와 셸은 손대지 않는다)
      inspect: async (sid, text) => {
        const s = this.sessions.get(sid); const k = s && (s.kind || 'claude');
        if (isSdk(s)) return { box: 'empty', seen: false, noResend: true }; // P363: SDK 세션은 입력 칸이 없다(stdin 한 줄이 곧 제출). 다시 보내지 않는다
        if (!s || !s.paneId || (k !== 'claude' && k !== 'codex' && k !== 'dsh' && k !== 'hermes')) return null; // P298: hermes도 화면의 입력 칸
        const scr = await this.adapter.readScreen(s.paneId, { source: 'visible' });
        const r = promptOnScreen(scr, text, k);
        if (r.box === 'other') r.peek = (k === 'codex' ? codexInputBox : k === 'dsh' ? dshInputBox : k === 'hermes' ? hermesInputBox : claudeInputBox)(scr).text.slice(0, 60); // P106: 무엇이 보였는지 판 기록에 남긴다
        return k === 'codex' || k === 'hermes' ? { ...r, noResend: true } : r; // P298: hermes도 붙여 넣기(pastePrompt)라 다시 보내지 않는다
      },
      pressEnter: async (sid) => { const s = this.sessions.get(sid); if (s && s.paneId) await this.adapter.paneKeys(s.paneId, ['enter']); },
      drafts: this.draftIo(),
    });
    // P128: 쓰다 만 글을 비킴(aside)·비키지 못함(keep)·되돌림(back). 되돌리지 못한 글은 이 이벤트의 text로 판 기록에 남는다
    this.queue.beforeDeliver = (d) => (this.docs ? this.docs.beforeDeliver(d) : undefined); // P257: 문서 점검 경고 한 줄
    if (this.decisions) this.decisions.wireQueue(this.queue); // P295: 붙잡은 사용자 몫 답을 다음 전달 앞에 싣는다(Branch가 대기열보다 먼저 만들어진다)
    this.queue.on('draft', (r) => {
      this.store.addEvent(r.sessionId, 'delivery_draft', r);
      this.log(`delivery draft ${this.nameOf(r.sessionId)} ${r.deliveryId} ${r.phase}${r.how ? ` ${r.how}` : ''}${r.result ? ` → ${r.result}${r.by ? ` (${r.by})` : ''}` : ''}${r.why ? ` [${r.why}]` : ''} ${r.chars ?? ''} chars`);
      const s = this.sessions.get(r.sessionId);
      if (!s) return;
      if (r.phase === 'aside' && r.how === 'clear') s.draftEdit = { text: '', exact: true, paste: false }; // 판이 Ctrl+C로 비웠다(판 터미널로 오지 않은 키)
      if (r.phase === 'back' && r.result !== 'held') s.draft = true; // 쓰다 만 글이 입력 칸에 돌아왔거나 Claude Code가 쥐고 있다(잠재우지 않는다, P21)
    });
    this.queue.on('screen_check', (r) => { this.store.addEvent(r.sessionId, 'delivery_screen_check', r); this.log(`delivery screen check ${this.nameOf(r.sessionId)} ${r.deliveryId} ${r.why} (${r.box})${r.working ? ' after working' : ''}`); }); // P184: Codex 제출 확인을 못 한 까닭
    this.queue.on('recover', (r) => { this.store.addEvent(r.sessionId, 'delivery_recover', r); this.log(`delivery recover ${this.nameOf(r.sessionId)} ${r.action} (${r.box}) #${r.n}`); });
    // P106: 터미널이 받지 않은 전달(처음 한 번과 까닭이 바뀔 때만 온다), 오래 막힌 전달(한 번), 취소한 뒤에 들어간 시도
    this.queue.on('refused', (r) => this.log(`delivery refused ${this.nameOf(r.sessionId)} ${r.deliveryId} ${r.code} → ${r.reason}, retry in ${r.waitMs}ms (#${r.n})`));
    this.queue.on('stuck', (r) => { this.store.addEvent(r.sessionId, 'delivery_stuck', r); this.log(`delivery stuck ${this.nameOf(r.sessionId)} ${r.deliveryId} ${r.code} (${r.attempts} tries)`); const s = this.sessions.get(r.sessionId); if (s) this.broadcastSession(s, { cause: 'delivery stuck' }); });
    this.queue.on('not_submitted', (r) => { this.store.addEvent(r.sessionId, 'delivery_not_submitted', r); this.log(`delivery not submitted ${this.nameOf(r.sessionId)} ${r.deliveryId}: input box has other text ${JSON.stringify(r.peek || '')}`); }); // P126
    this.queue.on('now', (r) => { this.store.addEvent(r.sessionId, 'delivery_now', r); this.log(`delivery now ${this.nameOf(r.sessionId)} ${r.deliveryId} (${r.state})${r.why ? ` blocked: ${r.why}` : ''}${r.n > 1 ? ` #${r.n}` : ''}`); }); // P172: 판에서 바로 보내기. P289: 앞서 못 넣은 까닭과 누른 수
    // P289: 스티어링을 지금 턴에 넣지 못한 까닭(바뀔 때만 온다). 끝내 못 넣으면 턴이 끝난 뒤 보통 보내기로 들어간다
    this.queue.on('steer_blocked', (r) => { this.store.addEvent(r.sessionId, 'delivery_steer_blocked', r); this.log(`delivery steer blocked ${this.nameOf(r.sessionId)} ${r.deliveryId}: ${r.why}${r.box ? ` (box ${r.box})` : ''}`); });
    this.queue.on('bg_only', (r) => { this.store.addEvent(r.sessionId, 'delivery_bg_only', r); this.log(`delivery bg-only ${this.nameOf(r.sessionId)} ${r.deliveryId}: turn ended, only background work runs → sent now`); }); // P240
    // P258: 미확인으로 끝난 전달이 늦게 제출됐다(압축 뒤 Claude Code가 쥐고 있던 글을 제출 등). 전달은 confirmed로 바뀌었다(delivery 이벤트)
    this.queue.on('late_confirm', (r) => { this.store.addEvent(r.sessionId, 'delivery_late_confirmed', r); this.log(`delivery late confirm ${this.nameOf(r.sessionId)} ${r.deliveryId} (${Math.round(r.afterMs / 1000)}s after unconfirmed)`); if (this.branch && this.branch.onLateConfirm) this.branch.onLateConfirm(r); });
    this.queue.on('late', (r) => { this.store.addEvent(r.sessionId, 'delivery_late', r); this.log(`delivery late ${this.nameOf(r.sessionId)} ${r.deliveryId}: went in after cancel`); });
    this.queue.on('delivery', (d) => {
      this.store.addEvent(d.sessionId, 'delivery', d);
      // P271: 닫힌 세션의 전달(세션 닫힘으로 실패)도 받는 세션 이름을 보인다(보내기 칸의 실패 칩이 "@?"였다)
      this.api.broadcast('delivery', { ...d, name: this.nameOf(d.sessionId) || (this.sessions.has(d.sessionId) ? null : shownName(this.store.getSession(d.sessionId))) });
      const s = this.sessions.get(d.sessionId);
      if (s && d.status === 'unconfirmed') s.draft = true; // P21: 보낸 글이 제출되지 않고 입력 칸에 남았을 수 있다(잠재우지 않는다)
      if (this.branch && ['confirmed', 'unconfirmed', 'failed', 'cancelled'].includes(d.status)) this.branch.onDeliveryEnd(d); // P79: 하위 세션의 첫 요청이 들어가지 않았으면 부모에게
      if (s && d.status === 'confirmed' && s.rt.interruptedTurn) s.rt.interruptedTurn = null; // 새 지시가 들어갔으면 끊긴 턴 표시를 내린다
      // P6a(H3): hook이 없는 세션의 마지막 요청은 판이 보내 제출을 확인한 글로 둔다(멀리 얼굴, 검색)
      if (s && d.status === 'confirmed' && !this.hooked(s)) { const row = this.store.getDelivery(d.deliveryId); if (row && !isBoardNotice(row.text)) { s.rt.lastPrompt = row.text; s.rt.lastPromptAt = Date.now(); } } // P153 r13: 판 알림은 마지막 지시가 아니다
      // P21(D4): 잠든 세션에 보낼 글이 생겼다. 깨운 뒤(ready) 대기열이 보낸다
      if (s && d.status === 'queued' && d.reason === 'sleeping' && this.sleeper) this.sleeper.wakeFor(s, 'delivery').catch(() => {}); // P24: 그 리포의 잠든 세션을 모두 깨운다(P111: 혼자 잠든 세션은 그 세션만)
      if (s) this.broadcastSession(s);
    });
    // P27: 리포마다 살아 있는 워크트리의 영역. 대화 노드(recall)보다 먼저 한 번 읽어 처음부터 워크트리 영역에 놓는다
    this.worktrees = attachWorktrees(this, { tickMs: cfg.worktreePollMs ?? 10000, ...(cfg.wsGoneGraceMs != null ? { goneGraceMs: cfg.wsGoneGraceMs } : {}) });
    Object.assign(this.api.handlers, this.worktrees.handlers);
    await this.worktrees.sync('start').catch((e) => this.log('worktree sync error', e.stack));
    this.features = attachFeatures(this);
    Object.assign(this.api.handlers, this.features.handlers);
    this.wtSessions = new WorktreeSessions(this); // P321: 빠른 워크트리 세션(session.worktree)과 병합 맡기기(merge.request)
    Object.assign(this.api.handlers, this.wtSessions.handlers());
    // P269: rig를 걷어 냈다. 옛 판 DB에 남은 역할 세션을 보통 띄우기 값으로 한 번 바꾼다(호출자 'claude'의 승인 방식이 필요해 features 뒤)
    try { retireRigRoles(this); } catch (e) { this.log('old rig roles error', e.stack); }
    // P146: 성능 기록(진단 스위치). 켜면 창이 보낸 요약을 백엔드 로그에 남기고 10분 뒤 저절로 끈다
    this.perfTrace = new PerfTrace({ settings: this.features.settings, log: (m) => this.log(m) });
    this.perfTrace.start();
    this.api.handlers['perf.report'] = (p, c) => this.perfTrace.report(p, c);
    this.api.handlers['perf.status'] = () => this.perfTrace.status();
    this.recall = attachRecall(this);
    Object.assign(this.api.handlers, this.recall.handlers);
    this.sleeper = attachSleep(this, { tickMs: cfg.sleepTickMs });
    this.progress = new ProgressWatcher(this, { pollMs: cfg.progressPollMs ?? undefined }).start(); // P300: 안 진행(바쁠 때만 몇 초 간격)
    Object.assign(this.api.handlers, this.sleeper.handlers);
    this.desktopImport = attachDesktopImport(this);
    Object.assign(this.api.handlers, this.desktopImport.handlers);
    this.updater = attachUpdater(this); // P69: 새 릴리즈 확인과 업데이트(백엔드만 바꾸고 터미널 서버는 그대로)
    Object.assign(this.api.handlers, this.updater.handlers);

    // 터미널 서버가 백엔드가 꺼진 동안 다시 떴는가(재부팅 포함). 저장한 서버 PID와 비교한다(C3, P3)
    const prevPid = this.store.getMeta('terminalServerPid');
    await this.ensureTerminal();
    // P117: 주 밖의 백엔드(옮기다 남은 세션)의 서버가 없으면 떼고, 그 세션은 백엔드가 꺼진 것으로 본다(다시 붙으면 판이 주 백엔드에서 되살린다)
    const goneBackends = this.adapter.ensureOthers ? await this.adapter.ensureOthers().catch(() => []) : [];
    if (goneBackends.length) { this.log(`terminal backends gone while board was down: ${goneBackends.join(',')}`); for (const s of this.sessions.values()) if (s.paneId && goneBackends.includes(this.adapter.backendOfPane(s.paneId)) && !s.rt.exit) this.markTermStopped(s, 'terminal backend gone while board was down'); this.termWasDown = true; }
    const nowPid = this.adapter.serverPid();
    this.termRestartedWhileDown = !!(prevPid && nowPid && prevPid !== nowPid);
    // P18: 판을 옮겼으면 새 터미널 서버에는 판 세션이 없다. 서버가 다시 뜬 것으로 보고 J1 되살리기로 이어 간다
    if (this.migration && this.migration.data === 'moved') this.termRestartedWhileDown = true;
    if (nowPid) this.store.setMeta('terminalServerPid', nowPid);
    if (this.termRestartedWhileDown) this.log(`terminal server changed while backend was down: ${prevPid} → ${nowPid}`);
    this.adapter.on('event', (e) => this.onTermEvent(e).catch((err) => this.log('terminal event error', err.stack)));
    this.adapter.on('connected', () => this.onTermConnected().catch((err) => this.log('resync error', err.stack)));
    this.adapter.on('disconnected', (which) => this.onTermDisconnected(which));
    if (this.termCompat && this.termCompat.ok) this.adapter.startEvents(() => [...this.sessions.values()].map((s) => s.paneId).filter(Boolean));
    const setSettings = this.api.handlers['settings.set'];
    this.api.handlers['settings.set'] = async (p, c) => {
      // P49: 원격 접속 규칙(remote*)은 이 PC의 창·CLI만 바꾼다
      if (c && c.auth && c.auth.kind !== 'local' && touchesRemoteRules(p)) throw Object.assign(new Error('only the board on this PC can change remote access rules'), { code: 'forbidden' });
      const wasAccepting = this.web.accepting();
      const wasPasskey = this.web.passkeyOn();
      const wasChannel = this.updater ? this.updater.channel() : null;
      const r = await setSettings(p, c);
      if (this.perfTrace) this.perfTrace.changed(); // P146: 성능 기록을 켜고 끈 때
      if (this.updater && this.updater.channel() !== wasChannel) this.updater.channelChanged(); // P70: 업데이트 채널을 바꾸면 곧바로 다시 확인한다(기다리지 않는다)
      const nowAccepting = this.web.accepting();
      if (nowAccepting !== wasAccepting) r.remote = this.web.accessChanged(nowAccepting); // P58: 원격 받기 끄기·켜기(끄면 붙은 원격 연결을 닫는다)
      const nowPasskey = this.web.passkeyOn();
      if (nowPasskey !== wasPasskey) r.passkey = this.web.passkeyChanged(nowPasskey); // P62: 패스키로 확인 켜기·끄기
      return r;
    };

    this.queue.start();
    this.heartbeat = setInterval(() => {
      this.store.setMeta('heartbeat', Date.now());
      // P114 2b: hc의 "서버 PID"는 터미널을 쥔 holder라 첫 세션이 생길 때 정해진다. 붙을 때만 저장하면 백엔드가 다시 뜰 때 옛 값과 견준다
      if (this.adapter.connected) { const pid = this.adapter.serverPid(); if (pid && pid !== this._hcPidSaved) { this._hcPidSaved = pid; this.store.setMeta('terminalServerPid', pid); } }
    }, 2000);
    this.store.setMeta('heartbeat', Date.now());
    this.quietTimer = setInterval(() => { for (const s of this.sessions.values()) this.broadcastSession(s, { onlyIfFlagsChanged: true }); }, 10000);

    // F4: 세션 폴더의 git(워크트리). hook이 없는 세션은 터미널이 아는 폴더를 주기적으로 본다
    for (const s of this.sessions.values()) this.probeGit(s, s.rt.cwd || s.cwd);
    this.gitTimer = setInterval(() => this.pollCwd().catch(() => {}), cfg.gitPollMs);
    // G2: 일반 셸이 쉬는지, 무슨 명령을 돌리는지
    // P137: 하네스가 지금 쓰는 모델(/model, Codex 모델 바꾸기). 기록 파일이 늘어난 만큼만 읽는다
    this.modelTimer = setInterval(() => this.pollModels(), cfg.modelPollMs ?? 5000);
    this.shellTimer = setInterval(() => this.pollShells().catch((e) => this.log('shell poll error', e.stack)), SHELL_POLL_MS);
    // P171: 읽기 선 정리(한 번)와 일시 선 쓸기
    this.tempLinks = new TempLinks(this);
    try { this.tempLinks.start(); } catch (e) { this.log('temp links start error', e.stack); }
    // D1: 자원 감시. P348: 표는 도우미 snapshot으로 먼저 읽는다(tableReader)
    this.proc = new ProcControl({ dir: path.join(cfg.dataDir, 'bin'), log: (m) => this.log(m) }); // P341: 일시정지·끄기 도우미
    this.resources = new ResourceMonitor({
      intervalMs: cfg.resourcesIntervalMs,
      fastIntervalMs: cfg.resourcesFastMs, // P348
      readTable: tableReader(this.proc, undefined, (m) => this.log(m)),
      sessions: () => [...this.sessions.values()].map((s) => { const d = deriveState(s.rt); return { sessionId: s.sessionId, name: s.name, paneId: s.paneId, present: s.rt.term.present, state: d.state, ...transitOf(d, s), kind: s.kind || null, bgOnly: (() => { try { return !!this.deliveryView(s.sessionId).bgOnly; } catch { return false; } })() }; }), // P348: transit·transitAt(전환 중·뒤 판정 쉼). P341: kind(셸 패널은 무거움으로만), bgOnly(턴은 끝났고 뒤 일만 돈다 = 쉬는 세션으로 본다)
      processInfo: (paneId) => this.adapter.processInfo(paneId),
      controllers: () => this.relay.stats(),
      serverPid: () => this.adapter.serverPid(),
      log: (m) => this.log(m), // P168: 버린 이상한 값
    });
    // P341: 폭주 감시와 우선순위 낮추기. 측정이 끝날 때마다(창에 보내기 전) 줄에 guard를 싣고 카드·우선순위를 다룬다
    this.guard = new ResourceGuard(this, { monitor: this.resources, proc: this.proc, settings: () => (this.features && this.features.settings ? this.features.settings.get() : {}) });
    this.resources.nextDelay = () => this.guard.nextDelay();
    this.resources.after.push(async (snap, mon) => { await this.guard.step(snap, mon); snap.guard = this.guard.status(); });
    Object.assign(this.api.handlers, this.guard.handlers());
    if (!process.env.NODE_TEST_CONTEXT) this.proc.ensure().catch(() => {}); // 도우미 빌드(글이 바뀌었을 때만). 단위 시험 판에서는 누를 때 빌드한다
    { const set0 = this.api.handlers['settings.set']; if (set0) this.api.handlers['settings.set'] = async (p, c) => { const r = await set0(p, c); try { this.guard.onSettings(); } catch {} return r; }; } // 우선순위 끔 → 곧바로 되돌린다
    this.resources.start((snap) => this.api.broadcast('resources', snap));
    this.usage.start(); // P211
    if (this.credits) this.credits.start(); // P361: 공식 비용 주기 조회와 만료 알림
    this.store.addEvent(null, 'backend_started', { pid: process.pid, previousRun: this.previousRun });
    this.log(`backend up pid=${process.pid} port=${cfg.port} profile=${cfg.profile} terminal=${cfg.terminalSession} previousRun=${JSON.stringify(this.previousRun)}`);
  }

  async stop(reason = 'stop') {
    this.log('backend stopping:', reason);
    clearInterval(this.heartbeat); clearInterval(this.quietTimer); clearInterval(this.gitTimer); clearInterval(this.shellTimer); clearInterval(this.modelTimer);
    if (this.tempLinks) this.tempLinks.stop();
    stopMigration(this);
    this.resources.stop();
    if (this.usage) this.usage.stop(); // P211
    if (this.credits) this.credits.stop(); // P361
    if (this.sdk) await this.sdk.stopAll().catch(() => {}); // P363: SDK 세션 프로세스도 판과 함께 끝난다(다음 글에서 --resume)
    if (this.authRelay) await this.authRelay.stop().catch(() => {}); // P359: 판과 함께 끈다
    this.queue.stop();
    if (this.features) this.features.stop();
    if (this.perfTrace) this.perfTrace.stop();
    if (this.recall) this.recall.stop();
    if (this.worktrees) this.worktrees.stop();
    if (this.sleeper) this.sleeper.stop();
    if (this.progress) this.progress.stop(); // P300
    if (this.updater) this.updater.stop();
    this.relay.closeAll();
    if (this.voice) this.voice.closeAll(); // P165
    this.peers.stop();
    this.adapter.stopEvents();
    for (const s of this.sessions.values()) this.store.saveRuntime(s.sessionId, s.rt);
    this.store.setMeta('heartbeat', Date.now());
    this.store.setMeta('cleanShutdown', true);
    this.store.addEvent(null, 'backend_stopped', { reason });
    this.api.close();
    if (this.web) this.web.stop();
    if (this.tailscale) this.tailscale.stop();
    // 2026-11-07: 열린 연결이 남아 있으면 http.close가 끝나지 않는다(하위 세션을 띄우며 기다리던 atrium child 요청이 업데이트를 1분 넘게 붙잡았다).
    // 기다리는 /branch 요청에 먼저 답하고, 쉬는 연결은 바로, 나머지는 1초 뒤 끊는다
    const aborted = this.branch && this.branch.abortInflight ? this.branch.abortInflight() : 0;
    if (aborted) this.log(`answered ${aborted} waiting /branch request(s) before stopping`);
    await closeHttp(this.http);
    try { const b = JSON.parse(fs.readFileSync(this.cfg.backendFile, 'utf8')); if (b.pid === process.pid) fs.rmSync(this.cfg.backendFile); } catch {}
    this.store.close();
  }

  // P359: 중계기가 죽었다(다시 띄움 restarted | 그만 둠 down). 판 로그·기록과 창 알림 한 줄(relay.notice)
  relayNotice(n) {
    this.store.addEvent(null, `auth_relay_${n.kind}`, { code: n.code ?? null });
    this.api.broadcast('relay.notice', { kind: n.kind, code: n.code ?? null, at: Date.now() });
  }
  // P359: 중계기 포트가 바뀌었다(옛 포트가 막힘). 열린 API 세션의 설정 파일 주소를 새 주소로 고친다(이미 도는 claude는 다시 띄울 때 읽는다)
  // P363: SDK 세션은 프로세스를 띄울 때마다 그때의 중계기 주소를 env로 받으므로 고칠 파일이 없다(도는 프로세스는 끝난 뒤 새 주소로 다시 뜬다)
  relayMoved() { this.log('auth relay moved: SDK sessions pick up the new address on their next start'); }

  // 터미널 서버(hc)가 없으면 띄우고(깨끗한 환경, 고정 빌드가 없으면 받는다) 버전을 확인한다(ARCH 1절).
  // 받거나 띄우지 못하면 던지지 않고 그 상태로 둔다(보드는 연다. 세션 시작만 막는다, P122)
  async ensureTerminal() {
    const p = await this.adapter.probe();
    let pong = p.pong;
    this.termMissing = null;
    if (!p.running) {
      let r;
      try { r = await this.adapter.startServer(); }
      catch (e) {
        this.termMissing = { reason: e.code || 'start_failed', error: e.detail || e.message, path: this.adapter.exePath || null, at: Date.now() };
        this.termCompat = { ok: false, level: 'missing', problems: [`terminal server did not start: ${e.code}: ${e.detail || e.message}`], version: null, protocol: null, capabilities: null, warning: null };
        this.termOk = false;
        this.log(`terminal server start failed (${this.adapter.exePath || 'no exe'}): ${e.message}`);
        this.store.addEvent(null, 'terminal_missing', { reason: e.code, error: e.detail || e.message });
        return this.termCompat;
      }
      pong = r.pong;
      this.log(`terminal server started pid=${r.pid} in ${r.ms}ms exe=${this.adapter.exePath}`);
      this.store.addEvent(null, 'terminal_started', { pid: r.pid, by: 'backend' });
    }
    this.setTermCompat(this.adapter.checkCompat(pong));
    return this.termCompat;
  }
  // P40: 호환 결과를 두고, 시험하지 않은 버전·다른 세대면 판 이벤트와 로그로 한 번씩 알린다
  setTermCompat(c) {
    this.termCompat = c;
    this.termOk = !!c.ok;
    const key = `${c.level}:${c.version}:${c.protocol}`;
    if (key === this._compatNoted) return;
    this._compatNoted = key;
    if (c.level === 'untested') { this.log(`terminal untested: ${c.warning}`); this.store.addEvent(null, 'terminal_untested', { version: c.version, protocol: c.protocol, tested: c.tested }); }
    if (c.level === 'incompatible') { this.log('terminal incompatible:', c.problems.join('; ')); this.store.addEvent(null, 'terminal_incompatible', { version: c.version, protocol: c.protocol, problems: c.problems }); }
  }
  // 창이 띠와 표시에 쓰는 터미널 상태(이벤트 terminal). P129: migration은 옛 판 옮기기 진행
  terminalView() {
    const c = this.termCompat || {};
    return {
      backend: 'hc', hcVersion: c.hcVersion || null,
      terminals: this.adapter && this.adapter.view ? this.adapter.view() : null, // 붙은 백엔드(옛 판을 옮기는 동안 둘)
      connected: !!(this.adapter && this.adapter.connected), session: this.cfg.terminalSession, path: this.adapter ? this.adapter.exePath || null : null,
      missing: this.termMissing || null, level: c.level || null, version: c.version || null, protocol: c.protocol ?? null, warning: c.warning || null, problems: c.problems || [],
      migration: migrationView(this),
    };
  }
  // P129·P132: 이벤트 terminal. 옛 이름 herdr는 P132에서 뺐다(업데이트는 옛 창을 끄고 새 버전의 창을 띄운다, update-swap.mjs)
  broadcastTerminal(v = this.terminalView()) { this.api.broadcast('terminal', v); }

  // ---------- 세션 표시 ----------
  // 판의 hook이 붙은 세션(판이 띄운 Claude Code). 나머지는 터미널 상태(7501)와 화면으로만 본다(P4)
  hooked(s) { return s.rt.hooked !== false; }
  nameOf(sid) { return shownName(this.sessions.get(sid)); } // P66: 보이는 이름(판의 이름이 있으면 그것)
  sessionByPane(paneId) { for (const s of this.sessions.values()) if (s.paneId === paneId) return s; return null; }
  resolve(ref) {
    if (!ref) throw apiError('bad_request', 'session required');
    const s = findSession(this.sessions.values(), ref); // P66: 세션 ID, 주소(에이전트 이름), 판의 이름
    if (s) return s;
    throw keyed(apiError('not_found', `보드에서 세션을 찾을 수 없습니다: ${ref}`), 'sessionNotFound', { ref });
  }
  // P128: 판 터미널로 받은 사람 입력에서 입력 칸의 글을 다시 만든다(Codex 되돌리기에 쓴다). 사람이 Claude Code 입력 치워 두기(Ctrl+S)를 눌렀으면
  // 제출(Enter)할 때까지 판은 Ctrl+S를 쓰지 않는다(치워 둔 사람의 글을 덮는다)
  noteDraftKeys(s, data) {
    if (terminalReportsOnly(data)) return;
    s.draftEdit = draftEdit(s.draftEdit, data, { newlineKey: s.kind === 'opencode' || piLike(s.kind) }); // P131: opencode·pi의 Ctrl+J는 줄바꿈. P329: omo(pi 계열)도
    const t = String(data || '');
    if (t.includes('\x13')) s.userStash = true;
    else if (t.includes('\r') && !t.includes('\x1b[200~')) s.userStash = false;
  }
  // P128: 전달 대기열의 쓰다 만 글 비키기·되돌리기(draft-aside.mjs). 입력 칸을 읽을 수 있는 종류만(Claude Code, Codex, P131: opencode, pi)
  draftIo() {
    const pane = (sid) => { const s = this.sessions.get(sid); if (!s || !s.paneId) throw Object.assign(new Error('no pane'), { code: 'pane_not_found' }); return s.paneId; };
    const m = draftMover({
      // P135: 판이 받은 사람 입력으로 보아 보내지 않은 글이 있을 수 있다(s.draft: 글자를 친 뒤 Enter·Ctrl+C·제출 hook이 없었다, draftEdit: 다시 만든 글).
      //   이때 입력 칸을 못 읽으면 보내지 않고 기다린다
      pending: (sid) => { const s = this.sessions.get(sid); return !!(s && (s.draft || (s.draftEdit && s.draftEdit.text))); },
      read: (sid) => this.adapter.readScreen(pane(sid), { source: 'visible' }),
      // P139: Claude Code의 다음 메시지 제안(흐린 글)을 사람의 글과 가르려고, 입력 칸에 글이 보일 때만 ANSI 화면을 읽는다
      readAnsi: (sid) => this.adapter.readScreen(pane(sid), { source: 'visible', format: 'ansi' }),
      // P130: 비키는 키(Ctrl+S·Ctrl+C)는 판 입력(hc AUTOMATIC_INPUT)이라 뒤따르는 terminal.send가 조용한 틈을 기다리지 않는다.
      // 되돌리는 키(Codex 붙여넣기, Claude Code 빈 칸의 Ctrl+S)는 사람의 글을 입력 칸에 돌려놓는 것이라 사람 입력(DATA)으로 친다:
      // hc는 send 뒤 그 전달이 끝날 때까지 판 입력을 잡아 두어(턴이 곧 끝나면 3~10초) 되돌린 글이 늦게 보였다. 사람 입력은 곧 들어간다(약 1.7초)
      type: (sid, raw, o) => this.adapter.sendText(pane(sid), raw, { person: !!(o && o.back) }),
      // 여러 줄은 어댑터가 괄호 붙여넣기로 감싼다(hc sendText). 한 줄도 괄호로 감싸 하네스가 글자를 단축키로 읽지 않게 한다
      paste: (sid, text) => this.adapter.sendText(pane(sid), /\n/.test(text) ? text : `\x1b[200~${text}\x1b[201~`, { person: true }),
      kindOf: (sid) => { const s = this.sessions.get(sid); return s && s.paneId ? s.kind || 'claude' : null; },
      edit: (sid) => { const s = this.sessions.get(sid); return s ? s.draftEdit || null : null; },
      userStash: (sid) => { const s = this.sessions.get(sid); return !!(s && s.userStash); },
      stashKey: !stashKeyChanged(),
      clearKey: (kind) => !clearKeyChanged(kind), // P131: 사람이 opencode·pi의 입력 비우기 키를 바꿨으면 쓰지 않는다(설정 파일은 읽기만)
      typedSince: (sid, t) => { const s = this.sessions.get(sid); return !!(s && s.lastUserInputAt && s.lastUserInputAt >= t); },
    }, { pollMs: this.cfg.draftPollMs ?? 250 });
    return {
      aside: (sid) => m.aside(sid),
      back: async (sid, held, d) => {
        const r = await m.back(sid, held, d);
        const s = this.sessions.get(sid);
        if (s && held.how === 'clear' && r.result === 'restored' && !r.folded) s.draftEdit = { text: held.text, exact: held.exact !== false, paste: false };
        return r;
      },
    };
  }
  deliveryView(sid, d) {
    const s = this.sessions.get(sid);
    if (!s) return { closed: true };
    const sleeping = this.sleeper && this.sleeper.going.has(sid); // P21: 잠재우는 중에는 보내지 않는다(끝나면 깨운다)
    const ds = deriveState(s.rt), st = ds.state;
    // 깨우는 중에는 준비된 뒤 잠깐 더 기다린다(sleep.mjs WAKE_SETTLE_MS: 입력 칸이 Enter를 받기 전에 보내면 제출되지 않는다)
    const gated = this.branch && this.branch.holds(sid); // P36: 신뢰 관문을 지나 claude -w로 뜰 때까지 보내지 않는다
    const state = sleeping ? 'sleeping' : gated ? 'starting' : s.waking && st !== 'sleeping' ? 'starting' : s._readyInput && st === 'ready' ? 'starting' : st; // P299: 준비된 뒤 넣을 글(Hermes /reasoning)을 넣는 동안은 보내지 않는다
    // P240: 턴은 끝났고 뒤 일만 돈다(bgOnlyOf). 전달은 쉬는 세션처럼 보낸다. 판의 상태(working)와 뒤 일 표시는 그대로
    const bg = state === 'working' ? (this.sleeper ? this.sleeper.bgView(s) : (s.kind || 'claude') === 'claude' && s.paneId && !s.rt.sleep ? backgroundList(s.rt.bg, null) : null) : null;
    const bgOnly = state === 'working' && bgOnlyOf(s.rt, ds, bg, { kind: s.kind || 'claude', hooked: this.hooked(s) });
    return { state, agentPresent: s.rt.term.present, termConnected: isSdk(s) ? true : this.adapter.connected, /* P363: SDK 세션은 터미널이 없다 */ lastUserInputAt: s.lastUserInputAt, closed: false, kind: s.kind || 'claude', hooked: this.hooked(s), bgOnly, orch: s.orch || null }; // P296: orch(대기열만) // P90: kind·hooked는 바로 넣기(canTypeNow)가 본다
  }

  summary(s) {
    const rt = s.rt;
    const d = deriveState(rt);
    const f = flags(rt, { seenAt: s.seenAt, delivering: this.queue ? this.queue.pending(s.sessionId) : 0, quietMs: this.cfg.quietMs });
    const waitingSince = trackWaiting(rt, d); // P141(#14): 다시 켜도 이어지는 응답 필요 시작 시각
    const ask = d.ask ? this.askView(s, { ...d.ask, input: undefined, waitedMs: (waitingSince || d.ask.since) ? Date.now() - (waitingSince || d.ask.since) : null }) : null;    return {
      sessionId: s.sessionId, name: shownName(s), cwd: s.cwd, paneId: s.paneId, termWorkspaceId: s.termWorkspaceId,
      address: s.name, label: s.label || null, // P66: name은 보이는 이름, address는 에이전트가 쓰는 주소(에이전트 이름), label은 사람이 정한 이름(없으면 null)
      state: d.state, estimate: d.estimate || null, termStatus: rt.term.status, ask, waitingSince, error: d.error || rt.lastError || null,
      permissionMode: rt.permissionMode || s.permissionMode, ...shownModel({ model: s.model, effort: s.effort }, s.rt.modelNow), // P95: 미션 맵 카드의 메타 줄. P137: 하네스가 지금 쓰는 값(모르면 띄운 값)
      launchModel: s.model || null, launchEffort: s.effort || null,
      lastPrompt: clip(promptTask(rt.lastPrompt), 300), // P159: 관계 줄은 떼고 보인다
      lastAnswer: clip(rt.lastAnswer, 300), lastAnswerAt: rt.lastAnswerAt, turn: rt.turn, // P234: P159에서 위 주석 뒤로 들어가 빠져 있던 칸(작업 완료가 둘 넘으면 inbox가 turn.endedAt에서 던졌다)
      work: rt.lastWork || null, // P173: 끝난 일 구간 { since, endedAt, turnless, compact? }. turnless면 턴이 아니다(압축). 웹 푸시·연결 알림이 본다
      exit: rt.exit, interruptedTurn: rt.interruptedTurn, recovered: s.recovered || null, ...f, ...this.doneScope(s, f),
      deliveryStuck: this.queue && this.queue.stuckOf ? this.queue.stuckOf(s.sessionId) : null, // P106: 터미널이 오래 받지 않는 맨 앞 전달 { deliveryId, reason, code, attempts, since }
      trust: { predictedDialog: rt.trustPredicted, seenOnScreen: !!rt.trustScreen },
      resume: this.hooked(s) ? { registered: !!s.resumeArgv } : null, // 판이 이어 갈 줄이 있는가(hook이 없는 세션은 판이 이어 가기를 맡지 않는다). P129: 터미널에 등록·확인하던 것(verified)은 없앴다
      hooks: { count: s.hookCount || 0, lastAt: rt.lastHookAt, lastAuthOk: s.lastHookAuthOk ?? null },
      createdAt: s.createdAt, seenAt: s.seenAt, touchedAt: s.touchedAt || null, lastActivityAt: rt.lastActivityAt,
      memMB: this.memOf(s.sessionId),
      // P4
      kind: s.kind || 'claude', origin: s.origin || 'board', parentSessionId: this.workParentOf(s.sessionId), lineageParentSessionId: s.parentSessionId || null, hooked: this.hooked(s), agentName: s.agentName, // P159: 보이는 부모는 일 부모, 계보(띄운 세션)는 사실로 따로
      flavor: s.flavor || null, // P25: 띄운 방법(런처의 아이콘). 창은 종류 대신 이것으로 로고와 이름을 보인다
      billing: s.billing || null, // P363: 'sdk'면 판이 claude -p로 돌리고 판 중계기를 거쳐 API 키(월 API 크레딧)로 과금(카드·맵·휴대폰의 SDK 표시)
      sdk: isSdk(s) ? this.sdk.view(s) : null, // P363: 프로세스가 도는가 { alive, pid, startedAt, resume }
      // P92: 도는 Claude Code 뒤 일. P164: Stop hook 목록과 claude 아래 도구 명령 프로세스를 합친 것 { n, kinds, items: [{ kind, label }], at, via } | null(세션 맵 표시)
      background: this.sleeper ? this.sleeper.bgView(s) : (s.kind || 'claude') === 'claude' && s.paneId && !rt.sleep ? backgroundList(rt.bg, null) : null,

      answerSource: rt.answerSource || (rt.lastAnswer ? 'hook' : null), cwdNow: rt.cwd || s.cwd,
      git: s.git ? { isRepo: s.git.isRepo, root: s.git.root, commonDir: s.git.commonDir, mainRoot: s.git.mainRoot, isWorktree: s.git.isWorktree, branch: s.git.branch, cwd: s.git.cwd, changedFiles: s.git.changedFiles } : null,
      // P5: 리포지토리 워크스페이스(시작 폴더로 정함), 지금 그 밖에서 일하는가, 셸이 돌리는 명령
      workspaceKey: s.workspaceKey || null, elsewhere: elsewhereOf(this.store.getWorkspace(s.workspaceKey), s.git),
      shell: s.kind === SHELL ? { atPrompt: rt.shell ? rt.shell.atPrompt : true, command: rt.shell ? rt.shell.command : null, procs: (rt.shell && rt.shell.procs) || [], since: rt.shell ? rt.shell.since : null, program: !!(rt.shell && rt.shell.program) } : null, // P309: program(화면을 차지한 채 조용한 프로그램)
      fromShell: !!rt.shellBase,
      ...(this.features ? this.features.summaryExtra(s) : {}), // P6b: output(긴 답인지), loops(켜진 루프 수)
      ...(this.branch ? this.branch.summaryExtra(s) : {}), // P8: branch(깊이, 부모 이름, 하위 세션이면 역할)
      ...(this.sleeper ? this.sleeper.summaryExtra(s) : {}), // P21: sleep(잠든 때, 아낀 메모리, 깨우기 실패), waking
      ...(this.desktopImport ? this.desktopImport.summaryExtra(s) : {}), // P34: imported(데스크톱 앱에서 가져온 세션의 앱 제목)
      subs: !s.orch && this.progress ? this.progress.view(s) : null, // P322: 보통 세션의 이번 턴 서브에이전트 진행(오케스트레이션 세션은 orch.progress)
    };
  }

  // P119: 작업 완료(unseen)는 맨 위 세션만. 판에 열린(잠든 것도) 부모가 있는 하위 세션의 끝난 턴은 사람의 작업 완료에 넣지 않는다.
  // 워커는 부모에게 알리고, 부모가 그것을 받아 턴을 끝내면 부모가 작업 완료가 된다. 부모가 닫히면(또는 독립으로 두면) 하위 세션이 맨 위라 다시 들어간다.
  // P159: 부모는 일 부모(relations.mjs workParentOf)다. 동료·독립의 끝난 턴은 맨 위 세션처럼 센다. 사람이 하위로 둔 세션은 뺀다
  // unseenSub = 하위 세션이라 뺀 안 본 턴(노드를 열면 봤음으로 친다, store.js)
  doneScope(s, f, idx = null) {
    const pid = this.workParentOf(s.sessionId, idx);
    const sub = !!(f.unseen && pid && pid !== s.sessionId && this.sessions.has(pid));
    return { unseen: f.unseen && !sub, unseenSub: sub };
  }
  // P159: 일 부모(가지 기능이 없으면 계보 부모)
  workParentOf(id, idx = null) {
    if (idx) return idx.workParentOf(id);
    if (this.branch && this.branch.relIndex) return this.branch.relIndex().workParentOf(id);
    const s = this.sessions.get(id); return s ? s.parentSessionId || null : null;
  }
  // P92: 웹 푸시가 보는 세션 나무(가볍게: 요약을 다 만들지 않는다). bg = 도는 뒤 일 수(Stop hook의 background_tasks, 모르면 null)
  // P159: 나무의 부모는 일 부모다(잠재우기·작업 완료와 같은 기준). 동료·독립은 자기 사이클을 갖고, 사람이 정한 하위는 위 세션 사이클에 든다
  pushTree() {
    const idx = this.branch && this.branch.relIndex ? this.branch.relIndex() : null;
    return [...this.sessions.values()].map((s) => ({
      sessionId: s.sessionId, parentSessionId: this.workParentOf(s.sessionId, idx), name: shownName(s), kind: s.kind || 'claude', state: deriveState(s.rt).state, workspaceKey: s.workspaceKey || null,
      delivering: this.queue ? this.queue.pending(s.sessionId) : 0, loops: this.features && this.features.loops ? this.features.loops.activeCount(s.sessionId) : 0,
      bg: s.rt.bg ? s.rt.bg.tasks.length : null,
    }));
  }

  // ---------- 리포지토리 워크스페이스(P5, ARCH 4절 G) ----------
  // 판의 워크스페이스는 리포지토리 하나다(workspaceKey). 터미널의 작업 공간(termWorkspaceId)과 다르다.
  workspaceList() {
    const rows = this.store.workspaces();
    const names = workspaceNames(rows);
    const sums = [...this.sessions.values()].map((s) => this.summary(s));
    const labels = wsLabels(readGroups(this), rows); // P91: 저절로 만든 묶음 안에서는 뿌리에서의 상대 경로(영역 이름표, 사이드바)
    return rows.map((w) => ({ key: w.key, name: names.get(w.key), ...(labels.has(w.key) ? { label: labels.get(w.key) } : {}), kind: w.kind, root: w.root, createdAt: w.createdAt, counts: workspaceCounts(sums, w.key), x: w.x, y: w.y, auto: !!w.auto, worktrees: this.worktrees ? this.worktrees.view(w.key) : [] })); // P27: 워크트리 영역
  }
  // P48: 폴더 탐색기의 최근 폴더(워크스페이스 뿌리, 최근 세션 폴더)
  recentDirs() { const ss = [...this.sessions.values()].sort((a, b) => (b.touchedAt || b.createdAt || 0) - (a.touchedAt || a.createdAt || 0)); return [...this.store.workspaces().map((w) => w.root), ...ss.map((x) => x.cwd)].filter(Boolean); }
  currentWorkspace() { const k = this.store.getMeta('currentWorkspace'); return k && this.store.getWorkspace(k) ? k : (this.store.workspaces()[0] || {}).key || null; }
  broadcastWorkspaces() { syncWsGroups(this, 'list'); this.api.broadcast('workspace.updated', { workspaces: this.workspaceList(), current: this.currentWorkspace(), groups: readGroups(this).groups }); } // P44: groups(가상 그룹)
  // 처음 보는 워크스페이스면 줄을 만든다(세션이 하나라도 생기면 워크스페이스가 저절로 생긴다, G1)
  ensureWorkspace(ws, why) {
    if (this.store.getWorkspace(ws.key)) return false;
    if (adoptTwin(this, ws, why)) return false; // P37: 같은 폴더의 다른 키 워크스페이스(폴더가 저장소가 됨)를 이 키로 옮겼다
    this.store.insertWorkspace({ ...ws, createdAt: Date.now() });
    syncWsGroups(this, 'created'); // P91: 묶음을 먼저 맞춰 새 영역을 그 묶음 곁에 놓는다
    anchorWorkspace(this, ws.key); // P6a: 새 영역은 다른 영역과 겹치지 않는 곳(H1)
    if (!this.store.getMeta('currentWorkspace')) this.store.setMeta('currentWorkspace', ws.key);
    this.store.addEvent(null, 'workspace_created', { key: ws.key, kind: ws.kind, root: ws.root, why });
    this.broadcastWorkspaces();
    this.bus.emit('workspace', ws.key); // P7: 그 리포의 판 밖 대화를 찾는다(J3)
    return true;
  }
  // P37: 열린 워크스페이스를 다시 보아 폴더 ↔ 저장소로 바뀐 것을 옮긴다(worktrees.mjs sync가 부른다)
  reconcileWorkspaces(cause) { return reconcileWorkspaces(this, cause); }
  // 키, 이름(대소문자 무시), 또는 그 안의 폴더 경로로 워크스페이스를 찾는다
  async resolveWorkspace(ref, { required = true } = {}) {
    if (!ref) { if (required) throw apiError('bad_request', 'workspace required'); return null; }
    const r = String(ref);
    if (this.store.getWorkspace(r)) return this.store.getWorkspace(r);
    const list = this.workspaceList();
    const byName = list.find((w) => w.name.toLowerCase() === r.toLowerCase()) || list.find((w) => w.key === pathKey(r));
    if (byName) return this.store.getWorkspace(byName.key);
    if (fs.existsSync(r)) { const ws = await workspaceOf(path.resolve(r)); const w = this.store.getWorkspace(ws.key); if (w) return w; }
    if (required) throw keyed(apiError('not_found', `보드에서 프로젝트를 찾을 수 없습니다: ${ref}`), 'wsNotFound', { ref });
    return null;
  }
  // "+ 리포 열기": 폴더를 골라 빈 워크스페이스를 만든다(이미 있으면 그대로)
  async workspaceOpen(p) {
    const dir = path.resolve(String(p.path || ''));
    if (!p.path || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw keyed(apiError('bad_request', `폴더를 찾을 수 없습니다: ${p.path}`), 'noFolder', { path: p.path });
    // P195: "Git 저장소로 시작" — git init과 빈 첫 커밋을 한 뒤 키를 잡는다(처음부터 저장소 키, 열쇠 옮기기 없음)
    const git = p.gitInit === true ? await initRepo(dir) : null;
    const ws = await workspaceOf(dir);
    if (git) this.store.addEvent(null, 'workspace_git_init', { key: ws.key, root: ws.root, commit: git.commit, why: git.why || null });
    const created = this.ensureWorkspace(ws, 'open');
    this.bus.emit('workspace_opened', ws.key); // P10: 사람이 연 워크스페이스는 저절로 연 것이 아니다(닫은 기억도 지운다)
    if (p.select !== false) { this.store.setMeta('currentWorkspace', ws.key); this.broadcastWorkspaces(); }
    return { created, workspace: this.workspaceList().find((w) => w.key === ws.key), ...(git ? { git } : {}) };
  }
  // 워크스페이스를 판에서 지운다(빼기). P44: 여럿(workspaces)을 한 번에, 안에 세션이 있으면 after('archive' 모두 보관 | 'delete' 모두 삭제)를 골라야 한다.
  // confirm이 없으면 지울 것과 세션 수, 돌고 있는 CLI 수(plan)를 돌려준다. 디스크의 폴더와 대화 기록 파일은 건드리지 않는다(삭제도 판의 닫힌 세션 행만 지운다).
  // 세션을 끄지 못한 워크스페이스는 남긴다. 사람이 지운 워크스페이스는 다시 저절로 열지 않는다(P10)
  async workspaceClose(p) {
    const refs = Array.isArray(p.workspaces) && p.workspaces.length ? p.workspaces : [p.workspace];
    const ws = [];
    for (const ref of refs) { const w = await this.resolveWorkspace(ref); if (!ws.some((x) => x.key === w.key)) ws.push(w); }
    const list = this.workspaceList();
    const named = ws.map((w) => ({ key: w.key, root: w.root, name: (list.find((x) => x.key === w.key) || {}).name || w.key }));
    const sums = [...this.sessions.values()].map((s) => this.summary(s));
    const plan = closePlan(named, sums);
    if (!p.confirm) {
      if (named.length === 1 && plan.empty) return confirmResult(`빈 프로젝트 ${named[0].name}(${named[0].root})를 닫습니다. 폴더와 Git 저장소는 그대로 유지합니다.`, m('wsClose', { name: named[0].name, root: named[0].root }), { plan });
      return confirmResult(`프로젝트 ${named.length}개를 보드에서 제거합니다 (세션 ${plan.sessions}개, 실행 중인 CLI ${plan.running}개). 폴더와 대화 기록 파일은 그대로 유지합니다.`, m(plan.empty ? 'wsCloseMany' : 'wsCloseSessions', { n: named.length, sessions: plan.sessions, running: plan.running }), { plan });
    }
    const chk = checkAfter(plan, p.after);
    if (!chk.ok && chk.reason === 'choose') throw keyed(apiError('not_empty', `세션이 ${plan.sessions}개 있습니다. after에 archive(모두 보관) 또는 delete(모두 삭제)를 지정하세요.`), 'wsChooseAfter', { n: plan.sessions });
    if (!chk.ok) throw apiError('bad_request', `after에는 archive 또는 delete를 지정하세요: ${p.after}`);
    const keys = new Set(named.map((w) => w.key));
    const targets = [...this.sessions.values()].filter((s) => keys.has(s.workspaceKey));
    const done = { archived: 0, deleted: 0, failed: [] };
    await Promise.all(targets.map(async (s) => {
      try {
        await this.kill({ session: s.sessionId, confirm: true, ...(chk.after === 'archive' ? { after: 'archive' } : {}) });
        if (chk.after === 'archive') done.archived++;
        else { this.dropClosedRow(s.sessionId, 'workspace_removed'); done.deleted++; }
      } catch (e) { done.failed.push({ sessionId: s.sessionId, name: s.name, error: e.code || String(e.message || e) }); }
    }));
    const closed = [], kept = [];
    for (const w of named) {
      if ([...this.sessions.values()].some((s) => s.workspaceKey === w.key)) { kept.push(w.key); continue; }
      this.removeWorkspace(w.key);
      closed.push(w.key);
    }
    if (closed.length) { this.store.setMeta(GROUPS_META, dropWorkspaces(readGroups(this), closed)); this.broadcastWorkspaces(); }
    return { closed: closed.length === named.length, removed: closed, kept, key: named[0].key, after: chk.after, sessions: done };
  }
  // 워크스페이스 행 하나를 판에서 뺀다(안에 세션이 없을 때)
  // P120: why 'gone' = 폴더가 없어진 빈 영역을 판이 치운다(worktrees.mjs pruneGone). 사람이 닫은 것이 아니라 P10의 "다시 저절로 열지 않음"에 넣지 않는다
  removeWorkspace(key, { why = null } = {}) {
    // P6c: 그 영역의 메모·칸반은 지우지 않고 소속만 푼다(자리는 그대로)
    for (const m of this.store.memos().filter((x) => x.workspaceKey === key)) { this.store.updateMemo(m.memoId, { workspaceKey: null }); this.api.broadcast('memo.updated', this.store.getMemo(m.memoId)); }
    for (const k of this.store.kanbans().filter((x) => x.workspaceKey === key)) { this.store.updateKanban(k.kanbanId, { workspaceKey: null }); if (this.features) this.features.kanbans.emit(this.store.getKanban(k.kanbanId)); }
    this.store.deleteWorkspace(key);
    try { this.store.markPlansDeleted(key); } catch {} // P304: 목표·마일스톤 레인은 30일 남겼다가 지운다(다시 열면 되살아난다)
    if (this.store.getMeta('currentWorkspace') === key) this.store.setMeta('currentWorkspace', (this.store.workspaces()[0] || {}).key || null);
    this.store.addEvent(null, 'workspace_closed', why ? { key, why } : { key });
    if (why !== 'gone') this.bus.emit('workspace_closed', key); // P10: 사람이 닫은 워크스페이스는 다시 저절로 열지 않는다
    if (why === 'gone') this.store.setMeta(GROUPS_META, dropWorkspaces(readGroups(this), [key])); // 묶음에서도 뺀다(사람이 지울 때는 workspaceClose가 뺀다)
    this.broadcastWorkspaces();
  }
  // P120: 폴더가 없어진 빈 영역을 치웠다. 창은 한 번 알린다(토스트). 판 밖 대화 노드는 다시 놓는다
  onWorkspacesPruned(list) {
    this.store.addEvent(null, 'workspace_pruned', { workspaces: list });
    this.api.broadcast('workspace.pruned', { workspaces: list });
    if (this.recall) this.recall.changed({ force: true }).catch(() => {});
  }
  // P44: 닫힌 세션 행만 판에서 지운다. 대화 기록 파일은 그대로다(노드 X의 "삭제"와 달리 휴지통으로 보내지 않는다)
  dropClosedRow(sessionId, why) {
    const row = this.store.closedSession(sessionId);
    if (!row) return false;
    this.store.tx(() => { this.store.deleteClosedSession(sessionId); this.store.addEvent(sessionId, 'session_deleted', { name: row.name, kind: row.kind, trashed: 0, why }); });
    if (this.recall) this.recall.changed({ force: true }).catch(() => {});
    return true;
  }
  // 창이 지금 보는 워크스페이스(앱을 다시 열면 여기로 들어간다. @all의 범위)
  async workspaceSelect(p) {
    const w = await this.resolveWorkspace(p.workspace);
    this.store.setMeta('currentWorkspace', w.key);
    return { current: w.key };
  }
  memOf(sid) { const r = this.resources && this.resources.last && this.resources.last.sessions.find((x) => x.sessionId === sid); return r ? r.memMB : null; }

  // E2: 사람이 이 세션에 마지막으로 손댄 시각(보기, 입력, 보내기, 답하기). 터미널 입력은 10초에 한 번만 쓴다.
  touch(s, now = Date.now()) {
    const prev = s.touchedAt || 0;
    s.touchedAt = now;
    if (now - prev > TOUCH_WRITE_MS) this.store.updateSession(s.sessionId, { touchedAt: now });
  }

  // ---------- P137: 하네스가 지금 쓰는 모델 ----------
  // 기록 파일(Claude Code 대화 기록, Codex rollout, pi 세션 파일). 못 찾으면 null(찾기는 30초에 한 번만 다시)
  modelFileOf(s) {
    const kind = s.kind || 'claude';
    if (kind === 'claude') return s.rt.transcriptPath || transcriptPathFor(this.cfg.claudeProjects, s.cwd, s.rt.claudeSessionId || s.sessionId);
    const c = s._modelFind;
    if (c && c.file && fs.existsSync(c.file)) return c.file;
    if (c && Date.now() - c.at < 30000) return null;
    let file = null;
    try {
      if (kind === 'codex') { const id = this.harnessSessionIdOf(s); file = id ? findCodexRollout(this.cfg.codexConvoHome || codexHomeOf(), id) : null; }
      else if (kind === 'pi') { const id = (s.harnessPlan || {}).harnessSessionId; file = id ? findPiSession(this.cfg.piSessionsDir || path.join(os.homedir(), '.pi', 'agent', 'sessions'), id) : null; }
      else if (kind === 'omo') { const id = (s.harnessPlan || {}).harnessSessionId; file = id ? findPiSession(this.cfg.omoSessionsDir || path.join(os.homedir(), '.omo', 'agent', 'sessions'), id) : null; } // P329: pi와 같은 꼴, 폴더만 다르다
      else if (kind === 'dsh') { const id = this.harnessSessionIdOf(s); file = id ? findDshSession(this.cfg.dshHome || dshHomeOf(), id) : null; } // P270
    } catch { file = null; }
    s._modelFind = { file, at: Date.now() };
    return file;
  }
  // 바뀌었으면 true. 보이는 값이 바뀐 것은 판 이벤트(model_changed)로 남긴다
  // P227: asleep이면 패널이 없어도(잠든 세션, 다시 열 닫힌 세션) 읽는다. 바뀐 값은 판 DB(runtime)에 바로 남긴다(판이 다시 떠도 이어 갈 때 쓴다)
  refreshModelNow(s, { asleep = false } = {}) {
    const kind = s.kind || 'claude';
    if (!['claude', 'codex', 'pi', 'omo', 'dsh', 'hermes'].includes(kind) || (!s.paneId && !asleep)) return false; // P329: omo // P270: dsh는 기록(zstd 프레임)의 request/header
    let st;
    try { if (kind === 'hermes') { const id = this.harnessSessionIdOf(s); const u = id ? hermesUsageOf({ id, home: this.hermesHome() }) : null; if (!u || !u.model) return false; st = { model: u.model, effort: null }; } else { const file = this.modelFileOf(s); if (!file) return false; st = kind === 'dsh' ? refreshDshModel(file, s._modelSt || null) : refreshModel(kind, file, s._modelSt || null); } } catch (e) { this.log('model read error', e.message); return false; }
    if (!st) return false;
    s._modelSt = st;
    const prev = s.rt.modelNow || null;
    if (!st.model && !st.effort) return false;
    if (prev && prev.model === st.model && (prev.effort || null) === (st.effort || null)) return false;
    const before = shownModel({ model: s.model, effort: s.effort }, prev);
    s.rt.modelNow = { model: st.model || null, effort: st.effort || null, at: Date.now() };
    const after = shownModel({ model: s.model, effort: s.effort }, s.rt.modelNow);
    // 같은 모델의 다른 이름(haiku → claude-haiku-5-5)이나 처음 알게 된 노력 수준(없음 → xhigh)은 바뀐 것으로 치지 않는다
    if (!sameModel(before.model, after.model) || (before.effort && before.effort !== after.effort)) this.store.addEvent(s.sessionId, 'model_changed', { from: before, to: after, launched: { model: s.model || null, effort: s.effort || null } });
    if (this.sessions.has(s.sessionId)) this.store.saveRuntime(s.sessionId, s.rt);
    return true;
  }
  // P227: 이어 가기 직전의 지금 값. 대화 기록을 한 번 더 읽고(잠든 동안이나 판이 다시 뜬 뒤에도), 못 읽으면 판 DB에 남은 값
  modelNowFor(s) {
    try { this.refreshModelNow(s, { asleep: true }); } catch {}
    return (s.rt && s.rt.modelNow) || null;
  }
  // P227: 같은 대화를 이어 갈 때의 실행 값(모델·노력 수준은 resumeModel). 처음 띄울 값(launchOf)은 그대로
  resumeLaunchOf(s) {
    const launch = this.launchOf(s);
    const rm = resumeModel('claude', launch, this.modelNowFor(s));
    return { ...launch, model: rm.model, effort: rm.effort };
  }
  pollModels() {
    for (const s of this.sessions.values()) {
      if (this.sleeper && this.sleeper.going.has(s.sessionId)) continue;
      if (this.refreshModelNow(s)) this.broadcastSession(s, { cause: 'model' });
    }
  }

  broadcastSession(s, { cause, onlyIfFlagsChanged = false } = {}) {
    if (!this.sessions.has(s.sessionId)) return;
    const sum = this.summary(s);
    const key = `${sum.state}|${sum.unseen}|${sum.quiet}|${sum.delivering}`;
    if (onlyIfFlagsChanged && key === s.lastKey) return;
    s.lastKey = key;
    if (sum.state !== s.lastState) {
      const from = s.lastState;
      s.lastState = sum.state;
      if (from !== null || cause) {
        const turnless = from === 'working' && sum.work && sum.work.turnless && sum.work.endedAt === s.rt.term.at ? sum.work : null; // P173: 턴 없이 끝난 일(압축)
        this.store.addEvent(s.sessionId, 'state', { from, to: sum.state, term: sum.termStatus, cause: cause || null, ask: sum.ask, exit: sum.exit, error: sum.state === 'error' ? sum.error : undefined, ...(turnless ? { turnless: true, compact: turnless.compact || null } : {}) });
        this.api.broadcast('session.state', { sessionId: s.sessionId, name: shownName(s), from, to: sum.state, cause: cause || null, summary: sum });
        this.onLinkTargetState(s, from, sum);
        if (this.web) try { this.web.push.onState(sum, from, { turnless: !!turnless }); } catch (e) { this.log('push error', e.stack); } // P88: 휴대폰 웹 푸시(끝남, 응답 필요, 오류)
      }
    }
    this.api.broadcast('session.updated', sum);
    this.bus.emit('session', s, sum);
    this.store.saveRuntime(s.sessionId, s.rt);
    if (this.queue) setImmediate(() => this.queue.pump());
  }

  // ---------- hook 수신기 ----------
  onHttp(req, res) {
    const u = req.url.split('?')[0];
    // P48: hook과 하위 세션 명령은 이 PC의 프로세스만 부른다(브라우저·앞단 프록시를 거친 요청은 막는다)
    if ((u === '/hooks/claude' || u.startsWith('/branch/')) && !isLocalProcess(req, this.cfg.port)) { res.writeHead(403); res.end(); return; }
    if (req.method === 'POST' && u === '/hooks/claude') return this.onHook(req, res);
    if (this.branch && this.branch.handleHttp(req, res)) return; // P8: POST /branch/*(하위 세션 명령, 세션 토큰)
    if (this.web && this.web.handleHttp(req, res)) return; // P48: 웹 화면(/, 정적 파일)과 /web/*(짝 맺기, 기기 정보, 업로드)
    if (req.method === 'GET' && req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, pid: process.pid })); }
    res.writeHead(404); res.end();
  }
  onHook(req, res) {
    const chunks = []; let size = 0; let tooBig = false;
    req.on('data', (d) => { size += d.length; if (size > 8 * 1024 * 1024) tooBig = true; else chunks.push(d); });
    req.on('end', () => {
      const raw = tooBig ? '' : Buffer.concat(chunks).toString('utf8');
      // hook은 먼저 200을 돌려준다(Claude Code는 hook 응답을 기다린다, E2 2.3). P269: rig 역할의 PreToolUse를 기다려 답하던 길은 걷어 냈다
      // P308: PreToolUse가 판의 atrium 명령(따옴표 꼴 포함)이면 허용 결정을 본문에 담는다(토큰이 맞는 판 세션만)
      const allow = tooBig ? null : this.preToolAllow(req.headers, raw);
      if (allow) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(allow)); } else { res.writeHead(200); res.end(); }
      if (tooBig) return this.log('hook body too large', size);
      setImmediate(() => {
        try { this.processHook(req.headers, raw, !!allow); } catch (e) { this.log('hook error', e.stack); }
      });
    });
  }
  // P308: PreToolUse 본문 → 허용 결정(atrium-allow.mjs) 또는 null. 세션과 hook 토큰이 맞을 때만
  preToolAllow(headers, raw) {
    if (!raw.includes('PreToolUse')) return null;
    let body; try { body = JSON.parse(raw); } catch { return null; }
    if (!body || body.hook_event_name !== 'PreToolUse') return null;
    const sid = headers['x-mt-session'] || body.session_id;
    const s = this.sessions.get(sid) || [...this.sessions.values()].find((x) => x.rt.claudeSessionId === body.session_id);
    if (!s || headers.authorization !== `Bearer ${s.hookToken}`) return null;
    try { return preToolUseDecision(body); } catch (e) { this.log('pre-tool allow error', e.stack); return null; }
  }
  processHook(headers, raw, boardAllow = false) {
    let body; try { body = JSON.parse(raw); } catch { return this.log('hook bad json'); }
    const sid = headers['x-mt-session'] || body.session_id;
    const s = this.sessions.get(sid) || [...this.sessions.values()].find((x) => x.rt.claudeSessionId === body.session_id);
    const ev = body.hook_event_name;
    if (!s) { this.store.addEvent(null, 'hook_unknown_session', { ev, sid }); return; }
    const authOk = headers.authorization === `Bearer ${s.hookToken}`;
    s.lastHookAuthOk = authOk;
    if (!authOk) { this.store.addEvent(s.sessionId, 'hook_rejected', { ev }); this.log(`hook rejected ${s.name} ${ev}`); return; }
    s.hookCount = (s.hookCount || 0) + 1;
    applyHook(s.rt, body);
    if (ev === 'Stop') s.rt.answerSource = 'hook';
    // F4: Claude Code는 워크트리로 들어가면 hook의 cwd가 바뀐다
    if (body.cwd && body.cwd !== s.rt.cwd) { s.rt.cwd = body.cwd; this.probeGit(s, body.cwd); }
    if (ev === 'UserPromptSubmit') { s.draft = false; this.onLinkTargetPrompt(s, body.prompt); }
    const info = { ev, tool: body.tool_name || null, authOk, bytes: raw.length, sessionIdMatches: body.session_id === s.sessionId, permissionMode: body.permission_mode || null };
    if (ev === 'Stop') info.lastAnswer = clip(body.last_assistant_message, 300);
    if (boardAllow) info.boardAllow = true; // P308: 판이 PreToolUse에 허용을 돌려줬다(atrium 명령)
    if (ev === 'UserPromptSubmit') info.prompt = clip(s.rt.lastPrompt, 200);
    if (ev === 'SessionEnd') info.reason = body.reason;
    if (ev === 'StopFailure') info.error = s.rt.lastError;
    if (ev === 'PermissionRequest' || (ev === 'PreToolUse' && s.rt.pendingAsk && s.rt.pendingAsk.toolUseId === body.tool_use_id)) info.ask = this.askView(s, { ...s.rt.pendingAsk, input: undefined });
    this.store.addEvent(s.sessionId, 'hook', info);
    this.api.broadcast('session.hook', { sessionId: s.sessionId, name: s.name, ...info });
    if (ev === 'UserPromptSubmit') { const matched = this.queue.onUserPromptSubmit(s.sessionId, body.prompt); if (!matched && this.decisions && humanPrompt(body.prompt)) try { this.decisions.onHuman(s.sessionId, 'terminal'); } catch (e) { this.log('decisions human error', e.stack); } } // P284: 판의 전달과 맞지 않는 지시 = 사람이 터미널에 직접 친 글
    if (ev === 'PermissionRequest' && s.rt.pendingAsk && (s.rt.pendingAsk.kind === 'permission' || s.rt.pendingAsk.kind === 'plan')) this.readChoicesLater(s);
    if ((ev === 'PostToolUse' || ev === 'PostToolUseFailure' || ev === 'PermissionDenied') && !s.rt.pendingAsk && s.rt.term.status === 'blocked') this.recheckBlockedLater(s); // P232(H18)
    if ((ev === 'PostToolUse' || ev === 'PostToolUseFailure' || ev === 'PermissionDenied') && s.rt.pendingAsk && s.rt.pendingAsk.kind === 'permission' && !s.rt.pendingAsk.choices) this.readChoicesLater(s); // P232: 줄의 다음 질문이 올라왔다
    if (ev === 'Stop' || ev === 'SessionStart') this.refreshModelNow(s); // P137: 턴이 끝나면 지금 모델을 바로 본다(broadcast는 아래)
    if (ev === 'Stop') this.probeGit(s, s.rt.cwd || s.cwd); // A2: 바뀐 파일 수. F4: 지금 폴더(워크트리일 수 있다)로 본다
    const late = s.rt.lastWork && s.rt.lastWork.late && !s.rt.lastWork.lateSeen ? s.rt.lastWork : null; // P173: 턴 hook이 턴 없는 일로 본 구간 뒤에 늦게 왔다
    if (late) late.lateSeen = true;
    this.broadcastSession(s, { cause: `hook:${ev}` });
    if (late && this.web) try { this.web.push.lateTurn(this.summary(s)); } catch (e) { this.log('push error', e.stack); }
  }

  // 권한 요청의 선택지는 도구마다 달라 화면에서 읽는다(E9 2.1). 화면이 그려질 시간을 조금 준다.
  async readChoicesLater(s) {
    const ask = s.rt.pendingAsk;
    for (const wait of [400, 800, 1600]) {
      await sleep(wait);
      if (s.rt.pendingAsk !== ask) return;
      try {
        const text = await this.adapter.readScreen(s.paneId, { source: 'detection' });
        const choices = parseChoices(text);
        if (choices.length) { ask.choices = choices; ask.question = parsePromptLine(text); this.broadcastSession(s, { cause: 'screen:choices' }); return; }
      } catch {}
    }
  }

  // ---------- 터미널 이벤트 ----------
  async onTermEvent(e) {
    if ((e.type === 'pane_moved' || e.type === 'pane_created') && e.paneId && this.guard) this.guard.onPane(e.paneId).catch(() => {}); // P341: 새 뿌리 프로세스를 곧바로 보통 이하로
    if (e.type === 'pane_moved') {
      const m = e.previousPaneId && this.sessionByPane(e.previousPaneId);
      // P125: 셸을 남기며 온 종료 코드(놓임이 먼저 풀려 코드가 없던 끝남을 고친다: 콘솔 Ctrl+C면 직접 종료)
      if (m && e.exitCode != null && applyExitCode(m.rt, e.exitCode)) { this.store.addEvent(m.sessionId, 'exit_code', { code: e.exitCode, exit: m.rt.exit }); this.store.saveRuntime(m.sessionId, m.rt); }
      // P337: 띄우자마자 끝난 에이전트의 끝 화면에 오류 문장이 있으면 끝남에 붙인다(짐작한 신뢰 거부가 아니라 그 오류로). 카드·부모의 멈춤 알림이 그 문장을 보인다
      const textFixed = !!(m && e.exitText && applyExitText(m.rt, e.exitText));
      if (textFixed) { this.store.addEvent(m.sessionId, 'exit_error', { error: m.rt.exit.error, exit: m.rt.exit }); this.store.saveRuntime(m.sessionId, m.rt); this.log(`${m.name} exited right after launch: ${m.rt.exit.error}`); }
      if (m && e.paneId) this.setPane(m, e.paneId, e.workspaceId, 'pane moved', { quiet: !!(e.raw && e.raw.hc) }); // P117: hc가 같은 자리를 바꿔 띄운 것(에이전트 띄우기, 셸 남기기)은 알리지 않는다
      if (textFixed && this.sessions.has(m.sessionId)) this.broadcastSession(m, { cause: 'exit:error' }); // P337: 고친 끝남(오류 문장)을 창과 일 멈춤 알림에
      return;
    } // P117: hc가 같은 자리를 바꿔 띄운 것(에이전트 띄우기, 셸 남기기)은 알리지 않는다
    // 작업 공간이 판 밖에서 닫혔다. 작업 공간을 닫아도 패널마다 pane_closed가 오지 않는다(P5에서 확인)
    if (e.type === 'workspace_closed') {
      for (const x of [...this.sessions.values()]) if (x.termWorkspaceId === e.workspaceId && !this.killing.has(x.sessionId)) this.closeSession(x, 'workspace closed outside board');
      return;
    }
    const s = e.paneId ? this.sessionByPane(e.paneId) : null;
    // F3·G2: 판 전용 터미널 세션에 판이 모르는 패널(새 셸, 판 밖에서 띄운 터미널)이나 에이전트가 나타났다. 판에 올린다.
    if (!s) { if (e.type === 'agent_detected' || e.type === 'pane_created') this.adoptPane(e.paneId, { cwd: e.cwd }).catch((err) => this.log('adopt error', err.stack)); return; }
    const now = Date.now();
    // 패널의 셸이 끝났다(셸에서 exit). 패널이 없어진다. pane_closed는 오지 않는다(P5에서 확인)
    if (e.type === 'pane_exited') { if (!this.killing.has(s.sessionId)) this.closeSession(s, 'pane exited'); return; }
    // G2: 일반 셸 노드. 그 패널에 에이전트가 나타나면 같은 노드의 종류만 바꾼다(새 노드를 만들지 않는다)
    if (s.kind === SHELL) {
      if (e.type === 'agent_detected' || (e.type === 'status' && e.status !== 'unknown')) await this.promoteShell(s, e.type);
      else if (e.type === 'pane_closed' && !this.killing.has(s.sessionId)) this.closeSession(s, 'pane closed outside board');
      return;
    }
    if (e.type === 'status' || e.type === 'agent_detected' || e.type === 'agent_released') this.queue.poke(s.sessionId); // P106: 에이전트가 바뀌었다. 물러나 있던 전달을 다시 본다
    if (e.type === 'status') {
      // 띄운 뒤 agent_detected를 놓쳤어도, 끝난 적 없는 세션에 상태가 오면 claude가 패널에 있다는 뜻이다(P2에서 더한 안전망).
      // 끝난 세션(exit)은 되살리지 않는다. 해제 직후에도 idle이 한 번 온다(E10 2.4).
      if (!s.rt.term.present && !s.rt.exit && e.status !== 'unknown') { applyAgentDetected(s.rt, now); this.store.addEvent(s.sessionId, 'terminal_agent', { detected: true, by: 'status' }); }
      const prev = applyTermStatus(s.rt, e.status, now);
      if (e.status !== 'unknown') s.resumingAfterRestart = null; // 이어 가기가 됐다
      this.store.addEvent(s.sessionId, 'terminal_status', { from: prev, to: e.status });
      if (e.status === 'blocked' && !s.rt.pendingAsk) await this.checkBlocked(s);
      else if (e.status === 'blocked' && s.rt.pendingAsk.kind === 'permission' && !s.rt.pendingAsk.choices) this.readChoicesLater(s); // P232: 줄의 다음 질문
      if ((e.status === 'idle' || e.status === 'done') && !s.rt.term.agentSessionId) this.refreshAgent(s);
      if (!this.hooked(s)) {
        // hook이 없는 세션: 제출 확인은 터미널 상태 working으로, 마지막 답은 턴이 끝난 화면 끝으로 대신한다(F5)
        if (e.status === 'working') this.queue.onAgentWorking(s.sessionId);
        if ((prev === 'working' || prev === 'blocked') && (e.status === 'idle' || e.status === 'done') && !this.queue.unsubmitted(s.sessionId)) await this.readScreenAnswer(s); // P184: 첫 요청이 입력 칸에 남은 채 끝난 시작 표시(MCP)는 답으로 읽지 않는다
        if (!s.adoptNamed) this.refreshAdoptedName(s);
      }
      this.broadcastSession(s, { cause: `term:${e.status}` });
    } else if (e.type === 'agent_detected') {
      applyAgentDetected(s.rt, now);
      this.store.addEvent(s.sessionId, 'terminal_agent', { detected: true });
      this.broadcastSession(s, { cause: 'term:agent_detected' });
      // P97·P106: 터미널이 에이전트를 새로 알아볼 때(다시 켠 뒤 이어 가기, 뜬 직후 놓았다가 다시 알아봄) 이름을 잃을 수 있다. 판이 띄운 세션이면 알아본 뒤 이름을 다시 맞춘다
      if ((s.startCommand && this.hooked(s)) || s.origin === 'board') for (const ms of [1500, 6000]) { const tm = setTimeout(() => { if (this.sessions.has(s.sessionId)) this.ensureAgentName(s); }, ms); if (tm.unref) tm.unref(); }
    } else if (e.type === 'agent_released') {
      applyAgentReleased(s.rt, now, { termStopping: this.termStopping, exitCode: e.exitCode ?? null }); // P125: hc는 종료 코드를 준다
      this.store.addEvent(s.sessionId, 'terminal_agent', { released: true, finalStatus: e.finalStatus, exit: s.rt.exit });
      // G2: 판이 띄우지 않은 에이전트(판에 올린 것, 셸에서 띄운 것)가 끝나면 패널은 셸로 남는다. 같은 노드를 셸로 되돌린다.
      // 판이 띄운 에이전트가 끝난 것은 지금처럼 exited로 둔다(이어 가기 규칙 그대로)
      if ((s.origin === 'adopted' || s.rt.shellBase) && !this.hooked(s) && !this.termStopping && !this.killing.has(s.sessionId)) return this.demoteToShell(s, 'agent released');
      this.broadcastSession(s, { cause: 'term:agent_released' });
      // P7(J1): 대화 기록이 없는 세션의 `claude --resume`은 잠깐 idle을 보인 뒤 끝나기도 한다(resumingAfterRestart가 먼저 풀림). 되살리기 시작 30초 안의 해제도 이어 가기 실패로 본다
      const justRecovered = s.recoverStartedAt && Date.now() - s.recoverStartedAt < 30000;
      if ((s.resumingAfterRestart || justRecovered) && !this.termStopping && this.hooked(s)) { s.resumingAfterRestart = null; s.recoverStartedAt = null; this.relaunchIfEmpty(s); }
    } else if (e.type === 'pane_closed') {
      if (!this.killing.has(s.sessionId)) this.closeSession(s, 'pane closed outside board');
    }
  }

  // ---------- 일반 셸(G2, P5) ----------
  // 셸 패널에 에이전트가 나타났다(셸에서 claude를 침). 같은 노드의 종류를 바꾼다
  async promoteShell(s, why) {
    if (s.kind !== SHELL || s._promoting) return;
    s._promoting = true;
    try {
      await sleep(400); // 터미널이 에이전트를 알아볼 시간
      const a = (await this.adapter.listAgents()).find((x) => x.paneId === s.paneId);
      if (!a || !this.sessions.has(s.sessionId) || s.kind !== SHELL) return;
      const now = Date.now();
      const kind = a.agent || 'unknown';
      const rt = newRuntime({ kind, hooked: false });
      rt.shellBase = true; rt.cwd = s.rt.cwd;
      applyAgentDetected(rt, now);
      applyTermStatus(rt, a.status || 'unknown', now, { launchPending: a.launchPending, agentSessionId: a.agentSessionId });
      if (a.status && a.status !== 'unknown') rt.phase = 'running';
      const from = s.kind;
      s.rt = rt; s.kind = kind; s.agentName = a.name || s.paneId; s.adoptNamed = s.origin !== 'adopted' || !!a.name;
      // P309: 셸에서 연 OMH Native는 카드에 OMH로 보인다(런처 아이콘이 없을 때만, 셸로 돌아오면 되돌린다)
      if (kind === 'hermes' && s._shellTuiFlavor && !s.flavor) { s.flavor = s._shellTuiFlavor; rt.flavorFromShell = true; this.store.updateSession(s.sessionId, { flavor: s.flavor, runtime: rt }); } // 판 기록(runtime)에 남겨 다시 켠 뒤에도 셸로 돌아올 때 지운다
      if (s.origin === 'adopted' && a.name && NAME_RE.test(a.name) && a.name !== s.name && !nameOwner(this.sessions.values(), a.name, s)) {
        this.store.addEvent(s.sessionId, 'renamed', { from: s.name, to: a.name }); s.name = a.name; this.store.renameSession(s.sessionId, a.name);
      }
      this.store.updateSession(s.sessionId, { kind, agentName: s.agentName, runtime: rt });
      this.linkUnresolved(s, a.name);
      this.store.addEvent(s.sessionId, 'shell_agent', { from, to: kind, agentName: a.name || null, why });
      this.log(`shell ${s.name} now runs ${kind}`);
      this.broadcastSession(s, { cause: `shell:${kind}` });
    } finally { s._promoting = false; }
  }
  // 셸에서 띄운 에이전트가 끝났다: 같은 노드를 셸로 되돌린다
  demoteToShell(s, why) {
    const from = s.kind;
    const shellFlavor = !!(s.rt && s.rt.flavorFromShell); // P309
    const rt = newRuntime({ kind: SHELL, hooked: false });
    rt.cwd = s.rt.cwd; rt.phase = 'running'; rt.shellBase = false;
    s.rt = rt; s.kind = SHELL; s.agentName = s.paneId; s.openPromptFrom = null;
    if (shellFlavor) { s.flavor = null; s._shellTuiFlavor = null; this.store.updateSession(s.sessionId, { flavor: null }); } // P309: 셸에서 연 OMH로 붙인 표시는 셸로 돌아오면 지운다
    this.queue.cancelSession(s.sessionId, 'agent exited, shell left');
    this.store.updateSession(s.sessionId, { kind: SHELL, agentName: s.agentName, runtime: rt });
    this.store.addEvent(s.sessionId, 'shell_agent', { from, to: SHELL, why });
    this.broadcastSession(s, { cause: 'shell' });
  }
  // 셸이 프롬프트에서 쉬는지, 무슨 명령을 돌리는지(화면 끝줄과 마지막 프롬프트 줄). 돌리는 셸은 자식 프로세스 이름도 읽는다
  async pollShells() {
    if (!this.adapter.connected || this._shellPolling) return;
    this._shellPolling = true;
    try {
      const busy = [];
      for (const s of [...this.sessions.values()]) {
        if (s.kind !== SHELL || !s.paneId || s.rt.exit) continue;
        // 작은 노드나 나눈 패널처럼 좁으면 긴 프롬프트가 줄바꿈되어 프롬프트로 보이지 않는다. 줄바꿈을 푼 최근 줄로 읽는다(P6a, P6b가 따로 봄)
        // P136: 지금 화면만 읽는다. 기록 읽기는 셸 안의 전체 화면 프로그램(vim, 셸에서 띄운 에이전트 등)을 2초마다 휠 보고로 굴렸다(hc stitched)
        const text = await this.adapter.readScreen(s.paneId, { source: 'visible' }).catch(() => null);
        if (text == null || !this.sessions.has(s.sessionId) || s.kind !== SHELL) continue;
        const st = shellPromptState(text);
        const prev = s.rt.shell;
        const same = prev && prev.atPrompt === st.atPrompt && prev.command === st.command;
        // P309: 셸에서 연 Hermes·OMH TUI는 화면 모양으로 알아보고(셸 패널의 claude처럼) 같은 노드를 그 에이전트 세션으로 바꾼다. 터미널 어댑터가 화면 상태를 흉내 내면(app hermes)
        //   agent_detected → promoteShell, TUI가 끝나 프롬프트로 돌아오면 agent_released → demoteToShell
        if (!st.atPrompt && typeof this.adapter.watchShellTui === 'function' && hermesStateOf(text)) {
          s._shellTuiFlavor = isOmhScreen(text) ? 'omh' : null;
          this.adapter.watchShellTui(s.paneId, 'hermes');
        }
        // P309: 알아볼 수 없는 전체 화면 프로그램(프롬프트 줄이 화면에 없고 화면이 SHELL_PROGRAM_QUIET_MS 동안 그대로)은 "셸에서 실행 중인 프로그램"으로 둔다
        const screenKey = `${text.length}:${text.slice(-400)}`;
        const quietSince = !st.atPrompt && same && prev.screenKey === screenKey ? prev.quietSince || Date.now() : Date.now();
        const program = !st.atPrompt && !st.command && Date.now() - quietSince >= SHELL_PROGRAM_QUIET_MS;
        s.rt.shell = { atPrompt: st.atPrompt, command: st.command, procs: !st.atPrompt && same ? prev.procs || [] : [], procsAt: !st.atPrompt && same ? prev.procsAt || null : null, since: same ? prev.since : Date.now(), screenKey, quietSince, program };
        if (same && !!prev.program !== program) { this.store.addEvent(s.sessionId, 'shell', { atPrompt: st.atPrompt, program }); this.broadcastSession(s, { cause: 'shell:program' }); }
        if (!st.atPrompt) busy.push(s);
        if (!same) {
          s.rt.lastActivityAt = Date.now();
          if (!st.atPrompt && s.rt.interruptedTurn) s.rt.interruptedTurn = null; // 새 명령을 돌리면 끊긴 명령 표시를 내린다(I8)
          this.store.addEvent(s.sessionId, 'shell', { atPrompt: st.atPrompt, command: clip(st.command, 200) });
          this.broadcastSession(s, { cause: 'shell' });
        }
      }
      const fresh = busy.some((s) => !s.rt.shell.procsAt);
      if (busy.length && (fresh || Date.now() - (this._shellProcsAt || 0) > SHELL_PROCS_MS)) { this._shellProcsAt = Date.now(); await this.readShellProcs(busy); }
    } finally { this._shellPolling = false; }
  }
  async readShellProcs(list) {
    const pids = new Map();
    for (const s of list) { const info = await this.adapter.processInfo(s.paneId).catch(() => null); if (info && info.shell_pid) pids.set(s.sessionId, info.shell_pid); }
    const kids = await childProcesses([...pids.values()]);
    for (const s of list) {
      if (!s.rt.shell || s.rt.shell.atPrompt) continue;
      const names = kids.filter((k) => k.ppid === pids.get(s.sessionId) && !/^conhost\.exe$/i.test(k.name)).map((k) => k.name);
      const changed = JSON.stringify(names) !== JSON.stringify(s.rt.shell.procs || []);
      s.rt.shell.procs = names; s.rt.shell.procsAt = Date.now();
      if (changed) this.broadcastSession(s, { cause: 'shell:procs' });
    }
  }
  // 터미널 서버를 다시 띄운 뒤 이어 가기가 실패한 세션: 한 턴도 돌지 않은 세션은 대화 기록이 없어 `claude --resume`이 "No conversation found"로 끝난다(P1).
  // 잃을 대화가 없으므로 같은 패널에서 같은 세션 ID와 설정 파일로 새로 띄운다. 대화 기록이 있는데 끝났으면 손대지 않고 exited로 둔다.
  async relaunchIfEmpty(s) {
    const tx = s.rt.transcriptPath || transcriptPathFor(this.cfg.claudeProjects, s.cwd, s.sessionId);
    if (fs.existsSync(tx)) { this.store.addEvent(s.sessionId, 'resume_failed', { transcript: true }); return; }
    await sleep(500);
    if (!this.sessions.has(s.sessionId) || s.rt.term.present) return;
    await this.adapter.waitShellReady(s.paneId, 5000);
    const args = buildStartArgs(this.launchOf(s));
    try {
      await this.adapter.startAgent({ name: s.agentName, paneId: s.paneId, args, ...startOpt(s) });
      s.rt.exit = null; s.rt.phase = 'starting'; s.rt.launchedAt = Date.now(); s.rt.hooksSinceLaunch = 0; s.rt.sessionEnd = null;
      s.rt.term.launchPending = true; s.rt.term.agentSessionId = null;
      this.store.addEvent(s.sessionId, 'relaunched_fresh', { reason: 'resume found no conversation', args });
      this.broadcastSession(s, { cause: 'relaunch' });
    } catch (e) { this.store.addEvent(s.sessionId, 'relaunch_failed', { error: e.code || e.message }); }
  }

  // 판이 다시 띄울 때의 실행 값. P4 전에 띄운 세션(이어 가기 명령에 --plugin-dir가 없음)은 그대로 둔다
  //   launch(기본 true)는 곧 띄운다는 뜻이다(이어 가기 명령만 다시 만들 때는 false)
  launchOf(s, { launch = true } = {}) {
    // P258: 깨우기·다시 시작·되살리기 전에 옛 설정 파일의 빠진 판 hook(P173 PreCompact·PostCompact 등)을 채운다. 새로 뜬 Claude Code가 읽는다
    if (launch && this.hooked(s) && (s.kind || 'claude') === 'claude' && s.settingsPath) {
      try { const added = fillSessionHooks(s.settingsPath); if (added.length) { this.log(`hooks added for ${s.name}: ${added.join(', ')}`); this.store.addEvent(s.sessionId, 'settings_hooks_added', { events: added }); } } catch (e) { this.log(`hooks fill failed ${s.name}: ${e.message}`); }
    }
    const withPlugin = (s.resumeArgv || []).includes('--plugin-dir');
    if (launch && withPlugin && this.briefNotices) try { this.briefNotices.stamp(s, 'relaunch'); } catch (e) { this.log(`brief stamp failed ${s.name}: ${e.message}`); } // P317: 이어 가기·깨우기는 지금 안내문을 다시 넣는다(알리지 않고 판을 올린다)
    return { sessionId: s.sessionId, settingsPath: s.settingsPath, permissionMode: s.permissionMode, model: s.model, effort: s.effort, extraArgs: s.extraArgs || [], startCommand: s.startCommand || '', ...(withPlugin ? this.pluginFor(s) : {}) };
  }
  // P296: 자체 오케스트레이션 세션의 판 안내문(그 세션의 지금 권한 범위: sub | free). Claude Code는 줄마다, 하네스는 한 줄. → { file, text } | null
  orchPrompt(s, scope = null) {
    if (!s || !s.orch) return null;
    const perm = !scope && this.branch && typeof this.branch.permFor === 'function' ? this.branch.permFor(s) : null;
    const sc = scope || (perm && perm.scope === 'sub' ? 'sub' : 'free');
    const lines = orchPromptLines(sc);
    const text = (s.kind || 'claude') === 'claude' ? lines.join('\n') : lines.join(' ');
    const file = path.join(this.cfg.sessionsDir, `${s.sessionId}.orch-prompt.md`);
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text + '\n'); } catch (e) { this.log(`orch prompt write failed ${s.name}: ${e.message}`); return null; }
    return { file: slash(file), text, scope: sc };
  }
  // P296: 판 플러그인 값. 오케스트레이션 세션은 판 안내문만 그 세션의 것으로 바꾼다
  pluginFor(s, scope = null) {
    const o = s && s.orch ? this.orchPrompt(s, scope) : null;
    return o ? { ...this.plugin, systemPromptFile: o.file } : this.plugin;
  }

  // ---------- P115: Claude Code 밖 하네스(harness.mjs) ----------
  harnessResumable(s) { return harnessResumable(s); }
  // 하네스 세션 ID(이어 가기): 판이 정한 것(opencode·pi) → 기록 → 터미널이 아는 것 → Codex rollout(그 폴더, 띄운 뒤)
  harnessSessionIdOf(s) {
    const plan = s.harnessPlan || {};
    if (plan.harnessSessionId) return plan.harnessSessionId;
    // P133: 갈라 열 Codex 세션은 처음 띄울 때 ID가 없다(fork). 그 뒤에는 원본 ID를 빼고 찾는다
    if (s.kind === 'codex') {
      if (plan.forkFrom && !plan.launchedAt) return null;
      const id = s.rt.term.agentSessionId || codexSessionOf({ cwd: s.cwd, since: plan.launchedAt || s.createdAt || 0, exclude: plan.forkFrom ? [plan.forkFrom] : [], ...(plan.forkFrom ? { forkedFrom: plan.forkFrom } : {}), ...(this.cfg.codexConvoHome ? { home: this.cfg.codexConvoHome } : {}) });
      return plan.forkFrom && id && String(id).toLowerCase() === String(plan.forkFrom).toLowerCase() ? null : id;
    }
    // P192: AGY는 대화 기록 폴더에서 그 폴더·띄운 뒤에 생긴 대화를 찾는다. 판의 다른 AGY 세션이 가진 대화는 뺀다
    if (s.kind === 'agy') {
      const taken = [...this.sessions.values()].filter((x) => x !== s && x.kind === 'agy' && !x.closedAt).map((x) => (x.harnessPlan || {}).harnessSessionId).filter(Boolean);
      return agySessionOf({ cwd: s.cwd, since: plan.firstLaunchedAt || plan.launchedAt || s.createdAt || 0, exclude: taken, ...(this.cfg.agyHome ? { home: this.cfg.agyHome } : {}) });
    }
    // P270: dsh도 기록 폴더(~/.dsh/sessions)에서 그 폴더·처음 띄운 뒤에 생긴 맨 위 세션을 찾는다(첫 글 뒤에 생긴다). 판의 다른 dsh 세션이 가진 것은 뺀다
    if (s.kind === 'dsh') {
      const taken = [...this.sessions.values()].filter((x) => x !== s && x.kind === 'dsh' && !x.closedAt).map((x) => (x.harnessPlan || {}).harnessSessionId || x._dshId).filter(Boolean);
      const id = dshSessionOf({ cwd: s.cwd, since: plan.firstLaunchedAt || plan.launchedAt || s.createdAt || 0, exclude: taken, home: this.cfg.dshHome || dshHomeOf() });
      if (id) s._dshId = id;
      return id || s._dshId || null;
    }
    // P298: Hermes는 state.db sessions에서 그 폴더·처음 띄운 뒤에 생긴 맨 위 tui 세션을 찾는다(첫 화면이 뜰 때 생긴다). 찾으면 기록에 남긴다
    if (s.kind === 'hermes') {
      if (s._hermesId) return s._hermesId;
      const taken = [...this.sessions.values()].filter((x) => x !== s && x.kind === 'hermes' && !x.closedAt).map((x) => (x.harnessPlan || {}).harnessSessionId || x._hermesId).filter(Boolean);
      const id = hermesSessionOf({ cwd: s.cwd, since: plan.firstLaunchedAt || plan.launchedAt || s.createdAt || 0, exclude: taken, home: this.hermesHome() });
      if (id) { s._hermesId = id; s.harnessPlan = { ...plan, harnessSessionId: id }; try { this.store.updateSession(s.sessionId, { harnessPlan: s.harnessPlan }); } catch {} }
      return id || null;
    }
    return null;
  }
  // 띄울 값. 판의 env(토큰은 빼고 파일로), PATH 앞의 bin/, 안내문, 호출자 값(모델·추가 인자), 이어 가기
  harnessLaunchOf(s, { resume = false } = {}) {
    const plan = s.harnessPlan || {};
    // P255: 옛 세션 기록의 연결(plan.connectionId)은 읽지 않는다(하네스 기본 로그인으로 띄운다)
    const br = this.branch && typeof this.branch.token === 'function' ? this.branch : null; // 하위 세션 명령이 없는 판(시험의 가짜 판)은 env와 토큰 없이
    if (br) writeTokenFile(this.cfg.sessionsDir, s.sessionId, br.token(s.sessionId));
    const hf = this.harnessFiles || {};
    // P227: 같은 대화를 이어 갈 때(Codex는 대화 ID를 알 때) 모델·노력 수준은 그 대화가 마지막으로 쓰던 값. 처음 띄울 때는 띄운 값(plan.model)
    const hsid = resume ? this.harnessSessionIdOf(s) : null;
    const rm = resume && (piLike(s.kind) || (s.kind === 'codex' && hsid)) ? resumeModel(s.kind, { model: plan.model || null }, this.modelNowFor(s)) : null;
    const orchP = s.orch ? this.orchPrompt(s) : null; // P296: 오케스트레이션 세션은 그 세션의 안내문(허용 동사만)
    return harnessLaunch({ kind: s.kind, startWords: startWords(s.startCommand), sessionId: s.sessionId, resume, harnessSessionId: hsid, model: rm ? rm.model : plan.model || null, ...(rm && rm.effort ? { effort: rm.effort } : plan.effort ? { effort: plan.effort } : {}), /* P299: Hermes 띄운 노력 수준 */ launcherArgs: plan.args || [], instructions: orchP ? { file: orchP.file, text: orchP.text } : hf.promptFile ? { file: hf.promptFile, text: HARNESS_PROMPT } : null, boardEnv: br ? br.envFor(s.sessionId, { token: false }) : {}, binDir: hf.binDir || null, filesDir: path.join(this.cfg.dataDir || this.cfg.sessionsDir || '.', 'harness'), wrapper: hf.binDir ? { node: process.execPath, script: path.join(hf.binDir, 'lib', 'bin', 'atrium-child.mjs') } : null, forkFrom: plan.forkFrom && !plan.launchedAt ? plan.forkFrom : null, statusLine: this.usage ? (u) => this.usage.agyStatusLine(u) : null }); // P133: 갈라 열기는 처음 한 번만. P211: AGY 상태 줄 명령
  }
  // 그 패널에 판의 줄로 하네스를 띄운다(hc: terminal.run의 env). 이어 가기·되살리기·다시 열기가 함께 쓴다
  async startHarness(s, { resume = false, why = 'start', name = s.agentName } = {}) {
    const hl = this.harnessLaunchOf(s, { resume });
    writeLaunchFiles(hl.files);
    await this.adapter.waitShellReady(s.paneId, 8000);
    s.rt.agentStartedAt = Date.now(); s.rt.launchArgv = [...hl.command, ...hl.args]; s.rt.launchSuspect = null; // P238: 곧바로 끝나면(종료 코드 2) 띄우기 인자 오류로 의심하고 이 명령 줄을 알린다
    const st = await this.adapter.startAgent({ name, paneId: s.paneId, args: hl.args, kind: s.kind, command: hl.command, env: hl.env, pathFirst: hl.pathFirst });
    s.harnessPlan = { ...(s.harnessPlan || {}), harnessSessionId: hl.harnessSessionId || (s.harnessPlan || {}).harnessSessionId || null, launchedAt: Date.now(), firstLaunchedAt: (s.harnessPlan || {}).firstLaunchedAt || Date.now() }; // P133: firstLaunchedAt(처음 띄운 때, 대화 ID 배우기)
    this.store.updateSession(s.sessionId, { harnessPlan: s.harnessPlan });
    if (hl.args && this.briefNotices) try { this.briefNotices.stamp(s, why); } catch (e) { this.log(`brief stamp failed ${s.name}: ${e.message}`); } // P317: 띄우기·이어 가기는 지금 안내문을 넣는다(mustRePass)
    if (why !== 'start') { s.rt.exit = null; s.rt.phase = 'starting'; s.rt.launchedAt = Date.now(); s.rt.term.launchPending = st.agent ? st.agent.launchPending : true; }
    this.store.addEvent(s.sessionId, why === 'start' ? 'harness_started' : 'recovered_by_board', { plan: why, resume, resumed: hl.resumed, harnessSessionId: hl.harnessSessionId, argv: [...hl.command, ...hl.args], env: Object.keys(hl.env), ...(hl.readyInput ? { readyInput: hl.readyInput } : {}) });
    // P299: 준비된 뒤 넣을 글(Hermes /reasoning <값>). 넣을 때까지 전달을 붙잡는다(deliveryView starting). 판 기록에 남기지 않는다(다시 켜면 다시 띄울 때 다시 정한다)
    if (hl.readyInput) { const setup = { input: hl.readyInput, reasoning: hl.reasoning, at: Date.now() }; s._readyInput = setup; this.typeReadyInput(s, setup).catch((e) => { if (s._readyInput === setup) s._readyInput = null; this.log('ready input error', e.message); }); }
    return { ...st, resumed: hl.resumed };
  }
  // P299: Hermes가 준비되면(ready, 빈 입력 칸) 그 글을 치고 Enter, 확인 줄(reasoning: <값>)을 기다린다. 끝나면(되든 안 되든) 전달을 푼다
  async typeReadyInput(s, setup) {
    const t0 = Date.now(), limit = this.cfg.readyInputWaitMs || 90000, step = this.cfg.readyInputStepMs || 500;
    const done = (ok, why = null) => {
      if (s._readyInput === setup) s._readyInput = null;
      try { this.store.addEvent(s.sessionId, 'ready_input', { input: setup.input, ok, ...(why ? { why } : {}) }); } catch {}
      if (!ok) this.log(`ready input not confirmed: ${s.name} ${setup.input} (${why})`);
      if (this.queue && typeof this.queue.poke === 'function') this.queue.poke(s.sessionId);
      if (this.queue && typeof this.queue.pump === 'function') setImmediate(() => this.queue.pump());
      return ok;
    };
    while (Date.now() - t0 < limit) {
      if (!this.sessions.has(s.sessionId) || s._readyInput !== setup) return false;
      const st = deriveState(s.rt).state;
      if (['exited', 'error', 'closed'].includes(st)) return done(false, st);
      if (st === 'ready' && s.paneId) {
        const scr = await this.adapter.readScreen(s.paneId, { source: 'visible' }).catch(() => '');
        const box = hermesInputBox(scr);
        if (box.found && !box.text) {
          await this.adapter.sendText(s.paneId, setup.input); await sleep(300); await this.adapter.paneKeys(s.paneId, ['enter']);
          for (const t1 = Date.now(); Date.now() - t1 < (this.cfg.readyInputConfirmMs || 6000); await sleep(250)) {
            const sc = await this.adapter.readScreen(s.paneId, { source: 'visible' }).catch(() => '');
            if (hermesReasoningShown(sc, setup.reasoning)) return done(true);
          }
          return done(false, 'no confirmation');
        }
      }
      await sleep(step);
    }
    return done(false, 'timeout');
  }
  // 그 패널의 하네스를 끈다(ctrl+c 두 번, pi는 ctrl+d도). 꺼질 때까지 패널을 본다
  async stopHarnessAgent(s, steps = []) {
    const present = async () => { const p = await this.adapter.getPane(s.paneId).catch(() => null); return !!(p && p.agent); };
    for (const k of ['ctrl+c', 'ctrl+c', 'ctrl+d']) { if (!(await present())) break; await this.adapter.paneKeys(s.paneId, [k]).catch(() => {}); steps.push(k); await sleep(700); }
    for (const t = Date.now(); (await present()) && Date.now() - t < (this.cfg.killWaitMs || 8000);) await sleep(300);
    return !(await present());
  }

  async refreshAgent(s) {
    const a = await this.adapter.getAgent(s.agentName).catch(() => null);
    if (!a) return null;
    s.rt.term.launchPending = a.launchPending;
    s.rt.term.agentSessionId = a.agentSessionId;
    return a;
  }
  // 터미널 상태가 blocked인데 묻는 hook이 없다 → 신뢰 대화상자인지 화면으로 한 번 더 본다(E10)
  // hook이 없는 세션은 화면 끝을 묻는 내용으로 둔다(F5: 승인 카드는 "터미널에서 답하기")
  // P192: AGY의 신뢰 질문도 화면으로 본다(trust_wait)
  async checkBlocked(s) {
    await this.refreshAgent(s);
    try {
      const text = await this.adapter.readScreen(s.paneId, { source: 'visible' });
      if (TRUST_SCREEN_KINDS.has(s.kind || 'claude') && trustDialogOf(s.kind || 'claude', text)) { s.rt.trustScreen = { at: Date.now() }; this.store.addEvent(s.sessionId, 'trust_dialog', { tail: tailLines(text, 6) }); }
      else if ((s.kind || 'claude') === 'claude' && !this.noteWorktreeExit(s, text)) this.noteScreenPermission(s, text);
      if (!this.hooked(s)) s.rt.screenAsk = { tail: tailText(text, 14), at: Date.now() };
    } catch {}
  }
  // P232(H18): hook이 붙은 Claude Code가 막혔는데 기다리는 ask가 없을 때, 화면의 권한 질문("n of m"의 둘째 질문 등)을 ask로 둔다 → 두었으면 true
  noteScreenPermission(s, text) {
    if (!this.hooked(s) || s.rt.pendingAsk || s.rt.term.status !== 'blocked') return false;
    const p = parsePermissionDialog(text);
    if (!p) return false;
    s.rt.pendingAsk = screenPermissionAsk(p);
    this.store.addEvent(s.sessionId, 'screen_permission', { tool: s.rt.pendingAsk.tool, summary: clip(s.rt.pendingAsk.summary, 200), step: p.step || null, choices: p.choices.map((c) => `${c.n}. ${c.label}`) });
    this.broadcastSession(s, { cause: 'screen:permission' });
    return true;
  }
  // P232(H18): ask가 풀렸는데(PostToolUse 등) 터미널이 아직 막혀 있으면 화면이 다음 질문으로 바뀐 것이다. 화면이 그려질 시간을 주고 다시 읽는다
  recheckBlockedLater(s) {
    if (s._recheckBlocked) return;
    s._recheckBlocked = true;
    (async () => {
      try {
        for (const wait of [300, 800, 1600]) {
          await sleep(wait);
          if (!this.sessions.has(s.sessionId) || s.rt.pendingAsk || s.rt.term.status !== 'blocked') return;
          await this.checkBlocked(s);
          if (s.rt.pendingAsk || s.rt.trustScreen || s.rt.worktreeExit) return;
        }
      } catch {} finally { s._recheckBlocked = false; }
    })();
  }
  // P71: `claude -w` 세션이 끝날 때 묻는 워크트리 나가기 질문을 화면에서 읽어 둔다(승인 줄 "워크트리를 남길까요?")
  noteWorktreeExit(s, text) {
    const w = parseWorktreeExit(text);
    if (!w) return false;
    const was = s.rt.worktreeExit;
    s.rt.worktreeExit = { ...w, at: (was && was.at) || Date.now() };
    if (!was) this.store.addEvent(s.sessionId, 'worktree_exit_dialog', { commits: w.commits, files: w.files, choices: w.choices.map((c) => `${c.n}. ${c.label}`) });
    return true;
  }
  // P116: 200줄(전에는 60줄). hc의 terminal.read는 화면의 빈 줄까지 세어서, 입력 칸이 아래에 붙은 Codex 화면은 60줄 안에 그 턴이 없었다(atrium wait의 답이 상태 줄이 됐다)
  async readScreenAnswer(s) {
    if (piLike(s.kind) && await this.readPiAnswer(s)) return; // P201. P329: omo도 세션 파일
    if (s.kind === 'dsh' && await this.readDshAnswer(s)) return; // P270
    if (s.kind === 'hermes' && await this.readHermesAnswer(s)) return; // P298
    try {
      const text = await this.adapter.readScreen(s.paneId, { source: 'recent_unwrapped', lines: 200 });
      s.rt.lastAnswer = screenAnswerText(text, 20, { kind: s.kind }); s.rt.lastAnswerAt = Date.now(); s.rt.answerSource = 'screen'; // P192: 종류(AGY)
      this.bus.emit('screenAnswer', s);
    } catch {}
  }

  // P201: pi는 화면에 답 앞 프롬프트 표시가 없고 머리 글(시작 안내)·상태 줄이 섞여, 마지막 답을 pi 세션 파일에서 읽는다.
  // 턴이 끝난 때 파일에 아직 답이 없을 수 있어 잠깐 다시 본다. 지난번에 쓴 답보다 새 답이 없으면 화면으로 돌아간다
  async readPiAnswer(s, { tries = 6, gapMs = 300 } = {}) {
    for (let i = 0; i < tries; i++) {
      let a = null;
      try { s._modelFind = s._modelFind && s._modelFind.file ? s._modelFind : null; const file = this.modelFileOf(s); a = file ? readPiLastAnswer(file) : null; } catch { a = null; }
      if (a && (!s.rt.piAnswerAt || (a.at || 0) > s.rt.piAnswerAt)) {
        s.rt.lastAnswer = a.text; s.rt.lastAnswerAt = Date.now(); s.rt.answerSource = 'session'; s.rt.piAnswerAt = a.at || Date.now();
        this.bus.emit('screenAnswer', s);
        return true;
      }
      if (i < tries - 1) await new Promise((r) => setTimeout(r, gapMs));
    }
    return false;
  }

  // P270: dsh의 마지막 답은 기록(zstd 프레임 JSONL)의 마지막 assistant/message 글이다(화면은 전체 화면 TUI라 고르기 어렵다).
  //   턴이 끝난 때 기록에 아직 답이 없을 수 있어 잠깐 다시 본다. P279: 기록의 턴이 닫힐 때까지 본다(앞 단계 글을 마지막 답으로 잡지 않게, waitDshAnswer).
  //   지난번 답보다 새 답이 없으면 화면으로 돌아간다
  async readDshAnswer(s, { tries = 10, gapMs = 300 } = {}) {
    const read = () => { s._modelFind = s._modelFind && s._modelFind.file ? s._modelFind : null; const file = this.modelFileOf(s); return file ? readDshLastAnswer(file) : null; };
    const a = await waitDshAnswer({ read, since: s.rt.dshAnswerAt || 0, tries, gapMs });
    if (!a) return false;
    s.rt.lastAnswer = a.text; s.rt.lastAnswerAt = Date.now(); s.rt.answerSource = 'session'; s.rt.dshAnswerAt = a.at || Date.now();
    this.bus.emit('screenAnswer', s);
    return true;
  }

  // P298: Hermes의 마지막 답은 state.db messages의 마지막 assistant 글이다(화면은 전체 화면 TUI). 턴이 끝난 때 아직 적히지 않았을 수 있어 잠깐 다시 본다.
  //   지난번 답보다 새 답이 없으면 화면으로 돌아간다
  async readHermesAnswer(s, { tries = 8, gapMs = 300 } = {}) {
    const id = this.harnessSessionIdOf(s);
    if (!id) return false;
    for (let i = 0; i < tries; i++) {
      const a = hermesLastAnswer({ id, home: this.hermesHome() });
      if (a && (!s.rt.hermesAnswerId || a.id > s.rt.hermesAnswerId)) {
        s.rt.lastAnswer = a.text; s.rt.lastAnswerAt = Date.now(); s.rt.answerSource = 'session'; s.rt.hermesAnswerId = a.id;
        this.bus.emit('screenAnswer', s);
        return true;
      }
      if (i < tries - 1) await sleep(gapMs);
    }
    return false;
  }
  hermesHome() { return this.cfg.hermesHome || hermesHomeOf(); } // P298
  harnessDir() { return path.join(this.cfg.dataDir || this.cfg.sessionsDir || '.', 'harness'); } // P115·P298: 하네스 파일 폴더(감싸개 포함)

  onTermDisconnected(which = null) {
    this.log(`terminal disconnected${which ? ` (${which})` : ''}`);
    this.store.addEvent(null, 'terminal_disconnected', { expected: this.termStopping, backend: which });
    this.termWasDown = true; // P7(J1): 다시 붙으면 터미널 서버가 잃은 패널을 판이 되살린다
    // P117: 두 백엔드를 함께 쥐면 끊긴 백엔드의 세션만 끊긴 턴으로 둔다
    for (const s of this.sessions.values()) if (!(which && this.adapter.mixed && this.adapter.mixed() && s.paneId && this.adapter.backendOfPane(s.paneId) !== which)) this.markTermStopped(s);
    this.broadcastTerminal({ connected: false, expected: this.termStopping });
  }
  // 터미널 서버가 꺼짐: 진행 중이던 턴은 "재시작으로 끊긴 턴"으로 남긴다(C3)
  markTermStopped(s, cause = 'term:disconnected') {
    const before = s.rt.interruptedTurn;
    applyTermDisconnected(s.rt);
    if (s.rt.interruptedTurn && s.rt.interruptedTurn !== before) this.store.addEvent(s.sessionId, 'turn_interrupted', s.rt.interruptedTurn);
    this.broadcastSession(s, { cause });
  }
  async onTermConnected() {
    this.log('terminal connected');
    this.setTermCompat(this.adapter.checkCompat(this.adapter.pong));
    this.termMissing = null;
    const pid = this.adapter.serverPid();
    if (pid) this.store.setMeta('terminalServerPid', pid);
    this.store.addEvent(null, 'terminal_connected', { compat: this.termCompat, pid });
    this.broadcastTerminal({ ...this.terminalView(), compat: this.termCompat });
    // 백엔드가 꺼진 동안 터미널 서버가 다시 떴다(재부팅 포함): 그 전에 돌던 세션은 서버가 꺼져서 끝난 것으로 본다
    const afterRestart = !!(this.termWasDown || this.termRestartedWhileDown);
    this.termWasDown = false;
    if (this.termRestartedWhileDown) {
      this.termRestartedWhileDown = false;
      this.store.addEvent(null, 'terminal_restarted_while_down', { pid });
      for (const s of this.sessions.values()) if (!s.rt.exit) this.markTermStopped(s, 'term:restarted while backend down');
    }
    await this.resync('terminal connected', { afterRestart });
    startMigration(this); // P129: 옛 판이면 첫 resync 뒤 옮기기를 시작한다(한 번)
  }

  migrationView() {
    const m = this.migration;
    return m ? { from: m.from, to: m.to, data: m.data, problems: m.problems, fixed: m.fixed } : null;
  }

  // C2·C3: 터미널의 현재 상태로 판을 다시 맞추고, 놓친 hook은 대화 기록에서 메운다
  async resync(why, { afterRestart = false } = {}) {
    const [snap, agents] = await Promise.all([this.adapter.snapshot(), this.adapter.listAgents()]);
    const panes = new Set(snap.panes.map((p) => p.paneId));
    const report = [];
    const recovering = [];
    const restoring = [], hookless = [], harnessed = []; // P7(J1): 터미널 서버가 잃은 셸·판에 올린 claude, 돌아오지 않은 hook 없는 에이전트. P115: 판이 이어 갈 하네스 세션
    for (const s of [...this.sessions.values()]) {
      if (!s.paneId) continue;
      const wasStopped = !!(s.rt.exit && s.rt.exit.kind === 'terminal_stopped'); // P115: 아래 applyAgentDetected가 지우기 전에
      // 판이 이어 가는 것은 판이 띄운 Claude Code 세션이다(판에 올린 셸·claude·하네스는 아래 restoring·hookless·harnessed)
      const stoppedByServer = !!(s.rt.exit && s.rt.exit.kind === 'terminal_stopped') && this.hooked(s);
      if (stoppedByServer && why === 'terminal connected') recovering.push(s);
      if (!panes.has(s.paneId)) {
        // 서버가 꺼지면 패널째로 잃는다(hc: 터미널이 코어와 함께 끝난다). 판이 띄운 세션이면 되살린다.
        if (stoppedByServer) { report.push({ name: s.name, result: 'pane gone, recreating' }); continue; }
        if (afterRestart && this.recall.restorable(s)) { report.push({ name: s.name, result: 'pane gone, restoring' }); restoring.push(s); continue; }
        report.push({ name: s.name, result: 'pane gone' }); this.closeSession(s, 'pane gone'); continue;
      }
      const a = agents.find((x) => x.paneId === s.paneId);
      const now = Date.now();
      // G2: 셸 노드. 백엔드가 꺼진 동안 그 패널에 에이전트가 떴으면 종류를 바꾼다
      if (s.kind === SHELL) { if (a) this.promoteShell(s, 'resync'); report.push({ name: s.name, shell: true, agent: a ? a.agent : null }); this.broadcastSession(s, { cause: `resync:${why}` }); continue; }
      // 셸에서 띄운 에이전트나 판에 올린 에이전트가 백엔드가 꺼진 동안 끝났으면 셸로 되돌린다
      if (!a && !this.hooked(s) && (s.origin === 'adopted' || s.rt.shellBase) && s.rt.term.present && !stoppedByServer) { this.demoteToShell(s, 'resync: no agent'); report.push({ name: s.name, demoted: true }); continue; }
      if (a) {
        // 서버가 다시 뜬 직후 agent.list는 이어 가기 전의 상태(idle)를 줄 수 있다. 새 상태 이벤트가 올 때까지 starting으로 둔다(E7).
        const resuming = stoppedByServer;
        if (resuming) s.resumingAfterRestart = Date.now();
        applyAgentDetected(s.rt, now);
        s.rt.term.present = true;
        applyTermStatus(s.rt, resuming ? 'unknown' : a.status, now, { launchPending: a.launchPending, agentSessionId: a.agentSessionId });
        if (a.status === 'blocked' && !s.rt.pendingAsk) await this.checkBlocked(s);
      } else if (s.rt.term.present || !s.rt.exit) {
        applyAgentReleased(s.rt, now);
      }
      // P115: 판이 띄운 하네스 세션은 서버가 다시 뜬 뒤 판의 줄로 이어 간다
      if (!this.hooked(s) && afterRestart && wasStopped && this.harnessResumable(s)) harnessed.push(s);
      else if (!this.hooked(s) && !a && afterRestart && s.rt.exit && s.rt.exit.kind === 'terminal_stopped') hookless.push(s);
      if (!this.hooked(s)) { report.push({ name: s.name, agent: a ? a.status : 'none', hooked: false }); this.broadcastSession(s, { cause: `resync:${why}` }); continue; }
      const tx = lastExchange(s.rt.transcriptPath || transcriptPathFor(this.cfg.claudeProjects, s.cwd, s.sessionId));
      let recovered = null;
      if (tx.exists && tx.lastAnswerAt && tx.lastAnswerAt > (s.rt.lastAnswerAt || 0) + 1000 && (!s.rt.lastPromptAt || tx.lastAnswerAt > s.rt.lastPromptAt)) {
        s.rt.lastAnswer = tx.lastAnswer; s.rt.lastAnswerAt = tx.lastAnswerAt;
        if (s.rt.turn.startedAt && !s.rt.turn.endedAt) s.rt.turn.endedAt = tx.lastAnswerAt;
        recovered = { lastAnswer: clip(tx.lastAnswer, 120) };
      }
      if (tx.exists && tx.lastPromptAt && tx.lastPromptAt > (s.rt.lastPromptAt || 0) + 1000) {
        s.rt.lastPrompt = tx.lastPrompt; s.rt.lastPromptAt = tx.lastPromptAt;
        if (!recovered) recovered = {};
        recovered.lastPrompt = clip(tx.lastPrompt, 120);
      }
      const sent = this.queue.list(s.sessionId).find((d) => d.status === 'sent');
      if (sent && tx.exists) this.queue.reconcile(s.sessionId, userPromptsSince(s.rt.transcriptPath || transcriptPathFor(this.cfg.claudeProjects, s.cwd, s.sessionId), sent.sentAt || sent.createdAt));
      if (recovered) this.store.addEvent(s.sessionId, 'recovered_from_transcript', recovered);
      report.push({ name: s.name, agent: a ? a.status : 'none', recovered });
      this.broadcastSession(s, { cause: `resync:${why}` });
    }
    // F3·G2: 백엔드가 꺼진 동안 생긴 패널(세션이 띄운 에이전트, 셸)도 판에 올린다. 판이 되살리는 중인 세션의 옛 패널은 빼고
    for (const p of snap.panes) {
      if (!p.paneId || this.sessionByPane(p.paneId)) continue;
      const a = agents.find((x) => x.paneId === p.paneId);
      report.push({ adopt: p.paneId, agent: a ? a.agent : SHELL, name: a ? a.name : null });
      this.adoptPane(p.paneId).catch((e) => this.log('adopt error', e.stack));
    }
    this.store.addEvent(null, 'resync', { why, report });
    const jobs = [];
    if (recovering.length) jobs.push(this.recoverAfterRestart(recovering, panes).catch((e) => this.log('recover error', e.stack)));
    if (restoring.length) jobs.push(this.recall.restoreGone(restoring).catch((e) => this.log('restore error', e.stack)));
    if (hookless.length) jobs.push(this.recall.recoverHookless(hookless).catch((e) => this.log('recover hookless error', e.stack)));
    if (harnessed.length) jobs.push(this.recall.recoverHarness(harnessed).catch((e) => this.log('recover harness error', e.stack))); // P115
    this.recoveryDone = Promise.all(jobs); // P129: 옛 판 옮기기가 되살리기를 다 기다린 뒤 시작한다
    return report;
  }

  // C3 대책(P3): 터미널 서버가 다시 뜬 뒤 판 세션을 판의 인자(--settings)로 이어 간다. 패널을 잃었으면 작업 공간을 다시 만든다(recoveryPlan, launch.mjs).
  async recoverAfterRestart(list, panes) {
    const t0 = Date.now();
    const releasedAt = new Map();
    const pending = new Set(list.map((s) => s.sessionId));
    for (const s of list) s.recoverStartedAt = t0;
    while (pending.size && Date.now() - t0 < this.cfg.recoverGraceMs + 20000) {
      for (const sid of [...pending]) {
        const s = this.sessions.get(sid);
        if (!s || !this.adapter.connected) { pending.delete(sid); continue; }
        if (s.rt.exit && s.rt.exit.kind !== 'terminal_stopped' && !releasedAt.has(sid)) releasedAt.set(sid, Date.now()); // 이어 가기를 시도했다가 끝남(P1 규칙이 다룬다)
        const tx = s.rt.transcriptPath || transcriptPathFor(this.cfg.claudeProjects, s.cwd, s.sessionId);
        let argv = null;
        if (s.rt.term.present) {
          const info = await this.adapter.processInfo(s.paneId).catch(() => null);
          const c = info && (info.foreground_processes || []).find((p) => /claude/i.test(p.name || ''));
          argv = c ? c.argv : null;
        }
        const plan = recoveryPlan({ paneExists: panes.has(s.paneId), agentPresent: s.rt.term.present, argv, settingsPath: s.settingsPath, transcriptExists: fs.existsSync(tx), waitedMs: Date.now() - t0, graceMs: this.cfg.recoverGraceMs, releasedSinceRestart: releasedAt.has(sid) });
        if (plan === 'wait') continue;
        pending.delete(sid);
        if (plan === 'ok' || plan === 'leave') { if (plan === 'ok') { this.store.addEvent(sid, 'recover_check', { result: 'resumed with board args' }); await this.ensureAgentName(s); } continue; }
        await this.recoverSession(s, plan).catch((e) => this.store.addEvent(sid, 'recover_failed', { plan, error: e.code || e.message }));
      }
      if (pending.size) await sleep(1000);
    }
    // 다시 붙은 직후의 agent.list를 믿지 않아 starting으로 둔 세션: 새 상태 이벤트가 없으면 지금 상태로 맞춘다(백엔드가 꺼진 동안 이미 이어 간 경우)
    for (const s of list) {
      if (!this.sessions.has(s.sessionId) || !s.resumingAfterRestart) continue;
      const a = await this.adapter.getAgent(s.agentName).catch(() => null);
      if (a && a.status && a.status !== 'unknown') { s.resumingAfterRestart = null; applyTermStatus(s.rt, a.status, Date.now(), { launchPending: a.launchPending, agentSessionId: a.agentSessionId }); this.broadcastSession(s, { cause: 'resync:agent.get after resume' }); }
    }
  }

  // 판의 전달(agent.prompt). P97·P106: 터미널이 그 이름을 모르면(agent_not_found, 이름을 잃은 에이전트) 판이 띄운 세션이면 이름을 다시 붙이고 한 번 더 보내고,
  // 못 붙이면(다른 패널이 그 이름을 씀, 판에 올린 세션)
  // 그 패널에 같은 종류의 에이전트가 있을 때 패널 ID로 보낸다
  async sendPrompt(sid, text) {
    const s = this.sessions.get(sid);
    if (isSdk(s)) return this.sdk.send(s, text); // P363: SDK 세션은 프로세스 stdin(없으면 띄운다, 이어 갈 대화가 있으면 --resume)
    // P264: Codex에 여러 줄이거나 긴 글은 판이 붙여 넣고 화면에서 다 들어간 것을 본 뒤 Enter를 친다(hc terminal.send의 Enter가 붙여 넣은 글의 줄바꿈이 됐다).
    //   P271(이슈 #19): 짧은 한 줄도 같다(codexPasteWanted). Enter 뒤 입력 칸에 남으면 어댑터가 Enter를 다시 친다
    // P298: Hermes TUI도 판이 붙여 넣고 입력 칸에 다 보인 뒤 Enter를 친다(Hermes는 7501이 없어 hc terminal.send의 턴 시작 기다림이 맞지 않다)
    const hermes = s.kind === 'hermes' && typeof this.adapter.pastePrompt === 'function' && String(text || '').length > 0;
    const paste = hermes || (s.kind === 'codex' && typeof this.adapter.pastePrompt === 'function' && codexPasteWanted(text) && !(s.rt && this.hooked(s)));
    const send = (target) => (paste ? this.adapter.pastePrompt(target, text, { state: (scr) => (hermes ? hermesPasteState : codexPasteState)(scr, text) }) : this.adapter.prompt(target, text));
    try { return await send(s.agentName); }
    catch (e) {
      if (e.code !== 'agent_not_found' || !s.paneId || s.agentName === s.paneId) throw e;
      if ((s.startCommand || s.origin === 'board') && (await this.ensureAgentName(s))) return send(s.agentName);
      const p = await this.adapter.getPane(s.paneId).catch(() => null);
      if (!p || !p.agent || p.agent !== (s.kind || 'claude')) throw e;
      return send(s.paneId);
    }
  }
  // P97: 판의 주소(agentName)로 찾지 못하고 그 패널에 같은 종류의 에이전트가 있으면 이름을 다시 붙인다(판의 전달이 이 이름을 쓴다)
  async ensureAgentName(s) {
    if (!s.agentName || s.agentName === s.paneId) return false;
    try {
      const a = await this.adapter.getAgent(s.agentName);
      if (a && a.paneId === s.paneId) return false;
      if (a) { this.store.addEvent(s.sessionId, 'agent_name_taken', { name: s.agentName, pane: a.paneId }); return false; } // 다른 패널이 그 이름을 쓴다: 손대지 않는다
      const p = await this.adapter.getPane(s.paneId);
      if (!p || p.agent !== (s.kind || 'claude')) return false;
      await this.adapter.renameAgent(s.paneId, s.agentName);
      this.store.addEvent(s.sessionId, 'agent_renamed', { name: s.agentName, why: 'name lost on terminal restart' });
      return true;
    } catch (e) { this.store.addEvent(s.sessionId, 'agent_rename_failed', { error: e.code || e.message }); }
    return false;
  }

  async recoverSession(s, plan) {
    const resume = plan === 'recreate_resume' || plan === 'start_resume' || plan === 'restart_with_settings';
    const steps = [];
    s.resumingAfterRestart = null; // 여기서 끝나는 claude는 relaunchIfEmpty가 다루지 않는다
    if (plan === 'recreate_resume' || plan === 'recreate_fresh') {
      const ws = await this.withNewPane(() => this.adapter.createWorkspace({ cwd: s.cwd, label: s.name }), (r) => this.setPane(s, r.paneId, r.workspaceId, 'workspace recreated'));
      steps.push(`workspace ${ws.workspaceId} recreated`);
    }
    if (plan === 'restart_with_settings') {
      // 판의 설정 없이(`claude --resume <ID>`) 떠서 hook이 없다. 방금 이어 간 claude라 진행 중인 턴은 없다.
      const own = beginBoardExit(this, s, 'restart'); // P119
      try {
        await this.adapter.sendText(s.paneId, '/exit'); await sleep(150); await this.adapter.paneKeys(s.paneId, ['enter']);
        await waitClaudeExit(this, s, this.cfg.killWaitMs, { by: 'restart', steps }); // P71: 워크트리 나가기 질문은 남기기
      } finally { if (own) endBoardExit(this, s); }
      steps.push('/exit (no board settings)');
    }
    await this.adapter.waitShellReady(s.paneId, 8000);
    const args = resume ? buildResumeArgs(this.resumeLaunchOf(s)) : buildStartArgs(this.launchOf(s)); // P227: 이어 갈 때는 지금 모델
    await this.adapter.startAgent({ name: s.agentName, paneId: s.paneId, args, ...startOpt(s) });
    s.rt.exit = null; s.rt.phase = 'starting'; s.rt.launchedAt = Date.now(); s.rt.hooksSinceLaunch = 0; s.rt.sessionEnd = null;
    s.rt.term.launchPending = true; s.resumingAfterRestart = null;
    s.resumeVerified = false; this.store.updateSession(s.sessionId, { resumeVerified: false });
    s.recovered = { plan, at: Date.now() };
    steps.push(`${resume ? 'resumed' : 'started fresh'} by board`);
    this.store.addEvent(s.sessionId, 'recovered_by_board', { plan, steps, args });
    this.log(`recovered ${s.name}: ${plan}`);
    this.broadcastSession(s, { cause: `recover:${plan}` });
  }

  // 패널 ID가 바뀌었다(이어 가기로 작업 공간을 다시 만듦, hc가 같은 자리를 바꿔 띄움). 판에서 정한 역할이 있으면 그 연결 기록에 남긴다(F2)
  // P116: 시킨 쪽에 알림(옛 paneChangedNotice, P263에 지움)을 보내지 않는다. atrium 명령은 판의 이름으로 부르므로 패널이 바뀌어도 할 일이 없다(턴을 쓰지 않는다)
  // P117: quiet(옮기기, hc가 같은 자리를 바꿔 띄움)와 옮기는 중(rt.move)에는 연결 기록도 남기지 않는다
  async setPane(s, paneId, termWorkspaceId, why, { quiet = false } = {}) {
    const old = s.paneId;
    if (old === paneId) return;
    s.paneId = paneId; if (termWorkspaceId) s.termWorkspaceId = termWorkspaceId;
    if (s.agentName === old) s.agentName = paneId; // 이름 없는 에이전트는 패널 ID로 부른다
    this.store.updateSession(s.sessionId, { paneId, termWorkspaceId: s.termWorkspaceId, agentName: s.agentName });
    this.store.addEvent(s.sessionId, 'pane_changed', { from: old, to: paneId, why });
    await this.adapter.refreshSubscription();
    for (const l of quiet || (s.rt && s.rt.move) ? [] : this.store.links()) {
      if (l.to !== s.sessionId || !l.role || !this.sessions.has(l.from)) continue;
      this.linkEvent(l, 'pane_changed', null, { from: old, to: paneId, why }, { quiet: true });
    }
    this.broadcastSession(s, { cause: `pane:${why}` });
  }

  closeSession(s, reason) {
    this.queue.cancelSession(s.sessionId, 'session closed');
    try { this.relay.detach(s.sessionId); } catch {}
    if (s.settingsPath) try { fs.rmSync(s.settingsPath, { force: true }); } catch {} // 판이 세션을 닫을 때 설정 파일을 지운다(B3)
    try { fs.rmSync(tokenFileOf(this.cfg.sessionsDir, s.sessionId), { force: true }); } catch {} // P115: 세션 토큰 파일
    try { removeWrapperDir(path.join(this.cfg.dataDir || this.cfg.sessionsDir || '.', 'harness'), s.kind, s.sessionId); } catch {} // P298: 세션별 atrium 감싸개 폴더
    // 이 세션이 낀 연결은 판에서 뺀다(기록은 남는다)
    for (const l of this.store.links()) if (l.from === s.sessionId || l.to === s.sessionId) { this.store.updateLink(l.linkId, { removedAt: Date.now() }); this.api.broadcast('link.removed', { linkId: l.linkId, reason: 'session closed' }); }
    const closedAt = Date.now();
    delete s.rt.boardExit; // P119: 닫는 동안만 쓰는 표시
    this.store.updateSession(s.sessionId, { closedAt, runtime: s.rt, closeReason: reason }); // P7: 닫힌 세션은 사이드바에 남아 다시 연다(J2)
    this.store.addEvent(s.sessionId, 'closed', { reason });
    this.sessions.delete(s.sessionId);
    this.api.broadcast('session.removed', { sessionId: s.sessionId, name: s.name, reason });
    this.bus.emit('closed', s, reason); // P81: 까닭(부모에게 보낼 닫힘 알림)
    onSessionClosed(this, s); // P6a: 덩어리에서 뺀다
    { const idx = this.branch && this.branch.relIndex ? this.branch.relIndex() : null; // P119·P159: 일 부모가 닫히면 하위 세션이 맨 위라 안 본 턴이 작업 완료로 들어간다
      for (const x of this.sessions.values()) if (this.workParentOf(x.sessionId, idx) === s.sessionId) this.broadcastSession(x, { onlyIfFlagsChanged: true }); }
    this.adapter.refreshSubscription();
  }

  // ---------- 명령 ----------
  // P40·P122: 터미널 서버(hc)를 받거나 띄우지 못했으면 terminal_missing, 세대가 다르면 terminal_incompatible, 끊겼으면 terminal_down. 보드의 다른 기능은 막지 않는다
  requireTerminal() {
    if (this.termMissing || (this.termCompat && this.termCompat.level === 'missing')) {
      const m = this.termMissing || {};
      const error = String(m.error || m.reason || 'not ready');
      throw keyed(apiError('terminal_missing', `herdr-core를 받거나 시작하지 못했습니다(${error}). 인터넷 연결을 확인한 뒤 다시 시도하세요. 준비될 때까지 세션을 시작할 수 없습니다.`), 'terminalMissing', { error });
    }
    if (!this.termOk) {
      const c = this.termCompat || {};
      const problems = (c.problems || []).join('; ') || 'unknown';
      throw keyed(apiError('terminal_incompatible', `herdr-core가 호환되지 않습니다: ${problems}`), 'terminalIncompatible', { version: c.version || '?', problems });
    }
    if (!this.adapter.connected) throw keyed(apiError('terminal_down', "터미널 서버에 연결되어 있지 않습니다."), 'terminalDown');
  }
  // B3: 새 세션 시작. P5: 시작 폴더의 리포지토리 워크스페이스에 생긴다(G1). 종류 shell은 에이전트 없는 일반 셸(G2)
  async spawn(p) {
    const sdkPlan = p.launcher || p.launcherDef ? spawnPlanOf(this, p) : null;
    if (sdkPlan && sdkPlan.sdk) return this.spawnSdk(p, sdkPlan); // P363: SDK 세션은 터미널 없이
    this.requireTerminal();
    const cwd = path.resolve(String(p.cwd || ''));
    if (!p.cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw keyed(apiError('bad_request', `폴더를 찾을 수 없습니다: ${p.cwd}`), 'noFolder', { path: p.cwd });
    const pending = this.spawningNames || (this.spawningNames = new Set()); // 만드는 중인 세션 이름
    const taken = takenNames(this.sessions.values(), pending); // P66: 판의 이름(label)도 피한다. 대소문자 무시
    // P33: 띄울 값은 호출자(launchers.mjs)가 정한다. 함께 준 값(모델 등)이 호출자 값을 덮는다. 호출자 없이 부르면 준 값만 쓴다(atrium child, CLI --kind)
    const plan = spawnPlanOf(this, p);
    // P185: 사람이 승인 방식을 주고 띄우는 다른 종류(atrium spawn --kind codex --mode bypassPermissions)는 그 방식을 하네스의 승인 인자로 옮긴다
    //   (atrium child와 같은 표 APPROVAL_ARGS. 호출자의 추가 인자에 승인 인자가 있으면 호출자 것이 이긴다). 전에는 기록만 하고 인자를 붙이지 않았다
    if (p.permissionMode && !p.branch && plan.kind !== 'claude' && plan.kind !== SHELL) {
      const ap = approvalArgsOf(plan.kind, String(p.permissionMode), (plan.args || []).map(String), plan.startCommand || ''); // P330: omh는 승인 인자를 받지 않는다
      if (ap.args.length) plan.args = [...(plan.args || []), ...ap.args];
    }
    // P208: 명시한 노력 수준(atrium child --effort)은 Claude Code 밖 하네스의 인자로 옮기고 호출자 인자의 같은 값을 이긴다(Codex -c model_reasoning_effort).
    //   받지 않는 종류는 응답의 effort.ignored로 알린다. 잘못된 값은 띄우기 전에 던진다
    const effortPlan = p.effort && plan.kind !== 'claude' && plan.kind !== SHELL ? effortArgsOf(plan.kind, String(p.effort), plan.args || []) : null;
    if (effortPlan && effortPlan.applied) plan.args = effortPlan.args;
    // P330: 받지 않는 노력 수준·모델은 빼고 판 로그와 응답에 한 줄(조용히 버리지 않는다)
    const effortNote = effortPlan && effortPlan.ignored ? effortIgnoredLine(plan.kind, effortPlan.why === 'launcherArgs' ? effortPlan.effort : String(p.effort), effortPlan.why || null) : null;
    if (effortNote) this.log(`effort dropped (${plan.kind}): ${effortNote}`);
    const modelNote = plan.model && plan.kind !== 'claude' && plan.kind !== SHELL && !takesModel(plan.kind, plan.startCommand || '') ? modelIgnoredLine(plan.kind, plan.model) : null;
    if (modelNote) { this.log(`model dropped (${plan.kind}): ${modelNote}`); plan.model = null; }
    const { flavor, command } = plan;
    const kind = plan.kind;
    const shell = kind === SHELL;
    const orch = shell || plan.command ? null : orchOf(kind, plan); // P296: 자체 오케스트레이션(런처 칸, 없으면 종류의 기본)
    const orchScope = p.branch && !p.branch.head && p.branch.relation !== 'peer' ? 'sub' : 'free';
    let name = p.name;
    const prefix = shell ? 'sh' : 's';
    if (!name) { let i = 1; while (taken.has(`${prefix}${i}`)) i++; name = `${prefix}${i}`; }
    if (!NAME_RE.test(name) || name === 'all') throw apiError('bad_request', `이름에는 영문, 숫자, -, _만 사용할 수 있습니다 (all 제외): ${name}`);
    if (taken.has(name)) throw keyed(apiError('name_taken', `이미 사용 중인 이름입니다: ${name}`), 'nameTaken', { name });
    // 이름 검사와 세션 등록 사이에 await가 있어, 같은 이름의 요청 둘이 함께 지나가지 않게 예약해 둔다(이슈 #1-7, branch.mjs의 pendingNames와 같은 방식)
    pending.add(name);
    try {
      const claude = kind === 'claude';
      let permissionMode = claude ? plan.permissionMode || 'manual' : p.permissionMode || plan.permissionMode || 'manual'; // P192: 승인 칸이 있는 하네스(AGY)는 호출자의 승인 방식
      if (!PERMISSION_MODES.has(permissionMode)) throw apiError('bad_request', `승인 방식: ${permissionMode}`);
      const model = shell ? null : plan.model || null; // P115: Claude Code 밖 하네스도 모델을 기록한다(어댑터가 그 하네스 모양으로 넘긴다)
      // P299: Hermes는 노력 수준을 세션에 남기고(카드·맵·atrium me) 어댑터가 --reasoning으로 넘긴다(이어 가기에도). 런처 추가 인자의 --reasoning이 이긴다.
      //   받지 않는 값은 빼고 판 로그에 한 줄
      const hermesOwn = kind === 'hermes' ? reasoningIn(plan.args || []) : null;
      const hermesEffort = kind === 'hermes' ? hermesReasoningOf(plan.effort, plan.args || []) : null;
      if (kind === 'hermes' && (hermesOwn != null || plan.effort) && !hermesEffort) this.log(`hermes effort dropped: ${String(hermesOwn != null ? hermesOwn : plan.effort).slice(0, 20)} (Hermes --reasoning 값이 아니다)`);
      // P329: omo는 노력 수준을 세션에 남기고 어댑터가 --thinking으로 넘긴다(이어 가기에도). 런처 추가 인자의 --thinking이 이긴다(그 값을 보인다)
      const omoOwn = kind === 'omo' ? thinkingIn(plan.args || []) : null;
      const omoEffort = kind === 'omo' && omoOwn == null ? omoEffortOf(plan.effort) : null;
      if (kind === 'omo' && omoOwn == null && plan.effort && !omoEffort) this.log(`omo effort dropped: ${String(plan.effort).slice(0, 20)} (omo --thinking 값이 아니다)`);
      const effort = claude ? plan.effort || null : kind === 'hermes' ? hermesEffort || null : kind === 'omo' ? omoEffort || omoEffortOf(omoOwn) || null : null;
      const extraArgs = claude ? plan.extraArgs || [] : [];
      // P97: 실행 명령(호출자의 startCommand, 예: mywrap claude). 정하지 않은 하위 세션(atrium child의 물려받기·모델 풀기)은 부모 claude의 실행 명령을 물려받는다
      const parentS = p.parentSessionId ? this.sessions.get(p.parentSessionId) : null;
      // P115: 실행 명령은 모든 에이전트 하네스. 정하지 않은 하위 세션은 같은 종류 부모의 실행 명령을 물려받는다
      const startCommand = shell ? '' : plan.startCommand != null ? plan.startCommand : p.branch && parentS && parentS.kind === kind ? parentS.startCommand || '' : '';
      const harness = !claude && !shell && !!adapterOf(kind); // P115: 하네스 어댑터로 띄운다(env, PATH의 atrium, 안내문)
      // F5: 터미널이 아는 에이전트 종류. Claude Code만 판의 hook과 이어 가기 등록을 붙인다
      if (!KIND_RE.test(kind)) throw apiError('bad_request', `에이전트 종류: ${kind}`);
      if (!shell) {
        const kinds = await this.adapter.agentKinds().catch(() => []);
        if (kinds.length && !kinds.some((k) => k.kind === kind)) throw apiError('bad_request', `지원하지 않는 에이전트 종류입니다: ${kind}`);
      }
      if (command && p.prompt) throw keyed(apiError('not_agent', "직접 입력한 명령으로 실행하는 세션에는 첫 요청을 자동 전송하지 않습니다. 보드에서 에이전트의 준비 상태를 확인할 수 없으므로 세션이 시작된 뒤 요청을 보내세요."), 'commandNoPrompt');
      if (shell && p.prompt) throw keyed(apiError('not_agent', "셸에는 첫 요청을 자동 전송하지 않습니다. 명령 입력줄은 에이전트에게만 메시지를 보냅니다. 셸 명령은 터미널에 직접 입력하세요."), 'shellNoPrompt');
      // P25·P33: env에 게이트웨이 주소(ANTHROPIC_BASE_URL)를 둔 claude 런처는 그 주소가 닿아야 띄운다. P255: 모델 연결은 걷어 냈다
      if (claude && plan.gateway && plan.gateway.url) await checkGateway({ ...plan.gateway, name: plan.launcher || '' });
      // G1: 시작 폴더의 워크스페이스
      const ws = await workspaceOf(cwd);
      // P183: 사람이 띄우며 준 첫 요청(창의 새 세션 대화상자, 사람의 atrium spawn --prompt)은 사람의 deliver다(session.send와 같은 규칙).
      //   하위 세션(p.branch)은 branch.mjs가 한다
      const firstPrompt = p.prompt ? await this.humanFirstPrompt(p, { ws, name, kind, model, cwd }) : null;

      const sessionId = crypto.randomUUID();
      let hookToken = '', settingsPath = '', trust = { needsTrust: null, reason: `${kind}: 예상하지 않음` }, args = [], resumeArgv = null;
      const envAll = claude ? { ...((plan.env && Object.keys(plan.env).length) ? plan.env : {}) } : {};
      const env = claude && Object.keys(envAll).length ? envAll : null;
      if (claude) {
        hookToken = crypto.randomBytes(24).toString('hex');
        const extra = this.branch.settingsExtra(sessionId);
        if (env) extra.env = { ...env, ...(extra.env || {}) }; // P33: 호출자의 환경 변수. 판의 값이 이긴다
        settingsPath = writeSessionSettings({ file: path.join(this.cfg.sessionsDir, `${sessionId}.json`), hookUrl: this.hookUrl, token: hookToken, sessionId, timeoutSec: this.cfg.hookTimeoutSec, ...extra });
        trust = predictTrust(cwd, this.cfg.claudeJson);
        const launch = { sessionId, settingsPath, permissionMode, model, effort, extraArgs, worktree: p.worktree || null, ...this.pluginFor(orch ? { sessionId, name, kind, orch } : null, orchScope) }; // P296
        args = buildStartArgs(launch);
        resumeArgv = buildResumeArgv({ claudeCommand: this.cfg.claudeCommand, startCommand, ...launch });
      }
      // P115: 다른 종류는 하네스 어댑터(harness.mjs)가 판의 env·안내문·세션 ID를 더한다. 다시 띄울 값(모델, 호출자 추가 인자, 호출자)은 세션에 남긴다
      const harnessPlan = harness ? { model, args: (plan.args || []).map(String), launcher: plan.launcher || null, launcherId: plan.launcherId || null, harnessSessionId: null, ...(hermesEffort && hermesOwn == null ? { effort: hermesEffort } : {}), ...(omoEffort ? { effort: omoEffort } : {}) } : null; // P329: omo 노력 수준. P299: Hermes 노력 수준(런처 인자의 --reasoning은 args에서 읽는다)

      this.ensureWorkspace(ws, `spawn ${name}`);
      const rt = newRuntime({ trustPredicted: !!trust.needsTrust, kind, hooked: claude });
      if (shell) rt.phase = 'running';
      let s;
      const hw = await this.withNewPane(() => this.adapter.createWorkspace({ cwd, label: name }), (r) => {
        s = { sessionId, name, cwd, paneId: r.paneId, termWorkspaceId: r.workspaceId, agentName: shell ? r.paneId : name, model, effort, permissionMode, settingsPath, hookToken, resumeArgv, resumeVerified: false, createdAt: Date.now(), closedAt: null, seenAt: null, touchedAt: Date.now(), rt, lastState: null, kind, origin: 'board', parentSessionId: p.parentSessionId || null, workspaceKey: ws.key, flavor, extraArgs, startCommand, harnessPlan, orch }; // P296: orch
        this.store.insertSession({ ...s, runtime: rt });
        this.sessions.set(sessionId, s);
        if (p.branch) this.branch.noteChild(sessionId, p.branch); // P8: atrium child로 만든 하위 세션
      });
      if (claude && this.briefNotices) try { this.briefNotices.stamp(s, 'start'); } catch {} // P317: 띄울 때 받은 판 안내문 판(하네스는 startHarness가)
      // 빈자리는 그 워크스페이스 영역 안이나 바로 옆(P6a H1). 사람이 보는 화면은 옮기지 않는다. P8(K4): 하위 세션은 부모 오른쪽 열에 형제끼리 쌓는다
      // P75: 워크트리 워커는 상자 테두리까지 비워 둔다. P350: 사람이 claude -w로 띄운 세션(빠른 워크트리 세션)도(canvas-ops.mjs placeSpawn)
      if (p.worktree && !p.branch) s.wtSpawn = String(p.worktree);
      const area = this.worktrees ? this.worktrees.areaOf(ws.key, cwd) : ''; // P27: 워크트리 폴더에서 띄우면 그 워크트리 영역
      const place = placeSpawn(this, s, { branch: p.branch || null, worktree: p.worktree || null, area });
      // P78: claude -w가 워크트리를 만드는 대로 상자를 세운다(10초 주기를 기다리지 않는다)
      if (p.branch && p.branch.worktree && this.worktrees) for (const ms of [3000, 8000]) { const t = setTimeout(() => this.worktrees.kick('worktree spawn'), ms); if (t.unref) t.unref(); }
      settleRegions(this, 'spawn');
      this.store.addEvent(sessionId, 'spawn', { name, kind, cwd: slash(cwd), workspace: ws.key, trust, args, ...(plan.launcher ? { launcher: plan.launcher } : {}), ...(env ? { env } : {}), ...(extraArgs.length ? { extraArgs } : {}), ...(startCommand ? { startCommand } : {}), ...(harnessPlan ? { harness: harnessPlan } : {}), ...(orch ? { orch } : {}), ...(flavor || command ? { flavor, command: command || null } : {}), ...(p.branch ? { parent: p.parentSessionId, worktree: p.worktree || null, place: place ? 'tree' : 'slot' } : {}) });
      await this.adapter.refreshSubscription();
      this.api.broadcast('session.created', { sessionId, name, workspaceKey: ws.key });
      this.broadcastSession(s, { cause: 'spawn' });
      this.probeGit(s, cwd);
      const out = { sessionId, name, ...(effortPlan ? { effort: { value: effortPlan.effort, applied: effortPlan.applied, ignored: !!effortPlan.ignored, ...(effortNote ? { note: effortNote } : {}) } } : {}), ...(modelNote ? { modelNote } : {}), kind, flavor, paneId: hw.paneId, termWorkspaceId: hw.workspaceId, workspaceKey: ws.key, workspaceRoot: ws.root, settingsPath, trust, resumeArgv };
      if (command) {
        // P25 직접 명령: 셸 프롬프트가 뜨면 그 글을 그대로 치고 Enter. 에이전트가 나타나면 promoteShell이 같은 노드의 종류를 바꾼다(hook 없음)
        const ready = await this.adapter.waitShellReady(hw.paneId);
        await this.adapter.sendText(hw.paneId, command); await sleep(150); await this.adapter.paneKeys(hw.paneId, ['enter']);
        this.store.addEvent(sessionId, 'command_typed', { command, shellReady: ready });
        this.log(`spawned ${name} (${plan.launcher || flavor} command) ${sessionId} pane=${hw.paneId} ws=${ws.key} shellReady=${ready}`);
        return { ...out, argv: null, command };
      }
      if (shell) { this.log(`spawned shell ${name} ${sessionId} pane=${hw.paneId} ws=${ws.key}`); return { ...out, argv: null }; }

      const shellReady = await this.adapter.waitShellReady(hw.paneId);
      let st = { agent: null, argv: [kind, ...args] };
      try { st = harness ? await this.startHarness(s, { name }) : await this.adapter.startAgent({ name, paneId: hw.paneId, args, kind, ...(startCommand ? { command: startWords(startCommand) } : {}) }); }
      catch (e) {
        if (e.code === 'agent_not_detected') { this.store.addEvent(sessionId, 'start_command_failed', { startCommand, argv: e.argv || null }); throw keyed(apiError('start_command_failed', `실행 명령(${startCommand || kind})으로 ${kind}가 뜨지 않았습니다. 세션 창의 터미널에서 오류를 확인하세요.`), 'launcherStart.failed', { cmd: startCommand || kind, kind }); } // P97
        if (e.code !== 'agent_not_ready') throw e; this.store.addEvent(sessionId, 'agent_not_ready', { kind });
      } // 시작하자마자 대화상자(신뢰 등)에서 막혔다. 이름은 남는다
      rt.term.launchPending = st.agent ? st.agent.launchPending : true;
      if (firstPrompt) this.queue.enqueue(sessionId, firstPrompt, { origin: { kind: 'human' } }); // P182: 출처(사람이 띄우며 준 첫 요청)
      this.log(`spawned ${name} ${kind} ${sessionId} pane=${hw.paneId} ws=${ws.key} shellReady=${shellReady} trust=${JSON.stringify(trust)}`);
      return { ...out, argv: st.argv };
    } finally { pending.delete(name); }
  }
  // P363: SDK 세션 띄우기. 터미널 패널 없이 세션을 판에 올리고, 프로세스(claude -p)는 첫 글을 보낼 때 뜬다(SdkHost.send).
  //   키가 없거나 중계기를 못 띄우면 세션을 만들지 않고 까닭을 던진다. 권한은 bypassPermissions, 설정 파일(hook·판 env)은 판이 띄운 claude와 같다
  async spawnSdk(p, plan) {
    const cwd = path.resolve(String(p.cwd || ''));
    if (!p.cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw keyed(apiError('bad_request', `폴더를 찾을 수 없습니다: ${p.cwd}`), 'noFolder', { path: p.cwd });
    const pending = this.spawningNames || (this.spawningNames = new Set());
    const taken = takenNames(this.sessions.values(), pending);
    let name = p.name;
    if (!name) { let i = 1; while (taken.has(`s${i}`)) i++; name = `s${i}`; }
    if (!NAME_RE.test(name) || name === 'all') throw apiError('bad_request', `이름에는 영문, 숫자, -, _만 사용할 수 있습니다 (all 제외): ${name}`);
    if (taken.has(name)) throw keyed(apiError('name_taken', `이미 사용 중인 이름입니다: ${name}`), 'nameTaken', { name });
    if (p.effort && !EFFORTS.includes(String(p.effort))) throw apiError('bad_request', `추론 수준: ${p.effort}`);
    pending.add(name);
    try {
      await this.authRelay.ensure(); // 키가 없으면 auth_relay_no_key(세션을 만들지 않는다)
      // P361: 장부에서 구매 잔액이 0 이하이고 월·프로모션 크레딧도 바닥이면 띄우되 알린다(막지 않는다: 장부는 붙여 넣은 값과 추정이다)
      let creditWarning = null;
      try { creditWarning = this.credits ? this.credits.spawnWarning() : null; } catch {}
      if (creditWarning) { this.store.addEvent(null, 'credits_exhausted_spawn', { name }); this.api.broadcast('credits.alert', { kind: 'exhausted', name, ...creditWarning }); }
      const ws = await workspaceOf(cwd);
      const firstPrompt = p.prompt ? await this.humanFirstPrompt(p) : null;
      const sessionId = crypto.randomUUID();
      const hookToken = crypto.randomBytes(24).toString('hex');
      const settingsPath = writeSessionSettings({ file: path.join(this.cfg.sessionsDir, `${sessionId}.json`), hookUrl: this.hookUrl, token: hookToken, sessionId, timeoutSec: this.cfg.hookTimeoutSec, ...this.branch.settingsExtra(sessionId) });
      const model = p.model || plan.model || null, effort = p.effort || plan.effort || null;
      const extraArgs = plan.extraArgs || [];
      this.ensureWorkspace(ws, `spawn ${name}`);
      const rt = newRuntime({ kind: 'claude', hooked: true });
      rt.phase = 'running'; rt.term.present = true; rt.term.status = 'idle'; rt.term.launchPending = false;
      const s = { sessionId, name, cwd, paneId: null, termWorkspaceId: null, agentName: name, model, effort, permissionMode: 'bypassPermissions', settingsPath, hookToken, resumeArgv: null, resumeVerified: false, createdAt: Date.now(), closedAt: null, seenAt: null, touchedAt: Date.now(), rt, lastState: null, kind: 'claude', origin: 'board', parentSessionId: p.parentSessionId || null, workspaceKey: ws.key, flavor: plan.flavor || null, extraArgs, startCommand: '', harnessPlan: null, orch: null, billing: SDK_BILLING, sdkWorktree: p.worktree || null };
      this.store.insertSession({ ...s, runtime: rt });
      this.sessions.set(sessionId, s);
      if (p.branch) this.branch.noteChild(sessionId, p.branch);
      if (this.briefNotices) try { this.briefNotices.stamp(s, 'start'); } catch {}
      const area = this.worktrees ? this.worktrees.areaOf(ws.key, cwd) : '';
      const place = placeSpawn(this, s, { branch: p.branch || null, worktree: p.worktree || null, area });
      settleRegions(this, 'spawn');
      this.store.addEvent(sessionId, 'spawn', { name, kind: 'claude', sdk: true, cwd: slash(cwd), workspace: ws.key, ...(plan.launcher ? { launcher: plan.launcher } : {}), model, effort, ...(extraArgs.length ? { extraArgs } : {}), ...(p.branch ? { parent: p.parentSessionId, worktree: p.worktree || null, place: place ? 'tree' : 'slot' } : {}) });
      this.api.broadcast('session.created', { sessionId, name, workspaceKey: ws.key });
      this.broadcastSession(s, { cause: 'spawn' });
      this.probeGit(s, cwd);
      if (firstPrompt) this.queue.enqueue(sessionId, firstPrompt, { origin: { kind: 'human' } });
      this.log(`spawned ${name} sdk ${sessionId} ws=${ws.key} model=${model || '-'}`);
      return { sessionId, name, kind: 'claude', sdk: true, billing: SDK_BILLING, flavor: plan.flavor || null, paneId: null, termWorkspaceId: null, workspaceKey: ws.key, workspaceRoot: ws.root, settingsPath, trust: { needsTrust: false, reason: 'sdk (claude -p)' }, resumeArgv: null, argv: null, ...(creditWarning ? { creditWarning: { ...creditWarning, text: `API 크레딧 장부로는 월·프로모션 크레딧이 바닥이고 구매 잔액이 ${creditWarning.vars.purchased}입니다. 이 세션은 미납으로 쌓일 수 있습니다.` } } : {}) };
    } finally { pending.delete(name); }
  }
  // 사람이 띄우며 준 첫 요청 → 넣을 글 | null
  async humanFirstPrompt(p) {
    return p.prompt ? toLF(String(p.prompt)) : null;
  }
  // 판이 패널을 만드는 동안(작업 공간 만들기 → 세션 등록) 그 패널의 pane_created를 판에 올리지 않게 막는다(G2)
  async withNewPane(create, register) {
    this.creatingPanes = (this.creatingPanes || 0) + 1;
    try { const r = await create(); await register(r); return r; } finally { this.creatingPanes--; }
  }

  // B1·B2: 이름 하나 이상(@a @b) 또는 @all. P5: 셸에는 보내지 않는다(not_agent).
  // P6a(H8): @all은 캔버스 전체의 에이전트 세션. workspace를 주면 그 워크스페이스의 에이전트 세션만
  // P90: whileWorking: 'type'(옛 휴대폰 입력 줄)이면 Claude Code가 일하는 중일 때 기다리지 않고 바로 넣는다(delivery.mjs canTypeNow). 쓰다 만 글이 있으면 기다린다
  // P248: steer: true(창 보내기 칸·휴대폰 입력 줄의 스티어링 선택)면 atrium prompt --steer(--now)와 같은 길(typeNow + aside)로 넣는다.
  //   일하는 판의 Claude Code면 입력 칸에 넣어 Claude Code 대기 메시지가 되고(쓰다 만 글은 비킨다), 쉬면 곧바로 보통 보내기다.
  //   일하는 중 입력을 받지 못하는 세션(다른 종류, hook 없는 세션)은 대기열로 보내고 그 전달에 steer: { ok: false, why }를 돌려준다. 기본(steer 없음)은 대기열
  async send(p) {
    let targets = Array.isArray(p.target) ? p.target : null;
    let text = p.text;
    if (!targets) {
      if (p.target) targets = String(p.target).split(/[\s,]+/).filter(Boolean);
      else { const parsed = parseTargets(p.text || ''); targets = parsed.targets; text = parsed.text; }
    }
    if (!targets.length) throw apiError('bad_request', "메시지를 받을 세션을 @이름으로 지정하세요.");
    if (!text || !String(text).trim()) throw apiError('bad_request', "보낼 내용을 입력하세요.");
    // 대상 풀기: @all, @세션 이름(B2)
    const picked = new Map(); // sessionId → 세션
    const agent = (s) => s.kind !== SHELL;
    for (const raw of targets) {
      const t = raw.replace(/^@/, '');
      if (t === 'all') {
        const ws = p.workspace ? await this.resolveWorkspace(p.workspace) : null;
        const list = [...this.sessions.values()].filter((s) => (!ws || s.workspaceKey === ws.key) && agent(s));
        if (!list.length) throw apiError('not_found', ws ? `프로젝트 ${ws.root}에 에이전트 세션이 없습니다.` : "보드에 에이전트 세션이 없습니다.");
        for (const s of list) if (!picked.has(s.sessionId)) picked.set(s.sessionId, s);
        continue;
      }
      const one = findSession(this.sessions.values(), t); // P66: 새 이름과 옛 주소를 둘 다 받는다
      if (one && !agent(one)) throw keyed(apiError('not_agent', `@${shownName(one)} 세션은 일반 셸입니다. 명령 입력줄은 에이전트에게만 메시지를 보냅니다. 셸 명령은 터미널에 직접 입력하세요.`), 'shellNoBar', { name: shownName(one) });
      if (!one) throw keyed(apiError('not_found', `보드에서 세션을 찾을 수 없습니다: ${raw}`), 'targetNotFound', { ref: raw });
      picked.set(one.sessionId, one);
    }
    const qopts = (s) => (p.steer ? (steerBlock(s, this.hooked(s)) ? {} : { typeNow: true, aside: true }) : { typeNow: p.whileWorking === 'type' }); // P248
    const steerOut = (s) => { if (!p.steer) return {}; const why = steerBlock(s, this.hooked(s)); return { steer: why ? { ok: false, why } : { ok: true } }; };
    const deliveries = await Promise.all([...picked.values()].map(async (s) => {
      let body = toLF(text);
      const held = !p.steer && this.decisions ? this.decisions.takeHeld(s.sessionId) : null; // P286: 모아 둔 결정 답은 사람의 글 앞에 붙여 한 전달로(스티어링 글이면 onHuman이 따로 보통 메시지로)
      if (held) body = `${held.text}\n\n${body}`;
      const pn = !p.steer && this.planNotes ? this.planNotes.take(s.sessionId) : null; // P306: 모인 목표 레인 알림도 사람의 글 앞에
      if (pn) body = `${pn.text}\n\n${body}`;
      const d = this.queue.enqueue(s.sessionId, body, { ...qopts(s), origin: { kind: 'human' } });
      if (pn) { this.planNotes.rides.set(d.deliveryId, { sessionId: s.sessionId, pend: pn.pend }); this.store.addEvent(s.sessionId, 'plan_note', { why: 'human_front', deliveryId: d.deliveryId, lanes: pn.lanes }); }
      if (held) { this.store.addEvent(s.sessionId, 'decision_flush', { ids: held.ids, deliveryId: d.deliveryId, why: 'human_front', now: held.now, next: held.next }); this.decisions.rides.set(d.deliveryId, held.ids); } // P295: 실패·취소되면 다시 붙잡는다
      this.touch(s);
      try { if (this.decisions) this.decisions.onHuman(s.sessionId, 'bar'); } catch (e) { this.log('decisions human error', e.stack); } // P284: 사람이 카드를 거치지 않고 직접 보낸 글(명령 바·휴대폰 입력)은 그 세션의 열린 결정 카드를 닫는다
      return { deliveryId: d.deliveryId, sessionId: s.sessionId, name: shownName(s), status: d.status, ...steerOut(s) };
    }));
    // I2(P6b): 명령 바에서 보낸 글은 Thread에 남긴다. source: bar(기본), output(출력 보기에서 답장)
    const item = this.features ? this.features.thread.add({ source: p.source || 'bar', text: toLF(text), targets: targets.map((t) => '@' + String(t).replace(/^@/, '')), deliveries }) : null;
    return { deliveries, threadItemId: item ? item.itemId : null };
  }

  // D2: 판이 띄운 세션만 끈다. /exit로 정상 종료하고 작업 공간을 닫는다.
  async kill(p) {
    const s = this.resolve(p.session);
    if (isSdk(s)) return this.killSdk(s, p); // P363
    const shared = await this.adapter.workspacePanes(s.termWorkspaceId).then((ps) => ps.filter((x) => x.paneId !== s.paneId)).catch(() => []);
    const kindName = s.kind || 'claude';
    const closeText = shared.length ? `패널 ${s.paneId}만 닫습니다 (같은 작업 공간의 다른 터미널 창 ${shared.length}개는 유지합니다).` : "터미널 창을 닫습니다.";
    // G2: 셸은 패널만 닫는다. 돌고 있는 명령도 함께 끝난다
    const closeMsg = shared.length ? m('killClosePane', { pane: s.paneId, n: shared.length }) : m('killCloseAll');
    if (!p.confirm && kindName === SHELL) { const sh = s.rt.shell; const cmd = sh && !sh.atPrompt ? clip(sh.command || (sh.procs || []).join(', ') || '?', 60) : null; return confirmResult(`셸 ${s.name}: ${closeText}${cmd ? ` 실행 중인 명령(${cmd})도 종료합니다.` : ''}`, m('killShell', { name: s.name, close: closeMsg, running: cmd ? m('killShellRunning', { cmd }) : '' })); }
    // P71: `claude -w` 세션이면 확인에 워크트리를 알린다. 창의 닫기 확인이 "워크트리 남기기(기본)"와 "워크트리와 브랜치 지우기"를 보인다
    const wt = worktreeOf(s, this.branch && this.branch.info.get(s.sessionId));
    if (!p.confirm) return confirmResult(`${s.name} 세션에서 실행 중인 ${kindName} 에이전트를 종료합니다. ${closeText} 보관하면 보관함에서 다시 열 수 있습니다.${kindName === 'claude' ? " 삭제하면 대화 기록을 휴지통으로 보내고 보드에서 제거합니다." : " 삭제하면 보드에서 제거합니다."}${wt ? ` 워크트리(${wt.name})는 남깁니다. 지우려면 worktree: remove를 지정하세요.` : ''}`, m('kill', { name: s.name, kind: kindName, close: closeMsg, del: m(kindName === 'claude' ? 'killDeleteClaude' : 'killDeleteOther') }), wt ? { worktree: wt } : {});
    if (p.after && !['archive', 'delete'].includes(p.after)) throw apiError('bad_request', `after에는 archive 또는 delete를 지정하세요: ${p.after}`);
    if (p.worktree != null && !['keep', 'remove'].includes(p.worktree)) throw apiError('bad_request', `worktree에는 keep 또는 remove를 지정하세요: ${p.worktree}`);
    const wtChoice = p.worktree === 'remove' ? 'remove' : 'keep'; // 사람이 지우기를 고르지 않았으면 남긴다
    // P21(D4): 잠든 세션은 패널이 없다. 터미널 없이 판에서 닫고 보관·삭제한다
    if (s.rt.sleep && !s.paneId && !(this.sleeper && (this.sleeper.wakes.has(s.sessionId) || this.sleeper.going.has(s.sessionId)))) {
      s.rt.sleep = null; s.rt.exit = { kind: 'normal', reason: 'closed while sleeping', at: Date.now() };
      this.closeSession(s, 'killed');
      let after = null;
      if (p.after === 'archive') { this.recall.markArchive({ session: s.sessionId }, true, 'close'); after = { archived: true }; }
      else if (p.after === 'delete') after = await this.recall.forgetClosed(s.sessionId);
      return { closed: true, name: s.name, exit: null, steps: ['sleeping: no pane'], ...(after ? { after } : {}) };
    }
    this.requireTerminal();
    this.killing.add(s.sessionId);
    const steps = [];
    try {
      const st = () => deriveState(s.rt).state;
      if (s.rt.term.present && kindName !== SHELL) {
        const exiting = !!s.rt.worktreeExit; // P71: 워크트리 나가기 질문이 이미 떠 있다. esc로 취소하지 않고 그 질문에 답한다
        if (!exiting && (st() === 'waiting' || st() === 'trust_wait' || st() === 'working')) {
          await this.adapter.sendKeys(s.agentName, ['esc']).catch((e) => steps.push(`esc failed ${e.code}`));
          steps.push(`esc (${st()})`);
          for (let i = 0; i < 25 && s.rt.term.present && ['waiting', 'trust_wait', 'working'].includes(st()); i++) await sleep(200);
        }
        if (s.rt.term.present) {
          s.rt.exitRequested = true;
          beginBoardExit(this, s, 'close'); // P119: 판이 답할 나가기 질문은 응답 필요로 보이지 않는다(finally에서 거둔다)
          // Claude Code는 /exit. 다른 종류는 하네스마다 끝내는 말이 달라 ctrl+c를 두 번 보낸다(codex는 두 번째에 끝난다)
          if (exiting) steps.push('worktree exit dialog open');
          else if (EXIT_TEXT[kindName]) {
            await this.adapter.sendText(s.paneId, EXIT_TEXT[kindName]);
            await sleep(150);
            await this.adapter.paneKeys(s.paneId, ['enter']);
            steps.push(EXIT_TEXT[kindName]);
          } else {
            for (let i = 0; i < 2 && s.rt.term.present; i++) { await this.adapter.paneKeys(s.paneId, ['ctrl+c']).catch(() => {}); steps.push('ctrl+c'); await sleep(600); }
          }
          const waited = await waitClaudeExit(this, s, this.cfg.killWaitMs, { worktree: wtChoice, by: 'close', steps }); // claude가 아닌 종류는 기다리기만 한다
          steps.push(s.rt.term.present ? `${kindName} still running` : `${kindName} exited in ${waited}ms`);
        }
      }
      const exit = s.rt.exit;
      // 같은 작업 공간에 다른 패널이 있으면 이 패널만 닫는다
      if (shared.length) await this.adapter.closePane(s.paneId).then(() => steps.push(`pane ${s.paneId} closed`)).catch((e) => steps.push(`pane.close failed ${e.code}`));
      else await this.adapter.closeWorkspace(s.termWorkspaceId).then(() => steps.push(`workspace ${s.termWorkspaceId} closed`)).catch((e) => steps.push(`workspace.close failed ${e.code}`));
      this.closeSession(s, 'killed');
      // P15: 닫는 것은 보관이나 삭제다(노드의 X). 아무것도 하지 않으면 닫힌 세션으로 남고 판 밖 대화처럼 다시 보인다
      let after = null;
      if (p.after === 'archive') { this.recall.markArchive({ session: s.sessionId }, true, 'close'); after = { archived: true }; }
      else if (p.after === 'delete') after = await this.recall.forgetClosed(s.sessionId);
      return { closed: true, name: s.name, exit, steps, ...(after ? { after } : {}) };
    } finally { this.killing.delete(s.sessionId); endBoardExit(this, s); }
  }

  // P363: SDK 세션 닫기. 프로세스를 끊고(지금 턴도 끝난다) 판에서 닫는다. 터미널은 없다
  async killSdk(s, p) {
    if (!p.confirm) return confirmResult(`${s.name} SDK 세션을 닫습니다. 도는 claude -p 프로세스가 있으면 끊습니다. 보관하면 보관함에 남습니다.`, m('kill', { name: s.name, kind: 'claude', close: '', del: m('killDeleteClaude') }));
    if (p.after && !['archive', 'delete'].includes(p.after)) throw apiError('bad_request', `after에는 archive 또는 delete를 지정하세요: ${p.after}`);
    const stopped = await this.sdk.stop(s, 'kill');
    s.rt.exit = { kind: 'normal', reason: 'closed', at: Date.now(), requested: true };
    this.closeSession(s, 'killed');
    let after = null;
    if (p.after === 'archive') { this.recall.markArchive({ session: s.sessionId }, true, 'close'); after = { archived: true }; }
    else if (p.after === 'delete') after = await this.recall.forgetClosed(s.sessionId);
    return { closed: true, name: s.name, exit: s.rt.exit, steps: [stopped ? 'sdk process stopped' : 'sdk: no process'], ...(after ? { after } : {}) };
  }
  // P363: SDK 세션 멈추기(지금 턴 끊기). 판의 멈추기 단추·atrium이 부른다
  async stopSdkTurn(p) {
    const s = this.resolve(p.session);
    if (!isSdk(s)) throw apiError('bad_request', 'SDK 세션이 아닙니다');
    const stopped = await this.sdk.stop(s, 'interrupt');
    return { stopped, state: deriveState(s.rt).state };
  }

  askView(s, ask) { return ask; }

  // A1 답하기(P2): 승인 카드의 답을 agent.send_keys(글은 pane.send_text)로 넣는다.
  // 보내기 직전 확인: 터미널 상태가 blocked인지, 카드의 요청(tool_use_id)이 아직 기다리는 요청인지(PostToolUse가 오면 pendingAsk가 풀린다).
  // 아니면 보내지 않는다. stale·no_pending_ask면 창은 카드를 닫고, not_blocked면 카드를 둔다.
  async answer(p) {
    const s = this.resolve(p.session);
    this.requireTerminal();
    if (s.rt.worktreeExit && !s.rt.pendingAsk) return this.answerWorktreeExit(s, p); // P71: 화면에서 읽은 질문이라 hook이 없어도 답한다
    // 승인 카드의 키 순서는 판이 띄운 Claude Code만 안다(E9). 다른 종류와 판에 올린 에이전트는 터미널에서 답한다(F5)
    if (!this.hooked(s)) throw apiError('answer_in_terminal', `${s.name}(${s.kind})의 응답 키 입력 순서를 보드에서 확인할 수 없습니다. 터미널에서 직접 응답하세요.`);
    const card = { toolUseId: p.toolUseId || null, since: p.since || null };
    // P232(H18): 기다리는 ask가 없는데 막혀 있으면 화면을 한 번 더 읽는다("n of m"의 둘째 권한 질문)
    if (!s.rt.pendingAsk && s.rt.term.status === 'blocked' && (s.kind || 'claude') === 'claude') { try { await this.checkBlocked(s); } catch {} }
    const ask = s.rt.pendingAsk;
    if (!ask) return { sent: false, reason: 'no_pending_ask' };
    if (!sameAsk(ask, card)) return { sent: false, reason: 'stale' };
    const plan = planAnswer(ask, p);
    checkSteps(plan.steps);
    if (s.answering) throw keyed(apiError('busy', "이 세션에 이미 응답을 전송하고 있습니다."), 'answerBusy');
    s.answering = true;
    try {
      const a = await this.adapter.getAgent(s.agentName);
      if (!a || a.status !== 'blocked') return { sent: false, reason: 'not_blocked', termStatus: a ? a.status : null };
      if (s.rt.pendingAsk !== ask) return { sent: false, reason: 'stale' };
      for (let i = 0; i < plan.steps.length; i++) {
        const st = plan.steps[i];
        if (i) await sleep(this.cfg.answerStepMs);
        if (st.keys) await this.adapter.sendKeys(s.agentName, st.keys);
        else await this.adapter.sendText(s.paneId, st.text);
      }
      // 판에서 답한 기록은 판이 보낸 키로 남긴다(A1 거부 기록)
      this.touch(s);
      const rec = { by: 'board', kind: ask.kind, tool: ask.tool, toolUseId: ask.toolUseId, choice: p.choice ?? null, picks: p.picks ?? null, label: plan.label, steps: plan.steps.map((x) => (x.keys ? x.keys.join('+') : `text(${x.text.length})`)) };
      this.store.addEvent(s.sessionId, 'answer', rec);
      this.api.broadcast('session.answer', { sessionId: s.sessionId, name: s.name, ...rec });
      return { sent: true, label: plan.label, steps: rec.steps };
    } finally { s.answering = false; }
  }

  // P104: 휴대폰 키 줄의 키를 그 세션 패널에 그대로 보낸다(pane.send_keys). 허용 목록의 키만, 세션마다 차례로 보내고 이벤트 'keys'로 남긴다.
  // 판이 답을 고르지 않으므로 상태(waiting 등)를 보지 않는다. 셸의 방향키처럼 언제나 보낸다
  async sendKeysTo(p, c) {
    const s = this.resolve(p.session ?? p.target);
    const keys = checkKeys(p.keys);
    this.requireTerminal();
    if (!s.paneId) throw keyed(apiError('sleeping', `@${s.name} 세션은 절전 중이라 터미널이 닫혀 있습니다. 먼저 작업을 재개하세요.`), 'sleepingNoPane', { name: s.name });
    await this.keyChain(s.sessionId, () => this.adapter.paneKeys(s.paneId, keys));
    s.lastUserInputAt = Date.now();
    this.touch(s);
    if (c) this.peers.touch(c);
    this.store.addEvent(s.sessionId, 'keys', { keys, ...keysBy(c) });
    return { sent: true, keys };
  }

  // P71: 승인 줄의 워크트리 나가기 답. 보내기 직전에 화면을 다시 읽어 질문이 아직 있는지 보고 그 번호를 보낸다
  async answerWorktreeExit(s, p) {
    const cur = s.rt.worktreeExit;
    if (p.since && p.since !== cur.at) return { sent: false, reason: 'stale' };
    planAnswer(worktreeExitAsk(cur), p); // 답 모양과 지우기 확인을 먼저 본다
    if (s.answering) throw keyed(apiError('busy', "이 세션에 이미 응답을 전송하고 있습니다."), 'answerBusy');
    s.answering = true;
    try {
      const w = parseWorktreeExit(await this.adapter.readScreen(s.paneId, { source: 'visible' }).catch(() => ''));
      if (!w) { s.rt.worktreeExit = null; this.broadcastSession(s, { cause: 'worktree_exit:gone' }); return { sent: false, reason: 'stale' }; }
      const plan = planAnswer(worktreeExitAsk({ ...w, at: cur.at }), p);
      checkSteps(plan.steps);
      s.rt.exitRequested = true; // 어느 답이든 claude는 끝난다(hook이 없는 세션도 정상 종료로 본다)
      await this.adapter.paneKeys(s.paneId, plan.steps[0].keys);
      this.touch(s);
      const rec = { by: 'board', kind: 'worktree_exit', choice: p.choice, commits: w.commits, files: w.files, label: plan.label, steps: plan.steps.map((x) => x.keys.join('+')) };
      this.store.addEvent(s.sessionId, 'answer', rec);
      this.api.broadcast('session.answer', { sessionId: s.sessionId, name: s.name, ...rec });
      return { sent: true, label: plan.label, steps: rec.steps };
    } finally { s.answering = false; }
  }

  // 터미널 서버 끄기·켜기·다시 띄우기(C3, D2). 끄면 그 안의 프로그램이 함께 끝나고, 다시 띄우면 판이 판 세션을 이어 간다(J1).
  async terminalControl(op, confirm) {
    const warn = "보드 전용 터미널 서버를 종료하면 모든 세션과 터미널이 종료되고 진행 중인 작업이 중단됩니다. 서버를 다시 시작하면 기존 대화에서 세션을 재개합니다.";
    if ((op === 'stop' || op === 'restart') && !confirm) return confirmResult(warn, m('terminalStop'));
    const out = { op };
    if (op === 'stop' || op === 'restart') {
      this.termStopping = true;
      out.stop = await this.adapter.stopServer();
      await sleep(500);
      this.termStopping = false;
    }
    if (op === 'start' || op === 'restart') {
      let r;
      try { r = await this.adapter.startServer(); }
      catch (e) { await this.ensureTerminal(); this.broadcastTerminal(); throw keyed(apiError(e.code || 'start_failed', `터미널 서버를 시작하지 못했습니다: ${e.detail || e.message}`), 'terminalStartFailed', { error: e.detail || e.message }); }
      this.termMissing = null;
      this.store.addEvent(null, 'terminal_started', { pid: r.pid, by: op });
      out.start = { started: r.started, pid: r.pid, ms: r.ms, version: r.pong && r.pong.version, protocol: r.pong && r.pong.protocol, exe: this.adapter.exePath || null };
      this.setTermCompat(this.adapter.checkCompat(r.pong));
      if (this.termOk && !this.adapter._watching) this.adapter.startEvents(() => [...this.sessions.values()].map((s) => s.paneId).filter(Boolean));
      this.broadcastTerminal();
    }
    return out;
  }

  // 진단: 서버가 도는지, 붙었는지, 버전, 옛 판 옮기기 진행(P129)
  async terminalStatus() {
    const p = await this.adapter.probe();
    const compat = p.running ? this.adapter.checkCompat(p.pong) : null;
    const v = this.terminalView();
    return {
      ...v, hcVersion: (compat && compat.hcVersion) || v.hcVersion,
      running: p.running, serverPid: p.running ? this.adapter.serverPid() : null, compat, cliVersion: await this.adapter.cliVersion(), subscribedPanes: this.adapter.subscribedPanes || [],
      level: compat ? compat.level : v.level, version: compat ? compat.version : v.version, protocol: compat ? compat.protocol : v.protocol, warning: compat ? compat.warning : v.warning,
    };
  }

  inbox() {
    const all = [...this.sessions.values()].map((s) => this.summary(s));
    const mine = all.filter((x) => x.state === 'waiting' || x.state === 'trust_wait').sort((a, b) => (a.waitingSince || (a.ask && a.ask.since) || a.createdAt) - (b.waitingSince || (b.ask && b.ask.since) || b.createdAt));
    const review = all.filter((x) => x.unseen).sort((a, b) => (a.turn.endedAt || 0) - (b.turn.endedAt || 0));
    const errors = all.filter((x) => x.state === 'error' || (x.state === 'exited' && x.exit && x.exit.kind !== 'normal' && x.exit.kind !== 'user')); // P125: 사람이 닫은 것은 문제가 아니다
    return { needsYou: mine, review, problems: errors };
  }

  // ---------- 브리핑, 복귀 요약(E2·A3, P3). 한 줄 메모는 P22에서 뺐다 ----------
  // 들어갈 때 브리핑(E2): 마지막 지시, 마지막 답, 지금 상태, 기다리는 질문. 모델을 부르지 않고 대화 기록에서 뽑기만 한다.
  briefing(p) {
    const s = this.resolve(p.session);
    const sum = this.summary(s);
    const tx = lastExchange(s.rt.transcriptPath || transcriptPathFor(this.cfg.claudeProjects, s.cwd, s.sessionId));
    const prompt = (tx.exists && promptTask(tx.lastPrompt)) || promptTask(s.rt.lastPrompt); // P153 r13. P159: 관계 줄은 뗀다
    const answer = tx.exists && tx.lastAnswer && (tx.lastAnswerAt || 0) >= (s.rt.lastAnswerAt || 0) - 1000 ? tx.lastAnswer : s.rt.lastAnswer;
    return {
      sessionId: s.sessionId, name: s.name, state: sum.state, estimate: sum.estimate, ask: sum.ask, exit: sum.exit, error: sum.error, interruptedTurn: sum.interruptedTurn,
      lastPrompt: clip(prompt, 600), lastPromptAt: (tx.exists && tx.lastPromptAt) || s.rt.lastPromptAt, lastAnswer: clip(answer, 1200), lastAnswerAt: (tx.exists && tx.lastAnswerAt) || s.rt.lastAnswerAt,
      touchedAt: s.touchedAt || null, lastActivityAt: s.rt.lastActivityAt, turn: sum.turn, git: s.git || null,
    };
  }
  // A3: since 뒤의 판 이벤트를 한 줄씩. 판 전체의 "마지막으로 본 시각"은 창이 board.markSeen으로 남긴다.
  changesSince(p) {
    const since = Number(p.since || this.store.getMeta('boardSeenAt') || 0);
    const events = this.store.eventsAfter(since, CHANGE_KINDS);
    const nameOf = (sid) => { const s = this.sessions.get(sid); if (s) return s.name; const r = this.store.getSession(sid); return r ? r.name : null; };
    const current = new Map([...this.sessions.values()].map((s) => [s.sessionId, this.summary(s)]));
    return { since, until: Date.now(), events: events.length, lines: summarizeChanges(events, { nameOf, current }) };
  }

  // ---------- 세션끼리 연결(P4, ARCH 4절 F) ----------
  // 에이전트 이름이나 패널 ID로 판의 세션을 찾는다
  resolveAgentTarget(target) {
    if (!target) return null;
    const t = String(target).replace(/^@/, '');
    for (const s of this.sessions.values()) if (s.agentName === t || s.paneId === t || s.name === t) return s;
    return null;
  }
  // 판에 보일 연결: 지우지 않았고 두 세션이 모두 판에 있는 것
  linksOpen() {
    const idx = this.branch && this.branch.relIndex ? this.branch.relIndex({ withLinks: true }) : null; // P175: 선마다 관계(한 번만 센다)
    return this.store.links().filter((l) => this.sessions.has(l.from) && this.sessions.has(l.to)).map((l) => this.linkView(l, idx));
  }
  linkView(l, idx = null) {
    const a = this.sessions.get(l.from), b = this.sessions.get(l.to);
    // P175: 선의 지금 관계(하위·동료·독립, 출처, 위 세션). 선 이름표와 선 기록의 하위·동료 토글이 쓴다
    const ri = idx || (this.branch && this.branch.relIndex ? this.branch.relIndex({ withLinks: true }) : null);
    const rel = ri ? ri.ofEdge(l.from, l.to) : null;
    const relation = rel ? { relation: rel.relation, source: rel.source, up: rel.up } : null;
    // P159: 동료·독립으로 정한 쌍의 선에는 띄울 때 역할 이름(워커 등)을 보이지 않는다(저장은 그대로, storedRole)
    const ex = l.role && ri ? ri.explicitOf(l.from, l.to) : null;
    if (ex && ex.relation !== 'sub') l = { ...l, role: null, storedRole: l.role };
    return { ...l, relation, fromName: shownName(a), toName: shownName(b), toAgentName: b ? b.agentName : null, toPaneId: b ? b.paneId : null, ...this.linkPromptView(l) };
  }
  // P67: prompts(지시 수, 이름표의 +n), promptAt(마지막 지시 시각, 이름표가 물러나는 기준)
  linkPromptView(l) {
    const p = this.store.linkPromptStats ? this.store.linkPromptStats(l.linkId) : { n: 0, at: null };
    return { prompts: p.n, promptAt: p.at };
  }
  // 순서 있는 쌍마다 연결 하나. 지운 연결에 새 일이 오가면 다시 연다
  // P171: patch.transient면 일시 연결(관계 없는 쌍의 atrium prompt)로 연다. 그 밖의 부름(역할·띄움·관계·연결 유지)은 일시 선을 영구로 바꾼다(temp-links.mjs)
  ensureLink(from, to, patch = {}) {
    let l = this.store.linkByPair(from, to);
    const op = linkPatch(l, { ...patch, from, to });
    if (op.insert) { this.store.insertLink(op.insert); l = op.insert; }
    else if (Object.keys(op.update).length) this.store.updateLink(l.linkId, op.update);
    l = this.store.getLink(l.linkId);
    this.api.broadcast('link.updated', this.linkView(l));
    return l;
  }
  // 오간 기록 한 줄. 선 위의 "마지막 지시"는 지시(prompt)와 판의 알림(role)만 바꾼다
  linkEvent(l, kind, text = null, data = null, { quiet = false } = {}) {
    const e = this.store.addLinkEvent(l.linkId, kind, text == null ? null : clip(String(text), 4000), data);
    const f = { lastKind: kind, lastAt: e.t, count: (l.count || 0) + 1 };
    if (kind === 'prompt') f.lastText = clip(String(text || ''), 300);
    // P171: 일시 선은 그 글의 턴이 열리면 늘리고 끝나면 여운(2분)만 남긴다
    const until = l.transient && !l.removedAt ? tempUntilAfter(kind, data, e.t) : null;
    if (!quiet || kind === 'prompt') this.store.updateLink(l.linkId, until ? { ...f, tempUntil: until } : f); else this.store.updateLink(l.linkId, until ? { count: f.count, tempUntil: until } : { count: f.count });
    const nl = this.store.getLink(l.linkId);
    this.api.broadcast('link.event', { ...e, from: l.from, to: l.to });
    this.api.broadcast('link.updated', this.linkView(nl));
    return e;
  }

  // F3·G2: 판 전용 터미널 세션에 나타난, 판이 모르는 패널을 판에 올린다. 에이전트가 있으면 그 종류로, 없으면 일반 셸(shell)로.
  // 부모는 같은 작업 공간의 판 세션이다. 워크스페이스는 패널 폴더(터미널 cwd)로 정한다.
  async adoptPane(paneId, { cwd: hintCwd = null } = {}) {
    if (!paneId || this.adopting.has(paneId) || this.sessionByPane(paneId)) return null;
    this.adopting.add(paneId);
    try {
      await sleep(400); // 터미널이 에이전트를 알아볼 시간
      for (let i = 0; i < 25 && this.creatingPanes > 0 && !this.sessionByPane(paneId); i++) await sleep(200); // 판이 만드는 패널이면 그 세션이 등록될 때까지
      if (this.sessionByPane(paneId)) return null; // 판이 띄우는 중이던 세션
      const pane = await this.adapter.getPane(paneId).catch(() => null);
      if (!pane || !pane.paneId || this.sessionByPane(paneId)) return null; // 그새 닫힌 패널
      const a = (await this.adapter.listAgents()).find((x) => x.paneId === paneId) || null;
      if (this.sessionByPane(paneId)) return null;
      const hw = (a && a.workspaceId) || pane.workspaceId;
      const now = Date.now();
      const it = null;
      const sameWs = [...this.sessions.values()].find((x) => x.termWorkspaceId === hw && x.paneId !== paneId);
      const parent = (it && this.sessions.get(it.from)) || sameWs || null;
      const taken = takenNames(this.sessions.values(), [...(this.spawningNames || [])]); // 만드는 중인 이름도 피한다(이슈 #1-7). P66: 판의 이름도
      const base = a ? (a.name && NAME_RE.test(a.name) ? a.name : `${a.agent || 'agent'}-${paneId.replace(/[^A-Za-z0-9]/g, '')}`) : `sh-${paneId.replace(/[^A-Za-z0-9]/g, '')}`;
      let name = base;
      for (let i = 2; taken.has(name); i++) name = `${base.slice(0, 28)}-${i}`;
      const kind = a ? a.agent || 'unknown' : SHELL;
      const rt = newRuntime({ kind, hooked: false });
      if (a) {
        applyAgentDetected(rt, now);
        applyTermStatus(rt, a.status || 'unknown', now, { launchPending: a.launchPending, agentSessionId: a.agentSessionId });
        if (a.status && a.status !== 'unknown') rt.phase = 'running';
      } else rt.phase = 'running';
      const cwd = pane.cwd || (a && a.cwd) || hintCwd || (parent && parent.cwd) || '';
      // G1: 판에 올린 에이전트와 셸은 패널 폴더로 워크스페이스를 정한다. 폴더를 모르면 부모의 워크스페이스
      const ws = cwd ? await workspaceOf(cwd) : null;
      const wsKey = ws ? ws.key : parent ? parent.workspaceKey : this.currentWorkspace();
      if (this.sessionByPane(paneId)) return null;
      if (ws) this.ensureWorkspace(ws, `adopt ${name}`);
      const s = { sessionId: crypto.randomUUID(), name, cwd, paneId, termWorkspaceId: hw, agentName: (a && a.name) || paneId, model: null, effort: null, permissionMode: 'manual', settingsPath: '', hookToken: '', resumeArgv: null, resumeVerified: false, createdAt: now, closedAt: null, seenAt: null, touchedAt: null, rt, lastState: null, kind, origin: 'adopted', parentSessionId: null, adoptNamed: !!(a && a.name), workspaceKey: wsKey };
      this.store.insertSession({ ...s, runtime: rt });
      this.sessions.set(s.sessionId, s);
      // 새 노드는 그 워크스페이스 판의 빈자리. 부모가 같은 판에 있으면 부모 옆(F3). 사람이 보는 화면은 옮기지 않는다(G3)
      const anchor = parent && parent.workspaceKey === wsKey && this.store.nodes().find((n) => n.session_id === parent.sessionId);
      const area = this.worktrees ? this.worktrees.areaOf(wsKey, cwd) : ''; // P27
      const slot = slotFor(this, { wsKey, size: NODE, near: anchor && (anchor.area || '') === area ? anchor : null, area });
      this.store.setNode({ session_id: s.sessionId, x: slot.x, y: slot.y, w: NODE.w, h: NODE.h, z: 0, size: NODE.size, aspect: NODE.aspect, area });
      // P6a(H5): 부모와 같은 탭에 나뉜 패널이면 나눈 방향대로 붙인다(탭 배치가 있는 터미널만)
      if (parent) await autoDockSplit(this, s, parent);
      settleRegions(this, 'adopt');
      this.store.addEvent(s.sessionId, 'adopted', { paneId, agent: kind, agentName: (a && a.name) || null, cwd, workspace: wsKey, parent: parent ? parent.name : null, by: it ? `hook:${it.verb}` : sameWs ? 'same workspace' : 'none', intent: it ? it.raw : null });
      this.log(`adopted ${name} (${kind}) pane=${paneId} ws=${wsKey} parent=${parent ? parent.name : '-'}`);
      await this.adapter.refreshSubscription();
      this.api.broadcast('session.created', { sessionId: s.sessionId, name, adopted: true, workspaceKey: wsKey });
      if (parent) this.setParent(s, parent, it);
      this.broadcastSession(s, { cause: 'adopted' });
      this.probeGit(s, s.cwd);
      if (a) this.linkUnresolved(s, a.name);
      return s;
    } finally { this.adopting.delete(paneId); }
  }
  // 받는 쪽이 판에 오르기 전에(또는 셸 노드에 에이전트가 뜨기 전에) 보낸 지시(띄우자마자 시킴)를 이제 잇는다
  linkUnresolved(s, agentName) {
    const now = Date.now();
    const hit = (x) => (agentName && x.target === agentName) || x.target === s.paneId;
    for (const u of (this.unresolved || []).filter(hit)) {
      const f = this.sessions.get(u.from);
      if (f && f !== s) this.linkEvent(this.ensureLink(f.sessionId, s.sessionId, { observed: true }), 'prompt', u.text, { toolUseId: u.toolUseId, via: 'hook', late: true });
    }
    this.unresolved = (this.unresolved || []).filter((x) => !hit(x) && now - x.at < this.cfg.adoptSpawnMatchMs);
  }
  setParent(s, parent, intent) {
    if (s.parentSessionId && s.parentSessionId !== parent.sessionId) return;
    s.parentSessionId = parent.sessionId;
    this.store.updateSession(s.sessionId, { parentSessionId: parent.sessionId });
    const l = this.ensureLink(parent.sessionId, s.sessionId, { spawned: true });
    if (!this.store.linkEvents(l.linkId, 5).some((e) => e.kind === 'spawn')) this.linkEvent(l, 'spawn', intent ? intent.raw : `같은 작업 공간(${s.termWorkspaceId})에 나타남`, { by: intent ? `hook:${intent.verb}` : 'same workspace', paneId: s.paneId, kind: s.kind }, { quiet: true });
  }
  // 터미널이 에이전트 이름을 늦게 알렸으면 따라 바꾼다(자동으로 지은 이름일 때만)
  async refreshAdoptedName(s) {
    if (s.origin !== 'adopted' || s._naming) return;
    s._naming = true;
    try {
      const a = (await this.adapter.listAgents()).find((x) => x.paneId === s.paneId);
      if (!a || !a.name || !NAME_RE.test(a.name) || nameOwner(this.sessions.values(), a.name, s)) return;
      s.adoptNamed = true; s.agentName = a.name;
      if (s.name !== a.name) { this.store.addEvent(s.sessionId, 'renamed', { from: s.name, to: a.name }); s.name = a.name; this.store.renameSession(s.sessionId, a.name); }
      this.store.updateSession(s.sessionId, { agentName: a.name });
      this.broadcastSession(s, { cause: 'term:name' });
    } finally { s._naming = false; }
  }

  // F1: 받는 쪽의 상태 변화를 그 쪽으로 온 마지막 지시의 기록에 붙인다(B 작업 중, B 끝남, B 내 차례)
  onLinkTargetState(s, from, sum) {
    const op = s.openPromptFrom;
    if (!op || Date.now() - op.at > OPEN_PROMPT_MS) return;
    const l = this.store.getLink(op.linkId);
    if (!l || l.removedAt) return;
    const to = sum.state;
    if (to === 'working' && !op.working) { op.working = true; this.linkEvent(l, 'target_working', null, { from }, { quiet: true }); }
    else if (to === 'waiting' || to === 'trust_wait') this.linkEvent(l, 'target_waiting', sum.ask ? clip(sum.ask.summary || sum.ask.kind, 200) : null, null, { quiet: true });
    else if ((to === 'ready' || to === 'error') && op.working && from === 'working' && sum.work && sum.work.turnless && sum.work.endedAt === s.rt.term.at) op.working = false; // P173: 압축만 하고 끝났다. 턴 끝이 아니다
    else if ((to === 'ready' || to === 'error') && op.working) {
      // P116: hook이 없는 세션은 턴이 끝난 뒤 판이 화면에서 답을 고른다(readScreenAnswer). 그 답이 아직이면 오면 남긴다(5초까지)
      const turn = s.rt.turn || {};
      if (!this.hooked(s) && turn.endedAt && (s.rt.lastAnswerAt || 0) < turn.endedAt) {
        if (op.doneTimer) return;
        const done = () => { if (s.openPromptFrom !== op) return; clearTimeout(op.doneTimer); this.bus.off('screenAnswer', onAnswer); this.linkTargetDone(s, l, to); };
        const onAnswer = (x) => { if (x === s) done(); };
        this.bus.on('screenAnswer', onAnswer);
        op.doneTimer = setTimeout(() => { this.bus.off('screenAnswer', onAnswer); done(); }, 5000);
        if (op.doneTimer.unref) op.doneTimer.unref();
        return;
      }
      this.linkTargetDone(s, l, to);
    } else if (to === 'exited') { s.openPromptFrom = null; this.linkEvent(l, 'target_exited', null, { exit: sum.exit }, { quiet: true }); }
  }
  linkTargetDone(s, l, to) {
    s.openPromptFrom = null;
    this.linkEvent(l, 'target_done', s.rt.lastAnswer ? clip(s.rt.lastAnswer, 2000) : null, { state: to, answerSource: s.rt.answerSource || null }, { quiet: true });
  }
  // 받는 쪽이 판의 hook이 붙은 Claude Code면 지시가 제출된 것을 hook으로 확인한다
  onLinkTargetPrompt(s, prompt) {
    const op = s.openPromptFrom;
    if (!op || op.submitted || Date.now() - op.at > OPEN_PROMPT_MS) return;
    const l = this.store.getLink(op.linkId);
    if (!l) return;
    op.submitted = true;
    this.linkEvent(l, 'target_submitted', null, { matches: String(prompt || '').includes(String(op.text || '').slice(0, 40)) }, { quiet: true });
  }

  // F2: 판에서 A → B 연결을 잇고 역할을 정한다.
  // P263: A에게 연결 알림을 넣지 않는다(턴 하나를 "알겠다"로 썼다). 이름·역할·명령은 atrium me가 준다. 관계가 바뀌면 관계 알림(setRelation)은 그대로 간다
  linkCreate(p) {
    const a = this.resolve(p.from), b = this.resolve(p.to);
    if (a === b) throw apiError('bad_request', "세션을 자기 자신과 연결할 수 없습니다.");
    // P175: 잇는 자리에서 고른 관계(sub 하위, 기본 | peer 동료). 동료면 역할을 비워도 "동료"
    const choice = p.relation == null || p.relation === '' ? 'sub' : String(p.relation);
    if (!LINK_CHOICES.includes(choice)) throw apiError('bad_request', `관계는 ${LINK_CHOICES.join(', ')} 가운데 하나입니다: ${choice}`);
    const role = String(p.role || '').trim() || linkDefaultRole(choice) || '';
    if (!ROLE_RE.test(role)) throw apiError('bad_request', "역할은 1~40자로 입력하세요. 줄바꿈, 따옴표, $, \\는 사용할 수 없습니다.");
    // 관계를 먼저 정한다(하위의 고리 검사가 실패하면 선도 만들지 않는다)
    // P185: 하위도 사람이 정한 하위 줄로 저장한다(역할 선만 있는 자동 하위는 일 부모가 아니라 atrium prompt가 일을 만들지 않았다).
    //   보이는 관계가 바뀌지 않으면(없음·이미 a 아래 하위) 관계 알림은 보내지 않는다(역할 알림이 간다)
    const cur = this.branch && this.branch.relationBetween ? this.branch.relationBetween(a.sessionId, b.sessionId) : null;
    const plan = this.branch && this.branch.relationBetween ? linkRelationPlan(choice, cur, a.sessionId) : null;
    const same = plan === 'sub' && (!cur || (cur.relation === 'sub' && cur.up === a.sessionId));
    const rel = plan ? this.branch.setRelation(a, b, plan, { source: 'user', by: 'user', ...(same ? { quiet: true } : {}) }) : null;
    const l = this.ensureLink(a.sessionId, b.sessionId, { role });
    this.linkEvent(l, 'role', role, { deliveryId: null, notice: null });
    this.store.addEvent(a.sessionId, 'link_created', { to: b.name, role, relation: choice });
    return { link: this.linkView(this.store.getLink(l.linkId)), deliveryId: null, notice: null, relation: choice, relationSet: rel ? rel.relation : null };
  }
  // 연결 끊기. 선은 판에서 빠지고 기록은 남는다. P263: A에게 연결 해제 알림을 넣지 않는다(atrium me의 역할 연결에서 빠진다).
  //   끊기는 관계 줄(relations)을 지우지 않아 일 부모가 바뀌지 않는다. 하위에서 빼는 것은 "독립으로도 두기"(detach)이고 그 알림은 간다
  linkDelete(p) {
    const l = this.store.getLink(p.link);
    if (!l) throw apiError('not_found', `연결을 찾을 수 없습니다: ${p.link}`);
    const a = this.sessions.get(l.from), b = this.sessions.get(l.to);
    // P81: 부모 → 하위 세션의 선이면 확인에서 "선만 끊기"와 "부모에서도 떼기"를 고른다. 떼기는 선 끊기를 겸한다(알림은 떼기의 것만)
    // P159: 부모는 일 부모이고 "떼기"는 독립으로 두기다(계보는 남는다)
    const parentLink = !!(a && b && this.workParentOf(b.sessionId) === a.sessionId);
    const pl = parentLink ? { parentLink: { parent: a.name, child: b.name }, parentMsg: m('linkCutParent', { from: a.name, to: b.name }), parentMessage: `@${a.name} → @${b.name}는 위 세션과 하위 세션의 선입니다. 선만 끊으면 @${b.name}는 여전히 @${a.name}의 하위 세션입니다. 독립으로도 두면 @${b.name}는 @${a.name}의 하위가 아닌 독립 세션이 됩니다(띄운 기록은 남습니다).` } : {};
    if (!p.confirm) return l.role && a ? confirmResult(`@${a.name} → @${b ? b.name : '?'} 연결("${l.role}")을 끊는다. 주고받은 기록은 유지합니다.`, m('linkCut', { from: a.name, to: b ? b.name : '?', role: l.role }), pl) : confirmResult("보드에서 이 연결선을 제거합니다. 주고받은 기록은 유지합니다.", m('linkRemove'), pl);
    if (p.detach) {
      if (!parentLink) throw apiError('bad_request', "위 세션과 하위 세션의 선이 아닙니다. 선만 끊을 수 있습니다.");
      const r = this.branch.detach(b, { by: 'user' });
      // P159: 독립으로 두면서 선도 끊는다(관계 줄은 남아 세션 맵에는 독립으로 보인다)
      const nl = this.store.getLink(l.linkId);
      if (nl && !nl.removedAt) { this.linkEvent(nl, 'unlink', null, { why: 'detach', by: 'user' }, { quiet: true }); this.store.updateLink(l.linkId, { role: null, removedAt: Date.now() }); this.api.broadcast('link.removed', { linkId: l.linkId, reason: 'detach' }); }
      return { removed: true, deliveryId: null, ...r };
    }
    this.linkEvent(l, 'unlink', l.role || null, { deliveryId: null }, { quiet: true });
    this.store.updateLink(l.linkId, { role: null, removedAt: Date.now() });
    this.api.broadcast('link.removed', { linkId: l.linkId, reason: 'user' });
    return { removed: true, deliveryId: null, cut: !!l.role };
  }
  // P81: 판에서 부모에서 떼기(노드 메뉴) → P159: 독립으로 두기(relation none, 계보는 남는다). 확인 글은 무엇이 바뀌는지
  detachSession(p) {
    const s = this.resolve(p.session);
    const pid = this.workParentOf(s.sessionId);
    if (!pid) throw keyed(apiError('no_parent', `@${s.name}에게는 부모(위 세션)가 없습니다.`), 'detachNoParent', { name: s.name });
    const parent = this.sessions.get(pid);
    const pname = parent ? shownName(parent) : (this.branch.rowOf(pid) || {}).name || '?';
    if (!p.confirm) return confirmResult(`@${s.name}을 @${pname}의 하위에서 빼고 독립으로 둡니다. @${pname}가 끄거나(child-kill) 함께 잠들고 깨게 하는 묶음이 풀리고, 끝난 턴은 작업 완료로 셉니다. 띄운 기록은 남습니다. 되돌리려면 세션 맵에서 다시 하위로 둡니다.`, m('detach', { name: s.name, parent: pname }));
    return this.branch.detach(s, { by: 'user' });
  }

  // ---------- F4: 세션 폴더의 git(워크트리) ----------
  probeGit(s, cwd) {
    if (!cwd) return;
    const seq = (s._gitSeq = (s._gitSeq || 0) + 1);
    gitProbe(cwd).then((g) => {
      if (seq !== s._gitSeq || !this.sessions.has(s.sessionId)) return;
      const key = (x) => (x ? [x.isRepo, x.root, x.branch, x.isWorktree, x.commonDir].join('|') : '');
      const changed = key(g) !== key(s.git);
      const filesChanged = !s.git || s.git.changedFiles !== g.changedFiles;
      s.git = g;
      if (changed) this.store.addEvent(s.sessionId, 'git', { cwd: g.cwd, root: g.root || null, branch: g.branch || null, isWorktree: !!g.isWorktree, commonDir: g.commonDir || null });
      if (changed || filesChanged) this.broadcastSession(s, { cause: changed ? 'git' : undefined });
      if (changed && this.worktrees) this.worktrees.kick('git'); // P27: 워크트리로 들어갔거나 새 워크트리가 생겼을 수 있다
    }).catch(() => {});
  }
  // hook이 없는 세션은 터미널이 아는 패널 폴더(foreground_cwd)를, 모든 세션은 브랜치가 바뀌었는지를 주기적으로 본다
  async pollCwd() {
    // P363: 패널 없는 SDK 세션도 지금 폴더(hook·init이 알린 rt.cwd, 워크트리일 수 있다)의 git을 주기적으로 본다(터미널과 상관없다)
    for (const s of [...this.sessions.values()]) if (isSdk(s) && !s.closedAt && !s.rt.exit) this.probeGit(s, s.rt.cwd || s.cwd);
    if (!this.adapter.connected) return;
    for (const s of [...this.sessions.values()]) {
      if (!s.paneId || s.rt.exit) continue;
      let cwd = s.rt.cwd || s.cwd;
      if (!this.hooked(s) && s.kind !== 'hermes') { // P298: hermes 패널의 터미널 폴더는 실행기(hermes.exe)의 Temp라 세션 폴더를 그대로 쓴다
        const p = await this.adapter.getPane(s.paneId).catch(() => null);
        if (p && p.cwd && p.cwd !== s.rt.cwd) { s.rt.cwd = p.cwd; cwd = p.cwd; }
      }
      this.probeGit(s, cwd);
    }
  }

  async get(p) {
    const s = this.resolve(p.session);
    const out = { ...this.summary(s), ask: s.rt.pendingAsk ? this.askView(s, { ...s.rt.pendingAsk }) : null, lastPrompt: promptTask(s.rt.lastPrompt), lastAnswer: s.rt.lastAnswer, lastAskResolved: s.rt.lastAskResolved, settingsPath: s.settingsPath, resumeArgv: s.resumeArgv, transcriptPath: s.rt.transcriptPath || transcriptPathFor(this.cfg.claudeProjects, s.cwd, s.sessionId), git: s.git || null };
    if (p.screen !== false && s.rt.term.present !== undefined) { try { out.screenTail = tailLines(await this.adapter.readScreen(s.paneId, { source: 'visible' }), p.lines || 12); } catch { out.screenTail = null; } }
    if (!out.git) out.git = s.git = await gitProbe(s.rt.cwd || s.cwd);
    out.deliveries = this.store.deliveries({ sessionId: s.sessionId, limit: 10 }).map((d) => ({ ...d, text: clip(d.text, 80) }));
    out.lastActivityAt = s.rt.lastActivityAt;
    return out;
  }

  handlers() {
    return {
      'backend.status': async () => { const terminal = await this.terminalStatus(); return { pid: process.pid, port: this.cfg.port, profile: this.cfg.profile, dataDir: this.cfg.dataDir, startedAt: this.startedAt, previousRun: this.previousRun, terminal, herdr: terminal /* P129·P132: 옛 이름. 0.1.7까지의 바꾸기(update-swap.mjs)가 새 백엔드의 건강을 st.herdr.connected로 본다(옛 판에서 올라오는 길) */, sessions: this.sessions.size, relay: this.relay.stats(), plugin: this.plugin, migration: this.migrationView(), web: this.web ? this.web.status() : null, version: this.updater ? this.updater.running : null }; },
      'backend.shutdown': async () => { setTimeout(() => this.stop('api').then(() => process.exit(0)), 50); return { stopping: true }; },
      'terminal.status': () => this.terminalStatus(),
      'terminal.stop': (p) => this.terminalControl('stop', p.confirm),
      'terminal.start': () => this.terminalControl('start', true),
      'terminal.restart': (p) => this.terminalControl('restart', p.confirm),
      'session.spawn': (p) => this.spawn(p),
      'session.list': () => [...this.sessions.values()].map((s) => this.summary(s)),
      'session.get': (p) => this.get(p),
      'session.send': (p) => this.send(p),
      ...phoneHandlers(this), // P353: phone.subscribe·phone.session·phone.history·phone.close·phone.spawnInfo
      ...docHandlers(this), // P257: docs.status·docs.enable·docs.disable
      ...botsHandlers(this), // P338: 설정 › 봇 탭(읽기 전용 요약, 저장소별 merge.json)
      ...mergerHandlers(this), // P267: 합치기 merger(창 쪽 계약: merger.status, merger.asks, merger.answer)
      'records.read': (p) => this.branch.units.readRecords(p || {}), // P334: 일 기록 보기(카드의 기록 단추)
      'session.rename': (p) => renameSession(this, p), // P66: 판의 이름 바꾸기(name, clear, by: human|cli)
      'delivery.cancel': (p) => this.queue.cancelWait(p.deliveryId), // P106: 막혀 다시 보내는 중(sending)인 전달도 취소한다
      // P158: 판 칩의 수정. hold = 붙잡고 전체 글을 돌려준다, update = 고친 글로 바꾸고 놓는다(차례 그대로), release = 고치지 않고 놓는다
      'delivery.hold': (p) => this.queue.holdWait(p.deliveryId),
      'delivery.update': (p) => this.queue.update(p.deliveryId, p.text),
      'delivery.release': (p) => this.queue.release(p.deliveryId),
      // P172: 바로 보내기(스티어링, --now와 같은 길)와 같은 세션 대기 글의 순서 바꾸기(ids = 바랄 차례)
      'delivery.now': (p) => this.queue.sendNow(p.deliveryId),
      'delivery.reorder': (p) => this.queue.reorder(p.ids),
      // P106: active면 아직 끝나지 않은 전달 모두(창이 다시 열려도 막힌 전달을 보이고 취소할 수 있게)
      'delivery.list': (p) => p.active ? this.queue.list(p.session ? this.resolve(p.session).sessionId : undefined).map((d) => ({ ...(this.store.getDelivery(d.deliveryId) || {}), status: d.status, reason: d.reason, attempts: d.attempts || 0, seq: d.seq ?? d.createdAt, editing: !!d.editing, steerWhy: d.steerWhy || null, name: this.nameOf(d.sessionId) })) : this.store.deliveries({ sessionId: p.session ? this.resolve(p.session).sessionId : undefined, limit: p.limit || 20 }).map((d) => ({ ...d, name: this.nameOf(d.sessionId) })),
      'session.kill': (p) => this.kill(p),
      'session.sdkStop': (p) => this.stopSdkTurn(p), // P363: SDK 세션 멈추기(프로세스 끊기)
      'session.answer': (p) => this.answer(p),
      'session.keys': (p, c) => this.sendKeysTo(p, c), // P104: 휴대폰 키 줄(원격 기기도 부른다)
      'session.markSeen': (p) => { const s = this.resolve(p.session); s.seenAt = Date.now(); this.store.updateSession(s.sessionId, { seenAt: s.seenAt }); this.touch(s); this.broadcastSession(s); return { seenAt: s.seenAt }; },
      'inbox.list': () => this.inbox(),
      'session.messages': (p) => { const s = this.resolve(p.session); return readMessages(s.rt.transcriptPath || transcriptPathFor(this.cfg.claudeProjects, s.cwd, s.sessionId), { afterSeq: p.afterSeq ?? -1, limit: p.limit || 200 }); },
      'session.events': (p) => this.store.events({ sessionId: p.session ? this.resolve(p.session).sessionId : undefined, since: p.since || 0, limit: p.limit || 200 }),
      'terminal.snapshot': async (p) => { const s = this.resolve(p.session); return { sessionId: s.sessionId, format: p.format || 'ansi', text: await this.adapter.readScreen(s.paneId, { source: 'visible', format: p.format || 'ansi' }) }; },
      // P42: 셸 노드의 지난 출력(터미널 기록, 화면 너비로 감긴 줄, ANSI). 창이 xterm scrollback에 넣어 판 안에서 올려 보고 고른다
      'terminal.history': async (p) => { const s = this.resolve(p.session); if (!s.paneId) return { sessionId: s.sessionId, text: '' }; return { sessionId: s.sessionId, text: await this.adapter.readScreen(s.paneId, { source: 'recent', format: 'ansi', lines: Math.min(Math.max(Number(p.lines) || 3000, 1), 10000) }) }; },
      'terminal.attach': (p, c) => { this.requireTerminal(); const s = this.resolve(p.session); if (!s.paneId) throw keyed(apiError('sleeping', `@${s.name} 세션은 절전 중이라 터미널이 닫혀 있습니다. 먼저 작업을 재개하세요.`), 'sleepingNoPane', { name: s.name }); return this.relay.attach(s, p.cols || 120, p.rows || 40, c); },
      'terminal.input': (p, c) => { const s = this.resolve(p.session); const data = String(p.data ?? ''); this.relay.input(s.sessionId, data, c); if (this.decisions && data.includes('\r') && s.kind !== SHELL && !this.hooked(s) && deriveState(s.rt).state === 'ready') try { this.decisions.onHuman(s.sessionId, 'terminal'); } catch {} return { ok: true }; }, // P284: hook 없는 종류는 쉬는 중 터미널 Enter를 사람이 직접 보낸 글로 본다(Claude Code는 UserPromptSubmit으로)
      'terminal.resize': (p, c) => { this.relay.resize(this.resolve(p.session).sessionId, p.cols, p.rows, c); return { ok: true }; },
      'terminal.detach': (p, c) => { this.relay.detach(this.resolve(p.session).sessionId, c); return { ok: true }; },
      'terminal.focus': (p, c) => { this.relay.focus(this.resolve(p.session).sessionId, c); this.peers.touch(c); return { ok: true }; }, // P47: 초점을 준 클라이언트가 패널 크기를 정한다
      'events.subscribe': (p, c) => { c.subscribed = true; c.phone = false; return { subscribed: true, sessions: [...this.sessions.values()].map((s) => this.summary(s)), clients: { ...this.peers.view(), me: c.clientId || null } }; }, // P47: 붙은 클라이언트
      // P5: workspace를 주면 그 판의 노드와 그룹만(연결은 한쪽이라도 그 판에 있는 것). 창은 다른 워크스페이스로 가는 연결과 칩 때문에 모두 받는다
      // P6a: 캔버스 하나. viewport는 캔버스 하나의 것(meta). workspace를 주면 그 워크스페이스의 노드·덩어리만(연결은 한쪽이라도 그 안에 있는 것)
      // P47: viewport는 클라이언트마다(meta viewport:<client>). 처음 붙는 클라이언트와 익명 연결은 보드 값(meta viewport, 옛 판 값)
      'board.get': async (p, c) => {
        const w = p.workspace ? await this.resolveWorkspace(p.workspace) : null;
        const inWs = (k) => !w || (k || null) === w.key;
        const hand = handSizes(this); // P310: 사람이 정한 크기 표(창의 노드 메뉴가 "기본 크기로"를 보인다)
        const nodes = this.store.nodes().filter((n) => inWs(n.workspace_key)).map((n) => (hand[n.session_id] ? { ...n, hand: hand[n.session_id] } : n));
        const ids = new Set(nodes.map((n) => n.session_id));
        return { nodes, docks: this.store.docks().filter((d) => inWs(d.workspaceKey)), viewport: viewportFor(c && c.clientId ? this.store.getMeta(viewportKey(c.clientId)) : null, this.store.getMeta('viewport')), seenAt: this.store.getMeta('boardSeenAt'), links: this.linksOpen().filter((l) => !w || ids.has(l.from) || ids.has(l.to)), workspaces: this.workspaceList(), current: this.currentWorkspace(), groups: readGroups(this).groups, canvas: this.store.getMeta('canvas'),
          // P6c: 메모·칸반 노드(P6b I3·I4)도 같은 판에 그린다
          ...(this.features ? { memos: this.store.memos().filter((m) => inWs(m.workspaceKey)), kanbans: this.store.kanbans().filter((k) => inWs(k.workspaceKey)).map((k) => this.features.kanbans.view(k)) } : {}),
          // P13: 판 밖 대화 노드와 띄움 선(recall.layoutCanvas가 만든 것)
          ...(this.recall ? { convoNodes: this.recall.canvas.nodes.filter((n) => inWs(n.workspaceKey)), convoEdges: this.recall.canvas.edges } : {}) };
      },
      // cause: 창이 왜 옮겼는지(drag, resize, divider…). 자리가 바뀌면 판 이벤트 node_moved로 남긴다(P5 5절 2번 조사)
      'board.setNode': (p, c) => {
        const s = this.resolve(p.session);
        const before = this.store.nodes().find((n) => n.session_id === s.sessionId);
        const n = { session_id: s.sessionId, x: p.x, y: p.y, w: p.w, h: p.h, z: p.z };
        this.store.setNode(n);
        // P73: 사람이 테두리를 끌어 크기를 바꾸면 고른 비율과 크기 단계를 끈다(자유 비율)
        if (before && (Math.round(before.w) !== Math.round(n.w) || Math.round(before.h) !== Math.round(n.h)) && (before.aspect || before.size)) this.store.setNodeAspect(s.sessionId, null, null);
        if (p.cause === 'resize' && before && (Math.round(before.w) !== Math.round(n.w) || Math.round(before.h) !== Math.round(n.h))) markHandSize(this, s.sessionId, true, n); // P177: 사람이 끌어 정한 크기. P310: 값도
        noteNodeMove(this, s, before, n, p.cause);
        // P350: 사람이 끌어 옮긴 노드는 핀(다음 정리까지 줄 밀기가 옮기지 않고 새 자리가 피한다)
        if (before && /^drag/.test(String(p.cause || '')) && (Math.abs(before.x - n.x) > 0.5 || Math.abs(before.y - n.y) > 0.5)) markPinned(this, [s.sessionId], true);
        // P47: 다른 창도 옮긴 자리를 바로 그린다(예전에는 다음 board.changed까지 옛 자리). 보낸 창은 by로 알아보고 무시한다
        this.api.broadcast('board.node', { sessionId: s.sessionId, x: p.x, y: p.y, w: p.w, h: p.h, z: p.z, by: (c && c.clientId) || null });
        // P75: 테두리를 끌어 키웠으면 줄의 뒤 형제를 아래로 민다(작아지면 당기지 않는다)
        if (before && (n.w > before.w + 0.5 || n.h > before.h + 0.5) && (reflowLines(this, s.sessionId, 'resize').length + settleRegions(this, 'resize').length)) this.api.broadcast('board.changed', { why: 'line pushed' });
        return { ok: true };
      },
      // P6a: workspace 없이 부르면 캔버스 하나의 뷰포트. P5처럼 workspace를 주면 그 워크스페이스 줄에 남긴다
      // P47: 클라이언트가 알려 온 연결이면 그 클라이언트의 값에 남긴다. 보드 값은 다음에 처음 붙는 클라이언트가 시작할 자리로 함께 고친다
      'board.setViewport': async (p, c) => {
        if (!p.workspace) { const vp = { x: p.x, y: p.y, zoom: p.zoom }; if (c && c.clientId) { this.store.setMeta(viewportKey(c.clientId), vp); this.peers.touch(c); } this.store.setMeta('viewport', vp); return { ok: true, workspace: null, client: (c && c.clientId) || null }; }
        const w = await this.resolveWorkspace(p.workspace, { required: false });
        if (w) this.store.setWorkspaceViewport(w.key, { x: p.x, y: p.y, zoom: p.zoom });
        return { ok: true, workspace: w ? w.key : null };
      },
      // 리포지토리 워크스페이스(P5, G1·G3)
      'workspace.list': () => (syncWsGroups(this, 'list') && this.broadcastWorkspaces(), { workspaces: this.workspaceList(), current: this.currentWorkspace(), groups: readGroups(this).groups }),
      'workspace.open': (p) => this.workspaceOpen(p),
      // P195: 열 폴더의 git 상태(창의 "Git 저장소로 시작" 확인란). 'missing' | 'norepo' | 'nocommit' | 'ok'
      'workspace.gitState': async (p) => { const dir = path.resolve(String((p && p.path) || '')); if (!p || !p.path || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { state: 'missing' }; return { state: await gitStateAt(dir) }; },
      'workspace.close': (p) => this.workspaceClose(p),
      'workspace.select': (p) => this.workspaceSelect(p),
      // A3: 판을 마지막으로 본 시각. 창이 초점을 가진 동안 남긴다
      'board.markSeen': (p) => { const t = Number(p.at) || Date.now(); this.store.setMeta('boardSeenAt', t); return { seenAt: t }; },
      'changes.since': (p) => this.changesSince(p),
      'trust.predict': (p) => predictTrust(path.resolve(p.cwd), this.cfg.claudeJson),
      // 브리핑(E2)
      'session.briefing': (p) => this.briefing(p),
      'session.touch': (p) => { const s = this.resolve(p.session); this.touch(s); this.broadcastSession(s); return { touchedAt: s.touchedAt }; },
      'session.clearInterrupted': (p) => { const s = this.resolve(p.session); s.rt.interruptedTurn = null; s.recovered = null; this.broadcastSession(s); return { ok: true }; },
      // 세션끼리 연결(P4, F1~F3)과 에이전트 종류(F5)
      'link.list': () => this.linksOpen(),
      'link.create': (p) => this.linkCreate(p),
      'link.delete': (p) => this.linkDelete(p),
      'link.keep': (p) => this.tempLinks.keep(p), // P171: 일시 선을 영구로(선 메뉴 "연결 유지")
      'session.detach': (p) => this.detachSession(p), // P81
      'relation.set': (p) => this.branch.relationSetUser(p), // P156: 일 관계(사람, 출처 user). { a, b, relation: sub|peer|none|auto }
      'relation.list': () => this.branch.relationList(), // P156
      'session.reopen': (p) => reopenSession(this, p), // P125: 사람이 닫은(끝난) 세션은 같은 자리에서, 닫힌 세션(J2)은 recall.reopen으로
      'link.log': (p) => { const l = this.store.getLink(p.link); if (!l) throw apiError('not_found', `연결을 찾을 수 없습니다: ${p.link}`); return { link: this.linkView(l), events: this.store.linkEvents(l.linkId, p.limit || 200) }; },
      'agent.kinds': (p = {}) => this.adapter.agentKinds({ fresh: !!(p && p.fresh) }), // P205: 창이 틀을 열 때 fresh(다시 찾기)
      // 자원(D1)
      'resources.get': async (p) => (p.fresh ? this.resources.sample() : this.resources.last),
      // P6a: 단일 캔버스(검색, 붙여 묶기, 풀기, 정리, 크기 단계, 영역 옮기기)
      ...canvasHandlers(this),
      ...groupHandlers(this), // P44: 워크스페이스 가상 그룹
      ...peerHandlers(this), // P47: client.hello, client.active, clients.list
    };
  }
}
