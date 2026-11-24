// P353: 창의 첫 스크립트. 휴대폰(손가락 포인터, 짧은 변 430px 이하)의 웹 화면이면 휴대폰 전용 페이지(mobile.js·mobile.css),
// 아니면(PC 창, 노트북·태블릿 브라우저) 판 화면(renderer.js·renderer.css)을 읽는다. 주소는 하나다(정한 것 1).
// 두 묶음이 서로의 모듈을 정적으로 들이지 않게 주소를 글로 만들어 읽는다(esbuild가 묶지 않는다)
import { isPhoneDevice } from './lib/phone.js';

const web = typeof window !== 'undefined' && !window.mt;
let coarse = false;
try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch {}
const name = web && isPhoneDevice({ width: window.innerWidth, height: window.innerHeight, coarse }) ? 'mobile' : 'renderer';
const link = document.createElement('link');
link.rel = 'stylesheet'; link.href = name + '.css';
document.head.appendChild(link);
window.__mtEntry = name;
const url = new URL(name + '.js', import.meta.url).href;
import(url);
