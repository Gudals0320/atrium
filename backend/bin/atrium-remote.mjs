// P49(원격 R3): atrium remote status|guide|enable|disable. 노트북에서 Tailscale로 이 PC의 판을 브라우저로 쓴다.
// - status: 진단(Tailscale 설치·실행·로그인, MagicDNS, HTTPS 인증서, serve가 판 포트로 가는지, funnel, Host 허용 목록, 짝 맺은 기기, 노트북에서 열 주소).
//   백엔드가 떠 있으면 백엔드의 remote.status를, 아니면 이 자리에서 tailscale을 읽는다(읽기 명령만).
// - guide: 따라 할 단계.
// - block / allow(P58): 원격 받기 끄기·켜기(판 설정 remoteAccess). 끄면 짝 맺은 기기와 Tailscale로 온 요청을 모두 거부하고 붙은 원격 연결을 닫는다. serve는 그대로다.
// - enable / disable: `tailscale serve --bg --https=<포트> http://127.0.0.1:<판 포트>`와 그 끄기. --yes가 있을 때만 실행하고, 없으면 할 명령만 보인다.
//   funnel(인터넷 공개)은 쓰지 않는다. 그 https 포트를 다른 서비스가 쓰고 있으면 덮어쓰지 않고 멈춘다(--https-port로 다른 포트).
import { execFile } from 'node:child_process';
import { readTailscale, diagnose, tailscaleBin, tailscaleHosts, serveCommand, serveOffCommand, portConflict, freeHttpsPort, DEFAULT_HTTPS_PORT } from '../src/tailscale.mjs';
import { allowedHosts } from '../src/web.mjs';

const MARK = { ok: '[ok]  ', warn: '[주의]', fail: '[안 됨]', skip: '[-]   ' };

// 진단 한 줄의 글(한국어, CLI용). 창은 locales의 remote.check.* 열쇠를 쓴다
export function checkText(c, port) {
  const v = c.vars || {};
  const T = {
    installed: { ok: `Tailscale 설치됨${v.version ? ` (${v.version})` : ''}`, fail: 'Tailscale이 없습니다. https://tailscale.com/download 에서 설치합니다', skip: 'Tailscale 읽기를 껐습니다(ATRIUM_TAILSCALE=none)' },
    running: { ok: 'Tailscale이 돌고 있습니다', fail: `Tailscale이 돌고 있지 않습니다${v.state ? ` (${v.state})` : ''}. 트레이의 Tailscale에서 Connect를 누릅니다` },
    login: { ok: `로그인: ${v.login}`, fail: 'Tailscale에 로그인하지 않았습니다' },
    magicdns: { ok: `MagicDNS 켜짐: ${v.name}`, fail: 'MagicDNS가 꺼져 있습니다. tailnet 관리 화면 DNS에서 켭니다' },
    https: { ok: 'HTTPS 인증서 켜짐', fail: 'HTTPS 인증서가 꺼져 있습니다. tailnet 관리 화면 DNS의 HTTPS Certificates에서 켭니다' },
    serve: { ok: `tailscale serve가 https ${v.httpsPort} → 판 포트 ${port}로 갑니다`, fail: `tailscale serve가 판으로 가지 않습니다. atrium remote enable --yes`, warn: `https ${v.httpsPort}는 다른 서비스가 쓰고 있습니다. 덮어쓰지 않으려면 atrium remote enable --yes --https-port ${v.free || '<다른 포트>'}` },
    funnel: { ok: 'funnel(인터넷 공개) 꺼짐', warn: `funnel이 켜진 포트가 있습니다(${v.ports}). 판에는 쓰지 않습니다`, fail: `판 주소에 funnel이 켜져 있습니다(${v.ports}). 인터넷에 공개됩니다. tailscale funnel ... off로 끕니다` },
    hosts: { ok: `Host 허용 목록에 ${v.name}가 있습니다`, fail: `Host 허용 목록에 Tailscale 이름이 없습니다${v.name ? ` (${v.name}). 백엔드를 다시 켜거나 잠시 뒤 다시 봅니다` : ''}` },
    built: { ok: '웹 화면 빌드 있음', fail: '웹 화면 빌드가 없습니다. cd app && npm run build' },
    devices: { ok: `짝 맺은 기기 ${v.n}대`, warn: '짝 맺은 기기가 없습니다. 노트북에서 주소를 열고 코드로 짝을 맺습니다' },
    nodes: { ok: '짝 맺은 기기는 Tailscale 기기에 묶임(다른 Tailscale 기기에서는 그 자격을 쓸 수 없습니다)', warn: `짝 맺은 기기는 Tailscale 기기에 묶임. 묶이지 않은 옛 기기 ${v.n}대는 바깥에서 막힙니다(다시 짝 맺기 필요)`, skip: '짝 맺은 기기는 Tailscale 기기에 묶임(옛 기기 수: 백엔드 없이 읽어 모름)' },
    // P62: 패스키로 확인(판 설정 remotePasskey, 바꾸는 것은 PC 창의 설정 › 연결된 기기)
    passkey_on: { ok: '패스키로 확인 켜짐: 짝 맺은 뒤 패스키를 만들고, 세션이 끝나면 휴대폰이나 이 기기의 패스키로 다시 확인합니다' },
    passkey_off: { ok: '패스키로 확인 꺼짐: 짝 맺은 Tailscale 기기에서 바로 열립니다(짝을 풀 때까지)' },
    passkey: { skip: '패스키로 확인: 백엔드 없이 읽어 모름' },
    users: { ok:`같은 Tailscale 사용자만 받습니다${v.n ? ` (+허용 ${v.n}명)` : ''}`, warn: '로그인 사용자 제한이 꺼져 있습니다. tailnet의 누구든 짝 맺기를 시도할 수 있습니다' },
  };
  return `${MARK[c.level] || ''} ${(T[c.id] && T[c.id][c.level]) || `${c.id} ${c.level}`}`;
}

export function formatStatus(d) {
  const lines = d.checks.map((c) => checkText(c, d.port));
  // P58: 원격 받기 스위치(판 설정 remoteAccess)와 지금 붙은 기기 수. 백엔드 없이 읽으면 모른다
  if (d.accepting === false) lines.unshift('[막음] PC에서 원격을 막았습니다. 짝 맺은 기기와 Tailscale로 온 요청을 모두 거부합니다. 켜기: atrium remote allow');
  else if (d.accepting === true) lines.unshift(`[ok]   원격 받기 켜짐${Number.isInteger(d.connected) ? ` (지금 붙은 기기 ${d.connected}대)` : ''}. 막기: atrium remote block`);
  lines.push('');
  if (d.url) lines.push(`노트북에서 열 주소: ${d.url}${d.ready ? '' : ' (위의 [안 됨]을 먼저 고칩니다)'}`);
  if (d.enable) lines.push(`켜기: ${d.enable}`);
  return lines.join('\n');
}

// P58: 연결 기록 한 줄(CLI). 창은 locales의 remoteLog.* 열쇠를 쓴다
const LOG_TEXT = { 'pair.request': '짝 맺기 요청', 'pair.grant': '짝 맺기 허가', 'pair.ok': '짝 맺음', login: '패스키 로그인', logout: '로그아웃', 'passkey.on': '패스키로 확인 켬', 'passkey.off': '패스키로 확인 끔', 'passkey.add': '패스키 등록', 'pair.fail': '짝 맺기 실패', connect: '연결', disconnect: '끊김', deny: '거부', unpair: '짝 풀기', kick: 'PC에서 끊기', 'remote.block': '원격 받기 끔', 'remote.allow': '원격 받기 켬', other: '기타' };
export function formatLogEntry(e) {
  const p2 = (n) => String(n).padStart(2, '0');
  const d = new Date(e.at);
  const when = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  const parts = [when, (LOG_TEXT[e.event] || e.event).padEnd(8)];
  if (e.reason) parts.push(`까닭=${e.reason}`);
  if (e.via) parts.push(`방법=${e.via === 'code' ? '코드' : '허락'}`);
  if (e.passkey === false) parts.push('패스키 없이'); // P62
  if (e.deviceName || e.deviceId) parts.push(`기기=${e.deviceName || ''}${e.deviceId ? ` (${e.deviceId.slice(0, 8)})` : ''}`);
  if (e.node) parts.push(`Tailscale 기기=${e.node}`); // P59
  if (e.remote != null) parts.push(e.remote ? '바깥' : '이 PC');
  if (e.login) parts.push(`로그인=${e.login}`);
  if (e.addr) parts.push(`주소=${e.addr}`);
  if (e.browser) parts.push(e.browser);
  if (Number.isInteger(e.n)) parts.push(`닫은 연결 ${e.n}개`);
  if (e.count > 1) parts.push(`×${e.count}`);
  return parts.join('  ');
}

export function guideText(port, httpsPort = DEFAULT_HTTPS_PORT) {
  return [
    '원격 접속(Tailscale) 따라 하기',
    '1. PC와 노트북에 Tailscale을 설치하고 같은 계정으로 로그인합니다(https://tailscale.com/download).',
    '2. tailnet 관리 화면(https://login.tailscale.com/admin/dns)에서 MagicDNS와 HTTPS Certificates를 켭니다.',
    '   기기 이름과 tailnet 이름은 인증서 공개 기록(Certificate Transparency)에 남습니다.',
    `3. PC에서: atrium remote enable --yes${httpsPort !== 443 ? ` --https-port ${httpsPort}` : ''}`,
    `   (= tailscale ${serveCommand(port, httpsPort).join(' ')}. tailnet 안에서만 열리고 인터넷에는 열리지 않습니다)`,
    '4. PC에서: atrium remote status 로 [안 됨]이 없는지와 노트북에서 열 주소를 봅니다.',
    '5. 노트북 브라우저에서 그 주소(https://<PC 이름>.<tailnet>.ts.net/)를 엽니다.',
    '6. PC 창의 설정 › 연결된 기기에서 "새 코드"를 누르고, 노트북에 6자리 코드를 넣습니다(또는 노트북에서 허락을 청하고 PC에서 허락).',
    '7. 브라우저 메뉴의 "앱 설치"로 앱처럼 띄울 수 있습니다.',
    '',
    '주의',
    '- 짝 맺은 기기는 이 PC 사용자와 같은 권한입니다(셸을 띄워 무엇이든 실행할 수 있습니다).',
    '- funnel(tailscale funnel)은 쓰지 않습니다. 판이 인터넷에 공개됩니다.',
    '- 끊기: PC 창 위쪽 "다른 기기" 알약의 "끊기"(지금 연결만, atrium devices kick <ID>), "짝 풀기"(설정 › 연결된 기기에도, atrium devices rm <ID>).',
    '- 모두 막기: atrium remote block (트레이 메뉴와 설정 › 연결된 기기의 "원격 받기"와 같다). 켜기: atrium remote allow',
    '- 기록: atrium remote log (짝 맺기, 연결·끊김, 거부와 까닭)',
    `- 끄기: atrium remote disable --yes (= tailscale ${serveOffCommand(port, httpsPort).join(' ')})`,
  ].join('\n');
}

// 이 자리에서 읽기(백엔드가 없을 때)
export async function localStatus(cfg, { run } = {}) {
  const ts = await readTailscale({ port: cfg.port, ...(run ? { run } : {}) });
  const hosts = [...allowedHosts(cfg.port), ...tailscaleHosts(ts)];
  return { ...diagnose(ts, { port: cfg.port, hosts, devices: null, built: undefined, sameUser: true, allowed: [] }), port: cfg.port, offline: true, ts };
}

// 바꾸기 명령을 실제로 부른다(--yes일 때만, enable·disable만)
function runChange(bin, args) {
  return new Promise((res, rej) => execFile(bin, args, { timeout: 30_000, windowsHide: true }, (e, out, err) => (e ? rej(Object.assign(e, { stderr: String(err || '') })) : res(String(out || '') + String(err || '')))));
}

// enable·disable 계획. 순수 함수(시험): 실행할지, 무엇을, 왜 멈추는지
export function planChange(op, ts, { port, httpsPort, yes }) {
  if (!ts || !ts.installed) return { run: false, stop: 'not_installed' };
  if (!ts.status || !ts.status.running) return { run: false, stop: 'not_running' };
  const hp = Number(httpsPort) || (op === 'disable' && ts.serve && ts.serve.board ? ts.serve.board.port : DEFAULT_HTTPS_PORT);
  if (op === 'enable') {
    if (!ts.status.https) return { run: false, stop: 'no_https' };
    if (ts.serve && ts.serve.board && ts.serve.board.port === hp) return { run: false, stop: 'already', httpsPort: hp };
    const c = portConflict(ts, port, hp);
    if (c) return { run: false, stop: 'port_in_use', httpsPort: hp, free: freeHttpsPort(ts) };
    return { run: !!yes, args: serveCommand(port, hp), httpsPort: hp };
  }
  if (op === 'disable') {
    if (!ts.serve || !ts.serve.entries.some((e) => e.toBoard && e.port === hp)) return { run: false, stop: 'not_serving', httpsPort: hp };
    return { run: !!yes, args: serveOffCommand(port, hp), httpsPort: hp };
  }
  return { run: false, stop: 'unknown_op' };
}
const STOP = {
  not_installed: 'Tailscale이 없습니다. atrium remote guide를 봅니다',
  not_running: 'Tailscale이 돌고 있지 않거나 로그인하지 않았습니다',
  no_https: 'tailnet의 HTTPS 인증서가 꺼져 있습니다. 관리 화면 DNS에서 켭니다(atrium remote guide)',
  already: '이미 판으로 가고 있습니다',
  port_in_use: 'https 포트를 다른 서비스가 쓰고 있어 덮어쓰지 않습니다',
  not_serving: '판으로 가는 serve가 없습니다',
  unknown_op: '모르는 명령',
};

export async function remoteCommand(cfg, rest, flags, connect) {
  const op = rest[0] || 'status';
  if (op === 'guide') return console.log(guideText(cfg.port, Number(flags['https-port']) || DEFAULT_HTTPS_PORT));
  if (op === 'status') {
    let d = null;
    try { const c = await connect(); try { d = await c.call('remote.status', { fresh: true }); } finally { c.close?.(); } } catch { d = null; }
    if (!d) { d = await localStatus(cfg); console.log('(백엔드가 떠 있지 않아 이 자리에서 읽었습니다. 짝 맺은 기기 수와 Host 목록은 백엔드를 켜야 보입니다)'); }
    if (flags.json) { const { ts, ...rest2 } = d; return console.log(JSON.stringify(rest2, null, 2)); }
    return console.log(formatStatus(d));
  }
  if (op === 'log') { // P58: 연결 기록(최근 것부터)
    const c = await connect();
    try {
      const r = await c.call('remote.log', { limit: Number.parseInt(flags.limit, 10) || 50 });
      if (flags.json) return console.log(JSON.stringify(r, null, 2));
      if (!r.entries.length) return console.log('원격 연결 기록이 없습니다');
      for (const e of r.entries) console.log(formatLogEntry(e));
    } finally { c.close?.(); }
    return;
  }
  // P58: 원격 받기 끄기·켜기(판 설정 remoteAccess). Tailscale serve 설정은 건드리지 않는다. 백엔드가 떠 있어야 한다
  if (op === 'block' || op === 'allow') {
    let c;
    try { c = await connect(); } catch (e) { console.log(`백엔드가 떠 있지 않습니다. 원격 받기는 판 설정이라 백엔드가 떠 있을 때 바꿉니다(${(e && e.message) || e})`); process.exitCode = 1; return; }
    try {
      const r = await c.call('settings.set', { remoteAccess: op === 'allow' });
      if (flags.json) return console.log(JSON.stringify({ remoteAccess: r.settings.remoteAccess, closed: (r.remote && r.remote.closed) || 0 }, null, 2));
      console.log(op === 'block' ? `원격을 막았습니다. 붙어 있던 원격 연결 ${(r.remote && r.remote.closed) || 0}개를 닫았습니다. 이 PC의 창과 CLI는 그대로입니다. 켜기: atrium remote allow` : '원격 받기를 켰습니다. 짝 맺은 기기가 다시 붙을 수 있습니다');
    } finally { c.close?.(); }
    return;
  }
  if (op === 'enable' || op === 'disable') {
    const bin = tailscaleBin();
    const ts = await readTailscale({ port: cfg.port, bin });
    const p = planChange(op, ts, { port: cfg.port, httpsPort: flags['https-port'], yes: !!flags.yes });
    if (p.stop) {
      console.log(`${STOP[p.stop]}${p.stop === 'port_in_use' ? `: https ${p.httpsPort}. 다른 포트: atrium remote enable --yes --https-port ${p.free || '<포트>'}` : ''}`);
      if (p.stop !== 'already') process.exitCode = 1;
      return;
    }
    if ((ts.serve && ts.serve.funnel && ts.serve.funnel.length)) console.log(`주의: funnel이 켜진 포트가 있습니다(${ts.serve.funnel.join(', ')}). 판에는 funnel을 쓰지 않습니다`);
    if (!p.run) { console.log(`실행할 명령: tailscale ${p.args.join(' ')}\n--yes를 붙이면 실행합니다`); return; }
    console.log(`실행: tailscale ${p.args.join(' ')}`);
    const out = await runChange(bin, p.args).catch((e) => { process.exitCode = 1; return `실패: ${(e.stderr || e.message || '').trim()}`; });
    if (out.trim()) console.log(out.trim());
    return;
  }
  console.log('사용: atrium remote status|guide|block|allow|enable|disable [--yes] [--https-port <포트>]');
  process.exitCode = 1;
}
