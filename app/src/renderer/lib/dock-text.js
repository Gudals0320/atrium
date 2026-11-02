// P17 붙여 묶기(분할 나무, 배치 틀)의 화면 글. 글은 사전(locales의 dock.*)에 있고, dt(key, vars)는 t('dock.' + key)다(P16 합칠 때 옮김).
import { t } from './i18n.js';

export const dt = (key, vars) => t(`dock.${key}`, vars);

// 배치 틀 단추(SelectionBar)의 이름·풀이 글 열쇠. id는 dock-tree.mjs PRESETS의 이름. P23: 단추는 도형이고 label·title은 풀이 글(title)에 쓴다.
// P26: 세션 수마다 틀이 다르다(dock-tree.mjs presetsFor). 글에 {n}(고른 세션 수)이 들어갈 수 있다
const stem = (id) => id.replace(/(^|-)(\w)/g, (m, d, c) => c.toUpperCase()); // main-left-3 → MainLeft3
export const presetText = (id) => ({ label: `preset${stem(id)}`, title: `preset${stem(id)}Title` });
