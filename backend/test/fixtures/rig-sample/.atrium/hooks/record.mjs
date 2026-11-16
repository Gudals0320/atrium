// 견본 tool-after 훅: 에이전트에게 돌아가는 출력 끝에 한 줄을 덧붙인다(rig 시험 자료)
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  const input = JSON.parse(raw || '{}');
  const lines = String(input.outputTail || '').split('\n').filter(Boolean).length;
  process.stdout.write(JSON.stringify({ action: 'pass', append: `[rig sample] tool-after saw ${input.tool} exit ${input.exitCode} (${lines} tail lines)`, note: `status ${input.status}, ${input.durationMs}ms` }));
});
