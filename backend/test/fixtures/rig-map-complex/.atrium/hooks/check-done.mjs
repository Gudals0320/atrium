// 시험용 훅: 그대로 통과
process.stdin.resume(); let s = ''; process.stdin.on('data', (d) => (s += d)); process.stdin.on('end', () => process.stdout.write(JSON.stringify({ action: 'pass' })));
