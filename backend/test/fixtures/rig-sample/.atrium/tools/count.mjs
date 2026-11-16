// 견본 도구: --to N까지 한 줄씩 찍는다(--every ms마다). --fail이면 끝에 종료 코드 2(rig 시험 자료)
const a = process.argv.slice(2);
const val = (k, d) => { const i = a.indexOf(k); return i >= 0 ? Number(a[i + 1]) : d; };
const to = val('--to', 1); const every = val('--every', 1000);
let i = 0;
const step = () => {
  i++;
  process.stdout.write(`tick ${i}/${to}\n`);
  if (i >= to) { if (a.includes('--fail')) { process.stderr.write('count: asked to fail\n'); process.exit(2); } return; }
  setTimeout(step, every);
};
step();
