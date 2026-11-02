// "내 차례"(ARCH 4절 A1, BRIEF 4절): 내 답이 필요한 세션을 모든 프로젝트를 가로질러 오래 기다린 순서로 보여준다.
// 칩을 누르거나 N을 누르면 노드를 옮기지 않고 화면이 그 세션으로 간다. 검토 대기와 문제도 따로 센다.
// P3: 자원(D1), herdr가 꺼졌을 때 켜기(C3), 다른 화면이 붙었다는 경고(D3), 그룹 만들기, 바뀐 것(A3)
// P4: 다른 곳의 세션(E1·E3) 칩을 뺐다. 연결 수를 보인다
// P5: 칩은 모든 워크스페이스를 가로지른다. 칩에 워크스페이스 이름을 붙이고, 누르면 그 워크스페이스로 바꾸고 노드로 간다(G4)
// P11: 위쪽 줄(.mt-top)은 없앴다. 그 일은 캔버스 위에 떠 있는 알약 묶음(Chrome.jsx TopLeft·TopRight)으로 옮겼다. 이 파일에는 내 차례 계산과 경고 띠만 남는다
import { useStore } from './store.js';
import { inboxOf } from './lib/faces.js';
import { useT } from './lib/i18n.js';

export function useInbox() {
  const sessions = useStore((st) => st.sessions);
  return inboxOf([...sessions.values()]);
}

// D3 경고와 herdr가 꺼졌다는 알림(P11: 캔버스 위 가운데에 떠 있는 띠)
export function Warnings() {
  const t = useT();
  const clients = useStore((st) => st.clients);
  const herdr = useStore((st) => st.herdr);
  const conn = useStore((st) => st.conn);
  const out = [];
  if (clients && clients.attached) {
    const parts = [...clients.viaLog.map((c) => t('warn.client', { id: c.clientId })), ...clients.viaProcess.map((p) => `pid ${p.pid}`)];
    out.push(<div key="d3" className="mt-warnbar" data-role="d3-warning">{t('warn.clients', { session: clients.session, list: parts.join(', ') })}</div>);
  }
  if (conn === 'open' && herdr.connected === false) out.push(<div key="herdr" className="mt-warnbar bad" data-role="herdr-down">{t('warn.herdrDown', { button: t('top.herdrStart') })}</div>);
  return out.length ? <div className="mt-warns">{out}</div> : null;
}
