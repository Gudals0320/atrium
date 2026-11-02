// 노드 오류 경계(P3, E5 2.5): 한 노드를 그리다 난 오류가 판 전체로 번지지 않게 한다.
// React는 잡지 못한 렌더링 오류가 나면 뿌리부터 전체를 내린다. 경계가 없으면 터미널 하나의 오류로 모든 노드(와 제어기)가 놓인다.
// 오류가 나면 그 노드만 안내와 "다시 그리기"를 보이고, 창 로그와 사건 기록에 남긴다.
import { Component } from 'react';
import { perfLog } from './perf.js';
import { t } from './lib/i18n.js';

export class NodeBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null, tries: 0 }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    const where = `${this.props.label || 'node'} ${this.props.id || ''}`.trim();
    perfLog('node_error', { where, message: String(error && error.message), stack: String((info && info.componentStack) || '').split('\n').slice(0, 6).join(' | ') });
    try { window.mt.log(`node error ${where}: ${error && (error.stack || error.message)}`); } catch {}
  }
  render() {
    if (!this.state.error) return <Inner key={this.state.tries}>{this.props.children}</Inner>;
    return (
      <div className={`mt-node-error nodrag ${this.props.compact ? 'compact' : ''}`} data-error-boundary={this.props.label || 'node'}>
        <div><b>{this.props.label === 'terminal' ? t('boundary.terminalError') : t('boundary.nodeError')}</b> {t('boundary.othersFine')}</div>
        <div className="mt-node-error-msg mono">{String(this.state.error && this.state.error.message).slice(0, 300)}</div>
        <button className="mt-btn small" data-action="boundary-retry" onClick={() => this.setState((s) => ({ error: null, tries: s.tries + 1 }))}>{t('boundary.redraw')}</button>
      </div>
    );
  }
}
function Inner({ children }) { return children; }

// React Flow 노드 종류를 경계로 감싼다
export function withBoundary(C, label) {
  const W = (props) => <NodeBoundary id={props.id} label={label}><C {...props} /></NodeBoundary>;
  W.displayName = `Bounded(${label})`;
  return W;
}

// 판 전체를 감싸는 마지막 경계. 판을 다시 그리면 노드와 제어기를 다시 붙인다.
export class AppBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null, n: 0 }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    perfLog('app_error', { message: String(error && error.message), stack: String((info && info.componentStack) || '').split('\n').slice(0, 8).join(' | ') });
    try { window.mt.log(`app error: ${error && (error.stack || error.message)}`); } catch {}
  }
  render() {
    if (!this.state.error) return <Inner key={this.state.n}>{this.props.children}</Inner>;
    return (
      <div className="mt-loading" data-error-boundary="app">
        <div>{t('boundary.appError')} {String(this.state.error && this.state.error.message).slice(0, 300)}</div>
        <button className="mt-btn primary" data-action="boundary-app-retry" onClick={() => this.setState((s) => ({ error: null, n: s.n + 1 }))}>{t('boundary.appRedraw')}</button>
      </div>
    );
  }
}
