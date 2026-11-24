// P355: TerminalView가 판 배율(xyflow 스토어의 transform)을 읽는 길. 판 화면(main.jsx)은 ReactFlowProvider의 스토어를 넣고(FlowApi.Provider),
// 휴대폰 페이지의 터미널(mterm.jsx)은 넣지 않아 배율 1에 멈춘 스토어를 쓴다. 그래서 휴대폰의 터미널 묶음은 xyflow를 읽지 않는다
import { createContext, useContext } from 'react';

const STILL_STATE = { transform: [0, 0, 1] };
export const STILL_FLOW = { getState: () => STILL_STATE, subscribe: () => () => {} };
export const FlowApi = createContext(STILL_FLOW);
export const useFlowApi = () => useContext(FlowApi);
