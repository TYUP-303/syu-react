// src/constants/testTheme.ts
// 심리 검사 2종(ADHD / 스트레스)의 화면 색 구분 — 단일 출처.
//
// 색값 자체는 여기 없다. index.css @theme의 --color-test-{adhd,stress}-*
// 별칭이 값을 쥐고 있고, 이 파일은 그 별칭에서 생성되는 **유틸리티 클래스
// 이름**만 검사 종류별로 묶는다. 색을 재조정할 일이 생기면 index.css의
// 별칭 6개만 고치면 되고 이 파일과 컴포넌트는 손대지 않는다.
//
// 컴포넌트에서 `text-primary` / `bg-tertiary` 같은 원색 토큰을 검사 화면에
// 직접 쓰지 말 것 — 검사별 분기가 파일마다 흩어지면 다시 어긋난다.
// (strategy.ts의 STRATEGY_META, reactionType.ts의 REACTION_TYPE_META와
//  같은 패턴이다.)
//
// ⚠️ Tailwind v4는 소스에서 **완성된 클래스 문자열**을 스캔한다. 아래 값을
// `bg-test-${type}-accent` 같은 템플릿 리터럴로 조립하면 클래스가 생성되지
// 않는다. 반드시 문자열 전체를 그대로 적을 것.

export type TestType = 'adhd' | 'stress';

export interface TestThemeMeta {
  /** 강조 텍스트 · 아이콘 (예: 진행 메타, prep 히어로 아이콘) */
  accentText: string;
  /** 강조 채움 (진행 바 필, 배지 점, 선택된 선택지 칩) */
  accentBg: string;
  /** accentBg 채움 위에 얹는 글자색 */
  onAccentText: string;
  /** 강조 테두리 — 선택된 선택지 카드 */
  accentBorder: string;
  /** 강조 링 — 선택 상태를 테두리 두께 변화 없이 표시할 때 (ring-inset과 함께) */
  accentRing: string;
  /** 컨테이너 틴트 링 — 선택된 칩 둘레의 옅은 후광 */
  containerRing: string;
  /** 키보드 포커스 링 (focus: 변형까지 포함된 완성형 클래스) */
  focusRing: string;
  /** 은은한 컨테이너 틴트 (배지 배경, 진행 바 트랙) */
  containerBg: string;
  /** containerBg 위에 얹는 글자색 */
  onContainerText: string;
  /** 컨테이너 틴트를 더 옅게 — 히어로 글로우, 선택된 카드 배경처럼 넓은 면적에 쓴다 */
  containerGlow: string;
}

export const TEST_THEME: Record<TestType, TestThemeMeta> = {
  adhd: {
    accentText: 'text-test-adhd-accent',
    accentBg: 'bg-test-adhd-accent',
    onAccentText: 'text-test-adhd-on-accent',
    accentBorder: 'border-test-adhd-accent',
    accentRing: 'ring-test-adhd-accent',
    containerRing: 'ring-test-adhd-container',
    focusRing: 'focus:ring-test-adhd-accent/50',
    containerBg: 'bg-test-adhd-container',
    onContainerText: 'text-test-adhd-on-container',
    containerGlow: 'bg-test-adhd-container/60',
  },
  stress: {
    accentText: 'text-test-stress-accent',
    accentBg: 'bg-test-stress-accent',
    onAccentText: 'text-test-stress-on-accent',
    accentBorder: 'border-test-stress-accent',
    accentRing: 'ring-test-stress-accent',
    containerRing: 'ring-test-stress-container',
    focusRing: 'focus:ring-test-stress-accent/50',
    containerBg: 'bg-test-stress-container',
    onContainerText: 'text-test-stress-on-container',
    containerGlow: 'bg-test-stress-container/60',
  },
};
