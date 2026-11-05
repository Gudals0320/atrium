#!/usr/bin/env node
// P49 시험용 가짜 tailscale: 읽기 명령(status --json, serve status --json)에만 예시 값을 낸다. 판은 ATRIUM_TAILSCALE=<이 파일>로 부른다.
// 이름은 예시다(pc.example.ts.net, me@example.com). 판 포트는 P49_FAKE_TS_PORT(기본 47868).
// P57: `whois --json <주소>`도 낸다. 모양은 실제 tailscale의 apitype.WhoIsResponse(Node, UserProfile, CapMap)에서 판이 쓰는 키를 따른다.
//   100.64.0.2 laptop-a, 100.64.0.3 laptop-b(둘 다 me@example.com), 100.64.0.4 other-laptop(other@example.com), 100.64.0.9 태그 기기.
//   다른 주소는 실제처럼 실패로 끝난다. P57_FAKE_WHOIS=fail이면 모든 whois가 실패한다(Tailscale 꺼짐 흉내).
import { readFileSync } from 'node:fs';
const args = process.argv.slice(2);
const NAME = 'pc.example.ts.net';
const port = Number(process.env.P49_FAKE_TS_PORT || 47868);
const USERS = { 1: { ID: 1, LoginName: 'me@example.com', DisplayName: 'Me', ProfilePicURL: '' }, 2: { ID: 2, LoginName: 'other@example.com', DisplayName: 'Other', ProfilePicURL: '' }, 3: { ID: 3, LoginName: 'tagged-devices', DisplayName: 'Tagged Devices', ProfilePicURL: '' } };
const NODES = {
  '100.64.0.2': { ID: 102, StableID: 'nFAKE0002CNTRL', host: 'laptop-a', user: 1 },
  '100.64.0.3': { ID: 103, StableID: 'nFAKE0003CNTRL', host: 'laptop-b', user: 1 },
  '100.64.0.4': { ID: 104, StableID: 'nFAKE0004CNTRL', host: 'other-laptop', user: 2 },
  '100.64.0.9': { ID: 109, StableID: 'nFAKE0009CNTRL', host: 'server', user: 3, tags: ['tag:server'] },
};
export function fakeWhois(addr) {
  const n = NODES[addr];
  if (!n) return null;
  return {
    Node: {
      ID: n.ID, StableID: n.StableID, Name: `${n.host}.example.ts.net.`, User: n.user, Addresses: [`${addr}/32`], AllowedIPs: [`${addr}/32`],
      ...(n.tags ? { Tags: n.tags } : {}), Hostinfo: { Hostname: n.host }, MachineAuthorized: true, ComputedName: n.host, ComputedNameWithHost: n.host,
    },
    UserProfile: USERS[n.user],
    CapMap: {},
  };
}
const line = args.join(' ');
const isMain = !!process.argv[1] && /p49-fake-tailscale\.mjs$/.test(process.argv[1]);
if (!isMain) { /* 불러 쓸 때(fakeWhois)는 아무것도 내지 않는다 */ } else if (line === 'status --json') {
  console.log(JSON.stringify({
    Version: '0.0.0-fake', BackendState: 'Running',
    Self: { HostName: 'pc', DNSName: `${NAME}.`, UserID: 1, TailscaleIPs: ['100.64.0.1'] },
    MagicDNSSuffix: 'example.ts.net',
    CurrentTailnet: { Name: 'example', MagicDNSSuffix: 'example.ts.net', MagicDNSEnabled: true },
    CertDomains: [NAME], User: { 1: USERS[1] }, Health: [],
  }));
} else if (line === 'serve status --json' && process.env.P60_FAKE_SERVE_FILE && (() => { try { return readFileSync(process.env.P60_FAKE_SERVE_FILE, 'utf8').trim() === 'other'; } catch { return false; } })()) {
  // P60: 파일에 'other'가 있으면 https 443을 다른 서비스가 쓰고 판으로 가는 serve가 없다(켜기 명령과 관리자 권한 안내 흉내)
  console.log(JSON.stringify({ TCP: { 443: { HTTPS: true } }, Web: { [`${NAME}:443`]: { Handlers: { '/': { Proxy: 'http://127.0.0.1:3000' } } } } }));
} else if (line === 'serve status --json') {
  console.log(JSON.stringify({ TCP: { 443: { HTTPS: true } }, Web: { [`${NAME}:443`]: { Handlers: { '/': { Proxy: `http://127.0.0.1:${port}` } } } } }));
} else if (args.length === 3 && args[0] === 'whois' && args[1] === '--json') {
  const w = process.env.P57_FAKE_WHOIS === 'fail' ? null : fakeWhois(args[2]);
  if (!w) { console.error(`no match for IP:port ${args[2]}`); process.exit(1); }
  console.log(JSON.stringify(w, null, 2));
} else {
  console.error(`fake tailscale: only read commands (${line})`);
  process.exit(2);
}
