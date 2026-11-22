// P314 시험: 가짜 codex app-server(stdio JSON-RPC). initialize → initialized → account/rateLimits/read에 고정 값으로 답한다
let buf = '';
const send = (o) => process.stdout.write(JSON.stringify(o) + '\n');
send({ method: 'configWarning', params: { summary: 'noise' } });
process.stdin.on('data', (d) => {
  buf += d;
  for (let i; (i = buf.indexOf('\n')) >= 0;) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.id === 1) send({ id: 1, result: { userAgent: 'fake' } });
    if (o.id === 2) send({ id: 2, result: { rateLimits: { limitId: 'codex', primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: 1795328730 }, secondary: { usedPercent: 17, windowDurationMins: 10080, resetsAt: 1795854467 }, credits: { hasCredits: true, unlimited: false, balance: '120.5' }, planType: 'plus' } } });
  }
});
process.stdin.on('end', () => process.exit(0));
