// 창(renderer)에 넘기는 것: 백엔드 주소와 토큰, Electron 프로세스 측정값(E5), 로그 한 줄,
// OS 알림 띄우기와 알림을 눌렀을 때 갈 세션(A1, P3), 폴더 고르기(P5)
const { contextBridge, ipcRenderer } = require('electron');

// I7(P6b): 창이 없는 동안 트레이가 띄운 알림의 열쇠를 창의 "알린 대기" 기록(localStorage mt.notified)에 합친다. 창이 같은 대기에 다시 띄우지 않게
try {
  const keys = ipcRenderer.sendSync('mt:trayNotified');
  if (keys && keys.length) { const m = JSON.parse(localStorage.getItem('mt.notified') || '{}'); for (const [k, t] of keys) m[k] = t; localStorage.setItem('mt.notified', JSON.stringify(m)); }
} catch {}

contextBridge.exposeInMainWorld('mt', {
  backend: () => ipcRenderer.invoke('mt:backend'),
  metrics: () => ipcRenderer.invoke('mt:metrics'),
  log: (line) => ipcRenderer.send('mt:log', line),
  notify: (n) => ipcRenderer.invoke('mt:notify', n),
  pickFolder: () => ipcRenderer.invoke('mt:pickFolder'), // P5: 리포 열기
  onNavigate: (fn) => { const h = (_e, id) => fn(id); ipcRenderer.on('mt:navigate', h); return () => ipcRenderer.removeListener('mt:navigate', h); },
});
